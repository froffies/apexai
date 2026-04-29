import { Link, useLocation, useNavigate } from "react-router-dom"
import { BarChart3, Bot, Camera, Dumbbell, Home, LineChart, Salad, Trophy, UserRound } from "lucide-react"
import ActiveWorkoutBar from "@/components/ActiveWorkoutBar"
import { createPageUrl } from "@/utils"
import { getTabFromPath, TAB_ROOTS, useTabStack } from "@/lib/tabStack"

const navItems = [
  { name: "Home", path: "/", icon: Home },
  { name: "Coach", path: createPageUrl("Coach"), icon: Bot },
  { name: "Workouts", path: createPageUrl("Workouts"), icon: Dumbbell },
  { name: "Nutrition", path: createPageUrl("Nutrition"), icon: Salad },
  { name: "Progress", path: createPageUrl("Progress"), icon: LineChart },
  { name: "Profile", path: createPageUrl("Profile"), icon: UserRound },
]

const quickLinks = [
  { name: "Analytics", path: createPageUrl("Analytics"), icon: BarChart3 },
  { name: "Photos", path: createPageUrl("ProgressPhotos"), icon: Camera },
  { name: "Challenges", path: createPageUrl("Challenges"), icon: Trophy },
]

function isActive(pathname, item, currentTab) {
  if (item.name in TAB_ROOTS) return currentTab === item.name
  if (item.path === "/") return pathname === "/" || pathname === "/Home"
  return pathname.startsWith(item.path)
}

function NavLink({ item, compact = false }) {
  const location = useLocation()
  const navigate = useNavigate()
  const tabStack = useTabStack()
  const isPrimaryTab = item.name in TAB_ROOTS
  const tabName = isPrimaryTab ? item.name : getTabFromPath(item.path)
  const active = isActive(location.pathname, item, tabStack?.currentTab)
  const Icon = item.icon

  const handleClick = (event) => {
    if (!tabName || !(tabName in TAB_ROOTS)) {
      if (active) window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    event.preventDefault()
    if (!isPrimaryTab) {
      navigate(item.path)
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    if (tabStack?.currentTab === tabName) {
      tabStack.resetStack(tabName)
      navigate(TAB_ROOTS[tabName])
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    navigate(tabStack?.getLastPath?.(tabName) || TAB_ROOTS[tabName])
  }

  return (
    <Link
      to={item.path}
      onClick={handleClick}
      className={[
        "flex select-none items-center rounded-lg transition-colors active:scale-95",
        compact ? "min-h-[56px] flex-col justify-center gap-1 px-2 text-sm" : "min-h-11 gap-3 px-3 py-2 text-sm",
        active ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
      ].join(" ")}
    >
      <Icon size={compact ? 18 : 17} />
      <span className={compact ? "text-[10px] leading-none sm:text-sm" : ""}>{item.name}</span>
    </Link>
  )
}

export default function Layout({ children, currentPageName: _currentPageName }) {
  const location = useLocation()
  const mobileChromeHidden = ["/nutrition/log", "/workouts/log"].includes(location.pathname.toLowerCase())

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
      <aside aria-label="Primary sidebar" className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white px-4 pb-5 md:block" style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}>
        <Link to="/" className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">AI</div>
          <div>
            <p className="font-bold leading-tight">ApexAI</p>
            <p className="text-xs text-slate-500">Training and nutrition coach</p>
          </div>
        </Link>

        <nav aria-label="Primary sidebar links" className="mt-6 space-y-1">
          {navItems.map((item) => (
            <NavLink key={item.name} item={item} />
          ))}
        </nav>

        <div className="mt-6 border-t border-slate-100 pt-4">
          <p className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">More</p>
          <div className="mt-2 space-y-1">
            {quickLinks.map((item) => (
              <NavLink key={item.name} item={item} />
            ))}
          </div>
        </div>
      </aside>

      <main className={`min-h-screen overflow-x-hidden md:ml-64 ${mobileChromeHidden ? "pb-6 md:pb-0" : "pb-24 md:pb-0"}`}>{children}</main>
      {!mobileChromeHidden && <ActiveWorkoutBar />}

      {!mobileChromeHidden && (
        <nav aria-label="Primary tabs" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-slate-200 bg-white/95 px-2 pt-2 backdrop-blur md:hidden" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          {navItems.map((item) => (
            <NavLink key={item.name} item={item} compact />
          ))}
        </nav>
      )}
    </div>
  )
}
