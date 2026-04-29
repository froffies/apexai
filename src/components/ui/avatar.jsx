import { createElementComponent } from "@/components/ui/compat"

export const Avatar = createElementComponent("Avatar", "div", "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full")
export const AvatarImage = createElementComponent("AvatarImage", "img", "aspect-square h-full w-full")
export const AvatarFallback = createElementComponent("AvatarFallback", "div", "flex h-full w-full items-center justify-center rounded-full bg-slate-100")
export default Avatar
