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

test("normalizeCoachResponse repairs a bare meal action from the reply and prompt context", () => {
  const payload = normalizeCoachResponse({
    reply: "Your meal of 2 eggs and rye toast comes to about 270 calories, 20g protein, 18g carbs, and 13g fat.",
    actions: [{ type: "log_meal" }],
  }, {
    prompt: "I had 2 eggs and rye toast",
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "log_meal")
  assert.equal(payload.actions[0].food_name, "2 eggs and rye toast")
  assert.equal(payload.actions[0].calories, 270)
  assert.equal(payload.actions[0].protein_g, 20)
  assert.equal(payload.actions[0].carbs_g, 18)
  assert.equal(payload.actions[0].fat_g, 13)
})

test("normalizeCoachResponse repairs a bare workout plan action from reply text", () => {
  const payload = normalizeCoachResponse({
    reply: "Here's a workout plan for today: 1) Barbell squat, 3 sets of 8 reps, 2) Bench press, 3 sets of 8 reps, 3) Bent-over row, 3 sets of 8 reps.",
    actions: [{ type: "create_workout_plan" }],
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "create_workout_plan")
  assert.equal(payload.actions[0].exercises.length, 3)
  assert.equal(payload.actions[0].exercises[0].name, "Barbell Squat")
  assert.equal(payload.actions[0].exercises[0].setsReps, "3x8")
})

test("normalizeCoachResponse infers a workout plan action from a conversational reply", () => {
  const payload = normalizeCoachResponse({
    reply: "Let's build you an upper body workout! How about including exercises like bench press, rows, and shoulder presses? Let me know if you want to add or change anything!",
    actions: [],
  }, {
    prompt: "build me a workout for today",
  })

  assert.equal(payload.actions[0].type, "create_workout_plan")
  assert.equal(payload.actions[0].exercises.length, 3)
  assert.equal(payload.actions[0].exercises[0].name, "Bench Press")
})

test("normalizeCoachResponse parses numbered workout lists from a conversational reply", () => {
  const payload = normalizeCoachResponse({
    reply: "Here's a focused workout plan for today: 1. Squats - 3 sets of 8 reps 2. Bench press - 3 sets of 8 reps 3. Bent-over rows - 3 sets of 8 reps 4. Deadlifts - 3 sets of 6 reps.",
    actions: [],
  }, {
    prompt: "build me a workout for today",
  })

  assert.equal(payload.actions[0].type, "create_workout_plan")
  assert.equal(payload.actions[0].exercises.length, 4)
  assert.equal(payload.actions[0].exercises[0].name, "Squats")
  assert.equal(payload.actions[0].exercises[1].name, "Bench Press")
})

test("normalizeCoachResponse parses numbered workout lines with parentheses", () => {
  const payload = normalizeCoachResponse({
    reply: "Here's a workout for today focusing on muscle gain:\n1. Bench Press (4 sets of 8 reps)\n2. Bent Over Row (4 sets of 8 reps)\n3. Dumbbell Shoulder Press (3 sets of 10 reps)",
    actions: [],
  }, {
    prompt: "build me a workout for today",
  })

  assert.equal(payload.actions[0].type, "create_workout_plan")
  assert.equal(payload.actions[0].exercises.length, 3)
  assert.equal(payload.actions[0].exercises[0].name, "Bench Press")
  assert.equal(payload.actions[0].exercises[0].setsReps, "4x8")
})

test("normalizeCoachResponse repairs a bare workout log action from the prompt context", () => {
  const payload = normalizeCoachResponse({
    reply: "Nice work on the bench press! I've logged 80kg for 4 sets of 6 reps.",
    actions: [{ type: "log_workout" }],
  }, {
    prompt: "I did bench press 80kg for 4 sets of 6",
  })

  assert.equal(payload.actions[0].type, "log_workout")
  assert.equal(payload.actions[0].exercise_name, "Bench Press")
  assert.equal(payload.actions[0].sets, 4)
  assert.equal(payload.actions[0].reps, 6)
  assert.equal(payload.actions[0].weight_kg, 80)
})

test("normalizeCoachResponse infers a workout log action when the reply says it saved the session", () => {
  const payload = normalizeCoachResponse({
    reply: "Awesome workout with the preacher curls! I'll log that for you now.",
    actions: [],
  }, {
    prompt: "I did preacher bicep dumbbells 12.5kg for 4 sets of 10",
  })

  assert.equal(payload.actions[0].type, "log_workout")
  assert.equal(payload.actions[0].exercise_name, "Preacher Bicep Dumbbells")
  assert.equal(payload.actions[0].sets, 4)
  assert.equal(payload.actions[0].reps, 10)
  assert.equal(payload.actions[0].weight_kg, 12.5)
})

test("normalizeCoachResponse infers a meal log action when the reply says it saved the estimate", () => {
  const payload = normalizeCoachResponse({
    reply: "I've logged that meal estimate at 320 calories, 18g protein, 20g carbs, and 14g fat.",
    actions: [],
  }, {
    prompt: "I had 2 eggs and 1 slice of rye toast with butter",
  })

  assert.equal(payload.actions[0].type, "log_meal")
  assert.equal(payload.actions[0].food_name, "2 eggs and 1 slice of rye toast with butter")
  assert.equal(payload.actions[0].meal_type, "snack")
  assert.equal(payload.actions[0].calories, 320)
  assert.equal(payload.actions[0].protein_g, 18)
  assert.equal(payload.actions[0].carbs_g, 20)
  assert.equal(payload.actions[0].fat_g, 14)
  assert.match(payload.actions[0].nutrition_source, /Coach estimate/i)
})

test("normalizeCoachResponse downgrades broken meal logs to a clarifying reply", () => {
  const payload = normalizeCoachResponse({
    reply: "It sounds delicious! I'll log your burrito bowl now.",
    actions: [{ type: "log_meal" }],
  }, {
    prompt: "For lunch I ate a burrito bowl with beef rice beans cheese and salsa",
  })

  assert.equal(payload.actions[0].type, "clarify")
  assert.match(payload.reply, /need a bit more detail/i)
})
