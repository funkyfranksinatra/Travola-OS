export const IMPORT_MODEL = process.env.IMPORT_MODEL || "gpt-5.6";
export const SEAT_MODEL = process.env.SEAT_MODEL || "gpt-5.6-terra";
// Research default is the terra tier: measured on the production research
// prompt (Responses API + web_search), gpt-5.6 ran ~115s per call vs
// ~62s for gpt-5.6-terra with equivalent findings and valid JSON — the
// full tier blows the serverless budget for no research gain.
export const RESEARCH_MODEL = process.env.PREDICT_RESEARCH_MODEL || process.env.PREDICT_MODEL || "gpt-5.6-terra";
// The floor co-pilot is intentionally advisory: Terra handles the
// read-only tool orchestration while Luna keeps proactive checks cheap.
export const COPILOT_MODEL = "gpt-5.6-terra";
export const COPILOT_SENTRY_MODEL = "gpt-5.6-luna";

// Pre-shift briefing: three cheap, bounded Luna workstreams followed by
// a single Terra synthesis. The models stay centralized so no route picks
// an ad-hoc tier.
export const BRIEFING_MODEL = "gpt-5.6-terra";
export const BRIEFING_WORKER_MODEL = "gpt-5.6-luna";
