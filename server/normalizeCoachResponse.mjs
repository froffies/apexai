import {
  buildDeterministicMealDeletionAction,
  buildDeterministicMealActions,
  buildDeterministicWorkoutActions,
  buildDeterministicWorkoutDeletionAction,
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
  summarizeCoachActions,
} from "./coachLoggingRules.mjs"

function cleanReplyText(value = "") {
  return String(value || "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim()
}

function escapeRegex(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function tokenVariants(value = "") {
  const normalized = cleanReplyText(value)
  if (!normalized) return []
  return [...new Set([
    normalized,
    normalized.endsWith("s") ? normalized.slice(0, -1) : `${normalized}s`,
  ].filter(Boolean))]
}

function replyAddressesMealQuantityClarification(reply = "", mealContext = null) {
  if (String(mealContext?.pendingClarification?.type || "") !== "quantity") return false
  const normalizedReply = cleanReplyText(reply)
  if (!/\bhow\s+(?:much|many)\b/.test(normalizedReply)) return false
  const targetTokens = [
    ...tokenVariants(mealContext?.pendingClarification?.targetLabel || ""),
    ...tokenVariants(mealContext?.pendingClarification?.targetBaseName || ""),
    ...tokenVariants(mealContext?.pendingClarification?.targetReference || ""),
  ]
  return targetTokens.some((token) => (
    token
    && new RegExp(`\\bhow\\s+(?:much|many)\\b[^?.!]{0,60}\\b${escapeRegex(token)}\\b`, "i").test(normalizedReply)
  ))
}

function replyAddressesWorkoutClarification(reply = "", workoutContext = null) {
  if (!String(workoutContext?.clarifyQuestion || "").trim()) return false
  const normalizedReply = cleanReplyText(reply)
  if (!/\b(?:how\s+many|what|which)\b/.test(normalizedReply)) return false
  const targetTokens = [
    ...tokenVariants(workoutContext?.exercise_name || ""),
    ...tokenVariants(workoutContext?.workout_type || ""),
  ]
  return targetTokens.some((token) => token && normalizedReply.includes(token))
}

function replyAcknowledgesWorkoutCompletion(reply = "", workoutContext = null) {
  if (!workoutContext?.readyToLog) return false
  if (replyAddressesWorkoutClarification(reply, workoutContext)) return false
  const normalizedReply = cleanReplyText(reply)
  if (!normalizedReply) return false

  const targetTokens = [
    ...tokenVariants(workoutContext?.exercise_name || ""),
    ...tokenVariants(workoutContext?.workout_type || ""),
  ]
  const mentionsWorkout = targetTokens.some((token) => token && new RegExp(`\\b${escapeRegex(token)}\\b`, "i").test(normalizedReply))
  if (!mentionsWorkout) return false

  const repText = Number.isFinite(Number(workoutContext?.reps)) && Number(workoutContext.reps) > 0
    ? String(Number(workoutContext.reps))
    : ""
  const setText = Number.isFinite(Number(workoutContext?.sets)) && Number(workoutContext.sets) > 0
    ? String(Number(workoutContext.sets))
    : ""
  const mentionsMetrics = Boolean(
    (repText && new RegExp(`\\b${escapeRegex(repText)}\\b`, "i").test(normalizedReply))
    || (setText && new RegExp(`\\b${escapeRegex(setText)}\\s+set`, "i").test(normalizedReply))
    || /\b(?:great work|nice work|well done|done|you did)\b/i.test(normalizedReply)
  )

  return mentionsMetrics
}

function actionDedupeKey(action = {}) {
  const type = String(action?.type || "").trim()
  if (!type) return ""
  if (type === "clarify") return `clarify:${String(action?.message || "").trim().toLowerCase()}`
  if (type === "log_meal" || type === "update_meal_log" || type === "delete_meal_log") {
    return [
      type,
      String(action?.meal_id || "").trim(),
      String(action?.food_name || "").trim().toLowerCase(),
      String(action?.quantity || "").trim().toLowerCase(),
      Number(action?.calories || 0),
      Number(action?.protein_g || 0),
      Number(action?.carbs_g || 0),
      Number(action?.fat_g || 0),
    ].join(":")
  }
  if (type === "log_workout" || type === "update_workout_log" || type === "delete_workout_log") {
    return [
      type,
      String(action?.workout_id || "").trim(),
      String(action?.exercise_name || action?.workout_type || "").trim().toLowerCase(),
      Number(action?.sets || 0),
      Number(action?.reps || 0),
      Number(action?.weight_kg || 0),
      Number(action?.duration_seconds || 0),
      Number(action?.distance_km || 0),
    ].join(":")
  }
  return `${type}:${JSON.stringify(action)}`
}

function extractImplicitActions(value) {
  const directAction = normalizeAction(value?.action)
  if (directAction) return [directAction]

  const typedRoot = normalizeAction(value)
  if (typedRoot) return [typedRoot]

  const implicitTypes = [
    "clarify",
    "log_workout",
    "update_workout_log",
    "delete_workout_log",
    "log_meal",
    "update_meal_log",
    "delete_meal_log",
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

  const preferAIFirst = Boolean(context.preferAIFirst)
  const explicitActions = [
    ...safeArray(value.actions, 8),
    ...extractImplicitActions(value),
  ]
    .map(normalizeAction)
    .filter(Boolean)

  const mealClarifyAction = deterministicClarifyActionFromSession(context.mealContext)
  const workoutClarifyAction = deterministicClarifyActionFromSession(context.workoutContext)
  const deterministicMealActionsRaw = buildDeterministicMealActions({
    mealSession: context.mealContext,
    explicitActions,
    prompt: context.prompt,
  })
  const deterministicMealDeleteAction = buildDeterministicMealDeletionAction(context.mealContext)
  const deterministicWorkoutDeleteAction = buildDeterministicWorkoutDeletionAction(context.workoutContext)
  const deterministicWorkoutActionsRaw = buildDeterministicWorkoutActions({
    workoutSession: context.workoutContext,
    explicitActions,
  })
  const candidatePersistenceActionsInput = safeArray(context.candidatePersistenceActions, 8).map(normalizeAction).filter(Boolean)
  const validatedActions = safeArray(context.validatedActions, 8).map(normalizeAction).filter(Boolean)
  const responseHints = context.responseHints || {}
  const hintAlreadyLoggedMeal = responseHints.already_logged?.meal || null
  const hintAlreadyLoggedWorkout = responseHints.already_logged?.workout || null
  const hintMealClarify = String(responseHints.clarify_hints?.meal || "").trim()
  const hintWorkoutClarify = String(responseHints.clarify_hints?.workout || "").trim()
  const hintMealSuppression = String(responseHints.suppression_hint?.meal || "").trim()
  const hintWorkoutSuppression = String(responseHints.suppression_hint?.workout || "").trim()
  const hasValidatedMealPersistence = validatedActions.some(isMealPersistenceAction)
  const hasValidatedWorkoutPersistence = validatedActions.some(isWorkoutPersistenceAction)
  const hasValidatedMealDelete = validatedActions.some((action) => action?.type === "delete_meal_log")
  const hasValidatedWorkoutDelete = validatedActions.some((action) => action?.type === "delete_workout_log")
  const candidatePersistenceActions = candidatePersistenceActionsInput.length
    ? candidatePersistenceActionsInput
    : [
        ...deterministicMealActionsRaw,
        ...deterministicWorkoutActionsRaw,
      ]
  const candidateMealPersistenceActions = candidatePersistenceActions.filter(isMealPersistenceAction)
  const candidateWorkoutPersistenceActions = candidatePersistenceActions.filter(isWorkoutPersistenceAction)
  const aiRequestedMealPersistence = explicitActions.some(isMealPersistenceAction)
  const aiRequestedWorkoutPersistence = explicitActions.some(isWorkoutPersistenceAction)
  const deterministicMealActions = hasValidatedMealPersistence
    ? []
    : (preferAIFirst
      ? (aiRequestedMealPersistence ? candidateMealPersistenceActions : [])
      : candidateMealPersistenceActions)
  const deterministicWorkoutActions = hasValidatedWorkoutPersistence
    ? []
    : (preferAIFirst
      ? (aiRequestedWorkoutPersistence ? candidateWorkoutPersistenceActions : [])
      : candidateWorkoutPersistenceActions)
  const mealHasPendingWork = Boolean(
    context.mealContext
    && !context.mealContext.alreadyLogged
    && (
      context.mealContext.deleteRequested
      || context.mealContext.suppressed
      || context.mealContext.readyToLog
      || context.mealContext.clarifyQuestion
      || context.mealContext.correctionRequested
    )
  )
  const workoutHasPendingWork = Boolean(
    context.workoutContext
    && !context.workoutContext.alreadyLogged
    && (
      context.workoutContext.deleteRequested
      || context.workoutContext.suppressed
      || context.workoutContext.readyToLog
      || context.workoutContext.clarifyQuestion
      || context.workoutContext.correctionRequested
    )
  )

  const filteredExplicitActions = explicitActions.filter((action) => {
    if ((deterministicMealActions.length || deterministicMealDeleteAction || hasValidatedMealDelete || hasValidatedMealPersistence) && isMealPersistenceAction(action)) return false
    if ((deterministicWorkoutActions.length || deterministicWorkoutDeleteAction || hasValidatedWorkoutDelete || hasValidatedWorkoutPersistence) && isWorkoutPersistenceAction(action)) return false
    if (preferAIFirst && isMealPersistenceAction(action) && !hasValidatedMealPersistence && !candidateMealPersistenceActions.length) return false
    if (preferAIFirst && isWorkoutPersistenceAction(action) && !hasValidatedWorkoutPersistence && !candidateWorkoutPersistenceActions.length) return false
    if (context.mealContext?.readyToLog && action?.type === "clarify") return false
    if (context.workoutContext?.readyToLog && action?.type === "clarify") return false
    if (context.mealContext?.alreadyLogged && isMealPersistenceAction(action)) return false
    if (context.workoutContext?.alreadyLogged && isWorkoutPersistenceAction(action)) return false
    if (
      isMealPersistenceAction(action)
      && !hasValidatedMealPersistence
      && context.mealContext?.clarifyQuestion
      && !context.mealContext?.readyToLog
      && !context.mealContext?.answerOnly
    ) return false
    if (
      isMealPersistenceAction(action)
      && !hasValidatedMealPersistence
      && context.mealContext?.persistedMealId
      && context.mealContext?.pendingClarification
      && context.workoutContext?.readyToLog
      && !context.mealContext?.correctionRequested
      && !context.mealContext?.deleteRequested
    ) return false
    if (
      isWorkoutPersistenceAction(action)
      && !hasValidatedWorkoutPersistence
      && context.workoutContext?.persistedWorkoutId
      && !context.workoutContext?.readyToLog
      && !context.workoutContext?.correctionRequested
      && !context.workoutContext?.deleteRequested
    ) return false
    return true
  })

  const explicitMealPersistenceAction = filteredExplicitActions.find(isMealPersistenceAction)
  const explicitWorkoutPersistenceAction = filteredExplicitActions.find(isWorkoutPersistenceAction)
  const deterministicClarifyActions = preferAIFirst
    ? []
    : [
        ...(!deterministicMealActions.length && !explicitMealPersistenceAction && !hasValidatedMealPersistence && mealClarifyAction ? [mealClarifyAction] : []),
        ...(!deterministicWorkoutActions.length && !explicitWorkoutPersistenceAction && !hasValidatedWorkoutPersistence && workoutClarifyAction ? [workoutClarifyAction] : []),
      ]

  let actions = []
  const deterministicDeleteActions = [
    ...(hasValidatedMealDelete || !deterministicMealDeleteAction ? [] : [deterministicMealDeleteAction]),
    ...(hasValidatedWorkoutDelete || !deterministicWorkoutDeleteAction ? [] : [deterministicWorkoutDeleteAction]),
  ]

  actions = [
    ...validatedActions,
    ...deterministicDeleteActions,
    ...deterministicMealActions,
    ...deterministicWorkoutActions,
    ...deterministicClarifyActions,
    ...filteredExplicitActions,
  ]
    .map(normalizeMealAction)
    .filter(shouldAllowAction)
    .slice(0, 8)

  const seenActionKeys = new Set()
  const seenClarifyMessages = new Set()
  actions = actions.filter((action) => {
    const key = actionDedupeKey(action)
    if (key && seenActionKeys.has(key)) return false
    if (key) seenActionKeys.add(key)
    if (action?.type !== "clarify") return true
    const message = String(action?.message || "").trim().toLowerCase()
    if (!message) {
      return !actions.some((candidate) => candidate?.type === "clarify" && String(candidate?.message || "").trim())
    }
    if (seenClarifyMessages.has(message)) return false
    seenClarifyMessages.add(message)
    return true
  })

  const originalReply =
    typeof value.reply === "string" && value.reply.trim() ? value.reply.trim() : ""
  const singleCandidatePersistenceAction = candidatePersistenceActions.length === 1
    ? normalizeMealAction(candidatePersistenceActions[0])
    : null
  if (
    preferAIFirst
    && originalReply
    && replyClaimsPersistence(originalReply)
    && !actions.some(isPersistenceAction)
    && singleCandidatePersistenceAction
  ) {
    actions = [
      ...actions,
      singleCandidatePersistenceAction,
    ]
      .map(normalizeMealAction)
      .filter(shouldAllowAction)
      .slice(0, 8)
  }
  const shouldRecoverSingleWorkoutActionDuringMealClarification = Boolean(
    preferAIFirst
    && originalReply
    && !actions.some(isPersistenceAction)
    && !hasValidatedWorkoutPersistence
    && singleCandidatePersistenceAction
    && isWorkoutPersistenceAction(singleCandidatePersistenceAction)
    && context.workoutContext?.readyToLog
    && String(context.mealContext?.pendingClarification?.type || "") === "quantity"
    && replyAddressesMealQuantityClarification(originalReply, context.mealContext)
    && replyAcknowledgesWorkoutCompletion(originalReply, context.workoutContext)
  )
  if (shouldRecoverSingleWorkoutActionDuringMealClarification) {
    actions = [
      ...actions,
      singleCandidatePersistenceAction,
    ]
      .map(normalizeMealAction)
      .filter(shouldAllowAction)
      .slice(0, 8)
  }
  const hasPersistenceAction = actions.some(isPersistenceAction)
  const alreadyLoggedReply =
    Boolean(context.mealContext?.alreadyLogged)
    || Boolean(context.workoutContext?.alreadyLogged)
  const fallbackReply =
    (context.mealContext?.alreadyLogged && !workoutHasPendingWork
      ? (hintAlreadyLoggedMeal?.reply_hint || deterministicAlreadyLoggedReply(context.mealContext, "meal"))
      : "")
    || (context.workoutContext?.alreadyLogged && !mealHasPendingWork
      ? (hintAlreadyLoggedWorkout?.reply_hint || deterministicAlreadyLoggedReply(context.workoutContext, "workout"))
      : "")
    || (hintMealSuppression || hintWorkoutSuppression)
    || hintMealClarify
    || hintWorkoutClarify
    || summarizeCoachAction(deterministicDeleteActions[0])
  let reply =
    originalReply ||
    fallbackReply ||
    summarizeCoachActions(actions) ||
    summarizeCoachAction(actions[0]) ||
    "Tell me what happened or what you want to change, and I'll help you sort the next move."

  const hasMealPersistenceAction = actions.some(isMealPersistenceAction)
  const hasWorkoutPersistenceAction = actions.some(isWorkoutPersistenceAction)
  const shouldGuardPendingMealQuantityReply = Boolean(
    preferAIFirst
    && hintMealClarify
    && String(context.mealContext?.pendingClarification?.type || "") === "quantity"
    && !hasMealPersistenceAction
    && !hasValidatedMealPersistence
  )
  if (
    shouldGuardPendingMealQuantityReply
    && !replyAddressesMealQuantityClarification(reply, context.mealContext)
  ) {
    const clarifyParts = [hintMealClarify]
    if (
      hintWorkoutClarify
      && !hasWorkoutPersistenceAction
      && !hasValidatedWorkoutPersistence
      && !replyAddressesWorkoutClarification(reply, context.workoutContext)
    ) {
      clarifyParts.push(hintWorkoutClarify)
    }
    reply = clarifyParts.join(" ").trim() || reply
  }

  if (replyClaimsPersistence(reply) && !hasPersistenceAction && !alreadyLoggedReply) {
    reply = context.nutritionStatusReply || "I have the details, but I couldn't save it just now."
  }

  if (context.persistenceAttempted && context.persistenceSucceeded === false) {
    reply = "I have the details, but I couldn't save it just now."
  }

  if (
    /^i have the details, but i couldn't save it just now\.$/i.test(reply)
    && actions.length
    && !(context.persistenceAttempted && context.persistenceSucceeded === false)
  ) {
    reply = actions.map((action) => summarizeCoachAction(action)).filter(Boolean).join(" ")
      || summarizeCoachActions(actions)
      || summarizeCoachAction(actions[0])
      || reply
  }

  return {
    reply,
    actions,
    warnings: safeArray(value.warnings, 6).filter((warning) => typeof warning === "string"),
  }
}
