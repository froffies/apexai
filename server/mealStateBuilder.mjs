const QUANTITY_WORDS = new Map([
  ["a", 1],
  ["an", 1],
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["fourteen", 14],
  ["fifteen", 15],
  ["sixteen", 16],
  ["seventeen", 17],
  ["eighteen", 18],
  ["nineteen", 19],
  ["twenty", 20],
])

const STOPWORDS = new Set([
  "i",
  "had",
  "have",
  "ate",
  "drank",
  "also",
  "just",
  "the",
  "a",
  "an",
  "my",
  "for",
  "to",
  "at",
  "with",
  "and",
  "plus",
  "of",
  "it",
  "that",
  "this",
  "was",
  "were",
  "is",
  "are",
  "did",
  "do",
  "done",
  "log",
  "track",
  "save",
  "add",
  "include",
])

const PREPARATION_WORDS = new Set([
  "fried",
  "grilled",
  "baked",
  "boiled",
  "hardboiled",
  "hard-boiled",
  "softboiled",
  "soft-boiled",
  "poached",
  "scrambled",
  "toasted",
  "roasted",
  "steamed",
  "raw",
  "plain",
  "mixed",
  "fresh",
  "squeezed",
  "salted",
  "unsalted",
  "wholemeal",
  "wholegrain",
  "rye",
  "black",
])

const DESCRIPTOR_WORDS = new Set([
  "black",
  "white",
  "plain",
  "medium",
  "rare",
  "medium-rare",
  "well",
  "done",
  "well-done",
  "rest",
  "lean",
  "skinless",
  "boneless",
  "extra",
  "light",
  "small",
  "large",
  "big",
  "little",
  "half",
  "double",
  "single",
  "fresh",
  "squeezed",
])

const DRINK_KEYWORDS = ["tea", "coffee", "juice", "water", "milk", "smoothie", "shake", "latte", "espresso", "flat white", "long black", "cappuccino"]
const INGREDIENT_KEYWORDS = ["butter", "oil", "cheese", "sugar", "milk", "cream", "sauce", "gravy", "dressing", "vegemite", "jam", "honey", "salt", "pesto", "mayo"]
const FOOD_HINT_WORDS = ["egg", "eggs", "chicken", "rice", "beef", "pork", "lamb", "fish", "salmon", "tuna", "toast", "bread", "tea", "coffee", "juice", "milk", "beans", "oats", "yoghurt", "yogurt", "butter", "oil", "cheese", "potato", "salad", "apple", "banana", "celery", "chocolate", "pasta", "chips", "fries", "burger", "taco", "tacos", "vegemite", "berry", "berries", "flat white", "long black", "cappuccino", "latte", "espresso", "whey", "almond milk"]
const QUANTITY_UNITS = [
  "kg",
  "g",
  "gram",
  "grams",
  "ml",
  "l",
  "litre",
  "litres",
  "liter",
  "liters",
  "cup",
  "cups",
  "tbsp",
  "tablespoon",
  "tablespoons",
  "tsp",
  "teaspoon",
  "teaspoons",
  "slice",
  "slices",
  "tin",
  "tins",
  "can",
  "cans",
  "block",
  "blocks",
  "bunch",
  "bunches",
  "serve",
  "serves",
  "serving",
  "servings",
  "bowl",
  "bowls",
  "plate",
  "plates",
  "mug",
  "mugs",
  "cupful",
  "egg",
  "eggs",
]

const MEAL_VERBS = /\b(had|ate|drank|log|track|save|add|include|breakfast|lunch|dinner|snack|meal|calories|macros|protein|carbs|fat)\b/i
const CORRECTION_PREFIX = /^(actually|no\b|nah\b|correction|change that|make that|it was|used to|used for)/i
const FINALISE_PATTERN = /^(?:i just did|i already did|that'?s it|thats it|log it|save it|go ahead|that was it)$/i
const MEAL_REFERENCE_PATTERN = /\b(no sugar|no milk|without sugar|without milk|cooked in|fried in|used to fry|used for|earl grey|the eggs?|the tea|the coffee|the toast|the beans?|the chicken|the rice|the butter|the oil)\b/i
const ASSISTANT_MEAL_PATTERN = /\b(what type|what kind|how much|how many|milk|sugar|cooked in|fried in|used for|before i can log|need more detail|meal details|calories|protein|carbs|fat|estimate|serving size|amount|quantity)\b/i
const SUPPRESS_LOG_PATTERN = /\b(?:don't|dont|do not|stop|no)\s+(?:log|save|track|record|add)\b/i
const NUTRITION_QUESTION_PATTERN = /\b(calories|calorie|macro|macros|protein|carbs|fat|estimate|estimated|calculate)\b/i
const QUESTION_PREFIX_PATTERN = /^(?:how many|how much|what(?:'s| is)?|can you|could you|please calculate|calculate|estimate)\b/i
const WORKOUT_ONLY_PATTERN = /\b(bench press|incline bench|overhead press|shoulder press|preacher curl|bicep curl|tricep pushdown|lat pulldown|pull up|push up|squat|deadlift|rdl|lunge|leg press|seated row|barbell row|treadmill|bike|rower|elliptical|stairmaster|sets?|reps?)\b/i
const REMOVAL_PATTERN = /^(?:actually\s+)?(?:remove|without|skip|delete|drop)\s+(?<item>.+)$|^(?:actually\s+)?no\s+(?<item2>.+)$/i
const REST_PATTERN = /^(?:the\s+)?rest(?:\s+of\s+(?:it|them))?(?:\s+was|\s+were)?\s+(?<details>.+)$/i
const PREPARATION_PATTERNS = [
  ["hard boiled", /\bhard boiled\b/i],
  ["hard boiled", /\bhardboiled\b/i],
  ["soft boiled", /\bsoft boiled\b/i],
  ["soft boiled", /\bsoftboiled\b/i],
  ["fried", /\bfried\b/i],
  ["boiled", /\bboiled\b/i],
  ["poached", /\bpoached\b/i],
  ["scrambled", /\bscrambled\b/i],
  ["grilled", /\bgrilled\b/i],
  ["baked", /\bbaked\b/i],
  ["toasted", /\btoasted\b/i],
  ["roasted", /\broasted\b/i],
  ["steamed", /\bsteamed\b/i],
  ["black", /\bblack\b/i],
  ["raw", /\braw\b/i],
  ["plain", /\bplain\b/i],
  ["mixed", /\bmixed\b/i],
]

const QUANTITY_PATTERN = new RegExp(
  `(?<amount>\\d+(?:\\.\\d+)?|${[...QUANTITY_WORDS.keys()].join("|")})\\s*(?:(?<intensity>whole|entire)\\s+)?(?<unit>${QUANTITY_UNITS.join("|")})\\b(?:\\s+of)?\\s*(?<food>.*)$`,
  "i"
)
const TOTAL_ONLY_PATTERN = new RegExp(
  `^(?<amount>\\d+(?:\\.\\d+)?|${[...QUANTITY_WORDS.keys()].join("|")})\\s+total$`,
  "i"
)
const GROUP_TOTAL_PATTERN = new RegExp(
  `^(?<amount>\\d+(?:\\.\\d+)?|${[...QUANTITY_WORDS.keys()].join("|")})\\s*(?<unit>${QUANTITY_UNITS.join("|")})?\\s*(?<food>[a-z][a-z\\s%-]+?)?\\s+total$`,
  "i"
)
const INHERITED_GROUP_PATTERN = new RegExp(
  `^(?<amount>\\d+(?:\\.\\d+)?|${[...QUANTITY_WORDS.keys()].join("|")})\\s*(?<unit>${QUANTITY_UNITS.join("|")})?\\s*(?<details>(?:hard\\s*boiled|soft\\s*boiled|hardboiled|softboiled|fried|boiled|poached|scrambled|grilled|baked|toasted|roasted|steamed|raw|plain)(?:\\s+[a-z]+)*)$`,
  "i"
)
const VARIANT_FRAGMENT_PATTERN = new RegExp(
  `^(?:(?:the\\s+)?rest(?:\\s+of\\s+(?:it|them))?|(?:\\d+(?:\\.\\d+)?|${[...QUANTITY_WORDS.keys()].join("|")})\\s*(?:${QUANTITY_UNITS.join("|")})?)\\s+[a-z]`,
  "i"
)

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
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1))
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function safeArray(value, limit = 8) {
  return Array.isArray(value) ? value.slice(0, limit) : []
}

function extractPreparations(text) {
  const normalized = cleanText(text)
  if (!normalized) return []
  const preparations = PREPARATION_PATTERNS
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([label]) => label)

  if (preparations.includes("hard boiled") || preparations.includes("soft boiled")) {
    return preparations.filter((label) => label !== "boiled")
  }
  return preparations
}

function toAmount(raw) {
  if (!raw) return null
  const normalized = String(raw).toLowerCase()
  if (QUANTITY_WORDS.has(normalized)) return QUANTITY_WORDS.get(normalized)
  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeUnit(unit) {
  const text = cleanText(unit)
  if (!text) return ""
  if (text === "gram" || text === "grams") return "g"
  if (text === "litre" || text === "litres" || text === "liter" || text === "liters") return "l"
  if (text === "tablespoon" || text === "tablespoons") return "tbsp"
  if (text === "teaspoon" || text === "teaspoons") return "tsp"
  if (text === "serving" || text === "servings") return "serve"
  if (text === "plates") return "plate"
  if (text === "bowls") return "bowl"
  if (text === "mugs") return "mug"
  if (text === "cups") return "cup"
  if (text === "slices") return "slice"
  if (text === "eggs") return "egg"
  if (text === "tins") return "tin"
  if (text === "cans") return "can"
  if (text === "blocks") return "block"
  if (text === "bunches") return "bunch"
  return text
}

function normalizeVariantKey(value = "") {
  return cleanText(value)
    .replace(/\b(?:were|was|with|in|cooked|fried|mixed|covered|topped|the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function uniqueNormalizedValues(values = []) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const normalized = cleanText(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(value)
  }
  return result
}

function normalizeLabel(label) {
  return cleanText(label)
    .replace(/^(?:i had|had|i ate|ate|i drank|drank|log|track|save|add|include)\s+/, "")
    .replace(/\b(?:breakfast|lunch|dinner|snack)\s+was\b/g, "")
    .replace(/\b(?:for breakfast|for lunch|for dinner|as a snack)\b/g, "")
    .replace(/\b(?:please|thanks|thank you)\b/g, "")
    .replace(/[?!.,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

const CORRECTION_LEAD_PATTERNS = [
  /^(?:actually|sorry|correction)\s+/i,
  /^(?:no|nah),?\s+i meant\s+/i,
  /^(?:i meant|it was|it is)\s+/i,
  /^(?:make that|change that(?: to)?|update that(?: to)?|instead)\s+/i,
]

function stripCorrectionLead(text) {
  let normalized = normalizeLabel(text)
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

const RELATION_PATTERNS = [
  { relation: "cooked_in", pattern: /\b(?:cooking|cooked|cook|fried|deep fried|grilled|roasted|baked|sauteed|sautéed|boiled|poached|scrambled|steamed)\s+in\b/i },
  { relation: "mixed_with", pattern: /\bmixed with\b/i },
  { relation: "topped_with", pattern: /\b(?:topped|covered)\s+with\b/i },
  { relation: "on", pattern: /\bon\b/i },
  { relation: "with", pattern: /\bwith\b/i },
]

function firstRelationMatch(text = "") {
  const normalized = String(text || "")
  let best = null
  for (const candidate of RELATION_PATTERNS) {
    const match = candidate.pattern.exec(normalized)
    if (!match) continue
    if (!best || match.index < best.index) {
      best = { ...candidate, index: match.index, matchText: match[0] }
    }
  }
  return best
}

function splitRelationTail(text = "") {
  const relationMatch = firstRelationMatch(text)
  if (!relationMatch) return { lead: String(text || "").trim(), attachments: [] }
  const source = String(text || "")
  const lead = source.slice(0, relationMatch.index).trim()
  const ingredientText = source.slice(relationMatch.index + relationMatch.matchText.length).trim()
  if (!ingredientText) return { lead: source.trim(), attachments: [] }
  return {
    lead,
    attachments: [{ relation: relationMatch.relation, ingredientText }],
  }
}

function relationPromptLabel(relation = "") {
  if (relation === "cooked_in") return "cooked in"
  if (relation === "mixed_with") return "mixed with"
  if (relation === "topped_with") return "with"
  if (relation === "on") return "with"
  return "with"
}

function extractExclusions(text = "") {
  const normalized = cleanText(text)
  const exclusions = []
  if (/\bno sugar\b|\bwithout sugar\b/.test(normalized)) exclusions.push("no sugar")
  if (/\bno milk\b|\bwithout milk\b/.test(normalized)) exclusions.push("no milk")
  return uniqueNormalizedValues(exclusions)
}

function stripExclusionPhrases(text = "") {
  return String(text || "")
    .replace(/\b(?:and\s+)?(?:no sugar|without sugar)\b/gi, "")
    .replace(/\b(?:and\s+)?(?:no milk|without milk)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function deriveRemainingWords(text = "", baseName = "", preparations = []) {
  const normalized = stripExclusionPhrases(stripCorrectionLead(text))
  const baseTokens = cleanText(baseName).split(" ").filter(Boolean).map((token) => singularize(token))
  const preparationTokens = preparations.flatMap((entry) => cleanText(entry).split(" ").filter(Boolean))
  return normalized
    .split(" ")
    .filter((token) => token
      && !STOPWORDS.has(token)
      && !QUANTITY_UNITS.includes(token)
      && !PREPARATION_WORDS.has(token)
      && !baseTokens.includes(singularize(token))
      && !preparationTokens.includes(token)
      && !/^\d+(?:\.\d+)?$/.test(token))
}

function hasDigits(text) {
  return /\d/.test(String(text || ""))
}

function looksLikeQuantityFragment(text) {
  const normalized = cleanText(text)
  if (!normalized) return false
  if (QUANTITY_PATTERN.test(normalized)) return true
  return Boolean(
    normalized.match(new RegExp(`^(?:${[...QUANTITY_WORDS.keys()].join("|")}|\\d+(?:\\.\\d+)?)\\s*(?:${QUANTITY_UNITS.join("|")})\\b`, "i"))
  )
}

function looksLikeVariantFragment(text) {
  const normalized = cleanText(text)
  if (!normalized) return false
  return VARIANT_FRAGMENT_PATTERN.test(normalized)
}

function looksFoodishPhrase(text) {
  const normalized = cleanText(text)
  if (!normalized) return false
  if (FOOD_HINT_WORDS.some((word) => new RegExp(`\\b${escapeRegex(word)}\\b`, "i").test(normalized))) return true
  return normalized
    .split(" ")
    .map((word) => singularize(word))
    .some((word) => FOOD_HINT_WORDS.includes(word))
}

function looksLikeWorkoutOnly(text) {
  const normalized = cleanText(text)
  if (!normalized || looksFoodishPhrase(normalized) || MEAL_VERBS.test(normalized)) return false
  return WORKOUT_ONLY_PATTERN.test(normalized)
}

function detectSuppressedLogging(text) {
  return SUPPRESS_LOG_PATTERN.test(cleanText(text))
}

export function detectQuestionOnlyTurn(text) {
  const raw = String(text || "").trim()
  const normalized = cleanText(raw)
  if (!normalized || detectSuppressedLogging(normalized)) return false
  if (!NUTRITION_QUESTION_PATTERN.test(normalized)) return false
  if (/\b(log|track|save|add|include)\b/i.test(normalized)) return false
  return raw.includes("?") || QUESTION_PREFIX_PATTERN.test(normalized)
}

function looksLikeMealContinuation(text, state, threadHint = false) {
  const normalized = cleanText(text)
  if (!normalized) return false
  if (detectSuppressedLogging(normalized)) return true
  if (detectQuestionOnlyTurn(text) && (threadHint || state.items.length)) return true
  if (looksLikeWorkoutOnly(normalized)) return false
  if (MEAL_VERBS.test(normalized)) return true
  if (FINALISE_PATTERN.test(normalized) && (threadHint || state.items.length)) return true
  if (CORRECTION_PREFIX.test(normalized) && (threadHint || state.items.length)) return true
  if (firstRelationMatch(normalized) && (threadHint || state.items.length)) return true
  if (threadHint && (hasDigits(normalized) || looksFoodishPhrase(normalized) || MEAL_REFERENCE_PATTERN.test(normalized) || looksLikeQuantityFragment(normalized) || looksLikeVariantFragment(normalized))) return true
  if (state.items.length && (hasDigits(normalized) || MEAL_REFERENCE_PATTERN.test(normalized) || looksFoodishPhrase(normalized) || looksLikeQuantityFragment(normalized) || looksLikeVariantFragment(normalized))) return true
  if (looksLikeQuantityFragment(normalized)) return true
  if (looksLikeVariantFragment(normalized) && state.items.length) return true
  return false
}

function isExplicitMealStart(text) {
  const normalized = cleanText(text)
  if (detectSuppressedLogging(normalized)) return false
  return /\b(i had|i ate|i drank|had |ate |drank |log |track |save |add |include )\b/i.test(normalized)
}

function isMealAssistantMessage(text) {
  const normalized = cleanText(text)
  if (!normalized) return false
  if (extractClarificationTargets(normalized).length) return true
  return ASSISTANT_MEAL_PATTERN.test(normalized)
}

function toInternalItem(item = {}) {
  return {
    key: cleanText(item.baseName || item.base_name || item.key || item.label || ""),
    label: item.label || titleCase(item.baseName || item.base_name || item.key || ""),
    baseName: item.baseName || item.base_name || deriveBaseName(item.label || item.key || ""),
    quantity: item.quantity ? { ...item.quantity } : null,
    category: item.category || detectCategory(item.baseName || item.base_name || item.label || ""),
    preparation: Array.isArray(item.preparation) ? [...item.preparation] : [],
    modifiers: Array.isArray(item.modifiers) ? [...item.modifiers] : [],
    exclusions: Array.isArray(item.exclusions) ? [...item.exclusions] : [],
    attachedTo: item.attachedTo || item.attached_to || null,
    relation: item.relation || "",
    sourceMessage: item.sourceMessage || "",
    variantKey: normalizeVariantKey(item.variantKey || item.variant_key || ""),
  }
}

function shouldContinueExistingSession(existingSession, currentMessage, recentMessages = []) {
  if (!existingSession?.active || !Array.isArray(existingSession.items) || !existingSession.items.length) return false
  const normalized = cleanText(currentMessage)
  if (!normalized) return false
  if (isExplicitMealStart(normalized)) return false
  if (looksLikeWorkoutOnly(normalized)) return false
  if (detectSuppressedLogging(currentMessage)) return true
  if (detectQuestionOnlyTurn(currentMessage)) return true
  if (hasDigits(normalized) || looksFoodishPhrase(normalized) || MEAL_REFERENCE_PATTERN.test(normalized) || CORRECTION_PREFIX.test(normalized) || FINALISE_PATTERN.test(normalized)) {
    return true
  }
  if (firstRelationMatch(normalized) && (existingSession?.items?.length || existingSession?.pendingAttachments?.length || existingSession?.pendingQuantities?.length)) return true
  if (looksLikeVariantFragment(normalized)) return true
  const lastAssistant = [...recentMessages].reverse().find((message) => message?.role === "assistant")
  return Boolean(
    lastAssistant
    && (
      extractClarificationTargets(String(lastAssistant.content || "")).length
      || isMealAssistantMessage(String(lastAssistant.content || ""))
    )
  )
}

function extractMealThread(recentMessages = [], currentMessage = "", existingSession = null) {
  const normalizedCurrent = cleanText(currentMessage)
  const questionOnlyCurrent = detectQuestionOnlyTurn(currentMessage)
  const history = Array.isArray(recentMessages) ? recentMessages.filter((entry) => typeof entry?.content === "string") : []
  const workoutOnly = looksLikeWorkoutOnly(normalizedCurrent)
  if (questionOnlyCurrent && !existingSession?.active && !existingSession?.persisted) return []
  const hasMealHistory = history.some((entry) => (
    entry?.role === "user"
    && (isExplicitMealStart(entry.content) || looksFoodishPhrase(entry.content) || MEAL_REFERENCE_PATTERN.test(cleanText(entry.content || "")))
  ))
  const shouldTrack = isExplicitMealStart(normalizedCurrent)
    || looksFoodishPhrase(normalizedCurrent)
    || hasDigits(normalizedCurrent)
    || looksLikeVariantFragment(normalizedCurrent)
    || MEAL_REFERENCE_PATTERN.test(normalizedCurrent)
    || (CORRECTION_PREFIX.test(normalizedCurrent) && (existingSession?.active || existingSession?.persisted || hasMealHistory))
    || (FINALISE_PATTERN.test(normalizedCurrent) && (existingSession?.active || existingSession?.persisted || hasMealHistory))
    || shouldContinueExistingSession(existingSession, currentMessage, history)

  if (!shouldTrack || (workoutOnly && !existingSession?.active)) return []

  const thread = [{ role: "user", content: currentMessage }]
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index]
    const text = String(entry.content || "")
    if (entry.role === "assistant") {
      if (isMealAssistantMessage(text)) {
        thread.unshift(entry)
        continue
      }
      if (thread.length > 1) break
      continue
    }

    if (looksLikeMealContinuation(text, { items: [] }, true)) {
      thread.unshift(entry)
      continue
    }
    break
  }

  return thread
}

function detectCategory(baseName) {
  const normalized = cleanText(baseName)
  if (DRINK_KEYWORDS.some((keyword) => new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i").test(normalized))) return "drink"
  if (INGREDIENT_KEYWORDS.some((keyword) => new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i").test(normalized))) return "ingredient"
  return "food"
}

function singularize(word) {
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`
  if (word.endsWith("ses")) return word.slice(0, -2)
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1)
  return word
}

function deriveBaseName(label, fallback = "") {
  const normalized = normalizeLabel(label)
  if (!normalized && fallback) return fallback
  if (/\beggs?\b/.test(normalized)) return "egg"
  if (/\bearl grey\b/.test(normalized) && !/\btea\b/.test(normalized)) return "earl grey tea"
  if (/\btea\b/.test(normalized)) return normalized.includes("earl grey") ? "earl grey tea" : "tea"
  if (/\balmond milk\b/.test(normalized)) return "almond milk"
  if (/\bwhey\b/.test(normalized)) return "whey protein"
  if (/\bflat white\b/.test(normalized)) return "flat white"
  if (/\blong black\b/.test(normalized)) return "long black"
  if (/\bcappuccino\b/.test(normalized)) return "cappuccino"
  if (/\blatte\b/.test(normalized)) return "latte"
  if (/\bespresso\b/.test(normalized)) return "espresso"
  if (/\bcoffee\b/.test(normalized)) return "coffee"
  if (/\btoast\b/.test(normalized) && /\brye\b/.test(normalized)) return "rye toast"
  if (/\btoast\b/.test(normalized)) return "toast"
  if (/\bapple juice\b/.test(normalized)) return "apple juice"
  if (/\bvegemite\b/.test(normalized)) return "vegemite"
  if (/\bbutter\b/.test(normalized)) return normalized.includes("unsalted") ? "unsalted butter" : normalized.includes("salted") ? "salted butter" : "butter"

  const words = normalized
    .split(" ")
    .filter((word) => word && !STOPWORDS.has(word) && !QUANTITY_UNITS.includes(word) && !/^\d+(?:\.\d+)?$/.test(word))
    .map((word) => singularize(word))

  if (!words.length) return fallback || normalized
  const informativeWords = words.filter((word) => !DESCRIPTOR_WORDS.has(word) && !PREPARATION_WORDS.has(word))
  if (!informativeWords.length) return fallback || words.at(-1) || normalized

  if (words.length > 1) {
    const firstWordIsDescriptor = DESCRIPTOR_WORDS.has(words[0]) || PREPARATION_WORDS.has(words[0])
    const lastWordIsDescriptor = DESCRIPTOR_WORDS.has(words.at(-1)) || PREPARATION_WORDS.has(words.at(-1))
    if (firstWordIsDescriptor && informativeWords.length) return informativeWords.slice(-2).join(" ")
    if (lastWordIsDescriptor && informativeWords.length) return informativeWords.slice(0, 2).join(" ")
  }

  return informativeWords.slice(-2).join(" ")
}

function defaultDisplayLabel(baseName, fallback = "") {
  const normalized = cleanText(baseName || fallback)
  const fallbackNormalized = cleanText(fallback)
  if (!normalized) return ""
  if (normalized === "egg") return "eggs"
  if (normalized === "earl grey tea") return "Earl Grey tea"
  if (normalized === "almond milk") return "Almond milk"
  if (normalized === "whey protein") return "Whey protein"
  if (normalized === "flat white") return "Flat white"
  if (normalized === "long black") return "Long black"
  if (normalized === "cappuccino") return "Cappuccino"
  if (normalized === "latte") return "Latte"
  if (normalized === "espresso") return "Espresso"
  if (fallbackNormalized && singularize(fallbackNormalized) === singularize(normalized)) {
    return titleCase(fallbackNormalized)
  }
  return fallback || normalized
}

function buildQuantity(amount, unit, modifier = "") {
  const numericAmount = toAmount(amount)
  const normalizedUnit = normalizeUnit(unit)
  if (!numericAmount || !normalizedUnit) return null
  return {
    amount: numericAmount,
    unit: normalizedUnit,
    text: `${numericAmount}${normalizedUnit === "g" || normalizedUnit === "kg" || normalizedUnit === "ml" || normalizedUnit === "l" ? normalizedUnit : ` ${normalizedUnit}${numericAmount === 1 ? "" : normalizedUnit === "egg" ? "s" : normalizedUnit === "slice" ? "s" : normalizedUnit === "tin" ? "s" : normalizedUnit === "cup" ? "s" : normalizedUnit === "tbsp" ? "" : normalizedUnit === "tsp" ? "" : normalizedUnit === "serve" ? "" : normalizedUnit === "bowl" ? "s" : normalizedUnit === "plate" ? "s" : normalizedUnit === "block" ? "s" : normalizedUnit === "bunch" ? "es" : ""}`}`.trim(),
    modifier: cleanText(modifier),
  }
}

function parseDeclaredTotalClause(clause) {
  const normalized = stripCorrectionLead(clause)
  const match = normalized.match(GROUP_TOTAL_PATTERN) || normalized.match(TOTAL_ONLY_PATTERN)
  if (!match?.groups) return null
  const amount = toAmount(match.groups.amount)
  if (!amount) return null
  const unitBaseName = normalizeUnit(match.groups.unit || "")
  const explicitFood = match.groups.food || ((unitBaseName && !["g", "kg", "ml", "l", "cup", "tbsp", "tsp", "slice", "tin", "can", "block", "bunch", "serve", "bowl", "plate", "mug"].includes(unitBaseName)) ? unitBaseName : "")
  const baseName = deriveBaseName(explicitFood || "")
  return {
    amount,
    unit: normalizeUnit(match.groups.unit || ""),
    baseName,
  }
}

function rememberGroupedBase(state, baseName = "") {
  const normalized = cleanText(baseName)
  if (!normalized) return
  state.lastGroupedBaseName = normalized
  const pending = state.declaredTotals.find((entry) => !entry.baseName)
  if (pending) pending.baseName = normalized
}

function recordDeclaredTotal(state, entry) {
  if (!entry?.amount) return false
  const nextEntry = {
    amount: entry.amount,
    unit: entry.unit || "",
    baseName: cleanText(entry.baseName || "") || "",
  }
  const duplicate = state.declaredTotals.some((existing) => (
    Number(existing.amount) === Number(nextEntry.amount)
    && normalizeUnit(existing.unit || "") === normalizeUnit(nextEntry.unit || "")
    && cleanText(existing.baseName || "") === cleanText(nextEntry.baseName || "")
  ))
  if (duplicate) return false
  state.declaredTotals.push(nextEntry)
  if (entry.baseName) rememberGroupedBase(state, entry.baseName)
  return true
}

function quantityForComparison(quantity, declaredUnit = "") {
  if (!quantity || !Number.isFinite(Number(quantity.amount))) return null
  const unit = normalizeUnit(quantity.unit || declaredUnit || "")
  if (!unit) return null
  return { amount: Number(quantity.amount), unit }
}

function findDeclaredTotalMismatch(state) {
  for (const declared of state.declaredTotals) {
    const baseName = cleanText(declared.baseName || state.lastGroupedBaseName || state.lastMainKey || "")
    if (!baseName) continue

    const relatedItems = state.items.filter((item) => !item.attachedTo && cleanText(item.baseName || item.key || "") === baseName)
    if (!relatedItems.length) continue

    const comparable = relatedItems
      .map((item) => quantityForComparison(item.quantity, declared.unit))
      .filter(Boolean)

    if (!comparable.length || comparable.length !== relatedItems.length) continue

    const comparisonUnit = declared.unit || comparable[0].unit
    if (!comparisonUnit || comparable.some((entry) => entry.unit !== comparisonUnit)) continue

    const actualAmount = comparable.reduce((total, entry) => total + entry.amount, 0)
    if (actualAmount !== declared.amount) {
      return {
        baseName,
        declaredAmount: declared.amount,
        declaredUnit: comparisonUnit,
        actualAmount,
      }
    }
  }
  return null
}

function cloneItem(item) {
  return JSON.parse(JSON.stringify(item))
}

function appendUnique(list, value) {
  if (!value) return list
  const normalized = cleanText(value)
  if (!normalized) return list
  if (list.some((entry) => cleanText(entry) === normalized)) return list
  return [...list, value]
}

function createItem({ label = "", baseName = "", quantity = null, category = "", preparation = [], modifiers = [], exclusions = [], attachedTo = null, relation = "", sourceMessage = "", variantKey = "" }) {
  const safeBaseName = baseName || deriveBaseName(label)
  const safeCategory = category || detectCategory(safeBaseName || label)
  return {
    key: cleanText(safeBaseName || label),
    label: titleCase(defaultDisplayLabel(safeBaseName, label || safeBaseName)),
    baseName: safeBaseName,
    quantity,
    category: safeCategory,
    preparation,
    modifiers: uniqueNormalizedValues(modifiers),
    exclusions,
    attachedTo,
    relation,
    sourceMessage,
    variantKey: normalizeVariantKey(variantKey),
  }
}

function preparationKey(item) {
  return safeArray(item?.preparation, 8)
    .map((entry) => cleanText(entry))
    .filter(Boolean)
    .sort()
    .join("|")
}

function modifierKey(item) {
  return safeArray(item?.modifiers, 8)
    .map((entry) => cleanText(entry))
    .filter(Boolean)
    .sort()
    .join("|")
}

function itemReferenceKey(item) {
  const base = cleanText(item?.baseName || item?.key || item?.label)
  if (!base) return ""
  const prep = preparationKey(item)
  const modifiers = modifierKey(item)
  const variant = cleanText(item?.variantKey || "")
  const detailKey = [prep, modifiers, variant].filter(Boolean).join("::")
  return detailKey ? `${base}::${detailKey}` : base
}

function quantitiesMatch(left, right) {
  if (!left && !right) return true
  if (!left || !right) return false
  return Number(left.amount || 0) === Number(right.amount || 0)
    && normalizeUnit(left.unit || "") === normalizeUnit(right.unit || "")
}

function ingredientMatchesItem(entry, item) {
  const attachedTo = cleanText(entry?.attachedTo || "")
  const reference = itemReferenceKey(item)
  const base = cleanText(item?.baseName || item?.key || "")
  return Boolean(attachedTo && (attachedTo === reference || attachedTo === base))
}

function findBestItemIndex(state, nextItem) {
  const key = cleanText(nextItem.baseName || nextItem.key || nextItem.label)
  const nextAttachment = cleanText(nextItem.attachedTo || "")
  const nextPreparationKey = preparationKey(nextItem)
  const nextModifierKey = modifierKey(nextItem)
  const nextVariantKey = cleanText(nextItem.variantKey || "")
  const candidates = state.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      const existingKey = cleanText(item.baseName || item.key)
      const sameAttachment = cleanText(item.attachedTo || "") === nextAttachment
      return sameAttachment && (
        existingKey === key
        || existingKey.includes(key)
        || key.includes(existingKey)
      )
    })

  if (!candidates.length) return -1

  const exactVariant = candidates.find(({ item }) => (
    preparationKey(item) === nextPreparationKey
    && modifierKey(item) === nextModifierKey
    && cleanText(item.variantKey || "") === nextVariantKey
  ))
  if ((nextPreparationKey || nextModifierKey || nextVariantKey) && exactVariant) return exactVariant.index

  const equivalentStructuredCandidate = candidates.find(({ item }) => (
    preparationKey(item) === nextPreparationKey
    && modifierKey(item) === nextModifierKey
    && quantitiesMatch(item.quantity, nextItem.quantity)
  ))
  if ((nextPreparationKey || nextModifierKey || nextVariantKey) && equivalentStructuredCandidate) {
    return equivalentStructuredCandidate.index
  }

  const unpreparedCandidate = candidates.find(({ item }) => !preparationKey(item) && !modifierKey(item) && !cleanText(item.variantKey || ""))
  if ((nextPreparationKey || nextModifierKey || nextVariantKey) && unpreparedCandidate) return unpreparedCandidate.index

  if (nextPreparationKey || nextModifierKey || nextVariantKey) return -1
  if (candidates.length === 1) return candidates[0].index

  return candidates.at(-1).index
}

function upsertItem(state, nextItem, { preferLast = true } = {}) {
  const key = cleanText(nextItem.baseName || nextItem.key || nextItem.label)
  if (!key) return false

  const index = findBestItemIndex(state, nextItem)
  if (index === -1) {
    const inserted = cloneItem({ ...nextItem, key })
    state.items.push(inserted)
    if (nextItem.category === "food") {
      state.lastMainKey = key
      state.lastMainReference = itemReferenceKey(inserted)
      rememberGroupedBase(state, key)
    }
    if (nextItem.category === "drink") state.lastDrinkKey = key
    return true
  }

  const current = state.items[index]
  const merged = {
    ...current,
    label: nextItem.label || current.label,
    baseName: nextItem.baseName || current.baseName,
    quantity: nextItem.quantity || current.quantity,
    preparation: [...new Set([...(current.preparation || []), ...(nextItem.preparation || [])])],
    modifiers: uniqueNormalizedValues([...(current.modifiers || []), ...(nextItem.modifiers || [])]),
    exclusions: [...new Set([...(current.exclusions || []), ...(nextItem.exclusions || [])])],
    relation: nextItem.relation || current.relation,
    attachedTo: nextItem.attachedTo ?? current.attachedTo,
    sourceMessage: nextItem.sourceMessage || current.sourceMessage,
    variantKey: normalizeVariantKey(nextItem.variantKey || current.variantKey || ""),
  }

  if (preferLast && nextItem.quantity) merged.quantity = nextItem.quantity
  state.items[index] = merged
  if (merged.category === "food") {
    state.lastMainKey = key
    state.lastMainReference = itemReferenceKey(merged)
    rememberGroupedBase(state, key)
  }
  if (merged.category === "drink") state.lastDrinkKey = key
  return true
}

function splitClauses(message) {
  const baseSegments = normalizeLabel(message)
    .replace(/\b(?:also had|also ate|also drank)\b/g, ",")
    .replace(/\bplus\b/g, ",")
    .split(/,(?![^()]*\))/)

  return baseSegments
    .flatMap((segment) => {
      const relation = firstRelationMatch(segment)
      if (!relation) return segment.split(/\band\b/)
      const beforeRelation = segment.slice(0, relation.index)
      const afterRelation = segment.slice(relation.index)
      const headSegments = beforeRelation.split(/\band\b/).map((entry) => entry.trim()).filter(Boolean)
      if (!headSegments.length) return [segment]
      const lastHead = headSegments.pop()
      return [...headSegments, `${lastHead} ${afterRelation}`.trim()]
    })
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function parseQuantityOnly(text) {
  const normalized = cleanText(text).replace(/\b(?:no\b|just\b|actually\b|it was\b)\s*/g, "").trim()
  const match = normalized.match(new RegExp(`^(?<amount>\\d+(?:\\.\\d+)?|${[...QUANTITY_WORDS.keys()].join("|")})\\s*(?:(?<intensity>whole|entire)\\s+)?(?<unit>${QUANTITY_UNITS.join("|")})$`, "i"))
  if (!match?.groups) return null
  if (normalizeUnit(match.groups.unit) === "egg") return null
  return buildQuantity(match.groups.amount, match.groups.unit, match.groups.intensity)
}

function parseDrinkDetailOnly(state, text) {
  const normalized = cleanText(stripCorrectionLead(text) || text)
  if (looksFoodishPhrase(normalized) && !/\b(tea|coffee|milk|sugar|earl grey|flat white|long black|cappuccino|latte|espresso)\b/.test(normalized)) return false
  const drinkIndex = state.items.findIndex((item) => item.category === "drink" && !item.quantity)
  const fallbackIndex = drinkIndex === -1 ? state.items.findIndex((item) => item.category === "drink") : drinkIndex
  if (fallbackIndex === -1) return false

  let changed = false
  const updates = cloneItem(state.items[fallbackIndex])

  if (/\bearl grey\b/.test(normalized)) {
    updates.baseName = "earl grey tea"
    updates.label = "Earl Grey tea"
    changed = true
  }
  if (/\bflat white\b/.test(normalized)) {
    updates.baseName = "flat white"
    updates.label = "Flat white"
    changed = true
  }
  if (/\blong black\b/.test(normalized)) {
    updates.baseName = "long black"
    updates.label = "Long black"
    changed = true
  }
  if (/\bcappuccino\b/.test(normalized)) {
    updates.baseName = "cappuccino"
    updates.label = "Cappuccino"
    changed = true
  }
  if (/\blatte\b/.test(normalized)) {
    updates.baseName = "latte"
    updates.label = "Latte"
    changed = true
  }
  if (/\bespresso\b/.test(normalized)) {
    updates.baseName = "espresso"
    updates.label = "Espresso"
    changed = true
  }

  const quantityOnly = parseQuantityOnly(normalized)
  const quantityPrefix = !quantityOnly
    ? normalized.match(new RegExp(`^(?<amount>\\d+(?:\\.\\d+)?|${[...QUANTITY_WORDS.keys()].join("|")})\\s*(?:(?<intensity>whole|entire)\\s+)?(?<unit>${QUANTITY_UNITS.join("|")})\\b`, "i"))
    : null
  if (quantityOnly || quantityPrefix?.groups) {
    updates.quantity = quantityOnly || buildQuantity(quantityPrefix.groups.amount, quantityPrefix.groups.unit, quantityPrefix.groups.intensity)
    changed = true
  }

  if (/\bno sugar\b/.test(normalized) || /\bwithout sugar\b/.test(normalized)) {
    updates.exclusions = appendUnique(updates.exclusions || [], "no sugar")
    changed = true
  }
  if (/\bno milk\b/.test(normalized) || /\bwithout milk\b/.test(normalized)) {
    updates.exclusions = appendUnique(updates.exclusions || [], "no milk")
    changed = true
  }

  if (changed) {
    state.items[fallbackIndex] = updates
    state.lastDrinkKey = cleanText(updates.baseName || updates.key || updates.label)
    return true
  }
  return false
}

function extractItemQualifiers(details, baseName = "", preparations = []) {
  const leftovers = deriveRemainingWords(details, baseName, preparations)
  return uniqueNormalizedValues(leftovers.map((entry) => titleCase(entry)).filter(Boolean))
}

function buildVariantSignature({ preparations = [], modifiers = [], relationTail = "" } = {}) {
  const pieces = uniqueNormalizedValues([
    ...preparations,
    ...modifiers,
    relationTail,
  ].filter(Boolean))
  return normalizeVariantKey(pieces.join(" "))
}

function buildIngredientItem(source, relation, sourceMessage = "") {
  const sourceBaseName = deriveBaseName(source)
  if (relation === "cooked_in" && sourceBaseName === "water") return null

  const match = source.match(QUANTITY_PATTERN)
  if (match?.groups) {
    const foodLabel = match.groups.food || (normalizeUnit(match.groups.unit) === "egg" ? "eggs" : "")
    const baseName = deriveBaseName(foodLabel || match.groups.unit)
    if (relation === "cooked_in" && baseName === "water") return null
    return createItem({
      label: defaultDisplayLabel(baseName, foodLabel || match.groups.unit),
      baseName,
      quantity: buildQuantity(match.groups.amount, match.groups.unit, match.groups.intensity),
      category: "ingredient",
      preparation: source.includes("unsalted") ? ["unsalted"] : source.includes("salted") ? ["salted"] : [],
      relation,
      sourceMessage,
      variantKey: source,
    })
  }

  if (!source) return null
  if (relation === "cooked_in" && sourceBaseName === "water") return null
  return createItem({
    label: defaultDisplayLabel(sourceBaseName, source),
    baseName: sourceBaseName,
    category: "ingredient",
    relation,
    sourceMessage,
    variantKey: source,
  })
}

function parseIngredientList(text, relation = "with", sourceMessage = "") {
  const normalized = stripCorrectionLead(text).replace(/^also\s+/, "").replace(/^just\s+/, "").trim()
  if (!normalized) return []

  return normalized
    .split(/\band\b/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => buildIngredientItem(entry, relation, sourceMessage))
    .filter(Boolean)
}

function parseIngredientPhrase(text) {
  const normalized = stripCorrectionLead(text).replace(/^also\s+/, "")
  const relation = /\bcooked in\b|\bfried in\b|\bused to fry\b/.test(normalized)
    ? "cooked_in"
    : /\bmixed with\b/.test(normalized)
      ? "mixed_with"
      : /\b(?:covered|topped) with\b/.test(normalized)
        ? "topped_with"
        : /\bon\b/.test(normalized)
          ? "on"
          : /\bwith\b|\bplus\b/.test(normalized)
            ? "with"
            : ""

  const source = normalized
    .replace(/^(?:cooked|cook|fried|used)\s+(?:in|to fry)\s+/, "")
    .replace(/^(?:mixed|covered|topped)\s+with\s+/, "")
    .replace(/^(?:with|on)\s+/, "")
    .replace(/^just\s+/, "")
    .trim()
  return buildIngredientItem(source, relation, text)
}

function findInheritedTarget(state, preparations = []) {
  const normalizedPreparations = preparations.map((entry) => cleanText(entry)).filter(Boolean)
  const primaryItems = state.items.filter((item) => !item.attachedTo && item.category !== "ingredient")
  const groupedBase = cleanText(state.lastGroupedBaseName || "")
  if (!primaryItems.length && groupedBase) {
    const declared = state.declaredTotals.find((entry) => cleanText(entry.baseName || "") === groupedBase)
    return {
      baseName: groupedBase,
      label: defaultDisplayLabel(groupedBase, groupedBase),
      category: detectCategory(groupedBase),
      quantity: declared?.unit ? { amount: Number(declared.amount) || 0, unit: normalizeUnit(declared.unit), text: "" } : null,
      preparation: normalizedPreparations,
      modifiers: [],
      variantKey: buildVariantSignature({ preparations: normalizedPreparations }),
    }
  }
  if (!primaryItems.length) return null
  if (groupedBase) {
    const groupedPrimaryItems = primaryItems.filter((item) => cleanText(item.baseName || item.key || "") === groupedBase)
    if (groupedPrimaryItems.length) {
      const exactGrouped = normalizedPreparations.length
        ? [...groupedPrimaryItems].reverse().find((item) => {
            const itemPreparations = safeArray(item.preparation, 8).map((entry) => cleanText(entry))
            return normalizedPreparations.every((entry) => itemPreparations.includes(entry))
          })
        : null
      if (exactGrouped) return exactGrouped
      if (!normalizedPreparations.length) return groupedPrimaryItems.at(-1)
    }
  }
  if (normalizedPreparations.length) {
    const exact = [...primaryItems].reverse().find((item) => {
      const itemPreparations = safeArray(item.preparation, 8).map((entry) => cleanText(entry))
      return normalizedPreparations.every((entry) => itemPreparations.includes(entry))
    })
    if (exact) return exact
  }
  const lastPrimary = [...primaryItems].reverse().find((item) => cleanText(item.baseName || item.key || "") === cleanText(state.lastMainKey || ""))
  return lastPrimary || primaryItems.at(-1)
}

function buildInheritedQuantity(amount, unit, target) {
  const inheritedUnit = unit
    || target?.quantity?.unit
    || (/\begg\b/.test(target?.baseName || "") ? "egg" : "serve")
  return buildQuantity(amount, inheritedUnit)
}

function hasGroupedContextForTarget(state, target) {
  const baseName = cleanText(target?.baseName || target?.key || "")
  if (!baseName) return false
  if (state.declaredTotals.some((entry) => cleanText(entry.baseName || "") === baseName)) return true
  return state.items.some((item) => (
    !item.attachedTo
    && cleanText(item.baseName || item.key || "") === baseName
    && item.quantity
    && !preparationKey(item)
    && !modifierKey(item)
  ))
}

function canInheritGeneralizedDetails(details, target, state) {
  const lead = splitRelationTail(details).lead.trim()
  if (!lead) return true
  const preparations = extractPreparations(lead)
  if (preparations.length && !deriveRemainingWords(lead, "", preparations).length) return true
  const leadTokens = stripExclusionPhrases(lead).split(" ").filter(Boolean)
  const sameBase = cleanText(deriveBaseName(lead)) === cleanText(target?.baseName || target?.key || "")
  if (sameBase) return true
  if (!hasGroupedContextForTarget(state, target)) return false
  const targetCountUnit = singularize(cleanText(target?.baseName || "").split(" ").at(-1) || "")
  const quantityUnit = normalizeUnit(target?.quantity?.unit || "")
  if (quantityUnit !== targetCountUnit) return false
  return leadTokens.length <= 2 && !/\d/.test(lead)
}

function computeGroupedRemainder(state, target) {
  if (!target) return null
  const baseName = cleanText(target.baseName || target.key || "")
  const declared = state.declaredTotals.find((entry) => cleanText(entry.baseName || "") === baseName)
  if (!declared?.amount) return null
  const relatedItems = state.items.filter((item) => !item.attachedTo && cleanText(item.baseName || item.key || "") === baseName)
  const comparable = relatedItems
    .map((item) => quantityForComparison(item.quantity, declared.unit))
    .filter(Boolean)
  if (!comparable.length || comparable.some((entry) => entry.unit !== (declared.unit || comparable[0].unit))) return null
  const actualAmount = comparable.reduce((total, entry) => total + entry.amount, 0)
  const remaining = declared.amount - actualAmount
  if (!(remaining > 0)) return null
  return buildQuantity(remaining, declared.unit || target.quantity?.unit || "serve")
}

function promoteGenericItemToDeclaredTotal(state, inheritedItem) {
  const baseName = cleanText(inheritedItem?.baseName || inheritedItem?.key || "")
  if (!baseName || !inheritedItem || inheritedItem.attachedTo) return
  const hasDistinctVariant = Boolean(
    preparationKey(inheritedItem)
    || modifierKey(inheritedItem)
    || cleanText(inheritedItem.variantKey || "")
  )
  if (!hasDistinctVariant) return
  const genericIndex = state.items.findIndex((item) => (
    !item.attachedTo
    && cleanText(item.baseName || item.key || "") === baseName
    && item.quantity
    && !preparationKey(item)
    && !modifierKey(item)
    && (!cleanText(item.variantKey || "") || cleanText(item.variantKey || "") === baseName)
  ))
  if (genericIndex === -1) return
  const genericItem = state.items[genericIndex]
  if (!recordDeclaredTotal(state, {
    amount: Number(genericItem.quantity.amount) || 0,
    unit: genericItem.quantity.unit || "",
    baseName,
  })) return
  state.items.splice(genericIndex, 1)
}

function queuePendingAttachment(state, ingredient, target = null, targetPreparations = []) {
  if (!ingredient) return false
  state.pendingAttachments.push({
    ingredient: cloneItem(ingredient),
    targetBaseName: cleanText(target?.baseName || target?.key || state.lastGroupedBaseName || state.lastMainKey || ""),
    targetPreparations: targetPreparations.map((entry) => cleanText(entry)).filter(Boolean),
  })
  return true
}

function flushPendingAttachmentsForItem(state, item) {
  if (!item || item.attachedTo || item.category === "ingredient" || !state.pendingAttachments.length) return false
  const itemBase = cleanText(item.baseName || item.key || "")
  const itemPreparations = safeArray(item.preparation, 8).map((entry) => cleanText(entry))
  const targetReference = itemReferenceKey(item)
  const remaining = []
  let changed = false

  for (const pending of state.pendingAttachments) {
    const sameBase = !pending.targetBaseName || pending.targetBaseName === itemBase
    const samePreparation = !pending.targetPreparations.length || pending.targetPreparations.every((entry) => itemPreparations.includes(entry))
    if (sameBase && samePreparation) {
      changed = upsertItem(state, {
        ...pending.ingredient,
        attachedTo: targetReference,
        relation: pending.ingredient.relation || "with",
      }, { preferLast: true }) || changed
      continue
    }
    remaining.push(pending)
  }

  state.pendingAttachments = remaining
  return changed
}

function ensureReferenceItem(state, clause) {
  const normalized = stripCorrectionLead(clause)
  const phrase = normalized.replace(/^the\s+/, "").replace(/^(?:used to fry|used for|for)\s+the\s+/, "").trim()
  const baseName = deriveBaseName(phrase)
  if (!baseName) return null
  const preparations = extractPreparations(phrase)
  const existing = findCookingAttachmentTarget(state, phrase)
  if (existing) return existing

  const pendingPreparation = state.pendingAttachments.find((entry) => !entry.targetBaseName || entry.targetBaseName === baseName)?.targetPreparations || []
  const item = createItem({
    label: defaultDisplayLabel(baseName, phrase || baseName),
    baseName,
    category: detectCategory(baseName),
    preparation: preparations.length ? preparations : pendingPreparation,
    sourceMessage: clause,
    variantKey: buildVariantSignature({ preparations: preparations.length ? preparations : pendingPreparation }),
  })
  upsertItem(state, item, { preferLast: false })
  return state.items.find((entry) => !entry.attachedTo && cleanText(entry.baseName || entry.key || "") === baseName) || item
}

function parseInheritedFoodClause(state, clause) {
  const normalized = stripCorrectionLead(clause)
  const restMatch = normalized.match(REST_PATTERN)
  const referencePreparations = extractPreparations(normalized)
  const quantityReferenceMatch = normalized.match(new RegExp(
    `^(?<amount>\\d+(?:\\.\\d+)?|${[...QUANTITY_WORDS.keys()].join("|")})\\s+(?:(?<reference>that|those|them|ones?)\\s+)?(?:were|was)?\\s*(?<details>.*)$`,
    "i"
  ))
  const hasInheritedReference = Boolean(quantityReferenceMatch?.groups?.reference && /\b(that|those|them|ones?)\b/i.test(quantityReferenceMatch.groups.reference))
  const preparationReferenceMatch = !hasInheritedReference
    ? normalized.match(/^(?<details>(?:hard|soft)\s+boiled|fried|boiled|poached|scrambled|grilled|baked|toasted|roasted|steamed)(?:\s+eggs?)?\s+(?:were|was)\b/i)
    : null
  const groupedPreparationMatch = !hasInheritedReference && !preparationReferenceMatch
    ? normalized.match(INHERITED_GROUP_PATTERN)
    : null

  const generalizedQuantityMatch = !hasInheritedReference && !preparationReferenceMatch && !groupedPreparationMatch
    ? normalized.match(new RegExp(
      `^(?<amount>\\d+(?:\\.\\d+)?|${[...QUANTITY_WORDS.keys()].join("|")})\\s*(?<unit>${QUANTITY_UNITS.join("|")})?\\s+(?<details>.+)$`,
      "i"
    ))
    : null

  if (!hasInheritedReference && !preparationReferenceMatch && !groupedPreparationMatch && !restMatch && !generalizedQuantityMatch) return null

  const target = findInheritedTarget(
    state,
    groupedPreparationMatch
      ? extractPreparations(groupedPreparationMatch.groups.details || normalized)
      : restMatch
        ? extractPreparations(restMatch.groups.details || normalized)
        : generalizedQuantityMatch
          ? extractPreparations(generalizedQuantityMatch.groups.details || normalized)
          : referencePreparations
  )
  if (!target) return null
  if (generalizedQuantityMatch) {
    const explicitBase = cleanText(deriveBaseName(generalizedQuantityMatch.groups.details || ""))
    const targetBase = cleanText(target.baseName || target.key || "")
    const explicitPreparations = extractPreparations(generalizedQuantityMatch.groups.details || "")
    const relationHint = firstRelationMatch(generalizedQuantityMatch.groups.details || "")
    if (explicitBase && explicitBase === targetBase && !explicitPreparations.length && !relationHint) {
      return null
    }
  }
  if (generalizedQuantityMatch && !canInheritGeneralizedDetails(generalizedQuantityMatch.groups.details || "", target, state)) {
    return null
  }

  const relationSource = splitRelationTail(
    groupedPreparationMatch?.groups?.details
    || generalizedQuantityMatch?.groups?.details
    || restMatch?.groups?.details
    || normalized
  )
  const detailSource = relationSource.lead || groupedPreparationMatch?.groups?.details || generalizedQuantityMatch?.groups?.details || restMatch?.groups?.details || normalized
  const inheritedUnit = groupedPreparationMatch?.groups?.unit
    || generalizedQuantityMatch?.groups?.unit
    || target.quantity?.unit
    || (/\begg\b/.test(target.baseName) ? "egg" : "serve")
  const quantity = restMatch
    ? computeGroupedRemainder(state, target)
    : hasInheritedReference
      ? buildInheritedQuantity(quantityReferenceMatch.groups.amount, inheritedUnit, target)
      : groupedPreparationMatch
        ? buildInheritedQuantity(groupedPreparationMatch.groups.amount, inheritedUnit, target)
        : generalizedQuantityMatch
          ? buildInheritedQuantity(generalizedQuantityMatch.groups.amount, inheritedUnit, target)
          : target.quantity || null

  const preparations = groupedPreparationMatch
    ? extractPreparations(groupedPreparationMatch.groups.details || normalized)
    : restMatch
      ? extractPreparations(restMatch.groups.details || normalized)
      : generalizedQuantityMatch
        ? extractPreparations(generalizedQuantityMatch.groups.details || normalized)
        : referencePreparations
  const exclusions = uniqueNormalizedValues([
    ...extractExclusions(detailSource),
    ...relationSource.attachments.flatMap((entry) => extractExclusions(entry.ingredientText)),
  ])
  const qualifierSource = relationSource.attachments.length ? relationSource.lead : detailSource
  const modifiers = extractItemQualifiers(qualifierSource, target.baseName, preparations)
  const relationVariant = (!preparations.length && !modifiers.length && relationSource.attachments.length)
    ? relationSource.attachments.map((entry) => deriveBaseName(entry.ingredientText)).filter(Boolean).join(" ")
    : ""
  const variantKey = buildVariantSignature({ preparations, modifiers, relationTail: relationVariant })

  const item = createItem({
    label: defaultDisplayLabel(target.baseName, target.label),
    baseName: target.baseName,
    quantity,
    category: target.category,
    preparation: preparations.length
      ? preparations
      : referencePreparations.length
        ? referencePreparations
        : [],
    modifiers,
    exclusions,
    sourceMessage: clause,
    variantKey,
  })

  const attachedIngredients = relationSource.attachments
    .flatMap((entry) => {
      const stripped = stripExclusionPhrases(entry.ingredientText)
      return stripped ? parseIngredientList(stripped, entry.relation, clause) : []
    })
    .map((ingredient) => ({
      ...ingredient,
      attachedTo: itemReferenceKey(item),
      relation: ingredient.relation || "with",
    }))

  return { item, attachedIngredients }
}

function findCookingAttachmentTarget(state, subjectText = "") {
  const subject = stripCorrectionLead(subjectText)
    .replace(/^the\s+/, "")
    .replace(/\beggs?\b$/i, "eggs")
    .trim()
  const preparations = extractPreparations(subject)
  const subjectBaseName = deriveBaseName(subject, state.lastGroupedBaseName || state.lastMainKey || "")
  const primaryItems = state.items.filter((item) => !item.attachedTo && item.category !== "ingredient")
  if (!primaryItems.length) return null

  const matchingBase = [...primaryItems].reverse().filter((item) => cleanText(item.baseName || item.key || "") === cleanText(subjectBaseName))
  if (!matchingBase.length) return findCookingMediumTarget(state)
  if (!preparations.length) return matchingBase[0]

  return matchingBase.find((item) => {
    const itemPreparations = safeArray(item.preparation, 8).map((entry) => cleanText(entry))
    return preparations.every((entry) => itemPreparations.includes(entry))
  }) || matchingBase[0]
}

function parseCookingAttachmentClause(state, clause) {
  const normalized = cleanText(clause)
  const relationMatch = firstRelationMatch(normalized)
  if (!relationMatch || relationMatch.relation !== "cooked_in") return null
  const subjectMatch = normalized.match(/^(?<subject>.+?)\s+(?:were|was)?\s*(?:cooking|cooked|fried|grilled|roasted|baked|sauteed|sautéed|boiled|poached|scrambled|steamed)\s+in\s+(?<ingredient>.+)$/i)
  if (!subjectMatch?.groups) return null
  const normalizedSubject = stripCorrectionLead(subjectMatch.groups.subject)
  if (normalizedSubject.match(new RegExp(`^(?:\\d+(?:\\.\\d+)?|${[...QUANTITY_WORDS.keys()].join("|")})\\s*(?:${QUANTITY_UNITS.join("|")})?\\b`, "i"))) {
    return null
  }
  const ingredients = parseIngredientList(subjectMatch.groups.ingredient, "cooked_in", clause)
  if (!ingredients.length) return { ignored: true }
  const target = findCookingAttachmentTarget(state, subjectMatch.groups.subject)
  if (!target) {
    for (const ingredient of ingredients) {
      queuePendingAttachment(state, ingredient, null, extractPreparations(subjectMatch.groups.subject))
    }
    return { queued: true }
  }
  const attachedTo = itemReferenceKey(target)
  return {
    ingredients: ingredients.map((ingredient) => ({
      ...ingredient,
      attachedTo,
      relation: ingredient.relation || "cooked_in",
    })),
  }
}

function parseGroupedPreparationAttachmentClause(state, clause) {
  const normalized = cleanText(clause)
  const relationTail = splitRelationTail(normalized)
  const attachmentMatch = relationTail.attachments.length
    ? { groups: { lead: relationTail.lead, ingredient: relationTail.attachments[0].ingredientText, connector: relationTail.attachments[0].relation } }
    : null
  if (!attachmentMatch?.groups) return null
  const leadMatch = stripCorrectionLead(attachmentMatch.groups.lead).match(INHERITED_GROUP_PATTERN)
  const shorthandPreparations = extractPreparations(attachmentMatch.groups.lead || "")
  if (!leadMatch?.groups && !shorthandPreparations.length) return null

  const preparations = leadMatch?.groups
    ? extractPreparations(leadMatch.groups.details || "")
    : shorthandPreparations
  const target = findInheritedTarget(state, preparations)
  const baseName = cleanText(target?.baseName || state.lastGroupedBaseName || state.lastMainKey || "")
  if (!baseName) return null

  const ingredients = parseIngredientList(
    attachmentMatch.groups.ingredient,
    attachmentMatch.groups.connector === "cooked_in" ? "cooked_in" : "with",
    clause,
  )

  if (!leadMatch?.groups) {
    return { target, attachOnly: true, ingredients }
  }

  const inheritedUnit = leadMatch.groups.unit
    || target?.quantity?.unit
    || (/\begg\b/.test(baseName) ? "egg" : "serve")

  const item = createItem({
    label: defaultDisplayLabel(baseName, target?.label || baseName),
    baseName,
    quantity: buildQuantity(leadMatch.groups.amount, inheritedUnit),
    category: target?.category || detectCategory(baseName),
    preparation: preparations,
    sourceMessage: clause,
    variantKey: buildVariantSignature({ preparations }),
  })
  return { item, ingredients }
}

function parseMeasuredFoodClause(clause, state = null) {
  const normalized = stripCorrectionLead(clause)
  const relationTail = splitRelationTail(normalized)
  const mainText = relationTail.lead.trim()

  const quantityMatch = mainText.match(QUANTITY_PATTERN)
  const countedFoodMatch = quantityMatch ? null : mainText.match(new RegExp(`^(?<amount>\\d+(?:\\.\\d+)?|${[...QUANTITY_WORDS.keys()].join("|")})\\s+(?<food>[a-z][a-z\\s%-]+)$`, "i"))
  let item = null
  const preparations = extractPreparations(mainText)
  const exclusions = uniqueNormalizedValues([
    ...extractExclusions(mainText),
    ...relationTail.attachments.flatMap((entry) => extractExclusions(entry.ingredientText)),
  ])
  if (countedFoodMatch?.groups && deriveBaseName(countedFoodMatch.groups.food || "")) {
    const cleanedFood = stripExclusionPhrases(countedFoodMatch.groups.food.trim().replace(/\bnot\b.*$/i, "").trim())
    const baseName = deriveBaseName(cleanedFood)
    const modifiers = extractItemQualifiers(cleanedFood, baseName, preparations)
    const quantity = {
      amount: toAmount(countedFoodMatch.groups.amount) || 1,
      unit: singularize(baseName.split(" ").at(-1) || "serve"),
      text: `${toAmount(countedFoodMatch.groups.amount) || 1} ${defaultDisplayLabel(baseName, cleanedFood || countedFoodMatch.groups.food).toLowerCase()}`.trim(),
      modifier: "",
    }
    item = createItem({
      label: defaultDisplayLabel(baseName, cleanedFood || countedFoodMatch.groups.food.trim()),
      baseName,
      quantity,
      preparation: preparations,
      modifiers,
      exclusions,
      sourceMessage: clause,
      variantKey: buildVariantSignature({ preparations, modifiers }),
    })
  } else if (quantityMatch?.groups) {
    const unit = normalizeUnit(quantityMatch.groups.unit)
    const quantity = buildQuantity(quantityMatch.groups.amount, quantityMatch.groups.unit, quantityMatch.groups.intensity)
    const rest = (quantityMatch.groups.food?.trim() || "")
      .replace(/^not\s+\d+(?:\.\d+)?\b.*$/i, "")
      .replace(/\bnot\b\s+\d+(?:\.\d+)?(?:\s*(?:kg|g|ml|l|cup|cups|tbsp|tsp|slice|slices|tin|tins|can|cans|block|blocks|bunch|bunches|serve|serves|serving|servings|bowl|bowls|plate|plates|egg|eggs))?\b.*$/i, "")
      .trim()
    const label = rest || (unit === "egg" ? "eggs" : unit)
    const inheritedBaseName = cleanText(state?.lastGroupedBaseName || state?.lastMainKey || "")
    const inferredPreparations = extractPreparations(rest)
    const remainingWords = deriveRemainingWords(rest, "", inferredPreparations)
    const preparationOnly = Boolean(inferredPreparations.length) && !remainingWords.length
    const baseName = inheritedBaseName && (preparationOnly || !rest)
      ? inheritedBaseName
      : deriveBaseName(stripExclusionPhrases(label || mainText))
    const preparation = [...new Set([
      ...preparations,
    ])]
    if (/\bwholemeal\b/.test(normalized)) preparation.push("wholemeal")
    if (/\brye\b/.test(normalized)) preparation.push("rye")
    const modifiers = extractItemQualifiers(rest || label || mainText, baseName, preparation)
    item = createItem({
      label: defaultDisplayLabel(baseName, (inheritedBaseName && (preparationOnly || !rest)) ? baseName : (label || mainText)),
      baseName,
      quantity,
      preparation,
      modifiers,
      exclusions,
      sourceMessage: clause,
      variantKey: buildVariantSignature({ preparations: preparation, modifiers }),
    })
  } else {
    const contentWords = mainText
      .split(" ")
      .filter((word) => word && !STOPWORDS.has(word))
    if (!contentWords.length) return { item: null, attachedIngredients: [] }
    const label = contentWords.join(" ")
    const baseName = deriveBaseName(label)
    const modifiers = extractItemQualifiers(label, baseName, preparations)
    item = createItem({
      label: defaultDisplayLabel(baseName, label),
      baseName,
      preparation: preparations,
      modifiers,
      exclusions,
      sourceMessage: clause,
      variantKey: buildVariantSignature({ preparations, modifiers }),
    })
  }

  const attachedIngredients = relationTail.attachments.flatMap((entry) => {
    const stripped = stripExclusionPhrases(entry.ingredientText)
    return stripped ? parseIngredientList(stripped, entry.relation, clause) : []
  })

  return { item, attachedIngredients }
}

function assignQuantityToPendingItem(state, quantity) {
  if (!quantity) return false
  const candidates = [
    state.items.find((item) => item.category === "drink" && !item.quantity),
    state.items.find((item) => !item.quantity && item.category !== "ingredient"),
    state.items.find((item) => cleanText(item.baseName || "") === cleanText(state.lastMainKey || "")),
  ].filter(Boolean)

  const target = candidates[0]
  if (!target) {
    state.pendingQuantities.push(quantity)
    return true
  }

  return upsertItem(state, { ...target, quantity })
}

function applyPendingQuantity(state, item) {
  if (!state.pendingQuantities.length || item.quantity) return item
  return {
    ...item,
    quantity: state.pendingQuantities.shift(),
  }
}

function attachLooseIngredientsToTarget(state, targetBaseName) {
  if (!targetBaseName) return false
  const target = [...state.items]
    .reverse()
    .find((item) => !item.attachedTo && item.category !== "ingredient" && cleanText(item.baseName || item.key || "") === cleanText(targetBaseName))
  const targetReference = target ? itemReferenceKey(target) : cleanText(targetBaseName)
  let changed = false
  state.items = state.items.map((item) => {
    if (item.category !== "ingredient" || item.attachedTo) return item
    changed = true
    return {
      ...item,
      attachedTo: targetReference,
      relation: item.relation || "cooked_in",
    }
  })
  return changed
}

function removeItemsMatchingBaseName(state, baseName) {
  const target = cleanText(baseName)
  if (!target) return false

  let changed = false
  state.items = state.items.filter((item) => {
    const itemBase = cleanText(item.baseName || item.key || item.label)
    const itemAttached = cleanText(item.attachedTo || "")
    const matchesBase = itemBase === target || itemBase.includes(target) || target.includes(itemBase)
    const matchesAttachment = itemAttached === target || itemAttached.startsWith(`${target}::`)
    if (matchesBase || matchesAttachment) {
      changed = true
      return false
    }
    return true
  })

  if (changed) {
    const lastPrimary = [...state.items].reverse().find((item) => item.category === "food" && !item.attachedTo)
    state.lastMainKey = cleanText(lastPrimary?.baseName || "")
    state.lastMainReference = lastPrimary ? itemReferenceKey(lastPrimary) : ""
  }

  return changed
}

function clearDeclaredTotalsForBase(state, baseName) {
  const normalized = cleanText(baseName)
  if (!normalized) return false
  const before = state.declaredTotals.length
  state.declaredTotals = state.declaredTotals.filter((entry) => cleanText(entry.baseName || "") !== normalized)
  return state.declaredTotals.length !== before
}

function resetConflictingDeclaredTotalsForItem(state, item, clause = "") {
  if (!item || item.attachedTo) return false
  const baseName = cleanText(item.baseName || item.key || "")
  if (!baseName) return false
  if (!CORRECTION_PREFIX.test(cleanText(clause))) return false
  return clearDeclaredTotalsForBase(state, baseName)
}

function findCookingMediumTarget(state) {
  const primaryFoods = state.items.filter((item) => !item.attachedTo && item.category === "food")
  if (!primaryFoods.length) return null
  const reversed = [...primaryFoods].reverse()
  const pendingFried = reversed.find((item) => item.preparation?.includes("fried") && !state.items.some((entry) => ingredientMatchesItem(entry, item) && entry.relation === "cooked_in"))
  return pendingFried || reversed[0]
}

function findLooseAttachmentTarget(state, relation = "", ingredientText = "") {
  const primaryItems = state.items.filter((item) => !item.attachedTo && item.category !== "ingredient")
  if (!primaryItems.length) return null
  const normalizedIngredient = cleanText(ingredientText)
  if (relation === "with" && /\b(milk|sugar|cream)\b/.test(normalizedIngredient)) {
    const drinkTarget = [...primaryItems].reverse().find((item) => item.category === "drink")
    if (drinkTarget) return drinkTarget
  }
  return primaryItems.at(-1)
}

function mergeClauseIntoState(state, clause) {
  const normalized = cleanText(clause)
  const normalizedWithoutAlso = normalized.replace(/^also\s+/, "")
  if (!normalized) return false

  let changed = false

  if (detectSuppressedLogging(normalized)) {
    state.suppressed = true
    state.suppressionReply = "Okay, I won't save that."
    return true
  }

  if (detectQuestionOnlyTurn(clause) && state.items.length) {
    state.answerOnly = true
    return false
  }

  const relationOnlySource = splitRelationTail(normalizedWithoutAlso)
  if (!relationOnlySource.lead && relationOnlySource.attachments.length && relationOnlySource.attachments[0].relation !== "cooked_in") {
    const attachment = relationOnlySource.attachments[0]
    const ingredients = stripExclusionPhrases(attachment.ingredientText)
      ? parseIngredientList(stripExclusionPhrases(attachment.ingredientText), attachment.relation, clause)
      : []
    const target = findLooseAttachmentTarget(state, attachment.relation, attachment.ingredientText)
    if (!target) {
      for (const ingredient of ingredients) queuePendingAttachment(state, ingredient)
      return ingredients.length > 0
    }
    const targetReference = itemReferenceKey(target)
    for (const ingredient of ingredients) {
      changed = upsertItem(
        state,
        {
          ...ingredient,
          attachedTo: targetReference,
          relation: ingredient.relation || attachment.relation || "with",
        },
        { preferLast: true }
      ) || changed
    }
    return changed
  }

  if (/^(?:no sugar|without sugar|no milk|without milk)(?:\s+(?:no milk|without milk|no sugar|without sugar))*$/.test(normalized)) {
    const drink = state.items.find((item) => item.category === "drink") || state.items.find((item) => !item.attachedTo)
    if (drink) {
      const nextDrink = cloneItem(drink)
      if (/\bno sugar\b|\bwithout sugar\b/.test(normalized)) nextDrink.exclusions = appendUnique(nextDrink.exclusions || [], "no sugar")
      if (/\bno milk\b|\bwithout milk\b/.test(normalized)) nextDrink.exclusions = appendUnique(nextDrink.exclusions || [], "no milk")
      changed = upsertItem(state, nextDrink) || changed
    }
    return changed
  }

  const removalMatch = normalized.match(REMOVAL_PATTERN)
  if (removalMatch?.groups && !/^(?:no sugar|without sugar|no milk|without milk)(?:\s+(?:no milk|without milk|no sugar|without sugar))*$/.test(normalized)) {
    const removedBase = deriveBaseName(removalMatch.groups.item || removalMatch.groups.item2 || "")
    if (removedBase) return removeItemsMatchingBaseName(state, removedBase)
  }

  const declaredTotal = parseDeclaredTotalClause(clause)
  if (declaredTotal) {
    if (!declaredTotal.baseName) {
      declaredTotal.baseName = cleanText(state.lastGroupedBaseName || state.lastMainKey || "")
    }
    return recordDeclaredTotal(state, declaredTotal)
  }

  const explicitCookingAttachment = parseCookingAttachmentClause(state, clause)
  if (explicitCookingAttachment) {
    if (explicitCookingAttachment.ignored) return true
    if (explicitCookingAttachment.queued) return true
    for (const ingredient of explicitCookingAttachment.ingredients || []) {
      changed = upsertItem(state, ingredient, { preferLast: true }) || changed
    }
    return changed
  }

  const groupedAttachment = parseGroupedPreparationAttachmentClause(state, clause)
  if (groupedAttachment?.attachOnly && groupedAttachment.target) {
    const targetReference = itemReferenceKey(groupedAttachment.target)
    for (const ingredient of groupedAttachment.ingredients || []) {
      const attachedRelation = ingredient.relation === "with" && groupedAttachment.target.preparation?.length
        ? "cooked_in"
        : ingredient.relation || "with"
      changed = upsertItem(
        state,
        {
          ...ingredient,
          attachedTo: targetReference,
          relation: attachedRelation,
        },
        { preferLast: true }
      ) || changed
    }
    return changed
  }
  if (groupedAttachment?.item) {
    promoteGenericItemToDeclaredTotal(state, groupedAttachment.item)
    changed = upsertItem(state, groupedAttachment.item, { preferLast: true }) || changed
    changed = resetConflictingDeclaredTotalsForItem(state, groupedAttachment.item, clause) || changed
    changed = flushPendingAttachmentsForItem(state, groupedAttachment.item) || changed
    if (groupedAttachment.ingredients?.length) {
      for (const ingredient of groupedAttachment.ingredients) {
        const attachedRelation = ingredient.relation === "with" && groupedAttachment.item.preparation?.length
          ? "cooked_in"
          : ingredient.relation || "cooked_in"
        changed = upsertItem(
          state,
          {
            ...ingredient,
            attachedTo: state.lastMainReference || itemReferenceKey(groupedAttachment.item),
            relation: attachedRelation,
          },
          { preferLast: true }
        ) || changed
      }
    }
    return changed
  }

  if (/^the\s+/.test(normalized)) {
    const target = ensureReferenceItem(state, clause)
    if (target) {
      state.lastMainKey = cleanText(target.baseName || target.key || "")
      state.lastGroupedBaseName = cleanText(target.baseName || target.key || "")
      changed = attachLooseIngredientsToTarget(state, state.lastMainKey) || changed
      changed = flushPendingAttachmentsForItem(state, target) || changed
    }
    return changed
  }

  if (/^(?:used to fry|used for|for)\s+the\s+/.test(normalized)) {
    const target = ensureReferenceItem(state, clause)
    if (target) {
      state.lastMainKey = cleanText(target.baseName || target.key || "")
      state.lastGroupedBaseName = cleanText(target.baseName || target.key || "")
      changed = attachLooseIngredientsToTarget(state, state.lastMainKey) || changed
      changed = flushPendingAttachmentsForItem(state, target) || changed
    }
    return changed
  }

  if (parseDrinkDetailOnly(state, clause)) return true

  const quantityOnly = parseQuantityOnly(normalized)
  if (quantityOnly) return assignQuantityToPendingItem(state, quantityOnly)

  const inheritedVariant = parseInheritedFoodClause(state, clause)
  if (inheritedVariant?.item) {
    promoteGenericItemToDeclaredTotal(state, inheritedVariant.item)
    changed = upsertItem(state, inheritedVariant.item, { preferLast: true }) || changed
    changed = resetConflictingDeclaredTotalsForItem(state, inheritedVariant.item, clause) || changed
    changed = flushPendingAttachmentsForItem(state, inheritedVariant.item) || changed
    for (const ingredient of inheritedVariant.attachedIngredients || []) {
      changed = upsertItem(state, ingredient, { preferLast: true }) || changed
    }
    return changed
  }

  if (/^(?:cooked|fried|used)\s+(?:in|to fry)\s+/.test(normalizedWithoutAlso)) {
    const ingredients = parseIngredientList(normalizedWithoutAlso.replace(/^(?:cooked|fried|used)\s+(?:in|to fry)\s+/, ""), "cooked_in", clause)
    if (ingredients.length) {
      const cookingTarget = findCookingMediumTarget(state)
      if (!cookingTarget) {
        for (const ingredient of ingredients) {
          queuePendingAttachment(state, ingredient, null, ["fried"])
        }
        return true
      }
      const attachedTo = itemReferenceKey(cookingTarget)
      for (const ingredient of ingredients) {
        changed = upsertItem(state, { ...ingredient, attachedTo, relation: ingredient.relation || "cooked_in" }, { preferLast: true }) || changed
      }
      return changed
    }
  }

  const { item, attachedIngredients } = parseMeasuredFoodClause(clause, state)
  let nextItem = null
  if (item) {
    promoteGenericItemToDeclaredTotal(state, item)
    nextItem = applyPendingQuantity(state, item)
    changed = upsertItem(state, nextItem, { preferLast: true }) || changed
    changed = resetConflictingDeclaredTotalsForItem(state, nextItem, clause) || changed
    changed = flushPendingAttachmentsForItem(state, nextItem) || changed
  }
  for (const attachedIngredient of attachedIngredients || []) {
    const targetReference = item
      ? state.lastMainReference || itemReferenceKey(nextItem || item)
      : state.lastMainReference || state.lastMainKey || ""
    if (!targetReference) {
      queuePendingAttachment(state, attachedIngredient, nextItem || null, nextItem?.preparation || [])
      changed = true
      continue
    }
    changed = upsertItem(state, { ...attachedIngredient, attachedTo: targetReference || attachedIngredient.attachedTo || "" }, { preferLast: true }) || changed
  }

  return changed
}

function defaultQuantityForItem(item) {
  if (item.quantity) return item.quantity
  if (item.category === "drink") return { amount: 250, unit: "ml", text: "250ml", modifier: "" }
  if (/\begg\b/.test(item.baseName)) return { amount: 1, unit: "egg", text: "1 egg", modifier: "" }
  if (/\btoast\b|\bbread\b/.test(item.baseName)) return { amount: 1, unit: "slice", text: "1 slice", modifier: "" }
  return { amount: 1, unit: "serve", text: "1 serve", modifier: "" }
}

function describeItem(item, state) {
  const mainItem = cloneItem(item)
  if (!mainItem.quantity && state.shouldStopClarifying) mainItem.quantity = defaultQuantityForItem(mainItem)
  const quantityText = mainItem.quantity?.text ? `${mainItem.quantity.text} ` : ""

  let baseLabel = cleanText(mainItem.label || mainItem.baseName)
  if (/\bearl grey\b/.test(mainItem.baseName)) baseLabel = "Earl Grey tea"
  if (cleanText(baseLabel) === "eggs" || cleanText(baseLabel) === "egg") baseLabel = "eggs"
  if (cleanText(baseLabel) === "tea" && /\bearl grey\b/.test(mainItem.baseName)) baseLabel = "Earl Grey tea"
  const baseNameTail = singularize(cleanText(mainItem.baseName).split(" ").at(-1) || "")
  const quantityUnit = singularize(cleanText(mainItem.quantity?.unit || ""))
  if (baseNameTail && quantityUnit && baseNameTail === quantityUnit && baseLabel && baseNameTail !== "egg") {
    baseLabel = mainItem.baseName
  }

  let description = cleanText(quantityText).endsWith(cleanText(baseLabel))
    ? quantityText.trim()
    : `${quantityText}${baseLabel}`.trim()
  if (mainItem.quantity?.unit === "egg" && cleanText(baseLabel) === "eggs") {
    description = mainItem.preparation?.length
      ? `${mainItem.quantity.amount} ${mainItem.preparation.join(" ")} eggs`
      : `${mainItem.quantity.amount} eggs`
  } else {
    const qualifiers = uniqueNormalizedValues([
      ...(mainItem.preparation || []),
      ...(mainItem.modifiers || []),
    ]).filter((word) => !description.toLowerCase().includes(cleanText(word)))
    if (qualifiers.length) {
      const displayName = baseLabel.toLowerCase() === "eggs" ? "eggs" : baseLabel
      const quantityLead = cleanText(quantityText).endsWith(cleanText(displayName))
        ? quantityText.trim().replace(new RegExp(`\\s*${escapeRegex(displayName)}$`, "i"), "").trim()
        : quantityText.trim()
      description = `${quantityLead ? `${quantityLead} ` : ""}${qualifiers.join(" ")} ${displayName}`.trim()
    }
  }

  const attachedIngredients = state.items.filter((entry) => ingredientMatchesItem(entry, mainItem))
  const cookedIn = attachedIngredients.filter((entry) => entry.relation === "cooked_in")
  if (cookedIn.length) {
    const ingredientText = cookedIn.map((entry) => describeIngredient(entry)).join(" and ")
    description = `${description} cooked in ${ingredientText}`
  }
  const mixedWith = attachedIngredients.filter((entry) => entry.relation === "mixed_with")
  if (mixedWith.length) {
    const ingredientText = mixedWith.map((entry) => describeIngredient(entry)).join(" and ")
    description = `${description} mixed with ${ingredientText}`
  }
  const withIngredients = attachedIngredients.filter((entry) => ["with", "topped_with", "on"].includes(entry.relation))
  if (withIngredients.length) {
    const ingredientText = withIngredients.map((entry) => describeIngredient(entry)).join(" and ")
    description = `${description} with ${ingredientText}`
  }

  if (mainItem.exclusions?.length) {
    const exclusionOrder = ["no milk", "no sugar"]
    const sortedExclusions = [...mainItem.exclusions].sort((left, right) => {
      const leftIndex = exclusionOrder.indexOf(cleanText(left))
      const rightIndex = exclusionOrder.indexOf(cleanText(right))
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex)
    })
    description = `${description} with ${sortedExclusions.join(" and ")}`
  }

  return description
}

function describeIngredient(item) {
  const quantityText = item.quantity?.text ? `${item.quantity.text} ` : ""
  const prepWords = item.preparation?.filter((word) => !cleanText(item.label || item.baseName || "").includes(word)) || []
  const prep = prepWords.length ? `${prepWords.join(" ")} ` : ""
  const label = cleanText(item.label || item.baseName || "")
  return `${quantityText}${prep}${label}`.replace(/\s+/g, " ").trim()
}

function summarizeMeal(state) {
  const primaryItems = state.items.filter((item) => !item.attachedTo)
  return primaryItems.map((item) => describeItem(item, state)).join(", plus ")
}

function clarificationKey(baseName, field) {
  return `${cleanText(baseName)}:${field}`
}

function extractClarificationTargets(message) {
  const text = cleanText(message)
  if (looksLikeWorkoutOnly(text)) return []
  const targets = []
  const quantityTarget = text.match(/\b(?:how much|how many|amount|quantity|serving)\s+([a-z][a-z\s]+?)(?:\s+did you have|\?|$)/i)
  if (quantityTarget?.[1]) targets.push(clarificationKey(deriveBaseName(quantityTarget[1]), "quantity"))
  if (/\bwhat type of tea\b|\bwhat kind of tea\b/.test(text)) targets.push(clarificationKey("tea", "kind"))
  if (/\bmilk\b|\bsugar\b/.test(text)) targets.push(clarificationKey("tea", "additions"))
  if (/\bcooked in\b|\bfried in\b|\banything they were cooked in\b/.test(text)) targets.push(clarificationKey("egg", "cooking_medium"))
  const amountForTarget = text.match(/\bneed (?:the )?(?:amount|quantity).+?\bfor the ([a-z][a-z\s]+)\b/i)
  if (amountForTarget?.[1]) targets.push(clarificationKey(deriveBaseName(amountForTarget[1]), "quantity"))
  if (/\bwhat dish was the butter used for\b/.test(text)) targets.push(clarificationKey("butter", "attachment"))
  if (!targets.length && /\b(i still need|need more detail|before i can log)\b/.test(text)) targets.push("generic:detail")
  return [...new Set(targets)]
}

function collectClarificationStats(recentMessages = []) {
  const counts = {}
  let total = 0
  for (const message of recentMessages) {
    if (message?.role !== "assistant") continue
    const targets = extractClarificationTargets(String(message.content || ""))
    if (!targets.length) continue
    total += 1
    for (const target of targets) counts[target] = (counts[target] || 0) + 1
  }
  return { counts, total }
}

function mergeClarificationCounts(existingCounts = {}, nextCounts = {}) {
  const merged = { ...existingCounts }
  for (const [key, value] of Object.entries(nextCounts)) {
    merged[key] = Math.max(Number(merged[key] || 0), Number(value || 0))
  }
  return merged
}

function userIsFinalising(state) {
  return FINALISE_PATTERN.test(cleanText(state.currentMessage || ""))
}

function hasQuantifiedSiblingFood(item, state) {
  return state.items.some((entry) => (
    !entry.attachedTo
    && entry.category === "food"
    && entry.quantity
    && cleanText(entry.baseName || entry.key || "") !== cleanText(item.baseName || item.key || "")
  ))
}

function itemShouldUseDefault(item, state) {
  const quantityCount = state.clarificationCounts[clarificationKey(item.baseName, "quantity")] || 0
  if (item.category === "food" && hasQuantifiedSiblingFood(item, state)) return true
  return quantityCount >= 2 || (userIsFinalising(state) && quantityCount >= 1)
}

function cookingMediumShouldStopClarifying(item, state) {
  const attempts = state.clarificationCounts[clarificationKey(item.baseName, "cooking_medium")] || 0
  return attempts >= 2 || (userIsFinalising(state) && attempts >= 1)
}

function identifyMissingDetails(state) {
  const missing = []
  const declaredTotalMismatch = findDeclaredTotalMismatch(state)
  if (declaredTotalMismatch) {
    missing.push({ type: "declared_total_mismatch", mismatch: declaredTotalMismatch })
    return missing
  }
  for (const item of state.items.filter((entry) => !entry.attachedTo)) {
    if (!item.quantity && !itemShouldUseDefault(item, state)) {
      missing.push({ type: "quantity", item })
      continue
    }
    const needsCookingMedium = item.preparation?.includes("fried")
      && !state.items.some((entry) => ingredientMatchesItem(entry, item) && entry.relation === "cooked_in")
      && !cookingMediumShouldStopClarifying(item, state)
    if (needsCookingMedium) {
      missing.push({ type: "cooking_medium", item })
    }
  }
  return missing
}

function buildClarifyQuestion(state) {
  const missing = identifyMissingDetails(state)
  if (!missing.length) return ""
  if (missing[0]?.type === "declared_total_mismatch") {
    const mismatch = missing[0].mismatch
    const unit = mismatch.declaredUnit === "egg"
      ? mismatch.declaredAmount === 1 ? "egg" : "eggs"
      : mismatch.declaredUnit
    const actualUnit = mismatch.declaredUnit === "egg"
      ? mismatch.actualAmount === 1 ? "egg" : "eggs"
      : mismatch.declaredUnit
    return `You said ${mismatch.declaredAmount}${mismatch.declaredUnit === "egg" ? "" : " "} ${unit} total, but I only have ${mismatch.actualAmount}${mismatch.declaredUnit === "egg" ? "" : " "} ${actualUnit} accounted for. What should the split be?`
      .replace(/\s+/g, " ")
      .replace(/ (\?|,)/g, "$1")
      .trim()
  }
  const currentBaseName = deriveBaseName(state.currentMessage)
  const lastAssistantTargets = [...(state.threadTurns || [])]
    .reverse()
    .find((entry) => entry?.role === "assistant")
  const lastClarificationTargets = lastAssistantTargets ? extractClarificationTargets(String(lastAssistantTargets.content || "")) : []
  const currentTarget = currentBaseName
    ? missing.find((entry) => cleanText(entry.item.baseName) === cleanText(currentBaseName))
    : null
  const alternateTarget = missing.find((entry) => !lastClarificationTargets.includes(clarificationKey(entry.item.baseName, entry.type)))
  const firstMissing = currentTarget || alternateTarget || missing[0]
  const baseName = cleanText(firstMissing.item.baseName || firstMissing.item.label)
  const displayName = titleCase(defaultDisplayLabel(baseName, firstMissing.item.label || firstMissing.item.baseName))
  if (firstMissing.type === "cooking_medium") {
    const qualifiers = uniqueNormalizedValues([...(firstMissing.item.preparation || []), ...(firstMissing.item.modifiers || [])])
    const cookedLabel = baseName === "egg"
      ? qualifiers.length ? `${qualifiers.join(" ")} eggs` : "eggs"
      : `${qualifiers.join(" ")} ${displayName.toLowerCase()}`.trim()
    return `What were the ${cookedLabel} cooked in?`
  }
  if (baseName === "egg") return "How many eggs did you have?"
  return `How much ${displayName.toLowerCase()} did you have?`
}

function detectMealIntent(turns = []) {
  return turns.some((turn) => /\b(log|track|save|add|include)\b/i.test(String(turn || "")))
    || turns.some((turn) => /\b(i had|had|i ate|ate|i drank|drank|breakfast|lunch|dinner|snack)\b/i.test(String(turn || "")))
}

function detectNutritionQuestion(turns = []) {
  return turns.some((turn) => /\b(calories|calorie|macro|macros|protein|carbs|fat|calculate)\b/i.test(String(turn || "")))
}

function seedStateFromExistingSession(state, existingSession) {
  const hasCarryState = Boolean(
    existingSession?.active
    && (
      (Array.isArray(existingSession.items) && existingSession.items.length)
      || (Array.isArray(existingSession.pendingAttachments) && existingSession.pendingAttachments.length)
      || (Array.isArray(existingSession.pendingQuantities) && existingSession.pendingQuantities.length)
      || (Array.isArray(existingSession.declaredTotals) && existingSession.declaredTotals.length)
    )
  )
  if (!hasCarryState) return
  state.items = Array.isArray(existingSession.items) ? existingSession.items.map((item) => toInternalItem(item)) : []
  const primaryReferences = new Map(
    state.items
      .filter((item) => !item.attachedTo && item.category === "food")
      .map((item) => [cleanText(item.baseName || item.key || ""), itemReferenceKey(item)])
      .filter(([key, reference]) => key && reference)
  )
  state.items = state.items.map((item) => {
    const attachedTo = cleanText(item.attachedTo || "")
    if (!attachedTo || attachedTo.includes("::")) return item
    const normalizedAttachment = primaryReferences.get(attachedTo)
    return normalizedAttachment
      ? { ...item, attachedTo: normalizedAttachment }
      : item
  })
  state.lastMainKey = cleanText(existingSession.lastMainKey || state.items.findLast?.((item) => item.category !== "ingredient")?.baseName || state.lastMainKey)
  state.lastMainReference = cleanText(existingSession.lastMainReference || itemReferenceKey(state.items.findLast?.((item) => item.category === "food" && !item.attachedTo) || {}) || state.lastMainReference)
  state.lastDrinkKey = cleanText(existingSession.lastDrinkKey || state.items.findLast?.((item) => item.category === "drink")?.baseName || state.lastDrinkKey)
  state.lastGroupedBaseName = cleanText(existingSession.lastGroupedBaseName || state.lastMainKey || state.lastGroupedBaseName)
  state.declaredTotals = safeArray(existingSession.declaredTotals, 8).map((entry) => ({
    amount: Number(entry?.amount) || 0,
    unit: normalizeUnit(entry?.unit || ""),
    baseName: cleanText(entry?.baseName || entry?.base_name || ""),
  })).filter((entry) => entry.amount > 0)
  state.clarificationAttempts = Math.max(0, Number(existingSession.clarificationAttempts) || 0)
  state.clarificationCounts = mergeClarificationCounts(state.clarificationCounts, existingSession.clarificationCounts || {})
  state.mealConversation = true
  state.wantsLogging = Boolean(existingSession.wantsLogging)
  state.wantsNutrition = Boolean(existingSession.wantsNutrition)
  state.answerOnly = Boolean(existingSession.answerOnly)
  state.suppressed = Boolean(existingSession.suppressed)
  state.suppressionReply = String(existingSession.suppressionReply || "")
  state.pendingAttachments = safeArray(existingSession.pendingAttachments, 8).map((entry) => ({
    ingredient: toInternalItem(entry.ingredient || {}),
    targetBaseName: cleanText(entry.targetBaseName || ""),
    targetPreparations: safeArray(entry.targetPreparations, 4).map((value) => cleanText(value)).filter(Boolean),
  }))
  state.pendingQuantities = safeArray(existingSession.pendingQuantities, 4).map((entry) => entry ? { ...entry } : null).filter(Boolean)
}

export function emptyMealSession() {
  return {
    active: false,
    items: [],
    clarificationAttempts: 0,
    clarificationCounts: {},
    readyToLog: false,
    shouldStopClarifying: false,
    summary: "",
    clarifyQuestion: "",
    wantsLogging: false,
    wantsNutrition: false,
    answerOnly: false,
    suppressed: false,
    suppressionReply: "",
    mealConversation: false,
    lastMainKey: "",
    lastMainReference: "",
    lastGroupedBaseName: "",
    lastDrinkKey: "",
    declaredTotals: [],
    pendingAttachments: [],
    pendingQuantities: [],
  }
}

export function buildMealStateFromConversation(recentMessages = [], currentMessage = "", existingSession = null) {
  const conversation = extractMealThread(recentMessages, currentMessage, existingSession)
  const clarificationStats = collectClarificationStats(conversation.filter((entry) => entry?.role === "assistant"))
  const state = {
    items: [],
    pendingQuantities: [],
    clarificationAttempts: clarificationStats.total,
    clarificationCounts: clarificationStats.counts,
    declaredTotals: [],
    pendingAttachments: [],
    pendingQuantities: [],
    lastMainKey: "",
    lastMainReference: "",
    lastGroupedBaseName: "",
    lastDrinkKey: "",
    mealConversation: false,
    shouldStopClarifying: false,
    readyToLog: false,
    missingItems: [],
    summary: "",
    clarifyQuestion: "",
    wantsLogging: false,
    wantsNutrition: false,
    answerOnly: false,
    suppressed: false,
    suppressionReply: "",
    currentMessage: String(currentMessage || ""),
  }

  if (!conversation.length) return state

  seedStateFromExistingSession(state, existingSession)
  state.clarificationAttempts = Math.max(state.clarificationAttempts, clarificationStats.total, Number(existingSession?.clarificationAttempts) || 0)
  state.clarificationCounts = mergeClarificationCounts(state.clarificationCounts, clarificationStats.counts)

  const userTurns = conversation.filter((entry) => entry?.role === "user").map((entry) => String(entry.content || ""))
  const threadHint = userTurns.some((turn) => MEAL_VERBS.test(turn) || looksFoodishPhrase(turn))
  const normalizedCurrent = cleanText(currentMessage)
  const continuedDetailTurn = Boolean(
    existingSession?.active
    && !detectSuppressedLogging(currentMessage)
    && !detectQuestionOnlyTurn(currentMessage)
    && (
      hasDigits(normalizedCurrent)
      || looksFoodishPhrase(normalizedCurrent)
      || MEAL_REFERENCE_PATTERN.test(normalizedCurrent)
      || CORRECTION_PREFIX.test(normalizedCurrent)
      || FINALISE_PATTERN.test(normalizedCurrent)
    )
  )
  state.wantsLogging = Boolean(existingSession?.wantsLogging) || detectMealIntent(userTurns) || continuedDetailTurn
  state.wantsNutrition = Boolean(existingSession?.wantsNutrition) || detectNutritionQuestion(userTurns)
  state.answerOnly = detectQuestionOnlyTurn(currentMessage)
  state.suppressed = detectSuppressedLogging(currentMessage)
  state.suppressionReply = state.suppressed ? "Okay, I won't save that." : ""

  const turnsToProcess = existingSession?.active
    ? [{ role: "user", content: currentMessage }]
    : conversation

  for (const entry of turnsToProcess) {
    if (entry?.role !== "user") continue
    const message = String(entry.content || "")
    if (!looksLikeMealContinuation(message, state, threadHint)) continue
    state.mealConversation = true
    for (const clause of splitClauses(message)) {
      mergeClauseIntoState(state, clause)
    }
  }

  state.items = state.items.map((item) => item.quantity || !itemShouldUseDefault(item, state) ? item : { ...item, quantity: defaultQuantityForItem(item) })
  state.shouldStopClarifying = Object.values(state.clarificationCounts).some((count) => count >= 2)
  state.missingItems = identifyMissingDetails(state)
  if (state.shouldStopClarifying) {
    state.items = state.items.map((item) => item.quantity || !itemShouldUseDefault(item, state) ? item : { ...item, quantity: defaultQuantityForItem(item) })
    state.missingItems = identifyMissingDetails(state)
  }
  state.readyToLog = state.items.some((item) => !item.attachedTo) && state.missingItems.length === 0
  state.summary = summarizeMeal(state)
  state.clarifyQuestion = state.readyToLog ? "" : buildClarifyQuestion(state)
  if (state.suppressed) {
    state.items = []
    state.summary = ""
    state.readyToLog = false
    state.clarifyQuestion = ""
    state.active = false
    state.mealConversation = false
  } else {
    state.active = Boolean(
      state.mealConversation
      || state.items.length
      || state.pendingQuantities.length
      || state.pendingAttachments.length
    )
  }
  state.threadTurns = conversation
  return state
}

export function mealStateNeedsClarification(mealState) {
  return Boolean(mealState?.mealConversation && !mealState.readyToLog && mealState.clarifyQuestion)
}

export function buildMealContext(recentMessages = [], currentMessage = "", existingSession = null) {
  const mealState = buildMealStateFromConversation(recentMessages, currentMessage, existingSession)
  if (!mealState.mealConversation && !mealState.suppressed) return null

  return {
    ...mealState,
    items: mealState.items.map((item) => ({
      base_name: item.baseName,
      label: item.label,
      category: item.category,
      quantity: item.quantity ? { ...item.quantity } : null,
      preparation: item.preparation,
      modifiers: item.modifiers,
      exclusions: item.exclusions,
      attached_to: item.attachedTo || null,
      relation: item.relation || null,
      variant_key: item.variantKey || "",
    })),
    lastMainReference: mealState.lastMainReference,
    thread_messages: mealState.threadTurns?.map((entry) => ({ role: entry.role, content: String(entry.content || "") })) || [],
    declaredTotals: mealState.declaredTotals.map((entry) => ({ ...entry })),
    pendingAttachments: mealState.pendingAttachments.map((entry) => ({
      ingredient: {
        base_name: entry.ingredient.baseName,
        label: entry.ingredient.label,
        category: entry.ingredient.category,
        quantity: entry.ingredient.quantity ? { ...entry.ingredient.quantity } : null,
        preparation: entry.ingredient.preparation,
        modifiers: entry.ingredient.modifiers,
        exclusions: entry.ingredient.exclusions,
        attached_to: entry.ingredient.attachedTo || null,
        relation: entry.ingredient.relation || null,
        variant_key: entry.ingredient.variantKey || "",
      },
      targetBaseName: entry.targetBaseName,
      targetPreparations: [...entry.targetPreparations],
    })),
    pendingQuantities: mealState.pendingQuantities.map((entry) => ({ ...entry })),
  }
}
