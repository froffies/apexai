import assert from "node:assert/strict"
import test from "node:test"
import { buildExerciseHistory, buildWeeklyWorkoutSchedule, createActiveWorkoutSession, logSetToActiveWorkout, suggestNextWorkout } from "../src/lib/workoutIntelligence.js"
import { defaultProfile } from "../src/lib/fitnessDefaults.js"

test("exercise history builds suggestions from prior sets", () => {
  const history = buildExerciseHistory([
    { id: "1", exercise_name: "Bench Press", weight_kg: 80, reps: 6, date: "2026-04-20", session_id: "a" },
    { id: "2", exercise_name: "Bench Press", weight_kg: 82.5, reps: 6, date: "2026-04-22", session_id: "b" },
  ])
  assert.equal(history[0].name, "Bench Press")
  assert.equal(history[0].bestWeight, 82.5)
  assert.ok(history[0].suggestedWeight >= 82.5)
})

test("next workout suggestion rotates split templates and keeps exercises", () => {
  const plan = suggestNextWorkout({
    profile: { ...defaultProfile, split_type: "upper_lower" },
    exercises: [{ name: "Bench Press", category: "chest" }, { name: "Back Squat", category: "legs" }],
    workoutSets: [{ id: "1", exercise_name: "Bench Press", weight_kg: 80, reps: 6, date: "2026-04-20", session_id: "a" }],
    workouts: [{ id: "w1", workout_type: "Upper strength", date: "2026-04-25" }],
  })
  assert.equal(plan.title, "Lower strength")
  assert.ok(plan.exercises.length >= 3)
})

test("active workout session logs sets against the current exercise", () => {
  const activeWorkout = createActiveWorkoutSession("Upper day", [{ name: "Bench Press", setsReps: "4x6", weight_kg: 80 }])
  const updated = logSetToActiveWorkout(activeWorkout, { reps: 6, weight_kg: 80 })
  assert.equal(updated.exercises[0].logged_sets.length, 1)
  assert.equal(updated.exercises[0].logged_sets[0].reps, 6)
})

test("weekly schedule reshuffles missed sessions and adjusts today for low recovery", () => {
  const schedule = buildWeeklyWorkoutSchedule({
    profile: { ...defaultProfile, split_type: "upper_lower", training_days_per_week: 3 },
    exercises: [{ name: "Bench Press", category: "chest" }, { name: "Back Squat", category: "legs" }],
    workoutSets: [{ id: "1", exercise_name: "Bench Press", weight_kg: 80, reps: 6, date: "2026-04-20", session_id: "a" }],
    workouts: [],
    workoutPlans: [{ id: "old_plan", date: "2026-04-20", title: "Upper strength", status: "planned", exercises: [{ name: "Bench Press", setsReps: "4x6", weight_kg: 80 }] }],
    recoveryLogs: [{ id: "recovery_1", date: new Date().toISOString().slice(0, 10), sleep_hours: 5, soreness: 5, energy: 1, stress: 4, readiness: "low" }],
  })

  assert.ok(schedule.missedCount >= 1)
  assert.ok(schedule.plans.length >= 3)
  assert.equal(schedule.readiness.band, "low")
  assert.match(schedule.plans[0].title, /Recovery-adjusted|Upper strength/)
})
