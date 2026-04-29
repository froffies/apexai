# ApexAI Production iPhone Setup

## 1. Cloud Accounts And Data

Use Supabase for authentication and encrypted transport-backed cloud persistence.

1. Create a Supabase project.
2. Run `docs/supabase-schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env`.
4. Set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

When Supabase values are present, the app shows a sign-in screen and syncs app records from IndexedDB into `public.user_app_state` per authenticated user. Without Supabase values, it runs in local-only mode.

## 2. OpenAI Coach Backend

The OpenAI key must stay on the server.

1. Set `OPENAI_API_KEY` in `.env`.
2. Run `npm run ai:server`.
3. Run `npm run dev`.

For production, deploy `server/openaiCoachServer.mjs` to a Node host such as Render, Fly.io, Railway, or a container service. Set:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_COACH_CORS_ORIGIN`
- `OPENAI_COACH_REQUIRE_AUTH=true`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for permanent account deletion

Then set `VITE_OPENAI_COACH_URL` to the deployed `/api/coach` URL.

## 3. Nutrition Database

The client uses the curated AU catalogue first. The Node server also exposes:

- `POST /api/nutrition/search`

That endpoint merges the AU catalogue with an optional Open Food Facts Australia lookup. Set `OPENFOODFACTS_ENABLED=false` if you only want the curated local catalogue.

For a paid production nutrition source, keep the same endpoint shape and replace `searchOpenFoodFacts()` in `server/openaiCoachServer.mjs` with the provider adapter. The UI already consumes normalized `calories`, `protein_g`, `carbs_g`, `fat_g`, `quantity`, and `source` fields.

## 4. iPhone Wrapper

Capacitor is installed and configured.

Useful commands:

```powershell
npm run mobile:build
npm run mobile:add:ios
npm run mobile:open:ios
```

Creating and submitting the iOS project requires macOS with Xcode and an Apple Developer account. On Windows, the web bundle and Capacitor config can be prepared, but Xcode signing, TestFlight, and App Store upload must happen on a Mac.

## 5. Native Integrations

Implemented:

- Capacitor app shell config
- App privacy manifest scaffold
- Local notification helper
- Haptic feedback helper
- Native share helper
- Profile device/account panel

Not shipped in this build:

- Camera/photo-library import
- Microphone/native speech recognition
- Native health integrations

Do not add the related iOS privacy strings or entitlements until those features are actually implemented and tested.

## 6. Release Checklist

- Set production environment variables.
- Run `npm run build`.
- Run `npm run mobile:build`.
- Open the iOS project on macOS.
- Configure bundle id `com.apexai.fitness`.
- Add app icons and launch screen assets.
- Review `ios/App/App/PrivacyInfo.xcprivacy` against the final SDK/plugin list before upload.
- Configure only the privacy strings for features that are actually implemented and tested.
- Test sign-in, cloud sync, AI coach actions, nutrition search, notifications, and offline fallback on a physical iPhone.
