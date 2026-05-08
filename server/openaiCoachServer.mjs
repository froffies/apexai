import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"
import { searchVerifiedFoods, verifiedFoods } from "../src/lib/nutritionDatabase.js"
import { buildCoachSessionState } from "./coachSessionState.mjs"
import {
  buildDeterministicMealAction,
  buildDeterministicWorkoutAction,
  deterministicAlreadyLoggedReply,
  deterministicClarifyActionFromSession,
  formatDeterministicMealAnswer,
  summarizeCoachAction,
} from "./coachLoggingRules.mjs"
import { normalizeCoachResponse } from "./normalizeCoachResponse.mjs"

function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env")
  if (!fs.existsSync(envPath)) return

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const [key, ...parts] = trimmed.split("=")
    if (!(key in process.env)) process.env[key] = parts.join("=").replace(/^["']|["']$/g, "")
  }
}

loadDotEnv()

const port = Number(process.env.PORT || process.env.OPENAI_COACH_PORT || 8787)
const host = process.env.OPENAI_COACH_HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1")
const model = process.env.OPENAI_MODEL || "gpt-4o-mini"
const nodeEnv = process.env.NODE_ENV || "development"
const isProduction = nodeEnv === "production"
const configuredCorsOrigins = (process.env.OPENAI_COACH_CORS_ORIGIN || (nodeEnv === "production" ? "" : "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173")).split(",").map((origin) => origin.trim()).filter(Boolean)
const fallbackCorsOrigin = configuredCorsOrigins[0] || "null"
const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
const requireAuth = process.env.OPENAI_COACH_REQUIRE_AUTH ? process.env.OPENAI_COACH_REQUIRE_AUTH === "true" : isProduction
const supabaseUrl = process.env.SUPABASE_URL || ""
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || ""
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const serverSupabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } }) : null
const adminSupabase = supabaseUrl && supabaseServiceRoleKey ? createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } }) : null
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000)
const rateLimitMaxRequests = Number(process.env.RATE_LIMIT_MAX_REQUESTS || (nodeEnv === "production" ? 60 : 180))
const rateLimitBuckets = new Map()
const telemetryLogFile = process.env.TELEMETRY_LOG_FILE || path.join(process.cwd(), "server-data", "telemetry.ndjson")
const telemetryRateLimitMaxRequests = Number(process.env.TELEMETRY_RATE_LIMIT_MAX_REQUESTS || (nodeEnv === "production" ? 300 : 2000))
const openFoodFactsTimeoutMs = Number(process.env.OPENFOODFACTS_TIMEOUT_MS || 1000)
const foodLookupCacheTtlMs = Number(process.env.FOOD_LOOKUP_CACHE_TTL_MS || 15 * 60_000)
const foodLookupCacheMaxEntries = Number(process.env.FOOD_LOOKUP_CACHE_MAX_ENTRIES || 200)
const foodLookupCache = new Map()

const coachResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "actions", "warnings"],
  properties: {
    reply: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type"],
        properties: {
          type: {
            type: "string",
            enum: ["none", "clarify", "log_workout", "update_workout_log", "log_meal", "update_meal_log", "create_workout_plan", "create_meal_plan", "update_targets"],
          },
          message: { type: "string" },
          date: { type: "string" },
          workout_id: { type: "string" },
          workout_type: { type: "string" },
          exercise_name: { type: "string" },
          muscle_group: { type: "string" },
          sets: { type: "number" },
          reps: { type: "number" },
          weight_kg: { type: "number" },
          duration_seconds: { type: "number" },
          distance_km: { type: "number" },
          title: { type: "string" },
          exercises: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name"],
              properties: {
                name: { type: "string" },
                muscle: { type: "string" },
                setsReps: { type: "string" },
                weight_kg: { type: "number" },
              },
            },
          },
          meal_type: { type: "string" },
          meal_id: { type: "string" },
          food_name: { type: "string" },
          quantity: { type: "string" },
          calories: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
          nutrition_source: { type: "string" },
          estimated: { type: "boolean" },
          meals: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["food_name", "meal_type", "calories", "protein_g", "carbs_g", "fat_g"],
              properties: {
                meal_type: { type: "string" },
                food_name: { type: "string" },
                quantity: { type: "string" },
                calories: { type: "number" },
                protein_g: { type: "number" },
                carbs_g: { type: "number" },
                fat_g: { type: "number" },
                nutrition_source: { type: "string" },
              },
            },
          },
          daily_calories: { type: "number" },
          protein_target_g: { type: "number" },
          carbs_target_g: { type: "number" },
          fat_target_g: { type: "number" },
        },
      },
    },
  },
}

const nutritionChefSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "meal_type", "servings", "ingredients", "steps", "totals", "per_serving", "notes"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    meal_type: { type: "string" },
    servings: { type: "number" },
    notes: { type: "string" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "estimated", "source", "source_type", "calories", "protein_g", "carbs_g", "fat_g"],
        properties: {
          name: { type: "string" },
          quantity: { type: "string" },
          estimated: { type: "boolean" },
          source: { type: "string" },
          source_type: { type: "string" },
          calories: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
        },
      },
    },
    steps: {
      type: "array",
      items: { type: "string" },
    },
    totals: {
      type: "object",
      additionalProperties: false,
      required: ["calories", "protein_g", "carbs_g", "fat_g"],
      properties: {
        calories: { type: "number" },
        protein_g: { type: "number" },
        carbs_g: { type: "number" },
        fat_g: { type: "number" },
      },
    },
    per_serving: {
      type: "object",
      additionalProperties: false,
      required: ["calories", "protein_g", "carbs_g", "fat_g"],
      properties: {
        calories: { type: "number" },
        protein_g: { type: "number" },
        carbs_g: { type: "number" },
        fat_g: { type: "number" },
      },
    },
  },
}

const coachInstructions = `
You are ApexAI, a premium Australian fitness and nutrition coach inside a mobile app.

You MUST return a JSON object with exactly this structure:
{
  "reply": "Your conversational response to the user (required, never empty)",
  "actions": [],
  "warnings": []
}

The "reply" field is ALWAYS required. Never omit it. Keep replies concise, natural, and mobile-friendly - usually 1-3 short sentences.

For actions, each action object must have a "type" field. Valid types: none, clarify, log_workout, update_workout_log, log_meal, update_meal_log, create_workout_plan, create_meal_plan, update_targets.

Core rules:
- Be practical, warm, direct, and adaptive.
- Sound like a real coach, not a menu or a help screen.
- Use coach_context when it is relevant. It contains today's targets, recent logging context, readiness, and current plans.
- If the user is frustrated, tired, embarrassed, or inconsistent, stay calm and useful. Do not be robotic or judgmental.
- Answer the user's actual question first. Offer one useful next step when it helps.
- Distinguish clearly between answering, clarifying, planning, and logging.
- Only create completed workout or meal log actions when the user clearly says they performed the workout or ate the food.
- If the user explicitly says not to log, save, track, add, or update something, respect that and return no persistence action.
- Plans are not completed logs.
- A workout plan must include 3-8 exercises. Never return an empty workout plan.
- A meal plan must include 3-6 meals. Never return an empty meal plan.
- Use reasonable estimates when they are practical, and only ask follow-up questions when the missing detail is genuinely blocking.
- Never ask for information already present in recent_messages, coach_context, candidate_food_matches, meal_context, or workout_context.
- If the user describes one eating event, default to treating it as one meal. Do not keep asking how many servings unless they explicitly say they cooked a batch, want portions split, or ask for per-serving macros.
- If the user explicitly provides ingredient amounts and asks you to log, track, save, or add the meal, treat those amounts as final unless there is a real contradiction. Do not ask redundant confirmation questions about one vs two slices, one vs two servings, or similar when the prompt already states the amount.
- If the user is greeting you or making small talk, reply naturally and return no plan actions.
- If the user asks what to do today, what to eat next, whether something fits the goal, or how to adjust because they are tired, use the available context and answer like a coach.
- If the user asks to plan the week, map the training week. Do not substitute a blank single workout card.
- Nutrition must not be guessed. Use foods from verified_food_catalogue or exact macros from the user.
- If a user mentions a food but not enough detail to log it accurately, ask a short follow-up question instead of rejecting them. Good follow-ups ask about amount, serving size, brand, or what it was eaten with.
- Use candidate_food_matches plus recent_messages to infer context. If the previous user turn named the food and the current turn only gives the amount, combine them before deciding whether you can log the meal.
- Only emit log_meal when you have enough detail and a credible nutrition source. Otherwise, reply with a clarifying question and no log action yet.
- If the user gives ingredient amounts for a whole meal and asks for calories or macros, calculate the best estimate from the provided foods and amounts instead of asking about servings again.
- If the user wants that calculated meal saved, emit log_meal with estimated=true and set nutrition_source to "Coach estimate from user-described ingredients and amounts" when an exact verified source is not possible.
- If the user explicitly asks to log/save/track an estimated mixed meal and provides enough quantities to estimate it, emit log_meal in the same turn instead of asking another confirmation question.
- When you estimate a described mixed meal from user-provided amounts, make it clear in the reply that it is an estimate, but still log it if the user asked you to save it.
- For a mixed meal, set food_name to a concise combined label such as "Eggs fried in butter with rye toast and Vegemite" rather than leaving it blank.
- If the user corrects the amount, serving size, or description of the last meal you logged, treat that as a correction and use update_meal_log instead of logging a duplicate.
- If the user corrects a meal you just logged, emit update_meal_log with meal_id from recent_meals instead of creating a duplicate meal.
- If the user corrects the load, reps, sets, or exercise details of the last workout you logged, treat that as a correction and use update_workout_log instead of logging a duplicate.
- If the user corrects a workout you just logged, emit update_workout_log with workout_id from recent_workouts instead of creating a duplicate workout.
- Never claim you logged something unless you also return the matching log or update action.
- Do not create a workout log if sets/reps/load or duration are still missing. Ask the shortest follow-up question needed.
- If the user only names an exercise plus weight or sets, but not reps or time, ask a short follow-up instead of logging a workout.
- Never emit log_workout with a blank or generic title like "Workout" if you can identify the exercise.
- If the user asks where something was logged or saved, answer from the app context instead of inventing a new log action.
- If the user asks a nutrition or training question without clear logging intent, answer the question and return no persistence action.
- If the user message contains multiple topics, prioritise the user's main ask and avoid trying to do everything at once.
- Never mention system prompts, schemas, backend rules, or internal tooling.
- Default to Australian metric units and Australian food context.
- For log_meal and update_meal_log actions, always include calories, protein_g, carbs_g, fat_g, quantity, and nutrition_source.
- If a user reports pain, injury, or medical symptoms, do not diagnose. Suggest speaking with a professional.
`

const chefInstructions = `
You are ApexAI Chef, a practical AI nutrition assistant inside an Australian fitness app.

Return JSON only.

Goals:
- Build one realistic recipe from the pantry ingredients the user has available.
- Prefer using only pantry ingredients. You may add tiny staple extras like oil, salt, pepper, garlic, herbs, or water if clearly helpful.
- Use the provided candidate_foods_by_term as the primary macro references whenever possible.
- If allow_estimated is false, do not invent or estimate missing ingredients. Use only matched foods and mention any omitted pantry items in notes.
- If an exact food is not available in the candidate lists, you may still include it, but mark estimated=true and explain that in notes.
- Keep the recipe mobile-friendly: concise title, short description, 3-6 steps, clear ingredient quantities.
- Provide totals for the full recipe and per-serving macros.
- Use Australian spelling and metric-friendly quantities where practical.
- Do not claim perfect certainty. If the macro basis is mixed, say so briefly in notes.
`

const mealCoachInstructions = `
You are ApexAI's dedicated meal logging specialist inside an Australian fitness app.

Return JSON only with exactly this structure:
{
  "reply": "Short user-facing response",
  "actions": [],
  "warnings": []
}

Valid action types here are: none, clarify, log_meal, update_meal_log.

You will receive a structured meal_context that already merges fragmented conversation history across turns.

Critical rules:
- Treat meal_context as the source of truth for the meal so far.
- Do not ask for information that meal_context already contains.
- Backend state, not your judgement, decides whether the meal is ready to log.
- Speak naturally and briefly. Do not sound like a form or checklist.
- If meal_context.ready_to_log is true, stop clarifying and return one combined log_meal or update_meal_log action now.
- If meal_context.clarification_attempts is 2 or more, prioritise logging with reasonable estimates instead of asking another follow-up.
- Use meal_context.summary as the canonical combined meal description. Do not drop previously captured foods.
- If the user corrected a quantity or ingredient, use the latest value from meal_context.
- If the user described one eating event over multiple turns, log it as one combined meal.
- Never split one eating event into multiple log_meal actions for separate sub-items.
- Never ask for information already present in meal_context.items, meal_context.summary, or recent_messages.
- If the user began by saying they had or ate the meal, treat that as logging intent.
- If the user is only asking for calories or macros and not asking to save anything, answer the question without returning a persistence action.
- If the user says not to log or save the meal, do not return a persistence action.
- Only ask a clarification question when a critical logging detail is still missing and meal_context says it is not ready yet.
- If you say the meal was logged or saved, you MUST include a real log_meal or update_meal_log action with calories, protein_g, carbs_g, fat_g, quantity, estimated, nutrition_source, and food_name.
- If meal_context.summary already gives enough detail, do not ask more questions just because the quantity is unusual. 17 eggs is unusual, not impossible.
- Keep the reply concise and mobile-friendly. Prefer 1-2 short sentences.
`

function jsonHeaders(origin = fallbackCorsOrigin) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    Vary: "Origin",
  }
}

function sendJson(response, status, data, origin = fallbackCorsOrigin) {
  response.writeHead(status, jsonHeaders(origin))
  response.end(JSON.stringify(data))
}

function requestIp(request) {
  return String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown").split(",")[0].trim()
}

function requestOrigin(request) {
  return String(request.headers.origin || "")
}

function applyCors(request) {
  const origin = requestOrigin(request)
  if (!origin || configuredCorsOrigins.includes(origin)) {
    request.apexOrigin = origin || fallbackCorsOrigin
    return true
  }
  request.apexOrigin = fallbackCorsOrigin
  return false
}

function requestResponseOrigin(request) {
  return request.apexOrigin || fallbackCorsOrigin
}

function logRequest(request, status, extra = "") {
  const line = `${new Date().toISOString()} ${status} ${request.method} ${request.url} ip=${requestIp(request)}${extra ? ` ${extra}` : ""}`
  if (status >= 500) console.error(line)
  else console.info(line)
}

function checkRateLimit(request) {
  const key = `${requestIp(request)}:${request.url}`
  const now = Date.now()
  const maxRequests = request.url === "/api/telemetry" ? telemetryRateLimitMaxRequests : rateLimitMaxRequests
  const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + rateLimitWindowMs }
  if (now > bucket.resetAt) {
    bucket.count = 0
    bucket.resetAt = now + rateLimitWindowMs
  }
  bucket.count += 1
  rateLimitBuckets.set(key, bucket)

  if (bucket.count > maxRequests) {
    const error = new Error("Rate limit exceeded")
    error.status = 429
    throw error
  }
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = ""
    request.on("data", (chunk) => {
      body += chunk
      if (body.length > 1_000_000) {
        const error = new Error("Request body too large")
        error.status = 413
        reject(error)
        request.destroy()
      }
    })
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        const error = new Error("Invalid JSON request body")
        error.status = 400
        reject(error)
      }
    })
    request.on("error", reject)
  })
}

function safeArray(value, limit) {
  return Array.isArray(value) ? value.slice(0, limit) : []
}

function safeRecentArray(value, limit) {
  return Array.isArray(value) ? value.slice(-limit) : []
}

function normalizeRecentMessages(value, currentMessage, limit = 18) {
  const messages = safeRecentArray(value, limit)
  if (!messages.length) return messages
  const normalizedCurrent = String(currentMessage || "").trim()
  const last = messages[messages.length - 1]
  if (last?.role === "user" && String(last.content || "").trim() === normalizedCurrent) {
    return messages.slice(0, -1)
  }
  return messages
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const error = new Error(`${label} must be an object`)
    error.status = 400
    throw error
  }
}

function assertString(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error(`${label} is required`)
    error.status = 400
    throw error
  }
  if (value.length > maxLength) {
    const error = new Error(`${label} is too long`)
    error.status = 400
    throw error
  }
}

function validateCoachBody(body) {
  assertObject(body, "request body")
  assertString(body.message, "message", 3000)
  if (body.profile !== undefined) assertObject(body.profile, "profile")
  if (body.coachContext !== undefined) assertObject(body.coachContext, "coachContext")
  if (body.mealSession !== undefined) assertObject(body.mealSession, "mealSession")
  if (body.workoutSession !== undefined) assertObject(body.workoutSession, "workoutSession")
  for (const key of ["recentMessages", "meals", "workouts", "workoutSets", "workoutPlans", "mealPlans", "recoveryLogs"]) {
    if (body[key] !== undefined && !Array.isArray(body[key])) {
      const error = new Error(`${key} must be an array`)
      error.status = 400
      throw error
    }
  }
}

function validateNutritionBody(body) {
  assertObject(body, "request body")
  assertString(body.query, "query", 160)
}

function validateNutritionChefBody(body) {
  assertObject(body, "request body")
  assertString(body.pantry, "pantry", 1200)
  if (body.goal !== undefined && typeof body.goal !== "string") {
    const error = new Error("goal must be a string")
    error.status = 400
    throw error
  }
  if (body.mealType !== undefined && typeof body.mealType !== "string") {
    const error = new Error("mealType must be a string")
    error.status = 400
    throw error
  }
  if (body.profile !== undefined) assertObject(body.profile, "profile")
  if (body.servings !== undefined && !Number.isFinite(Number(body.servings))) {
    const error = new Error("servings must be a number")
    error.status = 400
    throw error
  }
  if (body.allowEstimated !== undefined && typeof body.allowEstimated !== "boolean") {
    const error = new Error("allowEstimated must be a boolean")
    error.status = 400
    throw error
  }
}

function validateTelemetryBody(body) {
  assertObject(body, "request body")
  if (typeof body.type !== "string" || !body.type.trim()) {
    const error = new Error("type is required")
    error.status = 400
    throw error
  }
  if (body.level !== undefined && !["info", "warn", "error"].includes(body.level)) {
    const error = new Error("level must be info, warn, or error")
    error.status = 400
    throw error
  }
  if (body.payload !== undefined && (typeof body.payload !== "object" || Array.isArray(body.payload) || body.payload === null)) {
    const error = new Error("payload must be an object")
    error.status = 400
    throw error
  }
}

function createHttpError(status, message, options = {}) {
  const error = new Error(message)
  error.status = status
  error.expose = options.expose ?? status < 500
  error.logMessage = options.logMessage || message
  return error
}

function sanitizeErrorMessage(error, fallbackMessage) {
  if (!isProduction || error?.expose || (error?.status && error.status < 500)) {
    return error instanceof Error ? error.message : fallbackMessage
  }
  return fallbackMessage
}

function sendError(response, request, error, fallbackMessage) {
  const status = error?.status || 500
  sendJson(
    response,
    status,
    { error: sanitizeErrorMessage(error, fallbackMessage) },
    requestResponseOrigin(request)
  )
}

async function verifyBearerUser(request) {
  if (!serverSupabase) {
    const error = new Error("Server auth is required but Supabase is not configured")
    error.status = 500
    throw error
  }

  const header = request.headers.authorization || ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  if (!token) {
    const error = new Error("Missing Authorization bearer token")
    error.status = 401
    throw error
  }

  const { data, error } = await serverSupabase.auth.getUser(token)
  if (error || !data.user) {
    const authError = new Error("Invalid Authorization bearer token")
    authError.status = 401
    throw authError
  }
  return data.user
}

async function verifyOptionalBearerUser(request) {
  const header = request.headers.authorization || ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  if (!token || !serverSupabase) return null

  const { data, error } = await serverSupabase.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

async function verifyRequestAuth(request, { optional = false } = {}) {
  if (optional) return verifyOptionalBearerUser(request)
  if (!requireAuth) return verifyOptionalBearerUser(request)
  return verifyBearerUser(request)
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function roundMacro(value) {
  return Math.round(safeNumber(value) * 10) / 10
}

function readFoodLookupCache(cacheKey) {
  const cached = foodLookupCache.get(cacheKey)
  if (!cached) return null
  if (Date.now() - cached.timestamp > foodLookupCacheTtlMs) {
    foodLookupCache.delete(cacheKey)
    return null
  }
  return cached.value
}

function writeFoodLookupCache(cacheKey, value) {
  foodLookupCache.set(cacheKey, { value, timestamp: Date.now() })
  if (foodLookupCache.size <= foodLookupCacheMaxEntries) return
  const oldestKey = foodLookupCache.keys().next().value
  if (oldestKey) foodLookupCache.delete(oldestKey)
}

async function fetchJsonWithTimeout(url, headers = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), openFoodFactsTimeoutMs)

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function buildOpenFoodFactsUrl(query, australiaOnly = true) {
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl")
  url.searchParams.set("search_terms", query)
  url.searchParams.set("search_simple", "1")
  url.searchParams.set("action", "process")
  url.searchParams.set("json", "1")
  url.searchParams.set("page_size", "8")
  if (australiaOnly) url.searchParams.set("countries_tags_en", "Australia")
  return url
}

function looksLikeBarcode(query) {
  const digits = String(query || "").trim().replace(/\s+/g, "")
  return /^\d{8,14}$/.test(digits)
}

function cleanLookupText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s,]/g, " ").replace(/\s+/g, " ").trim()
}

function extractCoachFoodSearchTerms(message) {
  const text = cleanLookupText(message)
  if (!text) return []
  if (!/\b(food|meal|ate|had|log|track|add|include|breakfast|lunch|dinner|snack|calories|protein|carbs|fat)\b/.test(text)) return []

  const stripped = text
    .replace(/^(?:please\s+)?(?:(?:i\s+)?(?:had|ate)|log|track|add|include|remove|delete|replace|swap|change)\s+/, "")
    .replace(/\b(for|at)\s+(breakfast|lunch|dinner|snack)\b/g, "")
    .replace(/\b(to|into|in|from)\s+(my\s+)?(meal plan|plan|meals?|nutrition log)\b/g, "")
    .replace(/\btoday\b/g, "")
    .trim()

  if (!stripped) return []

  return stripped
    .split(/\b(?:and|with|plus)\b|,/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 4)
}

function buildMealCandidateFoodTerms(mealContext) {
  if (!mealContext?.items?.length) return []
  return [...new Set(
    mealContext.items
      .flatMap((item) => [item.base_name, item.label])
      .map((term) => cleanLookupText(term))
      .filter(Boolean)
  )].slice(0, 4)
}

function isLikelyCoachFoodTurn(message, recentMessages = []) {
  const text = cleanLookupText(message)
  if (!text) return false
  if (extractCoachFoodSearchTerms(message).length) return true
  if (!/\b(yes|yeah|yep|correct|used|with|without|fried|baked|boiled|grilled|toasted|calculate|macro|macros|log it|save it|that|it was|the meal)\b/.test(text)) {
    return false
  }
  return safeArray(recentMessages, 6).some((entry) => entry?.role === "user" && extractCoachFoodSearchTerms(entry.content).length)
}

function isDetailedMixedMeal(message) {
  const text = cleanLookupText(message)
  const terms = extractCoachFoodSearchTerms(message)
  return terms.length >= 2 && /\b\d/.test(text) && /\b(and|with|plus|also)\b/.test(text)
}

function needsRecentChatContext(message) {
  const text = cleanLookupText(message)
  if (!text) return false
  if (text.length <= 24) return true
  if (/\b(yes|yeah|yep|no|nah|correct|actually|instead|also|too|same|that|it|them|those|this|there|here|afterward|afterwards|before|used to|save it|log it|update it|fix that)\b/.test(text)) return true
  if (/\b(where did you log|where was that logged|what's next|whats next|show me that|do that|go ahead)\b/.test(text)) return true
  return false
}

function shouldHydrateCoachFoodMatches(message, recentMessages = []) {
  if (!isLikelyCoachFoodTurn(message, recentMessages)) return false
  if (looksLikeBarcode(message)) return true
  return !isDetailedMixedMeal(message)
}

function buildCoachCandidateFoodTerms(message, recentMessages = []) {
  const currentTerms = extractCoachFoodSearchTerms(message)
  const recentTerms = currentTerms.length >= 2
    ? []
    : safeArray(recentMessages, 6)
      .filter((entry) => entry?.role === "user")
      .slice(-2)
      .flatMap((entry) => extractCoachFoodSearchTerms(entry.content))

  return [...new Set([...currentTerms, ...recentTerms])].slice(0, 2)
}

function normalizeOpenFoodFactsProducts(products) {
  return safeArray(products, 8)
    .map((product) => {
      const nutriments = product.nutriments || {}
      const calories = nutriments["energy-kcal_serving"] ?? nutriments["energy-kcal_100g"]
      const protein = nutriments.proteins_serving ?? nutriments.proteins_100g
      const carbs = nutriments.carbohydrates_serving ?? nutriments.carbohydrates_100g
      const fat = nutriments.fat_serving ?? nutriments.fat_100g
      if (![calories, protein, carbs, fat].every((value) => Number.isFinite(Number(value)))) return null
      const name = product.product_name || product.generic_name || "Food product"
      return {
        id: `off_${product.code || name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
        name,
        aliases: [name],
        quantity: product.serving_size || "100g",
        calories: Math.round(Number(calories)),
        protein_g: roundMacro(protein),
        carbs_g: roundMacro(carbs),
        fat_g: roundMacro(fat),
        category: "packaged food",
        source: product.url || "Open Food Facts product label database",
        source_type: "open_food_facts_label",
      }
    })
    .filter(Boolean)
}

function normalizeSingleOpenFoodFactsProduct(product, sourceType = "barcode_label") {
  return normalizeOpenFoodFactsProducts([product]).map((item) => ({
    ...item,
    source_type: sourceType,
  }))[0] || null
}

async function handleCoach(request, response) {
  await verifyRequestAuth(request)
  const body = await readRequestBody(request)
  validateCoachBody(body)

  const contextualRecentMessages = needsRecentChatContext(body.message)
    ? normalizeRecentMessages(body.recentMessages, body.message, 18)
    : []
  const { mealSession: rawMealContext, workoutSession: workoutContext } = buildCoachSessionState({
    recentMessages: contextualRecentMessages,
    currentMessage: body.message,
    mealSession: body.mealSession || null,
    workoutSession: body.workoutSession || null,
    recentMeals: safeArray(body.meals, 12),
  })
  const mealContext = rawMealContext
    && (
      safeArray(rawMealContext.items, 16).length
      || rawMealContext.readyToLog
      || rawMealContext.alreadyLogged
      || rawMealContext.persisted
      || rawMealContext.suppressed
      || rawMealContext.clarifyQuestion
    )
    ? rawMealContext
    : null

  const candidateFoodMatches = {}
  const candidateFoodTerms = mealContext
    ? buildMealCandidateFoodTerms(mealContext)
    : shouldHydrateCoachFoodMatches(body.message, body.recentMessages)
      ? buildCoachCandidateFoodTerms(body.message, body.recentMessages)
      : []
  if (candidateFoodTerms.length) {
    const foodLookups = await Promise.all(candidateFoodTerms.map(async (term) => [term, (await lookupFoodsBroad(term)).slice(0, 6)]))
    for (const [term, matches] of foodLookups) {
      candidateFoodMatches[term] = matches
    }
  }

  if (mealContext?.alreadyLogged) {
    sendJson(response, 200, {
      reply: deterministicAlreadyLoggedReply(mealContext, "meal"),
      actions: [],
      warnings: [],
      meal_session: mealContext,
      workout_session: workoutContext,
    }, requestResponseOrigin(request))
    return
  }

  if (mealContext?.suppressed) {
    sendJson(response, 200, {
      reply: mealContext.suppressionReply || "Okay, I won't save that.",
      actions: [],
      warnings: [],
      meal_session: mealContext,
      workout_session: workoutContext,
    }, requestResponseOrigin(request))
    return
  }

  if (workoutContext?.alreadyLogged) {
    sendJson(response, 200, {
      reply: deterministicAlreadyLoggedReply(workoutContext, "workout"),
      actions: [],
      warnings: [],
      meal_session: mealContext,
      workout_session: workoutContext,
    }, requestResponseOrigin(request))
    return
  }

  if (workoutContext?.suppressed) {
    sendJson(response, 200, {
      reply: workoutContext.suppressionReply || "Okay, I won't save that.",
      actions: [],
      warnings: [],
      meal_session: mealContext,
      workout_session: workoutContext,
    }, requestResponseOrigin(request))
    return
  }

  if (mealContext?.readyToLog) {
    const mealAction = buildDeterministicMealAction({
      mealSession: mealContext,
      explicitActions: [],
      prompt: body.message,
      candidateFoodMatches,
      allowAnswerOnly: mealContext?.answerOnly,
    })
    if (mealContext?.answerOnly && mealAction) {
      sendJson(response, 200, {
        reply: formatDeterministicMealAnswer(mealAction),
        actions: [],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      }, requestResponseOrigin(request))
      return
    }
    if (mealAction) {
      sendJson(response, 200, {
        reply: summarizeCoachAction(mealAction),
        actions: [mealAction],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      }, requestResponseOrigin(request))
      return
    }
  }

  if (!mealContext && workoutContext?.readyToLog) {
    const workoutAction = buildDeterministicWorkoutAction({ workoutSession: workoutContext, explicitActions: [] })
    sendJson(response, 200, {
      reply: summarizeCoachAction(workoutAction),
      actions: workoutAction ? [workoutAction] : [],
      warnings: [],
      meal_session: mealContext,
      workout_session: workoutContext,
    }, requestResponseOrigin(request))
    return
  }

  const mealClarifyAction = deterministicClarifyActionFromSession(mealContext)
  if (mealClarifyAction) {
    const clarifyMessage = mealClarifyAction.message || "I need a bit more detail before I can log that meal."
    sendJson(response, 200, {
      reply: clarifyMessage,
      actions: [mealClarifyAction],
      warnings: [],
      meal_session: mealContext,
      workout_session: workoutContext,
    }, requestResponseOrigin(request))
    return
  }

  const workoutClarifyAction = deterministicClarifyActionFromSession(workoutContext)
  if (workoutClarifyAction) {
    sendJson(response, 200, {
      reply: workoutClarifyAction.message,
      actions: [workoutClarifyAction],
      warnings: [],
      meal_session: mealContext,
      workout_session: workoutContext,
    }, requestResponseOrigin(request))
    return
  }

  if (!client) {
    throw createHttpError(503, "Live coach is unavailable right now.", {
      expose: true,
      logMessage: "OPENAI_API_KEY is not set for the coach server",
    })
  }

  if (mealContext) {
    const mealPayload = {
      current_date: new Date().toISOString().slice(0, 10),
    user_message: String(body.message || ""),
    profile: body.profile || {},
    coach_context: body.coachContext || {},
    meal_context: mealContext,
    recent_messages: safeRecentArray(mealContext.thread_messages, 8),
    recent_meals: safeArray(body.meals, 6),
    candidate_food_matches: candidateFoodMatches,
  }

    const completion = await client.chat.completions.create({
      model,
      max_completion_tokens: 350,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: mealCoachInstructions },
        { role: "user", content: JSON.stringify(mealPayload) },
      ],
    })

    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}")
    sendJson(
      response,
      200,
      {
        ...normalizeCoachResponse(parsed, {
          prompt: body.message,
          recentMessages: contextualRecentMessages,
          recentMeals: safeArray(body.meals, 12),
          recentWorkouts: safeArray(body.workouts, 12),
          mealContext,
          workoutContext,
        }),
        meal_session: mealContext,
        workout_session: workoutContext,
      },
      requestResponseOrigin(request)
    )
    return
  }

  const payload = {
    current_date: new Date().toISOString().slice(0, 10),
    user_message: String(body.message || ""),
    profile: body.profile || {},
    coach_context: body.coachContext || {},
    recent_messages: contextualRecentMessages,
    recent_meals: safeArray(body.meals, 12),
    recent_workouts: safeArray(body.workouts, 12),
    recent_workout_sets: safeArray(body.workoutSets, 24),
    workout_plans: safeArray(body.workoutPlans, 6),
    meal_plans: safeArray(body.mealPlans, 6),
    recovery_logs: safeArray(body.recoveryLogs, 6),
    active_workout: body.activeWorkout || null,
    verified_food_catalogue: verifiedFoods,
    candidate_food_matches: candidateFoodMatches,
    meal_context: mealContext,
    workout_context: workoutContext,
  }


  const completion = await client.chat.completions.create({
    model,
    max_completion_tokens: 500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: coachInstructions },
      { role: "user", content: JSON.stringify(payload) },
    ],
  })

  const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}")
  sendJson(response, 200, {
    ...normalizeCoachResponse(parsed, {
      prompt: body.message,
      recentMessages: contextualRecentMessages,
      recentMeals: safeArray(body.meals, 12),
      recentWorkouts: safeArray(body.workouts, 12),
      mealContext,
      workoutContext,
    }),
    meal_session: mealContext,
    workout_session: workoutContext,
  }, requestResponseOrigin(request))
}

function verifiedNutritionResult(food) {
  return {
    id: food.id,
    name: food.name,
    aliases: food.aliases || [],
    quantity: food.quantity,
    calories: Number(food.calories) || 0,
    protein_g: Number(food.protein_g) || 0,
    carbs_g: Number(food.carbs_g) || 0,
    fat_g: Number(food.fat_g) || 0,
    category: food.category || "food",
    source: food.source,
    source_type: "curated_au_catalogue",
  }
}

async function searchOpenFoodFacts(query, { australiaOnly = true } = {}) {
  if (process.env.OPENFOODFACTS_ENABLED === "false" || !query.trim()) return []

  const url = buildOpenFoodFactsUrl(query, australiaOnly)
  const data = await fetchJsonWithTimeout(url, { "User-Agent": "ApexAI/1.0 nutrition lookup" })
  if (!data) return []
  return normalizeOpenFoodFactsProducts(data.products)
}

async function searchOpenFoodFactsByBarcode(code) {
  if (process.env.OPENFOODFACTS_ENABLED === "false" || !looksLikeBarcode(code)) return []
  const data = await fetchJsonWithTimeout(`https://world.openfoodfacts.org/api/v2/product/${String(code).trim()}.json`, {
    "User-Agent": "ApexAI/1.0 nutrition lookup",
  })
  if (!data) return []
  if (!data?.product) return []
  const product = normalizeSingleOpenFoodFactsProduct(data.product, "barcode_label")
  return product ? [product] : []
}

async function lookupFoodsBroad(query) {
  const normalizedQuery = String(query || "").trim()
  if (!normalizedQuery) return []

  const cacheKey = `broad:${cleanLookupText(normalizedQuery)}`
  const cached = readFoodLookupCache(cacheKey)
  if (cached) return cached

  const localResults = searchVerifiedFoods(query).map(verifiedNutritionResult)
  const barcodeResults = looksLikeBarcode(normalizedQuery) ? await searchOpenFoodFactsByBarcode(normalizedQuery) : []
  const shouldSkipExternal = localResults.length >= 4
  const auResults = shouldSkipExternal ? [] : await searchOpenFoodFacts(query, { australiaOnly: true })
  const globalResults = shouldSkipExternal || auResults.length || localResults.length >= 2
    ? []
    : await searchOpenFoodFacts(query, { australiaOnly: false })

  const seen = new Set()
  const results = [...barcodeResults, ...localResults, ...auResults, ...globalResults].filter((food) => {
    const key = food.id || food.name
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  writeFoodLookupCache(cacheKey, results)
  return results
}

function extractIngredientTerms(text) {
  const rawTerms = String(text || "")
    .split(/[\n,]/)
    .map((term) => term.trim())
    .filter(Boolean)
  return rawTerms.length ? rawTerms.slice(0, 12) : [String(text || "").trim()].filter(Boolean)
}

async function handleNutritionSearch(request, response) {
  await verifyRequestAuth(request)
  const body = await readRequestBody(request)
  validateNutritionBody(body)
  const query = String(body.query || "")
  const results = await lookupFoodsBroad(query)
  sendJson(response, 200, { results }, requestResponseOrigin(request))
}

function normalizeChefResponse(value) {
  if (!value || typeof value !== "object") throw new Error("OpenAI returned an invalid recipe payload")

  const servings = Math.max(1, Math.round(safeNumber(value.servings, 1)))
  const totals = {
    calories: Math.round(safeNumber(value.totals?.calories, 0)),
    protein_g: roundMacro(value.totals?.protein_g),
    carbs_g: roundMacro(value.totals?.carbs_g),
    fat_g: roundMacro(value.totals?.fat_g),
  }
  const derivedPerServing = {
    calories: Math.round(totals.calories / servings),
    protein_g: roundMacro(totals.protein_g / servings),
    carbs_g: roundMacro(totals.carbs_g / servings),
    fat_g: roundMacro(totals.fat_g / servings),
  }

  return {
    title: typeof value.title === "string" && value.title.trim() ? value.title : "Pantry recipe",
    description: typeof value.description === "string" ? value.description : "",
    meal_type: typeof value.meal_type === "string" && value.meal_type.trim() ? value.meal_type : "dinner",
    servings,
    notes: typeof value.notes === "string" ? value.notes : "",
    ingredients: safeArray(value.ingredients, 20).map((ingredient) => ({
      name: typeof ingredient?.name === "string" ? ingredient.name : "Ingredient",
      quantity: typeof ingredient?.quantity === "string" ? ingredient.quantity : "",
      estimated: Boolean(ingredient?.estimated),
      source: typeof ingredient?.source === "string" ? ingredient.source : "Model-assisted estimate",
      source_type: typeof ingredient?.source_type === "string" ? ingredient.source_type : "estimated",
      calories: Math.round(safeNumber(ingredient?.calories, 0)),
      protein_g: roundMacro(ingredient?.protein_g),
      carbs_g: roundMacro(ingredient?.carbs_g),
      fat_g: roundMacro(ingredient?.fat_g),
    })),
    steps: safeArray(value.steps, 8).filter((step) => typeof step === "string" && step.trim()),
    totals,
    per_serving: {
      calories: Math.round(safeNumber(value.per_serving?.calories, derivedPerServing.calories)),
      protein_g: roundMacro(value.per_serving?.protein_g ?? derivedPerServing.protein_g),
      carbs_g: roundMacro(value.per_serving?.carbs_g ?? derivedPerServing.carbs_g),
      fat_g: roundMacro(value.per_serving?.fat_g ?? derivedPerServing.fat_g),
    },
  }
}

async function handleNutritionChef(request, response) {
  await verifyRequestAuth(request)
  const body = await readRequestBody(request)
  validateNutritionChefBody(body)

  if (!client) {
    throw createHttpError(503, "Recipe generation is unavailable right now.", {
      expose: true,
      logMessage: "OPENAI_API_KEY is not set for nutrition chef",
    })
  }

  const pantry = String(body.pantry || "")
  const ingredientTerms = extractIngredientTerms(pantry)
  const candidateFoodsByTerm = {}
  const foodLookups = await Promise.all(ingredientTerms.map(async (term) => [term, (await lookupFoodsBroad(term)).slice(0, 6)]))
  for (const [term, matches] of foodLookups) {
    candidateFoodsByTerm[term] = matches
  }

  const payload = {
    current_date: new Date().toISOString().slice(0, 10),
    pantry_text: pantry,
    ingredient_terms: ingredientTerms,
    goal: String(body.goal || ""),
    meal_type: String(body.mealType || "dinner"),
    requested_servings: Math.max(1, Math.round(safeNumber(body.servings, 1))),
    allow_estimated: body.allowEstimated !== false,
    profile: body.profile || {},
    candidate_foods_by_term: candidateFoodsByTerm,
  }


  const completion = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: chefInstructions },
      { role: "user", content: JSON.stringify(payload) },
    ],
  })

  const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}")
  sendJson(response, 200, { recipe: normalizeChefResponse(parsed) }, requestResponseOrigin(request))
}

async function handleDeleteAccount(request, response) {
  const user = await verifyBearerUser(request)
  if (!user) {
    throw createHttpError(401, "Account deletion requires an authenticated session.")
  }
  if (!adminSupabase) {
    throw createHttpError(503, "Account deletion is unavailable right now.", {
      expose: true,
      logMessage: "SUPABASE_SERVICE_ROLE_KEY is not configured for account deletion",
    })
  }

  const [{ error: stateDeleteError }, { error: profileDeleteError }] = await Promise.all([
    adminSupabase.from("user_app_state").delete().eq("user_id", user.id),
    adminSupabase.from("user_profiles").delete().eq("user_id", user.id),
  ])
  if (stateDeleteError) throw stateDeleteError
  if (profileDeleteError) throw profileDeleteError

  const { error } = await adminSupabase.auth.admin.deleteUser(user.id)
  if (error) throw error
  sendJson(response, 200, { deleted: true }, requestResponseOrigin(request))
}

async function handleTelemetry(request, response) {
  const user = await verifyRequestAuth(request, { optional: true })
  const body = await readRequestBody(request)
  validateTelemetryBody(body)

  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    type: body.type,
    level: body.level || "info",
    payload: body.payload || {},
    user_id: user?.id || null,
    ip: requestIp(request),
    user_agent: String(request.headers["user-agent"] || ""),
  }

  fs.mkdirSync(path.dirname(telemetryLogFile), { recursive: true })
  fs.appendFileSync(telemetryLogFile, `${JSON.stringify(entry)}\n`, "utf8")
  sendJson(response, 202, { accepted: true }, requestResponseOrigin(request))
}

const server = http.createServer(async (request, response) => {
  const corsAllowed = applyCors(request)
  if (!corsAllowed) {
    logRequest(request, 403, "blocked=cors")
    sendJson(response, 403, { error: "Origin not allowed" }, requestResponseOrigin(request))
    return
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, jsonHeaders(requestResponseOrigin(request)))
    response.end()
    return
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true, model, openaiConfigured: Boolean(client), authRequired: requireAuth, supabaseConfigured: Boolean(serverSupabase), adminConfigured: Boolean(adminSupabase), corsOrigins: configuredCorsOrigins }, requestResponseOrigin(request))
    return
  }

  if (request.method === "POST" && request.url === "/api/coach") {
    try {
      checkRateLimit(request)
      await handleCoach(request, response)
      logRequest(request, 200)
    } catch (error) {
      const status = error.status || 500
      logRequest(request, status, "handler=coach")
      sendError(response, request, error, "Live coach is unavailable right now.")
    }
    return
  }

  if (request.method === "POST" && request.url === "/api/nutrition/search") {
    try {
      checkRateLimit(request)
      await handleNutritionSearch(request, response)
      logRequest(request, 200)
    } catch (error) {
      const status = error.status || 500
      logRequest(request, status, "handler=nutrition")
      sendError(response, request, error, "Nutrition search is unavailable right now.")
    }
    return
  }

  if (request.method === "POST" && request.url === "/api/nutrition/chef") {
    try {
      checkRateLimit(request)
      await handleNutritionChef(request, response)
      logRequest(request, 200)
    } catch (error) {
      const status = error.status || 500
      logRequest(request, status, "handler=nutrition-chef")
      sendError(response, request, error, "Recipe generation is unavailable right now.")
    }
    return
  }

  if (request.method === "POST" && request.url === "/api/account/delete") {
    try {
      checkRateLimit(request)
      await handleDeleteAccount(request, response)
      logRequest(request, 200)
    } catch (error) {
      const status = error.status || 500
      logRequest(request, status, "handler=delete-account")
      sendError(response, request, error, "Account deletion failed.")
    }
    return
  }

  if (request.method === "POST" && request.url === "/api/telemetry") {
    try {
      checkRateLimit(request)
      await handleTelemetry(request, response)
      logRequest(request, 202, "handler=telemetry")
    } catch (error) {
      const status = error.status || 500
      logRequest(request, status, "handler=telemetry")
      sendError(response, request, error, "Telemetry request failed.")
    }
    return
  }

  sendJson(response, 404, { error: "Not found" }, requestResponseOrigin(request))
})

server.listen(port, host, () => {
  console.log(`ApexAI OpenAI coach server listening at http://${host}:${port}`)
})
