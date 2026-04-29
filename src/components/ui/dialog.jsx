import { createElementComponent } from "@/components/ui/compat"

export const Dialog = createElementComponent("Dialog")
export const DialogTrigger = createElementComponent("DialogTrigger", "button")
export const DialogPortal = createElementComponent("DialogPortal")
export const DialogClose = createElementComponent("DialogClose", "button")
export const DialogOverlay = createElementComponent("DialogOverlay", "div", "fixed inset-0 bg-black/50")
export const DialogContent = createElementComponent("DialogContent", "div", "rounded-lg border border-slate-200 bg-white p-6 shadow-lg")
export const DialogHeader = createElementComponent("DialogHeader", "div", "space-y-2")
export const DialogFooter = createElementComponent("DialogFooter", "div", "mt-4 flex justify-end gap-2")
export const DialogTitle = createElementComponent("DialogTitle", "h2", "text-lg font-semibold")
export const DialogDescription = createElementComponent("DialogDescription", "p", "text-sm text-slate-600")
export default Dialog
