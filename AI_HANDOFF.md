# ApexAI AI Handoff

This package is a rebuilt, working local-first fitness app recovered from incomplete Base44 export material and then expanded against the full Base44 conversation transcript.

## What It Is

- Vite + React mobile-first app
- Local-first data model using IndexedDB-backed app storage
- Optional Supabase auth/cloud sync
- Optional OpenAI-backed coach server with local fallback logic
- Capacitor iOS wrapper scaffold included

## Current Product Shape

Main surfaces:

- Dashboard / Home
- Coach chat
- Workouts
- Nutrition
- Progress
- Profile

Major subsystems present:

- Onboarding with validation, progress states, starter targets, and starter plans
- Shared visual shell upgrades:
  - refined page headers
  - rounded section cards
  - segmented view controls
  - denser dashboard metric cards
- Premium Home briefing card with recovery, progression, nutrition gap, and sync summary
- Crash/error telemetry buffer with optional server sink
- Offline sync conflict detection plus visible resolution UX
- Suggested merge handling for list-like sync conflicts:
  - auto-merges when local/cloud records do not overlap
  - user-visible merge suggestions when the same record diverges
- Nutrition logging, meal builder, AI chef, barcode scan, favourites, recents, recipes, and shopping list
- Workout planning, active workout logging, schedule/calendar, and workout library
- Recovery-aware coach planning
- Longer-cycle progression logic:
  - deload detection
  - plateau breaker suggestions
  - weekly reshuffle
  - readiness-aware daily adjustments
- Progress charts, check-ins, and progress photos
- Progress charts, check-ins, and progress photos with device-file import or URL input
- Achievements, habits, and challenges
- Real visible toast notifications with undoable destructive actions
- iOS release hardening:
  - app privacy manifest scaffold included
  - iPhone orientation restricted to portrait
  - outdated `armv7` device capability removed in favour of `arm64`
- Storage write-through cleanup:
  - onboarding completion now uses the shared storage abstraction
  - sync/cache state stays more consistent during immediate route changes
- Cleaner page composition on the main surfaces:
  - Home split into dashboard / insights / habits views
  - Nutrition split into overview / builder / log / plans
  - Workouts split into overview / schedule / history / library
  - Progress split into summary / trends / check-ins
  - Coach upgraded with prompt cards and cleaner conversation shell

## Important Files

- App shell and routing:
  - `src/App.jsx`
  - `src/Layout.jsx`
  - `src/lib/tabStack.js`
- Coach:
  - `src/pages/Coach.jsx`
  - `src/lib/coachActions.js`
  - `src/lib/openaiCoachClient.js`
  - `server/openaiCoachServer.mjs`
- Telemetry and sync:
  - `src/lib/telemetry.js`
- `src/lib/cloudSync.js`
  - `src/components/NativeIntegrationPanel.jsx`
  - `src/components/CoachBriefingCard.jsx`
- Server/API validation:
  - `tests/serverApi.test.mjs`
  - `e2e/cloud-auth.spec.js`
- Workout intelligence:
  - `src/lib/workoutIntelligence.js`
  - `src/lib/progressionEngine.js`
- Nutrition:
  - `src/pages/Nutrition.jsx`
  - `src/components/IngredientMealFinder.jsx`
  - `src/components/MealLogModal.jsx`
  - `src/lib/nutritionHelpers.js`
  - `src/lib/nutritionMemory.js`
  - `src/lib/nutritionApiClient.js`
- Storage / cloud:
  - `src/lib/appStorage.js`
  - `src/lib/useLocalStorage.js`
  - `src/lib/cloudSync.js`
  - `src/lib/fitnessDefaults.js`

## How To Run

```powershell
npm install
npm run dev
```

Optional AI coach backend:

```powershell
npm run ai:server
```

## Environment Notes

- `.env` is intentionally excluded from the package.
- `node_modules` is intentionally excluded from the package.
- Supabase and OpenAI are optional for local development.
- Without them, the app still runs in local-only mode with local coach fallback.

## Validation Commands

Fast checks:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Browser smoke suite:

```powershell
npm run test:e2e
```

Optional cloud-auth browser check:

```powershell
$env:E2E_SUPABASE_EMAIL="test@example.com"
$env:E2E_SUPABASE_PASSWORD="secret"
npm run test:e2e
```

Full local verification:

```powershell
npm run test:full
```

## Current Validation Status

Last verified in this workspace:

- `npm run typecheck` passed
- `npm run lint` passed
- `npm test` passed
- `npm run build` passed
- `npm run test:e2e` passed
- `npm run test:full` passed
- `npm run mobile:build` passed
- `npm audit --audit-level=moderate` passed with 0 vulnerabilities
- local runtime checks passed:
  - `http://127.0.0.1:5173/onboarding` -> `200`
  - `http://127.0.0.1:8787/health` -> `200` with healthy JSON response

Current automated coverage shape:

- Node tests: 15 passing
- Playwright: 21 passing, 3 skipped by design
  - 2 skipped cloud-auth checks when Supabase E2E env vars are absent
  - 1 skipped desktop-only mobile-shell regression check

Playwright currently covers:

- onboarding text/numeric field editing
- mobile tab restore/reset behavior
- no horizontal overflow on key screens
- key screen visibility for Nutrition, Workouts, and Coach
- undo toast flow for meal deletion
- full manual meal logging flow through `/nutrition/log`
- in-place recipe editing persistence
- active workout flow from suggestion start through save/clear
- device-file progress photo import and persistence
- console/page-error cleanliness across key routes
- segmented main-screen navigation for Nutrition and Workouts
- opt-in Supabase sign-in flow when E2E cloud credentials are present

Node tests currently cover:

- coach action parsing and non-invented nutrition logging rules
- progression logic and weekly reshuffle behavior
- workout intelligence and active-session logging helpers
- local API server health, nutrition lookup, telemetry intake, and missing-key coach fallback
- sync conflict detection plus collection merge suggestions

## Packaging Notes

Use the built-in portable zip exporter:

```powershell
npm run package:zip
```

It writes POSIX-style `/` zip paths and excludes secrets, logs, `node_modules`, Pods, and build junk.

## Known Honest Caveats

- This is a rebuild, not the original exact Base44 source tree.
- The OpenAI coach is production-shaped, but real quality depends on valid server env and deployed backend.
- Telemetry is real locally and can post to `/api/telemetry`, but long-term production monitoring still needs a hosted collector and retention policy.
- Capacitor iOS project is included, but final signing, TestFlight, and App Store validation still require macOS + Xcode.
- Some advanced AI experiences are deterministic/local fallbacks when the live backend is not configured.
- The desktop-only Playwright project intentionally skips the mobile-shell chrome hiding test; the iPhone-emulated project covers that behavior.

## Recommended Next Moves

If another AI continues from here, the highest-value next steps are:

1. Add a hosted telemetry destination plus grouped crash reporting or Sentry-style triage.
2. Deepen conflict UX with merge previews for list-like records instead of whole-key local-vs-cloud choices.
3. Keep trimming bundle hotspots with more targeted chunking if bundle budgets get stricter.
   Current largest chunks after this pass:
   - `index`: ~406 KB
   - `vendor-charts`: ~384 KB
   - `vendor-data`: ~221 KB
   - `vendor-react`: ~153 KB
4. Implement only truly shipped native iPhone features next, then add their permissions at the same time.
5. Expand Playwright into cloud-sync/auth scenarios once a Supabase test environment exists.
6. Do a final real-device typography/keyboard pass in Xcode once the macOS build environment is available.
