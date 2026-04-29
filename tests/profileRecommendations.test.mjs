import assert from "node:assert/strict"
import test from "node:test"
import { buildStarterRecommendations, buildTargetModel, recommendTargets } from "../src/lib/profileRecommendations.js"

test("recommendTargets uses a Mifflin-St Jeor style estimate plus activity and goal adjustments", () => {
  const profile = {
    goal: "fat_loss",
    gender: "male",
    age: 37,
    weight_kg: 96,
    height_cm: 198,
    activity_level: "lightly_active",
    training_days_per_week: 3,
  }

  const model = buildTargetModel(profile)
  const targets = recommendTargets(profile)

  assert.equal(model.method, "Mifflin-St Jeor starting estimate")
  assert.equal(model.bmr, 2018)
  assert.equal(model.maintenanceCalories, 2724)
  assert.equal(model.goalAdjustmentCalories, -400)
  assert.equal(model.dailyCalories, 2324)
  assert.match(model.summary, /BMI is shown for context only/i)

  assert.deepEqual(targets, {
    daily_calories: 2324,
    protein_g: 182,
    carbs_g: 226,
    fat_g: 77,
    split_type: "full_body",
  })
})

test("buildStarterRecommendations returns selectable, input-driven starter options", () => {
  const recommendation = buildStarterRecommendations({
    goal: "fat_loss",
    gender: "male",
    age: 37,
    weight_kg: 96,
    height_cm: 198,
    activity_level: "lightly_active",
    training_days_per_week: 3,
    split_type: "upper_lower",
    target_weight_kg: 88,
  })

  assert.equal(recommendation.profile.daily_calories, 2324)
  assert.equal(recommendation.recommendedWorkoutOptionId, "recommended")
  assert.equal(recommendation.recommendedMealOptionId, "satiety")
  assert.equal(recommendation.workoutOptions.length, 4)
  assert.equal(recommendation.mealOptions.length, 4)
  assert.ok(recommendation.workoutOptions.some((option) => option.id === "skip" && option.plan === null))
  assert.ok(recommendation.mealOptions.some((option) => option.id === "skip" && option.plan === null))

  const recommendedMeal = recommendation.mealOptions.find((option) => option.id === recommendation.recommendedMealOptionId)
  assert.ok(recommendedMeal)
  assert.ok(recommendedMeal.calorieCoverage >= 92)
  assert.ok(recommendedMeal.proteinCoverage >= 88)
  assert.ok(recommendedMeal.plan.meals.length >= 4)
})
