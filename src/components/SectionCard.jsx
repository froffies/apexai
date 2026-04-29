import { cn } from "@/lib/utils"

const toneClasses = {
  default: "border-slate-200 bg-white shadow-sm",
  subtle: "border-slate-200 bg-slate-50/85 shadow-sm",
  indigo: "border-indigo-100 bg-[linear-gradient(135deg,rgba(238,242,255,1),rgba(255,255,255,1))] shadow-sm",
  emerald: "border-emerald-100 bg-[linear-gradient(135deg,rgba(236,253,245,1),rgba(255,255,255,1))] shadow-sm",
}

export default function SectionCard({
  eyebrow = "",
  title = "",
  description = "",
  action = null,
  children,
  tone = "default",
  className = "",
  contentClassName = "",
}) {
  const hasHeader = eyebrow || title || description || action

  return (
    <section className={cn("rounded-2xl border p-5", toneClasses[tone] || toneClasses.default, className)}>
      {hasHeader && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">{eyebrow}</p> : null}
            {title ? <h2 className="mt-1 text-lg font-semibold text-slate-950 sm:text-xl">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      {children ? <div className={cn(hasHeader ? "mt-4" : "", contentClassName)}>{children}</div> : null}
    </section>
  )
}
