import { createElementComponent } from "@/components/ui/compat"

export const Sheet = createElementComponent("Sheet")
export const SheetTrigger = createElementComponent("SheetTrigger", "button")
export const SheetClose = createElementComponent("SheetClose", "button")
export const SheetPortal = createElementComponent("SheetPortal")
export const SheetOverlay = createElementComponent("SheetOverlay", "div", "fixed inset-0 bg-black/50")
export const SheetContent = createElementComponent("SheetContent", "div", "bg-white p-6 shadow-lg")
export const SheetHeader = createElementComponent("SheetHeader", "div", "space-y-2")
export const SheetFooter = createElementComponent("SheetFooter", "div", "mt-4 flex justify-end gap-2")
export const SheetTitle = createElementComponent("SheetTitle", "h2", "text-lg font-semibold")
export const SheetDescription = createElementComponent("SheetDescription", "p", "text-sm text-slate-600")
export default Sheet
