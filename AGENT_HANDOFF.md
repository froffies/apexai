# ApexAI — Agent Handoff

**Last updated:** 2026-06-30  
**Current HEAD:** `9b92f8c`  
**Live frontend:** [https://apexai-bay.vercel.app/](https://apexai-bay.vercel.app/)  
**Live backend:** [https://apexai-coach.onrender.com](https://apexai-coach.onrender.com)  
**Health endpoint:** [https://apexai-coach.onrender.com/health](https://apexai-coach.onrender.com/health)

---

## What this app is

ApexAI is an AI-first nutrition and fitness coaching app.

Users can:

- chat naturally about meals, workouts, goals, plans, and general coaching questions
- log meals and workouts through the coach
- ask nutrition questions without logging
- scan barcodes and analyze food photos
- create workout and meal plans

Core stack:

- **Frontend:** React + Vite on Vercel
- **Backend:** Node/Express coach server on Render
- **Auth + data:** Supabase
- **Nutrition data:** curated AU/NZ catalogue + barcode/OpenFoodFacts + controlled estimate fallbacks

---

## Coach Architecture

Live request flow:

1. User message hits `server/openaiCoachServer.mjs`
2. `server/coachSessionState.mjs` builds meal/workout candidate state from recent conversation
3. `server/mealStateBuilder.mjs` parses meal state graph-natively first, with legacy fallback only when the gate says the graph path is unsafe
4. `server/coachLoggingRules.mjs` derives validated deterministic actions and persistence hints
5. OpenAI produces the conversational reply plus structured actions when AI is needed
6. `server/normalizeCoachResponse.mjs` canonicalizes, strips invented persistence, and safely recovers omitted actions when backend proof exists
7. `server/coachAudit.mjs` records the turn for live QA and telemetry review

The system is **AI-first, not AI-only**:

- AI leads the conversation
- deterministic logic protects persistence integrity
- fallback logic exists for upstream AI failures and unsafe parser states

---

## Current Backend Roles

- `server/openaiCoachServer.mjs`  
  HTTP server, route handlers, OpenAI integration, nutrition/photo/barcode endpoints, prompt construction.

- `server/coachSessionState.mjs`  
  Builds meal and workout candidate state, mixed-turn intent graph, workout parsing, follow-up continuity.

- `server/mealStateBuilder.mjs`  
  Graph-native meal parser and the `shouldUseLegacy()` gate. Records `legacyGateClause` on fallback sessions.

- `server/mealStateBuilderLegacy.mjs`  
  Active fallback parser for complex multi-clause meal inputs. Still intentional and load-bearing.

- `server/coachLoggingRules.mjs`  
  Deterministic action shaping, meal/workout persistence validation, nutrition-answer helpers, persistence-language guards.

- `server/normalizeCoachResponse.mjs`  
  AI output validation, action canonicalization, clarify/persist recovery, invented persistence stripping.

- `server/coachAudit.mjs`  
  Audit persistence, flag generation, telemetry summaries, legacy-gate reporting.

- `server/nutritionPhotoAnalysis.mjs`  
  Photo-analysis normalization, AU/NZ dish matching, reviewed photo estimate generation.

- `server/utils.mjs`  
  Canonical server-side shared helpers. Do not duplicate these utilities elsewhere in `server/`.

---

## File Map

| File | Purpose | Lines |
|------|---------|-------|
| `server/openaiCoachServer.mjs` | Live coach server, prompts, API routes | 2682 |
| `server/mealStateBuilder.mjs` | Graph-native meal parser + legacy gate | 2279 |
| `server/mealStateBuilderLegacy.mjs` | Legacy fallback meal parser | 3155 |
| `server/coachSessionState.mjs` | Session builder, mixed-turn routing, workout parsing | 2423 |
| `server/coachLoggingRules.mjs` | Deterministic persistence/action logic | 1216 |
| `server/normalizeCoachResponse.mjs` | AI response sanitization and recovery | 793 |
| `server/coachAudit.mjs` | Audit storage and telemetry summary logic | 884 |
| `server/nutritionPhotoAnalysis.mjs` | Photo identification and macro estimation | 1202 |
| `server/utils.mjs` | Shared utility helpers | 50 |
| `src/lib/coachConversationMemory.js` | Older-message recall for long-gap follow-ups | 212 |

Archived pre-cutover code lives under:

- `server/archive/legacy-coach/`

Do not import from the archive path into live code.

---

## Current Design Rules

### AI-first response path

The AI is the primary responder. The deterministic layer proposes safe candidates and protects persistence. Do not silently revert this to parser-first routing.

### `shouldUseLegacy()` is intentional

`mealStateBuilderLegacy.mjs` is still the real fallback for complex meal turns. The graph-native parser owns simple/common flows first; the legacy parser still handles harder continuity and clause-heavy structures.

Every legacy fallback now records:

- `processingMode: "legacy"`
- `fallbackReason: "legacy_gate"`
- `legacyGateClause`

### Persist only on explicit logging intent

`coachLoggingRules.mjs` requires `mealSession.wantsLogging === true` for ordinary meal persistence. Do not change that back to permissive defaults.

### Nutrition questions must not mutate targets

`normalizeCoachResponse.mjs` strips `update_targets` when the user is really asking a nutrition question with quantity.

### Canonical multi-meal recovery is live

When AI under-returns meal actions for multi-meal turns, `normalizeCoachResponse.mjs` can backfill missing canonical `log_meal` actions by `meal_type`.

### Conversation memory is live

`src/lib/coachConversationMemory.js` is part of the live coach path. It lets the AI answer “what did you say earlier?” and similar long-gap follow-ups with recalled context.

### Shared server utilities are centralized

`cleanText`, `safeArray`, `safeNumber`, `roundMacro`, `titleCase`, and `escapeRegex` belong in `server/utils.mjs`. Do not re-copy them across server files.

---

## Important Fixes Already Shipped

The current live state already includes these major fixes:

- bare drinks can stay graph-native instead of falling through `non_graph_drink_mention`
- simple measured fresh-topic turns after assistant history can stay graph-native
- stale active legacy sessions can yield to a clearly fresh simple measured meal start
- suppressed meal state is preserved across later follow-ups
- mid-clarification conversation normalization keeps the right context
- deterministic fake-save audit false positives were reduced
- explicit multi-meal action recovery is live in `normalizeCoachResponse.mjs`
- workout plan directives route to AI planning instead of fake exercise logging
- nutrition questions with quantities no longer trigger `update_targets`

Fixes shipped in **this** pass (`9b92f8c`):

- `PACKAGED_UNIT_PATTERN` no longer false-matches contractions like `can't`
- real packaged starts such as `i had a can of coke` still stay legacy
- detailed follow-up turns like `300g steak medium rare cooked in butter` now safely merge into the original unresolved root item instead of duplicating it

---

## Current Validation Surface

Use these as the real validation commands:

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
npm run report:telemetry
```

Current verified local baseline on `9b92f8c`:

- `npm test`: `405/405` passing
- `npm run lint`: passing
- `npm run typecheck`: passing
- `npm run build`: passing
- `npm run test:coach-chaos`: passing
  - meal: `300`
  - workout: `150`
  - mixed: `100`

Current verified live baseline on `9b92f8c`:

- `test:coach-soak`: `35/35` conversations, `0` failures before clean streak
- Render `/health` reports live commit `9b92f8c`

---

## Current Telemetry Baseline

Fresh deployment sample for `9b92f8c`:

- `fresh_audit_records: 67`
- `coach_failure_rate: 0%`
- `legacy_fallback_rate: 5.4%`
- `low_confidence_macro_rate: 23.9%`
- `telemetry_error_rate: 0%`
- `photo_review_rate: 0%`

Fresh `by_legacy_gate_clause`:

- `non_graph_not_meal_start: 1`
- `non_graph_multi_quantity_signal: 1`

Fresh processing modes:

- `graph_native: 35`
- `legacy: 2`
- `idle: 8`

Fresh fallback reasons:

- `legacy_gate: 2`

This is the current real baseline. Do not use the older `82.4%` or `30.4%` fallback-rate numbers anymore.

---

## Monitoring Thresholds

Thresholds enforced by `scripts/coach-monitor-report.mjs`:

- `legacy_fallback_rate < 30%`
- `nutrition_low_confidence_search_rate < 60%`
- `coach_failure_rate < 5%`
- `telemetry_error_rate < 10%`

After every live deploy:

1. confirm Render `/health` shows the new SHA
2. run `npm run test:coach-soak`
3. run `MONITOR_COMMIT_SHA=<sha> npm run report:telemetry`

---

## Deployment Notes

- pushing to `main` deploys backend and frontend automatically
- Render can cold start; expect delay before live verification
- always confirm the deployed SHA at `/health` before running live verification
- `tmp/` is intentionally gitignored for soak/live artifacts

---

## Known Gaps

These are the real remaining gaps after the current pass:

1. The coach is still AI-first, not AI-only.  
   Deterministic validation and fallback rails are intentional.

2. `mealStateBuilderLegacy.mjs` is still active for complex meal turns.  
   This is by design until telemetry-backed gate reductions replace those cases safely.

3. Macro coverage is strongest for trusted catalogue/barcode/photo-dish matches.  
   Obscure foods and harder free-text foods can still fall back to lower-confidence estimates.

4. Photo analysis is good for simple and curated dishes but still needs review for messy/shared/ambiguous plates.

5. The current legacy gate sample is small.  
   `non_graph_not_meal_start` and `non_graph_multi_quantity_signal` are the next observed clauses, but they need more real traffic before changing gates again.

---

## Practical Workflow

- `git pull --rebase` before making changes
- validate locally before every push
- only trust telemetry after the new SHA is live on Render
- when changing routing or parser behavior, always rerun:
  - `npm test`
  - `npm run test:coach-chaos`
  - live soak
  - telemetry report

If another agent picks this up cold, the current source of truth is:

- local + live SHA: `9b92f8c`
- local tests: `405/405`
- fresh live `legacy_fallback_rate`: `5.4%`
- fresh top legacy clauses: `non_graph_not_meal_start`, `non_graph_multi_quantity_signal`
