import { todayISO } from "@/lib/useLocalStorage"

export const storageKeys = {
  profile: "apexai.profile",
  meals: "apexai.meals",
  workouts: "apexai.workouts",
  progress: "apexai.progress",
  photos: "apexai.photos",
  habits: "apexai.habits",
  recoveryLogs: "apexai.recoveryLogs",
  chat: "apexai.chat",
  coachMealSession: "apexai.coachMealSession",
  coachWorkoutSession: "apexai.coachWorkoutSession",
  shopping: "apexai.shopping",
  recipes: "apexai.recipes",
  favoriteFoods: "apexai.favoriteFoods",
  recentFoods: "apexai.recentFoods",
  exercises: "apexai.exercises",
  challenges: "apexai.challenges",
  activeWorkout: "apexai.activeWorkout",
  workoutSets: "apexai.workoutSets",
  workoutPlans: "apexai.workoutPlans",
  mealPlans: "apexai.mealPlans",
  achievements: "apexai.achievements",
  dashboardWidgets: "apexai.dashboardWidgets",
}

export const defaultProfile = {
  name: "",
  goal: "fat_loss",
  gender: "other",
  age: 32,
  weight_kg: 82,
  height_cm: 178,
  target_weight_kg: 76,
  activity_level: "moderately_active",
  daily_calories: 2200,
  protein_g: 165,
  carbs_g: 220,
  fat_g: 70,
  split_type: "upper_lower",
  training_days_per_week: 4,
  onboarded: false,
  locale: "AU",
}

export const starterMeals = []

export const starterExercises = [
  { id: "ex_1", name: "Bench Press", category: "chest", muscle_group: "Chest", description: "Compound horizontal press.", video_url: "" },
  { id: "ex_2", name: "Pull Up", category: "back", muscle_group: "Back", description: "Vertical pull for lats and upper back.", video_url: "" },
  { id: "ex_3", name: "Back Squat", category: "legs", muscle_group: "Quads", description: "Lower body strength staple.", video_url: "" },
  { id: "ex_4", name: "Romanian Deadlift", category: "legs", muscle_group: "Hamstrings", description: "Hip hinge for posterior chain.", video_url: "" },
  { id: "ex_5", name: "Overhead Press", category: "shoulders", muscle_group: "Shoulders", description: "Strict press for delts and triceps.", video_url: "" },
  { id: "ex_6", name: "Plank", category: "core", muscle_group: "Core", description: "Anti-extension trunk stability.", video_url: "" },
  { id: "ex_7", name: "Incline Walk", category: "cardio", muscle_group: "Cardio", description: "Low impact aerobic base work.", video_url: "" },
]

export const starterRecipes = [
  {
    id: "recipe_1",
    name: "High Protein Overnight Oats",
    description: "Oats, Greek yoghurt, whey, berries, and chia.",
    meal_type: "breakfast",
    ingredients: ["rolled oats", "Greek yoghurt", "whey protein", "berries", "chia seeds"],
    total_calories: 510,
    total_protein_g: 45,
    total_carbs_g: 58,
    total_fat_g: 12,
    servings: 1,
  },
  {
    id: "recipe_2",
    name: "Lean Beef Burrito Bowl",
    description: "Beef mince, rice, beans, salsa, salad, and avocado.",
    meal_type: "dinner",
    ingredients: ["lean beef", "rice", "black beans", "salsa", "lettuce", "avocado"],
    total_calories: 720,
    total_protein_g: 52,
    total_carbs_g: 78,
    total_fat_g: 22,
    servings: 1,
  },
]

export const starterWorkouts = []

export const starterProgress = []

export const starterChallenges = [
  {
    id: "challenge_1",
    title: "10 Workout Month",
    description: "Complete 10 logged workouts this month.",
    category: "workouts",
    goal_value: 10,
    goal_unit: "workouts",
    duration_days: 30,
    progress_value: 1,
    completed: false,
  },
  {
    id: "challenge_2",
    title: "Protein Consistency",
    description: "Hit your protein goal 5 days in a row.",
    category: "nutrition",
    goal_value: 5,
    goal_unit: "days",
    duration_days: 7,
    progress_value: 0,
    completed: false,
  },
]

export const defaultHabits = [
  { id: "habit_protein", date: todayISO(), habit: "Hit protein target", completed: false },
  { id: "habit_steps", date: todayISO(), habit: "8k steps", completed: false },
  { id: "habit_sleep", date: todayISO(), habit: "Sleep wind-down", completed: false },
]

export const starterRecoveryLogs = []

export const emptyActiveWorkout = {
  id: "",
  session_id: "",
  date: "",
  name: "",
  started_at: "",
  current_exercise_index: 0,
  exercises: [],
}

export const starterWorkoutSets = []

export const defaultDashboardWidgets = [
  "summary",
  "charts",
  "macros",
  "today",
  "habits",
  "progress",
]

export function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function mealsForDate(meals, date = todayISO()) {
  return meals.filter((meal) => meal.date === date)
}

export function macroTotals(meals, date = todayISO()) {
  return mealsForDate(meals, date).reduce(
    (totals, meal) => ({
      calories: totals.calories + numberValue(meal.calories),
      protein_g: totals.protein_g + numberValue(meal.protein_g),
      carbs_g: totals.carbs_g + numberValue(meal.carbs_g),
      fat_g: totals.fat_g + numberValue(meal.fat_g),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )
}

export function workoutsForDate(workouts, date = todayISO()) {
  return workouts.filter((workout) => workout.date === date)
}

export function latestProgress(progress) {
  return [...progress].sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0] || null
}

export function goalLabel(goal) {
  const labels = {
    fat_loss: "Fat loss",
    muscle_gain: "Muscle gain",
    strength: "Strength",
    athletic_performance: "Athletic performance",
  }
  return labels[goal] || "General fitness"
}

export function coachReply(message, { profile, totals, todaysWorkouts }) {
  const text = message.toLowerCase()
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(text)) {
    const name = profile?.name?.trim() || "there"
    return `Hey ${name}. What do you want to sort out first today?`
  }
  if (text.includes("protein") || text.includes("macro")) {
    const remaining = Math.max(0, numberValue(profile.protein_g) - totals.protein_g)
    return `You’ve got about ${remaining}g of protein left today. The simplest fix is one solid serve of lean protein plus an easy carb you’ll actually eat.`
  }
  if (text.includes("workout") || text.includes("train")) {
    if (todaysWorkouts.length) return "You’ve already logged training today. If you want extra work, keep it light and easy to recover from."
    return `For your ${goalLabel(profile.goal).toLowerCase()} goal, I’d keep today simple: a few big lifts, a bit of accessory work, and leave a rep or two in reserve.`
  }
  if (text.includes("weight") || text.includes("progress")) {
    return "Judge progress from the weekly trend, not one weigh-in. Weight, waist, and a short note give you a much cleaner read than scale noise alone."
  }
  return "Give me the one thing you want to sort out first, and I’ll help you work through it."
}

export function weeklyWorkoutCount(workouts) {
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  return workouts.filter((workout) => new Date(`${workout.date}T00:00:00`) >= weekAgo).length
}

export function workoutVolume(sets) {
  return sets.reduce((total, set) => total + numberValue(set.weight_kg) * numberValue(set.reps), 0)
}
