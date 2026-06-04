import * as React from 'react'
import { Square, Check, Inbox, Zap, ArrowRight, Activity, Wifi, ShieldAlert, Cpu, List, Crosshair, TerminalSquare, AlertTriangle, Signal } from 'lucide-react'
import { useWcarckStore, Job, LogEntry } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
          <Line type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
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

  const getFriendlyName = (type: string) => {
    switch (type) {
      case 'deauth': return 'Deauthentication'
      case 'pmkid': return 'PMKID Capture'
      case 'crack': return 'Password Cracking'
      case 'eviltwin': return 'Evil Twin AP'
      case 'pmkid_crack': return 'PMKID Cracking'
      case 'mitm': return 'MITM Sniffer'
      default: return type
    }
  }

  return (
    <div className="bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden relative">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
        <div className="w-2 h-2 rounded-full bg-accent animate-pulse flex-shrink-0" />
        <span className="font-semibold text-text-primary text-sm uppercase tracking-wide">{getFriendlyName(attack.type)}</span>
        <span className="text-xs text-text-disabled font-mono flex-1 truncate">{attack.target || (attack.payload?.ssid || attack.payload?.bssid || 'Unknown Target')}</span>
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
        {attack.type === 'crack' ? (
          <>
            <div className="text-center">
              <div className="text-[9px] text-text-disabled uppercase tracking-widest mb-0.5">Progress</div>
              <div className="font-mono text-sm text-text-primary tabular-nums">{attack.progress || 0}%</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] text-text-disabled uppercase tracking-widest mb-0.5">Speed</div>
              <div className="font-mono text-sm text-text-primary tabular-nums">{attack.speed || '0 H/s'}</div>
            </div>
            <div className="flex-1">
               <div className="w-full bg-bg-active rounded-full h-1.5 overflow-hidden border border-border-subtle/40">
                <div 
                  className="h-full rounded-full transition-all duration-300 bg-accent"
                  style={{ width: `${attack.progress || 0}%` }} 
                />
              </div>
            </div>
          </>
        ) : (
          <>
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
              <div className="font-mono text-sm text-text-primary tabular-nums">{attack.packetsPerSec || 0} pps</div>
            </div>
            {attack.type === 'deauth' ? (
              <div className="flex-1 flex flex-col justify-center px-4">
                <div className="text-[9px] text-text-disabled uppercase tracking-widest mb-1">Live EAPOL Intercept</div>
                <EapolProgress m1={attack.eapolM1 || false} m2={attack.eapolM2 || false} m3={attack.eapolM3 || false} m4={attack.eapolM4 || false} />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-end">
                <Sparkline value={attack.packetsPerSec || 0} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function AttackSurface() {
  const { uiState, networks, adapters, activeJobs, captures, stopJob, logs, clients, startJob } = useWcarckStore()
  const navigate = useNavigate()

  const attackJobs = activeJobs.filter(j => j.type !== 'recon' && j.type !== 'pmkid_crack')
  const scanJob = activeJobs.find(j => j.type === 'recon')
  const evilTwinJob = activeJobs.find(j => j.type === 'eviltwin')

  const targetBssid = uiState.focusedNetworkBssid
  const targetNetwork = targetBssid ? networks.get(targetBssid) : null

  const monitorAdapters = adapters.filter(a => a.mode === 'monitor')
  const [selectedAdapterIface, setSelectedAdapterIface] = React.useState<string>(monitorAdapters[0]?.iface || '')

  React.useEffect(() => {
    if (!selectedAdapterIface && monitorAdapters.length > 0) {
      setSelectedAdapterIface(monitorAdapters[0].iface)
    }
  }, [monitorAdapters, selectedAdapterIface])

  const selectedAdapter = adapters.find(a => a.iface === selectedAdapterIface)
  
  // Filter logs for timeline (only process and RF events related to the target)
  const timelineLogs = logs
    .filter(l => l.channel === 'Process' || l.channel === 'RF')
    .slice(0, 30) // Recent 30

  return (
    <div className="flex flex-col h-full animate-fade-in gap-4 font-sans">
      
      {/* ── SECTION 1: TARGET CONTEXT HEADER ──────────────────────────────────────── */}
      <div className="bg-bg-elevated border border-border-subtle rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {targetNetwork ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-accent" />
              <span className="text-text-disabled text-xs uppercase tracking-widest font-bold">Target:</span>
              <span className="text-lg font-black text-text-primary">{targetNetwork.ssid || '(Hidden)'}</span>
              <span className="text-sm font-mono text-text-secondary bg-bg-surface px-2 py-0.5 rounded border border-border-subtle ml-2">
                {targetNetwork.bssid}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-text-disabled ml-7">
              <span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> CH: {targetNetwork.channel}</span>
              <span className="flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" /> {targetNetwork.encryption}</span>
              <span className="flex items-center gap-1.5"><Signal className="w-3.5 h-3.5" /> {targetNetwork.power ?? '—'} dBm</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-bg-surface border border-border-subtle flex items-center justify-center">
              <Crosshair className="w-5 h-5 text-text-disabled" />
            </div>
            <div>
              <div className="text-sm font-bold text-text-primary">No Target Selected</div>
              <div className="text-xs text-text-disabled">Go to Reconnaissance to select a network to attack.</div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 border-l border-border-subtle pl-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase font-bold text-text-disabled tracking-widest">Active Adapter</span>
            <Select value={selectedAdapterIface} onValueChange={setSelectedAdapterIface}>
              <SelectTrigger className="w-48 bg-bg-active border border-border-default h-8 text-xs font-mono">
                <SelectValue placeholder="Select Adapter..." />
              </SelectTrigger>
              <SelectContent>
                {monitorAdapters.length > 0 ? (
                  monitorAdapters.map(a => (
                    <SelectItem key={a.iface} value={a.iface}>
                      {a.iface} ({a.bands?.includes(5) ? '5GHz' : '2.4GHz'})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>No monitor adapters</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/recon')}
            className="bg-bg-active border-border-default text-text-primary hover:bg-bg-hover text-xs gap-1.5 h-8 mt-4"
          >
            Recon <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* ── MIDDLE GRIDS ───────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4">
        
        {/* Left Column */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          
          {/* SECTION 2 & 6: MONITORS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-shrink-0">
            {/* SECTION 2: SCAN MONITOR */}
            <div className="bg-bg-elevated border border-border-subtle rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-accent" /> Scan Monitor
                </h3>
                {scanJob ? (
                  <span className="text-[10px] font-bold text-status-success bg-status-success/10 px-2 py-0.5 rounded animate-pulse-green">ACTIVE</span>
                ) : (
                  <span className="text-[10px] font-bold text-text-disabled bg-bg-surface px-2 py-0.5 rounded">IDLE</span>
                )}
              </div>
              <div className="bg-bg-surface border border-border-subtle rounded p-3 flex-1 flex flex-col items-center justify-center text-center">
                {scanJob ? (
                  <>
                    <div className="text-2xl font-black text-text-primary font-mono mb-1">{networks.size}</div>
                    <div className="text-[10px] text-text-disabled uppercase tracking-widest">Networks Tracked</div>
                    <div className="mt-2 text-xs font-mono text-text-secondary">Band: {scanJob.payload?.band || 'abg'}</div>
                  </>
                ) : (
                  <p className="text-xs text-text-disabled">Airodump-ng is not running. Live packet capture is paused.</p>
                )}
              </div>
            </div>

            {/* SECTION 6: EVIL TWIN MONITOR (Conditional) */}
            {evilTwinJob ? (
              <div className="bg-bg-elevated border border-accent/30 rounded-lg p-4 flex flex-col gap-3 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-accent animate-pulse-green" />
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-accent uppercase tracking-widest flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4" /> Evil Twin Monitor
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-2 flex-1">
                  <div className="bg-bg-surface border border-border-subtle rounded p-2 flex flex-col items-center justify-center">
                     <div className="text-xl font-black text-text-primary font-mono">{evilTwinJob.connected || 0}</div>
                     <div className="text-[9px] text-text-disabled uppercase">Connected</div>
                  </div>
                  <div className="bg-bg-surface border border-border-subtle rounded p-2 flex flex-col items-center justify-center">
                     <div className="text-xl font-black text-status-success font-mono">{evilTwinJob.dhcpLeases || evilTwinJob.dhcp_leases || 0}</div>
                     <div className="text-[9px] text-text-disabled uppercase">DHCP Leases</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-bg-elevated border border-border-subtle rounded-lg p-4 flex flex-col items-center justify-center text-center opacity-50">
                 <ShieldAlert className="w-6 h-6 text-text-disabled mb-2" />
                 <span className="text-xs text-text-disabled">Evil Twin Inactive</span>
              </div>
            )}
          </div>

          {/* SECTION 3: ACTIVE ATTACK CARDS */}
          <div className="flex-1 bg-bg-elevated border border-border-subtle rounded-lg flex flex-col min-h-0">
             <div className="p-3 border-b border-border-subtle flex-shrink-0">
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest flex items-center gap-2">
                  <Zap className="w-4 h-4 text-accent" /> Active Attacks
                </h3>
             </div>
             <div className="p-4 flex-1 overflow-y-auto scrollbar-thin flex flex-col gap-3">
               {attackJobs.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2">
                    <Zap className="w-8 h-8 text-text-disabled opacity-30" />
                    <p className="text-xs text-text-disabled">No attacks currently running.</p>
                  </div>
               ) : (
                  attackJobs.map(attack => <AttackCard key={attack.id} attack={attack} stopJob={stopJob} />)
               )}
             </div>
          </div>

        </div>

        {/* Right Column */}
        <div className="w-full md:w-96 flex flex-col gap-4 flex-shrink-0">
          
          {/* SECTION 7: QUICK-ACTION LAUNCH BAR */}
          <div className="bg-bg-elevated border border-border-subtle rounded-lg p-4 flex flex-col gap-2">
             <div className="flex justify-between items-end mb-1">
               <h3 className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">Quick Launch</h3>
               {selectedAdapter && (
                 <div className="flex items-center gap-1.5 text-[9px] font-mono text-text-secondary">
                   <div className={cn("w-1.5 h-1.5 rounded-full", selectedAdapter.mode === 'monitor' ? 'bg-status-success animate-pulse-green' : 'bg-status-warning')} />
                   {selectedAdapter.iface} [{selectedAdapter.mode}]
                 </div>
               )}
             </div>
             <Button 
               size="sm" 
               className="w-full bg-bg-surface text-text-primary border border-border-subtle hover:bg-bg-hover hover:border-border-default font-bold transition-colors"
                disabled={!targetNetwork || !selectedAdapterIface || attackJobs.some(j => j.type === 'deauth')}
               onClick={() => startJob('attack.deauth', { bssid: targetNetwork?.bssid, iface: selectedAdapterIface, count: 0, continuous: true })}
             >
                Launch Deauth Attack
             </Button>
              <Button 
                size="sm" 
                className="w-full bg-bg-surface text-text-primary border border-border-subtle hover:bg-bg-hover hover:border-border-default font-bold transition-colors"
                 disabled={!targetNetwork || !selectedAdapterIface || attackJobs.some(j => j.type === 'pmkid')}
                onClick={() => startJob('attack.pmkid', { bssid: targetNetwork?.bssid, iface: selectedAdapterIface })}
              >
                 Launch PMKID Capture
              </Button>
              <Button 
                size="sm" 
                className="w-full bg-bg-surface text-text-primary border border-border-subtle hover:bg-bg-hover hover:border-border-default font-bold transition-colors"
                 disabled={!targetNetwork || attackJobs.some(j => j.type === 'pmkid_crack')}
                onClick={() => navigate('/captures')}
              >
                 PMKID Crack
              </Button>
              <Button 
                size="sm" 
                className="w-full bg-bg-surface text-text-primary border border-border-subtle hover:bg-bg-hover hover:border-border-default font-bold transition-colors"
                 disabled={!selectedAdapterIface || attackJobs.some(j => j.type === 'mitm')}
                onClick={() => startJob('attack.mitm', { iface: selectedAdapterIface })}
              >
                 MITM Sniffer
              </Button>
              <Button 
                size="sm" 
                className="w-full bg-bg-surface text-text-primary border border-border-subtle hover:bg-bg-hover hover:border-border-default font-bold transition-colors"
                 disabled={!targetNetwork || attackJobs.some(j => j.type === 'eviltwin')}
                onClick={() => navigate('/eviltwin')}
              >
                 Configure Evil Twin
              </Button>
          </div>

          {/* SECTION 4 & 5: CAPTURES & EAPOL */}
          <div className="flex-1 bg-bg-elevated border border-border-subtle rounded-lg flex flex-col min-h-0">
            <div className="p-3 border-b border-border-subtle flex-shrink-0 flex justify-between items-center">
              <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest flex items-center gap-2">
                <Inbox className="w-4 h-4 text-status-success" /> Captures Feed
              </h3>
              {captures.length > 0 && <span className="text-[10px] font-mono text-text-secondary bg-bg-surface px-1.5 py-0.5 rounded">{captures.length}</span>}
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-border-subtle">
              {captures.length === 0 ? (
                <div className="h-full flex items-center justify-center p-6 text-center">
                  <p className="text-xs text-text-disabled">No handshakes captured yet.</p>
                </div>
              ) : (
                captures.map(cap => (
                  <div key={cap.id} className="p-3 hover:bg-bg-hover transition-colors group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-text-primary text-xs truncate max-w-[150px]">{cap.ssid}</span>
                      <span className="text-[9px] font-mono text-text-disabled px-1 border border-border-subtle rounded">{cap.type.toUpperCase()}</span>
                    </div>
                    {cap.type === 'eapol' && (
                       <div className="mb-2">
                         <EapolProgress m1={cap.eapolM1} m2={cap.eapolM2} m3={cap.eapolM3} m4={cap.eapolM4} />
                       </div>
                    )}
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity mt-2">
                       <Button size="sm" variant="outline" className="h-6 flex-1 text-[10px] bg-bg-active" onClick={() => navigate('/crack', { state: { captureId: cap.id }})}>
                          Crack
                       </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* SECTION 8: EVENT TIMELINE */}
          <div className="h-48 bg-bg-elevated border border-border-subtle rounded-lg flex flex-col flex-shrink-0">
            <div className="p-2.5 border-b border-border-subtle flex-shrink-0">
              <h3 className="text-[10px] font-bold text-text-disabled uppercase tracking-widest flex items-center gap-1.5">
                <TerminalSquare className="w-3.5 h-3.5" /> Event Timeline
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-2 flex flex-col gap-1.5 bg-black/40">
               {timelineLogs.length === 0 ? (
                 <div className="text-[10px] text-text-disabled italic p-2 text-center">Waiting for events...</div>
               ) : (
                 timelineLogs.map(log => (
                   <div key={log.id} className="flex gap-2 text-[10px] font-mono leading-tight">
                     <span className="text-text-disabled flex-shrink-0">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, second: '2-digit' })}</span>
                     <span className={cn(
                       "flex-1",
                       log.level === 'ERROR' || log.level === 'CRITICAL' ? 'text-status-error' :
                       log.level === 'WARN' ? 'text-status-warning' :
                       log.level === 'DEBUG' ? 'text-text-disabled' : 'text-text-secondary'
                     )}>
                       {log.message}
                     </span>
                   </div>
                 ))
               )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
