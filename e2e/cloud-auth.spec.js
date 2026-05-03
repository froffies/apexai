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

  if (/\/onboarding$/.test(page.url())) {
    await page.getByLabel("Name").fill("Cloud Casey")
    await page.getByLabel("Age").fill("31")
    await page.getByLabel("Weight kg").fill("84")
    await page.getByLabel("Height cm").fill("179")
    await page.getByRole("button", { name: /continue/i }).click()
    await page.getByLabel("Training days").fill("4")
    await page.getByLabel("Target weight kg").fill("78")
    await page.getByRole("button", { name: /review plan/i }).click()
    await page.getByRole("button", { name: /save profile and enter dashboard|enter dashboard/i }).first().click()
    await expect(page).toHaveURL(/\/$/)
  }

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
