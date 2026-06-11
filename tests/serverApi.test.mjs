import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import test from "node:test"
import sharp from "sharp"

const cwd = process.cwd()
const serverEntry = path.join(cwd, "server", "openaiCoachServer.mjs")

function randomPort() {
  return crypto.randomInt(10_000, 55_000)
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

async function startFakeOpenAIServer(t, responder) {
  const port = randomPort()
  const server = http.createServer(async (request, response) => {
    let rawBody = ""
    for await (const chunk of request) {
      rawBody += chunk
    }
    await responder(request, response, rawBody)
  })

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve))
  t.after(async () => {
    await new Promise((resolve) => server.close(() => resolve()))
  })
  return `http://127.0.0.1:${port}/v1`
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
      TELEMETRY_SINK: "file",
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
  assert.equal(health.telemetrySink, "file")
  assert.equal(health.openaiVisionConfigured, false)
  assert.equal(health.openaiVisionUsesDedicatedKey, false)
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

  const nzNutritionResponse = await fetch(`http://127.0.0.1:${port}/api/nutrition/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ query: "weetbix" }),
  })
  const nzNutrition = await nzNutritionResponse.json()
  assert.equal(nzNutritionResponse.status, 200)
  assert.equal(nzNutrition.results[0]?.source_type, "nz_curated_catalogue")
  assert.match(String(nzNutrition.results[0]?.name || ""), /weet/i)

  const auNutritionResponse = await fetch(`http://127.0.0.1:${port}/api/nutrition/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ query: "light milk" }),
  })
  const auNutrition = await auNutritionResponse.json()
  assert.equal(auNutritionResponse.status, 200)
  assert.equal(auNutrition.results[0]?.source_type, "curated_au_catalogue")
  assert.match(String(auNutrition.results[0]?.name || ""), /milk/i)

  const teaResponse = await fetch(`http://127.0.0.1:${port}/api/nutrition/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ query: "tea" }),
  })
  const teaResults = await teaResponse.json()
  assert.equal(teaResponse.status, 200)
  assert.match(String(teaResults.results[0]?.name || ""), /tea/i)
  assert.doesNotMatch(String(teaResults.results[0]?.name || ""), /steak/i)

  const barramundiResponse = await fetch(`http://127.0.0.1:${port}/api/nutrition/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ query: "barramundi fillet" }),
  })
  const barramundiResults = await barramundiResponse.json()
  assert.equal(barramundiResponse.status, 200)
  assert.match(String(barramundiResults.results[0]?.name || ""), /barramundi fillet/i)
  assert.equal(barramundiResults.results[0]?.source_type, "estimated_internal_profile")
  assert.match(String(barramundiResults.results[0]?.source || ""), /deterministic food-class estimate/i)

  const nutritionPhotoResponse = await fetch(`http://127.0.0.1:${port}/api/nutrition/analyze-photo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ imageDataUrl: "data:image/png;base64,aGVsbG8=" }),
  })
  const nutritionPhoto = await nutritionPhotoResponse.json()
  assert.equal(nutritionPhotoResponse.status, 503)
  assert.match(nutritionPhoto.error, /photo analysis is unavailable right now/i)

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
  assert.equal(telemetry.sink, "file")
  assert.equal(telemetry.preferredSink, "file")
  assert.equal(telemetry.fallbackReason, null)
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
  assert.equal(coachResponse.status, 200)
  assert.equal(coach.actions?.length || 0, 0)
  assert.match(coach.reply, /tell me what happened today|help you sort the next move/i)

  assert.match(output, /ApexAI OpenAI coach server listening/i)
})

test("telemetry auto mode falls back to file when Supabase persistence is unavailable", async (t) => {
  const port = randomPort()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apexai-server-telemetry-auto-"))
  const telemetryFile = path.join(tempDir, "telemetry.ndjson")
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      TELEMETRY_SINK: "supabase_auto",
      TELEMETRY_LOG_FILE: telemetryFile,
      OPENAI_API_KEY: "",
      SUPABASE_URL: "",
      SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
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
  assert.equal(health.telemetrySink, "supabase_auto")
  assert.equal(health.telemetryTableName, "telemetry_events")

  const telemetryResponse = await fetch(`http://127.0.0.1:${port}/api/telemetry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ type: "auto_fallback_event", level: "info", payload: { scope: "server-test" } }),
  })
  const telemetry = await telemetryResponse.json()
  assert.equal(telemetryResponse.status, 202)
  assert.equal(telemetry.accepted, true)
  assert.equal(telemetry.sink, "file")
  assert.equal(telemetry.preferredSink, "supabase_table")
  assert.match(String(telemetry.fallbackReason || ""), /missing_user_or_admin|unavailable/i)
  const telemetryContent = await fs.readFile(telemetryFile, "utf8")
  assert.match(telemetryContent, /auto_fallback_event/)
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

test("coach falls back to deterministic candidate persistence when the upstream AI call fails", async (t) => {
  const port = randomPort()
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: "http://127.0.0.1:9/v1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  t.after(async () => {
    serverProcess.kill()
  })

  await waitForHealth(port)

  const firstResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      message: "i had chips",
      recentMessages: [],
      meals: [],
      workouts: [],
      workoutSets: [],
      mealSession: {},
      workoutSession: {},
    }),
  })
  const firstCoach = await firstResponse.json()
  assert.equal(firstResponse.status, 200)
  assert.equal(firstCoach.actions?.[0]?.type, "clarify")
  assert.match(firstCoach.reply || "", /how much|how many/i)

  const secondResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      message: "1 bowl",
      recentMessages: [
        { role: "user", content: "i had chips" },
        { role: "assistant", content: firstCoach.reply || "" },
      ],
      meals: [],
      workouts: [],
      workoutSets: [],
      mealSession: firstCoach.meal_session || {},
      workoutSession: firstCoach.workout_session || {},
    }),
  })
  const secondCoach = await secondResponse.json()
  assert.equal(secondResponse.status, 200)
  assert.equal(secondCoach.actions?.[0]?.type, "log_meal")
  assert.match(secondCoach.actions?.[0]?.food_name || "", /1 bowl chips/i)
})

test("coach upstream AI failure keeps a ready workout save alongside a meal clarification in mixed threads", async (t) => {
  const port = randomPort()
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: "http://127.0.0.1:9/v1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  t.after(async () => {
    serverProcess.kill()
  })

  await waitForHealth(port)

  const firstResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      message: "i had milk and eggs and did a pushup",
      recentMessages: [],
      meals: [],
      workouts: [],
      workoutSets: [],
      mealSession: {},
      workoutSession: {},
    }),
  })
  const firstCoach = await firstResponse.json()
  assert.equal(firstResponse.status, 200)
  assert.equal(firstCoach.actions?.some((action) => action.type === "log_workout"), true)
  assert.equal(firstCoach.actions?.some((action) => action.type === "clarify"), true)
  assert.match(firstCoach.reply || "", /saved to workouts/i)
  assert.match(firstCoach.reply || "", /how much milk/i)

  const secondResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      message: "18 eggs one pushup also milk",
      recentMessages: [
        { role: "user", content: "i had milk and eggs and did a pushup" },
        { role: "assistant", content: firstCoach.reply || "" },
      ],
      meals: [],
      workouts: [],
      workoutSets: [],
      mealSession: firstCoach.meal_session || {},
      workoutSession: firstCoach.workout_session || {},
    }),
  })
  const secondCoach = await secondResponse.json()
  assert.equal(secondResponse.status, 200)
  assert.equal(secondCoach.actions?.some((action) => action.type === "log_workout"), true)
  assert.equal(secondCoach.actions?.some((action) => action.type === "clarify"), true)
  assert.match(secondCoach.reply || "", /saved to workouts/i)
  assert.match(secondCoach.reply || "", /how much milk/i)
})

test("coach falls back to an already-logged reply when the upstream AI call fails on a repeated meal", async (t) => {
  const port = randomPort()
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: "http://127.0.0.1:9/v1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  t.after(async () => {
    serverProcess.kill()
  })

  await waitForHealth(port)

  const firstResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      message: "i had 2 tofu",
      recentMessages: [],
      meals: [],
      workouts: [],
      workoutSets: [],
      mealSession: {},
      workoutSession: {},
    }),
  })
  const firstCoach = await firstResponse.json()
  assert.equal(firstResponse.status, 200)
  assert.equal(firstCoach.actions?.[0]?.type, "log_meal")
  assert.match(firstCoach.reply || "", /saved to today'?s nutrition|logged/i)

  const secondResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      message: "i had 2 tofu",
      recentMessages: [
        { role: "user", content: "i had 2 tofu" },
        { role: "assistant", content: firstCoach.reply || "" },
      ],
      meals: [
        {
          id: "meal_18",
          food_name: "2 tofu",
          calories: 240,
          protein: 20,
          carbs: 6,
          fat: 14,
          logged_at: new Date().toISOString(),
        },
      ],
      workouts: [],
      workoutSets: [],
      mealSession: {
        ...(firstCoach.meal_session || {}),
        active: false,
        readyToLog: false,
        persisted: true,
        persistedMealId: "meal_18",
        persistedSummary: "2 tofu",
        summary: "2 tofu",
      },
      workoutSession: firstCoach.workout_session || {},
    }),
  })
  const secondCoach = await secondResponse.json()
  assert.equal(secondResponse.status, 200)
  assert.equal(secondCoach.actions?.length || 0, 0)
  assert.match(secondCoach.reply || "", /already saved|already logged|already saved .*today'?s nutrition/i)
  assert.doesNotMatch(secondCoach.reply || "", /tell me what happened today/i)
})

test("deterministic coach route will not persist orphan numeric entities when a quantity clarification is still unresolved", async (t) => {
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
      message: "egg",
      recentMessages: [
        { role: "user", content: "i had egg and cake" },
        { role: "assistant", content: "How many eggs did you have?" },
      ],
      mealSession: {
        active: true,
        mealConversation: true,
        readyToLog: false,
        clarificationAttempts: 1,
        clarificationCounts: { "egg:quantity": 1 },
        summary: "",
        clarifyQuestion: "How many eggs did you have?",
        pendingClarification: {
          type: "quantity",
          targetReference: "egg",
          targetBaseName: "egg",
          targetLabel: "Eggs",
          expectedValueType: "number",
        },
        items: [
          {
            base_name: "egg",
            label: "Eggs",
            category: "food",
            quantity: null,
            preparation: [],
            exclusions: [],
            attached_to: null,
            relation: null,
          },
          {
            base_name: "cake",
            label: "Cake",
            category: "food",
            quantity: null,
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
  assert.equal(Array.isArray(coach.actions), true)
  assert.equal(coach.actions.some((action) => action?.type === "log_meal" || action?.type === "update_meal_log"), false)
  assert.equal(coach.actions.some((action) => action?.type === "clarify"), true)
  assert.equal(coach.reply, "I'm asking how many eggs you had.")
})

test("deterministic coach route answers daily nutrition totals and target checks from coach context", async (t) => {
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

  const basePayload = {
    profile: {
      daily_calories: 2200,
      protein_g: 180,
      carbs_g: 200,
      fat_g: 70,
    },
    coachContext: {
      today: "2026-05-17",
      profile: {
        daily_calories: 2200,
        protein_g: 180,
        carbs_g: 200,
        fat_g: 70,
      },
      nutrition_today: {
        calories_logged: 412,
        protein_g_logged: 44,
        carbs_g_logged: 0,
        fat_g_logged: 26,
        calories_remaining: 1788,
        protein_g_remaining: 136,
        carbs_g_remaining: 200,
        fat_g_remaining: 44,
      },
    },
    meals: [
      {
        id: "meal_live_test",
        date: "2026-05-17",
        meal_type: "lunch",
        food_name: "200g salmon",
        quantity: "200g",
        calories: 412,
        protein_g: 44,
        carbs_g: 0,
        fat_g: 26,
      },
    ],
  }

  const caloriesResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      ...basePayload,
      message: "whats my total calories so far today",
    }),
  })
  const caloriesCoach = await caloriesResponse.json()
  assert.equal(caloriesResponse.status, 200)
  assert.equal(caloriesCoach.actions?.length || 0, 0)
  assert.match(caloriesCoach.reply, /412 kcal/i)
  assert.match(caloriesCoach.reply, /1788 kcal/i)
  assert.doesNotMatch(caloriesCoach.reply, /\blogged\b/i)

  const fatResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      ...basePayload,
      message: "am i over my fat target",
    }),
  })
  const fatCoach = await fatResponse.json()
  assert.equal(fatResponse.status, 200)
  assert.equal(fatCoach.actions?.length || 0, 0)
  assert.match(fatCoach.reply, /26g fat/i)
  assert.match(fatCoach.reply, /44g fat/i)
  assert.doesNotMatch(fatCoach.reply, /\b(saved|logged|tracked)\b/i)
})

test("deterministic coach logging can emit separate breakfast and lunch meal actions when OpenAI is unavailable", async (t) => {
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
      message: "breakfast was 2 eggs and 1 slice toast, lunch was 200g steak and 1 cup rice",
    }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 200)
  assert.equal(coach.actions?.length, 2)
  assert.equal(coach.actions?.[0]?.type, "log_meal")
  assert.equal(coach.actions?.[0]?.meal_type, "breakfast")
  assert.equal(coach.actions?.[0]?.food_name, "2 eggs, plus 1 slice toast")
  assert.equal(coach.actions?.[1]?.meal_type, "lunch")
  assert.equal(coach.actions?.[1]?.food_name, "200g steak, plus 1 cup rice")
})

test("deterministic coach logging handles grouped remainder preparations without corrupting the meal", async (t) => {
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
      message: "I had 500g chicken total, 300g grilled, the rest fried in 20g olive oil",
    }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 200)
  assert.equal(coach.actions?.[0]?.type, "log_meal")
  assert.equal(coach.actions?.[0]?.food_name, "300g grilled chicken, plus 200g fried chicken cooked in 20g olive oil")
  assert.ok(Number(coach.actions?.[0]?.protein_g) > 80)
  assert.ok(Number(coach.actions?.[0]?.fat_g) > 10)
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
  assert.match(coach.reply || "", /Updated today's nutrition entry for 18 fried eggs cooked in 100g salted butter, plus 250ml Earl Grey tea with no milk and no sugar\./)
  assert.match(coach.reply || "", /verified/i)
  assert.equal(coach.actions?.[0]?.type, "update_meal_log")
  assert.equal(coach.actions?.[0]?.meal_id, "meal_fix_live")
  assert.ok(!coach.workout_session || !coach.workout_session.clarifyQuestion)
})

test("ai-assisted coach recovers a ready meal correction when the model replies with a stale workout message", async (t) => {
  const fakeOpenAIBaseUrl = await startFakeOpenAIServer(t, async (_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({
      id: "chatcmpl_recover_meal",
      object: "chat.completion",
      created: 1,
      model: "gpt-4o-mini",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify({
              reply: "I already saved Pushups in Workouts. If you want to change it, tell me what to update.",
              actions: [],
              warnings: [],
            }),
          },
        },
      ],
    }))
  })

  const port = randomPort()
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: fakeOpenAIBaseUrl,
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
        active: false,
        workoutConversation: true,
        readyToLog: false,
        persisted: true,
        persistedWorkoutId: "workout_pushups",
        persistedSummary: "Pushups for 1 set of 3",
        summary: "Pushups for 1 set of 3",
        exercise_name: "Pushups",
        workout_type: "Pushups",
        muscle_group: "full_body",
        sets: 1,
        reps: 3,
        weight_kg: 0,
      },
    }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 200)
  assert.equal(coach.actions?.[0]?.type, "update_meal_log")
  assert.equal(coach.actions?.[0]?.meal_id, "meal_fix_live")
  assert.match(coach.reply, /updated today's nutrition/i)
  assert.doesNotMatch(coach.reply, /already saved .*pushups/i)
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

test("deterministic coach logging keeps separate quantified foods and subject-specific additions mapped correctly when OpenAI is unavailable", async (t) => {
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
      message: "the steak had butter",
      recentMessages: [
        { role: "user", content: "I had 300g steak" },
        { role: "assistant", content: "Anything else with it?" },
        { role: "user", content: "and 2 eggs" },
      ],
      mealSession: {
        active: true,
        mealConversation: true,
        readyToLog: true,
        wantsLogging: true,
        clarificationAttempts: 0,
        clarificationCounts: {},
        summary: "300g steak, plus 2 eggs",
        clarifyQuestion: "",
        items: [
          {
            base_name: "steak",
            label: "Steak",
            category: "food",
            quantity: { amount: 300, unit: "g", text: "300g" },
            preparation: [],
            exclusions: [],
            attached_to: null,
            relation: null,
          },
          {
            base_name: "egg",
            label: "Eggs",
            category: "food",
            quantity: { amount: 2, unit: "egg", text: "2 eggs" },
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
  assert.equal(coach.actions?.[0]?.type, "log_meal")
  assert.equal(coach.actions?.[0]?.food_name, "300g steak with butter, plus 2 eggs")
  assert.ok(Number(coach.actions?.[0]?.protein_g) > 0)
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

test("coach food macro questions fall back to deterministic food answers when OpenAI is unreachable", async (t) => {
  const port = randomPort()
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: "http://127.0.0.1:9/v1",
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
      message: "whats the macros for a standard serve of caesar salad?",
    }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 200)
  assert.equal(coach.actions?.length || 0, 0)
  assert.match(coach.reply, /caesar salad/i)
  assert.match(coach.reply, /360 kcal/i)
  assert.doesNotMatch(coach.reply, /couldn't reach the live coach/i)

  const barramundiCoachResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      message: "whats the macros for barramundi fillet?",
    }),
  })
  const barramundiCoach = await barramundiCoachResponse.json()
  assert.equal(barramundiCoachResponse.status, 200)
  assert.equal(barramundiCoach.actions?.length || 0, 0)
  assert.match(barramundiCoach.reply, /barramundi fillet/i)
  assert.match(barramundiCoach.reply, /128 kcal/i)
  assert.match(barramundiCoach.reply, /deterministic fallback estimate/i)
})

test("deterministic coach can combine a clarified meal and a remembered workout from the same mixed thread", async (t) => {
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

  const firstResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      message: "i had eggs and did 4 pushups",
      mealSession: {},
      workoutSession: {},
    }),
  })
  const firstCoach = await firstResponse.json()
  assert.equal(firstResponse.status, 200)
  assert.equal(firstCoach.actions?.[0]?.type, "clarify")
  assert.match(firstCoach.reply, /how many eggs/i)
  assert.ok(firstCoach.workout_session)
  assert.equal(firstCoach.workout_session.readyToLog, true)
  assert.equal(firstCoach.workout_session.exercise_name, "Pushups")
  assert.equal(firstCoach.workout_session.reps, 4)

  const secondResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      message: "18",
      recentMessages: [
        { role: "user", content: "i had eggs and did 4 pushups" },
        { role: "assistant", content: "How many eggs did you have?" },
      ],
      mealSession: firstCoach.meal_session,
      workoutSession: firstCoach.workout_session,
    }),
  })
  const secondCoach = await secondResponse.json()
  assert.equal(secondResponse.status, 200)
  assert.equal(Array.isArray(secondCoach.actions), true)
  assert.equal(secondCoach.actions.length, 2)
  assert.equal(secondCoach.actions[0]?.type, "log_meal")
  assert.equal(secondCoach.actions[0]?.food_name, "18 eggs")
  assert.equal(secondCoach.actions[1]?.type, "log_workout")
  assert.equal(secondCoach.actions[1]?.exercise_name, "Pushups")
  assert.equal(secondCoach.actions[1]?.reps, 4)
  assert.match(secondCoach.reply, /saved to today'?s nutrition/i)
  assert.match(secondCoach.reply, /saved to workouts/i)
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

test("deterministic coach binds decimal clarification replies, ignores frustration text, and deletes the saved meal on request", async (t) => {
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

  const history = []

  async function send(message, extra = {}) {
    const response = await fetch(`http://127.0.0.1:${port}/api/coach`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:5173",
      },
      body: JSON.stringify({
        message,
        recentMessages: history,
        ...extra,
      }),
    })
    const coach = await response.json()
    history.push({ role: "user", content: message })
    history.push({ role: "assistant", content: coach.reply })
    return { response, coach }
  }

  const first = await send("i had pie and egg and milk today")
  assert.equal(first.response.status, 200)
  assert.equal(first.coach.reply, "How many eggs did you have?")
  assert.equal(first.coach.actions?.[0]?.type, "clarify")

  const second = await send("19.2", { mealSession: first.coach.meal_session })
  assert.equal(second.response.status, 200)
  assert.equal(second.coach.reply, "How much milk did you have?")
  assert.equal(second.coach.actions?.[0]?.type, "clarify")
  assert.equal(second.coach.meal_session?.pendingClarification?.targetBaseName, "milk")
  assert.match(second.coach.meal_session?.summary || "", /19\.2 eggs/i)

  const third = await send("eggs, you asked how many eggs and I gave you a number, why can't you understand?", {
    mealSession: second.coach.meal_session,
  })
  assert.equal(third.response.status, 200)
  assert.match(third.coach.reply, /how much milk/i)
  assert.equal(third.coach.actions?.[0]?.type, "clarify")
  assert.equal(third.coach.meal_session?.pendingClarification?.targetBaseName, "milk")
  assert.equal(
    third.coach.meal_session?.items?.some((item) => /you|asked|understand|number/i.test(`${item.base_name} ${item.label}`)),
    false
  )

  const fourth = await send("500ml", { mealSession: third.coach.meal_session })
  assert.equal(fourth.response.status, 200)
  assert.equal(fourth.coach.actions?.[0]?.type, "log_meal")
  assert.equal(fourth.coach.actions?.[0]?.food_name, "1 serve pie, plus 19.2 eggs, plus 500ml milk")
  assert.ok(Number(fourth.coach.actions?.[0]?.protein_g) > 0)
  assert.ok(Number(fourth.coach.actions?.[0]?.calories) > 0)

  const persistedMealSession = {
    ...fourth.coach.meal_session,
    active: false,
    readyToLog: false,
    persisted: true,
    persistedMealId: "meal_delete_live",
    persistedSummary: fourth.coach.actions?.[0]?.food_name,
    persistedAt: "2026-05-11T00:00:00.000Z",
    deleteRequested: false,
    alreadyLogged: false,
  }

  const fifth = await send("no thats wrong delete it", { mealSession: persistedMealSession })
  assert.equal(fifth.response.status, 200)
  assert.equal(fifth.coach.actions?.[0]?.type, "delete_meal_log")
  assert.equal(fifth.coach.actions?.[0]?.meal_id, "meal_delete_live")
  assert.match(fifth.coach.reply, /removed .*today's nutrition log/i)
})

test("deterministic coach keeps a new explicit meal isolated, finishes missing quantities cleanly, and treats persisted item changes as updates", async (t) => {
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

  const history = []

  async function send(message, extra = {}) {
    const response = await fetch(`http://127.0.0.1:${port}/api/coach`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:5173",
      },
      body: JSON.stringify({
        message,
        recentMessages: history,
        ...extra,
      }),
    })
    const coach = await response.json()
    history.push({ role: "user", content: message })
    history.push({ role: "assistant", content: coach.reply })
    return { response, coach }
  }

  const first = await send("i had egg")
  assert.equal(first.coach.actions?.[0]?.type, "clarify")

  const second = await send("i had 18 fried eggs and 14 hard boiled", { mealSession: first.coach.meal_session })
  assert.equal(second.coach.actions?.[0]?.type, "clarify")
  assert.match(second.coach.reply, /fried eggs cooked in/i)

  const third = await send("120g of butter", { mealSession: second.coach.meal_session })
  assert.equal(third.coach.actions?.[0]?.type, "log_meal")
  assert.equal(third.coach.actions?.[0]?.food_name, "18 fried eggs cooked in 120g butter, plus 14 hard boiled eggs")

  const persistedFirstMeal = {
    ...third.coach.meal_session,
    active: false,
    readyToLog: false,
    persisted: true,
    persistedMealId: "meal_first_live",
    persistedSummary: third.coach.actions?.[0]?.food_name,
    persistedAt: "2026-05-13T00:00:00.000Z",
    deleteRequested: false,
    alreadyLogged: false,
  }

  const fourth = await send("i had milk and steak", { mealSession: persistedFirstMeal })
  assert.equal(fourth.coach.actions?.[0]?.type, "clarify")
  assert.match(fourth.coach.reply, /how much milk/i)
  assert.doesNotMatch(fourth.coach.meal_session?.summary || "", /fried eggs|hard boiled eggs|butter/i)

  const fifth = await send("970ml", { mealSession: fourth.coach.meal_session })
  assert.equal(fifth.coach.actions?.[0]?.type, "log_meal")
  assert.equal(fifth.coach.actions?.[0]?.food_name, "970ml milk, plus 1 serve steak")
  assert.equal(fifth.coach.meal_session?.summary, "970ml milk, plus 1 serve steak")

  const persistedSecondMeal = {
    ...fifth.coach.meal_session,
    active: false,
    readyToLog: false,
    persisted: true,
    persistedMealId: "meal_second_live",
    persistedSummary: fifth.coach.actions?.[0]?.food_name,
    persistedAt: "2026-05-13T00:05:00.000Z",
    deleteRequested: false,
    alreadyLogged: false,
  }

  const sixth = await send("but i had 3 steaks", { mealSession: persistedSecondMeal })
  assert.equal(sixth.coach.actions?.[0]?.type, "update_meal_log")
  assert.equal(sixth.coach.actions?.[0]?.food_name, "970ml milk, plus 3 steaks")

  const persistedUpdatedMeal = {
    ...sixth.coach.meal_session,
    active: false,
    readyToLog: false,
    persisted: true,
    persistedMealId: "meal_second_live",
    persistedSummary: sixth.coach.actions?.[0]?.food_name,
    persistedAt: "2026-05-13T00:06:00.000Z",
    deleteRequested: false,
    alreadyLogged: false,
  }

  const seventh = await send("update the steak to 350g rump", { mealSession: persistedUpdatedMeal })
  assert.equal(seventh.coach.actions?.[0]?.type, "update_meal_log")
  assert.equal(seventh.coach.actions?.[0]?.meal_id, "meal_second_live")
  assert.equal(seventh.coach.actions?.[0]?.food_name, "970ml milk, plus 350g rump")

  const eighth = await send("remove 1 serve steak", { mealSession: persistedSecondMeal })
  assert.equal(eighth.coach.actions?.[0]?.type, "update_meal_log")
  assert.equal(eighth.coach.actions?.[0]?.meal_id, "meal_second_live")
  assert.equal(eighth.coach.actions?.[0]?.food_name, "970ml milk")
})

test("deterministic coach routes workout-only turns to workouts even after a failed general log query", async (t) => {
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
      message: "i did 14 pushups",
      recentMessages: [
        { role: "user", content: "whats in todays log" },
        { role: "assistant", content: "I couldn't reach the live coach just now, so I left your data alone. Please retry in a moment." },
      ],
      mealSession: {},
      workoutSession: {},
    }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 200)
  assert.equal(coach.actions?.[0]?.type, "log_workout")
  assert.equal(coach.actions?.[0]?.exercise_name, "Pushups")
  assert.equal(coach.actions?.[0]?.reps, 14)
  assert.equal(Array.isArray(coach.meal_session?.items) ? coach.meal_session.items.length : 0, 0)
})

test("deterministic coach does not treat today's-log queries as meal updates and still routes the next workout turn correctly", async (t) => {
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

  const persistedMealSession = {
    active: false,
    mealConversation: false,
    readyToLog: false,
    persisted: true,
    persistedMealId: "meal_recent",
    persistedSummary: "970ml milk, plus 3 steaks",
    persistedAt: "2026-05-13T00:00:00.000Z",
    summary: "970ml milk, plus 3 steaks",
    items: [
      { base_name: "milk", label: "Milk", category: "drink", quantity: { amount: 970, unit: "ml", text: "970ml", modifier: "" }, preparation: [], exclusions: [], attached_to: null, relation: null },
      { base_name: "steak", label: "Steaks", category: "food", quantity: { amount: 3, unit: "steak", text: "3 steaks", modifier: "" }, preparation: [], exclusions: [], attached_to: null, relation: null },
    ],
  }

  const firstResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      message: "whats in todays log",
      recentMessages: [
        { role: "user", content: "i had milk and steak" },
        { role: "assistant", content: "How much milk did you have?" },
        { role: "user", content: "970ml" },
        { role: "assistant", content: "How much steak did you have?" },
        { role: "user", content: "3 steaks" },
        { role: "assistant", content: "Saved to today's nutrition: 970ml milk, plus 3 steaks." },
      ],
      mealSession: persistedMealSession,
      workoutSession: {},
    }),
  })
  const firstCoach = await firstResponse.json()
  assert.equal(firstResponse.status, 200)
  assert.equal((firstCoach.actions || []).some((action) => action?.type === "log_meal" || action?.type === "update_meal_log"), false)
  assert.equal(Boolean(firstCoach.meal_session?.readyToLog), false)
  assert.equal(String(firstCoach.meal_session?.summary || ""), "")

  const secondResponse = await fetch(`http://127.0.0.1:${port}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      message: "i did 14 pushups",
      recentMessages: [
        { role: "user", content: "i had milk and steak" },
        { role: "assistant", content: "How much milk did you have?" },
        { role: "user", content: "970ml" },
        { role: "assistant", content: "How much steak did you have?" },
        { role: "user", content: "3 steaks" },
        { role: "assistant", content: "Saved to today's nutrition: 970ml milk, plus 3 steaks." },
        { role: "user", content: "whats in todays log" },
        { role: "assistant", content: "I couldn't reach the live coach just now, so I left your data alone. Please retry in a moment." },
      ],
      mealSession: persistedMealSession,
      workoutSession: {},
    }),
  })
  const secondCoach = await secondResponse.json()
  assert.equal(secondResponse.status, 200)
  assert.equal(secondCoach.actions?.[0]?.type, "log_workout")
  assert.equal(secondCoach.actions?.[0]?.exercise_name, "Pushups")
  assert.equal(secondCoach.actions?.[0]?.reps, 14)
  assert.equal(Boolean(secondCoach.meal_session?.readyToLog), false)
  assert.equal(String(secondCoach.meal_session?.summary || ""), "")
})

test("deterministic coach lets a meal refinement outrank stale already-logged workout context", async (t) => {
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
      message: "6 were fried, the rest were scrambled",
      recentMessages: [
        { role: "user", content: "i had eggs and did 4 pushups" },
        { role: "assistant", content: "How many eggs did you have?" },
        { role: "user", content: "18" },
        { role: "assistant", content: "Saved to today's nutrition: 18 eggs. Saved to Workouts: Pushups." },
      ],
      mealSession: {
        active: false,
        mealConversation: true,
        readyToLog: false,
        persisted: true,
        persistedMealId: "meal_1",
        persistedSummary: "18 eggs",
        summary: "18 eggs",
        items: [
          {
            base_name: "egg",
            label: "Eggs",
            category: "food",
            quantity: { amount: 18, unit: "egg", text: "18 eggs" },
            preparation: [],
            exclusions: [],
            attached_to: null,
            relation: null,
          },
        ],
      },
      workoutSession: {
        active: false,
        workoutConversation: true,
        readyToLog: false,
        persisted: true,
        persistedWorkoutId: "workout_1",
        persistedSummary: "Pushups for 1 set of 4",
        summary: "Pushups for 1 set of 4",
        exercise_name: "Pushups",
        workout_type: "Pushups",
        muscle_group: "full_body",
        sets: 1,
        reps: 4,
        weight_kg: 0,
      },
    }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 200)
  assert.equal(coach.actions?.[0]?.type, "clarify")
  assert.match(coach.reply, /what were the fried eggs cooked in/i)
  assert.equal(Boolean(coach.meal_session?.correctionRequested), true)
  assert.doesNotMatch(coach.reply, /already saved .*pushups/i)
})

test("deterministic coach keeps recent clarification context for complaint turns when a meal session is already active", async (t) => {
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
      message: "you asked and i gave you a number",
      recentMessages: [
        { role: "user", content: "i had egg and pie and tea today" },
        { role: "assistant", content: "How many eggs did you have?" },
        { role: "user", content: "2.7" },
        { role: "assistant", content: "How much tea did you have?" },
      ],
      mealSession: {
        active: true,
        mealConversation: true,
        readyToLog: false,
        wantsLogging: true,
        clarificationAttempts: 1,
        clarificationCounts: { "egg:quantity": 1 },
        summary: "2.7 eggs, plus 1 serve pie, plus tea",
        clarifyQuestion: "How much tea did you have?",
        items: [
          {
            base_name: "egg",
            label: "Eggs",
            category: "food",
            quantity: { amount: 2.7, unit: "egg", text: "2.7 eggs" },
            preparation: [],
            exclusions: [],
            attached_to: null,
            relation: null,
          },
          {
            base_name: "pie",
            label: "Pie",
            category: "food",
            quantity: { amount: 1, unit: "serve", text: "1 serve" },
            preparation: [],
            exclusions: [],
            attached_to: null,
            relation: null,
          },
          {
            base_name: "tea",
            label: "Tea",
            category: "drink",
            quantity: null,
            preparation: [],
            exclusions: [],
            attached_to: null,
            relation: null,
          },
        ],
        pendingClarification: {
          type: "quantity",
          targetReference: "tea",
          targetBaseName: "tea",
          targetLabel: "Tea",
          expectedValueType: "number",
        },
      },
    }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 200)
  assert.equal(coach.actions?.[0]?.type, "clarify")
  assert.match(coach.reply, /how much tea/i)
  assert.equal(coach.meal_session?.pendingClarification?.targetBaseName, "tea")
})

test("deterministic coach deletes the saved workout on request", async (t) => {
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
      message: "delete it",
      recentMessages: [
        { role: "user", content: "bench press" },
        { role: "assistant", content: "How many sets did you do?" },
        { role: "user", content: "4 sets" },
        { role: "assistant", content: "How many reps?" },
        { role: "user", content: "8 reps" },
        { role: "assistant", content: "What weight did you use?" },
        { role: "user", content: "80kg" },
        { role: "assistant", content: "Saved to Workouts: Bench Press." },
      ],
      workoutSession: {
        active: false,
        workoutConversation: true,
        wantsLogging: true,
        readyToLog: false,
        clarifyQuestion: "",
        persisted: true,
        persistedWorkoutId: "workout_delete_live",
        persistedSummary: "Bench Press",
        persistedAt: "2026-05-05T00:00:00.000Z",
        exercise_name: "Bench Press",
        workout_type: "Bench Press",
        muscle_group: "full_body",
        sets: 4,
        reps: 8,
        weight_kg: 80,
        duration_seconds: 0,
        distance_km: 0,
        alreadyLogged: false,
        correctionRequested: false,
        deleteRequested: false,
      },
    }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 200)
  assert.equal(coach.actions?.[0]?.type, "delete_workout_log")
  assert.equal(coach.actions?.[0]?.workout_id, "workout_delete_live")
  assert.match(coach.reply, /removed .*from workouts/i)
})

test("contextless do-not-log turns stay deterministic when the live coach is unavailable", async (t) => {
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
      message: "don't log that",
      recentMessages: [],
    }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 200)
  assert.equal(coach.actions?.length || 0, 0)
  assert.match(coach.reply, /won't save that/i)
  assert.equal(coach.meal_session?.suppressed, true)
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

  const nutritionPhotoResponse = await fetch(`http://127.0.0.1:${port}/api/nutrition/analyze-photo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ imageDataUrl: "data:image/png;base64,aGVsbG8=" }),
  })
  const nutritionPhoto = await nutritionPhotoResponse.json()
  assert.equal(nutritionPhotoResponse.status, 401)
  assert.match(nutritionPhoto.error, /Missing Authorization bearer token/i)
})

test("nutrition photo route returns a structured photo estimate when the vision upstream succeeds", async (t) => {
  const fakeOpenAIBaseUrl = await startFakeOpenAIServer(t, async (_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({
      id: "chatcmpl_photo_test",
      object: "chat.completion",
      created: 1,
      model: "gpt-4o-mini",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify({
              summary: "2 eggs",
              portion: "1 plate",
              overall_confidence: "high",
              needs_clarification: false,
              clarification_question: "",
              assumptions: [],
              items: [
                {
                  name: "eggs",
                  quantity: "2 eggs",
                  category: "food",
                  preparation: "",
                  confidence: "high",
                  notes: "",
                },
              ],
            }),
          },
        },
      ],
    }))
  })

  const port = randomPort()
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: fakeOpenAIBaseUrl,
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  t.after(async () => {
    serverProcess.kill()
  })

  await waitForHealth(port)

  const nutritionPhotoResponse = await fetch(`http://127.0.0.1:${port}/api/nutrition/analyze-photo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ imageDataUrl: "data:image/png;base64,aGVsbG8=" }),
  })
  const nutritionPhoto = await nutritionPhotoResponse.json()
  assert.equal(nutritionPhotoResponse.status, 200)
  assert.equal(nutritionPhoto.nutrition_source_type, "photo_ai_estimate")
  assert.match(String(nutritionPhoto.food_name || ""), /egg/i)
  assert.equal(Array.isArray(nutritionPhoto.identified_items), true)
  assert.ok(nutritionPhoto.identified_items.length > 0)
})

test("nutrition photo route retries transient upstream failures before giving up", async (t) => {
  let attemptCount = 0
  const fakeOpenAIBaseUrl = await startFakeOpenAIServer(t, async (_request, response) => {
    attemptCount += 1
    if (attemptCount < 3) {
      response.writeHead(502, { "Content-Type": "application/json" })
      response.end(JSON.stringify({
        error: {
          message: "Bad gateway",
          type: "server_error",
          code: "bad_gateway",
        },
      }))
      return
    }

    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content: JSON.stringify({
              summary: "1 banana",
              portion: "1 piece",
              overall_confidence: "high",
              needs_clarification: false,
              clarification_question: "",
              assumptions: [],
              items: [
                {
                  name: "banana",
                  quantity: "1 banana",
                  category: "food",
                  preparation: "",
                  confidence: "high",
                  notes: "",
                },
              ],
            }),
          },
        },
      ],
    }))
  })

  const port = randomPort()
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: fakeOpenAIBaseUrl,
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  t.after(async () => {
    serverProcess.kill()
  })

  await waitForHealth(port)

  const nutritionPhotoResponse = await fetch(`http://127.0.0.1:${port}/api/nutrition/analyze-photo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ imageDataUrl: "data:image/png;base64,aGVsbG8=" }),
  })
  const nutritionPhoto = await nutritionPhotoResponse.json()
  assert.equal(nutritionPhotoResponse.status, 200)
  assert.equal(attemptCount, 3)
  assert.equal(nutritionPhoto.has_trusted_macros, true)
  assert.equal(Number(nutritionPhoto.calories), 105)
})

test("nutrition photo route accepts large image payloads and normalizes them before the vision request", async (t) => {
  let upstreamImageUrlLength = 0
  const fakeOpenAIBaseUrl = await startFakeOpenAIServer(t, async (_request, response, rawBody) => {
    const requestBody = JSON.parse(rawBody || "{}")
    upstreamImageUrlLength = String(
      requestBody?.messages?.[1]?.content?.find?.((part) => part?.type === "image_url")?.image_url?.url || ""
    ).length
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({
      id: "chatcmpl_large_photo_test",
      object: "chat.completion",
      created: 1,
      model: "gpt-4o-mini",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify({
              summary: "Pepperoni pizza",
              portion: "1 plate",
              overall_confidence: "high",
              needs_clarification: false,
              clarification_question: "",
              assumptions: [],
              items: [
                {
                  name: "pepperoni pizza",
                  quantity: "2 slices",
                  category: "food",
                  preparation: "",
                  confidence: "high",
                  notes: "",
                },
              ],
            }),
          },
          finish_reason: "stop",
        },
      ],
    }))
  })

  const port = randomPort()
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: fakeOpenAIBaseUrl,
      OPENAI_VISION_API_KEY: "test-vision-key",
      OPENAI_VISION_BASE_URL: fakeOpenAIBaseUrl,
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  t.after(async () => {
    serverProcess.kill()
  })

  await waitForHealth(port)

  const noisyPixels = crypto.randomBytes(1000 * 1000 * 3)
  const largePng = await sharp(noisyPixels, {
    raw: { width: 1000, height: 1000, channels: 3 },
  }).png({ compressionLevel: 0 }).toBuffer()
  const originalDataUrl = `data:image/png;base64,${largePng.toString("base64")}`
  assert.ok(originalDataUrl.length > 1_000_000)

  const nutritionPhotoResponse = await fetch(`http://127.0.0.1:${port}/api/nutrition/analyze-photo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ imageDataUrl: originalDataUrl }),
  })
  const nutritionPhoto = await nutritionPhotoResponse.json()
  assert.equal(nutritionPhotoResponse.status, 200)
  assert.equal(nutritionPhoto.needs_review, false)
  assert.match(String(nutritionPhoto.food_name || ""), /pizza/i)
  assert.ok(upstreamImageUrlLength > 0)
  assert.ok(upstreamImageUrlLength < originalDataUrl.length)
})

test("nutrition photo route surfaces quota exhaustion clearly when the vision upstream is out of credits", async (t) => {
  const fakeOpenAIBaseUrl = await startFakeOpenAIServer(t, async (_request, response) => {
    response.writeHead(429, { "Content-Type": "application/json" })
    response.end(JSON.stringify({
      error: {
        message: "You exceeded your current quota, please check your plan and billing details.",
        type: "insufficient_quota",
        code: "insufficient_quota",
      },
    }))
  })

  const port = randomPort()
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: fakeOpenAIBaseUrl,
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  t.after(async () => {
    serverProcess.kill()
  })

  await waitForHealth(port)

  const nutritionPhotoResponse = await fetch(`http://127.0.0.1:${port}/api/nutrition/analyze-photo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ imageDataUrl: "data:image/png;base64,aGVsbG8=" }),
  })
  const nutritionPhoto = await nutritionPhotoResponse.json()
  assert.equal(nutritionPhotoResponse.status, 503)
  assert.match(String(nutritionPhoto.error || ""), /vision quota is exhausted/i)
})

test("nutrition photo route explains shared vision exhaustion when the deployment has no dedicated vision key", async (t) => {
  const fakeOpenAIBaseUrl = await startFakeOpenAIServer(t, async (_request, response) => {
    response.writeHead(429, { "Content-Type": "application/json" })
    response.end(JSON.stringify({
      error: {
        message: "Rate limit reached for requests per min.",
        type: "requests",
        code: "rate_limit_exceeded",
      },
    }))
  })

  const port = randomPort()
  const serverProcess = spawn(process.execPath, [serverEntry], {
    cwd,
    env: {
      ...process.env,
      OPENAI_COACH_PORT: String(port),
      OPENAI_COACH_REQUIRE_AUTH: "false",
      OPENAI_COACH_CORS_ORIGIN: "http://127.0.0.1:5173",
      OPENFOODFACTS_ENABLED: "false",
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: fakeOpenAIBaseUrl,
      OPENAI_VISION_API_KEY: "",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  t.after(async () => {
    serverProcess.kill()
  })

  await waitForHealth(port)

  const nutritionPhotoResponse = await fetch(`http://127.0.0.1:${port}/api/nutrition/analyze-photo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ imageDataUrl: "data:image/png;base64,aGVsbG8=" }),
  })
  const nutritionPhoto = await nutritionPhotoResponse.json()
  assert.equal(nutritionPhotoResponse.status, 503)
  assert.match(String(nutritionPhoto.error || ""), /shared ai vision capacity is exhausted/i)
})

test("reviewed photo nutrition endpoint recalculates a loggable estimate without OpenAI vision", async (t) => {
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

  const response = await fetch(`http://127.0.0.1:${port}/api/nutrition/review-photo-estimate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      summary: "banana and milk",
      portion: "1 serve",
      mealType: "breakfast",
      items: [
        { name: "banana", quantity: "1 banana", category: "food", confidence: "high" },
        { name: "milk", quantity: "250ml milk", category: "drink", confidence: "high" },
      ],
    }),
  })
  const reviewed = await response.json()
  assert.equal(response.status, 200)
  assert.equal(reviewed.nutrition_source_type, "photo_ai_estimate")
  assert.equal(reviewed.needs_review, false)
  assert.equal(reviewed.can_autofill, true)
  assert.ok(Array.isArray(reviewed.identified_items))
  assert.ok(Array.isArray(reviewed.macro_breakdown))
  assert.ok(Number(reviewed.calories) > 150)
})
