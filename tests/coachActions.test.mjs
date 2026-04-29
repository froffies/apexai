import assert from "node:assert/strict"
import test from "node:test"
import {
  applyWorkoutPlanEdit,
  buildMealPlan,
  isMealPlanRequest,
  isShowMealPlanRequest,
  isShowWorkoutRequest,
  isWorkoutPlanRequest,
  parseMealLog,
  parseRecoveryCheckIn,
  parseTargetUpdate,
  parseWorkoutLog,
  parseWorkoutPlanEdit,
  shouldBuildWeeklySchedule,
  shouldUseLocalCoach,
} from "../src/lib/coachActions.js"
import { defaultProfile } from "../src/lib/fitnessDefaults.js"

test("parses explicit workout logs and ignores plans", () => {
  const log = parseWorkoutLog("I did bench press 80kg for 4 sets of 6")
  assert.equal(log.exercise_name, "Bench Press")
  assert.equal(log.sets, 4)
  assert.equal(log.reps, 6)
  assert.equal(log.weight_kg, 80)
  assert.equal(parseWorkoutLog("build me bench press 80kg for 4 sets of 6"), null)
})

test("does not invent unknown meal macros", () => {
  const unknown = parseMealLog("I had mystery cafe special for lunch")
  assert.equal(unknown.needsVerification, true)
  assert.match(unknown.reply, /need a bit more detail/i)

  const known = parseMealLog("I had 2 eggs for breakfast")
  assert.equal(known.food_name, "2 large eggs")
  assert.equal(known.estimated, false)
})

test("target updates are explicit and meal plans use catalogue foods", () => {
  assert.deepEqual(parseTargetUpdate("set calories to 2100 and protein 180g"), { daily_calories: 2100, protein_g: 180 })
  const plan = buildMealPlan(defaultProfile)
  assert.ok(plan.meals.length >= 3)
  assert.ok(plan.meals.every((meal) => meal.nutrition_source))
})

test("coach can edit an existing workout plan through chat instructions", () => {
  const plan = {
    id: "plan_1",
    title: "Upper strength",
    exercises: [
      { name: "Bench Press", muscle: "chest", setsReps: "4x6", weight_kg: 80 },
      { name: "Seated Row", muscle: "back", setsReps: "4x8", weight_kg: 65 },
    ],
  }

  const addEdit = parseWorkoutPlanEdit("add incline press 3x10", plan)
  const addedPlan = applyWorkoutPlanEdit(plan, addEdit)
  assert.equal(addedPlan.exercises.length, 3)

  const swapEdit = parseWorkoutPlanEdit("swap seated row for pull up 4x6", addedPlan)
  const swappedPlan = applyWorkoutPlanEdit(addedPlan, swapEdit)
  assert.equal(swappedPlan.exercises[1].name, "Pull Up")
  assert.equal(swappedPlan.exercises[1].setsReps, "4x6")
})

test("recovery check-ins and weekly schedule prompts are recognized", () => {
  const recovery = parseRecoveryCheckIn("I only slept 5 hours and feel wrecked")
  assert.equal(recovery.sleep_hours, 5)
  assert.equal(recovery.readiness, "low")
  assert.equal(shouldBuildWeeklySchedule("Can you reshuffle my week?"), true)
})

test("only app-state-specific coach prompts stay local", () => {
  assert.equal(isWorkoutPlanRequest("Build me a workout for today"), true)
  assert.equal(isMealPlanRequest("Meal plan"), true)
  assert.equal(isShowWorkoutRequest("show me the workout"), true)
  assert.equal(isShowMealPlanRequest("show me today's meal plan"), true)
  assert.equal(shouldUseLocalCoach("Plan my week"), true)
  assert.equal(shouldUseLocalCoach("hello"), false)
  assert.equal(shouldUseLocalCoach("Build me a workout for today"), false)
  assert.equal(shouldUseLocalCoach("Meal plan"), false)
  assert.equal(shouldUseLocalCoach("I had vegemite"), false)
  assert.equal(shouldUseLocalCoach("What are three breakfast ideas for me?"), false)
})
