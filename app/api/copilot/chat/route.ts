// @ts-nocheck
import OpenAI from "openai";
import { COPILOT_MODEL } from "@/lib/ai-models";
import { requireRestaurantId } from "@/lib/tenant";
import { getCachedForecast, getCopilotSchedule, getFloorState, getHistory, getReservations, getRoster, getServiceLog, getShiftOutlook, getWaitlist, suggestSeating } from "@/lib/copilot-data";
import { getFeatureGuide } from "@/lib/feature-guide";
import { todayKey } from "@/lib/db-mappers";

export const maxDuration = 120;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MAX_TOOL_ROUNDS = 8;
const PRICE = { input: 2.5 / 1_000_000, output: 15 / 1_000_000 };

const emptyParameters = { type: "object", properties: {}, additionalProperties: false };
// OpenAI strict schemas require every declared property in `required`.
// `null` is the explicit optional/default form: it means use viewDate.
const dateParameters = { type: "object", properties: { date: { type: ["string", "null"], description: "YYYY-MM-DD, or null to use the restaurant's viewed date." } }, required: ["date"], additionalProperties: false };
const readTool = (name: string, description: string, parameters = emptyParameters) => ({
  type: "function",
  name,
  description,
  parameters,
  strict: true,
  // The model's program runtime is the sole caller. This keeps the
  // programmatic-tool-calling contract explicit even for one-tool turns.
  allowed_callers: ["programmatic"],
});

const tools = [
  { type: "programmatic_tool_calling" },
  readTool("get_floor_state", "Read the current floor: tables, occupancy, parties, seated durations, zones, and assigned servers."),
  readTool("get_reservations", "Read the viewed date's reservation book, including target times, sizes, statuses, VIP flag, and assigned tables. Optional date defaults to viewDate.", dateParameters),
  readTool("get_waitlist", "Read the current waiting and notified walk-in queue with party sizes and waiting durations."),
  readTool("get_roster", "Read the viewed date's planned/on-shift roster and per-server covers and tables worked. Optional date defaults to viewDate.", dateParameters),
  readTool("get_service_log", "Read the viewed date's seated and finished parties and observed turn-time history. Optional date defaults to viewDate.", dateParameters),
  readTool("get_history", "Read recorded daily covers and turn aggregates for a date range. Use for past-date and last-year comparisons; it returns an explicit no-data result when history is absent. Use null for either bound to default to viewDate.", { type: "object", properties: { from: { type: ["string", "null"], description: "YYYY-MM-DD inclusive, or null" }, to: { type: ["string", "null"], description: "YYYY-MM-DD inclusive, or null" } }, required: ["from", "to"], additionalProperties: false }),
  readTool("get_shift_outlook", "Read the deterministic shift-intelligence dossier for a date: expected covers, source, booked/walk-in split, section fill order, hourly volume, turns, close norm, and staffing capacity. Use for all volume, staffing, planning, and comparison questions. It never triggers web research.", dateParameters),
  readTool("get_forecast", "Read an already-cached predictor result for a date. It never starts predictor research; if absent, say so.", dateParameters),
  readTool("get_feature_guide", "Read the versioned Travola feature guide. Use this for any how-to or how-does-it-work question; call with topic 'list' to inspect the topic index, then a matching topic. Never invent a UI path.", { type: "object", properties: { topic: { type: ["string", "null"], description: "Guide topic, alias, 'list', or null for the topic index." } }, required: ["topic"], additionalProperties: false }),
  readTool("suggest_seating", "Read-only seating recommendation using the existing seater's deterministic availability, reservation hold, capacity, merge, and load constraints. This does not seat anyone.", {
    type: "object", properties: { partySize: { type: "integer", minimum: 1, maximum: 30, description: "Party size to evaluate." } }, required: ["partySize"], additionalProperties: false,
  }),
];

// The program runtime owns the ordinary read-tools. This one narrowly
// scoped definition is used only for the server-enforced fallback below:
// it guarantees a party-fit answer has an actual deterministic seat check.
const forcedSeatTool = { ...tools.find((tool: any) => tool.name === "suggest_seating"), allowed_callers: ["direct"] };
const forcedOutlookTool = { ...tools.find((tool: any) => tool.name === "get_shift_outlook"), allowed_callers: ["direct"] };

const systemFor = (context: any) => `You are Travola's seasoned floor-manager co-pilot. You are co-pilot, not autopilot: advise only and never imply an action was taken. Answer only from read-only tool data; use the relevant tools before answering. Today is ${context.today}; the restaurant is viewing ${context.viewDate}. Schedule for that viewed date: ${context.schedule.isOpen ? "OPEN" : "CLOSED"}; regular hours ${context.schedule.hours.opening}–${context.schedule.hours.closing}; days-open Sunday-first=${JSON.stringify(context.schedule.daysOpen)}; owner baseline=${JSON.stringify(context.schedule.baseline)}. If viewDate is in the past, analyze recorded history. If it is future, plan from that date's reservations, cached forecast, same-weekday history, and the owner baseline when present; state uncertainty. If the viewed day is closed, say so plainly. For every volume, staffing, section-load, planning, or comparison question, always call get_shift_outlook first; it is the shared deterministic source of truth. If its source is model, say a full Predictor run adds research-grade external factors. For last-year/comparative questions also use get_history and get_forecast; never trigger live predictor research, and if no cached forecast exists say so and suggest running Predictor. For any question about whether or where a party can fit, always call suggest_seating as well as the relevant current-floor, reservation, or waitlist reads. For every how-to or feature-behavior question, call get_feature_guide and answer only from its guide text; if no entry exists, say so. If date data is missing, say "no data for that date" plainly. Talk like a capable FOH colleague: natural sentences, contractions, and numbers woven into the read rather than a stat dump. Use 2–4 concise sentences for a normal answer; no numbered lists, headers, or phrases such as "history indicates." Frame the shift in plain language. When the tools support a specific operational observation the user did not ask for, end with at most one practical, advisory aside; only name a rostered server when the tool data shows that person's actual load or imbalance. Friendly is not padded: be grounded, concise, honest about missing data, and never invent a table, party, server, forecast, booking, or UI path.`;

const cleanMessages = (body: unknown) => Array.isArray((body as { messages?: unknown[] })?.messages)
  ? (body as { messages: unknown[] }).messages.slice(-24).flatMap((item) => {
    const message = item as { role?: unknown; content?: unknown };
    const role = message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : null;
    const content = typeof message.content === "string" ? message.content.trim().slice(0, 3000) : "";
    return role && content ? [{ role, content }] : [];
  }) : [];

function fitIntentPartySize(text: string) {
  const asksFit = /\b(fit|seat|seating|walk[ -]?in|party)\b/i.test(text);
  if (!asksFit) return { asksFit: false, partySize: null };
  const match = text.match(/\b(?:party\s*(?:of|for)?\s*|for\s+|of\s+)?(\d{1,2})(?:\s*(?:people|persons|guests?|top))?\b/i);
  const partySize = match ? Number(match[1]) : null;
  return { asksFit: true, partySize: partySize && partySize >= 1 && partySize <= 30 ? partySize : null };
}

function usageOf(response: any) {
  const usage = response?.usage || {};
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  return { inputTokens, outputTokens, totalTokens: Number(usage.total_tokens || inputTokens + outputTokens), estimatedUsd: Number((inputTokens * PRICE.input + outputTokens * PRICE.output).toFixed(6)) };
}

function validDate(value: unknown, fallback: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : fallback;
}

function featureHelpIntent(text: string) {
  return /\b(how\s+(?:do|does|can)|where\s+(?:do|can)|what\s+does|help\s+(?:me\s+)?with)\b/i.test(text);
}

function outlookIntent(text: string) {
  return /\b(volume|covers?|busy|busiest|slam(?:med)?|staff(?:ing)?|server(?:s)?|section(?:s)?|plan(?:ning)?|forecast|expect(?:ed|ing)?|more|less|compare|comparison|walk[ -]?ins?|turn(?:s|ing)?)\b/i.test(text);
}

async function runTool(restaurantId: string, call: any, viewDate: string) {
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(call.arguments || "{}"); } catch { return { error: "invalid_tool_arguments" }; }
  switch (call.name) {
    case "get_floor_state": return getFloorState(restaurantId);
    case "get_reservations": return getReservations(restaurantId, validDate(args.date, viewDate));
    case "get_waitlist": return getWaitlist(restaurantId);
    case "get_roster": return getRoster(restaurantId, validDate(args.date, viewDate));
    case "get_service_log": return getServiceLog(restaurantId, validDate(args.date, viewDate));
    case "get_history": return getHistory(restaurantId, validDate(args.from, viewDate), validDate(args.to, viewDate));
    case "get_shift_outlook": return getShiftOutlook(restaurantId, validDate(args.date, viewDate));
    case "get_forecast": return getCachedForecast(restaurantId, validDate(args.date, viewDate));
    case "get_feature_guide": return getFeatureGuide(typeof args.topic === "string" ? args.topic : "list");
    case "suggest_seating": return suggestSeating(restaurantId, Number(args.partySize));
    default: return { error: "unknown_read_only_tool" };
  }
}

export async function POST(req: Request) {
  const auth = requireRestaurantId(req);
  if ("response" in auth) return auth.response;
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "copilot_unavailable" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const messages = cleanMessages(body);
  if (!messages.length || messages[messages.length - 1].role !== "user") return Response.json({ error: "message_required" }, { status: 400 });
  const question = messages[messages.length - 1].content;
  // Guide entries are versioned product truth. Recognized how-to prompts do
  // not need a model turn (and therefore cannot invent a stale UI path).
  if (featureHelpIntent(question)) {
    const guide = getFeatureGuide(question) as any;
    if (guide.found) return Response.json({
      answer: `${guide.title}\n\n${guide.guide}`,
      tools: ["get_feature_guide"],
      metrics: { latencyMs: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedUsd: 0, programmaticToolCalls: 0, model: COPILOT_MODEL },
    });
  }
  const contextInput = (body as any)?.context || {};
  // The client sends both dates so the interaction is explicit; the server
  // remains the authority for today's date.
  const today = todayKey();
  const viewDate = validDate(contextInput.viewDate, today);
  const schedule = await getCopilotSchedule(auth.restaurantId, viewDate);
  const context = { today, viewDate, schedule };
  const system = systemFor(context);
  const fitIntent = fitIntentPartySize(question);
  const needsOutlook = outlookIntent(question);
  if (fitIntent.asksFit && !fitIntent.partySize) {
    return Response.json({
      answer: "What party size should I check? I won't guess a seating recommendation.",
      tools: [],
      metrics: { latencyMs: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedUsd: 0, programmaticToolCalls: 0, model: COPILOT_MODEL },
    });
  }

  const startedAt = Date.now();
  const allUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedUsd: 0 };
  const calledTools: string[] = [];
  try {
    let response = await client.responses.create({
      model: COPILOT_MODEL, instructions: system, input: messages, tools, store: false,
      reasoning: { effort: "low", context: "current_turn" }, text: { verbosity: "low" },
    });
    let usage = usageOf(response);
    Object.keys(allUsage).forEach((key) => { allUsage[key] += usage[key]; });

    const calls = (response.output || []).filter((item: any) => item.type === "function_call");
    const programmaticToolCalls = calls.filter((call: any) => call.caller?.type === "program").length;
    const outputs: Array<{ tool: string; data: unknown }> = [];
    if (calls.length) {
      outputs.push(...await Promise.all(calls.slice(0, MAX_TOOL_ROUNDS).map(async (call: any) => {
        calledTools.push(call.name);
        return { tool: call.name, data: await runTool(auth.restaurantId, call, viewDate) };
      })));
    }
    // Prompt guidance is advisory; party-fit advice is not. If the
    // program omitted the deterministic seating check, require it in a
    // second, isolated read-only round before final synthesis.
    if (fitIntent.partySize && !calledTools.includes("suggest_seating")) {
      const forced = await client.responses.create({
        model: COPILOT_MODEL,
        instructions: "Call suggest_seating for exactly the requested party size. Do not answer prose.",
        input: messages[messages.length - 1].content,
        tools: [forcedSeatTool],
        tool_choice: { type: "function", name: "suggest_seating" },
        store: false,
        reasoning: { effort: "low", context: "current_turn" },
      });
      usage = usageOf(forced);
      Object.keys(allUsage).forEach((key) => { allUsage[key] += usage[key]; });
      const forcedCall = (forced.output || []).find((item: any) => item.type === "function_call" && item.name === "suggest_seating");
      if (forcedCall) {
        calledTools.push("suggest_seating");
        outputs.push({ tool: "suggest_seating", data: await runTool(auth.restaurantId, forcedCall, viewDate) });
      }
    }
    // Volume answers must use the same deterministic dossier as briefing and
    // sentry. Prompt instructions are helpful, but this server-side round is
    // the binding guarantee when the tool planner omits it.
    if (needsOutlook && !calledTools.includes("get_shift_outlook")) {
      const forced = await client.responses.create({
        model: COPILOT_MODEL,
        instructions: "Call get_shift_outlook for the viewed date. Do not answer prose.",
        input: messages[messages.length - 1].content,
        tools: [forcedOutlookTool],
        tool_choice: { type: "function", name: "get_shift_outlook" },
        store: false,
        reasoning: { effort: "low", context: "current_turn" },
      });
      usage = usageOf(forced);
      Object.keys(allUsage).forEach((key) => { allUsage[key] += usage[key]; });
      const forcedCall = (forced.output || []).find((item: any) => item.type === "function_call" && item.name === "get_shift_outlook");
      if (forcedCall) {
        calledTools.push("get_shift_outlook");
        outputs.push({ tool: "get_shift_outlook", data: await runTool(auth.restaurantId, forcedCall, viewDate) });
      }
    }
    if (outputs.length) {
      // `store:false` intentionally keeps the thread out of OpenAI response
      // storage. A fresh synthesis turn is therefore used instead of
      // previous_response_id; it receives only the completed read-only
      // results, never a tenant id or a mutation capability.
      response = await client.responses.create({
        model: COPILOT_MODEL,
        instructions: system,
        input: [...messages, { role: "user", content: `Read-only tool results for the current question:\n${JSON.stringify(outputs)}\n\nAnswer the user's last question from these results only.` }],
        store: false,
        reasoning: { effort: "low", context: "current_turn" }, text: { verbosity: "low" },
      });
      usage = usageOf(response);
      Object.keys(allUsage).forEach((key) => { allUsage[key] += usage[key]; });
    }
    allUsage.estimatedUsd = Number(allUsage.estimatedUsd.toFixed(6));
    const answer = String(response.output_text || "I don't have enough current floor data to answer that yet.").trim();
    return Response.json({ answer, tools: [...new Set(calledTools)], metrics: { latencyMs: Date.now() - startedAt, ...allUsage, programmaticToolCalls, model: COPILOT_MODEL } });
  } catch (error) {
    console.error("[api/copilot/chat]", error instanceof Error ? error.message : "request_failed");
    return Response.json({ error: "copilot_failed" }, { status: 502 });
  }
}
