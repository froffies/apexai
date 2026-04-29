import { getCloudAccessToken } from "@/lib/cloudSync"

function defaultAccountDeleteUrl() {
  const coachUrl = import.meta.env.VITE_OPENAI_COACH_URL || "http://127.0.0.1:8787/api/coach"
  return coachUrl.replace(/\/api\/coach$/, "/api/account/delete")
}

export async function deleteRemoteAccount() {
  const token = await getCloudAccessToken()
  if (!token) throw new Error("Sign in before deleting your account.")

  const response = await fetch(import.meta.env.VITE_ACCOUNT_DELETE_URL || defaultAccountDeleteUrl(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || "Account deletion failed.")
  return data
}
