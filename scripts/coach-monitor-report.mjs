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

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {}
}

function parseIsoMs(value) {
  const parsed = Date.parse(String(value || ""))
  return Number.isFinite(parsed) ? parsed : 0
}

function cleanText(value) {
  return String(value || "").trim().toLowerCase()
}

function normalizeCommitSha(value) {
  return cleanText(value).slice(0, 12)
}

function commitMatches(value, filterValue) {
  const normalizedValue = normalizeCommitSha(value)
  const normalizedFilter = normalizeCommitSha(filterValue)
  if (!normalizedFilter) return true
  if (!normalizedValue) return false
  return normalizedValue.startsWith(normalizedFilter) || normalizedFilter.startsWith(normalizedValue)
}

function truncate(value, maxLength = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`
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

function normalizeTelemetryEvent(event = {}) {
  const row = safeObject(event)
  const rawEvent = safeObject(row.raw_event)
  const payload = {
    ...safeObject(row.payload),
    ...safeObject(rawEvent.payload),
  }
  return {
    ...row,
    ...rawEvent,
    id: String(rawEvent.id || row.id || ""),
    created_at: String(rawEvent.created_at || row.created_at || ""),
    type: String(rawEvent.type || row.event_type || row.type || "unknown"),
    level: String(rawEvent.level || row.level || "info"),
    payload,
    user_id: rawEvent.user_id ?? row.user_id ?? null,
    commit_sha: String(rawEvent.commit_sha || payload.commit_sha || row.commit_sha || ""),
    deployment_id: String(rawEvent.deployment_id || payload.deployment_id || row.deployment_id || ""),
    deployed_at: String(rawEvent.deployed_at || payload.deployed_at || row.deployed_at || ""),
    app_version: String(rawEvent.app_version || payload.app_version || row.app_version || ""),
  }
}

function readTelemetryFile(filePath, cutoffMs) {
  if (!fs.existsSync(filePath)) return []
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => safeParse(line))
    .filter(Boolean)
    .map((event) => normalizeTelemetryEvent(event))
    .filter((event) => parseIsoMs(event.created_at) >= cutoffMs)
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
  return Array.isArray(data) ? data.map((row) => normalizeTelemetryEvent(row)) : []
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
  const barcodeEvents = telemetryEvents.filter((event) => event.type === "coach_barcode_lookup_completed")
  const barcodeFallbackEvents = barcodeEvents.filter((event) => {
    const sourceType = cleanText(event.payload?.selected_source_type || event.payload?.source_type || "")
    return !["barcode_label", "open_food_facts_label", "curated_au_catalogue", "nz_curated_catalogue"].includes(sourceType)
  })

  return [
    ["coach_failure_rate", asRate(auditSummary.failures || 0, coachTurns)],
    ["photo_review_rate", asRate(photoTurns, coachTurns)],
    ["low_confidence_macro_rate", asRate(macroTurns, coachTurns)],
    ["legacy_fallback_rate", asRate(auditSummary.legacy_fallback_turns || 0, parserTurns)],
    ["telemetry_error_rate", asRate(errorEvents.length, telemetryEvents.length || errorEvents.length || 0)],
    ["nutrition_search_empty_rate", asRate(nutritionSearchEvents.length - nutritionSearchResolved.length, nutritionSearchEvents.length)],
    ["nutrition_low_confidence_search_rate", asRate(nutritionSearchResolved.filter((event) => String(event.payload?.top_macro_confidence || "") === "low").length, nutritionSearchResolved.length)],
    ["nutrition_photo_review_rate", asRate(nutritionPhotoEvents.filter((event) => Boolean(event.payload?.needs_review)).length, nutritionPhotoEvents.length)],
    ["barcode_fallback_rate", asRate(barcodeFallbackEvents.length, barcodeEvents.length)],
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
    barcode_fallback_rate: numericEnv("MAX_BARCODE_FALLBACK_RATE", 0.35),
  }

  return rows
    .filter(([name, value]) => value > (thresholds[name] ?? Number.POSITIVE_INFINITY))
    .map(([name, value]) => [name, `${formatPercent(value)} > ${formatPercent(thresholds[name])}`])
}

function buildFreshFilters() {
  const commitSha = String(
    process.env.MONITOR_COMMIT_SHA
    || process.env.RENDER_GIT_COMMIT
    || process.env.COMMIT_SHA
    || process.env.VERCEL_GIT_COMMIT_SHA
    || ""
  ).trim()
  const deploymentId = String(
    process.env.MONITOR_DEPLOYMENT_ID
    || process.env.RENDER_DEPLOY_ID
    || process.env.RENDER_DEPLOYMENT_ID
    || process.env.VERCEL_DEPLOYMENT_ID
    || process.env.DEPLOYMENT_ID
    || ""
  ).trim()
  const deployedAfter = String(
    process.env.MONITOR_DEPLOYED_AFTER
    || process.env.RENDER_DEPLOYED_AT
    || process.env.DEPLOYED_AT
    || process.env.VERCEL_DEPLOYMENT_CREATED_AT
    || ""
  ).trim()
  const deployedAfterMs = parseIsoMs(deployedAfter)
  return {
    commitSha,
    deploymentId,
    deployedAfter,
    deployedAfterMs,
    active: Boolean(commitSha || deploymentId || deployedAfterMs),
  }
}

function matchesFreshDeployment({
  createdAt = "",
  commitSha = "",
  deploymentId = "",
}, filters = {}) {
  if (filters.commitSha && !commitMatches(commitSha, filters.commitSha)) return false
  if (filters.deploymentId && cleanText(deploymentId) !== cleanText(filters.deploymentId)) return false
  if (filters.deployedAfterMs && parseIsoMs(createdAt) < filters.deployedAfterMs) return false
  return true
}

function buildFailureRows(records = []) {
  return records
    .filter((record) => (
      record.route_type === "failed"
      || ["failed", "failed_before_persistence", "failed_persistence"].includes(record.persistence_status)
      || safeObject(record).flags?.some((flag) => cleanText(flag?.severity) === "error")
    ))
    .slice(0, 10)
    .map((record) => {
      const mealState = safeObject(record.state_after?.meal_session)
      const workoutState = safeObject(record.state_after?.workout_session)
      const fallbackReason = mealState.fallbackReason || mealState.fallback_reason || ""
      const processingMode = mealState.processingMode || mealState.processing_mode || ""
      const flagCodes = Array.isArray(record.flags) ? record.flags.map((flag) => flag.code).join(", ") : ""
      const rootCause = truncate(record.error_summary || flagCodes || "unknown", 180)
      const label = `${String(record.created_at || "unknown")} | ${record.route_type || "unknown"} | session=${record.session_id || "-"}`
      const value = [
        `intent=${record.intent || "unknown"}`,
        `message="${truncate(record.user_message, 100)}"`,
        `model=${record.model_used || "-"}`,
        `meal_mode=${processingMode || "-"}`,
        `fallback=${fallbackReason || "-"}`,
        `workout=${workoutState.exercise_name || workoutState.workout_type || "-"}`,
        `root=${rootCause}`,
      ].join(" | ")
      return [label, value]
    })
}

function buildPassFailSummary({ freshTelemetryEvents = [], freshAuditRecords = [], freshBreaches = [], freshFailures = [], filters = {} } = {}) {
  if (!freshTelemetryEvents.length && !freshAuditRecords.length) {
    return {
      status: filters.active ? "insufficient_data" : "no_data",
      summary: filters.active
        ? "No fresh telemetry or audit records matched the deployment filter."
        : "No telemetry or audit records were available in the selected window.",
    }
  }
  if (freshBreaches.length || freshFailures.length) {
    return {
      status: "fail",
      summary: `${freshBreaches.length} threshold breach(es), ${freshFailures.length} unresolved failure record(s).`,
    }
  }
  return {
    status: "pass",
    summary: "No threshold breaches or unresolved failure records in the fresh deployment window.",
  }
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
const jsonOutput = String(process.env.MONITOR_OUTPUT_JSON || "false").trim().toLowerCase() === "true"
const jsonFile = String(process.env.MONITOR_JSON_FILE || "").trim()
const freshFilters = buildFreshFilters()

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
      limit: Number(process.env.COACH_AUDIT_REPORT_LIMIT || 400),
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

const freshTelemetryEvents = telemetryEvents.filter((event) => matchesFreshDeployment({
  createdAt: event.created_at,
  commitSha: event.commit_sha || event.payload?.commit_sha || "",
  deploymentId: event.deployment_id || event.payload?.deployment_id || "",
}, freshFilters))
const freshAuditRecords = auditRecords.filter((record) => matchesFreshDeployment({
  createdAt: record.created_at,
  commitSha: record.commit_sha || "",
  deploymentId: "",
}, freshFilters))
const historicalTelemetryEvents = freshFilters.active
  ? telemetryEvents.filter((event) => !freshTelemetryEvents.includes(event))
  : []
const historicalAuditRecords = freshFilters.active
  ? auditRecords.filter((record) => !freshAuditRecords.includes(record))
  : []
const freshAuditSummary = freshAuditRecords.length ? summarizeCoachAuditRecords(freshAuditRecords) : null
const historicalAuditSummary = historicalAuditRecords.length ? summarizeCoachAuditRecords(historicalAuditRecords) : null
const freshAlertRows = buildAlertRows({
  telemetryEvents: freshTelemetryEvents,
  auditRecords: freshAuditRecords,
  auditSummary: freshAuditSummary || {},
})
const freshBreaches = evaluateThresholds(freshAlertRows)
const freshFailures = buildFailureRows(freshAuditRecords)
const currentStatus = buildPassFailSummary({
  freshTelemetryEvents,
  freshAuditRecords,
  freshBreaches,
  freshFailures,
  filters: freshFilters,
})

console.log(`Coach monitor report for last ${reportDays} day(s)`)
console.log(`Telemetry source: ${telemetrySource}`)
console.log(`Audit source: ${auditSource}`)
console.log(`Telemetry events in window: ${telemetryEvents.length}`)
console.log(`Audit records in window: ${auditRecords.length}`)

printSection("Fresh deployment filter", [
  ["active", freshFilters.active ? "yes" : "no"],
  ["commit_sha", freshFilters.commitSha || "not set"],
  ["deployment_id", freshFilters.deploymentId || "not set"],
  ["deployed_after", freshFilters.deployedAfter || "not set"],
  ["fresh_telemetry_events", `${freshTelemetryEvents.length}/${telemetryEvents.length}`],
  ["fresh_audit_records", `${freshAuditRecords.length}/${auditRecords.length}`],
])

printSection("Current deployment status", [
  ["status", currentStatus.status],
  ["summary", currentStatus.summary],
])

printSection("Fresh telemetry event types", countBy(freshTelemetryEvents, (event) => String(event.type || "unknown")))
printSection("Fresh nutrition search outcomes", countBy(
  freshTelemetryEvents.filter((event) => event.type === "nutrition_search_completed"),
  (event) => `${String(event.payload?.query_kind || "unknown")}:${String(event.payload?.lookup_path || "unknown")}:${String(event.payload?.top_source_type || "none")}:${String(event.payload?.top_macro_confidence || "none")}:${Number(event.payload?.result_count || 0) > 0 ? "resolved" : "empty"}`
))
printSection("Fresh nutrition photo outcomes", countBy(
  freshTelemetryEvents.filter((event) => event.type === "nutrition_photo_completed" || event.type === "nutrition_photo_review_completed"),
  (event) => `${event.type}:${String(event.payload?.source_type || "unknown")}:${String(event.payload?.macro_confidence || "unknown")}:${event.payload?.needs_review ? "needs_review" : "ready"}:${String(event.payload?.review_reason || "none")}`
))
printSection("Fresh barcode outcomes", countBy(
  freshTelemetryEvents.filter((event) => event.type === "coach_barcode_lookup_completed" || event.type === "coach_barcode_logged"),
  (event) => `${event.type}:${String(event.payload?.selected_match_kind || event.payload?.match_kind || "unknown")}:${String(event.payload?.selected_source_type || event.payload?.source_type || "unknown")}`
))
printSection("Fresh telemetry error events", countBy(
  freshTelemetryEvents.filter((event) => String(event.level || "").trim().toLowerCase() === "error"),
  (event) => String(event.type || "unknown")
))

if (freshAuditSummary) {
  printSection("Fresh coach audit routes", countBy(
    Object.entries(freshAuditSummary.by_route || {}).map(([label]) => ({ label })),
    (entry) => entry.label
  ).map(([label]) => [label, freshAuditSummary.by_route[label]]))

  printSection("Fresh coach parser modes", countBy(
    Object.entries(freshAuditSummary.by_processing_mode || {}).map(([label]) => ({ label })),
    (entry) => entry.label
  ).map(([label]) => [label, freshAuditSummary.by_processing_mode[label]]))

  printSection("Fresh coach fallback reasons", countBy(
    Object.entries(freshAuditSummary.by_fallback_reason || {}).map(([label]) => ({ label })),
    (entry) => entry.label
  ).map(([label]) => [label, freshAuditSummary.by_fallback_reason[label]]))

  printSection("Fresh legacy gate clauses", countBy(
    Object.entries(freshAuditSummary.by_legacy_gate_clause || {}).map(([label]) => ({ label })),
    (entry) => entry.label
  ).map(([label]) => [label, freshAuditSummary.by_legacy_gate_clause[label]]))

  console.log("\nFresh deployment rates")
  for (const [name, value] of freshAlertRows) {
    console.log(`  ${name}: ${formatPercent(value)}`)
  }

  if (freshBreaches.length) {
    printSection("Fresh threshold breaches", freshBreaches)
  }
}

printSection("Fresh unresolved failure records", freshFailures)

if (freshFilters.active && historicalAuditSummary) {
  printSection("Historical-only failures excluded from fresh status", [
    ["historical_audit_records", historicalAuditRecords.length],
    ["historical_failures", historicalAuditSummary.failures || 0],
    ["historical_flagged", historicalAuditSummary.flagged || 0],
    ["historical_legacy_fallback_turns", historicalAuditSummary.legacy_fallback_turns || 0],
  ])
}

const output = {
  generated_at: new Date().toISOString(),
  report_days: reportDays,
  telemetry_source: telemetrySource,
  audit_source: auditSource,
  fresh_filter: {
    active: freshFilters.active,
    commit_sha: freshFilters.commitSha || null,
    deployment_id: freshFilters.deploymentId || null,
    deployed_after: freshFilters.deployedAfter || null,
  },
  totals: {
    telemetry_events: telemetryEvents.length,
    audit_records: auditRecords.length,
    fresh_telemetry_events: freshTelemetryEvents.length,
    fresh_audit_records: freshAuditRecords.length,
  },
  current_status: currentStatus,
  fresh_alert_rows: Object.fromEntries(freshAlertRows.map(([name, value]) => [name, value])),
  fresh_threshold_breaches: freshBreaches,
  fresh_failures: freshFailures.map(([label, value]) => ({ label, value })),
  historical_excluded: freshFilters.active ? {
    telemetry_events: historicalTelemetryEvents.length,
    audit_records: historicalAuditRecords.length,
    failures: historicalAuditSummary?.failures || 0,
  } : null,
}

if (jsonFile) {
  fs.mkdirSync(path.dirname(jsonFile), { recursive: true })
  fs.writeFileSync(jsonFile, `${JSON.stringify(output, null, 2)}\n`, "utf8")
  console.log(`\nJSON report written to ${jsonFile}`)
}

if (jsonOutput) {
  console.log(`\n${JSON.stringify(output, null, 2)}`)
}

if (failOnThresholds && currentStatus.status !== "pass") {
  process.exitCode = 1
}
