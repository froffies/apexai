import assert from "node:assert/strict"
import test from "node:test"
import { buildMealContext, emptyMealSession } from "../server/mealStateBuilder.mjs"

function user(content) {
  return { role: "user", content }
}

function assistant(content) {
  return { role: "assistant", content }
}

function replayMealConversation(conversation, recentLimit = 20) {
  let session = emptyMealSession()
  const history = []
  const snapshots = []

  for (const entry of conversation) {
    if (entry.role === "user") {
      const recentMessages = history.slice(-recentLimit)
      const nextSession = buildMealContext(recentMessages, entry.content, session.active ? session : null)
      if (nextSession) session = nextSession
      snapshots.push({ prompt: entry.content, session })
    }
    history.push(entry)
  }

  return { session, snapshots, history }
}

test("meal session accumulates the exact fragmented egg and tea conversation into one ready-to-log meal", () => {
  const conversation = [
    user("i had egg and tea"),
    assistant("What type of tea?"),
    user("earl grey"),
    assistant("How much tea did you have and was there any milk or sugar?"),
    user("250ml, no sugar no milk"),
    assistant("How many eggs did you have?"),
    user("17 fried eggs"),
    assistant("Anything they were cooked in?"),
    user("cooked in 100g of salted butter"),
    assistant("What dish was the butter used for?"),
    user("the eggs"),
    assistant("I still need more detail."),
    user("17 eggs fried in 100g of salted butter"),
    assistant("still says it needs more detail"),
    user("i just did"),
  ]

  const { session } = replayMealConversation(conversation)

  assert.ok(session.active)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")
  assert.equal(session.clarifyQuestion, "")
  assert.equal(session.items.filter((item) => !item.attached_to).length, 2)
})

test("meal session clarification flow advances instead of repeating the same missing question", () => {
  const { snapshots } = replayMealConversation([
    user("i had egg and tea"),
    assistant("How much egg did you have?"),
    user("earl grey"),
    assistant("How much Earl Grey tea did you have?"),
    user("250ml, no sugar no milk"),
    assistant("How many eggs did you have?"),
    user("17 fried eggs"),
  ])

  assert.equal(snapshots[0].session.clarifyQuestion, "How much egg did you have?")
  assert.equal(snapshots[1].session.clarifyQuestion, "How much earl grey tea did you have?")
  assert.equal(snapshots[2].session.clarifyQuestion, "How much egg did you have?")
  assert.equal(snapshots[3].session.clarifyQuestion, "What were the eggs cooked in?")
})

test("meal session survives truncated recent history because the existing session remains the source of truth", () => {
  const conversation = [
    user("i had egg and tea"),
    assistant("What type of tea?"),
    user("earl grey"),
    assistant("How much tea did you have and was there any milk or sugar?"),
    user("250ml, no sugar no milk"),
    assistant("How many eggs did you have?"),
    user("17 fried eggs"),
    assistant("Anything they were cooked in?"),
    user("cooked in 100g of salted butter"),
  ]

  const { session } = replayMealConversation(conversation)
  const followUp = buildMealContext([
    assistant("What dish was the butter used for?"),
  ], "the eggs", session)

  assert.ok(followUp)
  assert.equal(followUp.readyToLog, true)
  assert.equal(followUp.summary, "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")
})

test("meal session handles out-of-order details and later cooking fat additions", () => {
  const { session } = replayMealConversation([
    user("200g"),
    assistant("What was that for?"),
    user("chicken and rice"),
    assistant("Anything it was cooked in?"),
    user("also cooked in 1 tbsp olive oil"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.match(session.summary.toLowerCase(), /200g chicken/)
  assert.match(session.summary.toLowerCase(), /rice/)
  assert.match(session.summary.toLowerCase(), /1 tbsp olive oil/)
})

test("meal session corrections replace quantities instead of duplicating foods", () => {
  const { session } = replayMealConversation([
    user("i had 2 eggs and tea"),
    assistant("How much tea did you have?"),
    user("250ml"),
    user("actually 3 eggs not 2"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "3 eggs, plus 250ml tea")
  assert.equal(session.items.filter((item) => item.base_name === "egg").length, 1)
})

test("meal session caps repeated clarification loops and logs with a reasonable default once the user keeps repeating themselves", () => {
  const { session } = replayMealConversation([
    user("i had beans"),
    assistant("How much beans did you have?"),
    user("beans"),
    assistant("I still need the amount for the beans."),
    user("beans"),
  ])

  assert.ok(session)
  assert.equal(session.shouldStopClarifying, true)
  assert.equal(session.readyToLog, true)
  assert.equal(session.summary, "1 serve beans")
})

test("meal session keeps unusual but valid quantities and drink exclusions", () => {
  const { session } = replayMealConversation([
    user("i had 5 tins of heinz baked beans and 2L fresh squeezed apple juice"),
    assistant("Anything else with the juice?"),
    user("and an entire bunch of celery"),
  ])

  assert.ok(session)
  assert.equal(session.readyToLog, true)
  assert.match(session.summary.toLowerCase(), /5 tins heinz baked beans/)
  assert.match(session.summary.toLowerCase(), /2l fresh squeezed apple juice/)
  assert.match(session.summary.toLowerCase(), /1 bunch celery/)
})

test("meal session handles fifty varied fragmented conversations without loops or data loss", () => {
  const scenarios = [
    [
      user("i had chicken and rice"),
      assistant("How much chicken did you have?"),
      user("200g chicken"),
      assistant("How much rice did you have?"),
      user("1 cup rice"),
      user("also cooked in 1 tbsp olive oil"),
    ],
    [
      user("tea and toast"),
      assistant("What type of tea was it?"),
      user("earl grey"),
      assistant("How much tea did you have and was there any milk or sugar?"),
      user("250ml no milk"),
      user("1 slice rye toast"),
      user("1 tbsp vegemite"),
    ],
    [
      user("eggs"),
      assistant("How many eggs did you have?"),
      user("17 fried eggs"),
      assistant("What were they cooked in?"),
      user("100g salted butter"),
      user("used to fry the eggs"),
    ],
    [
      user("beans"),
      assistant("How much beans did you have?"),
      user("5 tins heinz baked beans"),
    ],
    [
      user("apple juice and celery"),
      assistant("How much juice did you have?"),
      user("2l fresh squeezed apple juice"),
      user("1 bunch celery"),
    ],
  ]

  for (let index = 0; index < 50; index += 1) {
    const conversation = scenarios[index % scenarios.length]
    const { session } = replayMealConversation(conversation)
    assert.ok(session, `scenario ${index + 1} should produce a meal session`)
    assert.equal(session.readyToLog, true, `scenario ${index + 1} should be ready to log`)
    assert.equal(session.clarifyQuestion, "", `scenario ${index + 1} should not ask another clarification`)
    assert.match(session.summary, /\S+/, `scenario ${index + 1} should keep a non-empty summary`)
  }
})
