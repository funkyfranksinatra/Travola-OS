import { prisma } from "@/lib/prisma";
import { getForecastCache } from "@/lib/forecast-cache";
import { serviceDateOf, toTimeStr, todayKey } from "@/lib/db-mappers";

const DINING_WINDOW_MINS = 90;

const minutes = (date: Date) => date.getHours() * 60 + date.getMinutes();
const ageMinutes = (date: Date | null, now = Date.now()) => date ? Math.max(0, Math.round((now - date.getTime()) / 60000)) : null;

/**
 * Every helper in this file receives the restaurant id from a verified
 * session.  There is deliberately no caller-provided tenant parameter.
 */
export async function getFloorState(restaurantId: string) {
  const rows = await prisma.table.findMany({
    where: { restaurantId, active: true },
    select: { id: true, name: true, floorId: true, area: true, capacity: true, status: true, party: true, partySize: true, seatedAt: true, assignedServerId: true, groupId: true },
    orderBy: { name: "asc" },
  });
  const seated = rows.filter((table) => table.status === "seated" || table.status === "dining");
  return {
    generatedAt: new Date().toISOString(),
    summary: { tables: rows.length, occupied: seated.length, available: rows.filter((table) => table.status === "available").length },
    tables: rows.map((table) => ({
      id: table.id, name: table.name, floorId: table.floorId, zone: table.area, seats: table.capacity,
      status: table.status, party: table.party, partySize: table.partySize,
      seatedMinutes: ageMinutes(table.seatedAt), serverId: table.assignedServerId, merged: !!table.groupId,
    })),
  };
}

export async function getReservations(restaurantId: string) {
  const today = serviceDateOf(todayKey());
  const rows = await prisma.reservation.findMany({
    where: { restaurantId, serviceDate: today, status: { in: ["UPCOMING", "PARTIALLY_ARRIVED", "SEATED"] } },
    include: { guest: { select: { name: true, vip: true } }, tables: { select: { tableId: true, isPrimary: true } } },
    orderBy: { targetTime: "asc" },
  });
  return rows.map((row) => ({
    id: row.id, name: row.guest.name, partySize: row.partySize, status: row.status, vip: row.vip || row.guest.vip,
    time: toTimeStr(row.targetTime), targetAt: row.targetTime.toISOString(), seatedMinutes: ageMinutes(row.seatedTime),
    tableIds: row.tables.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((table) => table.tableId),
  }));
}

export async function getWaitlist(restaurantId: string) {
  const rows = await prisma.waitlistEntry.findMany({
    where: { restaurantId, serviceDate: serviceDateOf(todayKey()), status: { in: ["WAITING", "NOTIFIED"] } },
    orderBy: { arrivalTime: "asc" },
  });
  return rows.map((row) => ({ id: row.id, name: row.name, partySize: row.partySize, waitingMinutes: ageMinutes(row.arrivalTime), quotedMinutes: row.quotedMinutes, status: row.status }));
}

export async function getRoster(restaurantId: string) {
  const today = serviceDateOf(todayKey());
  const [day, servers, shift] = await Promise.all([
    prisma.serviceDayStaff.findUnique({ where: { restaurantId_serviceDate: { restaurantId, serviceDate: today } } }),
    prisma.server.findMany({ where: { restaurantId, active: true }, select: { id: true, name: true, onShift: true, aiExcluded: true } }),
    prisma.shift.findFirst({ where: { restaurantId, serviceDate: today }, include: { servers: { select: { serverId: true, coversServed: true, tablesWorked: true } } }, orderBy: { updatedAt: "desc" } }),
  ]);
  const byServer = new Map((shift?.servers || []).map((row) => [row.serverId, row]));
  const dayRoster = new Set((day?.roster || []).map((id) => String(id).replace(/^bar:/, "")));
  return servers.map((server) => {
    const stats = byServer.get(server.id);
    return { id: server.id, name: server.name, onShift: day ? dayRoster.has(server.id) : server.onShift, aiExcluded: server.aiExcluded, covers: stats?.coversServed || 0, tablesWorked: stats?.tablesWorked || 0 };
  });
}

export async function getServiceLog(restaurantId: string) {
  const today = serviceDateOf(todayKey());
  const rows = await prisma.reservation.findMany({
    where: { restaurantId, serviceDate: today, status: { in: ["SEATED", "FINISHED"] } },
    include: { guest: { select: { name: true } }, tables: { select: { tableId: true } } },
    orderBy: { seatedTime: "desc" },
    take: 80,
  });
  const completed = rows.filter((row) => row.status === "FINISHED" && row.turnMinutes != null);
  const averageTurnMinutes = completed.length ? Math.round(completed.reduce((sum, row) => sum + (row.turnMinutes || 0), 0) / completed.length) : null;
  return {
    averageTurnMinutes,
    parties: rows.map((row) => ({ id: row.id, name: row.guest.name, partySize: row.partySize, status: row.status, seatedMinutes: ageMinutes(row.seatedTime), turnMinutes: row.turnMinutes, tableIds: row.tables.map((table) => table.tableId) })),
  };
}

export function getCachedForecast(restaurantId: string) {
  const date = todayKey();
  const forecast = getForecastCache(restaurantId, date);
  if (!forecast) return { available: false, date, reason: "No cached forecast yet. Open Predictor to refresh it; co-pilot will not trigger web research." };
  return { available: true, date, forecast };
}

/** Same availability, hold-window, capacity, merge-adjacency and load rules as the seating route, exposed read-only. */
export async function suggestSeating(restaurantId: string, partySize: number) {
  const size = Math.max(1, Math.min(30, Math.round(Number(partySize) || 0)));
  if (!size) return { needsPartySize: true, message: "Ask with a party size, for example: can I fit a walk-in party of 5?" };
  const now = new Date();
  const [tables, reservations] = await Promise.all([
    prisma.table.findMany({ where: { restaurantId, active: true }, select: { id: true, name: true, floorId: true, capacity: true, status: true, assignedServerId: true, x: true, y: true } }),
    prisma.reservation.findMany({ where: { restaurantId, serviceDate: serviceDateOf(todayKey()), status: { in: ["UPCOMING", "PARTIALLY_ARRIVED"] } }, include: { tables: { select: { tableId: true } } } }),
  ]);
  const held = new Set<string>();
  for (const reservation of reservations) {
    const delta = minutes(reservation.targetTime) - minutes(now);
    if (delta >= 0 && delta < DINING_WINDOW_MINS) reservation.tables.forEach((table) => held.add(table.tableId));
  }
  const loads = new Map<string, number>();
  tables.filter((table) => table.status === "seated" || table.status === "dining").forEach((table) => {
    if (table.assignedServerId) loads.set(table.assignedServerId, (loads.get(table.assignedServerId) || 0) + 1);
  });
  const open = tables.filter((table) => table.status === "available" && !held.has(table.id));
  type Candidate = { id: string; label: string; seats: number; excess: number; serverLoad: number; kind: "table" | "merge" };
  let candidates: Candidate[] = open.filter((table) => table.capacity >= size).map((table) => ({ id: table.id, label: table.name, seats: table.capacity, excess: table.capacity - size, serverLoad: table.assignedServerId ? loads.get(table.assignedServerId) || 0 : 0, kind: "table" }));
  if (!candidates.length) {
    for (let i = 0; i < open.length; i += 1) for (let j = i + 1; j < open.length; j += 1) {
      const a = open[i], b = open[j];
      if (a.floorId !== b.floorId || a.capacity + b.capacity < size) continue;
      const dx = a.x - b.x, dy = a.y - b.y;
      if (Math.sqrt(dx * dx + dy * dy) > 170) continue;
      candidates.push({ id: `${a.id}_${b.id}`, label: `${a.name} + ${b.name}`, seats: a.capacity + b.capacity, excess: a.capacity + b.capacity - size, serverLoad: Math.max(a.assignedServerId ? loads.get(a.assignedServerId) || 0 : 0, b.assignedServerId ? loads.get(b.assignedServerId) || 0 : 0), kind: "merge" });
    }
  }
  candidates.sort((a, b) => a.excess - b.excess || a.serverLoad - b.serverLoad || a.label.localeCompare(b.label));
  return candidates.length ? { partySize: size, heldTables: [...held], candidates: candidates.slice(0, 6), recommended: candidates[0] } : { partySize: size, heldTables: [...held], candidates: [], recommended: null, message: "No fitting free table under the current 90-minute reservation hold window." };
}

export async function getSentrySnapshot(restaurantId: string) {
  const [floor, waitlist, reservations, roster, serviceLog] = await Promise.all([
    getFloorState(restaurantId), getWaitlist(restaurantId), getReservations(restaurantId), getRoster(restaurantId), getServiceLog(restaurantId),
  ]);
  const seated = floor.tables.filter((table) => table.status === "seated" || table.status === "dining");
  return { generatedAt: new Date().toISOString(), floor: floor.summary, seated, waiting: waitlist, upcoming: reservations.filter((reservation) => reservation.status !== "SEATED").slice(0, 12), roster, averageTurnMinutes: serviceLog.averageTurnMinutes };
}
