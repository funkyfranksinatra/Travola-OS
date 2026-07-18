// @ts-nocheck
'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { buildSectionPlan } from '../utils/assigner'; 
// Note: If Claude named the function something else, use that name here.
// Note 2: If your project uses the '@/' alias, it would be '@/utils/assigner'.

// ─────────────────────────────────────────────────────────────────────
// MesaOS — v1.2 (Web Edition - Clean Build)
// ─────────────────────────────────────────────────────────────────────

// ─── INITIAL DATA ────────────────────────────────────────────────────
// The floor LAYOUT below is infrastructure (positions, capacities) and
// every table starts clean/available. All operational data — the book,
// the waitlist, live occupancy — lives in the database and hydrates on
// mount. The empty INITIAL_RESERVATIONS / INITIAL_WAITLIST constants
// remain only as the offline-fallback shape: if the DB is unreachable
// the app shows an EMPTY book under the offline banner, never fake data.

// Server section accent colors. Same palette used in both the sidebar
// legend dots and the floor-map table edge stripes, so the host can
// match dot ↔ stripe at a glance. Index in onShiftServers maps to index
// here (modulo length). Picked for dark-mode readability against the
// deep panel and table backgrounds.
const SERVER_COLORS = [
  'bg-blue-500',
  'bg-pink-500',
  'bg-amber-500',
  'bg-cyan-500',
  'bg-purple-500',
  'bg-lime-500',
];

// Hex twins of SERVER_COLORS (Tailwind 500 shades), in the SAME order, so a
// member's auto-assigned palette colour resolves to the identical colour
// whether it's drawn as a utility class (sidebar dot) or an inline style
// (floor-map stripe + section tint, which must accept arbitrary custom hex).
const SERVER_COLOR_HEX = ['#3b82f6', '#ec4899', '#f59e0b', '#06b6d4', '#a855f7', '#84cc16'];

// hex (#rrggbb) → rgba() string at the given alpha, for translucent tints.
function hexToRgba(hex, alpha) {
  const m = (hex || '').replace('#', '');
  if (m.length < 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Initials for a section chip: first two letters of a single name, else the
// first letter of the first two words. Caps out at two characters.
function serverInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
// Black or white chip text, whichever is legible on the given hex bg.
function textOnColor(hex) {
  const m = (hex || '').replace('#', '');
  if (m.length < 6) return '#ffffff';
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 0.62 ? '#1a1a1a' : '#ffffff';
}

const INITIAL_TABLES = [
  { id: 1,  name: "T1",  x: 60,  y: 60,  capacity: 4,  shape: 'square', area: 'dining', status: "available", party: null, partySize: null, startedAt: null, groupId: null, assignedServerId: null, floorId: 'f1' },
  { id: 2,  name: "T2",  x: 180, y: 60,  capacity: 2,  shape: 'square', area: 'dining', status: "available", party: null, partySize: null, startedAt: null, groupId: null, assignedServerId: null, floorId: 'f1' },
  { id: 3,  name: "T3",  x: 290, y: 60,  capacity: 4,  shape: 'square', area: 'dining', status: "available", party: null, partySize: null, startedAt: null, groupId: null, assignedServerId: null, floorId: 'f1' },
  { id: 4,  name: "T4",  x: 410, y: 60,  capacity: 6,  shape: 'square', area: 'dining', status: "available", party: null, partySize: null, startedAt: null, groupId: null, assignedServerId: null, floorId: 'f1' },
  { id: 5,  name: "T5",  x: 540, y: 60,  capacity: 2,  shape: 'square', area: 'dining', status: "available", party: null, partySize: null, startedAt: null, groupId: null, assignedServerId: null, floorId: 'f1' },
  { id: 6,  name: "T6",  x: 60,  y: 200, capacity: 8,  shape: 'square', area: 'dining', status: "available", party: null, partySize: null, startedAt: null, groupId: null, assignedServerId: null, floorId: 'f1' },
  { id: 7,  name: "T7",  x: 200, y: 200, capacity: 4,  shape: 'square', area: 'dining', status: "available", party: null, partySize: null, startedAt: null, groupId: null, assignedServerId: null, floorId: 'f1' },
  { id: 8,  name: "T8",  x: 320, y: 200, capacity: 4,  shape: 'square', area: 'dining', status: "available", party: null, partySize: null, startedAt: null, groupId: null, assignedServerId: null, floorId: 'f1' },
  { id: 9,  name: "T9",  x: 440, y: 200, capacity: 6,  shape: 'square', area: 'dining', status: "available", party: null, partySize: null, startedAt: null, groupId: null, assignedServerId: null, floorId: 'f1' },
  { id: 10, name: "T10", x: 560, y: 200, capacity: 2,  shape: 'square', area: 'dining', status: "available", party: null, partySize: null, startedAt: null, groupId: null, assignedServerId: null, floorId: 'f1' },
  { id: 11, name: "T11", x: 60,  y: 340, capacity: 4,  shape: 'square', area: 'dining', status: "available", party: null, partySize: null, startedAt: null, groupId: null, assignedServerId: null, floorId: 'f1' },
  { id: 12, name: "T12", x: 200, y: 340, capacity: 4,  shape: 'square', area: 'dining', status: "available", party: null, partySize: null, startedAt: null, groupId: null, assignedServerId: null, floorId: 'f1' },
  { id: 13, name: "T13", x: 320, y: 340, capacity: 2,  shape: 'square', area: 'dining', status: "available", party: null, partySize: null, startedAt: null, groupId: null, assignedServerId: null, floorId: 'f1' },
  { id: 14, name: "T14", x: 440, y: 340, capacity: 4,  shape: 'square', area: 'dining', status: "available", party: null, partySize: null, startedAt: null, groupId: null, assignedServerId: null, floorId: 'f1' },
];

const INITIAL_WAITLIST = [];

// Host-stand preference defaults — persisted as one Json blob in
// RestaurantSettings.prefs, so adding a knob here never needs a
// database migration.
const DEFAULT_PREFS = {
  twentyFourHour: false,
  soundAlerts: false,
  autoAssign: true,
  confirmSeating: false,
  turnTime: '90',
  resBuffer: '15',
  largeParty: '6',
  holdWindow: '15',
  waitlistSms: true,
  pagerAlerts: false,
  emailDigest: true,
  teamView: false,
  // Location powers the predictor's weather + live web research. The
  // predictor resolves it from here first (then env vars, then a
  // single-tenant default). Seeded with the current pilot venue so the
  // signals work out of the box; editable in Settings → Location.
  location: {
    name: "Volario's",
    lat: '39.9197758',
    lon: '-105.7904009',
    address: '',
  },
};

const INITIAL_RESERVATIONS = [];

const PREDICTOR_HOURS = [
  { hour: "4p",  predicted: 12, actual: 14   },
  { hour: "5p",  predicted: 28, actual: 26   },
  { hour: "6p",  predicted: 45, actual: 47   },
  { hour: "7p",  predicted: 78, actual: 82, isNow: true },
  { hour: "8p",  predicted: 95, actual: null, marker: { label: "Flight rush", sub: "DEN +27%" } },
  { hour: "9p",  predicted: 64, actual: null },
  { hour: "10p", predicted: 28, actual: null },
];

const AVG_TURN_MIN = 65;
const MERGE_TURN_PENALTY = 12;
const AVG_CHECK = 50;
const LARGE_PARTY_PREMIUM = 1.15;

// ─── HELPERS ─────────────────────────────────────────────────────────

const stateMeta = {
  available: { label: "Available",    text: "text-state-avail",    border: "border-state-avail/60",    bg: "bg-state-availBg/40",    color: "#52d68d" },
  dining:    { label: "Dining",       text: "text-state-dining",    border: "border-state-dining/55",   bg: "bg-state-diningBg/40",   color: "#f5c542" },
  seated:    { label: "Just seated", text: "text-state-seated",    border: "border-state-seated/55",   bg: "bg-state-seatedBg/40",   color: "#f25c5c" },
  reserved:  { label: "Reserved",    text: "text-state-reserved", border: "border-state-reserved/50", bg: "bg-state-reservedBg/40", color: "#c08aff" },
};

// ─── Table dimensions system ─────────────────────────────────────────
// Two helpers consume the same underlying TABLE_DIMS table:
//   getTableDimensions: returns a Tailwind class string for the div.
//     Strictly literal class names — no string interpolation — so the
//     JIT compiler scans and includes them at build time.
//   getTableSizePx: returns numeric {width, height} for layout math
//     (group-line endpoints, drag-bound calculations, etc.).
//
// Round and square share a 3-bucket capacity scheme (small/medium/large
// for cap 2 / 4 / 6+). Rectangle has 4 buckets since wider tables
// accommodate more seats horizontally without growing taller.

const TABLE_DIMS = {
  round: {
    small:   { w: 64,  h: 64, cls: 'w-16 h-16 rounded-full' },  // cap ≤ 2
    medium:  { w: 80,  h: 80, cls: 'w-20 h-20 rounded-full' },  // cap ≤ 4
    large:   { w: 96,  h: 96, cls: 'w-24 h-24 rounded-full' },  // cap ≥ 5
  },
  square: {
    small:   { w: 64,  h: 64, cls: 'w-16 h-16 rounded-md' },
    medium:  { w: 80,  h: 80, cls: 'w-20 h-20 rounded-md' },
    large:   { w: 96,  h: 96, cls: 'w-24 h-24 rounded-md' },
  },
  rectangle: {
    small:   { w: 80,  h: 64, cls: 'w-20 h-16 rounded-md' },    // cap ≤ 2
    medium:  { w: 112, h: 64, cls: 'w-28 h-16 rounded-md' },    // cap ≤ 4
    large:   { w: 144, h: 64, cls: 'w-36 h-16 rounded-md' },    // cap ≤ 6
    xlarge:  { w: 176, h: 64, cls: 'w-44 h-16 rounded-md' },    // cap ≥ 7
  },
};

function tableBucket(shape, capacity) {
  if (shape === 'rectangle') {
    if (capacity <= 2) return 'small';
    if (capacity <= 4) return 'medium';
    if (capacity <= 6) return 'large';
    return 'xlarge';
  }
  if (capacity <= 2) return 'small';
  if (capacity <= 4) return 'medium';
  return 'large';
}

function getTableDimensions(shape, capacity) {
  const s = shape || 'square';
  return TABLE_DIMS[s][tableBucket(s, capacity)].cls;
}

function getTableSizePx(shape, capacity) {
  const s = shape || 'square';
  const d = TABLE_DIMS[s][tableBucket(s, capacity)];
  return { width: d.w, height: d.h };
}

const elapsedMin = (table, now) =>
  table.startedAt ? Math.floor((now - table.startedAt) / 60_000) : 0;

const groupSize = (groupId, tables) =>
  groupId ? tables.filter(t => t.groupId === groupId).length : 1;

const groupTurnMin = (table, tables) =>
  AVG_TURN_MIN + Math.max(0, groupSize(table.groupId, tables) - 1) * MERGE_TURN_PENALTY;

const remainingMin = (table, now, tables) => {
  if (!table.startedAt || (table.status !== "dining" && table.status !== "seated")) return null;
  return Math.max(0, groupTurnMin(table, tables) - Math.floor((now - table.startedAt) / 60_000));
};

const getGroupTables = (groupId, tables) =>
  groupId ? tables.filter(t => t.groupId === groupId) : [];

const getEffectiveCapacity = (table, tables) =>
  table.groupId
    ? tables.filter(t => t.groupId === table.groupId).reduce((s, t) => s + t.capacity, 0)
    : table.capacity;

// ── Merge adjacency: TOPOLOGICAL, not metric ─────────────────────────
// Two tables are adjacent when they are each other's natural neighbors,
// regardless of absolute distance — formally the Gabriel graph: a and b
// are adjacent iff no third table's center lies strictly inside the
// circle whose diameter is the segment ab. Scale-free and parameter-
// free: neighbors across a wide empty gap connect (sparse migrated
// patios), while any table sitting between two others blocks them (no
// merging across the dining room). Grid diagonals stay adjacent because
// the two orthogonal common neighbors land exactly ON the circle, and
// only strictly-inside centers block.
function tableCenter(t) {
  const s = getTableSizePx(t.shape, t.capacity);
  return { cx: t.x + s.width / 2, cy: t.y + s.height / 2 };
}

function areTablesAdjacent(a, b, floorTables = null) {
  const A = tableCenter(a), B = tableCenter(b);
  const mx = (A.cx + B.cx) / 2, my = (A.cy + B.cy) / 2;
  const r2 = ((A.cx - B.cx) ** 2 + (A.cy - B.cy) ** 2) / 4;
  if (!Array.isArray(floorTables)) return true;
  const EPS = 1e-6;
  for (const c of floorTables) {
    if (c === a || c === b || c.id === a.id || c.id === b.id) continue;
    const C = tableCenter(c);
    const d2 = (C.cx - mx) ** 2 + (C.cy - my) ** 2;
    if (d2 < r2 - EPS) return false; // a table sits between them
  }
  return true;
}

// A merge selection is valid only as ONE contiguous block: every table
// reachable from the first via adjacency hops. Selection is gated
// incrementally on click, but deselecting a middle table can split the
// set — this is the confirm-time safety net.
function isSelectionContiguous(ids, tables) {
  if (ids.length < 2) return true;
  const sel = ids.map(id => tables.find(t => t.id === id)).filter(Boolean);
  if (sel.length !== ids.length) return false;
  const floorTables = tables.filter(t => t.floorId === sel[0].floorId);
  const seen = new Set([sel[0].id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of sel) {
      if (seen.has(t.id)) continue;
      if (sel.some(s => seen.has(s.id) && areTablesAdjacent(s, t, floorTables))) { seen.add(t.id); grew = true; }
    }
  }
  return seen.size === sel.length;
}

// ── Reservation conflicts (date-aware assignment) ───────────────────
// A table conflicts with a proposed booking when any OTHER reservation
// on the same service date sits within RES_CONFLICT_MIN minutes of the
// proposed time and is attached to that table — directly (tableId) or as
// a member of a joined "i_j" merge id. Undated reservations are today's.
const RES_CONFLICT_MIN = 60;
function tableHasReservationConflict(table, proposed, allReservations, todayStr) {
  if (!proposed) return false;
  const pDate = proposed.date || todayStr;
  const pMin = parseResMinutes(proposed.time);
  if (pMin == null) return false;
  return (allReservations || []).some(r => {
    if (r.id === proposed.id) return false;
    if (r.tableId == null) return false;
    const rDate = r.date || todayStr;
    if (rDate !== pDate) return false;
    if (!String(r.tableId).split('_').includes(String(table.id))) return false;
    const rMin = parseResMinutes(r.time);
    if (rMin == null) return false;
    return Math.abs(rMin - pMin) < RES_CONFLICT_MIN;
  });
}

const groupTableLabel = (table, tables) =>
  table.groupId
    ? getGroupTables(table.groupId, tables).map(t => t.name).join(" + ")
    : table.name;

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────

// Most recent daily service-reset tick: one hour before opening, or
// 4:00 AM when hours are unset. Live floor state (occupied / bussing /
// merges) saved before this moment belongs to a previous service day.
// Mirrored in app/api/floor/route.ts — keep the two in sync.
// Service-day reset: 90 minutes AFTER close. Live state (occupancy,
// merges, server sections) belongs to one service day and clears at this
// tick. When close < open the restaurant runs past midnight, so the
// reset lands on the NEXT calendar day — handled by adding 1440 to close
// before the +90 when needed. Falls back to 4:00 AM when hours unset.
function latestServiceResetBoundary(nowMs, openMinutes, closeMinutes) {
  let resetMin;
  if (closeMinutes == null) {
    resetMin = openMinutes == null ? 4 * 60 : (openMinutes - 60 + 1440) % 1440;
  } else {
    const overnight = openMinutes != null && closeMinutes <= openMinutes;
    resetMin = ((closeMinutes + (overnight ? 1440 : 0)) + 90) % 1440;
  }
  const d = new Date(nowMs);
  const tick = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(resetMin / 60), resetMin % 60);
  if (tick.getTime() > nowMs) tick.setDate(tick.getDate() - 1);
  return tick.getTime();
}

// The [start, end] wall-clock window (ms epoch) of the service shift that
// a given local day belongs to. For a normal shift it's [open, close] on
// that day; for a past-midnight shift the end extends into the next
// calendar day. Used to scope a table's Schedule to the current shift and
// to decide whether server sections may carry into an overnight rollover.
function shiftWindowFor(dateKey, openMinutes, closeMinutes) {
  if (openMinutes == null || closeMinutes == null) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  const base = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const overnight = closeMinutes <= openMinutes;
  return {
    start: base + openMinutes * 60000,
    end: base + (closeMinutes + (overnight ? 1440 : 0)) * 60000,
    overnight,
  };
}

// SSR-safe gate for time-derived text. The server render and the
// client's hydration render evaluate Date.now() at different moments,
// so any "Xm ago" / clock string differs between the two and React 19
// throws a hydration-mismatch error. Components render a placeholder
// for that single pre-mount frame and swap in the live value after.
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}

function Header({ now, activeTab, setActiveTab, occupancy, coversToday = null, onOpenService, hostMode = false }) {
  const mounted = useMounted();
  const time = new Date(now).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const date = new Date(now).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <header className="flex items-center px-6 h-14 bg-panel border-b border-border flex-shrink-0">
      <div className="flex items-baseline gap-2.5 mr-8">
        <span className="font-display text-base font-bold tracking-wide text-ai">MesaOS</span>
        <span className="font-mono text-[9px] text-ink-400 tracking-[0.2em] uppercase">{hostMode ? 'Host' : 'v1.2'}</span>
      </div>
      <nav className="flex h-full items-stretch">
        {/* Host mode is the front-of-house app: no settings tab (floor-
            plan, staff, hours live on the manager website). Predictor
            stays — expected volume is exactly what a host plans around. */}
        {(hostMode
          ? ["floor", "timeline", "waitlist", "service", "predictor", "calendar"]
          : ["floor", "timeline", "waitlist", "service", "predictor", "calendar", "settings"]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 text-[10.5px] font-bold tracking-[0.12em] uppercase border-b-2 transition-colors ${
              activeTab === t ? "border-ai text-ai" : "border-transparent text-ink-400 hover:text-ink-50"
            }`}
          >{t}</button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-5">
        <div className="font-mono text-xs text-ink-400">
          <span className="text-ink-50 font-semibold tabular-nums">{mounted ? time : '—:—'}</span>
          <span className="mx-2 text-border-hi">·</span>{mounted ? date : ''}
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-panel-card border border-border-hi rounded font-mono text-[10px] text-ink-50">
          {coversToday != null && (
            <button
              onClick={onOpenService}
              className="flex items-center gap-1.5 mr-3 pr-3 border-r border-border-hi hover:text-ink-50 transition-colors"
              title="Open the service log"
            >
              <span className="text-ink-400">Covers</span>
              <span className="font-semibold tabular-nums text-state-avail">{coversToday}</span>
            </button>
          )}
          <span className="text-ink-400">Floor</span>
          <span className="font-semibold tabular-nums">{occupancy.occupied}/{occupancy.total}</span>
          <span className="text-ai">{Math.round((occupancy.occupied / occupancy.total) * 100)}%</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-state-availBg border border-state-avail rounded text-[9px] font-mono text-state-avail tracking-[0.1em] font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-state-avail animate-pulse" />LIVE
        </div>
      </div>
    </header>
  );
}

// ─── Per-role shift encoding ─────────────────────────────────────────
// The per-day roster is a flat serverId[] in the DB (ServiceDayStaff.
// roster). To distinguish "on shift as bartender" from "on shift as
// waiter" WITHOUT a schema migration, bartender-shift membership is
// encoded as a prefixed entry: "bar:<id>". Plain "<id>" = waiter shift.
// Legacy rows (plain id for a bartender-only member) are inferred from
// the member's roles, so old data keeps working unchanged.
const BAR_ROSTER_PREFIX = 'bar:';
function rosterShiftRole(roster, member) {
  if (!member) return null;
  const list = Array.isArray(roster) ? roster : [];
  if (list.includes(BAR_ROSTER_PREFIX + member.id)) return 'bartender';
  if (list.includes(member.id)) {
    const roles = member.roles || [];
    // Legacy inference: a plain entry for a bartender-only member means
    // they were shifted on as a bartender before roles were encoded.
    return roles.includes('bartender') && !roles.includes('waiter') ? 'bartender' : 'waiter';
  }
  return null;
}

function ServerRow({ server, onToggle, onShiftToggle = null, onAiLockToggle = null, isAssignMode = false, isAssignSelected = false, dimmed = false, colorClass = null, colorStyle = null, showBarTag = true }) {
  const on = server.onShift;
  const baseCls = "group flex items-center justify-between px-3 py-2 transition-colors";
  const stateCls = dimmed
    ? "opacity-40 cursor-not-allowed"
    : isAssignSelected
    ? "bg-ai-bg/40 ring-1 ring-ai/60 cursor-pointer"
    : "cursor-pointer hover:bg-gray-800/60";

  // Row body click. stopPropagation here matters when this click is
  // setting viewingServerId — without it, the same click would bubble
  // to the document-level dismiss listener and clear what we just set.
  const handleRowClick = (e) => {
    if (dimmed) return;
    e.stopPropagation();
    onToggle && onToggle(server.id);
  };

  // Toggle switch click. Independent from row-body click: when
  // onShiftToggle is provided, clicks on the switch only toggle shift
  // and never trigger the row's view-mode/assign-select action.
  const handleToggleClick = onShiftToggle
    ? (e) => { e.stopPropagation(); onShiftToggle(server.id); }
    : undefined;

  return (
    <div onClick={handleRowClick} className={`${baseCls} ${stateCls}`}>
      <div className="flex items-center gap-2 min-w-0">
        {/* Color dot — present only for on-shift servers; acts as visual
            legend for the matching edge stripes on the floor map. */}
        {(colorStyle || colorClass) && (
          <span
            className={`w-3 h-3 rounded-full shadow-sm flex-shrink-0 ${colorStyle ? '' : colorClass}`}
            style={colorStyle ? { backgroundColor: colorStyle } : undefined}
            aria-hidden="true"
          />
        )}
        <span className={`text-[13px] truncate ${on ? "text-white font-medium" : "text-gray-300"}`}>
          {server.name}
        </span>
        {/* AI-exclusion badge: the lock is reserved for online-booking
            blocks, so dedicated service uses the red AI prohibition mark. */}
        {onAiLockToggle && (
          <span
            onClick={(e) => { e.stopPropagation(); onAiLockToggle(server.id, !server.aiExcluded); }}
            className={`flex-shrink-0 text-[16px] leading-none cursor-pointer transition-opacity px-1.5 py-1 -my-1 rounded-md hover:bg-panel-up ${
              server.aiExcluded ? 'opacity-100' : 'opacity-0 group-hover:opacity-50 hover:!opacity-100'
            }`}
            title={server.aiExcluded
              ? 'Excluded from AI auto-assign (dedicated service) — click to include'
              : 'Click to exclude from AI auto-assign (dedicated service)'}
            role="button"
            aria-label="Toggle AI exclusion"
          >{server.aiExcluded ? 'AI⊘' : 'AI'}</span>
        )}
        {/* Role tag — only renders for bartenders, and only where the
            row is shown in a bartender context (showBarTag). The waiter
            roster passes showBarTag=false so a dual-role member doesn't
            carry bar noise into the waiter section. */}
        {showBarTag && (server.roles || []).includes('bartender') && (
          <span className="font-mono text-[8.5px] tracking-[0.1em] uppercase px-1 py-0.5 rounded bg-amber-700/30 border border-amber-700/50 text-amber-300 flex-shrink-0">
            Bar
          </span>
        )}
      </div>
      {/* In assign mode the toggle becomes a quieter status indicator.
          When onShiftToggle is wired, the widget is its own click target
          (clicks don't bubble to the row body, so toggling shift never
          triggers view mode). */}
      <div
        role="switch"
        aria-checked={on}
        onClick={handleToggleClick}
        className={`relative w-9 h-5 rounded-full transition-colors duration-300 flex-shrink-0 ${
          on ? "bg-emerald-800" : "bg-rose-900"
        } ${isAssignMode ? "opacity-50" : ""} ${onShiftToggle ? "cursor-pointer" : ""}`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${
            on ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </div>
    </div>
  );
}

function Sidebar({ waitlist, reservations, selectedPartyId, setSelectedPartyId, selectedReservationId, setSelectedReservationId, deleteReservation, deleteWaitlistItem, openModal, openWalkIn, reservationsDisabled = false, walkInDisabled = false, staffReadOnly = false, now, aiReason, servers = [], addServer, toggleServerShift, setServerAiExcluded = null, onPartyDragStart, onPartyDragEnd, onPartyTouchStart = null, partyRowsDraggable = true, isAssignMode = false, setIsAssignMode, assignSelectedServer = null, setAssignSelectedServer, handleAIAssign, aiAssignLoading = false, setEditMode, setMergeMode, setMergeSelection, setViewingServerId, sectionView = false, setSectionView }) {
  const mounted = useMounted();

  const onShiftServers = servers.filter(s => s.onShift);
  const offShiftServers = servers.filter(s => !s.onShift);

  // Color lookup: an on-shift server's index in onShiftServers maps to
  // SERVER_COLORS. The same function is mirrored in FloorMap so the
  // sidebar dot matches the floor-map edge stripe for the same server.
  // Returns null for unknown or off-shift servers so callers can simply
  // skip rendering the accent.
  const getServerColor = (serverId) => {
    const idx = onShiftServers.findIndex(s => s.id === serverId);
    return idx === -1 ? null : SERVER_COLORS[idx % SERVER_COLORS.length];
  };


  // Role-filtered slices for the two stacked sections. The combined
  // onShiftServers / offShiftServers above stay too — getServerColor
  // and the assign-mode disable checks still need the all-roles view.
  const bartendersList = servers.filter(s => (s.roles || []).includes('bartender'));
  // Waiters list = anyone tagged 'waiter' OR anyone who isn't a bartender
  // (no-role / custom-role members default here). A bartender+waiter
  // therefore shows in BOTH lists, so they can still be picked and assigned
  // a section as a waiter on a day they aren't bartending.
  const waitersList    = servers.filter(s => (s.roles || []).includes('waiter') || !(s.roles || []).includes('bartender'));
  // Per-role shift split. A dual-role member is on shift in exactly ONE
  // section at a time (s.shiftRole says which); the other section shows
  // them in its off-shift pool so they can be flipped over with one tap.
  const onShiftBartenders  = bartendersList.filter(s => s.onShift && s.shiftRole === 'bartender');
  const offShiftBartenders = bartendersList.filter(s => !(s.onShift && s.shiftRole === 'bartender'));
  const onShiftWaiters     = waitersList.filter(s => s.onShift && s.shiftRole !== 'bartender');
  const offShiftWaiters    = waitersList.filter(s => !(s.onShift && s.shiftRole !== 'bartender'));

  // Shared roster renderer — captures isAssignMode, toggles, and
  // getServerColor by closure so both sections use identical row
  // behavior. The on-shift / divider / off-shift pattern is the
  // existing logic, just lifted out so we render it twice.
  const renderRoster = (onShift, offShift, role = 'waiter') => (
    <div className="bg-panel-card rounded-xl overflow-hidden">
      {onShift.map(s => (
        <ServerRow
          key={s.id}
          server={s}
          onToggle={
            isAssignMode
              ? () => setAssignSelectedServer && setAssignSelectedServer(s.id)
              : () => setViewingServerId && setViewingServerId(s.id)
          }
          onShiftToggle={staffReadOnly ? null : (id) => toggleServerShift(id, role)}
          onAiLockToggle={staffReadOnly ? null : setServerAiExcluded}
          isAssignMode={isAssignMode}
          isAssignSelected={isAssignMode && assignSelectedServer === s.id}
          colorClass={getServerColor(s.id)}
          colorStyle={s.color || null}
          showBarTag={role === 'bartender'}
        />
      ))}
      {onShift.length > 0 && offShift.length > 0 && (
        <div className="border-t border-gray-700 my-1" />
      )}
      {offShift.map(s => (
        <ServerRow
          key={s.id}
          server={{ ...s, onShift: false }}
          onToggle={isAssignMode ? () => {} : (id) => toggleServerShift(id, role)}
          onAiLockToggle={staffReadOnly ? null : setServerAiExcluded}
          isAssignMode={isAssignMode}
          isAssignSelected={false}
          dimmed={isAssignMode}
          showBarTag={role === 'bartender'}
        />
      ))}
    </div>
  );

  return (
    <aside className="w-[300px] bg-panel border-r border-border flex flex-col flex-shrink-0 relative">
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        {openWalkIn && (
          <button
            onClick={openWalkIn}
            className={`w-full py-3 rounded-xl font-mono text-[11px] uppercase tracking-[0.12em] font-bold border transition-all flex items-center justify-center gap-2 ${walkInDisabled ? 'bg-panel-card text-ink-400 border-border-hi opacity-50 cursor-not-allowed' : 'bg-ai text-bg border-gray-500 hover:opacity-90 active:scale-[0.99] shadow-lg shadow-ai/20'}`}
          >
            <span className="text-base leading-none">⚡</span>
            <span>Walk-In · Quick Seat</span>
          </button>
        )}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-400 font-bold">Guest List</h3>
            <span className="font-mono text-[9px] text-ink-400">
              <span className="text-state-avail">{waitlist.length} here</span>
              <span className="opacity-50"> · </span>
              <span className="text-state-reserved">{reservations.length} booked</span>
              <span className="opacity-50"> · </span>
              {/* Total people in the queue — party COUNTS above, people
                  (covers) here. Sums both pools so a host reading the
                  header knows how many bodies are actually coming, which
                  is what drives capacity, not the number of bookings. */}
              <span className="text-ink-200">
                {waitlist.reduce((s, a) => s + (Number(a.size) || 0), 0)
                  + reservations.reduce((s, r) => s + (Number(r.size) || 0), 0)} guests
              </span>
            </span>
          </div>

          {waitlist.length === 0 && reservations.length === 0 ? (
            <div className="text-center py-6 text-[12px] italic text-ink-400">No guests in queue</div>
          ) : (
            <div className="bg-panel-card border border-border rounded-xl overflow-hidden">
              {/* Unified queue: waitlist (here-now) first, then reservations (scheduled).
                  Each item carries _kind so the row can show the right metadata and the
                  right delete affordance. Seating logic in Home (attemptSeat / performSeat)
                  already routes by id across both arrays — UI just needs to surface them. */}
              {[
                ...waitlist.map(a => ({ ...a, _kind: 'arrival' })),
                ...reservations.map(r => ({ ...r, _kind: 'reservation' })),
              ].map(item => {
                const isArrival = item._kind === 'arrival';
                // Unified party-details model: every row opens the
                // ReservationDetailsSidebar (treated as the unified
                // Party Details panel). Selection state is driven by
                // selectedReservationId for every kind of item now.
                const isSelected = selectedReservationId === item.id;
                const wait = isArrival ? Math.floor((now - item.addedAt) / 60_000) : null;
                // Tag chips apply to EVERY row kind — the old isArrival
                // gate meant a VIP reservation carried the tag but the
                // row silently dropped it. VIP restyled amber to match
                // the panel's badge.
                const tagColor = ({
                  VIP:         "bg-amber-400/15 text-amber-300 border border-amber-400/40",
                  Regular:     "bg-state-availBg/40 text-state-avail",
                  "Pre-order": "bg-state-diningBg/40 text-state-dining",
                  "Walk-in":   "bg-ai-bg/40 text-ai",
                }[item.tag]) || null;
                // Reservation badge: explicit "Partial" pill when the
                // status is partially_arrived. Shown inline with the
                // name so the host doesn't have to open the panel to
                // see it at a glance.
                const showPartialBadge = !isArrival && item.status === 'partially_arrived';

                return (
                  <div
                    key={item.id}
                    data-reservation-row
                    draggable={partyRowsDraggable}
                    onDragStart={(e) => {
                      // Carry the party id; the table tiles read this on drop.
                      e.dataTransfer.setData('application/mesa-party', String(item.id));
                      e.dataTransfer.effectAllowed = 'move';
                      onPartyDragStart && onPartyDragStart(item);
                    }}
                    onDragEnd={() => { onPartyDragEnd && onPartyDragEnd(); }}
                    // Touch path: press-and-hold lifts the party into a
                    // finger-following chip (see beginPartyTouchDrag in
                    // Home). Quick taps still fall through to onClick.
                    onTouchStart={onPartyTouchStart ? (e) => onPartyTouchStart(e, item) : undefined}
                    style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
                    onClick={() => {
                      // Every party — walk-in OR reservation — opens
                      // the unified Party Details sidebar. The seating
                      // co-pilot only fires when the host explicitly
                      // hits "Seat now →" inside that panel, so we
                      // explicitly clear selectedPartyId here to avoid
                      // any leftover cyan pulse from a prior session.
                      setSelectedPartyId(null);
                      setSelectedReservationId && setSelectedReservationId(isSelected ? null : item.id);
                    }}
                    className={`relative group flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0 transition-colors cursor-pointer ${
                      isSelected ? "bg-ai-bg/40 ring-1 ring-ai/40" : "hover:bg-panel-up"
                    }`}
                  >
                    {/* Time column: wait for waitlist (green), scheduled for reservations (purple) */}
                    <span className={`font-mono text-[11px] font-semibold tabular-nums w-12 flex-shrink-0 ${
                      isArrival ? "text-state-avail" : "text-state-reserved"
                    }`}>
                      {isArrival ? (mounted ? `${wait}m` : '\u2014') : item.time}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[13px] text-ink-50 font-medium truncate">{item.name}</span>
                        {tagColor && (
                          <span className={`px-1 py-0.5 rounded text-[8.5px] font-mono font-semibold tracking-[0.06em] uppercase flex-shrink-0 ${tagColor}`}>
                            {item.tag}
                          </span>
                        )}
                        {showPartialBadge && (
                          <svg
                            role="img"
                            aria-label="Partially arrived"
                            className="absolute top-0 right-7 w-3.5 h-6 text-amber-400 drop-shadow-[0_1px_3px_rgba(251,191,36,0.4)] pointer-events-none"
                            viewBox="0 0 14 24" fill="currentColor"
                          >
                            <title>Partially arrived</title>
                            <path d="M0 0h14v22l-7-5-7 5V0z" />
                          </svg>
                        )}
                      </div>
                      <div className="text-[10px] text-ink-400 truncate">
                        Party of <strong className="text-ink-50/80">{item.size}</strong>
                        {item.note && <> · {item.note}</>}
                      </div>
                    </div>

                    {/* Delete affordance — reservations and waitlist parties
                        both confirm before removal (gated in Home). */}
                    <button
                      onClick={(e) => { e.stopPropagation(); isArrival ? (deleteWaitlistItem && deleteWaitlistItem(item.id)) : (deleteReservation && deleteReservation(item.id)); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-400 hover:text-state-seated text-sm leading-none px-1 flex-shrink-0"
                      aria-label={isArrival ? "Remove from waitlist" : "Delete reservation"}
                    >×</button>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={openModal}
            className={`w-full mt-3 px-3 py-2.5 rounded-lg border border-dashed text-[12px] font-medium transition-colors flex items-center justify-center gap-1.5 ${reservationsDisabled ? 'border-border-hi text-ink-500 opacity-50 cursor-not-allowed' : 'border-gray-600 text-gray-400 hover:bg-gray-800 hover:text-gray-200 hover:border-gray-500'}`}
            aria-label="Add reservation"
          >
            <span className="text-base leading-none">+</span>
            <span>Add Reservation</span>
          </button>

          {selectedPartyId && (
            <div className="mt-3 p-3 rounded-lg bg-ai-bg/40 border border-ai/40">
              <div className="font-mono text-[8.5px] text-ai tracking-[0.15em] uppercase mb-1.5 font-bold">
                ◆ Click any available table
              </div>
              <div className="text-[11.5px] text-ink-50/90 leading-relaxed">
                AI suggests <strong className="text-ai">cyan pulsing</strong> tables that fit. Click any other available table to <strong className="text-ink-50">force seat</strong>.
              </div>
              {aiReason && (
                <div className="mt-2.5 pt-2.5 border-t border-ai/20 text-[11.5px] text-ink-50/85 leading-relaxed italic">
                  <span className="text-ai not-italic font-mono text-[8.5px] tracking-[0.15em] uppercase mr-1.5 font-bold">Reason</span>
                  {aiReason}
                </div>
              )}
            </div>
          )}
        </section>

        <div className="border-t border-gray-700 my-6" />

        <section>
          {/* Top-level assignment controls — apply to ALL on-shift staff
              regardless of role, so they live above both sub-sections. */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => {
                if (isAssignMode) {
                  // Exit assign mode
                  setIsAssignMode && setIsAssignMode(false);
                  setAssignSelectedServer && setAssignSelectedServer(null);
                } else {
                  // Enter assign mode + clear competing modes so
                  // handleTableClick doesn't swallow assign clicks at
                  // the editMode early-return.
                  setIsAssignMode && setIsAssignMode(true);
                  setAssignSelectedServer && setAssignSelectedServer(null);
                  setEditMode && setEditMode(false);
                  setMergeMode && setMergeMode(false);
                  setMergeSelection && setMergeSelection([]);
                }
              }}
              disabled={onShiftServers.length === 0}
              className={
                isAssignMode
                  ? "px-2.5 py-2 rounded-lg bg-ai text-bg border border-ai font-mono text-[11px] font-bold uppercase tracking-[0.06em] shadow-lg shadow-ai/30 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  : "px-2.5 py-2 rounded-lg bg-panel-card border border-gray-700 text-gray-300 text-[11px] font-medium hover:bg-gray-800 hover:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              }
            >
              {isAssignMode ? "✓ Done Assigning" : "Manual Assign"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleAIAssign(); }}
              disabled={onShiftServers.length === 0}
              title="Deterministically assign all tables to servers by zone + geography + cover balance"
              className="px-2.5 py-2 rounded-lg bg-ai-bg/40 border border-ai/40 text-ai text-[11px] font-mono font-bold uppercase tracking-[0.06em] hover:bg-ai/20 hover:border-ai/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ⚡ Auto-Assign
            </button>
            {/* Section View — global heatmap toggle. Independent from
                viewingServerId (the per-server filter). When active,
                every assigned table on every floor gets a server-keyed
                color tint. data-section-toggle pairs with the auto-
                dismiss listener's carve-out so clicking the toggle
                doesn't immediately self-dismiss. */}
            <button
              data-section-toggle
              onClick={(e) => {
                e.stopPropagation();
                setSectionView && setSectionView(prev => !prev);
                // Clear any single-server filter — Section View shows
                // EVERYONE, so a lingering per-server filter would be
                // visually confusing.
                setViewingServerId && setViewingServerId(null);
              }}
              disabled={onShiftServers.length === 0}
              title={sectionView ? 'Hide section heatmap' : 'Show all server sections at once'}
              className={
                sectionView
                  ? "px-2.5 py-2 rounded-lg bg-ai text-bg border border-ai font-mono text-[11px] font-bold uppercase tracking-[0.06em] shadow-lg shadow-ai/30 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  : "px-2.5 py-2 rounded-lg bg-panel-card border border-gray-700 text-gray-300 text-[11px] font-medium hover:bg-gray-800 hover:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              }
            >
              {sectionView ? "✓ Sections" : "Sections"}
            </button>
          </div>

          {isAssignMode && (
            <div className="mb-3 p-2.5 rounded-lg bg-ai-bg/30 border border-ai/40">
              <div className="font-mono text-[9px] text-ai tracking-[0.15em] uppercase font-bold mb-1.5">◆ Assign Mode</div>
              <div className="text-[11px] text-ink-50/85 leading-relaxed">
                {assignSelectedServer
                  ? <>Assigning to <strong className="text-ai">{servers.find(s => s.id === assignSelectedServer)?.name}</strong>. Click any table on the map to add it to their section.</>
                  : <>Pick an <strong className="text-white">on-shift</strong> waiter below, then click tables to assign them.</>
                }
              </div>
            </div>
          )}

          {/* ─── Bartenders ─────────────────────────────────────── */}
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-400 font-bold">Bartenders</h3>
            <span className="font-mono text-[9px] text-ink-400 tabular-nums">
              <span className="text-state-avail">{onShiftBartenders.length}</span>
              <span className="opacity-50"> / {bartendersList.length}</span>
            </span>
          </div>

          {bartendersList.length === 0 ? (
            <div className="text-center py-3 text-[11px] italic text-ink-400 bg-panel-card rounded-xl">No bartenders added</div>
          ) : (
            renderRoster(onShiftBartenders, offShiftBartenders, 'bartender')
          )}


          {/* ─── Waiters ────────────────────────────────────────── */}
          <div className="flex items-baseline justify-between mb-2 mt-8">
            <h3 className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-400 font-bold">Waiters</h3>
            <span className="font-mono text-[9px] text-ink-400 tabular-nums">
              <span className="text-state-avail">{onShiftWaiters.length}</span>
              <span className="opacity-50"> / {waitersList.length}</span>
            </span>
          </div>

          {waitersList.length === 0 ? (
            <div className="text-center py-3 text-[11px] italic text-ink-400 bg-panel-card rounded-xl">No waiters added</div>
          ) : (
            renderRoster(onShiftWaiters, offShiftWaiters, 'waiter')
          )}

        </section>
      </div>
    </aside>
  );
}

function ForceSeatModal({ table, party, tables, onConfirm, onCancel }) {
  if (!table || !party) return null;
  const cap = getEffectiveCapacity(table, tables);
  const shortfall = party.size - cap;
  const label = groupTableLabel(table, tables);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-[fadeIn_0.18s_ease-out]" onClick={onCancel}>
      <div className="bg-panel border border-state-dining/40 rounded-2xl shadow-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-state-dining flex items-center gap-2">
            <span className="text-state-dining">⚠</span> Tight fit
          </h3>
          <button onClick={onCancel} className="text-ink-400 hover:text-ink-50 text-2xl leading-none -mt-1">×</button>
        </div>

        <p className="text-[13px] text-ink-50/85 leading-relaxed mb-4">
          <strong className="text-ai">{label}</strong> seats <strong className="text-ink-50 tabular-nums">{cap}</strong>,
          but <strong className="text-state-seated">{party.name}</strong> is a party of <strong className="text-ink-50 tabular-nums">{party.size}</strong>.
        </p>

        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="rounded-lg bg-panel-card border border-border p-2.5 text-center">
            <div className="font-mono text-[8.5px] tracking-[0.15em] uppercase text-ink-400 mb-1">Capacity</div>
            <div className="font-mono text-lg font-bold text-ink-50 tabular-nums">{cap}</div>
          </div>
          <div className="rounded-lg bg-panel-card border border-border p-2.5 text-center">
            <div className="font-mono text-[8.5px] tracking-[0.15em] uppercase text-ink-400 mb-1">Party</div>
            <div className="font-mono text-lg font-bold text-ink-50 tabular-nums">{party.size}</div>
          </div>
          <div className="rounded-lg bg-state-diningBg/50 border border-state-dining/40 p-2.5 text-center">
            <div className="font-mono text-[8.5px] tracking-[0.15em] uppercase text-state-dining mb-1">Short</div>
            <div className="font-mono text-lg font-bold text-state-dining tabular-nums">−{shortfall}</div>
          </div>
        </div>

        <div className="text-[11px] text-ink-400 italic mb-5">
          Manual override. Guest comfort may be impacted.
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg bg-panel-card border border-border text-ink-50 font-mono text-[11px] uppercase tracking-[0.1em] hover:border-border-hi transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-lg bg-state-dining text-bg font-mono text-[11px] uppercase tracking-[0.1em] font-bold hover:opacity-90 transition-opacity">
            Force seat →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TableCreatorSidebar — the floor-editing "Table Designer" rail.
// Swaps in for the reservation/walk-in Sidebar while edit mode is active.
// One draggable card per shape (Round, Square); each card's seat count is
// set with a −/＋ stepper or typed directly, then the shape is dragged onto
// the canvas (or clicked to drop in). The selected zone is applied on
// placement. Mirrors host-stand layout tools in OpenTable / SevenRooms.
// ─────────────────────────────────────────────────────────────────────
function TableCreatorSidebar({ addTable, activeFloorName = 'Floor', tableCount = 0 }) {
  const [area, setArea] = useState('dining');
  // Per-shape seat count (held as the raw input value so the field can be
  // briefly empty mid-edit; resolved to a clamped number on use/blur).
  const [seats, setSeats] = useState({ round: 4, square: 4, rectangle: 6 });

  const SHAPES = [
    { key: 'round',     label: 'Round',     shape: 'round'     },
    { key: 'square',    label: 'Square',    shape: 'square'    },
    { key: 'rectangle', label: 'Rectangle', shape: 'rectangle' },
  ];

  const MIN = 1, MAX = 20;
  const clamp = (n) => Math.max(MIN, Math.min(MAX, n));
  const seatValue = (key) => {
    const n = parseInt(seats[key], 10);
    return Number.isFinite(n) ? clamp(n) : MIN;
  };
  const stepSeat = (key, delta) =>
    setSeats(s => ({ ...s, [key]: clamp((parseInt(s[key], 10) || 0) + delta) }));

  // Preview footprint (px) tracks the same small/medium/large buckets the
  // real table uses, so the card hints at the on-floor size.
  const ghostSize = (cap, shape) => {
    const s = cap >= 5 ? 52 : cap >= 3 ? 44 : 36;
    // Rectangles read wider-than-tall so the card hints at a long table.
    return shape === 'rectangle'
      ? { w: Math.round(s * 1.7), h: Math.round(s * 0.78) }
      : { w: s, h: s };
  };

  return (
    <aside className="w-[300px] bg-panel border-r border-border flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-border flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-ai/15 border border-ai/40 flex items-center justify-center text-ai text-lg leading-none">▦</div>
          <div className="flex flex-col">
            <span className="font-display text-sm font-bold text-ink-50 leading-tight">Table Designer</span>
            <span className="font-mono text-[10px] text-ink-400 tracking-[0.04em]">Drag onto the floor to place</span>
          </div>
        </div>
        <div className="flex items-center justify-between bg-panel-card border border-border-hi rounded-lg px-3 py-2">
          <div className="flex flex-col">
            <span className="font-mono text-[9px] text-ink-400 tracking-[0.12em] uppercase">Active floor</span>
            <span className="font-mono text-xs text-ink-50 font-bold truncate max-w-[150px]">{activeFloorName}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="font-mono text-[9px] text-ink-400 tracking-[0.12em] uppercase">Tables</span>
            <span className="font-mono text-sm text-ai font-bold tabular-nums">{tableCount}</span>
          </div>
        </div>
      </div>

      {/* Zone selector */}
      <div className="px-4 pt-4 pb-1 flex flex-col gap-1.5">
        <span className="font-mono text-[9px] text-ink-400 tracking-[0.12em] uppercase">Default zone</span>
        <div className="flex items-center gap-1 p-0.5 bg-panel-card border border-border rounded-lg">
          {['dining', 'bar', 'patio'].map(a => (
            <button
              key={a}
              onClick={() => setArea(a)}
              className={`flex-1 px-2 py-1 rounded-md font-mono text-[10px] uppercase tracking-[0.06em] transition-colors ${
                area === a ? 'bg-ai text-bg font-bold' : 'text-ink-400 hover:text-ink-50'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Shape cards */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
        {SHAPES.map(({ key, label, shape }) => {
          const cap = seatValue(key);
          const g = ghostSize(cap, shape);
          return (
            <div key={key} className="flex flex-col gap-2">
              <span className="font-mono text-[11px] text-ink-50 tracking-[0.1em] uppercase font-bold">{label}</span>
              <div className="flex flex-col items-center gap-3 p-3 rounded-xl border border-border bg-panel-card">
                {/* Draggable shape — drag onto the floor or click to add */}
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('application/mesa-table', JSON.stringify({ shape, capacity: cap, area }));
                    const ghost = e.currentTarget.querySelector('[data-ghost]');
                    if (ghost) {
                      const r = ghost.getBoundingClientRect();
                      e.dataTransfer.setDragImage(ghost, r.width / 2, r.height / 2);
                    }
                  }}
                  className="group/card cursor-grab active:cursor-grabbing flex items-center justify-center"
                  title="Drag onto the floor to place"
                >
                  <div
                    data-ghost
                    style={{ width: g.w, height: g.h }}
                    className={`flex items-center justify-center bg-ai/15 border border-ai/50 text-ai font-mono text-sm font-bold ${
                      shape === 'round' ? 'rounded-full' : 'rounded-md'
                    } group-hover/card:bg-ai/25 group-hover/card:border-ai transition-colors`}
                  >
                    {cap}
                  </div>
                </div>
                {/* − [seats] ＋ stepper */}
                <div className="flex items-center gap-2 bg-panel border border-border rounded-lg px-1.5 py-1">
                  <button
                    onClick={() => stepSeat(key, -1)}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-ink-50 hover:bg-panel-up hover:text-ai text-base leading-none transition-colors"
                    title="Fewer seats"
                  >−</button>
                  <input
                    inputMode="numeric"
                    value={seats[key]}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '');
                      setSeats(s => ({ ...s, [key]: v === '' ? '' : clamp(parseInt(v, 10)) }));
                    }}
                    onBlur={() => setSeats(s => ({ ...s, [key]: seatValue(key) }))}
                    className="w-10 text-center bg-transparent font-mono text-sm text-ink-50 font-bold outline-none tabular-nums"
                  />
                  <button
                    onClick={() => stepSeat(key, 1)}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-ink-50 hover:bg-panel-up hover:text-ai text-base leading-none transition-colors"
                    title="More seats"
                  >+</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tips footer */}
      <div className="p-4 border-t border-border">
        <div className="bg-panel-card border border-border-hi rounded-lg px-3 py-2.5 flex flex-col gap-1">
          <span className="font-mono text-[9px] text-ai tracking-[0.12em] uppercase font-bold">Tip</span>
          <span className="font-mono text-[10px] text-ink-400 leading-relaxed">
            Set the seat count, then drag the shape onto the floor (or click it). Click a placed table to rotate, renumber, or remove it.
          </span>
        </div>
      </div>
    </aside>
  );
}

function FloorMap({
  hydrated = false, onSeatPartyDrop, tables, selectedTableId, setSelectedTableId, setSelectedReservationId, selectedPartyId, setSelectedPartyId, waitlist, reservations = [], allReservations = [], viewDate = null, setViewDate,
  editMode, setEditMode, mergeMode, setMergeMode, mergeSelection, setMergeSelection,
  newCapacity, setNewCapacity, newTableShape = 'square', setNewTableShape, newTableArea = 'dining', setNewTableArea, addTable, deleteTable,
  dragState, setDragState, moveSourceId, setMoveSourceId,
  attemptSeat, clearTable, moveParty = null, now, aiSuggestedIds = [], aiSuggestedRawId = null,
  servers = [], isAssignMode = false, assignSelectedServer = null, assignTableToServer, setIsAssignMode, setAssignSelectedServer, viewingServerId = null, setViewingServerId, sectionView = false, setSectionView,
  reassignReservationId = null, setReassignReservationId, updateReservationTable, assignReservationToTables, onAssignConflictPrompt,
  floors = [{ id: 'f1', name: 'Main Floor', isManualOnly: false }], setFloors, activeFloorId = 'f1', setActiveFloorId,
  underlay = null, showUnderlay = false, setShowUnderlay = () => {}, migrationActive = false, onCancelMigration = () => {},
  isAddingFloor = false, setIsAddingFloor, newFloorName = "", setNewFloorName, deleteFloor,
  rotateTable, renameTable, setTableCapacity, setTableShape = null, setTableArea = null, renameFloor = () => {}, reorderFloors = null, toggleTableManualOnly = null, toggleTableOnlineExcluded = null, toggleFloorManualOnly = () => {}, toggleFloorOnlineExcluded = () => {}, setFloorTablesManualOnly = () => {}, setFloorTablesOnlineExcluded = () => {}, addFloor, undo, canUndo = false,
  hostMode = false, serviceLogOpen = false, onToggleServiceLog = null,
}) {
  // Visible tables — only the active floor's tables are rendered, drag-
  // tested, and grouped. Lookups by id (selectedTable, dragState target,
  // etc.) still go against the full `tables` array since they're
  // indexed by id and don't care about the floor filter; iterations
  // (render loop, groupLines, available-id list) all consume this.
  const visibleTables = tables.filter(t => t.floorId === activeFloorId);
  // Renumber draft (edit mode). numberDraft holds the in-progress digits for
  // the selected table's number field in the edit popup; commitNumber writes
  // it back via renameTable with a "T" prefix. Seeded when the popup opens
  // (see the editPopupTableId effect below).
  const [numberDraft, setNumberDraft] = useState('');
  // editPopupTableId drives the click-anchored edit popup (rotate /
  // renumber / delete) floating above the selected table. popupRef lets the
  // outside-click handler tell "inside the popup" from "elsewhere", and
  // dragMovedRef distinguishes a click (opens the popup) from a drag (moves
  // the table) on the same tile.
  const [editPopupTableId, setEditPopupTableId] = useState(null);
  // Inline floor-tab rename (edit mode): ✎ or double-click opens it.
  const [renamingFloorId, setRenamingFloorId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  // Floor-tab drag reordering (works in any mode, no edit required).
  const [dragFloorId, setDragFloorId] = useState(null);
  const [dropHint, setDropHint] = useState(null); // { id, side: 'before'|'after' }
  // Floor ⋯ menu: exclusion controls, any mode. Fixed-position anchor
  // captured from the trigger's rect so no container needs a context.
  const [floorMenu, setFloorMenu] = useState(null); // { id, x, y }
  // Exclusion picking mode: 'ai' | 'online' | null. Armed from the ⋯
  // menu; table clicks toggle the flag; the banner (or the menu row
  // again) disarms. Each toggle persists immediately — nothing pending.
  const [exclusionMode, setExclusionMode] = useState(null);
  const popupRef = useRef(null);
  const dragMovedRef = useRef(false);
  // Floor pan/zoom — display-only. Never mutates saved table x/y; just
  // transforms the view so a big room fits the window. zoomRef mirrors
  // zoom for the table-drag math (which must divide screen-pixel deltas
  // by the current scale to map back to canvas coordinates).
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  // Mirror pan into a ref too, so the deferred cutoff-checker reads the
  // freshest transform without being a React dependency.
  const panRef = useRef({ x: 0, y: 0 });
  useEffect(() => { panRef.current = pan; }, [pan]);
  // Drag-to-pan the whole floor. Active on a background press (never on a
  // table/popup). Pans in screen pixels; zoom-independent because the pan
  // translate is applied outside the scale.
  const panningRef = useRef(null);
  const panMovedRef = useRef(false);
  // Wheel-zoom via a NATIVE non-passive listener: React delegates wheel
  // passively at the root, so preventDefault() through the JSX prop is
  // browser-dependent. zoomAtRef keeps the handler bound once while
  // always calling the latest math.
  const zoomAtRef = useRef(null);
  useEffect(() => {
    const el = document.getElementById('floor-canvas');
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      // 0.05/tick: wheel events fire in rapid bursts, so the button step
      // (0.12) overshot — hosts couldn't land on a precise zoom level.
      if (zoomAtRef.current) zoomAtRef.current(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1 : -1, 0.05);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  // ─── Touch gestures (iPad host stand) ──────────────────────────────
  // One-finger hold-and-drag on the background pans the floor; two-
  // finger pinch zooms around the pinch midpoint; taps pass through to
  // the tiles untouched (browsers synthesize clicks from taps). Native
  // non-passive listeners for the same reason as the wheel handler —
  // preventDefault() must actually stop Safari's page-level pan/zoom.
  // The canvas also sets touch-action:none so iOS never argues.
  useEffect(() => {
    // The manager view retains its established immediate touch pan. Host
    // uses the pointer-intent classifier below so a horizontal swipe is
    // never mistaken for panning.
    if (hostMode) return undefined;
    const el = document.getElementById('floor-canvas');
    if (!el) return;
    let gesture = null; // { mode: 'pan'|'pinch', ... }
    const onTouchStart = (e) => {
      if (e.touches.length >= 2) {
        // Second finger down → pinch (even mid-pan).
        const [a, b] = [e.touches[0], e.touches[1]];
        const rect = el.getBoundingClientRect();
        gesture = {
          mode: 'pinch',
          dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
          zoom: zoomRef.current,
          midX: (a.clientX + b.clientX) / 2 - rect.left,
          midY: (a.clientY + b.clientY) / 2 - rect.top,
          panX: panRef.current.x, panY: panRef.current.y,
        };
        e.preventDefault();
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        // Background only — touches on tiles/popups belong to them.
        if (t.target.closest && t.target.closest('[data-table-tile], [data-edit-popup], [data-floor-controls], [data-floor-tab], button, input, select')) { gesture = null; return; }
        gesture = { mode: 'pan', x: t.clientX, y: t.clientY, origX: panRef.current.x, origY: panRef.current.y, moved: false };
      }
    };
    const onTouchMove = (e) => {
      if (!gesture) return;
      if (gesture.mode === 'pan' && e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - gesture.x, dy = t.clientY - gesture.y;
        // 6px dead zone: below it this is a tap, not a drag.
        if (!gesture.moved && Math.hypot(dx, dy) < 6) return;
        gesture.moved = true; panMovedRef.current = true;
        e.preventDefault();
        const np = { x: gesture.origX + dx, y: gesture.origY + dy };
        panRef.current = np; setPan(np);
      } else if (gesture.mode === 'pinch' && e.touches.length >= 2) {
        e.preventDefault();
        const [a, b] = [e.touches[0], e.touches[1]];
        const rect = el.getBoundingClientRect();
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
        const next = clampZoom(gesture.zoom * (dist / gesture.dist));
        const midX = (a.clientX + b.clientX) / 2 - rect.left;
        const midY = (a.clientY + b.clientY) / 2 - rect.top;
        // Keep the world point that was under the pinch midpoint pinned
        // to the (moving) midpoint — pinch-drag pans and zooms at once.
        const np = {
          x: midX - (gesture.midX - gesture.panX) * (next / gesture.zoom),
          y: midY - (gesture.midY - gesture.panY) * (next / gesture.zoom),
        };
        zoomRef.current = next; panRef.current = np;
        setZoom(next); setPan(np);
      }
    };
    const onTouchEnd = (e) => {
      if (e.touches.length === 0) { gesture = null; return; }
      if (gesture && gesture.mode === 'pinch' && e.touches.length === 1) {
        // Lift one finger out of a pinch → continue as a pan.
        const t = e.touches[0];
        gesture = { mode: 'pan', x: t.clientX, y: t.clientY, origX: panRef.current.x, origY: panRef.current.y, moved: true };
      }
    };
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [hostMode]);
  // Host-only pointer intent model: quick, decisive horizontal movement
  // changes rooms; otherwise a held press becomes a pan after 500ms.
  // Pointer events leave two-finger pinch behavior to the browser/current
  // touch path and never engage on a tile, guest drag, or edit action.
  useEffect(() => {
    if (!hostMode) return undefined;
    const el = document.getElementById('floor-canvas');
    if (!el) return undefined;
    let active = null;
    const blocked = (target) => target?.closest?.('[data-table-tile], [data-edit-popup], [data-floor-controls], [data-floor-tab], button, input, select, [data-party-drag-ghost]');
    const finish = () => {
      if (!active) return;
      clearTimeout(active.timer);
      active = null;
    };
    const onPointerDown = (e) => {
      if (e.pointerType !== 'touch' || e.isPrimary === false || blocked(e.target) || dragState || document.querySelector('[data-party-drag-ghost]')) return;
      const origin = { x: e.clientX, y: e.clientY };
      active = { id: e.pointerId, origin, pan: { ...panRef.current }, mode: 'pending', timer: 0, lastX: e.clientX, lastT: performance.now() };
      active.timer = window.setTimeout(() => {
        if (active && active.id === e.pointerId && active.mode === 'pending') active.mode = 'pan';
      }, 500);
      el.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
      if (!active || active.id !== e.pointerId) return;
      const dx = e.clientX - active.origin.x, dy = e.clientY - active.origin.y;
      const elapsed = Math.max(1, performance.now() - active.lastT);
      const velocity = Math.abs(e.clientX - active.lastX) / elapsed;
      active.lastX = e.clientX; active.lastT = performance.now();
      if (active.mode === 'pending' && Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy) && velocity > 0.25) {
        active.mode = 'swipe'; clearTimeout(active.timer); e.preventDefault();
        const index = floors.findIndex(f => f.id === activeFloorId);
        if (index >= 0 && floors.length > 1) {
          const next = floors[(index + (dx < 0 ? 1 : floors.length - 1)) % floors.length];
          setActiveFloorId(next.id); setSelectedTableId(null); setMoveSourceId && setMoveSourceId(null); setMergeSelection([]);
        }
        return;
      }
      if (active.mode === 'pan') {
        e.preventDefault(); panMovedRef.current = true;
        const np = { x: active.pan.x + dx, y: active.pan.y + dy };
        panRef.current = np; setPan(np);
      }
    };
    const onPointerUp = (e) => { if (active?.id === e.pointerId) finish(); };
    el.addEventListener('pointerdown', onPointerDown, { passive: true });
    el.addEventListener('pointermove', onPointerMove, { passive: false });
    el.addEventListener('pointerup', onPointerUp, { passive: true });
    el.addEventListener('pointercancel', onPointerUp, { passive: true });
    return () => { finish(); el.removeEventListener('pointerdown', onPointerDown); el.removeEventListener('pointermove', onPointerMove); el.removeEventListener('pointerup', onPointerUp); el.removeEventListener('pointercancel', onPointerUp); };
  }, [hostMode, floors, activeFloorId, dragState, setActiveFloorId, setMergeSelection, setMoveSourceId, setSelectedTableId]);
  const startPan = (e) => {
    // Only pan on a plain background press (left button, not on a tile).
    if (e.button !== 0) return;
    if (e.target.closest && e.target.closest('[data-table-tile], [data-edit-popup], [data-floor-controls]')) return;
    panningRef.current = { startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y, moved: false };
  };
  useEffect(() => {
    const onMove = (e) => {
      const p = panningRef.current;
      if (!p) return;
      const dx = e.clientX - p.startX, dy = e.clientY - p.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) { p.moved = true; panMovedRef.current = true; }
      const np = { x: p.origX + dx, y: p.origY + dy };
      panRef.current = np; // ref mirrors synchronously — burst-correct reads
      setPan(np);
    };
    const onUp = () => { panningRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);
  // Screen (canvas-relative px) → world (table x/y) through the current
  // transform: world = (screen - pan) / zoom.
  const screenToWorld = (sx, sy) => ({ x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom });
  // Zoom keeping the point (cx,cy in canvas px) fixed on screen.
  const zoomAt = (cx, cy, dir, step = 0.12) => {
    // Pure event-handler math off synchronously-mirrored refs. The old
    // form called setPan INSIDE the setZoom updater — a side effect in an
    // updater function, which React StrictMode double-invokes in dev
    // (double-pan drift) and which is illegal-impure in general. Refs are
    // written in the same tick, so rapid wheel bursts between renders
    // still compound correctly.
    const z = zoomRef.current || 1;
    const next = clampZoom(+(z + dir * step).toFixed(3));
    if (next === z) return;
    const p = panRef.current;
    const np = {
      x: cx - (cx - p.x) * (next / z),
      y: cy - (cy - p.y) * (next / z),
    };
    zoomRef.current = next;
    panRef.current = np;
    setZoom(next);
    setPan(np);
  };
  zoomAtRef.current = zoomAt;
  // Button zoom anchors on the viewport CENTER.
  const zoomStep = (dir) => {
    const el = document.getElementById('floor-canvas');
    const r = el && el.getBoundingClientRect();
    zoomAt(r ? r.width / 2 : 400, r ? r.height / 2 : 300, dir);
  };
  // Fit: frame all tables on the active floor, centered.
  const fitView = () => {
    const el = document.getElementById('floor-canvas');
    const on = visibleTables;
    if (!el || on.length === 0) { setZoom(1); setPan({ x: 0, y: 0 }); return; }
    const r = el.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    on.forEach(t => {
      const s = getTableSizePx(t.shape, t.capacity);
      minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x + s.width); maxY = Math.max(maxY, t.y + s.height);
    });
    const pad = 60;
    const cw = maxX - minX + pad * 2, ch = maxY - minY + pad * 2;
    const z = Math.max(0.05, Math.min(1.5, Math.min(r.width / cw, r.height / ch)));
    // Center the content bbox in the viewport.
    const cxWorld = (minX + maxX) / 2, cyWorld = (minY + maxY) / 2;
    const np = { x: r.width / 2 - cxWorld * z, y: r.height / 2 - cyWorld * z };
    zoomRef.current = z;
    panRef.current = np;
    setZoom(z);
    setPan(np);
  };
  // Keep a ref to the latest fitView so any deferred/retried call uses
  // CURRENT table positions. The bug: the retry closure captured the
  // fitView (and its visibleTables) from the render when the effect
  // started — often before hydration replaced the tables' x/y — so it fit
  // to stale coordinates and cut tables off. Calling through the ref
  // always runs the up-to-date computation.
  const fitViewRef = useRef(fitView);
  fitViewRef.current = fitView;

  // Auto-fit once when the floor first has tables (i.e. after a reload/
  // hydration). Frames every table, centered — same behavior as the Fit
  // button. Retries across a few frames until the canvas has a real
  // measured size AND the active floor has visible tables, because on a
  // cold reload the element can briefly report 0×0 or the floor filter
  // isn't settled yet — firing then would leave tables off-screen.
  const didAutoFit = useRef(false);
  useEffect(() => {
    if (didAutoFit.current) return;
    if (!hydrated) return; // wait for real hydrated positions, not defaults
    if (!tables || tables.length === 0) return;

    let raf = 0;
    let tries = 0;
    let lastW = -1, stableCount = 0;
    let ro = null;
    let recheckTimer = 0;

    // True if every visible table's projected bounds sit inside the canvas
    // at the current pan/zoom — the explicit "nothing cut off" check.
    const allTablesVisible = () => {
      const el = document.getElementById('floor-canvas');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const on = tables.filter(t => t.floorId === activeFloorId);
      if (on.length === 0) return true;
      for (const t of on) {
        const s = getTableSizePx(t.shape, t.capacity);
        const left = t.x * zoomRef.current + panRef.current.x;
        const top = t.y * zoomRef.current + panRef.current.y;
        const right = (t.x + s.width) * zoomRef.current + panRef.current.x;
        const bottom = (t.y + s.height) * zoomRef.current + panRef.current.y;
        if (left < -1 || top < -1 || right > r.width + 1 || bottom > r.height + 1) return false;
      }
      return true;
    };

    const doFit = () => {
      fitViewRef.current();
      // After the fit's state settles, verify nothing is cut off; if the
      // canvas width shifted mid-fit (rail/flex still settling), re-fit.
      recheckTimer = window.setTimeout(() => {
        if (!allTablesVisible()) fitViewRef.current();
      }, 120);
    };

    const attempt = () => {
      const el = document.getElementById('floor-canvas');
      const r = el && el.getBoundingClientRect();
      const on = tables.filter(t => t.floorId === activeFloorId);
      const sized = r && r.width > 50 && r.height > 50 && on.length > 0;
      if (sized) {
        // Require the width to hold steady for 2 consecutive frames so we
        // never fit against a transient (too-wide/too-narrow) measurement
        // while the right service rail and flex siblings are still settling
        // — the cause of the occasional right-edge cutoff.
        if (Math.abs(r.width - lastW) < 0.5) stableCount++; else stableCount = 0;
        lastW = r.width;
        if (stableCount >= 2 || tries > 40) {
          didAutoFit.current = true;
          doFit();
          // Safety net: if the canvas resizes within ~1s of the fit (late
          // layout reflow), fit once more, then disconnect.
          if (typeof ResizeObserver !== 'undefined' && el) {
            ro = new ResizeObserver(() => { doFit(); });
            ro.observe(el);
            window.setTimeout(() => { if (ro) { ro.disconnect(); ro = null; } }, 1000);
          }
          return;
        }
      }
      if (tries++ < 90) raf = requestAnimationFrame(attempt); // ~1.5s max
    };
    raf = requestAnimationFrame(attempt);
    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      if (recheckTimer) clearTimeout(recheckTimer);
    };
    // Primitives only — a deps array must stay the same size every render.
  }, [hydrated, tables.length, activeFloorId]);

  // Switching floors re-frames the view: the new floor's tables live in a
  // different world region, and the once-per-load auto-fit deliberately
  // doesn't re-fire.
  const prevFloorRef = useRef(activeFloorId);
  useEffect(() => {
    if (prevFloorRef.current !== activeFloorId) {
      prevFloorRef.current = activeFloorId;
      requestAnimationFrame(() => { if (fitViewRef.current) fitViewRef.current(); });
    }
  }, [activeFloorId]);

  const panDragRef = useRef(null);
  // "0%" means fit-to-floor, never a literal zero transform. This keeps
  // the entire active room reachable while retaining a tiny 5% safety floor
  // for sparse/oversized imported plans.
  const minimumZoom = () => {
    if (typeof document === 'undefined') return 0.05; // SSR/prerender: no DOM; effect-driven fit recomputes on mount
    const el = document.getElementById('floor-canvas');
    if (!el || visibleTables.length === 0) return 0.05;
    const r = el.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    visibleTables.forEach(t => {
      const s = getTableSizePx(t.shape, t.capacity);
      minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x + s.width); maxY = Math.max(maxY, t.y + s.height);
    });
    const fit = Math.min(r.width / Math.max(1, maxX - minX + 120), r.height / Math.max(1, maxY - minY + 120));
    return Math.max(0.05, Math.min(2, fit));
  };
  const clampZoom = (z) => Math.max(minimumZoom(), Math.min(2, Math.round(z * 100) / 100));
  const commitNumber = (id) => {
    const v = numberDraft.trim();
    if (v) {
      // Bare-number archetype: the renumber editor stores exactly what
      // was typed — no "T" prefix (matches migrated and added tables).
      renameTable && renameTable(id, v);
    } else {
      // Empty field — restore the table's existing number rather than
      // blanking it out.
      const cur = tables.find(t => t.id === id);
      if (cur) setNumberDraft(String(cur.name).replace(/[^0-9]/g, ''));
    }
  };
  // Leaving edit mode tears down any open popup / renumber editor so it
  // can't resurface the next time editing is entered.
  useEffect(() => {
    if (!editMode) { setNumberDraft(''); setEditPopupTableId(null); }
  }, [editMode]);
  // Outside-click dismissal: any click that isn't inside the popup or on a
  // table tile closes it. Tile clicks are handled by the tile (toggle);
  // clicks inside the popup keep it open. Attached only while a popup is
  // open, after the opening click has already finished propagating.
  useEffect(() => {
    if (!editPopupTableId) return;
    const onDocClick = (e) => {
      if (popupRef.current && popupRef.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest('[data-table-tile]')) return;
      setEditPopupTableId(null);
      setNumberDraft('');
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [editPopupTableId]);
  // When the popup opens (or moves to another table) seed the number field
  // with that table's current digits. Keyed only on editPopupTableId so that
  // edits to `tables` (rotate, capacity, the rename itself) never clobber an
  // in-progress draft.
  useEffect(() => {
    if (editPopupTableId == null) return;
    const t = tables.find(x => x.id === editPopupTableId);
    setNumberDraft(t ? String(t.name).replace(/[^0-9]/g, '') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPopupTableId]);
  const activeFloor   = floors.find(f => f.id === activeFloorId);
  // Active party can come from either waitlist (walk-ins/waitlist) or
  // reservations. This local lookup mirrors Home's seating cluster so
  // handleTableClick's seating branch fires regardless of party origin.
  const selectedParty =
    waitlist.find(a => a.id === selectedPartyId) ||
    reservations.find(r => r.id === selectedPartyId);
  const selectedTable = tables.find(t => t.id === selectedTableId);

  // On-shift roster (drives assign-control disabled states + colour).
  const onShiftServers = servers.filter(s => s.onShift);

  // Resolve a server to an effective HEX colour: their custom colour when
  // set, otherwise the original on-shift palette colour (SERVER_COLOR_HEX,
  // index-aligned with the sidebar dot). Returns null for off-shift /
  // unknown servers so callers skip the accent. Single source of truth —
  // the edge stripe AND the section-view heatmap tint both derive from this,
  // so a member's colour is identical across the sidebar dot, the floor-map
  // stripe, and the heatmap fill.
  const serverColorHex = (serverId) => {
    const idx = onShiftServers.findIndex(s => s.id === serverId);
    if (idx === -1) return null;
    const m = onShiftServers[idx];
    return (m && m.color) ? m.color : SERVER_COLOR_HEX[idx % SERVER_COLOR_HEX.length];
  };

  // aiSuggestedIds now comes in as a prop from Home (populated by /api/seat)

  const allAvailableIds = useMemo(() => {
    if (!selectedParty) return [];
    return visibleTables.filter(t => t.status === "available").map(t => t.id);
  }, [selectedParty, visibleTables]);

  const moveTargetIds = useMemo(() => {
    if (!moveSourceId) return [];
    const source = tables.find(t => t.id === moveSourceId);
    if (!source) return [];
    const required = source.partySize || 1;
    return tables
      .filter(t =>
        t.status === "available" &&
        t.id !== moveSourceId &&
        t.groupId !== source.groupId &&
        getEffectiveCapacity(t, tables) >= required
      )
      .map(t => t.id);
  }, [moveSourceId, tables]);

  // ─── Drag system (ref-based, no per-mousemove re-renders) ──────
  // The Problem: setting React state on every mousemove fires re-renders
  // across the whole floor. With 14 tables that's a lot of needless work.
  //
  // The Fix: keep the continuous drag delta in a useRef and apply it
  // imperatively to the dragged element's style.transform. React doesn't
  // see anything until mouseup, where we commit the final position to
  // the tables state.
  //
  // dragState (React state) only changes at start and end of a drag,
  // not on every mousemove. It carries just enough info for the visual
  // affordance (z-index, cursor) and for the finalize step that commits
  // to setTables back in Home.
  //
  // tableRefs maps tableId → its DOM node, so the mousemove handler can
  // mutate style.transform directly without touching React.
  const dragInfoRef = useRef(null);
  const tableRefs = useRef({});

  useEffect(() => {
    // Only attach listeners during an active drag (not during finalize).
    // Without this guard the listeners would run during the finalize
    // render and double-commit the position.
    if (!dragState || dragState.finalize) return;

    const onMouseMove = (e) => {
      const info = dragInfoRef.current;
      if (!info) return;

      const z = zoomRef.current || 1;
      let dx = (e.clientX - info.startX) / z;
      let dy = (e.clientY - info.startY) / z;

      // Free placement in every direction — no boundary clamp. Fit
      // reframes the full bounding box if a table ends up off-screen.

      // First meaningful movement promotes this gesture from a click to a
      // drag: record it (so the tile's onClick won't open the popup) and
      // dismiss any open popup so it doesn't linger at the old position.
      if (!dragMovedRef.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        dragMovedRef.current = true;
        setEditPopupTableId(null);
      }

      // Apply the same transform to every group member. Direct DOM
      // mutation — no setState, no React render cycle, GPU-accelerated.
      Object.keys(info.groupOffsets).forEach(tid => {
        const el = tableRefs.current[tid];
        if (el) el.style.transform = `translate(${dx}px, ${dy}px) rotate(${info.groupOffsets[tid].rot || 0}deg)`;
      });
    };

    const onMouseUp = (e) => {
      const info = dragInfoRef.current;
      if (!info) return;

      const z = zoomRef.current || 1;
      let dx = (e.clientX - info.startX) / z;
      let dy = (e.clientY - info.startY) / z;
      // Free placement in every direction — no boundary clamp. Fit
      // reframes the full bounding box if a table ends up off-screen.

      // Hand off to Home's finalize useEffect (which commits via
      // setTables and then clears dragState). dragState stays truthy
      // until then so the post-drag click event is suppressed by
      // handleTableClick's `if (dragState) return;` guard.
      setDragState({
        tableId: info.tableId,
        finalDx: dx,
        finalDy: dy,
        groupOffsets: info.groupOffsets,
        finalize: true,
      });
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragState, setDragState]);

  // After dragState clears (post-finalize), Home has already committed
  // the new positions via setTables. React updates style.left/top to
  // match. But style.transform on the moved elements still carries the
  // drag delta — without clearing it here, the element would briefly
  // appear at (newPos + delta). useLayoutEffect runs after DOM commit
  // but before the browser paints, so this happens atomically with the
  // position update — no flash.
  useLayoutEffect(() => {
    if (dragState === null) {
      Object.entries(tableRefs.current).forEach(([id, el]) => {
        if (!el) return;
        // Restore the table's resting rotation rather than blanking the
        // transform — otherwise a rotated tile snaps back to 0deg after a
        // drag (React won't re-apply an unchanged style-prop value).
        const tbl = tables.find(t => String(t.id) === String(id));
        el.style.transform = tbl && tbl.rotation ? `rotate(${tbl.rotation}deg)` : '';
      });
      dragInfoRef.current = null;
    }
  }, [dragState]);

  // With the transform handling visuals during the drag, the table's
  // style.left/top stays at its original (committed) position. So this
  // helper is now a trivial pass-through. Kept as a function (rather
  // than inlining) so future logic — alignment snapping, magnetic
  // edges — has a single entry point.
  const getEffectivePosition = (table) => {
    return { x: table.x, y: table.y };
  };

  const startDrag = (e, table) => {
    if (!editMode) return;
    if (e.target.closest("[data-tile-ctrl]")) return;
    if (e.target.closest("[data-table-popup]")) return;
    e.stopPropagation();
    dragMovedRef.current = false;
    const groupMembers = table.groupId
      ? tables.filter(t => t.groupId === table.groupId)
      : [table];
    const groupOffsets = groupMembers.reduce((acc, t) => {
      acc[t.id] = { dx: t.x - table.x, dy: t.y - table.y, rot: t.rotation || 0 };
      return acc;
    }, {});
    dragInfoRef.current = {
      tableId: table.id,
      startX: e.clientX,
      startY: e.clientY,
      originX: table.x,
      originY: table.y,
      groupOffsets,
    };
    // Only the tableId triggers a React render here — the per-pixel
    // delta lives in the ref above and never enters React's view.
    setDragState({ tableId: table.id });
  };

  const mounted = useMounted();

  // ── Time-travel view derivation ────────────────────────────────────
  // The floor renders `viewDate`, not necessarily today. Two rules:
  //   1. Live occupancy (seated/dining/bussing) is a TODAY-only fact —
  //      on any other date those tables read available.
  //   2. "Reserved" is DERIVED from the viewed date's bookings (the
  //      `reservations` prop is already date-filtered by Home): a table
  //      is reserved iff some booking on the viewed date references it,
  //      directly or as a member of a joined "i_j" merge id. This also
  //      supersedes the static seed status — a reserved-status table
  //      whose booking was deleted correctly reads available.
  const isViewingToday = !viewDate || formatDateKey(viewDate) === formatDateKey(new Date(now));
  // Server sections are per-service-day live state: they render on today
  // only. The overnight exception (a shift running past midnight into the
  // next calendar day) is already covered because live state hydrates
  // fresh until the close+90 reset — so "today" here means the current
  // wall-clock day, which is exactly where sections should show.
  // Sections are now derived per-service-day (viewTables overlays each
  // day's own assignedServerId; an untouched day is genuinely empty), so
  // the visuals should render on whatever day owns them — today, a future
  // plan, or a past record. The old isViewingToday gate suppressed
  // legitimate future/past sections and is no longer needed: there's no
  // global bleed-through left to hide.
  const sectionsApply = true;
  const reservationOnView = (t) =>
    (reservations || []).find(r =>
      r.tableId != null && String(r.tableId).split('_').includes(String(t.id))
    ) || null;
  const effectiveStatusFor = (t) => {
    const live = isViewingToday ? t.status : 'available';
    if (reservationOnView(t)) return (live === 'available' || live === 'reserved') ? 'reserved' : live;
    return live === 'reserved' ? 'available' : live;
  };

  // ── Date-aware assignment availability ─────────────────────────────
  // While a reservation is being placed (reassignReservationId active),
  // eligibility is judged on the BOOKING's date: a conflict is another
  // reservation on that date within an hour, attached to the table.
  // Current physical occupancy is irrelevant to a future slot. Looked up
  // in allReservations (the full set) — the `reservations` prop is
  // today-filtered, so future bookings would never resolve from it.
  const assigningReservation = reassignReservationId
    ? (allReservations.find(r => r.id === reassignReservationId) || null)
    : null;
  const conflictsWithAssigning = (t) =>
    !!assigningReservation &&
    // `now` is a ms timestamp (Date.now()), not a Date — wrap it, as
    // every other Date-consumer of `now` in this file does.
    tableHasReservationConflict(t, assigningReservation, allReservations, formatDateKey(new Date(now)));

  // Occupied-soon: the table has a party at it RIGHT NOW and the booking
  // being placed is for today within an hour of the current time — the
  // live party probably won't be gone. Only live occupancy collides with
  // a same-day near-term slot; future-dated bookings never trip this.
  const occupiedSoonForAssigning = (t) => {
    if (!assigningReservation) return false;
    if (t.status !== 'seated' && t.status !== 'dining') return false;
    const d = new Date(now);
    if ((assigningReservation.date || formatDateKey(d)) !== formatDateKey(d)) return false;
    const pMin = parseResMinutes(assigningReservation.time);
    if (pMin == null) return false;
    return Math.abs(pMin - (d.getHours() * 60 + d.getMinutes())) < RES_CONFLICT_MIN;
  };

  const handleTableClick = (e, table) => {
    // Exclusion picking mode hijack — a click only toggles the armed
    // flag on the table; all seating/selection behavior is suspended
    // until the mode is dismissed.
    if (exclusionMode) {
      e.stopPropagation();
      if (exclusionMode === 'ai') toggleTableManualOnly && toggleTableManualOnly(table.id);
      else toggleTableOnlineExcluded && toggleTableOnlineExcluded(table.id);
      return;
    }
    // Point-and-click reassignment hijack — fires FIRST so a host in
    // reassign mode can target any table regardless of other mode
    // state (editMode, mergeMode, isAssignMode). Drag still wins
    // implicitly because handleTableClick won't be called during a
    // drag — the drag listener owns the mouse.
    //
    // Multi-target resolution: the click on ONE table can stamp a
    // reservation across MANY tables. Three cases:
    //   1. AI suggested a virtual merge → use every base id the AI
    //      surfaced (aiSuggestedIds, populated from the split form of
    //      the response's "i_j" string).
    //   2. Host clicked a manually-merged table → use every table that
    //      shares the clicked table's groupId. Reuses the existing
    //      groupId so no orphan group ids accumulate in state.
    //   3. Single table → falls through to the one-element default.
    // NOTE: mergeMode wins over the reassign intercept. When the host
    // presses "Merge table & assign party", both states are live — table
    // clicks must build the merge selection, not assign the reservation
    // to the first table touched. confirmMerge completes the assignment.
    if (reassignReservationId && !mergeMode) {
      let targetIds = [table.id];
      let existingGroupId = null;

      if (aiSuggestedIds.length > 1 && aiSuggestedIds.includes(table.id)) {
        targetIds = [...aiSuggestedIds];
      } else if (table.groupId) {
        existingGroupId = table.groupId;
        targetIds = tables.filter(x => x.groupId === table.groupId).map(x => x.id);
      }

      // Flagged tables (reservation conflict on the booking's date, or
      // occupied right now with a near-term same-day slot) are dimmed as
      // a warning but NOT inert: clicking raises a confirm/cancel prompt
      // in Home. Confirm assigns anyway; Cancel keeps assign mode live so
      // another table can be picked. Checked across every member when
      // the click resolves to a merged group / AI multi-table target.
      const members = targetIds.map(id => tables.find(x => x.id === id)).filter(Boolean);
      const hasResConflict = members.some(x => conflictsWithAssigning(x));
      const hasOccupiedSoon = members.some(x => occupiedSoonForAssigning(x));
      if (hasResConflict || hasOccupiedSoon) {
        if (onAssignConflictPrompt && assigningReservation) {
          const names = members.map(x => x.name).join(' + ');
          const reason = hasResConflict && hasOccupiedSoon
            ? 'already has a reservation within an hour of this time and is occupied right now'
            : hasResConflict
              ? 'already has a reservation within an hour of this time'
              : 'is occupied right now, and this booking starts within the hour';
          onAssignConflictPrompt({
            reservationId: reassignReservationId,
            targetIds,
            existingGroupId,
            message: `${names} ${reason}. Assign ${assigningReservation.name} here anyway?`,
          });
        }
        return;
      }

      if (assignReservationToTables) {
        assignReservationToTables(reassignReservationId, targetIds, existingGroupId);
      } else if (updateReservationTable) {
        // Defensive fallback if the multi-target handler wasn't wired
        // (older caller, test, etc.) — single-table path still works.
        updateReservationTable(reassignReservationId, table.id);
      }
      if (setReassignReservationId) setReassignReservationId(null);
      return;
    }
    // Move-party mode reuses the same table-pick surface, but keeps the
    // seated lifecycle record intact: only its live table association is
    // changed, so the service journal never receives a second seating.
    if (moveSourceId) {
      const source = tables.find(t => t.id === moveSourceId);
      if (!source || table.status !== 'available' || table.id === source.id) return;
      const party = source.party;
      const partySize = source.partySize;
      if (!party || !partySize || getEffectiveCapacity(table, tables) < partySize) return;
      if (moveParty) moveParty(source, table);
      setMoveSourceId(null); setSelectedTableId(table.id);
      return;
    }
    if (editMode) return;
    if (dragState) return;
    // Section Assignment hijack: when isAssignMode is true and a server
    // is selected, any table click writes that server's id to the table.
    // No seating, no inspecting, no merging. Click silently no-ops if no
    // server is picked yet (prompts the host to pick one first).
    if (isAssignMode) {
      if (assignSelectedServer && assignTableToServer) {
        assignTableToServer(table.id, assignSelectedServer);
      }
      return;
    }
    if (mergeMode) {
      if (table.groupId) return;
      // Eligibility gate — date-aware while assigning a reservation
      // (conflict on the booking's date), physical availability for an
      // immediate merge. Also closes a hole where occupied tables could
      // be click-added despite being dimmed.
      if (assigningReservation ? (conflictsWithAssigning(table) || occupiedSoonForAssigning(table)) : table.status !== "available") return;
      setMergeSelection(prev => {
        if (prev.includes(table.id)) return prev.filter(id => id !== table.id);
        // Adjacency gate: after the first table, every added table must
        // physically neighbor one already selected — ineligible tables
        // are dimmed on the floor, and clicks on them are no-ops.
        if (prev.length > 0) {
          const selected = tables.filter(x => prev.includes(x.id));
          const floorTables = tables.filter(x => x.floorId === table.floorId);
          if (!selected.some(s => areTablesAdjacent(s, table, floorTables))) return prev;
        }
        return [...prev, table.id];
      });
      return;
    }
    if (selectedParty && isViewingToday && table.status === "available") {
      // If this click landed on a base table of an AI-suggested merge,
      // route the seat through the virtual id so performSeat stamps a
      // groupId and seats every base table together. Without this, the
      // host would seat just one half of the suggested merge.
      const isPartOfVirtualMerge =
        typeof aiSuggestedRawId === 'string' &&
        aiSuggestedRawId.includes('_') &&
        aiSuggestedIds.includes(table.id);
      attemptSeat(isPartOfVirtualMerge ? aiSuggestedRawId : table.id);
      return;
    }
    // Reserved table → jump straight to the reservation panel (view,
    // edit, reassign, or seat the upcoming booking) instead of the
    // generic table panel. The reservation is matched by tableId; a
    // merged booking may store a virtual "i_j" id, so match by part
    // inclusion too. stopPropagation prevents the document-level
    // dismiss listener from clearing the reservation we just set when
    // switching directly from another open reservation panel.
    if (effectiveStatusFor(table) === "reserved" && setSelectedReservationId) {
      const res = (reservations || []).find(r => {
        if (r.tableId == null) return false;
        const tid = String(r.tableId);
        return tid === String(table.id) || tid.split('_').includes(String(table.id));
      });
      if (res) {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        setSelectedTableId(null);
        setSelectedReservationId(res.id);
        return;
      }
    }
    // Explicit mutual exclusion — opening a table panel closes the
    // reservation panel in the same tick (synchronous, no useEffect
    // delay, no possibility of both panels rendering on one frame).
    // Time-travel view is read-only apart from reservation taps — the
    // table panel shows LIVE state (timers, bussing, clear), which is
    // meaningless against a future floor.
    if (!isViewingToday) return;
    if (setSelectedReservationId) setSelectedReservationId(null);
    setSelectedTableId(table.id === selectedTableId ? null : table.id);
  };

  const groupLines = useMemo(() => {
    const groups = {};
    visibleTables.forEach(t => {
      if (t.groupId) {
        if (!groups[t.groupId]) groups[t.groupId] = [];
        groups[t.groupId].push(t);
      }
    });
    const lines = [];
    Object.values(groups).forEach(members => {
      if (members.length < 2) return;
      const sorted = [...members].sort((a, b) => a.x - b.x || a.y - b.y);
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = getEffectivePosition(sorted[i]);
        const b = getEffectivePosition(sorted[i + 1]);
        // Center each line endpoint inside the actual table footprint.
        // Rectangle tables have width ≠ height, so we use the shape-aware
        // px helper rather than assuming a square.
        const da = getTableSizePx(sorted[i].shape, sorted[i].capacity);
        const db = getTableSizePx(sorted[i + 1].shape, sorted[i + 1].capacity);
        lines.push({
          x1: a.x + da.width / 2, y1: a.y + da.height / 2,
          x2: b.x + db.width / 2, y2: b.y + db.height / 2,
        });
      }
    });
    return lines;
  }, [visibleTables, dragState]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border flex-shrink-0 flex-wrap">
        {/* Edit mode is entered from Settings → Floor & Service. The
            toolbar carries only the EXIT, shown while editing. */}
        {editMode && (
          <>
            <button onClick={() => {
                setEditMode(false);
                setMergeMode(false);
                setMergeSelection([]);
                setSelectedTableId(null);
                setMoveSourceId(null);
                // Symmetric with entering edit mode: clear assign mode so the
                // assign-click hijack doesn't compete with drag-to-rearrange.
                setIsAssignMode && setIsAssignMode(false);
                setAssignSelectedServer && setAssignSelectedServer(null);
              }}
              className="px-3 py-1.5 rounded-lg border font-mono text-[10px] tracking-[0.1em] uppercase font-bold transition-all duration-300 bg-ai text-bg border-ai shadow-lg shadow-ai/30">
              {migrationActive ? '✓ Keep Migration' : '✓ Done Editing'}
            </button>
            {migrationActive && (
              <button onClick={onCancelMigration}
                className="px-3 py-1.5 rounded-lg border font-mono text-[10px] tracking-[0.1em] uppercase font-bold transition-all duration-300 bg-panel-card text-rose-300 border-rose-500/50 hover:bg-rose-500/15 hover:border-rose-400">
                ✕ Cancel Migration
              </button>
            )}
            <div className="w-px h-5 bg-border mx-1" />
          </>
        )}
        {/* ─── Floor tabs ──────────────────────────────────────────
            Leftmost toolbar control in view mode; in edit mode the
            "✓ Done Editing" exit sits to their left. Visible in BOTH
            modes so the host has one consistent way to switch floors.
            Switching floors clears merge/drag/selection state. */}
        <div className="flex items-center gap-1">
          {floors.map(f => (
            renamingFloorId === f.id ? (
              <input
                key={f.id}
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { renameFloor(f.id, renameDraft); setRenamingFloorId(null); }
                  if (e.key === 'Escape') setRenamingFloorId(null);
                }}
                onBlur={() => { renameFloor(f.id, renameDraft); setRenamingFloorId(null); }}
                className="px-2 py-1.5 w-28 rounded-lg font-mono text-[10px] uppercase tracking-[0.08em] font-bold bg-panel-card text-ink-50 border border-ai/50 outline-none"
                aria-label="Rename floor"
              />
            ) : (
            <button
              key={f.id}
              data-floor-tab
              draggable={!hostMode}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/mesa-floor', f.id);
                e.dataTransfer.effectAllowed = 'move';
                setDragFloorId(f.id);
              }}
              onDragEnd={() => { setDragFloorId(null); setDropHint(null); }}
              onDragOver={(e) => {
                // Only floor-tab drags — party drags from the guest list
                // must fall through to the canvas untouched.
                if (!e.dataTransfer.types.includes('application/mesa-floor')) return;
                if (dragFloorId === f.id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const r = e.currentTarget.getBoundingClientRect();
                setDropHint({ id: f.id, side: e.clientX < r.left + r.width / 2 ? 'before' : 'after' });
              }}
              onDragLeave={() => setDropHint(h => (h && h.id === f.id ? null : h))}
              onDrop={(e) => {
                if (!e.dataTransfer.types.includes('application/mesa-floor')) return;
                e.preventDefault();
                const movedId = e.dataTransfer.getData('application/mesa-floor');
                setDragFloorId(null); setDropHint(null);
                if (!movedId || movedId === f.id || !reorderFloors) return;
                const ids = floors.map(x => x.id).filter(id => id !== movedId);
                const r = e.currentTarget.getBoundingClientRect();
                const at = ids.indexOf(f.id) + (e.clientX < r.left + r.width / 2 ? 0 : 1);
                ids.splice(at, 0, movedId);
                reorderFloors(ids);
              }}
              onClick={() => {
                setActiveFloorId && setActiveFloorId(f.id);
                setMergeSelection([]);
                setDragState && setDragState(null);
                setSelectedTableId(null);
                setMoveSourceId && setMoveSourceId(null);
              }}
              onDoubleClick={() => {
                if (editMode) { setRenameDraft(f.name); setRenamingFloorId(f.id); }
              }}
              title={editMode ? 'Double-click to rename · drag to reorder' : 'Drag to reorder'}
              className={`px-3.5 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-[0.08em] font-bold transition-all ${
                activeFloorId === f.id
                  ? "bg-ai/10 text-ai border border-ai/50"
                  : "bg-transparent text-ink-400 border border-transparent hover:text-ink-50 hover:bg-panel-up"
              } ${dragFloorId === f.id ? 'opacity-40' : ''} ${
                dropHint && dropHint.id === f.id
                  ? dropHint.side === 'before'
                    ? 'shadow-[inset_2px_0_0_0_var(--color-ai,#8b8bff)]'
                    : 'shadow-[inset_-2px_0_0_0_var(--color-ai,#8b8bff)]'
                  : ''
              }`}
            >
              {f.name}{f.onlineExcluded && ' 🔒'}{f.isManualOnly && !(editMode && activeFloorId === f.id) && <span className="ml-1 text-rose-400" title="Excluded from AI">AI⊘</span>}
              {/* Floor ⋮ menu stays in host mode: blocking a floor or
                  table from online booking / AI assignment is shift-time
                  host work (a private party, a closed section), not a
                  floorplan edit. */}
              {activeFloorId === f.id && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    setFloorMenu(m => (m && m.id === f.id ? null : { id: f.id, x: r.left, y: r.bottom + 6 }));
                  }}
                  className="ml-1.5 px-1 text-[14px] leading-none align-middle opacity-60 hover:opacity-100 cursor-pointer"
                  title="Floor options"
                  role="button"
                  aria-label="Floor options"
                >⋮</span>
              )}
              {editMode && activeFloorId === f.id && (
                <span
                  onClick={(e) => { e.stopPropagation(); setRenameDraft(f.name); setRenamingFloorId(f.id); }}
                  className="ml-1.5 opacity-60 hover:opacity-100 cursor-text"
                  title="Rename floor"
                  role="button"
                  aria-label="Rename floor"
                >✎</span>
              )}
              {editMode && activeFloorId === f.id && (
                <span
                  onClick={(e) => { e.stopPropagation(); toggleFloorManualOnly(f.id); }}
                  className={`ml-1 cursor-pointer ${f.isManualOnly ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}
                  title={f.isManualOnly ? 'Manual-only floor (AI excluded) — click to include' : 'Click to exclude this whole floor from AI'}
                  role="button"
                  aria-label="Toggle manual-only floor"
                >{f.isManualOnly ? 'AI⊘' : 'AI'}</span>
              )}
            </button>
            )
          ))}
          {exclusionMode && (
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2 rounded-xl bg-panel-card border border-amber-500/50 shadow-xl">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-amber-300 font-bold">
                {exclusionMode === 'ai' ? 'AI exclusion' : 'Online blocking'} — click tables to toggle
              </span>
              <span className="font-mono text-[10px] text-ink-400">
                {tables.filter(t => t.floorId === activeFloorId && (exclusionMode === 'ai' ? t.manualOnly : t.onlineExcluded)).length} excluded on this floor
              </span>
              <button
                onClick={() => setExclusionMode(null)}
                className="px-3 py-1 rounded-lg bg-ai text-bg font-mono text-[10px] uppercase tracking-[0.08em] font-bold hover:opacity-90"
              >✓ Done</button>
            </div>
          )}
          {floorMenu && (() => {
            const mf = floors.find(x => x.id === floorMenu.id);
            if (!mf) return null;
            const floorTables = tables.filter(t => t.floorId === mf.id);
            const allAi = floorTables.length > 0 && floorTables.every(t => t.manualOnly);
            const allOnline = floorTables.length > 0 && floorTables.every(t => t.onlineExcluded);
            const Row = ({ on, label, sub, onClick }) => (
              <button
                onClick={() => { onClick(); }}
                className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-panel-up transition-colors"
              >
                <span className={`mt-0.5 w-3.5 text-[11px] ${on ? 'text-ai' : 'text-ink-600'}`}>{on ? '✓' : ''}</span>
                <span className="flex-1">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.06em] text-ink-100">{label}</span>
                  {sub && <span className="block font-mono text-[9px] text-ink-500 mt-0.5">{sub}</span>}
                </span>
              </button>
            );
            return (
              <>
                {/* click-away layer */}
                <div className="fixed inset-0 z-40" onClick={() => setFloorMenu(null)} />
                <div
                  className="fixed z-50 w-64 bg-panel-card border border-border-hi rounded-xl shadow-2xl overflow-hidden py-1"
                  style={{ left: Math.min(floorMenu.x, window.innerWidth - 270), top: floorMenu.y }}
                >
                  <Row
                    on={!!mf.isManualOnly}
                    label="Floor: AI excluded"
                    sub="Auto-assign skips this whole floor"
                    onClick={() => toggleFloorManualOnly(mf.id)}
                  />
                  <Row
                    on={!!mf.onlineExcluded}
                    label="Floor: online reservations blocked"
                    sub="Enforced when the public site ships"
                    onClick={() => toggleFloorOnlineExcluded(mf.id)}
                  />
                  <div className="border-t border-border my-1" />
                  <Row
                    on={exclusionMode === 'ai'}
                    label={exclusionMode === 'ai' ? 'Tables: finish AI exclusion' : 'Tables: pick AI-excluded…'}
                    sub={exclusionMode === 'ai' ? 'Click tables to toggle, then finish here' : 'Click tables on the floor to toggle'}
                    onClick={() => { setExclusionMode(m => (m === 'ai' ? null : 'ai')); setFloorMenu(null); }}
                  />
                  <Row
                    on={exclusionMode === 'online'}
                    label={exclusionMode === 'online' ? 'Tables: finish online blocking' : 'Tables: pick online-blocked…'}
                    sub={exclusionMode === 'online' ? 'Click tables to toggle, then finish here' : 'Enforced when the public site ships'}
                    onClick={() => { setExclusionMode(m => (m === 'online' ? null : 'online')); setFloorMenu(null); }}
                  />
                </div>
              </>
            );
          })()}
        </div>
        {editMode && (
          <>
            {/* ─── Inline Add Floor ─────────────────────────────────
                Replaces window.prompt(). isAddingFloor toggles the
                button into an input. Enter commits, Escape cancels.
                The "×" button is a third escape path for click-to-
                cancel users. */}
            <div className="w-px h-5 bg-border mx-1" />
            {isAddingFloor ? (
              <div className="flex items-center gap-2 bg-panel-card border border-border-hi rounded-lg px-2 py-1">
                <input
                  type="text"
                  autoFocus
                  value={newFloorName}
                  onChange={(e) => setNewFloorName && setNewFloorName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newFloorName.trim()) {
                      addFloor && addFloor(newFloorName);
                    }
                    if (e.key === 'Escape') {
                      setNewFloorName && setNewFloorName("");
                      setIsAddingFloor && setIsAddingFloor(false);
                    }
                  }}
                  placeholder="Floor name..."
                  className="bg-transparent text-[11px] text-ink-50 outline-none w-28 font-mono"
                />
                {/* Physical commit button — mirrors the Enter key so the
                    host can finish without reaching for the keyboard.
                    Disabled until a non-empty name is typed. */}
                <button
                  onClick={() => addFloor && addFloor(newFloorName)}
                  disabled={!newFloorName.trim()}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-ai text-bg font-mono text-[10px] uppercase tracking-[0.06em] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                  title="Add floor"
                >↵ Enter</button>
                <button
                  onClick={() => {
                    setNewFloorName && setNewFloorName("");
                    setIsAddingFloor && setIsAddingFloor(false);
                  }}
                  className="text-ink-400 hover:text-ink-50 text-xs"
                >×</button>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingFloor && setIsAddingFloor(true)}
                className="px-3 py-1.5 rounded-lg border border-dashed border-gray-600 text-gray-400 text-[10px] font-mono uppercase tracking-[0.08em] hover:text-white hover:border-gray-400 transition-colors"
              >
                + Add Floor
              </button>
            )}
            {/* ─── Delete Floor ─────────────────────────────────────
                Only rendered when there's more than one floor — can't
                delete the last one (host would lose all tables and
                have nowhere to switch to). Uses state-seated (rose)
                color which is the codebase's existing destructive-
                action accent. */}
            {floors.length > 1 && (
              <button
                onClick={() => deleteFloor && deleteFloor(activeFloorId)}
                className="px-3 py-1.5 rounded-lg border border-state-seated/40 text-state-seated text-[10px] font-mono uppercase tracking-[0.08em] hover:bg-state-seated/10 transition-colors"
              >
                Delete Floor
              </button>
            )}
            {/* ─── Manual Assign Only — preserved per critical rule.
                When true, the AI Seating Agent and AI Server Assigner
                skip every table on this floor entirely. The 🔒 emoji
                also appears in the tab label above when active so the
                host has visual confirmation in both places. */}
            <label className="flex items-center gap-2 bg-panel-card border border-border-hi rounded-lg px-2 py-1 cursor-pointer hover:border-ai transition-colors">
              <input
                type="checkbox"
                checked={activeFloor?.isManualOnly || false}
                onChange={e => {
                  const checked = e.target.checked;
                  setFloors && setFloors(prev => prev.map(f =>
                    f.id === activeFloorId ? { ...f, isManualOnly: checked } : f
                  ));
                }}
                className="accent-ai"
              />
              <span className="font-mono text-[9px] text-ink-400 tracking-[0.1em] uppercase">
                Manual Only <span className="text-ink-50/60">(Exclude from AI)</span>
              </span>
            </label>
            <div className="w-px h-5 bg-border" />
            {/* ─── Undo ───────────────────────────────
                Reverts the last structural edit — add/delete table,
                rotate, renumber, or add/delete floor. Drag-to-move is
                intentionally out of scope (trivially reversible by
                dragging back). Disabled when the history stack is empty.
                Table creation moved to the Table Designer sidebar that
                replaces the reservation rail while editing. */}
            <button
              onClick={() => undo && undo()}
              disabled={!canUndo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel-card border border-border-hi text-ink-50 font-mono text-[10px] tracking-[0.08em] uppercase font-bold hover:border-ai disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border-hi transition-colors"
              title="Undo last change"
            >
              <span className="text-sm leading-none">↶</span> Undo
            </button>
          </>
        )}
        {/* Floor zoom controls — live in the toolbar so they never cover
            tables. Wheel-zoom works anywhere on the canvas too. */}
        <div data-floor-controls className="ml-auto flex items-center gap-1 bg-panel-card border border-border-hi rounded-lg px-1.5 py-1" onMouseDown={(e) => e.stopPropagation()}>
          <button onClick={() => zoomStep(-1)} disabled={zoom <= minimumZoom() + 0.001} className="w-11 h-11 rounded-md flex items-center justify-center text-ink-300 hover:text-ink-50 hover:bg-panel disabled:opacity-30 text-xl font-bold leading-none transition-colors" title="Zoom out" aria-label="Zoom out">&minus;</button>
          <span className="w-10 text-center font-mono text-[10px] text-ink-400 tabular-nums select-none">{zoom <= minimumZoom() + 0.001 ? '0%' : `${Math.round(zoom * 100)}%`}</span>
          <button onClick={() => zoomStep(1)} disabled={zoom >= 1.9999} className="w-11 h-11 rounded-md flex items-center justify-center text-ink-300 hover:text-ink-50 hover:bg-panel disabled:opacity-30 text-xl font-bold leading-none transition-colors" title="Zoom in" aria-label="Zoom in">+</button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <button onClick={fitView} className="px-2 min-w-11 h-11 rounded-md flex items-center justify-center text-ink-300 hover:text-ink-50 hover:bg-panel font-mono text-[9px] uppercase tracking-[0.08em] font-bold transition-colors" title="Fit all tables" aria-label="Fit all tables">Fit</button>
          {hostMode && onToggleServiceLog && (
            <button onClick={onToggleServiceLog} className={`ml-3 min-w-11 h-11 rounded-md flex items-center justify-center px-2 font-mono text-[9px] uppercase tracking-[0.08em] font-bold transition-colors ${serviceLogOpen ? 'bg-ai/15 text-ai' : 'text-ink-300 hover:text-ink-50 hover:bg-panel'}`} title="Toggle service log" aria-label="Toggle service log">Log</button>
          )}
          {editMode && underlay && (
            <button
              onClick={() => setShowUnderlay(v => !v)}
              className={`px-2 h-7 rounded-md flex items-center justify-center font-mono text-[9px] uppercase tracking-[0.08em] font-bold transition-colors ${showUnderlay ? 'text-amber-200 bg-panel' : 'text-ink-300 hover:text-ink-50 hover:bg-panel'}`}
              title="Toggle source-photo underlay"
              aria-label="Toggle source-photo underlay"
            >Photo</button>
          )}
        </div>
      </div>

      {/* Floor canvas — fills all available space below the toolbar.
          Collapsed the previous outer wrapper + fixed-size card into a
          single full-bleed canvas. id="floor-canvas" preserved because
          the drag handler reads it via getElementById to clamp drops
          inside the canvas bounds. */}
      {/* Time-travel banner — pinned above the canvas whenever the
          floor is rendering a date other than today. */}
      {!isViewingToday && viewDate && (
        <div className="flex items-center justify-center gap-4 bg-ai/10 border-b-2 border-ai px-4 py-2.5">
          <span className="text-base leading-none">🗓️</span>
          <div className="text-sm text-ink-50">
            {formatDateKey(viewDate) < formatDateKey(new Date(now)) ? 'Viewing Past Shift:' : 'Viewing Future Shift:'} <strong className="text-ai">{formatDateHuman(formatDateKey(viewDate))}</strong>
          </div>
          <button
            onClick={() => setViewDate && setViewDate(new Date())}
            className="px-3 py-1.5 rounded-lg bg-ai text-bg font-mono text-[10px] uppercase tracking-[0.08em] font-bold hover:opacity-90 transition-opacity"
          >
            Return to Today
          </button>
        </div>
      )}
      <div id="floor-canvas" style={{ touchAction: 'none' }} className={`flex-1 relative overflow-hidden bg-panel ${editMode || mergeMode ? "ring-1 ring-ai/30 ring-inset" : ""}`}
        onClick={() => {
          // A pan-drag ends in a click; don't let it deselect/cancel.
          if (panMovedRef.current) { panMovedRef.current = false; return; }
          if (!mergeMode) { setSelectedTableId(null); setMoveSourceId(null); }
          // Background click cancels EITHER pending table-pick flow, so the
          // host is never stuck: the reservation assignment (point-and-click
          // mode) and the party seating both clear here. Without the second
          // one, the single-flow guard could trap a host with a pending
          // seating and no way to dismiss it.
          if (setReassignReservationId) setReassignReservationId(null);
          if (setSelectedPartyId) setSelectedPartyId(null);
        }}
        onDragOver={(e) => {
          // Allow dropping table presets dragged from the Table Designer.
          if (!editMode) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => {
          if (!editMode) return;
          e.preventDefault();
          const raw = e.dataTransfer.getData('application/mesa-table');
          if (!raw) return;
          let data;
          try { data = JSON.parse(raw); } catch { return; }
          // Convert the drop point from SCREEN space to WORLD space
          // through the current pan/zoom transform, so the table lands
          // exactly under the cursor regardless of zoom or pan.
          const rect = e.currentTarget.getBoundingClientRect();
          const size = getTableSizePx(data.shape, data.capacity);
          const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
          const x = Math.round(world.x - size.width / 2);
          const y = Math.round(world.y - size.height / 2);
          addTable && addTable(data.capacity, data.shape, data.area, { x, y });
        }}
        onMouseDown={startPan}
        >
        {/* Pan/zoom transform layer — display only; saved table x/y never
            change. transform-origin 0 0 keeps table coordinates linear. */}
        <div className="absolute top-0 left-0 w-full h-full" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
        {/* Migration tracing underlay: the source photo ghosted at the
            exact world-box its tables were mapped into — correction
            becomes "drag the tile onto the ghost". Edit-mode only. */}
        {editMode && underlay && showUnderlay && (
          <img
            src={underlay.src}
            alt=""
            draggable={false}
            className="absolute pointer-events-none select-none"
            style={{ left: underlay.x, top: underlay.y, width: underlay.w, height: underlay.h, opacity: 0.35 }}
          />
        )}
        <svg className="absolute inset-0 pointer-events-none" style={{ width: 3000, height: 2200, overflow: 'visible' }}>
          {groupLines.map((line) => (
            <line key={`${line.x1}:${line.y1}:${line.x2}:${line.y2}`} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="#5ce1e6" strokeWidth="2" strokeDasharray="5 4" opacity="0.55" />
          ))}
        </svg>
        {/* Section-view empty state — when the heatmap is on but no table
            on this floor has a section, the whole room dims; this notice
            explains why. pointer-events-none so it never blocks clicks,
            and it disappears the moment any section is assigned. */}
        {sectionView && !editMode && visibleTables.every(t => !t.assignedServerId) && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <div className="bg-panel-up/95 border border-border-hi rounded-2xl shadow-2xl px-8 py-6 max-w-sm text-center animate-[fadeIn_0.2s_ease-out]">
              <div className="text-3xl mb-3">🗺️</div>
              <div className="font-display text-lg font-bold text-ink-50 mb-2">No sections assigned yet</div>
              <div className="text-sm text-ink-400 leading-relaxed">
                Tables are dimmed because no waiter has a section on this floor yet.
                Use <strong className="text-ink-50">Assign</strong> or <strong className="text-ai">✨ AI Assign</strong> in
                the left sidebar to create sections.
              </div>
            </div>
          </div>
        )}
          {visibleTables.map(t => {
            const meta = stateMeta[t.status];
            const pos = getEffectivePosition(t);
            const isDragging = dragState?.tableId === t.id;
            // Group members move alongside the dragged table via the
            // same transform; they need transitions disabled too,
            // otherwise the transform animates over 300ms and lags
            // behind the cursor visibly.
            const draggedTable = dragState ? tables.find(x => x.id === dragState.tableId) : null;
            const isMovingInDrag = isDragging || (draggedTable?.groupId && t.groupId === draggedTable.groupId);
            const isSelected = selectedTableId === t.id;
            const isAiSuggested = aiSuggestedIds.includes(t.id);
            const isReadyManual = !!selectedParty && allAvailableIds.includes(t.id) && !isAiSuggested;
            const isMoveTarget = moveTargetIds.includes(t.id);
            const moveSource = tables.find(x => x.id === moveSourceId);
            const isMoveSourceVisual = moveSourceId === t.id || (moveSource?.groupId && moveSource.groupId === t.groupId);
            const isInMerge = mergeSelection.includes(t.id);
            const isGrouped = !!t.groupId;
            const remaining = remainingMin(t, now, tables);
            const effStatus = effectiveStatusFor(t);
            // In merge mode, once a selection exists, tables that aren't
            // adjacent to it are ineligible — dim them like occupied ones
            // so the eligible neighbors stand out.
            const notAdjacentToSelection = mergeMode && mergeSelection.length > 0 &&
              !mergeSelection.includes(t.id) &&
              !tables.filter(x => mergeSelection.includes(x.id)).some(s => areTablesAdjacent(s, t, tables.filter(x => x.floorId === t.floorId)));
            // Ineligibility is date-aware while assigning a reservation:
            // the booking's date decides (another reservation within an
            // hour on that date), not the table's right-now status. In
            // the non-merge assign flow only true conflicts dim.
            const assignFlagged = conflictsWithAssigning(t) || occupiedSoonForAssigning(t);
            const mergeIneligible = assigningReservation
              ? (assignFlagged || t.groupId || notAdjacentToSelection)
              : (t.status !== "available" || t.groupId || notAdjacentToSelection);
            const dim = mergeMode ? mergeIneligible : (assigningReservation ? assignFlagged : false);
            const borderStyle = isGrouped ? `2px dashed #5ce1e6` : 'none';
            const ringClasses = isInMerge ? "ring-2 ring-ai shadow-lg shadow-ai/40" : isSelected ? "ring-2 ring-ai shadow-lg shadow-ai/30 z-20" : isAiSuggested ? "ring-2 ring-ai shadow-lg shadow-ai/40 animate-pulse z-10" : isMoveTarget ? "ring-2 ring-ai shadow-lg shadow-ai/40 animate-pulse z-10" : isReadyManual ? "ring-1 ring-ai/25 mesa-ready" : "hover:-translate-y-0.5";

            // ── Color hierarchy (strict precedence) ───────────────────
            //   1. AI suggestion         → cyan + pulse (overrides all)
            //   2. Occupied              → deep wine (seated OR dining —
            //                                    both mean a party is at the table)
            //   3. Needs bussing         → bright yellow (table was occupied
            //                                    but the party has left; staff
            //                                    action needed before next seat)
            //   4. Available (whether or not it has an upcoming
            //      reservation) → deep emerald. Upcoming reservations
            //      are surfaced via the digital clock badge below, not
            //      via the table fill color.
            const isSectionView = sectionView;
            // Section-view heatmap tint: the assigned server's effective
            // colour (custom or palette) as a translucent fill, applied via
            // inline backgroundColor below. Null when unassigned / off-shift
            // assigned / AI-suggested → falls through to a class instead.
            const sectionTintHex = (sectionsApply && isSectionView && !editMode && !isAiSuggested && t.assignedServerId)
              ? serverColorHex(t.assignedServerId)
              : null;
            const getTableColor = () => {
              if (isAiSuggested) return "bg-cyan-400 animate-pulse";
              // Section view overrides status colors: every assigned table
              // gets a server-keyed translucent tint (inline backgroundColor,
              // set in the style prop). Unassigned (or off-shift assigned)
              // tables get the dimmed-panel fallback class so they recede.
              if (isSectionView && !editMode) return sectionTintHex ? '' : 'bg-panel-card border-border-hi opacity-30';
              // Assignment preview: while placing a reservation the floor
              // shows the BOOKING date's availability — non-conflicting
              // tables read available regardless of who's sitting there
              // right now; conflicting tables are dimmed via `dim`.
              if (assigningReservation) return "bg-emerald-800";
              if (effStatus === "seated" || effStatus === "dining") return "bg-rose-900";
              if (effStatus === "bussing") return "bg-yellow-400";
              return "bg-emerald-800";
            };
            // Bussing's bright yellow needs dark text for legibility;
            // every other status uses a dark bg where white text reads
            // fine. Kept as a sibling helper to getTableColor so all
            // color decisions for the table live in one block.
            const isBussingTile = effStatus === "bussing" && !isAiSuggested;
            const dims = getTableDimensions(t.shape, t.capacity);
            // Round tables need overflow-hidden so the absolute-positioned
            // stripe gets clipped to the circle shape (otherwise it pokes
            // out of the rounded-full corners). Only applied when !editMode
            // because the trash button lives at -top-2 -right-2 outside
            // the bounding box and would be clipped if we added it
            // unconditionally. Trash button only renders in editMode anyway,
            // and stripe only renders in !editMode, so the two never need
            // to coexist with conflicting overflow rules.
            const needsClip = !editMode && t.shape === 'round';

            // All upcoming reservations attached to this table.
            // Handles both single-table ids (numeric, exact match) and
            // merged "i_j" string ids (split on underscore, match any
            // base) — a reservation attached to a merge surfaces on
            // every base table's clock badges. Status === 'arrived'
            // skips: the party is physically here, no badge needed.
            // Sort is chronological so the earliest booking renders
            // first in the wrap order. The parse is intentionally tiny
            // (in-line, not exported) — frontend doesn't need the
            // backend's full edge-case-tolerant version for this purpose;
            // anything unparseable sorts last via the Infinity fallback.
            const parseResTime = (s) => {
              if (typeof s !== 'string') return Infinity;
              const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/i);
              if (!m) return Infinity;
              let h = parseInt(m[1], 10);
              const mn = m[2] ? parseInt(m[2], 10) : 0;
              if (h === 12) h = 0;
              if (m[3].toLowerCase() === 'p') h += 12;
              return h * 60 + mn;
            };
            const tableReservations = reservations
              .filter(r => {
                if (!r.tableId || r.status === 'arrived') return false;
                const assignedIds = String(r.tableId).split('_');
                return assignedIds.includes(String(t.id));
              })
              .sort((a, b) => parseResTime(a.time) - parseResTime(b.time));

            return (
              <div key={t.id} data-table-tile data-table-id={String(t.id)}
                ref={el => { tableRefs.current[t.id] = el; }}
                onDragOver={(e) => {
                  // Only react to a party being dragged from the guest list —
                  // never to table presets (those belong to the canvas).
                  if (editMode) return;
                  if (!e.dataTransfer.types.includes('application/mesa-party')) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  if (editMode) return;
                  const partyId = e.dataTransfer.getData('application/mesa-party');
                  if (!partyId) return;
                  e.preventDefault();
                  e.stopPropagation();
                  onSeatPartyDrop && onSeatPartyDrop(partyId, t.id);
                }}
                className={`absolute ${dims} ${getTableColor()} ${sectionsApply && !editMode && t.assignedServerId && (sectionView || viewingServerId === t.assignedServerId) ? 'pl-4' : ''} ${needsClip ? 'overflow-hidden' : ''} flex flex-col items-center justify-center ${isMovingInDrag ? 'transition-none' : 'transition-all duration-300'} select-none ${exclusionMode ? ((exclusionMode === 'ai' ? t.manualOnly : t.onlineExcluded) ? (exclusionMode === 'ai' ? 'ring-2 ring-amber-400' : 'ring-2 ring-sky-400') : 'ring-1 ring-border-hi') : ''} ${ringClasses} ${isDragging ? 'z-30 cursor-grabbing' : 'cursor-pointer'} ${dim ? 'opacity-30' : ''}`}
                style={{ left: pos.x, top: pos.y, border: borderStyle, transform: t.rotation ? `rotate(${t.rotation}deg)` : undefined, transformOrigin: 'center', ...(sectionTintHex ? { backgroundColor: hexToRgba(sectionTintHex, 0.3) } : {}) }}
                onMouseDown={(e) => startDrag(e, t)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (editMode) {
                    // A genuine click (not the tail of a drag) toggles this
                    // table's edit popup.
                    if (dragMovedRef.current) return;
                    setEditPopupTableId(prev => (prev === t.id ? null : t.id));
                    return;
                  }
                  handleTableClick(e, t);
                }}>
                {/* Server section accent — vertical stripe down the left
                    edge of the table, color-keyed to the sidebar legend.
                    Renders when the table's assigned server is the one
                    being viewed (per-server filter), OR when sectionView
                    is active (the global heatmap toggle, engaged by AI
                    Auto-Assign completion or by the manual sidebar
                    toggle). Hidden in editMode (drag operations). */}
                {sectionsApply && !editMode && t.assignedServerId && (sectionView || viewingServerId === t.assignedServerId) && (() => {
                  const stripeHex = serverColorHex(t.assignedServerId);
                  if (!stripeHex) return null;
                  const assignedServer = servers.find(s => s.id === t.assignedServerId);
                  return (
                    <div
                      className="absolute left-0 top-0 bottom-0 w-3 rounded-l-md"
                      style={{ backgroundColor: stripeHex }}
                      aria-hidden="true"
                      title={assignedServer ? `Section: ${assignedServer.name}` : undefined}
                    />
                  );
                })()}
                {/* Area label — only shown for non-dining tables (dining
                    is the default; an unlabeled table reads as dining). */}
                {t.area && t.area !== 'dining' && (
                  <span className={`font-mono text-[7px] tracking-[0.15em] uppercase leading-none mb-0.5 ${isBussingTile ? "text-yellow-950/60" : "text-white/55"}`}>
                    {t.area}
                  </span>
                )}
                {(t.onlineExcluded || t.manualOnly) && (
                  <div className="absolute -top-2 -right-2 flex items-center gap-0.5 pointer-events-none" aria-label="Table restrictions">
                    {t.onlineExcluded && <span className="min-w-4 h-4 px-0.5 rounded-full bg-panel-card border border-border-hi text-[10px] leading-[14px] text-ink-50" title="Online reservations blocked">🔒</span>}
                    {t.manualOnly && <span className="min-w-4 h-4 px-0.5 rounded-full bg-rose-950 border border-rose-400/70 text-[7px] leading-[14px] font-bold text-rose-300" title="Excluded from AI">AI⊘</span>}
                  </div>
                )}
                {/* Capacity (above) + name (below). Capacity reads as
                    a small muted label so the name is the focal text;
                    flipped from the previous order to keep the bottom
                    of the tile clear for the digital clock badges.
                    Bussing-aware color branches preserved for both
                    spans so the layout reads correctly on yellow tiles. */}
                <div className="flex flex-col items-center justify-center" style={t.rotation ? { transform: `rotate(${-t.rotation}deg)` } : undefined}>
                  <span className={`font-mono text-[9px] font-medium leading-none mb-0.5 ${isBussingTile ? "text-yellow-950/70" : "text-ink-400/80"}`}>{t.capacity}-top</span>
                  <span className={`font-display text-sm font-bold leading-none ${isBussingTile ? "text-yellow-950" : "text-white"}`}>{t.name}</span>
                  {/* Digital clock badges — one per upcoming reservation
                      held for this table (incl. merged groups). They live
                      INSIDE this counter-rotated column so they always sit
                      directly below the table number: the old version
                      anchored them to the tile's local bottom edge, which
                      a 90°/270° rotation remapped to a visual SIDE — the
                      "time floating off the left of the table" artifact. */}
                  {tableReservations.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1 mt-1 z-10" style={{ maxWidth: Math.max(44, getTableSizePx(t.shape, t.capacity).width - 12) }}>
                      {tableReservations.map(res => (
                        <div key={res.id} className="bg-gray-950/90 border border-gray-700/50 backdrop-blur-sm px-1 py-[2px] rounded text-[7px] leading-none font-mono text-gray-200 font-semibold tracking-wider shadow-sm flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-state-reserved animate-pulse"></span>
                          {res.time}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Remaining turn time — top-right absolute so the
                    bottom of the tile stays clear for the reservation
                    clock badges. Hidden when there's nothing to show
                    (available/reserved tables with no startedAt). */}
                {mounted && isViewingToday && remaining !== null && remaining > 0 && (
                  <span className={`absolute font-mono text-[9px] tabular-nums font-medium leading-none origin-center ${t.shape === 'round' ? 'top-[18%] right-[18%]' : 'top-1 right-1.5'} ${isBussingTile ? "text-yellow-950/90" : "text-white/70"}`} style={t.rotation ? { transform: `rotate(${-t.rotation}deg)` } : undefined}>~{remaining}m</span>
                )}
              </div>
            );
          })}
          {/* Section chips — always-on per-table server tags. Rendered as
              canvas siblings (like the edit popup) so they stay upright and
              are never clipped by round-table overflow or rotated with the
              tile. Each table shows its OWN assigned server's initials +
              colour, so a table reads correctly even when it physically sits
              inside another server's area — the per-table fix that grouped
              zones couldn't give. On-shift assignments only (serverColorHex
              returns null otherwise). Hidden in editMode. */}
          {sectionsApply && !editMode && visibleTables.map(t => {
            if (!t.assignedServerId) return null;
            const hex = serverColorHex(t.assignedServerId);
            if (!hex) return null;
            const sv = servers.find(s => s.id === t.assignedServerId);
            const pos = getEffectivePosition(t);
            const size = getTableSizePx(t.shape, t.capacity);
            const cx = pos.x + size.width / 2, cy = pos.y + size.height / 2;
            const r = (t.rotation || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
            // Top-left corner rotated about the table centre, then nudged
            // ~11px inward so the upright chip sits on the table corner.
            let px = cx + (-size.width / 2) * c - (-size.height / 2) * s;
            let py = cy + (-size.width / 2) * s + (-size.height / 2) * c;
            const len = Math.hypot(cx - px, cy - py) || 1;
            px += (cx - px) / len * 11; py += (cy - py) / len * 11;
            return (
              <span
                key={`chip-${t.id}`}
                className="absolute z-20 -translate-x-1/2 -translate-y-1/2 px-1 h-[15px] min-w-[15px] rounded-[4px] flex items-center justify-center font-mono text-[8px] font-bold leading-none shadow-md ring-1 ring-black/25 pointer-events-none"
                style={{ left: px, top: py, backgroundColor: hex, color: textOnColor(hex) }}
                title={sv ? `Section: ${sv.name}` : undefined}
                aria-hidden="true"
              >
                {serverInitials(sv && sv.name)}
              </span>
            );
          })}
        </div>{/* end pan/zoom transform layer */}
          {/* ─── Table edit popup ──────────────────────────────────────
              Click-anchored controls for the selected table. Rendered as a
              canvas sibling (not a tile child) so it never inherits the
              table's rotation and stays upright. Positioned above the
              table — the vertical offset clears the table's rotated extent
              so it never overlaps. Dismissed by the outside-click handler. */}
          {editMode && editPopupTableId && (() => {
            const pt = visibleTables.find(t => t.id === editPopupTableId);
            if (!pt) return null;
            const ppos = getEffectivePosition(pt);
            const psize = getTableSizePx(pt.shape, pt.capacity);
            const centerX = ppos.x + psize.width / 2;
            const centerY = ppos.y + psize.height / 2;
            const rot = ((pt.rotation || 0) % 360) * Math.PI / 180;
            const clearance = pt.shape === 'round'
              ? psize.height / 2
              : Math.abs((psize.height / 2) * Math.cos(rot)) + Math.abs((psize.width / 2) * Math.sin(rot));
            // Project the table's world center to SCREEN space through the
            // pan/zoom transform so the popup sits right above the table at
            // any zoom/pan. The clearance scales with zoom (the table looks
            // bigger when zoomed in); the popup itself stays a constant,
            // readable size because it lives outside the transform layer.
            const screenX = centerX * zoom + pan.x;
            const screenY = centerY * zoom + pan.y;
            const offset = clearance * zoom + 8;
            return (
              <div
                ref={popupRef}
                data-table-popup
                onMouseDown={(e) => e.stopPropagation()}
                data-edit-popup
                onClick={(e) => e.stopPropagation()}
                className="absolute z-50 flex flex-col items-center"
                style={{ left: screenX, top: screenY, transform: `translate(-50%, calc(-100% - ${offset}px))` }}
              >
                <div className="bg-panel-up border border-border-hi rounded-xl shadow-2xl px-3 py-2.5 flex flex-col gap-2 min-w-[210px]">
                  {/* Actions: rotate left / right, delete */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => rotateTable && rotateTable(pt.id, -1)}
                      className="w-11 h-8 rounded-lg flex items-center justify-center gap-0.5 text-ink-300 hover:text-ink-50 hover:bg-panel font-mono text-base font-bold leading-none transition-colors border border-border-hi"
                      title="Rotate left"
                      aria-label="Rotate table left"
                    >&#8592;</button>
                    <button
                      onClick={() => rotateTable && rotateTable(pt.id, 1)}
                      className="w-11 h-8 rounded-lg flex items-center justify-center gap-0.5 text-ink-300 hover:text-ink-50 hover:bg-panel font-mono text-base font-bold leading-none transition-colors border border-border-hi"
                      title="Rotate right"
                      aria-label="Rotate table right"
                    >&#8594;</button>
                    <button
                      onClick={() => setTableShape && setTableShape(pt.id)}
                      className="w-11 h-8 rounded-lg flex items-center justify-center text-ink-300 hover:text-ink-50 hover:bg-panel text-sm leading-none transition-colors border border-border-hi"
                      title={`Shape: ${pt.shape} — click to change`}
                      aria-label="Change table shape"
                    >{pt.shape === 'round' ? '●' : pt.shape === 'rectangle' ? '▬' : '■'}</button>
                    <div className="flex-1" />
                    <button
                      onClick={() => { deleteTable && deleteTable(pt.id); setEditPopupTableId(null); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-state-seated hover:bg-state-seated/15 text-lg leading-none transition-colors"
                      title="Delete table"
                    >×</button>
                  </div>
                  <div className="h-px bg-border -mx-1" />
                  {/* Change seat number */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[10px] text-ink-400 tracking-[0.1em] uppercase">Seats</span>
                    <div className="flex items-center gap-1 bg-panel border border-border rounded-lg px-1 py-0.5">
                      <button
                        onClick={() => setTableCapacity && setTableCapacity(pt.id, (pt.capacity || 1) - 1)}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-ink-50 hover:bg-panel-up hover:text-ai text-base leading-none transition-colors"
                        title="Fewer seats"
                      >−</button>
                      <span className="w-7 text-center font-mono text-sm text-ink-50 font-bold tabular-nums">{pt.capacity}</span>
                      <button
                        onClick={() => setTableCapacity && setTableCapacity(pt.id, (pt.capacity || 1) + 1)}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-ink-50 hover:bg-panel-up hover:text-ai text-base leading-none transition-colors"
                        title="More seats"
                      >+</button>
                    </div>
                  </div>
                  {/* Zone — what the table is dedicated as; mirrors the
                      add-table picker so the vocabulary stays identical */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[10px] text-ink-400 tracking-[0.1em] uppercase">Zone</span>
                    <div className="flex items-center gap-0.5 p-0.5 bg-panel border border-border rounded-lg">
                      {['dining', 'bar', 'patio'].map(a => (
                        <button
                          key={a}
                          onClick={() => setTableArea && setTableArea(pt.id, a)}
                          className={`px-2 py-1 rounded-md font-mono text-[9px] uppercase tracking-[0.05em] transition-colors ${
                            (pt.area || 'dining') === a ? 'bg-ai text-bg font-bold' : 'text-ink-400 hover:text-ink-50'
                          }`}
                          title={`Dedicate as ${a}`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Per-table AI opt-out */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[10px] text-ink-400 tracking-[0.1em] uppercase">Auto-assign</span>
                    <button
                      onClick={() => toggleTableManualOnly && toggleTableManualOnly(pt.id)}
                      className={`px-2.5 py-1 rounded-lg font-mono text-[9px] uppercase tracking-[0.06em] font-bold border transition-colors ${
                        pt.manualOnly
                          ? 'bg-panel-card text-amber-300 border-amber-500/50 hover:border-amber-400'
                          : 'bg-panel text-ink-300 border-border hover:text-ink-50'
                      }`}
                      title={pt.manualOnly ? 'Excluded from AI auto-assign — click to include' : 'Included in AI auto-assign — click to exclude'}
                    >{pt.manualOnly ? 'AI⊘ Excluded' : 'AI included'}</button>
                  </div>
                  {/* Change table number — sits under the seat control */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[10px] text-ink-400 tracking-[0.1em] uppercase">Table</span>
                    <div className="flex items-center gap-1 bg-panel border border-border rounded-lg px-2 py-0.5 focus-within:border-ai transition-colors">
                      <span className="font-mono text-xs text-ink-400">T</span>
                      <input
                        inputMode="numeric"
                        value={numberDraft}
                        onChange={(e) => setNumberDraft(e.target.value.replace(/[^0-9]/g, ''))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitNumber(pt.id); e.currentTarget.blur(); }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            const cur = tables.find(t => t.id === pt.id);
                            setNumberDraft(cur ? String(cur.name).replace(/[^0-9]/g, '') : '');
                            e.currentTarget.blur();
                          }
                        }}
                        onBlur={() => commitNumber(pt.id)}
                        className="w-12 bg-transparent font-mono text-sm text-ink-50 font-bold outline-none tabular-nums"
                      />
                    </div>
                  </div>
                </div>
                {/* caret pointing down at the table */}
                <div className="w-2.5 h-2.5 bg-panel-up border-r border-b border-border-hi rotate-45 -mt-[6px]" />
              </div>
            );
          })()}
        </div>
    </div>
  );
}

function PredictorView({ forecast = null, loading = false, error = null, onRefresh, date, setDate }) {
  // 7-day selector chips
  const dayChips = useMemo(() => {
    const out = [];
    const now = new Date();
    for (let i = 0; i < 8; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({
        iso,
        label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }),
      });
    }
    return out;
  }, []);
  const f = forecast;
  const maxHourly = f && f.hourly && f.hourly.length ? Math.max(...f.hourly.map(x => x.expected), 1) : 1;
  const verdictStyle = f && f.staffing ? (
    f.staffing.verdict === 'under' ? 'text-amber-300 border-amber-500/50 bg-amber-500/10'
    : f.staffing.verdict === 'over' ? 'text-sky-300 border-sky-500/50 bg-sky-500/10'
    : f.staffing.verdict === 'balanced' ? 'text-emerald-300 border-emerald-500/50 bg-emerald-500/10'
    : 'text-ink-400 border-border bg-panel'
  ) : '';
  return (
    <div className="flex-1 overflow-auto p-6 bg-bg">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink-50 tracking-tight">Shift Forecast</h2>
            <p className="font-mono text-[10px] text-ink-400 mt-1">Deterministic forecast from your own history, the book, the floor, live weather, and web research — anything unknown is excluded and listed.</p>
          </div>
          {onRefresh && (
            <button onClick={onRefresh} disabled={loading} className="font-mono text-[10px] text-ai uppercase tracking-[0.1em] hover:opacity-80 disabled:opacity-40">
              {loading ? '◆ forecasting…' : '↻ refresh'}
            </button>
          )}
        </div>

        {/* Date selector */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {dayChips.map(c => (
            <button key={c.iso} onClick={() => setDate && setDate(c.iso)}
              className={`px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-[0.06em] font-bold border transition-colors ${
                date === c.iso ? 'bg-ai/10 text-ai border-ai/50' : 'bg-panel text-ink-400 border-border hover:text-ink-50'
              }`}>{c.label}</button>
          ))}
        </div>
        {/* No manual "declare" toggles: events, promotions, construction
            and competitor action are researched live from the web per
            forecast date and appear in the factors card below. */}

        {loading && !f && (
          <div className="bg-panel border border-border rounded-2xl p-10 text-center">
            <div className="font-mono text-[10px] text-ai tracking-[0.2em] uppercase animate-pulse">◆ Building the shift forecast…</div>
            <div className="font-mono text-[10px] text-ink-400 mt-3 leading-relaxed">Researching this date on the web — local events, access, competitors, promotions, reviews, buzz and season. The first forecast of a date can take a minute or two; after that it's cached.</div>
          </div>
        )}
        {error && !f && (
          <div className="bg-panel border border-state-seated/40 rounded-2xl p-10 text-center">
            <div className="font-mono text-[10px] text-state-seated tracking-[0.2em] uppercase font-bold mb-2">◆ Forecast unavailable</div>
            <div className="text-[12px] text-ink-400">{error}</div>
          </div>
        )}

        {f && (
          <div className={`grid grid-cols-1 lg:grid-cols-3 gap-4 ${loading ? 'opacity-60' : ''}`}>
            {/* Headline covers */}
            <div className="bg-panel border border-border rounded-2xl p-5">
              <div className="font-mono text-[9px] text-ink-500 uppercase tracking-[0.15em] mb-2">Expected covers</div>
              <div className="flex items-baseline gap-3">
                <span className="font-display text-5xl font-bold text-ink-50">{f.covers.expected}</span>
                <span className="font-mono text-[11px] text-ink-400">{f.covers.low}–{f.covers.high}</span>
              </div>
              <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.08em]">
                <span className={f.covers.confidence === 'high' ? 'text-emerald-300' : f.covers.confidence === 'medium' ? 'text-ink-300' : 'text-amber-300'}>
                  {f.covers.confidence} confidence
                </span>
                <span className="text-ink-500"> · {f.covers.method}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
                <div className="rounded-lg bg-panel-card border border-border p-2.5">
                  <div className="text-ink-500 font-mono text-[9px] uppercase">On the books</div>
                  <div className="text-ink-50 font-bold text-lg">{f.booked.covers}</div>
                  <div className="text-ink-500 font-mono text-[9px]">{f.booked.parties} parties · {f.booked.showRate}% show</div>
                </div>
                <div className="rounded-lg bg-panel-card border border-border p-2.5">
                  <div className="text-ink-500 font-mono text-[9px] uppercase">Expected walk-ins</div>
                  <div className="text-ink-50 font-bold text-lg">{f.walkIns.expected}</div>
                  <div className="text-ink-500 font-mono text-[9px]">historically {f.walkIns.historicalSharePct}% of covers</div>
                </div>
              </div>
              <div className="mt-3 font-mono text-[10px] text-ink-400">
                Floor: {f.capacity.tables} tables · {f.capacity.seats} seats
                {f.waitlistLikely && <span className="ml-2 text-amber-300 font-bold uppercase">waitlist likely</span>}
              </div>
            </div>

            {/* Hourly demand */}
            <div className="bg-panel border border-border rounded-2xl p-5 lg:col-span-2">
              <div className="flex items-baseline justify-between mb-3">
                <div className="font-mono text-[9px] text-ink-500 uppercase tracking-[0.15em]">Hourly demand</div>
                {f.peak && f.peak.covers > 0 && (
                  <div className="font-mono text-[10px] text-ink-300">Peak <span className="text-ai font-bold">{f.peak.start}–{f.peak.end}</span> · ~{f.peak.covers} covers</div>
                )}
              </div>
              {f.hourly.length === 0 ? (
                <div className="text-ink-500 italic text-sm py-6 text-center">No demand signal for this date yet.</div>
              ) : (
                <div className="space-y-1.5">
                  {f.hourly.map(x => (
                    <div key={x.h} className="flex items-center gap-2">
                      <span className="w-8 font-mono text-[10px] text-ink-400 text-right">{x.hour}</span>
                      <div className="flex-1 h-4 rounded bg-panel-card overflow-hidden flex">
                        <div className="h-full bg-ai/70" style={{ width: `${(x.booked / maxHourly) * 100}%` }} />
                        <div className={`h-full ${x.waitlistRisk >= 0.85 ? 'bg-amber-400/70' : 'bg-ai/30'}`} style={{ width: `${(Math.max(0, x.expected - x.booked) / maxHourly) * 100}%` }} />
                      </div>
                      <span className={`w-14 font-mono text-[10px] text-right ${x.waitlistRisk >= 0.85 ? 'text-amber-300 font-bold' : 'text-ink-300'}`}>{x.expected}{x.waitlistRisk >= 0.85 ? ' ⚠' : ''}</span>
                    </div>
                  ))}
                  <div className="pt-1 font-mono text-[9px] text-ink-500">■ booked · <span className="text-ink-400">■ expected walk-ins</span> · amber = waitlist-risk hour</div>
                </div>
              )}
            </div>

            {/* Service ops */}
            <div className="bg-panel border border-border rounded-2xl p-5">
              <div className="font-mono text-[9px] text-ink-500 uppercase tracking-[0.15em] mb-3">Service pace</div>
              <div className="space-y-3 text-[12px]">
                <div className="flex justify-between"><span className="text-ink-400">Turn time</span><span className="text-ink-50 font-bold">{f.turn.minutes}m</span></div>
                <div className="font-mono text-[9px] text-ink-500 -mt-2">{f.turn.source}</div>
                <div className="flex justify-between"><span className="text-ink-400">Last table out</span><span className="text-ink-50 font-bold">~{f.lastTableOut}</span></div>
                <div className="flex justify-between"><span className="text-ink-400">Waitlist</span><span className={`font-bold ${f.waitlistLikely ? 'text-amber-300' : 'text-emerald-300'}`}>{f.waitlistLikely ? 'likely at peak' : 'unlikely'}</span></div>
              </div>
            </div>

            {/* Staffing */}
            <div className="bg-panel border border-border rounded-2xl p-5">
              <div className="font-mono text-[9px] text-ink-500 uppercase tracking-[0.15em] mb-3">Staffing</div>
              <div className={`inline-block px-2.5 py-1 rounded-lg border font-mono text-[10px] uppercase tracking-[0.08em] font-bold mb-3 ${verdictStyle}`}>
                {f.staffing.verdict === 'under' ? 'Understaffed' : f.staffing.verdict === 'over' ? 'Overstaffed' : f.staffing.verdict === 'balanced' ? 'Balanced' : 'Unknown'}
              </div>
              <div className="space-y-2 text-[12px]">
                <div className="flex justify-between"><span className="text-ink-400">Crew</span><span className="text-ink-50 font-bold">{f.staffing.crew || '—'}</span></div>
                <div className="font-mono text-[9px] text-ink-500 -mt-1">{f.staffing.crewMethod}</div>
                {f.staffing.coversPerServer != null && (
                  <div className="flex justify-between"><span className="text-ink-400">Covers / server</span>
                    <span className="text-ink-50 font-bold">{f.staffing.coversPerServer}{f.staffing.historicalCoversPerServer ? <span className="text-ink-500 font-normal"> vs ~{f.staffing.historicalCoversPerServer}</span> : null}</span></div>
                )}
                {f.staffing.verdict === 'under' && f.staffing.addServers > 0 && (
                  <div className="text-amber-300 font-mono text-[10px]">Consider +{f.staffing.addServers} server{f.staffing.addServers === 1 ? '' : 's'}</div>
                )}
              </div>
            </div>

            {/* Sections */}
            <div className="bg-panel border border-border rounded-2xl p-5">
              <div className="font-mono text-[9px] text-ink-500 uppercase tracking-[0.15em] mb-3">Section load</div>
              <div className="space-y-2">
                {f.sections.map(s => (
                  <div key={s.zone} className="rounded-lg bg-panel-card border border-border p-2.5">
                    <div className="flex justify-between text-[12px]">
                      <span className="text-ink-50 font-bold uppercase font-mono text-[10px] tracking-[0.06em]">{s.zone}</span>
                      <span className="text-ink-50 font-bold">~{s.expectedCovers} covers</span>
                    </div>
                    <div className="font-mono text-[9px] text-ink-500 mt-0.5">{s.tables} tables · {s.seats} seats · {s.shareSrc}</div>
                    {s.note && <div className="font-mono text-[9px] text-amber-300 mt-0.5">{s.note}</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Factors */}
            <div className="bg-panel border border-border rounded-2xl p-5 lg:col-span-3">
              <div className="font-mono text-[9px] text-ink-500 uppercase tracking-[0.15em] mb-3">Forecast factors</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="font-mono text-[9px] text-emerald-300 uppercase tracking-[0.1em] mb-1.5">In the model</div>
                  <div className="space-y-1">
                    {f.factors.used.map(x => (
                      <div key={x.key} className="text-[11px] flex items-baseline gap-2">
                        <span className="text-ink-100 font-bold whitespace-nowrap">{x.label}</span>
                        {x.impactPct !== 0 && <span className={`font-mono text-[10px] ${x.impactPct > 0 ? 'text-emerald-300' : 'text-amber-300'}`}>{x.impactPct > 0 ? '+' : ''}{x.impactPct}%</span>}
                        <span className="text-ink-500 font-mono text-[10px] truncate">{x.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9px] text-ink-500 uppercase tracking-[0.1em] mb-1.5">Excluded — data not available</div>
                  <div className="space-y-1">
                    {f.factors.excluded.map(x => (
                      <div key={x.key} className="text-[11px] flex items-baseline gap-2 opacity-70">
                        <span className="text-ink-300 whitespace-nowrap">{x.label}</span>
                        <span className="text-ink-500 font-mono text-[10px] truncate">{x.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReservationsView({ reservations, deleteReservation, openModal, selectedPartyId, setSelectedPartyId, setActiveTab }) {
  return (
    <div className="flex-1 overflow-auto p-6 bg-bg">
      <div className="max-w-[800px] mx-auto">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-display text-2xl font-bold text-ink-50">Tonight's Reservations</h2>
          <button onClick={openModal} className="px-4 py-2 rounded-lg bg-ai text-bg font-mono text-[10px] uppercase font-bold">+ New reservation</button>
        </div>
        <div className="bg-panel border border-border rounded-xl overflow-hidden">
          {reservations.map(r => {
            const isSelected = selectedPartyId === r.id;
            const handleRowClick = () => {
              // Select this reservation as the active party and jump to
              // the floor so the host can see the AI's pulsing suggestion.
              setSelectedPartyId(isSelected ? null : r.id);
              if (!isSelected && setActiveTab) setActiveTab("floor");
            };
            return (
              <div
                key={r.id}
                onClick={handleRowClick}
                className={`flex items-center gap-4 px-5 py-4 border-b border-border group transition-colors cursor-pointer ${
                  isSelected ? "bg-ai-bg/40 ring-1 ring-ai/40" : "hover:bg-panel-card"
                }`}
              >
                <span className="font-mono text-base text-state-reserved font-semibold w-16">{r.time}</span>
                <div className="flex-1">
                  <div className="font-display text-base font-semibold text-ink-50">{r.name}</div>
                  <div className="text-[12px] text-ink-400">Party of {r.size} · {r.note}</div>
                </div>
                <span className="font-mono text-[9px] text-ai uppercase tracking-[0.1em] opacity-0 group-hover:opacity-100 transition-opacity">
                  ◆ Seat with AI →
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteReservation(r.id); }}
                  className="opacity-0 group-hover:opacity-100 text-state-seated text-[10px] font-mono uppercase">
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HSV ⇄ hex helpers for the team-member colour picker.
// ─────────────────────────────────────────────────────────────────────
function hsvToHex(h, s, v) {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = v - c;
  const to2 = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}
function hexToHsv(hex) {
  if (!hex || typeof hex !== 'string') return { h: 0, s: 0, v: 1 };
  const m = hex.replace('#', '');
  if (m.length < 6) return { h: 0, s: 0, v: 1 };
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

// ─────────────────────────────────────────────────────────────────────
// ColorPicker — HSV wheel (hue around the rim, saturation toward the
// centre) plus a vertical brightness slider, matching a standard picker.
// Pointer-driven; reports a hex string up via onChange. Internal HSV is
// seeded from `value` on mount so hue survives greyscale selections.
// ─────────────────────────────────────────────────────────────────────
function ColorPicker({ value, onChange }) {
  const [hsv, setHsv] = useState(() => hexToHsv(value || '#4f8cff'));
  const wheelRef = useRef(null);
  const barRef = useRef(null);
  const dragRef = useRef(null);     // 'wheel' | 'bar' | null
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  const R = 80; // wheel radius (px)

  const fromWheel = (clientX, clientY) => {
    const el = wheelRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const dx = clientX - rect.left - cx;
    const dy = clientY - rect.top - cy;
    const radius = Math.min(Math.sqrt(dx * dx + dy * dy), cx);
    const s = cx ? radius / cx : 0;
    const h = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    const cur = hsvRef.current;
    setHsv({ ...cur, h, s });
    onChange && onChange(hsvToHex(h, s, cur.v));
  };
  const fromBar = (clientY) => {
    const el = barRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const cur = hsvRef.current;
    const v = 1 - t;
    setHsv({ ...cur, v });
    onChange && onChange(hsvToHex(cur.h, cur.s, v));
  };

  useEffect(() => {
    const move = (e) => {
      if (!dragRef.current) return;
      if (dragRef.current === 'wheel') fromWheel(e.clientX, e.clientY);
      else fromBar(e.clientY);
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selX = R + R * hsv.s * Math.sin(hsv.h * Math.PI / 180);
  const selY = R - R * hsv.s * Math.cos(hsv.h * Math.PI / 180);
  const topColor = hsvToHex(hsv.h, hsv.s, 1);
  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);

  return (
    <div className="flex items-start gap-4">
      <div
        ref={wheelRef}
        onMouseDown={(e) => { dragRef.current = 'wheel'; fromWheel(e.clientX, e.clientY); }}
        className="relative rounded-full cursor-crosshair flex-shrink-0"
        style={{
          width: R * 2, height: R * 2,
          background: 'radial-gradient(circle at center, #fff 0%, rgba(255,255,255,0) 70%), conic-gradient(hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))',
        }}
      >
        <div className="absolute inset-0 rounded-full pointer-events-none" style={{ background: '#000', opacity: 1 - hsv.v }} />
        <div
          className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow pointer-events-none -translate-x-1/2 -translate-y-1/2"
          style={{ left: selX, top: selY, backgroundColor: hex }}
        />
      </div>

      <div className="flex flex-col items-center gap-2">
        <div
          ref={barRef}
          onMouseDown={(e) => { dragRef.current = 'bar'; fromBar(e.clientY); }}
          className="relative w-5 rounded-full cursor-pointer flex-shrink-0"
          style={{ height: R * 2, background: `linear-gradient(to bottom, ${topColor}, #000)` }}
        >
          <div
            className="absolute left-1/2 w-7 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 shadow pointer-events-none"
            style={{ top: (1 - hsv.v) * R * 2, backgroundColor: hex }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded border border-border-hi" style={{ backgroundColor: hex }} />
          <span className="font-mono text-[10px] text-ink-400 uppercase tabular-nums">{hex}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TeamManagementView — full-area roster manager inside the Settings tab.
// Lists members alphabetically; inline per-member editing of colour and
// roles; a global role library with add/remove; an add-member slide-down.
// All persistence is lifted to Home via props so the floor-tab roster and
// the on/off shift switches keep reading the same `servers` state.
// ─────────────────────────────────────────────────────────────────────
function TeamManagementView({
  servers = [], roles = [],
  addServer, removeServer, setServerColor, setServerRoles,
  addRole, removeRole, onBack,
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(null);
  const [newRoles, setNewRoles] = useState([]);
  const [formRoleInput, setFormRoleInput] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editPanel, setEditPanel] = useState('menu'); // 'menu' | 'color' | 'role'
  const [draftColor, setDraftColor] = useState(null);
  const [draftRoles, setDraftRoles] = useState([]);
  const [editRoleInput, setEditRoleInput] = useState('');

  const [roleRemoveMode, setRoleRemoveMode] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);

  const sorted = [...servers].sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const enterEdit = (m) => {
    setEditingId(m.id);
    setEditPanel('menu');
    setDraftColor(m.color || null);
    setDraftRoles([...(m.roles || [])]);
    setEditRoleInput('');
    setRoleRemoveMode(false);
  };
  const exitEdit = () => { setEditingId(null); setEditPanel('menu'); setRoleRemoveMode(false); };
  const confirmEdit = (id) => {
    if (setServerColor && draftColor) setServerColor(id, draftColor);
    if (setServerRoles) setServerRoles(id, draftRoles);
    exitEdit();
  };

  const toggleNewRole = (r) => setNewRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  const toggleDraftRole = (r) => setDraftRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);

  // Global role deletion also prunes the in-flight drafts so confirming an
  // edit can't resurrect a role that was just removed everywhere.
  const handleRemoveRole = (r) => {
    removeRole && removeRole(r);
    setDraftRoles(prev => prev.filter(x => x !== r));
    setNewRoles(prev => prev.filter(x => x !== r));
    setRoleRemoveMode(false);
  };

  const commitAddRole = (raw, selected, onToggle, clear) => {
    const v = raw.trim();
    if (!v) return;
    addRole && addRole(v);
    const match = roles.find(r => r.toLowerCase() === v.toLowerCase());
    const canonical = match || v;
    if (!selected.includes(canonical)) onToggle(canonical);
    clear('');
  };

  // Shared role chooser — returned as JSX from a plain function (not a
  // nested component) so the add-role input keeps focus across re-renders.
  const renderRoleChooser = (selected, onToggle, input, setInput) => (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        {roles.length === 0 && <span className="font-mono text-[10px] text-ink-400 italic">No roles yet — add one below.</span>}
        {roles.map(r => {
          const isSel = selected.includes(r);
          return (
            <button
              key={r}
              onClick={() => { if (roleRemoveMode) handleRemoveRole(r); else onToggle(r); }}
              className={`px-2.5 py-1 rounded-full font-mono text-[10px] uppercase tracking-[0.06em] border transition-colors ${
                roleRemoveMode
                  ? 'border-state-seated/60 text-state-seated bg-state-seated/10 hover:bg-state-seated/20'
                  : isSel
                  ? 'bg-ai text-bg border-ai font-bold'
                  : 'bg-panel border-border text-ink-400 hover:text-ink-50 hover:border-border-hi'
              }`}
            >
              {r}{roleRemoveMode ? ' ✕' : ''}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitAddRole(input, selected, onToggle, setInput); } }}
          placeholder="Add role"
          className="flex-1 min-w-0 px-2.5 py-1.5 bg-panel border border-border rounded-lg text-[12px] text-ink-50 placeholder-ink-400/60 outline-none focus:border-ai/50 transition-colors"
        />
        <button
          onClick={() => commitAddRole(input, selected, onToggle, setInput)}
          disabled={!input.trim()}
          className="px-3 py-1.5 rounded-lg bg-panel-card border border-border text-ink-50 hover:border-ai/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-[10px] uppercase tracking-[0.06em]"
        >Add</button>
        <button
          onClick={() => setRoleRemoveMode(prev => !prev)}
          className={`px-3 py-1.5 rounded-lg border transition-colors font-mono text-[10px] uppercase tracking-[0.06em] ${
            roleRemoveMode ? 'bg-state-seated/15 border-state-seated/60 text-state-seated' : 'bg-panel-card border-border text-ink-400 hover:text-state-seated hover:border-state-seated/50'
          }`}
        >{roleRemoveMode ? 'Done' : 'Remove'}</button>
      </div>
      {roleRemoveMode && <span className="font-mono text-[9px] text-state-seated">Click a role to remove it everywhere.</span>}
    </div>
  );

  const confirmAdd = () => {
    if (!newName.trim()) return;
    addServer && addServer(newName, newRoles, newColor);
    setNewName(''); setNewRoles([]); setNewColor(null); setFormRoleInput(''); setAdding(false); setRoleRemoveMode(false);
  };
  const cancelAdd = () => { setNewName(''); setNewRoles([]); setNewColor(null); setFormRoleInput(''); setAdding(false); setRoleRemoveMode(false); };

  const confirmTarget = servers.find(s => s.id === confirmRemoveId);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 rounded-lg border border-border bg-panel-card text-ink-400 hover:text-ink-50 hover:border-border-hi flex items-center justify-center transition-colors" title="Back to settings">←</button>
          <div className="flex flex-col">
            <h1 className="font-display text-xl font-bold text-ink-50">Team Management</h1>
            <p className="font-mono text-[11px] text-ink-400 tracking-[0.04em]">{servers.length} {servers.length === 1 ? 'member' : 'members'} · {roles.length} {roles.length === 1 ? 'role' : 'roles'}</p>
          </div>
        </div>

        {/* Add team member */}
        {adding ? (
          <div className="bg-panel border border-ai/40 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] text-ink-400 uppercase tracking-[0.12em]">Name</label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmAdd(); }}
                placeholder="Enter name"
                className="px-3 py-2 bg-panel-card border border-border rounded-lg text-sm text-ink-50 placeholder-ink-400/60 outline-none focus:border-ai/50 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] text-ink-400 uppercase tracking-[0.12em]">Select role(s) — optional</label>
              {renderRoleChooser(newRoles, toggleNewRole, formRoleInput, setFormRoleInput)}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] text-ink-400 uppercase tracking-[0.12em]">Section color — optional</label>
              {/* Same picker the edit panel uses — parity between the two
                  flows was the bug: color existed only after a re-edit. */}
              <ColorPicker value={newColor || '#4f8cff'} onChange={setNewColor} />
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <button onClick={confirmAdd} disabled={!newName.trim()} className="w-full py-2 rounded-lg bg-ai text-bg font-mono text-[11px] uppercase tracking-[0.08em] font-bold hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity">Confirm</button>
              <button onClick={cancelAdd} className="w-full py-2 rounded-lg bg-panel-card border border-border text-ink-400 hover:text-ink-50 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="w-full py-3 rounded-xl bg-ai text-bg font-mono text-[11px] uppercase tracking-[0.1em] font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
            <span className="text-base leading-none">+</span> Add Team Member
          </button>
        )}

        {/* Roster */}
        <div className="flex flex-col gap-2.5">
          {sorted.length === 0 && (
            <div className="text-center py-10 text-[12px] italic text-ink-400 bg-panel-card rounded-xl border border-border">No team members yet.</div>
          )}
          {sorted.map(m => {
            const isEditing = editingId === m.id;
            const memberRoles = m.roles || [];
            if (!isEditing) {
              return (
                <div key={m.id} className="flex items-center gap-3 bg-panel border border-border rounded-xl px-4 py-3">
                  <span className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-mono text-[11px] font-bold text-bg" style={{ backgroundColor: m.color || '#5a5f6a' }}>
                    {String(m.name).charAt(0).toUpperCase()}
                  </span>
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <span className="text-sm text-ink-50 font-semibold truncate">{m.name}</span>
                    <div className="flex flex-wrap gap-1">
                      {memberRoles.length === 0 ? (
                        <span className="font-mono text-[9px] text-ink-400 italic">No role assigned</span>
                      ) : memberRoles.map(r => (
                        <span key={r} className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-panel-up border border-border-hi text-ink-400">{r}</span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => enterEdit(m)} className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-panel-card border border-border text-ink-400 hover:text-ai hover:border-ai/50 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors">Edit</button>
                </div>
              );
            }
            return (
              <div key={m.id} className="bg-panel border border-ai/40 rounded-xl px-4 py-3 flex flex-col gap-3">
                {/* Top row: remove (left) · name · confirm/discard (right) */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      onClick={() => setConfirmRemoveId(m.id)}
                      className="flex flex-col items-center flex-shrink-0 group/rm"
                      title="Remove team member"
                    >
                      <span className="w-7 h-7 rounded-md bg-state-seated/15 border border-state-seated/60 text-state-seated flex items-center justify-center text-sm leading-none group-hover/rm:bg-state-seated/25 transition-colors">✕</span>
                      <span className="font-mono text-[7.5px] text-state-seated leading-tight mt-0.5 text-center">remove<br />member?</span>
                    </button>
                    <span className="text-sm text-ink-50 font-semibold truncate">{m.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => confirmEdit(m.id)} className="w-8 h-8 rounded-lg bg-ai/15 border border-ai/50 text-ai hover:bg-ai/25 flex items-center justify-center text-sm transition-colors" title="Confirm changes">✓</button>
                    <button onClick={exitEdit} className="w-8 h-8 rounded-lg bg-panel-card border border-border text-ink-400 hover:text-state-seated hover:border-state-seated/50 flex items-center justify-center text-sm transition-colors" title="Discard changes">✕</button>
                  </div>
                </div>
                {/* Mode buttons */}
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditPanel(p => p === 'color' ? 'menu' : 'color')} className={`px-3 py-1.5 rounded-lg border font-mono text-[10px] uppercase tracking-[0.06em] transition-colors ${editPanel === 'color' ? 'bg-ai text-bg border-ai font-bold' : 'bg-panel-card border-border text-ink-400 hover:text-ink-50 hover:border-border-hi'}`}>Change Color</button>
                  <button onClick={() => setEditPanel(p => p === 'role' ? 'menu' : 'role')} className={`px-3 py-1.5 rounded-lg border font-mono text-[10px] uppercase tracking-[0.06em] transition-colors ${editPanel === 'role' ? 'bg-ai text-bg border-ai font-bold' : 'bg-panel-card border-border text-ink-400 hover:text-ink-50 hover:border-border-hi'}`}>Change / Add Role</button>
                </div>
                {/* Active panel */}
                {editPanel === 'color' && (
                  <div className="pt-1">
                    <ColorPicker value={draftColor || m.color || '#4f8cff'} onChange={setDraftColor} />
                  </div>
                )}
                {editPanel === 'role' && (
                  <div className="pt-1">
                    {renderRoleChooser(draftRoles, toggleDraftRole, editRoleInput, setEditRoleInput)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Remove-member confirmation */}
      {confirmTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConfirmRemoveId(null)}>
          <div className="bg-panel border border-border-hi rounded-xl shadow-2xl px-6 py-5 max-w-sm w-full flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col gap-1">
              <h3 className="text-sm text-ink-50 font-bold">Remove {confirmTarget.name}?</h3>
              <p className="font-mono text-[11px] text-ink-400 leading-relaxed">This removes them from the team and the floor roster.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { removeServer && removeServer(confirmTarget.id); if (editingId === confirmTarget.id) exitEdit(); setConfirmRemoveId(null); }} className="flex-1 py-2 rounded-lg bg-state-seated text-bg font-mono text-[11px] uppercase tracking-[0.08em] font-bold hover:opacity-90 transition-opacity">Remove</button>
              <button onClick={() => setConfirmRemoveId(null)} className="flex-1 py-2 rounded-lg bg-panel-card border border-border text-ink-400 hover:text-ink-50 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Timeline helpers ────────────────────────────────────────────────
// Parse a compact reservation time ("7:30p", "7p", "11:45a") to minutes
// from midnight; null when unparseable.
function parseResMinutes(s) {
  if (typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mn = m[2] ? parseInt(m[2], 10) : 0;
  if (h === 12) h = 0;
  if (m[3].toLowerCase() === 'p') h += 12;
  return h * 60 + mn;
}
// Minutes-from-midnight → "7:30 PM" (settings hours pickers).
function formatMinutesLabel(min) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}
// Compact axis-tick label: "7p", "7:30p", "12a".
function formatTickLabel(min) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  const ap = h < 12 ? 'a' : 'p';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return m === 0 ? `${h12}${ap}` : `${h12}:${String(m).padStart(2, '0')}${ap}`;
}
// 30-min options (12:00 AM … 11:30 PM) for the hours pickers.
const HOUR_OPTIONS = (() => { const a = []; for (let m = 0; m <= 1410; m += 30) a.push(m); return a; })();
// Minutes-from-midnight → "7:30pm" (matches the reservation modal's format).
function minutesToResTime(min) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  const ap = h < 12 ? 'am' : 'pm';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')}${ap}`;
}

// ─────────────────────────────────────────────────────────────────────
// TimelineView — a volume-centred reservation timeline. Plots every booking
// for the day along an open→close axis: each reservation is a box at its
// time, stacked vertically (largest party at the bottom) with a marker and
// its time. A bell-curve line (green→red by volume) shows where the rush
// builds. The axis tick interval is editable (default 1 hour). Restaurant
// hours come from Settings; unset → a full 24h (12:00 AM – 11:59 PM) view.
// ─────────────────────────────────────────────────────────────────────
function TimelineView({ reservations = [], restaurantHours = { open: null, close: null }, onSelectReservation }) {
  const scrollRef = useRef(null);
  const [w, setW] = useState(960);
  const [tickInterval, setTickInterval] = useState(60);
  const [zoom, setZoom] = useState(1);
  const MAX_ZOOM = 8;

  // Live refs so the once-attached wheel listener always reads current values.
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const wRef = useRef(w); wRef.current = w;
  // Pending scroll anchor applied after a zoom change (keeps a point fixed).
  const anchorRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const ro = new ResizeObserver(es => { for (const e of es) setW(Math.max(360, Math.floor(e.contentRect.width))); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wheel-to-zoom over the chart, anchored on the cursor's x position so the
  // time under the pointer holds still. Horizontal wheel/trackpad gestures
  // fall through to native horizontal scrolling.
  useEffect(() => {
    const sc = scrollRef.current; if (!sc) return;
    const onWheel = (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const mouseX = e.clientX - sc.getBoundingClientRect().left;
      const cW = wRef.current * zoomRef.current;
      const frac = cW > 0 ? (sc.scrollLeft + mouseX) / cW : 0;
      const next = Math.max(1, Math.min(MAX_ZOOM, zoomRef.current * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      if (next === zoomRef.current) return;
      anchorRef.current = { frac, mouseX };
      setZoom(next);
    };
    sc.addEventListener('wheel', onWheel, { passive: false });
    return () => sc.removeEventListener('wheel', onWheel);
  }, []);

  // Apply the pending anchor after a zoom change; also keep scrollLeft valid
  // when the viewport width changes.
  useLayoutEffect(() => {
    const sc = scrollRef.current; if (!sc) return;
    const cW = w * zoom;
    const maxScroll = Math.max(0, cW - sc.clientWidth);
    const a = anchorRef.current;
    if (a) {
      sc.scrollLeft = Math.max(0, Math.min(maxScroll, a.frac * cW - a.mouseX));
      anchorRef.current = null;
    } else {
      sc.scrollLeft = Math.min(sc.scrollLeft, maxScroll);
    }
  }, [zoom, w]);

  // Toolbar zoom — anchored on the current view centre.
  const zoomByButton = (dir) => {
    const sc = scrollRef.current;
    const vis = sc ? sc.clientWidth : w;
    const sl = sc ? sc.scrollLeft : 0;
    const cW = w * zoom;
    const mouseX = vis / 2;
    const frac = cW > 0 ? (sl + mouseX) / cW : 0;
    const next = Math.max(1, Math.min(MAX_ZOOM, zoom * (dir > 0 ? 1.3 : 1 / 1.3)));
    if (next === zoom) return;
    anchorRef.current = { frac, mouseX };
    setZoom(next);
  };
  const resetZoom = () => { anchorRef.current = { frac: 0, mouseX: 0 }; setZoom(1); };

  const PRESETS = [15, 30, 60, 90, 120, 180];
  const fmtInterval = (mins) => mins % 60 === 0 ? `${mins / 60} hr${mins === 60 ? '' : 's'}` : `${mins} min`;
  const stepInterval = (dir) => {
    const i = PRESETS.indexOf(tickInterval);
    const ni = Math.max(0, Math.min(PRESETS.length - 1, (i === -1 ? 2 : i) + dir));
    setTickInterval(PRESETS[ni]);
  };

  const hasHours = restaurantHours && restaurantHours.open != null && restaurantHours.close != null && restaurantHours.close > restaurantHours.open;
  const rangeStart = hasHours ? restaurantHours.open : 0;
  const rangeEnd = hasHours ? restaurantHours.close : 1439;
  const span = Math.max(1, rangeEnd - rangeStart);

  const padL = 26, padR = 26, padTop = 24;
  const contentW = Math.round(w * zoom);
  const xOf = (min) => padL + ((min - rangeStart) / span) * Math.max(10, contentW - padL - padR);

  const parsed = reservations
    .map(r => ({ ...r, _min: parseResMinutes(r.time), _size: Number(r.size) || 0 }))
    .filter(r => r._min != null && r._min >= rangeStart && r._min <= rangeEnd);

  // Box placement: biggest party first → lowest lane (bottom); greedy
  // horizontal packing so overlapping boxes stack upward.
  const boxW = 82, boxH = 22, vgap = 16, sidePad = 6;
  const lanes = [];
  const placed = [...parsed].sort((a, b) => b._size - a._size).map(r => {
    const cx = xOf(r._min), x0 = cx - boxW / 2, x1 = cx + boxW / 2;
    let L = 0;
    for (;;) {
      if (!lanes[L]) lanes[L] = [];
      if (!lanes[L].some(b => !(x1 < b.x0 - sidePad || x0 > b.x1 + sidePad))) { lanes[L].push({ x0, x1 }); break; }
      L++; if (L > 40) break;
    }
    return { r, cx, lane: L };
  });
  const maxLane = placed.reduce((m, p) => Math.max(m, p.lane), -1);

  const chartH = Math.max(168, 18 + (maxLane + 1) * (boxH + vgap) + 22);
  const axisY = padTop + chartH;
  const H = axisY + 56;
  const laneY = (L) => axisY - 14 - boxH - L * (boxH + vgap);

  // Volume curve — sum of party-size-weighted gaussians.
  const sigma = 36, SAMPLES = 220;
  const samples = []; let maxVol = 0;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = rangeStart + (span * i) / SAMPLES;
    let v = 0;
    for (const r of parsed) { const d = t - r._min; v += r._size * Math.exp(-(d * d) / (2 * sigma * sigma)); }
    samples.push([t, v]); if (v > maxVol) maxVol = v;
  }
  const curveTop = padTop + 8, curveBase = axisY;
  const yVol = (v) => maxVol <= 0 ? curveBase : curveBase - (v / maxVol) * (curveBase - curveTop);
  const coords = samples.map(([t, v]) => `${xOf(t).toFixed(1)},${yVol(v).toFixed(1)}`);
  const linePath = 'M' + coords.join(' L');
  const areaPath = `M${xOf(rangeStart).toFixed(1)},${curveBase.toFixed(1)} L` + coords.join(' L') + ` L${xOf(rangeEnd).toFixed(1)},${curveBase.toFixed(1)} Z`;

  // Axis ticks at the chosen interval (+ the closing boundary).
  const ticks = [];
  for (let t = rangeStart; t <= rangeEnd + 0.5; t += tickInterval) ticks.push(Math.round(t));
  if (ticks[ticks.length - 1] !== rangeEnd) ticks.push(rangeEnd);

  const truncate = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const AI = 'var(--color-ai, #5b8def)';
  const INK = 'var(--color-ink-50, #e6e8ec)';
  const MUTE = 'var(--color-ink-400, #8b8f98)';
  const BORDER = 'var(--color-border, #262a31)';
  const CARD = 'var(--color-panel-card, #15171c)';

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar — interval stepper sits where the floor selector lives on
          the floor tab; volume legend + count on the right. */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border flex-shrink-0 flex-wrap">
        <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-400 font-bold">Interval</span>
        <div className="flex items-center gap-0.5 bg-panel-card border border-border rounded-lg px-1 py-0.5">
          <button onClick={() => stepInterval(-1)} disabled={tickInterval === PRESETS[0]} className="w-6 h-6 rounded-md flex items-center justify-center text-ink-400 hover:text-ink-50 hover:bg-panel-up disabled:opacity-25 disabled:hover:bg-transparent transition-colors text-sm leading-none">−</button>
          <span className="font-mono text-[11px] text-ink-50 font-bold min-w-[52px] text-center tabular-nums">{fmtInterval(tickInterval)}</span>
          <button onClick={() => stepInterval(1)} disabled={tickInterval === PRESETS[PRESETS.length - 1]} className="w-6 h-6 rounded-md flex items-center justify-center text-ink-400 hover:text-ink-50 hover:bg-panel-up disabled:opacity-25 disabled:hover:bg-transparent transition-colors text-sm leading-none">+</button>
        </div>
        <div className="w-px h-5 bg-border mx-1" />
        <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-400 font-bold">Zoom</span>
        <div className="flex items-center gap-0.5 bg-panel-card border border-border rounded-lg px-1 py-0.5">
          <button onClick={() => zoomByButton(-1)} disabled={zoom <= 1.0001} className="w-6 h-6 rounded-md flex items-center justify-center text-ink-400 hover:text-ink-50 hover:bg-panel-up disabled:opacity-25 disabled:hover:bg-transparent transition-colors text-sm leading-none">−</button>
          <span className="font-mono text-[11px] text-ink-50 font-bold min-w-[40px] text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button onClick={() => zoomByButton(1)} disabled={zoom >= MAX_ZOOM - 0.0001} className="w-6 h-6 rounded-md flex items-center justify-center text-ink-400 hover:text-ink-50 hover:bg-panel-up disabled:opacity-25 disabled:hover:bg-transparent transition-colors text-sm leading-none">+</button>
        </div>
        {zoom > 1.0001 && (
          <button onClick={resetZoom} className="px-2.5 h-7 rounded-lg border border-border bg-panel-card text-ink-400 hover:text-ink-50 hover:bg-panel-up font-mono text-[10px] uppercase tracking-[0.08em] font-bold transition-colors">Fit</button>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-400">Quiet</span>
          <span className="h-2 w-24 rounded-full" style={{ background: 'linear-gradient(to right, #22c55e, #eab308, #ef4444)' }} />
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-400">Busy</span>
        </div>
        <div className="w-px h-5 bg-border mx-1" />
        <div className="font-mono text-[10px] text-ink-400 tabular-nums">{parsed.length} {parsed.length === 1 ? 'reservation' : 'reservations'}</div>
      </div>

      <div className="px-6 pt-5 pb-3 flex-shrink-0">
        <h2 className="font-display text-base font-bold text-ink-50">Reservations timeline</h2>
        <p className="font-mono text-[10px] text-ink-400 tracking-[0.04em]">
          {hasHours ? `${formatMinutesLabel(rangeStart)} – ${formatMinutesLabel(rangeEnd)}` : 'Full day · 12:00 AM – 11:59 PM · set hours in Settings'}
          {zoom > 1.0001 && ` · ${Math.round(zoom * 100)}% — swipe or drag the scrollbar to pan`}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-5">
        <div ref={scrollRef} className="overflow-x-auto">
          <svg width={contentW} height={H} className="block">
          <defs>
            <linearGradient id="tl-line" x1="0" y1={curveBase} x2="0" y2={curveTop} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="52%" stopColor="#eab308" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
            <linearGradient id="tl-fill" x1="0" y1={curveBase} x2="0" y2={curveTop} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.03" />
              <stop offset="60%" stopColor="#eab308" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.22" />
            </linearGradient>
          </defs>

          {ticks.map((t, i) => (
            <line key={`g${i}`} x1={xOf(t)} y1={curveTop - 2} x2={xOf(t)} y2={axisY} stroke={BORDER} strokeWidth="1" strokeOpacity="0.5" />
          ))}

          {maxVol > 0 && <path d={areaPath} fill="url(#tl-fill)" stroke="none" />}
          <path d={linePath} fill="none" stroke="url(#tl-line)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

          <line x1={padL} y1={axisY} x2={contentW - padR} y2={axisY} stroke={BORDER} strokeWidth="1.5" />

          {ticks.map((t, i) => (
            <g key={`t${i}`}>
              <line x1={xOf(t)} y1={axisY} x2={xOf(t)} y2={axisY + 5} stroke={MUTE} strokeWidth="1" />
              <text x={xOf(t)} y={axisY + 17} textAnchor="middle" fontSize="9.5" fill={MUTE} fontFamily="ui-monospace, monospace">{formatTickLabel(t)}</text>
            </g>
          ))}

          {placed.map(({ r, cx, lane }) => {
            const by = laneY(lane);
            return (
              <g
                key={r.id}
                onClick={(e) => { e.stopPropagation(); onSelectReservation && onSelectReservation(r.id); }}
                style={{ cursor: 'pointer' }}
                data-reservation-row
              >
                <line x1={cx} y1={by + boxH} x2={cx} y2={axisY - 1} stroke={AI} strokeWidth="1" strokeOpacity="0.32" strokeDasharray="2 3" />
                <circle cx={cx} cy={axisY} r="3" fill={AI} stroke="var(--color-bg, #0a0b0d)" strokeWidth="1" />
                <rect x={cx - boxW / 2} y={by} width={boxW} height={boxH} rx="5" fill={CARD} stroke={AI} strokeOpacity="0.45" strokeWidth="1" />
                <text x={cx - boxW / 2 + 8} y={by + boxH / 2 + 3.5} fontSize="9.5" fill={INK} fontFamily="inherit">{truncate(r.name, 10)}</text>
                <text x={cx + boxW / 2 - 8} y={by + boxH / 2 + 3.5} textAnchor="end" fontSize="10" fontWeight="700" fill={AI} fontFamily="ui-monospace, monospace">{r._size}</text>
                <text x={cx} y={by + boxH + 11} textAnchor="middle" fontSize="8.5" fill={AI} fontFamily="ui-monospace, monospace">{r.time}</text>
              </g>
            );
          })}

          {parsed.length === 0 && (
            <text x={contentW / 2} y={(padTop + axisY) / 2} textAnchor="middle" fontSize="12" fill={MUTE} fontStyle="italic">No reservations scheduled for today.</text>
          )}
          </svg>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// SettingToggle — compact on/off switch used across the Settings tab.
// ─────────────────────────────────────────────────────────────────────
function SettingToggle({ on, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative w-10 h-[22px] rounded-full flex-shrink-0 transition-colors ${on ? 'bg-ai' : 'bg-panel-up border border-border'}`}
    >
      <span className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-ink-50 shadow transition-all ${on ? 'left-[20px]' : 'left-[2px]'}`} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SettingsView — host-stand configuration. Section cards for General,
// Floor & Service, Reservations, and Notifications. The Floor & Service
// card hosts the single entry point into floor-plan editing; the floor
// toolbar only exposes the exit. Toggle/select state is local for now (UI
// scaffold, not yet persisted). Modeled on OpenTable / SevenRooms settings.
// ─────────────────────────────────────────────────────────────────────
// Free-type time box for restaurant hours. Parses "8:15", "8:15am",
// "8:15 PM", "20:15", "815", "8" into minutes-from-midnight; blank
// commits null. Shows the canonical label when not focused.
function TimeTextInput({ value, onCommit }) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const display = editing ? text : (value == null ? '' : formatMinutesLabel(value));
  function parse(raw) {
    const s = String(raw).trim().toLowerCase();
    if (s === '') return { ok: true, min: null };
    const m = s.match(/^(\d{1,2})(?::?(\d{2}))?\s*(a|p)?m?\.?$/);
    if (!m) return { ok: false };
    let h = parseInt(m[1], 10);
    const mins = m[2] ? parseInt(m[2], 10) : 0;
    const ap = m[3];
    if (mins > 59 || h > 23) return { ok: false };
    if (ap === 'p' && h < 12) h += 12;
    if (ap === 'a' && h === 12) h = 0;
    if (!ap && h > 23) return { ok: false };
    return { ok: true, min: (h % 24) * 60 + mins };
  }
  function commit() {
    setEditing(false);
    const r = parse(text);
    if (r.ok) onCommit(r.min);
  }
  return (
    <input
      type="text"
      value={display}
      placeholder="8:15 AM"
      onFocus={() => { setEditing(true); setText(value == null ? '' : formatMinutesLabel(value)); }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
      className="w-24 px-2 py-1.5 bg-panel-card border border-border-hi rounded-lg text-ink-50 text-sm text-center outline-none focus:border-ai font-mono tabular-nums"
    />
  );
}

// ─── ImportOverlay ───────────────────────────────────────────────────
// The importer's whole client flow. Nothing writes to the database until
// the host has SEEN every row and pressed Commit — the extractor (CSV or
// vision) proposes; the human disposes.
// ── Floor-photo computer vision ──────────────────────────────────────
// Photo-grade deterministic table detection. Real photos of host-stand
// screens defeat global thresholding (the illumination gradient across
// the glass exceeds the table-vs-canvas contrast), so this pipeline is:
//   local adaptive threshold (integral-image box mean, +10)
//   → connected components → aspect/solidity gates
//   → 5×5 closing + hole fill (label text carves holes)
//   → convex hull (tables are convex; reflections and texture are not)
//   → seed cluster (largest interior blobs = tables; ring-gate the rest
//     against the seeds' canvas gray — UI chrome sits on darker panels)
//   → hull erosion classify; concave blobs (solidity < 0.88) are seat
//     chains: erosion ladder splits them into 1-seat rounds.
// Geometry never touches the LLM — pixels are exact; models are not.
// Returns { tables, canvasRect }: percentages are relative to canvasRect
// (the detected floor region), which is also the tracing-underlay crop.
function detectFloorTables(px, w, h) {
  const n = w * h;
  const gray = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    gray[i] = (px[o] * 299 + px[o + 1] * 587 + px[o + 2] * 114) / 1000;
  }
  // Local mean via integral image; window ≥ largest table dimension.
  const ii = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      ii[(y + 1) * (w + 1) + (x + 1)] = ii[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  const win = Math.max(60, Math.floor(Math.min(w, h) / 3));
  const r = win >> 1;
  const fg = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - r), y2 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - r), x2 = Math.min(w, x + r + 1);
      const s = ii[y2 * (w + 1) + x2] - ii[y1 * (w + 1) + x2] - ii[y2 * (w + 1) + x1] + ii[y1 * (w + 1) + x1];
      if (gray[y * w + x] - s / ((y2 - y1) * (x2 - x1)) > 10) fg[y * w + x] = 1;
    }
  }
  // Connected components (8-conn).
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const minArea = Math.max(24, 0.0005 * n), maxArea = 0.15 * n;
  const BIG = 1e9;
  const median = (a) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[(s.length / 2) | 0] : 0; };

  // Chebyshev distance transform on a local grid: dist to nearest zero.
  const chebyshevDT = (grid, gw, gh) => {
    const d = new Float64Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) d[i] = grid[i] ? BIG : 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      if (!d[i]) continue;
      let best = d[i];
      if (y > 0) {
        if (x > 0) best = Math.min(best, d[i - gw - 1] + 1);
        best = Math.min(best, d[i - gw] + 1);
        if (x < gw - 1) best = Math.min(best, d[i - gw + 1] + 1);
      }
      if (x > 0) best = Math.min(best, d[i - 1] + 1);
      d[i] = best;
    }
    for (let y = gh - 1; y >= 0; y--) for (let x = gw - 1; x >= 0; x--) {
      const i = y * gw + x;
      if (!d[i]) continue;
      let best = d[i];
      if (y < gh - 1) {
        if (x < gw - 1) best = Math.min(best, d[i + gw + 1] + 1);
        best = Math.min(best, d[i + gw] + 1);
        if (x > 0) best = Math.min(best, d[i + gw - 1] + 1);
      }
      if (x < gw - 1) best = Math.min(best, d[i + 1] + 1);
      d[i] = best;
    }
    return d;
  };
  // CC labeling on a local boolean grid; returns [{cells, size}] sorted big→small.
  const gridComponents = (mask, gw, gh) => {
    const vis = new Uint8Array(gw * gh);
    const st = new Int32Array(gw * gh);
    const comps = [];
    for (let i = 0; i < gw * gh; i++) {
      if (!mask[i] || vis[i]) continue;
      let sp = 0; st[sp++] = i; vis[i] = 1;
      const cells = [];
      while (sp > 0) {
        const c = st[--sp];
        cells.push(c);
        const cx = c % gw, cy = (c / gw) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const ni = ny * gw + nx;
          if (mask[ni] && !vis[ni]) { vis[ni] = 1; st[sp++] = ni; }
        }
      }
      comps.push({ cells, size: cells.length });
    }
    comps.sort((a, b) => b.size - a.size);
    return comps;
  };
  // Convex hull (Andrew monotone chain) of set cells, rasterized (scanline).
  const hullOf = (mask, gw, gh) => {
    const pts = [];
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (mask[y * gw + x]) pts.push([x, y]);
    if (pts.length < 3) return null;
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    const poly = lower.slice(0, -1).concat(upper.slice(0, -1));
    if (poly.length < 3) return null;
    const out = new Uint8Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      const yc = y + 0.5;
      const xs = [];
      for (let i = 0; i < poly.length; i++) {
        const [x1p, y1p] = poly[i], [x2p, y2p] = poly[(i + 1) % poly.length];
        if ((y1p <= yc && y2p > yc) || (y2p <= yc && y1p > yc)) {
          xs.push(x1p + ((yc - y1p) / (y2p - y1p)) * (x2p - x1p));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xa = Math.max(0, Math.ceil(xs[i] - 0.5)), xb = Math.min(gw - 1, Math.floor(xs[i + 1] + 0.5));
        for (let x = xa; x <= xb; x++) out[y * gw + x] = 1;
      }
    }
    return out;
  };
  const classifyCore = (cells, gw, x0, y0, k) => {
    let ex1 = Infinity, ex2 = -Infinity, ey1 = Infinity, ey2 = -Infinity, sx = 0, sy = 0;
    for (const c of cells) {
      const cx = c % gw, cy = (c / gw) | 0;
      if (cx < ex1) ex1 = cx; if (cx > ex2) ex2 = cx;
      if (cy < ey1) ey1 = cy; if (cy > ey2) ey2 = cy;
      sx += cx; sy += cy;
    }
    const ebw = ex2 - ex1 + 1, ebh = ey2 - ey1 + 1;
    const efill = cells.length / (ebw * ebh), easp = ebw / ebh;
    const dx1 = Math.max(0, x0 + ex1 - k), dy1 = Math.max(0, y0 + ey1 - k);
    const dx2 = Math.min(w - 1, x0 + ex2 + k), dy2 = Math.min(h - 1, y0 + ey2 + k);
    const dbw = dx2 - dx1 + 1, dbh = dy2 - dy1 + 1;
    let shape, rotation;
    if (efill >= 0.85) {
      if (easp >= 0.74 && easp <= 1.35) { shape = 'square'; rotation = 0; }
      else { shape = 'rectangle'; rotation = ebw >= ebh ? 0 : 90; }
    } else if (Math.min(dbw, dbh) < 26 * (Math.min(w, h) / 600)) { shape = 'round'; rotation = 0; }
    else if (efill >= 0.615) { shape = 'round'; rotation = 0; }
    else { shape = 'square'; rotation = 45; }
    return { x: x0 + sx / cells.length, y: y0 + sy / cells.length, shape, rotation,
             ef: efill, bbox: [dx1, dy1, dbw, dbh], minDim: Math.min(dbw, dbh) };
  };

  // Pass 1: candidates with local masks + geometry gates.
  const cands = [];
  const tinies = [];
  for (let start = 0; start < n; start++) {
    if (!fg[start] || seen[start]) continue;
    let sp = 0; stack[sp++] = start; seen[start] = 1;
    const pixels = [];
    let x1 = w, x2 = 0, y1 = h, y2 = 0;
    while (sp > 0) {
      const p = stack[--sp];
      pixels.push(p);
      const cx = p % w, cy = (p / w) | 0;
      if (cx < x1) x1 = cx; if (cx > x2) x2 = cx;
      if (cy < y1) y1 = cy; if (cy > y2) y2 = cy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (fg[ni] && !seen[ni]) { seen[ni] = 1; stack[sp++] = ni; }
      }
    }
    const area = pixels.length;
    const bw = x2 - x1 + 1, bh = y2 - y1 + 1;
    if (area >= 25 && area < minArea && Math.max(bw, bh) < 30) {
      tinies.push([x1 + bw / 2, y1 + bh / 2]);   // text-scale fragment
      continue;
    }
    if (area < minArea || area > maxArea) continue;
    if (Math.max(bw, bh) / Math.max(1, Math.min(bw, bh)) > 6.0) continue;
    const pad = 4, gw = bw + 2 * pad, gh = bh + 2 * pad;
    const raw = new Uint8Array(gw * gh);
    for (const p of pixels) raw[((p / w | 0) - y1 + pad) * gw + ((p % w) - x1 + pad)] = 1;
    // 5×5 closing (Chebyshev radius 2): dilate then erode.
    const dToBlob = chebyshevDT(raw.map(v => (v ? 0 : 1)), gw, gh); // dist FROM background TO blob? invert:
    // chebyshevDT computes dist-to-zero for nonzero cells; feed the
    // COMPLEMENT so background cells get distance-to-blob.
    const dilated = new Uint8Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) dilated[i] = raw[i] || dToBlob[i] <= 2 ? 1 : 0;
    const dToBg = chebyshevDT(dilated, gw, gh);
    const closed = new Uint8Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) closed[i] = dToBg[i] > 2 ? 1 : 0;
    // Fill interior holes: flood true background from the border.
    {
      const reach = new Uint8Array(gw * gh);
      const fst = new Int32Array(gw * gh);
      let fp = 0; fst[fp++] = 0; reach[0] = 1;
      while (fp > 0) {
        const fi = fst[--fp];
        const fx = fi % gw, fy = (fi / gw) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = fx + dx, ny = fy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const ni = ny * gw + nx;
          if (!reach[ni] && !closed[ni]) { reach[ni] = 1; fst[fp++] = ni; }
        }
      }
      for (let i = 0; i < gw * gh; i++) if (!closed[i] && !reach[i]) closed[i] = 1;
    }
    let fillArea = 0;
    for (let i = 0; i < gw * gh; i++) if (closed[i]) fillArea++;
    const hullMask = hullOf(closed, gw, gh);
    let hullArea = fillArea;
    if (hullMask) { hullArea = 0; for (let i = 0; i < gw * gh; i++) if (hullMask[i]) hullArea++; }
    const solidity = fillArea / Math.max(1, hullArea);
    const chain = solidity < 0.88;
    if (!chain && solidity < 0.62) continue;
    // Ring median gray (bbox + 6px frame).
    const m = 6;
    const ry1 = Math.max(0, y1 - m), ry2 = Math.min(h, y2 + 1 + m);
    const rx1 = Math.max(0, x1 - m), rx2 = Math.min(w, x2 + 1 + m);
    const ringVals = [];
    for (let yy = ry1; yy < ry2; yy++) for (let xx = rx1; xx < rx2; xx++) {
      if (xx >= x1 && xx <= x2 && yy >= y1 && yy <= y2) continue;
      ringVals.push(gray[yy * w + xx]);
    }
    cands.push({ closed, hullMask: hullMask || closed, chain, gw, gh, pad,
                 x1, y1, bw, bh, area: fillArea, cx: x1 + bw / 2, cy: y1 + bh / 2,
                 ringMed: median(ringVals) });
  }
  // UI chrome (sidebar buttons, toolbar pills) is EMBEDDED in loose text
  // fragments — names, counts, icons; real tables never are (their labels
  // live inside the blob). This is structural, not photometric, so it
  // holds across exposures where brightness gates compress.
  const isChrome = (c) => {
    const M = 30;
    const bx1 = c.x1, by1 = c.y1, bx2 = c.x1 + c.bw, by2 = c.y1 + c.bh;
    let cnt = 0;
    const sides = new Set();
    for (const [tx, ty] of tinies) {
      if (tx < bx1 - M || tx > bx2 + M || ty < by1 - M || ty > by2 + M) continue;
      if (tx >= bx1 && tx <= bx2 && ty >= by1 && ty <= by2) continue;
      cnt++;
      if (tx < bx1) sides.add('L');
      if (tx > bx2) sides.add('R');
      if (ty < by1) sides.add('U');
      if (ty > by2) sides.add('D');
    }
    return cnt >= 3 && sides.size >= 2;
  };
  const filtered = cands.filter(c => !isChrome(c));
  cands.length = 0; cands.push(...filtered);
  if (cands.length === 0) return { tables: [], canvasRect: { x: 0, y: 0, w, h } };

  // Seeds: largest interior blobs; demote surface outliers (toolbar bars).
  const interior = cands.filter(c =>
    c.x1 > 0.02 * w && c.y1 > 0.02 * h && c.x1 + c.bw < 0.98 * w && c.y1 + c.bh < 0.98 * h);
  const pool = interior.length ? interior : cands;
  let seeds = [...pool].sort((a, b) => b.area - a.area).slice(0, Math.min(10, pool.length));
  if (seeds.length >= 3) {
    const medRing = median(seeds.map(s => s.ringMed));
    const coherent = seeds.filter(s => Math.abs(s.ringMed - medRing) <= 26);
    if (coherent.length) seeds = coherent;
  }
  const canvasGray = median(seeds.map(s => s.ringMed));
  const seedMed = median(seeds.map(s => s.area));
  const memberSet = new Set(seeds);
  let ux1 = Math.min(...seeds.map(s => s.x1)), uy1 = Math.min(...seeds.map(s => s.y1));
  let ux2 = Math.max(...seeds.map(s => s.x1 + s.bw)), uy2 = Math.max(...seeds.map(s => s.y1 + s.bh));
  const gxm = 0.10 * w, gym = 0.10 * h;
  for (let pass = 0; pass < 3; pass++) {
    let grew = false;
    for (const c of cands) {
      if (memberSet.has(c)) continue;
      if (c.cx < ux1 - gxm || c.cx > ux2 + gxm || c.cy < uy1 - gym || c.cy > uy2 + gym) continue;
      const rdiff = c.ringMed - canvasGray;
      if (rdiff < -26 || rdiff > 40) continue;  // UI chrome sits on darker panels
      if (c.area < 0.15 * seedMed) continue;    // icon-scale junk
      memberSet.add(c); grew = true;
      ux1 = Math.min(ux1, c.x1); uy1 = Math.min(uy1, c.y1);
      ux2 = Math.max(ux2, c.x1 + c.bw); uy2 = Math.max(uy2, c.y1 + c.bh);
    }
    if (!grew) break;
  }
  // Classify members.
  const dets = [];
  for (const c of cands) {
    if (!memberSet.has(c)) continue;
    const k = Math.max(2, Math.round(0.10 * Math.min(c.bw, c.bh)));
    const x0 = c.x1 - c.pad, y0 = c.y1 - c.pad;
    if (!c.chain) {
      const dt = chebyshevDT(c.hullMask, c.gw, c.gh);
      const core = [];
      for (let i = 0; i < c.gw * c.gh; i++) if (dt[i] > k) core.push(i);
      if (core.length === 0) for (let i = 0; i < c.gw * c.gh; i++) if (c.hullMask[i]) core.push(i);
      dets.push(classifyCore(core, c.gw, x0, y0, k));
    } else {
      const dt = chebyshevDT(c.closed, c.gw, c.gh);
      const coreMask = new Uint8Array(c.gw * c.gh);
      let kk = k, ladder = false;
      for (let i = 0; i < c.gw * c.gh; i++) coreMask[i] = dt[i] > kk ? 1 : 0;
      let comps = gridComponents(coreMask, c.gw, c.gh);
      if (comps.length <= 1) {
        for (const frac of [0.22, 0.30, 0.38]) {   // deepen until the chain splits
          const k2 = Math.max(kk + 1, Math.round(frac * Math.min(c.bw, c.bh)));
          const cm2 = new Uint8Array(c.gw * c.gh);
          for (let i = 0; i < c.gw * c.gh; i++) cm2[i] = dt[i] > k2 ? 1 : 0;
          const comps2 = gridComponents(cm2, c.gw, c.gh);
          if (comps2.length > 1) { comps = comps2; kk = k2; ladder = true; break; }
        }
      }
      if (comps.length === 0) {
        const all = [];
        for (let i = 0; i < c.gw * c.gh; i++) if (c.closed[i]) all.push(i);
        dets.push(classifyCore(all, c.gw, x0, y0, kk));
      } else {
        const maxSize = comps[0].size;
        for (const comp of comps) {
          if (comp.size < Math.max(12, 0.12 * maxSize)) continue;
          const d = classifyCore(comp.cells, c.gw, x0, y0, kk);
          if (ladder) { d.shape = 'round'; d.rotation = 0; d.ef = Math.max(d.ef, 0.65); }
          dets.push(d);
        }
      }
    }
  }
  const kept = dets.filter(d => d.ef >= 0.40);  // no real table erodes below diamond fill
  if (kept.length === 0) return { tables: [], canvasRect: { x: 0, y: 0, w, h } };
  // Canvas rect: union of detections + breathing room (also the underlay crop).
  const bx1 = Math.min(...kept.map(d => d.bbox[0])), by1 = Math.min(...kept.map(d => d.bbox[1]));
  const bx2 = Math.max(...kept.map(d => d.bbox[0] + d.bbox[2])), by2 = Math.max(...kept.map(d => d.bbox[1] + d.bbox[3]));
  const padX = Math.max(15, Math.round(0.03 * w)), padY = Math.max(15, Math.round(0.03 * h));
  const cr = { x: Math.max(0, bx1 - padX), y: Math.max(0, by1 - padY) };
  cr.w = Math.min(w, bx2 + padX) - cr.x;
  cr.h = Math.min(h, by2 + padY) - cr.y;
  const tables = kept.map(d => ({
    xPct: ((d.x - cr.x) / cr.w) * 100,
    yPct: ((d.y - cr.y) / cr.h) * 100,
    shape: d.shape,
    rotation: d.rotation,
    bbox: d.bbox,
    minDim: d.minDim,
  }));
  tables.sort((a, b) => (Math.abs(a.yPct - b.yPct) > 4 ? a.yPct - b.yPct : a.xPct - b.xPct));
  return { tables, canvasRect: cr };
}

// Decode the photo ONCE and produce both working images: a ≤1600px JPEG
// (label crops + the tracing underlay) and ≤900px ImageData for the CV
// pass. Separate from downscaleImageFile — the paper-history importer
// still uses that one untouched.
function prepareFloorPhoto(file, maxEdge = 1600, cvEdge = 900) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const cvScale = Math.min(1, cvEdge / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * cvScale));
      const ch = Math.max(1, Math.round(h * cvScale));
      const cvCanvas = document.createElement('canvas');
      cvCanvas.width = cw; cvCanvas.height = ch;
      const cvCtx = cvCanvas.getContext('2d');
      cvCtx.drawImage(canvas, 0, 0, cw, ch);
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', 0.85),
        aspect: w / h,
        canvas,
        cv: { w: cw, h: ch, data: cvCtx.getImageData(0, 0, cw, ch).data },
      });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read ${file.name}`)); };
    img.src = url;
  });
}

// Crop one detected table (bbox in CV-image pixels) out of the full-res
// canvas, padded so the label and seat nubs stay in frame, downsized to
// a small tile for the label-reading call.
function cropTableTile(canvas, bbox, cvW, tileEdge = 170) {
  const s = canvas.width / cvW;
  const pad = 10 * s;
  const sx = Math.max(0, bbox[0] * s - pad);
  const sy = Math.max(0, bbox[1] * s - pad);
  const sw = Math.min(canvas.width - sx, bbox[2] * s + pad * 2);
  const sh = Math.min(canvas.height - sy, bbox[3] * s + pad * 2);
  const scale = Math.min(1, tileEdge / Math.max(sw, sh));
  const tw = Math.max(1, Math.round(sw * scale));
  const th = Math.max(1, Math.round(sh * scale));
  const c = document.createElement('canvas');
  c.width = tw; c.height = th;
  c.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, tw, th);
  return c.toDataURL('image/jpeg', 0.85);
}

// Crop the detected floor region (canvasRect in CV pixels) out of the
// full-res canvas — the tracing underlay should be the floor, not the
// whole photo with its sidebar and bezel.
function cropCanvasRegion(canvas, rect, cvW) {
  const s = canvas.width / cvW;
  const sx = Math.max(0, rect.x * s);
  const sy = Math.max(0, rect.y * s);
  const sw = Math.min(canvas.width - sx, rect.w * s);
  const sh = Math.min(canvas.height - sy, rect.h * s);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw)); c.height = Math.max(1, Math.round(sh));
  c.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

// ── Floor-plan migration overlay ─────────────────────────────────────
// Photo/screenshot of a previous system's floor → proposed MesaOS floor.
// One photo = one floor. The review step renders a to-scale PREVIEW of
// the proposed layout (the fastest way to judge extraction quality) plus
// an editable table list. Nothing commits until the host approves.
function FloorMigrateOverlay({ tables: existingTables, floors: existingFloors, onClose, onCommit }) {
  const [step, setStep] = useState('pick');       // pick | review
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  // One entry per photo: { name, tables: [{ include, label, shape, seats, xPct, yPct, unclear }] }
  const [drafts, setDrafts] = useState([]);

  const existingNames = new Set(existingTables.map(t => String(t.name).trim().toLowerCase()));

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/')).slice(0, 4);
    if (files.length === 0) { setError('Choose image files (photos or screenshots).'); return; }
    setBusy(true); setError('');
    const out = [];
    // Unnamed floors number ascending past whatever "Floor #N" names
    // already exist — never the upload's file name.
    const usedFloorNames = new Set((existingFloors || []).map(f => String(f.name || '').trim().toLowerCase()));
    const nextAutoFloorName = () => {
      let n = 1;
      while (usedFloorNames.has(`floor #${n}`)) n += 1;
      const name = `Floor #${n}`;
      usedFloorNames.add(name.toLowerCase());
      return name;
    };
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress(`Preparing floor ${i + 1} of ${files.length}…`);
        const photo = await prepareFloorPhoto(files[i]);
        // Deterministic geometry FIRST: positions, shapes, and rotations
        // come from pixels, never from model guesses.
        const cvResult = detectFloorTables(photo.cv.data, photo.cv.w, photo.cv.h);
        const dets = cvResult.tables;
        let underlaySrc = photo.dataUrl;
        let underlayAspect = photo.aspect;
        let draftTables;
        let floorName = null;
        if (dets.length >= 3) {
          setProgress(`Reading labels ${i + 1} of ${files.length}…`);
          // The underlay and all percentages are relative to the DETECTED
          // floor region, so the ghost photo aligns with the tables.
          underlaySrc = cropCanvasRegion(photo.canvas, cvResult.canvasRect, photo.cv.w);
          underlayAspect = cvResult.canvasRect.w / Math.max(1, cvResult.canvasRect.h);
          const tiles = dets.map((det, j) => ({ index: j, image: cropTableTile(photo.canvas, det.bbox, photo.cv.w) }));
          // Small full-frame copy rides along so the SAME call can read
          // the floor's name (corner pill / header) — no extra roundtrip.
          const nameImage = (() => {
            const c = document.createElement('canvas');
            const s = Math.min(1, 640 / Math.max(photo.canvas.width, photo.canvas.height));
            c.width = Math.max(1, Math.round(photo.canvas.width * s));
            c.height = Math.max(1, Math.round(photo.canvas.height * s));
            c.getContext('2d').drawImage(photo.canvas, 0, 0, c.width, c.height);
            return c.toDataURL('image/jpeg', 0.7);
          })();
          const resp = await fetch('/api/import/floorplan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'labels', tiles, fullImage: nameImage }),
          });
          if (!resp.ok) {
            let detail = '';
            try { detail = (await resp.json()).detail || ''; } catch (_) { /* body not json */ }
            throw new Error(`label read failed (HTTP ${resp.status}${detail ? ` — ${detail}` : ''})`);
          }
          const data = await resp.json();
          floorName = data.floorName || null;
          const byIndex = new Map((data.tiles || []).map(t => [t.index, t]));
          // Seat fallbacks by CV shape; a round well below the median
          // round size is a 1-seat bar stool, not a 2-top.
          const roundDims = dets.filter(d => d.shape === 'round').map(d => d.minDim).sort((a, b) => a - b);
          const medRound = roundDims.length ? roundDims[(roundDims.length / 2) | 0] : 0;
          draftTables = dets.map((det, j) => {
            const t = byIndex.get(j) || {};
            const fallback = det.shape === 'rectangle' ? 6
              : det.shape === 'square' ? 4
              : (medRound && det.minDim < 0.6 * medRound ? 1 : 2);
            return {
              include: true,
              label: String(t.label || '').trim(),
              shape: det.shape,
              seats: t.seats != null ? Math.max(1, Math.min(20, Math.round(t.seats))) : fallback,
              seatsGuessed: t.seats == null,
              xPct: det.xPct,
              yPct: det.yPct,
              rotation: det.rotation,
              unclear: !!t.unclear,
            };
          });
        } else {
          // CV found too little (heavy glare, exotic UI) — whole-image
          // extraction fallback, geometry included.
          setProgress(`Reading floor ${i + 1} of ${files.length}…`);
          const resp = await fetch('/api/import/floorplan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: photo.dataUrl }),
          });
          if (!resp.ok) {
            let detail = '';
            try { detail = (await resp.json()).detail || ''; } catch (_) { /* body not json */ }
            throw new Error(`extract failed (HTTP ${resp.status}${detail ? ` — ${detail}` : ''})`);
          }
          const data = await resp.json();
          const f = data.floor || { floorName: null, tables: [] };
          floorName = f.floorName;
          draftTables = (f.tables || []).map(t => ({
            include: true,
            label: String(t.label || '').trim(),
            shape: ['round', 'square', 'rectangle'].includes(t.shape) ? t.shape : 'square',
            // null seats default by shape — editable in review, flagged amber.
            seats: t.seats != null ? Math.max(1, Math.min(20, Math.round(t.seats))) : (t.shape === 'rectangle' ? 6 : 4),
            seatsGuessed: t.seats == null,
            xPct: typeof t.xPct === 'number' ? t.xPct : 50,
            yPct: typeof t.yPct === 'number' ? t.yPct : 50,
            // Nearest-15° snap; competitor plans lean on 45° diamonds.
            rotation: (() => { const d = Math.round((Number(t.rotationDeg) || 0) / 15) * 15; return d >= 0 && d < 180 ? d : 0; })(),
            unclear: !!t.unclear,
          }));
        }
        out.push({
          aspect: underlayAspect,
          // Option D: carry the photo so commit can ghost it under the
          // canvas as a tracing underlay (cropped to the detected floor).
          photo: underlaySrc,
          name: floorName || nextAutoFloorName(),
          tables: draftTables,
        });
      }
      // No popup review — the real canvas IS the review surface: it
      // renders rotations, ghosts the source photo, and has the full
      // editor. Cancel Migration (in the edit toolbar) reverts.
      onCommit(out);
      onClose();
      return;
    } catch (e) {
      setError(String(e && e.message ? e.message : e));
    } finally {
      setBusy(false); setProgress('');
    }
  };

  const setDraft = (fi, patch) => setDrafts(prev => prev.map((d, i) => i === fi ? { ...d, ...patch } : d));
  const setRow = (fi, ti, patch) => setDrafts(prev => prev.map((d, i) => i === fi ? { ...d, tables: d.tables.map((t, j) => j === ti ? { ...t, ...patch } : t) } : d));

  // A label collides if it matches an existing table OR another included
  // row in this batch (case-insensitive). Collisions block commit — the
  // floor's whole point is unambiguous table identity.
  const labelIssues = (() => {
    const seen = new Map();
    const issues = new Set();
    drafts.forEach((d, fi) => d.tables.forEach((t, ti) => {
      if (!t.include) return;
      const key = t.label.trim().toLowerCase();
      const id = `${fi}:${ti}`;
      if (!key) { issues.add(id); return; }
      if (existingNames.has(key)) { issues.add(id); return; }
      if (seen.has(key)) { issues.add(id); issues.add(seen.get(key)); return; }
      seen.set(key, id);
    }));
    return issues;
  })();

  const includedCount = drafts.reduce((s, d) => s + d.tables.filter(t => t.include).length, 0);
  const canCommit = includedCount > 0 && labelIssues.size === 0 && !busy;

  const commit = () => {
    if (!canCommit) return;
    onCommit(drafts.map(d => ({
      name: d.name.trim() || 'Imported floor',
      aspect: d.aspect,
      photo: d.photo || null,
      tables: d.tables.filter(t => t.include).map(t => ({
        label: t.label.trim(), shape: t.shape, seats: t.seats, xPct: t.xPct, yPct: t.yPct, rotation: t.rotation || 0,
      })),
    })));
    onClose();
  };

  const previewTile = (t, key, issue) => {
    // Mini to-scale preview: the box is 100%-wide with the same 1400:900
    // aspect the world mapping uses, so relative placement reads true.
    const w = t.shape === 'rectangle' ? 7.5 : t.shape === 'round' ? 5.5 : 5.5;
    const h = t.shape === 'rectangle' ? 5 : 5.5;
    return (
      <div
        key={key}
        className={`absolute flex items-center justify-center font-mono text-[8px] font-bold border ${
          issue ? 'bg-rose-500/30 border-rose-400 text-rose-100'
          : t.unclear || t.seatsGuessed ? 'bg-amber-400/25 border-amber-400/70 text-amber-100'
          : 'bg-ink-50/15 border-ink-50/40 text-ink-50'
        } ${t.shape === 'round' ? 'rounded-full' : 'rounded-[3px]'} ${t.include ? '' : 'opacity-25'}`}
        style={{
          left: `${t.xPct}%`, top: `${t.yPct}%`,
          width: `${w}%`, height: `${h * (1400 / 900)}%`,
          transform: 'translate(-50%, -50%)',
        }}
        title={`${t.label} · ${t.seats}-top ${t.shape}`}
      >{t.label}</div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[65] p-4" onClick={onClose}>
      <div className="bg-panel border border-border-hi rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border-hi flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-display text-lg font-bold text-ink-50">Migrate floor plan</h2>
            <p className="font-mono text-[10px] text-ink-400 mt-0.5">Photo or screenshot of your previous system → a matching MesaOS floor. One image per floor. Opens straight in Edit Layout — Cancel Migration restores the previous plan.</p>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-50 text-xl leading-none px-1" aria-label="Close">×</button>
        </div>

        {step === 'pick' && (
          <div className="p-6 flex flex-col gap-4 overflow-y-auto">
            <label className={`border-2 border-dashed rounded-xl px-6 py-10 flex flex-col items-center gap-2 cursor-pointer transition-colors ${busy ? 'border-border text-ink-400/50 cursor-wait' : 'border-border-hi text-ink-400 hover:border-ai/60 hover:text-ink-200'}`}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              <span className="text-sm font-medium">{busy ? (progress || 'Analyzing…') : 'Upload floor plan photos or screenshots'}</span>
              <span className="font-mono text-[10px]">Up to 4 images · one floor each · OpenTable, Resy, paper sketches — anything legible</span>
              <input type="file" accept="image/*" multiple className="hidden" disabled={busy} onChange={e => handleFiles(e.target.files)} />
            </label>
            {error && <div className="text-[12px] text-rose-300 font-mono">{error}</div>}
          </div>
        )}

        {step === 'review' && (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
            {drafts.map((d, fi) => (
              <div key={fi} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <label className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400 flex-shrink-0">Floor name</label>
                  <input value={d.name} onChange={e => setDraft(fi, { name: e.target.value })}
                    className="flex-1 px-3 py-1.5 bg-panel-card border border-border rounded-lg text-sm text-ink-50 outline-none focus:border-ai/50" />
                  <span className="font-mono text-[10px] text-ink-400 flex-shrink-0">{d.tables.filter(t => t.include).length} tables</span>
                </div>
                {/* To-scale preview of the proposed floor */}
                <div className="relative w-full rounded-xl bg-bg border border-border overflow-hidden" style={{ aspectRatio: '1400 / 900' }}>
                  {d.tables.map((t, ti) => previewTile(t, ti, labelIssues.has(`${fi}:${ti}`)))}
                </div>
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[24px_1fr_110px_64px_auto] gap-2 px-3 py-1.5 bg-panel-card font-mono text-[9px] uppercase tracking-[0.1em] text-ink-400">
                    <span></span><span>Table</span><span>Shape</span><span>Seats</span><span></span>
                  </div>
                  {d.tables.map((t, ti) => {
                    const issue = labelIssues.has(`${fi}:${ti}`);
                    return (
                      <div key={ti} className={`grid grid-cols-[24px_1fr_110px_64px_auto] gap-2 items-center px-3 py-1.5 border-t border-border/60 ${issue ? 'bg-rose-500/10' : (t.unclear || t.seatsGuessed) ? 'bg-amber-400/5' : ''} ${t.include ? '' : 'opacity-40'}`}>
                        <input type="checkbox" checked={t.include} onChange={e => setRow(fi, ti, { include: e.target.checked })} className="accent-indigo-400" />
                        <input value={t.label} onChange={e => setRow(fi, ti, { label: e.target.value })}
                          className={`px-2 py-1 bg-panel-card border rounded text-[12px] text-ink-50 outline-none focus:border-ai/50 ${issue ? 'border-rose-400/70' : 'border-border'}`} />
                        <select value={t.shape} onChange={e => setRow(fi, ti, { shape: e.target.value })}
                          className="px-2 py-1 bg-panel-card border border-border rounded text-[12px] text-ink-50 outline-none">
                          <option value="round">Round</option><option value="square">Square</option><option value="rectangle">Rectangle</option>
                        </select>
                        <input type="number" min="1" max="20" value={t.seats}
                          onChange={e => setRow(fi, ti, { seats: Math.max(1, Math.min(20, Number(e.target.value) || 1)), seatsGuessed: false })}
                          className={`px-2 py-1 bg-panel-card border rounded text-[12px] text-ink-50 outline-none tabular-nums ${t.seatsGuessed ? 'border-amber-400/70' : 'border-border'}`} />
                        <span className="font-mono text-[9px] text-right pr-1">
                          {issue ? <span className="text-rose-300">duplicate / empty name</span>
                            : t.unclear ? <span className="text-amber-300">check me</span>
                            : t.seatsGuessed ? <span className="text-amber-300">seats assumed</span> : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="px-6 py-4 border-t border-border-hi flex items-center justify-between flex-shrink-0">
          <span className="font-mono text-[10px] text-ink-400">
            {step === 'review' ? `${includedCount} tables ready${labelIssues.size ? ` · ${labelIssues.size} name issue${labelIssues.size === 1 ? '' : 's'} to fix` : ''}` : ''}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-panel-card border border-border text-ink-50 font-mono text-[11px] uppercase tracking-[0.08em] hover:bg-panel-up transition-colors">Cancel</button>
            {step === 'review' && (
              <button onClick={commit} disabled={!canCommit}
                className="px-4 py-2 rounded-lg bg-ai text-bg font-mono text-[11px] uppercase tracking-[0.08em] font-bold disabled:opacity-30 disabled:cursor-not-allowed">
                Create {drafts.length === 1 ? 'floor' : `${drafts.length} floors`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportOverlay({ tables, onClose, onDone, defaultTurnMinutes = 90 }) {
  const [step, setStep] = useState('pick');            // pick | review | summary
  const [source, setSource] = useState('opentable');   // opentable | resy | paper | other
  const [defaultDate, setDefaultDate] = useState('');
  const [fileName, setFileName] = useState('');
  const [pages, setPages] = useState([]);              // data-URLs (pdf/photo path)
  const [pagesDone, setPagesDone] = useState(0);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);              // string status line
  const [err, setErr] = useState(null);
  const [aiStats, setAiStats] = useState(null);        // applyImportMapping stats (summary step)
  const [aiWarnings, setAiWarnings] = useState([]);    // mapping.warnings from the model
  const [commitDone, setCommitDone] = useState(0);     // rows landed so far (chunked commit)

  const extractPages = async (imgs, startKey) => {
    const res = await fetch('/api/import/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: imgs.map(image => ({ image })), source }),
    });
    if (!res.ok) throw new Error('extract_failed');
    const data = await res.json();
    const pageDate = data.pageDate || null;
    return (data.rows || []).map((r, i) => ({
      key: `${startKey}-${i}`,
      name: r.name || '',
      date: r.date || pageDate || defaultDate || '',
      time: r.time || null,
      size: r.partySize || null,
      status: r.status === 'unknown' ? 'finished' : r.status,
      seatedTime: r.seatedTime || null,
      finishedTime: r.finishedTime || null,
      turnMinutes: r.turnMinutes ?? null,
      tableLabel: r.tableLabel || null,
      tableId: matchTableByLabel(tables, r.tableLabel),
      kind: r.kind || 'unknown',
      unclear: !!r.unclear,
      include: true,
    }));
  };

  const handleFile = async (file) => {
    if (!file) return;
    setErr(null);
    setFileName(file.name);
    try {
      if (/\.(csv|tsv|txt)$/i.test(file.name)) {
        // Two-stage, AI-optional pipeline:
        //   1. DETERMINISTIC (no AI) — sniff the delimiter, parse the
        //      file, identify columns by header name. A labelled export
        //      (OpenTable, Resy, a Sheet) is fully mapped right here.
        //   2. AI ENHANCEMENT (best-effort) — hand the now-tabular
        //      sample to the LLM to fill any columns the header pass
        //      missed and to read odd/unlabelled files. If this call
        //      fails for ANY reason, we keep the deterministic mapping
        //      and import anyway. The AI never gates a standard CSV.
        setBusy('Reading file…');
        const text = await file.text();
        const { rows: parsedRaw } = decodeTabularFile(text);
        if (parsedRaw.length === 0) throw new Error('csv_empty');

        const detMapping = deterministicMapping(parsedRaw);
        let mapping = detMapping;

        // Only ask the AI when it can actually help: the deterministic
        // pass missed the essentials (name + date/size) or barely
        // matched anything. A clean labelled file skips the call
        // entirely — faster, free, and immune to API hiccups.
        const hasName = detMapping.columns.fullName != null || detMapping.columns.firstName != null || detMapping.columns.lastName != null;
        const hasDate = detMapping.columns.date != null || detMapping.columns.visitDate != null;
        const needsAi = detMapping.matchedCount < 3 || !hasName || !hasDate;
        if (needsAi) {
          setBusy('AI is reading the columns…');
          try {
            const res = await fetch('/api/import/ai', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sample: parsedRaw.slice(0, 40), source }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data && data.mapping) mapping = mergeMappings(detMapping, data.mapping);
            }
          } catch (_) { /* AI unavailable — deterministic mapping stands */ }
        }

        setBusy(`Organizing ${parsedRaw.length.toLocaleString()} rows…`);
        const { rows: mapped, stats } = applyImportMapping(parsedRaw, mapping, tables, defaultDate, defaultTurnMinutes);
        if (mapped.length === 0) {
          // Parsed fine but nothing usable — almost always no date
          // anywhere and no default date chosen.
          throw new Error(stats && stats.dateless > 0 ? 'no_dates' : 'no_columns');
        }
        setRows(mapped);
        setAiStats(stats);
        const warn = [...(mapping.warnings || [])];
        if (mapping === detMapping && needsAi) warn.unshift('Imported without AI — columns were matched by header name. Check the sample below.');
        setAiWarnings(warn);
        setStep('summary');
      } else if (/\.pdf$/i.test(file.name)) {
        setBusy('Rendering page 1…');
        const imgs = await pdfFileToPageImages(file, (p, total) =>
          setBusy(`Rendering page ${p} of ${total}…`));
        setPages(imgs);
        // Sample-first: extract ONE page, let the host validate the
        // pipeline on it before burning tokens on the rest.
        setBusy('Reading page 1 (AI)…');
        const first = await extractPages([imgs[0]], 'p0');
        setRows(first);
        setPagesDone(1);
        setStep('review');
      } else if (/^image\//.test(file.type)) {
        setBusy('Reading photo (AI)…');
        const dataUrl = await fileToDataUrl(file);
        setPages([dataUrl]);
        const got = await extractPages([dataUrl], 'p0');
        setRows(got);
        setPagesDone(1);
        setStep('review');
      } else {
        throw new Error('unsupported_type');
      }
    } catch (e) {
      setErr(e && e.message === 'csv_empty'
        ? 'No data rows found in that file.'
        : e && e.message === 'unsupported_type'
          ? 'Use a CSV/TSV, PDF, or photo (JPG/PNG).'
          : e && e.message === 'no_dates'
            ? 'None of the rows had a date, and no default date is set — pick a Default Date above, then re-add the file.'
            : e && e.message === 'no_columns'
              ? 'Couldn’t identify the columns in that file. If it has no header row, add one (e.g. Name, Date, Party Size) and try again.'
              : 'Could not read that file — check the format and try again.');
    } finally {
      setBusy(null);
    }
  };

  const processRemaining = async () => {
    setErr(null);
    try {
      let done = pagesDone;
      while (done < pages.length) {
        const chunk = pages.slice(done, done + 3);
        setBusy(`Reading pages ${done + 1}–${done + chunk.length} of ${pages.length} (AI)…`);
        const got = await extractPages(chunk, `p${done}`);
        setRows(prev => [...prev, ...got]);
        done += chunk.length;
        setPagesDone(done);
      }
    } catch (_) {
      setErr('A page failed to extract — rows read so far are kept.');
    } finally {
      setBusy(null);
    }
  };

  const setRow = (key, patch) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));

  // Intra-file duplicate detection (the server re-checks against the DB).
  const dupKeys = (() => {
    const seen = new Map(); const dups = new Set();
    for (const r of rows) {
      const k = `${r.date}|${String(r.name).toLowerCase()}|${r.time || ''}|${r.size || ''}`;
      if (seen.has(k)) dups.add(r.key); else seen.set(k, r.key);
    }
    return dups;
  })();

  const included = rows.filter(r => r.include && !dupKeys.has(r.key));
  const invalid = included.filter(r => !String(r.name).trim() || !/^\d{4}-\d{2}-\d{2}$/.test(r.date || '') || !(Number(r.size) >= 1));
  const unclearCount = included.filter(r => r.unclear).length;

  // Chunked bulk commit for the AI-mapped path. Each chunk is dedupe-
  // guarded server-side, so a retry after a mid-file failure is safe.
  const commitBulk = async () => {
    setErr(null);
    const CHUNK = 2000;
    const totals = { created: 0, duplicates: 0, errors: 0, tableLinks: 0 };
    try {
      for (let at = 0; at < rows.length; at += CHUNK) {
        const chunk = rows.slice(at, at + CHUNK);
        setBusy(`Committing ${Math.min(at + CHUNK, rows.length).toLocaleString()} of ${rows.length.toLocaleString()} rows…`);
        const res = await fetch('/api/import/commit-bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source,
            rows: chunk.map(r => ({
              name: r.name, date: r.date, time: r.time, size: Number(r.size),
              status: r.status, seatedTime: r.seatedTime, finishedTime: r.finishedTime,
              turnMinutes: r.turnMinutes, tableId: r.tableId, kind: r.kind,
              phone: r.phone || null, email: r.email || null, notes: r.notes || null,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error('commit_failed');
        totals.created += data.created || 0;
        totals.duplicates += data.duplicates || 0;
        totals.errors += (data.errors || []).length;
        totals.tableLinks += data.tableLinks || 0;
        setCommitDone(at + chunk.length);
      }
      onDone(totals);
      onClose();
    } catch (_) {
      setErr(`Commit stopped partway — ${totals.created.toLocaleString()} rows landed safely. Press Commit again to continue; already-landed rows are skipped as duplicates.`);
    } finally {
      setBusy(null);
    }
  };

  const commit = async () => {
    setErr(null);
    setBusy(`Committing ${included.length} rows…`);
    try {
      const res = await fetch('/api/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          rows: included.map(r => ({
            name: r.name, date: r.date, time: r.time, size: Number(r.size),
            status: r.status, seatedTime: r.seatedTime, finishedTime: r.finishedTime,
            turnMinutes: r.turnMinutes, tableId: r.tableId, kind: r.kind,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error('commit_failed');
      onDone(data);
      onClose();
    } catch (_) {
      setErr('Commit failed — nothing was written. Check the connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const inputCls = "bg-panel-card border border-border rounded px-1.5 py-1 text-[11px] text-ink-50 outline-none focus:border-ai w-full";

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[65] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-panel border border-border-hi rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-display text-lg font-bold text-ink-50">Import history</h2>
            <p className="font-mono text-[10px] text-ink-400 mt-0.5">Reservations, walk-ins and turn times from a previous system or a paper book — reviewed before anything is saved.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:text-ink-50 hover:bg-panel-up text-lg">×</button>
        </div>

        {step === 'pick' && (
          <div className="p-6 space-y-5 overflow-auto">
            <div className="flex flex-wrap gap-6">
              <div className="space-y-1.5">
                <label className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink-400 font-bold block">Source</label>
                <select className="bg-panel-card border border-border-hi rounded-lg px-3 py-2 text-sm text-ink-50 outline-none focus:border-ai" value={source} onChange={e => setSource(e.target.value)}>
                  <option value="opentable">OpenTable export</option>
                  <option value="resy">Resy export</option>
                  <option value="paper">Paper reservation book</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink-400 font-bold block">Default date <span className="normal-case tracking-normal font-normal">(used when a row has none)</span></label>
                <input type="date" className="bg-panel-card border border-border-hi rounded-lg px-3 py-2 text-sm text-ink-50 outline-none focus:border-ai" value={defaultDate} onChange={e => setDefaultDate(e.target.value)} />
              </div>
            </div>
            <label className="block border-2 border-dashed border-border-hi rounded-2xl p-10 text-center cursor-pointer hover:border-ai/60 transition-colors">
              <input type="file" accept=".csv,.tsv,.txt,.pdf,image/*" className="hidden" onChange={e => handleFile(e.target.files && e.target.files[0])} />
              <div className="text-3xl mb-2">📥</div>
              <div className="text-sm text-ink-50 font-semibold">Drop or choose a file</div>
              <div className="font-mono text-[10px] text-ink-400 mt-1.5">CSV/TSV exports (OpenTable, Resy, Sheets) are decoded and organized by AI · PDF pages and photos (including handwriting) are read by AI, then reviewed here</div>
            </label>
            {busy && <div className="font-mono text-[11px] text-ai animate-pulse">◆ {busy}</div>}
            {err && <div className="font-mono text-[11px] text-rose-300">{err}</div>}
          </div>
        )}

        {step === 'review' && (
          <>
            <div className="px-6 py-2.5 border-b border-border flex items-center gap-4 flex-wrap flex-shrink-0">
              <span className="font-mono text-[10px] text-ink-400">{fileName}</span>
              <span className="font-mono text-[10px] text-ink-200">{included.length} to import</span>
              {dupKeys.size > 0 && <span className="font-mono text-[10px] text-amber-300">{dupKeys.size} in-file duplicate{dupKeys.size === 1 ? '' : 's'} skipped</span>}
              {unclearCount > 0 && <span className="font-mono text-[10px] text-amber-300">⚠ {unclearCount} flagged unclear — check the amber rows</span>}
              {invalid.length > 0 && <span className="font-mono text-[10px] text-rose-300">{invalid.length} missing name/date/size</span>}
              {pages.length > pagesDone && (
                <button onClick={processRemaining} disabled={!!busy} className="ml-auto px-3 py-1.5 rounded-lg bg-ai-bg/40 border border-ai/50 text-ai font-mono text-[10px] uppercase tracking-[0.08em] font-bold hover:bg-ai-bg/60 disabled:opacity-40">
                  Process remaining {pages.length - pagesDone} page{pages.length - pagesDone === 1 ? '' : 's'} →
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto px-4 py-3">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-400 text-left">
                    <th className="px-2 py-1.5 w-8"></th>
                    <th className="px-2 py-1.5">Name</th>
                    <th className="px-2 py-1.5 w-32">Date</th>
                    <th className="px-2 py-1.5 w-24">Time</th>
                    <th className="px-2 py-1.5 w-16">Party</th>
                    <th className="px-2 py-1.5 w-28">Status</th>
                    <th className="px-2 py-1.5 w-24">Seated</th>
                    <th className="px-2 py-1.5 w-24">Finished</th>
                    <th className="px-2 py-1.5 w-16">Turn</th>
                    <th className="px-2 py-1.5 w-28">Table</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const isDup = dupKeys.has(r.key);
                    const bad = r.include && !isDup && (!String(r.name).trim() || !/^\d{4}-\d{2}-\d{2}$/.test(r.date || '') || !(Number(r.size) >= 1));
                    return (
                      <tr key={r.key} className={`border-t border-border ${isDup ? 'opacity-35' : ''} ${r.unclear && !isDup ? 'bg-amber-500/10' : ''} ${bad ? 'bg-rose-500/10' : ''}`}>
                        <td className="px-2 py-1"><input type="checkbox" checked={r.include && !isDup} disabled={isDup} onChange={e => setRow(r.key, { include: e.target.checked })} /></td>
                        <td className="px-2 py-1"><input className={inputCls} value={r.name} onChange={e => setRow(r.key, { name: e.target.value })} /></td>
                        <td className="px-2 py-1"><input type="date" className={inputCls} value={r.date || ''} onChange={e => setRow(r.key, { date: e.target.value })} /></td>
                        <td className="px-2 py-1"><input className={inputCls} placeholder="7:30 PM" value={r.time || ''} onChange={e => setRow(r.key, { time: e.target.value || null })} /></td>
                        <td className="px-2 py-1"><input type="number" min="1" className={inputCls} value={r.size ?? ''} onChange={e => setRow(r.key, { size: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                        <td className="px-2 py-1">
                          <select className={inputCls} value={r.status} onChange={e => setRow(r.key, { status: e.target.value })}>
                            <option value="finished">Finished</option>
                            <option value="seated_only">Seated (no end)</option>
                            <option value="no_show">No-show</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </td>
                        <td className="px-2 py-1"><input className={inputCls} value={r.seatedTime || ''} onChange={e => setRow(r.key, { seatedTime: e.target.value || null })} /></td>
                        <td className="px-2 py-1"><input className={inputCls} value={r.finishedTime || ''} onChange={e => setRow(r.key, { finishedTime: e.target.value || null })} /></td>
                        <td className="px-2 py-1"><input type="number" min="1" className={inputCls} value={r.turnMinutes ?? ''} onChange={e => setRow(r.key, { turnMinutes: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                        <td className="px-2 py-1">
                          <select className={inputCls} value={r.tableId == null ? '' : String(r.tableId)} onChange={e => {
                            const v = e.target.value;
                            setRow(r.key, { tableId: v === '' ? null : (/^\d+$/.test(v) ? Number(v) : v) });
                          }}>
                            <option value="">{r.tableLabel ? `— (was "${r.tableLabel}")` : '—'}</option>
                            {tables.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-border flex items-center gap-3 flex-shrink-0">
              {busy && <span className="font-mono text-[11px] text-ai animate-pulse">◆ {busy}</span>}
              {err && <span className="font-mono text-[11px] text-rose-300">{err}</span>}
              <button onClick={onClose} className="ml-auto px-4 py-2 rounded-lg bg-panel-card border border-border text-ink-400 hover:text-ink-50 font-mono text-[11px] uppercase tracking-[0.08em]">Cancel</button>
              <button onClick={commit} disabled={!!busy || included.length === 0 || invalid.length > 0}
                className="px-5 py-2 rounded-lg bg-ai text-bg font-mono text-[11px] uppercase font-bold disabled:opacity-30 disabled:cursor-not-allowed">
                Commit {included.length} record{included.length === 1 ? '' : 's'}
              </button>
            </div>
          </>
        )}

        {step === 'summary' && aiStats && (
          <>
            <div className="p-6 space-y-4 overflow-auto flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-[10px] text-ink-400">{fileName}</span>
                <span className="px-2 py-0.5 rounded bg-ai-bg/40 border border-ai/40 font-mono text-[10px] text-ai uppercase tracking-[0.08em]">AI organized</span>
              </div>
              {/* The gate that replaced 13,000 input boxes: what the AI
                  decoded, what it assumed, what it dropped — one glance,
                  one button. Predictor food, not a ledger. */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  [rows.length.toLocaleString(), 'rows ready to import'],
                  [aiStats.namedGuests.toLocaleString(), 'with guest names'],
                  [aiStats.synthesizedNames.toLocaleString(), 'unnamed (kept as "Guest NNNN")'],
                  [aiStats.tableMatched.toLocaleString(), `table matches${aiStats.tableRemapped ? ` (${aiStats.tableRemapped.toLocaleString()} remapped to nearest table)` : ''}`],
                  [aiStats.turnDefaults.toLocaleString(), `turn times assumed (${defaultTurnMinutes} min default)`],
                  [(aiStats.dateless + aiStats.sizeDefaults > 0 ? `${aiStats.dateless.toLocaleString()} / ${aiStats.sizeDefaults.toLocaleString()}` : '0'), 'dropped (no date) / sizes assumed'],
                ].map(([n, label], i) => (
                  <div key={i} className="bg-panel-card border border-border rounded-xl px-4 py-3">
                    <div className="font-display text-xl font-bold text-ink-50">{n}</div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-400 mt-0.5 leading-relaxed">{label}</div>
                  </div>
                ))}
              </div>
              {aiWarnings.length > 0 && (
                <div className="bg-amber-400/5 border border-amber-400/30 rounded-xl px-4 py-3 space-y-1">
                  {aiWarnings.map((w, i) => (
                    <div key={i} className="font-mono text-[10px] text-amber-300 leading-relaxed">⚠ {w}</div>
                  ))}
                </div>
              )}
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink-400 font-bold mb-2">Sample of what will be saved</div>
                <div className="bg-panel-card border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-border">
                        {['Name', 'Date', 'Time', 'Party', 'Status', 'Turn', 'Table'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-mono text-[9px] uppercase tracking-[0.12em] text-ink-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 8).map(r => (
                        <tr key={r.key} className="border-b border-border/50 last:border-0">
                          <td className="px-3 py-1.5 text-ink-50">{r.name}</td>
                          <td className="px-3 py-1.5 text-ink-200 font-mono">{r.date}</td>
                          <td className="px-3 py-1.5 text-ink-200 font-mono">{r.time || '—'}</td>
                          <td className="px-3 py-1.5 text-ink-200 font-mono">{r.size}</td>
                          <td className="px-3 py-1.5 text-ink-200">{r.status}</td>
                          <td className="px-3 py-1.5 text-ink-200 font-mono">{r.turnMinutes ? `${r.turnMinutes}m` : '—'}</td>
                          <td className="px-3 py-1.5 text-ink-200 font-mono">{r.tableId != null ? (tables.find(t => String(t.id) === String(r.tableId))?.name ?? r.tableId) : (r.tableLabel ? `? ${r.tableLabel}` : '—')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="font-mono text-[9px] text-ink-400 mt-1.5">This history feeds the predictor's training data — assumed values are fine there. Duplicates are skipped automatically, so re-importing the same file is safe.</div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border flex items-center gap-3 flex-shrink-0">
              {busy && (
                <span className="font-mono text-[11px] text-ai animate-pulse">◆ {busy}</span>
              )}
              {!busy && commitDone > 0 && commitDone < rows.length && (
                <span className="font-mono text-[11px] text-amber-300">{commitDone.toLocaleString()} of {rows.length.toLocaleString()} landed</span>
              )}
              {err && <span className="font-mono text-[11px] text-rose-300">{err}</span>}
              <button onClick={onClose} className="ml-auto px-4 py-2 rounded-lg bg-panel-card border border-border text-ink-400 hover:text-ink-50 font-mono text-[11px] uppercase tracking-[0.08em]">Cancel</button>
              <button onClick={commitBulk} disabled={!!busy || rows.length === 0}
                className="px-5 py-2 rounded-lg bg-ai text-bg font-mono text-[11px] uppercase font-bold disabled:opacity-30 disabled:cursor-not-allowed">
                {commitDone > 0 && commitDone < rows.length ? 'Resume commit' : `Commit ${rows.length.toLocaleString()} records`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SettingsView({ setEditMode, setActiveTab, floors = [], tables = [], servers = [], roles = [], addServer, removeServer, setServerColor, setServerRoles, addRole, removeRole, restaurantHours = { open: null, close: null }, setRestaurantHours, prefs = {}, setPref, onResetLiveFloor, onOpenImport, onOpenMigrate }) {
  // Every knob reads from Home's persisted prefs (previously these were
  // component-local useState — they reset on every tab switch, let alone
  // reloads). The set* shims keep all existing JSX below untouched.
  const twentyFourHour = prefs.twentyFourHour ?? false;
  const soundAlerts    = prefs.soundAlerts    ?? false;
  const autoAssign     = prefs.autoAssign     ?? true;
  const confirmSeating = prefs.confirmSeating ?? false;
  const turnTime       = prefs.turnTime       ?? '90';
  const resBuffer      = prefs.resBuffer      ?? '15';
  const largeParty     = prefs.largeParty     ?? '6';
  const holdWindow     = prefs.holdWindow     ?? '15';
  const waitlistSms    = prefs.waitlistSms    ?? true;
  const pagerAlerts    = prefs.pagerAlerts    ?? false;
  const emailDigest    = prefs.emailDigest    ?? true;
  const teamView       = prefs.teamView       ?? false;
  const location = prefs.location || {};
  const setLoc = (field, val) => setPref && setPref('location', { ...(prefs.location || {}), [field]: val });
  const setTwentyFourHour = (v) => setPref && setPref('twentyFourHour', v);
  const setSoundAlerts    = (v) => setPref && setPref('soundAlerts', v);
  const setAutoAssign     = (v) => setPref && setPref('autoAssign', v);
  const setConfirmSeating = (v) => setPref && setPref('confirmSeating', v);
  const setTurnTime       = (v) => setPref && setPref('turnTime', v);
  const setResBuffer      = (v) => setPref && setPref('resBuffer', v);
  const setLargeParty     = (v) => setPref && setPref('largeParty', v);
  const setHoldWindow     = (v) => setPref && setPref('holdWindow', v);
  const setWaitlistSms    = (v) => setPref && setPref('waitlistSms', v);
  const setPagerAlerts    = (v) => setPref && setPref('pagerAlerts', v);
  const setEmailDigest    = (v) => setPref && setPref('emailDigest', v);
  const setTeamView       = (v) => setPref && setPref('teamView', v);

  const enterEditMode = () => {
    setEditMode && setEditMode(true);
    setActiveTab && setActiveTab('floor');
  };

  const selectCls = "bg-panel border border-border rounded-lg px-2.5 py-1.5 font-mono text-xs text-ink-50 outline-none focus:border-ai cursor-pointer";
  const rowCls    = "flex items-center justify-between gap-4 py-2.5";
  const labelCls  = "flex flex-col gap-0.5 min-w-0 pr-2";
  const nameCls   = "text-sm text-ink-50";
  const hintCls   = "font-mono text-[10px] text-ink-400 leading-snug";

  // Team Management takes over the entire settings area when opened.
  if (teamView) {
    return (
      <TeamManagementView
        servers={servers}
        roles={roles}
        addServer={addServer}
        removeServer={removeServer}
        setServerColor={setServerColor}
        setServerRoles={setServerRoles}
        addRole={addRole}
        removeRole={removeRole}
        onBack={() => setTeamView(false)}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-xl font-bold text-ink-50">Settings</h1>
          <p className="font-mono text-[11px] text-ink-400 tracking-[0.04em]">Service defaults and floor configuration for this location.</p>
        </div>

        {/* Team */}
        <section className="bg-panel border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-panel-card">
            <h2 className="font-mono text-[11px] text-ink-400 tracking-[0.14em] uppercase font-bold">Team</h2>
          </div>
          <div className="px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 min-w-0 pr-2">
              <span className="text-sm text-ink-50 font-semibold">Team &amp; roles</span>
              <span className="font-mono text-[10px] text-ink-400 leading-snug">{servers.length} {servers.length === 1 ? 'member' : 'members'} · add or remove staff, set colors, and manage roles.</span>
            </div>
            <button onClick={() => setTeamView(true)} className="flex-shrink-0 px-4 py-2 rounded-lg bg-ai text-bg font-mono text-[11px] tracking-[0.08em] uppercase font-bold hover:opacity-90 transition-opacity shadow-lg shadow-ai/20">Team Management</button>
          </div>
        </section>

        {/* General */}
        <section className="bg-panel border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-panel-card">
            <h2 className="font-mono text-[11px] text-ink-400 tracking-[0.14em] uppercase font-bold">General</h2>
          </div>
          <div className="px-5 py-2 divide-y divide-border">
            <div className={rowCls}>
              <div className={labelCls}>
                <span className={nameCls}>24-hour clock</span>
                <span className={hintCls}>Display service times in 24-hour format.</span>
              </div>
              <SettingToggle on={twentyFourHour} onChange={setTwentyFourHour} />
            </div>
            <div className={rowCls}>
              <div className={labelCls}>
                <span className={nameCls}>Sound alerts</span>
                <span className={hintCls}>Audible cue when a party checks in or a timer elapses.</span>
              </div>
              <SettingToggle on={soundAlerts} onChange={setSoundAlerts} />
            </div>
          </div>
        </section>

        {/* Location & live signals */}
        <section className="bg-panel border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-panel-card">
            <h2 className="font-mono text-[11px] text-ink-400 tracking-[0.14em] uppercase font-bold">Location &amp; Predictor Signals</h2>
          </div>
          <div className="px-5 py-4 flex flex-col gap-4">
            <p className="font-mono text-[10px] text-ink-400 leading-relaxed">
              The predictor uses this to pull the local weather forecast and to run live web research — nearby events, road/construction access, competitor activity, promotions, review trajectory, social buzz, and tourism/economic conditions — for the shift you're forecasting. Coordinates drive the weather; the name lets the web search pin your venue.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink-400 font-bold">Restaurant name</span>
                <input type="text" value={location.name ?? ''} onChange={e => setLoc('name', e.target.value)} placeholder="e.g. Volario's"
                  className="bg-panel-card border border-border-hi rounded-lg px-3 py-2 text-sm text-ink-50 outline-none focus:border-ai" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink-400 font-bold">Street address <span className="normal-case tracking-normal font-normal">(optional)</span></span>
                <input type="text" value={location.address ?? ''} onChange={e => setLoc('address', e.target.value)} placeholder="used for research if set"
                  className="bg-panel-card border border-border-hi rounded-lg px-3 py-2 text-sm text-ink-50 outline-none focus:border-ai" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink-400 font-bold">Latitude</span>
                <input type="text" inputMode="decimal" value={location.lat ?? ''} onChange={e => setLoc('lat', e.target.value)} placeholder="39.9197758"
                  className="bg-panel-card border border-border-hi rounded-lg px-3 py-2 text-sm text-ink-50 outline-none focus:border-ai font-mono" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink-400 font-bold">Longitude</span>
                <input type="text" inputMode="decimal" value={location.lon ?? ''} onChange={e => setLoc('lon', e.target.value)} placeholder="-105.7904009"
                  className="bg-panel-card border border-border-hi rounded-lg px-3 py-2 text-sm text-ink-50 outline-none focus:border-ai font-mono" />
              </label>
            </div>
            <p className="font-mono text-[9px] text-ink-500 leading-relaxed">
              Find coordinates by right-clicking your restaurant in Google Maps → the lat, lon pair at the top. Changes save automatically and apply the next time you refresh a forecast.
            </p>
          </div>
        </section>

        {/* Floor & Service */}
        <section className="bg-panel border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-panel-card">
            <h2 className="font-mono text-[11px] text-ink-400 tracking-[0.14em] uppercase font-bold">Floor &amp; Service</h2>
          </div>
          <div className="px-5 py-4 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 bg-panel-card border border-border-hi rounded-lg px-4 py-3">
              <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                <span className="text-sm text-ink-50 font-semibold">Floor plan</span>
                <span className="font-mono text-[10px] text-ink-400 leading-snug">{tables.length} tables across {floors.length} {floors.length === 1 ? 'floor' : 'floors'}. Add, move, rotate, resize, and renumber tables.</span>
              </div>
              <button
                onClick={enterEditMode}
                className="flex-shrink-0 px-4 py-2 rounded-lg bg-ai text-bg font-mono text-[11px] tracking-[0.08em] uppercase font-bold hover:opacity-90 transition-opacity shadow-lg shadow-ai/20"
              >Edit Layout</button>
            </div>
            <div className="flex items-center justify-between gap-4 bg-panel-card border border-rose-500/30 rounded-lg px-4 py-3">
              <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                <span className="text-sm text-ink-50 font-semibold">Reset live floor</span>
                <span className="font-mono text-[10px] text-ink-400 leading-snug">Clears every table's occupied/bussing/merge state and moves any lingering seated parties to history. Layout is untouched. Use if a table is stuck or a party won't clear.</span>
              </div>
              <button
                onClick={() => { if (onResetLiveFloor && window.confirm('Reset the live floor? All currently-seated parties will be moved to service history and every table set to available. This cannot be undone.')) onResetLiveFloor(); }}
                className="flex-shrink-0 px-4 py-2 rounded-lg bg-transparent border border-rose-500/50 text-rose-300 font-mono text-[11px] tracking-[0.08em] uppercase font-bold hover:bg-rose-500/10 transition-colors"
              >Reset floor</button>
            </div>
            <div className="flex items-center justify-between gap-4 bg-panel-card border border-border rounded-lg px-4 py-3">
              <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                <span className="text-sm text-ink-50 font-semibold">Import history</span>
                <span className="font-mono text-[10px] text-ink-400 leading-snug">Bring reservations, walk-ins and turn times over from a previous system's export (CSV/PDF) or a photographed paper book. Everything is reviewed before it's saved, and it feeds the predictor's training data.</span>
              </div>
              <button
                onClick={() => onOpenImport && onOpenImport()}
                className="flex-shrink-0 px-4 py-2 rounded-lg bg-transparent border border-border-hi text-ink-50 font-mono text-[11px] tracking-[0.08em] uppercase font-bold hover:bg-panel-up transition-colors"
              >Import data</button>
            </div>
            <div className="flex items-center justify-between gap-4 bg-panel-card border border-border rounded-lg px-4 py-3">
              <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                <span className="text-sm text-ink-50 font-semibold">Migrate floor plan</span>
                <span className="font-mono text-[10px] text-ink-400 leading-snug">Photograph or screenshot your previous system's floor plan and get a matching MesaOS floor — table numbers, shapes, seat counts and placement identified automatically, opened in Edit Layout for adjustments. Re-importing a floor with the same name replaces it; Cancel Migration restores the previous plan.</span>
              </div>
              <button
                onClick={() => onOpenMigrate && onOpenMigrate()}
                className="flex-shrink-0 px-4 py-2 rounded-lg bg-transparent border border-border-hi text-ink-50 font-mono text-[11px] tracking-[0.08em] uppercase font-bold hover:bg-panel-up transition-colors"
              >Migrate plan</button>
            </div>
            <div className="divide-y divide-border">
              <div className={rowCls}>
                <div className={labelCls}>
                  <span className={nameCls}>Auto-assign waiters</span>
                  <span className={hintCls}>Suggest a waiter section when a table is seated.</span>
                </div>
                <SettingToggle on={autoAssign} onChange={setAutoAssign} />
              </div>
              <div className={rowCls}>
                <div className={labelCls}>
                  <span className={nameCls}>Confirm before seating</span>
                  <span className={hintCls}>Require a confirmation tap before marking a table seated.</span>
                </div>
                <SettingToggle on={confirmSeating} onChange={setConfirmSeating} />
              </div>
              <div className={rowCls}>
                <div className={labelCls}>
                  <span className={nameCls}>Default turn time</span>
                  <span className={hintCls}>Estimated dining duration used for pacing.</span>
                </div>
                <select className={selectCls} value={turnTime} onChange={(e) => setTurnTime(e.target.value)}>
                  <option value="60">60 min</option>
                  <option value="90">90 min</option>
                  <option value="120">120 min</option>
                  <option value="150">150 min</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Hours */}
        <section className="bg-panel border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-panel-card">
            <h2 className="font-mono text-[11px] text-ink-400 tracking-[0.14em] uppercase font-bold">Hours</h2>
          </div>
          <div className="px-5 py-2 divide-y divide-border">
            <div className={rowCls}>
              <div className={labelCls}>
                <span className={nameCls}>Opening time</span>
                <span className={hintCls}>When the timeline axis starts.</span>
              </div>
              <div className="flex items-center gap-2">
                <TimeTextInput value={restaurantHours.open} onCommit={(min) => setRestaurantHours && setRestaurantHours(h => ({ ...h, open: min }))} />
                <select className={selectCls} value={restaurantHours.open == null ? '' : (HOUR_OPTIONS.includes(restaurantHours.open) ? String(restaurantHours.open) : '')} onChange={(e) => setRestaurantHours && setRestaurantHours(h => ({ ...h, open: e.target.value === '' ? null : Number(e.target.value) }))}>
                  <option value="">Custom</option>
                  {HOUR_OPTIONS.map(m => <option key={m} value={m}>{formatMinutesLabel(m)}</option>)}
                </select>
              </div>
            </div>
            <div className={rowCls}>
              <div className={labelCls}>
                <span className={nameCls}>Closing time</span>
                <span className={hintCls}>When the timeline axis ends.</span>
              </div>
              <div className="flex items-center gap-2">
                <TimeTextInput value={restaurantHours.close} onCommit={(min) => setRestaurantHours && setRestaurantHours(h => ({ ...h, close: min }))} />
                <select className={selectCls} value={restaurantHours.close == null ? '' : (HOUR_OPTIONS.includes(restaurantHours.close) ? String(restaurantHours.close) : '')} onChange={(e) => setRestaurantHours && setRestaurantHours(h => ({ ...h, close: e.target.value === '' ? null : Number(e.target.value) }))}>
                  <option value="">Custom</option>
                  {HOUR_OPTIONS.map(m => <option key={m} value={m}>{formatMinutesLabel(m)}</option>)}
                </select>
              </div>
            </div>
            <div className="py-2.5">
              <span className={hintCls}>Type an exact time (e.g. 8:15 AM) or pick a common one. Overnight hours are supported — set close earlier than open (e.g. open 10 AM, close 1 AM) and the service day runs past midnight.</span>
            </div>
          </div>
        </section>

        {/* Reservations */}
        <section className="bg-panel border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-panel-card">
            <h2 className="font-mono text-[11px] text-ink-400 tracking-[0.14em] uppercase font-bold">Reservations</h2>
          </div>
          <div className="px-5 py-2 divide-y divide-border">
            <div className={rowCls}>
              <div className={labelCls}>
                <span className={nameCls}>Booking buffer</span>
                <span className={hintCls}>Spacing held between consecutive reservations on a table.</span>
              </div>
              <select className={selectCls} value={resBuffer} onChange={(e) => setResBuffer(e.target.value)}>
                <option value="0">None</option>
                <option value="15">15 min</option>
                <option value="30">30 min</option>
              </select>
            </div>
            <div className={rowCls}>
              <div className={labelCls}>
                <span className={nameCls}>Large party threshold</span>
                <span className={hintCls}>Parties at or above this size flag for manager review.</span>
              </div>
              <select className={selectCls} value={largeParty} onChange={(e) => setLargeParty(e.target.value)}>
                <option value="5">5+</option>
                <option value="6">6+</option>
                <option value="8">8+</option>
                <option value="10">10+</option>
              </select>
            </div>
            <div className={rowCls}>
              <div className={labelCls}>
                <span className={nameCls}>Hold window</span>
                <span className={hintCls}>How long a table is held past the reservation time before release.</span>
              </div>
              <select className={selectCls} value={holdWindow} onChange={(e) => setHoldWindow(e.target.value)}>
                <option value="10">10 min</option>
                <option value="15">15 min</option>
                <option value="20">20 min</option>
              </select>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section className="bg-panel border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-panel-card">
            <h2 className="font-mono text-[11px] text-ink-400 tracking-[0.14em] uppercase font-bold">Notifications</h2>
          </div>
          <div className="px-5 py-2 divide-y divide-border">
            <div className={rowCls}>
              <div className={labelCls}>
                <span className={nameCls}>Waitlist SMS</span>
                <span className={hintCls}>Text guests automatically when their table is ready.</span>
              </div>
              <SettingToggle on={waitlistSms} onChange={setWaitlistSms} />
            </div>
            <div className={rowCls}>
              <div className={labelCls}>
                <span className={nameCls}>Pager alerts</span>
                <span className={hintCls}>Trigger table-side pagers in addition to SMS.</span>
              </div>
              <SettingToggle on={pagerAlerts} onChange={setPagerAlerts} />
            </div>
            <div className={rowCls}>
              <div className={labelCls}>
                <span className={nameCls}>Nightly email digest</span>
                <span className={hintCls}>End-of-service summary of covers, no-shows, and turn times.</span>
              </div>
              <SettingToggle on={emailDigest} onChange={setEmailDigest} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Date helpers (used by Calendar) ─────────────────────────────────
// Format a Date as YYYY-MM-DD in LOCAL time (not UTC, which would
// shift by the timezone offset and put events on the wrong day for
// users west of UTC). Lexicographic sort works on this format.
// Monotonic, collision-proof client ids. Date.now() alone can collide on
// a double-click (same millisecond) — two records sharing an id breaks
// every per-id update after that.
let __mintCounter = 0;
// ─── Importer helpers ────────────────────────────────────────────────
// Minimal RFC-4180-ish CSV parser: quoted fields, escaped quotes, CRLF.
// Hand-rolled so the importer's deterministic fast-path adds zero deps.
function parseCsvText(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

// "07/09/2026", "7/9/26", "2026-07-09" → "YYYY-MM-DD" (or null).
function normalizeDateKey(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) {
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yy}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return null;
}

function normalizeImportStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('no') && s.includes('show')) return 'no_show';
  if (s.includes('finish') || s.includes('complete') || s.includes('done') || s.includes('depart') || s.includes('left')) return 'finished';
  if (s.includes('seat')) return 'seated_only';
  return 'unknown';
}

// "Table 12" / "T12" / "12" → the matching MesaOS table id (type
// preserved), or null. Old-system labels that don't exist here stay
// unmatched — history is still valuable without a table link.
function matchTableByLabel(tablesList, label) {
  if (label == null || label === '') return null;
  const norm = (v) => String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = norm(label);
  if (!n) return null;
  const numeric = n.replace(/^t(?:able)?/, '');
  for (const t of tablesList) {
    const nn = norm(t.name);
    const ni = norm(t.id);
    if (n === nn || n === ni) return t.id;
    if (numeric && (nn === `t${numeric}` || ni === numeric || nn === numeric)) return t.id;
  }
  return null;
}

// ─── AI-mapped import (deterministic application layer) ──────────────
// /api/import/ai returns a COLUMN MAPPING from one cheap LLM look at the
// header + samples; everything below applies that mapping to the whole
// file locally. The LLM decides "which column is what"; plain code does
// the 13,000 rows. Fields the file doesn't have get a sane default
// (turn ← settings default, size ← matched table's capacity) or stay
// blank — this history feeds the predictor, so approximately-right and
// complete beats perfect and unimportable.

// "2025-03-14 7:15 PM" / "03/14/2025 19:15" / "7:15 PM" → parts.
function splitDateTimeParts(raw) {
  const s = String(raw || '').trim();
  if (!s) return { date: '', time: '' };
  const tm = s.match(/(\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)/i);
  const time = tm ? tm[1].trim() : '';
  const date = time ? s.replace(tm[0], '').replace(/[T,@]/g, ' ').trim() : s;
  return { date: /\d/.test(date.replace(time, '')) && /[\/\-.]|\d{4}/.test(date) ? date : '', time };
}

// normalizeDateKey assumes M/D/Y for slashed dates; this variant obeys
// the mapping's detected component order.
function normalizeDateKeyOrdered(raw, order) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) {
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    const [a, b] = [m[1], m[2]];
    const [mo, da] = order === 'DMY' ? [b, a] : [a, b];
    if (Number(mo) > 12 || Number(da) > 31 || Number(mo) < 1 || Number(da) < 1) return null;
    return `${yy}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`;
  }
  return null;
}

// "90" / "1:30" / "5400" (seconds) / "1.5" (hours) → minutes or null.
function parseDurationMinutes(raw, unit) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const hm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const hmm = s.match(/(\d+)\s*h(?:ours?|rs?)?\s*(\d+)?\s*m?/i);
  if (hmm && /h/i.test(s)) return Number(hmm[1]) * 60 + (Number(hmm[2]) || 0);
  const n = parseFloat(s.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (unit === 'seconds') return Math.round(n / 60);
  if (unit === 'hours') return Math.round(n * 60);
  if (unit === 'hhmm') return Math.round(n); // already caught by hm above; bare number = minutes
  // Heuristic guard: a "minutes" column holding 5400 is really seconds.
  if (n > 600) return Math.round(n / 60);
  return Math.round(n);
}

// The "table 21 → table 22" rule: a label the old system used that
// doesn't exist on THIS floor gets remapped to the nearest-numbered
// existing table whose capacity fits the parties seen at that label —
// old floorplans drift by a seat or get renumbered wholesale, and an
// approximate link beats a dropped one for section history.
function remapUnmatchedTables(rows, tablesList) {
  const numOf = (label) => {
    const m = String(label ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^t(?:able)?/, '');
    return /^\d+$/.test(m) ? parseInt(m, 10) : null;
  };
  const numbered = tablesList
    .map(t => ({ t, num: numOf(t.name) ?? numOf(t.id) }))
    .filter(x => x.num != null);
  if (numbered.length === 0) return 0;

  // Party sizes seen at each unmatched label → capacity requirement.
  const byLabel = new Map();
  for (const r of rows) {
    if (r.tableId != null || !r.tableLabel) continue;
    const n = numOf(r.tableLabel);
    if (n == null) continue;
    if (!byLabel.has(n)) byLabel.set(n, { rows: [], sizes: [] });
    byLabel.get(n).rows.push(r);
    if (Number(r.size) >= 1) byLabel.get(n).sizes.push(Number(r.size));
  }

  let remapped = 0;
  for (const [labelNum, group] of byLabel) {
    const sizes = group.sizes.sort((a, b) => a - b);
    const need = sizes.length ? sizes[Math.floor(sizes.length * 0.75)] : null; // p75 — outlier-tolerant
    const best = numbered
      .map(x => ({
        ...x,
        score: (need != null && Number(x.t.capacity) >= need ? 0 : 100) // fits-the-parties first
          + Math.abs(x.num - labelNum)                                   // then numeric closeness
          + (need != null ? Math.abs(Number(x.t.capacity) - need) * 0.1 : 0),
      }))
      .sort((a, b) => a.score - b.score)[0];
    // Only remap plausible drift — a label 40 numbers away is a
    // different room scheme, not a renumbering; leave it unlinked.
    if (best && Math.abs(best.num - labelNum) <= 15) {
      for (const r of group.rows) r.tableId = best.t.id;
      remapped += group.rows.length;
    }
  }
  return remapped;
}

// Apply the AI mapping to every parsed row. Returns { rows, stats }.
function applyImportMapping(csvRows, mapping, tablesList, defaultDate, defaultTurnMinutes) {
  const cols = mapping.columns || {};
  const body = (mapping.hasHeader ? csvRows.slice(1) : csvRows)
    .filter(r => Array.isArray(r) && r.some(c => String(c ?? '').trim() !== ''));
  const statusLookup = new Map(
    (mapping.statusMap || []).map(s => [String(s.value).toLowerCase().trim(), s.meaning])
  );
  const walkinSet = new Set((mapping.walkInSourceValues || []).map(v => String(v).toLowerCase().trim()));
  const capacityOf = new Map(tablesList.map(t => [t.id, Number(t.capacity) || null]));

  const stats = { total: body.length, dateless: 0, namedGuests: 0, synthesizedNames: 0, turnDefaults: 0, tableMatched: 0, tableRemapped: 0, sizeDefaults: 0 };
  const rows = [];
  for (let i = 0; i < body.length; i++) {
    const r = body[i];
    const cell = (idx) => (idx == null || idx === undefined ? '' : String(r[idx] ?? '').trim());

    let name = cell(cols.fullName) || [cell(cols.firstName), cell(cols.lastName)].filter(Boolean).join(' ').trim();
    if (name) stats.namedGuests++;
    else { name = `Guest ${String(i + 1).padStart(4, '0')}`; stats.synthesizedNames++; }

    const vd = splitDateTimeParts(cell(cols.visitDate));
    const dd = splitDateTimeParts(cell(cols.date));
    const date = normalizeDateKeyOrdered(vd.date || dd.date, mapping.dateOrder)
      || normalizeDateKey(vd.date || dd.date)
      || defaultDate || '';
    if (!date) { stats.dateless++; continue; } // no anchor — useless to the predictor

    const st = splitDateTimeParts(cell(cols.seatedTime));
    const ft = splitDateTimeParts(cell(cols.finishedTime));
    const seatedTime = st.time || null;
    const finishedTime = ft.time || null;
    const time = cell(cols.time) || vd.time || dd.time || seatedTime || null;

    const rawStatus = cell(cols.status);
    let status = statusLookup.get(rawStatus.toLowerCase()) || normalizeImportStatus(rawStatus);
    if (status === 'unknown') status = 'finished';

    let turnMinutes = parseDurationMinutes(cell(cols.totalDuration), mapping.durationUnit);
    if (turnMinutes == null && !(seatedTime && finishedTime) && status === 'finished') {
      turnMinutes = defaultTurnMinutes; stats.turnDefaults++; // assumed turn — predictor-grade, not gospel
    }

    const tableLabel = cell(cols.tableNumber) || null;
    const tableId = matchTableByLabel(tablesList, tableLabel);
    if (tableId != null) stats.tableMatched++;

    const noteBits = [cell(cols.notes), cell(cols.tags) ? `Tags: ${cell(cols.tags)}` : ''].filter(Boolean);

    rows.push({
      key: `ai-${i}`,
      name, date, time,
      size: parseInt(cell(cols.partySize), 10) || null,
      status, seatedTime, finishedTime, turnMinutes,
      tableLabel, tableId,
      kind: walkinSet.has(cell(cols.source).toLowerCase()) ? 'walkin' : 'reservation',
      phone: cell(cols.phone) || null,
      email: cell(cols.email) || null,
      notes: noteBits.join(' · ') || null,
      include: true, unclear: false,
    });
  }

  stats.tableRemapped = remapUnmatchedTables(rows, tablesList);
  stats.tableMatched += stats.tableRemapped;
  for (const row of rows) {
    if (!row.size) {
      // Missing party size: the table they sat at is the best witness.
      row.size = (row.tableId != null ? capacityOf.get(row.tableId) : null) || 2;
      stats.sizeDefaults++;
    }
  }
  return { rows, stats };
}

// Header aliases → canonical import fields (source-agnostic superset of
// the common OpenTable/Resy export headings, expressed generically).
// Header aliases → the canonical mapping column fields (see
// applyImportMapping). Exact normalized-header match, so "Party Size" →
// partysize hits `partySize`, never `size` on some other column. This is
// the DETERMINISTIC column identifier: a labelled export (OpenTable,
// Resy, a Google Sheet) is fully mapped by these alone — the AI is only
// consulted to fill gaps or read unlabelled/odd files, and its failure
// never blocks a standard import.
const IMPORT_HEADER_ALIASES = {
  // Ordered by priority: earlier fields claim a column first so a
  // header that could match two fields lands on the more specific one.
  firstName: ['firstname', 'first', 'fname', 'guestfirstname'],
  lastName: ['lastname', 'last', 'lname', 'surname', 'guestlastname'],
  phoneticName: ['phoneticname', 'phonetic'],
  fullName: ['name', 'guest', 'guestname', 'party', 'partyname', 'fullname', 'guestfullname', 'customer', 'customername', 'diner'],
  partySize: ['size', 'partysize', 'covers', 'guests', 'pax', 'count', 'numberofguests', 'seats', 'guestcount', 'people', 'ppl', 'noofguests'],
  visitDate: ['visitdate', 'visitdatetime', 'reservationdatetime', 'datetime', 'seateddatetime'],
  date: ['date', 'resdate', 'reservationdate', 'day', 'servicedate', 'businessdate', 'bookingdate'],
  time: ['time', 'restime', 'reservationtime', 'booked', 'bookedtime', 'bookingtime'],
  createdTime: ['createdtime', 'created', 'createdat', 'bookedon', 'bookingcreated', 'datecreated'],
  lastUpdated: ['lastupdated', 'updated', 'updatedat', 'lastmodified', 'modified', 'datemodified'],
  seatedTime: ['seated', 'seatedtime', 'seatedon', 'seatedat', 'arrival', 'arrived', 'arrivaltime'],
  finishedTime: ['finished', 'finishedtime', 'finishedat', 'completed', 'completedtime', 'departure', 'departed', 'lefttime', 'endtime', 'donetime'],
  totalDuration: ['totalduration', 'duration', 'turn', 'turntime', 'turnminutes', 'minutes', 'length', 'visitduration', 'timeattable', 'dwelltime'],
  phone: ['phone', 'phonenumber', 'phoneno', 'mobile', 'cell', 'telephone', 'tel', 'contactnumber', 'contact'],
  email: ['email', 'emailaddress', 'guestemail', 'mail'],
  marketingOptIn: ['marketingoptin', 'optin', 'marketing', 'emailoptin', 'subscribed', 'emailconsent'],
  source: ['source', 'channel', 'bookingsource', 'origin', 'reservationsource', 'bookingchannel', 'via'],
  shift: ['shift', 'mealperiod', 'meal', 'period', 'service', 'daypart', 'seating'],
  tableNumber: ['table', 'tables', 'tablenumber', 'tableno', 'tablelabel', 'tablename', 'tableid', 'tbl'],
  posRevenue: ['posrevenue', 'revenue', 'checktotal', 'total', 'saleamount', 'netsales', 'grosssales', 'amount', 'spend', 'checkamount'],
  posGratuity: ['posgratuity', 'gratuity', 'tip', 'gratuityamount', 'tipamount'],
  totalGratuity: ['totalgratuity', 'totaltip', 'totalgratuityamount'],
  notes: ['notes', 'note', 'comments', 'comment', 'specialrequests', 'requests', 'remarks'],
  tags: ['tags', 'tag', 'labels', 'guesttags', 'visittags'],
  status: ['status', 'state', 'outcome', 'reservationstatus', 'visitstatus', 'resstatus'],
};

// ─── Deterministic format decode (no AI) ─────────────────────────────
// Sniff the delimiter, parse the whole file, return rows-as-arrays. The
// LLM never sees raw bytes: this hands it already-tabular data so it can
// reason about MEANING, not file format.
function sniffDelimiter(text) {
  const firstLines = String(text).split(/\r?\n/).filter(l => l.trim() !== '').slice(0, 5);
  const candidates = [',', '\t', ';', '|'];
  let best = ',', bestScore = -1;
  for (const d of candidates) {
    // Score by the median field count across sample lines — the real
    // delimiter yields many, consistent columns.
    const counts = firstLines.map(l => l.split(d).length);
    const score = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

// General delimited parser (RFC-4180-ish): quotes, escaped quotes, CRLF.
// parseCsvText stays for the comma case; this generalizes to any char.
function parseDelimited(text, delimiter) {
  if (delimiter === ',') return parseCsvText(text);
  const rows = [];
  let row = [], field = '', inQ = false;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

function decodeTabularFile(text) {
  const delimiter = sniffDelimiter(text);
  const rows = parseDelimited(text, delimiter);
  return { delimiter, rows };
}

// ─── Deterministic column mapping (no AI) ────────────────────────────
// Produces the SAME mapping shape the AI route returns, from header
// names + data samples alone. A labelled export is fully handled here;
// applyImportMapping consumes this object directly. Returns matchedCount
// so the caller knows whether AI help is even needed.
function deterministicMapping(csvRows) {
  const empty = {
    hasHeader: false,
    columns: {}, dateOrder: 'MDY', durationUnit: 'unknown',
    statusMap: [], walkInSourceValues: [], warnings: [], confidence: 'low',
    matchedCount: 0,
  };
  if (!Array.isArray(csvRows) || csvRows.length === 0) return empty;
  const header = (csvRows[0] || []).map(h => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''));

  const columns = {};
  const claimed = new Set();
  for (const [field, aliases] of Object.entries(IMPORT_HEADER_ALIASES)) {
    const idx = header.findIndex((h, i) => !claimed.has(i) && h && aliases.includes(h));
    if (idx >= 0) { columns[field] = idx; claimed.add(idx); }
  }
  const matchedCount = Object.keys(columns).length;
  // Header row present when we recognized real column titles.
  const hasHeader = matchedCount >= 1;
  const body = hasHeader ? csvRows.slice(1) : csvRows;

  // dateOrder from evidence: scan the date/visitDate column for a
  // component that can only be a day (>12) or can only be a month.
  let dateOrder = 'MDY';
  const dateIdx = columns.date != null ? columns.date : columns.visitDate;
  if (dateIdx != null) {
    for (const r of body.slice(0, 400)) {
      const m = String(r[dateIdx] ?? '').match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-]\d{2,4}/);
      if (!m) continue;
      const a = Number(m[1]), b = Number(m[2]);
      if (a > 12 && b <= 12) { dateOrder = 'DMY'; break; }
      if (b > 12 && a <= 12) { dateOrder = 'MDY'; break; }
    }
  }

  // statusMap from the distinct raw values actually present.
  const statusMap = [];
  if (columns.status != null) {
    const seen = new Set();
    for (const r of body) {
      const v = String(r[columns.status] ?? '').trim();
      if (!v || seen.has(v.toLowerCase())) continue;
      seen.add(v.toLowerCase());
      statusMap.push({ value: v, meaning: normalizeImportStatus(v) === 'unknown' ? 'finished' : normalizeImportStatus(v) });
      if (statusMap.length > 40) break;
    }
  }

  // Walk-in source values — anything that reads like a walk-in.
  const walkInSourceValues = [];
  if (columns.source != null) {
    const seen = new Set();
    for (const r of body) {
      const v = String(r[columns.source] ?? '').trim();
      if (!v || seen.has(v.toLowerCase())) continue;
      seen.add(v.toLowerCase());
      if (/walk|wi\b|walkin/i.test(v)) walkInSourceValues.push(v);
      if (seen.size > 60) break;
    }
  }

  return { hasHeader, columns, dateOrder, durationUnit: 'unknown', statusMap, walkInSourceValues, warnings: [], confidence: matchedCount >= 3 ? 'high' : 'medium', matchedCount };
}

// Merge an AI mapping onto the deterministic base: the deterministic
// column wins where it matched a real header (high precision); the AI
// fills only the columns the header pass left null (odd/unlabelled
// files). Non-column signals prefer whichever side has data.
function mergeMappings(base, ai) {
  if (!ai) return base;
  const columns = { ...(ai.columns || {}) , ...Object.fromEntries(Object.entries(base.columns || {})) };
  // (base spread last → base non-null wins; but keep AI where base absent)
  for (const [k, v] of Object.entries(ai.columns || {})) {
    if (columns[k] == null && v != null) columns[k] = v;
  }
  const statusMap = (base.statusMap && base.statusMap.length) ? base.statusMap : (ai.statusMap || []);
  const walkInSourceValues = Array.from(new Set([...(base.walkInSourceValues || []), ...(ai.walkInSourceValues || [])]));
  return {
    hasHeader: base.hasHeader || !!ai.hasHeader,
    columns,
    dateOrder: (base.dateOrder && base.dateOrder !== 'MDY') ? base.dateOrder : (ai.dateOrder || base.dateOrder || 'MDY'),
    durationUnit: (ai.durationUnit && ai.durationUnit !== 'unknown') ? ai.durationUnit : (base.durationUnit || 'unknown'),
    statusMap,
    walkInSourceValues,
    warnings: [...(ai.warnings || [])],
    confidence: base.matchedCount >= 3 ? 'high' : (ai.confidence || base.confidence),
  };
}

// Rasterise a PDF's pages to JPEG data-URLs in the browser via pdf.js.
// Dynamic import keeps it out of the main bundle; the worker loads from
// the CDN pinned to the installed version (no bundler worker plumbing).
async function pdfFileToPageImages(file, onProgress) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const images = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, 1400 / base.width); // ~1400px wide: legible, token-sane
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    images.push(canvas.toDataURL('image/jpeg', 0.85));
    if (onProgress) onProgress(p, doc.numPages);
  }
  return images;
}

// Map a vision-extracted table (center as % of the source image) into
// world coordinates for a fresh floor. The canvas is infinite, so the
// scale is arbitrary — 1400×900 with padding gives comfortable spacing
// at default zoom, and reload/floor-switch auto-fit frames it anyway.
const MIGRATE_WORLD = { W: 1400, H: 900, PAD: 60 };
function pctToWorld(xPct, yPct, shape, capacity, boxW = MIGRATE_WORLD.W, boxH = MIGRATE_WORLD.H) {
  const s = getTableSizePx(shape, capacity);
  const cx = MIGRATE_WORLD.PAD + (Math.max(0, Math.min(100, xPct)) / 100) * boxW;
  const cy = MIGRATE_WORLD.PAD + (Math.max(0, Math.min(100, yPct)) / 100) * boxH;
  return { x: Math.round(cx - s.width / 2), y: Math.round(cy - s.height / 2) };
}

// Post-mapping collision pass: extraction centers can land closer than
// the tables' rendered footprints (the source pixels were smaller than
// our tiles), which stacks tiles on top of each other. Iteratively push
// intersecting pairs apart along the axis of least overlap — relative
// arrangement is preserved, stacking is not. Deterministic, bounded.
function separateMigratedTables(list) {
  const GAP = 12;
  const boxes = list.map(t => { const s = getTableSizePx(t.shape, t.capacity); return { t, w: s.width, h: s.height }; });
  for (let iter = 0; iter < 80; iter++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const dx = (b.t.x + b.w / 2) - (a.t.x + a.w / 2);
        const dy = (b.t.y + b.h / 2) - (a.t.y + a.h / 2);
        const ox = (a.w + b.w) / 2 + GAP - Math.abs(dx);
        const oy = (a.h + b.h) / 2 + GAP - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          moved = true;
          // +0.5 epsilon: without it the pass converges to EXACTLY the
          // target gap and the final Math.round can land 1px short.
          if (ox < oy) {
            const push = (ox / 2 + 0.5) * (dx >= 0 ? 1 : -1);
            a.t.x -= push; b.t.x += push;
          } else {
            const push = (oy / 2 + 0.5) * (dy >= 0 ? 1 : -1);
            a.t.y -= push; b.t.y += push;
          }
        }
      }
    }
    if (!moved) break;
  }
  list.forEach(t => { t.x = Math.round(t.x); t.y = Math.round(t.y); });
}

// Downscale a photo to a vision-friendly JPEG data-URL. Full-resolution
// phone photos exceed the vision API's per-image size cap once base64'd
// (hard 4xx from the provider → our 500), and even in-cap ones are slow
// and token-hungry. 1600px on the long edge reads floor-plan labels fine.
// Falls back to the raw file on any decode failure (e.g. exotic formats).
function downscaleImageFile(file, maxEdge = 1600) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        // Aspect rides along so the world mapping can preserve the source
        // photo's geometry instead of squeezing it into a fixed box.
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.85), aspect: img.width / Math.max(1, img.height) });
      } catch (_) {
        URL.revokeObjectURL(url);
        fileToDataUrl(file).then(d => resolve({ dataUrl: d, aspect: 14 / 9 }));
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); fileToDataUrl(file).then(d => resolve({ dataUrl: d, aspect: 14 / 9 })); };
    img.src = url;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Split a joined table-id string ("8_9", "t16_5") into its member ids,
// PRESERVING each part's type: numeric-looking parts become numbers
// (legacy tables), everything else stays a string (designer tables).
// Blanket .map(Number) turned "t16" into NaN — which silently broke the
// merge capacity check, performSeat's group stamping, and the force-seat
// modal for any merge containing a designer table.
function splitTableIds(raw) {
  return String(raw).split('_').map(x => (/^\d+$/.test(x) ? Number(x) : x));
}

function mintId(prefix) {
  __mintCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${__mintCounter.toString(36)}`;
}

function formatDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Human-readable date format for the sidebar header.
// Inverse of formatDateKey — parses "YYYY-MM-DD" as a LOCAL date. A
// naive `new Date("2026-07-03")` is UTC midnight, which renders as the
// PREVIOUS day for users west of UTC (same rationale as formatDateHuman
// below). Returns null on anything malformed.
function parseDateKey(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatDateHuman(dateStr) {
  if (!dateStr) return '';
  // Parse YYYY-MM-DD as a LOCAL date (not UTC) by splitting and using
  // the year/month/day constructor — avoids the off-by-one bug where
  // `new Date("2025-10-14")` is parsed as UTC midnight and renders as
  // Oct 13 in negative-offset timezones.
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

// ─── CalendarView ────────────────────────────────────────────────────
// Standard month grid with prev/next navigation. Navigation backward
// is capped at 3 months before the current month (a config knob —
// could be widened later). Each cell renders a date number plus a
// small reservation indicator dot if any bookings exist for that day.
function CalendarView({
  calendarMonth, setCalendarMonth,
  selectedCalendarDate, setSelectedCalendarDate,
  reservations = [],
  now,
  onDayClick,
}) {
  // Anchor "today" to the parent's ticking `now` value so the
  // highlight stays accurate across midnight without a page reload —
  // Home's 30s tick re-renders the calendar with a fresh `now`, the
  // derivation re-runs, todayKey rolls to the new day.
  const today      = new Date(now ?? Date.now());
  const todayKey   = formatDateKey(today);
  const viewYear   = calendarMonth.getFullYear();
  const viewMonth  = calendarMonth.getMonth();

  // Month label, e.g., "October 2025"
  const monthLabel = calendarMonth.toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  });

  // Build the cell array — leading padding for the starting weekday,
  // then numbered days, then trailing padding to fill the last row.
  const firstDay   = new Date(viewYear, viewMonth, 1).getDay();   // 0 = Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(viewYear, viewMonth, d);
    cells.push({ day: d, key: formatDateKey(cellDate) });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  // Reservations bucketed by date key for O(1) lookup per cell.
  // Reservations without a date field default-attach to today via the
  // sidebar's filter — but the indicator dot stays strict (date field
  // required) so the calendar doesn't paint every empty cell as busy.
  const bookingsByDate = {};
  for (const r of reservations) {
    if (!r.date) continue;
    bookingsByDate[r.date] = (bookingsByDate[r.date] || 0) + 1;
  }

  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Navigation is symmetric and unbounded in both directions — hosts
  // need access to the full historical compendium for volume analysis.
  const goPrev = () => setCalendarMonth(new Date(viewYear, viewMonth - 1, 1));
  const goNext = () => setCalendarMonth(new Date(viewYear, viewMonth + 1, 1));

  return (
    <div className="flex-1 overflow-auto p-6 bg-bg">
      <div className="max-w-5xl mx-auto">
        {/* Header — month label + prev/next controls */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink-50 mb-1">{monthLabel}</h2>
            <p className="text-sm text-ink-400">
              Click any day to view its reservations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              className="px-3 py-1.5 rounded-lg bg-panel-card border border-border-hi text-ink-50 font-mono text-sm hover:bg-panel-up transition-colors"
            >
              ‹ Prev
            </button>
            <button
              onClick={() => setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="px-3 py-1.5 rounded-lg bg-panel-card border border-border-hi text-ink-50 font-mono text-xs uppercase tracking-wider hover:bg-panel-up transition-colors"
            >
              Today
            </button>
            <button
              onClick={goNext}
              className="px-3 py-1.5 rounded-lg bg-panel-card border border-border-hi text-ink-50 font-mono text-sm hover:bg-panel-up transition-colors"
            >
              Next ›
            </button>
          </div>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {dayHeaders.map(h => (
            <div key={h} className="text-center font-mono text-[10px] tracking-[0.2em] uppercase text-ink-400 font-bold py-1">
              {h}
            </div>
          ))}
        </div>

        {/* Date cells */}
        <div className="grid grid-cols-7 gap-2">
          {cells.map((cell, i) => {
            if (!cell) {
              return <div key={`pad-${i}`} className="aspect-square"></div>;
            }
            const isToday    = cell.key === todayKey;
            const isSelected = cell.key === selectedCalendarDate;
            const isPast     = cell.key < todayKey;
            const bookingCount = bookingsByDate[cell.key] || 0;
            return (
              <button
                key={cell.key}
                onClick={() => {
                  // Click clears table/reservation selection per spec
                  // so the right-panel mutual exclusion can render
                  // CalendarSidebar instead.
                  if (onDayClick) onDayClick(cell.key);
                }}
                className={`aspect-square rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${
                  isSelected
                    ? 'bg-ai/15 border-ai text-ai shadow-lg shadow-ai/20'
                    : isToday
                      ? 'ring-1 ring-ai bg-ai-bg/20 border-ai/60 text-ai hover:bg-ai-bg/30'
                      : isPast
                        ? 'bg-panel-card/40 border-border/50 text-ink-400 hover:bg-panel-card hover:border-border-hi'
                        : 'bg-panel-card border-border text-ink-50 hover:border-border-hi hover:bg-panel-up'
                }`}
              >
                <span className={`font-display text-lg font-bold tabular-nums leading-none ${isSelected || isToday ? 'text-ai' : ''}`}>
                  {cell.day}
                </span>
                {bookingCount > 0 && (
                  <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected || isToday ? 'bg-ai' : 'bg-state-reserved'}`}></span>
                    <span className="font-mono text-[9px] text-ink-400 tabular-nums">{bookingCount}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── CalendarSidebar ─────────────────────────────────────────────────
// Right-panel that opens when a day is clicked in CalendarView. Mirrors
// TableDetailsPanel's geometry (w-80, bg-panel, border-l) so the right
// rail stays consistent across all three panel types (table / reservation
// / calendar).
function CalendarSidebar({ date, reservations = [], onClose, onOpenReservation }) {
  if (!date) return null;

  // Today's key for the legacy-fallback below. Reservations without a
  // r.date field are assumed to belong to today (matches spec note
  // about mock data that hasn't been migrated to include date).
  const todayKey = formatDateKey(new Date());

  const daysReservations = reservations.filter(r =>
    r.date === date || (!r.date && date === todayKey)
  );

  // Sort by time so the day reads chronologically. Same inline parser
  // pattern used on the floor map's clock-badge sort.
  const parseResTime = (s) => {
    if (typeof s !== 'string') return Infinity;
    const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/i);
    if (!m) return Infinity;
    let h = parseInt(m[1], 10);
    const mn = m[2] ? parseInt(m[2], 10) : 0;
    if (h === 12) h = 0;
    if (m[3].toLowerCase() === 'p') h += 12;
    return h * 60 + mn;
  };
  const sorted = [...daysReservations].sort((a, b) => parseResTime(a.time) - parseResTime(b.time));

  return (
    <aside className="w-80 bg-panel border-l border-border flex flex-col overflow-hidden" data-calendar-panel>
      {/* Header with date + close button */}
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-400 font-bold mb-1">
            Selected day
          </div>
          <h3 className="font-display text-base font-bold text-ink-50 leading-tight">
            {formatDateHuman(date)}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-md text-ink-400 hover:text-ink-50 hover:bg-panel-card transition-colors flex-shrink-0 text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Reservations list */}
      <div className="flex-1 overflow-auto p-5">
        <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-400 font-bold mb-3">
          Reservations · <span className="text-ink-50">{sorted.length}</span>
        </div>
        {sorted.length === 0 ? (
          <div className="text-sm text-ink-400/60 italic text-center py-8">
            No reservations for this date.
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map(r => (
              <div
                key={r.id}
                onClick={() => onOpenReservation && onOpenReservation(r.id)}
                data-reservation-row
                className="bg-panel-card border border-border rounded-lg p-3 hover:border-border-hi hover:bg-panel-up transition-colors cursor-pointer"
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="font-display text-sm font-bold text-ink-50 truncate">{r.name}</span>
                  <span className="font-mono text-xs text-state-reserved tabular-nums flex-shrink-0">{r.time}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-ink-400 font-mono">
                  <span>Party of <span className="text-ink-50 tabular-nums">{r.size}</span></span>
                  {r.tableId != null && (
                    <span>·</span>
                  )}
                  {r.tableId != null && (
                    <span>Table <span className="text-ink-50 tabular-nums">{r.tableId}</span></span>
                  )}
                  {r.status && r.status !== 'confirmed' && (
                    <>
                      <span>·</span>
                      <span className="capitalize text-ink-50">{r.status.replace('_', ' ')}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function WaitlistView({ waitlist, now, onSeatParty, onOpenReservation, onDeleteParty }) {
  return (
    <div className="flex-1 overflow-auto p-6 bg-bg">
      <div className="max-w-[800px] mx-auto">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-display text-2xl font-bold text-ink-50">Waitlist</h2>
          <span className="font-mono text-[11px] text-ink-400 tabular-nums">
            <span className="text-state-avail">{waitlist.length}</span>
            <span className="opacity-50"> · party{waitlist.length === 1 ? '' : 's'} waiting</span>
          </span>
        </div>
        {waitlist.length === 0 ? (
          <div className="bg-panel border border-border rounded-xl px-6 py-12 text-center">
            <div className="font-display text-lg text-ink-400 mb-1">No parties on the waitlist</div>
            <div className="text-[12px] text-ink-400/70">Add a walk-in or push a reservation here to start a queue.</div>
          </div>
        ) : (
          <div className="bg-panel border border-border rounded-xl overflow-hidden">
            {waitlist.map(p => {
              const waitedMin = Math.floor((now - p.addedAt) / 60_000);
              const isReservation = p.type === 'reservation';
              const isPartial     = p.status === 'partially_arrived';
              // Unified party-details behavior — every row opens the
              // sidebar (was previously gated to type:'reservation').
              const rowClickable = !!onOpenReservation;
              return (
                <div
                  key={p.id}
                  {...(rowClickable && { 'data-reservation-row': true })}
                  onClick={rowClickable ? () => onOpenReservation(p.id) : undefined}
                  className={`group flex items-center gap-4 px-5 py-4 border-b border-border last:border-b-0 transition-colors ${
                    rowClickable ? 'cursor-pointer hover:bg-panel-card' : 'hover:bg-panel-card'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-display text-base font-semibold text-ink-50 truncate">{p.name}</span>
                      <span className={`font-mono text-[8.5px] tracking-[0.1em] uppercase px-1.5 py-0.5 rounded border flex-shrink-0 ${
                        isReservation
                          ? 'bg-state-reservedBg/30 border-state-reserved/40 text-state-reserved'
                          : 'bg-ai-bg/30 border-ai/40 text-ai'
                      }`}>
                        {isReservation ? 'Res' : 'Walk-in'}
                      </span>
                      {isPartial && (
                        <span className="font-mono text-[8.5px] tracking-[0.1em] uppercase px-1.5 py-0.5 rounded border flex-shrink-0 bg-amber-500/20 border-amber-500/40 text-amber-400">
                          Partial
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-ink-400">
                      Party of <span className="text-ink-50 font-medium tabular-nums">{p.size}</span>
                      {p.note && <span className="opacity-70"> · {p.note}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono text-sm text-ink-50 tabular-nums leading-none">{waitedMin}m</div>
                    <div className="font-mono text-[9px] text-ink-400 tracking-[0.1em] uppercase mt-0.5">waiting</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onSeatParty && onSeatParty(p.id); }}
                    className="px-3 py-2 rounded-lg bg-ai text-bg font-mono text-[10px] uppercase tracking-[0.08em] font-bold hover:opacity-90 transition-opacity flex-shrink-0"
                  >
                    Seat Party →
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteParty && onDeleteParty(p.id); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-lg bg-transparent border border-border text-ink-400 hover:text-state-seated hover:border-state-seated/50 flex items-center justify-center text-base leading-none flex-shrink-0"
                    aria-label="Remove from waitlist"
                    title="Remove from waitlist"
                  >×</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Horizontal party-size picker. A draggable ruler (mouse click-and-drag
// or swipe to scroll; the centered number is the selected value) plus a
// manual number-entry box below it. Scroll position is the source of
// truth: dragging, flicking, or typing all resolve to a centered integer
// emitted via onChange. Range is min..max.
function PartySizeWheel({ value = 2, onChange, min = 1, max = 50, label = 'guests' }) {
  const scrollRef = useRef(null);
  const seeded = useRef(false);
  const rafId = useRef(null);
  const drag = useRef({ active: false, startX: 0, startLeft: 0 });
  const clampInit = Math.min(max, Math.max(min, value || min));
  const [cw, setCw] = useState(0);
  const [active, setActive] = useState(clampInit - min);
  const [snap, setSnap] = useState('x mandatory');
  const [focused, setFocused] = useState(false);
  const [inputVal, setInputVal] = useState(String(clampInit));
  const ITEM = 56;
  const count = max - min + 1;

  // Measure width so the first/last numbers can reach the center.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const measure = () => setCw(el.clientWidth);
    measure();
    let ro;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(measure); ro.observe(el); }
    return () => { if (ro) ro.disconnect(); };
  }, []);

  // Seed scroll to the initial value once the width is known.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !cw || seeded.current) return;
    el.scrollLeft = ITEM * active;
    seeded.current = true;
  }, [cw, active]);

  // Mirror scroll-driven changes into the entry box (unless it's focused).
  useEffect(() => {
    if (!focused) setInputVal(String(min + active));
  }, [active, focused, min]);

  // Scroll position → selected index (nearest to center).
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      const idx = Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / ITEM)));
      if (idx !== active) { setActive(idx); if (onChange) onChange(min + idx); }
    });
  };

  // ── Mouse click-and-drag to scroll (touch keeps native scrolling) ──
  const onPointerDown = (e) => {
    if (e.pointerType === 'touch') return;
    const el = scrollRef.current;
    if (!el) return;
    drag.current = { active: true, startX: e.clientX, startLeft: el.scrollLeft };
    setSnap('none'); // free panning while dragging
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
  };
  const onPointerMove = (e) => {
    if (!drag.current.active) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = drag.current.startLeft - (e.clientX - drag.current.startX);
  };
  const endDrag = (e) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    const el = scrollRef.current;
    if (!el) return;
    try { el.releasePointerCapture(e.pointerId); } catch (_) {}
    const idx = Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / ITEM)));
    el.scrollTo({ left: ITEM * idx, behavior: 'smooth' }); // settle to center
    setSnap('x mandatory');
  };

  // Manual entry → scroll the ruler (which then drives active/onChange).
  const onType = (e) => {
    const raw = (e.target.value || '').replace(/[^0-9]/g, '');
    if (raw === '') { setInputVal(''); return; }
    const parsed = parseInt(raw, 10);
    const clamped = Math.min(max, Math.max(min, parsed || min));
    setInputVal(parsed > max ? String(max) : raw);
    const el = scrollRef.current;
    if (el) el.scrollLeft = ITEM * (clamped - min);
  };

  const spacer = Math.max(0, (cw - ITEM) / 2);

  return (
    <div className="select-none">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="mesa-wheel overflow-x-auto overflow-y-hidden cursor-grab active:cursor-grabbing"
        style={{
          scrollSnapType: snap,
          WebkitMaskImage: 'linear-gradient(to right, transparent, #000 16%, #000 84%, transparent)',
          maskImage: 'linear-gradient(to right, transparent, #000 16%, #000 84%, transparent)',
        }}
      >
        <div className="flex items-start" style={{ width: 'max-content' }}>
          <div aria-hidden="true" style={{ width: spacer, flexShrink: 0 }} />
          {Array.from({ length: count }, (_, i) => {
            const n = min + i;
            const isActive = i === active;
            const near = Math.abs(i - active) === 1;
            return (
              <div
                key={n}
                style={{ width: ITEM, scrollSnapAlign: 'center', flexShrink: 0 }}
                className="flex flex-col items-center pt-1 pointer-events-none"
              >
                <span className="flex items-center justify-center leading-none" style={{ height: 38 }}>
                  <span
                    className={`tabular-nums transition-all duration-150 ${isActive ? 'text-white font-bold' : near ? 'text-gray-400' : 'text-gray-600'}`}
                    style={{ fontSize: isActive ? 30 : near ? 19 : 16 }}
                  >
                    {n}
                  </span>
                </span>
                <span
                  className={`mt-1.5 rounded-full transition-all duration-150 ${isActive ? 'bg-white' : 'bg-gray-600'}`}
                  style={{ width: 2, height: isActive ? 26 : 16 }}
                />
              </div>
            );
          })}
          <div aria-hidden="true" style={{ width: spacer, flexShrink: 0 }} />
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 mt-3">
        <input
          type="text"
          inputMode="numeric"
          value={inputVal}
          onChange={onType}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); setInputVal(String(min + active)); }}
          aria-label="Party size"
          className="w-14 text-center px-2 py-1 rounded-md bg-black/30 border border-white/15 text-white text-sm outline-none focus:border-ai tabular-nums"
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-500">{label}</span>
      </div>
    </div>
  );
}

// Numeric time stepper — a typeable box flanked by up/down chevrons.
// Clicking a chevron nudges the value via the onUp/onDown handlers passed
// in (hours by 1, minutes by 5); the box stays editable for direct entry.
function TimeStepper({ value, onUp, onDown, onChange, onBlur, ariaLabel }) {
  const chev = 'h-6 rounded-md bg-gray-800/60 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 hover:border-gray-600 flex items-center justify-center transition-colors active:scale-95';
  return (
    <div className="flex flex-col items-stretch gap-1" style={{ width: 64 }}>
      <button type="button" onClick={onUp} aria-label={`Increase ${ariaLabel}`} className={chev}>
        <svg width="13" height="8" viewBox="0 0 13 8" fill="none"><path d="M1.5 6.5L6.5 1.5L11.5 6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        aria-label={ariaLabel}
        className="text-center bg-gray-800 border border-gray-700 rounded-lg py-2 text-white text-lg font-medium outline-none focus:border-ai tabular-nums"
      />
      <button type="button" onClick={onDown} aria-label={`Decrease ${ariaLabel}`} className={chev}>
        <svg width="13" height="8" viewBox="0 0 13 8" fill="none"><path d="M1.5 1.5L6.5 6.5L11.5 1.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </div>
  );
}

function ReservationModal({ onClose, onSubmit, initialDate, initialReservation = null }) {
  const isEdit = !!initialReservation;
  const _im = initialReservation ? parseResMinutes(initialReservation.time) : null;
  const [name, setName] = useState(initialReservation ? (initialReservation.name || "") : "");
  const [size, setSize] = useState(initialReservation ? (initialReservation.size || 2) : 2);
  const [date, setDate] = useState(initialReservation ? (initialReservation.date || initialDate || '') : (initialDate || ''));
  const [hour, setHour]     = useState(_im != null ? String((Math.floor(_im / 60) % 12) || 12) : "7");
  const [minute, setMinute] = useState(_im != null ? String(_im % 60).padStart(2, '0') : "30");
  const [ampm, setAmpm]     = useState(_im != null ? (Math.floor(_im / 60) < 12 ? "AM" : "PM") : "PM");
  // "—" is the storage placeholder for "no note" — the field starts
  // empty rather than showing a literal dash to edit around.
  const [noteDraft, setNoteDraft] = useState(
    initialReservation && initialReservation.note && initialReservation.note !== '—' ? initialReservation.note : ''
  );
  const [vip, setVip] = useState(initialReservation ? !!initialReservation.vip : false);

  const submit = (skipAssign = false) => {
    const formattedTime = `${hour}:${minute.padStart(2, '0')}${ampm.toLowerCase()}`;
    // tableId is omitted either way — the booking is always created
    // unassigned. skipAssign only tells Home whether to hand off to
    // point-and-click table selection afterwards, or to drop the guest
    // straight into the list to be seated later (the common host-stand
    // case: take the booking now, choose the table at seating time).
    onSubmit({ name, size: Number(size), date, time: formattedTime, note: noteDraft, vip, skipAssign });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      {/* Modal card — solid bg-gray-900 with no alpha modifiers, plus
          overflow-hidden so nothing ever bleeds past the rounded edge.
          Inputs all share the bg-gray-800 / border-gray-700 styling so
          the form reads as a coherent block. */}
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-display text-xl font-bold text-white mb-5">{isEdit ? 'Edit reservation' : 'New reservation'}</h3>

        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg mb-4 text-white outline-none focus:border-ai"
        />

        <div className="mb-4 bg-gray-800/40 border border-gray-700 rounded-lg pt-3 pb-2.5">
          <PartySizeWheel value={Number(size) || 2} onChange={setSize} min={1} max={50} label="guests" />
        </div>

        {/* Date input — anchors the reservation to a specific calendar
            day. The :webkit-calendar-picker-indicator inversion flips
            the default black calendar icon to white so it reads on the
            gray-800 background. Without this CSS, the icon disappears
            against the dark fill. */}
        <div className="mb-4">
          <input
            type="date"
            min={formatDateKey(new Date())}
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white outline-none focus:border-ai [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
          />
        </div>

        {/* Time row — hour & minute steppers (click ▲/▼ or type the
            number); minutes move in clean 5s. AM/PM is a tap toggle. */}
        <div className="mb-5 flex items-center justify-center gap-2">
          <TimeStepper
            value={hour}
            ariaLabel="Hour"
            onUp={() => setHour(h => String(((parseInt(h, 10) || 0) % 12) + 1))}
            onDown={() => setHour(h => { const n = (parseInt(h, 10) || 0) - 1; return String(n < 1 ? 12 : n); })}
            onChange={e => setHour(e.target.value.replace(/\D/g, '').slice(0, 2))}
            onBlur={() => setHour(h => { const n = parseInt(h, 10); return String(isNaN(n) ? 12 : Math.min(12, Math.max(1, n))); })}
          />
          <span className="text-2xl font-bold text-gray-500 select-none">:</span>
          <TimeStepper
            value={minute}
            ariaLabel="Minute"
            onUp={() => setMinute(m => String(((Math.floor((parseInt(m, 10) || 0) / 5) + 1) * 5) % 60).padStart(2, '0'))}
            onDown={() => setMinute(m => String(((Math.ceil((parseInt(m, 10) || 0) / 5) - 1) * 5 + 60) % 60).padStart(2, '0'))}
            onChange={e => setMinute(e.target.value.replace(/\D/g, '').slice(0, 2))}
            onBlur={() => setMinute(m => { const n = parseInt(m, 10); return String(isNaN(n) ? 0 : Math.min(59, Math.max(0, n))).padStart(2, '0'); })}
          />
          <button
            type="button"
            onClick={() => setAmpm(ampm === 'AM' ? 'PM' : 'AM')}
            aria-label="Toggle AM or PM"
            className="px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white font-mono text-sm font-bold hover:bg-gray-700 hover:border-gray-600 transition-colors"
          >
            {ampm}
          </button>
        </div>

        {/* VIP + notes — the "high-profile party of 10 executives" case:
            flag them, then capture who they are / course plan / allergies.
            VIP rides the existing tag system, so the guest list chips it
            and the AI seater weighs it when suggesting tables. */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <button
            type="button"
            onClick={() => setVip(v => !v)}
            aria-pressed={vip}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border font-mono text-[11px] uppercase tracking-[0.08em] font-bold transition-colors ${
              vip
                ? 'bg-amber-400/15 border-amber-400/60 text-amber-300'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500'
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill={vip ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 2l2.9 6.26L21.5 9.3l-4.75 4.36L17.8 20 12 16.6 6.2 20l1.05-6.34L2.5 9.3l6.6-1.04L12 2z"/></svg>
            {vip ? 'VIP party' : 'Mark as VIP'}
          </button>
          <span className="font-mono text-[9px] text-gray-500 uppercase tracking-[0.08em] text-right">Chips the guest list &amp; informs AI seating</span>
        </div>
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          rows={3}
          placeholder="Notes — who they are, course plan, allergies, special requests…"
          className="w-full mb-4 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-400/60 transition-colors resize-none"
        />
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white font-mono text-[11px] uppercase tracking-[0.1em] hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          {/* Take the booking without choosing a table — it lands in the
              guest list and gets seated later (drag it onto a table, or
              use the seating co-pilot). Hidden when editing, since an
              edit never runs the table hand-off anyway. */}
          {!isEdit && (
            <button
              onClick={() => submit(true)}
              disabled={!name.trim()}
              className="flex-1 py-2.5 rounded-lg bg-panel-card border border-border-hi text-ink-200 font-mono text-[11px] uppercase tracking-[0.06em] hover:text-ink-50 hover:border-ink-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Leave Unassigned
            </button>
          )}
          <button
            onClick={() => submit(false)}
            disabled={!name.trim()}
            className="flex-1 py-2.5 rounded-lg bg-ai text-bg font-mono text-[11px] uppercase font-bold disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isEdit ? 'Save changes' : 'Select Table on Map →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Generic confirm / cancel dialog. Used to gate destructive actions
// (deleting a reservation or removing a waitlist party) behind an explicit
// confirmation instead of a single stray click on the hover 'x'.
function ConfirmDialog({ title = 'Are you sure?', message, confirmLabel = 'Delete', cancelLabel = 'Cancel', onConfirm, onCancel }) {
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-[fadeIn_0.15s_ease-out]"
      onClick={onCancel}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-display text-lg font-bold text-white mb-2">{title}</h3>
        {message && <p className="text-sm text-gray-400 mb-6 leading-relaxed">{message}</p>}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white font-mono text-[11px] uppercase tracking-[0.1em] hover:bg-gray-700 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-lg bg-rose-600 text-white font-mono text-[11px] uppercase font-bold hover:bg-rose-500 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditPartyModal({ title = 'Edit party', sizeLabel = 'Party size', initialName = '', initialSize = 2, onClose, onSave }) {
  const [name, setName] = useState(initialName || '');
  const [size, setSize] = useState(initialSize || 1);
  const submit = () => {
    onSave({ name: name.trim() || initialName, size: Math.max(1, parseInt(size, 10) || 1) });
  };
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-display text-xl font-bold text-white mb-5">{title}</h3>
        <label className="block font-mono text-[9px] uppercase tracking-[0.14em] text-gray-400 mb-1.5">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg mb-4 text-white outline-none focus:border-ai"
        />
        <div className="mb-5 bg-gray-800/40 border border-gray-700 rounded-lg pt-3 pb-2.5">
          <PartySizeWheel value={Number(size) || 2} onChange={setSize} min={1} max={50} label={(sizeLabel || '').toLowerCase().includes('cover') ? 'covers' : 'guests'} />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white font-mono text-[11px] uppercase tracking-[0.1em] hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="flex-1 py-2.5 rounded-lg bg-ai text-bg font-mono text-[11px] uppercase font-bold disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

function WalkInModal({ onClose, onSubmit, onSendToWaitlist }) {
  // Starts at 4 — the median walk-in — so the host scrolls a shorter
  // distance to reach both smaller and larger parties.
  const [size, setSize] = useState(4);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ size: Number(size) || 1 });
    } finally {
      onClose();
    }
  };

  const sendWaitlist = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSendToWaitlist({ size: Number(size) || 1 });
    } finally {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-[fadeIn_0.18s_ease-out]" onClick={submitting ? undefined : onClose}>
      <div className="bg-panel border border-ai/40 rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-baseline justify-between mb-5">
          <h3 className="font-display text-xl font-bold text-ink-50 flex items-center gap-2">
            <span className="text-ai">⚡</span> Walk-In
          </h3>
          <button onClick={onClose} disabled={submitting} className="text-ink-400 hover:text-ink-50 text-2xl leading-none disabled:opacity-30">×</button>
        </div>

        <div className="mb-5 bg-panel-card border border-border rounded-lg pt-3 pb-2.5">
          <PartySizeWheel value={Number(size) || 2} onChange={setSize} min={1} max={50} label="guests" />
        </div>

        <div className="text-[11px] text-ink-400 italic mb-5 leading-relaxed">
          Seat now triggers the AI co-pilot. Send to Waitlist parks the party until a table opens.
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} disabled={submitting}
            className="flex-1 py-2.5 rounded-lg bg-panel-card border border-border text-ink-50 font-mono text-[11px] uppercase tracking-[0.1em] hover:border-border-hi transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            Cancel
          </button>
          <button onClick={sendWaitlist} disabled={submitting}
            className="flex-1 py-2.5 rounded-lg bg-transparent border border-ai/50 text-ai font-mono text-[11px] uppercase tracking-[0.1em] font-bold hover:bg-ai/10 hover:border-ai disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            Send to Waitlist
          </button>
          <button onClick={submit} disabled={submitting}
            className="flex-1 py-2.5 rounded-lg bg-ai text-bg font-mono text-[11px] uppercase tracking-[0.1em] font-bold hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity">
            {submitting ? '◆ Finding seat…' : 'Seat now →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TABLE DETAILS PANEL ─────────────────────────────────────────────
// Right-side inspector that opens when the host clicks a table (and is
// neither seating a waitlist party nor in assign mode). Shows the
// vitals (server, party, elapsed seating time) and exposes two state
// transitions: Mark for Bussing (seated/dining → bussing) and Clear
// (anything occupied → available, also closes the panel).
//
// The component is deliberately stateless: all state and handlers come
// from Home. It re-renders when `table` mutates (status change, etc.)
// or when `now` ticks forward (live elapsed-time read-out).

// ─── Service log UI ─────────────────────────────────────────────────
// Shared row bits for the right rail and the Service tab. Live state is
// per-service-day data straight from /api/service-log — the same rows
// the AI predictor will train on.
const SERVICE_EVENT_META = {
  finished:  { label: 'Finished',    cls: 'text-ink-300 bg-panel-card border-border-hi' },
  no_show:   { label: 'No-show',     cls: 'text-rose-300 bg-rose-500/10 border-rose-500/40' },
  cancelled: { label: 'Cancelled',   cls: 'text-amber-300 bg-amber-500/10 border-amber-500/40' },
  walked:    { label: 'Walked away', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/40' },
};

function serviceDuration(now, ms) {
  if (ms == null) return '—';
  const m = Math.max(0, Math.floor((now - ms) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function serviceTableLabel(tableId) {
  if (tableId == null) return null;
  return String(tableId).split('_').map(x => `T${x}`).join(' + ');
}

function ServiceSeatedRow({ p, now, onOpen }) {
  return (
    <div
      onClick={onOpen && p.tableId != null ? () => onOpen(p) : undefined}
      className={`flex items-center gap-2 px-3 py-2 border-b border-border/60 ${onOpen && p.tableId != null ? 'cursor-pointer hover:bg-panel-card transition-colors' : ''}`}
    >
      <span className="font-mono text-[11px] tabular-nums text-state-avail w-12 flex-shrink-0">{serviceDuration(now, p.seatedAt)}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-ink-50 truncate">{p.name}</div>
        <div className="font-mono text-[10px] text-ink-400">
          {p.size} covers{p.tableId != null ? ` · ${serviceTableLabel(p.tableId)}` : ''} · {p.origin === 'walk-in' ? 'Walk-in' : 'Reservation'}
        </div>
      </div>
    </div>
  );
}

function ServiceHistoryRow({ h }) {
  const meta = SERVICE_EVENT_META[h.event] || SERVICE_EVENT_META.finished;
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
      <span className="font-mono text-[11px] tabular-nums text-ink-400 w-12 flex-shrink-0">{h.time}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-ink-200 truncate">{h.name}</div>
        <div className="font-mono text-[10px] text-ink-400">
          {h.size} covers
          {h.turnMinutes != null ? ` · ${h.turnMinutes}m turn` : ''}
          {h.waitedMinutes != null ? ` · waited ${h.waitedMinutes}m` : ''}
        </div>
      </div>
      <span className={`font-mono text-[9px] uppercase tracking-[0.08em] border rounded-md px-1.5 py-0.5 flex-shrink-0 ${meta.cls}`}>{meta.label}</span>
    </div>
  );
}

// Always-visible right rail on the floor: who's seated, at a glance,
// with the day's history scrolling beneath. Deliberately on the RIGHT
// and never collapsed — the concept (a service journal) is industry-
// standard; this expression is MesaOS's own.
// Seating assistant, docked where the Service Log lives. The old version
// was a fixed bottom-center card that covered a large slice of the floor
// exactly when the host needed to SEE the floor to pick a table. While a
// seat/assign flow is live, this temporarily replaces the rail; the log
// returns the moment the flow ends.
function SeatingAssistRail({ aiThinking, selectedPartyId, reassignReservationId, reservations = [], waitlist = [], tables = [], aiSuggestedIds = [], onMerge, onCancel }) {
  const activeId = selectedPartyId || reassignReservationId;
  const r = reservations.find(x => x.id === activeId) || waitlist.find(x => x.id === activeId);
  const partyLabel = r ? r.name : 'this party';
  const sizeLabel = r && r.size ? `${r.size} ${r.size === 1 ? 'guest' : 'guests'}` : '';
  const suggestedNames = (aiSuggestedIds || [])
    .map(id => { const t = tables.find(x => x.id === id); return t ? t.name : null; })
    .filter(Boolean);
  return (
    <aside className="w-[248px] flex-shrink-0 border-l border-border-hi bg-panel flex flex-col overflow-hidden">
      <div className={`px-3 py-2.5 border-b flex items-center gap-2 flex-shrink-0 ${aiThinking ? 'border-ai/40' : 'border-state-avail/40'}`}>
        {aiThinking ? (
          <svg className="animate-spin text-ai flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
        ) : (
          <svg className="text-state-avail flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-4.35-7-10a7 7 0 0 1 14 0c0 5.65-7 10-7 10Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="2" /></svg>
        )}
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">Seating assistant</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-4">
        <div>
          <div className="font-display text-base font-bold text-ink-50 leading-tight">{partyLabel}</div>
          {sizeLabel && <div className="font-mono text-[11px] text-ink-400 mt-0.5">{sizeLabel}</div>}
        </div>
        <div className="text-[12px] text-ink-400 leading-relaxed">
          {aiThinking ? (
            <>Analyzing the floor to find the best table…</>
          ) : (
            <>Tap any open table on the floor to {selectedPartyId ? 'seat' : 'assign'} this party.</>
          )}
        </div>
        {!aiThinking && suggestedNames.length > 0 && (
          <div className="rounded-lg border border-state-avail/40 bg-state-avail/10 px-3 py-2.5">
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-state-avail mb-1">AI suggests</div>
            <div className="text-sm font-bold text-state-avail">{suggestedNames.join(' + ')}</div>
            <div className="text-[10px] text-ink-400 mt-0.5">glowing on the floor</div>
          </div>
        )}
      </div>
      <div className="px-3 py-3 border-t border-border-hi flex flex-col gap-2 flex-shrink-0">
        <button
          onClick={onMerge}
          disabled={aiThinking}
          title="Combine adjacent tables — the party is placed there automatically when the merge is confirmed"
          className="w-full px-3 py-2 rounded-lg bg-transparent border border-ai/50 text-ai text-[11px] font-bold uppercase tracking-wider hover:bg-ai/10 hover:border-ai disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {selectedPartyId ? 'Merge table & seat' : 'Merge table & assign'}
        </button>
        <button
          onClick={onCancel}
          disabled={aiThinking}
          className="w-full px-3 py-2 rounded-lg bg-panel-card border border-border text-ink-50 text-[11px] font-bold uppercase tracking-wider hover:bg-panel-up disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Cancel
        </button>
      </div>
    </aside>
  );
}

function ServiceRail({ serviceLog, now, onOpenTable, dateLabel = null, onClose = null, overlay = false }) {
  if (!serviceLog) return null;
  const { covers, seated, history } = serviceLog;
  return (
    <aside className={`${overlay ? 'absolute inset-y-0 right-0 z-30 w-[min(320px,88vw)] shadow-2xl animate-[mesa-rail-in_0.2s_ease-out]' : 'w-[248px] flex-shrink-0'} border-l border-border-hi bg-panel flex flex-col overflow-hidden`}>
      <div className="px-3 py-2.5 border-b border-border-hi flex items-baseline justify-between flex-shrink-0">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">Service log</span>
        <div className="flex items-center gap-2"><span className="font-mono text-[11px] text-ink-50 tabular-nums">{covers.total} <span className="text-ink-400">covers</span></span>{onClose && <button onClick={onClose} className="w-11 h-11 -mr-2 flex items-center justify-center text-xl text-ink-400 hover:text-ink-50" aria-label="Close service log">×</button>}</div>
      </div>
      {dateLabel && (
        <div className="px-3 py-1.5 border-b border-border-hi font-mono text-[9px] uppercase tracking-[0.1em] text-ai flex-shrink-0">{dateLabel}</div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-3 pt-2.5 pb-1 font-mono text-[9px] uppercase tracking-[0.1em] text-state-avail">Now seated · {seated.length}</div>
        {seated.length === 0 && <div className="px-3 py-2 text-[12px] text-ink-400 italic">No parties seated</div>}
        {seated.map(p => <ServiceSeatedRow key={p.id} p={p} now={now} onOpen={onOpenTable} />)}
        <div className="px-3 pt-3 pb-1 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-400 border-t border-border-hi mt-1">History · {history.length}</div>
        {history.length === 0 && <div className="px-3 py-2 text-[12px] text-ink-400 italic">Nothing yet tonight</div>}
        {history.map(h => <ServiceHistoryRow key={`${h.event}-${h.id}`} h={h} />)}
      </div>
    </aside>
  );
}

// The Service tab: the full day journal.
function ServiceView({ serviceLog, now, onRefresh, onOpenTable, dateLabel = null }) {
  if (!serviceLog) {
    return <div className="flex-1 flex items-center justify-center text-ink-400 text-sm">Loading service log…</div>;
  }
  const { covers, seated, history } = serviceLog;
  const stats = [
    { label: 'Total covers', value: covers.total },
    { label: 'Reservations', value: covers.reservations },
    { label: 'Walk-ins', value: covers.walkIns },
    { label: 'Seated now', value: covers.seatedNow },
    { label: 'Avg turn', value: covers.avgTurn != null ? `${covers.avgTurn}m` : '—' },
  ];
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-8 py-6">
      <div className="flex items-center justify-between mb-5 flex-shrink-0">
        <div>
          <h2 className="text-ink-50 text-lg font-semibold">Service log</h2>
          <p className="font-mono text-[11px] text-ink-400 mt-0.5">{dateLabel ? `${dateLabel} — ` : "Today's "}covers, seatings, and outcomes — the same rows the predictor trains on.</p>
        </div>
        <button onClick={onRefresh} className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-300 border border-border-hi rounded-lg px-3 py-1.5 hover:text-ink-50 hover:border-ink-400 transition-colors">Refresh</button>
      </div>
      <div className="grid grid-cols-5 gap-3 mb-6 flex-shrink-0">
        {stats.map(s => (
          <div key={s.label} className="bg-panel-card border border-border-hi rounded-xl px-4 py-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-400">{s.label}</div>
            <div className="text-ink-50 text-xl font-semibold tabular-nums mt-1">{s.value}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        <div className="bg-panel border border-border-hi rounded-xl overflow-hidden flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-border-hi font-mono text-[10px] uppercase tracking-[0.1em] text-state-avail flex-shrink-0">Now seated · {seated.length} parties</div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {seated.length === 0 && <div className="px-3 py-3 text-[13px] text-ink-400 italic">No parties seated</div>}
            {seated.map(p => <ServiceSeatedRow key={p.id} p={p} now={now} onOpen={onOpenTable} />)}
          </div>
        </div>
        <div className="bg-panel border border-border-hi rounded-xl overflow-hidden flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-border-hi font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400 flex-shrink-0">Service history · {history.length} parties</div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {history.length === 0 && <div className="px-3 py-3 text-[13px] text-ink-400 italic">Nothing yet tonight</div>}
            {history.map(h => <ServiceHistoryRow key={`${h.event}-${h.id}`} h={h} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function TableDetailsPanel({ table, servers, now, reservations = [], shiftWindow = null, viewDateStr = null, onClose, onMarkBussing, onClearTable, onOpenReservation, onEditParty, onMoveParty, onToggleAiExcluded, onToggleOnlineBlocked, setMergeMode, setMergeSelection, unmergeTable, overlay = false }) {
  if (!table) return null;

  const assignedServer = servers.find(s => s.id === table.assignedServerId);
  const serverName = assignedServer ? assignedServer.name : "Unassigned";

  const isOccupied = table.status === "seated" || table.status === "dining";
  const isBussing  = table.status === "bussing";
  const isReserved = table.status === "reserved";

  // Upcoming reservations for THIS table. String-coerced comparison
  // because table ids may be numbers but reservation tableIds can
  // arrive as either type (depends on whether they came from the
  // seed, the modal's number select, or the AI's response). Coercion
  // protects against type drift in either direction.
  // Upcoming reservations attached to this table. Handles both
  // single-table ids (numeric or string, exact match after String()
  // coercion) and merged "i_j" ids (split on underscore, match if
  // any base id equals this table's id). A reservation attached to
  // a merge surfaces on EVERY base table's Schedule section, so the
  // host can see the booking from any of the merged tiles. String()
  // coercion on both sides protects against type drift between the
  // seed (numbers), the modal's number select, and the AI's response.
  const tableReservations = reservations.filter(r => {
    if (!r.tableId) return false;
    const assignedIds = String(r.tableId).split('_');
    if (!assignedIds.includes(String(table.id))) return false;
    // Scope to the viewed day's SERVICE SHIFT, not every reservation ever
    // attached to this table. With hours set, a booking counts if its
    // wall-clock time falls inside [open, close] of the viewed day (close
    // may extend past midnight). Without hours, fall back to same-day.
    if (shiftWindow) {
      // parseResMinutes is module-level (parseResTime is a FloorMap-local
      // closure, not in scope here).
      const rMin = parseResMinutes(r.time);
      if (rMin == null || !Number.isFinite(rMin)) return false;
      const [y, m, d] = (r.date || viewDateStr || '').split('-').map(Number);
      if (!y) return true;
      const rMs = new Date(y, m - 1, d, Math.floor(rMin / 60), rMin % 60).getTime();
      const rMsOvernight = rMs + 1440 * 60000; // booking after midnight belongs to prior open-day
      return (rMs >= shiftWindow.start && rMs < shiftWindow.end) ||
             (shiftWindow.overnight && rMsOvernight >= shiftWindow.start && rMsOvernight < shiftWindow.end);
    }
    return (r.date || viewDateStr) === viewDateStr;
  });

  // Party is shown for seated/dining/bussing (the party data is still
  // attached during bussing — useful context for the busser). On
  // available/reserved tables there's no current party to display.
  const hasPartyData = table.party && table.partySize;
  const partyValue = hasPartyData ? `${table.party} · ${table.partySize}` : "Empty";

  // Elapsed minutes uses the live `now` from Home's interval so the
  // value increments while the panel stays open. Missing startedAt
  // (available/reserved tables) reads as em-dash, not "0 min".
  const elapsedValue = table.startedAt
    ? `${Math.floor((now - table.startedAt) / 60_000)} min`
    : "—";

  // Status label + color. Status colors use the semantic design tokens
  // (text-state-*) so the panel header matches every other status hint
  // across the dashboard. Bussing has no semantic token of its own —
  // amber-400 picks up the floor map's amber-700 tile.
  const statusLabel = isOccupied
    ? (table.status === "seated" ? "Just seated" : "Dining")
    : isBussing ? "Needs bussing"
    : isReserved ? "Reserved"
    : "Available";
  const statusColor = table.status === "seated" ? "text-state-seated"
    : table.status === "dining" ? "text-state-dining"
    : isBussing ? "text-amber-400"
    : isReserved ? "text-state-reserved"
    : "text-state-avail";

  const canMarkBussing = isOccupied;        // Only meaningful from seated/dining
  const canClear       = isOccupied || isBussing;  // Reserved isn't "cleared" — use a different flow for that

  return (
    <aside className={`${overlay ? 'fixed inset-y-0 right-0 z-40 w-[min(320px,88vw)] shadow-2xl animate-[mesa-rail-in_0.2s_ease-out]' : 'w-80 flex-shrink-0'} bg-panel border-l border-border p-4 flex flex-col overflow-y-auto`}>
      {/* Header — title + mini status line + close */}
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold text-ink-50 truncate leading-tight">{table.name}</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono text-[10px] text-ink-400 tabular-nums">{table.capacity}-top</span>
            <span className="text-ink-400/50">·</span>
            <span className={`font-mono text-[10px] uppercase tracking-[0.1em] font-bold ${statusColor}`}>
              {statusLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-2 -mt-0.5">
          {isOccupied && onEditParty && (
            <button
              onClick={() => onEditParty(table)}
              aria-label="Edit party and covers"
              title="Edit party and covers"
              className="text-ink-400 hover:text-ai text-base leading-none px-1 transition-colors"
            >
              ✎
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close table details"
            className="text-ink-400 hover:text-ink-50 text-xl leading-none px-1"
          >
            ×
          </button>
        </div>
      </div>

      {/* Vitals — tight key/value rows, no per-row dividers */}
      <div className="space-y-1.5">
        <VitalRow label="Waiter" value={serverName}   muted={!assignedServer} />
        <VitalRow label="Party"  value={partyValue}   muted={!hasPartyData} />
        <VitalRow label="Seated" value={elapsedValue} muted={!table.startedAt} />
      </div>

      {/* Schedule — upcoming reservations attached to this table. Slips
          between vitals and actions without disturbing either. Hidden
          state never collapses to zero height: even the empty case
          renders the divider + header + a quiet italic placeholder so
          the panel layout stays predictable while a host scans tables. */}
      <div className="border-t border-gray-800 my-4"></div>
      <h3 className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-400 font-bold mb-2">Schedule</h3>
      {tableReservations.length === 0 ? (
        <div className="text-xs text-ink-400/60 italic">No upcoming reservations</div>
      ) : (
        <div className="space-y-2">
          {tableReservations.map(r => (
            <div
              key={r.id}
              onClick={() => onOpenReservation && onOpenReservation(r.id)}
              className="flex items-center gap-3 bg-panel-card border border-border rounded px-2.5 py-1.5 cursor-pointer hover:bg-panel-up transition-colors"
            >
              <span className="font-mono text-xs font-semibold text-state-reserved w-12 flex-shrink-0">{r.time}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-ink-50 truncate">{r.name}</div>
                <div className="text-[10px] text-ink-400">Party of {r.size}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions — sit naturally beneath vitals with a modest gap */}
      <div className="mt-6 space-y-1.5">
        {isOccupied && onMoveParty && (
          <button onClick={() => onMoveParty(table)} className="w-full px-3 py-1.5 rounded-lg bg-transparent border border-ai/50 text-ai text-sm font-medium hover:bg-ai/10 transition-colors">Move party</button>
        )}
        {isOccupied && onEditParty && (
          <button
            onClick={() => onEditParty(table)}
            className="w-full px-3 py-1.5 rounded-lg bg-transparent border border-border-hi text-ink-50 text-sm font-medium hover:bg-panel-up transition-colors flex items-center justify-center gap-1.5"
          >
            <span className="text-[13px] leading-none">✎</span> Edit party / covers
          </button>
        )}
        {onToggleAiExcluded && (
          <button onClick={() => onToggleAiExcluded(table.id)} className={`w-full px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${table.manualOnly ? 'bg-rose-500/10 border-rose-400/60 text-rose-300' : 'bg-transparent border-border-hi text-ink-50 hover:bg-panel-up'}`}>AI⊘ Exclude from AI</button>
        )}
        {onToggleOnlineBlocked && (
          <button onClick={() => onToggleOnlineBlocked(table.id)} className={`w-full px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${table.onlineExcluded ? 'bg-amber-500/10 border-amber-400/60 text-amber-200' : 'bg-transparent border-border-hi text-ink-50 hover:bg-panel-up'}`}>🔒 Block Online Reservations</button>
        )}
        <button
          onClick={onMarkBussing}
          disabled={!canMarkBussing}
          className="w-full px-3 py-1.5 rounded-lg bg-amber-700/80 border border-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-panel-card disabled:border-border disabled:text-ink-400/50 disabled:cursor-not-allowed transition-colors"
        >
          Mark for bussing
        </button>
        <button
          onClick={onClearTable}
          disabled={!canClear}
          className="w-full px-3 py-1.5 rounded-lg bg-panel-card border border-border-hi text-ink-50 text-sm font-medium hover:bg-panel-up disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Clear table
        </button>

        {/* Merge / Un-merge — mutually exclusive per table state.
            Merged tables (groupId != null) can be un-merged ONLY while
            no party is seated — a seated/dining merge stays fused until
            the table is marked for bussing or cleared, so the physical
            layout can't split under an active party. Available
            ungrouped tables can seed a new merge selection. */}
        {table.groupId != null && unmergeTable && (
          (table.status === 'seated' || table.status === 'dining') ? (
            <div className="w-full px-3 py-2 rounded-lg bg-transparent border border-border text-ink-400 text-xs text-center leading-snug">
              Merged tables stay together while a party is seated — mark for bussing or clear the table to un-merge.
            </div>
          ) : (
            <button
              onClick={() => unmergeTable(table.groupId)}
              className="w-full px-3 py-1.5 rounded-lg bg-transparent border border-amber-500/50 text-amber-400 text-sm font-medium hover:bg-amber-500/10 hover:border-amber-500 transition-colors"
            >
              Un-merge tables
            </button>
          )
        )}
        {!table.groupId && setMergeMode && setMergeSelection && (
          <button
            onClick={() => {
              // Seed the merge selection with THIS table so the host
              // can pick the second-plus tables on the floor. Closing
              // the panel surfaces the floating action bar without
              // visual competition.
              setMergeSelection([table.id]);
              setMergeMode(true);
              onClose && onClose();
            }}
            className="w-full px-3 py-1.5 rounded-lg bg-transparent border border-ai/40 text-ai text-sm font-medium hover:bg-ai/10 hover:border-ai transition-colors"
          >
            Link / Merge tables
          </button>
        )}
      </div>
    </aside>
  );
}

function VitalRow({ label, value, muted = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-ink-400 flex-shrink-0">
        {label}
      </span>
      <span className={`text-sm truncate ${muted ? "text-ink-400 italic" : "text-ink-50"}`}>
        {value}
      </span>
    </div>
  );
}

// ─── RESERVATION DETAILS SIDEBAR ─────────────────────────────────────
// Standalone right-side panel for viewing an existing reservation.
// Visually IDENTICAL to TableDetailsPanel — same w-80 aside, same
// padding, same border, same header layout, same VitalRow component.
// Render-level mutual exclusion in Home guarantees this never appears
// alongside TableDetailsPanel; the two share the same right-edge slot.
function ReservationDetailsSidebar({
  reservation, isOnWaitlist = false, now = Date.now(),
  tables, aiSuggestedIds, selectedPartyId,
  onClose, onMarkPartial, onSendToWaitlist, onSeatNow, onUpdateTable, onRequestEdit, onRequestEditParty,
  reassignReservationId = null, setReassignReservationId,
}) {
  if (!reservation) return null;

  // Edit affordance routing: waitlist parties (walk-ins or reservations
  // sent to the waitlist) edit name + size via the lightweight
  // EditPartyModal; scheduled reservations edit the full booking via the
  // reservation modal. Header pencil + footer button share this decision.
  const canEditParty = isOnWaitlist ? !!onRequestEditParty : !!onRequestEdit;
  const editLabel = isOnWaitlist ? 'Edit party' : 'Edit reservation';
  const handleEdit = () => {
    if (isOnWaitlist) { if (onRequestEditParty) onRequestEditParty(reservation); }
    else { if (onRequestEdit) onRequestEdit(reservation); }
  };

  // Walk-ins skip the partial/arrived/confirmed flow — they're
  // physically in the building already, so the only meaningful state
  // is "Waiting". Reservations keep the original lifecycle.
  const isWalkIn   = reservation.type === 'walk-in';
  const isPartial  = reservation.status === 'partially_arrived';
  const isArrived  = reservation.status === 'arrived';
  const statusLabel = isWalkIn  ? 'Waiting'
    : isArrived ? 'Arrived'
    : isPartial ? 'Partially arrived'
    : 'Confirmed';
  const statusColor = isWalkIn  ? 'text-ai'
    : isArrived ? 'text-state-avail'
    : isPartial ? 'text-amber-400'
    : 'text-state-reserved';

  // Time line: scheduled bookings have r.time ("7:30p"). Waitlist
  // items don't — they have addedAt instead. Synthesize a "Waitlist ·
  // Nm" label there so the header stays informative either way.
  const timeLabel = isOnWaitlist
    ? `Waitlist · ${Math.floor((now - reservation.addedAt) / 60_000)}m`
    : reservation.time;

  // Only honor the AI suggestion if it's actively scoped to THIS
  // reservation — i.e. the host has already triggered Seat Now from
  // this panel (selectedPartyId === reservation.id). Otherwise the
  // suggestion belongs to some other party and we don't surface it.
  const aiSuggestedTable = (selectedPartyId === reservation.id && aiSuggestedIds && aiSuggestedIds.length > 0)
    ? tables.find(t => t.id === aiSuggestedIds[0])
    : null;
  const aiValue = aiSuggestedTable
    ? aiSuggestedTable.name
    : (selectedPartyId === reservation.id ? 'Finding…' : '—');

  return (
    <aside data-reservation-panel className="relative w-80 bg-panel border-l border-border p-4 flex flex-col flex-shrink-0 overflow-y-auto">
      {/* Header — party name + size · time + status + close. Uses the
          exact same flex/typography classes as TableDetailsPanel. */}
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-bold text-ink-50 truncate leading-tight">{reservation.name}</h2>
            {reservation.vip && (
              <span className="font-mono text-[8.5px] tracking-[0.1em] uppercase px-1.5 py-0.5 rounded border bg-amber-400/15 border-amber-400/50 text-amber-300 flex-shrink-0 flex items-center gap-1">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.26L21.5 9.3l-4.75 4.36L17.8 20 12 16.6 6.2 20l1.05-6.34L2.5 9.3l6.6-1.04L12 2z"/></svg>
                VIP
              </span>
            )}
            {isPartial && (
              <span className="font-mono text-[8.5px] tracking-[0.1em] uppercase px-1.5 py-0.5 rounded border bg-amber-500/20 border-amber-500/40 text-amber-400 flex-shrink-0">
                Partial
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono text-[10px] text-ink-400 tabular-nums">
              Party of {reservation.size}
            </span>
            <span className="text-ink-400/50">·</span>
            <span className="font-mono text-[10px] text-ink-400 tabular-nums">{timeLabel}</span>
            <span className="text-ink-400/50">·</span>
            <span className={`font-mono text-[10px] uppercase tracking-[0.1em] font-bold ${statusColor}`}>
              {statusLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-2 -mt-0.5">
          {canEditParty && (
            <button
              onClick={handleEdit}
              aria-label={editLabel}
              title={editLabel}
              className="text-ink-400 hover:text-ai text-base leading-none px-1 transition-colors"
            >
              ✎
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close reservation details"
            className="text-ink-400 hover:text-ink-50 text-xl leading-none px-1"
          >
            ×
          </button>
        </div>
      </div>

      {/* Vitals — Assigned Table (static display + reassign controls)
          + AI table suggestion. The point-and-click controls live in
          a dedicated row below the value so the layout doesn't shift
          when reassign mode flips. */}
      <div className="space-y-1.5">
        {/* Notes — the operational brief (who they are, course plan).
            Only rendered when a real note exists ("—" is the placeholder). */}
        {reservation.note && reservation.note !== '—' && (
          <div className="rounded-lg border border-border bg-panel-card px-3 py-2.5">
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-400 mb-1">Notes</div>
            <div className="text-[12px] text-ink-200 leading-relaxed whitespace-pre-wrap">{reservation.note}</div>
          </div>
        )}
        {!isWalkIn && onUpdateTable && (() => {
          const currentTable = reservation.tableId != null
            ? tables.find(t => String(t.id) === String(reservation.tableId))
            : null;
          const isReassigning = reassignReservationId === reservation.id;
          const isUnassigned  = reservation.tableId == null;
          return (
            <>
              <VitalRow
                label="Assigned table"
                value={currentTable ? `${currentTable.name} (${currentTable.capacity}-top)` : 'Unassigned'}
                muted={!currentTable}
              />
              <div className="flex items-center gap-1.5 mt-1">
                <button
                  onClick={(e) => {
                    // stopPropagation guards against the document-level
                    // reservation-panel-dismiss listener (set up in Home
                    // when selectedReservationId is truthy) — without
                    // this, the same click that enters reassign mode
                    // would bubble up and immediately cancel it.
                    e.stopPropagation();
                    if (setReassignReservationId) {
                      setReassignReservationId(isReassigning ? null : reservation.id);
                    }
                  }}
                  className={`flex-1 px-2 py-1 rounded font-mono text-[10px] uppercase tracking-[0.08em] font-bold border transition-colors ${
                    isReassigning
                      ? "bg-ai-bg/40 text-ai border-ai/50 animate-pulse"
                      : "bg-transparent text-ink-50 border-border-hi hover:bg-panel-up"
                  }`}
                >
                  {isReassigning ? 'Select table on map...' : 'Change table'}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateTable(reservation.id, 'unassigned');
                  }}
                  disabled={isUnassigned}
                  className="flex-1 px-2 py-1 rounded font-mono text-[10px] uppercase tracking-[0.08em] font-bold border bg-transparent text-ink-400 border-border hover:text-ink-50 hover:border-border-hi disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Unassign
                </button>
              </div>
            </>
          );
        })()}
        <VitalRow label="AI suggest" value={aiValue} muted={!aiSuggestedTable} />
      </div>

      {/* Actions */}
      <div className="mt-6 space-y-1.5">
        {!isWalkIn && (
          <>
            <button
              onClick={onMarkPartial}
              disabled={isPartial}
              className="w-full px-3 py-1.5 rounded-lg bg-amber-700/80 border border-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-panel-card disabled:border-border disabled:text-ink-400/50 disabled:cursor-not-allowed transition-colors"
            >
              {isPartial ? 'Marked partial' : 'Mark partially arrived'}
            </button>
            {onSendToWaitlist && (
              <button
                onClick={onSendToWaitlist}
                className="w-full px-3 py-1.5 rounded-lg bg-panel-card border border-border-hi text-ink-50 text-sm font-medium hover:bg-panel-up transition-colors"
              >
                Send to waitlist
              </button>
            )}
          </>
        )}
        <button
          onClick={onSeatNow}
          className="w-full px-3 py-1.5 rounded-lg bg-ai text-bg text-sm font-bold hover:opacity-90 transition-opacity"
        >
          Seat now →
        </button>
      </div>
      {canEditParty && (
        <button
          onClick={handleEdit}
          className="mt-2 w-full px-3 py-1.5 rounded-lg bg-transparent border border-border text-ink-400 text-sm font-medium hover:text-ink-50 hover:border-border-hi hover:bg-panel-up transition-colors flex items-center justify-center gap-1.5"
        >
          <span className="text-[13px] leading-none">✎</span> {editLabel}
        </button>
      )}
    </aside>
  );
}

// ─── ROOT PAGE ───────────────────────────────────────────────────────

export default function Home({ hostMode = false } = {}) {
  const [tables,           setTables]           = useState(INITIAL_TABLES);
  // Start EMPTY: the database is the source of truth and hydration
  // fills these on mount. The hardcoded INITIAL_* seeds are loaded only
  // if hydration fails (offline / no DB) — previously they rendered for
  // the first frames and then visibly vanished when the real rows
  // arrived, which read as a bug.
  const [waitlist,         setWaitlist]         = useState([]);
  const [reservations,     setReservations]     = useState([]);
  const [servers,          setServers]          = useState([
    { id: 's1', name: 'Sarah',  onShift: true,  roles: ['waiter'], color: null },
    { id: 's2', name: 'Mike',   onShift: true,  roles: ['waiter'], color: null },
    { id: 's3', name: 'Devon',  onShift: false, roles: ['waiter'], color: null },
    { id: 's4', name: 'Priya',  onShift: false, roles: ['waiter'], color: null },
  ]);
  const [roles, setRoles] = useState(['waiter', 'bartender']);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const setPref = useCallback((key, value) => setPrefs(p => ({ ...p, [key]: value })), []);
  // Autosave gate: settings only PUT after hydration has applied (or
  // conclusively failed) — otherwise the autosave effect would race the
  // GET and overwrite stored settings with defaults on every load.
  const settingsReady = useRef(false);
  // Same gate for the live floor-state snapshot: don't PATCH until
  // hydration has applied (or conclusively failed).
  const liveReady = useRef(false);
  // Gates the first paint: until the DB layout/staff/settings land, show
  // a loader rather than the built-in default floor — otherwise the
  // defaults flash for a beat before hydration swaps them out.
  const [hydrated, setHydrated] = useState(false);
  const [restaurantHours, setRestaurantHours] = useState({ open: null, close: null });
  const [activeTab,        setActiveTab]        = useState("floor");
  const [selectedPartyId,  setSelectedPartyId]  = useState(null);
  const [selectedTableId,  setSelectedTableId]  = useState(null);
  const [selectedReservationId, setSelectedReservationId] = useState(null);
  // Calendar view state. `calendarMonth` is a Date pinned to the 1st
  // of whichever month is being viewed. `selectedCalendarDate` is a
  // YYYY-MM-DD string (lexicographically comparable, timezone-immune
  // unlike a Date object). Both default to "now" on mount.
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  // Entering the Calendar tab always lands on TODAY. Previously the
  // selected day (and month) persisted, so after time-travelling to a
  // future date and returning to Today, the calendar still opened on the
  // old day — confusing, because the rest of the app had already snapped
  // back to the current day. Reset on tab entry keeps the two in sync.
  const prevTabRef = useRef(null);
  useEffect(() => {
    if (activeTab === 'calendar' && prevTabRef.current !== 'calendar') {
      const now = new Date();
      setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
      setSelectedCalendarDate(formatDateKey(now));
    }
    prevTabRef.current = activeTab;
  }, [activeTab]);

  // ─── Multi-floor state ───────────────────────────────────────────
  // Floors are the structural grouping above tables. Every table has
  // a floorId pointing to one floor. isManualOnly toggles whether the
  // AI Seating Agent + AI Server Assigner see that floor's tables at
  // all — useful for VIP rooms, private spaces, or any zone where the
  // host wants total manual control with no co-pilot interference.
  // Default seed: one floor "Main Floor" matching the f1 ids stamped
  // on the existing INITIAL_TABLES entries.
  const [floors, setFloors] = useState([{ id: 'f1', name: 'Main Floor', isManualOnly: false }]);
  const [activeFloorId, setActiveFloorId] = useState('f1');
  // Inline add-floor flow — replaces the old window.prompt() approach.
  // isAddingFloor flips the "+ Add Floor" button into an input field;
  // Enter commits and exits, Escape cancels and exits.
  const [isAddingFloor, setIsAddingFloor] = useState(false);
  const [newFloorName, setNewFloorName] = useState("");
  // ─── Edit-mode undo stack ──────────────────────────────────────────
  // Each structural edit (add/delete table, rotate, renumber, add/delete
  // floor) snapshots tables+floors+activeFloorId before mutating. Capped
  // at 50 entries. Drag-moves are intentionally not tracked — they're
  // trivially reversible by dragging back, and snapshotting every commit
  // would bloat the stack.
  const [editHistory, setEditHistory] = useState([]);
  const pushHistory = () =>
    setEditHistory(h => [...h.slice(-49), { tables, floors, activeFloorId }]);
  const undo = () => {
    if (editHistory.length === 0) return;
    const snap = editHistory[editHistory.length - 1];
    setEditHistory(h => h.slice(0, -1));
    setTables(snap.tables);
    setFloors(snap.floors);
    setActiveFloorId(snap.activeFloorId);
    setSelectedTableId(null);
    setMergeSelection([]);
    setDragState(null);
  };

  // Floor deletion. Three cascading operations:
  //   1. Remove the floor object from floors state
  //   2. Remove all tables that were on that floor
  //   3. Switch activeFloorId to whichever floor still exists
  // Hard-guarded against deleting the last floor — that'd leave
  // activeFloorId pointing at nothing and the canvas would render
  // empty with no recovery path through the UI.
  const deleteFloor = (floorId) => {
    if (floors.length <= 1) return;
    const fallbackFloor = floors.find(f => f.id !== floorId);
    if (!fallbackFloor) return;
    pushHistory();
    const removedIds = tables.filter(t => t.floorId === floorId).map(t => t.id);
    setFloors(prev => prev.filter(f => f.id !== floorId));
    setTables(prev => prev.filter(t => t.floorId !== floorId));
    cleanupReservationsForTables(removedIds);
    setActiveFloorId(fallbackFloor.id);
    // Defensive clears in case the host had selection state pointing
    // to a now-deleted table or was mid-drag/merge across this floor.
    setSelectedTableId(null);
    setMergeSelection([]);
    setDragState(null);
  };

  // ─── Structural mutators (edit mode) ───────────────────────────────
  // All snapshot via pushHistory() before mutating so a single Undo
  // reverts them. Shared by both the toolbar and the Table Designer.
  // Floor-plan migration commit: build real floors + tables from the
  // reviewed drafts, persist through the SAME layout PUT the editor uses
  // (merged existing+new — PUT soft-deletes anything omitted, so a
  // partial payload would wipe current floors), then drop the host into
  // the layout editor on the new floor: extraction is never perfect, the
  // editor is the correction pass, and its "Done editing" re-saves.
  const commitFloorMigration = (floorDrafts) => {
    if (!Array.isArray(floorDrafts) || floorDrafts.length === 0) return;
    pushHistory();
    // Snapshot for Cancel Migration — the API stores whole-world floor
    // state, so restoring this client-side and PUTting it back is a
    // complete, consistent revert.
    setMigrationBackup({
      floors: floors.map(f => ({ ...f })),
      tables: tables.map(t => ({ ...t })),
      underlays: { ...floorUnderlays },
      activeFloorId,
    });
    const nameKey = (s) => String(s || '').trim().toLowerCase();
    // Pass 1 — floor plan: re-importing a same-named floor REPLACES its
    // layout (the iterate-and-reimport loop), unless parties are seated
    // on it; then a suffixed floor is created instead of orphaning them.
    const occupiedFloorIds = new Set(
      tables.filter(t => t.party || (t.status && t.status !== 'available')).map(t => t.floorId)
    );
    const replacedFloorIds = new Set();
    const newFloors = [];
    const plans = floorDrafts.map((d, i) => {
      const existing = floors.find(f => nameKey(f.name) === nameKey(d.name));
      if (existing && !occupiedFloorIds.has(existing.id)) {
        replacedFloorIds.add(existing.id);
        return { d, fid: existing.id };
      }
      const fid = `f${Date.now() + i}`; // same scheme as addFloor
      newFloors.push({ id: fid, name: existing ? `${d.name} (migrated)` : d.name, isManualOnly: false });
      return { d, fid };
    });
    const keptTables = tables.filter(t => !replacedFloorIds.has(t.floorId));
    // Table ids CONTINUE the sequential t{n} scheme (same rule as
    // addTable): long minted ids leak into the service log, merge join
    // strings, and the AI assigner's references.
    let maxNum = tables.reduce((m, t) => {
      const idNum = /^t?(\d+)$/.exec(String(t.id));
      const nameNum = String(t.name || '').match(/\d+/);
      return Math.max(m, idNum ? parseInt(idNum[1], 10) : 0, nameNum ? parseInt(nameNum[0], 10) : 0);
    }, 0);
    const existingIds = new Set(tables.map(t => String(t.id)));
    const nextTableId = () => {
      maxNum += 1;
      let id = `t${maxNum}`;
      while (existingIds.has(id)) { maxNum += 1; id = `t${maxNum}`; }
      existingIds.add(id);
      return id;
    };
    // No review gate anymore — blank labels auto-name and collisions
    // auto-suffix; both are one-tap fixes in the editor.
    const usedNames = new Set(keptTables.map(t => nameKey(t.name)));
    const uniqueName = (base) => {
      let name = base, k = 2;
      while (usedNames.has(nameKey(name))) { name = `${base} (${k})`; k += 1; }
      usedNames.add(nameKey(name));
      return name;
    };
    const newTables = [];
    const underlayAdds = {};
    plans.forEach(({ d, fid }) => {
      // Preserve the source photo's geometry: box height follows the
      // image's aspect instead of a fixed 14:9 (which vertically crushed
      // portrait-ish photos — the stacked-bar-seats artifact).
      const boxW = MIGRATE_WORLD.W;
      const boxH = Math.max(500, Math.min(1800, Math.round(boxW / (Number(d.aspect) > 0.2 ? Number(d.aspect) : 14 / 9))));
      // Option D: remember the source photo at the EXACT world-box the
      // percentages map into (pctToWorld: PAD + pct/100·box) — the ghost
      // and the placed tables align by construction.
      if (d.photo) underlayAdds[fid] = { src: d.photo, x: MIGRATE_WORLD.PAD, y: MIGRATE_WORLD.PAD, w: boxW, h: boxH };
      const floorTables = [];
      d.tables.forEach(t => {
        const cap = Math.max(1, Math.min(20, Number(t.seats) || 4));
        const pos = pctToWorld(t.xPct, t.yPct, t.shape, cap, boxW, boxH);
        const id = nextTableId();
        // Labels carry ONLY the table number: reservation-time chips
        // ("6:00", "7:30 PM") transcribed off the tile are stripped, and
        // "T12"-style prefixes normalize to the bare "12" archetype.
        const cleanLabel = String(t.label || '')
          .replace(/\b\d{1,2}:\d{2}\s*(?:AM|PM)?\b/gi, '')
          .replace(/^\s*T\s*[-.]?\s*(?=\d)/i, '')
          .replace(/\s+/g, ' ')
          .trim();
        floorTables.push({
          id, name: uniqueName(cleanLabel || `${maxNum}`), capacity: cap, shape: t.shape,
          area: 'dining', rotation: Number(t.rotation) || 0, floorId: fid, x: pos.x, y: pos.y,
          status: 'available', party: null, partySize: null,
          startedAt: null, groupId: null, assignedServerId: null,
        });
      });
      separateMigratedTables(floorTables);
      newTables.push(...floorTables);
    });
    const mergedFloors = [...floors, ...newFloors];
    const mergedTables = [...keptTables, ...newTables];
    setFloors(mergedFloors);
    setTables(mergedTables);
    if (Object.keys(underlayAdds).length > 0) {
      setFloorUnderlays(prev => ({ ...prev, ...underlayAdds }));
      setShowUnderlay(true);
    }
    persist('/api/floor', 'PUT', {
      floors: mergedFloors,
      tables: mergedTables.map(t => ({
        id: t.id, name: t.name, x: t.x, y: t.y, capacity: t.capacity,
        shape: t.shape, area: t.area, rotation: t.rotation || 0, manualOnly: !!t.manualOnly, onlineExcluded: !!t.onlineExcluded, floorId: t.floorId,
      })),
    });
    // Straight into the correction pass on the real canvas.
    setActiveFloorId(plans[0].fid);
    setActiveTab('floor');
    setEditMode(true);
    const n = newTables.length;
    const replaced = replacedFloorIds.size;
    setToastOk(`Migrated ${n} table${n === 1 ? '' : 's'} across ${plans.length} floor${plans.length === 1 ? '' : 's'}${replaced ? ` (${replaced} floor${replaced === 1 ? '' : 's'} replaced)` : ''} — adjust on the canvas; Keep or Cancel in the toolbar`);
  };

  // Cancel Migration: restore the snapshot and write it back — a full,
  // consistent revert because /api/floor stores whole-world state.
  const cancelFloorMigration = () => {
    if (!migrationBackup) return;
    const b = migrationBackup;
    setFloors(b.floors);
    setTables(b.tables);
    setFloorUnderlays(b.underlays);
    setActiveFloorId(b.activeFloorId);
    setMigrationBackup(null);
    setEditMode(false);
    setSelectedTableId(null);
    persist('/api/floor', 'PUT', {
      floors: b.floors,
      tables: b.tables.map(t => ({
        id: t.id, name: t.name, x: t.x, y: t.y, capacity: t.capacity,
        shape: t.shape, area: t.area, rotation: t.rotation || 0, manualOnly: !!t.manualOnly, onlineExcluded: !!t.onlineExcluded, floorId: t.floorId,
      })),
    });
    setToastOk('Migration cancelled — previous floor plan restored');
  };

  const addFloor = (rawName) => {
    const name = (rawName || "").trim();
    if (!name) return;
    pushHistory();
    const newId = `f${Date.now()}`;
    setFloors(prev => [...prev, { id: newId, name, isManualOnly: false }]);
    setActiveFloorId(newId);
    setNewFloorName("");
    setIsAddingFloor(false);
  };

  // New tables auto-number ascending from the highest number already in
  // use across ALL floors — so renumbering one table to 100 makes the
  // next added table 101. pos (optional) is a drop point from the canvas;
  // without it, tables cascade in a tidy grid so click-to-add never stacks.
  const addTable = (cap, shape, area, pos) => {
    pushHistory();
    setTables(prev => {
      const maxNum = prev.reduce((m, t) => {
        const match = String(t.name).match(/\d+/);
        return match ? Math.max(m, parseInt(match[0], 10)) : m;
      }, 0);
      const onFloor = prev.filter(t => t.floorId === activeFloorId).length;
      const x = pos ? Math.round(pos.x) : 48 + ((onFloor * 26) % 260);
      const y = pos ? Math.round(pos.y) : 48 + (((onFloor * 26) / 260 | 0) * 96) % 360;
      // Short, stable id — NOT Date.now(). A 13-digit timestamp id leaks
      // into the service log ("T1783…"), the merge join strings, and the
      // AI assigner's table references. Sequential "t{n}" ids read
      // cleanly everywhere and keep the id ↔ name relationship legible.
      const nextNum = maxNum + 1;
      const existingIds = new Set(prev.map(t => String(t.id)));
      let newId = `t${nextNum}`;
      let bump = nextNum;
      while (existingIds.has(newId)) { bump += 1; newId = `t${bump}`; }
      // Bare-number archetype ("72", not "T72") — matches the migrated
      // tables and OpenTable convention. Names are unique per floor
      // (partial index), so walk past any collision.
      const usedNames = new Set(prev.map(t => String(t.name || '').trim().toLowerCase()));
      let nameNum = nextNum;
      while (usedNames.has(String(nameNum))) nameNum += 1;
      return [...prev, {
        id: newId,
        name: `${nameNum}`,
        x, y,
        capacity: cap,
        shape: shape || 'square',
        area: area || 'dining',
        status: 'available',
        rotation: 0,
        party: null,
        partySize: null,
        startedAt: null,
        groupId: null,
        assignedServerId: null,
        floorId: activeFloorId,
      }];
    });
  };

  // Rewrite today+future reservations that reference removed table ids.
  // Past bookings are HISTORY — they referenced a table that existed at
  // the time, so they're deliberately left untouched.
  const cleanupReservationsForTables = (removedIds) => {
    const removed = new Set(removedIds.map(String));
    const affected = reservations.filter(r => {
      if (r.tableId == null) return false;
      if ((r.date || todayStr) < todayStr) return false;
      return String(r.tableId).split('_').some(p => removed.has(p));
    });
    if (affected.length === 0) return;
    setReservations(prev => prev.map(r => {
      if (!affected.some(a => a.id === r.id)) return r;
      const kept = String(r.tableId).split('_').filter(p => !removed.has(p));
      const nextId = kept.length === 0
        ? null
        : (kept.length === 1
            ? (/^\d+$/.test(kept[0]) ? Number(kept[0]) : kept[0])
            : kept.join('_'));
      return { ...r, tableId: nextId };
    }));
    affected.forEach(a => {
      const kept = String(a.tableId).split('_').filter(p => !removed.has(p));
      const nextId = kept.length === 0 ? null : (kept.length === 1 ? (/^\d+$/.test(kept[0]) ? Number(kept[0]) : kept[0]) : kept.join('_'));
      persist('/api/reservations', 'PATCH', { id: a.id, tableId: nextId });
    });
  };

  const deleteTable = (id) => {
    const t = tables.find(x => x.id === id);
    // A live table can't be deleted out from under its party — the cover
    // record would be orphaned in "Now Seated" with no table to close
    // out from. Clear it first.
    if (t && (t.status === 'seated' || t.status === 'dining' || t.status === 'bussing')) {
      setToast('Clear the table before deleting it');
      return;
    }
    pushHistory();
    const gid = t ? t.groupId : null;
    setTables(prev => {
      const next = prev.filter(x => x.id !== id);
      // Dissolve a merge remnant: a group of one isn't a group.
      if (gid) {
        const remaining = next.filter(x => x.groupId === gid);
        if (remaining.length === 1) {
          return next.map(x => (x.groupId === gid ? { ...x, groupId: null } : x));
        }
      }
      return next;
    });
    cleanupReservationsForTables([id]);
  };

  const rotateTable = (id, dir = 1) => {
    pushHistory();
    setTables(prev => prev.map(t =>
      t.id === id ? { ...t, rotation: ((((t.rotation || 0) + dir * 45) % 360) + 360) % 360 } : t
    ));
  };

  const setTableShape = (id) => {
    pushHistory();
    const order = ['square', 'rectangle', 'round'];
    setTables(prev => prev.map(t =>
      t.id === id ? { ...t, shape: order[(order.indexOf(t.shape) + 1) % order.length] } : t
    ));
  };

  // Re-dedicate a placed table's zone (edit mode). The zone drives the
  // seating assistant's area matching and section grouping.
  const setTableArea = (id, area) => {
    if (!['dining', 'bar', 'patio'].includes(area)) return;
    pushHistory();
    setTables(prev => prev.map(t => (t.id === id ? { ...t, area } : t)));
  };

  // Per-table AI opt-out — the section planner skips these tables and
  // preserves whatever server was assigned by hand. Persists directly:
  // the exclusion picking mode runs outside edit mode (no autosave),
  // and one PUT per click is a single fast statement now.
  const toggleTableManualOnly = (id) => {
    pushHistory();
    const next = tables.map(t => (t.id === id ? { ...t, manualOnly: !t.manualOnly } : t));
    setTables(next);
    persistLayout(floors, next);
  };

  // Per-table online-reservation opt-out (enforced by the public site
  // when it ships) — same persistence pattern.
  const toggleTableOnlineExcluded = (id) => {
    pushHistory();
    const next = tables.map(t => (t.id === id ? { ...t, onlineExcluded: !t.onlineExcluded } : t));
    setTables(next);
    persistLayout(floors, next);
  };

  // One layout write, shared by every handler reachable outside edit
  // mode (no autosave loop there — persistence must be explicit).
  const persistLayout = (nextFloors, nextTables) => {
    persist('/api/floor', 'PUT', {
      floors: nextFloors,
      tables: nextTables.map(t => ({
        id: t.id, name: t.name, x: t.x, y: t.y, capacity: t.capacity,
        shape: t.shape, area: t.area, rotation: t.rotation || 0, manualOnly: !!t.manualOnly, onlineExcluded: !!t.onlineExcluded, floorId: t.floorId,
      })),
    });
  };

  // Per-floor AI opt-out — the room and everyone locked to it are
  // invisible to the auto-assigner. Reachable from the ⋯ menu in any
  // mode, so it persists directly.
  const toggleFloorManualOnly = (id) => {
    pushHistory();
    const next = floors.map(f => (f.id === id ? { ...f, isManualOnly: !f.isManualOnly } : f));
    setFloors(next);
    persistLayout(next, tables);
  };

  // Per-floor online-reservation exclusion. Persisted now; the public
  // booking site will enforce it when it ships.
  const toggleFloorOnlineExcluded = (id) => {
    pushHistory();
    const next = floors.map(f => (f.id === id ? { ...f, onlineExcluded: !f.onlineExcluded } : f));
    setFloors(next);
    persistLayout(next, tables);
  };

  // Bulk table flags for one floor (⋯ menu): set/clear every table.
  const setFloorTablesManualOnly = (floorId, val) => {
    pushHistory();
    const next = tables.map(t => (t.floorId === floorId ? { ...t, manualOnly: !!val } : t));
    setTables(next);
    persistLayout(floors, next);
  };
  const setFloorTablesOnlineExcluded = (floorId, val) => {
    pushHistory();
    const next = tables.map(t => (t.floorId === floorId ? { ...t, onlineExcluded: !!val } : t));
    setTables(next);
    persistLayout(floors, next);
  };

  // Floor tab drag-reorder. sortOrder persists from array position in
  // the PUT (the route stamps index → sortOrder), so reordering is just
  // a resequence + full layout write — valid in any mode.
  const reorderFloors = (orderedIds) => {
    const byId = new Map(floors.map(f => [f.id, f]));
    const next = orderedIds.map(id => byId.get(id)).filter(Boolean);
    for (const f of floors) if (!next.includes(f)) next.push(f);
    if (next.length !== floors.length) return;
    setFloors(next);
    persist('/api/floor', 'PUT', {
      floors: next,
      tables: tables.map(t => ({
        id: t.id, name: t.name, x: t.x, y: t.y, capacity: t.capacity,
        shape: t.shape, area: t.area, rotation: t.rotation || 0, manualOnly: !!t.manualOnly, onlineExcluded: !!t.onlineExcluded, floorId: t.floorId,
      })),
    });
  };

  const renameFloor = (id, rawName) => {
    const name = (rawName || '').trim();
    if (!name) return;
    pushHistory();
    setFloors(prev => prev.map(f => (f.id === id ? { ...f, name } : f)));
  };

  const renameTable = (id, rawName) => {
    const clean = (rawName || "").trim();
    if (!clean) return;
    // Duplicate guard: table names are unique per floor (DB partial
    // unique index) — letting a collision through would make every
    // layout save 500 until it's found. Refuse with a clear toast.
    const target = tables.find(t => t.id === id);
    if (target) {
      const clash = tables.find(t =>
        t.id !== id && t.floorId === target.floorId &&
        String(t.name || '').trim().toLowerCase() === clean.toLowerCase()
      );
      if (clash) {
        setToast(`Table "${clean}" already exists on this floor — pick a different name`);
        return;
      }
    }
    pushHistory();
    setTables(prev => prev.map(t =>
      t.id === id ? { ...t, name: clean } : t
    ));
  };

  // Adjust a placed table's seat count (edit mode). Clamped to 1–20; the new
  // capacity also drives the table's on-floor size via its size bucket.
  const setTableCapacity = (id, cap) => {
    const n = Math.max(1, Math.min(20, Math.round(Number(cap)) || 1));
    pushHistory();
    setTables(prev => prev.map(t => (t.id === id ? { ...t, capacity: n } : t)));
  };

  // Point-and-click reassignment mode. When non-null, the floor map
  // intercepts table clicks and routes them through updateReservationTable
  // instead of opening the table-details panel. Cleared by: the floor
  // intercept itself on success, the panel-close path, the background-
  // dismiss listener (canvas click + document listener), and the Esc-style
  // mutual exclusions in handleTableClick.
  const [reassignReservationId, setReassignReservationId] = useState(null);
  const [editMode,         setEditMode]         = useState(false);
  // ── Single-flow guard ───────────────────────────────────────────────
  // Exactly one "click a table" flow may be live at a time. Without this,
  // starting a walk-in while a reservation was still awaiting its table
  // let both listen for the same click — and the reservation intercept
  // (checked first) stole it, seating the wrong party.
  const pendingTablePick = () => {
    if (reassignReservationId) return 'reservation';
    if (selectedPartyId) return 'party';
    return null;
  };
  const blockIfPending = () => {
    const p = pendingTablePick();
    if (!p) return false;
    setToast(p === 'reservation'
      ? 'Finish assigning the reservation first — pick a table, or click empty floor to cancel'
      : 'Finish seating the current party first — pick a table, or click empty floor to cancel');
    return true;
  };

  const [mergeMode,        setMergeMode]        = useState(false);
  const [mergeSelection,   setMergeSelection]   = useState([]);
  const [newCapacity,      setNewCapacity]      = useState(4);
  const [newTableShape,    setNewTableShape]    = useState('square');
  const [newTableArea,     setNewTableArea]     = useState('dining');
  const [moveSourceId,     setMoveSourceId]     = useState(null);
  const [modalOpen,        setModalOpen]        = useState(false);
  const [editReservation,  setEditReservation]  = useState(null);
  const [editParty,        setEditParty]        = useState(null);
  const [confirmDelete,    setConfirmDelete]    = useState(null);
  const [assignOverride,   setAssignOverride]   = useState(null);
  // Time Travel: the date the FLOOR is currently rendering. Today by
  // default; a calendar-day tap points it elsewhere.
  const [viewDate,         setViewDate]         = useState(() => new Date());
  // True when hydration failed and the app is running on in-memory demo
  // seeds — surfaced as a banner so DB-down can never masquerade as data.
  const [dbOffline,        setDbOffline]        = useState(false);
  const [walkInModalOpen,  setWalkInModalOpen]  = useState(false);

  // ─── Server Section Assignment state ──────────────────────────────
  const [isAssignMode,         setIsAssignMode]         = useState(false);
  const [assignSelectedServer, setAssignSelectedServer] = useState(null);
  const [aiAssignLoading,      setAiAssignLoading]      = useState(false);
  const [viewingServerId,      setViewingServerId]      = useState(null);
  // Global section-view toggle. Independent from viewingServerId:
  //   - sectionView=true: every assigned table tinted by its server's
  //     color (the "heatmap"). Activated by AI Auto Section completion
  //     or by the manual "Section View" toggle in the sidebar.
  //   - viewingServerId=<id>: only THAT server's tables get an edge
  //     stripe highlight (single-server filter). Activated by clicking
  //     a server's row in the sidebar.
  // The two modes can coexist (heatmap + one server's stripe is louder),
  // or operate independently. Floor switching never touches sectionView.
  const [sectionView,          setSectionView]          = useState(false);
  const [forceSeatTarget,  setForceSeatTarget]  = useState(null);
  const [dragState,        setDragState]        = useState(null);
  const [hostServiceLogOpen, setHostServiceLogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [migrateOpen, setMigrateOpen] = useState(false);
  // Pre-migration snapshot; non-null = a migration awaits Keep/Cancel.
  const [migrationBackup, setMigrationBackup] = useState(null);
  // Migration tracing underlays: floorId → ghosted source photo at the
  // world-box its tables were mapped into. Session-only by design — the
  // photo is a correction aid, not layout data, so it is never persisted.
  const [floorUnderlays, setFloorUnderlays] = useState({});
  const [showUnderlay, setShowUnderlay] = useState(true);
  const [toastState, setToastState] = useState({ msg: null, kind: 'blocked' });
  const toast = toastState.msg;
  const toastKind = toastState.kind;
  // Message + status are set together, so a block can never inherit the
  // previous message's success colour (toasts routinely interrupt each
  // other, so resetting the kind only on dismiss would leave that hole).
  // Plain setToast() = blocked/amber (the safe default: a refusal shown
  // as a confirmation is the more harmful mistake). setToastOk() = green.
  const setToast = useCallback((msg) => setToastState({ msg, kind: 'blocked' }), []);
  const setToastOk = useCallback((msg) => setToastState({ msg, kind: 'ok' }), []);
  const [now,              setNow]              = useState(() => Date.now());

  // ─── Date filters ────────────────────────────────────────────────
  // todayStr is the YYYY-MM-DD key for "right now" — recomputed when
  // Home's `now` tick crosses midnight, so the filter rolls over the
  // floor's reservations automatically without a page refresh.
  // Uses formatDateKey (local-time) for timezone safety; toISOString()
  // would shift dates near midnight for negative-offset timezones.
  //
  // todaysReservations isolates today's bookings so the floor map,
  // sidebar guest list, and waitlist view only see what's relevant
  // to current operations. Reservations without a date field fall
  // through as legacy (assumed to belong to today, matching the
  // CalendarSidebar's fallback behavior).
  //
  // Placement note: these memos MUST sit after `now` is declared with
  // useState — `const` in JS doesn't hoist, so accessing `now` before
  // its declaration throws a ReferenceError (temporal dead zone). The
  // earlier placement (between selectedCalendarDate and reassign state)
  // hit this trap; this position is safe because both `now` and
  // `reservations` (declared further up) are now initialized.
  const todayStr = useMemo(() => formatDateKey(new Date(now)), [now]);
  const todaysReservations = useMemo(
    () => reservations.filter(r => !r.date || r.date === todayStr),
    [reservations, todayStr]
  );

  // ── Time Travel hydration ─────────────────────────────────────────
  // The floor renders whichever date is being viewed. Undated legacy
  // rows count as today's (same rule as todaysReservations).
  const viewDateStr = useMemo(() => formatDateKey(viewDate), [viewDate]);
  const viewDateReservations = useMemo(
    () => reservations.filter(r => (r.date || todayStr) === viewDateStr),
    [reservations, todayStr, viewDateStr]
  );
  // Day-relative policy: past days are read-only history; walk-ins can
  // only ever be seated TODAY (a walk-in is by definition standing at
  // the door); reservations are today-or-future.
  const viewingPast = viewDateStr < todayStr;
  const viewingFuture = viewDateStr > todayStr;



  // ─── AI Predictor state ───────────────────────────────────────────
  const [predictorData,      setPredictorData]      = useState(null);
  const [predictorLoading,   setPredictorLoading]   = useState(false);
  const [predictorError,     setPredictorError]     = useState(null);
  const [predictorFetchedAt, setPredictorFetchedAt] = useState(null);
  const [predictorDate, setPredictorDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const predictorKeyRef = useRef('');

  // ─── AI Seating Agent state ───────────────────────────────────────
  const [aiSuggestedIds, setAiSuggestedIds] = useState([]);
  // Truthy from the moment the seat useEffect fires its fetch until
  // the response lands (success or error). Drives the reassignment
  // banner's loading text and disables the Cancel button — keeps the
  // host from accidentally bailing mid-fetch before the suggestion
  // arrives.
  const [aiThinking, setAiThinking] = useState(false);
  // Raw AI suggestion id (preserves the virtual "i_j" form for merges).
  // aiSuggestedIds is the SPLIT version used for visual highlighting on
  // the floor map (each base table pulses cyan). aiSuggestedRawId is
  // the original form used by handleTableClick to reconstruct the merge
  // intent when the host clicks any pulsing base table.
  const [aiSuggestedRawId, setAiSuggestedRawId] = useState(null);
  const [forcedSeatSuggestion, setForcedSeatSuggestion] = useState(null);
  const [aiReason,       setAiReason]       = useState("");

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(i);
  }, []);

  // ─── Mutual exclusion: table details and reservation details ──────
  // Only one right-side panel is ever open. Setting one clears the
  // other. The if-guards prevent the effects from cycling — once the
  // partner state is already null, the setter is a no-op.
  useEffect(() => {
    if (selectedTableId && selectedReservationId) setSelectedReservationId(null);
  }, [selectedTableId]);
  useEffect(() => {
    if (selectedReservationId && selectedTableId) setSelectedTableId(null);
  }, [selectedReservationId]);

  useEffect(() => {
    if (!dragState?.finalize) return;
    // dragState now carries the final delta (computed once on mouseup
    // from the ref-based drag info) instead of the absolute current
    // position. Every group member shifts by the same (dx, dy).
    const { finalDx, finalDy, groupOffsets, tableId } = dragState;
    setTables(prev => {
      // Provisional new positions.
      const moved = prev.map(t =>
        (groupOffsets && groupOffsets[t.id] !== undefined)
          ? { ...t, x: t.x + finalDx, y: t.y + finalDy }
          : t
      );
      // Snap-to-align: if the primary dragged table's left/center/top edges
      // land within SNAP px of another (non-group) table's matching edge,
      // nudge the whole group so they line up exactly. Subtle by design —
      // only fires when already close, so free-form placement still works.
      const SNAP = 8;
      const lead = moved.find(t => String(t.id) === String(tableId));
      if (lead && groupOffsets) {
        const dims = (t) => getTableSizePx(t.shape, t.capacity);
        const ls = dims(lead);
        const others = moved.filter(t => groupOffsets[t.id] === undefined && t.floorId === lead.floorId);
        let snapX = 0, snapY = 0;
        // Candidate x anchors: left edges + centers align.
        for (const o of others) {
          const os = dims(o);
          const xPairs = [[lead.x, o.x], [lead.x + ls.width / 2, o.x + os.width / 2], [lead.x + ls.width, o.x + os.width]];
          for (const [a, b] of xPairs) {
            if (snapX === 0 && Math.abs(a - b) <= SNAP) snapX = b - a;
          }
          const yPairs = [[lead.y, o.y], [lead.y + ls.height / 2, o.y + os.height / 2], [lead.y + ls.height, o.y + os.height]];
          for (const [a, b] of yPairs) {
            if (snapY === 0 && Math.abs(a - b) <= SNAP) snapY = b - a;
          }
          if (snapX !== 0 && snapY !== 0) break;
        }
        if (snapX !== 0 || snapY !== 0) {
          return moved.map(t =>
            (groupOffsets[t.id] !== undefined)
              // No Math.max(0) — the canvas is infinite in all directions;
              // flooring at 0 here was snapping past-origin tables back to
              // the top/left boundary.
              ? { ...t, x: Math.round(t.x + snapX), y: Math.round(t.y + snapY) }
              : t
          );
        }
      }
      return moved;
    });
    setDragState(null);
  }, [dragState]);

  const occupancy = useMemo(() => ({
    occupied: tables.filter(t => t.status === "dining" || t.status === "seated").length,
    total: tables.length || 1,
  }), [tables]);

  // ─── AI Predictor — fetch on tab open, 60s cache ─────────────────
  const fetchPredictions = async () => {
    setPredictorLoading(true);
    setPredictorError(null);
    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: predictorDate }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPredictorData(data);
      setPredictorFetchedAt(Date.now());
      predictorKeyRef.current = predictorDate;
    } catch (e) {
      setPredictorError(e instanceof Error ? e.message : 'Failed to fetch predictions');
    } finally {
      setPredictorLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'predictor') return;
    const STALE_AFTER_MS = 60_000;
    const isStale = !predictorFetchedAt || Date.now() - predictorFetchedAt > STALE_AFTER_MS || predictorKeyRef.current !== predictorDate;
    if (isStale && !predictorLoading) {
      fetchPredictions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, predictorDate]);

  // ─── AI Seating Agent — fetch on party selection OR reassign mode ─
  useEffect(() => {
    // A reservation's assigned table is a deliberate host suggestion,
    // not an auto-commit. Keep it glowing without replacing it via AI.
    const forced = forcedSeatSuggestion && forcedSeatSuggestion.partyId === selectedPartyId ? forcedSeatSuggestion : null;
    if (forced) {
      setAiThinking(false);
      setAiReason('Assigned table');
      setAiSuggestedIds(splitTableIds(forced.tableId));
      setAiSuggestedRawId(forced.tableId);
      return undefined;
    }
    // Clear previous AI state whenever the party selection changes
    setAiSuggestedIds([]);
    setAiReason("");

    // Two distinct triggers feed the seating agent:
    //   - selectedPartyId  → host clicked a waitlist row to seat
    //                        (walk-in or arrived-reservation co-pilot).
    //   - reassignReservationId → host either submitted the New
    //                        Reservation modal (point-and-click flow)
    //                        or clicked Change Table on a reservation
    //                        panel.
    // Whichever is set first wins. Both being null means no active
    // party — bail without firing.
    const activePartyId = selectedPartyId || reassignReservationId;
    if (!activePartyId) return;

    // Active party can come from either pool: walk-ins/waitlist (waitlist)
    // or upcoming reservations. The seating flow treats them identically
    // once they're selected — only the cleanup step (performSeat) differs.
    const party =
      waitlist.find(a => a.id === activePartyId) ||
      reservations.find(r => r.id === activePartyId);
    if (!party) return;

    // Reservations carry a r.time field and need future-mode math
    // (booking-load tallies, bidirectional conflict window). Walk-ins
    // and waitlist items have addedAt instead — they use walk-in mode
    // with the current time as the reference. The reservations.some
    // check disambiguates parties that live in BOTH pools (shouldn't
    // happen, but cheap to guard).
    const isReservationParty = reservations.some(r => r.id === party.id);

    // Day-isolated context. The backend's conflict filter only checks
    // `r.time` (it has no date awareness in the current schema), so
    // sending the full reservations array means a 7:30pm booking
    // tomorrow would falsely flag the same table as conflicting for a
    // 7:30pm seating tonight. By pre-filtering on the frontend to just
    // the party's target date, we get correct conflict math from the
    // existing backend math without touching it.
    //
    // partyDate falls back to today for legacy reservations / walk-ins
    // without a date field. The filter's `r.date || todayStr` mirror
    // ensures legacy reservations cluster under today.
    const partyDate = party.date || todayStr;
    const daySpecificReservations = reservations.filter(
      r => (r.date || todayStr) === partyDate
    );

    // Normalize the payload going to /api/seat so reservations get a
    // proper `tag` field (the reservation objects don't carry one).
    const partyPayload = {
      id: party.id,
      name: party.name,
      size: party.size,
      tag: party.tag || (isReservationParty ? 'Reservation' : 'Guest'),
    };
    let cancelled = false;
    setAiThinking(true);
    // Filter out tables on manual-only floors so the AI can't suggest
    // them. The backend's conflict/load math gets a sanitized view —
    // identical contract, fewer rows, zero schema change.
    const aiEligibleTables = tables.filter(t => {
      const floor = floors.find(f => f.id === t.floorId);
      return floor ? !floor.isManualOnly : true;
    });
    (async () => {
      try {
        const res = await fetch('/api/seat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // The backend computes server loads from `allTables` — it
          // groups occupied tables by assignedServerId to figure out
          // who's already slammed, then filters to fitting available
          // tables internally. `reservations` + `currentTimeStr` feed
          // the conflict filter: the backend pre-filters out any
          // available table that's holding for a reservation in the
          // next DINING_WINDOW_MINS minutes BEFORE asking the LLM.
          // Future-reservation mode adds targetTime so the conflict
          // and load math anchor on the booking's slot rather than
          // "now". targetDate is sent for forward-compat with any
          // future date-aware backend changes; the current backend
          // ignores it and relies on the pre-filtered day array.
          body: JSON.stringify({
            party: partyPayload,
            allTables: aiEligibleTables,
            reservations: daySpecificReservations,
            currentTimeStr: new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
            ...(isReservationParty && party.time ? {
              isFutureReservation: true,
              targetTime:          party.time,
              targetDate:          partyDate,
            } : {}),
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;
        // Virtual table ("i_j") → split into base ids so every
        // member of the merge pulses cyan on the floor map. Single
        // numeric/string ids wrap into a single-element array. Null
        // (no fit) collapses to empty. aiSuggestedRawId preserves the
        // canonical form for the click→seat reconstruction path.
        if (data.tableId == null) {
          setAiSuggestedIds([]);
          setAiSuggestedRawId(null);
        } else if (typeof data.tableId === 'string' && data.tableId.includes('_')) {
          // Type-preserving split: numeric-looking parts → numbers (legacy
          // tables), everything else stays a string ("t16"). Blanket
          // .map(Number) turned designer-table merges into [NaN, …] —
          // killing the highlight AND the merge-seat interceptor, which
          // silently seated the party at ONE member table instead.
          setAiSuggestedIds(splitTableIds(data.tableId));
          setAiSuggestedRawId(data.tableId);
        } else {
          setAiSuggestedIds([data.tableId]);
          setAiSuggestedRawId(data.tableId);
        }
        setAiReason(data.reason || "");
      } catch (e) {
        if (cancelled) return;
        // Quiet failure — leave suggestions empty, surface error in reason
        setAiReason(e instanceof Error ? `Couldn't reach AI: ${e.message}` : "AI unavailable");
      } finally {
        // Clear the loading flag regardless of success/error, but
        // skip the setter if this effect run was superseded — avoids
        // a "set state on unmounted" warning and prevents a stale
        // false from clobbering a fresh effect's true value.
        if (!cancelled) setAiThinking(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPartyId, reassignReservationId, forcedSeatSuggestion]);

  // ─── View mode auto-dismiss ──────────────────────────────────────
  // While a server's tables are being highlighted (viewingServerId set),
  // any click anywhere on document dismisses the view. The server-row
  // click that *sets* viewingServerId uses e.stopPropagation() so it
  // doesn't reach this listener — see ServerRow's onClick handler.
  //
  // The listener only attaches when there's something to dismiss; this
  // also prevents a race where the activating click could trigger
  // dismissal, since the listener doesn't exist until the next render.
  useEffect(() => {
    if (viewingServerId === null) return undefined;
    const handler = (e) => {
      // Carve-outs: clicks inside a floor tab OR the Section View
      // toggle shouldn't dismiss viewingServerId. Floor tabs need
      // this so switching floors stays in single-server-filter mode;
      // the section toggle needs this so the click that ENABLES it
      // doesn't immediately bubble up and trigger dismissal.
      const target = e.target;
      if (target && typeof target.closest === 'function') {
        if (target.closest('[data-floor-tab]')) return;
        if (target.closest('[data-section-toggle]')) return;
      }
      setViewingServerId(null);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [viewingServerId]);

  // ─── Background-click dismiss for the reservation panel ──────────
  // Any click outside the panel + outside a reservation row closes the
  // panel. Uses data-attribute carve-outs (data-reservation-panel on
  // the aside, data-reservation-row on each clickable reservation row)
  // instead of stopPropagation so other global listeners (e.g. the
  // viewingServerId dismiss above) still see every click. The useEffect
  // only attaches when there's a panel open — and because effects run
  // AFTER render, the activating click that set selectedReservationId
  // can't immediately trigger this dismiss.
  useEffect(() => {
    if (!selectedReservationId) return undefined;
    const handler = (e) => {
      const target = e.target;
      if (target && typeof target.closest === 'function') {
        if (target.closest('[data-reservation-panel]')) return;
        if (target.closest('[data-reservation-row]')) return;
      }
      setSelectedReservationId(null);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [selectedReservationId]);

  // ─── Toast auto-dismiss ──────────────────────────────────────────
  // Every setToast(...) call triggers a fresh 3-second timer. If a new
  // toast fires before the previous one expires, the cleanup function
  // clears the pending timeout before the next effect installs a new
  // one — so each toast gets its full 3s window, no stacking.
  useEffect(() => {
    if (!toast) return;
    // 4.5s: the old 3s window was tight for a message the host is meant
    // to act on. Clicking the banner dismisses it immediately.
    const id = setTimeout(() => setToastState({ msg: null, kind: 'blocked' }), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  // ── Guest-list drag-to-seat ─────────────────────────────────────────
  // Dragging a party from the guest list onto a table seats it there.
  // On drag start, a party that already has an assigned table lights that
  // table up using the SAME highlight the AI seating suggestion uses, so
  // the host sees where the booking was meant to go.
  const onPartyDragStart = (item) => {
    if (!item) return;
    // A pending pick owns the suggestion highlight — don't overwrite it
    // while dragging some other party (the drop is blocked anyway).
    if (reassignReservationId) return;
    if (selectedPartyId && selectedPartyId !== item.id) return;
    const raw = item.tableId;
    if (raw == null || raw === '') { setAiSuggestedIds([]); return; }
    const ids = String(raw).split('_').map(x => (/^\d+$/.test(x) ? Number(x) : x));
    setAiSuggestedIds(ids);
  };
  const onPartyDragEnd = () => setAiSuggestedIds([]);

  // ── Touch drag-to-seat (iPad) ───────────────────────────────────────
  // HTML5 drag-and-drop is mouse-first and inconsistent under touch, so
  // coarse-pointer devices get a hand-rolled equivalent: press-and-hold
  // a party row (450ms — a quick tap still opens Party Details), a
  // floating chip lifts under the finger, tables highlight as the finger
  // passes over them, and lifting over a table seats the party through
  // the exact same onSeatPartyDrop path the mouse uses. The pre-
  // activation phase cancels on >10px movement so list scrolling is
  // never hijacked.
  const [coarsePointer, setCoarsePointer] = useState(false);
  useEffect(() => {
    setCoarsePointer(!!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
  }, []);
  const [touchDragGhost, setTouchDragGhost] = useState(null); // { name, size, x, y }
  const touchDragCleanupRef = useRef(null);
  useEffect(() => () => { if (touchDragCleanupRef.current) touchDragCleanupRef.current(); }, []);
  const beginPartyTouchDrag = (e, item) => {
    if (!coarsePointer || !item || e.touches.length !== 1) return;
    const t0 = e.touches[0];
    const start = { x: t0.clientX, y: t0.clientY };

    // Phase 1 — armed. A scroll gesture or an early lift disarms.
    const disarm = () => {
      clearTimeout(timer);
      window.removeEventListener('touchmove', preMove);
      window.removeEventListener('touchend', disarm);
      window.removeEventListener('touchcancel', disarm);
    };
    const preMove = (ev) => {
      const tt = ev.touches[0];
      if (tt && Math.hypot(tt.clientX - start.x, tt.clientY - start.y) > 10) disarm();
    };
    window.addEventListener('touchmove', preMove, { passive: true });
    window.addEventListener('touchend', disarm, { passive: true });
    window.addEventListener('touchcancel', disarm, { passive: true });

    const timer = setTimeout(() => {
      disarm();
      // Phase 2 — lifted. Same guards the mouse path applies on drop.
      onPartyDragStart(item);
      setTouchDragGhost({ name: item.name, size: item.size, x: start.x, y: start.y });
      let hoverTile = null;
      const setHover = (tile) => {
        if (tile === hoverTile) return;
        if (hoverTile) { hoverTile.style.outline = ''; hoverTile.style.outlineOffset = ''; }
        if (tile) { tile.style.outline = '2px solid var(--color-ai)'; tile.style.outlineOffset = '3px'; }
        hoverTile = tile;
      };
      const tileAt = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return el && el.closest ? el.closest('[data-table-tile]') : null;
      };
      const cleanup = () => {
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onEnd);
        window.removeEventListener('touchcancel', onCancel);
        setHover(null);
        setTouchDragGhost(null);
        onPartyDragEnd();
        touchDragCleanupRef.current = null;
      };
      touchDragCleanupRef.current = cleanup;
      const onMove = (ev) => {
        if (ev.cancelable) ev.preventDefault(); // the drag owns this gesture — no scrolling
        const tt = ev.touches[0];
        if (!tt) return;
        setTouchDragGhost(g => (g ? { ...g, x: tt.clientX, y: tt.clientY } : g));
        setHover(tileAt(tt.clientX, tt.clientY));
      };
      const onEnd = (ev) => {
        if (ev.cancelable) ev.preventDefault(); // suppress the synthesized click
        const tt = ev.changedTouches && ev.changedTouches[0];
        const tile = tt ? tileAt(tt.clientX, tt.clientY) : null;
        cleanup();
        if (tile) {
          const tid = tile.getAttribute('data-table-id');
          const table = tables.find(x => String(x.id) === String(tid));
          if (table) onSeatPartyDrop(String(item.id), table.id);
        }
      };
      const onCancel = () => cleanup();
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd, { passive: false });
      window.addEventListener('touchcancel', onCancel, { passive: true });
    }, 450);
  };

  const onSeatPartyDrop = (partyId, tableId) => {
    setAiSuggestedIds([]);
    if (!partyId) return;
    if (reassignReservationId) {
      setToast('Finish assigning the reservation first — pick a table, or click empty floor to cancel');
      return;
    }
    // Dropping the SAME pending party completes its flow; dropping a
    // DIFFERENT one would leave the first pick live and ambiguous.
    if (selectedPartyId && selectedPartyId !== partyId) {
      setToast('Finish seating the current party first — pick a table, or click empty floor to cancel');
      return;
    }
    // Seat the dragged party directly at the dropped table. performSeat's
    // overridePartyId path skips the co-pilot detour — the host has
    // already chosen the table by dropping it there.
    performSeat(tableId, false, partyId);
  };

  const attemptSeat = (tableId) => {
    const party =
      waitlist.find(a => a.id === selectedPartyId) ||
      reservations.find(r => r.id === selectedPartyId);
    if (!party) return;

    // Virtual table case — sum the base capacities for the fit check.
    // The host clicked the cyan-pulsing pair, which lives only as a
    // virtual id; performSeat handles the actual groupId stamping.
    if (typeof tableId === 'string' && tableId.includes('_')) {
      const baseIds = splitTableIds(tableId);
      const combinedCapacity = baseIds.reduce((sum, id) => {
        const t = tables.find(x => x.id === id);
        return sum + (t?.capacity ?? 0);
      }, 0);
      if (combinedCapacity >= party.size) {
        performSeat(tableId, false);
      } else {
        setForceSeatTarget(tableId);
      }
      return;
    }

    const table = tables.find(t => t.id === tableId);
    if (getEffectiveCapacity(table, tables) >= party.size) {
      performSeat(tableId, false);
    } else {
      setForceSeatTarget(tableId);
    }
  };

  const performSeat = (tableId, isForce, overridePartyId = null) => {
    // Party can originate from waitlist (walk-ins/waitlist) or reservations.
    // Clean up whichever pool actually holds it.
    // overridePartyId lets callers seat a specific reservation without
    // first routing through selectedPartyId — used by the panel's
    // "Seat now" handler when the reservation already has an assigned
    // table and doesn't need the AI co-pilot detour.
    const targetPartyId = overridePartyId || selectedPartyId;
    const fromWaitlist = waitlist.find(a => a.id === targetPartyId);
    const fromReservations = reservations.find(r => r.id === targetPartyId);
    const party = fromWaitlist || fromReservations;
    if (!party) return;
    // Past bookings are read-only history — they can't be seated.
    if (fromReservations && (party.date || todayStr) < todayStr) {
      setToast('Past reservations are read-only');
      return;
    }
    const startedAt = Date.now();
    // One durable cover-record id per seating. Reservations reuse their
    // own id; walk-ins mint one — a SEATED reservation row is POSTed for
    // them below, so covers, turn times, and history all come from one
    // lifecycle table (the queue entry keeps only the wait metrics).
    const seatRecordId = fromWaitlist ? mintId('cov') : targetPartyId;

    // ─── Virtual-table interceptor ──────────────────────────────────
    // AI-suggested merges arrive as string ids in "i_j" format. Split
    // into the base ids, stamp a fresh groupId onto both tables
    // (mirrors the manual-merge confirmMerge handler), then continue
    // with the seating mapping below. For single-table ids this block
    // is a no-op — targetIds stays as [tableId] and no groupId mutation
    // happens.
    let targetIds = [tableId];
    let virtualGroupId = null;
    if (typeof tableId === 'string' && tableId.includes('_')) {
      targetIds = splitTableIds(tableId);
      virtualGroupId = Date.now();
    }

    setTables(prev => {
      // Resolve any EXISTING groupId for the targets so a host-driven
      // manual merge (groupId already set) still seats all members.
      // The OR with virtualGroupId picks up the new AI-driven merge
      // case. Both flows converge on the same setTables mapping.
      const allTargetIds = new Set(targetIds);
      for (const id of targetIds) {
        const t = prev.find(x => x.id === id);
        if (t?.groupId) {
          prev.forEach(other => {
            if (other.groupId === t.groupId) allTargetIds.add(other.id);
          });
        }
      }
      return prev.map(t => {
        if (!allTargetIds.has(t.id)) return t;
        const patch = { status: "seated", party: party.name, partySize: party.size, startedAt, seatedPartyId: seatRecordId };
        // Only stamp the groupId when we're actually creating a new
        // virtual merge — don't clobber an existing groupId.
        if (virtualGroupId != null && !t.groupId) patch.groupId = virtualGroupId;
        return { ...t, ...patch };
      });
    });

    if (fromWaitlist) {
      setWaitlist(prev => prev.filter(a => a.id !== targetPartyId));
      // → WaitlistEntry SEATED + seatedTime + actualWaitMinutes
      persist('/api/waitlist', 'PATCH', { id: targetPartyId, status: 'seated' });
      // → and the cover record: a SEATED reservation row born right now
      persist('/api/reservations', 'POST', {
        id: seatRecordId,
        name: party.name,
        size: party.size,
        status: 'seated',
        tableId: targetIds.length > 1 ? targetIds.join('_') : targetIds[0],
      });
    } else {
      setReservations(prev => prev.filter(r => r.id !== targetPartyId));
      // → Reservation SEATED + seatedTime (the lifecycle's "Current" state)
      persist('/api/reservations', 'PATCH', { id: targetPartyId, status: 'seated' });
    }
    scheduleServiceLogRefresh();
    const seatLabel = targetIds
      .map(id => { const t = tables.find(x => x.id === id); return t ? t.name : `T${id}`; })
      .join(' + ');
    setToastOk(isForce ? `Force-seated ${party.name} at ${seatLabel}` : `Seated ${party.name} at ${seatLabel}`);
    setSelectedPartyId(null);
    setForcedSeatSuggestion(null);
  };

  const moveParty = (source, destination) => {
    const sourceIds = source.groupId
      ? new Set(tables.filter(t => t.groupId === source.groupId).map(t => t.id))
      : new Set([source.id]);
    setTables(prev => prev.map(t => {
      if (sourceIds.has(t.id)) return { ...t, status: 'available', party: null, partySize: null, startedAt: null, groupId: null, seatedPartyId: null };
      if (t.id === destination.id) return { ...t, status: 'seated', party: source.party, partySize: source.partySize, startedAt: source.startedAt, seatedPartyId: source.seatedPartyId || null };
      return t;
    }));
    persist('/api/service-log', 'PATCH', { partyId: source.seatedPartyId, name: source.party, fromTableId: source.id, toTableId: destination.id });
    scheduleServiceLogRefresh();
    setToastOk(`Moved ${source.party} to ${destination.name}`);
  };

  // ─── Quick Walk-In — co-pilot: park in waitlist, let the seating ─
  // agent useEffect surface a suggestion, host confirms with a click.
  // ─── Server roster handlers ───────────────────────────────────────
  const addServer = (name, memberRoles = [], color = null) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const member = { id: mintId('s'), name: trimmed, onShift: false, roles: Array.isArray(memberRoles) ? memberRoles : [], color: color || null };
    setServers(prev => [...prev, member]);
    persist('/api/servers', 'POST', member);
  };
  const removeServer = (id) => {
    setServers(prev => prev.filter(s => s.id !== id));
    persist('/api/servers', 'DELETE', { id }); // soft: active=false, history keeps its references
  };
  const setServerColor = (id, color) => {
    setServers(prev => prev.map(s => s.id === id ? { ...s, color } : s));
    persist('/api/servers', 'PATCH', { id, color });
  };
  // Per-server AI opt-out: dedicated to a private room / VIP party,
  // invisible to the auto-assigner. Manual assignment stays possible,
  // and tables they hold are protected from reassignment.
  const setServerAiExcluded = (id, val) => {
    setServers(prev => prev.map(s => (s.id === id ? { ...s, aiExcluded: !!val } : s)));
    persist('/api/servers', 'PATCH', { id, aiExcluded: !!val });
  };

  const setServerRoles = (id, newRoles) => {
    const cleaned = Array.isArray(newRoles) ? newRoles : [];
    setServers(prev => prev.map(s => s.id === id ? { ...s, roles: cleaned } : s));
    persist('/api/servers', 'PATCH', { id, roles: cleaned });
  };
  const addRole = (name) => {
    const v = (name || '').trim();
    if (!v) return;
    setRoles(prev => prev.some(r => r.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]);
    // roles list itself persists via the settings autosave effect
  };
  const removeRole = (name) => {
    setRoles(prev => prev.filter(r => r !== name));
    // Strip the role from every member that carries it — computed from
    // current state so each affected member's PATCH is exact.
    const affected = servers.filter(s => (s.roles || []).includes(name));
    setServers(prev => prev.map(s => ({ ...s, roles: (s.roles || []).filter(r => r !== name) })));
    affected.forEach(s =>
      persist('/api/servers', 'PATCH', { id: s.id, roles: (s.roles || []).filter(r => r !== name) })
    );
  };

  const toggleServerShift = (id, role = 'waiter') => {
    // Per-day, per-ROLE roster toggle. A dual-role member is on shift as
    // exactly one role at a time: toggling them on in one section clears
    // the other role's entry (mutual exclusion), toggling them off in the
    // section they're on clears the shift entirely. Bartender shifts are
    // encoded as "bar:<id>" roster entries; waiter shifts as plain ids.
    writeDayStaff(rec => {
      const member = servers.find(s => s.id === id) || { id, roles: [] };
      const current = rosterShiftRole(rec.roster, member);
      const barKey = BAR_ROSTER_PREFIX + id;
      const dropSections = () => {
        for (const tid of Object.keys(rec.sections)) {
          if (rec.sections[tid] === id) delete rec.sections[tid];
        }
      };
      // Strip both encodings first; re-add what the new state needs.
      rec.roster = rec.roster.filter(x => x !== id && x !== barKey);
      if (current === role) {
        // Off shift entirely — an off-shift server can't own tables.
        dropSections();
      } else {
        rec.roster = [...rec.roster, role === 'bartender' ? barKey : id];
        // Switching to (or starting) a bartender shift frees any waiter
        // sections they held — a bartender doesn't own dining tables.
        if (role === 'bartender') dropSections();
      }
      return rec;
    });
  };

  // ─── Section Assignment handlers ──────────────────────────────────
  // Manual: while isAssignMode is on, clicking a table writes the
  // currently selected server's id into that table's assignedServerId.
  const assignTableToServer = (tableId, serverId) => {
    if (!serverId) return;
    // Sections are per-day. Assigning implies on-shift that day.
    writeDayStaff(rec => {
      const key = String(tableId);
      // Toggle: clicking a table already assigned to THIS server
      // unassigns it — same gesture, inverse action.
      if (rec.sections[key] === serverId) {
        const sections = { ...rec.sections };
        delete sections[key];
        return { ...rec, sections };
      }
      // Assigning a dining section implies a WAITER shift — clear any
      // bartender-shift entry so the two roles stay mutually exclusive.
      if (!rec.roster.includes(serverId)) {
        rec.roster = [...rec.roster.filter(x => x !== BAR_ROSTER_PREFIX + serverId), serverId];
      }
      rec.sections = { ...rec.sections, [String(tableId)]: serverId };
      return rec;
    });
  };

  // Table Details panel actions. clearTable also closes the panel,
  // since "clearing" a table generally means the host is done managing
  // it. markForBussing leaves the panel open so the host can see the
  // state change and chain into Clear when ready.
  // (Note: spec said status 'open' but the existing enum uses
  // 'available' — using 'available' for consistency with INITIAL_TABLES
  // and every existing status check across the codebase.)
  // Resolve every table that should receive the same status patch as
  // `targetId`. If the target is part of a manual or AI-suggested merge
  // (groupId set), every peer in the group is included so a Clear or
  // Mark-Bussing action atomically updates all linked tiles. Ungrouped
  // tables resolve to a single-element array — no behavioral change
  // for the common case.
  const resolveGroupTargets = (targetId) => {
    const target = tables.find(t => t.id === targetId);
    return target?.groupId
      ? tables.filter(t => t.groupId === target.groupId).map(t => t.id)
      : [targetId];
  };

  const clearTable = (id) => {
    const targetIds = resolveGroupTargets(id);
    // Close out the party record BEFORE wiping the floor state: stamps
    // finishedTime + turnMinutes on today's SEATED row — by id while the
    // session still holds it, by name + closest-seated-time match after
    // a reload. One call per party (merged groups share one record).
    const seatedOne = tables.find(x => targetIds.includes(x.id) && x.party);
    if (seatedOne) {
      persist('/api/service-log', 'POST', {
        partyId: seatedOne.seatedPartyId ?? null,
        name: seatedOne.party,
        seatedAtMs: seatedOne.startedAt ?? null,
      });
      scheduleServiceLogRefresh();
    }
    setTables(t => t.map(x => targetIds.includes(x.id) ? {
      ...x,
      status: 'available',
      party: null,
      partySize: null,
      startedAt: null,
      seatedPartyId: null,
      // groupId intentionally preserved — physical link persists across
      // status changes until the host explicitly un-merges from the panel.
    } : x));
    setSelectedTableId(null);
  };

  const markForBussing = (id) => {
    const targetIds = resolveGroupTargets(id);
    setTables(t => t.map(x => targetIds.includes(x.id) ? { ...x, status: 'bussing' } : x));
  };

  // Deterministic server-section planner (Delta rewrite). Pipeline:
  // roster split (bar → bartenders only) → room isolation (floor × zone,
  // one room per server) → shift-history cover weighting → contiguous
  // section partitioning along each room's principal axis (DP, no
  // interleaving possible) with large/small table-mix balancing. The
  // name stays handleAIAssign so the Sidebar wiring is unchanged.
  const handleAIAssign = async () => {
    if (viewingPast) { setToast('Past shifts are read-only'); return; }
    const onShift = viewServers.filter(s => s.onShift);
    if (onShift.length === 0) {
      setToast("Add and shift-on at least one server first.");
      return;
    }
    // Lock-aware filtering. Any server currently assigned to a table
    // on a manual-only floor is "locked" — they belong to that floor
    // exclusively and the auto-assigner shouldn't reassign them. Same
    // logic for the tables themselves: manual-only floors are off-
    // limits, so we strip them from the input and from the merge.
    const lockedServerIds = new Set(
      viewTables
        .filter(t => floors.find(f => f.id === t.floorId)?.isManualOnly)
        .map(t => t.assignedServerId)
        .filter(Boolean)
    );
    // Per-server AI opt-out: excluded servers never enter the pool, and
    // any table currently in their section is protected — auto-assign
    // must not strip a private-room dedication to feed other sections.
    const aiExcludedIds = new Set(viewServers.filter(s => s.aiExcluded).map(s => s.id));
    const availableServers = onShift.filter(s => !lockedServerIds.has(s.id) && !aiExcludedIds.has(s.id));
    const tablesToAssign = viewTables.filter(t =>
      !floors.find(f => f.id === t.floorId)?.isManualOnly && !t.manualOnly &&
      !(t.assignedServerId && aiExcludedIds.has(t.assignedServerId))
    );

    if (availableServers.length === 0) {
      setToast("All on-shift waiters are locked to manual-only floors. No assignment possible.");
      return;
    }
    if (tablesToAssign.length === 0) {
      setToast("All floors are manual-only — nothing to assign.");
      return;
    }

    // Shift history → server weights + expected covers. Absence (new
    // restaurant, offline) degrades to an even split — never blocks.
    let stats = null;
    try {
      const r = await fetch('/api/assigner-stats');
      if (r.ok) stats = await r.json();
    } catch (_) { /* no history — even split */ }

    const plan = buildSectionPlan(
      tablesToAssign.map(t => ({
        id: t.id, name: t.name, capacity: t.capacity,
        x: t.x, y: t.y, floorId: t.floorId || 'f1',
        area: t.area || 'dining',
      })),
      availableServers.map(s => ({
        id: s.id, name: s.name,
        // The host's per-role shift choice overrides static roles: a
        // dual-role member on shift AS a bartender enters the plan as a
        // bartender only; on shift AS a waiter they can't be promoted
        // to the bar. Single-role members are unaffected.
        roles: s.shiftRole === 'bartender'
          ? ['bartender']
          : (s.roles || []).filter(r => r !== 'bartender'),
        avgCovers: stats && stats.perServer ? stats.perServer[s.id] ?? null : null,
      })),
      floors.map(f => ({ id: f.id, name: f.name })),
      { expectedCovers: stats ? stats.expectedCovers : null },
    );
    const assignments = plan.assignments;
    // The full plan narrative — census, roster, weights, sections,
    // warnings — lands in the console for the manager's audit trail.
    console.info('[section planner]\n' + plan.notes.join('\n'));

    if (assignments.length === 0) {
      setToast("Could not compute sections — check that tables and waiters exist.");
      return;
    }

    // Merge results into table state. The non-clobbering guard stays:
    // a table is only updated if it was in tablesToAssign (i.e. not on
    // a manual-only floor) AND the assigner returned a section for it.
    // This is what keeps the auto-assigner from overwriting hand-picked
    // assignments on VIP / manual-only floors.
    const tablesToAssignIds = new Set(tablesToAssign.map(t => t.id));
    writeDayStaff(rec => {
      const sections = { ...rec.sections };
      for (const a of assignments) {
        if (tablesToAssignIds.has(a.tableId)) sections[String(a.tableId)] = a.serverId;
      }
      // Everyone the assigner used is on shift that day. Members already
      // on shift (in either role) keep their existing entry — adding a
      // plain id for someone on a bartender shift would silently flip
      // them to a waiter shift.
      const roster = [...rec.roster];
      for (const a of assignments) {
        if (!roster.includes(a.serverId) && !roster.includes(BAR_ROSTER_PREFIX + a.serverId)) {
          roster.push(a.serverId);
        }
      }
      return { roster, sections };
    });

    // Activate the section-view heatmap so the host sees every section
    // at once. Clear any single-server filter for the same reason as
    // before — the heatmap shows everyone.
    setSectionView(true);
    setViewingServerId(null);
    setToastOk(plan.toast || "Sections balanced and assigned");
  };

  // Walk-in numbers are derived from what already EXISTS today (queue,
  // today's cover records, the service log) instead of a counter that
  // reset to 1 on every reload — which minted duplicate "Walk-In #1"
  // names into permanent history. A ref keeps it monotonic in-session
  // even while the async sources are still loading.
  const lastWalkInNumRef = useRef(0);
  const nextWalkInNumber = () => {
    let max = 0;
    const scan = (name) => {
      const m = /^Walk-In #(\d+)$/.exec(String(name || ''));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    };
    waitlist.forEach(a => scan(a.name));
    reservations.forEach(r => { if ((r.date || todayStr) === todayStr) scan(r.name); });
    if (serviceLog) {
      (serviceLog.seated || []).forEach(s => scan(s.name));
      (serviceLog.history || []).forEach(h => scan(h.name));
    }
    const next = Math.max(max, lastWalkInNumRef.current) + 1;
    lastWalkInNumRef.current = next;
    return next;
  };

  const handleWalkIn = ({ size }) => {
    const generatedName = `Walk-In #${nextWalkInNumber()}`;
    const walkInParty = {
      id: mintId('walkin'),
      name: generatedName,
      size,
      type: 'walk-in',
      tag: 'Walk-in',
      addedAt: Date.now(),
      note: 'Walk-in',
    };
    // Adding to waitlist + selecting it reuses the existing AI Seating
    // Agent flow verbatim: the useEffect on selectedPartyId fires, hits
    // /api/seat, populates aiSuggestedIds (cyan pulse) + aiReason. The
    // host's click on any available table then runs attemptSeat, which
    // handles capacity checks, force-seat modal, group seating, and
    // waitlist cleanup — same as a regular waitlist party.
    setWaitlist(prev => [...prev, walkInParty]);
    persist('/api/waitlist', 'POST', walkInParty);
    setSelectedPartyId(walkInParty.id);
  };

  // Park a walk-in on the waitlist WITHOUT triggering the co-pilot.
  // Same shape as handleWalkIn's party, just no setSelectedPartyId so
  // the seating-suggestion useEffect doesn't fire.
  const sendWalkInToWaitlist = ({ size }) => {
    const generatedName = `Walk-In #${nextWalkInNumber()}`;
    const parkedParty = {
      id: mintId('walkin'),
      name: generatedName,
      size,
      type: 'walk-in',
      tag: 'Walk-in',
      addedAt: Date.now(),
      note: 'Walk-in',
    };
    setWaitlist(prev => [...prev, parkedParty]);
    persist('/api/waitlist', 'POST', parkedParty);
  };

  // From the Waitlist tab: seat a party via the existing co-pilot.
  // Switching tabs + selecting the party id is enough — the existing
  // /api/seat useEffect picks up the selection change and surfaces the
  // cyan pulse on the suggested table. When the host clicks that
  // table, performSeat removes the party from waitlist via the
  // setWaitlist(filter) call already in place.
  const seatFromWaitlist = (partyId) => {
    // Don't stack a second seating on top of a live table pick.
    if (reassignReservationId) {
      setToast('Finish assigning the reservation first — pick a table, or click empty floor to cancel');
      return;
    }
    setActiveTab('floor');
    setSelectedPartyId(partyId);
    // Seating is a live-op: if the host was time-traveling, snap back.
    setViewDate(new Date());
  };

  // Destructive deletes are gated behind ConfirmDialog. The hover 'x'
  // calls requestDelete(...) which stages the target; the dialog's
  // confirm runs the actual array filter.
  const doDeleteReservation = (id) => {
    setReservations(prev => prev.filter(x => x.id !== id));
    persist('/api/reservations', 'DELETE', { id }); // soft: → CANCELLED (predictor data)
    scheduleServiceLogRefresh(); // cancellations land in service history
  };
  const doDeleteWaitlist = (id) => {
    setWaitlist(prev => prev.filter(x => x.id !== id));
    persist('/api/waitlist', 'DELETE', { id }); // soft: → LEFT (walk-away signal)
    scheduleServiceLogRefresh(); // walk-aways land in service history
  };
  const requestDelete = (kind, id) => {
    const item = kind === 'reservation'
      ? reservations.find(r => r.id === id)
      : waitlist.find(w => w.id === id);
    // Past bookings are read-only history — the predictor's data. A row
    // with no explicit date belongs to whatever day it was rendered from
    // (viewDateStr), so fall back to that, never silently to today.
    const itemDate = (item && item.date) || viewDateStr;
    if (item && itemDate < todayStr) {
      setToast('Past reservations are read-only and cannot be changed');
      return;
    }
    setConfirmDelete({ kind, id, name: (item && item.name) || (kind === 'reservation' ? 'this reservation' : 'this party') });
  };

  // Reassign (or unassign) a reservation to a different table without
  // leaving the panel. The 'unassigned' sentinel from the dropdown
  // becomes null in state; numeric ids get Number()-coerced so the
  // resulting tableId matches the seed/table.id integer type. Any
  // downstream lookup that joins reservations to tables (the
  // TableDetailsPanel Schedule, the floor's digital clock badge, the
  // /api/seat reservation-conflict filter) re-renders automatically
  // from this single state mutation.
  // ── Database persistence (Prisma via /api routes) ──────────────────
  // Fire-and-forget write-through: state updates stay optimistic and
  // instant — the host stand never waits on the network — while the API
  // call persists in the background. If the DB is unreachable the app
  // keeps running on in-memory state; writes just don't stick.
  // Failed writes surface to the HOST, not just the console: an
  // optimistic UI with silent write failures diverges from the database
  // until the next reload quietly loses the change. Throttled so a burst
  // of debounced retries doesn't stack banners.
  const lastPersistToastRef = useRef(0);
  const persistFailed = useCallback((detail) => {
    const nowMs = Date.now();
    if (nowMs - lastPersistToastRef.current < 5000) return;
    lastPersistToastRef.current = nowMs;
    setToast(`A change didn't save (${detail}) — check the connection; it may revert on reload`);
  }, [setToast]);
  const persist = useCallback((url, method, body) => {
    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      // keepalive: browsers abort in-flight fetches on navigation — a
      // write racing a reload (seat → immediate refresh) was silently
      // discarded. keepalive lets the request complete through unload/reload.
      keepalive: true,
      body: JSON.stringify(body),
    }).then(r => {
      if (!r.ok) {
        console.warn(`[persist] ${method} ${url} → HTTP ${r.status}`);
        // 4xx guard responses (past-day writes etc.) already toast at the
        // call site with a specific message; only transport/5xx surface.
        if (r.status >= 500) persistFailed(`${method} ${url.split('/').pop()}`);
      }
    })
      .catch(err => { console.warn(`[persist] ${method} ${url} failed:`, err); persistFailed(`${method} ${url.split('/').pop()}`); });
  }, [persistFailed]);

  // ── Per-service-day staff store ─────────────────────────────────────
  // { [dateKey]: { roster: serverId[], sections: { [tableId]: serverId } } }
  // The roster (who's on shift) and sections (table→server) are per-day,
  // not global — so today's staffing never bleeds into other days. The
  // viewed day's record is loaded on demand; a day never touched is
  // simply absent (empty default).
  const [dayStaff, setDayStaff] = useState({});
  const dayStaffReady = useRef(false);
  const dayStaffTimer = useRef(null);
  const pendingDayStaffRef = useRef(null);

  // Load a day's record if not already cached.
  const loadDayStaff = useCallback((dateKey) => {
    fetch(`/api/service-day?date=${dateKey}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return;
        setDayStaff(prev => ({ ...prev, [dateKey]: { roster: d.roster || [], sections: d.sections || {} } }));
      })
      .catch(() => {});
  }, []);
  // Whenever the viewed day changes, ensure its record is loaded.
  useEffect(() => {
    if (dayStaff[viewDateStr] === undefined) loadDayStaff(viewDateStr);
  }, [viewDateStr, dayStaff, loadDayStaff]);

  // The viewed day's record (empty default).
  const viewRecord = dayStaff[viewDateStr] || { roster: [], sections: {} };

  // Servers as seen ON THE VIEWED DAY: onShift overlaid from that day's
  // roster (not the global flag). Base identity (name, color, roles)
  // stays global; only the shift status is per-day.
  const viewServers = useMemo(
    () => servers.map(s => {
      const shiftRole = rosterShiftRole(viewRecord.roster, s);
      return { ...s, onShift: shiftRole !== null, shiftRole };
    }),
    [servers, viewRecord.roster]
  );
  // Tables as seen ON THE VIEWED DAY: assignedServerId overlaid from that
  // day's section map. Live occupancy fields stay as-is (already date-
  // gated elsewhere).
  const viewTables = useMemo(
    () => tables.map(t => ({ ...t, assignedServerId: viewRecord.sections[String(t.id)] ?? null })),
    [tables, viewRecord.sections]
  );

  // Mutating the viewed day's record. Past days are read-only. Writes
  // debounce into one PUT for that day.
  const editable = !viewingPast;
  const writeDayStaff = useCallback((mutator) => {
    if (viewingPast) { setToast('Past shifts are read-only'); return; }
    setDayStaff(prev => {
      const cur = prev[viewDateStr] || { roster: [], sections: {} };
      const next = mutator({ roster: [...cur.roster], sections: { ...cur.sections } });
      const updated = { ...prev, [viewDateStr]: next };
      if (dayStaffTimer.current) clearTimeout(dayStaffTimer.current);
      const dateForSave = viewDateStr;
      const recordForSave = next;
      pendingDayStaffRef.current = { date: dateForSave, roster: recordForSave.roster, sections: recordForSave.sections };
      dayStaffTimer.current = setTimeout(() => {
        pendingDayStaffRef.current = null;
        persist('/api/service-day', 'PUT', { date: dateForSave, roster: recordForSave.roster, sections: recordForSave.sections });
      }, 500);
      return updated;
    });
  }, [viewDateStr, viewingPast, persist]);

  // Hydrate the book + waitlist from the database on mount. On success
  // the hardcoded seed arrays are replaced with real rows (so creating a
  // reservation, reloading, and seeing it again Just Works); on failure
  // the seeds remain and the app demos exactly as before.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [resR, wlR, floorR, srvR, setR] = await Promise.all([
          fetch('/api/reservations'),
          fetch('/api/waitlist'),
          fetch('/api/floor'),
          fetch('/api/servers'),
          fetch('/api/settings'),
        ]);
        if ([resR, wlR, floorR, srvR, setR].some((response) => response.status === 401)) {
          window.location.replace(hostMode ? '/login?host=1' : '/login');
          return;
        }
        if (!resR.ok || !wlR.ok) throw new Error(`HTTP ${resR.status}/${wlR.status}`);
        const resData = await resR.json();
        const wlData = await wlR.json();
        if (cancelled) return;
        if (Array.isArray(resData.reservations)) setReservations(resData.reservations);
        if (Array.isArray(wlData.waitlist)) setWaitlist(wlData.waitlist);

        // Floor layout — only replaces the built-in default once a
        // layout has actually been saved (empty DB = pre-first-save).
        if (floorR.ok) {
          const f = await floorR.json();
          if (Array.isArray(f.tables) && f.tables.length > 0) {
            // The route already applies the daily-reset rule: stale live
            // state (previous service day) arrives pre-cleaned, fresh
            // state arrives intact — occupied, bussing, merges, sections.
            setTables(f.tables.map(t => ({
              ...t,
              status: t.status || 'available',
              party: t.party ?? null,
              partySize: t.partySize ?? null,
              startedAt: t.startedAt ?? null,
              groupId: t.groupId != null ? Number(t.groupId) : null,
              assignedServerId: t.assignedServerId ?? null,
            })));
          }
          if (Array.isArray(f.floors) && f.floors.length > 0) {
            setFloors(f.floors);
            setActiveFloorId(prev => f.floors.some(x => x.id === prev) ? prev : f.floors[0].id);
          }
        }

        // Staff roster.
        if (srvR.ok) {
          const s = await srvR.json();
          if (Array.isArray(s.servers) && s.servers.length > 0) setServers(s.servers);
        }

        // Seamless migration: seed TODAY's per-day staff record from the
        // roster/sections we just hydrated, unless the day already has a
        // saved record. Runs once on mount.
        try {
          const tk = formatDateKey(new Date());
          const sdR = await fetch(`/api/service-day?date=${tk}`);
          if (sdR.ok) {
            const sd = await sdR.json();
            if (!sd.exists) {
              // Migration source = the roster/sections we just hydrated
              // from the global records (in scope as `s` and `f`).
              const roster = (srvR.ok && Array.isArray(s.servers) ? s.servers : [])
                .filter(x => x.onShift).map(x => x.id);
              const sections = {};
              if (floorR.ok && Array.isArray(f.tables)) {
                f.tables.forEach(t => {
                  if (t.assignedServerId) sections[String(t.id)] = t.assignedServerId;
                });
              }
              if (!cancelled) {
                setDayStaff(prev => ({ ...prev, [tk]: { roster, sections } }));
                persist('/api/service-day', 'PUT', { date: tk, roster, sections });
              }
            } else if (!cancelled) {
              setDayStaff(prev => ({ ...prev, [tk]: { roster: sd.roster || [], sections: sd.sections || {} } }));
            }
          }
        } catch (_) { /* migration best-effort */ }

        // Settings (null until the first save — keep defaults then).
        if (setR.ok) {
          const st = (await setR.json()).settings;
          if (st) {
            if (st.restaurantHours) setRestaurantHours(st.restaurantHours);
            if (Array.isArray(st.roles) && st.roles.length > 0) setRoles(st.roles);
            if (st.prefs) setPrefs(p => ({ ...p, ...st.prefs }));
          }
        }

        setDbOffline(false);
      } catch (err) {
        console.warn('[hydrate] DB unavailable — falling back to in-memory seed data.', err);
        setDbOffline(true);
        setReservations(INITIAL_RESERVATIONS);
        setWaitlist(INITIAL_WAITLIST);
      } finally {
        // Open the autosave gate AFTER hydration applied (or failed) —
        // never before, or defaults would clobber stored settings.
        if (!cancelled) { settingsReady.current = true; liveReady.current = true; setHydrated(true); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Self-diagnosis ──────────────────────────────────────────────────
  // Every "not saving" incident so far traced to a deploy gap (unplaced
  // file, unrun migration, stale client) found via terminal probes. The
  // app now reports those gaps itself: /api/health checks the DB and the
  // live-state columns; anything missing renders an instruction banner.
  const [healthIssue, setHealthIssue] = useState(null);
  // ── Service log (today's journal) ───────────────────────────────────
  // Source of truth for the header covers counter, the floor's right
  // rail, and the Service tab. Refreshed on load and ~1.2s after any
  // mutation that changes it (seat / clear / cancel) — after the
  // persists land. No polling at single-host scale.
  const [serviceLog, setServiceLog] = useState(null);
  const loadServiceLog = useCallback(() => {
    // The journal follows the VIEWED day: time-travel to Friday and the
    // log (and covers counter) shows Friday. viewDateStr in the deps
    // makes the mount effect refire on every calendar jump.
    fetch(`/api/service-log?date=${viewDateStr}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && d.covers) setServiceLog(d); })
      .catch(() => {});
  }, [viewDateStr]);
  const openSeatedTable = useCallback((p) => {
    // A tap on a seated party jumps to its table's live panel (clear /
    // mark bussing / details). Live panels are a today-op, so the view
    // snaps back if the host was time-traveling.
    if (!p || p.tableId == null) return;
    const primary = Number(String(p.tableId).split('_')[0]);
    if (!Number.isFinite(primary)) return;
    setViewDate(new Date());
    setActiveTab('floor');
    setSelectedReservationId(null);
    setSelectedTableId(primary);
  }, []);
  const serviceLogTimer = useRef(null);
  const scheduleServiceLogRefresh = useCallback(() => {
    if (serviceLogTimer.current) clearTimeout(serviceLogTimer.current);
    serviceLogTimer.current = setTimeout(loadServiceLog, 1200);
  }, [loadServiceLog]);
  useEffect(() => { loadServiceLog(); }, [loadServiceLog]);
  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(h => {
        if (!h.db) setHealthIssue('Database unreachable — check DATABASE_URL and Neon status');
        else if (!h.liveState) setHealthIssue('Floor-state migration missing — stop the dev server, run: npx prisma migrate dev, then npm run dev');
        else if (!h.settings) setHealthIssue('Settings migration missing — stop the dev server, run: npx prisma migrate dev, then npm run dev');
        else if (!h.serviceDay) setHealthIssue('Per-day staff migration missing — sections/rosters won\u2019t save. Stop the dev server, run: npx prisma migrate dev --name service_day_staff, then npm run dev');
        else setHealthIssue(null);
      })
      .catch(() => { /* total API failure is already covered by the offline banner */ });
  }, []);

  // ── Layout snapshot save ────────────────────────────────────────────
  // An editing session commits when the editor closes: on the editMode
  // true→false transition, the whole layout (floors + tables, layout
  // fields only) PUTs as one snapshot. Every exit path funnels through
  // this state change, so no per-tool hooks are needed.
  // Recovery: clears all live table state and finishes lingering SEATED
  // parties (server-side), then re-hydrates the floor + service log.
  // Fixes tables stuck from a mid-edit reload and parties orphaned in the
  // log before the close-out hook existed.
  const resetLiveFloor = useCallback(async () => {
    try {
      await fetch('/api/floor/reset', { method: 'POST' });
      // Re-pull the floor so cleared statuses/ids land in state.
      const fr = await fetch('/api/floor');
      if (fr.ok) {
        const f = await fr.json();
        if (Array.isArray(f.tables) && f.tables.length > 0) {
          setTables(f.tables.map(t => ({
            ...t,
            status: t.status || 'available',
            party: t.party ?? null,
            partySize: t.partySize ?? null,
            startedAt: t.startedAt ?? null,
            groupId: t.groupId != null ? Number(t.groupId) : null,
            assignedServerId: t.assignedServerId ?? null,
          })));
        }
      }
      loadServiceLog();
      setToastOk('Live floor reset — seated parties moved to history');
    } catch (_) {
      setToast('Reset failed — check the connection');
    }
  }, [loadServiceLog]);

  const prevEditMode = useRef(false);
  useEffect(() => {
    if (prevEditMode.current && !editMode) {
      persist('/api/floor', 'PUT', {
        floors,
        tables: tables.map(t => ({
          id: t.id, name: t.name, x: t.x, y: t.y, capacity: t.capacity,
          shape: t.shape, area: t.area, rotation: t.rotation || 0, manualOnly: !!t.manualOnly, onlineExcluded: !!t.onlineExcluded, floorId: t.floorId,
        })),
      });
      // Leaving edit mode ratifies a pending migration (Keep).
      setMigrationBackup(null);
    }
    prevEditMode.current = editMode;
  }, [editMode, floors, tables, persist]);

  // ── Edit-mode layout autosave ───────────────────────────────────────
  // The migration flow parks the user IN edit mode (Keep/Cancel), so
  // exit-only persistence would lose everything on a reload mid-edit.
  // Debounced write-through keeps the DB ≤1s behind the canvas; the
  // exit PUT above remains the immediate final save. Cancel Migration
  // stays correct: it PUTs the snapshot, overwriting any autosaves.
  useEffect(() => {
    if (!editMode) return;
    const timer = setTimeout(() => {
      persist('/api/floor', 'PUT', {
        floors,
        tables: tables.map(t => ({
          id: t.id, name: t.name, x: t.x, y: t.y, capacity: t.capacity,
          shape: t.shape, area: t.area, rotation: t.rotation || 0, manualOnly: !!t.manualOnly, onlineExcluded: !!t.onlineExcluded, floorId: t.floorId,
        })),
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [editMode, floors, tables, persist]);

  // ── Settings autosave ───────────────────────────────────────────────
  // Debounced write-through for hours + roles + the preference pile.
  // pendingSettingsRef holds the not-yet-sent payload so the unload
  // flush can fire it — without this, a change made <600ms before a
  // close/reload was silently lost.
  const pendingSettingsRef = useRef(null);
  useEffect(() => {
    if (!settingsReady.current) return;
    pendingSettingsRef.current = { restaurantHours, roles, prefs };
    const t = setTimeout(() => {
      pendingSettingsRef.current = null;
      persist('/api/settings', 'PUT', { restaurantHours, roles, prefs });
    }, 600);
    return () => clearTimeout(t);
  }, [restaurantHours, roles, prefs, persist]);

  // ── Live floor-state snapshot ───────────────────────────────────────
  // Occupied, bussing, merged, and section states survive reloads: any
  // change to the tables' live fields (outside a layout-editing session)
  // debounces into one PATCH. Same snapshot philosophy as the layout
  // save, just continuous — the floor you see is the floor you get back.
  useEffect(() => {
    if (!liveReady.current || editMode) return;
    const timer = setTimeout(() => {
      persist('/api/floor', 'PATCH', {
        tables: tables.map(t => ({
          id: t.id,
          status: t.status,
          party: t.party ?? null,
          partySize: t.partySize ?? null,
          startedAt: t.startedAt ?? null,
          groupId: t.groupId ?? null,
          assignedServerId: t.assignedServerId ?? null,
        })),
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [tables, editMode, persist]);

  // ── Unload flush ────────────────────────────────────────────────────
  // The debounce alone loses the LAST action before a reload/close. The
  // moment the tab hides or unloads, the live snapshot fires immediately
  // (keepalive carries it through). tablesRef keeps the listener stable
  // while always flushing current state.
  const tablesRef = useRef(tables);
  useEffect(() => { tablesRef.current = tables; }, [tables]);
  const floorsRef = useRef(floors);
  useEffect(() => { floorsRef.current = floors; }, [floors]);
  const editModeRef = useRef(editMode);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);
  useEffect(() => {
    const flush = () => {
      if (!liveReady.current) return;
      // NOTE: try/catch cannot catch a rejected fetch promise — every
      // fetch here carries .catch so a dev-server restart or dropped
      // connection during unload never surfaces as unhandledRejection.
      fetch('/api/floor', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          tables: tablesRef.current.map(t => ({
            id: t.id,
            status: t.status,
            party: t.party ?? null,
            partySize: t.partySize ?? null,
            startedAt: t.startedAt ?? null,
            groupId: t.groupId ?? null,
            assignedServerId: t.assignedServerId ?? null,
          })),
        }),
      }).catch(() => { /* last-gasp best effort */ });
      // Mid-edit reload safety: the debounced layout autosave may not
      // have fired yet — flush the full layout too while editing.
      if (editModeRef.current) {
        fetch('/api/floor', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            floors: floorsRef.current,
            tables: tablesRef.current.map(t => ({
              id: t.id, name: t.name, x: t.x, y: t.y, capacity: t.capacity,
              shape: t.shape, area: t.area, rotation: t.rotation || 0, manualOnly: !!t.manualOnly, onlineExcluded: !!t.onlineExcluded, floorId: t.floorId,
            })),
          }),
        }).catch(() => { /* last-gasp best effort */ });
      }
      // Debounced writes that haven't fired yet: send them NOW with
      // keepalive, or the last settings tweak / shift toggle before a
      // close-reload evaporates.
      if (pendingSettingsRef.current) {
        fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify(pendingSettingsRef.current) }).catch(() => {});
        pendingSettingsRef.current = null;
      }
      if (pendingDayStaffRef.current) {
        fetch('/api/service-day', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify(pendingDayStaffRef.current) }).catch(() => {});
        pendingDayStaffRef.current = null;
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // ── Daily floor reset (client side of the boundary rule) ────────────
  // Live state is per-service-day: one hour before opening, the floor
  // resets to clean. The server enforces this lazily on every GET; this
  // effect covers a host stand left RUNNING across the boundary.
  //
  // Crossing semantics matter: fire ONLY when the clock itself passes
  // the tick between renders (prev < boundary <= now). Comparing
  // boundary VALUES across renders — the previous implementation — also
  // fired when settings hydration changed the opening time (recomputing
  // the boundary from the 4:00 AM default to open−1h), which falsely
  // wiped the floor on every reload after mid-afternoon and then
  // persisted the wipe, masquerading as "live state doesn't save".
  const lastNowRef = useRef(null);
  useEffect(() => {
    const boundary = latestServiceResetBoundary(now, restaurantHours ? restaurantHours.open : null, restaurantHours ? restaurantHours.close : null);
    const prev = lastNowRef.current;
    lastNowRef.current = now;
    if (prev == null) return;
    if (prev < boundary && now >= boundary) {
      setTables(prevTables => prevTables.map(t => ({
        ...t, status: 'available', party: null, partySize: null,
        startedAt: null, groupId: null, assignedServerId: null,
      })));
      // Anyone still in the queue at close+90 walked out — the waitlist
      // route marks them LEFT in the DB on its next read; this clears
      // the live session's copy so they don't sit in the rail forever.
      setWaitlist([]);
      setToastOk('Floor reset for the new service day');
    }
  }, [now, restaurantHours]);

  const updateReservation = (id, patch) => {
    setReservations(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    setWaitlist(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    // The id belongs to exactly one store; the other endpoint answers
    // with a 200 no-op (routes treat unknown ids as not-my-record).
    persist('/api/reservations', 'PATCH', { id, ...patch });
    persist('/api/waitlist', 'PATCH', { id, ...patch });
  };

  const updateReservationTable = (id, newTableId) => {
    // Preserve id type — Number('t16') is NaN and Number('8_9') is NaN;
    // both corrupted the booking's assignment when set through here.
    const tableId = newTableId === 'unassigned'
      ? null
      : (/^\d+$/.test(String(newTableId)) ? Number(newTableId) : String(newTableId));
    setReservations(prev => prev.map(r =>
      r.id === id ? { ...r, tableId } : r
    ));
    persist('/api/reservations', 'PATCH', { id, tableId });
  };

  // Multi-table reservation assignment. Stamps the joined "i_j_k"
  // string id on the reservation so the digital clock badges surface
  // on every base table's tile (via the split-aware filter in
  // FloorMap). Crucially does NOT stamp a shared groupId — the tables
  // stay physically independent until a party is ACTUALLY seated
  // (performSeat handles the groupId stamp at that point). This lets
  // the host walk in a small party and seat them at one of the
  // reservation-targeted tables before the large party arrives.
  //
  // Single-target calls (targetIds.length === 1) take the bare
  // numeric id path; the existingGroupId param is now unused here but
  // kept in the signature to avoid a wider callsite refactor — the
  // intercept passes it but the handler ignores it.
  const assignReservationToTables = (reservationId, targetIds /* existingGroupId */) => {
    if (targetIds.length === 0) return;

    // Look up reservation BEFORE mutating state so the toast pulls
    // the canonical pre-assignment view (name, time, date). Pulling
    // from Home-level `reservations` (full state) rather than any
    // filtered FloorMap prop ensures future-dated reservations
    // resolve correctly here even when the floor only sees today's.
    const r = reservations.find(x => x.id === reservationId);

    if (targetIds.length === 1) {
      // Single table — no group mutation. Type-PRESERVING id handling
      // (same rule as splitTableIds): legacy seed ids are numeric, but
      // migrated tables carry "t83"-style string ids — Number("t83") is
      // NaN, which JSON-serializes to null and silently destroyed the
      // reservation↔table linkage (no time badge, unassigned on reload).
      const single = targetIds[0];
      const singleId = typeof single === 'number'
        ? single
        : (/^\d+$/.test(String(single)) ? Number(single) : String(single));
      setReservations(prev => prev.map(r =>
        r.id === reservationId ? { ...r, tableId: singleId } : r
      ));
      persist('/api/reservations', 'PATCH', { id: reservationId, tableId: singleId });
    } else {
      // Multi-table — joined string id on the reservation, but NO
      // groupId stamp on the tables. They become physically linked
      // only when performSeat fires at actual seating time.
      const joinedId = targetIds.join('_');
      setReservations(prev => prev.map(r =>
        r.id === reservationId ? { ...r, tableId: joinedId } : r
      ));
      persist('/api/reservations', 'PATCH', { id: reservationId, tableId: joinedId });
    }

    // ─── Confirmation toast ──────────────────────────────────────
    // Format: "Confirmed: <name> at <table names joined> on <date> @ <time>".
    // Table names come from joining each targetId's `name` field —
    // for a single id that's just "T4", for merges it's "T4 + T5".
    // The .filter(Boolean) guards against a stale id that doesn't
    // match any current table (shouldn't happen, but defensive).
    if (r) {
      const tableNames = targetIds
        .map(id => tables.find(t => t.id === id)?.name)
        .filter(Boolean)
        .join(' + ');
      const resDate = r.date || todayStr;
      setToastOk(`Confirmed: ${r.name} at ${tableNames} on ${resDate} @ ${r.time}`);
    }
  };

  // ─── Manual Merge / Un-merge ─────────────────────────────────────
  // confirmMerge stamps a shared groupId onto every selected table,
  // turning N standalone tables into one group. The capacity-summing
  // and turn-time penalty already in remainingMin pick up groupId
  // automatically, so the rest of the floor logic doesn't need to
  // know that a merge happened. <2 selections is a no-op exit (the
  // host clicked Confirm without picking a second table — just bail).
  const confirmMerge = () => {
    if (mergeSelection.length < 2) { setMergeMode(false); return; }
    // Safety net for the adjacency rule — deselecting a middle table can
    // split an incrementally-valid selection into disconnected pieces.
    // The Confirm button is disabled in that state too; this guard covers
    // any other route in.
    if (!isSelectionContiguous(mergeSelection, tables)) return;
    const members = tables.filter(t => mergeSelection.includes(t.id));
    const names = members.map(t => t.name).join(' + ');

    // ── Merge-and-assign (reservation flow) ──────────────────────────
    // NO physical groupId stamp here: the booking may be for another
    // day, and physically fusing today's floor for a future reservation
    // would misrepresent the room. The reservation stores the joined
    // "i_j" id; today's tables stay independent (free to seat or merge
    // for other parties); the physical merge materializes on the
    // reservation's own day, at seating time, via performSeat's
    // virtual-id splitter. assignReservationToTables raises its own
    // "Confirmed: <name> at T4 + T5 on <date>" toast.
    if (reassignReservationId) {
      assignReservationToTables(reassignReservationId, mergeSelection);
      setReassignReservationId(null);
      setMergeMode(false);
      setMergeSelection([]);
      return;
    }

    // Physical merge — the tables fuse NOW (host-driven layout change
    // or a party being seated this moment).
    const newGroupId = Date.now();
    setTables(prev => prev.map(t =>
      mergeSelection.includes(t.id) ? { ...t, groupId: newGroupId } : t
    ));
    setMergeMode(false);
    setMergeSelection([]);

    // ── Merge-and-seat ────────────────────────────────────────────────
    // If merge mode was entered mid-seating (the banner's "Merge table &
    // seat party"), finish the job: the party lands on the fresh merge
    // without a second tap. The virtual "i_j" id routes through
    // performSeat, whose functional setTables update chains after the
    // groupId stamp above, so the whole group seats together. Capacity
    // is checked against the combined group; overflow raises the same
    // force-seat dialog as a normal too-small table.
    if (selectedPartyId) {
      const party =
        waitlist.find(a => a.id === selectedPartyId) ||
        reservations.find(r => r.id === selectedPartyId);
      if (party) {
        const virtualId = mergeSelection.join('_');
        const combined = members.reduce((s, t) => s + t.capacity, 0);
        if (combined >= party.size) performSeat(virtualId, false);
        else setForceSeatTarget(virtualId);
        return;
      }
    }
    setToastOk(`Merged ${names}`);
  };

  // unmergeTable strips groupId from every table that shares the
  // given group. Called from the TableDetailsPanel after the host
  // clears a merged table — the panel closes (selectedTableId → null)
  // so the host sees the now-individual tables on the floor.
  const unmergeTable = (groupId) => {
    // Guard: an occupied merge stays fused until the party leaves.
    // Bussing or cleared tables can split; seated/dining cannot. The
    // panel already hides the button in that state — this covers any
    // other route in.
    const occupied = tables.some(t =>
      t.groupId === groupId && (t.status === 'seated' || t.status === 'dining')
    );
    if (occupied) return;
    setTables(prev => prev.map(t =>
      t.groupId === groupId ? { ...t, groupId: null } : t
    ));
    setSelectedTableId(null);
  };

  return (
    <div className="h-screen bg-bg text-ink-50 flex flex-col overflow-hidden">
      {!hydrated && (
        <div className="fixed inset-0 z-[100] bg-bg flex flex-col items-center justify-center gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-border-hi border-t-ai animate-spin"></div>
          <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-400">Loading floor…</div>
        </div>
      )}
      <Header now={now} activeTab={activeTab} setActiveTab={setActiveTab} occupancy={occupancy} coversToday={serviceLog ? serviceLog.covers.total : null} onOpenService={() => setActiveTab('service')} hostMode={hostMode} />
      <div className="flex-1 flex overflow-hidden min-h-0">
        {editMode && activeTab === "floor" ? (
          <TableCreatorSidebar
            addTable={addTable}
            activeFloorName={floors.find(f => f.id === activeFloorId)?.name || 'Floor'}
            tableCount={tables.filter(t => t.floorId === activeFloorId).length}
          />
        ) : (
        <Sidebar waitlist={waitlist} reservations={viewDateReservations} selectedPartyId={selectedPartyId} setSelectedPartyId={setSelectedPartyId} selectedReservationId={selectedReservationId} setSelectedReservationId={(id) => { if (id) setSelectedTableId(null); setSelectedReservationId(id); }} deleteReservation={(id) => requestDelete('reservation', id)} deleteWaitlistItem={(id) => requestDelete('waitlist', id)} openModal={() => {
          if (viewingPast) { setToast('Cannot make reservations or seat walk-ins on past days'); return; }
          if (blockIfPending()) return; // a table pick is already in flight
          setModalOpen(true);
        }} openWalkIn={() => {
          if (viewingPast) { setToast('Cannot make reservations or seat walk-ins on past days'); return; }
          if (viewingFuture) { setToast('Walk-ins can only be seated on the current day'); return; }
          if (blockIfPending()) return; // a table pick is already in flight
          setWalkInModalOpen(true);
        }} reservationsDisabled={viewingPast} walkInDisabled={viewingPast || viewingFuture} now={now} aiReason={aiReason} servers={viewServers} staffReadOnly={viewingPast} onPartyDragStart={onPartyDragStart} onPartyDragEnd={onPartyDragEnd} onPartyTouchStart={beginPartyTouchDrag} partyRowsDraggable={!coarsePointer} addServer={addServer} toggleServerShift={toggleServerShift} setServerAiExcluded={setServerAiExcluded} isAssignMode={isAssignMode} setIsAssignMode={setIsAssignMode} assignSelectedServer={assignSelectedServer} setAssignSelectedServer={setAssignSelectedServer} handleAIAssign={handleAIAssign} aiAssignLoading={aiAssignLoading} setEditMode={setEditMode} setMergeMode={setMergeMode} setMergeSelection={setMergeSelection} setViewingServerId={setViewingServerId} sectionView={sectionView} setSectionView={setSectionView} />
        )}
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeTab === "floor" && (<div className="flex-1 flex overflow-hidden min-h-0 relative"><FloorMap hostMode={hostMode} serviceLogOpen={hostServiceLogOpen} onToggleServiceLog={() => setHostServiceLogOpen(v => !v)} hydrated={hydrated} onSeatPartyDrop={onSeatPartyDrop} tables={viewTables} selectedTableId={selectedTableId} setSelectedTableId={setSelectedTableId} setSelectedReservationId={setSelectedReservationId} selectedPartyId={selectedPartyId} setSelectedPartyId={setSelectedPartyId} waitlist={waitlist} reservations={viewDateReservations} allReservations={reservations} viewDate={viewDate} setViewDate={setViewDate} editMode={editMode} setEditMode={setEditMode} mergeMode={mergeMode} setMergeMode={setMergeMode} mergeSelection={mergeSelection} setMergeSelection={setMergeSelection} newCapacity={newCapacity} setNewCapacity={setNewCapacity} addTable={addTable} deleteTable={deleteTable} rotateTable={rotateTable} renameTable={renameTable} setTableCapacity={setTableCapacity} setTableShape={setTableShape} setTableArea={setTableArea} renameFloor={renameFloor} reorderFloors={reorderFloors} toggleTableManualOnly={toggleTableManualOnly} toggleTableOnlineExcluded={toggleTableOnlineExcluded} toggleFloorManualOnly={toggleFloorManualOnly} toggleFloorOnlineExcluded={toggleFloorOnlineExcluded} setFloorTablesManualOnly={setFloorTablesManualOnly} setFloorTablesOnlineExcluded={setFloorTablesOnlineExcluded} addFloor={addFloor} undo={undo} canUndo={editHistory.length > 0} dragState={dragState} setDragState={setDragState} moveSourceId={moveSourceId} setMoveSourceId={setMoveSourceId} attemptSeat={attemptSeat} clearTable={clearTable} moveParty={moveParty} now={now} aiSuggestedIds={aiSuggestedIds} aiSuggestedRawId={aiSuggestedRawId} servers={viewServers} isAssignMode={isAssignMode} assignSelectedServer={assignSelectedServer} assignTableToServer={assignTableToServer} setIsAssignMode={setIsAssignMode} setAssignSelectedServer={setAssignSelectedServer} viewingServerId={viewingServerId} setViewingServerId={setViewingServerId} sectionView={sectionView} setSectionView={setSectionView} newTableShape={newTableShape} setNewTableShape={setNewTableShape} newTableArea={newTableArea} setNewTableArea={setNewTableArea} reassignReservationId={reassignReservationId} setReassignReservationId={setReassignReservationId} updateReservationTable={updateReservationTable} assignReservationToTables={assignReservationToTables} onAssignConflictPrompt={(p) => setAssignOverride(p)} floors={floors} setFloors={setFloors} activeFloorId={activeFloorId} setActiveFloorId={setActiveFloorId} isAddingFloor={isAddingFloor} setIsAddingFloor={setIsAddingFloor} newFloorName={newFloorName} setNewFloorName={setNewFloorName} underlay={floorUnderlays[activeFloorId] || null} showUnderlay={showUnderlay} setShowUnderlay={setShowUnderlay} migrationActive={!!migrationBackup} onCancelMigration={cancelFloorMigration} deleteFloor={deleteFloor} />{!editMode && (((selectedPartyId || reassignReservationId) && !mergeMode)
            ? <SeatingAssistRail aiThinking={aiThinking} selectedPartyId={selectedPartyId} reassignReservationId={reassignReservationId} reservations={reservations} waitlist={waitlist} tables={tables} aiSuggestedIds={aiSuggestedIds} onMerge={() => { setMergeMode(true); setMergeSelection([]); }} onCancel={() => { setSelectedPartyId(null); setReassignReservationId(null); }} />
            : (hostMode ? (hostServiceLogOpen && <ServiceRail overlay serviceLog={serviceLog} now={now} onOpenTable={openSeatedTable} onClose={() => setHostServiceLogOpen(false)} dateLabel={viewDateStr === todayStr ? null : formatDateHuman(viewDateStr)} />) : <ServiceRail serviceLog={serviceLog} now={now} onOpenTable={openSeatedTable} dateLabel={viewDateStr === todayStr ? null : formatDateHuman(viewDateStr)} />))}</div>)}
          {activeTab === "service" && <ServiceView serviceLog={serviceLog} now={now} onRefresh={loadServiceLog} onOpenTable={openSeatedTable} dateLabel={viewDateStr === todayStr ? null : formatDateHuman(viewDateStr)} />}
          {activeTab === "timeline" && <TimelineView reservations={todaysReservations} restaurantHours={restaurantHours} onSelectReservation={(id) => { if (id) setSelectedTableId(null); setSelectedReservationId(id); }} />}
          {activeTab === "waitlist" && <WaitlistView waitlist={waitlist} reservations={todaysReservations} now={now} onSeatParty={seatFromWaitlist} onOpenReservation={(id) => { if (id) setSelectedTableId(null); setSelectedReservationId(id); }} onDeleteParty={(id) => requestDelete('waitlist', id)} />}
          {activeTab === "predictor" && <PredictorView forecast={predictorData} loading={predictorLoading} error={predictorError} onRefresh={fetchPredictions} date={predictorDate} setDate={setPredictorDate} />}
          {activeTab === "settings" && <SettingsView setEditMode={setEditMode} setActiveTab={setActiveTab} floors={floors} tables={tables} servers={servers} roles={roles} addServer={addServer} removeServer={removeServer} setServerColor={setServerColor} setServerRoles={setServerRoles} addRole={addRole} removeRole={removeRole} restaurantHours={restaurantHours} setRestaurantHours={setRestaurantHours} prefs={prefs} setPref={setPref} onResetLiveFloor={resetLiveFloor} onOpenImport={() => setImportOpen(true)} onOpenMigrate={() => setMigrateOpen(true)} />}
          {activeTab === "calendar" && (
            <CalendarView
              calendarMonth={calendarMonth}
              setCalendarMonth={setCalendarMonth}
              selectedCalendarDate={selectedCalendarDate}
              setSelectedCalendarDate={setSelectedCalendarDate}
              reservations={reservations}
              now={now}
              onDayClick={(dateKey) => {
                // Time Travel: a calendar-day tap jumps to the floor,
                // hydrated with THAT date's reservations. Selections are
                // cleared so panels don't carry across tabs. The calendar's
                // own day/month selection resets on the next entry to the
                // Calendar tab (see the reset effect), so it always opens
                // on today rather than the last day inspected.
                setSelectedTableId(null);
                setSelectedReservationId(null);
                setSelectedCalendarDate(dateKey);
                setViewDate(parseDateKey(dateKey) || new Date());
                setActiveTab('floor');
              }}
            />
          )}
        </main>
        {selectedTableId && activeTab === "floor" && !editMode && (
          <TableDetailsPanel
            table={tables.find(t => t.id === selectedTableId)}
            servers={servers}
            now={now}
            reservations={reservations}
            shiftWindow={shiftWindowFor(viewDateStr, restaurantHours ? restaurantHours.open : null, restaurantHours ? restaurantHours.close : null)}
            viewDateStr={viewDateStr}
            onClose={() => setSelectedTableId(null)}
            onMarkBussing={() => markForBussing(selectedTableId)}
            onClearTable={() => clearTable(selectedTableId)}
            onMoveParty={(t) => { setMoveSourceId(t.id); setSelectedTableId(null); }}
            onToggleAiExcluded={toggleTableManualOnly}
            onToggleOnlineBlocked={toggleTableOnlineExcluded}
            overlay={hostMode}
            onOpenReservation={(id) => { setSelectedTableId(null); setSelectedReservationId(id); }}
            onEditParty={(t) => setEditParty({ kind: 'table', id: t.id, name: t.party || '', size: t.partySize || 1 })}
            setMergeMode={setMergeMode}
            setMergeSelection={setMergeSelection}
            unmergeTable={unmergeTable}
          />
        )}
        {/* Right-side panel slot — table details OR reservation
            details, never both. The !selectedTableId guard on the
            reservation panel is render-level mutual exclusion; the
            click handlers below also do synchronous state cleanup so
            two never coexist for even a single render. */}
        {!selectedTableId && selectedReservationId && (() => {
          // Lookup spans BOTH arrays. A reservation can live in
          // `reservations` (a future scheduled booking) or, after
          // Send-to-Waitlist, in `waitlist`. Walk-ins also live in
          // `waitlist` — the unified Party Details model means any
          // waitlist row matches here, not just type:'reservation'.
          const fromReservations = reservations.find(x => x.id === selectedReservationId);
          const fromWaitlist     = !fromReservations
            ? waitlist.find(x => x.id === selectedReservationId)
            : null;
          const r = fromReservations || fromWaitlist;
          if (!r) return null;
          const isOnWaitlist = !!fromWaitlist;

          // Closing via X / background: zen mode clears any in-flight
          // co-pilot suggestion so the floor map returns to a clean
          // state with no orphaned cyan pulse from this reservation.
          const close = () => {
            setSelectedReservationId(null);
            if (selectedPartyId === r.id) setSelectedPartyId(null);
            // Closing the panel also exits any in-flight reassign
            // mode — the host can't pick a table for a party whose
            // panel they just dismissed.
            setReassignReservationId(null);
          };
          return (
            <ReservationDetailsSidebar
              reservation={r}
              isOnWaitlist={isOnWaitlist}
              now={now}
              tables={tables}
              aiSuggestedIds={aiSuggestedIds}
              selectedPartyId={selectedPartyId}
              onClose={close}
              onMarkPartial={() => {
                // updateReservation maps BOTH local stores and PATCHes
                // both endpoints (unknown id = 200 no-op), so the status
                // shows immediately AND survives a reload — the old
                // version mutated local state only.
                updateReservation(r.id, { status: 'partially_arrived' });
              }}
              onSendToWaitlist={isOnWaitlist ? null : () => {
                // Carry status through so a partially-arrived party
                // keeps that signal once on the waitlist. Reservation
                // is removed from the reservations array — it now
                // belongs to the waitlist queue. Hidden entirely when
                // the party is already on the waitlist (no-op there).
                if ((r.date || todayStr) < todayStr) { setToast('Past reservations are read-only'); return; }
                const queuedEntry = {
                  id: `res-${Date.now()}`,
                  name: r.name,
                  size: r.size,
                  type: 'reservation',
                  tag: 'Reservation',
                  addedAt: Date.now(),
                  note: r.status === 'partially_arrived' ? 'Partially arrived' : (r.note || 'Arrived'),
                  status: r.status || 'confirmed',
                };
                setWaitlist(prev => [...prev, queuedEntry]);
                setReservations(prev => prev.filter(x => x.id !== r.id));
                // The booking leaves the book and joins the queue: a new
                // WaitlistEntry is created and the reservation is closed
                // out (soft-cancelled) so a reload doesn't double-count
                // the party in both places.
                persist('/api/waitlist', 'POST', queuedEntry);
                persist('/api/reservations', 'DELETE', { id: r.id });
                close();
              }}
              onSeatNow={() => {
                if (r.tableId != null) {
                  // An assigned table is a suggestion. Enter the existing
                  // pending-seat flow so the host can confirm it or choose
                  // any other open table without changing lifecycle code.
                  const assigned = tables.find(t => String(r.tableId).split('_').includes(String(t.id)));
                  if (assigned) setActiveFloorId(assigned.floorId);
                  setForcedSeatSuggestion({ partyId: r.id, tableId: r.tableId });
                  setSelectedPartyId(r.id);
                  setSelectedReservationId(null);
                  setActiveTab('floor');
                } else {
                  // Unassigned — fire the AI co-pilot. Guarded: only one
                  // table-pick flow may be live at a time.
                  if (reassignReservationId) {
                    setToast('Finish assigning the reservation first — pick a table, or click empty floor to cancel');
                    return;
                  }
                  setActiveTab('floor');
                  setSelectedPartyId(r.id);
                  setSelectedReservationId(null);
                }
              }}
              onUpdateTable={updateReservationTable}
              onRequestEdit={(res) => { if ((res.date || todayStr) < todayStr) { setToast('Past reservations are read-only'); return; } setEditReservation(res); setModalOpen(true); setSelectedReservationId(null); setReassignReservationId(null); }}
              onRequestEditParty={(party) => { setEditParty({ kind: 'waitlist', id: party.id, name: party.name, size: party.size }); setSelectedReservationId(null); setReassignReservationId(null); }}
              reassignReservationId={reassignReservationId}
              setReassignReservationId={(v) => {
                // Starting a reassign while a party seating is pending
                // would stack two table-pick flows (the overlay bug).
                // Cancelling (null) is always allowed.
                if (v && selectedPartyId) {
                  setToast('Finish seating the current party first — pick a table, or click empty floor to cancel');
                  return;
                }
                setReassignReservationId(v);
              }}
            />
          );
        })()}
        {/* Right-panel slot — calendar variant. Mutual exclusion with
            both the table panel and the reservation panel: a click on
            a calendar day clears both selection states first, so this
            renders alone. Tab gate ensures the calendar sidebar only
            appears in calendar context — switching tabs hides it. */}
        {!selectedTableId && !selectedReservationId && selectedCalendarDate && activeTab === "calendar" && (
          <CalendarSidebar
            date={selectedCalendarDate}
            reservations={reservations}
            onClose={() => setSelectedCalendarDate(null)}
            onOpenReservation={(id) => { setSelectedTableId(null); setSelectedReservationId(id); }}
          />
        )}
      </div>
      {modalOpen && <ReservationModal
        key={editReservation ? editReservation.id : 'new'}
        initialReservation={editReservation}
        initialDate={(activeTab === 'calendar' && selectedCalendarDate && selectedCalendarDate >= todayStr) ? selectedCalendarDate : (viewingFuture ? viewDateStr : todayStr)}
        onClose={() => { setModalOpen(false); setEditReservation(null); }}
        onSubmit={d => {
          // No bookings in the past: input min + this guard + server
          // 400s. Applies to edits too (can't move a booking backwards
          // past today).
          if (d.date && d.date < todayStr) {
            setToast("Reservations can't be made for past dates");
            return;
          }
          if (editReservation) {
            // Edit mode — patch the existing reservation in place. No
            // table hand-off; the assignment is managed separately. Drop
            // the modal's hardcoded note so an existing note isn't wiped.
            // skipAssign is UI-only; note/vip are real fields now (the
            // modal loads existing values, so passing them through can no
            // longer wipe anything — the old hardcoded-"—" hazard is gone).
            const { skipAssign: _ignoredSkip, ...editPatch } = d;
            editPatch.note = editPatch.note && editPatch.note.trim() ? editPatch.note.trim() : '—';
            editPatch.vip = !!editPatch.vip;
            editPatch.tag = editPatch.vip ? 'VIP' : undefined;
            updateReservation(editReservation.id, editPatch);
            setModalOpen(false);
            setEditReservation(null);
            return;
          }
          // Create the reservation unassigned, close the modal, and
          // hand off to point-and-click mode. The seat useEffect picks
          // up reassignReservationId and pulses the AI-recommended
          // table; the floor's handleTableClick intercept handles the
          // final placement.
          const { skipAssign, ...resData } = d;
          const newId = mintId('res');
          // Local copy keeps the "—" placeholder convention and derives the
          // tag chip; the API stores the raw note (route maps ""/"—" → null).
          setReservations(r => [...r, {
            id: newId, tableId: null, status: 'confirmed', ...resData,
            note: resData.note && resData.note.trim() ? resData.note.trim() : '—',
            vip: !!resData.vip,
            tag: resData.vip ? 'VIP' : undefined,
          }]);
          persist('/api/reservations', 'POST', { id: newId, ...resData });
          setModalOpen(false);
          if (skipAssign) {
            // Booking taken, no table chosen — it sits in the guest list
            // until the host seats it (drag-to-seat or the co-pilot).
            setToastOk('Reservation added — unassigned');
            return;
          }
          setReassignReservationId(newId);
          setActiveTab('floor');
          // Assignment happens against the booking's own day — the
          // floor time-travels there so availability reads correctly.
          setViewDate(parseDateKey(d.date) || new Date());
        }}
      />}
      {editParty && <EditPartyModal
        title={editParty.kind === 'table' ? 'Edit covers' : 'Edit party'}
        sizeLabel={editParty.kind === 'table' ? 'Covers' : 'Party size'}
        initialName={editParty.name}
        initialSize={editParty.size}
        onClose={() => setEditParty(null)}
        onSave={({ name, size }) => {
          if (editParty.kind === 'waitlist') {
            setWaitlist(prev => prev.map(p => p.id === editParty.id ? { ...p, name, size } : p));
            persist('/api/waitlist', 'PATCH', { id: editParty.id, name, size });
          } else if (editParty.kind === 'table') {
            // Apply to the seated table and any merged siblings sharing
            // its groupId so the whole party reads the same covers.
            setTables(prev => {
              const target = prev.find(t => t.id === editParty.id);
              const gid = target ? target.groupId : null;
              return prev.map(t =>
                (t.id === editParty.id || (gid != null && t.groupId === gid))
                  ? { ...t, party: name, partySize: size }
                  : t
              );
            });
          }
          setEditParty(null);
        }}
      />}
      {walkInModalOpen && <WalkInModal onClose={() => setWalkInModalOpen(false)} onSubmit={handleWalkIn} onSendToWaitlist={sendWalkInToWaitlist} />}
      {assignOverride && <ConfirmDialog
        title="Assign despite conflict?"
        message={assignOverride.message}
        confirmLabel="Assign anyway"
        cancelLabel="Pick another table"
        onConfirm={() => {
          assignReservationToTables(assignOverride.reservationId, assignOverride.targetIds, assignOverride.existingGroupId);
          setReassignReservationId(null);
          setAssignOverride(null);
        }}
        onCancel={() => setAssignOverride(null)}
      />}
      {confirmDelete && <ConfirmDialog
        title={confirmDelete.kind === 'reservation' ? 'Delete reservation?' : 'Remove from waitlist?'}
        message={confirmDelete.kind === 'reservation'
          ? `${confirmDelete.name}'s reservation will be permanently deleted.`
          : `${confirmDelete.name} will be removed from the waitlist.`}
        confirmLabel={confirmDelete.kind === 'reservation' ? 'Delete' : 'Remove'}
        onConfirm={() => {
          if (confirmDelete.kind === 'reservation') doDeleteReservation(confirmDelete.id);
          else doDeleteWaitlist(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />}
      {forceSeatTarget && (() => {
        // Resolve virtual "i_j" ids (AI-suggested or merge-and-seat
        // overflows) into a synthetic combined table so the modal shows
        // the joined name + summed capacity. Previously a virtual id
        // failed the tables.find lookup and the modal silently rendered
        // null, leaving the force-seat prompt unreachable. Single ids
        // pass straight through. groupId is nulled on the synthetic so
        // getEffectiveCapacity doesn't double-count via group expansion.
        const ids = typeof forceSeatTarget === 'string' && forceSeatTarget.includes('_')
          ? splitTableIds(forceSeatTarget)
          : [forceSeatTarget];
        const members = ids.map(id => tables.find(t => t.id === id)).filter(Boolean);
        if (members.length === 0) return null;
        const modalTable = members.length === 1 ? members[0] : {
          ...members[0],
          name: members.map(t => t.name).join(' + '),
          capacity: members.reduce((s, t) => s + t.capacity, 0),
          groupId: null,
        };
        return <ForceSeatModal table={modalTable} party={waitlist.find(a => a.id === selectedPartyId) || reservations.find(r => r.id === selectedPartyId)} tables={tables} onConfirm={() => { performSeat(forceSeatTarget, true); setForceSeatTarget(null); }} onCancel={() => setForceSeatTarget(null)} />;
      })()}
      {viewingServerId && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-600 text-gray-200 text-sm px-4 py-2 rounded-full shadow-lg z-50">
          To end server section viewing click anywhere.
        </div>
      )}

      {/* Floating merge action bar — appears only while mergeMode is
          active. Hosts the running selection count + Confirm/Cancel
          controls without needing the side panel. Positioned at the
          bottom-center, above the toast slot, so a confirmation toast
          (e.g., "Tables merged") later in the same flow doesn't overlap. */}
      {mergeMode && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-panel border border-ai shadow-2xl shadow-ai/20 rounded-2xl p-4 z-50 flex items-center gap-6 animate-[fadeIn_0.2s_ease-out]">
          <div className="text-sm font-medium text-ink-50">
            Select <strong className="text-ai">adjacent</strong> tables to merge <span className="ml-2 px-2 py-0.5 rounded-full bg-ai/20 text-ai font-mono text-xs">{mergeSelection.length} selected</span>
            {mergeSelection.length >= 2 && !isSelectionContiguous(mergeSelection, tables) && (
              <span className="block mt-1 text-xs text-state-seated font-normal">Selected tables must form one touching block.</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setMergeMode(false); setMergeSelection([]); }}
              className="px-4 py-2 rounded-lg bg-panel-card border border-border text-ink-50 text-xs font-bold uppercase tracking-wider hover:bg-panel-up transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmMerge}
              disabled={mergeSelection.length < 2 || !isSelectionContiguous(mergeSelection, tables)}
              className="px-4 py-2 rounded-lg bg-ai text-bg text-xs font-bold uppercase tracking-wider disabled:opacity-40 transition-colors"
            >
              {selectedPartyId ? 'Merge & Seat Party' : reassignReservationId ? 'Merge & Assign' : 'Confirm Merge'}
            </button>
          </div>
        </div>
      )}

      {healthIssue && !dbOffline && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2.5 bg-amber-500/15 border border-amber-500/70 text-amber-300 rounded-xl px-4 py-2 text-xs font-mono uppercase tracking-[0.08em] shadow-lg shadow-amber-900/30 max-w-[90vw]">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0"></span>
          {healthIssue}
        </div>
      )}
      {dbOffline && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2.5 bg-rose-600/15 border border-rose-500/70 text-rose-300 rounded-xl px-4 py-2 text-xs font-mono uppercase tracking-[0.08em] shadow-lg shadow-rose-900/30">
          <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse flex-shrink-0"></span>
          Database offline — showing demo data · changes won't save · check the dev-server terminal
        </div>
      )}
      {/* Notifications drop from the TOP, over the floor plan, in amber —
          the old small green toast at the bottom was being missed, and its
          success palette misread the many blocking messages ("finish
          seating first") as confirmations. Big target, high contrast,
          in the host's line of sight. Click to dismiss early. */}
      {migrateOpen && (
        <FloorMigrateOverlay
          tables={tables}
          floors={floors}
          onClose={() => setMigrateOpen(false)}
          onCommit={commitFloorMigration}
        />
      )}
      {/* Touch drag-to-seat ghost — the party chip riding under the
          host's finger. pointer-events-none so elementFromPoint sees
          the tiles beneath it, not the chip itself. */}
      {touchDragGhost && (
        <div
          data-party-drag-ghost
          className="fixed z-[100] pointer-events-none"
          style={{ left: touchDragGhost.x, top: touchDragGhost.y, transform: 'translate(-50%, -130%)' }}
        >
          <div className="px-3.5 py-2 rounded-xl bg-panel-up border border-ai/60 shadow-2xl shadow-black/50 flex items-center gap-2">
            <span className="text-[13px] text-ink-50 font-semibold whitespace-nowrap">{touchDragGhost.name}</span>
            <span className="font-mono text-[10px] text-ai font-bold">×{touchDragGhost.size}</span>
          </div>
          <div className="mx-auto w-2 h-2 -mt-1 rotate-45 bg-panel-up border-r border-b border-ai/60" />
        </div>
      )}
      {importOpen && (
        <ImportOverlay
          tables={tables}
          defaultTurnMinutes={parseInt(prefs.turnTime, 10) || 90}
          onClose={() => setImportOpen(false)}
          onDone={(res) => {
            setToastOk(`Imported ${res.created} record${res.created === 1 ? '' : 's'}${res.duplicates ? ` · ${res.duplicates} duplicate${res.duplicates === 1 ? '' : 's'} skipped` : ''}`);
            loadServiceLog();
          }}
        />
      )}
      {toast && (
        <div
          onClick={() => setToastState({ msg: null, kind: 'blocked' })}
          role={toastKind === 'ok' ? 'status' : 'alert'}
          aria-live={toastKind === 'ok' ? 'polite' : 'assertive'}
          className={`fixed top-24 left-1/2 -translate-x-1/2 z-[70] cursor-pointer max-w-[min(90vw,760px)] px-7 py-5 rounded-2xl border-2 text-neutral-950 shadow-2xl animate-[mesa-toast-in_0.28s_cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none ${
            toastKind === 'ok'
              ? 'bg-emerald-400 border-emerald-300 shadow-emerald-500/40'
              : 'bg-amber-400 border-amber-300 shadow-amber-500/40'
          }`}
        >
          <div className="flex items-center gap-4">
            <span className="text-2xl leading-none select-none" aria-hidden="true">{toastKind === 'ok' ? '✓' : '⚠'}</span>
            <span className="text-lg font-bold leading-snug tracking-tight">{toast}</span>
          </div>
        </div>
      )}
      <style jsx global>{`
        @keyframes mesa-toast-in {
          0%   { opacity: 0; transform: translate(-50%, -18px) scale(0.97); }
          100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }
        @keyframes mesa-ready {
          0%, 100% { box-shadow: 0 0 0 0 rgba(92, 225, 230, 0.0); }
          50%      { box-shadow: 0 0 0 6px rgba(92, 225, 230, 0.14); }
        }
        @keyframes mesa-rail-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .mesa-ready { animation: mesa-ready 2.4s ease-in-out infinite; }
        .mesa-wheel { scrollbar-width: none; -ms-overflow-style: none; }
        .mesa-wheel::-webkit-scrollbar { display: none; height: 0; }
      `}</style>
    </div>
  );
}
