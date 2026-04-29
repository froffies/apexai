import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, ArrowRight, Bot, Cloud, Dumbbell, ShieldCheck, Utensils } from "lucide-react"
import { createPageUrl } from "@/utils"
import { useAuth } from "@/lib/AuthContext"
import { getCloudSyncState, subscribeCloudSync } from "@/lib/cloudSync"
import { defaultProfile, macroTotals, starterExercises, starterMeals, starterProgress, starterRecoveryLogs, starterWorkoutSets, starterWorkouts, storageKeys, workoutsForDate } from "@/lib/fitnessDefaults"
import { applyProgressionBlockToPlan, recommendProgressionBlock } from "@/lib/progressionEngine"
import { getLatestRecoveryLog, suggestNextWorkout, summarizeRecovery } from "@/lib/workoutIntelligence"
import { todayISO, useLocalStorage } from "@/lib/useLocalStorage"

function buildBrief({ readiness, progressionBlock, nextWorkout, todaysWorkouts, proteinLeft, calorieLeft }) {
  if (readiness.band === "low") {
    return `Recovery-first day. Keep intensity controlled, trim volume, and let ${nextWorkout.title.toLowerCase()} wait until you feel more recovered.`
  }
  if (!todaysWorkouts.length) {
    return `Best next move: ${nextWorkout.title}. ${progressionBlock.title} is active, so keep today's training aligned with that phase instead of adding unnecessary volume.`
  }
  if (proteinLeft > 0 && calorieLeft < 250) {
    return `You are close to target calories, so finish the day with a lean protein-focused option instead of a full extra meal.`
  }
  if (proteinLeft > 0) {
    return `Training is logged. Close the day by finishing the remaining ${proteinLeft}g of protein and keep calories within ${calorieLeft} kcal of target.`
  }
  return `Today's training and nutrition are in a good place. Keep the rest of the day simple and consistent.`
}

function syncLabel(syncState, localMode) {
  if (localMode) return "Local mode"
  if (syncState.conflicts.length > 0) return "Conflict to review"
  if (syncState.pending > 0) return `${syncState.pending} sync write${syncState.pending === 1 ? "" : "s"} pending`
  if (syncState.lastError) return "Sync needs attention"
  if (syncState.lastSyncedAt) return "Cloud synced"
  return "Cloud idle"
}

export default function CoachBriefingCard() {
  const { localMode } = useAuth()
  const [profile] = useLocalStorage(storageKeys.profile, defaultProfile)
  const [meals] = useLocalStorage(storageKeys.meals, starterMeals)
  const [workouts] = useLocalStorage(storageKeys.workouts, starterWorkouts)
  const [workoutSets] = useLocalStorage(storageKeys.workoutSets, starterWorkoutSets)
  const [exercises] = useLocalStorage(storageKeys.exercises, starterExercises)
  const [progress] = useLocalStorage(storageKeys.progress, starterProgress)
  const [recoveryLogs] = useLocalStorage(storageKeys.recoveryLogs, starterRecoveryLogs)
  const [syncState, setSyncState] = useState(getCloudSyncState())

  useEffect(() => subscribeCloudSync(setSyncState), [])

  const totals = macroTotals(meals, todayISO())
  const todaysWorkouts = workoutsForDate(workouts, todayISO())
  const nextWorkout = useMemo(() => {
    const progressionBlock = recommendProgressionBlock({ profile, progress, workoutSets, recoveryLogs })
    return applyProgressionBlockToPlan(
      suggestNextWorkout({ profile, exercises, workoutSets, workouts }),
      progressionBlock
    )
  }, [exercises, profile, progress, recoveryLogs, workoutSets, workouts])
  const progressionBlock = useMemo(
    () => recommendProgressionBlock({ profile, progress, workoutSets, recoveryLogs }),
    [profile, progress, recoveryLogs, workoutSets]
  )
  const readiness = summarizeRecovery(getLatestRecoveryLog(recoveryLogs))
  const proteinLeft = Math.max(0, Math.round((profile.protein_g || 0) - totals.protein_g))
  const calorieLeft = Math.max(0, Math.round((profile.daily_calories || 0) - totals.calories))
  const brief = buildBrief({ readiness, progressionBlock, nextWorkout, todaysWorkouts, proteinLeft, calorieLeft })

  return (
    <section className="rounded-2xl border border-indigo-100 bg-[linear-gradient(135deg,rgba(238,242,255,1),rgba(255,255,255,1))] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Today&apos;s brief</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">Coach summary</h2>
          <p className="mt-2 text-sm text-slate-700">{brief}</p>
        </div>
        <div className="rounded-full border border-white/70 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
          {progressionBlock.title}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/70 bg-white/80 p-4">
          <div className="flex items-center gap-2 text-indigo-600"><ShieldCheck size={16} /><span className="text-sm font-semibold">Readiness</span></div>
          <p className="mt-2 text-2xl font-bold text-slate-950">{readiness.score}/100</p>
          <p className="mt-1 text-sm text-slate-600">{readiness.band === "low" ? "Keep it lighter" : readiness.band === "high" ? "Green light today" : "Normal training day"}</p>
        </div>
        <div className="rounded-xl border border-white/70 bg-white/80 p-4">
          <div className="flex items-center gap-2 text-indigo-600"><Dumbbell size={16} /><span className="text-sm font-semibold">Next workout</span></div>
          <p className="mt-2 text-lg font-bold text-slate-950">{nextWorkout.title}</p>
          <p className="mt-1 text-sm text-slate-600">{nextWorkout.exercises.length} exercise{nextWorkout.exercises.length === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-xl border border-white/70 bg-white/80 p-4">
          <div className="flex items-center gap-2 text-indigo-600"><Utensils size={16} /><span className="text-sm font-semibold">Remaining target</span></div>
          <p className="mt-2 text-2xl font-bold text-slate-950">{proteinLeft}g</p>
          <p className="mt-1 text-sm text-slate-600">{calorieLeft} kcal left today</p>
        </div>
        <div className="rounded-xl border border-white/70 bg-white/80 p-4">
          <div className="flex items-center gap-2 text-indigo-600"><Cloud size={16} /><span className="text-sm font-semibold">Sync state</span></div>
          <p className="mt-2 text-lg font-bold text-slate-950">{syncLabel(syncState, localMode)}</p>
          <p className="mt-1 text-sm text-slate-600">{syncState.lastError || (syncState.lastSyncedAt ? new Date(syncState.lastSyncedAt).toLocaleTimeString() : "No recent sync")}</p>
        </div>
      </div>

      {syncState.conflicts.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Sync conflicts need a decision</p>
              <p className="text-sm text-amber-800">
                {syncState.conflicts.length} profile or app record {syncState.conflicts.length === 1 ? "is" : "are"} different across this device and the cloud.
              </p>
            </div>
          </div>
          <Link to={createPageUrl("Profile")} className="flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm">
            Review conflicts <ArrowRight size={16} />
          </Link>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Link to={createPageUrl("Coach")} className="flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
          <Bot size={16} /> Open conversation
        </Link>
        <Link to={createPageUrl("Workouts")} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
          Plan training <ArrowRight size={16} />
        </Link>
        <Link to={createPageUrl("Nutrition")} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
          Review nutrition <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  )
}
