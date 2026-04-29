import { createElementComponent } from "@/components/ui/compat"

export const Select = createElementComponent("Select", "select", "rounded-lg border border-slate-200 px-3 py-2")
export const SelectGroup = createElementComponent("SelectGroup")
export const SelectValue = createElementComponent("SelectValue", "span")
export const SelectTrigger = createElementComponent("SelectTrigger", "button", "rounded-lg border border-slate-200 px-3 py-2")
export const SelectContent = createElementComponent("SelectContent", "div", "rounded-lg border border-slate-200 bg-white p-1 shadow")
export const SelectLabel = createElementComponent("SelectLabel", "div", "px-2 py-1.5 text-sm font-semibold")
export const SelectItem = createElementComponent("SelectItem", "option")
export const SelectSeparator = createElementComponent("SelectSeparator", "div", "my-1 h-px bg-slate-200")
export default Select
