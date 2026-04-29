import { createElementComponent } from "@/components/ui/compat"

export const Breadcrumb = createElementComponent("Breadcrumb", "nav")
export const BreadcrumbList = createElementComponent("BreadcrumbList", "ol", "flex flex-wrap items-center gap-1 text-sm text-slate-500")
export const BreadcrumbItem = createElementComponent("BreadcrumbItem", "li", "inline-flex items-center gap-1")
export const BreadcrumbLink = createElementComponent("BreadcrumbLink", "a", "hover:text-slate-950")
export const BreadcrumbPage = createElementComponent("BreadcrumbPage", "span", "font-normal text-slate-950")
export const BreadcrumbSeparator = createElementComponent("BreadcrumbSeparator", "li", "text-slate-400")
export const BreadcrumbEllipsis = createElementComponent("BreadcrumbEllipsis", "span", "text-slate-400")
export default Breadcrumb
