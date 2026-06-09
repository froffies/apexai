import {
  buildDeterministicMealAction,
  estimateMealFromSession,
  safeArray,
  titleCase,
} from "./coachLoggingRules.mjs"

const PHOTO_CONFIDENCE_LEVELS = new Set(["high", "medium", "low"])
const PHOTO_VERIFIED_SOURCE_TYPES = new Set(["curated_au_catalogue", "nz_curated_catalogue"])
const PHOTO_DEFENSIBLE_SOURCE_TYPES = new Set(["curated_au_catalogue", "nz_curated_catalogue", "photo_dish_profile"])
const LOW_IMPACT_PHOTO_TERMS = ["lettuce", "tomato", "onion", "capsicum", "pickle", "mustard", "basil", "coriander", "sauce", "herb"]
const COUNT_WORD_MAP = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
}

function cleanText(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ")
}

function normalizeConfidence(value, fallback = "medium") {
  const normalized = cleanText(value).toLowerCase()
  return PHOTO_CONFIDENCE_LEVELS.has(normalized) ? normalized : fallback
}

function normalizeCategory(value = "") {
  const normalized = cleanText(value).toLowerCase()
  if (normalized === "drink" || normalized === "ingredient") return normalized
  return "food"
}

function normalizeQuantity(value = "", fallback = "1 serve") {
  const normalized = cleanText(value)
  return normalized || fallback
}

function normalizePreparation(value = "") {
  const normalized = cleanText(value)
  return normalized ? normalized.toLowerCase() : ""
}

function countFromToken(value = "") {
  const normalized = cleanText(value).toLowerCase()
  if (!normalized) return 0
  if (/^\d+$/.test(normalized)) return Number(normalized)
  return COUNT_WORD_MAP[normalized] || 0
}

function extractCountFromText(text = "") {
  const normalized = cleanText(text).toLowerCase()
  if (!normalized) return 0
  const match = normalized.match(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/)
  return countFromToken(match?.[1] || "")
}

function isGenericPhotoFoodName(value = "") {
  const normalized = cleanText(value).toLowerCase()
  return /^(?:\d+\s*)?item(?:\s+\d+)?$/.test(normalized) || normalized === "food" || normalized === "meal"
}

function deriveOverallPhotoConfidence(items = [], requestedValue = "") {
  const requested = normalizeConfidence(requestedValue, "")
  if (requested) return requested
  if (!items.length) return "low"
  if (items.every((item) => item.confidence === "high")) return "high"
  if (items.every((item) => item.confidence === "high" || item.confidence === "medium")) return "medium"
  return "low"
}

function buildQuantityPayload(value = "") {
  const text = normalizeQuantity(value, "")
  const match = text.match(/^(?<amount>\d+(?:\.\d+)?)\s*(?<unit>kg|g|oz|lb|lbs|pounds?|ml|l|tbsp|tablespoons?|tsp|teaspoons?|cups?|slices?|tins?|cans?|blocks?|bunch(?:es)?|serves?|servings?|bowls?|plates?|mugs?|eggs?)\b/i)
  if (!match?.groups) return { text }
  return {
    text,
    amount: Number(match.groups.amount),
    unit: String(match.groups.unit || "").trim().toLowerCase(),
  }
}

function stripLeadingArticle(value = "") {
  return cleanText(value).replace(/^(?:a|an|the)\s+/i, "")
}

function normalizePhotoFoodName(value = "") {
  return cleanText(value)
    .replace(/\bitem\s+\d+\b/gi, "")
    .replace(/^\d+\s*[\).\:-]\s*/g, "")
    .replace(/^(?:\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:(?:large|medium|small)\s+)?(?:(?:serves?|servings?|pieces?|slices?|bowls?|plates?|cups?|mugs?)\s+)?/i, "")
    .replace(/\s+/g, " ")
    .trim()
}

function inferPhotoFoodNameFromAssumptions(assumptions = []) {
  for (const assumption of assumptions) {
    const text = cleanText(assumption)
    if (!text) continue
    const onlyVisible = text.match(/^([A-Za-z][A-Za-z\s'-]+?)\s+is\s+the\s+only\s+item\s+visible\.?$/i)
    if (onlyVisible?.[1]) return cleanText(onlyVisible[1])
    const appearsToBe = text.match(/^(?:it|this|the food)\s+(?:looks like|appears to be)\s+([A-Za-z][A-Za-z\s'-]+?)[.]?$/i)
    if (appearsToBe?.[1]) return cleanText(appearsToBe[1])
  }
  return ""
}

function parseSimpleSummaryItem(summary = "", assumptions = []) {
  const text = cleanText(summary).replace(/[.!?]+$/g, "")
  if (!text) return null
  if (/\b(?:pizza|burger|cheeseburger|butter chicken|chicken curry|biryani|samosa|triangular pastries?|dosa|idli)\b/i.test(text)) {
    return null
  }
  if (/[,:]/.test(text) || /\b(?:with|and|served|accompanied|alongside|topped|featuring|plus)\b/i.test(text)) {
    return null
  }

  const singlePatterns = [
    /^(?:a\s+single|single|one|1)\s+([A-Za-z][A-Za-z\s'-]+)$/i,
    /^([A-Za-z][A-Za-z\s'-]+)$/i,
  ]
  for (const pattern of singlePatterns) {
    const match = text.match(pattern)
    if (!match?.[1]) continue
    const inferredName = normalizePhotoFoodName(match[1])
    if (!inferredName) continue
    return {
      id: "photo_item_1",
      name: titleCase(stripLeadingArticle(inferredName)),
      base_name: singularizeFoodName(inferredName),
      quantity: /^(?:a\s+single|single|one|1)\b/i.test(text) ? `1 ${singularizeFoodName(inferredName)}` : "1 serve",
      preparation: "",
      category: "food",
      confidence: assumptions.length ? "medium" : "low",
      notes: "Recovered from summary text.",
    }
  }
  return null
}

function defaultQuantityForSummaryTerm(term = "", summaryText = "") {
  const normalized = cleanText(term).toLowerCase()
  const summary = cleanText(summaryText).toLowerCase()
  const count = extractCountFromText(summary)
  if (!normalized) return "1 serve"
  if (/^\d/.test(normalized)) return normalized
  if (normalized.includes("burger with fries")) return count > 1 ? `${count} burgers + fries` : "1 burger + small fries"
  if (normalized.includes("burger")) return count > 1 ? `${count} burgers` : "1 burger"
  if (normalized.includes("bun")) return "1 bun"
  if (normalized.includes("patty")) return "1 patty"
  if (normalized.includes("pizza")) {
    const sliceMatch = summary.match(/(\d+)\s*slices?\b/i)
    if (sliceMatch) return `${sliceMatch[1]} slices`
    return count > 1 ? `${count} slices` : "2 slices"
  }
  if (normalized.includes("fries") || normalized.includes("chips")) return "1 small serve"
  if (normalized.includes("samosa")) {
    const countMatch = summary.match(/(\d+)\s*(?:pieces?|samosas?)\b/i)
    if (countMatch) return `${countMatch[1]} pieces`
    return count > 1 ? `${count} pieces` : "1 serve"
  }
  if (normalized.includes("bacon")) return "2 slices"
  if (normalized.includes("cheese")) return normalized.includes("grated") ? "15g" : "1 slice"
  if (normalized.includes("lettuce")) return "1 leaf"
  if (normalized.includes("tomato sauce")) return "125g"
  if (normalized.includes("tomato")) return normalized.includes("cherry") ? "100g" : "2 slices"
  if (normalized.includes("onion")) return "2 slices"
  if (normalized.includes("capsicum")) return "2 slices"
  if (normalized.includes("pickle")) return "4 slices"
  if (normalized.includes("mustard")) return "1 teaspoon"
  if (normalized.includes("basil")) return "5g"
  if (normalized.includes("coriander")) return "10g"
  if (normalized.includes("naan")) return "1 piece"
  if (normalized.includes("pasta") || normalized.includes("spaghetti") || normalized.includes("fettuccine")) return "200g"
  if (normalized.includes("rice")) return "200g"
  if (normalized.includes("yoghurt") || normalized.includes("yogurt")) return "100g"
  if (normalized.includes("chicken curry") || normalized.includes("butter chicken") || normalized.includes("chicken in sauce")) return "200g"
  if (normalized.includes("biryani")) return "1 bowl"
  if (normalized.includes("dosa")) return "1 serve"
  if (normalized.includes("idli")) return "1 serve"
  return "1 serve"
}

function parseNamedPhotoDishFromSummary(summary = "", assumptions = [], confidence = "low") {
  const text = cleanText(summary).replace(/[.!?]+$/g, "")
  if (!text) return null

  const normalized = text.toLowerCase()
  const rule = [
    {
      pattern: /\b(?:pepperoni\s+)?pizza\b/i,
      resolveName() {
        return normalized.includes("pepperoni") ? "pepperoni pizza" : "pizza"
      },
    },
    {
      pattern: /\bcheeseburger\b/i,
      resolveName() {
        return normalized.includes("fries") ? "cheeseburger with fries" : "cheeseburger"
      },
    },
    {
      pattern: /\bburger\b/i,
      resolveName() {
        if (normalized.includes("fries")) return "burger with fries"
        if (normalized.includes("wholemeal burger")) return "wholemeal burger"
        return "burger"
      },
    },
    {
      pattern: /\bbutter chicken\b/i,
      resolveName() {
        return normalized.includes("rice") ? "butter chicken with rice" : "butter chicken"
      },
    },
    {
      pattern: /\bchicken curry\b/i,
      resolveName() {
        return normalized.includes("rice") ? "chicken curry with rice" : "chicken curry"
      },
    },
    {
      pattern: /\bbiryani\b/i,
      resolveName() {
        if (normalized.includes("vegetable") || normalized.includes("veg")) return "veg biryani"
        if (normalized.includes("chicken")) return "chicken biryani"
        return "biryani"
      },
    },
    {
      pattern: /\b(?:deep\s+fried\s+|fried\s+)?(?:samosa(?:s)?|triangular pastries?)\b/i,
      resolveName() {
        return "samosas"
      },
    },
    {
      pattern: /\bdosa(?:s)?\b/i,
      resolveName() {
        return "dosa"
      },
    },
    {
      pattern: /\bidli(?:s)?\b/i,
      resolveName() {
        return normalized.includes("sambar") ? "idli with sambar" : "idli"
      },
    },
  ].find((candidate) => candidate.pattern.test(normalized))

  if (!rule) return null

  const name = cleanText(rule.resolveName())
  if (!name) return null

  return {
    id: "photo_item_1",
    name: titleCase(name),
    base_name: singularizeFoodName(name),
    quantity: defaultQuantityForSummaryTerm(name, text),
    preparation: "",
    category: "food",
    confidence: normalizeConfidence(confidence, assumptions.length ? "medium" : "low"),
    notes: "Recovered plated dish from summary text.",
  }
}

function parseCompositeSummaryItems(summary = "", assumptions = []) {
  const text = cleanText(summary).replace(/[.!?]+$/g, "")
  if (!text) return []

  const normalized = text
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/^(?:plate|bowl|glass|cup|serving|serve)\s+of\s+/i, "")
    .replace(/^(?:a|an)\s+(?:plate|bowl|glass|cup|serving|serve)\s+of\s+/i, "")
    .replace(/\b(?:accompanied by|served with|topped with|with a side of|with)\b/gi, ",")
    .replace(/\s+\band\b\s+/gi, ", ")

  const parts = normalized
    .split(",")
    .map((part) => normalizePhotoFoodName(part))
    .map((part) => stripLeadingArticle(part))
    .map((part) => part.replace(/^(?:some|side of|portion of)\s+/i, "").trim())
    .filter(Boolean)
    .filter((part) => !/^(?:meal|food|plate|bowl|glass|cup)$/i.test(part))

  if (parts.length < 2) return []

  return parts.slice(0, 8).map((part, index) => {
    const quantity = defaultQuantityForSummaryTerm(part, text)
    return {
      id: `photo_item_${index + 1}`,
      name: titleCase(stripLeadingArticle(part)),
      base_name: singularizeFoodName(part),
      quantity,
      preparation: "",
      category: normalizeCategory(/(?:sauce|mustard|basil|coriander)/i.test(part) ? "ingredient" : "food"),
      confidence: assumptions.length ? "medium" : "low",
      notes: "Recovered from complex summary text.",
    }
  }).filter((item) => item.base_name)
}

function singularizeFoodName(value = "") {
  const normalized = stripLeadingArticle(value).toLowerCase()
  if (!normalized) return ""
  if (normalized.endsWith("fries")) return normalized
  if (normalized.endsWith("ies")) return `${normalized.slice(0, -3)}y`
  if (normalized.endsWith("ses")) return normalized.slice(0, -2)
  if (normalized.endsWith("s") && !normalized.endsWith("ss")) return normalized.slice(0, -1)
  return normalized
}

function buildItemLabel(item) {
  const quantity = normalizeQuantity(item.quantity, "")
  const preparation = normalizePreparation(item.preparation)
  const lowerName = cleanText(item.name).toLowerCase()
  if (!quantity) return [preparation, lowerName].filter(Boolean).join(" ").trim()
  if (!lowerName) return [quantity, preparation].filter(Boolean).join(" ").trim()

  const quantityLower = quantity.toLowerCase()
  if (quantityLower.includes(lowerName)) {
    if (!preparation || quantityLower.includes(preparation)) return quantity
    return quantity.replace(new RegExp(`\\b${lowerName}\\b`, "i"), `${preparation} ${lowerName}`)
  }

  return [quantity, preparation, lowerName].filter(Boolean).join(" ").trim()
}

function buildMealSummary(items, fallback = "") {
  const labels = items.map((item) => buildItemLabel(item)).filter(Boolean)
  if (labels.length) return labels.join(", plus ")
  return cleanText(fallback)
}

function buildPhotoSourceSummary(breakdown = [], confidence = "low") {
  const sources = [...new Set(
    breakdown.map((item) => cleanText(item.source)).filter(Boolean)
  )]

  if (confidence === "high") {
    return sources.length
      ? `AI plate-photo estimate cross-checked against trusted nutrition references: ${sources.join(" | ")}`
      : "AI plate-photo estimate cross-checked against trusted nutrition references."
  }

  if (confidence === "medium") {
    return sources.length
      ? `AI plate-photo estimate cross-checked against matched nutrition references and curated dish profiles: ${sources.join(" | ")}`
      : "AI plate-photo estimate cross-checked against matched nutrition references and curated dish profiles."
  }

  return sources.length
    ? `AI plate-photo estimate using visible-food identification and internal AU/NZ nutrition fallbacks. Review before saving. Sources checked: ${sources.join(" | ")}`
    : "AI plate-photo estimate using visible-food identification and internal AU/NZ nutrition fallbacks. Review before saving."
}

function deriveMacroConfidence(breakdown = []) {
  if (!breakdown.length) return "low"
  if (breakdown.every((item) => PHOTO_VERIFIED_SOURCE_TYPES.has(item.source_type))) return "high"
  if (breakdown.every((item) => PHOTO_DEFENSIBLE_SOURCE_TYPES.has(item.source_type))) return "medium"
  if (breakdown.every((item) => item.source_type && item.source_type !== "estimated_internal_profile")) return "medium"
  return "low"
}

function isLowImpactEstimatedPhotoItem(item = {}) {
  if (String(item.source_type || "").trim() !== "estimated_internal_profile") return false
  const name = cleanText(item.name || item.matched_food_name || "").toLowerCase()
  const category = cleanText(item.category || "").toLowerCase()
  const calories = Number(item.calories || 0)
  return (
    calories <= 35
    && (category === "ingredient" || category === "produce" || LOW_IMPACT_PHOTO_TERMS.some((term) => name.includes(term)))
  )
}

function canAutofillPhotoEstimate(analysis, breakdown = [], macroConfidence = "low") {
  if (analysis?.needs_clarification || !breakdown.length) return false
  if (String(analysis?.overall_confidence || "").trim().toLowerCase() === "low") return false
  if (macroConfidence === "high") return true
  const substantiveItems = breakdown.filter((item) => !isLowImpactEstimatedPhotoItem(item))
  if (!substantiveItems.length) return false
  return substantiveItems.every((item) => PHOTO_DEFENSIBLE_SOURCE_TYPES.has(String(item.source_type || "").trim()))
}

function buildPhotoDishClusterText(analysis = {}, breakdown = []) {
  return [
    cleanText(analysis.summary || ""),
    cleanText(analysis.portion || ""),
    ...safeArray(analysis.items, 12).flatMap((item) => [item?.name, item?.base_name, item?.notes]),
    ...safeArray(analysis.assumptions, 8),
    ...safeArray(breakdown, 12).flatMap((item) => [item?.name, item?.matched_food_name]),
  ]
    .map((value) => cleanText(value).toLowerCase())
    .filter(Boolean)
    .join(" ")
}

function inferPhotoDishCluster(analysis = {}, breakdown = []) {
  const text = buildPhotoDishClusterText(analysis, breakdown)
  if (!text) return ""

  if ((/\bburger\b|\bhamburger\b/.test(text) || /\bpatty\b/.test(text)) && /\bbun\b/.test(text)) {
    return /\bfries\b|\bchips\b/.test(text) ? "burger with fries" : "burger"
  }

  if (/\bpizza\b/.test(text) || ((/\bcheese\b/.test(text) || /\bpepperoni\b/.test(text)) && /\bslices?\b/.test(text))) {
    return "pizza"
  }

  if (/\bsamosa\b/.test(text) || /\bpastry triangles?\b/.test(text) || /\btriangular pastries?\b/.test(text)) {
    return "samosas"
  }

  if (/\bbiryani\b/.test(text) || (/\brice\b/.test(text) && /\bfried onions?\b/.test(text) && /\byoghurt\b/.test(text) && /\bcurry\b/.test(text))) {
    return "biryani"
  }

  if (/\bcurry\b/.test(text) && /\bchicken\b/.test(text) && (/\bnaan\b/.test(text) || /\bflatbread\b/.test(text) || /\brice\b/.test(text))) {
    return /\brice\b/.test(text) ? "butter chicken with rice" : "chicken curry"
  }

  return ""
}

async function buildPhotoDishRescueEstimate(analysis, lookupFoods, mealType) {
  const rescueTerm = inferPhotoDishCluster(analysis)
  if (!rescueTerm) return null

  const rescueMatches = await lookupFoods(rescueTerm)
  if (!rescueMatches.length) return null

  const rescueQuantity = defaultQuantityForSummaryTerm(rescueTerm, analysis.summary || analysis.portion || "")
  const rescueItem = {
    label: buildItemLabel({
      name: titleCase(rescueTerm),
      quantity: rescueQuantity,
      preparation: "",
    }),
    baseName: singularizeFoodName(rescueTerm),
    base_name: singularizeFoodName(rescueTerm),
    quantity: buildQuantityPayload(rescueQuantity),
    category: "food",
    exclusions: [],
  }
  const rescueSession = {
    readyToLog: true,
    wantsLogging: true,
    summary: analysis.summary || rescueItem.label,
    items: [rescueItem],
  }
  const rescueCandidateFoodMatches = {
    [rescueItem.base_name]: rescueMatches,
    [String(rescueItem.label || "").toLowerCase()]: rescueMatches,
  }
  const rescueBreakdownEstimate = estimateMealFromSession(rescueSession, rescueCandidateFoodMatches)
  const rescueMacroConfidence = deriveMacroConfidence(rescueBreakdownEstimate.items)
  const rescueCanAutofill = canAutofillPhotoEstimate(analysis, rescueBreakdownEstimate.items, rescueMacroConfidence)
  if (!rescueCanAutofill) return null

  const rescueAction = buildDeterministicMealAction({
    mealSession: rescueSession,
    explicitActions: [{
      type: "log_meal",
      meal_type: mealType,
      quantity: analysis.portion,
      estimated: true,
    }],
    prompt: analysis.summary || rescueItem.label,
    candidateFoodMatches: rescueCandidateFoodMatches,
    allowLooseEstimate: true,
  })
  const rescueSource = buildPhotoSourceSummary(rescueBreakdownEstimate.items, rescueMacroConfidence)

  return {
    action: rescueAction
      ? {
          ...rescueAction,
          estimated: true,
          nutrition_source: rescueSource,
          nutrition_source_type: "photo_ai_estimate",
          macro_confidence: rescueMacroConfidence,
          macro_breakdown: rescueBreakdownEstimate.items,
        }
      : null,
    breakdown: rescueBreakdownEstimate.items.map((item) => sanitizePhotoBreakdownItem(item, true)),
    can_autofill: true,
    macro_confidence: rescueMacroConfidence,
    nutrition_source: rescueSource,
    needs_review: false,
  }
}

function sanitizePhotoBreakdownItem(item = {}, includeMacros = false) {
  const safeItem = {
    name: String(item.name || "").trim(),
    quantity: String(item.quantity || "").trim(),
    category: String(item.category || "").trim(),
    matched_food_name: String(item.matched_food_name || "").trim(),
    source: String(item.source || "").trim(),
    source_type: String(item.source_type || "").trim(),
    estimated: Boolean(item.estimated),
  }

  if (includeMacros) {
    safeItem.calories = Number(item.calories || 0)
    safeItem.protein_g = Number(item.protein_g || 0)
    safeItem.carbs_g = Number(item.carbs_g || 0)
    safeItem.fat_g = Number(item.fat_g || 0)
  }

  return safeItem
}

export function normalizeFoodPhotoAnalysis(raw = {}) {
  const value = raw && typeof raw === "object" ? raw : {}
  const assumptions = safeArray(value.assumptions, 8).map((entry) => cleanText(entry)).filter(Boolean)
  const inferredFoodName = inferPhotoFoodNameFromAssumptions(assumptions)
  const rawItems = safeArray(value.items, 12)
  const recoveryConfidence = deriveOverallPhotoConfidence(
    rawItems.map((item) => ({ confidence: normalizeConfidence(item?.confidence, "medium") })),
    value.overall_confidence
  )
  const items = rawItems
    .map((item, index) => {
      const candidateName = normalizePhotoFoodName(item?.name || item?.label || `Item ${index + 1}`)
      const normalizedName = candidateName && !isGenericPhotoFoodName(candidateName)
        ? candidateName
        : inferredFoodName || candidateName
      const name = titleCase(stripLeadingArticle(normalizedName))
      const preparation = normalizePreparation(item?.preparation || item?.cooking_method || "")
      const quantity = normalizeQuantity(item?.quantity || item?.quantity_text || item?.portion || "1 serve")
      return {
        id: `photo_item_${index + 1}`,
        name,
        base_name: singularizeFoodName(name),
        quantity,
        preparation,
        category: normalizeCategory(item?.category),
        confidence: normalizeConfidence(item?.confidence, "medium"),
        notes: cleanText(item?.notes || ""),
      }
    })
    .filter((item) => item.base_name)
  const recoveredDishItem = !items.length ? parseNamedPhotoDishFromSummary(value.summary || "", assumptions, recoveryConfidence) : null
  const recoveredSummaryItem = !items.length && !recoveredDishItem ? parseSimpleSummaryItem(value.summary || "", assumptions) : null
  const recoveredCompositeItems = !items.length && !recoveredSummaryItem && !recoveredDishItem ? parseCompositeSummaryItems(value.summary || "", assumptions) : []
  const summaryExpandedItems = items.length === 1 ? parseCompositeSummaryItems(value.summary || "", assumptions) : []
  const normalizedItems = recoveredSummaryItem
    ? [recoveredSummaryItem]
    : recoveredDishItem
      ? [recoveredDishItem]
    : recoveredCompositeItems.length
      ? recoveredCompositeItems
      : (summaryExpandedItems.length > 1 ? summaryExpandedItems : items)

  const summary = buildMealSummary(normalizedItems, value.summary || "")
  const portion = normalizeQuantity(value.portion || value.serving || "1 plate", "1 plate")

  return {
    summary,
    portion,
    items: normalizedItems,
    overall_confidence: deriveOverallPhotoConfidence(normalizedItems, value.overall_confidence),
    needs_clarification: Boolean(value.needs_clarification && normalizedItems.length > 0),
    clarification_question: cleanText(value.clarification_question || ""),
    assumptions,
  }
}

export async function buildFoodPhotoEstimate(raw = {}, options = {}) {
  const analysis = normalizeFoodPhotoAnalysis(raw)
  if (!analysis.items.length) {
    return {
      analysis,
      action: null,
      breakdown: [],
      macro_confidence: "low",
      needs_review: true,
      clarification_question: analysis.clarification_question || "I couldn't confidently identify the foods in that photo yet. Try another angle or tell me what is on the plate.",
      assumptions: analysis.assumptions,
    }
  }

  const lookupFoods = typeof options.lookupFoods === "function" ? options.lookupFoods : async () => []
  const mealType = cleanText(options.mealType || "").toLowerCase()
  const candidateFoodMatches = {}

  for (const item of analysis.items) {
    const terms = [...new Set([item.base_name, `${item.preparation} ${item.base_name}`.trim()].filter(Boolean))]
    for (const term of terms) {
      if (!candidateFoodMatches[term]) {
        candidateFoodMatches[term] = await lookupFoods(term)
      }
    }
  }

  const mealSession = {
    readyToLog: true,
    wantsLogging: true,
    summary: analysis.summary,
    items: analysis.items.map((item) => ({
      label: buildItemLabel(item),
      baseName: item.base_name,
      base_name: item.base_name,
      quantity: buildQuantityPayload(item.quantity),
      category: item.category,
      exclusions: [],
    })),
  }

  const breakdownEstimate = estimateMealFromSession(mealSession, candidateFoodMatches)
  const macroConfidence = deriveMacroConfidence(breakdownEstimate.items)
  let canAutofill = canAutofillPhotoEstimate(analysis, breakdownEstimate.items, macroConfidence)
  let action = null
  let safeBreakdown = breakdownEstimate.items.map((item) => sanitizePhotoBreakdownItem(item, canAutofill))
  let source = buildPhotoSourceSummary(breakdownEstimate.items, macroConfidence)

  if (!canAutofill) {
    const rescue = await buildPhotoDishRescueEstimate(analysis, lookupFoods, mealType)
    if (rescue) {
      return {
        analysis,
        action: rescue.action,
        breakdown: rescue.breakdown,
        can_autofill: rescue.can_autofill,
        macro_confidence: rescue.macro_confidence,
        nutrition_source: rescue.nutrition_source,
        needs_review: rescue.needs_review,
        clarification_question: analysis.clarification_question || "",
        assumptions: analysis.assumptions,
      }
    }
  }

  const needsReview = !canAutofill
  action = canAutofill
    ? buildDeterministicMealAction({
        mealSession,
        explicitActions: [{
          type: "log_meal",
          meal_type: mealType,
          quantity: analysis.portion,
          estimated: true,
        }],
        prompt: analysis.summary,
        candidateFoodMatches,
        allowLooseEstimate: true,
      })
    : null

  return {
    analysis,
    action: action
      ? {
          ...action,
          estimated: true,
          nutrition_source: source,
          nutrition_source_type: "photo_ai_estimate",
          macro_confidence: macroConfidence,
          macro_breakdown: breakdownEstimate.items,
        }
      : null,
    breakdown: safeBreakdown,
    can_autofill: canAutofill,
    macro_confidence: macroConfidence,
    nutrition_source: source,
    needs_review: needsReview,
    clarification_question: analysis.clarification_question || (needsReview ? "I identified the foods, but the macros still need review before you save this." : ""),
    assumptions: analysis.assumptions,
  }
}
