# ApexAI Restore Status

## Current Status

The project has been restored and rebuilt into a fully usable local-first Vite app, then expanded against the full Base44 AI transcript the user provided.

Verified commands:

- `npm run build` passes.
- `npm run mobile:build` passes and syncs the Capacitor iOS project.
- `npm run lint` passes.
- `npm run typecheck` passes.
- `npm run package:zip` creates a portable archive with POSIX `/` zip entry paths.
- `npm test` passes for core coach parsing and nutrition non-guessing rules.
- `npm test` now also passes for local API server health, nutrition search, telemetry intake, coach-missing-key fallback, and merge-aware sync conflict logic.
- `npm run test:e2e` passes for onboarding editing, tab-stack behavior, overflow checks, undo toasts, manual meal logging, recipe editing, active workout save/resume flows, and route console cleanliness.
- `npm run test:e2e` also passes for progress-photo device import and persistence.
- `npm run test:e2e` also covers the mobile-only regression that dedicated log routes must hide the bottom tab bar and active workout chrome.
- `npm run test:e2e` includes an opt-in Supabase sign-in flow that auto-skips unless `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `E2E_SUPABASE_EMAIL`, and `E2E_SUPABASE_PASSWORD` are present.
- `npm run test:full` passes end-to-end.
- `npm audit --audit-level=moderate` reports 0 vulnerabilities after removing unused dependencies and stale bundle baggage.
- Live route smoke checks pass for `/`, `/Coach`, `/Workouts`, `/Nutrition`, `/Progress`, `/Profile`, `/Analytics`, `/Recipes`, `/ShoppingList`, `/WorkoutLibrary`, `/Challenges`, `/ProgressPhotos`, `/nutrition/log`, and `/workouts/log`.
- Direct runtime checks pass for `http://127.0.0.1:5173/onboarding` and `http://127.0.0.1:8787/health`.

The dev server runs at:

- `http://127.0.0.1:5173`

## What Was Rebuilt

The uploaded restore script and zips were missing most real page/component implementations, so the app has been rebuilt with local storage backed flows for:

- Widgetable dashboard with edit/reorder/hide controls
- Premium Home briefing card with recovery, progression, nutrition-gap, and sync-status context
- Shared design-system polish:
  - refined page headers
  - rounded section cards
  - segmented view controls
  - improved metric tiles and macro rings
- Crash/error telemetry buffer with optional `/api/telemetry` server sink
- Offline sync conflict detection plus visible conflict-resolution controls in the profile/device panel and Home briefing
- Merge-aware sync reconciliation for list-like records, including auto-merges for non-overlapping collections and suggested merge actions when the same record diverges across devices
- Onboarding validation, progress feedback, and clearer step-completion guidance
- Nutrition, meal logging, verified AU-first food lookup, meal plans, and target editing
- Workout plans, workout logging, active workout flow, exercise library, next-workout suggestions, and calendar scheduling
- Progress check-ins, long-term analytics charts, progress photos, body-part tags, and comparison slider
- Progress photo device import via file picker plus direct URL fallback
- Profile/onboarding targets
- Recipes and shopping list
- Challenges
- Local rule-based coach chat with workout/meal planning, plan edits, target updates, explicit-only logging, and voice input where supported
- OpenAI coach server integration with structured action responses and local fallback when no API key/server is available
- Supabase-ready email/password auth, per-user cloud state sync, and RLS SQL setup
- Capacitor iOS project, native notification/haptics/share helpers, and iOS privacy descriptions
- App privacy manifest scaffold bundled into the iOS target
- iPhone release metadata cleanup:
  - portrait-only iPhone orientation
  - `arm64` device capability instead of legacy `armv7`
- Server nutrition search endpoint with AU catalogue first and optional Open Food Facts Australia adapter
- IndexedDB-backed app record storage with legacy `localStorage` migration
- Real server-side Supabase account deletion endpoint requiring `SUPABASE_SERVICE_ROLE_KEY`
- Backend request validation, rate limiting, request logging, stricter production auth/CORS defaults
- Route lazy-loading/code-splitting and React error boundary
- Additional chart-focused code splitting into a dedicated `vendor-charts` chunk, plus lazy trend-chart components for Home, Progress, and Analytics
- Error boundary with diagnostics copy, reload, and go-home recovery actions
- Mobile log-route chrome hiding so `/nutrition/log` and `/workouts/log` are not obstructed by the bottom tab bar or active workout bar
- Synchronous write-through for save-and-exit flows so onboarding, meal logging, and workout logging survive immediate route changes
- Habit tracking with streaks/reminders-style controls
- Active workout status
- Training calendar
- Macro target editor
- Local data export/import/reset
- Achievements/badges and delete-account reset
- Mobile/iOS polish: safe areas, overscroll control, native-feeling tab behavior, focus/readability fixes, lower-case log routes
- Main-surface UX refinement:
  - Home reorganised into dashboard / insights / habits views
  - Nutrition reorganised into overview / builder / log / plans views
  - Workouts reorganised into overview / schedule / history / library views
  - Progress reorganised into summary / trends / check-ins views
  - Coach upgraded with prompt cards, cleaner bubbles, and stronger mobile composition
- Real toast rendering with undo flows for destructive nutrition/workout actions
- Dependency trim removing unused heavy packages while keeping the full test suite green
- Portable local API regression coverage in `tests/serverApi.test.mjs`

Nutrition handling now avoids blind macro guessing. Unknown foods require either a match from the curated Australian catalogue or manual macro entry before they are logged as structured nutrition data.

The app no longer waits on Base44 auth while running locally. `src/lib/AuthContext.jsx` now uses Supabase auth when configured, or a local development account when Supabase values are missing.

## Sources Merged

- Restore script from `restore_sections/create_apexai_part_001.py`
- Entity schemas and Base44 platform files from `C:\Users\guy\Downloads\new_base44_app.zip`

All 14 entity schemas are present in `src/entities`.

## Compile Plumbing Added

- `index.html`
- `src/main.jsx`
- `tailwind.config.js`
- Vite `@` alias in `vite.config.js`
- IndexedDB/local data helpers in `src/lib/appStorage.js`, `src/lib/useLocalStorage.js`, and `src/lib/fitnessDefaults.js`
- Portable zip packaging script in `scripts/package-zip.mjs`
- iOS SPM path normalizer in `scripts/normalize-ios-spm.mjs`

## Source Note

The app works, but it is a rebuild rather than a byte-for-byte recovery of the missing Base44 editor source. The recovered shadcn-style compatibility files in `src/components/ui` now export usable lightweight components instead of placeholder TODOs.

The current AI behavior now tries the OpenAI-backed coach endpoint first, then falls back to deterministic local coach logic so the app still runs without private credentials.

To enable the live OpenAI coach:

1. Create `.env` from `.env.example`.
2. Set `OPENAI_API_KEY`.
3. Run `npm run ai:server` in one terminal.
4. Run `npm run dev` in another terminal.

The React app calls `VITE_OPENAI_COACH_URL` and the key stays server-side.

For production cloud/mobile setup:

- Run `docs/supabase-schema.sql` in Supabase.
- Fill in Supabase and OpenAI values in `.env`.
- Deploy `server/openaiCoachServer.mjs`.
- Use `npm run mobile:build`; this also normalizes Capacitor SPM paths to forward slashes.
- Open `ios/App/App.xcodeproj` on macOS/Xcode for signing, TestFlight, and App Store submission.
- Add sensitive iOS permissions only when those features are implemented and tested.

If the exact original Base44 UI source becomes available later, those files can be swapped in without changing the rebuilt app structure.

## Current Bundle Snapshot

Largest generated assets after the latest bundle pass:

- `index`: about 406 KB
- `vendor-charts`: about 384 KB
- `vendor-data`: about 221 KB
- `vendor-react`: about 153 KB

That means the next bundle-trim wave should focus on chart payload and shared data/client code before chasing the already-small route chunks.
