import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { RESEARCH_MODEL } from "@/lib/ai-models";
import { putForecastCache } from "@/lib/forecast-cache";
import { getShiftIntel, invalidateShiftIntel } from "@/lib/shift-intel";
import { prisma } from "@/lib/prisma";
import { dateKeyOfService, serviceDateOf } from "@/lib/db-mappers";

const DAY = 24 * 60 * 60 * 1000;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const dateAt = (date: string, offset: number) => new Date(serviceDateOf(date).getTime() + offset * DAY).toISOString().slice(0, 10);
const numberAt = (value: any, path: string[]) => path.reduce((current, key) => current?.[key], value);

export async function activeRestaurantIds() {
  const since = new Date(Date.now() - 14 * DAY);
  const [reservations, settings] = await Promise.all([
    prisma.reservation.findMany({ where: { updatedAt: { gte: since } }, distinct: ["restaurantId"], select: { restaurantId: true } }),
    prisma.restaurantSettings.findMany({ where: { updatedAt: { gte: since } }, select: { restaurantId: true } }),
  ]);
  return [...new Set([...reservations.map((row) => row.restaurantId), ...settings.map((row) => row.restaurantId)])].sort();
}

function parseWeeklyResearch(text: string, dates: string[]) {
  try {
    const json = text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/)?.[0];
    const parsed = json ? JSON.parse(json) : null;
    const days = Array.isArray(parsed?.days) ? parsed.days : [];
    const byDate = new Map<string, any>(days.map((day: any) => [String(day.date), day]));
    return dates.map((date) => {
      const day = byDate.get(date) || {};
      return { date, multiplier: clamp(Number(day.multiplier) || 1, 0.7, 1.5), drivers: Array.isArray(day.drivers) ? day.drivers.filter((item: unknown) => typeof item === "string").slice(0, 4) : [] };
    });
  } catch {
    return dates.map((date) => ({ date, multiplier: 1, drivers: [] as string[] }));
  }
}

/** One web-enabled research call per restaurant batch; all cover arithmetic stays deterministic. */
export async function runWeeklyForecast(restaurantId: string, dates: string[], actualAnchor?: unknown) {
  const uniqueDates = [...new Set(dates)].filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).slice(0, 7);
  if (!uniqueDates.length) return { dates: [], research: false, usage: null };
  const [restaurant, settings, dossiers] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
    prisma.restaurantSettings.findUnique({ where: { restaurantId }, select: { prefs: true } }),
    Promise.all(uniqueDates.map((date) => getShiftIntel(restaurantId, date))),
  ]);
  const location = ((settings?.prefs || {}) as any)?.location || {};
  let research: Array<{ date: string; multiplier: number; drivers: string[] }> = uniqueDates.map((date) => ({ date, multiplier: 1, drivers: [] }));
  let usage: any = null;
  const locationText = [location.name || restaurant?.name, location.address].filter(Boolean).join(", ");
  if (process.env.OPENAI_API_KEY && locationText) {
    try {
      const run = await generateText({
        model: openai.responses(RESEARCH_MODEL),
        tools: { web_search: openai.tools.webSearch({}) },
        prompt: `Research only external demand factors for ${locationText} across ${uniqueDates.join(", ")}. Use web search for weather outlook, local events, and material seasonal conditions. This is advisory: return bounded daily multipliers, not cover counts. Actual anchor from consecutive completed shifts, when present: ${JSON.stringify(actualAnchor || null)}. Respond ONLY JSON: {"days":[{"date":"YYYY-MM-DD","multiplier":number 0.7..1.5,"drivers":["short factual source-grounded factor"]}]}. If research is unavailable, return multiplier 1 and no drivers.`,
      });
      research = parseWeeklyResearch(run.text || "", uniqueDates);
      usage = run.usage || null;
    } catch (error) {
      console.warn("[shift-forecast weekly research]", error instanceof Error ? error.message : "failed");
    }
  }
  const written: Array<{ date: string; expectedCovers: number }> = [];
  for (const dossier of dossiers as any[]) {
    const factor = research.find((item) => item.date === dossier.date) || { multiplier: 1, drivers: [] };
    const base = Number(dossier.expectedCovers?.value || 0);
    const expected = dossier.closed ? 0 : Math.round(base * factor.multiplier);
    const payload = {
      date: dossier.date, generatedAt: new Date().toISOString(), historyDays: dossier.history?.serviceDays || 0, research: factor.drivers.length > 0,
      closed: dossier.closed,
      covers: { expected, low: Math.round(expected * 0.85), high: Math.round(expected * 1.15), confidence: dossier.expectedCovers?.source === "model" ? "low" : "medium", method: "weekly shift intelligence + bounded research factors" },
      booked: { covers: dossier.reservationVsWalkIn?.bookedCovers || 0, parties: dossier.reservationVsWalkIn?.bookedParties || 0 },
      walkIns: { expected: Math.max(0, expected - Number(dossier.reservationVsWalkIn?.bookedCovers || 0)), historicalSharePct: dossier.reservationVsWalkIn?.walkInSharePct || 0 },
      hourly: dossier.hourly || [], sections: (dossier.sections || []).map((section: any) => ({ ...section, expectedCovers: Math.round(Number(section.expectedCovers || 0) * factor.multiplier) })),
      turn: { minutes: dossier.turns?.effectiveMinutes || 90, source: dossier.turns?.observedMinutes ? "observed history" : "default" },
      lastTableOut: dossier.lastTableOut?.typical || "", staffing: dossier.staffing || {},
      factors: { used: factor.drivers.map((driver) => ({ key: "weekly_research", label: "Weekly research", detail: driver, impactPct: Math.round((factor.multiplier - 1) * 100) })), excluded: factor.drivers.length ? [] : [{ key: "weekly_research", label: "Weekly research", reason: "no external research result" }] },
    };
    await putForecastCache(restaurantId, dossier.date, payload, actualAnchor ? "autocorrect" : "weekly");
    invalidateShiftIntel(restaurantId, dossier.date);
    written.push({ date: dossier.date, expectedCovers: expected });
  }
  return { dates: written, research: research.some((item) => item.drivers.length > 0), usage };
}

function expectedSectionShares(payload: any): Map<string, number> {
  const rows = Array.isArray(payload?.sections) ? payload.sections : [];
  const total = rows.reduce((sum: number, row: any) => sum + Number(row.expectedCovers || 0), 0) || 1;
  return new Map<string, number>(rows.map((row: any) => [String(row.zone), Number(row.expectedCovers || 0) / total]));
}

/** Deterministic post-close score. 0.30 is the corrective-run threshold. */
export async function scoreForecastAccuracy(restaurantId: string, date: string) {
  const existing = await prisma.forecastAccuracy.findUnique({ where: { restaurantId_date: { restaurantId, date } } });
  if (existing) return { date, skipped: "already_scored", errorScore: existing.errorScore, triggeredRerun: existing.triggeredRerun };
  const stored = await prisma.shiftForecast.findUnique({ where: { restaurantId_date: { restaurantId, date } } });
  if (!stored) return { date, skipped: "no_forecast" };
  const serviceDate = serviceDateOf(date);
  const [shifts, rows] = await Promise.all([
    prisma.shift.findMany({ where: { restaurantId, serviceDate }, select: { actualCovers: true, totalReservations: true, totalWalkIns: true, avgTurnMinutes: true, isFinalized: true } }),
    prisma.reservation.findMany({ where: { restaurantId, serviceDate, status: { in: ["SEATED", "FINISHED"] } }, select: { status: true, partySize: true, source: true, turnMinutes: true, finishedTime: true, tables: { select: { table: { select: { area: true } } } } } }),
  ]);
  if (!shifts.some((shift) => shift.isFinalized) && !rows.some((row) => row.status === "FINISHED")) return { date, skipped: "not_closed" };
  const actualCovers = shifts.reduce((sum, shift) => sum + shift.actualCovers, 0) || rows.reduce((sum, row) => sum + row.partySize, 0);
  const actualWalkIns = shifts.reduce((sum, shift) => sum + shift.totalWalkIns, 0) || rows.filter((row) => row.source === "WALK_IN").reduce((sum, row) => sum + row.partySize, 0);
  const actualReservations = shifts.reduce((sum, shift) => sum + shift.totalReservations, 0) || Math.max(0, actualCovers - actualWalkIns);
  const actualTurns = rows.map((row) => row.turnMinutes).filter((value): value is number => value != null && value > 0);
  const actualTurn = actualTurns.length ? actualTurns.reduce((sum, value) => sum + value, 0) / actualTurns.length : shifts.find((shift) => shift.avgTurnMinutes != null)?.avgTurnMinutes || null;
  const lastOuts = rows.map((row) => row.finishedTime).filter((value): value is Date => value != null).map((value) => value.getHours() * 60 + value.getMinutes());
  const zoneActual = new Map<string, number>();
  rows.forEach((row) => { const zone = row.tables[0]?.table?.area || "dining"; zoneActual.set(zone, (zoneActual.get(zone) || 0) + row.partySize); });
  const zoneTotal = [...zoneActual.values()].reduce((sum, value) => sum + value, 0) || 1;
  const payload: any = stored.payload;
  const expectedCovers = Number(numberAt(payload, ["covers", "expected"]) || 0);
  const expectedWalkIns = Number(numberAt(payload, ["walkIns", "expected"]) || 0);
  const expectedTurn = Number(numberAt(payload, ["turn", "minutes"]) || 0);
  const expectedLast = /^\d\d:\d\d$/.test(String(payload?.lastTableOut || "")) ? String(payload.lastTableOut).split(":").map(Number).reduce((h, m) => h * 60 + m, 0) : null;
  const coverError = Math.abs(actualCovers - expectedCovers) / Math.max(20, expectedCovers || actualCovers || 20);
  const splitError = Math.abs(actualWalkIns / Math.max(1, actualCovers) - expectedWalkIns / Math.max(1, expectedCovers)) ;
  const turnError = actualTurn && expectedTurn ? Math.abs(actualTurn - expectedTurn) / Math.max(30, expectedTurn) : 0;
  const lastOutError = lastOuts.length && expectedLast != null ? Math.abs((Math.max(...lastOuts)) - expectedLast) / 120 : 0;
  const expectedZones = expectedSectionShares(payload);
  let zoneError = 0;
  for (const [zone, actual] of zoneActual) zoneError += Math.abs(Number(actual) / zoneTotal - (expectedZones.get(zone) || 0));
  zoneError = Math.min(1, zoneError / 2);
  const errorScore = Number((0.45 * Math.min(1, coverError) + 0.2 * Math.min(1, splitError) + 0.15 * Math.min(1, turnError) + 0.1 * zoneError + 0.1 * Math.min(1, lastOutError)).toFixed(4));
  const actual = { covers: actualCovers, reservations: actualReservations, walkIns: actualWalkIns, averageTurnMinutes: actualTurn, lastTableOutMinutes: lastOuts.length ? Math.max(...lastOuts) : null, sections: Object.fromEntries(zoneActual) };
  try {
    await prisma.forecastAccuracy.create({ data: { restaurantId, date, predicted: payload, actual, errorScore, triggeredRerun: false } });
  } catch {
    const row = await prisma.forecastAccuracy.findUnique({ where: { restaurantId_date: { restaurantId, date } } });
    return { date, skipped: "already_scored", errorScore: row?.errorScore, triggeredRerun: row?.triggeredRerun };
  }
  if (errorScore < 0.3) return { date, errorScore, triggeredRerun: false };
  const lastSundayOffset = 7 - new Date(`${date}T12:00:00Z`).getUTCDay();
  const remaining = Array.from({ length: Math.max(0, lastSundayOffset) }, (_, index) => dateAt(date, index + 1));
  if (remaining.length) await runWeeklyForecast(restaurantId, remaining, { date, actual, errorScore });
  await prisma.forecastAccuracy.update({ where: { restaurantId_date: { restaurantId, date } }, data: { triggeredRerun: remaining.length > 0 } });
  return { date, errorScore, triggeredRerun: remaining.length > 0, reranDates: remaining };
}
