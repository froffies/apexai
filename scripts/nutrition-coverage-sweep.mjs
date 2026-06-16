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
  { category: "catalogue", query: "100g chicken breast", expectName: /chicken/i, allowedSourceTypes: ["curated_au_catalogue"] },
  { category: "catalogue", query: "light milk", expectName: /milk/i, allowedSourceTypes: ["curated_au_catalogue"] },
  { category: "catalogue", query: "weetbix", expectName: /weet/i, allowedSourceTypes: ["nz_curated_catalogue"] },
  { category: "catalogue", query: "watties baked beans", expectName: /watties baked beans/i, allowedSourceTypes: ["nz_curated_catalogue"] },
  { category: "catalogue", query: "lewis road light milk", expectName: /lewis road/i, allowedSourceTypes: ["nz_curated_catalogue"] },
  { category: "catalogue", query: "milo", expectName: /milo/i, allowedSourceTypes: ["curated_au_catalogue"] },
  { category: "catalogue", query: "vegemite", expectName: /vegemite/i, allowedSourceTypes: ["curated_au_catalogue"] },
  { category: "macro_questions", query: "standard serve of caesar salad", expectName: /caesar salad/i, minCalories: 250 },
  { category: "macro_questions", query: "salmon poke bowl", expectName: /poke bowl/i, minCalories: 500 },
  { category: "macro_questions", query: "parmi", expectName: /parmi|parma|parmigiana/i, allowedSourceTypes: ["estimated_internal_profile"], minCalories: 900 },
  { category: "macro_questions", query: "bubble tea", expectName: /bubble tea/i, allowedSourceTypes: ["estimated_internal_profile"], minCalories: 200 },
  { category: "macro_questions", query: "potato scallops", expectName: /potato scallops/i, allowedSourceTypes: ["estimated_internal_profile"], minCarbs: 20 },
  { category: "macro_questions", query: "subway chicken teriyaki", expectName: /subway chicken teriyaki/i, allowedSourceTypes: ["estimated_internal_profile"], minCarbs: 40 },
  { category: "macro_questions", query: "hsp", expectName: /hsp/i, allowedSourceTypes: ["estimated_internal_profile"], minCalories: 1000 },
  { category: "macro_questions", query: "fried chicken and chips", expectName: /fried chicken and chips/i, allowedSourceTypes: ["estimated_internal_profile"], minCalories: 800 },
  { category: "macro_questions", query: "salmon hand roll", expectName: /hand roll/i, allowedSourceTypes: ["estimated_internal_profile"], minCalories: 150 },
  { category: "macro_questions", query: "lamington", expectName: /lamington/i, allowedSourceTypes: ["estimated_internal_profile"], minCalories: 200 },
  { category: "macro_questions", query: "pavlova", expectName: /pavlova/i, allowedSourceTypes: ["estimated_internal_profile"], minCalories: 250 },
  { category: "slang_typos", query: "parmy", expectName: /parmy|parmi|parmigiana/i },
  { category: "slang_typos", query: "parmie", expectName: /parmie|parmi|parmigiana/i },
  { category: "slang_typos", query: "bubbletea", expectName: /bubble tea/i },
  { category: "slang_typos", query: "potato cake", expectName: /potato scallops/i },
  { category: "slang_typos", query: "fish n chips", expectName: /fish and chips/i },
  { category: "slang_typos", query: "dimsim", expectName: /dim/i },
  { category: "slang_typos", query: "bacon n egg roll", expectName: /bacon and egg roll/i },
  { category: "slang_typos", query: "b&e roll", expectName: /bacon and egg roll/i },
  { category: "slang_typos", query: "brekky burrito", expectName: /breakfast burrito/i },
  { category: "slang_typos", query: "cheese toasty", expectName: /toast/i },
  { category: "slang_typos", query: "salmon handroll", expectName: /hand roll/i },
  { category: "slang_typos", query: "salmon pokebowl", expectName: /poke bowl/i },
  { category: "slang_typos", query: "subway teryaki", expectName: /subway/i },
  { category: "slang_typos", query: "maccas big mac", expectName: /big mac/i },
  { category: "slang_typos", query: "hj whopper", expectName: /whopper/i },
  { category: "slang_typos", query: "souva", expectName: /souvlaki|kebab/i },
  { category: "slang_typos", query: "yiros", expectName: /gyro|kebab/i },
  { category: "slang_typos", query: "schnitty and chips", expectName: /schnitzel/i },
  { category: "slang_typos", query: "banhmi", expectName: /banh mi/i },
  { category: "slang_typos", query: "weet bix", expectName: /weet/i, allowedSourceTypes: ["nz_curated_catalogue"] },
  { category: "brands_takeaway", query: "kfc original fillet burger", expectName: /kfc original burger/i },
  { category: "brands_takeaway", query: "tim tam original", expectName: /tim tam original/i, allowedSourceTypes: ["nz_curated_catalogue"] },
  { category: "brands_takeaway", query: "pams wedges", expectName: /pams.*wedges/i, allowedSourceTypes: ["nz_curated_catalogue"] },
  { category: "brands_takeaway", query: "sausage sizzle", expectName: /sausage sizzle/i },
]

loadDotEnvIntoProcess()

const baseUrl = String(process.env.NUTRITION_SWEEP_BASE_URL || "http://127.0.0.1:8787").trim().replace(/\/$/, "")
const headers = await buildAuthHeaders()
const failures = []
const categoryTotals = new Map()
const categoryPasses = new Map()

for (const testCase of CASES) {
  categoryTotals.set(testCase.category, (categoryTotals.get(testCase.category) || 0) + 1)
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

  categoryPasses.set(testCase.category, (categoryPasses.get(testCase.category) || 0) + 1)
  console.log(`PASS ${testCase.query}: ${top.name} [${top.source_type}] ${Math.round(Number(top.calories) || 0)} kcal`)
}

if (failures.length) {
  console.error(`\n${failures.length} nutrition coverage case(s) failed.`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`\nNutrition coverage sweep passed for ${CASES.length} case(s).`)
console.log("\nCategory summary")
for (const [category, total] of [...categoryTotals.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
  const passed = categoryPasses.get(category) || 0
  console.log(`  ${category}: ${passed}/${total}`)
}
