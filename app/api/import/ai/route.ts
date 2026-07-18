// app/api/import/ai/route.ts — AI column-mapping for the history importer.
//
// The old CSV path demanded per-row human repair (name/date/size) which
// is unusable on a 13k-row OpenTable export. This route replaces that
// with ONE cheap LLM call: it receives the header plus a small sample of
// rows and returns a COLUMN MAPPING (which source column holds each
// canonical field, date order, duration units, status vocabulary). The
// client then applies that mapping to every row deterministically —
// 13,000 rows cost the same tokens as 30.
//
// Canonical field order (superset of OpenTable/Resy exports):
//   Date, Visit Date, Created Time, Last Updated, Seated Time,
//   Finished Time, Total Duration, First Name, Last Name, Phonetic
//   Name, Phone Number, Email, Marketing Opt-In, Party Size, Source,
//   Shift, Table Number, POS Revenue, POS Gratuity, Total Gratuity,
//   Notes, Tags.
//
// Fields the source doesn't have map to null and downstream fills a
// sane default (turn time ← settings default, party size ← matched
// table's capacity) or leaves the column blank. This history only feeds
// the predictor's training data — approximately-right beats demanding
// perfection from a human 13,000 times.
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { IMPORT_MODEL } from "@/lib/ai-models";
import { requireRestaurantId } from "@/lib/tenant";
import { z } from "zod";

export const maxDuration = 60;

const colIdx = z.number().int().min(0).nullable();

const mappingSchema = z.object({
  hasHeader: z.boolean().describe("true when the FIRST sample row is a header row of column titles, not data."),
  columns: z.object({
    date: colIdx.describe("Reservation/service date column (date-only or datetime)."),
    visitDate: colIdx.describe("Visit Date column when distinct from `date` — often a full datetime of the booked slot."),
    time: colIdx.describe("Booked/expected time-of-day column, when separate from the date column."),
    createdTime: colIdx.describe("When the booking was created."),
    lastUpdated: colIdx.describe("Last-updated timestamp."),
    seatedTime: colIdx.describe("Actual seated time."),
    finishedTime: colIdx.describe("Finished/departed time."),
    totalDuration: colIdx.describe("Total visit duration / turn time."),
    firstName: colIdx.describe("Guest first name."),
    lastName: colIdx.describe("Guest last name."),
    fullName: colIdx.describe("Single combined guest/party name column (use when first/last are not separate)."),
    phoneticName: colIdx.describe("Phonetic name column."),
    phone: colIdx.describe("Phone number."),
    email: colIdx.describe("Email address."),
    marketingOptIn: colIdx.describe("Marketing opt-in flag."),
    partySize: colIdx.describe("Party size / covers / guests count."),
    source: colIdx.describe("Booking source/channel column (e.g. 'OpenTable', 'Walk-in', 'Phone')."),
    shift: colIdx.describe("Shift/meal-period column (Dinner, Lunch, Brunch…)."),
    tableNumber: colIdx.describe("Table number/label the party sat at."),
    posRevenue: colIdx.describe("POS revenue / check total."),
    posGratuity: colIdx.describe("POS gratuity."),
    totalGratuity: colIdx.describe("Total gratuity."),
    notes: colIdx.describe("Free-text notes / special requests."),
    tags: colIdx.describe("Guest or visit tags."),
    status: colIdx.describe("Reservation status/outcome column (Finished, No Show, Cancelled…)."),
  }),
  dateOrder: z.enum(["MDY", "DMY", "YMD"]).describe("Component order of numeric dates in this file, judged from the samples (e.g. 03/14/2025 → MDY)."),
  durationUnit: z.enum(["minutes", "seconds", "hours", "hhmm", "unknown"]).describe("Unit/format of the totalDuration column: plain minutes, seconds, decimal hours, or h:mm clock format."),
  statusMap: z.array(z.object({
    value: z.string().describe("A distinct raw value observed in the status column."),
    meaning: z.enum(["finished", "no_show", "cancelled", "seated_only", "unknown"]),
  })).describe("Every distinct status value seen in the samples, mapped to its meaning. Empty when no status column."),
  walkInSourceValues: z.array(z.string()).describe("Raw `source` column values that indicate a walk-in (no advance booking). Empty if none."),
  confidence: z.enum(["high", "medium", "low"]).describe("Overall confidence in this mapping."),
  warnings: z.array(z.string()).describe("Anything the applier or the restaurant owner should know (ambiguous columns, mixed formats…)."),
});

export async function POST(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response;
    const body = await req.json();
    const sample: string[][] = Array.isArray(body.sample) ? body.sample : [];
    const source: string = typeof body.source === "string" ? body.source : "other";
    if (sample.length === 0) return Response.json({ error: "no_sample" }, { status: 400 });

    // Cap what we send: 40 rows × 40 cols is plenty to identify columns.
    const trimmed = sample.slice(0, 40).map((r) => (Array.isArray(r) ? r.slice(0, 40).map((c) => String(c ?? "").slice(0, 120)) : []));

    const rendered = trimmed
      .map((r, i) => `${i === 0 ? "R0" : `R${i}`}: ${JSON.stringify(r)}`)
      .join("\n");

    const result = await generateObject({
      model: openai(IMPORT_MODEL),
      schema: mappingSchema,
      prompt: `You are mapping the columns of a restaurant reservation-history export (declared source: ${source}) so a deterministic parser can import EVERY row.

Below are the first rows of the file, each as a JSON array of cells. Column indices are 0-based positions in these arrays.

${rendered}

Identify which column index holds each canonical field. Rules:
1. A field that has no matching column is null — never guess a wrong column. It is normal for many fields to be null.
2. If one column contains a full datetime (e.g. "2025-03-14 7:15 PM"), map it wherever it best fits (visitDate or date) — the parser splits date and time parts itself.
3. If guest names live in one combined column, use fullName and leave firstName/lastName null.
4. statusMap must cover every distinct raw value visible in the status column samples.
5. Judge dateOrder carefully from unambiguous samples (a component > 12 disambiguates).
6. List real concerns in warnings — mixed date formats, a column you were unsure about, etc.`,
    });

    return Response.json({ ok: true, mapping: result.object });
  } catch (err) {
    console.error("[api/import/ai]", err);
    return Response.json({ error: "mapping_failed" }, { status: 500 });
  }
}
