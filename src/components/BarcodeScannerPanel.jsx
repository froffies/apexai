import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, RefreshCcw, Upload, X } from "lucide-react"

function resultText(result) {
  if (!result) return ""
  if (typeof result.getText === "function") return result.getText()
  return result.text || ""
}

function errorMessage(error) {
  if (!error) return ""
  if (error instanceof Error) return error.message
  return String(error)
}

function isIgnorableScanError(error) {
  const message = errorMessage(error).toLowerCase()
  return !message || message.includes("not found") || message.includes("no multiformat") || message.includes("checksum")
}

function pickPreferredDevice(devices = []) {
  return devices.find((device) => /back|rear|environment/i.test(device.label || ""))?.deviceId || devices[0]?.deviceId || ""
}

export default function BarcodeScannerPanel({ onDetected, buttonLabel = "Scan barcode", helperText = "Use camera or upload a barcode photo.", className = "" }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("")
  const [devices, setDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState("")
  const [manualCode, setManualCode] = useState("")
  const [cameraAvailable, setCameraAvailable] = useState(true)
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const readerRef = useRef(null)
  const selectedDeviceIdRef = useRef("")

  useEffect(() => {
    selectedDeviceIdRef.current = selectedDeviceId
  }, [selectedDeviceId])

  const stopScanner = useCallback(() => {
    try {
      controlsRef.current?.stop?.()
    } catch {
      // ignore shutdown errors
    }
    controlsRef.current = null

    const stream = videoRef.current?.srcObject
    if (stream && typeof stream.getTracks === "function") {
      stream.getTracks().forEach((track) => track.stop())
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [])

  useEffect(() => () => stopScanner(), [stopScanner])

  const detectCode = useCallback((code) => {
    const trimmed = String(code || "").trim()
    if (!trimmed) return
    setManualCode(trimmed)
    setStatus(`Barcode captured: ${trimmed}`)
    stopScanner()
    setOpen(false)
    onDetected?.(trimmed)
  }, [onDetected, stopScanner])

  const startScanner = useCallback(async (preferredDeviceId) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraAvailable(false)
      setStatus("Camera scanning is not available here. Upload a barcode photo or paste the code.")
      return
    }

    setLoading(true)
    setStatus("Starting camera...")

    try {
      stopScanner()
      const { BrowserMultiFormatReader } = await import("@zxing/browser")
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader()

      const nextDevices = await BrowserMultiFormatReader.listVideoInputDevices()
      setDevices(nextDevices)

      if (!nextDevices.length) {
        setCameraAvailable(false)
        setStatus("No camera found. Upload a barcode image or paste the code instead.")
        return
      }

      const nextDeviceId = preferredDeviceId || selectedDeviceIdRef.current || pickPreferredDevice(nextDevices)
      setSelectedDeviceId(nextDeviceId)
      setCameraAvailable(true)
      setStatus("Point the barcode at the camera.")

      controlsRef.current = await readerRef.current.decodeFromVideoDevice(
        nextDeviceId,
        videoRef.current,
        (result, error) => {
          if (result) {
            detectCode(resultText(result))
            return
          }
          if (error && !isIgnorableScanError(error)) {
            setStatus(errorMessage(error))
          }
        }
      )
    } catch (error) {
      setCameraAvailable(false)
      setStatus(errorMessage(error) || "Unable to start barcode scanning.")
    } finally {
      setLoading(false)
    }
  }, [detectCode, stopScanner])

  useEffect(() => {
    if (!open) {
      stopScanner()
      return
    }
    void startScanner()
  }, [open, startScanner, stopScanner])

  const cycleCamera = async () => {
    if (devices.length < 2) {
      setStatus("Only one camera is available on this device.")
      return
    }
    const currentIndex = devices.findIndex((device) => device.deviceId === selectedDeviceId)
    const nextDevice = devices[(currentIndex + 1) % devices.length]
    await startScanner(nextDevice.deviceId)
  }

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setLoading(true)
    setStatus("Scanning uploaded barcode image...")

    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser")
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader()
      const objectUrl = URL.createObjectURL(file)
      try {
        const result = await readerRef.current.decodeFromImageUrl(objectUrl)
        detectCode(resultText(result))
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    } catch (error) {
      setStatus(errorMessage(error) || "Could not decode that image.")
    } finally {
      setLoading(false)
      event.target.value = ""
    }
  }

  const submitManualCode = () => {
    if (!manualCode.trim()) {
      setStatus("Paste or type a barcode number first.")
      return
    }
    detectCode(manualCode)
  }

  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
        {open ? <X size={16} /> : <Camera size={16} />} {open ? "Close scanner" : buttonLabel}
      </button>

      {open && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm text-slate-500">{helperText}</p>

          <div className="mt-3 overflow-hidden rounded-lg bg-slate-950">
            <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline autoPlay />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void startScanner()} disabled={loading} className="flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              <Camera size={16} /> {loading ? "Starting..." : "Start camera"}
            </button>
            <button type="button" onClick={() => void cycleCamera()} disabled={loading || !cameraAvailable} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">
              <RefreshCcw size={16} /> Switch camera
            </button>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              <Upload size={16} /> Scan from photo
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} />
            </label>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
            <input
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              placeholder="Paste barcode manually"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-950"
            />
            <button type="button" onClick={submitManualCode} className="min-h-11 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
              Use code
            </button>
          </div>

          {!!status && <p className="mt-3 text-sm font-medium text-slate-600">{status}</p>}
        </div>
      )}
    </div>
  )
}
