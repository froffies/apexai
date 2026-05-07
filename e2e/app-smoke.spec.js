import { expect, test } from "@playwright/test"

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

async function seedOnboardedProfile(page) {
  await seedState(page, { "apexai.profile": onboardedProfile })
}

async function seedOnboardedProfileInContext(context) {
  await context.addInitScript(({ profile }) => {
    window.localStorage.setItem("apexai.localMode", "true")
    window.localStorage.setItem("apexai.profile", JSON.stringify(profile))
  }, { profile: onboardedProfile })
}

async function seedState(page, state) {
  await page.addInitScript(({ entries }) => {
    for (const [key, value] of entries) {
      window.localStorage.setItem(key, JSON.stringify(value))
    }
  }, { entries: Object.entries(state) })
}

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
}

function primaryNav(page) {
  return page.locator("nav[aria-label='Primary sidebar links']:visible, nav[aria-label='Primary tabs']:visible").first()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("apexai.localMode", "true")
  })
})

test("onboarding text and numeric fields accept edits", async ({ page }) => {
  await page.goto("/onboarding")

  await expect(page.getByRole("button", { name: /continue/i })).toBeDisabled()
  await page.getByLabel("Name").fill("Casey")
  await page.getByLabel("Age").fill("31")
  await page.getByLabel("Weight kg").fill("84.5")
  await page.getByLabel("Height cm").fill("179")

  await expect(page.getByLabel("Name")).toHaveValue("Casey")
  await expect(page.getByLabel("Age")).toHaveValue("31")
  await expect(page.getByLabel("Weight kg")).toHaveValue("84.5")
  await expect(page.getByLabel("Height cm")).toHaveValue("179")

  await page.getByRole("button", { name: /continue/i }).click()
  await expect(page.getByRole("heading", { name: /goal and training setup/i })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test("finishing onboarding exits cleanly to the home dashboard", async ({ page }) => {
  await page.goto("/onboarding")

  await page.getByLabel("Name").fill("Casey")
  await page.getByLabel("Age").fill("31")
  await page.getByLabel("Weight kg").fill("84")
  await page.getByLabel("Height cm").fill("179")
  await page.getByRole("button", { name: /continue/i }).click()

  await page.getByLabel("Training days").fill("4")
  await page.getByLabel("Target weight kg").fill("78")
  await page.getByRole("button", { name: /review plan/i }).click()
  await expect(page.getByRole("heading", { name: /your starting plan/i })).toBeVisible()

  await page.getByRole("button", { name: /enter dashboard/i }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("heading", { name: /today's overview/i })).toBeVisible()
})

test("onboarding review explains the target method and offers optional starter plan choices", async ({ page }) => {
  await page.goto("/onboarding")

  await page.getByLabel("Name").fill("Casey")
  await page.getByLabel("Age").fill("31")
  await page.getByLabel("Weight kg").fill("84")
  await page.getByLabel("Height cm").fill("179")
  await page.getByRole("button", { name: /continue/i }).click()

  await page.getByLabel("Training days").fill("4")
  await page.getByRole("radio", { name: /muscle gain/i }).click()
  await page.getByRole("button", { name: /review plan/i }).click()

  await expect(page.getByRole("heading", { name: /your starting plan/i })).toBeVisible()
  await expect(page.getByRole("heading", { name: /mifflin-st jeor starting estimate/i })).toBeVisible()
  await expect(page.getByText(/bmi is shown for context only/i)).toBeVisible()
  await expect(page.getByRole("heading", { name: /choose how you want week one to start/i })).toBeVisible()
  await expect(page.getByRole("heading", { name: /choose the first food structure you want to follow/i })).toBeVisible()
  await expect(page.getByRole("button", { name: /decide later/i })).toHaveCount(2)
  await expectNoHorizontalOverflow(page)
})

test("onboarding can skip starter workout and nutrition plans while still saving the profile", async ({ page }) => {
  await page.goto("/onboarding")

  await page.getByLabel("Name").fill("Casey")
  await page.getByLabel("Age").fill("31")
  await page.getByLabel("Weight kg").fill("84")
  await page.getByLabel("Height cm").fill("179")
  await page.getByRole("button", { name: /continue/i }).click()

  await page.getByLabel("Training days").fill("4")
  await page.getByLabel("Target weight kg").fill("78")
  await page.getByRole("button", { name: /review plan/i }).click()

  await page.getByRole("button", { name: /decide later/i }).first().click()
  await page.getByRole("button", { name: /decide later/i }).last().click()
  await page.getByRole("button", { name: /save profile and enter dashboard/i }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("heading", { name: /today's overview/i })).toBeVisible()
})

test("tab navigation restores last route and resets active tab to root", async ({ page }) => {
  await seedOnboardedProfile(page)
  await page.goto("/Recipes")
  await expect(page).toHaveURL(/\/Recipes$/)

  await primaryNav(page).getByRole("link", { name: /^Workouts$/i }).click()
  await expect(page).toHaveURL(/\/Workouts$/)

  await primaryNav(page).getByRole("link", { name: /^Nutrition$/i }).click()
  await expect(page).toHaveURL(/\/Recipes$/)

  await primaryNav(page).getByRole("link", { name: /^Nutrition$/i }).click()
  await expect(page).toHaveURL(/\/Nutrition$/)
})

test("core screens render without horizontal overflow and expose key UX surfaces", async ({ page }) => {
  await seedOnboardedProfile(page)

  await page.goto("/Nutrition")
  await expect(page.getByText(/meal builder and recipe studio/i)).toBeVisible()
  await page.getByRole("tab", { name: /^Builder$/i }).click()
  await expect(page.getByText(/build any meal/i)).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.goto("/Workouts")
  await expect(page.getByRole("button", { name: /start suggested workout/i })).toBeVisible()
  await page.getByRole("tab", { name: /^Schedule$/i }).click()
  await expect(page.getByText(/7-day training schedule/i)).toBeVisible()
  await page.getByRole("tab", { name: /^History$/i }).click()
  await expect(page.getByText(/plateau watch/i)).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.goto("/Coach")
  await page.getByRole("button", { name: /^Schedule$/ }).click()
  await expect(page.getByText(/plan this training week/i)).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test("dedicated log routes hide the mobile tab chrome", async ({ page, isMobile }) => {
  test.skip(!isMobile, "This regression only matters on the mobile shell.")
  await seedState(page, {
    "apexai.profile": onboardedProfile,
    "apexai.activeWorkout": {
      id: "active_1",
      session_id: "session_1",
      date: new Date().toISOString().slice(0, 10),
      name: "Test session",
      started_at: new Date().toISOString(),
      current_exercise_index: 0,
      exercises: [{ name: "Bench Press", setsReps: "4x6", target_sets: 4, logged_sets: [] }],
    },
  })

  await page.goto("/Workouts")
  await expect(page.getByTestId("active-workout-bar")).toBeVisible()
  await expect(page.getByRole("navigation", { name: /primary tabs/i })).toBeVisible()

  await page.goto("/workouts/log")
  await expect(page.getByRole("navigation", { name: /primary tabs/i })).toHaveCount(0)
  await expect(page.getByTestId("active-workout-bar")).toHaveCount(0)

  await page.goto("/nutrition/log")
  await expect(page.getByRole("navigation", { name: /primary tabs/i })).toHaveCount(0)
  await expect(page.getByTestId("active-workout-bar")).toHaveCount(0)
})

test("meal deletion is undoable with a visible toast", async ({ page }) => {
  await seedState(page, {
    "apexai.profile": onboardedProfile,
    "apexai.meals": [
      {
        id: "meal_1",
        date: new Date().toISOString().slice(0, 10),
        meal_type: "breakfast",
        food_name: "Greek yoghurt bowl",
        quantity: "1 bowl",
        calories: 430,
        protein_g: 32,
        carbs_g: 44,
        fat_g: 10,
        nutrition_source: "Test seed",
      },
    ],
  })

  await page.goto("/Nutrition")
  const todayMealsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /today's meals/i }) })
  await expect(todayMealsSection.getByText("Greek yoghurt bowl")).toBeVisible()
  await todayMealsSection.getByRole("button", { name: /remove greek yoghurt bowl/i }).click()
  await expect(page.getByText(/meal removed/i)).toBeVisible()
  await expect(todayMealsSection.getByText("Greek yoghurt bowl")).toHaveCount(0)
  await page.getByRole("button", { name: /undo/i }).click()
  await expect(todayMealsSection.getByText("Greek yoghurt bowl")).toBeVisible()
})

test("manual meal logging returns to Nutrition and shows the saved entry", async ({ page }) => {
  await seedOnboardedProfile(page)
  await page.goto("/Nutrition")

  await page.getByRole("link", { name: /log food/i }).click()
  await expect(page).toHaveURL(/\/nutrition\/log$/)

  await page.getByPlaceholder("Food name").fill("E2E Chicken Bowl")
  await page.getByPlaceholder("Quantity").fill("1 bowl")
  await page.getByPlaceholder("Calories").fill("620")
  await page.getByPlaceholder("Protein g").fill("48")
  await page.getByPlaceholder("Carbs g").fill("52")
  await page.getByPlaceholder("Fat g").fill("18")
  await page.getByRole("checkbox").check()
  await page.getByRole("button", { name: /save meal/i }).click()

  await expect(page).toHaveURL(/\/Nutrition$/)
  const todayMealsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /today's meals/i }) })
  await expect(todayMealsSection.getByText("E2E Chicken Bowl").first()).toBeVisible()
  await expect(todayMealsSection.getByText(/620 kcal - 48g protein/i).first()).toBeVisible()
})

test("logged meals can be edited in place from Nutrition", async ({ page }) => {
  await seedState(page, {
    "apexai.profile": onboardedProfile,
    "apexai.meals": [
      {
        id: "meal_edit_1",
        date: new Date().toISOString().slice(0, 10),
        meal_type: "breakfast",
        food_name: "Greek yoghurt bowl",
        quantity: "1 bowl",
        calories: 430,
        protein_g: 32,
        carbs_g: 44,
        fat_g: 10,
        nutrition_source: "Test seed",
      },
    ],
  })

  await page.goto("/Nutrition")
  const todayMealsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /today's meals/i }) })
  await todayMealsSection.getByRole("button", { name: /edit greek yoghurt bowl/i }).click()
  await expect(page.getByRole("heading", { name: /edit food log/i })).toBeVisible()
  await page.getByPlaceholder("Calories").fill("520")
  await page.getByPlaceholder("Protein g").fill("40")
  await page.getByRole("button", { name: /save changes/i }).click()

  await expect(page.getByRole("heading", { name: /edit food log/i })).toHaveCount(0, { timeout: 15000 })
  await expect(todayMealsSection.getByText(/520 kcal - 40g protein/i).first()).toBeVisible()
})

test("coach can save an estimated mixed meal without showing the old skipped warning", async ({ page }) => {
  await seedOnboardedProfile(page)
  await page.route("**/api/coach", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "That meal comes out to roughly 2,517 calories, 210g protein, 35g carbs, and 136g fat. I'll save it as an estimate now.",
        actions: [
          {
            type: "log_meal",
            food_name: "Eggs fried in butter with rye toast and Vegemite",
            calories: 2517,
            protein_g: 210,
            carbs_g: 35,
            fat_g: 136,
            quantity: "1 meal",
            estimated: true,
          },
        ],
        warnings: [],
      }),
    })
  })

  await page.goto("/Coach")
  await page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i).fill("yes calculate")
  await page.getByRole("button", { name: /^Send$/i }).click()

  await expect(page.getByText(/saved to today's nutrition: eggs fried in butter with rye toast and vegemite\./i)).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(/skipped one meal log/i)).toHaveCount(0)
  await expect(page.getByText(/couldn't save that meal yet/i)).toHaveCount(0)

  await page.goto("/Nutrition")
  const todayMealsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /today's meals/i }) })
  await expect(todayMealsSection.getByText("Eggs fried in butter with rye toast and Vegemite")).toBeVisible()
  await expect(todayMealsSection.getByText(/2517 kcal - 210g protein/i)).toBeVisible()
  await expect(todayMealsSection.getByText(/Coach estimate from user-described ingredients and amounts/i)).toBeVisible()
})

test("coach nutrition answers do not create a meal log until the user explicitly asks to save it", async ({ page }) => {
  await seedState(page, {
    "apexai.profile": onboardedProfile,
    "apexai.coachMealSession": {
      active: true,
      mealConversation: true,
      readyToLog: true,
      wantsLogging: true,
      answerOnly: false,
      clarificationAttempts: 2,
      clarificationCounts: { "egg:quantity": 1, "egg:cooking_medium": 1 },
      summary: "3 fried eggs cooked in 10g butter, plus 250ml Earl Grey tea with no milk and no sugar",
      clarifyQuestion: "",
      items: [
        { base_name: "egg", label: "Eggs", category: "food", quantity: { amount: 3, unit: "egg", text: "3 eggs", modifier: "" }, preparation: ["fried"], exclusions: [], attached_to: null, relation: null },
        { base_name: "butter", label: "Butter", category: "ingredient", quantity: { amount: 10, unit: "g", text: "10g", modifier: "" }, preparation: [], exclusions: [], attached_to: "egg::fried", relation: "cooked_in" },
        { base_name: "earl grey tea", label: "Earl Grey tea", category: "drink", quantity: { amount: 250, unit: "ml", text: "250ml", modifier: "" }, preparation: [], exclusions: ["no milk", "no sugar"], attached_to: null, relation: null },
      ],
    },
  })

  await page.route("**/api/coach", async (route) => {
    const body = route.request().postDataJSON()
    const message = String(body.message || "").toLowerCase()
    if (message.includes("how many calories")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "That comes to about 510 kcal, 30g protein, 5g carbs, and 35g fat. Tell me if you want me to save it.",
          actions: [],
          warnings: [],
          meal_session: {
            ...body.mealSession,
            answerOnly: true,
          },
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "I logged that meal for you.",
        actions: [
          {
            type: "log_meal",
            food_name: "3 fried eggs cooked in 10g butter, plus 250ml Earl Grey tea with no milk and no sugar",
            meal_type: "breakfast",
            quantity: "1 meal",
            calories: 510,
            protein_g: 30,
            carbs_g: 5,
            fat_g: 35,
            estimated: true,
            nutrition_source: "Coach estimate from accumulated meal details across chat",
          },
        ],
        warnings: [],
        meal_session: body.mealSession,
      }),
    })
  })

  await page.goto("/Coach")
  const composer = page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i)
  await composer.fill("how many calories is that?")
  await page.getByRole("button", { name: /^Send$/i }).click()
  await expect(page.getByText(/tell me if you want me to save it/i)).toBeVisible()

  await page.goto("/Nutrition")
  let todayMealsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /today's meals/i }) })
  await expect(todayMealsSection.getByText(/3 fried eggs cooked in 10g butter/i)).toHaveCount(0)

  await page.goto("/Coach")
  await composer.fill("log it")
  await page.getByRole("button", { name: /^Send$/i }).click()
  await expect(page.getByText(/saved to today's nutrition: 3 fried eggs cooked in 10g butter/i)).toBeVisible()

  await page.goto("/Nutrition")
  todayMealsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /today's meals/i }) })
  await expect(todayMealsSection.getByText("3 fried eggs cooked in 10g butter, plus 250ml Earl Grey tea with no milk and no sugar")).toBeVisible()
})

test("coach suppression replies keep nutrition unchanged when the user says not to save it", async ({ page }) => {
  await seedState(page, {
    "apexai.profile": onboardedProfile,
    "apexai.coachMealSession": {
      active: true,
      mealConversation: true,
      readyToLog: true,
      wantsLogging: true,
      answerOnly: false,
      clarificationAttempts: 1,
      clarificationCounts: { "chicken:quantity": 1, "rice:quantity": 1 },
      summary: "200g chicken, plus 1 cup rice",
      clarifyQuestion: "",
      items: [
        { base_name: "chicken", label: "Chicken", category: "food", quantity: { amount: 200, unit: "g", text: "200g", modifier: "" }, preparation: [], exclusions: [], attached_to: null, relation: null },
        { base_name: "rice", label: "Rice", category: "food", quantity: { amount: 1, unit: "cup", text: "1 cup", modifier: "" }, preparation: [], exclusions: [], attached_to: null, relation: null },
      ],
    },
  })

  await page.route("**/api/coach", async (route) => {
    const body = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "Okay, I won't save that.",
        actions: [],
        warnings: [],
        meal_session: {
          ...body.mealSession,
          suppressed: true,
          suppressionReply: "Okay, I won't save that.",
          active: false,
          mealConversation: false,
          readyToLog: false,
          summary: "",
          items: [],
        },
      }),
    })
  })

  await page.goto("/Coach")
  await page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i).fill("don't save that")
  await page.getByRole("button", { name: /^Send$/i }).click()
  await expect(page.getByText(/^Okay, I won't save that\.$/i)).toBeVisible()

  await page.goto("/Nutrition")
  const todayMealsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /today's meals/i }) })
  await expect(todayMealsSection.getByText(/200g chicken, plus 1 cup rice/i)).toHaveCount(0)
})

test("fragmented coach meal logs persist into Nutrition after refresh", async ({ page }) => {
  await seedOnboardedProfile(page)
  await page.route("**/api/coach", async (route) => {
    const body = route.request().postDataJSON()
    const message = String(body.message || "").toLowerCase()
    const mealSession = body.mealSession || null

    if (message.includes("egg and tea")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "What type of tea was it?",
          actions: [{ type: "clarify", message: "What type of tea was it?" }],
          warnings: [],
          meal_session: {
            active: true,
            mealConversation: true,
            readyToLog: false,
            clarificationAttempts: 0,
            clarificationCounts: {},
            summary: "eggs, plus tea",
            clarifyQuestion: "What type of tea was it?",
            items: [
              { base_name: "egg", label: "Egg", category: "food", quantity: null, preparation: [], exclusions: [], attached_to: null, relation: null },
              { base_name: "tea", label: "Tea", category: "drink", quantity: null, preparation: [], exclusions: [], attached_to: null, relation: null },
            ],
          },
        }),
      })
      return
    }

    if (message.includes("earl grey")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "How much tea did you have, and was there any milk or sugar?",
          actions: [{ type: "clarify", message: "How much tea did you have, and was there any milk or sugar?" }],
          warnings: [],
          meal_session: {
            active: true,
            mealConversation: true,
            readyToLog: false,
            clarificationAttempts: 1,
            clarificationCounts: { "tea:kind": 1 },
            summary: "eggs, plus Earl Grey tea",
            clarifyQuestion: "How much tea did you have, and was there any milk or sugar?",
            items: [
              { base_name: "egg", label: "Egg", category: "food", quantity: null, preparation: [], exclusions: [], attached_to: null, relation: null },
              { base_name: "earl grey tea", label: "Earl Grey tea", category: "drink", quantity: null, preparation: [], exclusions: [], attached_to: null, relation: null },
            ],
          },
        }),
      })
      return
    }

    if (message.includes("250ml")) {
      expect(mealSession?.summary || "").toMatch(/earl grey tea/i)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "How many eggs did you have?",
          actions: [{ type: "clarify", message: "How many eggs did you have?" }],
          warnings: [],
          meal_session: {
            active: true,
            mealConversation: true,
            readyToLog: false,
            clarificationAttempts: 2,
            clarificationCounts: { "tea:kind": 1, "tea:quantity": 1, "tea:additions": 1 },
            summary: "eggs, plus 250ml Earl Grey tea with no milk and no sugar",
            clarifyQuestion: "How many eggs did you have?",
            items: [
              { base_name: "egg", label: "Egg", category: "food", quantity: null, preparation: [], exclusions: [], attached_to: null, relation: null },
              { base_name: "earl grey tea", label: "Earl Grey tea", category: "drink", quantity: { amount: 250, unit: "ml", text: "250ml", modifier: "" }, preparation: [], exclusions: ["no sugar", "no milk"], attached_to: null, relation: null },
            ],
          },
        }),
      })
      return
    }

    if (message.includes("17 fried eggs")) {
      expect(mealSession?.summary || "").toMatch(/250ml earl grey tea/i)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Anything they were cooked in?",
          actions: [{ type: "clarify", message: "Anything they were cooked in?" }],
          warnings: [],
          meal_session: {
            active: true,
            mealConversation: true,
            readyToLog: false,
            clarificationAttempts: 3,
            clarificationCounts: { "tea:kind": 1, "tea:quantity": 1, "tea:additions": 1, "egg:quantity": 1 },
            summary: "17 fried eggs, plus 250ml Earl Grey tea with no milk and no sugar",
            clarifyQuestion: "Anything they were cooked in?",
            items: [
              { base_name: "egg", label: "Eggs", category: "food", quantity: { amount: 17, unit: "egg", text: "17 eggs", modifier: "" }, preparation: ["fried"], exclusions: [], attached_to: null, relation: null },
              { base_name: "earl grey tea", label: "Earl Grey tea", category: "drink", quantity: { amount: 250, unit: "ml", text: "250ml", modifier: "" }, preparation: [], exclusions: ["no sugar", "no milk"], attached_to: null, relation: null },
            ],
          },
        }),
      })
      return
    }

    if (message.includes("cooked in 100g of salted butter")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Was that butter used for the eggs?",
          actions: [{ type: "clarify", message: "Was that butter used for the eggs?" }],
          warnings: [],
          meal_session: {
            active: true,
            mealConversation: true,
            readyToLog: true,
            clarificationAttempts: 4,
            clarificationCounts: { "tea:kind": 1, "tea:quantity": 1, "tea:additions": 1, "egg:quantity": 1, "egg:cooking_medium": 1 },
            summary: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
            clarifyQuestion: "",
            items: [
              { base_name: "egg", label: "Eggs", category: "food", quantity: { amount: 17, unit: "egg", text: "17 eggs", modifier: "" }, preparation: ["fried"], exclusions: [], attached_to: null, relation: null },
              { base_name: "earl grey tea", label: "Earl Grey tea", category: "drink", quantity: { amount: 250, unit: "ml", text: "250ml", modifier: "" }, preparation: [], exclusions: ["no sugar", "no milk"], attached_to: null, relation: null },
              { base_name: "salted butter", label: "Salted Butter", category: "ingredient", quantity: { amount: 100, unit: "g", text: "100g", modifier: "" }, preparation: ["salted"], exclusions: [], attached_to: "egg", relation: "cooked_in" },
            ],
          },
        }),
      })
      return
    }

    if (message.includes("the eggs")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Perfect. I have the full meal together now.",
          actions: [],
          warnings: [],
          meal_session: {
            active: true,
            mealConversation: true,
            readyToLog: true,
            clarificationAttempts: 5,
            clarificationCounts: { "tea:kind": 1, "tea:quantity": 1, "tea:additions": 1, "egg:quantity": 1, "egg:cooking_medium": 1, "butter:attachment": 1 },
            summary: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
            clarifyQuestion: "",
            items: [
              { base_name: "egg", label: "Eggs", category: "food", quantity: { amount: 17, unit: "egg", text: "17 eggs", modifier: "" }, preparation: ["fried"], exclusions: [], attached_to: null, relation: null },
              { base_name: "earl grey tea", label: "Earl Grey tea", category: "drink", quantity: { amount: 250, unit: "ml", text: "250ml", modifier: "" }, preparation: [], exclusions: ["no sugar", "no milk"], attached_to: null, relation: null },
              { base_name: "salted butter", label: "Salted Butter", category: "ingredient", quantity: { amount: 100, unit: "g", text: "100g", modifier: "" }, preparation: ["salted"], exclusions: [], attached_to: "egg", relation: "cooked_in" },
            ],
          },
        }),
      })
      return
    }

    if (message.includes("17 eggs fried in 100g of salted butter")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Thanks. I've got the meal details cleanly now.",
          actions: [],
          warnings: [],
          meal_session: {
            active: true,
            mealConversation: true,
            readyToLog: true,
            clarificationAttempts: 5,
            clarificationCounts: { "tea:kind": 1, "tea:quantity": 1, "tea:additions": 1, "egg:quantity": 1, "egg:cooking_medium": 1, "butter:attachment": 1 },
            summary: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
            clarifyQuestion: "",
            items: [
              { base_name: "egg", label: "Eggs", category: "food", quantity: { amount: 17, unit: "egg", text: "17 eggs", modifier: "" }, preparation: ["fried"], exclusions: [], attached_to: null, relation: null },
              { base_name: "earl grey tea", label: "Earl Grey tea", category: "drink", quantity: { amount: 250, unit: "ml", text: "250ml", modifier: "" }, preparation: [], exclusions: ["no sugar", "no milk"], attached_to: null, relation: null },
              { base_name: "salted butter", label: "Salted Butter", category: "ingredient", quantity: { amount: 100, unit: "g", text: "100g", modifier: "" }, preparation: ["salted"], exclusions: [], attached_to: "egg", relation: "cooked_in" },
            ],
          },
        }),
      })
      return
    }

    expect(mealSession?.summary || "").toMatch(/17 fried eggs cooked in 100g salted butter, plus 250ml earl grey tea/i)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "I logged 17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar. That estimate comes to roughly 2,230 calories, 164g protein, 47g carbs, and 236g fat.",
        actions: [
          {
            type: "log_meal",
            food_name: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
            meal_type: "breakfast",
            quantity: "1 meal",
            calories: 2230,
            protein_g: 164,
            carbs_g: 47,
            fat_g: 236,
            estimated: true,
            nutrition_source: "Coach estimate from accumulated meal details across chat",
          },
        ],
        warnings: [],
        meal_session: {
          active: true,
          mealConversation: true,
          readyToLog: true,
          clarificationAttempts: 5,
          clarificationCounts: { "tea:kind": 1, "tea:quantity": 1, "tea:additions": 1, "egg:quantity": 1, "egg:cooking_medium": 1, "butter:attachment": 1 },
          summary: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
          clarifyQuestion: "",
          items: [
            { base_name: "egg", label: "Eggs", category: "food", quantity: { amount: 17, unit: "egg", text: "17 eggs", modifier: "" }, preparation: ["fried"], exclusions: [], attached_to: null, relation: null },
            { base_name: "earl grey tea", label: "Earl Grey tea", category: "drink", quantity: { amount: 250, unit: "ml", text: "250ml", modifier: "" }, preparation: [], exclusions: ["no sugar", "no milk"], attached_to: null, relation: null },
            { base_name: "salted butter", label: "Salted Butter", category: "ingredient", quantity: { amount: 100, unit: "g", text: "100g", modifier: "" }, preparation: ["salted"], exclusions: [], attached_to: "egg", relation: "cooked_in" },
          ],
        },
      }),
    })
  })

  await page.goto("/Coach")
  const composer = page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i)
  for (const message of [
    "i had egg and tea",
    "earl grey",
    "250ml, no sugar no milk",
    "17 fried eggs",
    "cooked in 100g of salted butter",
    "the eggs",
    "17 eggs fried in 100g of salted butter",
    "i just did",
  ]) {
    await composer.fill(message)
    await page.getByRole("button", { name: /^Send$/i }).click()
  }

  await expect(page.getByText(/saved to today's nutrition: 17 fried eggs cooked in 100g salted butter, plus 250ml earl grey tea with no milk and no sugar\./i)).toBeVisible()

  await page.goto("/Nutrition")
  await page.reload()
  const todayMealsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /today's meals/i }) })
  await expect(todayMealsSection.getByText("17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")).toBeVisible()
  await expect(todayMealsSection.getByText(/2230 kcal - 164g protein/i)).toBeVisible()
})

test("coach keeps the persisted meal session after leaving and re-entering Coach so corrections update the saved meal", async ({ page }) => {
  await seedOnboardedProfile(page)
  await page.route("**/api/coach", async (route) => {
    const body = route.request().postDataJSON()
    const message = String(body.message || "").toLowerCase()
    const mealSession = body.mealSession || null

    if (message.includes("17 eggs fried in 100g of salted butter")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "I logged 17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar. That estimate comes to roughly 2,230 calories, 164g protein, 47g carbs, and 236g fat.",
          actions: [
            {
              type: "log_meal",
              food_name: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
              meal_type: "breakfast",
              quantity: "1 meal",
              calories: 2230,
              protein_g: 164,
              carbs_g: 47,
              fat_g: 236,
              estimated: true,
              nutrition_source: "Coach estimate from accumulated meal details across chat",
            },
          ],
          warnings: [],
          meal_session: {
            active: true,
            mealConversation: true,
            readyToLog: true,
            clarificationAttempts: 2,
            clarificationCounts: { "egg:quantity": 1, "egg:cooking_medium": 1 },
            summary: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
            clarifyQuestion: "",
            items: [
              { base_name: "egg", label: "Eggs", category: "food", quantity: { amount: 17, unit: "egg", text: "17 eggs", modifier: "" }, preparation: ["fried"], exclusions: [], attached_to: null, relation: null },
              { base_name: "earl grey tea", label: "Earl Grey tea", category: "drink", quantity: { amount: 250, unit: "ml", text: "250ml", modifier: "" }, preparation: [], exclusions: ["no sugar", "no milk"], attached_to: null, relation: null },
              { base_name: "salted butter", label: "Salted Butter", category: "ingredient", quantity: { amount: 100, unit: "g", text: "100g", modifier: "" }, preparation: ["salted"], exclusions: [], attached_to: "egg", relation: "cooked_in" },
            ],
          },
        }),
      })
      return
    }

    if (message.includes("actually it was 18 fried eggs")) {
      expect(mealSession?.persistedMealId || "").toBeTruthy()
      expect(mealSession?.persistedSummary || "").toMatch(/17 fried eggs cooked in 100g salted butter/i)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Updated today's nutrition entry for 18 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar.",
          actions: [
            {
              type: "update_meal_log",
              meal_id: mealSession.persistedMealId,
              food_name: "18 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
              meal_type: "breakfast",
              quantity: "1 meal",
              calories: 2304,
              protein_g: 170,
              carbs_g: 47,
              fat_g: 241,
              estimated: true,
              nutrition_source: "Coach estimate from accumulated meal details across chat",
            },
          ],
          warnings: [],
          meal_session: {
            ...mealSession,
            active: true,
            readyToLog: true,
            correctionRequested: true,
            summary: "18 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
            items: [
              { base_name: "egg", label: "Eggs", category: "food", quantity: { amount: 18, unit: "egg", text: "18 eggs", modifier: "" }, preparation: ["fried"], exclusions: [], attached_to: null, relation: null },
              { base_name: "earl grey tea", label: "Earl Grey tea", category: "drink", quantity: { amount: 250, unit: "ml", text: "250ml", modifier: "" }, preparation: [], exclusions: ["no sugar", "no milk"], attached_to: null, relation: null },
              { base_name: "salted butter", label: "Salted Butter", category: "ingredient", quantity: { amount: 100, unit: "g", text: "100g", modifier: "" }, preparation: ["salted"], exclusions: [], attached_to: "egg", relation: "cooked_in" },
            ],
          },
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "I need a little more detail first.",
        actions: [{ type: "clarify", message: "I need a little more detail first." }],
        warnings: [],
      }),
    })
  })

  await page.goto("/Coach")
  const composer = page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i)
  await composer.fill("17 eggs fried in 100g of salted butter, plus 250ml Earl Grey tea with no milk and no sugar")
  await page.getByRole("button", { name: /^Send$/i }).click()
  await expect(page.getByText(/saved to today's nutrition: 17 fried eggs cooked in 100g salted butter, plus 250ml earl grey tea with no milk and no sugar\./i)).toBeVisible()

  await page.goto("/Nutrition")
  const todayMealsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /today's meals/i }) })
  await expect(todayMealsSection.getByText("17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")).toBeVisible()

  await page.goto("/Coach")
  await composer.fill("actually it was 18 fried eggs cooked in 100g of salted butter, plus 250ml Earl Grey tea with no milk and no sugar")
  await page.getByRole("button", { name: /^Send$/i }).click()
  await expect(page.getByText(/updated today's nutrition: 18 fried eggs cooked in 100g salted butter, plus 250ml earl grey tea with no milk and no sugar\./i)).toBeVisible()

  await page.goto("/Nutrition")
  await expect(todayMealsSection.getByText("18 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")).toBeVisible()
  await expect(todayMealsSection.getByText("17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")).toHaveCount(0)
})

test("coach does not create duplicate meals when a redundant follow-up arrives after a persisted save", async ({ page }) => {
  await seedOnboardedProfile(page)
  await page.route("**/api/coach", async (route) => {
    const body = route.request().postDataJSON()
    const message = String(body.message || "").toLowerCase()
    const mealSession = body.mealSession || null

    if (message.includes("egg and tea")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "How many eggs did you have?",
          actions: [{ type: "clarify", message: "How many eggs did you have?" }],
          warnings: [],
          meal_session: {
            active: true,
            mealConversation: true,
            readyToLog: false,
            clarificationAttempts: 0,
            clarificationCounts: {},
            summary: "eggs, plus tea",
            clarifyQuestion: "How many eggs did you have?",
            items: [
              { base_name: "egg", label: "Egg", category: "food", quantity: null, preparation: [], exclusions: [], attached_to: null, relation: null },
              { base_name: "tea", label: "Tea", category: "drink", quantity: null, preparation: [], exclusions: [], attached_to: null, relation: null },
            ],
          },
        }),
      })
      return
    }

    if (message.includes("17 eggs fried in 100g of salted butter")) {
      expect(mealSession?.summary || "").toMatch(/eggs, plus tea/i)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "I logged 17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar. That estimate comes to roughly 2,230 calories, 164g protein, 47g carbs, and 236g fat.",
          actions: [
            {
              type: "log_meal",
              food_name: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
              meal_type: "breakfast",
              quantity: "1 meal",
              calories: 2230,
              protein_g: 164,
              carbs_g: 47,
              fat_g: 236,
              estimated: true,
              nutrition_source: "Coach estimate from accumulated meal details across chat",
            },
          ],
          warnings: [],
          meal_session: {
            ...mealSession,
            active: true,
            mealConversation: true,
            readyToLog: true,
            summary: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
            clarifyQuestion: "",
          },
        }),
      })
      return
    }

    expect(mealSession?.persisted).toBe(true)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "I already saved 17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar in today's nutrition log. If you want to change it, tell me what to update.",
        actions: [],
        warnings: [],
        meal_session: {
          ...mealSession,
          alreadyLogged: true,
          active: false,
          readyToLog: false,
        },
      }),
    })
  })

  await page.goto("/Coach")
  const composer = page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i)
  for (const message of [
    "i had egg and tea",
    "17 eggs fried in 100g of salted butter",
    "i just did",
  ]) {
    await composer.fill(message)
    await page.getByRole("button", { name: /^Send$/i }).click()
  }

  await expect(page.getByText(/already saved 17 fried eggs cooked in 100g salted butter/i).first()).toBeVisible()

  await page.goto("/Nutrition")
  await page.reload()
  const todayMealsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /today's meals/i }) })
  await expect(todayMealsSection.getByText("17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")).toHaveCount(1)
})

test("coach ignores rapid duplicate meal submits before they create duplicate requests or logs", async ({ page }) => {
  await seedOnboardedProfile(page)
  let coachCalls = 0

  await page.route("**/api/coach", async (route) => {
    coachCalls += 1
    await new Promise((resolve) => setTimeout(resolve, 180))
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "Saved to today's nutrition: Rapid duplicate meal guard test.",
        actions: [
          {
            type: "log_meal",
            food_name: "Rapid duplicate meal guard test",
            meal_type: "snack",
            quantity: "1 meal",
            calories: 420,
            protein_g: 24,
            carbs_g: 18,
            fat_g: 24,
            estimated: true,
            nutrition_source: "Coach estimate from accumulated meal details across chat",
          },
        ],
        warnings: [],
        meal_session: {
          active: true,
          mealConversation: true,
          readyToLog: true,
          clarificationAttempts: 0,
          clarificationCounts: {},
          summary: "Rapid duplicate meal guard test",
          clarifyQuestion: "",
          items: [],
        },
        workout_session: {},
      }),
    })
  })

  await page.goto("/Coach")
  const composer = page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i)
  await composer.fill("rapid duplicate meal guard test")
  await page.getByRole("button", { name: /^Send$/i }).evaluate((button) => {
    button.click()
    button.click()
  })

  await expect(page.getByText(/saved to today's nutrition: rapid duplicate meal guard test\./i)).toBeVisible()
  await expect.poll(() => coachCalls).toBe(1)
  await expect(page.getByText("rapid duplicate meal guard test", { exact: true })).toHaveCount(1)

  await page.goto("/Nutrition")
  await page.reload()
  const todayMealsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /today's meals/i }) })
  await expect(todayMealsSection.getByText("Rapid duplicate meal guard test")).toHaveCount(1)
})

test("coach meal saves propagate to an open second tab without needing a manual refresh", async ({ page }) => {
  const context = page.context()
  await seedOnboardedProfileInContext(context)
  await page.route("**/api/coach", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "Saved to today's nutrition: Cross-tab meal sync test.",
        actions: [
          {
            type: "log_meal",
            food_name: "Cross-tab meal sync test",
            meal_type: "snack",
            quantity: "1 meal",
            calories: 360,
            protein_g: 18,
            carbs_g: 24,
            fat_g: 14,
            estimated: true,
            nutrition_source: "Coach estimate from accumulated meal details across chat",
          },
        ],
        warnings: [],
        meal_session: {
          active: true,
          mealConversation: true,
          readyToLog: true,
          clarificationAttempts: 0,
          clarificationCounts: {},
          summary: "Cross-tab meal sync test",
          clarifyQuestion: "",
          items: [],
        },
        workout_session: {},
      }),
    })
  })

  const secondTab = await context.newPage()
  await page.goto("/Coach")
  await secondTab.goto("/Nutrition")

  const composer = page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i)
  await composer.fill("cross-tab meal sync test")
  await page.getByRole("button", { name: /^Send$/i }).click()
  await expect(page.getByText(/saved to today's nutrition: cross-tab meal sync test\./i)).toBeVisible()

  const secondMealsSection = secondTab.locator("section").filter({ has: secondTab.getByRole("heading", { name: /today's meals/i }) })
  await expect(secondMealsSection.getByText("Cross-tab meal sync test")).toBeVisible()

  await secondTab.reload()
  await expect(secondMealsSection.getByText("Cross-tab meal sync test")).toBeVisible()
  await secondTab.close()
})

test("coach corrections still update a saved meal after redundant post-save follow-ups", async ({ page }) => {
  await seedOnboardedProfile(page)
  await page.route("**/api/coach", async (route) => {
    const body = route.request().postDataJSON()
    const message = String(body.message || "").toLowerCase()
    const mealSession = body.mealSession || null
    const workoutSession = body.workoutSession || null

    if (message.includes("17 eggs fried in 100g of salted butter")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Saved to today's nutrition: 17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar.",
          actions: [
            {
              type: "log_meal",
              food_name: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
              meal_type: "breakfast",
              quantity: "1 meal",
              calories: 2230,
              protein_g: 164,
              carbs_g: 47,
              fat_g: 236,
              estimated: true,
              nutrition_source: "Coach estimate from accumulated meal details across chat",
            },
          ],
          warnings: [],
          meal_session: {
            ...mealSession,
            active: true,
            mealConversation: true,
            readyToLog: true,
            summary: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
            clarifyQuestion: "",
          },
          workout_session: null,
        }),
      })
      return
    }

    if (message === "the eggs" || message === "i just did") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "I already saved 17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar in today's nutrition log. If you want to change it, tell me what to update.",
          actions: [],
          warnings: [],
          meal_session: {
            ...mealSession,
            alreadyLogged: true,
            active: false,
            readyToLog: false,
            clarifyQuestion: "",
          },
          workout_session: null,
        }),
      })
      return
    }

    if (message.includes("actually it was 18 fried eggs")) {
      expect(mealSession?.persistedMealId || "").toBeTruthy()
      expect(mealSession?.persistedSummary || "").toMatch(/17 fried eggs cooked in 100g salted butter/i)
      expect(workoutSession && typeof workoutSession === "object").toBeTruthy()
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Updated today's nutrition entry for 18 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar.",
          actions: [
            {
              type: "update_meal_log",
              meal_id: mealSession.persistedMealId,
              food_name: "18 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
              meal_type: "breakfast",
              quantity: "1 meal",
              calories: 2304,
              protein_g: 170,
              carbs_g: 47,
              fat_g: 241,
              estimated: true,
              nutrition_source: "Coach estimate from accumulated meal details across chat",
            },
          ],
          warnings: [],
          meal_session: {
            ...mealSession,
            active: true,
            readyToLog: true,
            correctionRequested: true,
            summary: "18 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
            items: [
              { base_name: "egg", label: "Eggs", category: "food", quantity: { amount: 18, unit: "egg", text: "18 eggs", modifier: "" }, preparation: ["fried"], exclusions: [], attached_to: null, relation: null },
              { base_name: "earl grey tea", label: "Earl Grey tea", category: "drink", quantity: { amount: 250, unit: "ml", text: "250ml", modifier: "" }, preparation: [], exclusions: ["no sugar", "no milk"], attached_to: null, relation: null },
              { base_name: "salted butter", label: "Salted Butter", category: "ingredient", quantity: { amount: 100, unit: "g", text: "100g", modifier: "" }, preparation: ["salted"], exclusions: [], attached_to: "egg", relation: "cooked_in" },
            ],
          },
          workout_session: null,
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "How many eggs did you have?",
        actions: [{ type: "clarify", message: "How many eggs did you have?" }],
        warnings: [],
        meal_session: {
          active: true,
          mealConversation: true,
          readyToLog: false,
          clarificationAttempts: 0,
          clarificationCounts: {},
          summary: "eggs, plus tea",
          clarifyQuestion: "How many eggs did you have?",
          items: [
            { base_name: "egg", label: "Egg", category: "food", quantity: null, preparation: [], exclusions: [], attached_to: null, relation: null },
            { base_name: "tea", label: "Tea", category: "drink", quantity: null, preparation: [], exclusions: [], attached_to: null, relation: null },
          ],
        },
        workout_session: null,
      }),
    })
  })

  await page.goto("/Coach")
  const composer = page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i)
  for (const message of [
    "17 eggs fried in 100g of salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
    "the eggs",
    "i just did",
  ]) {
    await composer.fill(message)
    await page.getByRole("button", { name: /^Send$/i }).click()
  }

  await expect(page.getByText(/already saved 17 fried eggs cooked in 100g salted butter/i).first()).toBeVisible()

  await composer.fill("actually it was 18 fried eggs cooked in 100g of salted butter, plus 250ml Earl Grey tea with no milk and no sugar")
  await page.getByRole("button", { name: /^Send$/i }).click()
  await expect(page.getByText(/updated today's nutrition: 18 fried eggs cooked in 100g salted butter, plus 250ml earl grey tea with no milk and no sugar\./i)).toBeVisible()

  await page.goto("/Nutrition")
  const todayMealsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /today's meals/i }) })
  await expect(todayMealsSection.getByText("18 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")).toBeVisible()
  await expect(todayMealsSection.getByText("17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")).toHaveCount(0)
})

test("coach reconciles stale meal log actions into one corrected saved meal", async ({ page }) => {
  await seedOnboardedProfile(page)
  await page.route("**/api/coach", async (route) => {
    const body = route.request().postDataJSON()
    const message = String(body.message || "").toLowerCase()
    const mealSession = body.mealSession || null

    if (message.includes("17 eggs fried in 100g of salted butter")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Saved to today's nutrition: 17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar.",
          actions: [
            {
              type: "log_meal",
              food_name: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
              meal_type: "breakfast",
              quantity: "1 meal",
              calories: 2230,
              protein_g: 164,
              carbs_g: 47,
              fat_g: 236,
              estimated: true,
              nutrition_source: "Coach estimate from accumulated meal details across chat",
            },
          ],
          warnings: [],
          meal_session: {
            ...mealSession,
            active: true,
            mealConversation: true,
            readyToLog: true,
            summary: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
            clarifyQuestion: "",
          },
          workout_session: null,
        }),
      })
      return
    }

    if (message === "the eggs" || message === "i just did") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Saved to today's nutrition: 17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar.",
          actions: [
            {
              type: "log_meal",
              food_name: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
              meal_type: "breakfast",
              quantity: "1 meal",
              calories: 2230,
              protein_g: 164,
              carbs_g: 47,
              fat_g: 236,
              estimated: true,
              nutrition_source: "Coach estimate from accumulated meal details across chat",
            },
          ],
          warnings: [],
          meal_session: {
            ...mealSession,
            alreadyLogged: true,
            active: false,
            readyToLog: false,
            clarifyQuestion: "",
          },
          workout_session: null,
        }),
      })
      return
    }

    if (message.includes("actually it was 18 fried eggs")) {
      expect(mealSession?.persistedMealId || "").toBeTruthy()
      expect(mealSession?.persistedSummary || "").toMatch(/17 fried eggs cooked in 100g salted butter/i)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Saved to today's nutrition: 18 fried eggs cooked in 100g salted butter and 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar.",
          actions: [
            {
              type: "log_meal",
              food_name: "18 fried eggs cooked in 100g salted butter and 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
              meal_type: "breakfast",
              quantity: "1 meal",
              calories: 2304,
              protein_g: 170,
              carbs_g: 47,
              fat_g: 241,
              estimated: true,
              nutrition_source: "Coach estimate from accumulated meal details across chat",
            },
          ],
          warnings: [],
          meal_session: {
            ...mealSession,
            active: true,
            readyToLog: true,
            correctionRequested: true,
            summary: "18 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
            items: [
              { base_name: "egg", label: "Eggs", category: "food", quantity: { amount: 18, unit: "egg", text: "18 eggs", modifier: "" }, preparation: ["fried"], exclusions: [], attached_to: null, relation: null },
              { base_name: "earl grey tea", label: "Earl Grey tea", category: "drink", quantity: { amount: 250, unit: "ml", text: "250ml", modifier: "" }, preparation: [], exclusions: ["no sugar", "no milk"], attached_to: null, relation: null },
              { base_name: "salted butter", label: "Salted Butter", category: "ingredient", quantity: { amount: 100, unit: "g", text: "100g", modifier: "" }, preparation: ["salted"], exclusions: [], attached_to: "egg", relation: "cooked_in" },
            ],
          },
          workout_session: null,
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "How many eggs did you have?",
        actions: [{ type: "clarify", message: "How many eggs did you have?" }],
        warnings: [],
        meal_session: {
          active: true,
          mealConversation: true,
          readyToLog: false,
          clarificationAttempts: 0,
          clarificationCounts: {},
          summary: "eggs, plus tea",
          clarifyQuestion: "How many eggs did you have?",
          items: [
            { base_name: "egg", label: "Egg", category: "food", quantity: null, preparation: [], exclusions: [], attached_to: null, relation: null },
            { base_name: "tea", label: "Tea", category: "drink", quantity: null, preparation: [], exclusions: [], attached_to: null, relation: null },
          ],
        },
        workout_session: null,
      }),
    })
  })

  await page.goto("/Coach")
  const composer = page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i)
  for (const message of [
    "17 eggs fried in 100g of salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
    "the eggs",
    "i just did",
  ]) {
    await composer.fill(message)
    await page.getByRole("button", { name: /^Send$/i }).click()
  }

  await expect(page.getByText(/already saved 17 fried eggs cooked in 100g salted butter/i).first()).toBeVisible()

  await composer.fill("actually it was 18 fried eggs cooked in 100g of salted butter, plus 250ml Earl Grey tea with no milk and no sugar")
  await page.getByRole("button", { name: /^Send$/i }).click()

  await expect(page.getByText(/updated today's nutrition: 18 fried eggs cooked in 100g salted butter, plus 250ml earl grey tea with no milk and no sugar\./i)).toBeVisible()

  await page.goto("/Nutrition")
  await page.reload()
  const todayMealsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /today's meals/i }) })
  await expect(todayMealsSection.getByText("18 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")).toHaveCount(1)
  await expect(todayMealsSection.getByText("17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar")).toHaveCount(0)
})

test("coach sends arbitrary food detail messages to the live coach instead of tripping the local build-block fallback", async ({ page }) => {
  await seedOnboardedProfile(page)
  let requestCount = 0
  await page.route("**/api/coach", async (route) => {
    requestCount += 1
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "That whole meal lands at roughly 4,980 calories. I can break it down ingredient by ingredient or save it as one estimate.",
        actions: [],
        warnings: [],
      }),
    })
  })

  await page.goto("/Coach")
  await page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i).fill("5 tins of heinz baked beans, and an entire block of old gold 70% chocolate, also had 2L of fresh squeezed apple juice and ate an entire bunch of celery")
  await page.getByRole("button", { name: /^Send$/i }).click()

  await expect(page.getByText(/roughly 4,980 calories/i)).toBeVisible()
  await expect(page.getByText(/^Build block:/i)).toHaveCount(0)
  expect(requestCount).toBe(1)
})

test("coach-logged workouts show up in Workouts with completed sets and volume", async ({ page }) => {
  await seedOnboardedProfile(page)
  await page.route("**/api/coach", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "Awesome work. I logged your preacher bicep dumbbells at 12.5kg for 4 sets of 10.",
        actions: [
          {
            type: "log_workout",
            exercise_name: "Preacher Bicep Dumbbells",
            workout_type: "Preacher Bicep Dumbbells",
            muscle_group: "biceps",
            sets: 4,
            reps: 10,
            weight_kg: 12.5,
            duration_seconds: 0,
          },
        ],
        warnings: [],
      }),
    })
  })

  await page.goto("/Coach")
  await page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i).fill("I did preacher bicep dumbbells 12.5kg for 4 sets of 10")
  await page.getByRole("button", { name: /^Send$/i }).click()

  await expect(page.getByText(/saved to workouts: preacher bicep dumbbells for 4 sets of 10 at 12\.5kg\./i)).toBeVisible()

  await page.goto("/Workouts")
  const recentSessionsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /recent sessions/i }) }).first()
  await expect(recentSessionsSection.getByText(/preacher bicep dumbbells/i).first()).toBeVisible()
  await expect(page.getByText(/4 structured sets logged so far\./i).first()).toBeVisible()
  await expect(page.getByText("500kg").first()).toBeVisible()
})

test("fragmented coach workout logs persist into Workouts after refresh", async ({ page }) => {
  await seedOnboardedProfile(page)
  await page.route("**/api/coach", async (route) => {
    const body = route.request().postDataJSON()
    const message = String(body.message || "").toLowerCase()
    const workoutSession = body.workoutSession || null

    if (message === "bench press") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "How much weight did you use for bench press?",
          actions: [{ type: "clarify", message: "How much weight did you use for bench press?" }],
          warnings: [],
          workout_session: {
            active: true,
            workoutConversation: true,
            exercise_name: "Bench Press",
            workout_type: "Bench Press",
            muscle_group: "full_body",
            sets: 0,
            reps: 0,
            weight_kg: 0,
            duration_seconds: 0,
            distance_km: 0,
            clarificationAttempts: 0,
            clarificationCounts: {},
            readyToLog: false,
            shouldStopClarifying: false,
            clarifyQuestion: "How much weight did you use for bench press?",
            summary: "Bench Press",
            wantsLogging: true,
          },
        }),
      })
      return
    }

    if (message === "80kg") {
      expect(workoutSession?.exercise_name).toBe("Bench Press")
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "How many sets did you do?",
          actions: [{ type: "clarify", message: "How many sets did you do?" }],
          warnings: [],
          workout_session: {
            ...workoutSession,
            weight_kg: 80,
            clarifyQuestion: "How many sets did you do?",
          },
        }),
      })
      return
    }

    if (message === "4 sets") {
      expect(workoutSession?.weight_kg).toBe(80)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "How many reps did you do?",
          actions: [{ type: "clarify", message: "How many reps did you do?" }],
          warnings: [],
          workout_session: {
            ...workoutSession,
            sets: 4,
            clarifyQuestion: "How many reps did you do?",
          },
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "I logged bench press 80kg for 4 sets of 6.",
        actions: [
          {
            type: "log_workout",
            exercise_name: "Bench Press",
            workout_type: "Bench Press",
            muscle_group: "chest",
            sets: 4,
            reps: 6,
            weight_kg: 80,
            duration_seconds: 0,
          },
        ],
        warnings: [],
        workout_session: {
          ...workoutSession,
          readyToLog: true,
          summary: "Bench Press 80kg for 4 sets of 6",
          clarifyQuestion: "",
        },
      }),
    })
  })

  await page.goto("/Coach")
  const composer = page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i)
  for (const message of ["bench press", "80kg", "4 sets", "6 reps"]) {
    await composer.fill(message)
    await page.getByRole("button", { name: /^Send$/i }).click()
  }
  await expect(page.getByText(/saved to workouts: bench press for 4 sets of 6 at 80kg\./i)).toBeVisible()

  await page.goto("/Workouts")
  await page.reload()
  await expect(page.getByText(/4 structured sets logged so far\./i).first()).toBeVisible()
  await expect(page.getByText(/1,?920kg/).first()).toBeVisible()
})

test("coach workout saves propagate to an open second tab without needing a manual refresh", async ({ page }) => {
  const context = page.context()
  await seedOnboardedProfileInContext(context)
  await page.route("**/api/coach", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "Saved to Workouts: Bench Press 80kg for 4 sets of 6.",
        actions: [
          {
            type: "log_workout",
            exercise_name: "Bench Press",
            workout_type: "Bench Press",
            muscle_group: "chest",
            sets: 4,
            reps: 6,
            weight_kg: 80,
            duration_seconds: 0,
          },
        ],
        warnings: [],
        workout_session: {
          active: true,
          workoutConversation: true,
          readyToLog: true,
          clarificationAttempts: 0,
          clarificationCounts: {},
          summary: "Bench Press 80kg for 4 sets of 6",
          clarifyQuestion: "",
          exercise_name: "Bench Press",
          workout_type: "Bench Press",
          muscle_group: "chest",
          sets: 4,
          reps: 6,
          weight_kg: 80,
          duration_seconds: 0,
        },
        meal_session: {},
      }),
    })
  })

  const secondTab = await context.newPage()
  await page.goto("/Coach")
  await secondTab.goto("/Workouts")

  const composer = page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i)
  await composer.fill("bench press 80kg for 4 sets of 6")
  await page.getByRole("button", { name: /^Send$/i }).click()
  await expect(page.getByText(/saved to workouts: bench press for 4 sets of 6 at 80kg\./i)).toBeVisible()

  await expect(secondTab.getByText(/4 structured sets logged so far\./i).first()).toBeVisible()
  await expect(secondTab.getByText(/1,?920kg/).first()).toBeVisible()

  await secondTab.reload()
  await expect(secondTab.getByText(/4 structured sets logged so far\./i).first()).toBeVisible()
  await expect(secondTab.getByText(/1,?920kg/).first()).toBeVisible()
  await secondTab.close()
})

test("coach reconciles stale workout log actions into one corrected saved workout", async ({ page }) => {
  await seedOnboardedProfile(page)
  await page.route("**/api/coach", async (route) => {
    const body = route.request().postDataJSON()
    const message = String(body.message || "").toLowerCase()
    const workoutSession = body.workoutSession || null

    if (message.includes("bench press 80kg for 4 sets of 6")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "I logged bench press 80kg for 4 sets of 6.",
          actions: [
            {
              type: "log_workout",
              exercise_name: "Bench Press",
              workout_type: "Bench Press",
              muscle_group: "chest",
              sets: 4,
              reps: 6,
              weight_kg: 80,
              duration_seconds: 0,
            },
          ],
          warnings: [],
          workout_session: {
            ...workoutSession,
            active: true,
            workoutConversation: true,
            readyToLog: true,
            summary: "Bench Press 80kg for 4 sets of 6",
            clarifyQuestion: "",
          },
          meal_session: {},
        }),
      })
      return
    }

    if (message === "that workout" || message === "i just did") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "I logged bench press 80kg for 4 sets of 6.",
          actions: [
            {
              type: "log_workout",
              exercise_name: "Bench Press",
              workout_type: "Bench Press",
              muscle_group: "chest",
              sets: 4,
              reps: 6,
              weight_kg: 80,
              duration_seconds: 0,
            },
          ],
          warnings: [],
          workout_session: {
            ...workoutSession,
            alreadyLogged: true,
            active: false,
            readyToLog: false,
            clarifyQuestion: "",
          },
          meal_session: {},
        }),
      })
      return
    }

    if (message.includes("actually it was 5 reps")) {
      expect(workoutSession?.persistedWorkoutId || "").toBeTruthy()
      expect(workoutSession?.persistedSummary || "").toMatch(/bench press 80kg for 4 sets of 6/i)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "I logged bench press 80kg for 4 sets of 5.",
          actions: [
            {
              type: "log_workout",
              exercise_name: "Bench Press",
              workout_type: "Bench Press",
              muscle_group: "chest",
              sets: 4,
              reps: 5,
              weight_kg: 80,
              duration_seconds: 0,
            },
          ],
          warnings: [],
          workout_session: {
            ...workoutSession,
            active: true,
            readyToLog: true,
            correctionRequested: true,
            summary: "Bench Press 80kg for 4 sets of 5",
            reps: 5,
            clarifyQuestion: "",
          },
          meal_session: {},
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "What exercise did you do?",
        actions: [{ type: "clarify", message: "What exercise did you do?" }],
        warnings: [],
        workout_session: {
          active: true,
          workoutConversation: true,
          readyToLog: false,
          clarificationAttempts: 0,
          clarificationCounts: {},
          clarifyQuestion: "What exercise did you do?",
          summary: "",
          wantsLogging: true,
        },
        meal_session: {},
      }),
    })
  })

  await page.goto("/Coach")
  const composer = page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i)
  await composer.fill("bench press 80kg for 4 sets of 6")
  await page.getByRole("button", { name: /^Send$/i }).click()
  await expect(page.getByText(/saved to workouts: bench press for 4 sets of 6 at 80kg\./i)).toBeVisible()

  await composer.fill("that workout")
  await page.getByRole("button", { name: /^Send$/i }).click()
  await expect(page.getByText(/i already saved bench press 80kg for 4 sets of 6 in workouts/i).first()).toBeVisible()

  await composer.fill("i just did")
  await page.getByRole("button", { name: /^Send$/i }).click()

  await expect(page.getByText(/i already saved bench press 80kg for 4 sets of 6 in workouts/i).first()).toBeVisible()

  await composer.fill("actually it was 5 reps")
  await page.getByRole("button", { name: /^Send$/i }).click()
  await expect(page.getByText(/updated your workout log: bench press for 4 sets of 5 at 80kg\./i)).toBeVisible()

  await page.goto("/Workouts")
  const recentSessionsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /recent sessions/i }) }).first()
  await expect(recentSessionsSection.getByText(/bench press/i).first()).toBeVisible()
  await expect(page.getByText(/4 structured sets logged so far\./i).first()).toBeVisible()
  await expect(page.getByText(/1,?600kg/).first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(/1,?920kg/)).toHaveCount(0)
})

test("coach ignores rapid duplicate workout submits before they create duplicate requests or logs", async ({ page }) => {
  await seedOnboardedProfile(page)
  let coachCalls = 0

  await page.route("**/api/coach", async (route) => {
    coachCalls += 1
    await new Promise((resolve) => setTimeout(resolve, 180))
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "Saved to Workouts: Bench Press 80kg for 4 sets of 6.",
        actions: [
          {
            type: "log_workout",
            exercise_name: "Bench Press",
            workout_type: "Bench Press",
            muscle_group: "chest",
            sets: 4,
            reps: 6,
            weight_kg: 80,
            duration_seconds: 0,
          },
        ],
        warnings: [],
        workout_session: {
          active: true,
          workoutConversation: true,
          readyToLog: true,
          clarificationAttempts: 0,
          clarificationCounts: {},
          summary: "Bench Press 80kg for 4 sets of 6",
          clarifyQuestion: "",
          exercise_name: "Bench Press",
          workout_type: "Bench Press",
          muscle_group: "chest",
          sets: 4,
          reps: 6,
          weight_kg: 80,
          duration_seconds: 0,
        },
        meal_session: {},
      }),
    })
  })

  await page.goto("/Coach")
  const composer = page.getByPlaceholder(/log bench 80kg for 4 sets of 6/i)
  await composer.fill("bench press 80kg for 4 sets of 6")
  await page.getByRole("button", { name: /^Send$/i }).evaluate((button) => {
    button.click()
    button.click()
  })

  await expect(page.getByText(/saved to workouts: bench press for 4 sets of 6 at 80kg\./i)).toBeVisible()
  await expect.poll(() => coachCalls).toBe(1)
  await expect(page.getByText("bench press 80kg for 4 sets of 6", { exact: true })).toHaveCount(1)

  await page.goto("/Workouts")
  await page.reload()
  await expect(page.getByText(/4 structured sets logged so far\./i).first()).toBeVisible()
  await expect(page.getByText(/1,?920kg/).first()).toBeVisible()
  await expect(page.getByText(/3,?840kg/)).toHaveCount(0)
})

test("logged workouts can be edited in place from Workouts and update volume", async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10)
  await seedState(page, {
    "apexai.profile": onboardedProfile,
    "apexai.workouts": [
      {
        id: "workout_edit_1",
        date: today,
        workout_type: "Seed workout",
        duration_minutes: 35,
        notes: "",
        completed: true,
      },
    ],
    "apexai.workoutSets": [
      {
        id: "set_edit_1",
        session_id: "workout_edit_1",
        exercise_name: "Bench Press",
        muscle_group: "chest",
        set_number: 1,
        reps: 8,
        weight_kg: 60,
        duration_seconds: 0,
        distance_km: 0,
        notes: "",
        date: today,
      },
    ],
  })

  await page.goto("/Workouts")
  await page.getByRole("button", { name: /edit seed workout/i }).click()
  await expect(page.getByRole("heading", { name: /edit workout log/i })).toBeVisible()
  await page.getByPlaceholder("Workout name").fill("Updated workout")
  await page.getByPlaceholder("kg").first().fill("70")
  await page.getByRole("button", { name: /save changes/i }).click()

  await expect(page.getByRole("heading", { name: /edit workout log/i })).toHaveCount(0)
  await expect(page.getByText("Updated workout").first()).toBeVisible()
  await expect(page.getByText("560kg").first()).toBeVisible()
})

test("coach chat can be cleared back to the single starter message", async ({ page }) => {
  await seedState(page, {
    "apexai.profile": onboardedProfile,
    "apexai.chat": [
      {
        id: "chat_welcome",
        role: "assistant",
        content: "Tell me what you did or what you need. I can log completed meals and workouts, build or edit today's plan, guide an active session, update targets, and answer coaching questions.",
        timestamp: new Date().toISOString(),
      },
      {
        id: "chat_user_1",
        role: "user",
        content: "Build me a workout for today",
        timestamp: new Date().toISOString(),
      },
      {
        id: "chat_assistant_1",
        role: "assistant",
        content: "Here is a saved response to clear.",
        timestamp: new Date().toISOString(),
      },
    ],
  })

  await page.goto("/Coach")
  await expect(page.getByRole("button", { name: /clear chat/i })).toBeVisible()
  await page.getByRole("button", { name: /clear chat/i }).click()

  await expect(page.getByText(/here is a saved response to clear/i)).toHaveCount(0)
  await expect(page.getByText(/tell me what you did or what you need/i)).toHaveCount(1)
})

test("recipes can be edited in place and persist the new title", async ({ page }) => {
  await seedState(page, {
    "apexai.profile": onboardedProfile,
    "apexai.recipes": [
      {
        id: "recipe_e2e",
        name: "Power Oats",
        meal_type: "breakfast",
        description: "Seeded recipe",
        ingredients: ["80g oats", "250g yoghurt"],
        ingredient_items: [
          { id: "ingredient_1", name: "Rolled oats", quantity: "80g", calories: 300, protein_g: 10, carbs_g: 52, fat_g: 5 },
          { id: "ingredient_2", name: "Greek yoghurt", quantity: "250g", calories: 180, protein_g: 24, carbs_g: 8, fat_g: 5 },
        ],
        steps: ["Mix", "Eat"],
        servings: 1,
        total_calories: 480,
        total_protein_g: 34,
        total_carbs_g: 60,
        total_fat_g: 10,
        nutrition_source: "Calculated from verified Australian catalogue ingredients",
      },
    ],
  })

  await page.goto("/Recipes")
  await page.getByRole("button", { name: /edit power oats/i }).click()
  await page.locator('article').filter({ hasText: "Power Oats" }).getByPlaceholder("Recipe name").fill("Power Oats Deluxe")
  await page.getByRole("button", { name: /save changes/i }).click()

  await expect(page.getByRole("heading", { name: "Power Oats Deluxe" })).toBeVisible()
  await expect(page.getByRole("button", { name: /edit power oats deluxe/i })).toBeVisible()
  await expect(page.getByRole("heading", { name: /^Power Oats$/ })).toHaveCount(0)
})

test("progress photos accept a device import and save the new entry", async ({ page }) => {
  await seedOnboardedProfile(page)
  await page.goto("/ProgressPhotos")

  const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAbW8AAAAASUVORK5CYII=", "base64")
  await page.locator('input[type="file"]').setInputFiles({
    name: "front-checkin.png",
    mimeType: "image/png",
    buffer: pngBytes,
  })

  await expect(page.getByText(/photo imported from this device/i)).toBeVisible()
  await page.getByPlaceholder("Label").fill("Front check-in")
  await page.getByRole("button", { name: /add photo/i }).click()

  const savedPhotoCard = page.getByRole("article").filter({ hasText: "Front check-in" }).first()
  await expect(savedPhotoCard).toBeVisible()
})

test("active workout flow starts from suggestion, resumes, and saves cleanly", async ({ page }) => {
  await seedOnboardedProfile(page)
  await page.goto("/Workouts")

  await page.getByRole("button", { name: /start suggested workout/i }).click()
  await expect(page.getByText(/active session/i)).toBeVisible()
  await expect(page.getByRole("link", { name: /resume session/i }).first()).toBeVisible()

  await page.getByRole("link", { name: /resume session/i }).first().click()
  await expect(page).toHaveURL(/\/workouts\/log$/)
  await expect(page.getByText(/active session loaded/i)).toBeVisible()

  await page.getByPlaceholder("Workout name").fill("E2E Power Session")
  await page.getByPlaceholder("Minutes").fill("52")
  await page.getByRole("button", { name: /save workout/i }).click()

  await expect(page).toHaveURL(/\/Workouts$/)
  await expect(page.getByText(/active session/i)).toHaveCount(0)
  await expect(page.getByText("E2E Power Session")).toBeVisible()
})

test("key routes stay free of console errors during navigation", async ({ page }) => {
  await seedOnboardedProfile(page)
  const issues = []
  page.on("console", (message) => {
    if (message.type() === "error") issues.push(message.text())
  })
  page.on("pageerror", (error) => {
    issues.push(error.message)
  })

  for (const route of ["/", "/Coach", "/Workouts", "/Nutrition", "/Progress", "/Profile", "/Recipes", "/ShoppingList", "/workouts/log", "/nutrition/log"]) {
    await page.goto(route)
    await page.waitForLoadState("networkidle")
  }

  expect(issues).toEqual([])
})
