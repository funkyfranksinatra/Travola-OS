export const IMPORT_MODEL = process.env.IMPORT_MODEL || "gpt-5.6";
export const SEAT_MODEL = process.env.SEAT_MODEL || "gpt-5.6-terra";
// Research default is the terra tier: measured on the production research
// prompt (Responses API + web_search), gpt-5.6 ran ~115s per call vs
// ~62s for gpt-5.6-terra with equivalent findings and valid JSON — the
// full tier blows the serverless budget for no research gain.
export const RESEARCH_MODEL = process.env.PREDICT_RESEARCH_MODEL || process.env.PREDICT_MODEL || "gpt-5.6-terra";
