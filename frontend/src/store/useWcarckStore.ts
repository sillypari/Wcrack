import { create } from 'zustand'
import { subscribeWithSelector, persist, createJSONStorage } from 'zustand/middleware'
import { toast } from 'sonner'

export type Adapter = {
  iface: string
  mac: string
  mode: string
  bands: number[]
  role: string
  capabilities?: {
    monitor: boolean
    ap: boolean
    injection: number
    '5ghz': boolean
    tested_at: number
  }
  chipset: string
  driver: string
  channel: number
  rssi: number
  rx: number
  tx: number
  status: 'up' | 'down' | 'scanning' | 'injecting'
  lastSeen: number
}

export type Network = {
  bssid: string
  ssid: string
  channel: number
  encryption: string
  cipher: string
  auth: string
  pmf: boolean
  power: number
  beacons: number
  data: number
  lastSeen: number
}

export type Client = {
  mac: string
  bssid: string
  power: number
  packets: number
  lastSeen: number
  randomized: boolean
}

export type Job = {
  id: string
  type: string
  target: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  startedAt: number
  framesSent: number
  packetsPerSec: number
  acks?: number
  speed?: string
  eta?: string
  status_message?: string
  connected?: number
  dhcpLeases?: number
  dhcp_leases?: number
  eapolM1?: boolean
  eapolM2?: boolean
  eapolM3?: boolean
  eapolM4?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any
}

export type Wordlist = {
  name: string
  path: string
  size: number
  type: string
}

export type Capture = {
  id: string
  bssid: string
  ssid: string
  type: 'eapol' | 'pmkid' | 'wep'
  status: 'Valid' | 'Partial' | 'Invalid'
  filePath: string
  timestamp: number
  eapolM1: boolean
  eapolM2: boolean
  eapolM3: boolean
  eapolM4: boolean
  sizeBytes?: number
  sha256?: string
}

export type Credential = {
  id: string
  bssid: string
  ssid: string
  clientMac: string
  username: string
  passwordHash: string
  plainText: string
  type: 'wpa_psk' | 'portal'
  valid: boolean
  vendor?: string
  timestamp: number
}

export type Project = {
  id: number
  name: string
  client?: string
  notes?: string
  created_at: string
  active: boolean
}


export type LogEntry = {
  id: string
  seq: number
  timestamp: number
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'
  channel: 'RF' | 'System' | 'DB' | 'Portal' | 'Process'
  event_type: string
  message: string
  job_id: string | null
  mac_address: string | null
  adapter_iface: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
  stack_trace: string | null
  session_id: string
}

export type UiState = {
  sidebarPinned: boolean
  lastActionBarDismissed: number | null
  focusedJobId: string | null
  focusedNetworkBssid: string | null
  audioEnabled: boolean
  highContrast: boolean
  focusMode: boolean
}

interface SystemState {
  wsConnected: boolean
  wsReconnectAttempts: number
  lastEventSeq: number
  adapters: Adapter[]
  networks: Map<string, Network>
  clients: Map<string, Client>
  activeJobs: Job[]
  captures: Capture[]
  credentials: Credential[]
  wordlists: Wordlist[]
  logs: LogEntry[]
  sessionStartedAt: number | null
  activeScopeId: number | null
  projects: Project[]
  activeProjectId: number | null
  uiState: UiState
}
// simulatorRunning removed — simulator backend was deleted

interface WcarckStore extends SystemState {
  connectWebSocket: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  processEvent: (event: any) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  syncHistory: (events: any[]) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startJob: (moduleName: string, params: any) => Promise<void>
  stopJob: (jobId: string) => Promise<void>
  setUiState: (partial: Partial<UiState>) => void
  dismissActionBar: () => void
  toggleSidebar: () => void
  toggleFocusMode: () => void
  toggleAudio: () => void
  clearLogs: () => void
  fetchInitialState: () => Promise<void>
  fetchWordlists: () => Promise<void>
  fetchProjects: () => Promise<void>
  createProject: (name: string, client?: string, notes?: string) => Promise<void>
  updateProject: (id: number, name: string, client?: string, notes?: string) => Promise<void>
  activateProject: (id: number) => Promise<void>
  deleteProject: (id: number) => Promise<void>
  
  // Hardware specific
  setRole: (iface: string, role: string) => Promise<void>
  runDiagnostics: (iface: string) => Promise<void>
  checkKill: () => Promise<void>
  restoreNetwork: () => Promise<void>
  checkKillOutput: string | null
  restoreOutput: string | null
}

const MAX_LOGS = 200

export const useWcarckStore = create<WcarckStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        wsConnected: false,
        wsReconnectAttempts: 0,
        lastEventSeq: 0,
        adapters: [],
        networks: new Map(),
        clients: new Map(),
        activeJobs: [],
        captures: [],
        credentials: [],
        wordlists: [],
        logs: [],
        sessionStartedAt: null,
        activeScopeId: null,
        projects: [],
        activeProjectId: null,
        checkKillOutput: null,
        restoreOutput: null,

        uiState: {
          sidebarPinned: false,
          lastActionBarDismissed: null,
          focusedJobId: null,
          focusedNetworkBssid: null,
          audioEnabled: false,
          highContrast: false,
          focusMode: false,
        },

        setUiState: (partial) =>
          set((state) => ({ uiState: { ...state.uiState, ...partial } })),

        dismissActionBar: () =>
          set((state) => ({
            uiState: { ...state.uiState, lastActionBarDismissed: Date.now() },
          })),

        toggleSidebar: () =>
          set((state) => ({
            uiState: { ...state.uiState, sidebarPinned: !state.uiState.sidebarPinned },
          })),

        toggleFocusMode: () =>
          set((state) => ({
            uiState: { ...state.uiState, focusMode: !state.uiState.focusMode },
          })),

        toggleAudio: () =>
          set((state) => ({
            uiState: { ...state.uiState, audioEnabled: !state.uiState.audioEnabled },
          })),

        clearLogs: () => set({ logs: [] }),

        fetchInitialState: async () => {
          try {
            await get().fetchProjects()
            
            const res = await Promise.all([
              fetch('http://127.0.0.1:8000/api/adapters').then(r => r.ok ? r.json() : []),
              fetch('http://127.0.0.1:8000/api/networks/aps').then(r => r.ok ? r.json() : []),
              fetch('http://127.0.0.1:8000/api/networks/clients').then(r => r.ok ? r.json() : []),
              fetch('http://127.0.0.1:8000/api/captures').then(r => r.ok ? r.json() : []),
              fetch('http://127.0.0.1:8000/api/credentials').then(r => r.ok ? r.json() : []),
              fetch('http://127.0.0.1:8000/api/jobs').then(r => r.ok ? r.json() : []),
            ])
            
            const [adaptersList, networksList, clientsList, captures, credentials, jobsList] = res
            
            const activeJobs = jobsList.filter((j: any) => j.status === 'running' || j.status === 'starting' || j.status === 'queued')
            
            const adapters = adaptersList.map((a: any) => ({
              iface: a.iface_name,
              mac: a.mac,
              mode: a.current_mode || 'managed',
              bands: a.bands || [2.4, 5],
              role: a.role || '',
              chipset: a.chipset || 'Unknown',
              driver: a.driver || 'Unknown',
              channel: a.channel || 0,
              rssi: a.rssi || 0,
              rx: a.rx || 0,
              tx: a.tx || 0,
              status: a.status || 'up',
              lastSeen: a.lastSeen || Date.now()
            }))
            
            const networks = new Map<string, Network>()
            networksList.forEach((n: any) => networks.set(n.bssid, {
              ...n,
              encryption: n.encryption || n.privacy || '',
              power: n.power ?? n.signal_dbm ?? 0,
              channel: n.channel || 0,
              ssid: n.ssid || '',
              bssid: n.bssid || '',
              cipher: n.cipher || '',
              auth: n.auth || '',
              beacons: n.beacons || 0,
              wps: n.wps || false,
              firstSeen: n.firstSeen || n.first_seen || Date.now(),
              lastSeen: n.lastSeen || n.last_seen || Date.now(),
            } as Network))
            
            const clients = new Map<string, Client>()
            clientsList.forEach((c: Client) => clients.set(c.mac, c))

            // Normalize credentials from backend format
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
              sizeBytes: c.size_bytes || 0,
              sha256: c.sha256 || 'unknown',
            })) as any[]
            
            set({ adapters, networks, clients, captures: normCaptures, credentials: normCredentials, activeJobs })
          } catch {
            // Silent fallback, wait for WS history
          }
        },

        connectWebSocket: () => {
          const ws = new WebSocket('ws://127.0.0.1:8000/ws/events')
          
          ws.onopen = () => {
            set({ wsConnected: true, wsReconnectAttempts: 0, sessionStartedAt: Date.now() })
            // Request history sync on connect
            ws.send(JSON.stringify({ type: 'request_history', fromSeq: get().lastEventSeq }))
            // Bootstrap initial state (adapters, networks, captures, etc.)
            get().fetchInitialState()
          }

          ws.onclose = () => {
            set((state) => ({
              wsConnected: false,
              wsReconnectAttempts: state.wsReconnectAttempts + 1
            }))
            // Reconnect logic
            const attempts = get().wsReconnectAttempts
            const delay = Math.min(1000 * Math.pow(2, attempts), 30000)
            setTimeout(() => get().connectWebSocket(), delay)
          }

          ws.onmessage = (msg) => {
            try {
              const data = JSON.parse(msg.data)
              if (data.type === 'history_sync') {
                get().syncHistory(data.events)
              } else if (data.type === 'event' || data.seq) {
                get().processEvent(data.event || data)
              }
            } catch {
              // Ignore parse errors
            }
          }
        },

        processEvent: (event) => set((state) => {
          if (event.seq <= state.lastEventSeq) return state

          const newState = { lastEventSeq: event.seq } as Partial<SystemState>
          
          // hub.py sends normalized events: {id, seq, event_type, payload, message, level, channel...}
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
            }
            case 'adapter.state_changed':
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
                           rawModule.startsWith("attack.pmkid_crack") ? "pmkid_crack" :
                           rawModule.startsWith("attack.pmkid") ? "pmkid" :
                           rawModule.startsWith("attack.eviltwin") ? "eviltwin" :
                           rawModule.startsWith("attack.mitm") ? "mitm" :
                           (rawModule.startsWith("crack") || rawModule === "attack.crack") ? "crack" : rawModule
              
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
              const jobs = [...state.activeJobs]
              const jobId = String(evPayload?.job_id ?? event.job_id ?? '')
              const idx = jobs.findIndex(j => j.id === jobId)
              if (idx >= 0) {
                const getValidNumber = (val: any, fallback: number) => (typeof val === 'number' && !Number.isNaN(val)) ? val : fallback;
                jobs[idx] = {
                  ...jobs[idx],
                  progress: getValidNumber(evPayload?.progress_pct, getValidNumber(evPayload?.progress, jobs[idx].progress)),
                  speed: evPayload?.speed_kps ?? evPayload?.speed ?? jobs[idx].speed,
                  eta: evPayload?.eta ?? jobs[idx].eta,
                  status_message: evPayload?.status_message ?? jobs[idx].status_message,
                  connected: evPayload?.connected ?? jobs[idx].connected,
                  dhcpLeases: evPayload?.dhcp_leases ?? evPayload?.dhcpLeases ?? jobs[idx].dhcpLeases,
                }
              }
              newState.activeJobs = jobs
              break
            }
          }

          // The backend hub.py already sends a fully normalized LogEntry.
          // Fields: id, seq, timestamp, level, channel, event_type, message, job_id, mac_address, adapter_iface, payload, stack_trace, session_id
          // We just store it directly — no re-building needed.
          if (event.id && event.message) {
            const logEntry: LogEntry = {
              id: event.id,
              seq: event.seq,
              timestamp: event.timestamp || Date.now(),
              level: (event.level || 'INFO') as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL',
              channel: (event.channel || 'System') as 'RF' | 'System' | 'DB' | 'Portal' | 'Process',
              event_type: event.event_type || event.topic || '',
              message: event.message,
              job_id: event.job_id || null,
              mac_address: event.mac_address || null,
              adapter_iface: event.adapter_iface || null,
              payload: event.payload || {},
              stack_trace: event.stack_trace || null,
              session_id: event.session_id || 'live'
            }
            const logs = [logEntry, ...state.logs].slice(0, MAX_LOGS)
            newState.logs = logs
          }

          return newState
        }),

        syncHistory: (events) => set((state) => {
          const sorted = [...events].sort((a, b) => a.seq - b.seq)
          const batchState = { ...state }
          
          for (const ev of sorted) {
            if (ev.seq > state.lastEventSeq) {
              const updates = get().processEvent(ev)
              Object.assign(batchState, updates)
              batchState.lastEventSeq = Math.max(batchState.lastEventSeq, ev.seq)
            }
          }
          
          return batchState
        }),

        startJob: async (moduleName, params) => {
          try {
            let backendModuleName = moduleName
            let handlerName = 'start'
            if (moduleName === 'recon' || moduleName === 'recon.scanner') {
              backendModuleName = 'recon.scanner'
              handlerName = 'start_scan'
            } else if (moduleName === 'deauth' || moduleName === 'attack.deauth') {
              backendModuleName = 'attack.deauth'
              handlerName = 'start_deauth'
            } else if (moduleName === 'pmkid' || moduleName === 'attack.pmkid') {
              backendModuleName = 'attack.pmkid'
              handlerName = 'start_pmkid'
            } else if (moduleName === 'eviltwin' || moduleName === 'attack.eviltwin') {
              backendModuleName = 'attack.eviltwin'
              handlerName = 'start_eviltwin'
            } else if (moduleName === 'crack' || moduleName === 'crack.aircrack') {
              backendModuleName = 'crack.aircrack'
              handlerName = 'start_crack'
            } else if (moduleName === 'pmkid_crack' || moduleName === 'attack.pmkid_crack') {
              backendModuleName = 'attack.pmkid_crack'
              handlerName = 'start_pmkid_crack'
            } else if (moduleName === 'mitm' || moduleName === 'attack.mitm') {
              backendModuleName = 'attack.mitm'
              handlerName = 'start_mitm'
            }

            const res = await fetch('http://127.0.0.1:8000/api/jobs/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                module_name: backendModuleName, 
                handler_name: handlerName, 
                params,
                priority: 100
              })
            })
            if (!res.ok) throw new Error(await res.text())
            toast.success(`Job ${moduleName} started`)
          } catch (e) {
            const err = e as Error
            toast.error(`Failed to start job: ${err.message}`)
          }
        },

        stopJob: async (jobId) => {
          try {
            // Backend expects integer job IDs — coerce from string if needed
            const numericId = Number(jobId)
            if (isNaN(numericId)) throw new Error(`Invalid job ID: ${jobId}`)
            const res = await fetch(`http://127.0.0.1:8000/api/jobs/${numericId}/stop`, { method: 'POST' })
            if (!res.ok) throw new Error(await res.text())
            // UI will update via WS module.stopped event
          } catch (e) {
             const err = e as Error
             toast.error(`Failed to stop job: ${err.message}`)
          }
        },

        fetchWordlists: async () => {
          try {
            const res = await fetch('http://127.0.0.1:8000/api/wordlists')
            if (res.ok) set({ wordlists: await res.json() })
          } catch (e) {
            console.error('Failed to fetch wordlists', e)
          }
        },
        
        fetchProjects: async () => {
          try {
            const res = await fetch('http://127.0.0.1:8000/api/projects')
            if (res.ok) {
              const projects = await res.json()
              const activeProj = projects.find((p: Project) => p.active)
              set({ 
                projects, 
                activeProjectId: activeProj ? activeProj.id : null 
              })
            }
          } catch (e) {
            console.error("Failed to fetch projects", e)
          }
        },

        createProject: async (name, client, notes) => {
          try {
            const res = await fetch('http://127.0.0.1:8000/api/projects', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, client, notes })
            })
            if (!res.ok) {
              const err = await res.text()
              throw new Error(err || "Failed to create project")
            }
            toast.success(`Project ${name} created`)
            await get().fetchProjects()
          } catch (e) {
            const err = e as Error
            toast.error(`Failed to create project: ${err.message}`)
            throw e
          }
        },

        updateProject: async (id, name, client, notes) => {
          try {
            const res = await fetch(`http://127.0.0.1:8000/api/projects/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, client, notes })
            })
            if (!res.ok) throw new Error('Failed to update project')
            await get().fetchProjects()
            toast.success('Project updated successfully')
          } catch (e: any) {
            toast.error(e.message || 'Failed to update project')
            throw e
          }
        },

        activateProject: async (id) => {
          try {
            const res = await fetch(`http://127.0.0.1:8000/api/projects/${id}/activate`, {
              method: 'POST'
            })
            if (!res.ok) {
              const err = await res.text()
              throw new Error(err || "Failed to activate project")
            }
            toast.success("Project activated")
            await get().fetchProjects()
            await get().fetchInitialState()
          } catch (e) {
            const err = e as Error
            toast.error(`Failed to activate project: ${err.message}`)
          }
        },

        deleteProject: async (id: number) => {
          try {
            const res = await fetch(`http://127.0.0.1:8000/api/projects/${id}`, { method: 'DELETE' })
            if (!res.ok) throw new Error(await res.text())
            const { projects, activeProjectId } = get()
            set({ 
              projects: projects.filter(p => p.id !== id),
              activeProjectId: activeProjectId === id ? null : activeProjectId
            })
            if (activeProjectId === id) {
              set({ networks: new Map(), clients: new Map(), activeJobs: [], captures: [], credentials: [] })
            }
            toast.success('Project deleted')
          } catch (e) {
            toast.error(`Failed to delete project: ${(e as Error).message}`)
          }
        },

        setRole: async (iface: string, role: string) => {
          try {
            const res = await fetch(`http://127.0.0.1:8000/api/adapters/${iface}/role`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role })
            })
            if (!res.ok) throw new Error(await res.text())
            
            const { adapters } = get()
            set({ adapters: adapters.map(a => a.iface === iface ? { ...a, role } : a) })
            toast.success(`Role for ${iface} updated to ${role}`)
          } catch (e) {
            toast.error(`Failed to set role: ${(e as Error).message}`)
          }
        },

        runDiagnostics: async (iface: string) => {
          try {
            toast.info(`Running diagnostics on ${iface}... This may take 10-15 seconds.`)
            const res = await fetch(`http://127.0.0.1:8000/api/adapters/${iface}/diagnostics`, {
              method: 'POST'
            })
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            
            const { adapters } = get()
            set({ 
              adapters: adapters.map(a => 
                a.iface === iface 
                  ? { ...a, role: data.role, capabilities: data.capabilities } 
                  : a
              ) 
            })
            toast.success(`Diagnostics completed for ${iface}. Role auto-assigned to ${data.role}.`)
          } catch (e) {
            toast.error(`Diagnostics failed: ${(e as Error).message}`)
          }
        },

        checkKill: async () => {
          try {
            const res = await fetch('http://127.0.0.1:8000/api/adapters/check-kill', {
              method: 'POST'
            })
            if (!res.ok) {
              const err = await res.text()
              throw new Error(err || "Failed to execute check kill")
            }
            const data = await res.json()
            set({ checkKillOutput: data.output || "No output returned from check-kill", restoreOutput: null })
            toast.success("Stopped conflicting processes successfully")
          } catch (e) {
            const err = e as Error
            toast.error(`Failed to check kill: ${err.message}`)
            set({ checkKillOutput: `Error: ${err.message}` })
          }
        },

        restoreNetwork: async () => {
          try {
            const res = await fetch('http://127.0.0.1:8000/api/adapters/restore', {
              method: 'POST'
            })
            if (!res.ok) {
              const err = await res.text()
              throw new Error(err || "Failed to restore network services")
            }
            const data = await res.json()
            set({ restoreOutput: data.output || "Network services restarted", checkKillOutput: null })
            toast.success("Network services restored successfully")
          } catch (e) {
            const err = e as Error
            toast.error(`Failed to restore network: ${err.message}`)
            set({ restoreOutput: `Error: ${err.message}` })
          }
        },


      }),
      {
        name: 'wcarck-storage',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          uiState: state.uiState,
          lastEventSeq: state.lastEventSeq
        }),
      }
    )
  )
)
