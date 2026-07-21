// @ts-nocheck
import OpenAI from "openai";
import { BRIEFING_MODEL, BRIEFING_WORKER_MODEL } from "@/lib/ai-models";
import { requireRestaurantId } from "@/lib/tenant";
import { getBriefingSnapshot } from "@/lib/briefing-data";
import { clearBriefingCache, getBriefingCache, putBriefingCache } from "@/lib/briefing-cache";
import { restaurantShiftDate } from "@/lib/shift-intel";

export const maxDuration = 180;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PRICE = { luna: { input: 1 / 1_000_000, output: 6 / 1_000_000 }, terra: { input: 2.5 / 1_000_000, output: 15 / 1_000_000 } };
const BETA = ["responses_multi_agent=v1"] as const;

const BRIEFING_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", maxLength: 180 },
    forecast: { type: "object", properties: { covers: { type: ["integer", "null"] }, confidence: { type: "string" }, drivers: { type: "array", items: { type: "string" }, maxItems: 6 } }, required: ["covers", "confidence", "drivers"], additionalProperties: false },
    staffing: { type: "object", properties: { recommendation: { type: "string" }, notes: { type: "array", items: { type: "string" }, maxItems: 6 } }, required: ["recommendation", "notes"], additionalProperties: false },
    watchouts: { type: "array", items: { type: "string" }, maxItems: 8 },
    vips: { type: "array", items: { type: "string" }, maxItems: 8 },
    largeParties: { type: "array", items: { type: "string" }, maxItems: 8 },
    prepNotes: { type: "array", items: { type: "string" }, maxItems: 8 },
  },
  required: ["headline", "forecast", "staffing", "watchouts", "vips", "largeParties", "prepNotes"],
  additionalProperties: false,
};

const cleanText = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : fallback;
const cleanList = (value: unknown) => Array.isArray(value) ? value.filter((item) => typeof item === "string").map((item) => item.trim().slice(0, 220)).filter(Boolean).slice(0, 8) : [];
const betaOutputText = (response: any) => (response?.output || [])
  .filter((item: any) => item.type === "message")
  .flatMap((item: any) => item.content || [])
  .filter((item: any) => item.type === "output_text")
  .map((item: any) => item.text || "")
  .join("")
  .trim();

function fallbackBriefing(snapshot: any) {
  const forecast = snapshot.forecast as any;
  const intel = snapshot.shiftIntel as any;
  const covers = Number.isFinite(forecast?.covers?.expected) ? forecast.covers.expected : Number.isFinite(intel?.expectedCovers?.value) ? intel.expectedCovers.value : null;
  const confidence = forecast?.covers?.confidence || (intel?.expectedCovers?.source === "model" ? "deterministic model — run Predictor for research factors" : "not enough forecast data");
  return {
    headline: covers != null ? `Plan for about ${covers} covers.` : "Not enough predictor history yet — run a forecast before the huddle.",
    forecast: { covers, confidence, drivers: covers != null ? [intel?.expectedCovers?.source === "model" ? "shift intelligence model" : "stored predictor forecast"] : ["forecast unavailable"] },
    staffing: { recommendation: snapshot.roster.filter((server: any) => server.onShift).length ? "Review the on-shift roster against the book." : "No active roster is recorded for this date.", notes: [] },
    watchouts: snapshot.signals.pacingClusters.length ? snapshot.signals.pacingClusters.map((cluster: any) => `${cluster.time}: ${cluster.covers} covers across ${cluster.parties} parties.`) : ["No pacing cluster is visible yet."],
    vips: snapshot.signals.vipsAndRegulars.map((party: any) => `${party.name} · ${party.size}`),
    largeParties: snapshot.signals.largeParties.map((party: any) => `${party.name} · ${party.size} at ${party.time}`),
    prepNotes: ["Briefing generation was unavailable; review the forecast, book, and roster directly."],
  };
}

function normalizeBriefing(raw: string, snapshot: any) {
  try {
    const value = JSON.parse(raw);
    return {
      headline: cleanText(value.headline, fallbackBriefing(snapshot).headline),
      forecast: {
        covers: Number.isInteger(value?.forecast?.covers) ? value.forecast.covers : fallbackBriefing(snapshot).forecast.covers,
        confidence: cleanText(value?.forecast?.confidence, "not enough data"),
        drivers: cleanList(value?.forecast?.drivers),
      },
      staffing: { recommendation: cleanText(value?.staffing?.recommendation, "Review the roster against the book."), notes: cleanList(value?.staffing?.notes) },
      watchouts: cleanList(value?.watchouts),
      vips: cleanList(value?.vips),
      largeParties: cleanList(value?.largeParties),
      prepNotes: cleanList(value?.prepNotes),
    };
  } catch { return fallbackBriefing(snapshot); }
}

function usage(response: any, tier: "luna" | "terra") {
  const inputTokens = Number(response?.usage?.input_tokens || 0);
  const outputTokens = Number(response?.usage?.output_tokens || 0);
  return { inputTokens, outputTokens, totalTokens: Number(response?.usage?.total_tokens || inputTokens + outputTokens), estimatedUsd: inputTokens * PRICE[tier].input + outputTokens * PRICE[tier].output };
}

async function runWorker(name: string, instruction: string, snapshot: unknown) {
  const response = await client.beta.responses.create({
    model: BRIEFING_WORKER_MODEL,
    betas: BETA,
    multi_agent: { enabled: true, max_concurrent_subagents: 1 },
    store: false,
    reasoning: { effort: "low", context: "current_turn" },
    text: { verbosity: "low" },
    instructions: `You are the ${name} workstream for a restaurant pre-shift briefing. ${instruction} Use only the supplied snapshot. Be concise, numeric, and explicit about insufficient data. Do not invent facts or recommendations not supported by the snapshot.`,
    input: JSON.stringify(snapshot),
  });
  return { name, text: betaOutputText(response), usage: usage(response, "luna") };
}

export async function POST(req: Request) {
  const auth = requireRestaurantId(req);
  if ("response" in auth) return auth.response;
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "briefing_unavailable" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const date = await restaurantShiftDate(auth.restaurantId, typeof body.date === "string" ? body.date : undefined);
  const regenerate = body.regenerate === true;
  const startedAt = Date.now();
  if (regenerate) await clearBriefingCache(auth.restaurantId, date);
  const cached = await getBriefingCache(auth.restaurantId, date);
  if (cached) return Response.json({
    ...(cached as object),
    cached: true,
    metrics: { latencyMs: Date.now() - startedAt, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedUsd: 0, model: BRIEFING_MODEL },
  });
  try {
    const snapshot = await getBriefingSnapshot(auth.restaurantId, date, body.forecast);
    const workerSpecs = [
      ["demand", "Assess forecast confidence, weather/events drivers already present in the forecast, and service-volume watchouts."],
      ["book", "Assess reservations only: regulars/VIPs, large parties, timing clusters, and booking-specific pacing risks."],
      ["staffing", "Assess roster and section capacity versus expected load. Use shiftIntel.staffing.perServer for any server-level load statement; its assignmentBasis tells you whether the load is section-derived or only an unassigned even-split fallback. Recommend only from the supplied snapshot."],
    ] as const;
    const settled = await Promise.allSettled(workerSpecs.map(([name, instruction]) => runWorker(name, instruction, snapshot)));
    const reports = settled.map((result, index) => result.status === "fulfilled"
      ? { name: result.value.name, report: result.value.text, ok: true, usage: result.value.usage }
      : { name: workerSpecs[index][0], report: "workstream unavailable", ok: false, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedUsd: 0 } });

    let briefing = fallbackBriefing(snapshot);
    let synthesisUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedUsd: 0 };
    try {
      const synthesis = await client.beta.responses.create({
        model: BRIEFING_MODEL,
        betas: BETA,
        multi_agent: { enabled: true, max_concurrent_subagents: 3 },
        store: false,
        reasoning: { effort: "low", context: "current_turn" },
        text: { format: { type: "json_schema", name: "tonights_game_plan", strict: true, schema: BRIEFING_SCHEMA } },
        instructions: "You are Travola's pre-shift briefing editor. Synthesize a concrete, read-aloud game plan from the restaurant snapshot and the completed parallel Luna workstreams. Do not invent weather, events, guests, history, or staffing facts. For server-level staffing observations, use only shiftIntel.staffing.perServer and preserve its assignmentBasis. Failed workstreams must simply degrade their sections; never return a blank briefing. Say 'not enough history yet' where appropriate. Keep each list item concise.",
        input: JSON.stringify({ snapshot, reports: reports.map(({ name, report, ok }) => ({ name, report, ok })) }),
      });
      synthesisUsage = usage(synthesis, "terra");
      briefing = normalizeBriefing(betaOutputText(synthesis), snapshot);
    } catch (error) {
      console.error("[api/briefing synthesis]", error instanceof Error ? error.message : "failed");
    }
    const workerUsage = reports.reduce((sum, report) => ({ inputTokens: sum.inputTokens + report.usage.inputTokens, outputTokens: sum.outputTokens + report.usage.outputTokens, totalTokens: sum.totalTokens + report.usage.totalTokens, estimatedUsd: sum.estimatedUsd + report.usage.estimatedUsd }), { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedUsd: 0 });
    const payload = {
      briefing,
      date,
      cached: false,
      workstreams: reports.map(({ name, ok }) => ({ name, ok })),
      metrics: { latencyMs: Date.now() - startedAt, inputTokens: workerUsage.inputTokens + synthesisUsage.inputTokens, outputTokens: workerUsage.outputTokens + synthesisUsage.outputTokens, totalTokens: workerUsage.totalTokens + synthesisUsage.totalTokens, estimatedUsd: Number((workerUsage.estimatedUsd + synthesisUsage.estimatedUsd).toFixed(6)), model: BRIEFING_MODEL },
    };
    await putBriefingCache(auth.restaurantId, date, payload);
    return Response.json(payload);
  } catch (error) {
    console.error("[api/briefing]", error instanceof Error ? error.message : "request_failed");
    return Response.json({ error: "briefing_failed" }, { status: 502 });
  }
}
