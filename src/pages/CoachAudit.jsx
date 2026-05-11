import { useEffect, useMemo, useState } from "react"
import PageHeader from "@/components/PageHeader"
import SectionCard from "@/components/SectionCard"
import PageNotFound from "@/lib/PageNotFound"
import { buildCoachAuditDebugPrompt, coachAuditEnabled, coachAuditNotice, fetchCoachAuditLogs, isCoachAuditAdmin } from "@/lib/coachAuditClient"
import { useAuth } from "@/lib/AuthContext"

const flagOptions = [
  { value: "", label: "All flags" },
  { value: "clarification_loop", label: "Clarification loop" },
  { value: "user_signalled_repeat", label: "User said they already told Coach" },
  { value: "numeric_food_item", label: "Numeric food item" },
  { value: "fake_unit", label: "Fake unit" },
  { value: "fake_save_blocked", label: "Fake save blocked" },
  { value: "suppression_ignored", label: "Ignored don't log" },
  { value: "orphan_quantity", label: "Orphan quantity" },
  { value: "unresolved_entity_persisted", label: "Unresolved entity persisted" },
  { value: "orphan_workout_metrics", label: "Orphan workout metrics" },
  { value: "possible_duplicate", label: "Possible duplicate" },
  { value: "deterministic_route_missed", label: "Deterministic route missed" },
  { value: "draft_lost", label: "Draft lost after failure" },
  { value: "correction_created_duplicate", label: "Correction created duplicate" },
  { value: "nutrition_question_hijacked", label: "Nutrition question hijacked" },
  { value: "general_chat_hijacked", label: "General chat hijacked" },
  { value: "corrupted_summary", label: "Corrupted summary" },
  { value: "parser_warning", label: "Parser warning" },
  { value: "no_action_when_expected", label: "No action when expected" },
]

function prettyJson(value) {
  return JSON.stringify(value || {}, null, 2)
}

function statCard(label, value, accent = "text-slate-950") {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${accent}`}>{value}</p>
    </div>
  )
}

async function copyText(text) {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textArea = document.createElement("textarea")
  textArea.value = text
  document.body.appendChild(textArea)
  textArea.select()
  document.execCommand("copy")
  textArea.remove()
}

export default function CoachAudit() {
  const { user } = useAuth()
  const [filters, setFilters] = useState({
    limit: "120",
    user: "",
    route_type: "",
    date_from: "",
    date_to: "",
    failed: false,
    warnings: false,
    flag: "",
    search: "",
  })
  const [records, setRecords] = useState([])
  const [summary, setSummary] = useState(null)
  const [selectedId, setSelectedId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [copyState, setCopyState] = useState("")

  const selectedRecord = useMemo(
    () => records.find((record) => record.log_id === selectedId) || records[0] || null,
    [records, selectedId]
  )

  useEffect(() => {
    if (!selectedRecord && records[0]) setSelectedId(records[0].log_id)
  }, [records, selectedRecord])

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const payload = await fetchCoachAuditLogs({
        ...filters,
        failed: filters.failed ? "true" : "",
        warnings: filters.warnings ? "true" : "",
      })
      setRecords(payload.records || [])
      setSummary(payload.summary || null)
      if (payload.records?.[0]) setSelectedId((current) => current || payload.records[0].log_id)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Coach audit failed to load.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!coachAuditEnabled || !isCoachAuditAdmin(user)) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  if (!coachAuditEnabled || !isCoachAuditAdmin(user)) {
    return <PageNotFound />
  }

  const sortedFlagCounts = Object.entries(summary?.by_flag || {}).sort((left, right) => right[1] - left[1]).slice(0, 6)

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Admin"
        title="Coach audit"
        subtitle="Temporary beta-only conversation review for finding parser failures, fake saves, duplicate logs, and confusing Coach behaviour."
      />

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        <p className="font-semibold">Testing-only monitor</p>
        <p className="mt-1">{coachAuditNotice}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCard("Recent logs", summary?.total || records.length || 0)}
        {statCard("Flagged", summary?.flagged || 0, "text-amber-700")}
        {statCard("Failures", summary?.failures || 0, "text-rose-700")}
        {statCard("Duplicate guard", summary?.duplicate_prevention_events || 0, "text-indigo-700")}
      </div>

      <SectionCard
        title="Filters"
        description="Narrow down failures, parser warnings, suspicious saves, or one tester's thread."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">
            User
            <input
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="email or user id"
              value={filters.user}
              onChange={(event) => setFilters((current) => ({ ...current, user: event.target.value }))}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Search text
            <input
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="egg, duplicate, latte..."
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Date from
            <input
              type="date"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={filters.date_from}
              onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Date to
            <input
              type="date"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={filters.date_to}
              onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Route
            <select
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={filters.route_type}
              onChange={(event) => setFilters((current) => ({ ...current, route_type: event.target.value }))}
            >
              <option value="">All routes</option>
              <option value="deterministic">Deterministic</option>
              <option value="ai-assisted">AI-assisted</option>
              <option value="fallback">Fallback</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Flag focus
            <select
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={filters.flag}
              onChange={(event) => setFilters((current) => ({ ...current, flag: event.target.value }))}
            >
              {flagOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Limit
            <input
              type="number"
              min="20"
              max="400"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={filters.limit}
              onChange={(event) => setFilters((current) => ({ ...current, limit: event.target.value }))}
            />
          </label>
          <div className="flex flex-col gap-3 pt-7 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.failed}
                onChange={(event) => setFilters((current) => ({ ...current, failed: event.target.checked }))}
              />
              Failed requests only
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.warnings}
                onChange={(event) => setFilters((current) => ({ ...current, warnings: event.target.checked }))}
              />
              Warnings / flags only
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
          >
            {loading ? "Refreshing..." : "Refresh logs"}
          </button>
          <button
            type="button"
            onClick={() => {
              const blob = new Blob([prettyJson(records)], { type: "application/json" })
              const url = window.URL.createObjectURL(blob)
              const anchor = document.createElement("a")
              anchor.href = url
              anchor.download = "coach-audit-logs.json"
              anchor.click()
              window.URL.revokeObjectURL(url)
            }}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Download JSON
          </button>
          {copyState && <p className="self-center text-sm text-emerald-700">{copyState}</p>}
        </div>
        {error && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
        <SectionCard
          title="Recent conversations"
          description="Open any exchange to inspect the route, state changes, persisted actions, and debug prompt."
        >
          {records.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
              No audit logs matched the current filters.
            </div>
          ) : (
            <div className="space-y-3">
              {records.map((record) => (
                <button
                  key={record.log_id}
                  type="button"
                  onClick={() => setSelectedId(record.log_id)}
                  className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                    selectedRecord?.log_id === record.log_id
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{record.route_type}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">{record.user_email || record.user_id || "Unknown tester"}</p>
                      <p className="mt-1 text-sm text-slate-600">{record.user_message}</p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <p>{new Date(record.created_at).toLocaleString()}</p>
                      <p className="mt-1">{record.latency_ms} ms</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(record.flags || []).map((flag) => (
                      <span key={flag.code} className={`rounded-full px-2 py-1 text-xs font-semibold ${flag.severity === "error" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                        {flag.code}
                      </span>
                    ))}
                    {record.persistence_status !== "not_requested" && (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{record.persistence_status}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Selected thread"
          description="Use this panel to inspect state before and after, review persisted actions, and copy a Codex-ready debugging prompt."
        >
          {selectedRecord ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                {statCard("Route", selectedRecord.route_type)}
                {statCard("Intent", selectedRecord.intent || "unknown")}
                {statCard("Latency", `${selectedRecord.latency_ms} ms`, "text-indigo-700")}
              </div>

              <div className="flex flex-wrap gap-2">
                {(selectedRecord.flags || []).map((flag) => (
                  <span key={flag.code} className={`rounded-full px-3 py-1 text-xs font-semibold ${flag.severity === "error" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                    {flag.label}
                  </span>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-950">Conversation</p>
                <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
                  {(selectedRecord.conversation_window || []).map((message, index) => (
                    <div key={`${message.role}_${index}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{message.role}</p>
                      <p className="mt-1 whitespace-pre-wrap">{message.content}</p>
                    </div>
                  ))}
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">user</p>
                    <p className="mt-1 whitespace-pre-wrap">{selectedRecord.user_message}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">assistant</p>
                    <p className="mt-1 whitespace-pre-wrap">{selectedRecord.assistant_reply}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-slate-950">State before</p>
                  <pre className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700">{prettyJson(selectedRecord.state_before)}</pre>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-950">State after</p>
                  <pre className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700">{prettyJson(selectedRecord.state_after)}</pre>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Proposed actions</p>
                  <pre className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700">{prettyJson(selectedRecord.actions)}</pre>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-950">Persisted actions</p>
                  <pre className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700">{prettyJson(selectedRecord.persisted_actions)}</pre>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-950">Quick monitor summary</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">Persistence: <span className="font-semibold text-slate-950">{selectedRecord.persistence_status}</span></p>
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">Model: <span className="font-semibold text-slate-950">{selectedRecord.model_used || "deterministic / local"}</span></p>
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">Draft preserved after failure: <span className="font-semibold text-slate-950">{String(selectedRecord.draft_preserved_after_failure)}</span></p>
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">Duplicate prevention: <span className="font-semibold text-slate-950">{String(selectedRecord.duplicate_prevention_triggered)}</span></p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    await copyText(prettyJson(selectedRecord))
                    setCopyState("Copied log JSON.")
                  }}
                  className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                >
                  Copy log JSON
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await copyText(buildCoachAuditDebugPrompt(selectedRecord))
                    setCopyState("Copied debug prompt.")
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Copy debug prompt
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
              Pick a conversation to inspect the thread, state deltas, and persisted actions.
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Latest signals"
        description="Temporary beta-monitoring shortcuts for what is going wrong most often."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-950">Top flags</p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              {sortedFlagCounts.length ? sortedFlagCounts.map(([flag, count]) => (
                <div key={flag} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span>{flag}</span>
                  <span className="font-semibold text-slate-950">{count}</span>
                </div>
              )) : <p className="text-slate-500">No flags in this result set.</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-950">Repeated clarifications</p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              {Object.entries(summary?.repeated_clarifications || {}).sort((left, right) => right[1] - left[1]).slice(0, 5).map(([message, count]) => (
                <div key={message} className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="font-medium text-slate-950">{count}x</p>
                  <p className="mt-1 line-clamp-3">{message}</p>
                </div>
              ))}
              {!Object.keys(summary?.repeated_clarifications || {}).length && <p className="text-slate-500">No repeated clarification patterns yet.</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-950">Common unknown / messy inputs</p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              {Object.entries(summary?.common_unknown_inputs || {}).sort((left, right) => right[1] - left[1]).slice(0, 5).map(([message, count]) => (
                <div key={message} className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="font-medium text-slate-950">{count}x</p>
                  <p className="mt-1 line-clamp-3">{message}</p>
                </div>
              ))}
              {!Object.keys(summary?.common_unknown_inputs || {}).length && <p className="text-slate-500">No parser-warning inputs in this result set.</p>}
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

