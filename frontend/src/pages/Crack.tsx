import * as React from 'react'
import { Hammer, Upload, Database, Play, Square, ArrowLeft } from 'lucide-react'
import { useWcarckStore } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function Crack() {
  const { captures, activeJobs, startJob, stopJob, wordlists, fetchWordlists } = useWcarckStore()
  
  React.useEffect(() => {
    fetchWordlists()
  }, [fetchWordlists])
  const location = useLocation()
  const navigate = useNavigate()
  
  // Read captureId from router state if navigating from Captures page
  const initialCaptureId = location.state?.captureId || ''

  const [selectedCaptureId, setSelectedCaptureId] = React.useState<string>(initialCaptureId)
  const [wordlist, setWordlist] = React.useState('')
  // Auto-select first wordlist once loaded
  React.useEffect(() => {
    if (wordlists.length > 0 && !wordlist) {
      setWordlist(wordlists[0].path)
    }
  }, [wordlists, wordlist])
  
  const crackJob = activeJobs.find(j => j.type === 'crack')

  const handleStart = () => {
    if (!selectedCaptureId) return
    startJob('crack', { captureId: selectedCaptureId, wordlist })
  }

  return (
    <div className="flex flex-col h-full animate-fade-in gap-3">
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-8 w-8 text-text-secondary hover:text-text-primary hover:bg-bg-hover flex-shrink-0"
            title="Go Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-lg font-bold text-text-primary tracking-tight">Hash Cracking</h2>
            <p className="text-xs text-text-disabled mt-0.5">Recover passwords from captured handshakes using dictionary attacks.</p>
          </div>
        </div>
      </div>

      {/* ── CONTENT AREA (flex md:flex-row) ────────────────────────── */}
      <div className="flex-grow flex flex-col md:flex-row gap-4 min-h-0">
        
        {/* Left Panel: Configuration */}
        <div className="flex-1 bg-bg-elevated border border-border-subtle rounded-lg p-5 flex flex-col justify-between overflow-y-auto scrollbar-thin">
          <div className="space-y-5">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Hammer className="w-4 h-4 text-text-secondary" />
              Attack Configuration
            </h3>
            
            <div className="space-y-2">
              <Label className="text-xs text-text-secondary">Select Capture File</Label>
              <select 
                className="w-full bg-bg-active border border-border-default rounded-md px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                value={selectedCaptureId}
                onChange={e => setSelectedCaptureId(e.target.value)}
                disabled={!!crackJob}
              >
                <option value="" disabled>Select a captured handshake...</option>
                {captures.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.ssid} ({c.bssid}) - {c.type}
                  </option>
                ))}
              </select>
              {captures.length === 0 && (
                <p className="text-[10px] text-status-warning mt-1">No captures available. Capture a handshake first.</p>
              )}
              {wordlists.length === 0 && wordlist !== 'custom' && (
                <p className="text-[10px] text-status-warning mt-1">No wordlists found. Place .txt files in the wordlists/ directory or upload below.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-text-secondary">Wordlist</Label>
              <select 
                className="w-full bg-bg-active border border-border-default rounded-md px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                value={wordlist}
                onChange={e => setWordlist(e.target.value)}
                disabled={!!crackJob}
              >
                {wordlists.map(w => (
                  <option key={w.name} value={w.path}>{w.name} ({(w.size / 1024 / 1024).toFixed(2)} MB)</option>
                ))}
                <option value="custom">Upload Custom Wordlist...</option>
              </select>
            </div>

            {wordlist === 'custom' && (
              <div className="border border-dashed border-border-default rounded-md p-6 text-center bg-bg-surface">
                <Upload className="w-6 h-6 mx-auto text-text-disabled mb-2" />
                <p className="text-xs text-text-primary mb-1">Upload a wordlist (.txt or .gz)</p>
                <input
                  type="file"
                  accept=".txt,.gz"
                  id="wordlist-upload"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const fd = new FormData()
                    fd.append('file', file)
                    try {
                      const res = await fetch('http://127.0.0.1:8000/api/wordlists/upload', { method: 'POST', body: fd })
                      if (res.ok) {
                        const data = await res.json()
                        fetchWordlists()
                        setWordlist(data.wordlist.path)
                      }
                    } catch {}
                  }}
                  disabled={!!crackJob}
                />
                <Button
                  variant="outline" size="sm" className="mt-3 text-xs h-7"
                  disabled={!!crackJob}
                  onClick={() => document.getElementById('wordlist-upload')?.click()}
                >
                  Browse Files
                </Button>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-border-subtle/50 mt-6 flex-shrink-0 font-sans">
            {!crackJob ? (
              <Button 
                onClick={handleStart} 
                disabled={!selectedCaptureId}
                className="w-full bg-accent text-white hover:bg-accent-hover text-xs h-9"
              >
                <Play className="w-3.5 h-3.5 mr-2" fill="currentColor" /> Start Cracking
              </Button>
            ) : (
              <Button 
                onClick={() => stopJob(crackJob.id)}
                className="w-full bg-status-error text-white hover:bg-status-error/90 text-xs h-9"
              >
                <Square className="w-3.5 h-3.5 mr-2" fill="currentColor" /> Stop Attack
              </Button>
            )}
          </div>
        </div>

        {/* Right Panel: Hashcat Engine / Progress */}
        <div className="flex-1 bg-bg-elevated border border-border-subtle rounded-lg p-5 flex flex-col justify-between">
          <div className="flex-shrink-0">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-4">
              <Database className="w-4 h-4 text-text-secondary" />
              Hashcat Engine
            </h3>
          </div>

          <div className="flex-grow flex flex-col justify-center items-center py-6">
            <div className="text-center mb-6">
              <div className={cn(
                "text-5xl font-extrabold font-mono mb-2 tracking-tight",
                crackJob ? "text-accent" : "text-text-disabled"
              )}>
                {crackJob ? `${crackJob.progress}%` : "0%"}
              </div>
              <div className="text-[10px] text-text-disabled uppercase tracking-widest">Progress</div>
            </div>

            <div className="w-full max-w-sm bg-bg-active rounded-full h-2.5 overflow-hidden mb-8 border border-border-subtle/40">
              <div 
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  crackJob ? "bg-accent" : "bg-text-disabled/20"
                )}
                style={{ width: `${crackJob ? crackJob.progress : 0}%` }} 
              />
            </div>

            <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
              <div className="bg-bg-surface p-3 rounded border border-border-subtle">
                <div className="text-[9px] text-text-disabled uppercase tracking-wider mb-1">Speed</div>
                <div className="font-mono text-xs font-semibold text-text-primary">{crackJob ? (crackJob.speed || "Starting...") : "0 H/s"}</div>
              </div>
              <div className="bg-bg-surface p-3 rounded border border-border-subtle">
                <div className="text-[9px] text-text-disabled uppercase tracking-wider mb-1">Est. Time Remaining</div>
                <div className="font-mono text-xs font-semibold text-text-primary">{crackJob ? (crackJob.eta || "Calculating...") : "--:--"}</div>
              </div>
              <div className="col-span-2 bg-bg-surface p-3 rounded border border-border-subtle">
                <div className="text-[9px] text-text-disabled uppercase tracking-wider mb-1">Engine Status</div>
                <div className="font-mono text-xs font-semibold text-text-primary truncate">
                  {crackJob ? (crackJob.status_message || "Running dictionary attack (Wordlist mode)") : "Idle"}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-border-subtle/50 text-[10px] text-text-disabled text-center flex-shrink-0">
            {crackJob ? "Dictionary attack using Hashcat" : "System ready for password recovery"}
          </div>
        </div>
      </div>
    </div>
  )
}
