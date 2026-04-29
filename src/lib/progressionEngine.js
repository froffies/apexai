import { goalLabel, numberValue } from "@/lib/fitnessDefaults"

function isoDate(value) {
  if (!value) return ""
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(0, 10)
}

function weekStartIso(value) {
  const date = new Date(`${isoDate(value)}T00:00:00`)
  const day = date.getDay()
  const diff = (day + 6) % 7
  date.setDate(date.getDate() - diff)
  return date.toISOString().slice(0, 10)
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

function average(values = []) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + numberValue(value), 0) / values.length
}

function lastItems(items = [], count = 4) {
  return items.slice(Math.max(0, items.length - count))
}

export function groupExerciseSessions(workoutSets = []) {
  const exerciseMap = new Map()

  for (const set of workoutSets) {
    const exerciseKey = cleanName(set.exercise_name)
    if (!exerciseKey) continue
    const sessionKey = set.session_id || `${set.date}_${exerciseKey}`
    const date = isoDate(set.date)
    const reps = numberValue(set.reps)
    const weight = numberValue(set.weight_kg)
    const volume = reps * weight

    if (!exerciseMap.has(exerciseKey)) exerciseMap.set(exerciseKey, new Map())
    const sessionMap = exerciseMap.get(exerciseKey)
    const current = sessionMap.get(sessionKey) || {
      exerciseName: titleCase(set.exercise_name),
      date,
      sessionId: sessionKey,
      totalVolume: 0,
      bestWeight: 0,
      bestReps: 0,
      sets: 0,
    }

    current.totalVolume += volume
    current.bestWeight = Math.max(current.bestWeight, weight)
    current.bestReps = Math.max(current.bestReps, reps)
    current.sets += 1

    sessionMap.set(sessionKey, current)
  }

  return Object.fromEntries(
    [...exerciseMap.entries()].map(([exerciseKey, sessionMap]) => [
      exerciseKey,
      [...sessionMap.values()].sort((left, right) => String(left.date).localeCompare(String(right.date))),
    ])
  )
}

export function detectPlateauedExercises(workoutSets = []) {
  const sessionsByExercise = groupExerciseSessions(workoutSets)

  return Object.values(sessionsByExercise)
    .map((sessions) => {
      if (sessions.length < 4) return null
      const recent = lastItems(sessions, 4)
      const bestWeights = recent.map((session) => session.bestWeight)
      const bestVolumes = recent.map((session) => session.totalVolume)
      const weightRange = Math.max(...bestWeights) - Math.min(...bestWeights)
      const volumeRange = Math.max(...bestVolumes) - Math.min(...bestVolumes)
      const weightTrend = bestWeights[bestWeights.length - 1] - bestWeights[0]
      const volumeTrend = bestVolumes[bestVolumes.length - 1] - bestVolumes[0]
      const plateaued = weightRange <= 2.5 && weightTrend <= 0.5 && volumeTrend <= Math.max(60, Math.round(average(bestVolumes) * 0.08))
      if (!plateaued) return null
      return {
        exerciseName: recent[0].exerciseName,
        sessionsObserved: recent.length,
        bestWeight: Math.max(...bestWeights),
        averageVolume: Math.round(average(bestVolumes)),
        suggestion: `Progress has flattened on ${recent[0].exerciseName}. Switch the rep range for 1-2 weeks or trim load 5-8% and rebuild clean reps.`,
      }
    })
    .filter(Boolean)
}

export function buildWeeklyVolumeTrend(workoutSets = [], weeks = 6) {
  const grouped = workoutSets.reduce((map, set) => {
    const key = weekStartIso(set.date)
    map[key] = (map[key] || 0) + numberValue(set.weight_kg) * numberValue(set.reps)
    return map
  }, {})

  return Object.entries(grouped)
    .map(([week, volume]) => ({ week, volume: Math.round(volume) }))
    .sort((left, right) => String(left.week).localeCompare(String(right.week)))
    .slice(-weeks)
}

export function computeWeightTrend(progress = [], days = 28) {
  const sorted = [...progress]
    .filter((entry) => entry.date && entry.weight_kg)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
  if (sorted.length < 2) return { deltaKg: 0, weeklyRateKg: 0, samples: sorted.length }
  const recent = sorted.slice(-Math.max(2, Math.min(sorted.length, days)))
  const deltaKg = numberValue(recent[recent.length - 1].weight_kg) - numberValue(recent[0].weight_kg)
  const newestDate = new Date(`${recent[recent.length - 1].date}T00:00:00`).getTime()
  const oldestDate = new Date(`${recent[0].date}T00:00:00`).getTime()
  const daySpan = Math.max(1, Math.round((newestDate - oldestDate) / 86400000))
  const weeklyRateKg = (deltaKg / daySpan) * 7
  return { deltaKg, weeklyRateKg, samples: recent.length }
}

export function recommendProgressionBlock({ profile = {}, progress = [], workoutSets = [], recoveryLogs = [] }) {
  const goal = typeof profile?.["goal"] === "string" ? profile["goal"] : "general_fitness"
  const plateaus = detectPlateauedExercises(workoutSets)
  const weeklyVolume = buildWeeklyVolumeTrend(workoutSets, 6)
  const recentRecovery = [...recoveryLogs].slice(0, 3)
  const lowRecoveryDays = recentRecovery.filter((entry) => String(entry.readiness || "").toLowerCase() === "low").length
  const averageSleep = average(recentRecovery.map((entry) => entry.sleep_hours))
  const weightTrend = computeWeightTrend(progress, 28)
  const recentVolume = average(weeklyVolume.slice(-2).map((entry) => entry.volume))
  const previousVolume = average(weeklyVolume.slice(-4, -2).map((entry) => entry.volume))

  let phase = "build"
  let title = "Build block"
  let durationWeeks = 4
  let summary = `Stay in a normal build block for your ${goalLabel(goal).toLowerCase()} goal.`
  let adjustments = ["Progress load when reps stay clean and sleep is stable."]

  if (lowRecoveryDays >= 2 || (averageSleep && averageSleep < 6)) {
    phase = "deload"
    title = "Deload week"
    durationWeeks = 1
    summary = "Recovery markers are poor. Deload this week: reduce load and total volume so fatigue can clear."
    adjustments = ["Cut working load by about 10%.", "Remove 1 set from each main lift.", "Keep cardio easy and short."]
  } else if (plateaus.length >= 2) {
    phase = "plateau_breaker"
    title = "Plateau breaker"
    durationWeeks = 2
    summary = "Multiple lifts have flattened. Change the stimulus slightly instead of forcing more fatigue."
    adjustments = ["Rotate stalled lifts into a slightly higher rep range for 2 weeks.", "Keep technique crisp and stop 1-2 reps shy of failure.", "Only push load again after performance rebounds."]
  } else if (goal === "fat_loss" && Math.abs(weightTrend.weeklyRateKg) < 0.15 && weightTrend.samples >= 3) {
    phase = "fat_loss_adjust"
    title = "Fat-loss adjustment"
    durationWeeks = 2
    summary = "Weight trend is essentially flat. Keep training steady and tighten nutrition or activity before changing the split."
    adjustments = ["Audit calories for 7 more days.", "Add one small cardio slot or more daily steps.", "Keep lifting progression conservative while you re-establish the deficit."]
  } else if (goal === "muscle_gain" && previousVolume > 0 && recentVolume < previousVolume * 0.9) {
    phase = "volume_rebuild"
    title = "Volume rebuild"
    durationWeeks = 3
    summary = "Training volume has drifted down. Rebuild consistency before trying to force top-end loads."
    adjustments = ["Return to your planned weekly frequency.", "Add back one accessory slot per session.", "Progress reps first, then load."]
  }

  return {
    phase,
    title,
    durationWeeks,
    summary,
    adjustments,
    plateaus,
    weeklyVolume,
    weightTrend,
  }
}

export function applyProgressionBlockToPlan(plan, block) {
  if (!plan || !block) return plan
  if (block.phase === "build" || block.phase === "fat_loss_adjust" || block.phase === "volume_rebuild") {
    return {
      ...plan,
      block_phase: block.phase,
      block_title: block.title,
      block_summary: block.summary,
    }
  }

  if (block.phase === "deload") {
    return {
      ...plan,
      title: `${plan.title} (${block.title})`,
      block_phase: block.phase,
      block_title: block.title,
      block_summary: block.summary,
      exercises: (plan.exercises || []).map((exercise) => ({
        ...exercise,
        setsReps: String(exercise.setsReps || "").replace(/^(\d+)/, (value) => String(Math.max(1, Number(value) - 1))),
        weight_kg: exercise.weight_kg ? Math.round(exercise.weight_kg * 0.9 * 10) / 10 : 0,
      })),
    }
  }

  if (block.phase === "plateau_breaker") {
    const plateauNames = new Set(block.plateaus.map((item) => cleanName(item.exerciseName)))
    return {
      ...plan,
      title: `${plan.title} (${block.title})`,
      block_phase: block.phase,
      block_title: block.title,
      block_summary: block.summary,
      exercises: (plan.exercises || []).map((exercise) => plateauNames.has(cleanName(exercise.name))
        ? { ...exercise, setsReps: "3x8-10" }
        : exercise),
    }
  }

  return plan
}
