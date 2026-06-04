import { useEffect, useRef } from 'react'
import { Terminal as TerminalIcon, XCircle } from 'lucide-react'
import { useWcarckStore } from '@/store/useWcarckStore'

export function Terminal() {
  const logs = useWcarckStore((state) => state.logs)
  const clearLogs = useWcarckStore((state) => state.clearLogs)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Auto-scroll
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden shadow-xl flex flex-col h-64 mt-6 font-mono text-xs">
      <div className="bg-neutral-900 border-b border-neutral-800 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center text-neutral-400">
          <TerminalIcon className="w-4 h-4 mr-2" />
          <span>Terminal Output</span>
        </div>
        <div className="flex space-x-2">
          <button onClick={clearLogs} className="text-neutral-500 hover:text-neutral-300 transition-colors">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="p-4 overflow-y-auto flex-1 space-y-1 text-neutral-300 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
        {logs.length === 0 ? (
          <div className="text-neutral-600 italic">Waiting for process output...</div>
        ) : (
          logs.map((log, i) => {
            const dateStr = new Date(log.timestamp).toISOString()
            return (
              <div key={i} className="break-all">
                <span className="text-neutral-500">[{dateStr}]</span>{' '}
                <span className={log.level === 'ERROR' || log.level === 'CRITICAL' ? 'text-red-400' : log.level === 'DEBUG' ? 'text-neutral-400' : 'text-neutral-200'}>
                  [{log.level}] {log.message}
                </span>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
