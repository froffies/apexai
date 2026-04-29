import { cn } from "@/lib/utils"

export default function SegmentedControl({ label = "", value, onChange, options = [], className = "" }) {
  return (
    <div className={cn("grid gap-2", className)}>
      {label ? <p className="text-sm font-medium text-slate-600">{label}</p> : null}
      <div className="inline-flex w-full flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                selected ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
