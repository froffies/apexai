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
  "poached",
  "scrambled",
  "toasted",
  "roasted",
  "steamed",
  "fresh",
  "squeezed",
  "salted",
  "unsalted",
  "wholemeal",
  "wholegrain",
  "rye",
  "black",
])

const DRINK_KEYWORDS = ["tea", "coffee", "juice", "water", "milk", "smoothie", "shake", "latte", "espresso"]
const INGREDIENT_KEYWORDS = ["butter", "oil", "cheese", "sugar", "milk", "cream", "sauce", "dressing", "vegemite", "jam", "honey", "salt"]
const FOOD_HINT_WORDS = ["egg", "eggs", "chicken", "rice", "beef", "pork", "lamb", "fish", "salmon", "tuna", "toast", "bread", "tea", "coffee", "juice", "milk", "beans", "oats", "yoghurt", "yogurt", "butter", "oil", "cheese", "potato", "salad", "apple", "banana", "celery", "chocolate", "pasta", "vegemite", "berry", "berries"]
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

const QUANTITY_PATTERN = new RegExp(
  `(?<amount>\\d+(?:\\.\\d+)?|${[...QUANTITY_WORDS.keys()].join("|")})\\s*(?:(?<intensity>whole|entire)\\s+)?(?<unit>${QUANTITY_UNITS.join("|")})\\b(?:\\s+of)?\\s*(?<food>.*)$`,
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

function normalizeLabel(label) {
  return cleanText(label)
    .replace(/^(?:i had|had|i ate|ate|i drank|drank|log|track|save|add|include)\s+/, "")
    .replace(/\b(?:for breakfast|for lunch|for dinner|as a snack)\b/g, "")
    .replace(/\b(?:please|thanks|thank you)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
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

function looksFoodishPhrase(text) {
  const normalized = cleanText(text)
  if (!normalized) return false
  return FOOD_HINT_WORDS.some((word) => new RegExp(`\\b${word}\\b`, "i").test(normalized))
}

function looksLikeMealContinuation(text, state, threadHint = false) {
  const normalized = cleanText(text)
  if (!normalized) return false
  if (MEAL_VERBS.test(normalized)) return true
  if (FINALISE_PATTERN.test(normalized) && (threadHint || state.items.length)) return true
  if (CORRECTION_PREFIX.test(normalized) && (threadHint || state.items.length)) return true
  if (threadHint && (hasDigits(normalized) || looksFoodishPhrase(normalized) || MEAL_REFERENCE_PATTERN.test(normalized) || looksLikeQuantityFragment(normalized))) return true
  if (state.items.length && (hasDigits(normalized) || MEAL_REFERENCE_PATTERN.test(normalized) || looksFoodishPhrase(normalized) || looksLikeQuantityFragment(normalized))) return true
  if (looksLikeQuantityFragment(normalized)) return true
  return false
}

function isExplicitMealStart(text) {
  const normalized = cleanText(text)
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
    exclusions: Array.isArray(item.exclusions) ? [...item.exclusions] : [],
    attachedTo: item.attachedTo || item.attached_to || null,
    relation: item.relation || "",
    sourceMessage: item.sourceMessage || "",
  }
}

function shouldContinueExistingSession(existingSession, currentMessage, recentMessages = []) {
  if (!existingSession?.active || !Array.isArray(existingSession.items) || !existingSession.items.length) return false
  const normalized = cleanText(currentMessage)
  if (!normalized) return false
  if (isExplicitMealStart(normalized)) return false
  if (hasDigits(normalized) || looksFoodishPhrase(normalized) || MEAL_REFERENCE_PATTERN.test(normalized) || CORRECTION_PREFIX.test(normalized) || FINALISE_PATTERN.test(normalized)) {
    return true
  }
  const lastAssistant = [...recentMessages].reverse().find((message) => message?.role === "assistant")
  return Boolean(lastAssistant && extractClarificationTargets(String(lastAssistant.content || "")).length)
}

function extractMealThread(recentMessages = [], currentMessage = "", existingSession = null) {
  const normalizedCurrent = cleanText(currentMessage)
  const history = Array.isArray(recentMessages) ? recentMessages.filter((entry) => typeof entry?.content === "string") : []
  const shouldTrack = isExplicitMealStart(normalizedCurrent)
    || looksFoodishPhrase(normalizedCurrent)
    || hasDigits(normalizedCurrent)
    || MEAL_REFERENCE_PATTERN.test(normalizedCurrent)
    || CORRECTION_PREFIX.test(normalizedCurrent)
    || FINALISE_PATTERN.test(normalizedCurrent)
    || shouldContinueExistingSession(existingSession, currentMessage, history)

  if (!shouldTrack) return []

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
  if (DRINK_KEYWORDS.some((keyword) => normalized.includes(keyword))) return "drink"
  if (INGREDIENT_KEYWORDS.some((keyword) => normalized.includes(keyword))) return "ingredient"
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
  if (/\bcoffee\b/.test(normalized)) return "coffee"
  if (/\btoast\b/.test(normalized) && /\brye\b/.test(normalized)) return "rye toast"
  if (/\btoast\b/.test(normalized)) return "toast"
  if (/\bapple juice\b/.test(normalized)) return "apple juice"
  if (/\bvegemite\b/.test(normalized)) return "vegemite"
  if (/\bbutter\b/.test(normalized)) return normalized.includes("salted") ? "salted butter" : normalized.includes("unsalted") ? "unsalted butter" : "butter"

  const words = normalized
    .split(" ")
    .filter((word) => word && !STOPWORDS.has(word) && !PREPARATION_WORDS.has(word) && !QUANTITY_UNITS.includes(word))
    .map((word) => singularize(word))

  if (!words.length) return fallback || normalized
  return words.slice(-2).join(" ")
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

function createItem({ label = "", baseName = "", quantity = null, category = "", preparation = [], exclusions = [], attachedTo = null, relation = "", sourceMessage = "" }) {
  const safeBaseName = baseName || deriveBaseName(label)
  const safeCategory = category || detectCategory(safeBaseName || label)
  return {
    key: cleanText(safeBaseName || label),
    label: titleCase(label || safeBaseName),
    baseName: safeBaseName,
    quantity,
    category: safeCategory,
    preparation,
    exclusions,
    attachedTo,
    relation,
    sourceMessage,
  }
}

function upsertItem(state, nextItem, { preferLast = true } = {}) {
  const key = cleanText(nextItem.baseName || nextItem.key || nextItem.label)
  if (!key) return false

  const index = state.items.findIndex((item) => {
    const existingKey = cleanText(item.baseName || item.key)
    const sameAttachment = cleanText(item.attachedTo || "") === cleanText(nextItem.attachedTo || "")
    return sameAttachment && (
      existingKey === key
      || existingKey.includes(key)
      || key.includes(existingKey)
    )
  })
  if (index === -1) {
    state.items.push(cloneItem({ ...nextItem, key }))
    if (nextItem.category === "food") state.lastMainKey = key
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
    exclusions: [...new Set([...(current.exclusions || []), ...(nextItem.exclusions || [])])],
    relation: nextItem.relation || current.relation,
    attachedTo: nextItem.attachedTo ?? current.attachedTo,
    sourceMessage: nextItem.sourceMessage || current.sourceMessage,
  }

  if (preferLast && nextItem.quantity) merged.quantity = nextItem.quantity
  state.items[index] = merged
  if (merged.category === "food") state.lastMainKey = key
  if (merged.category === "drink") state.lastDrinkKey = key
  return true
}

function splitClauses(message) {
  return normalizeLabel(message)
    .replace(/\b(?:also had|also ate|also drank)\b/g, ",")
    .replace(/\bplus\b/g, ",")
    .split(/,(?![^()]*\))/)
    .flatMap((segment) => segment.split(/\band\b/))
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
  const normalized = cleanText(text)
  if (looksFoodishPhrase(normalized) && !/\b(tea|coffee|milk|sugar|earl grey)\b/.test(normalized)) return false
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

function parseIngredientPhrase(text) {
  const normalized = normalizeLabel(text).replace(/^also\s+/, "")
  const relation = /\bcooked in\b|\bfried in\b|\bused to fry\b/.test(normalized)
    ? "cooked_in"
    : /\bwith\b|\bplus\b/.test(normalized)
      ? "with"
      : ""

  const source = normalized
    .replace(/^(?:cooked|cook|fried|used)\s+(?:in|to fry)\s+/, "")
    .replace(/^(?:with)\s+/, "")
    .trim()
  if (!source) return null

  const match = source.match(QUANTITY_PATTERN)
  if (match?.groups) {
    const foodLabel = match.groups.food || (normalizeUnit(match.groups.unit) === "egg" ? "eggs" : "")
    const item = createItem({
      label: foodLabel || match.groups.unit,
      baseName: deriveBaseName(foodLabel || match.groups.unit),
      quantity: buildQuantity(match.groups.amount, match.groups.unit, match.groups.intensity),
      category: "ingredient",
      preparation: source.includes("salted") ? ["salted"] : source.includes("unsalted") ? ["unsalted"] : [],
      relation,
      sourceMessage: text,
    })
    return item
  }

  if (source) {
    return createItem({
      label: source,
      baseName: deriveBaseName(source),
      category: "ingredient",
      relation,
      sourceMessage: text,
    })
  }
  return null
}

function parseMeasuredFoodClause(clause) {
  const normalized = normalizeLabel(clause)
  const cookedSplit = normalized.split(/\b(?:cooked in|fried in)\b/)
  const mainText = cookedSplit[0].trim()
  const ingredientText = cookedSplit[1]?.trim() || ""
  const withSplit = ingredientText ? [ingredientText] : normalized.split(/\bwith\b/)

  const quantityMatch = mainText.match(QUANTITY_PATTERN)
  const countedFoodMatch = quantityMatch ? null : mainText.match(new RegExp(`^(?<amount>\\d+(?:\\.\\d+)?|${[...QUANTITY_WORDS.keys()].join("|")})\\s+(?<preparation>fried|boiled|poached|scrambled|grilled|baked|toasted)?\\s*(?<food>[a-z][a-z\\s%-]+)$`, "i"))
  let item = null
  if (countedFoodMatch?.groups && looksFoodishPhrase(countedFoodMatch.groups.food)) {
    const quantity = {
      amount: toAmount(countedFoodMatch.groups.amount) || 1,
      unit: singularize(deriveBaseName(countedFoodMatch.groups.food).split(" ").at(-1) || "serve"),
      text: `${toAmount(countedFoodMatch.groups.amount) || 1} ${countedFoodMatch.groups.food}`.trim(),
      modifier: "",
    }
    item = createItem({
      label: countedFoodMatch.groups.food.trim(),
      baseName: deriveBaseName(countedFoodMatch.groups.food.trim()),
      quantity,
      preparation: countedFoodMatch.groups.preparation ? [cleanText(countedFoodMatch.groups.preparation)] : [],
      sourceMessage: clause,
    })
  } else if (quantityMatch?.groups) {
    const unit = normalizeUnit(quantityMatch.groups.unit)
    const quantity = buildQuantity(quantityMatch.groups.amount, quantityMatch.groups.unit, quantityMatch.groups.intensity)
    const rest = (quantityMatch.groups.food?.trim() || "").replace(/^not\s+\d+(?:\.\d+)?\b.*$/i, "").trim()
    const label = rest || (unit === "egg" ? "eggs" : unit)
    const preparation = []
    if (/\bfried\b/.test(normalized)) preparation.push("fried")
    if (/\bboiled\b/.test(normalized)) preparation.push("boiled")
    if (/\bpoached\b/.test(normalized)) preparation.push("poached")
    if (/\bgrilled\b/.test(normalized)) preparation.push("grilled")
    if (/\bbaked\b/.test(normalized)) preparation.push("baked")
    if (/\btoasted\b/.test(normalized)) preparation.push("toasted")
    if (/\bwholemeal\b/.test(normalized)) preparation.push("wholemeal")
    if (/\brye\b/.test(normalized)) preparation.push("rye")
    item = createItem({
      label: label || mainText,
      baseName: deriveBaseName(label || mainText),
      quantity,
      preparation,
      sourceMessage: clause,
    })
  } else {
    const contentWords = normalized
      .split(" ")
      .filter((word) => word && !STOPWORDS.has(word))
    if (!contentWords.length) return { item: null, attachedIngredient: null }
    item = createItem({
      label: contentWords.join(" "),
      baseName: deriveBaseName(contentWords.join(" ")),
      sourceMessage: clause,
    })
  }

  const attachedIngredient = cookedSplit[1]
    ? parseIngredientPhrase(`cooked in ${cookedSplit[1]}`)
    : withSplit.length > 1 && detectCategory(deriveBaseName(withSplit[1])) === "ingredient"
      ? parseIngredientPhrase(`with ${withSplit[1]}`)
      : null

  return { item, attachedIngredient }
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
    return false
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
  let changed = false
  state.items = state.items.map((item) => {
    if (item.category !== "ingredient" || item.attachedTo) return item
    changed = true
    return {
      ...item,
      attachedTo: targetBaseName,
      relation: item.relation || "cooked_in",
    }
  })
  return changed
}

function mergeClauseIntoState(state, clause) {
  const normalized = cleanText(clause)
  const normalizedWithoutAlso = normalized.replace(/^also\s+/, "")
  if (!normalized) return false

  let changed = false

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

  if (/^the\s+/.test(normalized)) {
    const baseName = deriveBaseName(normalized.replace(/^the\s+/, ""))
    if (baseName) {
      state.lastMainKey = baseName
      changed = attachLooseIngredientsToTarget(state, baseName) || changed
    }
    return changed
  }

  if (/^(?:used to fry|used for|for)\s+the\s+/.test(normalized)) {
    const baseName = deriveBaseName(normalized.replace(/^(?:used to fry|used for|for)\s+the\s+/, ""))
    if (baseName) {
      state.lastMainKey = baseName
      changed = attachLooseIngredientsToTarget(state, baseName) || changed
    }
    return changed
  }

  if (parseDrinkDetailOnly(state, clause)) return true

  const quantityOnly = parseQuantityOnly(normalized)
  if (quantityOnly) return assignQuantityToPendingItem(state, quantityOnly)

  if (/^(?:cooked|fried|used)\s+(?:in|to fry)\s+/.test(normalizedWithoutAlso)) {
    const ingredient = parseIngredientPhrase(normalizedWithoutAlso)
    if (ingredient) {
      const attachedTo = state.lastMainKey || state.items.find((item) => item.category !== "ingredient")?.baseName || ""
      changed = upsertItem(state, { ...ingredient, attachedTo, relation: ingredient.relation || "cooked_in" }) || changed
      return changed
    }
  }

  const { item, attachedIngredient } = parseMeasuredFoodClause(clause)
  if (item) {
    const nextItem = applyPendingQuantity(state, item)
    changed = upsertItem(state, nextItem, { preferLast: true }) || changed
  }
  if (attachedIngredient) {
    const targetBase = item?.baseName || state.lastMainKey || ""
    changed = upsertItem(state, { ...attachedIngredient, attachedTo: targetBase || attachedIngredient.attachedTo || "" }, { preferLast: true }) || changed
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

  let description = `${quantityText}${baseLabel}`.trim()
  if (mainItem.quantity?.unit === "egg" && cleanText(baseLabel) === "eggs") {
    description = mainItem.preparation?.length
      ? `${mainItem.quantity.amount} ${mainItem.preparation.join(" ")} eggs`
      : `${mainItem.quantity.amount} eggs`
  } else if (mainItem.preparation?.length) {
    const prep = mainItem.preparation.filter((word) => !description.toLowerCase().includes(word))
    if (prep.length) {
      const displayName = baseLabel.toLowerCase() === "eggs" ? "eggs" : baseLabel
      description = `${quantityText}${prep.join(" ")} ${displayName}`.trim()
    }
  }

  const attachedIngredients = state.items.filter((entry) => cleanText(entry.attachedTo || "") === cleanText(mainItem.baseName || mainItem.key))
  const cookedIn = attachedIngredients.filter((entry) => entry.relation === "cooked_in")
  if (cookedIn.length) {
    const ingredientText = cookedIn.map((entry) => describeIngredient(entry)).join(" and ")
    description = `${description} cooked in ${ingredientText}`
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
  for (const item of state.items.filter((entry) => !entry.attachedTo)) {
    if (!item.quantity && !itemShouldUseDefault(item, state)) {
      missing.push({ type: "quantity", item })
      continue
    }
    const needsCookingMedium = item.preparation?.includes("fried")
      && !state.items.some((entry) => cleanText(entry.attachedTo || "") === cleanText(item.baseName) && entry.relation === "cooked_in")
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
  const label = firstMissing.item.label || titleCase(firstMissing.item.baseName)
  if (firstMissing.type === "cooking_medium") return `What were the ${label.toLowerCase()} cooked in?`
  return `How much ${label.toLowerCase()} did you have?`
}

function detectMealIntent(turns = []) {
  return turns.some((turn) => /\b(log|track|save|add|include)\b/i.test(String(turn || "")))
    || turns.some((turn) => /\b(i had|had|i ate|ate|i drank|drank)\b/i.test(String(turn || "")))
}

function detectNutritionQuestion(turns = []) {
  return turns.some((turn) => /\b(calories|calorie|macro|macros|protein|carbs|fat|calculate)\b/i.test(String(turn || "")))
}

function seedStateFromExistingSession(state, existingSession) {
  if (!existingSession?.active || !Array.isArray(existingSession.items) || !existingSession.items.length) return
  state.items = existingSession.items.map((item) => toInternalItem(item))
  state.lastMainKey = cleanText(existingSession.lastMainKey || state.items.findLast?.((item) => item.category !== "ingredient")?.baseName || state.lastMainKey)
  state.lastDrinkKey = cleanText(existingSession.lastDrinkKey || state.items.findLast?.((item) => item.category === "drink")?.baseName || state.lastDrinkKey)
  state.clarificationAttempts = Math.max(0, Number(existingSession.clarificationAttempts) || 0)
  state.clarificationCounts = mergeClarificationCounts(state.clarificationCounts, existingSession.clarificationCounts || {})
  state.mealConversation = true
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
    mealConversation: false,
    lastMainKey: "",
    lastDrinkKey: "",
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
    lastMainKey: "",
    lastDrinkKey: "",
    mealConversation: false,
    shouldStopClarifying: false,
    readyToLog: false,
    missingItems: [],
    summary: "",
    clarifyQuestion: "",
    wantsLogging: false,
    wantsNutrition: false,
    currentMessage: String(currentMessage || ""),
  }

  if (!conversation.length) return state

  seedStateFromExistingSession(state, existingSession)
  state.clarificationAttempts = Math.max(state.clarificationAttempts, clarificationStats.total, Number(existingSession?.clarificationAttempts) || 0)
  state.clarificationCounts = mergeClarificationCounts(state.clarificationCounts, clarificationStats.counts)

  const userTurns = conversation.filter((entry) => entry?.role === "user").map((entry) => String(entry.content || ""))
  const threadHint = userTurns.some((turn) => MEAL_VERBS.test(turn) || looksFoodishPhrase(turn))
  state.wantsLogging = detectMealIntent(userTurns)
  state.wantsNutrition = detectNutritionQuestion(userTurns)

  for (const entry of conversation) {
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
  state.active = state.mealConversation
  state.threadTurns = conversation
  return state
}

export function mealStateNeedsClarification(mealState) {
  return Boolean(mealState?.mealConversation && !mealState.readyToLog && mealState.clarifyQuestion)
}

export function buildMealContext(recentMessages = [], currentMessage = "", existingSession = null) {
  const mealState = buildMealStateFromConversation(recentMessages, currentMessage, existingSession)
  if (!mealState.mealConversation) return null

  return {
    ...mealState,
    items: mealState.items.map((item) => ({
      base_name: item.baseName,
      label: item.label,
      category: item.category,
      quantity: item.quantity ? { ...item.quantity } : null,
      preparation: item.preparation,
      exclusions: item.exclusions,
      attached_to: item.attachedTo || null,
      relation: item.relation || null,
    })),
    thread_messages: mealState.threadTurns?.map((entry) => ({ role: entry.role, content: String(entry.content || "") })) || [],
  }
}
