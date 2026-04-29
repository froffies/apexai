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
  ].map(normalizeMealAction).slice(0, 8)

  const reply = typeof value.reply === "string" && value.reply.trim()
    ? value.reply.trim()
    : summarizeCoachAction(actions[0]) || "I'm here. Tell me what you want to log or plan next."

  return {
    reply,
    actions,
    warnings: safeArray(value.warnings, 6).filter((warning) => typeof warning === "string"),
  }
}
