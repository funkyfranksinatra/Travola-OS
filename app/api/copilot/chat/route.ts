// @ts-nocheck
import OpenAI from "openai";
import { COPILOT_MODEL } from "@/lib/ai-models";
import { requireRestaurantId } from "@/lib/tenant";
import { getCachedForecast, getFloorState, getReservations, getRoster, getServiceLog, getWaitlist, suggestSeating } from "@/lib/copilot-data";

export const maxDuration = 120;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MAX_TOOL_ROUNDS = 8;
const PRICE = { input: 2.5 / 1_000_000, output: 15 / 1_000_000 };

const emptyParameters = { type: "object", properties: {}, additionalProperties: false };
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
  readTool("get_reservations", "Read today's active reservation book, including target times, sizes, statuses, VIP flag, and assigned tables."),
  readTool("get_waitlist", "Read the current waiting and notified walk-in queue with party sizes and waiting durations."),
  readTool("get_roster", "Read today's on-shift roster and per-server service-day covers and tables worked."),
  readTool("get_service_log", "Read today's seated and finished parties and observed turn-time history."),
  readTool("get_forecast", "Read today's already-cached predictor result. It never starts predictor research; if absent, say so."),
  readTool("suggest_seating", "Read-only seating recommendation using the existing seater's deterministic availability, reservation hold, capacity, merge, and load constraints. This does not seat anyone.", {
    type: "object", properties: { partySize: { type: "integer", minimum: 1, maximum: 30, description: "Party size to evaluate." } }, required: ["partySize"], additionalProperties: false,
  }),
];

const system = `You are Travola's concise floor-manager co-pilot. You are co-pilot, not autopilot: advise only and never imply an action was taken. Use numbers before prose. Answer only from read-only tool data; use the relevant tools before answering. For any question about whether or where a party can fit, always call suggest_seating as well as the relevant current-floor, reservation, or waitlist reads. If the data is missing, stale, or insufficient, say that plainly. Keep answers practical and short. Never invent a table, party, server, forecast, or booking.`;

const cleanMessages = (body: unknown) => Array.isArray((body as { messages?: unknown[] })?.messages)
  ? (body as { messages: unknown[] }).messages.slice(-24).flatMap((item) => {
    const message = item as { role?: unknown; content?: unknown };
    const role = message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : null;
    const content = typeof message.content === "string" ? message.content.trim().slice(0, 3000) : "";
    return role && content ? [{ role, content }] : [];
  }) : [];

function usageOf(response: any) {
  const usage = response?.usage || {};
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  return { inputTokens, outputTokens, totalTokens: Number(usage.total_tokens || inputTokens + outputTokens), estimatedUsd: Number((inputTokens * PRICE.input + outputTokens * PRICE.output).toFixed(6)) };
}

async function runTool(restaurantId: string, call: any) {
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(call.arguments || "{}"); } catch { return { error: "invalid_tool_arguments" }; }
  switch (call.name) {
    case "get_floor_state": return getFloorState(restaurantId);
    case "get_reservations": return getReservations(restaurantId);
    case "get_waitlist": return getWaitlist(restaurantId);
    case "get_roster": return getRoster(restaurantId);
    case "get_service_log": return getServiceLog(restaurantId);
    case "get_forecast": return getCachedForecast(restaurantId);
    case "suggest_seating": return suggestSeating(restaurantId, Number(args.partySize));
    default: return { error: "unknown_read_only_tool" };
  }
}

export async function POST(req: Request) {
  const auth = requireRestaurantId(req);
  if ("response" in auth) return auth.response;
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "copilot_unavailable" }, { status: 503 });
  const messages = cleanMessages(await req.json().catch(() => ({})));
  if (!messages.length || messages[messages.length - 1].role !== "user") return Response.json({ error: "message_required" }, { status: 400 });

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
    if (calls.length) {
      const outputs = await Promise.all(calls.slice(0, MAX_TOOL_ROUNDS).map(async (call: any) => {
        calledTools.push(call.name);
        return { tool: call.name, data: await runTool(auth.restaurantId, call) };
      }));
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
