import * as React from 'react'
import { FileJson, Trash2, Filter } from 'lucide-react'
import { useWcarckStore } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function Logs() {
  const { logs } = useWcarckStore()
  
  const [filterDebug, setFilterDebug] = React.useState(false)
  const [filterInfo, setFilterInfo] = React.useState(true)
  const [filterWarn, setFilterWarn] = React.useState(true)
  const [filterError, setFilterError] = React.useState(true)
  const [filterChannel, setFilterChannel] = React.useState<string>('All')

  const clearLogs = () => {
    useWcarckStore.setState({ logs: [] })
    toast.success("Logs cleared")
  }

  const copyDebugReport = () => {
    const report = `Wcarck Debug Report\nGenerated: ${new Date().toISOString()}\nLogs:\n${JSON.stringify(logs, null, 2)}`
    navigator.clipboard.writeText(report)
    toast.success("Debug report copied to clipboard")
  }

  const filteredLogs = logs.filter(l => {
    if (l.level === 'DEBUG' && !filterDebug) return false
    if (l.level === 'INFO' && !filterInfo) return false
    if (l.level === 'WARN' && !filterWarn) return false
    if ((l.level === 'ERROR' || l.level === 'CRITICAL') && !filterError) return false
    if (filterChannel !== 'All' && l.channel !== filterChannel) return false
    return true
  })

  const infoCount = logs.filter(l => l.level === 'INFO').length
  const warnCount = logs.filter(l => l.level === 'WARN').length
  const errorCount = logs.filter(l => l.level === 'ERROR' || l.level === 'CRITICAL').length

  return (
    <div className="flex flex-col h-full animate-fade-in gap-3">
      {/* ── HEADER + STATS ROW ────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-text-primary tracking-tight">System Logs</h2>
          {logs.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-text-disabled bg-bg-elevated border border-border-subtle px-2 py-1 rounded">
                {logs.length} total
              </span>
              {infoCount > 0 && (
                <span className="text-xs font-mono text-status-info bg-status-info/10 border border-status-info/20 px-2 py-1 rounded">
                  {infoCount} info
                </span>
              )}
              {warnCount > 0 && (
                <span className="text-xs font-mono text-status-warning bg-status-warning/10 border border-status-warning/20 px-2 py-1 rounded">
                  {warnCount} warn
                </span>
              )}
              {errorCount > 0 && (
                <span className="text-xs font-mono text-status-error bg-status-error/10 border border-status-error/20 px-2 py-1 rounded">
                  {errorCount} error
                </span>
              )}
            </div>
          )}
        </div>
        
        {logs.length > 0 && (
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="bg-bg-active border-border-default text-text-primary h-8">
                  <Filter className="w-3.5 h-3.5 mr-2" />
                  Filter Levels
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 bg-bg-elevated border-border-subtle text-text-primary" align="end">
                <DropdownMenuCheckboxItem checked={filterDebug} onCheckedChange={setFilterDebug} className="hover:bg-bg-hover focus:bg-bg-hover cursor-pointer">DEBUG</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={filterInfo} onCheckedChange={setFilterInfo} className="hover:bg-bg-hover focus:bg-bg-hover cursor-pointer">INFO</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={filterWarn} onCheckedChange={setFilterWarn} className="hover:bg-bg-hover focus:bg-bg-hover cursor-pointer">WARN</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={filterError} onCheckedChange={setFilterError} className="hover:bg-bg-hover focus:bg-bg-hover cursor-pointer">ERROR / CRITICAL</DropdownMenuCheckboxItem>
                <div className="border-t border-border-subtle my-1" />
                {['All', 'RF', 'System', 'Process', 'DB'].map(ch => (
                  <DropdownMenuCheckboxItem
                    key={ch}
                    checked={filterChannel === ch}
                    onCheckedChange={() => setFilterChannel(ch)}
                    className="hover:bg-bg-hover focus:bg-bg-hover cursor-pointer"
                  >
                    Channel: {ch}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="outline" size="sm" onClick={copyDebugReport} className="bg-bg-active border-border-default text-text-primary h-8">
              <FileJson className="w-3.5 h-3.5 mr-2" />
              Copy Report
            </Button>

            <Button variant="outline" size="sm" onClick={clearLogs} className="bg-status-error/10 border-status-error/30 text-status-error hover:bg-status-error/20 h-8">
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* ── CONTENT AREA ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden flex flex-col">
        {logs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <FileJson className="w-12 h-12 text-text-disabled opacity-25" />
            <div>
              <p className="text-sm font-medium text-text-primary mb-1">No Logs</p>
              <p className="text-xs text-text-disabled">System events will appear here.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Table head */}
            <div className="bg-bg-surface border-b border-border-subtle flex-shrink-0">
              <div className="flex items-center h-9 px-4">
                {['Timestamp', 'Level', 'Event Type', 'Message / Details'].map((col, i) => (
                  <div
                    key={col}
                    className={cn(
                      'text-[10px] font-semibold text-text-disabled uppercase tracking-widest',
                      i === 0 ? 'w-[160px] flex-shrink-0' :
                      i === 1 ? 'w-[100px] flex-shrink-0' :
                      i === 2 ? 'w-[200px] flex-shrink-0' :
                      'flex-1'
                    )}
                  >
                    {col}
                  </div>
                ))}
              </div>
            </div>

            {/* Scrollable rows */}
            <div className="flex-1 overflow-y-auto divide-y divide-border-subtle/60">
              {filteredLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-text-disabled">
                  No logs match the current filters.
                </div>
              ) : (
                filteredLogs.map((log, i) => (
                  <div key={i} className="flex items-start py-3 px-4 hover:bg-bg-hover transition-colors font-mono text-xs">
                    {/* Timestamp */}
                    <div className="w-[160px] flex-shrink-0 text-text-disabled text-[11px] pt-0.5">
                      {new Date(typeof log.timestamp === 'number' ? log.timestamp : Number(log.timestamp)).toISOString().replace('T', ' ').substring(0, 19)}
                    </div>

                    {/* Level */}
                    <div className="w-[100px] flex-shrink-0 pt-0.5">
                      <span className={cn(
                        "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",
                        log.level === 'ERROR' || log.level === 'CRITICAL' ? 'bg-status-error/15 text-status-error border-status-error/25' :
                        log.level === 'WARN' ? 'bg-status-warning/15 text-status-warning border-status-warning/25' :
                        'bg-status-info/15 text-status-info border-status-info/25'
                      )}>
                        {log.level}
                      </span>
                    </div>

                    {/* Event Type */}
                    <div className="w-[200px] flex-shrink-0 text-text-primary pr-4 truncate pt-0.5">
                      {log.event_type}
                    </div>

                    {/* Message / Details */}
                    <div className="flex-1 min-w-0 font-sans">
                      <div className="font-semibold text-text-primary text-sm leading-normal">{log.message}</div>
                      {Object.keys(log.payload).length > 0 && (
                        <div className="mt-1 text-text-disabled text-[10px] bg-bg-surface border border-border-subtle/40 rounded p-1.5 overflow-x-auto scrollbar-thin font-mono">
                          {JSON.stringify(log.payload, null, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
