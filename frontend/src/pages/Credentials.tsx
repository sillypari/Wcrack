import * as React from 'react'
import { Eye, EyeOff, CheckCircle2, XCircle, Copy, KeyRound, Filter, Download, Search, ArrowUpDown, ArrowUp, ArrowDown, ClipboardList } from 'lucide-react'
import { useWcarckStore, Credential } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn, copyToClipboard } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AppTooltip } from '@/components/ui/app-tooltip'

function PasswordCell({ credential, globalShow }: { credential: Credential, globalShow: boolean }) {
  const [localShow, setLocalShow] = React.useState(false)

  React.useEffect(() => {
    if (localShow && !globalShow) {
      const timer = setTimeout(() => setLocalShow(false), 10000)
      return () => clearTimeout(timer)
    }
  }, [localShow, globalShow])

  const show = globalShow || localShow

  const handleCopy = async () => {
    const success = await copyToClipboard(credential.plainText || '')
    if (success) toast.success("Password copied")
    else toast.error("Failed to copy password")
  }

  return (
    <div className="flex items-center space-x-2 group/pwd">
      <span className="font-mono text-xs text-text-primary">
        {show ? credential.plainText : '••••••••••••'}
      </span>
      <Button 
        variant="ghost"
        size="icon"
        onClick={handleCopy}
        className="h-7 w-7 text-text-secondary hover:text-text-primary bg-bg-surface border border-border-subtle"
        aria-label="Copy password"
      >
        <Copy className="w-3.5 h-3.5" />
      </Button>
      {!globalShow && (
        <Button 
          variant="ghost"
          size="icon"
          onClick={() => setLocalShow(!localShow)}
          className="h-7 w-7 text-text-secondary hover:text-text-primary bg-bg-surface border border-border-subtle"
        >
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </Button>
      )}
    </div>
  )
}

export function Credentials() {
  const { credentials, fetchInitialState } = useWcarckStore()
  
  React.useEffect(() => {
    fetchInitialState()
  }, [fetchInitialState])
  
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [globalShowPwd, setGlobalShowPwd] = React.useState(false)
  const [dateRangeFilter, setDateRangeFilter] = React.useState('all')
  
  // Sort State
  const [sortCol, setSortCol] = React.useState<'time'|'ssid'|'status'>('time')
  const [sortDir, setSortDir] = React.useState<'asc'|'desc'>('desc')

  // Stats
  const validCount = credentials.filter(c => c.valid).length
  const invalidCount = credentials.length - validCount

  const filteredCreds = React.useMemo(() => {
    let filtered = credentials.filter(c => {
      if (statusFilter === 'valid' && !c.valid) return false
      if (statusFilter === 'invalid' && c.valid) return false
      
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
          !c.username?.toLowerCase().includes(q) &&
          !c.bssid?.toLowerCase().includes(q) &&
          !c.plainText?.toLowerCase().includes(q) &&
          !c.clientMac?.toLowerCase().includes(q)
        ) return false
      }
      return true
    })

    // Sort
    filtered.sort((a, b) => {
      let cmp = 0
      if (sortCol === 'time') cmp = a.timestamp - b.timestamp
      if (sortCol === 'ssid') cmp = (a.ssid || a.username || '').localeCompare(b.ssid || b.username || '')
      if (sortCol === 'status') cmp = (a.valid === b.valid) ? 0 : a.valid ? 1 : -1
      return sortDir === 'asc' ? cmp : -cmp
    })
    
    return filtered
  }, [credentials, statusFilter, searchQuery, dateRangeFilter, sortCol, sortDir])

  const handleSort = (col: 'time'|'ssid'|'status') => {
    if (sortCol === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  const exportCSV = () => {
    if (!filteredCreds.length) return toast.warning("No data to export")
    const header = "SSID,Username,BSSID,Password,ClientMAC,Vendor,Type,Valid,Timestamp\n"
    const rows = filteredCreds.map(c => 
      `"${c.ssid||''}","${c.username||''}","${c.bssid||''}","${c.plainText||''}","${c.clientMac||''}","${c.vendor||''}","${c.type}","${c.valid}","${new Date(c.timestamp).toISOString()}"`
    ).join("\n")
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wcarck-credentials-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Exported to CSV")
  }

  const copyAllVisible = async () => {
    if (!filteredCreds.length) return toast.warning("No data to copy")
    const tsv = filteredCreds.map(c => `${c.ssid||c.username||'-'}\t${c.plainText||'-'}`).join("\n")
    const success = await copyToClipboard(tsv)
    if (success) toast.success(`Copied ${filteredCreds.length} passwords to clipboard`)
    else toast.error("Failed to copy passwords")
  }

  const SortIcon = ({ col }: { col: 'time'|'ssid'|'status' }) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3.5 h-3.5 ml-1.5 opacity-30 group-hover:opacity-100 transition-opacity" />
    return sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 ml-1.5 text-accent" /> : <ArrowDown className="w-3.5 h-3.5 ml-1.5 text-accent" />
  }

  return (
    <div className="flex flex-col h-full animate-fade-in gap-3">
      {/* ── HEADER + TOOLBAR ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-text-primary tracking-tight">Intercepted Credentials</h2>
            {credentials.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-text-disabled bg-bg-elevated border border-border-subtle px-2 py-1 rounded shadow-sm">
                  {credentials.length} total
                </span>
                {validCount > 0 && (
                  <span className="text-xs font-mono text-status-success bg-status-success/10 border border-status-success/20 px-2 py-1 rounded shadow-sm">
                    {validCount} valid
                  </span>
                )}
                {invalidCount > 0 && (
                  <span className="text-xs font-mono text-status-error bg-status-error/10 border border-status-error/20 px-2 py-1 rounded shadow-sm">
                    {invalidCount} invalid
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <AppTooltip content={globalShowPwd ? "Hide all passwords" : "Show all passwords"} side="bottom">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setGlobalShowPwd(!globalShowPwd)} 
                className={cn("bg-bg-active border-border-default h-8 w-8", globalShowPwd ? "text-accent border-accent/50 bg-accent/10" : "text-text-secondary hover:text-text-primary")}
                aria-label={globalShowPwd ? "Hide all passwords" : "Show all passwords"}
              >
                {globalShowPwd ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </Button>
            </AppTooltip>

            <AppTooltip content="Copy all visible passwords (TSV format)" side="bottom">
              <Button variant="outline" size="sm" onClick={copyAllVisible} className="bg-bg-active border-border-default text-text-primary h-8" aria-label="Copy all visible passwords">
                <ClipboardList className="w-3.5 h-3.5 mr-2 text-text-secondary" />
                Copy Visible
              </Button>
            </AppTooltip>

            <Button variant="outline" size="sm" onClick={exportCSV} className="bg-bg-active border-border-default text-text-primary h-8">
              <Download className="w-3.5 h-3.5 mr-2 text-text-secondary" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* ── FILTERS BAR ────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 bg-bg-elevated border border-border-subtle rounded-lg p-2 shadow-sm">
          <div className="flex items-center gap-1.5 h-8 bg-bg-surface px-2 rounded-md border border-border-subtle flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-text-disabled" />
            <input 
              type="text" 
              placeholder="Search SSID, BSSID, username, password..." 
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

      {/* ── CONTENT AREA ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden flex flex-col shadow-sm">
        {credentials.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <KeyRound className="w-12 h-12 text-text-disabled opacity-25" />
            <div>
              <p className="text-sm font-medium text-text-primary mb-1">No Credentials</p>
              <p className="text-xs text-text-disabled">Launch an Evil Twin attack or crack a capture to harvest credentials.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Table head */}
            <div className="bg-bg-surface border-b border-border-subtle flex-shrink-0 select-none">
              <div className="flex items-center h-10 px-4">
                <div 
                  className="flex-1 flex items-center cursor-pointer group"
                  onClick={() => handleSort('ssid')}
                >
                  <span className="text-[10px] font-semibold text-text-disabled uppercase tracking-widest">Network / User</span>
                  <SortIcon col="ssid" />
                </div>
                
                <div className="w-64 flex-shrink-0">
                  <span className="text-[10px] font-semibold text-text-disabled uppercase tracking-widest">Password</span>
                </div>
                
                <div 
                  className="w-28 flex-shrink-0 flex items-center cursor-pointer group"
                  onClick={() => handleSort('status')}
                >
                  <span className="text-[10px] font-semibold text-text-disabled uppercase tracking-widest">Status</span>
                  <SortIcon col="status" />
                </div>
                
                <div className="w-60 flex-shrink-0">
                  <span className="text-[10px] font-semibold text-text-disabled uppercase tracking-widest">Client MAC / Vendor</span>
                </div>
                
                <div 
                  className="w-48 flex-shrink-0 flex items-center justify-end cursor-pointer group"
                  onClick={() => handleSort('time')}
                >
                  <span className="text-[10px] font-semibold text-text-disabled uppercase tracking-widest">Date Captured</span>
                  <SortIcon col="time" />
                </div>
              </div>
            </div>

            {/* Scrollable rows */}
            <div className="flex-1 overflow-y-auto divide-y divide-border-subtle/60">
              {filteredCreds.length === 0 ? (
                <div className="p-12 text-center text-xs text-text-disabled">
                  No credentials match the current search or filters.
                </div>
              ) : (
                filteredCreds.map((cred) => (
                  <div key={cred.id} className="flex items-center h-16 px-4 hover:bg-bg-hover transition-colors">
                    {/* Network / User */}
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="font-semibold text-text-primary text-sm truncate">
                        {cred.ssid || cred.username || '-'}
                      </div>
                      <div className="font-mono text-[10px] text-text-disabled truncate mt-0.5">
                        {cred.bssid || 'No BSSID'}
                      </div>
                    </div>

                    {/* Password */}
                    <div className="w-64 flex-shrink-0">
                      <PasswordCell credential={cred} globalShow={globalShowPwd} />
                    </div>

                    {/* Status */}
                    <div className="w-28 flex-shrink-0">
                      {cred.valid ? (
                        <div className="flex items-center text-status-success bg-status-success/10 px-2 py-0.5 rounded w-fit border border-status-success/20">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                          <span className="text-[10px] font-bold uppercase">Valid</span>
                        </div>
                      ) : (
                        <div className="flex items-center text-status-error bg-status-error/10 px-2 py-0.5 rounded w-fit border border-status-error/20">
                          <XCircle className="w-3.5 h-3.5 mr-1.5" />
                          <span className="text-[10px] font-bold uppercase">Invalid</span>
                        </div>
                      )}
                    </div>

                    {/* Client MAC / Vendor */}
                    <div className="w-60 flex-shrink-0 pr-4">
                      <div className="font-mono text-[11px] text-text-primary">{cred.clientMac || 'Unknown MAC'}</div>
                      <div className="text-[10px] text-text-disabled truncate mt-0.5">{cred.vendor || 'Unknown Vendor'}</div>
                    </div>

                    {/* Type + Date Captured */}
                    <div className="w-48 flex-shrink-0 font-mono text-xs text-text-disabled text-right">
                      <div className="text-[9px] uppercase font-bold tracking-wider text-text-secondary mb-1">
                        {cred.type === 'portal' ? 'Captive Portal' : 'WPA PSK'}
                      </div>
                      <div className="text-[11px]">
                        {new Date(cred.timestamp).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
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
