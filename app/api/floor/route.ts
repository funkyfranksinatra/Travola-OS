// app/api/floor/route.ts — floor persistence: layout AND live service state.
//
// Two save channels, two philosophies:
//   PUT   = layout snapshot ("Done Editing" commits the editor session).
//   PATCH = live-state snapshot (occupied / bussing / merges / sections),
//           debounced from the frontend on every floor change — a reload
//           mid-service brings the room back exactly as it stood.
//
// Daily reset, the lazy way: live state is per-service-day and expires
// at the "service-reset boundary" — one hour before opening (4:00 AM
// when hours are unset). Rather than running a scheduler, GET compares
// each table's liveUpdatedAt against the most recent boundary and serves
// stale live state as CLEAN. Nobody is looking at the floor while nobody
// is using the app, so reset-on-next-read is behaviorally identical to a
// cron job at zero infrastructure cost. The frontend applies the same
// rule on its minute tick for a host stand left running across the tick.
import { prisma } from "@/lib/prisma";
import { requireRestaurantId } from "@/lib/tenant";
import { Prisma } from "@prisma/client";

type FloorIn = { id: string; name: string; isManualOnly?: boolean; onlineExcluded?: boolean };
type TableIn = {
  id: number | string;
  name: string;
  x: number;
  y: number;
  capacity: number;
  shape?: string;
  area?: string;
  rotation?: number;
  floorId?: string;
  manualOnly?: boolean;
  onlineExcluded?: boolean;
};
type LiveIn = {
  id: number | string;
  status?: string;
  party?: string | null;
  partySize?: number | null;
  startedAt?: number | null; // ms epoch (frontend representation)
  groupId?: number | string | null;
  assignedServerId?: string | null;
};

/** Most recent daily service-reset tick: (open − 60min), or 4:00 AM when
 *  hours are unset. Mirrored in page.tsx — keep the two in sync. */
function latestServiceResetBoundary(now: Date, openMinutes: number | null, closeMinutes: number | null): Date {
  let resetMin: number;
  if (closeMinutes == null) {
    resetMin = openMinutes == null ? 4 * 60 : (openMinutes - 60 + 1440) % 1440;
  } else {
    const overnight = openMinutes != null && closeMinutes <= openMinutes;
    resetMin = ((closeMinutes + (overnight ? 1440 : 0)) + 90) % 1440;
  }
  const tick = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(resetMin / 60), resetMin % 60);
  if (tick.getTime() > now.getTime()) tick.setDate(tick.getDate() - 1);
  return tick;
}

// ── GET: layout + live state (stale live state served clean) ─────────
export async function GET(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const [floors, tables, settings] = await Promise.all([
      prisma.floor.findMany({ where: { restaurantId, active: true }, orderBy: { sortOrder: "asc" } }),
      prisma.table.findMany({ where: { restaurantId, active: true } }),
      prisma.restaurantSettings.findUnique({ where: { restaurantId } }),
    ]);
    const boundary = latestServiceResetBoundary(new Date(), settings?.openMinutes ?? null, settings?.closeMinutes ?? null);

    return Response.json({
      floors: floors.map((f) => ({ id: f.id, name: f.name, isManualOnly: f.isManualOnly, onlineExcluded: f.onlineExcluded })),
      tables: tables.map((t) => {
        const fresh = t.liveUpdatedAt != null && t.liveUpdatedAt >= boundary;
        // Preserve id TYPE. Legacy tables + the frontend's built-in
        // layout use numeric ids; tables added via the designer use
        // string ids ("t16"). Blanket Number() turned "t16" into NaN,
        // orphaning the table (unselectable, unseatable, unremovable).
        const idOut = /^\d+$/.test(String(t.id)) ? Number(t.id) : t.id;
        return {
          id: idOut,
          name: t.name,
          x: t.x,
          y: t.y,
          capacity: t.capacity,
          shape: t.shape,
          area: t.area,
          manualOnly: t.manualOnly,
          onlineExcluded: t.onlineExcluded,
          rotation: t.rotation,
          floorId: t.floorId,
          // Live fields — a previous service day's state reads as clean.
          status: fresh ? t.status : "available",
          party: fresh ? t.party : null,
          partySize: fresh ? t.partySize : null,
          startedAt: fresh && t.seatedAt ? t.seatedAt.getTime() : null,
          groupId: fresh && t.groupId != null ? Number(t.groupId) : null,
          assignedServerId: fresh ? t.assignedServerId : null,
        };
      }),
    });
  } catch (err) {
    console.error("[api/floor GET]", err);
    return Response.json({ error: "db_unavailable" }, { status: 503 });
  }
}

// ── PATCH: live-state snapshot ────────────────────────────────────────
export async function PATCH(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const body = await req.json();
    const live: LiveIn[] = Array.isArray(body.tables) ? body.tables : [];
    if (live.length === 0) return Response.json({ ok: false, reason: "empty_snapshot" }, { status: 400 });

    const now = new Date();
    // ONE bulk UPDATE ... FROM (VALUES ...) instead of one updateMany per
    // table: 73 tables were 73 sequential Neon roundtrips inside one
    // transaction — ~6s of latency against a 5s transaction timeout
    // (P2028) on every live-state flush. The VALUES join is inherently a
    // no-op for ids deleted mid-flight, preserving the old updateMany
    // semantics. Every column is cast explicitly so NULLs in the first
    // row can't break Postgres' VALUES type inference.
    const rows = live.map(
      (t) => Prisma.sql`(${String(t.id)}::text, ${t.status || "available"}::text, ${
        t.party ?? null
      }::text, ${t.partySize ?? null}::int, ${
        t.startedAt != null ? new Date(Number(t.startedAt)) : null
      }::timestamptz, ${t.groupId != null ? String(t.groupId) : null}::text, ${
        t.assignedServerId ?? null
      }::text, ${now}::timestamptz)`
    );
    await prisma.$executeRaw`
      UPDATE "Table" AS t SET
        "status" = v."status",
        "party" = v."party",
        "partySize" = v."partySize",
        "seatedAt" = v."seatedAt",
        "groupId" = v."groupId",
        "assignedServerId" = v."assignedServerId",
        "liveUpdatedAt" = v."liveUpdatedAt"
      FROM (VALUES ${Prisma.join(rows)})
        AS v("id", "status", "party", "partySize", "seatedAt", "groupId", "assignedServerId", "liveUpdatedAt")
      WHERE t."id" = v."id" AND t."restaurantId" = ${restaurantId}`;
    return Response.json({ ok: true, tables: live.length });
  } catch (err) {
    console.error("[api/floor PATCH]", err);
    return Response.json({ error: "save_failed" }, { status: 500 });
  }
}

// ── PUT: layout snapshot (reconcile to the editor's final state) ─────
export async function PUT(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const body = await req.json();
    const floors: FloorIn[] = Array.isArray(body.floors) ? body.floors : [];
    const tables: TableIn[] = Array.isArray(body.tables) ? body.tables : [];
    if (floors.length === 0 || tables.length === 0) {
      // Refuse obviously-broken snapshots — an empty layout would soft-
      // delete the whole floor because of a transient frontend state.
      return Response.json({ ok: false, reason: "empty_snapshot" }, { status: 400 });
    }

    const floorIds = floors.map((f) => String(f.id));
    // Payload hardening: a duplicate id or a duplicate ACTIVE
    // (floorId, name) pair would abort the whole bulk INSERT under the
    // partial unique index — turning one bad rename into a permanently
    // failing autosave. Dedupe ids (last wins) and deterministically
    // suffix name collisions; the suffix is visible on the floor, so
    // the collision gets noticed and fixed instead of blocking saves.
    const byId = new Map<string, TableIn>();
    for (const t of tables) byId.set(String(t.id), t);
    const seenNames = new Set<string>();
    const safeTables: TableIn[] = [...byId.values()].map((t) => {
      const base = String(t.name ?? "");
      const fkey = String(t.floorId || "f1");
      let name = base;
      let k = 2;
      while (seenNames.has(`${fkey}::${name.toLowerCase()}`)) {
        name = `${base} (${k})`;
        k += 1;
      }
      seenNames.add(`${fkey}::${name.toLowerCase()}`);
      if (name !== base) console.warn(`[api/floor PUT] duplicate name "${base}" on ${fkey} → "${name}"`);
      return { ...t, name };
    });
    const tableIds = safeTables.map((t) => String(t.id));

    // ONE bulk upsert instead of N per-row upserts: a 73-table floor was
    // 79 sequential Neon roundtrips inside one transaction (seconds of
    // pure latency, fired by the 800ms edit autosave). Deactivation runs
    // FIRST so names freed by an override are usable by the incoming
    // rows within the same transaction (names are unique among ACTIVE
    // tables via a partial index — see prisma/migrations note).
    const tableValues = safeTables.map((t) =>
      Prisma.sql`(${String(t.id)}, ${restaurantId}, ${String(t.name ?? "")}, ${Math.round(t.x || 0)}, ${Math.round(
        t.y || 0
      )}, ${Math.max(1, Number(t.capacity) || 2)}, ${String(t.shape || "square")}, ${String(
        t.area || "dining"
      )}, ${Math.round(Number(t.rotation) || 0)}, ${String(t.floorId || "f1")}, ${!!t.manualOnly}, ${!!t.onlineExcluded}, true)`
    );
    await prisma.$transaction(async (tx) => {
      for (const [i, f] of floors.entries()) {
        const existing = await tx.floor.findFirst({ where: { id: String(f.id), restaurantId }, select: { id: true } });
        const data = { name: f.name, isManualOnly: !!f.isManualOnly, onlineExcluded: !!f.onlineExcluded, sortOrder: i, active: true };
        if (existing) await tx.floor.update({ where: { id: existing.id }, data });
        else await tx.floor.create({ data: { id: String(f.id), restaurantId, ...data } });
      }
      await tx.floor.updateMany({ where: { restaurantId, id: { notIn: floorIds } }, data: { active: false } });
      await tx.table.updateMany({ where: { restaurantId, id: { notIn: tableIds } }, data: { active: false } });
      await tx.$executeRaw`
        INSERT INTO "Table" ("id", "restaurantId", "name", "x", "y", "capacity", "shape", "area", "rotation", "floorId", "manualOnly", "onlineExcluded", "active")
        VALUES ${Prisma.join(tableValues)}
        ON CONFLICT ("id") DO UPDATE SET
          "name" = EXCLUDED."name",
          "x" = EXCLUDED."x",
          "y" = EXCLUDED."y",
          "capacity" = EXCLUDED."capacity",
          "shape" = EXCLUDED."shape",
          "area" = EXCLUDED."area",
          "rotation" = EXCLUDED."rotation",
          "floorId" = EXCLUDED."floorId",
          "manualOnly" = EXCLUDED."manualOnly",
          "onlineExcluded" = EXCLUDED."onlineExcluded",
          "active" = true
        WHERE "Table"."restaurantId" = ${restaurantId}`;
    });

    return Response.json({ ok: true, floors: floors.length, tables: tables.length });
  } catch (err) {
    console.error("[api/floor PUT]", err);
    return Response.json({ error: "save_failed" }, { status: 500 });
  }
}
