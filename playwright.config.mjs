import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: "OPENAI_COACH_HOST=127.0.0.1 OPENAI_COACH_PORT=8787 OPENAI_COACH_REQUIRE_AUTH=false OPENAI_COACH_CORS_ORIGIN=http://127.0.0.1:4173,http://localhost:4173 npm run ai:server",
      url: "http://127.0.0.1:8787/health",
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
