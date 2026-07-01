# ApexAI — Agent Handoff

**Last updated:** 2026-07-01
**Current HEAD:** `b153938` (awaiting soak verification)
**Last clean live SHA:** `9d676e5`
**Live frontend:** https://apexai-bay.vercel.app/
**Live backend:** https://apexai-coach.onrender.com
**Health endpoint:** https://apexai-coach.onrender.com/health

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
- Deterministic logic protects persistence integrity
- Fallback logic exists for upstream AI failures and unsafe parser states

---

## Current Backend Roles

- `server/openaiCoachServer.mjs` — HTTP server, route handlers, OpenAI integration, nutrition/photo/barcode endpoints, prompt construction
- `server/coachSessionState.mjs` — Builds meal and workout candidate state, mixed-turn intent graph, workout parsing, follow-up continuity, suppressed session preservation
- `server/mealStateBuilder.mjs` — Graph-native meal parser and the `shouldUseLegacy()` gate. Records `legacyGateClause` on fallback sessions
- `server/mealStateBuilderLegacy.mjs` — Active fallback parser for complex multi-clause meal inputs. Still intentional and load-bearing
- `server/coachLoggingRules.mjs` — Deterministic action shaping, meal/workout persistence validation, multi-meal splitting by `meal_type`
- `server/normalizeCoachResponse.mjs` — AI output validation, action canonicalization, clarify/persist recovery, invented persistence stripping, multi-meal canonical backfill
- `server/coachAudit.mjs` — Audit persistence, flag generation, telemetry summaries, legacy-gate reporting
- `server/nutritionPhotoAnalysis.mjs` — Photo-analysis normalization, AU/NZ dish matching, reviewed photo estimate generation
- `server/utils.mjs` — Canonical server-side shared helpers. Do not duplicate these utilities elsewhere in `server/`

---

## File Map

| File | Purpose |
|------|---------|
| `server/openaiCoachServer.mjs` | Live coach server, prompts, API routes |
| `server/mealStateBuilder.mjs` | Graph-native meal parser + legacy gate |
| `server/mealStateBuilderLegacy.mjs` | Legacy fallback meal parser |
| `server/coachSessionState.mjs` | Session builder, mixed-turn routing, workout parsing |
| `server/coachLoggingRules.mjs` | Deterministic persistence/action logic |
| `server/normalizeCoachResponse.mjs` | AI response sanitization and recovery |
| `server/coachAudit.mjs` | Audit storage and telemetry summary logic |
| `server/nutritionPhotoAnalysis.mjs` | Photo identification and macro estimation |
| `server/utils.mjs` | Shared utility helpers |
| `src/lib/coachConversationMemory.js` | Older-message recall for long-gap follow-ups |

Archived pre-cutover code lives under `server/archive/legacy-coach/`. Do not import from the archive path into live code.

---

## Current Design Rules

### AI-first response path
The AI is the primary responder. The deterministic layer proposes safe candidates and protects persistence. Do not silently revert this to parser-first routing.

### `shouldUseLegacy()` is intentional
`mealStateBuilderLegacy.mjs` is still the real fallback for complex meal turns. Every legacy fallback records `processingMode: "legacy"`, `fallbackReason: "legacy_gate"`, and `legacyGateClause`.

### Persist only on explicit logging intent
`coachLoggingRules.mjs` requires `mealSession.wantsLogging === true` for ordinary meal persistence. Do not change that back to permissive defaults.

### Nutrition questions must not mutate targets
`normalizeCoachResponse.mjs` strips `update_targets` when the user is asking a nutrition question with a quantity.

### Canonical multi-meal recovery is live
When AI under-returns meal actions for multi-meal turns, `normalizeCoachResponse.mjs` backfills missing canonical `log_meal` actions by `meal_type`, and also handles the case where AI returns a typeless `log_meal`.

### Suppression is preserved across session resets
`coachSessionState.mjs` preserves `meal_session.suppressed` state so a follow-up fresh meal after "don't log that" doesn't accidentally re-log.

### Mid-clarification context is protected
`mealStateBuilder.mjs` `normalizeConversation()` detects when a conversation is mid-clarification and does not strip prior user turns in that case.

---

## Important Fixes Shipped This Session (2026-07-01)

| SHA | Fix |
|-----|-----|
| `56c5a39` | Exempt measured drinks from `non_graph_drink_mention` |
| `42d9d05` | Graph-native mixed food+drink starts; AU/NZ nutrition aliases; photo dish wiring |
| `fae61d4` | Exempt simple multi-quantity and post-assistant fresh meal turns |
| `7d25f56` | Preserve suppression across fresh meal starts |
| `9dc9cde` | Preserve suppressed meal session in `buildMealSessionState` |
| `2d70f6e` | Protect mid-clarification context from `normalizeConversation` stripping |
| `19588d8` | Infer clarification progress in coach audit flags |
| `df8bded` | Treat already-logged turns as handled in coach audit flags |
| `b460a70` | Raise `isGraphNativeSimpleFreshMealTurn` clause limit to 3 |
| `a6dabd0` | Backfill canonical meal actions when AI returns `log_meal` with no `meal_type` |
| `b153938` | Exempt bare foodish turns from `non_graph_not_meal_start`; allow daypart suffix in `simpleFreshMealTurn` |

---

## Current Validation Surface

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

Last verified clean baseline on `9d676e5`:

- `npm test`: `405/405` passing
- `npm run lint`: passing
- `npm run typecheck`: passing
- `npm run build`: passing
- `npm run test:coach-chaos`: passing (meals 300, workouts 150, mixed 100)
- live soak: `35/35`, `0` failures before clean streak

---

## Current Telemetry Baseline

Last clean telemetry on `9d676e5`:

- `fresh_audit_records: 67`
- `coach_failure_rate: 0%`
- `legacy_fallback_rate: 13.9%`
- `low_confidence_macro_rate: 19.4%`
- `telemetry_error_rate: 0%`

Fresh `by_legacy_gate_clause`:

- `non_graph_multi_quantity_signal: 3`
- `non_graph_not_meal_start: 2`

Both targeted by `b153938`. Soak/telemetry pending.

Session start baseline was `82.4%`. Do not use that figure anymore.

---

## Monitoring Thresholds

- `legacy_fallback_rate < 30%`
- `nutrition_low_confidence_search_rate < 60%`
- `coach_failure_rate < 5%`
- `telemetry_error_rate < 10%`

After every live deploy:

1. Confirm Render `/health` shows the new SHA
2. Run `npm run test:coach-soak`
3. Run `MONITOR_COMMIT_SHA=<sha> npm run report:telemetry`

---

## Deployment Notes

- Pushing to `main` deploys backend and frontend automatically
- Render can cold start; expect delay before live verification
- Always confirm the deployed SHA at `/health` before running live verification
- `tmp/` is intentionally gitignored for soak/live artifacts

---

## Two-AI Workflow

This repo uses a two-agent workflow:

- **Claude** (this agent): reads files via GitHub API, writes and pushes code changes directly using a fine-grained PAT scoped to `froffies/apexai`. Handles diagnosis, fixes, and pushes.
- **Codex**: runs locally on WSL Ubuntu at `/home/guy/apexai`. Handles shell execution, `npm test`, soaks, telemetry, and anything requiring local process execution.

PAT note: any PAT shared in chat should be treated as potentially exposed. Rotate before the next session requiring push access.

---

## Known Remaining Gaps

1. `b153938` soak/telemetry not yet verified — this is the immediate next step
2. `low_confidence_macro_rate: 19.4%` — needs real miss data from audit before expanding catalogue
3. Playwright E2E suite not run this session — unknown current state
4. Capacitor mobile build not verified this session
5. Frontend features (recipes, favourites, barcode, charts, onboarding, recovery recommendations) not verified this session
6. `mealStateBuilderLegacy.mjs` still active for complex turns — intentional until telemetry-backed gate reductions replace them safely

---

## Practical Workflow

- `git pull origin main` before making changes
- Validate locally before every push
- Only trust telemetry after the new SHA is live on Render
- When changing routing or parser behavior, always rerun: `npm test`, `npm run test:coach-chaos`, live soak, telemetry report
- If another agent picks this up cold: start at the health endpoint, confirm live SHA, run soak, run telemetry, then read this doc
