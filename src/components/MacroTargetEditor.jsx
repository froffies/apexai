import { useState } from "react"
import { Check, X } from "lucide-react"

export default function MacroTargetEditor({ profile, onSave, onClose }) {
  const [form, setForm] = useState({
    daily_calories: profile?.daily_calories || 2000,
    protein_g: profile?.protein_g || 150,
    carbs_g: profile?.carbs_g || 200,
    fat_g: profile?.fat_g || 65,
  })
  const [saving, setSaving] = useState(false)

  const save = () => {
    setSaving(true)
    const nextTargets = {
      daily_calories: Number(form.daily_calories) || 0,
      protein_g: Number(form.protein_g) || 0,
      carbs_g: Number(form.carbs_g) || 0,
      fat_g: Number(form.fat_g) || 0,
    }
    onSave?.(nextTargets)
    setSaving(false)
    onClose?.()
  }

  const fields = [
    { key: "daily_calories", label: "Daily calories", unit: "kcal", color: "text-indigo-600" },
    { key: "protein_g", label: "Protein", unit: "g", color: "text-red-500" },
    { key: "carbs_g", label: "Carbs", unit: "g", color: "text-amber-500" },
    { key: "fat_g", label: "Fat", unit: "g", color: "text-blue-500" },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-950">Edit targets</h2>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-500 hover:text-slate-900">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">
          {fields.map(({ key, label, unit, color }) => (
            <label key={key} className="block">
              <div className="mb-1 flex items-center justify-between">
                <span className={`text-sm font-semibold ${color}`}>{label}</span>
                <span className="text-xs text-slate-400">{unit}</span>
              </div>
              <input
                type="number"
                value={form[key] || ""}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-lg font-bold text-slate-950"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-base font-bold text-white transition-transform active:scale-95 disabled:opacity-50"
        >
          <Check size={18} /> {saving ? "Saving..." : "Save targets"}
        </button>
      </div>
    </div>
  )
}
