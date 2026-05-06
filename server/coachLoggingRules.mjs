export function safeArray(value, limit = 8) {
  return Array.isArray(value) ? value.slice(0, limit) : []
}

export function safeNumber(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

export function titleCase(text) {
  return String(text || "")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}

const COUNT_UNITS = new Set(["egg", "slice", "cup", "tin", "can", "block", "bunch", "serve", "bowl", "plate", "mug", "tbsp", "tsp"])
const MASS_UNITS = new Map([["g", 1], ["kg", 1000]])
const VOLUME_UNITS = new Map([["ml", 1], ["l", 1000]])

const PORTION_PATTERN = /(?<amount>\d+(?:\.\d+)?)\s*(?:large|medium|small|fresh|squeezed|salted|unsalted|wholemeal|wholegrain|rye)?\s*(?<unit>kg|g|ml|l|tbsp|tablespoons?|tsp|teaspoons?|cups?|slices?|tins?|cans?|blocks?|bunch(?:es)?|serves?|servings?|bowls?|plates?|mugs?|eggs?)\b/i

function roundMacro(value) {
  return Math.round((Number(value) || 0) * 10) / 10
}

function normalizeUnit(unit) {
  const text = String(unit || "").trim().toLowerCase()
  if (!text) return ""
  if (text === "tablespoon" || text === "tablespoons") return "tbsp"
  if (text === "teaspoon" || text === "teaspoons") return "tsp"
  if (text === "cups") return "cup"
  if (text === "slices") return "slice"
  if (text === "tins") return "tin"
  if (text === "cans") return "can"
  if (text === "blocks") return "block"
  if (text === "bunches") return "bunch"
  if (text === "servings" || text === "serving" || text === "serves") return "serve"
  if (text === "bowls") return "bowl"
  if (text === "plates") return "plate"
  if (text === "mugs") return "mug"
  if (text === "eggs") return "egg"
  return text
}

function parsePortion(quantity) {
  const text = String(quantity || "").trim().toLowerCase()
  if (!text) return null
  const match = text.match(PORTION_PATTERN)
  if (!match?.groups) return null
  const amount = Number(match.groups.amount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return {
    amount,
    unit: normalizeUnit(match.groups.unit),
  }
}

function normalizeItemQuantity(quantity) {
  if (!quantity) return null
  if (Number.isFinite(Number(quantity.amount)) && quantity.unit) {
    return {
      amount: Number(quantity.amount),
      unit: normalizeUnit(quantity.unit),
    }
  }
  return parsePortion(quantity.text || "")
}

function toComparableAmount(quantity) {
  if (!quantity?.unit || !Number.isFinite(quantity.amount)) return null
  if (MASS_UNITS.has(quantity.unit)) return { group: "mass", amount: quantity.amount * MASS_UNITS.get(quantity.unit) }
  if (VOLUME_UNITS.has(quantity.unit)) return { group: "volume", amount: quantity.amount * VOLUME_UNITS.get(quantity.unit) }
  if (COUNT_UNITS.has(quantity.unit)) return { group: quantity.unit, amount: quantity.amount }
  return null
}

function scaleFromPortions(itemQuantity, servingQuantity) {
  const itemComparable = toComparableAmount(itemQuantity)
  const servingComparable = toComparableAmount(servingQuantity)
  if (!itemComparable || !servingComparable) return 1
  if (itemComparable.group !== servingComparable.group) return 1
  if (!servingComparable.amount) return 1
  return itemComparable.amount / servingComparable.amount
}

function baseNameMatches(candidate, baseName) {
  const normalizedBase = String(baseName || "").trim().toLowerCase()
  if (!normalizedBase) return 0
  const candidateTerms = [
    String(candidate?.name || "").toLowerCase(),
    ...safeArray(candidate?.aliases, 8).map((alias) => String(alias || "").toLowerCase()),
  ]
  if (candidateTerms.some((term) => term === normalizedBase)) return 5
  if (candidateTerms.some((term) => term.includes(normalizedBase) || normalizedBase.includes(term))) return 3
  const baseWords = normalizedBase.split(/\s+/).filter(Boolean)
  const sharedWords = candidateTerms.reduce((best, term) => {
    const score = baseWords.filter((word) => term.includes(word)).length
    return Math.max(best, score)
  }, 0)
  return sharedWords
}

function chooseBestCandidate(item, candidateFoodMatches = {}) {
  const keys = [
    String(item.baseName || "").toLowerCase(),
    String(item.label || "").toLowerCase(),
  ].filter(Boolean)

  const candidates = []
  for (const key of keys) {
    for (const match of safeArray(candidateFoodMatches[key], 8)) {
      candidates.push(match)
    }
  }
  for (const [key, matches] of Object.entries(candidateFoodMatches || {})) {
    if (keys.includes(String(key).toLowerCase())) continue
    for (const match of safeArray(matches, 4)) {
      candidates.push(match)
    }
  }

  let best = null
  let bestScore = -1
  for (const candidate of candidates) {
    const score = baseNameMatches(candidate, item.baseName || item.label)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return bestScore > 0 ? best : null
}

function scaleNutrition(base, ratio) {
  return {
    calories: Math.round((Number(base.calories) || 0) * ratio),
    protein_g: roundMacro((Number(base.protein_g) || 0) * ratio),
    carbs_g: roundMacro((Number(base.carbs_g) || 0) * ratio),
    fat_g: roundMacro((Number(base.fat_g) || 0) * ratio),
  }
}

function fallbackProfileForItem(item) {
  const baseName = String(item.baseName || item.label || "").toLowerCase()
  const exclusions = safeArray(item.exclusions, 8).map((entry) => String(entry || "").toLowerCase())

  if (baseName.includes("egg")) {
    return {
      serving: { amount: 1, unit: "egg" },
      macros: { calories: 74, protein_g: 6.3, carbs_g: 0.55, fat_g: 5.1 },
    }
  }

  if (baseName.includes("butter")) {
    return {
      serving: { amount: 100, unit: "g" },
      macros: { calories: 717, protein_g: 0.9, carbs_g: 0.1, fat_g: 81.1 },
    }
  }

  if (baseName.includes("olive oil") || baseName.endsWith(" oil")) {
    return {
      serving: { amount: 100, unit: "g" },
      macros: { calories: 884, protein_g: 0, carbs_g: 0, fat_g: 100 },
    }
  }

  if (baseName.includes("vegemite")) {
    return {
      serving: { amount: 1, unit: "tbsp" },
      macros: { calories: 36, protein_g: 3.1, carbs_g: 2.6, fat_g: 0.1 },
    }
  }

  if (baseName.includes("toast") || baseName.includes("bread")) {
    return {
      serving: { amount: 1, unit: "slice" },
      macros: { calories: 94, protein_g: 4, carbs_g: 15.5, fat_g: 1.4 },
    }
  }

  if (baseName.includes("tea") || baseName.includes("coffee") || baseName.includes("water")) {
    if (exclusions.includes("no sugar") && exclusions.includes("no milk")) {
      return {
        serving: { amount: 250, unit: "ml" },
        macros: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      }
    }
    return {
      serving: { amount: 250, unit: "ml" },
      macros: { calories: 10, protein_g: 0, carbs_g: 2, fat_g: 0 },
    }
  }

  if (baseName.includes("juice")) {
    return {
      serving: { amount: 250, unit: "ml" },
      macros: { calories: 110, protein_g: 0.5, carbs_g: 26, fat_g: 0.2 },
    }
  }

  if (item.category === "ingredient") {
    return {
      serving: { amount: 1, unit: "tbsp" },
      macros: { calories: 60, protein_g: 0.5, carbs_g: 2, fat_g: 5 },
    }
  }

  if (item.category === "drink") {
    return {
      serving: { amount: 250, unit: "ml" },
      macros: { calories: 60, protein_g: 0.5, carbs_g: 14, fat_g: 0.2 },
    }
  }

  return {
    serving: { amount: 1, unit: "serve" },
    macros: { calories: 180, protein_g: 12, carbs_g: 18, fat_g: 6 },
  }
}

function estimateItemMacros(item, candidateFoodMatches = {}) {
  const candidate = chooseBestCandidate(item, candidateFoodMatches)
  const itemQuantity = normalizeItemQuantity(item.quantity)

  if (candidate) {
    const servingQuantity = parsePortion(candidate.quantity || "")
    const ratio = itemQuantity ? scaleFromPortions(itemQuantity, servingQuantity) : 1
    return scaleNutrition(candidate, ratio || 1)
  }

  const fallback = fallbackProfileForItem(item)
  const ratio = itemQuantity ? scaleFromPortions(itemQuantity, fallback.serving) : 1
  return scaleNutrition(fallback.macros, ratio || 1)
}

function estimateMealMacros(mealSession, candidateFoodMatches = {}) {
  const items = safeArray(mealSession?.items, 16)
  if (!items.length) return null
  return items.reduce((totals, item) => {
    const next = estimateItemMacros(item, candidateFoodMatches)
    return {
      calories: totals.calories + next.calories,
      protein_g: roundMacro(totals.protein_g + next.protein_g),
      carbs_g: roundMacro(totals.carbs_g + next.carbs_g),
      fat_g: roundMacro(totals.fat_g + next.fat_g),
    }
  }, {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  })
}

export function normalizeAction(action) {
  return action && typeof action === "object" && typeof action.type === "string" ? action : null
}

export function replyClaimsPersistence(reply) {
  return /\b(logged|saved|tracked|added|recorded|updated)\b/i.test(String(reply || ""))
}

export function isPersistenceAction(action) {
  return ["log_meal", "update_meal_log", "log_workout", "update_workout_log"].includes(action?.type)
}

export function isMealPersistenceAction(action) {
  return action?.type === "log_meal" || action?.type === "update_meal_log"
}

export function isWorkoutPersistenceAction(action) {
  return action?.type === "log_workout" || action?.type === "update_workout_log"
}

export function hasMealMacros(action) {
  return ["calories", "protein_g", "carbs_g", "fat_g"].every((key) => Number.isFinite(Number(action?.[key])))
}

export function extractReplyMacros(reply) {
  const text = String(reply || "")
  const match = text.match(
    /(\d[\d,]*(?:\.\d+)?)\s*calories?.*?(\d[\d,]*(?:\.\d+)?)g\s*protein.*?(\d[\d,]*(?:\.\d+)?)g\s*(?:carbs?|carbohydrates).*?(\d[\d,]*(?:\.\d+)?)g\s*fat/i
  )
  if (!match) return null
  const [calories, protein_g, carbs_g, fat_g] = match.slice(1).map(safeNumber)
  if (![calories, protein_g, carbs_g, fat_g].every((value) => value !== null)) return null
  return { calories, protein_g, carbs_g, fat_g }
}

export function inferMealTypeFromPrompt(prompt) {
  const text = String(prompt || "").toLowerCase()
  if (text.includes("breakfast")) return "breakfast"
  if (text.includes("lunch")) return "lunch"
  if (text.includes("dinner")) return "dinner"
  return "snack"
}

export function summarizeCoachAction(action) {
  if (!action || typeof action !== "object") return ""

  if (action.type === "create_workout_plan") {
    return `I mapped out ${String(action.title || "your workout").trim()} and attached it below.`
  }

  if (action.type === "create_meal_plan") {
    return "I put together a meal plan and saved it for today."
  }

  if (action.type === "log_workout") {
    return `Saved to Workouts: ${String(action.workout_type || action.exercise_name || "your workout").trim()}.`
  }

  if (action.type === "update_workout_log") {
    return `Updated your workout log for ${String(action.workout_type || action.exercise_name || "that session").trim()}.`
  }

  if (action.type === "log_meal") {
    return `Saved to today's nutrition: ${String(action.food_name || "that meal").trim()}.`
  }

  if (action.type === "update_meal_log") {
    return `Updated today's nutrition entry for ${String(action.food_name || "that meal").trim()}.`
  }

  if (action.type === "update_targets") {
    return "I updated your targets."
  }

  if (action.type === "clarify") {
    return String(action.message || "").trim()
  }

  return ""
}

export function normalizeMealAction(action) {
  if (!action || typeof action !== "object") return action
  if (!isMealPersistenceAction(action)) return action

  const foodName = String(action.food_name || action.name || "").trim()
  const quantity =
    typeof action.quantity === "number"
      ? String(action.quantity)
      : String(action.quantity || "").trim()

  return {
    ...action,
    estimated: action.estimated ?? true,
    ...(foodName ? { food_name: foodName } : {}),
    ...(quantity ? { quantity } : {}),
    nutrition_source:
      action.nutrition_source ||
      "Coach estimate from user-described ingredients and amounts",
  }
}

export function shouldAllowAction(action) {
  if (!action || typeof action !== "object") return false

  if (isMealPersistenceAction(action)) {
    return hasMealMacros(action) && String(action.food_name || "").trim()
  }

  if (isWorkoutPersistenceAction(action)) {
    return Boolean(String(action.exercise_name || action.workout_type || "").trim())
  }

  return true
}

function firstMealAction(actions = []) {
  return safeArray(actions, 8).find(isMealPersistenceAction) || null
}

function firstWorkoutAction(actions = []) {
  return safeArray(actions, 8).find(isWorkoutPersistenceAction) || null
}

export function deterministicClarifyActionFromSession(session) {
  if (!session?.clarifyQuestion) return null
  return {
    type: "clarify",
    message: session.clarifyQuestion,
  }
}

export function deterministicAlreadyLoggedReply(session, kind = "meal") {
  if (!session?.persistedSummary && !session?.summary) {
    return kind === "meal"
      ? "I already saved that meal. If you want to change it, tell me what to update."
      : "I already saved that workout. If you want to change it, tell me what to update."
  }

  const summary = String(session.persistedSummary || session.summary || "").trim()
  return kind === "meal"
    ? `I already saved ${summary} in today's nutrition log. If you want to change it, tell me what to update.`
    : `I already saved ${summary} in Workouts. If you want to change it, tell me what to update.`
}

export function buildDeterministicMealAction({ mealSession, explicitActions = [], prompt = "", candidateFoodMatches = {}, allowAnswerOnly = false }) {
  if (!mealSession?.readyToLog || mealSession?.alreadyLogged || mealSession?.suppressed || (mealSession?.answerOnly && !allowAnswerOnly)) return null
  const shouldPersist =
    mealSession?.wantsLogging !== false
    || mealSession?.correctionRequested
    || mealSession?.referenceMeal
    || (allowAnswerOnly && mealSession?.answerOnly)
  if (!shouldPersist) return null

  const explicit = firstMealAction(explicitActions)
  const macros = hasMealMacros(explicit)
    ? {
        calories: Number(explicit.calories),
        protein_g: Number(explicit.protein_g),
        carbs_g: Number(explicit.carbs_g),
        fat_g: Number(explicit.fat_g),
      }
    : mealSession?.macros && hasMealMacros(mealSession.macros)
      ? {
          calories: Number(mealSession.macros.calories),
          protein_g: Number(mealSession.macros.protein_g),
          carbs_g: Number(mealSession.macros.carbs_g),
          fat_g: Number(mealSession.macros.fat_g),
        }
      : mealSession?.referenceMeal && hasMealMacros(mealSession.referenceMeal)
        ? {
            calories: Number(mealSession.referenceMeal.calories),
            protein_g: Number(mealSession.referenceMeal.protein_g),
            carbs_g: Number(mealSession.referenceMeal.carbs_g),
            fat_g: Number(mealSession.referenceMeal.fat_g),
          }
        : estimateMealMacros(mealSession, candidateFoodMatches)

  if (!macros) return null

  return normalizeMealAction({
    type: mealSession.persistedMealId && mealSession.correctionRequested ? "update_meal_log" : "log_meal",
    ...(mealSession.persistedMealId && mealSession.correctionRequested ? { meal_id: mealSession.persistedMealId } : {}),
    meal_type: explicit?.meal_type || mealSession?.referenceMeal?.meal_type || inferMealTypeFromPrompt(prompt),
    food_name: mealSession.summary || mealSession?.referenceMeal?.food_name || "",
    quantity: explicit?.quantity || mealSession?.referenceMeal?.quantity || "1 meal",
    estimated: explicit?.estimated ?? true,
    nutrition_source: typeof explicit?.nutrition_source === "string" && explicit.nutrition_source.trim()
      ? explicit.nutrition_source.trim()
      : mealSession?.referenceMeal?.nutrition_source || "Coach estimate from accumulated meal details across chat",
    ...macros,
  })
}

export function buildDeterministicWorkoutAction({ workoutSession, explicitActions = [] }) {
  if (!workoutSession?.readyToLog || workoutSession?.alreadyLogged || workoutSession?.suppressed) return null

  const explicit = firstWorkoutAction(explicitActions)
  const exerciseName = String(workoutSession.exercise_name || explicit?.exercise_name || explicit?.workout_type || "").trim()
  if (!exerciseName) return null

  return {
    type: workoutSession.persistedWorkoutId && workoutSession.correctionRequested ? "update_workout_log" : "log_workout",
    ...(workoutSession.persistedWorkoutId && workoutSession.correctionRequested ? { workout_id: workoutSession.persistedWorkoutId } : {}),
    exercise_name: exerciseName,
    workout_type: String(workoutSession.workout_type || explicit?.workout_type || exerciseName).trim(),
    muscle_group: workoutSession.muscle_group || explicit?.muscle_group || "full_body",
    sets: Number(workoutSession.sets || explicit?.sets || 1),
    reps: Number(workoutSession.reps || explicit?.reps || 0),
    weight_kg: Number(workoutSession.weight_kg || explicit?.weight_kg || 0),
    duration_seconds: Number(workoutSession.duration_seconds || explicit?.duration_seconds || 0),
    distance_km: Number(workoutSession.distance_km || explicit?.distance_km || 0),
  }
}

export function formatDeterministicMealAnswer(action) {
  if (!action) return ""
  return `That comes to about ${Math.round(Number(action.calories) || 0)} kcal, ${Math.round(Number(action.protein_g) || 0)}g protein, ${Math.round(Number(action.carbs_g) || 0)}g carbs, and ${Math.round(Number(action.fat_g) || 0)}g fat. Tell me if you want me to save it.`
}
