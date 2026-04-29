import { createContext, useContext } from "react"

export const TAB_ROOTS = {
  Home: "/",
  Coach: "/Coach",
  Workouts: "/Workouts",
  Nutrition: "/Nutrition",
  Progress: "/Progress",
  Profile: "/Profile",
}

export const TAB_ROUTES = {
  Home: ["/Home", "/"],
  Coach: ["/Coach"],
  Workouts: ["/Workouts", "/WorkoutsLog", "/workouts/log", "/WorkoutLibrary"],
  Nutrition: ["/Nutrition", "/NutritionLog", "/nutrition/log", "/Recipes", "/ShoppingList"],
  Progress: ["/Progress", "/ProgressPhotos"],
  Profile: ["/Profile", "/Analytics", "/Challenges"],
}

export const initialTabStacks = Object.fromEntries(
  Object.entries(TAB_ROOTS).map(([tab, root]) => [tab, [root]])
)

export function getTabFromPath(path) {
  for (const [tab, routes] of Object.entries(TAB_ROUTES)) {
    if (routes.some((route) => route === "/" ? path === "/" || path === "/Home" : path.startsWith(route))) return tab
  }
  return null
}

export const TabStackContext = createContext(null)

export function useTabStack() {
  return useContext(TabStackContext)
}
