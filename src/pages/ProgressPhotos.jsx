import { useMemo, useRef, useState } from "react"
import { Camera, ImagePlus, Link as LinkIcon, Plus, Sparkles, Trash2 } from "lucide-react"
import ChoiceGrid from "@/components/ChoiceGrid"
import PageHeader from "@/components/PageHeader"
import { storageKeys } from "@/lib/fitnessDefaults"
import { todayISO, uid, useLocalStorage } from "@/lib/useLocalStorage"

const bodyParts = ["all", "full_body", "arms", "legs", "core", "chest", "back"]

function comparePhotos(before, after) {
  if (!before || !after) return "Choose two photos to generate comparison notes."
  const days = Math.max(1, Math.round((new Date(after.date).getTime() - new Date(before.date).getTime()) / 86400000))
  return `Compared ${before.label || before.body_part} to ${after.label || after.body_part} across ${days} day(s). Check posture consistency, lighting, waist/shoulder line, and visible definition. For best comparison quality, use the same pose, distance, lighting, and body-part tag.`
}

export default function ProgressPhotos() {
  const [photos, setPhotos] = useLocalStorage(storageKeys.photos, [])
  const [form, setForm] = useState({ date: todayISO(), photo_url: "", label: "", body_part: "full_body", notes: "" })
  const [filter, setFilter] = useState("all")
  const [beforeId, setBeforeId] = useState("")
  const [afterId, setAfterId] = useState("")
  const [slider, setSlider] = useState(50)
  const [uploadStatus, setUploadStatus] = useState("")
  const fileInputRef = useRef(null)
  const filteredPhotos = useMemo(() => filter === "all" ? photos : photos.filter((photo) => photo.body_part === filter), [filter, photos])
  const before = photos.find((photo) => photo.id === beforeId)
  const after = photos.find((photo) => photo.id === afterId)
  const bodyPartChoices = bodyParts.filter((part) => part !== "all").map((part) => ({
    value: part,
    label: part.replace("_", " "),
  }))
  const photoChoices = photos.map((photo) => ({
    value: photo.id,
    label: photo.label || photo.body_part?.replace("_", " "),
    description: photo.date,
  }))

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const save = (event) => {
    event.preventDefault()
    if (!form.photo_url.trim()) return
    setPhotos((current) => [{ ...form, id: uid("photo"), ai_analysis: "" }, ...current])
    setForm({ date: todayISO(), photo_url: "", label: "", body_part: "full_body", notes: "" })
    setUploadStatus("")
  }
  const remove = (id) => setPhotos((current) => current.filter((photo) => photo.id !== id))
  const saveAnalysis = () => {
    const analysis = comparePhotos(before, after)
    if (!after) return
    setPhotos((current) => current.map((photo) => photo.id === after.id ? { ...photo, ai_analysis: analysis } : photo))
  }
  const importPhoto = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadStatus("Importing photo...")
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ""))
        reader.onerror = () => reject(reader.error || new Error("Photo import failed."))
        reader.readAsDataURL(file)
      })
      update("photo_url", dataUrl)
      if (!form.label) {
        update("label", file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "))
      }
      setUploadStatus("Photo imported from this device.")
    } catch {
      setUploadStatus("Photo import failed. Try a smaller image or paste a direct image URL instead.")
    } finally {
      event.target.value = ""
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Photos" title="Progress photos" subtitle="Import a photo from this device or paste an image URL, tag it clearly, compare side by side, and save consistent comparison notes." />

      <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <form onSubmit={save} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><Camera size={20} className="text-indigo-600" /><h2 className="text-lg font-bold text-slate-950">Add photo</h2></div>
          <div className="mt-4 grid gap-3">
            <input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-slate-600 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
                <LinkIcon size={16} className="text-slate-400" />
                <input value={form.photo_url} onChange={(event) => update("photo_url", event.target.value)} placeholder="Direct image URL or imported photo preview" className="w-full bg-transparent text-slate-950 outline-none" />
              </label>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                <ImagePlus size={16} /> Choose photo
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={importPhoto} className="hidden" />
            </div>
            <input value={form.label} onChange={(event) => update("label", event.target.value)} placeholder="Label" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
            <ChoiceGrid label="Body part" value={form.body_part} onChange={(value) => update("body_part", value)} options={bodyPartChoices} />
            <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Notes" className="min-h-20 rounded-lg border border-slate-200 px-3 py-2 text-slate-950" />
            {uploadStatus && <p className="text-sm font-medium text-slate-600">{uploadStatus}</p>}
            <button type="submit" className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white"><Plus size={16} /> Add photo</button>
          </div>
        </form>

        <div className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Compare</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <ChoiceGrid label="Before photo" value={beforeId} onChange={setBeforeId} options={photoChoices} columns={1} />
              <ChoiceGrid label="After photo" value={afterId} onChange={setAfterId} options={photoChoices} columns={1} />
            </div>
            {before && after && (
              <div className="mt-4">
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-100">
                  <img src={before.photo_url} alt="Before" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-y-0 right-0 overflow-hidden" style={{ width: `${100 - slider}%` }}>
                    <img src={after.photo_url} alt="After" className="absolute inset-y-0 right-0 h-full max-w-none object-cover" style={{ width: `${10000 / Math.max(1, 100 - slider)}%` }} />
                  </div>
                  <div className="absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${slider}%` }} />
                </div>
                <input type="range" min="0" max="100" value={slider} onChange={(event) => setSlider(Number(event.target.value))} className="mt-3 w-full" />
                <button type="button" onClick={saveAnalysis} className="mt-3 flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white"><Sparkles size={16} /> Save notes</button>
                <p className="mt-3 rounded-lg bg-indigo-50 p-3 text-sm text-slate-700">{comparePhotos(before, after)}</p>
              </div>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            {bodyParts.map((part) => (
              <button key={part} type="button" onClick={() => setFilter(part)} className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${filter === part ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{part.replace("_", " ")}</button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {filteredPhotos.map((photo) => (
              <article key={photo.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <img src={photo.photo_url} alt={photo.label || "Progress"} className="aspect-[4/3] w-full bg-slate-100 object-cover" />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{photo.label || photo.body_part}</p>
                      <p className="text-sm text-slate-500">{photo.date} - {photo.body_part?.replace("_", " ")}</p>
                    </div>
                    <button type="button" onClick={() => remove(photo.id)} className="min-h-11 min-w-11 rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-rose-600"><Trash2 size={16} /></button>
                  </div>
                  {photo.notes && <p className="mt-2 text-sm text-slate-600">{photo.notes}</p>}
                  {photo.ai_analysis && <p className="mt-2 rounded-lg bg-indigo-50 p-2 text-sm text-slate-700">{photo.ai_analysis}</p>}
                </div>
              </article>
            ))}
            {!filteredPhotos.length && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">No photos yet.</p>}
            {!photos.length && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500 sm:col-span-2">Add a couple of photos and the compare chooser will appear here as tap targets instead of a browser dropdown.</p>}
          </div>
        </div>
      </section>
    </div>
  )
}
