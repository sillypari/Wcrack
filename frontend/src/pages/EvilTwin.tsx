import * as React from 'react'
import { Wifi, Router, Coffee, Cloud, Building2, Upload, Target, FileCode2, Play, Square, Check, AlertTriangle } from 'lucide-react'
import { useWcarckStore } from '@/store/useWcarckStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmModal } from '@/components/ui/confirm-modal'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

const TEMPLATES = [
  { id: 'router',  name: 'Router Firmware Update', icon: Router,    desc: 'Generic ISP login portal' },
  { id: 'coffee',  name: 'Coffee Shop',             icon: Coffee,    desc: 'Terms of service and login' },
  { id: 'airport', name: 'Airport',                 icon: Cloud,     desc: 'Connection portal' },
  { id: 'hotel',   name: 'Hotel',                   icon: Building2, desc: 'Hotel room check-in' },
  { id: 'custom',  name: 'Custom Template',         icon: Upload,    desc: 'Your own HTML template' },
]

// Step indicator at the top of the wizard card
function StepIndicator({ current }: { current: number }) {
  const steps = [
    { num: 1, label: 'Target',   icon: Target },
    { num: 2, label: 'Template', icon: FileCode2 },
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
  const [selectedTemplate, setSelectedTemplate] = React.useState('router')
  const [channel, setChannel] = React.useState(6)
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (!spoofSsid) setSpoofSsid(net.ssid)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setChannel(net.channel || 6)
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

        {/* Metric row */}
        <div className="grid grid-cols-4 gap-3 flex-shrink-0">
          {[
            { label: 'Uptime',      value: `${m}m ${s.toString().padStart(2, '0')}s` },
            { label: 'DNS Requests',value: activeTwinJob.framesSent ?? 0 },
            { label: 'Portal Hits', value: Math.floor((activeTwinJob.framesSent ?? 0) / 10) },
            { label: 'Credentials', value: sessionCreds.length, accent: sessionCreds.length > 0 },
          ].map(item => (
            <div
              key={item.label}
              className={cn(
                'bg-bg-elevated border border-border-subtle rounded-lg px-4 py-3',
                item.accent && 'border-status-success/40'
              )}
            >
              <div className="text-[10px] text-text-disabled uppercase tracking-widest mb-1.5">{item.label}</div>
              <div className="text-2xl font-bold font-mono text-text-primary tabular-nums leading-none">{item.value}</div>
            </div>
          ))}
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
            <div className="max-w-md animate-fade-in">
              <h3 className="text-base font-semibold text-text-primary mb-1">Select Target</h3>
              <p className="text-sm text-text-disabled mb-6">Specify the network you want to clone.</p>
              <div className="space-y-4">
                {/* Network picker from discovered networks */}
                {networks.size > 0 && (
                  <div className="space-y-2">
                    <Label>Select Discovered Network</Label>
                    <select
                      className="w-full bg-bg-active border border-border-default rounded-md px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                      value={targetBssid}
                      onChange={e => setTargetBssid(e.target.value)}
                    >
                      <option value="">— pick a network or enter manually —</option>
                      {Array.from(networks.values()).map(n => (
                        <option key={n.bssid} value={n.bssid}>
                          {n.ssid || '(hidden)'} [{n.bssid}] Ch{n.channel} {n.encryption}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Target BSSID</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="00:11:22:33:44:55"
                      value={targetBssid}
                      onChange={e => setTargetBssid(e.target.value)}
                      className="font-mono bg-bg-active border-border-subtle flex-1"
                    />
                    <Button variant="outline" onClick={() => navigate('/recon')} className="bg-bg-active border-border-subtle">
                      Scan
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Spoofed SSID</Label>
                  <Input
                    placeholder="FreeWiFi"
                    value={spoofSsid}
                    onChange={e => setSpoofSsid(e.target.value)}
                    className="bg-bg-active border-border-subtle"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <select
                    className="w-full bg-bg-active border border-border-default rounded-md px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                    value={channel}
                    onChange={e => setChannel(Number(e.target.value))}
                  >
                    {[1,2,3,4,5,6,7,8,9,10,11,12,13,36,40,44,48,52,56,60,64,100,104,108,112,116,120,124,128,132,136,140,144,149,153,157,161,165].map(ch => (
                      <option key={ch} value={ch}>Channel {ch} {ch > 14 ? '(5 GHz)' : '(2.4 GHz)'}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Template */}
          {step === 2 && (
            <div className="animate-fade-in">
              <h3 className="text-base font-semibold text-text-primary mb-1">Choose Captive Portal Template</h3>
              <p className="text-sm text-text-disabled mb-6">Choose a template to serve to victims.</p>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 max-w-2xl">
                {TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    className={cn(
                      'p-4 rounded-lg border flex items-start gap-3 cursor-pointer transition-all text-left w-full',
                      selectedTemplate === t.id
                        ? 'bg-accent/8 border-accent'
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
                      <div className={cn('text-sm font-medium', selectedTemplate === t.id ? 'text-accent-text' : 'text-text-primary')}>{t.name}</div>
                      <div className="text-xs text-text-disabled mt-0.5">{t.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
              {selectedTemplate === 'custom' && (
                <div className="mt-4 border-2 border-dashed border-border-strong rounded-lg p-6 text-center bg-bg-surface max-w-sm">
                  <Upload className="w-7 h-7 mx-auto text-text-disabled mb-2" />
                  <p className="text-sm text-text-primary mb-1">Drag and drop your template .zip</p>
                  <p className="text-xs text-text-disabled">Must contain index.html and assets</p>
                  <Button variant="outline" size="sm" className="mt-3">Browse Files</Button>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Launch */}
          {step === 3 && (
            <div className="flex flex-col items-center animate-fade-in">
              <Wifi className="w-14 h-14 text-status-warning mb-4" />
              <h3 className="text-base font-semibold text-text-primary mb-1">Ready to Launch</h3>
              <p className="text-sm text-text-disabled max-w-sm text-center mb-6">
                You are about to broadcast a spoofed AP and hijack DHCP/DNS traffic.
              </p>
              <div className="bg-bg-surface border border-border-subtle rounded-lg p-5 w-full max-w-sm space-y-3 text-sm mb-4">
                {[
                  { label: 'Target BSSID', value: targetBssid, mono: true },
                  { label: 'Spoofed SSID', value: spoofSsid, mono: false },
                  { label: 'Channel', value: `${channel} (${channel > 14 ? '5 GHz' : '2.4 GHz'})`, mono: false },
                  { label: 'Template', value: TEMPLATES.find(t => t.id === selectedTemplate)?.name ?? '', mono: false },
                ].map(item => (
                  <div key={item.label} className="flex justify-between items-center">
                    <span className="text-text-disabled">{item.label}</span>
                    <span className={cn('text-text-primary', item.mono && 'font-mono text-xs')}>{item.value}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-border-subtle flex items-start gap-2 text-status-warning">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p className="text-xs">Adapter will switch to AP mode. Monitor capabilities may be reduced.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer navigation — pinned to bottom of card */}
        <div className="flex items-center justify-between px-8 py-4 border-t border-border-subtle bg-bg-surface flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => step === 1 ? navigate(-1) : setStep(s => s - 1)}
            className="bg-bg-active border-border-subtle"
          >
            Back
          </Button>
          {step < 3 ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && (!targetBssid || !spoofSsid)}
              className="bg-accent text-white hover:bg-accent-hover"
            >
              Next Step
            </Button>
          ) : (
            <Button
              className="bg-status-error text-white hover:bg-status-error/80"
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
          if (!hasApAdapter || !hasMonAdapter) {
            toast.error('Requires both an AP adapter and Monitor adapter.')
            return
          }
          // Backend eviltwin.py expects: ssid, channel, template, iface
          // AP adapter iface is needed; if none found, use 'wlan_ap' as default
          const apIface = adapters.find(a => a.mode === 'managed' || a.mode === 'ap')?.iface || 'wlan_ap'
          startJob('eviltwin', { 
            ssid: spoofSsid, 
            channel, 
            template: selectedTemplate,
            iface: apIface,
            bssid: targetBssid  // used for deauth companion if needed
          })
        }}
      />
    </div>
  )
}
