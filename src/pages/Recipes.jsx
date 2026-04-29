import { useMemo, useState } from "react"
import { Check, Pencil, Plus, ShoppingBasket, Trash2, Utensils, X } from "lucide-react"
import ChoiceGrid from "@/components/ChoiceGrid"
import PageHeader from "@/components/PageHeader"
import { starterRecipes, storageKeys } from "@/lib/fitnessDefaults"
import { findVerifiedFood } from "@/lib/nutritionDatabase"
import { createIngredientItemFromFood, recipeToMeal, roundMacro } from "@/lib/nutritionHelpers"
import { todayISO, uid, useLocalStorage } from "@/lib/useLocalStorage"

const mealTypeChoices = ["all", "breakfast", "lunch", "dinner", "snack"].map((type) => ({
  value: type,
  label: type === "all" ? "All" : type.charAt(0).toUpperCase() + type.slice(1),
}))

function parsePositiveNumber(value, fallback = 1) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function sanitizeDecimalInput(value) {
  const cleaned = String(value || "").replace(/[^0-9.]/g, "")
  const [whole = "", ...rest] = cleaned.split(".")
  return rest.length ? `${whole}.${rest.join("")}` : cleaned
}

function splitLines(text) {
  return String(text || "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function lookupIngredientLine(line) {
  const direct = findVerifiedFood(line)
  if (direct) return direct
  const stripped = line
    .replace(/^[\d./]+\s*/i, "")
    .replace(/^(g|kg|ml|l|cup|cups|tbsp|tsp|slice|slices|serve|serves|x)\s+/i, "")
    .trim()
  return stripped ? findVerifiedFood(stripped) : null
}

function recipeFormFromRecipe(recipe) {
  return {
    name: recipe.name || "",
    meal_type: recipe.meal_type || "dinner",
    description: recipe.description || "",
    ingredients: (recipe.ingredient_items?.length
      ? recipe.ingredient_items.map((ingredient) => `${ingredient.quantity} ${ingredient.name}`.trim())
      : recipe.ingredients || []
    ).join("\n"),
    steps: (recipe.steps || []).join("\n"),
    servings: String(recipe.servings || 1),
    total_calories: recipe.total_calories ? String(recipe.total_calories) : "",
    total_protein_g: recipe.total_protein_g ? String(recipe.total_protein_g) : "",
    total_carbs_g: recipe.total_carbs_g ? String(recipe.total_carbs_g) : "",
    total_fat_g: recipe.total_fat_g ? String(recipe.total_fat_g) : "",
  }
}

function emptyRecipeForm() {
  return {
    name: "",
    meal_type: "dinner",
    description: "",
    ingredients: "",
    steps: "",
    servings: "1",
    total_calories: "",
    total_protein_g: "",
    total_carbs_g: "",
    total_fat_g: "",
  }
}

function buildRecipeRecord(form, existingRecipe = null) {
  const servings = parsePositiveNumber(form.servings, 1)
  const ingredients = splitLines(form.ingredients)
  const verifiedFoods = ingredients.map((ingredient) => lookupIngredientLine(ingredient)).filter(Boolean)
  const verifiedItems = verifiedFoods.map((food) => createIngredientItemFromFood(food, { id: uid("ingredient") }))
  const unmatchedIngredients = ingredients.filter((ingredient) => !lookupIngredientLine(ingredient))

  const verifiedTotals = verifiedItems.reduce((totals, ingredient) => ({
    calories: totals.calories + (Number(ingredient.calories) || 0),
    protein_g: totals.protein_g + (Number(ingredient.protein_g) || 0),
    carbs_g: totals.carbs_g + (Number(ingredient.carbs_g) || 0),
    fat_g: totals.fat_g + (Number(ingredient.fat_g) || 0),
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })

  const totals = {
    calories: Number(form.total_calories) || Math.round(verifiedTotals.calories),
    protein_g: Number(form.total_protein_g) || roundMacro(verifiedTotals.protein_g),
    carbs_g: Number(form.total_carbs_g) || roundMacro(verifiedTotals.carbs_g),
    fat_g: Number(form.total_fat_g) || roundMacro(verifiedTotals.fat_g),
  }

  const sourceParts = []
  if (verifiedItems.length) sourceParts.push("Calculated from verified Australian catalogue ingredients")
  if (unmatchedIngredients.length) sourceParts.push(`Unmatched ingredients: ${unmatchedIngredients.join(", ")}`)
  if (!verifiedItems.length && !unmatchedIngredients.length) sourceParts.push("Manual recipe entry")

  return {
    id: existingRecipe?.id || uid("recipe"),
    name: form.name.trim(),
    meal_type: form.meal_type,
    description: form.description.trim(),
    ingredients,
    ingredient_items: verifiedItems,
    steps: splitLines(form.steps),
    servings,
    total_calories: totals.calories,
    total_protein_g: totals.protein_g,
    total_carbs_g: totals.carbs_g,
    total_fat_g: totals.fat_g,
    per_serving: {
      calories: Math.round(totals.calories / servings),
      protein_g: roundMacro(totals.protein_g / servings),
      carbs_g: roundMacro(totals.carbs_g / servings),
      fat_g: roundMacro(totals.fat_g / servings),
    },
    nutrition_source: sourceParts.join(". "),
  }
}

function RecipeFields({ form, onChange, submitLabel, submitIcon, onSubmit, onCancel = null, compact = false }) {
  const SubmitIcon = submitIcon

  return (
    <div className={`grid gap-3 ${compact ? "" : "md:grid-cols-2"}`}>
      <input value={form.name} onChange={(event) => onChange("name", event.target.value)} placeholder="Recipe name" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
      <input value={form.servings} onChange={(event) => onChange("servings", sanitizeDecimalInput(event.target.value))} inputMode="decimal" placeholder="Servings" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
      <textarea value={form.ingredients} onChange={(event) => onChange("ingredients", event.target.value)} placeholder="Ingredients, comma separated or one per line" className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-slate-950 md:col-span-2" />
      <textarea value={form.steps} onChange={(event) => onChange("steps", event.target.value)} placeholder="Steps, one per line" className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-slate-950 md:col-span-2" />
      <input value={form.total_calories} onChange={(event) => onChange("total_calories", sanitizeDecimalInput(event.target.value))} inputMode="decimal" placeholder="Calories (optional override)" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
      <input value={form.total_protein_g} onChange={(event) => onChange("total_protein_g", sanitizeDecimalInput(event.target.value))} inputMode="decimal" placeholder="Protein g (optional override)" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
      <input value={form.total_carbs_g} onChange={(event) => onChange("total_carbs_g", sanitizeDecimalInput(event.target.value))} inputMode="decimal" placeholder="Carbs g (optional override)" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
      <input value={form.total_fat_g} onChange={(event) => onChange("total_fat_g", sanitizeDecimalInput(event.target.value))} inputMode="decimal" placeholder="Fat g (optional override)" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
      <ChoiceGrid label="Meal type" value={form.meal_type} onChange={(value) => onChange("meal_type", value)} options={mealTypeChoices.filter((option) => option.value !== "all")} className="md:col-span-2" />
      <textarea value={form.description} onChange={(event) => onChange("description", event.target.value)} placeholder="Description" className="min-h-20 rounded-lg border border-slate-200 px-3 py-2 text-slate-950 md:col-span-2" />
      <div className="flex flex-wrap gap-2 md:col-span-2">
        <button type="button" onClick={onSubmit} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white">
          <SubmitIcon size={16} /> {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 font-semibold text-slate-700">
            <X size={16} /> Cancel
          </button>
        )}
      </div>
    </div>
  )
}

export default function Recipes() {
  const [recipes, setRecipes] = useLocalStorage(storageKeys.recipes, starterRecipes)
  const [, setShopping] = useLocalStorage(storageKeys.shopping, [])
  const [, setMeals] = useLocalStorage(storageKeys.meals, [])
  const [filterMealType, setFilterMealType] = useState("all")
  const [logServings, setLogServings] = useState({})
  const [createForm, setCreateForm] = useState(emptyRecipeForm)
  const [editingRecipeId, setEditingRecipeId] = useState("")
  const [editingForm, setEditingForm] = useState(emptyRecipeForm)

  const visibleRecipes = useMemo(
    () => recipes.filter((recipe) => filterMealType === "all" || recipe.meal_type === filterMealType),
    [filterMealType, recipes]
  )

  const updateCreateForm = (key, value) => setCreateForm((current) => ({ ...current, [key]: value }))
  const updateEditingForm = (key, value) => setEditingForm((current) => ({ ...current, [key]: value }))

  const saveNewRecipe = () => {
    if (!createForm.name.trim()) return
    const recipe = buildRecipeRecord(createForm)
    setRecipes((current) => [recipe, ...current])
    setCreateForm(emptyRecipeForm())
  }

  const addToShopping = (recipe) => {
    const ingredients = recipe.ingredient_items?.length
      ? recipe.ingredient_items.map((ingredient) => ({ name: ingredient.name, quantity: ingredient.quantity }))
      : (recipe.ingredients || []).map((name) => ({ name, quantity: "" }))

    setShopping((current) => [
      ...ingredients.map((ingredient) => ({
        id: uid("shop"),
        name: ingredient.name,
        quantity: ingredient.quantity,
        category: "recipe",
        purchased: false,
        list_date: todayISO(),
      })),
      ...current,
    ])
  }

  const removeRecipe = (id) => {
    setRecipes((current) => current.filter((recipe) => recipe.id !== id))
    if (editingRecipeId === id) {
      setEditingRecipeId("")
      setEditingForm(emptyRecipeForm())
    }
  }

  const logRecipe = (recipe) => {
    const servingsToLog = parsePositiveNumber(logServings[recipe.id], 1)
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
    }, servingsToLog)

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
      nutrition_source: recipe.nutrition_source,
      notes: "Logged from saved recipe",
    }, ...current])
  }

  const startEditing = (recipe) => {
    setEditingRecipeId(recipe.id)
    setEditingForm(recipeFormFromRecipe(recipe))
  }

  const saveEditing = (recipe) => {
    if (!editingForm.name.trim()) return
    const nextRecipe = buildRecipeRecord(editingForm, recipe)
    setRecipes((current) => current.map((item) => item.id === recipe.id ? nextRecipe : item))
    setEditingRecipeId("")
    setEditingForm(emptyRecipeForm())
  }

  const cancelEditing = () => {
    setEditingRecipeId("")
    setEditingForm(emptyRecipeForm())
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Recipes" title="Meal templates" subtitle="Save repeatable meals, edit them over time, log scaled servings, and push ingredients straight into the shopping list." />

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <RecipeFields form={createForm} onChange={updateCreateForm} submitLabel="Save recipe" submitIcon={Plus} onSubmit={saveNewRecipe} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <ChoiceGrid label="Filter recipes" value={filterMealType} onChange={setFilterMealType} options={mealTypeChoices} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleRecipes.map((recipe) => {
          const perServing = recipe.per_serving || {
            calories: Math.round((recipe.total_calories || 0) / (recipe.servings || 1)),
            protein_g: roundMacro((recipe.total_protein_g || 0) / (recipe.servings || 1)),
            carbs_g: roundMacro((recipe.total_carbs_g || 0) / (recipe.servings || 1)),
            fat_g: roundMacro((recipe.total_fat_g || 0) / (recipe.servings || 1)),
          }
          const editing = editingRecipeId === recipe.id

          return (
            <article key={recipe.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{recipe.meal_type}</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-950">{recipe.name}</h2>
                </div>
                <div className="flex gap-2">
                  <button type="button" aria-label={`Edit ${recipe.name}`} onClick={() => startEditing(recipe)} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-indigo-600">
                    <Pencil size={16} />
                  </button>
                  <button type="button" aria-label={`Remove ${recipe.name}`} onClick={() => removeRecipe(recipe.id)} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-rose-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {editing ? (
                <div className="mt-4 rounded-lg bg-slate-50 p-3">
                  <RecipeFields form={editingForm} onChange={updateEditingForm} submitLabel="Save changes" submitIcon={Check} onSubmit={() => saveEditing(recipe)} onCancel={cancelEditing} compact />
                </div>
              ) : (
                <>
                  <p className="mt-2 text-sm text-slate-600">{recipe.description}</p>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-slate-500">Total kcal</p>
                      <p className="font-bold text-slate-950">{recipe.total_calories}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-slate-500">Servings</p>
                      <p className="font-bold text-slate-950">{recipe.servings || 1}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-slate-500">Per serve protein</p>
                      <p className="font-bold text-slate-950">{perServing.protein_g}g</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-slate-500">Per serve carbs / fat</p>
                      <p className="font-bold text-slate-950">{perServing.carbs_g}g / {perServing.fat_g}g</p>
                    </div>
                  </div>

                  {recipe.nutrition_source && <p className="mt-3 text-sm text-emerald-700">{recipe.nutrition_source}</p>}

                  <div className="mt-3 space-y-2">
                    {(recipe.ingredient_items?.length ? recipe.ingredient_items : recipe.ingredients || []).map((ingredient) => {
                      const isObject = typeof ingredient === "object" && ingredient !== null
                      const key = isObject ? ingredient.id : ingredient
                      return (
                        <div key={key} className="rounded-lg bg-slate-50 p-3 text-sm">
                          <p className="font-medium text-slate-950">{isObject ? ingredient.name : ingredient}</p>
                          {isObject ? (
                            <p className="text-slate-500">
                              {ingredient.quantity} - {ingredient.calories} kcal - {ingredient.protein_g}g protein
                            </p>
                          ) : (
                            <p className="text-slate-500">Saved ingredient</p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {recipe.steps?.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-semibold text-slate-950">Steps</p>
                      <ol className="mt-2 space-y-2 text-sm text-slate-600">
                        {recipe.steps.map((step, index) => <li key={`${recipe.id}_step_${index}`}>{index + 1}. {step}</li>)}
                      </ol>
                    </div>
                  )}

                  <div className="mt-4 grid gap-2">
                    <label className="grid gap-1 text-sm text-slate-600">
                      Log servings
                      <input
                        value={logServings[recipe.id] || "1"}
                        onChange={(event) => setLogServings((current) => ({ ...current, [recipe.id]: sanitizeDecimalInput(event.target.value) }))}
                        inputMode="decimal"
                        className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => logRecipe(recipe)} className="flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"><Utensils size={16} /> Log meal</button>
                      <button type="button" onClick={() => addToShopping(recipe)} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"><ShoppingBasket size={16} /> Add to list</button>
                    </div>
                  </div>
                </>
              )}
            </article>
          )
        })}
        {!visibleRecipes.length && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">No recipes match this filter yet.</p>}
      </section>
    </div>
  )
}
