import { X } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

function toneClasses(variant) {
  if (variant === "destructive") return "border-rose-200 bg-rose-50 text-rose-950"
  if (variant === "success") return "border-emerald-200 bg-emerald-50 text-emerald-950"
  return "border-slate-200 bg-white text-slate-950"
}

export function Toaster() {
  const { toasts, dismiss } = useToast()
  if (!toasts.length) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex flex-col items-end gap-3 px-4 pb-4 md:inset-x-auto md:right-4 md:w-full md:max-w-sm"
      style={{ paddingBottom: "max(1rem, calc(env(safe-area-inset-bottom) + 0.75rem))" }}
    >
      {toasts.filter((toast) => toast.open !== false).map((toast) => (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={`pointer-events-auto w-full rounded-xl border p-4 shadow-lg backdrop-blur ${toneClasses(toast.variant)}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {toast.title && <p className="text-sm font-semibold">{toast.title}</p>}
              {toast.description && <p className="mt-1 text-sm opacity-90">{toast.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-700"
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
          {toast.action && <div className="mt-3 flex flex-wrap gap-2">{toast.action}</div>}
        </div>
      ))}
    </div>
  )
}

export default Toaster
