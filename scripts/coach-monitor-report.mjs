import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { createClient } from "@supabase/supabase-js"
import { listCoachAuditRecords, summarizeCoachAuditRecords } from "../server/coachAudit.mjs"

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

function safeParse(line) {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function countBy(list, keyBuilder) {
  const map = new Map()
  for (const item of list) {
    const key = keyBuilder(item)
    map.set(key, (map.get(key) || 0) + 1)
  }
  return [...map.entries()].sort((left, right) => right[1] - left[1])
}

function printSection(title, rows = []) {
  console.log(`\n${title}`)
  if (!rows.length) {
    console.log("  none")
    return
  }
  for (const [label, value] of rows) {
    console.log(`  ${label}: ${value}`)
  }
}

function readTelemetryFile(filePath, cutoff) {
  if (!fs.existsSync(filePath)) return []
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => safeParse(line))
    .filter(Boolean)
    .filter((event) => {
      const createdAt = Date.parse(String(event.created_at || ""))
      return Number.isFinite(createdAt) && createdAt >= cutoff
    })
}

async function readTelemetryFromSupabase(adminSupabase, tableName, cutoffIso) {
  if (!adminSupabase || !tableName) return []
  const { data, error } = await adminSupabase
    .from(tableName)
    .select("*")
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(1000)

  if (error) throw error
  return Array.isArray(data) ? data : []
}

function asRate(numerator, denominator) {
  if (!denominator) return 0
  return numerator / denominator
}

function formatPercent(value) {
  return `${Math.round(value * 1000) / 10}%`
}

function numericEnv(name, fallback) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) ? parsed : fallback
}

function buildAlertRows({ telemetryEvents = [], auditRecords = [], auditSummary = {} } = {}) {
  const photoTurns = auditSummary.photo_review_turns || 0
  const macroTurns = auditSummary.low_confidence_macro_turns || 0
  const coachTurns = auditSummary.total || auditRecords.length || 0
  const parserTurns = (auditSummary.graph_native_turns || 0) + (auditSummary.legacy_fallback_turns || 0)
  const errorEvents = telemetryEvents.filter((event) => String(event.level || "").trim().toLowerCase() === "error")
  const nutritionSearchEvents = telemetryEvents.filter((event) => event.type === "nutrition_search_completed")
  const nutritionSearchResolved = nutritionSearchEvents.filter((event) => Number(event.payload?.result_count || 0) > 0)
  const nutritionPhotoEvents = telemetryEvents.filter((event) => event.type === "nutrition_photo_completed")

  return [
    ["coach_failure_rate", asRate(auditSummary.failures || 0, coachTurns)],
    ["photo_review_rate", asRate(photoTurns, coachTurns)],
    ["low_confidence_macro_rate", asRate(macroTurns, coachTurns)],
    ["legacy_fallback_rate", asRate(auditSummary.legacy_fallback_turns || 0, parserTurns)],
    ["telemetry_error_rate", asRate(errorEvents.length, telemetryEvents.length || errorEvents.length || 0)],
    ["nutrition_search_empty_rate", asRate(nutritionSearchEvents.length - nutritionSearchResolved.length, nutritionSearchEvents.length)],
    ["nutrition_low_confidence_search_rate", asRate(nutritionSearchResolved.filter((event) => String(event.payload?.top_macro_confidence || "") === "low").length, nutritionSearchResolved.length)],
    ["nutrition_photo_review_rate", asRate(nutritionPhotoEvents.filter((event) => Boolean(event.payload?.needs_review)).length, nutritionPhotoEvents.length)],
  ]
}

function evaluateThresholds(rows = []) {
  const thresholds = {
    coach_failure_rate: numericEnv("MAX_COACH_FAILURE_RATE", 0.05),
    photo_review_rate: numericEnv("MAX_PHOTO_REVIEW_RATE", 0.45),
    low_confidence_macro_rate: numericEnv("MAX_LOW_CONFIDENCE_MACRO_RATE", 0.35),
    legacy_fallback_rate: numericEnv("MAX_LEGACY_FALLBACK_RATE", 0.30),
    telemetry_error_rate: numericEnv("MAX_TELEMETRY_ERROR_RATE", 0.10),
    nutrition_search_empty_rate: numericEnv("MAX_NUTRITION_SEARCH_EMPTY_RATE", 0.08),
    nutrition_low_confidence_search_rate: numericEnv("MAX_NUTRITION_LOW_CONFIDENCE_SEARCH_RATE", 0.60),
    nutrition_photo_review_rate: numericEnv("MAX_NUTRITION_PHOTO_REVIEW_RATE", 0.70),
  }

  return rows
    .filter(([name, value]) => value > (thresholds[name] ?? Number.POSITIVE_INFINITY))
    .map(([name, value]) => [name, `${formatPercent(value)} > ${formatPercent(thresholds[name])}`])
}

loadDotEnvIntoProcess()

const reportDays = Math.max(1, Number(process.env.TELEMETRY_REPORT_DAYS || 7))
const cutoffMs = Date.now() - (reportDays * 24 * 60 * 60 * 1000)
const cutoffIso = new Date(cutoffMs).toISOString()
const telemetryLogFile = process.env.TELEMETRY_LOG_FILE || path.join(rootDir, "server-data", "telemetry.ndjson")
const telemetryTableName = process.env.TELEMETRY_TABLE_NAME || "telemetry_events"
const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim()
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
const failOnThresholds = String(process.env.MONITOR_FAIL_ON_THRESHOLDS || "false").trim().toLowerCase() === "true"

const adminSupabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  : null

let telemetryEvents = []
let telemetrySource = "file"

if (adminSupabase) {
  try {
    telemetryEvents = await readTelemetryFromSupabase(adminSupabase, telemetryTableName, cutoffIso)
    telemetrySource = `supabase:${telemetryTableName}`
  } catch {
    telemetryEvents = readTelemetryFile(telemetryLogFile, cutoffMs)
    telemetrySource = `file:${telemetryLogFile}`
  }
} else {
  telemetryEvents = readTelemetryFile(telemetryLogFile, cutoffMs)
  telemetrySource = `file:${telemetryLogFile}`
}

let auditRecords = []
let auditSummary = null
let auditSource = "unavailable"

if (adminSupabase) {
  try {
    auditRecords = await listCoachAuditRecords(adminSupabase, {
      limit: Number(process.env.COACH_AUDIT_REPORT_LIMIT || 240),
      date_from: cutoffIso.slice(0, 10),
    })
    auditSummary = summarizeCoachAuditRecords(auditRecords)
    auditSource = "supabase:user_app_state"
  } catch {
    auditRecords = []
    auditSummary = null
    auditSource = "unavailable"
  }
}

console.log(`Coach monitor report for last ${reportDays} day(s)`)
console.log(`Telemetry source: ${telemetrySource}`)
console.log(`Audit source: ${auditSource}`)
console.log(`Telemetry events: ${telemetryEvents.length}`)
console.log(`Audit records: ${auditRecords.length}`)

const photoEvents = telemetryEvents.filter((event) => String(event.type || "").startsWith("coach_photo_"))
const barcodeEvents = telemetryEvents.filter((event) => String(event.type || "").startsWith("coach_barcode_"))
const nutritionSearchEvents = telemetryEvents.filter((event) => event.type === "nutrition_search_completed")
const nutritionPhotoEvents = telemetryEvents.filter((event) => event.type === "nutrition_photo_completed" || event.type === "nutrition_photo_review_completed")
const errorEvents = telemetryEvents.filter((event) => String(event.level || "").trim().toLowerCase() === "error")

printSection("Telemetry event types", countBy(telemetryEvents, (event) => String(event.type || "unknown")))
printSection("Photo analysis confidence", countBy(
  photoEvents.filter((event) => event.type === "coach_photo_analysis_completed" || event.type === "coach_photo_review_completed"),
  (event) => `${event.type}:${String(event.payload?.macro_confidence || "unknown")}:${event.payload?.needs_review ? "needs_review" : "ready"}`
))
printSection("Photo source types", countBy(
  photoEvents.filter((event) => event.type === "coach_photo_analysis_completed" || event.type === "coach_photo_review_completed" || event.type === "coach_photo_logged"),
  (event) => String(event.payload?.source_type || "unknown")
))
printSection("Barcode outcomes", countBy(
  barcodeEvents.filter((event) => event.type === "coach_barcode_lookup_completed" || event.type === "coach_barcode_logged"),
  (event) => `${event.type}:${String(event.payload?.match_kind || event.payload?.selected_match_kind || "unknown")}`
))
printSection("Nutrition search outcomes", countBy(
  nutritionSearchEvents,
  (event) => `${String(event.payload?.query_kind || "unknown")}:${String(event.payload?.top_source_type || "none")}:${String(event.payload?.top_macro_confidence || "none")}:${Number(event.payload?.result_count || 0) > 0 ? "resolved" : "empty"}`
))
printSection("Nutrition photo outcomes", countBy(
  nutritionPhotoEvents,
  (event) => `${event.type}:${String(event.payload?.source_type || "unknown")}:${String(event.payload?.macro_confidence || "unknown")}:${event.payload?.needs_review ? "needs_review" : "ready"}`
))
printSection("Telemetry error events", countBy(errorEvents, (event) => String(event.type || "unknown")))

if (auditSummary) {
  printSection("Coach audit routes", countBy(
    Object.entries(auditSummary.by_route || {}).map(([label, value]) => ({ label, value })),
    (entry) => entry.label
  ).map(([label]) => [label, auditSummary.by_route[label]]))

  printSection("Coach parser modes", countBy(
    Object.entries(auditSummary.by_processing_mode || {}).map(([label, value]) => ({ label, value })),
    (entry) => entry.label
  ).map(([label]) => [label, auditSummary.by_processing_mode[label]]))

  printSection("Coach fallback reasons", countBy(
    Object.entries(auditSummary.by_fallback_reason || {}).map(([label, value]) => ({ label, value })),
    (entry) => entry.label
  ).map(([label]) => [label, auditSummary.by_fallback_reason[label]]))

  console.log("\nCoach audit rates")
  const alertRows = buildAlertRows({ telemetryEvents, auditRecords, auditSummary })
  for (const [name, value] of alertRows) {
    console.log(`  ${name}: ${formatPercent(value)}`)
  }

  const breaches = evaluateThresholds(alertRows)
  if (breaches.length) {
    printSection("Threshold breaches", breaches)
    if (failOnThresholds) {
      process.exitCode = 1
    }
  }
}

const recentErrors = errorEvents.slice(0, 5)
if (recentErrors.length) {
  console.log("\nRecent telemetry errors")
  for (const event of recentErrors) {
    console.log(`  ${event.created_at || "unknown"} - ${event.type || "unknown"} - ${String(event.payload?.message || event.payload?.reason || "no message")}`)
  }
}
