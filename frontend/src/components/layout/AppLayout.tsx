import * as React from "react"
import { Topbar } from "./Topbar"
import { Sidebar } from "./Sidebar"
import { ContentZone } from "./ContentZone"
import { Toaster } from "sonner"
import { CommandPalette } from "@/components/ui/command-palette"
import { WelcomeOverlay } from "@/components/welcome-overlay"
import { useAudioAlerts } from "@/hooks/useAudioAlerts"
import { useWcarckStore } from "@/store/useWcarckStore"

export function AppLayout({ children }: { children: React.ReactNode }) {
  useAudioAlerts()
  const { uiState } = useWcarckStore()
  
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-root text-text-primary">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar />
        <ContentZone>
          {children}
        </ContentZone>
      </div>
      <Toaster 
        theme="dark" 
        position="bottom-center" 
        duration={4000} 
        visibleToasts={3}
        style={{
          left: `calc(50% + ${uiState.sidebarPinned ? '110px' : '32px'})`
        }}
        toastOptions={{
          style: { background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' },
        }}
      />
      <CommandPalette />
      <WelcomeOverlay />
    </div>
  )
}
