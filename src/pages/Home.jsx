import { Suspense, lazy, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Bot, Camera, Dumbbell, GripVertical, Plus, Salad, Settings2, ShoppingBasket, Trophy } from "lucide-react"
import CoachBriefingCard from "@/components/CoachBriefingCard"
import DailySummary from "@/components/DailySummary"
import HabitTracker from "@/components/HabitTracker"
import MacroRing from "@/components/MacroRing"
import PageHeader from "@/components/PageHeader"
import SectionCard from "@/components/SectionCard"
import SegmentedControl from "@/components/SegmentedControl"
import { createPageUrl } from "@/utils"
import { buildDailyTrend } from "@/lib/analytics"
import { defaultDashboardWidgets, defaultProfile, macroTotals, starterMeals, starterProgress, starterWorkoutSets, starterWorkouts, storageKeys } from "@/lib/fitnessDefaults"
import { todayISO, useLocalStorage } from "@/lib/useLocalStorage"

const HomeTrendCharts = lazy(() => import("@/components/HomeTrendCharts"))

const widgetLabels = {
  summary: "Daily summary",
  charts: "Trends",
  macros: "Macro rings",
  today: "Today logged",
  habits: "Habits",
  progress: "Progress glance",
}

const quickActions = [
  { label: "Log food", to: createPageUrl("NutritionLog"), icon: Salad },
  { label: "Log workout", to: createPageUrl("WorkoutsLog"), icon: Dumbbell },
  { label: "Ask coach", to: createPageUrl("Coach"), icon: Bot },
  { label: "Shopping list", to: createPageUrl("ShoppingList"), icon: ShoppingBasket },
]

const homeViews = [
  { value: "dashboard", label: "Dashboard" },
  { value: "insights", label: "Insights" },
  { value: "habits", label: "Habits" },
]

function move(items, from, to) {
  const copy = [...items]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

export default function Home() {
  const [profile] = useLocalStorage(storageKeys.profile, defaultProfile)
  const [meals] = useLocalStorage(storageKeys.meals, starterMeals)
  const [workouts] = useLocalStorage(storageKeys.workouts, starterWorkouts)
  const [workoutSets] = useLocalStorage(storageKeys.workoutSets, starterWorkoutSets)
  const [progress] = useLocalStorage(storageKeys.progress, starterProgress)
  const [widgets, setWidgets] = useLocalStorage(storageKeys.dashboardWidgets, defaultDashboardWidgets)
  const [editing, setEditing] = useState(false)
  const [view, setView] = useState("dashboard")
  const totals = macroTotals(meals, todayISO())
  const todaysWorkouts = workouts.filter((workout) => workout.date === todayISO())
  const latestProgress = [...progress].sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0]
  const trend = useMemo(() => buildDailyTrend({ meals, progress, workouts, workoutSets, days: 30, calorieTarget: profile.daily_calories }), [meals, profile.daily_calories, progress, workoutSets, workouts])

  const reorder = (index, direction) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= widgets.length) return
    setWidgets(move(widgets, index, nextIndex))
  }
  const toggleWidget = (key) => setWidgets((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  const visibleWidgets = (keys) => keys.filter((key) => widgets.includes(key))

  const renderWidget = (widget) => {
    if (widget === "summary") return <DailySummary />
    if (widget === "charts") {
      return (
        <Suspense fallback={<SectionCard title="Trend charts"><p className="text-sm text-slate-500">Loading trend charts...</p></SectionCard>}>
          <HomeTrendCharts trend={trend} />
        </Suspense>
      )
    }
    if (widget === "macros") {
      return (
        <SectionCard
          title="Macro pace"
          description="A quick read on calories and macros without leaving the dashboard."
          action={<Link to={createPageUrl("NutritionLog")} className="flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">
              <Plus size={16} /> Add meal
            </Link>}
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MacroRing label="Calories" value={totals.calories} target={profile.daily_calories} unit="kcal" color="indigo" />
            <MacroRing label="Protein" value={totals.protein_g} target={profile.protein_g} unit="g" color="red" />
            <MacroRing label="Carbs" value={totals.carbs_g} target={profile.carbs_g} unit="g" color="amber" />
            <MacroRing label="Fat" value={totals.fat_g} target={profile.fat_g} unit="g" color="blue" />
          </div>
        </SectionCard>
      )
    }
    if (widget === "today") {
      const todaysMeals = meals.filter((meal) => meal.date === todayISO())
      return (
        <section className="grid gap-4 xl:grid-cols-[1fr_300px]">
          <SectionCard title="Today's activity" description="A quick ledger of what is already logged so you can see the gaps without hunting for them.">
            <div className="mt-4 space-y-3">
              {todaysMeals.map((meal) => (
                <div key={meal.id} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                  <div>
                    <p className="font-medium text-slate-900">{meal.food_name}</p>
                    <p className="text-sm text-slate-500">{meal.meal_type} - {meal.quantity}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{meal.calories} kcal</p>
                </div>
              ))}
              {todaysWorkouts.map((workout) => (
                <div key={workout.id} className="flex items-center justify-between rounded-2xl bg-emerald-50 p-3">
                  <div>
                    <p className="font-medium text-slate-900">{workout.workout_type}</p>
                    <p className="text-sm text-slate-500">{workout.duration_minutes || 0} minutes</p>
                  </div>
                  <Dumbbell size={18} className="text-emerald-600" />
                </div>
              ))}
              {!todaysMeals.length && !todaysWorkouts.length && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-900">Nothing logged yet today</p>
                  <p className="mt-1 text-sm text-slate-500">Start with one anchor action: log your next meal, begin your planned session, or ask the coach what matters most today.</p>
                </div>
              )}
            </div>
          </SectionCard>
          <SectionCard title="Quick actions" description="The fastest routes back into logging, planning, and support.">
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action) => {
                const Icon = action.icon
                return (
                  <Link key={action.label} to={action.to} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <Icon size={17} className="text-indigo-600" />
                    {action.label}
                  </Link>
                )
              })}
            </div>
          </SectionCard>
        </section>
      )
    }
    if (widget === "habits") return <HabitTracker />
    if (widget === "progress") {
      return (
        <SectionCard title="Progress snapshot" description="The current baseline, with fast access to photos and goal-oriented views.">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Latest weight</p>
            <p className="mt-1 text-3xl font-semibold text-slate-950">{latestProgress?.weight_kg || profile.weight_kg}kg</p>
            <p className="mt-1 text-sm text-slate-500">Target {profile.target_weight_kg}kg</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link to={createPageUrl("ProgressPhotos")} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
              <Camera size={16} /> Photos
            </Link>
            <Link to={createPageUrl("Challenges")} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
              <Trophy size={16} /> Goals
            </Link>
          </div>
        </SectionCard>
      )
    }
    return null
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Today"
        title="Today's overview"
        subtitle={`${profile.name || "Your"} dashboard for training, nutrition, habits, and long-term progress.`}
        action={<button type="button" onClick={() => setEditing((value) => !value)} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"><Settings2 size={16} /> {editing ? "Done" : "Edit"}</button>}
      />

      <CoachBriefingCard />

      <SegmentedControl label="Dashboard view" value={view} onChange={setView} options={homeViews} />

      {editing && (
        <SectionCard title="Dashboard widgets" description="Show, hide, and reorder the sections that matter most to you.">
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {defaultDashboardWidgets.map((widget, index) => {
              const visibleIndex = widgets.indexOf(widget)
              const isVisible = visibleIndex !== -1
              return (
                <div key={widget} className="flex items-center justify-between gap-2 rounded-2xl bg-slate-50 p-3">
                  <div className="flex items-center gap-2">
                    <GripVertical size={16} className="text-slate-400" />
                    <span className="text-sm font-semibold text-slate-800">{widgetLabels[widget]}</span>
                  </div>
                  <div className="flex gap-1">
                    {isVisible && <button type="button" onClick={() => reorder(visibleIndex, -1)} className="min-h-11 rounded-xl px-2 text-sm font-semibold text-slate-600">Up</button>}
                    {isVisible && <button type="button" onClick={() => reorder(visibleIndex, 1)} className="min-h-11 rounded-xl px-2 text-sm font-semibold text-slate-600">Down</button>}
                    <button type="button" onClick={() => toggleWidget(widget)} className="min-h-11 rounded-xl bg-white px-3 text-sm font-semibold text-slate-700">{isVisible ? "Hide" : "Show"}</button>
                  </div>
                  {!isVisible && <span className="hidden">{index}</span>}
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}

      {view === "dashboard" && visibleWidgets(["summary", "today", "progress"]).map((widget) => <div key={widget}>{renderWidget(widget)}</div>)}
      {view === "insights" && visibleWidgets(["charts", "macros"]).map((widget) => <div key={widget}>{renderWidget(widget)}</div>)}
      {view === "habits" && visibleWidgets(["habits"]).map((widget) => <div key={widget}>{renderWidget(widget)}</div>)}
    </div>
  )
}
