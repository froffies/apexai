import assert from "node:assert/strict"
import test from "node:test"

import { searchPhotoReferenceFoods } from "../src/lib/nutritionDatabase.js"

test("searchPhotoReferenceFoods prefers plain staple foods for simple photo terms", () => {
  const riceMatches = searchPhotoReferenceFoods("rice")
  assert.ok(riceMatches.length > 0)
  assert.match(riceMatches[0].name, /rice/i)
  assert.equal(/Rice Bubbles/i.test(riceMatches[0].name), false)

  const bananaMatches = searchPhotoReferenceFoods("ripe banana")
  assert.ok(bananaMatches.length > 0)
  assert.match(bananaMatches[0].name, /Banana/i)
})

test("searchPhotoReferenceFoods excludes estimated mixed-meal profiles for photo queries", () => {
  const chickenRiceMatches = searchPhotoReferenceFoods("chicken rice")
  assert.equal(chickenRiceMatches.some((food) => food.source_type === "estimated_internal_profile"), false)
})

test("searchPhotoReferenceFoods can use curated photo dish profiles for complex meals", () => {
  const biryaniMatches = searchPhotoReferenceFoods("veg biryani")
  assert.ok(biryaniMatches.length > 0)
  assert.equal(biryaniMatches.some((food) => food.source_type === "photo_dish_profile"), true)

  const samosaMatches = searchPhotoReferenceFoods("deep fried samosas")
  assert.equal(samosaMatches.some((food) => food.id === "photo_samosa"), true)

  const pizzaMatches = searchPhotoReferenceFoods("pepperoni pizza")
  assert.equal(pizzaMatches.some((food) => food.id === "photo_pizza"), true)
})
