import { defineConfig, devices } from "@playwright/test"

const playwrightAppPort = 4173
const playwrightCoachPort = 8791
const playwrightAppOrigin = `http://127.0.0.1:${playwrightAppPort}`
const playwrightCoachOrigin = `http://127.0.0.1:${playwrightCoachPort}`

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: playwrightAppOrigin,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `VITE_OPENAI_COACH_URL=${playwrightCoachOrigin}/api/coach VITE_NUTRITION_API_URL=${playwrightCoachOrigin}/api/nutrition/search VITE_ACCOUNT_DELETE_URL=${playwrightCoachOrigin}/api/account/delete VITE_TELEMETRY_URL=${playwrightCoachOrigin}/api/telemetry npm run dev -- --host 127.0.0.1 --port ${playwrightAppPort}`,
      url: playwrightAppOrigin,
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: `OPENAI_COACH_HOST=127.0.0.1 OPENAI_COACH_PORT=${playwrightCoachPort} OPENAI_COACH_REQUIRE_AUTH=false OPENAI_COACH_CORS_ORIGIN=${playwrightAppOrigin},http://localhost:${playwrightAppPort} npm run ai:server`,
      url: `${playwrightCoachOrigin}/health`,
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
  projects: [
    {
      name: "iphone",
      use: {
        ...devices["iPhone 13"],
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 960 },
      },
    },
  ],
})
