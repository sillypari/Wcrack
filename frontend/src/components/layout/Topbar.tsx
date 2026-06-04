import * as React from "react"
import { Volume2, VolumeX, FileDown, AlertTriangle, Maximize2, Minimize2 } from "lucide-react"
import { useWcarckStore } from "@/store/useWcarckStore"
import { Button } from "@/components/ui/button"
import { AppTooltip } from "@/components/ui/app-tooltip"
import { toast } from "sonner"
import { cn, copyToClipboard } from "@/lib/utils"

export function Topbar() {
  const { uiState, toggleAudio, adapters, sessionStartedAt, logs, projects, activeProjectId, wsConnected } = useWcarckStore()
  const [elapsed, setElapsed] = React.useState("00:00:00")
  const [isFullscreen, setIsFullscreen] = React.useState(!!document.fullscreenElement)
  
  const errors = logs.filter(l => l.level === 'ERROR' || l.level === 'CRITICAL').length
  const activeProject = projects.find(p => p.id === activeProjectId)

  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        toast.error(`Error enabling fullscreen: ${err.message}`)
      })
    } else {
      document.exitFullscreen()
    }
  }

  const [timeStr, setTimeStr] = React.useState("")

  React.useEffect(() => {
    const updateClock = () => {
      const now = new Date()
      const hrs = now.getHours().toString().padStart(2, '0')
      const mins = now.getMinutes().toString().padStart(2, '0')
      const secs = now.getSeconds().toString().padStart(2, '0')
      setTimeStr(`${hrs}:${mins}:${secs}`)
    }
    updateClock()
    const interval = setInterval(updateClock, 1000)
    return () => clearInterval(interval)
  }, [])

  React.useEffect(() => {
    if (!sessionStartedAt) return
    const interval = setInterval(() => {
      const ms = Date.now() - sessionStartedAt
      const s = Math.floor((ms / 1000) % 60)
      const m = Math.floor((ms / (1000 * 60)) % 60)
      const h = Math.floor(ms / (1000 * 60 * 60))
      setElapsed(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(interval)
  }, [sessionStartedAt])

  const copyDebugReport = async () => {
    const report = `Wcarck Debug Report\nGenerated: ${new Date().toISOString()}\nSession: ${elapsed}\nAdapters: ${adapters.length}\nLast 100 events:\n${JSON.stringify(logs.slice(0, 100), null, 2)}`
    const success = await copyToClipboard(report)
    if (success) {
      toast.success("Debug report copied to clipboard")
    } else {
      toast.error("Failed to copy report to clipboard")
    }
  }

  return (
    <header className="relative flex items-center justify-between h-12 px-4 bg-glass-bg backdrop-blur-md border-b border-border-subtle sticky top-0 z-10 flex-shrink-0 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-accent/30 after:to-transparent">
      {/* LEFT: Logo + session timer + active project */}
      <div className="flex items-center space-x-4">
        {/* Logo mark - shifted to sidebar when sidebar is expanded */}
        {!uiState.sidebarPinned && (
          <div className="flex items-center space-x-2.5">
            <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center">
              <span className="text-white text-xs font-black font-mono tracking-tight">W</span>
            </div>
            <span className="font-semibold text-text-primary text-sm tracking-tight">Wcarck</span>
          </div>
        )}

        {/* Session timer */}
        <div className="flex items-center text-xs font-mono text-text-secondary bg-bg-elevated px-2.5 py-1 rounded border border-border-subtle">
          <span
            className={`w-1.5 h-1.5 rounded-full mr-2 flex-shrink-0 ${
              sessionStartedAt ? 'bg-status-running animate-pulse-green' : 'bg-status-idle'
            }`}
          />
          {elapsed}
        </div>

        {/* Active Project badge */}
        {activeProject && (
          <div className="flex items-center text-xs font-medium text-accent bg-accent/8 px-2.5 py-1 rounded border border-accent/20">
            Engagement: {activeProject.client ? `${activeProject.client} - ${activeProject.name}` : activeProject.name}
          </div>
        )}
      </div>

      {/* CENTER: Live Clock */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center space-x-1.5 px-3 py-1 rounded-full border border-border-subtle bg-bg-elevated text-xs font-mono text-text-secondary select-none">
        <span>{timeStr}</span>
      </div>

      {/* RIGHT: adapter dots + controls */}
      <div className="flex items-center space-x-2">
        {/* Adapter status dots */}
        {adapters.length > 0 && (
          <div className="flex items-center space-x-1.5 mr-2">
            {adapters.map((a) => (
              <AppTooltip
                key={a.iface}
                content={`${a.iface} — ${a.mode} — ${a.status}`}
                delayDuration={100}
                side="bottom"
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full border cursor-default ${
                    a.status === 'up' ? 'bg-status-success border-status-success/50' :
                    a.status === 'scanning' || a.status === 'injecting'
                      ? 'bg-status-running border-status-running/50 animate-pulse-green' :
                    a.status === 'down' ? 'bg-status-error border-status-error/50' :
                    'bg-status-idle border-border-subtle'
                  }`}
                />
              </AppTooltip>
            ))}
          </div>
        )}

        {/* Audio toggle */}
        <AppTooltip content={uiState.audioEnabled ? "Mute audio alerts" : "Enable audio alerts"} side="bottom">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleAudio}
            className="text-text-tertiary hover:text-text-primary h-8 w-8 flex-shrink-0"
            aria-label={uiState.audioEnabled ? "Mute audio alerts" : "Enable audio alerts"}
          >
            {uiState.audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>
        </AppTooltip>

        {/* Fullscreen toggle */}
        <AppTooltip content={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} side="bottom">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            className="text-text-tertiary hover:text-text-primary h-8 w-8 flex-shrink-0"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </AppTooltip>

        {/* Debug report */}
        <AppTooltip content="Copy debug report for AI troubleshooting" side="bottom">
          <Button
            variant="ghost"
            size="icon"
            onClick={copyDebugReport}
            className="text-text-tertiary hover:text-text-primary h-8 w-8 flex-shrink-0"
            aria-label="Copy debug report"
          >
            <FileDown className="w-4 h-4" />
          </Button>
        </AppTooltip>

        {/* Error count badge */}
        {!wsConnected ? (
          <AppTooltip content="WebSocket backend is disconnected. UI may be stale. Auto-reconnecting..." side="bottom">
            <div className="flex items-center gap-1 px-2 py-1 bg-accent/20 text-accent rounded border border-accent/40 text-xs font-bold flex-shrink-0 animate-pulse">
              <AlertTriangle className="w-3 h-3" />
              DISCONNECTED
            </div>
          </AppTooltip>
        ) : errors > 0 ? (
          <div className="flex items-center gap-1 px-2 py-1 bg-status-error/10 text-status-error rounded border border-status-error/20 text-xs font-medium flex-shrink-0">
            <AlertTriangle className="w-3 h-3" />
            {errors}
          </div>
        ) : (
          <div className="px-2 py-1 bg-bg-elevated text-text-disabled rounded border border-border-subtle text-xs font-medium flex-shrink-0">
            OK
          </div>
        )}
      </div>
    </header>
  )
}
