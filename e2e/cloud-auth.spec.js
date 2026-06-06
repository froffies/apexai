import fs from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

function readDotEnv() {
  try {
    const envPath = path.join(process.cwd(), ".env")
    const raw = fs.readFileSync(envPath, "utf8")
    return Object.fromEntries(
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const [key, ...valueParts] = line.split("=")
          return [key, valueParts.join("=").replace(/^["']|["']$/g, "")]
        })
    )
  } catch {
    return {}
  }
}

const dotEnv = readDotEnv()
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || dotEnv.VITE_SUPABASE_URL || dotEnv.SUPABASE_URL || ""
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || dotEnv.VITE_SUPABASE_ANON_KEY || dotEnv.SUPABASE_ANON_KEY || ""

const hasCloudAuthEnv = Boolean(
  supabaseUrl
  && supabaseAnonKey
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
  await page.waitForLoadState("domcontentloaded")
  const personalDetailsHeading = page.getByRole("heading", { name: /personal details/i })
  const dashboardHeading = page.getByRole("heading", { name: /today's overview/i })
  if (!await personalDetailsHeading.isVisible().catch(() => false)) {
    if (await dashboardHeading.isVisible().catch(() => false)) return
    await expect(personalDetailsHeading.or(dashboardHeading)).toBeVisible({ timeout: 15000 })
    if (await dashboardHeading.isVisible().catch(() => false)) return
  }

  await expect(personalDetailsHeading).toBeVisible()
  const continueButton = page.getByRole("button", { name: /continue/i })
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await fillStable(page, "Name", "Cloud Casey")
    await fillStable(page, "Age", "31")
    await fillStable(page, "Weight kg", "84")
    await fillStable(page, "Height cm", "179")
    try {
      await expect(continueButton).toBeEnabled({ timeout: 4000 })
      break
    } catch (error) {
      if (attempt === 3) throw error
    }
  }
  await continueButton.click()

  await expect(page.getByRole("heading", { name: /goal and training setup/i })).toBeVisible()
  await fillStable(page, "Training days", "4")
  await fillStable(page, "Target weight kg", "78")
  await page.getByRole("button", { name: /review plan/i }).click()

  await expect(page.getByRole("heading", { name: /your starting plan/i })).toBeVisible()
  await page.getByRole("button", { name: /save profile and enter dashboard|enter dashboard/i }).first().click()
  await expect(dashboardHeading).toBeVisible({ timeout: 15000 })
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
