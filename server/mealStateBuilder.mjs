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
const FOOD_HINTS = ["egg", "eggs", "chicken", "rice", "beef", "pork", "lamb", "fish", "salmon", "tuna", "toast", "bread", "tea", "coffee", "juice", "milk", "beans", "oats", "yoghurt", "yogurt", "butter", "oil", "cheese", "potato", "salad", "apple", "banana", "celery", "chocolate", "pasta", "chips", "fries", "burger", "taco", "tacos", "vegemite", "berry", "berries", "whey", "almond milk"]
const COUNT_REQUIRED = new Set(["egg"])
const STOPWORDS = new Set(["i", "had", "have", "ate", "drank", "also", "just", "the", "a", "an", "my", "for", "to", "at", "with", "and", "plus", "of", "it", "that", "this", "was", "were", "is", "are", "did", "do", "done", "log", "track", "save", "add", "include", "today"])

const MEAL_START_PATTERN = /^(?:please\s+)?(?:(?:i\s+)?(?:had|ate|drank)|log|track|save|add|include)\b/i
const CORRECTION_PREFIX = /^(?:actually|sorry|correction|no\s+wait|wait|i meant|make that|change that(?: to)?|update that(?: to)?|instead)\b/i
const SUPPRESS_PATTERN = /\b(?:don't|dont|do not|stop|no)\s+(?:log|save|track|record|add)\b/i
const MEAL_LOG_QUERY_PATTERN = /^(?:what(?:'s|s| is)?|show|list|see|view|display)\b.*\b(?:today'?s?|todays?|my)\b.*\b(?:nutrition|food|meal|meals|log)\b/i
const WORKOUTISH_PATTERN = /\b(?:bench(?:\s+press)?|incline\s+bench|overhead\s+press|shoulder\s+press|row|rows|pull\s*ups?|pullups?|push\s*ups?|pushups?|sit\s*ups?|situps?|burpees?|dips?|lunges?|squat|squats|deadlift|rdl|leg press|treadmill|bike|rower|elliptical|stairmaster|run|ran|walk|walked|cycle|cycled|swam|swim|sets?|reps?)\b|\b\d+\s*x\s*\d+\b|\b\d+(?:\.\d+)?\s*(?:kg|km|mi|miles?|min|mins|minutes)\b/i
const COMPLEX_PATTERN = /\b(?:total|rest|remainder|each|breakfast|lunch|dinner|snack|same as yesterday|same as last time|same as before|repeat that|host variant|taco|tacos|burrito bowl)\b/i
const TIME_REFERENCE_PATTERN = /\b(?:yesterday|last night|last week|earlier today|this morning|tonight)\b/i
const META_COMPLAINT_PATTERN = /\b(?:you asked|i gave you|why can(?:'|’)t you understand|why cant you understand|i told you|already said|what do you mean|i just answered|you just asked)\b/i
const VAGUE_REFERENCE_PATTERN = /^(?:the\s+)?(?:eggs?|tea|coffee|toast|beans?|chicken|rice|butter|oil|salmon|milk|drink|pizza|burger|chips)\b/i
const SHARED_EACH_PATTERN = /^(?:about|around|roughly|approx(?:imately)?|bout)?\s*(?<amount>\d+(?:\.\d+)?|half|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*(?<unit>g|kg|lb|lbs|pound|pounds|ml|l|litre|litres|liter|liters|cup|cups|bowl|bowls|plate|plates|mug|mugs|serve|serves|serving|servings|slice|slices|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|egg|eggs)\s+each$/i
const INLINE_CORRECTION_PATTERN = /\b(?:no wait|i meant|make that|change that|update that|sorry)\b/i
const PACKAGED_UNIT_PATTERN = /\b(?:tin|tins|can|cans|block|blocks|bunch|bunches)\b/i
const RELATION_PATTERNS = [
  { relation: "cooked_in", pattern: /\b(?:cooked|fried|grilled|baked|roasted|boiled|poached|scrambled|steamed)\s+in\b/i },
  { relation: "mixed_with", pattern: /\bmixed with\b/i },
  { relation: "topped_with", pattern: /\b(?:topped|covered)\s+with\b/i },
  { relation: "on", pattern: /\bon\b/i },
  { relation: "with", pattern: /\bwith\b/i },
]

const baseSession = () => ({
  ...legacyEmptyMealSession(),
  thread_messages: [],
  pendingClarification: null,
  structuralIssues: [],
  invalidStructure: false,
  intentGraph: null,
  candidateFragments: { meal: [], workout: [], general: [] },
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
const canonicalBaseName = (value = "") => {
  const normalized = cleanText(value)
  if (!normalized) return ""
  return normalized.includes(" ") ? normalized : singularize(normalized)
}
const normalizeUnit = (unit = "") => UNIT_ALIASES.get(cleanText(unit)) || cleanText(unit)
const hasDigits = (text = "") => /\d/.test(String(text))
const isDrink = (name = "") => DRINK_WORDS.some((word) => containsWord(name, word))
const isIngredient = (name = "") => INGREDIENT_WORDS.some((word) => containsWord(name, word))
const isWorkoutish = (text = "") => WORKOUTISH_PATTERN.test(cleanText(text))
const looksFoodish = (text = "") => FOOD_HINTS.some((word) => containsWord(text, word))

export function detectQuestionOnlyTurn(text) {
  return legacyDetectQuestionOnlyTurn(text)
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
  return [...safeArray(recentMessages, 18).filter((entry) => typeof entry?.content === "string"), { role: "user", content: String(currentMessage || "") }]
}

function shouldUseLegacy(conversation, currentMessage, existingSession) {
  const normalizedCurrent = cleanText(currentMessage)
  const joined = cleanText([...conversation.map((entry) => entry.content || ""), currentMessage].join(" "))
  const assistantMealTurns = conversation.filter((entry) => entry.role === "assistant" && /\b(?:how much|how many|what type|what kind|cooked in|fried in|used for|before i can log|need more detail)\b/i.test(cleanText(entry.content || ""))).length
  const currentClauses = splitGraphClauses(currentMessage)
  const quantitySignals = (normalizedCurrent.match(/\b(?:\d+(?:\.\d+)?|half|couple)\b/g) || []).length
  const measuredAmountSignals = [...normalizedCurrent.matchAll(/\b(?:\d+(?:\.\d+)?|half)\s*(?:a\s+)?(?:kg|g|lb|lbs|pound|pounds|ml|l|litre|litres|liter|liters|cup|cups|bowl|bowls|plate|plates|mug|mugs|serve|serves|serving|servings|slice|slices|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons)\b/ig)].length
  return Boolean(
    existingSession?.active
    ||
    existingSession?.persisted
    || existingSession?.mealConversation
    || existingSession?.meal_groups?.length
    || existingSession?.declaredTotals?.length
    || existingSession?.pendingAttachments?.length
    || existingSession?.pendingQuantities?.length
    || existingSession?.correctionRequested
    || existingSession?.deleteRequested
    || conversation.some((entry) => entry.role === "assistant")
    || conversation.filter((entry) => entry.role === "user").length > 1
    || currentClauses.length > 1
    || !MEAL_START_PATTERN.test(cleanText(currentMessage))
    || TIME_REFERENCE_PATTERN.test(cleanText(currentMessage))
    || INLINE_CORRECTION_PATTERN.test(cleanText(currentMessage))
    || PACKAGED_UNIT_PATTERN.test(cleanText(currentMessage))
    || quantitySignals > 1
    || measuredAmountSignals > 1
    || /\b(?:tea|coffee|milk|juice|water|shake|smoothie|beer|wine|cola|soda)\b/i.test(cleanText(currentMessage))
    || /\b(?:with|without|cooked in|fried in|no sugar|no milk)\b/i.test(cleanText(currentMessage))
    || CORRECTION_PREFIX.test(cleanText(currentMessage))
    || COMPLEX_PATTERN.test(joined)
    || assistantMealTurns > 1
  )
}

function extractQuantity(text = "") {
  const normalized = cleanText(text)
  if (!normalized) return null
  const quantityMatch = normalized.match(/^(?<amount>\d+(?:\.\d+)?|a couple|couple|half|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s*(?:(?<article>a)\s+)?(?<unit>kg|g|lb|lbs|pound|pounds|ml|l|litre|litres|liter|liters|cup|cups|bowl|bowls|plate|plates|mug|mugs|serve|serves|serving|servings|slice|slices|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|egg|eggs)?\b/i)
  if (!quantityMatch?.groups?.amount) return null
  const rawAmount = quantityMatch.groups.amount
  const amount = QUANTITY_WORDS.get(rawAmount) ?? Number(rawAmount)
  if (!Number.isFinite(amount)) return null
  const unit = normalizeUnit(quantityMatch.groups.unit || "")
  const textValue = unit ? quantityMatch[0].trim().replace(/\s+/g, " ") : `${rawAmount}`
  return { amount, unit, text: textValue.trim(), modifier: "" }
}

function extractPreparations(text = "") {
  const normalized = cleanText(text)
  const hits = []
  for (const preparation of PREPARATIONS) {
    const pattern = new RegExp(`\\b${preparation.replace(/\s+/g, "\\s*")}\\b`, "i")
    if (pattern.test(normalized)) hits.push(preparation === "hardboiled" ? "hard boiled" : preparation === "softboiled" ? "soft boiled" : preparation)
  }
  return [...new Set(hits)]
}

function extractExclusions(text = "") {
  const normalized = cleanText(text)
  const exclusions = []
  if (/\bno sugar\b|\bwithout sugar\b/.test(normalized)) exclusions.push("no sugar")
  if (/\bno milk\b|\bwithout milk\b/.test(normalized)) exclusions.push("no milk")
  return exclusions
}

function stripLead(text = "") {
  return String(text || "")
    .replace(MEAL_START_PATTERN, "")
    .replace(CORRECTION_PREFIX, "")
    .replace(/\b(?:please|thanks|thank you)\b/gi, "")
    .trim()
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
    .replace(/\b(?:about|around|roughly|approx(?:imately)?|bout|whole|entire|small|big|little|extra|lean|skinless|boneless|double|single)\b/g, " ")
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
    .replace(/\balso did\b/gi, "|did")
    .replace(/\boh and i did\b/gi, "|i did")
    .replace(/\bplus\b/gi, "|")
    .replace(/\balso\b/gi, "|")
    .replace(/\band\b/gi, "|")
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

function findRootByBaseName(state, baseName = "") {
  const normalized = singularize(baseName)
  return state.items.find((item) => !item.attached_to && singularize(item.base_name) === normalized) || null
}

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
  const quantity = extractQuantity(relationTail.lead)
  const preparations = extractPreparations(relationTail.lead)
  const exclusions = extractExclusions(relationTail.lead)
  const sourceBaseName = baseNameFromText(relationTail.lead)
  const baseName = canonicalBaseName(sourceBaseName)
  if (!baseName && quantity && state.pendingClarification?.type === "quantity") {
    return { kind: "bind_quantity", quantity, preparations, exclusions }
  }
  if (!baseName && relationTail.relation && state.pendingClarification?.type === "ingredient") {
    return { kind: "bind_ingredient", relation: relationTail.relation, ingredientText: relationTail.ingredientText }
  }
  if (!baseName && /^cooked in\b|^fried in\b|^with\b/i.test(normalized)) {
    return { kind: "bind_ingredient", relation: normalized.startsWith("with ") ? "with" : "cooked_in", ingredientText: normalized.replace(/^(?:cooked|fried)\s+in\s+|^with\s+/i, "").trim() }
  }
  if (!baseName && normalized && state.pendingClarification?.type === "variant") {
    return { kind: "bind_variant", variantText: raw }
  }
  if (!baseName) return { kind: "ignore" }
  const item = {
    base_name: baseName,
    label: itemLabel(sourceBaseName || baseName),
    category: detectCategory(baseName, quantity),
    quantity: quantity ? { ...quantity, text: String(quantity.text || "").replace(/\b(a couple)\b/i, "2") } : null,
    preparation: preparations,
    modifiers: [],
    exclusions,
    attached_to: null,
    relation: null,
    variant_key: "",
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

function mergeRoot(state, nextItem) {
  const pendingTarget = state.pendingClarification?.targetReference ? findRootByReference(state, state.pendingClarification.targetReference) : null
  const sameBase = findRootByBaseName(state, nextItem.base_name)
  const target = pendingTarget && singularize(pendingTarget.base_name) === singularize(nextItem.base_name)
    ? pendingTarget
    : sameBase
  if (!target) {
    state.items.push(cloneItem(nextItem))
    state.lastMainKey = cleanText(nextItem.base_name)
    state.lastMainReference = itemReference(nextItem)
    if (nextItem.category === "drink") state.lastDrinkKey = cleanText(nextItem.base_name)
    return
  }
  if (nextItem.quantity) target.quantity = { ...nextItem.quantity }
  if (nextItem.preparation.length) target.preparation = [...new Set([...target.preparation, ...nextItem.preparation])]
  if (nextItem.exclusions.length) target.exclusions = [...new Set([...target.exclusions, ...nextItem.exclusions])]
  if (target.base_name === "tea" && nextItem.base_name !== "tea") {
    target.base_name = nextItem.base_name
    target.label = nextItem.label
  }
  if (target.base_name === "coffee" && nextItem.base_name !== "coffee") {
    target.base_name = nextItem.base_name
    target.label = nextItem.label
  }
  state.lastMainKey = cleanText(target.base_name)
  state.lastMainReference = itemReference(target)
  if (target.category === "drink") state.lastDrinkKey = cleanText(target.base_name)
}

function attachIngredient(state, ingredient, relation = "with", explicitTarget = null) {
  const target = explicitTarget || findRootByReference(state, state.lastMainReference) || unresolvedRoots(state).slice(-1)[0] || null
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
    const target = findRootByReference(state, pending.targetReference) || findRootByBaseName(state, pending.targetBaseName)
    if (parsed.kind === "bind_quantity" && target) {
      target.quantity = { ...parsed.quantity }
      if (parsed.preparations.length) target.preparation = [...new Set([...target.preparation, ...parsed.preparations])]
      if (parsed.exclusions.length) target.exclusions = [...new Set([...target.exclusions, ...parsed.exclusions])]
      state.pendingClarification = null
      state.lastMainReference = itemReference(target)
      return true
    }
    if (parsed.kind === "item" && target && singularize(parsed.item.base_name) === singularize(target.base_name) && parsed.item.quantity) {
      target.quantity = { ...parsed.item.quantity }
      target.preparation = [...new Set([...target.preparation, ...parsed.item.preparation])]
      target.exclusions = [...new Set([...target.exclusions, ...parsed.item.exclusions])]
      state.pendingClarification = null
      state.lastMainReference = itemReference(target)
      return true
    }
    if (parsed.kind === "item" && target && singularize(parsed.item.base_name) === singularize(target.base_name)) {
      pending.invalidReply = true
      return true
    }
    return false
  }
  if (pending.type === "ingredient") {
    const target = findRootByReference(state, pending.targetReference) || findRootByBaseName(state, pending.targetBaseName)
    if (!target) return false
    const ingredient = parseIngredientItem(text)
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
    if (item.preparation.some((value) => COOKING_PREPARATIONS.has(cleanText(value)))) {
      const hasCookedIn = state.items.some((candidate) => candidate.attached_to === itemReference(item) && candidate.relation === "cooked_in")
      if (!hasCookedIn) missing.push({ type: "ingredient", item, relation: "cooked_in" })
    }
  }
  return missing
}

function quantityQuestion(item, invalid = false) {
  const base = singularize(item.base_name)
  const label = item.label || itemLabel(item.base_name)
  if (invalid) return COUNT_REQUIRED.has(base) ? `I'm asking how many ${cleanText(label)} you had.` : `I'm asking how much ${cleanText(label)} you had.`
  return COUNT_REQUIRED.has(base) ? `How many ${cleanText(label)} did you have?` : `How much ${cleanText(label)} did you have?`
}

function ingredientQuestion(item, relation = "cooked_in") {
  const preparation = item.preparation[0] ? `${cleanText(item.preparation[0])} ` : ""
  if (relation === "cooked_in") return `What were the ${preparation}${cleanText(item.label || item.base_name)} cooked in?`.replace(/\s+/g, " ").trim()
  return `What did you have with the ${cleanText(item.label || item.base_name)}?`
}

function buildPendingClarification(state, missing = []) {
  const first = missing[0]
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
      const prefix = item.relation === "cooked_in" ? " cooked in " : " with "
      return `${prefix}${summarizeItem(state, item, true)}`
    })
    .join("")
}

function summarizeItem(state, item, attachmentOnly = false) {
  const roots = unresolvedRoots(state)
  const quantity = item.quantity || (!attachmentOnly && !requiresQuantity(item, roots) ? defaultQuantityFor(item) : null)
  const quantityText = quantity?.text || ""
  const prepText = item.preparation.length ? `${item.preparation.join(" ")} ` : ""
  const core = `${quantityText ? `${quantityText} ` : ""}${prepText}${cleanText(item.label || item.base_name)}`.replace(/\s+/g, " ").trim()
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

function processGraphTurn(state, turn) {
  const text = String(turn.content || "")
  const normalized = cleanText(text)
  if (!normalized || MEAL_LOG_QUERY_PATTERN.test(normalized) || detectQuestionOnlyTurn(text)) return
  if (SUPPRESS_PATTERN.test(normalized)) {
    state.suppressed = true
    state.suppressionReply = "Okay, I won't save that."
    return
  }
  if (resolvePendingReply(state, text)) return
  for (const fragment of splitGraphClauses(text)) {
    const parsed = parseItemFragment(fragment, state)
    if (parsed.kind === "legacy") throw new Error("fallback")
    if (parsed.kind === "ignore") continue
    if (parsed.kind === "reference") {
      const target = findRootByBaseName(state, parsed.reference)
      if (target) state.lastMainReference = itemReference(target)
      continue
    }
    if (parsed.kind === "bind_ingredient") {
      attachIngredient(state, parseIngredientItem(parsed.ingredientText), parsed.relation || "cooked_in")
      continue
    }
    if (parsed.kind === "bind_variant") {
      const drinks = unresolvedRoots(state).filter((item) => item.category === "drink" && !item.quantity)
      if (drinks.length === 1) {
        const label = cleanText(parsed.variantText).includes(drinks[0].base_name) ? parsed.variantText : `${parsed.variantText} ${drinks[0].base_name}`
        drinks[0].base_name = cleanText(label)
        drinks[0].label = itemLabel(label)
        state.lastDrinkKey = cleanText(label)
      }
      continue
    }
    if (parsed.kind === "bind_quantity") {
      const target = state.pendingClarification?.targetReference ? findRootByReference(state, state.pendingClarification.targetReference) : unresolvedRoots(state)[0]
      if (target) {
        target.quantity = { ...parsed.quantity }
        if (parsed.preparations.length) target.preparation = [...new Set([...target.preparation, ...parsed.preparations])]
        if (parsed.exclusions.length) target.exclusions = [...new Set([...target.exclusions, ...parsed.exclusions])]
      }
      continue
    }
    if (parsed.kind === "item_with_attachment") {
      mergeRoot(state, parsed.item)
      attachIngredient(state, parseIngredientItem(parsed.ingredientText), parsed.relation || "with")
      continue
    }
    if (parsed.kind === "item") {
      mergeRoot(state, parsed.item)
    }
  }
}

export function emptyMealSession() {
  return baseSession()
}

export function buildMealStateFromConversation(recentMessages = [], currentMessage = "", existingSession = null) {
  const conversation = normalizeConversation(recentMessages, currentMessage, existingSession)
  if (shouldUseLegacy(conversation, currentMessage, existingSession)) {
    return buildLegacyMealStateFromConversation(recentMessages, currentMessage, existingSession)
  }

  const state = baseSession()
  Object.assign(state, existingSession ? { ...baseSession(), ...existingSession } : {})
  state.items = safeArray(existingSession?.items, 48).map(cloneItem)
  state.declaredTotals = safeArray(existingSession?.declaredTotals, 12).map((entry) => ({ ...entry }))
  state.pendingAttachments = safeArray(existingSession?.pendingAttachments, 8).map((entry) => ({ ...entry }))
  state.pendingQuantities = safeArray(existingSession?.pendingQuantities, 8).map((entry) => ({ ...entry }))
  state.clarificationCounts = { ...(existingSession?.clarificationCounts || {}) }
  state.pendingClarification = existingSession?.pendingClarification ? { ...existingSession.pendingClarification } : null
  state.thread_messages = conversation.map((entry) => ({ role: entry.role, content: String(entry.content || "") }))
  state.answerOnly = detectQuestionOnlyTurn(currentMessage)
  state.wantsLogging = Boolean(existingSession?.wantsLogging) || /\b(?:i had|i ate|i drank|log|track|save|add|include)\b/i.test(cleanText(currentMessage))
  state.wantsNutrition = Boolean(existingSession?.wantsNutrition) || /\b(?:calories|protein|carbs|fat|macro|macros)\b/i.test(cleanText(currentMessage))
  state.mealConversation = Boolean(existingSession?.mealConversation) || looksFoodish(currentMessage) || Boolean(existingSession?.active)
  state.intentGraph = buildIntentGraph(conversation, currentMessage, existingSession)
  state.candidateFragments = {
    meal: safeArray(state.intentGraph.mealFragments, 16),
    workout: [],
    general: safeArray(state.intentGraph.generalFragments, 16),
  }

  try {
    const turns = existingSession?.active ? [{ role: "user", content: String(currentMessage || "") }] : conversation.filter((entry) => entry.role === "user")
    for (const turn of turns) processGraphTurn(state, turn)
  } catch {
    return buildLegacyMealStateFromConversation(recentMessages, currentMessage, existingSession)
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
    }
  }

  state.missingItems = missing
  state.pendingClarification = buildPendingClarification(state, missing)
  state.readyToLog = unresolvedRoots(state).length > 0 && missing.length === 0
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
  return state
}

export function mealStateNeedsClarification(mealState) {
  return mealState?.intentGraph ? Boolean(mealState?.mealConversation && !mealState.readyToLog && mealState.clarifyQuestion) : legacyMealStateNeedsClarification(mealState)
}

export function buildMealContext(recentMessages = [], currentMessage = "", existingSession = null) {
  const conversation = normalizeConversation(recentMessages, currentMessage, existingSession)
  if (shouldUseLegacy(conversation, currentMessage, existingSession)) {
    return buildLegacyMealContext(recentMessages, currentMessage, existingSession)
  }
  const state = buildMealStateFromConversation(recentMessages, currentMessage, existingSession)
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
