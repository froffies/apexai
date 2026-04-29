import { createElementComponent } from "@/components/ui/compat"

export const Alert = createElementComponent("Alert", "div", "rounded-lg border border-slate-200 bg-white p-4 text-sm")
export const AlertTitle = createElementComponent("AlertTitle", "h5", "mb-1 font-semibold leading-none text-slate-950")
export const AlertDescription = createElementComponent("AlertDescription", "div", "text-slate-600")
export default Alert
