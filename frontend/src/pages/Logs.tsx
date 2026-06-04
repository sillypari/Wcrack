import * as React from 'react'
import { FileJson, Trash2, Filter, Download, Pause, Play, Search, Minimize2, Maximize2, ArrowDown, ChevronRight, ChevronDown } from 'lucide-react'
import { useWcarckStore } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn, copyToClipboard } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AppTooltip } from '@/components/ui/app-tooltip'

// Custom hook for column resizing
function useColumnResizer(initialWidth: number, minWidth: number = 50) {
  const [width, setWidth] = React.useState(initialWidth)
  const isResizing = React.useRef(false)

  const handleMouseDown = (e: React.MouseEvent) => {
    isResizing.current = true
    const startX = e.pageX
    const startWidth = width

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      const newWidth = Math.max(minWidth, startWidth + (e.pageX - startX))
      setWidth(newWidth)
    }

    const handleMouseUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return { width, handleMouseDown }
}

const Resizer = ({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) => (
  <div 
    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-accent/50 z-10 transition-colors"
    onMouseDown={onMouseDown}
  />
)

export function Logs() {
  const { logs } = useWcarckStore()
  
  // Filters
  const [levelFilterPreset, setLevelFilterPreset] = React.useState('info_up')
  const [filterChannel, setFilterChannel] = React.useState<string>('All')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [jobIdFilter, setJobIdFilter] = React.useState('All')
  const [adapterFilter, setAdapterFilter] = React.useState('All')

  // UI State
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = React.useState(true)
  const [isCompact, setIsCompact] = React.useState(false)
  const [expandedLogs, setExpandedLogs] = React.useState<Set<string>>(new Set())
  const listContainerRef = React.useRef<HTMLDivElement>(null)
  const [newLogsCount, setNewLogsCount] = React.useState(0)
  
  const logsEndRef = React.useRef<HTMLDivElement>(null)
  const prevLogsLengthRef = React.useRef(logs.length)

  // Column Resizers
  const timeCol = useColumnResizer(150, 100)
  const levelCol = useColumnResizer(85, 60)
  const eventCol = useColumnResizer(180, 100)
  
  // Derived Data for Filters
  const uniqueAdapters = React.useMemo(() => Array.from(new Set(logs.map(l => l.adapter_iface).filter(Boolean))), [logs])
  const uniqueJobIds = React.useMemo(() => Array.from(new Set(logs.map(l => l.job_id).filter(Boolean))), [logs])

  const clearLogs = () => {
    useWcarckStore.setState({ logs: [] })
    toast.success("Logs cleared")
  }

  // Filter Logic
  const filteredLogs = React.useMemo(() => {
    return logs.filter(l => {
      if (levelFilterPreset === 'info_up' && l.level === 'DEBUG') return false
      if (levelFilterPreset === 'warn_up' && (l.level === 'DEBUG' || l.level === 'INFO')) return false
      if (levelFilterPreset === 'error_only' && l.level !== 'ERROR' && l.level !== 'CRITICAL') return false
      if (filterChannel !== 'All' && l.channel !== filterChannel) return false
      if (jobIdFilter !== 'All' && l.job_id !== jobIdFilter) return false
      if (adapterFilter !== 'All' && l.adapter_iface !== adapterFilter) return false
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchMsg = l.message?.toLowerCase().includes(query)
        const matchPayload = l.payload && JSON.stringify(l.payload).toLowerCase().includes(query)
        const matchEvent = l.event_type?.toLowerCase().includes(query)
        if (!matchMsg && !matchPayload && !matchEvent) return false
      }
      return true
    })
  }, [logs, levelFilterPreset, filterChannel, jobIdFilter, adapterFilter, searchQuery])

  // Stats
  const infoCount = logs.filter(l => l.level === 'INFO').length
  const warnCount = logs.filter(l => l.level === 'WARN').length
  const errorCount = logs.filter(l => l.level === 'ERROR' || l.level === 'CRITICAL').length

  // Auto-Scroll Logic
  React.useEffect(() => {
    if (logs.length > prevLogsLengthRef.current) {
      if (isAutoScrollEnabled) {
        logsEndRef.current?.scrollIntoView()
        setNewLogsCount(0)
      } else {
        setNewLogsCount(prev => prev + (logs.length - prevLogsLengthRef.current))
      }
    }
    prevLogsLengthRef.current = logs.length
  }, [logs.length, isAutoScrollEnabled])
  
  // Detect manual scroll up to pause auto-scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const isAtBottom = Math.abs(target.scrollHeight - target.scrollTop - target.clientHeight) < 20
    
    if (isAutoScrollEnabled && !isAtBottom) {
       setIsAutoScrollEnabled(false)
    } else if (!isAutoScrollEnabled && isAtBottom) {
       setIsAutoScrollEnabled(true)
       setNewLogsCount(0)
    }
  }

  const toggleExpand = (logId: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev)
      if (next.has(logId)) next.delete(logId)
      else next.add(logId)
      return next
    })
  }

  const exportJsonl = () => {
    if (filteredLogs.length === 0) {
      toast.warning("No logs to export")
      return
    }
    const data = filteredLogs.map(l => JSON.stringify(l)).join('\n')
    const blob = new Blob([data], { type: 'application/x-ndjson' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wcarck-logs-${Date.now()}.jsonl`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Logs exported successfully")
  }

  return (
    <div className="flex flex-col h-full animate-fade-in gap-3 relative">
      {/* ── HEADER & TOOLBAR ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-text-primary tracking-tight">System Logs</h2>
            {logs.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-text-disabled bg-bg-elevated border border-border-subtle px-2 py-1 rounded">
                  {logs.length} total
                </span>
                {errorCount > 0 && (
                  <span className="text-xs font-mono text-status-error bg-status-error/10 border border-status-error/20 px-2 py-1 rounded">
                    {errorCount} error
                  </span>
                )}
                {warnCount > 0 && (
                  <span className="text-xs font-mono text-status-warning bg-status-warning/10 border border-status-warning/20 px-2 py-1 rounded">
                    {warnCount} warn
                  </span>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <AppTooltip content={isCompact ? "Standard View" : "Compact View"} side="bottom">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setIsCompact(!isCompact)} 
                className={cn("bg-bg-active border-border-default text-text-secondary hover:text-text-primary h-8 w-8", isCompact && "text-accent border-accent/50 bg-accent/10")}
                aria-label={isCompact ? "Standard View" : "Compact View"}
              >
                {isCompact ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              </Button>
            </AppTooltip>

            <AppTooltip content={isAutoScrollEnabled ? "Pause Auto-scroll" : "Resume Auto-scroll"} side="bottom">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => {
                  setIsAutoScrollEnabled(!isAutoScrollEnabled)
                  if (!isAutoScrollEnabled) logsEndRef.current?.scrollIntoView()
                }} 
                className={cn("bg-bg-active border-border-default h-8 w-8", !isAutoScrollEnabled ? "text-status-warning border-status-warning/50 bg-status-warning/10" : "text-text-secondary hover:text-text-primary")}
                aria-label={isAutoScrollEnabled ? "Pause Auto-scroll" : "Resume Auto-scroll"}
              >
                {!isAutoScrollEnabled ? <Play className="w-3.5 h-3.5" fill="currentColor" /> : <Pause className="w-3.5 h-3.5" fill="currentColor" />}
              </Button>
            </AppTooltip>

            <Button variant="outline" size="sm" onClick={exportJsonl} className="bg-bg-active border-border-default text-text-primary h-8">
              <Download className="w-3.5 h-3.5 mr-2" />
              Export .jsonl
            </Button>

            <Button variant="outline" size="sm" onClick={clearLogs} className="bg-accent/10 border-accent/30 text-accent hover:bg-accent/20 h-8">
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Clear
            </Button>
          </div>
        </div>

        {/* ── FILTERS BAR ────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 bg-bg-elevated border border-border-subtle rounded-lg p-2">
          <div className="flex items-center gap-1.5 h-8 bg-bg-surface px-2 rounded-md border border-border-subtle flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-text-disabled" />
            <input 
              type="text" 
              placeholder="Grep messages, payloads, events..." 
              className="bg-transparent border-none text-xs text-text-primary outline-none w-full"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <Select value={levelFilterPreset} onValueChange={setLevelFilterPreset}>
            <SelectTrigger className="bg-bg-surface border border-border-subtle text-xs text-text-primary h-8 w-[130px] focus:ring-0">
              <SelectValue placeholder="All Levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="info_up">Info & Above</SelectItem>
              <SelectItem value="warn_up">Warnings & Errors</SelectItem>
              <SelectItem value="error_only">Errors Only</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterChannel} onValueChange={setFilterChannel}>
            <SelectTrigger className="bg-bg-surface border border-border-subtle text-xs text-text-primary h-8 w-[130px] focus:ring-0">
              <SelectValue placeholder="All Channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Channels</SelectItem>
              <SelectItem value="RF">Channel: RF</SelectItem>
              <SelectItem value="System">Channel: System</SelectItem>
              <SelectItem value="Process">Channel: Process</SelectItem>
              <SelectItem value="DB">Channel: DB</SelectItem>
            </SelectContent>
          </Select>

          <Select value={adapterFilter} onValueChange={setAdapterFilter}>
            <SelectTrigger className="bg-bg-surface border border-border-subtle text-xs text-text-primary h-8 w-[120px] focus:ring-0">
              <SelectValue placeholder="All Adapters" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Adapters</SelectItem>
              {uniqueAdapters.map(a => <SelectItem key={a as string} value={a as string}>{a as string}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={jobIdFilter} onValueChange={setJobIdFilter}>
            <SelectTrigger className="bg-bg-surface border border-border-subtle text-xs text-text-primary h-8 w-[120px] focus:ring-0">
              <SelectValue placeholder="All Jobs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Jobs</SelectItem>
              {uniqueJobIds.map(j => <SelectItem key={j as string} value={j as string}>Job {j as string}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── CONTENT AREA ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 bg-[#0a0a0a] border border-border-subtle rounded-lg overflow-hidden flex flex-col relative font-mono text-[#d4d4d4] shadow-inner">
        {/* NEW LOGS INDICATOR */}
        {!isAutoScrollEnabled && newLogsCount > 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
            <Button
              size="sm"
              onClick={() => {
                setIsAutoScrollEnabled(true)
                logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="bg-accent text-white hover:bg-accent-hover shadow-lg rounded-full px-4 h-8 animate-bounce-subtle"
            >
              <ArrowDown className="w-3.5 h-3.5 mr-2" />
              {newLogsCount} New Log{newLogsCount !== 1 ? 's' : ''} Below
            </Button>
          </div>
        )}

        {logs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <FileJson className="w-12 h-12 text-text-disabled opacity-25" />
            <div>
              <p className="text-sm font-medium text-text-primary mb-1">No Logs Available</p>
              <p className="text-xs text-text-disabled">System events will stream here automatically.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Table Header with Resizers */}
            <div className="bg-[#111111] border-b border-[#222] flex-shrink-0 select-none">
              <div className="flex items-stretch h-8 px-4 text-[10px] font-bold text-[#666] uppercase tracking-widest relative">
                <div className="flex items-center flex-shrink-0 relative group" style={{ width: timeCol.width }}>
                  <span className="truncate pr-4">Timestamp</span>
                  <Resizer onMouseDown={timeCol.handleMouseDown} />
                </div>
                
                <div className="flex items-center flex-shrink-0 relative group" style={{ width: levelCol.width }}>
                  <span className="truncate pr-4">Level</span>
                  <Resizer onMouseDown={levelCol.handleMouseDown} />
                </div>
                
                <div className="flex items-center flex-shrink-0 relative group" style={{ width: eventCol.width }}>
                  <span className="truncate pr-4">Event Type</span>
                  <Resizer onMouseDown={eventCol.handleMouseDown} />
                </div>
                
                <div className="flex-1 flex items-center min-w-0 pl-2">
                  <span className="truncate">Message & Details</span>
                </div>
              </div>
            </div>

            {/* Scrollable Rows */}
            <div 
              className="flex-1 overflow-y-auto bg-black scrollbar-thin selection:bg-accent/30"
              onScroll={handleScroll}
              ref={listContainerRef}
            >
              {filteredLogs.length === 0 ? (
                <div className="p-12 text-center text-xs text-text-disabled">
                  No logs match the current search or filters.
                </div>
              ) : (
                filteredLogs.map((log) => {
                  const isExpanded = expandedLogs.has(log.id)
                  const hasPayload = log.payload && Object.keys(log.payload).length > 0

                  return (
                    <div 
                      key={log.id} 
                      onClick={() => hasPayload && toggleExpand(log.id)}
                      className={cn(
                        "flex items-start px-4 hover:bg-[#1a1a1a] transition-colors font-mono cursor-pointer group",
                        isCompact ? "py-0.5 text-[10px]" : "py-1 text-xs",
                        isExpanded ? "bg-[#111]" : ""
                      )}
                    >
                      {/* Timestamp */}
                      <div className="flex-shrink-0 text-[#6b7280] pt-0.5 truncate pr-4 group-hover:text-[#9ca3af] transition-colors" style={{ width: timeCol.width }} title={new Date(typeof log.timestamp === 'number' ? log.timestamp : Number(log.timestamp)).toISOString()}>
                        {new Date(typeof log.timestamp === 'number' ? log.timestamp : Number(log.timestamp)).toISOString().replace('T', ' ').substring(0, 19)}
                      </div>

                      {/* Level */}
                      <div className="flex-shrink-0 pt-0.5 pr-4" style={{ width: levelCol.width }}>
                        <span className={cn(
                          "font-bold uppercase tracking-wider",
                          isCompact ? "text-[8px]" : "text-[10px]",
                          log.level === 'ERROR' || log.level === 'CRITICAL' ? 'text-[#ef4444]' :
                          log.level === 'WARN' ? 'text-[#eab308]' :
                          'text-[#3b82f6]'
                        )}>
                          [{log.level}]
                        </span>
                      </div>

                      {/* Event Type */}
                      <div className="flex-shrink-0 text-[#14b8a6] truncate pt-0.5 pr-4" style={{ width: eventCol.width }} title={log.event_type}>
                        {log.event_type}
                      </div>

                      {/* Message / Details */}
                      <div className="flex-1 min-w-0 font-mono flex flex-col justify-start">
                        <div className="flex items-start gap-1.5">
                          {hasPayload && (
                            <span className="text-[#6b7280] pt-0.5">
                              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </span>
                          )}
                          <div className={cn(
                            "text-[#d4d4d4]",
                            !isExpanded && "truncate"
                          )}>
                            {log.message}
                          </div>
                        </div>

                        {/* Expanded Payload */}
                        {isExpanded && hasPayload && (
                          <div className={cn(
                            "mt-2 text-text-secondary bg-[#0a0a0a] border border-border-subtle/40 rounded overflow-x-auto scrollbar-thin font-mono shadow-inner",
                            isCompact ? "p-1.5 text-[9px]" : "p-3 text-[11px]"
                          )}>
                            <pre>{JSON.stringify(log.payload, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
              {/* Invisible element at the bottom to scroll to */}
              <div ref={logsEndRef} className="h-px w-full" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
