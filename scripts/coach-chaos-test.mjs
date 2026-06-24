import { buildCoachSessionState, emptyMealSessionState, emptyWorkoutSessionState } from "../server/coachSessionState.mjs"
import {
  buildDeterministicMealActions,
  buildDeterministicWorkoutAction,
  deterministicClarifyActionFromSession,
  replyClaimsPersistence,
  summarizeCoachAction,
  summarizeCoachActions,
} from "../server/coachLoggingRules.mjs"

function rand(list) {
  return list[Math.floor(Math.random() * list.length)]
}

function chance(value) {
  return Math.random() < value
}

function user(content) {
  return { role: "user", content }
}

function assistant(content) {
  return { role: "assistant", content }
}

function cleanText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim()
}

function responseClaimsPersistence(reply) {
  return replyClaimsPersistence(reply)
}

function buildResponseForState(message, recentMessages, mealSession, workoutSession) {
  const next = buildCoachSessionState({
    recentMessages,
    currentMessage: message,
    mealSession,
    workoutSession,
  })

  const nextMeal = next.mealSession
  const nextWorkout = next.workoutSession

  if (nextMeal?.suppressed || nextWorkout?.suppressed) {
    return {
      reply: nextMeal?.suppressionReply || nextWorkout?.suppressionReply || "Okay, I won't save that.",
      actions: [],
      mealSession: nextMeal || mealSession,
      workoutSession: nextWorkout || workoutSession,
    }
  }

  if (nextMeal?.readyToLog) {
    const actions = buildDeterministicMealActions({
      mealSession: nextMeal,
      explicitActions: [],
      prompt: message,
      allowAnswerOnly: nextMeal.answerOnly,
    })
    if (nextMeal.answerOnly && actions[0]) {
      return {
        reply: `That comes to about ${Math.round(Number(actions[0].calories) || 0)} kcal.`,
        actions: [],
        mealSession: nextMeal,
        workoutSession: nextWorkout,
      }
    }
    return {
      reply: summarizeCoachActions(actions) || summarizeCoachAction(actions[0]),
      actions,
      mealSession: nextMeal,
      workoutSession: nextWorkout,
    }
  }

  if (!nextMeal && nextWorkout?.readyToLog) {
    const action = buildDeterministicWorkoutAction({ workoutSession: nextWorkout, explicitActions: [] })
    return {
      reply: summarizeCoachAction(action),
      actions: action ? [action] : [],
      mealSession,
      workoutSession: nextWorkout,
    }
  }

  const mealClarify = deterministicClarifyActionFromSession(nextMeal)
  if (mealClarify) {
    return {
      reply: mealClarify.message,
      actions: [mealClarify],
      mealSession: nextMeal,
      workoutSession: nextWorkout,
    }
  }

  const workoutClarify = deterministicClarifyActionFromSession(nextWorkout)
  if (workoutClarify) {
    return {
      reply: workoutClarify.message,
      actions: [workoutClarify],
      mealSession: nextMeal,
      workoutSession: nextWorkout,
    }
  }

  return {
    reply: "Tell me what happened or what you want to change, and I'll help you sort the next move.",
    actions: [],
    mealSession: nextMeal,
    workoutSession: nextWorkout,
  }
}

function assertNoInvalidPersistence(result, transcript) {
  const persistedActions = result.actions.filter((action) => /^(log|update)_/.test(action?.type || ""))
  const transcriptText = cleanText(transcript.join(" "))
  for (const action of persistedActions) {
    const label = cleanText(action.food_name || action.exercise_name || action.workout_type || "")
    if (/\bserve \d+(?:\.\d+)?\b/.test(label)) throw new Error(`numeric food item persisted: ${label}`)
    if (/\b1l\b/.test(label) && !/\b1l\b/.test(transcriptText)) throw new Error(`invented 1l unit: ${label}`)
    if ((action.type === "log_workout" || action.type === "update_workout_log") && !String(action.exercise_name || action.workout_type || "").trim()) {
      throw new Error("orphan workout label persisted")
    }
  }
  if (responseClaimsPersistence(result.reply) && persistedActions.length === 0) {
    throw new Error(`reply implied persistence without action: ${result.reply}`)
  }
}

function runConversation(turns) {
  const transcript = []
  let mealSession = emptyMealSessionState()
  let workoutSession = emptyWorkoutSessionState()
  let clarificationLoops = 0
  let lastClarify = ""

  for (const turn of turns) {
    transcript.push(turn)
    const result = buildResponseForState(turn, transcript.slice(0, -1).map((content, index) => (
      index % 2 === 0 ? user(content) : assistant(content)
    )), mealSession, workoutSession)
    mealSession = result.mealSession || mealSession
    workoutSession = result.workoutSession || workoutSession
    assertNoInvalidPersistence(result, transcript)

    if (result.actions.some((action) => action?.type === "clarify")) {
      const currentClarify = cleanText(result.reply)
      clarificationLoops = currentClarify === lastClarify ? clarificationLoops + 1 : 1
      lastClarify = currentClarify
      if (clarificationLoops > 2) throw new Error(`clarification loop exceeded limit: ${result.reply}`)
    } else {
      clarificationLoops = 0
      lastClarify = ""
    }

    transcript.push(result.reply)
  }

  return { mealSession, workoutSession, transcript }
}

const foods = ["eggs", "chicken", "rice", "steak", "broccoli", "pasta", "pizza", "chips", "salad", "tofu"]
const preps = ["fried", "grilled", "boiled", "roasted", "plain", "raw"]
const additions = ["olive oil", "butter", "mayo", "gravy", "ketchup", "cheese"]
const drinks = ["coffee", "tea", "protein shake", "beer", "latte"]
const workoutExercises = ["bench press", "back squat", "row", "deadlift", "push ups", "bike", "treadmill"]

function generateMealConversation() {
  const food = rand(foods)
  const prep = rand(preps)
  const addition = rand(additions)
  const drink = rand(drinks)
  const quantity = (Math.random() * 4 + 1).toFixed(chance(0.2) ? 1 : 0)

  const templates = [
    [`i had ${food}`, `${quantity}`, `${prep} in 20g ${addition}`],
    [`${food} and ${drink}`, `${quantity} ${food}`, `250ml ${drink} no sugar`, chance(0.5) ? `cooked in 15g ${addition}` : `with ${addition}`],
    [`500g ${food} total, 300g ${prep}, the rest fried in 20g ${addition}`],
    [`don't log this`, `${food} and ${drink}`],
    [`how much protein is usually in ${quantity} serves of ${food}?`],
    [`breakfast was ${quantity} ${food}, lunch was 200g steak and 1 cup rice`],
    [`${quantity} ${food}`, `actually ${Number(quantity) + 1} ${food} not ${quantity}`],
    [`i had ${quantity} ${food} and some ${rand(["sauce", "gravy", "mayo"])}`, `actually without ${rand(["sauce", "gravy", "mayo"])}`],
    [`${food} and ${food}`, `${quantity}`, `i told you`],
    [`2 coffees total, 1 black, the rest with milk`],
  ]

  return rand(templates).filter(Boolean)
}

function generateWorkoutConversation() {
  const exercise = rand(workoutExercises)
  const weight = Math.floor(Math.random() * 80) + 20
  const reps = Math.floor(Math.random() * 8) + 5
  const sets = Math.floor(Math.random() * 4) + 2

  const templates = [
    [`i did ${exercise}`, `${sets} sets of ${reps}`, `${weight}kg`],
    [`${exercise} ${weight}kg x ${reps} x ${sets}`],
    [`${exercise}`, `${reps} reps`, `actually ${reps + 2} reps`],
    [`20 minutes ${rand(["bike", "treadmill", "rower"])}`],
    [`don't save that`, `${exercise} ${weight}kg x ${reps}`],
    [`what should i train today?`],
    [`i did ${exercise}`, `i told you`, `${reps} reps`],
  ]

  return rand(templates).filter(Boolean)
}

function generateMixedConversation() {
  const templates = [
    ["hello"],
    ["what's up"],
    ["i stuffed up today, what do i eat now?"],
    ["how much protein is in a latte?"],
    ["don't log that", "i had chips"],
    ["i had eggs", "2", "also i trained shoulders", "bench press 60kg x 8 x 3"],
    ["same as yesterday"],
    ["the rest fried", "with oil"],
    ["blue", "what do you mean?"],
    ["haha fair enough", "plan my week"],
  ]
  return rand(templates).filter(Boolean)
}

function runBatch(label, count, generator) {
  for (let index = 0; index < count; index += 1) {
    const turns = generator()
    runConversation(turns)
  }
  return { label, count }
}

const results = [
  runBatch("meal", 300, generateMealConversation),
  runBatch("workout", 150, generateWorkoutConversation),
  runBatch("mixed", 100, generateMixedConversation),
]

console.log(JSON.stringify({ ok: true, results }, null, 2))
