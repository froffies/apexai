import { useEffect, useMemo, useRef, useState } from "react"
import { Bot, Camera, Dumbbell, Mic, MicOff, PackageSearch, RotateCcw, Salad, Send, ShieldCheck, UserRound } from "lucide-react"
import BarcodeScannerPanel from "@/components/BarcodeScannerPanel"
import FoodPhotoPanel from "@/components/FoodPhotoPanel"
import PageHeader from "@/components/PageHeader"
import SectionCard from "@/components/SectionCard"
import WorkoutPlanCard from "@/components/WorkoutPlanCard"
import { coachAuditEnabled, coachAuditNotice, sendCoachAuditEvent } from "@/lib/coachAuditClient"
import { reviewFoodPhotoEstimate, searchNutritionDatabase } from "@/lib/nutritionApiClient"
import { requestOpenAICoach } from "@/lib/openaiCoachClient"
import {
  applyWorkoutPlanEdit,
  buildActiveWorkoutFromPlan,
  buildMealPlan,
  buildRecoveryAdjustedWorkoutPlan,
  buildWeeklyTrainingPlan,
  isMealPlanRequest,
  isShowMealPlanRequest,
  isShowWorkoutRequest,
  isWorkoutPlanRequest,
  mergeWeeklyTrainingPlan,
  makeWorkoutSetsFromLog,
  parseActiveWorkoutUpdate,
  parseMealLog,
  parseRecoveryCheckIn,
  parseTargetUpdate,
  parseWorkoutLog,
  parseWorkoutPlanEdit,
  shouldUseLocalCoach,
  shouldBuildWeeklySchedule,
} from "@/lib/coachActions"
import {
  coachReply,
  defaultProfile,
  emptyActiveWorkout,
  macroTotals,
  starterExercises,
  starterRecoveryLogs,
  starterMeals,
  starterProgress,
  starterWorkoutSets,
  starterWorkouts,
  storageKeys,
  workoutsForDate,
} from "@/lib/fitnessDefaults"
import {
  buildPersistedMealSession,
  buildPersistedWorkoutSession,
  createEmptyMealSession,
  createEmptyWorkoutSession,
  hasMeaningfulMealSession,
  hasMeaningfulWorkoutSession,
  resolveCoachSessionStates,
  sanitizeMealSummaryText,
} from "@/lib/coachSessionMerge.js"
import { coachMealConfidenceNote, macroConfidenceLabel, normalizeMacroConfidence, nutritionSourceLabel, nutritionSourceTone } from "@/lib/nutritionHelpers"
import { recommendProgressionBlock } from "@/lib/progressionEngine"
import { advanceActiveWorkout, getCurrentActiveExercise, logSetToActiveWorkout, summarizeActiveWorkout, summarizeRecovery } from "@/lib/workoutIntelligence"
import { todayISO, uid, useLocalStorage } from "@/lib/useLocalStorage"

function createStarterMessage() {
  return {
    id: "chat_welcome",
    role: "assistant",
    content: "Tell me what happened today, what you ate, what you trained, or what you want to change, and I'll help you sort the next move.",
    timestamp: new Date().toISOString(),
  }
}

const SUBMIT_DEDUPE_WINDOW_MS = 1200

function normalizeSubmitContent(content) {
  return String(content || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function createSubmitGuardState() {
  return {
    inFlight: false,
    currentKey: "",
    lastCompletedKey: "",
    lastCompletedAt: 0,
  }
}

function acquireSubmitGuard(guard, content) {
  const key = normalizeSubmitContent(content)
  if (!key) return { accepted: false, key: null, reason: "empty" }
  if (guard.inFlight) return { accepted: false, key, reason: "in_flight" }
  if (guard.lastCompletedKey === key && (Date.now() - guard.lastCompletedAt) < SUBMIT_DEDUPE_WINDOW_MS) {
    return { accepted: false, key, reason: "duplicate" }
  }
  guard.inFlight = true
  guard.currentKey = key
  return { accepted: true, key, reason: "accepted" }
}

function releaseSubmitGuard(guard, key, remember = false) {
  if (guard.currentKey === key) {
    guard.inFlight = false
    guard.currentKey = ""
  } else {
    guard.inFlight = false
  }

  if (remember) {
    guard.lastCompletedKey = key
    guard.lastCompletedAt = Date.now()
  }
}

const promptCards = [
  { title: "Plan today", description: "Choose whether to build, view, start, or edit today's workout.", action: "today" },
  { title: "Plan the week", description: "Pick the exact kind of weekly planning you want.", action: "schedule" },
  { title: "Recovery check-in", description: "Answer a couple of quick prompts so the coach can adjust properly.", action: "recovery" },
  { title: "Nutrition help", description: "Choose between meal planning, logging, or target changes.", action: "meal" },
]

function supportsSpeech() {
  return typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
}

function cloneAuditState(value) {
  return value && typeof value === "object"
    ? JSON.parse(JSON.stringify(value))
    : value
}

function buildAuditStateSnapshot(mealSession, workoutSession) {
  return {
    meal_session: cloneAuditState(mealSession),
    workout_session: cloneAuditState(workoutSession),
  }
}

function buildAuditConversationWindow(messages, userMessage, assistantReply = "") {
  return [
    ...messages.slice(-12).map((message) => ({
      role: message.role,
      content: String(message.content || ""),
    })),
    { role: "user", content: String(userMessage || "") },
    ...(assistantReply ? [{ role: "assistant", content: String(assistantReply || "") }] : []),
  ]
}

function hasExercises(plan) {
  return Array.isArray(plan?.exercises) && plan.exercises.length > 0
}

function hasMeals(plan) {
  return Array.isArray(plan?.meals) && plan.meals.length > 0
}

function isBrokenCoachWorkoutPlan(plan) {
  return Boolean(plan) && !hasExercises(plan) && /coach workout/i.test(String(plan?.title || ""))
}

function isBrokenCoachMealPlan(plan) {
  return Boolean(plan) && !hasMeals(plan) && /coach meal plan/i.test(String(plan?.title || ""))
}

function upsertWorkoutPlan(current, nextPlan) {
  const remaining = current.filter((plan) => {
    if (plan.id === nextPlan.id) return false
    if (isBrokenCoachWorkoutPlan(plan)) return false
    if (plan.date === nextPlan.date && plan.status !== "completed" && plan.status !== "active") return false
    return true
  })
  return [nextPlan, ...remaining]
}

function upsertMealPlan(current, nextPlan) {
  const remaining = current.filter((plan) => {
    if (plan.id === nextPlan.id) return false
    if (isBrokenCoachMealPlan(plan)) return false
    return plan.date !== nextPlan.date
  })
  return [nextPlan, ...remaining]
}

function mealTypeLabel(value) {
  const text = String(value || "meal")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatMealPlanReply(plan) {
  const lines = plan.meals.map((meal) => `${mealTypeLabel(meal.meal_type)}: ${meal.food_name} (${meal.quantity})`)
  const calories = plan.meals.reduce((total, meal) => total + Number(meal.calories || 0), 0)
  return `Here’s your meal plan for ${plan.date || "today"}.\n${lines.join("\n")}\n\nTotal calories: ${Math.round(calories)}.`
}

function buildCoachContextPayload({
  today,
  profile,
  totals,
  todaysWorkouts,
  todaysPlan,
  todaysMealPlan,
  activeWorkout,
  currentActiveExercise,
  activeSummary,
  latestRecovery,
  readiness,
  progressionBlock,
}) {
  const remainingCalories = Math.max(0, Math.round(Number(profile?.daily_calories || 0) - Number(totals?.calories || 0)))
  const remainingProtein = Math.max(0, Math.round(Number(profile?.protein_g || 0) - Number(totals?.protein_g || 0)))
  const remainingCarbs = Math.max(0, Math.round(Number(profile?.carbs_g || 0) - Number(totals?.carbs_g || 0)))
  const remainingFat = Math.max(0, Math.round(Number(profile?.fat_g || 0) - Number(totals?.fat_g || 0)))

  return {
    today,
    profile: {
      name: profile?.name || "",
      goal: profile?.goal || "",
      split_type: profile?.split_type || "",
      locale: profile?.locale || "AU",
      training_days_per_week: Number(profile?.training_days_per_week || 0),
      target_weight_kg: Number(profile?.target_weight_kg || 0),
      daily_calories: Math.round(Number(profile?.daily_calories || 0)),
      protein_g: Math.round(Number(profile?.protein_g || 0)),
      carbs_g: Math.round(Number(profile?.carbs_g || 0)),
      fat_g: Math.round(Number(profile?.fat_g || 0)),
    },
    nutrition_today: {
      calories_logged: Math.round(Number(totals?.calories || 0)),
      protein_g_logged: Math.round(Number(totals?.protein_g || 0)),
      carbs_g_logged: Math.round(Number(totals?.carbs_g || 0)),
      fat_g_logged: Math.round(Number(totals?.fat_g || 0)),
      calories_remaining: remainingCalories,
      protein_g_remaining: remainingProtein,
      carbs_g_remaining: remainingCarbs,
      fat_g_remaining: remainingFat,
    },
    workout_today: {
      sessions_logged: todaysWorkouts.length,
      latest_session_title: todaysWorkouts[0]?.workout_type || "",
      active_session: activeWorkout?.id ? {
        name: activeWorkout.name,
        completed_sets: activeSummary.completedSets,
        total_sets: activeSummary.totalSets,
        current_exercise: currentActiveExercise?.name || "",
        current_target: currentActiveExercise?.setsReps || "",
      } : null,
    },
    current_workout_plan: todaysPlan ? {
      title: todaysPlan.title,
      status: todaysPlan.status || "planned",
      exercises: (todaysPlan.exercises || []).slice(0, 8).map((exercise) => ({
        name: exercise.name,
        muscle: exercise.muscle || "",
        setsReps: exercise.setsReps || "",
      })),
    } : null,
    current_meal_plan: todaysMealPlan ? {
      title: todaysMealPlan.title,
      meals: (todaysMealPlan.meals || []).slice(0, 6).map((meal) => ({
        meal_type: meal.meal_type,
        food_name: meal.food_name,
        quantity: meal.quantity,
        calories: Math.round(Number(meal.calories || 0)),
      })),
    } : null,
    recovery: latestRecovery ? {
      readiness: latestRecovery.readiness || "",
      sleep_hours: Number(latestRecovery.sleep_hours || 0),
      soreness: Number(latestRecovery.soreness || 0),
      energy: Number(latestRecovery.energy || 0),
      stress: Number(latestRecovery.stress || 0),
      summary: readiness?.text || "",
    } : null,
    progression: progressionBlock ? {
      title: progressionBlock.title || "",
      summary: progressionBlock.summary || "",
      adjustments: Array.isArray(progressionBlock.adjustments) ? progressionBlock.adjustments.slice(0, 2) : [],
    } : null,
  }
}

function formatCoachRequestError(error) {
  const message = String(error instanceof Error ? error.message : error || "").toLowerCase()
  if (message.includes("authorization") || message.includes("token")) {
    return "Your session has expired. Sign in again and I'll pick this back up."
  }
  if (message.includes("timed out") || message.includes("abort")) {
    return "The live coach took too long to reply, so I left your data alone. Try that again in a moment."
  }
  if (message.includes("unavailable") || message.includes("503")) {
    return "The live coach is unavailable right now, so I left your data alone. Try again shortly."
  }
  return "I couldn't reach the live coach just now, so I left your data alone. Try again in a moment."
}

function renderMessageLine(line, lineIndex) {
  if (!line) return <p key={lineIndex} className={lineIndex === 0 ? "" : "mt-2"}>&nbsp;</p>
  const segments = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return (
    <p key={lineIndex} className={lineIndex === 0 ? "" : "mt-2"}>
      {segments.map((segment, segmentIndex) => segment.startsWith("**") && segment.endsWith("**")
        ? <strong key={`${lineIndex}_${segmentIndex}`}>{segment.slice(2, -2)}</strong>
        : <span key={`${lineIndex}_${segmentIndex}`}>{segment}</span>)}
    </p>
  )
}

function renderMessageContent(content) {
  return String(content || "").split("\n").map((line, index) => renderMessageLine(line, index))
}

function updateWorkoutSession(workouts, sessionId, patch) {
  const exists = workouts.some((workout) => workout.id === sessionId)
  if (!exists) return [{ id: sessionId, ...patch }, ...workouts]
  return workouts.map((workout) => workout.id === sessionId ? { ...workout, ...patch } : workout)
}

function upsertMealEntry(current, nextMeal) {
  return [nextMeal, ...current.filter((meal) => meal.id !== nextMeal.id)]
}

function resolveMealNutritionSource(action, fallback = "") {
  const explicit = typeof action?.nutrition_source === "string" ? action.nutrition_source.trim() : ""
  if (explicit) return explicit
  if (fallback) return fallback
  return "Coach estimate from user-described ingredients and amounts"
}

function resolveMealNutritionSourceType(action, fallback = "", estimated = true) {
  const explicit = String(action?.nutrition_source_type || "").trim().toLowerCase()
  if (explicit) return explicit
  if (fallback) return String(fallback || "").trim().toLowerCase()
  return estimated ? "estimated_internal_profile" : "reference"
}

function resolveMealMacroConfidence(action, fallback = "", estimated = true) {
  const explicit = String(action?.macro_confidence || "").trim().toLowerCase()
  if (["high", "medium", "low"].includes(explicit)) return explicit
  const persisted = String(fallback || "").trim().toLowerCase()
  if (["high", "medium", "low"].includes(persisted)) return persisted
  return estimated ? "low" : "high"
}

function resolveMealMacroBreakdown(action, fallback = []) {
  return Array.isArray(action?.macro_breakdown) && action.macro_breakdown.length
    ? action.macro_breakdown
    : (Array.isArray(fallback) ? fallback : [])
}

function normalizeCoachComparableText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function coachNumberOrZero(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function mealSummariesEquivalent(left, right) {
  const normalizedLeft = normalizeCoachComparableText(sanitizeMealSummaryText(left))
  const normalizedRight = normalizeCoachComparableText(sanitizeMealSummaryText(right))
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight)
}

function mealMacrosMatch(left, right) {
  if (!left || !right) return false
  return ["calories", "protein_g", "carbs_g", "fat_g"].every((key) => Math.abs(coachNumberOrZero(left[key]) - coachNumberOrZero(right[key])) <= 1)
}

function buildWorkoutActionSummary(action, fallbackSummary = "") {
  const label = String(action?.exercise_name || action?.workout_type || "").trim()
  if (!label) return String(fallbackSummary || "").trim()
  const durationMinutes = Math.round(coachNumberOrZero(action?.duration_seconds) / 60)
  if (durationMinutes > 0) return `${durationMinutes} min ${label}`.trim()
  const parts = [label]
  if (coachNumberOrZero(action?.weight_kg) > 0) parts.push(`${coachNumberOrZero(action.weight_kg)}kg`)
  const sets = Math.max(1, Math.round(coachNumberOrZero(action?.sets) || 1))
  if (coachNumberOrZero(action?.reps) > 0) parts.push(`for ${sets} set${sets === 1 ? "" : "s"} of ${Math.round(coachNumberOrZero(action.reps))}`)
  return parts.join(" ").trim()
}

function workoutSummariesEquivalent(left, right) {
  const normalizedLeft = normalizeCoachComparableText(left)
  const normalizedRight = normalizeCoachComparableText(right)
  return Boolean(
    normalizedLeft
    && normalizedRight
    && (
      normalizedLeft === normalizedRight
      || normalizedLeft.includes(normalizedRight)
      || normalizedRight.includes(normalizedLeft)
    )
  )
}

function workoutMetricsMatch(persistedSets, action) {
  const durationSeconds = coachNumberOrZero(action?.duration_seconds)
  if (durationSeconds > 0) {
    const persistedDuration = persistedSets.reduce((total, set) => total + coachNumberOrZero(set.duration_seconds), 0)
    return Math.abs(persistedDuration - durationSeconds) <= 5
  }

  if (!Array.isArray(persistedSets) || !persistedSets.length) return false
  const expectedSets = Math.max(1, Math.round(coachNumberOrZero(action?.sets) || 1))
  const expectedReps = Math.round(coachNumberOrZero(action?.reps))
  const expectedWeight = coachNumberOrZero(action?.weight_kg)
  if (persistedSets.length !== expectedSets) return false
  return persistedSets.every((set) =>
    Math.round(coachNumberOrZero(set.reps)) === expectedReps
    && Math.abs(coachNumberOrZero(set.weight_kg) - expectedWeight) <= 0.1
  )
}

function resolvePersistedMealContext(currentSession, nextSession, meals) {
  const current = currentSession && typeof currentSession === "object" ? currentSession : null
  const next = nextSession && typeof nextSession === "object" ? nextSession : null
  const persistedMealId = String(next?.persistedMealId || current?.persistedMealId || "").trim()
  const persistedMeal = persistedMealId ? meals.find((meal) => meal.id === persistedMealId) || null : null
  const persistedSummary = sanitizeMealSummaryText(next?.persistedSummary || current?.persistedSummary || persistedMeal?.food_name || "")
  const sessionSummary = sanitizeMealSummaryText(next?.summary || current?.summary || persistedSummary)
  return {
    persistedMealId,
    persistedMeal,
    persistedSummary,
    sessionSummary,
    correctionRequested: Boolean(next?.correctionRequested || current?.correctionRequested),
  }
}

function normalizeMealPersistenceAction(action, currentSession, nextSession, meals) {
  if (!action || typeof action !== "object") return { action, duplicateSummary: "" }

  const context = resolvePersistedMealContext(currentSession, nextSession, meals)
  const multiMealGroups = [
    ...(Array.isArray(currentSession?.meal_groups) ? currentSession.meal_groups : []),
    ...(Array.isArray(nextSession?.meal_groups) ? nextSession.meal_groups : []),
  ].filter((group) => String(group?.summary || "").trim()).length > 1
  const preferredSummary = sanitizeMealSummaryText(
    multiMealGroups
      ? (action.food_name || "Estimated mixed meal")
      : (context.sessionSummary || action.food_name || "Estimated mixed meal")
  )
  const normalizedAction = {
    ...action,
    food_name: preferredSummary || sanitizeMealSummaryText(action.food_name || "Estimated mixed meal"),
    quantity: String(action.quantity || "1 serve"),
    meal_type: action.meal_type || context.persistedMeal?.meal_type || "snack",
  }

  if (normalizedAction.type === "update_meal_log" && !normalizedAction.meal_id && context.persistedMealId) {
    return {
      action: {
        ...normalizedAction,
        meal_id: context.persistedMealId,
      },
      duplicateSummary: "",
    }
  }

  if (normalizedAction.type !== "log_meal" || !context.persistedMealId) {
    return { action: normalizedAction, duplicateSummary: "" }
  }

  const sameSummaryAsPersisted = mealSummariesEquivalent(normalizedAction.food_name, context.persistedSummary)
  const sameMacrosAsPersisted = mealMacrosMatch(context.persistedMeal, normalizedAction)
  const shouldTreatAsExistingMeal = context.correctionRequested || sameSummaryAsPersisted

  if (!shouldTreatAsExistingMeal) {
    return { action: normalizedAction, duplicateSummary: "" }
  }

  if (!context.correctionRequested && sameSummaryAsPersisted && sameMacrosAsPersisted) {
    return { action: null, duplicateSummary: context.persistedSummary || normalizedAction.food_name }
  }

  return {
    action: {
      ...normalizedAction,
      type: "update_meal_log",
      meal_id: context.persistedMealId,
    },
    duplicateSummary: "",
  }
}

function resolvePersistedWorkoutContext(currentSession, nextSession, workouts, workoutSets) {
  const current = currentSession && typeof currentSession === "object" ? currentSession : null
  const next = nextSession && typeof nextSession === "object" ? nextSession : null
  const persistedWorkoutId = String(next?.persistedWorkoutId || current?.persistedWorkoutId || "").trim()
  const persistedWorkout = persistedWorkoutId ? workouts.find((workout) => workout.id === persistedWorkoutId) || null : null
  const persistedWorkoutSets = persistedWorkoutId
    ? workoutSets.filter((set) => set.session_id === persistedWorkoutId)
    : []
  const persistedSummary = String(next?.persistedSummary || current?.persistedSummary || persistedWorkout?.workout_type || "").trim()
  const sessionSummary = String(next?.summary || current?.summary || persistedSummary).trim()
  return {
    persistedWorkoutId,
    persistedWorkout,
    persistedWorkoutSets,
    persistedSummary,
    sessionSummary,
    correctionRequested: Boolean(next?.correctionRequested || current?.correctionRequested),
  }
}

function normalizeWorkoutPersistenceAction(action, currentSession, nextSession, workouts, workoutSets) {
  if (!action || typeof action !== "object") return { action, duplicateSummary: "" }

  const context = resolvePersistedWorkoutContext(currentSession, nextSession, workouts, workoutSets)
  const summary = buildWorkoutActionSummary(action, context.sessionSummary)
  const label = String(action.exercise_name || action.workout_type || context.persistedWorkout?.workout_type || "").trim()
  const normalizedAction = {
    ...action,
    exercise_name: label || action.exercise_name || action.workout_type || "Workout",
    workout_type: label || action.workout_type || action.exercise_name || "Workout",
  }

  if (normalizedAction.type === "update_workout_log" && !normalizedAction.workout_id && context.persistedWorkoutId) {
    return {
      action: {
        ...normalizedAction,
        workout_id: context.persistedWorkoutId,
      },
      duplicateSummary: "",
    }
  }

  if (normalizedAction.type !== "log_workout" || !context.persistedWorkoutId) {
    return { action: normalizedAction, duplicateSummary: "" }
  }

  const sameSummaryAsPersisted = workoutSummariesEquivalent(summary, context.persistedSummary)
  const sameMetricsAsPersisted = workoutMetricsMatch(context.persistedWorkoutSets, normalizedAction)
  const shouldTreatAsExistingWorkout = context.correctionRequested || sameSummaryAsPersisted

  if (!shouldTreatAsExistingWorkout) {
    return { action: normalizedAction, duplicateSummary: "" }
  }

  if (!context.correctionRequested && sameSummaryAsPersisted && sameMetricsAsPersisted) {
    return { action: null, duplicateSummary: context.persistedSummary || summary || normalizedAction.workout_type }
  }

  return {
    action: {
      ...normalizedAction,
      type: "update_workout_log",
      workout_id: context.persistedWorkoutId,
    },
    duplicateSummary: "",
  }
}

function formatCoachMealConfirmation(prefix, meal) {
  const note = coachMealConfidenceNote(meal)
  return `${prefix}: ${meal.food_name}. ${Math.round(Number(meal.calories) || 0)} kcal, ${Math.round(Number(meal.protein_g) || 0)}g protein, ${Math.round(Number(meal.carbs_g) || 0)}g carbs, ${Math.round(Number(meal.fat_g) || 0)}g fat.${note ? ` ${note}` : ""}`
}

function formatCoachMealBatchConfirmation(prefix, meals) {
  const lines = meals.map((meal) => {
    const mealType = String(meal.meal_type || "").trim()
    const mealLabel = mealType ? `${mealTypeLabel(mealType)} - ` : ""
    return `${mealLabel}${meal.food_name}`
  })
  const hasEstimated = meals.some((meal) => coachMealConfidenceNote(meal) && normalizeMacroConfidence(meal?.macro_confidence, meal?.estimated ? "low" : "high") !== "high")
  const hasVerified = meals.some((meal) => normalizeMacroConfidence(meal?.macro_confidence, meal?.estimated ? "low" : "high") === "high")
  const suffix = hasEstimated
    ? " Macros include estimate-based items, so tell me if you want them adjusted."
    : (hasVerified ? " Verified reference data was used where available." : "")
  return `${prefix}: ${lines.join("; ")}.${suffix}`
}

function formatCoachWorkoutConfirmation(prefix, workout, action) {
  const label = String(workout.workout_type || action?.workout_type || action?.exercise_name || "your workout").trim()
  const reps = Math.round(Number(action?.reps) || 0)
  const sets = Math.max(1, Math.round(Number(action?.sets) || 1))
  const weight = Number(action?.weight_kg) || 0
  const durationMinutes = Math.round(Number(action?.duration_seconds || 0) / 60)
  if (durationMinutes > 0) return `${prefix}: ${label} for ${durationMinutes} min.`
  if (reps > 0) return `${prefix}: ${label} for ${sets} set${sets === 1 ? "" : "s"} of ${reps}${weight > 0 ? ` at ${weight}kg` : ""}.`
  return `${prefix}: ${label}.`
}

function replaceWorkoutSessionSets(current, sessionId, nextSets) {
  return [...nextSets, ...current.filter((set) => set.session_id !== sessionId)]
}

function buildWorkoutSetsFromAction(action, sessionId, workoutDate) {
  const sets = Math.max(1, Math.round(Number(action.sets) || 1))
  return Array.from({ length: sets }, (_, index) => ({
    id: uid("set"),
    session_id: sessionId,
    exercise_name: action.exercise_name || action.workout_type || "Workout",
    muscle_group: action.muscle_group || "full_body",
    set_number: index + 1,
    reps: Number(action.reps) || 0,
    weight_kg: Number(action.weight_kg) || 0,
    duration_seconds: Number(action.duration_seconds) || 0,
    distance_km: Number(action.distance_km) || 0,
    notes: action.message || "Logged by OpenAI coach",
    date: workoutDate,
  }))
}

function isStructuredWorkoutAction(action) {
  const sets = Math.max(1, Math.round(Number(action?.sets) || 1))
  const reps = Number(action?.reps) || 0
  const durationSeconds = Number(action?.duration_seconds) || 0
  return durationSeconds > 0 || (sets > 0 && reps > 0)
}

function incompleteWorkoutPrompt(message, activeWorkout) {
  if (!activeWorkout?.id) return ""

  const text = String(message || "").toLowerCase()
  const mentionsExercise = /\b(bench|squat|deadlift|row|press|curl|pulldown|pull up|push up|lunge|dumbbell|barbell|bicep|tricep|preacher|leg|hamstring|calf|shoulder|cardio|run|bike|walk)\b/.test(text)
  const hasWeight = /\b\d+(?:\.\d+)?\s*kg\b/.test(text)
  const hasSets = /\b\d+\s*sets?\b|\bx\s*\d+\b/.test(text)
  const hasReps = /\b\d+\s*reps?\b|\b\d+\s*x\s*\d+\s*x\s*\d+\b|\b\d+\s*sets?\s*(?:of|x)\s*\d+\b/.test(text)
  const hasDuration = /\b\d+\s*(?:min|mins|minutes|km|kilometres|kilometers)\b/.test(text)
  if (!mentionsExercise || (!hasWeight && !hasSets) || hasReps || hasDuration) return ""

  const currentExercise = getCurrentActiveExercise(activeWorkout)
  const setsMatch = text.match(/\b(\d+)\s*sets?\b/)
  const setCount = setsMatch?.[1] ? `${setsMatch[1]} sets` : "that"
  return `I need the reps before I save ${setCount}. How many reps did you do${currentExercise?.name ? ` for ${currentExercise.name}` : ""}?`
}

function isLogLocationQuestion(message) {
  return /\b(where|which screen|what screen).*\b(log|save|record)\b|\bwhere did you log\b|\bwhere was that logged\b/.test(String(message || "").toLowerCase())
}

function findLatestCoachRecordReference(messages) {
  return [...messages].reverse().find((message) =>
    message?.role === "assistant"
    && (
      (Array.isArray(message.loggedMealIds) && message.loggedMealIds.length)
      || (Array.isArray(message.updatedMealIds) && message.updatedMealIds.length)
      || (Array.isArray(message.loggedWorkoutIds) && message.loggedWorkoutIds.length)
      || (Array.isArray(message.updatedWorkoutIds) && message.updatedWorkoutIds.length)
    )
  ) || null
}

function hasCompleteMacroSet(value = {}) {
  return ["calories", "protein_g", "carbs_g", "fat_g"].every((key) => Number.isFinite(Number(value?.[key])))
}

function normalizeCoachFoodDraftItems(items = [], fallbackConfidence = "medium") {
  return Array.isArray(items)
    ? items.map((item) => ({
      name: String(item?.name || "").trim(),
      quantity: String(item?.quantity || "1 serve").trim() || "1 serve",
      category: String(item?.category || "food").trim() || "food",
      preparation: String(item?.preparation || "").trim(),
      confidence: normalizeMacroConfidence(item?.confidence, fallbackConfidence),
      matched_food_name: String(item?.matched_food_name || "").trim(),
      source: String(item?.source || "").trim(),
      source_type: String(item?.source_type || "").trim(),
      calories: Number.isFinite(Number(item?.calories)) ? Number(item.calories) : null,
      protein_g: Number.isFinite(Number(item?.protein_g)) ? Number(item.protein_g) : null,
      carbs_g: Number.isFinite(Number(item?.carbs_g)) ? Number(item.carbs_g) : null,
      fat_g: Number.isFinite(Number(item?.fat_g)) ? Number(item.fat_g) : null,
    })).filter((item) => item.name)
    : []
}

function buildPhotoCoachDraft(result = {}, mealType = "snack") {
  const macroConfidence = normalizeMacroConfidence(result?.macro_confidence, result?.needs_review ? "low" : "medium")
  return {
    id: uid("coach_food_draft"),
    type: "photo",
    meal_type: mealType || "snack",
    food_name: String(result?.food_name || result?.summary || "").trim(),
    quantity: String(result?.quantity || result?.portion || "1 plate").trim() || "1 plate",
    calories: Number.isFinite(Number(result?.calories)) ? Number(result.calories) : 0,
    protein_g: Number.isFinite(Number(result?.protein_g)) ? Number(result.protein_g) : 0,
    carbs_g: Number.isFinite(Number(result?.carbs_g)) ? Number(result.carbs_g) : 0,
    fat_g: Number.isFinite(Number(result?.fat_g)) ? Number(result.fat_g) : 0,
    nutrition_source: String(result?.nutrition_source || "").trim(),
    nutrition_source_type: String(result?.nutrition_source_type || "photo_ai_estimate").trim().toLowerCase(),
    macro_confidence: macroConfidence,
    can_autofill: Boolean(result?.can_autofill),
    needs_review: Boolean(result?.needs_review) || macroConfidence !== "high",
    clarification_question: String(result?.clarification_question || "").trim(),
    items: normalizeCoachFoodDraftItems(result?.identified_items, macroConfidence),
    macro_breakdown: Array.isArray(result?.macro_breakdown) ? result.macro_breakdown : [],
    action: result?.has_trusted_macros && hasCompleteMacroSet(result)
      ? {
        type: "log_meal",
        meal_type: mealType || "snack",
        food_name: String(result?.food_name || result?.summary || "Photo meal").trim(),
        quantity: String(result?.quantity || result?.portion || "1 plate").trim() || "1 plate",
        calories: Number(result?.calories || 0),
        protein_g: Number(result?.protein_g || 0),
        carbs_g: Number(result?.carbs_g || 0),
        fat_g: Number(result?.fat_g || 0),
        estimated: true,
        nutrition_source: String(result?.nutrition_source || "").trim(),
        nutrition_source_type: String(result?.nutrition_source_type || "photo_ai_estimate").trim().toLowerCase(),
        macro_confidence: macroConfidence,
        macro_breakdown: Array.isArray(result?.macro_breakdown) ? result.macro_breakdown : [],
      }
      : null,
  }
}

function buildCoachPhotoDraftReply(draft) {
  if (!draft) return ""
  if (draft.needs_review) {
    return `${draft.food_name || "I analyzed the plate"}. ${draft.clarification_question || "I’ve mapped out what I think is on the plate."} Review the items below, adjust anything that looks off, and then log the reviewed estimate.`
  }
  return `${draft.food_name || "I analyzed the plate"}. The photo estimate looks solid, so you can log it below in one tap.`
}

function buildCoachBarcodeDraft(results = [], code = "", mealType = "snack") {
  const matches = Array.isArray(results) ? results.slice(0, 5) : []
  const preferred = matches.find((food) => ["barcode_label", "open_food_facts_label"].includes(String(food?.source_type || "").trim().toLowerCase())) || matches[0] || null
  return {
    id: uid("coach_food_draft"),
    type: "barcode",
    meal_type: mealType || "snack",
    barcode: String(code || "").trim(),
    matches,
    selected_food_id: preferred?.id || "",
  }
}

function buildCoachBarcodeDraftReply(draft) {
  if (!draft?.matches?.length) {
    return `I couldn't find a product label match for ${draft?.barcode || "that barcode"}. Try the brand and product name manually, or enter the macros yourself if it’s not in the catalogue yet.`
  }
  const selected = draft.matches.find((item) => item.id === draft.selected_food_id) || draft.matches[0]
  const sourceText = nutritionSourceLabel(selected)
  return `I found ${selected?.name || "that product"} from ${sourceText.toLowerCase()}. Review it below and log it when you're happy.`
}

export default function Coach() {
  const [profile, setProfile] = useLocalStorage(storageKeys.profile, defaultProfile)
  const [meals, setMeals] = useLocalStorage(storageKeys.meals, starterMeals)
  const [workouts, setWorkouts] = useLocalStorage(storageKeys.workouts, starterWorkouts)
  const [workoutSets, setWorkoutSets] = useLocalStorage(storageKeys.workoutSets, starterWorkoutSets)
  const [progress] = useLocalStorage(storageKeys.progress, starterProgress)
  const [workoutPlans, setWorkoutPlans] = useLocalStorage(storageKeys.workoutPlans, [])
  const [mealPlans, setMealPlans] = useLocalStorage(storageKeys.mealPlans, [])
  const [recoveryLogs, setRecoveryLogs] = useLocalStorage(storageKeys.recoveryLogs, starterRecoveryLogs)
  const [activeWorkout, setActiveWorkout] = useLocalStorage(storageKeys.activeWorkout, emptyActiveWorkout)
  const [exercises] = useLocalStorage(storageKeys.exercises, starterExercises)
  const [messages, setMessages] = useLocalStorage(storageKeys.chat, [createStarterMessage()])
  const [mealSession, setMealSession] = useLocalStorage(storageKeys.coachMealSession, createEmptyMealSession())
  const [workoutSession, setWorkoutSession] = useLocalStorage(storageKeys.coachWorkoutSession, createEmptyWorkoutSession())
  const [input, setInput] = useState("")
  const [listening, setListening] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [quickAction, setQuickAction] = useState(null)
  const [coachFoodDraft, setCoachFoodDraft] = useState(null)
  const [foodToolBusy, setFoodToolBusy] = useState(false)
  const inputRef = useRef(null)
  const bottomRef = useRef(null)
  const submitGuardRef = useRef(createSubmitGuardState())
  const auditSessionIdRef = useRef("")
  if (typeof window !== "undefined" && !auditSessionIdRef.current) {
    const existingSessionId = window.sessionStorage.getItem("apexai.coachAuditSessionId")
    auditSessionIdRef.current = existingSessionId || uid("coach_audit_session")
    window.sessionStorage.setItem("apexai.coachAuditSessionId", auditSessionIdRef.current)
  }
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, thinking])
  const [aiError, setAiError] = useState("")

  useEffect(() => {
    setWorkoutPlans((current) => {
      const cleaned = current.filter((plan) => !isBrokenCoachWorkoutPlan(plan))
      return cleaned.length === current.length ? current : cleaned
    })
    setMealPlans((current) => {
      const cleaned = current.filter((plan) => !isBrokenCoachMealPlan(plan))
      return cleaned.length === current.length ? current : cleaned
    })
  }, [setMealPlans, setWorkoutPlans])

  const today = todayISO()
  const validWorkoutPlans = workoutPlans.filter(hasExercises)
  const validMealPlans = mealPlans.filter(hasMeals)
  const totals = macroTotals(meals, today)
  const todaysWorkouts = workoutsForDate(workouts, today)
  const todaysPlan = validWorkoutPlans.find((plan) => plan.date === today) || validWorkoutPlans[0] || null
  const todaysMealPlan = validMealPlans.find((plan) => plan.date === today) || validMealPlans[0] || null
  const speechAvailable = useMemo(supportsSpeech, [])
  const activeSummary = summarizeActiveWorkout(activeWorkout)
  const currentActiveExercise = getCurrentActiveExercise(activeWorkout)
  const latestRecovery = recoveryLogs[0] || null
  const readiness = summarizeRecovery(latestRecovery)
  const progressionBlock = useMemo(
    () => recommendProgressionBlock({ profile, progress, workoutSets, recoveryLogs }),
    [profile, progress, recoveryLogs, workoutSets]
  )

  const appendAssistant = (content, extras = {}) => ({
    id: uid("chat"),
    role: "assistant",
    content,
    timestamp: new Date().toISOString(),
    ...extras,
  })

  const sendAuditPatch = (payload) => {
    if (!coachAuditEnabled) return
    void sendCoachAuditEvent(payload)
  }

  const emitCoachAuditFromMessage = (content, userMessage, assistantMessage, stateBefore) => {
    if (!coachAuditEnabled || !assistantMessage?.auditMeta) return
    sendAuditPatch({
      log_id: assistantMessage.auditMeta.log_id || userMessage.id,
      message_id: assistantMessage.auditMeta.message_id || userMessage.id,
      session_id: assistantMessage.auditMeta.session_id || auditSessionIdRef.current,
      user_message: content,
      assistant_reply: assistantMessage.content,
      intent: assistantMessage.auditMeta.intent || "general_chat",
      route_type: assistantMessage.auditMeta.route_type || "fallback",
      state_before: stateBefore,
      state_after: assistantMessage.auditMeta.state_after || stateBefore,
      conversation_window: buildAuditConversationWindow(messages, content, assistantMessage.content),
      actions: assistantMessage.auditMeta.actions || [],
      persisted_actions: assistantMessage.auditMeta.persisted_actions || [],
      persistence_status: assistantMessage.auditMeta.persistence_status || "not_requested",
      clarification_asked: Boolean(assistantMessage.auditMeta.clarification_asked),
      duplicate_prevention_triggered: Boolean(assistantMessage.auditMeta.duplicate_prevention_triggered),
      draft_preserved_after_failure: assistantMessage.auditMeta.draft_preserved_after_failure ?? null,
      warnings: assistantMessage.auditMeta.warnings || [],
      error_summary: assistantMessage.auditMeta.error_summary || "",
      model_used: assistantMessage.auditMeta.model_used || "",
    })
  }

  const appendCoachToolAssistant = (content, auditMeta = {}, extras = {}) => {
    const assistantMessage = appendAssistant(content, {
      ...extras,
      auditMeta: {
        route_type: "tool-assisted",
        intent: "meal_logging",
        actions: [],
        persisted_actions: [],
        persistence_status: "not_requested",
        clarification_asked: false,
        duplicate_prevention_triggered: false,
        draft_preserved_after_failure: null,
        warnings: [],
        error_summary: "",
        ...auditMeta,
      },
    })
    setMessages((current) => [...current, assistantMessage])
    return assistantMessage
  }

  const persistCoachToolMealAction = (action, reply) => {
    const assistantMessage = applyOpenAICoachResponse({
      reply,
      actions: [action],
      warnings: [],
      audit_meta: {
        route_type: "tool-assisted",
        intent: "meal_logging",
      },
    })
    setMessages((current) => [...current, assistantMessage])
    return assistantMessage
  }

  const handleCoachPhotoAnalyzed = (result) => {
    const draft = buildPhotoCoachDraft(result, coachFoodDraft?.meal_type || "snack")
    setCoachFoodDraft(draft)
    setAiError("")
    appendCoachToolAssistant(buildCoachPhotoDraftReply(draft), {
      actions: draft.action ? [draft.action] : [],
      clarification_asked: Boolean(draft.needs_review),
      state_after: buildAuditStateSnapshot(mealSession, workoutSession),
    })
  }

  const updateCoachDraftItem = (index, key, value) => {
    setCoachFoodDraft((current) => {
      if (!current || current.type !== "photo") return current
      const items = current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item)
      return {
        ...current,
        items,
        needs_review: true,
        can_autofill: false,
        action: null,
      }
    })
  }

  const recalculateCoachPhotoDraft = async () => {
    if (!coachFoodDraft || coachFoodDraft.type !== "photo") return
    setFoodToolBusy(true)
    setAiError("")
    try {
      const reviewed = await reviewFoodPhotoEstimate({
        items: coachFoodDraft.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          category: item.category,
          preparation: item.preparation,
          confidence: item.confidence,
        })),
        summary: coachFoodDraft.food_name,
        portion: coachFoodDraft.quantity,
        mealType: coachFoodDraft.meal_type,
      })
      const nextDraft = buildPhotoCoachDraft(reviewed, coachFoodDraft.meal_type)
      setCoachFoodDraft(nextDraft)
      appendCoachToolAssistant(
        nextDraft.action
          ? "I recalculated the photo estimate with your edits. Review it below and log it when you're ready."
          : "I updated the photo estimate, but it still needs manual review before it can be logged.",
        {
          actions: nextDraft.action ? [nextDraft.action] : [],
          clarification_asked: Boolean(nextDraft.needs_review),
          state_after: buildAuditStateSnapshot(mealSession, workoutSession),
        }
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "I couldn't refresh that photo estimate just now."
      setAiError(message)
      appendCoachToolAssistant(message, {
        route_type: "failed",
        persistence_status: "failed_before_persistence",
        error_summary: message,
        state_after: buildAuditStateSnapshot(mealSession, workoutSession),
      })
    } finally {
      setFoodToolBusy(false)
    }
  }

  const logCoachPhotoDraft = () => {
    if (!coachFoodDraft || coachFoodDraft.type !== "photo") return
    if (!coachFoodDraft.action) {
      appendCoachToolAssistant("I still need a reviewed macro estimate before I can log that photo cleanly.", {
        clarification_asked: true,
        state_after: buildAuditStateSnapshot(mealSession, workoutSession),
      })
      return
    }
    persistCoachToolMealAction({
      ...coachFoodDraft.action,
      photo_analysis_items: coachFoodDraft.items,
    }, formatCoachMealConfirmation("Saved to today's nutrition", coachFoodDraft.action))
    setCoachFoodDraft(null)
  }

  const handleCoachBarcodeDetected = async (code) => {
    setFoodToolBusy(true)
    setAiError("")
    try {
      const results = await searchNutritionDatabase(code)
      const draft = buildCoachBarcodeDraft(results, code, coachFoodDraft?.meal_type || "snack")
      setCoachFoodDraft(draft)
      appendCoachToolAssistant(buildCoachBarcodeDraftReply(draft), {
        clarification_asked: !draft.matches.length,
        state_after: buildAuditStateSnapshot(mealSession, workoutSession),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "I couldn't search that barcode just now."
      setAiError(message)
      appendCoachToolAssistant(message, {
        route_type: "failed",
        persistence_status: "failed_before_persistence",
        error_summary: message,
        state_after: buildAuditStateSnapshot(mealSession, workoutSession),
      })
    } finally {
      setFoodToolBusy(false)
    }
  }

  const selectCoachBarcodeMatch = (selectedFoodId) => {
    setCoachFoodDraft((current) => current?.type === "barcode"
      ? { ...current, selected_food_id: selectedFoodId }
      : current)
  }

  const logCoachBarcodeDraft = () => {
    if (!coachFoodDraft || coachFoodDraft.type !== "barcode") return
    const selected = coachFoodDraft.matches.find((item) => item.id === coachFoodDraft.selected_food_id) || coachFoodDraft.matches[0]
    if (!selected) {
      appendCoachToolAssistant("I still need a matched product before I can log that barcode.", {
        clarification_asked: true,
        state_after: buildAuditStateSnapshot(mealSession, workoutSession),
      })
      return
    }
    const sourceType = String(selected.source_type || "").trim().toLowerCase() || "barcode_label"
    const estimated = ["estimated_internal_profile", "manual_user_entry", "mixed_reference_and_estimate", "photo_ai_estimate"].includes(sourceType)
    const action = {
      type: "log_meal",
      meal_type: coachFoodDraft.meal_type || "snack",
      food_name: selected.name,
      quantity: selected.quantity || "1 serve",
      calories: numberOrZero(selected.calories),
      protein_g: numberOrZero(selected.protein_g),
      carbs_g: numberOrZero(selected.carbs_g),
      fat_g: numberOrZero(selected.fat_g),
      estimated,
      nutrition_source: selected.source || "Barcode product match",
      nutrition_source_type: sourceType,
      macro_confidence: normalizeMacroConfidence(selected.macro_confidence, estimated ? "low" : "high"),
      macro_breakdown: [],
    }
    persistCoachToolMealAction(action, formatCoachMealConfirmation("Saved to today's nutrition", action))
    setCoachFoodDraft(null)
  }

  const clearConversation = () => {
    setMessages([createStarterMessage()])
    setMealSession(createEmptyMealSession())
    setWorkoutSession(createEmptyWorkoutSession())
    setInput("")
    setQuickAction(null)
    setCoachFoodDraft(null)
    setFoodToolBusy(false)
    setAiError("")
    if (typeof window !== "undefined") {
      auditSessionIdRef.current = uid("coach_audit_session")
      window.sessionStorage.setItem("apexai.coachAuditSessionId", auditSessionIdRef.current)
    }
  }

  const startPlannedWorkout = (sourcePlan, editedExercises = null) => {
    const plan = {
      ...sourcePlan,
      exercises: editedExercises || sourcePlan?.exercises || [],
    }
    if (!hasExercises(plan)) return null
    const session = buildActiveWorkoutFromPlan(plan)
    setActiveWorkout(session)
    setWorkouts((current) => updateWorkoutSession(current, session.session_id, {
      date: session.date,
      workout_type: plan.title,
      duration_minutes: 0,
      notes: plan.exercises.map((exercise) => `${exercise.name} ${exercise.setsReps || ""}`.trim()).join("\n"),
      completed: false,
    }))
    setWorkoutPlans((current) => upsertWorkoutPlan(current, { ...plan, status: "active" }))
    return session
  }

  const finishActiveWorkout = () => {
    if (!activeWorkout?.id) return null
    const minutes = Math.max(0, Math.round((Date.now() - new Date(activeWorkout.started_at).getTime()) / 60000))
    setWorkouts((current) => updateWorkoutSession(current, activeWorkout.session_id, {
      date: activeWorkout.date || todayISO(),
      workout_type: activeWorkout.name,
      duration_minutes: minutes,
      completed: true,
      notes: currentActiveExercise ? `Finished after ${activeSummary.completedSets}/${activeSummary.totalSets} sets.` : "",
    }))
    setWorkoutPlans((current) => current.map((item) => item.title === activeWorkout.name ? { ...item, status: "completed" } : item))
    setActiveWorkout(emptyActiveWorkout)
    return minutes
  }

  const runLocalCoachAction = (content) => {
    const lower = content.toLowerCase()
    const localStateSnapshot = (nextMealSession = mealSession, nextWorkoutSession = workoutSession) => buildAuditStateSnapshot(nextMealSession, nextWorkoutSession)
    const localResult = (reply, auditMeta = {}, extras = {}) => appendAssistant(reply, {
      ...extras,
      auditMeta: {
        route_type: auditMeta.route_type || "deterministic",
        intent: auditMeta.intent || "general_chat",
        actions: auditMeta.actions || [],
        persisted_actions: auditMeta.persisted_actions || [],
        persistence_status: auditMeta.persistence_status || "not_requested",
        clarification_asked: Boolean(auditMeta.clarification_asked),
        duplicate_prevention_triggered: Boolean(auditMeta.duplicate_prevention_triggered),
        draft_preserved_after_failure: auditMeta.draft_preserved_after_failure ?? null,
        warnings: auditMeta.warnings || [],
        error_summary: auditMeta.error_summary || "",
        state_after: auditMeta.state_after || localStateSnapshot(),
      },
    })

    if (isLogLocationQuestion(content)) {
      const reference = findLatestCoachRecordReference(messages)
      if (!reference) {
        return localResult("I haven't saved anything recent enough to point to yet.", {
          route_type: "fallback",
          intent: "app_help",
        })
      }

      const destinations = []
      if ((reference.loggedMealIds?.length || reference.updatedMealIds?.length) && !destinations.includes("Nutrition > Log")) {
        destinations.push("Nutrition > Log")
      }
      if ((reference.loggedWorkoutIds?.length || reference.updatedWorkoutIds?.length) && !destinations.includes("Workouts > Recent sessions")) {
        destinations.push("Workouts > Recent sessions")
      }

      return localResult(destinations.length
        ? `I saved that in ${destinations.join(" and ")}.`
        : "I couldn't map that save to a coach-controlled record.", {
        route_type: "deterministic",
        intent: "app_help",
      })
    }

    const targetUpdate = parseTargetUpdate(content)
    if (targetUpdate) {
      setProfile((current) => ({ ...current, ...targetUpdate }))
      return localResult(`Updated your targets: ${Object.entries(targetUpdate).map(([key, value]) => `${key.replace("_", " ")} ${value}`).join(", ")}.`, {
        intent: "target_update",
        actions: [{ type: "update_targets", ...targetUpdate }],
        persisted_actions: [{ type: "update_targets", ...targetUpdate }],
        persistence_status: "succeeded",
      })
    }

    const recoveryCheckIn = parseRecoveryCheckIn(content)
    if (recoveryCheckIn) {
      setRecoveryLogs((current) => [recoveryCheckIn, ...current.filter((entry) => entry.date !== recoveryCheckIn.date)])
      const recoverySummary = summarizeRecovery(recoveryCheckIn)
      return localResult(`Logged your recovery check-in. ${recoverySummary.text}`, {
        intent: "recovery_checkin",
        actions: [{ type: "log_recovery", ...recoveryCheckIn }],
        persisted_actions: [{ type: "log_recovery", ...recoveryCheckIn }],
        persistence_status: "succeeded",
      })
    }

    const activeUpdate = parseActiveWorkoutUpdate(content, activeWorkout)
    if (activeUpdate) {
      if (activeUpdate.type === "advance") {
        const nextWorkout = advanceActiveWorkout(activeWorkout)
        setActiveWorkout(nextWorkout)
        const nextExercise = getCurrentActiveExercise(nextWorkout)
        return localResult(nextExercise ? `Moved on. Next exercise is ${nextExercise.name} for ${nextExercise.setsReps}.` : "Moved to the next exercise.", {
          intent: "workout_session_control",
          actions: [{ type: "advance_workout" }],
          persisted_actions: [{ type: "advance_workout" }],
          persistence_status: "succeeded",
        })
      }

      if (activeUpdate.type === "finish") {
        const minutes = finishActiveWorkout()
        const nextWorkoutSession = buildPersistedWorkoutSession(
          workoutSession,
          { workout_type: activeWorkout.name, exercise_name: currentActiveExercise?.name || "" },
          activeWorkout.session_id
        )
        setWorkoutSession(nextWorkoutSession)
        return localResult(`Workout finished. I marked the session complete${minutes ? ` at ${minutes} minutes` : ""} and saved everything to Workouts.`, {
          intent: "workout_logging",
          actions: [{ type: "update_workout_log", workout_id: activeWorkout.session_id, workout_type: activeWorkout.name }],
          persisted_actions: [{ type: "update_workout_log", workout_id: activeWorkout.session_id, workout_type: activeWorkout.name }],
          persistence_status: "succeeded",
          state_after: localStateSnapshot(mealSession, nextWorkoutSession),
        })
      }

      if (activeUpdate.type === "log_set") {
        const nextActiveWorkout = logSetToActiveWorkout(activeWorkout, activeUpdate)
        const exercise = nextActiveWorkout.exercises[activeUpdate.exerciseIndex]
        const setNumber = exercise?.logged_sets?.length || 1
        setActiveWorkout(nextActiveWorkout)
        setWorkoutSets((current) => [{
          id: uid("set"),
          session_id: activeWorkout.session_id,
          exercise_name: exercise?.name || activeUpdate.exerciseName || currentActiveExercise?.name || "Exercise",
          muscle_group: exercise?.muscle || "full_body",
          set_number: setNumber,
          reps: activeUpdate.reps,
          weight_kg: activeUpdate.weight_kg,
          duration_seconds: 0,
          distance_km: 0,
          notes: "Logged from active coach session",
          date: activeWorkout.date || todayISO(),
        }, ...current])
        const updatedSummary = summarizeActiveWorkout(nextActiveWorkout)
        const shouldAdvance = exercise?.completed && activeUpdate.exerciseIndex < nextActiveWorkout.exercises.length - 1
        if (shouldAdvance) {
          const advancedWorkout = advanceActiveWorkout(nextActiveWorkout)
          setActiveWorkout(advancedWorkout)
          const nextExercise = getCurrentActiveExercise(advancedWorkout)
          return localResult(`Logged ${exercise.name} set ${setNumber}: ${activeUpdate.reps} reps at ${activeUpdate.weight_kg}kg. ${updatedSummary.completedSets}/${updatedSummary.totalSets} sets done. Next exercise: ${nextExercise?.name || "continue"}${nextExercise ? ` for ${nextExercise.setsReps}` : ""}.`, {
            intent: "workout_logging",
            actions: [{ type: "log_workout_set", exercise_name: exercise?.name || activeUpdate.exerciseName || "" }],
            persisted_actions: [{ type: "log_workout_set", exercise_name: exercise?.name || activeUpdate.exerciseName || "" }],
            persistence_status: "succeeded",
          })
        }
        return localResult(`Logged ${exercise?.name || "set"} set ${setNumber}: ${activeUpdate.reps} reps at ${activeUpdate.weight_kg}kg. ${updatedSummary.completedSets}/${updatedSummary.totalSets} sets done.`, {
          intent: "workout_logging",
          actions: [{ type: "log_workout_set", exercise_name: exercise?.name || activeUpdate.exerciseName || "" }],
          persisted_actions: [{ type: "log_workout_set", exercise_name: exercise?.name || activeUpdate.exerciseName || "" }],
          persistence_status: "succeeded",
        })
      }
    }

    if (shouldBuildWeeklySchedule(content)) {
      const weeklyPlan = buildWeeklyTrainingPlan(profile, workoutSets, workouts, exercises, workoutPlans, recoveryLogs)
      setWorkoutPlans((current) => mergeWeeklyTrainingPlan(current, weeklyPlan.plans))
      const summary = weeklyPlan.plans.map((plan) => `${plan.date}: ${plan.title}`).join("\n")
      return localResult(`I rebuilt the next 7 days around what you've already done.${weeklyPlan.missedCount ? ` I also reshuffled ${weeklyPlan.missedCount} missed session${weeklyPlan.missedCount === 1 ? "" : "s"}.` : ""}\n\n${summary}`, {
        intent: "plan_creation",
        actions: [{ type: "create_workout_plan", title: weeklyPlan.plans[0]?.title || "Weekly plan" }],
        persisted_actions: [{ type: "create_workout_plan", title: weeklyPlan.plans[0]?.title || "Weekly plan" }],
        persistence_status: "succeeded",
      }, { plan: weeklyPlan.plans[0] || null })
    }

    if (isShowWorkoutRequest(content)) {
      if (!todaysPlan) return localResult("I haven't mapped today's workout yet. Ask me to build it and I'll sort it out.", {
        route_type: "fallback",
        intent: "workout_question",
      })
      return localResult(`Here’s the workout I’ve got for ${todaysPlan.date || "today"}. Review it below or start when you're ready.`, {
        route_type: "deterministic",
        intent: "workout_question",
      }, { plan: todaysPlan })
    }

    if (isShowMealPlanRequest(content)) {
      if (!todaysMealPlan) return localResult("I haven't mapped today's meals yet. Ask me to build today's meal plan and I'll put one together.", {
        route_type: "fallback",
        intent: "nutrition_question",
      })
      return localResult(formatMealPlanReply(todaysMealPlan), {
        route_type: "deterministic",
        intent: "nutrition_question",
      })
    }

    const planEdit = parseWorkoutPlanEdit(content, todaysPlan)
    if (planEdit && todaysPlan) {
      const updatedPlan = applyWorkoutPlanEdit(todaysPlan, planEdit)
      setWorkoutPlans((current) => upsertWorkoutPlan(current, updatedPlan))
      return localResult(`Updated today's workout. ${updatedPlan.exercises.length} exercise${updatedPlan.exercises.length === 1 ? "" : "s"} scheduled now.`, {
        intent: "plan_creation",
        actions: [{ type: "update_workout_plan", title: updatedPlan.title }],
        persisted_actions: [{ type: "update_workout_plan", title: updatedPlan.title }],
        persistence_status: "succeeded",
      }, { plan: updatedPlan })
    }

    if (/(begin|start).*(workout|session)|let'?s start/.test(lower)) {
      if (!todaysPlan) return localResult("I don't have a workout ready to start yet. Ask me to build one first and I'll line it up.", {
        route_type: "fallback",
        intent: "workout_question",
      })
      const session = startPlannedWorkout(todaysPlan)
      if (!session) return localResult("I found the workout shell, but it has no exercises yet. I'll rebuild it if you ask for today's workout again.", {
        route_type: "fallback",
        intent: "workout_question",
      })
      const nextExercise = session.exercises[0]
      return localResult(`Started ${todaysPlan.title}. Begin with ${nextExercise?.name || "your first exercise"}${nextExercise ? ` for ${nextExercise.setsReps}` : ""}. Tell me each set as you finish it.`, {
        intent: "workout_logging",
        actions: [{ type: "start_workout", workout_type: todaysPlan.title }],
        persisted_actions: [{ type: "start_workout", workout_type: todaysPlan.title }],
        persistence_status: "succeeded",
      })
    }

    if (activeWorkout?.id && /(what'?s next|next set|next exercise|where am i up to)/.test(lower)) {
      const nextExercise = getCurrentActiveExercise(activeWorkout)
      return localResult(nextExercise
        ? `You're on ${nextExercise.name}. Logged ${nextExercise.logged_sets?.length || 0}/${nextExercise.target_sets || 1} sets so far. Target is ${nextExercise.setsReps}.`
        : "Your active workout is running, but I cannot find the current exercise.", {
        route_type: "deterministic",
        intent: "workout_question",
      })
    }

    if (isWorkoutPlanRequest(content)) {
      const plan = buildRecoveryAdjustedWorkoutPlan(profile, workoutSets, workouts, exercises, latestRecovery, progress, recoveryLogs)
      setWorkoutPlans((current) => upsertWorkoutPlan(current, plan))
      return localResult("I built today's workout and added it to Workouts. You can tweak it below or start when you're ready.", {
        intent: "plan_creation",
        actions: [{ type: "create_workout_plan", title: plan.title }],
        persisted_actions: [{ type: "create_workout_plan", title: plan.title }],
        persistence_status: "succeeded",
      }, { plan })
    }

    if (isMealPlanRequest(content)) {
      const plan = buildMealPlan(profile)
      setMealPlans((current) => upsertMealPlan(current, plan))
      return localResult(`I mapped out today's meals from the verified Australian catalogue.\n\n${formatMealPlanReply(plan)}`, {
        intent: "plan_creation",
        actions: [{ type: "create_meal_plan", title: plan.title }],
        persisted_actions: [{ type: "create_meal_plan", title: plan.title }],
        persistence_status: "succeeded",
      })
    }

    const workoutLog = parseWorkoutLog(content)
    if (workoutLog) {
      const sessionId = uid("workout")
      const loggedWorkout = {
        id: sessionId,
        date: todayISO(),
        workout_type: workoutLog.exercise_name,
        duration_minutes: Math.round((workoutLog.duration_seconds || 0) / 60),
        notes: workoutLog.notes,
        completed: true,
      }
      setWorkouts((current) => [loggedWorkout, ...current])
      const sets = makeWorkoutSetsFromLog(workoutLog, sessionId)
      setWorkoutSets((current) => [...sets, ...current])
      const nextWorkoutSession = buildPersistedWorkoutSession(
        workoutSession,
        { workout_type: loggedWorkout.workout_type, exercise_name: workoutLog.exercise_name },
        sessionId
      )
      setWorkoutSession(nextWorkoutSession)
      return localResult(`Logged ${workoutLog.exercise_name}: ${workoutLog.sets} set(s) x ${workoutLog.reps || "time"} at ${workoutLog.weight_kg || 0}kg. Workouts and analytics updated.`, {
        intent: "workout_logging",
        actions: [{ type: "log_workout", ...workoutLog }],
        persisted_actions: [{ type: "log_workout", ...workoutLog, workout_id: sessionId }],
        persistence_status: "succeeded",
        state_after: localStateSnapshot(mealSession, nextWorkoutSession),
      }, {
        loggedWorkoutIds: [sessionId],
      })
    }

    const mealLog = parseMealLog(content)
    if (mealLog) {
      if ("needsVerification" in mealLog) return localResult(mealLog.reply, {
        route_type: "deterministic",
        intent: "meal_logging",
        actions: [{ type: "clarify", message: mealLog.reply }],
        persisted_actions: [],
        persistence_status: "not_requested",
        clarification_asked: true,
      })
      const loggedMealId = "id" in mealLog && mealLog.id ? mealLog.id : uid("meal")
      const loggedMeal = { id: loggedMealId, ...mealLog }
      setMeals((current) => [loggedMeal, ...current])
      const nextMealSession = buildPersistedMealSession(
        mealSession,
        { food_name: loggedMeal.food_name, ...loggedMeal },
        loggedMeal.id
      )
      setMealSession(nextMealSession)
      return localResult(`Logged ${loggedMeal.food_name} with verified Australian nutrition: ${loggedMeal.calories} kcal, ${loggedMeal.protein_g}g protein, ${loggedMeal.carbs_g}g carbs, ${loggedMeal.fat_g}g fat.`, {
        intent: "meal_logging",
        actions: [{ type: "log_meal", ...loggedMeal }],
        persisted_actions: [{ type: "log_meal", ...loggedMeal, meal_id: loggedMeal.id }],
        persistence_status: "succeeded",
        state_after: localStateSnapshot(nextMealSession, workoutSession),
      }, {
        loggedMealIds: [loggedMeal.id],
      })
    }

    return localResult(coachReply(content, { profile, totals, todaysWorkouts }), {
      route_type: "fallback",
      intent: "general_chat",
    })
  }

  const numberOrZero = (value) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  const applyOpenAICoachResponse = (coachResponse) => {
    let attachedPlan = null
    const rejectedActions = []
    const persistedActions = []
    const loggedMealIds = []
    const updatedMealIds = []
    const deletedMealIds = []
    const loggedWorkoutIds = []
    const updatedWorkoutIds = []
    const deletedWorkoutIds = []
    const loggedMeals = []
    const updatedMeals = []
    let latestLoggedMeal = null
    let latestUpdatedMeal = null
    let latestDeletedMeal = null
    let latestLoggedWorkout = null
    let latestUpdatedWorkout = null
    let latestLoggedWorkoutAction = null
    let latestUpdatedWorkoutAction = null
    let duplicateMealSummary = ""
    let duplicateWorkoutSummary = ""
    let finalMealSessionState = buildAuditStateSnapshot(mealSession, workoutSession).meal_session
    let finalWorkoutSessionState = buildAuditStateSnapshot(mealSession, workoutSession).workout_session
    const nextMealSession = coachResponse?.meal_session && typeof coachResponse.meal_session === "object"
      ? coachResponse.meal_session
      : null
    const nextWorkoutSession = coachResponse?.workout_session && typeof coachResponse.workout_session === "object"
      ? coachResponse.workout_session
      : null
    const requestedMealPersistence = (coachResponse.actions || []).some((action) => action?.type === "log_meal" || action?.type === "update_meal_log" || action?.type === "delete_meal_log")
    const requestedWorkoutPersistence = (coachResponse.actions || []).some((action) => action?.type === "log_workout" || action?.type === "update_workout_log" || action?.type === "delete_workout_log")

    for (const rawAction of coachResponse.actions || []) {
      const normalizedResult = rawAction?.type === "log_meal" || rawAction?.type === "update_meal_log"
        ? normalizeMealPersistenceAction(rawAction, mealSession, nextMealSession, meals)
        : rawAction?.type === "log_workout" || rawAction?.type === "update_workout_log"
          ? normalizeWorkoutPersistenceAction(rawAction, workoutSession, nextWorkoutSession, workouts, workoutSets)
          : { action: rawAction, duplicateSummary: "" }
      const { action, duplicateSummary } = normalizedResult
      if ((rawAction?.type === "log_meal" || rawAction?.type === "update_meal_log") && duplicateSummary && !duplicateMealSummary) {
        duplicateMealSummary = duplicateSummary
      }
      if ((rawAction?.type === "log_workout" || rawAction?.type === "update_workout_log") && duplicateSummary && !duplicateWorkoutSummary) {
        duplicateWorkoutSummary = duplicateSummary
      }
      if (!action) continue

      if (action.type === "update_targets") {
        const updates = {}
        if (action.daily_calories) updates.daily_calories = Math.round(action.daily_calories)
        if (action.protein_target_g) updates.protein_g = Math.round(action.protein_target_g)
        if (action.carbs_target_g) updates.carbs_g = Math.round(action.carbs_target_g)
        if (action.fat_target_g) updates.fat_g = Math.round(action.fat_target_g)
        if (Object.keys(updates).length) {
          setProfile((current) => ({ ...current, ...updates }))
          persistedActions.push({ type: "update_targets", ...updates })
        }
      }

      if (action.type === "create_workout_plan") {
        const exercises = (action.exercises || []).map((exercise) => ({
          name: exercise.name || "Exercise",
          muscle: exercise.muscle || "full_body",
          setsReps: exercise.setsReps || "3x8",
          weight_kg: numberOrZero(exercise.weight_kg),
        })).filter((exercise) => exercise.name && exercise.setsReps)

        if (!exercises.length) {
          rejectedActions.push("I skipped an empty workout plan and kept your existing plan intact.")
          continue
        }

        const plan = {
          id: uid("plan"),
          date: action.date || todayISO(),
          title: action.title || "Coach workout",
          status: "planned",
          exercises,
        }
        setWorkoutPlans((current) => upsertWorkoutPlan(current, plan))
        attachedPlan = attachedPlan || plan
        persistedActions.push({ type: "create_workout_plan", title: plan.title, date: plan.date })
      }

      if (action.type === "create_meal_plan") {
        const meals = (action.meals || []).map((meal) => ({
          id: uid("meal"),
          date: action.date || todayISO(),
          meal_type: meal.meal_type || "meal",
          food_name: meal.food_name || "Planned meal",
          quantity: meal.quantity || "1 serve",
          calories: numberOrZero(meal.calories),
          protein_g: numberOrZero(meal.protein_g),
          carbs_g: numberOrZero(meal.carbs_g),
          fat_g: numberOrZero(meal.fat_g),
          estimated: false,
          nutrition_source: meal.nutrition_source || "OpenAI plan using provided verified catalogue",
          notes: "Planned by OpenAI coach",
        })).filter((meal) => meal.food_name && meal.quantity)

        if (!meals.length) {
          rejectedActions.push("I skipped an empty meal plan and kept your existing meals intact.")
          continue
        }

        const plan = {
          id: uid("meal_plan"),
          date: action.date || todayISO(),
          title: action.title || "Coach meal plan",
          meals,
        }
        setMealPlans((current) => upsertMealPlan(current, plan))
        persistedActions.push({ type: "create_meal_plan", title: plan.title, date: plan.date })
      }

      if (action.type === "log_workout") {
        if (!isStructuredWorkoutAction(action)) {
          rejectedActions.push("I need the full workout details before I can log that cleanly. Tell me the sets, reps, and load, or the duration for cardio.")
          continue
        }

        const workoutLabel = String(action.workout_type || action.exercise_name || "").trim()
        if (!workoutLabel || /^workout$/i.test(workoutLabel)) {
          rejectedActions.push("I need the actual exercise or workout name before I can save that session cleanly.")
          continue
        }

        const sessionId = uid("workout")
        const workoutLog = {
          id: sessionId,
          date: action.date || todayISO(),
          workout_type: workoutLabel,
          duration_minutes: Math.round(numberOrZero(action.duration_seconds) / 60),
          notes: action.message || "Logged by OpenAI coach",
          completed: true,
        }
        const loggedSets = Number(action.reps) > 0 ? buildWorkoutSetsFromAction(action, sessionId, workoutLog.date) : []
        setWorkouts((current) => [workoutLog, ...current])
        if (loggedSets.length) setWorkoutSets((current) => [...loggedSets, ...current])
        loggedWorkoutIds.push(sessionId)
        latestLoggedWorkout = workoutLog
        latestLoggedWorkoutAction = action
        persistedActions.push({ type: "log_workout", workout_id: sessionId, ...action })
      }

        if (action.type === "update_workout_log") {
          const workoutId = String(action.workout_id || "").trim()
        const existingWorkout = workouts.find((workout) => workout.id === workoutId)
        if (!workoutId || !existingWorkout) {
          rejectedActions.push("I couldn't match that workout correction to a saved session, so I left your history alone.")
          continue
        }
        if (!isStructuredWorkoutAction(action)) {
          rejectedActions.push("I need the corrected workout details before I can update that session cleanly.")
          continue
        }

        const workoutDate = action.date || existingWorkout.date || todayISO()
        const workoutLabel = String(action.workout_type || action.exercise_name || existingWorkout.workout_type || "").trim()
        const nextWorkout = {
          ...existingWorkout,
          date: workoutDate,
          workout_type: workoutLabel && !/^workout$/i.test(workoutLabel) ? workoutLabel : existingWorkout.workout_type,
          duration_minutes: Number(action.duration_seconds) > 0
            ? Math.round(numberOrZero(action.duration_seconds) / 60)
            : existingWorkout.duration_minutes,
          notes: action.message || existingWorkout.notes,
          completed: true,
        }
        const nextSets = Number(action.reps) > 0 ? buildWorkoutSetsFromAction(action, workoutId, workoutDate) : []
        setWorkouts((current) => current.map((workout) => workout.id === workoutId ? nextWorkout : workout))
        setWorkoutSets((current) => replaceWorkoutSessionSets(current, workoutId, nextSets))
        updatedWorkoutIds.push(workoutId)
        latestUpdatedWorkout = nextWorkout
        latestUpdatedWorkoutAction = action
          persistedActions.push({ type: "update_workout_log", workout_id: workoutId, ...action })
        }

        if (action.type === "delete_workout_log") {
          const workoutId = String(action.workout_id || "").trim()
          const existingWorkout = workouts.find((workout) => workout.id === workoutId)
          if (!workoutId || !existingWorkout) {
            rejectedActions.push("I couldn't match that delete request to a saved workout, so I left your history alone.")
            continue
          }
          setWorkouts((current) => current.filter((workout) => workout.id !== workoutId))
          setWorkoutSets((current) => current.filter((set) => set.session_id !== workoutId))
          if (activeWorkout?.session_id === workoutId) setActiveWorkout(emptyActiveWorkout)
          deletedWorkoutIds.push(workoutId)
          persistedActions.push({
            type: "delete_workout_log",
            workout_id: workoutId,
            workout_type: String(existingWorkout.workout_type || action.workout_type || action.exercise_name || "that workout").trim() || "that workout",
          })
        }

      if (action.type === "log_meal") {
        const hasMacros = [action.calories, action.protein_g, action.carbs_g, action.fat_g].every((value) => Number.isFinite(Number(value)))
        if (!hasMacros) {
          continue
        } else {
          const estimated = action.estimated ?? true
          const nutritionSource = resolveMealNutritionSource(action)
          const nutritionSourceType = resolveMealNutritionSourceType(action, "", estimated)
          const macroConfidence = resolveMealMacroConfidence(action, "", estimated)
          const macroBreakdown = resolveMealMacroBreakdown(action)
          const mealId = uid("meal")
          const nextMeal = {
            id: mealId,
            date: action.date || todayISO(),
            meal_type: action.meal_type || "snack",
            food_name: action.food_name || "Estimated mixed meal",
            quantity: String(action.quantity || "1 serve"),
            calories: numberOrZero(action.calories),
            protein_g: numberOrZero(action.protein_g),
            carbs_g: numberOrZero(action.carbs_g),
            fat_g: numberOrZero(action.fat_g),
            estimated,
            nutrition_source: nutritionSource,
            nutrition_source_type: nutritionSourceType,
            macro_confidence: macroConfidence,
            ...(macroBreakdown.length ? { macro_breakdown: macroBreakdown } : {}),
            ...(Array.isArray(action.photo_analysis_items) && action.photo_analysis_items.length ? { photo_analysis_items: action.photo_analysis_items } : {}),
            notes: action.message || "Logged by OpenAI coach",
          }
          setMeals((current) => [nextMeal, ...current])
          loggedMealIds.push(mealId)
          loggedMeals.push(nextMeal)
          latestLoggedMeal = nextMeal
          persistedActions.push({ type: "log_meal", meal_id: mealId, ...action })
        }
      }

      if (action.type === "update_meal_log") {
        const mealId = String(action.meal_id || "").trim()
        const existingMeal = meals.find((meal) => meal.id === mealId)
        const hasMacros = [action.calories, action.protein_g, action.carbs_g, action.fat_g].every((value) => Number.isFinite(Number(value)))
        if (!mealId || !existingMeal) {
          rejectedActions.push("I couldn't match that meal correction to a saved log, so I left your nutrition log alone.")
          continue
        }
        if (!hasMacros) {
          rejectedActions.push("I need the corrected calories and macros before I can update that meal cleanly.")
          continue
        }
        const estimated = action.estimated ?? existingMeal.estimated
        const nutritionSource = resolveMealNutritionSource(action, existingMeal.nutrition_source)
        const nutritionSourceType = resolveMealNutritionSourceType(action, existingMeal.nutrition_source_type, estimated)
        const macroConfidence = resolveMealMacroConfidence(action, existingMeal.macro_confidence, estimated)
        const macroBreakdown = resolveMealMacroBreakdown(action, existingMeal.macro_breakdown)

        const nextMeal = {
          ...existingMeal,
          date: action.date || existingMeal.date,
          meal_type: action.meal_type || existingMeal.meal_type,
          food_name: action.food_name || existingMeal.food_name,
          quantity: String(action.quantity || existingMeal.quantity),
          calories: numberOrZero(action.calories),
          protein_g: numberOrZero(action.protein_g),
          carbs_g: numberOrZero(action.carbs_g),
          fat_g: numberOrZero(action.fat_g),
          estimated,
          nutrition_source: nutritionSource,
          nutrition_source_type: nutritionSourceType,
          macro_confidence: macroConfidence,
          ...(macroBreakdown.length ? { macro_breakdown: macroBreakdown } : {}),
          ...(Array.isArray(action.photo_analysis_items) && action.photo_analysis_items.length ? { photo_analysis_items: action.photo_analysis_items } : existingMeal.photo_analysis_items ? { photo_analysis_items: existingMeal.photo_analysis_items } : {}),
          notes: action.message || existingMeal.notes,
        }
        setMeals((current) => upsertMealEntry(current, nextMeal))
        updatedMealIds.push(mealId)
        updatedMeals.push(nextMeal)
        latestUpdatedMeal = nextMeal
        persistedActions.push({ type: "update_meal_log", meal_id: mealId, ...action })
      }

      if (action.type === "delete_meal_log") {
        const mealId = String(action.meal_id || "").trim()
        const existingMeal = meals.find((meal) => meal.id === mealId)
        if (!mealId || !existingMeal) {
          rejectedActions.push("I couldn't match that delete request to a saved meal, so I left your nutrition log alone.")
          continue
        }
        setMeals((current) => current.filter((meal) => meal.id !== mealId))
        deletedMealIds.push(mealId)
        latestDeletedMeal = existingMeal
        persistedActions.push({
          type: "delete_meal_log",
          meal_id: mealId,
          food_name: existingMeal.food_name,
        })
      }
    }

    const warnings = [...(coachResponse.warnings || []), ...rejectedActions].filter(Boolean)
    const suffix = warnings.length ? `\n\n${warnings.join(" ")}` : ""
    const mealSaveSucceeded = loggedMealIds.length > 0 || updatedMealIds.length > 0 || deletedMealIds.length > 0
    const workoutSaveSucceeded = loggedWorkoutIds.length > 0 || updatedWorkoutIds.length > 0 || deletedWorkoutIds.length > 0
    const totalMealChanges = loggedMeals.length + updatedMeals.length
    const persistedMealSession = mealSaveSucceeded && !deletedMealIds.length
      ? (
          totalMealChanges > 1
            ? createEmptyMealSession()
            : buildPersistedMealSession(
              nextMealSession || mealSession,
              {
                food_name: (latestLoggedMeal || latestUpdatedMeal)?.food_name || nextMealSession?.summary || "",
                ...((latestLoggedMeal || latestUpdatedMeal) || {}),
              },
              loggedMealIds[0] || updatedMealIds[0] || "",
            )
        )
      : null
    const persistedWorkoutSession = workoutSaveSucceeded && !deletedWorkoutIds.length
      ? buildPersistedWorkoutSession(
        nextWorkoutSession || workoutSession,
        {
          workout_type: (latestLoggedWorkout || latestUpdatedWorkout)?.workout_type || nextWorkoutSession?.summary || "",
          exercise_name: latestLoggedWorkoutAction?.exercise_name || latestUpdatedWorkoutAction?.exercise_name || "",
        },
        loggedWorkoutIds[0] || updatedWorkoutIds[0] || "",
      )
      : null
    const resolvedSessions = resolveCoachSessionStates({
      currentMealSession: mealSession,
      currentWorkoutSession: workoutSession,
      nextMealSession,
      nextWorkoutSession,
      mealDeleted: deletedMealIds.length > 0,
      workoutDeleted: deletedWorkoutIds.length > 0,
      mealSaveSucceeded,
      workoutSaveSucceeded,
      persistedMealSession,
      persistedWorkoutSession,
    })
    setMealSession(resolvedSessions.mealSession)
    setWorkoutSession(resolvedSessions.workoutSession)
    finalMealSessionState = cloneAuditState(resolvedSessions.mealSession)
    finalWorkoutSessionState = cloneAuditState(resolvedSessions.workoutSession)

    let replyText = coachResponse.reply
    if (duplicateMealSummary && !mealSaveSucceeded) {
      replyText = `I already saved ${duplicateMealSummary} in today's nutrition log. If you want to change it, tell me what to update.`
    } else if (duplicateWorkoutSummary && !workoutSaveSucceeded) {
      replyText = `I already saved ${duplicateWorkoutSummary} in Workouts. If you want to change it, tell me what to update.`
    } else if (requestedMealPersistence && !mealSaveSucceeded) {
      replyText = "I have the meal details, but I couldn't save it just now."
    } else if (requestedWorkoutPersistence && !workoutSaveSucceeded) {
      replyText = "I have the details, but I couldn't save it just now."
    } else if (mealSaveSucceeded && workoutSaveSucceeded) {
      replyText = coachResponse.reply || replyText
    } else if (loggedMeals.length > 1 && !updatedMeals.length) {
      replyText = formatCoachMealBatchConfirmation("Saved to today's nutrition", loggedMeals)
    } else if (updatedMeals.length > 1 && !loggedMeals.length) {
      replyText = formatCoachMealBatchConfirmation("Updated today's nutrition", updatedMeals)
    } else if ((loggedMeals.length + updatedMeals.length) > 1) {
      replyText = formatCoachMealBatchConfirmation("Updated today's nutrition entries", [...updatedMeals, ...loggedMeals])
    } else if (latestDeletedMeal) {
      replyText = `Removed ${latestDeletedMeal.food_name} from today's nutrition log.`
    } else if (latestLoggedMeal) {
      replyText = formatCoachMealConfirmation("Saved to today's nutrition", latestLoggedMeal)
    } else if (latestUpdatedMeal) {
      replyText = formatCoachMealConfirmation("Updated today's nutrition", latestUpdatedMeal)
    } else if (latestLoggedWorkout && latestLoggedWorkoutAction) {
      replyText = formatCoachWorkoutConfirmation("Saved to Workouts", latestLoggedWorkout, latestLoggedWorkoutAction)
    } else if (latestUpdatedWorkout && latestUpdatedWorkoutAction) {
      replyText = formatCoachWorkoutConfirmation("Updated your workout log", latestUpdatedWorkout, latestUpdatedWorkoutAction)
    }
    return appendAssistant(`${replyText}${suffix}`, {
      ...(attachedPlan ? { plan: attachedPlan } : {}),
      ...(loggedMealIds.length ? { loggedMealIds } : {}),
      ...(updatedMealIds.length ? { updatedMealIds } : {}),
      ...(deletedMealIds.length ? { deletedMealIds } : {}),
        ...(loggedWorkoutIds.length ? { loggedWorkoutIds } : {}),
        ...(updatedWorkoutIds.length ? { updatedWorkoutIds } : {}),
        ...(deletedWorkoutIds.length ? { deletedWorkoutIds } : {}),
        auditMeta: {
        ...(coachResponse.audit_meta || {}),
        route_type: coachResponse?.audit_meta?.route_type || "ai-assisted",
        intent: coachResponse?.audit_meta?.intent || "general_chat",
        actions: coachResponse.actions || [],
        persisted_actions: persistedActions,
        persistence_status: requestedMealPersistence || requestedWorkoutPersistence
          ? (mealSaveSucceeded || workoutSaveSucceeded ? "succeeded" : duplicateMealSummary || duplicateWorkoutSummary ? "duplicate_prevented" : "failed_persistence")
          : "not_requested",
        clarification_asked: (coachResponse.actions || []).some((action) => action?.type === "clarify"),
        duplicate_prevention_triggered: Boolean(duplicateMealSummary || duplicateWorkoutSummary),
        draft_preserved_after_failure: null,
        warnings,
        error_summary: "",
        state_after: {
          meal_session: finalMealSessionState,
          workout_session: finalWorkoutSessionState,
        },
      },
    })
  }

  const submitCoachPrompt = async (rawContent) => {
    const content = String(rawContent || "").trim()
    if (!content || thinking) return

    const submitAttempt = acquireSubmitGuard(submitGuardRef.current, content)
    if (!submitAttempt.accepted) {
      if (coachAuditEnabled && submitAttempt.reason === "duplicate") {
        const duplicateEventId = uid("coach_audit")
        sendAuditPatch({
          log_id: duplicateEventId,
          message_id: duplicateEventId,
          session_id: auditSessionIdRef.current,
          user_message: content,
          assistant_reply: "",
          intent: "general_chat",
          route_type: "deterministic",
          state_before: buildAuditStateSnapshot(mealSession, workoutSession),
          state_after: buildAuditStateSnapshot(mealSession, workoutSession),
          conversation_window: buildAuditConversationWindow(messages, content, ""),
          actions: [],
          persisted_actions: [],
          persistence_status: "not_requested",
          clarification_asked: false,
          duplicate_prevention_triggered: true,
          draft_preserved_after_failure: null,
          warnings: [],
          error_summary: "",
          model_used: "",
        })
      }
      return
    }
    const guardKey = submitAttempt.key

    let rememberSubmit = false
    let startedThinking = false
    const userMessage = { id: uid("chat"), role: "user", content, timestamp: new Date().toISOString() }
    const stateBefore = buildAuditStateSnapshot(mealSession, workoutSession)
    try {
      setInput("")
      setQuickAction(null)
      setAiError("")
      setMessages((current) => [...current, userMessage])

      const workoutFollowUp = incompleteWorkoutPrompt(content, activeWorkout)
      if (workoutFollowUp) {
        const assistantMessage = appendAssistant(workoutFollowUp, {
          auditMeta: {
            route_type: "deterministic",
            intent: "workout_logging",
            actions: [{ type: "clarify", message: workoutFollowUp }],
            persisted_actions: [],
            persistence_status: "not_requested",
            clarification_asked: true,
            duplicate_prevention_triggered: false,
            draft_preserved_after_failure: null,
            warnings: [],
            error_summary: "",
            state_after: stateBefore,
          },
        })
        setMessages((current) => [...current, assistantMessage])
        emitCoachAuditFromMessage(content, userMessage, assistantMessage, stateBefore)
        rememberSubmit = true
        return
      }

      if (isLogLocationQuestion(content) || shouldUseLocalCoach(content, { activeWorkout, todaysPlan })) {
        const assistantMessage = runLocalCoachAction(content)
        setMessages((current) => [...current, assistantMessage])
        emitCoachAuditFromMessage(content, userMessage, assistantMessage, stateBefore)
        rememberSubmit = true
        return
      }

      setThinking(true)
      startedThinking = true
      const coachResponse = await requestOpenAICoach({
        message: content,
        profile,
        coachContext: buildCoachContextPayload({
          today,
          profile,
          totals,
          todaysWorkouts,
          todaysPlan,
          todaysMealPlan,
          activeWorkout,
          currentActiveExercise,
          activeSummary,
          latestRecovery,
          readiness,
          progressionBlock,
        }),
        meals: meals.slice(0, 12),
        workouts: workouts.slice(0, 12),
        workoutSets: workoutSets.slice(0, 24),
        workoutPlans: workoutPlans.slice(0, 6),
        mealPlans: mealPlans.slice(0, 6),
        recoveryLogs: recoveryLogs.slice(0, 6),
        activeWorkout,
        recentMessages: messages.slice(-20),
        mealSession: hasMeaningfulMealSession(mealSession) ? mealSession : {},
        workoutSession: hasMeaningfulWorkoutSession(workoutSession) ? workoutSession : {},
        auditMeta: {
          log_id: userMessage.id,
          message_id: userMessage.id,
          session_id: auditSessionIdRef.current,
        },
      })
      if (!coachResponse) {
        const assistantMessage = appendAssistant("I couldn't get a clean answer from the live coach, so I left your data alone. Please try that again.", {
          auditMeta: {
            log_id: userMessage.id,
            message_id: userMessage.id,
            session_id: auditSessionIdRef.current,
            route_type: "failed",
            intent: "general_chat",
            actions: [],
            persisted_actions: [],
            persistence_status: "failed_before_persistence",
            clarification_asked: false,
            duplicate_prevention_triggered: false,
            draft_preserved_after_failure: true,
            warnings: [],
            error_summary: "AI coach returned an invalid response",
            state_after: stateBefore,
          },
        })
        setAiError("The live coach sent back something unusable, so nothing changed.")
        setInput(content)
        setMessages((current) => [...current, assistantMessage])
        emitCoachAuditFromMessage(content, userMessage, assistantMessage, stateBefore)
        return
      }
      const assistantMessage = applyOpenAICoachResponse(coachResponse)
      setMessages((current) => [...current, assistantMessage])
      emitCoachAuditFromMessage(content, userMessage, assistantMessage, stateBefore)
      rememberSubmit = true
    } catch (error) {
      setAiError(formatCoachRequestError(error))
      setInput(content)
      const assistantMessage = appendAssistant("I couldn't reach the live coach just now, so I left your data alone. Please retry in a moment.", {
        auditMeta: {
          ...(error?.auditMeta || { log_id: userMessage.id, message_id: userMessage.id, session_id: auditSessionIdRef.current }),
          route_type: error?.auditMeta?.route_type || "failed",
          intent: error?.auditMeta?.intent || "general_chat",
          actions: [],
          persisted_actions: [],
          persistence_status: "failed_before_persistence",
          clarification_asked: false,
          duplicate_prevention_triggered: false,
          draft_preserved_after_failure: true,
          warnings: [],
          error_summary: error instanceof Error ? error.message : "Coach request failed",
          state_after: stateBefore,
        },
      })
      setMessages((current) => [
        ...current,
        assistantMessage,
      ])
      emitCoachAuditFromMessage(content, userMessage, assistantMessage, stateBefore)
    } finally {
      if (startedThinking) {
        setThinking(false)
      }
      releaseSubmitGuard(submitGuardRef.current, guardKey, rememberSubmit)
    }
  }

  const focusComposer = (nextInput) => {
    setQuickAction(null)
    setInput(nextInput)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  const openQuickAction = (type) => {
    if (type === "recovery") {
      setQuickAction({ type, step: "sleep", sleepHours: "" })
      return
    }
    setQuickAction({ type })
  }

  const handleQuickOption = (option) => {
    if (option.mode === "prefill") {
      focusComposer(option.prompt)
      return
    }
    void submitCoachPrompt(option.prompt)
  }

  const quickOptions = quickAction?.type === "today"
    ? [
        { label: "Build today's workout", description: "Create a fresh plan for today.", prompt: "Build me a workout for today", mode: "send" },
        { label: "Show today's workout", description: "Pull up the current plan so I can review it.", prompt: "Show me today's workout", mode: "send" },
        { label: "Start today's workout", description: "Begin the session and guide me through it.", prompt: "Start today's workout", mode: "send" },
        { label: "Edit today's workout", description: "Prefill an edit request I can customise.", prompt: "Swap [exercise] for [exercise] in today's workout", mode: "prefill" },
      ]
    : quickAction?.type === "meal"
      ? [
          { label: "Create today's meal plan", description: "Build a plan around today's targets.", prompt: "Create a meal plan for today", mode: "send" },
          { label: "Show today's meal plan", description: "Review the current plan before you eat.", prompt: "Show me today's meal plan", mode: "send" },
          { label: "Log a meal", description: "Prefill a meal log prompt.", prompt: "I had ", mode: "prefill" },
          { label: "Adjust targets", description: "Prefill a calories and protein update.", prompt: "Set calories to 2200 and protein 180g", mode: "prefill" },
        ]
      : quickAction?.type === "schedule"
        ? [
            { label: "Plan this training week", description: "Lay out the next 7 training days.", prompt: "Plan my week", mode: "send" },
            { label: "Reshuffle missed sessions", description: "Move unfinished work into the next slots.", prompt: "Reshuffle my week", mode: "send" },
            { label: "Show my next workout", description: "Pull up the next session you should do.", prompt: "Show me today's workout", mode: "send" },
            { label: "Plan meals for the week", description: "Prefill a weekly meal planning request.", prompt: "Plan my meals for the week", mode: "prefill" },
          ]
        : quickAction?.type === "next"
          ? [
              { label: "What's next?", description: "Show the current exercise and target.", prompt: "What's next in my workout?", mode: "send" },
              { label: "Move to next exercise", description: "Advance the session forward.", prompt: "Next exercise", mode: "send" },
              { label: "Finish workout", description: "Wrap up and save the session.", prompt: "Finish workout", mode: "send" },
            ]
          : quickAction?.type === "log_set"
            ? [
                { label: "Log reps and weight", description: "Prefill the most common set log.", prompt: "Set done 6 reps at 80kg", mode: "prefill" },
                { label: "Log reps only", description: "Prefill a bodyweight or lighter set log.", prompt: "Set done 12 reps", mode: "prefill" },
                { label: "Finish workout", description: "Wrap up instead of logging another set.", prompt: "Finish workout", mode: "send" },
              ]
            : []

  const send = (event) => {
    event.preventDefault()
    void submitCoachPrompt(input)
  }

  const startVoice = () => {
    if (!speechAvailable) return
    const SpeechRecognition = window.SpeechRecognition || window["webkitSpeechRecognition"]
    const recognition = new SpeechRecognition()
    recognition.lang = profile.locale === "US" ? "en-US" : "en-AU"
    recognition.interimResults = false
    recognition.onstart = () => setListening(true)
    recognition.onend = () => setListening(false)
    recognition.onresult = (event) => setInput(event.results[0][0].transcript)
    recognition.start()
  }

  const selectedBarcodeMatch = coachFoodDraft?.type === "barcode"
    ? (coachFoodDraft.matches.find((item) => item.id === coachFoodDraft.selected_food_id) || coachFoodDraft.matches[0] || null)
    : null

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-4 pb-28 sm:p-6 sm:pb-24 lg:p-8">
      <PageHeader
        eyebrow="Coach"
        title="Your training coach"
        subtitle="Talk through training, meals, recovery, and corrections in one place without losing the saved details."
        action={messages.length > 1 ? (
          <button type="button" onClick={clearConversation} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
            <RotateCcw size={16} /> Clear chat
          </button>
        ) : null}
      />

      {coachAuditEnabled && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <p className="font-semibold">Beta testing notice</p>
          <p className="mt-1">{coachAuditNotice}</p>
        </div>
      )}

      <SectionCard
        tone="subtle"
        title="Start with a clean prompt"
        description="Tell it what happened, what feels off, or what you want to change. Use a card if you want a fast starting point."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {promptCards.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={() => openQuickAction(card.action)}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
            >
              <p className="text-sm font-semibold text-slate-950">{card.title}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{card.description}</p>
            </button>
          ))}
        </div>
      </SectionCard>

      <section className="flex h-[60vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:h-[65vh]">
        {(thinking || aiError) && (
          <div className={`border-b px-4 py-2 text-sm ${aiError ? "border-amber-200 bg-amber-50 text-amber-800" : "border-indigo-100 bg-indigo-50 text-indigo-700"}`}>
            {thinking ? "Coach is thinking through that..." : aiError}
          </div>
        )}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.map((message) => {
            const isUser = message.role === "user"
            return (
              <div key={message.id} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
                {!isUser && <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Bot size={18} /></div>}
                <div className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm shadow-sm ${isUser ? "bg-slate-950 text-white" : "border border-slate-200 bg-slate-50 text-slate-800"}`}>
                  <div className="whitespace-pre-wrap">{renderMessageContent(message.content)}</div>
                  {message.plan && hasExercises(message.plan) && (
                    <div className="mt-3">
                      <WorkoutPlanCard workoutName={message.plan.title} exercises={message.plan.exercises} onBeginWorkout={(editedExercises) => startPlannedWorkout(message.plan, editedExercises)} />
                    </div>
                  )}
                </div>
                {isUser && <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><UserRound size={18} /></div>}
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {activeWorkout?.id && (
          <div className="border-t border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p className="font-semibold">{activeWorkout.name}</p>
            <p className="mt-1">
              {currentActiveExercise
                ? `${currentActiveExercise.name}: ${currentActiveExercise.logged_sets?.length || 0}/${currentActiveExercise.target_sets || 1} sets logged. ${activeSummary.completedSets}/${activeSummary.totalSets} total sets done.`
                : "Active session in progress."}
            </p>
          </div>
        )}

        {!activeWorkout?.id && (
          <div className={`border-t px-4 py-3 text-sm ${readiness.band === "low" ? "border-amber-200 bg-amber-50 text-amber-900" : readiness.band === "high" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
            <p className="font-semibold">Recovery readiness</p>
            <p className="mt-1">{readiness.text}</p>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide opacity-80">{progressionBlock.title}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 border-t border-slate-200 bg-slate-50 p-3 sm:grid-cols-4">
          <button type="button" onClick={() => openQuickAction("today")} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"><Dumbbell size={16} /> Today</button>
          <button type="button" onClick={() => openQuickAction("meal")} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"><Salad size={16} /> Meal plan</button>
          <button type="button" onClick={() => openQuickAction(activeWorkout?.id ? "next" : "schedule")} className="flex min-h-11 items-center justify-center rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">{activeWorkout?.id ? "Next" : "Schedule"}</button>
          <button type="button" onClick={() => openQuickAction(activeWorkout?.id ? "log_set" : "recovery")} className="flex min-h-11 items-center justify-center rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">{activeWorkout?.id ? "Log set" : "Recovery"}</button>
        </div>

        {quickAction && (
          <div className="border-t border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  {quickAction.type === "today" && "Today"}
                  {quickAction.type === "meal" && "Meal plan"}
                  {quickAction.type === "schedule" && "Schedule"}
                  {quickAction.type === "recovery" && "Recovery check-in"}
                  {quickAction.type === "next" && "Next step"}
                  {quickAction.type === "log_set" && "Log set"}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {quickAction.type === "recovery"
                    ? quickAction.step === "sleep"
                      ? "How much sleep did you get last night?"
                      : "How are you feeling right now?"
                    : "Choose the exact thing you want the coach to do."}
                </p>
              </div>
              <button type="button" onClick={() => setQuickAction(null)} className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700">Close</button>
            </div>

            {quickAction.type === "recovery" ? (
              quickAction.step === "sleep" ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  {[5, 6, 7, 8].map((hours) => (
                    <button
                      key={hours}
                      type="button"
                      onClick={() => setQuickAction({ type: "recovery", step: "feeling", sleepHours: hours })}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      {hours === 8 ? "8+ hours" : `${hours} hours`}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[
                    { label: "Run down", description: "Coach should pull intensity back.", feeling: "wrecked" },
                    { label: "Okay", description: "Coach can keep training normal.", feeling: "okay" },
                    { label: "Fresh", description: "Coach can push normally today.", feeling: "great" },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => void submitCoachPrompt(`I slept ${quickAction.sleepHours} hours and feel ${option.feeling}`)}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50"
                    >
                      <p className="text-sm font-semibold text-slate-950">{option.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{option.description}</p>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {quickOptions.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => handleQuickOption(option)}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    <p className="text-sm font-semibold text-slate-950">{option.label}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{option.description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="border-t border-slate-200 bg-white p-3">
          <div className="flex flex-wrap gap-2">
            <FoodPhotoPanel
              className="min-w-[10rem] flex-1 sm:w-auto sm:flex-none"
              locale={profile.locale || "AU"}
              mealType={coachFoodDraft?.meal_type || "snack"}
              buttonLabel="Photo meal"
              helperText="Upload a plate or drink photo and I’ll identify the visible items, estimate the macros, and let you confirm before logging."
              onAnalyzed={handleCoachPhotoAnalyzed}
            />
            <BarcodeScannerPanel
              className="min-w-[10rem] flex-1 sm:w-auto sm:flex-none"
              buttonLabel="Barcode food"
              helperText="Scan a packet or upload a barcode photo, then I’ll match the product and let you log it here."
              onDetected={(code) => {
                void handleCoachBarcodeDetected(code)
              }}
            />
          </div>

          {(foodToolBusy || coachFoodDraft) && (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {foodToolBusy && <p className="text-sm text-slate-500">Working through that nutrition lookup...</p>}

              {coachFoodDraft?.type === "photo" && (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                          <Camera size={12} /> Photo draft
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${nutritionSourceTone(coachFoodDraft)}`}>
                          {coachFoodDraft.macro_confidence === "high" ? <ShieldCheck size={12} /> : <PackageSearch size={12} />}
                          {nutritionSourceLabel(coachFoodDraft)} - {macroConfidenceLabel(coachFoodDraft.macro_confidence, true)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-950">{coachFoodDraft.food_name || "Photo meal draft"}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {Math.round(Number(coachFoodDraft.calories) || 0)} kcal, {Math.round(Number(coachFoodDraft.protein_g) || 0)}g protein, {Math.round(Number(coachFoodDraft.carbs_g) || 0)}g carbs, {Math.round(Number(coachFoodDraft.fat_g) || 0)}g fat
                      </p>
                      <p className="mt-1 text-sm text-slate-500">{coachFoodDraft.nutrition_source}</p>
                      {coachFoodDraft.clarification_question && <p className="mt-2 text-sm text-amber-700">{coachFoodDraft.clarification_question}</p>}
                    </div>
                    <button type="button" onClick={() => setCoachFoodDraft(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                      Clear
                    </button>
                  </div>

                  {!!coachFoodDraft.items.length && (
                    <div className="space-y-2">
                      {coachFoodDraft.items.map((item, index) => (
                        <div key={`${item.name}_${index}`} className="rounded-2xl bg-white p-3">
                          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                            <input
                              value={item.name}
                              onChange={(event) => updateCoachDraftItem(index, "name", event.target.value)}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950"
                            />
                            <input
                              value={item.quantity}
                              onChange={(event) => updateCoachDraftItem(index, "quantity", event.target.value)}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950"
                            />
                            <div className="flex items-center justify-end text-xs font-medium text-slate-500">
                              {macroConfidenceLabel(item.confidence, false)}
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            {item.matched_food_name ? `Matched to ${item.matched_food_name}. ` : ""}{item.source || "Review-based estimate"}
                          </p>
                          {hasCompleteMacroSet(item) && (
                            <p className="mt-1 text-xs text-slate-500">
                              {Math.round(Number(item.calories) || 0)} kcal, {Math.round(Number(item.protein_g) || 0)}g protein, {Math.round(Number(item.carbs_g) || 0)}g carbs, {Math.round(Number(item.fat_g) || 0)}g fat
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void recalculateCoachPhotoDraft()}
                      disabled={foodToolBusy}
                      className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                    >
                      {coachFoodDraft.needs_review ? "Recalculate estimate" : "Refresh estimate"}
                    </button>
                    <button
                      type="button"
                      onClick={logCoachPhotoDraft}
                      disabled={foodToolBusy || !coachFoodDraft.action}
                      className="min-h-11 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {coachFoodDraft.needs_review ? "Log reviewed estimate" : "Log photo meal"}
                    </button>
                  </div>
                </div>
              )}

              {coachFoodDraft?.type === "barcode" && (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                          <PackageSearch size={12} /> Barcode draft
                        </span>
                        {selectedBarcodeMatch && (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${nutritionSourceTone(selectedBarcodeMatch)}`}>
                            {normalizeMacroConfidence(selectedBarcodeMatch?.macro_confidence, "high") === "high" ? <ShieldCheck size={12} /> : <PackageSearch size={12} />}
                            {nutritionSourceLabel(selectedBarcodeMatch)} - {macroConfidenceLabel(selectedBarcodeMatch?.macro_confidence, false)}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-950">{selectedBarcodeMatch?.name || `Barcode ${coachFoodDraft.barcode}`}</p>
                      {selectedBarcodeMatch && (
                        <>
                          <p className="mt-1 text-sm text-slate-500">
                            {selectedBarcodeMatch.quantity} - {Math.round(Number(selectedBarcodeMatch.calories) || 0)} kcal - {Math.round(Number(selectedBarcodeMatch.protein_g) || 0)}g protein
                          </p>
                          <p className="mt-1 text-sm text-slate-500">{selectedBarcodeMatch.source}</p>
                        </>
                      )}
                    </div>
                    <button type="button" onClick={() => setCoachFoodDraft(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                      Clear
                    </button>
                  </div>

                  {!!coachFoodDraft.matches.length && (
                    <div className="space-y-2">
                      {coachFoodDraft.matches.slice(0, 5).map((food) => (
                        <button
                          key={food.id}
                          type="button"
                          onClick={() => selectCoachBarcodeMatch(food.id)}
                          className={`w-full rounded-2xl border p-3 text-left ${food.id === selectedBarcodeMatch?.id ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white"}`}
                        >
                          <p className="text-sm font-semibold text-slate-950">{food.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{food.quantity} - {Math.round(Number(food.calories) || 0)} kcal - {Math.round(Number(food.protein_g) || 0)}g protein</p>
                          <p className={`mt-1 text-xs ${nutritionSourceTone(food)}`}>{nutritionSourceLabel(food)} - {food.source}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={logCoachBarcodeDraft}
                      disabled={foodToolBusy || !selectedBarcodeMatch}
                      className="min-h-11 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      Log this product
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <form onSubmit={send} aria-busy={thinking} className="flex gap-3 border-t border-slate-200 bg-white p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} disabled={thinking} placeholder={activeWorkout?.id ? "Set done 6 reps at 80kg..." : "Log bench 80kg for 4 sets of 6..."} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-950 shadow-sm disabled:bg-slate-50 disabled:text-slate-400" />
          <button type="button" onClick={startVoice} disabled={!speechAvailable} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-700 disabled:opacity-40">
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button type="submit" disabled={thinking} className="flex min-h-11 min-w-[6.5rem] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
            <Send size={17} /> {thinking ? "Working..." : "Send"}
          </button>
        </form>
      </section>
    </div>
  )
}
