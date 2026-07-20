'use client';

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type TourAdvance = `event:${string}` | 'click-anywhere' | 'next';
export type TourStep = {
  id: string;
  /** One or more spotlight targets. `anchor` remains shorthand for one. */
  anchors?: string[];
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

type Rect = { top: number; left: number; width: number; height: number };

export function TourOverlay({ steps, active = true, onComplete, onStepChange, onSkip, label = 'setup' }: {
  steps: TourStep[];
  active?: boolean;
  onComplete?: () => void;
  onStepChange?: (step: TourStep | null) => void;
  onSkip?: () => void;
  label?: string;
}) {
  const [index, setIndex] = useState(0);
  const [rects, setRects] = useState<Rect[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const maskId = useRef(`travola-tour-mask-${Math.random().toString(36).slice(2)}`).current;
  const step = active ? steps[index] : null;
  const anchors = useMemo(() => {
    if (!step) return [];
    return [...new Set(step.anchors?.length ? step.anchors : (step.anchor ? [step.anchor] : []))];
  }, [step]);
  const anchorKey = anchors.join('\u0001');
  const primaryRect = rects[0] || null;
  const advance = useCallback(() => {
    setIndex(current => {
      if (current + 1 >= steps.length) { onComplete?.(); return current; }
      return current + 1;
    });
  }, [onComplete, steps.length]);
  const next = useCallback(() => {
    if (step?.advanceOn.startsWith('event:')) {
      // Do not skip an action-gated stage. Let the user get the card out of
      // the way while its event/state listener remains armed.
      setDismissed(true);
      return;
    }
    advance();
  }, [advance, step?.advanceOn]);

  useEffect(() => { setIndex(0); }, [active]);
  useEffect(() => { setDismissed(false); }, [active, index]);
  useEffect(() => { onStepChange?.(step); }, [onStepChange, step]);

  useLayoutEffect(() => {
    if (!anchors.length) { setRects([]); return; }
    const startedAt = Date.now();
    let warned = false;
    const update = () => {
      const next = anchors.flatMap(anchor => {
        const el = document.querySelector(`[data-tour="${CSS.escape(anchor)}"]`);
        if (!el) return [];
        const r = el.getBoundingClientRect();
        return [{ top: r.top, left: r.left, width: r.width, height: r.height }];
      });
      if (!next.length) {
        setRects(current => current.length ? [] : current);
        if (!warned && Date.now() - startedAt >= 1500) {
          warned = true;
          if (process.env.NODE_ENV !== 'production') console.warn(`[tour] missing data-tour anchors: ${anchors.join(', ')}`);
        }
        return;
      }
      setRects(current => current.length === next.length && current.every((rect, i) => rect.top === next[i].top && rect.left === next[i].left && rect.width === next[i].width && rect.height === next[i].height) ? current : next);
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
  }, [anchorKey]);

  // The context is deliberately event-only; custom events keep this small
  // component independent from the 9k-line app's handler ownership.
  useEffect(() => {
    const handler = (event: Event) => {
      const name = (event as CustomEvent<string>).detail;
      if (step?.advanceOn === `event:${name}`) { setDismissed(false); advance(); }
    };
    window.addEventListener('travola-tour-event', handler);
    return () => window.removeEventListener('travola-tour-event', handler);
  }, [advance, step?.advanceOn]);

  // Visuals never intercept clicks. This capture listener keeps the lit
  // target interactive, advances click-anywhere steps from the dim area,
  // and blocks only deliberate blocking steps outside their target.
  useEffect(() => {
    // A named step with no currently mounted target is deliberately
    // non-blocking. The floating hint remains useful while polling finds it.
    if (!step || dismissed || (!rects.length && anchors.length)) return;
    const pad = 8;
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && cardRef.current?.contains(target)) return;
      const insideSpotlight = rects.some(rect => event.clientX >= rect.left - pad
        && event.clientX <= rect.left + rect.width + pad
        && event.clientY >= rect.top - pad
        && event.clientY <= rect.top + rect.height + pad);
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
  }, [advance, anchors.length, dismissed, rects, step]);

  if (!step) return null;
  const pad = 8;
  const cardStyle: React.CSSProperties = primaryRect
    ? { position: 'fixed', top: Math.min(window.innerHeight - 180, Math.max(16, primaryRect.top + primaryRect.height + 14)), left: Math.min(window.innerWidth - 330, Math.max(16, primaryRect.left)), zIndex: 71 }
    : { position: 'fixed', right: 16, bottom: 16, zIndex: 71 };

  if (dismissed) return (
    <div className="fixed bottom-4 right-4 z-[110] pointer-events-none">
      <button onClick={() => setDismissed(false)} className="pointer-events-auto rounded-full border border-ai/60 bg-panel-card px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[.09em] text-ai shadow-[0_0_22px_rgba(139,139,255,.24)] hover:bg-panel-up">
        {label} · resume tip
      </button>
    </div>
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[110]" aria-live="polite">
      {rects.length > 0 && <svg className="fixed inset-0 h-full w-full pointer-events-none" aria-hidden="true">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <rect width="100%" height="100%" fill="white" />
            {rects.map((rect, i) => <rect key={i} x={rect.left - pad} y={rect.top - pad} width={rect.width + pad * 2} height={rect.height + pad * 2} rx="12" fill="black" />)}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.7)" mask={`url(#${maskId})`} />
        {rects.map((rect, i) => <rect key={i} x={rect.left - pad} y={rect.top - pad} width={rect.width + pad * 2} height={rect.height + pad * 2} rx="12" fill="none" stroke="rgba(139,139,255,0.9)" strokeWidth="2" />)}
      </svg>}
      <div ref={cardRef} className="pointer-events-auto w-[min(330px,calc(100vw-32px)) rounded-xl border border-ai/70 bg-panel-card p-4 shadow-[0_0_35px_rgba(139,139,255,.38)]" style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div className="font-mono text-[9px] uppercase tracking-[.16em] text-ai">{label} · {index + 1}/{steps.length}</div>
        <h2 className="mt-1 font-display text-base font-bold text-ink-50">{step.title}</h2>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink-300">{step.body}</p>
        <div className="mt-4 flex justify-end gap-2">
          {onSkip && <button onClick={onSkip} className="px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[.1em] text-ink-300 hover:text-ink-50">Skip setup</button>}
          <button onClick={next} className="rounded-md bg-ai px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[.1em] text-bg">Next</button>
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
