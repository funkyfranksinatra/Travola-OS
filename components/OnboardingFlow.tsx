'use client';

import React, { useState } from 'react';

type Baseline = Record<string, number | null | { offFrom?: number; offTo?: number; onFrom?: number; onTo?: number } | null>;

export default function OnboardingFlow({ stage = 'path', onStage, onSkip, onCreate, onMigrate, onSettings, onImport, onBaseline }: {
  stage?: string;
  onStage: (stage: string) => void;
  onSkip: () => void;
  onCreate: () => void;
  onMigrate: () => void;
  onSettings: () => void;
  onImport: () => void;
  onBaseline: (baseline: Baseline) => void;
}) {
  const [question, setQuestion] = useState(0);
  const [baseline, setBaseline] = useState<Baseline>({});
  const fields = [
    ['avgCovers', 'Average covers per night?', 'number'], ['maxCovers', 'Most covers in one night last year?', 'number'],
    ['minCovers', 'Least covers in one night last year?', 'number'], ['resSharePct', 'Reservation share vs walk-ins? (%)', 'number'],
    ['holidayBoostPct', 'Holiday boost? (0–999%)', 'number'], ['eventBoostPct', 'Local-event boost? (0–999%)', 'number'],
    ['seasons', 'On/off seasons? Leave blank for none.', 'season'], ['turnMinutes', 'Average table turn time (minutes)?', 'number'],
  ] as const;
  const advanceQuestion = () => {
    if (question + 1 < fields.length) setQuestion(question + 1);
    else { onBaseline(baseline); onStage('wrap'); }
  };
  const card = (title: string, body: string, children: React.ReactNode) => <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-5"><div className="w-full max-w-lg rounded-2xl border border-ai/60 bg-panel p-7 shadow-[0_0_45px_rgba(139,139,255,.28)]"><div className="font-mono text-[9px] uppercase tracking-[.18em] text-ai">new restaurant setup</div><h1 className="mt-2 font-display text-2xl font-bold text-ink-50">{title}</h1><p className="mt-3 font-mono text-[11px] leading-relaxed text-ink-300">{body}</p><div className="mt-6">{children}</div><button onClick={onSkip} className="mt-5 font-mono text-[10px] uppercase tracking-[.1em] text-ink-400 hover:text-ink-50">Skip setup</button></div></div>;
  if (stage === 'path') return card('Build your first floor', 'Start from an existing plan or make one here.', <div className="grid gap-3 sm:grid-cols-2"><button onClick={() => { onMigrate(); onStage('migration'); }} className="rounded-xl border border-border-hi bg-panel-card p-4 text-left hover:border-ai"><b className="text-ink-50">Migrate an existing floor plan</b><span className="mt-1 block font-mono text-[10px] text-ink-400">Upload a photo or screenshot.</span></button><button onClick={() => { onCreate(); onStage('editor'); }} className="rounded-xl border border-ai bg-ai/10 p-4 text-left hover:bg-ai/15"><b className="text-ai">Create your own floor plan</b><span className="mt-1 block font-mono text-[10px] text-ink-300">Open Edit Layout on an empty floor.</span></button></div>);
  if (stage === 'migration' || stage === 'editor' || stage === 'editor-reposition' || stage === 'floors' || stage === 'settings' || stage === 'team' || stage === 'team-add' || stage === 'team-exit' || stage === 'location' || stage === 'settings-key' || stage === 'import') return null;
  if (stage === 'history') return card('Import history', 'Critical to AI accuracy! Export history from OpenTable, Resy, or any reservation book and import it. Without it, AI accuracy is reduced for about a month while data accumulates.', <div className="flex justify-between gap-3"><button onClick={() => onStage('baseline')} className="font-mono text-[10px] uppercase tracking-[.1em] text-ink-300">I’ll answer setup questions</button><button onClick={() => { onImport(); onStage('import'); }} className="rounded-md bg-ai px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[.1em] text-bg">Import history</button></div>);
  if (stage === 'baseline') {
    const [key, label, type] = fields[question];
    return card('Baseline setup', label, <><div className="mt-2">{type === 'season' ? <div className="grid grid-cols-2 gap-2">{['offFrom','offTo','onFrom','onTo'].map(k => <input key={k} type="number" min="1" max="12" placeholder={k.replace(/([A-Z])/g, ' $1')} onChange={e => setBaseline(b => ({ ...b, seasons: { ...(b.seasons as object || {}), [k]: e.target.value === '' ? undefined : Number(e.target.value) } }))} className="w-full rounded-lg border border-border-hi bg-panel-card px-3 py-2 font-mono text-sm text-ink-50" />)}</div> : <input type="number" min="0" max={key === 'holidayBoostPct' || key === 'eventBoostPct' ? 999 : undefined} value={(baseline[key] as number) ?? ''} onChange={e => setBaseline(b => ({ ...b, [key]: e.target.value === '' ? null : Number(e.target.value) }))} className="w-full rounded-lg border border-border-hi bg-panel-card px-3 py-2 font-mono text-sm text-ink-50" />}</div><div className="mt-5 flex justify-between"><button onClick={advanceQuestion} className="font-mono text-[10px] uppercase tracking-[.1em] text-ink-300">Skip question</button><button onClick={advanceQuestion} className="rounded-md bg-ai px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[.1em] text-bg">Next · {question + 1}/8</button></div></>);
  }
  return card('You’re ready', 'Fill out the rest of Settings when you can — hours, days open, and service defaults.', <div className="flex justify-end"><button onClick={onSkip} className="rounded-md bg-ai px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[.1em] text-bg">Finish setup</button></div>);
}
