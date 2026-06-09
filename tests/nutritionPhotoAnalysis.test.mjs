import assert from "node:assert/strict"
import test from "node:test"

import { searchPhotoReferenceFoods, verifiedFoods } from "../src/lib/nutritionDatabase.js"
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

test("buildFoodPhotoEstimate can auto-fill from a curated photo dish profile for complex meals", async () => {
  const estimate = await buildFoodPhotoEstimate({
    items: [
      {
        name: "veg biryani",
        quantity: "1 bowl",
        category: "food",
        confidence: "high",
      },
    ],
    portion: "1 bowl",
    overall_confidence: "high",
  }, {
    mealType: "dinner",
    lookupFoods: async () => [{
      id: "photo_biryani",
      name: "Biryani",
      aliases: ["veg biryani"],
      quantity: "1 bowl",
      calories: 680,
      protein_g: 19,
      carbs_g: 92,
      fat_g: 24,
      category: "mixed meal",
      source: "ApexAI curated plate-photo dish profile",
      source_type: "photo_dish_profile",
      macro_confidence: "medium",
    }],
  })

  assert.ok(estimate.action)
  assert.equal(estimate.can_autofill, true)
  assert.equal(estimate.needs_review, false)
  assert.equal(estimate.macro_confidence, "medium")
})

test("buildFoodPhotoEstimate can expand a complex summary into trusted component foods", async () => {
  const estimate = await buildFoodPhotoEstimate({
    summary: "A plate of pasta with tomato sauce and basil, accompanied by cherry tomatoes and grated cheese.",
    items: [],
    portion: "1 plate",
    overall_confidence: "high",
  }, {
    mealType: "dinner",
    lookupFoods: async (term) => {
      if (term.includes("pasta")) return [{ ...verifiedFoods.find((food) => food.id === "pasta_cooked_200g") }]
      if (term.includes("tomato sauce")) return [{ ...verifiedFoods.find((food) => food.id === "tomato_pasta_sauce_125g") }]
      if (term.includes("basil")) return [{ ...verifiedFoods.find((food) => food.id === "basil_5g") }]
      if (term.includes("cherry tomato")) return [{ ...verifiedFoods.find((food) => food.id === "cherry_tomatoes_100g") }]
      if (term.includes("grated cheese")) return [{ ...verifiedFoods.find((food) => food.id === "cheese_grated_15g") }]
      return []
    },
  })

  assert.ok(estimate.action)
  assert.equal(estimate.can_autofill, true)
  assert.equal(estimate.needs_review, false)
  assert.match(estimate.analysis.summary, /pasta/i)
  assert.ok(estimate.breakdown.length >= 3)
})

test("buildFoodPhotoEstimate recovers summary-only burgers as plated dish matches instead of broken components", async () => {
  const estimate = await buildFoodPhotoEstimate({
    summary: "A wholemeal burger with grilled meat, tomato, onion, and cucumber.",
    items: [],
    portion: "1 plate",
    overall_confidence: "high",
  }, {
    mealType: "lunch",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(estimate.action)
  assert.equal(estimate.can_autofill, true)
  assert.equal(estimate.needs_review, false)
  assert.match(String(estimate.action?.food_name || ""), /burger/i)
  assert.ok(estimate.breakdown.every((item) => item.source_type !== "estimated_internal_profile"))

  const burgerWithFries = await buildFoodPhotoEstimate({
    summary: "1 serve cheeseburger with melted cheese and pickles alongside a serving of fries",
    items: [],
    portion: "1 plate",
    overall_confidence: "high",
  }, {
    mealType: "lunch",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(burgerWithFries.action)
  assert.equal(burgerWithFries.can_autofill, true)
  assert.equal(burgerWithFries.needs_review, false)
  assert.match(String(burgerWithFries.action?.food_name || ""), /burger/i)
})

test("buildFoodPhotoEstimate can auto-fill obvious pizza and samosa photo dishes", async () => {
  const samosaEstimate = await buildFoodPhotoEstimate({
    items: [
      {
        name: "five fried samosas",
        quantity: "1 serve",
        category: "food",
        confidence: "medium",
      },
    ],
    portion: "1 serve",
    overall_confidence: "medium",
  }, {
    mealType: "snack",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(samosaEstimate.action)
  assert.equal(samosaEstimate.can_autofill, true)
  assert.equal(samosaEstimate.needs_review, false)
  assert.equal(samosaEstimate.breakdown[0]?.source_type, "photo_dish_profile")

  const pizzaEstimate = await buildFoodPhotoEstimate({
    items: [
      {
        name: "pepperoni pizza",
        quantity: "2 slices",
        category: "food",
        confidence: "medium",
      },
    ],
    portion: "1 plate",
    overall_confidence: "medium",
  }, {
    mealType: "dinner",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(pizzaEstimate.action)
  assert.equal(pizzaEstimate.can_autofill, true)
  assert.equal(pizzaEstimate.needs_review, false)
  assert.equal(pizzaEstimate.breakdown[0]?.source_type, "photo_dish_profile")
})

test("buildFoodPhotoEstimate keeps dish confidence when the model omits the item name", async () => {
  const samosaEstimate = await buildFoodPhotoEstimate({
    summary: "Five fried samosas.",
    items: [
      { quantity: "5 pieces", category: "food", preparation: "fried", confidence: "high" },
    ],
    portion: "1 plate",
    assumptions: [],
    needs_clarification: false,
    clarification_question: "",
  }, {
    mealType: "snack",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(samosaEstimate.action)
  assert.equal(samosaEstimate.can_autofill, true)
  assert.equal(samosaEstimate.needs_review, false)
  assert.equal(samosaEstimate.macro_confidence, "medium")
  assert.equal(samosaEstimate.breakdown[0]?.source_type, "photo_dish_profile")

  const pastryEstimate = await buildFoodPhotoEstimate({
    summary: "Five fried triangular pastries.",
    items: [
      { quantity: "5 pieces", category: "food", preparation: "fried", confidence: "high" },
    ],
    portion: "1 plate",
    assumptions: [],
    needs_clarification: false,
    clarification_question: "",
  }, {
    mealType: "snack",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(pastryEstimate.action)
  assert.equal(pastryEstimate.can_autofill, true)
  assert.equal(pastryEstimate.needs_review, false)
  assert.equal(pastryEstimate.breakdown[0]?.source_type, "photo_dish_profile")
})

test("buildFoodPhotoEstimate can rescue items that only describe themselves in item summaries", async () => {
  const curryEstimate = await buildFoodPhotoEstimate({
    items: [
      {
        quantity: "1 serving",
        category: "food",
        preparation: "cooked",
        confidence: "high",
        summary: "Chicken curry with sauce and garnished with coriander",
      },
      {
        quantity: "1 piece",
        category: "food",
        preparation: "flatbread",
        confidence: "high",
        summary: "Roti or naan flatbread",
      },
    ],
    assumptions: [
      "The curry contains chicken as the main protein",
      "Coriander is used as a garnish",
    ],
    needs_clarification: false,
    clarification_question: "",
  }, {
    mealType: "dinner",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(curryEstimate.action)
  assert.equal(curryEstimate.can_autofill, true)
  assert.equal(curryEstimate.needs_review, false)
  assert.equal(curryEstimate.breakdown[0]?.source_type, "curated_au_catalogue")
})

test("buildFoodPhotoEstimate rescues live-style indirect dish descriptions into plated dish matches", async () => {
  const burgerEstimate = await buildFoodPhotoEstimate({
    items: [
      { name: "grilled beef burger patty", quantity: "1 patty", category: "food", confidence: "medium" },
      { name: "hamburger bun", quantity: "1 bun", category: "food", confidence: "medium" },
      { name: "cheese slice", quantity: "1 slice", category: "food", confidence: "medium" },
      { name: "fried crispy bacon", quantity: "2 slices", category: "food", confidence: "medium" },
    ],
    portion: "1 plate",
    overall_confidence: "medium",
  }, {
    mealType: "lunch",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(burgerEstimate.action)
  assert.equal(burgerEstimate.can_autofill, true)
  assert.equal(burgerEstimate.needs_review, false)
  assert.equal(burgerEstimate.breakdown[0]?.source_type, "photo_dish_profile")

  const curryEstimate = await buildFoodPhotoEstimate({
    items: [
      { name: "spiced curry", quantity: "1 serve", category: "food", confidence: "medium" },
      { name: "chicken", quantity: "1 serve", category: "food", confidence: "medium" },
      { name: "flatbreads", quantity: "1 serve", category: "food", confidence: "medium" },
    ],
    portion: "1 bowl",
    overall_confidence: "medium",
  }, {
    mealType: "dinner",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(curryEstimate.action)
  assert.equal(curryEstimate.can_autofill, true)
  assert.equal(curryEstimate.needs_review, false)
  assert.equal(curryEstimate.breakdown[0]?.source_type, "curated_au_catalogue")

  const biryaniEstimate = await buildFoodPhotoEstimate({
    summary: "A bowl of yellow rice topped with lentil curry, fried onions, and served with yoghurt.",
    items: [],
    portion: "1 bowl",
    overall_confidence: "medium",
  }, {
    mealType: "dinner",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(biryaniEstimate.action)
  assert.equal(biryaniEstimate.can_autofill, true)
  assert.equal(biryaniEstimate.needs_review, false)
  assert.equal(biryaniEstimate.breakdown[0]?.source_type, "photo_dish_profile")
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
