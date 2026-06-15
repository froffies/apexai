import { expect, test } from "@playwright/test"

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO0p1KsAAAAASUVORK5CYII=",
  "base64"
)

const onboardedProfile = {
  name: "Casey",
  goal: "fat_loss",
  gender: "other",
  age: 31,
  weight_kg: 84,
  height_cm: 178,
  target_weight_kg: 78,
  activity_level: "moderately_active",
  daily_calories: 2200,
  protein_g: 165,
  carbs_g: 220,
  fat_g: 70,
  split_type: "upper_lower",
  training_days_per_week: 4,
  onboarded: true,
  locale: "AU",
}

async function seedState(page, state) {
  await page.addInitScript(({ entries }) => {
    for (const [key, value] of entries) {
      window.localStorage.setItem(key, JSON.stringify(value))
    }
  }, { entries: Object.entries(state) })
}

async function seedOnboardedProfile(page) {
  await seedState(page, {
    "apexai.localMode": true,
    "apexai.profile": onboardedProfile,
  })
}

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
}

test("coach photo tools stay reachable on desktop, iPhone, and Android when the draft is tall", async ({ page }, testInfo) => {
  if (testInfo.project.name === "desktop") {
    await page.setViewportSize({ width: 1280, height: 720 })
  }

  await seedOnboardedProfile(page)

  const tallDraftItems = Array.from({ length: 10 }, (_, index) => ({
    name: `Slider stack ${index + 1}`,
    quantity: "1 serve",
    category: "food",
    confidence: "medium",
    matched_food_name: `Slider stack ${index + 1}`,
    source: "Estimated from AI-identified foods and internal AU/NZ nutrition fallbacks",
    source_type: "estimated_internal_profile",
    calories: 110 + index * 8,
    protein_g: 7 + index,
    carbs_g: 9 + index,
    fat_g: 4 + index,
  }))

  const reviewedItems = [
    {
      name: "2 beef sliders",
      quantity: "2 sliders",
      category: "food",
      confidence: "medium",
      matched_food_name: "Sliders",
      source: "ApexAI deterministic food-class estimate",
      source_type: "estimated_internal_profile",
      calories: 430,
      protein_g: 24,
      carbs_g: 30,
      fat_g: 22,
    },
    {
      name: "Side salad",
      quantity: "1 bowl",
      category: "food",
      confidence: "high",
      matched_food_name: "Garden salad",
      source: "Australian Food Composition Database / FSANZ AFCD Release 3 reference values, scaled to a common serve",
      source_type: "curated_au_catalogue",
      calories: 120,
      protein_g: 4,
      carbs_g: 10,
      fat_g: 7,
    },
  ]

  await page.route("**/api/nutrition/analyze-photo", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary: "Plate photo draft",
        portion: "1 plate",
        food_name: "Plate photo draft",
        quantity: "1 plate",
        estimated: true,
        nutrition_source: "AI plate-photo estimate using visible-food identification and internal AU/NZ nutrition fallbacks. Review before saving.",
        nutrition_source_type: "photo_ai_estimate",
        identified_items: tallDraftItems,
        macro_confidence: "low",
        has_trusted_macros: false,
        can_autofill: false,
        needs_review: true,
        clarification_question: "Review the visible foods and confirm the quantities before logging.",
        assumptions: [],
        calories: 1280,
        protein_g: 86,
        carbs_g: 110,
        fat_g: 68,
        macro_breakdown: tallDraftItems,
      }),
    })
  })

  await page.route("**/api/nutrition/review-photo-estimate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary: "Reviewed slider plate",
        portion: "1 plate",
        food_name: "Reviewed slider plate",
        quantity: "1 plate",
        estimated: true,
        nutrition_source: "AI plate-photo estimate cross-checked against trusted nutrition references",
        nutrition_source_type: "photo_ai_estimate",
        identified_items: reviewedItems,
        macro_confidence: "medium",
        has_trusted_macros: true,
        can_autofill: true,
        needs_review: false,
        clarification_question: "",
        assumptions: [],
        calories: 550,
        protein_g: 28,
        carbs_g: 40,
        fat_g: 29,
        macro_breakdown: reviewedItems,
      }),
    })
  })

  await page.goto("/Coach")
  await page.getByRole("button", { name: /photo meal/i }).click()
  await expect(page.getByRole("button", { name: /take photo/i })).toBeVisible()
  await expect(page.getByRole("button", { name: /upload photo/i })).toBeVisible()
  await page.getByTestId("food-photo-upload-input").setInputFiles({
    name: "plate.png",
    mimeType: "image/png",
    buffer: tinyPng,
  })

  await expect(page.getByText("Photo draft", { exact: true })).toBeVisible()

  const tallLayout = await page.evaluate(() => {
    const scroller = document.scrollingElement
    return {
      clientHeight: scroller?.clientHeight || 0,
      scrollHeight: scroller?.scrollHeight || 0,
    }
  })
  expect(tallLayout.scrollHeight).toBeGreaterThan(tallLayout.clientHeight)

  await page.evaluate(() => window.scrollTo({ top: document.scrollingElement?.scrollHeight || 0, behavior: "instant" }))

  const recalcButton = page.getByRole("button", { name: /recalculate estimate/i })
  await expect(recalcButton).toBeVisible()
  await recalcButton.click()

  await page.evaluate(() => window.scrollTo({ top: document.scrollingElement?.scrollHeight || 0, behavior: "instant" }))

  const scrollAfter = await page.evaluate(() => document.scrollingElement?.scrollTop || 0)
  expect(scrollAfter).toBeGreaterThan(0)

  const logButton = page.getByRole("button", { name: /log reviewed estimate/i })
  await expect(logButton).toBeEnabled()
  await expect(logButton).toBeVisible()
  await expectNoHorizontalOverflow(page)
})
