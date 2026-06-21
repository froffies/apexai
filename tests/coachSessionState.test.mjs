import assert from "node:assert/strict"
import test from "node:test"
import { buildCoachSessionState, emptyMealSessionState, emptyWorkoutSessionState } from "../server/coachSessionState.mjs"

function user(content) {
  return { role: "user", content }
}

function assistant(content) {
  return { role: "assistant", content }
}

function normalizeValueText(text) {
  return String(text || "").trim().toLowerCase()
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

function makePersistedWorkoutSession(session, workoutId = "workout_1") {
  return {
    ...session,
    persisted: true,
    persistedWorkoutId: workoutId,
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

test("coach session state treats an identical persisted meal message as already logged instead of duplicating it", () => {
  const initial = replayCoachConversation([
    user("i had 3 chips"),
  ])

  const persistedMeal = makePersistedMealSession(initial.mealSession, "meal_repeat_live")
  const next = buildCoachSessionState({
    recentMessages: [
      ...initial.history,
      assistant("Saved to today's nutrition: 3 chips."),
    ],
    currentMessage: "i had 3 chips",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.alreadyLogged, true)
  assert.equal(next.mealSession.readyToLog, false)
  assert.equal(next.mealSession.correctionRequested, false)
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

test("coach session state treats additive follow-ups on a persisted meal as updates", () => {
  const initial = replayCoachConversation([
    user("i had chips"),
    assistant("How much chips did you have?"),
    user("1 bowl"),
  ])

  const persistedMeal = makePersistedMealSession(initial.mealSession, "meal_chips")
  const next = buildCoachSessionState({
    recentMessages: initial.history,
    currentMessage: "with gravy",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.correctionRequested, true)
  assert.equal(next.mealSession.readyToLog, true)
  assert.equal(next.mealSession.alreadyLogged, false)
  assert.match(next.mealSession.summary, /chips with gravy/i)
})

test("coach session state keeps a quantified drink reply from hijacking a pending fried-egg cooking-medium clarification", () => {
  const { snapshots, mealSession } = replayCoachConversation([
    user("i had eggs and milk"),
    assistant("How many eggs did you have?"),
    user("2 fried eggs"),
    assistant("What were the fried eggs cooked in?"),
    user("283ml milk no sugar"),
    assistant("What were the fried eggs cooked in?"),
    user("cooked in 15g butter"),
  ])

  assert.ok(mealSession)
  assert.equal(snapshots[2].mealSession.clarifyQuestion, "What were the fried eggs cooked in?")
  assert.equal(snapshots[2].mealSession.summary, "2 fried eggs, plus 283ml milk with no sugar")
  assert.equal(
    snapshots[2].mealSession.items.some((item) => item.attached_to?.includes("egg") && /milk/i.test(`${item.base_name} ${item.label}`)),
    false,
  )
  assert.equal(mealSession.readyToLog, true)
  assert.equal(mealSession.clarifyQuestion, "")
  assert.equal(mealSession.summary, "2 fried eggs cooked in 15g butter, plus 283ml milk with no sugar")
})

test("coach session state keeps simple persisted ingredient refinements on the graph-native meal path", () => {
  const initial = replayCoachConversation([
    user("i had 1 burger"),
  ])

  const persistedMeal = makePersistedMealSession(initial.mealSession, "meal_burger")
  const next = buildCoachSessionState({
    recentMessages: [
      ...initial.history,
      assistant("Saved to today's nutrition: 1 burger."),
    ],
    currentMessage: "with bbq sauce",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.graphNative, true)
  assert.equal(next.mealSession.correctionRequested, true)
  assert.equal(next.mealSession.readyToLog, true)
  assert.match(next.mealSession.summary, /burger with bbq sauce/i)
})

test("coach session state treats preparation refinements on a persisted meal as updates", () => {
  const initial = replayCoachConversation([
    user("i had 2 egg"),
  ])

  const persistedMeal = makePersistedMealSession(initial.mealSession, "meal_eggs")
  const next = buildCoachSessionState({
    recentMessages: [
      ...initial.history,
      assistant("Saved to today's nutrition: 2 egg."),
    ],
    currentMessage: "eggs were fried in butter",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.correctionRequested, true)
  assert.equal(next.mealSession.readyToLog, true)
  assert.match(next.mealSession.summary, /2 fried eggs cooked in butter|2 eggs cooked in butter/i)
})

test("coach session state keeps strong workout clauses out of meal fragments in mixed turns", () => {
  const next = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "had steak and squatted 100kg",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.ok(next.workoutSession)
  assert.equal(next.mealSession.summary, "steak")
  assert.equal(next.workoutSession.exercise_name, "Squat")
  assert.equal(next.workoutSession.weight_kg, 100)
  assert.match(next.workoutSession.clarifyQuestion, /how many reps/i)
  assert.deepEqual(
    (next.mealSession.candidateFragments?.workout || []).map((fragment) => fragment.text),
    ["squatted 100kg"]
  )
})

test("future workout intent does not open a workout logging flow", () => {
  const next = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "i am going to do a run later",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.equal(next.mealSession, null)
  assert.equal(next.workoutSession, null)
})

test("future meal intent does not open a meal logging flow", () => {
  const next = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "i am going to have 2 eggs later",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.equal(next.mealSession, null)
  assert.equal(next.workoutSession, null)
})

test("meal delete follow-up does not fabricate a workout clarification", () => {
  const initial = replayCoachConversation([
    user("i had 2 eggs"),
  ])

  const persistedMeal = makePersistedMealSession(initial.mealSession, "meal_delete_only")
  const next = buildCoachSessionState({
    recentMessages: [
      ...initial.history,
      assistant("Saved to today's nutrition: 2 eggs."),
    ],
    currentMessage: "actually dont log that",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.deleteRequested, true)
  assert.equal(next.workoutSession, null)
})

test("coach session state keeps meal details from mixed clarification replies that also include a bodyweight workout", () => {
  const { snapshots } = replayCoachConversation([
    user("i had milk and eggs and did a pushup"),
    assistant("How much milk did you have?"),
    user("18 eggs one pushup also milk"),
  ])

  const latest = snapshots.at(-1)
  assert.ok(latest?.mealSession)
  assert.ok(latest?.workoutSession)
  assert.match(latest.mealSession.summary, /18 eggs/i)
  assert.match(latest.mealSession.summary, /milk/i)
  assert.equal(latest.workoutSession.exercise_name, "Pushup")
  assert.equal(latest.workoutSession.reps, 1)
  assert.deepEqual(
    (latest.mealSession.candidateFragments?.meal || []).map((fragment) => fragment.text),
    ["18 eggs", "milk"]
  )
  assert.deepEqual(
    (latest.workoutSession.candidateFragments?.workout || []).map((fragment) => fragment.text),
    ["one pushup"]
  )
})

test("coach session state parses broken-english counted bodyweight workouts without reopening a fake exercise clarification", () => {
  const { workoutSession } = replayCoachConversation([
    user("i had 2 egg and do 14 pushup"),
    assistant("anything else?"),
    user("one set"),
  ])

  assert.ok(workoutSession)
  assert.equal(workoutSession.exercise_name, "Pushup")
  assert.equal(workoutSession.reps, 14)
  assert.equal(workoutSession.sets, 1)
  assert.equal(workoutSession.readyToLog, true)
  assert.doesNotMatch(normalizeValueText(workoutSession.clarifyQuestion), /how many reps did you do for one/)
})

test("persisted bodyweight workouts treat count-word set follow-ups as redundant instead of inventing a new log", () => {
  const initial = replayCoachConversation([
    user("i did 14 pushups"),
  ])

  const persistedWorkout = makePersistedWorkoutSession(initial.workoutSession, "workout_pushup_repeat")
  const next = buildCoachSessionState({
    recentMessages: [
      ...initial.history,
      assistant("Saved to Workouts: Pushup."),
    ],
    currentMessage: "one set",
    mealSession: emptyMealSessionState(),
    workoutSession: persistedWorkout,
  })

  assert.ok(next.workoutSession)
  assert.match(String(next.workoutSession.exercise_name || ""), /pushup/i)
  assert.equal(next.workoutSession.alreadyLogged, true)
  assert.equal(next.workoutSession.correctionRequested, false)
  assert.doesNotMatch(normalizeValueText(next.workoutSession.clarifyQuestion), /one/)
})

test("coach session state turns post-save delete intent into a deterministic meal deletion request", () => {
  const initial = replayCoachConversation([
    user("i had pie and eggs and milk"),
    assistant("How many eggs did you have?"),
    user("19.2"),
    assistant("How much milk did you have?"),
    user("500ml"),
  ])

  const persistedMeal = makePersistedMealSession(initial.mealSession, "meal_delete_live")
  const next = buildCoachSessionState({
    recentMessages: [
      ...initial.history,
      assistant("Saved to today's nutrition: 1 serve pie, plus 19.2 eggs, plus 500ml milk."),
    ],
    currentMessage: "no thats wrong delete it",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.deleteRequested, true)
  assert.equal(next.mealSession.alreadyLogged, false)
  assert.equal(next.mealSession.persistedMealId, "meal_delete_live")
})

test("coach session state treats post-save do-not-log reversals as deterministic meal deletions", () => {
  const persistedMeal = makePersistedMealSession({
    ...emptyMealSessionState(),
    active: false,
    mealConversation: true,
    readyToLog: false,
    summary: "1 burger",
  }, "meal_suppress_delete")

  const next = buildCoachSessionState({
    recentMessages: [
      user("i had a burger"),
      assistant("Saved to today's nutrition: 1 burger."),
    ],
    currentMessage: "actually dont log that",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.deleteRequested, true)
  assert.equal(next.mealSession.persistedMealId, "meal_suppress_delete")
  assert.equal(next.mealSession.alreadyLogged, false)
})

test("coach session state turns post-save workout delete intent into a deterministic workout deletion request", () => {
  const initial = replayCoachConversation([
    user("bench press"),
    assistant("How many sets did you do?"),
    user("4 sets"),
    assistant("How many reps?"),
    user("8 reps"),
    assistant("What weight did you use?"),
    user("80kg"),
  ])

  const persistedWorkout = makePersistedWorkoutSession(initial.workoutSession, "workout_delete_live")
  const next = buildCoachSessionState({
    recentMessages: [
      ...initial.history,
      assistant("Saved to Workouts: Bench Press."),
    ],
    currentMessage: "delete it",
    mealSession: emptyMealSessionState(),
    workoutSession: persistedWorkout,
  })

  assert.ok(next.workoutSession)
  assert.equal(next.workoutSession.deleteRequested, true)
  assert.equal(next.workoutSession.alreadyLogged, false)
  assert.equal(next.workoutSession.persistedWorkoutId, "workout_delete_live")
})

test("coach session state treats post-save do-not-save reversals as deterministic workout deletions", () => {
  const persistedWorkout = makePersistedWorkoutSession({
    ...emptyWorkoutSessionState(),
    active: false,
    workoutConversation: true,
    exercise_name: "Pushups",
    workout_type: "Pushups",
    reps: 14,
    summary: "Pushups:14",
    readyToLog: false,
  }, "workout_suppress_delete")

  const next = buildCoachSessionState({
    recentMessages: [
      user("i did 14 pushups"),
      assistant("Saved to Workouts: Pushups."),
    ],
    currentMessage: "dont save that",
    mealSession: emptyMealSessionState(),
    workoutSession: persistedWorkout,
  })

  assert.ok(next.workoutSession)
  assert.equal(next.workoutSession.deleteRequested, true)
  assert.equal(next.workoutSession.persistedWorkoutId, "workout_suppress_delete")
  assert.equal(next.workoutSession.alreadyLogged, false)
})

test("coach session state treats an identical persisted workout message as already logged instead of duplicating it", () => {
  const initial = replayCoachConversation([
    user("bench press 80kg x 8 x 4"),
  ])

  const persistedWorkout = makePersistedWorkoutSession(initial.workoutSession, "workout_repeat_live")
  const next = buildCoachSessionState({
    recentMessages: [
      ...initial.history,
      assistant("Saved to Workouts: Bench Press 80kg for 4 sets of 8."),
    ],
    currentMessage: "bench press 80kg x 8 x 4",
    mealSession: emptyMealSessionState(),
    workoutSession: persistedWorkout,
  })

  assert.ok(next.workoutSession)
  assert.equal(next.workoutSession.alreadyLogged, true)
  assert.equal(next.workoutSession.readyToLog, false)
  assert.equal(next.workoutSession.correctionRequested, false)
})

test("coach session state treats an identical persisted cardio workout message as already logged instead of duplicating it", () => {
  const persistedWorkout = makePersistedWorkoutSession({
    ...emptyWorkoutSessionState(),
    active: false,
    workoutConversation: true,
    exercise_name: "Bike",
    workout_type: "Bike",
    muscle_group: "cardio",
    sets: 1,
    reps: 0,
    weight_kg: 0,
    duration_seconds: 20 * 60,
    summary: "20 min Bike",
    readyToLog: false,
  }, "workout_repeat_cardio")

  const next = buildCoachSessionState({
    recentMessages: [
      user("20 minutes bike"),
      assistant("I logged that workout for you."),
    ],
    currentMessage: "20 minutes bike",
    mealSession: emptyMealSessionState(),
    workoutSession: persistedWorkout,
  })

  assert.equal(next.mealSession, null)
  assert.ok(next.workoutSession)
  assert.equal(next.workoutSession.alreadyLogged, true)
  assert.equal(next.workoutSession.readyToLog, false)
  assert.equal(next.workoutSession.correctionRequested, false)
})

test("coach session state treats metric-only follow-ups on a persisted workout as updates instead of new logs", () => {
  const persistedWorkout = makePersistedWorkoutSession({
    ...emptyWorkoutSessionState(),
    active: false,
    workoutConversation: true,
    exercise_name: "Bench Press",
    workout_type: "Bench Press",
    sets: 2,
    reps: 7,
    weight_kg: 0,
    summary: "Bench Press for 2 sets of 7",
    readyToLog: false,
  }, "workout_fragmented_fix")

  const next = buildCoachSessionState({
    recentMessages: [
      user("i did bench press"),
      assistant("How many reps did you do for Bench Press?"),
      user("2 sets"),
      assistant("How many reps did you do for Bench Press?"),
      user("7 reps"),
      assistant("I logged that workout for you."),
    ],
    currentMessage: "34kg",
    mealSession: emptyMealSessionState(),
    workoutSession: persistedWorkout,
  })

  assert.equal(next.mealSession, null)
  assert.ok(next.workoutSession)
  assert.equal(next.workoutSession.readyToLog, true)
  assert.equal(next.workoutSession.correctionRequested, true)
  assert.equal(next.workoutSession.weight_kg, 34)
  assert.equal(next.workoutSession.exercise_name, "Bench Press")
})

test("coach session state asks for the correction detail when a saved meal is rejected without saying what to change", () => {
  const initial = replayCoachConversation([
    user("i had pie and eggs and milk"),
    assistant("How many eggs did you have?"),
    user("19.2"),
    assistant("How much milk did you have?"),
    user("500ml"),
  ])

  const persistedMeal = makePersistedMealSession(initial.mealSession, "meal_fix_live")
  const next = buildCoachSessionState({
    recentMessages: [
      ...initial.history,
      assistant("Saved to today's nutrition: 1 serve pie, plus 19.2 eggs, plus 500ml milk."),
    ],
    currentMessage: "that's wrong",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.deleteRequested, false)
  assert.equal(next.mealSession.readyToLog, false)
  assert.equal(next.mealSession.correctionRequested, true)
  assert.match(next.mealSession.clarifyQuestion, /tell me what to change|delete it/i)
})

test("pure nutrition questions do not open a meal logging clarification flow", () => {
  const next = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "how much protein is usually in a small latte?",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.equal(next.mealSession, null)
  assert.equal(next.workoutSession, null)
})

test("post-save nutrition questions route away from a persisted meal session", () => {
  const persistedMeal = makePersistedMealSession({
    ...emptyMealSessionState(),
    active: false,
    mealConversation: true,
    readyToLog: false,
    summary: "200g salmon",
    items: [
      {
        base_name: "salmon",
        label: "Salmon",
        category: "food",
        quantity: { amount: 200, unit: "g", text: "200g" },
        preparation: [],
        exclusions: [],
        attached_to: null,
        relation: null,
      },
    ],
  }, "meal_macro_saved")

  const next = buildCoachSessionState({
    recentMessages: [
      user("i had salmon"),
      assistant("How much salmon did you have?"),
      user("200g"),
      assistant("Saved to today's nutrition: 200g salmon."),
    ],
    currentMessage: "how much protein is in that",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession, "should return an answerOnly session, not null, so the AI has saved meal context")
  assert.equal(next.mealSession.answerOnly, true)
  assert.equal(next.mealSession.readyToLog, false)
  assert.equal(next.mealSession.persisted, true)
  assert.equal(next.workoutSession, null)
})

test("nutrition answer history does not contaminate the next fresh meal log", () => {
  const { mealSession, workoutSession } = replayCoachConversation([
    user("whats the macros for 100g chicken breast"),
    assistant("100g chicken breast is about 165 calories."),
    user("i had 2 eggs"),
  ])

  assert.ok(mealSession)
  assert.equal(mealSession.summary, "2 eggs")
  assert.equal(mealSession.items.some((item) => /chicken/i.test(item.base_name || item.baseName || "")), false)
  assert.equal(mealSession.answerOnly, false)
  assert.equal(workoutSession.readyToLog, false)
  assert.equal(workoutSession.exercise_name, "")
})

test("nutrition answer history does not contaminate the next workout log", () => {
  const { mealSession, workoutSession } = replayCoachConversation([
    user("whats the macros for 100g chicken breast"),
    assistant("100g chicken breast is about 165 calories."),
    user("i did 20 pushups"),
  ])

  assert.equal(mealSession.mealConversation, false)
  assert.equal(mealSession.summary, "")
  assert.equal(workoutSession.readyToLog, true)
  assert.equal(normalizeValueText(workoutSession.exercise_name), "pushups")
  assert.equal(workoutSession.reps, 20)
})

test("coach session state splits same-turn meal and workout fragments so the workout does not become food", () => {
  const firstTurn = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "i had eggs and did 4 pushups",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(firstTurn.mealSession)
  assert.ok(firstTurn.workoutSession)
  assert.match(firstTurn.mealSession.clarifyQuestion, /how many eggs/i)
  assert.equal(firstTurn.mealSession.summary, "eggs")
  assert.equal(firstTurn.workoutSession.readyToLog, true)
  assert.equal(firstTurn.workoutSession.exercise_name, "Pushups")
  assert.equal(firstTurn.workoutSession.reps, 4)

  const secondTurn = buildCoachSessionState({
    recentMessages: [
      user("i had eggs and did 4 pushups"),
      assistant("How many eggs did you have?"),
    ],
    currentMessage: "18",
    mealSession: firstTurn.mealSession,
    workoutSession: firstTurn.workoutSession,
  })

  assert.ok(secondTurn.mealSession)
  assert.ok(secondTurn.workoutSession)
  assert.equal(secondTurn.mealSession.readyToLog, true)
  assert.equal(secondTurn.mealSession.summary, "18 eggs")
  assert.equal(secondTurn.workoutSession.readyToLog, true)
  assert.equal(secondTurn.workoutSession.exercise_name, "Pushups")
  assert.equal(secondTurn.workoutSession.reps, 4)
})

test("apostrophe-free nutrition questions and target checks do not open meal sessions", () => {
  const cases = [
    "whats my total calories so far today",
    "am i over my fat target",
  ]

  for (const currentMessage of cases) {
    const next = buildCoachSessionState({
      recentMessages: [],
      currentMessage,
      mealSession: emptyMealSessionState(),
      workoutSession: emptyWorkoutSessionState(),
    })

    assert.equal(next.mealSession, null, currentMessage)
    assert.equal(next.workoutSession, null, currentMessage)
  }
})

test("comparative food questions do not open a meal clarification flow", () => {
  const cases = [
    "is brown rice better than white?",
    "is chicken better than beef",
    "are oats good for you",
    "is coffee bad for you",
  ]

  for (const currentMessage of cases) {
    const next = buildCoachSessionState({
      recentMessages: [],
      currentMessage,
      mealSession: emptyMealSessionState(),
      workoutSession: emptyWorkoutSessionState(),
    })

    assert.equal(next.mealSession, null, currentMessage)
    assert.equal(next.workoutSession, null, currentMessage)
  }
})

test("vague meal references with time language do not open a fake meal clarification flow", () => {
  const cases = [
    "i had that for lunch yesterday",
    "i had lunch already",
    "already ate dinner",
    "i ate the same as last time",
  ]

  for (const currentMessage of cases) {
    const next = buildCoachSessionState({
      recentMessages: [],
      currentMessage,
      mealSession: emptyMealSessionState(),
      workoutSession: emptyWorkoutSessionState(),
    })

    assert.equal(next.mealSession, null, currentMessage)
    assert.equal(next.workoutSession, null, currentMessage)
  }
})

test("explicit meals with real food plus time references still parse normally", () => {
  const next = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "i had 200g steak yesterday",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.workoutSession, null)
  assert.match(next.mealSession.summary.toLowerCase(), /200g steak/)
})

test("contextless do-not-log turns stay deterministic instead of falling through to the live coach", () => {
  const next = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "don't log that",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.suppressed, true)
  assert.equal(next.mealSession.suppressionReply, "Okay, I won't save that.")
  assert.equal(next.workoutSession, null)
})

test("classic workout x-pattern messages do not open a fake meal session", () => {
  const next = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "row 78kg x 9 x 5",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.equal(next.mealSession, null)
  assert.ok(next.workoutSession)
  assert.equal(next.workoutSession.readyToLog, true)
  assert.equal(next.workoutSession.exercise_name, "Row")
  assert.equal(next.workoutSession.weight_kg, 78)
  assert.equal(next.workoutSession.reps, 9)
  assert.equal(next.workoutSession.sets, 5)
})

test("workout advice questions do not open a fake workout clarification flow", () => {
  const next = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "i'm tired and sore, what should i train?",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.equal(next.mealSession, null)
  assert.equal(next.workoutSession, null)
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
  assert.equal(next.workoutSession, null)
})

test("coach session state does not open a stray workout thread from 'i just did' after a persisted meal", () => {
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

  const persistedMeal = makePersistedMealSession(initial.mealSession, "meal_after_save")
  const next = buildCoachSessionState({
    recentMessages: [
      ...initial.history,
      assistant("Saved to today's nutrition: 17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar."),
    ],
    currentMessage: "i just did",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.alreadyLogged, true)
  assert.equal(next.workoutSession, null)
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

test("coach session state parses compact workout pivots inside a meal thread", () => {
  const persistedMeal = makePersistedMealSession({
    ...emptyMealSessionState(),
    active: false,
    mealConversation: true,
    readyToLog: false,
    summary: "250g pasta",
    items: [
      {
        base_name: "pasta",
        label: "Pasta",
        category: "food",
        quantity: { amount: 250, unit: "g", text: "250g" },
        preparation: [],
        exclusions: [],
        attached_to: null,
        relation: null,
      },
    ],
  }, "meal_pasta_saved")

  const next = buildCoachSessionState({
    recentMessages: [
      user("i had pasta"),
      assistant("How much pasta did you have?"),
      user("250g"),
      assistant("Saved to today's nutrition: 250g pasta."),
    ],
    currentMessage: "oh and i did legs today, squats 100kg 5x5",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.equal(next.mealSession, null)
  assert.ok(next.workoutSession)
  assert.match(next.workoutSession.exercise_name, /Squat/i)
  assert.equal(next.workoutSession.weight_kg, 100)
  assert.equal(next.workoutSession.sets, 5)
  assert.equal(next.workoutSession.reps, 5)
  assert.equal(next.workoutSession.readyToLog, true)
})

test("coach session state keeps meal pivots out of an active workout thread", () => {
  const priorWorkout = {
    ...emptyWorkoutSessionState(),
    active: true,
    workoutConversation: true,
    exercise_name: "Bench Press",
    workout_type: "Bench Press",
    sets: 0,
    reps: 0,
    weight_kg: 0,
    summary: "Bench Press",
    readyToLog: false,
  }

  const next = buildCoachSessionState({
    recentMessages: [
      user("bench press"),
      assistant("How many reps did you do for Bench Press?"),
    ],
    currentMessage: "actually also had a protein shake 300ml",
    mealSession: emptyMealSessionState(),
    workoutSession: priorWorkout,
  })

  assert.ok(next.mealSession)
  assert.match(next.mealSession.summary.toLowerCase(), /protein shake/)
  assert.match(next.mealSession.summary.toLowerCase(), /300ml/)
  assert.equal(next.workoutSession, null)
})

test("coach session state keeps metric-only workout replies attached to the existing exercise", () => {
  const priorWorkout = {
    ...emptyWorkoutSessionState(),
    active: true,
    workoutConversation: true,
    exercise_name: "Bench Press",
    workout_type: "Bench Press",
    sets: 0,
    reps: 0,
    weight_kg: 0,
    summary: "Bench Press",
    readyToLog: false,
  }

  const repsTurn = buildCoachSessionState({
    recentMessages: [
      user("bench press"),
      assistant("How many reps did you do for Bench Press?"),
    ],
    currentMessage: "5 reps at 60kg",
    mealSession: emptyMealSessionState(),
    workoutSession: priorWorkout,
  })

  assert.ok(repsTurn.workoutSession)
  assert.equal(repsTurn.workoutSession.exercise_name, "Bench Press")
  assert.equal(repsTurn.workoutSession.weight_kg, 60)
  assert.equal(repsTurn.workoutSession.reps, 5)
  assert.equal(repsTurn.workoutSession.readyToLog, true)

  const moreSetsTurn = buildCoachSessionState({
    recentMessages: [
      user("bench press"),
      assistant("How many reps did you do for Bench Press?"),
      user("5 reps at 60kg"),
      assistant("Saved to Workouts: Bench Press 60kg for 1 set of 5."),
    ],
    currentMessage: "and then 2 more sets at 60kg",
    mealSession: emptyMealSessionState(),
    workoutSession: makePersistedWorkoutSession(repsTurn.workoutSession, "workout_bench_saved"),
  })

  assert.ok(moreSetsTurn.workoutSession)
  assert.equal(moreSetsTurn.workoutSession.exercise_name, "Bench Press")
  assert.equal(moreSetsTurn.workoutSession.weight_kg, 60)
  assert.equal(moreSetsTurn.workoutSession.reps, 5)
  assert.equal(moreSetsTurn.workoutSession.sets, 3)
  assert.equal(moreSetsTurn.workoutSession.correctionRequested, true)
})

test("coach session state surfaces both meal and workout candidates when a numeric follow-up could belong to either domain", () => {
  const initial = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "i had eggs and did 4 pushups",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  })

  const persistedWorkout = {
    ...initial.workoutSession,
    persisted: true,
    persistedWorkoutId: "workout_pushups",
    persistedSummary: "Pushups",
    persistedAt: "2026-05-05T00:00:00.000Z",
    summary: "Pushups",
    active: false,
    readyToLog: false,
    clarifyQuestion: "",
    alreadyLogged: false,
  }

  const next = buildCoachSessionState({
    recentMessages: [
      user("i had eggs and did 4 pushups"),
      assistant("Great job on the pushups! Would you like me to log that meal?"),
    ],
    currentMessage: "18",
    mealSession: initial.mealSession,
    workoutSession: persistedWorkout,
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.summary, "18 eggs")
  assert.equal(next.mealSession.readyToLog, true)
  assert.ok(next.workoutSession)
})

test("mixed thread: steak + squat follow-up quantity hygiene", () => {
  const steakSquat = replayCoachConversation([
    user("had steak and squatted 100kg"),
    assistant("How many reps and how much steak?"),
    user("5 reps"),
    user("300g"),
  ])

  assert.ok(steakSquat.mealSession)
  assert.equal(steakSquat.mealSession.readyToLog, true)
  assert.match(String(steakSquat.mealSession.summary || ""), /300g steak/i)

  assert.ok(steakSquat.workoutSession)
  assert.notEqual(normalizeValueText(steakSquat.workoutSession.exercise_name), "300g")
  assert.equal(Array.isArray(steakSquat.workoutSession.candidateActivities) ? steakSquat.workoutSession.candidateActivities.length : 0, 0)
  assert.equal(steakSquat.workoutSession.readyToLog, true)
})

test("mixed thread: meal quantity follow-up does not trigger workout for drinks", () => {
  const milk = replayCoachConversation([
    user("i had milk"),
    user("250ml"),
  ])

  assert.ok(milk.mealSession)
  assert.match(String(milk.mealSession.summary || ""), /250ml milk/i)
  assert.ok(!milk.workoutSession || !milk.workoutSession.readyToLog)
  assert.notEqual(normalizeValueText(milk.workoutSession?.exercise_name), "250ml")
})

test("mixed thread: real workout continuation still works for bench and cardio", () => {
  const bench = replayCoachConversation([
    user("bench"),
    user("5 reps at 60kg"),
  ])
  assert.ok(bench.workoutSession)
  assert.equal(bench.workoutSession.readyToLog, true)
  assert.equal(bench.workoutSession.weight_kg, 60)
  assert.equal(bench.workoutSession.reps, 5)

  const run = replayCoachConversation([
    user("run"),
    user("2km"),
  ])
  assert.ok(run.workoutSession)
  assert.equal(run.workoutSession.distance_km, 2)
  assert.equal(run.workoutSession.readyToLog, true)
})

test("mixed thread: meal quantity follow-up for yoghurt works without a workout claim", () => {
  const yoghurt = replayCoachConversation([
    user("i had yoghurt"),
    user("250g"),
  ])

  assert.ok(yoghurt.mealSession)
  assert.match(String(yoghurt.mealSession.summary || ""), /250g yoghurt/i)
  assert.ok(!yoghurt.workoutSession || !yoghurt.workoutSession.readyToLog)
  assert.notEqual(normalizeValueText(yoghurt.workoutSession?.exercise_name), "250g")
})

test("mixed thread keeps sibling meal items during a pending drink quantity clarification", () => {
  const { snapshots } = replayCoachConversation([
    user("i had milk and eggs and did a pushup"),
    assistant("How many eggs did you have? Also, how many pushups did you do? Let’s log both when you provide the details."),
    user("I had 18 eggs, i did one pushup, I also had milk"),
    assistant("Let's log those 18 eggs, the milk, and the pushup. How much milk did you have?"),
    user("2250ml"),
  ])

  assert.deepEqual(
    snapshots[0].mealSession.items.map((item) => item.base_name),
    ["milk", "egg"],
  )
  assert.equal(snapshots[0].mealSession.readyToLog, false)
  assert.match(String(snapshots[1].mealSession.summary || ""), /18 eggs/i)
  assert.equal(snapshots[1].mealSession.readyToLog, false)
  assert.match(String(snapshots[1].mealSession.clarifyQuestion || ""), /how much milk/i)
  assert.equal(snapshots[1].workoutSession.readyToLog, true)
  assert.equal(snapshots[1].workoutSession.reps, 1)
  assert.doesNotMatch(String(snapshots[1].workoutSession.clarifyQuestion || ""), /pushup/i)
  assert.equal(snapshots[2].mealSession.readyToLog, true)
  assert.equal(snapshots[2].mealSession.clarifyQuestion, "")
  assert.match(String(snapshots[2].mealSession.summary || ""), /2250ml milk, plus 18 eggs/i)
})

test("mixed thread keeps drink variant and sibling egg quantity during a pending milk clarification", () => {
  const { snapshots } = replayCoachConversation([
    user("i had milk and did a pushup then had eggs"),
    assistant("How much milk did you have? And how many pushups did you do?"),
    user("it was light milk, and i had 14 scrambled eggs"),
    assistant("Let's log your meals! You had 14 scrambled eggs and light milk. How much milk did you drink? Once I know that, I can save it all."),
    user("450ml"),
  ])

  assert.match(String(snapshots[1].mealSession.summary || ""), /light milk/i)
  assert.match(String(snapshots[1].mealSession.summary || ""), /14 scrambled eggs/i)
  assert.match(String(snapshots[1].mealSession.clarifyQuestion || ""), /how much light milk/i)
  assert.equal(snapshots[1].mealSession.readyToLog, false)
  assert.equal(snapshots[2].mealSession.readyToLog, true)
  assert.match(String(snapshots[2].mealSession.summary || ""), /450ml light milk, plus 14 scrambled eggs/i)
})

test("mixed thread keeps additive egg totals stable when a later split and wine quantity arrive together", () => {
  const { snapshots } = replayCoachConversation([
    user("i had 16 egg and some wine then did a pushup and had 1 more egg"),
    assistant("Saved to Workouts: Pushup for 1 set of 1."),
    user("did you log my eggs and wine?"),
    assistant("How much wine did you have?"),
    user("14 fried, 1 hard boiled, 2 scrambled in 100g of butter. 250ml of white wine"),
    assistant("What were the fried eggs cooked in?"),
    user("what do you mean?"),
  ])

  assert.match(String(snapshots[0].mealSession.summary || ""), /17 eggs/i)
  assert.match(String(snapshots[0].mealSession.summary || ""), /\bwine\b/i)
  assert.match(String(snapshots[0].mealSession.clarifyQuestion || ""), /how much wine/i)
  assert.equal(snapshots[0].workoutSession.readyToLog, true)

  assert.equal(snapshots[2].mealSession.readyToLog, false)
  assert.match(String(snapshots[2].mealSession.summary || ""), /250ml white wine/i)
  assert.match(String(snapshots[2].mealSession.summary || ""), /14 fried eggs/i)
  assert.match(String(snapshots[2].mealSession.summary || ""), /1 hard boiled egg/i)
  assert.match(String(snapshots[2].mealSession.summary || ""), /2 scrambled eggs cooked in 100g butter/i)
  assert.match(String(snapshots[2].mealSession.clarifyQuestion || ""), /fried eggs cooked in/i)
  assert.doesNotMatch(String(snapshots[2].mealSession.summary || ""), /fried wine|hard boiled wine|17 eggs cooked in 100g butter/i)
  assert.equal(
    snapshots[2].mealSession.items
      .filter((item) => item.category === "food")
      .reduce((total, item) => total + Number(item?.quantity?.amount || 0), 0),
    17,
  )

  assert.equal(snapshots[3].mealSession.readyToLog, false)
  assert.match(String(snapshots[3].mealSession.clarifyQuestion || ""), /fried eggs cooked in/i)
  assert.doesNotMatch(String(snapshots[3].mealSession.summary || ""), /fried wine|hard boiled wine/i)
})

test("graph-native additive food fragments accumulate for weighted and count-friendly foods", () => {
  const steak = replayCoachConversation([
    user("i had 200g steak and then 100g more steak"),
  ])
  assert.equal(steak.mealSession.readyToLog, true)
  assert.equal(normalizeValueText(steak.mealSession.summary), "300g steak")

  const burgers = replayCoachConversation([
    user("i had 2 burgers and 1 more burger"),
  ])
  assert.equal(burgers.mealSession.readyToLog, true)
  assert.equal(normalizeValueText(burgers.mealSession.summary), "3 burgers")
})

test("mixed thread meal suppression preserves pending cardio context for a later distance follow-up", () => {
  const { snapshots } = replayCoachConversation([
    user("i had burger and did a run"),
    assistant("How much burger did you have?"),
    user("actually dont log that burger"),
    user("the run was 2km"),
  ])

  assert.ok(snapshots[1].mealSession)
  assert.equal(snapshots[1].mealSession.suppressed, true)
  assert.ok(snapshots[1].workoutSession)
  assert.equal(normalizeValueText(snapshots[1].workoutSession.exercise_name), "run")
  assert.equal(snapshots[1].workoutSession.readyToLog, false)
  assert.equal(normalizeValueText(snapshots[1].workoutSession.summary), "run")

  assert.ok(snapshots[2].workoutSession)
  assert.equal(normalizeValueText(snapshots[2].workoutSession.exercise_name), "run")
  assert.equal(snapshots[2].workoutSession.distance_km, 2)
  assert.equal(snapshots[2].workoutSession.readyToLog, true)
  assert.equal(normalizeValueText(snapshots[2].workoutSession.summary), "run")
  assert.equal(snapshots[2].workoutSession.clarifyQuestion, "")
  assert.ok(!snapshots[2].mealSession?.readyToLog)
})

test("persisted pushup follow-ups treat pluralized same-exercise replies as workout updates", () => {
  const persistedWorkout = makePersistedWorkoutSession({
    active: false,
    workoutConversation: true,
    exercise_name: "Pushup",
    workout_type: "Pushup",
    muscle_group: "full_body",
    sets: 1,
    reps: 1,
    summary: "Pushup for 1 set of 1",
  }, "workout_pushup")

  const next = buildCoachSessionState({
    recentMessages: [
      user("i had milk and did a pushup then had eggs"),
      assistant("You've had milk and eggs, plus you did a pushup! How much milk did you have? I can log the workout for you immediately."),
      user("450ml"),
      assistant("I've logged 450ml light milk and 14 scrambled eggs for you."),
    ],
    currentMessage: "i did 14 pushups",
    mealSession: makePersistedMealSession({
      active: false,
      mealConversation: true,
      summary: "450ml light milk, plus 14 scrambled eggs cooked in 100g salted butter",
      items: [],
    }, "meal_1"),
    workoutSession: persistedWorkout,
  })

  assert.ok(next.workoutSession)
  assert.equal(next.workoutSession.readyToLog, true)
  assert.equal(next.workoutSession.correctionRequested, true)
  assert.equal(next.workoutSession.persistedWorkoutId, "workout_pushup")
  assert.equal(next.workoutSession.reps, 14)
})

test("fresh cardio statements do not inherit stale pushup reps from the previous workout", () => {
  const next = buildCoachSessionState({
    recentMessages: [
      user("i had 6 eggs and did 3 pushups"),
      assistant("I've logged your 6 eggs and 3 pushups."),
    ],
    currentMessage: "i ran a marathon",
    workoutSession: makePersistedWorkoutSession({
      active: false,
      workoutConversation: true,
      exercise_name: "Pushups",
      workout_type: "Pushups",
      muscle_group: "full_body",
      sets: 1,
      reps: 3,
      summary: "Pushups for 1 set of 3",
    }, "workout_pushups"),
  })

  assert.ok(next.workoutSession)
  assert.equal(next.workoutSession.exercise_name, "Run")
  assert.equal(next.workoutSession.distance_km, 42.2)
  assert.equal(next.workoutSession.reps, 0)
  assert.equal(next.workoutSession.readyToLog, true)
  assert.doesNotMatch(String(next.workoutSession.summary || ""), /set of 3/i)
})

test("persisted meal refinement keeps resolved milk quantity while splitting egg preparations", () => {
  const initial = replayCoachConversation([
    user("i had milk and eggs and did a pushup"),
    assistant("How many eggs did you have? Also, how many pushups did you do? Let’s log both when you provide the details."),
    user("I had 18 eggs, i did one pushup, I also had milk"),
    assistant("Let's log those 18 eggs, the milk, and the pushup. How much milk did you have?"),
    user("2250ml"),
  ])

  const persistedMeal = makePersistedMealSession(initial.mealSession, "meal_milk_eggs")
  const persistedWorkout = makePersistedWorkoutSession({
    ...initial.workoutSession,
    exercise_name: "Pushup",
    workout_type: "Pushup",
    reps: 1,
    sets: 1,
    summary: "Pushup for 1 set of 1",
  }, "workout_pushup")

  const next = buildCoachSessionState({
    recentMessages: [
      ...initial.history,
      assistant("Saved to today's nutrition: 2250ml milk, plus 18 eggs."),
    ],
    currentMessage: "12 of the eggs were fried, the rest were hard boiled",
    mealSession: persistedMeal,
    workoutSession: persistedWorkout,
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.correctionRequested, true)
  assert.equal(next.mealSession.readyToLog, false)
  assert.match(String(next.mealSession.summary || ""), /2250ml milk/i)
  assert.match(String(next.mealSession.summary || ""), /12 fried eggs/i)
  assert.match(String(next.mealSession.summary || ""), /6 hard boiled eggs/i)
  assert.match(String(next.mealSession.clarifyQuestion || ""), /fried eggs cooked in/i)
  assert.doesNotMatch(String(next.mealSession.clarifyQuestion || ""), /milk/i)
})

test("persisted meal refinement handles no-comma rest splits without garbling preparation labels", () => {
  const persistedMeal = makePersistedMealSession({
    ...emptyMealSessionState(),
    active: false,
    mealConversation: true,
    summary: "2250ml milk, plus 18 eggs",
    items: [
      {
        base_name: "milk",
        label: "Milk",
        category: "drink",
        quantity: { amount: 2250, unit: "ml", text: "2250ml", modifier: "" },
        preparation: [],
        modifiers: [],
        exclusions: [],
        attached_to: null,
        relation: null,
        variant_key: "",
        meal_type: "",
      },
      {
        base_name: "egg",
        label: "Eggs",
        category: "food",
        quantity: { amount: 18, unit: "egg", text: "18 eggs", modifier: "" },
        preparation: [],
        modifiers: [],
        exclusions: [],
        attached_to: null,
        relation: null,
        variant_key: "",
        meal_type: "",
      },
    ],
    graphNative: true,
  }, "meal_split_no_comma")

  const next = buildCoachSessionState({
    recentMessages: [
      user("i had milk and eggs"),
      assistant("How much milk did you have?"),
      user("18 eggs also milk"),
      assistant("How much milk did you have?"),
      user("2250ml"),
      assistant("Saved to today's nutrition: 2250ml milk, plus 18 eggs."),
    ],
    currentMessage: "12 eggs were fried rest hard boiled",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.correctionRequested, true)
  assert.equal(next.mealSession.readyToLog, false)
  assert.match(String(next.mealSession.summary || ""), /12 fried eggs/i)
  assert.match(String(next.mealSession.summary || ""), /6 hard boiled eggs/i)
  assert.match(String(next.mealSession.clarifyQuestion || ""), /fried eggs cooked in/i)
  assert.doesNotMatch(String(next.mealSession.summary || ""), /hard boiled fried rest/i)
})

test("coach session state keeps a new explicit meal isolated from the previously saved meal", () => {
  const initial = replayCoachConversation([
    user("i had egg"),
    assistant("How many eggs did you have?"),
    user("i had 18 fried eggs and 14 hard boiled"),
    assistant("What were the fried eggs cooked in?"),
    user("120g of butter"),
  ])

  const persistedMeal = makePersistedMealSession(initial.mealSession, "meal_original")
  const next = buildCoachSessionState({
    recentMessages: [
      ...initial.history,
      assistant("Saved to today's nutrition: 18 fried eggs cooked in 120g butter, plus 14 hard boiled eggs."),
    ],
    currentMessage: "i had milk and steak",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.persisted, false)
  assert.equal(next.mealSession.persistedMealId, "")
  assert.match(next.mealSession.clarifyQuestion, /how much milk/i)
  assert.match(next.mealSession.summary, /milk/i)
  assert.match(next.mealSession.summary, /steak/i)
  assert.doesNotMatch(next.mealSession.summary, /fried eggs|hard boiled eggs|butter/i)
})

test("coach session state treats quantified follow-ups on a saved meal as updates instead of already-logged repeats", () => {
  const initial = replayCoachConversation([
    user("i had milk and steak"),
    assistant("How much milk did you have?"),
    user("970ml"),
  ])

  const persistedMeal = makePersistedMealSession(initial.mealSession, "meal_milk_steak")
  const next = buildCoachSessionState({
    recentMessages: [
      ...initial.history,
      assistant("Saved to today's nutrition: 970ml milk, plus 1 serve steak."),
    ],
    currentMessage: "but i had 3 steaks",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.alreadyLogged, false)
  assert.equal(next.mealSession.correctionRequested, true)
  assert.equal(next.mealSession.readyToLog, true)
  assert.match(next.mealSession.summary, /3 steaks/i)
  assert.doesNotMatch(next.mealSession.summary, /1 serve steak/i)
})

test("coach session state replaces a targeted saved-meal item instead of appending a duplicate correction item", () => {
  const initial = replayCoachConversation([
    user("i had milk and steak"),
    assistant("How much milk did you have?"),
    user("970ml"),
  ])

  const persistedMeal = makePersistedMealSession(initial.mealSession, "meal_replace_steak")
  const next = buildCoachSessionState({
    recentMessages: [
      ...initial.history,
      assistant("Saved to today's nutrition: 970ml milk, plus 1 serve steak."),
    ],
    currentMessage: "update the steak to 350g rump",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.correctionRequested, true)
  assert.equal(next.mealSession.readyToLog, true)
  assert.equal(next.mealSession.summary, "970ml milk, plus 350g rump")
  assert.equal(next.mealSession.items.some((item) => String(item.base_name || item.baseName || "").toLowerCase() === "steak"), false)
})

test("coach session state treats item-level remove requests on saved meals as updates instead of deleting the whole meal", () => {
  const initial = replayCoachConversation([
    user("i had milk and steak"),
    assistant("How much milk did you have?"),
    user("970ml"),
  ])

  const persistedMeal = makePersistedMealSession(initial.mealSession, "meal_remove_steak")
  const next = buildCoachSessionState({
    recentMessages: [
      ...initial.history,
      assistant("Saved to today's nutrition: 970ml milk, plus 1 serve steak."),
    ],
    currentMessage: "remove 1 serve steak",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.deleteRequested, false)
  assert.equal(next.mealSession.correctionRequested, true)
  assert.equal(next.mealSession.readyToLog, true)
  assert.equal(next.mealSession.summary, "970ml milk")
})

test("coach session state does not let a failed general log query seed the next workout turn as meal text", () => {
  const next = buildCoachSessionState({
    recentMessages: [
      user("whats in todays log"),
      assistant("I couldn't reach the live coach just now, so I left your data alone. Please retry in a moment."),
    ],
    currentMessage: "i did 14 pushups",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.equal(next.mealSession, null)
  assert.ok(next.workoutSession)
  assert.equal(next.workoutSession.readyToLog, true)
  assert.equal(next.workoutSession.exercise_name, "Pushups")
  assert.equal(next.workoutSession.reps, 14)
})

test("coach session state does not reopen a persisted meal when the user asks about today's log, and the next workout turn still routes to workouts", () => {
  const mealConversation = replayCoachConversation([
    user("i had milk and steak"),
    assistant("How much milk did you have?"),
    user("970ml"),
    assistant("How much steak did you have?"),
    user("3 steaks"),
  ])

  const persistedMeal = makePersistedMealSession(mealConversation.mealSession, "meal_recent")
  const logQuery = buildCoachSessionState({
    recentMessages: [
      ...mealConversation.history,
      assistant("Saved to today's nutrition: 970ml milk, plus 3 steaks."),
    ],
    currentMessage: "whats in todays log",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.equal(logQuery.mealSession, null)
  assert.equal(logQuery.workoutSession, null)

  const nextWorkoutTurn = buildCoachSessionState({
    recentMessages: [
      ...mealConversation.history,
      assistant("Saved to today's nutrition: 970ml milk, plus 3 steaks."),
      user("whats in todays log"),
      assistant("I couldn't reach the live coach just now, so I left your data alone. Please retry in a moment."),
    ],
    currentMessage: "i did 14 pushups",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.equal(nextWorkoutTurn.mealSession, null)
  assert.ok(nextWorkoutTurn.workoutSession)
  assert.equal(nextWorkoutTurn.workoutSession.readyToLog, true)
  assert.equal(nextWorkoutTurn.workoutSession.exercise_name, "Pushups")
  assert.equal(nextWorkoutTurn.workoutSession.reps, 14)
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

test("stacked meal and workout messages keep food out of workout labels and workout terms out of foods", () => {
  const next = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "i had eggs bacon toast and did bench 80kg 5x5 then ran 2km",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.ok(next.workoutSession)
  assert.doesNotMatch(String(next.mealSession.summary || "").toLowerCase(), /\bbench\b|\bran\b|\bkm\b/)
  assert.doesNotMatch(String(next.workoutSession.exercise_name || "").toLowerCase(), /\begg\b|\bbacon\b|\btoast\b/)
  assert.match(String(next.workoutSession.exercise_name || ""), /bench/i)
})

test("intent graph keeps stacked mixed turns as separate meal and workout candidate fragments", () => {
  const next = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "i had eggs bacon toast and did bench 80kg 5x5 then ran 2km",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession?.intentGraph)
  assert.equal(next.mealSession.intentGraph.hasMixedDomains, true)
  assert.equal(next.mealSession.candidateFragments.meal.length, 1)
  assert.equal(next.mealSession.candidateFragments.workout.length, 2)
  assert.ok(Array.isArray(next.workoutSession?.candidateActivities))
  assert.equal(next.workoutSession.candidateActivities.length, 2)
  assert.match(String(next.workoutSession.candidateActivities[0]?.parsedWorkout?.exercise_name || ""), /bench/i)
  assert.match(String(next.workoutSession.candidateActivities[1]?.parsedWorkout?.exercise_name || ""), /run/i)
})

test("mixed workout clarification follow-ups keep the primary exercise and preserve secondary candidates", () => {
  const first = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "i did bench 80kg and ran 2km",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  })

  const carriedWorkoutSession = {
    ...first.workoutSession,
    active: false,
    readyToLog: false,
    clarifyQuestion: "",
    persisted: true,
    persistedWorkoutId: "workout_run",
    persistedSummary: "Bench 80kg",
    persistedAt: "2026-05-21T03:00:00Z",
  }

  const next = buildCoachSessionState({
    recentMessages: [
      user("i did bench 80kg and ran 2km"),
      assistant("I've logged your run. How many reps did you do for the bench?"),
    ],
    currentMessage: "5 reps",
    mealSession: emptyMealSessionState(),
    workoutSession: carriedWorkoutSession,
  })

  assert.ok(next.workoutSession)
  assert.match(String(next.workoutSession.exercise_name || ""), /bench/i)
  assert.match(String(next.workoutSession.summary || ""), /bench/i)
  assert.equal(Boolean(next.workoutSession.readyToLog), true)
  assert.ok(Array.isArray(next.workoutSession.candidateActivities))
  assert.equal(next.workoutSession.candidateActivities.length, 2)
  assert.match(String(next.workoutSession.candidateActivities[0]?.parsedWorkout?.exercise_name || ""), /bench/i)
  assert.equal(Number(next.workoutSession.candidateActivities[0]?.parsedWorkout?.reps || 0), 5)
  assert.match(String(next.workoutSession.candidateActivities[1]?.parsedWorkout?.exercise_name || ""), /run/i)
})

test("mixed workout follow-ups do not turn a pending primary candidate into a correction of a saved secondary workout", () => {
  const first = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "i did bench 80kg and ran 2km",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  })

  const carriedWorkoutSession = {
    ...first.workoutSession,
    active: false,
    readyToLog: false,
    clarifyQuestion: "",
    persisted: true,
    persistedWorkoutId: "workout_run",
    persistedSummary: "Run",
    persistedAt: "2026-05-21T03:00:00Z",
  }

  const next = buildCoachSessionState({
    recentMessages: [
      user("i did bench 80kg and ran 2km"),
      assistant("I've logged your run. How many reps did you do for the bench?"),
    ],
    currentMessage: "5 reps",
    mealSession: emptyMealSessionState(),
    workoutSession: carriedWorkoutSession,
  })

  assert.ok(next.workoutSession)
  assert.match(String(next.workoutSession.exercise_name || ""), /bench/i)
  assert.equal(Boolean(next.workoutSession.readyToLog), true)
  assert.equal(Boolean(next.workoutSession.correctionRequested), false)
})

test("frustrated log reversal threads do not turn complaint text into meal or workout entities", () => {
  const conversation = [
    user("log this as workout"),
    assistant("What exercise or cardio did you do?"),
    user("actually food"),
    assistant("What food was it?"),
    user("no wait dont log it"),
    assistant("Okay, I won't save that."),
    user("why did you save that"),
  ]

  const { mealSession, workoutSession } = replayCoachConversation(conversation)

  assert.doesNotMatch(String(mealSession?.summary || "").toLowerCase(), /why did you save that|actually food/)
  assert.doesNotMatch(String(mealSession?.clarifyQuestion || "").toLowerCase(), /why did you save that|actually food/)
  assert.doesNotMatch(String(workoutSession?.exercise_name || "").toLowerCase(), /why did you save that|actually food/)
  assert.equal(Boolean(mealSession?.readyToLog), false)
  assert.equal(Boolean(workoutSession?.readyToLog), false)
})

test("persisted meal delete requests outrank frustration text and do not reopen meal parsing", () => {
  const initial = replayCoachConversation([
    user("i had burrito"),
    assistant("How much burrito did you have?"),
    user("300g"),
  ])
  const persistedMeal = makePersistedMealSession(initial.mealSession)
  const next = buildCoachSessionState({
    recentMessages: [
      ...initial.history,
      assistant("Saved to today's nutrition: 300g burrito."),
    ],
    currentMessage: "no thats wrong, why did you save that, delete it",
    mealSession: persistedMeal,
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.mealSession.deleteRequested, true)
  assert.equal(next.mealSession.alreadyLogged, false)
  assert.equal(Boolean(next.mealSession.clarifyQuestion), false)
  assert.doesNotMatch(String(next.mealSession.summary || "").toLowerCase(), /why did you|delete it/)
})

test("vague workout references ask for the exercise instead of inventing a workout label", () => {
  const next = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "this mornings workout",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.equal(next.mealSession, null)
  assert.ok(next.workoutSession)
  assert.equal(next.workoutSession.exercise_name, "")
  assert.equal(next.workoutSession.clarifyQuestion, "What exercise or cardio did you do?")
})

test("fragmented shared quantities apply to all unresolved foods instead of creating an 'each' item", () => {
  const { mealSession } = replayCoachConversation([
    user("i had"),
    assistant("What did you have for your meal?"),
    user("chicken"),
    assistant("How much chicken did you have?"),
    user("and rice"),
    assistant("How much rice did you have?"),
    user("about 200g each"),
  ])

  assert.ok(mealSession)
  assert.equal(mealSession.readyToLog, true)
  assert.match(String(mealSession.summary || "").toLowerCase(), /200g chicken/)
  assert.match(String(mealSession.summary || "").toLowerCase(), /200g rice/)
  assert.doesNotMatch(String(mealSession.summary || "").toLowerCase(), /\beach\b/)
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

test("coach session state normalizes inline meal quantity corrections before logging", () => {
  const next = buildCoachSessionState({
    recentMessages: [],
    currentMessage: "i had 200g chicken no wait like half a pound",
    mealSession: emptyMealSessionState(),
    workoutSession: emptyWorkoutSessionState(),
  })

  assert.ok(next.mealSession)
  assert.equal(next.workoutSession, null)
  assert.match(next.mealSession.summary.toLowerCase(), /chicken/)
  assert.doesNotMatch(next.mealSession.summary.toLowerCase(), /no wait/)
  assert.doesNotMatch(next.mealSession.summary.toLowerCase(), /like half a pound/)
  assert.match(next.mealSession.summary.toLowerCase(), /(0\.5|half).*(lb|pound).*chicken/)
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
