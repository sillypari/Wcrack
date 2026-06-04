import * as React from 'react'
import { Play, Square, Skull, Download, WifiOff, Shuffle, Radar } from 'lucide-react'
import { useWcarckStore, Network } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ContextualPanel } from '@/components/layout/ContextualPanel'
import { AppTooltip } from '@/components/ui/app-tooltip'
import { cn } from '@/lib/utils'
import { TOOLTIPS } from '@/lib/tooltips'
import { useNavigate } from 'react-router-dom'
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
            className="w-[3px] rounded-full transition-all duration-150"
            style={{
              height: `${i * 25}%`,
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
  const parentRef = React.useRef<HTMLDivElement>(null)

  const selectedBssid = uiState.focusedNetworkBssid
  const setSelectedBssid = (bssid: string | null) => setUiState({ focusedNetworkBssid: bssid })

  const data = React.useMemo(() => Array.from(networks.values()), [networks])

  const columns = React.useMemo<ColumnDef<Network>[]>(() => [
    {
      accessorKey: 'ssid',
      header: 'SSID',
      cell: info => (
        <span className="font-medium text-text-primary">
          {info.getValue<string>() || <span className="text-text-disabled italic">hidden</span>}
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
            'text-[10px] font-mono px-1.5 py-0.5 rounded',
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
      id: 'clients',
      header: 'CLIENTS',
      cell: info => {
        const bssid = info.row.original.bssid
        const count = Array.from(clients.values()).filter(c => c.bssid === bssid).length
        return <span className="text-sm tabular-nums text-text-secondary">{count}</span>
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
  const monAdapter = adapters.find(a => a.mode === 'monitor')

  const handleStartScan = () => {
    if (!monAdapter) return
    if (isScanning) {
      const job = activeJobs.find(j => j.type === 'recon')
      if (job) stopJob(job.id)
    } else {
      startJob('recon', { iface: monAdapter.iface, band: 'all' })
    }
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">

      {/* ── CONTROLS BAR ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-3 flex-shrink-0">
        <Button
          onClick={handleStartScan}
          disabled={!monAdapter}
          variant={isScanning ? 'destructive' : 'default'}
          className={cn(
            'flex-shrink-0 gap-2',
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
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span className="text-text-disabled text-xs">Adapter:</span>
          <select className="bg-bg-elevated border border-border-subtle rounded px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent transition-colors">
            {adapters.filter(a => a.mode === 'monitor').map(a => (
              <option key={a.iface}>{a.iface}</option>
            ))}
            {!monAdapter && <option>No monitor adapter</option>}
          </select>
        </div>

        {/* Divider */}
        <div className="h-5 w-px bg-border-subtle" />

        {/* Stats pills */}
        <div className="flex items-center gap-2 text-xs text-text-disabled font-mono">
          <span className="bg-bg-elevated border border-border-subtle px-2 py-1 rounded">
            {data.length} networks
          </span>
          {data.length > 0 && (
            <span className="bg-bg-elevated border border-border-subtle px-2 py-1 rounded">
              {rows.length} shown
            </span>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <div className="relative w-56 flex-shrink-0">
          <Radar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-disabled" />
          <Input
            type="text"
            placeholder="Filter networks..."
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            className="pl-8 h-8 bg-bg-elevated border-border-subtle text-text-primary text-sm"
          />
        </div>
      </div>

      {/* ── MAIN TABLE + PANEL ───────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {/* Table region (shrinks when panel is open) */}
        <div className={cn(
          'h-full flex flex-col bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden transition-all duration-300',
          selectedBssid ? 'mr-[384px]' : ''
        )}>
          {data.length === 0 ? (
            /* EMPTY STATE — fills the card */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
              <Radar className="w-12 h-12 text-text-disabled opacity-30" />
              <div>
                <p className="text-sm font-medium text-text-primary mb-1">No Networks Found</p>
                <p className="text-xs text-text-disabled">Start a scan to discover nearby wireless networks.</p>
              </div>
              {monAdapter && (
                <Button size="sm" onClick={handleStartScan} className="bg-accent text-white hover:bg-accent-hover shadow-glow-accent text-xs mt-2">
                  <Play className="w-3 h-3 mr-1.5" fill="currentColor" />Start Scan
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="bg-bg-surface border-b border-border-subtle flex-shrink-0">
                {table.getHeaderGroups().map(headerGroup => (
                  <div key={headerGroup.id} className="flex items-center h-9">
                    {headerGroup.headers.map(header => (
                      <div
                        key={header.id}
                        className="px-4 text-[10px] font-semibold text-text-disabled uppercase tracking-widest flex-1"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Virtualized rows */}
              <div
                ref={parentRef}
                className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-border-strong scrollbar-track-transparent"
              >
                <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                  {rowVirtualizer.getVirtualItems().map(virtualRow => {
                    const row = rows[virtualRow.index]
                    const isSelected = selectedBssid === row.original.bssid
                    return (
                      <div
                        key={row.id}
                        onClick={() => setSelectedBssid(row.original.bssid)}
                        className={cn(
                          'absolute inset-x-0 flex items-center cursor-pointer transition-colors border-b border-border-subtle/50',
                          isSelected
                            ? 'bg-accent/10'
                            : 'hover:bg-bg-hover'
                        )}
                        style={{
                          top: virtualRow.start,
                          height: virtualRow.size,
                        }}
                      >
                        {row.getVisibleCells().map(cell => (
                          <div key={cell.id} className="px-4 flex-1 overflow-hidden">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Contextual detail panel */}
        <ContextualPanel
          isOpen={!!selectedBssid}
          onClose={() => setSelectedBssid(null)}
          title={selectedNetwork?.ssid || 'hidden network'}
        >
          {selectedNetwork && (
            <div className="flex flex-col h-full pb-16 animate-fade-in">
              <div className="font-mono text-xs text-text-secondary bg-bg-active px-2 py-1 rounded border border-border-subtle inline-block self-start mb-4">
                {selectedNetwork.bssid}
              </div>

              <div className="space-y-5 flex-1">
                {/* Details grid */}
                <div className="grid grid-cols-2 gap-y-4 gap-x-3 text-sm">
                  {[
                    { label: 'Channel', value: `${selectedNetwork.channel} (${selectedNetwork.channel > 14 ? '5' : '2.4'} GHz)` },
                    { label: 'Signal', value: `${selectedNetwork.power} dBm` },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="text-[10px] text-text-disabled font-semibold uppercase tracking-widest mb-1">{item.label}</div>
                      <div className="text-text-primary font-mono text-sm">{item.value}</div>
                    </div>
                  ))}
                  <div className="col-span-2">
                    <div className="text-[10px] text-text-disabled font-semibold uppercase tracking-widest mb-1">Encryption</div>
                    <div className="flex items-center gap-2 text-text-primary text-sm">
                      {selectedNetwork.encryption}
                      {selectedNetwork.pmf && (
                        <span className="text-[9px] bg-status-info/15 text-status-info px-1.5 py-0.5 rounded border border-status-info/25">PMF</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Clients section */}
                <div>
                  <div className="text-[10px] text-text-disabled font-semibold uppercase tracking-widest mb-2">
                    Connected Clients ({connectedClients.length})
                  </div>
                  {connectedClients.length === 0 ? (
                    <div className="text-xs text-text-disabled italic p-3 text-center bg-bg-surface rounded border border-border-subtle">
                      No clients detected
                    </div>
                  ) : (
                    <div className="bg-bg-surface rounded border border-border-subtle divide-y divide-border-subtle max-h-48 overflow-y-auto">
                      {connectedClients.map(client => (
                        <div key={client.mac} className="p-2.5 flex justify-between items-center hover:bg-bg-hover">
                          <div>
                            <div className="font-mono text-xs text-text-primary flex items-center gap-1.5">
                              {client.mac}
                              {client.randomized && (
                                <AppTooltip content="Randomized MAC">
                                  <Shuffle className="w-3 h-3 text-status-warning" />
                                </AppTooltip>
                              )}
                            </div>
                            <div className="text-[10px] text-text-disabled mt-0.5">Pkt: {client.packets}</div>
                          </div>
                          <div
                            className="text-xs font-mono"
                            style={{ color: client.power > -65 ? 'var(--status-success)' : 'var(--status-warning)' }}
                          >
                            {client.power} dBm
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sticky action buttons */}
              <div className="absolute bottom-0 left-0 right-0 bg-bg-surface border-t border-border-subtle p-3">
                <div className="grid grid-cols-2 gap-2">
                  <AppTooltip content={TOOLTIPS['Deauth']}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-status-error/8 hover:bg-status-error/16 text-status-error border-status-error/25 w-full"
                      onClick={() => startJob('deauth', { bssid: selectedNetwork.bssid })}
                    >
                      <WifiOff className="w-3.5 h-3.5 mr-1.5" />Deauth All
                    </Button>
                  </AppTooltip>
                  <AppTooltip content={TOOLTIPS['PMKID']}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-bg-active hover:bg-bg-hover border-border-subtle w-full"
                      onClick={() => startJob('pmkid', { bssid: selectedNetwork.bssid })}
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />PMKID
                    </Button>
                  </AppTooltip>
                  <Button
                    size="sm"
                    className="col-span-2 bg-bg-active hover:bg-bg-hover text-text-primary border border-border-subtle"
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
