import * as React from "react"
import { cn } from "@/lib/utils"

export function createElementComponent(displayName, element = "div", baseClass = "") {
  const Component = React.forwardRef(({ className, asChild: _asChild, ...props }, ref) => {
    const Tag = element
    return <Tag ref={ref} className={cn(baseClass, className)} {...props} />
  })
  Component.displayName = displayName
  return Component
}

export const Div = createElementComponent("Div")
export const Span = createElementComponent("Span", "span")
export const ButtonLike = createElementComponent("ButtonLike", "button")
export const InputLike = createElementComponent("InputLike", "input")
export const TextareaLike = createElementComponent("TextareaLike", "textarea")
