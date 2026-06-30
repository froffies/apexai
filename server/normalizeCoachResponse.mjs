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
import { buildRecalledCoachReply, looksLikeCoachMemoryReference } from "../src/lib/coachConversationMemory.js"
import { cleanText, escapeRegex } from "./utils.mjs"

function cleanReplyText(value = "") {
  return cleanText(value)
}

function isGenericCoachFallbackReply(reply = "") {
  const normalized = cleanReplyText(reply)
  if (!normalized) return true
  return normalized === "tell me what happened today, what you ate, what you trained, or what you want to change, and i'll help you sort the next move."
    || normalized === "hey. tell me what happened today, what you ate, what you trained, or what you want to change, and i'll help you sort the next move."
    || normalized === "give me a bit more detail on the meal, training, or goal you're working with, and i'll help you map the next step."
}


function isNutritionQuestionWithQuantity(userMessage = "") {
  const normalized = String(userMessage || "").toLowerCase().replace(/['']/g, "'").replace(/\s+/g, " ").trim()
  if (!normalized) return false
  const nutritionQuestionPattern = /\b(?:how\s+(?:many|much)|what(?:'s|\s+is|\s+are)\s+the?|calories\s+in|macros?\s+(?:in|for|of)|nutrition\s+(?:in|for|of)|protein\s+in|carbs?\s+in|fat\s+in)\b/i
  if (!nutritionQuestionPattern.test(normalized)) return false
  return /\b\d+\s*(?:g|kg|ml|l|oz|lb|cal|kcal|kj|gram|grams|serving|serves?|cup|tbsp|tsp|piece|slice)\b/i.test(normalized)
    || /\b(?:per\s+(?:100g|gram|serve|serving|cup))\b/i.test(normalized)
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
  if (!/\b(?:how\s+(?:much|many)|(?:i(?:'m| am)\s+asking|tell me|i still need to know)\s+how\s+(?:much|many))\b/.test(normalizedReply)) {
    return false
  }
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

function replyAddressesMealClarification(reply = "", mealContext = null, clarifyHint = "") {
  if (!mealContext?.pendingClarification && !mealContext?.clarifyQuestion) return false
  if (replyAddressesMealQuantityClarification(reply, mealContext)) return true

  const normalizedReply = cleanReplyText(reply)
  if (!normalizedReply || !/\b(?:how|what|which|can you|could you)\b/.test(normalizedReply)) return false

  const targetTokens = [
    ...tokenVariants(mealContext?.pendingClarification?.targetLabel || ""),
    ...tokenVariants(mealContext?.pendingClarification?.targetBaseName || ""),
    ...tokenVariants(mealContext?.pendingClarification?.targetReference || ""),
  ].filter(Boolean)
  const mentionsTarget = targetTokens.some((token) => new RegExp(`\\b${escapeRegex(token)}\\b`, "i").test(normalizedReply))
  if (!mentionsTarget) return false

  if (String(mealContext?.pendingClarification?.type || "") === "ingredient") {
    return /\bcooked in\b|\bwith\b/.test(normalizedReply)
      || cleanReplyText(clarifyHint).includes("cooked in")
  }

  return true
}

function replyAddressesWorkoutClarification(reply = "", workoutContext = null) {
  if (!String(workoutContext?.clarifyQuestion || "").trim()) return false
  const normalizedReply = cleanReplyText(reply)
  if (!/\b(?:how\s+many|what|which|can you|could you)\b/.test(normalizedReply)) return false
  const normalizedHint = cleanReplyText(workoutContext?.clarifyQuestion || "")
  if (normalizedHint.includes("rep") && (/\breps?\b/.test(normalizedReply) || /\beach set\b/.test(normalizedReply))) {
    return true
  }
  if (normalizedHint.includes("set") && /\bsets?\b/.test(normalizedReply)) {
    return true
  }
  if ((normalizedHint.includes("kg") || normalizedHint.includes("weight")) && (/\bkg\b/.test(normalizedReply) || /\bweight\b/.test(normalizedReply))) {
    return true
  }
  const targetTokens = [
    ...tokenVariants(workoutContext?.exercise_name || ""),
    ...tokenVariants(workoutContext?.workout_type || ""),
  ]
  return targetTokens.some((token) => token && normalizedReply.includes(token))
}

function replyMentionsWorkoutPersistence(reply = "") {
  const normalizedReply = cleanReplyText(reply)
  if (!normalizedReply || !replyClaimsPersistence(reply)) return false
  return /\b(?:workout|pushup|pushups|chinup|chinups|pullup|pullups|bench|squat|deadlift|row|run|running|marathon|rep|reps|set|sets)\b/.test(normalizedReply)
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

function buildClarifyRecoveryAction(session, hint = "") {
  const deterministicAction = deterministicClarifyActionFromSession(session)
  if (deterministicAction) return deterministicAction
  const message = String(hint || "").trim()
  if (!message) return null
  return {
    type: "clarify",
    message,
  }
}

function normalizeComparableText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function valuesComparable(a = "", b = "") {
  const left = normalizeComparableText(a)
  const right = normalizeComparableText(b)
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

function findMatchingCanonicalPersistenceAction(action = {}, candidates = []) {
  const normalizedCandidates = safeArray(candidates, 8).map(normalizeMealAction).filter(Boolean)
  if (!normalizedCandidates.length) return null
  if (normalizedCandidates.length === 1) return normalizedCandidates[0]

  if (isMealPersistenceAction(action)) {
    const mealId = String(action?.meal_id || "").trim()
    const foodName = String(action?.food_name || "").trim()
    const mealType = String(action?.meal_type || "").trim()
    return normalizedCandidates.find((candidate) => (
      (mealId && String(candidate?.meal_id || "").trim() === mealId)
      || (foodName && valuesComparable(candidate?.food_name, foodName))
      || (mealType && valuesComparable(candidate?.meal_type, mealType))
    )) || null
  }

  if (isWorkoutPersistenceAction(action)) {
    const workoutId = String(action?.workout_id || "").trim()
    const exerciseName = String(action?.exercise_name || action?.workout_type || "").trim()
    return normalizedCandidates.find((candidate) => (
      (workoutId && String(candidate?.workout_id || "").trim() === workoutId)
      || (exerciseName && valuesComparable(candidate?.exercise_name || candidate?.workout_type, exerciseName))
    )) || null
  }

  return null
}

function canonicalizeExplicitPersistenceAction(action = {}, {
  strictAIFirst = false,
  canonicalMealPersistenceActions = [],
  canonicalWorkoutPersistenceActions = [],
} = {}) {
  if (!strictAIFirst || !isPersistenceAction(action)) return action
  if (isMealPersistenceAction(action)) {
    return findMatchingCanonicalPersistenceAction(action, canonicalMealPersistenceActions) || action
  }
  if (isWorkoutPersistenceAction(action)) {
    return findMatchingCanonicalPersistenceAction(action, canonicalWorkoutPersistenceActions) || action
  }
  return action
}

export function normalizeCoachResponse(value, context = {}) {
  if (!value || typeof value !== "object") {
    throw new Error("OpenAI returned an invalid coach payload")
  }

  const preferAIFirst = Boolean(context.preferAIFirst)
  const strictAIFirst = Boolean(context.strictAIFirst)
  const explicitActions = [
    ...safeArray(value.actions, 8),
    ...extractImplicitActions(value),
  ]
    .map(normalizeAction)
    .filter(Boolean)

  const mealClarifyAction = strictAIFirst ? null : deterministicClarifyActionFromSession(context.mealContext)
  const workoutClarifyAction = strictAIFirst ? null : deterministicClarifyActionFromSession(context.workoutContext)
  const deterministicMealActionsRaw = strictAIFirst
    ? []
    : buildDeterministicMealActions({
        mealSession: context.mealContext,
        explicitActions,
        prompt: context.prompt,
      })
  const deterministicMealDeleteAction = strictAIFirst ? null : buildDeterministicMealDeletionAction(context.mealContext)
  const deterministicWorkoutDeleteAction = strictAIFirst ? null : buildDeterministicWorkoutDeletionAction(context.workoutContext)
  const deterministicWorkoutActionsRaw = strictAIFirst
    ? []
    : buildDeterministicWorkoutActions({
        workoutSession: context.workoutContext,
        explicitActions,
      })
  const validationMealActionsRaw = buildDeterministicMealActions({
    mealSession: context.mealContext,
    explicitActions: [],
    prompt: context.prompt,
  })
  const validationWorkoutActionsRaw = buildDeterministicWorkoutActions({
    workoutSession: context.workoutContext,
    explicitActions: [],
  })
  const canonicalPersistenceActionsInput = safeArray(
    context.canonicalPersistenceActions ?? context.candidatePersistenceActions,
    8
  ).map(normalizeAction).filter(Boolean)
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
  const candidatePersistenceActions = canonicalPersistenceActionsInput.length
    ? canonicalPersistenceActionsInput
    : (strictAIFirst
      ? []
      : [
          ...deterministicMealActionsRaw,
          ...deterministicWorkoutActionsRaw,
        ])
  const validationMealPersistenceActions = validationMealActionsRaw
    .map(normalizeAction)
    .filter(Boolean)
    .filter(isMealPersistenceAction)
  const validationWorkoutPersistenceActions = validationWorkoutActionsRaw
    .map(normalizeAction)
    .filter(Boolean)
    .filter(isWorkoutPersistenceAction)
  const candidateMealPersistenceActions = candidatePersistenceActions.filter(isMealPersistenceAction)
  const candidateWorkoutPersistenceActions = candidatePersistenceActions.filter(isWorkoutPersistenceAction)
  const canonicalMealPersistenceActions = candidateMealPersistenceActions.length
    ? candidateMealPersistenceActions
    : (strictAIFirst ? validationMealPersistenceActions : [])
  const canonicalWorkoutPersistenceActions = candidateWorkoutPersistenceActions.length
    ? candidateWorkoutPersistenceActions
    : (strictAIFirst ? validationWorkoutPersistenceActions : [])
  const aiRequestedMealPersistence = explicitActions.some(isMealPersistenceAction)
  const aiRequestedWorkoutPersistence = explicitActions.some(isWorkoutPersistenceAction)
  const deterministicMealActions = strictAIFirst
    ? []
    : (hasValidatedMealPersistence
      ? []
      : (preferAIFirst
        ? (aiRequestedMealPersistence ? canonicalMealPersistenceActions : [])
        : candidateMealPersistenceActions))
  const deterministicWorkoutActions = strictAIFirst
    ? []
    : (hasValidatedWorkoutPersistence
      ? []
      : (preferAIFirst
        ? (aiRequestedWorkoutPersistence ? canonicalWorkoutPersistenceActions : [])
        : candidateWorkoutPersistenceActions))
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
  const isAnswerOnlyMealTurn = Boolean(
    context.mealContext
    && (context.mealContext.answerOnly || context.mealContext.wantsNutrition)
    && !context.mealContext.wantsLogging
  )

  const filteredExplicitActions = explicitActions.filter((action) => {
    if ((deterministicMealActions.length || deterministicMealDeleteAction || hasValidatedMealDelete || hasValidatedMealPersistence) && isMealPersistenceAction(action)) return false
    if ((deterministicWorkoutActions.length || deterministicWorkoutDeleteAction || hasValidatedWorkoutDelete || hasValidatedWorkoutPersistence) && isWorkoutPersistenceAction(action)) return false
    if (strictAIFirst && isAnswerOnlyMealTurn && isMealPersistenceAction(action)) return false
    if (
      strictAIFirst
      && isMealPersistenceAction(action)
      && (
        String(context.mealContext?.pendingClarification?.type || "") !== ""
        || (context.mealContext?.clarifyQuestion && !context.mealContext?.readyToLog)
        || (context.mealContext?.persistedMealId && !context.mealContext?.correctionRequested && !context.mealContext?.deleteRequested)
      )
    ) return false
    if (
      strictAIFirst
      && isWorkoutPersistenceAction(action)
      && (
        (context.workoutContext?.clarifyQuestion && !context.workoutContext?.readyToLog)
        || (context.workoutContext?.persistedWorkoutId && !context.workoutContext?.correctionRequested && !context.workoutContext?.deleteRequested)
      )
    ) return false
    if (!strictAIFirst && preferAIFirst && isMealPersistenceAction(action) && !hasValidatedMealPersistence && !candidateMealPersistenceActions.length) return false
    if (!strictAIFirst && preferAIFirst && isWorkoutPersistenceAction(action) && !hasValidatedWorkoutPersistence && !candidateWorkoutPersistenceActions.length) return false
    if (context.mealContext?.readyToLog && action?.type === "clarify") return false
    if (context.workoutContext?.readyToLog && action?.type === "clarify") return false
    if (context.mealContext?.alreadyLogged && isMealPersistenceAction(action)) return false
    if (context.workoutContext?.alreadyLogged && isWorkoutPersistenceAction(action)) return false
    if (context.mealContext?.suppressed && isMealPersistenceAction(action)) return false
    if (context.workoutContext?.suppressed && isWorkoutPersistenceAction(action)) return false
    // Block update_targets when the user message is a nutrition question with a quantity.
    // The AI misreads the quantity (e.g. "100g") as a target value to set.
    if (action?.type === "update_targets" && isNutritionQuestionWithQuantity(context.prompt || "")) return false
    if (
      !strictAIFirst
      && isMealPersistenceAction(action)
      && !hasValidatedMealPersistence
      && context.mealContext?.clarifyQuestion
      && !context.mealContext?.readyToLog
      && !context.mealContext?.answerOnly
    ) return false
    if (
      !strictAIFirst
      && isMealPersistenceAction(action)
      && !hasValidatedMealPersistence
      && context.mealContext?.persistedMealId
      && context.mealContext?.pendingClarification
      && context.workoutContext?.readyToLog
      && !context.mealContext?.correctionRequested
      && !context.mealContext?.deleteRequested
    ) return false
    if (
      !strictAIFirst
      && isWorkoutPersistenceAction(action)
      && !hasValidatedWorkoutPersistence
      && context.workoutContext?.persistedWorkoutId
      && !context.workoutContext?.readyToLog
      && !context.workoutContext?.correctionRequested
      && !context.workoutContext?.deleteRequested
    ) return false
    return true
  })
  const resolvedExplicitActions = filteredExplicitActions.map((action) => canonicalizeExplicitPersistenceAction(action, {
    strictAIFirst,
    canonicalMealPersistenceActions,
    canonicalWorkoutPersistenceActions,
  }))
  const explicitMealTypes = new Set(
    resolvedExplicitActions
      .filter(isMealPersistenceAction)
      .map((action) => String(action?.meal_type || "").trim().toLowerCase())
      .filter(Boolean)
  )
  const explicitMealActionsWithoutType = resolvedExplicitActions.filter(
    (action) => isMealPersistenceAction(action) && !String(action?.meal_type || "").trim()
  )
  const missingCanonicalMealActions = explicitMealTypes.size
    ? canonicalMealPersistenceActions.filter((action) => {
        const mealType = String(action?.meal_type || "").trim().toLowerCase()
        return mealType && !explicitMealTypes.has(mealType)
      })
    : explicitMealActionsWithoutType.length && canonicalMealPersistenceActions.length > 1
      ? canonicalMealPersistenceActions.slice(1)
      : []
  const resolvedActionsWithRecovery = [
    ...resolvedExplicitActions,
    ...missingCanonicalMealActions,
  ]

  const explicitMealPersistenceAction = filteredExplicitActions.find(isMealPersistenceAction)
  const explicitWorkoutPersistenceAction = filteredExplicitActions.find(isWorkoutPersistenceAction)
  const deterministicClarifyActions = (preferAIFirst || strictAIFirst)
    ? []
    : [
        ...(!deterministicMealActions.length && !explicitMealPersistenceAction && !hasValidatedMealPersistence && mealClarifyAction ? [mealClarifyAction] : []),
        ...(!deterministicWorkoutActions.length && !explicitWorkoutPersistenceAction && !hasValidatedWorkoutPersistence && workoutClarifyAction ? [workoutClarifyAction] : []),
      ]

  let actions = []
  const deterministicDeleteActions = strictAIFirst
    ? []
    : [
        ...(hasValidatedMealDelete || !deterministicMealDeleteAction ? [] : [deterministicMealDeleteAction]),
        ...(hasValidatedWorkoutDelete || !deterministicWorkoutDeleteAction ? [] : [deterministicWorkoutDeleteAction]),
      ]

  actions = [
    ...validatedActions,
    ...deterministicDeleteActions,
    ...deterministicMealActions,
    ...deterministicWorkoutActions,
    ...deterministicClarifyActions,
    ...resolvedActionsWithRecovery,
  ]
    .map(normalizeMealAction)
    .filter((action) => !(strictAIFirst && isAnswerOnlyMealTurn && isMealPersistenceAction(action)))
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
  const normalizedOriginalReply = cleanReplyText(originalReply)
  const replyLooksQuestionLike = Boolean(
    originalReply
    && (
      /[?]$/.test(originalReply)
      || /\b(?:how|what|which|can you|could you)\b/.test(normalizedOriginalReply)
    )
  )
  const replyLooksLikeWrongWorkoutAlreadyLogged = Boolean(
    originalReply
    && /\balready\b/.test(normalizedOriginalReply)
    && /\b(?:workout|pushup|pushups|rep|reps|set|sets|bench|squat|run|running|marathon)\b/.test(normalizedOriginalReply)
  )
  const shouldOverrideWrongMealClarifyReply = Boolean(
    preferAIFirst
    && strictAIFirst
    && originalReply
    && hintMealClarify
    && !actions.some(isMealPersistenceAction)
    && !replyAddressesMealClarification(originalReply, context.mealContext, hintMealClarify)
    && (replyLooksQuestionLike || replyLooksLikeWrongWorkoutAlreadyLogged)
  )
  let forceMealClarifyReply = false
  if (shouldOverrideWrongMealClarifyReply) {
    const recoveredMealClarifyAction = buildClarifyRecoveryAction(context.mealContext, hintMealClarify)
    if (recoveredMealClarifyAction) {
      actions = [
        ...actions,
        recoveredMealClarifyAction,
      ]
        .map(normalizeMealAction)
        .filter(shouldAllowAction)
        .slice(0, 8)
    }
    forceMealClarifyReply = true
  }
  const canRecoverMealClarifyAction = Boolean(
    preferAIFirst
    && strictAIFirst
    && originalReply
    && !actions.some(isMealPersistenceAction)
    && !hasValidatedMealPersistence
    && hintMealClarify
    && replyAddressesMealClarification(originalReply, context.mealContext, hintMealClarify)
  )
  if (canRecoverMealClarifyAction) {
    const recoveredMealClarifyAction = buildClarifyRecoveryAction(context.mealContext, hintMealClarify)
    if (recoveredMealClarifyAction) {
      actions = [
        ...actions,
        recoveredMealClarifyAction,
      ]
        .map(normalizeMealAction)
        .filter(shouldAllowAction)
        .slice(0, 8)
    }
  }
  const canRecoverWorkoutClarifyAction = Boolean(
    preferAIFirst
    && strictAIFirst
    && originalReply
    && !actions.some(isWorkoutPersistenceAction)
    && !hasValidatedWorkoutPersistence
    && hintWorkoutClarify
    && replyAddressesWorkoutClarification(originalReply, context.workoutContext)
  )
  if (canRecoverWorkoutClarifyAction) {
    const recoveredWorkoutClarifyAction = buildClarifyRecoveryAction(context.workoutContext, hintWorkoutClarify)
    if (recoveredWorkoutClarifyAction) {
      actions = [
        ...actions,
        recoveredWorkoutClarifyAction,
      ]
        .map(normalizeMealAction)
        .filter(shouldAllowAction)
        .slice(0, 8)
    }
  }
  const canRecoverMealPersistenceAction = Boolean(
    preferAIFirst
    && strictAIFirst
    && originalReply
    && replyClaimsPersistence(originalReply)
    && !actions.some(isMealPersistenceAction)
    && !hasValidatedMealPersistence
    && canonicalMealPersistenceActions.length
    && context.mealContext?.readyToLog
    && !context.mealContext?.alreadyLogged
    && !context.mealContext?.suppressed
    && !context.mealContext?.answerOnly
    && !context.mealContext?.clarifyQuestion
    && !context.mealContext?.pendingClarification
    && !context.mealContext?.persistedMealId
    && !context.mealContext?.correctionRequested
    && !context.mealContext?.deleteRequested
  )
  if (canRecoverMealPersistenceAction) {
    actions = [
      ...actions,
      ...canonicalMealPersistenceActions,
    ]
      .map(normalizeMealAction)
      .filter(shouldAllowAction)
      .slice(0, 8)
  }
  const canRecoverWorkoutPersistenceAction = Boolean(
    preferAIFirst
    && strictAIFirst
    && originalReply
    && replyClaimsPersistence(originalReply)
    && !actions.some(isWorkoutPersistenceAction)
    && !hasValidatedWorkoutPersistence
    && canonicalWorkoutPersistenceActions.length
    && context.workoutContext?.readyToLog
    && !context.workoutContext?.alreadyLogged
    && !context.workoutContext?.suppressed
    && !context.workoutContext?.clarifyQuestion
    && !context.workoutContext?.persistedWorkoutId
    && !context.workoutContext?.correctionRequested
    && !context.workoutContext?.deleteRequested
  )
  if (canRecoverWorkoutPersistenceAction) {
    actions = [
      ...actions,
      ...canonicalWorkoutPersistenceActions,
    ]
      .map(normalizeMealAction)
      .filter(shouldAllowAction)
      .slice(0, 8)
  }
  const hasPersistenceAction = actions.some(isPersistenceAction)
  const alreadyLoggedReply =
    Boolean(context.mealContext?.alreadyLogged && !workoutHasPendingWork)
    || Boolean(context.workoutContext?.alreadyLogged && !mealHasPendingWork)
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

  const canRecoverMemoryReply = Boolean(
    preferAIFirst
    && strictAIFirst
    && !actions.length
    && !mealHasPendingWork
    && !workoutHasPendingWork
    && looksLikeCoachMemoryReference(context.prompt || "")
    && safeArray(context.recalledMessages, 8).some((message) => (
      String(message?.role || "").trim().toLowerCase() === "assistant"
      && String(message?.content || "").trim()
    ))
    && (!originalReply || isGenericCoachFallbackReply(originalReply))
  )
  if (canRecoverMemoryReply) {
    reply = buildRecalledCoachReply(context.prompt, context.recalledMessages) || reply
  }

  if (forceMealClarifyReply) {
    reply = hintMealClarify || reply
  }

  if (
    preferAIFirst
    && strictAIFirst
    && actions.some(isMealPersistenceAction)
    && (replyLooksQuestionLike || replyLooksLikeWrongWorkoutAlreadyLogged)
  ) {
    reply = summarizeCoachActions(actions)
      || summarizeCoachAction(actions.find(isMealPersistenceAction))
      || reply
  }

  if (
    preferAIFirst
    && strictAIFirst
    && actions.some(isMealPersistenceAction)
    && !actions.some(isWorkoutPersistenceAction)
    && context.workoutContext?.alreadyLogged
    && replyMentionsWorkoutPersistence(reply)
  ) {
    reply = summarizeCoachActions(actions.filter((action) => action?.type !== "clarify"))
      || summarizeCoachAction(actions.find(isMealPersistenceAction))
      || reply
  }

  const hasMealPersistenceAction = actions.some(isMealPersistenceAction)
  const hasWorkoutPersistenceAction = actions.some(isWorkoutPersistenceAction)
  const shouldGuardPendingMealQuantityReply = Boolean(
    preferAIFirst
    && !strictAIFirst
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
    const clarifyParts = [
      hintMealClarify,
      !hasWorkoutPersistenceAction && !hasValidatedWorkoutPersistence ? hintWorkoutClarify : "",
    ].filter(Boolean)
    reply = clarifyParts.join(" ").trim()
      || context.nutritionStatusReply
      || "I have the details, but I couldn't save it just now."
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

  if (preferAIFirst && strictAIFirst) {
    const recoveredClarifyActions = []
    if (
      !actions.some((action) => action?.type === "clarify")
      && !actions.some(isMealPersistenceAction)
      && !hasValidatedMealPersistence
      && hintMealClarify
      && replyAddressesMealClarification(reply, context.mealContext, hintMealClarify)
    ) {
      const recoveredMealClarifyAction = buildClarifyRecoveryAction(context.mealContext, hintMealClarify)
      if (recoveredMealClarifyAction) recoveredClarifyActions.push(recoveredMealClarifyAction)
    }
    if (
      !actions.some((action) => action?.type === "clarify")
      && !actions.some(isWorkoutPersistenceAction)
      && !hasValidatedWorkoutPersistence
      && hintWorkoutClarify
      && replyAddressesWorkoutClarification(reply, context.workoutContext)
    ) {
      const recoveredWorkoutClarifyAction = buildClarifyRecoveryAction(context.workoutContext, hintWorkoutClarify)
      if (recoveredWorkoutClarifyAction) recoveredClarifyActions.push(recoveredWorkoutClarifyAction)
    }
    if (recoveredClarifyActions.length) {
      actions = [
        ...actions,
        ...recoveredClarifyActions,
      ]
        .map(normalizeMealAction)
        .filter(shouldAllowAction)
        .slice(0, 8)
    }
  }

  return {
    reply,
    actions,
    warnings: safeArray(value.warnings, 6).filter((warning) => typeof warning === "string"),
  }
}
