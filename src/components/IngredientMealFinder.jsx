import { useEffect, useMemo, useState } from "react"
import { ChefHat, Heart, History, Plus, Save, Search, ShieldCheck, ShoppingBasket, Sparkles, Trash2, Utensils } from "lucide-react"
import BarcodeScannerPanel from "@/components/BarcodeScannerPanel"
import ChoiceGrid from "@/components/ChoiceGrid"
import { defaultProfile, starterRecipes, storageKeys } from "@/lib/fitnessDefaults"
import { generateChefRecipe, searchNutritionDatabase } from "@/lib/nutritionApiClient"
import { createIngredientItemFromFood, foodLookupKey, isVerifiedFoodResult, normalizeFoodSnapshot, recalcRecipeFromIngredients, recipeToMeal, roundMacro, scaleQuantityString, scaleRecipeDraft, upsertFoodSnapshot } from "@/lib/nutritionHelpers"
import { buildNutritionMemory } from "@/lib/nutritionMemory"
import { todayISO, uid, useLocalStorage } from "@/lib/useLocalStorage"

const mealTypeChoices = ["breakfast", "lunch", "dinner", "snack"].map((type) => ({
  value: type,
  label: type.charAt(0).toUpperCase() + type.slice(1),
}))

const chefModeChoices = [
  {
    value: "verified_only",
    label: "Verified only",
    description: "Use only matched food data and omit anything uncertain.",
  },
  {
    value: "allow_estimates",
    label: "Allow estimates",
    description: "Broaden pantry recipes and clearly flag estimated ingredients.",
  },
]

function parsePositiveNumber(value, fallback = 1) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function sanitizeDecimalInput(value) {
  const cleaned = String(value || "").replace(/[^0-9.]/g, "")
  const [whole = "", ...rest] = cleaned.split(".")
  return rest.length ? `${whole}.${rest.join("")}` : cleaned
}

function buildCombinedSourceText(items) {
  const sources = [...new Set((items || []).map((item) => item.source).filter(Boolean))]
  return sources.join(" | ").slice(0, 500)
}

function sourceTypeLabel(food) {
  if (food?.source_type === "barcode_label") return "Barcode label"
  if (food?.source_type === "open_food_facts_label") return "Product label"
  if (food?.source_type === "curated_au_catalogue") return "Curated AU reference"
  if (food?.source_type === "manual_user_entry") return "Manual"
  return "Reference"
}

function createManualFoodLine() {
  return {
    id: uid("manual_food"),
    name: "",
    quantity: "1 serve",
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    source: "Manual user-entered macros",
    source_type: "manual_user_entry",
    category: "custom",
    aliases: [],
  }
}

function normalizeIngredientItems(items) {
  return (Array.isArray(items) ? items : []).map((ingredient, index) => ({
    id: ingredient.id || uid(`ingredient_${index}`),
    name: ingredient.name || "Ingredient",
    quantity: ingredient.quantity || "1 serve",
    estimated: Boolean(ingredient.estimated),
    source: ingredient.source || "",
    source_type: ingredient.source_type || (ingredient.estimated ? "estimated" : "reference"),
    calories: Math.round(Number(ingredient.calories) || 0),
    protein_g: roundMacro(ingredient.protein_g),
    carbs_g: roundMacro(ingredient.carbs_g),
    fat_g: roundMacro(ingredient.fat_g),
  }))
}

function buildRecipeFromBuilderItems(title, mealType, builderItems) {
  const ingredientItems = builderItems.map((entry) => {
    const multiplier = parsePositiveNumber(entry.multiplier, 1)
    const food = normalizeFoodSnapshot(entry.food)
    return createIngredientItemFromFood(food, {
      id: uid("ingredient"),
      quantity: food.source_type === "manual_user_entry" ? food.quantity : scaleQuantityString(food.quantity, multiplier),
      calories: Math.round((Number(food.calories) || 0) * multiplier),
      protein_g: roundMacro((Number(food.protein_g) || 0) * multiplier),
      carbs_g: roundMacro((Number(food.carbs_g) || 0) * multiplier),
      fat_g: roundMacro((Number(food.fat_g) || 0) * multiplier),
      estimated: food.source_type === "manual_user_entry",
    })
  })

  return recalcRecipeFromIngredients({
    title: title || "Custom meal",
    description: "Built in the Nutrition meal builder.",
    meal_type: mealType,
    servings: 1,
    ingredients: ingredientItems,
    steps: [],
    notes: buildCombinedSourceText(ingredientItems),
  })
}

export default function IngredientMealFinder() {
  const [profile] = useLocalStorage(storageKeys.profile, defaultProfile)
  const [recipes, setRecipes] = useLocalStorage(storageKeys.recipes, starterRecipes)
  const [meals, setMeals] = useLocalStorage(storageKeys.meals, [])
  const [, setShopping] = useLocalStorage(storageKeys.shopping, [])
  const [favoriteFoods, setFavoriteFoods] = useLocalStorage(storageKeys.favoriteFoods, [])
  const [recentFoods, setRecentFoods] = useLocalStorage(storageKeys.recentFoods, [])

  const [builderSearch, setBuilderSearch] = useState("")
  const [builderMealType, setBuilderMealType] = useState("dinner")
  const [builderName, setBuilderName] = useState("")
  const [builderResults, setBuilderResults] = useState([])
  const [builderItems, setBuilderItems] = useState([])
  const [builderSearching, setBuilderSearching] = useState(false)
  const [builderStatus, setBuilderStatus] = useState("")

  const [chefPantry, setChefPantry] = useState("")
  const [chefGoal, setChefGoal] = useState("")
  const [chefMealType, setChefMealType] = useState("dinner")
  const [chefMode, setChefMode] = useState("allow_estimates")
  const [chefServingsInput, setChefServingsInput] = useState("2")
  const [chefLoading, setChefLoading] = useState(false)
  const [chefStatus, setChefStatus] = useState("")
  const [chefRecipe, setChefRecipe] = useState(null)

  useEffect(() => {
    let cancelled = false
    const query = builderSearch.trim()
    if (query.length < 2) {
      setBuilderResults([])
      setBuilderSearching(false)
      return () => {
        cancelled = true
      }
    }

    const search = async () => {
      setBuilderSearching(true)
      setBuilderStatus("")
      try {
        const results = await searchNutritionDatabase(query)
        if (!cancelled) setBuilderResults(results.slice(0, 12))
      } catch (error) {
        if (!cancelled) setBuilderStatus(error instanceof Error ? error.message : "Food search failed.")
      } finally {
        if (!cancelled) setBuilderSearching(false)
      }
    }

    const timeout = window.setTimeout(search, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [builderSearch])

  const favoriteKeys = useMemo(() => new Set(favoriteFoods.map((food) => foodLookupKey(food))), [favoriteFoods])
  const nutritionMemory = useMemo(() => buildNutritionMemory(meals, recipes), [meals, recipes])

  const filteredBuilderResults = useMemo(() => {
    if (!builderResults.length) return []
    if (chefMode === "verified_only") return builderResults.filter((food) => isVerifiedFoodResult(food))
    return builderResults
  }, [builderResults, chefMode])

  const quickFoods = useMemo(() => ({
    favorites: favoriteFoods.slice(0, 6),
    recent: recentFoods.slice(0, 6),
    staples: nutritionMemory.foodsByMealType[builderMealType] || nutritionMemory.stapleFoods.slice(0, 6),
  }), [builderMealType, favoriteFoods, nutritionMemory, recentFoods])

  const builderRecipePreview = useMemo(
    () => buildRecipeFromBuilderItems(builderName.trim() || builderItems.map((entry) => entry.food.name).join(" + "), builderMealType, builderItems),
    [builderItems, builderMealType, builderName]
  )

  const touchRecentFood = (food) => {
    setRecentFoods((current) => upsertFoodSnapshot(current, food, 12))
  }

  const toggleFavoriteFood = (food) => {
    const snapshot = normalizeFoodSnapshot(food)
    const key = foodLookupKey(snapshot)
    setFavoriteFoods((current) => favoriteKeys.has(key)
      ? current.filter((item) => foodLookupKey(item) !== key)
      : upsertFoodSnapshot(current, snapshot, 20))
  }

  const addBuilderFood = (food) => {
    const snapshot = normalizeFoodSnapshot(food)
    touchRecentFood(snapshot)
    setBuilderItems((current) => {
      const existing = current.find((entry) => foodLookupKey(entry.food) === foodLookupKey(snapshot))
      if (existing) {
        return current.map((entry) => foodLookupKey(entry.food) === foodLookupKey(snapshot)
          ? { ...entry, multiplier: String(parsePositiveNumber(entry.multiplier, 1) + 1) }
          : entry)
      }
      return [...current, { key: uid("builder"), food: snapshot, multiplier: "1" }]
    })
    setBuilderStatus("")
  }

  const addManualBuilderLine = () => {
    setBuilderItems((current) => [...current, { key: uid("builder"), food: createManualFoodLine(), multiplier: "1" }])
  }

  const updateBuilderMultiplier = (key, value) => {
    setBuilderItems((current) => current.map((entry) => entry.key === key ? { ...entry, multiplier: sanitizeDecimalInput(value) } : entry))
  }

  const updateBuilderFood = (key, patch) => {
    setBuilderItems((current) => current.map((entry) => entry.key === key ? { ...entry, food: { ...entry.food, ...patch } } : entry))
  }

  const removeBuilderItem = (key) => {
    setBuilderItems((current) => current.filter((entry) => entry.key !== key))
  }

  const logBuilderMeal = () => {
    if (!builderItems.length) {
      setBuilderStatus("Add at least one food before logging a meal.")
      return
    }

    const meal = recipeToMeal(builderRecipePreview, 1)
    setMeals((current) => [{
      id: uid("meal"),
      date: todayISO(),
      meal_type: builderMealType,
      food_name: builderRecipePreview.title,
      quantity: meal.quantity,
      calories: meal.calories,
      protein_g: meal.protein_g,
      carbs_g: meal.carbs_g,
      fat_g: meal.fat_g,
      estimated: builderRecipePreview.ingredients.some((ingredient) => ingredient.estimated),
      nutrition_source: builderRecipePreview.notes || buildCombinedSourceText(builderRecipePreview.ingredients),
      notes: "Logged from meal builder",
    }, ...current])

    builderItems.forEach((entry) => touchRecentFood(entry.food))
    setBuilderStatus("Meal logged.")
    setBuilderItems([])
    setBuilderName("")
    setBuilderSearch("")
    setBuilderResults([])
  }

  const saveBuilderRecipe = () => {
    if (!builderItems.length) {
      setBuilderStatus("Add foods first, then save the combination as a recipe.")
      return
    }

    const recipe = builderRecipePreview
    setRecipes((current) => [{
      id: uid("recipe"),
      name: recipe.title,
      meal_type: recipe.meal_type,
      description: recipe.description,
      ingredients: recipe.ingredients.map((ingredient) => `${ingredient.quantity} ${ingredient.name}`.trim()),
      ingredient_items: recipe.ingredients,
      steps: recipe.steps,
      total_calories: recipe.totals.calories,
      total_protein_g: recipe.totals.protein_g,
      total_carbs_g: recipe.totals.carbs_g,
      total_fat_g: recipe.totals.fat_g,
      servings: recipe.servings,
      nutrition_source: recipe.notes || buildCombinedSourceText(recipe.ingredients),
    }, ...current])
    setBuilderStatus("Recipe saved.")
  }

  const buildChefMeal = async () => {
    if (!chefPantry.trim()) {
      setChefStatus("Add the ingredients you have on hand before generating a recipe.")
      return
    }

    setChefLoading(true)
    setChefStatus("")
    try {
      const recipe = await generateChefRecipe({
        pantry: chefPantry,
        goal: chefGoal,
        mealType: chefMealType,
        servings: parsePositiveNumber(chefServingsInput, 2),
        allowEstimated: chefMode === "allow_estimates",
        profile,
      })
      const normalizedRecipe = recalcRecipeFromIngredients({
        ...recipe,
        ingredients: normalizeIngredientItems(recipe?.ingredients),
      })
      setChefRecipe(normalizedRecipe)
      setChefServingsInput(String(normalizedRecipe.servings || parsePositiveNumber(chefServingsInput, 2)))
      setChefStatus(normalizedRecipe ? "Recipe ready." : "No recipe returned.")
    } catch (error) {
      setChefStatus(error instanceof Error ? error.message : "Recipe generation failed.")
    } finally {
      setChefLoading(false)
    }
  }

  const updateChefIngredient = (ingredientId, patch) => {
    setChefRecipe((current) => current ? recalcRecipeFromIngredients({
      ...current,
      ingredients: current.ingredients.map((ingredient) => ingredient.id === ingredientId ? { ...ingredient, ...patch } : ingredient),
    }) : current)
  }

  const removeChefIngredient = (ingredientId) => {
    setChefRecipe((current) => current ? recalcRecipeFromIngredients({
      ...current,
      ingredients: current.ingredients.filter((ingredient) => ingredient.id !== ingredientId),
    }) : current)
  }

  const addChefIngredientLine = () => {
    setChefRecipe((current) => current ? recalcRecipeFromIngredients({
      ...current,
      ingredients: [...current.ingredients, {
        id: uid("ingredient"),
        name: "",
        quantity: "1 serve",
        estimated: true,
        source: "Manual recipe line",
        source_type: "manual_user_entry",
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
      }],
    }) : current)
  }

  const rescaleChefRecipe = (value) => {
    const sanitized = sanitizeDecimalInput(value)
    setChefServingsInput(sanitized)
    if (!chefRecipe || !sanitized) return
    setChefRecipe((current) => current ? scaleRecipeDraft(current, parsePositiveNumber(sanitized, current.servings)) : current)
  }

  const logChefRecipe = () => {
    if (!chefRecipe) return

    const meal = recipeToMeal(chefRecipe, 1)
    const estimated = chefRecipe.ingredients?.some((ingredient) => ingredient.estimated)
    setMeals((current) => [{
      id: uid("meal"),
      date: todayISO(),
      meal_type: chefRecipe.meal_type || chefMealType,
      food_name: chefRecipe.title,
      quantity: meal.quantity,
      calories: meal.calories,
      protein_g: meal.protein_g,
      carbs_g: meal.carbs_g,
      fat_g: meal.fat_g,
      estimated,
      nutrition_source: estimated ? `Recipe studio output (mixed verified + estimated sources). ${chefRecipe.notes || ""}` : `Recipe studio output from matched food data. ${chefRecipe.notes || ""}`,
      notes: `Pantry recipe. ${chefRecipe.servings || 1} servings total.`,
    }, ...current])
    chefRecipe.ingredients.forEach((ingredient) => {
      if (!ingredient.estimated) touchRecentFood(ingredient)
    })
    setChefStatus("Recipe logged as a meal.")
  }

  const saveChefRecipe = () => {
    if (!chefRecipe) return
    setRecipes((current) => [{
      id: uid("recipe"),
      name: chefRecipe.title,
      meal_type: chefRecipe.meal_type || chefMealType,
      description: chefRecipe.description || "Saved from recipe studio.",
      ingredients: chefRecipe.ingredients.map((ingredient) => `${ingredient.quantity} ${ingredient.name}`.trim()),
      ingredient_items: chefRecipe.ingredients,
      steps: chefRecipe.steps || [],
      total_calories: chefRecipe.totals?.calories || 0,
      total_protein_g: chefRecipe.totals?.protein_g || 0,
      total_carbs_g: chefRecipe.totals?.carbs_g || 0,
      total_fat_g: chefRecipe.totals?.fat_g || 0,
      servings: chefRecipe.servings || parsePositiveNumber(chefServingsInput, 2),
      nutrition_source: chefRecipe.notes || "Generated from recipe studio.",
    }, ...current])
    setChefStatus("Recipe saved.")
  }

  const addChefIngredientsToShopping = () => {
    if (!chefRecipe) return
    setShopping((current) => [
      ...chefRecipe.ingredients.map((ingredient) => ({
        id: uid("shop"),
        name: ingredient.name,
        quantity: ingredient.quantity,
        category: "recipe",
        purchased: false,
        list_date: todayISO(),
      })),
      ...current,
    ])
    setChefStatus("Ingredients added to shopping list.")
  }

  const quickLogSavedRecipe = (recipe) => {
    const meal = recipeToMeal({
      title: recipe.name,
      servings: recipe.servings || 1,
      per_serving: recipe.per_serving,
      totals: {
        calories: recipe.total_calories,
        protein_g: recipe.total_protein_g,
        carbs_g: recipe.total_carbs_g,
        fat_g: recipe.total_fat_g,
      },
    }, 1)

    setMeals((current) => [{
      id: uid("meal"),
      date: todayISO(),
      meal_type: recipe.meal_type || "snack",
      food_name: recipe.name,
      quantity: meal.quantity,
      calories: meal.calories,
      protein_g: meal.protein_g,
      carbs_g: meal.carbs_g,
      fat_g: meal.fat_g,
      estimated: !recipe.nutrition_source?.toLowerCase().includes("verified"),
      nutrition_source: recipe.nutrition_source || "Saved recipe",
      notes: "Logged from saved recipe shortcut",
    }, ...current])
    setBuilderStatus(`Logged ${recipe.name}.`)
  }

  const quickAddSavedRecipeToShopping = (recipe) => {
    const items = recipe.ingredient_items?.length
      ? recipe.ingredient_items.map((ingredient) => ({ name: ingredient.name, quantity: ingredient.quantity }))
      : (recipe.ingredients || []).map((ingredient) => ({ name: ingredient, quantity: "" }))

    setShopping((current) => [
      ...items.map((ingredient) => ({
        id: uid("shop"),
        name: ingredient.name,
        quantity: ingredient.quantity,
        category: "recipe",
        purchased: false,
        list_date: todayISO(),
      })),
      ...current,
    ])
    setBuilderStatus(`Added ${recipe.name} ingredients to the shopping list.`)
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-950">Meal builder and recipe studio</h2>
          <p className="mt-1 text-sm text-slate-500">
            Search foods or barcodes, build any combination, save staple items, and turn pantry ingredients into editable recipes with calculated macros.
          </p>
        </div>
        <ChefHat size={20} className="shrink-0 text-indigo-600" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-indigo-600" />
            <h3 className="font-semibold text-slate-950">Build any meal</h3>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Search any food or barcode/EAN/UPC, add as many lines as you want, then log the combined totals.
          </p>

          <input
            value={builderSearch}
            onChange={(event) => setBuilderSearch(event.target.value)}
            placeholder="Search food or paste barcode: sushi, cereal, 9300605123456"
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950"
          />
          <BarcodeScannerPanel
            className="mt-3"
            buttonLabel="Scan barcode"
            helperText="Scan a food packet and I'll pull the nutrition label into your builder search."
            onDetected={(code) => {
              setBuilderSearch(code)
              setBuilderStatus(`Barcode ${code} captured. Searching...`)
            }}
          />

          <ChoiceGrid
            label="Meal type"
            value={builderMealType}
            onChange={setBuilderMealType}
            options={mealTypeChoices}
            className="mt-3"
          />

          <input
            value={builderName}
            onChange={(event) => setBuilderName(event.target.value)}
            placeholder="Optional meal name"
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950"
          />

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <Utensils size={16} className="text-emerald-600" />
                <p className="font-semibold text-slate-950">Learned staples</p>
              </div>
              <div className="mt-2 space-y-2">
                {quickFoods.staples.slice(0, 6).map((food) => (
                  <button key={foodLookupKey(food)} type="button" onClick={() => addBuilderFood(food)} className="w-full rounded-lg bg-white p-3 text-left text-sm hover:bg-indigo-50">
                    <p className="font-medium text-slate-950">{food.name}</p>
                    <p className="text-slate-500">{food.calories} kcal - {food.protein_g}g protein</p>
                  </button>
                ))}
                {!quickFoods.staples.length && <p className="rounded-lg bg-white p-3 text-sm text-slate-500">As you repeat meals, the builder will learn your staples here.</p>}
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <Heart size={16} className="text-rose-500" />
                <p className="font-semibold text-slate-950">Favourite foods</p>
              </div>
              <div className="mt-2 space-y-2">
                {quickFoods.favorites.map((food) => (
                  <button key={foodLookupKey(food)} type="button" onClick={() => addBuilderFood(food)} className="w-full rounded-lg bg-white p-3 text-left text-sm hover:bg-indigo-50">
                    <p className="font-medium text-slate-950">{food.name}</p>
                    <p className="text-slate-500">{food.calories} kcal - {food.protein_g}g protein</p>
                  </button>
                ))}
                {!quickFoods.favorites.length && <p className="rounded-lg bg-white p-3 text-sm text-slate-500">Star foods from search results to pin them here.</p>}
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <History size={16} className="text-indigo-600" />
                <p className="font-semibold text-slate-950">Recent foods</p>
              </div>
              <div className="mt-2 space-y-2">
                {quickFoods.recent.map((food) => (
                  <button key={foodLookupKey(food)} type="button" onClick={() => addBuilderFood(food)} className="w-full rounded-lg bg-white p-3 text-left text-sm hover:bg-indigo-50">
                    <p className="font-medium text-slate-950">{food.name}</p>
                    <p className="text-slate-500">{food.calories} kcal - {food.protein_g}g protein</p>
                  </button>
                ))}
                {!quickFoods.recent.length && <p className="rounded-lg bg-white p-3 text-sm text-slate-500">Foods you add or log here will show up again for fast reuse.</p>}
              </div>
            </div>
          </div>

          {builderSearching && <p className="mt-3 text-sm text-slate-500">Searching nutrition sources...</p>}

          {filteredBuilderResults.length > 0 && (
            <div className="mt-3 max-h-80 space-y-2 overflow-auto pr-1">
              {filteredBuilderResults.map((food) => {
                const favorite = favoriteKeys.has(foodLookupKey(food))
                return (
                  <div key={food.id} className="rounded-lg bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => addBuilderFood(food)} className="flex-1 text-left">
                        <p className="font-semibold text-slate-950">{food.name}</p>
                        <p className="text-sm text-slate-500">{food.quantity} - {food.calories} kcal - {food.protein_g}g protein</p>
                        <p className="mt-1 text-sm text-emerald-700">{sourceTypeLabel(food)} - {food.source}</p>
                      </button>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => toggleFavoriteFood(food)} className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg border ${favorite ? "border-rose-200 bg-rose-50 text-rose-600" : "border-slate-200 bg-white text-slate-400"}`}>
                          <Heart size={16} className={favorite ? "fill-current" : ""} />
                        </button>
                        <button type="button" onClick={() => addBuilderFood(food)} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-indigo-600 text-white">
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-slate-950">Meal preview</p>
              <div className="flex gap-2">
                <button type="button" onClick={addManualBuilderLine} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                  + Manual line
                </button>
                <p className="text-sm text-slate-500">{builderItems.length} item{builderItems.length === 1 ? "" : "s"}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {builderItems.map((entry) => (
                <div key={entry.key} className="rounded-lg bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-950">{entry.food.name || "Custom item"}</p>
                      <p className="text-sm text-slate-500">{sourceTypeLabel(entry.food)} - {entry.food.calories} kcal - {entry.food.protein_g}g protein per serve</p>
                    </div>
                    <button type="button" onClick={() => removeBuilderItem(entry.key)} className="min-h-11 min-w-11 rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-rose-600">
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <label className="grid gap-1 text-sm text-slate-600">
                      Quantity
                      <input value={entry.food.quantity} onChange={(event) => updateBuilderFood(entry.key, { quantity: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
                    </label>
                    <label className="grid gap-1 text-sm text-slate-600">
                      Serves / multiplier
                      <input value={entry.multiplier} onChange={(event) => updateBuilderMultiplier(entry.key, event.target.value)} inputMode="decimal" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
                    </label>
                  </div>

                  {entry.food.source_type === "manual_user_entry" && (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <label className="grid gap-1 text-sm text-slate-600 md:col-span-2">
                        Food name
                        <input value={entry.food.name} onChange={(event) => updateBuilderFood(entry.key, { name: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
                      </label>
                      <label className="grid gap-1 text-sm text-slate-600">
                        Calories
                        <input value={entry.food.calories} onChange={(event) => updateBuilderFood(entry.key, { calories: sanitizeDecimalInput(event.target.value) })} inputMode="decimal" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
                      </label>
                      <label className="grid gap-1 text-sm text-slate-600">
                        Protein g
                        <input value={entry.food.protein_g} onChange={(event) => updateBuilderFood(entry.key, { protein_g: sanitizeDecimalInput(event.target.value) })} inputMode="decimal" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
                      </label>
                      <label className="grid gap-1 text-sm text-slate-600">
                        Carbs g
                        <input value={entry.food.carbs_g} onChange={(event) => updateBuilderFood(entry.key, { carbs_g: sanitizeDecimalInput(event.target.value) })} inputMode="decimal" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
                      </label>
                      <label className="grid gap-1 text-sm text-slate-600">
                        Fat g
                        <input value={entry.food.fat_g} onChange={(event) => updateBuilderFood(entry.key, { fat_g: sanitizeDecimalInput(event.target.value) })} inputMode="decimal" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
                      </label>
                    </div>
                  )}
                </div>
              ))}
              {!builderItems.length && <p className="rounded-lg bg-white p-3 text-sm text-slate-500">No foods added yet.</p>}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-white p-3"><p className="text-slate-500">Calories</p><p className="font-bold text-slate-950">{builderRecipePreview.totals.calories}</p></div>
              <div className="rounded-lg bg-white p-3"><p className="text-slate-500">Protein</p><p className="font-bold text-slate-950">{builderRecipePreview.totals.protein_g}g</p></div>
              <div className="rounded-lg bg-white p-3"><p className="text-slate-500">Carbs</p><p className="font-bold text-slate-950">{builderRecipePreview.totals.carbs_g}g</p></div>
              <div className="rounded-lg bg-white p-3"><p className="text-slate-500">Fat</p><p className="font-bold text-slate-950">{builderRecipePreview.totals.fat_g}g</p></div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={logBuilderMeal} className="flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
                <Utensils size={16} /> Log meal
              </button>
              <button type="button" onClick={saveBuilderRecipe} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
                <Save size={16} /> Save recipe
              </button>
            </div>
          </div>
          {builderStatus && <p className="mt-3 text-sm font-medium text-slate-600">{builderStatus}</p>}
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-600" />
            <h3 className="font-semibold text-slate-950">Recipe studio</h3>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Turn kitchen ingredients into a recipe, then edit every line before you log or save it.
          </p>

          <textarea
            value={chefPantry}
            onChange={(event) => setChefPantry(event.target.value)}
            placeholder="Example: chicken thigh, jasmine rice, broccoli, Greek yoghurt, lemon, garlic"
            className="mt-3 min-h-28 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950"
          />

          <input
            value={chefGoal}
            onChange={(event) => setChefGoal(event.target.value)}
            placeholder="Optional goal: high protein, under 700 kcal, post-workout"
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950"
          />

          <div className="mt-3 grid gap-3">
            <ChoiceGrid label="Meal type" value={chefMealType} onChange={setChefMealType} options={mealTypeChoices} />
            <ChoiceGrid label="Recipe mode" value={chefMode} onChange={setChefMode} options={chefModeChoices} columns={1} />
            <div className="grid gap-1">
              <label className="text-sm font-medium text-slate-700">Servings</label>
              <input value={chefServingsInput} onChange={(event) => setChefServingsInput(sanitizeDecimalInput(event.target.value))} inputMode="decimal" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950" />
            </div>
          </div>

          <button
            type="button"
            onClick={buildChefMeal}
            disabled={chefLoading}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            <ChefHat size={16} /> {chefLoading ? "Cooking..." : "Create recipe"}
          </button>

          {chefRecipe && (
            <div className="mt-4 rounded-lg bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <input
                    value={chefRecipe.title}
                    onChange={(event) => setChefRecipe((current) => current ? { ...current, title: event.target.value } : current)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-semibold text-slate-950"
                  />
                  <textarea
                    value={chefRecipe.description || ""}
                    onChange={(event) => setChefRecipe((current) => current ? { ...current, description: event.target.value } : current)}
                    className="mt-2 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <ChefHat size={18} className="shrink-0 text-indigo-600" />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="grid gap-1">
                  <label className="text-sm font-medium text-slate-700">Scale recipe servings</label>
                  <input value={chefServingsInput} onChange={(event) => rescaleChefRecipe(event.target.value)} inputMode="decimal" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950" />
                </div>
                <div className="rounded-lg bg-white p-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-indigo-600" />
                    <p className="text-sm font-semibold text-slate-950">{chefMode === "verified_only" ? "Verified-only mode" : "Estimated ingredients allowed"}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{chefRecipe.notes}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-white p-3"><p className="text-slate-500">Total kcal</p><p className="font-bold text-slate-950">{chefRecipe.totals.calories}</p></div>
                <div className="rounded-lg bg-white p-3"><p className="text-slate-500">Per serve kcal</p><p className="font-bold text-slate-950">{chefRecipe.per_serving.calories}</p></div>
                <div className="rounded-lg bg-white p-3"><p className="text-slate-500">Per serve protein</p><p className="font-bold text-slate-950">{chefRecipe.per_serving.protein_g}g</p></div>
                <div className="rounded-lg bg-white p-3"><p className="text-slate-500">Per serve carbs / fat</p><p className="font-bold text-slate-950">{chefRecipe.per_serving.carbs_g}g / {chefRecipe.per_serving.fat_g}g</p></div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">Editable ingredients</p>
                  <button type="button" onClick={addChefIngredientLine} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                    + Add line
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {chefRecipe.ingredients.map((ingredient) => (
                    <div key={ingredient.id} className="rounded-lg bg-white p-3">
                      <div className="grid gap-2 md:grid-cols-[1.2fr_1fr_auto]">
                        <input value={ingredient.name} onChange={(event) => updateChefIngredient(ingredient.id, { name: event.target.value })} placeholder="Ingredient" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950" />
                        <input value={ingredient.quantity} onChange={(event) => updateChefIngredient(ingredient.id, { quantity: event.target.value })} placeholder="Quantity" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950" />
                        <button type="button" onClick={() => removeChefIngredient(ingredient.id)} className="min-h-11 min-w-11 rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-rose-600">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
                        <input value={ingredient.calories} onChange={(event) => updateChefIngredient(ingredient.id, { calories: sanitizeDecimalInput(event.target.value) })} inputMode="decimal" placeholder="kcal" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950" />
                        <input value={ingredient.protein_g} onChange={(event) => updateChefIngredient(ingredient.id, { protein_g: sanitizeDecimalInput(event.target.value) })} inputMode="decimal" placeholder="Protein" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950" />
                        <input value={ingredient.carbs_g} onChange={(event) => updateChefIngredient(ingredient.id, { carbs_g: sanitizeDecimalInput(event.target.value) })} inputMode="decimal" placeholder="Carbs" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950" />
                        <input value={ingredient.fat_g} onChange={(event) => updateChefIngredient(ingredient.id, { fat_g: sanitizeDecimalInput(event.target.value) })} inputMode="decimal" placeholder="Fat" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950" />
                        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                          <input type="checkbox" checked={ingredient.estimated} onChange={(event) => updateChefIngredient(ingredient.id, { estimated: event.target.checked, source_type: event.target.checked ? "estimated" : ingredient.source_type || "reference" })} />
                          Estimated
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-950">Steps</p>
                <div className="mt-2 space-y-2">
                  {(chefRecipe.steps || []).map((step, index) => (
                    <input
                      key={`${index}_${step}`}
                      value={step}
                      onChange={(event) => setChefRecipe((current) => current ? { ...current, steps: current.steps.map((item, itemIndex) => itemIndex === index ? event.target.value : item) } : current)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950"
                    />
                  ))}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={logChefRecipe} className="flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
                  <Utensils size={16} /> Log recipe
                </button>
                <button type="button" onClick={saveChefRecipe} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
                  <Save size={16} /> Save recipe
                </button>
                <button type="button" onClick={addChefIngredientsToShopping} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
                  <ShoppingBasket size={16} /> Add to list
                </button>
              </div>
            </div>
          )}
          {chefStatus && <p className="mt-3 text-sm font-medium text-slate-600">{chefStatus}</p>}
        </div>
      </div>

      {recipes.length > 0 && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-950">Saved recipes</p>
          <div className="mt-2 space-y-2">
            {recipes.slice(0, 3).map((recipe) => (
              <div key={recipe.id} className="rounded-lg bg-white p-3">
                <p className="font-medium text-slate-950">{recipe.name}</p>
                <p className="text-sm text-slate-500">{recipe.total_calories} kcal - {recipe.total_protein_g}g protein</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => quickLogSavedRecipe(recipe)} className="flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">
                    <Utensils size={16} /> Log 1 serve
                  </button>
                  <button type="button" onClick={() => quickAddSavedRecipeToShopping(recipe)} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                    <ShoppingBasket size={16} /> Add to list
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
