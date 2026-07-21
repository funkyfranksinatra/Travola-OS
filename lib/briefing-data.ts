import { prisma } from "@/lib/prisma";
import { getForecastCache } from "@/lib/forecast-cache";
import { getShiftIntel } from "@/lib/shift-intel";
import { serviceDateOf, toTimeStr } from "@/lib/db-mappers";

export async function getBriefingSnapshot(restaurantId: string, date: string, suppliedForecast?: unknown) {
  const serviceDate = serviceDateOf(date);
  const [bookRows, roster, servers, shiftRows, history, shiftIntel, cachedForecast] = await Promise.all([
    prisma.reservation.findMany({
      where: { restaurantId, serviceDate, status: { in: ["UPCOMING", "PARTIALLY_ARRIVED", "SEATED"] } },
      include: { guest: { select: { name: true, vip: true, totalVisits: true } }, tables: { select: { tableId: true } } },
      orderBy: { targetTime: "asc" },
    }),
    prisma.serviceDayStaff.findUnique({ where: { restaurantId_serviceDate: { restaurantId, serviceDate } } }),
    prisma.server.findMany({ where: { restaurantId, active: true }, select: { id: true, name: true, onShift: true, aiExcluded: true } }),
    prisma.shift.findMany({ where: { restaurantId, serviceDate }, include: { servers: { select: { serverId: true, coversServed: true, tablesWorked: true } } } }),
    prisma.reservation.findMany({
      where: { restaurantId, serviceDate: { lt: serviceDate }, status: "FINISHED" },
      select: { serviceDate: true, partySize: true, turnMinutes: true }, orderBy: { serviceDate: "desc" }, take: 240,
    }),
    getShiftIntel(restaurantId, date),
    getForecastCache(restaurantId, date),
  ]);

  const book = bookRows.map((row) => ({
    name: row.guest.name,
    size: row.partySize,
    time: toTimeStr(row.targetTime),
    status: row.status,
    vip: row.vip || row.guest.vip,
    repeatVisits: row.guest.totalVisits,
    tables: row.tables.map((table) => table.tableId),
  }));
  const timeBuckets = new Map<string, { parties: number; covers: number }>();
  for (const party of book) {
    const bucket = party.time.replace(/:\d\d/, ":00");
    const current = timeBuckets.get(bucket) || { parties: 0, covers: 0 };
    current.parties += 1;
    current.covers += party.size;
    timeBuckets.set(bucket, current);
  }
  const shiftCovers = new Map<string, { covers: number; tables: number }>();
  for (const shift of shiftRows) for (const row of shift.servers) {
    const current = shiftCovers.get(row.serverId) || { covers: 0, tables: 0 };
    current.covers += row.coversServed;
    current.tables += row.tablesWorked;
    shiftCovers.set(row.serverId, current);
  }
  const days = new Map<string, number>();
  const turns = history.map((row) => row.turnMinutes).filter((value): value is number => value != null);
  for (const row of history) {
    const key = row.serviceDate.toISOString().slice(0, 10);
    days.set(key, (days.get(key) || 0) + row.partySize);
  }
  const completedDayCovers = [...days.values()];
  const avgHistoryCovers = completedDayCovers.length
    ? Math.round(completedDayCovers.reduce((sum, value) => sum + value, 0) / completedDayCovers.length)
    : null;

  return {
    date,
    // The deterministic dossier is the briefing's volume/staffing source.
    // `forecast` stays for the existing worker prompt shape and UI contract.
    forecast: cachedForecast || suppliedForecast || null,
    shiftIntel,
    book,
    signals: {
      bookedCovers: book.reduce((sum, party) => sum + party.size, 0),
      bookedParties: book.length,
      largeParties: book.filter((party) => party.size >= 6),
      vipsAndRegulars: book.filter((party) => party.vip || party.repeatVisits >= 3),
      pacingClusters: [...timeBuckets.entries()].map(([time, value]) => ({ time, ...value })).filter((value) => value.parties >= 2 || value.covers >= 10),
      historyDays: completedDayCovers.length,
      avgHistoryCovers,
      avgTurnMinutes: turns.length ? Math.round(turns.reduce((sum, value) => sum + value, 0) / turns.length) : null,
    },
    roster: servers.map((server) => ({
      name: server.name,
      onShift: roster?.roster.includes(server.id) ?? server.onShift,
      aiExcluded: server.aiExcluded,
      covers: shiftCovers.get(server.id)?.covers || 0,
      tables: shiftCovers.get(server.id)?.tables || 0,
    })),
  };
}
