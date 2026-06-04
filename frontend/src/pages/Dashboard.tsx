import * as React from 'react'
import { Activity, Users, Zap, Search, ShieldAlert, Key, Play, Square, Wifi, Cpu, Crosshair, TerminalSquare, AlertCircle, FolderOpen } from 'lucide-react'
import { useWcarckStore, Job } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { AppTooltip } from '@/components/ui/app-tooltip'
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts'

// ── Components for ACTIVE State ──────────────────────────────────────────────────

function Sparkline({ value }: { value: number }) {
  const [data, setData] = React.useState<{ v: number }[]>(Array(30).fill({ v: 0 }))
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(prev => [...prev.slice(1), { v: value }])
  }, [value])
  return (
    <div className="flex-1 w-full h-8 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <YAxis domain={['auto', 'auto']} hide />
          <Line type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function PipelineBar() {
  const { networks, uiState, activeJobs, captures, credentials } = useWcarckStore()
  
  const stages = [
    { id: 'recon', label: 'Recon', active: networks.size > 0 },
    { id: 'target', label: 'Target', active: !!uiState.focusedNetworkBssid },
    { id: 'attack', label: 'Attack', active: activeJobs.some(j => j.type !== 'recon') },
    { id: 'capture', label: 'Capture', active: captures.length > 0 },
    { id: 'crack', label: 'Crack', active: credentials.length > 0 }
  ]

  return (
    <div className="bg-bg-elevated border border-border-subtle rounded-lg p-3 flex items-center justify-between mb-4 flex-shrink-0">
      <div className="flex items-center text-[10px] font-bold text-text-disabled uppercase tracking-widest mr-4">
        PIPELINE
      </div>
      <div className="flex-1 flex items-center justify-between relative max-w-2xl mx-auto">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-border-subtle z-0" />
        
        {/* Fill line up to the last active stage */}
        {stages.findLastIndex(s => s.active) > 0 && (
          <div 
            className="absolute left-0 top-1/2 -translate-y-1/2 h-px bg-accent z-0 transition-all duration-500" 
            style={{ width: `${(stages.findLastIndex(s => s.active) / (stages.length - 1)) * 100}%` }}
          />
        )}

        {stages.map((stage, i) => (
          <div key={stage.id} className="relative z-10 flex flex-col items-center group">
            <div className={cn(
              "w-3 h-3 rounded-full border-2 mb-1 transition-colors duration-300",
              stage.active ? "bg-accent border-accent" : "bg-bg-root border-border-default"
            )} />
            <span className={cn(
              "text-[9px] uppercase tracking-wider font-bold absolute top-4 whitespace-nowrap",
              stage.active ? "text-text-primary" : "text-text-disabled"
            )}>
              {stage.label}
            </span>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-text-disabled italic ml-4">
        Scan → Target → Attack → Capture → Crack
      </div>
    </div>
  )
}

function OperationCard({ job }: { job: Job }) {
  const { stopJob, networks, clients } = useWcarckStore()
  const [elapsed, setElapsed] = React.useState(0)
  React.useEffect(() => {
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - job.startedAt) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [job.startedAt])
  
  const dur = `${Math.floor(elapsed / 60)}m ${(elapsed % 60).toString().padStart(2, '0')}s`

  if (job.type === 'recon') {
    return (
      <div className="bg-bg-surface border border-border-subtle rounded p-3 flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="text-[10px] font-bold text-accent uppercase tracking-widest flex items-center gap-1.5"><Search className="w-3 h-3" /> Recon Scan</div>
            <div className="text-xs text-text-secondary mt-0.5">{job.payload?.iface || 'Unknown Adapter'}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => stopJob(job.id)} className="h-5 px-1.5 text-[9px] text-status-error hover:bg-status-error/10">Stop</Button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-auto">
          <div><div className="text-[9px] text-text-disabled uppercase">Networks</div><div className="text-sm font-mono">{networks.size}</div></div>
          <div><div className="text-[9px] text-text-disabled uppercase">Clients</div><div className="text-sm font-mono">{clients.size}</div></div>
          <div><div className="text-[9px] text-text-disabled uppercase">Runtime</div><div className="text-sm font-mono">{dur}</div></div>
        </div>
      </div>
    )
  }

  if (job.type === 'deauth') {
    return (
      <div className="bg-bg-surface border border-accent/30 rounded p-3 flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="text-[10px] font-bold text-accent uppercase tracking-widest flex items-center gap-1.5"><Zap className="w-3 h-3" /> Deauth Attack</div>
            <div className="text-xs text-text-secondary mt-0.5">{job.target || 'Unknown Target'}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => stopJob(job.id)} className="h-5 px-1.5 text-[9px] text-status-error hover:bg-status-error/10">Stop</Button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-auto mb-2">
          <div><div className="text-[9px] text-text-disabled uppercase">Frames</div><div className="text-sm font-mono">{job.framesSent || 0}</div></div>
          <div><div className="text-[9px] text-text-disabled uppercase">Rate</div><div className="text-sm font-mono">{job.packetsPerSec || 0} pps</div></div>
          <div><div className="text-[9px] text-text-disabled uppercase">Runtime</div><div className="text-sm font-mono">{dur}</div></div>
        </div>
        <div className="w-full bg-accent/10 rounded h-1 overflow-hidden mt-1"><div className="bg-accent h-full animate-pulse-green w-full" /></div>
      </div>
    )
  }

  if (job.type === 'crack') {
    return (
      <div className="bg-bg-surface border border-accent/30 rounded p-3 flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="text-[10px] font-bold text-accent uppercase tracking-widest flex items-center gap-1.5"><Key className="w-3 h-3" /> Password Cracking</div>
            <div className="text-xs text-text-secondary mt-0.5">{job.target || 'Handshake Capture'}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => stopJob(job.id)} className="h-5 px-1.5 text-[9px] text-status-error hover:bg-status-error/10">Stop</Button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-auto mb-2">
          <div><div className="text-[9px] text-text-disabled uppercase">Progress</div><div className="text-sm font-mono">{job.progress || 0}%</div></div>
          <div><div className="text-[9px] text-text-disabled uppercase">Speed</div><div className="text-sm font-mono">{job.speed || '0 H/s'}</div></div>
          <div><div className="text-[9px] text-text-disabled uppercase">Runtime</div><div className="text-sm font-mono">{dur}</div></div>
        </div>
        <div className="w-full bg-bg-active rounded h-1 overflow-hidden mt-1"><div className="bg-accent h-full transition-all" style={{width: `${job.progress || 0}%`}} /></div>
      </div>
    )
  }

  if (job.type === 'eviltwin') {
    return (
      <div className="bg-bg-surface border border-accent/30 rounded p-3 flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="text-[10px] font-bold text-status-info uppercase tracking-widest flex items-center gap-1.5"><Wifi className="w-3 h-3" /> Evil Twin AP</div>
            <div className="text-xs text-text-secondary mt-0.5">{job.target || 'Running'}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => stopJob(job.id)} className="h-5 px-1.5 text-[9px] text-status-error hover:bg-status-error/10">Stop</Button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-auto mb-2">
          <div><div className="text-[9px] text-text-disabled uppercase">Connected</div><div className="text-sm font-mono">{job.connected || 0}</div></div>
          <div><div className="text-[9px] text-text-disabled uppercase">DHCP Leases</div><div className="text-sm font-mono">{job.dhcpLeases || job.dhcp_leases || 0}</div></div>
          <div><div className="text-[9px] text-text-disabled uppercase">Runtime</div><div className="text-sm font-mono">{dur}</div></div>
        </div>
        <div className="w-full bg-status-info/10 rounded h-1 overflow-hidden mt-1"><div className="bg-status-info h-full animate-pulse-green w-full" /></div>
      </div>
    )
  }

  // Generic fallback
  return (
    <div className="bg-bg-surface border border-border-subtle rounded p-3 flex flex-col">
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="text-[10px] font-bold text-text-primary uppercase tracking-widest">{job.type}</div>
          <div className="text-xs text-text-secondary mt-0.5">{job.target || 'Unknown'}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => stopJob(job.id)} className="h-5 px-1.5 text-[9px] text-status-error hover:bg-status-error/10">Stop</Button>
      </div>
      <div className="mt-auto flex justify-between items-end">
         <div className="text-[9px] text-text-disabled uppercase">Runtime: {dur}</div>
         <Sparkline value={job.packetsPerSec || 0} />
      </div>
    </div>
  )
}

// ── Main Dashboard Component ──────────────────────────────────────────────────────

export function Dashboard() {
  const { uiState, activeJobs, adapters, networks, clients, captures, credentials, logs, stopJob, projects, activeProjectId } = useWcarckStore()
  const navigate = useNavigate()

  const isIdle = activeJobs.length === 0 && networks.size === 0 && captures.length === 0 && credentials.length === 0
  const errorCount = logs.filter(l => l.level === 'ERROR' || l.level === 'CRITICAL').length

  const refreshAdapters = async () => {
    fetch('http://127.0.0.1:8000/api/adapters/refresh', { method: 'POST' }).catch(() => {})
  }

  // ── IDLE STATE ──
  if (isIdle) {
    const activeProject = projects.find(p => p.id === activeProjectId)
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 animate-fade-in bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-bg-surface via-bg-root to-bg-root">
        <div className="max-w-2xl w-full flex flex-col items-center">
          <Wifi className="w-16 h-16 text-accent mb-6 opacity-80" />
          <h1 className="text-3xl font-bold text-text-primary tracking-tight mb-2">Wcarck</h1>
          <p className="text-text-secondary mb-12">WiFi Penetration Testing Framework</p>

          {activeProject ? (
            <div className="bg-bg-elevated border border-border-subtle rounded-lg px-6 py-3 mb-8 flex items-center gap-3">
              <FolderOpen className="w-4 h-4 text-accent" />
              <div className="flex flex-col">
                <span className="text-[10px] text-text-disabled uppercase font-bold tracking-widest leading-none">Active Project</span>
                <span className="text-sm font-bold text-text-primary mt-1">{activeProject.name}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => navigate('/projects')} className="ml-4 h-6 text-[10px] px-2 text-text-secondary hover:text-text-primary">Change</Button>
            </div>
          ) : (
            <div className="bg-bg-surface border border-border-subtle rounded-lg px-6 py-4 mb-8 flex flex-col items-center gap-2">
              <span className="text-sm font-bold text-text-primary">No Project Selected</span>
              <span className="text-xs text-text-secondary mb-2 text-center">Data will not be saved persistently until a project is selected.</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-6 w-full mb-12">
            <div className="bg-bg-elevated border border-border-subtle rounded-xl p-6 text-center shadow-lg">
              <div className="text-4xl font-bold text-text-primary font-mono mb-2">0</div>
              <div className="text-[10px] font-semibold text-text-disabled uppercase tracking-widest">Networks</div>
            </div>
            <div className="bg-bg-elevated border border-border-subtle rounded-xl p-6 text-center shadow-lg">
              <div className="text-4xl font-bold text-text-primary font-mono mb-2">0</div>
              <div className="text-[10px] font-semibold text-text-disabled uppercase tracking-widest">Clients</div>
            </div>
            <div className="bg-bg-elevated border border-border-subtle rounded-xl p-6 text-center shadow-lg">
              <div className="text-4xl font-bold text-text-primary font-mono mb-2">0</div>
              <div className="text-[10px] font-semibold text-text-disabled uppercase tracking-widest">Captures</div>
            </div>
          </div>

          <div className="flex gap-4">
            {activeProject ? (
              <Button size="lg" onClick={() => navigate('/recon')} className="bg-accent text-white hover:bg-accent-hover px-8 h-12 text-sm font-bold shadow-lg shadow-accent/20">
                Start Scanning
              </Button>
            ) : (
              <Button size="lg" onClick={() => navigate('/projects')} className="bg-accent text-white hover:bg-accent-hover px-8 h-12 text-sm font-bold shadow-lg shadow-accent/20">
                Select or Create Project
              </Button>
            )}
            <Button size="lg" variant="outline" onClick={refreshAdapters} className="bg-bg-surface border-border-default text-text-primary hover:bg-bg-hover h-12">
              Detect Adapters
            </Button>
          </div>

          <div className="mt-12 text-xs text-text-disabled font-mono flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5" />
            {adapters.length === 0 ? "No adapters detected. Please connect hardware." : `${adapters.length} adapter${adapters.length > 1 ? 's' : ''} ready`}
          </div>
        </div>
      </div>
    )
  }

  // ── ACTIVE STATE (War Room) ──
  const targetBssid = uiState.focusedNetworkBssid
  const targetNetwork = targetBssid ? networks.get(targetBssid) : null
  const targetClientsCount = targetBssid ? Array.from(clients.values()).filter(c => c.bssid === targetBssid).length : 0

  return (
    <div className="flex flex-col h-full gap-4 animate-fade-in font-sans">
      <PipelineBar />

      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        
        {/* Left Column: Target & Adapters */}
        <div className="w-full lg:w-80 flex flex-col gap-4 flex-shrink-0">
          {/* Target Card */}
          <div className="bg-bg-elevated border border-border-subtle rounded-lg flex flex-col">
            <div className="p-3 border-b border-border-subtle">
              <h3 className="text-[10px] font-bold text-text-disabled uppercase tracking-widest flex items-center gap-1.5"><Crosshair className="w-3.5 h-3.5" /> Current Target</h3>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {targetNetwork ? (
                <>
                  <div>
                    <div className="text-base font-black text-text-primary">{targetNetwork.ssid || '(Hidden)'}</div>
                    <div className="text-xs font-mono text-text-secondary">{targetNetwork.bssid}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-y-2 text-xs font-mono text-text-secondary">
                    <div>CH: {targetNetwork.channel}</div>
                    <div>ENC: <span className={targetNetwork.encryption.includes('WPA') ? 'text-status-success' : 'text-status-warning'}>{targetNetwork.encryption}</span></div>
                    <div>PWR: {targetNetwork.signal} dBm</div>
                    <div>CLI: {targetClientsCount}</div>
                  </div>
                </>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-xs text-text-disabled mb-3">No target selected.</p>
                  <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => navigate('/recon')}>Select in Recon</Button>
                </div>
              )}
            </div>
          </div>

          {/* Adapters Compact List */}
          <div className="bg-bg-elevated border border-border-subtle rounded-lg flex flex-col flex-1 min-h-0">
            <div className="p-3 border-b border-border-subtle flex justify-between items-center">
              <h3 className="text-[10px] font-bold text-text-disabled uppercase tracking-widest flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5" /> Adapters</h3>
              <button onClick={() => navigate('/adapters')} className="text-[10px] text-accent hover:underline">Manage</button>
            </div>
            <div className="p-2 overflow-y-auto flex flex-col gap-1">
              {adapters.map(a => (
                <div key={a.iface} className="flex items-center gap-2 p-2 rounded hover:bg-bg-hover text-xs font-mono">
                  <div className={cn("w-2 h-2 rounded-full flex-shrink-0", a.mode === 'monitor' ? 'bg-status-success animate-pulse-green' : 'bg-status-idle')} />
                  <span className="font-bold text-text-primary w-16 truncate">{a.iface}</span>
                  <span className="text-text-disabled">{a.mode === 'monitor' ? 'mon' : 'mng'}</span>
                  <span className="text-[10px] text-text-secondary ml-auto truncate max-w-[80px]">{a.chipset}</span>
                </div>
              ))}
              {adapters.length === 0 && <div className="text-xs text-text-disabled text-center py-4">None detected</div>}
            </div>
          </div>
        </div>

        {/* Center & Right Columns */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          
          {/* Operations (Top) */}
          <div className="bg-bg-elevated border border-border-subtle rounded-lg flex flex-col flex-shrink-0 min-h-[16rem]">
             <div className="p-3 border-b border-border-subtle">
                <h3 className="text-[10px] font-bold text-text-disabled uppercase tracking-widest flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Operations</h3>
             </div>
             <div className="p-3 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-3">
               {activeJobs.length === 0 ? (
                 <div className="col-span-full h-full flex items-center justify-center text-xs text-text-disabled italic">No active operations. Launch an attack from the Quick Launch bar.</div>
               ) : (
                 activeJobs.map(job => <OperationCard key={job.id} job={job} />)
               )}
             </div>
          </div>

          {/* Live Results Feed (Bottom) */}
          <div className="bg-bg-elevated border border-border-subtle rounded-lg flex flex-col flex-1 min-h-0">
             <div className="p-3 border-b border-border-subtle">
                <h3 className="text-[10px] font-bold text-text-disabled uppercase tracking-widest flex items-center gap-1.5"><TerminalSquare className="w-3.5 h-3.5" /> Live Results</h3>
             </div>
             <div className="flex-1 flex divide-x divide-border-subtle min-h-0">
                {/* Recent Captures */}
                <div className="flex-1 flex flex-col min-w-0 p-3">
                   <div className="flex justify-between items-center mb-3">
                      <span className="text-[10px] font-bold text-text-secondary uppercase">Recent Captures</span>
                      <button onClick={() => navigate('/captures')} className="text-[10px] text-accent hover:underline">View All</button>
                   </div>
                   <div className="flex flex-col gap-2 overflow-y-auto">
                     {captures.slice(0,4).map(cap => (
                       <div key={cap.id} className="flex items-center justify-between bg-bg-surface p-2 rounded border border-border-subtle">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={cn("w-1.5 h-1.5 rounded-full", cap.status === 'Valid' ? 'bg-status-success' : 'bg-status-warning')} />
                            <div className="flex flex-col min-w-0">
                               <span className="text-xs font-bold text-text-primary truncate">{cap.ssid}</span>
                               <span className="text-[9px] font-mono text-text-disabled">{cap.type.toUpperCase()} • {cap.status}</span>
                            </div>
                          </div>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[9px]" onClick={() => navigate('/crack', {state: {captureId: cap.id}})}>Crack</Button>
                       </div>
                     ))}
                     {captures.length === 0 && <span className="text-[10px] text-text-disabled italic">No captures yet.</span>}
                   </div>
                </div>

                {/* Recent Cracked */}
                <div className="flex-1 flex flex-col min-w-0 p-3">
                   <div className="flex justify-between items-center mb-3">
                      <span className="text-[10px] font-bold text-text-secondary uppercase">Recent Cracked</span>
                      <button onClick={() => navigate('/credentials')} className="text-[10px] text-accent hover:underline">View All</button>
                   </div>
                   <div className="flex flex-col gap-2 overflow-y-auto">
                     {credentials.slice(0,4).map(cred => (
                       <div key={cred.id} className="flex items-center justify-between bg-bg-surface p-2 rounded border border-border-subtle">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-status-info" />
                            <div className="flex flex-col min-w-0">
                               <span className="text-xs font-bold text-text-primary truncate">{cred.ssid}</span>
                               <span className="text-[10px] font-mono text-status-info truncate">{cred.password || 'N/A'}</span>
                            </div>
                          </div>
                       </div>
                     ))}
                     {credentials.length === 0 && <span className="text-[10px] text-text-disabled italic">No credentials cracked yet.</span>}
                   </div>
                </div>
             </div>
          </div>

        </div>
      </div>

      {/* ── SECTION E: QUICK LAUNCH BAR ────────────────────────────────────────────── */}
      {activeJobs.length === 0 && (
        <div className="bg-bg-elevated border border-border-subtle rounded-lg p-2 flex items-center justify-between flex-shrink-0 mt-auto">
           <div className="flex items-center gap-4">
              <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest pl-2">Quick Launch:</span>
              <div className="flex gap-2">
                 <Button size="sm" onClick={() => navigate('/recon')} className="h-7 text-[10px] bg-accent/10 text-accent hover:bg-accent/20 border border-accent/30 font-bold">Start Scan</Button>
                 <AppTooltip content={!targetBssid ? "Select a target in Recon first" : "Launch Deauth"} side="top">
                   <span><Button size="sm" disabled={!targetBssid} onClick={() => navigate('/attack')} className="h-7 text-[10px] bg-status-error/10 text-status-error hover:bg-status-error/20 border border-status-error/30 font-bold">Deauth Attack</Button></span>
                 </AppTooltip>
                 <AppTooltip content={!targetBssid ? "Select a target in Recon first" : "Launch PMKID Capture"} side="top">
                   <span><Button size="sm" disabled={!targetBssid} onClick={() => navigate('/attack')} className="h-7 text-[10px] bg-status-warning/10 text-status-warning hover:bg-status-warning/20 border border-status-warning/30 font-bold">PMKID Capture</Button></span>
                 </AppTooltip>
                 <AppTooltip content={!targetBssid ? "Select a target in Recon first" : "Launch Evil Twin"} side="top">
                   <span><Button size="sm" disabled={!targetBssid} onClick={() => navigate('/eviltwin')} className="h-7 text-[10px] bg-status-info/10 text-status-info hover:bg-status-info/20 border border-status-info/30 font-bold">Evil Twin</Button></span>
                 </AppTooltip>
              </div>
           </div>
           <Button size="sm" variant="ghost" onClick={() => navigate('/logs')} className="h-7 text-[10px] text-text-secondary hover:text-text-primary">
              View All Logs {errorCount > 0 && <span className="ml-1.5 bg-status-error text-white px-1 rounded-sm">{errorCount}</span>}
           </Button>
        </div>
      )}

    </div>
  )
}
