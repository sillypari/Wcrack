import * as React from 'react'
import { Wifi, Router, Coffee, Cloud, Building2, Upload, Target, FileCode2, Play, Square, Check, AlertTriangle, Settings2, Users, Network as NetworkIcon, Server, WifiOff } from 'lucide-react'
import { useWcarckStore } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmModal } from '@/components/ui/confirm-modal'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const TEMPLATES = [
  { id: 'Login_v4',  name: 'Router Firmware Update', icon: Router,    desc: 'Generic ISP login portal' },
  { id: 'DarkLogin', name: 'Dark Login Portal',      icon: Coffee,    desc: 'Sleek dark theme captive portal' },
  { id: 'loginPage', name: 'Standard Portal',        icon: Building2, desc: 'Generic login portal' },
  { id: 'evilqr3',   name: 'QR Code Portal',         icon: Cloud,     desc: 'Phishing portal using QR codes' },
  { id: 'custom',    name: 'Custom Template',        icon: Upload,    desc: 'Your own HTML template' },
]

// Step indicator at the top of the wizard card
function StepIndicator({ current }: { current: number }) {
  const steps = [
    { num: 1, label: 'Target',   icon: Target },
    { num: 2, label: 'Config',   icon: Settings2 },
    { num: 3, label: 'Launch',   icon: Play },
  ]
  return (
    <div className="flex items-center justify-center py-6 border-b border-border-subtle flex-shrink-0 relative">
      <div className="absolute left-[50%] w-[300px] -translate-x-1/2 top-[42px] h-px z-0">
        <div className="w-full h-full bg-border-subtle" />
        <div
          className="absolute left-0 top-0 h-full bg-accent transition-all duration-500 ease-out"
          style={{ width: `${(current - 1) * 50}%` }}
        />
      </div>
      <div className="flex justify-between w-[380px] z-10">
        {steps.map(s => {
          const isPast = current > s.num
          const isCurrent = current === s.num
          return (
            <div key={s.num} className="flex flex-col items-center gap-2">
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 border-2',
                isPast ? 'bg-accent border-accent text-white' :
                isCurrent ? 'bg-bg-elevated border-accent text-accent shadow-glow-accent' :
                'bg-bg-surface border-border-default text-text-disabled'
              )}>
                {isPast ? <Check className="w-4 h-4 stroke-[3px]" /> : <s.icon className="w-4 h-4" />}
              </div>
              <span className={cn(
                'text-[10px] font-bold uppercase tracking-widest',
                isCurrent ? 'text-text-primary' : 'text-text-disabled'
              )}>
                {s.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function EvilTwin() {
  const { uiState, networks, activeJobs, startJob, stopJob, credentials, adapters } = useWcarckStore()
  const navigate = useNavigate()

  const [step, setStep] = React.useState(1)
  const [targetBssid, setTargetBssid] = React.useState(uiState.focusedNetworkBssid || '')
  const [spoofSsid, setSpoofSsid] = React.useState('')
  const [channel, setChannel] = React.useState(6)
  
  // Advanced Config State
  const [selectedTemplate, setSelectedTemplate] = React.useState('Login_v4')
  const [encryption, setEncryption] = React.useState('open')
  const [karmaMode, setKarmaMode] = React.useState(false)
  const [dnsSpoof, setDnsSpoof] = React.useState(true)
  const [mitmEnabled, setMitmEnabled] = React.useState(false)
  const [deauthMode, setDeauthMode] = React.useState('never') // never, launch, continuous
  const [deauthInterval, setDeauthInterval] = React.useState(15) // seconds
  const [customFile, setCustomFile] = React.useState<File | null>(null)
  
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const activeTwinJob = activeJobs.find(j => j.type === 'eviltwin')
  const hasMonAdapter = adapters.some(a => a.mode === 'monitor')
  const hasApAdapter = adapters.some(a => a.mode === 'managed' && a.status !== 'down')

  // Format MAC Address
  const formatMac = (val: string) => {
    return val.replace(/[^0-9a-fA-F]/g, '').slice(0, 12).replace(/(.{2})(?=.)/g, '$1:').toUpperCase()
  }

  // Uptime ticker
  const [uptimeSeconds, setUptimeSeconds] = React.useState(0)
  React.useEffect(() => {
    if (!activeTwinJob) return
    const interval = setInterval(() => {
      setUptimeSeconds(Math.floor((Date.now() - activeTwinJob.startedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [activeTwinJob])

  React.useEffect(() => {
    if (targetBssid && targetBssid.length === 17) {
      const net = networks.get(targetBssid)
      if (net) {
        if (!spoofSsid) setSpoofSsid(net.ssid)
        setChannel(net.channel || 6)
        if ((net.encryption || '').toLowerCase().includes('wpa2')) setEncryption('wpa2')
        else if ((net.encryption || '').toLowerCase().includes('wpa3')) setEncryption('wpa3')
        else setEncryption('open')
      }
    }
  }, [targetBssid, networks, spoofSsid])

  // ── ACTIVE STATE ──────────────────────────────────────────────────────────
  if (activeTwinJob) {
    const sessionCreds = credentials.filter(c => c.timestamp > activeTwinJob.startedAt)
    const m = Math.floor(uptimeSeconds / 60)
    const s = uptimeSeconds % 60

    return (
      <div className="flex flex-col h-full animate-fade-in gap-4 font-sans">
        {/* Header bar */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-0.5">
              <div className="w-2 h-2 rounded-full bg-status-running animate-pulse-green" />
              <h2 className="text-lg font-bold text-text-primary">Evil Twin Active</h2>
            </div>
            <p className="text-sm text-text-disabled">
              Spoofing <span className="text-text-primary font-medium">{activeTwinJob.target}</span>
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => stopJob(activeTwinJob.id)}
            className="bg-status-error/10 text-status-error hover:bg-status-error/20 border-status-error/30"
          >
            <Square className="w-4 h-4 mr-2" fill="currentColor" />Stop Attack
          </Button>
        </div>

        {/* Top Metrics row */}
        <div className="grid grid-cols-4 gap-3 flex-shrink-0">
          {[
            { label: 'Uptime',      value: `${m}m ${s.toString().padStart(2, '0')}s` },
            { label: 'Frames Sent', value: activeTwinJob.framesSent ?? 0 },
            { label: 'DHCP Leases', value: 0 }, // Placeholder for V2
            { label: 'Connected',   value: 0, icon: Users }, // Placeholder for V2
          ].map(item => (
            <div key={item.label} className="bg-bg-elevated border border-border-subtle rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-text-disabled uppercase tracking-widest mb-1.5">{item.label}</div>
                <div className="text-xl font-bold font-mono text-text-primary tabular-nums leading-none">{item.value}</div>
              </div>
              {item.icon && <item.icon className="w-6 h-6 text-text-disabled opacity-20" />}
            </div>
          ))}
        </div>
        
        {/* Secondary Metrics row */}
        <div className="grid grid-cols-2 gap-3 flex-shrink-0">
          <div className="bg-bg-elevated border border-border-subtle rounded-lg px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-text-disabled uppercase tracking-widest mb-1.5">Fake AP Status</div>
              <div className="text-xl font-bold font-mono text-text-primary tabular-nums leading-none">Broadcasting</div>
            </div>
          </div>
          <div className={cn("bg-bg-elevated border rounded-lg px-4 py-3 flex items-center justify-between transition-colors duration-500", sessionCreds.length > 0 ? "border-accent/50 shadow-[0_0_15px_rgba(233,84,32,0.1)]" : "border-border-subtle")}>
            <div>
              <div className="text-[10px] text-text-disabled uppercase tracking-widest mb-1.5">Credentials Harvested</div>
              <div className={cn("text-xl font-bold font-mono tabular-nums leading-none", sessionCreds.length > 0 ? "text-accent" : "text-text-primary")}>{sessionCreds.length}</div>
            </div>
            {sessionCreds.length > 0 && <Check className="w-6 h-6 text-accent" />}
          </div>
        </div>

        {/* Credential feed — fills remaining height */}
        <div className="flex-1 flex flex-col bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden min-h-0">
          <div className="px-4 py-2.5 border-b border-border-subtle bg-bg-surface flex-shrink-0">
            <h3 className="text-[11px] font-semibold text-text-disabled uppercase tracking-widest">Live Credential Feed</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {sessionCreds.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-text-disabled italic">
                Waiting for portal submissions...
              </div>
            ) : (
              sessionCreds.map(cred => (
                <div
                  key={cred.id}
                  className="bg-bg-surface border border-accent/20 rounded-lg p-3 flex justify-between items-center animate-fade-in"
                >
                  <div>
                    <div className="font-mono text-sm text-text-primary">{cred.username} / {cred.plainText || '••••••••'}</div>
                    <div className="text-xs text-text-disabled mt-0.5">Client: {cred.clientMac}</div>
                  </div>
                  <div className="flex items-center gap-1 text-accent text-xs font-bold">
                    <Check className="w-3.5 h-3.5" />Captured
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── WIZARD STATE ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full animate-fade-in font-sans">
      {/* Wizard card fills full height */}
      <div className="flex-1 flex flex-col bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden min-h-0 relative">

        {/* Step indicator */}
        <StepIndicator current={step} />

        {/* Step content — scrollable */}
        <div className="flex-1 overflow-y-auto p-8 min-h-0 flex flex-col items-center">

          {/* STEP 1: Target */}
          {step === 1 && (
            <div className="w-full max-w-xl animate-fade-in mt-4">
              <div className="space-y-6">
                {/* Network picker from discovered networks */}
                {networks.size > 0 && (
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">Discovered Networks</Label>
                    <Select value={targetBssid || '_manual'} onValueChange={val => {
                        if (val === '_manual') {
                            setTargetBssid('')
                            setSpoofSsid('')
                        } else {
                            setTargetBssid(val)
                        }
                    }}>
                      <SelectTrigger className="w-full bg-bg-surface border border-border-subtle rounded-md px-4 py-3 text-sm text-text-primary outline-none focus:border-accent shadow-sm">
                        <SelectValue placeholder="— Pick a network or enter manually —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_manual">— Enter Manually —</SelectItem>
                        {Array.from(networks.values()).map(n => (
                          <SelectItem key={n.bssid} value={n.bssid}>
                            {n.ssid || '(hidden)'} [{n.bssid}] Ch{n.channel} {n.encryption}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">Target BSSID</Label>
                    <Input
                      placeholder="00:11:22:33:44:55"
                      value={targetBssid}
                      onChange={e => setTargetBssid(formatMac(e.target.value))}
                      className="font-mono text-sm bg-bg-surface border-border-subtle px-4 py-3 h-auto"
                      maxLength={17}
                    />
                  </div>
                  <div className="space-y-2 col-span-1">
                    <Label className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">Channel</Label>
                    <Select value={channel.toString()} onValueChange={val => setChannel(Number(val))}>
                      <SelectTrigger className="w-full bg-bg-surface border border-border-subtle rounded-md px-4 py-3 h-auto text-sm text-text-primary outline-none focus:border-accent">
                        <SelectValue placeholder="Ch..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-[250px]">
                        {[1,2,3,4,5,6,7,8,9,10,11,12,13,36,40,44,48,52,56,60,64,100,104,108,112,116,120,124,128,132,136,140,144,149,153,157,161,165].map(ch => (
                          <SelectItem key={ch} value={ch.toString()}>
                            Ch {ch} {ch > 14 ? '(5G)' : '(2.4G)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">Spoofed SSID (Broadcast Name)</Label>
                  <Input
                    placeholder="FreeWiFi"
                    value={spoofSsid}
                    onChange={e => setSpoofSsid(e.target.value)}
                    className="bg-bg-surface border-border-subtle px-4 py-3 h-auto text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Configuration */}
          {step === 2 && (
            <div className="w-full max-w-4xl animate-fade-in mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Col: Template Selection */}
                <div className="flex flex-col gap-4">
                  <h4 className="text-[10px] font-bold text-text-disabled uppercase tracking-widest border-b border-border-subtle pb-2 flex items-center gap-2">
                    <FileCode2 className="w-3.5 h-3.5" /> Captive Portal Template
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {TEMPLATES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTemplate(t.id)}
                        className={cn(
                          'p-3 rounded-lg border flex items-center gap-4 cursor-pointer transition-all text-left w-full',
                          selectedTemplate === t.id
                            ? 'bg-bg-active border-border-default shadow-sm'
                            : 'bg-bg-surface border-transparent hover:border-border-subtle'
                        )}
                      >
                        <div className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                          selectedTemplate === t.id ? 'bg-bg-elevated text-accent border border-accent/30' : 'bg-bg-active text-text-disabled border border-transparent'
                        )}>
                          <t.icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className={cn('text-sm font-bold', selectedTemplate === t.id ? 'text-accent' : 'text-text-primary')}>{t.name}</div>
                          <div className="text-xs text-text-disabled mt-0.5">{t.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  
                  {selectedTemplate === 'custom' && (
                    <div className="mt-2 border-2 border-dashed border-border-default rounded-lg p-6 text-center bg-bg-surface transition-colors hover:border-accent/50 group relative">
                      <input 
                        type="file" 
                        accept=".zip,.html" 
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if(file) {
                            setCustomFile(file)
                            toast.success(`Selected template: ${file.name}`)
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <Upload className="w-6 h-6 mx-auto text-text-disabled group-hover:text-accent transition-colors mb-2" />
                      <p className="text-sm text-text-primary font-bold mb-1">{customFile ? customFile.name : 'Upload Custom Template'}</p>
                      <p className="text-[10px] text-text-disabled">Drag & drop a .zip file containing index.html</p>
                    </div>
                  )}
                </div>

                {/* Right Col: Attack Config */}
                <div className="flex flex-col gap-4">
                  <h4 className="text-[10px] font-bold text-text-disabled uppercase tracking-widest border-b border-border-subtle pb-2 flex items-center gap-2">
                    <Settings2 className="w-3.5 h-3.5" /> Attack Behavior
                  </h4>
                  
                  <div className="bg-bg-surface border border-border-subtle rounded-lg p-5 space-y-6">
                    {/* Security */}
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-text-primary">Encryption</Label>
                      <Select value={encryption} onValueChange={setEncryption}>
                        <SelectTrigger className="w-full bg-bg-active border border-border-default rounded-md px-3 py-2 text-sm text-text-primary outline-none focus:border-accent">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open (Recommended for Portals)</SelectItem>
                          <SelectItem value="wpa2">WPA2 PSK</SelectItem>
                          <SelectItem value="wpa3">WPA3 SAE</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Deauth Companion */}
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-text-primary flex items-center justify-between">
                        Deauth Companion
                      </Label>
                      <Select value={deauthMode} onValueChange={setDeauthMode}>
                        <SelectTrigger className="w-full bg-bg-active border border-border-default rounded-md px-3 py-2 text-sm text-text-primary outline-none focus:border-accent">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="never">Never (Passive)</SelectItem>
                          <SelectItem value="launch">Once on Launch</SelectItem>
                          <SelectItem value="continuous">Continuous Attack</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      {deauthMode === 'continuous' && (
                        <div className="flex items-center gap-3 pt-2">
                          <Label className="text-xs text-text-secondary whitespace-nowrap">Interval:</Label>
                          <Select value={deauthInterval.toString()} onValueChange={val => setDeauthInterval(Number(val))}>
                            <SelectTrigger className="w-full bg-bg-active border border-border-default rounded-md px-2 h-8 text-xs text-text-primary outline-none">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="5">5 seconds</SelectItem>
                              <SelectItem value="15">15 seconds</SelectItem>
                              <SelectItem value="30">30 seconds</SelectItem>
                              <SelectItem value="60">60 seconds</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {/* Toggles */}
                    <div className="space-y-4 pt-4 border-t border-border-subtle">
                      <div className="flex items-center justify-between gap-4">
                        <Label className="text-xs font-bold text-text-primary cursor-pointer" onClick={() => setKarmaMode(!karmaMode)}>Karma Mode</Label>
                        <Button
                          variant="outline" size="sm" onClick={() => setKarmaMode(!karmaMode)}
                          className={cn("h-6 px-3 text-[10px] font-bold rounded-full transition-colors border-0", karmaMode ? "bg-accent/20 text-accent" : "bg-bg-active text-text-disabled")}
                        >
                          {karmaMode ? 'ON' : 'OFF'}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <Label className="text-xs font-bold text-text-primary cursor-pointer" onClick={() => setDnsSpoof(!dnsSpoof)}>DNS Spoofing</Label>
                        <Button
                          variant="outline" size="sm" onClick={() => setDnsSpoof(!dnsSpoof)}
                          className={cn("h-6 px-3 text-[10px] font-bold rounded-full transition-colors border-0", dnsSpoof ? "bg-accent/20 text-accent" : "bg-bg-active text-text-disabled")}
                        >
                          {dnsSpoof ? 'ON' : 'OFF'}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <Label className="text-xs font-bold text-text-primary cursor-pointer" onClick={() => setMitmEnabled(!mitmEnabled)}>MITM Sniffer</Label>
                        <Button
                          variant="outline" size="sm" onClick={() => setMitmEnabled(!mitmEnabled)}
                          className={cn("h-6 px-3 text-[10px] font-bold rounded-full transition-colors border-0", mitmEnabled ? "bg-accent/20 text-accent" : "bg-bg-active text-text-disabled")}
                        >
                          {mitmEnabled ? 'ON' : 'OFF'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Launch Summary */}
          {step === 3 && (
            <div className="w-full max-w-2xl animate-fade-in mt-4 text-center">
              <div className="bg-bg-surface border border-border-subtle rounded-lg overflow-hidden text-left shadow-lg">
                <div className="grid grid-cols-2 divide-x divide-border-subtle">
                  <div className="p-6 space-y-4">
                    <div className="space-y-3">
                      <div>
                        <div className="text-[10px] text-text-disabled uppercase">Spoofed SSID</div>
                        <div className="text-sm font-bold text-text-primary truncate">{spoofSsid || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-text-disabled uppercase">Target BSSID</div>
                        <div className="text-sm font-mono text-text-secondary">{targetBssid || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-text-disabled uppercase">Channel</div>
                        <div className="text-sm font-medium text-text-primary">{channel}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-6 space-y-4 bg-bg-elevated">
                    <div className="space-y-3">
                      <div>
                        <div className="text-[10px] text-text-disabled uppercase">Portal Template</div>
                        <div className="text-sm font-medium text-text-primary">{TEMPLATES.find(t => t.id === selectedTemplate)?.name ?? 'Custom'}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[10px] text-text-disabled uppercase">Karma</div>
                          <div className={cn("text-sm font-bold", karmaMode ? "text-accent" : "text-text-disabled")}>{karmaMode ? 'Enabled' : 'Disabled'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-text-disabled uppercase">DNS Spoof</div>
                          <div className={cn("text-sm font-bold", dnsSpoof ? "text-accent" : "text-text-disabled")}>{dnsSpoof ? 'Enabled' : 'Disabled'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-text-disabled uppercase">MITM</div>
                          <div className={cn("text-sm font-bold", mitmEnabled ? "text-accent" : "text-text-disabled")}>{mitmEnabled ? 'Enabled' : 'Disabled'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-text-disabled uppercase">Encryption</div>
                          <div className="text-sm font-medium text-text-primary">{encryption.toUpperCase()}</div>
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-text-disabled uppercase">Deauth Mode</div>
                        <div className={cn("text-sm font-medium", deauthMode !== 'never' ? "text-accent" : "text-text-disabled")}>{deauthMode === 'never' ? 'Passive' : deauthMode === 'continuous' ? `Continuous (${deauthInterval}s)` : 'Once on Launch'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 text-xs text-text-secondary">
                Launching this attack will monopolize the selected wireless interface in AP mode.
              </div>
            </div>
          )}
        </div>

        {/* Footer navigation — pinned to bottom of card */}
        <div className="flex items-center justify-between px-8 py-4 border-t border-border-subtle bg-bg-surface flex-shrink-0 z-10">
          <Button
            variant="ghost"
            onClick={() => step === 1 ? navigate(-1) : setStep(s => s - 1)}
            className="text-text-secondary hover:text-text-primary"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          {step < 3 ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && (!targetBssid || !spoofSsid)}
              className="bg-bg-active border border-border-subtle text-text-primary hover:bg-bg-hover hover:border-border-default font-bold px-8 shadow-sm transition-colors"
            >
              Next
            </Button>
          ) : (
            <Button
              className="bg-accent text-white hover:bg-accent-hover font-bold px-8 shadow-glow-accent transition-colors"
              onClick={() => setConfirmOpen(true)}
            >
              Deploy Evil Twin
            </Button>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Deploy Evil Twin?"
        description={`This will broadcast SSID '${spoofSsid}' on Ch${channel} with '${TEMPLATES.find(t => t.id === selectedTemplate)?.name}' portal. All DNS/DHCP traffic will be hijacked.`}
        confirmText="Launch Attack"
        variant="destructive"
        onConfirm={() => {
          if (adapters.length === 0) {
            toast.error('No wireless adapters detected. Please connect an adapter first.')
            return
          }
          if (deauthMode !== 'never' && (!hasApAdapter || !hasMonAdapter)) {
            toast.warning('Warning: Deauth companion requires a secondary dedicated monitor card. It may fail to run.')
          }
          
          const apIface = adapters.find(a => a.mode === 'managed' || a.mode === 'ap')?.iface || adapters[0]?.iface || 'wlan_ap'
          
          // Sending advanced payload to backend
          startJob('eviltwin', { 
            ssid: spoofSsid, 
            channel, 
            template: selectedTemplate,
            iface: apIface,
            bssid: targetBssid,
            encryption,
            karma_mode: karmaMode,
            dns_spoofing: dnsSpoof,
            mitm_enabled: mitmEnabled,
            deauth_companion: deauthMode,
            deauth_interval: deauthInterval
          })
        }}
      />
    </div>
  )
}
