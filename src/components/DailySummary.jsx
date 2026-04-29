import { Dumbbell, Flame, HeartPulse, Scale, Utensils } from "lucide-react"
import DashboardWidget from "@/components/DashboardWidget"
import { defaultProfile, macroTotals, starterMeals, starterProgress, starterRecoveryLogs, starterWorkouts, storageKeys, workoutsForDate } from "@/lib/fitnessDefaults"
import { getLatestRecoveryLog, summarizeRecovery } from "@/lib/workoutIntelligence"
import { todayISO, useLocalStorage } from "@/lib/useLocalStorage"

export default function DailySummary() {
  const [profile] = useLocalStorage(storageKeys.profile, defaultProfile)
  const [meals] = useLocalStorage(storageKeys.meals, starterMeals)
  const [workouts] = useLocalStorage(storageKeys.workouts, starterWorkouts)
  const [progress] = useLocalStorage(storageKeys.progress, starterProgress)
  const [recoveryLogs] = useLocalStorage(storageKeys.recoveryLogs, starterRecoveryLogs)
  const totals = macroTotals(meals, todayISO())
  const todaysWorkouts = workoutsForDate(workouts, todayISO())
  const latestWeight = [...progress].sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0]?.weight_kg
  const readiness = summarizeRecovery(getLatestRecoveryLog(recoveryLogs))

  return (
    <div className="grid gap-3 grid-cols-2 xl:grid-cols-5">
      <DashboardWidget title="Calories" value={Math.round(totals.calories)} detail={`${Math.max(0, profile.daily_calories - totals.calories)} kcal left`} icon={Flame} tone="rose" />
      <DashboardWidget title="Protein" value={`${Math.round(totals.protein_g)}g`} detail={`${Math.max(0, profile.protein_g - totals.protein_g)}g left`} icon={Utensils} tone="indigo" />
      <DashboardWidget title="Training" value={todaysWorkouts.length} detail={todaysWorkouts.length ? "Workout logged" : "No workout yet"} icon={Dumbbell} tone="emerald" />
      <DashboardWidget title="Readiness" value={`${readiness.score}/100`} detail={readiness.band === "low" ? "Ease off today" : readiness.band === "high" ? "Green light" : "Train normally"} icon={HeartPulse} tone="blue" />
      <DashboardWidget title="Weight" value={latestWeight ? `${latestWeight}kg` : "-"} detail={`Target ${profile.target_weight_kg}kg`} icon={Scale} tone="blue" />
    </div>
  )
}
