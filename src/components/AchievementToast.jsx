import { Trophy } from "lucide-react"

export default function AchievementToast({ achievement, onClose }) {
  if (!achievement) return null

  return (
    <div className="fixed right-4 top-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-amber-200 bg-white p-4 shadow-lg">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
        <Trophy size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-950">{achievement.title}</p>
        <p className="text-sm text-slate-500">{achievement.description}</p>
      </div>
      <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-400 hover:text-slate-700">
        Close
      </button>
    </div>
  )
}
