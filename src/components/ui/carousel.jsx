import { createElementComponent } from "@/components/ui/compat"

export const Carousel = createElementComponent("Carousel", "div", "relative")
export const CarouselContent = createElementComponent("CarouselContent", "div", "flex overflow-hidden")
export const CarouselItem = createElementComponent("CarouselItem", "div", "min-w-0 shrink-0 grow-0 basis-full")
export const CarouselPrevious = createElementComponent("CarouselPrevious", "button", "rounded-full border border-slate-200 p-2")
export const CarouselNext = createElementComponent("CarouselNext", "button", "rounded-full border border-slate-200 p-2")
export default Carousel
