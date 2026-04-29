import assert from "node:assert/strict"
import test from "node:test"
import { analyzeSyncConflict, reconcileSyncConflicts } from "../src/lib/cloudSync.js"

test("profile object differences now auto-merge instead of forcing a manual decision", () => {
  const { conflicts, autoMerges } = reconcileSyncConflicts(
    {
      "apexai.profile": { name: "Local Casey", onboarded: true },
      "apexai.meals": [{ id: "meal_1", food_name: "Eggs" }],
    },
    [
      { storage_key: "apexai.profile", value: { name: "Cloud Casey", onboarded: true }, updated_at: "2026-04-27T01:00:00Z" },
      { storage_key: "apexai.meals", value: [{ id: "meal_1", food_name: "Eggs" }], updated_at: "2026-04-27T01:00:00Z" },
      { storage_key: "apexai.workouts", value: [{ id: "workout_1" }], updated_at: "2026-04-27T01:00:00Z" },
    ]
  )

  assert.equal(conflicts.length, 0)
  assert.equal(autoMerges.length, 1)
  assert.equal(autoMerges[0].key, "apexai.profile")
  assert.equal(autoMerges[0].suggestedValue.name, "Local Casey")
  assert.equal(autoMerges[0].suggestedValue.onboarded, true)
})

test("collection sync differences auto-merge when records do not overlap", () => {
  const { conflicts, autoMerges } = reconcileSyncConflicts(
    {
      "apexai.meals": [{ id: "meal_local", food_name: "Eggs" }],
    },
    [
      { storage_key: "apexai.meals", value: [{ id: "meal_cloud", food_name: "Oats" }], updated_at: "2026-04-27T01:00:00Z" },
    ]
  )

  assert.equal(conflicts.length, 0)
  assert.equal(autoMerges.length, 1)
  assert.equal(autoMerges[0].key, "apexai.meals")
  assert.equal(autoMerges[0].suggestedValue.length, 2)
})

test("collection sync differences still produce a suggested local-first merge when the same record id diverges", () => {
  const conflict = analyzeSyncConflict(
    "apexai.meals",
    [{ id: "meal_1", food_name: "Chicken bowl", calories: 620 }],
    [{ id: "meal_1", food_name: "Chicken bowl", calories: 640 }],
    "2026-04-27T01:00:00Z"
  )

  assert.equal(conflict.kind, "mergeable_collection")
  assert.equal(conflict.canAutoMerge, true)
  assert.equal(conflict.collisions.length, 1)
  assert.equal(conflict.suggestedValue.length, 1)
  assert.equal(conflict.suggestedValue[0].calories, 620)
})
