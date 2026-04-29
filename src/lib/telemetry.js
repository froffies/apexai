const storageKey = "apexai.telemetry.buffer"
const maxEvents = 100
const installFlagKey = "__apexaiTelemetryInstalled"
let listeners = []

function safeStringify(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ message: "unserializable payload" })
  }
}

function readTelemetry() {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(window.localStorage.getItem(storageKey) || "[]")
  } catch {
    return []
  }
}

function writeTelemetry(events) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(storageKey, JSON.stringify(events))
  listeners.forEach((listener) => listener(events))
}

async function sendTelemetryEvent(event) {
  if (typeof window === "undefined") return
  const endpoint = import.meta.env.VITE_TELEMETRY_URL
  if (!endpoint) return

  const payload = safeStringify(event)
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([payload], { type: "application/json" }))
      return
    }
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    })
  } catch {
    // Telemetry transport should never break the app.
  }
}

export function recordTelemetry(type, payload = {}, level = "info") {
  const event = {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    level,
    payload,
    created_at: new Date().toISOString(),
  }
  const events = [...readTelemetry(), event].slice(-maxEvents)
  writeTelemetry(events)
  void sendTelemetryEvent(event)
  return event
}

export function getTelemetrySnapshot() {
  const events = readTelemetry()
  return {
    events,
    errorCount: events.filter((event) => event.level === "error").length,
    lastError: [...events].reverse().find((event) => event.level === "error") || null,
  }
}

export function clearTelemetry() {
  writeTelemetry([])
}

export function subscribeTelemetry(listener) {
  listeners.push(listener)
  listener(readTelemetry())
  return () => {
    listeners = listeners.filter((current) => current !== listener)
  }
}

export function installGlobalTelemetry() {
  if (typeof window === "undefined" || window[installFlagKey]) return
  window[installFlagKey] = true

  window.addEventListener("error", (event) => {
    recordTelemetry("window_error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    }, "error")
  })

  window.addEventListener("unhandledrejection", (event) => {
    recordTelemetry("promise_rejection", {
      reason: String(event.reason?.message || event.reason || "Unknown rejection"),
    }, "error")
  })
}

export function trackRoute(pathname) {
  recordTelemetry("route_view", { pathname })
}

export function trackRenderError(error, info) {
  return recordTelemetry("render_error", {
    message: error?.message || "Unknown render error",
    stack: error?.stack || "",
    componentStack: info?.componentStack || "",
  }, "error")
}
