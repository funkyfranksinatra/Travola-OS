import { prisma } from "@/lib/prisma";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

// ─────────────────────────────────────────────────────────────────────
// /api/predict — deterministic shift forecaster (Delta rewrite).
//
// The old route was a pure-LLM call (and absent from the repo). This
// engine is deterministic: every number in the report is computed from
// the restaurant's own history, the live reservation book, the floor,
// and the roster — with external factors layered as bounded multipliers
// ONLY when their inputs actually exist. Anything unknowable is listed
// in `factors.excluded` with the reason, per the product rule: never
// reason from data we don't have.
//
// Data intake (requirement 1):
//   · Reservation history: covers per service day (ground truth),
//     walk-in vs booked split (BookingSource), no-show/cancel rates,
//     arrival-hour histograms, materialized turnMinutes, party mix,
//     table→zone linkage for section shares.
//   · Shift / ShiftServer: per-server covers (capacity weighting,
//     staffing verdict), typical server counts per weekday.
//   · Floor: active tables, seats, zones (capacity + throughput).
//   · Roster: today's on-shift servers (future dates fall back to the
//     weekday's historical median crew size, and say so).
//
// External factors (requirement 2):
//   · Day-of-week + seasonality: inherent in the same-weekday baseline
//     and the last-year blend (reported as used).
//   · Payday cycles: 1st/15th/month-end ±1 day → small positive bump.
//   · Weather: Open-Meteo (free, keyless) when RESTAURANT_LAT/LON env
//     vars are set — temperature comfort and precipitation modify both
//     total demand and the patio's share. Unset → excluded, with the
//     exact reason shown to the manager.
//   · Manager-declared factors (events, promotions, construction,
//     competitor action): unknowable to the system, so they are opt-in
//     toggles with bounded, documented multipliers.
//   · Virality / reviews / economy / community: excluded and said so.
//
// POST { date?: 'YYYY-MM-DD', factors?: { event, promotion,
//        construction, competitor } }  →  full forecast JSON.
// ─────────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;
const dateStr = (d: Date) => d.toISOString().slice(0, 10);
const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((p, q) => p - q);
  return s[(s.length / 2) | 0];
};
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const fmtHour = (h: number) => {
  const hr = ((h + 11) % 12) + 1;
  return `${hr}${h < 12 ? "a" : "p"}`;
};

async function fetchWeather(lat: string, lon: string, date: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3500);
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode` +
      `&temperature_unit=fahrenheit&timezone=auto&start_date=${date}&end_date=${date}`;
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    const d = j?.daily;
    if (!d || !Array.isArray(d.temperature_2m_max) || d.temperature_2m_max.length === 0) return null;
    return {
      tMax: Number(d.temperature_2m_max[0]),
      tMin: Number(d.temperature_2m_min[0]),
      precipProb: Number(d.precipitation_probability_max?.[0] ?? 0),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Live local research (events / promotions / construction /
//    competitor) ─────────────────────────────────────────────────────
// These four are searchable, not unknowable — one web-search-enabled
// LLM call per (address, date), structured JSON out, impacts CLAMPED
// server-side so the model reports findings but the engine bounds how
// much they may matter. Cached 30 min; failures degrade to the manual
// toggles. Requires RESTAURANT_ADDRESS (freeform street/city) and
// optionally RESTAURANT_NAME (enables own-promotion lookup).
type ResearchAspect = { found: boolean; summary: string; impactPct: number };
type Research = { events: ResearchAspect; promotions: ResearchAspect; construction: ResearchAspect; competitor: ResearchAspect };
const researchCache = new Map<string, { at: number; data: Research | null }>();
const clampPct = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

async function researchLocalFactors(address: string, name: string | undefined, date: string): Promise<Research | null> {
  const key = `${address}|${date}`;
  const hit = researchCache.get(key);
  if (hit && Date.now() - hit.at < (hit.data ? 30 : 5) * 60 * 1000) return hit.data;
  let data: Research | null = null;
  try {
    const run = generateText({
      model: openai.responses(process.env.PREDICT_MODEL || "gpt-4o-mini"),
      tools: { web_search: openai.tools.webSearch({}) },
      prompt: `Research local demand factors for a restaurant for the evening of ${date}.
Restaurant location: ${address}.${name ? ` Restaurant name: ${name}.` : ""}

Use web search to check each of these, scoped to walking distance / the immediate blocks around that address on that date:
1. events — concerts, pro or college sports games, theater, festivals, or conventions nearby that evening.
2. construction — road closures, utility work, or parking restrictions on or near that block.
3. competitor — new restaurant openings, grand openings, or heavily promoted specials within a few blocks.
4. promotions — ${name ? `published promotions, happy hours, or limited-time offers currently advertised by ${name} itself.` : 'skip this one (restaurant name unknown): return found=false.'}

Respond with ONLY a JSON object, no prose, no code fences:
{"events":{"found":boolean,"summary":"one short sentence citing what/where, or 'nothing significant'","impactPct":int},
 "construction":{"found":...,"summary":...,"impactPct":int},
 "competitor":{"found":...,"summary":...,"impactPct":int},
 "promotions":{"found":...,"summary":...,"impactPct":int}}
impactPct is your estimated effect on tonight's covers: events 0..20, promotions 0..12, construction -15..0, competitor -10..0. Use 0 when nothing significant. Never invent specifics — only report what the searches actually surfaced.`,
    });
    const timed = await Promise.race([
      run,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("research_timeout")), 8000)),
    ]);
    const text = (timed as { text: string }).text || "";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    const norm = (o: { found?: unknown; summary?: unknown; impactPct?: unknown } | undefined, lo: number, hi: number): ResearchAspect => ({
      found: !!o?.found,
      summary: String(o?.summary || "").slice(0, 240),
      impactPct: o?.found ? clampPct(o?.impactPct, lo, hi) : 0,
    });
    data = {
      events: norm(parsed.events, 0, 20),
      promotions: norm(parsed.promotions, 0, 12),
      construction: norm(parsed.construction, -15, 0),
      competitor: norm(parsed.competitor, -10, 0),
    };
  } catch (err) {
    console.warn("[api/predict] research unavailable:", err instanceof Error ? err.message : err);
    data = null;
  }
  researchCache.set(key, { at: Date.now(), data });
  return data;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const today = new Date();
    const todayStr = dateStr(today);
    let target = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : todayStr;
    // clamp: today .. today+7
    const targetMs = new Date(`${target}T12:00:00Z`).getTime();
    const todayMs = new Date(`${todayStr}T12:00:00Z`).getTime();
    if (targetMs < todayMs) target = todayStr;
    if (targetMs > todayMs + 7 * DAY) target = dateStr(new Date(todayMs + 7 * DAY));
    const dow = new Date(`${target}T12:00:00Z`).getUTCDay();
    const manual = body?.factors || {};

    // ── History pull ─────────────────────────────────────────────────
    const recentSince = new Date(todayMs - 130 * DAY);
    const lyCenter = new Date(`${target}T12:00:00Z`);
    lyCenter.setUTCFullYear(lyCenter.getUTCFullYear() - 1);
    const lyFrom = new Date(lyCenter.getTime() - 14 * DAY);
    const lyTo = new Date(lyCenter.getTime() + 14 * DAY);

    const researchAddress = process.env.RESTAURANT_ADDRESS;
    const researchP: Promise<Research | null> = researchAddress
      ? researchLocalFactors(researchAddress, process.env.RESTAURANT_NAME, target)
      : Promise.resolve(null);

    const [recentRows, lastYearRows, bookRows, activeTables, servers, shiftServers] = await Promise.all([
      prisma.reservation.findMany({
        where: { serviceDate: { gte: recentSince }, status: { in: ["SEATED", "FINISHED", "NO_SHOW", "CANCELLED"] } },
        select: {
          serviceDate: true, dayOfWeek: true, partySize: true, status: true, source: true,
          targetTime: true, seatedTime: true, turnMinutes: true,
          tables: { select: { table: { select: { area: true } } } },
        },
      }),
      prisma.reservation.findMany({
        where: { serviceDate: { gte: lyFrom, lte: lyTo }, status: { in: ["SEATED", "FINISHED"] } },
        select: { serviceDate: true, partySize: true },
      }),
      prisma.reservation.findMany({
        where: {
          serviceDate: new Date(`${target}T00:00:00Z`),
          status: { in: ["UPCOMING", "PARTIALLY_ARRIVED", "SEATED"] },
        },
        select: { partySize: true, targetTime: true, source: true, vip: true },
      }),
      prisma.table.findMany({ where: { active: true }, select: { capacity: true, area: true } }),
      prisma.server.findMany({ select: { id: true, name: true, onShift: true, roles: true, aiExcluded: true } }),
      prisma.shiftServer.findMany({
        where: { coversServed: { gt: 0 } },
        select: { serverId: true, coversServed: true, shift: { select: { dayOfWeek: true, serviceDate: true } } },
      }),
    ]);

    const usedFactors: { key: string; label: string; detail: string; impactPct: number }[] = [];
    const excludedFactors: { key: string; label: string; reason: string }[] = [];

    // ── Daily covers series (ground truth = seated/finished covers) ──
    const byDay = new Map<string, { covers: number; walkIn: number; dow: number }>();
    const hourHistAll = new Array(24).fill(0);
    const hourHistWalk = new Array(24).fill(0);
    const turns: number[] = [];
    let showFinished = 0, showNo = 0;
    const zoneCovers = new Map<string, number>();
    for (const r of recentRows) {
      const key = dateStr(new Date(r.serviceDate));
      const seatedish = r.status === "SEATED" || r.status === "FINISHED";
      if (!byDay.has(key)) byDay.set(key, { covers: 0, walkIn: 0, dow: r.dayOfWeek });
      const rec = byDay.get(key)!;
      if (seatedish) {
        rec.covers += r.partySize;
        if (r.source === "WALK_IN") rec.walkIn += r.partySize;
        const h = new Date(r.seatedTime || r.targetTime).getHours();
        if (h >= 0 && h < 24) {
          hourHistAll[h] += r.partySize;
          if (r.source === "WALK_IN") hourHistWalk[h] += r.partySize;
        }
        if (typeof r.turnMinutes === "number" && r.turnMinutes > 15 && r.turnMinutes < 360) turns.push(r.turnMinutes);
        const zone = r.tables?.[0]?.table?.area || null;
        if (zone) zoneCovers.set(zone, (zoneCovers.get(zone) || 0) + r.partySize);
      }
      if (r.source !== "WALK_IN") {
        if (r.status === "FINISHED" || r.status === "SEATED") showFinished += 1;
        if (r.status === "NO_SHOW") showNo += 1;
      }
    }
    const days = [...byDay.entries()].map(([d, v]) => ({ date: d, ...v })).sort((a, b) => (a.date < b.date ? 1 : -1));
    const sameDow = days.filter((d) => d.dow === dow && d.date !== target);
    const historyDays = days.length;

    // ── Baseline: recency-weighted same-weekday average ──────────────
    let base = 0, confidence: "low" | "medium" | "high" = "low", method = "";
    if (sameDow.length >= 2) {
      let wSum = 0, w = 1, acc = 0;
      const usedVals: number[] = [];
      for (const d of sameDow.slice(0, 10)) { acc += d.covers * w; wSum += w; usedVals.push(d.covers); w *= 0.85; }
      base = acc / wSum;
      const sd = Math.sqrt(mean(usedVals.map((v) => (v - mean(usedVals)) ** 2)));
      confidence = sameDow.length >= 6 && sd < base * 0.35 ? "high" : sameDow.length >= 4 ? "medium" : "low";
      method = `${Math.min(10, sameDow.length)} recent ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dow]}s, recency-weighted`;
      usedFactors.push({ key: "dow", label: "Day of week", detail: method, impactPct: 0 });
    } else if (days.length >= 3) {
      base = mean(days.slice(0, 14).map((d) => d.covers));
      method = `overall recent average (${Math.min(14, days.length)} days) — not enough same-weekday history yet`;
      usedFactors.push({ key: "dow", label: "Day of week", detail: method, impactPct: 0 });
    } else {
      excludedFactors.push({ key: "history", label: "Historical covers", reason: "fewer than 3 service days recorded — forecast leans on the reservation book only" });
    }

    // Last-year seasonality blend
    const lyByDay = new Map<string, number>();
    for (const r of lastYearRows) {
      const k = dateStr(new Date(r.serviceDate));
      lyByDay.set(k, (lyByDay.get(k) || 0) + r.partySize);
    }
    if (lyByDay.size >= 3 && base > 0) {
      const lyAvg = mean([...lyByDay.values()]);
      const blended = base * 0.8 + lyAvg * 0.2;
      usedFactors.push({ key: "lastyear", label: "Same period last year", detail: `${lyByDay.size} days averaged ${Math.round(lyAvg)} covers — blended at 20%`, impactPct: Math.round(((blended - base) / base) * 100) });
      base = blended;
    } else {
      excludedFactors.push({ key: "lastyear", label: "Covers this time last year", reason: "no service history from ~1 year ago" });
    }

    // ── External multipliers ──────────────────────────────────────────
    let mult = 1;
    const dayNum = Number(target.slice(8, 10));
    const monthEnd = new Date(Date.UTC(Number(target.slice(0, 4)), Number(target.slice(5, 7)), 0)).getUTCDate();
    if ([1, 2, 15, 16].includes(dayNum) || dayNum >= monthEnd - 1) {
      mult *= 1.06;
      usedFactors.push({ key: "payday", label: "Payday cycle", detail: "date sits on a pay-cycle boundary (1st / 15th / month-end)", impactPct: 6 });
    }
    const lat = process.env.RESTAURANT_LAT, lon = process.env.RESTAURANT_LON;
    let weather: { tMax: number; tMin: number; precipProb: number } | null = null;
    let patioWeatherMult = 1;
    if (lat && lon) {
      weather = await fetchWeather(lat, lon, target);
      if (weather) {
        let wPct = 0;
        if (weather.precipProb >= 60) { wPct -= 12; patioWeatherMult = 0.3; }
        else if (weather.precipProb >= 35) { wPct -= 5; patioWeatherMult = 0.7; }
        if (weather.tMax >= 66 && weather.tMax <= 80 && weather.precipProb < 35) { wPct += 6; patioWeatherMult = 1.35; }
        if (weather.tMax >= 95 || weather.tMax <= 25) { wPct -= 8; patioWeatherMult = Math.min(patioWeatherMult, 0.5); }
        mult *= 1 + wPct / 100;
        usedFactors.push({ key: "weather", label: "Weather", detail: `high ${Math.round(weather.tMax)}°F / low ${Math.round(weather.tMin)}°F, ${Math.round(weather.precipProb)}% precip`, impactPct: wPct });
      } else {
        excludedFactors.push({ key: "weather", label: "Weather", reason: "forecast service unreachable" });
      }
    } else {
      excludedFactors.push({ key: "weather", label: "Weather", reason: "no location configured — set RESTAURANT_LAT / RESTAURANT_LON env vars" });
    }
    const research = await researchP;
    if (research) {
      const DEFS: Array<[keyof Research, string]> = [
        ["events", "Local events (web)"],
        ["promotions", "Active promotions (web)"],
        ["construction", "Construction / access (web)"],
        ["competitor", "Competitor action (web)"],
      ];
      for (const [k, label] of DEFS) {
        const r = research[k];
        if (r.found && r.impactPct !== 0) {
          mult *= 1 + r.impactPct / 100;
          usedFactors.push({ key: k, label, detail: r.summary, impactPct: r.impactPct });
        } else {
          usedFactors.push({ key: k, label, detail: `web search: ${r.summary || "nothing significant found"}`, impactPct: 0 });
        }
      }
    } else {
      // Fallback: research unavailable — manual toggles apply, and the
      // report says exactly what to configure.
      const MANUAL: Record<string, { label: string; pct: number }> = {
        event: { label: "Local event nearby", pct: 15 },
        promotion: { label: "Active promotion / happy hour", pct: 10 },
        construction: { label: "Construction / access friction", pct: -10 },
        competitor: { label: "Competitor action nearby", pct: -7 },
      };
      for (const [k, def] of Object.entries(MANUAL)) {
        if (manual[k]) { mult *= 1 + def.pct / 100; usedFactors.push({ key: k, label: def.label, detail: "declared by manager", impactPct: def.pct }); }
      }
      excludedFactors.push({
        key: "research",
        label: "Live web research (events / promos / construction / competitor)",
        reason: researchAddress
          ? "search failed or timed out — manual toggles apply this run"
          : "set RESTAURANT_ADDRESS (and optionally RESTAURANT_NAME) env vars to enable",
      });
    }
    for (const [k, label] of [["virality", "Social media virality"], ["reviews", "Review platform trajectory"], ["economy", "Discretionary spending trends"], ["community", "Community presence"]] as const) {
      excludedFactors.push({ key: k, label, reason: "not tracked by the system" });
    }

    // ── The book for the target date ─────────────────────────────────
    const bookedCovers = bookRows.reduce((s, r) => s + r.partySize, 0);
    const showRate = showFinished + showNo >= 10 ? showFinished / (showFinished + showNo) : 0.9;
    if (showFinished + showNo >= 10) {
      usedFactors.push({ key: "book", label: "Reservation book management", detail: `historical show rate ${(showRate * 100).toFixed(0)}% applied to ${bookedCovers} booked covers`, impactPct: 0 });
    }
    const walkShareHist = days.length ? mean(days.slice(0, 20).map((d) => (d.covers > 0 ? d.walkIn / d.covers : 0))) : 0.3;

    let expected = base > 0 ? base * mult : 0;
    const expectedBookShow = Math.round(bookedCovers * showRate);
    if (expected < expectedBookShow * 1.05) {
      // The book alone exceeds baseline — demand is strong; trust it.
      expected = expectedBookShow * (1 + Math.max(0.08, walkShareHist * 0.6));
    }
    expected = Math.round(expected);
    const expectedWalkIns = Math.max(0, expected - expectedBookShow);
    const band = confidence === "high" ? 0.12 : confidence === "medium" ? 0.2 : 0.32;

    // ── Turn time ─────────────────────────────────────────────────────
    let turnMin = turns.length >= 8 ? median(turns) : 90;
    const turnSource = turns.length >= 8 ? `median of ${turns.length} recent completed turns` : "default (90m) — not enough completed turns recorded";
    // Staffing adjustment computed after roster below.

    // ── Roster / staffing ─────────────────────────────────────────────
    const serverCountByDow = new Map<number, number[]>();
    const shiftKey = new Map<string, Set<string>>();
    for (const ss of shiftServers) {
      const k = `${dateStr(new Date(ss.shift.serviceDate))}`;
      if (!shiftKey.has(k)) shiftKey.set(k, new Set());
      shiftKey.get(k)!.add(ss.serverId);
    }
    for (const ss of shiftServers) {
      const d = ss.shift.dayOfWeek;
      if (!serverCountByDow.has(d)) serverCountByDow.set(d, []);
    }
    for (const [k, set] of shiftKey) {
      const row = recentRows.find((r) => dateStr(new Date(r.serviceDate)) === k);
      const dowK = row ? row.dayOfWeek : new Date(`${k}T12:00:00Z`).getUTCDay();
      if (!serverCountByDow.has(dowK)) serverCountByDow.set(dowK, []);
      serverCountByDow.get(dowK)!.push(set.size);
    }
    const perServerHist = mean(shiftServers.map((s) => s.coversServed));
    const isToday = target === todayStr;
    const rosteredNow = servers.filter((s) => s.onShift && (s.roles || []).includes("waiter")).length
      || servers.filter((s) => s.onShift).length;
    const typicalCrew = median(serverCountByDow.get(dow) || []);
    const crew = isToday && rosteredNow > 0 ? rosteredNow : typicalCrew || rosteredNow || 0;
    const crewMethod = isToday && rosteredNow > 0
      ? `${rosteredNow} on shift right now`
      : typicalCrew
        ? `typical ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dow]} crew from shift history (${typicalCrew})`
        : "current roster (no shift history for this weekday)";
    if (typicalCrew && crew < typicalCrew) {
      turnMin = Math.round(turnMin * 1.12);
      usedFactors.push({ key: "staffing", label: "Staffing levels & service speed", detail: "crew below this weekday's historical median — turns slowed ~12%", impactPct: 0 });
    }
    const coversPerServer = crew > 0 ? Math.round(expected / crew) : null;
    let staffingVerdict: "under" | "balanced" | "over" | "unknown" = "unknown";
    let staffingDelta = 0;
    if (coversPerServer != null && perServerHist > 0) {
      const ratio = coversPerServer / perServerHist;
      staffingVerdict = ratio > 1.2 ? "under" : ratio < 0.8 ? "over" : "balanced";
      staffingDelta = Math.max(0, Math.ceil(expected / perServerHist) - crew);
      usedFactors.push({ key: "capacity", label: "Per-server capacity", detail: `history: ~${Math.round(perServerHist)} covers per server per night`, impactPct: 0 });
    } else if (!(perServerHist > 0)) {
      excludedFactors.push({ key: "capacity", label: "Per-server covers history", reason: "no finalized shifts with per-server counts yet" });
    }

    // ── Hourly curve ──────────────────────────────────────────────────
    const shape = hourHistAll.some((v) => v > 0) ? hourHistAll : (() => { const s = new Array(24).fill(0); [17,18,19,20,21].forEach((h,i)=>{s[h]=[0.14,0.22,0.28,0.22,0.14][i];}); return s; })();
    const shapeSum = shape.reduce((s, v) => s + v, 0) || 1;
    const bookedByHour = new Array(24).fill(0);
    for (const r of bookRows) {
      const h = new Date(r.targetTime).getHours();
      if (h >= 0 && h < 24) bookedByHour[h] += r.partySize * showRate;
    }
    const walkShape = hourHistWalk.some((v) => v > 0) ? hourHistWalk : shape;
    const walkSum = walkShape.reduce((s, v) => s + v, 0) || 1;
    const totalSeats = activeTables.reduce((s, t) => s + (t.capacity || 0), 0);
    const perHourThroughput = totalSeats > 0 ? totalSeats * (60 / Math.max(45, turnMin)) : 0;
    const hourly: any[] = [];
    for (let h = 10; h <= 23; h++) {
      const exp = Math.round(bookedByHour[h] + expectedWalkIns * (walkShape[h] / walkSum));
      if (exp <= 0 && hourly.length === 0) continue;
      hourly.push({
        h, hour: fmtHour(h),
        booked: Math.round(bookedByHour[h]),
        expected: exp,
        waitlistRisk: perHourThroughput > 0 ? Math.min(1, exp / perHourThroughput) : 0,
      });
    }
    while (hourly.length && hourly[hourly.length - 1].expected <= 0) hourly.pop();
    let peak = { start: "", end: "", covers: 0 };
    if (hourly.length) {
      let best = hourly[0], bi = 0;
      hourly.forEach((x, i) => { if (x.expected > best.expected) { best = x; bi = i; } });
      const lo = Math.max(0, bi - 1), hi = Math.min(hourly.length - 1, bi + 1);
      peak = { start: hourly[lo].hour, end: hourly[hi].hour, covers: hourly.slice(lo, hi + 1).reduce((s, x) => s + x.expected, 0) };
    }
    const lastSeatH = hourly.length ? hourly[hourly.length - 1].h : 21;
    const outMin = lastSeatH * 60 + 30 + turnMin;
    const lastTableOut = `${String(Math.floor(outMin / 60) % 24).padStart(2, "0")}:${String(outMin % 60).padStart(2, "0")}`;
    const waitlistLikely = hourly.some((x) => x.waitlistRisk >= 0.85);

    // ── Sections ──────────────────────────────────────────────────────
    const zones = new Map<string, { tables: number; seats: number }>();
    for (const t of activeTables) {
      const z = t.area || "dining";
      if (!zones.has(z)) zones.set(z, { tables: 0, seats: 0 });
      const rec = zones.get(z)!;
      rec.tables += 1; rec.seats += t.capacity || 0;
    }
    const zoneHistTotal = [...zoneCovers.values()].reduce((s, v) => s + v, 0);
    const sections = [...zones.entries()].map(([zone, z]) => {
      let share = totalSeats > 0 ? z.seats / totalSeats : 0;
      let shareSrc = "seat share";
      if (zoneHistTotal >= 60 && zoneCovers.has(zone)) {
        share = (zoneCovers.get(zone) || 0) / zoneHistTotal;
        shareSrc = "historical seating share";
      }
      let m = 1, note: string | null = null;
      if (zone === "patio" && patioWeatherMult !== 1) {
        m = patioWeatherMult;
        note = patioWeatherMult > 1 ? "weather boost — expect patio pressure" : "weather-suppressed — plan to shift parties inside";
      }
      return { zone, tables: z.tables, seats: z.seats, expectedCovers: Math.round(expected * share * m), shareSrc, note };
    }).sort((a, b) => b.expectedCovers - a.expectedCovers);

    return Response.json({
      date: target, dow, isToday, generatedAt: new Date().toISOString(),
      historyDays, research: !!research,
      covers: { expected, low: Math.round(expected * (1 - band)), high: Math.round(expected * (1 + band)), confidence, method: method || "reservation book + walk-in floor (no history)" },
      booked: { covers: bookedCovers, parties: bookRows.length, showRate: Math.round(showRate * 100) },
      walkIns: { expected: expectedWalkIns, historicalSharePct: Math.round(walkShareHist * 100) },
      hourly, peak, waitlistLikely,
      turn: { minutes: turnMin, source: turnSource },
      lastTableOut,
      capacity: { seats: totalSeats, tables: activeTables.length },
      sections,
      staffing: { crew, crewMethod, coversPerServer, historicalCoversPerServer: perServerHist > 0 ? Math.round(perServerHist) : null, verdict: staffingVerdict, addServers: staffingDelta },
      factors: { used: usedFactors, excluded: excludedFactors },
    });
  } catch (err) {
    console.error("[api/predict]", err);
    return Response.json({ error: "predict_failed" }, { status: 500 });
  }
}