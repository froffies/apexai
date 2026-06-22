import { getCloudAccessToken } from "@/lib/cloudSync"

function defaultCoachUrl() {
  if (typeof window === "undefined") return "http://127.0.0.1:8787/api/coach"
  const host = window.location.hostname || "127.0.0.1"
  return `${window.location.protocol}//${host}:8787/api/coach`
}

function normalizeSessionPayload(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {}
}

function normalizeRecentMessages(value) {
  if (!Array.isArray(value)) return []
  return value
    .slice(-20)
    .map((message) => ({
      role: String(message?.role || "").trim() || "user",
      content: String(message?.content || "").trim(),
    }))
    .filter((message) => message.content)
}

function normalizeRecalledMessages(value) {
  if (!Array.isArray(value)) return []
  return value
    .slice(-8)
    .map((message) => {
      const normalized = {
        role: String(message?.role || "").trim() || "user",
        content: String(message?.content || "").trim(),
      }
      const timestamp = typeof message?.timestamp === "string" ? message.timestamp.trim() : ""
      return timestamp ? { ...normalized, timestamp } : normalized
    })
    .filter((message) => message.content)
}

export async function requestOpenAICoach(payload) {
  if (import.meta.env.VITE_OPENAI_COACH_DISABLED === "true") return null

  const endpoint = import.meta.env.VITE_OPENAI_COACH_URL || defaultCoachUrl()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 25000)
  const normalizedPayload = {
    ...(payload && typeof payload === "object" ? payload : {}),
    ...(payload && Object.prototype.hasOwnProperty.call(payload, "mealSession")
      ? { mealSession: normalizeSessionPayload(payload.mealSession) }
      : {}),
    ...(payload && Object.prototype.hasOwnProperty.call(payload, "workoutSession")
      ? { workoutSession: normalizeSessionPayload(payload.workoutSession) }
      : {}),
    ...(payload && Object.prototype.hasOwnProperty.call(payload, "recentMessages")
      ? { recentMessages: normalizeRecentMessages(payload.recentMessages) }
      : {}),
    ...(payload && Object.prototype.hasOwnProperty.call(payload, "recalledMessages")
      ? { recalledMessages: normalizeRecalledMessages(payload.recalledMessages) }
      : {}),
  }

  try {
    const token = await getCloudAccessToken()
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(normalizedPayload),
      signal: controller.signal,
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = Object.assign(new Error(data.error || `AI coach request failed with ${response.status}`), {
        auditMeta: data.audit_meta || null,
      })
      throw error
    }
    if (!data || typeof data.reply !== "string") {
      const error = Object.assign(new Error("AI coach returned an invalid response"), {
        auditMeta: data.audit_meta || null,
      })
      throw error
    }
    return data
  } finally {
    window.clearTimeout(timeout)
  }
}
