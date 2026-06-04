import * as React from "react"
import { NavLink } from "react-router-dom"
import { LayoutDashboard, Radar, Zap, Ghost, FileDown, KeyRound, ScrollText, Wifi, Hammer, PanelLeftOpen, PanelLeftClose, FolderOpen } from "lucide-react"
import { useWcarckStore } from "@/store/useWcarckStore"
import { AppTooltip } from "@/components/ui/app-tooltip"
import { cn } from "@/lib/utils"

const NAV_PRIMARY = [
  { icon: LayoutDashboard, label: "Dashboard",     path: "/" },
  { icon: FolderOpen,      label: "Projects",      path: "/projects" },
  { icon: Radar,           label: "Reconnaissance", path: "/recon" },
  { icon: Zap,             label: "Attacks",        path: "/attack" },
  { icon: Ghost,           label: "Evil Twin",      path: "/eviltwin" },
  { icon: FileDown,        label: "Captures",       path: "/captures" },
  { icon: Hammer,          label: "Crack",          path: "/crack" },
  { icon: KeyRound,        label: "Credentials",    path: "/credentials" },
]

const NAV_SECONDARY = [
  { icon: ScrollText, label: "Logs",     path: "/logs" },
  { icon: Wifi,       label: "Adapters", path: "/adapters" },
]

function NavItem({
  item,
  isPinned,
  hasErrorBadge,
}: {
  item: { icon: React.ElementType; label: string; path: string }
  isPinned: boolean
  hasErrorBadge?: boolean
}) {
  const navContent = (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      className={({ isActive }) =>
        cn(
          "flex items-center h-10 transition-colors duration-fast relative overflow-hidden",
          isPinned ? "px-4" : "justify-center",
          isActive
            ? "text-accent bg-accent/8"
            : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
        )
      }
    >
      <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
      {isPinned && (
        <span className="ml-3 text-sm font-medium whitespace-nowrap transition-opacity duration-200 opacity-100">
          {item.label}
        </span>
      )}
      {hasErrorBadge && (
        <span className="absolute right-2 top-2 w-1.5 h-1.5 rounded-full bg-status-error" />
      )}
    </NavLink>
  )

  return isPinned ? (
    <div key={item.path}>{navContent}</div>
  ) : (
    <AppTooltip key={item.path} content={item.label} delayDuration={0} side="right">
      <div>{navContent}</div>
    </AppTooltip>
  )
}

export function Sidebar() {
  const { uiState, toggleSidebar, logs } = useWcarckStore()
  const isPinned = uiState.sidebarPinned
  const hasErrors = logs.some(l => l.level === "ERROR" || l.level === "CRITICAL")

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-bg-surface border-r border-border-subtle transition-[width] duration-250 ease-default z-20 flex-shrink-0 overflow-hidden",
        isPinned ? "w-[220px]" : "w-[64px]"
      )}
    >
      {/* PIN TOGGLE */}
      <div
        className={cn(
          "flex items-center h-12 border-b border-border-subtle flex-shrink-0 px-4",
          isPinned ? "justify-between" : "justify-center"
        )}
      >
        {isPinned && (
          <div className="flex items-center space-x-2.5">
            <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center">
              <span className="text-white text-xs font-black font-mono tracking-tight">W</span>
            </div>
            <span className="font-semibold text-text-primary text-sm tracking-tight">Wcarck</span>
          </div>
        )}
        <AppTooltip content={isPinned ? "Collapse sidebar" : "Pin sidebar"} delayDuration={0} side="right">
          <button
            onClick={toggleSidebar}
            className="text-text-tertiary hover:text-text-primary transition-colors flex items-center justify-center w-8 h-8 rounded-md hover:bg-bg-hover"
          >
            {isPinned ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
        </AppTooltip>
      </div>

      {/* PRIMARY NAV */}
      <div className="flex-1 py-2 overflow-y-auto overflow-x-hidden flex flex-col">
        <div className="flex flex-col space-y-0.5">
          {NAV_PRIMARY.map(item => (
            <NavItem key={item.path} item={item} isPinned={isPinned} />
          ))}
        </div>

        {/* DIVIDER */}
        <div className="mx-4 my-2 h-px bg-border-subtle flex-shrink-0" />

        {/* SECONDARY NAV */}
        <div className="flex flex-col space-y-0.5">
          {NAV_SECONDARY.map(item => (
            <NavItem
              key={item.path}
              item={item}
              isPinned={isPinned}
              hasErrorBadge={item.path === "/logs" && hasErrors}
            />
          ))}
        </div>
      </div>
    </aside>
  )
}
