// app/api/import/extract/route.ts — vision extraction for the importer.
//
// Receives rasterised PDF pages / photos (base64 data URLs) and returns
// structured reservation/walk-in rows. Handles digital report pages,
// scans, and HANDWRITING — which is why this is a vision-LLM pipeline
// rather than OCR. Nothing extracted here touches the database: rows go
// to the client's review table, get human-verified, and only then hit
// /api/import/commit. The extractor is allowed to be imperfect; the
// review gate is what makes the feature safe.
//
// Model: defaults to full gpt-4o, NOT 4o-mini — handwriting and dense
// report tables are exactly where mini-class models fall down, and
// imports are low-frequency (transition-time, not per-seating), so the
// cost delta is negligible. Override with IMPORT_MODEL if desired.
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

export const maxDuration = 60;

const MAX_PAGES_PER_REQUEST = 4;

const rowSchema = z.object({
  name: z.string().describe("Guest or party name exactly as written. Empty string if illegible."),
  partySize: z.number().nullable().describe("Number of guests/covers. null if not visible."),
  date: z.string().nullable().describe("Row-specific date as YYYY-MM-DD ONLY if written on the row itself; otherwise null (a page-level date goes in pageDate)."),
  time: z.string().nullable().describe("Booked/expected time as written, e.g. '7:30 PM'. null for walk-ins with no booked time."),
  seatedTime: z.string().nullable().describe("Actual seated time if recorded, e.g. '7:41 PM'."),
  finishedTime: z.string().nullable().describe("Departure/completed time if recorded."),
  turnMinutes: z.number().nullable().describe("Explicit turn/duration in minutes ONLY if the document states it. Do not compute."),
  tableLabel: z.string().nullable().describe("Table reference as written, e.g. 'T12', 'Table 4', '12'."),
  kind: z.enum(["reservation", "walkin", "unknown"]).describe("walkin when the row clearly has no advance booking; otherwise reservation; unknown if unclear."),
  status: z.enum(["finished", "no_show", "cancelled", "seated_only", "unknown"]).describe("finished = dined and left; seated_only = seated time recorded but no completion; use unknown rather than guessing."),
  unclear: z.boolean().describe("true when ANY field on this row required guessing (bad handwriting, smudge, ambiguity). Err toward true."),
});

const pageSchema = z.object({
  pageDate: z.string().nullable().describe("The page-level service date (YYYY-MM-DD) if a date heading appears anywhere on the page; else null."),
  rows: z.array(rowSchema).describe("Every distinct party entry on the page. Skip headers, totals, and blank lines."),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const pages: Array<{ image: string }> = Array.isArray(body.pages) ? body.pages : [];
    const source: string = typeof body.source === "string" ? body.source : "paper";
    if (pages.length === 0) {
      return Response.json({ error: "no_pages" }, { status: 400 });
    }
    if (pages.length > MAX_PAGES_PER_REQUEST) {
      return Response.json({ error: "too_many_pages", max: MAX_PAGES_PER_REQUEST }, { status: 400 });
    }

    const model = openai(process.env.IMPORT_MODEL || "gpt-4o");
    const out: Array<z.infer<typeof rowSchema> & { page: number }> = [];
    let pageDate: string | null = null;
    const pageErrors: Array<{ page: number; error: string }> = [];

    // Sequential per-page calls: one page per prompt keeps the model
    // focused (multi-page prompts measurably raise row-merging mistakes)
    // and lets a single bad page fail without sinking the batch.
    for (let i = 0; i < pages.length; i++) {
      try {
        const result = await generateObject({
          model,
          schema: pageSchema,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `You are transcribing one page of a restaurant's ${source === "paper" ? "handwritten reservation book" : `${source} reservation report`} into structured rows.

RULES — accuracy over completeness:
1. Transcribe ONLY what is visible. Never invent names, times, sizes, or dates.
2. If a field is absent, return null. If a field is present but hard to read, give your best reading AND set unclear: true for the row.
3. Crossed-out entries: status "cancelled". "NS"/"no show" marks: status "no_show". A seated time with a departure time: "finished".
4. Times exactly as written ("7:30", "7:30p", "19:30" are all fine).
5. Do not compute turn durations — only report one if the page states it.`,
                },
                { type: "image", image: pages[i].image },
              ],
            },
          ],
        });
        if (!pageDate && result.object.pageDate) pageDate = result.object.pageDate;
        for (const r of result.object.rows) out.push({ ...r, page: i });
      } catch (err) {
        console.error(`[api/import/extract] page ${i} failed:`, err);
        pageErrors.push({ page: i, error: "extraction_failed" });
      }
    }

    return Response.json({ rows: out, pageDate, pageErrors });
  } catch (error) {
    console.error("[api/import/extract]", error);
    return Response.json({ error: "extract_failed" }, { status: 500 });
  }
}
