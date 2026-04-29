import { createElementComponent } from "@/components/ui/compat"

export const InputOTP = createElementComponent("InputOTP", "input", "rounded-lg border border-slate-200 px-3 py-2")
export const InputOTPGroup = createElementComponent("InputOTPGroup", "div", "flex items-center gap-2")
export const InputOTPSlot = createElementComponent("InputOTPSlot", "div", "flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200")
export const InputOTPSeparator = createElementComponent("InputOTPSeparator", "span", "text-slate-400")
export default InputOTP
