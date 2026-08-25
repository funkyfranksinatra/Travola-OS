// lib/service-events.ts — the OS ↔ POS communication layer (OS side).
//
// One database, two apps, one append-only ServiceEvent stream. The OS
// derives its events SERVER-SIDE by diffing live-state snapshots (the
// floor PATCH already carries the whole room), so the 10k-line client
// needs no per-action emission code and old clients keep working.
// TableSession rows — one seated party, seat → clear — are maintained
// in the same pass; they are the analytic unit shift intelligence
// reads (course pacing, PPA, paid-to-clear all attach to them).
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type ServiceEventInput = {
  source: "os" | "pos";
  type: string;
  partyKey?: string | null;
  tableIds?: string[];
  serverId?: string | null;
  checkId?: string | null;
  payload?: Prisma.InputJsonValue;
};

/** Most recent daily service-reset tick — single source of truth
 *  (previously duplicated in app/api/floor/route.ts and page.tsx). */
export function latestServiceResetBoundary(
  now: Date,
  openMinutes: number | null,
  closeMinutes: number | null
): Date {
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

/** Date-only value for today's service day (matches serviceDateOf's
 *  UTC-midnight convention used across the schema). */
function todayServiceDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Append events to the bus. Never throws — the bus is an enrichment,
 *  a failed emit must not fail the floor write that triggered it. */
export async function emitServiceEvents(restaurantId: string, events: ServiceEventInput[]) {
  if (!events.length) return;
  const serviceDate = todayServiceDate();
  try {
    await prisma.serviceEvent.createMany({
      data: events.map((e) => ({
        restaurantId,
        source: e.source,
        type: e.type,
        partyKey: e.partyKey ?? null,
        tableIds: e.tableIds ?? [],
        serverId: e.serverId ?? null,
        checkId: e.checkId ?? null,
        serviceDate,
        payload: e.payload ?? Prisma.JsonNull,
      })),
    });
  } catch (err) {
    console.warn("[service-events] emit failed:", err);
  }
}

// ─── Floor snapshot diffing ──────────────────────────────────────────

export type LiveTableState = {
  id: string;
  status: string;
  party: string | null;
  partySize: number | null;
  seatedAt: Date | null;
  groupId: string | null;
  assignedServerId: string | null;
};

const OCCUPIED = new Set(["seated", "dining"]);

/** Try to resolve the party seam key (reservation/waitlist id) for a
 *  freshly seated table. Best-effort, indexed lookups only. */
async function resolvePartyKey(restaurantId: string, tableId: string, partyName: string | null) {
  const serviceDate = todayServiceDate();
  const reservation = await prisma.reservation.findFirst({
    where: {
      restaurantId,
      serviceDate,
      status: "SEATED",
      tables: { some: { tableId } },
    },
    orderBy: { seatedTime: "desc" },
    select: { id: true, serverId: true, guestId: true },
  });
  if (reservation) return { partyKey: reservation.id, kind: "reservation" as const, serverId: reservation.serverId };
  if (partyName) {
    const walkIn = await prisma.waitlistEntry.findFirst({
      where: { restaurantId, serviceDate, status: "SEATED", name: partyName },
      orderBy: { seatedTime: "desc" },
      select: { id: true },
    });
    if (walkIn) return { partyKey: walkIn.id, kind: "walk_in" as const, serverId: null };
  }
  return { partyKey: null, kind: null, serverId: null };
}

/**
 * Diff the previous live state against an incoming snapshot: emit the
 * events the change implies and maintain TableSession rows. Runs AFTER
 * the snapshot has been persisted; errors are logged, never thrown.
 *
 * Derivations:
 *   party appears on a table            → TABLE_SEATED  (+ session open)
 *   same party name changes tables      → TABLE_MOVED   (session follows)
 *   status enters "bussing"             → TABLE_FINISHED
 *   occupied/bussing → available        → TABLE_CLEARED (+ session close)
 *   groupId forms / dissolves           → TABLES_MERGED / TABLES_UNMERGED
 *   assignedServerId changes            → SECTION_ASSIGNED (coalesced)
 */
export async function deriveFloorEvents(
  restaurantId: string,
  prevRows: LiveTableState[],
  nextRows: LiveTableState[],
  boundary: Date
) {
  try {
    const now = new Date();
    const prev = new Map(prevRows.map((t) => [t.id, t]));
    const events: ServiceEventInput[] = [];
    const sectionChanges: Array<{ tableId: string; serverId: string | null }> = [];

    // Stale previous state (last service day) reads as clean.
    const freshPrev = (t: LiveTableState | undefined): LiveTableState | null => {
      if (!t) return null;
      return t;
    };

    // Party-name → table ids on each side, for move detection.
    const partyTables = (rows: LiveTableState[]) => {
      const map = new Map<string, string[]>();
      for (const t of rows) {
        if (t.party && OCCUPIED.has(t.status)) {
          map.set(t.party, [...(map.get(t.party) ?? []), t.id]);
        }
      }
      return map;
    };
    const prevParties = partyTables(prevRows.filter((t) => t.seatedAt == null || t.seatedAt >= boundary || OCCUPIED.has(t.status)));
    const nextParties = partyTables(nextRows);

    const sameSet = (a: string[], b: string[]) =>
      a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

    // ── Seats, moves ──
    for (const [party, tables] of nextParties) {
      const before = prevParties.get(party);
      if (!before) {
        const primary = tables[0];
        const nextRow = nextRows.find((t) => t.id === primary)!;
        const seam = await resolvePartyKey(restaurantId, primary, party);
        events.push({
          source: "os",
          type: "TABLE_SEATED",
          partyKey: seam.partyKey,
          tableIds: tables,
          serverId: nextRow.assignedServerId ?? seam.serverId,
          payload: { party, partySize: nextRow.partySize, origin: seam.kind ?? "manual" },
        });
        // Session open — skip if one is already open on this table
        // (page reload replays the same snapshot; must be idempotent).
        const open = await prisma.tableSession.findFirst({
          where: { restaurantId, primaryTableId: primary, clearedAt: null },
          select: { id: true },
        });
        if (!open) {
          await prisma.tableSession.create({
            data: {
              restaurantId,
              serviceDate: todayServiceDate(),
              partyKey: seam.partyKey,
              partyName: party,
              tableIds: tables,
              primaryTableId: primary,
              serverId: nextRow.assignedServerId ?? seam.serverId,
              guestCount: nextRow.partySize,
              seatedAt: nextRow.seatedAt ?? now,
              origin: "floor",
            },
          });
        }
      } else if (!sameSet(before, tables)) {
        events.push({
          source: "os",
          type: "TABLE_MOVED",
          tableIds: tables,
          payload: { party, fromTableIds: before, toTableIds: tables },
        });
        const session = await prisma.tableSession.findFirst({
          where: { restaurantId, clearedAt: null, primaryTableId: { in: before } },
          orderBy: { seatedAt: "desc" },
        });
        if (session) {
          const moves = Array.isArray(session.moves) ? (session.moves as Prisma.JsonArray) : [];
          await prisma.tableSession.update({
            where: { id: session.id },
            data: {
              tableIds: tables,
              primaryTableId: tables[0],
              moves: [...moves, { at: now.toISOString(), fromTableIds: before, toTableIds: tables }] as Prisma.InputJsonValue,
            },
          });
        }
      }
    }

    // ── Per-table transitions ──
    for (const nextRow of nextRows) {
      const prevRow = freshPrev(prev.get(nextRow.id));
      if (!prevRow) continue;

      const wasOccupied = OCCUPIED.has(prevRow.status) || prevRow.status === "bussing";
      if (nextRow.status === "bussing" && prevRow.status !== "bussing" && OCCUPIED.has(prevRow.status)) {
        events.push({
          source: "os",
          type: "TABLE_FINISHED",
          tableIds: [nextRow.id],
          serverId: prevRow.assignedServerId,
          payload: { party: prevRow.party, partySize: prevRow.partySize },
        });
      }
      if (nextRow.status === "available" && wasOccupied) {
        events.push({
          source: "os",
          type: "TABLE_CLEARED",
          tableIds: [nextRow.id],
          serverId: prevRow.assignedServerId,
          payload: { party: prevRow.party },
        });
        const session = await prisma.tableSession.findFirst({
          where: { restaurantId, clearedAt: null, tableIds: { has: nextRow.id } },
          orderBy: { seatedAt: "desc" },
        });
        if (session) {
          const turnMinutes = Math.max(1, Math.round((now.getTime() - session.seatedAt.getTime()) / 60000));
          await prisma.tableSession.update({
            where: { id: session.id },
            data: {
              clearedAt: now,
              turnMinutes,
              paidToClearMinutes: session.checkPaidAt
                ? Math.max(0, Math.round((now.getTime() - session.checkPaidAt.getTime()) / 60000))
                : null,
              ppaCents:
                session.totalCents != null && session.guestCount
                  ? Math.round(session.totalCents / Math.max(1, session.guestCount))
                  : null,
            },
          });
        }
      }

      // Merges / unmerges (report once per group, from its first table).
      if ((nextRow.groupId ?? null) !== (prevRow.groupId ?? null)) {
        if (nextRow.groupId != null) {
          const group = nextRows.filter((t) => t.groupId === nextRow.groupId).map((t) => t.id);
          if (group[0] === nextRow.id && group.length > 1) {
            events.push({ source: "os", type: "TABLES_MERGED", tableIds: group, payload: { groupId: nextRow.groupId } });
          }
        } else if (prevRow.groupId != null) {
          const formerGroup = prevRows.filter((t) => t.groupId === prevRow.groupId).map((t) => t.id);
          if (formerGroup[0] === nextRow.id) {
            events.push({ source: "os", type: "TABLES_UNMERGED", tableIds: formerGroup, payload: { groupId: prevRow.groupId } });
          }
        }
      }

      if ((nextRow.assignedServerId ?? null) !== (prevRow.assignedServerId ?? null)) {
        sectionChanges.push({ tableId: nextRow.id, serverId: nextRow.assignedServerId ?? null });
      }
    }

    if (sectionChanges.length) {
      events.push({
        source: "os",
        type: "SECTION_ASSIGNED",
        tableIds: sectionChanges.map((c) => c.tableId),
        payload: { changes: sectionChanges },
      });
    }

    await emitServiceEvents(restaurantId, events);
  } catch (err) {
    console.warn("[service-events] floor diff failed:", err);
  }
}
