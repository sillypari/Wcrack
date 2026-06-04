import * as React from 'react'
import { Play, Square, Skull, Download, WifiOff, Shuffle, Radar, Filter, DownloadCloud, AlertTriangle, Check } from 'lucide-react'
import { useWcarckStore, Network } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ContextualPanel } from '@/components/layout/ContextualPanel'
import { AppTooltip } from '@/components/ui/app-tooltip'
import { cn, copyToClipboard } from '@/lib/utils'
import { TOOLTIPS } from '@/lib/tooltips'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'

function SignalBars({ rssi }: { rssi: number }) {
  let strength = 0
  if (rssi > -50) strength = 4
  else if (rssi > -65) strength = 3
  else if (rssi > -75) strength = 2
  else if (rssi > -90) strength = 1

  let color = 'var(--rf-signal-poor)'
  if (strength === 4) color = 'var(--rf-signal-strong)'
  else if (strength === 3) color = 'var(--rf-signal-good)'
  else if (strength === 2) color = 'var(--rf-signal-weak)'

  return (
    <AppTooltip content={TOOLTIPS['dBm']} delayDuration={300}>
      <div className="flex items-end gap-[2px] h-4">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="w-[3px] rounded-full"
            style={{
              transition: 'height 0.4s ease, background-color 0.6s ease',
              height: i <= strength ? `${i * 25}%` : '20%',
              backgroundColor: i <= strength ? color : 'var(--border-subtle)',
            }}
          />
        ))}
        <span className="text-[10px] text-text-tertiary ml-1 leading-none tabular-nums">{rssi}</span>
      </div>
    </AppTooltip>
  )
}

function EncBadge({ enc, pmf }: { enc: string; pmf: boolean }) {
  let color = 'var(--rf-wpa2)'
  if (enc.includes('WPA3')) color = 'var(--rf-wpa3)'
  if (enc.includes('WEP')) color = 'var(--rf-wep)'
  if (enc.includes('Open')) color = 'var(--rf-open)'

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="text-[10px] font-semibold px-1.5 py-0.5 rounded border"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
          color,
          borderColor: `color-mix(in srgb, ${color} 25%, transparent)`,
        }}
      >
        {enc}
      </span>
      {pmf && (
        <AppTooltip content={TOOLTIPS['PMF']}>
          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-status-info/15 text-status-info border border-status-info/25">
            PMF
          </span>
        </AppTooltip>
      )}
    </div>
  )
}

export function Reconnaissance() {
  const { networks, clients, startJob, stopJob, uiState, setUiState, activeJobs, adapters } = useWcarckStore()
  const navigate = useNavigate()

  const [globalFilter, setGlobalFilter] = React.useState('')
  const [selectedBand, setSelectedBand] = React.useState('abg')
  const [selectedChannel, setSelectedChannel] = React.useState('all')
  const [hopInterval, setHopInterval] = React.useState(250)
  
  // Advanced Filter States
  const [encFilter, setEncFilter] = React.useState('all')
  const [clientsOnly, setClientsOnly] = React.useState(false)
  const [berlinMode, setBerlinMode] = React.useState(false)
  const [minSignal, setMinSignal] = React.useState(-95)

  const parentRef = React.useRef<HTMLDivElement>(null)

  const selectedBssid = uiState.focusedNetworkBssid
  const monitorAdapters = React.useMemo(() => adapters.filter(a => a.mode === 'monitor'), [adapters])
  const [selectedIface, setSelectedIface] = React.useState<string>('')
  const activeIface = React.useMemo(() => {
    return monitorAdapters.some(a => a.iface === selectedIface) ? selectedIface : (monitorAdapters[0]?.iface || '')
  }, [monitorAdapters, selectedIface])
  const activeIfaceObj = React.useMemo(() => monitorAdapters.find(a => a.iface === activeIface), [monitorAdapters, activeIface])
  const supports5G = React.useMemo(() => activeIfaceObj?.bands?.includes(5) || false, [activeIfaceObj])
  const setSelectedBssid = (bssid: string | null) => setUiState({ focusedNetworkBssid: bssid })

  const validChannels = React.useMemo(() => {
    const ch24 = Array.from({ length: 14 }, (_, i) => i + 1)
    const ch5 = [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165, 169, 173]
    if (selectedBand === 'a') return ch5
    if (selectedBand === 'bg') return ch24
    return [...ch24, ...ch5]
  }, [selectedBand])

  React.useEffect(() => {
    if (selectedChannel !== 'all' && !validChannels.includes(Number(selectedChannel))) {
      setSelectedChannel('all')
    }
  }, [validChannels, selectedChannel])

  React.useEffect(() => {
    if (!supports5G && selectedBand !== 'bg') {
      setSelectedBand('bg')
    }
  }, [supports5G, selectedBand])

  // Data Pipeline with Advanced Filtering
  const data = React.useMemo(() => {
    let filtered = Array.from(networks.values())
    const now = Date.now()

    filtered = filtered.filter(net => {
      // 1. Min Signal Threshold
      if (net.power < minSignal) return false
      
      // 2. Encryption Filter
      if (encFilter !== 'all') {
        const encLow = net.encryption.toLowerCase()
        if (encFilter === 'wpa3' && !encLow.includes('wpa3')) return false
        if (encFilter === 'wpa2' && (!encLow.includes('wpa2') || encLow.includes('wpa3'))) return false
        if (encFilter === 'wep' && !encLow.includes('wep')) return false
        if (encFilter === 'open' && !encLow.includes('open')) return false
      }

      // 3. Clients Only Toggle
      if (clientsOnly) {
        const hasClients = Array.from(clients.values()).some(c => c.bssid === net.bssid)
        if (!hasClients) return false
      }

      // 4. Berlin Mode (Stale Timeout - 120s)
      if (berlinMode) {
        if (now - net.lastSeen > 120000) return false
      }

      return true
    })

    return filtered
  }, [networks, minSignal, encFilter, clientsOnly, berlinMode, clients])

  const columns = React.useMemo<ColumnDef<Network>[]>(() => [
    {
      accessorKey: 'ssid',
      header: 'SSID',
      cell: info => (
        <span className="font-semibold text-text-primary">
          {info.getValue<string>() || <span className="text-text-disabled italic font-normal">hidden</span>}
        </span>
      ),
    },
    {
      accessorKey: 'bssid',
      header: 'BSSID',
      cell: info => (
        <AppTooltip content={TOOLTIPS['BSSID']}>
          <span className="font-mono text-xs text-text-secondary">{info.getValue<string>()}</span>
        </AppTooltip>
      ),
    },
    {
      accessorKey: 'channel',
      header: 'CH',
      cell: info => (
        <AppTooltip content={TOOLTIPS['Channel']}>
          <span className="text-sm text-text-secondary tabular-nums">{info.getValue<number>()}</span>
        </AppTooltip>
      ),
    },
    {
      id: 'band',
      accessorFn: row => (row.channel > 14 ? '5' : '2.4'),
      header: 'BAND',
      cell: info => {
        const band = info.getValue<string>()
        return (
          <span className={cn(
            'text-[10px] font-mono font-bold px-1.5 py-0.5 rounded',
            band === '2.4' ? 'bg-rf-band-24/15 text-rf-band-24' : 'bg-rf-band-5/15 text-rf-band-5'
          )}>
            {band}G
          </span>
        )
      },
    },
    {
      accessorKey: 'power',
      header: 'SIGNAL',
      cell: info => <SignalBars rssi={info.getValue<number>()} />,
    },
    {
      accessorKey: 'encryption',
      header: 'ENC',
      cell: info => <EncBadge enc={info.getValue<string>()} pmf={info.row.original.pmf} />,
    },
    {
      accessorKey: 'beacons',
      header: 'BEACONS',
      cell: info => <span className="text-xs font-mono text-text-secondary">{info.getValue<number>()}</span>,
    },
    {
      accessorKey: 'data',
      header: 'DATA',
      cell: info => <span className="text-xs font-mono text-text-secondary">{info.getValue<number>()}</span>,
    },
    {
      id: 'clients',
      header: 'CLIENTS',
      cell: info => {
        const bssid = info.row.original.bssid
        const count = Array.from(clients.values()).filter(c => c.bssid === bssid).length
        return <span className={cn("text-xs font-mono", count > 0 ? "text-accent font-bold" : "text-text-disabled")}>{count}</span>
      },
    },
  ], [clients])

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const { rows } = table.getRowModel()

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  })

  const selectedNetwork = selectedBssid ? networks.get(selectedBssid) : null
  const connectedClients = React.useMemo(() => {
    if (!selectedBssid) return []
    return Array.from(clients.values()).filter(c => c.bssid === selectedBssid)
  }, [clients, selectedBssid])

  const isScanning = activeJobs.some(j => j.type === 'recon')
  const monAdapter = monitorAdapters.length > 0

  const handleStartScan = () => {
    if (!activeIface) {
      toast.error("No active monitor interface selected for scanning.")
      return
    }
    if (isScanning) {
      const job = activeJobs.find(j => j.type === 'recon')
      if (job) stopJob(job.id)
    } else {
      startJob('recon', { 
        iface: activeIface, 
        band: selectedBand, 
        channel: selectedChannel !== 'all' ? Number(selectedChannel) : 'all',
        hop_time: hopInterval 
      })
    }
  }

  const exportCSV = () => {
    if (!data.length) return toast.warning("No networks to export")
    let csv = "BSSID,SSID,Channel,Encryption,Cipher,Auth,PMF,Power,Beacons,Data,LastSeen\n"
    data.forEach(n => {
      csv += `${n.bssid},"${n.ssid}",${n.channel},${n.encryption},${n.cipher},${n.auth},${n.pmf},${n.power},${n.beacons},${n.data},${new Date(n.lastSeen).toISOString()}\n`
    })
    
    // Also include clients at the bottom
    csv += "\n\nClientMAC,AssociatedBSSID,Power,Packets,LastSeen\n"
    const clientData = Array.from(clients.values())
    clientData.forEach(c => {
      if (data.some(n => n.bssid === c.bssid)) {
        csv += `${c.mac},${c.bssid},${c.power},${c.packets},${new Date(c.lastSeen).toISOString()}\n`
      }
    })

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wcarck-recon-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Reconnaissance data exported to CSV")
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">

      {/* ── CONTROLS & FILTERS BAR ────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 mb-3 flex-shrink-0 bg-bg-elevated border border-border-subtle p-2.5 rounded-lg shadow-sm">
        
        {/* Top Row: Scanner Controls */}
        <div className="flex items-center gap-3">
          <Button
            onClick={handleStartScan}
            disabled={!monAdapter}
            variant={isScanning ? 'destructive' : 'default'}
            className={cn(
              'flex-shrink-0 gap-2 font-bold shadow-sm',
              !isScanning && 'bg-accent text-white hover:bg-accent-hover'
            )}
          >
            {isScanning ? (
              <><Square className="w-3.5 h-3.5" fill="currentColor" /> Stop Scan</>
            ) : (
              <><Play className="w-3.5 h-3.5" fill="currentColor" /> Start Scan</>
            )}
          </Button>

          {/* Adapter selector */}
          <div className="flex items-center gap-2 text-sm text-text-secondary ml-2">
            <span className="text-text-disabled text-[10px] uppercase font-bold tracking-wider">Adapter:</span>
            <Select value={activeIface || '_none'} onValueChange={val => setSelectedIface(val === '_none' ? '' : val)}>
              <SelectTrigger className="bg-bg-surface border border-border-subtle text-xs text-text-primary font-medium h-8 w-[140px]">
                <SelectValue placeholder="No Monitor Iface" />
              </SelectTrigger>
              <SelectContent>
                {monitorAdapters.map(a => (
                  <SelectItem key={a.iface} value={a.iface}>{a.iface}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="h-4 w-px bg-border-subtle mx-1" />

          {/* Band selector */}
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="text-text-disabled text-[10px] uppercase font-bold tracking-wider">Band:</span>
            <Select value={selectedBand} onValueChange={setSelectedBand} disabled={isScanning || !supports5G}>
              <SelectTrigger className="bg-bg-surface border border-border-subtle text-xs text-text-primary font-medium h-8 w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bg">2.4 GHz</SelectItem>
                {supports5G && <SelectItem value="a">5 GHz</SelectItem>}
                {supports5G && <SelectItem value="abg">2.4 + 5 GHz</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="text-text-disabled text-[10px] uppercase font-bold tracking-wider">CH:</span>
            <Select value={selectedChannel} onValueChange={setSelectedChannel} disabled={isScanning}>
              <SelectTrigger className="bg-bg-surface border border-border-subtle text-xs text-text-primary font-medium h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[250px]">
                <SelectItem value="all">All</SelectItem>
                {validChannels.map(ch => (
                  <SelectItem key={ch} value={ch.toString()}>{ch}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="text-text-disabled text-[10px] uppercase font-bold tracking-wider">Hop Time (ms):</span>
            <Input
              type="number"
              value={hopInterval}
              onChange={e => setHopInterval(Number(e.target.value))}
              disabled={isScanning}
              min={100}
              step={50}
              className="bg-bg-surface border border-border-subtle text-xs text-text-primary font-medium h-8 w-[70px] text-center"
            />
          </div>

          <div className="flex-1" />
          
          <Button variant="outline" size="sm" onClick={exportCSV} className="h-8 bg-bg-surface border-border-default text-text-primary">
            <DownloadCloud className="w-3.5 h-3.5 mr-2 text-text-secondary" /> Export CSV
          </Button>
        </div>

        {/* Bottom Row: Advanced Filters */}
        <div className="flex items-center gap-4 border-t border-border-subtle pt-2.5 mt-1">
          <div className="flex items-center gap-2 bg-bg-surface px-2 rounded-md border border-border-subtle h-8 min-w-[200px]">
            <Radar className="w-3.5 h-3.5 text-text-disabled" />
            <input
              type="text"
              placeholder="Filter SSID or BSSID..."
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
              className="bg-transparent border-none text-xs text-text-primary outline-none w-full"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3 h-3 text-text-disabled" />
            <Select value={encFilter} onValueChange={setEncFilter}>
              <SelectTrigger className="bg-bg-surface border border-border-subtle text-xs text-text-primary h-8 w-[110px] focus:ring-0">
                <SelectValue placeholder="Encryption" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Enc</SelectItem>
                <SelectItem value="wpa3">WPA3 Only</SelectItem>
                <SelectItem value="wpa2">WPA2 Only</SelectItem>
                <SelectItem value="wep">WEP Only</SelectItem>
                <SelectItem value="open">Open Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setClientsOnly(!clientsOnly)}
            className={cn(
              "h-8 text-xs font-semibold px-3 transition-colors",
              clientsOnly 
                ? "bg-accent/15 border-accent text-accent hover:bg-accent/25" 
                : "bg-bg-surface border-border-subtle text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            )}
          >
            {clientsOnly && <Check className="w-3.5 h-3.5 mr-1.5" />}
            Has Clients
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setBerlinMode(!berlinMode)}
            className={cn(
              "h-8 text-xs font-semibold px-3 transition-colors",
              berlinMode 
                ? "bg-status-warning/15 border-status-warning text-status-warning hover:bg-status-warning/25" 
                : "bg-bg-surface border-border-subtle text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            )}
          >
            {berlinMode && <Check className="w-3.5 h-3.5 mr-1.5" />}
            Berlin Mode
          </Button>

          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase font-bold text-text-disabled">Min Signal: {minSignal} dBm</span>
            <input 
              type="range" 
              min="-100" max="-30" step="1" 
              value={minSignal} 
              onChange={e => setMinSignal(Number(e.target.value))}
              className="w-24 accent-accent" 
            />
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT (TABLE + PANEL) ────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex gap-4">
        {/* Table Container */}
        <div className="flex-1 bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden flex flex-col shadow-sm">
          {/* Table Header */}
          <div className="bg-bg-surface border-b border-border-subtle flex-shrink-0 select-none">
            {table.getHeaderGroups().map(headerGroup => (
              <div key={headerGroup.id} className="flex items-center h-10 px-4">
                {headerGroup.headers.map(header => (
                  <div
                    key={header.id}
                    className={cn(
                      'text-[10px] font-bold text-text-disabled uppercase tracking-widest',
                      header.column.id === 'ssid' ? 'flex-1' :
                      header.column.id === 'bssid' ? 'w-36 flex-shrink-0' :
                      header.column.id === 'channel' ? 'w-12 flex-shrink-0' :
                      header.column.id === 'band' ? 'w-16 flex-shrink-0' :
                      header.column.id === 'power' ? 'w-24 flex-shrink-0' :
                      header.column.id === 'encryption' ? 'w-28 flex-shrink-0' :
                      header.column.id === 'beacons' ? 'w-20 flex-shrink-0' :
                      header.column.id === 'data' ? 'w-16 flex-shrink-0' :
                      header.column.id === 'clients' ? 'w-20 flex-shrink-0 text-right' :
                      'flex-1'
                    )}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Virtualized Body */}
          <div ref={parentRef} className="flex-1 overflow-auto bg-bg-elevated relative">
            {rows.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-text-disabled gap-3">
                <Radar className="w-10 h-10 opacity-20" />
                <span className="text-sm font-medium">No networks match filters</span>
              </div>
            ) : (
              <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map(virtualRow => {
                  const row = rows[virtualRow.index]
                  const isSelected = selectedBssid === row.original.bssid
                  const stale = (Date.now() - row.original.lastSeen) > 30000

                  return (
                    <div
                      key={row.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      onClick={() => setSelectedBssid(row.original.bssid)}
                      className={cn(
                        'flex items-center px-4 border-b border-border-subtle/50 transition-colors cursor-pointer select-none',
                        isSelected ? 'bg-bg-active' : 'hover:bg-bg-hover',
                        stale && !isSelected && 'opacity-50 grayscale-[50%]'
                      )}
                    >
                      {row.getVisibleCells().map(cell => (
                        <div
                          key={cell.id}
                          className={cn(
                            cell.column.id === 'ssid' ? 'flex-1 truncate pr-4' :
                            cell.column.id === 'bssid' ? 'w-36 flex-shrink-0' :
                            cell.column.id === 'channel' ? 'w-12 flex-shrink-0' :
                            cell.column.id === 'band' ? 'w-16 flex-shrink-0' :
                            cell.column.id === 'power' ? 'w-24 flex-shrink-0' :
                            cell.column.id === 'encryption' ? 'w-28 flex-shrink-0' :
                            cell.column.id === 'beacons' ? 'w-20 flex-shrink-0' :
                            cell.column.id === 'data' ? 'w-16 flex-shrink-0' :
                            cell.column.id === 'clients' ? 'w-20 flex-shrink-0 text-right' :
                            'flex-1'
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Contextual Panel */}
        <ContextualPanel
          isOpen={!!selectedNetwork}
          onClose={() => setSelectedBssid(null)}
          title="Network Details"
        >
          {selectedNetwork && (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto p-5 pb-24">
                
                {/* Header Info */}
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-bg-active border border-border-default flex items-center justify-center flex-shrink-0">
                    <Radar className="w-5 h-5 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-text-primary truncate" title={selectedNetwork.ssid}>
                      {selectedNetwork.ssid || <span className="italic text-text-disabled">Hidden SSID</span>}
                    </h3>
                    <div className="font-mono text-xs text-text-secondary mt-0.5 select-all">{selectedNetwork.bssid}</div>
                    
                    {/* Last seen indicator */}
                    <div className="flex items-center gap-1.5 mt-2 text-[10px] font-medium uppercase tracking-wider">
                      {(Date.now() - selectedNetwork.lastSeen) > 30000 ? (
                        <span className="text-status-warning flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Stale ({( (Date.now() - selectedNetwork.lastSeen)/1000 ).toFixed(0)}s ago)</span>
                      ) : (
                        <span className="text-status-success flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" /> Active Now</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Grid Stats */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-bg-surface border border-border-subtle p-3 rounded-lg">
                    <div className="text-[10px] text-text-disabled uppercase font-bold tracking-widest mb-1">Signal</div>
                    <div className="flex items-end gap-2">
                      <SignalBars rssi={selectedNetwork.power} />
                      <span className="text-sm font-mono text-text-primary">{selectedNetwork.power} dBm</span>
                    </div>
                  </div>
                  <div className="bg-bg-surface border border-border-subtle p-3 rounded-lg">
                    <div className="text-[10px] text-text-disabled uppercase font-bold tracking-widest mb-1">Channel</div>
                    <div className="text-sm font-mono text-text-primary">
                      {selectedNetwork.channel} <span className="text-text-disabled text-xs">({selectedNetwork.channel > 14 ? '5G' : '2.4G'})</span>
                    </div>
                  </div>
                  <div className="col-span-2 bg-bg-surface border border-border-subtle p-3 rounded-lg">
                    <div className="text-[10px] text-text-disabled uppercase font-bold tracking-widest mb-2">Security Profile</div>
                    <div className="flex gap-4">
                      <div>
                        <div className="text-[9px] text-text-disabled uppercase font-semibold">Suite</div>
                        <div className="text-xs font-semibold text-text-primary">{selectedNetwork.encryption}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-text-disabled uppercase font-semibold">Cipher</div>
                        <div className="text-xs font-mono text-text-secondary">{selectedNetwork.cipher}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-text-disabled uppercase font-semibold">Auth</div>
                        <div className="text-xs font-mono text-text-secondary">{selectedNetwork.auth}</div>
                      </div>
                      {selectedNetwork.pmf && (
                        <div>
                          <div className="text-[9px] text-text-disabled uppercase font-semibold">PMF</div>
                          <div className="text-xs font-bold text-status-success">Required</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Traffic Stats */}
                <div className="bg-bg-surface border border-border-subtle p-3 rounded-lg mb-6 flex justify-between">
                  <div>
                    <div className="text-[10px] text-text-disabled uppercase font-bold tracking-widest mb-0.5">Beacons</div>
                    <div className="text-sm font-mono text-text-primary">{selectedNetwork.beacons}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-text-disabled uppercase font-bold tracking-widest mb-0.5">Data Packets</div>
                    <div className="text-sm font-mono text-text-primary">{selectedNetwork.data}</div>
                  </div>
                </div>

                {/* Connected Clients */}
                <div>
                  <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-3 flex items-center justify-between">
                    Associated Clients
                    <span className="bg-bg-surface border border-border-subtle px-2 py-0.5 rounded-full text-[10px]">{connectedClients.length}</span>
                  </h4>
                  
                  {connectedClients.length === 0 ? (
                    <div className="text-[11px] text-text-disabled italic p-4 bg-bg-surface rounded-lg border border-border-subtle text-center">
                      No active stations detected
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {connectedClients.map(client => (
                        <div key={client.mac} className="group/cli flex items-center justify-between p-2.5 bg-bg-surface rounded-lg border border-border-subtle hover:border-border-default transition-colors">
                          <div>
                            <div className="font-mono text-xs text-text-primary font-medium">{client.mac}</div>
                            <div className="text-[10px] text-text-disabled mt-0.5 flex items-center gap-2">
                              <span><SignalBars rssi={client.power} /></span>
                              <span>Pkts: {client.packets}</span>
                            </div>
                          </div>
                          <div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sticky action buttons */}
              <div className="absolute bottom-0 left-0 right-0 bg-bg-surface border-t border-border-subtle p-3 shadow-lg">
                <div className="grid grid-cols-2 gap-2">
                  <AppTooltip content={TOOLTIPS['Deauth']}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-bg-active hover:bg-bg-hover border-border-subtle w-full text-text-primary"
                      onClick={() => {
                        setUiState({ focusedNetworkBssid: selectedNetwork.bssid })
                        navigate('/attack')
                      }}
                    >
                      <WifiOff className="w-3.5 h-3.5 mr-1.5" />Deauth
                    </Button>
                  </AppTooltip>
                  <AppTooltip content={TOOLTIPS['PMKID']}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-bg-active hover:bg-bg-hover border-border-subtle w-full text-text-primary"
                      onClick={() => {
                        setUiState({ focusedNetworkBssid: selectedNetwork.bssid })
                        navigate('/attack')
                      }}
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />PMKID
                    </Button>
                  </AppTooltip>
                  <Button
                    size="sm"
                    className="col-span-2 bg-accent hover:bg-accent-hover text-white font-bold"
                    onClick={() => {
                      setUiState({ focusedNetworkBssid: selectedNetwork.bssid })
                      navigate('/eviltwin')
                    }}
                  >
                    <Skull className="w-3.5 h-3.5 mr-1.5" />Launch Evil Twin
                  </Button>
                </div>
              </div>
            </div>
          )}
        </ContextualPanel>
      </div>

      </div>
  )
}
