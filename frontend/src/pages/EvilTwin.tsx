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
    <div className="flex items-center px-8 py-4 border-b border-border-subtle flex-shrink-0 relative">
      {/* Track container centered on icons */}
      <div className="absolute left-[50px] right-[50px] top-[34px] h-px z-0 -translate-y-1/2">
        <div className="w-full h-full bg-border-subtle" />
        <div
          className="absolute left-0 top-0 h-full bg-accent transition-all duration-500 ease-out"
          style={{ width: `${(current - 1) * 50}%` }}
        />
      </div>
      <div className="flex justify-between w-full z-10">
        {steps.map(s => {
          const isPast = current > s.num
          const isCurrent = current === s.num
          return (
            <div key={s.num} className="flex flex-col items-center gap-1.5">
              <div className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 border-2',
                isPast ? 'bg-accent border-accent text-white' :
                isCurrent ? 'bg-bg-elevated border-accent text-accent' :
                'bg-bg-surface border-border-default text-text-disabled'
              )}>
                {isPast ? <Check className="w-4 h-4 stroke-[3px]" /> : <s.icon className="w-4 h-4" />}
              </div>
              <span className={cn(
                'text-[10px] font-semibold uppercase tracking-widest',
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
  const [deauthMode, setDeauthMode] = React.useState('never') // never, launch, continuous
  const [deauthInterval, setDeauthInterval] = React.useState(15) // seconds
  const [customFile, setCustomFile] = React.useState<File | null>(null)
  
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const activeTwinJob = activeJobs.find(j => j.type === 'eviltwin')
  const hasMonAdapter = adapters.some(a => a.mode === 'monitor')
  const hasApAdapter = adapters.some(a => a.mode === 'managed' && a.status !== 'down')

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
    if (targetBssid) {
      const net = networks.get(targetBssid)
      if (net) {
        if (!spoofSsid) setSpoofSsid(net.ssid)
        setChannel(net.channel || 6)
        if (net.encryption.toLowerCase().includes('wpa2')) setEncryption('wpa2')
        else if (net.encryption.toLowerCase().includes('wpa3')) setEncryption('wpa3')
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
      <div className="flex flex-col h-full animate-fade-in gap-4">
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
          <div className={cn("bg-bg-elevated border rounded-lg px-4 py-3 flex items-center justify-between", sessionCreds.length > 0 ? "border-status-success/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]" : "border-border-subtle")}>
            <div>
              <div className="text-[10px] text-text-disabled uppercase tracking-widest mb-1.5">Credentials Harvested</div>
              <div className={cn("text-xl font-bold font-mono tabular-nums leading-none", sessionCreds.length > 0 ? "text-status-success" : "text-text-primary")}>{sessionCreds.length}</div>
            </div>
            {sessionCreds.length > 0 && <Check className="w-6 h-6 text-status-success" />}
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
                  className="bg-bg-surface border border-status-success/20 rounded-lg p-3 flex justify-between items-center animate-fade-in"
                >
                  <div>
                    <div className="font-mono text-sm text-text-primary">{cred.username} / {cred.plainText || '••••••••'}</div>
                    <div className="text-xs text-text-disabled mt-0.5">Client: {cred.clientMac}</div>
                  </div>
                  <div className="flex items-center gap-1 text-status-success text-xs font-semibold">
                    <Check className="w-3.5 h-3.5" />Valid
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
    <div className="flex flex-col h-full animate-fade-in">
      {/* Wizard card fills full height */}
      <div className="flex-1 flex flex-col bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden min-h-0">

        {/* Step indicator */}
        <StepIndicator current={step} />

        {/* Step content — scrollable */}
        <div className="flex-1 overflow-y-auto p-8 min-h-0">

          {/* STEP 1: Target */}
          {step === 1 && (
            <div className="max-w-md animate-fade-in mx-auto">
              <h3 className="text-lg font-bold text-text-primary mb-1">Select Target</h3>
              <p className="text-sm text-text-disabled mb-6">Specify the network you want to clone.</p>
              <div className="space-y-5">
                {/* Network picker from discovered networks */}
                {networks.size > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-text-secondary uppercase tracking-widest">Discovered Network</Label>
                    <Select value={targetBssid || '_manual'} onValueChange={val => setTargetBssid(val === '_manual' ? '' : val)}>
                      <SelectTrigger className="w-full bg-bg-surface border border-border-subtle rounded-md px-3 py-2 text-sm text-text-primary outline-none focus:border-accent">
                        <SelectValue placeholder="— pick a network or enter manually —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_manual">— pick a network or enter manually —</SelectItem>
                        {Array.from(networks.values()).map(n => (
                          <SelectItem key={n.bssid} value={n.bssid}>
                            {n.ssid || '(hidden)'} [{n.bssid}] Ch{n.channel} {n.encryption}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                <div className="flex gap-4">
                  <div className="space-y-2 flex-1">
                    <Label className="text-xs font-bold text-text-secondary uppercase tracking-widest">Target BSSID</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="00:11:22:33:44:55"
                        value={targetBssid}
                        onChange={e => setTargetBssid(e.target.value)}
                        className="font-mono bg-bg-surface border-border-subtle flex-1"
                      />
                    </div>
                  </div>
                  <div className="space-y-2 flex-1">
                    <Label className="text-xs font-bold text-text-secondary uppercase tracking-widest">Channel</Label>
                    <Select value={channel.toString()} onValueChange={val => setChannel(Number(val))}>
                      <SelectTrigger className="w-full bg-bg-surface border border-border-subtle rounded-md px-3 py-2 text-sm text-text-primary outline-none focus:border-accent">
                        <SelectValue placeholder="Ch..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-[250px]">
                        {[1,2,3,4,5,6,7,8,9,10,11,12,13,36,40,44,48,52,56,60,64,100,104,108,112,116,120,124,128,132,136,140,144,149,153,157,161,165].map(ch => (
                          <SelectItem key={ch} value={ch.toString()}>
                            Channel {ch} {ch > 14 ? '(5G)' : '(2.4G)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-text-secondary uppercase tracking-widest">Spoofed SSID (Broadcast Name)</Label>
                  <Input
                    placeholder="FreeWiFi"
                    value={spoofSsid}
                    onChange={e => setSpoofSsid(e.target.value)}
                    className="bg-bg-surface border-border-subtle"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Configuration */}
          {step === 2 && (
            <div className="animate-fade-in max-w-4xl mx-auto">
              <h3 className="text-lg font-bold text-text-primary mb-1">Configuration</h3>
              <p className="text-sm text-text-disabled mb-8">Setup the portal template and advanced attack parameters.</p>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                
                {/* Left Col: Template Selection */}
                <div>
                  <h4 className="text-xs font-bold text-text-secondary uppercase tracking-widest border-b border-border-subtle pb-2 mb-4 flex items-center gap-2">
                    <FileCode2 className="w-4 h-4" /> Captive Portal Template
                  </h4>
                  <div className="grid grid-cols-1 gap-3">
                    {TEMPLATES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTemplate(t.id)}
                        className={cn(
                          'p-3 rounded-lg border flex items-start gap-3 cursor-pointer transition-all text-left w-full',
                          selectedTemplate === t.id
                            ? 'bg-accent/10 border-accent shadow-[0_0_10px_rgba(var(--color-accent),0.1)]'
                            : 'bg-bg-surface border-border-subtle hover:bg-bg-hover'
                        )}
                      >
                        <div className={cn(
                          'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                          selectedTemplate === t.id ? 'bg-accent text-white' : 'bg-bg-active text-text-disabled'
                        )}>
                          <t.icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className={cn('text-sm font-bold', selectedTemplate === t.id ? 'text-accent-text' : 'text-text-primary')}>{t.name}</div>
                          <div className="text-xs text-text-disabled mt-0.5">{t.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  
                  {selectedTemplate === 'custom' && (
                    <div className="mt-4 border-2 border-dashed border-border-strong rounded-lg p-6 text-center bg-bg-surface transition-colors hover:border-accent/50 group relative">
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
                      <Upload className="w-8 h-8 mx-auto text-text-disabled group-hover:text-accent transition-colors mb-2" />
                      <p className="text-sm text-text-primary font-medium mb-1">{customFile ? customFile.name : 'Drag and drop your template .zip'}</p>
                      <p className="text-xs text-text-disabled">Must contain index.html and assets</p>
                      <Button variant="outline" size="sm" className="mt-3 pointer-events-none">Browse Files</Button>
                    </div>
                  )}
                </div>

                {/* Right Col: Attack Config */}
                <div>
                  <h4 className="text-xs font-bold text-text-secondary uppercase tracking-widest border-b border-border-subtle pb-2 mb-4 flex items-center gap-2">
                    <Settings2 className="w-4 h-4" /> Advanced Attack Config
                  </h4>
                  <div className="space-y-6">
                    
                    {/* Security */}
                    <div className="space-y-3">
                      <Label className="text-xs font-semibold text-text-primary">AP Security (Encryption)</Label>
                      <p className="text-[10px] text-text-disabled -mt-1.5 leading-snug max-w-sm">Select the encryption of your fake AP. Open is recommended for captive portals.</p>
                      <Select value={encryption} onValueChange={setEncryption}>
                        <SelectTrigger className="w-full max-w-sm bg-bg-surface border border-border-subtle rounded-md px-3 py-2 text-sm text-text-primary outline-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open (No Password)</SelectItem>
                          <SelectItem value="wpa2">WPA2 PSK</SelectItem>
                          <SelectItem value="wpa3">WPA3 SAE</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Deauth Companion */}
                    <div className="space-y-3 bg-status-warning/5 border border-status-warning/20 p-4 rounded-lg relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-3 opacity-10"><WifiOff className="w-16 h-16 text-status-warning" /></div>
                      <Label className="text-xs font-bold text-status-warning">Deauth Companion</Label>
                      <p className="text-[10px] text-text-secondary leading-snug max-w-[280px]">Knock clients off the real AP so they connect to your Evil Twin automatically.</p>
                      <Select value={deauthMode} onValueChange={setDeauthMode}>
                        <SelectTrigger className="w-full max-w-[280px] bg-bg-surface border border-status-warning/30 rounded-md px-3 py-2 text-sm text-text-primary outline-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="never">Never (Disabled)</SelectItem>
                          <SelectItem value="launch">Once on Launch</SelectItem>
                          <SelectItem value="continuous">Continuous Attack</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      {deauthMode === 'continuous' && (
                        <div className="flex items-center gap-3 pt-1">
                          <Label className="text-xs text-text-primary">Attack Interval:</Label>
                          <Select value={deauthInterval.toString()} onValueChange={val => setDeauthInterval(Number(val))}>
                            <SelectTrigger className="w-[120px] bg-bg-surface border border-border-subtle rounded-md px-2 h-8 text-xs text-text-primary outline-none">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="5">Every 5s</SelectItem>
                              <SelectItem value="15">Every 15s</SelectItem>
                              <SelectItem value="30">Every 30s</SelectItem>
                              <SelectItem value="60">Every 60s</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {/* Toggles */}
                    <div className="space-y-4 pt-2 border-t border-border-subtle">
                      <div className="flex items-start justify-between gap-4 max-w-sm">
                        <div>
                          <Label className="text-sm font-semibold text-text-primary cursor-pointer" onClick={() => setKarmaMode(!karmaMode)}>Karma Mode</Label>
                          <p className="text-[10px] text-text-disabled mt-0.5 leading-snug">Respond to ALL probe requests from nearby devices, capturing more wandering clients.</p>
                        </div>
                        <Button
                          variant="outline" size="sm" onClick={() => setKarmaMode(!karmaMode)}
                          className={cn("h-7 px-3 text-xs font-bold rounded-full transition-all", karmaMode ? "bg-accent border-accent text-white" : "bg-bg-surface border-border-subtle text-text-secondary")}
                        >
                          {karmaMode ? 'ON' : 'OFF'}
                        </Button>
                      </div>

                      <div className="flex items-start justify-between gap-4 max-w-sm">
                        <div>
                          <Label className="text-sm font-semibold text-text-primary cursor-pointer" onClick={() => setDnsSpoof(!dnsSpoof)}>DNS Spoofing</Label>
                          <p className="text-[10px] text-text-disabled mt-0.5 leading-snug">Redirect all DNS domains to your captive portal IP.</p>
                        </div>
                        <Button
                          variant="outline" size="sm" onClick={() => setDnsSpoof(!dnsSpoof)}
                          className={cn("h-7 px-3 text-xs font-bold rounded-full transition-all", dnsSpoof ? "bg-accent border-accent text-white" : "bg-bg-surface border-border-subtle text-text-secondary")}
                        >
                          {dnsSpoof ? 'ON' : 'OFF'}
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
            <div className="flex flex-col items-center animate-fade-in max-w-2xl mx-auto pt-4">
              <Wifi className="w-16 h-16 text-status-warning mb-4" />
              <h3 className="text-xl font-bold text-text-primary mb-2">Ready to Launch Attack</h3>
              <p className="text-sm text-text-disabled text-center mb-8 max-w-lg">
                You are about to deploy an Evil Twin access point. Verify the operational parameters below before proceeding.
              </p>
              
              <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-6">
                
                {/* AP Config Panel */}
                <div className="bg-bg-surface border border-border-subtle rounded-lg p-5 space-y-3 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-[0.03]"><NetworkIcon className="w-24 h-24" /></div>
                  <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-4 border-b border-border-subtle pb-2">AP Configuration</h4>
                  {[
                    { label: 'Target BSSID', value: targetBssid, mono: true },
                    { label: 'Spoofed SSID', value: spoofSsid, mono: false },
                    { label: 'Channel', value: `${channel} (${channel > 14 ? '5 GHz' : '2.4 GHz'})`, mono: false },
                    { label: 'Encryption', value: encryption.toUpperCase(), mono: false },
                    { label: 'Template', value: TEMPLATES.find(t => t.id === selectedTemplate)?.name ?? '', mono: false },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between items-center relative z-10">
                      <span className="text-text-disabled text-xs">{item.label}</span>
                      <span className={cn('text-text-primary font-medium', item.mono && 'font-mono text-xs')}>{item.value}</span>
                    </div>
                  ))}
                </div>

                {/* DHCP/DNS & Attack Panel */}
                <div className="bg-bg-surface border border-border-subtle rounded-lg p-5 space-y-3 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-[0.03]"><Server className="w-24 h-24" /></div>
                  <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-4 border-b border-border-subtle pb-2">Network Services</h4>
                  {[
                    { label: 'DHCP Range', value: '10.0.0.10 - 100', mono: true },
                    { label: 'Gateway & DNS', value: '10.0.0.1', mono: true },
                    { label: 'DNS Spoofing', value: dnsSpoof ? 'Enabled' : 'Disabled', mono: false },
                    { label: 'Karma Mode', value: karmaMode ? 'Enabled' : 'Disabled', mono: false },
                    { label: 'Deauth Mode', value: deauthMode === 'never' ? 'Disabled' : deauthMode === 'continuous' ? `Continuous (${deauthInterval}s)` : 'Once on Launch', mono: false },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between items-center relative z-10">
                      <span className="text-text-disabled text-xs">{item.label}</span>
                      <span className={cn(
                        'font-medium text-xs', 
                        item.mono ? 'font-mono text-text-secondary' : 
                        (item.value.includes('Enabled') || item.value.includes('Continuous')) ? 'text-status-warning' : 'text-text-primary'
                      )}>
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>

              </div>

              <div className="p-3 bg-status-warning/10 border border-status-warning/30 rounded-lg flex items-start gap-3 text-status-warning w-full">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed">
                  <strong>Warning:</strong> Launching this attack will switch your adapter into AP mode. All internet connectivity on this adapter will drop, and local DHCP/DNS tables will be overwritten.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer navigation — pinned to bottom of card */}
        <div className="flex items-center justify-between px-8 py-4 border-t border-border-subtle bg-bg-surface flex-shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.1)] z-10">
          <Button
            variant="outline"
            onClick={() => step === 1 ? navigate(-1) : setStep(s => s - 1)}
            className="bg-bg-active border-border-subtle text-text-primary"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          {step < 3 ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && (!targetBssid || !spoofSsid)}
              className="bg-accent text-white hover:bg-accent-hover font-bold px-6 shadow-glow"
            >
              Next Step
            </Button>
          ) : (
            <Button
              className="bg-status-error text-white hover:bg-status-error/90 font-bold px-6 shadow-glow-error"
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
          
          // Sending advanced payload to backend (backend V2 will process these new flags)
          startJob('eviltwin', { 
            ssid: spoofSsid, 
            channel, 
            template: selectedTemplate,
            iface: apIface,
            bssid: targetBssid,
            encryption,
            karma_mode: karmaMode,
            dns_spoofing: dnsSpoof,
            deauth_companion: deauthMode,
            deauth_interval: deauthInterval
          })
        }}
      />
    </div>
  )
}
