# ApexAI — Agent Handoff

**Last updated:** 2026-06-23
**Current HEAD:** see `git log --oneline -1`
**Live frontend:** https://apexai-bay.vercel.app/
**Live backend:** https://apexai-coach.onrender.com
**Health endpoint:** https://apexai-coach.onrender.com/health

---

## What this app is

ApexAI is an AI-first nutrition and fitness coaching app. Users talk to a conversational coach that logs meals, workouts, and answers nutrition questions. The architecture is:

- **Frontend:** React/Vite, deployed on Vercel
- **Backend coach server:** Node.js/Express (`server/openaiCoachServer.mjs`), deployed on Render, calls GPT-4o
- **Database:** Supabase (auth, meal/workout logs, audit records)
- **Nutrition data:** AU/NZ curated catalogue (`src/lib/nutritionDatabase.js`) + OpenFoodFacts fallback

---

## Architecture: how a coach turn works

```
User message
  └─► buildCoachSessionState()       [coachSessionState.mjs]
        builds meal + workout session from conversation history
        uses buildTurnIntentGraph() to classify multi-clause turns
        WORKOUT_PLAN_DIRECTIVE_PATTERN detects planning phrases before
        parseWorkoutMessage runs, routing them to domain:general (AI)
        rather than domain:workout (exercise extraction)
  └─► shouldUseLegacy()              [mealStateBuilder.mjs]
        gates whether graph-native or legacy parser handles the meal state
        records legacyGateClause on the session for telemetry
        isGraphNativeFreshStartOnLegacySession exempts clear fresh-topic
        turns from active legacy sessions
  └─► buildDeterministicMealActions() / buildDeterministicWorkoutActions()
                                     [coachLoggingRules.mjs]
        tries to persist without AI if state is clear enough
  └─► GPT-4o (if needed)            [openaiCoachServer.mjs handleCoach]
        AI-first: AI is the primary responder
        deterministic layer provides candidate actions for AI to confirm
        recalled_messages from coachConversationMemory.js injected here
        for long-gap follow-up continuity
  └─► normalizeCoachResponse()       [normalizeCoachResponse.mjs]
        validates and sanitises AI output
        strips disallowed actions (e.g. update_targets on nutrition questions)
        recovers safe persistence when AI claims to save but omits action
        recovers missing multi-meal actions when AI undercounts
  └─► persistCoachAuditRecord()      [coachAudit.mjs]
        records every turn for monitoring and QA
```

---

## Server file map

| File | Purpose | Lines |
|------|---------|-------|
| `server/openaiCoachServer.mjs` | HTTP server, all route handlers, OpenAI calls, nutrition search | ~2,680 |
| `server/mealStateBuilder.mjs` | Graph-native meal parser, `shouldUseLegacy()` gate | ~1,900 |
| `server/mealStateBuilderLegacy.mjs` | Legacy deterministic meal parser — still active fallback, do not delete | ~3,155 |
| `server/coachSessionState.mjs` | Session state builder, turn intent graph, workout parsing | ~2,300 |
| `server/coachLoggingRules.mjs` | Deterministic action builders, persistence helpers, food matching | ~1,200 |
| `server/normalizeCoachResponse.mjs` | AI output validation and sanitisation | ~730 |
| `server/coachAudit.mjs` | Audit record persistence and summarisation | ~880 |
| `server/nutritionPhotoAnalysis.mjs` | Photo nutrition estimate pipeline | ~1,160 |
| `server/utils.mjs` | Shared low-level utilities: `cleanText`, `safeArray`, `safeNumber`, `roundMacro`, `titleCase`, `escapeRegex` | ~50 |
| `src/lib/coachConversationMemory.js` | Recalled coach chat context for long-gap follow-ups | ~200 |
| `server/archive/legacy-coach/` | Fully archived old system — do not import from here | — |

**Rule:** all shared utility functions live in `server/utils.mjs`. Do not re-define `cleanText`, `safeArray`, `safeNumber`, `roundMacro`, `titleCase`, or `escapeRegex` in any other server file. Import them. (`src/lib/` files are frontend and cannot import from `server/` — their local `cleanText` copies are intentional.)

---

## Key architectural decisions (do not reverse without understanding why)

### AI-first, not regex-first
The AI is the first responder. The deterministic layer computes candidate actions and session state, but the AI decides what to say and confirm. `normalizeCoachResponse.mjs` validates AI output rather than replacing it.

### Workout plan directives route to AI, not the workout session builder
`WORKOUT_PLAN_DIRECTIVE_PATTERN` in `coachSessionState.mjs` catches phrases like "build me a workout", "give me a leg day", "design a gym session" before `parseWorkoutMessage` runs. These route to `domain: general` so the AI handles them as planning requests and returns `create_workout_plan`. `WORKOUT_PLAN_FOLLOWUP_PATTERN` catches follow-up continuations like "start today's workout". Do not remove these patterns — without them, planning phrases are extracted as exercise names and the coach asks "How many reps did you do for Build Me A Workout?"

### `shouldUseLegacy()` is intentional
The legacy parser (`mealStateBuilderLegacy.mjs`) is still the fallback for complex multi-clause inputs. The `shouldUseLegacy()` function records which clause triggered the fallback as `legacyGateClause` on the session. `isGraphNativeFreshStartOnLegacySession` exempts clear fresh single-clause meal starts from `active_non_graph_session` even when a legacy session is active. Check `npm run report:telemetry` for current fallback rate before removing any clause.

### `wantsLogging === true` (not `!== false`)
`buildSingleDeterministicMealAction` in `coachLoggingRules.mjs` requires `mealSession.wantsLogging === true`. Do not change it back to `!== false` — that caused auto-persist on sessions with no explicit logging intent.

### `update_targets` is blocked on nutrition questions
`normalizeCoachResponse.mjs` strips any `update_targets` action when the user message is a nutrition question with a quantity. Do not remove `isNutritionQuestionWithQuantity()`.

### Multi-meal recovery
`normalizeCoachResponse.mjs` backfills missing `log_meal` actions by `meal_type` when the AI returns fewer actions than the canonical layer computed. This handles GPT-4o combining "breakfast was X, lunch was Y" into a single action.

### Recalled coach context
`src/lib/coachConversationMemory.js` supplies older relevant messages to the AI when the user references past conversations ("what did you say earlier", "carry on from before"). These arrive in `recalledMessages` in the request body and are merged into `contextualRecentMessages` before the AI call. `buildRecalledCoachReply` handles the offline fallback.

### Negation guard
`buildMealStateFromConversation` in `mealStateBuilder.mjs` short-circuits to `baseSession()` (→ AI, no clarification) when the input matches negation/fasting patterns ("i ate nothing today", "not hungry", "skipped breakfast") and doesn't look like food. Do not remove this guard.

### `genericExerciseOnly` requires a known exercise word
`parseWorkoutMessage` in `coachSessionState.mjs` requires the extracted exercise name to contain a word from the workout lexicon. Without this, "i'm not hungry" was parsed as exercise "'M Not Hungry" and the coach asked for reps.

---

## Conversational routing: what goes where

| User says | Expected routing |
|-----------|-----------------|
| "build me a workout" | AI → `create_workout_plan` |
| "give me a leg day workout" | AI → `create_workout_plan` |
| "i did 20 pushups" | Workout session → deterministic or AI |
| "i had 2 eggs" | Meal session → deterministic log |
| "just had 100g almonds" | Meal session → deterministic log |
| "i had a coffee" | Meal session → graph-native (bare drink) |
| "i'm not hungry" | AI only (no session) |
| "i ate nothing today" | AI only (no session) |
| "i trained chest today" | Workout session → AI asks "what exercise?" |
| "how many calories in 100g chicken" | AI answer only, no `update_targets` |
| "what did you say earlier" | AI → answer from `recalled_messages` |
| "hey / thanks / how are you" | AI only (no session) |
| "breakfast was X, lunch was Y" | Legacy parser → two `log_meal` actions |

---

## Test surface

```bash
npm test                   # 361 unit tests — must always be green before pushing
npm run lint               # ESLint — must be clean
npm run typecheck          # tsc — must be clean
npm run build              # Vite build — must succeed
npm run test:coach-chaos   # Adversarial load: 300 meal / 150 workout / 100 mixed
npm run test:coach-soak    # Multi-turn conversation regression: 10/10 clean streak required
npm run test:nutrition-smoke  # Live nutrition API smoke test
npm run test:live-verify   # Playwright against live Vercel + Render deployment
npx playwright test        # Full E2E suite (83 tests, requires Supabase creds in env)
npm run report:telemetry   # Live production monitoring report
```

---

## Monitoring thresholds (check after every deploy)

From `npm run report:telemetry`:

| Metric | Threshold | Action if breached |
|--------|-----------|-------------------|
| `legacy_fallback_rate` | < 30% | Check `by_legacy_gate_clause` breakdown; tackle highest-frequency clause |
| `nutrition_low_confidence_search_rate` | < 60% | Expand AU/NZ curated catalogue |
| `coach_failure_rate` | < 5% | Check Render logs for OpenAI errors |
| `telemetry_error_rate` | 0% | Check Supabase connectivity |

Last known telemetry sample (commit `b8962c9`):
- `legacy_fallback_rate: 30.4%` — just over threshold
- `by_legacy_gate_clause: active_non_graph_session 17, non_graph_drink_mention 8, non_graph_multi_quantity_signal 4`
- Subsequent commits (`7971b4e`, `c45de46`, `73a84b9`) address `non_graph_drink_mention` and routing issues — fresh telemetry needed after Codex's next soak run to see current state.

---

## Deployment

- **Push to `main`** triggers auto-deploy on both Render (backend) and Vercel (frontend)
- Render cold starts take ~30s — `npm run test:nutrition-smoke` handles this with retry logic
- Confirm live commit at `/health` endpoint before running `npm run test:live-verify`
- Two AI agents (Claude + Codex) may push to main concurrently — always `git pull --rebase` before pushing

---

## Known gaps (not bugs, conscious trade-offs)

- `i had 1 rice` does not auto-save — "rice" requires a quantity clarification by design
- `i had coffee with milk` asks "how much coffee?" — correct, modifier drinks without explicit quantity need AI to estimate based on type
- Macro coverage for obscure foods still falls through to `estimated_internal_profile`
- Photo analysis on messy/shared plates still flags for human review (~2-3% of photo turns)
- `mealStateBuilderLegacy.mjs` is 3,155 lines — reduce it by improving `mealStateBuilder.mjs` and narrowing the `shouldUseLegacy()` gate clause by clause, guided by telemetry
- `active_non_graph_session` is still the dominant legacy gate clause — fresh telemetry after `73a84b9` needed to determine if the `isGraphNativeFreshStartOnLegacySession` exemption is working

---

## Workflow for this project

This project uses a two-AI workflow:
- **Claude** (this sandbox, PAT authenticated): audits code, writes precise fix specs, applies fixes directly, pushes to main
- **Codex** (local WSL agent): runs live soak/telemetry tests, applies fixes Claude can't (live infra), validates, pushes

Claude clones fresh from GitHub each session, re-runs the real test suite independently, reads actual diffs before trusting reports. Both agents push to `main` — always rebase on conflicts.

PAT authentication: if needed, configure via `git remote set-url origin https://<PAT>@github.com/froffies/apexai.git`. Rotate after use.

---

## Recent commit history (last significant changes)

| Commit | What changed |
|--------|-------------|
| `73a84b9` | `WORKOUT_PLAN_DIRECTIVE_PATTERN` expanded for modifier variants ("give me a leg day") |
| `281eaf6` | Codex: recalled coach fallback + workout planning intent fixes |
| `d0b4e69`–`8f07f17` | Codex: `coachConversationMemory.js` — recalled chat context for long-gap follow-ups |
| `c45de46` | Meal negation guard, fake workout session fixes, `just had` prefix, `genericExerciseOnly` |
| `9d0ea83` | Workout plan directives no longer parsed as exercise names |
| `7971b4e` | Bare unquantified drinks now graph-native (non_graph_drink_mention fix) |
| `b8962c9` | Weighted workout readiness requires weight before readying |
| `b471b20` | Multi-meal recovery: backfills missing log_meal actions by meal_type |
| `d35e256` | Shared utilities consolidated into `server/utils.mjs`, section headers, handoff doc |
| `29ef440` | `update_targets` blocked on nutrition questions with quantities |
| `d549dae` | Finalised: audit vulnerabilities patched, `tmp/` gitignored |
