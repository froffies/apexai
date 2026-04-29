import { roundMacro } from "@/lib/nutritionHelpers"

const trackedMealTypes = ["breakfast", "lunch", "dinner", "snack"]

function canonicalName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function sortByRecency(left, right) {
  return String(right.lastLoggedAt || "").localeCompare(String(left.lastLoggedAt || ""))
}

function bestMealType(counts) {
  return trackedMealTypes.reduce((best, current) => (
    (counts?.[current] || 0) > (counts?.[best] || 0) ? current : best
  ), "snack")
}

export function guessCurrentMealType(date = new Date()) {
  const hour = date.getHours()
  if (hour < 11) return "breakfast"
  if (hour < 15) return "lunch"
  if (hour < 21) return "dinner"
  return "snack"
}

export function buildNutritionMemory(meals = [], recipes = []) {
  const foodMap = new Map()
  const recipeUsageMap = new Map()

  meals.forEach((meal) => {
    const key = canonicalName(meal.food_name)
    if (!key) return

    const current = foodMap.get(key) || {
      key,
      name: meal.food_name,
      count: 0,
      days: new Set(),
      mealTypeCounts: { breakfast: 0, lunch: 0, dinner: 0, snack: 0 },
      totalCalories: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      lastLoggedAt: "",
      sampleQuantity: meal.quantity || "1 serve",
      source: meal.nutrition_source || "",
    }

    current.count += 1
    current.days.add(meal.date || "")
    current.mealTypeCounts[meal.meal_type || "snack"] = (current.mealTypeCounts[meal.meal_type || "snack"] || 0) + 1
    current.totalCalories += Number(meal.calories) || 0
    current.totalProtein += Number(meal.protein_g) || 0
    current.totalCarbs += Number(meal.carbs_g) || 0
    current.totalFat += Number(meal.fat_g) || 0
    current.lastLoggedAt = String(meal.date || current.lastLoggedAt || "") > String(current.lastLoggedAt || "") ? String(meal.date || "") : current.lastLoggedAt
    if (!current.source && meal.nutrition_source) current.source = meal.nutrition_source

    foodMap.set(key, current)

    const recipeMatch = recipes.find((recipe) => canonicalName(recipe.name) === key)
    if (recipeMatch) {
      const usage = recipeUsageMap.get(recipeMatch.id) || { count: 0, lastLoggedAt: "" }
      usage.count += 1
      usage.lastLoggedAt = String(meal.date || usage.lastLoggedAt || "") > String(usage.lastLoggedAt || "") ? String(meal.date || "") : usage.lastLoggedAt
      recipeUsageMap.set(recipeMatch.id, usage)
    }
  })

  const foods = [...foodMap.values()].map((entry) => {
    const averageCalories = Math.round(entry.totalCalories / entry.count)
    const averageProtein = roundMacro(entry.totalProtein / entry.count)
    const averageCarbs = roundMacro(entry.totalCarbs / entry.count)
    const averageFat = roundMacro(entry.totalFat / entry.count)
    return {
      id: `memory_${entry.key}`,
      key: entry.key,
      name: entry.name,
      count: entry.count,
      daysSeen: entry.days.size,
      lastLoggedAt: entry.lastLoggedAt,
      favoriteMealType: bestMealType(entry.mealTypeCounts),
      mealTypeCounts: entry.mealTypeCounts,
      calories: averageCalories,
      protein_g: averageProtein,
      carbs_g: averageCarbs,
      fat_g: averageFat,
      quantity: entry.sampleQuantity,
      source: entry.source,
      proteinDensity: averageCalories > 0 ? roundMacro((averageProtein / averageCalories) * 100) : averageProtein,
    }
  })

  const stapleFoods = foods
    .filter((entry) => entry.count >= 2)
    .sort((left, right) => right.count - left.count || right.daysSeen - left.daysSeen || sortByRecency(left, right))

  const highProteinFoods = foods
    .filter((entry) => entry.protein_g >= 10)
    .sort((left, right) => right.proteinDensity - left.proteinDensity || right.protein_g - left.protein_g || right.count - left.count)

  const foodsByMealType = Object.fromEntries(
    trackedMealTypes.map((mealType) => [
      mealType,
      foods
        .filter((entry) => (entry.mealTypeCounts?.[mealType] || 0) > 0)
        .sort((left, right) => (right.mealTypeCounts?.[mealType] || 0) - (left.mealTypeCounts?.[mealType] || 0) || right.count - left.count || sortByRecency(left, right))
        .slice(0, 5),
    ])
  )

  const repeatRecipes = recipes
    .map((recipe) => ({
      ...recipe,
      usageCount: recipeUsageMap.get(recipe.id)?.count || 0,
      lastLoggedAt: recipeUsageMap.get(recipe.id)?.lastLoggedAt || "",
    }))
    .filter((recipe) => recipe.usageCount > 0)
    .sort((left, right) => right.usageCount - left.usageCount || sortByRecency(left, right))

  return {
    stapleFoods,
    highProteinFoods,
    foodsByMealType,
    repeatRecipes,
    currentMealType: guessCurrentMealType(),
  }
}
