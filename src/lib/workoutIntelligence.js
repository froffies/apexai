import { goalLabel, numberValue } from "@/lib/fitnessDefaults"
import { todayISO, uid } from "@/lib/useLocalStorage"

const splitTemplates = {
  upper_lower: [
    { key: "upper_a", title: "Upper strength", focus: "upper", exercises: ["Bench Press", "Seated Row", "Overhead Press", "Pull Up"] },
    { key: "lower_a", title: "Lower strength", focus: "lower", exercises: ["Back Squat", "Romanian Deadlift", "Leg Press", "Plank"] },
  ],
  push_pull_legs: [
    { key: "push", title: "Push day", focus: "push", exercises: ["Bench Press", "Overhead Press", "Incline Press", "Cable Fly"] },
    { key: "pull", title: "Pull day", focus: "pull", exercises: ["Pull Up", "Seated Row", "Romanian Deadlift", "Face Pull"] },
    { key: "legs", title: "Leg day", focus: "legs", exercises: ["Back Squat", "Leg Press", "Romanian Deadlift", "Walking Lunge"] },
  ],
  full_body: [
    { key: "full_body", title: "Full body", focus: "full_body", exercises: ["Back Squat", "Bench Press", "Seated Row", "Plank"] },
  ],
}

const categoryByExercise = {
  "bench press": "chest",
  "incline press": "chest",
  "incline dumbbell press": "chest",
  "cable fly": "chest",
  "overhead press": "shoulders",
  "lateral raise": "shoulders",
  "pull up": "back",
  "lat pulldown": "back",
  "seated row": "back",
  "barbell row": "back",
  "back squat": "legs",
  "front squat": "legs",
  "leg press": "legs",
  "romanian deadlift": "legs",
  "walking lunge": "legs",
  "plank": "core",
  "cable crunch": "core",
  "incline treadmill": "cardio",
  treadmill: "cardio",
}

const weeklyOffsetsByFrequency = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 5],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
}

function cleanName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ")
}

function titleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

function isoDateOffset(baseDateString, offsetDays) {
  const base = new Date(`${baseDateString}T00:00:00`)
  base.setDate(base.getDate() + offsetDays)
  return base.toISOString().slice(0, 10)
}

function compareIsoDates(left, right) {
  return String(left || "").localeCompare(String(right || ""))
}

export function parseSetsRepsSpec(spec = "") {
  const text = String(spec || "").toLowerCase()
  const match = text.match(/(?<sets>\d+)\s*x\s*(?<min>\d+)(?:-(?<max>\d+))?/)
  if (match?.groups) {
    const repMin = Number(match.groups.min) || 0
    const repMax = Number(match.groups.max || match.groups.min) || repMin
    return {
      sets: Number(match.groups.sets) || 1,
      repMin,
      repMax,
      durationMinutes: 0,
    }
  }

  const minuteMatch = text.match(/(?<minutes>\d+)\s*(?:min|mins|minutes)/)
  if (minuteMatch?.groups) {
    return {
      sets: 1,
      repMin: 0,
      repMax: 0,
      durationMinutes: Number(minuteMatch.groups.minutes) || 0,
    }
  }

  return { sets: 3, repMin: 8, repMax: 10, durationMinutes: 0 }
}

function getCategory(name, exercises = []) {
  const normalized = cleanName(name)
  const exercise = exercises.find((item) => cleanName(item.name) === normalized)
  return exercise?.category || exercise?.muscle_group?.toLowerCase?.() || categoryByExercise[normalized] || "full_body"
}

export function buildExerciseHistory(workoutSets = [], exercises = []) {
  const grouped = new Map()

  for (const set of workoutSets) {
    const normalized = cleanName(set.exercise_name)
    if (!normalized) continue
    const current = grouped.get(normalized) || {
      key: normalized,
      name: titleCase(set.exercise_name || ""),
      category: getCategory(set.exercise_name, exercises),
      count: 0,
      sessions: new Set(),
      latest: null,
      bestWeight: 0,
      bestReps: 0,
      bestVolume: 0,
      averageWeight: 0,
      averageReps: 0,
      totalWeight: 0,
      totalReps: 0,
    }

    const reps = numberValue(set.reps)
    const weight = numberValue(set.weight_kg)
    const volume = reps * weight
    current.count += 1
    current.sessions.add(set.session_id || `${set.date}_${normalized}`)
    current.totalWeight += weight
    current.totalReps += reps
    if (!current.latest || String(set.date || "") >= String(current.latest.date || "")) current.latest = set
    if (weight > current.bestWeight) current.bestWeight = weight
    if (reps > current.bestReps) current.bestReps = reps
    if (volume > current.bestVolume) current.bestVolume = volume

    grouped.set(normalized, current)
  }

  return [...grouped.values()]
    .map((entry) => {
      const averageWeight = entry.count ? Math.round((entry.totalWeight / entry.count) * 10) / 10 : 0
      const averageReps = entry.count ? Math.round((entry.totalReps / entry.count) * 10) / 10 : 0
      const suggestedWeight = entry.bestWeight
        ? Math.round((entry.bestWeight + (entry.latest?.reps >= entry.bestReps ? entry.bestWeight * 0.025 : 0)) * 10) / 10
        : 0

      return {
        ...entry,
        sessionCount: entry.sessions.size,
        averageWeight,
        averageReps,
        suggestedWeight,
      }
    })
    .sort((left, right) => String(right.latest?.date || "").localeCompare(String(left.latest?.date || "")) || right.count - left.count)
}

export function buildExerciseHistoryMap(workoutSets = [], exercises = []) {
  return Object.fromEntries(buildExerciseHistory(workoutSets, exercises).map((entry) => [cleanName(entry.name), entry]))
}

export function getExerciseAutocompleteOptions({ query = "", exercises = [], workoutSets = [], limit = 12 }) {
  const normalizedQuery = cleanName(query)
  const historyMap = buildExerciseHistoryMap(workoutSets, exercises)
  const merged = new Map()

  for (const exercise of exercises) {
    const normalized = cleanName(exercise.name)
    merged.set(normalized, {
      id: exercise.id || normalized,
      name: exercise.name,
      category: exercise.category || exercise.muscle_group || getCategory(exercise.name, exercises),
      history: historyMap[normalized] || null,
    })
  }

  for (const history of Object.values(historyMap)) {
    if (!merged.has(history.key)) {
      merged.set(history.key, {
        id: history.key,
        name: history.name,
        category: history.category,
        history,
      })
    }
  }

  return [...merged.values()]
    .filter((entry) => {
      if (!normalizedQuery) return true
      const haystack = `${cleanName(entry.name)} ${cleanName(entry.category)}`
      return haystack.includes(normalizedQuery)
    })
    .sort((left, right) => {
      const leftScore = (left.history?.sessionCount || 0) * 10 + (cleanName(left.name).startsWith(normalizedQuery) ? 5 : 0)
      const rightScore = (right.history?.sessionCount || 0) * 10 + (cleanName(right.name).startsWith(normalizedQuery) ? 5 : 0)
      return rightScore - leftScore || left.name.localeCompare(right.name)
    })
    .slice(0, limit)
}

export function getRecentExerciseNames(workoutSets = [], limit = 8) {
  const seen = new Set()
  const recent = []
  for (const set of [...workoutSets].sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")))) {
    const normalized = cleanName(set.exercise_name)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    recent.push(titleCase(set.exercise_name))
    if (recent.length >= limit) break
  }
  return recent
}

function chooseSplitTemplate(profile = {}) {
  const splitType = typeof profile?.["split_type"] === "string" ? profile["split_type"] : "upper_lower"
  if (splitType === "push_pull_legs") return splitTemplates.push_pull_legs
  if (splitType === "full_body") return splitTemplates.full_body
  return splitTemplates.upper_lower
}

function buildPlanFromTemplate(templateEntry, historyMap, exercises, meta = {}) {
  return {
    id: meta.id || uid("plan"),
    date: meta.date || todayISO(),
    title: meta.title || templateEntry.title,
    focus: templateEntry.focus,
    status: meta.status || "planned",
    source: meta.source || "auto",
    reason: meta.reason || "",
    reshuffled_from: meta.reshuffled_from || "",
    adjustment: meta.adjustment || "",
    exercises: templateEntry.exercises.map((name) => buildExerciseTarget(name, historyMap, exercises)),
  }
}

function lastTemplateKey(workouts = [], template = []) {
  const recentWorkout = [...workouts]
    .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")) || String(right.id || "").localeCompare(String(left.id || "")))[0]
  if (!recentWorkout) return ""
  const normalized = cleanName(recentWorkout.workout_type)
  return template.find((item) => normalized.includes(cleanName(item.title)) || normalized.includes(item.key.replace(/_/g, " ")))?.key || ""
}

function buildExerciseTarget(name, historyMap, exercises) {
  const history = historyMap[cleanName(name)]
  const category = getCategory(name, exercises)

  if (category === "cardio") {
    return { name, muscle: category, setsReps: "15 min", weight_kg: 0 }
  }
  if (category === "core") {
    return { name, muscle: category, setsReps: "3x12", weight_kg: 0 }
  }

  const repRange = category === "legs" ? "3x8-10" : "4x6-8"
  const suggestedWeight = history?.suggestedWeight || history?.bestWeight || history?.latest?.weight_kg || 0

  return {
    name,
    muscle: category,
    setsReps: repRange,
    weight_kg: suggestedWeight,
  }
}

export function suggestNextWorkout({ profile = {}, exercises = [], workoutSets = [], workouts = [] }) {
  const goal = typeof profile?.["goal"] === "string" ? profile["goal"] : "general_fitness"
  const splitType = typeof profile?.["split_type"] === "string" ? profile["split_type"] : "upper_lower"
  const template = chooseSplitTemplate(profile)
  const previousKey = lastTemplateKey(workouts, template)
  const currentIndex = template.findIndex((item) => item.key === previousKey)
  const nextTemplate = template[(currentIndex + 1 + template.length) % template.length] || template[0]
  const historyMap = buildExerciseHistoryMap(workoutSets, exercises)
  const targetExercises = nextTemplate.exercises.map((name) => buildExerciseTarget(name, historyMap, exercises))

  return {
    id: uid("plan"),
    date: todayISO(),
    title: nextTemplate.title,
    focus: nextTemplate.focus,
    status: "planned",
    reason: `Built for your ${goalLabel(goal).toLowerCase()} goal using your ${splitType || "upper/lower"} split and recent training history.`,
    exercises: targetExercises,
  }
}

export function getLatestRecoveryLog(recoveryLogs = []) {
  return [...recoveryLogs].sort((left, right) => compareIsoDates(right.date || right.timestamp, left.date || left.timestamp))[0] || null
}

export function computeRecoveryScore(recoveryLog) {
  if (!recoveryLog) return 70
  let score = 72
  const sleepHours = numberValue(recoveryLog.sleep_hours)
  const soreness = numberValue(recoveryLog.soreness)
  const energy = numberValue(recoveryLog.energy)
  const stress = numberValue(recoveryLog.stress)

  if (sleepHours) score += Math.min(16, (sleepHours - 7) * 6)
  if (soreness) score -= soreness * 7
  if (energy) score += (energy - 3) * 8
  if (stress) score -= (stress - 3) * 5

  if (String(recoveryLog.readiness || "").toLowerCase() === "low") score -= 10
  if (String(recoveryLog.readiness || "").toLowerCase() === "high") score += 6

  return Math.max(10, Math.min(100, Math.round(score)))
}

export function recoveryBand(score) {
  if (score >= 82) return "high"
  if (score >= 60) return "moderate"
  return "low"
}

export function summarizeRecovery(recoveryLog) {
  if (!recoveryLog) return { score: 70, band: "moderate", text: "No recovery check-in yet. Training at normal readiness." }
  const score = computeRecoveryScore(recoveryLog)
  const band = recoveryBand(score)
  if (band === "high") {
    return {
      score,
      band,
      text: `Readiness looks high (${score}/100). Good day to push normal loading or a small progression.`,
    }
  }
  if (band === "low") {
    return {
      score,
      band,
      text: `Readiness looks low (${score}/100). Reduce load, trim volume, or reshuffle the heavy day.`,
    }
  }
  return {
    score,
    band,
    text: `Readiness is moderate (${score}/100). Train as planned, but keep 1-2 reps in reserve.`,
  }
}

export function adjustWorkoutForRecovery(plan, recoveryLog) {
  if (!plan) return plan
  const summary = summarizeRecovery(recoveryLog)
  if (summary.band === "moderate") return { ...plan, adjustment: summary.text, readiness_score: summary.score }

  if (summary.band === "high") {
    return {
      ...plan,
      adjustment: summary.text,
      readiness_score: summary.score,
      exercises: (plan.exercises || []).map((exercise) => ({
        ...exercise,
        weight_kg: exercise.weight_kg ? Math.round(exercise.weight_kg * 1.025 * 10) / 10 : exercise.weight_kg,
      })),
    }
  }

  return {
    ...plan,
    title: `${plan.title} (Recovery-adjusted)`,
    adjustment: summary.text,
    readiness_score: summary.score,
    exercises: (plan.exercises || []).map((exercise) => {
      const parsed = parseSetsRepsSpec(exercise.setsReps)
      const reducedSets = Math.max(1, parsed.sets - 1)
      const reducedLoad = exercise.weight_kg ? Math.round(exercise.weight_kg * 0.9 * 10) / 10 : 0
      return {
        ...exercise,
        setsReps: parsed.durationMinutes ? exercise.setsReps : `${reducedSets}x${parsed.repMin}${parsed.repMax !== parsed.repMin ? `-${parsed.repMax}` : ""}`,
        weight_kg: reducedLoad,
      }
    }),
  }
}

export function buildWeeklyWorkoutSchedule({ profile = {}, exercises = [], workoutSets = [], workouts = [], workoutPlans = [], recoveryLogs = [] }) {
  const historyMap = buildExerciseHistoryMap(workoutSets, exercises)
  const template = chooseSplitTemplate(profile)
  const lastKey = lastTemplateKey(workouts, template)
  const startIndex = Math.max(0, template.findIndex((item) => item.key === lastKey) + 1) % template.length
  const trainingDays = Math.max(1, Math.min(7, Number(profile?.["training_days_per_week"]) || template.length || 4))
  const offsets = weeklyOffsetsByFrequency[trainingDays] || weeklyOffsetsByFrequency[4]
  const today = todayISO()
  const nextSevenDates = Array.from({ length: 7 }, (_, index) => isoDateOffset(today, index))
  const completedWorkoutDates = new Set(workouts.filter((workout) => workout.completed !== false).map((workout) => workout.date))
  const missedPlans = [...workoutPlans]
    .filter((plan) => compareIsoDates(plan.date, today) < 0 && plan.status !== "completed" && plan.status !== "cancelled" && !completedWorkoutDates.has(plan.date))
    .sort((left, right) => compareIsoDates(left.date, right.date))
  const recoveryLog = getLatestRecoveryLog(recoveryLogs)
  let missedIndex = 0
  let rotationIndex = startIndex

  const plans = offsets
    .map((offset) => nextSevenDates[offset])
    .filter(Boolean)
    .map((date) => {
      const existing = workoutPlans.find((plan) => plan.date === date && plan.status !== "completed")
      if (existing) return existing

      if (missedIndex < missedPlans.length) {
        const missedPlan = missedPlans[missedIndex++]
        const reshuffled = {
          ...missedPlan,
          id: `plan_${date}_${cleanName(missedPlan.title).replace(/\s+/g, "_")}`,
          date,
          status: "planned",
          source: "reshuffled",
          reshuffled_from: missedPlan.date,
          adjustment: date === today ? summarizeRecovery(recoveryLog).text : missedPlan.adjustment || "",
        }
        return date === today ? adjustWorkoutForRecovery(reshuffled, recoveryLog) : reshuffled
      }

      const templateEntry = template[rotationIndex % template.length]
      rotationIndex += 1
      const autoPlan = buildPlanFromTemplate(templateEntry, historyMap, exercises, {
        id: `plan_${date}_${templateEntry.key}`,
        date,
        source: "auto",
        reason: `Auto-scheduled from your ${profile?.["split_type"] || "upper/lower"} split.`,
      })
      return date === today ? adjustWorkoutForRecovery(autoPlan, recoveryLog) : autoPlan
    })

  return {
    plans,
    missedCount: missedPlans.length,
    readiness: summarizeRecovery(recoveryLog),
  }
}

export function syncWeeklyPlans(existingPlans = [], generatedPlans = []) {
  const generatedById = new Map(generatedPlans.map((plan) => [plan.id, plan]))
  const existingPreserved = existingPlans.filter((plan) => {
    if (plan.status === "completed" || plan.status === "cancelled") return true
    return !generatedById.has(plan.id)
  })
  return [...generatedPlans, ...existingPreserved].sort((left, right) => compareIsoDates(left.date, right.date))
}

export function detectSessionRecords(sessionSets = [], allWorkoutSets = []) {
  return sessionSets.reduce((records, set) => {
    const normalized = cleanName(set.exercise_name)
    if (!normalized) return records
    const previousSets = allWorkoutSets.filter((item) => cleanName(item.exercise_name) === normalized && item.id !== set.id)
    const previousBestWeight = Math.max(0, ...previousSets.map((item) => numberValue(item.weight_kg)))
    const previousBestVolume = Math.max(0, ...previousSets.map((item) => numberValue(item.weight_kg) * numberValue(item.reps)))
    const currentVolume = numberValue(set.weight_kg) * numberValue(set.reps)
    if (numberValue(set.weight_kg) > previousBestWeight) {
      records.push(`${titleCase(set.exercise_name)} new load PR: ${set.weight_kg}kg`)
    } else if (currentVolume > previousBestVolume && currentVolume > 0) {
      records.push(`${titleCase(set.exercise_name)} new volume PR: ${currentVolume} total kg`)
    }
    return records
  }, [])
}

export function createActiveWorkoutSession(name, exercises = []) {
  return {
    id: uid("active"),
    session_id: uid("workout"),
    date: todayISO(),
    name: name || "Active workout",
    started_at: new Date().toISOString(),
    current_exercise_index: 0,
    exercises: exercises.map((exercise, index) => {
      const parsed = parseSetsRepsSpec(exercise.setsReps)
      const targetSets = parsed.durationMinutes ? 1 : parsed.sets
      return {
        id: exercise.id || uid(`active_exercise_${index}`),
        name: exercise.name || `Exercise ${index + 1}`,
        muscle: exercise.muscle || getCategory(exercise.name),
        setsReps: exercise.setsReps || "3x8",
        target_sets: targetSets,
        target_rep_min: parsed.repMin,
        target_rep_max: parsed.repMax,
        target_duration_minutes: parsed.durationMinutes,
        target_weight_kg: numberValue(exercise.weight_kg),
        logged_sets: [],
        completed: false,
      }
    }),
  }
}

export function getCurrentActiveExercise(activeWorkout) {
  if (!activeWorkout?.exercises?.length) return null
  const index = Math.min(activeWorkout.current_exercise_index || 0, activeWorkout.exercises.length - 1)
  return activeWorkout.exercises[index]
}

export function logSetToActiveWorkout(activeWorkout, payload = {}) {
  if (!activeWorkout?.exercises?.length) return activeWorkout

  const requestedIndex = Number.isInteger(payload.exerciseIndex) ? payload.exerciseIndex : (activeWorkout.current_exercise_index || 0)
  const exerciseIndex = Math.max(0, Math.min(requestedIndex, activeWorkout.exercises.length - 1))

  return {
    ...activeWorkout,
    current_exercise_index: exerciseIndex,
    exercises: activeWorkout.exercises.map((exercise, index) => {
      if (index !== exerciseIndex) return exercise
      const nextSet = {
        reps: numberValue(payload.reps),
        weight_kg: numberValue(payload.weight_kg ?? exercise.target_weight_kg),
        logged_at: new Date().toISOString(),
      }
      const logged_sets = [...(exercise.logged_sets || []), nextSet]
      return {
        ...exercise,
        logged_sets,
        completed: logged_sets.length >= (exercise.target_sets || 1),
      }
    }),
  }
}

export function advanceActiveWorkout(activeWorkout) {
  if (!activeWorkout?.exercises?.length) return activeWorkout
  const currentIndex = activeWorkout.current_exercise_index || 0
  if (currentIndex >= activeWorkout.exercises.length - 1) return activeWorkout
  return {
    ...activeWorkout,
    current_exercise_index: currentIndex + 1,
  }
}

export function summarizeActiveWorkout(activeWorkout) {
  const exercises = activeWorkout?.exercises || []
  const completedExercises = exercises.filter((exercise) => exercise.completed).length
  const totalExercises = exercises.length
  const completedSets = exercises.reduce((sum, exercise) => sum + (exercise.logged_sets?.length || 0), 0)
  const totalSets = exercises.reduce((sum, exercise) => sum + (exercise.target_sets || 0), 0)
  return {
    completedExercises,
    totalExercises,
    completedSets,
    totalSets,
  }
}
