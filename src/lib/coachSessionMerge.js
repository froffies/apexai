function cloneSession(value) {
  return value && typeof value === "object"
    ? JSON.parse(JSON.stringify(value))
    : value
}

export function createEmptyMealSession() {
  return {
    active: false,
    items: [],
    meal_groups: [],
    clarificationAttempts: 0,
    clarificationCounts: {},
    readyToLog: false,
    shouldStopClarifying: false,
    summary: "",
    clarifyQuestion: "",
    wantsLogging: false,
    wantsNutrition: false,
    answerOnly: false,
    suppressed: false,
    suppressionReply: "",
    referenceMeal: null,
    pendingClarification: null,
    pendingQuantities: [],
    structuralIssues: [],
    mealConversation: false,
    lastMainKey: "",
    lastDrinkKey: "",
    currentMealType: "",
    persisted: false,
    persistedMealId: "",
    persistedSummary: "",
    persistedAt: "",
    alreadyLogged: false,
    correctionRequested: false,
    deleteRequested: false,
    thread_messages: [],
  }
}

export function createEmptyWorkoutSession() {
  return {
    active: false,
    workoutConversation: false,
    exercise_name: "",
    workout_type: "",
    muscle_group: "full_body",
    sets: 0,
    reps: 0,
    weight_kg: 0,
    duration_seconds: 0,
    distance_km: 0,
    clarificationAttempts: 0,
    clarificationCounts: {},
    readyToLog: false,
    shouldStopClarifying: false,
    clarifyQuestion: "",
    summary: "",
    wantsLogging: false,
    persisted: false,
    persistedWorkoutId: "",
    persistedSummary: "",
    persistedAt: "",
    alreadyLogged: false,
    correctionRequested: false,
    deleteRequested: false,
    suppressed: false,
    suppressionReply: "",
    thread_messages: [],
  }
}

export function sanitizeMealSummaryText(value) {
  let next = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
  if (!next) return ""

  const repeatedPhrasePattern = /\b(?<phrase>(?:\d+(?:\.\d+)?\s*[a-z]+\s+)?(?:[a-z]+(?:\s+[a-z]+){0,4}))\s+(?:and|,)\s+\k<phrase>\b/gi
  let previous = ""
  while (next !== previous) {
    previous = next
    next = next.replace(repeatedPhrasePattern, "$<phrase>")
      .replace(/\s+,/g, ",")
      .replace(/,\s*,/g, ", ")
      .replace(/\s+/g, " ")
      .trim()
  }
  return next
}

export function buildPersistedMealSession(session, action, mealId) {
  const base = session && typeof session === "object" ? session : createEmptyMealSession()
  return {
    ...createEmptyMealSession(),
    ...base,
    active: false,
    readyToLog: false,
    shouldStopClarifying: false,
    clarifyQuestion: "",
    answerOnly: false,
    suppressed: false,
    suppressionReply: "",
    referenceMeal: null,
    persisted: true,
    persistedMealId: mealId,
    persistedSummary: sanitizeMealSummaryText(action?.food_name || base?.summary || ""),
    persistedAt: new Date().toISOString(),
    alreadyLogged: false,
    correctionRequested: false,
    deleteRequested: false,
  }
}

export function buildPersistedWorkoutSession(session, action, workoutId) {
  const base = session && typeof session === "object" ? session : createEmptyWorkoutSession()
  const persistedExercise = String(action?.exercise_name || action?.workout_type || base?.exercise_name || base?.workout_type || "").trim()
  const persistedWorkoutType = String(action?.workout_type || action?.exercise_name || base?.workout_type || base?.exercise_name || "").trim()
  const persistedSummary = String(
    action?.workout_type
    || action?.exercise_name
    || base?.summary
    || ""
  ).trim()
  return {
    ...createEmptyWorkoutSession(),
    ...base,
    active: false,
    readyToLog: false,
    shouldStopClarifying: false,
    clarifyQuestion: "",
    suppressed: false,
    suppressionReply: "",
    persisted: true,
    exercise_name: persistedExercise,
    workout_type: persistedWorkoutType,
    persistedWorkoutId: workoutId,
    persistedSummary,
    persistedAt: new Date().toISOString(),
    alreadyLogged: false,
    correctionRequested: false,
    deleteRequested: false,
  }
}

export function hasMeaningfulMealSession(session) {
  if (!session || typeof session !== "object") return false
  return Boolean(
    session.active
    || session.readyToLog
    || session.mealConversation
    || session.alreadyLogged
    || session.correctionRequested
    || session.deleteRequested
    || session.persisted
    || session.persistedMealId
    || session.persistedSummary
    || session.summary
    || (Array.isArray(session.items) && session.items.length)
    || session.clarifyQuestion
  )
}

export function hasMeaningfulWorkoutSession(session) {
  if (!session || typeof session !== "object") return false
  return Boolean(
    session.active
    || session.readyToLog
    || session.workoutConversation
    || session.alreadyLogged
    || session.correctionRequested
    || session.deleteRequested
    || session.persisted
    || session.persistedWorkoutId
    || session.persistedSummary
    || session.summary
    || session.clarifyQuestion
    || session.exercise_name
    || session.workout_type
    || Number(session.sets) > 0
    || Number(session.reps) > 0
    || Number(session.weight_kg) > 0
    || Number(session.duration_seconds) > 0
    || Number(session.distance_km) > 0
  )
}

function shouldAdoptMealSession(session) {
  return Boolean(session && (session.active || session.mealConversation || session.summary))
}

function shouldAdoptWorkoutSession(session) {
  return Boolean(session && (session.active || session.workoutConversation || session.summary))
}

export function resolveCoachSessionStates({
  currentMealSession = null,
  currentWorkoutSession = null,
  nextMealSession = null,
  nextWorkoutSession = null,
  mealDeleted = false,
  workoutDeleted = false,
  mealSaveSucceeded = false,
  workoutSaveSucceeded = false,
  persistedMealSession = null,
  persistedWorkoutSession = null,
} = {}) {
  let mealSession = cloneSession(currentMealSession)
  let workoutSession = cloneSession(currentWorkoutSession)

  if (mealDeleted) {
    mealSession = createEmptyMealSession()
  } else if (mealSaveSucceeded) {
    mealSession = cloneSession(persistedMealSession || mealSession)
  } else if (shouldAdoptMealSession(nextMealSession)) {
    mealSession = cloneSession(nextMealSession)
  }

  if (workoutDeleted) {
    workoutSession = createEmptyWorkoutSession()
  } else if (workoutSaveSucceeded) {
    workoutSession = cloneSession(persistedWorkoutSession || workoutSession)
  } else if (shouldAdoptWorkoutSession(nextWorkoutSession)) {
    workoutSession = cloneSession(nextWorkoutSession)
  }

  return {
    mealSession,
    workoutSession,
  }
}
