import assert from "node:assert/strict"
import test from "node:test"
import { applyProgressionBlockToPlan, recommendProgressionBlock } from "../src/lib/progressionEngine.js"
import { defaultProfile } from "../src/lib/fitnessDefaults.js"

test("progression engine recommends deload when recovery is consistently poor", () => {
  const block = recommendProgressionBlock({
    profile: defaultProfile,
    progress: [],
    workoutSets: [
      { id: "1", exercise_name: "Bench Press", weight_kg: 80, reps: 6, date: "2026-04-20", session_id: "a" },
      { id: "2", exercise_name: "Bench Press", weight_kg: 82.5, reps: 6, date: "2026-04-22", session_id: "b" },
    ],
    recoveryLogs: [
      { id: "r1", date: "2026-04-26", sleep_hours: 5, soreness: 5, energy: 1, stress: 4, readiness: "low" },
      { id: "r2", date: "2026-04-25", sleep_hours: 5.5, soreness: 4, energy: 2, stress: 4, readiness: "low" },
    ],
  })

  assert.equal(block.phase, "deload")
  assert.match(block.summary, /Recovery markers are poor/i)
})

test("plateau breaker lowers reps for stalled lifts", () => {
  const block = recommendProgressionBlock({
    profile: { ...defaultProfile, goal: "strength" },
    progress: [],
    workoutSets: [
      { id: "1", exercise_name: "Bench Press", weight_kg: 80, reps: 6, date: "2026-04-01", session_id: "a" },
      { id: "2", exercise_name: "Bench Press", weight_kg: 80, reps: 6, date: "2026-04-08", session_id: "b" },
      { id: "3", exercise_name: "Bench Press", weight_kg: 80, reps: 6, date: "2026-04-15", session_id: "c" },
      { id: "4", exercise_name: "Bench Press", weight_kg: 80, reps: 6, date: "2026-04-22", session_id: "d" },
      { id: "5", exercise_name: "Seated Row", weight_kg: 60, reps: 8, date: "2026-04-01", session_id: "e" },
      { id: "6", exercise_name: "Seated Row", weight_kg: 60, reps: 8, date: "2026-04-08", session_id: "f" },
      { id: "7", exercise_name: "Seated Row", weight_kg: 60, reps: 8, date: "2026-04-15", session_id: "g" },
      { id: "8", exercise_name: "Seated Row", weight_kg: 60, reps: 8, date: "2026-04-22", session_id: "h" },
    ],
    recoveryLogs: [],
  })

  assert.equal(block.phase, "plateau_breaker")

  const adjusted = applyProgressionBlockToPlan({
    title: "Upper strength",
    exercises: [
      { name: "Bench Press", setsReps: "4x6", weight_kg: 80 },
      { name: "Seated Row", setsReps: "4x8", weight_kg: 60 },
      { name: "Overhead Press", setsReps: "3x8", weight_kg: 45 },
    ],
  }, block)

  assert.equal(adjusted.exercises[0].setsReps, "3x8-10")
  assert.equal(adjusted.exercises[1].setsReps, "3x8-10")
  assert.equal(adjusted.exercises[2].setsReps, "3x8")
})
