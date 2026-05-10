'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';

// ─── INITIAL DATA ────────────────────────────────────────────────────

// Explicitly defining types for the Vercel build
const minutesAgo = (m: number) => Date.now() - m * 60_000;

const tableSize = (capacity: number) => 48 + Math.min(Math.max(capacity, 1), 12) * 5;

const elapsedMin = (table: any, now: number) =>
  table.startedAt ? Math.floor((now - table.startedAt) / 60_000) : 0;

const groupSize = (groupId: any, tables: any[]) =>
  groupId ? tables.filter((t: any) => t.groupId === groupId).length : 1;

const groupTurnMin = (table: any, tables: any[]) =>
  65 + Math.max(0, groupSize(table.groupId, tables) - 1) * 12;

const remainingMin = (table: any, now: number, tables: any[]) => {
  if (!table.startedAt || (table.status !== "dining" && table.status !== "seated")) return null;
  return Math.max(0, groupTurnMin(table, tables) - Math.floor((now - table.startedAt) / 60_000));
};

const groupTurnMin = (table: any, tables: any[]) =>
  65 + Math.max(0, groupSize(table.groupId, tables) - 1) * 12;
const INITIAL_TABLES = [
  { id: 1,  name: "T1",  x: 60,  y: 60,  capacity: 4,  status: "dining",    party: "Chen",        partySize: 4, startedAt: minutesAgo(28), groupId: null },
  { id: 2,  name: "T2",  x: 180, y: 60,  capacity: 2,  status: "available", party: null,          partySize: null, startedAt: null, groupId: null },
  { id: 3,  name: "T3",  x: 290, y: 60,  capacity: 4,  status: "seated",    party: "Anniversary", partySize: 4, startedAt: minutesAgo(4),  groupId: null },
  { id: 4,  name: "T4",  x: 410, y: 60,  capacity: 6,  status: "available", party: null,          partySize: null, startedAt: null, groupId: null },
  { id: 5,  name: "T5",  x: 540, y: 60,  capacity: 2,  status: "dining",    party: "Patel",       partySize: 2, startedAt: minutesAgo(22), groupId: null },
  { id: 6,  name: "T6",  x: 60,  y: 200, capacity: 8,  status: "dining",    party: "Walsh",       partySize: 7, startedAt: minutesAgo(38), groupId: null },
  { id: 7,  name: "T7",  x: 200, y: 200, capacity: 4,  status: "reserved",  party: "Holloway",    partySize: null, startedAt: null, groupId: null },
  { id: 8,  name: "T8",  x: 320, y: 200, capacity: 4,  status: "available", party: null,          partySize: null, startedAt: null, groupId: null },
  { id: 9,  name: "T9",  x: 440, y: 200, capacity: 6,  status: "available", party: null,          partySize: null, startedAt: null, groupId: null },
  { id: 10, name: "T10", x: 560, y: 200, capacity: 2,  status: "available", party: null,          partySize: null, startedAt: null, groupId: null },
  { id: 11, name: "T11", x: 60,  y: 340, capacity: 4,  status: "dining",    party: "Bergström",   partySize: 4, startedAt: minutesAgo(18), groupId: null },
  { id: 12, name: "T12", x: 200, y: 340, capacity: 4,  status: "available", party: null,          partySize: null, startedAt: null, groupId: null },
  { id: 13, name: "T13", x: 320, y: 340, capacity: 2,  status: "reserved",  party: "Costa",       partySize: null, startedAt: null, groupId: null },
  { id: 14, name: "T14", x: 440, y: 340, capacity: 4,  status: "available", party: null,          partySize: null, startedAt: null, groupId: null },
];

const INITIAL_ARRIVALS = [
  { id: "a1", name: "Walsh family", size: 4,  tag: "VIP",       arrivedAt: minutesAgo(2), note: "24 visits" },
  { id: "a2", name: "Bergström",    size: 2,  tag: "Regular",   arrivedAt: minutesAgo(5), note: "6 visits"  },
  { id: "a3", name: "Okonkwo",      size: 6,  tag: "Pre-order", arrivedAt: minutesAgo(1), note: "$86 pre-paid" },
  { id: "a4", name: "Tanaka party", size: 10, tag: "VIP",       arrivedAt: minutesAgo(3), note: "Needs merge" },
];

const INITIAL_RESERVATIONS = [
  { id: "r1", name: "Holloway", size: 8, time: "7:30p", note: "Birthday" },
  { id: "r2", name: "Reyes",    size: 6, time: "7:45p", note: "Anniversary" },
  { id: "r3", name: "Costa",    size: 4, time: "8:00p", note: "First time" },
  { id: "r4", name: "Lin",      size: 2, time: "8:15p", note: "VIP" },
];

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

const tableSize = (capacity) => 48 + Math.min(Math.max(capacity, 1), 12) * 5;

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

const groupTableLabel = (table, tables) =>
  table.groupId
    ? getGroupTables(table.groupId, tables).map(t => t.name).join(" + ")
    : table.name;

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────

function Header({ now, activeTab, setActiveTab, occupancy }) {
  const time = new Date(now).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const date = new Date(now).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <header className="flex items-center px-6 h-14 bg-panel border-b border-border flex-shrink-0">
      <div className="flex items-baseline gap-2.5 mr-8">
        <span className="font-display text-base font-bold tracking-wide text-ai">MesaOS</span>
        <span className="font-mono text-[9px] text-ink-400 tracking-[0.2em] uppercase">v1.2</span>
      </div>
      <nav className="flex h-full items-stretch">
        {["floor", "reservations", "waitlist", "predictor"].map(t => (
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
          <span className="text-ink-50 font-semibold tabular-nums">{time}</span>
          <span className="mx-2 text-border-hi">·</span>{date}
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-panel-card border border-border-hi rounded font-mono text-[10px] text-ink-50">
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

function Sidebar({ arrivals, reservations, selectedPartyId, setSelectedPartyId, deleteReservation, openModal, now }) {
  return (
    <aside className="w-[300px] bg-panel border-r border-border flex flex-col flex-shrink-0 relative">
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-400 font-bold">Arriving Now</h3>
            <span className="font-mono text-[9px] text-ai">
              {arrivals.length} {arrivals.length === 1 ? "party" : "parties"}
            </span>
          </div>
          {arrivals.length === 0 ? (
            <div className="text-center py-6 text-[12px] italic text-ink-400">No parties arriving</div>
          ) : (
            <div className="flex flex-col gap-2">
              {arrivals.map(p => {
                const wait = Math.floor((now - p.arrivedAt) / 60_000);
                const tagColor = {
                  VIP:        "border-state-seated/50 bg-state-seatedBg/30 text-state-seated",
                  Regular:    "border-state-avail/40 bg-state-availBg/30 text-state-avail",
                  "Pre-order":"border-state-dining/50 bg-state-diningBg/30 text-state-dining",
                }[p.tag];
                const isSelected = selectedPartyId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPartyId(isSelected ? null : p.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all duration-300 ${
                      isSelected
                        ? "border-ai bg-ai-bg/40 shadow-lg shadow-ai/10"
                        : "border-border bg-panel-card hover:border-border-hi hover:shadow-lg"
                    }`}
                  >
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="font-display text-base font-semibold text-ink-50">{p.name}</span>
                      <span className="font-mono text-[10px] text-ink-400 tabular-nums">{wait}m wait</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold tracking-[0.06em] uppercase border ${tagColor}`}>
                        {p.tag}
                      </span>
                      <span className="text-[11px] text-ink-400">
                        Party of <strong className="text-ink-50 font-semibold">{p.size}</strong> · {p.note}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {selectedPartyId && (
            <div className="mt-3 p-3 rounded-lg bg-ai-bg/40 border border-ai/40">
              <div className="font-mono text-[8.5px] text-ai tracking-[0.15em] uppercase mb-1.5 font-bold">
                ◆ Click any available table
              </div>
              <div className="text-[11.5px] text-ink-50/90 leading-relaxed">
                AI suggests <strong className="text-ai">cyan pulsing</strong> tables that fit. Click any other available table to <strong className="text-ink-50">force seat</strong>.
              </div>
            </div>
          )}
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink-400 font-bold">Upcoming Reservations</h3>
            <span className="font-mono text-[9px] text-state-reserved">{reservations.length}</span>
          </div>
          {reservations.length === 0 ? (
            <div className="text-center py-6 text-[12px] italic text-ink-400">No reservations</div>
          ) : (
            <div className="bg-panel-card border border-border rounded-xl overflow-hidden">
              {reservations.map(r => (
                <div key={r.id} className="group flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0 hover:bg-panel-up transition-colors">
                  <span className="font-mono text-xs text-state-reserved font-semibold w-12">{r.time}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-ink-50 font-medium truncate">{r.name}</div>
                    <div className="text-[10px] text-ink-400">Party of {r.size} · {r.note}</div>
                  </div>
                  <button
                    onClick={() => deleteReservation(r.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-400 hover:text-state-seated text-sm leading-none px-1"
                    aria-label="Delete reservation"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <button
        onClick={openModal}
        className="absolute bottom-5 right-5 w-12 h-12 rounded-full bg-ai text-bg font-display text-2xl font-bold shadow-lg shadow-ai/30 hover:scale-110 active:scale-95 transition-transform"
        aria-label="Add reservation"
      >+</button>
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

function FloorMap({
  tables, selectedTableId, setSelectedTableId, selectedPartyId, arrivals,
  editMode, setEditMode, mergeMode, setMergeMode, mergeSelection, setMergeSelection,
  newCapacity, setNewCapacity, addTable, deleteTable,
  dragState, setDragState, moveSourceId, setMoveSourceId,
  attemptSeat, moveParty, clearTable, mergeTables, breakGroup, now,
}) {
  const selectedParty = arrivals.find(a => a.id === selectedPartyId);
  const selectedTable = tables.find(t => t.id === selectedTableId);

  const aiSuggestedIds = useMemo(() => {
    if (!selectedParty) return [];
    return tables
      .filter(t => t.status === "available" && getEffectiveCapacity(t, tables) >= selectedParty.size)
      .map(t => t.id);
  }, [selectedParty, tables]);

  const allAvailableIds = useMemo(() => {
    if (!selectedParty) return [];
    return tables.filter(t => t.status === "available").map(t => t.id);
  }, [selectedParty, tables]);

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

  useEffect(() => {
    if (!dragState) return;
    const onMouseMove = (e) => {
      const canvas = document.getElementById("floor-canvas");
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const newX = Math.max(0, Math.min(rect.width - 60, e.clientX - rect.left - dragState.offsetX));
      const newY = Math.max(0, Math.min(rect.height - 60, e.clientY - rect.top - dragState.offsetY));
      setDragState({ ...dragState, currentX: newX, currentY: newY });
    };
    const onMouseUp = () => setDragState({ ...dragState, finalize: true });
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragState, setDragState]);

  const getEffectivePosition = (table) => {
    if (!dragState) return { x: table.x, y: table.y };
    if (dragState.tableId === table.id) {
      return { x: dragState.currentX, y: dragState.currentY };
    }
    const dragged = tables.find(t => t.id === dragState.tableId);
    if (dragged?.groupId && dragged.groupId === table.groupId) {
      const offset = dragState.groupOffsets[table.id] || { dx: 0, dy: 0 };
      return { x: dragState.currentX + offset.dx, y: dragState.currentY + offset.dy };
    }
    return { x: table.x, y: table.y };
  };

  const startDrag = (e, table) => {
    if (!editMode) return;
    if (e.target.closest("[data-trash-btn]")) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const groupMembers = table.groupId
      ? tables.filter(t => t.groupId === table.groupId)
      : [table];
    const groupOffsets = groupMembers.reduce((acc, t) => {
      acc[t.id] = { dx: t.x - table.x, dy: t.y - table.y };
      return acc;
    }, {});
    setDragState({
      tableId: table.id,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      currentX: table.x, currentY: table.y, groupOffsets,
    });
  };

  const handleTableClick = (e, table) => {
    if (editMode) return;
    if (dragState) return;
    if (mergeMode) {
      if (table.status !== "available" || table.groupId) return;
      setMergeSelection(prev =>
        prev.includes(table.id) ? prev.filter(id => id !== table.id) : [...prev, table.id]
      );
      return;
    }
    if (selectedParty && table.status === "available") {
      attemptSeat(table.id);
      return;
    }
    if (moveSourceId && moveTargetIds.includes(table.id)) {
      moveParty(table.id);
      return;
    }
    setSelectedTableId(table.id === selectedTableId ? null : table.id);
  };

  const groupLines = useMemo(() => {
    const groups = {};
    tables.forEach(t => {
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
        const sa = tableSize(sorted[i].capacity);
        const sb = tableSize(sorted[i + 1].capacity);
        lines.push({
          x1: a.x + sa / 2, y1: a.y + sa / 2,
          x2: b.x + sb / 2, y2: b.y + sb / 2,
        });
      }
    });
    return lines;
  }, [tables, dragState]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border flex-shrink-0 flex-wrap">
        <button onClick={() => { setEditMode(!editMode); setMergeMode(false); setMergeSelection([]); setSelectedTableId(null); setMoveSourceId(null); }}
          className={`px-3 py-1.5 rounded-lg border font-mono text-[10px] tracking-[0.1em] uppercase font-bold transition-all duration-300 ${editMode ? "bg-ai text-bg border-ai shadow-lg shadow-ai/30" : "bg-panel-card text-ink-50 border-border hover:border-border-hi"}`}>
          {editMode ? "✓ Editing" : "Edit Layout"}
        </button>
        <button onClick={() => { setMergeMode(!mergeMode); setEditMode(false); setMergeSelection([]); setSelectedTableId(null); setMoveSourceId(null); }}
          className={`px-3 py-1.5 rounded-lg border font-mono text-[10px] tracking-[0.1em] uppercase font-bold transition-all duration-300 ${mergeMode ? "bg-ai text-bg border-ai shadow-lg shadow-ai/30" : "bg-panel-card text-ink-50 border-border hover:border-border-hi"}`}>
          {mergeMode ? "✓ Merging" : "↔ Merge Tables"}
        </button>
        {editMode && (
          <>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-2 bg-panel-card border border-border-hi rounded-lg px-2 py-1">
              <span className="font-mono text-[9px] text-ink-400 tracking-[0.1em] uppercase">Capacity</span>
              <button onClick={() => setNewCapacity(Math.max(1, newCapacity - 1))} className="w-5 h-5 rounded bg-panel border border-border text-ink-50 text-xs leading-none hover:border-ai">−</button>
              <span className="font-mono text-sm font-bold text-ink-50 w-6 text-center tabular-nums">{newCapacity}</span>
              <button onClick={() => setNewCapacity(Math.min(12, newCapacity + 1))} className="w-5 h-5 rounded bg-panel border border-border text-ink-50 text-xs leading-none hover:border-ai">+</button>
            </div>
            <button onClick={() => addTable(newCapacity)} className="px-3 py-1.5 rounded-lg bg-ai text-bg font-mono text-[10px] tracking-[0.08em] uppercase font-bold">
              + Add table
            </button>
          </>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6 bg-bg">
        <div id="floor-canvas" className={`relative bg-panel rounded-2xl border border-border mx-auto ${editMode || mergeMode ? "ring-1 ring-ai/30" : ""}`}
          style={{ width: 720, height: 460, backgroundImage: editMode ? "radial-gradient(circle, #2a2e3a 1px, transparent 1px)" : "none", backgroundSize: "20px 20px" }}
          onClick={() => { if (!mergeMode) { setSelectedTableId(null); setMoveSourceId(null); } }}>
          <svg className="absolute inset-0 pointer-events-none" width={720} height={460}>
            {groupLines.map((line, i) => (
              <line key={i} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="#5ce1e6" strokeWidth="2" strokeDasharray="5 4" opacity="0.55" />
            ))}
          </svg>
          {tables.map(t => {
            const meta = stateMeta[t.status];
            const size = tableSize(t.capacity);
            const pos = getEffectivePosition(t);
            const isDragging = dragState?.tableId === t.id;
            const isSelected = selectedTableId === t.id;
            const isAiSuggested = aiSuggestedIds.includes(t.id);
            const isReadyManual = !!selectedParty && allAvailableIds.includes(t.id) && !isAiSuggested;
            const isMoveTarget = moveTargetIds.includes(t.id);
            const moveSource = tables.find(x => x.id === moveSourceId);
            const isMoveSourceVisual = moveSourceId === t.id || (moveSource?.groupId && moveSource.groupId === t.groupId);
            const isInMerge = mergeSelection.includes(t.id);
            const isGrouped = !!t.groupId;
            const remaining = remainingMin(t, now, tables);
            const dim = mergeMode && (t.status !== "available" || t.groupId);
            const borderStyle = isGrouped ? `2px dashed ${meta.color}` : `2px solid ${meta.color}`;
            const ringClasses = isInMerge ? "ring-2 ring-ai shadow-lg shadow-ai/40" : isSelected ? "ring-2 ring-ai shadow-lg shadow-ai/30 z-20" : isAiSuggested ? "ring-2 ring-ai shadow-lg shadow-ai/40 animate-pulse z-10" : isMoveTarget ? "ring-2 ring-ai shadow-lg shadow-ai/40 animate-pulse z-10" : isReadyManual ? "ring-1 ring-ai/25 mesa-ready" : "hover:-translate-y-0.5";

            return (
              <div key={t.id} className={`absolute rounded-xl ${meta.bg} flex flex-col items-center justify-center transition-all duration-300 select-none ${ringClasses} ${isDragging ? 'z-30 cursor-grabbing' : 'cursor-pointer'} ${dim ? 'opacity-30' : ''}`}
                style={{ left: pos.x, top: pos.y, width: size, height: size, border: borderStyle }}
                onMouseDown={(e) => startDrag(e, t)}
                onClick={(e) => { e.stopPropagation(); handleTableClick(e, t); }}>
                {editMode && (
                  <button data-trash-btn onClick={(e) => { e.stopPropagation(); deleteTable(t.id); }} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-state-seated text-ink-50 text-xs flex items-center justify-center shadow-lg z-10">×</button>
                )}
                <span className={`font-display text-base font-bold leading-none ${meta.text}`}>{t.name}</span>
                <span className="font-mono text-[9px] text-ink-400 tabular-nums mt-0.5">{t.capacity}-top</span>
                {remaining !== null && remaining > 0 && (
                  <span className={`font-mono text-[8.5px] tabular-nums mt-0.5 font-semibold ${remaining <= 10 ? "text-state-avail" : "text-ink-400"}`}>~{remaining}m</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {selectedTable && !editMode && !mergeMode && (
        <div className="border-t border-border bg-panel-card px-6 py-3 flex items-center gap-4 flex-shrink-0">
          <span className={`font-display text-xl font-bold ${stateMeta[selectedTable.status].text}`}>{selectedTable.name}</span>
          <div className="ml-auto flex items-center gap-2">
            {(selectedTable.status === "dining" || selectedTable.status === "seated") && (
              <button onClick={() => clearTable(selectedTable.id)} className="px-3 py-1.5 rounded-lg bg-panel border border-border-hi text-ink-50 font-mono text-[10px] uppercase tracking-[0.08em] hover:border-state-seated transition-colors">Clear table</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PredictorView({ tables }) {
  const mergedGroups = useMemo(() => {
    const groups = {};
    tables.forEach(t => { if (t.groupId) { if (!groups[t.groupId]) groups[t.groupId] = []; groups[t.groupId].push(t); } });
    return Object.entries(groups).map(([gid, members]) => ({
      gid, tableNames: members.map(t => t.name).join(" + "), capacity: members.reduce((s, t) => s + t.capacity, 0),
      status: members[0].status, party: members[0].party, turnTime: AVG_TURN_MIN + (members.length - 1) * MERGE_TURN_PENALTY
    }));
  }, [tables]);

  return (
    <div className="flex-1 overflow-auto p-6 bg-bg">
      <div className="max-w-[1200px] mx-auto">
        <h2 className="font-display text-2xl font-bold text-ink-50 mb-6 tracking-tight">Volume Forecast</h2>
        <div className="bg-panel border border-border rounded-2xl p-10 text-center text-ink-400 italic">
          AI Predictor active. Flight data sync pending...
        </div>
      </div>
    </div>
  );
}

function ReservationsView({ reservations, deleteReservation, openModal }) {
  return (
    <div className="flex-1 overflow-auto p-6 bg-bg">
      <div className="max-w-[800px] mx-auto">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-display text-2xl font-bold text-ink-50">Tonight's Reservations</h2>
          <button onClick={openModal} className="px-4 py-2 rounded-lg bg-ai text-bg font-mono text-[10px] uppercase font-bold">+ New reservation</button>
        </div>
        <div className="bg-panel border border-border rounded-xl overflow-hidden">
          {reservations.map(r => (
            <div key={r.id} className="flex items-center gap-4 px-5 py-4 border-b border-border group hover:bg-panel-card transition-colors">
              <span className="font-mono text-base text-state-reserved font-semibold w-16">{r.time}</span>
              <div className="flex-1">
                <div className="font-display text-base font-semibold text-ink-50">{r.name}</div>
                <div className="text-[12px] text-ink-400">Party of {r.size} · {r.note}</div>
              </div>
              <button onClick={() => deleteReservation(r.id)} className="opacity-0 group-hover:opacity-100 text-state-seated text-[10px] font-mono uppercase">Delete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WaitlistView({ arrivals, now }) {
  return (
    <div className="flex-1 overflow-auto p-6 bg-bg">
      <div className="max-w-[800px] mx-auto">
        <h2 className="font-display text-2xl font-bold text-ink-50 mb-6">Waitlist</h2>
        <div className="bg-panel border border-border rounded-xl overflow-hidden">
          {arrivals.map(p => (
            <div key={p.id} className="flex items-center gap-4 px-5 py-4 border-b border-border">
              <div className="flex-1">
                <div className="font-display text-base font-semibold text-ink-50">{p.name}</div>
                <div className="text-[12px] text-ink-400">Party of {p.size} · {p.note}</div>
              </div>
              <span className="font-mono text-sm text-ink-400">{Math.floor((now - p.arrivedAt) / 60_000)}m wait</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReservationModal({ onClose, onSubmit }) {
  const [name, setName] = useState("");
  const [size, setSize] = useState(2);
  const [time, setTime] = useState("");
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-panel border border-border-hi rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-xl font-bold text-ink-50 mb-5">New reservation</h3>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="w-full px-3 py-2 bg-panel-card border border-border rounded-lg mb-4 text-white outline-none focus:border-ai" />
        <div className="flex gap-4">
          <input type="number" value={size} onChange={e => setSize(e.target.value)} placeholder="Size" className="flex-1 px-3 py-2 bg-panel-card border border-border rounded-lg mb-4 text-white outline-none focus:border-ai" />
          <input type="text" value={time} onChange={e => setTime(e.target.value)} placeholder="Time" className="flex-1 px-3 py-2 bg-panel-card border border-border rounded-lg mb-4 text-white outline-none focus:border-ai" />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg bg-panel-card border border-border text-ink-50 font-mono text-[11px] uppercase tracking-[0.1em]">Cancel</button>
          <button onClick={() => onSubmit({ name, size, time, note: "—" })} className="flex-1 py-2.5 rounded-lg bg-ai text-bg font-mono text-[11px] uppercase font-bold">Add reservation</button>
        </div>
      </div>
    </div>
  );
}

// ─── ROOT PAGE ───────────────────────────────────────────────────────

export default function Home() {
  const [tables,           setTables]           = useState(INITIAL_TABLES);
  const [arrivals,         setArrivals]         = useState(INITIAL_ARRIVALS);
  const [reservations,     setReservations]     = useState(INITIAL_RESERVATIONS);
  const [activeTab,        setActiveTab]        = useState("floor");
  const [selectedPartyId,  setSelectedPartyId]  = useState(null);
  const [selectedTableId,  setSelectedTableId]  = useState(null);
  const [editMode,         setEditMode]         = useState(false);
  const [mergeMode,        setMergeMode]        = useState(false);
  const [mergeSelection,   setMergeSelection]   = useState([]);
  const [newCapacity,      setNewCapacity]      = useState(4);
  const [moveSourceId,     setMoveSourceId]     = useState(null);
  const [modalOpen,        setModalOpen]        = useState(false);
  const [forceSeatTarget,  setForceSeatTarget]  = useState(null);
  const [dragState,        setDragState]        = useState(null);
  const [toast,            setToast]            = useState(null);
  const [now,              setNow]              = useState(() => Date.now());

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (!dragState?.finalize) return;
    setTables(prev => prev.map(t => {
      if (t.id === dragState.tableId) return { ...t, x: dragState.currentX, y: dragState.currentY };
      const dragged = prev.find(x => x.id === dragState.tableId);
      if (dragged?.groupId && dragged.groupId === t.groupId) {
        const offset = dragState.groupOffsets[t.id];
        if (offset) return { ...t, x: dragState.currentX + offset.dx, y: dragState.currentY + offset.dy };
      }
      return t;
    }));
    setDragState(null);
  }, [dragState]);

  const occupancy = useMemo(() => ({
    occupied: tables.filter(t => t.status === "dining" || t.status === "seated").length,
    total: tables.length || 1,
  }), [tables]);

  const attemptSeat = (tableId) => {
    const party = arrivals.find(a => a.id === selectedPartyId);
    if (!party) return;
    const table = tables.find(t => t.id === tableId);
    if (getEffectiveCapacity(table, tables) >= party.size) {
      performSeat(tableId, false);
    } else {
      setForceSeatTarget(tableId);
    }
  };

  const performSeat = (tableId, isForce) => {
    const party = arrivals.find(a => a.id === selectedPartyId);
    const startedAt = Date.now();
    setTables(prev => prev.map(t => (t.id === tableId || (t.groupId && t.groupId === prev.find(x => x.id === tableId).groupId)) ? { ...t, status: "seated", party: party.name, startedAt } : t));
    setArrivals(prev => prev.filter(a => a.id !== selectedPartyId));
    setToast(isForce ? `Force-seated ${party.name}` : `Seated ${party.name}`);
    setSelectedPartyId(null);
  };

  return (
    <div className="min-h-screen bg-bg text-ink-50 flex flex-col overflow-hidden">
      <Header now={now} activeTab={activeTab} setActiveTab={setActiveTab} occupancy={occupancy} />
      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar arrivals={arrivals} reservations={reservations} selectedPartyId={selectedPartyId} setSelectedPartyId={setSelectedPartyId} deleteReservation={id => setReservations(r => r.filter(x => x.id !== id))} openModal={() => setModalOpen(true)} now={now} />
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeTab === "floor" && <FloorMap tables={tables} selectedTableId={selectedTableId} setSelectedTableId={setSelectedTableId} selectedPartyId={selectedPartyId} arrivals={arrivals} editMode={editMode} setEditMode={setEditMode} mergeMode={mergeMode} setMergeMode={setMergeMode} mergeSelection={mergeSelection} setMergeSelection={setMergeSelection} newCapacity={newCapacity} setNewCapacity={setNewCapacity} addTable={cap => setTables(prev => [...prev, { id: Date.now(), name: `T${prev.length+1}`, x: 100, y: 100, capacity: cap, status: 'available' }])} deleteTable={id => setTables(t => t.filter(x => x.id !== id))} dragState={dragState} setDragState={setDragState} moveSourceId={moveSourceId} setMoveSourceId={setMoveSourceId} attemptSeat={attemptSeat} clearTable={id => setTables(t => t.map(x => x.id === id ? {...x, status: 'available', party: null} : x))} now={now} />}
          {activeTab === "reservations" && <ReservationsView reservations={reservations} deleteReservation={id => setReservations(r => r.filter(x => x.id !== id))} openModal={() => setModalOpen(true)} />}
          {activeTab === "waitlist" && <WaitlistView arrivals={arrivals} now={now} />}
          {activeTab === "predictor" && <PredictorView tables={tables} />}
        </main>
      </div>
      {modalOpen && <ReservationModal onClose={() => setModalOpen(false)} onSubmit={d => { setReservations(r => [...r, {id: Date.now(), ...d}]); setModalOpen(false); }} />}
      {forceSeatTarget && <ForceSeatModal table={tables.find(t => t.id === forceSeatTarget)} party={arrivals.find(a => a.id === selectedPartyId)} tables={tables} onConfirm={() => { performSeat(forceSeatTarget, true); setForceSeatTarget(null); }} onCancel={() => setForceSeatTarget(null)} />}
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-state-avail/20 border border-state-avail text-state-avail rounded-lg z-50">✓ {toast}</div>}
      <style jsx global>{`
        @keyframes mesa-ready {
          0%, 100% { box-shadow: 0 0 0 0 rgba(92, 225, 230, 0.0); }
          50%      { box-shadow: 0 0 0 6px rgba(92, 225, 230, 0.14); }
        }
        .mesa-ready { animation: mesa-ready 2.4s ease-in-out infinite; }
      `}</style>
    </div>
  );
}