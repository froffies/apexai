# ApexAI AI Handoff

Last updated: 2026-06-30

## Live State

- Local HEAD: `9b92f8c`
- Render live SHA: `9b92f8c`
- Frontend: [https://apexai-bay.vercel.app](https://apexai-bay.vercel.app)
- Backend: [https://apexai-coach.onrender.com/api/coach](https://apexai-coach.onrender.com/api/coach)
- Health: [https://apexai-coach.onrender.com/health](https://apexai-coach.onrender.com/health)

## What the system does now

ApexAI is running a real AI-first coach flow:

1. user sends natural language
2. backend builds meal/workout candidate state and safe deterministic hints
3. OpenAI returns conversational reply plus structured actions
4. backend canonicalizes that response and persists only validated actions

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

- `openaiCoachServer.mjs`
  - builds AI payload
  - handles live coach/photo/barcode endpoints
  - falls back deterministically only when needed

- `coachSessionState.mjs`
  - builds meal/workout candidate state
  - keeps mixed-thread continuity stable

- `mealStateBuilder.mjs`
  - graph-native meal parser front door
  - records `legacyGateClause` when it falls back
  - now avoids packaged-unit false positives from contractions like `can't`
  - now merges detailed follow-up meal turns back into unresolved placeholder roots safely

- `mealStateBuilderLegacy.mjs`
  - still active fallback for complex meal cases
  - intentional, not dead code

- `coachLoggingRules.mjs`
  - validates deterministic persistence actions
  - ordinary meal persistence still requires `wantsLogging === true`

- `normalizeCoachResponse.mjs`
  - strips invented persistence
  - recovers safe omitted actions
  - backfills missing multi-meal actions by `meal_type`

- `coachAudit.mjs`
  - stores per-turn audit records
  - summarizes parser mode, fallback reasons, and legacy gate clauses

## Current validation baseline

Verified on `9b92f8c`:

- `npm test`: `405/405` passing
- `npm run lint`: passing
- `npm run typecheck`: passing
- `npm run build`: passing
- `npm run test:coach-chaos`: passing
  - meals `300`
  - workouts `150`
  - mixed `100`
- live soak: `35/35` passing, `0` failures before clean streak

## Current telemetry baseline

Fresh deployment sample for `9b92f8c`:

- `fresh_audit_records: 67`
- `legacy_fallback_rate: 5.4%`
- `coach_failure_rate: 0%`
- `low_confidence_macro_rate: 23.9%`

Current fresh `by_legacy_gate_clause`:

- `non_graph_not_meal_start: 1`
- `non_graph_multi_quantity_signal: 1`

This replaced the older stale baselines. Do not use the old `82.4%` figure anymore.

## Important live rules

- AI-first response path stays in place
- deterministic persistence still fails closed
- `update_targets` must stay blocked on nutrition questions with quantities
- `mealStateBuilderLegacy.mjs` still handles complex multi-clause inputs
- `legacyGateClause` is now the key telemetry handle for any further gate work

## Recent meaningful fixes already live

- bare drinks and simple measured assistant-history follow-ups can stay graph-native
- stale active legacy sessions can yield to clearly fresh simple meal starts
- suppression carry and mid-clarification normalization protections are live
- fake-save audit false positives were reduced
- multi-meal action backfill is live
- packaged-unit false positive on `can't` is fixed
- detailed follow-up meal turns like `300g steak medium rare cooked in butter` now update the original meal root instead of duplicating it

## Known remaining gaps

1. The coach is still AI-first, not AI-only.
2. Legacy fallback is still intentionally active for harder meal cases.
3. Macro confidence is honest, but obscure foods can still fall back to estimates.
4. Photo analysis still needs human review for messy/shared plates.
5. The next legacy-gate targets need more live traffic before changing them again.

## Commands that matter

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run test:coach-chaos
npm run test:coach-soak
npm run test:nutrition-smoke
npm run test:live-verify
npx playwright test
MONITOR_COMMIT_SHA=<sha> npm run report:telemetry
```

## Source of truth snapshot

- SHA: `9b92f8c`
- live SHA: `9b92f8c`
- tests: `405/405`
- live legacy fallback rate: `5.4%`
- current top legacy clauses: `non_graph_not_meal_start`, `non_graph_multi_quantity_signal`
