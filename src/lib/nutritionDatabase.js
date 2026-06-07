import { createIngredientItemFromFood, recalcRecipeFromIngredients } from "./nutritionHelpers.js"

const auSource = "Australian Food Composition Database / FSANZ AUSNUT reference values, curated local catalogue"
const nzSource = "New Zealand Food Composition Database / FOODfiles Concise Tables 14th Edition, curated local catalogue"

function curatedFood(food, { source, sourceType }) {
  return {
    ...food,
    source,
    source_type: sourceType,
    macro_confidence: "high",
  }
}

const auVerifiedFoods = [
  { id: "eggs_2", name: "2 large eggs", aliases: ["2 eggs", "two eggs", "eggs"], quantity: "2 large eggs", calories: 148, protein_g: 12.6, carbs_g: 1.1, fat_g: 10.2, category: "protein" },
  { id: "toast_2", name: "2 slices wholemeal toast", aliases: ["toast", "wholemeal toast", "2 toast"], quantity: "2 slices", calories: 188, protein_g: 8.0, carbs_g: 31.0, fat_g: 2.8, category: "carbs" },
  { id: "banana", name: "Banana", aliases: ["banana", "medium banana"], quantity: "1 medium", calories: 105, protein_g: 1.3, carbs_g: 27.0, fat_g: 0.4, category: "produce" },
  { id: "flat_white", name: "Large flat white", aliases: ["large flat white", "flat white"], quantity: "large", calories: 155, protein_g: 8.0, carbs_g: 12.0, fat_g: 8.0, category: "dairy" },
  { id: "protein_shake_40", name: "Protein shake", aliases: ["protein shake", "40g protein", "shake"], quantity: "40g protein serve", calories: 210, protein_g: 40.0, carbs_g: 5.0, fat_g: 3.0, category: "protein" },
  { id: "chicken_burrito_bowl", name: "Chicken burrito bowl", aliases: ["chicken burrito bowl", "burrito bowl"], quantity: "1 large bowl", calories: 680, protein_g: 48.0, carbs_g: 76.0, fat_g: 18.0, category: "mixed meal" },
  { id: "greek_yoghurt_berries_oats", name: "Greek yoghurt, berries, and oats", aliases: ["yoghurt berries oats", "greek yoghurt", "yogurt berries oats"], quantity: "1 bowl", calories: 430, protein_g: 32.0, carbs_g: 48.0, fat_g: 11.0, category: "breakfast" },
  { id: "chicken_rice_bowl", name: "Chicken rice bowl", aliases: ["chicken rice", "chicken rice bowl"], quantity: "1 bowl", calories: 620, protein_g: 45.0, carbs_g: 68.0, fat_g: 16.0, category: "mixed meal" },
  { id: "salmon_potato_salad", name: "Salmon, potato, and salad", aliases: ["salmon potato salad", "salmon and potato"], quantity: "1 plate", calories: 560, protein_g: 39.0, carbs_g: 42.0, fat_g: 24.0, category: "dinner" },
  { id: "lean_beef_bowl", name: "Lean beef burrito bowl", aliases: ["lean beef bowl", "beef burrito bowl"], quantity: "1 bowl", calories: 720, protein_g: 52.0, carbs_g: 78.0, fat_g: 22.0, category: "mixed meal" },
  { id: "tuna_rice", name: "Tuna and rice", aliases: ["tuna rice", "tuna and rice"], quantity: "1 bowl", calories: 465, protein_g: 39.0, carbs_g: 58.0, fat_g: 8.0, category: "protein" },
].map((food) => curatedFood(food, { source: auSource, sourceType: "curated_au_catalogue" }))

const nzVerifiedFoods = [
  { id: "a1070", name: "Griffins Dark Chocolate Wheaten", aliases: ["griffins dark chocolate wheaten", "griffins wheaten dark chocolate", "dark chocolate wheaten", "wheaten biscuit griffins"], quantity: "100g", calories: 471, protein_g: 6.38, carbs_g: 55.6, fat_g: 23.8, category: "snack" },
  { id: "a1072", name: "Griffins Chit Chat Dark Chocolate Delight", aliases: ["griffins chit chat", "griffins chit chat dark chocolate delight", "chit chat biscuit"], quantity: "100g", calories: 504, protein_g: 5.54, carbs_g: 65, fat_g: 24.3, category: "snack" },
  { id: "a71", name: "Griffins MallowPuffs", aliases: ["griffins mallowpuffs", "mallowpuffs"], quantity: "100g", calories: 430, protein_g: 5.32, carbs_g: 63.9, fat_g: 16.6, category: "snack" },
  { id: "a1075", name: "Griffins Milk Chocolate Wheaten", aliases: ["griffins milk chocolate wheaten", "milk chocolate wheaten", "griffins wheaten milk chocolate"], quantity: "100g", calories: 490, protein_g: 6.15, carbs_g: 60, fat_g: 24.2, category: "snack" },
  { id: "a62", name: "Griffins Krispie", aliases: ["griffins krispie", "krispie biscuit"], quantity: "100g", calories: 445, protein_g: 5.36, carbs_g: 65.4, fat_g: 17, category: "snack" },
  { id: "a119", name: "Griffins Meal Mates", aliases: ["griffins meal mates", "meal mates crackers"], quantity: "100g", calories: 468, protein_g: 8.03, carbs_g: 49.9, fat_g: 25.7, category: "snack" },
  { id: "a137", name: "Griffins Snax", aliases: ["griffins snax", "snax crackers"], quantity: "100g", calories: 473, protein_g: 7.19, carbs_g: 54.6, fat_g: 24.5, category: "snack" },
  { id: "a1060", name: "Arnotts Farmbake Chocolate Chip Fudge", aliases: ["arnotts farmbake chocolate chip fudge", "farmbake chocolate chip fudge"], quantity: "100g", calories: 485, protein_g: 5.86, carbs_g: 68.9, fat_g: 20.1, category: "snack" },
  { id: "a1076", name: "Arnotts Tim Tam Classic Dark", aliases: ["arnotts tim tam classic dark", "tim tam classic dark"], quantity: "100g", calories: 526, protein_g: 5.45, carbs_g: 63.7, fat_g: 26.9, category: "snack" },
  { id: "a1069", name: "Arnotts Digestives Dark Chocolate", aliases: ["arnotts digestives dark chocolate", "dark chocolate digestives arnotts"], quantity: "100g", calories: 495, protein_g: 6.09, carbs_g: 61.9, fat_g: 23.7, category: "snack" },
  { id: "a1074", name: "Arnotts Digestives Milk Chocolate", aliases: ["arnotts digestives milk chocolate", "milk chocolate digestives arnotts"], quantity: "100g", calories: 495, protein_g: 6.03, carbs_g: 65.1, fat_g: 22.4, category: "snack" },
  { id: "a1066", name: "Arnotts Farmbake White and Dark Chocolate", aliases: ["arnotts farmbake white dark chocolate", "farmbake white and dark chocolate"], quantity: "100g", calories: 497, protein_g: 4.96, carbs_g: 70, fat_g: 21.3, category: "snack" },
  { id: "a1064", name: "Arnotts Tim Tam Double Coat", aliases: ["arnotts tim tam double coat", "tim tam double coat"], quantity: "100g", calories: 531, protein_g: 4.93, carbs_g: 68.5, fat_g: 26, category: "snack" },
  { id: "a1071", name: "Arnotts Tim Tam Original", aliases: ["arnotts tim tam original", "tim tam original"], quantity: "100g", calories: 531, protein_g: 4.9, carbs_g: 68.5, fat_g: 26, category: "snack" },
  { id: "a1029", name: "Arnotts Cruskits Corn", aliases: ["arnotts cruskits corn", "cruskits corn"], quantity: "100g", calories: 344, protein_g: 8.13, carbs_g: 73.3, fat_g: 1.2, category: "snack" },
  { id: "a1031", name: "Arnotts Cruskits Mixed Grain Light", aliases: ["arnotts cruskits mixed grain light", "cruskits mixed grain light"], quantity: "100g", calories: 344, protein_g: 12.5, carbs_g: 65.1, fat_g: 2.5, category: "snack" },
  { id: "a1030", name: "Arnotts Salada Light Original", aliases: ["arnotts salada light original", "salada light original"], quantity: "100g", calories: 344, protein_g: 10.8, carbs_g: 66.3, fat_g: 2.65, category: "snack" },
  { id: "a140", name: "Arnotts Water Crackers", aliases: ["arnotts water crackers", "water crackers arnotts"], quantity: "100g", calories: 409, protein_g: 10, carbs_g: 73.7, fat_g: 7.2, category: "snack" },
  { id: "c1097", name: "Anchor Fast Start", aliases: ["anchor fast start", "fast start anchor", "anchor liquid breakfast"], quantity: "100ml", calories: 80, protein_g: 5, carbs_g: 14, fat_g: 2, category: "drink" },
  { id: "c1094", name: "Sanitarium Up&Go", aliases: ["up&go", "up and go", "sanitarium up&go", "sanitarium up and go"], quantity: "100ml", calories: 64, protein_g: 3.15, carbs_g: 11.8, fat_g: 1.7, category: "drink" },
  { id: "c166", name: "Sanitarium So Good Essential Soy Milk", aliases: ["so good essential", "sanitarium so good essential", "so good essential soy milk"], quantity: "100ml", calories: 51, protein_g: 2.79, carbs_g: 4.63, fat_g: 2.26, category: "drink" },
  { id: "c30", name: "Sanitarium So Good Lite Soy Milk", aliases: ["so good lite", "sanitarium so good lite", "so good lite soy milk"], quantity: "100ml", calories: 42, protein_g: 2.91, carbs_g: 3.67, fat_g: 1.59, category: "drink" },
  { id: "c29", name: "Sanitarium So Good Regular Soy Milk", aliases: ["so good regular", "sanitarium so good regular", "so good regular soy milk"], quantity: "100ml", calories: 60, protein_g: 2.62, carbs_g: 3.66, fat_g: 3.7, category: "drink" },
  { id: "c92", name: "Sanitarium So Good Vanilla Soy Milk", aliases: ["so good vanilla", "sanitarium so good vanilla", "so good vanilla soy milk"], quantity: "100ml", calories: 76, protein_g: 2.39, carbs_g: 6.7, fat_g: 4.23, category: "drink" },
  { id: "d1053", name: "Sanitarium Cluster Crisp Manuka Honey Cashew", aliases: ["cluster crisp manuka honey cashew", "sanitarium cluster crisp manuka honey"], quantity: "100g", calories: 387, protein_g: 7.81, carbs_g: 56.8, fat_g: 12.9, category: "breakfast" },
  { id: "d1045", name: "Sanitarium Cluster Crisp Original", aliases: ["cluster crisp", "sanitarium cluster crisp"], quantity: "100g", calories: 385, protein_g: 7.81, carbs_g: 56.8, fat_g: 12.7, category: "breakfast" },
  { id: "d1052", name: "Sanitarium Cluster Crisp Vanilla Almond", aliases: ["cluster crisp vanilla almond", "sanitarium cluster crisp vanilla almond"], quantity: "100g", calories: 382, protein_g: 7.81, carbs_g: 56.8, fat_g: 12.4, category: "breakfast" },
  { id: "d1049", name: "Sanitarium Light n Tasty Apricot", aliases: ["light n tasty apricot", "sanitarium light n tasty apricot", "light n tasty apricot cereal"], quantity: "100g", calories: 354, protein_g: 7.39, carbs_g: 69.9, fat_g: 2.9, category: "breakfast" },
  { id: "d1050", name: "Sanitarium Light n Tasty Berry", aliases: ["light n tasty berry", "sanitarium light n tasty berry", "light n tasty berry cereal"], quantity: "100g", calories: 349, protein_g: 7.39, carbs_g: 69.6, fat_g: 2.6, category: "breakfast" },
  { id: "d1051", name: "Sanitarium Light n Tasty Peach Raspberry", aliases: ["light n tasty peach raspberry", "sanitarium light n tasty peach raspberry"], quantity: "100g", calories: 351, protein_g: 7.39, carbs_g: 67.6, fat_g: 3.8, category: "breakfast" },
  { id: "d1017", name: "Sanitarium Puffed Wheat", aliases: ["sanitarium puffed wheat", "puffed wheat sanitarium"], quantity: "100g", calories: 390, protein_g: 11.6, carbs_g: 77.9, fat_g: 1.4, category: "breakfast" },
  { id: "d1029", name: "Sanitarium Ricies", aliases: ["sanitarium ricies", "ricies cereal"], quantity: "100g", calories: 351, protein_g: 5.95, carbs_g: 77.9, fat_g: 1.1, category: "breakfast" },
  { id: "d1018", name: "Sanitarium San Bran", aliases: ["sanitarium san bran", "san bran cereal"], quantity: "100g", calories: 296, protein_g: 12.4, carbs_g: 41.4, fat_g: 1.4, category: "breakfast" },
  { id: "d1057", name: "Sanitarium Skippy Cornflakes", aliases: ["sanitarium skippy cornflakes", "skippy cornflakes"], quantity: "100g", calories: 359, protein_g: 7.5, carbs_g: 76.2, fat_g: 1.3, category: "breakfast" },
  { id: "d1047", name: "Sanitarium Toasted Muesli Golden Oats and Fruit", aliases: ["sanitarium toasted muesli golden oats fruit", "toasted muesli golden oats fruit"], quantity: "100g", calories: 425, protein_g: 8.81, carbs_g: 60, fat_g: 14.4, category: "breakfast" },
  { id: "d1055", name: "Sanitarium Toasted Muesli Super Fruity", aliases: ["sanitarium toasted muesli super fruity", "toasted muesli super fruity"], quantity: "100g", calories: 404, protein_g: 8.81, carbs_g: 64.8, fat_g: 9.8, category: "breakfast" },
  { id: "d1054", name: "Sanitarium Toasted Strawberry and Rhubarb", aliases: ["sanitarium toasted strawberry rhubarb", "toasted strawberry and rhubarb"], quantity: "100g", calories: 385, protein_g: 8.81, carbs_g: 55.9, fat_g: 11.7, category: "breakfast" },
  { id: "d1056", name: "Sanitarium Weet-Bix", aliases: ["weet-bix", "weet bix", "sanitarium weet-bix", "sanitarium weet bix", "weetbix"], quantity: "100g", calories: 330, protein_g: 12.5, carbs_g: 58.4, fat_g: 2.3, category: "breakfast" },
  { id: "d1012", name: "Sanitarium Weet-Bix Oat Bran", aliases: ["weet-bix oat bran", "weet bix oat bran", "sanitarium weet-bix oat bran", "weetbix oat bran"], quantity: "100g", calories: 392, protein_g: 12.8, carbs_g: 72.6, fat_g: 2.5, category: "breakfast" },
  { id: "d1035", name: "Sanitarium Weeties", aliases: ["sanitarium weeties", "weeties cereal"], quantity: "100g", calories: 332, protein_g: 11.9, carbs_g: 61.5, fat_g: 2.1, category: "breakfast" },
  { id: "p1004", name: "Sanitarium Marmite", aliases: ["sanitarium marmite", "marmite nz"], quantity: "100g", calories: 162, protein_g: 17.4, carbs_g: 14.5, fat_g: 1.2, category: "pantry" },
  { id: "c1017", name: "Meadow Fresh Body Boost Shots", aliases: ["meadow fresh body boost shots", "activate body boost shots meadow fresh"], quantity: "100ml", calories: 44, protein_g: 1.1, carbs_g: 8, fat_g: 0.8, category: "drink" },
  { id: "f1075", name: "Meadow Fresh Low Fat Fruit Yoghurt", aliases: ["meadow fresh low fat fruit yoghurt", "meadow fresh yoghurt low fat fruit"], quantity: "100g", calories: 79, protein_g: 4.34, carbs_g: 12.7, fat_g: 1, category: "dairy" },
  { id: "f1073", name: "Meadow Fresh Live Lite Yoghurt", aliases: ["meadow fresh live lite yoghurt", "live lite yoghurt meadow fresh"], quantity: "100g", calories: 52, protein_g: 4.91, carbs_g: 8, fat_g: 0.2, category: "dairy" },
  { id: "f1057", name: "Mainland Light Cheddar", aliases: ["mainland light cheddar", "mainland cheddar light"], quantity: "100g", calories: 318, protein_g: 29.3, carbs_g: 0, fat_g: 22.4, category: "dairy" },
  { id: "f110", name: "Tip Top Jelly Tip Ice Cream", aliases: ["tip top jelly tip", "jelly tip ice cream"], quantity: "100g", calories: 237, protein_g: 2.74, carbs_g: 25.6, fat_g: 13.8, category: "dessert" },
  { id: "f77", name: "Tip Top Frozen Apricot Yoghurt", aliases: ["tip top frozen apricot yoghurt", "tip top apricot frozen yoghurt"], quantity: "100g", calories: 91, protein_g: 2.49, carbs_g: 17.8, fat_g: 1.03, category: "dessert" },
  { id: "j1002", name: "Pams Summer Gold Canola Margarine", aliases: ["pams summer gold canola margarine", "pams summer gold margarine"], quantity: "100g", calories: 626, protein_g: 0.31, carbs_g: 0, fat_g: 70.6, category: "pantry" },
  { id: "j1004", name: "Pams Summer Gold Lite Margarine", aliases: ["pams summer gold lite margarine", "pams lite margarine"], quantity: "100g", calories: 516, protein_g: 0.31, carbs_g: 0, fat_g: 58.1, category: "pantry" },
  { id: "x1037", name: "Pams Crunchy Wedges", aliases: ["pams wedges", "pams crunchy wedges"], quantity: "100g", calories: 154, protein_g: 3.44, carbs_g: 24.5, fat_g: 3.88, category: "frozen" },
  { id: "u23", name: "Uncle Tobys Strawberry Fruit Roll", aliases: ["uncle tobys strawberry fruit roll", "strawberry fruit roll uncle tobys"], quantity: "100g", calories: 315, protein_g: 0.75, carbs_g: 74.8, fat_g: 0.33, category: "snack" },
  { id: "v1006", name: "Watties Tuscan Tomato Soup", aliases: ["watties tuscan tomato soup", "watties tomato soup", "wattie's tuscan tomato soup"], quantity: "100ml", calories: 28, protein_g: 0.94, carbs_g: 4.8, fat_g: 0.35, category: "soup" },
  { id: "v1008", name: "Watties Chicken and Corn Soup", aliases: ["watties chicken and corn soup", "wattie's chicken and corn soup"], quantity: "100ml", calories: 26, protein_g: 1.25, carbs_g: 3.75, fat_g: 0.4, category: "soup" },
  { id: "v1003", name: "Watties Chicken and Vegetable Soup", aliases: ["watties chicken and vegetable soup", "wattie's chicken and vegetable soup"], quantity: "100ml", calories: 29, protein_g: 2.06, carbs_g: 3.86, fat_g: 0.25, category: "soup" },
  { id: "v1004", name: "Watties Lentil and Vegetables Soup", aliases: ["watties lentil and vegetables soup", "wattie's lentil and vegetables soup"], quantity: "100ml", calories: 43, protein_g: 1.38, carbs_g: 5.88, fat_g: 0.5, category: "soup" },
  { id: "v1007", name: "Watties Pumpkin Soup", aliases: ["watties pumpkin soup", "wattie's pumpkin soup"], quantity: "100ml", calories: 24, protein_g: 0.63, carbs_g: 3.06, fat_g: 0.85, category: "soup" },
  { id: "x1033", name: "Watties Crunchy Steak Cut Fries", aliases: ["watties crunchy steak cut fries", "wattie's steak cut fries"], quantity: "100g", calories: 187, protein_g: 3.13, carbs_g: 24.1, fat_g: 8.2, category: "frozen" },
  { id: "x1078", name: "Watties Tomato Puree", aliases: ["watties tomato puree", "wattie's tomato puree"], quantity: "100g", calories: 39, protein_g: 1.51, carbs_g: 6.8, fat_g: 0.2, category: "pantry" },
  { id: "x1004", name: "Watties Baked Beans", aliases: ["watties baked beans", "wattie's baked beans", "baked beans watties nz"], quantity: "100g", calories: 84, protein_g: 5, carbs_g: 12, fat_g: 0.6, category: "pantry" },
  { id: "f1046", name: "Anchor Salted Butter", aliases: ["anchor salted butter", "anchor butter"], quantity: "100g", calories: 729, protein_g: 0.45, carbs_g: 0.44, fat_g: 82.1, category: "dairy" },
  { id: "f1110", name: "Lewis Road Whole Milk", aliases: ["lewis road whole milk", "lewis road milk", "lewis road dairy whole milk"], quantity: "100ml", calories: 61, protein_g: 3.48, carbs_g: 4.3, fat_g: 3.3, category: "dairy" },
  { id: "f1111", name: "Lewis Road Lite Milk", aliases: ["lewis road lite milk", "lewis road light milk"], quantity: "100ml", calories: 44, protein_g: 3.37, carbs_g: 4.4, fat_g: 1.46, category: "dairy" },
].map((food) => curatedFood(food, { source: nzSource, sourceType: "nz_curated_catalogue" }))

export const verifiedFoods = [...auVerifiedFoods, ...nzVerifiedFoods]

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
    nutrition_source_type: food.source_type || "curated_au_catalogue",
    macro_confidence: food.macro_confidence || "high",
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
    description: "Built only from foods in the curated AU/NZ nutrition catalogue.",
    ingredients: chosen.map((food) => food.name),
    source: chosen.every((food) => food.source_type === "nz_curated_catalogue")
      ? nzSource
      : chosen.every((food) => food.source_type === "curated_au_catalogue")
        ? auSource
        : `${auSource} | ${nzSource}`,
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
      source: "Estimated from your ingredient list",
      source_type: "estimated",
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    }))),
  ]

  return recalcRecipeFromIngredients({
    title: matchedFoods.length > 1 ? `${matchedFoods[0].name} pantry bowl` : suggestion.name,
    description: "Pantry recipe built from the local verified AU/NZ catalogue while live recipe help is unavailable.",
    meal_type: mealType,
    servings: safeServings,
    ingredients,
    steps: [
      "Prep the ingredients you listed and use the matched protein or base first.",
      "Cook the main ingredients together and season simply with pantry staples you trust.",
      "Plate the meal, then adjust portion size to fit the macro target shown below.",
    ],
    notes: allowEstimated
      ? "This recipe uses the curated AU/NZ food catalogue and may estimate unmatched ingredients from what you entered."
      : "This recipe only uses ingredients the app could verify in the local AU/NZ catalogue.",
  })
}
