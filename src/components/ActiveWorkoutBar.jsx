import { Link } from "react-router-dom"
import { ArrowRight, Clock, Dumbbell, X } from "lucide-react"
import { createPageUrl } from "@/utils"
import { emptyActiveWorkout, storageKeys } from "@/lib/fitnessDefaults"
import { getCurrentActiveExercise, summarizeActiveWorkout } from "@/lib/workoutIntelligence"
import { useLocalStorage } from "@/lib/useLocalStorage"

export default function ActiveWorkoutBar() {
  const [activeWorkout, setActiveWorkout] = useLocalStorage(storageKeys.activeWorkout, emptyActiveWorkout)
  if (!activeWorkout?.id) return null

  const minutes = Math.max(0, Math.round((Date.now() - new Date(activeWorkout.started_at).getTime()) / 60000))
  const currentExercise = getCurrentActiveExercise(activeWorkout)
  const summary = summarizeActiveWorkout(activeWorkout)

  return (
    <div data-testid="active-workout-bar" className="fixed inset-x-3 bottom-24 z-50 rounded-lg border border-indigo-200 bg-white p-3 shadow-lg md:left-auto md:right-5 md:w-[28rem]">
      <div className="flex items-center justify-between gap-3">
        <Link to={createPageUrl("WorkoutsLog")} className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Dumbbell size={18} />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-950">{activeWorkout.name}</p>
              <p className="flex items-center gap-1 text-sm text-slate-500"><Clock size={14} /> {minutes} min active</p>
            </div>
          </div>
          <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-medium text-slate-900">
              {summary.completedSets}/{summary.totalSets} sets logged
            </p>
            {currentExercise && (
              <p className="mt-1 text-slate-500">
                Current: {currentExercise.name} ({currentExercise.logged_sets?.length || 0}/{currentExercise.target_sets || 1} sets)
              </p>
            )}
          </div>
        </Link>
        <div className="flex flex-col gap-2">
          <Link to={createPageUrl("WorkoutsLog")} className="flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">
            Resume <ArrowRight size={16} />
          </Link>
          <button type="button" onClick={() => setActiveWorkout(emptyActiveWorkout)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700">
            <X size={17} />
          </button>
        </div>
      </div>
    </div>
  )
}
