import { useEffect, useState } from "react"
import { AlertTriangle, Bell, Cloud, Copy, GitMerge, LogOut, Smartphone, Trash2, Zap } from "lucide-react"
import { useAuth } from "@/lib/AuthContext"
import { getCloudSyncState, resolveSyncConflictWithCloud, resolveSyncConflictWithLocal, resolveSyncConflictWithSuggestedMerge, subscribeCloudSync } from "@/lib/cloudSync"
import { clearTelemetry, getTelemetrySnapshot, subscribeTelemetry } from "@/lib/telemetry"
import { hapticTap, isNativeApp, nativeCapabilitySummary, requestNotificationAccess, scheduleDailyCoachNudge, shareText } from "@/lib/nativeIntegrations"

function redactEmail(email) {
  if (!email || !email.includes("@")) return "anonymous"
  const [name, domain] = email.split("@")
  const visibleName = name.length <= 2 ? `${name[0] || ""}*` : `${name.slice(0, 2)}***`
  return `${visibleName}@${domain}`
}

function summarizeConflicts(conflicts) {
  return conflicts.map((conflict) => ({
    key: conflict.key,
    kind: conflict.kind,
    localUpdatedAt: conflict.localUpdatedAt || null,
    cloudUpdatedAt: conflict.cloudUpdatedAt || null,
    localOnlyCount: conflict.localOnlyCount ?? null,
    cloudOnlyCount: conflict.cloudOnlyCount ?? null,
    collisionCount: conflict.collisions?.length ?? null,
    hasSuggestedMerge: Boolean(conflict.suggestedValue),
  }))
}

export default function NativeIntegrationPanel() {
  const { user, cloudConfigured, cloudStatus, localMode, logout, syncNow } = useAuth()
  const [status, setStatus] = useState("")
  const [syncState, setSyncState] = useState(getCloudSyncState())
  const [telemetry, setTelemetry] = useState(getTelemetrySnapshot())

  useEffect(() => subscribeCloudSync(setSyncState), [])
  useEffect(() => subscribeTelemetry(() => setTelemetry(getTelemetrySnapshot())), [])

  const runSync = async () => {
    setStatus("Syncing...")
    try {
      await syncNow()
      setStatus("Cloud sync complete.")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Cloud sync failed.")
    }
  }

  const enableNotifications = async () => {
    const permission = await requestNotificationAccess()
    if (!permission.granted) {
      setStatus(permission.reason)
      return
    }
    const scheduled = await scheduleDailyCoachNudge()
    setStatus(scheduled.scheduled ? "Daily coach nudge scheduled." : scheduled.reason)
  }

  const testHaptics = async () => {
    const ok = await hapticTap()
    setStatus(ok ? "Haptic tap sent." : "Haptics are available in the iPhone build.")
  }

  const copyDiagnostics = async () => {
    const payload = {
      runtime: isNativeApp() ? "native" : "web",
      sync: {
        pending: syncState.pending,
        queuedKeys: syncState.queuedKeys,
        lastError: syncState.lastError,
        lastSyncedAt: syncState.lastSyncedAt,
        conflicts: summarizeConflicts(syncState.conflicts),
      },
      telemetry: {
        errorCount: telemetry.errorCount,
        lastError: telemetry.lastError,
      },
      user: redactEmail(user?.email),
    }
    await shareText("ApexAI diagnostics", JSON.stringify(payload, null, 2))
    setStatus("Diagnostics shared or copied.")
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Account and device</h2>
          <p className="mt-1 text-sm text-slate-500">{user?.email || "Not signed in"} - {localMode ? "local mode" : cloudStatus}</p>
        </div>
        <Smartphone className="text-indigo-600" size={22} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={runSync} disabled={!cloudConfigured || localMode} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50">
          <Cloud size={16} /> Sync now
        </button>
        <button type="button" onClick={enableNotifications} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700">
          <Bell size={16} /> Notifications
        </button>
        <button type="button" onClick={testHaptics} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700">
          <Zap size={16} /> Haptics
        </button>
        <button type="button" onClick={copyDiagnostics} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700">
          <Copy size={16} /> Diagnostics
        </button>
        <button type="button" onClick={() => { clearTelemetry(); setStatus("Telemetry cleared.") }} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700">
          <Trash2 size={16} /> Clear telemetry
        </button>
        <button type="button" onClick={logout} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700">
          <LogOut size={16} /> Sign out
        </button>
      </div>

      <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
        <p>Runtime: {isNativeApp() ? "native iPhone shell" : "web browser"}</p>
        <p className="mt-1">{nativeCapabilitySummary()}</p>
        <p className="mt-1">Pending sync writes: {syncState.pending}</p>
        <p className="mt-1">Queued records: {syncState.queuedKeys.length}</p>
        <p className="mt-1">Sync conflicts: {syncState.conflicts.length}</p>
        <p className="mt-1">Last sync: {syncState.lastSyncedAt ? new Date(syncState.lastSyncedAt).toLocaleString() : "Not yet"}</p>
        {syncState.lastError && <p className="mt-1 text-rose-600">Last sync error: {syncState.lastError}</p>}
        <p className="mt-1">Telemetry errors captured: {telemetry.errorCount}</p>
        {telemetry.lastError && <p className="mt-1 text-rose-600">Last telemetry event: {telemetry.lastError.type}</p>}
      </div>

      {syncState.conflicts.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertTriangle size={16} />
            Sync conflicts need a decision
          </div>
          {syncState.conflicts.map((conflict) => (
            <div key={conflict.key} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="font-semibold text-slate-950">{conflict.key.replace("apexai.", "")}</p>
              <p className="mt-1 text-sm text-slate-600">Cloud updated: {conflict.cloudUpdatedAt ? new Date(conflict.cloudUpdatedAt).toLocaleString() : "Unknown"}</p>
              {conflict.kind === "mergeable_collection" && (
                <div className="mt-2 rounded-lg bg-white p-3 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">Suggested merge available</p>
                  <p className="mt-1">{conflict.localOnlyCount} local-only item(s), {conflict.cloudOnlyCount} cloud-only item(s), {conflict.collisions.length} overlapping edit(s).</p>
                </div>
              )}
              <div className="mt-2 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                <pre className="overflow-auto rounded-lg bg-white p-2">{JSON.stringify(conflict.localValue, null, 2)}</pre>
                <pre className="overflow-auto rounded-lg bg-white p-2">{JSON.stringify(conflict.cloudValue, null, 2)}</pre>
              </div>
              {conflict.suggestedValue && (
                <details className="mt-3 rounded-lg bg-white p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-900">Preview suggested merge</summary>
                  <pre className="mt-2 overflow-auto rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{JSON.stringify(conflict.suggestedValue, null, 2)}</pre>
                </details>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {conflict.suggestedValue && (
                  <button type="button" onClick={() => resolveSyncConflictWithSuggestedMerge(conflict.key)} className="min-h-11 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                    <span className="inline-flex items-center gap-2"><GitMerge size={16} /> Use suggested merge</span>
                  </button>
                )}
                <button type="button" onClick={() => resolveSyncConflictWithLocal(conflict.key)} className="min-h-11 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
                  Keep local
                </button>
                <button type="button" onClick={() => resolveSyncConflictWithCloud(conflict.key)} className="min-h-11 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                  Use cloud
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {telemetry.events.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <AlertTriangle size={16} className={telemetry.errorCount ? "text-rose-600" : "text-slate-400"} />
            Recent telemetry
          </div>
          {telemetry.events.slice(-5).reverse().map((event) => (
            <div key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-950">{event.type}</p>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${event.level === "error" ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-700"}`}>
                  {event.level}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</p>
              <pre className="mt-2 overflow-auto rounded-lg bg-white p-2 text-xs text-slate-600">{JSON.stringify(event.payload, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}
      {status && <p className="mt-3 text-sm font-semibold text-indigo-700">{status}</p>}
    </section>
  )
}
