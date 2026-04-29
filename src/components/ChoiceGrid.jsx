import { cn } from "@/lib/utils"

function gridColumnsClass(columns) {
  if (columns === 1) return "grid-cols-1"
  if (columns === 3) return "grid-cols-2 lg:grid-cols-3"
  return "grid-cols-1 sm:grid-cols-2"
}

export default function ChoiceGrid({
  label,
  value,
  onChange,
  options,
  columns = 2,
  className = "",
  compact = false,
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      {label ? <p className="text-sm font-medium text-slate-700">{label}</p> : null}
      <div
        role="radiogroup"
        aria-label={label}
        className={cn("grid gap-2", gridColumnsClass(columns))}
      >
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                compact ? "min-h-11 rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.99]" : "min-h-11 rounded-xl border px-3 py-3 text-left transition active:scale-[0.99]",
                selected
                  ? "border-indigo-500 bg-indigo-50 text-indigo-950 shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              )}
            >
              <span className="block text-sm font-semibold">{option.label}</span>
              {option.description && !compact ? (
                <span className={cn("mt-1 block text-sm", selected ? "text-indigo-700" : "text-slate-500")}>
                  {option.description}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
