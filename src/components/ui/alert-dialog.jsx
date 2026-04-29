import { createElementComponent } from "@/components/ui/compat"

export const AlertDialog = createElementComponent("AlertDialog")
export const AlertDialogTrigger = createElementComponent("AlertDialogTrigger", "button")
export const AlertDialogPortal = createElementComponent("AlertDialogPortal")
export const AlertDialogOverlay = createElementComponent("AlertDialogOverlay", "div", "fixed inset-0 bg-black/50")
export const AlertDialogContent = createElementComponent("AlertDialogContent", "div", "rounded-lg border border-slate-200 bg-white p-6 shadow-lg")
export const AlertDialogHeader = createElementComponent("AlertDialogHeader", "div", "space-y-2")
export const AlertDialogFooter = createElementComponent("AlertDialogFooter", "div", "mt-4 flex justify-end gap-2")
export const AlertDialogTitle = createElementComponent("AlertDialogTitle", "h2", "text-lg font-semibold")
export const AlertDialogDescription = createElementComponent("AlertDialogDescription", "p", "text-sm text-slate-600")
export const AlertDialogAction = createElementComponent("AlertDialogAction", "button", "rounded-lg bg-indigo-600 px-3 py-2 text-white")
export const AlertDialogCancel = createElementComponent("AlertDialogCancel", "button", "rounded-lg border border-slate-200 px-3 py-2")
export default AlertDialog
