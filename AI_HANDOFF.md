# ApexAI AI Handoff

Last updated: 2026-06-21

## Current Status

ApexAI is running an AI-first coach flow in production.

The live flow is:

1. User sends natural language.
2. The backend builds meal/workout candidate state and validated deterministic hints.
3. OpenAI produces the conversational reply plus structured actions.
4. The backend canonicalizes the response, strips invented persistence, recovers safe missing actions when it can prove them, and persists only valid actions.

The app is not parser-first anymore, but it still keeps deterministic validation and fallback rails for reliability.

## Current Architecture

### Live AI-first path

Primary live files:

- `server/openaiCoachServer.mjs`
- `server/normalizeCoachResponse.mjs`
- `server/coachSessionState.mjs`
- `server/coachLoggingRules.mjs`
- `server/mealStateBuilder.mjs`
- `src/lib/coachSessionMerge.js`

Current responsibilities:

- `server/openaiCoachServer.mjs`
  - builds the OpenAI payload from the current turn, session state, candidate fragments, validated deterministic hints, and compact persistence context
  - falls back to deterministic reply/action generation only when the live AI call fails or the backend must protect persistence integrity
- `server/normalizeCoachResponse.mjs`
  - canonicalizes AI output into safe backend actions
  - strips invented persistence
  - recovers safe clarify/persist actions when the AI reply is directionally correct but the structured action is missing
  - this now includes explicit recovery paths for omitted meal/workout persistence actions when the backend already has a validated canonical action
- `server/coachSessionState.mjs`
  - builds meal and workout candidate session state, rather than acting as the final route decider
  - keeps mixed meal/workout threads stable across fragmented multi-turn conversations
- `server/coachLoggingRules.mjs`
  - validates and shapes deterministic persistence actions
  - now fails closed on ordinary meal persistence intent: routine ready states do not auto-persist unless `wantsLogging === true` or another explicit allowed path applies
- `server/mealStateBuilder.mjs`
  - is the graph-native front door for meal parsing
  - records `legacyGateClause` whenever `shouldUseLegacy()` routes a turn into the legacy fallback
  - includes the `isGraphNativeSimpleMeasuredFollowUp()` exemption so simple measured fresh-topic turns such as `500ml coffee` can stay graph-native even after prior assistant history
- `src/lib/coachSessionMerge.js`
  - merges persisted meal/workout results back into frontend state after successful logging

### Legacy fallback

The historical parser-first code is preserved under:

- `server/archive/legacy-coach/`

The live backend still intentionally uses:

- `server/mealStateBuilderLegacy.mjs`

This is still the active fallback for more complex multi-clause meal inputs. That is currently by design, not an unknown gap. The graph-native parser owns common/simple turns first; the legacy parser handles harder continuity and clause-heavy cases when `shouldUseLegacy()` decides the graph-native path is unsafe.

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
- AI-first coach logging with deterministic validation/fallback rails
- workout planning, active workout logging, and history
- meal logging, recents, favourites, recipes, barcode scan, and photo analysis
- onboarding with starter targets and plans
- recovery-aware recommendations and progression logic
- telemetry ingestion and coach audit tooling
- Capacitor mobile wrapper

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
- `tests/nutritionDatabase.test.mjs`
- `e2e/app-smoke.spec.js`
- `e2e/cloud-auth.spec.js`
- `scripts/coach-chaos-test.mjs`
- `scripts/coach-soak-test.mjs`
- `scripts/nutrition-smoke-test.mjs`
- `scripts/live-production-verify.mjs`

## Monitoring Thresholds

Current checked thresholds in `scripts/coach-monitor-report.mjs`:

- `legacy_fallback_rate`: target `30%`
- `nutrition_low_confidence_search_rate`: target `60%`
- `coach_failure_rate`: target `5%`

The telemetry report also tracks photo review rate, telemetry error rate, nutrition search empties, and barcode fallback rate.

## Validation Status

Current verified baseline in this workspace:

- `npm test` passes `339/339`
- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` passes
- `npm run test:coach-chaos` passes
  - meals: `300`
  - workouts: `150`
  - mixed: `100`

## Live Validation Status

Hosted app:

- frontend: `https://apexai-bay.vercel.app`
- coach API: `https://apexai-coach.onrender.com/api/coach`

Recently confirmed live checks in this workspace:

- full live verify passed against the deployed frontend/backend pair
- Render `/health` exposed the expected commit hash during the latest deployment check

Generated verification artifacts are written under:

- `tmp/coach-soak-runs/`
- `tmp/live-verification/`

## Recently Confirmed Fixes

Recent important confirmed fixes include:

- simple measured fresh-topic follow-ups after assistant history can stay graph-native instead of being forced into the legacy gate
- meal persistence now fails closed unless explicit logging intent is present, closing the `wantsLogging` safety gap
- `normalizeCoachResponse` can recover safe omitted persistence actions when the AI says it saved something but drops the structured action payload
- quantified drink follow-ups no longer hijack pending fried-egg cooking-medium clarifications
- inline correction handling no longer saves literal correction text such as `no wait`
- mixed meal/workout threads keep meal/workout domains separate more reliably during fragmented follow-ups

## Package / Dependency Status

- `@base44/sdk` and related dead scaffold dependencies were removed earlier
- the old axios vulnerability chain from that scaffold is gone
- Vite and transitive audit fixes are now tracked in the lockfile/package manifest

## Known Honest Caveats

Important current truths:

1. The coach is AI-first, not AI-only.
   - deterministic validation and fallback behavior are still intentional safety rails

2. `server/mealStateBuilderLegacy.mjs` still handles some complex multi-clause meal cases.
   - that fallback is still live and intentional

3. Macro quality is strongest for trusted catalogue/barcode/reference matches.
   - lower-confidence searches and estimated profiles are still possible for harder or niche foods

4. Production quality still depends partly on hosted AI availability.
   - the app is resilient when the upstream AI fails, but the most natural replies still come from the live AI-assisted path

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

Core validation:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:coach-chaos
npm run test:coach-soak
npm run test:nutrition-smoke
npm run test:live-verify
```

Full browser suite with cloud auth:

```powershell
$env:E2E_SUPABASE_EMAIL="test@example.com"
$env:E2E_SUPABASE_PASSWORD="secret"
npx playwright test
```
