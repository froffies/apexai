import { createElementComponent } from "@/components/ui/compat"

export const ChartContainer = createElementComponent("ChartContainer", "div", "w-full")
export const ChartTooltip = createElementComponent("ChartTooltip")
export const ChartTooltipContent = createElementComponent("ChartTooltipContent", "div", "rounded-lg border border-slate-200 bg-white p-2 text-sm shadow")
export const ChartLegend = createElementComponent("ChartLegend")
export const ChartLegendContent = createElementComponent("ChartLegendContent", "div", "flex flex-wrap gap-3 text-sm")
export const ChartStyle = () => null
export default ChartContainer
