import {
  buildDeterministicMealAction,
  estimateMealFromSession,
  safeArray,
  titleCase,
} from "./coachLoggingRules.mjs"
import { roundMacro } from "../src/lib/nutritionHelpers.js"

const PHOTO_CONFIDENCE_LEVELS = new Set(["high", "medium", "low"])
const PHOTO_VERIFIED_SOURCE_TYPES = new Set(["curated_au_catalogue", "nz_curated_catalogue"])
const PHOTO_DEFENSIBLE_SOURCE_TYPES = new Set(["curated_au_catalogue", "nz_curated_catalogue", "photo_dish_profile"])
const LOW_IMPACT_PHOTO_TERMS = ["lettuce", "tomato", "onion", "capsicum", "pickle", "mustard", "basil", "coriander", "sauce", "herb"]
const PHOTO_REVIEW_SIGNAL_TERMS = ["sauce", "dressing", "gravy", "aioli", "mayo", "mayonnaise", "dip", "dipping", "drizzle", "coated", "smothered", "platter", "shared", "sampler", "combo", "buffet"]
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

function trimText(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ")
}

function normalizeConfidence(value, fallback = "medium") {
  const normalized = trimText(value).toLowerCase()
  return PHOTO_CONFIDENCE_LEVELS.has(normalized) ? normalized : fallback
}

function normalizeCategory(value = "") {
  const normalized = trimText(value).toLowerCase()
  if (normalized === "drink" || normalized === "ingredient") return normalized
  return "food"
}

function normalizeQuantity(value = "", fallback = "1 serve") {
  const normalized = trimText(value)
  return normalized || fallback
}

function normalizePreparation(value = "") {
  const normalized = trimText(value)
  return normalized ? normalized.toLowerCase() : ""
}

function countFromToken(value = "") {
  const normalized = trimText(value).toLowerCase()
  if (!normalized) return 0
  if (/^\d+$/.test(normalized)) return Number(normalized)
  return COUNT_WORD_MAP[normalized] || 0
}

function extractCountFromText(text = "") {
  const normalized = trimText(text).toLowerCase()
  if (!normalized) return 0
  const match = normalized.match(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/)
  return countFromToken(match?.[1] || "")
}

function isGenericPhotoFoodName(value = "") {
  const normalized = trimText(value).toLowerCase()
  return /^(?:\d+\s*)?item(?:\s+\d+)?$/.test(normalized)
    || normalized === "food"
    || normalized === "meal"
    || /^(?:food|dish|meal|snack|drink)\s+item(?:\s+\d+)?$/.test(normalized)
    || /^(?:(?:fried|grilled|baked|cooked|prepared|mixed|assorted|main|side|visible|plated)\s+)?(?:food|dish|meal|item)s?$/.test(normalized)
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
  return trimText(value).replace(/^(?:a|an|the)\s+/i, "")
}

function normalizePhotoFoodName(value = "") {
  return trimText(value)
    .replace(/\bitem\s+\d+\b/gi, "")
    .replace(/^\d+\s*[\).\:-]\s*/g, "")
    .replace(/^(?:\d+(?:\.\d+)?\s*(?:kg|g|oz|lb|lbs|pounds?|ml|l|cups?|bowls?|plates?|mugs?|tablespoons?|tbsp|teaspoons?|tsp|serves?|servings?|pieces?|piece|slices?|sprigs?)?|\b(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve))\s+(?:(?:large|medium|small)\s+)?/i, "")
    .replace(/^(?:of\s+)/i, "")
    .replace(/^(?:sprig|sprigs|piece|pieces|serve|serving|portion|cup|cups|bowl|bowls|plate|plates|glass|mug|tablespoon|tablespoons|tbsp|teaspoon|teaspoons|tsp)\s+of\s+/i, "")
    .replace(/\b(\w+)\s+\1\b/gi, "$1")
    .replace(/\s+/g, " ")
    .trim()
}

function inferPhotoFoodNameFromAssumptions(assumptions = []) {
  for (const assumption of assumptions) {
    const text = trimText(assumption)
    if (!text) continue
    const onlyVisible = text.match(/^([A-Za-z][A-Za-z\s'-]+?)\s+is\s+the\s+only\s+item\s+visible\.?$/i)
    if (onlyVisible?.[1]) return trimText(onlyVisible[1])
    const appearsToBe = text.match(/^(?:it|this|the food)\s+(?:looks like|appears to be)\s+([A-Za-z][A-Za-z\s'-]+?)[.]?$/i)
    if (appearsToBe?.[1]) return trimText(appearsToBe[1])
  }
  return ""
}

function parseSimpleSummaryItem(summary = "", assumptions = []) {
  const text = trimText(summary).replace(/[.!?]+$/g, "")
  if (!text) return null
  if (/\b(?:pizza|burger|cheeseburger|butter chicken|chicken curry|biryani|samosa|triangular pastries?|dosa|idli|caesar salad|halloumi salad|poke bowl|burrito bowl|breakfast burrito|pad thai|laksa|ramen|pho|tacos?|kebab|souvlaki|gyro|hsp|halal snack pack|dumplings?|gyoza|wontons?|dim sims?|schnitzel|fish and chips|fish & chips|fried chicken and chips|roast chicken meal|banh mi|hand roll|meat pie|sausage roll)\b/i.test(text)) {
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
  const normalized = trimText(term).toLowerCase()
  const summary = trimText(summaryText).toLowerCase()
  const count = extractCountFromText(summary)
  if (!normalized) return "1 serve"
  if (/^\d/.test(normalized)) return normalized
  if (normalized.includes("caesar salad")) return "1 bowl"
  if (normalized.includes("halloumi salad")) return "1 bowl"
  if (normalized.includes("poke bowl")) return "1 bowl"
  if (normalized.includes("burrito bowl")) return "1 bowl"
  if (normalized.includes("breakfast burrito")) return "1 burrito"
  if (normalized.includes("burger with fries")) return count > 1 ? `${count} burgers + fries` : "1 burger + small fries"
  if (normalized.includes("burger")) return count > 1 ? `${count} burgers` : "1 burger"
  if (normalized.includes("pad thai")) return "1 plate"
  if (normalized.includes("ramen") || normalized.includes("pho") || normalized.includes("laksa")) return "1 bowl"
  if (normalized.includes("kebab") || normalized.includes("souvlaki") || normalized.includes("gyro")) return "1 wrap"
  if (normalized.includes("hsp") || normalized.includes("halal snack pack")) return "1 tray"
  if (normalized.includes("banh mi")) return "1 roll"
  if (normalized.includes("fish and chips") || normalized.includes("fish & chips")) return "1 plate"
  if (normalized.includes("fried chicken and chips")) return "1 box"
  if (normalized.includes("roast chicken meal")) return "1 plate"
  if (normalized.includes("meat pie")) return "1 pie"
  if (normalized.includes("sausage roll")) return "1 roll"
  if (normalized.includes("sushi hand roll")) return count > 1 ? `${count} hand rolls` : "1 hand roll"
  if (normalized.includes("taco")) {
    const countMatch = summary.match(/(\d+)\s*tacos?\b/i)
    if (countMatch) return `${countMatch[1]} tacos`
    return count > 1 ? `${count} tacos` : "2 tacos"
  }
  if (normalized.includes("dumpling") || normalized.includes("gyoza") || normalized.includes("wonton")) {
    const countMatch = summary.match(/(\d+)\s*(?:dumplings?|gyoza|wontons?)\b/i)
    if (countMatch) return `${countMatch[1]} pieces`
    return count > 1 ? `${count} pieces` : "6 pieces"
  }
  if (normalized.includes("dim sim")) {
    const countMatch = summary.match(/(\d+)\s*dim\s*sims?\b/i)
    if (countMatch) return `${countMatch[1]} pieces`
    return count > 1 ? `${count} pieces` : "4 pieces"
  }
  if (normalized.includes("schnitzel")) return summary.includes("chips") || summary.includes("fries") ? "1 plate" : "1 schnitzel"
  if (normalized.includes("pasta with tomato sauce")) return "1 plate"
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
  if (normalized.includes("butter chicken with rice") || normalized.includes("chicken curry with rice")) return "1 bowl"
  if (normalized.includes("chicken curry") || normalized.includes("butter chicken") || normalized.includes("chicken in sauce")) return "200g"
  if (normalized.includes("biryani")) return "1 bowl"
  if (normalized.includes("dosa")) return "1 serve"
  if (normalized.includes("idli")) return "1 serve"
  return "1 serve"
}

function parseNamedPhotoDishFromSummary(summary = "", assumptions = [], confidence = "low") {
  const text = trimText(summary).replace(/[.!?]+$/g, "")
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
      pattern: /\bcaesar salad\b/i,
      resolveName() {
        return normalized.includes("chicken") ? "chicken caesar salad" : "caesar salad"
      },
    },
    {
      pattern: /\b(?:avocado toast|avo toast|smashed avo(?:cado)?(?: on)? toast)\b/i,
      resolveName() {
        return "avocado toast"
      },
    },
    {
      pattern: /\bsteak (?:sandwich|sanga)\b/i,
      resolveName() {
        return "steak sandwich"
      },
    },
    {
      pattern: /\b(?:chicken )?caesar wrap\b/i,
      resolveName() {
        return "chicken caesar wrap"
      },
    },
    {
      pattern: /\bfalafel wrap\b/i,
      resolveName() {
        return "falafel wrap"
      },
    },
    {
      pattern: /\bhalloumi\b.*\bsalad\b|\bsalad\b.*\bhalloumi\b/i,
      resolveName() {
        return "halloumi salad"
      },
    },
    {
      pattern: /\bpoke bowl\b|\bpok[eé]\s+bowl\b/i,
      resolveName() {
        if (normalized.includes("salmon")) return "salmon poke bowl"
        if (normalized.includes("tuna")) return "tuna poke bowl"
        if (normalized.includes("chicken")) return "chicken poke bowl"
        return "poke bowl"
      },
    },
    {
      pattern: /\bbreakfast burrito\b/i,
      resolveName() {
        return "breakfast burrito"
      },
    },
    {
      pattern: /\bburrito bowl\b/i,
      resolveName() {
        if (normalized.includes("chicken")) return "chicken burrito bowl"
        if (normalized.includes("beef")) return "beef burrito bowl"
        return "burrito bowl"
      },
    },
    {
      pattern: /\b(?:rice paper rolls?|fresh spring rolls?|summer rolls?)\b/i,
      resolveName() {
        return "rice paper rolls"
      },
    },
    {
      pattern: /\bpesto pasta\b|\bpasta pesto\b/i,
      resolveName() {
        return "pesto pasta"
      },
    },
    {
      pattern: /\bpad thai\b/i,
      resolveName() {
        if (normalized.includes("prawn")) return "prawn pad thai"
        if (normalized.includes("chicken")) return "chicken pad thai"
        return "pad thai"
      },
    },
    {
      pattern: /\bramen\b/i,
      resolveName() {
        return "ramen"
      },
    },
    {
      pattern: /\bpho\b/i,
      resolveName() {
        if (normalized.includes("beef")) return "beef pho"
        if (normalized.includes("chicken")) return "chicken pho"
        return "pho"
      },
    },
    {
      pattern: /\blaksa\b/i,
      resolveName() {
        if (normalized.includes("seafood")) return "seafood laksa"
        if (normalized.includes("chicken")) return "chicken laksa"
        return "laksa"
      },
    },
    {
      pattern: /\btacos?\b/i,
      resolveName() {
        if (normalized.includes("fish")) return "fish tacos"
        if (normalized.includes("chicken")) return "chicken tacos"
        if (normalized.includes("beef")) return "beef tacos"
        return "tacos"
      },
    },
    {
      pattern: /\b(?:kebab|souvlaki|gyro|gyros)\b/i,
      resolveName() {
        return "kebab"
      },
    },
    {
      pattern: /\b(?:hsp|halal snack pack)\b/i,
      resolveName() {
        return "hsp"
      },
    },
    {
      pattern: /\bfish\s*(?:and|&)\s*chips\b/i,
      resolveName() {
        return "fish and chips"
      },
    },
    {
      pattern: /\bfried chicken\b/i,
      resolveName() {
        return normalized.includes("chips") || normalized.includes("fries")
          ? "fried chicken and chips"
          : ""
      },
    },
    {
      pattern: /\b(?:roast|rotisserie)\s+chicken\b/i,
      resolveName() {
        return "roast chicken meal"
      },
    },
    {
      pattern: /\bbanh mi\b/i,
      resolveName() {
        if (normalized.includes("chicken")) return "chicken banh mi"
        if (normalized.includes("pork")) return "pork banh mi"
        return "banh mi"
      },
    },
    {
      pattern: /\b(?:sushi\s+)?hand roll\b/i,
      resolveName() {
        if (normalized.includes("salmon")) return "salmon hand roll"
        if (normalized.includes("tuna")) return "tuna hand roll"
        return "sushi hand roll"
      },
    },
    {
      pattern: /\bmeat pie\b|\bbeef pie\b/i,
      resolveName() {
        return "meat pie"
      },
    },
    {
      pattern: /\bsausage roll\b/i,
      resolveName() {
        return "sausage roll"
      },
    },
    {
      pattern: /\b(?:dumplings?|gyoza|wontons?)\b/i,
      resolveName() {
        return "dumplings"
      },
    },
    {
      pattern: /\bdim\s*sims?\b/i,
      resolveName() {
        return "dim sims"
      },
    },
    {
      pattern: /\bschnitzel\b/i,
      resolveName() {
        return normalized.includes("chips") || normalized.includes("fries") ? "schnitzel with chips" : "schnitzel"
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

  const name = trimText(rule.resolveName())
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
  const text = trimText(summary).replace(/[.!?]+$/g, "")
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
  const lowerName = trimText(item.name).toLowerCase()
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
  return trimText(fallback)
}

function buildPhotoSourceSummary(breakdown = [], confidence = "low") {
  const sources = [...new Set(
    breakdown.map((item) => trimText(item.source)).filter(Boolean)
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
  const name = trimText(item.name || item.matched_food_name || "").toLowerCase()
  const category = trimText(item.category || "").toLowerCase()
  const calories = Number(item.calories || 0)
  return (
    calories <= 35
    && (category === "ingredient" || category === "produce" || LOW_IMPACT_PHOTO_TERMS.some((term) => name.includes(term)))
  )
}

function canAutofillPhotoEstimate(analysis, breakdown = [], macroConfidence = "low") {
  if (analysis?.needs_clarification || !breakdown.length) return false
  if (String(analysis?.overall_confidence || "").trim().toLowerCase() === "low") return false
  if (hasMessyPlateReviewSignals(analysis, breakdown) && macroConfidence !== "high") return false
  if (macroConfidence === "high") return true
  const substantiveItems = breakdown.filter((item) => !isLowImpactEstimatedPhotoItem(item))
  if (!substantiveItems.length) return false
  return substantiveItems.every((item) => PHOTO_DEFENSIBLE_SOURCE_TYPES.has(String(item.source_type || "").trim()))
}

function hasMessyPlateReviewSignals(analysis = {}, breakdown = []) {
  const text = buildPhotoDishClusterText(analysis, breakdown)
  if (!text) return false
  if (!PHOTO_REVIEW_SIGNAL_TERMS.some((term) => text.includes(term))) return false
  const substantiveCount = breakdown.filter((item) => !isLowImpactEstimatedPhotoItem(item)).length || safeArray(analysis.items, 12).length
  return substantiveCount > 1 || /\b(?:platter|shared|sampler|combo|buffet)\b/.test(text)
}

function buildPhotoReviewReasons({
  analysis = {},
  breakdown = [],
  macroConfidence = "low",
  canAutofill = false,
  messyPlateReview = false,
  manualReview = false,
} = {}) {
  if (manualReview || canAutofill) return []
  const reasons = []
  if (!breakdown.length) reasons.push("no_macro_matches")
  if (Boolean(analysis?.needs_clarification)) reasons.push("ai_requested_clarification")
  if (normalizeConfidence(analysis?.overall_confidence, "low") === "low") reasons.push("low_visual_confidence")
  if (messyPlateReview) reasons.push("messy_or_hidden_calorie_plate")
  if (macroConfidence === "low") reasons.push("low_macro_confidence")
  if (breakdown.some((item) => String(item?.source_type || "").trim() === "estimated_internal_profile")) {
    reasons.push("estimated_macro_fallback")
  }
  return [...new Set(reasons)]
}

function primaryPhotoReviewReason(reasons = []) {
  const ordered = safeArray(reasons, 8)
  if (ordered.includes("messy_or_hidden_calorie_plate")) return "messy_or_hidden_calorie_plate"
  if (ordered.includes("low_visual_confidence")) return "low_visual_confidence"
  if (ordered.includes("ai_requested_clarification")) return "ai_requested_clarification"
  if (ordered.includes("estimated_macro_fallback")) return "estimated_macro_fallback"
  if (ordered.includes("no_macro_matches")) return "no_macro_matches"
  if (ordered.includes("low_macro_confidence")) return "low_macro_confidence"
  return ordered[0] || ""
}

function buildPhotoDishClusterText(analysis = {}, breakdown = []) {
  return [
    trimText(analysis.summary || ""),
    trimText(analysis.portion || ""),
    ...safeArray(analysis.items, 12).flatMap((item) => [item?.name, item?.base_name, item?.notes]),
    ...safeArray(analysis.assumptions, 8),
    ...safeArray(breakdown, 12).flatMap((item) => [item?.name, item?.matched_food_name]),
  ]
    .map((value) => trimText(value).toLowerCase())
    .filter(Boolean)
    .join(" ")
}

function inferPhotoDishCluster(analysis = {}, breakdown = []) {
  const text = buildPhotoDishClusterText(analysis, breakdown)
  if (!text) return ""

  if ((/\bcaesar\b/.test(text) && /\bsalad\b/.test(text)) || (/\bsalad\b/.test(text) && /\bcroutons?\b/.test(text) && /\bparmesan\b/.test(text))) {
    return "caesar salad"
  }

  if (/\bhalloumi\b/.test(text) && /\bsalad\b/.test(text)) {
    return "halloumi salad"
  }

  if ((/\bpoke\b/.test(text) && /\bbowl\b/.test(text)) || (/\bsalmon\b|\btuna\b/.test(text) && /\bedamame\b|\bseaweed\b/.test(text) && /\brice\b/.test(text))) {
    return "poke bowl"
  }

  if (/\bburrito\b/.test(text) && /\bbowl\b/.test(text)) {
    return "burrito bowl"
  }

  if (/\bbreakfast\b/.test(text) && /\bburrito\b/.test(text)) {
    return "breakfast burrito"
  }

  if ((/\bburger\b|\bhamburger\b/.test(text) && (/\bbun\b/.test(text) || /\bfries\b|\bchips\b|\bketchup\b|\bpickle\b/.test(text))) || (/\bpatty\b/.test(text) && /\bbun\b/.test(text))) {
    return /\bfries\b|\bchips\b/.test(text) ? "burger with fries" : "burger"
  }

  if (/\bpizza\b/.test(text) || ((/\bcheese\b/.test(text) || /\bpepperoni\b/.test(text)) && /\bslices?\b/.test(text))) {
    return "pizza"
  }

  if ((/\bpad\b/.test(text) && /\bthai\b/.test(text)) || /\bpadthai\b/.test(text)) {
    return "pad thai"
  }

  if (/\blaksa\b/.test(text) || (/\bnoodles?\b/.test(text) && /\bcoconut\b/.test(text) && /\bcurry\b/.test(text))) {
    return "laksa"
  }

  if (/\bramen\b/.test(text) || (/\bnoodles?\b/.test(text) && /\bbroth\b/.test(text) && /\bsoft boiled egg\b|\begg halves?\b/.test(text))) {
    return "ramen"
  }

  if (/\bpho\b/.test(text) || (/\bnoodles?\b/.test(text) && /\bbroth\b/.test(text) && /\bbean sprouts?\b|\bbasil\b|\blime\b/.test(text))) {
    return "pho"
  }

  if (/\btacos?\b/.test(text) || (/\btortillas?\b/.test(text) && /\bsalsa\b|\bguacamole\b/.test(text))) {
    return "tacos"
  }

  if (/\b(?:kebab|souvlaki|gyro|gyros)\b/.test(text) || (/\bflatbread\b/.test(text) && /\bmeat\b/.test(text) && /\bgarlic sauce\b|\btzatziki\b/.test(text))) {
    return "kebab"
  }

  if (/\b(?:hsp|halal snack pack)\b/.test(text) || (/\bchips\b/.test(text) && /\bgarlic sauce\b|\bchilli sauce\b/.test(text) && /\bdoner\b|\bkebab meat\b/.test(text))) {
    return "hsp"
  }

  if (/\bfish\s*(?:and|&)\s*chips\b/.test(text) || (/\bbattered fish\b/.test(text) && /\bchips\b|\bfries\b/.test(text))) {
    return "fish and chips"
  }

  if (/\bfried chicken\b/.test(text) && (/\bchips\b/.test(text) || /\bfries\b/.test(text))) {
    return "fried chicken and chips"
  }

  if (/\b(?:roast|rotisserie)\s+chicken\b/.test(text) && (/\bchips\b/.test(text) || /\bfries\b/.test(text) || /\bmeal\b/.test(text))) {
    return "roast chicken meal"
  }

  if (/\bbanh mi\b/.test(text) || (/\broll\b/.test(text) && /\bpickled vegetables?\b|\bcilantro\b|\bpat[eê]\b/.test(text))) {
    return "banh mi"
  }

  if (/\bhand roll\b/.test(text) || (/\bsushi\b/.test(text) && /\bcone\b/.test(text))) {
    return "sushi hand roll"
  }

  if (/\bmeat pie\b|\bbeef pie\b/.test(text)) {
    return "meat pie"
  }

  if (/\bsausage roll\b/.test(text)) {
    return "sausage roll"
  }

  if (/\b(?:dumplings?|gyoza|wontons?)\b/.test(text)) {
    return "dumplings"
  }

  if (/\bdim\s*sims?\b/.test(text)) {
    return "dim sims"
  }

  if (/\bschnitzel\b/.test(text) || ((/\bcrumbed\b|\bbreaded\b/.test(text)) && /\bcutlet\b/.test(text))) {
    return /\bchips\b|\bfries\b/.test(text) ? "schnitzel with chips" : "schnitzel"
  }

  if (
    /\b(?:pasta|spaghetti|penne|farfalle|fettuccine|pappardelle|tagliatelle)\b/.test(text)
    && (/\btomato sauce\b/.test(text) || /\bbolognese\b/.test(text) || /\bmeatballs?\b/.test(text) || /\bparmesan\b/.test(text) || /\bbasil\b/.test(text) || /\bgarlic\b/.test(text) || /\bcherry tomatoes?\b/.test(text))
  ) {
    return "pasta with tomato sauce"
  }

  if (
    /\bsamosa\b/.test(text)
    || /\bpastry triangles?\b/.test(text)
    || /\btriangular pastries?\b/.test(text)
    || ((/\bfried\b|\bbaked\b/.test(text)) && /\bpastr(?:y|ies)\b/.test(text) && (/\bfilled\b/.test(text) || /\bpockets?\b/.test(text) || /\bpieces?\b/.test(text)))
  ) {
    return "samosas"
  }

  if (/\bfried rice\b/.test(text) || (/\brice\b/.test(text) && (/\bfried egg\b/.test(text) || /\bspring onions?\b/.test(text) || /\bmixed vegetables?\b/.test(text)))) {
    return "fried rice"
  }

  if (
    /\bdosa\b/.test(text)
    || (/\bmashed potatoes?\b/.test(text) && (/\bcoconut chutney\b/.test(text) || /\bpeanut chutney\b/.test(text)))
  ) {
    return "dosa"
  }

  if (
    (/\bidli\b|\bidly\b/.test(text))
    || ((/\bfermented rice dish\b/.test(text) || /\brice cakes?\b/.test(text)) && (/\bsambar\b/.test(text) || /\bchutney\b/.test(text)))
    || ((/\bround dumplings?\b/.test(text) || /\bsteamed (?:sweet )?dumplings?\b/.test(text)) && (/\bcoconut(?:-based)? dip\b/.test(text) || /\blentil (?:dish|sauce)\b/.test(text) || /\bsambar\b/.test(text) || /\braita\b/.test(text)))
  ) {
    return "idli with sambar"
  }

  if (
    /\bbiryani\b/.test(text)
    || (/\brice\b/.test(text) && /\bfried onions?\b/.test(text) && /\byoghurt\b/.test(text) && /\bcurry\b/.test(text))
    || (/\brice\b/.test(text) && /\bfried onions?\b/.test(text) && /\byog(?:h)?urt\b/.test(text) && (/\bchicken\b/.test(text) || /\bmeat\b/.test(text) || /\blamb\b/.test(text)))
    || (/\bbasmati rice\b/.test(text) && /\byog(?:h)?urt\b/.test(text) && (/\bchicken\b/.test(text) || /\bmeat\b/.test(text) || /\blamb\b/.test(text)))
    || (/\brice\b/.test(text) && /\bvegetables?\b/.test(text) && /\bherbs?\b/.test(text) && /\bnuts?\b/.test(text))
    || (/\brice\b/.test(text) && /\bchicken\b/.test(text) && /\bcoriander\b/.test(text))
    || (/\bbasmati rice\b/.test(text) && /\bboiled eggs?\b/.test(text) && /\blime\b/.test(text))
    || (/\brice\b/.test(text) && /\bchicken\b/.test(text) && /\bboiled eggs?\b/.test(text) && /\blime\b/.test(text))
  ) {
    return "biryani"
  }

  if (
    /\bnaan\b/.test(text)
    && (/\bmeatballs?\b/.test(text) || /\bbutter chicken\b/.test(text) || /\bchicken\b/.test(text))
    && (/\bsauce\b/.test(text) || /\bcurry\b/.test(text) || /\brice\b/.test(text))
  ) {
    return /\brice\b/.test(text) ? "butter chicken with rice" : "chicken curry"
  }

  if (
    /\bcurry\b/.test(text)
    && /\bchicken\b/.test(text)
    && (/\bnaan\b/.test(text) || /\broti\b/.test(text) || /\bflatbread\b/.test(text) || /\bunleavened bread\b/.test(text) || /\brice\b/.test(text) || /\bcoriander\b/.test(text) || /\bherbs?\b/.test(text))
  ) {
    return /\brice\b/.test(text) ? "butter chicken with rice" : "chicken curry"
  }

  if (
    /\bchicken\b/.test(text)
    && (/\bsauce\b/.test(text) || /\bcreamy\b/.test(text))
    && (/\brice\b/.test(text) || /\bcoriander\b/.test(text) || /\bherbs?\b/.test(text))
  ) {
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
  const rescueAnalysis = {
    ...analysis,
    overall_confidence: normalizeConfidence(analysis?.overall_confidence, "medium") === "low"
      ? "medium"
      : normalizeConfidence(analysis?.overall_confidence, "medium"),
  }
  const rescueCanAutofill = canAutofillPhotoEstimate(rescueAnalysis, rescueBreakdownEstimate.items, rescueMacroConfidence)
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
    breakdown: rescueBreakdownEstimate.items.map((item) => sanitizePhotoBreakdownItem({
      ...item,
      confidence: rescueAnalysis.items[0]?.confidence || rescueAnalysis.overall_confidence || rescueMacroConfidence,
    }, true)),
    ...summarizePhotoBreakdown(rescueBreakdownEstimate.items),
    can_autofill: true,
    macro_confidence: rescueMacroConfidence,
    nutrition_source: rescueSource,
    needs_review: false,
    review_reason: "",
    review_reasons: [],
  }
}

function sanitizePhotoBreakdownItem(item = {}, includeMacros = false) {
  const safeItem = {
    name: String(item.name || "").trim(),
    quantity: String(item.quantity || "").trim(),
    category: String(item.category || "").trim(),
    confidence: String(item.confidence || "").trim(),
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

function summarizePhotoBreakdown(items = []) {
  return safeArray(items, 16).reduce((totals, item) => ({
    calories: totals.calories + Number(item?.calories || 0),
    protein_g: roundMacro(totals.protein_g + Number(item?.protein_g || 0)),
    carbs_g: roundMacro(totals.carbs_g + Number(item?.carbs_g || 0)),
    fat_g: roundMacro(totals.fat_g + Number(item?.fat_g || 0)),
  }), {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  })
}

export function normalizeFoodPhotoAnalysis(raw = {}) {
  const value = raw && typeof raw === "object" ? raw : {}
  const assumptions = safeArray(value.assumptions, 8).map((entry) => trimText(entry)).filter(Boolean)
  const inferredFoodName = inferPhotoFoodNameFromAssumptions(assumptions)
  const rawItems = safeArray(value.items, 12)
  const recoveryConfidence = deriveOverallPhotoConfidence(
    rawItems.map((item) => ({ confidence: normalizeConfidence(item?.confidence, "medium") })),
    value.overall_confidence
  )
  const items = rawItems
    .map((item, index) => {
      const rawCandidateName = item?.name || item?.label || ""
      const rawSummaryName = item?.summary || item?.description || ""
      const preferredCandidateName = isGenericPhotoFoodName(rawCandidateName) && trimText(rawSummaryName)
        ? rawSummaryName
        : rawCandidateName
      const candidateName = normalizePhotoFoodName(preferredCandidateName || rawSummaryName || `Item ${index + 1}`)
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
        notes: trimText(item?.notes || ""),
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
    clarification_question: trimText(value.clarification_question || ""),
    assumptions,
  }
}

function normalizeReviewedPhotoAnalysis(raw = {}) {
  const value = raw && typeof raw === "object" ? raw : {}
  const items = safeArray(value.items, 12)
    .map((item, index) => {
      const rawName = normalizePhotoFoodName(item?.name || item?.label || item?.summary || `Item ${index + 1}`)
      const name = titleCase(stripLeadingArticle(rawName))
      const baseName = singularizeFoodName(name)
      if (!baseName) return null
      return {
        id: `photo_item_${index + 1}`,
        name,
        base_name: baseName,
        quantity: normalizeQuantity(item?.quantity || item?.portion || "1 serve"),
        preparation: normalizePreparation(item?.preparation || ""),
        category: normalizeCategory(item?.category),
        confidence: normalizeConfidence(item?.confidence, "medium"),
        notes: trimText(item?.notes || ""),
      }
    })
    .filter(Boolean)

  return {
    summary: buildMealSummary(items, value.summary || ""),
    portion: normalizeQuantity(value.portion || value.quantity || "1 plate", "1 plate"),
    items,
    overall_confidence: deriveOverallPhotoConfidence(items, value.overall_confidence || "medium"),
    needs_clarification: false,
    clarification_question: "",
    assumptions: [],
  }
}

async function estimatePreparedPhotoAnalysis(analysis = {}, options = {}, { manualReview = false } = {}) {
  if (!analysis.items.length) {
    return {
      analysis,
      action: null,
      breakdown: [],
      macro_confidence: "low",
      needs_review: true,
      review_reason: "no_items_detected",
      review_reasons: ["no_items_detected"],
      clarification_question: analysis.clarification_question || "I couldn't confidently identify the foods in that photo yet. Try another angle or tell me what is on the plate.",
      assumptions: analysis.assumptions,
    }
  }

  const lookupFoods = typeof options.lookupFoods === "function" ? options.lookupFoods : async () => []
  const mealType = trimText(options.mealType || "").toLowerCase()
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
  const provisionalTotals = summarizePhotoBreakdown(breakdownEstimate.items)
  const naturalAutofill = canAutofillPhotoEstimate(analysis, breakdownEstimate.items, macroConfidence)
  const messyPlateReview = hasMessyPlateReviewSignals(analysis, breakdownEstimate.items)
  let canAutofill = manualReview ? true : naturalAutofill
  let action = null
  let safeBreakdown = breakdownEstimate.items.map((item, index) => sanitizePhotoBreakdownItem({
    ...item,
    confidence: analysis.items[index]?.confidence || analysis.overall_confidence || macroConfidence,
  }, true))
  let source = buildPhotoSourceSummary(breakdownEstimate.items, macroConfidence)

  if (!canAutofill && !manualReview) {
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
        review_reason: rescue.review_reason,
        review_reasons: rescue.review_reasons,
        clarification_question: analysis.clarification_question || "",
        assumptions: analysis.assumptions,
      }
    }
  }

  const needsReview = manualReview ? false : !canAutofill
  const reviewReasons = buildPhotoReviewReasons({
    analysis,
    breakdown: breakdownEstimate.items,
    macroConfidence,
    canAutofill,
    messyPlateReview,
    manualReview,
  })
  const reviewReason = primaryPhotoReviewReason(reviewReasons)
  action = (canAutofill || manualReview)
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
    ...provisionalTotals,
    can_autofill: canAutofill || manualReview,
    macro_confidence: macroConfidence,
    nutrition_source: source,
    needs_review: needsReview,
    review_reason: needsReview ? reviewReason : "",
    review_reasons: needsReview ? reviewReasons : [],
    clarification_question: analysis.clarification_question || (
      needsReview
        ? (messyPlateReview
          ? "I identified the main foods, but sauces or shared-plate portions still need review before you save this."
          : "I identified the foods, but the macros still need review before you save this.")
        : ""
    ),
    assumptions: analysis.assumptions,
  }
}

export async function buildFoodPhotoEstimate(raw = {}, options = {}) {
  const analysis = normalizeFoodPhotoAnalysis(raw)
  return estimatePreparedPhotoAnalysis(analysis, options)
}

export async function buildReviewedFoodPhotoEstimate(raw = {}, options = {}) {
  const analysis = normalizeReviewedPhotoAnalysis(raw)
  return estimatePreparedPhotoAnalysis(analysis, options, { manualReview: true })
}
