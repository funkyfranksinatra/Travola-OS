import { prisma } from "@/lib/prisma";
import { canonicalShiftDate, shiftWeekday } from "@/lib/shift-intel";

type ForecastRecord = Record<string, any>;

const asRecord = (value: unknown): ForecastRecord => value && typeof value === "object" && !Array.isArray(value) ? value as ForecastRecord : {};
const asNumber = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const asArray = (value: unknown) => Array.isArray(value) ? value : [];

/**
 * The predictor UI, stored forecasts, and cron all share this compatibility
 * boundary.  Historical weekly rows predate some display fields, so normalize
 * at read time as well as before future writes rather than trusting JSON shape.
 */
export async function normalizeForecastPayload(restaurantId: string, date: string, raw: unknown) {
  const payload = asRecord(raw);
  const shiftDate = canonicalShiftDate(date);
  const [tables, settings] = await Promise.all([
    prisma.table.findMany({ where: { restaurantId, active: true }, select: { capacity: true } }),
    prisma.restaurantSettings.findUnique({ where: { restaurantId }, select: { prefs: true } }),
  ]);
  const timeZone = (settings?.prefs as any)?.location?.timeZone;
  const capacity = { tables: tables.length, seats: tables.reduce((sum, table) => sum + table.capacity, 0) };
  const hourly = asArray(payload.hourly).map((row: unknown, index: number) => {
    const hour = asRecord(row);
    const h = asNumber(hour.h ?? hour.hour, index);
    return {
      ...hour,
      h,
      hour: hour.hour ?? hour.label ?? `${h}:00`,
      booked: asNumber(hour.booked),
      expected: asNumber(hour.expected),
      waitlistRisk: asNumber(hour.waitlistRisk),
    };
  });
  const peakHour = hourly.reduce((best: ForecastRecord | null, hour: ForecastRecord) => !best || hour.expected > best.expected ? hour : best, null);
  const peak = peakHour
    ? { start: String(peakHour.hour), end: String(peakHour.hour), covers: peakHour.expected }
    : { start: "", end: "", covers: 0 };
  const booked = asRecord(payload.booked);
  const covers = asRecord(payload.covers);
  const walkIns = asRecord(payload.walkIns);
  const turn = asRecord(payload.turn);
  const staffing = asRecord(payload.staffing);
  const factors = asRecord(payload.factors);

  return {
    ...payload,
    date: shiftDate,
    dow: asNumber(payload.dow, shiftWeekday(shiftDate)),
    isToday: typeof payload.isToday === "boolean" ? payload.isToday : shiftDate === canonicalShiftDate(new Date(), typeof timeZone === "string" ? timeZone : undefined),
    capacity,
    hourly,
    peak,
    waitlistLikely: typeof payload.waitlistLikely === "boolean" ? payload.waitlistLikely : hourly.some((hour: ForecastRecord) => hour.waitlistRisk >= 0.85),
    covers: {
      expected: asNumber(covers.expected), low: asNumber(covers.low), high: asNumber(covers.high),
      confidence: typeof covers.confidence === "string" ? covers.confidence : "unknown",
      method: typeof covers.method === "string" ? covers.method : "stored forecast",
    },
    booked: { covers: asNumber(booked.covers), parties: asNumber(booked.parties), showRate: asNumber(booked.showRate) },
    walkIns: { expected: asNumber(walkIns.expected), historicalSharePct: asNumber(walkIns.historicalSharePct) },
    turn: { minutes: asNumber(turn.minutes), source: typeof turn.source === "string" ? turn.source : "—" },
    lastTableOut: typeof payload.lastTableOut === "string" ? payload.lastTableOut : "—",
    sections: asArray(payload.sections).map((row: unknown) => {
      const section = asRecord(row);
      return { ...section, zone: String(section.zone || "Dining"), expectedCovers: asNumber(section.expectedCovers), tables: asNumber(section.tables), seats: asNumber(section.seats), shareSrc: typeof section.shareSrc === "string" ? section.shareSrc : "—" };
    }),
    staffing: {
      crew: asNumber(staffing.crew), crewMethod: typeof staffing.crewMethod === "string" ? staffing.crewMethod : "—",
      coversPerServer: staffing.coversPerServer == null ? null : asNumber(staffing.coversPerServer),
      historicalCoversPerServer: staffing.historicalCoversPerServer == null ? null : asNumber(staffing.historicalCoversPerServer),
      verdict: typeof staffing.verdict === "string" ? staffing.verdict : "unknown", addServers: asNumber(staffing.addServers),
    },
    factors: { used: asArray(factors.used), excluded: asArray(factors.excluded) },
  };
}
