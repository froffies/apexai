import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createClient } from "@supabase/supabase-js"

const rootDir = process.cwd()

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

function base64ImageDataUrl(filePath) {
  const resolved = path.resolve(filePath)
  const mime = resolved.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg"
  const buffer = fs.readFileSync(resolved)
  return `data:${mime};base64,${buffer.toString("base64")}`
}

async function buildAuthHeaders() {
  const explicitToken = String(process.env.NUTRITION_SMOKE_TOKEN || "").trim()
  if (explicitToken) return { Authorization: `Bearer ${explicitToken}` }

  const email = String(process.env.E2E_SUPABASE_EMAIL || "").trim()
  const password = String(process.env.E2E_SUPABASE_PASSWORD || "").trim()
  const supabaseUrl = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim()
  const supabaseAnonKey = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim()
  if (!email || !password || !supabaseUrl || !supabaseAnonKey) return {}

  const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data?.session?.access_token) {
    throw new Error(error?.message || "Unable to obtain Supabase access token for smoke test.")
  }
  return { Authorization: `Bearer ${data.session.access_token}` }
}

async function postJson(baseUrl, route, body, headers = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
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

function ensureTopResult(result, label) {
  if (!result.ok) {
    throw new Error(`${label} failed with ${result.status}: ${result.data?.error || "unknown error"}`)
  }
  const top = Array.isArray(result.data?.results) ? result.data.results[0] : null
  if (!top) throw new Error(`${label} returned no results`)
  return top
}

loadDotEnvIntoProcess()

const baseUrl = String(process.env.NUTRITION_SMOKE_BASE_URL || "http://127.0.0.1:8787").trim().replace(/\/$/, "")
const photoPath = String(process.env.NUTRITION_SMOKE_PHOTO_PATH || "").trim()
const barcodeCode = String(process.env.NUTRITION_SMOKE_BARCODE || "").trim()

const headers = await buildAuthHeaders()
const failures = []

async function runCheck(label, runner) {
  try {
    const value = await runner()
    console.log(`PASS ${label}: ${value}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failures.push(`${label}: ${message}`)
    console.error(`FAIL ${label}: ${message}`)
  }
}

await runCheck("health", async () => {
  const response = await fetch(`${baseUrl}/health`)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`health returned ${response.status}`)
  return `${data.status || "ok"} model=${data.model || "unknown"}`
})

await runCheck("100g chicken breast search", async () => {
  const result = await postJson(baseUrl, "/api/nutrition/search", { query: "100g chicken breast" }, headers)
  const top = ensureTopResult(result, "100g chicken breast search")
  return `${top.name} [${top.source_type}] ${Math.round(Number(top.calories) || 0)} kcal`
})

await runCheck("caesar salad search", async () => {
  const result = await postJson(baseUrl, "/api/nutrition/search", { query: "standard serve of caesar salad" }, headers)
  const top = ensureTopResult(result, "caesar salad search")
  return `${top.name} [${top.source_type}] ${Math.round(Number(top.calories) || 0)} kcal`
})

await runCheck("poke bowl search", async () => {
  const result = await postJson(baseUrl, "/api/nutrition/search", { query: "salmon poke bowl" }, headers)
  const top = ensureTopResult(result, "poke bowl search")
  return `${top.name} [${top.source_type}] ${Math.round(Number(top.calories) || 0)} kcal`
})

if (barcodeCode) {
  await runCheck("barcode search", async () => {
    const result = await postJson(baseUrl, "/api/nutrition/search", { query: barcodeCode }, headers)
    const top = ensureTopResult(result, "barcode search")
    return `${top.name} [${top.source_type}]`
  })
}

if (photoPath) {
  await runCheck("photo analysis", async () => {
    const result = await postJson(baseUrl, "/api/nutrition/analyze-photo", {
      imageDataUrl: base64ImageDataUrl(photoPath),
      locale: "AU",
      mealType: "snack",
    }, headers)
    if (!result.ok) {
      throw new Error(`photo analysis failed with ${result.status}: ${result.data?.error || "unknown error"}`)
    }
    return `${result.data?.food_name || result.data?.summary || "photo"} [${result.data?.macro_confidence || "unknown"}] review=${Boolean(result.data?.needs_review)}`
  })
}

if (failures.length) {
  console.error(`\n${failures.length} nutrition smoke check(s) failed.`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("\nNutrition smoke checks passed.")
