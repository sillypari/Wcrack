import * as React from 'react'
import { Cpu, RefreshCw, AlertTriangle, Monitor, Globe, ShieldAlert, ShieldCheck, Shuffle, Activity, Signal, Zap, Stethoscope, Check, X } from 'lucide-react'
import { useWcarckStore } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AppTooltip } from '@/components/ui/app-tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function Adapters() {
  const { 
    adapters, 
    fetchInitialState, 
    checkKill, 
    restoreNetwork, 
    checkKillOutput, 
    restoreOutput,
    runDiagnostics,
    setRole
  } = useWcarckStore()
  
  const [transitioning, setTransitioning] = React.useState<Record<string, boolean>>({})
  const [isKilling, setIsKilling] = React.useState(false)
  const [isRestoring, setIsRestoring] = React.useState(false)
  const [isDryRun, setIsDryRun] = React.useState(false)
  const [isDiagnosing, setIsDiagnosing] = React.useState<Record<string, boolean>>({})

  // Frontend Stubs State
  const [randomMacs, setRandomMacs] = React.useState<Record<string, string>>({})
  const [isRandomizing, setIsRandomizing] = React.useState<Record<string, boolean>>({})
  const [isInjecting, setIsInjecting] = React.useState<Record<string, boolean>>({})
  const [injectionResults, setInjectionResults] = React.useState<Record<string, string>>({})

  const fetchAdapters = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/adapters/refresh', { method: 'POST' })
      if (res.ok) {
        toast.success("Hardware scan triggered — refreshing in 2s...")
        setTimeout(() => fetchInitialState(), 2000)
      } else {
        toast.error("Refresh failed: " + res.statusText)
      }
    } catch (e) {
      toast.error("Cannot reach backend")
    }
  }

  const toggleMode = async (iface: string, currentMode: string) => {
    setTransitioning(prev => ({ ...prev, [iface]: true }))
    try {
      const newMode = currentMode === 'monitor' ? 'managed' : 'monitor'
      const res = await fetch(`http://127.0.0.1:8000/api/adapters/${iface}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode })
      })
      if (res.ok) {
        toast.success(`${iface} switching to ${newMode} mode...`)
        setTimeout(() => fetchInitialState(), 2000)
      } else {
        const err = await res.text()
        toast.error(`Failed to switch mode: ${err}`)
      }
    } catch (e) {
      toast.error("Cannot reach backend")
    } finally {
      setTransitioning(prev => ({ ...prev, [iface]: false }))
    }
  }

  const handleCheckKill = async () => {
    setIsKilling(true)
    try {
      await checkKill()
      setTimeout(() => fetchInitialState(), 1000)
    } finally {
      setIsKilling(false)
    }
  }

  const handleDryRun = async () => {
    setIsDryRun(true)
    try {
      const res = await fetch('http://127.0.0.1:8000/api/adapters/check-kill/dry-run', { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      useWcarckStore.setState({ checkKillOutput: data.output || "Dry run complete." })
    } catch (e) {
      const err = e as Error
      toast.error(`Dry run failed: ${err.message}`)
    } finally {
      setIsDryRun(false)
    }
  }

  const handleRestore = async () => {
    setIsRestoring(true)
    try {
      await restoreNetwork()
      setTimeout(() => fetchInitialState(), 1000)
    } finally {
      setIsRestoring(false)
    }
  }

  const handleRandomizeMac = async (iface: string, originalMac: string) => {
    setIsRandomizing(prev => ({ ...prev, [iface]: true }))
    try {
      if (randomMacs[iface]) {
        // Restore
        const res = await fetch(`http://127.0.0.1:8000/api/adapters/${iface}/mac/restore`, { method: 'POST' })
        if (!res.ok) throw new Error(await res.text())
        const newMacs = { ...randomMacs }
        delete newMacs[iface]
        setRandomMacs(newMacs)
        toast.success(`${iface} MAC restored to ${originalMac}`)
      } else {
        // Randomize
        const res = await fetch(`http://127.0.0.1:8000/api/adapters/${iface}/mac/randomize`, { method: 'POST' })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        setRandomMacs(prev => ({ ...prev, [iface]: data.mac }))
        toast.success(`${iface} MAC randomized to ${data.mac}`)
      }
    } catch (e) {
      toast.error(`MAC operation failed: ${(e as Error).message}`)
    } finally {
      setIsRandomizing(prev => ({ ...prev, [iface]: false }))
    }
  }

  const handleInjectionTest = async (iface: string) => {
    setIsInjecting(prev => ({ ...prev, [iface]: true }))
    setInjectionResults(prev => { const res = {...prev}; delete res[iface]; return res; })
    
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/adapters/${iface}/injection-test`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setInjectionResults(prev => ({ ...prev, [iface]: data.output }))
    } catch (e) {
      setInjectionResults(prev => ({ ...prev, [iface]: `[Error] ${(e as Error).message}` }))
    } finally {
      setIsInjecting(prev => ({ ...prev, [iface]: false }))
    }
  }

  const totalCount = adapters.length
  const monitorCount = adapters.filter(a => a.mode === 'monitor').length
  const managedCount = totalCount - monitorCount

  return (
    <div className="flex flex-col h-full animate-fade-in gap-3">
      {/* ── HEADER + STATS ROW ────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-text-primary tracking-tight">Hardware Adapters</h2>
          {adapters.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-text-disabled bg-bg-elevated border border-border-subtle px-2 py-1 rounded">
                {totalCount} total
              </span>
              {monitorCount > 0 && (
                <span className="text-xs font-mono text-status-success bg-status-success/10 border border-status-success/20 px-2 py-1 rounded">
                  {monitorCount} monitor
                </span>
              )}
              {managedCount > 0 && (
                <span className="text-xs font-mono text-status-info bg-status-info/10 border border-status-info/20 px-2 py-1 rounded">
                  {managedCount} managed
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          
          <AppTooltip content="Dry Run: see which processes would be killed without actually killing them" side="bottom">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDryRun} 
              disabled={isDryRun}
              className="bg-bg-surface border-border-subtle text-text-secondary hover:text-text-primary h-8"
            >
              <Activity className={cn("w-3.5 h-3.5 mr-2", isDryRun && "animate-pulse")} />
              {isDryRun ? "Checking..." : "Check Conflicts (Dry Run)"}
            </Button>
          </AppTooltip>

          <AppTooltip content="Run airmon-ng check kill to stop conflicting services (wpa_supplicant, NetworkManager etc)" side="bottom">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleCheckKill} 
              disabled={isKilling}
              className="bg-accent/10 border-accent/30 text-accent hover:bg-accent/20 h-8"
            >
              <ShieldAlert className={cn("w-3.5 h-3.5 mr-2", isKilling && "animate-spin")} />
              {isKilling ? "Killing..." : "Check Kill"}
            </Button>
          </AppTooltip>

          <AppTooltip content="Restart NetworkManager and wpa_supplicant to restore internet connectivity" side="bottom">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRestore} 
              disabled={isRestoring}
              className="bg-bg-active border-border-default text-text-primary hover:bg-bg-hover h-8"
            >
              <ShieldCheck className={cn("w-3.5 h-3.5 mr-2 text-text-secondary", isRestoring && "animate-spin")} />
              {isRestoring ? "Restoring..." : "Restore Services"}
            </Button>
          </AppTooltip>

          <AppTooltip content="Trigger hardware scan to re-detect wireless interfaces" side="bottom">
            <Button variant="outline" size="sm" onClick={fetchAdapters} className="bg-bg-active border-border-default text-text-primary h-8">
              <RefreshCw className="w-3.5 h-3.5 mr-2" />
              Refresh
            </Button>
          </AppTooltip>
        </div>
      </div>

      {/* ── TERMINAL LOG PANEL (Check Kill / Restore Output) ───────────────── */}
      {(checkKillOutput || restoreOutput) && (
        <div className="bg-black/90 text-status-success p-4 rounded-lg font-mono text-xs border border-border-default flex flex-col gap-2 relative">
          <div className="flex justify-between items-center text-[10px] text-text-disabled uppercase font-bold border-b border-border-subtle pb-1">
            <span>{checkKillOutput ? "Airmon-ng Check Output" : "Network Restoration Output"}</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                useWcarckStore.setState({ checkKillOutput: null, restoreOutput: null })
              }}
              className="h-5 text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-hover px-1.5"
            >
              Clear
            </Button>
          </div>
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed text-text-primary">
            {checkKillOutput || restoreOutput}
          </pre>
        </div>
      )}

      {/* ── CONTENT AREA ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {adapters.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8 bg-bg-elevated border border-border-subtle rounded-lg">
            <Cpu className="w-12 h-12 text-text-disabled opacity-25" />
            <div>
              <p className="text-sm font-medium text-text-primary mb-1">No Adapters Detected</p>
              <p className="text-xs text-text-disabled">Connect a wireless adapter to begin.</p>
            </div>
            <Button
              size="sm"
              onClick={fetchAdapters}
              className="bg-bg-active border border-border-subtle text-text-primary hover:bg-bg-hover text-xs mt-1"
            >
              Rescan Hardware
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pb-4">
            {adapters.map((adapter) => {
              const isTrans = transitioning[adapter.iface]
              const isMon = adapter.mode === 'monitor'
              const currentMac = randomMacs[adapter.iface] || adapter.mac
              const isRandomized = !!randomMacs[adapter.iface]
              
              return (
                <div key={adapter.iface} className="bg-bg-elevated border border-border-subtle rounded-lg shadow-sm relative overflow-hidden flex flex-col group">
                  
                  {isTrans && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-bg-active overflow-hidden">
                      <div className="h-full bg-accent animate-pulse-green w-1/2" />
                    </div>
                  )}

                  {/* Card Header */}
                  <div className={cn("p-5 border-b", 
                    adapter.role === 'Scanner' ? "border-status-info/50 bg-status-info/5" :
                    adapter.role === 'Injector' ? "border-status-warning/50 bg-status-warning/5" :
                    adapter.role === 'AP' ? "border-accent/50 bg-accent/5" :
                    adapter.role === 'Uplink' ? "border-status-success/50 bg-status-success/5" :
                    "border-border-subtle/50"
                  )}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-text-primary flex items-center gap-2 text-base">
                          <Cpu className="w-4 h-4 text-text-secondary" />
                          {adapter.iface}
                        </h3>
                        
                        {/* RF Kill Status & Role Badge */}
                        <div className="flex items-center gap-3 mt-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-status-success animate-pulse-green" />
                            <span className="text-[10px] font-bold text-status-success uppercase tracking-wider">RF ON</span>
                          </div>
                          {adapter.role && adapter.role !== 'Auto' && (
                            <span className={cn(
                              "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",
                              adapter.role === 'Scanner' ? "text-status-info border-status-info/30 bg-status-info/10" :
                              adapter.role === 'Injector' ? "text-status-warning border-status-warning/30 bg-status-warning/10" :
                              adapter.role === 'AP' ? "text-accent border-accent/30 bg-accent/10" :
                              "text-status-success border-status-success/30 bg-status-success/10"
                            )}>
                              {adapter.role}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <AppTooltip content="Hardware Role Assignment" side="left">
                        <Select value={adapter.role || 'Auto'} onValueChange={(val) => setRole(adapter.iface, val)}>
                          <SelectTrigger className="h-7 text-[10px] bg-bg-surface border-border-default hover:bg-bg-hover w-[110px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Auto">🤖 Auto</SelectItem>
                            <SelectItem value="Scanner">📡 Scanner</SelectItem>
                            <SelectItem value="Injector">⚡ Injector</SelectItem>
                            <SelectItem value="AP">🗼 Access Point</SelectItem>
                            <SelectItem value="Uplink">🌐 Uplink</SelectItem>
                          </SelectContent>
                        </Select>
                      </AppTooltip>
                    </div>
                    
                    {/* MAC Address Display */}
                    <div className="flex flex-col gap-1 bg-bg-surface border border-border-subtle rounded px-3 py-2">
                      <div className="flex justify-between items-center text-[10px] uppercase font-bold text-text-disabled">
                        <span>Original MAC</span>
                        <span>Current MAC</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-xs text-text-secondary">{adapter.mac}</span>
                        <span className={cn("font-mono text-xs font-bold", isRandomized ? "text-accent" : "text-text-primary")}>
                          {currentMac}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-5 flex-1 space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="text-text-disabled text-[9px] font-semibold uppercase tracking-wider mb-1">Chipset</div>
                        <div className="text-text-primary text-xs truncate" title={adapter.chipset}>{adapter.chipset}</div>
                      </div>
                      <div>
                        <div className="text-text-disabled text-[9px] font-semibold uppercase tracking-wider mb-1">Driver</div>
                        <div className="text-text-primary text-xs truncate" title={adapter.driver}>{adapter.driver}</div>
                      </div>
                      
                      {/* CAPABILITIES MATRIX */}
                      <div className="col-span-2">
                        <div className="flex justify-between items-center mb-1.5">
                          <div className="text-text-disabled text-[9px] font-semibold uppercase tracking-wider">Hardware Capabilities</div>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isDiagnosing[adapter.iface]}
                            onClick={async () => {
                              setIsDiagnosing(prev => ({...prev, [adapter.iface]: true}))
                              await runDiagnostics(adapter.iface)
                              setIsDiagnosing(prev => ({...prev, [adapter.iface]: false}))
                            }}
                            className="h-5 px-1.5 text-[9px] font-bold text-accent hover:bg-accent/10"
                          >
                            <Stethoscope className={cn("w-3 h-3 mr-1", isDiagnosing[adapter.iface] && "animate-pulse")} />
                            {isDiagnosing[adapter.iface] ? "Running..." : "Run Diagnostics"}
                          </Button>
                        </div>
                        
                        <div className="bg-bg-surface border border-border-subtle rounded p-2 grid grid-cols-4 gap-1 text-[9px] font-bold uppercase tracking-wider text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-text-disabled">Monitor</span>
                            {adapter.capabilities ? (
                               adapter.capabilities.monitor ? <Check className="w-3.5 h-3.5 text-status-success" /> : <X className="w-3.5 h-3.5 text-status-error" />
                            ) : <span className="text-text-disabled">—</span>}
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-text-disabled">Inject</span>
                            {adapter.capabilities ? (
                               adapter.capabilities.injection > 0.5 ? <Check className="w-3.5 h-3.5 text-status-success" /> : <X className="w-3.5 h-3.5 text-status-error" />
                            ) : <span className="text-text-disabled">—</span>}
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-text-disabled">AP Mode</span>
                            {adapter.capabilities ? (
                               adapter.capabilities.ap ? <Check className="w-3.5 h-3.5 text-status-success" /> : <X className="w-3.5 h-3.5 text-status-error" />
                            ) : <span className="text-text-disabled">—</span>}
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-text-disabled">5GHz</span>
                            {adapter.capabilities ? (
                               adapter.capabilities['5ghz'] ? <Check className="w-3.5 h-3.5 text-status-success" /> : <X className="w-3.5 h-3.5 text-status-error" />
                            ) : <span className="text-text-disabled">—</span>}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Advanced Controls */}
                    <div className="flex flex-col gap-2 pt-2 border-t border-border-subtle/50">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase text-text-secondary">Randomize MAC</span>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          disabled={isRandomizing[adapter.iface]}
                          onClick={() => handleRandomizeMac(adapter.iface, adapter.mac)}
                          className={cn(
                            "h-6 px-2 text-[10px] transition-colors rounded-full font-bold", 
                            isRandomized 
                              ? "bg-accent text-white border-accent hover:bg-accent-hover" 
                              : "bg-bg-surface text-text-secondary hover:text-text-primary"
                          )}
                        >
                          <Shuffle className={cn("w-3 h-3 mr-1", isRandomizing[adapter.iface] && "animate-spin")} />
                          {isRandomized ? "Revert" : "Randomize"}
                        </Button>
                      </div>
                      
                      {isMon && (
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold uppercase text-text-secondary">Injection Test</span>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={isInjecting[adapter.iface]}
                            onClick={() => handleInjectionTest(adapter.iface)}
                            className="h-6 px-2 text-[10px] transition-colors rounded-full font-bold bg-bg-surface text-text-secondary hover:text-text-primary"
                          >
                            <Zap className={cn("w-3 h-3 mr-1", isInjecting[adapter.iface] && "animate-pulse")} />
                            {isInjecting[adapter.iface] ? "Testing..." : "Run Test"}
                          </Button>
                        </div>
                      )}
                      
                      {injectionResults[adapter.iface] && (
                        <div className={cn(
                          "text-[10px] font-mono px-2 py-1 mt-1 rounded",
                          injectionResults[adapter.iface].includes("OK") ? "bg-status-success/10 text-status-success" : "bg-status-error/10 text-status-error"
                        )}>
                          {injectionResults[adapter.iface]}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Card Footer - Stats & Mode Toggle */}
                  <div className="p-4 bg-bg-surface border-t border-border-subtle flex justify-between items-center">
                    <div className="flex flex-col gap-1.5 text-[10px] font-mono text-text-disabled">
                      <div className="flex items-center gap-3">
                        <AppTooltip content={`Packets Received: ${adapter.rx}`} side="top">
                          <div className="flex items-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-status-success mr-1.5" />
                            RX: {adapter.rx}
                          </div>
                        </AppTooltip>
                        <AppTooltip content={`Packets Transmitted: ${adapter.tx}`} side="top">
                          <div className="flex items-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-status-info mr-1.5" />
                            TX: {adapter.tx}
                          </div>
                        </AppTooltip>
                      </div>
                      <AppTooltip content="Signal Quality / Adapter RSSI" side="top">
                        <div className="flex items-center text-text-secondary font-bold">
                          <Signal className="w-3 h-3 mr-1" />
                          {(adapter.rssi ?? -50).toFixed(0)} dBm
                        </div>
                      </AppTooltip>
                    </div>
                    
                    <AppTooltip content={isMon ? "Switch back to standard Managed/Station Mode" : "Switch interface to Monitor Mode for scanning/attacks"} side="top">
                      <Button 
                        size="sm"
                        variant="outline"
                        disabled={isTrans}
                        onClick={() => toggleMode(adapter.iface, adapter.mode)}
                        className={cn(
                          "h-8 text-xs font-bold shadow-sm",
                          isMon 
                            ? "bg-bg-active text-text-primary border-border-default hover:bg-bg-hover" 
                            : "bg-status-success/10 text-status-success border-status-success/30 hover:bg-status-success/20"
                        )}
                      >
                        {isMon ? (
                          <><Globe className="w-3.5 h-3.5 mr-1.5" /> Stop Monitor</>
                        ) : (
                          <><Monitor className="w-3.5 h-3.5 mr-1.5" /> Start Monitor</>
                        )}
                      </Button>
                    </AppTooltip>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
