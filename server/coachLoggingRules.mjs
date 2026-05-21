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
const COUNT_REQUIRED_LOOSE_ESTIMATE_BASES = new Set(["egg"])
const TRAILING_LOG_COMMAND_PATTERN = /\s+\b(?:(?:can|could)\s+you|please|just)?\s*(?:log|save|track|add)\s+(?:all\s+that|that|it)\b.*$/i

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
  return /\b(logged|saved|tracked|added|recorded|updated|deleted|removed)\b/i.test(String(reply || ""))
}

export function isPersistenceAction(action) {
  return ["log_meal", "update_meal_log", "delete_meal_log", "log_workout", "update_workout_log", "delete_workout_log"].includes(action?.type)
}

export function isMealPersistenceAction(action) {
  return action?.type === "log_meal" || action?.type === "update_meal_log" || action?.type === "delete_meal_log"
}

export function isWorkoutPersistenceAction(action) {
  return action?.type === "log_workout" || action?.type === "update_workout_log" || action?.type === "delete_workout_log"
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

const NUTRITION_STATUS_QUESTION_PATTERN = /^(?:what(?:'s|s| is)?|how(?:'s|s| is| much| many)?|am i|do i|have i)\b/i

function optionalNumber(value) {
  return value === undefined || value === null || value === ""
    ? null
    : safeNumber(value)
}

function sumRecentMealTotals(recentMeals = [], today = "") {
  const normalizedToday = String(today || "").trim()
  return safeArray(recentMeals, 24)
    .filter((meal) => {
      if (!normalizedToday) return true
      return String(meal?.date || "").slice(0, 10) === normalizedToday
    })
    .reduce((totals, meal) => ({
      calories: totals.calories + (safeNumber(meal?.calories) || 0),
      protein_g: roundMacro(totals.protein_g + (safeNumber(meal?.protein_g) || 0)),
      carbs_g: roundMacro(totals.carbs_g + (safeNumber(meal?.carbs_g) || 0)),
      fat_g: roundMacro(totals.fat_g + (safeNumber(meal?.fat_g) || 0)),
    }), {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    })
}

function resolveNutritionStatusSnapshot({ coachContext = {}, profile = {}, recentMeals = [] } = {}) {
  const contextProfile = coachContext?.profile && typeof coachContext.profile === "object"
    ? coachContext.profile
    : {}
  const nutritionToday = coachContext?.nutrition_today && typeof coachContext.nutrition_today === "object"
    ? coachContext.nutrition_today
    : {}
  const today = String(coachContext?.today || "").trim()
  const fallbackTotals = sumRecentMealTotals(recentMeals, today)
  const mergedProfile = {
    daily_calories: optionalNumber(profile?.daily_calories) ?? optionalNumber(contextProfile?.daily_calories),
    protein_g: optionalNumber(profile?.protein_g) ?? optionalNumber(contextProfile?.protein_g),
    carbs_g: optionalNumber(profile?.carbs_g) ?? optionalNumber(contextProfile?.carbs_g),
    fat_g: optionalNumber(profile?.fat_g) ?? optionalNumber(contextProfile?.fat_g),
  }
  const totals = {
    calories: optionalNumber(nutritionToday?.calories_logged) ?? fallbackTotals.calories,
    protein_g: optionalNumber(nutritionToday?.protein_g_logged) ?? fallbackTotals.protein_g,
    carbs_g: optionalNumber(nutritionToday?.carbs_g_logged) ?? fallbackTotals.carbs_g,
    fat_g: optionalNumber(nutritionToday?.fat_g_logged) ?? fallbackTotals.fat_g,
  }
  const remaining = {
    calories: optionalNumber(nutritionToday?.calories_remaining),
    protein_g: optionalNumber(nutritionToday?.protein_g_remaining),
    carbs_g: optionalNumber(nutritionToday?.carbs_g_remaining),
    fat_g: optionalNumber(nutritionToday?.fat_g_remaining),
  }

  for (const [key, target] of Object.entries(mergedProfile)) {
    if (remaining[key] === null && target !== null) {
      remaining[key] = Math.round((target - (totals[key] || 0)) * 10) / 10
    }
  }

  return { totals, remaining, profile: mergedProfile }
}

function extractNutritionStatusMetric(message) {
  const text = String(message || "").toLowerCase()
  if (!NUTRITION_STATUS_QUESTION_PATTERN.test(text)) return null
  if (/\bcalories?\b/.test(text)) return { key: "calories", label: "kcal", targetKey: "daily_calories", noun: "calories" }
  if (/\bprotein\b/.test(text)) return { key: "protein_g", label: "g", targetKey: "protein_g", noun: "protein" }
  if (/\bcarbs?\b|\bcarbohydrates?\b/.test(text)) return { key: "carbs_g", label: "g", targetKey: "carbs_g", noun: "carbs" }
  if (/\bfat\b|\bfats\b/.test(text)) return { key: "fat_g", label: "g", targetKey: "fat_g", noun: "fat" }
  return null
}

function formatNutritionStatusAmount(metric, value) {
  if (metric.key === "calories") return `${Math.round(value || 0)} ${metric.label}`
  return `${roundMacro(value || 0)}${metric.label} ${metric.noun}`.trim()
}

export function buildDeterministicNutritionStatusReply(args = {}) {
  const metric = extractNutritionStatusMetric(args.message)
  if (!metric) return ""

  const text = String(args.message || "").toLowerCase()
  const asksDailyStatus = /\b(?:total|so far|today|left|remaining|target|over|under)\b/.test(text)
  if (!asksDailyStatus) return ""

  const snapshot = resolveNutritionStatusSnapshot(args)
  const current = snapshot.totals[metric.key]
  if (current === null) return ""

  const target = snapshot.profile[metric.targetKey]
  const remaining = snapshot.remaining[metric.key]
  const asksOverTarget = /\bover\b.*\btarget\b|\bunder\b.*\btarget\b|\btarget\b/.test(text)
  const asksRemaining = /\b(?:left|remaining)\b/.test(text)

  if (asksOverTarget && target !== null) {
    const delta = roundMacro(current - target)
    if (delta > 0) {
      return `You're over your ${metric.noun} target by about ${formatNutritionStatusAmount(metric, delta)}. You're at ${formatNutritionStatusAmount(metric, current)} against a ${formatNutritionStatusAmount(metric, target)} target today.`
    }
    const left = Math.max(0, roundMacro(target - current))
    return `You're at about ${formatNutritionStatusAmount(metric, current)} so far today, with ${formatNutritionStatusAmount(metric, left)} left against your ${formatNutritionStatusAmount(metric, target)} target.`
  }

  if (asksRemaining && remaining !== null && target !== null) {
    const left = Math.max(0, roundMacro(remaining))
    return `You've got about ${formatNutritionStatusAmount(metric, left)} left today. You're currently at ${formatNutritionStatusAmount(metric, current)} against your ${formatNutritionStatusAmount(metric, target)} target.`
  }

  if (target !== null && remaining !== null) {
    const left = Math.max(0, roundMacro(remaining))
    return `You're at about ${formatNutritionStatusAmount(metric, current)} so far today, with ${formatNutritionStatusAmount(metric, left)} left against your ${formatNutritionStatusAmount(metric, target)} target.`
  }

  return `You're at about ${formatNutritionStatusAmount(metric, current)} so far today.`
}

function normalizeMealType(value) {
  const text = String(value || "").trim().toLowerCase()
  return ["breakfast", "lunch", "dinner", "snack"].includes(text) ? text : ""
}

export function summarizeCoachAction(action) {
  if (!action || typeof action !== "object") return ""

  if (action.type === "create_workout_plan") {
    return `I mapped out ${String(action.title || "your workout").trim()} and added it below.`
  }

  if (action.type === "create_meal_plan") {
    return "I mapped out today's meals and saved the plan for you."
  }

  if (action.type === "log_workout") {
    return `Saved to Workouts: ${String(action.workout_type || action.exercise_name || "your workout").trim()}.`
  }

  if (action.type === "update_workout_log") {
    return `Updated your workout log for ${String(action.workout_type || action.exercise_name || "that session").trim()}.`
  }

  if (action.type === "delete_workout_log") {
    return `Removed ${String(action.workout_type || action.exercise_name || "that workout").trim()} from Workouts.`
  }

  if (action.type === "log_meal") {
    return `Saved to today's nutrition: ${String(action.food_name || "that meal").trim()}.`
  }

  if (action.type === "update_meal_log") {
    return `Updated today's nutrition entry for ${String(action.food_name || "that meal").trim()}.`
  }

  if (action.type === "delete_meal_log") {
    return `Removed ${String(action.food_name || "that meal").trim()} from today's nutrition log.`
  }

  if (action.type === "update_targets") {
    return "I updated your targets."
  }

  if (action.type === "clarify") {
    return String(action.message || "").trim()
  }

  return ""
}

export function summarizeCoachActions(actions = []) {
  const safeActions = safeArray(actions, 8).filter(Boolean)
  if (!safeActions.length) return ""
  if (safeActions.length === 1) return summarizeCoachAction(safeActions[0])

  const mealActions = safeActions.filter(isMealPersistenceAction)
  if (mealActions.length === safeActions.length) {
    const labels = mealActions.map((action) => {
      const mealType = normalizeMealType(action.meal_type || "")
      const prefix = mealType ? `${mealType.charAt(0).toUpperCase()}${mealType.slice(1)} - ` : ""
      return `${prefix}${String(action.food_name || "meal").trim()}`
    })
    return `Saved to today's nutrition: ${labels.join("; ")}.`
  }

  const workoutActions = safeActions.filter(isWorkoutPersistenceAction)
  if (workoutActions.length === safeActions.length) {
    return `Saved to Workouts: ${workoutActions.map((action) => String(action.workout_type || action.exercise_name || "workout").trim()).join("; ")}.`
  }

  return summarizeCoachAction(safeActions[0])
}

export function normalizeMealAction(action) {
  if (!action || typeof action !== "object") return action
  if (!isMealPersistenceAction(action)) return action

  const foodName = String(action.food_name || action.name || "")
    .replace(TRAILING_LOG_COMMAND_PATTERN, "")
    .trim()
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
    if (action.type === "delete_meal_log") {
      return Boolean(String(action.meal_id || "").trim())
    }
    return hasMealMacros(action) && String(action.food_name || "").trim()
  }

  if (isWorkoutPersistenceAction(action)) {
    if (action.type === "delete_workout_log") {
      return Boolean(String(action.workout_id || "").trim())
    }
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

export function buildDeterministicMealDeletionAction(mealSession) {
  if (!mealSession?.deleteRequested || !String(mealSession?.persistedMealId || "").trim()) return null
  return {
    type: "delete_meal_log",
    meal_id: String(mealSession.persistedMealId || "").trim(),
    food_name: String(mealSession.persistedSummary || mealSession.summary || "that meal").trim() || "that meal",
  }
}

function normalizeSessionItem(item = {}) {
  return {
    ...item,
    baseName: item.baseName || item.base_name || "",
    attachedTo: item.attachedTo || item.attached_to || null,
    variantKey: item.variantKey || item.variant_key || "",
    mealType: normalizeMealType(item.mealType || item.meal_type || ""),
  }
}

function normalizeSessionBaseName(item = {}) {
  const value = String(item.baseName || item.base_name || item.label || "").trim().toLowerCase()
  if (!value) return ""
  if (value === "eggs") return "egg"
  return value
}

function rootSessionItems(mealSession) {
  return safeArray(mealSession?.items, 24)
    .map((item) => normalizeSessionItem(item))
    .filter((item) => !item.attachedTo)
}

function blocksLooseEstimateForSingleCountItem(mealSession) {
  if (String(mealSession?.pendingClarification?.type || "") !== "quantity") return false
  const roots = rootSessionItems(mealSession)
  if (roots.length !== 1) return false
  const [root] = roots
  const baseName = normalizeSessionBaseName(root)
  if (!COUNT_REQUIRED_LOOSE_ESTIMATE_BASES.has(baseName)) return false
  const quantity = normalizeItemQuantity(root.quantity)
  return !quantity || !Number.isFinite(quantity.amount)
}

function canUseLooseEstimate(mealSession, allowLooseEstimate = false) {
  return Boolean(
    allowLooseEstimate
    && !mealSession?.readyToLog
    && !mealSession?.alreadyLogged
    && !mealSession?.suppressed
    && !mealSession?.persistedMealId
    && !mealSession?.correctionRequested
    && String(mealSession?.summary || "").trim()
    && safeArray(mealSession?.items, 24).length > 0
    && !blocksLooseEstimateForSingleCountItem(mealSession)
  )
}

function buildMealSessionSubset(mealSession, group = null) {
  if (!group) return mealSession
  return {
    ...mealSession,
    summary: String(group.summary || "").trim(),
    items: safeArray(group.items, 24).map((item) => normalizeSessionItem(item)),
    meal_groups: [],
  }
}

function buildSingleDeterministicMealAction({
  mealSession,
  explicitActions = [],
  prompt = "",
  candidateFoodMatches = {},
  allowAnswerOnly = false,
  mealTypeOverride = "",
  allowLooseEstimate = false,
}) {
  const looseEstimateAllowed = canUseLooseEstimate(mealSession, allowLooseEstimate)
  if ((!mealSession?.readyToLog && !looseEstimateAllowed) || mealSession?.alreadyLogged || mealSession?.suppressed || (mealSession?.answerOnly && !allowAnswerOnly)) return null
  const shouldPersist =
    looseEstimateAllowed
    || mealSession?.wantsLogging !== false
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
    meal_type: normalizeMealType(mealTypeOverride) || explicit?.meal_type || mealSession?.referenceMeal?.meal_type || inferMealTypeFromPrompt(prompt),
    food_name: mealSession.summary || mealSession?.referenceMeal?.food_name || "",
    quantity: explicit?.quantity || mealSession?.referenceMeal?.quantity || "1 meal",
    estimated: explicit?.estimated ?? true,
    nutrition_source: typeof explicit?.nutrition_source === "string" && explicit.nutrition_source.trim()
      ? explicit.nutrition_source.trim()
      : mealSession?.referenceMeal?.nutrition_source || "Coach estimate from accumulated meal details across chat",
    ...macros,
  })
}

export function buildDeterministicMealActions(args = {}) {
  const { mealSession } = args
  const looseEstimateAllowed = canUseLooseEstimate(mealSession, args.allowLooseEstimate)
  if ((!mealSession?.readyToLog && !looseEstimateAllowed) || mealSession?.alreadyLogged || mealSession?.suppressed || (mealSession?.answerOnly && !args.allowAnswerOnly)) return []

  const groups = safeArray(mealSession?.meal_groups, 8).filter((group) => (
    normalizeMealType(group?.meal_type || "")
    && String(group?.summary || "").trim()
    && safeArray(group?.items, 24).length
  ))

  const shouldSplitByMealType = (
    groups.length > 1
    && !mealSession?.persistedMealId
    && !mealSession?.referenceMeal
    && !mealSession?.correctionRequested
  )

  if (shouldSplitByMealType) {
    return groups
      .map((group) => buildSingleDeterministicMealAction({
        ...args,
        mealSession: buildMealSessionSubset(mealSession, group),
        mealTypeOverride: group.meal_type,
      }))
      .filter(Boolean)
  }

  const singleAction = buildSingleDeterministicMealAction({
    ...args,
    mealTypeOverride: groups.length === 1 ? groups[0].meal_type : "",
  })
  return singleAction ? [singleAction] : []
}

export function buildDeterministicMealAction(args = {}) {
  return buildDeterministicMealActions(args)[0] || null
}

function normalizeWorkoutCandidate(parsed = {}, fallback = {}) {
  const exerciseName = String(parsed?.exercise_name || parsed?.workout_type || fallback?.exercise_name || fallback?.workout_type || "").trim()
  if (!exerciseName) return null
  const muscleGroup = String(parsed?.muscle_group || fallback?.muscle_group || "full_body").trim() || "full_body"
  const reps = Number(parsed?.reps || fallback?.reps || 0)
  const sets = Number(parsed?.sets || fallback?.sets || (reps > 0 ? 1 : 0))
  const weightKg = Number(parsed?.weight_kg || fallback?.weight_kg || 0)
  const durationSeconds = Number(parsed?.duration_seconds || fallback?.duration_seconds || 0)
  const distanceKm = Number(parsed?.distance_km || fallback?.distance_km || 0)
  return {
    exercise_name: exerciseName,
    workout_type: String(parsed?.workout_type || fallback?.workout_type || exerciseName).trim() || exerciseName,
    muscle_group: muscleGroup,
    sets,
    reps,
    weight_kg: weightKg,
    duration_seconds: durationSeconds,
    distance_km: distanceKm,
  }
}

function workoutCandidateReady(candidate = null) {
  if (!candidate?.exercise_name) return false
  const isCardio = String(candidate.muscle_group || "").trim().toLowerCase() === "cardio"
  return isCardio
    ? Boolean(candidate.duration_seconds > 0 || candidate.distance_km > 0)
    : Boolean(candidate.reps > 0)
}

function buildWorkoutActionFromCandidate(candidate = null, existingSession = null) {
  if (!candidate || !workoutCandidateReady(candidate)) return null
  return {
    type: existingSession?.persistedWorkoutId && existingSession?.correctionRequested ? "update_workout_log" : "log_workout",
    ...(existingSession?.persistedWorkoutId && existingSession?.correctionRequested
      ? { workout_id: existingSession.persistedWorkoutId }
      : {}),
    exercise_name: candidate.exercise_name,
    workout_type: candidate.workout_type,
    muscle_group: candidate.muscle_group || "full_body",
    sets: Number(candidate.sets || 1),
    reps: Number(candidate.reps || 0),
    weight_kg: Number(candidate.weight_kg || 0),
    duration_seconds: Number(candidate.duration_seconds || 0),
    distance_km: Number(candidate.distance_km || 0),
  }
}

function workoutActionKey(action = {}) {
  return [
    action?.type || "",
    action?.workout_id || "",
    String(action?.exercise_name || action?.workout_type || "").trim().toLowerCase(),
    Number(action?.sets || 0),
    Number(action?.reps || 0),
    Number(action?.weight_kg || 0),
    Number(action?.duration_seconds || 0),
    Number(action?.distance_km || 0),
  ].join(":")
}

export function buildDeterministicWorkoutActions({ workoutSession, explicitActions = [] }) {
  if (workoutSession?.alreadyLogged || workoutSession?.suppressed) return []

  const explicit = firstWorkoutAction(explicitActions)
  const primaryCandidate = normalizeWorkoutCandidate({
    exercise_name: workoutSession?.exercise_name,
    workout_type: workoutSession?.workout_type,
    muscle_group: workoutSession?.muscle_group,
    sets: workoutSession?.sets,
    reps: workoutSession?.reps,
    weight_kg: workoutSession?.weight_kg,
    duration_seconds: workoutSession?.duration_seconds,
    distance_km: workoutSession?.distance_km,
  }, explicit || {})

  const actions = []
  const seen = new Set()
  const primaryAction = buildWorkoutActionFromCandidate(primaryCandidate, workoutSession)
  if (primaryAction && (workoutSession?.readyToLog || workoutSession?.correctionRequested)) {
    actions.push(primaryAction)
    seen.add(workoutActionKey(primaryAction))
  }

  if (!workoutSession?.persistedWorkoutId && !workoutSession?.correctionRequested) {
    for (const activity of safeArray(workoutSession?.candidateActivities, 8)) {
      const candidate = normalizeWorkoutCandidate(activity?.parsedWorkout, {})
      const action = buildWorkoutActionFromCandidate(candidate)
      if (!action) continue
      const key = workoutActionKey(action)
      if (seen.has(key)) continue
      actions.push(action)
      seen.add(key)
    }
  }

  return actions
}

export function buildDeterministicWorkoutAction(args = {}) {
  return buildDeterministicWorkoutActions(args)[0] || null
}

export function buildDeterministicWorkoutDeletionAction(workoutSession) {
  if (!workoutSession?.deleteRequested || !String(workoutSession?.persistedWorkoutId || "").trim()) return null
  return {
    type: "delete_workout_log",
    workout_id: String(workoutSession.persistedWorkoutId).trim(),
    workout_type: String(workoutSession.persistedSummary || workoutSession.summary || "that workout").trim() || "that workout",
  }
}

export function formatDeterministicMealAnswer(action) {
  if (!action) return ""
  return `That comes to about ${Math.round(Number(action.calories) || 0)} kcal, ${Math.round(Number(action.protein_g) || 0)}g protein, ${Math.round(Number(action.carbs_g) || 0)}g carbs, and ${Math.round(Number(action.fat_g) || 0)}g fat. If you want it saved, tell me to log it.`
}
