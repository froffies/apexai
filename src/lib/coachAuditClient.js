import { getCloudAccessToken } from "@/lib/cloudSync"

const DEFAULT_BETA_ADMIN_EMAILS = ["coach-audit-admin@apexai.app"]

function defaultCoachAuditUrl() {
  const coachUrl = import.meta.env.VITE_OPENAI_COACH_URL || ""
  if (coachUrl) return coachUrl.replace(/\/api\/coach$/, "/api/coach/audit")
  if (typeof window === "undefined") return "http://127.0.0.1:8787/api/coach/audit"
  const host = window.location.hostname || "127.0.0.1"
  return `${window.location.protocol}//${host}:8787/api/coach/audit`
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

export const coachAuditEnabled = import.meta.env.VITE_ENABLE_COACH_AUDIT !== "false"
const adminEmailAllowlist = parseCsv(
  import.meta.env.VITE_COACH_AUDIT_ADMIN_EMAILS
  || DEFAULT_BETA_ADMIN_EMAILS.join(",")
)
const adminIdAllowlist = parseCsv(import.meta.env.VITE_COACH_AUDIT_ADMIN_IDS)
export const coachAuditNotice =
  "Beta testing notice: Coach conversations may be reviewed to improve logging accuracy and app reliability. Don't enter private medical, financial, or highly sensitive information."

export function isCoachAuditAdmin(user) {
  if (!coachAuditEnabled || !user) return false
  const email = String(user.email || "").trim().toLowerCase()
  const id = String(user.id || "").trim().toLowerCase()
  if (adminEmailAllowlist.length && email && adminEmailAllowlist.includes(email)) return true
  if (adminIdAllowlist.length && id && adminIdAllowlist.includes(id)) return true
  return false
}

async function authorizedFetch(url, options = {}) {
  const token = await getCloudAccessToken()
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  return response
}

export async function sendCoachAuditEvent(payload) {
  if (!coachAuditEnabled) return null
  try {
    const response = await authorizedFetch(`${defaultCoachAuditUrl()}/event`, {
      method: "POST",
      body: JSON.stringify(payload),
    })
    return await response.json().catch(() => ({}))
  } catch {
    return null
  }
}

export async function fetchCoachAuditLogs(filters = {}) {
  if (!coachAuditEnabled) return { records: [], summary: null, capabilities: null }
  const url = new URL(defaultCoachAuditUrl())
  for (const [key, value] of Object.entries(filters || {})) {
    if (value === undefined || value === null || value === "") continue
    url.searchParams.set(key, String(value))
  }

  const response = await authorizedFetch(url.toString(), { method: "GET", headers: {} })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || "Coach audit request failed.")
  return data
}

export function buildCoachAuditDebugPrompt(record = {}) {
  const transcript = [...(Array.isArray(record.conversation_window) ? record.conversation_window : []), {
    role: "user",
    content: record.user_message || "",
  }, {
    role: "assistant",
    content: record.assistant_reply || "",
  }]

  return [
    "Fix this generally, not as a one-off patch.",
    "",
    `Route type: ${record.route_type || "unknown"}`,
    `Intent: ${record.intent || "unknown"}`,
    `Persistence status: ${record.persistence_status || "unknown"}`,
    `Flags: ${(record.flags || []).map((flag) => flag.code).join(", ") || "none"}`,
    "",
    "Conversation transcript:",
    ...transcript
      .filter((entry) => entry?.content)
      .map((entry) => `${entry.role}: ${entry.content}`),
    "",
    "State before:",
    JSON.stringify(record.state_before || {}, null, 2),
    "",
    "State after:",
    JSON.stringify(record.state_after || {}, null, 2),
    "",
    "Proposed actions:",
    JSON.stringify(record.actions || [], null, 2),
    "",
    "Persisted actions:",
    JSON.stringify(record.persisted_actions || [], null, 2),
    "",
    "Actual behaviour:",
    record.assistant_reply || "(no assistant reply)",
    "",
    "Expected behaviour if obvious:",
    "Preserve state integrity, avoid fake confirmations, and keep logging deterministic.",
  ].join("\n")
}
