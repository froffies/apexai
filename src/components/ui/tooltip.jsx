import { createElementComponent } from "@/components/ui/compat"

export const Tooltip = createElementComponent("Tooltip")
export const TooltipTrigger = createElementComponent("TooltipTrigger", "button")
export const TooltipContent = createElementComponent("TooltipContent", "div", "rounded-lg bg-slate-950 px-2 py-1 text-xs text-white")
export const TooltipProvider = ({ children }) => children
export default Tooltip
