import * as React from 'react'
import { Eye, EyeOff, CheckCircle2, XCircle, Copy, KeyRound, Filter } from 'lucide-react'
import { useWcarckStore, Credential } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function PasswordCell({ credential }: { credential: Credential }) {
  const [show, setShow] = React.useState(false)

  React.useEffect(() => {
    if (show) {
      const timer = setTimeout(() => setShow(false), 10000)
      return () => clearTimeout(timer)
    }
  }, [show])

  const copyToClipboard = () => {
    navigator.clipboard.writeText(credential.plainText || '')
    toast.success("Password copied")
  }

  return (
    <div className="flex items-center space-x-2 group/pwd">
      <span className="font-mono text-xs text-text-primary">
        {show ? credential.plainText : '••••••••••••'}
      </span>
      <Button 
        variant="ghost"
        size="icon"
        onClick={() => setShow(!show)}
        className="h-6 w-6 text-text-secondary hover:text-text-primary"
      >
        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </Button>
      <Button 
        variant="ghost"
        size="icon"
        onClick={copyToClipboard}
        className="h-6 w-6 text-text-secondary hover:text-text-primary opacity-0 group-hover/pwd:opacity-100 transition-opacity"
        title="Copy password"
      >
        <Copy className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
}

export function Credentials() {
  const { credentials } = useWcarckStore()
  const [filterValid, setFilterValid] = React.useState(true)
  const [filterInvalid, setFilterInvalid] = React.useState(true)

  const validCount = credentials.filter(c => c.valid).length
  const invalidCount = credentials.length - validCount

  const filteredCreds = credentials.filter(c => {
    if (!filterValid && c.valid) return false
    if (!filterInvalid && !c.valid) return false
    return true
  })

  return (
    <div className="flex flex-col h-full animate-fade-in gap-3">
      {/* ── HEADER + STATS ROW ────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-text-primary tracking-tight">Intercepted Credentials</h2>
          {credentials.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-text-disabled bg-bg-elevated border border-border-subtle px-2 py-1 rounded">
                {credentials.length} total
              </span>
              {validCount > 0 && (
                <span className="text-xs font-mono text-status-success bg-status-success/10 border border-status-success/20 px-2 py-1 rounded">
                  {validCount} valid
                </span>
              )}
              {invalidCount > 0 && (
                <span className="text-xs font-mono text-status-error bg-status-error/10 border border-status-error/20 px-2 py-1 rounded">
                  {invalidCount} invalid
                </span>
              )}
            </div>
          )}
        </div>

        {credentials.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="bg-bg-active border-border-default text-text-primary h-8">
                <Filter className="w-3.5 h-3.5 mr-2" />
                Filter Status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48 bg-bg-elevated border-border-subtle text-text-primary" align="end">
              <DropdownMenuCheckboxItem
                checked={filterValid}
                onCheckedChange={setFilterValid}
                className="hover:bg-bg-hover focus:bg-bg-hover cursor-pointer"
              >
                Valid Credentials
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={filterInvalid}
                onCheckedChange={setFilterInvalid}
                className="hover:bg-bg-hover focus:bg-bg-hover cursor-pointer"
              >
                Invalid / Partial
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ── CONTENT AREA ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden flex flex-col">
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
            <div className="bg-bg-surface border-b border-border-subtle flex-shrink-0">
              <div className="flex items-center h-9 px-4">
                {['Network / User', 'Password', 'Status', 'Client MAC / Vendor', 'Date Captured'].map((col, i) => (
                  <div
                    key={col}
                    className={cn(
                      'text-[10px] font-semibold text-text-disabled uppercase tracking-widest',
                      i === 0 ? 'flex-1' :
                      i === 1 ? 'w-64 flex-shrink-0' :
                      i === 2 ? 'w-28 flex-shrink-0' :
                      i === 3 ? 'w-60 flex-shrink-0' :
                      'w-48 flex-shrink-0 text-right'
                    )}
                  >
                    {col}
                  </div>
                ))}
              </div>
            </div>

            {/* Scrollable rows */}
            <div className="flex-1 overflow-y-auto divide-y divide-border-subtle/60">
              {filteredCreds.length === 0 ? (
                <div className="p-8 text-center text-xs text-text-disabled">
                  No credentials match the current filters.
                </div>
              ) : (
                filteredCreds.map((cred) => (
                  <div key={cred.id} className="flex items-center h-14 px-4 hover:bg-bg-hover transition-colors">
                    {/* Network / User */}
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="font-medium text-text-primary text-sm truncate">
                        {cred.ssid || cred.username}
                      </div>
                      <div className="font-mono text-[10px] text-text-disabled truncate">
                        {cred.bssid}
                      </div>
                    </div>

                    {/* Password */}
                    <div className="w-64 flex-shrink-0">
                      <PasswordCell credential={cred} />
                    </div>

                    {/* Status */}
                    <div className="w-28 flex-shrink-0">
                      {cred.valid ? (
                        <div className="flex items-center text-status-success bg-status-success/10 px-2 py-0.5 rounded w-fit border border-status-success/20">
                          <CheckCircle2 className="w-3 h-3 mr-1.5" />
                          <span className="text-[10px] font-bold uppercase">Valid</span>
                        </div>
                      ) : (
                        <div className="flex items-center text-status-error bg-status-error/10 px-2 py-0.5 rounded w-fit border border-status-error/20">
                          <XCircle className="w-3 h-3 mr-1.5" />
                          <span className="text-[10px] font-bold uppercase">Invalid</span>
                        </div>
                      )}
                    </div>

                    {/* Client MAC / Vendor */}
                    <div className="w-60 flex-shrink-0 pr-4">
                      <div className="font-mono text-xs text-text-primary">{cred.clientMac}</div>
                      <div className="text-[10px] text-text-disabled truncate">{cred.vendor || 'Unknown Vendor'}</div>
                    </div>

                    {/* Date Captured */}
                    <div className="w-48 flex-shrink-0 font-mono text-xs text-text-disabled text-right">
                      {new Date(cred.timestamp).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
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

