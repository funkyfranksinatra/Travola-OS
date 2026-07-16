// app/api/seat/route.ts — AI seating suggestion (rebuilt).
//
// WHY REBUILT: the previous version's Zod schema was `tableId: z.number()`,
// which made designer-created tables (string ids like "t16") structurally
// impossible to suggest — the model had to coerce or hallucinate a numeric
// id for them. It also read only { party, availableTables }, ignoring the
// occupancy/reservation/time context the client sends, so the LLM was
// seating blind.
//
// DESIGN: all correctness lives in deterministic pre-filtering; the LLM
// only expresses preference among PRE-VALIDATED candidates, and its answer
// is rejected unless it names one of them. If the LLM is unreachable (or
// keys are missing), the deterministic ranking answers instead — the
// feature degrades gracefully rather than failing.
//
// Client contract (see the seat useEffect in page.tsx):
//   { party: {id,name,size,tag},
//     allTables: Table[]            // full floor incl. occupied, for load math
//     reservations: Reservation[],  // pre-filtered to the party's day
//     currentTimeStr: "7:42 PM",
//     isFutureReservation?, targetTime?, targetDate? }
// Response: { tableId: number|string|null, reason: string }
//   tableId may be a virtual merge "a_b" when no single table fits.

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const DINING_WINDOW_MINS = 90;
const MERGE_DISTANCE_PX = 170; // adjacency threshold for merge candidates

type InTable = {
  id: number | string;
  name?: string;
  capacity: number;
  status?: string;
  assignedServerId?: string | null;
  floorId?: string;
  x?: number;
  y?: number;
  groupId?: number | string | null;
};
type InReservation = {
  id: string;
  name?: string;
  size?: number;
  time?: string; // "7:30pm"
  tableId?: number | string | null;
  status?: string;
};

/** "7:30pm" / "7:30 PM" / "19:05" → minutes from midnight, or null. */
function parseMinutes(raw?: string | null): number | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(a|p)?m?\.?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  if (mins > 59 || h > 23) return null;
  const ap = m[3];
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  return (h % 24) * 60 + mins;
}

const idStr = (v: number | string) => String(v);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const party = body.party ?? {};
    const size: number = Math.max(1, Number(party.size) || 1);
    const allTables: InTable[] = Array.isArray(body.allTables) ? body.allTables : [];
    const reservations: InReservation[] = Array.isArray(body.reservations) ? body.reservations : [];

    // Anchor time: the booking's slot when seating a future reservation,
    // otherwise "now" as the client reports it.
    const anchorMin =
      (body.isFutureReservation ? parseMinutes(body.targetTime) : null) ??
      parseMinutes(body.currentTimeStr) ??
      0;

    // ── 1) Tables HELD by an upcoming reservation inside the window ────
    // A table is held when a confirmed booking targets it within
    // [anchor, anchor+WINDOW). The party's OWN reservation never blocks
    // itself (re-seating / assigned-table flows).
    const held = new Set<string>();
    for (const r of reservations) {
      if (r.id === party.id) continue;
      if (r.tableId == null) continue;
      const t = parseMinutes(r.time);
      if (t == null) continue;
      const delta = t - anchorMin;
      if (delta >= 0 && delta < DINING_WINDOW_MINS) {
        for (const part of idStr(r.tableId).split("_")) held.add(part);
      }
    }

    // ── 2) Available, unheld tables ────────────────────────────────────
    const open = allTables.filter(
      (t) => (t.status ?? "available") === "available" && !held.has(idStr(t.id))
    );

    // ── 3) Server load context (occupied tables per server) ────────────
    const loads: Record<string, number> = {};
    for (const t of allTables) {
      const s = t.status;
      if ((s === "seated" || s === "dining") && t.assignedServerId) {
        loads[t.assignedServerId] = (loads[t.assignedServerId] || 0) + 1;
      }
    }
    const loadOf = (t: InTable) => (t.assignedServerId ? loads[t.assignedServerId] || 0 : 0);

    // ── 4) Candidates: fitting singles; merges only when nothing fits ──
    type Candidate = { id: string; label: string; capacity: number; excess: number; serverLoad: number };
    const singles: Candidate[] = open
      .filter((t) => t.capacity >= size)
      .map((t) => ({
        id: idStr(t.id),
        label: t.name || `T${t.id}`,
        capacity: t.capacity,
        excess: t.capacity - size,
        serverLoad: loadOf(t),
      }));

    let candidates: Candidate[] = singles;
    if (singles.length === 0) {
      // Adjacent open pairs on the same floor whose combined capacity fits.
      const merges: Candidate[] = [];
      for (let i = 0; i < open.length; i++) {
        for (let j = i + 1; j < open.length; j++) {
          const a = open[i], b = open[j];
          if (a.floorId !== b.floorId) continue;
          if ((a.capacity + b.capacity) < size) continue;
          const dx = (a.x ?? 0) - (b.x ?? 0);
          const dy = (a.y ?? 0) - (b.y ?? 0);
          if (Math.sqrt(dx * dx + dy * dy) > MERGE_DISTANCE_PX) continue;
          merges.push({
            id: `${idStr(a.id)}_${idStr(b.id)}`,
            label: `${a.name || a.id} + ${b.name || b.id}`,
            capacity: a.capacity + b.capacity,
            excess: a.capacity + b.capacity - size,
            serverLoad: Math.max(loadOf(a), loadOf(b)),
          });
        }
      }
      candidates = merges;
    }

    if (candidates.length === 0) {
      return Response.json({
        tableId: null,
        reason: held.size > 0
          ? "No fitting tables free — remaining openings are held for upcoming reservations."
          : "No available table fits this party right now.",
      });
    }

    // Deterministic ranking: least wasted seats, then least-loaded server.
    const ranked = [...candidates].sort(
      (a, b) => a.excess - b.excess || a.serverLoad - b.serverLoad
    );
    const fallback = ranked[0];
    const candidateIds = new Set(candidates.map((c) => c.id));

    // ── 5) LLM preference among the pre-validated candidates only ──────
    try {
      const result = await generateObject({
        model: openai("gpt-4o-mini"),
        schema: z.object({
          // number OR string — designer tables ("t16") and virtual merges
          // ("t16_t17") are first-class. The old z.number() made them
          // unrepresentable and forced hallucinated numeric ids.
          tableId: z.union([z.number(), z.string()])
            .describe("The id of the chosen candidate, exactly as listed."),
          reason: z.string().describe("One short operational sentence."),
        }),
        prompt: `You are an expert maitre d'. Choose the best table for this party — ONLY from the candidates listed. Reply with the candidate's id EXACTLY as written.

PARTY: ${JSON.stringify({ name: party.name, size, tag: party.tag })}
TIME: ${body.isFutureReservation ? `${body.targetTime} (future booking)` : body.currentTimeStr}

CANDIDATES (id · label · seats · wasted seats · current server load):
${ranked.map((c) => `- ${c.id} · ${c.label} · ${c.capacity}-top · +${c.excess} spare · load ${c.serverLoad}`).join("\n")}

Prefer the tightest capacity fit; break ties toward the least-loaded server. VIP or Pre-order tags may justify a roomier table.`,
      });

      const suggested = idStr(result.object.tableId);
      if (candidateIds.has(suggested)) {
        return Response.json({ tableId: normalizeId(suggested), reason: result.object.reason });
      }
      // Hallucination guard: an id outside the candidate list is rejected.
      return Response.json({
        tableId: normalizeId(fallback.id),
        reason: `Best capacity fit (${fallback.label}).`,
      });
    } catch {
      // LLM unreachable (network, missing key, quota): deterministic answer.
      return Response.json({
        tableId: normalizeId(fallback.id),
        reason: `Best capacity fit (${fallback.label}).`,
      });
    }
  } catch (error) {
    console.error("AI Seating Error:", error);
    return Response.json({ error: "Failed to generate seating suggestion" }, { status: 500 });
  }
}

/** Single numeric-looking ids go back as numbers (legacy table ids are
 *  numbers client-side); merges and designer ids stay strings. */
function normalizeId(id: string): number | string {
  return /^\d+$/.test(id) ? Number(id) : id;
}