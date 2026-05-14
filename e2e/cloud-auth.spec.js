import { expect, test } from "@playwright/test"

const hasCloudAuthEnv = Boolean(
  process.env.VITE_SUPABASE_URL
  && process.env.VITE_SUPABASE_ANON_KEY
  && process.env.E2E_SUPABASE_EMAIL
  && process.env.E2E_SUPABASE_PASSWORD
)

async function fillStable(page, label, value) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const input = page.getByLabel(label)
    try {
      await expect(input).toBeVisible()
      await input.fill(value)
      await expect(input).toHaveValue(value)
      return
    } catch (error) {
      if (attempt === 2) throw error
    }
  }
}

async function completeOnboardingIfNeeded(page) {
  await page.waitForURL(/(\/|\/onboarding)$/)
  if (!/\/onboarding$/.test(page.url())) return

  await expect(page.getByRole("heading", { name: /personal details/i })).toBeVisible()
  await fillStable(page, "Name", "Cloud Casey")
  await fillStable(page, "Age", "31")
  await fillStable(page, "Weight kg", "84")
  await fillStable(page, "Height cm", "179")
  await page.getByRole("button", { name: /continue/i }).click()

  await expect(page.getByRole("heading", { name: /goal and training setup/i })).toBeVisible()
  await fillStable(page, "Training days", "4")
  await fillStable(page, "Target weight kg", "78")
  await page.getByRole("button", { name: /review plan/i }).click()

  await expect(page.getByRole("heading", { name: /your starting plan/i })).toBeVisible()
  await page.getByRole("button", { name: /save profile and enter dashboard|enter dashboard/i }).first().click()
  await expect(page).toHaveURL(/\/$/)
}

test("cloud auth sign-in flow works when Supabase credentials are configured", async ({ page }) => {
  test.skip(!hasCloudAuthEnv, "Cloud auth E2E is opt-in and requires Supabase test credentials.")

  await page.goto("/")
  await expect(page.getByRole("heading", { name: /sign in to continue/i })).toBeVisible()

  await page.getByLabel("Email").fill(process.env.E2E_SUPABASE_EMAIL || "")
  await page.getByLabel("Password").fill(process.env.E2E_SUPABASE_PASSWORD || "")
  await page.getByRole("button", { name: /^sign in$/i }).click()

  await expect(page.getByRole("heading", { name: /sign in to continue/i })).toHaveCount(0)
  await expect(page).toHaveURL(/(\/|\/onboarding)$/)
  await page.reload()
  await expect(page.getByRole("heading", { name: /sign in to continue/i })).toHaveCount(0)
  await expect(page).toHaveURL(/(\/|\/onboarding)$/)
})

test("cloud auth users can reach Profile, save changes, and sign out cleanly", async ({ page }) => {
  test.skip(!hasCloudAuthEnv, "Cloud auth E2E is opt-in and requires Supabase test credentials.")

  await page.goto("/")
  await page.getByLabel("Email").fill(process.env.E2E_SUPABASE_EMAIL || "")
  await page.getByLabel("Password").fill(process.env.E2E_SUPABASE_PASSWORD || "")
  await page.getByRole("button", { name: /^sign in$/i }).click()
  await expect(page.getByRole("heading", { name: /sign in to continue/i })).toHaveCount(0)

  await completeOnboardingIfNeeded(page)

  await page.getByRole("link", { name: /^Profile$/i }).first().click()
  await expect(page.getByRole("heading", { name: /profile and targets/i })).toBeVisible()
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible()

  await page.getByLabel("Name").fill("Cloud Casey")
  await page.getByRole("button", { name: /save profile/i }).click()
  await page.reload()
  await expect(page.getByRole("heading", { name: /sign in to continue/i })).toHaveCount(0)
  await page.getByRole("link", { name: /^Profile$/i }).first().click()
  await expect(page.getByRole("heading", { name: /profile and targets/i })).toBeVisible()
  await expect(page.getByLabel("Name")).toHaveValue("Cloud Casey")

  await page.getByRole("button", { name: /sign out/i }).click()
  await expect(page.getByRole("heading", { name: /sign in to continue/i })).toBeVisible()
})
