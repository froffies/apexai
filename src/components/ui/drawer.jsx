import { createElementComponent } from "@/components/ui/compat"

export const Drawer = createElementComponent("Drawer")
export const DrawerTrigger = createElementComponent("DrawerTrigger", "button")
export const DrawerPortal = createElementComponent("DrawerPortal")
export const DrawerClose = createElementComponent("DrawerClose", "button")
export const DrawerOverlay = createElementComponent("DrawerOverlay", "div", "fixed inset-0 bg-black/50")
export const DrawerContent = createElementComponent("DrawerContent", "div", "rounded-t-xl bg-white p-6")
export const DrawerHeader = createElementComponent("DrawerHeader", "div", "space-y-2")
export const DrawerFooter = createElementComponent("DrawerFooter", "div", "mt-4 flex justify-end gap-2")
export const DrawerTitle = createElementComponent("DrawerTitle", "h2", "text-lg font-semibold")
export const DrawerDescription = createElementComponent("DrawerDescription", "p", "text-sm text-slate-600")
export default Drawer
