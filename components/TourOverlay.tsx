'use client';

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';

export type TourAdvance = `event:${string}` | 'click-anywhere' | 'next';
export type TourStep = {
  id: string;
  anchor?: string;
  title: string;
  body: string;
  advanceOn: TourAdvance;
  allowNext?: boolean;
  passThrough?: boolean;
};

type TourValue = { notify: (event: string) => void };
const TourContext = createContext<TourValue>({ notify: () => {} });

export function TourProvider({ children }: { children: React.ReactNode }) {
  const notify = useCallback((event: string) => {
    window.dispatchEvent(new CustomEvent('travola-tour-event', { detail: event }));
  }, []);
  const value = useMemo(() => ({ notify }), [notify]);
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() { return useContext(TourContext); }

type Rect = { top: number; left: number; width: number; height: number } | null;

export function TourOverlay({ steps, active = true, onComplete, onStepChange, onSkip, label = 'setup' }: {
  steps: TourStep[];
  active?: boolean;
  onComplete?: () => void;
  onStepChange?: (step: TourStep | null) => void;
  onSkip?: () => void;
  label?: string;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect>(null);
  const step = active ? steps[index] : null;
  const advance = useCallback(() => {
    setIndex(current => {
      if (current + 1 >= steps.length) { onComplete?.(); return current; }
      return current + 1;
    });
  }, [onComplete, steps.length]);

  useEffect(() => { setIndex(0); }, [active]);
  useEffect(() => { onStepChange?.(step); }, [onStepChange, step]);

  useLayoutEffect(() => {
    if (!step?.anchor) { setRect(null); return; }
    const update = () => {
      const el = document.querySelector(`[data-tour="${CSS.escape(step.anchor!)}"]`);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [step?.anchor]);

  // The context is deliberately event-only; custom events keep this small
  // component independent from the 9k-line app's handler ownership.
  useEffect(() => {
    const handler = (event: Event) => {
      const name = (event as CustomEvent<string>).detail;
      if (step?.advanceOn === `event:${name}`) advance();
    };
    window.addEventListener('travola-tour-event', handler);
    return () => window.removeEventListener('travola-tour-event', handler);
  }, [advance, step?.advanceOn]);

  if (!step) return null;
  const pad = 8;
  const cardStyle: React.CSSProperties = rect
    ? { position: 'fixed', top: Math.min(window.innerHeight - 180, Math.max(16, rect.top + rect.height + 14)), left: Math.min(window.innerWidth - 330, Math.max(16, rect.left)), zIndex: 71 }
    : { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 71 };

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]" aria-live="polite">
      {rect ? <>
        <div className={`fixed inset-x-0 top-0 bg-black/70 ${step.passThrough ? 'pointer-events-none' : 'pointer-events-auto'}`} style={{ height: Math.max(0, rect.top - pad) }} onClick={() => step.advanceOn === 'click-anywhere' && advance()} />
        <div className={`fixed bottom-0 left-0 bg-black/70 ${step.passThrough ? 'pointer-events-none' : 'pointer-events-auto'}`} style={{ top: rect.top - pad, width: Math.max(0, rect.left - pad) }} onClick={() => step.advanceOn === 'click-anywhere' && advance()} />
        <div className={`fixed bottom-0 right-0 bg-black/70 ${step.passThrough ? 'pointer-events-none' : 'pointer-events-auto'}`} style={{ top: rect.top - pad, left: rect.left + rect.width + pad }} onClick={() => step.advanceOn === 'click-anywhere' && advance()} />
        <div className={`fixed inset-x-0 bottom-0 bg-black/70 ${step.passThrough ? 'pointer-events-none' : 'pointer-events-auto'}`} style={{ top: rect.top + rect.height + pad }} onClick={() => step.advanceOn === 'click-anywhere' && advance()} />
        <div className="fixed rounded-xl ring-2 ring-ai pointer-events-none" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      </> : <div className={`absolute inset-0 bg-black/70 ${step.passThrough ? 'pointer-events-none' : 'pointer-events-auto'}`} onClick={() => step.advanceOn === 'click-anywhere' && advance()} />}
      <div className="pointer-events-auto w-[min(330px,calc(100vw-32px)) rounded-xl border border-ai/70 bg-panel-card p-4 shadow-[0_0_35px_rgba(139,139,255,.38)]" style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div className="font-mono text-[9px] uppercase tracking-[.16em] text-ai">{label} · {index + 1}/{steps.length}</div>
        <h2 className="mt-1 font-display text-base font-bold text-ink-50">{step.title}</h2>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink-300">{step.body}</p>
        <div className="mt-4 flex justify-end gap-2">
          {onSkip && <button onClick={onSkip} className="px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[.1em] text-ink-300 hover:text-ink-50">Skip setup</button>}
          {(step.advanceOn === 'next' || step.allowNext) && <button onClick={advance} className="rounded-md bg-ai px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[.1em] text-bg">Next</button>}
        </div>
      </div>
    </div>
  );
}

// One-line handler instrumentation uses this helper rather than importing
// context into the existing monolith's nested functions.
export function notifyTour(event: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('travola-tour-event', { detail: event }));
}
