import {
  buildDeterministicMealAction,
  buildDeterministicWorkoutAction,
  deterministicAlreadyLoggedReply,
  deterministicClarifyActionFromSession,
  isMealPersistenceAction,
  isPersistenceAction,
  isWorkoutPersistenceAction,
  normalizeAction,
  normalizeMealAction,
  replyClaimsPersistence,
  safeArray,
  shouldAllowAction,
  summarizeCoachAction,
} from "./coachLoggingRules.mjs"

function extractImplicitActions(value) {
  const directAction = normalizeAction(value?.action)
  if (directAction) return [directAction]

  const typedRoot = normalizeAction(value)
  if (typedRoot) return [typedRoot]

  const implicitTypes = [
    "clarify",
    "log_workout",
    "update_workout_log",
    "log_meal",
    "update_meal_log",
    "create_workout_plan",
    "create_meal_plan",
    "update_targets",
    "none",
  ]

  return implicitTypes
    .filter((type) => value?.[type] && typeof value[type] === "object")
    .map((type) => ({ type, ...value[type] }))
}

export function normalizeCoachResponse(value, context = {}) {
  if (!value || typeof value !== "object") {
    throw new Error("OpenAI returned an invalid coach payload")
  }

  const explicitActions = [
    ...safeArray(value.actions, 8),
    ...extractImplicitActions(value),
  ]
    .map(normalizeAction)
    .filter(Boolean)

  const mealClarifyAction = deterministicClarifyActionFromSession(context.mealContext)
  const workoutClarifyAction = deterministicClarifyActionFromSession(context.workoutContext)
  const deterministicMealAction = buildDeterministicMealAction({
    mealSession: context.mealContext,
    explicitActions,
    reply: value.reply,
    prompt: context.prompt,
  })
  const deterministicWorkoutAction = buildDeterministicWorkoutAction({
    workoutSession: context.workoutContext,
    explicitActions,
  })

  const filteredExplicitActions = explicitActions.filter((action) => {
    if (deterministicMealAction && isMealPersistenceAction(action)) return false
    if (deterministicWorkoutAction && isWorkoutPersistenceAction(action)) return false
    if (context.mealContext?.readyToLog && action?.type === "clarify") return false
    if (context.workoutContext?.readyToLog && action?.type === "clarify") return false
    if (context.mealContext?.alreadyLogged && isMealPersistenceAction(action)) return false
    if (context.workoutContext?.alreadyLogged && isWorkoutPersistenceAction(action)) return false
    return true
  })

  let actions = []
  let forcedReply = ""

  if (context.mealContext?.alreadyLogged) {
    forcedReply = deterministicAlreadyLoggedReply(context.mealContext, "meal")
  } else if (context.workoutContext?.alreadyLogged) {
    forcedReply = deterministicAlreadyLoggedReply(context.workoutContext, "workout")
  } else if (mealClarifyAction) {
    actions = [mealClarifyAction]
    forcedReply = mealClarifyAction.message
  } else if (workoutClarifyAction) {
    actions = [workoutClarifyAction]
    forcedReply = workoutClarifyAction.message
  } else {
    actions = [
      ...(deterministicMealAction ? [deterministicMealAction] : []),
      ...(deterministicWorkoutAction ? [deterministicWorkoutAction] : []),
      ...filteredExplicitActions,
    ]
      .map(normalizeMealAction)
      .filter(shouldAllowAction)
      .slice(0, 8)
  }

  const originalReply =
    typeof value.reply === "string" && value.reply.trim() ? value.reply.trim() : ""
  const hasPersistenceAction = actions.some(isPersistenceAction)
  const alreadyLoggedReply =
    Boolean(context.mealContext?.alreadyLogged)
    || Boolean(context.workoutContext?.alreadyLogged)
  let reply =
    forcedReply ||
    originalReply ||
    summarizeCoachAction(actions[0]) ||
    "I'm here. Tell me what you want to log or plan next."

  if (replyClaimsPersistence(reply) && !hasPersistenceAction && !alreadyLoggedReply) {
    reply = "I have the details, but I couldn't save it just now."
  }

  if (context.persistenceAttempted && context.persistenceSucceeded === false) {
    reply = "I have the details, but I couldn't save it just now."
  }

  return {
    reply,
    actions,
    warnings: safeArray(value.warnings, 6).filter((warning) => typeof warning === "string"),
  }
}
