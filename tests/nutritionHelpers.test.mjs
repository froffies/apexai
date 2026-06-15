import assert from "node:assert/strict"
import test from "node:test"
import {
  coachMealConfidenceNote,
  isLowConfidenceNutrition,
  macroConfidenceLabel,
  nutritionSourceLabel,
} from "../src/lib/nutritionHelpers.js"

test("nutrition helpers describe verified nutrition sources confidently", () => {
  const meal = {
    estimated: false,
    nutrition_source_type: "curated_au_catalogue",
    macro_confidence: "high",
  }

  assert.equal(nutritionSourceLabel(meal), "Curated AU reference")
  assert.equal(macroConfidenceLabel(meal.macro_confidence, meal.estimated), "High confidence")
  assert.equal(coachMealConfidenceNote(meal), "Verified from curated au reference.")
  assert.equal(isLowConfidenceNutrition(meal), false)
})

test("nutrition helpers flag estimated and photo-based macros clearly", () => {
  const estimatedMeal = {
    estimated: true,
    nutrition_source_type: "estimated_internal_profile",
    macro_confidence: "low",
  }
  const photoMeal = {
    estimated: true,
    nutrition_source_type: "photo_ai_estimate",
    macro_confidence: "medium",
  }

  assert.equal(macroConfidenceLabel(estimatedMeal.macro_confidence, estimatedMeal.estimated), "Estimated macros")
  assert.equal(coachMealConfidenceNote(estimatedMeal), "Macros are an estimate based on our AU/NZ reference profiles.")
  assert.equal(isLowConfidenceNutrition(estimatedMeal), true)

  assert.equal(nutritionSourceLabel(photoMeal), "AI photo estimate")
  assert.equal(coachMealConfidenceNote(photoMeal), "Photo-based estimate from the visible items.")
  assert.equal(isLowConfidenceNutrition(photoMeal), true)
})
