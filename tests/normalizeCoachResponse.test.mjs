import assert from "node:assert/strict"
import test from "node:test"
import { normalizeCoachResponse } from "../server/normalizeCoachResponse.mjs"

test("normalizeCoachResponse keeps explicit reply and actions", () => {
  const payload = normalizeCoachResponse({
    reply: "Done.",
    actions: [{ type: "update_targets", daily_calories: 2400 }],
    warnings: ["Heads up"],
  })

  assert.equal(payload.reply, "Done.")
  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "update_targets")
  assert.deepEqual(payload.warnings, ["Heads up"])
})

test("normalizeCoachResponse promotes top-level action payloads", () => {
  const payload = normalizeCoachResponse({
    create_workout_plan: {
      title: "Upper strength",
      exercises: [{ name: "Bench Press", setsReps: "4x6-8" }],
    },
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "create_workout_plan")
  assert.match(payload.reply, /Upper strength/i)
})

test("normalizeCoachResponse accepts a typed root object", () => {
  const payload = normalizeCoachResponse({
    type: "log_meal",
    food_name: "Greek yoghurt",
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "log_meal")
  assert.match(payload.reply, /logged that meal/i)
})

test("normalizeCoachResponse supports meal and workout updates", () => {
  const mealPayload = normalizeCoachResponse({
    update_meal_log: {
      meal_id: "meal_1",
      food_name: "Vegemite toast",
    },
  })
  assert.equal(mealPayload.actions[0].type, "update_meal_log")
  assert.match(mealPayload.reply, /updated that meal log/i)

  const workoutPayload = normalizeCoachResponse({
    type: "update_workout_log",
    workout_id: "workout_1",
    exercise_name: "Preacher Curl",
  })
  assert.equal(workoutPayload.actions[0].type, "update_workout_log")
  assert.match(workoutPayload.reply, /updated that workout log/i)
})

test("normalizeCoachResponse fills an estimated meal source when macros are present", () => {
  const payload = normalizeCoachResponse({
    type: "log_meal",
    food_name: "Eggs fried in butter",
    calories: 2230,
    protein_g: 164,
    carbs_g: 47,
    fat_g: 236,
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "log_meal")
  assert.equal(payload.actions[0].estimated, true)
  assert.match(payload.actions[0].nutrition_source, /Coach estimate/i)
})
