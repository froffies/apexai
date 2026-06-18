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

  const eggsBenedictMatches = searchPhotoReferenceFoods("eggs benedict")
  assert.equal(eggsBenedictMatches.some((food) => food.id === "photo_eggs_benedict"), true)

  const charKwayTeowMatches = searchPhotoReferenceFoods("char kway teow")
  assert.equal(charKwayTeowMatches.some((food) => food.id === "photo_char_kway_teow"), true)

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

test("findBestFoodMatch does not confuse salad or oats with similarly named products", () => {
  const salad = findBestFoodMatch("salad")
  const oats = findBestFoodMatch("oat")

  assert.ok(salad)
  assert.match(String(salad.name || ""), /salad/i)
  assert.equal(/salada/i.test(String(salad.name || "")), false)

  assert.ok(oats)
  assert.match(String(oats.name || ""), /oats/i)
  assert.equal(/oat beverage|oat milk/i.test(String(oats.name || "")), false)
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

test("findBestFoodMatch fixes long-tail AU/NZ meals and branded products that previously mis-scored or returned nothing", () => {
  const cases = [
    { query: "spinach and feta roll", expect: /spinach and feta roll/i, minCalories: 350 },
    { query: "roast lamb roll", expect: /roast lamb roll/i, minCalories: 500 },
    { query: "eggs benny", expect: /eggs benedict/i, minCalories: 600 },
    { query: "eggs benedict", expect: /eggs benedict/i, minCalories: 600 },
    { query: "butter chicken naan", expect: /butter chicken/i, minCalories: 800 },
    { query: "chiko roll", expect: /chiko roll/i, minCalories: 400 },
    { query: "custard square", expect: /custard square/i, minCalories: 350 },
    { query: "lolly cake", expect: /lolly cake/i, minCalories: 350 },
    { query: "meatbox", expect: /meat box/i, minCalories: 1000 },
    { query: "char kway teow", expect: /char kway teow/i, minCalories: 650 },
    { query: "mee goreng", expect: /mee goreng/i, minCalories: 650 },
    { query: "nasi goreng", expect: /nasi goreng/i, minCalories: 650 },
    { query: "roti canai", expect: /roti canai/i, minCalories: 300 },
    { query: "banoffee pie", expect: /banoffee pie/i, minCalories: 400 },
    { query: "vanilla slice", expect: /vanilla slice/i, minCalories: 350 },
    { query: "custard tart", expect: /custard tart/i, minCalories: 250 },
    { query: "hedgehog slice", expect: /hedgehog slice/i, minCalories: 350 },
    { query: "oak chocolate milk", expect: /oak chocolate milk/i, minCarbs: 10 },
    { query: "whittakers creamy milk", expect: /whittaker/i, minCalories: 500 },
    { query: "meadow fresh trim milk", expect: /meadow fresh trim milk/i, maxCalories: 50 },
    { query: "red bull", expect: /red bull/i, minCarbs: 20 },
    { query: "powerade", expect: /powerade/i, minCarbs: 20 },
    { query: "gatorade", expect: /gatorade/i, minCarbs: 30 },
    { query: "blue v", expect: /blue v/i, minCarbs: 45 },
    { query: "ice break", expect: /ice break/i, minProtein: 10 },
    { query: "quest bar", expect: /quest/i, minProtein: 18 },
    { query: "chobani fit", expect: /chobani fit/i, minProtein: 12 },
    { query: "yo pro", expect: /yo\s*pro/i, minProtein: 12 },
    { query: "biscoff", expect: /biscoff/i, minCalories: 450 },
    { query: "shapes bbq", expect: /shapes bbq/i, minCalories: 450 },
    { query: "twisties", expect: /twisties/i, minCalories: 450 },
    { query: "cheezels", expect: /cheezels/i, minCalories: 450 },
    { query: "grain waves", expect: /grain waves/i, minCalories: 450 },
    { query: "ccs", expect: /cc'?s/i, minCalories: 450 },
  ]

  for (const testCase of cases) {
    const match = findBestFoodMatch(testCase.query)
    assert.ok(match, `Expected a nutrition match for "${testCase.query}"`)
    assert.match(String(match.name || ""), testCase.expect, `Unexpected top match for "${testCase.query}": ${String(match.name || "")}`)
    assert.equal(match.source_type, "estimated_internal_profile")
    if (Number.isFinite(testCase.minCalories)) assert.ok(Number(match.calories || 0) >= testCase.minCalories, `Expected calories >= ${testCase.minCalories} for "${testCase.query}", got ${Number(match.calories || 0)}`)
    if (Number.isFinite(testCase.maxCalories)) assert.ok(Number(match.calories || 0) <= testCase.maxCalories, `Expected calories <= ${testCase.maxCalories} for "${testCase.query}", got ${Number(match.calories || 0)}`)
    if (Number.isFinite(testCase.minProtein)) assert.ok(Number(match.protein_g || 0) >= testCase.minProtein, `Expected protein >= ${testCase.minProtein} for "${testCase.query}", got ${Number(match.protein_g || 0)}`)
    if (Number.isFinite(testCase.minCarbs)) assert.ok(Number(match.carbs_g || 0) >= testCase.minCarbs, `Expected carbs >= ${testCase.minCarbs} for "${testCase.query}", got ${Number(match.carbs_g || 0)}`)
  }
})

test("findBestFoodMatch handles ambiguous AU/NZ slang, typos, partial names, and branded foods", () => {
  const cases = [
    { query: "parma", expect: /parmi|parma|parmigiana/i },
    { query: "parmy", expect: /parmi|parmy|parmigiana/i },
    { query: "parmie", expect: /parmi|parmie|parmigiana/i },
    { query: "chicken parma", expect: /parmi|parma|parmigiana/i },
    { query: "chicken parmigiana", expect: /parmigiana/i },
    { query: "bubbletea", expect: /bubble tea/i },
    { query: "bubble tee", expect: /bubble tea/i },
    { query: "potato cake", expect: /potato scallops/i },
    { query: "potato cakes", expect: /potato scallops/i },
    { query: "potato scallop", expect: /potato scallops/i },
    { query: "fish n chips", expect: /fish and chips/i },
    { query: "fish & chips", expect: /fish and chips/i },
    { query: "fish n chippies", expect: /fish and chips/i },
    { query: "dimsim", expect: /dim/i },
    { query: "dimsims", expect: /dim/i },
    { query: "dim sims", expect: /dim/i },
    { query: "bacon n egg roll", expect: /bacon and egg roll/i },
    { query: "b&e roll", expect: /bacon and egg roll/i },
    { query: "bacon n egg muffin", expect: /bacon and egg muffin/i },
    { query: "brekky burrito", expect: /breakfast burrito/i },
    { query: "cheese toasty", expect: /toast/i },
    { query: "ham and cheese toasty", expect: /toast/i },
    { query: "salmon handroll", expect: /hand roll/i },
    { query: "tuna handroll", expect: /hand roll/i },
    { query: "sushi handroll", expect: /hand roll/i },
    { query: "salmon pokebowl", expect: /poke bowl/i },
    { query: "tuna pokebowl", expect: /poke bowl/i },
    { query: "chicken burritobowl", expect: /burrito bowl/i },
    { query: "beef burritobowl", expect: /burrito bowl/i },
    { query: "flatwhite", expect: /flat white/i },
    { query: "subway teryaki", expect: /subway/i },
    { query: "maccas big mac", expect: /big mac/i },
    { query: "hj whopper", expect: /whopper/i },
    { query: "souva", expect: /souvlaki|kebab/i },
    { query: "yiros", expect: /gyro|kebab/i },
    { query: "schnitty and chips", expect: /schnitzel/i },
    { query: "chkn parmi", expect: /parmi|parmigiana/i },
    { query: "chikn parmy", expect: /parmy|parmi|parmigiana/i },
    { query: "banhmi", expect: /banh mi/i },
    { query: "chicken banhmi", expect: /banh mi/i },
    { query: "hsp", expect: /hsp/i },
    { query: "halal snack pack", expect: /hsp|halal snack pack/i },
    { query: "salmon hand roll", expect: /hand roll/i },
    { query: "subway chicken teriyaki", expect: /subway chicken teriyaki/i },
    { query: "kfc original fillet burger", expect: /kfc original burger/i },
    { query: "tim tam original", expect: /tim tam original/i, sourceType: "nz_curated_catalogue" },
    { query: "watties baked beans", expect: /watties baked beans/i, sourceType: "nz_curated_catalogue" },
    { query: "lewis road light milk", expect: /lewis road/i, sourceType: "nz_curated_catalogue" },
    { query: "pams wedges", expect: /pams.*wedges/i, sourceType: "nz_curated_catalogue" },
    { query: "milo", expect: /milo/i, sourceType: "curated_au_catalogue" },
    { query: "vegemite", expect: /vegemite/i, sourceType: "curated_au_catalogue" },
    { query: "long mac", expect: /long mac/i },
    { query: "weet bix", expect: /weet/i, sourceType: "nz_curated_catalogue" },
    { query: "weet-bix", expect: /weet/i, sourceType: "nz_curated_catalogue" },
    { query: "sausage sizzle", expect: /sausage sizzle/i },
    { query: "beef burrito bowl", expect: /burrito bowl/i },
    { query: "chicken souvlaki wrap", expect: /souvlaki|kebab/i },
  ]

  assert.ok(cases.length >= 50)

  for (const testCase of cases) {
    const match = findBestFoodMatch(testCase.query)
    assert.ok(match, `Expected a nutrition match for "${testCase.query}"`)
    assert.match(String(match.name || ""), testCase.expect, `Unexpected top match for "${testCase.query}": ${String(match.name || "")}`)
    if (testCase.sourceType) {
      assert.equal(match.source_type, testCase.sourceType, `Unexpected source type for "${testCase.query}"`)
    }
  }
})
