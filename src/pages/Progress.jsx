import { Suspense, lazy, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Activity, Camera, Plus, TrendingDown } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import SectionCard from "@/components/SectionCard"
import SegmentedControl from "@/components/SegmentedControl"
import { createPageUrl } from "@/utils"
import { buildDailyTrend, coachingInsight, muscleVolume } from "@/lib/analytics"
import { defaultProfile, latestProgress, starterMeals, starterProgress, starterRecoveryLogs, starterWorkoutSets, starterWorkouts, storageKeys } from "@/lib/fitnessDefaults"
import { recommendProgressionBlock } from "@/lib/progressionEngine"
import { todayISO, uid, useLocalStorage } from "@/lib/useLocalStorage"

const ProgressTrendCharts = lazy(() => import("@/components/ProgressTrendCharts"))

export default function Progress() {
  const [profile] = useLocalStorage(storageKeys.profile, defaultProfile)
  const [meals] = useLocalStorage(storageKeys.meals, starterMeals)
  const [workouts] = useLocalStorage(storageKeys.workouts, starterWorkouts)
  const [workoutSets] = useLocalStorage(storageKeys.workoutSets, starterWorkoutSets)
  const [progress, setProgress] = useLocalStorage(storageKeys.progress, starterProgress)
  const [recoveryLogs] = useLocalStorage(storageKeys.recoveryLogs, starterRecoveryLogs)
  const [range, setRange] = useState(30)
  const [view, setView] = useState("summary")
  const [form, setForm] = useState({ date: todayISO(), weight_kg: "", waist_cm: "", body_fat_estimate: "", notes: "" })
  const latest = latestProgress(progress)
  const delta = latest ? Number(latest.weight_kg || 0) - Number(profile.weight_kg || 0) : 0
  const trend = useMemo(() => buildDailyTrend({ meals, progress, workouts, workoutSets, days: range, calorieTarget: profile.daily_calories }), [meals, profile.daily_calories, progress, range, workoutSets, workouts])
  const muscles = useMemo(() => muscleVolume(workoutSets), [workoutSets])
  const insight = useMemo(() => coachingInsight({ meals, progress, workouts, workoutSets, profile }), [meals, profile, progress, workoutSets, workouts])
  const progressionBlock = useMemo(() => recommendProgressionBlock({ profile, progress, workoutSets, recoveryLogs }), [profile, progress, recoveryLogs, workoutSets])

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const save = (event) => {
    event.preventDefault()
    setProgress((current) => [{ ...form, id: uid("progress"), weight_kg: Number(form.weight_kg) || 0, waist_cm: Number(form.waist_cm) || 0, body_fat_estimate: Number(form.body_fat_estimate) || 0 }, ...current])
    setForm({ date: todayISO(), weight_kg: "", waist_cm: "", body_fat_estimate: "", notes: "" })
  }

  const progressViews = [
    { value: "summary", label: "Summary" },
    { value: "trends", label: "Trends" },
    { value: "checkins", label: "Check-ins" },
  ]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Progress"
        title="Long-term trends"
        subtitle="Weight, calories, strength volume, consistency, and coach insights in one dashboard."
        action={<Link to={createPageUrl("ProgressPhotos")} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><Camera size={16} /> Photos</Link>}
      />

      <SegmentedControl label="Progress view" value={view} onChange={setView} options={progressViews} />

      {view === "summary" && (
        <>
      <section className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Latest weight" description="Your newest logged bodyweight compared with baseline.">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><TrendingDown size={20} /></div>
            <div>
              <p className="text-2xl font-semibold text-slate-950">{latest?.weight_kg || profile.weight_kg}kg</p>
              <p className="text-sm text-slate-500">Current logged value</p>
            </div>
          </div>
          <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
            Change from baseline: <span className="font-semibold text-slate-950">{delta > 0 ? "+" : ""}{delta.toFixed(1)}kg</span>
          </p>
        </SectionCard>
        <SectionCard title="Coach insight" description={insight} className="lg:col-span-2">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Activity size={20} /></div>
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <SectionCard title={progressionBlock.title} description={progressionBlock.summary}>
          <div className="grid gap-2 sm:grid-cols-3">
            {progressionBlock.adjustments.map((item) => (
              <div key={item} className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">{item}</div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Plateau watch" description="The lifts that currently need cleaner progression or better recovery.">
          <div className="space-y-3">
            {progressionBlock.plateaus.length ? progressionBlock.plateaus.slice(0, 3).map((item) => (
              <div key={item.exerciseName} className="rounded-2xl bg-slate-50 p-3">
                <p className="font-semibold text-slate-950">{item.exerciseName}</p>
                <p className="mt-1 text-sm text-slate-500">Best {item.bestWeight}kg - Avg volume {item.averageVolume}kg</p>
              </div>
            )) : (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No stalled lifts detected in the recent block.</p>
            )}
          </div>
        </SectionCard>
      </section>

      <SectionCard title="Volume by muscle group" description="A quick read on where your recent training volume is landing.">
        <div className="mt-4 space-y-3">
          {muscles.map((item) => (
            <div key={item.muscle}>
              <div className="flex justify-between text-sm font-medium text-slate-700"><span>{item.muscle}</span><span>{item.volume.toLocaleString()}kg</span></div>
              <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.min(100, (item.volume / Math.max(1, muscles[0]?.volume || 1)) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      </SectionCard>
        </>
      )}

      {view === "trends" && (
        <>
          <div className="flex flex-wrap gap-2">
            {[30, 90, 365].map((days) => (
              <button key={days} type="button" onClick={() => setRange(days)} className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${range === days ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>
                {days === 365 ? "Year" : `${days} days`}
              </button>
            ))}
          </div>
          <Suspense fallback={<SectionCard title="Progress charts"><p className="text-sm text-slate-500">Loading progress charts...</p></SectionCard>}>
            <ProgressTrendCharts trend={trend} weeklyVolume={progressionBlock.weeklyVolume} />
          </Suspense>
        </>
      )}

      {view === "checkins" && (
      <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <SectionCard title="Add check-in" description="Log weight, waist, body fat, or a short note to keep trends grounded in real context.">
          <form onSubmit={save} className="grid gap-3">
          <div className="mt-4 grid gap-3">
            <input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} className="rounded-xl border border-slate-200 px-3 py-3 text-slate-950" />
            <input type="number" step="0.1" value={form.weight_kg} onChange={(event) => update("weight_kg", event.target.value)} placeholder="Weight kg" className="rounded-xl border border-slate-200 px-3 py-3 text-slate-950" />
            <input type="number" step="0.1" value={form.waist_cm} onChange={(event) => update("waist_cm", event.target.value)} placeholder="Waist cm" className="rounded-xl border border-slate-200 px-3 py-3 text-slate-950" />
            <input type="number" step="0.1" value={form.body_fat_estimate} onChange={(event) => update("body_fat_estimate", event.target.value)} placeholder="Body fat estimate %" className="rounded-xl border border-slate-200 px-3 py-3 text-slate-950" />
            <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Notes" className="min-h-20 rounded-xl border border-slate-200 px-3 py-3 text-slate-950" />
            <button type="submit" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white"><Plus size={16} /> Add check-in</button>
          </div>
        </form>
        </SectionCard>

        <SectionCard title="Check-ins" description="Your recorded trend points in reverse chronological order.">
          <div className="space-y-3">
            {progress.map((entry) => (
              <div key={entry.id} className="rounded-2xl bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900">{entry.date}</p>
                  <p className="font-bold text-slate-950">{entry.weight_kg}kg</p>
                </div>
                <p className="mt-1 text-sm text-slate-500">Waist {entry.waist_cm || "-"}cm - Body fat {entry.body_fat_estimate || "-"}%</p>
                {entry.notes && <p className="mt-2 text-sm text-slate-600">{entry.notes}</p>}
              </div>
            ))}
          </div>
        </SectionCard>
      </section>
      )}
    </div>
  )
}
