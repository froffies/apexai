import { buildMealContext as buildLegacyMealContext, detectQuestionOnlyTurn, emptyMealSession as emptyLegacyMealSession } from "./mealStateBuilder.mjs"

const MEAL_EXPLICIT_START_PATTERN = /^(?:please\s+)?(?:(?:i\s+)?(?:had|ate|drank)|log|track|save|add|include)\b/i
const MEAL_CORRECTION_PATTERN = /\b(?:actually|correction|change(?:\s+that)?|update(?:\s+that)?|make that|not\b|instead|sorry|i meant)\b/i
const MEAL_DELETE_PATTERN = /\b(?:delete|remove|undo|erase)\b(?:\s+(?:it|that|this|meal))?/i
const MEAL_REJECTION_PATTERN = /\b(?:that's wrong|thats wrong|logged wrong|wrong meal|fix that|fix it)\b/i
const MEAL_FINALISE_PATTERN = /^(?:i just did|i already did|that'?s it|thats it|log it|save it|go ahead|yes|yeah|yep|okay|ok)$/i
const MEAL_REFERENCE_PATTERN = /\b(?:the eggs?|the tea|the coffee|the toast|the beans?|the chicken|the rice|the butter|the oil)\b/i
const SUPPRESS_SESSION_PATTERN = /\b(?:don't|dont|do not|stop|no)\s+(?:log|save|track|record|add)\b/i
const REPEAT_RECENT_MEAL_PATTERN = /\b(?:same as yesterday|same as last time|same as before|repeat that(?: meal)?|same thing as yesterday)\b/i
const MEAL_LOG_QUERY_PATTERN = /^(?:what(?:'s|s| is)?|show|list|see|view|display)\b.*\b(?:today'?s?|todays?|my)\b.*\b(?:nutrition|food|meal|meals|log)\b/i
const NUTRITION_QUESTION_PATTERN = /^(?:is|are|does|do|can|should|will|would|what(?:'s|s| is)?|how(?:'s|s| is| much| many)?|which|why)\b.{0,80}?\b(?:better|best|worse|good|bad|healthy|unhealthy|high|low|more|less|enough|too much|work|help|cause|prevent|affect)\b/i
const WORKOUT_QUESTION_PATTERN = /^(?:is|are|does|do|can|should|will|would|what(?:'s|s| is)?|how(?:'s|s| is| much| many)?|which|why)\b.{0,120}?\b(?:workout[s]?|exercises?|training|run(?:ning)?|ran|cardio|gym|lift(?:ing)?|muscle[s]?|fitness|calories?|burn(?:ing)?|strength|endurance|recover(?:y)?|rest)\b/i
const VAGUE_TIME_REF_PATTERN = /\b(?:yesterday|last night|last week|earlier today|before|already|just ate|just had)\b/i
const VAGUE_REFERENCE_PATTERN = /^(?:(?:i\s+)?(?:had|ate|drank|eaten))\s+(?:that|the same|same thing|it|the usual|the same as|lunch already|dinner already|breakfast already|that already)\b/i
const FRUSTRATION_PATTERN = /\b(?:why did you|why cant you|you suck|what the|thats not what|thats wrong|youre wrong|you got it wrong|why would you|stop doing|you keep|you always|i cant believe|this is wrong|you messed up)\b/i
const WORKOUT_REROUTE_PATTERN = /^(?:log|save|add|track|put)\s+(?:it|that|this)\s+(?:in|as|to|under)\s+(?:a\s+|my\s+)?(?:workout|workouts|training|exercise|gym|weights)/i
const WORKOUT_START_PATTERN = /(?:\b(?:workout|train(?:ed|ing)?|lift(?:ed|ing)?|exercise|exercises|session|cardio|bench|squats?|deadlift|row|rows|press|curls?|pulldown|pull\s*ups?|push\s*ups?|sit\s*ups?|burpees?|dips?|lunges?|treadmill|bike|biked|ran|run|running|swim|swam|walk(?:ed|ing)?|cycling|cycled|rower|elliptical|stairmaster|sets?|reps?)\b)|(?:\d+\s*(?:kg|km|mi|miles?|min(?:utes?)?|sec(?:onds?)?|hours?|cal(?:ories?)?))|(?:\d+\s*x\s*\d+)/i
const WORKOUT_CORRECTION_PATTERN = /\b(?:actually|correction|change(?:\s+that)?|update(?:\s+that)?|make that|not\b|instead|sorry|i meant)\b/i
const WORKOUT_DELETE_PATTERN = /\b(?:delete|remove|undo|erase)\b(?:\s+(?:it|that|this|workout|session|log))?/i
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
  "pullups",
  "pull ups",
  "pull up",
  "pullup",
  "pushups",
  "push ups",
  "push up",
  "pushup",
  "situp",
  "situps",
  "sit up",
  "sit ups",
  "burpee",
  "burpees",
  "dip",
  "dips",
  "lat pulldown",
  "deadlift",
  "romanian deadlift",
  "rdl",
  "back squat",
  "front squat",
  "squat",
  "squats",
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

const CORRECTION_LEAD_PATTERNS = [
  /^(?:actually|sorry|correction)\s+/i,
  /^(?:no|nah),?\s+i meant\s+/i,
  /^(?:i meant|it was|it is)\s+/i,
  /^(?:make that|change that(?: to)?|update that(?: to)?|instead)\s+/i,
]

const GENERIC_MEAL_DELETE_PATTERN = /^(?:actually\s+)?(?:delete|remove|undo|erase)(?:\s+(?:it|that|this|meal|log))?$/i
const REJECTION_DELETE_PATTERN = /^(?:no|nah)\s+(?:that'?s wrong|thats wrong|wrong meal|logged wrong)\s+(?:delete|remove|undo|erase)(?:\s+(?:it|that|this|meal|log))?$/i
const INLINE_MEAL_CORRECTION_PATTERN = /^(?<lead>(?:please\s+)?(?:(?:i\s+)?(?:had|ate|drank)|log|track|save|add|include)\s+)(?<first>.+?)\s+(?:no\s+wait|actually|sorry|i\s+meant?|make\s+that|change\s+that(?:\s+to)?|it\s+was)\s+(?<second>.+)$/i
const TRAILING_MEAL_QUANTITY_PATTERN = /^(?<lead>(?:(?:actually|also|and then|then)\s+)*(?:(?:i\s+)?(?:had|ate|drank)|log|track|save|add|include)\s+)?(?<food>[a-z][a-z\s'/-]+?)\s+(?<amount>\d+(?:\.\d+)?|half)\s*(?:(?<article>a)\s+)?(?<unit>kg|g|lb|lbs|pound|pounds|ml|l|litre|litres|liter|liters|cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|slice|slices|serve|serves|serving|servings|bowl|bowls|plate|plates|mug|mugs)\b$/i
const BARE_MEAL_MEASURE_NAMES = new Set(["g", "kg", "lb", "ml", "l", "cup", "tbsp", "tsp", "slice", "tin", "can", "block", "bunch", "serve", "bowl", "plate", "mug"])
const MIXED_TURN_SPLIT_PATTERN = /\b(?:oh\s+and|and then|and|also|then|plus)\b|[,;]+/gi
const WORKOUT_PIVOT_PATTERN = /^(?:(?:i\s+)?(?:did|trained?|lifted|worked\s+out|ran|run|running|walked|walk|cycled|cycle|biked|bike|swam|swim)\b|(?:bench(?:\s+press)?|incline\s+bench\s+press|overhead\s+press|shoulder\s+press|dumbbell\s+shoulder\s+press|seated\s+row|barbell\s+row|bent\s+over\s+row|lat\s+pulldown|back\s+squat|front\s+squat|squats?|deadlift|romanian\s+deadlift|rdl|leg\s+press|walking\s+lunge|preacher\s+curls?|bicep\s+curl|tricep\s+pushdown|plank|treadmill|rower|elliptical|stairmaster|push\s*ups?|pushups?|pull\s*ups?|pullups?|sit\s*ups?|situps?|burpees?|dips?|lunges?)\b|\d+(?:\.\d+)?\s*(?:push\s*ups?|pushups?|pull\s*ups?|pullups?|sit\s*ups?|situps?|burpees?|dips?|lunges?|squats?)\b)/i
const MEAL_PIVOT_PATTERN = /^(?:actually\s+)?(?:also\s+)?(?:(?:i\s+)?(?:had|ate|drank))\b/i

function cleanText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function stripCorrectionLead(text) {
  let normalized = String(text || "").trim()
  let changed = true
  while (changed && normalized) {
    changed = false
    for (const pattern of CORRECTION_LEAD_PATTERNS) {
      const stripped = normalized.replace(pattern, "").trim()
      if (stripped !== normalized) {
        normalized = stripped
        changed = true
      }
    }
  }
  return normalized
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
    pendingClarification: session?.pendingClarification && typeof session.pendingClarification === "object"
      ? { ...session.pendingClarification }
      : null,
    clarificationCounts: { ...(session?.clarificationCounts || {}) },
    declaredTotals: Array.isArray(session?.declaredTotals)
      ? session.declaredTotals.map((entry) => ({ ...entry }))
      : [],
    pendingAttachments: Array.isArray(session?.pendingAttachments)
      ? session.pendingAttachments.map((entry) => ({
          ...entry,
          ingredient: entry?.ingredient && typeof entry.ingredient === "object"
            ? {
                ...entry.ingredient,
                quantity: entry.ingredient?.quantity ? { ...entry.ingredient.quantity } : null,
                preparation: Array.isArray(entry.ingredient?.preparation) ? [...entry.ingredient.preparation] : [],
                modifiers: Array.isArray(entry.ingredient?.modifiers) ? [...entry.ingredient.modifiers] : [],
                exclusions: Array.isArray(entry.ingredient?.exclusions) ? [...entry.ingredient.exclusions] : [],
              }
            : null,
        }))
      : [],
    pendingQuantities: Array.isArray(session?.pendingQuantities)
      ? session.pendingQuantities.map((entry) => (entry ? { ...entry } : null)).filter(Boolean)
      : [],
    structuralIssues: Array.isArray(session?.structuralIssues)
      ? session.structuralIssues.map((entry) => ({ ...entry }))
      : [],
    items: Array.isArray(session?.items) ? session.items.map((item) => ({
      ...item,
      quantity: item?.quantity ? { ...item.quantity } : null,
      preparation: Array.isArray(item?.preparation) ? [...item.preparation] : [],
      modifiers: Array.isArray(item?.modifiers) ? [...item.modifiers] : [],
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
    .filter((token) => token.length > 2 && !["just", "did", "with", "plus", "also", "meal", "food", "that", "this", "the", "had", "ate", "drank", "log", "track", "save", "add", "include", "trained", "lifted"].includes(token))
}

function numericTokens(text) {
  return cleanText(text).match(/\d+(?:\.\d+)?/g) || []
}

function summaryIncludesNumbers(numbers = [], summaryText = "", quantitySet = new Set()) {
  if (!numbers.length) return false
  return numbers.every((token) => (
    summaryText.includes(token)
    || [...quantitySet].some((quantity) => quantity.includes(token) || token.includes(quantity))
  ))
}

function mealCorrectionRequested(message) {
  return MEAL_CORRECTION_PATTERN.test(cleanText(message))
}

function mealDeleteRequested(message) {
  return MEAL_DELETE_PATTERN.test(cleanText(message))
}

function genericMealDeleteRequested(message) {
  const normalized = cleanText(message)
  return GENERIC_MEAL_DELETE_PATTERN.test(normalized) || REJECTION_DELETE_PATTERN.test(normalized)
}

function mealRejectionRequested(message) {
  return MEAL_REJECTION_PATTERN.test(cleanText(message))
}

function workoutCorrectionRequested(message) {
  return WORKOUT_CORRECTION_PATTERN.test(cleanText(message))
}

function workoutDeleteRequested(message) {
  return WORKOUT_DELETE_PATTERN.test(cleanText(message))
}

function suppressionRequested(message) {
  return SUPPRESS_SESSION_PATTERN.test(cleanText(message))
}

function hasWorkoutMetricDetail(parsed = null) {
  if (!parsed) return false
  return Boolean(
    Number(parsed.sets || 0) > 0
    || Number(parsed.reps || 0) > 0
    || Number(parsed.weight_kg || 0) > 0
    || Number(parsed.duration_seconds || 0) > 0
    || Number(parsed.distance_km || 0) > 0
  )
}

function repeatRecentMealRequested(message) {
  return REPEAT_RECENT_MEAL_PATTERN.test(cleanText(message))
}

function mealLogQueryRequested(message) {
  return MEAL_LOG_QUERY_PATTERN.test(cleanText(message))
}

function isExplicitMealStart(message) {
  return MEAL_EXPLICIT_START_PATTERN.test(String(message || "").trim())
}

function normalizeInlineMealCorrectionMessage(message = "") {
  const raw = String(message || "").trim()
  if (!raw) return raw
  const match = raw.match(INLINE_MEAL_CORRECTION_PATTERN)
  if (!match?.groups) return raw

  const lead = String(match.groups.lead || "").trim()
  const first = String(match.groups.first || "").trim()
  const secondRaw = String(match.groups.second || "").trim()
  if (!lead || !first || !secondRaw) return raw

  const second = secondRaw
    .replace(/^(?:like|about|around)\s+/i, "")
    .trim()
  if (!second) return raw

  const standalonePreview = buildLegacyMealContext([], second, emptyLegacyMealSession())
  const standaloneBaseName = cleanText(
    standalonePreview?.items?.find((item) => !item?.attached_to)?.base_name
    || standalonePreview?.items?.find((item) => !item?.attached_to)?.label
    || ""
  )
  if (standaloneBaseName && !BARE_MEAL_MEASURE_NAMES.has(standaloneBaseName)) {
    return `${lead} ${second}`.replace(/\s+/g, " ").trim()
  }

  const firstPreview = buildLegacyMealContext([], `${lead} ${first}`.replace(/\s+/g, " ").trim(), emptyLegacyMealSession())
  const baseName = String(
    firstPreview?.items?.find((item) => !item?.attached_to)?.base_name
    || firstPreview?.items?.find((item) => !item?.attached_to)?.label
    || ""
  ).trim()
  if (!baseName) return raw

  return `${lead} ${second} ${baseName}`.replace(/\s+/g, " ").trim()
}

function normalizeTrailingMealQuantityMessage(message = "") {
  const raw = String(message || "").trim()
  if (!raw) return raw
  const match = raw.match(TRAILING_MEAL_QUANTITY_PATTERN)
  if (!match?.groups?.food || !match?.groups?.amount || !match?.groups?.unit) return raw
  const lead = String(match.groups.lead || "")
  const food = String(match.groups.food || "").trim().replace(/^(?:a|an)\s+/i, "")
  const amount = String(match.groups.amount || "").trim()
  const article = String(match.groups.article || "").trim()
  const unit = String(match.groups.unit || "").trim()
  return `${lead}${amount}${article ? ` ${article}` : ""} ${unit} ${food}`.replace(/\s+/g, " ").trim()
}

function normalizeWorkoutFragment(message = "") {
  const raw = String(message || "").trim()
  if (!raw) return raw
  if (/^did\b/i.test(raw)) return `i ${raw}`
  return raw
}

function stripMixedTurnLead(message = "") {
  return String(message || "")
    .trim()
    .replace(/^(?:oh\s+and|and then|and|also|then|plus)\s+/i, "")
    .trim()
}

function looksLikeWorkoutPivotFragment(message = "") {
  const stripped = stripMixedTurnLead(message)
  if (!stripped) return false
  return WORKOUT_PIVOT_PATTERN.test(cleanText(stripped))
}

function looksLikeMealPivotFragment(message = "") {
  const stripped = stripMixedTurnLead(message)
  if (!stripped) return false
  return MEAL_PIVOT_PATTERN.test(cleanText(stripped))
}

function splitMixedCoachTurn(message = "") {
  const raw = String(message || "").trim()
  if (!raw) return {
    mealMessage: raw,
    workoutMessage: raw,
  }

  const explicitMeal = isExplicitMealStart(raw)
  const workoutLike = looksLikeWorkoutOnlyTurn(raw)
  if (!explicitMeal && !workoutLike) {
    return {
      mealMessage: raw,
      workoutMessage: raw,
    }
  }

  for (const match of raw.matchAll(MIXED_TURN_SPLIT_PATTERN)) {
    const splitIndex = match.index ?? -1
    if (splitIndex < 0) continue
    const prefix = raw.slice(0, splitIndex).trim().replace(/[,\s]+$/g, "")
    const suffix = raw.slice(splitIndex + match[0].length).trim().replace(/^[,\s]+/g, "")
    if (!prefix || !suffix) continue

    if (explicitMeal && looksLikeWorkoutPivotFragment(suffix)) {
      return {
        mealMessage: prefix,
        workoutMessage: normalizeWorkoutFragment(stripMixedTurnLead(suffix)),
      }
    }

    if (workoutLike && looksLikeMealPivotFragment(suffix)) {
      return {
        mealMessage: stripMixedTurnLead(suffix),
        workoutMessage: prefix,
      }
    }
  }

  return {
    mealMessage: raw,
    workoutMessage: raw,
  }
}

function looksLikeWorkoutOnlyTurn(message) {
  const normalized = cleanText(message)
  if (!normalized) return false
  if (WORKOUT_REROUTE_PATTERN.test(normalized)) return true
  if (isExplicitMealStart(message)) return false
  const parsed = parseWorkoutMessage(message)
  return WORKOUT_START_PATTERN.test(normalized)
    || workoutReferenceMessage(normalized)
    || hasWorkoutMetricDetail(parsed)
    || Number(parsed?.duration_seconds || 0) > 0
    || Number(parsed?.distance_km || 0) > 0
}

function isRedundantPersistedMealFollowUp(message, session) {
  const normalized = cleanText(message)
  if (!session?.persisted || !normalized) return false
  if (mealLogQueryRequested(normalized) || looksLikeWorkoutOnlyTurn(message)) return false
  if (mealCorrectionRequested(normalized)) return false
  if (mealRejectionRequested(normalized)) return false
  if (mealDeleteRequested(normalized)) return false
  if (MEAL_FINALISE_PATTERN.test(normalized) || MEAL_REFERENCE_PATTERN.test(normalized)) return true

  const summaryText = cleanText(session.persistedSummary || session.summary || "")
  if (!summaryText) return false

  const nameSet = normalizedItemNames(session)
  const quantitySet = normalizedItemQuantities(session)
  const tokens = meaningfulTokens(normalized)
  const numbers = numericTokens(normalized)
  const referencesKnownItems = tokens.length > 0 && tokens.every((token) => (
    summaryText.includes(token)
    || [...nameSet].some((name) => name.includes(token) || token.includes(name))
    || [...quantitySet].some((quantity) => quantity.includes(token) || token.includes(quantity))
  ))
  if (isExplicitMealStart(message)) {
    return referencesKnownItems && summaryIncludesNumbers(numbers, summaryText, quantitySet)
  }
  if (!referencesKnownItems) return false
  if (!numbers.length) return true
  return summaryIncludesNumbers(numbers, summaryText, quantitySet)
}

function persistedMealFollowUpLooksLikeUpdate(message, session, nextSummary = "") {
  const normalized = cleanText(message)
  if (!session?.persisted || !normalized) return false
  if (isExplicitMealStart(message) || suppressionRequested(message) || detectQuestionOnlyTurn(message) || MEAL_FINALISE_PATTERN.test(normalized)) {
    return false
  }
  if (mealCorrectionRequested(message)) return true
  if (!cleanText(nextSummary) || summariesEquivalent(nextSummary, session.persistedSummary || session.summary || "")) return false

  return Boolean(
    /\b(?:with|without|extra|hold|remove|swap|instead|plus|mixed with|topped with|covered in)\b/i.test(normalized)
    || /^the\s+/i.test(normalized)
    || /^(?:used to fry|used for|for)\s+the\s+/i.test(normalized)
    || MEAL_REFERENCE_PATTERN.test(normalized)
    || /\d/.test(normalized)
  )
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
      modifiers: Array.isArray(item.modifiers) ? [...item.modifiers] : [],
      exclusions: Array.isArray(item.exclusions) ? [...item.exclusions] : [],
      attached_to: item.attached_to || item.attachedTo || null,
      relation: item.relation || null,
      variant_key: item.variant_key || item.variantKey || "",
      meal_type: item.meal_type || item.mealType || "",
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
    lastMainReference: session.lastMainReference || "",
    lastGroupedBaseName: session.lastGroupedBaseName || "",
    lastDrinkKey: session.lastDrinkKey || "",
    currentMealType: session.currentMealType || "",
    declaredTotals: Array.isArray(session.declaredTotals) ? session.declaredTotals.map((entry) => ({ ...entry })) : [],
    pendingAttachments: Array.isArray(session.pendingAttachments) ? session.pendingAttachments.map((entry) => ({ ...entry })) : [],
    pendingQuantities: Array.isArray(session.pendingQuantities) ? session.pendingQuantities.map((entry) => ({ ...entry })) : [],
    pendingClarification: session.pendingClarification ? { ...session.pendingClarification } : null,
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
    deleteRequested: false,
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

function looksLikeFullMealCorrectionRestatement(message) {
  const normalized = cleanText(stripCorrectionLead(message))
  if (!normalized) return false
  if (/\bplus\b|,/.test(normalized)) return true
  const quantityCount = (normalized.match(/\b\d+(?:\.\d+)?\b/g) || []).length
  if (quantityCount >= 2) return true
  return /\b(?:and|with)\b/.test(normalized) && /\d/.test(normalized)
}

function buildMealSessionState(recentMessages = [], currentMessage = "", existingSession = null, recentMeals = []) {
  const prior = normalizeMealSession(existingSession)
  const normalizedCurrent = cleanText(currentMessage)
  const normalizedMealMessage = normalizeTrailingMealQuantityMessage(normalizeInlineMealCorrectionMessage(currentMessage))
  const deleteRequested = Boolean(prior.persistedMealId && genericMealDeleteRequested(currentMessage))
  const rejectionRequested = Boolean(prior.persistedMealId && mealRejectionRequested(currentMessage))
  const correctionRequested = Boolean(prior.persistedMealId && mealCorrectionRequested(currentMessage))
  const fullCorrectionRestatement = Boolean(
    prior.persistedMealId
    && correctionRequested
    && looksLikeFullMealCorrectionRestatement(currentMessage)
  )

  if (!prior.active && !prior.persisted && repeatRecentMealRequested(currentMessage)) {
    const repeated = buildRepeatedMealSession(recentMeals)
    if (repeated) {
      return {
        ...repeated,
        thread_messages: buildThreadMessages(recentMessages, currentMessage),
      }
    }
  }

  if (mealLogQueryRequested(currentMessage)) return null
  if (looksLikeWorkoutOnlyTurn(currentMessage)) return null
  if (!prior.active && !prior.persisted && NUTRITION_QUESTION_PATTERN.test(cleanText(currentMessage))) return null
  if (!prior.active && !prior.persisted && VAGUE_REFERENCE_PATTERN.test(cleanText(currentMessage))) return null
  if (!prior.active && !prior.persisted && VAGUE_TIME_REF_PATTERN.test(cleanText(currentMessage)) && !isExplicitMealStart(currentMessage)) return null
  // Frustrated messages like "why did you save that" should route to general/correction
  // handling when there is no active session. When a session IS persisted, let the
  // delete/correction path handle it instead.
  if (!prior.active && !prior.persisted && FRUSTRATION_PATTERN.test(cleanText(currentMessage))) return null
  if (
    prior.persisted
    && !prior.active
    && detectQuestionOnlyTurn(currentMessage)
    && !mealLogQueryRequested(currentMessage)
    && !mealDeleteRequested(currentMessage)
    && !mealRejectionRequested(currentMessage)
    && !mealCorrectionRequested(currentMessage)
  ) return null

  if (prior.persisted && deleteRequested) {
    return {
      ...persistedMealMarker(prior, recentMessages, currentMessage),
      persisted: true,
      persistedMealId: String(prior.persistedMealId || ""),
      persistedSummary: String(prior.persistedSummary || prior.summary || ""),
      persistedAt: String(prior.persistedAt || ""),
      deleteRequested: true,
      alreadyLogged: false,
    }
  }

  if (prior.persisted && isRedundantPersistedMealFollowUp(currentMessage, prior)) {
    return persistedMealMarker(prior, recentMessages, currentMessage)
  }

  const startedNewMeal = prior.persisted && isExplicitMealStart(currentMessage) && !correctionRequested
  const historyForNext = (fullCorrectionRestatement || startedNewMeal) ? [] : recentMessages
  const shouldSeedPersistedSession = !fullCorrectionRestatement && (prior.active || (prior.persisted && !startedNewMeal))
  const seededSession = shouldSeedPersistedSession ? seedLegacyMealSession(prior) : null
  const next = buildLegacyMealContext(historyForNext, normalizedMealMessage, seededSession)
  if (!next) return null

  const impliedCorrectionRequested = Boolean(
    prior.persistedMealId
    && !startedNewMeal
    && !correctionRequested
    && persistedMealFollowUpLooksLikeUpdate(currentMessage, prior, next.summary)
  )
  const merged = {
    ...emptyMealSessionState(),
    ...next,
    persisted: Boolean(prior.persisted && !startedNewMeal),
    persistedMealId: startedNewMeal ? "" : String(prior.persistedMealId || ""),
    persistedSummary: startedNewMeal ? "" : String(prior.persistedSummary || ""),
    persistedAt: startedNewMeal ? "" : String(prior.persistedAt || ""),
    correctionRequested: correctionRequested || impliedCorrectionRequested || rejectionRequested,
    deleteRequested: false,
    alreadyLogged: false,
  }

  if (
    rejectionRequested
    && (
      (!merged.readyToLog && !merged.summary)
      || summariesEquivalent(merged.summary, prior.persistedSummary || prior.summary)
    )
  ) {
    return {
      ...merged,
      active: true,
      readyToLog: false,
      alreadyLogged: false,
      clarifyQuestion: "Tell me what to change, or say delete it if you want that meal removed.",
      thread_messages: buildThreadMessages(recentMessages, currentMessage),
    }
  }

  if (
    prior.persisted
    && !startedNewMeal
    && !merged.correctionRequested
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
    .replace(/\b(?:i|did|done|completed|finished|just|log|logged|save|saved|track|tracked|for|of|sets?|reps?|kg|min|minutes|at|and|then|more|also|actually|oh|today)\b/g, " ")
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
  // Question-shaped sentences about workouts ("whats a good pre workout meal",
  // "is running good for fat loss") should not start a workout logging session.
  const isWorkoutQuestion = !existingSession?.active && !existingSession?.persisted
    && WORKOUT_QUESTION_PATTERN.test(normalizedCurrent)
  const shouldTrack = !isWorkoutQuestion && (
    WORKOUT_START_PATTERN.test(normalizedCurrent)
    || (workoutCorrectionRequested(currentMessage) && !currentLooksMealLike && (currentLooksWorkoutLike || existingSession?.active || existingSession?.persisted))
    || (suppressionRequested(currentMessage) && (existingSession?.active || existingSession?.persisted))
    || (WORKOUT_FINALISE_PATTERN.test(normalizedCurrent) && hasExistingWorkoutContext)
    || (existingSession?.active && !currentLooksMealLike && (/\d/.test(normalizedCurrent) || workoutReferenceMessage(normalizedCurrent)))
    || (existingSession?.persisted && !currentLooksMealLike && !isExplicitMealStart(normalizedCurrent) && (/\d/.test(normalizedCurrent) || workoutReferenceMessage(normalizedCurrent)))
  )

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
  if (Number.isFinite(patch.sets_delta) && patch.sets_delta > 0) {
    const baseSets = Number(state.sets || 0)
    state.sets = (baseSets > 0 ? baseSets : 1) + patch.sets_delta
  }
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

  const countedBodyweightPattern = text.match(/^(?:i\s+did\s+)?(?<reps>\d+(?:\.\d+)?)\s*(?<exercise>pushups?|push ups?|pullups?|pull ups?|situps?|sit ups?|burpees?|dips?|lunges?|squats?)\b/)
  if (countedBodyweightPattern?.groups) {
    const exercise = normalizeExerciseName(countedBodyweightPattern.groups.exercise)
    return {
      exercise_name: exercise,
      workout_type: exercise,
      muscle_group: "full_body",
      sets: 1,
      reps: Number(countedBodyweightPattern.groups.reps || 0),
      weight_kg: 0,
      duration_seconds: 0,
      distance_km: 0,
    }
  }

  const embeddedExercise = WORKOUT_EXERCISES.find((exercise) => new RegExp(`\\b${exercise.replace(/\s+/g, "\\s+")}\\b`, "i").test(text))
  const compactEmbeddedMetrics = text.match(/(?<weight>\d+(?:\.\d+)?)\s*kg?\s*(?<sets>\d+)\s*x\s*(?<reps>\d+)\b/)
  if (embeddedExercise && compactEmbeddedMetrics?.groups) {
    const exercise = normalizeExerciseName(embeddedExercise)
    return {
      exercise_name: exercise,
      workout_type: exercise,
      muscle_group: cardioAliases.has(cleanText(exercise)) ? "cardio" : "full_body",
      sets: Number(compactEmbeddedMetrics.groups.sets || 0),
      reps: Number(compactEmbeddedMetrics.groups.reps || 0),
      weight_kg: Number(compactEmbeddedMetrics.groups.weight || 0),
      duration_seconds: 0,
      distance_km: 0,
    }
  }

  const repsAtWeightPattern = text.match(/^(?:and\s+then\s+)?(?<reps>\d+(?:\.\d+)?)\s*reps?\s+at\s+(?<weight>\d+(?:\.\d+)?)\s*kg\b/)
  if (repsAtWeightPattern?.groups) {
    return {
      exercise_name: "",
      workout_type: "",
      muscle_group: "full_body",
      sets: 1,
      reps: Number(repsAtWeightPattern.groups.reps || 0),
      weight_kg: Number(repsAtWeightPattern.groups.weight || 0),
      duration_seconds: 0,
      distance_km: 0,
    }
  }

  const moreSetsAtWeightPattern = text.match(/^(?:and\s+then\s+)?(?<sets>\d+)\s+more\s+sets?\s+at\s+(?<weight>\d+(?:\.\d+)?)\s*kg\b/)
  if (moreSetsAtWeightPattern?.groups) {
    return {
      exercise_name: "",
      workout_type: "",
      muscle_group: "full_body",
      sets: 0,
      sets_delta: Number(moreSetsAtWeightPattern.groups.sets || 0),
      reps: 0,
      weight_kg: Number(moreSetsAtWeightPattern.groups.weight || 0),
      duration_seconds: 0,
      distance_km: 0,
    }
  }

  const xPattern = text.match(/(?<exercise>[a-z][a-z\s'/-]+?)\s+(?<weight>\d+(?:\.\d+)?)\s*kg?\s*x\s*(?<reps>\d+)\s*x\s*(?<sets>\d+)/)
  const setsPattern = text.match(/(?<exercise>[a-z][a-z\s'/-]+?)\s+(?<weight>\d+(?:\.\d+)?)\s*kg?\s*(?:for\s*)?(?<sets>\d+)\s*sets?\s*(?:of|x)?\s*(?<reps>\d+)/)
  const simplePattern = text.match(/(?<exercise>[a-z][a-z\s'/-]+?)\s+(?<weight>\d+(?:\.\d+)?)\s*kg?\s*(?:for|x)?\s*(?<reps>\d+)\s*reps?/)
  const compactExercisePattern = text.match(/(?<exercise>[a-z][a-z\s'/-]+?)\s+(?<weight>\d+(?:\.\d+)?)\s*kg?\s*(?<sets>\d+)\s*x\s*(?<reps>\d+)\b/)
  const metricsOnlyPattern = text.match(/^(?<weight>\d+(?:\.\d+)?)\s*kg?\s*(?:for\s*)?(?<sets>\d+)\s*sets?\s*(?:of|x)?\s*(?<reps>\d+)\b/)
  const bodyweightPattern = text.match(/(?<exercise>[a-z][a-z\s'/-]+?)\s+(?<sets>\d+)\s*sets?\s*(?:of|x)?\s*(?<reps>\d+)/)
  const match = xPattern || setsPattern || simplePattern || compactExercisePattern || metricsOnlyPattern || bodyweightPattern
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

function workoutMatchesPersistedSession(parsed = null, session = null) {
  if (!parsed || !session) return false

  const parsedExercise = cleanText(parsed.exercise_name || parsed.workout_type || "")
  const persistedExercise = cleanText(session.exercise_name || session.workout_type || "")
  if (parsedExercise && persistedExercise && parsedExercise !== persistedExercise) return false

  const parsedDuration = Number(parsed.duration_seconds || 0)
  const persistedDuration = Number(session.duration_seconds || 0)
  const parsedDistance = Number(parsed.distance_km || 0)
  const persistedDistance = Number(session.distance_km || 0)
  const parsedWeight = Number(parsed.weight_kg || 0)
  const persistedWeight = Number(session.weight_kg || 0)
  const parsedSets = Number(parsed.sets || 0)
  const persistedSets = Number(session.sets || 0)
  const parsedReps = Number(parsed.reps || 0)
  const persistedReps = Number(session.reps || 0)

  const isCardio = parsedDuration > 0 || persistedDuration > 0 || parsedDistance > 0 || persistedDistance > 0 || cleanText(session.muscle_group || "") === "cardio"
  if (isCardio) {
    return (
      (!parsedExercise || !persistedExercise || parsedExercise === persistedExercise)
      && parsedDuration === persistedDuration
      && parsedDistance === persistedDistance
    )
  }

  return (
    (!parsedExercise || !persistedExercise || parsedExercise === persistedExercise)
    && parsedWeight === persistedWeight
    && parsedSets === persistedSets
    && parsedReps === persistedReps
  )
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
  if (workoutDeleteRequested(normalized)) return false
  if (WORKOUT_FINALISE_PATTERN.test(normalized) || workoutReferenceMessage(normalized)) return true
  const parsed = parseWorkoutMessage(message)
  if (workoutMatchesPersistedSession(parsed, session)) return true
  const summary = cleanText(session.persistedSummary || session.summary || "")
  if (!summary) return false
  const tokens = meaningfulTokens(normalized)
  const numbers = numericTokens(normalized)
  const referencesKnownWorkout = tokens.length > 0 && tokens.every((token) => summary.includes(token))
  if (WORKOUT_START_PATTERN.test(normalized)) {
    return referencesKnownWorkout && summaryIncludesNumbers(numbers, summary)
  }
  return referencesKnownWorkout
}

function persistedWorkoutFollowUpLooksLikeUpdate(message, session, nextState = null) {
  const normalized = cleanText(message)
  if (!session?.persisted || !normalized) return false
  if (workoutDeleteRequested(message) || suppressionRequested(message) || WORKOUT_FINALISE_PATTERN.test(normalized)) return false

  const nextSummary = cleanText(nextState?.summary || "")
  const persistedSummary = cleanText(session.persistedSummary || session.summary || "")
  if (!nextSummary || nextSummary === persistedSummary) return false

  const parsed = parseWorkoutMessage(message)
  if (!parsed) return false

  const hasMetricDetail = hasWorkoutMetricDetail(parsed)
  if (!hasMetricDetail) return false

  const parsedExercise = cleanText(parsed.exercise_name || parsed.workout_type || "")
  const persistedExercise = cleanText(session.exercise_name || session.workout_type || "")
  return !parsedExercise || !persistedExercise || parsedExercise === persistedExercise
}

function buildGenericSuppressedMealSession(recentMessages = [], currentMessage = "") {
  return {
    ...emptyMealSessionState(),
    active: false,
    mealConversation: false,
    suppressed: true,
    suppressionReply: "Okay, I won't save that.",
    thread_messages: buildThreadMessages(recentMessages, currentMessage),
  }
}

function shouldDiscardInvalidMealSessionForWorkoutFollowUp(currentMessage = "", mealSession = null, workoutSession = null, priorWorkoutSession = null) {
  if (!mealSession || !workoutSession) return false
  if (!mealSession.invalidStructure) return false
  if (Array.isArray(mealSession.items) && mealSession.items.length) return false
  if (mealSession.summary || mealSession.readyToLog || mealSession.clarifyQuestion) return false

  const hasOrphanQuantity = Array.isArray(mealSession.pendingQuantities) && mealSession.pendingQuantities.length > 0
  const hasPendingClarification = Boolean(mealSession.pendingClarification)
  if (!hasOrphanQuantity && !hasPendingClarification) return false

  const priorWorkout = normalizeWorkoutSession(priorWorkoutSession)
  const workoutHasContext = Boolean(
    workoutSession.active
    || workoutSession.persisted
    || priorWorkout.active
    || priorWorkout.persisted
  )
  if (!workoutHasContext) return false

  const parsed = parseWorkoutMessage(currentMessage)
  return hasWorkoutMetricDetail(parsed)
}

function buildWorkoutSessionState(recentMessages = [], currentMessage = "", existingSession = null) {
  const prior = normalizeWorkoutSession(existingSession)
  const normalizedCurrent = cleanText(currentMessage)
  const correctionRequested = Boolean(prior.persistedWorkoutId && workoutCorrectionRequested(currentMessage))
  const deleteRequested = Boolean(prior.persistedWorkoutId && workoutDeleteRequested(currentMessage))
  const suppressed = suppressionRequested(currentMessage)

  if (prior.persisted && deleteRequested) {
    return {
      ...prior,
      active: false,
      readyToLog: false,
      clarifyQuestion: "",
      alreadyLogged: false,
      correctionRequested: false,
      deleteRequested: true,
      thread_messages: buildThreadMessages(recentMessages, currentMessage),
    }
  }

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
      deleteRequested: false,
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

  const impliedCorrectionRequested = Boolean(
    prior.persistedWorkoutId
    && !correctionRequested
    && persistedWorkoutFollowUpLooksLikeUpdate(currentMessage, prior, state)
  )
  state.correctionRequested = correctionRequested || impliedCorrectionRequested

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
    && !state.correctionRequested
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
    meal_groups: [],
    currentMealType: "",
    referenceMeal: null,
    persisted: false,
    persistedMealId: "",
    persistedSummary: "",
    persistedAt: "",
    alreadyLogged: false,
    correctionRequested: false,
    deleteRequested: false,
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
      deleteRequested: false,
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
  const splitTurn = splitMixedCoachTurn(currentMessage)
  let nextMealSession = buildMealSessionState(recentMessages, splitTurn.mealMessage, mealSession, recentMeals)
  const nextWorkoutSession = buildWorkoutSessionState(recentMessages, splitTurn.workoutMessage, workoutSession)

  if (
    !nextMealSession
    && !nextWorkoutSession
    && suppressionRequested(currentMessage)
  ) {
    nextMealSession = buildGenericSuppressedMealSession(recentMessages, currentMessage)
  }

  if (shouldDiscardInvalidMealSessionForWorkoutFollowUp(currentMessage, nextMealSession, nextWorkoutSession, workoutSession)) {
    nextMealSession = null
  }

  return {
    mealSession: nextMealSession,
    workoutSession: nextWorkoutSession,
  }
}
