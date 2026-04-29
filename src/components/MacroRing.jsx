const colors = {
  indigo: "#4f46e5",
  red: "#ef4444",
  amber: "#f59e0b",
  blue: "#3b82f6",
  emerald: "#10b981",
}

export default function MacroRing({ value = 0, target = 1, label, unit = "", color = "indigo", size = 100 }) {
  const radius = 42
  const stroke = 9
  const circumference = 2 * Math.PI * radius
  const percentage = Math.min(100, Math.round((Number(value) / Math.max(1, Number(target))) * 100))
  const offset = circumference - (percentage / 100) * circumference
  const strokeColor = colors[color] || colors.indigo

  return (
    <div className="flex flex-col items-center rounded-2xl bg-slate-50 p-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="-rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeLinecap="round"
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold text-slate-950">{Math.round(value)}</span>
          <span className="text-[11px] font-medium text-slate-500">{unit}</span>
        </div>
      </div>
      <div className="mt-2 text-center">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">{percentage}% of goal</p>
      </div>
    </div>
  )
}
