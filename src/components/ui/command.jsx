import { createElementComponent } from "@/components/ui/compat"

export const Command = createElementComponent("Command", "div", "rounded-lg border border-slate-200 bg-white")
export const CommandInput = createElementComponent("CommandInput", "input", "w-full border-b border-slate-200 px-3 py-2")
export const CommandList = createElementComponent("CommandList", "div")
export const CommandEmpty = createElementComponent("CommandEmpty", "div", "p-3 text-sm text-slate-500")
export const CommandGroup = createElementComponent("CommandGroup", "div", "p-2")
export const CommandItem = createElementComponent("CommandItem", "div", "rounded-md px-2 py-1.5 text-sm")
export const CommandSeparator = createElementComponent("CommandSeparator", "div", "my-1 h-px bg-slate-200")
export const CommandShortcut = createElementComponent("CommandShortcut", "span", "ml-auto text-xs text-slate-400")
export default Command
