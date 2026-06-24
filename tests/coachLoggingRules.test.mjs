import assert from "node:assert/strict"
import test from "node:test"
import {
  buildDeterministicFoodMacroReply,
  buildDeterministicNutritionStatusReply,
  buildDeterministicMealAction,
  buildDeterministicMealActions,
  buildDeterministicWorkoutAction,
  buildDeterministicWorkoutActions,
  buildDeterministicWorkoutDeletionAction,
  deterministicAlreadyLoggedReply,
  deterministicClarifyActionFromSession,
  estimateMealFromSession,
  formatDeterministicMealAnswer,
  replyClaimsPersistence,
} from "../server/coachLoggingRules.mjs"
import { buildCoachSessionState, emptyMealSessionState, emptyWorkoutSessionState } from "../server/coachSessionState.mjs"
import { verifiedFoods } from "../src/lib/nutritionDatabase.js"

test("coach logging rules build a deterministic meal action from ready session state and explicit macros", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: true,
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
      wantsLogging: true,
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
      egg: [{
        name: "2 large eggs",
        aliases: ["2 eggs", "eggs"],
        quantity: "2 large eggs",
        calories: 148,
        protein_g: 12.6,
        carbs_g: 1.1,
        fat_g: 10.2,
        source: "Australian Food Composition Database curated local catalogue",
        source_type: "curated_au_catalogue",
      }],
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
  assert.equal(action.estimated, false)
  assert.equal(action.nutrition_source_type, "curated_au_catalogue")
  assert.equal(action.macro_confidence, "high")
})

test("coach logging rules keep verified provenance when a meal resolves entirely from trusted references", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "2 eggs",
      items: [
        {
          baseName: "egg",
          label: "Eggs",
          category: "food",
          quantity: { amount: 2, unit: "egg", text: "2 eggs" },
        },
      ],
    },
    prompt: "i had 2 eggs",
    candidateFoodMatches: {
      egg: [{
        name: "2 large eggs",
        aliases: ["2 eggs", "eggs"],
        quantity: "2 large eggs",
        calories: 148,
        protein_g: 12.6,
        carbs_g: 1.1,
        fat_g: 10.2,
        source: "Australian Food Composition Database curated local catalogue",
        source_type: "curated_au_catalogue",
      }],
    },
  })
  const estimate = estimateMealFromSession({
    items: [
      {
        baseName: "egg",
        label: "Eggs",
        category: "food",
        quantity: { amount: 2, unit: "egg", text: "2 eggs" },
      },
    ],
  }, {
    egg: [{
      name: "2 large eggs",
      aliases: ["2 eggs", "eggs"],
      quantity: "2 large eggs",
      calories: 148,
      protein_g: 12.6,
      carbs_g: 1.1,
      fat_g: 10.2,
      source: "Australian Food Composition Database curated local catalogue",
      source_type: "curated_au_catalogue",
    }],
  })

  assert.equal(estimate.estimated, false)
  assert.equal(estimate.nutrition_source_type, "curated_au_catalogue")
  assert.equal(estimate.macro_confidence, "high")
  assert.match(estimate.nutrition_source, /australian food composition database/i)
  assert.equal(action?.estimated, false)
  assert.equal(action?.nutrition_source_type, "curated_au_catalogue")
  assert.equal(action?.macro_confidence, "high")
})

test("coach logging rules build a deterministic meal action from the actual coach session for i had 2 eggs", () => {
  const state = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "i had 2 eggs",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
    recentMeals: [],
  })
  const action = buildDeterministicMealAction({
    mealSession: state.mealSession,
    explicitActions: [],
    prompt: "i had 2 eggs",
  })

  assert.equal(state.mealSession.readyToLog, true)
  assert.equal(state.mealSession.wantsLogging, true)
  assert.ok(action)
  assert.equal(action.type, "log_meal")
  assert.equal(action.food_name, "2 eggs")
})

test("coach logging rules build a deterministic meal action from the actual coach session for i had 1 burger", () => {
  const state = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "i had 1 burger",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
    recentMeals: [],
  })
  const action = buildDeterministicMealAction({
    mealSession: state.mealSession,
    explicitActions: [],
    prompt: "i had 1 burger",
  })

  assert.equal(state.mealSession.readyToLog, true)
  assert.equal(state.mealSession.wantsLogging, true)
  assert.ok(action)
  assert.equal(action.type, "log_meal")
  assert.equal(action.food_name, "1 burger")
})

test("coach logging rules persistence reply detection ignores negative historical mentions", () => {
  assert.equal(replyClaimsPersistence("Since you haven't logged any workouts today, it might be good to train deadlift if you're feeling ready."), false)
  assert.equal(replyClaimsPersistence("If you want that logged, tell me the quantity."), false)
  assert.equal(replyClaimsPersistence("Logged your 2 eggs."), true)
  assert.equal(replyClaimsPersistence("Let's log your pushup and chinup as well."), true)
})

test("coach logging rules keep ambiguous single-item staples in clarification instead of inventing a meal action for i had 1 rice", () => {
  const state = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "i had 1 rice",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
    recentMeals: [],
  })
  const action = buildDeterministicMealAction({
    mealSession: state.mealSession,
    explicitActions: [],
    prompt: "i had 1 rice",
  })

  assert.equal(state.mealSession.readyToLog, false)
  assert.equal(state.mealSession.wantsLogging, true)
  assert.equal(state.mealSession.clarifyQuestion, "How much rice did you have?")
  assert.equal(action, null)
})

test("coach logging rules do not auto-persist a ready meal when wantsLogging is false", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: false,
      mealConversation: true,
      summary: "500ml coffee",
      items: [
        {
          baseName: "coffee",
          label: "Coffee",
          category: "drink",
          quantity: { amount: 500, unit: "ml", text: "500ml" },
          exclusions: [],
        },
      ],
    },
    prompt: "500ml coffee",
  })

  assert.equal(action, null)
})

test("coach logging rules do not auto-persist a ready meal when wantsLogging is missing", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      mealConversation: true,
      summary: "500ml coffee",
      items: [
        {
          baseName: "coffee",
          label: "Coffee",
          category: "drink",
          quantity: { amount: 500, unit: "ml", text: "500ml" },
          exclusions: [],
        },
      ],
    },
    prompt: "500ml coffee",
  })

  assert.equal(action, null)
})

test("coach logging rules keep NZ verified provenance when a meal resolves from the curated NZ catalogue", () => {
  const weetbix = verifiedFoods.find((food) => food.id === "d1056")
  assert.ok(weetbix)

  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "100g Weet-Bix",
      items: [
        {
          baseName: "weet bix",
          label: "Weet-Bix",
          category: "food",
          quantity: { amount: 100, unit: "g", text: "100g" },
        },
      ],
    },
    prompt: "i had 100g weetbix",
    candidateFoodMatches: {
      "weet bix": [weetbix],
    },
  })

  assert.equal(action?.estimated, false)
  assert.equal(action?.nutrition_source_type, "nz_curated_catalogue")
  assert.equal(action?.macro_confidence, "high")
  assert.match(action?.nutrition_source || "", /new zealand food composition database/i)
})

test("coach logging rules do not treat steak like tea when estimating fallback macros", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "300g steak",
      persistedMealId: "",
      correctionRequested: false,
      items: [
        {
          baseName: "steak",
          label: "Steak",
          category: "food",
          quantity: { amount: 300, unit: "g", text: "300g" },
          exclusions: [],
        },
      ],
    },
    explicitActions: [],
    candidateFoodMatches: {},
    prompt: "300g",
  })

  assert.ok(action)
  assert.equal(action.type, "log_meal")
  assert.equal(action.food_name, "300g steak")
  assert.equal(action.estimated, false)
  assert.equal(action.nutrition_source_type, "curated_au_catalogue")
  assert.equal(action.macro_confidence, "high")
  assert.equal(action.calories, 510)
  assert.equal(action.protein_g, 96)
  assert.equal(action.carbs_g, 0)
  assert.equal(action.fat_g, 13.5)
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

test("loose estimates do not save a multi-item meal while a quantity clarification is pending", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: false,
      alreadyLogged: false,
      summary: "milk, plus eggs",
      persistedMealId: "",
      correctionRequested: false,
      pendingClarification: { type: "quantity", targetReference: "milk", targetBaseName: "milk" },
      items: [
        { baseName: "milk", label: "Milk", category: "drink", quantity: null },
        { baseName: "egg", label: "Eggs", category: "food", quantity: null },
      ],
    },
    allowLooseEstimate: true,
    prompt: "i had milk and did a pushup and then i had eggs",
  })

  assert.equal(action, null)
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

test("coach logging rules can loose-estimate a single compound-food meal in an explicit mixed turn", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: false,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "eggs bacon toast",
      items: [
        {
          baseName: "eggs bacon toast",
          label: "Eggs Bacon Toast",
          category: "food",
          quantity: null,
          exclusions: [],
        },
      ],
      pendingClarification: {
        type: "quantity",
        targetReference: "eggs bacon toast",
        targetBaseName: "eggs bacon toast",
        targetLabel: "Eggs Bacon Toast",
      },
      intentGraph: {
        hasMixedDomains: true,
      },
    },
    explicitActions: [],
    allowLooseEstimate: true,
    prompt: "i had eggs bacon toast and did bench 80kg 5x5 then ran 2km",
  })

  assert.ok(action)
  assert.equal(action.type, "log_meal")
  assert.match(action.food_name.toLowerCase(), /eggs bacon toast/)
  assert.ok(action.calories > 0)
})

test("coach logging rules do not loose-estimate an ambiguous drink-plus-food mixed turn without an explicit log-all-that request", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: false,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "milk, plus eggs",
      items: [
        {
          baseName: "milk",
          label: "Milk",
          category: "drink",
          quantity: null,
          exclusions: [],
        },
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
        targetReference: "milk",
        targetBaseName: "milk",
        targetLabel: "Milk",
      },
    },
    explicitActions: [],
    allowLooseEstimate: true,
    prompt: "i had milk and did a pushup and then i had eggs",
  })

  assert.equal(action, null)
})

test("coach logging rules preserve grouped same-food preparations and all related macros", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: true,
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
      wantsLogging: true,
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

test("coach logging rules use a conservative default for unquantified cooking butter", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "2 eggs cooked in butter",
      persistedMealId: "",
      correctionRequested: false,
      items: [
        {
          baseName: "egg",
          label: "Eggs",
          category: "food",
          quantity: { amount: 2, unit: "egg", text: "2 eggs" },
          preparation: ["fried"],
          exclusions: [],
        },
        {
          baseName: "butter",
          label: "Butter",
          category: "ingredient",
          quantity: null,
          preparation: [],
          exclusions: [],
          attachedTo: "egg::fried",
          relation: "cooked_in",
        },
      ],
    },
    explicitActions: [],
    reply: "",
    prompt: "eggs were fried in butter",
  })

  assert.ok(action)
  assert.equal(action.type, "log_meal")
  assert.equal(action.food_name, "2 eggs cooked in butter")
  assert.ok(action.calories < 300)
  assert.ok(action.fat_g < 25)
})

test("coach logging rules scale poultry estimates for pound-based quantities", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "half a pound chicken",
      persistedMealId: "",
      correctionRequested: false,
      items: [
        {
          baseName: "chicken",
          label: "Chicken",
          category: "food",
          quantity: { amount: 0.5, unit: "lb", text: "half a pound" },
          preparation: [],
          exclusions: [],
        },
      ],
    },
    explicitActions: [],
    reply: "",
    prompt: "i had 200g chicken no wait half a pound",
  })

  assert.ok(action)
  assert.equal(action.type, "log_meal")
  assert.equal(action.food_name, "half a pound chicken")
  assert.ok(action.calories > 300)
  assert.ok(action.calories < 450)
  assert.ok(action.protein_g > 60)
  assert.ok(action.carbs_g < 5)
  assert.ok(action.fat_g < 15)
})

test("coach logging rules do not match a single-food chicken item to composite chicken bowl catalogue entries", () => {
  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "half a pound chicken",
      persistedMealId: "",
      correctionRequested: false,
      items: [
        {
          baseName: "chicken",
          label: "Chicken",
          category: "food",
          quantity: { amount: 0.5, unit: "lb", text: "half a pound" },
          preparation: [],
          exclusions: [],
        },
      ],
    },
    explicitActions: [],
    reply: "",
    prompt: "i had 200g chicken no wait half a pound",
    candidateFoodMatches: {
      chicken: [{
        id: "chicken_burrito_bowl",
        name: "Chicken burrito bowl",
        aliases: ["chicken burrito bowl", "burrito bowl"],
        quantity: "1 large bowl",
        calories: 680,
        protein_g: 48,
        carbs_g: 76,
        fat_g: 18,
        category: "mixed meal",
      }],
    },
  })

  assert.ok(action)
  assert.equal(action.food_name, "half a pound chicken")
  assert.ok(action.calories < 450)
  assert.ok(action.protein_g > 60)
  assert.ok(action.carbs_g < 5)
})

test("coach logging rules do not undercount quantified eggs when verified matches are mass-based", () => {
  const eggsReference = verifiedFoods.find((food) => food.id === "eggs_2")
  const rawEggReference = verifiedFoods.find((food) => food.id === "egg_chicken_whole_raw")
  const unsaltedButterReference = verifiedFoods.find((food) => food.id === "butter_unsalted")

  const action = buildDeterministicMealAction({
    mealSession: {
      readyToLog: true,
      alreadyLogged: false,
      wantsLogging: true,
      summary: "6 eggs cooked in 100g unsalted butter",
      persistedMealId: "",
      correctionRequested: false,
      items: [
        {
          baseName: "egg",
          label: "Eggs",
          category: "food",
          quantity: { amount: 6, unit: "egg", text: "6 eggs" },
          preparation: [],
          exclusions: [],
        },
        {
          baseName: "unsalted butter",
          label: "Unsalted Butter",
          category: "ingredient",
          quantity: { amount: 100, unit: "g", text: "100g" },
          preparation: [],
          exclusions: [],
          attachedTo: "egg",
          relation: "cooked_in",
        },
      ],
    },
    explicitActions: [],
    reply: "",
    prompt: "the eggs were cooked in 100g of unsalted butter",
    candidateFoodMatches: {
      egg: [rawEggReference, eggsReference].filter(Boolean),
      "unsalted butter": [unsaltedButterReference].filter(Boolean),
    },
  })

  assert.ok(action)
  assert.equal(action.food_name, "6 eggs cooked in 100g unsalted butter")
  assert.equal(action.calories, 1178)
  assert.equal(action.protein_g, 38.9)
  assert.equal(action.carbs_g, 3.9)
  assert.equal(action.fat_g, 112.8)
})

test("coach logging rules can answer direct food macro questions without persistence wording", () => {
  const reply = buildDeterministicFoodMacroReply({
    message: "whats the macros for a standard serve of caesar salad?",
  })

  assert.match(reply, /caesar salad/i)
  assert.match(reply, /360 kcal/i)
  assert.match(reply, /10g protein/i)
  assert.match(reply, /14g carbs/i)
  assert.match(reply, /28g fat/i)
  assert.match(reply, /estimate blended from matched references/i)
  assert.doesNotMatch(reply, /\b(saved|logged|tracked)\b/i)
})

test("coach logging rules fall back to a deterministic food-class estimate for arbitrary food questions", () => {
  const reply = buildDeterministicFoodMacroReply({
    message: "whats the macros for barramundi fillet?",
  })

  assert.match(reply, /barramundi fillet/i)
  assert.match(reply, /128 kcal/i)
  assert.match(reply, /24g protein/i)
  assert.match(reply, /0g carbs/i)
  assert.match(reply, /3g fat/i)
  assert.match(reply, /deterministic fallback estimate/i)
  assert.doesNotMatch(reply, /\b(saved|logged|tracked)\b/i)
})

test("formatDeterministicMealAnswer marks estimate-backed replies as estimates", () => {
  const reply = formatDeterministicMealAnswer({
    calories: 380,
    protein_g: 18,
    carbs_g: 40,
    fat_g: 12,
    estimated: true,
    nutrition_source_type: "estimated_internal_profile",
    macro_confidence: "low",
  })

  assert.match(reply, /380 kcal/i)
  assert.match(reply, /estimate based on our au\/nz reference profiles/i)
  assert.match(reply, /keep it marked as an estimate/i)
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

test("replyClaimsPersistence does not fire on negations or informational references", () => {
  const falsePositives = [
    "You're right! I haven't logged the chinup yet. Let's add that now.",
    "Here are the exercises you logged today: Pushup.",
    "I don't have access to real-time weather data.",
    "I didn't save that, sorry.",
    "I haven't added the chinup yet.",
    "What exercises did you log today?",
  ]
  for (const text of falsePositives) {
    assert.equal(
      replyClaimsPersistence(text),
      false,
      `replyClaimsPersistence should be false for: "${text.substring(0, 60)}"`
    )
  }
})

test("replyClaimsPersistence fires on genuine persistence confirmations", () => {
  const trueCases = [
    "Logged! Pushup for 1 set of 10.",
    "Saved to today's nutrition: 6 eggs.",
    "I've added your workout.",
    "Updated your nutrition log.",
    "I'll log that for you now.",
    "Let's save that to your log.",
  ]
  for (const text of trueCases) {
    assert.equal(
      replyClaimsPersistence(text),
      true,
      `replyClaimsPersistence should be true for: "${text.substring(0, 60)}"`
    )
  }
})
