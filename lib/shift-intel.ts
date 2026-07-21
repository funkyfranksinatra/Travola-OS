import { prisma } from "@/lib/prisma";
import { dateKeyOfService, serviceDateOf, toTimeStr } from "@/lib/db-mappers";
import { getStoredForecast } from "@/lib/forecast-cache";

type Baseline = {
  avgCovers?: number; resSharePct?: number; turnMinutes?: number;
  seasons?: { slow?: Array<{ from?: number; to?: number }>; busy?: Array<{ from?: number; to?: number }>; offFrom?: number; offTo?: number; onFrom?: number; onTo?: number } | null;
};
type Dossier = Record<string, unknown>;
const CACHE_MS = 5 * 60 * 1000;
const aggregateCache = new Map<string, { expiresAt: number; value: Dossier; staffVersion: string }>();
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const hourOf = (value: Date | null) => value ? value.getHours() : null;
const minOf = (value: Date | null) => value ? value.getHours() * 60 + value.getMinutes() : null;
const bounded = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const keyFor = (restaurantId: string, date: string) => `${restaurantId}:${date}`;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The one calendar-date convention for shift intelligence.  Date strings are
 * already restaurant-calendar keys, so never run them through Date.parse or
 * toISOString (both can move a restaurant's service date across midnight).
 * Date instances are formatted in the supplied restaurant timezone, or the
 * caller's local calendar when no timezone is available.
 */
export function canonicalShiftDate(value?: string | Date | null, timeZone?: string): string {
  if (typeof value === "string" && DATE_KEY.test(value)) return value;
  const date = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
      const part = (type: string) => parts.find((item) => item.type === type)?.value;
      const year = part("year"), month = part("month"), day = part("day");
      if (year && month && day) return `${year}-${month}-${day}`;
    } catch {
      // A bad user preference must never make a forecast unaddressable.
    }
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Resolve the restaurant's configured IANA timezone before choosing a
 * default service date. Explicit YYYY-MM-DD inputs stay literal. */
export async function restaurantShiftDate(restaurantId: string, value?: string | Date | null): Promise<string> {
  if (typeof value === "string" && DATE_KEY.test(value)) return canonicalShiftDate(value);
  const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId }, select: { prefs: true } });
  const timeZone = (settings?.prefs as any)?.location?.timeZone;
  return canonicalShiftDate(value, typeof timeZone === "string" ? timeZone : undefined);
}

export function shiftDateOffset(date: string, days: number): string {
  const base = serviceDateOf(canonicalShiftDate(date));
  base.setUTCDate(base.getUTCDate() + days);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`;
}

export function shiftWeekday(date: string): number {
  return serviceDateOf(canonicalShiftDate(date)).getUTCDay();
}

function monthInRange(month: number, from?: number, to?: number) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || !from || !to) return false;
  return from <= to ? month >= from && month <= to : month >= from || month <= to;
}

function seasonalMultiplier(baseline: Baseline | null | undefined, date: string) {
  const seasons = baseline?.seasons;
  if (!seasons) return 1;
  const month = Number(date.slice(5, 7));
  const busy = Array.isArray(seasons.busy) ? seasons.busy : [{ from: seasons.onFrom, to: seasons.onTo }];
  const slow = Array.isArray(seasons.slow) ? seasons.slow : [{ from: seasons.offFrom, to: seasons.offTo }];
  if (busy.some((range) => monthInRange(month, Number(range.from), Number(range.to)))) return 1.15;
  if (slow.some((range) => monthInRange(month, Number(range.from), Number(range.to)))) return 0.85;
  return 1;
}

function numberAt(value: unknown, path: string[]) {
  let current: any = value;
  for (const key of path) current = current?.[key];
  const number = Number(current);
  return Number.isFinite(number) ? number : null;
}

/**
 * Deterministic source of truth for shift volume and operational shape.
 * It only reads tenant-scoped records; LLMs may consume its output but never
 * contribute to it. A short in-process aggregate cache amortizes repeated
 * co-pilot / briefing reads without becoming a correctness dependency.
 */
export async function getShiftIntel(restaurantId: string, date: string): Promise<Dossier> {
  const shiftDate = canonicalShiftDate(date);
  const cacheKey = keyFor(restaurantId, shiftDate);
  // Section plans change independently of a serverless instance. Read the
  // tiny day-staff version before trusting this process's aggregate cache so
  // chat can never answer from a previous section map after a save.
  const roster = await prisma.serviceDayStaff.findUnique({
    where: { restaurantId_serviceDate: { restaurantId, serviceDate: serviceDateOf(shiftDate) } },
    select: { roster: true, sections: true, updatedAt: true },
  });
  const staffVersion = roster?.updatedAt.toISOString() || "none";
  const cached = aggregateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() && cached.staffVersion === staffVersion) return cached.value;

  const serviceDate = serviceDateOf(shiftDate);
  const weekday = shiftWeekday(shiftDate);
  const since = new Date(serviceDate.getTime() - 180 * 24 * 60 * 60 * 1000);
  const [settings, stored, book, history, tables, servers, shifts] = await Promise.all([
    prisma.restaurantSettings.findUnique({ where: { restaurantId }, select: { openMinutes: true, closeMinutes: true, prefs: true } }),
    getStoredForecast(restaurantId, shiftDate),
    prisma.reservation.findMany({
      where: { restaurantId, serviceDate, status: { in: ["UPCOMING", "PARTIALLY_ARRIVED", "SEATED"] } },
      select: { partySize: true, targetTime: true, source: true },
    }),
    prisma.reservation.findMany({
      where: { restaurantId, serviceDate: { gte: since, lt: serviceDate }, status: { in: ["SEATED", "FINISHED"] } },
      select: { serviceDate: true, dayOfWeek: true, partySize: true, source: true, targetTime: true, seatedTime: true, finishedTime: true, turnMinutes: true, tables: { select: { table: { select: { area: true } } } } },
    }),
    prisma.table.findMany({ where: { restaurantId, active: true }, select: { id: true, area: true, capacity: true } }),
    prisma.server.findMany({ where: { restaurantId, active: true }, select: { id: true, name: true, onShift: true, roles: true } }),
    prisma.shift.findMany({ where: { restaurantId, serviceDate }, select: { servers: { select: { serverId: true, coversServed: true } } } }),
  ]);

  const prefs = (settings?.prefs || {}) as { baseline?: Baseline; daysOpen?: boolean[]; turnTime?: string };
  const baseline = prefs.baseline || null;
  const daysOpen = Array.isArray(prefs.daysOpen) && prefs.daysOpen.length === 7 ? prefs.daysOpen.map(Boolean) : [true, true, true, true, true, true, true];
  const closed = !daysOpen[weekday];
  const bookedCovers = book.reduce((sum, row) => sum + row.partySize, 0);

  const days = new Map<string, { covers: number; walkIns: number; weekday: number }>();
  const hourlyCounts = new Array(24).fill(0);
  const zoneCounts = new Map<string, number>();
  const turns: number[] = [];
  const lastOuts: number[] = [];
  for (const row of history) {
    const key = dateKeyOfService(row.serviceDate);
    // Legacy dayOfWeek values were written through multiple date paths. The
    // calendar key is authoritative, so derive the sample weekday from it.
    const item = days.get(key) || { covers: 0, walkIns: 0, weekday: shiftWeekday(key) };
    item.covers += row.partySize;
    if (row.source === "WALK_IN") item.walkIns += row.partySize;
    days.set(key, item);
    const hour = hourOf(row.seatedTime || row.targetTime);
    if (hour != null && hour >= 0 && hour < 24) hourlyCounts[hour] += row.partySize;
    const zone = row.tables[0]?.table?.area || "dining";
    zoneCounts.set(zone, (zoneCounts.get(zone) || 0) + row.partySize);
    if (row.turnMinutes && row.turnMinutes >= 20 && row.turnMinutes <= 360) turns.push(row.turnMinutes);
    const last = minOf(row.finishedTime);
    if (last != null) lastOuts.push(last);
  }
  const serviceDays = [...days.values()];
  const sameWeekday = serviceDays.filter((row) => row.weekday === weekday).map((row) => row.covers);
  const observedWalkShare = serviceDays.reduce((sum, row) => sum + row.walkIns, 0) / Math.max(1, serviceDays.reduce((sum, row) => sum + row.covers, 0));
  const baselineWalkShare = Number.isFinite(Number(baseline?.resSharePct)) ? bounded(1 - Number(baseline?.resSharePct) / 100, 0, 0.95) : null;
  const walkShare = serviceDays.length >= 4 ? bounded(observedWalkShare * 0.75 + (baselineWalkShare ?? observedWalkShare) * 0.25, 0, 0.95) : baselineWalkShare ?? observedWalkShare;

  const storedExpected = stored ? numberAt(stored.payload, ["covers", "expected"]) : null;
  const seasonal = seasonalMultiplier(baseline, shiftDate);
  const historicalBase = sameWeekday.length ? mean(sameWeekday.slice(-10)) : serviceDays.length ? mean(serviceDays.map((row) => row.covers).slice(-21)) : 0;
  const baselineBase = Number.isFinite(Number(baseline?.avgCovers)) ? Number(baseline?.avgCovers) : 0;
  const modeledBase = (historicalBase || baselineBase || bookedCovers) * seasonal;
  const expected = closed ? 0 : Math.max(bookedCovers, Math.round(storedExpected ?? Math.max(modeledBase, bookedCovers / Math.max(0.15, 1 - walkShare))));
  const expectedSource = storedExpected != null ? "predictor" : "model";
  const expectedWalkIns = closed ? 0 : Math.max(0, Math.round(expected - bookedCovers));

  const hourlyTotal = hourlyCounts.reduce((sum, value) => sum + value, 0);
  const bookedByHour = new Array(24).fill(0);
  book.forEach((row) => { const hour = hourOf(row.targetTime); if (hour != null) bookedByHour[hour] += row.partySize; });
  const hourly = Array.from({ length: 14 }, (_, index) => index + 10).map((hour) => {
    const historicalShare = hourlyTotal ? hourlyCounts[hour] / hourlyTotal : ([17, 18, 19, 20, 21].includes(hour) ? 0.2 : 0);
    return { hour, label: toTimeStr(new Date(2000, 0, 1, hour, 0)), booked: bookedByHour[hour], expected: closed ? 0 : Math.max(bookedByHour[hour], Math.round(expected * historicalShare)) };
  }).filter((row) => row.expected > 0 || row.booked > 0);

  const totalSeats = tables.reduce((sum, table) => sum + table.capacity, 0);
  const zoneSeats = new Map<string, number>();
  tables.forEach((table) => zoneSeats.set(table.area || "dining", (zoneSeats.get(table.area || "dining") || 0) + table.capacity));
  const zoneHistoryTotal = [...zoneCounts.values()].reduce((sum, value) => sum + value, 0);
  const sections = [...zoneSeats.entries()].map(([zone, seats]) => {
    const historical = zoneCounts.get(zone) || 0;
    const share = zoneHistoryTotal >= 30 && historical ? historical / zoneHistoryTotal : seats / Math.max(1, totalSeats);
    return { zone, expectedCovers: closed ? 0 : Math.round(expected * share), share: Number(share.toFixed(3)), source: zoneHistoryTotal >= 30 && historical ? "history" : "seat_capacity" };
  }).sort((a, b) => b.expectedCovers - a.expectedCovers);

  const defaultTurn = Number(prefs.turnTime) || Number(baseline?.turnMinutes) || 90;
  const observedTurn = turns.length ? Math.round(mean(turns)) : null;
  const rosterIds = new Set((roster?.roster || []).map((id) => String(id).replace(/^bar:/, "")));
  const activeServers = roster ? servers.filter((server) => rosterIds.has(server.id)) : servers.filter((server) => server.onShift);
  const served = shifts.flatMap((shift) => shift.servers).reduce((sum, row) => sum + row.coversServed, 0);
  const staffingCapacity = activeServers.length ? Math.round(expected / activeServers.length) : null;
  const sectionMap = roster?.sections && typeof roster.sections === "object" && !Array.isArray(roster.sections)
    ? roster.sections as Record<string, string>
    : {};
  const activeServerIds = new Set(activeServers.map((server) => server.id));
  const assignedTables = tables.flatMap((table) => {
    const serverId = sectionMap[String(table.id)];
    return serverId && activeServerIds.has(serverId) ? [{ ...table, serverId }] : [];
  });
  const assignmentBasis = assignedTables.length ? "assigned" : "unassigned";
  const perServerRaw = new Map(activeServers.map((server) => [server.id, { covers: 0, tables: 0, seats: 0, zones: new Set<string>() }]));
  let unassignedExpectedCovers = 0;
  if (assignmentBasis === "assigned") {
    for (const section of sections) {
      const sectionTables = assignedTables.filter((table) => (table.area || "dining") === section.zone);
      const assignedSeats = sectionTables.reduce((sum, table) => sum + table.capacity, 0);
      if (!assignedSeats) {
        unassignedExpectedCovers += section.expectedCovers;
        continue;
      }
      for (const table of sectionTables) {
        const load = perServerRaw.get(table.serverId)!;
        load.covers += section.expectedCovers * table.capacity / assignedSeats;
        load.tables += 1;
        load.seats += table.capacity;
        load.zones.add(section.zone);
      }
    }
  } else if (activeServers.length) {
    for (const server of activeServers) perServerRaw.get(server.id)!.covers = expected / activeServers.length;
  }
  const perServer = activeServers.map((server) => {
    const load = perServerRaw.get(server.id)!;
    return {
      serverId: server.id,
      name: server.name,
      projectedCovers: Math.round(load.covers),
      assignedTables: load.tables,
      assignedSeats: load.seats,
      zones: [...load.zones].sort(),
      basis: assignmentBasis,
    };
  }).sort((a, b) => b.projectedCovers - a.projectedCovers || a.name.localeCompare(b.name));
  const lastTableOutMinutes = lastOuts.length ? Math.round(mean(lastOuts)) : null;
  const value: Dossier = {
    date: shiftDate, closed,
    expectedCovers: { value: expected, source: expectedSource, forecastSource: stored?.source ?? null, generatedAt: stored?.createdAt?.toISOString() ?? null, modeledFrom: expectedSource === "model" ? { sameWeekdayDays: sameWeekday.length, historyDays: serviceDays.length, seasonalMultiplier: seasonal, baselineCovers: baselineBase || null } : null },
    forecast: stored ? { source: stored.source, generatedAt: stored.createdAt.toISOString(), payload: stored.payload } : null,
    reservationVsWalkIn: { bookedCovers, bookedParties: book.length, expectedWalkIns, walkInSharePct: Math.round(walkShare * 100), source: serviceDays.length >= 4 ? "observed history blended with baseline" : baselineWalkShare != null ? "owner baseline" : "observed history" },
    sections, hourly,
    turns: { observedMinutes: observedTurn, defaultMinutes: defaultTurn, effectiveMinutes: observedTurn || defaultTurn, sampleCount: turns.length },
    lastTableOut: { typicalMinutes: lastTableOutMinutes, typical: lastTableOutMinutes == null ? null : toTimeStr(new Date(2000, 0, 1, Math.floor(lastTableOutMinutes / 60), lastTableOutMinutes % 60)), sampleCount: lastOuts.length },
    staffing: { rosteredServers: activeServers.length, expectedCoversPerServer: staffingCapacity, recordedCoversToday: served || 0, assignmentBasis, unassignedExpectedCovers: Math.round(unassignedExpectedCovers), perServer },
    history: { serviceDays: serviceDays.length, sameWeekdayDays: sameWeekday.length },
  };
  aggregateCache.set(cacheKey, { value, staffVersion, expiresAt: Date.now() + CACHE_MS });
  return value;
}

export function invalidateShiftIntel(restaurantId: string, date?: string) {
  if (date) aggregateCache.delete(keyFor(restaurantId, date));
  else for (const key of aggregateCache.keys()) if (key.startsWith(`${restaurantId}:`)) aggregateCache.delete(key);
}
