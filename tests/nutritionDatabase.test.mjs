import assert from "node:assert/strict"
import test from "node:test"

import { findBestFoodMatch, searchBestFoodMatches, searchPhotoReferenceFoods } from "../src/lib/nutritionDatabase.js"

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

test("findBestFoodMatch widens deterministic matching for common food questions", () => {
  const caesar = findBestFoodMatch("standard serve of caesar salad")
  assert.ok(caesar)
  assert.match(String(caesar.name || ""), /caesar salad/i)
  assert.equal(caesar.source_type, "estimated_internal_profile")

  const sandwichMatches = searchBestFoodMatches("chicken sandwich")
  assert.ok(sandwichMatches.length > 0)
  assert.match(String(sandwichMatches[0]?.name || ""), /chicken sandwich/i)
})

test("findBestFoodMatch covers broader common mixed dishes and drinks with deterministic profiles", () => {
  const poke = findBestFoodMatch("salmon poke bowl")
  assert.ok(poke)
  assert.match(String(poke.name || ""), /poke bowl/i)
  assert.equal(poke.source_type, "estimated_internal_profile")
  assert.equal(poke.calories, 650)

  const padThai = findBestFoodMatch("chicken pad thai")
  assert.ok(padThai)
  assert.match(String(padThai.name || ""), /pad thai/i)
  assert.equal(padThai.calories, 640)

  const kebab = findBestFoodMatch("chicken souvlaki wrap")
  assert.ok(kebab)
  assert.match(String(kebab.name || ""), /souvlaki|kebab/i)
  assert.equal(kebab.protein_g, 38)

  const proteinShake = findBestFoodMatch("protein shake")
  assert.ok(proteinShake)
  assert.match(String(proteinShake.name || ""), /protein shake/i)
  assert.ok(Number(proteinShake.protein_g) >= 30)

  const fishAndChips = findBestFoodMatch("fish and chips")
  assert.ok(fishAndChips)
  assert.match(String(fishAndChips.name || ""), /fish and chips/i)
  assert.equal(fishAndChips.calories, 820)

  const banhMi = findBestFoodMatch("chicken banh mi")
  assert.ok(banhMi)
  assert.match(String(banhMi.name || ""), /banh mi/i)
  assert.equal(banhMi.category, "mixed meal")

  const hsp = findBestFoodMatch("hsp")
  assert.ok(hsp)
  assert.match(String(hsp.name || ""), /hsp/i)
  assert.equal(hsp.calories, 1200)

  const breakfastBurrito = findBestFoodMatch("breakfast burrito")
  assert.ok(breakfastBurrito)
  assert.match(String(breakfastBurrito.name || ""), /breakfast burrito/i)
  assert.equal(breakfastBurrito.calories, 620)

  const friedChickenAndChips = findBestFoodMatch("fried chicken and chips")
  assert.ok(friedChickenAndChips)
  assert.match(String(friedChickenAndChips.name || ""), /fried chicken and chips/i)
  assert.equal(friedChickenAndChips.calories, 980)

  const handRoll = findBestFoodMatch("salmon hand roll")
  assert.ok(handRoll)
  assert.match(String(handRoll.name || ""), /hand roll/i)
  assert.equal(handRoll.category, "mixed meal")

  const parmi = findBestFoodMatch("parmi")
  assert.ok(parmi)
  assert.match(String(parmi.name || ""), /parmi|parma|parmigiana/i)
  assert.equal(parmi.calories, 1050)

  const baconEggRoll = findBestFoodMatch("bacon and egg roll")
  assert.ok(baconEggRoll)
  assert.match(String(baconEggRoll.name || ""), /bacon and egg roll/i)
  assert.equal(baconEggRoll.calories, 430)

  const teriyakiChickenBowl = findBestFoodMatch("teriyaki chicken bowl")
  assert.ok(teriyakiChickenBowl)
  assert.match(String(teriyakiChickenBowl.name || ""), /teriyaki chicken bowl/i)
  assert.equal(teriyakiChickenBowl.calories, 620)

  const bubbleTea = findBestFoodMatch("bubble tea")
  assert.ok(bubbleTea)
  assert.match(String(bubbleTea.name || ""), /bubble tea/i)
  assert.equal(bubbleTea.calories, 290)

  const dimSimsNoSpace = findBestFoodMatch("dimsims")
  assert.ok(dimSimsNoSpace)
  assert.match(String(dimSimsNoSpace.name || ""), /dim/i)
  assert.equal(dimSimsNoSpace.calories, 340)

  const potatoScallops = findBestFoodMatch("potato scallops")
  assert.ok(potatoScallops)
  assert.match(String(potatoScallops.name || ""), /potato scallops/i)
  assert.equal(potatoScallops.category, "snack")

  const cheeseToastie = findBestFoodMatch("toastie with cheese")
  assert.ok(cheeseToastie)
  assert.match(String(cheeseToastie.name || ""), /toastie/i)
  assert.equal(cheeseToastie.calories, 360)

  const sausageSizzle = findBestFoodMatch("sausage sizzle")
  assert.ok(sausageSizzle)
  assert.match(String(sausageSizzle.name || ""), /sausage sizzle/i)
  assert.equal(sausageSizzle.calories, 350)

  const subwayChickenTeriyaki = findBestFoodMatch("subway chicken teriyaki")
  assert.ok(subwayChickenTeriyaki)
  assert.match(String(subwayChickenTeriyaki.name || ""), /subway chicken teriyaki/i)
  assert.equal(subwayChickenTeriyaki.calories, 380)

  const kfcOriginalBurger = findBestFoodMatch("kfc original burger")
  assert.ok(kfcOriginalBurger)
  assert.match(String(kfcOriginalBurger.name || ""), /kfc original burger/i)
  assert.equal(kfcOriginalBurger.calories, 500)

  const bigMac = findBestFoodMatch("mcdonalds big mac")
  assert.ok(bigMac)
  assert.match(String(bigMac.name || ""), /big mac/i)
  assert.equal(bigMac.calories, 550)

  const doubleCheeseburger = findBestFoodMatch("double cheeseburger")
  assert.ok(doubleCheeseburger)
  assert.match(String(doubleCheeseburger.name || ""), /double cheeseburger/i)
  assert.equal(doubleCheeseburger.calories, 445)

  const lamington = findBestFoodMatch("lamington")
  assert.ok(lamington)
  assert.match(String(lamington.name || ""), /lamington/i)
  assert.equal(lamington.category, "dessert")

  const pavlova = findBestFoodMatch("pavlova")
  assert.ok(pavlova)
  assert.match(String(pavlova.name || ""), /pavlova/i)
  assert.equal(pavlova.calories, 320)
})

test("findBestFoodMatch falls back to a deterministic food-class estimate for unknown foods", () => {
  const barramundi = findBestFoodMatch("barramundi fillet")
  assert.ok(barramundi)
  assert.match(String(barramundi.name || ""), /barramundi fillet/i)
  assert.equal(barramundi.source_type, "estimated_internal_profile")
  assert.equal(barramundi.source, "ApexAI deterministic food-class estimate")
  assert.equal(barramundi.calories, 128)
  assert.equal(barramundi.protein_g, 24)
  assert.equal(barramundi.carbs_g, 0)
  assert.equal(barramundi.fat_g, 3)
})
