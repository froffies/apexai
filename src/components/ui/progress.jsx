export function Progress({ value = 0, className = "", ...props }) {
  return <div className={`h-2 overflow-hidden rounded-full bg-slate-100 ${className}`} {...props}><div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.max(0, Math.min(100, Number(value) || 0))}%` }} /></div>
}
export default Progress
