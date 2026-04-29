import { getCloudAccessToken } from "@/lib/cloudSync"
import { generateLocalChefRecipe, searchVerifiedFoods } from "@/lib/nutritionDatabase"

function defaultNutritionUrl() {
  if (typeof window === "undefined") return "http://127.0.0.1:8787/api/nutrition/search"
  const host = window.location.hostname || "127.0.0.1"
  return `${window.location.protocol}//${host}:8787/api/nutrition/search`
}

function defaultNutritionChefUrl() {
  if (typeof window === "undefined") return "http://127.0.0.1:8787/api/nutrition/chef"
  const host = window.location.hostname || "127.0.0.1"
  return `${window.location.protocol}//${host}:8787/api/nutrition/chef`
}

function normalizeLocal(food) {
  return {
    ...food,
    source: food.source,
    source_type: "curated_au_catalogue",
  }
}

export async function searchNutritionDatabase(query) {
  const localResults = searchVerifiedFoods(query).map(normalizeLocal)
  if (import.meta.env.VITE_NUTRITION_API_DISABLED === "true") return localResults

  const endpoint = import.meta.env.VITE_NUTRITION_API_URL || defaultNutritionUrl()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12000)

  try {
    const token = await getCloudAccessToken()
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || "Nutrition lookup failed")
    return Array.isArray(data.results) && data.results.length ? data.results : localResults
  } catch {
    return localResults
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function generateChefRecipe({ pantry, goal = "", mealType = "dinner", profile = {}, servings = 1, allowEstimated = true }) {
  const endpoint = import.meta.env.VITE_NUTRITION_CHEF_API_URL || defaultNutritionChefUrl()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 25000)

  try {
    const token = await getCloudAccessToken()
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ pantry, goal, mealType, profile, servings, allowEstimated }),
      signal: controller.signal,
    })
    const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || "Recipe request failed")
    return data.recipe || null
  } catch {
    return generateLocalChefRecipe(pantry, mealType, servings, allowEstimated)
  } finally {
    window.clearTimeout(timeout)
  }
}
