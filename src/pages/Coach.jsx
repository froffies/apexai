import { useEffect, useMemo, useRef, useState } from "react"
import { Bot, Dumbbell, Mic, MicOff, RotateCcw, Salad, Send, UserRound } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import SectionCard from "@/components/SectionCard"
import WorkoutPlanCard from "@/components/WorkoutPlanCard"
import { requestOpenAICoach } from "@/lib/openaiCoachClient"
import {
  applyWorkoutPlanEdit,
  buildActiveWorkoutFromPlan,
  buildMealPlan,
  buildRecoveryAdjustedWorkoutPlan,
  buildWeeklyTrainingPlan,
  isMealPlanRequest,
  isProgressionQuestion,
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
import { recommendProgressionBlock } from "@/lib/progressionEngine"
import { advanceActiveWorkout, getCurrentActiveExercise, logSetToActiveWorkout, summarizeActiveWorkout, summarizeRecovery } from "@/lib/workoutIntelligence"
import { todayISO, uid, useLocalStorage } from "@/lib/useLocalStorage"

function createStarterMessage() {
  return {
    id: "chat_welcome",
    role: "assistant",
    content: "Tell me what you did or what you need. I can log completed meals and workouts, build or edit today's plan, guide an active session, update targets, and answer coaching questions.",
    timestamp: new Date().toISOString(),
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
  const [input, setInput] = useState("")
  const [listening, setListening] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [quickAction, setQuickAction] = useState(null)
  const inputRef = useRef(null)
  const bottomRef = useRef(null)
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

  const clearConversation = () => {
    setMessages([createStarterMessage()])
    setInput("")
    setQuickAction(null)
    setAiError("")
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

    if (isLogLocationQuestion(content)) {
      const reference = findLatestCoachRecordReference(messages)
      if (!reference) {
        return appendAssistant("I haven't saved anything recent enough to point to yet.")
      }

      const destinations = []
      if ((reference.loggedMealIds?.length || reference.updatedMealIds?.length) && !destinations.includes("Nutrition > Log")) {
        destinations.push("Nutrition > Log")
      }
      if ((reference.loggedWorkoutIds?.length || reference.updatedWorkoutIds?.length) && !destinations.includes("Workouts > Recent sessions")) {
        destinations.push("Workouts > Recent sessions")
      }

      return appendAssistant(destinations.length
        ? `I saved that in ${destinations.join(" and ")}.`
        : "I couldn't map that save to a coach-controlled record.")
    }

    const targetUpdate = parseTargetUpdate(content)
    if (targetUpdate) {
      setProfile((current) => ({ ...current, ...targetUpdate }))
      return appendAssistant(`Updated your targets: ${Object.entries(targetUpdate).map(([key, value]) => `${key.replace("_", " ")} ${value}`).join(", ")}.`)
    }

    const recoveryCheckIn = parseRecoveryCheckIn(content)
    if (recoveryCheckIn) {
      setRecoveryLogs((current) => [recoveryCheckIn, ...current.filter((entry) => entry.date !== recoveryCheckIn.date)])
      const recoverySummary = summarizeRecovery(recoveryCheckIn)
      return appendAssistant(`Logged your recovery check-in. ${recoverySummary.text}`)
    }

    const activeUpdate = parseActiveWorkoutUpdate(content, activeWorkout)
    if (activeUpdate) {
      if (activeUpdate.type === "advance") {
        const nextWorkout = advanceActiveWorkout(activeWorkout)
        setActiveWorkout(nextWorkout)
        const nextExercise = getCurrentActiveExercise(nextWorkout)
        return appendAssistant(nextExercise ? `Moved on. Next exercise is ${nextExercise.name} for ${nextExercise.setsReps}.` : "Moved to the next exercise.")
      }

      if (activeUpdate.type === "finish") {
        const minutes = finishActiveWorkout()
        return appendAssistant(`Workout finished. I marked the session complete${minutes ? ` at ${minutes} minutes` : ""} and saved everything to Workouts.`)
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
          return appendAssistant(`Logged ${exercise.name} set ${setNumber}: ${activeUpdate.reps} reps at ${activeUpdate.weight_kg}kg. ${updatedSummary.completedSets}/${updatedSummary.totalSets} sets done. Next exercise: ${nextExercise?.name || "continue"}${nextExercise ? ` for ${nextExercise.setsReps}` : ""}.`)
        }
        return appendAssistant(`Logged ${exercise?.name || "set"} set ${setNumber}: ${activeUpdate.reps} reps at ${activeUpdate.weight_kg}kg. ${updatedSummary.completedSets}/${updatedSummary.totalSets} sets done.`)
      }
    }

    if (shouldBuildWeeklySchedule(content)) {
      const weeklyPlan = buildWeeklyTrainingPlan(profile, workoutSets, workouts, exercises, workoutPlans, recoveryLogs)
      setWorkoutPlans((current) => mergeWeeklyTrainingPlan(current, weeklyPlan.plans))
      const summary = weeklyPlan.plans.map((plan) => `${plan.date}: ${plan.title}`).join("\n")
      return appendAssistant(`I rebuilt your next 7 days of training.${weeklyPlan.missedCount ? ` Reshuffled ${weeklyPlan.missedCount} missed session${weeklyPlan.missedCount === 1 ? "" : "s"}.` : ""}\n\n${summary}`, { plan: weeklyPlan.plans[0] || null })
    }

    if (isProgressionQuestion(content)) {
      const plateauSummary = progressionBlock.plateaus.length
        ? ` Plateau watch: ${progressionBlock.plateaus.map((item) => item.exerciseName).join(", ")}.`
        : ""
      return appendAssistant(`${progressionBlock.title}: ${progressionBlock.summary}${plateauSummary} Next move: ${progressionBlock.adjustments[0]}`)
    }

    if (isShowWorkoutRequest(content)) {
      if (!todaysPlan) return appendAssistant("I don't have a workout planned yet. Ask me to build today's workout and I'll create one.")
      return appendAssistant(`Here’s your workout for ${todaysPlan.date || "today"}. You can review it below or start it when you're ready.`, { plan: todaysPlan })
    }

    if (isShowMealPlanRequest(content)) {
      if (!todaysMealPlan) return appendAssistant("I don't have a meal plan ready yet. Ask me to create today's meal plan and I'll sort it out.")
      return appendAssistant(formatMealPlanReply(todaysMealPlan))
    }

    const planEdit = parseWorkoutPlanEdit(content, todaysPlan)
    if (planEdit && todaysPlan) {
      const updatedPlan = applyWorkoutPlanEdit(todaysPlan, planEdit)
      setWorkoutPlans((current) => upsertWorkoutPlan(current, updatedPlan))
      return appendAssistant(`Updated today's workout. ${updatedPlan.exercises.length} exercise${updatedPlan.exercises.length === 1 ? "" : "s"} scheduled now.`, { plan: updatedPlan })
    }

    if (/(begin|start).*(workout|session)|let'?s start/.test(lower)) {
      if (!todaysPlan) return appendAssistant("I don't have a workout ready yet. Ask me to build today's workout first.")
      const session = startPlannedWorkout(todaysPlan)
      if (!session) return appendAssistant("I found the workout shell, but it has no exercises yet. I'll rebuild it if you ask for today's workout again.")
      const nextExercise = session.exercises[0]
      return appendAssistant(`Started ${todaysPlan.title}. Begin with ${nextExercise?.name || "your first exercise"}${nextExercise ? ` for ${nextExercise.setsReps}` : ""}. Tell me each set as you finish it.`)
    }

    if (activeWorkout?.id && /(what'?s next|next set|next exercise|where am i up to)/.test(lower)) {
      const nextExercise = getCurrentActiveExercise(activeWorkout)
      return appendAssistant(nextExercise
        ? `You're on ${nextExercise.name}. Logged ${nextExercise.logged_sets?.length || 0}/${nextExercise.target_sets || 1} sets so far. Target is ${nextExercise.setsReps}.`
        : "Your active workout is running, but I cannot find the current exercise.")
    }

    if (isWorkoutPlanRequest(content)) {
      const plan = buildRecoveryAdjustedWorkoutPlan(profile, workoutSets, workouts, exercises, latestRecovery, progress, recoveryLogs)
      setWorkoutPlans((current) => upsertWorkoutPlan(current, plan))
      return appendAssistant("I built today's workout and added it to Workouts. You can edit it below or begin when you're ready.", { plan })
    }

    if (isMealPlanRequest(content)) {
      const plan = buildMealPlan(profile)
      setMealPlans((current) => upsertMealPlan(current, plan))
      return appendAssistant(`I created today's meal plan from the verified Australian catalogue.\n\n${formatMealPlanReply(plan)}`)
    }

    const workoutLog = parseWorkoutLog(content)
    if (workoutLog) {
      const sessionId = uid("workout")
      setWorkouts((current) => [
        {
          id: sessionId,
          date: todayISO(),
          workout_type: workoutLog.exercise_name,
          duration_minutes: Math.round((workoutLog.duration_seconds || 0) / 60),
          notes: workoutLog.notes,
          completed: true,
        },
        ...current,
      ])
      const sets = makeWorkoutSetsFromLog(workoutLog, sessionId)
      setWorkoutSets((current) => [...sets, ...current])
      return appendAssistant(`Logged ${workoutLog.exercise_name}: ${workoutLog.sets} set(s) x ${workoutLog.reps || "time"} at ${workoutLog.weight_kg || 0}kg. Workouts and analytics updated.`, {
        loggedWorkoutIds: [sessionId],
      })
    }

    const mealLog = parseMealLog(content)
    if (mealLog) {
      if ("needsVerification" in mealLog) return appendAssistant(mealLog.reply)
      const loggedMealId = "id" in mealLog && mealLog.id ? mealLog.id : uid("meal")
      const loggedMeal = { id: loggedMealId, ...mealLog }
      setMeals((current) => [loggedMeal, ...current])
      return appendAssistant(`Logged ${loggedMeal.food_name} with verified Australian nutrition: ${loggedMeal.calories} kcal, ${loggedMeal.protein_g}g protein, ${loggedMeal.carbs_g}g carbs, ${loggedMeal.fat_g}g fat.`, {
        loggedMealIds: [loggedMeal.id],
      })
    }

    return appendAssistant(coachReply(content, { profile, totals, todaysWorkouts }))
  }

  const numberOrZero = (value) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  const applyOpenAICoachResponse = (coachResponse) => {
    let attachedPlan = null
    const rejectedActions = []
    const loggedMealIds = []
    const updatedMealIds = []
    const loggedWorkoutIds = []
    const updatedWorkoutIds = []

    for (const action of coachResponse.actions || []) {
      if (action.type === "update_targets") {
        const updates = {}
        if (action.daily_calories) updates.daily_calories = Math.round(action.daily_calories)
        if (action.protein_target_g) updates.protein_g = Math.round(action.protein_target_g)
        if (action.carbs_target_g) updates.carbs_g = Math.round(action.carbs_target_g)
        if (action.fat_target_g) updates.fat_g = Math.round(action.fat_target_g)
        if (Object.keys(updates).length) setProfile((current) => ({ ...current, ...updates }))
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
      }

      if (action.type === "log_meal") {
        const hasMacros = [action.calories, action.protein_g, action.carbs_g, action.fat_g].every((value) => Number.isFinite(Number(value)))
        if (!hasMacros) {
          continue
        } else {
          const nutritionSource = resolveMealNutritionSource(action)
          const mealId = uid("meal")
          setMeals((current) => [
            {
              id: mealId,
              date: action.date || todayISO(),
              meal_type: action.meal_type || "snack",
              food_name: action.food_name || "Estimated mixed meal",
              quantity: String(action.quantity || "1 serve"),
              calories: numberOrZero(action.calories),
              protein_g: numberOrZero(action.protein_g),
              carbs_g: numberOrZero(action.carbs_g),
              fat_g: numberOrZero(action.fat_g),
              estimated: action.estimated ?? true,
              nutrition_source: nutritionSource,
              notes: action.message || "Logged by OpenAI coach",
            },
            ...current,
          ])
          loggedMealIds.push(mealId)
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
        const nutritionSource = resolveMealNutritionSource(action, existingMeal.nutrition_source)

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
          estimated: action.estimated ?? existingMeal.estimated,
          nutrition_source: nutritionSource,
          notes: action.message || existingMeal.notes,
        }
        setMeals((current) => upsertMealEntry(current, nextMeal))
        updatedMealIds.push(mealId)
      }
    }

    const warnings = [...(coachResponse.warnings || []), ...rejectedActions].filter(Boolean)
    const suffix = warnings.length ? `\n\n${warnings.join(" ")}` : ""
    return appendAssistant(`${coachResponse.reply}${suffix}`, {
      ...(attachedPlan ? { plan: attachedPlan } : {}),
      ...(loggedMealIds.length ? { loggedMealIds } : {}),
      ...(updatedMealIds.length ? { updatedMealIds } : {}),
      ...(loggedWorkoutIds.length ? { loggedWorkoutIds } : {}),
      ...(updatedWorkoutIds.length ? { updatedWorkoutIds } : {}),
    })
  }

  const submitCoachPrompt = async (rawContent) => {
    const content = String(rawContent || "").trim()
    if (!content) return
    const userMessage = { id: uid("chat"), role: "user", content, timestamp: new Date().toISOString() }
    setInput("")
    setQuickAction(null)
    setAiError("")
    setMessages((current) => [...current, userMessage])

    const workoutFollowUp = incompleteWorkoutPrompt(content, activeWorkout)
    if (workoutFollowUp) {
      setMessages((current) => [...current, appendAssistant(workoutFollowUp)])
      return
    }

    if (isLogLocationQuestion(content) || shouldUseLocalCoach(content, { activeWorkout, todaysPlan })) {
      const assistantMessage = runLocalCoachAction(content)
      setMessages((current) => [...current, assistantMessage])
      return
    }

    setThinking(true)
    try {
      const coachResponse = await requestOpenAICoach({
        message: content,
        profile,
        meals: meals.slice(0, 12),
        workouts: workouts.slice(0, 12),
        workoutSets: workoutSets.slice(0, 24),
        workoutPlans: workoutPlans.slice(0, 6),
        mealPlans: mealPlans.slice(0, 6),
        recoveryLogs: recoveryLogs.slice(0, 6),
        activeWorkout,
        recentMessages: [...messages, userMessage].slice(-6),
      })
      if (!coachResponse) {
        const assistantMessage = appendAssistant("I couldn't get a valid response from the live coach, so I didn't log or change anything. Please try again.")
        setAiError("Live coach returned an invalid response.")
        setMessages((current) => [...current, assistantMessage])
        return
      }
      const assistantMessage = applyOpenAICoachResponse(coachResponse)
      setMessages((current) => [...current, assistantMessage])
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Live coach unavailable.")
      setMessages((current) => [
        ...current,
        appendAssistant("I couldn't reach the live coach just now, so I didn't log or change anything. Please retry in a moment."),
      ])
    } finally {
      setThinking(false)
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

  const useQuickOption = (option) => {
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

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Coach"
        title="Your training coach"
        subtitle="Plan training, log completed work, adjust nutrition, and guide sessions from one conversation."
        action={messages.length > 1 ? (
          <button type="button" onClick={clearConversation} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
            <RotateCcw size={16} /> Clear chat
          </button>
        ) : null}
      />

      <SectionCard
        tone="subtle"
        title="Start with a clean prompt"
        description="The coach works best when you tell it what happened or what you want changed. Tap a card, then choose the exact action."
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

      <section className="flex h-[65vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {(thinking || aiError) && (
          <div className={`border-b px-4 py-2 text-sm ${aiError ? "border-amber-200 bg-amber-50 text-amber-800" : "border-indigo-100 bg-indigo-50 text-indigo-700"}`}>
            {thinking ? "Coach is working..." : aiError}
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
                    onClick={() => useQuickOption(option)}
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

        <form onSubmit={send} className="flex gap-3 border-t border-slate-200 bg-white p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} placeholder={activeWorkout?.id ? "Set done 6 reps at 80kg..." : "Log bench 80kg for 4 sets of 6..."} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-950 shadow-sm" />
          <button type="button" onClick={startVoice} disabled={!speechAvailable} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-700 disabled:opacity-40">
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button type="submit" disabled={thinking} className="flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
            <Send size={17} /> {thinking ? "Sending" : "Send"}
          </button>
        </form>
      </section>
    </div>
  )
}
