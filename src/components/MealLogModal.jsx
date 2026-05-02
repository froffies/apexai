import { useEffect, useMemo, useState } from "react"
import { Check, Heart, History, Search, ShieldCheck, X } from "lucide-react"
import BarcodeScannerPanel from "@/components/BarcodeScannerPanel"
import ChoiceGrid from "@/components/ChoiceGrid"
import { writeAppRecordSync } from "@/lib/appStorage"
import { starterMeals, storageKeys } from "@/lib/fitnessDefaults"
import { foodLookupKey, normalizeFoodSnapshot, upsertFoodSnapshot } from "@/lib/nutritionHelpers"
import { buildNutritionMemory } from "@/lib/nutritionMemory"
import { searchNutritionDatabase } from "@/lib/nutritionApiClient"
import { todayISO, uid, useLocalStorage } from "@/lib/useLocalStorage"

const mealTypeChoices = ["breakfast", "lunch", "dinner", "snack"].map((type) => ({
  value: type,
  label: type.charAt(0).toUpperCase() + type.slice(1),
}))

function sourceTypeLabel(food) {
  if (food?.source_type === "barcode_label") return "Barcode label"
  if (food?.source_type === "open_food_facts_label") return "Product label"
  if (food?.source_type === "curated_au_catalogue") return "Curated AU reference"
  if (food?.source_type === "manual_user_entry") return "Manual entry"
  return "Reference"
}

function createMealForm(existingMeal, defaultMealType) {
  return {
    date: existingMeal?.date || todayISO(),
    meal_type: existingMeal?.meal_type || defaultMealType || "breakfast",
    food_name: existingMeal?.food_name || "",
    quantity: existingMeal?.quantity || "1 serve",
    calories: existingMeal?.calories !== undefined ? String(existingMeal.calories) : "",
    protein_g: existingMeal?.protein_g !== undefined ? String(existingMeal.protein_g) : "",
    carbs_g: existingMeal?.carbs_g !== undefined ? String(existingMeal.carbs_g) : "",
    fat_g: existingMeal?.fat_g !== undefined ? String(existingMeal.fat_g) : "",
    nutrition_source: existingMeal?.nutrition_source || "",
    notes: existingMeal?.notes || "",
  }
}

export default function MealLogModal({ defaultMealType = "breakfast", existingMeal = null, onClose, onSaved = null, standalone = false }) {
  const [allMeals, setMeals] = useLocalStorage(storageKeys.meals, starterMeals)
  const [favoriteFoods, setFavoriteFoods] = useLocalStorage(storageKeys.favoriteFoods, [])
  const [recentFoods, setRecentFoods] = useLocalStorage(storageKeys.recentFoods, [])
  const [query, setQuery] = useState("")
  const [form, setForm] = useState(() => createMealForm(existingMeal, defaultMealType))
  const [matches, setMatches] = useState([])
  const [searching, setSearching] = useState(false)
  const [manualConfirmed, setManualConfirmed] = useState(() => Boolean(existingMeal && (!existingMeal.nutrition_source || existingMeal.estimated)))
  const [status, setStatus] = useState("")

  useEffect(() => {
    setForm(createMealForm(existingMeal, defaultMealType))
    setQuery(existingMeal?.food_name || "")
    setManualConfirmed(Boolean(existingMeal && (!existingMeal.nutrition_source || existingMeal.estimated)))
    setStatus("")
  }, [defaultMealType, existingMeal])

  useEffect(() => {
    let cancelled = false
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setMatches([])
      setSearching(false)
      return () => {
        cancelled = true
      }
    }

    const search = async () => {
      setSearching(true)
      setStatus("")
      try {
        const results = await searchNutritionDatabase(trimmed)
        if (!cancelled) setMatches(results.slice(0, 10))
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Nutrition search failed.")
      } finally {
        if (!cancelled) setSearching(false)
      }
    }

    const timeout = window.setTimeout(search, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [query])

  const favoriteKeys = useMemo(() => new Set(favoriteFoods.map((food) => foodLookupKey(food))), [favoriteFoods])
  const nutritionMemory = useMemo(() => buildNutritionMemory(allMeals, []), [allMeals])
  const showNoResults = query.trim().length >= 2 && !searching && !matches.length && !status
  const quickFoods = useMemo(() => ({
    favorites: favoriteFoods.slice(0, 6),
    recent: recentFoods.slice(0, 6),
    staples: nutritionMemory.foodsByMealType[form.meal_type] || nutritionMemory.stapleFoods.slice(0, 6),
  }), [favoriteFoods, form.meal_type, nutritionMemory, recentFoods])

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

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

  const selectFood = (food) => {
    const snapshot = normalizeFoodSnapshot(food)
    setForm((current) => ({
      ...current,
      food_name: snapshot.name,
      quantity: snapshot.quantity,
      calories: String(snapshot.calories),
      protein_g: String(snapshot.protein_g),
      carbs_g: String(snapshot.carbs_g),
      fat_g: String(snapshot.fat_g),
      nutrition_source: snapshot.source,
    }))
    touchRecentFood(snapshot)
    setQuery(snapshot.name)
    setManualConfirmed(false)
    setStatus("")
  }

  const save = (event) => {
    event.preventDefault()
    if (!form.food_name.trim()) {
      setStatus("Add a food name before saving.")
      return
    }
    if (!form.nutrition_source && !manualConfirmed) {
      setStatus("Confirm that these are manually entered macros before saving.")
      return
    }

    const meal = {
      ...form,
      id: existingMeal?.id || uid("meal"),
      calories: Number(form.calories) || 0,
      protein_g: Number(form.protein_g) || 0,
      carbs_g: Number(form.carbs_g) || 0,
      fat_g: Number(form.fat_g) || 0,
      estimated: !form.nutrition_source,
      nutrition_source: form.nutrition_source || "Manual user-entered macros",
    }

    const nextMeals = existingMeal
      ? [meal, ...allMeals.filter((item) => item.id !== existingMeal.id)]
      : [meal, ...allMeals]
    const recentSnapshot = {
      id: uid("food_snapshot"),
      name: meal.food_name,
      quantity: meal.quantity,
      calories: meal.calories,
      protein_g: meal.protein_g,
      carbs_g: meal.carbs_g,
      fat_g: meal.fat_g,
      source: meal.nutrition_source,
      source_type: meal.estimated ? "manual_user_entry" : "reference",
    }
    const nextRecentFoods = upsertFoodSnapshot(recentFoods, recentSnapshot, 12)

    writeAppRecordSync(storageKeys.meals, nextMeals)
    writeAppRecordSync(storageKeys.recentFoods, nextRecentFoods)
    setMeals(nextMeals)
    setRecentFoods(nextRecentFoods)
    onSaved?.(meal)
    onClose?.()
  }

  return (
    <form onSubmit={save} className={standalone ? "mx-auto max-w-md p-4" : ""}>
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{existingMeal ? "Edit food log" : "Log food"}</h2>
            <p className="text-sm text-slate-500">Search verified food data, reuse favourites, or save manual macros cleanly.</p>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <Check size={16} className="text-emerald-600" />
              <p className="font-semibold text-slate-950">Learned staples</p>
            </div>
            <div className="mt-2 space-y-2">
              {quickFoods.staples.slice(0, 6).map((food) => (
                <button key={foodLookupKey(food)} type="button" onClick={() => selectFood(food)} className="w-full rounded-lg bg-white p-3 text-left text-sm hover:bg-indigo-50">
                  <p className="font-medium text-slate-950">{food.name}</p>
                  <p className="text-slate-500">{food.calories} kcal - {food.protein_g}g protein</p>
                </button>
              ))}
              {!quickFoods.staples.length && <p className="rounded-lg bg-white p-3 text-sm text-slate-500">Once you log a few meals repeatedly, the app will surface your staples here.</p>}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <Heart size={16} className="text-rose-500" />
              <p className="font-semibold text-slate-950">Favourite foods</p>
            </div>
            <div className="mt-2 space-y-2">
              {quickFoods.favorites.map((food) => (
                <button key={foodLookupKey(food)} type="button" onClick={() => selectFood(food)} className="w-full rounded-lg bg-white p-3 text-left text-sm hover:bg-indigo-50">
                  <p className="font-medium text-slate-950">{food.name}</p>
                  <p className="text-slate-500">{food.calories} kcal - {food.protein_g}g protein</p>
                </button>
              ))}
              {!quickFoods.favorites.length && <p className="rounded-lg bg-white p-3 text-sm text-slate-500">Tap the heart on a result to keep your go-to foods here.</p>}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <History size={16} className="text-indigo-600" />
              <p className="font-semibold text-slate-950">Recent foods</p>
            </div>
            <div className="mt-2 space-y-2">
              {quickFoods.recent.map((food) => (
                <button key={foodLookupKey(food)} type="button" onClick={() => selectFood(food)} className="w-full rounded-lg bg-white p-3 text-left text-sm hover:bg-indigo-50">
                  <p className="font-medium text-slate-950">{food.name}</p>
                  <p className="text-slate-500">{food.calories} kcal - {food.protein_g}g protein</p>
                </button>
              ))}
              {!quickFoods.recent.length && <p className="rounded-lg bg-white p-3 text-sm text-slate-500">Foods you log will show up here for fast repeat tracking.</p>}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Search size={16} /> Verified food search
          </label>
          <p className="mt-1 text-sm text-slate-500">Search products, meals, or paste a barcode/EAN/UPC to find a label match.</p>
          <BarcodeScannerPanel
            className="mt-3"
            buttonLabel="Scan barcode"
            helperText="Scan a packet or upload a barcode photo, then I'll search the product match."
            onDetected={(code) => {
              setQuery(code)
              setStatus(`Barcode ${code} captured. Searching...`)
            }}
          />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try: Greek yoghurt, sushi, 9300605123456" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950" />
          {searching && <p className="mt-2 text-sm text-slate-500">Searching nutrition sources...</p>}
          <div className="mt-2 space-y-2">
            {matches.map((food) => {
              const favorite = favoriteKeys.has(foodLookupKey(food))
              return (
                <div key={food.id} className="rounded-lg bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => selectFood(food)} className="flex-1 text-left">
                      <p className="font-semibold text-slate-950">{food.name}</p>
                      <p className="text-sm text-slate-500">{food.quantity} - {food.calories} kcal - {food.protein_g}g protein</p>
                      <p className="mt-1 text-sm text-emerald-700">{sourceTypeLabel(food)} - {food.source}</p>
                    </button>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => toggleFavoriteFood(food)} className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg border ${favorite ? "border-rose-200 bg-rose-50 text-rose-600" : "border-slate-200 bg-white text-slate-400"}`}>
                        <Heart size={16} className={favorite ? "fill-current" : ""} />
                      </button>
                      <button type="button" onClick={() => selectFood(food)} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-indigo-600 text-white">
                        <Check size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {showNoResults && (
            <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              No matching foods came back for that search. Try a barcode, a brand name, or a simpler term like "tuna", "rice", or "yoghurt".
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3">
          <input value={form.food_name} onChange={(event) => update("food_name", event.target.value)} placeholder="Food name" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
          <div className="grid gap-3 md:grid-cols-2">
            <input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
          </div>
          <ChoiceGrid label="Meal type" value={form.meal_type} onChange={(value) => update("meal_type", value)} options={mealTypeChoices} />
          <input value={form.quantity} onChange={(event) => update("quantity", event.target.value)} placeholder="Quantity" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
          <div className="grid grid-cols-2 gap-3">
            <input value={form.calories} onChange={(event) => update("calories", event.target.value)} inputMode="decimal" placeholder="Calories" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
            <input value={form.protein_g} onChange={(event) => update("protein_g", event.target.value)} inputMode="decimal" placeholder="Protein g" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
            <input value={form.carbs_g} onChange={(event) => update("carbs_g", event.target.value)} inputMode="decimal" placeholder="Carbs g" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
            <input value={form.fat_g} onChange={(event) => update("fat_g", event.target.value)} inputMode="decimal" placeholder="Fat g" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
          </div>
          {form.nutrition_source && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck size={16} />
                Verified source
              </div>
              <p className="mt-1">{form.nutrition_source}</p>
            </div>
          )}
          {!form.nutrition_source && (
            <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <input type="checkbox" checked={manualConfirmed} onChange={(event) => setManualConfirmed(event.target.checked)} className="mt-1" />
              <span>I confirm these calories and macros are manually entered and should be stored as user-provided nutrition data.</span>
            </label>
          )}
          <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Notes" className="min-h-20 rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
        </div>
        {status && (
          <p className={`mt-3 text-sm font-semibold ${/failed|confirm|add a food name/i.test(status) ? "text-amber-700" : "text-emerald-700"}`}>
            {status}
          </p>
        )}
        <button type="submit" className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white">
          <Check size={18} /> {existingMeal ? "Save changes" : "Save meal"}
        </button>
      </div>
    </form>
  )
}
