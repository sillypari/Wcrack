import * as React from 'react'
import { Activity, Zap, Users, Key, Play, Square, Wifi, AlertCircle } from 'lucide-react'
import { useWcarckStore, Adapter } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { AppTooltip } from '@/components/ui/app-tooltip'

// Compact metric pill displayed in the top strip
function MetricPill({
  label,
  value,
  icon: Icon,
  tooltip,
  onClick,
}: {
  label: string
  value: number
  icon: React.ElementType
  tooltip: string
  onClick?: () => void
}) {
  return (
    <AppTooltip content={tooltip} side="bottom">
      <button
        onClick={onClick}
        className="flex-1 min-w-0 bg-bg-elevated border border-border-subtle rounded-lg px-4 py-3 flex items-center justify-between group hover:bg-bg-hover transition-colors"
      >
        <div className="flex flex-col items-start">
          <span className="text-[10px] font-semibold text-text-disabled uppercase tracking-widest mb-1">{label}</span>
          <span className="text-2xl font-bold text-text-primary leading-none tabular-nums">{value}</span>
        </div>
        <Icon className="w-5 h-5 flex-shrink-0 text-text-secondary group-hover:text-text-primary transition-colors" />
      </button>
    </AppTooltip>
  )
}

// Compact adapter row inside the left panel with hover controls
function AdapterRow({ adapter, onClick }: { adapter: Adapter; onClick: () => void }) {
  const { startJob, stopJob, activeJobs } = useWcarckStore()
  const isMonitor = adapter.mode === 'monitor'
  const isAP = adapter.mode === 'ap'
  const isDown = adapter.status === 'down'
  const isActive = adapter.status === 'scanning' || adapter.status === 'injecting'
  const isScanning = activeJobs.some(j => j.type === 'recon')

  return (
    <div className="w-full flex items-center justify-between hover:bg-bg-hover transition-colors pr-3 group/row">
      <AppTooltip content={`${adapter.iface} (${adapter.chipset}) status is ${adapter.status}`} side="top">
        <button
          onClick={onClick}
          className="flex-1 flex items-center gap-3 px-4 py-2.5 text-left min-w-0"
        >
          {/* Status dot */}
          <div
            className={cn(
              'w-2.5 h-2.5 rounded-full flex-shrink-0',
              isDown ? 'bg-status-error' :
              isActive ? 'bg-status-running animate-pulse-green' :
              isMonitor ? 'bg-status-running' :
              isAP ? 'bg-rf-band-5' :
              'bg-status-idle'
            )}
          />
          {/* Interface name */}
          <span className="font-mono text-sm text-text-primary font-medium flex-shrink-0 w-20">{adapter.iface}</span>
          {/* Mode badge */}
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider flex-shrink-0',
            isMonitor ? 'bg-status-running/15 text-status-running' :
            isAP ? 'bg-rf-band-5/15 text-rf-band-5' :
            'bg-bg-active text-text-disabled'
          )}>
            {adapter.mode}
          </span>
          {/* Chipset */}
          <span className="text-xs text-text-disabled truncate flex-1">{adapter.chipset}</span>
          {/* RX/TX */}
          <span className="font-mono text-[10px] text-text-disabled flex-shrink-0 mr-2">RX {adapter.rx} TX {adapter.tx}</span>
        </button>
      </AppTooltip>

      {/* Inline scanner activation controls */}
      {isMonitor && (
        <div className="flex-shrink-0 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity">
          {isActive ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                const job = activeJobs.find(j => j.type === 'recon')
                if (job) stopJob(job.id)
              }}
              className="h-7 px-2 text-[10px] bg-status-error/10 text-status-error hover:bg-status-error/20 border border-status-error/30"
            >
              <Square className="w-2 h-2 mr-1" fill="currentColor" />Stop
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={isScanning}
              onClick={(e) => {
                e.stopPropagation()
                startJob('recon', { iface: adapter.iface, band: 'all' })
              }}
              className="h-7 px-2 text-[10px] bg-accent/10 text-accent hover:bg-accent/20 border border-accent/30"
            >
              <Play className="w-2 h-2 mr-1" fill="currentColor" />Scan
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export function Dashboard() {
  const { uiState, dismissActionBar, activeJobs, adapters, networks, clients, captures, credentials, logs, stopJob } = useWcarckStore()
  const navigate = useNavigate()

  // D90: NEVER show after first dismiss
  const shouldShowAction = React.useMemo(() => {
    if (activeJobs.length > 0) return false
    if (uiState.lastActionBarDismissed !== null) return false
    return true
  }, [activeJobs.length, uiState.lastActionBarDismissed])

  const recentLogs = logs.slice(0, 60)
  const errorCount = logs.filter(l => l.level === 'ERROR' || l.level === 'CRITICAL').length

  return (
    <div className="flex flex-col h-full gap-3 animate-fade-in">

      {/* ── GUIDED ACTION BAR (D90 - first launch only) ─────────────── */}
      {shouldShowAction && (
        <div className="flex items-center gap-4 bg-bg-elevated border border-border-subtle rounded-lg px-4 py-3 flex-shrink-0 animate-fade-in">
          <Play className="w-4 h-4 text-accent flex-shrink-0" fill="currentColor" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">Ready to start</p>
            <p className="text-xs text-text-secondary">Click Start Scan to discover nearby WiFi networks.</p>
          </div>
          <Button
            size="sm"
            onClick={() => { dismissActionBar(); navigate('/recon') }}
            className="bg-accent text-white hover:bg-accent-hover text-xs flex-shrink-0"
          >
            Start Scan
          </Button>
          <Button size="sm" variant="ghost" onClick={dismissActionBar} className="text-text-disabled hover:text-text-primary text-xs flex-shrink-0">
            Dismiss
          </Button>
        </div>
      )}

      {/* ── METRIC PILLS ROW ─────────────────────────────────────────── */}
      <div className="flex gap-3 flex-shrink-0">
        <MetricPill label="Networks"    value={networks.size}     icon={Activity} tooltip="Total discovered wireless networks" onClick={() => navigate('/recon')} />
        <MetricPill label="Clients"     value={clients.size}      icon={Users}    tooltip="Total active station client devices" onClick={() => navigate('/recon')} />
        <MetricPill label="Handshakes"  value={captures.length}   icon={Zap}      tooltip="Total EAPOL & PMKID cryptographic handshakes captured" onClick={() => navigate('/captures')} />
        <MetricPill label="Credentials" value={credentials.length} icon={Key}    tooltip="Total plaintext or portal credentials harvested" onClick={() => navigate('/credentials')} />
        {errorCount > 0 && (
          <MetricPill label="Errors" value={errorCount} icon={AlertCircle} tooltip="Total logged system/process errors" onClick={() => navigate('/logs')} />
        )}
      </div>

      {/* ── MAIN 2-COLUMN PANEL ROW (fills remaining height) ─────────── */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* LEFT PANEL — Active Jobs + Adapters */}
        <div className="flex flex-col gap-3 w-[55%] flex-shrink-0 min-h-0">

          {/* ACTIVE JOBS panel */}
          <div className="flex flex-col bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden flex-shrink-0">
            <div className="flex items-center justify-between px-4 py-2.5 bg-bg-surface border-b border-border-subtle flex-shrink-0">
              <h3 className="text-[11px] font-semibold text-text-disabled uppercase tracking-widest">Active Jobs</h3>
              {activeJobs.length > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-status-running font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-running animate-pulse-green" />
                  {activeJobs.length} running
                </span>
              )}
            </div>
            <div className="divide-y divide-border-subtle">
              {activeJobs.length === 0 ? (
                <div className="px-4 py-3 text-xs text-text-disabled italic">No active jobs</div>
              ) : (
                activeJobs.map(job => (
                  <div key={job.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-status-running animate-pulse-green flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-text-primary capitalize">
                          {job.type === 'recon' ? 'Recon Scan' : job.type}
                        </span>
                        <span className="text-xs text-text-disabled font-mono truncate">{job.target}</span>
                      </div>
                      <div className="w-full bg-bg-active rounded-full h-1 overflow-hidden">
                        <div
                          className="bg-accent h-1 rounded-full transition-all duration-500"
                          style={{ width: `${job.progress ?? 0}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-text-disabled flex-shrink-0">{job.packetsPerSec} pps</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => stopJob(job.id)}
                      className="h-6 px-2 text-[11px] bg-status-error/10 text-status-error hover:bg-status-error/20 border border-status-error/30 flex-shrink-0"
                    >
                      <Square className="w-2.5 h-2.5 mr-1" fill="currentColor" />Stop
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ADAPTERS panel — fills remaining space on the left */}
          <div className="flex flex-col bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden flex-1 min-h-0">
            <div className="flex items-center justify-between px-4 py-2.5 bg-bg-surface border-b border-border-subtle flex-shrink-0">
              <h3 className="text-[11px] font-semibold text-text-disabled uppercase tracking-widest">Hardware Adapters</h3>
              <button
                onClick={() => navigate('/adapters')}
                className="text-[11px] text-accent hover:text-accent-hover transition-colors"
              >
                Manage
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border-subtle">
              {adapters.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-8 text-center px-6">
                  <Wifi className="w-8 h-8 text-text-disabled opacity-30" />
                  <div>
                    <p className="text-sm text-text-disabled mb-1">No adapters detected</p>
                    <button
                      onClick={() => navigate('/adapters')}
                      className="text-xs text-accent hover:underline"
                    >
                      Configure adapters
                    </button>
                  </div>
                </div>
              ) : (
                adapters.map(adapter => (
                  <AdapterRow key={adapter.iface} adapter={adapter} onClick={() => navigate('/adapters')} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL — Recent Events (fills full height) */}
        <div className="flex flex-col bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden flex-1 min-h-0">
          <div className="flex items-center justify-between px-4 py-2.5 bg-bg-surface border-b border-border-subtle flex-shrink-0">
            <h3 className="text-[11px] font-semibold text-text-disabled uppercase tracking-widest">Event Log</h3>
            {errorCount > 0 && (
              <button
                onClick={() => navigate('/logs')}
                className="text-[11px] text-status-error flex items-center gap-1 hover:text-status-error/80 transition-colors"
              >
                <AlertCircle className="w-3 h-3" />
                {errorCount} error{errorCount !== 1 ? 's' : ''}
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {recentLogs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-text-disabled italic">
                No events yet
              </div>
            ) : (
              <div className="divide-y divide-border-subtle/40">
                {recentLogs.map((e, i) => (
                  <div
                    key={i}
                    className={cn(
                      'px-4 py-2 flex items-start gap-3 hover:bg-bg-hover transition-colors',
                      (e.level === 'ERROR' || e.level === 'CRITICAL') ? 'bg-status-error/4' :
                      e.level === 'WARN' ? 'bg-status-warning/4' : ''
                    )}
                  >
                    {/* Level indicator */}
                    <div className={cn(
                      'w-1 h-4 rounded-full flex-shrink-0 mt-0.5',
                      (e.level === 'ERROR' || e.level === 'CRITICAL') ? 'bg-status-error' :
                      e.level === 'WARN' ? 'bg-status-warning' :
                      e.event_type?.includes('success') ? 'bg-status-success' : 'bg-border-strong'
                    )} />
                    {/* Timestamp */}
                    <span className="font-mono text-[10px] text-text-disabled flex-shrink-0 pt-0.5 tabular-nums w-[58px]">
                      {new Date(e.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    {/* Level badge */}
                    <span className={cn(
                      'text-[9px] font-bold uppercase tracking-widest flex-shrink-0 pt-0.5 w-10',
                      (e.level === 'ERROR' || e.level === 'CRITICAL') ? 'text-status-error' :
                      e.level === 'WARN' ? 'text-status-warning' : 'text-text-disabled'
                    )}>
                      {e.level === 'CRITICAL' ? 'CRIT' : e.level}
                    </span>
                    {/* Message */}
                    <span className={cn(
                      'text-xs leading-relaxed flex-1 min-w-0',
                      (e.level === 'ERROR' || e.level === 'CRITICAL') ? 'text-status-error' :
                      e.level === 'WARN' ? 'text-status-warning' : 'text-text-secondary'
                    )}>
                      {e.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
