# Travola

Travola is AI-native table management for independent restaurants: a manager floor console and host PWA, deterministic shift forecasting informed by live web research, an advisory co-pilot, pre-shift briefings, a self-correcting forecast watchdog, and fully isolated multi-restaurant accounts.

## For judges — try it in 5 minutes

There is no shared demo account because the product experience is creating your own restaurant and being guided through it.

1. Open [Travola in production](https://travola-os-tablai.vercel.app).
2. Choose **Create restaurant**, enter any restaurant name and a four-digit passcode, then follow the guided setup.
3. To try the migration path, use [sample-floorplan.png](demo-assets/sample-floorplan.png). It recreates the matching starter layout.
4. When setup offers history import, use [sample-history.csv](demo-assets/sample-history.csv). It matches tables 1–13, is closed Mondays, runs Fri/Sat-heavy volume, and has roughly 92-minute turns.
5. Run the Predictor for tomorrow, generate **Tonight’s Game Plan**, then open the bottom-right **Co-pilot** and ask about the week.
6. Visit [`/host`](https://travola-os-tablai.vercel.app/host) to see the dedicated host-stand surface.

## GPT-5.6 usage

| Capability | Where it runs | Model / implementation |
| --- | --- | --- |
| Programmatic tool calling | Co-pilot chat uses read-only, tenant-scoped tools for the floor, book, waitlist, roster, history, forecast, deterministic seating suggestion, and in-app help. | `COPILOT_MODEL`: `gpt-5.6-terra` via the official OpenAI Responses API |
| Proactive floor alerts | A bounded sentry checks compact current-floor state after meaningful events. It is cooldown-limited, deduplicated, hidden during tours/dialogs, and never changes service data. | `COPILOT_SENTRY_MODEL`: `gpt-5.6-luna` |
| Multi-agent briefing | **Tonight’s Game Plan** runs parallel demand, reservation-book, and staffing workstreams, then synthesizes a structured huddle briefing. Failed workstreams degrade gracefully. | `BRIEFING_WORKER_MODEL`: `gpt-5.6-luna`; `BRIEFING_MODEL`: `gpt-5.6-terra` |
| Live research forecasting | The Predictor researches weather, holidays, and local events. Deterministic math, history, bounds, and factors decide the final forecast. | `RESEARCH_MODEL`: `gpt-5.6-terra` |
| AI seating advice | The seater proposes fair, low-conflict placements, including merge suggestions; a human always approves the action. | `SEAT_MODEL`: `gpt-5.6-terra` |
| Vision floor-plan migration | A floor-plan photo or screenshot is interpreted into tables, shapes, capacities, and positions before the user reviews it in the editor. | `IMPORT_MODEL`: `gpt-5.6` |
| History import | CSV, spreadsheet, PDF, and handwritten-book inputs use deterministic parsing first, with AI extraction/mapping where needed. | `IMPORT_MODEL`: `gpt-5.6` |

All model names are centralized in [`lib/ai-models.ts`](lib/ai-models.ts). AI is advisory: parsing, floor geometry, seating constraints, and forecast math remain deterministic and inspectable.

## Codex collaboration

Travola was built in a Codex desktop thread. Each feature arrived as an engineering directive, was implemented in-window, locally gated, merged, and production-smoked before the next round. Codex accelerated tenancy isolation, the additive/enforce Prisma rollout, session authentication, onboarding and tours, the GPT-5.6 tool layer, Shift Intelligence, and the final reliability passes. The collaboration’s governing decision stayed constant: the model can advise a restaurant team, never silently operate the restaurant for them.

## Prior work vs. submission-window work

| Date | Window | Contribution | Attribution | Commit |
| --- | --- | --- | --- | --- |
| 2026-07-18 | Prior work | Single-restaurant floor manager, host surface, deterministic seater, early predictor, and import foundation | Manual | Pre-window foundation |
| 2026-07-18 | Prior work | Travola rebrand and brand assets | Manual | `a5a8edf`, `e8835cb` |
| 2026-07-18 | Submission window | Runtime model migration across seating, import, vision, and prediction | Other AI tooling | `f70de8a` |
| 2026-07-18 | Submission window | Multi-restaurant tenancy and passcode login | Codex thread | `776ff95` |
| 2026-07-19 | Submission window | Guided onboarding, baseline setup, manager/host tours, and sign-out loop | Codex thread | `dd4fa5d`, `7fbc7de` |
| 2026-07-19–21 | Submission window | Tour reliability, tenant integrity, predictor persistence, and production hardening | Codex thread | `b887667`, `bd4aaf4` |
| 2026-07-20–21 | Submission window | GPT-5.6 co-pilot and Luna sentry | Codex thread | `cb40c2a`, `bb264da` |
| 2026-07-20–21 | Submission window | Tonight’s Game Plan, durable briefing cache, Shift Intelligence, weekly forecast cron, and accuracy watchdog | Codex thread | `f9629e9`, `29f47a4`, `409a70c` |

## Architecture

**Runtime.** Next.js 16 and React 19 render a shared manager/host client surface. Prisma 7 uses its Postgres driver adapter against Neon; Vercel hosts the app and schedules the weekly forecast and nightly accuracy watchdog.

**Tenant boundary.** An httpOnly, HMAC-signed session cookie contains the restaurant context. Every API route derives that identity on the server and scopes every read and write; clients never submit a restaurant ID as authority.

**Shift Intelligence.** `lib/shift-intel.ts` builds one deterministic, tenant-scoped dossier for a restaurant/date: expected covers, booked vs. walk-in split, historical section/hours, turns, staffing capacity, and closed-day status. Predictor, co-pilot, briefing, and sentry consume that same data rather than passing model output between models.

**Read-only AI layer.** Co-pilot tools can inspect operational data and run the existing deterministic seating suggestion, but cannot mutate reservations, tables, staff, or settings. Forecast priors are bounded and visible in factors while history is thin; the watchdog compares forecast and actuals with deterministic scoring.

## Local development

Requirements: Node.js 20+, access to a Neon Postgres database, and the following environment variables. Put them in `.env.local`; never commit secrets.

```bash
DATABASE_URL="postgresql://..."
SESSION_SECRET="a-long-random-secret"
OPENAI_API_KEY="..."
CRON_SECRET="a-separate-long-random-secret"
```

Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On Windows, stop the dev server before Prisma commands so its engine DLL is not locked.

```bash
npx prisma db push
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

`SESSION_SECRET` is required locally and in Vercel Production/Preview. `CRON_SECRET` authorizes the weekly forecast and nightly accuracy-watchdog routes. Pushes to `main` deploy to Vercel; authenticated browser sessions can access protected previews.
