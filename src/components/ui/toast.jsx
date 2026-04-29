import { createElementComponent } from "@/components/ui/compat"

export const Toast = createElementComponent("Toast", "div", "rounded-lg border border-slate-200 bg-white p-4 shadow")
export const ToastProvider = ({ children }) => children
export const ToastViewport = createElementComponent("ToastViewport", "div")
export const ToastTitle = createElementComponent("ToastTitle", "div", "font-semibold")
export const ToastDescription = createElementComponent("ToastDescription", "div", "text-sm text-slate-600")
export const ToastClose = createElementComponent("ToastClose", "button")
export const ToastAction = createElementComponent("ToastAction", "button")
export default Toast
