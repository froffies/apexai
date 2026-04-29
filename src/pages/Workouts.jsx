import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, Dumbbell, Library, Play, Plus, TimerReset, Trash2 } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import SectionCard from "@/components/SectionCard"
import SegmentedControl from "@/components/SegmentedControl"
import { toast } from "@/components/ui/use-toast"
import WorkoutCalendar from "@/components/WorkoutCalendar"
import WorkoutPlanCard from "@/components/WorkoutPlanCard"
import { createPageUrl } from "@/utils"
import { defaultProfile, emptyActiveWorkout, starterExercises, starterProgress, starterRecoveryLogs, starterWorkoutSets, starterWorkouts, storageKeys, workoutVolume } from "@/lib/fitnessDefaults"
import { applyProgressionBlockToPlan, recommendProgressionBlock } from "@/lib/progressionEngine"
import { buildExerciseHistory, buildWeeklyWorkoutSchedule, createActiveWorkoutSession, getCurrentActiveExercise, suggestNextWorkout, summarizeActiveWorkout, syncWeeklyPlans } from "@/lib/workoutIntelligence"
import { todayISO, useLocalStorage } from "@/lib/useLocalStorage"

const workoutViews = [
  { value: "overview", label: "Overview" },
  { value: "schedule", label: "Schedule" },
  { value: "history", label: "History" },
  { value: "library", label: "Library" },
]

export default function Workouts() {
  const [profile] = useLocalStorage(storageKeys.profile, defaultProfile)
  const [workouts, setWorkouts] = useLocalStorage(storageKeys.workouts, starterWorkouts)
  const [workoutSets] = useLocalStorage(storageKeys.workoutSets, starterWorkoutSets)
  const [progress] = useLocalStorage(storageKeys.progress, starterProgress)
  const [workoutPlans, setWorkoutPlans] = useLocalStorage(storageKeys.workoutPlans, [])
  const [exercises] = useLocalStorage(storageKeys.exercises, starterExercises)
  const [recoveryLogs] = useLocalStorage(storageKeys.recoveryLogs, starterRecoveryLogs)
  const [activeWorkout, setActiveWorkout] = useLocalStorage(storageKeys.activeWorkout, emptyActiveWorkout)
  const [view, setView] = useState("overview")

  const recent = workouts.slice(0, 6)
  const plannedToday = workoutPlans.filter((plan) => plan.date === todayISO())
  const progressionBlock = recommendProgressionBlock({ profile, progress, workoutSets, recoveryLogs })
  const nextWorkout = applyProgressionBlockToPlan(suggestNextWorkout({ profile, exercises, workoutSets, workouts }), progressionBlock)
  const weeklySchedule = buildWeeklyWorkoutSchedule({ profile, exercises, workoutSets, workouts, workoutPlans, recoveryLogs })
  const activeSummary = summarizeActiveWorkout(activeWorkout)
  const currentExercise = getCurrentActiveExercise(activeWorkout)
  const exerciseHistory = buildExerciseHistory(workoutSets, exercises)
  const recentPRs = exerciseHistory.filter((entry) => entry.bestWeight > 0).slice(0, 3)

  const startWorkoutSession = (name = "Open workout", planExercises = []) => {
    const session = createActiveWorkoutSession(name, planExercises)
    setActiveWorkout(session)
    setWorkouts((current) => [
      {
        id: session.session_id,
        date: session.date,
        workout_type: name,
        duration_minutes: 0,
        notes: planExercises.map((exercise) => `${exercise.name} ${exercise.setsReps || ""}`.trim()).join("\n"),
        completed: false,
      },
      ...current.filter((workout) => workout.id !== session.session_id),
    ])
  }

  const removeWorkout = (workout) => {
    setWorkouts((current) => current.filter((item) => item.id !== workout.id))
    toast({
      title: "Workout removed",
      description: `${workout.workout_type} was removed from your history.`,
      action: (
        <button
          type="button"
          onClick={() => setWorkouts((current) => [workout, ...current.filter((item) => item.id !== workout.id)])}
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
        >
          Undo
        </button>
      ),
    })
  }

  const removePlan = (plan) => {
    setWorkoutPlans((current) => current.filter((item) => item.id !== plan.id))
    toast({
      title: "Workout plan removed",
      description: `${plan.title} was removed from the schedule.`,
      action: (
        <button
          type="button"
          onClick={() => setWorkoutPlans((current) => [plan, ...current.filter((item) => item.id !== plan.id)])}
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
        >
          Undo
        </button>
      ),
    })
  }

  const syncWeek = () => setWorkoutPlans((current) => syncWeeklyPlans(current, weeklySchedule.plans))

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Workouts"
        title="Training plan and history"
        subtitle="Use guided suggestions, live session tracking, and history-aware logging that gets more useful every time you train."
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => startWorkoutSession("Open workout")} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
              <Play size={16} /> Start session
            </button>
            <Link to={createPageUrl("WorkoutsLog")} className="flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"><Plus size={16} /> Log workout</Link>
          </div>
        }
      />

      <SegmentedControl label="Workout view" value={view} onChange={setView} options={workoutViews} />

      {activeWorkout?.id && (
        <SectionCard tone="emerald" eyebrow="Active session" title={activeWorkout.name} description={`${activeSummary.completedExercises}/${activeSummary.totalExercises} exercises complete, ${activeSummary.completedSets}/${activeSummary.totalSets} sets logged.`} action={<Link to={createPageUrl("WorkoutsLog")} className="flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Resume session <ArrowRight size={16} /></Link>}>
          {currentExercise && (
            <p className="text-sm text-slate-700">
              Next up: <span className="font-semibold">{currentExercise.name}</span> for {currentExercise.setsReps}.
            </p>
          )}
        </SectionCard>
      )}

      {view === "overview" && (
        <>
          <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <SectionCard tone="indigo" title={nextWorkout.title} description={nextWorkout.reason}>
              <div className="grid gap-2 sm:grid-cols-2">
                {nextWorkout.exercises.map((exercise) => (
                  <div key={exercise.name} className="rounded-2xl bg-white p-3">
                    <p className="font-semibold text-slate-950">{exercise.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{exercise.setsReps}{exercise.weight_kg ? ` @ ${exercise.weight_kg}kg` : ""}</p>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => startWorkoutSession(nextWorkout.title, nextWorkout.exercises)} className="mt-4 flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"><Play size={16} /> Start suggested workout</button>
            </SectionCard>

            <SectionCard title="Current volume" description={`${workoutSets.length} structured sets logged so far.`}>
              <p className="text-3xl font-semibold text-slate-950">{Math.round(workoutVolume(workoutSets)).toLocaleString()}kg</p>
              {recentPRs.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-semibold text-slate-950">Recent bests</p>
                  {recentPRs.map((entry) => (
                    <div key={entry.key} className="rounded-2xl bg-slate-50 p-3">
                      <p className="font-medium text-slate-900">{entry.name}</p>
                      <p className="text-sm text-slate-500">Best {entry.bestWeight}kg, suggested next {entry.suggestedWeight || entry.bestWeight}kg</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <SectionCard title={progressionBlock.title} description={progressionBlock.summary}>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">{progressionBlock.phase.replace(/_/g, " ")}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">{progressionBlock.durationWeeks} week{progressionBlock.durationWeeks === 1 ? "" : "s"}</span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {progressionBlock.adjustments.map((item) => (
                  <div key={item} className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">{item}</div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Readiness" description="Latest coach recovery state.">
              <p className="text-3xl font-semibold text-slate-950">{weeklySchedule.readiness.score}/100</p>
              <p className="mt-2 text-sm text-slate-600">{weeklySchedule.readiness.text}</p>
            </SectionCard>
          </section>

          <SectionCard title="Recent sessions" description="Your latest logged sessions stay close to the overview so you can sanity-check what just got saved.">
            <div className="space-y-3">
              {recent.slice(0, 3).map((workout) => (
                <div key={workout.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <Dumbbell size={18} className="text-indigo-600" />
                    <div>
                      <p className="font-semibold text-slate-900">{workout.workout_type}</p>
                      <p className="text-sm text-slate-500">{workout.date} - {workout.duration_minutes || 0} minutes{workout.completed === false ? " - in progress" : ""}</p>
                    </div>
                  </div>
                  <button type="button" aria-label={`Remove ${workout.workout_type}`} onClick={() => removeWorkout(workout)} className="rounded-xl p-2 text-slate-400 hover:bg-white hover:text-rose-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {!recent.length && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No workouts logged yet.</p>}
            </div>
          </SectionCard>
        </>
      )}

      {view === "schedule" && (
        <>
          <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <SectionCard
              title="7-day training schedule"
              description={weeklySchedule.missedCount ? `Reshuffled ${weeklySchedule.missedCount} missed session${weeklySchedule.missedCount === 1 ? "" : "s"} into the next available slots.` : "Auto-built from your split, history, and latest recovery check-in."}
              action={<button type="button" onClick={syncWeek} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Sync week</button>}
            >
              <div className="space-y-3">
                {weeklySchedule.plans.map((plan) => (
                  <div key={plan.id} className="rounded-2xl bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{plan.date} - {plan.title}</p>
                        <p className="mt-1 text-sm text-slate-500">{plan.exercises.length} exercises</p>
                        {plan.reshuffled_from && <p className="mt-1 text-sm text-amber-700">Moved from {plan.reshuffled_from}</p>}
                        {plan.adjustment && <p className="mt-1 text-sm text-emerald-700">{plan.adjustment}</p>}
                      </div>
                      <button type="button" onClick={() => startWorkoutSession(plan.title, plan.exercises)} className="min-h-11 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">
                        Start
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Readiness" description="The recovery state driving the next week.">
              <p className="text-3xl font-semibold text-slate-950">{weeklySchedule.readiness.score}/100</p>
              <p className="mt-2 text-sm text-slate-600">{weeklySchedule.readiness.text}</p>
            </SectionCard>
          </section>

          {plannedToday.length > 0 && (
            <SectionCard title="Scheduled workouts" description="Coach-planned work for today that has not been completed yet.">
              <div className="grid gap-4 md:grid-cols-2">
                {plannedToday.map((plan) => (
                  <div key={plan.id} className="rounded-2xl border border-slate-200 p-3">
                    <WorkoutPlanCard workoutName={plan.title} exercises={plan.exercises} onBeginWorkout={(exercisesForPlan) => startWorkoutSession(plan.title, exercisesForPlan)} />
                    <button type="button" aria-label={`Remove ${plan.title}`} onClick={() => removePlan(plan)} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700"><Trash2 size={16} /> Remove plan</button>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          <WorkoutCalendar />
        </>
      )}

      {view === "history" && (
        <>
          <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <SectionCard title="Plateau watch" description="The lifts currently asking for cleaner progression or a recovery adjustment.">
              <div className="space-y-3">
                {progressionBlock.plateaus.length ? progressionBlock.plateaus.slice(0, 3).map((item) => (
                  <div key={item.exerciseName} className="rounded-2xl bg-slate-50 p-3">
                    <p className="font-semibold text-slate-950">{item.exerciseName}</p>
                    <p className="mt-1 text-sm text-slate-500">Best {item.bestWeight}kg - Avg volume {item.averageVolume}kg</p>
                    <p className="mt-2 text-sm text-slate-600">{item.suggestion}</p>
                  </div>
                )) : (
                  <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No clear plateau signal in the current block. Keep prioritising clean technique and repeatable performance.</p>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Volume snapshot" description="A quick read on structured work already logged.">
              <p className="text-3xl font-semibold text-slate-950">{Math.round(workoutVolume(workoutSets)).toLocaleString()}kg</p>
              <p className="mt-2 text-sm text-slate-600">{workoutSets.length} structured sets recorded.</p>
            </SectionCard>
          </section>

          <SectionCard title="Recent sessions" description="Recent logs, including any sessions still marked in progress.">
            <div className="space-y-3">
              {recent.map((workout) => (
                <div key={workout.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <Dumbbell size={18} className="text-indigo-600" />
                    <div>
                      <p className="font-semibold text-slate-900">{workout.workout_type}</p>
                      <p className="text-sm text-slate-500">{workout.date} - {workout.duration_minutes || 0} minutes{workout.completed === false ? " - in progress" : ""}</p>
                    </div>
                  </div>
                  <button type="button" aria-label={`Remove ${workout.workout_type}`} onClick={() => removeWorkout(workout)} className="rounded-xl p-2 text-slate-400 hover:bg-white hover:text-rose-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {!recent.length && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No workouts logged yet.</p>}
            </div>
          </SectionCard>
        </>
      )}

      {view === "library" && (
        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <SectionCard title="Quick start plans" description="Useful templates for when you want a clean session without planning from scratch." action={<Link to={createPageUrl("WorkoutLibrary")} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><Library size={16} /> Full library</Link>}>
            <div className="grid gap-4 md:grid-cols-2">
              <WorkoutPlanCard
                workoutName="Upper strength"
                onBeginWorkout={(planExercises) => startWorkoutSession("Upper strength", planExercises)}
                exercises={[
                  { name: "Bench Press", muscle: "chest", setsReps: "4x6", weight_kg: 0 },
                  { name: "Pull Up", muscle: "back", setsReps: "4x6-8", weight_kg: 0 },
                  { name: "Overhead Press", muscle: "shoulders", setsReps: "3x8", weight_kg: 0 },
                ]}
              />
              <WorkoutPlanCard
                workoutName="Lower strength"
                onBeginWorkout={(planExercises) => startWorkoutSession("Lower strength", planExercises)}
                exercises={[
                  { name: "Back Squat", muscle: "legs", setsReps: "4x5", weight_kg: 0 },
                  { name: "Romanian Deadlift", muscle: "legs", setsReps: "3x8", weight_kg: 0 },
                  { name: "Plank", muscle: "core", setsReps: "3x45s", weight_kg: 0 },
                ]}
              />
            </div>
          </SectionCard>

          <SectionCard title="Exercise library" description="The most-used saved exercises, plus rest cues for the current active lift.">
            <div className="space-y-2">
              {exercises.slice(0, 5).map((exercise) => (
                <div key={exercise.id} className="rounded-2xl bg-slate-50 p-3">
                  <p className="font-medium text-slate-900">{exercise.name}</p>
                  <p className="text-sm text-slate-500">{exercise.muscle_group || exercise.category}</p>
                </div>
              ))}
            </div>
            {currentExercise && (
              <div className="mt-4 rounded-2xl border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-950">Rest guidance</p>
                <p className="mt-1 text-sm text-slate-500">After each heavy compound set, take 90-120 seconds. Accessories can stay around 60-75 seconds.</p>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-indigo-600">
                  <TimerReset size={16} /> {currentExercise.name}
                </div>
              </div>
            )}
          </SectionCard>
        </section>
      )}
    </div>
  )
}
