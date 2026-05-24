import assert from "node:assert/strict"
import test from "node:test"
import {
  buildDeterministicNutritionStatusReply,
  buildDeterministicMealAction,
  buildDeterministicMealActions,
  buildDeterministicWorkoutAction,
  buildDeterministicWorkoutActions,
  buildDeterministicWorkoutDeletionAction,
  deterministicAlreadyLoggedReply,
  deterministicClarifyActionFromSession,
  formatDeterministicMealAnswer,
} from "../server/coachLoggingRules.mjs"
import { buildCoachSessionState, emptyMealSessionState, emptyWorkoutSessionState } from "../server/coachSessionState.mjs"

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

test("coach logging rules can build a loose estimated meal action for mixed log-all-that turns", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: false,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "bacon eggs, plus toast",
      items: [
        {
          baseName: "egg",
          label: "Eggs",
          category: "food",
          quantity: null,
          modifiers: ["Bacon"],
          exclusions: [],
        },
        {
          baseName: "toast",
          label: "Toast",
          category: "food",
          quantity: null,
          exclusions: [],
        },
      ],
    },
    explicitActions: [],
    allowLooseEstimate: true,
    prompt: "i had eggs bacon and toast for breakfast also did 20 min run and drank a litre of water can you log all that",
  })

  assert.ok(action)
  assert.equal(action.type, "log_meal")
  assert.match(action.food_name.toLowerCase(), /egg/)
  assert.match(action.food_name.toLowerCase(), /toast/)
  assert.equal(action.estimated, true)
  assert.ok(action.calories > 0)
})

test("coach logging rules do not loose-estimate a single unresolved count-based meal", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: false,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "eggs",
      items: [
        {
          baseName: "egg",
          label: "Eggs",
          category: "food",
          quantity: null,
          exclusions: [],
        },
      ],
      pendingClarification: {
        type: "quantity",
        targetReference: "egg",
        targetBaseName: "egg",
        targetLabel: "Eggs",
      },
    },
    explicitActions: [],
    allowLooseEstimate: true,
    prompt: "i had eggs and did 4 pushups",
  })

  assert.equal(action, null)
})

test("coach logging rules do not loose-estimate a single unresolved measured meal in a mixed turn", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: false,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "steak",
      items: [
        {
          baseName: "steak",
          label: "Steak",
          category: "food",
          quantity: null,
          exclusions: [],
        },
      ],
      pendingClarification: {
        type: "quantity",
        targetReference: "steak",
        targetBaseName: "steak",
        targetLabel: "Steak",
      },
    },
    explicitActions: [],
    allowLooseEstimate: true,
    prompt: "had steak and squatted 100kg",
  })

  assert.equal(action, null)
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

test("coach logging rules strip trailing log directives from persisted meal action names", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      summary: "1 serve eggs bacon, plus 1 slice toast, plus 1l water can you log all that",
      persistedMealId: "",
      correctionRequested: false,
    },
    explicitActions: [
      {
        type: "log_meal",
        calories: 650,
        protein_g: 28,
        carbs_g: 42,
        fat_g: 34,
      },
    ],
    prompt: "i had eggs bacon and toast for breakfast also did 20 min run and drank a litre of water can you log all that",
  })

  assert.ok(action)
  assert.equal(action.food_name, "1 serve eggs bacon, plus 1 slice toast, plus 1l water")
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

test("coach logging rules can answer daily calorie and target questions without persistence wording", () => {
  const caloriesReply = buildDeterministicNutritionStatusReply({
    message: "whats my total calories so far today",
    coachContext: {
      today: "2026-05-17",
      profile: {
        daily_calories: 2200,
        protein_g: 180,
        carbs_g: 200,
        fat_g: 70,
      },
      nutrition_today: {
        calories_logged: 412,
        protein_g_logged: 44,
        carbs_g_logged: 0,
        fat_g_logged: 26,
        calories_remaining: 1788,
        protein_g_remaining: 136,
        carbs_g_remaining: 200,
        fat_g_remaining: 44,
      },
    },
  })

  const fatReply = buildDeterministicNutritionStatusReply({
    message: "am i over my fat target",
    coachContext: {
      today: "2026-05-17",
      profile: {
        daily_calories: 2200,
        protein_g: 180,
        carbs_g: 200,
        fat_g: 70,
      },
      nutrition_today: {
        calories_logged: 412,
        protein_g_logged: 44,
        carbs_g_logged: 0,
        fat_g_logged: 26,
        calories_remaining: 1788,
        protein_g_remaining: 136,
        carbs_g_remaining: 200,
        fat_g_remaining: 44,
      },
    },
  })

  assert.match(caloriesReply, /412 kcal/i)
  assert.match(caloriesReply, /1788 kcal/i)
  assert.doesNotMatch(caloriesReply, /\blogged\b/i)
  assert.match(fatReply, /26g fat/i)
  assert.match(fatReply, /44g fat/i)
  assert.doesNotMatch(fatReply, /\b(saved|logged|tracked)\b/i)
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

test("coach logging rules can emit separate deterministic meal actions for explicit breakfast and lunch groups", () => {
  const actions = buildDeterministicMealActions({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "2 eggs, plus 1 slice toast, plus 200g steak, plus 1 cup rice",
      items: [
        {
          base_name: "egg",
          label: "Eggs",
          category: "food",
          quantity: { amount: 2, unit: "egg", text: "2 eggs" },
          preparation: [],
          exclusions: [],
          attached_to: null,
          relation: null,
          meal_type: "breakfast",
        },
        {
          base_name: "toast",
          label: "Toast",
          category: "food",
          quantity: { amount: 1, unit: "slice", text: "1 slice" },
          preparation: [],
          exclusions: [],
          attached_to: null,
          relation: null,
          meal_type: "breakfast",
        },
        {
          base_name: "steak",
          label: "Steak",
          category: "food",
          quantity: { amount: 200, unit: "g", text: "200g" },
          preparation: [],
          exclusions: [],
          attached_to: null,
          relation: null,
          meal_type: "lunch",
        },
        {
          base_name: "rice",
          label: "Rice",
          category: "food",
          quantity: { amount: 1, unit: "cup", text: "1 cup" },
          preparation: [],
          exclusions: [],
          attached_to: null,
          relation: null,
          meal_type: "lunch",
        },
      ],
      meal_groups: [
        {
          meal_type: "breakfast",
          summary: "2 eggs, plus 1 slice toast",
          items: [
            {
              base_name: "egg",
              label: "Eggs",
              category: "food",
              quantity: { amount: 2, unit: "egg", text: "2 eggs" },
              attached_to: null,
              relation: null,
              meal_type: "breakfast",
            },
            {
              base_name: "toast",
              label: "Toast",
              category: "food",
              quantity: { amount: 1, unit: "slice", text: "1 slice" },
              attached_to: null,
              relation: null,
              meal_type: "breakfast",
            },
          ],
        },
        {
          meal_type: "lunch",
          summary: "200g steak, plus 1 cup rice",
          items: [
            {
              base_name: "steak",
              label: "Steak",
              category: "food",
              quantity: { amount: 200, unit: "g", text: "200g" },
              attached_to: null,
              relation: null,
              meal_type: "lunch",
            },
            {
              base_name: "rice",
              label: "Rice",
              category: "food",
              quantity: { amount: 1, unit: "cup", text: "1 cup" },
              attached_to: null,
              relation: null,
              meal_type: "lunch",
            },
          ],
        },
      ],
    },
    explicitActions: [],
    prompt: "breakfast was eggs and toast, lunch was steak and rice",
  })

  assert.equal(actions.length, 2)
  assert.equal(actions[0].type, "log_meal")
  assert.equal(actions[0].meal_type, "breakfast")
  assert.equal(actions[0].food_name, "2 eggs, plus 1 slice toast")
  assert.equal(actions[1].meal_type, "lunch")
  assert.equal(actions[1].food_name, "200g steak, plus 1 cup rice")
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

test("coach logging rules can emit multiple deterministic workout actions from candidate activities", () => {
  const actions = buildDeterministicWorkoutActions({
    workoutSession: {
      readyToLog: true,
      alreadyLogged: false,
      persistedWorkoutId: "",
      correctionRequested: false,
      exercise_name: "Bench",
      workout_type: "Bench",
      muscle_group: "full_body",
      sets: 5,
      reps: 5,
      weight_kg: 80,
      duration_seconds: 0,
      distance_km: 0,
      candidateActivities: [
        {
          parsedWorkout: {
            exercise_name: "Bench",
            workout_type: "Bench",
            muscle_group: "full_body",
            sets: 5,
            reps: 5,
            weight_kg: 80,
            duration_seconds: 0,
            distance_km: 0,
          },
        },
        {
          parsedWorkout: {
            exercise_name: "Run",
            workout_type: "Run",
            muscle_group: "cardio",
            sets: 1,
            reps: 0,
            weight_kg: 0,
            duration_seconds: 0,
            distance_km: 2,
          },
        },
      ],
    },
    explicitActions: [],
  })

  assert.equal(actions.length, 2)
  assert.equal(actions[0].type, "log_workout")
  assert.match(actions[0].exercise_name, /bench/i)
  assert.equal(actions[1].type, "log_workout")
  assert.match(actions[1].exercise_name, /run/i)
  assert.equal(actions[1].distance_km, 2)
})

test("coach logging rules emit multiple mixed workout actions from graph-native candidate activities", () => {
  const next = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "i had eggs and did 4 pushups and ran 2km",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
    recentMeals: [],
  })

  const actions = buildDeterministicWorkoutActions({
    workoutSession: next.workoutSession,
    explicitActions: [],
  })

  assert.equal(actions.length, 2)
  assert.match(String(actions[0]?.exercise_name || ""), /pushups/i)
  assert.equal(Number(actions[0]?.reps || 0), 4)
  assert.match(String(actions[1]?.exercise_name || ""), /run/i)
  assert.equal(Number(actions[1]?.distance_km || 0), 2)
})

test("coach logging rules emit delete_workout_log for persisted workout delete requests", () => {
  const action = buildDeterministicWorkoutDeletionAction({
    deleteRequested: true,
    persistedWorkoutId: "workout_delete",
    persistedSummary: "Bench Press",
  })

  assert.ok(action)
  assert.equal(action.type, "delete_workout_log")
  assert.equal(action.workout_id, "workout_delete")
  assert.equal(action.workout_type, "Bench Press")
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
