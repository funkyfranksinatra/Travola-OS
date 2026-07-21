# Travola

Travola is a restaurant operations console for reservations, floor plans, service, waitlists, staffing, and deterministic volume forecasting. The manager view lives at `/`; the host view is `/host`.

## Run locally

Requirements: Node.js 20+, an accessible Neon Postgres database, and the environment variables below. Copy `.env.example` if present, or create `.env.local`.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app uses a restaurant-name plus four-digit-passcode login. Use the registered restaurant’s credentials, then create a new restaurant from the manager login if needed.

Required environment variables:

```bash
DATABASE_URL="postgresql://..."
SESSION_SECRET="a-long-random-secret"
OPENAI_API_KEY="..."
```

`SESSION_SECRET` must be set for local development and for both Production and Preview in Vercel. Never reuse a development secret in production.

Useful checks:

```bash
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

On Windows, stop the dev server before running Prisma generate or migrations so the engine DLL is not locked. Production schema changes use Prisma migrations; the tenancy migration sequence is additive backfill first, then enforcement in the same code deployment that writes the new required fields.

## Architecture notes

- Tenant context is held only in an httpOnly, HMAC-signed session cookie. API routes derive the restaurant ID from that cookie and scope every read and write.
- The AI is advisory. Geometry, parsing, assignment constraints, and forecast math remain deterministic.
- `app/page.tsx` deliberately remains the application’s large client component. Tours use small anchors and notify calls instead of a page-wide refactor.
- Forecast setup priors are bounded, deterministic inputs and are reported in forecast factors only while history is thin.

## Built with Codex + GPT-5.6

This submission was built collaboratively in a Codex thread using GPT-5.6. Codex accelerated the tenancy audit, safe additive/enforce migration workflow, session-based API scoping, deterministic forecast-prior integration, and the reusable onboarding/tour layer. The collaboration kept the project’s core decision intact: AI can advise, but it does not replace deterministic restaurant operations logic.

Key decisions made during the collaboration:

- Per-restaurant isolation is enforced at the server boundary, never trusted from client input.
- Restaurant setup is resumable, skippable, and persisted in settings so a front-desk device cannot be trapped in a walkthrough.
- Tour demo state is tenant-scoped and cleaned at completion, skip, and next load to avoid polluting operational records.
- Existing Volario’s data was preserved through the tenancy rollout and excluded from new onboarding/tour prompts.
- The GPT-5.6 co-pilot uses the official Responses API with Programmatic Tool Calling and only tenant-scoped read tools; GPT-5.6 Luna powers bounded, deduplicated proactive floor alerts. Party-fit turns are server-enforced to use the deterministic read-only seating check.
- Tonight's Game Plan uses the official Responses multi-agent beta: three bounded Luna workstreams (demand, reservation book, staffing) run in parallel, then Terra synthesizes a structured, cacheable pre-shift briefing. The briefing never mutates the floor or invents missing history.

### Work record

| Date | Window | Contribution | Attribution | Commit |
| --- | --- | --- | --- | --- |
| 2026-07-18 | Prior work | Travola rebrand and brand assets | Manual | `a5a8edf`, `e8835cb` |
| 2026-07-18 | Prior work | GPT-5.6 model migration | Other AI tooling | `f70de8a` |
| 2026-07-18 | Submission window | Multi-restaurant tenancy and passcode login | Codex thread | `776ff95` |
| 2026-07-19 | Submission window | Guided restaurant onboarding and baseline setup | Codex thread | `dd4fa5d` |
| 2026-07-19 | Submission window | First-visit manager and host feature tours | Codex thread | `7fbc7de` |
| 2026-07-19 | Submission window | README and retained Demo Bistro fixture | Codex thread | `docs: hackathon submission README` |

## Deployment

Pushes to `main` deploy to Vercel. Preview deployments are protected by Vercel Authentication; test them in an authenticated browser session. Before production verification, confirm the target deployment is READY and that `SESSION_SECRET` is present in the Production environment.
