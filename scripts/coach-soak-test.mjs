import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { spawn } from "node:child_process"
import { createClient } from "@supabase/supabase-js"
import { chromium, expect } from "@playwright/test"
import { buildCoachAuditFlags, detectCoachAuditIntent } from "../server/coachAudit.mjs"
import { replyClaimsPersistence } from "../server/coachLoggingRules.mjs"
import { emptyMealSessionState, emptyWorkoutSessionState } from "../server/coachSessionState.mjs"

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
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadDotEnvIntoProcess()

const runRoot = path.join(rootDir, "tmp", "coach-soak-runs")
const failureRoot = path.join(runRoot, "failures")
const localCoachPort = Number(process.env.COACH_SOAK_LOCAL_PORT || 8787)
const localPreviewPort = Number(process.env.COACH_SOAK_PREVIEW_PORT || 4174)
const target = String(process.env.COACH_SOAK_TARGET || "local").trim().toLowerCase()
const requiredStreak = Math.max(1, Number(process.env.COACH_SOAK_REQUIRED_STREAK || 10))
const mealCaseCount = Math.max(1, Number(process.env.COACH_SOAK_MEAL_CASES || 30))
const workoutCaseCount = Math.max(1, Number(process.env.COACH_SOAK_WORKOUT_CASES || 15))
const mixedCaseCount = Math.max(1, Number(process.env.COACH_SOAK_MIXED_CASES || 10))
const liveBaseUrl = String(process.env.COACH_SOAK_LIVE_BASE_URL || "https://apexai-bay.vercel.app").trim()
const liveCoachUrl = String(process.env.COACH_SOAK_LIVE_COACH_URL || "https://apexai-coach.onrender.com/api/coach").trim()
const liveRequestMinIntervalMs = Math.max(900, Number(process.env.COACH_SOAK_LIVE_MIN_INTERVAL_MS || 1500))
const liveSupabaseUrl = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim()
const liveSupabaseAnonKey = String(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim()
const liveSupabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
const soakProfile = {
  name: "Casey",
  goal: "fat_loss",
  gender: "other",
  age: 31,
  weight_kg: 84,
  height_cm: 178,
  target_weight_kg: 78,
  activity_level: "moderately_active",
  daily_calories: 2200,
  protein_g: 165,
  carbs_g: 220,
  fat_g: 70,
  split_type: "upper_lower",
  training_days_per_week: 4,
  onboarded: true,
  locale: "AU",
}

const storageKeys = {
  profile: "apexai.profile",
  meals: "apexai.meals",
  workouts: "apexai.workouts",
  workoutSets: "apexai.workoutSets",
  coachMealSession: "apexai.coachMealSession",
  coachWorkoutSession: "apexai.coachWorkoutSession",
  localMode: "apexai.localMode",
}

const foods = [
  "eggs",
  "chicken",
  "rice",
  "steak",
  "broccoli",
  "pasta",
  "pizza",
  "chips",
  "salad",
  "tofu",
  "pie",
  "cake",
  "burger",
  "fries",
]
const preps = ["fried", "grilled", "boiled", "roasted", "plain", "raw", "baked", "steamed"]
const additions = ["olive oil", "butter", "mayo", "gravy", "ketchup", "cheese", "aioli", "bbq sauce"]
const drinks = ["coffee", "tea", "protein shake", "beer", "latte", "milk", "almond milk", "cola"]
const workoutExercises = ["bench press", "back squat", "row", "deadlift", "push ups", "bike", "treadmill", "lunges"]
const conversationComplaints = [
  "i told you",
  "what do you mean?",
  "you asked and i gave you a number",
  "why can't you understand?",
]

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function cleanText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function responseClaimsPersistence(reply) {
  return replyClaimsPersistence(reply)
}

function responseIsConditionalPersistenceOffer(reply) {
  const text = cleanText(reply)
  if (!text) return false
  return /\bif you want (?:it|that|this) (?:saved|logged|tracked)\b/.test(text)
    || /\btell me to (?:log|save|track) (?:it|that|this)\b/.test(text)
    || /\bi can (?:log|save|track) (?:it|that|this) if you want\b/.test(text)
}

function sanitizeLabel(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
}

function createRng(seed) {
  let t = seed >>> 0
  return function rng() {
    t += 0x6d2b79f5
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min
}

function randomChoice(rng, list) {
  return list[Math.floor(rng() * list.length)]
}

function randomChance(rng, probability) {
  return rng() < probability
}

function createStore() {
  return {
    meals: [],
    workouts: [],
    workoutSets: [],
    nextMealNumber: 1,
    nextWorkoutNumber: 1,
    nextWorkoutSetNumber: 1,
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createConversationState() {
  return {
    recentMessages: [],
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  }
}

function createPersistedMealSession(session, action, mealId) {
  return {
    ...emptyMealSessionState(),
    ...(session && typeof session === "object" ? session : {}),
    active: false,
    readyToLog: false,
    shouldStopClarifying: false,
    clarifyQuestion: "",
    answerOnly: false,
    suppressed: false,
    suppressionReply: "",
    persisted: true,
    persistedMealId: mealId,
    persistedSummary: sanitizeLabel(action?.food_name || session?.summary || ""),
    persistedAt: new Date().toISOString(),
    alreadyLogged: false,
    correctionRequested: false,
    deleteRequested: false,
  }
}

function createPersistedWorkoutSession(session, action, workoutId) {
  return {
    ...emptyWorkoutSessionState(),
    ...(session && typeof session === "object" ? session : {}),
    active: false,
    readyToLog: false,
    shouldStopClarifying: false,
    clarifyQuestion: "",
    persisted: true,
    persistedWorkoutId: workoutId,
    persistedSummary: sanitizeLabel(session?.summary || action?.summary || action?.workout_type || action?.exercise_name || ""),
    persistedAt: new Date().toISOString(),
    alreadyLogged: false,
    correctionRequested: false,
    deleteRequested: false,
  }
}

function isPersistenceAction(action) {
  return [
    "log_meal",
    "update_meal_log",
    "delete_meal_log",
    "log_workout",
    "update_workout_log",
    "delete_workout_log",
  ].includes(String(action?.type || ""))
}

function isClarifyAction(action) {
  return String(action?.type || "") === "clarify"
}

function findMealById(store, mealId) {
  return store.meals.find((meal) => meal.id === mealId) || null
}

function findWorkoutById(store, workoutId) {
  return store.workouts.find((workout) => workout.id === workoutId) || null
}

function buildWorkoutSetRecords(store, action, workoutId) {
  const sets = Math.max(1, Number(action?.sets || 1))
  const reps = Math.max(0, Number(action?.reps || 0))
  const weightKg = Number(action?.weight_kg || 0)
  if (Number(action?.duration_seconds || 0) > 0) return []
  return Array.from({ length: sets }, (_, index) => ({
    id: `workout_set_${store.nextWorkoutSetNumber + index}`,
    workout_id: workoutId,
    exercise_name: sanitizeLabel(action?.exercise_name || action?.workout_type || "Workout"),
    set_number: index + 1,
    reps,
    weight_kg: weightKg,
    date: todayIso(),
  }))
}

function applyPersistenceActions({ store, conversationState, response, caseLabel }) {
  const persistedActions = []
  const mealSessionFromResponse = clone(response.meal_session || response.mealSession || conversationState.mealSession)
  const workoutSessionFromResponse = clone(response.workout_session || response.workoutSession || conversationState.workoutSession)
  let nextMealSession = mealSessionFromResponse
  let nextWorkoutSession = workoutSessionFromResponse

  for (const action of Array.isArray(response.actions) ? response.actions : []) {
    const type = String(action?.type || "")
    if (type === "log_meal") {
      const mealId = action.meal_id || `meal_${store.nextMealNumber++}`
      const mealRecord = {
        id: mealId,
        date: todayIso(),
        meal_type: String(action.meal_type || "snack"),
        food_name: sanitizeLabel(action.food_name),
        quantity: sanitizeLabel(action.quantity || "1 meal"),
        calories: Number(action.calories || 0),
        protein_g: Number(action.protein_g || 0),
        carbs_g: Number(action.carbs_g || 0),
        fat_g: Number(action.fat_g || 0),
        nutrition_source: sanitizeLabel(action.nutrition_source || ""),
        estimated: Boolean(action.estimated),
      }
      store.meals = [mealRecord, ...store.meals.filter((meal) => meal.id !== mealId)]
      persistedActions.push({ ...action, meal_id: mealId })
      nextMealSession = createPersistedMealSession(mealSessionFromResponse, action, mealId)
      continue
    }

    if (type === "update_meal_log") {
      const existing = findMealById(store, action.meal_id)
      if (!existing) {
        throw new Error(`[${caseLabel}] meal update referenced missing meal_id ${action.meal_id}`)
      }
      const updatedMeal = {
        ...existing,
        meal_type: String(action.meal_type || existing.meal_type || "snack"),
        food_name: sanitizeLabel(action.food_name || existing.food_name),
        quantity: sanitizeLabel(action.quantity || existing.quantity || "1 meal"),
        calories: Number(action.calories ?? existing.calories ?? 0),
        protein_g: Number(action.protein_g ?? existing.protein_g ?? 0),
        carbs_g: Number(action.carbs_g ?? existing.carbs_g ?? 0),
        fat_g: Number(action.fat_g ?? existing.fat_g ?? 0),
        nutrition_source: sanitizeLabel(action.nutrition_source || existing.nutrition_source || ""),
        estimated: action.estimated ?? existing.estimated ?? false,
      }
      store.meals = [updatedMeal, ...store.meals.filter((meal) => meal.id !== existing.id)]
      persistedActions.push({ ...action, meal_id: existing.id })
      nextMealSession = createPersistedMealSession(mealSessionFromResponse, updatedMeal, existing.id)
      continue
    }

    if (type === "delete_meal_log") {
      const existing = findMealById(store, action.meal_id)
      if (!existing) {
        throw new Error(`[${caseLabel}] meal delete referenced missing meal_id ${action.meal_id}`)
      }
      store.meals = store.meals.filter((meal) => meal.id !== existing.id)
      persistedActions.push({ ...action, meal_id: existing.id, food_name: existing.food_name })
      nextMealSession = emptyMealSessionState()
      continue
    }

    if (type === "log_workout") {
      const workoutId = action.workout_id || `workout_${store.nextWorkoutNumber++}`
      const workoutRecord = {
        id: workoutId,
        date: todayIso(),
        workout_type: sanitizeLabel(action.workout_type || action.exercise_name || "Workout"),
        exercise_name: sanitizeLabel(action.exercise_name || action.workout_type || "Workout"),
        muscle_group: sanitizeLabel(action.muscle_group || "full_body"),
        sets: Number(action.sets || 0),
        reps: Number(action.reps || 0),
        weight_kg: Number(action.weight_kg || 0),
        duration_seconds: Number(action.duration_seconds || 0),
        distance_km: Number(action.distance_km || 0),
      }
      const workoutSets = buildWorkoutSetRecords(store, action, workoutId)
      store.nextWorkoutSetNumber += workoutSets.length
      store.workouts = [workoutRecord, ...store.workouts.filter((workout) => workout.id !== workoutId)]
      store.workoutSets = [...workoutSets, ...store.workoutSets.filter((set) => set.workout_id !== workoutId)]
      persistedActions.push({ ...action, workout_id: workoutId })
      nextWorkoutSession = createPersistedWorkoutSession(workoutSessionFromResponse, action, workoutId)
      continue
    }

    if (type === "update_workout_log") {
      const existing = findWorkoutById(store, action.workout_id)
      if (!existing) {
        throw new Error(`[${caseLabel}] workout update referenced missing workout_id ${action.workout_id}`)
      }
      const updatedWorkout = {
        ...existing,
        workout_type: sanitizeLabel(action.workout_type || action.exercise_name || existing.workout_type || existing.exercise_name || "Workout"),
        exercise_name: sanitizeLabel(action.exercise_name || action.workout_type || existing.exercise_name || existing.workout_type || "Workout"),
        muscle_group: sanitizeLabel(action.muscle_group || existing.muscle_group || "full_body"),
        sets: Number(action.sets ?? existing.sets ?? 0),
        reps: Number(action.reps ?? existing.reps ?? 0),
        weight_kg: Number(action.weight_kg ?? existing.weight_kg ?? 0),
        duration_seconds: Number(action.duration_seconds ?? existing.duration_seconds ?? 0),
        distance_km: Number(action.distance_km ?? existing.distance_km ?? 0),
      }
      const workoutSets = buildWorkoutSetRecords(store, action, existing.id)
      store.nextWorkoutSetNumber += workoutSets.length
      store.workouts = [updatedWorkout, ...store.workouts.filter((workout) => workout.id !== existing.id)]
      store.workoutSets = [...workoutSets, ...store.workoutSets.filter((set) => set.workout_id !== existing.id)]
      persistedActions.push({ ...action, workout_id: existing.id })
      nextWorkoutSession = createPersistedWorkoutSession(workoutSessionFromResponse, updatedWorkout, existing.id)
      continue
    }

    if (type === "delete_workout_log") {
      const existing = findWorkoutById(store, action.workout_id)
      if (!existing) {
        throw new Error(`[${caseLabel}] workout delete referenced missing workout_id ${action.workout_id}`)
      }
      store.workouts = store.workouts.filter((workout) => workout.id !== existing.id)
      store.workoutSets = store.workoutSets.filter((set) => set.workout_id !== existing.id)
      persistedActions.push({ ...action, workout_id: existing.id, workout_type: existing.workout_type })
      nextWorkoutSession = emptyWorkoutSessionState()
    }
  }

  conversationState.mealSession = nextMealSession || conversationState.mealSession
  conversationState.workoutSession = nextWorkoutSession || conversationState.workoutSession
  return persistedActions
}

function buildCoachContext(store) {
  const todaysMeals = store.meals.filter((meal) => meal.date === todayIso())
  const todaysWorkouts = store.workouts.filter((workout) => workout.date === todayIso())
  const nutritionTotals = todaysMeals.reduce((totals, meal) => ({
    calories: totals.calories + Number(meal.calories || 0),
    protein_g: totals.protein_g + Number(meal.protein_g || 0),
    carbs_g: totals.carbs_g + Number(meal.carbs_g || 0),
    fat_g: totals.fat_g + Number(meal.fat_g || 0),
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })

  return {
    today: todayIso(),
    profile: {
      name: soakProfile.name,
      goal: soakProfile.goal,
      split_type: soakProfile.split_type,
      locale: soakProfile.locale,
      training_days_per_week: soakProfile.training_days_per_week,
      target_weight_kg: soakProfile.target_weight_kg,
      daily_calories: soakProfile.daily_calories,
      protein_g: soakProfile.protein_g,
      carbs_g: soakProfile.carbs_g,
      fat_g: soakProfile.fat_g,
    },
    nutrition_today: {
      calories_logged: Math.round(nutritionTotals.calories),
      protein_g_logged: Math.round(nutritionTotals.protein_g),
      carbs_g_logged: Math.round(nutritionTotals.carbs_g),
      fat_g_logged: Math.round(nutritionTotals.fat_g),
      calories_remaining: Math.max(0, Math.round(soakProfile.daily_calories - nutritionTotals.calories)),
      protein_g_remaining: Math.max(0, Math.round(soakProfile.protein_g - nutritionTotals.protein_g)),
      carbs_g_remaining: Math.max(0, Math.round(soakProfile.carbs_g - nutritionTotals.carbs_g)),
      fat_g_remaining: Math.max(0, Math.round(soakProfile.fat_g - nutritionTotals.fat_g)),
    },
    workout_today: {
      sessions_logged: todaysWorkouts.length,
      latest_session_title: todaysWorkouts[0]?.workout_type || "",
      active_session: null,
    },
    current_workout_plan: null,
    current_meal_plan: null,
    recovery: null,
    progression: null,
  }
}

async function requestLocalCoach(conversationState, store, message) {
  const recentMessages = conversationState.recentMessages.slice(-18)
  const body = {
    message,
    profile: soakProfile,
    coachContext: buildCoachContext(store),
    recentMessages,
    meals: store.meals,
    workouts: store.workouts,
    workoutSets: store.workoutSets,
    mealSession: conversationState.mealSession,
    workoutSession: conversationState.workoutSession,
  }
  const startedAt = Date.now()
  let lastResponse = null
  let lastPayload = {}
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${localCoachPort}/api/coach`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({}))
    lastResponse = response
    lastPayload = payload
    if (response.ok || response.status !== 503 || attempt === 1) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return {
    ok: lastResponse?.ok || false,
    status: lastResponse?.status || 0,
    latencyMs: Date.now() - startedAt,
    payload: lastPayload,
    requestBody: body,
  }
}

function requireLiveConfig() {
  if (!liveSupabaseUrl) throw new Error("VITE_SUPABASE_URL or SUPABASE_URL is required for live soak mode.")
  if (!liveSupabaseAnonKey) throw new Error("VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY is required for live soak mode.")
  if (!liveSupabaseServiceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for live soak mode.")
}

function createLiveSupabaseClients() {
  requireLiveConfig()
  return {
    authClient: createClient(liveSupabaseUrl, liveSupabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }),
    adminClient: createClient(liveSupabaseUrl, liveSupabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }),
  }
}

async function findSupabaseUserByEmail(adminClient, email) {
  const normalizedEmail = cleanText(email)
  let page = 1
  while (page <= 10) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const users = Array.isArray(data?.users) ? data.users : []
    const match = users.find((user) => cleanText(user?.email || "") === normalizedEmail)
    if (match) return match
    if (users.length < 200) break
    page += 1
  }
  return null
}

async function ensureLiveTestUser(live) {
  const customEmail = String(process.env.COACH_SOAK_LIVE_EMAIL || "").trim()
  const customPassword = String(process.env.COACH_SOAK_LIVE_PASSWORD || "").trim()
  const email = customEmail || "coach-soak-live@apexai.app"
  const password = customPassword || `CoachSoak!${Date.now()}Aa1`
  const usingManagedSoakUser = !customPassword

  const existingUser = await findSupabaseUserByEmail(live.adminClient, email)
  if (usingManagedSoakUser) {
    if (existingUser?.id) {
      const { error } = await live.adminClient.auth.admin.deleteUser(existingUser.id)
      if (error) throw error
    }
    const { data, error } = await live.adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Coach Soak" },
    })
    if (error) throw error
    live.userId = data?.user?.id || ""
  } else if (existingUser?.id) {
    const { error } = await live.adminClient.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(existingUser.user_metadata || {}),
        full_name: existingUser.user_metadata?.full_name || "Coach Soak",
      },
    })
    if (error) throw error
    live.userId = existingUser.id
  } else {
    const { data, error } = await live.adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Coach Soak" },
    })
    if (error) throw error
    live.userId = data?.user?.id || ""
  }

  live.email = email
  live.password = password
  return live
}

async function repairLiveAuthCredentials(live) {
  const email = String(live?.email || "").trim()
  const password = String(live?.password || "").trim()
  if (!email || !password) return false

  const existingUser = await findSupabaseUserByEmail(live.adminClient, email)
  if (existingUser?.id) {
    const { error } = await live.adminClient.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(existingUser.user_metadata || {}),
        full_name: existingUser.user_metadata?.full_name || "Coach Soak",
      },
    })
    if (error) throw error
    live.userId = existingUser.id
    return true
  }

  const { data, error } = await live.adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Coach Soak" },
  })
  if (error) throw error
  live.userId = data?.user?.id || ""
  return true
}

async function refreshLiveAuthToken(live) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await live.authClient.auth.signInWithPassword({
      email: live.email,
      password: live.password,
    })

    if (!error) {
      live.accessToken = String(data?.session?.access_token || "")
      live.refreshToken = String(data?.session?.refresh_token || "")
      live.userId = String(data?.user?.id || live.userId || "")
      if (!live.accessToken || !live.userId) {
        throw new Error("Live soak sign-in did not return a usable access token.")
      }
      return live.accessToken
    }

    const normalizedMessage = cleanText(error?.message || "")
    const canRepair = attempt === 0 && /invalid login credentials/.test(normalizedMessage)
    if (!canRepair) throw error

    const repaired = await repairLiveAuthCredentials(live)
    if (!repaired) throw error
  }

  throw new Error("Live soak sign-in did not return a usable access token.")
}

async function getLiveAuthToken(live) {
  if (live.accessToken) return live.accessToken
  return refreshLiveAuthToken(live)
}

async function resetLiveUserState(live) {
  if (!live.userId) await refreshLiveAuthToken(live)
  const { error } = await live.adminClient
    .from("user_app_state")
    .delete()
    .eq("user_id", live.userId)
  if (error) throw error
}

async function throttleLiveRequest(live) {
  const waitMs = Math.max(0, live.nextRequestAt - Date.now())
  if (waitMs > 0) await sleep(waitMs)
  live.nextRequestAt = Date.now() + liveRequestMinIntervalMs
}

async function requestLiveCoach(conversationState, store, message, live) {
  const recentMessages = conversationState.recentMessages.slice(-18)
  const body = {
    message,
    profile: soakProfile,
    coachContext: buildCoachContext(store),
    recentMessages,
    meals: store.meals,
    workouts: store.workouts,
    workoutSets: store.workoutSets,
    mealSession: conversationState.mealSession,
    workoutSession: conversationState.workoutSession,
  }
  const startedAt = Date.now()
  let lastResponse = null
  let lastPayload = {}
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await throttleLiveRequest(live)
    const token = await getLiveAuthToken(live)
    const response = await fetch(live.coachUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({}))
    lastResponse = response
    lastPayload = payload
    if (response.ok) break
    if (response.status === 401 && attempt < 4) {
      live.accessToken = ""
      live.refreshToken = ""
      await refreshLiveAuthToken(live)
      continue
    }
    if ((response.status === 429 || response.status === 502 || response.status === 503) && attempt < 4) {
      const retryAfterSeconds = Number(response.headers.get("retry-after") || 0)
      const retryDelayMs = retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : response.status === 429
          ? 45_000 + (attempt * 15_000)
          : 5_000 + (attempt * 5_000)
      await sleep(retryDelayMs)
      continue
    }
    break
  }
  return {
    ok: lastResponse?.ok || false,
    status: lastResponse?.status || 0,
    latencyMs: Date.now() - startedAt,
    payload: lastPayload,
    requestBody: body,
  }
}

async function verifyLiveRun() {
  return { consoleErrors: [], mode: "api-only" }
}

function buildLocalAuditEntry({
  message,
  reply,
  actions,
  persistedActions,
  stateBefore,
  stateAfter,
  conversationWindow,
  latencyMs,
  routeType,
  persistenceStatus,
  errorSummary = "",
}) {
  return {
    log_id: uid("soak_audit"),
    created_at: new Date().toISOString(),
    user_id: "soak_local_user",
    user_message: message,
    assistant_reply: reply,
    intent: detectCoachAuditIntent({
      message,
      mealContext: stateAfter.meal_session,
      workoutContext: stateAfter.workout_session,
      routeType,
      actions,
    }),
    route_type: routeType,
    state_before: stateBefore,
    state_after: stateAfter,
    conversation_window: conversationWindow,
    actions,
    persisted_actions: persistedActions,
    persistence_status: persistenceStatus,
    clarification_asked: actions.some(isClarifyAction),
    draft_preserved_after_failure: null,
    duplicate_prevention_triggered: false,
    latency_ms: latencyMs,
    warnings: [],
    error_summary: errorSummary,
    model_used: "local-deterministic",
  }
}

function classifyFlagAsFalsePositive(flag, entry) {
  if (flag.code === "user_signalled_repeat") {
    const hasStructuralFailure = buildCoachAuditFlags({
      ...entry,
      flags: [],
    }).some((candidate) => !["user_signalled_repeat", "clarification_loop"].includes(candidate.code))
    if (!hasStructuralFailure) {
      return "Tester frustration language is recorded for monitoring, but no parsing or persistence fault occurred on this turn."
    }
  }
  if (flag.code === "clarification_loop") {
    const normalizedUser = cleanText(entry.user_message)
    const repeatedComplaint = /\b(?:i told you|you asked|i gave you|what do you mean|why can't you understand)\b/.test(normalizedUser)
    const hasStructuralFailure = buildCoachAuditFlags({
      ...entry,
      flags: [],
    }).some((candidate) => !["clarification_loop", "user_signalled_repeat"].includes(candidate.code))
    if (repeatedComplaint && !hasStructuralFailure) {
      return "The same clarification repeated after complaint text, but the unresolved target stayed intact and nothing incorrect was persisted."
    }
  }
  return null
}

function assertPersistedActionsValid(entry) {
  const transcriptText = cleanText([
    ...(entry.conversation_window || []).map((line) => line.content || ""),
    entry.user_message,
    entry.assistant_reply,
  ].join(" "))

  for (const action of entry.persisted_actions || []) {
    const label = cleanText(action.food_name || action.exercise_name || action.workout_type || "")
    if (!label && /workout/.test(String(action.type || ""))) throw new Error(`orphan workout label persisted in ${action.type}`)
    if (/^(?:18|19|20|300|500)(?:\.\d+)?$/.test(label)) throw new Error(`numeric food item persisted: ${label}`)
    if (/\b1l\b/.test(label) && !/\b1l\b/.test(transcriptText)) throw new Error(`invented 1l unit persisted: ${label}`)
    if (/\b(?:you asked|i gave you|why can't you understand|what do you mean|i told you)\b/.test(label)) {
      throw new Error(`complaint text persisted as food: ${label}`)
    }
  }

  if (
    responseClaimsPersistence(entry.assistant_reply)
    && !(entry.persisted_actions || []).length
    && !["already_logged", "suppressed"].includes(String(entry.persistence_status || ""))
    && !responseIsConditionalPersistenceOffer(entry.assistant_reply)
  ) {
    throw new Error(`reply implied persistence without persisted action: ${entry.assistant_reply}`)
  }
}

function clarificationStateMadeProgress(before = {}, after = {}) {
  const beforeMeal = before?.meal_session || {}
  const afterMeal = after?.meal_session || {}
  const beforeWorkout = before?.workout_session || {}
  const afterWorkout = after?.workout_session || {}

  const beforeMealSummary = cleanText(beforeMeal.summary || "")
  const afterMealSummary = cleanText(afterMeal.summary || "")
  if (beforeMealSummary && afterMealSummary && beforeMealSummary !== afterMealSummary) return true

  const beforeWorkoutSummary = cleanText(beforeWorkout.summary || "")
  const afterWorkoutSummary = cleanText(afterWorkout.summary || "")
  if (beforeWorkoutSummary && afterWorkoutSummary && beforeWorkoutSummary !== afterWorkoutSummary) return true

  const beforePendingMeal = cleanText(beforeMeal.pendingClarification?.targetReference || beforeMeal.pendingClarification?.targetBaseName || "")
  const afterPendingMeal = cleanText(afterMeal.pendingClarification?.targetReference || afterMeal.pendingClarification?.targetBaseName || "")
  if (beforePendingMeal && afterPendingMeal && beforePendingMeal !== afterPendingMeal) return true

  const beforePendingWorkout = cleanText(beforeWorkout.clarifyQuestion || "")
  const afterPendingWorkout = cleanText(afterWorkout.clarifyQuestion || "")
  if (beforePendingWorkout && afterPendingWorkout && beforePendingWorkout !== afterPendingWorkout) return true

  for (const field of ["sets", "reps", "weight_kg", "duration_seconds", "distance_km"]) {
    const beforeValue = Number(beforeWorkout?.[field] || 0)
    const afterValue = Number(afterWorkout?.[field] || 0)
    if (!beforeValue && afterValue) return true
    if (beforeValue && afterValue && beforeValue !== afterValue) return true
  }

  const beforeMealItems = Array.isArray(beforeMeal.items) ? beforeMeal.items : []
  const afterMealItems = Array.isArray(afterMeal.items) ? afterMeal.items : []
  if (afterMealItems.length !== beforeMealItems.length) return true

  for (const afterItem of afterMealItems) {
    const itemKey = cleanText(afterItem?.attached_to || afterItem?.base_name || afterItem?.label || "")
    const beforeItem = beforeMealItems.find((candidate) => cleanText(candidate?.attached_to || candidate?.base_name || candidate?.label || "") === itemKey)
    const beforeQuantity = cleanText(beforeItem?.quantity?.text || "")
    const afterQuantity = cleanText(afterItem?.quantity?.text || "")
    if (!beforeQuantity && afterQuantity) return true
    if (beforeQuantity && afterQuantity && beforeQuantity !== afterQuantity) return true
    const beforeExclusions = cleanText((beforeItem?.exclusions || []).join(" "))
    const afterExclusions = cleanText((afterItem?.exclusions || []).join(" "))
    if (beforeExclusions !== afterExclusions) return true
  }

  return false
}

function assertNoClarificationLoop(turnResults) {
  let previousClarify = ""
  let repeatedCount = 0
  for (const turn of turnResults) {
    const isClarify = turn.actions.some(isClarifyAction)
    if (!isClarify) {
      previousClarify = ""
      repeatedCount = 0
      continue
    }
    const normalized = cleanText(turn.reply)
    if (normalized && normalized === previousClarify) {
      const complaintOnly = /\b(?:i told you|you asked|i gave you|what do you mean|why can't you understand)\b/.test(cleanText(turn.message))
      const progressed = clarificationStateMadeProgress(turn.stateBefore, turn.stateAfter)
      if (complaintOnly || progressed) {
        previousClarify = normalized
        repeatedCount = 0
        continue
      }
      repeatedCount += 1
      if (repeatedCount >= 1) throw new Error(`clarification loop detected: ${turn.reply}`)
    } else {
      previousClarify = normalized
      repeatedCount = 0
    }
  }
}

function buildDebugPrompt(failure) {
  return [
    "Fix this generally, not as a one-off patch.",
    "",
    `Failure reason: ${failure.reason}`,
    `Case label: ${failure.caseLabel}`,
    `Seed: ${failure.seed}`,
    "",
    "Conversation transcript:",
    ...failure.transcript.map((line) => `${line.role}: ${line.content}`),
    "",
    "State before:",
    JSON.stringify(failure.stateBefore, null, 2),
    "",
    "State after:",
    JSON.stringify(failure.stateAfter, null, 2),
    "",
    "Actions:",
    JSON.stringify(failure.actions, null, 2),
    "",
    "Persisted actions:",
    JSON.stringify(failure.persistedActions, null, 2),
    "",
    "Audit flags:",
    JSON.stringify(failure.auditFlags, null, 2),
  ].join("\n")
}

function mealQuestionCase(rng) {
  return {
    kind: "meal",
    label: "meal-question-only",
    expected: "nutrition question only",
    initialConversationState: {
      recentMessages: [
        { role: "user", content: "3 fried eggs cooked in 10g butter and 250ml Earl Grey tea with no milk and no sugar" },
        { role: "assistant", content: "That meal looks complete. What do you want to know about it?" },
      ],
      mealSession: {
        ...emptyMealSessionState(),
        active: true,
        mealConversation: true,
        readyToLog: true,
        wantsLogging: false,
        wantsNutrition: true,
        answerOnly: true,
        clarificationAttempts: 2,
        clarificationCounts: { "egg:quantity": 1, "egg:cooking_medium": 1 },
        summary: "3 fried eggs cooked in 10g butter, plus 250ml Earl Grey tea with no milk and no sugar",
        items: [
          {
            base_name: "egg",
            label: "Eggs",
            category: "food",
            quantity: { amount: 3, unit: "egg", text: "3 eggs" },
            preparation: ["fried"],
            modifiers: [],
            exclusions: [],
            attached_to: null,
            relation: null,
            variant_key: "",
            meal_type: "",
          },
          {
            base_name: "butter",
            label: "Butter",
            category: "ingredient",
            quantity: { amount: 10, unit: "g", text: "10g" },
            preparation: [],
            modifiers: [],
            exclusions: [],
            attached_to: "egg::fried",
            relation: "cooked_in",
            variant_key: "",
            meal_type: "",
          },
          {
            base_name: "earl grey tea",
            label: "Earl Grey tea",
            category: "drink",
            quantity: { amount: 250, unit: "ml", text: "250ml" },
            preparation: [],
            modifiers: [],
            exclusions: ["no milk", "no sugar"],
            attached_to: null,
            relation: null,
            variant_key: "",
            meal_type: "",
          },
        ],
      },
      workoutSession: emptyWorkoutSessionState(),
    },
    turns: ["how many calories is that?"],
    assert(result) {
      expect(result.persistedActions.filter((action) => action.type.includes("meal"))).toHaveLength(0)
    },
  }
}

function mealSuppressionCase(rng) {
  const food = randomChoice(rng, foods)
  const drink = randomChoice(rng, drinks)
  return {
    kind: "meal",
    label: "meal-suppression",
    expected: "no meal persistence when user says not to log",
    turns: [`i had ${food} and ${drink} today, don't log that`],
    assert(result) {
      expect(result.persistedActions.filter((action) => action.type.includes("meal"))).toHaveLength(0)
    },
  }
}

function mealDeleteCase(rng) {
  const food = randomChoice(rng, ["eggs", "burger", "pizza", "pie", "cake", "chips", "fries", "tofu"])
  const qty = randomInt(rng, 1, 4)
  return {
    kind: "meal",
    label: "meal-delete-after-save",
    expected: "save one meal then delete it",
    turns: [`i had ${qty} ${food}`, "delete it"],
    assert(result) {
      expect(result.turnResults.some((turn) => turn.persistedActions.some((action) => action.type === "log_meal"))).toBeTruthy()
      expect(result.turnResults.some((turn) => turn.persistedActions.some((action) => action.type === "delete_meal_log"))).toBeTruthy()
      expect(result.mealDelta).toBe(0)
    },
  }
}

function mealRepeatCase(rng) {
  const food = randomChoice(rng, ["eggs", "burger", "pizza", "pie", "cake", "chips", "fries"])
  const qty = randomInt(rng, 1, 5)
  const message = `i had ${qty} ${food}`
  return {
    kind: "meal",
    label: "meal-repeat-no-duplicate",
    expected: "same meal repeated does not duplicate",
    turns: [message, message],
    assert(result) {
      const mealLogs = result.persistedActions.filter((action) => action.type === "log_meal")
      expect(mealLogs.length).toBe(1)
      expect(result.mealDelta).toBe(1)
    },
  }
}

function mealUpdateCase(rng) {
  const food = randomChoice(rng, ["chips", "fries", "burger", "salad", "rice"])
  const addition = randomChoice(rng, additions)
  return {
    kind: "meal",
    label: "meal-additive-update",
    expected: "additive follow-up updates existing meal",
    turns: [`i had ${food}`, "1 bowl", `with ${addition}`],
    assert(result) {
      expect(result.turnResults.some((turn) => turn.persistedActions.some((action) => action.type === "log_meal"))).toBeTruthy()
      expect(result.turnResults.some((turn) => turn.persistedActions.some((action) => action.type === "update_meal_log"))).toBeTruthy()
      expect(result.mealDelta).toBe(1)
    },
  }
}

function mealGroupedCase(rng) {
  const food = randomChoice(rng, ["eggs", "chicken", "rice"])
  const prepA = randomChoice(rng, ["fried", "grilled", "plain", "boiled"])
  const prepB = randomChoice(rng, ["fried", "grilled", "plain", "raw"])
  const total = randomInt(rng, 4, 18)
  const partA = randomInt(rng, 1, total - 1)
  const partB = total - partA
  const addition = randomChoice(rng, ["butter", "olive oil"])
  return {
    kind: "meal",
    label: "meal-grouped-total",
    expected: "grouped totals save as one valid meal",
    turns: [`i had ${total} ${food} total, ${partA} ${prepA}, ${partB} ${prepB} in 20g ${addition}`],
    assert(result) {
      expect(result.persistedActions.filter((action) => action.type === "log_meal").length).toBe(1)
      expect(result.mealDelta).toBe(1)
    },
  }
}

function mealDecimalBindingCase(rng) {
  const dessert = randomChoice(rng, ["cake", "pie", "toast"])
  const drink = randomChoice(rng, ["milk", "coffee", "tea"])
  const qty = `${randomInt(rng, 1, 20)}.${randomInt(rng, 1, 9)}`
  const complaint = randomChoice(rng, conversationComplaints)
  return {
    kind: "meal",
    label: "meal-decimal-binding",
    expected: "decimal quantity binds to the asked food and complaint text never becomes food",
    turns: [`i had egg and ${dessert} and ${drink} today`, qty, complaint, `500ml ${drink}`],
    assert(result) {
      const saveAction = result.persistedActions.find((action) => action.type === "log_meal")
      expect(saveAction).toBeTruthy()
      expect(cleanText(saveAction.food_name)).toContain(cleanText(qty))
      expect(cleanText(saveAction.food_name)).not.toMatch(/gave you number|understand|what do you mean|i told you/)
    },
  }
}

function mealFragmentedCase(rng) {
  const food = randomChoice(rng, ["chicken", "steak", "tofu", "eggs"])
  const drink = randomChoice(rng, ["tea", "coffee", "milk"])
  const prep = randomChoice(rng, ["fried", "grilled", "boiled", "roasted"])
  const addition = randomChoice(rng, ["butter", "olive oil", "gravy"])
  const qty = `${randomInt(rng, 1, 5)}`
  const drinkAmount = `${randomInt(rng, 200, 500)}ml`
  return {
    kind: "meal",
    label: "meal-fragmented",
    expected: "fragmented meal details accumulate into one saved meal",
    turns: [`i had ${food} and ${drink}`, `${qty} ${prep} ${food}`, `${drinkAmount} ${drink} no sugar`, `cooked in 15g ${addition}`],
    assert(result) {
      expect(result.persistedActions.filter((action) => action.type === "log_meal").length).toBe(1)
      expect(result.mealDelta).toBe(1)
    },
  }
}

function mealMultiMealCase(rng) {
  const breakfastFood = randomChoice(rng, ["eggs", "toast", "oats"])
  const lunchFood = randomChoice(rng, ["steak", "rice", "salad"])
  return {
    kind: "meal",
    label: "meal-explicit-multi-meal",
    expected: "explicit breakfast/lunch input persists as separate meals",
    turns: [`breakfast was 2 ${breakfastFood}, lunch was 200g ${lunchFood}`],
    assert(result) {
      expect(result.persistedActions.filter((action) => action.type === "log_meal").length).toBe(2)
      expect(result.mealDelta).toBe(2)
    },
  }
}

function workoutQuestionCase(rng) {
  const exercise = randomChoice(rng, workoutExercises)
  return {
    kind: "workout",
    label: "workout-question-only",
    expected: "workout question does not log",
    turns: [`should i train ${exercise} today?`],
    assert(result) {
      expect(result.persistedActions.filter((action) => action.type.includes("workout"))).toHaveLength(0)
    },
  }
}

function workoutSuppressionCase(rng) {
  const exercise = randomChoice(rng, workoutExercises)
  const weight = randomInt(rng, 20, 100)
  const reps = randomInt(rng, 5, 12)
  const sets = randomInt(rng, 2, 5)
  return {
    kind: "workout",
    label: "workout-suppression",
    expected: "user suppression prevents workout persistence",
    turns: [`i did ${exercise} ${weight}kg x ${reps} x ${sets}, don't save that`],
    assert(result) {
      expect(result.persistedActions.filter((action) => action.type.includes("workout"))).toHaveLength(0)
    },
  }
}

function workoutDeleteCase(rng) {
  const exercise = randomChoice(rng, ["bench press", "back squat", "row"])
  const weight = randomInt(rng, 40, 110)
  const reps = randomInt(rng, 5, 10)
  const sets = randomInt(rng, 2, 5)
  return {
    kind: "workout",
    label: "workout-delete-after-save",
    expected: "save one workout then delete it",
    turns: [`${exercise} ${weight}kg x ${reps} x ${sets}`, "delete it"],
    assert(result) {
      expect(result.turnResults.some((turn) => turn.persistedActions.some((action) => action.type === "log_workout"))).toBeTruthy()
      expect(result.turnResults.some((turn) => turn.persistedActions.some((action) => action.type === "delete_workout_log"))).toBeTruthy()
      expect(result.workoutDelta).toBe(0)
    },
  }
}

function workoutRepeatCase(rng) {
  const exercise = randomChoice(rng, ["bench press", "deadlift", "bike"])
  const weight = exercise === "bike" ? 0 : randomInt(rng, 20, 100)
  const reps = randomInt(rng, 5, 12)
  const sets = randomInt(rng, 2, 5)
  const message = exercise === "bike"
    ? `20 minutes ${exercise}`
    : `${exercise} ${weight}kg x ${reps} x ${sets}`
  return {
    kind: "workout",
    label: "workout-repeat-no-duplicate",
    expected: "same workout repeated does not duplicate",
    turns: [message, message],
    assert(result) {
      expect(result.persistedActions.filter((action) => action.type === "log_workout").length).toBe(1)
      expect(result.workoutDelta).toBe(1)
    },
  }
}

function workoutCorrectionCase(rng) {
  const exercise = randomChoice(rng, ["bench press", "row", "deadlift"])
  const weight = randomInt(rng, 40, 110)
  const reps = randomInt(rng, 5, 10)
  const sets = randomInt(rng, 2, 5)
  return {
    kind: "workout",
    label: "workout-correction-update",
    expected: "workout correction updates existing log",
    turns: [`${exercise} ${weight}kg x ${reps} x ${sets}`, `actually ${weight + 5}kg`],
    assert(result) {
      expect(result.turnResults.some((turn) => turn.persistedActions.some((action) => action.type === "update_workout_log"))).toBeTruthy()
      expect(result.workoutDelta).toBe(1)
    },
  }
}

function workoutFragmentedCase(rng) {
  const exercise = randomChoice(rng, ["bench press", "back squat", "push ups", "row"])
  const reps = randomInt(rng, 6, 12)
  const sets = randomInt(rng, 2, 5)
  const weight = exercise === "push ups" ? null : randomInt(rng, 20, 100)
  return {
    kind: "workout",
    label: "workout-fragmented",
    expected: "fragmented workout details save once ready",
    turns: weight === null
      ? [`i did ${exercise}`, `${sets} sets of ${reps}`]
      : [`i did ${exercise}`, `${sets} sets`, `${reps} reps`, `${weight}kg`],
    assert(result) {
      expect(result.persistedActions.filter((action) => action.type === "log_workout").length).toBe(1)
      expect(result.workoutDelta).toBe(1)
    },
  }
}

function workoutCardioCase(rng) {
  const exercise = randomChoice(rng, ["bike", "treadmill", "rower"])
  const minutes = randomInt(rng, 15, 35)
  return {
    kind: "workout",
    label: "workout-cardio",
    expected: "cardio saves without orphan metrics",
    turns: [`${minutes} minutes ${exercise}`],
    assert(result) {
      expect(result.persistedActions.filter((action) => action.type === "log_workout").length).toBe(1)
      expect(result.workoutDelta).toBe(1)
    },
  }
}

function mixedGreetingCase() {
  return {
    kind: "mixed",
    label: "mixed-greeting",
    expected: "greeting gets a reply without logging",
    turns: ["hello"],
    assert(result) {
      expect(result.persistedActions.filter(isPersistenceAction)).toHaveLength(0)
    },
  }
}

function mixedGeneralCase(rng) {
  const prompts = [
    "what's up",
    "i stuffed up today, what do i eat now?",
    "i'm tired and sore, what should i train?",
    "wht shld i eat aftr trnng",
    "that was a mess, help me fix today",
    "haha fair enough",
  ]
  return {
    kind: "mixed",
    label: "mixed-general-chat",
    expected: "general chat does not accidentally log",
    turns: [randomChoice(rng, prompts)],
    assert(result) {
      expect(result.persistedActions.filter(isPersistenceAction)).toHaveLength(0)
    },
  }
}

function mixedSuppressionCase() {
  return {
    kind: "mixed",
    label: "mixed-dont-log",
    expected: "do not log statement prevents persistence",
    turns: ["don't log that", "i had chips"],
    assert(result) {
      expect(result.persistedActions.filter(isPersistenceAction)).toHaveLength(0)
    },
  }
}

function mixedNonsenseCase() {
  return {
    kind: "mixed",
    label: "mixed-nonsense",
    expected: "nonsense does not crash or log",
    turns: ["blue banana wizard mode"],
    assert(result) {
      expect(result.persistedActions.filter(isPersistenceAction)).toHaveLength(0)
    },
  }
}

function mixedRepeatMealCase(rng, store) {
  if (!store.meals.length) return mealQuestionCase(rng)
  return {
    kind: "mixed",
    label: "mixed-repeat-recent-meal",
    expected: "same as yesterday repeats a recent meal safely or asks a useful clarification",
    turns: ["same as yesterday"],
    assert(result) {
      if (result.persistedActions.some((action) => action.type === "log_meal")) {
        expect(result.mealDelta).toBe(1)
      } else {
        expect(result.turnResults.some((turn) => turn.actions.some(isClarifyAction) || /what happened|sort the next move/i.test(turn.reply))).toBeTruthy()
      }
    },
  }
}

function mixedMealWorkoutMultiExerciseCase() {
  return {
    kind: "mixed",
    label: "mixed-meal-workout-multi-exercise",
    expected: "mixed meal and multi-exercise turn persists both domains cleanly",
    turns: [
      "i had 6 eggs and some wine and did a pushup and a chinup",
      "250ml",
    ],
    assert(result) {
      expect(result.mealDelta).toBeGreaterThanOrEqual(1)
      expect(result.workoutDelta).toBeGreaterThanOrEqual(1)
      expect(result.persistedActions.some((action) => action.type === "log_meal")).toBeTruthy()
      expect(result.persistedActions.some((action) => action.type === "log_workout")).toBeTruthy()
    },
  }
}

const mealCaseBuilders = [
  mealFragmentedCase,
  mealGroupedCase,
  mealDecimalBindingCase,
  mealUpdateCase,
  mealDeleteCase,
  mealRepeatCase,
  mealSuppressionCase,
  mealQuestionCase,
  mealMultiMealCase,
]

const workoutCaseBuilders = [
  workoutFragmentedCase,
  workoutCardioCase,
  workoutCorrectionCase,
  workoutDeleteCase,
  workoutRepeatCase,
  workoutSuppressionCase,
  workoutQuestionCase,
]

const mixedCaseBuilders = [
  mixedGreetingCase,
  mixedGeneralCase,
  mixedSuppressionCase,
  mixedNonsenseCase,
  mixedRepeatMealCase,
  mixedMealWorkoutMultiExerciseCase,
]

function pickCase(rng, builders, store) {
  return randomChoice(rng, builders)(rng, store)
}

async function runCase(caseConfig, store, seed, requestCoach) {
  const conversationState = {
    ...createConversationState(),
    ...(caseConfig.initialConversationState ? clone(caseConfig.initialConversationState) : {}),
  }
  const mealsBefore = store.meals.length
  const workoutsBefore = store.workouts.length
  const turnResults = []
  const transcript = []
  const allPersistedActions = []

  for (const message of caseConfig.turns) {
    const stateBefore = {
      meal_session: clone(conversationState.mealSession),
      workout_session: clone(conversationState.workoutSession),
    }
    const requestResult = await requestCoach(conversationState, store, message)
    if (!requestResult.ok) {
      throw Object.assign(new Error(`coach request failed with ${requestResult.status}`), {
        status: requestResult.status,
        responsePayload: requestResult.payload,
        stateBefore,
        transcript: [...transcript, { role: "user", content: message }],
      })
    }

    const response = requestResult.payload
    const actions = Array.isArray(response.actions) ? response.actions : []
    const persistedActions = applyPersistenceActions({
      store,
      conversationState,
      response,
      caseLabel: caseConfig.label,
    })
    const responseMealSession = response.meal_session || response.mealSession || conversationState.mealSession
    const responseWorkoutSession = response.workout_session || response.workoutSession || conversationState.workoutSession
    const persistenceStatus = persistedActions.length
      ? "succeeded"
      : responseMealSession?.alreadyLogged || responseWorkoutSession?.alreadyLogged
        ? "already_logged"
        : responseMealSession?.suppressed || responseWorkoutSession?.suppressed
          ? "suppressed"
          : "not_requested"
    const stateAfter = {
      meal_session: clone(responseMealSession),
      workout_session: clone(responseWorkoutSession),
    }
    const conversationWindow = [
      ...conversationState.recentMessages.slice(-12),
      { role: "user", content: message },
      { role: "assistant", content: String(response.reply || "") },
    ]
    const routeType = actions.length || stateAfter.meal_session?.clarifyQuestion || stateAfter.workout_session?.clarifyQuestion
      ? "deterministic"
      : "fallback"
    const auditEntry = buildLocalAuditEntry({
      message,
      reply: String(response.reply || ""),
      actions,
      persistedActions,
      stateBefore,
      stateAfter,
      conversationWindow,
      latencyMs: requestResult.latencyMs,
      routeType,
      persistenceStatus,
    })
    const auditFlags = buildCoachAuditFlags(auditEntry)
    const falsePositiveFlags = []
    const blockingFlags = []
    for (const flag of auditFlags) {
      const explanation = classifyFlagAsFalsePositive(flag, auditEntry)
      if (explanation) falsePositiveFlags.push({ ...flag, explanation })
      else blockingFlags.push(flag)
    }

    assertPersistedActionsValid({ ...auditEntry, persisted_actions: persistedActions })

    if (blockingFlags.length) {
      throw Object.assign(new Error(`blocking audit flags: ${blockingFlags.map((flag) => flag.code).join(", ")}`), {
        auditEntry,
        blockingFlags,
        falsePositiveFlags,
      })
    }

    turnResults.push({
      message,
      reply: String(response.reply || ""),
      actions: clone(actions),
      persistedActions: clone(persistedActions),
      latencyMs: requestResult.latencyMs,
      stateBefore,
      stateAfter,
      auditFlags,
      falsePositiveFlags,
      routeType,
    })
    allPersistedActions.push(...persistedActions)
    transcript.push({ role: "user", content: message }, { role: "assistant", content: String(response.reply || "") })
    conversationState.recentMessages.push({ role: "user", content: message }, { role: "assistant", content: String(response.reply || "") })
  }

  assertNoClarificationLoop(turnResults)

  const result = {
    seed,
    label: caseConfig.label,
    kind: caseConfig.kind,
    expected: caseConfig.expected,
    turnResults,
    transcript,
    persistedActions: allPersistedActions,
    mealDelta: store.meals.length - mealsBefore,
    workoutDelta: store.workouts.length - workoutsBefore,
    finalMeals: clone(store.meals),
    finalWorkouts: clone(store.workouts),
    finalWorkoutSets: clone(store.workoutSets),
  }
  caseConfig.assert(result)
  return result
}

async function ensureDirectory(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true })
}

async function writeJson(filePath, value) {
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function startProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    ...options,
  })
  let stdout = ""
  let stderr = ""
  child.stdout?.on("data", (chunk) => { stdout += String(chunk) })
  child.stderr?.on("data", (chunk) => { stderr += String(chunk) })
  child.getCapturedOutput = () => ({ stdout, stderr })
  return child
}

async function waitForUrl(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return true
      lastError = new Error(`received ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw lastError || new Error(`timed out waiting for ${url}`)
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return
  const target = child.pid && process.platform !== "win32"
    ? -child.pid
    : child.pid
  try {
    process.kill(target, "SIGTERM")
  } catch {
    child.kill("SIGTERM")
  }
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ])
  if (child.exitCode === null) {
    try {
      process.kill(target, "SIGKILL")
    } catch {
      child.kill("SIGKILL")
    }
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 1_000)),
    ])
  }
}

async function waitForProcessSuccess(child, label, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill("SIGTERM")
      reject(new Error(`${label} timed out`))
    }, timeoutMs)

    child.once("exit", (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) {
        resolve()
        return
      }
      const logs = child.getCapturedOutput?.() || {}
      reject(new Error(`${label} failed (code=${code}, signal=${signal})\n${logs.stderr || logs.stdout || ""}`))
    })
  })
}

async function startLocalInfrastructure() {
  const coachServer = await startProcess("node", ["server/openaiCoachServer.mjs"], {
    env: {
      ...process.env,
      PORT: String(localCoachPort),
      OPENAI_API_KEY: "",
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: `http://127.0.0.1:${localPreviewPort}`,
      ENABLE_COACH_AUDIT: "true",
      RATE_LIMIT_MAX_REQUESTS: "20000",
      TELEMETRY_RATE_LIMIT_MAX_REQUESTS: "20000",
      NODE_ENV: "production",
    },
  })
  try {
    await waitForUrl(`http://127.0.0.1:${localCoachPort}/health`)
  } catch (error) {
    const logs = coachServer.getCapturedOutput?.() || {}
    await stopProcess(coachServer)
    throw new Error(`Local coach server failed to start: ${error?.message || error}\n${logs.stderr || logs.stdout || ""}`)
  }

  const previewBuild = await startProcess("npm", ["run", "build"], {
    env: {
      ...process.env,
      VITE_APEXAI_ALLOW_LOCAL_MODE: "true",
    },
  })
  try {
    await waitForProcessSuccess(previewBuild, "Local soak preview build")
  } catch (error) {
    await stopProcess(coachServer)
    throw error
  }

  const previewServer = await startProcess("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(localPreviewPort), "--strictPort"], {
    env: {
      ...process.env,
      VITE_APEXAI_ALLOW_LOCAL_MODE: "true",
    },
  })
  try {
    await waitForUrl(`http://127.0.0.1:${localPreviewPort}`)
  } catch (error) {
    const logs = previewServer.getCapturedOutput?.() || {}
    await stopProcess(previewServer)
    await stopProcess(coachServer)
    throw new Error(`Local preview server failed to start: ${error?.message || error}\n${logs.stderr || logs.stdout || ""}`)
  }

  return {
    coachServer,
    previewServer,
    baseUrl: `http://127.0.0.1:${localPreviewPort}`,
  }
}

async function verifyUiForRun(browser, store, runArtifactPath) {
  const consoleErrors = []
  const statePayload = {
    [storageKeys.localMode]: true,
    [storageKeys.profile]: soakProfile,
    [storageKeys.meals]: store.meals,
    [storageKeys.workouts]: store.workouts,
    [storageKeys.workoutSets]: store.workoutSets,
    [storageKeys.coachMealSession]: emptyMealSessionState(),
    [storageKeys.coachWorkoutSession]: emptyWorkoutSessionState(),
  }

  const context = await browser.newContext()
  await context.addInitScript(({ state }) => {
    window.localStorage.clear()
    for (const [key, value] of Object.entries(state)) {
      if (key === "apexai.localMode") {
        window.localStorage.setItem(key, "true")
        continue
      }
      window.localStorage.setItem(key, JSON.stringify(value))
    }
  }, { state: statePayload })

  const page = await context.newPage()
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("pageerror", (error) => {
    consoleErrors.push(String(error?.message || error))
  })

  try {
    const sampleMeal = store.meals[0]
    const sampleWorkout = store.workouts[0]

    if (!sampleMeal) throw new Error("UI verification needs at least one persisted meal")
    if (!sampleWorkout) throw new Error("UI verification needs at least one persisted workout")

    await page.goto(`http://127.0.0.1:${localPreviewPort}/Nutrition`)
    await expect(page.getByText(sampleMeal.food_name).first()).toBeVisible({ timeout: 15_000 })
    await page.reload()
    await expect(page.getByText(sampleMeal.food_name).first()).toBeVisible({ timeout: 15_000 })

    await page.goto(`http://127.0.0.1:${localPreviewPort}/Workouts`)
    await expect(page.getByText(sampleWorkout.workout_type).first()).toBeVisible({ timeout: 15_000 })
    await page.reload()
    await expect(page.getByText(sampleWorkout.workout_type).first()).toBeVisible({ timeout: 15_000 })

    await page.route("**/api/coach", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ invalid: true }),
      })
    })
    await page.goto(`http://127.0.0.1:${localPreviewPort}/Coach`)
    const composer = page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i)
    const failedPrompt = "i had eggs on toast with butter"
    await composer.fill(failedPrompt)
    await page.getByRole("button", { name: /^Send$/i }).click()
    await expect(page.getByText(/i couldn't reach the live coach just now|left your data alone/i).first()).toBeVisible({ timeout: 15_000 })
    await expect(composer).toHaveValue(failedPrompt)
    await page.unroute("**/api/coach")

    let duplicateRequestCount = 0
    await page.route("**/api/coach", async (route) => {
      duplicateRequestCount += 1
      await new Promise((resolve) => setTimeout(resolve, 350))
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Saved to today's nutrition: 2 eggs.",
          actions: [
            {
              type: "log_meal",
              food_name: "2 eggs",
              meal_type: "breakfast",
              quantity: "2 eggs",
              calories: 144,
              protein_g: 12.6,
              carbs_g: 0.7,
              fat_g: 9.6,
              nutrition_source: "Coach estimate from user-described ingredients and amounts",
              estimated: true,
            },
          ],
          warnings: [],
          meal_session: emptyMealSessionState(),
          workout_session: emptyWorkoutSessionState(),
        }),
      })
    })
    await page.reload()
    const duplicateComposer = page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i)
    await duplicateComposer.fill("i had 2 eggs")
    const sendButton = page.getByRole("button", { name: /^Send$/i })
    await Promise.all([
      sendButton.click(),
      sendButton.click(),
    ])
    await expect(page.getByText(/saved to today's nutrition: 2 eggs\./i)).toBeVisible({ timeout: 15_000 })
    if (duplicateRequestCount !== 1) {
      throw new Error(`duplicate submit guard failed: expected 1 coach request, got ${duplicateRequestCount}`)
    }
    await page.unroute("**/api/coach")

    if (consoleErrors.length) throw new Error(`console errors detected: ${consoleErrors.join(" | ")}`)
  } catch (error) {
    const screenshotPath = path.join(runArtifactPath, "ui-failure.png")
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => null)
    throw Object.assign(error, { screenshotPath, consoleErrors: [...consoleErrors] })
  } finally {
    await context.close()
  }

  return { consoleErrors }
}

function countConversationTurns(results, kind) {
  return results.filter((entry) => entry.kind === kind).length
}

async function runSingleSoakPass({ runIndex, seed, requestCoach, verifyRun, browser = null }) {
  const rng = createRng(seed)
  const store = createStore()
  const results = []
  const runDir = path.join(runRoot, `run-${String(runIndex).padStart(3, "0")}-${seed}`)
  await ensureDirectory(runDir)

  const conversationPlan = [
    ...Array.from({ length: mealCaseCount }, () => pickCase(rng, mealCaseBuilders, store)),
    ...Array.from({ length: workoutCaseCount }, () => pickCase(rng, workoutCaseBuilders, store)),
    ...Array.from({ length: mixedCaseCount }, () => pickCase(rng, mixedCaseBuilders, store)),
  ]

  for (const caseConfig of conversationPlan) {
    try {
      const result = await runCase(caseConfig, store, seed, requestCoach)
      results.push(result)
    } catch (error) {
      const failureDir = path.join(failureRoot, `run-${String(runIndex).padStart(3, "0")}-${seed}-${caseConfig.label}`)
      await ensureDirectory(failureDir)
      const failureArtifact = {
        runIndex,
        seed,
        caseLabel: caseConfig.label,
        reason: String(error?.message || error),
        expected: caseConfig.expected,
        transcript: error?.transcript || error?.auditEntry?.conversation_window || caseConfig.turns.map((content) => ({ role: "user", content })),
        stateBefore: error?.stateBefore || error?.auditEntry?.state_before || null,
        stateAfter: error?.auditEntry?.state_after || null,
        actions: error?.auditEntry?.actions || [],
        persistedActions: error?.auditEntry?.persisted_actions || [],
        auditFlags: error?.blockingFlags || error?.auditEntry?.flags || [],
      }
      await writeJson(path.join(failureDir, "failure.json"), failureArtifact)
      await fsp.writeFile(path.join(failureDir, "debug-prompt.txt"), `${buildDebugPrompt(failureArtifact)}\n`, "utf8")
      throw Object.assign(new Error(`Run ${runIndex} failed in ${caseConfig.label}: ${failureArtifact.reason}`), {
        failureDir,
        failureArtifact,
      })
    }
  }

  const uiVerification = verifyRun
    ? await verifyRun(browser, store, runDir)
    : { consoleErrors: [], mode: "none" }
  const runArtifact = {
    runIndex,
    seed,
    target,
    timestamp: new Date().toISOString(),
    conversationCounts: {
      meal: countConversationTurns(results, "meal"),
      workout: countConversationTurns(results, "workout"),
      mixed: countConversationTurns(results, "mixed"),
    },
    conversationsTested: results.map((entry) => ({
      label: entry.label,
      kind: entry.kind,
      expected: entry.expected,
      actualPersistedActions: entry.persistedActions,
      mealDelta: entry.mealDelta,
      workoutDelta: entry.workoutDelta,
      auditFlags: entry.turnResults.flatMap((turn) => turn.auditFlags),
      falsePositiveFlags: entry.turnResults.flatMap((turn) => turn.falsePositiveFlags),
      uiVerification: uiVerification.mode || "none",
      pass: true,
    })),
    summary: {
      mealsPersisted: store.meals.length,
      workoutsPersisted: store.workouts.length,
      workoutSetsPersisted: store.workoutSets.length,
      consoleErrors: uiVerification.consoleErrors,
    },
    pass: true,
  }
  await writeJson(path.join(runDir, "run.json"), runArtifact)
  return { runArtifact, runDir }
}

function createSeed(runIndex) {
  const randomSeed = Math.floor(Math.random() * 1_000_000_000)
  return randomSeed + runIndex
}

async function runLocalSoak() {
  await ensureDirectory(runRoot)
  await ensureDirectory(failureRoot)
  const infra = await startLocalInfrastructure()
  const browser = await chromium.launch({ headless: true })
  let streak = 0
  let runIndex = 0
  let totalConversations = 0
  let failureCount = 0
  const streakSeeds = []

  try {
    while (streak < requiredStreak) {
      runIndex += 1
      const seed = createSeed(runIndex)
      try {
        const { runArtifact } = await runSingleSoakPass({
          runIndex,
          seed,
          browser,
          requestCoach: requestLocalCoach,
          verifyRun: verifyUiForRun,
        })
        totalConversations += runArtifact.conversationsTested.length
        streak += 1
        streakSeeds.push(seed)
        if (streakSeeds.length > requiredStreak) streakSeeds.shift()
      } catch (error) {
        failureCount += 1
        streak = 0
        streakSeeds.length = 0
        throw Object.assign(error, {
          totalRunsAttempted: runIndex,
          totalConversations,
          failuresBeforeExit: failureCount,
        })
      }
    }

    return {
      target: "local",
      finalCleanStreakCount: streak,
      totalRunsAttempted: runIndex,
      totalConversationsTested: totalConversations,
      finalSeeds: streakSeeds,
      failuresFoundBeforeCleanStreak: failureCount,
    }
  } finally {
    await browser.close()
    await stopProcess(infra.previewServer)
    await stopProcess(infra.coachServer)
  }
}

async function runLiveSoak() {
  await ensureDirectory(runRoot)
  await ensureDirectory(failureRoot)
  const live = {
    ...createLiveSupabaseClients(),
    coachUrl: liveCoachUrl,
    baseUrl: liveBaseUrl,
    email: "",
    password: "",
    accessToken: "",
    refreshToken: "",
    userId: "",
    nextRequestAt: 0,
  }
  await ensureLiveTestUser(live)
  await refreshLiveAuthToken(live)

  let streak = 0
  let runIndex = 0
  let totalConversations = 0
  let failureCount = 0
  const streakSeeds = []

  try {
    while (streak < requiredStreak) {
      runIndex += 1
      const seed = createSeed(runIndex)
      try {
        await resetLiveUserState(live)
        const { runArtifact } = await runSingleSoakPass({
          runIndex,
          seed,
          requestCoach: (conversationState, store, message) => requestLiveCoach(conversationState, store, message, live),
          verifyRun: verifyLiveRun,
        })
        totalConversations += runArtifact.conversationsTested.length
        streak += 1
        streakSeeds.push(seed)
        if (streakSeeds.length > requiredStreak) streakSeeds.shift()
      } catch (error) {
        failureCount += 1
        streak = 0
        streakSeeds.length = 0
        throw Object.assign(error, {
          totalRunsAttempted: runIndex,
          totalConversations,
          failuresBeforeExit: failureCount,
        })
      }
    }

    return {
      target: "live",
      finalCleanStreakCount: streak,
      totalRunsAttempted: runIndex,
      totalConversationsTested: totalConversations,
      finalSeeds: streakSeeds,
      failuresFoundBeforeCleanStreak: failureCount,
      liveBaseUrl,
      liveCoachUrl,
    }
  } finally {
    await live.authClient?.auth?.signOut().catch(() => null)
    live.authClient?.realtime?.disconnect?.()
    live.adminClient?.realtime?.disconnect?.()
  }
}

async function main() {
  const startedAt = Date.now()
  const summary = target === "live"
    ? await runLiveSoak()
    : await runLocalSoak()

  const finalSummary = {
    ...summary,
    elapsedMs: Date.now() - startedAt,
    requiredStreak,
    mealCaseCount,
    workoutCaseCount,
    mixedCaseCount,
  }
  await writeJson(path.join(runRoot, "latest-summary.json"), finalSummary)
  console.log(JSON.stringify({ ok: true, ...finalSummary }, null, 2))
  await new Promise((resolve) => setImmediate(resolve))
  process.exit(0)
}

main().catch(async (error) => {
  const failureSummary = {
    ok: false,
    target,
    error: String(error?.message || error),
    failureDir: error?.failureDir || "",
    totalRunsAttempted: error?.totalRunsAttempted || 0,
    totalConversationsTested: error?.totalConversations || 0,
    failuresBeforeExit: error?.failuresBeforeExit || 0,
  }
  await ensureDirectory(runRoot).catch(() => null)
  await writeJson(path.join(runRoot, "latest-summary.json"), failureSummary).catch(() => null)
  console.error(JSON.stringify(failureSummary, null, 2))
  await new Promise((resolve) => setImmediate(resolve))
  process.exit(1)
})
