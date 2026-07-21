'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

type Message = { id: string; role: 'user' | 'assistant'; content: string };
type Alert = { text: string; severity: string };

const SUGGESTIONS = [
  'Which tables will turn next?',
  'Which parties are close to finishing?',
  'Which servers have the highest cover counts tonight?',
  'Which servers need more tables to catch up?',
];

export default function Copilot({ suppressed = false, floorEvent = 0, today, viewDate }: { suppressed?: boolean; floorEvent?: number; today: string; viewDate: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const [hasAlert, setHasAlert] = useState(false);
  const sentryCount = useRef(0);
  const lastSentryAt = useRef(0);
  const lastAlertText = useRef('');
  const lastFloorEvent = useRef(floorEvent);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }); }, [messages, loading]);
  useEffect(() => { if (!draft && inputRef.current) inputRef.current.style.height = 'auto'; }, [draft]);
  useEffect(() => {
    if (!showAlert) return;
    const timer = window.setTimeout(() => setShowAlert(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [showAlert]);
  useEffect(() => {
    if (suppressed) { setShowAlert(false); setOpen(false); }
  }, [suppressed]);

  const runSentry = useCallback(async () => {
    if (suppressed || document.visibilityState === 'hidden' || sentryCount.current >= 15 || Date.now() - lastSentryAt.current < 3 * 60_000) return;
    lastSentryAt.current = Date.now();
    sentryCount.current += 1;
    try {
      const response = await fetch('/api/copilot/sentry', { method: 'POST' });
      if (!response.ok) return;
      const data = await response.json();
      const next = data?.alert as Alert | null;
      if (!next?.text || next.text === lastAlertText.current) return;
      lastAlertText.current = next.text;
      setAlert(next); setHasAlert(true); setShowAlert(true);
    } catch { /* advisory alert failures never interrupt service */ }
  }, [suppressed]);

  useEffect(() => {
    if (floorEvent === lastFloorEvent.current) return;
    lastFloorEvent.current = floorEvent;
    void runSentry();
  }, [floorEvent, runSentry]);

  const send = useCallback(async (raw: string) => {
    const content = raw.trim();
    if (!content || loading) return;
    const user: Message = { id: `u-${Date.now()}`, role: 'user', content };
    setMessages((current) => [...current, user]);
    setDraft(''); setLoading(true);
    try {
      const response = await fetch('/api/copilot/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, user].map(({ role, content: message }) => ({ role, content: message })), context: { today, viewDate } }),
      });
      const data = await response.json().catch(() => ({}));
      const answer = response.ok ? data.answer : 'Co-pilot is unavailable right now. Keep running the floor and try again shortly.';
      setMessages((current) => [...current, { id: `a-${Date.now()}`, role: 'assistant', content: String(answer || 'I do not have enough current data to answer that yet.') }]);
    } catch {
      setMessages((current) => [...current, { id: `a-${Date.now()}`, role: 'assistant', content: 'Co-pilot is unavailable right now. Keep running the floor and try again shortly.' }]);
    } finally { setLoading(false); }
  }, [loading, messages, today, viewDate]);

  const openWithAlert = () => {
    setOpen(true); setShowAlert(false); setHasAlert(false);
    if (alert && !messages.some((message) => message.content === alert.text)) {
      setMessages((current) => [{ id: `alert-${Date.now()}`, role: 'assistant', content: alert.text }, ...current]);
    }
  };

  if (suppressed) return null;
  return <>
    {showAlert && alert && <button onClick={openWithAlert} className="fixed bottom-20 right-4 z-40 w-[min(300px,calc(100vw-32px))] animate-[mesa-rail-in_0.2s_ease-out] rounded-lg border border-ai/70 bg-panel-card px-3 py-2.5 text-left shadow-[0_0_25px_rgba(139,139,255,.32)]">
      <div className="font-mono text-[8px] font-bold uppercase tracking-[.16em] text-ai">Floor alert · {alert.severity}</div>
      <div className="mt-1 font-mono text-[11px] leading-snug text-ink-100">{alert.text}</div>
    </button>}
    <button onClick={() => { if (hasAlert && alert) openWithAlert(); else { setOpen(true); void runSentry(); } }} aria-label="Open co-pilot" title="Travola co-pilot" className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-ai/70 bg-panel-card text-ai shadow-[0_0_24px_rgba(139,139,255,.35)] transition hover:bg-panel-up hover:shadow-[0_0_30px_rgba(139,139,255,.55)]">
      <svg aria-hidden="true" width="27" height="27" viewBox="0 0 32 32" fill="none"><rect x="6" y="13" width="20" height="4" rx="2" fill="currentColor"/><path d="M11 19 9 26M21 19l2 7" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"/><circle cx="24.5" cy="7.5" r="2.5" fill="#e0b063"/><path d="M19.5 8c1.1-1.4 2.4-2.2 4-2.5M25 12c1.3-.4 2.3-1.1 3-2.1" stroke="#e0b063" strokeWidth="1.5" strokeLinecap="round"/></svg>{hasAlert && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-panel-card bg-amber-400" />}
    </button>
    {open && <aside className="fixed inset-y-0 right-0 z-40 flex w-[min(390px,100vw)] flex-col border-l border-border bg-panel shadow-2xl animate-[mesa-rail-in_0.2s_ease-out]" aria-label="Co-pilot">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div><div className="font-display text-lg font-bold text-ink-50">Co-pilot</div><div className="font-mono text-[9px] uppercase tracking-[.14em] text-ai">Advisory · read only</div></div>
        <button onClick={() => setOpen(false)} className="px-2 text-xl leading-none text-ink-400 hover:text-ink-50" aria-label="Close co-pilot">×</button>
      </header>
      <div ref={threadRef} className="flex-1 overflow-y-auto p-4">
        {!messages.length && <div className="space-y-2">
          <p className="mb-3 font-mono text-[11px] leading-relaxed text-ink-400">Ask for a read on the floor. I advise; your team decides.</p>
          {SUGGESTIONS.map((question) => <button key={question} onClick={() => void send(question)} className="block w-full rounded-md border border-border bg-panel-card px-3 py-2 text-left font-mono text-[10px] leading-snug text-ink-200 transition hover:border-ai/60 hover:text-ink-50">{question}</button>)}
        </div>}
        <div className="space-y-3">{messages.map((message) => <div key={message.id} className={message.role === 'user' ? 'ml-8 rounded-lg bg-ai/15 px-3 py-2 font-mono text-[14px] leading-relaxed text-ink-100' : 'mr-4 rounded-lg border border-border bg-panel-card px-3 py-2 font-mono text-[14px] leading-relaxed whitespace-pre-wrap text-ink-200'}>{message.content}</div>)}</div>
        {loading && <div className="mt-3 font-mono text-[10px] uppercase tracking-[.14em] text-ai animate-pulse">Reading the floor…</div>}
      </div>
      <form onSubmit={(event: FormEvent) => { event.preventDefault(); void send(draft); }} className="border-t border-border p-3">
        <div className="flex items-end gap-2"><textarea ref={inputRef} value={draft} onChange={(event) => { setDraft(event.target.value); event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 96)}px`; }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(draft); } }} disabled={loading} rows={1} placeholder="Ask co-pilot…" className="min-h-9 max-h-24 min-w-0 flex-1 resize-none overflow-x-hidden overflow-y-auto rounded-md border border-border-hi bg-panel-card px-3 py-2 font-mono text-[14px] leading-relaxed text-ink-50 outline-none placeholder:text-ink-400 focus:border-ai" /><button disabled={loading || !draft.trim()} className="h-9 rounded-md bg-ai px-3 font-mono text-[10px] font-bold uppercase tracking-[.1em] text-bg disabled:opacity-40">Send</button></div>
      </form>
    </aside>}
  </>;
}
