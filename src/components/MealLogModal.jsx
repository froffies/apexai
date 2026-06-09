import { useEffect, useMemo, useState } from "react"
import { Check, Heart, History, Search, ShieldCheck, X } from "lucide-react"
import BarcodeScannerPanel from "@/components/BarcodeScannerPanel"
import ChoiceGrid from "@/components/ChoiceGrid"
import FoodPhotoPanel from "@/components/FoodPhotoPanel"
import { writeAppRecordSync } from "@/lib/appStorage"
import { starterMeals, storageKeys } from "@/lib/fitnessDefaults"
import {
  foodLookupKey,
  normalizeFoodSnapshot,
  normalizeMacroConfidence,
  normalizeNutritionSourceType,
  nutritionSourceLabel,
  nutritionSourceTone,
  upsertFoodSnapshot,
} from "@/lib/nutritionHelpers"
import { buildNutritionMemory } from "@/lib/nutritionMemory"
import { searchNutritionDatabase } from "@/lib/nutritionApiClient"
import { todayISO, uid, useLocalStorage } from "@/lib/useLocalStorage"

const mealTypeChoices = ["breakfast", "lunch", "dinner", "snack"].map((type) => ({
  value: type,
  label: type.charAt(0).toUpperCase() + type.slice(1),
}))

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
    nutrition_source_type: existingMeal?.nutrition_source_type || "",
    macro_confidence: existingMeal?.macro_confidence || "",
    notes: existingMeal?.notes || "",
  }
}

function hasTrustedPhotoMacros(result = {}) {
  return Boolean(
    result?.has_trusted_macros
    && ["calories", "protein_g", "carbs_g", "fat_g"].every((key) => Number.isFinite(Number(result?.[key])))
  )
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
  const [photoEstimated, setPhotoEstimated] = useState(() => existingMeal?.nutrition_source_type === "photo_ai_estimate")
  const [photoItems, setPhotoItems] = useState(() => Array.isArray(existingMeal?.photo_analysis_items) ? existingMeal.photo_analysis_items : [])
  const [status, setStatus] = useState("")

  useEffect(() => {
    setForm(createMealForm(existingMeal, defaultMealType))
    setQuery(existingMeal?.food_name || "")
    setManualConfirmed(Boolean(existingMeal && (!existingMeal.nutrition_source || existingMeal.estimated)))
    setPhotoEstimated(existingMeal?.nutrition_source_type === "photo_ai_estimate")
    setPhotoItems(Array.isArray(existingMeal?.photo_analysis_items) ? existingMeal.photo_analysis_items : [])
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
  const queryLooksLikeBarcode = /^\d{8,14}$/.test(query.trim())
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
      nutrition_source_type: snapshot.source_type,
      macro_confidence: snapshot.macro_confidence,
    }))
    touchRecentFood(snapshot)
    setQuery(snapshot.name)
    setManualConfirmed(false)
    setPhotoEstimated(false)
    setPhotoItems([])
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

    const derivedSourceType = normalizeNutritionSourceType(form.nutrition_source_type, photoEstimated || !form.nutrition_source)
    const estimatedFromSource = ["estimated_internal_profile", "photo_ai_estimate", "manual_user_entry", "mixed_reference_and_estimate"].includes(derivedSourceType)
      || !form.nutrition_source

    const meal = {
      ...form,
      id: existingMeal?.id || uid("meal"),
      calories: Number(form.calories) || 0,
      protein_g: Number(form.protein_g) || 0,
      carbs_g: Number(form.carbs_g) || 0,
      fat_g: Number(form.fat_g) || 0,
      estimated: estimatedFromSource,
      nutrition_source: form.nutrition_source || "Manual user-entered macros",
      nutrition_source_type: derivedSourceType,
      macro_confidence: normalizeMacroConfidence(form.macro_confidence, estimatedFromSource ? "low" : "high"),
      ...(photoEstimated ? { photo_analysis_items: photoItems } : {}),
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
      source_type: meal.nutrition_source_type || (meal.estimated ? "manual_user_entry" : "reference"),
      macro_confidence: meal.macro_confidence || (meal.estimated ? "low" : "high"),
    }
    const nextRecentFoods = upsertFoodSnapshot(recentFoods, recentSnapshot, 12)

    writeAppRecordSync(storageKeys.meals, nextMeals)
    writeAppRecordSync(storageKeys.recentFoods, nextRecentFoods)
    setMeals(nextMeals)
    setRecentFoods(nextRecentFoods)
    onSaved?.(meal)
    onClose?.()
  }

  const derivedSourceType = normalizeNutritionSourceType(form.nutrition_source_type, photoEstimated || !form.nutrition_source)
  const sourceMeta = {
    estimated: ["estimated_internal_profile", "photo_ai_estimate", "manual_user_entry", "mixed_reference_and_estimate"].includes(derivedSourceType) || !form.nutrition_source,
    nutrition_source_type: derivedSourceType,
    macro_confidence: normalizeMacroConfidence(form.macro_confidence, (["estimated_internal_profile", "photo_ai_estimate", "manual_user_entry", "mixed_reference_and_estimate"].includes(derivedSourceType) || !form.nutrition_source) ? "low" : "high"),
  }
  const sourceEstimated = Boolean(sourceMeta.estimated)

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
          <FoodPhotoPanel
            className="mt-3"
            locale="AU"
            mealType={form.meal_type}
            onAnalyzed={(result) => {
              const trustedMacros = hasTrustedPhotoMacros(result)
              setForm((current) => ({
                ...current,
                food_name: result.food_name || current.food_name,
                quantity: result.quantity || current.quantity,
                calories: trustedMacros ? String(result.calories) : "",
                protein_g: trustedMacros ? String(result.protein_g) : "",
                carbs_g: trustedMacros ? String(result.carbs_g) : "",
                fat_g: trustedMacros ? String(result.fat_g) : "",
                nutrition_source: trustedMacros ? (result.nutrition_source || current.nutrition_source) : "",
                nutrition_source_type: trustedMacros ? (result.nutrition_source_type || current.nutrition_source_type) : "",
                macro_confidence: trustedMacros ? (result.macro_confidence || current.macro_confidence) : "",
                notes: [
                  !trustedMacros && result.nutrition_source ? `Photo analysis: ${result.nutrition_source}` : "",
                  result.clarification_question ? `Photo review: ${result.clarification_question}` : "",
                  Array.isArray(result.assumptions) && result.assumptions.length ? `Photo assumptions: ${result.assumptions.join("; ")}` : "",
                ].filter(Boolean).join("\n\n") || current.notes,
              }))
              setPhotoEstimated(trustedMacros)
              setPhotoItems(Array.isArray(result.identified_items) ? result.identified_items : [])
              setManualConfirmed(false)
              setStatus(
                result.clarification_question
                  || (trustedMacros
                    ? "Photo analyzed. Review the foods and save when you're happy with it."
                    : "Photo identified the foods, but the macros still need review before you save it.")
              )
            }}
          />
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
          {!!photoItems.length && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">Photo identified</p>
              <div className="mt-2 space-y-2">
                {photoItems.map((item, index) => (
                  <div key={`${item.matched_food_name || item.name}_${index}`} className="rounded-lg bg-white p-3 text-sm">
                    <p className="font-medium text-slate-950">{item.name}</p>
                    <p className="text-slate-500">{item.quantity} {item.matched_food_name ? `- matched to ${item.matched_food_name}` : ""}</p>
                    {(Number.isFinite(Number(item.calories)) && Number.isFinite(Number(item.protein_g)) && Number.isFinite(Number(item.carbs_g)) && Number.isFinite(Number(item.fat_g)))
                      ? <p className="text-slate-500">{item.calories} kcal - {item.protein_g}g protein - {item.carbs_g}g carbs - {item.fat_g}g fat</p>
                      : <p className="text-amber-700">Macros need review before saving.</p>}
                    <p className="text-amber-700">{item.source}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-2 space-y-2">
            {matches.map((food) => {
              const favorite = favoriteKeys.has(foodLookupKey(food))
              return (
                <div key={food.id} className="rounded-lg bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => selectFood(food)} className="flex-1 text-left">
                      <p className="font-semibold text-slate-950">{food.name}</p>
                      <p className="text-sm text-slate-500">{food.quantity} - {food.calories} kcal - {food.protein_g}g protein</p>
                      <p className={`mt-1 text-sm ${nutritionSourceTone(food)}`}>{nutritionSourceLabel(food)} - {food.source}</p>
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
              {queryLooksLikeBarcode
                ? "No product label match came back for that barcode. Try the plate-photo tool, search the brand and product name manually, or enter the macros yourself."
                : 'No matching foods came back for that search. Try a barcode, a brand name, or a simpler term like "tuna", "rice", or "yoghurt".'}
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
          {form.nutrition_source && !sourceEstimated && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck size={16} />
                {nutritionSourceLabel(sourceMeta)}
              </div>
              <p className="mt-1">{form.nutrition_source}</p>
            </div>
          )}
          {form.nutrition_source && sourceEstimated && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck size={16} />
                {nutritionSourceLabel(sourceMeta)}
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
