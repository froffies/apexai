import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns"
import { starterWorkouts, storageKeys } from "@/lib/fitnessDefaults"
import { useLocalStorage } from "@/lib/useLocalStorage"

export default function WorkoutCalendar() {
  const [workouts] = useLocalStorage(storageKeys.workouts, starterWorkouts)
  const [workoutPlans] = useLocalStorage(storageKeys.workoutPlans, [])
  const now = new Date()
  const days = eachDayOfInterval({ start: startOfMonth(now), end: endOfMonth(now) })

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-950">Training calendar</h2>
        <p className="text-sm font-medium text-slate-500">{format(now, "MMMM yyyy")}</p>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dayWorkouts = workouts.filter((workout) => isSameDay(new Date(`${workout.date}T00:00:00`), day))
          const dayPlans = workoutPlans.filter((plan) => isSameDay(new Date(`${plan.date}T00:00:00`), day) && plan.status !== "completed")
          return (
            <div key={day.toISOString()} className="min-h-16 rounded-xl border border-slate-100 bg-slate-50 p-2">
              <p className="text-xs font-semibold text-slate-600">{format(day, "d")}</p>
              <div className="mt-2 flex gap-1">
                {dayWorkouts.length > 0 && <div className="h-2 w-2 rounded-full bg-indigo-600" title={`${dayWorkouts.length} workout(s)`} />}
                {dayPlans.length > 0 && <div className="h-2 w-2 rounded-full border border-amber-500 bg-transparent" title={`${dayPlans.length} planned workout(s)`} />}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
