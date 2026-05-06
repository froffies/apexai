import assert from "node:assert/strict"
import test from "node:test"
import { buildCoachSessionState, emptyMealSessionState, emptyWorkoutSessionState } from "../server/coachSessionState.mjs"

function user(content) {
  return { role: "user", content }
}

function assistant(content) {
  return { role: "assistant", content }
}

function replayCoachConversation(conversation, recentLimit = 18) {
  let mealSession = emptyMealSessionState()
  let workoutSession = emptyWorkoutSessionState()
  const history = []
  const snapshots = []

  for (const entry of conversation) {
    if (entry.role === "user") {
      const next = buildCoachSessionState({
        recentMessages: history.slice(-recentLimit),
        currentMessage: entry.content,
        mealSession,
        workoutSession,
      })
      if (next.mealSession) mealSession = next.mealSession
      if (next.workoutSession) workoutSession = next.workoutSession
      snapshots.push({
        prompt: entry.content,
        mealSession,
        workoutSession,
      })
    }
    history.push(entry)
  }

  return { mealSession, workoutSession, history, snapshots }
}

function clarificationCountsWithinLimit(session) {
  return Object.values(session?.clarificationCounts || {}).every((count) => Number(count) <= 2)
}

function makePersistedMealSession(session, mealId = "meal_1") {
  return {
    ...session,
    persisted: true,
    persistedMealId: mealId,
    persistedSummary: session.summary,
    persistedAt: "2026-05-05T00:00:00.000Z",
    active: false,
    readyToLog: false,
    clarifyQuestion: "",
    alreadyLogged: false,
  }
}

test("coach session state accumulates the exact fragmented egg and tea meal into one ready-to-log session", () => {
  const conversation = [
    user("i had egg and tea"),
    assistant("What type of tea?"),
    user("earl grey"),
    assistant("How much tea did you have and was there any milk or sugar?"),
    user("250ml, no sugar no milk"),
    assistant("How many eggs did you have?"),
    user("17 fried eggs"),
    assistant("Anything they were cooked in?"),
    user("cooked in 100g of salted butter"),
    assistant("What dish was the butter used for?"),
    user("the eggs"),
    assistant("I still need more detail."),
    user("17 eggs fried in 100g of salted butter"),
    assistant("still says it needs more detail"),
    user("i just did"),
  ]

  const { mealSession } = replayCoachConversation(conversation)

  assert.ok(mealSession)
  assert.equal(mealSession.readyToLog, true)
  assert.equal(mealSession.clarifyQuestion, "")
  assert.equal(
    mealSession.summary,
    "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar"
  )
  assert.equal(clarificationCountsWithinLimit(mealSession), true)
})

test("coach session state marks redundant follow-ups as already logged instead of reopening the meal", () => {
  const initial = replayCoachConversation([
    user("i had egg and tea"),
    assistant("What type of tea?"),
    user("earl grey"),
    assistant("How much tea did you have and was there any milk or sugar?"),
    user("250ml, no sugar no milk"),
    assistant("How many eggs did you have?"),
    user("17 fried eggs"),
    assistant("Anything they were cooked in?"),
    user("cooked in 100g of salted butter"),
  ])

  const persistedMeal = makePersistedMealSession(initial.mealSession)
  const next = buildCoachSessionState({
    recentMessages: initial.history,
    currentMessage: "i just did",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.alreadyLogged, true)
  assert.equal(next.mealSession.readyToLog, false)
  assert.equal(next.mealSession.clarifyQuestion, "")
})

test("coach session state reopens a persisted meal for corrections instead of duplicating it", () => {
  const initial = replayCoachConversation([
    user("i had 2 eggs and tea"),
    assistant("What type of tea?"),
    user("earl grey"),
    assistant("How much tea did you have and was there any milk or sugar?"),
    user("250ml no milk no sugar"),
  ])

  const persistedMeal = makePersistedMealSession(initial.mealSession, "meal_fix")
  const next = buildCoachSessionState({
    recentMessages: initial.history,
    currentMessage: "actually 3 eggs not 2",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.correctionRequested, true)
  assert.equal(next.mealSession.readyToLog, true)
  assert.match(next.mealSession.summary, /3 eggs/i)
  assert.equal(next.mealSession.alreadyLogged, false)
})

test("coach session state replaces persisted meal quantities when a correction restates the full meal", () => {
  const initial = replayCoachConversation([
    user("i had egg and tea"),
    assistant("How many eggs did you have?"),
    user("17 fried eggs"),
    assistant("What type of tea?"),
    user("earl grey"),
    assistant("How much tea did you have and was there any milk or sugar?"),
    user("250ml no sugar no milk"),
    assistant("Anything they were cooked in?"),
    user("cooked in 100g of salted butter"),
  ])

  const persistedMeal = makePersistedMealSession(initial.mealSession, "meal_fix_full")
  const next = buildCoachSessionState({
    recentMessages: [
      ...initial.history,
      assistant("Saved to today's nutrition: 17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar."),
      user("i just did"),
      assistant("I already saved 17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar in today's nutrition log. If you want to change it, tell me what to update."),
    ],
    currentMessage: "actually it was 18 fried eggs cooked in 100g of salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.correctionRequested, true)
  assert.equal(next.mealSession.readyToLog, true)
  assert.match(next.mealSession.summary, /18 fried eggs/i)
  assert.doesNotMatch(next.mealSession.summary, /17 fried eggs/i)
  assert.equal(next.mealSession.alreadyLogged, false)
})

test("coach session state handles repeated info and out-of-order ingredient detail without clarification loops", () => {
  const { mealSession } = replayCoachConversation([
    user("200g"),
    assistant("What was that for?"),
    user("chicken and rice"),
    assistant("Anything else with it?"),
    user("200g chicken"),
    assistant("Anything it was cooked in?"),
    user("also cooked in 1 tbsp olive oil"),
    user("1 cup rice"),
    user("200g chicken"),
  ])

  assert.ok(mealSession)
  assert.equal(mealSession.readyToLog, true)
  assert.equal(mealSession.clarifyQuestion, "")
  assert.equal(clarificationCountsWithinLimit(mealSession), true)
  assert.match(mealSession.summary.toLowerCase(), /200g chicken/)
  assert.match(mealSession.summary.toLowerCase(), /1 cup rice/)
  assert.match(mealSession.summary.toLowerCase(), /1 tbsp olive oil/)
})

test("coach session state keeps persisted meal state isolated from a new fragmented workout thread", () => {
  const mealConversation = replayCoachConversation([
    user("i had egg and tea"),
    assistant("How many eggs did you have?"),
    user("18 fried eggs"),
    assistant("What type of tea?"),
    user("earl grey"),
    assistant("How much tea did you have and was there any milk or sugar?"),
    user("250ml no sugar no milk"),
    assistant("Anything they were cooked in?"),
    user("cooked in 100g of salted butter"),
  ])

  const persistedMeal = makePersistedMealSession(mealConversation.mealSession, "meal_isolated")
  const firstWorkoutTurn = buildCoachSessionState({
    recentMessages: [
      ...mealConversation.history,
      assistant("Updated today's nutrition: 18 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar."),
    ],
    currentMessage: "i did bench press",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.equal(firstWorkoutTurn.mealSession, null)
  assert.ok(firstWorkoutTurn.workoutSession)
  assert.equal(firstWorkoutTurn.workoutSession.exercise_name, "Bench Press")

  const secondWorkoutTurn = buildCoachSessionState({
    recentMessages: [
      ...firstWorkoutTurn.workoutSession.thread_messages,
      assistant("How many reps did you do for Bench Press?"),
    ],
    currentMessage: "80kg for 4 sets of 6",
    mealSession: firstWorkoutTurn.mealSession,
    workoutSession: firstWorkoutTurn.workoutSession,
  })

  assert.equal(secondWorkoutTurn.mealSession, null)
  assert.ok(secondWorkoutTurn.workoutSession)
  assert.equal(secondWorkoutTurn.workoutSession.exercise_name, "Bench Press")
  assert.equal(secondWorkoutTurn.workoutSession.weight_kg, 80)
  assert.equal(secondWorkoutTurn.workoutSession.sets, 4)
  assert.equal(secondWorkoutTurn.workoutSession.reps, 6)
})

test("coach session state preserves unusual but valid quantities instead of rejecting them", () => {
  const { mealSession } = replayCoachConversation([
    user("i had 5 tins of heinz baked beans"),
    assistant("Anything else?"),
    user("and an entire block of dark chocolate"),
    user("plus 2l apple juice"),
    user("and a bunch of celery"),
  ])

  assert.ok(mealSession)
  assert.equal(mealSession.readyToLog, true)
  assert.equal(clarificationCountsWithinLimit(mealSession), true)
  assert.match(mealSession.summary.toLowerCase(), /5 tins heinz baked beans/)
  assert.match(mealSession.summary.toLowerCase(), /1 block dark chocolate/)
  assert.match(mealSession.summary.toLowerCase(), /2l apple juice/)
  assert.match(mealSession.summary.toLowerCase(), /1 bunch celery/)
})

test("coach session state keeps nutrition questions answer-only instead of reopening a fresh log", () => {
  const { mealSession } = replayCoachConversation([
    user("i had egg and tea"),
    assistant("What type of tea?"),
    user("earl grey"),
    assistant("How much tea did you have and was there any milk or sugar?"),
    user("250ml no sugar no milk"),
    assistant("How many eggs did you have?"),
    user("3 fried eggs"),
    assistant("Anything they were cooked in?"),
    user("cooked in 10g butter"),
    user("how many calories is that?"),
  ])

  assert.ok(mealSession)
  assert.equal(mealSession.readyToLog, true)
  assert.equal(mealSession.answerOnly, true)
  assert.equal(mealSession.clarifyQuestion, "")
  assert.match(mealSession.summary, /3 fried eggs/i)
  assert.match(mealSession.summary, /250ml Earl Grey tea with no milk and no sugar/i)
})

test("coach session state suppresses active meal logging when the user says not to save it", () => {
  const { mealSession } = replayCoachConversation([
    user("i had chicken and rice"),
    assistant("How much chicken did you have?"),
    user("200g chicken"),
    assistant("How much rice did you have?"),
    user("1 cup rice"),
    user("don't log that"),
  ])

  assert.ok(mealSession)
  assert.equal(mealSession.suppressed, true)
  assert.equal(mealSession.readyToLog, false)
  assert.equal(mealSession.summary, "")
  assert.equal(mealSession.mealConversation, false)
})

test("coach session state can repeat the most recent saved meal deterministically", () => {
  const next = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "same as yesterday",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
    recentMeals: [
      {
        food_name: "200g chicken, 1 cup rice, and 1 tbsp olive oil",
        meal_type: "lunch",
        quantity: "1 meal",
        calories: 640,
        protein_g: 48,
        carbs_g: 44,
        fat_g: 22,
        estimated: true,
        nutrition_source: "Saved estimate",
      },
    ],
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.readyToLog, true)
  assert.equal(next.mealSession.summary, "200g chicken, 1 cup rice, and 1 tbsp olive oil")
  assert.equal(next.mealSession.referenceMeal?.meal_type, "lunch")
  assert.equal(next.mealSession.wantsLogging, true)
})

test("coach session state handles one hundred varied fragmented meal conversations", () => {
  const mealTemplates = [
    {
      intro: "i had chicken and rice",
      followUps: ["200g chicken", "1 cup rice", "also cooked in 1 tbsp olive oil"],
      expected: [/200g chicken/i, /1 cup rice/i, /1 tbsp olive oil/i],
    },
    {
      intro: "i had egg and tea",
      followUps: ["earl grey", "250ml no milk no sugar", "3 fried eggs", "cooked in 10g butter", "the eggs"],
      expected: [/3 fried eggs/i, /250ml Earl Grey tea/i, /10g butter/i],
    },
    {
      intro: "had yoghurt and oats",
      followUps: ["250g greek yoghurt", "80g oats", "and berries"],
      expected: [/250g greek yoghurt/i, /80g oats/i, /berries/i],
    },
    {
      intro: "beans on toast",
      followUps: ["2 slices wholemeal toast", "1 tin heinz baked beans", "actually 3 slices wholemeal toast not 2"],
      expected: [/3 slices wholemeal toast/i, /1 tin heinz baked beans/i],
    },
    {
      intro: "salmon and potato",
      followUps: ["250g salmon", "300g potato", "with 15g butter"],
      expected: [/250g salmon/i, /300g potato/i, /15g butter/i],
    },
    {
      intro: "i had coffee and toast",
      followUps: [
        { assistant: "What kind of coffee was it?", message: "flat white" },
        { assistant: "How much coffee did you have?", message: "300ml with no sugar" },
        "2 slices rye toast",
        "with 10g butter",
      ],
      expected: [/flat white/i, /300ml/i, /2 slices rye toast/i],
    },
    {
      intro: "tuna pasta",
      followUps: ["180g tuna", "2 cups pasta", "and 20g olive oil"],
      expected: [/180g tuna/i, /2 cups pasta/i, /20g olive oil/i],
    },
    {
      intro: "protein shake",
      followUps: ["1 serve whey", "300ml almond milk", "and a banana"],
      expected: [/1 serve whey/i, /300ml (?:almond milk|protein shake)/i, /banana/i],
    },
    {
      intro: "steak and chips",
      followUps: ["250g steak", "300g chips", "actually 350g chips not 300g"],
      expected: [/250g steak/i, /350g chips/i],
    },
    {
      intro: "i had eggs and coffee",
      followUps: ["4 scrambled eggs", "long black", "350ml no sugar"],
      expected: [/4 scrambled eggs/i, /350ml long black/i],
    },
  ]

  for (let index = 0; index < 100; index += 1) {
    const template = mealTemplates[index % mealTemplates.length]
    const conversation = [user(template.intro)]
    for (const followUp of template.followUps) {
      if (typeof followUp === "string") {
        conversation.push(assistant("Tell me more."))
        conversation.push(user(followUp))
      } else {
        conversation.push(assistant(followUp.assistant))
        conversation.push(user(followUp.message))
      }
    }
    if (index % 3 === 0) conversation.push(user("i just did"))

    const { mealSession } = replayCoachConversation(conversation)
    assert.ok(mealSession, `meal conversation ${index + 1} should create a session`)
    assert.equal(mealSession.readyToLog, true, `meal conversation ${index + 1} should be ready to log`)
    assert.equal(mealSession.clarifyQuestion, "", `meal conversation ${index + 1} should not keep clarifying`)
    assert.equal(clarificationCountsWithinLimit(mealSession), true, `meal conversation ${index + 1} should stay under clarification cap`)
    for (const pattern of template.expected) {
      assert.match(mealSession.summary, pattern, `meal conversation ${index + 1} should retain ${pattern}`)
    }
  }
})

test("coach session state handles sixty varied fragmented workout conversations", () => {
  const workoutTemplates = [
    {
      conversation: [
        user("bench press"),
        assistant("How much weight?"),
        user("80kg"),
        assistant("How many sets?"),
        user("4 sets"),
        assistant("How many reps?"),
        user("6 reps"),
      ],
      assert: (session) => {
        assert.equal(session.exercise_name, "Bench Press")
        assert.equal(session.weight_kg, 80)
        assert.equal(session.sets, 4)
        assert.equal(session.reps, 6)
      },
    },
    {
      conversation: [
        user("preacher curls"),
        assistant("How much weight?"),
        user("12.5kg"),
        assistant("How many reps?"),
        user("4 sets of 10"),
      ],
      assert: (session) => {
        assert.match(session.exercise_name, /Preacher Curl/i)
        assert.equal(session.weight_kg, 12.5)
        assert.equal(session.sets, 4)
        assert.equal(session.reps, 10)
      },
    },
    {
      conversation: [
        user("incline treadmill"),
        assistant("How long?"),
        user("25 minutes"),
      ],
      assert: (session) => {
        assert.equal(session.exercise_name, "Incline Treadmill")
        assert.equal(session.duration_seconds, 1500)
      },
    },
    {
      conversation: [
        user("push ups"),
        assistant("How many sets?"),
        user("3 sets"),
        assistant("How many reps?"),
        user("15 reps"),
      ],
      assert: (session) => {
        assert.match(session.exercise_name, /Push Up/i)
        assert.equal(session.sets, 3)
        assert.equal(session.reps, 15)
        assert.equal(session.weight_kg, 0)
      },
    },
    {
      conversation: [
        user("rower"),
        assistant("How long?"),
        user("18 minutes"),
      ],
      assert: (session) => {
        assert.equal(session.exercise_name, "Rower")
        assert.equal(session.duration_seconds, 1080)
      },
    },
    {
      conversation: [
        user("lat pulldown"),
        assistant("How much weight?"),
        user("55kg"),
        assistant("How many reps?"),
        user("4 sets of 12"),
      ],
      assert: (session) => {
        assert.match(session.exercise_name, /Lat Pulldown/i)
        assert.equal(session.weight_kg, 55)
        assert.equal(session.sets, 4)
        assert.equal(session.reps, 12)
      },
    },
  ]

  for (let index = 0; index < 60; index += 1) {
    const template = workoutTemplates[index % workoutTemplates.length]
    const { workoutSession } = replayCoachConversation(template.conversation)
    assert.ok(workoutSession, `workout conversation ${index + 1} should create a session`)
    assert.equal(workoutSession.readyToLog, true, `workout conversation ${index + 1} should be ready to log`)
    assert.equal(workoutSession.clarifyQuestion, "", `workout conversation ${index + 1} should not keep clarifying`)
    assert.equal(clarificationCountsWithinLimit(workoutSession), true, `workout conversation ${index + 1} should stay under clarification cap`)
    template.assert(workoutSession)
  }
})

test("coach session state handles forty mixed-intent conversations without loops or state desync", () => {
  const mixedTemplates = [
    {
      conversation: [
        user("i had chicken and rice"),
        assistant("How much chicken did you have?"),
        user("200g chicken"),
        assistant("How much rice did you have?"),
        user("1 cup rice"),
        user("how many calories is that?"),
      ],
      assert: ({ mealSession, workoutSession }) => {
        assert.equal(mealSession.readyToLog, true)
        assert.equal(mealSession.answerOnly, true)
        assert.equal(workoutSession, null)
      },
    },
    {
      conversation: [
        user("bench press"),
        assistant("How much weight?"),
        user("80kg"),
        assistant("How many reps?"),
        user("4 sets of 6"),
        user("don't save that"),
      ],
      assert: ({ workoutSession }) => {
        assert.ok(workoutSession)
        assert.equal(workoutSession.suppressed, true)
        assert.equal(workoutSession.readyToLog, false)
      },
    },
    {
      conversation: [
        user("same as yesterday"),
      ],
      recentMeals: [
        {
          food_name: "250g greek yoghurt, 80g oats, and berries",
          meal_type: "breakfast",
          quantity: "1 meal",
          calories: 540,
          protein_g: 34,
          carbs_g: 66,
          fat_g: 14,
          estimated: true,
          nutrition_source: "Saved estimate",
        },
      ],
      assert: ({ next }) => {
        assert.equal(next.mealSession.readyToLog, true)
        assert.equal(next.mealSession.referenceMeal?.food_name, "250g greek yoghurt, 80g oats, and berries")
      },
    },
    {
      conversation: [
        user("i had tea"),
        assistant("What type of tea?"),
        user("earl grey"),
        assistant("How much tea did you have and was there any milk or sugar?"),
        user("250ml, no sugar no milk"),
        user("don't log that"),
      ],
      assert: ({ mealSession }) => {
        assert.ok(mealSession)
        assert.equal(mealSession.suppressed, true)
        assert.equal(mealSession.summary, "")
      },
    },
  ]

  for (let index = 0; index < 40; index += 1) {
    const template = mixedTemplates[index % mixedTemplates.length]
    let mealSession = emptyMealSessionState()
    let workoutSession = emptyWorkoutSessionState()
    const history = []
    let next = { mealSession, workoutSession }

    for (const entry of template.conversation) {
      if (entry.role === "user") {
        next = buildCoachSessionState({
          recentMessages: history.slice(-18),
          currentMessage: entry.content,
          mealSession,
          workoutSession,
          recentMeals: template.recentMeals || [],
        })
        mealSession = next.mealSession
        workoutSession = next.workoutSession
      }
      history.push(entry)
    }

    template.assert({ mealSession, workoutSession, next })
  }
})
