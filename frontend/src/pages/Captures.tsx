import * as React from 'react'
import { Download, RefreshCw, Database, Check, Hammer, RotateCw, Eraser, Info, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { useWcarckStore } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { AppTooltip } from '@/components/ui/app-tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function EapolMini({ m1, m2, m3, m4 }: { m1: boolean; m2: boolean; m3: boolean; m4: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {[
        { label: 'M1', v: m1 },
        { label: 'M2', v: m2 },
        { label: 'M3', v: m3 },
        { label: 'M4', v: m4 },
      ].map(node => (
        <div key={node.label} className="flex items-center gap-0.5">
          <span className={cn(
            'text-[9px] font-mono font-bold',
            node.v ? 'text-status-success' : 'text-text-disabled'
          )}>
            {node.label}
          </span>
          <div className={cn(
            'w-2.5 h-2.5 rounded-full flex items-center justify-center',
            node.v ? 'bg-status-success' : 'bg-bg-active border border-border-default'
          )}>
            {node.v && <Check className="w-1.5 h-1.5 text-bg-root stroke-[4px]" />}
          </div>
        </div>
      ))}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn(
      'text-[10px] font-bold px-2 py-0.5 rounded border',
      status === 'Valid' ? 'bg-status-success/15 text-status-success border-status-success/25' :
      status === 'Partial' ? 'bg-status-warning/15 text-status-warning border-status-warning/25' :
      'bg-status-error/15 text-status-error border-status-error/25'
    )}>
      {status}
    </span>
  )
}

export function Captures() {
  const { captures, startJob, fetchInitialState, adapters } = useWcarckStore()
  const navigate = useNavigate()
  const [loading, setLoading] = React.useState(false)
  
  // Custom Modal & Loading states for Captures Page
  const [isStationModalOpen, setIsStationModalOpen] = React.useState(false)
  const [selectedCaptureForStations, setSelectedCaptureForStations] = React.useState<any>(null)
  const [captureStations, setCaptureStations] = React.useState<any[]>([])
  const [cleaningCaptureId, setCleaningCaptureId] = React.useState<string | null>(null)

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [dateRangeFilter, setDateRangeFilter] = React.useState('all')
  const [sortCol, setSortCol] = React.useState<'time'|'target'|'status'|'size'>('time')
  const [sortDir, setSortDir] = React.useState<'asc'|'desc'>('desc')

  const monAdapter = adapters.find(a => a.mode === 'monitor')

  const refreshCaptures = async () => {
    setLoading(true)
    await fetchInitialState()
    setLoading(false)
  }

  React.useEffect(() => {
    refreshCaptures()
  }, [])

  const handleCleanCapture = async (captureId: string) => {
    setCleaningCaptureId(captureId)
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/captures/${captureId}/clean`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        const reductionPct = data.reduction_pct || 0
        const originalKB = data.original_size ? (data.original_size / 1024).toFixed(1) : '?'
        const newKB = data.size_bytes ? (data.size_bytes / 1024).toFixed(1) : '?'
        if (reductionPct > 0) {
          toast.success(`PCAP sanitized: ${originalKB} KB → ${newKB} KB (${reductionPct}% reduction)`)
        } else {
          toast.success("PCAP file successfully sanitized via wpaclean")
        }
        await fetchInitialState()
      } else {
        const err = await res.text()
        toast.error(`Sanitization failed: ${err}`)
      }
    } catch (e) {
      toast.error("Cannot reach backend")
    } finally {
      setCleaningCaptureId(null)
    }
  }

  const handleViewStations = async (cap: any) => {
    setSelectedCaptureForStations(cap)
    setIsStationModalOpen(true)
    setCaptureStations([])
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/captures/${cap.id}/stations`)
      if (res.ok) {
        setCaptureStations(await res.json())
      } else {
        const text = await res.text()
        toast.error(`Failed to load stations: ${text || res.statusText}`)
      }
    } catch (e) {
      console.error("Failed to load stations", e)
      toast.error("Cannot reach backend")
    }
  }

  const handleDownload = async (cap: any) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/captures/${cap.id}/download`)
      if (!res.ok) {
        const text = await res.text()
        toast.error(`Failed to download capture: ${text || res.statusText}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = cap.filePath?.split(/[/\\]/).pop() || `capture_${cap.id}.cap`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error("Cannot reach backend")
    }
  }

  const validCount = captures.filter(c => c.status === 'Valid').length
  const partialCount = captures.filter(c => c.status === 'Partial').length

  const filteredCaptures = React.useMemo(() => {
    let filtered = captures.filter(c => {
      if (statusFilter !== 'all' && c.status.toLowerCase() !== statusFilter) return false
      
      if (dateRangeFilter !== 'all') {
        const now = Date.now()
        const cTime = c.timestamp
        if (dateRangeFilter === '1h' && now - cTime > 3600000) return false
        if (dateRangeFilter === '24h' && now - cTime > 86400000) return false
        if (dateRangeFilter === '7d' && now - cTime > 604800000) return false
      }

      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (
          !c.ssid?.toLowerCase().includes(q) &&
          !c.bssid?.toLowerCase().includes(q) &&
          !c.sha256?.toLowerCase().includes(q)
        ) return false
      }
      return true
    })

    filtered.sort((a, b) => {
      let cmp = 0
      if (sortCol === 'time') cmp = a.timestamp - b.timestamp
      if (sortCol === 'target') cmp = (a.ssid || '').localeCompare(b.ssid || '')
      if (sortCol === 'status') cmp = a.status.localeCompare(b.status)
      if (sortCol === 'size') cmp = (a.sizeBytes || 0) - (b.sizeBytes || 0)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return filtered
  }, [captures, statusFilter, searchQuery, dateRangeFilter, sortCol, sortDir])

  const handleSort = (col: 'time'|'target'|'status'|'size') => {
    if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const SortIcon = ({ col }: { col: 'time'|'target'|'status'|'size' }) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3.5 h-3.5 ml-1.5 opacity-30 group-hover:opacity-100 transition-opacity" />
    return sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 ml-1.5 text-accent" /> : <ArrowDown className="w-3.5 h-3.5 ml-1.5 text-accent" />
  }

  return (
    <div className="flex flex-col h-full animate-fade-in gap-3">

      {/* ── HEADER + STATS ROW ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-text-primary tracking-tight">Packet Captures</h2>
            {captures.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-text-disabled bg-bg-elevated border border-border-subtle px-2 py-1 rounded">
                  {captures.length} total
                </span>
                {validCount > 0 && (
                  <span className="text-xs font-mono text-status-success bg-status-success/10 border border-status-success/20 px-2 py-1 rounded">
                    {validCount} valid
                  </span>
                )}
                {partialCount > 0 && (
                  <span className="text-xs font-mono text-status-warning bg-status-warning/10 border border-status-warning/20 px-2 py-1 rounded">
                    {partialCount} partial
                  </span>
                )}
              </div>
            )}
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={refreshCaptures}
            disabled={loading}
            className="bg-bg-active border-border-default text-text-primary h-8"
          >
            <RotateCw className={cn('w-3.5 h-3.5 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {/* ── FILTERS BAR ────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 bg-bg-elevated border border-border-subtle rounded-lg p-2 shadow-sm">
          <div className="flex items-center gap-1.5 h-8 bg-bg-surface px-2 rounded-md border border-border-subtle flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-text-disabled" />
            <input 
              type="text" 
              placeholder="Search Target SSID, BSSID, or Hash..." 
              className="bg-transparent border-none text-xs text-text-primary outline-none w-full"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5 h-8">
            <Filter className="w-3.5 h-3.5 text-text-disabled ml-1" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-bg-surface border border-border-subtle text-xs text-text-primary h-8 w-[130px] focus:ring-0">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="valid">Valid Only</SelectItem>
                <SelectItem value="partial">Partial Only</SelectItem>
                <SelectItem value="invalid">Invalid Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Select value={dateRangeFilter} onValueChange={setDateRangeFilter}>
            <SelectTrigger className="bg-bg-surface border border-border-subtle text-xs text-text-primary h-8 w-[120px] focus:ring-0">
              <SelectValue placeholder="All Time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="1h">Last 1 Hour</SelectItem>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── TABLE (fills remaining height) ───────────────────────────── */}
      <div className="flex-1 min-h-0 bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden flex flex-col shadow-sm">
        {/* Table head always visible */}
        <div className="bg-bg-surface border-b border-border-subtle flex-shrink-0 select-none">
          <div className="flex items-center h-10 px-4">
            <div className="w-16 flex-shrink-0 text-[10px] font-semibold text-text-disabled uppercase tracking-widest">Type</div>
            <div className="flex-1 flex items-center cursor-pointer group" onClick={() => handleSort('target')}>
              <span className="text-[10px] font-semibold text-text-disabled uppercase tracking-widest">Target</span>
              <SortIcon col="target" />
            </div>
            <div className="w-20 flex-shrink-0 flex items-center cursor-pointer group" onClick={() => handleSort('status')}>
              <span className="text-[10px] font-semibold text-text-disabled uppercase tracking-widest">Status</span>
              <SortIcon col="status" />
            </div>
            <div className="w-28 flex-shrink-0 text-[10px] font-semibold text-text-disabled uppercase tracking-widest">EAPOL</div>
            <div className="w-20 flex-shrink-0 flex items-center cursor-pointer group" onClick={() => handleSort('size')}>
              <span className="text-[10px] font-semibold text-text-disabled uppercase tracking-widest">Size</span>
              <SortIcon col="size" />
            </div>
            <div className="w-32 flex-shrink-0 text-[10px] font-semibold text-text-disabled uppercase tracking-widest">Hash</div>
            <div className="w-36 flex-shrink-0 flex items-center cursor-pointer group" onClick={() => handleSort('time')}>
              <span className="text-[10px] font-semibold text-text-disabled uppercase tracking-widest">Captured</span>
              <SortIcon col="time" />
            </div>
            <div className="w-64 flex-shrink-0 text-[10px] font-semibold text-text-disabled uppercase tracking-widest text-right">Actions</div>
          </div>
        </div>

        {/* Scrollable rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-border-subtle/60 relative">
          {captures.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center p-8 bg-bg-elevated/50 backdrop-blur-sm z-10">
              <Database className="w-12 h-12 text-text-disabled opacity-25" />
              <div>
                <p className="text-sm font-medium text-text-primary mb-1">No Captures Detected</p>
                <p className="text-xs text-text-disabled max-w-sm">You haven't captured any handshakes yet. Run a deauth attack on a target to harvest EAPOL/PMKID data.</p>
              </div>
              <Button
                size="sm"
                onClick={() => navigate('/recon')}
                className="bg-accent hover:bg-accent-hover text-white text-xs mt-2"
              >
                Go to Recon Dashboard
              </Button>
            </div>
          ) : filteredCaptures.length === 0 ? (
            <div className="p-12 text-center text-xs text-text-disabled">
              No captures match the current search or filters.
            </div>
          ) : (
            filteredCaptures.map(cap => {
              const sizeKB = cap.sizeBytes ? (cap.sizeBytes / 1024).toFixed(1) + ' KB' : '0 KB'
              const shortHash = cap.sha256 && cap.sha256 !== 'unknown' ? cap.sha256.substring(0, 8) + '...' : '-'
              const isCleaning = cleaningCaptureId === cap.id

              return (
                <div key={cap.id} className="flex items-center h-14 px-4 hover:bg-bg-hover transition-colors gap-0">
                  {/* Type badge */}
                  <div className="w-16 flex-shrink-0">
                    <span className={cn(
                      'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border',
                      cap.type === 'eapol'
                        ? 'bg-status-info/15 text-status-info border-status-info/25'
                        : cap.type === 'pmkid'
                        ? 'bg-accent/15 text-accent border-accent/25'
                        : 'bg-status-warning/15 text-status-warning border-status-warning/25'
                    )}>
                      {cap.type.toUpperCase()}
                    </span>
                  </div>

                  {/* Target */}
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="font-semibold text-text-primary text-sm truncate">{cap.ssid || 'Hidden SSID'}</div>
                    <div className="font-mono text-[10px] text-text-disabled mt-0.5">{cap.bssid}</div>
                  </div>

                  {/* Status */}
                  <div className="w-20 flex-shrink-0">
                    <StatusPill status={cap.status} />
                  </div>

                  {/* EAPOL */}
                  <div className="w-28 flex-shrink-0">
                    {cap.type === 'eapol' ? (
                      <EapolMini m1={cap.eapolM1} m2={cap.eapolM2} m3={cap.eapolM3} m4={cap.eapolM4} />
                    ) : (
                      <span className="text-text-disabled text-xs font-mono">-</span>
                    )}
                  </div>

                  {/* Size */}
                  <div className="w-20 flex-shrink-0 text-xs font-mono text-text-secondary">
                    {sizeKB}
                  </div>

                  {/* Hash */}
                  <div className="w-32 flex-shrink-0 text-[10px] font-mono text-text-disabled truncate" title={cap.sha256}>
                    {shortHash}
                  </div>

                  {/* Timestamp */}
                  <div className="w-36 flex-shrink-0 font-mono text-xs text-text-disabled">
                    <div className="text-[11px] text-text-primary">
                      {new Date(cap.timestamp).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="w-64 flex-shrink-0 flex items-center justify-end gap-1.5">
                    {cap.status === 'Partial' && monAdapter && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startJob('deauth', { bssid: cap.bssid, iface: monAdapter.iface })}
                        className="h-7 text-[10px] px-2 bg-bg-active border-border-subtle hover:bg-bg-hover"
                        title={monAdapter ? undefined : 'No monitor adapter available'}
                      >
                        <RefreshCw className="w-2.5 h-2.5 mr-1" />Re-cap
                      </Button>
                    )}
                    
                    <AppTooltip content="Clean Capture (wpaclean sanitization)" side="top">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isCleaning}
                        onClick={() => handleCleanCapture(cap.id)}
                        className="h-7 w-7 p-0 bg-bg-active border-border-subtle hover:bg-bg-hover"
                        aria-label="Clean Capture"
                      >
                        <Eraser className={cn("w-3.5 h-3.5 text-status-info", isCleaning && "animate-spin")} />
                      </Button>
                    </AppTooltip>

                    <AppTooltip content="View clients associated with this target BSSID" side="top">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewStations(cap)}
                        className="h-7 w-7 p-0 bg-bg-active border-border-subtle hover:bg-bg-hover"
                        aria-label="View Stations"
                      >
                        <Info className="w-3.5 h-3.5 text-text-secondary" />
                      </Button>
                    </AppTooltip>

                    <AppTooltip content="Download capture (.cap)" side="top">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(cap)}
                        className="h-7 w-7 p-0 bg-bg-active border-border-subtle hover:bg-bg-hover"
                        aria-label="Download capture"
                      >
                        <Download className="w-3.5 h-3.5 text-text-secondary" />
                      </Button>
                    </AppTooltip>

                    <Button
                      size="sm"
                      onClick={() => navigate('/crack', { state: { captureId: cap.id } })}
                      className="h-7 text-[10px] px-2.5 bg-accent text-white hover:bg-accent-hover font-bold"
                    >
                      <Hammer className="w-3 h-3 mr-1" />Crack
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── STATIONS LIST MODAL ─────────────────────────────────────────── */}
      {isStationModalOpen && selectedCaptureForStations && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="stations-modal-title">
          <div className="bg-bg-elevated border border-border-default rounded-xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-4 animate-scale-in">
            <div className="flex justify-between items-start border-b border-border-subtle pb-3">
              <div>
                <h3 id="stations-modal-title" className="text-md font-bold text-text-primary">Captured BSSID Stations</h3>
                <p className="text-xs text-text-disabled mt-0.5">Target BSSID: {selectedCaptureForStations.bssid}</p>
              </div>
              <button 
                onClick={() => setIsStationModalOpen(false)}
                className="text-text-disabled hover:text-text-primary font-mono text-sm leading-none"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {captureStations.length === 0 ? (
                <div className="text-xs text-text-disabled italic p-4 text-center bg-bg-surface rounded border border-border-subtle">
                  No stations registered in SQLite clients registry for this BSSID.
                </div>
              ) : (
                <div className="bg-bg-surface rounded border border-border-subtle divide-y divide-border-subtle max-h-60 overflow-y-auto">
                  {captureStations.map(station => (
                    <div key={station.mac} className="p-3 flex justify-between items-center text-xs">
                      <div>
                        <div className="font-mono text-text-primary font-bold">{station.mac}</div>
                        {station.vendor && <div className="text-[10px] text-text-disabled mt-0.5">{station.vendor}</div>}
                      </div>
                      <div className="text-right">
                        <div className="text-status-success font-mono font-bold">{station.max_rssi || station.power || -80} dBm</div>
                        <div className="text-[10px] text-text-disabled mt-0.5">Pkts: {station.packets || 0}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Button
                size="sm"
                className="bg-bg-active hover:bg-bg-hover text-text-primary border border-border-subtle w-full mt-2"
                onClick={() => setIsStationModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
