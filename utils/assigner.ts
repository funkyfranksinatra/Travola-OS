// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────
// assigner.ts — deterministic server-section planner (Delta rewrite)
// ─────────────────────────────────────────────────────────────────────
//
// Replaces K-Means + swap balancing. K-Means gives Voronoi-ish blobs and
// its balance swaps can create ENCLAVES — a table of server A stranded
// inside server B's section. The hard requirement is strict spatial
// contiguity ("no server's table on the wrong side of another server"),
// which is a 1-D property: order the room's tables along its principal
// axis and every server owns ONE CONTIGUOUS RUN. That is guaranteed by
// construction here, not hoped for by iteration.
//
// Pipeline (strictly ordered):
//
//   Stage 0 — ROSTER. On-shift staff split by role. Pure bartenders take
//             the bar; dual-role staff bartend only when bar tables
//             exist and no pure bartender is on. Everyone else waits.
//
//   Stage 1 — ROOMS. A room = (floorId, zone). Zone comes from the
//             table's dedicated area (dining / patio); bar-zone tables
//             are pulled out FIRST and belong to bartenders only — with
//             no bartender on shift they are left unassigned for manual
//             placement, never given to a waiter.
//
//   Stage 2 — LOAD MODEL. A table's nightly load ≈ capacity × turns.
//             Small tables (≤2) turn ~3×, mids ~2.2×, larges (≥6) ~1.4×.
//             A server's capacity weight comes from shift history
//             (avg covers/night, normalized, clamped 0.6–1.6×) so a
//             historically heavy server draws a heavier section; with no
//             history everyone weighs 1.
//
//   Stage 3 — APPORTIONMENT. Waiters are apportioned to rooms by room
//             load (largest remainder, every room ≥1 while staff lasts —
//             a server never spans two rooms). Heavier servers are
//             paired with heavier slots.
//
//   Stage 4 — CONTIGUOUS PARTITION. Per room: PCA principal axis →
//             project + order tables → dynamic-programming split into k
//             contiguous segments minimizing |segment load − server
//             target| plus a mix penalty when a segment misses large or
//             small tables the room could share. A boundary-refinement
//             pass shifts single tables across segment boundaries only,
//             so contiguity survives.
//
//   Stage 5 — REPORT. Human-readable notes: floors/zones/table counts,
//             roster, history usage + expected covers, per-section
//             summaries, and every guardrail exception.
//
// Entry points:
//   buildSectionPlan(tables, servers, floors, opts) → { assignments, notes, toast }
//   calculateServerSections(tables, servers, floors) → assignments (legacy shape)

// ─── Types ───────────────────────────────────────────────────────────

export interface AssignerTable {
  id: number | string;
  name?: string;
  capacity: number;
  x: number;
  y: number;
  floorId?: string;
  area?: string; // 'dining' | 'bar' | 'patio'
}

export interface AssignerServer {
  id: string;
  name?: string;
  roles?: string[];        // ['waiter'] | ['bartender'] | both
  avgCovers?: number | null; // historical avg covers/night (optional)
}

export interface AssignerFloor {
  id: string;
  name?: string;
}

export interface SectionAssignment {
  tableId: number | string;
  serverId: string;
}

export interface SectionPlan {
  assignments: SectionAssignment[];
  notes: string[];
  toast: string;
}

// ─── Load model ──────────────────────────────────────────────────────

const turnsFor = (cap) => (cap <= 2 ? 3.0 : cap >= 6 ? 1.4 : 2.2);
const loadOf = (t) => Math.max(1, t.capacity || 2) * turnsFor(t.capacity || 2);
const isLarge = (t) => (t.capacity || 0) >= 6;
const isSmall = (t) => (t.capacity || 0) <= 2;
const sum = (a) => a.reduce((s, v) => s + v, 0);

// Server weight from history: normalized to mean 1, clamped so a data
// quirk can never starve or flood one person.
function serverWeights(servers) {
  const known = servers.filter((s) => Number(s.avgCovers) > 0);
  const mean = known.length ? sum(known.map((s) => Number(s.avgCovers))) / known.length : 0;
  const w = new Map();
  for (const s of servers) {
    if (mean > 0 && Number(s.avgCovers) > 0) {
      w.set(s.id, Math.min(1.6, Math.max(0.6, Number(s.avgCovers) / mean)));
    } else {
      w.set(s.id, 1);
    }
  }
  return w;
}

// ─── Largest-remainder apportionment ─────────────────────────────────

function apportion(loads, seats) {
  const total = sum(loads) || 1;
  const quotas = loads.map((l) => (l / total) * seats);
  const base = quotas.map((q) => Math.floor(q));
  let left = seats - sum(base);
  const order = quotas
    .map((q, i) => [q - Math.floor(q), i])
    .sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    base[i] += 1;
    left -= 1;
  }
  return base;
}

// ─── PCA principal axis ──────────────────────────────────────────────

function principalAxis(pts) {
  const n = pts.length || 1;
  const mx = sum(pts.map((p) => p.x)) / n;
  const my = sum(pts.map((p) => p.y)) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  // Dominant eigenvector of the 2×2 covariance matrix.
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr / 2) ** 2 - det));
  let vx, vy;
  if (Math.abs(sxy) > 1e-9) { vx = l1 - syy; vy = sxy; }
  else if (sxx >= syy) { vx = 1; vy = 0; }
  else { vx = 0; vy = 1; }
  const len = Math.hypot(vx, vy) || 1;
  return { vx: vx / len, vy: vy / len, mx, my };
}

// ─── Contiguous k-partition (DP) ─────────────────────────────────────
//
// tablesOrdered: along the axis. targets: per-segment load targets in
// segment order. Returns array of k index-ranges [start, end).
function partitionContiguous(tablesOrdered, targets, roomLarge, roomSmall) {
  const n = tablesOrdered.length;
  const k = targets.length;
  const loads = tablesOrdered.map(loadOf);
  const pre = [0];
  for (let i = 0; i < n; i++) pre.push(pre[i] + loads[i]);
  const preL = [0], preS = [0];
  for (let i = 0; i < n; i++) {
    preL.push(preL[i] + (isLarge(tablesOrdered[i]) ? 1 : 0));
    preS.push(preS[i] + (isSmall(tablesOrdered[i]) ? 1 : 0));
  }
  const avgTarget = sum(targets) / k;
  const MIX_P = 0.5 * avgTarget;
  const segCost = (a, b, j) => {
    const L = pre[b] - pre[a];
    let c = Math.abs(L - targets[j]);
    if (roomLarge >= k && preL[b] - preL[a] === 0) c += MIX_P;
    if (roomSmall >= k && preS[b] - preS[a] === 0) c += MIX_P;
    return c;
  };
  // dp[j][i] = min cost splitting first i tables into j segments.
  const INF = 1e15;
  const dp = Array.from({ length: k + 1 }, () => new Float64Array(n + 1).fill(INF));
  const cut = Array.from({ length: k + 1 }, () => new Int32Array(n + 1));
  dp[0][0] = 0;
  for (let j = 1; j <= k; j++) {
    for (let i = j; i <= n - (k - j); i++) {
      for (let p = j - 1; p < i; p++) {
        if (dp[j - 1][p] >= INF) continue;
        const c = dp[j - 1][p] + segCost(p, i, j - 1);
        if (c < dp[j][i]) { dp[j][i] = c; cut[j][i] = p; }
      }
    }
  }
  const bounds = new Array(k + 1);
  bounds[k] = n;
  for (let j = k; j >= 1; j--) bounds[j - 1] = cut[j][bounds[j]];
  const ranges = [];
  for (let j = 0; j < k; j++) ranges.push([bounds[j], bounds[j + 1]]);
  // Boundary refinement: shift single tables across boundaries while it
  // strictly improves total cost. Only boundary moves → contiguity holds.
  const totalCost = (rs) => rs.reduce((s, [a, b], j) => s + segCost(a, b, j), 0);
  let improved = true, guard = 0;
  while (improved && guard++ < 24) {
    improved = false;
    for (let j = 0; j < k - 1; j++) {
      const [a1, b1] = ranges[j];
      const [a2, b2] = ranges[j + 1];
      // move boundary left (give segment j's last table to j+1)
      if (b1 - a1 > 1) {
        const trial = ranges.map((r, i) => (i === j ? [a1, b1 - 1] : i === j + 1 ? [b1 - 1, b2] : r));
        if (totalCost(trial) < totalCost(ranges) - 1e-9) { ranges[j] = trial[j]; ranges[j + 1] = trial[j + 1]; improved = true; continue; }
      }
      // move boundary right (take segment j+1's first table)
      if (b2 - a2 > 1) {
        const trial = ranges.map((r, i) => (i === j ? [a1, b1 + 1] : i === j + 1 ? [b1 + 1, b2] : r));
        if (totalCost(trial) < totalCost(ranges) - 1e-9) { ranges[j] = trial[j]; ranges[j + 1] = trial[j + 1]; improved = true; }
      }
    }
  }
  return ranges;
}

// ─── The planner ─────────────────────────────────────────────────────

export function buildSectionPlan(tables, servers, floors, opts = {}) {
  const notes = [];
  const assignments = [];
  if (!Array.isArray(tables) || tables.length === 0 || !Array.isArray(servers) || servers.length === 0) {
    return { assignments, notes: ['Nothing to assign.'], toast: 'Nothing to assign' };
  }
  const floorName = new Map((floors || []).map((f) => [f.id, f.name || f.id]));
  const zoneOf = (t) => (t.area === 'bar' ? 'bar' : t.area === 'patio' ? 'patio' : 'dining');

  // Stage 0 — roster.
  const hasRole = (s, r) => Array.isArray(s.roles) && s.roles.includes(r);
  const pureBartenders = servers.filter((s) => hasRole(s, 'bartender') && !hasRole(s, 'waiter'));
  const dualRole = servers.filter((s) => hasRole(s, 'bartender') && hasRole(s, 'waiter'));
  const barTables = tables.filter((t) => zoneOf(t) === 'bar');
  let bartenders = pureBartenders;
  if (barTables.length > 0 && bartenders.length === 0 && dualRole.length > 0) {
    bartenders = [dualRole[0]]; // promote one dual-role to the bar
  }
  const bartenderIds = new Set(bartenders.map((s) => s.id));
  const waiters = servers.filter((s) => !bartenderIds.has(s.id));
  const weights = serverWeights(servers);

  // Stage 1 — rooms (floor × zone), bar pulled out first.
  const roomTables = tables.filter((t) => zoneOf(t) !== 'bar');
  const rooms = new Map();
  for (const t of roomTables) {
    const key = `${t.floorId || 'f1'}::${zoneOf(t)}`;
    if (!rooms.has(key)) rooms.set(key, []);
    rooms.get(key).push(t);
  }
  const roomList = [...rooms.entries()].map(([key, ts]) => {
    const [fid, zone] = key.split('::');
    return { key, fid, zone, tables: ts, load: sum(ts.map(loadOf)) };
  }).sort((a, b) => b.load - a.load);

  // Requirement 1 — the floor/zone census.
  notes.push('Floor census: ' + roomList.map((r) =>
    `${floorName.get(r.fid) || r.fid}·${r.zone} ${r.tables.length}t`
  ).concat(barTables.length ? [`bar ${barTables.length}t`] : []).join(' / '));
  // Requirement 2 — the roster.
  notes.push(`On shift: ${waiters.length} waiter${waiters.length === 1 ? '' : 's'}, ${bartenders.length} bartender${bartenders.length === 1 ? '' : 's'}`);
  // Requirement 3 — history.
  const histCount = servers.filter((s) => Number(s.avgCovers) > 0).length;
  if (histCount > 0) {
    const parts = servers.filter((s) => Number(s.avgCovers) > 0)
      .map((s) => `${s.name || s.id} ${weights.get(s.id).toFixed(2)}×`);
    notes.push(`History weighting (${histCount} server${histCount === 1 ? '' : 's'}): ${parts.join(', ')}` +
      (opts.expectedCovers ? ` — expecting ~${Math.round(opts.expectedCovers)} covers` : ''));
  } else {
    notes.push('No shift history — even split' + (opts.expectedCovers ? ` — expecting ~${Math.round(opts.expectedCovers)} covers` : ''));
  }

  // Guardrail 1 — bar → bartenders only, apportioned per floor.
  if (barTables.length > 0) {
    if (bartenders.length === 0) {
      notes.push(`⚠ ${barTables.length} bar table${barTables.length === 1 ? '' : 's'} left unassigned — no bartender on shift`);
    } else {
      const barByFloor = new Map();
      for (const t of barTables) {
        const fid = t.floorId || 'f1';
        if (!barByFloor.has(fid)) barByFloor.set(fid, []);
        barByFloor.get(fid).push(t);
      }
      const barRooms = [...barByFloor.entries()]
        .map(([fid, ts]) => ({ fid, tables: ts, load: sum(ts.map(loadOf)) }))
        .sort((a, b) => b.load - a.load);
      const seats = apportion(barRooms.map((r) => r.load), bartenders.length)
        .map((s, i) => (i < bartenders.length ? s : 0));
      // guarantee the biggest bar rooms are staffed first
      let pool = [...bartenders].sort((a, b) => weights.get(b.id) - weights.get(a.id));
      barRooms.forEach((room, i) => {
        let n = Math.max(seats[i], 0);
        if (n === 0 && pool.length > 0 && i < pool.length) n = 0; // apportion already spent them
        const staff = pool.splice(0, Math.max(1, n) <= pool.length ? Math.max(seats[i], i === 0 && sum(seats) === 0 ? 1 : seats[i]) : 0);
        if (staff.length === 0) {
          if (pool.length > 0) { staff.push(pool.shift()); }
        }
        if (staff.length === 0) {
          notes.push(`⚠ ${room.tables.length} bar table${room.tables.length === 1 ? '' : 's'} on ${floorName.get(room.fid) || room.fid} unassigned — not enough bartenders (one room per bartender)`);
          return;
        }
        if (staff.length === 1) {
          for (const t of room.tables) assignments.push({ tableId: t.id, serverId: staff[0].id });
          notes.push(`${staff[0].name || staff[0].id} → ${floorName.get(room.fid) || room.fid}·bar: ${room.tables.length} tables`);
        } else {
          const axis = principalAxis(room.tables);
          const ordered = [...room.tables].sort((a, b) =>
            ((a.x - axis.mx) * axis.vx + (a.y - axis.my) * axis.vy) -
            ((b.x - axis.mx) * axis.vx + (b.y - axis.my) * axis.vy));
          const staffSorted = [...staff].sort((a, b) => weights.get(b.id) - weights.get(a.id));
          const roomLoad = sum(room.tables.map(loadOf));
          const wSum = sum(staffSorted.map((s) => weights.get(s.id)));
          const targets = staffSorted.map((s) => (roomLoad * weights.get(s.id)) / wSum);
          const ranges = partitionContiguous(ordered,
            targets,
            room.tables.filter(isLarge).length,
            room.tables.filter(isSmall).length);
          ranges.forEach(([a, b], j) => {
            for (let i = a; i < b; i++) assignments.push({ tableId: ordered[i].id, serverId: staffSorted[j].id });
            notes.push(`${staffSorted[j].name || staffSorted[j].id} → ${floorName.get(room.fid) || room.fid}·bar: ${b - a} tables`);
          });
        }
      });
    }
  }

  // Stage 3 — waiters → rooms (one room per waiter, largest remainder).
  if (roomList.length > 0) {
    if (waiters.length === 0) {
      notes.push('⚠ No waiters on shift — dining/patio tables left unassigned');
    } else {
      let seats = apportion(roomList.map((r) => r.load), waiters.length);
      // every room deserves at least one server while staff remains
      if (waiters.length >= roomList.length) {
        let spare = 0;
        seats = seats.map((s) => { if (s > 1) { return s; } return s; });
        for (let i = 0; i < seats.length; i++) if (seats[i] === 0) {
          const donor = seats.indexOf(Math.max(...seats));
          if (seats[donor] > 1) { seats[donor] -= 1; seats[i] = 1; }
        }
      }
      // slots: (room, targetShare) sorted heavy-first; heavy waiters to heavy slots
      const slots = [];
      roomList.forEach((room, i) => {
        for (let s = 0; s < seats[i]; s++) slots.push({ room, share: room.load / Math.max(1, seats[i]) });
      });
      slots.sort((a, b) => b.share - a.share);
      const waitersSorted = [...waiters].sort((a, b) => weights.get(b.id) - weights.get(a.id));
      const roomStaff = new Map();
      slots.forEach((slot, i) => {
        if (i >= waitersSorted.length) return;
        if (!roomStaff.has(slot.room.key)) roomStaff.set(slot.room.key, []);
        roomStaff.get(slot.room.key).push(waitersSorted[i]);
      });
      for (const room of roomList) {
        const staff = roomStaff.get(room.key) || [];
        if (staff.length === 0) {
          notes.push(`⚠ ${floorName.get(room.fid) || room.fid}·${room.zone} (${room.tables.length} tables) unassigned — not enough waiters (one room per server)`);
          continue;
        }
        // Stage 4 — contiguous partition along the room's principal axis.
        const axis = principalAxis(room.tables);
        const ordered = [...room.tables].sort((a, b) =>
          ((a.x - axis.mx) * axis.vx + (a.y - axis.my) * axis.vy) -
          ((b.x - axis.mx) * axis.vx + (b.y - axis.my) * axis.vy) ||
          (a.y - b.y) || (a.x - b.x));
        const staffSorted = [...staff].sort((a, b) => weights.get(b.id) - weights.get(a.id));
        const wSum = sum(staffSorted.map((s) => weights.get(s.id)));
        const targets = staffSorted.map((s) => (room.load * weights.get(s.id)) / wSum);
        const ranges = staff.length === 1
          ? [[0, ordered.length]]
          : partitionContiguous(ordered, targets,
              room.tables.filter(isLarge).length,
              room.tables.filter(isSmall).length);
        ranges.forEach(([a, b], j) => {
          const seg = ordered.slice(a, b);
          for (const t of seg) assignments.push({ tableId: t.id, serverId: staffSorted[j].id });
          const covers = Math.round(sum(seg.map((t) => t.capacity || 0)));
          const nl = seg.filter(isLarge).length, ns = seg.filter(isSmall).length;
          notes.push(`${staffSorted[j].name || staffSorted[j].id} → ${floorName.get(room.fid) || room.fid}·${room.zone}: ${seg.length} tables, ${covers} seats (${nl} large / ${ns} small)`);
        });
      }
    }
  }

  const assignedCount = assignments.length;
  const toast = `Sections planned: ${assignedCount}/${tables.length} tables across ${servers.length} staff` +
    (notes.some((n) => n.startsWith('⚠')) ? ' — see warnings' : '');
  return { assignments, notes, toast };
}

// Legacy entry point — same call shape and return type as before.
export function calculateServerSections(tables, servers, floors) {
  return buildSectionPlan(tables, servers, floors, {}).assignments;
}