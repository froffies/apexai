# ApexAI AI Handoff

Last updated: 2026-06-07

## Current Status

ApexAI is now running with an AI-first coach logging path in production.

The live coach flow is:

1. User sends natural language.
2. The AI decides what the message means and what action to take.
3. The backend validates the action shape and persistence safety.
4. The app persists only valid actions and keeps the reply conversational.

This is no longer the original parser-first "traffic cop" architecture.

## Current Architecture

### Live AI-first path

Primary live files:

- `server/openaiCoachServer.mjs`
- `server/normalizeCoachResponse.mjs`
- `server/coachSessionState.mjs`
- `server/coachLoggingRules.mjs`
- `src/lib/coachSessionMerge.js`

What these do now:

- `openaiCoachServer.mjs`
  - builds the coach payload for OpenAI
  - passes candidate fragments, session state, validated actions, and compact persistence hints
  - preserves deterministic fallback only as a safety rail when the upstream AI call fails
- `normalizeCoachResponse.mjs`
  - canonicalizes AI output into safe backend actions
  - strips invented persistence
  - recovers valid clarify or persistence actions when the AI reply is good but incomplete
- `coachSessionState.mjs`
  - now acts as candidate/session construction, not the final conversational decider
  - still handles session continuity and fragmented meal/workout state
- `coachLoggingRules.mjs`
  - validates/log-shapes persistence actions
  - provides deterministic fallback actions when the AI path is unavailable
- `coachSessionMerge.js`
  - applies persisted meal/workout results cleanly across turns
  - keeps mixed meal/workout threads stable after saves

### Legacy and fallback

The old parser-first stack is preserved here:

- `server/archive/legacy-coach/`

Important note:

- `server/mealStateBuilderLegacy.mjs` still exists in the live repo and is still used as a fallback for more complex meal sessions.
- `server/mealStateBuilder.mjs` is the graph-native front door and owns more of the common/simple flows than before, but it has not fully eliminated legacy fallback.

## Current Product Shape

Main surfaces:

- Dashboard / Home
- Coach chat
- Workouts
- Nutrition
- Progress
- Profile

Major shipped systems:

- local-first app state with optional Supabase auth/cloud sync
- AI-first coach logging with deterministic safe fallback
- workout planning, active workout logging, and history
- meal logging, meal builder, barcode scan, recents, favourites, recipes
- onboarding with starter targets and plans
- recovery-aware recommendations and progression engine
- telemetry ingestion and audit tooling
- iOS-capable Capacitor wrapper

## Important Files

### Coach backend

- `server/openaiCoachServer.mjs`
- `server/normalizeCoachResponse.mjs`
- `server/coachSessionState.mjs`
- `server/coachLoggingRules.mjs`
- `server/mealStateBuilder.mjs`
- `server/mealStateBuilderLegacy.mjs`
- `server/archive/legacy-coach/`

### Coach frontend / merge path

- `src/pages/Coach.jsx`
- `src/lib/openaiCoachClient.js`
- `src/lib/coachSessionMerge.js`

### Validation and regression coverage

- `tests/serverApi.test.mjs`
- `tests/normalizeCoachResponse.test.mjs`
- `tests/coachSessionState.test.mjs`
- `tests/mealStateBuilder.test.mjs`
- `tests/coachLoggingRules.test.mjs`
- `e2e/app-smoke.spec.js`
- `e2e/cloud-auth.spec.js`
- `scripts/coach-chaos-test.mjs`
- `scripts/coach-soak-test.mjs`

## Validation Status

Current verified results in this workspace:

- `npm run lint` passed
- `npm test` passed `251/251`
- `npm run typecheck` passed
- `npm run build` passed
- `npm run test:coach-chaos` passed
  - meals: `300`
  - workouts: `150`
  - mixed: `100`
- `npx playwright test` passed `78/78`
  - skipped: `0`
- `npm audit --audit-level=moderate` passed
  - `0 vulnerabilities`

## Live Validation Status

Hosted soak is green against:

- app: `https://apexai-bay.vercel.app`
- coach API: `https://apexai-coach.onrender.com/api/coach`

Latest full live soak result:

- target: `live`
- clean streak: `10/10`
- total runs attempted: `10`
- total conversations tested: `550`
- failures before clean streak: `0`

Latest short post-fix live confirmation:

- target: `live`
- clean streak: `3/3`
- total conversations tested: `165`
- failures before clean streak: `0`

Artifacts are written under:

- `tmp/coach-soak-runs/`
- `tmp/targeted-live-human-report.json`

## What Was Recently Fixed

Recent important coach fixes included:

- mixed meal/workout threads now keep meal and workout domains isolated instead of polluting each other
- inline corrections like `200g chicken no wait half a pound` no longer save verbatim junk
- grouped egg preparation refinements no longer garble the meal state
- workout-only follow-ups no longer mutate meal clarifications
- deterministic fallback now preserves mixed persistence plus clarification together when the upstream AI call fails
- cloud-auth onboarding/profile Playwright flow now keys off the real UI state instead of trusting the URL alone

## Package / Dependency Status

- `@base44/sdk` and related dead scaffold dependencies were removed
- the old axios vulnerability chain from that scaffold is gone
- current `npm audit --audit-level=moderate` result is `0 vulnerabilities`

## Known Honest Caveats

These are the important remaining truths:

1. The coach is operationally AI-first, but not every parsing subsystem is fully AI-native.
   - `mealStateBuilderLegacy.mjs` still handles some harder meal conversations.

2. The system still has a deterministic safety net.
   - if the upstream AI call fails, the backend falls back to deterministic actions/replies
   - this is intentional for reliability

3. Complex multi-turn meal continuity is improved, but the hardest grouped/split/modifier-heavy conversations are still where legacy fallback is most likely.

4. Production quality now depends partly on OpenAI + hosted uptime.
   - the app is resilient when AI fails
   - but the most natural behavior still comes from the live AI-assisted path

## Recommended Next Steps

If another AI continues from here, the highest-value work is:

1. Shrink `mealStateBuilderLegacy.mjs` further by moving more active multi-turn meal continuity into the graph-native path.

2. Keep reducing places where session logic shapes the result before the model sees it.

3. Add stronger observability around:
   - AI call failures
   - fallback route frequency
   - clarify loop frequency
   - persistence mismatch recovery

4. Keep the live soak as the real quality bar.
   - local soak validates session logic
   - live soak validates the actual hosted AI-first behavior

## How To Run

```powershell
npm install
npm run dev
```

Optional local coach server:

```powershell
npm run ai:server
```

## Useful Verification Commands

Core backend checks:

```powershell
npm run lint
npm test
npm run typecheck
npm run build
npm run test:coach-chaos
```

Full browser suite with cloud auth:

```powershell
$env:E2E_SUPABASE_EMAIL="test@example.com"
$env:E2E_SUPABASE_PASSWORD="secret"
npx playwright test
```

Full live soak:

```powershell
$env:E2E_SUPABASE_EMAIL="test@example.com"
$env:E2E_SUPABASE_PASSWORD="secret"
$env:COACH_SOAK_TARGET="live"
npm run test:coach-soak
```
