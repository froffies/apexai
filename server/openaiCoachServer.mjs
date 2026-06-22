import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"
import { buildRecalledCoachReply, mergeRecalledCoachMessages } from "../src/lib/coachConversationMemory.js"
import { searchBestFoodMatches, searchPhotoReferenceFoods, verifiedFoods } from "../src/lib/nutritionDatabase.js"
import { coachMealConfidenceNote } from "../src/lib/nutritionHelpers.js"
import { buildCoachSessionState } from "./coachSessionState.mjs"
import {
  buildCoachAuditResponseMeta,
  coachAuditCapabilities,
  detectCoachAuditIntent,
  isCoachAuditAdminUser,
  listCoachAuditRecords,
  normalizeAuditClientPatch,
  persistCoachAuditRecord,
  sanitizeCoachStateSnapshot,
  summarizeCoachAuditRecords,
} from "./coachAudit.mjs"
import {
  buildDeterministicFoodMacroReply,
  buildDeterministicNutritionStatusReply,
  buildDeterministicMealDeletionAction,
  buildDeterministicMealActions,
  buildDeterministicWorkoutActions,
  buildDeterministicWorkoutDeletionAction,
  deterministicAlreadyLoggedReply,
  deterministicClarifyActionFromSession,
  extractFoodMacroLookupTerm,
  formatDeterministicMealAnswer,
  isPersistenceAction,
  summarizeCoachAction,
} from "./coachLoggingRules.mjs"
import { normalizeCoachResponse } from "./normalizeCoachResponse.mjs"
import { buildFoodPhotoEstimate, buildReviewedFoodPhotoEstimate } from "./nutritionPhotoAnalysis.mjs"
import { normalizeVisionImageDataUrl } from "./visionImagePrep.mjs"
import { safeArray, safeNumber, roundMacro } from "./utils.mjs"

// ─── Environment & Configuration ─────────────────────────────────────────────

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
const visionModel = process.env.OPENAI_VISION_MODEL || model
const nodeEnv = process.env.NODE_ENV || "development"
const isProduction = nodeEnv === "production"
const configuredCorsOrigins = (process.env.OPENAI_COACH_CORS_ORIGIN || (nodeEnv === "production" ? "" : "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173")).split(",").map((origin) => origin.trim()).filter(Boolean)
const fallbackCorsOrigin = configuredCorsOrigins[0] || "null"
function buildOpenAIClient(apiKey, baseURL) {
  return apiKey
    ? new OpenAI({
        apiKey,
        ...(baseURL ? { baseURL } : {}),
      })
    : null
}

const client = buildOpenAIClient(process.env.OPENAI_API_KEY, process.env.OPENAI_BASE_URL)
const visionClient = buildOpenAIClient(
  process.env.OPENAI_VISION_API_KEY || process.env.OPENAI_API_KEY,
  process.env.OPENAI_VISION_BASE_URL || process.env.OPENAI_BASE_URL
)
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
const telemetryStoragePrefix = process.env.TELEMETRY_STORAGE_PREFIX || "telemetry_event:"
const telemetryTableName = process.env.TELEMETRY_TABLE_NAME || "telemetry_events"
const telemetrySink = String(
  process.env.TELEMETRY_SINK
  || (nodeEnv === "production" && adminSupabase ? "supabase_auto" : "file")
).trim().toLowerCase()
const telemetryRateLimitMaxRequests = Number(process.env.TELEMETRY_RATE_LIMIT_MAX_REQUESTS || (nodeEnv === "production" ? 300 : 2000))
const openFoodFactsTimeoutMs = Number(process.env.OPENFOODFACTS_TIMEOUT_MS || 5000)
const foodLookupCacheTtlMs = Number(process.env.FOOD_LOOKUP_CACHE_TTL_MS || 15 * 60_000)
const foodLookupCacheMaxEntries = Number(process.env.FOOD_LOOKUP_CACHE_MAX_ENTRIES || 200)
const foodLookupCache = new Map()
const NUTRITION_LOOKUP_STOPWORDS = new Set(["a", "an", "and", "for", "in", "of", "or", "the", "with"])
const NUTRITION_LOOKUP_TOKEN_EQUIVALENTS = new Map([
  ["fries", "chips"],
  ["lite", "light"],
  ["yogurt", "yoghurt"],
  ["parma", "parmi"],
])
const auditCapabilities = coachAuditCapabilities(adminSupabase)
const deploymentId = String(
  process.env.RENDER_DEPLOY_ID
  || process.env.RENDER_DEPLOYMENT_ID
  || process.env.VERCEL_DEPLOYMENT_ID
  || process.env.DEPLOYMENT_ID
  || process.env.RENDER_INSTANCE_ID
  || ""
).trim()
const deployedAt = String(
  process.env.RENDER_DEPLOYED_AT
  || process.env.DEPLOYED_AT
  || process.env.VERCEL_DEPLOYMENT_CREATED_AT
  || ""
).trim()
const runtimeCommitSha = String(auditCapabilities.commitSha || "").trim()
const runtimeAppVersion = String(auditCapabilities.version || "1.0.0").trim()
const defaultRequestBodyLimitBytes = 1_000_000
const photoRequestBodyLimitBytes = 30_000_000

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
            enum: ["none", "clarify", "log_workout", "update_workout_log", "delete_workout_log", "log_meal", "update_meal_log", "delete_meal_log", "create_workout_plan", "create_meal_plan", "update_targets"],
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
          delete_confirmed: { type: "boolean" },
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

const nutritionPhotoSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "portion", "overall_confidence", "needs_clarification", "clarification_question", "assumptions", "items"],
  properties: {
    summary: { type: "string" },
    portion: { type: "string" },
    overall_confidence: { type: "string" },
    needs_clarification: { type: "boolean" },
    clarification_question: { type: "string" },
    assumptions: {
      type: "array",
      items: { type: "string" },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "category", "preparation", "confidence", "notes"],
        properties: {
          name: { type: "string" },
          quantity: { type: "string" },
          category: { type: "string" },
          preparation: { type: "string" },
          confidence: { type: "string" },
          notes: { type: "string" },
        },
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
- Use recent_messages, recalled_messages, meal_context, workout_context, recent_meals, recent_workouts, validated_actions, response_hints, and candidate_fragments together. The user may be continuing a fragmented thread, correcting themselves, or mixing food and training in one sentence.
- recalled_messages contains older but relevant coach-chat snippets selected from the user's saved conversation history. Use it when the user refers back to something from earlier today or previous days, but prefer recent_messages if they conflict.
- If the user explicitly asks what you said earlier or what advice you gave before, answer from recalled_messages directly when the answer is present there. Do not ask for more detail when the recalled context already contains the answer.
- candidate_fragments contains the server's clause-level mixed-turn decomposition. Use it as a context hint for how the turn may split across meal and workout domains, not as absolute truth.
- meal_context and workout_context are heuristic server-built session hints, not absolute truth. If they conflict with recent_messages, trust the actual conversation first and use the hints to stay oriented.
- previous_meal_session and previous_workout_session are the raw client-held sessions from before this turn was parsed. Use them to understand continuity, especially if the new heuristic session looks incomplete or oddly shaped.
- response_hints contains server-validated guardrails such as already-logged, suppression, delete, answer-only context, and parser hints. Treat the guardrails as trusted state constraints, and treat the parser hints as hints rather than decisions.
- On the live AI-first path, candidate_persistence_actions is intentionally empty. Do not wait for it and do not expect the server to choose a save for you.
- You must decide whether to return a log, update, delete, or clarify action from the conversation and context yourself.
- The server will validate the action you choose and canonicalize trusted fields, but it will not invent a new meal or workout persistence action when you leave actions empty.
- If the user is frustrated, tired, embarrassed, or inconsistent, stay calm and useful. Do not be robotic or judgmental.
- Answer the user's actual question first. Offer one useful next step when it helps.
- Distinguish clearly between answering, clarifying, planning, and logging.
- Mixed meal + workout messages are valid. If the same message includes both, handle both naturally instead of forcing everything into one domain.
- If the user reports food eaten and training completed in the same past-tense message, treat that as logging intent even if they never explicitly say "log" or "save".
- Fragmented multi-turn meals and workouts are normal. Use the current session objects instead of pretending the user started over.
- Corrections after save, delete/undo requests, "don't log that", and "actually I meant..." can all happen after persistence. Respect them and keep the reply aligned with the current session state.
- General nutrition or fitness questions should be answered without saving anything unless the user clearly wants a log/update/delete action.
- Never emit update_targets in response to a nutrition question. If the user asks "how many calories in 100g of chicken" or "how much protein is in 200g of salmon", answer the question with a text reply only. Do not treat the quantity in their question as a target value to set.
- If a user is asking for totals, macros, or whether they are over a target, answer from context instead of asking them to save again.
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
- Do not invent fake precision for nutrition. Prefer verified_food_catalogue matches or exact macros from the user whenever possible.
- For common whole foods, drinks, or mixed meals with clear logging intent, you may use reasonable estimated serves and macros when the user gave enough conversational context to make a practical estimate. Mark those logs as estimated=true and explain briefly that they are estimates.
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
- For update_meal_log, update_workout_log, delete_meal_log, and delete_workout_log, include the real meal_id or workout_id from recent_meals, recent_workouts, or validated_actions. If you do not include the ID, nothing will be persisted.
- Never claim you logged something unless you also return the matching log or update action.
- Do not create a workout log if sets/reps/load or duration are still missing. Ask the shortest follow-up question needed.
- If the user only names an exercise plus weight or sets, but not reps or time, ask a short follow-up instead of logging a workout.
- Never emit log_workout with a blank or generic title like "Workout" if you can identify the exercise.
- If the user asks where something was logged or saved, answer from the app context instead of inventing a new log action.
- If the user asks a nutrition or training question without clear logging intent, answer the question and return no persistence action.
- If the user message contains multiple topics, prioritise the user's main ask and avoid trying to do everything at once.
- If response_hints.clarify_hints.meal or response_hints.clarify_hints.workout is present, treat that question as a hint, not a script. Rephrase it naturally.
- Before asking a clarification question, check recent_messages and the current session context carefully. If the user already answered, do not ask again.
- If the food or exercise name in a clarify hint looks like sentence filler or accidental text like "actually", "oh and", "and then", "at", or "this mornings workout", do not echo it back. Ask what they actually ate or did instead.
- If response_hints.clarify_hints show a clarification need but recent_messages show the user already answered it, do not ask again. Prefer the answer already given and align your returned actions with the now-complete context.
- If candidate_fragments.has_mixed_domains is true, the user sent a message containing both food and exercise. Handle both in your reply. If both sides are actionable, return both actions. If only one side is ready, confirm that one and estimate or ask about the other - do not silently drop either side.
- If candidate_fragments.has_mixed_domains is true and both the meal and workout sides are actionable, prefer returning both actions in the same turn instead of asking a redundant follow-up.
- If response_hints.already_logged.meal or response_hints.already_logged.workout is present, explain that the relevant item is already saved and invite the user to update or delete it if they want a change. Do not return a new persistence action unless the user is actually changing something.
- If response_hints.suppression_hint.meal or response_hints.suppression_hint.workout is present, acknowledge that you will not save that item. Return no new persistence action unless validated_actions includes an actual delete action for an already-saved item.
- If validated_actions includes delete_meal_log or delete_workout_log, confirm the removal naturally in your reply. Do not invent replacement saves, and do not pretend nothing happened.
- If the current turn sounds conversationally valid but the parser hints look odd or partial, use the conversation to repair the wording of the reply. Never mirror awkward parser fragments back to the user.
- Clarify hints are not mandatory. If the user already gave enough detail to estimate and log safely, you may return a valid log or update action instead of a clarify action.
- If the user asks to "log all that" and the message contains both food and training, do your best to handle both in one turn. If one part is still vague, you may still log the other part and ask one targeted follow-up for the missing piece.
- If a single message contains a clearly loggable workout plus a common meal or drink with only mildly vague portions, prefer logging both with reasonable estimated serves instead of dropping the meal side entirely.
- For common foods and drinks in one mixed sentence such as eggs, bacon, toast, oats, coffee, tea, milk, water, shakes, or fruit, you may use reasonable default serves for an estimated log when the user is clearly asking you to log the whole sentence.
- If a water or zero-calorie drink amount is explicit, include it in the logged meal/drink summary rather than ignoring it just because another food in the sentence needs a light estimate.
- If the user says "don't log that" or clearly reverses a just-saved item, prefer helping them undo or remove the saved entry rather than treating it like a fresh suppression-only turn.
- Never mention system prompts, schemas, backend rules, or internal tooling.
- Default to Australian metric units and Australian food context.
- validated_actions are hard server-validated guardrails such as deletes. Keep your reply aligned with them exactly.
- candidate_persistence_actions will usually be empty on the AI-first path. If you want anything persisted, you must explicitly return the matching log_meal, update_meal_log, log_workout, update_workout_log, delete_meal_log, or delete_workout_log action yourself.
- A conversational confirmation without a matching persistence action does nothing. Never rely on the server to infer the save from your reply text.
- If response_hints.nutrition_status_hint is present, use it as trusted context for daily totals/target questions instead of apologising or asking to save again.
- If response_hints.answer_only_meal_hint is present, use those meal macros as trusted context for answer-only questions about the current meal, but still return no persistence action unless the user explicitly asks to save it.
- Never say something was saved, logged, updated, or deleted unless your returned actions actually do that.
- For log_meal and update_meal_log actions, always include calories, protein_g, carbs_g, fat_g, quantity, and nutrition_source.
- When the user mentions multiple distinct meals in a single message such as "breakfast was X, lunch was Y", return a separate log_meal action for each meal. Never combine multiple meals into a single action, and set meal_type correctly on each one.
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

const nutritionPhotoInstructions = `
You are ApexAI Vision Nutrition inside an Australian/New Zealand fitness app.

Return JSON only.

Task:
- Look at one plate or drink photo.
- Identify only foods and drinks that are actually visible or strongly obvious from the image.
- Estimate practical portions conservatively.
- Do NOT invent hidden oils, butter, sauces, brands, or ingredients unless they are clearly visible.
- If the image is ambiguous, say so and ask for a clarification.
- Prefer Australian / New Zealand naming and metric-friendly quantities.

Rules:
- Focus on what is on the plate or in the cup, not what might have been used off-camera.
- If there are multiple foods, return them as separate items.
- quantity should be a practical string like "2 eggs", "250ml milk", "180g chicken", "1 slice toast", or "1 plate salad".
- category must be one of: food, drink, ingredient.
- preparation should be short, like "fried", "hard boiled", "grilled", or "".
- confidence must be high, medium, or low.
- summary should be a short combined description of the whole plate.
- portion should be a whole-meal container label like "1 plate", "1 bowl", "1 cup", or "1 glass".
- assumptions should list only the key uncertainty points.
- needs_clarification should be true if the image is too ambiguous for a solid log without user confirmation.
- clarification_question should be short and specific when needed, otherwise empty.
`

// ─── HTTP Utilities ──────────────────────────────────────────────────────────

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

function readRequestBody(request, maxBytes = defaultRequestBodyLimitBytes) {
  return new Promise((resolve, reject) => {
    let body = ""
    let settled = false

    function rejectOnce(error) {
      if (settled) return
      settled = true
      reject(error)
    }

    request.on("data", (chunk) => {
      if (settled) return
      body += chunk
      if (body.length > maxBytes) {
        const error = new Error("Request body too large")
        error.status = 413
        rejectOnce(error)
      }
    })
    request.on("end", () => {
      if (settled) return
      try {
        settled = true
        resolve(body ? JSON.parse(body) : {})
      } catch {
        const error = new Error("Invalid JSON request body")
        error.status = 400
        rejectOnce(error)
      }
    })
    request.on("error", (error) => {
      rejectOnce(error)
    })
  })
}


// ─── Conversation Utilities ──────────────────────────────────────────────────

function safeRecentArray(value, limit) {
  return Array.isArray(value) ? value.slice(-limit) : []
}

function buildCoachConversationWindow(recentMessages = [], currentMessage = "", assistantReply = "") {
  return [
    ...safeRecentArray(recentMessages, 12),
    ...(currentMessage ? [{ role: "user", content: String(currentMessage || "") }] : []),
    ...(assistantReply ? [{ role: "assistant", content: String(assistantReply || "") }] : []),
  ]
}

// ─── Deterministic Fallback ──────────────────────────────────────────────────

function buildDeterministicFallbackPayload({
  offlineDeterministicActions = [],
  nutritionStatusReply = "",
  foodMacroReply = "",
  mealClarifyHint = null,
  workoutClarifyHint = null,
  mealContext = null,
  workoutContext = null,
  mealAlreadyLoggedGuard = false,
  workoutAlreadyLoggedGuard = false,
  mealSuppressedGuard = false,
  workoutSuppressedGuard = false,
  recalledMessages = [],
  body = {},
}) {
  if (!mealClarifyHint && !workoutClarifyHint && offlineDeterministicActions.length) {
    return {
      routeType: "deterministic-fallback",
      payload: {
        reply: offlineDeterministicActions.map((action) => summarizeCoachAction(action)).filter(Boolean).join(" "),
        actions: offlineDeterministicActions,
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      },
    }
  }

  const fallbackPersistenceActions = offlineDeterministicActions.filter(isPersistenceAction)
  if (fallbackPersistenceActions.length && (mealClarifyHint || workoutClarifyHint)) {
    const combinedActions = [
      ...fallbackPersistenceActions,
      ...[mealClarifyHint, workoutClarifyHint].filter(Boolean),
    ]
    return {
      routeType: "deterministic-fallback",
      payload: {
        reply: combinedActions.map((action) => summarizeCoachAction(action)).filter(Boolean).join(" "),
        actions: combinedActions,
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      },
    }
  }

  if (foodMacroReply) {
    return {
      routeType: "deterministic-fallback",
      payload: {
        reply: foodMacroReply,
        actions: [],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      },
    }
  }

  if (mealAlreadyLoggedGuard) {
    return {
      routeType: "deterministic-fallback",
      payload: {
        reply: deterministicAlreadyLoggedReply(mealContext, "meal"),
        actions: [],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      },
    }
  }

  if (mealSuppressedGuard) {
    return {
      routeType: "deterministic-fallback",
      payload: {
        reply: mealContext?.suppressionReply || "Okay, I won't save that.",
        actions: [],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      },
    }
  }

  if (workoutAlreadyLoggedGuard) {
    return {
      routeType: "deterministic-fallback",
      payload: {
        reply: deterministicAlreadyLoggedReply(workoutContext, "workout"),
        actions: [],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      },
    }
  }

  if (workoutSuppressedGuard) {
    return {
      routeType: "deterministic-fallback",
      payload: {
        reply: workoutContext?.suppressionReply || "Okay, I won't save that.",
        actions: [],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      },
    }
  }

  if (nutritionStatusReply) {
    return {
      routeType: "deterministic-fallback",
      payload: {
        reply: nutritionStatusReply,
        actions: [],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      },
    }
  }

  if (mealClarifyHint) {
    return {
      routeType: "deterministic-fallback",
      payload: {
        reply: mealClarifyHint.message || "I need a bit more detail before I can log that meal.",
        actions: [mealClarifyHint],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      },
    }
  }

  if (workoutClarifyHint) {
    return {
      routeType: "deterministic-fallback",
      payload: {
        reply: workoutClarifyHint.message,
        actions: [workoutClarifyHint],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      },
    }
  }

  return {
    routeType: "fallback",
    payload: {
      reply: buildOfflineCoachFallbackReply(body.message, recalledMessages),
      actions: [],
      warnings: [],
      meal_session: mealContext,
      workout_session: workoutContext,
    },
  }
}

// ─── Audit Helpers ───────────────────────────────────────────────────────────

function createAuditLogId() {
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeIncomingAuditMeta(value = {}) {
  const raw = value && typeof value === "object" ? value : {}
  const logId = String(raw.log_id || raw.message_id || createAuditLogId()).trim()
  return {
    log_id: logId,
    message_id: String(raw.message_id || logId).trim(),
    session_id: String(raw.session_id || "").trim(),
    app_version: String(raw.app_version || "").trim(),
    commit_sha: String(raw.commit_sha || "").trim(),
  }
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

function normalizeRecalledMessages(value, limit = 8) {
  return safeRecentArray(value, limit)
    .map((entry) => {
      const role = String(entry?.role || "").trim().toLowerCase() === "assistant" ? "assistant" : "user"
      const content = String(entry?.content || "").trim()
      const timestamp = typeof entry?.timestamp === "string" ? entry.timestamp.trim() : ""
      if (!content) return null
      return timestamp ? { role, content, timestamp } : { role, content }
    })
    .filter(Boolean)
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

// ─── Request Validation ──────────────────────────────────────────────────────

function validateCoachBody(body) {
  assertObject(body, "request body")
  assertString(body.message, "message", 3000)
  if (body.profile !== undefined) assertObject(body.profile, "profile")
  if (body.coachContext !== undefined) assertObject(body.coachContext, "coachContext")
  if (body.mealSession !== undefined && body.mealSession !== null) assertObject(body.mealSession, "mealSession")
  if (body.workoutSession !== undefined && body.workoutSession !== null) assertObject(body.workoutSession, "workoutSession")
  if (body.auditMeta !== undefined) assertObject(body.auditMeta, "auditMeta")
  for (const key of ["recentMessages", "recalledMessages", "meals", "workouts", "workoutSets", "workoutPlans", "mealPlans", "recoveryLogs"]) {
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

function validateNutritionPhotoBody(body) {
  assertObject(body, "request body")
  assertString(body.imageDataUrl, "imageDataUrl", 28_000_000)
  if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(String(body.imageDataUrl || ""))) {
    const error = new Error("imageDataUrl must be a base64 image data URL")
    error.status = 400
    throw error
  }
  if (body.locale !== undefined && typeof body.locale !== "string") {
    const error = new Error("locale must be a string")
    error.status = 400
    throw error
  }
  if (body.mealType !== undefined && typeof body.mealType !== "string") {
    const error = new Error("mealType must be a string")
    error.status = 400
    throw error
  }
}

function validateNutritionPhotoReviewBody(body) {
  assertObject(body, "request body")
  if (!Array.isArray(body.items) || !body.items.length) {
    const error = new Error("items must be a non-empty array")
    error.status = 400
    throw error
  }
  if (body.items.length > 12) {
    const error = new Error("items must contain at most 12 entries")
    error.status = 400
    throw error
  }
  for (const item of body.items) {
    assertObject(item, "items[]")
    assertString(item.name, "items[].name", 160)
    if (item.quantity !== undefined && typeof item.quantity !== "string") {
      const error = new Error("items[].quantity must be a string")
      error.status = 400
      throw error
    }
    if (item.category !== undefined && typeof item.category !== "string") {
      const error = new Error("items[].category must be a string")
      error.status = 400
      throw error
    }
    if (item.preparation !== undefined && typeof item.preparation !== "string") {
      const error = new Error("items[].preparation must be a string")
      error.status = 400
      throw error
    }
    if (item.confidence !== undefined && typeof item.confidence !== "string") {
      const error = new Error("items[].confidence must be a string")
      error.status = 400
      throw error
    }
  }
  if (body.summary !== undefined && typeof body.summary !== "string") {
    const error = new Error("summary must be a string")
    error.status = 400
    throw error
  }
  if (body.portion !== undefined && typeof body.portion !== "string") {
    const error = new Error("portion must be a string")
    error.status = 400
    throw error
  }
  if (body.mealType !== undefined && typeof body.mealType !== "string") {
    const error = new Error("mealType must be a string")
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

function validateCoachAuditEventBody(body) {
  assertObject(body, "request body")
  assertString(body.log_id || body.message_id || "", "log_id", 160)
  if (body.route_type !== undefined && !["deterministic", "ai-assisted", "tool-assisted", "fallback", "failed"].includes(String(body.route_type))) {
    const error = new Error("route_type is invalid")
    error.status = 400
    throw error
  }
}

// ─── Error Handling ──────────────────────────────────────────────────────────

function createHttpError(status, message, options = {}) {
  const error = new Error(message)
  error.status = status
  error.expose = options.expose ?? status < 500
  error.logMessage = options.logMessage || message
  return error
}

function collectProviderErrorParts(error) {
  return [
    error?.message,
    error?.code,
    error?.type,
    error?.error?.message,
    error?.error?.code,
    error?.error?.type,
    error?.cause?.message,
    error?.cause?.code,
    error?.cause?.type,
    error?.response?.data?.error?.message,
    error?.response?.data?.error?.code,
    error?.response?.data?.error?.type,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
}

function providerErrorText(error) {
  return collectProviderErrorParts(error).join(" | ")
}

function providerErrorStatus(error) {
  return Number(error?.status || error?.response?.status || error?.cause?.status || 0)
}

function isVisionQuotaExhausted(error) {
  const text = providerErrorText(error).toLowerCase()
  return (
    text.includes("insufficient_quota")
    || text.includes("billing_hard_limit_reached")
    || text.includes("exceeded your current quota")
    || text.includes("quota_exceeded")
  )
}

function isVisionTemporarilyBusy(error) {
  const status = providerErrorStatus(error)
  const text = providerErrorText(error).toLowerCase()
  return status === 429 || /rate limit|too many requests|quota/i.test(text)
}

function isVisionTransientUpstreamError(error) {
  const status = providerErrorStatus(error)
  const text = providerErrorText(error).toLowerCase()
  return (
    status === 408
    || status === 500
    || status === 502
    || status === 503
    || status === 504
    || text.includes("bad gateway")
    || text.includes("gateway error")
    || text.includes("temporarily unavailable")
    || text.includes("upstream")
    || text.includes("timeout")
  )
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Vision / OpenAI ─────────────────────────────────────────────────────────

async function createVisionCompletion(requestBody) {
  let lastError = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await visionClient.chat.completions.create(requestBody)
    } catch (error) {
      lastError = error
      if (!isVisionTransientUpstreamError(error) || attempt === 2) {
        throw error
      }
      await sleep(400 * (attempt + 1))
    }
  }
  throw lastError || new Error("Vision completion failed")
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
    {
      error: sanitizeErrorMessage(error, fallbackMessage),
      ...(error?.auditMeta ? { audit_meta: error.auditMeta } : {}),
    },
    requestResponseOrigin(request)
  )
}

// ─── Auth ────────────────────────────────────────────────────────────────────

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



// ─── Food Matching & Cache ───────────────────────────────────────────────────

function normalizeComparableFoodText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function findMatchingCanonicalMealAction(action = {}, canonicalMealActions = []) {
  const targetFood = normalizeComparableFoodText(action?.food_name)
  const targetMealType = normalizeComparableFoodText(action?.meal_type)
  if (!targetFood && !targetMealType) return canonicalMealActions[0] || null
  return canonicalMealActions.find((candidate) => {
    const candidateFood = normalizeComparableFoodText(candidate?.food_name)
    const candidateMealType = normalizeComparableFoodText(candidate?.meal_type)
    return (
      (targetFood && candidateFood && (targetFood === candidateFood || targetFood.includes(candidateFood) || candidateFood.includes(targetFood)))
      || (targetMealType && candidateMealType && targetMealType === candidateMealType)
    )
  }) || canonicalMealActions[0] || null
}

function hydrateMealActionMetadata(action = {}, canonicalMealActions = []) {
  const type = String(action?.type || "").trim()
  if (type !== "log_meal" && type !== "update_meal_log") return action
  const canonical = findMatchingCanonicalMealAction(action, canonicalMealActions)
  if (!canonical) return action
  return {
    ...action,
    nutrition_source: String(action?.nutrition_source || "").trim() || canonical.nutrition_source,
    nutrition_source_type: String(action?.nutrition_source_type || "").trim() || canonical.nutrition_source_type,
    macro_confidence: String(action?.macro_confidence || "").trim() || canonical.macro_confidence,
    macro_breakdown: Array.isArray(action?.macro_breakdown) && action.macro_breakdown.length
      ? action.macro_breakdown
      : canonical.macro_breakdown,
  }
}

function replyMentionsMacroConfidence(reply = "") {
  return /\b(?:estimate|estimated|approx|approximate|verified|reference|label|photo)\b/i.test(String(reply || ""))
}

function finalizeCoachPayload(payload = {}, { canonicalMealActions = [] } = {}) {
  const actions = safeArray(payload.actions, 8).map((action) => hydrateMealActionMetadata(action, canonicalMealActions))
  const firstMealAction = actions.find((action) => action?.type === "log_meal" || action?.type === "update_meal_log")
  let reply = String(payload.reply || "").trim()
  if (firstMealAction && !replyMentionsMacroConfidence(reply)) {
    const note = coachMealConfidenceNote(firstMealAction)
    if (note) reply = reply ? `${reply} ${note}` : note
  }
  return {
    ...payload,
    reply,
    actions,
  }
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

function compactLookupText(value) {
  return cleanLookupText(value).replace(/\s+/g, "")
}

function normalizeLookupToken(token) {
  const normalized = cleanLookupText(token)
  if (!normalized) return ""
  const swapped = NUTRITION_LOOKUP_TOKEN_EQUIVALENTS.get(normalized) || normalized
  if (swapped.length > 4 && swapped.endsWith("ies")) return `${swapped.slice(0, -3)}y`
  if (swapped.length > 4 && swapped.endsWith("oes")) return swapped.slice(0, -2)
  if (swapped.length > 3 && swapped.endsWith("s") && !swapped.endsWith("ss")) return swapped.slice(0, -1)
  return swapped
}

function nutritionLookupTokens(value, { includeStopwords = false } = {}) {
  const tokens = cleanLookupText(value)
    .split(/\s+/)
    .map((token) => normalizeLookupToken(token))
    .filter(Boolean)
  return includeStopwords ? tokens : tokens.filter((token) => !NUTRITION_LOOKUP_STOPWORDS.has(token))
}

function nutritionLookupNames(food = {}) {
  return [food?.name, ...(Array.isArray(food?.aliases) ? food.aliases : [])].filter(Boolean)
}

function queryTokensCoveredByFood(query, food = {}) {
  const queryTokens = nutritionLookupTokens(query)
  if (!queryTokens.length) return false
  return nutritionLookupNames(food).some((name) => {
    const nameTokens = nutritionLookupTokens(name, { includeStopwords: true })
    return queryTokens.every((term) => nameTokens.includes(term) || nameTokens.some((token) => token.startsWith(term)))
  })
}

function hasStrongLocalNutritionMatch(query, localResults = []) {
  const top = safeArray(localResults, 1)[0]
  if (!top) return false
  const normalizedQuery = cleanLookupText(query)
  const compactQuery = compactLookupText(query)
  return nutritionLookupNames(top).some((name) => {
    const normalizedName = cleanLookupText(name)
    const compactName = compactLookupText(name)
    return normalizedName === normalizedQuery
      || compactName === compactQuery
      || normalizedName.startsWith(`${normalizedQuery} `)
      || compactName.startsWith(compactQuery)
  }) || queryTokensCoveredByFood(query, top)
}

function filterExternalNutritionResults(query, foods = []) {
  const queryTokens = nutritionLookupTokens(query)
  if (!queryTokens.length) return safeArray(foods, 8)
  return safeArray(foods, 8).filter((food) => queryTokensCoveredByFood(query, food))
}

function extractCoachFoodSearchTerms(message) {
  const directMacroFoodQuery = extractFoodMacroLookupTerm(message)
  if (directMacroFoodQuery) return [directMacroFoodQuery]

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
  if (/\b(you asked|i gave you|i told you|already said|what do you mean|why can(?:'|’)t you understand|why cant you understand)\b/.test(text)) return true
  if (/\b(where did you log|where was that logged|what's next|whats next|show me that|do that|go ahead)\b/.test(text)) return true
  return false
}

function buildOfflineCoachFallbackReply(message, recalledMessages = []) {
  const recalledReply = buildRecalledCoachReply(message, recalledMessages)
  if (recalledReply) return recalledReply

  const text = cleanLookupText(message)
  if (!text) {
    return "Tell me what happened today, what you ate, what you trained, or what you want to change, and I'll help you sort the next move."
  }

  if (/^(?:hi|hello|hey|yo|gday|g'day|sup|whats up|what's up)\b/.test(text)) {
    return "Hey. Tell me what happened today, what you ate, what you trained, or what you want to change, and I'll help you sort the next move."
  }

  if (/\b(?:calories|calorie|protein|carbs|fat|macros?|estimate|estimated|nutrition)\b/.test(text)) {
    return "I can help estimate that. Tell me the food and roughly how much you had, and I'll break it down."
  }

  if (/\b(?:workout|train|training|exercise|session|sets?|reps?|weight|kg|cardio|run|running|treadmill|bike|row|press|squat|deadlift)\b/.test(text)) {
    return "I can help with that. Tell me what you trained or what you want to adjust, and I'll help you sort the next move."
  }

  if (/[?]$/.test(String(message || "").trim()) || /\b(?:what should i|what do i|help me|can you|could you)\b/.test(text)) {
    return "Give me a bit more detail on the meal, training, or goal you're working with, and I'll help you map the next step."
  }

  return "Tell me what happened today, what you ate, what you trained, or what you want to change, and I'll help you sort the next move."
}

async function persistTelemetryToFile(entry) {
  fs.mkdirSync(path.dirname(telemetryLogFile), { recursive: true })
  fs.appendFileSync(telemetryLogFile, `${JSON.stringify(entry)}\n`, "utf8")
  return { sink: "file", persisted: true }
}

async function persistTelemetryToSupabaseState(entry) {
  if (!adminSupabase || !entry.user_id) return { sink: "supabase_state", persisted: false, reason: "missing_user_or_admin" }
  const storageKey = `${telemetryStoragePrefix}${entry.id}`
  const { error } = await adminSupabase.from("user_app_state").upsert(
    {
      user_id: entry.user_id,
      storage_key: storageKey,
      value: entry,
      schema_version: 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,storage_key" }
  )
  if (error) throw error
  return { sink: "supabase_state", persisted: true, storage_key: storageKey }
}

function isMissingSupabaseTableError(error) {
  const code = String(error?.code || "").toUpperCase()
  const message = String(error?.message || "")
  return code === "PGRST205"
    || code === "42P01"
    || /relation .* does not exist/i.test(message)
    || /could not find the table/i.test(message)
}

async function persistTelemetryToSupabaseTable(entry) {
  if (!adminSupabase || !entry.user_id) return { sink: "supabase_table", persisted: false, reason: "missing_user_or_admin" }
  const { error } = await adminSupabase.from(telemetryTableName).upsert(
    {
      id: entry.id,
      user_id: entry.user_id,
      event_type: entry.type,
      level: entry.level || "info",
      payload: entry.payload || {},
      raw_event: entry,
      created_at: entry.created_at || new Date().toISOString(),
    },
    { onConflict: "id" }
  )
  if (error) {
    if (isMissingSupabaseTableError(error)) {
      return { sink: "supabase_table", persisted: false, reason: "table_unavailable", table: telemetryTableName, error_code: error.code || "" }
    }
    throw error
  }
  return { sink: "supabase_table", persisted: true, table: telemetryTableName }
}

async function persistTelemetryEntry(entry) {
  if (telemetrySink === "supabase_table") {
    const result = await persistTelemetryToSupabaseTable(entry)
    if (result.persisted) return result
    const fallback = await persistTelemetryToSupabaseState(entry)
    if (fallback.persisted) return { ...fallback, preferred_sink: "supabase_table", fallback_reason: result.reason || "unavailable" }
    return { ...(await persistTelemetryToFile(entry)), preferred_sink: "supabase_table", fallback_reason: result.reason || fallback.reason || "unavailable" }
  }
  if (telemetrySink === "supabase_state") {
    const result = await persistTelemetryToSupabaseState(entry)
    if (result.persisted) return result
    return persistTelemetryToFile(entry)
  }
  if (telemetrySink === "supabase_auto") {
    try {
      const tableResult = await persistTelemetryToSupabaseTable(entry)
      if (tableResult.persisted) return { ...tableResult, preferred_sink: "supabase_table" }
      const stateResult = await persistTelemetryToSupabaseState(entry)
      if (stateResult.persisted) return { ...stateResult, preferred_sink: "supabase_table", fallback_reason: tableResult.reason || "unavailable" }
    } catch {
      // Fall through to file.
    }
    return { ...(await persistTelemetryToFile(entry)), preferred_sink: "supabase_table", fallback_reason: "unavailable" }
  }
  if (telemetrySink === "file") {
    return persistTelemetryToFile(entry)
  }
  try {
    const tableResult = await persistTelemetryToSupabaseTable(entry)
    if (tableResult.persisted) return { ...tableResult, preferred_sink: "supabase_table" }
    const stateResult = await persistTelemetryToSupabaseState(entry)
    if (stateResult.persisted) return { ...stateResult, preferred_sink: "supabase_table", fallback_reason: tableResult.reason || "unavailable" }
  } catch {
    // Fall through to file.
  }
  return { ...(await persistTelemetryToFile(entry)), preferred_sink: "supabase_table", fallback_reason: "unavailable" }
}

function queueInternalTelemetry(type, payload = {}, level = "info") {
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    type,
    level,
    app_version: runtimeAppVersion,
    commit_sha: runtimeCommitSha,
    deployment_id: deploymentId,
    deployed_at: deployedAt,
    payload: {
      origin: "server",
      app_version: runtimeAppVersion,
      commit_sha: runtimeCommitSha,
      ...(deploymentId ? { deployment_id: deploymentId } : {}),
      ...(deployedAt ? { deployed_at: deployedAt } : {}),
      ...payload,
    },
    user_id: null,
    ip: "",
    user_agent: "",
  }
  void persistTelemetryEntry(entry).catch(() => {})
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
        macro_confidence: "high",
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

// ─── Route Handlers ──────────────────────────────────────────────────────────

async function handleCoach(request, response) {
  const user = await verifyRequestAuth(request)
  const startedAt = Date.now()
  let body = {}
  let contextualRecentMessages = []
  let recalledMessages = []
  let mealContext = null
  let workoutContext = null
  let candidateFoodMatches = {}
  let incomingAuditMeta = normalizeIncomingAuditMeta()
  let stateBefore = sanitizeCoachStateSnapshot({})

  // -- Audit helper: queues a record without blocking the response --
    const queueAuditRecord = (record) => {
    if (!auditCapabilities.writable || !user?.id) return
    void persistCoachAuditRecord(adminSupabase, user, record).catch((error) => {
      console.warn(`Coach audit logging failed: ${error instanceof Error ? error.message : "unknown error"}`)
    })
  }

  try {
    body = await readRequestBody(request)
    validateCoachBody(body)
    incomingAuditMeta = normalizeIncomingAuditMeta(body.auditMeta)
    stateBefore = sanitizeCoachStateSnapshot({
      meal_session: body.mealSession || null,
      workout_session: body.workoutSession || null,
    })

    contextualRecentMessages = normalizeRecentMessages(body.recentMessages, body.message, 18)
    recalledMessages = normalizeRecalledMessages(body.recalledMessages, 8)
    if (recalledMessages.length) {
      contextualRecentMessages = mergeRecalledCoachMessages(contextualRecentMessages, recalledMessages, 24)
    }

    const coachState = buildCoachSessionState({
      recentMessages: contextualRecentMessages,
      currentMessage: body.message,
      mealSession: body.mealSession || null,
      workoutSession: body.workoutSession || null,
      recentMeals: safeArray(body.meals, 12),
    })
    const rawMealContext = coachState.mealSession
    workoutContext = coachState.workoutSession
    mealContext = rawMealContext
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

    candidateFoodMatches = {}
    const directFoodMacroQuery = extractFoodMacroLookupTerm(body.message)
    const candidateFoodTerms = mealContext
      ? (directFoodMacroQuery ? [directFoodMacroQuery] : buildMealCandidateFoodTerms(mealContext))
      : shouldHydrateCoachFoodMatches(body.message, [...recalledMessages, ...contextualRecentMessages])
        ? buildCoachCandidateFoodTerms(body.message, [...recalledMessages, ...contextualRecentMessages])
        : []
    if (candidateFoodTerms.length) {
      const foodLookups = await Promise.all(candidateFoodTerms.map(async (term) => [term, (await lookupFoodsBroad(term)).slice(0, 6)]))
      for (const [term, matches] of foodLookups) {
        candidateFoodMatches[term] = matches
      }
    }

    // -- Response helper: finalises payload, queues audit record, sends JSON --
    let canonicalMealActionsForPayload = []
    const sendCoachPayload = (payload, routeType) => {
      const finalPayload = finalizeCoachPayload(payload, {
        canonicalMealActions: canonicalMealActionsForPayload,
      })
      const auditRecord = {
        ...incomingAuditMeta,
        created_at: new Date().toISOString(),
        user_id: user?.id || "",
        user_email: user?.email || "",
        user_message: body.message,
        assistant_reply: finalPayload.reply,
        intent: detectCoachAuditIntent({
          message: body.message,
          mealContext,
          workoutContext,
          routeType,
          actions: finalPayload.actions || [],
        }),
        route_type: routeType,
        state_before: stateBefore,
        state_after: sanitizeCoachStateSnapshot({
          meal_session: finalPayload.meal_session || mealContext,
          workout_session: finalPayload.workout_session || workoutContext,
        }),
        conversation_window: buildCoachConversationWindow(contextualRecentMessages, body.message, finalPayload.reply),
        actions: finalPayload.actions || [],
        persisted_actions: [],
        persistence_status: (finalPayload.actions || []).some(isPersistenceAction)
          ? "pending_client"
          : mealContext?.alreadyLogged || workoutContext?.alreadyLogged
            ? "already_logged"
            : mealContext?.suppressed || workoutContext?.suppressed
              ? "suppressed"
              : "not_requested",
        clarification_asked: (finalPayload.actions || []).some((action) => action?.type === "clarify"),
        duplicate_prevention_triggered: false,
        draft_preserved_after_failure: null,
        latency_ms: Date.now() - startedAt,
        warnings: finalPayload.warnings || [],
        error_summary: "",
        model_used: routeType === "ai-assisted" ? model : "",
      }

      queueAuditRecord(auditRecord)
      sendJson(response, 200, {
        ...finalPayload,
        ...(auditCapabilities.enabled ? { audit_meta: buildCoachAuditResponseMeta(auditRecord) } : {}),
      }, requestResponseOrigin(request))
    }

    // -- Deterministic routing: no-client and offline-deterministic early exits --
    const mealDeleteAction = buildDeterministicMealDeletionAction(mealContext)
    const workoutDeleteAction = buildDeterministicWorkoutDeletionAction(workoutContext)
    const mealHasPendingWork = Boolean(
      mealContext
      && !mealContext.alreadyLogged
      && (mealContext.deleteRequested || mealContext.suppressed || mealContext.readyToLog || mealContext.clarifyQuestion || mealContext.correctionRequested)
    )
    const workoutHasPendingWork = Boolean(
      workoutContext
      && !workoutContext.alreadyLogged
      && (workoutContext.deleteRequested || workoutContext.suppressed || workoutContext.readyToLog || workoutContext.clarifyQuestion || workoutContext.correctionRequested)
    )
    const mealAlreadyLoggedGuard = Boolean(mealContext?.alreadyLogged && !workoutHasPendingWork)
    const workoutAlreadyLoggedGuard = Boolean(workoutContext?.alreadyLogged && !mealHasPendingWork)
    const mealSuppressedGuard = Boolean(mealContext?.suppressed)
    const workoutSuppressedGuard = Boolean(workoutContext?.suppressed)

    if (!client && mealDeleteAction) {
      sendCoachPayload({
        reply: summarizeCoachAction(mealDeleteAction),
        actions: [mealDeleteAction],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      }, "deterministic")
      return
    }

    if (!client && workoutDeleteAction) {
      sendCoachPayload({
        reply: summarizeCoachAction(workoutDeleteAction),
        actions: [workoutDeleteAction],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      }, "deterministic")
      return
    }

    if (!client && mealAlreadyLoggedGuard) {
      sendCoachPayload({
        reply: deterministicAlreadyLoggedReply(mealContext, "meal"),
        actions: [],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      }, "deterministic")
      return
    }

    if (!client && mealSuppressedGuard) {
      sendCoachPayload({
        reply: mealContext.suppressionReply || "Okay, I won't save that.",
        actions: [],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      }, "deterministic")
      return
    }

    if (!client && workoutAlreadyLoggedGuard) {
      sendCoachPayload({
        reply: deterministicAlreadyLoggedReply(workoutContext, "workout"),
        actions: [],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      }, "deterministic")
      return
    }

    if (!client && workoutSuppressedGuard) {
      sendCoachPayload({
        reply: workoutContext.suppressionReply || "Okay, I won't save that.",
        actions: [],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      }, "deterministic")
      return
    }

    const mealActions = mealContext?.readyToLog
      ? buildDeterministicMealActions({
          mealSession: mealContext,
          explicitActions: [],
          prompt: body.message,
          candidateFoodMatches,
          allowAnswerOnly: mealContext?.answerOnly,
        })
      : []
    const answerOnlyMealHint = mealContext?.answerOnly ? mealActions[0] || null : null
    const workoutActions = buildDeterministicWorkoutActions({ workoutSession: workoutContext, explicitActions: [] })
    const workoutAction = workoutActions[0] || null
    const mealClarifyAction = deterministicClarifyActionFromSession(mealContext)
    const workoutClarifyAction = deterministicClarifyActionFromSession(workoutContext)
    const explicitMixedLogRequest = /\b(?:log|save|track|add)\s+all\s+that\b/i.test(String(body.message || ""))
    const impliedMixedLogRequest = Boolean(
      mealContext?.intentGraph?.hasMixedDomains
      && (workoutActions.length || workoutClarifyAction)
      && (mealContext?.intentGraph?.loggingIntent || explicitMixedLogRequest)
    )
    const mixedMealEstimateActions = (
      (explicitMixedLogRequest || impliedMixedLogRequest)
      && mealContext
      && !mealContext.readyToLog
      && !mealContext.answerOnly
      && !mealContext.persistedMealId
      && (workoutActions.length || workoutClarifyAction)
    )
      ? buildDeterministicMealActions({
          mealSession: mealContext,
          explicitActions: [],
          prompt: body.message,
          candidateFoodMatches,
          allowLooseEstimate: true,
        })
      : []
    canonicalMealActionsForPayload = [...mealActions, ...mixedMealEstimateActions]
    if (!client && mealContext?.readyToLog && mealContext?.answerOnly && mealActions[0] && !workoutActions.length) {
      sendCoachPayload({
        reply: formatDeterministicMealAnswer(mealActions[0]),
        actions: [],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      }, "deterministic")
      return
    }
    const mealClarifyHint = (mealDeleteAction || mealSuppressedGuard || mealAlreadyLoggedGuard || mixedMealEstimateActions.length) ? null : mealClarifyAction
    const workoutClarifyHint = (workoutDeleteAction || workoutSuppressedGuard || workoutAlreadyLoggedGuard) ? null : workoutClarifyAction
    const validatedActions = [mealDeleteAction, workoutDeleteAction].filter(Boolean)
    const candidatePersistenceActions = [
      ...((mealContext?.answerOnly || mealDeleteAction || mealSuppressedGuard || mealAlreadyLoggedGuard) ? [] : mealActions),
      ...((mealDeleteAction || mealSuppressedGuard || mealAlreadyLoggedGuard) ? [] : mixedMealEstimateActions),
      ...((workoutDeleteAction || workoutSuppressedGuard || workoutAlreadyLoggedGuard) ? [] : workoutActions),
    ]
    const offlineDeterministicActions = [
      ...validatedActions,
      ...candidatePersistenceActions,
      ...[mealClarifyHint, workoutClarifyHint].filter(Boolean),
    ]
    const nutritionStatusReply = buildDeterministicNutritionStatusReply({
      message: body.message,
      coachContext: body.coachContext || {},
      profile: body.profile || {},
      recentMeals: safeArray(body.meals, 24),
    })
    const foodMacroReply = buildDeterministicFoodMacroReply({
      message: body.message,
    })
    if (!mealClarifyHint && !workoutClarifyHint) {
      if (offlineDeterministicActions.length && !client) {
        sendCoachPayload({
          reply: offlineDeterministicActions.map((action) => summarizeCoachAction(action)).filter(Boolean).join(" "),
          actions: offlineDeterministicActions,
          warnings: [],
          meal_session: mealContext,
          workout_session: workoutContext,
        }, "deterministic")
        return
      }
    }

    if (nutritionStatusReply && !client) {
      sendCoachPayload({
        reply: nutritionStatusReply,
        actions: [],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      }, "deterministic")
      return
    }

    if (foodMacroReply && !client) {
      sendCoachPayload({
        reply: foodMacroReply,
        actions: [],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      }, "deterministic")
      return
    }

    if (!client) {
      if (mealClarifyHint) {
        sendCoachPayload({
          reply: mealClarifyHint.message || "I need a bit more detail before I can log that meal.",
          actions: [mealClarifyHint],
          warnings: [],
          meal_session: mealContext,
          workout_session: workoutContext,
        }, "deterministic")
        return
      }

      if (workoutClarifyHint) {
        sendCoachPayload({
          reply: workoutClarifyHint.message,
          actions: [workoutClarifyHint],
          warnings: [],
          meal_session: mealContext,
          workout_session: workoutContext,
        }, "deterministic")
        return
      }

      sendCoachPayload({
        reply: buildOfflineCoachFallbackReply(body.message, recalledMessages),
        actions: [],
        warnings: [],
        meal_session: mealContext,
        workout_session: workoutContext,
      }, "fallback")
      return
    }

    // -- AI path: build payload, call GPT-4o, normalise response --
    const aiValidatedActions = validatedActions
    const aiCanonicalPersistenceActions = candidatePersistenceActions
    const payload = {
      current_date: new Date().toISOString().slice(0, 10),
      user_message: String(body.message || ""),
      profile: body.profile || {},
      coach_context: body.coachContext || {},
      recent_messages: contextualRecentMessages,
      recalled_messages: recalledMessages,
      previous_meal_session: body.mealSession || null,
      previous_workout_session: body.workoutSession || null,
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
      validated_actions: aiValidatedActions,
      candidate_persistence_actions: [],
      candidate_fragments: {
        meal: mealContext?.candidateFragments?.meal || [],
        workout: mealContext?.candidateFragments?.workout || workoutContext?.candidateFragments?.workout || [],
        has_mixed_domains: Boolean(
          (mealContext?.intentGraph || workoutContext?.intentGraph)?.hasMixedDomains
        ),
      },
      response_hints: {
        nutrition_status_hint: nutritionStatusReply || "",
        answer_only: Boolean(mealContext?.answerOnly),
        answer_only_meal_hint: answerOnlyMealHint,
        validated_action_types: aiValidatedActions.map((action) => action?.type).filter(Boolean),
        candidate_persistence_action_types: [],
        clarify_hints: {
          meal: String(mealClarifyHint?.message || ""),
          workout: String(workoutClarifyHint?.message || ""),
        },
        already_logged: {
          meal: mealAlreadyLoggedGuard
            ? {
                reply_hint: deterministicAlreadyLoggedReply(mealContext, "meal"),
                summary: String(mealContext?.persistedSummary || mealContext?.summary || ""),
              }
            : null,
          workout: workoutAlreadyLoggedGuard
            ? {
                reply_hint: deterministicAlreadyLoggedReply(workoutContext, "workout"),
                summary: String(workoutContext?.persistedSummary || workoutContext?.summary || ""),
              }
            : null,
        },
        suppression_hint: {
          meal: mealSuppressedGuard ? (mealContext?.suppressionReply || "Okay, I won't save that.") : "",
          workout: workoutSuppressedGuard ? (workoutContext?.suppressionReply || "Okay, I won't save that.") : "",
        },
        delete_hint: [mealDeleteAction, workoutDeleteAction].filter(Boolean).map((action) => summarizeCoachAction(action)),
      },
    }

    try {
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
      sendCoachPayload({
        ...normalizeCoachResponse(parsed, {
          prompt: body.message,
          recentMessages: contextualRecentMessages,
          recalledMessages,
          recentMeals: safeArray(body.meals, 12),
          recentWorkouts: safeArray(body.workouts, 12),
          mealContext,
          workoutContext,
          nutritionStatusReply,
          validatedActions: aiValidatedActions,
          canonicalPersistenceActions: aiCanonicalPersistenceActions,
          preferAIFirst: true,
          strictAIFirst: true,
          responseHints: payload.response_hints,
        }),
        meal_session: mealContext,
        workout_session: workoutContext,
      }, "ai-assisted")
    } catch (aiError) {
      const fallback = buildDeterministicFallbackPayload({
        offlineDeterministicActions,
        nutritionStatusReply,
        foodMacroReply,
        mealClarifyHint,
        workoutClarifyHint,
        mealContext,
        workoutContext,
        mealAlreadyLoggedGuard,
        workoutAlreadyLoggedGuard,
        mealSuppressedGuard,
        workoutSuppressedGuard,
        recalledMessages,
        body,
      })
      sendCoachPayload(fallback.payload, fallback.routeType)
    }
    return
  // -- Outer error handler: records failed turns to audit log --
  } catch (error) {
    if (auditCapabilities.writable && user?.id) {
      const failureRecord = {
        ...incomingAuditMeta,
        created_at: new Date().toISOString(),
        user_id: user.id,
        user_email: user.email || "",
        user_message: body?.message || "",
        assistant_reply: "",
        intent: detectCoachAuditIntent({
          message: body?.message || "",
          mealContext,
          workoutContext,
          routeType: "failed",
        }),
        route_type: "failed",
        state_before: stateBefore,
        state_after: sanitizeCoachStateSnapshot({
          meal_session: mealContext,
          workout_session: workoutContext,
        }),
        conversation_window: buildCoachConversationWindow(contextualRecentMessages, body?.message || "", ""),
        actions: [],
        persisted_actions: [],
        persistence_status: "failed_before_persistence",
        clarification_asked: false,
        duplicate_prevention_triggered: false,
        draft_preserved_after_failure: null,
        latency_ms: Date.now() - startedAt,
        warnings: [],
        error_summary: error instanceof Error ? error.message : "Coach request failed",
        model_used: "",
      }
      error.auditMeta = buildCoachAuditResponseMeta(failureRecord)
      queueAuditRecord(failureRecord)
    }
    throw error
  }
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
    source_type: food.source_type || "curated_au_catalogue",
    macro_confidence: food.macro_confidence || "high",
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

  const localResults = searchBestFoodMatches(query).map(verifiedNutritionResult)
  const barcodeResults = looksLikeBarcode(normalizedQuery) ? await searchOpenFoodFactsByBarcode(normalizedQuery) : []
  const shouldSkipExternal = hasStrongLocalNutritionMatch(query, localResults) || localResults.length >= 4
  const auResults = shouldSkipExternal ? [] : filterExternalNutritionResults(query, await searchOpenFoodFacts(query, { australiaOnly: true }))
  const globalResults = shouldSkipExternal || auResults.length || localResults.length >= 2
    ? []
    : filterExternalNutritionResults(query, await searchOpenFoodFacts(query, { australiaOnly: false }))

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

async function lookupFoodsForPhoto(query) {
  const normalizedQuery = String(query || "").trim()
  if (!normalizedQuery) return []

  const cacheKey = `photo:${cleanLookupText(normalizedQuery)}`
  const cached = readFoodLookupCache(cacheKey)
  if (cached) return cached

  const results = searchPhotoReferenceFoods(query).map(verifiedNutritionResult)
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
  const top = results[0] || null
  queueInternalTelemetry("nutrition_search_completed", {
    query_kind: looksLikeBarcode(query) ? "barcode" : "text",
    query_key: looksLikeBarcode(query)
      ? `barcode:${String(query).replace(/\D/g, "").slice(-4)}`
      : cleanLookupText(query).slice(0, 64),
    result_count: results.length,
    top_name: String(top?.name || "").slice(0, 96),
    top_source_type: String(top?.source_type || ""),
    top_macro_confidence: String(top?.macro_confidence || ""),
    top_estimated: Boolean(top?.estimated || String(top?.source_type || "").trim().toLowerCase() === "estimated_internal_profile"),
    top_category: String(top?.category || ""),
    lookup_path: looksLikeBarcode(query)
      ? (top ? "barcode_lookup" : "barcode_miss")
      : (top ? (String(top?.source_type || "").trim().toLowerCase().includes("catalogue") ? "local_catalogue" : "external_or_estimate") : "no_match"),
  }, results.length ? "info" : "warn")
  sendJson(response, 200, { results }, requestResponseOrigin(request))
}

async function handleNutritionPhoto(request, response) {
  await verifyRequestAuth(request)
  const body = await readRequestBody(request, photoRequestBodyLimitBytes)
  validateNutritionPhotoBody(body)

  if (!visionClient) {
    throw createHttpError(503, "Photo analysis is unavailable right now.", {
      expose: true,
      logMessage: "OPENAI_VISION_API_KEY or OPENAI_API_KEY is not set for nutrition photo analysis",
    })
  }

  const payload = {
    locale: String(body.locale || "AU").trim() || "AU",
    meal_type: String(body.mealType || "").trim(),
  }
  const normalizedImageDataUrl = await normalizeVisionImageDataUrl(String(body.imageDataUrl || ""))

  let completion
  try {
    completion = await createVisionCompletion({
      model: visionModel,
      max_completion_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: nutritionPhotoInstructions },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify(payload),
            },
            {
              type: "image_url",
              image_url: {
                url: normalizedImageDataUrl,
                detail: "low",
              },
            },
          ],
        },
      ],
    })
  } catch (error) {
    const details = providerErrorText(error)
    if (isVisionQuotaExhausted(error)) {
      throw createHttpError(503, "Photo analysis is temporarily unavailable because the AI vision quota is exhausted. Try barcode or manual search for now.", {
        expose: true,
        logMessage: `Photo analysis upstream quota exhausted: ${details || "insufficient_quota"}`,
      })
    }
    if (isVisionTemporarilyBusy(error)) {
      const sharedCapacityMessage = process.env.OPENAI_VISION_API_KEY
        ? "Photo analysis is busy right now. Try again in a moment or use barcode or manual search."
        : "Photo analysis is temporarily unavailable on this deployment because shared AI vision capacity is exhausted. Try again later or use barcode or manual search."
      throw createHttpError(503, sharedCapacityMessage, {
        expose: true,
        logMessage: `Photo analysis upstream limit: ${details || "429"}`,
      })
    }
    if (isVisionTransientUpstreamError(error)) {
      throw createHttpError(503, "Photo analysis is temporarily unavailable right now. Try again in a moment or use barcode or manual search.", {
        expose: true,
        logMessage: `Photo analysis transient upstream failure: ${details || "vision transient upstream error"}`,
      })
    }
    throw error
  }

  const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}")
  const estimatedMeal = await buildFoodPhotoEstimate(parsed, {
    mealType: payload.meal_type,
    lookupFoods: async (term) => (await lookupFoodsForPhoto(term)).slice(0, 6),
  })

  const action = estimatedMeal.action
  const responseBody = {
    summary: estimatedMeal.analysis.summary,
    portion: estimatedMeal.analysis.portion,
    food_name: action?.food_name || estimatedMeal.analysis.summary,
    quantity: action?.quantity || estimatedMeal.analysis.portion,
    estimated: true,
    nutrition_source: action?.nutrition_source || estimatedMeal.nutrition_source || "AI plate-photo estimate",
    nutrition_source_type: action?.nutrition_source_type || "photo_ai_estimate",
    identified_items: estimatedMeal.breakdown,
    macro_confidence: estimatedMeal.macro_confidence,
    has_trusted_macros: Boolean(action),
    can_autofill: Boolean(estimatedMeal.can_autofill),
    needs_review: estimatedMeal.needs_review,
    clarification_question: estimatedMeal.clarification_question,
    assumptions: estimatedMeal.assumptions,
    calories: Number(action?.calories ?? estimatedMeal.calories ?? 0),
    protein_g: Number(action?.protein_g ?? estimatedMeal.protein_g ?? 0),
    carbs_g: Number(action?.carbs_g ?? estimatedMeal.carbs_g ?? 0),
    fat_g: Number(action?.fat_g ?? estimatedMeal.fat_g ?? 0),
    review_reason: String(estimatedMeal.review_reason || ""),
    review_reasons: Array.isArray(estimatedMeal.review_reasons) ? estimatedMeal.review_reasons : [],
    macro_breakdown: Array.isArray(action?.macro_breakdown)
      ? action.macro_breakdown
      : (Array.isArray(estimatedMeal.breakdown) ? estimatedMeal.breakdown : []),
  }

  queueInternalTelemetry("nutrition_photo_completed", {
    item_count: Array.isArray(estimatedMeal.breakdown) ? estimatedMeal.breakdown.length : 0,
    can_autofill: Boolean(estimatedMeal.can_autofill),
    needs_review: Boolean(estimatedMeal.needs_review),
    macro_confidence: String(estimatedMeal.macro_confidence || ""),
    source_type: String(responseBody.nutrition_source_type || ""),
    review_reason: String(responseBody.review_reason || ""),
    review_reasons: Array.isArray(responseBody.review_reasons) ? responseBody.review_reasons : [],
  }, estimatedMeal.needs_review ? "warn" : "info")
  sendJson(response, 200, responseBody, requestResponseOrigin(request))
}

async function handleNutritionPhotoReview(request, response) {
  await verifyRequestAuth(request)
  const body = await readRequestBody(request)
  validateNutritionPhotoReviewBody(body)

  const estimatedMeal = await buildReviewedFoodPhotoEstimate({
    summary: body.summary,
    portion: body.portion,
    items: body.items,
  }, {
    mealType: String(body.mealType || "").trim(),
    lookupFoods: async (term) => (await lookupFoodsForPhoto(term)).slice(0, 6),
  })

  const action = estimatedMeal.action
  const responseBody = {
    summary: estimatedMeal.analysis.summary,
    portion: estimatedMeal.analysis.portion,
    food_name: action?.food_name || estimatedMeal.analysis.summary,
    quantity: action?.quantity || estimatedMeal.analysis.portion,
    estimated: true,
    nutrition_source: action?.nutrition_source || estimatedMeal.nutrition_source || "AI plate-photo estimate",
    nutrition_source_type: action?.nutrition_source_type || "photo_ai_estimate",
    identified_items: estimatedMeal.breakdown,
    macro_confidence: estimatedMeal.macro_confidence,
    has_trusted_macros: Boolean(action),
    can_autofill: true,
    needs_review: false,
    clarification_question: "",
    assumptions: estimatedMeal.assumptions,
    calories: Number(action?.calories ?? estimatedMeal.calories ?? 0),
    protein_g: Number(action?.protein_g ?? estimatedMeal.protein_g ?? 0),
    carbs_g: Number(action?.carbs_g ?? estimatedMeal.carbs_g ?? 0),
    fat_g: Number(action?.fat_g ?? estimatedMeal.fat_g ?? 0),
    review_reason: String(estimatedMeal.review_reason || ""),
    review_reasons: Array.isArray(estimatedMeal.review_reasons) ? estimatedMeal.review_reasons : [],
    macro_breakdown: Array.isArray(action?.macro_breakdown)
      ? action.macro_breakdown
      : (Array.isArray(estimatedMeal.breakdown) ? estimatedMeal.breakdown : []),
  }

  queueInternalTelemetry("nutrition_photo_review_completed", {
    item_count: Array.isArray(estimatedMeal.breakdown) ? estimatedMeal.breakdown.length : 0,
    macro_confidence: String(estimatedMeal.macro_confidence || ""),
    source_type: String(responseBody.nutrition_source_type || ""),
    review_reason: String(responseBody.review_reason || ""),
    review_reasons: Array.isArray(responseBody.review_reasons) ? responseBody.review_reasons : [],
  })
  sendJson(response, 200, responseBody, requestResponseOrigin(request))
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
    app_version: runtimeAppVersion,
    commit_sha: runtimeCommitSha,
    deployment_id: deploymentId,
    deployed_at: deployedAt,
    payload: {
      ...(body.payload || {}),
      app_version: String(body.payload?.app_version || runtimeAppVersion).trim(),
      commit_sha: String(body.payload?.commit_sha || runtimeCommitSha).trim(),
      ...(String(body.payload?.deployment_id || deploymentId).trim()
        ? { deployment_id: String(body.payload?.deployment_id || deploymentId).trim() }
        : {}),
      ...(String(body.payload?.deployed_at || deployedAt).trim()
        ? { deployed_at: String(body.payload?.deployed_at || deployedAt).trim() }
        : {}),
    },
    user_id: user?.id || null,
    ip: requestIp(request),
    user_agent: String(request.headers["user-agent"] || ""),
  }

  const persistence = await persistTelemetryEntry(entry)
  sendJson(response, 202, {
    accepted: true,
    sink: persistence.sink,
    preferredSink: persistence.preferred_sink || persistence.sink,
    fallbackReason: persistence.fallback_reason || null,
  }, requestResponseOrigin(request))
}

async function handleCoachAuditEvent(request, response) {
  const user = await verifyBearerUser(request)
  const body = await readRequestBody(request)
  validateCoachAuditEventBody(body)

  if (!auditCapabilities.enabled || !auditCapabilities.writable) {
    sendJson(response, 202, { accepted: false, disabled: true }, requestResponseOrigin(request))
    return
  }

  const normalized = normalizeAuditClientPatch(body, user)
  const stored = await persistCoachAuditRecord(adminSupabase, user, normalized)
  sendJson(response, 202, {
    accepted: true,
    stored: Boolean(stored),
    audit_meta: stored ? buildCoachAuditResponseMeta(stored) : buildCoachAuditResponseMeta(normalized),
  }, requestResponseOrigin(request))
}

async function handleCoachAuditList(request, response) {
  if (!auditCapabilities.enabled || !auditCapabilities.writable) {
    throw createHttpError(404, "Coach audit is not enabled for this environment.")
  }

  const user = await verifyBearerUser(request)
  if (!isCoachAuditAdminUser(user)) {
    throw createHttpError(403, "Coach audit is restricted to admin testers.")
  }

  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`)
  const filters = {
    limit: url.searchParams.get("limit") || "120",
    user: url.searchParams.get("user") || "",
    route_type: url.searchParams.get("route_type") || "",
    date_from: url.searchParams.get("date_from") || "",
    date_to: url.searchParams.get("date_to") || "",
    created_after: url.searchParams.get("created_after") || "",
    created_before: url.searchParams.get("created_before") || "",
    commit_sha: url.searchParams.get("commit_sha") || "",
    failed: url.searchParams.get("failed") || "",
    warnings: url.searchParams.get("warnings") || "",
    flag: url.searchParams.get("flag") || "",
    search: url.searchParams.get("search") || "",
  }

  const records = await listCoachAuditRecords(adminSupabase, filters)
  sendJson(response, 200, {
    records,
    summary: summarizeCoachAuditRecords(records),
    capabilities: auditCapabilities,
  }, requestResponseOrigin(request))
}

// ─── Server Bootstrap ────────────────────────────────────────────────────────

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
    sendJson(response, 200, {
      ok: true,
      appVersion: runtimeAppVersion,
      commitSha: runtimeCommitSha,
      deploymentId: deploymentId || null,
      deployedAt: deployedAt || null,
      model,
      visionModel,
      openaiConfigured: Boolean(client),
      openaiVisionConfigured: Boolean(visionClient),
      openaiVisionUsesDedicatedKey: Boolean(process.env.OPENAI_VISION_API_KEY),
      authRequired: requireAuth,
      supabaseConfigured: Boolean(serverSupabase),
      adminConfigured: Boolean(adminSupabase),
      coachAuditEnabled: auditCapabilities.enabled,
      telemetrySink,
      telemetryTableName,
      corsOrigins: configuredCorsOrigins,
    }, requestResponseOrigin(request))
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

  if (request.method === "POST" && request.url === "/api/coach/audit/event") {
    try {
      checkRateLimit(request)
      await handleCoachAuditEvent(request, response)
      logRequest(request, 202, "handler=coach-audit-event")
    } catch (error) {
      const status = error.status || 500
      logRequest(request, status, "handler=coach-audit-event")
      sendError(response, request, error, "Coach audit event failed.")
    }
    return
  }

  if (request.method === "GET" && request.url.startsWith("/api/coach/audit")) {
    try {
      checkRateLimit(request)
      await handleCoachAuditList(request, response)
      logRequest(request, 200, "handler=coach-audit-list")
    } catch (error) {
      const status = error.status || 500
      logRequest(request, status, "handler=coach-audit-list")
      sendError(response, request, error, "Coach audit is unavailable right now.")
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

  if (request.method === "POST" && request.url === "/api/nutrition/analyze-photo") {
    try {
      checkRateLimit(request)
      await handleNutritionPhoto(request, response)
      logRequest(request, 200, "handler=nutrition-photo")
    } catch (error) {
      const status = error.status || 500
      logRequest(request, status, "handler=nutrition-photo")
      sendError(response, request, error, "Photo nutrition analysis is unavailable right now.")
    }
    return
  }

  if (request.method === "POST" && request.url === "/api/nutrition/review-photo-estimate") {
    try {
      checkRateLimit(request)
      await handleNutritionPhotoReview(request, response)
      logRequest(request, 200, "handler=nutrition-photo-review")
    } catch (error) {
      const status = error.status || 500
      logRequest(request, status, "handler=nutrition-photo-review")
      sendError(response, request, error, "Photo estimate review is unavailable right now.")
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
