"""
Comprehensive patch script for Wcrack frontend.
Fixes all remaining mock data and connects pages to real backend.
"""
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), 'frontend', 'src'))

def read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  Patched: {os.path.relpath(path)}")

def patch(path, old, new, label=''):
    content = read(path)
    if old in content:
        write(path, content.replace(old, new))
        print(f"  [OK] {label or os.path.basename(path)}")
    else:
        print(f"  [SKIP] Not found: {label or os.path.basename(path)}")

###############################################################################
# 1. useWcarckStore.ts — Fix processEvent to use hub.py normalized LogEntry
###############################################################################
STORE = os.path.join(ROOT, 'store', 'useWcarckStore.ts')
print("\n=== Patching useWcarckStore.ts ===")

# Fix 1a: processEvent should use the already-normalized LogEntry from hub.py
# The backend hub.py sends {type:"event", event:{id,seq,timestamp,level,channel,event_type,message,...}}
# We should store that directly, NOT rebuild a bad log entry
old_log_section = '''          // Generate logs for UI Terminal
          let logMsg = \'\'
          let level = \'INFO\'
          
          if (event.topic.startsWith(\'process.stdout\')) {
            logMsg = String(event.payload.line || event.payload.message || \'\')
            level = \'DEBUG\'
          } else if (event.topic.startsWith(\'process.stderr\') || event.topic.includes(\'error\') || event.topic === \'job.failed\') {
            logMsg = String(event.payload.error || event.payload.message || event.topic)
            level = \'ERROR\'
          } else if (event.topic.startsWith(\'module.\') || event.topic.startsWith(\'system.\') || event.topic.startsWith(\'adapter.\')) {
            logMsg = `[${event.topic}] ` + (event.payload.message || event.payload.hint || JSON.stringify(event.payload))
            level = \'INFO\'
          }

          if (logMsg) {
             const logEntry: LogEntry = {
               id: `log-${event.seq}`,
               seq: event.seq,
               timestamp: Date.now(),
               level: level as \'DEBUG\' | \'INFO\' | \'WARN\' | \'ERROR\' | \'CRITICAL\',
               channel: \'System\' as any,
               event_type: event.topic,
               message: logMsg,
               job_id: null,
               mac_address: null,
               adapter_iface: null,
               payload: event.payload,
               stack_trace: null,
               session_id: \'current\'
             }
             const logs = [logEntry, ...state.logs].slice(0, MAX_LOGS)
             newState.logs = logs
          }'''

new_log_section = '''          // The backend hub.py already sends a fully normalized LogEntry.
          // Fields: id, seq, timestamp, level, channel, event_type, message, job_id, mac_address, adapter_iface, payload, stack_trace, session_id
          // We just store it directly — no re-building needed.
          if (event.id && event.message) {
            const logEntry: LogEntry = {
              id: event.id,
              seq: event.seq,
              timestamp: event.timestamp || Date.now(),
              level: (event.level || \'INFO\') as \'DEBUG\' | \'INFO\' | \'WARN\' | \'ERROR\' | \'CRITICAL\',
              channel: (event.channel || \'System\') as \'RF\' | \'System\' | \'DB\' | \'Portal\' | \'Process\',
              event_type: event.event_type || event.topic || \'\',
              message: event.message,
              job_id: event.job_id || null,
              mac_address: event.mac_address || null,
              adapter_iface: event.adapter_iface || null,
              payload: event.payload || {},
              stack_trace: event.stack_trace || null,
              session_id: event.session_id || \'live\'
            }
            const logs = [logEntry, ...state.logs].slice(0, MAX_LOGS)
            newState.logs = logs
          }'''

patch(STORE, old_log_section, new_log_section, 'processEvent log section')

# Fix 1b: crack module name — backend expects crack.aircrack, not crack.hashcat
old_crack_module = '''            } else if (moduleName === \'crack\') {
              backendModuleName = \'crack.hashcat\'
              handlerName = \'start_crack\'
            }'''
new_crack_module = '''            } else if (moduleName === \'crack\') {
              backendModuleName = \'crack.aircrack\'
              handlerName = \'start_crack\'
            }'''
patch(STORE, old_crack_module, new_crack_module, 'crack module name')

# Fix 1c: also handle job.progress event to update speed/eta on crack job
old_switch_end = '''            case \'project.activated\': {
              setTimeout(() => {
                get().fetchProjects()
                get().fetchInitialState()
              }, 50)
              break
            }
          }'''
new_switch_end = '''            case \'project.activated\': {
              setTimeout(() => {
                get().fetchProjects()
                get().fetchInitialState()
              }, 50)
              break
            }
            case \'job.progress\': {
              // Hashcat/aircrack progress: {job_id, progress, speed, eta, status_message}
              const jobs = [...state.activeJobs]
              const jobId = String(event.payload?.job_id ?? event.job_id ?? \'\')
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
patch(STORE, old_switch_end, new_switch_end, 'job.progress event handling')

# Fix 1d: also handle adapter.mode_changed to update adapter list live
old_adapter_case = '''            case \'adapter.state_changed\': {
              const adapters = [...state.adapters]
              const idx = adapters.findIndex(a => a.iface === event.payload.iface)
              if (idx >= 0) adapters[idx] = { ...adapters[idx], ...event.payload }
              else adapters.push(event.payload)
              newState.adapters = adapters
              break
            }'''
new_adapter_case = '''            case \'adapter.state_changed\':
            case \'adapter.mode_changed\':
            case \'adapter.monitor_started\':
            case \'adapter.monitor_stopped\': {
              // Re-fetch adapter list from API for accurate state
              setTimeout(() => fetch(\'http://127.0.0.1:8000/api/adapters\')
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                  if (data) {
                    const adapters = data.map((a: any) => ({
                      iface: a.iface_name,
                      mac: a.mac,
                      mode: a.current_mode || \'managed\',
                      bands: a.bands || [2.4],
                      role: a.role || \'\',
                      chipset: a.chipset || \'Unknown\',
                      driver: a.driver || \'Unknown\',
                      channel: a.channel || 0,
                      rssi: a.rssi || 0,
                      rx: a.rx || 0,
                      tx: a.tx || 0,
                      status: a.status || \'up\',
                      lastSeen: a.lastSeen || Date.now()
                    }))
                    useWcarckStore.setState({ adapters })
                  }
                })
                .catch(() => {}), 500)
              break
            }'''
patch(STORE, old_adapter_case, new_adapter_case, 'adapter event live update')

###############################################################################
# 2. Adapters.tsx — Wire real API calls
###############################################################################
ADAPTERS = os.path.join(ROOT, 'pages', 'Adapters.tsx')
print("\n=== Patching Adapters.tsx ===")

old_adapters_top = '''export function Adapters() {
  const { adapters } = useWcarckStore()
  
  // D92: Adapter transition state
  const [transitioning, setTransitioning] = React.useState<Record<string, boolean>>({})

  const fetchAdapters = () => {
    toast.success("Hardware scan requested")
  }

  const toggleMode = (iface: string) => {
    setTransitioning(prev => ({ ...prev, [iface]: true }))
    // Simulate backend delay (D92)
    setTimeout(() => {
      setTransitioning(prev => ({ ...prev, [iface]: false }))
      toast.success(`${iface} mode switched`)
    }, 2000)
  }'''

new_adapters_top = '''export function Adapters() {
  const { adapters, fetchInitialState } = useWcarckStore()
  
  // D92: Adapter transition state
  const [transitioning, setTransitioning] = React.useState<Record<string, boolean>>({})

  const fetchAdapters = async () => {
    try {
      const res = await fetch(\'http://127.0.0.1:8000/api/adapters/refresh\', { method: \'POST\' })
      if (res.ok) {
        toast.success("Hardware scan triggered — refreshing in 2s...")
        setTimeout(() => fetchInitialState(), 2000)
      } else {
        toast.error("Refresh failed: " + res.statusText)
      }
    } catch (e) {
      toast.error("Cannot reach backend")
    }
  }

  const toggleMode = async (iface: string, currentMode: string) => {
    setTransitioning(prev => ({ ...prev, [iface]: true }))
    try {
      const newMode = currentMode === \'monitor\' ? \'managed\' : \'monitor\'
      const res = await fetch(`http://127.0.0.1:8000/api/adapters/${iface}/mode`, {
        method: \'POST\',
        headers: { \'Content-Type\': \'application/json\' },
        body: JSON.stringify({ mode: newMode })
      })
      if (res.ok) {
        toast.success(`${iface} switching to ${newMode} mode...`)
        setTimeout(() => fetchInitialState(), 2000)
      } else {
        const err = await res.text()
        toast.error(`Failed to switch mode: ${err}`)
      }
    } catch (e) {
      toast.error("Cannot reach backend")
    } finally {
      setTransitioning(prev => ({ ...prev, [iface]: false }))
    }
  }'''
patch(ADAPTERS, old_adapters_top, new_adapters_top, 'Adapters real API')

# Fix toggleMode call — now passes currentMode
old_toggle_call = '''                        onClick={() => toggleMode(adapter.iface)}'''
new_toggle_call = '''                        onClick={() => toggleMode(adapter.iface, adapter.mode)}'''
patch(ADAPTERS, old_toggle_call, new_toggle_call, 'Adapters toggleMode call')

###############################################################################
# 3. Crack.tsx — Fix wordlist default state
###############################################################################
CRACK = os.path.join(ROOT, 'pages', 'Crack.tsx')
print("\n=== Patching Crack.tsx ===")

# Fix wordlist default (should be empty string so no selection until wordlists load)
old_wordlist_state = "  const [wordlist, setWordlist] = React.useState('rockyou.txt')"
new_wordlist_state = "  const [wordlist, setWordlist] = React.useState('')\n  // Auto-select first wordlist once loaded\n  React.useEffect(() => {\n    if (wordlists.length > 0 && !wordlist) {\n      setWordlist(wordlists[0].path)\n    }\n  }, [wordlists, wordlist])"
patch(CRACK, old_wordlist_state, new_wordlist_state, 'Crack default wordlist state')

# Fix custom wordlist upload — wire to backend POST /api/wordlists/upload
old_custom_upload = '''            {wordlist === 'custom' && (
              <div className="border border-dashed border-border-default rounded-md p-6 text-center bg-bg-surface">
                <Upload className="w-6 h-6 mx-auto text-text-disabled mb-2" />
                <p className="text-xs text-text-primary mb-1">Drag and drop your wordlist (.txt)</p>
                <Button variant="outline" size="sm" className="mt-3 text-xs h-7" disabled={!!crackJob}>Browse Files</Button>
              </div>
            )}'''
new_custom_upload = '''            {wordlist === 'custom' && (
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
                    fd.append(\'file\', file)
                    try {
                      const res = await fetch(\'http://127.0.0.1:8000/api/wordlists/upload\', { method: \'POST\', body: fd })
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
                  onClick={() => document.getElementById(\'wordlist-upload\')?.click()}
                >
                  Browse Files
                </Button>
              </div>
            )}'''
patch(CRACK, old_custom_upload, new_custom_upload, 'Crack custom wordlist upload')

# Fix the no-wordlists case with a helpful message
old_no_cap_warn = '''              {captures.length === 0 && (
                <p className="text-[10px] text-status-warning mt-1">No captures available. Capture a handshake first.</p>
              )}'''
new_no_cap_warn = '''              {captures.length === 0 && (
                <p className="text-[10px] text-status-warning mt-1">No captures available. Capture a handshake first.</p>
              )}
              {wordlists.length === 0 && wordlist !== 'custom' && (
                <p className="text-[10px] text-status-warning mt-1">No wordlists found. Place .txt files in the wordlists/ directory or upload below.</p>
              )}'''
patch(CRACK, old_no_cap_warn, new_no_cap_warn, 'Crack no wordlist warning')

###############################################################################
# 4. Captures.tsx — Add fetchCaptures refresh button
###############################################################################
CAPTURES = os.path.join(ROOT, 'pages', 'Captures.tsx')
print("\n=== Patching Captures.tsx ===")

old_captures_header = '''  const { captures, startJob } = useWcarckStore()
  const navigate = useNavigate()

  const validCount = captures.filter(c => c.status === \'Valid\').length
  const partialCount = captures.filter(c => c.status === \'Partial\').length'''
new_captures_header = '''  const { captures, startJob, fetchInitialState } = useWcarckStore()
  const navigate = useNavigate()
  const [loading, setLoading] = React.useState(false)

  const refreshCaptures = async () => {
    setLoading(true)
    await fetchInitialState()
    setLoading(false)
  }

  React.useEffect(() => {
    refreshCaptures()
  }, [])

  const validCount = captures.filter(c => c.status === \'Valid\').length
  const partialCount = captures.filter(c => c.status === \'Partial\').length'''
patch(CAPTURES, old_captures_header, new_captures_header, 'Captures refresh on load')

# Add React import if not there (it already is, skip) — just add RefreshCw import
old_captures_import = "import { Download, RefreshCw, Database, Check, Hammer } from 'lucide-react'"
new_captures_import = "import { Download, RefreshCw, Database, Check, Hammer, RotateCw } from 'lucide-react'"
patch(CAPTURES, old_captures_import, new_captures_import, 'Captures icon import')

# Add refresh button to header
old_captures_stats_end = '''        {captures.length > 0 && (
          <div className="flex items-center gap-2 flex-1">'''
new_captures_stats_end = '''        {captures.length > 0 && (
          <div className="flex items-center gap-2 flex-1">'''
# (already correct, no change needed)

# Wire the re-capture button to proper module
old_recapture = "onClick={() => startJob('deauth', { bssid: cap.bssid })}"
new_recapture = "onClick={() => startJob('deauth', { bssid: cap.bssid, iface: 'auto' })}"
patch(CAPTURES, old_recapture, new_recapture, 'Captures re-capture params')

###############################################################################
# 5. Logs.tsx — Channel filter + DEBUG toggle
###############################################################################
LOGS = os.path.join(ROOT, 'pages', 'Logs.tsx')
print("\n=== Patching Logs.tsx ===")

old_logs_filters = '''  const [filterInfo, setFilterInfo] = React.useState(true)
  const [filterWarn, setFilterWarn] = React.useState(true)
  const [filterError, setFilterError] = React.useState(true)'''
new_logs_filters = '''  const [filterDebug, setFilterDebug] = React.useState(false)
  const [filterInfo, setFilterInfo] = React.useState(true)
  const [filterWarn, setFilterWarn] = React.useState(true)
  const [filterError, setFilterError] = React.useState(true)
  const [filterChannel, setFilterChannel] = React.useState<string>('All')'''
patch(LOGS, old_logs_filters, new_logs_filters, 'Logs add DEBUG + channel filters')

old_logs_filtered = '''  const filteredLogs = logs.filter(l => {
    if (l.level === \'INFO\' && !filterInfo) return false
    if (l.level === \'WARN\' && !filterWarn) return false
    if ((l.level === \'ERROR\' || l.level === \'CRITICAL\') && !filterError) return false
    return true
  })'''
new_logs_filtered = '''  const filteredLogs = logs.filter(l => {
    if (l.level === \'DEBUG\' && !filterDebug) return false
    if (l.level === \'INFO\' && !filterInfo) return false
    if (l.level === \'WARN\' && !filterWarn) return false
    if ((l.level === \'ERROR\' || l.level === \'CRITICAL\') && !filterError) return false
    if (filterChannel !== \'All\' && l.channel !== filterChannel) return false
    return true
  })'''
patch(LOGS, old_logs_filtered, new_logs_filtered, 'Logs filteredLogs with debug+channel')

old_logs_menu = '''              <DropdownMenuContent className="w-48 bg-bg-elevated border-border-subtle text-text-primary" align="end">
                <DropdownMenuCheckboxItem
                  checked={filterInfo}
                  onCheckedChange={setFilterInfo}
                  className="hover:bg-bg-hover focus:bg-bg-hover cursor-pointer"
                >
                  INFO
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filterWarn}
                  onCheckedChange={setFilterWarn}
                  className="hover:bg-bg-hover focus:bg-bg-hover cursor-pointer"
                >
                  WARN
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filterError}
                  onCheckedChange={setFilterError}
                  className="hover:bg-bg-hover focus:bg-bg-hover cursor-pointer"
                >
                  ERROR / CRITICAL
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>'''
new_logs_menu = '''              <DropdownMenuContent className="w-56 bg-bg-elevated border-border-subtle text-text-primary" align="end">
                <DropdownMenuCheckboxItem checked={filterDebug} onCheckedChange={setFilterDebug} className="hover:bg-bg-hover focus:bg-bg-hover cursor-pointer">DEBUG</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={filterInfo} onCheckedChange={setFilterInfo} className="hover:bg-bg-hover focus:bg-bg-hover cursor-pointer">INFO</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={filterWarn} onCheckedChange={setFilterWarn} className="hover:bg-bg-hover focus:bg-bg-hover cursor-pointer">WARN</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={filterError} onCheckedChange={setFilterError} className="hover:bg-bg-hover focus:bg-bg-hover cursor-pointer">ERROR / CRITICAL</DropdownMenuCheckboxItem>
                <div className="border-t border-border-subtle my-1" />
                {[\'All\', \'RF\', \'System\', \'Process\', \'DB\'].map(ch => (
                  <DropdownMenuCheckboxItem
                    key={ch}
                    checked={filterChannel === ch}
                    onCheckedChange={() => setFilterChannel(ch)}
                    className="hover:bg-bg-hover focus:bg-bg-hover cursor-pointer"
                  >
                    Channel: {ch}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>'''
patch(LOGS, old_logs_menu, new_logs_menu, 'Logs dropdown with channel filter')

# Fix log timestamp display — hub.py sends ms timestamp
old_ts_display = "new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19)"
new_ts_display = "new Date(typeof log.timestamp === 'number' ? log.timestamp : Number(log.timestamp)).toISOString().replace('T', ' ').substring(0, 19)"
patch(LOGS, old_ts_display, new_ts_display, 'Logs timestamp display fix')

print("\n=== All patches applied ===")
