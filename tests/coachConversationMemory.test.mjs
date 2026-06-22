import test from "node:test"
import assert from "node:assert/strict"
import { buildRecalledCoachMessages, looksLikeCoachMemoryReference, mergeRecalledCoachMessages } from "../src/lib/coachConversationMemory.js"

function user(content, timestamp) {
  return { role: "user", content, timestamp }
}

function assistant(content, timestamp) {
  return { role: "assistant", content, timestamp }
}

test("coach conversation memory recalls an older advice exchange when the user asks about it later", () => {
  const messages = [
    user("My shoulder hurts when I bench press", "2026-06-18T08:00:00.000Z"),
    assistant("Keep the load lighter, tuck your elbows a bit, and pause if it feels sharp.", "2026-06-18T08:00:20.000Z"),
    ...Array.from({ length: 20 }, (_, index) => (
      index % 2 === 0
        ? user(`filler user ${index}`, `2026-06-19T08:${String(index).padStart(2, "0")}:00.000Z`)
        : assistant(`filler assistant ${index}`, `2026-06-19T08:${String(index).padStart(2, "0")}:30.000Z`)
    )),
  ]

  const recalled = buildRecalledCoachMessages(messages, "What was that shoulder pain advice again?")
  assert.ok(recalled.some((message) => /shoulder hurts when i bench press/i.test(message.content)))
  assert.ok(recalled.some((message) => /keep the load lighter/i.test(message.content)))
})

test("coach conversation memory falls back to the latest older exchange for vague follow-ups", () => {
  const messages = [
    user("I had milk", "2026-06-18T08:00:00.000Z"),
    assistant("How much milk did you have?", "2026-06-18T08:00:05.000Z"),
    user("I did pushups", "2026-06-18T08:01:00.000Z"),
    assistant("How many pushups did you do?", "2026-06-18T08:01:05.000Z"),
    ...Array.from({ length: 20 }, (_, index) => (
      index % 2 === 0
        ? user(`recent filler user ${index}`, `2026-06-21T10:${String(index).padStart(2, "0")}:00.000Z`)
        : assistant(`recent filler assistant ${index}`, `2026-06-21T10:${String(index).padStart(2, "0")}:30.000Z`)
    )),
  ]

  const recalled = buildRecalledCoachMessages(messages, "and it was 500ml")
  assert.ok(recalled.some((message) => /how much milk did you have/i.test(message.content)))
})

test("coach conversation memory stays empty for unrelated fresh prompts", () => {
  const messages = [
    user("I had steak and rice", "2026-06-18T08:00:00.000Z"),
    assistant("How much steak did you have?", "2026-06-18T08:00:05.000Z"),
    ...Array.from({ length: 20 }, (_, index) => (
      index % 2 === 0
        ? user(`recent filler user ${index}`, `2026-06-21T10:${String(index).padStart(2, "0")}:00.000Z`)
        : assistant(`recent filler assistant ${index}`, `2026-06-21T10:${String(index).padStart(2, "0")}:30.000Z`)
    )),
  ]

  const recalled = buildRecalledCoachMessages(messages, "How many calories are in a banana?")
  assert.deepEqual(recalled, [])
})

test("coach conversation memory flags explicit historical-reference cues", () => {
  assert.equal(looksLikeCoachMemoryReference("continue from earlier"), true)
  assert.equal(looksLikeCoachMemoryReference("what did you say before about my shoulder?"), true)
  assert.equal(looksLikeCoachMemoryReference("what was that shoulder pain advice again?"), true)
  assert.equal(looksLikeCoachMemoryReference("how many calories are in oats?"), false)
})

test("coach conversation memory merges recalled snippets ahead of recent history without duplicates", () => {
  const merged = mergeRecalledCoachMessages(
    [assistant("Recent reply", "2026-06-21T10:00:00.000Z")],
    [
      user("I had milk", "2026-06-18T08:00:00.000Z"),
      assistant("How much milk did you have?", "2026-06-18T08:00:05.000Z"),
      assistant("Recent reply", "2026-06-21T10:00:00.000Z"),
    ],
    6,
  )

  assert.equal(merged.length, 3)
  assert.equal(merged[0].content, "I had milk")
  assert.equal(merged[1].content, "How much milk did you have?")
  assert.equal(merged[2].content, "Recent reply")
})
