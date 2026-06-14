import { useMemo, useRef, useState } from "react"
import { Camera, LoaderCircle, Upload, X } from "lucide-react"
import { analyzeFoodPhoto } from "@/lib/nutritionApiClient"

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(reader.error || new Error("Could not read that photo."))
    reader.readAsDataURL(file)
  })
}

async function resizeImageDataUrl(dataUrl, { maxEdge = 1280, quality = 0.82 } = {}) {
  if (typeof document === "undefined") return dataUrl
  const image = await new Promise((resolve, reject) => {
    const nextImage = new Image()
    nextImage.onload = () => resolve(nextImage)
    nextImage.onerror = () => reject(new Error("Could not load that image."))
    nextImage.src = dataUrl
  })

  const width = Number(image.width || 0)
  const height = Number(image.height || 0)
  if (!width || !height) return dataUrl

  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext("2d")
  if (!context) return dataUrl
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", quality)
}

export default function FoodPhotoPanel({
  onAnalyzed,
  buttonLabel = "Analyze plate photo",
  helperText = "Take a clear photo of the plate or drink. I'll identify the visible foods and estimate the macros.",
  locale = "AU",
  mealType = "",
  className = "",
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("")
  const [previewUrl, setPreviewUrl] = useState("")
  const [summary, setSummary] = useState("")
  const cameraInputRef = useRef(null)
  const uploadInputRef = useRef(null)
  const details = useMemo(() => summary ? `Identified: ${summary}` : "", [summary])

  const handleFile = async (file) => {
    if (!file) return
    setLoading(true)
    setStatus("Analyzing photo...")
    try {
      const originalDataUrl = await fileToDataUrl(file)
      const resizedDataUrl = await resizeImageDataUrl(originalDataUrl)
      setPreviewUrl(resizedDataUrl)
      const result = await analyzeFoodPhoto({ imageDataUrl: resizedDataUrl, locale, mealType })
      setSummary(result.food_name || result.summary || "")
      setStatus(result.clarification_question || result.nutrition_source || "Photo analyzed.")
      onAnalyzed?.(result)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Food photo analysis failed.")
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (event) => {
    const file = event.target.files?.[0]
    void handleFile(file)
    event.target.value = ""
  }

  const clearPhoto = () => {
    setPreviewUrl("")
    setSummary("")
    setStatus("")
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
      >
        {open ? <X size={16} /> : <Camera size={16} />} {open ? "Close photo tool" : buttonLabel}
      </button>

      {open && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm text-slate-500">{helperText}</p>

          {previewUrl && (
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <img src={previewUrl} alt="Food preview" className="max-h-72 w-full object-cover" />
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={loading}
              data-testid="food-photo-camera-input"
              onChange={handleInputChange}
            />
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={loading}
              data-testid="food-photo-upload-input"
              onChange={handleInputChange}
            />
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={loading}
              className="flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? <LoaderCircle size={16} className="animate-spin" /> : <Camera size={16} />}
              {loading ? "Analyzing..." : "Take photo"}
            </button>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              disabled={loading}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Upload size={16} />
              Upload photo
            </button>
            {!!previewUrl && (
              <button
                type="button"
                onClick={clearPhoto}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                <X size={16} /> Clear
              </button>
            )}
          </div>

          <p className="mt-2 text-xs text-slate-500">Use <span className="font-semibold text-slate-700">Upload photo</span> to pick from your library on iPhone, or <span className="font-semibold text-slate-700">Take photo</span> to open the camera.</p>

          {!!details && <p className="mt-3 text-sm font-semibold text-slate-800">{details}</p>}
          {!!status && <p className="mt-2 text-sm text-slate-600">{status}</p>}
        </div>
      )}
    </div>
  )
}
