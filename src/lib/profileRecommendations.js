import { buildWorkoutPlan } from "@/lib/coachActions"
import { goalLabel, numberValue } from "@/lib/fitnessDefaults"
import { foodToMeal, verifiedFoods } from "@/lib/nutritionDatabase"
import { parseSetsRepsSpec } from "@/lib/workoutIntelligence"
import { todayISO, uid } from "@/lib/useLocalStorage"

const activityMultipliers = {
  lightly_active: 1.35,
  moderately_active: 1.55,
  very_active: 1.75,
}

const splitByDays = {
  2: "full_body",
  3: "full_body",
  4: "upper_lower",
  5: "ppl",
  6: "ppl",
}

const foodIndex = new Map(verifiedFoods.map((food) => [food.id, food]))

const mealStyleDefinitions = [
  {
    id: "balanced",
    label: "Balanced starter day",
    badge: "Balanced",
    description: "A steady spread of calories and protein across the day.",
    base: [
      ["greek_yoghurt_berries_oats", "breakfast"],
      ["chicken_rice_bowl", "lunch"],
      ["salmon_potato_salad", "dinner"],
      ["protein_shake_40", "snack"],
    ],
    boosters: ["banana", "toast_2", "eggs_2", "flat_white", "tuna_rice", "lean_beef_bowl"],
  },
  {
    id: "satiety",
    label: "Higher-satiety day",
    badge: "Appetite control",
    description: "Leans harder on protein and fuller meals to make a calorie deficit easier to stick to.",
    base: [
      ["eggs_2", "breakfast"],
      ["greek_yoghurt_berries_oats", "breakfast"],
      ["tuna_rice", "lunch"],
      ["salmon_potato_salad", "dinner"],
      ["protein_shake_40", "snack"],
    ],
    boosters: ["banana", "toast_2", "flat_white", "eggs_2", "chicken_rice_bowl"],
  },
  {
    id: "training_day",
    label: "Training-day fuel",
    badge: "Performance",
    description: "Pushes carbs and protein higher around training while keeping food choices simple.",
    base: [
      ["greek_yoghurt_berries_oats", "breakfast"],
      ["chicken_burrito_bowl", "lunch"],
      ["salmon_potato_salad", "dinner"],
      ["protein_shake_40", "snack"],
    ],
    boosters: ["banana", "toast_2", "flat_white", "protein_shake_40", "chicken_rice_bowl", "lean_beef_bowl"],
  },
]

function sexOffset(gender) {
  if (gender === "male") return 5
  if (gender === "female") return -161
  return -78
}

function goalAdjustment(goal) {
  if (goal === "fat_loss") return -400
  if (goal === "muscle_gain") return 250
  if (goal === "strength") return 120
  if (goal === "athletic_performance") return 180
  return 0
}

function humanizeToken(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function roundMacro(value) {
  return Math.max(0, Math.round(Number(value) || 0))
}

function bmiCategory(bmi) {
  if (!bmi) return "Unavailable"
  if (bmi < 18.5) return "Below the common healthy range"
  if (bmi < 25) return "Within the common healthy range"
  if (bmi < 30) return "Above the common healthy range"
  return "Well above the common healthy range"
}

function buildBmi(weightKg, heightCm) {
  const heightMetres = heightCm / 100
  if (!weightKg || !heightMetres) return 0
  return Math.round((weightKg / (heightMetres * heightMetres)) * 10) / 10
}

function recommendedSplit(profile) {
  if (profile.split_type && profile.split_type !== "custom") return profile.split_type
  return splitByDays[Math.round(Number(profile.training_days_per_week) || 0)] || "upper_lower"
}

function pickMealRecommendationId(goal) {
  if (goal === "fat_loss") return "satiety"
  if (goal === "muscle_gain" || goal === "strength" || goal === "athletic_performance") return "training_day"
  return "balanced"
}

function totalsForFoods(entries) {
  return entries.reduce(
    (totals, entry) => ({
      calories: totals.calories + numberValue(entry.food?.calories),
      protein_g: totals.protein_g + numberValue(entry.food?.protein_g),
      carbs_g: totals.carbs_g + numberValue(entry.food?.carbs_g),
      fat_g: totals.fat_g + numberValue(entry.food?.fat_g),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )
}

function buildMacroFitScore(totals, profile) {
  const targetCalories = numberValue(profile.daily_calories)
  const targetProtein = numberValue(profile.protein_g)
  const targetCarbs = numberValue(profile.carbs_g)
  const targetFat = numberValue(profile.fat_g)
  const calorieDiff = Math.abs(targetCalories - totals.calories)
  const proteinDiff = Math.abs(targetProtein - totals.protein_g)
  const carbsDiff = Math.abs(targetCarbs - totals.carbs_g)
  const fatDiff = Math.abs(targetFat - totals.fat_g)
  const proteinDeficitPenalty = Math.max(0, targetProtein - totals.protein_g) * 2.4
  const calorieDeficitPenalty = Math.max(0, targetCalories - totals.calories) * 0.55

  return (
    calorieDiff
    + (proteinDiff * 8)
    + (carbsDiff * 2)
    + (fatDiff * 3)
    + proteinDeficitPenalty
    + calorieDeficitPenalty
  )
}

function topUpMealEntries(baseEntries, profile, boosterIds = []) {
  const boosters = boosterIds
    .map((id) => foodIndex.get(id))
    .filter(Boolean)

  const maxAdditions = profile.goal === "fat_loss" ? 3 : 4
  let bestEntries = [...baseEntries]
  let bestTotals = totalsForFoods(bestEntries)
  let bestScore = buildMacroFitScore(bestTotals, profile)

  function evaluate(entries) {
    const totals = totalsForFoods(entries)
    const score = buildMacroFitScore(totals, profile)
    if (score < bestScore) {
      bestScore = score
      bestEntries = [...entries]
      bestTotals = totals
    }
  }

  function search(entries, startIndex, depth, counts = new Map()) {
    evaluate(entries)
    if (depth >= maxAdditions) return

    for (let index = startIndex; index < boosters.length; index += 1) {
      const food = boosters[index]
      const currentCount = counts.get(food.id) || 0
      if (currentCount >= 2) continue

      counts.set(food.id, currentCount + 1)
      entries.push({ food, mealType: "snack" })
      search(entries, index, depth + 1, counts)
      entries.pop()
      if (currentCount === 0) counts.delete(food.id)
      else counts.set(food.id, currentCount)
    }
  }

  search([...baseEntries], 0, 0, new Map())

  return { entries: bestEntries, totals: bestTotals }
}

function buildMealPlanOption(profile, definition) {
  const baseEntries = definition.base
    .map(([foodId, mealType]) => ({ food: foodIndex.get(foodId), mealType }))
    .filter((entry) => entry.food)

  const { entries, totals } = topUpMealEntries(baseEntries, profile, definition.boosters)

  return {
    id: definition.id,
    label: definition.label,
    badge: definition.badge,
    description: definition.description,
    reason: `${definition.label} is matched against your ${goalLabel(profile.goal).toLowerCase()} goal and current ${numberValue(profile.daily_calories)} kcal target.`,
    summary: `${roundMacro(totals.calories)} kcal | ${roundMacro(totals.protein_g)}g protein | ${roundMacro(totals.carbs_g)}c / ${roundMacro(totals.fat_g)}f`,
    calorieCoverage: roundMacro((totals.calories / Math.max(1, numberValue(profile.daily_calories))) * 100),
    proteinCoverage: roundMacro((totals.protein_g / Math.max(1, numberValue(profile.protein_g))) * 100),
    plan: {
      id: uid("meal_plan"),
      date: todayISO(),
      title: definition.label,
      meals: entries.map(({ food, mealType }) => foodToMeal(food, {
        id: uid("meal"),
        date: todayISO(),
        meal_type: mealType,
        notes: `Starter plan generated from your onboarding inputs using the verified Australian nutrition catalogue.`,
      })),
    },
  }
}

function buildMealOptions(profile) {
  const options = mealStyleDefinitions.map((definition) => buildMealPlanOption(profile, definition))
  options.push({
    id: "skip",
    label: "Decide later",
    badge: "Skip",
    description: "Save your targets only and let Coach or Nutrition build the first day later.",
    reason: "Useful if you want to explore the app before choosing a structure.",
    summary: "No starter meal plan saved",
    calorieCoverage: 0,
    proteinCoverage: 0,
    plan: null,
  })
  return options
}

function adjustSetsRepsForEase(spec = "") {
  const parsed = parseSetsRepsSpec(spec)
  if (parsed.durationMinutes) return `${Math.max(15, parsed.durationMinutes)} min`

  const sets = Math.max(2, parsed.sets - 1)
  const repMin = Math.max(8, parsed.repMin)
  const repMax = Math.max(repMin, parsed.repMax, 10)
  return `${sets}x${repMin}${repMax !== repMin ? `-${repMax}` : ""}`
}

function buildWorkoutOptions(profile) {
  const recommendedPlan = buildWorkoutPlan(profile, [], [], [])
  const lighterPlan = {
    ...recommendedPlan,
    id: uid("plan"),
    title: `${recommendedPlan.title} (lower fatigue)`,
    reason: `Same split and movement pattern, but trimmed volume to make week one easier to recover from while you build consistency.`,
    exercises: (recommendedPlan.exercises || []).slice(0, 4).map((exercise) => ({
      ...exercise,
      setsReps: adjustSetsRepsForEase(exercise.setsReps),
    })),
  }

  const foundationSource = buildWorkoutPlan({ ...profile, split_type: "full_body" }, [], [], [])
  const foundationPlan = {
    ...foundationSource,
    id: uid("plan"),
    title: profile.goal === "fat_loss" || profile.goal === "athletic_performance" ? "Full-body foundation + cardio" : "Full-body foundation",
    reason: `A simpler full-body option if you want a lower-friction first session before committing to your preferred split.`,
    exercises: [
      ...(foundationSource.exercises || []).slice(0, 3).map((exercise) => ({
        ...exercise,
        setsReps: exercise.name === "Back Squat" ? "3x8" : adjustSetsRepsForEase(exercise.setsReps),
      })),
      profile.goal === "fat_loss" || profile.goal === "athletic_performance"
        ? { name: "Incline Walk", muscle: "cardio", setsReps: "15 min", weight_kg: 0 }
        : { name: "Plank", muscle: "core", setsReps: "3x12", weight_kg: 0 },
    ],
  }

  return [
    {
      id: "recommended",
      label: "Recommended first session",
      badge: "Best fit",
      description: `Built from your ${humanizeToken(profile.split_type)} preference, ${numberValue(profile.training_days_per_week)} training days, and ${goalLabel(profile.goal).toLowerCase()} goal.`,
      reason: recommendedPlan.reason,
      plan: recommendedPlan,
    },
    {
      id: "lighter_start",
      label: "Lower-fatigue start",
      badge: "Easier week 1",
      description: "Keeps the same movement pattern but lowers the opening week stress.",
      reason: lighterPlan.reason,
      plan: lighterPlan,
    },
    {
      id: "foundation",
      label: foundationPlan.title,
      badge: "Flexible",
      description: "A simpler fallback day if you want to ease in before following a stricter rotation.",
      reason: foundationPlan.reason,
      plan: foundationPlan,
    },
    {
      id: "skip",
      label: "Decide later",
      badge: "Skip",
      description: "Enter the app with targets only and let Coach or Workouts build the first day later.",
      reason: "Useful if you want to explore first or choose in context after onboarding.",
      plan: null,
    },
  ]
}

export function buildTargetModel(profile) {
  const weight = numberValue(profile.weight_kg) || 80
  const height = numberValue(profile.height_cm) || 175
  const age = numberValue(profile.age) || 30
  const activityMultiplier = activityMultipliers[profile.activity_level] || 1.55
  const bmr = Math.round(10 * weight + 6.25 * height - 5 * age + sexOffset(profile.gender))
  const maintenanceCalories = Math.round(bmr * activityMultiplier)
  const goalAdjustmentCalories = goalAdjustment(profile.goal)
  const dailyCalories = Math.max(1400, Math.round(maintenanceCalories + goalAdjustmentCalories))
  const bmi = buildBmi(weight, height)

  return {
    method: "Mifflin-St Jeor starting estimate",
    bmr,
    maintenanceCalories,
    goalAdjustmentCalories,
    dailyCalories,
    activityMultiplier,
    bmi,
    bmiCategory: bmiCategory(bmi),
    summary: "Calories start from a resting-energy estimate using age, height, weight, and gender setting, then get adjusted for activity and goal. BMI is shown for context only and does not directly set your macros.",
  }
}

export function recommendTargets(profile) {
  const model = buildTargetModel(profile)
  const weight = numberValue(profile.weight_kg) || 80
  const protein = Math.max(120, Math.round(weight * (profile.goal === "muscle_gain" ? 2.1 : 1.9)))
  const fat = Math.max(45, Math.round(weight * 0.8))
  const carbs = Math.max(80, Math.round((model.dailyCalories - protein * 4 - fat * 9) / 4))

  return {
    daily_calories: model.dailyCalories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    split_type: recommendedSplit(profile),
  }
}

export function recommendTargetWeight(profile) {
  const weight = numberValue(profile.weight_kg) || 80
  if (profile.goal === "fat_loss") return Math.max(45, Math.round(weight * 0.92))
  if (profile.goal === "muscle_gain") return Math.round(weight * 1.05)
  return Math.round(weight)
}

export function buildStarterRecommendations(profile) {
  const enrichedProfile = {
    ...profile,
    ...recommendTargets(profile),
    target_weight_kg: numberValue(profile.target_weight_kg) || recommendTargetWeight(profile),
  }

  const workoutOptions = buildWorkoutOptions(enrichedProfile)
  const mealOptions = buildMealOptions(enrichedProfile)
  const recommendedWorkoutOptionId = "recommended"
  const recommendedMealOptionId = pickMealRecommendationId(enrichedProfile.goal)

  return {
    profile: enrichedProfile,
    targetModel: buildTargetModel(enrichedProfile),
    workoutOptions,
    mealOptions,
    recommendedWorkoutOptionId,
    recommendedMealOptionId,
    workoutPlan: workoutOptions.find((option) => option.id === recommendedWorkoutOptionId)?.plan || null,
    mealPlan: mealOptions.find((option) => option.id === recommendedMealOptionId)?.plan || null,
  }
}
