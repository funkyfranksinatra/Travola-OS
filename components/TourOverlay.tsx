'use client';

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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
  const cardRef = useRef<HTMLDivElement>(null);
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
    const startedAt = Date.now();
    let warned = false;
    const update = () => {
      const el = document.querySelector(`[data-tour="${CSS.escape(step.anchor!)}"]`);
      if (!el) {
        setRect(current => current === null ? current : null);
        if (!warned && Date.now() - startedAt >= 1500) {
          warned = true;
          if (process.env.NODE_ENV !== 'production') console.warn(`[tour] missing data-tour anchor: ${step.anchor}`);
        }
        return;
      }
      const r = el.getBoundingClientRect();
      const next = { top: r.top, left: r.left, width: r.width, height: r.height };
      setRect(current => current && current.top === next.top && current.left === next.left && current.width === next.width && current.height === next.height ? current : next);
    };
    update();
    const poll = window.setInterval(update, 150);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
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

  // Visuals never intercept clicks. This capture listener keeps the lit
  // target interactive, advances click-anywhere steps from the dim area,
  // and blocks only deliberate blocking steps outside their target.
  useEffect(() => {
    if (!step || (!rect && step.anchor)) return;
    const pad = 8;
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && cardRef.current?.contains(target)) return;
      const insideSpotlight = !!rect && event.clientX >= rect.left - pad
        && event.clientX <= rect.left + rect.width + pad
        && event.clientY >= rect.top - pad
        && event.clientY <= rect.top + rect.height + pad;
      if (insideSpotlight) return;
      if (step.advanceOn === 'click-anywhere') {
        event.preventDefault();
        event.stopImmediatePropagation();
        advance();
      } else if (!step.passThrough) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [advance, rect, step]);

  if (!step) return null;
  const pad = 8;
  const cardStyle: React.CSSProperties = rect
    ? { position: 'fixed', top: Math.min(window.innerHeight - 180, Math.max(16, rect.top + rect.height + 14)), left: Math.min(window.innerWidth - 330, Math.max(16, rect.left)), zIndex: 71 }
    : { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 71 };

  return (
    <div className="pointer-events-none fixed inset-0 z-[110]" aria-live="polite">
      {rect && <div className="fixed rounded-xl border border-ai/80 ring-2 ring-ai/80 pointer-events-none" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 100vmax rgba(0,0,0,0.7)' }} />}
      <div ref={cardRef} className="pointer-events-auto w-[min(330px,calc(100vw-32px)) rounded-xl border border-ai/70 bg-panel-card p-4 shadow-[0_0_35px_rgba(139,139,255,.38)]" style={cardStyle} onClick={(e) => e.stopPropagation()}>
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
