import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import ChoiceGrid from "@/components/ChoiceGrid"
import PageHeader from "@/components/PageHeader"
import { starterExercises, storageKeys } from "@/lib/fitnessDefaults"
import { uid, useLocalStorage } from "@/lib/useLocalStorage"

const categories = ["chest", "back", "shoulders", "arms", "legs", "core", "cardio", "full_body"]
const categoryChoices = categories.map((category) => ({
  value: category,
  label: category.replace("_", " "),
}))

export default function WorkoutLibrary() {
  const [exercises, setExercises] = useLocalStorage(storageKeys.exercises, starterExercises)
  const [form, setForm] = useState({ name: "", category: "legs", muscle_group: "", description: "", video_url: "" })
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const save = (event) => {
    event.preventDefault()
    if (!form.name.trim()) return
    setExercises((current) => [{ ...form, id: uid("exercise") }, ...current])
    setForm({ name: "", category: "legs", muscle_group: "", description: "", video_url: "" })
  }
  const remove = (id) => setExercises((current) => current.filter((exercise) => exercise.id !== id))

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Library" title="Exercise library" subtitle="Keep the movements you actually use close to your workout logger." />

      <form onSubmit={save} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">
        <input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Exercise name" className="rounded-lg border border-slate-200 px-3 py-2" />
        <input value={form.muscle_group} onChange={(event) => update("muscle_group", event.target.value)} placeholder="Muscle group" className="rounded-lg border border-slate-200 px-3 py-2" />
        <input value={form.video_url} onChange={(event) => update("video_url", event.target.value)} placeholder="Video URL" className="rounded-lg border border-slate-200 px-3 py-2" />
        <ChoiceGrid label="Category" value={form.category} onChange={(value) => update("category", value)} options={categoryChoices} columns={3} className="md:col-span-2" />
        <textarea value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Description" className="min-h-20 rounded-lg border border-slate-200 px-3 py-2 md:col-span-2" />
        <button type="submit" className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white md:col-span-2"><Plus size={16} /> Add exercise</button>
      </form>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {exercises.map((exercise) => (
          <article key={exercise.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{exercise.category}</p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">{exercise.name}</h2>
              </div>
              <button type="button" onClick={() => remove(exercise.id)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-rose-600"><Trash2 size={16} /></button>
            </div>
            <p className="mt-2 text-sm text-slate-500">{exercise.muscle_group}</p>
            <p className="mt-2 text-sm text-slate-600">{exercise.description}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
