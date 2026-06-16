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
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

async function buildAuthHeaders() {
  const explicitToken = String(process.env.NUTRITION_SWEEP_TOKEN || "").trim()
  if (explicitToken) return { Authorization: `Bearer ${explicitToken}` }

  const email = String(process.env.E2E_SUPABASE_EMAIL || "").trim()
  const password = String(process.env.E2E_SUPABASE_PASSWORD || "").trim()
  const supabaseUrl = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim()
  const supabaseAnonKey = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim()
  if (!email || !password || !supabaseUrl || !supabaseAnonKey) return {}

  const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data?.session?.access_token) {
    throw new Error(error?.message || "Unable to obtain Supabase access token for nutrition coverage sweep.")
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

const CASES = [
  { query: "100g chicken breast", expectName: /chicken/i, allowedSourceTypes: ["curated_au_catalogue"] },
  { query: "light milk", expectName: /milk/i, allowedSourceTypes: ["curated_au_catalogue"] },
  { query: "weetbix", expectName: /weet/i, allowedSourceTypes: ["nz_curated_catalogue"] },
  { query: "standard serve of caesar salad", expectName: /caesar salad/i, minCalories: 250 },
  { query: "salmon poke bowl", expectName: /poke bowl/i, minCalories: 500 },
  { query: "parmi", expectName: /parmi|parma|parmigiana/i, allowedSourceTypes: ["estimated_internal_profile"], minCalories: 900 },
  { query: "bubble tea", expectName: /bubble tea/i, allowedSourceTypes: ["estimated_internal_profile"], minCalories: 200 },
  { query: "potato scallops", expectName: /potato scallops/i, allowedSourceTypes: ["estimated_internal_profile"], minCarbs: 20 },
  { query: "subway chicken teriyaki", expectName: /subway chicken teriyaki/i, allowedSourceTypes: ["estimated_internal_profile"], minCarbs: 40 },
  { query: "hsp", expectName: /hsp/i, allowedSourceTypes: ["estimated_internal_profile"], minCalories: 1000 },
  { query: "fried chicken and chips", expectName: /fried chicken and chips/i, allowedSourceTypes: ["estimated_internal_profile"], minCalories: 800 },
  { query: "salmon hand roll", expectName: /hand roll/i, allowedSourceTypes: ["estimated_internal_profile"], minCalories: 150 },
  { query: "lamington", expectName: /lamington/i, allowedSourceTypes: ["estimated_internal_profile"], minCalories: 200 },
  { query: "pavlova", expectName: /pavlova/i, allowedSourceTypes: ["estimated_internal_profile"], minCalories: 250 },
]

loadDotEnvIntoProcess()

const baseUrl = String(process.env.NUTRITION_SWEEP_BASE_URL || "http://127.0.0.1:8787").trim().replace(/\/$/, "")
const headers = await buildAuthHeaders()
const failures = []

for (const testCase of CASES) {
  let result
  try {
    result = await postJson(baseUrl, "/api/nutrition/search", { query: testCase.query }, headers)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failures.push(`${testCase.query}: request failed before response (${message}). Start the local coach server or set NUTRITION_SWEEP_BASE_URL to a live backend.`)
    continue
  }
  const top = Array.isArray(result.data?.results) ? result.data.results[0] : null
  if (!result.ok) {
    failures.push(`${testCase.query}: request failed with ${result.status} (${result.data?.error || "unknown error"})`)
    continue
  }
  if (!top) {
    failures.push(`${testCase.query}: returned no results`)
    continue
  }
  if (testCase.expectName && !testCase.expectName.test(String(top.name || ""))) {
    failures.push(`${testCase.query}: expected top name ${testCase.expectName}, got "${top.name || ""}"`)
    continue
  }
  if (testCase.allowedSourceTypes && !testCase.allowedSourceTypes.includes(String(top.source_type || ""))) {
    failures.push(`${testCase.query}: expected source type in [${testCase.allowedSourceTypes.join(", ")}], got "${top.source_type || ""}"`)
    continue
  }
  if (Number.isFinite(testCase.minCalories) && Number(top.calories || 0) < testCase.minCalories) {
    failures.push(`${testCase.query}: expected calories >= ${testCase.minCalories}, got ${Number(top.calories || 0)}`)
    continue
  }
  if (Number.isFinite(testCase.minCarbs) && Number(top.carbs_g || 0) < testCase.minCarbs) {
    failures.push(`${testCase.query}: expected carbs >= ${testCase.minCarbs}, got ${Number(top.carbs_g || 0)}`)
    continue
  }

  console.log(`PASS ${testCase.query}: ${top.name} [${top.source_type}] ${Math.round(Number(top.calories) || 0)} kcal`)
}

if (failures.length) {
  console.error(`\n${failures.length} nutrition coverage case(s) failed.`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`\nNutrition coverage sweep passed for ${CASES.length} case(s).`)
