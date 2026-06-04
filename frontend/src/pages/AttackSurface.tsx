import * as React from 'react'
import { Square, Check, Inbox, Zap, ArrowRight } from 'lucide-react'
import { useWcarckStore, Job } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'

function Sparkline({ value }: { value: number }) {
  const [data, setData] = React.useState<{ v: number }[]>(Array(30).fill({ v: 0 }))
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(prev => [...prev.slice(1), { v: value }])
  }, [value])
  return (
    <div className="flex-1 max-w-[120px] h-7">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <YAxis domain={['auto', 'auto']} hide />
          <Line type="monotone" dataKey="v" stroke="var(--status-warning)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function EapolProgress({ m1, m2, m3, m4 }: { m1: boolean; m2: boolean; m3: boolean; m4: boolean }) {
  const nodes = [
    { label: 'M1', captured: m1 },
    { label: 'M2', captured: m2 },
    { label: 'M3', captured: m3 },
    { label: 'M4', captured: m4 },
  ]
  const progressIndex = nodes.findLastIndex(n => n.captured)
  const progressPercent = progressIndex === -1 ? 0 : ((progressIndex + 1) / 4) * 100
  return (
    <div className="flex items-center my-2 relative">
      <div className="absolute left-2 right-2 top-2 h-px bg-border-subtle z-0" />
      <div
        className="absolute left-2 top-2 h-px bg-status-success z-0 transition-all duration-500 ease-out"
        style={{ width: `${progressPercent}%` }}
      />
      <div className="flex justify-between w-full z-10">
        {nodes.map(node => (
          <div key={node.label} className="flex flex-col items-center">
            <div className="text-[9px] font-mono text-text-disabled mb-1">{node.label}</div>
            <div className={cn(
              'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-300',
              node.captured ? 'bg-status-success border-status-success' : 'bg-bg-elevated border-border-default'
            )}>
              {node.captured && <Check className="w-2.5 h-2.5 text-bg-root stroke-[3px]" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AttackCard({ attack, stopJob }: { attack: Job; stopJob: (id: string) => void }) {
  const [elapsed, setElapsed] = React.useState(0)
  React.useEffect(() => {
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - attack.startedAt) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [attack.startedAt])
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  const dur = `${m}m ${s.toString().padStart(2, '0')}s`

  return (
    <div className="bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden relative">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
        <div className="w-2 h-2 rounded-full bg-status-warning animate-pulse-green flex-shrink-0" />
        <span className="font-semibold text-text-primary text-sm uppercase tracking-wide">{attack.type}</span>
        <span className="text-xs text-text-disabled font-mono flex-1 truncate">{attack.target}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => stopJob(attack.id)}
          className="h-6 px-2 text-[11px] bg-status-error/10 text-status-error hover:bg-status-error/20 border-status-error/30 flex-shrink-0"
        >
          <Square className="w-2.5 h-2.5 mr-1" fill="currentColor" />Stop
        </Button>
      </div>
      <div className="flex items-center gap-6 px-5 py-3">
        <div className="text-center">
          <div className="text-[9px] text-text-disabled uppercase tracking-widest mb-0.5">Frames</div>
          <div className="font-mono text-sm text-text-primary tabular-nums">{(attack.framesSent ?? 0).toLocaleString()}</div>
        </div>
        <div className="text-center">
          <div className="text-[9px] text-text-disabled uppercase tracking-widest mb-0.5">Duration</div>
          <div className="font-mono text-sm text-text-primary">{dur}</div>
        </div>
        <div className="text-center">
          <div className="text-[9px] text-text-disabled uppercase tracking-widest mb-0.5">Rate</div>
          <div className="font-mono text-sm text-text-primary tabular-nums">{attack.packetsPerSec} pps</div>
        </div>
        <div className="flex-1 flex items-center justify-end">
          <Sparkline value={attack.packetsPerSec} />
        </div>
      </div>
    </div>
  )
}

export function AttackSurface() {
  const { activeJobs, captures, stopJob } = useWcarckStore()
  const navigate = useNavigate()
  const attackJobs = activeJobs.filter(j => j.type !== 'recon')

  return (
    <div className="flex flex-col h-full animate-fade-in gap-4">

      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-text-primary tracking-tight">Active Attacks</h2>
          {attackJobs.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-mono text-status-warning bg-status-warning/10 px-2 py-0.5 rounded border border-status-warning/20">
              <span className="w-1.5 h-1.5 rounded-full bg-status-warning animate-pulse-green" />
              {attackJobs.length} running
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/recon')}
          className="bg-bg-elevated border-border-subtle text-text-secondary hover:text-text-primary text-xs gap-1.5"
        >
          Go to Recon <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* ── ATTACK JOBS SECTION ──────────────────────────────────────── */}
      <div className="flex flex-col gap-2 flex-shrink-0">
        {attackJobs.length === 0 ? (
          <div className="bg-bg-elevated border border-border-subtle rounded-lg px-5 py-4 flex items-center gap-4">
            <Zap className="w-5 h-5 text-text-disabled opacity-30 flex-shrink-0" />
            <div>
              <p className="text-sm text-text-primary font-medium mb-0.5">No Active Attacks</p>
              <p className="text-xs text-text-disabled">Launch an attack from Reconnaissance or Evil Twin.</p>
            </div>
          </div>
        ) : (
          attackJobs.map(attack => (
            <AttackCard key={attack.id} attack={attack} stopJob={stopJob} />
          ))
        )}
      </div>

      {/* ── CAPTURES SECTION ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <h3 className="text-[11px] font-semibold text-text-disabled uppercase tracking-widest">
            Handshake Captures
            {captures.length > 0 && <span className="ml-2 text-text-secondary normal-case font-mono">{captures.length}</span>}
          </h3>
        </div>
        <div className="flex-1 bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden flex flex-col min-h-0">
          {captures.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
              <Inbox className="w-10 h-10 text-text-disabled opacity-25" />
              <div>
                <p className="text-sm text-text-primary mb-1">No captures in progress</p>
                <p className="text-xs text-text-disabled">Deauth a target to trigger a handshake capture.</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-border-subtle">
              {captures.map(cap => (
                <div key={cap.id} className="flex items-center gap-4 px-5 py-3 hover:bg-bg-hover transition-colors relative">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-text-primary text-sm">{cap.ssid}</span>
                      <span className="font-mono text-xs text-text-disabled">{cap.bssid}</span>
                    </div>
                    <div className="max-w-[200px]">
                      <EapolProgress m1={cap.eapolM1} m2={cap.eapolM2} m3={cap.eapolM3} m4={cap.eapolM4} />
                    </div>
                  </div>
                  <div className="text-xs text-text-disabled font-mono flex-shrink-0 truncate max-w-[180px]">
                    {cap.filePath?.split(/[/\\]/).pop()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
