// lib/db-mappers.ts — translation layer between the frontend's data
// shapes and the Prisma schema.
//
// Design decision (adapter pattern): the API routes speak the FRONTEND's
// dialect — { name, size, time: "7:30pm", date: "YYYY-MM-DD",
// tableId: 7 | "8_9" | null } — and all mapping to the relational model
// (Guest rows, ReservationTable joins, targetTime/serviceDate/dayOfWeek)
// happens here on the server. page.tsx keeps its existing state shapes
// untouched, which is what makes the wiring surgical.

// ── Time & date ──────────────────────────────────────────────────────

/** Parse "7:30p" / "7:30pm" / "12:05am" → minutes since midnight. */
export function parseResMinutes(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})\s*(a|p)m?$/i.exec(String(s).trim());
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if (m[3].toLowerCase() === "p") h += 12;
  return h * 60 + parseInt(m[2], 10);
}

/** Local Date for a booking slot: "YYYY-MM-DD" + "7:30pm" → Date. */
export function buildTargetTime(dateKey: string, timeStr?: string | null): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const mins = parseResMinutes(timeStr) ?? 19 * 60; // unparsable → 7:00pm
  return new Date(y, (m || 1) - 1, d || 1, Math.floor(mins / 60), mins % 60);
}

/** Date → "7:30pm" (reads local parts — symmetric with buildTargetTime). */
export function toTimeStr(dt: Date): string {
  const h24 = dt.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${h12}:${mm}${h24 >= 12 ? "pm" : "am"}`;
}

/** Today's local "YYYY-MM-DD". */
export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * serviceDate is a date-only column (@db.Date). We store it as UTC
 * midnight of the key and read it back via toISOString().slice(0, 10)
 * — one canonical representation, no local/UTC drift in either
 * direction.
 */
export function serviceDateOf(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function dateKeyOfService(serviceDate: Date): string {
  return serviceDate.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, from the date key (local-independent). */
export function dayOfWeekOf(dateKey: string): number {
  return serviceDateOf(dateKey).getUTCDay();
}

// ── Table id bridging ────────────────────────────────────────────────
// The frontend uses numeric table ids (1..14) and joined "8_9" strings
// for merges. The seed creates Table rows whose PKs are those same
// numerals as strings ("1".."14"), so the bridge is a cheap cast.

/** App tableId (7 | "8_9" | null) → DB table id strings. */
export function tableIdToDbIds(tableId: number | string | null | undefined): string[] {
  if (tableId == null || tableId === "unassigned") return [];
  return String(tableId)
    .split("_")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** ReservationTable join rows → app tableId shape. */
export function dbTablesToAppTableId(
  rows: Array<{ tableId: string; isPrimary: boolean }>
): number | string | null {
  if (!rows || rows.length === 0) return null;
  const ordered = [...rows].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return Number(a.tableId) - Number(b.tableId);
  });
  if (ordered.length === 1) return Number(ordered[0].tableId);
  return ordered.map((r) => r.tableId).join("_");
}

// ── Row → app-shape mappers ──────────────────────────────────────────

export function reservationToApp(r: {
  id: string;
  partySize: number;
  targetTime: Date;
  serviceDate: Date;
  notes: string | null;
  status?: string;
  vip?: boolean;
  guest: { name: string };
  tables: Array<{ tableId: string; isPrimary: boolean }>;
}) {
  return {
    id: r.id,
    name: r.guest.name,
    size: r.partySize,
    time: toTimeStr(r.targetTime),
    date: dateKeyOfService(r.serviceDate),
    tableId: dbTablesToAppTableId(r.tables),
    note: r.notes ?? "—",
    vip: r.vip ?? false,
    // Derived chip: the client's tag system (guest-list chips, the AI
    // seat payload's party.tag) keys off this string.
    tag: (r.vip ?? false) ? "VIP" : undefined,
    // The hardcoded "confirmed" here was why a partial mark never
    // survived a reload even once the enum existed.
    status: r.status === "PARTIALLY_ARRIVED" ? ("partially_arrived" as const) : ("confirmed" as const),
  };
}

export function waitlistToApp(w: {
  id: string;
  name: string;
  partySize: number;
  source: string;
  arrivalTime: Date;
}) {
  const isWalkIn = w.source === "WALK_IN";
  return {
    id: w.id,
    name: w.name,
    size: w.partySize,
    type: isWalkIn ? ("walk-in" as const) : ("reservation" as const),
    tag: isWalkIn ? "Walk-in" : "Reservation",
    addedAt: w.arrivalTime.getTime(),
    note: isWalkIn ? "Walk-in" : "Reservation",
  };
}