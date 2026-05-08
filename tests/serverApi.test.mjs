import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import test from "node:test"

const cwd = process.cwd()
const serverEntry = path.join(cwd, "server", "openaiCoachServer.mjs")

function randomPort() {
  return 8800 + Math.floor(Math.random() * 500)
}

async function waitForHealth(port, timeoutMs = 15000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      if (response.ok) return
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error("Timed out waiting for local API server to start")
}

async function waitForServerExit(serverProcess, timeoutMs = 50) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    serverProcess.once("exit", (code, signal) => {
      clearTimeout(timer)
      finish({ code, signal })
    })
  })
}

test("local API server exposes health, local nutrition, telemetry, and sanitized coach fallback", async (t) => {
  const port = randomPort()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apexai-server-test-"))
  const telemetryFile = path.join(tempDir, "telemetry.ndjson")
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      TELEMETRY_LOG_FILE: telemetryFile,
      OPENAI_API_KEY: "",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  let output = ""
  serverProcess.stdout.on("data", (chunk) => {
    output += chunk.toString()
  })
  serverProcess.stderr.on("data", (chunk) => {
    output += chunk.toString()
  })

  t.after(async () => {
    serverProcess.kill()
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  try {
    await waitForHealth(port)
  } catch (error) {
    const exit = await waitForServerExit(serverProcess)
    const details = exit
      ? `server exited early (code=${exit.code}, signal=${exit.signal})`
      : "server stayed alive but never became healthy"
    throw new Error(`${error.message}\n${details}\n--- server output ---\n${output || "(no output)"}`)
  }

  const healthResponse = await fetch(`http://127.0.0.1:${port}/health`)
  const health = await healthResponse.json()
  assert.equal(health.ok, true)
  assert.equal(health.authRequired, false)
  assert.match(healthResponse.headers.get("access-control-allow-methods") || "", /GET/)
  assert.equal(healthResponse.headers.get("cache-control"), "no-store")
  assert.equal(healthResponse.headers.get("x-content-type-options"), "nosniff")

  const nutritionResponse = await fetch(`http://127.0.0.1:${port}/api/nutrition/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ query: "oats" }),
  })
  const nutrition = await nutritionResponse.json()
  assert.equal(nutritionResponse.status, 200)
  assert.ok(Array.isArray(nutrition.results))
  assert.ok(nutrition.results.length > 0)

  const telemetryResponse = await fetch(`http://127.0.0.1:${port}/api/telemetry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ type: "test_event", level: "info", payload: { scope: "server-test" } }),
  })
  const telemetry = await telemetryResponse.json()
  assert.equal(telemetryResponse.status, 202)
  assert.equal(telemetry.accepted, true)
  const telemetryContent = await fs.readFile(telemetryFile, "utf8")
  assert.match(telemetryContent, /test_event/)

  const coachResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ message: "hello" }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 503)
  assert.equal(coach.error, "Live coach is unavailable right now.")

  assert.match(output, /ApexAI OpenAI coach server listening/i)
})

test("deterministic coach logging still works when OpenAI is unavailable", async (t) => {
  const port = randomPort()
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      OPENAI_API_KEY: "",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  t.after(async () => {
    serverProcess.kill()
  })

  await waitForHealth(port)

  const coachResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      message: "17 eggs fried in 100g of salted butter",
      mealSession: {
        active: true,
        mealConversation: true,
        readyToLog: true,
        clarificationAttempts: 2,
        clarificationCounts: { "egg:quantity": 1, "egg:cooking_medium": 1 },
        summary: "17 fried eggs cooked in 100g salted butter",
        clarifyQuestion: "",
        items: [
          {
            base_name: "egg",
            label: "Eggs",
            category: "food",
            quantity: { amount: 17, unit: "egg", text: "17 eggs" },
            preparation: ["fried"],
            exclusions: [],
            attached_to: null,
            relation: null,
          },
          {
            base_name: "salted butter",
            label: "Salted Butter",
            category: "ingredient",
            quantity: { amount: 100, unit: "g", text: "100g" },
            preparation: ["salted"],
            exclusions: [],
            attached_to: "egg",
            relation: "cooked_in",
          },
        ],
      },
    }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 200)
  assert.equal(coach.actions?.[0]?.type, "log_meal")
  assert.match(coach.actions?.[0]?.food_name || "", /17 fried eggs cooked in 100g salted butter/i)
  assert.ok(Number(coach.actions?.[0]?.calories) > 1500)
})

test("ready meal corrections outrank stray workout clarifications when OpenAI is unavailable", async (t) => {
  const port = randomPort()
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      OPENAI_API_KEY: "",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  t.after(async () => {
    serverProcess.kill()
  })

  await waitForHealth(port)

  const coachResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      message: "actually it was 18 fried eggs cooked in 100g of salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
      mealSession: {
        active: true,
        mealConversation: true,
        readyToLog: true,
        clarificationAttempts: 8,
        clarificationCounts: { "egg:quantity": 2, "earl grey tea:quantity": 1, "egg:cooking_medium": 5, "tea:additions": 4 },
        summary: "18 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
        clarifyQuestion: "",
        persisted: true,
        persistedMealId: "meal_fix_live",
        persistedSummary: "17 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar",
        correctionRequested: true,
        items: [
          {
            base_name: "egg",
            label: "Eggs",
            category: "food",
            quantity: { amount: 18, unit: "egg", text: "18 eggs" },
            preparation: ["fried"],
            exclusions: [],
            attached_to: null,
            relation: null,
          },
          {
            base_name: "earl grey tea",
            label: "Earl Grey tea",
            category: "drink",
            quantity: { amount: 250, unit: "ml", text: "250ml" },
            preparation: [],
            exclusions: ["no sugar", "no milk"],
            attached_to: null,
            relation: null,
          },
          {
            base_name: "salted butter",
            label: "Salted Butter",
            category: "ingredient",
            quantity: { amount: 100, unit: "g", text: "100g" },
            preparation: ["salted"],
            exclusions: [],
            attached_to: "egg::fried",
            relation: "cooked_in",
          },
        ],
      },
      workoutSession: {
        active: true,
        workoutConversation: true,
        wantsLogging: true,
        readyToLog: false,
        clarifyQuestion: "What exercise or cardio did you do?",
        exercise_name: "",
        workout_type: "",
        muscle_group: "full_body",
        sets: 0,
        reps: 0,
        weight_kg: 0,
        duration_seconds: 0,
        distance_km: 0,
      },
    }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 200)
  assert.equal(coach.reply, "Updated today's nutrition entry for 18 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar.")
  assert.equal(coach.actions?.[0]?.type, "update_meal_log")
  assert.equal(coach.actions?.[0]?.meal_id, "meal_fix_live")
  assert.equal(coach.workout_session?.clarifyQuestion, "What exercise or cardio did you do?")
})

test("additive meal follow-ups update the persisted meal instead of creating a duplicate", async (t) => {
  const port = randomPort()
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      OPENAI_API_KEY: "",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  t.after(async () => {
    serverProcess.kill()
  })

  await waitForHealth(port)

  const coachResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      message: "with gravy",
      recentMessages: [
        { role: "user", content: "i had chips" },
        { role: "assistant", content: "How much chips did you have?" },
        { role: "user", content: "1 bowl" },
        { role: "assistant", content: "Saved to today's nutrition: 1 bowl chips. 180 kcal, 12g protein, 18g carbs, 6g fat." },
      ],
      meals: [
        {
          id: "meal_chips_live",
          date: "2026-05-08",
          meal_type: "snack",
          food_name: "1 bowl chips",
          quantity: "1 meal",
          calories: 180,
          protein_g: 12,
          carbs_g: 18,
          fat_g: 6,
          estimated: true,
          nutrition_source: "Coach estimate from accumulated meal details across chat",
        },
      ],
      mealSession: {
        active: false,
        mealConversation: true,
        readyToLog: false,
        wantsLogging: true,
        clarificationAttempts: 1,
        clarificationCounts: { "chip:quantity": 1 },
        summary: "1 bowl chips",
        clarifyQuestion: "",
        persisted: true,
        persistedMealId: "meal_chips_live",
        persistedSummary: "1 bowl chips",
        items: [
          {
            base_name: "chip",
            label: "Chips",
            category: "food",
            quantity: { amount: 1, unit: "bowl", text: "1 bowl" },
            preparation: [],
            exclusions: [],
            attached_to: null,
            relation: null,
          },
        ],
      },
    }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 200)
  assert.equal(coach.actions?.[0]?.type, "update_meal_log")
  assert.equal(coach.actions?.[0]?.meal_id, "meal_chips_live")
  assert.match(coach.actions?.[0]?.food_name || "", /chips with gravy/i)
})

test("deterministic coach nutrition answers still work when OpenAI is unavailable", async (t) => {
  const port = randomPort()
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      OPENAI_API_KEY: "",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  t.after(async () => {
    serverProcess.kill()
  })

  await waitForHealth(port)

  const coachResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      message: "how many calories is that?",
      mealSession: {
        active: true,
        mealConversation: true,
        readyToLog: true,
        wantsLogging: false,
        answerOnly: true,
        clarificationAttempts: 2,
        clarificationCounts: { "egg:quantity": 1, "egg:cooking_medium": 1 },
        summary: "3 fried eggs cooked in 10g butter, plus 250ml Earl Grey tea with no milk and no sugar",
        clarifyQuestion: "",
        items: [
          {
            base_name: "egg",
            label: "Eggs",
            category: "food",
            quantity: { amount: 3, unit: "egg", text: "3 eggs" },
            preparation: ["fried"],
            exclusions: [],
            attached_to: null,
            relation: null,
          },
          {
            base_name: "butter",
            label: "Butter",
            category: "ingredient",
            quantity: { amount: 10, unit: "g", text: "10g" },
            preparation: [],
            exclusions: [],
            attached_to: "egg::fried",
            relation: "cooked_in",
          },
          {
            base_name: "earl grey tea",
            label: "Earl Grey tea",
            category: "drink",
            quantity: { amount: 250, unit: "ml", text: "250ml" },
            preparation: [],
            exclusions: ["no milk", "no sugar"],
            attached_to: null,
            relation: null,
          },
        ],
      },
    }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 200)
  assert.equal(Array.isArray(coach.actions), true)
  assert.equal(coach.actions.length, 0)
  assert.match(coach.reply, /that comes to about/i)
  assert.match(coach.reply, /if you want it saved, tell me to log it/i)
})

test("deterministic coach repeat-meal logging works when OpenAI is unavailable", async (t) => {
  const port = randomPort()
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      OPENAI_API_KEY: "",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  t.after(async () => {
    serverProcess.kill()
  })

  await waitForHealth(port)

  const coachResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      message: "same as yesterday",
      meals: [
        {
          food_name: "200g chicken, 1 cup rice, and 1 tbsp olive oil",
          meal_type: "lunch",
          quantity: "1 meal",
          calories: 640,
          protein_g: 48,
          carbs_g: 44,
          fat_g: 22,
          estimated: true,
          nutrition_source: "Saved estimate",
        },
      ],
    }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 200)
  assert.equal(coach.actions?.[0]?.type, "log_meal")
  assert.equal(coach.actions?.[0]?.food_name, "200g chicken, 1 cup rice, and 1 tbsp olive oil")
  assert.equal(coach.actions?.[0]?.meal_type, "lunch")
})

test("deterministic coach suppression replies do not persist anything when OpenAI is unavailable", async (t) => {
  const port = randomPort()
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      OPENAI_API_KEY: "",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  t.after(async () => {
    serverProcess.kill()
  })

  await waitForHealth(port)

  const coachResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      message: "don't save that",
      mealSession: {
        active: true,
        mealConversation: true,
        readyToLog: true,
        wantsLogging: true,
        summary: "200g chicken and 1 cup rice",
        items: [
          {
            base_name: "chicken",
            label: "Chicken",
            category: "food",
            quantity: { amount: 200, unit: "g", text: "200g" },
            preparation: [],
            exclusions: [],
            attached_to: null,
            relation: null,
          },
          {
            base_name: "rice",
            label: "Rice",
            category: "food",
            quantity: { amount: 1, unit: "cup", text: "1 cup" },
            preparation: [],
            exclusions: [],
            attached_to: null,
            relation: null,
          },
        ],
      },
    }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 200)
  assert.equal(coach.actions.length, 0)
  assert.equal(coach.reply, "Okay, I won't save that.")
})

test("protected API endpoints require auth when production auth is enabled", async (t) => {
  const port = randomPort()
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "true",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      OPENAI_API_KEY: "",
      NODE_ENV: "production",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "test-anon-key",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  t.after(async () => {
    serverProcess.kill()
  })

  await waitForHealth(port)

  const coachResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ message: "hello" }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 401)
  assert.match(coach.error, /Missing Authorization bearer token/i)

  const nutritionResponse = await fetch(`http://127.0.0.1:${port}/api/nutrition/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ query: "oats" }),
  })
  const nutrition = await nutritionResponse.json()
  assert.equal(nutritionResponse.status, 401)
  assert.match(nutrition.error, /Missing Authorization bearer token/i)
})
