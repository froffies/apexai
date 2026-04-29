import { createElementComponent } from "@/components/ui/compat"

export const NavigationMenu = createElementComponent("NavigationMenu", "nav")
export const NavigationMenuList = createElementComponent("NavigationMenuList", "ul", "flex items-center gap-1")
export const NavigationMenuItem = createElementComponent("NavigationMenuItem", "li")
export const NavigationMenuTrigger = createElementComponent("NavigationMenuTrigger", "button", "rounded-md px-3 py-2 text-sm")
export const NavigationMenuContent = createElementComponent("NavigationMenuContent", "div")
export const NavigationMenuLink = createElementComponent("NavigationMenuLink", "a")
export const NavigationMenuViewport = createElementComponent("NavigationMenuViewport", "div")
export const NavigationMenuIndicator = createElementComponent("NavigationMenuIndicator", "div")
export const navigationMenuTriggerStyle = () => "rounded-md px-3 py-2 text-sm"
export default NavigationMenu
