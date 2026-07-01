# ApexAI AI Handoff

Last updated: 2026-07-01

## Live State

- Current HEAD: `b153938` (awaiting Codex soak verification)
- Render live SHA: `9d676e5` (last verified clean soak)
- Frontend: https://apexai-bay.vercel.app
- Backend: https://apexai-coach.onrender.com/api/coach
- Health: https://apexai-coach.onrender.com/health

## What the system does now

ApexAI is running a real AI-first coach flow:

1. User sends natural language
2. Backend builds meal/workout candidate state and safe deterministic hints
3. OpenAI returns conversational reply plus structured actions
4. Backend canonicalizes that response and persists only validated actions

The app is **not** parser-first anymore, but it is also **not** AI-only. Deterministic validation still protects logging integrity.

## Current architecture

Primary live files:

- `server/openaiCoachServer.mjs`
- `server/coachSessionState.mjs`
- `server/mealStateBuilder.mjs`
- `server/mealStateBuilderLegacy.mjs`
- `server/coachLoggingRules.mjs`
- `server/normalizeCoachResponse.mjs`
- `server/coachAudit.mjs`
- `src/lib/coachSessionMerge.js`

Responsibilities:

- `openaiCoachServer.mjs` — builds AI payload, handles live coach/photo/barcode endpoints, falls back deterministically only when needed
- `coachSessionState.mjs` — builds meal/workout candidate state, keeps mixed-thread continuity stable, preserves suppressed meal sessions across follow-ups
- `mealStateBuilder.mjs` — graph-native meal parser front door, records `legacyGateClause` when it falls back
- `mealStateBuilderLegacy.mjs` — still active fallback for complex meal cases, intentional not dead code
- `coachLoggingRules.mjs` — validates deterministic persistence actions, splits multi-meal turns by meal_type
- `normalizeCoachResponse.mjs` — strips invented persistence, recovers safe omitted actions, backfills missing multi-meal canonical actions when AI under-returns
- `coachAudit.mjs` — stores per-turn audit records, summarizes parser mode, fallback reasons, and legacy gate clauses

## Current validation baseline

Last verified clean soak was on `9d676e5`:

- `npm test`: `405/405` passing
- `npm run lint`: passing
- `npm run typecheck`: passing
- `npm run build`: passing
- `npm run test:coach-chaos`: passing (meals 300, workouts 150, mixed 100)
- live soak: `35/35` passing, `0` failures before clean streak

`b153938` is the latest push (fixes for `non_graph_not_meal_start` and `non_graph_multi_quantity_signal`). Awaiting Codex soak/telemetry verification.

## Current telemetry baseline

Last clean telemetry on `9d676e5`:

- `fresh_audit_records: 67`
- `legacy_fallback_rate: 13.9%`
- `coach_failure_rate: 0%`
- `low_confidence_macro_rate: 19.4%`

Fresh `by_legacy_gate_clause`:

- `non_graph_multi_quantity_signal: 3`
- `non_graph_not_meal_start: 2`

The pre-session baseline was `82.4%`. Do not use that figure anymore.

## Session summary (2026-07-01)

Fixes shipped this session in order:

| SHA | Fix |
|-----|-----|
| `56c5a39` | Exempt measured drinks from `non_graph_drink_mention` gate |
| `42d9d05` | Graph-native mixed food+drink starts, AU/NZ nutrition aliases, photo dish wiring |
| `fae61d4` | Exempt simple multi-quantity and post-assistant fresh meal turns from legacy gate |
| `7d25f56` | Preserve suppression across fresh meal starts after don't-log turns |
| `9dc9cde` | Preserve suppressed meal session in `buildMealSessionState` |
| `2d70f6e` | Protect mid-clarification context from `normalizeConversation` stripping |
| `19588d8` | Infer clarification progress in coach audit flags |
| `df8bded` | Treat already-logged turns as handled in coach audit flags |
| `b460a70` | Raise `isGraphNativeSimpleFreshMealTurn` clause limit to 3 |
| `a6dabd0` | Backfill canonical meal actions when AI returns `log_meal` with no `meal_type` |
| `b153938` | Exempt bare foodish turns from `non_graph_not_meal_start`; allow daypart suffix in `simpleFreshMealTurn` |

## Important live rules

- AI-first response path stays in place
- Deterministic persistence still fails closed
- `update_targets` must stay blocked on nutrition questions with quantities
- `mealStateBuilderLegacy.mjs` still handles complex multi-clause inputs
- `legacyGateClause` is the key telemetry handle for any further gate work

## Known remaining gaps

1. `non_graph_multi_quantity_signal` and `non_graph_not_meal_start` targeted by `b153938` — soak/telemetry pending
2. `low_confidence_macro_rate: 19.4%` — needs real miss data from audit before expanding catalogue
3. Playwright E2E suite not run this session — unknown state
4. Capacitor mobile build not verified this session
5. Frontend features (recipes, favourites, barcode, charts, onboarding) not verified this session
6. `mealStateBuilderLegacy.mjs` still active for complex turns — intentional until telemetry-backed gate reductions replace them

## Commands that matter

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run test:coach-chaos
npm run test:coach-soak
npm run test:live-verify
npx playwright test
MONITOR_COMMIT_SHA=<sha> npm run report:telemetry
```
