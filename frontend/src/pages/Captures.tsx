import * as React from 'react'
import { Download, RefreshCw, Database, Check, Hammer } from 'lucide-react'
import { useWcarckStore } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

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
  const { captures, startJob } = useWcarckStore()
  const navigate = useNavigate()

  const validCount = captures.filter(c => c.status === 'Valid').length
  const partialCount = captures.filter(c => c.status === 'Partial').length

  return (
    <div className="flex flex-col h-full animate-fade-in gap-3">

      {/* ── HEADER + STATS ROW ────────────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <h2 className="text-lg font-bold text-text-primary tracking-tight">Packet Captures</h2>
        {captures.length > 0 && (
          <div className="flex items-center gap-2 flex-1">
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

      {/* ── TABLE (fills remaining height) ───────────────────────────── */}
      <div className="flex-1 min-h-0 bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden flex flex-col">
        {captures.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <Database className="w-12 h-12 text-text-disabled opacity-25" />
            <div>
              <p className="text-sm font-medium text-text-primary mb-1">No Captures</p>
              <p className="text-xs text-text-disabled">Run a deauth attack on a target to capture a handshake.</p>
            </div>
            <Button
              size="sm"
              onClick={() => navigate('/recon')}
              className="bg-bg-active border border-border-subtle text-text-primary hover:bg-bg-hover text-xs mt-1"
            >
              Go to Recon
            </Button>
          </div>
        ) : (
          <>
            {/* Table head */}
            <div className="bg-bg-surface border-b border-border-subtle flex-shrink-0">
              <div className="flex items-center h-9 px-4">
                {['Type', 'Target', 'Status', 'EAPOL', 'Captured', 'Actions'].map((col, i) => (
                  <div
                    key={col}
                    className={cn(
                      'text-[10px] font-semibold text-text-disabled uppercase tracking-widest',
                      i === 0 ? 'w-16 flex-shrink-0' :
                      i === 1 ? 'flex-1' :
                      i === 2 ? 'w-20 flex-shrink-0' :
                      i === 3 ? 'w-28 flex-shrink-0' :
                      i === 4 ? 'w-36 flex-shrink-0' :
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
              {captures.map(cap => (
                <div key={cap.id} className="flex items-center h-14 px-4 hover:bg-bg-hover transition-colors gap-0">
                  {/* Type badge */}
                  <div className="w-16 flex-shrink-0">
                    <span className={cn(
                      'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border',
                      cap.type === 'eapol'
                        ? 'bg-status-info/15 text-status-info border-status-info/25'
                        : 'bg-status-warning/15 text-status-warning border-status-warning/25'
                    )}>
                      {cap.type}
                    </span>
                  </div>

                  {/* Target */}
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="font-medium text-text-primary text-sm truncate">{cap.ssid}</div>
                    <div className="font-mono text-[10px] text-text-disabled">{cap.bssid}</div>
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
                      <span className="text-text-disabled text-xs">-</span>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="w-36 flex-shrink-0 font-mono text-xs text-text-disabled">
                    {new Date(cap.timestamp).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>

                  {/* Actions */}
                  <div className="w-48 flex-shrink-0 flex items-center justify-end gap-2">
                    {cap.status === 'Partial' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startJob('deauth', { bssid: cap.bssid })}
                        className="h-7 text-[11px] bg-bg-active border-border-subtle hover:bg-bg-hover"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />Re-capture
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      title="Download .22000 file"
                      className="h-7 w-7 p-0 bg-bg-active border-border-subtle hover:bg-bg-hover"
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => navigate('/crack', { state: { captureId: cap.id } })}
                      className="h-7 text-[11px] bg-accent text-white hover:bg-accent-hover"
                    >
                      <Hammer className="w-3 h-3 mr-1" />Crack
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
