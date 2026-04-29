import { createElementComponent } from "@/components/ui/compat"

export const HoverCard = createElementComponent("HoverCard")
export const HoverCardTrigger = createElementComponent("HoverCardTrigger", "button")
export const HoverCardContent = createElementComponent("HoverCardContent", "div", "rounded-lg border border-slate-200 bg-white p-4 shadow")
export default HoverCard
