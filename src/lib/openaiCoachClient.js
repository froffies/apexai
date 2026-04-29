import { getCloudAccessToken } from "@/lib/cloudSync"

function defaultCoachUrl() {
  if (typeof window === "undefined") return "http://127.0.0.1:8787/api/coach"
  const host = window.location.hostname || "127.0.0.1"
  return `${window.location.protocol}//${host}:8787/api/coach`
}

export async function requestOpenAICoach(payload) {
  if (import.meta.env.VITE_OPENAI_COACH_DISABLED === "true") return null

  const endpoint = import.meta.env.VITE_OPENAI_COACH_URL || defaultCoachUrl()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 25000)

  try {
    const token = await getCloudAccessToken()
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `AI coach request failed with ${response.status}`)
    if (!data || typeof data.reply !== "string") throw new Error("AI coach returned an invalid response")
    return data
  } finally {
    window.clearTimeout(timeout)
  }
}
