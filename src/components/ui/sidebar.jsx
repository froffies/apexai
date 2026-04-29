import { createElementComponent } from "@/components/ui/compat"

export const Sidebar = createElementComponent("Sidebar", "aside", "border-r border-slate-200 bg-white")
export const SidebarProvider = ({ children }) => children
export const SidebarTrigger = createElementComponent("SidebarTrigger", "button")
export const SidebarContent = createElementComponent("SidebarContent")
export const SidebarHeader = createElementComponent("SidebarHeader")
export const SidebarFooter = createElementComponent("SidebarFooter")
export const SidebarGroup = createElementComponent("SidebarGroup")
export const SidebarGroupLabel = createElementComponent("SidebarGroupLabel", "div", "text-xs font-semibold uppercase text-slate-400")
export const SidebarGroupContent = createElementComponent("SidebarGroupContent")
export const SidebarMenu = createElementComponent("SidebarMenu", "ul")
export const SidebarMenuItem = createElementComponent("SidebarMenuItem", "li")
export const SidebarMenuButton = createElementComponent("SidebarMenuButton", "button")
export const SidebarInset = createElementComponent("SidebarInset")
export const useSidebar = () => ({ open: true, setOpen: () => {}, isMobile: false })
export default Sidebar
