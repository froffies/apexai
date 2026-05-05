import assert from "node:assert/strict"
import test from "node:test"
import { normalizeCoachResponse } from "../server/normalizeCoachResponse.mjs"

test("normalizeCoachResponse keeps explicit safe actions and warnings", () => {
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

test("normalizeCoachResponse builds a deterministic meal persistence action from ready session state", () => {
  const payload = normalizeCoachResponse({
    reply: "That combined meal comes to roughly 2,230 calories, 164g protein, 47g carbs, and 236g fat.",
    actions: [{ type: "log_meal", calories: 2230, protein_g: 164, carbs_g: 47, fat_g: 236 }],
    warnings: [],
  }, {
    prompt: "i just did",
    mealContext: {
      readyToLog: true,
      alreadyLogged: false,
      summary: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
      persistedMealId: "",
      correctionRequested: false,
    },
    workoutContext: null,
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "log_meal")
  assert.equal(payload.actions[0].food_name, "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")
  assert.equal(payload.actions[0].nutrition_source, "Coach estimate from accumulated meal details across chat")
})

test("normalizeCoachResponse upgrades deterministic meal actions into updates for persisted corrections", () => {
  const payload = normalizeCoachResponse({
    reply: "That correction brings the meal to about 320 calories, 22g protein, 3g carbs, and 21g fat.",
    actions: [{ type: "log_meal", calories: 320, protein_g: 22, carbs_g: 3, fat_g: 21 }],
    warnings: [],
  }, {
    prompt: "actually 3 eggs not 2",
    mealContext: {
      readyToLog: true,
      alreadyLogged: false,
      summary: "3 eggs, plus 250ml Earl Grey tea with no milk and no sugar",
      persistedMealId: "meal_fix",
      correctionRequested: true,
    },
    workoutContext: null,
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "update_meal_log")
  assert.equal(payload.actions[0].meal_id, "meal_fix")
})

test("normalizeCoachResponse builds a deterministic workout persistence action from ready session state", () => {
  const payload = normalizeCoachResponse({
    reply: "Nice work. Bench press 80kg for 4 sets of 6 is saved.",
    actions: [],
    warnings: [],
  }, {
    prompt: "I did bench press 80kg for 4 sets of 6",
    mealContext: null,
    workoutContext: {
      readyToLog: true,
      alreadyLogged: false,
      persistedWorkoutId: "",
      correctionRequested: false,
      exercise_name: "Bench Press",
      workout_type: "Bench Press",
      muscle_group: "chest",
      sets: 4,
      reps: 6,
      weight_kg: 80,
      duration_seconds: 0,
      distance_km: 0,
    },
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "log_workout")
  assert.equal(payload.actions[0].exercise_name, "Bench Press")
  assert.equal(payload.actions[0].sets, 4)
  assert.equal(payload.actions[0].reps, 6)
})

test("normalizeCoachResponse returns already-logged replies instead of reopening persisted sessions", () => {
  const mealPayload = normalizeCoachResponse({
    reply: "I've logged that meal for you.",
    actions: [{ type: "log_meal", calories: 100, protein_g: 10, carbs_g: 10, fat_g: 2 }],
    warnings: [],
  }, {
    mealContext: {
      alreadyLogged: true,
      persistedSummary: "Greek yoghurt bowl",
    },
  })

  assert.equal(mealPayload.actions.length, 0)
  assert.match(mealPayload.reply, /already saved Greek yoghurt bowl/i)
})

test("normalizeCoachResponse prefers deterministic clarification from session state", () => {
  const payload = normalizeCoachResponse({
    reply: "I've logged that meal for you.",
    actions: [{ type: "log_meal", calories: 100, protein_g: 10, carbs_g: 10, fat_g: 2 }],
    warnings: [],
  }, {
    mealContext: {
      clarifyQuestion: "How many eggs did you have?",
      readyToLog: false,
      alreadyLogged: false,
    },
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "clarify")
  assert.equal(payload.reply, "How many eggs did you have?")
})

test("normalizeCoachResponse blocks fake persistence wording when no real save action exists", () => {
  const payload = normalizeCoachResponse({
    reply: "I've logged that meal for you.",
    actions: [],
    warnings: [],
  }, {
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
    },
    workoutContext: null,
  })

  assert.equal(payload.actions.length, 0)
  assert.equal(payload.reply, "I have the details, but I couldn't save it just now.")
})

test("normalizeCoachResponse blocks save wording after a failed persistence attempt", () => {
  const payload = normalizeCoachResponse({
    reply: "I saved that workout for you.",
    actions: [{ type: "log_workout", exercise_name: "Bench Press", workout_type: "Bench Press" }],
    warnings: [],
  }, {
    persistenceAttempted: true,
    persistenceSucceeded: false,
  })

  assert.equal(payload.reply, "I have the details, but I couldn't save it just now.")
})
