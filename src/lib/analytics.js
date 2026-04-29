import { format, subDays } from "date-fns"
import { macroTotals, numberValue, workoutVolume } from "@/lib/fitnessDefaults"

export function lastNDays(days = 30) {
  return Array.from({ length: days }, (_, index) => {
    const date = subDays(new Date(), days - index - 1)
    return date.toISOString().slice(0, 10)
  })
}

export function buildDailyTrend({ meals, progress, workouts, workoutSets, days = 30, calorieTarget = 0 }) {
  return lastNDays(days).map((date) => {
    const totals = macroTotals(meals, date)
    const progressEntry = progress.find((entry) => entry.date === date)
    const dayWorkouts = workouts.filter((workout) => workout.date === date)
    const daySets = workoutSets.filter((set) => set.date === date)
    return {
      date,
      label: format(new Date(`${date}T00:00:00`), "d MMM"),
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein_g),
      target: calorieTarget,
      weight: progressEntry?.weight_kg || null,
      workouts: dayWorkouts.length,
      volume: workoutVolume(daySets),
    }
  })
}

export function muscleVolume(workoutSets) {
  const grouped = workoutSets.reduce((acc, set) => {
    const key = set.muscle_group || "full_body"
    acc[key] = (acc[key] || 0) + numberValue(set.weight_kg) * numberValue(set.reps)
    return acc
  }, {})

  return Object.entries(grouped).map(([muscle, volume]) => ({ muscle, volume: Math.round(volume) })).sort((a, b) => b.volume - a.volume)
}

export function calorieAdherence(meals, profile, days = 7) {
  const trend = buildDailyTrend({ meals, progress: [], workouts: [], workoutSets: [], days, calorieTarget: profile.daily_calories })
  const daysWithMeals = trend.filter((day) => day.calories > 0)
  if (!daysWithMeals.length) return 0
  const adherent = daysWithMeals.filter((day) => Math.abs(day.calories - profile.daily_calories) <= 150).length
  return Math.round((adherent / daysWithMeals.length) * 100)
}

export function coachingInsight({ meals, progress, workouts, workoutSets, profile }) {
  const trend = buildDailyTrend({ meals, progress, workouts, workoutSets, days: 30, calorieTarget: profile.daily_calories })
  const workoutDays = trend.filter((day) => day.workouts > 0).length
  const loggedCalories = trend.filter((day) => day.calories > 0)
  const avgCalories = loggedCalories.length ? Math.round(loggedCalories.reduce((sum, day) => sum + day.calories, 0) / loggedCalories.length) : 0
  const weights = trend.filter((day) => day.weight)
  const weightChange = weights.length > 1 ? weights[weights.length - 1].weight - weights[0].weight : 0

  if (weights.length > 1 && workoutDays >= 8 && weightChange <= 0) {
    return `Strong month: ${workoutDays} training days and weight is down ${Math.abs(weightChange).toFixed(1)}kg. Keep calories around ${avgCalories || profile.daily_calories} kcal.`
  }
  if (workoutDays < 6) {
    return `Workout consistency is the biggest lever right now. You logged ${workoutDays} training days in 30 days; aim for ${profile.training_days_per_week || 4} per week before cutting calories harder.`
  }
  if (avgCalories > profile.daily_calories + 200) {
    return `Calories are averaging about ${avgCalories} kcal, above your ${profile.daily_calories} kcal target. Tighten tracking before changing the program.`
  }
  return "Your data is building. Keep logging meals, sets, and check-ins so the coach can detect plateaus and useful correlations."
}
