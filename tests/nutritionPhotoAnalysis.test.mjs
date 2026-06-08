import assert from "node:assert/strict"
import test from "node:test"

import { verifiedFoods } from "../src/lib/nutritionDatabase.js"
import { buildFoodPhotoEstimate, normalizeFoodPhotoAnalysis } from "../server/nutritionPhotoAnalysis.mjs"

test("normalizeFoodPhotoAnalysis builds clean plate-photo item labels", () => {
  const normalized = normalizeFoodPhotoAnalysis({
    items: [
      {
        name: "eggs",
        quantity: "2 eggs",
        preparation: "scrambled",
        category: "food",
        confidence: "high",
      },
    ],
  })

  assert.equal(normalized.summary, "2 scrambled eggs")
  assert.equal(normalized.items[0].base_name, "egg")
  assert.equal(normalized.items[0].quantity, "2 eggs")
})

test("buildFoodPhotoEstimate uses curated matches when a clear AU reference exists", async () => {
  const estimate = await buildFoodPhotoEstimate({
    items: [
      {
        name: "eggs",
        quantity: "2 eggs",
        preparation: "",
        category: "food",
        confidence: "high",
      },
    ],
    portion: "1 plate",
  }, {
    mealType: "breakfast",
    lookupFoods: async (term) => term.includes("egg")
      ? [{ ...verifiedFoods.find((food) => food.id === "egg_chicken_whole_raw") }]
      : [],
  })

  assert.match(estimate.action?.food_name || "", /egg/i)
  assert.equal(estimate.action?.quantity, "1 plate")
  assert.equal(estimate.action?.nutrition_source_type, "photo_ai_estimate")
  assert.equal(estimate.macro_confidence, "high")
  assert.equal(estimate.breakdown[0]?.source_type, "curated_au_catalogue")
})

test("buildFoodPhotoEstimate falls back conservatively when a plate includes unmatched foods", async () => {
  const estimate = await buildFoodPhotoEstimate({
    items: [
      {
        name: "eggs",
        quantity: "2 eggs",
        preparation: "fried",
        category: "food",
        confidence: "high",
      },
      {
        name: "milk",
        quantity: "250ml milk",
        preparation: "",
        category: "drink",
        confidence: "medium",
      },
    ],
    portion: "1 plate",
  }, {
    mealType: "breakfast",
    lookupFoods: async (term) => term.includes("egg") ? [verifiedFoods.find((food) => food.id === "egg_chicken_whole_raw")] : [],
  })

  assert.match(estimate.action?.food_name || "", /eggs/i)
  assert.match(estimate.action?.food_name || "", /milk/i)
  assert.equal(estimate.action?.estimated, true)
  assert.equal(estimate.action?.nutrition_source_type, "photo_ai_estimate")
  assert.equal(estimate.macro_confidence, "low")
  assert.ok(Number(estimate.action?.calories) > 148)
  assert.equal(estimate.breakdown.some((item) => item.source_type === "estimated_internal_profile"), true)
  assert.match(estimate.action?.nutrition_source || "", /review before saving/i)
})

test("buildFoodPhotoEstimate treats curated NZ matches as high-confidence verified references", async () => {
  const estimate = await buildFoodPhotoEstimate({
    items: [
      {
        name: "weet-bix",
        quantity: "100g",
        preparation: "",
        category: "food",
        confidence: "high",
      },
    ],
    portion: "1 bowl",
  }, {
    mealType: "breakfast",
    lookupFoods: async (term) => term.includes("weet")
      ? [{ ...verifiedFoods.find((food) => food.id === "d1056") }]
      : [],
  })

  assert.match(estimate.action?.food_name || "", /100g/i)
  assert.match(estimate.action?.food_name || "", /weet/i)
  assert.equal(estimate.macro_confidence, "high")
  assert.equal(estimate.breakdown[0]?.source_type, "nz_curated_catalogue")
})
