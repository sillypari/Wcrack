import * as React from 'react'
import { Hammer, Upload, Database, Play, Square, ArrowLeft, Check } from 'lucide-react'
import { useWcarckStore } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { ChevronDown } from 'lucide-react'

export function Crack() {
  const { captures, activeJobs, startJob, stopJob, wordlists, fetchWordlists, credentials } = useWcarckStore()
  
  React.useEffect(() => {
    fetchWordlists()
  }, [fetchWordlists])
  const location = useLocation()
  const navigate = useNavigate()
  
  // Read captureId from router state if navigating from Captures page
  const initialCaptureId = location.state?.captureId || ''

  const [selectedCaptureId, setSelectedCaptureId] = React.useState<string>(initialCaptureId)
  const [selectedWordlistPaths, setSelectedWordlistPaths] = React.useState<string[]>([])
  const [selectedRule, setSelectedRule] = React.useState<string>('none')
  
  // Crack Success Modal
  const [isSuccessModalOpen, setIsSuccessModalOpen] = React.useState(false)
  const [crackedPasswordDetail, setCrackedPasswordDetail] = React.useState<any>(null)
  
  // Auto-select first wordlist once loaded
  React.useEffect(() => {
    if (wordlists.length > 0 && selectedWordlistPaths.length === 0) {
      setSelectedWordlistPaths([wordlists[0].path])
    }
  }, [wordlists, selectedWordlistPaths])

  // Monitor store for new credentials to trigger success overlay
  React.useEffect(() => {
    const unsub = useWcarckStore.subscribe(
      state => state.credentials,
      (newCreds, oldCreds) => {
        if (newCreds.length > (oldCreds?.length ?? 0)) {
          const latest = newCreds[0]
          const activeCap = useWcarckStore.getState().captures.find(c => c.id === selectedCaptureId)
          const isCrackingThis = useWcarckStore.getState().activeJobs.some(j => j.type === 'crack' && j.payload?.capture_id === selectedCaptureId)
          if (isCrackingThis && latest.type === 'wpa_psk' && activeCap && (latest.ssid === activeCap.ssid || latest.bssid === activeCap.bssid)) {
            setCrackedPasswordDetail(latest)
            setIsSuccessModalOpen(true)
          }
        }
      }
    )
    return unsub
  }, [selectedCaptureId])
  
  const crackJob = activeJobs.find(j => j.type === 'crack')

  const handleStart = () => {
    if (!selectedCaptureId) return
    const cap = captures.find(c => c.id === selectedCaptureId)
    if (!cap) return
    
    startJob('crack', {
      capture_id: cap.id,
      wordlist_paths: selectedWordlistPaths,
      rule: selectedRule !== 'none' ? selectedRule : undefined,
      bssid: cap.bssid
    })
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
            aria-label="Go Back"
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
              <Select
                value={selectedCaptureId}
                onValueChange={setSelectedCaptureId}
                disabled={!!crackJob}
              >
                <SelectTrigger className="w-full bg-bg-active border border-border-default rounded-md px-3 py-2 text-sm text-text-primary outline-none focus:border-accent">
                  <SelectValue placeholder="Select a captured handshake..." />
                </SelectTrigger>
                <SelectContent>
                  {captures.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.ssid} ({c.bssid}) - {c.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {captures.length === 0 && (
                <p className="text-[10px] text-status-warning mt-1">No captures available. Capture a handshake first.</p>
              )}
              {wordlists.length === 0 && (
                <p className="text-[10px] text-status-warning mt-1">No wordlists found. Place .txt files in the wordlists/ directory or upload below.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-text-secondary">Wordlist Select (Multi-Wordlist Support)</Label>
              <div className="border border-border-default bg-bg-active rounded-md p-3 max-h-40 overflow-y-auto flex flex-col gap-2 scrollbar-thin">
                {wordlists.map(w => {
                  const isChecked = selectedWordlistPaths.includes(w.path)
                  return (
                    <label key={w.name} className="flex items-center gap-2.5 text-xs text-text-primary cursor-pointer select-none hover:bg-bg-hover p-1 rounded transition-colors">
                      <input 
                        type="checkbox"
                        checked={isChecked}
                        disabled={!!crackJob}
                        onChange={() => {
                          if (isChecked) {
                            setSelectedWordlistPaths(selectedWordlistPaths.filter(p => p !== w.path))
                          } else {
                            setSelectedWordlistPaths([...selectedWordlistPaths, w.path])
                          }
                        }}
                        className="rounded border-border-subtle text-accent focus:ring-accent bg-bg-surface h-3.5 w-3.5 cursor-pointer"
                      />
                      <span className="truncate flex-1">{w.name}</span>
                      <span className="text-[10px] text-text-disabled ml-2">{(w.size / 1024 / 1024).toFixed(2)} MB</span>
                    </label>
                  )
                })}
                {wordlists.length === 0 && (
                  <p className="text-[10px] text-text-disabled italic text-center py-2">No wordlists found.</p>
                )}
                <div className="pt-2 mt-1 border-t border-border-subtle/50">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-accent hover:text-accent-hover hover:bg-accent/10 h-7"
                    disabled={!!crackJob}
                    onClick={(e) => {
                      e.preventDefault()
                      document.getElementById('wordlist-upload')?.click()
                    }}
                  >
                    <Upload className="w-3.5 h-3.5 mr-2" /> Upload Custom Wordlist
                  </Button>
                </div>
              </div>
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
                    toast.loading("Uploading wordlist...", { id: 'upload-toast' })
                    const res = await fetch('http://127.0.0.1:8000/api/wordlists/upload', { method: 'POST', body: fd })
                    if (res.ok) {
                      const data = await res.json()
                      await fetchWordlists()
                      setSelectedWordlistPaths(prev => [...prev, data.wordlist.path])
                      toast.success("Wordlist uploaded successfully", { id: 'upload-toast' })
                    } else {
                       toast.error("Failed to upload wordlist", { id: 'upload-toast' })
                    }
                  } catch {
                     toast.error("Upload error", { id: 'upload-toast' })
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-text-secondary">John the Ripper Rules (stdout pipe)</Label>
              <Select
                value={selectedRule}
                onValueChange={setSelectedRule}
                disabled={!!crackJob}
              >
                <SelectTrigger className="w-full bg-bg-active border border-border-default rounded-md px-3 py-2 text-sm text-text-primary outline-none focus:border-accent">
                  <SelectValue placeholder="Select rules..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Standard Dictionary Attack)</SelectItem>
                  <SelectItem value="best64">best64 (Mutate first 64 common modifications)</SelectItem>
                  <SelectItem value="single">single (Single crack mode mutations)</SelectItem>
                  <SelectItem value="wordlist">wordlist (Standard wordlist mutation rules)</SelectItem>
                  <SelectItem value="d3ad0ne">d3ad0ne (Aggressive digit and leet substitutions)</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

        {/* Right Panel: Aircrack-ng Engine / Progress */}
        <div className="flex-1 bg-bg-elevated border border-border-subtle rounded-lg p-5 flex flex-col justify-between">
          <div className="flex-shrink-0">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-4">
              <Database className="w-4 h-4 text-text-secondary" />
              Aircrack-ng Engine
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
            {crackJob ? "Dictionary attack using Aircrack-ng" : "System ready for password recovery"}
          </div>
        </div>
      </div>

      {/* ── CRACK SUCCESS PREMIUM OVERLAY MODAL ───────────────────────────── */}
      {isSuccessModalOpen && crackedPasswordDetail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="crack-success-title">
          <div className="bg-bg-elevated border-2 border-status-success rounded-2xl w-full max-w-md p-6 shadow-glow-success flex flex-col gap-6 text-center animate-scale-in relative overflow-hidden">
            {/* Ambient green gradient background glow */}
            <div className="absolute -top-12 -left-12 w-32 h-32 bg-status-success/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-status-success/25 rounded-full blur-3xl" />
            
            <div className="flex flex-col items-center gap-2 relative">
              <div className="w-16 h-16 rounded-full bg-status-success/15 border border-status-success/30 flex items-center justify-center text-status-success animate-bounce mb-2">
                <Check className="w-8 h-8 stroke-[3px]" />
              </div>
              <h3 id="crack-success-title" className="text-xl font-black text-text-primary tracking-tight uppercase">WPA Password Cracked!</h3>
              <p className="text-xs text-text-disabled">Target Handshake Decrypted Successfully</p>
            </div>

            <div className="bg-bg-surface border border-border-subtle rounded-xl p-4 flex flex-col gap-3 relative font-sans text-left">
              <div className="flex justify-between items-center text-xs">
                <span className="text-text-disabled font-semibold">SSID:</span>
                <span className="text-text-primary font-bold">{crackedPasswordDetail.ssid}</span>
              </div>
              <div className="flex justify-between items-center text-xs border-t border-border-subtle/40 pt-2.5">
                <span className="text-text-disabled font-semibold">BSSID:</span>
                <span className="text-text-primary font-mono">{crackedPasswordDetail.bssid}</span>
              </div>
              <div className="flex flex-col gap-1 border-t border-border-subtle/40 pt-3 text-center mt-1">
                <span className="text-[10px] text-status-success uppercase font-black tracking-widest">Plaintext Password</span>
                <span className="text-2xl font-mono font-black text-status-success bg-status-success/10 border border-status-success/20 py-2.5 rounded-lg select-all">
                  {crackedPasswordDetail.plainText}
                </span>
              </div>
            </div>

            <div className="flex gap-2.5 relative">
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(crackedPasswordDetail.plainText)
                  toast.success("Password copied to clipboard")
                }}
                className="flex-1 bg-status-success hover:bg-status-success/90 text-white font-bold h-10 text-xs"
              >
                Copy Password
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsSuccessModalOpen(false)
                  navigate('/credentials')
                }}
                className="flex-1 bg-bg-active border-border-default text-text-primary hover:bg-bg-hover font-bold h-10 text-xs"
              >
                View Credentials
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
