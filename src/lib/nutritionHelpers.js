export function roundMacro(value) {
  return Math.round((Number(value) || 0) * 10) / 10
}

const VERIFIED_SOURCE_TYPES = new Set(["curated_au_catalogue", "nz_curated_catalogue", "open_food_facts_label", "barcode_label"])
const LOW_CONFIDENCE_SOURCE_TYPES = new Set(["estimated_internal_profile", "photo_ai_estimate", "manual_user_entry", "mixed_reference_and_estimate"])

export function foodLookupKey(food) {
  return String(food?.id || food?.name || "").trim().toLowerCase()
}

export function normalizeMacroConfidence(value, fallback = "low") {
  const normalized = String(value || "").trim().toLowerCase()
  return ["high", "medium", "low"].includes(normalized) ? normalized : fallback
}

export function normalizeNutritionSourceType(value, estimated = false) {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized) return normalized
  return estimated ? "estimated_internal_profile" : "reference"
}

export function normalizeFoodSnapshot(food) {
  return {
    id: food?.id || foodLookupKey(food),
    name: food?.name || "Food",
    aliases: Array.isArray(food?.aliases) ? food.aliases : [],
    quantity: food?.quantity || "1 serve",
    calories: Math.round(Number(food?.calories) || 0),
    protein_g: roundMacro(food?.protein_g),
    carbs_g: roundMacro(food?.carbs_g),
    fat_g: roundMacro(food?.fat_g),
    category: food?.category || "food",
    source: food?.source || "",
    source_type: normalizeNutritionSourceType(food?.source_type, !food?.source),
    macro_confidence: normalizeMacroConfidence(food?.macro_confidence, food?.source ? "high" : "low"),
  }
}

export function upsertFoodSnapshot(list, food, limit = 16) {
  const snapshot = normalizeFoodSnapshot(food)
  const key = foodLookupKey(snapshot)
  return [snapshot, ...(Array.isArray(list) ? list : []).filter((item) => foodLookupKey(item) !== key)].slice(0, limit)
}

export function isVerifiedFoodResult(food) {
  return VERIFIED_SOURCE_TYPES.has(normalizeNutritionSourceType(food?.source_type))
}

export function nutritionSourceLabel(mealOrFood = {}) {
  const sourceType = normalizeNutritionSourceType(mealOrFood?.nutrition_source_type || mealOrFood?.source_type, Boolean(mealOrFood?.estimated))
  if (sourceType === "barcode_label") return "Barcode label"
  if (sourceType === "open_food_facts_label") return "Product label"
  if (sourceType === "curated_au_catalogue") return "Curated AU reference"
  if (sourceType === "nz_curated_catalogue") return "Curated NZ reference"
  if (sourceType === "photo_ai_estimate") return "AI photo estimate"
  if (sourceType === "manual_user_entry") return "Manual entry"
  if (sourceType === "mixed_verified_sources") return "Verified references"
  if (sourceType === "mixed_reference_and_estimate") return "Mixed reference + estimate"
  return mealOrFood?.estimated ? "Estimated" : "Reference"
}

export function nutritionSourceTone(mealOrFood = {}) {
  const sourceType = normalizeNutritionSourceType(mealOrFood?.nutrition_source_type || mealOrFood?.source_type, Boolean(mealOrFood?.estimated))
  const confidence = normalizeMacroConfidence(mealOrFood?.macro_confidence, mealOrFood?.estimated ? "low" : "high")
  if (VERIFIED_SOURCE_TYPES.has(sourceType) && confidence === "high") return "text-emerald-700"
  if (confidence === "medium" || sourceType === "mixed_verified_sources") return "text-sky-700"
  if (LOW_CONFIDENCE_SOURCE_TYPES.has(sourceType) || confidence === "low") return "text-amber-700"
  return mealOrFood?.estimated ? "text-amber-700" : "text-emerald-700"
}

export function createIngredientItemFromFood(food, overrides = {}) {
  const snapshot = normalizeFoodSnapshot(food)
  return {
    id: overrides.id || snapshot.id || crypto.randomUUID?.() || `ingredient_${Date.now()}`,
    name: overrides.name || snapshot.name,
    quantity: overrides.quantity || snapshot.quantity || "1 serve",
    estimated: overrides.estimated ?? false,
    source: overrides.source || snapshot.source,
    source_type: overrides.source_type || snapshot.source_type,
    macro_confidence: overrides.macro_confidence || snapshot.macro_confidence,
    calories: Math.round(Number(overrides.calories ?? snapshot.calories) || 0),
    protein_g: roundMacro(overrides.protein_g ?? snapshot.protein_g),
    carbs_g: roundMacro(overrides.carbs_g ?? snapshot.carbs_g),
    fat_g: roundMacro(overrides.fat_g ?? snapshot.fat_g),
  }
}

function safeServings(value) {
  return Math.max(1, Number(value) || 1)
}

function formatLeadingNumber(value) {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

export function scaleQuantityString(quantity, ratio) {
  const text = String(quantity || "").trim()
  if (!text || Math.abs(ratio - 1) < 0.0001) return text
  const match = text.match(/^(\d+(?:\.\d+)?)(\s*.*)$/)
  if (!match) return text
  const nextValue = Number(match[1]) * ratio
  return `${formatLeadingNumber(nextValue)}${match[2]}`.trim()
}

export function recalcRecipeFromIngredients(recipe) {
  const servings = safeServings(recipe?.servings)
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : []
  const totals = ingredients.reduce((sum, ingredient) => ({
    calories: sum.calories + (Number(ingredient?.calories) || 0),
    protein_g: sum.protein_g + (Number(ingredient?.protein_g) || 0),
    carbs_g: sum.carbs_g + (Number(ingredient?.carbs_g) || 0),
    fat_g: sum.fat_g + (Number(ingredient?.fat_g) || 0),
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })

  return {
    ...recipe,
    servings,
    ingredients,
    totals: {
      calories: Math.round(totals.calories),
      protein_g: roundMacro(totals.protein_g),
      carbs_g: roundMacro(totals.carbs_g),
      fat_g: roundMacro(totals.fat_g),
    },
    per_serving: {
      calories: Math.round(totals.calories / servings),
      protein_g: roundMacro(totals.protein_g / servings),
      carbs_g: roundMacro(totals.carbs_g / servings),
      fat_g: roundMacro(totals.fat_g / servings),
    },
  }
}

export function scaleRecipeDraft(recipe, nextServings) {
  const currentServings = safeServings(recipe?.servings)
  const desiredServings = safeServings(nextServings)
  const ratio = desiredServings / currentServings
  const ingredients = (Array.isArray(recipe?.ingredients) ? recipe.ingredients : []).map((ingredient) => ({
    ...ingredient,
    quantity: scaleQuantityString(ingredient.quantity, ratio),
    calories: Math.round((Number(ingredient?.calories) || 0) * ratio),
    protein_g: roundMacro((Number(ingredient?.protein_g) || 0) * ratio),
    carbs_g: roundMacro((Number(ingredient?.carbs_g) || 0) * ratio),
    fat_g: roundMacro((Number(ingredient?.fat_g) || 0) * ratio),
  }))

  return recalcRecipeFromIngredients({
    ...recipe,
    servings: desiredServings,
    ingredients,
  })
}

export function recipeToMeal(recipe, servingsToLog = 1) {
  const recipeWithTotals = recalcRecipeFromIngredients(recipe || {})
  const multiplier = Math.max(0.25, Number(servingsToLog) || 1)

  return {
    quantity: `${formatLeadingNumber(multiplier)} serve${Math.abs(multiplier - 1) < 0.0001 ? "" : "s"}`,
    calories: Math.round((recipeWithTotals.per_serving?.calories || 0) * multiplier),
    protein_g: roundMacro((recipeWithTotals.per_serving?.protein_g || 0) * multiplier),
    carbs_g: roundMacro((recipeWithTotals.per_serving?.carbs_g || 0) * multiplier),
    fat_g: roundMacro((recipeWithTotals.per_serving?.fat_g || 0) * multiplier),
  }
}
