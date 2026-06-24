import {
  buildMealContext as buildLegacyMealContext,
  buildMealStateFromConversation as buildLegacyMealStateFromConversation,
  detectQuestionOnlyTurn as legacyDetectQuestionOnlyTurn,
  emptyMealSession as legacyEmptyMealSession,
  mealStateNeedsClarification as legacyMealStateNeedsClarification,
} from "./mealStateBuilderLegacy.mjs"

const QUANTITY_WORDS = new Map([
  ["a", 1], ["an", 1], ["half", 0.5], ["one", 1], ["two", 2], ["couple", 2], ["a couple", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10], ["eleven", 11], ["twelve", 12], ["thirteen", 13], ["fourteen", 14], ["fifteen", 15], ["sixteen", 16], ["seventeen", 17], ["eighteen", 18], ["nineteen", 19], ["twenty", 20],
])
const UNIT_ALIASES = new Map([
  ["grams", "g"], ["gram", "g"], ["g", "g"], ["kg", "kg"],
  ["lbs", "lb"], ["lb", "lb"], ["pound", "lb"], ["pounds", "lb"],
  ["millilitres", "ml"], ["milliliters", "ml"], ["millilitre", "ml"], ["milliliter", "ml"], ["ml", "ml"],
  ["litres", "l"], ["liters", "l"], ["litre", "l"], ["liter", "l"], ["l", "l"],
  ["cups", "cup"], ["cup", "cup"], ["bowls", "bowl"], ["bowl", "bowl"], ["plates", "plate"], ["plate", "plate"], ["mugs", "mug"], ["mug", "mug"],
  ["serves", "serve"], ["servings", "serve"], ["serving", "serve"], ["serve", "serve"],
  ["slices", "slice"], ["slice", "slice"], ["tablespoons", "tbsp"], ["tablespoon", "tbsp"], ["tbsp", "tbsp"], ["teaspoons", "tsp"], ["teaspoon", "tsp"], ["tsp", "tsp"],
  ["eggs", "egg"], ["egg", "egg"],
])
const PREPARATIONS = ["fried", "grilled", "baked", "boiled", "hard boiled", "hardboiled", "soft boiled", "softboiled", "poached", "scrambled", "toasted", "roasted", "steamed", "raw", "plain", "black", "salted", "unsalted"]
const COOKING_PREPARATIONS = new Set(["fried", "grilled", "baked", "boiled", "hard boiled", "hardboiled", "soft boiled", "softboiled", "poached", "scrambled", "roasted", "steamed"])
const DRINK_WORDS = ["tea", "coffee", "juice", "water", "milk", "smoothie", "shake", "latte", "espresso", "flat white", "long black", "cappuccino", "beer", "wine", "soda", "cola"]
const INGREDIENT_WORDS = ["butter", "oil", "cheese", "sugar", "milk", "cream", "sauce", "gravy", "dressing", "vegemite", "jam", "honey", "salt", "pesto", "mayo"]
const FOOD_HINTS = ["egg", "eggs", "chicken", "rice", "beef", "steak", "pork", "lamb", "fish", "salmon", "tuna", "toast", "bread", "tea", "coffee", "juice", "milk", "beans", "oats", "yoghurt", "yogurt", "butter", "oil", "cheese", "potato", "salad", "apple", "banana", "celery", "chocolate", "pasta", "chips", "fries", "burger", "taco", "tacos", "vegemite", "berry", "berries", "whey", "almond milk"]
const COUNT_REQUIRED = new Set(["egg"])
const COUNT_FRIENDLY_BASES = new Set(["egg", "pie", "pizza", "burger", "cake", "fry", "fries", "chip", "chips", "taco", "cookie", "biscuit", "slider", "sandwich", "wrap", "steak"])
const STOPWORDS = new Set(["i", "had", "have", "ate", "drank", "also", "just", "then", "but", "the", "a", "an", "my", "for", "to", "at", "with", "and", "plus", "of", "it", "that", "this", "was", "were", "is", "are", "did", "do", "done", "log", "track", "save", "add", "include", "today", "later", "tomorrow", "tonight"])

const MEAL_START_PATTERN = /^(?:please\s+)?(?:just\s+)?(?:(?:i\s+)?(?:had|ate|drank)|log|track|save|add|include)\b/i
const CORRECTION_PREFIX = /^(?:actually|sorry|correction|no\s+wait|wait|i meant|make that|change that(?: to)?|update that(?: to)?|instead)\b/i
const SUPPRESS_PATTERN = /\b(?:don't|dont|do not|stop|no)\s+(?:log|save|track|record|add)\b/i
const MEAL_LOG_QUERY_PATTERN = /^(?:what(?:'s|s| is)?|show|list|see|view|display)\b.*\b(?:today'?s?|todays?|my)\b.*\b(?:nutrition|food|meal|meals|log)\b/i
const WORKOUTISH_PATTERN = /\b(?:bench(?:\s+press)?|incline\s+bench|overhead\s+press|shoulder\s+press|row|rows|pull\s*ups?|pullups?|push\s*ups?|pushups?|sit\s*ups?|situps?|burpees?|dips?|lunges?|squat|squats|deadlift|rdl|leg press|treadmill|bike|rower|elliptical|stairmaster|run|ran|walk|walked|cycle|cycled|swam|swim|sets?|reps?)\b|\b\d+\s*x\s*\d+\b|\b\d+(?:\.\d+)?\s*(?:kg|km|mi|miles?|min|mins|minutes)\b/i
const COMPLEX_PATTERN = /\b(?:total|rest|remainder|each|breakfast|lunch|dinner|snack|same as yesterday|same as last time|same as before|repeat that|host variant|taco|tacos|burrito bowl)\b/i
const GROUPED_COMPLEX_PATTERN = /\b(?:total|rest|remainder|each|same as yesterday|same as last time|same as before|repeat that|host variant|taco|tacos|burrito bowl)\b/i
const TIME_REFERENCE_PATTERN = /\b(?:yesterday|last night|last week|earlier today|this morning|tonight)\b/i
const META_COMPLAINT_PATTERN = /\b(?:you asked|i gave you|why can(?:'|’)t you understand|why cant you understand|i told you|already said|what do you mean|i just answered|you just asked)\b/i
const VAGUE_REFERENCE_PATTERN = /^(?:the\s+)?(?:eggs?|tea|coffee|toast|beans?|chicken|rice|butter|oil|salmon|milk|drink|pizza|burger|chips)\b/i
const SHARED_EACH_PATTERN = /^(?:about|around|roughly|approx(?:imately)?|bout)?\s*(?<amount>\d+(?:\.\d+)?|half|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*(?<unit>g|kg|lb|lbs|pound|pounds|ml|l|litre|litres|liter|liters|cup|cups|bowl|bowls|plate|plates|mug|mugs|serve|serves|serving|servings|slice|slices|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|egg|eggs)\s+each$/i
const INLINE_CORRECTION_PATTERN = /\b(?:no wait|i meant|make that|change that|update that|sorry)\b/i
const TRAILING_LOG_DIRECTIVE_PATTERN = /\b(?:(?:can|could)\s+you|please|just)?\s*(?:log|save|track|add)\s+(?:all\s+that|that|it)\b.*$/i
const PACKAGED_UNIT_PATTERN = /\b(?:tin|tins|can|cans|block|blocks|bunch|bunches)\b/i
const WORKOUT_ONLY_FOLLOW_UP_PATTERN = /^(?:i\s+did\s+\d+(?:\.\d+)?(?:\s+total)?|\d+(?:\.\d+)?\s*(?:reps?|sets?|kg|km|mi|miles?|min|mins|minutes)(?:\s*,\s*\d+(?:\.\d+)?\s*(?:reps?|sets?|kg|km|mi|miles?|min|mins|minutes))*)$/i
const FUTURE_MEAL_INTENT_PATTERN = /\b(?:(?:i\s*(?:am|['’]m)?\s*)?(?:going\s+to|gonna)\s+(?:have|eat|drink)|(?:i(?:['’]ll)?|i\s+will|will)\s+(?:have|eat|drink))\b/i
const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"]
const MEAL_TYPE_PREFIX_PATTERN = /^(?:(?<mealType>breakfast|lunch|dinner|snack)\b(?:\s*(?:was|is|:|-)\s*)?)(?<details>.*)$/i
const MEAL_TYPE_SUFFIX_PATTERN = /^(?<details>.+?)\s+\b(?:for|at)\s+(?<mealType>breakfast|lunch|dinner|snack)\b$/i
const RELATION_PATTERNS = [
  { relation: "cooked_in", pattern: /\b(?:cooked|fried|grilled|baked|roasted|boiled|poached|scrambled|steamed)\s+in\b/i },
  { relation: "mixed_with", pattern: /\bmixed with\b/i },
  { relation: "topped_with", pattern: /\b(?:topped|covered)\s+with\b/i },
  { relation: "on", pattern: /\bon\b/i },
  { relation: "with", pattern: /\bwith\b/i },
]
const GENERIC_DRINK_BASES = new Set(["tea", "coffee", "juice", "water", "milk", "smoothie", "shake"])
const AMBIGUOUS_BARE_COUNT_BASES = new Set(["oat", "pasta", "rice", "salad"])
const COMPACT_QUANTITY_UNITS = new Set(["g", "kg", "ml", "l"])
let lastLegacyGateClause = ""

const baseSession = () => ({
  ...legacyEmptyMealSession(),
  thread_messages: [],
  pendingClarification: null,
  structuralIssues: [],
  invalidStructure: false,
  graphNative: false,
  processingMode: "idle",
  fallbackReason: "",
  legacyGateClause: "",
  intentGraph: null,
  candidateFragments: { meal: [], workout: [], general: [] },
  nextClarificationReference: "",
})

const cleanText = (value = "") => String(value).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim()
const titleCase = (value = "") => String(value).trim().replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
const safeArray = (value, limit = 20) => Array.isArray(value) ? value.slice(0, limit) : []
const singularize = (word = "") => cleanText(word).replace(/ies$/i, "y").replace(/(ches|shes|xes|zes)$/i, (v) => v.slice(0, -2)).replace(/s$/i, (v, index, full) => full.endsWith("ss") ? v : "")
const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const containsWord = (text = "", word = "") => {
  const normalizedText = cleanText(text)
  const normalizedWord = cleanText(word)
  if (!normalizedText || !normalizedWord) return false
  return new RegExp(`\\b${escapeRegex(normalizedWord).replace(/\s+/g, "\\s+")}\\b`, "i").test(normalizedText)
}
const baseNamesCompatible = (left = "", right = "") => {
  const normalizedLeft = cleanText(left)
  const normalizedRight = cleanText(right)
  if (!normalizedLeft || !normalizedRight) return false
  return (
    singularize(normalizedLeft) === singularize(normalizedRight)
    || containsWord(normalizedLeft, normalizedRight)
    || containsWord(normalizedRight, normalizedLeft)
  )
}
const canonicalBaseName = (value = "") => {
  const normalized = cleanText(value)
  if (!normalized) return ""
  return normalized.includes(" ") ? normalized : singularize(normalized)
}
const normalizeUnit = (unit = "") => UNIT_ALIASES.get(cleanText(unit)) || cleanText(unit)
const hasDigits = (text = "") => /\d/.test(String(text))
const isDrink = (name = "") => DRINK_WORDS.some((word) => containsWord(name, word))
const mentionsDrink = (text = "") => DRINK_WORDS.some((word) => containsWord(text, word) || containsWord(text, `${singularize(word)}s`))
const isIngredient = (name = "") => INGREDIENT_WORDS.some((word) => containsWord(name, word))
const isWorkoutish = (text = "") => WORKOUTISH_PATTERN.test(cleanText(text))
const looksFoodish = (text = "") => FOOD_HINTS.some((word) => containsWord(text, word))
const normalizeMealType = (value = "") => {
  const text = cleanText(value)
  return MEAL_TYPES.includes(text) ? text : ""
}

function resolveInlineCorrection(text = "") {
  const match = String(text || "").trim().match(
    /^(.+?)\s+(?:no wait|no,?\s*actually|actually(?:,?\s*make that)?|wait no|sorry,?\s*actually|i meant|make that|change that(?: to)?|update that(?: to)?)\s+(.+)$/i
  )
  if (!match) return String(text || "")

  const before = match[1].trim()
  const corrected = match[2].trim()
    .replace(/^like\s+/i, "")
    .replace(/^about\s+/i, "")
    .replace(/^roughly\s+/i, "")
    .trim()

  const correctedQtyOnly = /^(?:(?:a\s+)?(?:half|quarter|third)(?:\s+a?\s*(?:pound|kg|kilo|litre|liter|cup|bowl))?|\d+(?:\.\d+)?\s*(?:g|kg|ml|l|oz|lb|lbs|pound[s]?|cal|kcal|cup[s]?|serve[s]?|slice[s]?|egg[s]?)?)$/i
  if (!correctedQtyOnly.test(corrected)) return corrected

  const original = before.replace(MEAL_START_PATTERN, "").trim()
  const originalQuantity = extractQuantity(original) || extractEmbeddedQuantity(original)
  const originalFoodName = baseNameFromText(original)
  const fallbackFoodName = originalFoodName
    || (originalQuantity?.unit === "egg" ? "eggs" : "")
  return fallbackFoodName ? `${corrected} ${fallbackFoodName}`.trim() : corrected
}

function isFutureMealIntent(text = "") {
  const normalized = cleanText(text)
  if (!normalized) return false
  if (FUTURE_MEAL_INTENT_PATTERN.test(normalized)) return true
  return Boolean(
    /\blater\b/.test(normalized)
    && /\b(?:have|eat|drink)\b/.test(normalized)
    && !MEAL_START_PATTERN.test(normalized)
  )
}

function isMixedMealWorkoutStart(currentMessage = "", existingSession = null) {
  const normalized = cleanText(currentMessage)
  if (existingSession?.active || existingSession?.persisted || !MEAL_START_PATTERN.test(normalized)) return false
  const clauses = splitGraphClauses(currentMessage).map((fragment) => cleanText(fragment))
  return (
    clauses.some((fragment) => isWorkoutish(fragment))
    && clauses.some((fragment) => !isWorkoutish(fragment) && looksFoodish(fragment))
  )
}

export function detectQuestionOnlyTurn(text) {
  return legacyDetectQuestionOnlyTurn(text)
}

function isFreshStandaloneMealTurn(currentMessage = "", existingSession = null) {
  if (existingSession?.active || existingSession?.persisted) return false
  const normalizedCurrent = cleanText(currentMessage)
  if (!normalizedCurrent) return false
  if (detectQuestionOnlyTurn(currentMessage) || isWorkoutish(normalizedCurrent) || isFutureMealIntent(currentMessage)) return false
  return Boolean(
    MEAL_START_PATTERN.test(normalizedCurrent)
    || isSimpleMeasuredMealFragment(currentMessage)
    || isMixedMealWorkoutStart(currentMessage, existingSession)
    || looksFoodish(currentMessage)
    || mentionsDrink(currentMessage)
  )
}

function pruneTrailingNutritionQuestionHistory(recentMessages = [], currentMessage = "", existingSession = null) {
  const history = safeArray(recentMessages, 18).filter((entry) => typeof entry?.content === "string")
  if (!isFreshStandaloneMealTurn(currentMessage, existingSession)) return history

  let cursor = history.length - 1
  let removedNutritionQuestion = false

  while (cursor >= 0) {
    const entry = history[cursor]
    const text = String(entry?.content || "")
    if (entry?.role === "assistant") {
      cursor -= 1
      continue
    }
    if (entry?.role === "user" && detectQuestionOnlyTurn(text)) {
      removedNutritionQuestion = true
      cursor -= 1
      continue
    }
    break
  }

  return removedNutritionQuestion
    ? history.slice(0, cursor + 1)
    : history
}

function cloneItem(item = {}) {
  return {
    base_name: item.base_name || "",
    label: item.label || "",
    category: item.category || "food",
    quantity: item.quantity ? { ...item.quantity } : null,
    preparation: safeArray(item.preparation, 8).map((value) => String(value)),
    modifiers: safeArray(item.modifiers, 8).map((value) => String(value)),
    exclusions: safeArray(item.exclusions, 8).map((value) => String(value)),
    attached_to: item.attached_to || null,
    relation: item.relation || null,
    variant_key: item.variant_key || "",
    meal_type: item.meal_type || "",
  }
}

function normalizeConversation(recentMessages = [], currentMessage = "", existingSession = null) {
  if (existingSession?.active) {
    return [...safeArray(existingSession.thread_messages, 18), { role: "user", content: String(currentMessage || "") }]
  }
  const history = pruneTrailingNutritionQuestionHistory(recentMessages, currentMessage, existingSession)
  if (isGraphNativeSimpleMeasuredFollowUp(history, currentMessage, existingSession)) {
    return [
      ...history.filter((entry) => entry?.role === "assistant").map((entry) => ({ role: entry.role, content: String(entry.content || "") })),
      { role: "user", content: String(currentMessage || "") },
    ]
  }
  return [...history, { role: "user", content: String(currentMessage || "") }]
}

// ─── Graph-Native Guard Functions ────────────────────────────────────────────

function isSimpleFoodDrinkStart(currentMessage = "") {
  const normalizedCurrent = cleanText(currentMessage)
  if (!MEAL_START_PATTERN.test(normalizedCurrent)) return false
  if (/\b(?:with|without|cooked in|fried in|no sugar|no milk)\b/i.test(normalizedCurrent)) return false
  if (INLINE_CORRECTION_PATTERN.test(normalizedCurrent) || PACKAGED_UNIT_PATTERN.test(normalizedCurrent)) return false
  const currentClauses = splitGraphClauses(currentMessage)
  if (currentClauses.length !== 2) return false
  const normalizedClauses = currentClauses.map((fragment) => cleanText(fragment))
  if (normalizedClauses.some((fragment) => !fragment || isWorkoutish(fragment) || detectQuestionOnlyTurn(fragment) || hasDigits(fragment))) return false
  const drinkClauses = normalizedClauses.filter((fragment) => mentionsDrink(fragment))
  const foodClauses = normalizedClauses.filter((fragment) => (
    !mentionsDrink(fragment)
    && Boolean(canonicalBaseName(baseNameFromText(fragment)))
  ))
  return drinkClauses.length === 1 && foodClauses.length === 1
}

function isGraphNativeFriendlyDrinkStart(currentMessage = "") {
  const normalizedCurrent = cleanText(currentMessage)
  if (!MEAL_START_PATTERN.test(normalizedCurrent)) return false
  if (detectQuestionOnlyTurn(normalizedCurrent)) return false
  if (TIME_REFERENCE_PATTERN.test(normalizedCurrent)) return false
  if (/\b\d+(?:\.\d+)?\s*(?:ml|l|g|kg|oz|lb)\b/i.test(normalizedCurrent)) return false
  if (INLINE_CORRECTION_PATTERN.test(normalizedCurrent) || PACKAGED_UNIT_PATTERN.test(normalizedCurrent)) return false
  if (isWorkoutish(normalizedCurrent)) return false
  if (COMPLEX_PATTERN.test(normalizedCurrent)) return false
  if (splitGraphClauses(currentMessage).length !== 1) return false
  if (!mentionsDrink(currentMessage)) return false
  if (/\b(?:with|without|cooked in|fried in|no sugar|no milk)\b/i.test(normalizedCurrent)) return false
  return true
}

function isGraphNativeCorrectionFollowUp(currentMessage = "", existingSession = null) {
  const normalizedCurrent = cleanText(currentMessage)
  if (!existingSession?.active || !existingSession?.graphNative) return false
  if (!CORRECTION_PREFIX.test(normalizedCurrent) && !INLINE_CORRECTION_PATTERN.test(normalizedCurrent)) return false
  if (detectQuestionOnlyTurn(normalizedCurrent) || isWorkoutish(normalizedCurrent)) return false
  if (!hasDigits(normalizedCurrent)) return false
  return splitGraphClauses(currentMessage).length === 1
}

function isGraphNativeFriendlyFreshTurn(conversation = [], currentMessage = "", existingSession = null) {
  const normalizedCurrent = cleanText(currentMessage)
  if (existingSession?.active || existingSession?.persisted) return false
  if (safeArray(conversation, 4).length > 1) return false
  if (!MEAL_START_PATTERN.test(normalizedCurrent)) return false
  if (detectQuestionOnlyTurn(normalizedCurrent)) return false
  if (TIME_REFERENCE_PATTERN.test(normalizedCurrent)) return false
  if (CORRECTION_PREFIX.test(normalizedCurrent) || INLINE_CORRECTION_PATTERN.test(normalizedCurrent)) return false
  if (PACKAGED_UNIT_PATTERN.test(normalizedCurrent)) return false
  if (isWorkoutish(normalizedCurrent)) return false
  if (COMPLEX_PATTERN.test(normalizedCurrent)) return false
  if (splitGraphClauses(currentMessage).length !== 1) return false
  return /\b(?:with|without|cooked in|fried in|no sugar|no milk)\b/i.test(normalizedCurrent)
}

function isGraphNativeAdditiveFreshTurn(conversation = [], currentMessage = "", existingSession = null) {
  const normalizedCurrent = cleanText(currentMessage)
  if (existingSession?.active || existingSession?.persisted) return false
  if (safeArray(conversation, 4).length > 1) return false
  if (!MEAL_START_PATTERN.test(normalizedCurrent)) return false
  if (detectQuestionOnlyTurn(normalizedCurrent)) return false
  if (TIME_REFERENCE_PATTERN.test(normalizedCurrent)) return false
  if (CORRECTION_PREFIX.test(normalizedCurrent) || INLINE_CORRECTION_PATTERN.test(normalizedCurrent)) return false
  if (PACKAGED_UNIT_PATTERN.test(normalizedCurrent)) return false
  if (isWorkoutish(normalizedCurrent)) return false
  if (COMPLEX_PATTERN.test(normalizedCurrent)) return false

  const clauses = splitGraphClauses(currentMessage)
  if (clauses.length < 2 || clauses.length > 4) return false

  let additiveSeen = false
  const bases = []
  for (const clause of clauses) {
    const lead = stripLead(clause)
    const normalizedLead = cleanText(lead)
    if (!normalizedLead || detectQuestionOnlyTurn(normalizedLead) || isWorkoutish(normalizedLead)) return false
    const additive = isAdditiveCountPhrase(lead)
    if (additive) additiveSeen = true
    const quantity = extractQuantity(lead) || extractEmbeddedQuantity(lead)
    if (!quantity) return false
    const additiveStrippedLead = additive ? stripAdditiveLead(lead) : lead
    const baseName = canonicalBaseName(baseNameFromText(additiveStrippedLead))
    if (!baseName) return false
    bases.push(baseName)
  }

  return additiveSeen && bases.every((base) => baseNamesCompatible(base, bases[0] || ""))
}

function stripMealTypePhrase(text = "", fallbackMealType = "") {
  const normalized = String(text || "").trim()
  const inheritedMealType = normalizeMealType(fallbackMealType)
  if (!normalized) return { explicitMealType: "", mealType: inheritedMealType, text: "" }

  const prefixMatch = normalized.match(MEAL_TYPE_PREFIX_PATTERN)
  if (prefixMatch?.groups) {
    const explicitMealType = normalizeMealType(prefixMatch.groups.mealType)
    return {
      explicitMealType,
      mealType: explicitMealType,
      text: String(prefixMatch.groups.details || "").trim(),
    }
  }

  const suffixMatch = normalized.match(MEAL_TYPE_SUFFIX_PATTERN)
  if (suffixMatch?.groups) {
    const explicitMealType = normalizeMealType(suffixMatch.groups.mealType)
    return {
      explicitMealType,
      mealType: explicitMealType,
      text: String(suffixMatch.groups.details || "").trim(),
    }
  }

  const snackSuffixMatch = normalized.match(/^(?<details>.+?)\s+as\s+a\s+(?<mealType>snack)\b$/i)
  if (snackSuffixMatch?.groups) {
    const explicitMealType = normalizeMealType(snackSuffixMatch.groups.mealType)
    return {
      explicitMealType,
      mealType: explicitMealType,
      text: String(snackSuffixMatch.groups.details || "").trim(),
    }
  }

  return { explicitMealType: "", mealType: inheritedMealType, text: normalized }
}

function isSimpleMeasuredMealFragment(text = "") {
  const normalized = cleanText(text)
  if (!normalized || detectQuestionOnlyTurn(text) || isWorkoutish(normalized)) return false
  const quantity = extractQuantity(text) || extractEmbeddedQuantity(text)
  if (!quantity) return false
  const baseName = canonicalBaseName(baseNameFromText(text))
  const resolvedBaseName = baseName || (quantity.unit === "egg" ? "egg" : "")
  if (!resolvedBaseName) return false
  return Boolean(looksFoodish(text) || mentionsDrink(text) || resolvedBaseName)
}

function isGraphNativeImplicitMeasuredTurn(conversation = [], currentMessage = "", existingSession = null) {
  const normalizedCurrent = cleanText(currentMessage)
  if (existingSession?.active || existingSession?.persisted) return false
  if (safeArray(conversation, 4).length > 1) return false
  if (MEAL_START_PATTERN.test(normalizedCurrent)) return false
  if (detectQuestionOnlyTurn(normalizedCurrent)) return false
  if (TIME_REFERENCE_PATTERN.test(normalizedCurrent)) return false
  if (CORRECTION_PREFIX.test(normalizedCurrent) || INLINE_CORRECTION_PATTERN.test(normalizedCurrent)) return false
  if (PACKAGED_UNIT_PATTERN.test(normalizedCurrent)) return false
  if (isWorkoutish(normalizedCurrent)) return false
  if (COMPLEX_PATTERN.test(normalizedCurrent)) return false
  if (splitGraphClauses(currentMessage).length !== 1) return false
  return isSimpleMeasuredMealFragment(currentMessage)
}

function isGraphNativeFriendlyDaypartTurn(conversation = [], currentMessage = "", existingSession = null) {
  const normalizedCurrent = cleanText(currentMessage)
  if (existingSession?.active || existingSession?.persisted) return false
  if (safeArray(conversation, 4).length > 1) return false
  if (detectQuestionOnlyTurn(normalizedCurrent)) return false
  if (TIME_REFERENCE_PATTERN.test(normalizedCurrent)) return false
  if (CORRECTION_PREFIX.test(normalizedCurrent) || INLINE_CORRECTION_PATTERN.test(normalizedCurrent)) return false
  if (PACKAGED_UNIT_PATTERN.test(normalizedCurrent)) return false
  if (isWorkoutish(normalizedCurrent)) return false

  const fragments = splitGraphClauses(currentMessage)
  if (!fragments.length || fragments.length > 4) return false

  let activeMealType = ""
  let explicitMealTypeSeen = false
  for (const fragment of fragments) {
    const { explicitMealType, mealType, text } = stripMealTypePhrase(fragment, activeMealType)
    if (explicitMealType) {
      explicitMealTypeSeen = true
      activeMealType = explicitMealType
    } else if (!mealType) {
      return false
    }
    if (!text || detectQuestionOnlyTurn(text) || isWorkoutish(text)) return false
    if (!looksFoodish(text) && !mentionsDrink(text) && !isSimpleMeasuredMealFragment(text) && !canonicalBaseName(baseNameFromText(text))) {
      return false
    }
  }

  return explicitMealTypeSeen
}

function isGraphNativeFriendlyPersistedFollowUp(currentMessage = "", existingSession = null) {
  const normalizedCurrent = cleanText(currentMessage)
  if (!existingSession?.persisted || !safeArray(existingSession?.items, 24).length) return false
  if (!normalizedCurrent || detectQuestionOnlyTurn(currentMessage) || isWorkoutish(normalizedCurrent)) return false
  if (MEAL_START_PATTERN.test(normalizedCurrent) || SUPPRESS_PATTERN.test(normalizedCurrent)) return false
  if (/^(?:update|remove|swap|change)\b/i.test(normalizedCurrent)) return false
  return Boolean(
    /^\s*(?:with|without|cooked in|fried in|mixed with|topped with|covered in)\b/i.test(normalizedCurrent)
    || /\b(?:with|without|cooked in|fried in|mixed with|topped with|covered in)\b/i.test(normalizedCurrent)
    || /^the\s+/i.test(normalizedCurrent)
    || /^used (?:to fry|for)\b/i.test(normalizedCurrent)
    || extractPreparations(currentMessage).length > 0
    || extractQuantity(currentMessage)
    || extractEmbeddedQuantity(currentMessage)
  )
}

function isGraphNativeSimpleMeasuredFollowUp(conversation = [], currentMessage = "", existingSession = null) {
  if (existingSession?.active || existingSession?.persisted) return false
  const normalizedCurrent = cleanText(currentMessage)
  if (!normalizedCurrent) return false
  if (!MEAL_START_PATTERN.test(normalizedCurrent) && !isSimpleMeasuredMealFragment(currentMessage)) return false
  if (detectQuestionOnlyTurn(normalizedCurrent)) return false
  if (isWorkoutish(normalizedCurrent)) return false
  if (TIME_REFERENCE_PATTERN.test(normalizedCurrent)) return false
  if (CORRECTION_PREFIX.test(normalizedCurrent) || INLINE_CORRECTION_PATTERN.test(normalizedCurrent)) return false
  if (PACKAGED_UNIT_PATTERN.test(normalizedCurrent)) return false
  if (COMPLEX_PATTERN.test(normalizedCurrent)) return false
  if (splitGraphClauses(currentMessage).length !== 1) return false
  if (/\b(?:with|without|cooked in|fried in|no sugar|no milk)\b/i.test(normalizedCurrent)) return false
  const quantity = extractQuantity(currentMessage) || extractEmbeddedQuantity(currentMessage)
  if (!quantity) return false
  const baseName = canonicalBaseName(baseNameFromText(currentMessage))
  if (!baseName && quantity.unit !== "egg") return false
  return true
}

function isGraphNativeClarificationReply(conversation = [], currentMessage = "", existingSession = null) {
  // Only applies when there is NO active session (the session was just created from conversation history)
  if (existingSession?.active || existingSession?.persisted || existingSession?.graphNative) return false
  const normalizedCurrent = cleanText(currentMessage)
  if (!normalizedCurrent) return false
  // Must look like a quantity or count reply, not a new meal statement
  if (MEAL_START_PATTERN.test(normalizedCurrent)) return false
  if (detectQuestionOnlyTurn(normalizedCurrent)) return false
  if (isWorkoutish(normalizedCurrent)) return false
  if (TIME_REFERENCE_PATTERN.test(normalizedCurrent)) return false
  if (COMPLEX_PATTERN.test(normalizedCurrent)) return false
  // The last assistant message must look like a clarification question
  const lastAssistant = [...conversation].reverse().find((m) => m?.role === "assistant")
  if (!lastAssistant) return false
  const lastQ = cleanText(lastAssistant.content || "")
  if (!lastQ) return false
  const isClarifyQ = /\bhow\s+(?:much|many)\b|\bwhat\s+(?:type|kind|size|quantity)\b|\bdid\s+you\s+(?:have|eat|drink|use)\b/i.test(lastQ)
  if (!isClarifyQ) return false
  // Current message must be a bare quantity, count, or simple unit reply
  const isQuantityReply = /^\d+(?:\.\d+)?\s*(?:g|kg|ml|l|oz|lb|grams?|litres?|liters?|cups?|tbsp|tsp|slices?|pieces?|serves?)?$/i.test(normalizedCurrent)
  const isCountReply = /^\d+$/.test(normalizedCurrent)
  const isSimpleReply = isQuantityReply || isCountReply || Boolean(extractQuantity(currentMessage) || extractEmbeddedQuantity(currentMessage))
  return isSimpleReply
}

function isGraphNativeFreshStartOnLegacySession(currentMessage = "", existingSession = null) {
  if (!existingSession?.active || existingSession?.graphNative) return false
  const normalizedCurrent = cleanText(currentMessage)
  if (!normalizedCurrent) return false
  if (!MEAL_START_PATTERN.test(normalizedCurrent)) return false
  if (VAGUE_REFERENCE_PATTERN.test(normalizedCurrent)) return false
  if (/\b(?:that|it|this|same|rest|the)\b/i.test(normalizedCurrent)) return false
  if (CORRECTION_PREFIX.test(normalizedCurrent)) return false
  if (/\b(?:delete|remove|undo|erase)\b(?:\s+(?:it|that|this|meal))?/i.test(normalizedCurrent)) return false
  if (INLINE_CORRECTION_PATTERN.test(normalizedCurrent)) return false
  if (TIME_REFERENCE_PATTERN.test(normalizedCurrent)) return false
  if (PACKAGED_UNIT_PATTERN.test(normalizedCurrent)) return false
  if (splitGraphClauses(currentMessage).length !== 1) return false
  return true
}

function isActiveGraphGroupedFollowUp(currentMessage = "", existingSession = null) {
  const normalizedCurrent = cleanText(currentMessage)
  if (!existingSession?.active || !existingSession?.graphNative) return false
  if (!normalizedCurrent || MEAL_START_PATTERN.test(normalizedCurrent)) return false
  if (detectQuestionOnlyTurn(currentMessage) || isWorkoutish(normalizedCurrent)) return false
  if (existingSession?.pendingClarification) return false
  if (!/^(?:the\s+rest|rest|remainder|one|two|three|four|five|six|seven|eight|nine|ten|\d+)/i.test(normalizedCurrent)) return false
  const roots = safeArray(existingSession?.items, 24).filter((item) => !item.attached_to)
  if (roots.length !== 1) return false
  const [primaryRoot] = roots
  const primaryAmount = Number(primaryRoot?.quantity?.amount || 0)
  const primaryBase = singularize(primaryRoot?.base_name || primaryRoot?.baseName || "")
  const primarySupportsGroupedSplit = (
    primaryAmount > 1
    && (
      !primaryRoot?.quantity?.unit
      || primaryRoot?.category === "drink"
      || COUNT_REQUIRED.has(primaryBase)
      || COUNT_FRIENDLY_BASES.has(primaryBase)
    )
  )
  if (!primarySupportsGroupedSplit) return false
  const currentBase = canonicalBaseName(baseNameFromText(currentMessage))
  if (!currentBase) return true
  return !baseNamesCompatible(primaryRoot.base_name || primaryRoot.baseName || "", currentBase)
}

// ─── Legacy Gate ────────────────────────────────────────────────────────────

function shouldUseLegacy(conversation, currentMessage, existingSession) {
  const normalizedCurrent = cleanText(currentMessage)
  if (isMixedMealWorkoutStart(currentMessage, existingSession) || isWorkoutOnlyFollowUpTurn(currentMessage, existingSession)) {
    lastLegacyGateClause = ""
    return false
  }
  const joined = cleanText([...conversation.map((entry) => entry.content || ""), currentMessage].join(" "))
  const assistantMealTurns = conversation.filter((entry) => entry.role === "assistant" && /\b(?:how much|how many|what type|what kind|cooked in|fried in|used for|before i can log|need more detail)\b/i.test(cleanText(entry.content || ""))).length
  const currentClauses = splitGraphClauses(currentMessage)
  const quantitySignals = (normalizedCurrent.match(/\b(?:\d+(?:\.\d+)?|half|couple)\b/g) || []).length
  const measuredAmountSignals = [...normalizedCurrent.matchAll(/\b(?:\d+(?:\.\d+)?|half)\s*(?:a\s+)?(?:kg|g|lb|lbs|pound|pounds|ml|l|litre|litres|liter|liters|cup|cups|bowl|bowls|plate|plates|mug|mugs|serve|serves|serving|servings|slice|slices|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons)\b/ig)].length
  const activeSession = Boolean(existingSession?.active)
  const activeGraphSession = Boolean(existingSession?.active && existingSession?.graphNative)
  const simpleFoodDrinkStart = isSimpleFoodDrinkStart(currentMessage)
  const graphNativeFriendlyDrinkStart = isGraphNativeFriendlyDrinkStart(currentMessage)
  const graphNativeFriendlyFreshTurn = isGraphNativeFriendlyFreshTurn(conversation, currentMessage, existingSession)
  const graphNativeAdditiveFreshTurn = isGraphNativeAdditiveFreshTurn(conversation, currentMessage, existingSession)
  const graphNativeImplicitMeasuredTurn = isGraphNativeImplicitMeasuredTurn(conversation, currentMessage, existingSession)
  const graphNativeFriendlyDaypartTurn = isGraphNativeFriendlyDaypartTurn(conversation, currentMessage, existingSession)
  const graphNativeFriendlyPersistedFollowUp = isGraphNativeFriendlyPersistedFollowUp(currentMessage, existingSession)
  const graphNativeSimpleMeasuredFollowUp = isGraphNativeSimpleMeasuredFollowUp(conversation, currentMessage, existingSession)
  const graphNativeClarificationReply = isGraphNativeClarificationReply(conversation, currentMessage, existingSession)
  const graphNativeFreshStartOnLegacySession = isGraphNativeFreshStartOnLegacySession(currentMessage, existingSession)
  const activeGraphGroupedFollowUp = isActiveGraphGroupedFollowUp(currentMessage, existingSession)
  const graphNativeCorrectionFollowUp = isGraphNativeCorrectionFollowUp(currentMessage, existingSession)
  const implicitGraphNativeTurn = (
    graphNativeImplicitMeasuredTurn
    || graphNativeSimpleMeasuredFollowUp
    || graphNativeFriendlyDaypartTurn
    || graphNativeFriendlyPersistedFollowUp
    || graphNativeClarificationReply
  )
  const clauses = [
    ["active_non_graph_session", activeSession && !activeGraphSession && !graphNativeFreshStartOnLegacySession],
    ["active_graph_grouped_follow_up", activeGraphGroupedFollowUp],
    ["persisted_not_friendly_follow_up", existingSession?.persisted && !graphNativeFriendlyPersistedFollowUp],
    ["non_graph_meal_conversation", !activeGraphSession && existingSession?.mealConversation && !graphNativeFriendlyPersistedFollowUp],
    ["non_graph_meal_groups", !activeGraphSession && existingSession?.meal_groups?.length],
    ["declared_totals", existingSession?.declaredTotals?.length],
    ["pending_attachments", existingSession?.pendingAttachments?.length],
    ["pending_quantities", existingSession?.pendingQuantities?.length],
    ["correction_requested", existingSession?.correctionRequested],
    ["delete_requested", existingSession?.deleteRequested],
    ["non_graph_assistant_turn_present", !activeGraphSession && conversation.some((entry) => entry.role === "assistant") && !graphNativeFriendlyPersistedFollowUp && !graphNativeSimpleMeasuredFollowUp && !graphNativeClarificationReply],
    ["non_graph_multi_user_turn", !activeGraphSession && conversation.filter((entry) => entry.role === "user").length > 1 && !graphNativeFriendlyPersistedFollowUp && !graphNativeClarificationReply],
    ["non_graph_not_meal_start", !activeGraphSession && !MEAL_START_PATTERN.test(cleanText(currentMessage)) && !implicitGraphNativeTurn],
    ["time_reference", TIME_REFERENCE_PATTERN.test(cleanText(currentMessage))],
    ["inline_correction", INLINE_CORRECTION_PATTERN.test(cleanText(currentMessage))],
    ["packaged_unit", PACKAGED_UNIT_PATTERN.test(cleanText(currentMessage))],
    ["non_graph_multi_quantity_signal", !activeGraphSession && quantitySignals > 1 && !graphNativeFriendlyDaypartTurn && !graphNativeAdditiveFreshTurn],
    ["non_graph_multi_measured_signal", !activeGraphSession && measuredAmountSignals > 1 && !graphNativeFriendlyDaypartTurn && !graphNativeAdditiveFreshTurn],
    ["non_graph_drink_mention", !activeGraphSession && mentionsDrink(currentMessage) && !simpleFoodDrinkStart && !graphNativeFriendlyDrinkStart && !graphNativeFriendlyFreshTurn && !implicitGraphNativeTurn],
    ["non_graph_modifier_phrase", !activeGraphSession && /\b(?:with|without|cooked in|fried in|no sugar|no milk)\b/i.test(cleanText(currentMessage)) && !graphNativeFriendlyFreshTurn && !graphNativeFriendlyPersistedFollowUp],
    ["correction_prefix", !graphNativeCorrectionFollowUp && CORRECTION_PREFIX.test(cleanText(currentMessage))],
    ["grouped_complex_pattern", GROUPED_COMPLEX_PATTERN.test(joined)],
    ["non_graph_complex_pattern", !activeGraphSession && COMPLEX_PATTERN.test(joined) && !graphNativeFriendlyDaypartTurn],
    ["non_graph_multi_assistant_meal_turn", !activeGraphSession && assistantMealTurns > 1],
    ["non_graph_multi_clause", !activeGraphSession && currentClauses.length > 1 && !simpleFoodDrinkStart && !graphNativeFriendlyFreshTurn && !graphNativeFriendlyDaypartTurn && !graphNativeAdditiveFreshTurn],
    ["non_graph_many_clauses", !activeGraphSession && currentClauses.length > 3],
    ["graph_session_that_were", activeGraphSession && /\bthat were\b|\bwere just\b/.test(normalizedCurrent)],
    ["graph_session_n_of_the_were", activeGraphSession && /\b\d+\s+of the\b.*\bwere\b/i.test(normalizedCurrent)],
    ["graph_session_rest_were", activeGraphSession && /\b(?:the\s+)?rest\b.*\b(?:were|was)\b/i.test(normalizedCurrent)],
    ["graph_session_the_x_had", activeGraphSession && /^\s*the\s+\w+.*\bhad\b/i.test(normalizedCurrent)],
  ]
  const hit = clauses.find(([, condition]) => Boolean(condition))
  if (hit) {
    lastLegacyGateClause = hit[0]
    return true
  }
  lastLegacyGateClause = ""
  return false
}

function isWorkoutOnlyFollowUpTurn(currentMessage = "", existingSession = null) {
  if (!existingSession?.mealConversation && !existingSession?.active && !existingSession?.persisted) return false
  const normalizedCurrent = cleanText(currentMessage)
  if (!normalizedCurrent) return false
  if (MEAL_START_PATTERN.test(normalizedCurrent)) return false
  if (mentionsDrink(currentMessage) || looksFoodish(currentMessage)) return false
  if (/\b(?:with|without|cooked in|fried in|no sugar|no milk)\b/i.test(normalizedCurrent)) return false
  return WORKOUT_ONLY_FOLLOW_UP_PATTERN.test(normalizedCurrent) || isWorkoutish(normalizedCurrent)
}

function preserveExistingSessionForIgnoredTurn(conversation = [], currentMessage = "", existingSession = null) {
  const threadMessages = conversation.map((entry) => ({ role: entry.role, content: String(entry.content || "") }))
  const intentGraph = buildIntentGraph(conversation, currentMessage, existingSession)
  return {
    ...baseSession(),
    ...(existingSession || {}),
    thread_messages: threadMessages,
    answerOnly: detectQuestionOnlyTurn(currentMessage),
    intentGraph,
    candidateFragments: {
      meal: safeArray(intentGraph.mealFragments, 16),
      workout: safeArray(intentGraph.workoutFragments, 16),
      general: safeArray(intentGraph.generalFragments, 16),
    },
    graphNative: Boolean(existingSession?.graphNative),
    legacyGateClause: "",
  }
}

function markLegacySession(session, reason = "legacy_gate", legacyGateClause = "") {
  if (!session || typeof session !== "object") return session
  // Detect quantity-unit mismatch in legacy sessions: quantities bound to wrong items
  // e.g. 50g bound to wine, 250ml bound to egg after multi-turn clarification failure
  let lowConfidence = false
  if (Array.isArray(session.items) && session.items.length > 1) {
    const DRINK_BASES = new Set(["wine", "beer", "coffee", "tea", "juice", "milk", "water", "spirits", "alcohol", "cider", "sake", "whiskey", "vodka", "rum", "gin"])
    const SOLID_UNITS = new Set(["g", "kg", "oz", "lb"])
    const LIQUID_UNITS = new Set(["ml", "l"])
    // Unit-category mismatch: 50g on wine, 250ml on egg
    const hasMismatch = session.items.some((item) => {
      const base = String(item.base_name || "").toLowerCase().split(" ").pop()
      const unit = String(item.quantity?.unit || "").toLowerCase()
      if (DRINK_BASES.has(base) && SOLID_UNITS.has(unit)) return true
      if (!DRINK_BASES.has(base) && LIQUID_UNITS.has(unit)) return true
      return false
    })
    // Duplicate base names with fractional quantities: garbled proportional split
    const baseCounts = {}
    for (const item of session.items) {
      const base = String(item.base_name || "").toLowerCase().trim()
      if (base) baseCounts[base] = (baseCounts[base] || 0) + 1
    }
    const hasDuplicateBase = Object.values(baseCounts).some((count) => count > 1)
    const hasFractionalQuantity = session.items.some((item) => {
      const amt = Number(item.quantity?.amount)
      return Number.isFinite(amt) && amt > 0 && amt < 1
    })
    lowConfidence = hasMismatch || (hasDuplicateBase && hasFractionalQuantity) || hasFractionalQuantity
  }
  return {
    ...session,
    graphNative: false,
    processingMode: "legacy",
    fallbackReason: String(reason || "legacy_gate"),
    legacyGateClause: String(legacyGateClause || ""),
    ...(lowConfidence ? { lowConfidence: true } : {}),
  }
}

function normalizeQuantityText(amount, unit = "", fallbackText = "") {
  const normalizedUnit = normalizeUnit(unit)
  const numericText = Number.isFinite(Number(amount)) ? `${Number(amount)}` : String(amount || "").trim()
  if (!normalizedUnit) return String(fallbackText || numericText).trim()
  if (normalizedUnit === "egg") return `${numericText} ${Number(amount) === 1 ? "egg" : "eggs"}`
  if (COMPACT_QUANTITY_UNITS.has(normalizedUnit)) return `${numericText}${normalizedUnit}`
  if (normalizedUnit === "lb") return `${numericText} lb`
  return String(fallbackText || `${numericText} ${normalizedUnit}`).trim()
}

function extractEmbeddedQuantity(text = "") {
  const normalized = cleanText(text)
  if (!normalized) return null
  const quantityMatch = normalized.match(/\b(?<amount>\d+(?:\.\d+)?|a couple|couple|half|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*(?:(?<article>a)\s+)?(?<unit>kg|g|lb|lbs|pound|pounds|ml|l|litre|litres|liter|liters|cup|cups|bowl|bowls|plate|plates|mug|mugs|serve|serves|serving|servings|slice|slices|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|egg|eggs)\b/i)
  if (!quantityMatch?.groups?.amount) return null
  const rawAmount = quantityMatch.groups.amount
  const amount = QUANTITY_WORDS.get(rawAmount) ?? Number(rawAmount)
  if (!Number.isFinite(amount)) return null
  const unit = normalizeUnit(quantityMatch.groups.unit || "")
  const textValue = unit
    ? normalizeQuantityText(amount, unit, quantityMatch[0].trim().replace(/\s+/g, " "))
    : `${rawAmount}`
  return { amount, unit, text: textValue.trim(), modifier: "" }
}

function extractQuantity(text = "") {
  const normalized = cleanText(text)
  if (!normalized) return null
  const quantityMatch = normalized.match(/^(?<amount>\d+(?:\.\d+)?|a couple|couple|half|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*(?:(?<article>a)\s+)?(?:(?:more|another)\s+)?(?:(?:hard\s+boiled|soft\s+boiled|hard|soft|fried|grilled|baked|boiled|poached|scrambled|toasted|roasted|steamed|raw|plain|salted|unsalted)\s+)?(?<unit>kg|g|lb|lbs|pound|pounds|ml|l|litre|litres|liter|liters|cup|cups|bowl|bowls|plate|plates|mug|mugs|serve|serves|serving|servings|slice|slices|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|egg|eggs)?\b/i)
  if (!quantityMatch?.groups?.amount) return null
  const rawAmount = quantityMatch.groups.amount
  const amount = QUANTITY_WORDS.get(rawAmount) ?? Number(rawAmount)
  if (!Number.isFinite(amount)) return null
  const unit = normalizeUnit(quantityMatch.groups.unit || "")
  const textValue = unit
    ? normalizeQuantityText(amount, unit, quantityMatch[0].trim().replace(/\s+/g, " "))
    : `${rawAmount}`
  return { amount, unit, text: textValue.trim(), modifier: "" }
}

function extractPreparations(text = "") {
  const normalized = cleanText(text)
  const hits = []
  for (const preparation of PREPARATIONS) {
    const pattern = new RegExp(`\\b${preparation.replace(/\s+/g, "\\s*")}\\b`, "i")
    if (pattern.test(normalized)) hits.push(preparation === "hardboiled" ? "hard boiled" : preparation === "softboiled" ? "soft boiled" : preparation)
  }
  if (hits.includes("hard boiled") || hits.includes("soft boiled")) {
    return [...new Set(hits.filter((value) => value !== "boiled"))]
  }
  return [...new Set(hits)]
}

function extractExclusions(text = "") {
  const normalized = cleanText(text)
  const exclusions = []
  if (/\bno milk\b|\bwithout milk\b/.test(normalized)) exclusions.push("no milk")
  if (/\bno sugar\b|\bwithout sugar\b/.test(normalized)) exclusions.push("no sugar")
  return exclusions
}

function stripLead(text = "") {
  return String(text || "")
    .replace(/,/g, " ")
    .replace(/^\s*then\s+/i, "")
    .replace(/^\s*but\s+/i, "")
    .replace(/^\s*it\s+(?:was|is)\s+/i, "")
    .replace(MEAL_START_PATTERN, "")
    .replace(CORRECTION_PREFIX, "")
    .replace(TRAILING_LOG_DIRECTIVE_PATTERN, "")
    .replace(/\b(?:please|thanks|thank you)\b/gi, "")
    .trim()
}

function stripAdditiveLead(text = "") {
  return String(text || "").replace(
    /^((?:(?:\d+(?:\.\d+)?|a couple|couple|half|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*(?:a\s+)?(?:kg|g|lb|lbs|pound|pounds|ml|l|litre|litres|liter|liters|cup|cups|bowl|bowls|plate|plates|mug|mugs|serve|serves|serving|servings|slice|slices|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|egg|eggs)?\s+)?)?(?:more|another)\s+/i,
    "$1"
  ).trim()
}

function isAdditiveCountPhrase(text = "") {
  const source = String(text || "").trim()
  return Boolean(source) && stripAdditiveLead(source) !== source
}

function splitRelationTail(text = "") {
  const source = String(text || "").trim()
  for (const candidate of RELATION_PATTERNS) {
    const match = candidate.pattern.exec(source)
    if (!match) continue
    const lead = source.slice(0, match.index).trim()
    const ingredientText = source.slice(match.index + match[0].length).trim()
    if (!ingredientText) break
    return { lead, relation: candidate.relation, ingredientText }
  }
  return { lead: source, relation: "", ingredientText: "" }
}

function baseNameFromText(text = "") {
  const normalized = cleanText(text)
  const stripped = normalized
    .replace(/\b(?:no sugar|without sugar|no milk|without milk)\b/g, " ")
    .replace(/\b(?:fried|grilled|baked|boiled|hard boiled|hardboiled|soft boiled|softboiled|poached|scrambled|toasted|roasted|steamed|raw|plain|black|salted|unsalted)\b/g, " ")
    .replace(/\b(?:about|around|roughly|approx(?:imately)?|bout|whole|entire|small|big|little|extra|lean|skinless|boneless|double|single|some)\b/g, " ")
    .replace(/\b(?:\d+(?:\.\d+)?|half)\s*(?:a\s+)?(?:kg|g|lb|lbs|pound|pounds|ml|l|litre|litres|liter|liters|cup|cups|bowl|bowls|plate|plates|mug|mugs|serve|serves|serving|servings|slice|slices|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|egg|eggs)\b/g, " ")
    .replace(/\b\d+(?:\.\d+)?\b/g, " ")
    .replace(/\b(?:kg|g|lb|lbs|pound|pounds|ml|l|litre|litres|liter|liters|cup|cups|bowl|bowls|plate|plates|mug|mugs|serve|serves|serving|servings|slice|slices|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons)\b/g, " ")
    .split(" ")
    .filter((token) => token && !STOPWORDS.has(token))
  return stripped.join(" ").trim()
}

function detectCategory(baseName = "", quantity = null) {
  if (isIngredient(baseName) && !isDrink(baseName)) return "ingredient"
  if (isDrink(baseName)) return "drink"
  if (quantity?.unit === "ml" || quantity?.unit === "l") return "drink"
  return "food"
}

function itemLabel(baseName = "") {
  const normalized = cleanText(baseName)
  if (!normalized) return "Item"
  return titleCase(normalized)
}

function displayName(item = {}) {
  const base = cleanText(item.label || item.base_name || "")
  if (!base) return ""
  if (item.category === "drink" && base.includes(" ") && !GENERIC_DRINK_BASES.has(base)) {
    const parts = base.split(" ")
    const tail = parts.at(-1) || ""
    if (GENERIC_DRINK_BASES.has(tail)) {
      return `${parts.slice(0, -1).map((part) => titleCase(part)).join(" ")} ${tail}`.trim()
    }
    return titleCase(base)
  }
  return base
}

function pluralizeCountWord(word = "") {
  const normalized = cleanText(word)
  if (!normalized || normalized.endsWith("s")) return normalized
  if (normalized === "fry") return "fries"
  if (/[bcdfghjklmnpqrstvwxyz]y$/i.test(normalized)) return `${normalized.slice(0, -1)}ies`
  if (/(?:s|x|z|ch|sh)$/i.test(normalized)) return `${normalized}es`
  return `${normalized}s`
}

function pluralizeCountLabel(label = "") {
  const normalized = cleanText(label)
  if (!normalized || normalized.endsWith("s")) return normalized
  const parts = normalized.split(" ").filter(Boolean)
  if (!parts.length) return normalized
  const tail = parts.pop() || ""
  return [...parts, pluralizeCountWord(tail)].join(" ").trim()
}

function countDisplayName(item = {}) {
  const base = cleanText(item.label || item.base_name || "")
  if (!base) return ""
  return pluralizeCountLabel(base)
}

function effectiveVariantKey(item = {}) {
  const explicitVariant = cleanText(item.variant_key || "")
  if (explicitVariant) return explicitVariant
  return [...new Set(safeArray(item.preparation, 8).map((value) => cleanText(value)).filter(Boolean))].join("+")
}

function syncVariantKey(item = {}) {
  if (!item || typeof item !== "object") return item
  item.variant_key = effectiveVariantKey(item)
  return item
}

function variantsCompatible(existingItem = {}, nextItem = {}) {
  const existingVariant = effectiveVariantKey(existingItem)
  const nextVariant = effectiveVariantKey(nextItem)
  if (existingVariant && nextVariant) return existingVariant === nextVariant
  return true
}

function shouldUseCountStyleName(item = {}, quantity = null) {
  const base = singularize(item.base_name || item.label || "")
  if (COUNT_REQUIRED.has(base)) return true
  if (!quantity || quantity.unit) return false
  const amount = Number(quantity.amount)
  if (!Number.isFinite(amount) || amount <= 1) return false
  const label = cleanText(item.label || item.base_name || "")
  return label.endsWith("s") || COUNT_FRIENDLY_BASES.has(base)
}

function itemReference(item = {}) {
  const base = cleanText(item.base_name || item.label || "")
  const variant = cleanText(item.variant_key || "")
  const mealType = cleanText(item.meal_type || "")
  if (variant || mealType) return cleanText([base, variant, mealType].filter(Boolean).join("::"))
  return base
}

function splitGraphClauses(text = "") {
  const normalized = String(text || "").trim()
  if (!normalized) return []
  const compact = normalized
    .replace(/\bthen i had\b/gi, "|i had")
    .replace(/\bthen i ate\b/gi, "|i ate")
    .replace(/\bthen i drank\b/gi, "|i drank")
    .replace(/\balso did\b/gi, "|did")
    .replace(/\boh and i did\b/gi, "|i did")
    .replace(/\bplus\b/gi, "|")
    .replace(/\balso\b/gi, "|")
    .replace(/\band\b/gi, "|")
    .replace(/\r?\n+/g, "|")
    .replace(/;/g, "|")
    .replace(/\.(?=\s+(?:\d|i\b|[A-Za-z]))/g, "|")
    .replace(/,/g, "|")
  return compact.split("|").map((part) => part.trim()).filter(Boolean)
}

function buildIntentGraph(conversation = [], currentMessage = "", existingSession = null) {
  const sourceTurns = existingSession?.active ? [{ role: "user", content: String(currentMessage || "") }] : conversation.filter((entry) => entry.role === "user")
  const clauses = []
  const mealFragments = []
  const generalFragments = []
  sourceTurns.forEach((turn, turnIndex) => {
    splitGraphClauses(turn.content || "").forEach((fragmentText, fragmentIndex) => {
      const normalized = cleanText(fragmentText)
      const fragment = {
        id: `clause_${turnIndex}_${fragmentIndex}`,
        index: clauses.length,
        turnIndex,
        text: fragmentText,
        normalized,
        domain: isWorkoutish(normalized) ? "workout" : (detectQuestionOnlyTurn(normalized) ? "general" : "meal"),
      }
      clauses.push(fragment)
      if (fragment.domain === "meal") mealFragments.push({ id: fragment.id, index: fragment.index, text: fragmentText, rawText: fragmentText })
      if (fragment.domain === "general") generalFragments.push({ id: fragment.id, index: fragment.index, text: fragmentText, rawText: fragmentText })
    })
  })
  return {
    raw: String(currentMessage || ""),
    clauses,
    mealFragments,
    workoutFragments: [],
    generalFragments,
    hasMixedDomains: false,
    loggingIntent: MEAL_START_PATTERN.test(cleanText(currentMessage)) || /\bi (?:had|ate|drank)\b/i.test(String(currentMessage || "")),
  }
}

function unresolvedRoots(state) {
  return state.items.filter((item) => !item.attached_to)
}

function findRootByReference(state, reference = "") {
  return state.items.find((item) => !item.attached_to && itemReference(item) === cleanText(reference)) || null
}

function findRootByBaseName(state, baseName = "", mealType = "") {
  const normalized = singularize(baseName)
  const normalizedMealType = normalizeMealType(mealType)
  return state.items.find((item) => (
    !item.attached_to
    && singularize(item.base_name) === normalized
    && (!normalizedMealType || normalizeMealType(item.meal_type || "") === normalizedMealType)
  )) || null
}

function findDrinkTarget(state) {
  if (state.lastDrinkKey) {
    const named = unresolvedRoots(state).find((item) => item.category === "drink" && cleanText(item.base_name) === cleanText(state.lastDrinkKey))
    if (named) return named
  }
  return unresolvedRoots(state).filter((item) => item.category === "drink").slice(-1)[0] || null
}

function findVariantDrinkTarget(state, text = "") {
  const normalized = cleanText(text)
  if (
    !normalized
    || hasDigits(normalized)
    || detectQuestionOnlyTurn(text)
    || isWorkoutish(normalized)
    || MEAL_START_PATTERN.test(normalized)
    || /\b(?:i\s+had|i\s+ate|i\s+drank|had|ate|drank)\b/i.test(normalized)
    || (looksFoodish(normalized) && !mentionsDrink(normalized))
  ) return null
  const drinkRoots = unresolvedRoots(state).filter((item) => item.category === "drink")
  if (drinkRoots.length !== 1) return null
  const target = drinkRoots[0]
  if (!GENERIC_DRINK_BASES.has(cleanText(target.base_name || ""))) return null
  return target
}

// ─── Graph Parsing ──────────────────────────────────────────────────────────

function parseItemFragment(text = "", state) {
  const raw = stripLead(text)
  const normalized = cleanText(raw)
  if (!normalized || META_COMPLAINT_PATTERN.test(normalized)) return { kind: "ignore" }
  if (MEAL_LOG_QUERY_PATTERN.test(normalized) || detectQuestionOnlyTurn(normalized) || isWorkoutish(normalized)) return { kind: "ignore" }
  if (SHARED_EACH_PATTERN.test(normalized)) return { kind: "legacy" }
  if (VAGUE_REFERENCE_PATTERN.test(normalized) && state.pendingClarification?.type === "ingredient_target") {
    return { kind: "reference", reference: cleanText(normalized.replace(/^the\s+/, "")) }
  }
  const relationTail = splitRelationTail(raw)
  const additiveCount = isAdditiveCountPhrase(relationTail.lead)
  const quantity = extractQuantity(relationTail.lead)
  const relationPreparationMatch = relationTail.relation === "cooked_in"
    ? raw.match(/\b(fried|grilled|baked|boiled|poached|scrambled|roasted|steamed)\s+in\b/i)
    : null
  const preparations = [...new Set([
    ...extractPreparations(relationTail.lead),
    ...(relationPreparationMatch?.[1] ? [cleanText(relationPreparationMatch[1])] : []),
  ])]
  const exclusions = extractExclusions(relationTail.lead)
  const variantDrinkTarget = !quantity && !relationTail.relation ? findVariantDrinkTarget(state, raw) : null
  if (variantDrinkTarget) {
    return {
      kind: "bind_variant",
      targetReference: itemReference(variantDrinkTarget),
      variantText: raw,
    }
  }
  const sourceBaseName = additiveCount
    ? baseNameFromText(stripAdditiveLead(relationTail.lead))
    : baseNameFromText(relationTail.lead)
  const baseName = canonicalBaseName(sourceBaseName)
  const embeddedQuantity = !quantity && !relationTail.relation ? extractEmbeddedQuantity(relationTail.lead) : null
  const resolvedQuantity = quantity || embeddedQuantity
  const foodUnitFallback = !baseName && resolvedQuantity?.unit === "egg" ? resolvedQuantity.unit : null
  const impliedPreparedBaseTarget = (
    !baseName
    && !foodUnitFallback
    && !relationTail.relation
    && resolvedQuantity
    && preparations.length > 0
  )
    ? (findRootByReference(state, state.lastMainReference) || unresolvedRoots(state).slice(-1)[0] || null)
    : null
  const resolvedBaseName = baseName || canonicalBaseName(foodUnitFallback || impliedPreparedBaseTarget?.base_name || "")
  const keepBareCountQuantity = !resolvedQuantity || resolvedQuantity.unit || !AMBIGUOUS_BARE_COUNT_BASES.has(singularize(resolvedBaseName))
  if (!resolvedBaseName && resolvedQuantity && CORRECTION_PREFIX.test(cleanText(text))) {
    const correctionTarget = findRootByReference(state, state.lastMainReference) || unresolvedRoots(state).slice(-1)[0] || null
    if (correctionTarget) {
      return {
        kind: "bind_quantity",
        targetReference: itemReference(correctionTarget),
        quantity: resolvedQuantity,
        preparations,
        exclusions,
      }
    }
  }
  if (!resolvedBaseName && resolvedQuantity && state.pendingClarification?.type === "quantity") {
    return { kind: "bind_quantity", quantity: resolvedQuantity, preparations, exclusions }
  }
  if (!resolvedBaseName && exclusions.length) {
    const target = findDrinkTarget(state)
    if (target) return { kind: "bind_exclusions", targetReference: itemReference(target), exclusions }
  }
  if (!resolvedBaseName && relationTail.relation) {
    return { kind: "bind_ingredient", relation: relationTail.relation, ingredientText: relationTail.ingredientText }
  }
  if (!resolvedBaseName && /^cooked in\b|^fried in\b|^with\b/i.test(normalized)) {
    return { kind: "bind_ingredient", relation: normalized.startsWith("with ") ? "with" : "cooked_in", ingredientText: normalized.replace(/^(?:cooked|fried)\s+in\s+|^with\s+/i, "").trim() }
  }
  if (!resolvedBaseName && normalized && state.pendingClarification?.type === "variant") {
    return { kind: "bind_variant", variantText: raw }
  }
  if (!resolvedBaseName) return { kind: "ignore" }
  const item = {
    base_name: resolvedBaseName,
    label: itemLabel(sourceBaseName || resolvedBaseName),
    category: detectCategory(resolvedBaseName, resolvedQuantity),
    quantity: keepBareCountQuantity && resolvedQuantity
      ? { ...resolvedQuantity, text: String(resolvedQuantity.text || "").replace(/\b(a couple)\b/i, "2") }
      : null,
    preparation: preparations,
    modifiers: additiveCount ? ["additive"] : [],
    exclusions,
    attached_to: null,
    relation: null,
    variant_key: [...new Set(preparations.map((value) => cleanText(value)).filter(Boolean))].join("+"),
    meal_type: "",
  }
  return relationTail.relation && relationTail.ingredientText
    ? { kind: "item_with_attachment", item, relation: relationTail.relation, ingredientText: relationTail.ingredientText }
    : { kind: "item", item }
}

function parseIngredientItem(text = "") {
  const quantity = extractQuantity(text)
  const preparations = extractPreparations(text)
  const exclusions = extractExclusions(text)
  const sourceBaseName = baseNameFromText(text) || cleanText(text)
  const baseName = canonicalBaseName(sourceBaseName)
  return {
    base_name: baseName,
    label: itemLabel(sourceBaseName || baseName),
    category: detectCategory(baseName, quantity) === "food" ? "ingredient" : detectCategory(baseName, quantity),
    quantity,
    preparation: preparations,
    modifiers: [],
    exclusions,
    attached_to: null,
    relation: null,
    variant_key: baseName,
    meal_type: "",
  }
}

function canAccumulateQuantity(target = {}, nextItem = {}) {
  if (!safeArray(nextItem.modifiers, 8).includes("additive")) return false
  if (!target?.quantity || !nextItem?.quantity) return false
  const targetAmount = Number(target.quantity.amount)
  const nextAmount = Number(nextItem.quantity.amount)
  if (!Number.isFinite(targetAmount) || !Number.isFinite(nextAmount)) return false
  const targetUnit = normalizeUnit(target.quantity.unit || "")
  const nextUnit = normalizeUnit(nextItem.quantity.unit || "")
  if (targetUnit && nextUnit) return targetUnit === nextUnit
  if (!targetUnit && !nextUnit) return true
  if (COUNT_REQUIRED.has(singularize(target.base_name || nextItem.base_name || ""))) {
    return targetUnit === "egg" || nextUnit === "egg"
  }
  return false
}

function accumulateQuantity(target = {}, nextItem = {}) {
  if (!target?.quantity || !nextItem?.quantity) return
  const targetAmount = Number(target.quantity.amount)
  const nextAmount = Number(nextItem.quantity.amount)
  const baseUnit = normalizeUnit(target.quantity.unit || nextItem.quantity.unit || "")
  const amount = targetAmount + nextAmount
  target.quantity = {
    ...target.quantity,
    ...nextItem.quantity,
    amount,
    unit: baseUnit,
    text: baseUnit
      ? normalizeQuantityText(amount, baseUnit)
      : `${amount}`,
    modifier: "",
  }
}

// ─── Graph Merge ────────────────────────────────────────────────────────────

function mergeRoot(state, nextItem) {
  const pendingTarget = state.pendingClarification?.targetReference ? findRootByReference(state, state.pendingClarification.targetReference) : null
  const sameBase = state.items.find((item) => (
    !item.attached_to
    && singularize(item.base_name) === singularize(nextItem.base_name)
    && normalizeMealType(item.meal_type || "") === normalizeMealType(nextItem.meal_type || "")
    && variantsCompatible(item, nextItem)
  )) || null
  const target = pendingTarget
    && singularize(pendingTarget.base_name) === singularize(nextItem.base_name)
    && variantsCompatible(pendingTarget, nextItem)
    ? pendingTarget
    : sameBase
  if (!target) {
    syncVariantKey(nextItem)
    state.items.push(cloneItem(nextItem))
    state.lastMainKey = cleanText(nextItem.base_name)
    state.lastMainReference = itemReference(nextItem)
    if (nextItem.category === "drink") state.lastDrinkKey = cleanText(nextItem.base_name)
    if (nextItem.meal_type) state.currentMealType = normalizeMealType(nextItem.meal_type)
    return
  }
  if (nextItem.quantity) {
    if (canAccumulateQuantity(target, nextItem)) accumulateQuantity(target, nextItem)
    else target.quantity = { ...nextItem.quantity }
  }
  if (nextItem.preparation.length) target.preparation = [...new Set([...target.preparation, ...nextItem.preparation])]
  if (nextItem.modifiers.length) target.modifiers = [...new Set([...safeArray(target.modifiers, 8), ...nextItem.modifiers])]
  if (nextItem.exclusions.length) target.exclusions = [...new Set([...target.exclusions, ...nextItem.exclusions])]
  if (nextItem.meal_type && !target.meal_type) target.meal_type = normalizeMealType(nextItem.meal_type)
  if (target.base_name === "tea" && nextItem.base_name !== "tea") {
    target.base_name = nextItem.base_name
    target.label = nextItem.label
  }
  if (target.base_name === "coffee" && nextItem.base_name !== "coffee") {
    target.base_name = nextItem.base_name
    target.label = nextItem.label
  }
  syncVariantKey(target)
  state.lastMainKey = cleanText(target.base_name)
  state.lastMainReference = itemReference(target)
  if (target.category === "drink") state.lastDrinkKey = cleanText(target.base_name)
  if (target.meal_type) state.currentMealType = normalizeMealType(target.meal_type)
}

function defaultIngredientTarget(state, relation = "with") {
  const currentTarget = findRootByReference(state, state.lastMainReference)
  if (relation !== "cooked_in") {
    return currentTarget || unresolvedRoots(state).slice(-1)[0] || null
  }
  if (currentTarget?.category === "food") return currentTarget
  const preparedFood = unresolvedRoots(state)
    .filter((item) => item.category === "food" && item.preparation.length)
    .slice(-1)[0] || null
  if (preparedFood) return preparedFood
  const latestFood = unresolvedRoots(state)
    .filter((item) => item.category === "food")
    .slice(-1)[0] || null
  return latestFood || currentTarget || unresolvedRoots(state).slice(-1)[0] || null
}

function attachIngredient(state, ingredient, relation = "with", explicitTarget = null) {
  const target = explicitTarget || defaultIngredientTarget(state, relation)
  if (!target) return
  const existing = state.items.find((item) => item.attached_to === itemReference(target) && item.relation === relation && singularize(item.base_name) === singularize(ingredient.base_name))
  if (existing) {
    if (ingredient.quantity) existing.quantity = { ...ingredient.quantity }
    if (ingredient.preparation.length) existing.preparation = [...new Set([...existing.preparation, ...ingredient.preparation])]
    if (ingredient.exclusions.length) existing.exclusions = [...new Set([...existing.exclusions, ...ingredient.exclusions])]
    return
  }
  state.items.push({
    ...cloneItem(ingredient),
    attached_to: itemReference(target),
    relation,
  })
}

function groupedSplitRoots(state) {
  const foodRoots = unresolvedRoots(state).filter((item) => (
    item.category === "food"
    && Number.isFinite(Number(item?.quantity?.amount))
    && Number(item.quantity.amount) > 0
  ))
  if (!foodRoots.length) return []
  const preferred = [...foodRoots].reverse().find((item) => (
    COUNT_REQUIRED.has(singularize(item.base_name || ""))
    || COUNT_FRIENDLY_BASES.has(singularize(item.base_name || ""))
    || !normalizeUnit(item?.quantity?.unit || "")
  ))
  if (!preferred) return []
  return foodRoots.filter((item) => (
    !item.preparation.length
    && baseNamesCompatible(item.base_name, preferred.base_name)
  ))
}

function sumGroupQuantityAmount(items = []) {
  return safeArray(items, 24).reduce((total, item) => total + Number(item?.quantity?.amount || 0), 0)
}

function parseGroupedSplitFoodFragment(fragment = "", aggregateRoot = {}) {
  const raw = stripLead(fragment)
  const relationTail = splitRelationTail(raw)
  const quantity = extractQuantity(relationTail.lead) || extractEmbeddedQuantity(relationTail.lead)
  if (!quantity) return null
  const relationPreparationMatch = relationTail.relation === "cooked_in"
    ? raw.match(/\b(fried|grilled|baked|boiled|poached|scrambled|roasted|steamed)\s+in\b/i)
    : null
  const preparations = [...new Set([
    ...extractPreparations(relationTail.lead),
    ...(relationPreparationMatch?.[1] ? [cleanText(relationPreparationMatch[1])] : []),
  ])]
  if (!preparations.length) return null
  const explicitBaseName = canonicalBaseName(baseNameFromText(relationTail.lead))
  const resolvedBaseName = explicitBaseName || canonicalBaseName(aggregateRoot.base_name || "")
  if (!resolvedBaseName || !baseNamesCompatible(resolvedBaseName, aggregateRoot.base_name || "")) return null
  const normalizedQuantity = (
    !quantity.unit
    && COUNT_REQUIRED.has(singularize(resolvedBaseName))
  )
    ? {
      ...quantity,
      unit: "egg",
      text: normalizeQuantityText(quantity.amount, "egg", quantity.text || ""),
    }
    : quantity
  const item = {
    base_name: resolvedBaseName,
    label: itemLabel(explicitBaseName || resolvedBaseName),
    category: "food",
    quantity: { ...normalizedQuantity },
    preparation: preparations,
    modifiers: [],
    exclusions: extractExclusions(relationTail.lead),
    attached_to: null,
    relation: null,
    variant_key: [...new Set(preparations.map((value) => cleanText(value)).filter(Boolean))].join("+"),
    meal_type: normalizeMealType(aggregateRoot.meal_type || ""),
  }
  return relationTail.relation && relationTail.ingredientText
    ? { kind: "item_with_attachment", item, relation: relationTail.relation, ingredientText: relationTail.ingredientText }
    : { kind: "item", item }
}

function parsePendingDrinkQuantityFragment(fragment = "", pendingTarget = {}) {
  const raw = stripLead(fragment)
  const quantity = extractQuantity(raw) || extractEmbeddedQuantity(raw)
  if (!quantity) return null
  const baseName = canonicalBaseName(baseNameFromText(raw))
  if (
    baseName
    && !baseNamesCompatible(baseName, pendingTarget.base_name || "")
    && !(isDrink(baseName) && isDrink(pendingTarget.base_name || ""))
  ) return null
  return {
    quantity: { ...quantity },
    base_name: baseName || pendingTarget.base_name || "",
    label: itemLabel(baseName || pendingTarget.base_name || ""),
    exclusions: extractExclusions(raw),
  }
}

function resolveGroupedSplitPendingQuantity(state, fragments = []) {
  const pending = state.pendingClarification
  if (pending?.type !== "quantity") return false
  const pendingTarget = findRootByReference(state, pending.targetReference) || findRootByBaseName(state, pending.targetBaseName)
  if (!pendingTarget || pendingTarget.category !== "drink") return false

  const rootGroup = groupedSplitRoots(state)
  if (!rootGroup.length) return false
  const aggregateRoot = rootGroup[rootGroup.length - 1]
  const aggregateTotal = sumGroupQuantityAmount(rootGroup)
  if (!Number.isFinite(aggregateTotal) || aggregateTotal <= 1) return false

  let drinkPayload = null
  const splitItems = []

  for (const fragment of safeArray(fragments, 12)) {
    const splitFood = parseGroupedSplitFoodFragment(fragment, aggregateRoot)
    if (splitFood) {
      splitItems.push(splitFood)
      continue
    }
    const drinkFragment = parsePendingDrinkQuantityFragment(fragment, pendingTarget)
    if (drinkFragment) {
      drinkPayload = drinkFragment
      continue
    }
    return false
  }

  const splitTotal = splitItems.reduce((total, parsed) => total + Number(parsed.item?.quantity?.amount || 0), 0)
  if (!drinkPayload || splitItems.length < 2 || splitTotal !== aggregateTotal) return false

  const removedReferences = new Set(rootGroup.map((item) => itemReference(item)))
  state.items = state.items.filter((item) => !removedReferences.has(itemReference(item)))

  for (const parsed of splitItems) {
    const nextRoot = cloneItem({
      ...parsed.item,
      meal_type: normalizeMealType(parsed.item.meal_type || aggregateRoot.meal_type || ""),
      modifiers: [],
    })
    syncVariantKey(nextRoot)
    state.items.push(nextRoot)
    state.lastMainReference = itemReference(nextRoot)
    state.lastMainKey = cleanText(nextRoot.base_name)
    if (parsed.kind === "item_with_attachment") {
      attachIngredient(state, parseIngredientItem(parsed.ingredientText), parsed.relation || "with", nextRoot)
    }
  }

  pendingTarget.quantity = { ...drinkPayload.quantity }
  pendingTarget.exclusions = [...new Set([...pendingTarget.exclusions, ...drinkPayload.exclusions])]
  if (drinkPayload.base_name && cleanText(drinkPayload.base_name).length >= cleanText(pendingTarget.base_name).length) {
    pendingTarget.base_name = cleanText(drinkPayload.base_name)
    pendingTarget.label = drinkPayload.label
  }
  state.lastDrinkKey = cleanText(pendingTarget.base_name)
  state.pendingClarification = null
  state.nextClarificationReference = ""
  return true
}

// ─── Pending Reply Resolution ───────────────────────────────────────────────

function applyAlternatePendingReply(state, pending, parsed) {
  const pendingReference = cleanText(pending?.targetReference || "")
  if (!parsed || !pendingReference) return false

  const pendingTarget = findRootByReference(state, pendingReference)
  const parsedAlternateTarget = (
    parsed.kind === "item" || parsed.kind === "item_with_attachment"
  )
    ? findRootByBaseName(state, parsed.item?.base_name || "")
    : null
  const isAlternateDrinkQuantityReply = Boolean(
    parsedAlternateTarget
    && itemReference(parsedAlternateTarget) !== pendingReference
    && parsedAlternateTarget.category === "drink"
    && parsed.item?.category === "drink"
    && parsed.item?.quantity
  )

  if (
    pending?.type === "ingredient"
    && (parsed.kind === "item" || parsed.kind === "item_with_attachment")
    && (parsed.item?.category === "ingredient" || isIngredient(parsed.item?.base_name || ""))
    && !isAlternateDrinkQuantityReply
  ) {
    return false
  }

  if (parsed.kind === "item") {
    const alternateTarget = findRootByBaseName(state, parsed.item.base_name)
    if (alternateTarget && itemReference(alternateTarget) !== pendingReference) {
      mergeRoot(state, parsed.item)
      state.nextClarificationReference = pendingReference
      return true
    }
    if (
      pendingTarget
      && !baseNamesCompatible(parsed.item.base_name, pendingTarget.base_name)
      && looksFoodish(parsed.item.base_name)
    ) {
      mergeRoot(state, parsed.item)
      state.nextClarificationReference = pendingReference
      return true
    }
    return false
  }

  if (parsed.kind === "item_with_attachment") {
    const alternateTarget = findRootByBaseName(state, parsed.item.base_name)
    if (alternateTarget && itemReference(alternateTarget) !== pendingReference) {
      mergeRoot(state, parsed.item)
      const mergedTarget = findRootByBaseName(state, parsed.item.base_name) || alternateTarget
      attachIngredient(state, parseIngredientItem(parsed.ingredientText), parsed.relation || "with", mergedTarget)
      state.nextClarificationReference = pendingReference
      return true
    }
    if (
      pendingTarget
      && !baseNamesCompatible(parsed.item.base_name, pendingTarget.base_name)
      && looksFoodish(parsed.item.base_name)
    ) {
      mergeRoot(state, parsed.item)
      const mergedTarget = findRootByBaseName(state, parsed.item.base_name) || parsed.item
      attachIngredient(state, parseIngredientItem(parsed.ingredientText), parsed.relation || "with", mergedTarget)
      state.nextClarificationReference = pendingReference
      return true
    }
    return false
  }

  if (parsed.kind === "bind_variant") {
    const variantTarget = parsed.targetReference ? findRootByReference(state, parsed.targetReference) : null
    if (!variantTarget || itemReference(variantTarget) === pendingReference) return false
    const suffix = cleanText(parsed.variantText).includes(cleanText(variantTarget.base_name))
      ? parsed.variantText
      : `${parsed.variantText} ${variantTarget.base_name}`
    variantTarget.base_name = cleanText(suffix)
    variantTarget.label = itemLabel(suffix)
    state.lastDrinkKey = cleanText(suffix)
    state.nextClarificationReference = itemReference(variantTarget)
    return true
  }

  if (parsed.kind === "bind_exclusions") {
    const exclusionTarget = parsed.targetReference ? findRootByReference(state, parsed.targetReference) : null
    if (!exclusionTarget || itemReference(exclusionTarget) === pendingReference) return false
    exclusionTarget.exclusions = [...new Set([...exclusionTarget.exclusions, ...parsed.exclusions])]
    state.nextClarificationReference = itemReference(exclusionTarget)
    return true
  }

  if (parsed.kind === "bind_ingredient") {
    const alternateMissing = missingDetails(state).find((entry) => (
      entry.type === "ingredient" && itemReference(entry.item) !== pendingReference
    ))
    if (!alternateMissing) return false
    attachIngredient(
      state,
      parseIngredientItem(parsed.ingredientText),
      parsed.relation || alternateMissing.relation || "with",
      alternateMissing.item,
    )
    state.nextClarificationReference = pendingReference
    return true
  }

  return false
}

function resolvePendingReply(state, text) {
  const pending = state.pendingClarification
  if (!pending) return false
  const normalized = cleanText(text)
  if (!normalized) return false
  if (META_COMPLAINT_PATTERN.test(normalized)) {
    pending.invalidReply = true
    return true
  }
  if (pending.type === "quantity") {
    const parsed = parseItemFragment(text, state)
    if (applyAlternatePendingReply(state, pending, parsed)) return true
    const target = findRootByReference(state, pending.targetReference) || findRootByBaseName(state, pending.targetBaseName)
    const targetMatchesParsedItem = Boolean(
      parsed.kind === "item"
      && target
      && baseNamesCompatible(parsed.item.base_name, target.base_name)
    )
    if (parsed.kind === "bind_variant") {
      const variantTarget = parsed.targetReference ? findRootByReference(state, parsed.targetReference) : null
      if (variantTarget) {
        const variantText = stripLead(parsed.variantText).trim()
        const suffix = cleanText(variantText).includes(cleanText(variantTarget.base_name))
          ? variantText
          : `${variantText} ${variantTarget.base_name}`
        variantTarget.base_name = cleanText(suffix)
        variantTarget.label = itemLabel(suffix)
        state.pendingClarification = {
          ...pending,
          targetReference: itemReference(variantTarget),
          targetBaseName: variantTarget.base_name,
          targetLabel: variantTarget.label,
          invalidReply: false,
        }
        state.lastDrinkKey = cleanText(suffix)
        state.nextClarificationReference = itemReference(variantTarget)
        return true
      }
    }
    if (parsed.kind === "bind_quantity" && target) {
      target.quantity = { ...parsed.quantity }
      if (parsed.preparations.length) target.preparation = [...new Set([...target.preparation, ...parsed.preparations])]
      if (parsed.exclusions.length) target.exclusions = [...new Set([...target.exclusions, ...parsed.exclusions])]
      syncVariantKey(target)
      state.pendingClarification = null
      state.lastMainReference = itemReference(target)
      if (target.category === "drink") state.lastDrinkKey = cleanText(target.base_name)
      return true
    }
    if (targetMatchesParsedItem && parsed.item.quantity) {
      target.quantity = { ...parsed.item.quantity }
      target.preparation = [...new Set([...target.preparation, ...parsed.item.preparation])]
      target.exclusions = [...new Set([...target.exclusions, ...parsed.item.exclusions])]
      if (cleanText(parsed.item.base_name).length > cleanText(target.base_name).length) {
        target.base_name = parsed.item.base_name
        target.label = parsed.item.label
      }
      target.variant_key = parsed.item.variant_key || target.variant_key || ""
      syncVariantKey(target)
      state.pendingClarification = null
      state.lastMainReference = itemReference(target)
      if (target.category === "drink") state.lastDrinkKey = cleanText(target.base_name)
      return true
    }
    // Bare count reply: "4" after "ate egg" — resolve as count for countable food items
    if (targetMatchesParsedItem && !parsed.item.quantity) {
      const bareCount = Number(cleanText(text).trim())
      const COUNTABLE_FOODS = new Set(["egg", "eggs", "slice", "slices", "piece", "pieces", "biscuit", "biscuits", "cookie", "cookies", "cracker", "crackers", "chip", "chips", "grape", "grapes", "strawberry", "strawberries", "olive", "olives", "nugget", "nuggets", "pancake", "pancakes", "waffle", "waffles"])
      const baseLast = cleanText(target.base_name).split(" ").pop()
      if (Number.isFinite(bareCount) && bareCount > 0 && (COUNTABLE_FOODS.has(baseLast) || COUNTABLE_FOODS.has(cleanText(target.base_name)))) {
        target.quantity = { amount: bareCount, unit: baseLast === "eggs" ? "egg" : baseLast, text: String(bareCount), modifier: "" }
        syncVariantKey(target)
        state.pendingClarification = null
        state.lastMainReference = itemReference(target)
        return true
      }
    }
    if (targetMatchesParsedItem) {
      pending.invalidReply = true
      return true
    }
    if (
      parsed.kind === "item"
      && target
      && /^(?:and|plus|also)\b/i.test(normalized)
      && looksFoodish(parsed.item.base_name)
    ) {
      mergeRoot(state, parsed.item)
      const mergedTarget = findRootByBaseName(state, parsed.item.base_name)
      state.pendingClarification = null
      state.nextClarificationReference = itemReference(mergedTarget || parsed.item)
      return true
    }
    if (parsed.kind === "bind_exclusions") {
      const exclusionTarget = parsed.targetReference ? findRootByReference(state, parsed.targetReference) : null
      if (exclusionTarget) {
        exclusionTarget.exclusions = [...new Set([...exclusionTarget.exclusions, ...parsed.exclusions])]
        return true
      }
    }
    if (parsed.kind === "item" && target && !MEAL_START_PATTERN.test(normalized)) {
      pending.invalidReply = true
      return true
    }
    return false
  }
  if (pending.type === "ingredient") {
    const parsed = parseItemFragment(text, state)
    if (applyAlternatePendingReply(state, pending, parsed)) return true
    const target = findRootByReference(state, pending.targetReference) || findRootByBaseName(state, pending.targetBaseName)
    if (!target) return false
    const ingredientText = String(text || "").replace(/^(?:cooked|fried)\s+in\s+|^with\s+/i, "").trim()
    const ingredient = parseIngredientItem(ingredientText)
    attachIngredient(state, ingredient, pending.relation || "cooked_in", target)
    state.pendingClarification = null
    return true
  }
  if (pending.type === "variant") {
    const target = findRootByReference(state, pending.targetReference) || findRootByBaseName(state, pending.targetBaseName)
    if (!target) return false
    const variant = stripLead(text).trim()
    if (!variant || hasDigits(variant)) return false
    const suffix = isDrink(target.base_name) && !/\btea|coffee\b/i.test(variant) ? `${variant} ${target.base_name}` : variant
    target.base_name = cleanText(suffix)
    target.label = itemLabel(suffix)
    state.pendingClarification = null
    state.lastMainReference = itemReference(target)
    return true
  }
  if (pending.type === "ingredient_target") {
    const explicit = findRootByBaseName(state, normalized.replace(/^the\s+/, ""))
    if (explicit) {
      state.lastMainReference = itemReference(explicit)
      state.pendingClarification = null
      return true
    }
  }
  return false
}

function requiresQuantity(item, roots) {
  if (item.quantity) return false
  if (item.category === "drink") return true
  if (COUNT_REQUIRED.has(singularize(item.base_name))) return true
  return roots.length <= 1
}

function defaultQuantityFor(item) {
  if (COUNT_REQUIRED.has(singularize(item.base_name))) return { amount: 1, unit: "egg", text: "1 egg", modifier: "" }
  return { amount: 1, unit: "serve", text: "1 serve", modifier: "" }
}

function missingDetails(state) {
  const roots = unresolvedRoots(state)
  const missing = []
  for (const item of roots) {
    if (requiresQuantity(item, roots)) {
      missing.push({ type: "quantity", item })
      continue
    }
    if (item.preparation.some((value) => cleanText(value) === "fried")) {
      const hasCookedIn = state.items.some((candidate) => candidate.attached_to === itemReference(item) && candidate.relation === "cooked_in")
      if (!hasCookedIn) missing.push({ type: "ingredient", item, relation: "cooked_in" })
    }
  }
  return missing
}

function quantityQuestion(item, invalid = false) {
  const base = singularize(item.base_name)
  const label = cleanText(COUNT_REQUIRED.has(base) ? countDisplayName(item) : displayName(item))
  if (invalid) return COUNT_REQUIRED.has(base) ? `I'm asking how many ${label} you had.` : `I'm asking how much ${label} you had.`
  return COUNT_REQUIRED.has(base) ? `How many ${label} did you have?` : `How much ${label} did you have?`
}

function ingredientQuestion(item, relation = "cooked_in") {
  const preparation = item.preparation[0] ? `${cleanText(item.preparation[0])} ` : ""
  const subject = COUNT_REQUIRED.has(singularize(item.base_name)) ? countDisplayName(item) : displayName(item)
  if (relation === "cooked_in") return `What were the ${preparation}${subject} cooked in?`.replace(/\s+/g, " ").trim()
  return `What did you have with the ${subject}?`
}

function buildPendingClarification(state, missing = []) {
  const preferred = state.nextClarificationReference
    ? missing.find((entry) => itemReference(entry.item) === cleanText(state.nextClarificationReference))
    : null
  const first = preferred || missing[0]
  if (!first) return null
  if (first.type === "quantity") {
    return {
      type: "quantity",
      targetReference: itemReference(first.item),
      targetBaseName: first.item.base_name,
      targetLabel: first.item.label,
      targetMealType: first.item.meal_type || "",
      expectedValueType: "number",
      siblingTargets: missing.slice(1).filter((entry) => entry.type === "quantity").map((entry) => entry.item.base_name),
      invalidReply: Boolean(state.pendingClarification?.invalidReply),
    }
  }
  if (first.type === "ingredient") {
    return {
      type: "ingredient",
      targetReference: itemReference(first.item),
      targetBaseName: first.item.base_name,
      targetLabel: first.item.label,
      targetMealType: first.item.meal_type || "",
      expectedValueType: "text",
      relation: first.relation,
      siblingTargets: [],
      invalidReply: false,
    }
  }
  return null
}

function summarizeAttached(state, target) {
  return state.items
    .filter((item) => item.attached_to === itemReference(target))
    .map((item) => {
      const prefix = item.relation === "cooked_in"
        ? " cooked in "
        : item.relation === "mixed_with"
          ? " mixed with "
          : item.relation === "topped_with"
            ? " topped with "
            : item.relation === "on"
              ? " on "
              : " with "
      return `${prefix}${summarizeItem(state, item, true)}`
    })
    .join("")
}

function summarizeItem(state, item, attachmentOnly = false) {
  const roots = unresolvedRoots(state)
  const quantity = item.quantity || (!attachmentOnly && !requiresQuantity(item, roots) ? defaultQuantityFor(item) : null)
  const quantityText = quantity?.text || ""
  const prepText = item.preparation.length ? `${item.preparation.join(" ")} ` : ""
  const prepAlreadyInQty = prepText && quantityText && item.preparation.every(
    (prep) => cleanText(quantityText).includes(cleanText(prep))
  )
  const effectivePrepText = prepAlreadyInQty ? "" : prepText
  const useCountStyleName = shouldUseCountStyleName(item, quantity)
  const nameText = useCountStyleName
    ? countDisplayName(item)
    : displayName(item)
  const nameAlreadyInQty = Boolean(
    nameText
    && quantityText
    && (
      containsWord(quantityText, nameText)
      || containsWord(quantityText, singularize(nameText))
      || containsWord(quantityText, countDisplayName(item))
    )
  )
  const replacePattern = new RegExp(`\\b(${escapeRegex(countDisplayName(item))}|${escapeRegex(singularize(nameText))}|${escapeRegex(nameText)})\\b`, "i")
  const core = (nameAlreadyInQty
    ? (effectivePrepText ? quantityText.replace(replacePattern, `${effectivePrepText.trim()} $1`) : `${quantityText}`)
    : `${quantityText ? `${quantityText} ` : ""}${effectivePrepText}${nameText}`).replace(/\s+/g, " ").trim()
  const attachmentText = attachmentOnly ? "" : summarizeAttached(state, item)
  const exclusionText = item.exclusions.length ? ` with ${item.exclusions.join(" and ")}` : ""
  return `${core}${attachmentText}${exclusionText}`.replace(/\s+/g, " ").trim()
}

function summarizeState(state) {
  return unresolvedRoots(state).map((item) => summarizeItem(state, item)).filter(Boolean).join(", plus ")
}

function buildMealGroups(state) {
  const grouped = new Map()
  for (const item of unresolvedRoots(state)) {
    const key = item.meal_type || ""
    if (!key) continue
    const bucket = grouped.get(key) || []
    bucket.push(item)
    grouped.set(key, bucket)
  }
  return [...grouped.entries()].map(([mealType, items]) => ({
    meal_type: mealType,
    summary: items.map((item) => summarizeItem(state, item)).join(", plus "),
    items: items.map((item) => cloneItem(item)),
  }))
}

// ─── Turn Processing ────────────────────────────────────────────────────────

function processGraphTurn(state, turn) {
  const text = String(turn.content || "")
  const normalized = cleanText(text)
  if (!normalized || MEAL_LOG_QUERY_PATTERN.test(normalized) || detectQuestionOnlyTurn(text)) return
  if (SUPPRESS_PATTERN.test(normalized)) {
    state.suppressed = true
    state.suppressionReply = "Okay, I won't save that."
    return
  }
  const applyParsedFragment = (fragment, inheritedMealType = "") => {
    const { mealType, text: fragmentText } = stripMealTypePhrase(fragment, inheritedMealType)
    const parsed = parseItemFragment(fragmentText, state)
    if (parsed.kind === "legacy") throw new Error("fallback")
    if (parsed.kind === "ignore") return mealType
    if (parsed.kind === "reference") {
      const target = findRootByBaseName(state, parsed.reference)
      if (target) state.lastMainReference = itemReference(target)
      return mealType
    }
    if (parsed.kind === "bind_ingredient") {
      attachIngredient(state, parseIngredientItem(parsed.ingredientText), parsed.relation || "cooked_in")
      return mealType
    }
    if (parsed.kind === "bind_exclusions") {
      const target = parsed.targetReference ? findRootByReference(state, parsed.targetReference) : findDrinkTarget(state)
      if (target) target.exclusions = [...new Set([...target.exclusions, ...parsed.exclusions])]
      return mealType
    }
    if (parsed.kind === "bind_variant") {
      const drinks = unresolvedRoots(state).filter((item) => item.category === "drink" && !item.quantity)
      if (drinks.length === 1) {
        const variantText = stripLead(parsed.variantText).trim()
        const label = cleanText(variantText).includes(drinks[0].base_name) ? variantText : `${variantText} ${drinks[0].base_name}`
        drinks[0].base_name = cleanText(label)
        drinks[0].label = itemLabel(label)
        state.lastDrinkKey = cleanText(label)
      }
      return mealType
    }
    if (parsed.kind === "bind_quantity") {
      const target = parsed.targetReference
        ? findRootByReference(state, parsed.targetReference)
        : state.pendingClarification?.targetReference
          ? findRootByReference(state, state.pendingClarification.targetReference)
          : unresolvedRoots(state)[0]
      if (target) {
        target.quantity = { ...parsed.quantity }
        if (parsed.preparations.length) target.preparation = [...new Set([...target.preparation, ...parsed.preparations])]
        if (parsed.exclusions.length) target.exclusions = [...new Set([...target.exclusions, ...parsed.exclusions])]
        if (mealType && !target.meal_type) target.meal_type = normalizeMealType(mealType)
      }
      return mealType || target?.meal_type || ""
    }
    if (parsed.kind === "item_with_attachment") {
      const item = { ...parsed.item, meal_type: normalizeMealType(parsed.item.meal_type || mealType || "") }
      mergeRoot(state, item)
      attachIngredient(state, parseIngredientItem(parsed.ingredientText), parsed.relation || "with")
      return item.meal_type || mealType
    }
    if (parsed.kind === "item") {
      const item = { ...parsed.item, meal_type: normalizeMealType(parsed.item.meal_type || mealType || "") }
      mergeRoot(state, item)
      return item.meal_type || mealType
    }
    return mealType
  }

  const fragments = splitGraphClauses(text)
  if (state.pendingClarification && fragments.length > 1) {
    if (resolveGroupedSplitPendingQuantity(state, fragments)) return
    let handledPending = false
    let inheritedMealType = state.currentMealType || ""
    for (const fragment of fragments) {
      if (resolvePendingReply(state, fragment)) {
        handledPending = true
        continue
      }
      inheritedMealType = applyParsedFragment(fragment, inheritedMealType) || inheritedMealType
    }
    if (handledPending) return
  }

  if (resolvePendingReply(state, text)) return
  let inheritedMealType = state.currentMealType || ""
  for (const fragment of fragments) {
    inheritedMealType = applyParsedFragment(fragment, inheritedMealType) || inheritedMealType
  }
}

export function emptyMealSession() {
  return baseSession()
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function buildMealStateFromConversation(recentMessages = [], currentMessage = "", existingSession = null) {
  const resolvedMessage = resolveInlineCorrection(currentMessage)
  const normalizedRecentMessages = pruneTrailingNutritionQuestionHistory(recentMessages, resolvedMessage, existingSession)
  const conversation = normalizeConversation(normalizedRecentMessages, resolvedMessage, existingSession)
  const graphNativeSimpleMeasuredFollowUp = isGraphNativeSimpleMeasuredFollowUp(conversation, resolvedMessage, existingSession)
  const implicitLoggingTurn = (
    isGraphNativeImplicitMeasuredTurn(conversation, resolvedMessage, existingSession)
    || graphNativeSimpleMeasuredFollowUp
    || isGraphNativeFriendlyDaypartTurn(conversation, resolvedMessage, existingSession)
    || isGraphNativeFriendlyPersistedFollowUp(resolvedMessage, existingSession)
  )
  if (!existingSession?.active && !existingSession?.persisted && isFutureMealIntent(resolvedMessage)) {
    return baseSession()
  }
  if (!existingSession?.active && !existingSession?.persisted && /\b(?:nothing|anything|not\s+hungry|not\s+eating|skipped?|fasting?|fast(?:ed)?|no\s+food)\b/i.test(cleanText(resolvedMessage)) && !looksFoodish(resolvedMessage)) {
    return baseSession()
  }
  if (isWorkoutOnlyFollowUpTurn(resolvedMessage, existingSession)) {
    return preserveExistingSessionForIgnoredTurn(conversation, resolvedMessage, existingSession)
  }
  if (shouldUseLegacy(conversation, resolvedMessage, existingSession)) {
    return markLegacySession(buildLegacyMealStateFromConversation(normalizedRecentMessages, resolvedMessage, existingSession), "legacy_gate", lastLegacyGateClause)
  }

  const state = baseSession()
  Object.assign(state, existingSession ? { ...baseSession(), ...existingSession } : {})
  state.items = safeArray(existingSession?.items, 48).map(cloneItem)
  state.declaredTotals = safeArray(existingSession?.declaredTotals, 12).map((entry) => ({ ...entry }))
  state.pendingAttachments = safeArray(existingSession?.pendingAttachments, 8).map((entry) => ({ ...entry }))
  state.pendingQuantities = safeArray(existingSession?.pendingQuantities, 8).map((entry) => ({ ...entry }))
  state.clarificationCounts = { ...(existingSession?.clarificationCounts || {}) }
  state.pendingClarification = existingSession?.pendingClarification ? { ...existingSession.pendingClarification } : null
  state.nextClarificationReference = String(existingSession?.nextClarificationReference || "")
  state.thread_messages = conversation.map((entry) => ({ role: entry.role, content: String(entry.content || "") }))
  state.answerOnly = detectQuestionOnlyTurn(resolvedMessage)
  state.wantsLogging = Boolean(existingSession?.wantsLogging) || MEAL_START_PATTERN.test(cleanText(resolvedMessage)) || implicitLoggingTurn
  state.wantsNutrition = Boolean(existingSession?.wantsNutrition) || /\b(?:calories|protein|carbs|fat|macro|macros)\b/i.test(cleanText(resolvedMessage))
  state.mealConversation = Boolean(existingSession?.mealConversation) || looksFoodish(resolvedMessage) || Boolean(existingSession?.active)
  state.intentGraph = buildIntentGraph(conversation, resolvedMessage, existingSession)
  state.candidateFragments = {
    meal: safeArray(state.intentGraph.mealFragments, 16),
    workout: [],
    general: safeArray(state.intentGraph.generalFragments, 16),
  }

  try {
    const turns = existingSession?.active ? [{ role: "user", content: String(resolvedMessage || "") }] : conversation.filter((entry) => entry.role === "user")
    for (const turn of turns) processGraphTurn(state, turn)
  } catch {
    return markLegacySession(buildLegacyMealStateFromConversation(recentMessages, resolvedMessage, existingSession), "graph_parse_error")
  }

  if (state.suppressed) {
    return {
      ...baseSession(),
      suppressed: true,
      suppressionReply: state.suppressionReply,
      wantsLogging: state.wantsLogging,
      wantsNutrition: state.wantsNutrition,
      answerOnly: state.answerOnly,
      thread_messages: state.thread_messages,
      intentGraph: state.intentGraph,
      candidateFragments: state.candidateFragments,
      legacyGateClause: "",
    }
  }

  let missing = missingDetails(state)
  if (state.pendingClarification?.invalidReply) {
    state.clarificationCounts[`${state.pendingClarification.targetReference}:${state.pendingClarification.type}`] = (state.clarificationCounts[`${state.pendingClarification.targetReference}:${state.pendingClarification.type}`] || 0) + 1
    const repeated = state.clarificationCounts[`${state.pendingClarification.targetReference}:${state.pendingClarification.type}`] >= 2
    if (repeated) {
      const target = findRootByReference(state, state.pendingClarification.targetReference)
      if (target && !target.quantity) target.quantity = defaultQuantityFor(target)
      missing = missingDetails(state)
      state.pendingClarification = null
      state.shouldStopClarifying = true
    }
  }

  state.missingItems = missing
  state.pendingClarification = buildPendingClarification(state, missing)
  state.nextClarificationReference = ""
  state.readyToLog = unresolvedRoots(state).length > 0 && missing.length === 0

  // Detect quantity-unit mismatch caused by multi-turn clarification binding errors.
  // e.g. 50g bound to wine, 250ml bound to egg. Flag for the AI to ignore meal_context
  // and reconstruct from recent_messages instead.
  if (state.readyToLog && state.items.length > 1) {
    const DRINK_ITEMS = new Set(["wine", "beer", "coffee", "tea", "juice", "milk", "water", "spirit", "spirits", "alcohol"])
    const SOLID_UNITS = new Set(["g", "kg", "oz", "lb"])
    const LIQUID_UNITS = new Set(["ml", "l", "fl_oz"])
    const hasMismatch = state.items.some((item) => {
      const isDrinkItem = DRINK_ITEMS.has(cleanText(item.base_name).split(" ").pop()) || item.category === "drink"
      const unit = String(item.quantity?.unit || "").toLowerCase()
      if (isDrinkItem && SOLID_UNITS.has(unit)) return true
      if (!isDrinkItem && LIQUID_UNITS.has(unit) && item.category !== "drink") return true
      return false
    })
    if (hasMismatch) state.lowConfidence = true
  }
  state.summary = summarizeState(state)
  state.meal_groups = buildMealGroups(state)
  state.clarifyQuestion = state.readyToLog
    ? ""
    : state.pendingClarification?.type === "quantity"
      ? quantityQuestion(findRootByReference(state, state.pendingClarification.targetReference) || { base_name: state.pendingClarification.targetBaseName, label: state.pendingClarification.targetLabel }, Boolean(state.pendingClarification.invalidReply))
      : state.pendingClarification?.type === "ingredient"
        ? ingredientQuestion(findRootByReference(state, state.pendingClarification.targetReference) || { base_name: state.pendingClarification.targetBaseName, label: state.pendingClarification.targetLabel, preparation: [] }, state.pendingClarification.relation)
        : ""
  state.mealConversation = Boolean(
    state.mealConversation
    || state.items.length
    || state.pendingClarification
    || state.summary
  )
  state.active = Boolean(state.mealConversation || state.items.length || state.pendingClarification)
  state.lastMainKey = cleanText(unresolvedRoots(state).slice(-1)[0]?.base_name || state.lastMainKey)
  state.lastMainReference = itemReference(unresolvedRoots(state).slice(-1)[0] || {}) || state.lastMainReference || ""
  state.lastDrinkKey = cleanText(unresolvedRoots(state).filter((item) => item.category === "drink").slice(-1)[0]?.base_name || state.lastDrinkKey)
  state.graphNative = true
  state.processingMode = "graph_native"
  state.fallbackReason = ""
  state.legacyGateClause = ""
  return state
}

export function mealStateNeedsClarification(mealState) {
  return mealState?.intentGraph ? Boolean(mealState?.mealConversation && !mealState.readyToLog && mealState.clarifyQuestion) : legacyMealStateNeedsClarification(mealState)
}

export function buildMealContext(recentMessages = [], currentMessage = "", existingSession = null) {
  const resolvedMessage = resolveInlineCorrection(currentMessage)
  const normalizedRecentMessages = pruneTrailingNutritionQuestionHistory(recentMessages, resolvedMessage, existingSession)
  const conversation = normalizeConversation(normalizedRecentMessages, resolvedMessage, existingSession)
  if (!existingSession?.active && !existingSession?.persisted && isFutureMealIntent(resolvedMessage)) {
    return null
  }
  if (isWorkoutOnlyFollowUpTurn(resolvedMessage, existingSession)) {
    return preserveExistingSessionForIgnoredTurn(conversation, resolvedMessage, existingSession)
  }
  if (shouldUseLegacy(conversation, resolvedMessage, existingSession)) {
    return markLegacySession(buildLegacyMealContext(normalizedRecentMessages, resolvedMessage, existingSession), "legacy_gate", lastLegacyGateClause)
  }
  const state = buildMealStateFromConversation(normalizedRecentMessages, resolvedMessage, existingSession)
  if (!state.mealConversation && !state.suppressed) return null
  return {
    ...state,
    items: safeArray(state.items, 48).map(cloneItem),
    meal_groups: safeArray(state.meal_groups, 8).map((group) => ({
      meal_type: group.meal_type || "",
      summary: String(group.summary || ""),
      items: safeArray(group.items, 16).map(cloneItem),
    })),
    thread_messages: safeArray(state.thread_messages, 18).map((entry) => ({ role: entry.role, content: String(entry.content || "") })),
    declaredTotals: safeArray(state.declaredTotals, 12).map((entry) => ({ ...entry })),
    pendingAttachments: safeArray(state.pendingAttachments, 8).map((entry) => ({ ...entry })),
    pendingQuantities: safeArray(state.pendingQuantities, 8).map((entry) => ({ ...entry })),
    pendingClarification: state.pendingClarification ? { ...state.pendingClarification } : null,
    structuralIssues: safeArray(state.structuralIssues, 8).map((entry) => ({ ...entry })),
    invalidStructure: Boolean(state.invalidStructure),
  }
}
