function safeArray(value, limit = 8) {
  return Array.isArray(value) ? value.slice(0, limit) : []
}

function safeNumber(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

function titleCase(text) {
  return String(text || "")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}

function stripPromptPrefix(prompt) {
  return String(prompt || "")
    .replace(/^(?:please\s+)?(?:(?:i\s+)?(?:had|ate)|log|track|add|include|save)\s+/i, "")
    .trim()
}

function summarizeCoachAction(action) {
  if (!action || typeof action !== "object") return ""

  if (action.type === "create_workout_plan") {
    const title = String(action.title || "your workout").trim()
    return `I mapped out ${title} and attached it below.`
  }

  if (action.type === "create_meal_plan") {
    return "I put together a meal plan and saved it for today."
  }

  if (action.type === "log_workout") {
    return "I logged that workout for you."
  }

  if (action.type === "update_workout_log") {
    return "I updated that workout log for you."
  }

  if (action.type === "log_meal") {
    return "I logged that meal for you."
  }

  if (action.type === "update_meal_log") {
    return "I updated that meal log for you."
  }

  if (action.type === "update_targets") {
    return "I updated your targets."
  }

  if (action.type === "clarify") {
    return String(action.message || "").trim()
  }

  return ""
}

function normalizeAction(action) {
  return action && typeof action === "object" && typeof action.type === "string" ? action : null
}

function clarifyAction(message) {
  return {
    type: "clarify",
    message,
  }
}

function extractReplyMacros(reply) {
  const text = String(reply || "")
  const match = text.match(/(\d[\d,]*(?:\.\d+)?)\s*calories?.*?(\d[\d,]*(?:\.\d+)?)g\s*protein.*?(\d[\d,]*(?:\.\d+)?)g\s*(?:carbs?|carbohydrates).*?(\d[\d,]*(?:\.\d+)?)g\s*fat/i)
  if (!match) return null
  const [calories, protein_g, carbs_g, fat_g] = match.slice(1).map(safeNumber)
  if (![calories, protein_g, carbs_g, fat_g].every((value) => value !== null)) return null
  return { calories, protein_g, carbs_g, fat_g }
}

function inferMealNameFromPrompt(prompt) {
  const stripped = stripPromptPrefix(prompt)
  if (!stripped) return ""
  return stripped.charAt(0).toUpperCase() + stripped.slice(1)
}

function looksLikeWorkoutPlanPrompt(prompt) {
  const text = String(prompt || "").toLowerCase()
  return /\b(build|make|create|plan|show|design)\b.*\bworkout\b/.test(text)
    || /\btoday'?s workout\b/.test(text)
    || /\bwhat should i train\b/.test(text)
}

function extractExercisesFromReply(reply) {
  const text = String(reply || "")
  const exercises = []
  const seen = new Set()
  const patterns = [
    /(?:^|[\n\r]|\s)\d+[.)]\s*([A-Za-z][A-Za-z\s'/-]+?)\s*\((\d+)\s*sets?\s*of\s*(\d+(?:-\d+)?)\s*reps?\)/gi,
    /(?:^|[\n\r]|\s)\d+[.)]\s*([A-Za-z][A-Za-z\s'/-]+?)\s*-\s*(\d+)\s*sets?\s*of\s*(\d+(?:-\d+)?)\s*reps/gi,
    /(?:^|[\n\r]|\s)(?:\d+[.)]\s*)?([A-Za-z][A-Za-z\s'/-]+?),\s*(\d+)\s*sets?\s*of\s*(\d+(?:-\d+)?)\s*reps/gi,
    /(?:^|[\n\r]|\s)(?:\d+[.)]\s*)?([A-Za-z][A-Za-z\s'/-]+?)[:,-]\s*(\d+)\s*x\s*(\d+(?:-\d+)?)/gi,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) && exercises.length < 8) {
      const name = titleCase(match[1])
      const sets = match[2]
      const reps = match[3]
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      exercises.push({
        name,
        muscle: "full_body",
        setsReps: `${sets}x${reps}`,
        weight_kg: 0,
      })
    }
  }
  if (exercises.length) return exercises

  const plainListMatch = [
    /(?:exercises?|workout(?: for today)?)[^:]*:\s*([^.!?]+)/i,
    /(?:including exercises like|exercises like)\s+([^.!?]+)/i,
    /(?:workout(?: could include| includes)?|routine(?: could include| includes)?)\s+([^.!?]+)/i,
  ]
    .map((pattern) => text.match(pattern))
    .find(Boolean)
  const plainList = plainListMatch?.[1] || ""
  if (!plainList) return exercises

  for (const item of plainList.split(/\band\b|,/i).map((entry) => titleCase(entry.replace(/^\d+[.)]\s*/, "").replace(/\bhow many sets.*$/i, "").trim())).filter(Boolean)) {
    const normalized = item.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    exercises.push({
      name: item,
      muscle: "full_body",
      setsReps: "3x8",
      weight_kg: 0,
    })
    if (exercises.length >= 8) break
  }
  return exercises
}

function inferWorkoutFromPrompt(prompt) {
  const text = String(prompt || "").toLowerCase().replace(/\s+/g, " ").trim()
  if (!text) return null

  const treadmill = text.match(/(?<minutes>\d+)\s*(min|mins|minutes)\s*(?<exercise>incline treadmill|treadmill|bike|rower|cardio)/)
  if (treadmill?.groups) {
    return {
      exercise_name: titleCase(treadmill.groups.exercise),
      workout_type: titleCase(treadmill.groups.exercise),
      muscle_group: "cardio",
      sets: 1,
      reps: 0,
      weight_kg: 0,
      duration_seconds: Number(treadmill.groups.minutes) * 60,
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
    workout_type: exerciseName,
    muscle_group: "full_body",
    sets: Number(match.groups.sets || 1),
    reps: Number(match.groups.reps || 0),
    weight_kg: Number(match.groups.weight || 0),
    duration_seconds: 0,
  }
}

function hasMealMacros(action) {
  return ["calories", "protein_g", "carbs_g", "fat_g"].every((key) => Number.isFinite(Number(action?.[key])))
}

function defaultMealNutritionSource(action) {
  const explicit = typeof action?.nutrition_source === "string" ? action.nutrition_source.trim() : ""
  if (explicit) return explicit
  if (!hasMealMacros(action)) return ""
  return "Coach estimate from user-described ingredients and amounts"
}

function defaultMealFoodName(action) {
  const explicit = typeof action?.food_name === "string" ? action.food_name.trim() : ""
  if (explicit) return explicit
  if (!hasMealMacros(action)) return ""
  return "Estimated mixed meal"
}

function defaultMealQuantity(action) {
  if (typeof action?.quantity === "string" && action.quantity.trim()) return action.quantity.trim()
  if (typeof action?.quantity === "number" && Number.isFinite(action.quantity)) return String(action.quantity)
  if (!hasMealMacros(action)) return ""
  return "1 meal"
}

function normalizeMealAction(action) {
  if (!action || typeof action !== "object") return action

  if (action.type === "log_meal" || action.type === "update_meal_log") {
    const nutritionSource = defaultMealNutritionSource(action)
    const foodName = defaultMealFoodName(action)
    const quantity = defaultMealQuantity(action)
    if (!nutritionSource && !foodName && !quantity) return action
    return {
      ...action,
      estimated: action.estimated ?? true,
      ...(foodName ? { food_name: foodName } : {}),
      ...(quantity ? { quantity } : {}),
      ...(nutritionSource ? { nutrition_source: nutritionSource } : {}),
    }
  }

  return action
}

function repairIncompleteAction(action, reply, prompt) {
  if (!action || typeof action !== "object") return action
  const hasRepairContext = Boolean(String(reply || "").trim() || String(prompt || "").trim())

  if ((action.type === "log_meal" || action.type === "update_meal_log") && !hasMealMacros(action)) {
    if (!hasRepairContext) return action
    const macros = extractReplyMacros(reply)
    if (!macros) {
      return clarifyAction("I need a bit more detail before I can log that meal accurately. Tell me the amount, serving size, or key ingredients.")
    }
    return normalizeMealAction({
      ...action,
      ...macros,
      food_name: action.food_name || inferMealNameFromPrompt(prompt) || "Estimated mixed meal",
      quantity: action.quantity || "1 meal",
      estimated: action.estimated ?? true,
      nutrition_source: action.nutrition_source || "Coach estimate from user-described ingredients and amounts",
    })
  }

  if (action.type === "create_workout_plan" && !safeArray(action.exercises, 8).length) {
    if (!hasRepairContext) return action
    const exercises = extractExercisesFromReply(reply)
    if (!exercises.length) {
      return clarifyAction("I don't have a saved workout to show yet. Ask me to build today's workout and I'll create one.")
    }
    return {
      ...action,
      title: action.title || "Coach workout",
      exercises,
    }
  }

  if ((action.type === "log_workout" || action.type === "update_workout_log") && !String(action.exercise_name || action.workout_type || "").trim()) {
    if (!hasRepairContext) return action
    const inferred = inferWorkoutFromPrompt(prompt)
    if (!inferred) {
      return clarifyAction("I need the exercise name plus sets, reps, and load before I can save that workout cleanly.")
    }
    return {
      ...action,
      ...inferred,
    }
  }

  return action
}

function inferReplyOnlyActions(reply, prompt) {
  const inferred = []
  const exercises = extractExercisesFromReply(reply)
  if (looksLikeWorkoutPlanPrompt(prompt) && exercises.length) {
    inferred.push({
      type: "create_workout_plan",
      title: "Coach workout",
      exercises,
    })
  }
  return inferred
}

function extractImplicitActions(value) {
  const directAction = normalizeAction(value?.action)
  if (directAction) return [directAction]

  const typedRoot = normalizeAction(value)
  if (typedRoot) return [typedRoot]

  const implicitTypes = ["clarify", "log_workout", "update_workout_log", "log_meal", "update_meal_log", "create_workout_plan", "create_meal_plan", "update_targets", "none"]
  return implicitTypes
    .filter((type) => value?.[type] && typeof value[type] === "object")
    .map((type) => ({ type, ...value[type] }))
}

export function normalizeCoachResponse(value, context = {}) {
  if (!value || typeof value !== "object") throw new Error("OpenAI returned an invalid coach payload")

  const actions = [
    ...safeArray(value.actions, 8).map(normalizeAction).filter(Boolean),
    ...extractImplicitActions(value),
    ...inferReplyOnlyActions(value.reply, context.prompt),
  ]
    .map((action) => repairIncompleteAction(action, value.reply, context.prompt))
    .map(normalizeMealAction)
    .slice(0, 8)

  const clarifyOverride = actions[0]?.type === "clarify" && typeof actions[0]?.message === "string" && actions[0].message.trim()
    ? actions[0].message.trim()
    : ""
  const originalReply = typeof value.reply === "string" && value.reply.trim() ? value.reply.trim() : ""
  const shouldUseClarifyOverride = Boolean(clarifyOverride && (!originalReply || /\b(log(?:ged)?|save(?:d)?|update(?:d)?|create(?:d)?|built)\b/i.test(originalReply)))
  const reply = shouldUseClarifyOverride
    ? clarifyOverride
    : originalReply || summarizeCoachAction(actions[0]) || "I'm here. Tell me what you want to log or plan next."

  return {
    reply,
    actions,
    warnings: safeArray(value.warnings, 6).filter((warning) => typeof warning === "string"),
  }
}
