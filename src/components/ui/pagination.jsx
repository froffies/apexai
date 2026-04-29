import { createElementComponent } from "@/components/ui/compat"

export const Pagination = createElementComponent("Pagination", "nav")
export const PaginationContent = createElementComponent("PaginationContent", "ul", "flex items-center gap-1")
export const PaginationItem = createElementComponent("PaginationItem", "li")
export const PaginationLink = createElementComponent("PaginationLink", "a", "rounded-md border border-slate-200 px-3 py-2 text-sm")
export const PaginationPrevious = PaginationLink
export const PaginationNext = PaginationLink
export const PaginationEllipsis = createElementComponent("PaginationEllipsis", "span", "px-3 py-2 text-sm")
export default Pagination
