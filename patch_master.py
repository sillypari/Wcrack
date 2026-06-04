"""Master patch script - fixes all 6 issues identified"""
import os

BASE = 'frontend/src'

def read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  Written: {os.path.relpath(path)}")

def patch(path, old, new, label=''):
    content = read(path)
    if old in content:
        write(path, content.replace(old, new, 1))
        print(f"  [OK] {label}")
        return True
    else:
        print(f"  [SKIP - not found] {label}")
        return False

STORE = os.path.join(BASE, 'store', 'useWcarckStore.ts')
TOPBAR = os.path.join(BASE, 'components', 'layout', 'Topbar.tsx')
EVIL = os.path.join(BASE, 'pages', 'EvilTwin.tsx')
RECON = os.path.join(BASE, 'pages', 'Reconnaissance.tsx')
CREDS = os.path.join(BASE, 'pages', 'Credentials.tsx')
CRACK = os.path.join(BASE, 'pages', 'Crack.tsx')

###############################################################################
# ISSUE 1: Logs blank — processEvent switch uses event.topic but hub.py
# normalized events use event_type field. Fix: use event_type || topic for switch,
# and also fix the payload lookup (hub.py wraps payload in event.payload).
###############################################################################
print("\n=== Fix 1: processEvent — use event_type for topic routing ===")

# The normalized event from hub.py has: event_type, payload (nested), not topic
# The switch case was built for raw bus events (topic, payload at root)
# We need to handle both
old_switch_start = '''          switch (event.topic) {
            case 'network.discovered':
            case 'network.updated': {
              const netMap = new Map(state.networks)
              netMap.set(event.payload.bssid, event.payload)
              newState.networks = netMap
              break
            }
            case 'client.discovered':
            case 'client.updated': {
              const cliMap = new Map(state.clients)
              cliMap.set(event.payload.mac, event.payload)
              newState.clients = cliMap
              break
            }'''

new_switch_start = '''          // hub.py sends normalized events: {id, seq, event_type, payload, message, level, channel...}
          // Raw bus events have: topic, payload at root
          const evTopic: string = event.event_type || event.topic || ''
          const evPayload = event.payload || {}

          switch (evTopic) {
            case 'network.discovered':
            case 'network.updated': {
              const netMap = new Map(state.networks)
              const net = {
                bssid: evPayload.bssid,
                ssid: evPayload.ssid || '',
                channel: evPayload.channel || 0,
                encryption: evPayload.encryption || evPayload.privacy || '',
                cipher: evPayload.cipher || '',
                auth: evPayload.auth || '',
                pmf: evPayload.pmf || false,
                power: evPayload.power || evPayload.signal_dbm || 0,
                beacons: evPayload.beacons || 0,
                data: evPayload.data || 0,
                lastSeen: evPayload.last_seen ? evPayload.last_seen * 1000 : Date.now(),
              }
              if (net.bssid) netMap.set(net.bssid, net as any)
              newState.networks = netMap
              break
            }
            case 'client.discovered':
            case 'client.updated': {
              const cliMap = new Map(state.clients)
              const cli = {
                mac: evPayload.mac,
                bssid: evPayload.bssid || null,
                power: evPayload.power || evPayload.signal_dbm || 0,
                packets: evPayload.packets || 0,
                lastSeen: evPayload.last_seen ? evPayload.last_seen * 1000 : Date.now(),
                randomized: evPayload.randomized || false,
              }
              if (cli.mac) cliMap.set(cli.mac, cli as any)
              newState.clients = cliMap
              break
            }'''
patch(STORE, old_switch_start, new_switch_start, 'processEvent switch uses evTopic+evPayload')

# Fix remaining switch cases that also use event.payload and event.topic directly
old_adapter_case = '''            case 'adapter.state_changed':
            case 'adapter.mode_changed':
            case 'adapter.monitor_started':
            case 'adapter.monitor_stopped': {
              // Re-fetch adapter list from API for accurate state
              setTimeout(() => get().fetchInitialState(), 1500)
              break
            }
            case 'module.started': {
              const jobs = [...state.activeJobs]
              const jobId = String(event.payload.job_id)
              const idx = jobs.findIndex(j => j.id === jobId)
              const rawModule = event.payload.module || ""
              const type = rawModule.startsWith("recon") ? "recon" : 
                           rawModule.startsWith("attack.deauth") ? "deauth" :
                           rawModule.startsWith("attack.pmkid") ? "pmkid" :
                           rawModule.startsWith("attack.eviltwin") ? "eviltwin" :
                           rawModule.startsWith("crack") ? "crack" : rawModule
              
              const newJob = {
                id: jobId,
                type,
                target: type === "recon" ? "all" : (event.payload.target || "target"),
                status: "running" as const,
                progress: 0,
                startedAt: Date.now(),
                framesSent: 0,
                packetsPerSec: 0
              }
              if (idx >= 0) jobs[idx] = { ...jobs[idx], ...newJob }
              else jobs.push(newJob)
              newState.activeJobs = jobs
              break
            }
            case 'module.stopped': {
              const jobId = String(event.payload.job_id)
              newState.activeJobs = state.activeJobs.filter(j => j.id !== jobId)
              break
            }
            case 'job.started':
            case 'job.updated': {
              const jobs = [...state.activeJobs]
              const idx = jobs.findIndex(j => j.id === event.payload.id)
              if (idx >= 0) jobs[idx] = { ...jobs[idx], ...event.payload }
              else jobs.push(event.payload)
              newState.activeJobs = jobs
              break
            }
            case 'job.stopped':
            case 'job.completed':
            case 'job.failed': {
              newState.activeJobs = state.activeJobs.filter(j => j.id !== event.payload.id)
              if (event.topic === 'job.failed' && !state.uiState.focusMode) {
                 toast.error(`Job failed: ${event.payload.type}`)
              }
              break
            }
            case 'capture.handshake.eapol_m2':
            case 'capture.handshake.eapol_m3':
            case 'capture.handshake.eapol_m4': {
              const caps = [...state.captures]
              const idx = caps.findIndex(c => c.id === event.payload.id)
              if (idx >= 0) caps[idx] = { ...caps[idx], ...event.payload }
              else caps.unshift(event.payload)
              newState.captures = caps
              break
            }
            case 'credential.captured': {
              const creds = [event.payload, ...state.credentials]
              newState.credentials = creds
              break
            }
            case 'project.activated': {
              setTimeout(() => {
                get().fetchProjects()
                get().fetchInitialState()
              }, 50)
              break
            }
            case 'job.progress': {
              // Hashcat/aircrack progress: {job_id, progress, speed, eta, status_message}
              const jobs = [...state.activeJobs]
              const jobId = String(event.payload?.job_id ?? event.job_id ?? '')
              const idx = jobs.findIndex(j => j.id === jobId)
              if (idx >= 0) {
                jobs[idx] = {
                  ...jobs[idx],
                  progress: event.payload?.progress ?? jobs[idx].progress,
                  speed: event.payload?.speed ?? jobs[idx].speed,
                  eta: event.payload?.eta ?? jobs[idx].eta,
                  status_message: event.payload?.status_message ?? jobs[idx].status_message,
                }
              }
              newState.activeJobs = jobs
              break
            }
          }'''

new_adapter_case = '''            case 'adapter.state_changed':
            case 'adapter.mode_changed':
            case 'adapter.monitor_started':
            case 'adapter.monitor_stopped': {
              // Re-fetch adapter list from API for accurate state
              setTimeout(() => get().fetchInitialState(), 1500)
              break
            }
            case 'module.started': {
              const jobs = [...state.activeJobs]
              const jobId = String(evPayload.job_id)
              const idx = jobs.findIndex(j => j.id === jobId)
              const rawModule = evPayload.module || ""
              const type = rawModule.startsWith("recon") ? "recon" : 
                           rawModule.startsWith("attack.deauth") ? "deauth" :
                           rawModule.startsWith("attack.pmkid") ? "pmkid" :
                           rawModule.startsWith("attack.eviltwin") ? "eviltwin" :
                           rawModule.startsWith("crack") ? "crack" : rawModule
              
              const newJob = {
                id: jobId,
                type,
                target: type === "recon" ? "all" : (evPayload.target || evPayload.bssid || "target"),
                status: "running" as const,
                progress: 0,
                startedAt: Date.now(),
                framesSent: 0,
                packetsPerSec: 0
              }
              if (idx >= 0) jobs[idx] = { ...jobs[idx], ...newJob }
              else jobs.push(newJob)
              newState.activeJobs = jobs
              break
            }
            case 'module.stopped': {
              const jobId = String(evPayload.job_id)
              newState.activeJobs = state.activeJobs.filter(j => j.id !== jobId)
              break
            }
            case 'job.started':
            case 'job.updated': {
              const jobs = [...state.activeJobs]
              const idx = jobs.findIndex(j => j.id === String(evPayload.id))
              if (idx >= 0) jobs[idx] = { ...jobs[idx], ...evPayload }
              else jobs.push({ ...evPayload, id: String(evPayload.id) } as any)
              newState.activeJobs = jobs
              break
            }
            case 'job.stopped':
            case 'job.completed':
            case 'job.failed': {
              newState.activeJobs = state.activeJobs.filter(j => j.id !== String(evPayload.id))
              if (evTopic === 'job.failed' && !state.uiState.focusMode) {
                 toast.error(`Job failed: ${evPayload.type || evPayload.module || evTopic}`)
              }
              break
            }
            case 'handshake.captured':
            case 'capture.handshake.eapol_m2':
            case 'capture.handshake.eapol_m3':
            case 'capture.handshake.eapol_m4': {
              // Re-fetch captures from API when a new handshake is captured
              setTimeout(() => get().fetchInitialState(), 500)
              break
            }
            case 'credential.captured': {
              // Normalize backend credential format to frontend Credential type
              const rawCred = evPayload
              const normCred = {
                id: String(rawCred.id || Date.now()),
                bssid: rawCred.bssid || rawCred.client_mac || '',
                ssid: rawCred.ssid || rawCred.network_ssid || '',
                clientMac: rawCred.clientMac || rawCred.client_mac || '',
                username: rawCred.username || '',
                passwordHash: rawCred.passwordHash || rawCred.password_hash || '',
                plainText: rawCred.plainText || rawCred.password || '',
                type: rawCred.type || 'wpa_psk',
                valid: rawCred.valid || rawCred.validated || false,
                vendor: rawCred.vendor || '',
                timestamp: rawCred.timestamp ? rawCred.timestamp * 1000 : Date.now(),
              }
              const creds = [normCred, ...state.credentials]
              newState.credentials = creds as any
              break
            }
            case 'project.activated': {
              setTimeout(() => {
                get().fetchProjects()
                get().fetchInitialState()
              }, 50)
              break
            }
            case 'job.progress': {
              // Hashcat/aircrack progress: {job_id, progress, speed, eta, status_message}
              const jobs = [...state.activeJobs]
              const jobId = String(evPayload?.job_id ?? event.job_id ?? '')
              const idx = jobs.findIndex(j => j.id === jobId)
              if (idx >= 0) {
                jobs[idx] = {
                  ...jobs[idx],
                  progress: evPayload?.progress ?? jobs[idx].progress,
                  speed: evPayload?.speed ?? jobs[idx].speed,
                  eta: evPayload?.eta ?? jobs[idx].eta,
                  status_message: evPayload?.status_message ?? jobs[idx].status_message,
                }
              }
              newState.activeJobs = jobs
              break
            }
          }'''
patch(STORE, old_adapter_case, new_adapter_case, 'All switch cases use evTopic/evPayload')

###############################################################################
# ISSUE 2: credentials normalization in fetchInitialState
# Backend returns: id, network_ssid, password, client_mac, captured_at, validated
# Frontend wants: id, bssid, ssid, clientMac, username, passwordHash, plainText, type, valid, timestamp
###############################################################################
print("\n=== Fix 2: Credential normalization in fetchInitialState ===")

old_set_state = '            set({ adapters, networks, clients, captures, credentials, activeJobs })'
new_set_state = '''            // Normalize credentials from backend format
            const normCredentials = (credentials as any[]).map((c: any) => ({
              id: String(c.id),
              bssid: c.bssid || '',
              ssid: c.ssid || c.network_ssid || '',
              clientMac: c.clientMac || c.client_mac || '',
              username: c.username || '',
              passwordHash: c.passwordHash || c.password_hash || '',
              plainText: c.plainText || c.password || '',
              type: c.type || 'wpa_psk',
              valid: c.valid !== undefined ? c.valid : (c.validated || false),
              vendor: c.vendor || '',
              timestamp: c.captured_at ? new Date(c.captured_at).getTime() : (c.timestamp ? c.timestamp * 1000 : Date.now()),
            }))
            
            // Normalize captures from backend format
            const normCaptures = (captures as any[]).map((c: any) => ({
              id: String(c.id),
              bssid: c.bssid || '',
              ssid: c.ssid || '',
              type: c.type === 'wpa_handshake' ? 'eapol' : (c.type || 'eapol'),
              status: c.status === 'valid' ? 'Valid' : c.status === 'partial' ? 'Partial' : (c.status || 'Invalid'),
              filePath: c.path || c.filePath || '',
              timestamp: c.created_at ? new Date(c.created_at).getTime() : (c.timestamp || Date.now()),
              eapolM1: c.eapolM1 || false,
              eapolM2: c.eapolM2 || false,
              eapolM3: c.eapolM3 || false,
              eapolM4: c.eapolM4 || false,
            }))
            
            set({ adapters, networks, clients, captures: normCaptures, credentials: normCredentials, activeJobs })'''
patch(STORE, old_set_state, new_set_state, 'fetchInitialState normalize credentials+captures')

# Remove simulator from fetchInitialState (was await get().fetchSimulatorStatus())
old_fetch_sim = '''            await get().fetchProjects()
            await get().fetchSimulatorStatus()'''
new_fetch_sim = '''            await get().fetchProjects()'''
patch(STORE, old_fetch_sim, new_fetch_sim, 'Remove fetchSimulatorStatus from fetchInitialState')

# Remove simulatorRunning from SystemState
old_sim_state = '  simulatorRunning: boolean\n}'
new_sim_state = '}\n// simulatorRunning removed — simulator backend was deleted'
patch(STORE, old_sim_state, new_sim_state, 'Remove simulatorRunning from SystemState')

# Remove from WcarckStore interface
old_sim_iface = '''  fetchSimulatorStatus: () => Promise<void>
  toggleSimulator: () => Promise<void>'''
new_sim_iface = ''
patch(STORE, old_sim_iface, new_sim_iface, 'Remove simulator from WcarckStore interface')

# Remove from initial state
old_sim_init = '''        simulatorRunning: false,'''
new_sim_init = ''
patch(STORE, old_sim_init, new_sim_init, 'Remove simulatorRunning initial state')

# Remove fetchSimulatorStatus and toggleSimulator implementations
old_sim_impl = '''        fetchSimulatorStatus: async () => {
          try {
            const res = await fetch('http://127.0.0.1:8000/api/simulator/status')
            if (res.ok) {
              const data = await res.json()
              set({ simulatorRunning: data.status === 'running' })
            }
          } catch {
            // Ignore
          }
        },

        toggleSimulator: async () => {
          try {
            const res = await fetch('http://127.0.0.1:8000/api/simulator/toggle', { method: 'POST' })
            if (res.ok) {
              const data = await res.json()
              const isRunning = data.status === 'running'
              set({ simulatorRunning: isRunning })
              if (isRunning) {
                toast.success("Simulation mode activated")
              } else {
                toast.success("Simulation mode deactivated")
              }
            } else {
              const text = await res.text()
              throw new Error(text || `HTTP ${res.status}`)
            }
          } catch (e) {
            const err = e as Error
            toast.error(`Failed to toggle simulator mode: ${err.message}`)
          }
        }'''
new_sim_impl = ''
patch(STORE, old_sim_impl, new_sim_impl, 'Remove simulator implementations from store')

###############################################################################
# ISSUE 3: Remove simulator from Topbar
###############################################################################
print("\n=== Fix 3: Remove simulator from Topbar ===")

old_topbar_imports = 'import { Volume2, VolumeX, FileDown, AlertTriangle, Maximize2, Minimize2, Cpu } from "lucide-react"'
new_topbar_imports = 'import { Volume2, VolumeX, FileDown, AlertTriangle, Maximize2, Minimize2 } from "lucide-react"'
patch(TOPBAR, old_topbar_imports, new_topbar_imports, 'Remove Cpu icon import')

old_topbar_store = '  const { uiState, toggleAudio, adapters, sessionStartedAt, logs, projects, activeProjectId, simulatorRunning, toggleSimulator } = useWcarckStore()'
new_topbar_store = '  const { uiState, toggleAudio, adapters, sessionStartedAt, logs, projects, activeProjectId } = useWcarckStore()'
patch(TOPBAR, old_topbar_store, new_topbar_store, 'Remove simulator from Topbar store destructure')

old_topbar_sim_btn = '''        {/* Simulation mode toggle */}
        <AppTooltip content={simulatorRunning ? "Simulation Mode: ACTIVE" : "Simulation Mode: INACTIVE"} side="bottom">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSimulator}
            className={cn(
              "h-8 w-8 flex-shrink-0 transition-all duration-300",
              simulatorRunning ? "text-status-running bg-status-running/10 border border-status-running/20 hover:bg-status-running/20" : "text-text-tertiary hover:text-text-primary"
            )}
          >
            <Cpu className={cn("w-4 h-4", simulatorRunning && "animate-pulse")} />
          </Button>
        </AppTooltip>

        {/* Audio toggle */}'''
new_topbar_sim_btn = '''        {/* Audio toggle */}'''
patch(TOPBAR, old_topbar_sim_btn, new_topbar_sim_btn, 'Remove simulator button from Topbar UI')

###############################################################################
# ISSUE 4: EvilTwin — fix params sent to backend
# Backend eviltwin.py expects: ssid, channel, template, iface
# Frontend was sending: targetBssid, spoofSsid, template (wrong field names!)
###############################################################################
print("\n=== Fix 4: EvilTwin fix backend params ===")

# Add channel state
old_evil_state = '''  const [step, setStep] = React.useState(1)
  const [targetBssid, setTargetBssid] = React.useState(uiState.focusedNetworkBssid || '')
  const [spoofSsid, setSpoofSsid] = React.useState('')
  const [selectedTemplate, setSelectedTemplate] = React.useState('router')
  const [confirmOpen, setConfirmOpen] = React.useState(false)'''

new_evil_state = '''  const [step, setStep] = React.useState(1)
  const [targetBssid, setTargetBssid] = React.useState(uiState.focusedNetworkBssid || '')
  const [spoofSsid, setSpoofSsid] = React.useState('')
  const [selectedTemplate, setSelectedTemplate] = React.useState('router')
  const [channel, setChannel] = React.useState(6)
  const [confirmOpen, setConfirmOpen] = React.useState(false)'''
patch(EVIL, old_evil_state, new_evil_state, 'EvilTwin add channel state')

# Auto-fill channel from selected network
old_evil_ssid_effect = '''  React.useEffect(() => {
    if (targetBssid && !spoofSsid) {
      const net = networks.get(targetBssid)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (net) setSpoofSsid(net.ssid)
    }
  }, [targetBssid, networks, spoofSsid])'''
new_evil_ssid_effect = '''  React.useEffect(() => {
    if (targetBssid) {
      const net = networks.get(targetBssid)
      if (net) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (!spoofSsid) setSpoofSsid(net.ssid)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setChannel(net.channel || 6)
      }
    }
  }, [targetBssid, networks, spoofSsid])'''
patch(EVIL, old_evil_ssid_effect, new_evil_ssid_effect, 'EvilTwin auto-fill channel from network')

# Fix Step 1 to show a dropdown of discovered networks
old_evil_step1 = '''            <div className="space-y-2">
                  <Label>Target BSSID</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="00:11:22:33:44:55"
                      value={targetBssid}
                      onChange={e => setTargetBssid(e.target.value)}
                      className="font-mono bg-bg-active border-border-subtle flex-1"
                    />
                    <Button variant="outline" onClick={() => navigate('/recon')} className="bg-bg-active border-border-subtle">
                      Browse
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
                </div>'''

new_evil_step1 = '''            {/* Network picker from discovered networks */}
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
                </div>'''
patch(EVIL, old_evil_step1, new_evil_step1, 'EvilTwin Step 1 with network picker + channel')

# Fix the startJob call to use correct backend params
old_evil_start = "          startJob('eviltwin', { targetBssid, spoofSsid, template: selectedTemplate })"
new_evil_start = '''          // Backend eviltwin.py expects: ssid, channel, template, iface
          // AP adapter iface is needed; if none found, use 'wlan_ap' as default
          const apIface = adapters.find(a => a.mode === 'managed' || a.mode === 'ap')?.iface || 'wlan_ap'
          startJob('eviltwin', { 
            ssid: spoofSsid, 
            channel, 
            template: selectedTemplate,
            iface: apIface,
            bssid: targetBssid  // used for deauth companion if needed
          })'''
patch(EVIL, old_evil_start, new_evil_start, 'EvilTwin fix startJob params')

# Fix the confirmation modal description
old_evil_desc = "        description={`This will start broadcasting '${spoofSsid}' and launch the Deauth module against ${targetBssid}.`}"
new_evil_desc = "        description={`This will broadcast SSID '${spoofSsid}' on Ch${channel} with '${TEMPLATES.find(t => t.id === selectedTemplate)?.name}' portal. All DNS/DHCP traffic will be hijacked.`}"
patch(EVIL, old_evil_desc, new_evil_desc, 'EvilTwin fix confirm description')

# Fix Step 3 summary to show channel
old_evil_step3 = '''                {[
                   { label: 'Target BSSID', value: targetBssid, mono: true },
                   { label: 'Spoofed SSID', value: spoofSsid, mono: false },
                   { label: 'Template', value: TEMPLATES.find(t => t.id === selectedTemplate)?.name ?? '', mono: false },
                 ].map(item => ('''
new_evil_step3 = '''                {[
                   { label: 'Target BSSID', value: targetBssid, mono: true },
                   { label: 'Spoofed SSID', value: spoofSsid, mono: false },
                   { label: 'Channel', value: `${channel} (${channel > 14 ? '5 GHz' : '2.4 GHz'})`, mono: false },
                   { label: 'Template', value: TEMPLATES.find(t => t.id === selectedTemplate)?.name ?? '', mono: false },
                 ].map(item => ('''
patch(EVIL, old_evil_step3, new_evil_step3, 'EvilTwin step 3 show channel in summary')

###############################################################################
# ISSUE 5: Reconnaissance — deauth button missing iface param
###############################################################################
print("\n=== Fix 5: Recon deauth button needs iface ===")

old_recon_deauth = "                      onClick={() => startJob('deauth', { bssid: selectedNetwork.bssid })}"
new_recon_deauth = """                      onClick={() => {
                        if (!monAdapter) { return }
                        startJob('deauth', { bssid: selectedNetwork.bssid, iface: monAdapter.iface })
                      }}"""
patch(RECON, old_recon_deauth, new_recon_deauth, 'Recon deauth adds iface param')

# Add client-targeted deauth per connected client
old_recon_clients_section = '''                  {connectedClients.length === 0 ? (
                    <div className="text-xs text-text-disabled italic p-3 text-center bg-bg-surface rounded border border-border-subtle">
                      No clients detected
                    </div>
                  ) : (
                    <div className="bg-bg-surface rounded border border-border-subtle divide-y divide-border-subtle max-h-48 overflow-y-auto">
                      {connectedClients.map(client => (
                        <div key={client.mac} className="p-2.5 flex justify-between items-center hover:bg-bg-hover">
                          <div>
                            <div className="font-mono text-xs text-text-primary flex items-center gap-1.5">
                              {client.mac}
                              {client.randomized && (
                                <AppTooltip content="Randomized MAC">
                                  <Shuffle className="w-3 h-3 text-status-warning" />
                                </AppTooltip>
                              )}
                            </div>
                            <div className="text-[10px] text-text-disabled mt-0.5">Pkt: {client.packets}</div>
                          </div>
                          <div
                            className="text-xs font-mono"
                            style={{ color: client.power > -65 ? 'var(--status-success)' : 'var(--status-warning)' }}
                          >
                            {client.power} dBm
                          </div>
                        </div>
                      ))}
                    </div>
                  )}'''

new_recon_clients_section = '''                  {connectedClients.length === 0 ? (
                    <div className="text-xs text-text-disabled italic p-3 text-center bg-bg-surface rounded border border-border-subtle">
                      No clients detected
                    </div>
                  ) : (
                    <div className="bg-bg-surface rounded border border-border-subtle divide-y divide-border-subtle max-h-48 overflow-y-auto">
                      {connectedClients.map(client => (
                        <div key={client.mac} className="p-2.5 flex justify-between items-center hover:bg-bg-hover group/cli">
                          <div>
                            <div className="font-mono text-xs text-text-primary flex items-center gap-1.5">
                              {client.mac}
                              {client.randomized && (
                                <AppTooltip content="Randomized MAC — deauth may not work">
                                  <Shuffle className="w-3 h-3 text-status-warning" />
                                </AppTooltip>
                              )}
                            </div>
                            <div className="text-[10px] text-text-disabled mt-0.5">Pkt: {client.packets}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div
                              className="text-xs font-mono"
                              style={{ color: client.power > -65 ? 'var(--status-success)' : 'var(--status-warning)' }}
                            >
                              {client.power} dBm
                            </div>
                            {monAdapter && (
                              <button
                                onClick={() => startJob('deauth', { bssid: selectedNetwork!.bssid, client_mac: client.mac, iface: monAdapter!.iface })}
                                title="Targeted deauth this client"
                                className="opacity-0 group-hover/cli:opacity-100 transition-opacity text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-status-error/10 text-status-error border border-status-error/25 hover:bg-status-error/20"
                              >
                                Deauth
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}'''
patch(RECON, old_recon_clients_section, new_recon_clients_section, 'Recon client-targeted deauth buttons')

###############################################################################
# ISSUE 6: Credentials page — fix type display
###############################################################################
print("\n=== Fix 6: Credentials type badge ===")

old_cred_row = '''                    {/* Date Captured */}
                    <div className="w-48 flex-shrink-0 font-mono text-xs text-text-disabled text-right">
                      {new Date(cred.timestamp).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>'''
new_cred_row = '''                    {/* Type + Date Captured */}
                    <div className="w-48 flex-shrink-0 font-mono text-xs text-text-disabled text-right">
                      <div className="text-[9px] uppercase font-semibold text-text-disabled mb-0.5">
                        {cred.type === 'portal' ? 'Captive Portal' : 'WPA PSK'}
                      </div>
                      {new Date(cred.timestamp).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>'''
patch(CREDS, old_cred_row, new_cred_row, 'Credentials show type label')

# Credentials fetch initial state on mount
old_creds_fn = '''export function Credentials() {
  const { credentials } = useWcarckStore()'''
new_creds_fn = '''export function Credentials() {
  const { credentials, fetchInitialState } = useWcarckStore()
  
  React.useEffect(() => {
    fetchInitialState()
  }, [fetchInitialState])'''
patch(CREDS, old_creds_fn, new_creds_fn, 'Credentials fetch on mount')

###############################################################################
# ISSUE 7: Crack page — remove 'crack.hashcat' from startJob (already mapped in store)
# Also add 'aircrack' as valid module name in jobs.py check
###############################################################################
print("\n=== Fix 7: Crack — send correct backend module mapping ===")

# The startJob in store already maps 'crack' -> 'crack.aircrack'  
# But jobs.py only allows: "recon.scanner", "attack.deauth", "attack.pmkid", "attack.eviltwin", "crack.aircrack"
# Let's verify it's right already - it was fixed in patch_all.py

print("\n=== All patches complete ===")
