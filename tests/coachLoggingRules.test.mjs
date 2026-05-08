import assert from "node:assert/strict"
import test from "node:test"
import {
  buildDeterministicMealAction,
  buildDeterministicWorkoutAction,
  deterministicAlreadyLoggedReply,
  deterministicClarifyActionFromSession,
  formatDeterministicMealAnswer,
} from "../server/coachLoggingRules.mjs"

test("coach logging rules build a deterministic meal action from ready session state and explicit macros", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      summary: "200g chicken, 1 cup rice, and 1 tbsp olive oil",
      persistedMealId: "",
      correctionRequested: false,
    },
    explicitActions: [
      {
        type: "log_meal",
        calories: 640,
        protein_g: 48,
        carbs_g: 44,
        fat_g: 22,
        quantity: "1 meal",
        estimated: true,
        nutrition_source: "Coach estimate from accumulated meal details across chat",
      },
    ],
    reply: "",
    prompt: "i had chicken and rice",
  })

  assert.ok(action)
  assert.equal(action.type, "log_meal")
  assert.equal(action.food_name, "200g chicken, 1 cup rice, and 1 tbsp olive oil")
  assert.equal(action.calories, 640)
  assert.equal(action.protein_g, 48)
  assert.equal(action.quantity, "1 meal")
})

test("coach logging rules can estimate a deterministic meal action from session items and candidate foods without AI macros", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      summary: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
      persistedMealId: "",
      correctionRequested: false,
      items: [
        {
          baseName: "egg",
          label: "Eggs",
          category: "food",
          quantity: { amount: 17, unit: "egg", text: "17 eggs" },
          exclusions: [],
        },
        {
          baseName: "salted butter",
          label: "Salted Butter",
          category: "ingredient",
          quantity: { amount: 100, unit: "g", text: "100g" },
          exclusions: [],
        },
        {
          baseName: "earl grey tea",
          label: "Earl Grey tea",
          category: "drink",
          quantity: { amount: 250, unit: "ml", text: "250ml" },
          exclusions: ["no sugar", "no milk"],
        },
      ],
    },
    explicitActions: [],
    candidateFoodMatches: {
      egg: [{ name: "2 large eggs", aliases: ["2 eggs", "eggs"], quantity: "2 large eggs", calories: 148, protein_g: 12.6, carbs_g: 1.1, fat_g: 10.2 }],
    },
    reply: "",
    prompt: "i had egg and tea",
  })

  assert.ok(action)
  assert.equal(action.type, "log_meal")
  assert.equal(action.food_name, "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")
  assert.ok(action.calories > 1900)
  assert.ok(action.protein_g > 100)
  assert.ok(action.fat_g > 150)
})

test("coach logging rules preserve grouped same-food preparations and all related macros", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      summary: "12 fried eggs cooked in 100g unsalted butter, plus 4 hard boiled eggs, plus 2 raw eggs",
      persistedMealId: "",
      correctionRequested: false,
      items: [
        {
          baseName: "egg",
          label: "Eggs",
          category: "food",
          quantity: { amount: 12, unit: "egg", text: "12 eggs" },
          preparation: ["fried"],
          exclusions: [],
        },
        {
          baseName: "egg",
          label: "Eggs",
          category: "food",
          quantity: { amount: 4, unit: "egg", text: "4 eggs" },
          preparation: ["hard boiled"],
          exclusions: [],
        },
        {
          baseName: "egg",
          label: "Eggs",
          category: "food",
          quantity: { amount: 2, unit: "egg", text: "2 eggs" },
          preparation: ["raw"],
          exclusions: [],
        },
        {
          baseName: "unsalted butter",
          label: "Unsalted Butter",
          category: "ingredient",
          quantity: { amount: 100, unit: "g", text: "100g" },
          preparation: ["unsalted"],
          exclusions: [],
          attachedTo: "egg::fried",
          relation: "cooked_in",
        },
      ],
    },
    explicitActions: [],
    reply: "",
    prompt: "i had egg",
  })

  assert.ok(action)
  assert.equal(action.type, "log_meal")
  assert.equal(action.food_name, "12 fried eggs cooked in 100g unsalted butter, plus 4 hard boiled eggs, plus 2 raw eggs")
  assert.ok(action.calories > 1900)
  assert.ok(action.protein_g > 110)
  assert.ok(action.fat_g > 160)
})

test("coach logging rules upgrade deterministic meal actions into updates when correcting a persisted meal", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      summary: "3 eggs, plus 250ml Earl Grey tea with no milk and no sugar",
      persistedMealId: "meal_fix",
      correctionRequested: true,
    },
    explicitActions: [
      {
        type: "log_meal",
        calories: 320,
        protein_g: 22,
        carbs_g: 3,
        fat_g: 21,
      },
    ],
    reply: "",
    prompt: "actually 3 eggs not 2",
  })

  assert.ok(action)
  assert.equal(action.type, "update_meal_log")
  assert.equal(action.meal_id, "meal_fix")
})

test("coach logging rules can build a deterministic macro answer without creating a persistence action", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: false,
      answerOnly: true,
      summary: "3 fried eggs cooked in 10g butter, plus 250ml Earl Grey tea with no milk and no sugar",
      items: [
        {
          baseName: "egg",
          label: "Eggs",
          category: "food",
          quantity: { amount: 3, unit: "egg", text: "3 eggs" },
          preparation: ["fried"],
          exclusions: [],
        },
        {
          baseName: "butter",
          label: "Butter",
          category: "ingredient",
          quantity: { amount: 10, unit: "g", text: "10g" },
          preparation: [],
          exclusions: [],
          attachedTo: "egg::fried",
          relation: "cooked_in",
        },
        {
          baseName: "earl grey tea",
          label: "Earl Grey tea",
          category: "drink",
          quantity: { amount: 250, unit: "ml", text: "250ml" },
          preparation: [],
          exclusions: ["no sugar", "no milk"],
        },
      ],
    },
    allowAnswerOnly: true,
    explicitActions: [],
  })

  assert.ok(action)
  assert.equal(action.type, "log_meal")
  assert.match(formatDeterministicMealAnswer(action), /if you want it saved, tell me to log it/i)
})

test("coach logging rules can repeat a recent meal deterministically", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "200g chicken, 1 cup rice, and 1 tbsp olive oil",
      referenceMeal: {
        food_name: "200g chicken, 1 cup rice, and 1 tbsp olive oil",
        meal_type: "lunch",
        quantity: "1 meal",
        calories: 640,
        protein_g: 48,
        carbs_g: 44,
        fat_g: 22,
        nutrition_source: "Saved estimate",
      },
    },
    explicitActions: [],
  })

  assert.ok(action)
  assert.equal(action.food_name, "200g chicken, 1 cup rice, and 1 tbsp olive oil")
  assert.equal(action.meal_type, "lunch")
  assert.equal(action.calories, 640)
})

test("coach logging rules build a deterministic workout action from ready workout state", () => {
  const action = buildDeterministicWorkoutAction({
    workoutSession: {
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
    explicitActions: [],
  })

  assert.ok(action)
  assert.equal(action.type, "log_workout")
  assert.equal(action.exercise_name, "Bench Press")
  assert.equal(action.sets, 4)
  assert.equal(action.reps, 6)
  assert.equal(action.weight_kg, 80)
})

test("coach logging rules emit update_workout_log for persisted workout corrections", () => {
  const action = buildDeterministicWorkoutAction({
    workoutSession: {
      readyToLog: true,
      alreadyLogged: false,
      persistedWorkoutId: "workout_fix",
      correctionRequested: true,
      exercise_name: "Preacher Curl",
      workout_type: "Preacher Curl",
      muscle_group: "biceps",
      sets: 4,
      reps: 10,
      weight_kg: 12.5,
      duration_seconds: 0,
      distance_km: 0,
    },
    explicitActions: [],
  })

  assert.ok(action)
  assert.equal(action.type, "update_workout_log")
  assert.equal(action.workout_id, "workout_fix")
})

test("coach logging rules surface deterministic clarification prompts", () => {
  const action = deterministicClarifyActionFromSession({
    clarifyQuestion: "How many eggs did you have?",
  })

  assert.deepEqual(action, {
    type: "clarify",
    message: "How many eggs did you have?",
  })
})

test("coach logging rules give already-logged replies from persisted state", () => {
  const mealReply = deterministicAlreadyLoggedReply({
    persistedSummary: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
  }, "meal")
  const workoutReply = deterministicAlreadyLoggedReply({
    persistedSummary: "Bench Press 80kg for 4 sets of 6",
  }, "workout")

  assert.match(mealReply, /already saved .*today's nutrition log/i)
  assert.match(workoutReply, /already saved .*Workouts/i)
})
