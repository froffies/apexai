import { useMemo } from "react"
import { macroTotals, storageKeys, workoutsForDate } from "@/lib/fitnessDefaults"
import { todayISO, useLocalStorage } from "@/lib/useLocalStorage"

export default function AchievementChecker({ children }) {
  return <>{children}</>
}

export function useTodaysAchievements(profile, meals, workouts) {
  return useMemo(() => {
    const totals = macroTotals(meals, todayISO())
    const todaysWorkouts = workoutsForDate(workouts, todayISO())
    return [
      totals.protein_g >= Number(profile.protein_g || 0) && {
        key: "protein_goal",
        title: "Protein goal hit",
        description: "You reached today's protein target.",
      },
      todaysWorkouts.length > 0 && {
        key: "workout_logged",
        title: "Workout logged",
        description: "Training is on the board for today.",
      },
    ].filter(Boolean)
  }, [meals, profile, workouts])
}

export function useAchievementData() {
  const [profile] = useLocalStorage(storageKeys.profile, {})
  const [meals] = useLocalStorage(storageKeys.meals, [])
  const [workouts] = useLocalStorage(storageKeys.workouts, [])
  return useTodaysAchievements(profile, meals, workouts)
}
