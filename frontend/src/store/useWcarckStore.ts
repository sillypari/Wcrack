import { create } from 'zustand'
import { subscribeWithSelector, persist, createJSONStorage } from 'zustand/middleware'
import { toast } from 'sonner'

export type Adapter = {
  iface: string
  mac: string
  mode: string
  bands: number[]
  role: string
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
  logs: LogEntry[]
  sessionStartedAt: number | null
  activeScopeId: number | null
  projects: Project[]
  activeProjectId: number | null
  uiState: UiState
  simulatorRunning: boolean
}

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
  fetchInitialState: () => Promise<void>
  fetchProjects: () => Promise<void>
  createProject: (name: string, client?: string, notes?: string) => Promise<void>
  activateProject: (id: number) => Promise<void>
  deleteProject: (id: number) => Promise<void>
  fetchSimulatorStatus: () => Promise<void>
  toggleSimulator: () => Promise<void>
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
        logs: [],
        sessionStartedAt: null,
        activeScopeId: null,
        projects: [],
        activeProjectId: null,
        simulatorRunning: false,
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

        fetchInitialState: async () => {
          try {
            await get().fetchProjects()
            await get().fetchSimulatorStatus()
            
            const res = await Promise.all([
              fetch('http://127.0.0.1:8080/api/adapters').then(r => r.ok ? r.json() : []),
              fetch('http://127.0.0.1:8080/api/networks/aps').then(r => r.ok ? r.json() : []),
              fetch('http://127.0.0.1:8080/api/networks/clients').then(r => r.ok ? r.json() : []),
              fetch('http://127.0.0.1:8080/api/captures').then(r => r.ok ? r.json() : []),
              fetch('http://127.0.0.1:8080/api/credentials').then(r => r.ok ? r.json() : []),
              fetch('http://127.0.0.1:8080/api/jobs').then(r => r.ok ? r.json() : []),
            ])
            
            const [adaptersList, networksList, clientsList, captures, credentials, activeJobs] = res
            
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
            networksList.forEach((n: Network) => networks.set(n.bssid, n))
            
            const clients = new Map<string, Client>()
            clientsList.forEach((c: Client) => clients.set(c.mac, c))

            set({ adapters, networks, clients, captures, credentials, activeJobs })
          } catch {
            // Silent fallback, wait for WS history
          }
        },

        connectWebSocket: () => {
          const ws = new WebSocket('ws://127.0.0.1:8080/ws/events')
          
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
          
          switch (event.topic) {
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
            }
            case 'adapter.state_changed': {
              const adapters = [...state.adapters]
              const idx = adapters.findIndex(a => a.iface === event.payload.iface)
              if (idx >= 0) adapters[idx] = { ...adapters[idx], ...event.payload }
              else adapters.push(event.payload)
              newState.adapters = adapters
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
          }

          // All events that have a message/level might be logs
          if (event.level && event.message) {
             const logs = [event as LogEntry, ...state.logs].slice(0, MAX_LOGS)
             newState.logs = logs
          }

          return newState
        }),

        syncHistory: (events) => set((state) => {
          const sorted = [...events].sort((a, b) => a.seq - b.seq)
          
          for (const ev of sorted) {
            if (ev.seq > state.lastEventSeq) {
              get().processEvent(ev)
            }
          }
          return {}
        }),

        startJob: async (moduleName, params) => {
          try {
            let backendModuleName = moduleName
            let handlerName = 'start'
            if (moduleName === 'recon') {
              backendModuleName = 'recon.scanner'
              handlerName = 'start_scan'
            } else if (moduleName === 'deauth') {
              backendModuleName = 'attack.deauth'
              handlerName = 'start_deauth'
            } else if (moduleName === 'pmkid') {
              backendModuleName = 'attack.pmkid'
              handlerName = 'start_pmkid'
            } else if (moduleName === 'eviltwin') {
              backendModuleName = 'attack.eviltwin'
              handlerName = 'start_eviltwin'
            } else if (moduleName === 'crack') {
              backendModuleName = 'crack.hashcat'
              handlerName = 'start_crack'
            }

            const res = await fetch('http://127.0.0.1:8080/api/jobs/start', {
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
            const res = await fetch(`http://127.0.0.1:8080/api/jobs/${jobId}/stop`, { method: 'POST' })
            if (!res.ok) throw new Error(await res.text())
            // No confirm modal or success toast for stop per D88/spec, UI updates via WS
          } catch (e) {
             const err = e as Error
             toast.error(`Failed to stop job: ${err.message}`)
          }
        },

        fetchProjects: async () => {
          try {
            const res = await fetch('http://127.0.0.1:8080/api/projects')
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
            const res = await fetch('http://127.0.0.1:8080/api/projects', {
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

        activateProject: async (id) => {
          try {
            const res = await fetch(`http://127.0.0.1:8080/api/projects/${id}/activate`, {
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

        deleteProject: async (id) => {
          try {
            const res = await fetch(`http://127.0.0.1:8080/api/projects/${id}`, {
              method: 'DELETE'
            })
            if (!res.ok) {
              const err = await res.text()
              throw new Error(err || "Failed to delete project")
            }
            toast.success("Project deleted")
            await get().fetchProjects()
            if (get().activeProjectId === id) {
              set({ activeProjectId: null })
              await get().fetchInitialState()
            }
          } catch (e) {
            const err = e as Error
            toast.error(`Failed to delete project: ${err.message}`)
          }
        },

        fetchSimulatorStatus: async () => {
          try {
            const res = await fetch('http://127.0.0.1:8080/api/simulator/status')
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
            const res = await fetch('http://127.0.0.1:8080/api/simulator/toggle', { method: 'POST' })
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
        }
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
