import assert from "node:assert/strict"
import test from "node:test"

import { searchPhotoReferenceFoods, verifiedFoods } from "../src/lib/nutritionDatabase.js"
import { buildFoodPhotoEstimate, buildReviewedFoodPhotoEstimate, normalizeFoodPhotoAnalysis } from "../server/nutritionPhotoAnalysis.mjs"

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

test("normalizeFoodPhotoAnalysis prefers item summaries when the model emits a generic food label", () => {
  const normalized = normalizeFoodPhotoAnalysis({
    items: [
      {
        name: "fried food",
        summary: "beef sliders with lettuce",
        quantity: "1 serve",
        category: "food",
        confidence: "medium",
      },
    ],
  })

  assert.doesNotMatch(normalized.items[0]?.name || "", /^fried food$/i)
  assert.match(normalized.items[0]?.name || "", /slider/i)
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
        name: "mystery entree",
        quantity: "1 serve",
        preparation: "fried",
        category: "food",
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
  assert.equal(Number.isFinite(estimate.breakdown[0]?.calories), true)
  assert.ok(Number(estimate.calories) > 0)
  assert.match(estimate.nutrition_source || "", /review before saving/i)
  assert.match(estimate.clarification_question || "", /need review/i)
})

test("buildFoodPhotoEstimate uses item-specific deterministic estimates before the generic fallback", async () => {
  const estimate = await buildFoodPhotoEstimate({
    items: [
      {
        name: "sliders",
        quantity: "1 serve",
        category: "food",
        confidence: "medium",
      },
      {
        name: "lettuce",
        quantity: "1 leaf",
        category: "food",
        confidence: "medium",
      },
    ],
    portion: "1 serve",
  }, {
    mealType: "lunch",
    lookupFoods: async (term) => term.includes("lettuce")
      ? [{ ...verifiedFoods.find((food) => food.id === "lettuce_leaf") }]
      : [],
  })

  assert.equal(estimate.action, null)
  assert.equal(estimate.can_autofill, false)
  assert.ok(Number(estimate.calories) > 300)
  assert.match(String(estimate.breakdown[0]?.matched_food_name || ""), /slider/i)
  assert.doesNotMatch(String(estimate.breakdown[0]?.matched_food_name || ""), /fried food/i)
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

test("buildFoodPhotoEstimate can auto-fill broader plated dish profiles like poke bowls and tacos", async () => {
  const pokeEstimate = await buildFoodPhotoEstimate({
    summary: "A salmon poke bowl with rice, edamame and seaweed.",
    items: [],
    portion: "1 bowl",
    overall_confidence: "high",
  }, {
    mealType: "lunch",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(pokeEstimate.action)
  assert.equal(pokeEstimate.can_autofill, true)
  assert.equal(pokeEstimate.needs_review, false)
  assert.equal(pokeEstimate.breakdown[0]?.source_type, "photo_dish_profile")
  assert.match(String(pokeEstimate.action?.food_name || ""), /poke/i)

  const tacoEstimate = await buildFoodPhotoEstimate({
    summary: "Two fish tacos with salsa and guacamole.",
    items: [],
    portion: "1 plate",
    overall_confidence: "high",
  }, {
    mealType: "dinner",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(tacoEstimate.action)
  assert.equal(tacoEstimate.can_autofill, true)
  assert.equal(tacoEstimate.needs_review, false)
  assert.equal(tacoEstimate.breakdown[0]?.source_type, "photo_dish_profile")
  assert.match(String(tacoEstimate.action?.food_name || ""), /taco/i)

  const fishAndChipsEstimate = await buildFoodPhotoEstimate({
    summary: "Battered fish and chips with lemon.",
    items: [],
    portion: "1 plate",
    overall_confidence: "high",
  }, {
    mealType: "dinner",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(fishAndChipsEstimate.action)
  assert.equal(fishAndChipsEstimate.can_autofill, true)
  assert.equal(fishAndChipsEstimate.needs_review, false)
  assert.equal(fishAndChipsEstimate.breakdown[0]?.source_type, "photo_dish_profile")
  assert.match(String(fishAndChipsEstimate.action?.food_name || ""), /fish and chips/i)

  const hspEstimate = await buildFoodPhotoEstimate({
    summary: "A halal snack pack with chips, doner meat, garlic sauce and chilli sauce.",
    items: [],
    portion: "1 tray",
    overall_confidence: "high",
  }, {
    mealType: "dinner",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(hspEstimate.action)
  assert.equal(hspEstimate.can_autofill, true)
  assert.equal(hspEstimate.needs_review, false)
  assert.equal(hspEstimate.breakdown[0]?.source_type, "photo_dish_profile")
  assert.match(String(hspEstimate.action?.food_name || ""), /hsp/i)

  const friedChickenEstimate = await buildFoodPhotoEstimate({
    summary: "Fried chicken pieces with hot chips.",
    items: [],
    portion: "1 box",
    overall_confidence: "high",
  }, {
    mealType: "lunch",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(friedChickenEstimate.action)
  assert.equal(friedChickenEstimate.can_autofill, true)
  assert.equal(friedChickenEstimate.needs_review, false)
  assert.equal(friedChickenEstimate.breakdown[0]?.source_type, "photo_dish_profile")
  assert.match(String(friedChickenEstimate.action?.food_name || ""), /fried chicken and chips/i)

  const messyPlatterEstimate = await buildFoodPhotoEstimate({
    summary: "Fried chicken pieces with hot chips, aioli and dipping sauce on a shared platter.",
    items: [],
    portion: "1 platter",
    overall_confidence: "high",
  }, {
    mealType: "lunch",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.equal(messyPlatterEstimate.action, null)
  assert.equal(messyPlatterEstimate.can_autofill, false)
  assert.equal(messyPlatterEstimate.needs_review, true)
  assert.match(String(messyPlatterEstimate.clarification_question || ""), /sauces|shared-plate portions|review/i)
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

  const biryaniEstimate = await buildFoodPhotoEstimate({
    items: [
      { name: "chicken", quantity: "1 serve", category: "food", confidence: "medium" },
      { name: "rice", quantity: "200g", category: "food", confidence: "medium" },
      { name: "yogurt", quantity: "100g", category: "food", confidence: "medium" },
      { name: "fried onions", quantity: "2 slices", category: "food", confidence: "medium" },
      { name: "coriander", quantity: "10g", category: "ingredient", confidence: "medium" },
    ],
    portion: "1 bowl",
    assumptions: [
      "Type and exact preparation of rice",
      "Type of side yogurt",
      "Exact proportions of coriander and fried onion",
    ],
    overall_confidence: "low",
    needs_clarification: false,
    clarification_question: "",
  }, {
    mealType: "dinner",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(biryaniEstimate.action)
  assert.equal(biryaniEstimate.can_autofill, true)
  assert.equal(biryaniEstimate.needs_review, false)
  assert.equal(biryaniEstimate.breakdown[0]?.source_type, "photo_dish_profile")
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

  const friedRiceEstimate = await buildFoodPhotoEstimate({
    items: [
      { name: "fried rice", quantity: "1 cup", category: "food", confidence: "medium" },
      { name: "fried egg", quantity: "1", category: "food", confidence: "medium" },
      { name: "spring onions", quantity: "1 tablespoon", category: "ingredient", confidence: "medium" },
    ],
    portion: "1 plate",
    overall_confidence: "low",
  }, {
    mealType: "lunch",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(friedRiceEstimate.action)
  assert.equal(friedRiceEstimate.can_autofill, true)
  assert.equal(friedRiceEstimate.needs_review, false)
  assert.equal(friedRiceEstimate.breakdown[0]?.source_type, "photo_dish_profile")

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

  const idliEstimate = await buildFoodPhotoEstimate({
    summary: "A soft fermented rice dish served with coconut chutney and sambar.",
    items: [],
    portion: "1 plate",
    overall_confidence: "low",
  }, {
    mealType: "breakfast",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(idliEstimate.action)
  assert.equal(idliEstimate.can_autofill, true)
  assert.equal(idliEstimate.needs_review, false)
  assert.equal(idliEstimate.breakdown[0]?.source_type, "photo_dish_profile")
})

test("buildFoodPhotoEstimate rescues live plated meal misses into trusted dish profiles", async () => {
  const pastaEstimate = await buildFoodPhotoEstimate({
    summary: "200g cooked pasta, plus 125g tomato sauce, plus 1 serve meatballs, plus 5g basil, plus 15g grated parmesan cheese",
    items: [
      { name: "200g cooked pasta", quantity: "200g", category: "food", confidence: "medium" },
      { name: "125g tomato sauce", quantity: "125g", category: "ingredient", confidence: "medium" },
      { name: "1 serve meatballs", quantity: "1 serve", category: "food", confidence: "medium" },
      { name: "5g basil", quantity: "5g", category: "ingredient", confidence: "medium" },
      { name: "15g grated parmesan cheese", quantity: "15g", category: "ingredient", confidence: "medium" },
    ],
    portion: "1 bowl",
    overall_confidence: "medium",
  }, {
    mealType: "dinner",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(pastaEstimate.action)
  assert.equal(pastaEstimate.can_autofill, true)
  assert.equal(pastaEstimate.needs_review, false)
  assert.equal(pastaEstimate.breakdown[0]?.source_type, "photo_dish_profile")

  const dosaEstimate = await buildFoodPhotoEstimate({
    summary: "1 grilled dosa, plus 100g mashed potatoes with spices, plus 50g peanut chutney, plus 50g coconut chutney",
    items: [
      { name: "1 grilled dosa", quantity: "1", category: "food", confidence: "medium" },
      { name: "100g mashed potatoes with spices", quantity: "100g", category: "food", confidence: "medium" },
      { name: "50g peanut chutney", quantity: "50g", category: "food", confidence: "medium" },
      { name: "50g coconut chutney", quantity: "50g", category: "food", confidence: "medium" },
    ],
    portion: "1 plate",
    overall_confidence: "medium",
  }, {
    mealType: "breakfast",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(dosaEstimate.action)
  assert.equal(dosaEstimate.can_autofill, true)
  assert.equal(dosaEstimate.needs_review, false)
  assert.equal(dosaEstimate.breakdown[0]?.source_type, "photo_dish_profile")

  const curryEstimate = await buildFoodPhotoEstimate({
    summary: "1 serve meatballs in sauce, plus 1 piece of naan bread",
    items: [
      { name: "1 serve meatballs in sauce", quantity: "1 serve", category: "ingredient", confidence: "medium" },
      { name: "1 piece of naan bread", quantity: "1 piece", category: "food", confidence: "medium" },
    ],
    assumptions: [
      "The meatballs appear to be cooked in a sauce but specifics are unclear.",
      "The naan bread is assumed to be plain without any toppings.",
    ],
    portion: "1 plate",
    overall_confidence: "medium",
  }, {
    mealType: "dinner",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(curryEstimate.action)
  assert.equal(curryEstimate.can_autofill, true)
  assert.equal(curryEstimate.needs_review, false)
  assert.ok(curryEstimate.breakdown.every((item) => item.source_type !== "estimated_internal_profile"))

  const idliEstimate = await buildFoodPhotoEstimate({
    summary: "1 serve round dumplings in curry, plus 1 serve coconut-based dip, plus 1 serve lentil dish",
    items: [
      { name: "1 serve round dumplings in curry", quantity: "1 serve", category: "food", confidence: "medium" },
      { name: "1 serve coconut-based dip", quantity: "1 serve", category: "food", confidence: "medium" },
      { name: "1 serve lentil dish", quantity: "1 serve", category: "food", confidence: "medium" },
    ],
    portion: "1 plate",
    overall_confidence: "medium",
  }, {
    mealType: "breakfast",
    lookupFoods: async (term) => searchPhotoReferenceFoods(term),
  })

  assert.ok(idliEstimate.action)
  assert.equal(idliEstimate.can_autofill, true)
  assert.equal(idliEstimate.needs_review, false)
  assert.equal(idliEstimate.breakdown[0]?.source_type, "photo_dish_profile")

  const biryaniEstimate = await buildFoodPhotoEstimate({
    summary: "1 bowl of rice mixed with vegetables and herbs, garnished with nuts.",
    items: [
      { name: "1 bowl of rice mixed with vegetables and herbs, garnished with nuts.", quantity: "1 bowl", category: "food", confidence: "medium" },
    ],
    assumptions: [
      "The exact composition of the rice is unclear, but it appears to include vegetables and nuts.",
      "The type of nuts and specific herbs are assumptions based on appearance.",
    ],
    portion: "1 plate",
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

test("normalizeFoodPhotoAnalysis strips leading photo quantity noise from food names", () => {
  const normalized = normalizeFoodPhotoAnalysis({
    items: [
      {
        name: "15g grated parmesan cheese",
        quantity: "15g",
        category: "ingredient",
        confidence: "high",
      },
      {
        name: "1 piece of naan bread",
        quantity: "1 piece",
        category: "food",
        confidence: "high",
      },
      {
        name: "10g sprig of coriander",
        quantity: "10g",
        category: "ingredient",
        confidence: "high",
      },
    ],
  })

  assert.equal(normalized.items[0].base_name, "grated parmesan cheese")
  assert.equal(normalized.items[1].base_name, "naan bread")
  assert.equal(normalized.items[2].base_name, "coriander")
  assert.match(normalized.summary, /15g grated parmesan cheese/i)
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

test("buildReviewedFoodPhotoEstimate turns reviewed photo items into a loggable meal action", async () => {
  const estimate = await buildReviewedFoodPhotoEstimate({
    summary: "banana and milk",
    portion: "1 serve",
    items: [
      {
        name: "banana",
        quantity: "1 banana",
        category: "food",
        confidence: "high",
      },
      {
        name: "milk",
        quantity: "250ml milk",
        category: "drink",
        confidence: "high",
      },
    ],
  }, {
    mealType: "breakfast",
    lookupFoods: async (term) => {
      if (term.includes("banana")) return [{ ...verifiedFoods.find((food) => food.id === "banana_medium") }]
      if (term.includes("milk")) return [{ ...verifiedFoods.find((food) => food.id === "milk_cow_regular") }]
      return []
    },
  })

  assert.ok(estimate.action)
  assert.equal(estimate.can_autofill, true)
  assert.equal(estimate.needs_review, false)
  assert.equal(estimate.action?.nutrition_source_type, "photo_ai_estimate")
  assert.ok(Array.isArray(estimate.action?.macro_breakdown))
  assert.equal(estimate.breakdown.every((item) => item.confidence), true)
})
