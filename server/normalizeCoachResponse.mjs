function safeArray(value, limit = 8) {
  return Array.isArray(value) ? value.slice(0, limit) : []
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

export function normalizeCoachResponse(value) {
  if (!value || typeof value !== "object") throw new Error("OpenAI returned an invalid coach payload")

  const actions = [
    ...safeArray(value.actions, 8).map(normalizeAction).filter(Boolean),
    ...extractImplicitActions(value),
  ].slice(0, 8)

  const reply = typeof value.reply === "string" && value.reply.trim()
    ? value.reply.trim()
    : summarizeCoachAction(actions[0]) || "I'm here. Tell me what you want to log or plan next."

  return {
    reply,
    actions,
    warnings: safeArray(value.warnings, 6).filter((warning) => typeof warning === "string"),
  }
}
