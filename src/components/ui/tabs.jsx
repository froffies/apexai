import { createElementComponent } from "@/components/ui/compat"

export const Tabs = createElementComponent("Tabs")
export const TabsList = createElementComponent("TabsList", "div", "inline-flex rounded-lg bg-slate-100 p-1")
export const TabsTrigger = createElementComponent("TabsTrigger", "button", "rounded-md px-3 py-1.5 text-sm")
export const TabsContent = createElementComponent("TabsContent", "div", "mt-2")
export default Tabs
