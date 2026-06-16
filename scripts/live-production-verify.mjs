import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { chromium } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

const rootDir = process.cwd()
const outputDir = path.join(rootDir, "tmp", "live-verification")

function loadDotEnvIntoProcess(filePath = path.join(rootDir, ".env")) {
  if (!fs.existsSync(filePath)) return
  const contents = fs.readFileSync(filePath, "utf8")
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const separatorIndex = line.indexOf("=")
    if (separatorIndex <= 0) continue
    const key = line.slice(0, separatorIndex).trim()
    if (!key || process.env[key] !== undefined) continue
    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

async function buildAuthHeaders() {
  const email = String(process.env.E2E_SUPABASE_EMAIL || "").trim()
  const password = String(process.env.E2E_SUPABASE_PASSWORD || "").trim()
  const supabaseUrl = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim()
  const supabaseAnonKey = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim()
  if (!email || !password || !supabaseUrl || !supabaseAnonKey) return {}

  const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data?.session?.access_token) {
    throw new Error(error?.message || "Unable to obtain Supabase access token for live verification.")
  }
  return { Authorization: `Bearer ${data.session.access_token}` }
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  return { ok: response.ok, status: response.status, data }
}

function assertCheck(condition, message) {
  if (!condition) throw new Error(message)
}

async function completeOnboardingIfNeeded(page) {
  const personalDetailsHeading = page.getByRole("heading", { name: /personal details/i })
  const dashboardHeading = page.getByRole("heading", { name: /today's overview/i })
  if (!await personalDetailsHeading.isVisible().catch(() => false)) {
    if (await dashboardHeading.isVisible().catch(() => false)) return
  }

  if (!await personalDetailsHeading.isVisible().catch(() => false)) return

  await page.getByLabel("Name").fill("Cloud Casey")
  await page.getByLabel("Age").fill("31")
  await page.getByLabel("Weight kg").fill("84")
  await page.getByLabel("Height cm").fill("179")
  await page.getByRole("button", { name: /continue/i }).click()
  await page.getByLabel("Training days").fill("4")
  await page.getByLabel("Target weight kg").fill("78")
  await page.getByRole("button", { name: /review plan/i }).click()
  await page.getByRole("button", { name: /save profile and enter dashboard|enter dashboard/i }).first().click()
}

async function ensureSignedInOnProtectedRoute(page, frontendUrl) {
  const signInHeading = page.getByRole("heading", { name: /sign in to continue/i })
  if (!await signInHeading.isVisible().catch(() => false)) return false

  assertCheck(Boolean(process.env.E2E_SUPABASE_EMAIL && process.env.E2E_SUPABASE_PASSWORD), "UI auth required but Supabase E2E credentials are missing.")
  await page.getByLabel("Email").fill(process.env.E2E_SUPABASE_EMAIL || "")
  await page.getByLabel("Password").fill(process.env.E2E_SUPABASE_PASSWORD || "")
  await page.getByRole("button", { name: /^sign in$/i }).click()
  await page.waitForURL(/https:\/\/apexai-bay\.vercel\.app\//, { timeout: 30000 }).catch(() => {})
  await page.waitForFunction(() => {
    try {
      return Object.keys(window.localStorage || {}).some((key) => key.includes("-auth-token"))
    } catch {
      return false
    }
  }, { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(4000)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(`${frontendUrl}/Coach`, { waitUntil: "domcontentloaded", timeout: 60000 })
    const signInStillVisible = await signInHeading.isVisible().catch(() => false)
    if (!signInStillVisible) break
    await page.waitForTimeout(3000)
  }
  return true
}

async function sendCoachMessage(page, text) {
  const composer = page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i)
  await composer.fill(text)
  await page.getByRole("button", { name: /^send$/i }).click()
}

async function clearCoachChat(page) {
  const clearButton = page.getByRole("button", { name: /clear chat/i })
  if (!await clearButton.isVisible().catch(() => false)) return
  await clearButton.click()
  await page.waitForTimeout(1000)
}

async function waitForBodyText(page, predicates, timeout = 30000) {
  await page.waitForFunction((checks) => {
    const text = String(document.body?.innerText || "").toLowerCase()
    return checks.every((check) => text.includes(check))
  }, predicates.map((value) => String(value || "").toLowerCase()), { timeout })
  return page.locator("body").textContent().catch(() => "")
}

function latestReportLine(label, value, details = {}) {
  return {
    label,
    value,
    details,
    at: new Date().toISOString(),
  }
}

loadDotEnvIntoProcess()
fs.mkdirSync(outputDir, { recursive: true })

const frontendUrl = String(process.env.LIVE_VERIFY_BASE_URL || "https://apexai-bay.vercel.app").trim().replace(/\/$/, "")
const coachUrl = String(process.env.LIVE_VERIFY_COACH_URL || "https://apexai-coach.onrender.com/api/coach").trim()
const apiBaseUrl = coachUrl.replace(/\/api\/coach$/, "")
const requireUiAuth = String(process.env.LIVE_VERIFY_REQUIRE_UI_AUTH || "true").trim().toLowerCase() !== "false"
const runMutableFlow = String(process.env.LIVE_VERIFY_ALLOW_MUTATION || "false").trim().toLowerCase() === "true"
const report = {
  frontendUrl,
  coachUrl,
  started_at: new Date().toISOString(),
  checks: [],
}

const authHeaders = await buildAuthHeaders().catch((error) => {
  report.checks.push(latestReportLine("auth_headers", "failed", { message: error.message }))
  return {}
})

try {
  const frontendResponse = await fetch(frontendUrl)
  assertCheck(frontendResponse.ok, `frontend returned ${frontendResponse.status}`)
  report.checks.push(latestReportLine("frontend_health", "passed", { status: frontendResponse.status }))

  const coachHealthResponse = await fetch(`${apiBaseUrl}/health`)
  const coachHealth = await coachHealthResponse.json().catch(() => ({}))
  assertCheck(coachHealthResponse.ok, `coach health returned ${coachHealthResponse.status}`)
  report.checks.push(latestReportLine("coach_health", "passed", {
    status: coachHealthResponse.status,
    model: coachHealth.model,
    visionConfigured: coachHealth.openaiVisionConfigured,
  }))

  for (const query of [
    "100g chicken breast",
    "standard serve of caesar salad",
    "salmon poke bowl",
  ]) {
    const result = await postJson(`${apiBaseUrl}/api/nutrition/search`, { query }, authHeaders)
    assertCheck(result.ok, `${query} search failed with ${result.status}`)
    assertCheck(Array.isArray(result.data?.results) && result.data.results.length > 0, `${query} search returned no results`)
    const top = result.data.results[0]
    report.checks.push(latestReportLine(`nutrition_search:${query}`, "passed", {
      source_type: top.source_type,
      macro_confidence: top.macro_confidence,
      food: top.name,
      calories: top.calories,
    }))
  }

  if (requireUiAuth) {
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    try {
      await page.goto(frontendUrl, { waitUntil: "domcontentloaded", timeout: 60000 })
      await ensureSignedInOnProtectedRoute(page, frontendUrl)

      await completeOnboardingIfNeeded(page)
      await page.goto(`${frontendUrl}/Coach`, { waitUntil: "domcontentloaded", timeout: 60000 })
      await ensureSignedInOnProtectedRoute(page, frontendUrl)
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {})
      const composerVisible = await page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i).isVisible().catch(() => false)
      const routeBody = await page.locator("body").textContent().catch(() => "")
      assertCheck(composerVisible, `Coach composer was not reachable on the protected route. Current URL: ${page.url()}. Body: ${String(routeBody || "").slice(0, 400)}`)
      await clearCoachChat(page)

      await sendCoachMessage(page, "whats the macros for 100g chicken breast")
      const chickenReply = await waitForBodyText(page, ["chicken", "143", "protein"], 45000)
      assertCheck(/chicken/i.test(String(chickenReply || "")) && /\b143\b/i.test(String(chickenReply || "")), "Coach chicken macro reply was not visible.")
      assertCheck(!/couldn't reach the live coach/i.test(String(chickenReply || "")), "Coach chicken macro reply hit the live-failure fallback.")
      report.checks.push(latestReportLine("ui_coach_macro_chicken", "passed", { reply: String(chickenReply || "").slice(0, 240) }))

      await sendCoachMessage(page, "whats the macros for a standard serve of caesar salad")
      const caesarReply = await waitForBodyText(page, ["caesar", "360", "protein"], 45000)
      assertCheck(/caesar/i.test(String(caesarReply || "")) && /\b360\b/i.test(String(caesarReply || "")), "Coach caesar macro reply was not visible.")
      assertCheck(!/couldn't reach the live coach/i.test(String(caesarReply || "")), "Coach caesar macro reply hit the live-failure fallback.")
      report.checks.push(latestReportLine("ui_coach_macro_caesar", "passed", { reply: String(caesarReply || "").slice(0, 240) }))

      if (runMutableFlow) {
        await sendCoachMessage(page, "i had 2 eggs")
        await page.waitForTimeout(3500)
        const mealReply = await page.locator("[data-message-role='assistant'], .whitespace-pre-wrap").last().textContent().catch(() => "")
        assertCheck(/saved to today'?s nutrition|how many|logged/i.test(String(mealReply || "")), "Live meal logging flow did not produce a usable reply.")
        report.checks.push(latestReportLine("ui_coach_log_two_eggs", "passed", { reply: String(mealReply || "").slice(0, 240) }))
      }
    } finally {
      await page.screenshot({ path: path.join(outputDir, `live-ui-${Date.now()}.png`), fullPage: true }).catch(() => {})
      await browser.close()
    }
  }
} catch (error) {
  report.failed_at = new Date().toISOString()
  report.error = error instanceof Error ? error.message : String(error)
  const reportPath = path.join(outputDir, `live-production-verify-${Date.now()}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.error(`Live production verification failed. Report: ${reportPath}`)
  console.error(report.error)
  process.exit(1)
}

report.completed_at = new Date().toISOString()
const reportPath = path.join(outputDir, `live-production-verify-${Date.now()}.json`)
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
console.log(`Live production verification passed. Report: ${reportPath}`)
