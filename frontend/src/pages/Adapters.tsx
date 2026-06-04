import * as React from 'react'
import { Cpu, RefreshCw, AlertTriangle, Monitor, Globe } from 'lucide-react'
import { useWcarckStore } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AppTooltip } from '@/components/ui/app-tooltip'

export function Adapters() {
  const { adapters } = useWcarckStore()
  
  // D92: Adapter transition state
  const [transitioning, setTransitioning] = React.useState<Record<string, boolean>>({})

  const fetchAdapters = () => {
    toast.success("Hardware scan requested")
  }

  const toggleMode = (iface: string) => {
    setTransitioning(prev => ({ ...prev, [iface]: true }))
    // Simulate backend delay (D92)
    setTimeout(() => {
      setTransitioning(prev => ({ ...prev, [iface]: false }))
      toast.success(`${iface} mode switched`)
    }, 2000)
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
        <AppTooltip content="Trigger hardware scan to re-detect wireless interfaces" side="bottom">
          <Button variant="outline" size="sm" onClick={fetchAdapters} className="bg-bg-active border-border-default text-text-primary h-8">
            <RefreshCw className="w-3.5 h-3.5 mr-2" />
            Refresh Inventory
          </Button>
        </AppTooltip>
      </div>

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
            {adapters.map((adapter) => {
              const isTrans = transitioning[adapter.iface]
              const isMon = adapter.mode === 'monitor'
              
              return (
                <div key={adapter.iface} className="bg-bg-elevated border border-border-subtle p-5 rounded-lg shadow-sm relative overflow-hidden flex flex-col justify-between group">
                  
                  {isTrans && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-bg-active overflow-hidden">
                      <div className="h-full bg-accent animate-pulse-green w-1/2" />
                    </div>
                  )}

                  <div>
                    <div className="flex items-start justify-between mb-4 pl-0">
                      <div>
                        <h3 className="font-semibold text-text-primary flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-text-secondary" />
                          {adapter.iface}
                        </h3>
                        <p className="text-[10px] text-text-disabled font-mono mt-0.5">{adapter.mac}</p>
                      </div>
                      <AppTooltip content={isMon ? "Monitor Mode: passive packet sniffer" : "Managed Mode: active station connection"} side="left">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border",
                          isMon ? 'bg-status-success/15 text-status-success border-status-success/25' : 'bg-status-info/15 text-status-info border-status-info/25'
                        )}>
                          {adapter.mode}
                        </span>
                      </AppTooltip>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 text-xs pl-0 mb-4">
                      <div>
                        <div className="text-text-disabled text-[9px] font-semibold uppercase tracking-wider mb-0.5">Chipset</div>
                        <div className="text-text-primary text-xs truncate" title={adapter.chipset}>{adapter.chipset}</div>
                      </div>
                      <div>
                        <div className="text-text-disabled text-[9px] font-semibold uppercase tracking-wider mb-0.5">Driver</div>
                        <div className="text-text-primary text-xs truncate" title={adapter.driver}>{adapter.driver}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-text-disabled text-[9px] font-semibold uppercase tracking-wider mb-1">Capabilities</div>
                        <div className="flex flex-wrap gap-1.5">
                          {adapter.bands.map(band => (
                            <span key={band} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-bg-surface border border-border-default text-text-secondary">
                              {band} GHz
                            </span>
                          ))}
                          {adapter.bands.includes(5) && (
                            <AppTooltip content="Dynamic Frequency Selection rules restrict usage of certain 5 GHz channels under regulatory enforcement" side="top">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-status-warning/10 border border-status-warning/20 text-status-warning flex items-center cursor-help">
                                <AlertTriangle className="w-3 h-3 mr-1" /> DFS Rules Apply (D94)
                              </span>
                            </AppTooltip>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-3 border-t border-border-subtle/50 flex justify-between items-center pl-0">
                    <div className="flex items-center space-x-2 text-[10px] text-text-disabled">
                      <AppTooltip content={`Packets Received: ${adapter.rx}`} side="top">
                        <div className="flex items-center cursor-default">
                          <div className="w-1.5 h-1.5 rounded-full bg-status-success mr-1" />
                          RX: {adapter.rx}
                        </div>
                      </AppTooltip>
                      <AppTooltip content={`Packets Transmitted: ${adapter.tx}`} side="top">
                        <div className="flex items-center cursor-default">
                          <div className="w-1.5 h-1.5 rounded-full bg-status-info mr-1" />
                          TX: {adapter.tx}
                        </div>
                      </AppTooltip>
                    </div>
                    <AppTooltip content={isMon ? "Switch back to standard Managed/Station Mode" : "Switch interface to Monitor Mode for scanning/attacks"} side="top">
                      <Button 
                        size="sm"
                        variant="outline"
                        disabled={isTrans}
                        onClick={() => toggleMode(adapter.iface)}
                        className={cn(
                          "h-7 text-[10px] px-2",
                          isMon 
                            ? "bg-bg-active text-text-primary border-border-default hover:bg-bg-hover" 
                            : "bg-status-success/10 text-status-success border-status-success/30 hover:bg-status-success/20"
                        )}
                      >
                        {isMon ? (
                          <><Globe className="w-3 h-3 mr-1" /> Stop Monitor</>
                        ) : (
                          <><Monitor className="w-3 h-3 mr-1" /> Start Monitor</>
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
