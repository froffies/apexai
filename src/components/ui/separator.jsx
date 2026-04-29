export function Separator({ className = "", orientation = "horizontal", ...props }) {
  return <div className={`${orientation === "vertical" ? "h-full w-px" : "h-px w-full"} bg-slate-200 ${className}`} {...props} />
}
export default Separator
