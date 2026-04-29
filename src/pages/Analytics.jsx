import { Suspense, lazy, useMemo } from "react"
import PageHeader from "@/components/PageHeader"
import { calorieAdherence, coachingInsight, muscleVolume } from "@/lib/analytics"
import { defaultProfile, starterMeals, starterProgress, starterWorkoutSets, starterWorkouts, storageKeys, weeklyWorkoutCount, workoutVolume } from "@/lib/fitnessDefaults"
import { useLocalStorage } from "@/lib/useLocalStorage"

const AnalyticsMuscleChart = lazy(() => import("@/components/AnalyticsMuscleChart"))

export default function Analytics() {
  const [profile] = useLocalStorage(storageKeys.profile, defaultProfile)
  const [meals] = useLocalStorage(storageKeys.meals, starterMeals)
  const [workouts] = useLocalStorage(storageKeys.workouts, starterWorkouts)
  const [workoutSets] = useLocalStorage(storageKeys.workoutSets, starterWorkoutSets)
  const [progress] = useLocalStorage(storageKeys.progress, starterProgress)
  const muscles = useMemo(() => muscleVolume(workoutSets), [workoutSets])
  const insight = useMemo(() => coachingInsight({ meals, progress, workouts, workoutSets, profile }), [meals, profile, progress, workoutSets, workouts])

  const cards = [
    { label: "7-day calorie adherence", value: `${calorieAdherence(meals, profile, 7)}%` },
    { label: "Workouts this week", value: weeklyWorkoutCount(workouts) },
    { label: "Total volume", value: `${Math.round(workoutVolume(workoutSets)).toLocaleString()}kg` },
    { label: "Structured sets", value: workoutSets.length },
  ]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Analytics" title="Performance analytics" subtitle="Actionable views of adherence, consistency, and training distribution." />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{card.label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{card.value}</p>
          </div>
        ))}
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Coach correlation insight</h2>
        <p className="mt-2 text-sm text-slate-600">{insight}</p>
      </section>
      <Suspense fallback={<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Loading analytics chart...</p></section>}>
        <AnalyticsMuscleChart muscles={muscles} />
      </Suspense>
    </div>
  )
}
