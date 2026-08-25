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
import {
  deriveFloorEvents,
  emitServiceEvents,
  latestServiceResetBoundary,
  type LiveTableState,
} from "@/lib/service-events";

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

class LayoutWriteIncompleteError extends Error {
  constructor(readonly expectedFloors: string[], readonly expectedTables: string[], readonly writtenFloors: string[], readonly writtenTables: string[]) {
    super("layout_write_incomplete");
  }
}

async function foreignIdentityCollisions(restaurantId: string, floorIds: string[], tableIds: string[]) {
  const [floors, tables] = await Promise.all([
    prisma.floor.findMany({ where: { id: { in: floorIds }, restaurantId: { not: restaurantId } }, select: { id: true } }),
    prisma.table.findMany({ where: { id: { in: tableIds }, restaurantId: { not: restaurantId } }, select: { id: true } }),
  ]);
  return { floors: floors.map((floor) => floor.id), tables: tables.map((table) => table.id) };
}

// latestServiceResetBoundary now lives in lib/service-events.ts (single
// source of truth — the event differ needs the same tick). Mirrored in
// page.tsx — keep the two in sync.

/** Open/recently-closed POS check summaries, keyed by shared Table.id.
 *  The floor surfaces the check's pace and pay state on each tile; a
 *  check closed while the table is still occupied renders as PAID. */
async function checkSummariesByTable(restaurantId: string) {
  try {
    const recent = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const checks = await prisma.check.findMany({
      where: {
        restaurantId,
        tableId: { not: null },
        OR: [{ status: "open" }, { status: "closed", closedAt: { gte: recent } }],
      },
      orderBy: { openedAt: "desc" },
      select: {
        id: true, tableId: true, status: true, totalCents: true, guestCount: true,
        currentCourse: true, openedAt: true, closedAt: true, serverName: true,
        items: { select: { state: true, firedAt: true } },
      },
    });
    const byTable = new Map<string, ReturnType<typeof summarize>>();
    function summarize(c: (typeof checks)[number]) {
      const fired = c.items.filter((i) => i.state === "fired");
      const lastFire = fired.reduce<number | null>((max, i) => {
        const t = i.firedAt?.getTime() ?? null;
        return t != null && (max == null || t > max) ? t : max;
      }, null);
      return {
        id: c.id,
        status: c.status,
        totalCents: c.totalCents,
        guestCount: c.guestCount,
        course: c.currentCourse,
        itemCount: c.items.filter((i) => i.state !== "voided").length,
        firedCount: fired.length,
        lastFireAt: lastFire,
        openedAt: c.openedAt.getTime(),
        paidAt: c.status === "closed" && c.closedAt ? c.closedAt.getTime() : null,
        serverName: c.serverName,
      };
    }
    for (const c of checks) {
      if (c.tableId && !byTable.has(c.tableId)) byTable.set(c.tableId, summarize(c));
    }
    return byTable;
  } catch (err) {
    // Pre-migration databases have no Check table; the floor must load.
    console.warn("[api/floor GET] check summaries unavailable:", err);
    return new Map<string, never>();
  }
}

// ── GET: layout + live state (stale live state served clean) ─────────
export async function GET(req: Request) {
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; const { restaurantId } = auth;
    const [floors, tables, settings, checksByTable] = await Promise.all([
      prisma.floor.findMany({ where: { restaurantId, active: true }, orderBy: { sortOrder: "asc" } }),
      prisma.table.findMany({ where: { restaurantId, active: true } }),
      prisma.restaurantSettings.findUnique({ where: { restaurantId } }),
      checkSummariesByTable(restaurantId),
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
          // POS shared-DB link: the table's live check (or its just-paid
          // check while the party is still seated). Null when no POS.
          check: fresh ? checksByTable.get(String(t.id)) ?? null : null,
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
    // Shared-DB link: capture the PREVIOUS live state before the write so
    // the event differ can derive what happened (seats, moves, merges,
    // clears, section changes) — the POS and shift intel tail the result.
    const liveIds = live.map((t) => String(t.id));
    const [prevRows, settingsForBoundary] = await Promise.all([
      prisma.table.findMany({
        where: { restaurantId, id: { in: liveIds } },
        select: { id: true, status: true, party: true, partySize: true, seatedAt: true, groupId: true, assignedServerId: true, liveUpdatedAt: true },
      }),
      prisma.restaurantSettings.findUnique({ where: { restaurantId }, select: { openMinutes: true, closeMinutes: true } }),
    ]);
    const patchBoundary = latestServiceResetBoundary(now, settingsForBoundary?.openMinutes ?? null, settingsForBoundary?.closeMinutes ?? null);
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

    // Derive + emit service events from the state change (never throws;
    // a bus failure must not fail the floor save). Stale previous state
    // (last service day) is treated as a clean room.
    const prevStates: LiveTableState[] = prevRows.map((t) => {
      const fresh = t.liveUpdatedAt != null && t.liveUpdatedAt >= patchBoundary;
      return {
        id: t.id,
        status: fresh ? t.status : "available",
        party: fresh ? t.party : null,
        partySize: fresh ? t.partySize : null,
        seatedAt: fresh ? t.seatedAt : null,
        groupId: fresh ? t.groupId : null,
        assignedServerId: fresh ? t.assignedServerId : null,
      };
    });
    const nextStates: LiveTableState[] = live.map((t) => ({
      id: String(t.id),
      status: t.status || "available",
      party: t.party ?? null,
      partySize: t.partySize ?? null,
      seatedAt: t.startedAt != null ? new Date(Number(t.startedAt)) : null,
      groupId: t.groupId != null ? String(t.groupId) : null,
      assignedServerId: t.assignedServerId ?? null,
    }));
    await deriveFloorEvents(restaurantId, prevStates, nextStates, patchBoundary);

    return Response.json({ ok: true, tables: live.length });
  } catch (err) {
    console.error("[api/floor PATCH]", err);
    return Response.json({ error: "save_failed" }, { status: 500 });
  }
}

// ── PUT: layout snapshot (reconcile to the editor's final state) ─────
export async function PUT(req: Request) {
  let restaurantId = "";
  let incomingFloorIds: string[] = [];
  let incomingTableIds: string[] = [];
  try {
    const auth = requireRestaurantId(req); if ("response" in auth) return auth.response; restaurantId = auth.restaurantId;
    const body = await req.json();
    const floors: FloorIn[] = Array.isArray(body.floors) ? body.floors : [];
    const tables: TableIn[] = Array.isArray(body.tables) ? body.tables : [];
    if (floors.length === 0 || tables.length === 0) {
      // Refuse obviously-broken snapshots — an empty layout would soft-
      // delete the whole floor because of a transient frontend state.
      return Response.json({ ok: false, reason: "empty_snapshot" }, { status: 400 });
    }

    const floorIds = [...new Set(floors.map((f) => String(f.id)))];
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
    incomingFloorIds = floorIds;
    incomingTableIds = tableIds;
    const collisions = await foreignIdentityCollisions(restaurantId, floorIds, tableIds);
    if (collisions.floors.length || collisions.tables.length) {
      return Response.json({ error: "id_collision", ...collisions }, { status: 409 });
    }
    const unknownFloorIds = [...new Set(safeTables.map((table) => String(table.floorId || "f1")).filter((id) => !floorIds.includes(id)))];
    if (unknownFloorIds.length) {
      return Response.json({ error: "invalid_floor_reference", floors: unknownFloorIds }, { status: 409 });
    }

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
      // A guarded ON CONFLICT can legally affect zero rows. Never answer
      // 200 for that silent drop: the editor must retain every floor and
      // table it sent, or receive a recoverable conflict response.
      const [writtenFloors, writtenTables] = await Promise.all([
        tx.floor.findMany({ where: { restaurantId, id: { in: floorIds }, active: true }, select: { id: true } }),
        tx.table.findMany({ where: { restaurantId, id: { in: tableIds }, active: true }, select: { id: true } }),
      ]);
      const floorSet = new Set(writtenFloors.map((floor) => floor.id));
      const tableSet = new Set(writtenTables.map((table) => table.id));
      if (floorSet.size !== floorIds.length || tableSet.size !== tableIds.length) {
        throw new LayoutWriteIncompleteError(floorIds, tableIds, [...floorSet], [...tableSet]);
      }
    });

    // Shared-DB link: tell the POS (and anyone else tailing the bus)
    // that the room's geometry changed — its floor view re-fetches.
    await emitServiceEvents(restaurantId, [{
      source: "os",
      type: "LAYOUT_UPDATED",
      tableIds: incomingTableIds,
      payload: { floors: floors.length, tables: tables.length },
    }]);

    return Response.json({ ok: true, floors: floors.length, tables: tables.length });
  } catch (err) {
    if (err instanceof LayoutWriteIncompleteError) {
      return Response.json({
        error: "write_incomplete",
        expected: { floors: err.expectedFloors, tables: err.expectedTables },
        written: { floors: err.writtenFloors, tables: err.writtenTables },
      }, { status: 409 });
    }
    // The preflight above makes this a race-only path. Recheck so a global
    // primary-key collision can never degrade into a generic save failure.
    if ((err as { code?: string })?.code === "P2002") {
      const collisions = await foreignIdentityCollisions(restaurantId, incomingFloorIds, incomingTableIds)
        .catch(() => ({ floors: incomingFloorIds, tables: incomingTableIds }));
      return Response.json({
        error: "id_collision",
        floors: collisions.floors.length ? collisions.floors : incomingFloorIds,
        tables: collisions.tables.length ? collisions.tables : incomingTableIds,
      }, { status: 409 });
    }
    console.error("[api/floor PUT]", err);
    return Response.json({ error: "save_failed" }, { status: 500 });
  }
}
