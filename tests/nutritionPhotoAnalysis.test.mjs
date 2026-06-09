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
  assert.equal(estimate.needs_review, false)
  assert.equal(estimate.clarification_question, "")
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

  assert.equal(estimate.action, null)
  assert.equal(estimate.can_autofill, false)
  assert.equal(estimate.macro_confidence, "low")
  assert.equal(estimate.breakdown.some((item) => item.source_type === "estimated_internal_profile"), true)
  assert.equal("calories" in estimate.breakdown[0], false)
  assert.match(estimate.nutrition_source || "", /review before saving/i)
  assert.match(estimate.clarification_question || "", /need review/i)
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
  assert.equal(estimate.needs_review, false)
})

test("buildFoodPhotoEstimate keeps multi-item verified photos auto-fillable when every match is trusted", async () => {
  const estimate = await buildFoodPhotoEstimate({
    items: [
      {
        name: "eggs",
        quantity: "2 eggs",
        preparation: "",
        category: "food",
        confidence: "high",
      },
      {
        name: "milk",
        quantity: "250ml milk",
        preparation: "",
        category: "drink",
        confidence: "high",
      },
    ],
    portion: "1 meal",
  }, {
    mealType: "breakfast",
    lookupFoods: async (term) => {
      if (term.includes("egg")) return [{ ...verifiedFoods.find((food) => food.id === "egg_chicken_whole_raw") }]
      if (term.includes("milk")) return [{ ...verifiedFoods.find((food) => food.id === "milk_cow_regular") }]
      return []
    },
  })

  assert.ok(estimate.action)
  assert.equal(estimate.can_autofill, true)
  assert.equal(estimate.needs_review, false)
  assert.equal(estimate.breakdown.every((item) => Number.isFinite(item.calories)), true)
})

test("normalizeFoodPhotoAnalysis infers high overall confidence from a single high-confidence item", () => {
  const normalized = normalizeFoodPhotoAnalysis({
    items: [
      {
        name: "banana",
        quantity: "1 banana",
        category: "food",
        confidence: "high",
      },
    ],
  })

  assert.equal(normalized.overall_confidence, "high")
})

test("normalizeFoodPhotoAnalysis strips model-generated item numbering noise from food names", () => {
  const normalized = normalizeFoodPhotoAnalysis({
    items: [
      {
        name: "banana item 1",
        quantity: "1 banana",
        category: "food",
        confidence: "high",
      },
    ],
  })

  assert.equal(normalized.items[0].name, "Banana")
  assert.equal(normalized.items[0].base_name, "banana")
  assert.equal(normalized.summary, "1 banana")
})

test("normalizeFoodPhotoAnalysis recovers a real food name from assumptions when the model emits a generic item label", () => {
  const normalized = normalizeFoodPhotoAnalysis({
    assumptions: ["Banana is the only item visible."],
    items: [
      {
        name: "item 1",
        quantity: "1",
        category: "food",
        confidence: "high",
      },
    ],
  })

  assert.equal(normalized.items[0].name, "Banana")
  assert.equal(normalized.items[0].base_name, "banana")
  assert.equal(normalized.summary, "1 banana")
})

test("normalizeFoodPhotoAnalysis recovers a simple single-item meal from summary text when the model omits items", () => {
  const normalized = normalizeFoodPhotoAnalysis({
    summary: "A single banana.",
    items: [],
  })

  assert.equal(normalized.items.length, 1)
  assert.equal(normalized.items[0].name, "Banana")
  assert.equal(normalized.items[0].base_name, "banana")
  assert.equal(normalized.summary, "1 banana")
})
