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
      wantsLogging: true,
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
      wantsLogging: true,
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

test("normalizeCoachResponse does not auto-persist a ready meal on the AI-first path when the AI did not request it", () => {
  const payload = normalizeCoachResponse({
    reply: "That looks like 17 fried eggs cooked in butter, plus your Earl Grey tea.",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    prompt: "i just did",
    mealContext: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
      persistedMealId: "",
      correctionRequested: false,
    },
    candidatePersistenceActions: [{
      type: "log_meal",
      meal_type: "snack",
      food_name: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
      quantity: "1 meal",
      calories: 2230,
      protein_g: 164,
      carbs_g: 47,
      fat_g: 236,
      estimated: true,
      nutrition_source: "Coach estimate from accumulated meal details across chat",
    }],
  })

  assert.equal(payload.actions.length, 0)
})

test("normalizeCoachResponse canonicalizes AI-requested meal persistence from server candidates on the AI-first path", () => {
  const payload = normalizeCoachResponse({
    reply: "I've logged that meal for you.",
    actions: [{ type: "log_meal", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }],
    warnings: [],
  }, {
    preferAIFirst: true,
    prompt: "i just did",
    mealContext: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
      persistedMealId: "",
      correctionRequested: false,
    },
    candidatePersistenceActions: [{
      type: "log_meal",
      meal_type: "snack",
      food_name: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
      quantity: "1 meal",
      calories: 2230,
      protein_g: 164,
      carbs_g: 47,
      fat_g: 236,
      estimated: true,
      nutrition_source: "Coach estimate from accumulated meal details across chat",
    }],
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "log_meal")
  assert.equal(payload.actions[0].food_name, "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")
})

test("normalizeCoachResponse does not bind a candidate persistence action from reply text alone", () => {
  const payload = normalizeCoachResponse({
    reply: "Updated today's nutrition: 1 bowl chips with gravy.",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    candidatePersistenceActions: [{
      type: "update_meal_log",
      meal_id: "meal_chips",
      meal_type: "snack",
      food_name: "1 bowl chips with gravy",
      quantity: "1 meal",
      calories: 240,
      protein_g: 13,
      carbs_g: 20,
      fat_g: 11,
      estimated: true,
      nutrition_source: "Coach estimate from accumulated meal details across chat",
    }],
  })

  assert.equal(payload.actions.length, 0)
  assert.equal(payload.reply, "I have the details, but I couldn't save it just now.")
})

test("normalizeCoachResponse does not auto-inject clarify actions on the AI-first path", () => {
  const payload = normalizeCoachResponse({
    reply: "How many eggs did you have?",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    mealContext: {
      clarifyQuestion: "How many eggs did you have?",
      readyToLog: false,
      alreadyLogged: false,
    },
    responseHints: {
      clarify_hints: {
        meal: "How many eggs did you have?",
      },
    },
  })

  assert.equal(payload.actions.length, 0)
  assert.equal(payload.reply, "How many eggs did you have?")
})

test("normalizeCoachResponse replaces invented mixed-thread meal specifics with the pending clarification question", () => {
  const payload = normalizeCoachResponse({
    reply: "You had milk and 2 large eggs. Great job on doing a pushup! How many reps did you do?",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
      pendingClarification: {
        type: "quantity",
        targetReference: "egg",
        targetBaseName: "egg",
        targetLabel: "Eggs",
      },
    },
    workoutContext: {
      readyToLog: false,
      alreadyLogged: false,
      clarifyQuestion: "How many reps did you do for Pushup?",
      exercise_name: "Pushup",
      workout_type: "Pushup",
    },
    responseHints: {
      clarify_hints: {
        meal: "How many eggs did you have?",
        workout: "How many reps did you do for Pushup?",
      },
    },
  })

  assert.equal(payload.actions.length, 0)
  assert.equal(payload.reply, "How many eggs did you have?")
})

test("normalizeCoachResponse keeps a good AI clarify reply when it already asks for the missing meal quantity", () => {
  const payload = normalizeCoachResponse({
    reply: "Got it. How much light milk did you have?",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
      pendingClarification: {
        type: "quantity",
        targetReference: "milk::light::light",
        targetBaseName: "milk",
        targetLabel: "Light Milk",
      },
    },
    responseHints: {
      clarify_hints: {
        meal: "How much light milk did you have?",
      },
    },
  })

  assert.equal(payload.actions.length, 0)
  assert.equal(payload.reply, "Got it. How much light milk did you have?")
})

test("normalizeCoachResponse preserves AI replies for already-logged contexts while stripping duplicate persistence", () => {
  const mealPayload = normalizeCoachResponse({
    reply: "That meal is already in today's log. Tell me what to update if you want it changed.",
    actions: [{ type: "log_meal", calories: 100, protein_g: 10, carbs_g: 10, fat_g: 2 }],
    warnings: [],
  }, {
    mealContext: {
      alreadyLogged: true,
      persistedSummary: "Greek yoghurt bowl",
    },
  })

  assert.equal(mealPayload.actions.length, 0)
  assert.equal(mealPayload.reply, "That meal is already in today's log. Tell me what to update if you want it changed.")
})

test("normalizeCoachResponse falls back to the deterministic already-logged reply when the AI reply is blank", () => {
  const mealPayload = normalizeCoachResponse({
    reply: "   ",
    actions: [{ type: "log_meal", calories: 100, protein_g: 10, carbs_g: 10, fat_g: 2 }],
    warnings: [],
  }, {
    mealContext: {
      alreadyLogged: true,
      persistedSummary: "Greek yoghurt bowl",
    },
    responseHints: {
      already_logged: {
        meal: {
          reply_hint: "I already saved Greek yoghurt bowl in today's nutrition log. If you want to change it, tell me what to update.",
          summary: "Greek yoghurt bowl",
        },
      },
      suppression_hint: {},
    },
  })

  assert.equal(mealPayload.actions.length, 0)
  assert.match(mealPayload.reply, /already saved Greek yoghurt bowl/i)
})

test("normalizeCoachResponse preserves AI delete wording while keeping the validated delete action", () => {
  const payload = normalizeCoachResponse({
    reply: "Removed that meal from today's nutrition log.",
    actions: [],
    warnings: [],
  }, {
    mealContext: {
      deleteRequested: true,
      persistedMealId: "meal_123",
      persistedSummary: "Burger",
    },
    validatedActions: [
      { type: "delete_meal_log", meal_id: "meal_123", delete_confirmed: true },
    ],
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "delete_meal_log")
  assert.equal(payload.reply, "Removed that meal from today's nutrition log.")
})

test("normalizeCoachResponse keeps deterministic clarify actions without overriding the AI reply", () => {
  const payload = normalizeCoachResponse({
    reply: "What did you actually have?",
    actions: [],
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
  assert.equal(payload.reply, "What did you actually have?")
})

test("normalizeCoachResponse preserves deterministic workout logs alongside meal clarification actions", () => {
  const payload = normalizeCoachResponse({
    reply: "How many eggs did you have? I've also logged your squats.",
    actions: [],
    warnings: [],
  }, {
    mealContext: {
      clarifyQuestion: "How many eggs did you have?",
      readyToLog: false,
      alreadyLogged: false,
    },
    workoutContext: {
      readyToLog: true,
      alreadyLogged: false,
      persistedWorkoutId: "",
      correctionRequested: false,
      exercise_name: "Squat",
      workout_type: "Squat",
      muscle_group: "full_body",
      sets: 5,
      reps: 5,
      weight_kg: 100,
      duration_seconds: 0,
      distance_km: 0,
    },
  })

  assert.equal(payload.actions.some((action) => action.type === "clarify"), true)
  assert.equal(payload.actions.some((action) => action.type === "log_workout"), true)
  assert.match(payload.reply, /how many eggs/i)
})

test("normalizeCoachResponse blocks AI meal persistence when the meal still needs unresolved clarification and no validated meal save exists", () => {
  const payload = normalizeCoachResponse({
    reply: "Great job on the pushups! You had 2 large eggs, which I'll log now.",
    actions: [
      { type: "log_workout", exercise_name: "Pushups", workout_type: "Pushups", reps: 4, sets: 1 },
      { type: "log_meal", food_name: "2 large eggs", quantity: "2 large eggs", calories: 148, protein_g: 12.6, carbs_g: 1.1, fat_g: 10.2 },
    ],
    warnings: [],
  }, {
    prompt: "i had eggs and did 4 pushups",
    mealContext: {
      clarifyQuestion: "How many eggs did you have?",
      readyToLog: false,
      alreadyLogged: false,
      answerOnly: false,
    },
    workoutContext: {
      readyToLog: true,
      alreadyLogged: false,
      persistedWorkoutId: "",
      correctionRequested: false,
      exercise_name: "Pushups",
      workout_type: "Pushups",
      muscle_group: "full_body",
      sets: 1,
      reps: 4,
      weight_kg: 0,
      duration_seconds: 0,
      distance_km: 0,
    },
    validatedActions: [
      { type: "log_workout", exercise_name: "Pushups", workout_type: "Pushups", reps: 4, sets: 1 },
      { type: "clarify", message: "How many eggs did you have?" },
    ],
  })

  assert.equal(payload.actions.some((action) => action.type === "log_workout"), true)
  assert.equal(payload.actions.some((action) => action.type === "log_meal"), false)
  assert.equal(payload.actions.some((action) => action.type === "clarify"), true)
})

test("normalizeCoachResponse blocks AI workout persistence when a persisted workout is idle and the turn is advancing a meal follow-up", () => {
  const payload = normalizeCoachResponse({
    reply: "I've updated your log to 18 eggs and your pushups are logged too.",
    actions: [
      { type: "update_meal_log", food_name: "18 eggs", quantity: "1 meal", calories: 1332, protein_g: 113.4, carbs_g: 9.9, fat_g: 91.8 },
      { type: "log_workout", exercise_name: "Pushups", workout_type: "Pushups", reps: 4, sets: 1 },
    ],
    warnings: [],
  }, {
    prompt: "18",
    mealContext: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: true,
      clarifyQuestion: "",
      persistedMealId: "meal_1",
      correctionRequested: true,
      summary: "18 eggs",
    },
    workoutContext: {
      readyToLog: false,
      alreadyLogged: true,
      persistedWorkoutId: "workout_1",
      persistedSummary: "Pushups",
      summary: "Pushups",
      correctionRequested: false,
      deleteRequested: false,
    },
    validatedActions: [
      { type: "update_meal_log", meal_id: "meal_1", food_name: "18 eggs", quantity: "1 meal", calories: 1332, protein_g: 113.4, carbs_g: 9.9, fat_g: 91.8 },
    ],
  })

  assert.equal(payload.actions.filter((action) => action.type === "update_meal_log").length, 1)
  assert.equal(payload.actions.some((action) => action.type === "log_workout"), false)
})

test("normalizeCoachResponse blocks AI meal persistence when a persisted meal still needs quantity clarification and the turn is completing a workout", () => {
  const payload = normalizeCoachResponse({
    reply: "I'll log your meal of steak and your workout: bench press at 80kg for 1 set of 5 reps, plus your 2km run.",
    actions: [
      { type: "log_workout", exercise_name: "Bench", workout_type: "Bench", reps: 5, sets: 1, weight_kg: 80 },
      { type: "log_meal", food_name: "steak", quantity: "1 meal", calories: 180, protein_g: 12, carbs_g: 0, fat_g: 11 },
    ],
    warnings: [],
  }, {
    prompt: "5 reps",
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
      persistedMealId: "meal_1",
      persistedSummary: "steak",
      pendingClarification: {
        type: "quantity",
        targetReference: "steak",
      },
      correctionRequested: false,
      deleteRequested: false,
    },
    workoutContext: {
      readyToLog: true,
      alreadyLogged: false,
      persistedWorkoutId: "workout_run",
      persistedSummary: "Run",
      correctionRequested: false,
      deleteRequested: false,
      exercise_name: "Bench",
      workout_type: "Bench",
      sets: 1,
      reps: 5,
      weight_kg: 80,
    },
    validatedActions: [
      { type: "log_workout", exercise_name: "Bench", workout_type: "Bench", reps: 5, sets: 1, weight_kg: 80 },
    ],
  })

  assert.equal(payload.actions.some((action) => action.type === "log_workout"), true)
  assert.equal(payload.actions.some((action) => action.type === "log_meal"), false)
})

test("normalizeCoachResponse keeps validated mixed actions when the AI reply falls back generically", () => {
  const payload = normalizeCoachResponse({
    reply: "I have the details, but I couldn't save it just now.",
    actions: [],
    warnings: [],
  }, {
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
      clarifyQuestion: "How much steak did you have?",
    },
    workoutContext: {
      readyToLog: false,
      alreadyLogged: false,
      clarifyQuestion: "How many reps did you do for Squat?",
    },
    validatedActions: [
      {
        type: "log_meal",
        food_name: "steak",
        quantity: "1 meal",
        calories: 180,
        protein_g: 12,
        carbs_g: 18,
        fat_g: 6,
      },
      {
        type: "clarify",
        message: "How many reps did you do for Squat?",
      },
    ],
  })

  assert.equal(payload.actions.some((action) => action.type === "log_meal"), true)
  assert.equal(payload.actions.some((action) => action.type === "clarify"), true)
  assert.doesNotMatch(payload.reply, /couldn't save it just now/i)
})

test("normalizeCoachResponse does not auto-save a ready workout when the AI keeps the meal clarification open", () => {
  const payload = normalizeCoachResponse({
    reply: "You've done 45 pushups for 1 set-great work! I still need to know how much light milk you had to log your meal. Can you let me know?",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
      pendingClarification: {
        type: "quantity",
        targetReference: "milk::light::light",
        targetBaseName: "milk",
        targetLabel: "Light Milk",
      },
    },
    workoutContext: {
      readyToLog: true,
      alreadyLogged: false,
      exercise_name: "Pushups",
      workout_type: "Pushups",
      muscle_group: "full_body",
      sets: 1,
      reps: 45,
      weight_kg: 0,
      duration_seconds: 0,
      distance_km: 0,
    },
    candidatePersistenceActions: [{
      type: "log_workout",
      exercise_name: "Pushups",
      workout_type: "Pushups",
      muscle_group: "full_body",
      sets: 1,
      reps: 45,
      weight_kg: 0,
      duration_seconds: 0,
      distance_km: 0,
    }],
    responseHints: {
      clarify_hints: {
        meal: "How much light milk did you have?",
      },
    },
  })

  assert.equal(payload.actions.length, 0)
  assert.match(payload.reply, /light milk/i)
})

test("normalizeCoachResponse strict AI-first keeps the meal clarification without auto-saving the workout", () => {
  const payload = normalizeCoachResponse({
    reply: "How much milk did you have?",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
      pendingClarification: {
        type: "quantity",
        targetReference: "milk",
        targetBaseName: "milk",
        targetLabel: "Milk",
      },
    },
    workoutContext: {
      readyToLog: true,
      alreadyLogged: false,
      exercise_name: "Pushup",
      workout_type: "Pushup",
      muscle_group: "full_body",
      sets: 1,
      reps: 1,
      weight_kg: 0,
      duration_seconds: 0,
      distance_km: 0,
    },
    candidatePersistenceActions: [{
      type: "log_workout",
      exercise_name: "Pushup",
      workout_type: "Pushup",
      muscle_group: "full_body",
      sets: 1,
      reps: 1,
      weight_kg: 0,
      duration_seconds: 0,
      distance_km: 0,
    }],
    responseHints: {
      clarify_hints: {
        meal: "How much milk did you have?",
      },
    },
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "clarify")
  assert.match(payload.reply, /how much milk/i)
})

test("normalizeCoachResponse strict AI-first ignores internal workout candidates when the AI only asks the meal clarification", () => {
  const payload = normalizeCoachResponse({
    reply: "How much milk did you have?",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
      pendingClarification: {
        type: "quantity",
        targetReference: "milk",
        targetBaseName: "milk",
        targetLabel: "Milk",
      },
    },
    workoutContext: {
      readyToLog: true,
      alreadyLogged: false,
      exercise_name: "Pushup",
      workout_type: "Pushup",
      muscle_group: "full_body",
      sets: 1,
      reps: 1,
      weight_kg: 0,
      duration_seconds: 0,
      distance_km: 0,
    },
    candidatePersistenceActions: [
      {
        type: "log_meal",
        food_name: "18 eggs, plus milk",
        quantity: "1 meal",
        calories: 1872,
        protein_g: 117.9,
        carbs_g: 135.9,
        fat_g: 93.6,
      },
      {
        type: "log_workout",
        exercise_name: "Pushup",
        workout_type: "Pushup",
        muscle_group: "full_body",
        sets: 1,
        reps: 1,
        weight_kg: 0,
        duration_seconds: 0,
        distance_km: 0,
      },
    ],
    responseHints: {
      clarify_hints: {
        meal: "How much milk did you have?",
      },
    },
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "clarify")
  assert.equal(payload.actions.some((action) => action.type === "log_meal"), false)
  assert.match(payload.reply, /how much milk/i)
})

test("normalizeCoachResponse strict AI-first keeps a paraphrased meal clarification without auto-saving the workout", () => {
  const payload = normalizeCoachResponse({
    reply: "I'm asking how much milk you had.",
    actions: [
      {
        type: "clarify",
        message: "I'm asking how much milk you had.",
      },
    ],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
      pendingClarification: {
        type: "quantity",
        targetReference: "milk",
        targetBaseName: "milk",
        targetLabel: "Milk",
      },
    },
    workoutContext: {
      readyToLog: true,
      alreadyLogged: false,
      exercise_name: "Pushup",
      workout_type: "Pushup",
      muscle_group: "full_body",
      sets: 1,
      reps: 1,
      weight_kg: 0,
      duration_seconds: 0,
      distance_km: 0,
    },
    candidatePersistenceActions: [{
      type: "log_workout",
      exercise_name: "Pushup",
      workout_type: "Pushup",
      muscle_group: "full_body",
      sets: 1,
      reps: 1,
      weight_kg: 0,
      duration_seconds: 0,
      distance_km: 0,
    }],
    responseHints: {
      clarify_hints: {
        meal: "How much milk did you have?",
      },
    },
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "clarify")
  assert.match(payload.reply, /milk/i)
})

test("normalizeCoachResponse does not rebuild duplicate deterministic meal or workout actions when validated actions already include them", () => {
  const payload = normalizeCoachResponse({
    reply: "I've logged 18 eggs and 1 set of 4 pushups for you.",
    actions: [],
    warnings: [],
  }, {
    prompt: "18",
    mealContext: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "18 eggs",
      clarifyQuestion: "",
      persistedMealId: "",
      correctionRequested: false,
    },
    workoutContext: {
      readyToLog: true,
      alreadyLogged: false,
      persistedWorkoutId: "",
      correctionRequested: false,
      exercise_name: "Pushups",
      workout_type: "Pushups",
      muscle_group: "full_body",
      sets: 1,
      reps: 4,
      weight_kg: 0,
      duration_seconds: 0,
      distance_km: 0,
    },
    validatedActions: [
      {
        type: "log_meal",
        meal_type: "snack",
        food_name: "18 eggs",
        quantity: "1 meal",
        calories: 148,
        protein_g: 12.6,
        carbs_g: 1.1,
        fat_g: 10.2,
        estimated: true,
        nutrition_source: "Coach estimate from accumulated meal details across chat",
      },
      {
        type: "log_workout",
        exercise_name: "Pushups",
        workout_type: "Pushups",
        muscle_group: "full_body",
        sets: 1,
        reps: 4,
        weight_kg: 0,
        duration_seconds: 0,
        distance_km: 0,
      },
    ],
  })

  assert.equal(payload.actions.filter((action) => action.type === "log_meal").length, 1)
  assert.equal(payload.actions.filter((action) => action.type === "log_workout").length, 1)
  assert.equal(payload.actions.find((action) => action.type === "log_meal")?.calories, 148)
})

test("normalizeCoachResponse drops deterministic meal clarification when the AI already returned a meal persistence action", () => {
  const payload = normalizeCoachResponse({
    reply: "I logged 200g chicken and 200g rice for you.",
    actions: [{
      type: "log_meal",
      food_name: "200g chicken, plus 200g rice",
      calories: 410,
      protein_g: 38,
      carbs_g: 36,
      fat_g: 6,
    }],
    warnings: [],
  }, {
    mealContext: {
      clarifyQuestion: "How much chicken did you have?",
      readyToLog: false,
      alreadyLogged: false,
    },
    validatedActions: [{
      type: "log_meal",
      food_name: "200g chicken, plus 200g rice",
      calories: 410,
      protein_g: 38,
      carbs_g: 36,
      fat_g: 6,
    }],
  })

  assert.equal(payload.actions.filter((action) => action.type === "clarify").length, 0)
  assert.equal(payload.actions.filter((action) => action.type === "log_meal").length, 1)
})

test("normalizeCoachResponse deduplicates clarify actions and drops blank clarify duplicates", () => {
  const payload = normalizeCoachResponse({
    reply: "What exercise did you do this morning?",
    actions: [{ type: "clarify", message: "" }],
    warnings: [],
  }, {
    workoutContext: {
      clarifyQuestion: "What exercise did you do this morning?",
      readyToLog: false,
      alreadyLogged: false,
    },
  })

  const clarifyActions = payload.actions.filter((action) => action.type === "clarify")
  assert.equal(clarifyActions.length, 1)
  assert.equal(clarifyActions[0].message, "What exercise did you do this morning?")
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

test("normalizeCoachResponse falls back to nutrition status wording instead of generic fake-save wording when available", () => {
  const payload = normalizeCoachResponse({
    reply: "I've logged that meal for you.",
    actions: [],
    warnings: [],
  }, {
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
    },
    nutritionStatusReply: "You're at about 560 kcal so far today, with 1640 kcal left against your 2200 kcal target.",
  })

  assert.equal(payload.actions.length, 0)
  assert.equal(payload.reply, "You're at about 560 kcal so far today, with 1640 kcal left against your 2200 kcal target.")
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

test("normalizeCoachResponse strict AI-first does not auto-persist from parser candidates when the AI omits actions", () => {
  const payload = normalizeCoachResponse({
    reply: "That looks like 17 fried eggs cooked in butter, plus your Earl Grey tea.",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    mealContext: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
      persistedMealId: "",
      correctionRequested: false,
    },
    candidatePersistenceActions: [{
      type: "log_meal",
      meal_type: "snack",
      food_name: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
      quantity: "1 meal",
      calories: 2230,
      protein_g: 164,
      carbs_g: 47,
      fat_g: 236,
      estimated: true,
      nutrition_source: "Coach estimate from accumulated meal details across chat",
    }],
  })

  assert.equal(payload.actions.length, 0)
})

test("normalizeCoachResponse strict AI-first keeps explicit valid meal persistence without parser candidates", () => {
  const payload = normalizeCoachResponse({
    reply: "I've logged 200g chicken for you.",
    actions: [{
      type: "log_meal",
      meal_type: "lunch",
      food_name: "200g chicken",
      quantity: "200g",
      calories: 330,
      protein_g: 62,
      carbs_g: 0,
      fat_g: 7,
      nutrition_source: "Coach estimate from user-described ingredients and amounts",
      estimated: true,
    }],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
      clarifyQuestion: "",
    },
    candidatePersistenceActions: [],
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "log_meal")
  assert.equal(payload.actions[0].food_name, "200g chicken")
})

test("normalizeCoachResponse strict AI-first canonicalizes explicit meal persistence when backend can validate the exact meal", () => {
  const payload = normalizeCoachResponse({
    reply: "Saved to today's nutrition: half a pound chicken.",
    actions: [{
      type: "log_meal",
      meal_type: "snack",
      food_name: "half a pound chicken",
      quantity: "1 meal",
      calories: 680,
      protein_g: 48,
      carbs_g: 76,
      fat_g: 18,
      nutrition_source: "Coach estimate from user-described ingredients and amounts",
      estimated: true,
    }],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    prompt: "i had 200g chicken no wait half a pound",
    mealContext: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "half a pound chicken",
      persistedMealId: "",
      correctionRequested: false,
      items: [{
        baseName: "chicken",
        label: "Chicken",
        category: "food",
        quantity: { amount: 0.5, unit: "lb", text: "half a pound" },
        preparation: [],
        exclusions: [],
      }],
    },
    candidatePersistenceActions: [],
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "log_meal")
  assert.equal(payload.actions[0].food_name, "half a pound chicken")
  assert.ok(payload.actions[0].calories > 300)
  assert.ok(payload.actions[0].calories < 450)
  assert.ok(payload.actions[0].protein_g > 60)
  assert.ok(payload.actions[0].carbs_g < 5)
})

test("normalizeCoachResponse strict AI-first does not recover a validated candidate save from reply text alone", () => {
  const payload = normalizeCoachResponse({
    reply: "Updated today's nutrition: 1 bowl chips with gravy.",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    candidatePersistenceActions: [{
      type: "update_meal_log",
      meal_id: "meal_chips",
      meal_type: "snack",
      food_name: "1 bowl chips with gravy",
      quantity: "1 meal",
      calories: 240,
      protein_g: 13,
      carbs_g: 20,
      fat_g: 11,
      estimated: true,
      nutrition_source: "Coach estimate from accumulated meal details across chat",
    }],
  })

  assert.equal(payload.actions.length, 0)
  assert.equal(payload.reply, "I have the details, but I couldn't save it just now.")
})

test("normalizeCoachResponse strict AI-first canonicalizes an explicit persistence action from internal candidates", () => {
  const payload = normalizeCoachResponse({
    reply: "Updated it.",
    actions: [{
      type: "update_meal_log",
      meal_id: "meal_chips",
    }],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    canonicalPersistenceActions: [{
      type: "update_meal_log",
      meal_id: "meal_chips",
      meal_type: "snack",
      food_name: "1 bowl chips with gravy",
      quantity: "1 meal",
      calories: 240,
      protein_g: 13,
      carbs_g: 20,
      fat_g: 11,
      estimated: true,
      nutrition_source: "Coach estimate from accumulated meal details across chat",
    }],
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "update_meal_log")
  assert.equal(payload.actions[0].meal_id, "meal_chips")
  assert.equal(payload.actions[0].food_name, "1 bowl chips with gravy")
  assert.equal(payload.actions[0].calories, 240)
})

test("normalizeCoachResponse strict AI-first recovers a fresh meal save when the AI reply claims persistence but omits the action", () => {
  const payload = normalizeCoachResponse({
    reply: "Got it. I've logged your chicken.",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    mealContext: {
      readyToLog: true,
      alreadyLogged: false,
      suppressed: false,
      answerOnly: false,
      clarifyQuestion: "",
      pendingClarification: null,
      persistedMealId: "",
      correctionRequested: false,
      deleteRequested: false,
      summary: "1 chicken",
      wantsLogging: true,
    },
    canonicalPersistenceActions: [{
      type: "log_meal",
      meal_type: "snack",
      food_name: "1 chicken",
      quantity: "1 meal",
      calories: 165,
      protein_g: 31,
      carbs_g: 0,
      fat_g: 3.6,
      estimated: true,
      nutrition_source: "Estimated from AI-identified foods and internal AU/NZ nutrition fallbacks",
      nutrition_source_type: "estimated_internal_profile",
      macro_confidence: "low",
    }],
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "log_meal")
  assert.equal(payload.actions[0].food_name, "1 chicken")
  assert.equal(payload.reply, "Got it. I've logged your chicken.")
})

test("normalizeCoachResponse recovers missing lunch action when AI only returned breakfast", () => {
  const payload = normalizeCoachResponse({
    reply: "Logged your breakfast and lunch.",
    actions: [{
      type: "log_meal",
      meal_type: "breakfast",
      food_name: "2 eggs",
      calories: 148,
      protein_g: 12.6,
      carbs_g: 1.1,
      fat_g: 10.2,
    }],
    warnings: [],
  }, {
    prompt: "breakfast was 2 eggs, lunch was 200g rice",
    strictAIFirst: true,
    preferAIFirst: true,
    canonicalPersistenceActions: [
      {
        type: "log_meal",
        meal_type: "breakfast",
        food_name: "2 eggs",
        quantity: "2 eggs",
        calories: 148,
        protein_g: 12.6,
        carbs_g: 1.1,
        fat_g: 10.2,
        nutrition_source: "Estimated from AI-identified foods and internal AU/NZ nutrition fallbacks",
      },
      {
        type: "log_meal",
        meal_type: "lunch",
        food_name: "200g rice",
        quantity: "200g rice",
        calories: 316,
        protein_g: 6.2,
        carbs_g: 69.4,
        fat_g: 0.4,
        nutrition_source: "Estimated from AI-identified foods and internal AU/NZ nutrition fallbacks",
      },
    ],
  })

  const mealActions = payload.actions.filter((action) => action.type === "log_meal")
  assert.equal(mealActions.length, 2)
  assert.ok(mealActions.some((action) => action.meal_type === "breakfast"))
  assert.ok(mealActions.some((action) => action.meal_type === "lunch"))
})

test("normalizeCoachResponse strict AI-first keeps a good AI clarify reply instead of replacing it with parser clarify hints", () => {
  const payload = normalizeCoachResponse({
    reply: "Got it. How much light milk did you have?",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
      pendingClarification: {
        type: "quantity",
        targetReference: "milk::light::light",
        targetBaseName: "milk",
        targetLabel: "Light Milk",
      },
    },
    responseHints: {
      clarify_hints: {
        meal: "How much light milk did you have?",
      },
    },
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "clarify")
  assert.equal(payload.actions[0].message, "How much light milk did you have?")
  assert.equal(payload.reply, "Got it. How much light milk did you have?")
})

test("normalizeCoachResponse strict AI-first blocks invented meal persistence while a quantity clarification is still open", () => {
  const payload = normalizeCoachResponse({
    reply: "I'll log 18 eggs and 1 serve of milk as a meal, along with your 1 pushup.",
    actions: [{
      type: "log_meal",
      food_name: "1 serve milk, plus 18 eggs",
      quantity: "1 meal",
      calories: 1392,
      protein_g: 113.9,
      carbs_g: 23.9,
      fat_g: 92,
    }],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
      clarifyQuestion: "How much milk did you have?",
      pendingClarification: {
        type: "quantity",
        targetReference: "milk",
        targetBaseName: "milk",
        targetLabel: "Milk",
      },
    },
    candidatePersistenceActions: [],
    responseHints: {
      clarify_hints: {
        meal: "How much milk did you have?",
      },
    },
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "clarify")
  assert.equal(payload.actions[0].message, "How much milk did you have?")
  assert.equal(payload.reply, "How much milk did you have?")
})

test("normalizeCoachResponse strict AI-first keeps a clarification hint instead of generic save failure wording", () => {
  const payload = normalizeCoachResponse({
    reply: "I'll update your meal to reflect that 12 eggs were fried and 6 were hard-boiled.",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
      clarifyQuestion: "What were the fried eggs cooked in?",
      pendingClarification: {
        type: "ingredient",
        targetReference: "egg",
        targetBaseName: "egg",
        targetLabel: "Eggs",
      },
    },
    candidatePersistenceActions: [],
    responseHints: {
      clarify_hints: {
        meal: "What were the fried eggs cooked in?",
      },
    },
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "clarify")
  assert.equal(payload.actions[0].message, "What were the fried eggs cooked in?")
  assert.equal(payload.reply, "What were the fried eggs cooked in?")
})

test("normalizeCoachResponse strict AI-first treats 'I can log' save wording as persistence when an ingredient clarification is still open", () => {
  const payload = normalizeCoachResponse({
    reply: "Great! I can log your 3 fried steaks and 350ml of tea with no sugar. Logging now...",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
      clarifyQuestion: "What were the fried steak cooked in?",
      pendingClarification: {
        type: "ingredient",
        targetReference: "steak",
        targetBaseName: "steak",
        targetLabel: "Steak",
        relation: "cooked_in",
      },
    },
    candidatePersistenceActions: [],
    responseHints: {
      clarify_hints: {
        meal: "What were the fried steak cooked in?",
      },
    },
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "clarify")
  assert.equal(payload.actions[0].message, "What were the fried steak cooked in?")
  assert.equal(payload.reply, "What were the fried steak cooked in?")
})

test("normalizeCoachResponse strict AI-first treats mojibake 'Letâ€™s log' save wording as persistence when an ingredient clarification is still open", () => {
  const payload = normalizeCoachResponse({
    reply: "You've had 5 fried tofu and 406ml of tea with no sugar. Letâ€™s log that meal!",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
      clarifyQuestion: "What were the fried tofu cooked in?",
      pendingClarification: {
        type: "ingredient",
        targetReference: "tofu",
        targetBaseName: "tofu",
        targetLabel: "Tofu",
        relation: "cooked_in",
      },
    },
    candidatePersistenceActions: [],
    responseHints: {
      clarify_hints: {
        meal: "What were the fried tofu cooked in?",
      },
    },
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "clarify")
  assert.equal(payload.actions[0].message, "What were the fried tofu cooked in?")
  assert.equal(payload.reply, "What were the fried tofu cooked in?")
})

test("normalizeCoachResponse strict AI-first recovers a meal clarify action from a good live AI clarify reply", () => {
  const payload = normalizeCoachResponse({
    reply: "You've mentioned having steak and tea. How much tea did you have?",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
      clarifyQuestion: "How much tea did you have?",
      pendingClarification: {
        type: "quantity",
        targetReference: "tea",
        targetBaseName: "tea",
        targetLabel: "Tea",
      },
    },
    responseHints: {
      clarify_hints: {
        meal: "How much tea did you have?",
      },
    },
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "clarify")
  assert.equal(payload.actions[0].message, "How much tea did you have?")
  assert.equal(payload.reply, "You've mentioned having steak and tea. How much tea did you have?")
})

test("normalizeCoachResponse strict AI-first rewrites gerund persistence replies when meal clarification is still required", () => {
  const payload = normalizeCoachResponse({
    reply: "Logging your meal of 5 fried tofu and 373ml tea with no sugar. Let's get that in!",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    mealContext: {
      readyToLog: false,
      alreadyLogged: false,
      clarifyQuestion: "What were the fried tofu cooked in?",
      pendingClarification: {
        type: "ingredient",
        targetReference: "tofu",
        targetBaseName: "tofu",
        targetLabel: "Tofu",
        relation: "cooked_in",
      },
    },
    responseHints: {
      clarify_hints: {
        meal: "What were the fried tofu cooked in?",
      },
    },
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "clarify")
  assert.equal(payload.actions[0].message, "What were the fried tofu cooked in?")
  assert.equal(payload.reply, "What were the fried tofu cooked in?")
})

test("normalizeCoachResponse strict AI-first recovers a workout clarify action from a paraphrased reps question", () => {
  const payload = normalizeCoachResponse({
    reply: "Great, you did 5 sets! How many reps did you complete for each set?",
    actions: [],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    workoutContext: {
      readyToLog: false,
      alreadyLogged: false,
      clarifyQuestion: "How many reps did you do for Row?",
      exercise_name: "Row",
      workout_type: "Row",
      sets: 5,
      reps: 0,
    },
    responseHints: {
      clarify_hints: {
        workout: "How many reps did you do for Row?",
      },
    },
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "clarify")
  assert.equal(payload.actions[0].message, "How many reps did you do for Row?")
  assert.equal(payload.reply, "Great, you did 5 sets! How many reps did you complete for each set?")
})

test("normalizeCoachResponse strict AI-first drops invented meal persistence on answer-only nutrition turns", () => {
  const payload = normalizeCoachResponse({
    reply: "That meal has an estimated total of 294 calories, with 19g of protein, 1.7g of carbs, and 23.4g of fat.",
    actions: [{
      type: "log_meal",
      food_name: "3 fried eggs cooked in 10g butter, plus 250ml Earl Grey tea with no milk and no sugar",
      quantity: "1 meal",
      calories: 294,
      protein_g: 19,
      carbs_g: 1.7,
      fat_g: 23.4,
    }],
    warnings: [],
  }, {
    preferAIFirst: true,
    strictAIFirst: true,
    mealContext: {
      readyToLog: true,
      alreadyLogged: false,
      wantsNutrition: true,
      answerOnly: true,
      wantsLogging: false,
      summary: "3 fried eggs cooked in 10g butter, plus 250ml Earl Grey tea with no milk and no sugar",
    },
    candidatePersistenceActions: [{
      type: "log_meal",
      food_name: "3 fried eggs cooked in 10g butter, plus 250ml Earl Grey tea with no milk and no sugar",
      quantity: "1 meal",
      calories: 294,
      protein_g: 19,
      carbs_g: 1.7,
      fat_g: 23.4,
    }],
  })

  assert.equal(payload.actions.length, 0)
  assert.equal(payload.reply, "That meal has an estimated total of 294 calories, with 19g of protein, 1.7g of carbs, and 23.4g of fat.")
})

test("normalizeCoachResponse strips update_targets action when user message is a nutrition question with a quantity", () => {
  // The AI misread "100g" in "how many calories in 100g of chicken breast" as a target value.
  const payload = normalizeCoachResponse({
    reply: "100g of chicken breast has around 165 calories, 31g protein, and 3.6g fat.",
    actions: [{ type: "update_targets", daily_calories: 100 }],
    warnings: [],
  }, {
    prompt: "how many calories in 100g of chicken breast",
  })

  assert.equal(payload.actions.length, 0)
  assert.ok(payload.reply.includes("chicken"))
})

test("normalizeCoachResponse strips update_targets action for per-100g nutrition questions", () => {
  const payload = normalizeCoachResponse({
    reply: "Salmon has around 208 calories per 100g with 20g protein.",
    actions: [{ type: "update_targets", daily_calories: 200 }],
    warnings: [],
  }, {
    prompt: "what are the macros in 200g of salmon",
  })

  assert.equal(payload.actions.length, 0)
})

test("normalizeCoachResponse allows update_targets when user explicitly asks to change their target", () => {
  // This is a genuine target update request, not a nutrition question - should NOT be stripped.
  const payload = normalizeCoachResponse({
    reply: "Done, I've updated your daily calorie target to 2200.",
    actions: [{ type: "update_targets", daily_calories: 2200 }],
    warnings: [],
  }, {
    prompt: "change my daily calorie goal to 2200",
  })

  assert.equal(payload.actions.length, 1)
  assert.equal(payload.actions[0].type, "update_targets")
})
