export default function PageHeader({ eyebrow = "", title, subtitle = "", action = null }) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">{eyebrow}</p>}
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 self-start lg:max-w-[45%]">{action}</div>}
    </header>
  )
}
