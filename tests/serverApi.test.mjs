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
    body: JSON.stringify({ message: "Log bench press 80kg for 4 sets of 6" }),
  })
  const coach = await coachResponse.json()
  assert.equal(coachResponse.status, 503)
  assert.equal(coach.error, "Live coach is unavailable right now.")

  assert.match(output, /ApexAI OpenAI coach server listening/i)
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
