export function Slider({ value = [0], onValueChange, min = 0, max = 100, step = 1, className = "", ...props }) {
  const current = Array.isArray(value) ? value[0] : value
  return <input type="range" min={min} max={max} step={step} value={current} onChange={(event) => onValueChange?.([Number(event.target.value)])} className={className} {...props} />
}
export default Slider
