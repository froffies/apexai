import { createElementComponent } from "@/components/ui/compat"

export const Popover = createElementComponent("Popover")
export const PopoverTrigger = createElementComponent("PopoverTrigger", "button")
export const PopoverContent = createElementComponent("PopoverContent", "div", "rounded-lg border border-slate-200 bg-white p-4 shadow")
export default Popover
