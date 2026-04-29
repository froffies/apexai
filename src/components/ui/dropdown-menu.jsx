import { createElementComponent } from "@/components/ui/compat"

export const DropdownMenu = createElementComponent("DropdownMenu")
export const DropdownMenuTrigger = createElementComponent("DropdownMenuTrigger", "button")
export const DropdownMenuContent = createElementComponent("DropdownMenuContent", "div", "rounded-lg border border-slate-200 bg-white p-1 shadow")
export const DropdownMenuItem = createElementComponent("DropdownMenuItem", "div", "rounded-md px-2 py-1.5 text-sm")
export const DropdownMenuCheckboxItem = DropdownMenuItem
export const DropdownMenuRadioItem = DropdownMenuItem
export const DropdownMenuLabel = createElementComponent("DropdownMenuLabel", "div", "px-2 py-1.5 text-sm font-semibold")
export const DropdownMenuSeparator = createElementComponent("DropdownMenuSeparator", "div", "my-1 h-px bg-slate-200")
export const DropdownMenuShortcut = createElementComponent("DropdownMenuShortcut", "span", "ml-auto text-xs text-slate-400")
export const DropdownMenuGroup = createElementComponent("DropdownMenuGroup")
export const DropdownMenuPortal = createElementComponent("DropdownMenuPortal")
export const DropdownMenuSub = createElementComponent("DropdownMenuSub")
export const DropdownMenuSubContent = DropdownMenuContent
export const DropdownMenuSubTrigger = DropdownMenuItem
export const DropdownMenuRadioGroup = createElementComponent("DropdownMenuRadioGroup")
export default DropdownMenu
