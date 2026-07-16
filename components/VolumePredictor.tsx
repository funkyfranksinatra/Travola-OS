// @ts-nocheck
"use client";
import { useState } from 'react';

// ─── VolumePredictor ─────────────────────────────────────────────────
// Dashboard for the 3-week AI volume forecast. Hosts hit a single
// button, wait 5-10 seconds for the LLM to evaluate 24 factors across
// 21 days, then read the result as a 3-row × 7-column grid of day
// cards. Each card shows: dayOfWeek + date, predictedVolume + %change,
// staffing alert badge, reasoning, key-factor tags.
//
// Visual language inherits from MesaOS: bg-panel-card surfaces, cyan
// (bg-ai) for CTAs and headers, ink-50/400 text scale, font-display
// for headlines, font-mono for numbers and tags.
//
// The component is self-contained — drop it anywhere in the app and
// give it a parent with a vertical scroll area. State is local; no
// props required. Optional `baselineCovers` and `restaurantContext`
// props get forwarded to the API for tuning the forecast.
export default function VolumePredictor({ baselineCovers, restaurantContext } = {}) {
  const [forecast, setForecast] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState(null);

  const generateForecast = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(baselineCovers      ? { baselineCovers      } : {}),
          ...(restaurantContext   ? { restaurantContext   } : {}),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.weeks || !Array.isArray(data.weeks)) {
        throw new Error('Malformed forecast response');
      }
      setForecast(data);
    } catch (e) {
      setError(e?.message || 'Failed to generate forecast');
      setForecast(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* ─── Header + CTA ──────────────────────────────────────── */}
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-border">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink-50 mb-1">Volume Predictor</h2>
          <p className="text-sm text-ink-400">
            3-week AI forecast evaluating 24 operational factors. Useful for staffing 1–3 weeks out.
          </p>
        </div>
        <button
          onClick={generateForecast}
          disabled={isLoading}
          className="px-5 py-2.5 rounded-lg bg-ai text-bg font-mono text-[11px] uppercase tracking-[0.1em] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ai/90 transition-colors flex items-center gap-2 flex-shrink-0"
        >
          {isLoading ? (
            <>
              <span className="w-2 h-2 rounded-full bg-bg animate-pulse"></span>
              Forecasting...
            </>
          ) : (
            <>◆ {forecast ? 'Regenerate' : 'Generate'} 3-Week Forecast</>
          )}
        </button>
      </div>

      {/* ─── Error state ───────────────────────────────────────── */}
      {error && !isLoading && (
        <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-700/50 text-red-300 text-sm">
          <strong className="font-bold">Forecast failed:</strong> {error}
          <div className="text-xs text-red-300/70 mt-1">Try again — the model occasionally returns malformed structure.</div>
        </div>
      )}

      {/* ─── Loading skeleton ──────────────────────────────────── */}
      {isLoading && <SkeletonWeeks />}

      {/* ─── Empty state (pre-first-generate) ─────────────────── */}
      {!isLoading && !forecast && !error && <EmptyState />}

      {/* ─── Forecast result ───────────────────────────────────── */}
      {!isLoading && forecast && (
        <div className="space-y-8">
          {forecast.weeks.map((week, wIdx) => (
            <WeekSection key={wIdx} week={week} />
          ))}
          <ForecastFooter weekCount={forecast.weeks.length} />
        </div>
      )}
    </div>
  );
}

// ─── Week section ────────────────────────────────────────────────────
function WeekSection({ week }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <span className="w-1.5 h-5 bg-ai rounded-sm flex-shrink-0"></span>
        <h3 className="font-display text-lg font-bold text-ink-50">{week.weekLabel}</h3>
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-400">
          {week.days?.length || 0} days
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {week.days?.map((day, dIdx) => <DayCard key={dIdx} day={day} />)}
      </div>
    </section>
  );
}

// ─── Day card ────────────────────────────────────────────────────────
// The atomic unit of the forecast. Each card carries everything the
// host needs at-a-glance: when, how many, vs baseline, action signal,
// reason, supporting factors. Layout is intentionally vertical so
// scanning across 21 cards reads as a rhythm.
function DayCard({ day }) {
  const isPositive = day.percentageChange > 0;
  const isFlat     = day.percentageChange === 0;
  const pctColor   = isFlat
    ? 'text-ink-400'
    : isPositive ? 'text-emerald-400' : 'text-red-400';
  const pctIcon    = isFlat ? '—' : isPositive ? '↑' : '↓';

  return (
    <div className="bg-panel-card border border-border rounded-xl p-4 flex flex-col gap-2.5 hover:border-border-hi transition-colors">
      {/* Header — day name + date */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-sm font-bold text-ink-50 leading-none">{day.dayOfWeek}</span>
        <span className="font-mono text-[10px] text-ink-400 tabular-nums leading-none">{day.date}</span>
      </div>

      {/* Volume + % change */}
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-bold text-ink-50 tabular-nums leading-none">{day.predictedVolume}</span>
        <span className={`font-mono text-xs font-bold ${pctColor} tabular-nums flex items-center gap-0.5 leading-none`}>
          <span>{pctIcon}</span>
          <span>{Math.abs(day.percentageChange)}%</span>
        </span>
      </div>
      <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-ink-400">covers</span>

      {/* Staffing alert badge */}
      <StaffingBadge prediction={day.staffingPrediction} />

      {/* Reasoning */}
      <p className="text-xs text-ink-400 italic leading-snug">
        {day.reasoningSummary}
      </p>

      {/* Key factors */}
      {day.keyFactors?.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1 border-t border-border/50">
          {day.keyFactors.map((f, i) => (
            <span
              key={i}
              className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-panel-up text-ink-50/80 border border-border"
            >
              #{f.replace(/\s+/g, '')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Staffing alert badge ────────────────────────────────────────────
function StaffingBadge({ prediction }) {
  const config = {
    understaffed: {
      label: 'Understaffed',
      classes: 'bg-red-500/15 text-red-300 border-red-500/40',
      dot:    'bg-red-400 animate-pulse',
    },
    optimal: {
      label: 'Optimal',
      classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
      dot:    'bg-emerald-400',
    },
    overstaffed: {
      label: 'Overstaffed',
      classes: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
      dot:    'bg-blue-400',
    },
  };
  const c = config[prediction] || config.optimal;
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border font-mono text-[10px] font-bold uppercase tracking-wider ${c.classes} self-start`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></span>
      {c.label}
    </div>
  );
}

// ─── Skeleton loader ─────────────────────────────────────────────────
// LLM calls for this forecast take 5-10 seconds. Without visible
// activity, the host might think the button click missed. The
// skeleton previews the final layout shape so they can mentally
// pre-load the structure while waiting.
function SkeletonWeeks() {
  return (
    <div className="space-y-8">
      {[0, 1, 2].map(w => (
        <section key={w}>
          <div className="flex items-center gap-3 mb-3">
            <span className="w-1.5 h-5 bg-border rounded-sm animate-pulse"></span>
            <div className="h-5 w-40 bg-panel-card rounded animate-pulse"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {[0, 1, 2, 3, 4, 5, 6].map(d => (
              <div
                key={d}
                className="bg-panel-card border border-border rounded-xl p-4 flex flex-col gap-2.5"
                style={{ animationDelay: `${(w * 7 + d) * 40}ms` }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="h-4 w-16 bg-panel-up rounded animate-pulse"></div>
                  <div className="h-3 w-12 bg-panel-up rounded animate-pulse"></div>
                </div>
                <div className="h-9 w-20 bg-panel-up rounded animate-pulse"></div>
                <div className="h-3 w-12 bg-panel-up rounded animate-pulse"></div>
                <div className="h-6 w-24 bg-panel-up rounded-md animate-pulse"></div>
                <div className="space-y-1">
                  <div className="h-2 w-full bg-panel-up rounded animate-pulse"></div>
                  <div className="h-2 w-3/4 bg-panel-up rounded animate-pulse"></div>
                </div>
                <div className="flex flex-wrap gap-1 pt-1 border-t border-border/50">
                  {[0, 1, 2].map(t => (
                    <div key={t} className="h-3.5 w-12 bg-panel-up rounded animate-pulse"></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <div className="text-center text-xs text-ink-400 italic mt-4">
        Evaluating 24 operational factors across 21 days. Typically 5–10 seconds...
      </div>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="bg-panel-card border border-border border-dashed rounded-xl p-12 text-center">
      <div className="text-4xl mb-3 opacity-40">◆</div>
      <h3 className="font-display text-lg font-bold text-ink-50 mb-2">
        No forecast yet
      </h3>
      <p className="text-sm text-ink-400 max-w-md mx-auto">
        Click <strong className="text-ai">Generate 3-Week Forecast</strong> to evaluate 24 operational factors (weather, holidays, paydays, local events, and more) across the next 21 days.
      </p>
    </div>
  );
}

// ─── Forecast footer ─────────────────────────────────────────────────
// Small attribution at the bottom of a completed forecast — reminds
// the host that this is AI-generated and not deterministic, so they
// shouldn't treat it as gospel for major staffing commitments.
function ForecastFooter({ weekCount }) {
  return (
    <div className="text-center text-[10px] text-ink-400/60 italic pt-4 border-t border-border/40 font-mono tracking-wide">
      AI-generated forecast across {weekCount * 7} days. Regenerate for an updated read.
    </div>
  );
}