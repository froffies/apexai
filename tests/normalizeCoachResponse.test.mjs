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
