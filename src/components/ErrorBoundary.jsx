import React from "react"
import { AlertTriangle, Copy, Home, RefreshCcw } from "lucide-react"
import { getTelemetrySnapshot, trackRenderError } from "@/lib/telemetry"
import { shareText } from "@/lib/nativeIntegrations"

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, eventId: "", copied: false }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error("ApexAI render error", error, info)
    }
    const event = trackRenderError(error, info)
    this.setState({ eventId: event?.id || "", copied: false })
  }

  copyDiagnostics = async () => {
    const telemetry = getTelemetrySnapshot()
    const payload = {
      route: typeof window !== "undefined" ? window.location.pathname : "",
      eventId: this.state.eventId,
      error: {
        message: this.state.error?.message || "Unknown error",
        stack: this.state.error?.stack || "",
      },
      telemetry,
    }
    await shareText("ApexAI crash diagnostics", JSON.stringify(payload, null, 2))
    this.setState({ copied: true })
  }

  render() {
    if (this.state.error) {
      const showTechnicalDetails = import.meta.env.DEV || (typeof window !== "undefined" && window.localStorage.getItem("apexai.developerTools") === "true")
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
          <section className="max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <AlertTriangle size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-rose-600">Unexpected UI error</p>
                <h1 className="mt-1 text-2xl font-bold text-slate-950">ApexAI hit a screen problem</h1>
                <p className="mt-2 text-sm text-slate-600">Your saved data is still on device. Reload the app, head back home, or copy a support report if this keeps happening.</p>
                {this.state.eventId && <p className="mt-2 text-xs font-medium text-slate-500">Event ID: {this.state.eventId}</p>}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => window.location.reload()} className="flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white">
                <RefreshCcw size={16} /> Reload app
              </button>
              <button type="button" onClick={() => window.location.assign("/")} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700">
                <Home size={16} /> Go home
              </button>
              <button type="button" onClick={this.copyDiagnostics} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700">
                <Copy size={16} /> {this.state.copied ? "Diagnostics copied" : "Copy diagnostics"}
              </button>
            </div>

            {showTechnicalDetails && (
              <details className="mt-4 rounded-lg bg-slate-50 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">Technical details</summary>
                <p className="mt-3 break-words text-sm text-slate-600">{this.state.error?.message || "Unknown render error"}</p>
              </details>
            )}
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
