import { expect, test } from "@playwright/test"

const hasCloudAuthEnv = Boolean(
  process.env.VITE_SUPABASE_URL
  && process.env.VITE_SUPABASE_ANON_KEY
  && process.env.E2E_SUPABASE_EMAIL
  && process.env.E2E_SUPABASE_PASSWORD
)

test("cloud auth sign-in flow works when Supabase credentials are configured", async ({ page }) => {
  test.skip(!hasCloudAuthEnv, "Cloud auth E2E is opt-in and requires Supabase test credentials.")

  await page.goto("/")
  await expect(page.getByRole("heading", { name: /sign in to sync your coach data/i })).toBeVisible()

  await page.getByLabel("Email").fill(process.env.E2E_SUPABASE_EMAIL || "")
  await page.getByLabel("Password").fill(process.env.E2E_SUPABASE_PASSWORD || "")
  await page.getByRole("button", { name: /^sign in$/i }).click()

  await expect(page.getByRole("heading", { name: /sign in to sync your coach data/i })).toHaveCount(0)
  await expect(page).toHaveURL(/(\/|\/onboarding)$/)
})
