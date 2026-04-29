export function AspectRatio({ ratio = 16 / 9, className = "", style, ...props }) {
  return <div className={className} style={{ aspectRatio: ratio, ...style }} {...props} />
}
export default AspectRatio
