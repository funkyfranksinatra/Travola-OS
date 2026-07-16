// app/api/import/floorplan/route.ts — floor-plan photo → structured tables.
//
// TWO MODES:
//  • labels (preferred): the client's CV pass has already found every
//    table's position, shape, and rotation deterministically from pixels.
//    We receive small per-table CROPS and read only what vision models
//    are actually reliable at: the printed label and a seat estimate.
//    One generateObject call covers every tile.
//  • full (fallback): whole-image extraction, used when the CV pass finds
//    too few blobs (heavy glare, exotic UI). The model transcribes what
//    it SEES and is forbidden from inventing tables.
//
// The former Pass-2 "verify & repair" is deliberately GONE: a VLM
// re-auditing its own geometry resampled spatial noise (rotations lost,
// rows shifted) instead of reducing it. Geometry now belongs to the CV
// pass, where it is exact; the LLM never touches coordinates again.
//
// Same trust posture as the reservation importer: full gpt-4o by default
// (IMPORT_MODEL env override), and nothing commits without the staged
// review — the model proposes, the host disposes.

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

export const maxDuration = 60;

// ── labels mode ──────────────────────────────────────────────────────
// NOTE: .nullable() everywhere, never .optional() — OpenAI structured
// outputs (strict mode) rejects optional keys.
const labelsSchema = z.object({
  floorName: z
    .string()
    .nullable()
    .describe("The floor/room name if visible in the FULL SCREEN image (a corner pill, tab, or header like 'Patio' or 'Main'); null when nothing is shown or no full-screen image was provided."),
  tiles: z.array(
    z.object({
      index: z
        .number()
        .int()
        .describe("The tile index this entry answers for, copied from its 'TILE n:' caption."),
      label: z
        .string()
        .describe("The table number/name printed on the table in this tile, e.g. '61' or 'B1'. Empty string when no text is legible."),
      seats: z
        .number()
        .int()
        .min(1)
        .max(20)
        .nullable()
        .describe("Seat count if chair marks/nubs around the table are countable; null when you cannot tell."),
      unclear: z
        .boolean()
        .describe("true when the label is unreadable, cropped, or ambiguous."),
    })
  ),
});

// ── full mode (fallback) ─────────────────────────────────────────────
const floorSchema = z.object({
  floorName: z
    .string()
    .nullable()
    .describe("Room/floor name if VISIBLE in the image (a tab, header, or label like 'Patio' or 'Giocondo'); null when nothing is shown."),
  tables: z.array(
    z.object({
      label: z.string().describe("The table's number or name exactly as printed on it, e.g. '204' or 'B1'."),
      shape: z
        .enum(["round", "square", "rectangle"])
        .describe("round for circles; square for roughly 1:1 rectangles; rectangle for clearly elongated tables, bars, or banquettes."),
      seats: z
        .number()
        .int()
        .min(1)
        .max(20)
        .nullable()
        .describe("Seat count if determinable from chair marks/nubs around the table or a printed count; null when you cannot tell."),
      rotationDeg: z
        .union([z.literal(0), z.literal(45), z.literal(90), z.literal(135)])
        .describe("Pick ONE. Decision procedure for squares: do its corners point up/down/left/right like a DIAMOND? Then 45. Edges flat top/bottom? Then 0. Rectangles: long side horizontal = 0, vertical = 90."),
      xPct: z.number().min(0).max(100).describe("Horizontal position of the table's CENTER as a percentage of image width (0 = left edge, 100 = right edge)."),
      yPct: z.number().min(0).max(100).describe("Vertical position of the table's CENTER as a percentage of image height (0 = top edge, 100 = bottom edge)."),
      unclear: z.boolean().describe("true when the label, shape, or seat estimate involved ANY guesswork."),
    })
  ),
});

type TileIn = { index: number; image: string };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const model = openai(process.env.IMPORT_MODEL || "gpt-4o");

    // ── labels mode ─────────────────────────────────────────────────
    if (body?.mode === "labels") {
      const rawTiles: unknown[] = Array.isArray(body?.tiles) ? body.tiles : [];
      const tiles: TileIn[] = rawTiles
        .filter(
          (t): t is TileIn =>
            !!t &&
            typeof (t as TileIn).index === "number" &&
            typeof (t as TileIn).image === "string" &&
            (t as TileIn).image.startsWith("data:image/")
        )
        .slice(0, 40); // sanity cap — a floor photo yields dozens, not hundreds
      if (tiles.length === 0) {
        return Response.json({ error: "tiles_required" }, { status: 400 });
      }

      const content: Array<{ type: "text"; text: string } | { type: "image"; image: string }> = [
        {
          type: "text",
          text: `Each image below is a small crop of ONE table from a restaurant floor-plan screenshot, captioned "TILE n:". For EVERY tile, return exactly one entry with its index and:

- label: ONLY the table's number/name printed on the table ("61", "B1", "204"). Tables often carry EXTRA chips that are NOT part of the label — reservation times ("6:00", "7:30 PM"), party sizes, status badges. Exclude them: a tile showing "40" above a "6:00" chip has label "40". If no table identifier is legible, use an empty string — NEVER invent a plausible label.
- seats: count the chair marks/nubs drawn around the table's edge if they are clearly countable; otherwise null. NEVER guess a typical number.
- unclear: true when the label required any guesswork (blur, glare, cropping).

Answer for every tile, in the same order they appear.

If a final image captioned "FULL SCREEN:" is present, also report floorName: the floor/room name visible in that screen's UI (often a pill in a corner or a tab — "Patio", "Main", "Bar"); null if none is visible. Never use a date, meal period, or guest name as the floor name.`,
        },
      ];
      for (const t of tiles) {
        content.push({ type: "text", text: `TILE ${t.index}:` });
        content.push({ type: "image", image: t.image });
      }
      const fullImage: string | undefined = body?.fullImage;
      if (typeof fullImage === "string" && fullImage.startsWith("data:image/")) {
        content.push({ type: "text", text: "FULL SCREEN:" });
        content.push({ type: "image", image: fullImage });
      }

      const result = await generateObject({
        model,
        schema: labelsSchema,
        messages: [{ role: "user", content }],
      });
      return Response.json({ tiles: result.object.tiles, floorName: result.object.floorName ?? null });
    }

    // ── full mode (fallback) ────────────────────────────────────────
    const image: string | undefined = body?.image;
    if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
      return Response.json({ error: "image_required" }, { status: 400 });
    }

    const result = await generateObject({
      model,
      schema: floorSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are transcribing a restaurant floor plan from a screenshot or photo of another reservation/floor-management system. Extract ONLY what is visibly present:

- Every table: its printed label, its shape, its seat count, and its CENTER position as percentages of the image (xPct from left, yPct from top).
- Seat counts come from chair marks/nubs drawn around the table or printed numbers. If you cannot count them confidently, set seats to null — NEVER guess a plausible number.
- Set unclear: true on any table where the label, shape, or seats involved guesswork (glare, blur, occlusion, cropped edges).
- NEVER invent tables that aren't clearly visible. Fewer accurate tables beat a complete-looking fabrication.
- floorName: only if a room/floor name is visible somewhere in the UI (a tab or header); otherwise null.
- Ignore everything that is not a table: sidebars, buttons, legends, people, reflections.
- ROTATION: report each table's visual rotation (rotationDeg, nearest 15°). Platforms like OpenTable draw many squares rotated 45° so they look like DIAMONDS — those are shape "square" with rotationDeg 45, NOT a different shape. A rectangle standing tall is rotationDeg 90. Axis-aligned = 0.
- COMPLETENESS: count every numbered marker before answering. Labels usually run in sequences (1,2,3… or 60,61,62…) — if a sequence appears to skip a number, LOOK AGAIN for the missing one (it may overlap a neighbor or sit at an edge) before concluding it doesn't exist.
- BAR / COUNTER SEATS: a chain of small individual circles with sequential numbers is bar seating — each is its own "round" table with seats 1 (or 2 if it's clearly a two-seat pod). Do not report them as 4-tops.`,
            },
            { type: "image", image },
          ],
        },
      ],
    });

    return Response.json({ floor: result.object });
  } catch (err) {
    console.error("[api/import/floorplan]", err);
    const detail = err instanceof Error ? err.message.slice(0, 200) : "unknown";
    return Response.json({ error: "extract_failed", detail }, { status: 500 });
  }
}