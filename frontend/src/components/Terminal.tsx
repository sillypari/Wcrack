import { useEffect, useRef, useState } from 'react'
import { Terminal as TerminalIcon, XCircle } from 'lucide-react'

// Dummy store connection for demonstration.
// In reality, this would listen to `useWcarckStore` for `process.stdout` events.
export function Terminal() {
  const [logs, setLogs] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Auto-scroll
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Mock incoming logs for UI
  useEffect(() => {
    const interval = setInterval(() => {
      setLogs(prev => {
        if (prev.length > 50) return prev.slice(1)
        return [...prev, `[${new Date().toISOString()}] [INFO] subsystem.event received.`]
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden shadow-xl flex flex-col h-64 mt-6 font-mono text-xs">
      <div className="bg-neutral-900 border-b border-neutral-800 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center text-neutral-400">
          <TerminalIcon className="w-4 h-4 mr-2" />
          <span>Terminal Output</span>
        </div>
        <div className="flex space-x-2">
          <button onClick={() => setLogs([])} className="text-neutral-500 hover:text-neutral-300 transition-colors">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="p-4 overflow-y-auto flex-1 space-y-1 text-neutral-300 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
        {logs.length === 0 ? (
          <div className="text-neutral-600 italic">Waiting for process output...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="break-all">{log}</div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
