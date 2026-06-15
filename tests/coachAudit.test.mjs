import assert from "node:assert/strict"
import test from "node:test"
import {
  buildCoachAuditFlags,
  buildCoachAuditResponseMeta,
  buildCoachAuditDebugPrompt,
  detectCoachAuditIntent,
  normalizeAuditClientPatch,
  sanitizeCoachStateSnapshot,
  summarizeCoachAuditRecords,
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

test("buildCoachAuditFlags does not flag conditional save offers as fake persistence", () => {
  const flags = buildCoachAuditFlags({
    user_message: "how many calories is that?",
    assistant_reply: "That comes to about 294 kcal. If you want it saved, tell me to log it.",
    persisted_actions: [],
    route_type: "deterministic",
    persistence_status: "not_requested",
    state_after: {
      meal_session: {
        readyToLog: true,
        wantsNutrition: true,
        answerOnly: true,
        summary: "3 fried eggs cooked in 10g butter, plus 250ml Earl Grey tea with no milk and no sugar",
      },
    },
  })

  assert.equal(flags.some((flag) => flag.code === "fake_save_blocked"), false)
})

test("buildCoachAuditFlags does not flag suppressed logging turns as missing actions", () => {
  const flags = buildCoachAuditFlags({
    user_message: "i had steak and beer today, don't log that",
    assistant_reply: "Okay, I won't save that.",
    persisted_actions: [],
    route_type: "deterministic",
    persistence_status: "suppressed",
    intent: "meal_logging",
    state_after: {
      meal_session: {
        wantsLogging: true,
        suppressed: true,
        suppressionReply: "Okay, I won't save that.",
      },
    },
  })

  assert.equal(flags.some((flag) => flag.code === "no_action_when_expected"), false)
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

test("buildCoachAuditFlags does not flag a decimal reply when it binds to the asked item and moves on cleanly", () => {
  const flags = buildCoachAuditFlags({
    user_message: "19.2",
    assistant_reply: "How much milk did you have?",
    persisted_actions: [],
    route_type: "deterministic",
    persistence_status: "not_requested",
    state_before: {
      meal_session: {
        items: [
          { base_name: "pie", label: "Pie" },
          { base_name: "egg", label: "Eggs" },
          { base_name: "milk", label: "Milk" },
        ],
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
        items: [
          { base_name: "pie", label: "Pie", quantity: { amount: 1, unit: "serve", text: "1 serve" } },
          { base_name: "egg", label: "Eggs", quantity: { amount: 19.2, unit: "egg", text: "19.2 eggs" } },
          { base_name: "milk", label: "Milk" },
        ],
        pendingClarification: {
          type: "quantity",
          targetReference: "milk",
          targetBaseName: "milk",
          targetLabel: "Milk",
          expectedValueType: "number",
        },
      },
    },
    conversation_window: [
      { role: "assistant", content: "How many eggs did you have?" },
      { role: "user", content: "19.2" },
      { role: "assistant", content: "How much milk did you have?" },
    ],
  })

  assert.equal(flags.some((flag) => flag.code === "clarification_loop"), false)
  assert.equal(flags.some((flag) => flag.code === "clarification_target_lost"), false)
  assert.equal(flags.some((flag) => flag.code === "decimal_quantity_unbound"), false)
})

test("buildCoachAuditFlags does not flag a repeated clarification as a loop when another unresolved item was filled correctly", () => {
  const flags = buildCoachAuditFlags({
    user_message: "355ml milk no sugar",
    assistant_reply: "What were the fried steak cooked in?",
    persisted_actions: [],
    route_type: "deterministic",
    persistence_status: "not_requested",
    clarification_asked: true,
    state_before: {
      meal_session: {
        summary: "4 fried steaks, plus milk",
        items: [
          { base_name: "steak", label: "Steak", quantity: { amount: 4, unit: "steak", text: "4 steaks" }, preparation: ["fried"] },
          { base_name: "milk", label: "Milk" },
        ],
        pendingClarification: {
          type: "cooking_medium",
          targetReference: "steak::fried",
          targetBaseName: "steak",
          targetLabel: "Steak",
          expectedValueType: "ingredient",
        },
      },
    },
    state_after: {
      meal_session: {
        summary: "4 fried steaks, plus 355ml milk with no sugar",
        items: [
          { base_name: "steak", label: "Steak", quantity: { amount: 4, unit: "steak", text: "4 steaks" }, preparation: ["fried"] },
          { base_name: "milk", label: "Milk", quantity: { amount: 355, unit: "ml", text: "355ml" }, exclusions: ["no sugar"] },
        ],
        pendingClarification: {
          type: "cooking_medium",
          targetReference: "steak::fried",
          targetBaseName: "steak",
          targetLabel: "Steak",
          expectedValueType: "ingredient",
        },
      },
    },
    conversation_window: [
      { role: "assistant", content: "What were the fried steak cooked in?" },
      { role: "user", content: "355ml milk no sugar" },
      { role: "assistant", content: "What were the fried steak cooked in?" },
    ],
  })

  assert.equal(flags.some((flag) => flag.code === "clarification_loop"), false)
})

test("buildCoachAuditFlags does not flag a repeated workout clarification as a loop when workout state progressed", () => {
  const flags = buildCoachAuditFlags({
    user_message: "2 sets",
    assistant_reply: "How many reps did you do for Row?",
    persisted_actions: [],
    route_type: "deterministic",
    persistence_status: "not_requested",
    clarification_asked: true,
    state_before: {
      workout_session: {
        exercise_name: "Row",
        workout_type: "Row",
        sets: 0,
        reps: 0,
        clarifyQuestion: "How many reps did you do for Row?",
      },
    },
    state_after: {
      workout_session: {
        exercise_name: "Row",
        workout_type: "Row",
        sets: 2,
        reps: 0,
        clarifyQuestion: "How many reps did you do for Row?",
      },
    },
    conversation_window: [
      { role: "assistant", content: "How many reps did you do for Row?" },
      { role: "user", content: "2 sets" },
      { role: "assistant", content: "How many reps did you do for Row?" },
    ],
  })

  assert.equal(flags.some((flag) => flag.code === "clarification_loop"), false)
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

test("buildCoachAuditFlags does not flag valid numeric food quantities as fake numeric food items", () => {
  const flags = buildCoachAuditFlags({
    user_message: "500ml",
    assistant_reply: "Saved to today's nutrition: 1 serve pie, plus 19.2 eggs, plus 500ml milk.",
    persisted_actions: [
      {
        type: "log_meal",
        food_name: "1 serve pie, plus 19.2 eggs, plus 500ml milk",
      },
    ],
    route_type: "deterministic",
    persistence_status: "succeeded",
    state_after: {
      meal_session: {
        items: [
          { base_name: "pie", label: "Pie" },
          { base_name: "egg", label: "Eggs" },
          { base_name: "milk", label: "Milk" },
        ],
      },
    },
  })

  assert.equal(flags.some((flag) => flag.code === "numeric_food_item"), false)
  assert.equal(flags.some((flag) => flag.code === "corrupted_state_persisted"), false)
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

test("normalizeAuditClientPatch keeps tool-assisted route types", () => {
  const patch = normalizeAuditClientPatch({
    log_id: "tool_1",
    message_id: "tool_1",
    session_id: "session_1",
    user_message: "photo analysis: burger and chips",
    assistant_reply: "I identified 2 items from the photo.",
    route_type: "tool-assisted",
  }, { id: "user_1", email: "tester@example.com" })

  assert.equal(patch.route_type, "tool-assisted")
})

test("summarizeCoachAuditRecords tracks processing mode and estimate-heavy turns", () => {
  const summary = summarizeCoachAuditRecords([
    normalizeAuditClientPatch({
      log_id: "graph_1",
      message_id: "graph_1",
      session_id: "session_1",
      user_message: "i had 3 eggs",
      assistant_reply: "Saved to today's nutrition: 3 eggs.",
      route_type: "deterministic",
      persistence_status: "succeeded",
      state_after: {
        meal_session: {
          processingMode: "graph_native",
          fallbackReason: "",
        },
      },
      persisted_actions: [{
        type: "log_meal",
        food_name: "3 eggs",
        nutrition_source_type: "curated_au_catalogue",
        macro_confidence: "high",
      }],
    }),
    normalizeAuditClientPatch({
      log_id: "legacy_1",
      message_id: "legacy_1",
      session_id: "session_1",
      user_message: "photo analysis: sliders and lettuce",
      assistant_reply: "Review the items below and log the reviewed estimate.",
      route_type: "tool-assisted",
      clarification_asked: true,
      persistence_status: "not_requested",
      state_after: {
        meal_session: {
          processingMode: "legacy",
          fallbackReason: "legacy_gate",
        },
      },
      actions: [{
        type: "log_meal",
        food_name: "sliders and lettuce",
        nutrition_source_type: "photo_ai_estimate",
        macro_confidence: "medium",
      }],
    }),
  ])

  assert.equal(summary.graph_native_turns, 1)
  assert.equal(summary.legacy_fallback_turns, 1)
  assert.equal(summary.tool_assisted_turns, 1)
  assert.equal(summary.low_confidence_macro_turns, 1)
  assert.equal(summary.photo_review_turns, 1)
  assert.equal(summary.by_processing_mode.graph_native, 1)
  assert.equal(summary.by_processing_mode.legacy, 1)
  assert.equal(summary.by_fallback_reason.legacy_gate, 1)
  assert.equal(summary.by_route["tool-assisted"], 1)
})
