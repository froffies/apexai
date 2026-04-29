import { subDays } from "date-fns"
import { macroTotals } from "@/lib/fitnessDefaults"

export const achievementDefinitions = [
  { key: "first_workout", title: "First Workout", description: "Log your first workout.", category: "workout" },
  { key: "ten_workouts", title: "10 Workouts Completed", description: "Complete 10 workouts.", category: "workout" },
  { key: "protein_week", title: "Protein Consistency Week", description: "Hit your protein target 7 days in a row.", category: "nutrition" },
  { key: "first_5kg_lost", title: "First 5kg Lost", description: "Lose 5kg from starting weight.", category: "milestone" },
  { key: "volume_100k", title: "100,000kg Volume Milestone", description: "Log 100,000kg of training volume.", category: "strength" },
  { key: "habit_week", title: "7-Day Habit Streak", description: "Complete at least one habit for 7 days.", category: "consistency" },
]

function dateISO(date) {
  return date.toISOString().slice(0, 10)
}

export function calculateAchievements({ profile, workouts, meals, progress, workoutSets, habits }) {
  const earned = new Set()
  if (workouts.length >= 1) earned.add("first_workout")
  if (workouts.length >= 10) earned.add("ten_workouts")

  const volume = workoutSets.reduce((sum, set) => sum + Number(set.weight_kg || 0) * Number(set.reps || 0), 0)
  if (volume >= 100000) earned.add("volume_100k")

  const latestWeight = [...progress].sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0]?.weight_kg
  if (latestWeight && Number(profile.weight_kg || 0) - Number(latestWeight) >= 5) earned.add("first_5kg_lost")

  const proteinHit = Array.from({ length: 7 }, (_, index) => dateISO(subDays(new Date(), index))).every((date) => macroTotals(meals, date).protein_g >= Number(profile.protein_g || 0))
  if (proteinHit) earned.add("protein_week")

  const habitHit = Array.from({ length: 7 }, (_, index) => dateISO(subDays(new Date(), index))).every((date) => habits.some((habit) => habit.date === date && habit.completed))
  if (habitHit) earned.add("habit_week")

  return achievementDefinitions.map((achievement) => ({
    ...achievement,
    earned: earned.has(achievement.key),
    earned_at: earned.has(achievement.key) ? new Date().toISOString() : null,
  }))
}
