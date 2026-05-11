import assert from "node:assert/strict"
import test from "node:test"
import {
  buildCoachAuditFlags,
  buildCoachAuditResponseMeta,
  buildCoachAuditDebugPrompt,
  detectCoachAuditIntent,
  normalizeAuditClientPatch,
  sanitizeCoachStateSnapshot,
} from "../server/coachAudit.mjs"

test("normalizeAuditClientPatch keeps safe state snapshots and computes flags", () => {
  const patch = normalizeAuditClientPatch({
    log_id: "chat_1",
    message_id: "chat_1",
    session_id: "session_1",
    user_message: "i had egg and cake",
    assistant_reply: "Saved to today's nutrition: 1 eggs, plus 1 serve 18.",
    route_type: "ai-assisted",
    state_before: {
      meal_session: {
        active: true,
        items: [{ base_name: "egg", quantity: { amount: 18, unit: "egg", text: "18" } }],
      },
    },
    state_after: {
      meal_session: {
        active: false,
        summary: "1 eggs, plus 1 serve 18",
        items: [{ base_name: "egg" }],
        structuralIssues: [{ code: "orphan_quantity", message: "Orphan quantity remained." }],
      },
    },
    actions: [{ type: "log_meal", food_name: "1 eggs, plus 1 serve 18" }],
    persisted_actions: [{ type: "log_meal", food_name: "1 eggs, plus 1 serve 18" }],
    persistence_status: "succeeded",
    conversation_window: [
      { role: "assistant", content: "How many eggs did you have?" },
    ],
  }, { id: "user_1", email: "tester@example.com" })

  assert.equal(patch.user_id, "user_1")
  assert.equal(patch.user_email, "tester@example.com")
  assert.ok(patch.flags.some((flag) => flag.code === "numeric_food_item"))
  assert.ok(patch.flags.some((flag) => flag.code === "parser_warning"))
})

test("buildCoachAuditFlags catches fake save replies without persisted actions", () => {
  const flags = buildCoachAuditFlags({
    user_message: "log it",
    assistant_reply: "Saved to today's nutrition.",
    persisted_actions: [],
    route_type: "ai-assisted",
    persistence_status: "failed_before_persistence",
  })

  assert.ok(flags.some((flag) => flag.code === "fake_save_blocked"))
})

test("buildCoachAuditFlags catches clarification target loss and unbound decimal quantity replies", () => {
  const flags = buildCoachAuditFlags({
    user_message: "19.2",
    assistant_reply: "I need to know which item the 19.2 applies to: Eggs or Pie or Milk Today?",
    persisted_actions: [],
    route_type: "deterministic",
    persistence_status: "not_requested",
    state_before: {
      meal_session: {
        pendingClarification: {
          type: "quantity",
          targetReference: "egg",
          targetBaseName: "egg",
          targetLabel: "Eggs",
          expectedValueType: "number",
        },
      },
    },
    state_after: {
      meal_session: {
        pendingClarification: {
          type: "quantity",
          targetReference: "pie",
          targetBaseName: "pie",
          targetLabel: "Pie",
          expectedValueType: "number",
        },
      },
    },
    conversation_window: [
      { role: "assistant", content: "How many eggs did you have?" },
    ],
  })

  assert.ok(flags.some((flag) => flag.code === "clarification_target_lost"))
  assert.ok(flags.some((flag) => flag.code === "decimal_quantity_unbound"))
})

test("buildCoachAuditFlags catches complaint-derived foods, corrupted persistence, and ignored delete intent", () => {
  const persistedFlags = buildCoachAuditFlags({
    user_message: "eggs, you asked how many eggs and I gave you a number, why can't you understand?",
    assistant_reply: "Saved to today's nutrition: 1 serve pie, plus 1 eggs, plus 500ml milk today, plus 1 serve gave you number, plus 1 serve why can't you understand.",
    persisted_actions: [
      {
        type: "log_meal",
        food_name: "1 serve pie, plus 1 eggs, plus 500ml milk today, plus 1 serve gave you number, plus 1 serve why can't you understand.",
      },
    ],
    route_type: "deterministic",
    persistence_status: "succeeded",
    state_after: {
      meal_session: {
        items: [
          { base_name: "pie", label: "Pie" },
          { base_name: "egg", label: "Eggs" },
          { base_name: "milk today", label: "Milk Today" },
          { base_name: "gave you number", label: "Gave You Number" },
          { base_name: "why can't you understand", label: "Why Can't You Understand" },
        ],
      },
    },
    conversation_window: [
      { role: "assistant", content: "How much milk did you have?" },
    ],
  })

  assert.ok(persistedFlags.some((flag) => flag.code === "frustration_text_parsed_as_food"))
  assert.ok(persistedFlags.some((flag) => flag.code === "fake_food_from_user_complaint"))
  assert.ok(persistedFlags.some((flag) => flag.code === "corrupted_state_persisted"))

  const deleteFlags = buildCoachAuditFlags({
    user_message: "delete it",
    assistant_reply: "I already saved that meal. If you want to change it, tell me what to update.",
    persisted_actions: [],
    route_type: "deterministic",
    persistence_status: "already_logged",
  })

  assert.ok(deleteFlags.some((flag) => flag.code === "delete_intent_ignored"))
})

test("detectCoachAuditIntent distinguishes questions from logging", () => {
  assert.equal(
    detectCoachAuditIntent({
      message: "how much protein is usually in a small latte?",
      routeType: "ai-assisted",
      actions: [],
    }),
    "nutrition_question"
  )

  assert.equal(
    detectCoachAuditIntent({
      message: "i had steak and rice",
      mealContext: { wantsLogging: true, readyToLog: false },
      routeType: "deterministic",
    }),
    "meal_logging"
  )
})

test("buildCoachAuditDebugPrompt includes transcript and state deltas", () => {
  const prompt = buildCoachAuditDebugPrompt({
    route_type: "ai-assisted",
    intent: "meal_logging",
    conversation_window: [{ role: "assistant", content: "How many eggs did you have?" }],
    user_message: "18",
    assistant_reply: "Saved to today's nutrition: 18 eggs.",
    state_before: { meal_session: { active: true } },
    state_after: { meal_session: { active: false, summary: "18 eggs" } },
    actions: [{ type: "log_meal" }],
    persisted_actions: [{ type: "log_meal", food_name: "18 eggs" }],
    flags: [{ code: "fake_save_blocked" }],
    persistence_status: "succeeded",
  })

  assert.match(prompt, /Conversation transcript:/)
  assert.match(prompt, /State before:/)
  assert.match(prompt, /Persisted actions:/)
  assert.match(prompt, /Fix this generally, not as a one-off patch/)
})

test("sanitizeCoachStateSnapshot removes deep thread noise but keeps clarify state", () => {
  const snapshot = sanitizeCoachStateSnapshot({
    meal_session: {
      active: true,
      clarifyQuestion: "How many eggs did you have?",
      pendingClarification: {
        type: "quantity",
        targetReference: "egg",
        targetBaseName: "egg",
        expectedValueType: "number",
      },
      thread_messages: [
        { role: "user", content: "i had egg" },
      ],
    },
  })

  assert.equal(snapshot.meal_session.clarifyQuestion, "How many eggs did you have?")
  assert.equal(snapshot.meal_session.pendingClarification.expectedValueType, "number")
  assert.equal("thread_messages" in snapshot.meal_session, false)
})

test("buildCoachAuditResponseMeta preserves ids for client finalisation", () => {
  const meta = buildCoachAuditResponseMeta({
    log_id: "chat_1",
    session_id: "session_1",
    message_id: "chat_1",
    route_type: "deterministic",
    intent: "meal_logging",
  })

  assert.deepEqual(meta, {
    log_id: "chat_1",
    session_id: "session_1",
    message_id: "chat_1",
    route_type: "deterministic",
    intent: "meal_logging",
  })
})
