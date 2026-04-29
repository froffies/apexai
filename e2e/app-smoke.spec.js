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

  await expect(page.getByRole("heading", { name: /edit food log/i })).toHaveCount(0)
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

  await expect(page.getByText(/roughly 2,517 calories/i)).toBeVisible()
  await expect(page.getByText(/skipped one meal log/i)).toHaveCount(0)
  await expect(page.getByText(/couldn't save that meal yet/i)).toHaveCount(0)

  await page.goto("/Nutrition")
  const todayMealsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /today's meals/i }) })
  await expect(todayMealsSection.getByText("Eggs fried in butter with rye toast and Vegemite")).toBeVisible()
  await expect(todayMealsSection.getByText(/2517 kcal - 210g protein/i)).toBeVisible()
  await expect(todayMealsSection.getByText(/Coach estimate from user-described ingredients and amounts/i)).toBeVisible()
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
