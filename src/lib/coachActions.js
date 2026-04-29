import { foodToMeal, findVerifiedFood, verifiedFoods } from "@/lib/nutritionDatabase"
import { goalLabel } from "@/lib/fitnessDefaults"
import { applyProgressionBlockToPlan, recommendProgressionBlock } from "@/lib/progressionEngine"
import { adjustWorkoutForRecovery, buildWeeklyWorkoutSchedule, createActiveWorkoutSession, parseSetsRepsSpec, suggestNextWorkout, syncWeeklyPlans } from "@/lib/workoutIntelligence"
import { todayISO, uid } from "@/lib/useLocalStorage"

const muscleByExercise = {
  bench: "chest",
  "bench press": "chest",
  squat: "legs",
  "back squat": "legs",
  deadlift: "back",
  "romanian deadlift": "legs",
  "leg press": "legs",
  row: "back",
  "seated row": "back",
  "pull up": "back",
  "overhead press": "shoulders",
  treadmill: "cardio",
  plank: "core",
  curl: "arms",
  tricep: "arms",
}

function clean(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim()
}

function extractMealQuery(message) {
  const text = clean(message)
  if (!text) return ""

  return text
    .replace(/^(?:please\s+)?(?:(?:i\s+)?(?:had|ate)|log|track|add|include)\s+/, "")
    .replace(/\b(for|at)\s+(breakfast|lunch|dinner|snack)\b/g, "")
    .replace(/\b(to|into|in)\s+(my\s+)?(meal plan|plan|meals?|nutrition log)\b/g, "")
    .replace(/\btoday\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function titleCase(text) {
  return text.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}

function muscleForExercise(exercise) {
  const normalized = clean(exercise)
  const matched = Object.keys(muscleByExercise).find((key) => normalized.includes(key))
  return matched ? muscleByExercise[matched] : "full_body"
}

function findPlanExerciseIndex(plan, exerciseName) {
  const normalized = clean(exerciseName)
  return (plan?.exercises || []).findIndex((exercise) => clean(exercise.name).includes(normalized) || normalized.includes(clean(exercise.name)))
}

function parseSetsRepsPhrase(message) {
  const text = clean(message)
  const compact = text.match(/(?<sets>\d+)\s*x\s*(?<repMin>\d+)(?:-(?<repMax>\d+))?/)
  if (compact?.groups) {
    return `${compact.groups.sets}x${compact.groups.repMin}${compact.groups.repMax ? `-${compact.groups.repMax}` : ""}`
  }
  const verbose = text.match(/(?<sets>\d+)\s*sets?\s*(?:of|x)?\s*(?<repMin>\d+)(?:-(?<repMax>\d+))?/)
  if (verbose?.groups) {
    return `${verbose.groups.sets}x${verbose.groups.repMin}${verbose.groups.repMax ? `-${verbose.groups.repMax}` : ""}`
  }
  return ""
}

export function parseWorkoutLog(message) {
  const text = clean(message)
  const explicit = /\b(log|did|done|finished|completed|just did|i did|set done)\b/.test(text)
  if (!explicit) return null

  const treadmill = text.match(/(?<minutes>\d+)\s*(min|mins|minutes)\s*(?<exercise>incline treadmill|treadmill|bike|rower|cardio)/)
  if (treadmill?.groups) {
    const exercise = titleCase(treadmill.groups.exercise)
    return {
      exercise_name: exercise,
      muscle_group: "cardio",
      sets: 1,
      reps: 0,
      weight_kg: 0,
      duration_seconds: Number(treadmill.groups.minutes) * 60,
      notes: message,
    }
  }

  const xPattern = text.match(/(?<exercise>[a-z ]+?)\s+(?<weight>\d+(?:\.\d+)?)\s*kg?\s*x\s*(?<reps>\d+)\s*x\s*(?<sets>\d+)/)
  const setsPattern = text.match(/(?<exercise>[a-z ]+?)\s+(?<weight>\d+(?:\.\d+)?)\s*kg?\s*(for\s*)?(?<sets>\d+)\s*sets?\s*(of|x)?\s*(?<reps>\d+)/)
  const simplePattern = text.match(/(?<exercise>[a-z ]+?)\s+(?<weight>\d+(?:\.\d+)?)\s*kg?\s*(for|x)?\s*(?<reps>\d+)\s*reps?/)
  const match = xPattern || setsPattern || simplePattern
  if (!match?.groups) return null

  const exercise = match.groups.exercise.replace(/\b(log|did|done|finished|completed|just|i|set)\b/g, "").trim()
  const exerciseName = titleCase(exercise || "Exercise")

  return {
    exercise_name: exerciseName,
    muscle_group: muscleForExercise(exerciseName),
    sets: Number(match.groups.sets || 1),
    reps: Number(match.groups.reps || 0),
    weight_kg: Number(match.groups.weight || 0),
    duration_seconds: 0,
    notes: message,
  }
}

export function isGreeting(message) {
  return /^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(clean(message))
}

export function parseMealLog(message) {
  const text = clean(message)
  const explicit = /\b(log|ate|had|i had|i ate|for breakfast|for lunch|for dinner|snack)\b/.test(text)
  if (!explicit) return null

  const mealType = text.includes("breakfast") ? "breakfast" : text.includes("lunch") ? "lunch" : text.includes("dinner") ? "dinner" : text.includes("snack") ? "snack" : "snack"
  const query = extractMealQuery(message)
  const food = findVerifiedFood(query || text)
  if (!food) {
    return {
      needsVerification: true,
      mealType,
      query: query || message,
      reply: `I can log that, but I need a bit more detail first. How much did you have, and what was it with?`,
    }
  }

  return foodToMeal(food, {
    id: uid("meal"),
    date: todayISO(),
    meal_type: mealType,
    notes: "Logged from coach chat using verified catalogue",
  })
}

export function parseTargetUpdate(message) {
  const text = clean(message)
  const calories = text.match(/(?:calories|cals|kcal).*?(?<value>\d{3,5})|(?<value2>\d{3,5}).*?(?:calories|cals|kcal)/)
  const protein = text.match(/protein.*?(?<value>\d{2,3})\s*g/)
  if (!/\b(update|set|change|adjust)\b/.test(text) && !calories && !protein) return null

  const updates = {}
  if (calories?.groups) updates.daily_calories = Number(calories.groups.value || calories.groups.value2)
  if (protein?.groups) updates.protein_g = Number(protein.groups.value)
  return Object.keys(updates).length ? updates : null
}

export function parseRecoveryCheckIn(message) {
  const text = clean(message)
  const sleepMatch = text.match(/slept?\s+(?<hours>\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/)
  const mentionsRecovery = /\b(sleep|slept|sore|wrecked|fatigued|tired|exhausted|beat up|feel great|energized|stress)\b/.test(text)
  if (!mentionsRecovery) return null

  let soreness = 3
  let energy = 3
  let stress = 3
  let readiness = "moderate"

  if (/\b(wrecked|exhausted|fried|wrecked|beat up|dead)\b/.test(text)) {
    soreness = 5
    energy = 1
    stress = 4
    readiness = "low"
  } else if (/\b(sore|tired|fatigued|flat)\b/.test(text)) {
    soreness = 4
    energy = 2
    stress = 3
    readiness = "low"
  } else if (/\b(great|fresh|energized|strong|good)\b/.test(text)) {
    soreness = 2
    energy = 5
    stress = 2
    readiness = "high"
  }

  return {
    id: uid("recovery"),
    date: todayISO(),
    timestamp: new Date().toISOString(),
    sleep_hours: sleepMatch?.groups?.hours ? Number(sleepMatch.groups.hours) : 0,
    soreness,
    energy,
    stress,
    readiness,
    notes: message,
  }
}

export function parseWorkoutPlanEdit(message, plan) {
  if (!plan?.exercises?.length) return null
  const text = clean(message)
  if (!/\b(add|remove|swap|replace|change|update|set)\b/.test(text)) return null

  const removeMatch = text.match(/(?:remove|delete|drop)\s+(?<exercise>[a-z ]+)/)
  if (removeMatch?.groups?.exercise) {
    return { type: "remove", exerciseName: titleCase(removeMatch.groups.exercise.trim()) }
  }

  const swapMatch = text.match(/(?:swap|replace)\s+(?<from>[a-z ]+?)\s+(?:for|with)\s+(?<to>[a-z ]+?)(?:\s+(?<spec>\d+\s*x\s*\d+(?:-\d+)?))?$/)
  if (swapMatch?.groups?.from && swapMatch?.groups?.to) {
    return {
      type: "swap",
      from: titleCase(swapMatch.groups.from.trim()),
      to: titleCase(swapMatch.groups.to.trim()),
      setsReps: swapMatch.groups.spec || "",
    }
  }

  const addMatch = text.match(/(?:add|include)\s+(?<exercise>[a-z ]+?)(?:\s+(?<spec>\d+\s*x\s*\d+(?:-\d+)?))?$/)
  if (addMatch?.groups?.exercise) {
    return {
      type: "add",
      exercise: {
        name: titleCase(addMatch.groups.exercise.trim()),
        muscle: muscleForExercise(addMatch.groups.exercise),
        setsReps: addMatch.groups.spec || "3x10",
        weight_kg: 0,
      },
    }
  }

  const updateMatch = text.match(/(?:update|change|set)\s+(?<exercise>[a-z ]+?)\s+(?:to|for|at)\s+(?<spec>\d+\s*x\s*\d+(?:-\d+)?)/)
  if (updateMatch?.groups?.exercise && updateMatch?.groups?.spec) {
    return {
      type: "update",
      exerciseName: titleCase(updateMatch.groups.exercise.trim()),
      setsReps: updateMatch.groups.spec,
    }
  }

  const implicitSpec = parseSetsRepsPhrase(message)
  if (implicitSpec && /(add|include)/.test(text)) {
    const phrase = text.replace(/.*(?:add|include)\s+/, "").replace(implicitSpec.toLowerCase(), "").trim()
    if (phrase) {
      return {
        type: "add",
        exercise: {
          name: titleCase(phrase),
          muscle: muscleForExercise(phrase),
          setsReps: implicitSpec,
          weight_kg: 0,
        },
      }
    }
  }

  return null
}

export function applyWorkoutPlanEdit(plan, edit) {
  if (!plan || !edit) return plan

  if (edit.type === "remove") {
    return {
      ...plan,
      exercises: plan.exercises.filter((exercise) => findPlanExerciseIndex({ exercises: [exercise] }, edit.exerciseName) === -1),
    }
  }

  if (edit.type === "add") {
    return {
      ...plan,
      exercises: [...plan.exercises, edit.exercise],
    }
  }

  if (edit.type === "swap") {
    const index = findPlanExerciseIndex(plan, edit.from)
    if (index === -1) return plan
    const current = plan.exercises[index]
    return {
      ...plan,
      exercises: plan.exercises.map((exercise, exerciseIndex) => exerciseIndex === index ? {
        ...current,
        name: edit.to,
        muscle: muscleForExercise(edit.to),
        setsReps: edit.setsReps || current.setsReps || "3x10",
      } : exercise),
    }
  }

  if (edit.type === "update") {
    const index = findPlanExerciseIndex(plan, edit.exerciseName)
    if (index === -1) return plan
    return {
      ...plan,
      exercises: plan.exercises.map((exercise, exerciseIndex) => exerciseIndex === index ? { ...exercise, setsReps: edit.setsReps } : exercise),
    }
  }

  return plan
}

export function parseActiveWorkoutUpdate(message, activeWorkout) {
  if (!activeWorkout?.id || !activeWorkout.exercises?.length) return null
  const text = clean(message)

  if (/\b(finish workout|end workout|wrap up|done with workout)\b/.test(text)) {
    return { type: "finish" }
  }
  if (/\b(next exercise|move on|advance)\b/.test(text)) {
    return { type: "advance" }
  }

  const currentIndex = Math.min(activeWorkout.current_exercise_index || 0, activeWorkout.exercises.length - 1)
  const currentExercise = activeWorkout.exercises[currentIndex]

  const genericSet = text.match(/(?:set done|done|finished set|got)\s*(?<reps>\d+)\s*(?:reps?)?(?:\s*at\s*(?<weight>\d+(?:\.\d+)?)\s*kg)?/)
  if (genericSet?.groups) {
    return {
      type: "log_set",
      exerciseIndex: currentIndex,
      exerciseName: currentExercise?.name,
      reps: Number(genericSet.groups.reps || 0),
      weight_kg: Number(genericSet.groups.weight || currentExercise?.target_weight_kg || 0),
    }
  }

  const parsedWorkoutLog = parseWorkoutLog(message)
  if (parsedWorkoutLog) {
    const namedIndex = activeWorkout.exercises.findIndex((exercise) => clean(parsedWorkoutLog.exercise_name).includes(clean(exercise.name)) || clean(exercise.name).includes(clean(parsedWorkoutLog.exercise_name)))
    return {
      type: "log_set",
      exerciseIndex: namedIndex === -1 ? currentIndex : namedIndex,
      exerciseName: parsedWorkoutLog.exercise_name,
      reps: parsedWorkoutLog.reps,
      weight_kg: parsedWorkoutLog.weight_kg,
    }
  }

  return null
}

export function buildWorkoutPlan(profile, recentSets = [], workouts = [], exercises = []) {
  return suggestNextWorkout({ profile, workoutSets: recentSets, workouts, exercises })
}

export function buildRecoveryAdjustedWorkoutPlan(profile, recentSets = [], workouts = [], exercises = [], recoveryLog = null, progress = [], recoveryLogs = []) {
  const basePlan = buildWorkoutPlan(profile, recentSets, workouts, exercises)
  const recoveryAdjusted = adjustWorkoutForRecovery(basePlan, recoveryLog)
  const block = recommendProgressionBlock({ profile, progress, workoutSets: recentSets, recoveryLogs })
  return applyProgressionBlockToPlan(recoveryAdjusted, block)
}

export function buildWeeklyTrainingPlan(profile, recentSets = [], workouts = [], exercises = [], workoutPlans = [], recoveryLogs = []) {
  return buildWeeklyWorkoutSchedule({
    profile,
    workoutSets: recentSets,
    workouts,
    exercises,
    workoutPlans,
    recoveryLogs,
  })
}

export function mergeWeeklyTrainingPlan(existingPlans = [], generatedPlans = []) {
  return syncWeeklyPlans(existingPlans, generatedPlans)
}

export function shouldBuildWeeklySchedule(message) {
  const text = clean(message)
  return /\b(this week|weekly plan|weekly schedule|schedule my week|reshuffle my week|reshuffle week|plan my week)\b/.test(text)
}

export function isProgressionQuestion(message) {
  const text = clean(message)
  return Boolean(
    /\b(deload|plateau|plateaued|stalled|stagnant|progression|mesocycle|microcycle)\b/.test(text)
    || /\b(build block|training block|current block|current phase|what block|which block|what phase|which phase)\b/.test(text)
    || (/\b(block|phase)\b/.test(text) && /\b(train|training|program|progress|goal|workout|cycle)\b/.test(text))
  )
}

export function isWorkoutPlanRequest(message) {
  const text = clean(message)
  return /(?:\b(build|create|make|plan)\b.*\b(workout|session|program|training)\b|\bworkout plan\b|\bcoach workout\b|\bwhat should i train\b|\bi'?m at the gym\b)/.test(text)
}

export function isMealPlanRequest(message) {
  const text = clean(message)
  return /(?:\b(create|build|make|plan)\b.*\b(meal plan|nutrition plan|food plan|meals)\b|\bmeal plan\b|\bfood plan\b)/.test(text)
}

export function isShowWorkoutRequest(message) {
  const text = clean(message)
  return /(?:\b(show|see|view)\b.*\b(workout|plan|session)\b|\bwhat(?:'s| is) my workout\b|\bshow me the workout\b)/.test(text)
}

export function isShowMealPlanRequest(message) {
  const text = clean(message)
  return /(?:\b(show|see|view)\b.*\b(meal plan|food plan|meals)\b|\bwhat(?:'s| is) my meal plan\b)/.test(text)
}

export function shouldUseLocalCoach(message, { activeWorkout = null, todaysPlan = null } = {}) {
  const text = clean(message)
  return Boolean(
    parseTargetUpdate(message)
    || parseRecoveryCheckIn(message)
    || parseActiveWorkoutUpdate(message, activeWorkout)
    || shouldBuildWeeklySchedule(message)
    || isProgressionQuestion(message)
    || (todaysPlan && parseWorkoutPlanEdit(message, todaysPlan))
    || (activeWorkout?.id && /\b(what'?s next|next set|next exercise|where am i up to)\b/.test(text))
    || isShowWorkoutRequest(message)
    || isShowMealPlanRequest(message)
  )
}

export function buildMealPlan(profile) {
  const breakfast = verifiedFoods.find((food) => food.id === "greek_yoghurt_berries_oats")
  const lunch = verifiedFoods.find((food) => food.id === "chicken_rice_bowl")
  const dinner = verifiedFoods.find((food) => food.id === "salmon_potato_salad")
  const snack = verifiedFoods.find((food) => food.id === "protein_shake_40")
  const foods = [
    [breakfast, "breakfast"],
    [lunch, "lunch"],
    [dinner, "dinner"],
    [snack, "snack"],
  ].filter(([food]) => food)

  return {
    id: uid("meal_plan"),
    date: todayISO(),
    title: `${goalLabel(profile.goal)} meal plan`,
    meals: foods.map(([food, mealType]) => foodToMeal(food, {
      id: uid("meal"),
      date: todayISO(),
      meal_type: mealType,
      notes: "Planned by coach from verified Australian catalogue",
    })),
  }
}

export function buildActiveWorkoutFromPlan(plan) {
  return createActiveWorkoutSession(plan.title, plan.exercises || [])
}

export function makeWorkoutSetsFromLog(log, sessionId) {
  return Array.from({ length: Math.max(1, log.sets || 1) }, (_, index) => ({
    id: uid("set"),
    session_id: sessionId,
    exercise_name: log.exercise_name,
    muscle_group: log.muscle_group,
    set_number: index + 1,
    reps: log.reps,
    weight_kg: log.weight_kg,
    duration_seconds: log.duration_seconds,
    distance_km: 0,
    notes: log.notes,
    date: todayISO(),
  }))
}
