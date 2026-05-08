import { buildMealContext as buildLegacyMealContext, emptyMealSession as emptyLegacyMealSession } from "./mealStateBuilder.mjs"

const MEAL_EXPLICIT_START_PATTERN = /^(?:please\s+)?(?:(?:i\s+)?(?:had|ate|drank)|log|track|save|add|include)\b/i
const MEAL_CORRECTION_PATTERN = /\b(?:actually|correction|change(?:\s+that)?|update(?:\s+that)?|make that|not\b|instead|sorry|i meant)\b/i
const MEAL_FINALISE_PATTERN = /^(?:i just did|i already did|that'?s it|thats it|log it|save it|go ahead|yes|yeah|yep|okay|ok)$/i
const MEAL_REFERENCE_PATTERN = /\b(?:the eggs?|the tea|the coffee|the toast|the beans?|the chicken|the rice|the butter|the oil)\b/i
const SUPPRESS_SESSION_PATTERN = /\b(?:don't|dont|do not|stop|no)\s+(?:log|save|track|record|add)\b/i
const REPEAT_RECENT_MEAL_PATTERN = /\b(?:same as yesterday|same as last time|same as before|repeat that(?: meal)?|same thing as yesterday)\b/i
const WORKOUT_START_PATTERN = /\b(?:workout|train(?:ed|ing)?|lift(?:ed|ing)?|exercise|exercises|session|cardio|bench|squat|deadlift|row|rows|press|curls?|pulldown|pull ups?|push ups?|lunge|treadmill|bike|run|running|walk|walking|rower|elliptical|stairmaster|km|min|minutes|sets?|reps?|kg)\b/i
const WORKOUT_CORRECTION_PATTERN = /\b(?:actually|correction|change(?:\s+that)?|update(?:\s+that)?|make that|not\b|instead|sorry|i meant)\b/i
const WORKOUT_FINALISE_PATTERN = /^(?:i just did|i already did|that'?s it|thats it|log it|save it|go ahead|yes|yeah|yep|okay|ok)$/i
const WORKOUT_EXERCISES = [
  "bench press",
  "incline bench press",
  "overhead press",
  "shoulder press",
  "dumbbell shoulder press",
  "seated row",
  "rower",
  "barbell row",
  "bent over row",
  "row",
  "pull up",
  "pull ups",
  "push up",
  "push ups",
  "lat pulldown",
  "deadlift",
  "romanian deadlift",
  "rdl",
  "back squat",
  "front squat",
  "leg press",
  "walking lunge",
  "preacher curl",
  "preacher curls",
  "bicep curl",
  "tricep pushdown",
  "plank",
  "incline treadmill",
  "treadmill",
  "bike",
  "rower",
  "run",
  "walk",
  "elliptical",
  "stairmaster",
]

function cleanText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function titleCase(text) {
  return String(text || "")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}

function safeRecentMessages(value, limit = 18) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry?.content === "string").slice(-limit) : []
}

function buildThreadMessages(recentMessages = [], currentMessage = "") {
  return [...safeRecentMessages(recentMessages, 18), { role: "user", content: String(currentMessage || "") }]
}

function normalizeMealSession(session = {}) {
  return {
    ...emptyMealSessionState(),
    ...session,
    clarificationCounts: { ...(session?.clarificationCounts || {}) },
    declaredTotals: Array.isArray(session?.declaredTotals)
      ? session.declaredTotals.map((entry) => ({ ...entry }))
      : [],
    items: Array.isArray(session?.items) ? session.items.map((item) => ({
      ...item,
      quantity: item?.quantity ? { ...item.quantity } : null,
      preparation: Array.isArray(item?.preparation) ? [...item.preparation] : [],
      exclusions: Array.isArray(item?.exclusions) ? [...item.exclusions] : [],
    })) : [],
  }
}

function normalizeWorkoutSession(session = {}) {
  return {
    ...emptyWorkoutSessionState(),
    ...session,
    clarificationCounts: { ...(session?.clarificationCounts || {}) },
  }
}

function normalizedItemNames(session) {
  return new Set(
    (Array.isArray(session?.items) ? session.items : [])
      .flatMap((item) => [item?.base_name, item?.label])
      .map((value) => cleanText(value))
      .filter(Boolean)
  )
}

function normalizedItemQuantities(session) {
  return new Set(
    (Array.isArray(session?.items) ? session.items : [])
      .map((item) => cleanText(item?.quantity?.text || ""))
      .filter(Boolean)
  )
}

function meaningfulTokens(text) {
  return cleanText(text)
    .split(" ")
    .filter((token) => token.length > 2 && !["just", "did", "with", "plus", "also", "meal", "food", "that", "this", "the"].includes(token))
}

function mealCorrectionRequested(message) {
  return MEAL_CORRECTION_PATTERN.test(cleanText(message))
}

function workoutCorrectionRequested(message) {
  return WORKOUT_CORRECTION_PATTERN.test(cleanText(message))
}

function suppressionRequested(message) {
  return SUPPRESS_SESSION_PATTERN.test(cleanText(message))
}

function repeatRecentMealRequested(message) {
  return REPEAT_RECENT_MEAL_PATTERN.test(cleanText(message))
}

function isExplicitMealStart(message) {
  return MEAL_EXPLICIT_START_PATTERN.test(String(message || "").trim())
}

function isRedundantPersistedMealFollowUp(message, session) {
  const normalized = cleanText(message)
  if (!session?.persisted || !normalized) return false
  if (isExplicitMealStart(normalized)) return false
  if (mealCorrectionRequested(normalized)) return false
  if (MEAL_FINALISE_PATTERN.test(normalized) || MEAL_REFERENCE_PATTERN.test(normalized)) return true

  const summaryText = cleanText(session.persistedSummary || session.summary || "")
  if (!summaryText) return false

  const nameSet = normalizedItemNames(session)
  const quantitySet = normalizedItemQuantities(session)
  const tokens = meaningfulTokens(normalized)
  const referencesKnownItems = tokens.length > 0 && tokens.every((token) => (
    summaryText.includes(token)
    || [...nameSet].some((name) => name.includes(token) || token.includes(name))
    || [...quantitySet].some((quantity) => quantity.includes(token) || token.includes(quantity))
  ))
  return referencesKnownItems
}

function seedLegacyMealSession(session) {
  if (!session?.items?.length) return null
  return {
    ...emptyLegacyMealSession(),
    active: true,
    items: session.items.map((item) => ({
      base_name: item.base_name || item.baseName || "",
      label: item.label || titleCase(item.base_name || item.baseName || ""),
      category: item.category || "food",
      quantity: item.quantity ? { ...item.quantity } : null,
      preparation: Array.isArray(item.preparation) ? [...item.preparation] : [],
      exclusions: Array.isArray(item.exclusions) ? [...item.exclusions] : [],
      attached_to: item.attached_to || item.attachedTo || null,
      relation: item.relation || null,
    })),
    clarificationAttempts: Number(session.clarificationAttempts) || 0,
    clarificationCounts: { ...(session.clarificationCounts || {}) },
    readyToLog: false,
    shouldStopClarifying: false,
    summary: String(session.summary || ""),
    clarifyQuestion: "",
    wantsLogging: Boolean(session.wantsLogging),
    wantsNutrition: Boolean(session.wantsNutrition),
    answerOnly: Boolean(session.answerOnly),
    suppressed: Boolean(session.suppressed),
    suppressionReply: String(session.suppressionReply || ""),
    mealConversation: true,
    lastMainKey: session.lastMainKey || "",
    lastDrinkKey: session.lastDrinkKey || "",
    declaredTotals: Array.isArray(session.declaredTotals) ? session.declaredTotals.map((entry) => ({ ...entry })) : [],
  }
}

function persistedMealMarker(session, recentMessages, currentMessage) {
  const normalized = normalizeMealSession(session)
  return {
    ...normalized,
    active: false,
    readyToLog: false,
    shouldStopClarifying: false,
    clarifyQuestion: "",
    alreadyLogged: true,
    correctionRequested: false,
    answerOnly: false,
    suppressed: false,
    suppressionReply: "",
    thread_messages: buildThreadMessages(recentMessages, currentMessage),
  }
}

function normalizeReferenceMeal(meal = null) {
  if (!meal || typeof meal !== "object") return null
  const foodName = String(meal.food_name || "").trim()
  if (!foodName) return null
  const macros = ["calories", "protein_g", "carbs_g", "fat_g"].every((key) => Number.isFinite(Number(meal[key])))
  if (!macros) return null
  return {
    food_name: foodName,
    meal_type: String(meal.meal_type || "snack").trim() || "snack",
    quantity: String(meal.quantity || "1 meal").trim() || "1 meal",
    calories: Number(meal.calories),
    protein_g: Number(meal.protein_g),
    carbs_g: Number(meal.carbs_g),
    fat_g: Number(meal.fat_g),
    estimated: meal.estimated ?? true,
    nutrition_source: String(meal.nutrition_source || "Copied from your most recent saved meal").trim() || "Copied from your most recent saved meal",
  }
}

function buildRepeatedMealSession(recentMeals = []) {
  const referenceMeal = normalizeReferenceMeal(Array.isArray(recentMeals) ? recentMeals.slice(0, 12).find(Boolean) : null)
  if (!referenceMeal) return null
  return {
    ...emptyMealSessionState(),
    active: true,
    mealConversation: true,
    readyToLog: true,
    shouldStopClarifying: true,
    summary: referenceMeal.food_name,
    clarifyQuestion: "",
    wantsLogging: true,
    wantsNutrition: false,
    referenceMeal,
  }
}

function summariesEquivalent(left, right) {
  return cleanText(left) && cleanText(left) === cleanText(right)
}

function buildMealSessionState(recentMessages = [], currentMessage = "", existingSession = null, recentMeals = []) {
  const prior = normalizeMealSession(existingSession)
  const normalizedCurrent = cleanText(currentMessage)

  if (!prior.active && !prior.persisted && repeatRecentMealRequested(currentMessage)) {
    const repeated = buildRepeatedMealSession(recentMeals)
    if (repeated) {
      return {
        ...repeated,
        thread_messages: buildThreadMessages(recentMessages, currentMessage),
      }
    }
  }

  if (prior.persisted && isRedundantPersistedMealFollowUp(currentMessage, prior)) {
    return persistedMealMarker(prior, recentMessages, currentMessage)
  }

  const startedNewMeal = prior.persisted && isExplicitMealStart(currentMessage) && !mealCorrectionRequested(currentMessage)
  const seededSession = prior.active || (prior.persisted && !startedNewMeal)
    ? seedLegacyMealSession(prior)
    : null
  const next = buildLegacyMealContext(recentMessages, currentMessage, seededSession)
  if (!next) return null

  const correctionRequested = Boolean(prior.persistedMealId && mealCorrectionRequested(currentMessage))
  const merged = {
    ...emptyMealSessionState(),
    ...next,
    persisted: Boolean(prior.persisted && !startedNewMeal),
    persistedMealId: startedNewMeal ? "" : String(prior.persistedMealId || ""),
    persistedSummary: startedNewMeal ? "" : String(prior.persistedSummary || ""),
    persistedAt: startedNewMeal ? "" : String(prior.persistedAt || ""),
    correctionRequested,
    alreadyLogged: false,
  }

  if (
    prior.persisted
    && !startedNewMeal
    && !correctionRequested
    && !MEAL_FINALISE_PATTERN.test(normalizedCurrent)
    && summariesEquivalent(merged.summary, prior.persistedSummary || prior.summary)
  ) {
    return persistedMealMarker({ ...merged, persisted: true, persistedMealId: prior.persistedMealId, persistedSummary: prior.persistedSummary || merged.summary, persistedAt: prior.persistedAt }, recentMessages, currentMessage)
  }

  return merged
}

const cardioAliases = new Map([
  ["incline treadmill", "Incline Treadmill"],
  ["treadmill", "Treadmill"],
  ["bike", "Bike"],
  ["rower", "Rower"],
  ["run", "Run"],
  ["running", "Run"],
  ["walk", "Walk"],
  ["walking", "Walk"],
  ["elliptical", "Elliptical"],
  ["stairmaster", "Stairmaster"],
])

function buildWorkoutClarificationKey(field) {
  return `workout:${field}`
}

function extractWorkoutClarificationTargets(message) {
  const text = cleanText(message)
  const targets = []
  if (/\bhow many reps\b|\bhow much reps\b|\breps did you do\b/.test(text)) targets.push(buildWorkoutClarificationKey("reps"))
  if (/\bhow many sets\b|\bsets did you do\b/.test(text)) targets.push(buildWorkoutClarificationKey("sets"))
  if (/\bhow much weight\b|\bwhat weight\b|\bwhat load\b/.test(text)) targets.push(buildWorkoutClarificationKey("weight"))
  if (/\bhow long\b|\bhow many minutes\b|\bduration\b/.test(text)) targets.push(buildWorkoutClarificationKey("duration"))
  if (/\bwhich exercise\b|\bwhat exercise\b|\bwhat movement\b/.test(text)) targets.push(buildWorkoutClarificationKey("exercise"))
  return [...new Set(targets)]
}

function collectWorkoutClarificationStats(recentMessages = []) {
  const counts = {}
  let total = 0
  for (const entry of safeRecentMessages(recentMessages, 12)) {
    if (entry?.role !== "assistant") continue
    const targets = extractWorkoutClarificationTargets(String(entry.content || ""))
    if (!targets.length) continue
    total += 1
    for (const target of targets) counts[target] = (counts[target] || 0) + 1
  }
  return { counts, total }
}

function isWorkoutAssistantMessage(message) {
  return extractWorkoutClarificationTargets(message).length > 0
}

function workoutReferenceMessage(message) {
  return /\b(?:that workout|that set|that session|the workout|the set|those reps|same thing)\b/.test(cleanText(message))
}

function normalizeExerciseName(value) {
  const text = cleanText(value)
    .replace(/\b\d+(?:\.\d+)?\s*kg\b/g, " ")
    .replace(/\b\d+\s*sets?\b/g, " ")
    .replace(/\b\d+\s*reps?\b/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(?:min|mins|minutes)\b/g, " ")
    .replace(/\b(?:i|did|done|completed|finished|just|log|logged|save|saved|track|tracked|for|of|sets?|reps?|kg|min|minutes)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!text) return ""
  if (!/[a-z]/i.test(text)) return ""

  const matched = WORKOUT_EXERCISES.find((exercise) => text.includes(exercise))
  if (matched) return cardioAliases.get(matched) || titleCase(matched)

  const beforeNumber = text.split(/\d/)[0].trim()
  if (!beforeNumber && !/[a-z]/i.test(text)) return ""
  return titleCase(beforeNumber || text)
}

function looksLikeStandaloneMealMessage(message) {
  const mealContext = buildLegacyMealContext([], message, emptyLegacyMealSession())
  return Array.isArray(mealContext?.items) && mealContext.items.length > 0
}

function extractWorkoutThread(recentMessages = [], currentMessage = "", existingSession = null) {
  const normalizedCurrent = cleanText(currentMessage)
  const history = safeRecentMessages(recentMessages, 18)
  const currentParsedWorkout = parseWorkoutMessage(currentMessage)
  const currentLooksMealLike = looksLikeStandaloneMealMessage(currentMessage)
  const hasExistingWorkoutContext = Boolean(existingSession?.active || existingSession?.persisted)
  const currentLooksWorkoutLike = WORKOUT_START_PATTERN.test(normalizedCurrent)
    || workoutReferenceMessage(normalizedCurrent)
    || Boolean(
      currentParsedWorkout?.exercise_name
      || currentParsedWorkout?.weight_kg
      || currentParsedWorkout?.sets
      || currentParsedWorkout?.reps
      || currentParsedWorkout?.duration_seconds
      || currentParsedWorkout?.distance_km
    )
  const shouldTrack = WORKOUT_START_PATTERN.test(normalizedCurrent)
    || (workoutCorrectionRequested(currentMessage) && !currentLooksMealLike && (currentLooksWorkoutLike || existingSession?.active || existingSession?.persisted))
    || (suppressionRequested(currentMessage) && (existingSession?.active || existingSession?.persisted))
    || (WORKOUT_FINALISE_PATTERN.test(normalizedCurrent) && hasExistingWorkoutContext)
    || (existingSession?.active && (/\d/.test(normalizedCurrent) || workoutReferenceMessage(normalizedCurrent)))
    || (existingSession?.persisted && !isExplicitMealStart(normalizedCurrent) && (/\d/.test(normalizedCurrent) || workoutReferenceMessage(normalizedCurrent)))

  if (!shouldTrack) return []

  const thread = [{ role: "user", content: currentMessage }]
  let workoutAssistantSeen = false
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index]
    const text = String(entry.content || "")
    if (entry.role === "assistant") {
      if (isWorkoutAssistantMessage(text)) {
        thread.unshift(entry)
        workoutAssistantSeen = true
        continue
      }
      if (thread.length > 1) break
      continue
    }
    const hasWorkoutContext = workoutAssistantSeen || existingSession?.active || existingSession?.persisted
    if (
      WORKOUT_START_PATTERN.test(text)
      || workoutReferenceMessage(text)
      || (hasWorkoutContext && /\d/.test(text))
      || (workoutCorrectionRequested(text) && (WORKOUT_START_PATTERN.test(text) || hasWorkoutContext))
    ) {
      thread.unshift(entry)
      continue
    }
    if (thread.length > 1) break
  }
  return thread
}

function emptyParsedWorkoutState() {
  return {
    active: false,
    workoutConversation: false,
    exercise_name: "",
    workout_type: "",
    muscle_group: "full_body",
    sets: 0,
    reps: 0,
    weight_kg: 0,
    duration_seconds: 0,
    distance_km: 0,
    clarificationAttempts: 0,
    clarificationCounts: {},
    readyToLog: false,
    shouldStopClarifying: false,
    clarifyQuestion: "",
    summary: "",
    wantsLogging: false,
    persisted: false,
    persistedWorkoutId: "",
    persistedSummary: "",
    persistedAt: "",
    alreadyLogged: false,
    correctionRequested: false,
    thread_messages: [],
  }
}

function mergeWorkoutMetrics(state, patch = {}) {
  if (patch.exercise_name) {
    state.exercise_name = patch.exercise_name
    state.workout_type = patch.workout_type || patch.exercise_name
  }
  if (patch.workout_type) state.workout_type = patch.workout_type
  if (patch.muscle_group) state.muscle_group = patch.muscle_group
  if (Number.isFinite(patch.sets) && patch.sets > 0) state.sets = patch.sets
  if (Number.isFinite(patch.reps) && patch.reps > 0) state.reps = patch.reps
  if (Number.isFinite(patch.weight_kg) && patch.weight_kg > 0) state.weight_kg = patch.weight_kg
  if (Number.isFinite(patch.duration_seconds) && patch.duration_seconds > 0) state.duration_seconds = patch.duration_seconds
  if (Number.isFinite(patch.distance_km) && patch.distance_km > 0) state.distance_km = patch.distance_km
}

function parseWorkoutMessage(message) {
  const text = cleanText(message)
  if (!text) return null

  const cardioMatch = text.match(/(?:(?<minutes>\d+(?:\.\d+)?)\s*(?:min|mins|minutes)\s*(?<exercise>incline treadmill|treadmill|bike|rower|run|running|walk|walking|elliptical|stairmaster))|(?<exercise2>incline treadmill|treadmill|bike|rower|run|running|walk|walking|elliptical|stairmaster)\s*(?:for)?\s*(?<minutes2>\d+(?:\.\d+)?)\s*(?:min|mins|minutes)/)
  if (cardioMatch?.groups) {
    const exercise = cardioAliases.get(cardioMatch.groups.exercise || cardioMatch.groups.exercise2 || "") || titleCase(cardioMatch.groups.exercise || cardioMatch.groups.exercise2 || "Cardio")
    const minutes = Number(cardioMatch.groups.minutes || cardioMatch.groups.minutes2 || 0)
    return {
      exercise_name: exercise,
      workout_type: exercise,
      muscle_group: "cardio",
      sets: 1,
      reps: 0,
      weight_kg: 0,
      duration_seconds: minutes > 0 ? minutes * 60 : 0,
      distance_km: 0,
    }
  }

  const durationOnly = text.match(/(?<minutes>\d+(?:\.\d+)?)\s*(?:min|mins|minutes)\b/)
  if (durationOnly?.groups?.minutes) {
    return {
      exercise_name: "",
      workout_type: "",
      muscle_group: "cardio",
      sets: 1,
      reps: 0,
      weight_kg: 0,
      duration_seconds: Number(durationOnly.groups.minutes) * 60,
      distance_km: 0,
    }
  }

  const xPattern = text.match(/(?<exercise>[a-z][a-z\s'/-]+?)\s+(?<weight>\d+(?:\.\d+)?)\s*kg?\s*x\s*(?<reps>\d+)\s*x\s*(?<sets>\d+)/)
  const setsPattern = text.match(/(?<exercise>[a-z][a-z\s'/-]+?)\s+(?<weight>\d+(?:\.\d+)?)\s*kg?\s*(?:for\s*)?(?<sets>\d+)\s*sets?\s*(?:of|x)?\s*(?<reps>\d+)/)
  const simplePattern = text.match(/(?<exercise>[a-z][a-z\s'/-]+?)\s+(?<weight>\d+(?:\.\d+)?)\s*kg?\s*(?:for|x)?\s*(?<reps>\d+)\s*reps?/)
  const metricsOnlyPattern = text.match(/^(?<weight>\d+(?:\.\d+)?)\s*kg?\s*(?:for\s*)?(?<sets>\d+)\s*sets?\s*(?:of|x)?\s*(?<reps>\d+)\b/)
  const bodyweightPattern = text.match(/(?<exercise>[a-z][a-z\s'/-]+?)\s+(?<sets>\d+)\s*sets?\s*(?:of|x)?\s*(?<reps>\d+)/)
  const match = xPattern || setsPattern || simplePattern || metricsOnlyPattern || bodyweightPattern
  if (match?.groups) {
    const exercise = normalizeExerciseName(match.groups.exercise)
    return {
      exercise_name: exercise,
      workout_type: exercise,
      muscle_group: cardioAliases.has(cleanText(exercise)) ? "cardio" : "full_body",
      sets: Number(match.groups.sets || 1),
      reps: Number(match.groups.reps || 0),
      weight_kg: Number(match.groups.weight || 0),
      duration_seconds: 0,
      distance_km: 0,
    }
  }

  const weightOnly = text.match(/(?<weight>\d+(?:\.\d+)?)\s*kg\b/)
  const setsOnly = text.match(/(?<sets>\d+)\s*sets?\b/)
  const repsOnly = text.match(/(?<reps>\d+)\s*reps?\b|\bof\s*(?<reps2>\d+)\b/)
  const exerciseOnly = normalizeExerciseName(text)
  const knownExerciseOnly = WORKOUT_EXERCISES.some((exercise) => text.includes(exercise))
  const genericExerciseOnly = Boolean(
    exerciseOnly
    && text.split(/\s+/).filter(Boolean).length <= 4
    && !looksLikeStandaloneMealMessage(text)
  )
  if (weightOnly || setsOnly || repsOnly || knownExerciseOnly || genericExerciseOnly) {
    return {
      exercise_name: exerciseOnly || "",
      workout_type: exerciseOnly || "",
      muscle_group: cardioAliases.has(cleanText(exerciseOnly)) ? "cardio" : "full_body",
      sets: Number(setsOnly?.groups?.sets || 0),
      reps: Number(repsOnly?.groups?.reps || repsOnly?.groups?.reps2 || 0),
      weight_kg: Number(weightOnly?.groups?.weight || 0),
      duration_seconds: 0,
      distance_km: 0,
    }
  }

  return null
}

function buildWorkoutSummary(state) {
  if (!state.exercise_name) return ""
  if (state.muscle_group === "cardio" && state.duration_seconds > 0) {
    return `${Math.round(state.duration_seconds / 60)} min ${state.exercise_name}`
  }
  const parts = [state.exercise_name]
  if (state.weight_kg > 0) parts.push(`${state.weight_kg}kg`)
  const sets = state.sets > 0 ? state.sets : 1
  if (state.reps > 0) parts.push(`for ${sets} set${sets === 1 ? "" : "s"} of ${state.reps}`)
  return parts.join(" ")
}

function buildWorkoutClarifyQuestion(state) {
  const missingExerciseAttempts = state.clarificationCounts[buildWorkoutClarificationKey("exercise")] || 0
  const missingRepsAttempts = state.clarificationCounts[buildWorkoutClarificationKey("reps")] || 0
  const missingDurationAttempts = state.clarificationCounts[buildWorkoutClarificationKey("duration")] || 0

  if (!state.exercise_name && missingExerciseAttempts < 2) return "What exercise or cardio did you do?"
  if (state.muscle_group === "cardio" || cardioAliases.has(cleanText(state.exercise_name))) {
    if (!state.duration_seconds && !state.distance_km && missingDurationAttempts < 2) return `How long did you do ${state.exercise_name || "that cardio"} for?`
    return ""
  }
  if (!state.reps && missingRepsAttempts < 2) return `How many reps did you do${state.exercise_name ? ` for ${state.exercise_name}` : ""}?`
  return ""
}

function isRedundantPersistedWorkoutFollowUp(message, session) {
  const normalized = cleanText(message)
  if (!session?.persisted || !normalized) return false
  if (workoutCorrectionRequested(normalized)) return false
  if (WORKOUT_FINALISE_PATTERN.test(normalized) || workoutReferenceMessage(normalized)) return true
  const summary = cleanText(session.persistedSummary || session.summary || "")
  if (!summary) return false
  const tokens = meaningfulTokens(normalized)
  return tokens.length > 0 && tokens.every((token) => summary.includes(token))
}

function buildWorkoutSessionState(recentMessages = [], currentMessage = "", existingSession = null) {
  const prior = normalizeWorkoutSession(existingSession)
  const normalizedCurrent = cleanText(currentMessage)
  const correctionRequested = Boolean(prior.persistedWorkoutId && workoutCorrectionRequested(currentMessage))
  const suppressed = suppressionRequested(currentMessage)

  if (prior.persisted && isRedundantPersistedWorkoutFollowUp(currentMessage, prior)) {
    return {
      ...prior,
      active: false,
      readyToLog: false,
      clarifyQuestion: "",
      alreadyLogged: true,
      correctionRequested: false,
      thread_messages: buildThreadMessages(recentMessages, currentMessage),
    }
  }

  const thread = extractWorkoutThread(recentMessages, currentMessage, prior)
  if (!thread.length) return null

  const clarificationStats = collectWorkoutClarificationStats(thread)
  const state = {
    ...emptyWorkoutSessionState(),
    clarificationAttempts: Math.max(clarificationStats.total, Number(prior.clarificationAttempts) || 0),
    clarificationCounts: { ...(prior.clarificationCounts || {}), ...(clarificationStats.counts || {}) },
    persisted: Boolean(prior.persisted),
    persistedWorkoutId: String(prior.persistedWorkoutId || ""),
    persistedSummary: String(prior.persistedSummary || ""),
    persistedAt: String(prior.persistedAt || ""),
    correctionRequested,
    thread_messages: thread,
    active: true,
    workoutConversation: true,
    wantsLogging: true,
    suppressed,
    suppressionReply: suppressed ? "Okay, I won't save that." : "",
  }

  if ((prior.active || prior.persisted) && !isExplicitMealStart(normalizedCurrent)) {
    mergeWorkoutMetrics(state, prior)
  }

  for (const entry of thread) {
    if (entry.role !== "user") continue
    const parsed = parseWorkoutMessage(entry.content)
    if (parsed) mergeWorkoutMetrics(state, parsed)
  }

  if (!state.sets && state.reps) state.sets = 1
  const canDefaultReps = (state.clarificationCounts[buildWorkoutClarificationKey("reps")] || 0) >= 2 || WORKOUT_FINALISE_PATTERN.test(normalizedCurrent)
  if (!state.reps && state.exercise_name && !cardioAliases.has(cleanText(state.exercise_name)) && canDefaultReps) {
    state.reps = 1
  }
  const isCardio = state.muscle_group === "cardio" || cardioAliases.has(cleanText(state.exercise_name))
  state.summary = buildWorkoutSummary(state)
  state.clarifyQuestion = buildWorkoutClarifyQuestion(state)
  state.shouldStopClarifying = Boolean(!state.clarifyQuestion && state.clarificationAttempts >= 2)
  state.readyToLog = isCardio
    ? Boolean(state.exercise_name && (state.duration_seconds > 0 || state.distance_km > 0))
    : Boolean(state.exercise_name && state.reps > 0)

  if (suppressed) {
    state.readyToLog = false
    state.clarifyQuestion = ""
    state.active = false
    state.workoutConversation = false
    state.exercise_name = ""
    state.workout_type = ""
    state.weight_kg = 0
    state.sets = 0
    state.reps = 0
    state.duration_seconds = 0
    state.distance_km = 0
    state.summary = ""
  }

  if (
    prior.persisted
    && !correctionRequested
    && !WORKOUT_START_PATTERN.test(normalizedCurrent)
    && cleanText(state.summary)
    && cleanText(state.summary) === cleanText(prior.persistedSummary || prior.summary || "")
  ) {
    return {
      ...state,
      active: false,
      readyToLog: false,
      clarifyQuestion: "",
      alreadyLogged: true,
    }
  }

  return state
}

export function emptyMealSessionState() {
  return {
    ...emptyLegacyMealSession(),
    referenceMeal: null,
    persisted: false,
    persistedMealId: "",
    persistedSummary: "",
    persistedAt: "",
    alreadyLogged: false,
    correctionRequested: false,
    suppressed: false,
    suppressionReply: "",
    thread_messages: [],
  }
}

export function emptyWorkoutSessionState() {
  return {
    active: false,
    workoutConversation: false,
    exercise_name: "",
    workout_type: "",
    muscle_group: "full_body",
    sets: 0,
    reps: 0,
    weight_kg: 0,
    duration_seconds: 0,
    distance_km: 0,
    clarificationAttempts: 0,
    clarificationCounts: {},
    readyToLog: false,
    shouldStopClarifying: false,
    clarifyQuestion: "",
    summary: "",
    wantsLogging: false,
    persisted: false,
    persistedWorkoutId: "",
    persistedSummary: "",
    persistedAt: "",
    alreadyLogged: false,
    correctionRequested: false,
    thread_messages: [],
  }
}

export function buildCoachSessionState({
  recentMessages = [],
  currentMessage = "",
  mealSession = null,
  workoutSession = null,
  recentMeals = [],
} = {}) {
  return {
    mealSession: buildMealSessionState(recentMessages, currentMessage, mealSession, recentMeals),
    workoutSession: buildWorkoutSessionState(recentMessages, currentMessage, workoutSession),
  }
}
