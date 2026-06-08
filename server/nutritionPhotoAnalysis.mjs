import {
  buildDeterministicMealAction,
  estimateMealFromSession,
  safeArray,
  titleCase,
} from "./coachLoggingRules.mjs"

const PHOTO_CONFIDENCE_LEVELS = new Set(["high", "medium", "low"])
const PHOTO_VERIFIED_SOURCE_TYPES = new Set(["curated_au_catalogue", "nz_curated_catalogue"])

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

function singularizeFoodName(value = "") {
  const normalized = stripLeadingArticle(value).toLowerCase()
  if (!normalized) return ""
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
      ? `AI plate-photo estimate cross-checked against matched nutrition references and product labels: ${sources.join(" | ")}`
      : "AI plate-photo estimate cross-checked against matched nutrition references and product labels."
  }

  return sources.length
    ? `AI plate-photo estimate using visible-food identification and internal AU/NZ nutrition fallbacks. Review before saving. Sources checked: ${sources.join(" | ")}`
    : "AI plate-photo estimate using visible-food identification and internal AU/NZ nutrition fallbacks. Review before saving."
}

function deriveMacroConfidence(breakdown = []) {
  if (!breakdown.length) return "low"
  if (breakdown.every((item) => PHOTO_VERIFIED_SOURCE_TYPES.has(item.source_type))) return "high"
  if (breakdown.every((item) => item.source_type && item.source_type !== "estimated_internal_profile")) return "medium"
  return "low"
}

export function normalizeFoodPhotoAnalysis(raw = {}) {
  const value = raw && typeof raw === "object" ? raw : {}
  const items = safeArray(value.items, 12)
    .map((item, index) => {
      const name = titleCase(stripLeadingArticle(item?.name || item?.label || `Item ${index + 1}`))
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

  const summary = buildMealSummary(items, value.summary || "")
  const portion = normalizeQuantity(value.portion || value.serving || "1 plate", "1 plate")

  return {
    summary,
    portion,
    items,
    overall_confidence: deriveOverallPhotoConfidence(items, value.overall_confidence),
    needs_clarification: Boolean(value.needs_clarification),
    clarification_question: cleanText(value.clarification_question || ""),
    assumptions: safeArray(value.assumptions, 8).map((entry) => cleanText(entry)).filter(Boolean),
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
  const action = buildDeterministicMealAction({
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

  const needsReview = analysis.needs_clarification || analysis.overall_confidence !== "high" || macroConfidence !== "high"
  const source = buildPhotoSourceSummary(breakdownEstimate.items, macroConfidence)

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
    breakdown: breakdownEstimate.items,
    macro_confidence: macroConfidence,
    needs_review: needsReview,
    clarification_question: analysis.clarification_question || (needsReview ? "Review the foods and portions before saving." : ""),
    assumptions: analysis.assumptions,
  }
}
