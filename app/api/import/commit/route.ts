// app/api/import/commit/route.ts — the importer's single write path.
//
// Human-reviewed rows land here as historical (or future) reservation
// records. This route exists separately from /api/reservations because
// that route DELIBERATELY 400s past dates — imports are supposed to be
// past dates: they're the predictor's training history (covers, turn
// times, day-of-week patterns).
//
// Defense in depth even after client review:
//  - authoritative dedupe against the database (natural key: serviceDate
//    + guest name + targetTime + partySize), so re-importing a file or
//    overlapping exports can't double-count history
//  - per-row validation with per-row error reporting — one bad row never
//    sinks the batch
//  - everything inside one transaction: a commit either lands whole or
//    not at all
import { prisma } from "@/lib/prisma";
import { requireRestaurantId } from "@/lib/tenant";
import {
  parseResMinutes,
  buildTargetTime,
  serviceDateOf,
  dayOfWeekOf,
  todayKey,
} from "@/lib/db-mappers";

type InRow = {
  name?: string;
  date?: string;          // YYYY-MM-DD (client guarantees, we re-check)
  time?: string | null;   // booked time, "7:30 PM"
  size?: number;
  status?: string;        // finished | no_show | cancelled | seated_only | unknown
  seatedTime?: string | null;
  finishedTime?: string | null;
  turnMinutes?: number | null;
  tableId?: number | string | null;
  kind?: string;          // reservation | walkin | unknown
};

const SOURCE_MAP: Record<string, "OPENTABLE_IMPORT" | "RESY_IMPORT" | "PAPER_IMPORT"> = {
  opentable: "OPENTABLE_IMPORT",
  resy: "RESY_IMPORT",
  paper: "PAPER_IMPORT",
  other: "PAPER_IMPORT",
};

const STATUS_MAP: Record<string, "FINISHED" | "NO_SHOW" | "CANCELLED" | "SEATED" | "UPCOMING"> = {
  finished: "FINISHED",
  no_show: "NO_SHOW",
  cancelled: "CANCELLED",
  seated_only: "FINISHED", // seated with no recorded end: still a completed historical cover
  unknown: "FINISHED",
};

function timeOnDate(dateKey: string, raw?: string | null): Date | null {
  const min = parseResMinutes(raw ?? "");
  if (min == null) return null;
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d, Math.floor(min / 60), min % 60);
}

async function guestIdFor(restaurantId: string, name: string): Promise<string> {
  const clean = name.trim() || "Guest";
  const existing = await prisma.guest.findFirst({ where: { restaurantId, name: clean } });
  if (existing) return existing.id;
  const created = await prisma.guest.create({ data: { restaurantId, name: clean } });
  return created.id;
}

export async function POST(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const body = await req.json();
    const rows: InRow[] = Array.isArray(body.rows) ? body.rows : [];
    const source = SOURCE_MAP[String(body.source || "paper").toLowerCase()] ?? "PAPER_IMPORT";
    if (rows.length === 0) return Response.json({ error: "no_rows" }, { status: 400 });
    if (rows.length > 500) return Response.json({ error: "too_many_rows", max: 500 }, { status: 400 });

    const results = { created: 0, duplicates: 0, errors: [] as Array<{ index: number; reason: string }> };
    const creates: Array<() => Promise<unknown>> = [];
    // Natural keys already committed in THIS batch (intra-batch dedupe).
    const batchKeys = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const name = String(r.name || "").trim();
      const dateKey = String(r.date || "");
      const size = Math.max(1, Number(r.size) || 0);
      if (!name) { results.errors.push({ index: i, reason: "missing_name" }); continue; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) { results.errors.push({ index: i, reason: "missing_or_bad_date" }); continue; }
      if (!Number(r.size)) { results.errors.push({ index: i, reason: "missing_size" }); continue; }

      const status = STATUS_MAP[String(r.status || "unknown")] ?? "FINISHED";
      // Walk-ins with no booked time anchor on their seated time so
      // day-of-week/time-of-day features stay meaningful.
      const bookedRaw = r.time || r.seatedTime || null;
      const targetTime = bookedRaw ? buildTargetTime(dateKey, bookedRaw) : buildTargetTime(dateKey, "12:00pm");
      const seatedTime = timeOnDate(dateKey, r.seatedTime);
      let finishedTime = timeOnDate(dateKey, r.finishedTime);
      // Overnight finish (finished < seated → rolled past midnight).
      if (seatedTime && finishedTime && finishedTime < seatedTime) {
        finishedTime = new Date(finishedTime.getTime() + 24 * 60 * 60 * 1000);
      }
      let turnMinutes: number | null =
        r.turnMinutes != null && Number.isFinite(Number(r.turnMinutes)) && Number(r.turnMinutes) > 0
          ? Math.round(Number(r.turnMinutes))
          : null;
      if (turnMinutes == null && seatedTime && finishedTime) {
        turnMinutes = Math.max(1, Math.round((finishedTime.getTime() - seatedTime.getTime()) / 60000));
      }

      const key = `${dateKey}|${name.toLowerCase()}|${targetTime.getTime()}|${size}`;
      if (batchKeys.has(key)) { results.duplicates++; continue; }
      batchKeys.add(key);

      // Authoritative dedupe: same guest name, same service date, same
      // target minute, same party size → already imported / already known.
      const dup = await prisma.reservation.findFirst({
        where: {
          restaurantId,
          serviceDate: serviceDateOf(dateKey),
          partySize: size,
          targetTime,
          guest: { name: { equals: name, mode: "insensitive" } },
        },
        select: { id: true },
      });
      if (dup) { results.duplicates++; continue; }

      const guestId = await guestIdFor(restaurantId, name);
      const tableDbIds =
        r.tableId != null && r.tableId !== ""
          ? String(r.tableId).split("_").map(String)
          : [];
      // Only link tables that actually exist — imports may reference
      // labels from the OLD system's floor.
      const existingTables = tableDbIds.length
        ? await prisma.table.findMany({ where: { restaurantId, id: { in: tableDbIds } }, select: { id: true } })
        : [];

      creates.push(() =>
        prisma.reservation.create({
          data: {
            restaurantId,
            guestId,
            partySize: size,
            status,
            source,
            bookedAt: targetTime,
            targetTime,
            seatedTime: seatedTime ?? undefined,
            finishedTime: finishedTime ?? undefined,
            serviceDate: serviceDateOf(dateKey),
            dayOfWeek: dayOfWeekOf(dateKey),
            turnMinutes: turnMinutes ?? undefined,
            tables: existingTables.length
              ? { create: existingTables.map((t, idx) => ({ tableId: t.id, isPrimary: idx === 0 })) }
              : undefined,
          },
        })
      );
      results.created++;
    }

    // All-or-nothing: the review UI showed the host exactly what would
    // land; a partial landing would silently disagree with that preview.
    if (creates.length > 0) {
      await prisma.$transaction(async () => {
        for (const c of creates) await c();
      });
    }

    return Response.json({
      ok: true,
      created: results.created,
      duplicates: results.duplicates,
      errors: results.errors,
      importedThrough: todayKey(),
    });
  } catch (error) {
    console.error("[api/import/commit]", error);
    return Response.json({ error: "commit_failed" }, { status: 500 });
  }
}
