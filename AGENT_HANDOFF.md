# ApexAI — Agent Handoff

**Last updated:** 2026-06-21  
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
  └─► shouldUseLegacy()              [mealStateBuilder.mjs]
        gates whether graph-native or legacy parser handles the meal state
        records legacyGateClause on the session for telemetry
  └─► buildDeterministicMealActions() / buildDeterministicWorkoutActions()
                                     [coachLoggingRules.mjs]
        tries to persist without AI if state is clear enough
  └─► GPT-4o (if needed)            [openaiCoachServer.mjs handleCoach]
        AI-first: AI is the primary responder
        deterministic layer provides candidate actions for AI to confirm
  └─► normalizeCoachResponse()       [normalizeCoachResponse.mjs]
        validates and sanitises AI output
        strips disallowed actions (e.g. update_targets on nutrition questions)
        recovers safe persistence when AI claims to save but omits action payload
  └─► persistCoachAuditRecord()      [coachAudit.mjs]
        records every turn for monitoring and QA
```

---

## Server file map

| File | Purpose | Lines |
|------|---------|-------|
| `server/openaiCoachServer.mjs` | HTTP server, all route handlers, OpenAI calls, nutrition search | ~2,640 |
| `server/mealStateBuilder.mjs` | Graph-native meal parser, `shouldUseLegacy()` gate | ~1,880 |
| `server/mealStateBuilderLegacy.mjs` | Legacy deterministic meal parser — still active fallback, do not delete | ~3,155 |
| `server/coachSessionState.mjs` | Session state builder, turn intent graph, workout parsing | ~2,240 |
| `server/coachLoggingRules.mjs` | Deterministic action builders, persistence helpers, food matching | ~1,200 |
| `server/normalizeCoachResponse.mjs` | AI output validation and sanitisation | ~730 |
| `server/coachAudit.mjs` | Audit record persistence and summarisation | ~880 |
| `server/nutritionPhotoAnalysis.mjs` | Photo nutrition estimate pipeline | ~1,160 |
| `server/utils.mjs` | Shared low-level utilities: `cleanText`, `safeArray`, `safeNumber`, `roundMacro`, `titleCase`, `escapeRegex` | ~50 |
| `server/archive/legacy-coach/` | Fully archived old system — do not import from here | — |

**Rule:** all shared utility functions live in `server/utils.mjs`. Do not re-define `cleanText`, `safeArray`, `safeNumber`, `roundMacro`, `titleCase`, or `escapeRegex` in any other server file. Import them.

---

## Key architectural decisions (do not reverse without understanding why)

### AI-first, not regex-first
The AI is the first responder. The deterministic layer computes candidate actions and session state, but the AI decides what to say and confirm. `normalizeCoachResponse.mjs` validates AI output rather than replacing it.

### `shouldUseLegacy()` is intentional
The legacy parser (`mealStateBuilderLegacy.mjs`) is still the fallback for complex multi-clause inputs (e.g. "breakfast was 2 eggs and lunch was 200g steak and same as yesterday"). This is deliberate. The `shouldUseLegacy()` function in `mealStateBuilder.mjs` records which clause triggered the fallback as `legacyGateClause` on the session. Check `npm run report:telemetry` for current fallback rate before removing any clause from the gate.

### `wantsLogging === true` (not `!== false`)
`buildSingleDeterministicMealAction` in `coachLoggingRules.mjs` requires `mealSession.wantsLogging === true` to persist. This is a strict positive signal. Do not change it back to `!== false` — that caused auto-persist on sessions with no explicit logging intent.

### `update_targets` is blocked on nutrition questions
`normalizeCoachResponse.mjs` strips any `update_targets` action when the user message is a nutrition question with a quantity (e.g. "how many calories in 100g of chicken breast"). The AI previously misread the quantity as a target value. Do not remove `isNutritionQuestionWithQuantity()` without a replacement guard.

---

## Test surface

```bash
npm test                   # 342 unit tests — must always be green before pushing
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

---

## Deployment

- **Push to `main`** triggers auto-deploy on both Render (backend) and Vercel (frontend)
- Render cold starts take ~30s — `npm run test:nutrition-smoke` handles this with retry logic
- Confirm live commit at `/health` endpoint before running `npm run test:live-verify`

---

## Known gaps (not bugs, conscious trade-offs)

- `i had 1 rice` does not auto-save — "rice" requires a quantity clarification by design
- Macro coverage for very obscure foods still falls through to `estimated_internal_profile`
- Photo analysis on messy/shared plates still flags for human review (~2-3% of photo turns)
- `mealStateBuilderLegacy.mjs` is 3,155 lines — it exists because the graph-native parser doesn't yet handle all compound multi-clause inputs. Reduce it by improving `mealStateBuilder.mjs` and narrowing the `shouldUseLegacy()` gate clause by clause, guided by telemetry data.
- Three moderate/high Vite audit vulnerabilities were fixed in the `d549dae` commit. Run `npm audit` after any dependency update to confirm zero remain.

---

## Workflow for this project

This project uses a two-AI workflow:
- **Claude** (read-only sandbox): audits code, writes precise fix specs, reviews Codex reports
- **Codex** (local WSL agent): applies fixes, runs validation, commits, pushes

Claude clones fresh from GitHub each session (`git clone https://github.com/froffies/apexai`), re-runs the real test suite independently, reads actual diffs rather than trusting reports, and hands exact instructions back. Codex never pushes without a full validation sweep.

Direct push access is available via PAT if needed — rotate after use.

