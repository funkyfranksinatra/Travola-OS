// @ts-nocheck
import OpenAI from "openai";
import { COPILOT_SENTRY_MODEL } from "@/lib/ai-models";
import { requireRestaurantId } from "@/lib/tenant";
import { getSentrySnapshot } from "@/lib/copilot-data";

export const maxDuration = 60;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PRICE = { input: 1 / 1_000_000, output: 6 / 1_000_000 };
const SENTRY_SCHEMA = {
  type: "object",
  properties: {
    alert: {
      anyOf: [
        { type: "null" },
        { type: "object", properties: { text: { type: "string", maxLength: 120 }, severity: { type: "string", enum: ["info", "watch", "urgent"] } }, required: ["text", "severity"], additionalProperties: false },
      ],
    },
  },
  required: ["alert"],
  additionalProperties: false,
};

function parseAlert(raw: string) {
  try {
    const value = JSON.parse(raw) as { alert?: { text?: unknown; severity?: unknown } | null };
    if (!value?.alert || typeof value.alert.text !== "string") return null;
    const text = value.alert.text.trim().slice(0, 120);
    if (!text) return null;
    return { text, severity: ["info", "watch", "urgent"].includes(String(value.alert.severity)) ? String(value.alert.severity) : "info" };
  } catch { return null; }
}

export async function POST(req: Request) {
  const auth = requireRestaurantId(req);
  if ("response" in auth) return auth.response;
  if (!process.env.OPENAI_API_KEY) return Response.json({ alert: null, skipped: "unavailable" }, { status: 503 });
  const snapshot = await getSentrySnapshot(auth.restaurantId);
  if (!snapshot.seated.length) return Response.json({ alert: null, skipped: "no_seated_parties" });
  const startedAt = Date.now();
  try {
    const response = await client.responses.create({
      model: COPILOT_SENTRY_MODEL,
      store: false,
      text: { format: { type: "json_schema", name: "floor_sentry", strict: true, schema: SENTRY_SCHEMA } },
      input: `You are a quiet restaurant floor sentry. Return alert:null unless this snapshot shows one actionable near-term risk: a table likely turning soon, a section about to get slammed, or a large party with no plausible table plan. Never make up facts. Keep alert text under 120 characters.\n\nSNAPSHOT\n${JSON.stringify(snapshot)}`,
    });
    const inputTokens = Number(response.usage?.input_tokens || 0);
    const outputTokens = Number(response.usage?.output_tokens || 0);
    return Response.json({
      alert: parseAlert(response.output_text),
      metrics: { latencyMs: Date.now() - startedAt, inputTokens, outputTokens, totalTokens: Number(response.usage?.total_tokens || inputTokens + outputTokens), estimatedUsd: Number((inputTokens * PRICE.input + outputTokens * PRICE.output).toFixed(6)), model: COPILOT_SENTRY_MODEL },
    });
  } catch (error) {
    console.error("[api/copilot/sentry]", error instanceof Error ? error.message : "request_failed");
    return Response.json({ alert: null, skipped: "failed" });
  }
}
