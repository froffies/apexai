import { Suspense, lazy, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { BookOpen, Plus, ShoppingBasket, SlidersHorizontal, Trash2, Utensils } from "lucide-react"
import MacroTargetEditor from "@/components/MacroTargetEditor"
import MacroRing from "@/components/MacroRing"
import PageHeader from "@/components/PageHeader"
import SectionCard from "@/components/SectionCard"
import SegmentedControl from "@/components/SegmentedControl"
import { toast } from "@/components/ui/use-toast"
import { createPageUrl } from "@/utils"
import { defaultProfile, macroTotals, starterMeals, storageKeys } from "@/lib/fitnessDefaults"
import { buildNutritionMemory } from "@/lib/nutritionMemory"
import { todayISO, useLocalStorage } from "@/lib/useLocalStorage"

const IngredientMealFinder = lazy(() => import("@/components/IngredientMealFinder"))

function rankFoodsForTargets(foods, remaining) {
  return [...foods]
    .map((food) => {
      const calories = Number(food.calories) || 0
      const protein = Number(food.protein_g) || 0
      const carbs = Number(food.carbs_g) || 0
      const fat = Number(food.fat_g) || 0
      let score = 0
      score += Math.max(0, remaining.protein_g) * protein * 4
      score += Math.max(0, remaining.carbs_g) * carbs * 1.5
      score += Math.max(0, remaining.fat_g) * fat * 1.25
      if (remaining.calories > 0 && calories > remaining.calories) score -= (calories - remaining.calories) * 2
      if (calories > 0) score += protein / calories
      return { ...food, score }
    })
    .sort((left, right) => right.score - left.score)
}

export default function Nutrition() {
  const [profile, setProfile] = useLocalStorage(storageKeys.profile, defaultProfile)
  const [meals, setMeals] = useLocalStorage(storageKeys.meals, starterMeals)
  const [mealPlans, setMealPlans] = useLocalStorage(storageKeys.mealPlans, [])
  const [recipes] = useLocalStorage(storageKeys.recipes, [])
  const [favoriteFoods] = useLocalStorage(storageKeys.favoriteFoods, [])
  const [recentFoods] = useLocalStorage(storageKeys.recentFoods, [])
  const [editingTargets, setEditingTargets] = useState(false)
  const [view, setView] = useState("overview")
  const totals = macroTotals(meals, todayISO())
  const todaysMeals = meals.filter((meal) => meal.date === todayISO())
  const todaysPlans = mealPlans.filter((plan) => plan.date === todayISO())
  const remaining = {
    calories: Math.max(0, Number(profile.daily_calories) - totals.calories),
    protein_g: Math.max(0, Number(profile.protein_g) - totals.protein_g),
    carbs_g: Math.max(0, Number(profile.carbs_g) - totals.carbs_g),
    fat_g: Math.max(0, Number(profile.fat_g) - totals.fat_g),
  }
  const nutritionMemory = useMemo(() => buildNutritionMemory(meals, recipes), [meals, recipes])
  const suggestedFoods = useMemo(() => {
    const deduped = [...favoriteFoods, ...recentFoods, ...nutritionMemory.foodsByMealType[nutritionMemory.currentMealType]].reduce((list, food) => {
      if (!list.some((item) => item.id === food.id || item.name === food.name)) list.push(food)
      return list
    }, [])
    return rankFoodsForTargets(deduped, remaining).slice(0, 3)
  }, [favoriteFoods, nutritionMemory, recentFoods, remaining])

  const removeMeal = (meal) => {
    setMeals((current) => current.filter((item) => item.id !== meal.id))
    toast({
      title: "Meal removed",
      description: `${meal.food_name} was removed from today's log.`,
      action: (
        <button
          type="button"
          onClick={() => setMeals((current) => [meal, ...current.filter((item) => item.id !== meal.id)])}
          className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
        >
          Undo
        </button>
      ),
    })
  }
  const logPlannedMeal = (meal) => {
    const loggedMeal = { ...meal, id: `${meal.id}_logged_${Date.now()}`, notes: "Logged from planned meal" }
    setMeals((current) => [loggedMeal, ...current])
    toast({
      title: "Planned meal logged",
      description: `${meal.food_name} is now in today's nutrition log.`,
      variant: "success",
    })
  }
  const removeMealPlan = (plan) => {
    setMealPlans((current) => current.filter((item) => item.id !== plan.id))
    toast({
      title: "Meal plan removed",
      description: `${plan.title} was removed from today's schedule.`,
      action: (
        <button
          type="button"
          onClick={() => setMealPlans((current) => [plan, ...current.filter((item) => item.id !== plan.id)])}
          className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
        >
          Undo
        </button>
      ),
    })
  }
  const quickLogSuggestion = (food) => {
    setMeals((current) => [{
      id: `meal_quick_${Date.now()}`,
      date: todayISO(),
      meal_type: "snack",
      food_name: food.name,
      quantity: food.quantity || "1 serve",
      calories: Number(food.calories) || 0,
      protein_g: Number(food.protein_g) || 0,
      carbs_g: Number(food.carbs_g) || 0,
      fat_g: Number(food.fat_g) || 0,
      estimated: false,
      nutrition_source: food.source || "Quick-logged from favourite food",
      notes: "Smart suggestion quick-log",
    }, ...current])
  }

  const nutritionViews = [
    { value: "overview", label: "Overview" },
    { value: "builder", label: "Builder" },
    { value: "log", label: "Log" },
    { value: "plan", label: "Plans" },
  ]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Nutrition"
        title="Daily nutrition"
        subtitle="Track calories and macros with verified Australian food data, saved recipes, and flexible manual entries when needed."
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditingTargets(true)} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><SlidersHorizontal size={16} /> Targets</button>
            <Link to={createPageUrl("Recipes")} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><BookOpen size={16} /> Recipes</Link>
            <Link to={createPageUrl("ShoppingList")} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><ShoppingBasket size={16} /> Shopping list</Link>
            <Link to={createPageUrl("NutritionLog")} className="flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"><Plus size={16} /> Log food</Link>
          </div>
        }
      />

      <SegmentedControl label="Nutrition view" value={view} onChange={setView} options={nutritionViews} />

      {view === "overview" && (
        <>
      <SectionCard title="Daily pace" description="A clean view of where calories and macros sit right now.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MacroRing label="Calories" value={totals.calories} target={profile.daily_calories} unit="kcal" color="indigo" />
          <MacroRing label="Protein" value={totals.protein_g} target={profile.protein_g} unit="g" color="red" />
          <MacroRing label="Carbs" value={totals.carbs_g} target={profile.carbs_g} unit="g" color="amber" />
          <MacroRing label="Fat" value={totals.fat_g} target={profile.fat_g} unit="g" color="blue" />
        </div>
      </SectionCard>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SectionCard title="Remaining targets" description="Use your own recent and favourite foods to close the day cleanly without guessing.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-3 text-sm"><p className="text-slate-500">Calories left</p><p className="font-semibold text-slate-950">{remaining.calories}</p></div>
            <div className="rounded-2xl bg-slate-50 p-3 text-sm"><p className="text-slate-500">Protein left</p><p className="font-semibold text-slate-950">{remaining.protein_g}g</p></div>
            <div className="rounded-2xl bg-slate-50 p-3 text-sm"><p className="text-slate-500">Carbs left</p><p className="font-semibold text-slate-950">{remaining.carbs_g}g</p></div>
            <div className="rounded-2xl bg-slate-50 p-3 text-sm"><p className="text-slate-500">Fat left</p><p className="font-semibold text-slate-950">{remaining.fat_g}g</p></div>
          </div>
        </SectionCard>

        <SectionCard title="What to eat next" description="Suggestions ranked against your remaining targets.">
          <div className="space-y-3">
            {suggestedFoods.map((food) => (
              <div key={food.id || food.name} className="rounded-2xl bg-slate-50 p-3">
                <p className="font-semibold text-slate-950">{food.name}</p>
                <p className="mt-1 text-sm text-slate-500">{food.quantity} - {food.calories} kcal - {food.protein_g}g protein</p>
                <button type="button" onClick={() => quickLogSuggestion(food)} className="mt-3 min-h-11 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">Quick log</button>
              </div>
            ))}
            {!suggestedFoods.length && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Log or favourite a few foods and this panel will start making smarter suggestions.</p>}
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SectionCard title="Frequently logged foods" description="Meals you repeat most often, so the app can stop asking you to start from scratch.">
          <div className="grid gap-3 md:grid-cols-2">
            {nutritionMemory.stapleFoods.slice(0, 4).map((food) => (
              <div key={food.id} className="rounded-2xl bg-slate-50 p-3">
                <p className="font-semibold text-slate-950">{food.name}</p>
                <p className="mt-1 text-sm text-slate-500">Logged {food.count} times - usually {food.favoriteMealType}</p>
                <p className="text-sm text-slate-500">{food.calories} kcal - {food.protein_g}g protein</p>
                <button type="button" onClick={() => quickLogSuggestion(food)} className="mt-3 min-h-11 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">Log again</button>
              </div>
            ))}
            {!nutritionMemory.stapleFoods.length && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500 md:col-span-2">Keep logging for a few days and this section will start learning your real eating patterns.</p>}
          </div>
        </SectionCard>

        <SectionCard title="Frequently used recipes" description="Saved combinations that are earning their keep.">
          <div className="space-y-3">
            {nutritionMemory.repeatRecipes.slice(0, 3).map((recipe) => (
              <div key={recipe.id} className="rounded-2xl bg-slate-50 p-3">
                <p className="font-semibold text-slate-950">{recipe.name}</p>
                <p className="mt-1 text-sm text-slate-500">Logged {recipe.usageCount} times</p>
                <Link to={createPageUrl("Recipes")} className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Open recipe</Link>
              </div>
            ))}
            {!nutritionMemory.repeatRecipes.length && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Once you start reusing saved recipes, they'll surface here automatically.</p>}
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <SectionCard
          title="Meal builder and recipe studio"
          description="Build mixed meals, scan barcodes, or turn pantry ingredients into an editable recipe before you log anything."
          action={<button type="button" onClick={() => setView("builder")} className="min-h-11 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Open builder</button>}
        >
          <div className="space-y-2 text-sm text-slate-600">
            <p className="rounded-2xl bg-slate-50 p-3">Search verified foods, combine them into a single meal, and save the result as a reusable recipe.</p>
            <p className="rounded-2xl bg-slate-50 p-3">Use recipe studio when you only know the ingredients you have on hand and need the macros worked out.</p>
          </div>
        </SectionCard>

        <SectionCard title="Today's meals" description="The latest logged meals stay visible here so you can review or remove them quickly.">
          <div className="space-y-3">
            {todaysMeals.slice(0, 4).map((meal) => (
              <div key={meal.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
                <div>
                  <p className="font-semibold text-slate-900">{meal.food_name}</p>
                  <p className="text-sm text-slate-500">{meal.meal_type} - {meal.calories} kcal - {meal.protein_g}g protein</p>
                </div>
                <button type="button" aria-label={`Remove ${meal.food_name}`} onClick={() => removeMeal(meal)} className="rounded-xl p-2 text-slate-400 hover:bg-white hover:text-rose-600">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {!todaysMeals.length && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No meals logged for today.</p>}
            <button type="button" onClick={() => setView("log")} className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Open full meal log</button>
          </div>
        </SectionCard>
      </section>
        </>
      )}

      {view === "builder" && (
        <Suspense fallback={<SectionCard title="Meal builder and recipe studio"><p className="text-sm text-slate-500">Loading meal builder...</p></SectionCard>}>
          <IngredientMealFinder />
        </Suspense>
      )}

      {view === "log" && (
      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <SectionCard title="Today's meals" description="Every logged meal for today, with verified-source notes when available.">
          <div className="mt-4 space-y-3">
            {todaysMeals.map((meal) => (
              <div key={meal.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
                <div>
                  <p className="font-semibold text-slate-900">{meal.food_name}</p>
                  <p className="text-sm text-slate-500">{meal.meal_type} - {meal.calories} kcal - {meal.protein_g}g protein</p>
                  {meal.nutrition_source && <p className="mt-1 text-sm text-emerald-700">Verified: {meal.nutrition_source}</p>}
                </div>
                <button type="button" aria-label={`Remove ${meal.food_name}`} onClick={() => removeMeal(meal)} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-rose-600">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {!todaysMeals.length && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No meals logged for today.</p>}
          </div>
        </SectionCard>
        <SectionCard title="Next actions" description="Jump straight back into building, planning, or logging.">
          <div className="grid gap-2">
            <Link to={createPageUrl("NutritionLog")} className="flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Log another meal</Link>
            <button type="button" onClick={() => setView("builder")} className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Open meal builder</button>
            <Link to={createPageUrl("Recipes")} className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Review recipes</Link>
          </div>
        </SectionCard>
      </section>
      )}

      {view === "plan" && (
        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <SectionCard title="Scheduled meals" description="Coach-planned meals stay separate from the log until you explicitly mark them as eaten.">
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {todaysPlans.map((plan) => (
              <article key={plan.id} className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <Utensils size={18} className="text-indigo-600" />
                  <div>
                    <p className="font-semibold text-slate-950">{plan.title}</p>
                    <p className="text-sm text-slate-500">{plan.meals.length} meals scheduled</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {plan.meals.map((meal) => (
                    <div key={meal.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3">
                      <div>
                        <p className="font-medium text-slate-900">{meal.food_name}</p>
                        <p className="text-sm text-slate-500">{meal.calories} kcal - {meal.protein_g}g protein</p>
                      </div>
                      <button type="button" onClick={() => logPlannedMeal(meal)} className="min-h-11 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">Log</button>
                    </div>
                  ))}
                </div>
                <button type="button" aria-label={`Remove ${plan.title}`} onClick={() => removeMealPlan(plan)} className="mt-3 min-h-11 w-full rounded-xl border border-slate-200 text-sm font-semibold text-slate-700">Remove plan</button>
              </article>
            ))}
            {!todaysPlans.length && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500 md:col-span-2">No meals are scheduled for today yet.</p>}
          </div>
        </SectionCard>
        <SectionCard title="Plan shortcuts" description="The quickest ways to build or reuse your nutrition plan.">
          <div className="grid gap-2">
            <button type="button" onClick={() => setView("builder")} className="flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Open meal builder</button>
            <Link to={createPageUrl("Recipes")} className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Open recipes</Link>
            <Link to={createPageUrl("ShoppingList")} className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Open shopping list</Link>
          </div>
        </SectionCard>
        </section>
      )}

      {editingTargets && <MacroTargetEditor profile={profile} onSave={(targets) => setProfile((current) => ({ ...current, ...targets }))} onClose={() => setEditingTargets(false)} />}
    </div>
  )
}
