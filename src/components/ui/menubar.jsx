import { createElementComponent } from "@/components/ui/compat"

export const Menubar = createElementComponent("Menubar", "div", "flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1")
export const MenubarMenu = createElementComponent("MenubarMenu")
export const MenubarTrigger = createElementComponent("MenubarTrigger", "button", "rounded-md px-3 py-1.5 text-sm")
export const MenubarContent = createElementComponent("MenubarContent", "div", "rounded-lg border border-slate-200 bg-white p-1 shadow")
export const MenubarItem = createElementComponent("MenubarItem", "div", "rounded-md px-2 py-1.5 text-sm")
export const MenubarCheckboxItem = MenubarItem
export const MenubarRadioItem = MenubarItem
export const MenubarLabel = createElementComponent("MenubarLabel", "div", "px-2 py-1.5 text-sm font-semibold")
export const MenubarSeparator = createElementComponent("MenubarSeparator", "div", "my-1 h-px bg-slate-200")
export const MenubarShortcut = createElementComponent("MenubarShortcut", "span", "ml-auto text-xs text-slate-400")
export const MenubarGroup = createElementComponent("MenubarGroup")
export const MenubarPortal = createElementComponent("MenubarPortal")
export const MenubarSub = createElementComponent("MenubarSub")
export const MenubarSubContent = MenubarContent
export const MenubarSubTrigger = MenubarItem
export const MenubarRadioGroup = createElementComponent("MenubarRadioGroup")
export default Menubar
