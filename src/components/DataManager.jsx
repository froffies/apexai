import { useRef, useState } from "react"
import { Download, RotateCcw, Upload } from "lucide-react"
import { listAppRecords, setAppRecord } from "@/lib/appStorage"
import { resetApexData } from "@/lib/useLocalStorage"

const dataPrefix = "apexai."

export default function DataManager() {
  const inputRef = useRef(null)
  const [status, setStatus] = useState("")

  const exportData = async () => {
    const payload = {
      exported_at: new Date().toISOString(),
      app: "ApexAI",
      data: await listAppRecords(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `apexai-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setStatus("Backup exported.")
  }

  const importData = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const payload = JSON.parse(await file.text())
      const data = payload.data || payload
      await Promise.all(Object.entries(data).map(([key, value]) => {
        if (key.startsWith(dataPrefix)) {
          return setAppRecord(key, value)
        }
        return undefined
      }))
      window.dispatchEvent(new CustomEvent("apexai-storage", { detail: { key: "*" } }))
      setStatus("Backup imported.")
    } catch {
      setStatus("Import failed. Choose a valid ApexAI JSON backup.")
    } finally {
      event.target.value = ""
    }
  }

  const resetData = async () => {
    await resetApexData()
    setStatus("Local data reset.")
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">Data controls</h2>
      <p className="mt-1 text-sm text-slate-500">Export a JSON backup, import one later, or reset this browser's local ApexAI data.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={exportData} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">
          <Download size={16} /> Export
        </button>
        <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
          <Upload size={16} /> Import
        </button>
        <button type="button" onClick={resetData} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
          <RotateCcw size={16} /> Reset
        </button>
      </div>
      <input ref={inputRef} type="file" accept="application/json,.json" onChange={importData} className="hidden" />
      {status && <p className="mt-3 text-sm font-medium text-slate-600">{status}</p>}
    </section>
  )
}
