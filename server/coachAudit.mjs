import fs from "node:fs"
import path from "node:path"
import { cleanText, safeArray, safeNumber } from "./utils.mjs"
import { replyClaimsPersistence } from "./coachLoggingRules.mjs"

const AUDIT_STORAGE_PREFIX = "coach_audit:"
const AUDIT_SCHEMA_VERSION = 1
const MAX_AUDIT_LOGS = 400
const DEFAULT_BETA_ADMIN_EMAILS = ["coach-audit-admin@apexai.app"]

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

function readPackageVersion() {
  try {
    const packagePath = path.join(process.cwd(), "package.json")
    const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8"))
    return String(parsed.version || "1.0.0")
  } catch {
    return "1.0.0"
  }
}

function readGitHeadSha() {
  try {
    const gitDir = path.join(process.cwd(), ".git")
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim()
    if (head.startsWith("ref:")) {
      const refPath = head.slice(5).trim()
      return fs.readFileSync(path.join(gitDir, refPath), "utf8").trim().slice(0, 12)
    }
    return head.slice(0, 12)
  } catch {
    return ""
  }
}

const packageVersion = readPackageVersion()
const commitSha =
  process.env.COMMIT_SHA
  || process.env.RENDER_GIT_COMMIT
  || process.env.VERCEL_GIT_COMMIT_SHA
  || readGitHeadSha()
  || "unknown"

const adminEmailAllowlist = parseCsv(
  process.env.COACH_AUDIT_ADMIN_EMAILS
  || process.env.VITE_COACH_AUDIT_ADMIN_EMAILS
  || DEFAULT_BETA_ADMIN_EMAILS.join(",")
)
const adminIdAllowlist = parseCsv(process.env.COACH_AUDIT_ADMIN_IDS)




function redactSensitiveText(value, maxLength = 1200) {
  const text = String(value || "")
  if (!text) return ""
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._-]+\b/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted_openai_key]")
    .replace(/\bsbp_[A-Za-z0-9_-]{12,}\b/gi, "[redacted_supabase_key]")
    .replace(/\beyJ[A-Za-z0-9._-]{20,}\b/g, "[redacted_token]")
    .replace(/\b(?:password|passcode|pin)\s*[:=]?\s*\S+/gi, (segment) => {
      const label = segment.split(/[:=\s]/)[0]
      return `${label} [redacted]`
    })
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted_email]")
    .replace(/\b(?:\+?\d[\d ()-]{7,}\d)\b/g, "[redacted_phone]")
    .slice(0, maxLength)
}

function sanitizeConversationWindow(messages = []) {
  return safeArray(messages, 20)
    .map((message) => ({
      role: String(message?.role || "unknown"),
      content: redactSensitiveText(message?.content || "", 600),
    }))
    .filter((message) => message.content)
}

function sanitizeQuantity(quantity = null) {
  if (!quantity || typeof quantity !== "object") return null
  return {
    ...(Number.isFinite(Number(quantity.amount)) ? { amount: Number(quantity.amount) } : {}),
    ...(quantity.unit ? { unit: String(quantity.unit) } : {}),
    ...(quantity.text ? { text: redactSensitiveText(quantity.text, 120) } : {}),
  }
}

function sanitizeMealItem(item = {}) {
  return {
    ...(item.id ? { id: String(item.id) } : {}),
    ...(item.reference ? { reference: String(item.reference) } : {}),
    ...(item.base_name || item.baseName ? { base_name: String(item.base_name || item.baseName) } : {}),
    ...(item.label ? { label: redactSensitiveText(item.label, 120) } : {}),
    ...(item.category ? { category: String(item.category) } : {}),
    ...(sanitizeQuantity(item.quantity) ? { quantity: sanitizeQuantity(item.quantity) } : {}),
    ...(safeArray(item.preparation, 6).length ? { preparation: safeArray(item.preparation, 6).map((entry) => redactSensitiveText(entry, 80)) } : {}),
    ...(safeArray(item.modifiers, 8).length ? { modifiers: safeArray(item.modifiers, 8).map((entry) => redactSensitiveText(entry, 80)) } : {}),
    ...(safeArray(item.exclusions, 8).length ? { exclusions: safeArray(item.exclusions, 8).map((entry) => redactSensitiveText(entry, 80)) } : {}),
    ...(item.attached_to || item.attachedTo ? { attached_to: String(item.attached_to || item.attachedTo) } : {}),
    ...(item.relation ? { relation: String(item.relation) } : {}),
    ...(item.variant_key || item.variantKey ? { variant_key: String(item.variant_key || item.variantKey) } : {}),
    ...(item.meal_type || item.mealType ? { meal_type: String(item.meal_type || item.mealType) } : {}),
  }
}

function sanitizeWorkoutSession(state = {}) {
  if (!state || typeof state !== "object") return null
  return {
    active: Boolean(state.active),
    workoutConversation: Boolean(state.workoutConversation),
    exercise_name: redactSensitiveText(state.exercise_name || "", 120),
    workout_type: redactSensitiveText(state.workout_type || "", 120),
    muscle_group: redactSensitiveText(state.muscle_group || "", 60),
    sets: safeNumber(state.sets),
    reps: safeNumber(state.reps),
    weight_kg: safeNumber(state.weight_kg),
    duration_seconds: safeNumber(state.duration_seconds),
    distance_km: safeNumber(state.distance_km),
    clarificationAttempts: safeNumber(state.clarificationAttempts),
    clarificationCounts: typeof state.clarificationCounts === "object" && state.clarificationCounts
      ? Object.fromEntries(Object.entries(state.clarificationCounts).slice(0, 12).map(([key, value]) => [String(key), safeNumber(value)]))
      : {},
    readyToLog: Boolean(state.readyToLog),
    shouldStopClarifying: Boolean(state.shouldStopClarifying),
    clarifyQuestion: redactSensitiveText(state.clarifyQuestion || "", 240),
    summary: redactSensitiveText(state.summary || "", 320),
    wantsLogging: Boolean(state.wantsLogging),
    persisted: Boolean(state.persisted),
    persistedWorkoutId: String(state.persistedWorkoutId || ""),
    persistedSummary: redactSensitiveText(state.persistedSummary || "", 320),
    persistedAt: String(state.persistedAt || ""),
    alreadyLogged: Boolean(state.alreadyLogged),
    correctionRequested: Boolean(state.correctionRequested),
    suppressed: Boolean(state.suppressed),
    suppressionReply: redactSensitiveText(state.suppressionReply || "", 240),
  }
}

function sanitizeMealSession(state = {}) {
  if (!state || typeof state !== "object") return null
  return {
    active: Boolean(state.active),
    mealConversation: Boolean(state.mealConversation),
    items: safeArray(state.items, 24).map((item) => sanitizeMealItem(item)),
    meal_groups: safeArray(state.meal_groups, 8).map((group) => ({
      meal_type: String(group?.meal_type || ""),
      summary: redactSensitiveText(group?.summary || "", 240),
      items: safeArray(group?.items, 12).map((item) => sanitizeMealItem(item)),
    })),
    clarificationAttempts: safeNumber(state.clarificationAttempts),
    clarificationCounts: typeof state.clarificationCounts === "object" && state.clarificationCounts
      ? Object.fromEntries(Object.entries(state.clarificationCounts).slice(0, 12).map(([key, value]) => [String(key), safeNumber(value)]))
      : {},
    readyToLog: Boolean(state.readyToLog),
    shouldStopClarifying: Boolean(state.shouldStopClarifying),
    summary: redactSensitiveText(state.summary || "", 320),
    clarifyQuestion: redactSensitiveText(state.clarifyQuestion || "", 240),
    wantsLogging: Boolean(state.wantsLogging),
    wantsNutrition: Boolean(state.wantsNutrition),
    answerOnly: Boolean(state.answerOnly),
    suppressed: Boolean(state.suppressed),
    suppressionReply: redactSensitiveText(state.suppressionReply || "", 240),
    persisted: Boolean(state.persisted),
    persistedMealId: String(state.persistedMealId || ""),
    persistedSummary: redactSensitiveText(state.persistedSummary || "", 320),
    persistedAt: String(state.persistedAt || ""),
    alreadyLogged: Boolean(state.alreadyLogged),
    correctionRequested: Boolean(state.correctionRequested),
    currentMealType: String(state.currentMealType || ""),
    processingMode: String(state.processingMode || state.processing_mode || ""),
    fallbackReason: redactSensitiveText(state.fallbackReason || state.fallback_reason || "", 120),
    legacyGateClause: redactSensitiveText(state.legacyGateClause || state.legacy_gate_clause || "", 120),
    pendingClarification: state.pendingClarification && typeof state.pendingClarification === "object"
      ? {
          type: String(state.pendingClarification.type || ""),
          targetReference: String(state.pendingClarification.targetReference || ""),
          targetBaseName: String(state.pendingClarification.targetBaseName || ""),
          targetLabel: redactSensitiveText(state.pendingClarification.targetLabel || "", 120),
          targetMealGroup: String(state.pendingClarification.targetMealGroup || ""),
          expectedValueType: String(state.pendingClarification.expectedValueType || ""),
        }
      : null,
    pendingQuantities: safeArray(state.pendingQuantities, 8).map((entry) => ({
      ...(entry?.targetReference ? { targetReference: String(entry.targetReference) } : {}),
      ...(entry?.base_name || entry?.baseName ? { base_name: String(entry.base_name || entry.baseName) } : {}),
      ...(entry?.label ? { label: redactSensitiveText(entry.label, 120) } : {}),
      ...(entry?.question ? { question: redactSensitiveText(entry.question, 160) } : {}),
    })),
    structuralIssues: safeArray(state.structuralIssues, 12).map((issue) => ({
      code: String(issue?.code || ""),
      message: redactSensitiveText(issue?.message || "", 240),
      severity: String(issue?.severity || "warn"),
    })),
  }
}

export function sanitizeCoachStateSnapshot(snapshot = {}) {
  return {
    meal_session: sanitizeMealSession(snapshot?.meal_session || snapshot?.mealSession || null),
    workout_session: sanitizeWorkoutSession(snapshot?.workout_session || snapshot?.workoutSession || null),
  }
}

function sanitizePlainObject(value = {}, depth = 0) {
  if (!value || typeof value !== "object" || depth > 2) return null
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 24)
      .map(([key, entry]) => {
        if (typeof entry === "string") return [key, redactSensitiveText(entry, 240)]
        if (typeof entry === "number" || typeof entry === "boolean") return [key, entry]
        if (Array.isArray(entry)) {
          return [key, safeArray(entry, 12).map((item) => (
            item && typeof item === "object"
              ? sanitizePlainObject(item, depth + 1)
              : typeof item === "string"
                ? redactSensitiveText(item, 160)
                : item
          ))]
        }
        if (entry && typeof entry === "object") return [key, sanitizePlainObject(entry, depth + 1)]
        return [key, entry]
      })
      .filter(([, entry]) => entry !== null && entry !== undefined)
  )
}

function sanitizeAction(action = {}) {
  if (!action || typeof action !== "object") return null
  const next = { type: String(action.type || "") }
  for (const [key, value] of Object.entries(action)) {
    if (key === "type") continue
    if (typeof value === "string") next[key] = redactSensitiveText(value, 240)
    else if (typeof value === "number" || typeof value === "boolean") next[key] = value
    else if (Array.isArray(value)) next[key] = safeArray(value, 12).map((entry) => sanitizeAction(entry) || entry)
    else if (value && typeof value === "object") next[key] = sanitizePlainObject(value)
  }
  return next
}

function collectTranscriptText(entry = {}) {
  const windowText = sanitizeConversationWindow(entry.conversation_window || [])
    .map((message) => `${message.role}:${message.content}`)
    .join(" ")
  return cleanText([entry.user_message, entry.assistant_reply, windowText].filter(Boolean).join(" "))
}

function addFlag(flags, code, label, severity = "warn") {
  if (flags.some((flag) => flag.code === code)) return
  flags.push({ code, label, severity })
}

function numericFoodSummary(summary = "") {
  const parts = String(summary || "")
    .split(/\s*,\s*plus\s+|;\s*/i)
    .map((part) => cleanText(part))
    .filter(Boolean)

  return parts.some((part) => (
    /^\d+(?:\.\d+)?$/.test(part)
    || /^\d+(?:\.\d+)?\s+(?:serve|meal)\s+\d+(?:\.\d+)?$/.test(part)
    || /^(?:serve|meal)\s+\d+(?:\.\d+)?$/.test(part)
  ))
}

function duplicatePhraseSummary(summary = "") {
  return /\b([a-z0-9 ]{4,})\b(?:\s+(?:and|,)\s+\1\b)/i.test(String(summary || ""))
}

function isComplaintText(text = "") {
  return /\b(?:you asked|i gave you|why can(?:'|’)t you understand|why cant you understand|i told you|already said|what do you mean|i just answered|you just asked)\b/i.test(String(text || ""))
}

function isDeleteIntent(text = "") {
  return /\b(?:delete|remove|undo|erase)\b(?:\s+(?:it|that|this|meal))?/i.test(String(text || ""))
}

function isNumericOnlyReply(text = "") {
  return /^(?:\d+(?:\.\d+)?)$/.test(cleanText(text))
}

function mealItems(record = {}) {
  return safeArray(record?.state_after?.meal_session?.items || record?.state_after?.mealSession?.items || [], 24)
}

function complaintDerivedMealItems(record = {}) {
  return mealItems(record).filter((item) => (
    /\b(?:you|asked|understand|number|mean|gave)\b/i.test(String(item?.base_name || item?.label || ""))
    || isComplaintText(item?.base_name || "")
    || isComplaintText(item?.label || "")
  ))
}

function itemMatchesClarificationTarget(item = {}, clarification = null) {
  if (!clarification || typeof clarification !== "object" || !item || typeof item !== "object") return false
  const candidates = [
    clarification.targetReference,
    clarification.targetBaseName,
    clarification.targetLabel,
  ]
    .map((value) => cleanText(value))
    .filter(Boolean)

  if (!candidates.length) return false

  const itemNames = [
    item.reference,
    item.base_name,
    item.label,
  ]
    .map((value) => cleanText(value))
    .filter(Boolean)

  return itemNames.some((value) => candidates.includes(value))
}

function clarificationTargetSatisfied(mealState = null, clarification = null) {
  const matchedItem = safeArray(mealState?.items, 24).find((item) => itemMatchesClarificationTarget(item, clarification))
  const quantityAmount = Number(matchedItem?.quantity?.amount)
  return Boolean(matchedItem && Number.isFinite(quantityAmount))
}

function clarificationStateMadeProgress(before = null, after = null) {
  if (!before && !after) return false

  const beforeSummary = cleanText(before?.summary || "")
  const afterSummary = cleanText(after?.summary || "")
  if (beforeSummary && afterSummary && beforeSummary !== afterSummary) return true

  const beforeItems = safeArray(before?.items, 24)
  const afterItems = safeArray(after?.items, 24)
  if (afterItems.length !== beforeItems.length) return true

  for (const afterItem of afterItems) {
    const beforeItem = beforeItems.find((candidate) => (
      cleanText(candidate?.reference || candidate?.attached_to || candidate?.base_name || candidate?.label || "")
      === cleanText(afterItem?.reference || afterItem?.attached_to || afterItem?.base_name || afterItem?.label || "")
    ))
    const beforeQuantity = cleanText(beforeItem?.quantity?.text || "")
    const afterQuantity = cleanText(afterItem?.quantity?.text || "")
    if (!beforeQuantity && afterQuantity) return true
    if (beforeQuantity && afterQuantity && beforeQuantity !== afterQuantity) return true
    const beforeExclusions = cleanText(safeArray(beforeItem?.exclusions, 8).join(" "))
    const afterExclusions = cleanText(safeArray(afterItem?.exclusions, 8).join(" "))
    if (beforeExclusions !== afterExclusions) return true
  }

  const beforePending = cleanText(before?.pendingClarification?.targetReference || before?.pendingClarification?.targetBaseName || "")
  const afterPending = cleanText(after?.pendingClarification?.targetReference || after?.pendingClarification?.targetBaseName || "")
  if (beforePending && afterPending && beforePending !== afterPending) return true

  return false
}

function workoutClarificationStateMadeProgress(before = null, after = null) {
  if (!before && !after) return false

  const numericFields = ["sets", "reps", "weight_kg", "duration_seconds", "distance_km"]
  for (const field of numericFields) {
    const beforeValue = Number(before?.[field] || 0)
    const afterValue = Number(after?.[field] || 0)
    if (!beforeValue && afterValue) return true
    if (beforeValue && afterValue && beforeValue !== afterValue) return true
  }

  const beforeExercise = cleanText(before?.exercise_name || before?.workout_type || "")
  const afterExercise = cleanText(after?.exercise_name || after?.workout_type || "")
  if (beforeExercise && afterExercise && beforeExercise !== afterExercise) return true

  const beforeQuestion = cleanText(before?.clarifyQuestion || "")
  const afterQuestion = cleanText(after?.clarifyQuestion || "")
  if (beforeQuestion && afterQuestion && beforeQuestion !== afterQuestion) return true

  return false
}

export function buildCoachAuditFlags(entry = {}) {
  const flags = []
  const transcriptText = collectTranscriptText(entry)
  const persistedActions = safeArray(entry.persisted_actions, 12).map((action) => sanitizeAction(action)).filter(Boolean)
  const assistantReply = String(entry.assistant_reply || "")
  const summaryText = persistedActions
    .map((action) => String(action?.food_name || action?.workout_type || action?.exercise_name || ""))
    .join(" ; ")
  const mealStateAfter = entry?.state_after?.meal_session || entry?.state_after?.mealSession || null
  const mealStateBefore = entry?.state_before?.meal_session || entry?.state_before?.mealSession || null
  const workoutStateAfter = entry?.state_after?.workout_session || entry?.state_after?.workoutSession || null
  const userMessage = cleanText(entry.user_message)
  const previousAssistantMessage = sanitizeConversationWindow(entry.conversation_window || [])
    .slice(0, -1)
    .reverse()
    .find((message) => message.role === "assistant")
  const clarificationAsked = Boolean(
    entry.clarification_asked
    || mealStateAfter?.clarifyQuestion
    || workoutStateAfter?.clarifyQuestion
    || mealStateAfter?.pendingClarification
  )
  const clarificationTargetMoved = (
    isNumericOnlyReply(entry.user_message)
    && mealStateBefore?.pendingClarification?.type === "quantity"
    && mealStateAfter?.pendingClarification?.type === "quantity"
    && cleanText(mealStateBefore?.pendingClarification?.targetReference || mealStateBefore?.pendingClarification?.targetBaseName || "")
      !== cleanText(mealStateAfter?.pendingClarification?.targetReference || mealStateAfter?.pendingClarification?.targetBaseName || "")
  )
  const priorTargetSatisfied = clarificationTargetSatisfied(mealStateAfter, mealStateBefore?.pendingClarification)

  if (
    clarificationAsked
    && previousAssistantMessage
    && cleanText(previousAssistantMessage.content) === cleanText(assistantReply)
    && !clarificationStateMadeProgress(mealStateBefore, mealStateAfter)
    && !workoutClarificationStateMadeProgress(entry?.state_before?.workout_session || entry?.state_before?.workoutSession || null, workoutStateAfter)
  ) {
    addFlag(flags, "clarification_loop", "Coach repeated the same clarification.", "warn")
  }

  if (/\b(i told you|already said|i just said)\b/i.test(entry.user_message || "")) {
    addFlag(flags, "user_signalled_repeat", "User signalled that the coach repeated itself.", "warn")
  }

  if (isComplaintText(entry.user_message) && complaintDerivedMealItems(entry).length) {
    addFlag(flags, "frustration_text_parsed_as_food", "User frustration text was parsed into meal state.", "error")
    addFlag(flags, "fake_food_from_user_complaint", "Complaint text produced fake saved food items.", "error")
  }

  if (numericFoodSummary(summaryText)) {
    addFlag(flags, "numeric_food_item", "Saved summary contains a numeric-looking food item.", "error")
  }

  if (/\b1l\b/i.test(summaryText) && !/\b1l\b/i.test(transcriptText)) {
    addFlag(flags, "fake_unit", "Saved summary contains a likely invented 1l unit.", "error")
  }

  if (
    replyClaimsPersistence(assistantReply)
    && !replyIsConditionalPersistenceOffer(assistantReply)
    && persistedActions.length === 0
    && entry.intent !== "app_help"
    && !["already_logged", "suppressed", "pending_client"].includes(String(entry.persistence_status || ""))
  ) {
    addFlag(flags, "fake_save_blocked", "Reply implied a save without a persisted action.", "error")
  }

  if (/\b(?:don't|dont|do not)\s+(?:log|save|track|record)\b/i.test(transcriptText) && persistedActions.length > 0) {
    addFlag(flags, "suppression_ignored", "A save happened after the user said not to log it.", "error")
  }

  if (safeArray(mealStateAfter?.pendingQuantities, 4).length && persistedActions.some((action) => action?.type?.includes("meal"))) {
    addFlag(flags, "orphan_quantity", "Meal state still had pending quantities when a meal was persisted.", "error")
  }

  if (mealStateAfter?.pendingClarification && persistedActions.some((action) => action?.type?.includes("meal"))) {
    addFlag(flags, "unresolved_entity_persisted", "Meal state still had an unresolved clarification when a meal was persisted.", "error")
  }

  if (safeArray(mealStateAfter?.structuralIssues, 4).length && persistedActions.some((action) => action?.type?.includes("meal"))) {
    addFlag(flags, "parser_warning", "Meal state reported structural issues before save.", "warn")
  }

  if (clarificationTargetMoved && !priorTargetSatisfied) {
    addFlag(flags, "clarification_target_lost", "The pending clarification target changed after a numeric reply.", "error")
  }

  if (
    /\d+\.\d+/.test(String(entry.user_message || ""))
    && mealStateBefore?.pendingClarification?.type === "quantity"
    && !persistedActions.some((action) => action?.type?.includes("meal"))
    && mealStateAfter?.pendingClarification?.type === "quantity"
    && !priorTargetSatisfied
  ) {
    addFlag(flags, "decimal_quantity_unbound", "A decimal quantity reply was not bound to the asked food item.", "error")
  }

  if (persistedActions.some((action) => action?.type?.includes("workout")) && !String(workoutStateAfter?.exercise_name || workoutStateAfter?.workout_type || "").trim()) {
    addFlag(flags, "orphan_workout_metrics", "Workout persisted without a stable exercise label.", "error")
  }

  if (
    isDeleteIntent(entry.user_message)
    && !persistedActions.some((action) => action?.type === "delete_meal_log" || action?.type === "delete_workout_log")
    && /already saved/i.test(assistantReply)
  ) {
    addFlag(flags, "delete_intent_ignored", "The user asked to delete or undo a saved item but no delete action happened.", "error")
  }

  if (entry.duplicate_prevention_triggered) {
    addFlag(flags, "possible_duplicate", "Duplicate prevention triggered for this exchange.", "warn")
  }

  if (entry.route_type === "ai-assisted" && (mealStateAfter?.readyToLog || mealStateAfter?.clarifyQuestion || workoutStateAfter?.readyToLog || workoutStateAfter?.clarifyQuestion)) {
    addFlag(flags, "deterministic_route_missed", "AI was used even though deterministic state looked sufficient.", "warn")
  }

  if (entry.persistence_status === "failed_before_persistence" && entry.draft_preserved_after_failure === false) {
    addFlag(flags, "draft_lost", "Request failed and the user draft was not preserved.", "error")
  }

  if ((mealStateAfter?.correctionRequested || workoutStateAfter?.correctionRequested) && persistedActions.some((action) => action?.type === "log_meal" || action?.type === "log_workout")) {
    addFlag(flags, "correction_created_duplicate", "A correction created a new log instead of updating the saved one.", "warn")
  }

  if ((entry.intent === "nutrition_question" || entry.intent === "food_question") && persistedActions.length > 0) {
    addFlag(flags, "nutrition_question_hijacked", "A nutrition question was turned into logging.", "warn")
  }

  if (entry.intent === "general_chat" && persistedActions.length > 0) {
    addFlag(flags, "general_chat_hijacked", "General chat was turned into logging.", "warn")
  }

  if (replyClaimsPersistence(assistantReply) && persistedActions.length > 0 && duplicatePhraseSummary(summaryText)) {
    addFlag(flags, "corrupted_summary", "Saved summary looks duplicated or corrupted.", "warn")
  }

  if (
    persistedActions.some((action) => action?.type?.includes("meal"))
    && (
      complaintDerivedMealItems(entry).length
      || safeArray(mealStateAfter?.structuralIssues, 4).length
      || numericFoodSummary(summaryText)
    )
  ) {
    addFlag(flags, "corrupted_state_persisted", "A meal was persisted even though the state or summary looked structurally corrupted.", "error")
  }

  if ((entry.intent === "meal_logging" || entry.intent === "workout_logging") && !clarificationAsked && persistedActions.length === 0 && !replyClaimsPersistence(assistantReply)) {
    const mealSuppressed = Boolean(mealStateAfter?.suppressed)
    const workoutSuppressed = Boolean(workoutStateAfter?.suppressed)
    const alreadyLogged = Boolean(
      mealStateAfter?.alreadyLogged
      || workoutStateAfter?.alreadyLogged
      || String(entry.persistence_status || "") === "already_logged"
    )
    if (!mealSuppressed && !workoutSuppressed && !alreadyLogged) {
      addFlag(flags, "no_action_when_expected", "A likely logging turn did not clarify or persist anything.", "warn")
    }
  }

  return flags
}


function replyIsConditionalPersistenceOffer(reply) {
  const text = cleanText(reply)
  if (!text) return false
  return /\bif you want (?:it|that|this) (?:saved|logged|tracked)\b/.test(text)
    || /\btell me to (?:log|save|track) (?:it|that|this)\b/.test(text)
    || /\bi can (?:log|save|track) (?:it|that|this) if you want\b/.test(text)
}

export function detectCoachAuditIntent({
  message = "",
  mealContext = null,
  workoutContext = null,
  routeType = "",
  actions = [],
} = {}) {
  const text = cleanText(message)
  if (!text) return "general_chat"
  if (/\b(how much|how many|what's|whats|is this|does this|can i|should i)\b/.test(text) && /\b(calories|protein|carbs|fat|macro|macros|latte|meal|food|rice|coffee|burger|pizza)\b/.test(text)) {
    return "nutrition_question"
  }
  if (/\b(plan|build|make)\b.*\b(meal|meals|food)\b/.test(text)) return "plan_creation"
  if (/\b(plan|build|make)\b.*\b(workout|session|week|training)\b/.test(text)) return "plan_creation"
  if (/\b(target|calories|protein|carbs|fat)\b/.test(text) && /\b(set|update|change)\b/.test(text)) return "target_update"
  if (mealContext?.correctionRequested || safeArray(actions, 4).some((action) => action?.type === "update_meal_log")) return "meal_update"
  if (workoutContext?.correctionRequested || safeArray(actions, 4).some((action) => action?.type === "update_workout_log")) return "workout_update"
  if (mealContext?.answerOnly) return "nutrition_question"
  if (mealContext?.wantsLogging || mealContext?.readyToLog || safeArray(actions, 4).some((action) => action?.type === "log_meal")) return "meal_logging"
  if (workoutContext?.wantsLogging || workoutContext?.readyToLog || safeArray(actions, 4).some((action) => action?.type === "log_workout")) return "workout_logging"
  if (routeType === "fallback") return "general_chat"
  if (/\b(workout|train|exercise|bench|squat|deadlift|cardio)\b/.test(text) && /\b(how|what|should|can)\b/.test(text)) return "workout_question"
  if (/^(hi|hello|hey|yo|whats up|what's up)\b/.test(text)) return "general_chat"
  return "general_chat"
}

function normalizeAuditValue(raw = {}, user = null) {
  const stateBefore = sanitizeCoachStateSnapshot(raw.state_before || {})
  const stateAfter = sanitizeCoachStateSnapshot(raw.state_after || {})
  const actions = safeArray(raw.actions, 12).map((action) => sanitizeAction(action)).filter(Boolean)
  const persistedActions = safeArray(raw.persisted_actions, 12).map((action) => sanitizeAction(action)).filter(Boolean)
  const routeType = ["deterministic", "ai-assisted", "tool-assisted", "fallback", "failed"].includes(String(raw.route_type || ""))
    ? String(raw.route_type)
    : "fallback"
  const conversationWindow = sanitizeConversationWindow(raw.conversation_window || [])
  const warnings = safeArray(raw.warnings, 16).map((warning) => redactSensitiveText(warning, 200)).filter(Boolean)
  const normalized = {
    log_id: String(raw.log_id || raw.message_id || raw.id || ""),
    created_at: String(raw.created_at || new Date().toISOString()),
    user_id: String(raw.user_id || user?.id || ""),
    user_email: String(raw.user_email || user?.email || "").trim().slice(0, 120),
    session_id: String(raw.session_id || ""),
    message_id: String(raw.message_id || raw.log_id || ""),
    user_message: redactSensitiveText(raw.user_message || "", 1200),
    assistant_reply: redactSensitiveText(raw.assistant_reply || "", 1600),
    intent: String(raw.intent || detectCoachAuditIntent({
      message: raw.user_message,
      mealContext: stateAfter.meal_session || stateBefore.meal_session,
      workoutContext: stateAfter.workout_session || stateBefore.workout_session,
      routeType,
      actions,
    })),
    route_type: routeType,
    state_before: stateBefore,
    state_after: stateAfter,
    conversation_window: conversationWindow,
    actions,
    persisted_actions: persistedActions,
    persistence_status: String(raw.persistence_status || "not_requested"),
    clarification_asked: Boolean(raw.clarification_asked),
    draft_preserved_after_failure: raw.draft_preserved_after_failure === undefined ? null : Boolean(raw.draft_preserved_after_failure),
    duplicate_prevention_triggered: Boolean(raw.duplicate_prevention_triggered),
    latency_ms: Math.max(0, Math.round(safeNumber(raw.latency_ms))),
    warnings,
    error_summary: redactSensitiveText(raw.error_summary || "", 400),
    model_used: redactSensitiveText(raw.model_used || "", 80),
    app_version: String(raw.app_version || packageVersion),
    commit_sha: String(raw.commit_sha || commitSha),
  }
  normalized.flags = buildCoachAuditFlags(normalized)
  return normalized
}

function mergeAuditValues(existing = {}, patch = {}, user = null) {
  return normalizeAuditValue({
    ...existing,
    ...patch,
    state_before: patch.state_before || existing.state_before,
    state_after: patch.state_after || existing.state_after,
    conversation_window: patch.conversation_window || existing.conversation_window,
    actions: patch.actions || existing.actions,
    persisted_actions: patch.persisted_actions || existing.persisted_actions,
    warnings: patch.warnings || existing.warnings,
    user_id: patch.user_id || existing.user_id || user?.id || "",
    user_email: patch.user_email || existing.user_email || user?.email || "",
  }, user)
}

function storageKeyForLog(logId) {
  return `${AUDIT_STORAGE_PREFIX}${String(logId || "").trim()}`
}

async function withAuditStorageTimeout(promise, timeoutMs = 1200) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ])
}

export function isCoachAuditEnabled() {
  return process.env.ENABLE_COACH_AUDIT !== "false"
}

export function coachAuditCapabilities(adminSupabase = null) {
  return {
    enabled: isCoachAuditEnabled(),
    writable: isCoachAuditEnabled() && Boolean(adminSupabase),
    version: packageVersion,
    commitSha,
  }
}

export function isCoachAuditAdminUser(user = null) {
  if (!user) return false
  const email = cleanText(user.email || "")
  const id = cleanText(user.id || "")
  if (adminEmailAllowlist.length && email && adminEmailAllowlist.includes(email)) return true
  if (adminIdAllowlist.length && id && adminIdAllowlist.includes(id)) return true
  return false
}

export async function persistCoachAuditRecord(adminSupabase, user, patch) {
  if (!isCoachAuditEnabled() || !adminSupabase || !user?.id) return null
  const normalizedPatch = normalizeAuditValue(patch, user)
  const logId = normalizedPatch.log_id || normalizedPatch.message_id
  if (!logId) return null

  const storageKey = storageKeyForLog(logId)
  const loadExisting = adminSupabase
    .from("user_app_state")
    .select("value")
    .eq("user_id", user.id)
    .eq("storage_key", storageKey)
    .maybeSingle()

  const existingResult = await withAuditStorageTimeout(loadExisting)
  const existingValue = existingResult?.data?.value || {}
  const nextValue = mergeAuditValues(existingValue, normalizedPatch, user)

  await withAuditStorageTimeout(
    adminSupabase.from("user_app_state").upsert(
      {
        user_id: user.id,
        storage_key: storageKey,
        value: nextValue,
        schema_version: AUDIT_SCHEMA_VERSION,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,storage_key" }
    )
  )

  return nextValue
}

function parseStoredAuditRow(row = {}) {
  const value = row?.value && typeof row.value === "object" ? row.value : {}
  return normalizeAuditValue({
    ...value,
    user_id: value.user_id || row.user_id || "",
    created_at: value.created_at || row.updated_at || new Date().toISOString(),
  })
}

function filterAuditLog(record, filters = {}) {
  if (filters.user && !cleanText(`${record.user_id} ${record.user_email}`).includes(cleanText(filters.user))) return false
  if (filters.route_type && record.route_type !== filters.route_type) return false
  if (filters.date_from && String(record.created_at).slice(0, 10) < String(filters.date_from)) return false
  if (filters.date_to && String(record.created_at).slice(0, 10) > String(filters.date_to)) return false
  if (filters.created_after && Date.parse(String(record.created_at || "")) < Date.parse(String(filters.created_after || ""))) return false
  if (filters.created_before && Date.parse(String(record.created_at || "")) > Date.parse(String(filters.created_before || ""))) return false
  if (filters.commit_sha && !cleanText(String(record.commit_sha || "")).startsWith(cleanText(filters.commit_sha))) return false
  if (filters.failed === "true" && !["failed", "failed_before_persistence", "failed_persistence"].includes(record.persistence_status)) return false
  if (filters.warnings === "true" && (!record.warnings.length && !record.flags.length)) return false
  if (filters.flag && !record.flags.some((flag) => flag.code === filters.flag)) return false
  if (filters.search && !cleanText(JSON.stringify(record)).includes(cleanText(filters.search))) return false
  return true
}

export async function listCoachAuditRecords(adminSupabase, filters = {}) {
  if (!isCoachAuditEnabled() || !adminSupabase) return []
  const limit = Math.min(MAX_AUDIT_LOGS, Math.max(1, Number(filters.limit) || 120))
  const { data, error } = await adminSupabase
    .from("user_app_state")
    .select("user_id,storage_key,value,updated_at")
    .like("storage_key", `${AUDIT_STORAGE_PREFIX}%`)
    .order("updated_at", { ascending: false })
    .limit(limit)

  if (error) throw error

  return safeArray(data, limit)
    .map((row) => parseStoredAuditRow(row))
    .filter((record) => filterAuditLog(record, filters))
}

export function summarizeCoachAuditRecords(records = []) {
  const summary = {
    total: records.length,
    flagged: 0,
    failures: 0,
    duplicate_prevention_events: 0,
    parser_warnings: 0,
    clarification_loops: 0,
    fake_save_blocked: 0,
    graph_native_turns: 0,
    legacy_fallback_turns: 0,
    low_confidence_macro_turns: 0,
    photo_review_turns: 0,
    tool_assisted_turns: 0,
    by_flag: {},
    by_route: {},
    by_processing_mode: {},
    by_fallback_reason: {},
    by_legacy_gate_clause: {},
    repeated_clarifications: {},
    common_unknown_inputs: {},
  }

  for (const record of records) {
    summary.by_route[record.route_type] = (summary.by_route[record.route_type] || 0) + 1
    if (record.route_type === "tool-assisted") summary.tool_assisted_turns += 1
    if (record.flags.length) summary.flagged += 1
    if (["failed", "failed_before_persistence", "failed_persistence"].includes(record.persistence_status)) summary.failures += 1
    if (record.duplicate_prevention_triggered) summary.duplicate_prevention_events += 1
    const mealStateAfter = record.state_after?.meal_session || {}
    const processingMode = cleanText(mealStateAfter.processingMode || mealStateAfter.processing_mode).toLowerCase()
    const fallbackReason = cleanText(mealStateAfter.fallbackReason || mealStateAfter.fallback_reason)
    const legacyGateClause = cleanText(mealStateAfter.legacyGateClause || mealStateAfter.legacy_gate_clause)
    if (processingMode) {
      summary.by_processing_mode[processingMode] = (summary.by_processing_mode[processingMode] || 0) + 1
      if (processingMode === "graph_native") summary.graph_native_turns += 1
      if (processingMode === "legacy") summary.legacy_fallback_turns += 1
    }
    if (fallbackReason) {
      summary.by_fallback_reason[fallbackReason] = (summary.by_fallback_reason[fallbackReason] || 0) + 1
    }
    if (legacyGateClause) {
      summary.by_legacy_gate_clause[legacyGateClause] = (summary.by_legacy_gate_clause[legacyGateClause] || 0) + 1
    }
    const mealActions = [...record.persisted_actions, ...record.actions].filter((action) => action?.type === "log_meal" || action?.type === "update_meal_log")
    if (mealActions.some((action) => {
      const confidence = cleanText(action?.macro_confidence).toLowerCase()
      const sourceType = cleanText(action?.nutrition_source_type).toLowerCase()
      return confidence === "low" || confidence === "medium" || ["estimated_internal_profile", "mixed_reference_and_estimate", "photo_ai_estimate", "manual_user_entry"].includes(sourceType)
    })) {
      summary.low_confidence_macro_turns += 1
    }
    if (
      mealActions.some((action) => cleanText(action?.nutrition_source_type).toLowerCase() === "photo_ai_estimate")
      && (record.clarification_asked || mealActions.some((action) => cleanText(action?.macro_confidence).toLowerCase() !== "high"))
    ) {
      summary.photo_review_turns += 1
    }
    for (const flag of record.flags) {
      summary.by_flag[flag.code] = (summary.by_flag[flag.code] || 0) + 1
      if (flag.code === "parser_warning") summary.parser_warnings += 1
      if (flag.code === "clarification_loop") summary.clarification_loops += 1
      if (flag.code === "fake_save_blocked") summary.fake_save_blocked += 1
    }
    if (record.clarification_asked && record.assistant_reply) {
      summary.repeated_clarifications[record.assistant_reply] = (summary.repeated_clarifications[record.assistant_reply] || 0) + 1
    }
    if (record.flags.some((flag) => flag.code === "parser_warning")) {
      const unknownInput = record.user_message || "(empty)"
      summary.common_unknown_inputs[unknownInput] = (summary.common_unknown_inputs[unknownInput] || 0) + 1
    }
  }

  return summary
}

export function buildCoachAuditResponseMeta(record = {}) {
  return {
    log_id: String(record.log_id || record.message_id || ""),
    session_id: String(record.session_id || ""),
    message_id: String(record.message_id || record.log_id || ""),
    route_type: String(record.route_type || "fallback"),
    intent: String(record.intent || "general_chat"),
  }
}

export function normalizeAuditClientPatch(body = {}, user = null) {
  return normalizeAuditValue({
    ...body,
    user_id: body.user_id || user?.id || "",
    user_email: body.user_email || user?.email || "",
  }, user)
}

export function buildCoachAuditDebugPrompt(record = {}) {
  return [
    "Investigate this beta Coach failure generally, not as a one-off patch.",
    "",
    `Route type: ${record.route_type || "unknown"}`,
    `Intent: ${record.intent || "unknown"}`,
    `Persistence status: ${record.persistence_status || "unknown"}`,
    `Flags: ${safeArray(record.flags, 20).map((flag) => flag.code).join(", ") || "none"}`,
    `Actual behaviour: ${record.assistant_reply || "(empty reply)"}`,
    "",
    "Conversation transcript:",
    ...sanitizeConversationWindow(record.conversation_window || []).map((message) => `${message.role}: ${message.content}`),
    `user: ${record.user_message || ""}`,
    `assistant: ${record.assistant_reply || ""}`,
    "",
    "State before:",
    JSON.stringify(record.state_before || {}, null, 2),
    "",
    "State after:",
    JSON.stringify(record.state_after || {}, null, 2),
    "",
    "Proposed actions:",
    JSON.stringify(record.actions || [], null, 2),
    "",
    "Persisted actions:",
    JSON.stringify(record.persisted_actions || [], null, 2),
    "",
    "Expected behaviour if obvious:",
    "- Preserve clarification target and value type across turns.",
    "- Do not let complaint text become food or ingredients.",
    "- Never persist structurally corrupted meal or workout state.",
    "- Fix this generally, not as a one-off patch.",
    "",
    "Expected behaviour:",
    "Fix this generally, not as a one-off patch.",
  ].join("\n")
}
