import { createIngredientItemFromFood, recalcRecipeFromIngredients } from "./nutritionHelpers.js"

const source = "Australian Food Composition Database / FSANZ AUSNUT reference values, curated local catalogue"

export const verifiedFoods = [
  { id: "eggs_2", name: "2 large eggs", aliases: ["2 eggs", "two eggs", "eggs"], quantity: "2 large eggs", calories: 148, protein_g: 12.6, carbs_g: 1.1, fat_g: 10.2, category: "protein", source },
  { id: "toast_2", name: "2 slices wholemeal toast", aliases: ["toast", "wholemeal toast", "2 toast"], quantity: "2 slices", calories: 188, protein_g: 8.0, carbs_g: 31.0, fat_g: 2.8, category: "carbs", source },
  { id: "banana", name: "Banana", aliases: ["banana", "medium banana"], quantity: "1 medium", calories: 105, protein_g: 1.3, carbs_g: 27.0, fat_g: 0.4, category: "produce", source },
  { id: "flat_white", name: "Large flat white", aliases: ["large flat white", "flat white"], quantity: "large", calories: 155, protein_g: 8.0, carbs_g: 12.0, fat_g: 8.0, category: "dairy", source },
  { id: "protein_shake_40", name: "Protein shake", aliases: ["protein shake", "40g protein", "shake"], quantity: "40g protein serve", calories: 210, protein_g: 40.0, carbs_g: 5.0, fat_g: 3.0, category: "protein", source },
  { id: "chicken_burrito_bowl", name: "Chicken burrito bowl", aliases: ["chicken burrito bowl", "burrito bowl"], quantity: "1 large bowl", calories: 680, protein_g: 48.0, carbs_g: 76.0, fat_g: 18.0, category: "mixed meal", source },
  { id: "greek_yoghurt_berries_oats", name: "Greek yoghurt, berries, and oats", aliases: ["yoghurt berries oats", "greek yoghurt", "yogurt berries oats"], quantity: "1 bowl", calories: 430, protein_g: 32.0, carbs_g: 48.0, fat_g: 11.0, category: "breakfast", source },
  { id: "chicken_rice_bowl", name: "Chicken rice bowl", aliases: ["chicken rice", "chicken rice bowl"], quantity: "1 bowl", calories: 620, protein_g: 45.0, carbs_g: 68.0, fat_g: 16.0, category: "mixed meal", source },
  { id: "salmon_potato_salad", name: "Salmon, potato, and salad", aliases: ["salmon potato salad", "salmon and potato"], quantity: "1 plate", calories: 560, protein_g: 39.0, carbs_g: 42.0, fat_g: 24.0, category: "dinner", source },
  { id: "lean_beef_bowl", name: "Lean beef burrito bowl", aliases: ["lean beef bowl", "beef burrito bowl"], quantity: "1 bowl", calories: 720, protein_g: 52.0, carbs_g: 78.0, fat_g: 22.0, category: "mixed meal", source },
  { id: "tuna_rice", name: "Tuna and rice", aliases: ["tuna rice", "tuna and rice"], quantity: "1 bowl", calories: 465, protein_g: 39.0, carbs_g: 58.0, fat_g: 8.0, category: "protein", source },
]

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
}

export function findVerifiedFood(query) {
  const normalized = normalize(query)
  if (!normalized) return null

  return verifiedFoods.find((food) => {
    const names = [food.name, ...food.aliases].map(normalize)
    return names.some((name) => normalized.includes(name) || name.includes(normalized))
  }) || null
}

export function searchVerifiedFoods(query) {
  const normalized = normalize(query)
  if (!normalized) return verifiedFoods

  return verifiedFoods.filter((food) => {
    const haystack = normalize(`${food.name} ${food.aliases.join(" ")} ${food.category}`)
    return normalized.split(" ").every((term) => haystack.includes(term))
  })
}

export function foodToMeal(food, overrides = {}) {
  return {
    food_name: food.name,
    quantity: food.quantity,
    calories: food.calories,
    protein_g: food.protein_g,
    carbs_g: food.carbs_g,
    fat_g: food.fat_g,
    estimated: false,
    nutrition_source: food.source,
    ...overrides,
  }
}

export function buildMealSuggestion(ingredients) {
  const terms = normalize(ingredients)
  const matches = verifiedFoods.filter((food) => {
    const haystack = normalize(`${food.name} ${food.aliases.join(" ")} ${food.category}`)
    return terms.split(" ").some((term) => term.length > 2 && haystack.includes(term))
  })

  const chosen = matches.length ? matches.slice(0, 2) : [verifiedFoods[1], verifiedFoods[4], verifiedFoods[2]]
  const totals = chosen.reduce(
    (total, food) => ({
      calories: total.calories + food.calories,
      protein_g: total.protein_g + food.protein_g,
      carbs_g: total.carbs_g + food.carbs_g,
      fat_g: total.fat_g + food.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )

  return {
    id: `suggestion_${chosen.map((food) => food.id).join("_")}`,
    name: chosen.map((food) => food.name).join(" + "),
    description: "Built only from foods in the verified Australian nutrition catalogue.",
    ingredients: chosen.map((food) => food.name),
    source,
    ...totals,
  }
}

export function generateLocalChefRecipe(pantry, mealType = "dinner", servings = 2, allowEstimated = true) {
  const suggestion = buildMealSuggestion(pantry)
  const ingredientTerms = normalize(pantry).split(/[\n,]/).map((term) => term.trim()).filter(Boolean)
  const matchedFoods = ingredientTerms
    .map((term) => findVerifiedFood(term))
    .filter(Boolean)

  const chosenFoods = matchedFoods.length ? matchedFoods : suggestion.ingredients.map((name) => findVerifiedFood(name)).filter(Boolean)
  const safeServings = Math.max(1, Math.round(Number(servings) || 2))
  const ingredients = [
    ...chosenFoods.map((food) => createIngredientItemFromFood(food)),
    ...(!allowEstimated ? [] : ingredientTerms.filter((term) => !findVerifiedFood(term)).map((term) => ({
      id: `estimated_${term.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      name: term,
      quantity: "to taste",
      estimated: true,
      source: "Offline fallback could not verify this ingredient precisely",
      source_type: "estimated",
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    }))),
  ]

  return recalcRecipeFromIngredients({
    title: matchedFoods.length > 1 ? `${matchedFoods[0].name} pantry bowl` : suggestion.name,
    description: "Offline pantry recipe built from the local verified catalogue while live recipe generation is unavailable.",
    meal_type: mealType,
    servings: safeServings,
    ingredients,
    steps: [
      "Prep the ingredients you listed and use the matched protein or base first.",
      "Cook the main ingredients together and season simply with pantry staples you trust.",
      "Plate the meal, then adjust portion size to fit the macro target shown below.",
    ],
    notes: allowEstimated
      ? "Offline fallback recipe. For broader pantry matching and smarter recipes, run the nutrition server with OpenAI enabled."
      : "Offline verified-only fallback. Unmatched pantry items were omitted because estimates are disabled.",
  })
}
