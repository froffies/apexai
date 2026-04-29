import { Plus, Trophy } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import { starterChallenges, storageKeys } from "@/lib/fitnessDefaults"
import { useLocalStorage } from "@/lib/useLocalStorage"

export default function Challenges() {
  const [challenges, setChallenges] = useLocalStorage(storageKeys.challenges, starterChallenges)

  const addProgress = (id) => {
    setChallenges((current) => current.map((challenge) => {
      if (challenge.id !== id) return challenge
      const next = Math.min(Number(challenge.goal_value || 0), Number(challenge.progress_value || 0) + 1)
      return { ...challenge, progress_value: next, completed: next >= Number(challenge.goal_value || 0) }
    }))
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Challenges" title="Short-term targets" subtitle="Small challenges keep the bigger goal from feeling abstract." />

      <section className="grid gap-4 md:grid-cols-2">
        {challenges.map((challenge) => {
          const percent = Math.min(100, Math.round((Number(challenge.progress_value || 0) / Math.max(1, Number(challenge.goal_value || 1))) * 100))
          return (
            <article key={challenge.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Trophy size={20} /></div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{challenge.category}</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-950">{challenge.title}</h2>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-600">{challenge.description}</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-600" style={{ width: `${percent}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
                <span>{challenge.progress_value || 0}/{challenge.goal_value} {challenge.goal_unit}</span>
                <span>{percent}%</span>
              </div>
              <button type="button" onClick={() => addProgress(challenge.id)} className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                <Plus size={16} /> Add progress
              </button>
            </article>
          )
        })}
      </section>
    </div>
  )
}
