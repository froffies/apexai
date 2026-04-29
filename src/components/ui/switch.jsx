export function Switch({ checked, onCheckedChange, className = "", ...props }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={() => onCheckedChange?.(!checked)} className={`h-6 w-11 rounded-full ${checked ? "bg-indigo-600" : "bg-slate-300"} ${className}`} {...props}><span className={`block h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} /></button>
}
export default Switch
