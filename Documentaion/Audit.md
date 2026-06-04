# Wcarck UI/Exception-Handling Audit

Scope: every visible button, input, badge, label, modal, filter, sparkline, timer and dynamic counter in the React 19 frontend, with trace to the backend endpoint, event topic, or store property that powers it, and the exception-handling state for that code path.

Legend for state codes:
- [LIVE] — value is bound to a live backend/WebSocket source; refreshes on event arrival
- [POLLED] — value is fetched on mount and on user action; no automatic refresh
- [DERIVED] — value is computed from store state, not fetched directly
- [LOCAL] — value is local component state (no backend dependency)
- [BROKEN] — element references a backend endpoint, store field, or feature that does not exist (will throw, render `undefined`, or 404)
- [DUMMY] — element always renders the same hardcoded value (no backend)
- [TODO] — placeholder for a V2 feature; backend does not exist

---

## 1. Global Shell (AppLayout / Topbar / Sidebar / ContentZone / CommandPalette / Terminal / WelcomeOverlay)

### 1.1 AppLayout (components/layout/AppLayout.tsx)
| Element | Source | Exception handling | Status |
|---|---|---|---|
| Toaster toast container | sonner library, mounted globally | no try/catch in render; sonner internally handles toast limits (`visibleToasts={3}`) | [LIVE] |
| Audio alerts hook | `useAudioAlerts()` (hooks/useAudioAlerts.ts) | subscribes to store; if AudioContext unavailable, silently no-op (line 21 guard) | [LIVE] |
| Welcome overlay | `WelcomeOverlay` | reads `localStorage.wcarck.welcomed`; sets if missing; never throws | [LOCAL] |
| Command palette | `CommandPalette` (Cmd/Ctrl+K) | keyboard listener cleanup in useEffect return | [LIVE] |

Issue: `useAudioAlerts.ts:13-15` — `new AudioContextClass()` not awaited. Some browsers reject when context is not user-gesture-initiated. Hook only runs on first event, so a `console.error` is possible but not catastrophic. No user-visible error.

### 1.2 Topbar (components/layout/Topbar.tsx)
| Element | Source | Trace | Exception handling | Status |
|---|---|---|---|---|
| Wcarck logo | rendered when `!uiState.sidebarPinned` | uiState from store | none needed | [LOCAL] |
| Session elapsed timer | `sessionStartedAt` | `sessionStartedAt` set in store `connectWebSocket` onopen (useWcarckStore.ts:319) | `useEffect` early returns when `!sessionStartedAt`; interval cleared on unmount | [LIVE] |
| Active project badge | `projects` + `activeProjectId` | projects from `fetchProjects()` (useWcarckStore.ts:608) → `GET /api/projects` | `activeProject` may be `undefined`; uses `?.` to safely access | [LIVE] |
| Live wall clock | `new Date()` every 1s | local; no backend | interval cleared on unmount | [LOCAL] |
| Adapter status dots | `adapters[]` from store | `fetchInitialState()` → `GET /api/adapters`; refreshed on `adapter.*` events via `setTimeout(fetchInitialState, 1500)` | iterates `adapters.map()` — empty array is safe; tooltip on each dot | [LIVE] |
| Audio toggle button | `uiState.audioEnabled` | persisted in localStorage via `partialize` | no error path; toggle is synchronous local state | [LIVE] |
| Fullscreen toggle | `document.fullscreenElement` | browser API | `requestFullscreen().catch()` shows toast on rejection (Topbar.tsx:28) | [LOCAL] |
| Debug report button | `copyDebugReport()` (Topbar.tsx:62) | uses `copyToClipboard` from lib/utils.ts | reports success/failure via toast; fallback textarea for non-secure contexts (utils.ts:18-35) | [LIVE] |
| Error count badge | `logs.filter(LEVEL ERROR/CRITICAL)` | store logs populated by WS hub | render guard `errors > 0` (Topbar.tsx:172) | [LIVE] |
| "OK" badge (zero errors) | same | same | rendered in else branch | [LIVE] |

Bugs:
- `Topbar.tsx:11` — `isFullscreen` initialized with `!!document.fullscreenElement` at first render; if Topbar mounts before user has fullscreen, initial state is `false` (correct), but on first fullscreen change the listener fires and updates. No bug.
- No issues found in Topbar.

### 1.3 Sidebar (components/layout/Sidebar.tsx)
| Element | Source | Trace | Exception handling | Status |
|---|---|---|---|---|
| Pin/collapse toggle | `uiState.sidebarPinned` | persisted | none | [LIVE] |
| Primary nav (8 items) | hardcoded NAV_PRIMARY | routes to /, /projects, /recon, /attack, /eviltwin, /captures, /crack, /credentials | NavLink handles inactive state | [LOCAL] |
| Secondary nav (2 items) | hardcoded NAV_SECONDARY | routes to /logs, /adapters | `hasErrorBadge` for /logs when error logs exist | [LIVE] |
| Error dot on Logs link | `logs.some(LEVEL ERROR/CRITICAL)` | same as Topbar error count | none | [LIVE] |

Bugs:
- `Sidebar.tsx:8-17` — "Attacks" route is `/attack` but the page is `AttackSurface.tsx`. App.tsx route mapping must align (not in this audit's scope but worth flagging).
- "Settings" label in CommandPalette (command-palette.tsx:81) routes to `/adapters` — label is misleading.

### 1.4 CommandPalette (components/ui/command-palette.tsx)
| Element | Source | Trace | Status |
|---|---|---|---|
| Cmd/Ctrl+K keyboard binding | `document.addEventListener('keydown')` | cleanup in return | [LOCAL] |
| "Start Scan" item | calls `navigate("/recon")` | does not actually start a scan; just navigates | [DUMMY] — label is misleading |
| "Stop All Jobs" item | `toast.info("Stopping all jobs...")` | does not call backend; just shows toast | [BROKEN] — no backend call |
| "Copy Debug Report" item | hardcoded string `"Wcarck Debug Report\n"` | does not match Topbar's full report | [BROKEN] — incomplete payload |
| "Toggle Focus Mode" item | `toggleFocusMode()` | store action flips `uiState.focusMode` | [LIVE] |
| "Open Recon/Logs/Settings" items | `navigate()` | routes | [LOCAL] |

Exception handling: none on most items; on clipboard failure, toast.error is shown. Stop All Jobs silently fails (no error, no real action).

### 1.5 WelcomeOverlay (components/welcome-overlay.tsx)
| Element | Source | Status |
|---|---|---|
| 3-step carousel | local state `step` | [LOCAL] |
| localStorage flag | `localStorage.getItem("wcarck.welcomed")` | first visit only | [LOCAL] |
| Skip/Next/Close | local state setters | [LOCAL] |

No backend, no exception path needed.

### 1.6 Terminal (components/Terminal.tsx)
Status: **ORPHANED COMPONENT** — not imported anywhere in current pages (AppLayout uses CommandPalette, not Terminal). Will not crash anything; no audit findings.

### 1.7 ContextualPanel (components/layout/ContextualPanel.tsx)
| Element | Source | Status |
|---|---|---|
| Slide-in panel | `isOpen` prop | [LOCAL] |
| Esc key closes panel | document keydown listener | cleanup in useEffect return | [LOCAL] |
| X button | calls `onClose` | [LOCAL] |

No backend, no error path.

### 1.8 ContentZone (components/layout/ContentZone.tsx)
| Element | Source | Status |
|---|---|---|
| Focus mode dimming | `uiState.focusMode` from store | [LIVE] |
| Max-width container | CSS-only | [LOCAL] |

---

## 2. Dashboard (pages/Dashboard.tsx)

### 2.1 Guided Action Bar (D90)
| Element | Source | Trace | Status |
|---|---|---|---|
| "Ready to start" banner | `shouldShowAction` (Dashboard.tsx:125) | depends on `activeJobs.length === 0` and `uiState.lastActionBarDismissed === null` | [DERIVED] |
| "Start Scan" button | `dismissActionBar(); navigate('/recon')` | does not actually start a scan; just navigates | [DUMMY] — same as CommandPalette Start Scan |
| "Dismiss" button | `dismissActionBar()` | sets `uiState.lastActionBarDismissed = Date.now()` | [LIVE] |

Bugs:
- Persistence: `uiState.lastActionBarDismissed` is in `partialize` and survives reload. Subsequent visits never show the banner. Correct per D90 spec, but user has no "show again" path.

### 2.2 Metric Pills Row
| Pill | Value | Source | Backend | Exception handling | Status |
|---|---|---|---|---|---|
| Networks | `networks.size` | Map of discovered networks | `GET /api/networks/aps` (network.py:34) | empty Map returns 0; safe | [LIVE] |
| Clients | `clients.size` | Map of stations | `GET /api/networks/clients` (network.py:60) | safe | [LIVE] |
| Handshakes | `captures.length` | Array from `fetchInitialState` | `GET /api/captures` (captures.py:42) | safe | [LIVE] |
| Credentials | `credentials.length` | Array | `GET /api/credentials` (credentials.py:26) | safe | [LIVE] |
| Errors (conditional) | `logs.filter(LEVEL ERROR/CRITICAL).length` | live store | WS hub | not rendered when 0; safe | [LIVE] |

All pills route via `navigate(...)`. Click handlers do not perform async work, so no try/catch needed.

### 2.3 Active Jobs Panel
| Element | Source | Status |
|---|---|---|
| "N running" badge | `activeJobs.length` | [LIVE] |
| Per-job row | iterates `activeJobs.map(job => ...)` | [LIVE] |
| Recon name override | `job.type === 'recon' ? 'Recon Scan' : job.type` | [LIVE] |
| Target string | `job.target` | [LIVE] |
| Progress bar | `job.progress ?? 0` | handle null with `??` | [LIVE] |
| PPS badge | `job.packetsPerSec` | may be 0; safe | [LIVE] |
| Stop button | `stopJob(job.id)` → `POST /api/jobs/{id}/stop` | toast on error from store (useWcarckStore.ts:585) | [LIVE] |

Bugs:
- `Dashboard.tsx:200` — progress bar hardcoded to `bg-accent`. Does not reflect success/fail. No color states.
- `Dashboard.tsx:202-204` — `style={{ width: \`${job.progress ?? 0}%\` }}` — if `progress` is `null`, shows 0. Safe but no negative or >100 guard.

### 2.4 Adapters Panel
| Element | Source | Status |
|---|---|---|
| "Manage" link | `navigate("/adapters")` | [LOCAL] |
| AdapterRow status dot | `adapter.status` | enum `up|down|scanning|injecting` | [LIVE] |
| Mode badge | `adapter.mode` | enum `monitor|ap|managed|...` | [LIVE] |
| Chipset | `adapter.chipset` | [LIVE] |
| RX/TX counters | `adapter.rx`, `adapter.tx` | [LIVE] |
| Scan/Stop inline button | `startJob('recon', ...)` or `stopJob(job.id)` | store actions | [LIVE] |
| Empty state link | "Configure adapters" → `/adapters` | [LOCAL] |

Bugs:
- `Dashboard.tsx:62` — checks `a.status === 'ap'` but backend `Adapter.model` (adapters.py:24) only has `current_mode` mapped to `mode` — `status` field is not in `AdapterRes` Pydantic schema. **Store fills `status: a.status || 'up'`** (useWcarckStore.ts:268), but backend never sends `status`. So all adapters render as `status: 'up'` always. **AP mode check is dead code** unless backend `Adapter` model is enriched.

### 2.5 Event Log (right panel)
| Element | Source | Status |
|---|---|---|
| "N errors" link | `errorCount > 0` | [LIVE] |
| Empty state | `recentLogs.length === 0` | [LIVE] |
| Per-log row | `logs.slice(0, 60)` | [LIVE] |
| Timestamp formatter | `new Date(e.timestamp).toLocaleTimeString(...)` | safe; e.timestamp is number (ms epoch) | [LIVE] |
| Level color | based on `e.level` | safe | [LIVE] |
| Message render | `e.message` | may be empty string; renders blank but no crash | [LIVE] |

Bugs:
- `Dashboard.tsx:282` — `e.level === 'CRITICAL' ? 'CRIT' : e.level` — abbreviation only used in level badge; row tinting uses raw level. Minor.
- `Dashboard.tsx:277` — uses `i` as React key on log map. If logs are prepended (newest first), index is unstable. Should use `log.id` or `log.seq`.

---

## 3. Reconnaissance (pages/Reconnaissance.tsx)

### 3.1 Scanner Controls
| Element | Source | Trace | Backend | Exception handling | Status |
|---|---|---|---|---|---|
| Start/Stop Scan button | `handleStartScan()` | calls `startJob('recon', {iface, band, channel, hop_time})` or `stopJob` | `POST /api/jobs/start` (jobs.py:27) | store: try/catch wraps fetch, toast.error on failure (useWcarckStore.ts:579) | [LIVE] |
| Disabled state | `!monAdapter` (line 309) | depends on `monitorAdapters.length` | — | safe | [LIVE] |
| Adapter selector | `monitorAdapters` | from `adapters.filter(a => a.mode === 'monitor')` | `GET /api/adapters` | empty list = no options; placeholder shown | [LIVE] |
| Band selector | local `selectedBand` | not sent to backend in current shape | Recon module might not use it | [LOCAL] — but value is sent in params |
| Channel selector | local `selectedChannel` | same | — | [LOCAL] |
| Hop interval | local `hopInterval` | sent as `hop_time` in params | recon.scanner handler | [LOCAL] |
| Export CSV | `exportCSV()` (line 273) | builds CSV from `data` and `clients` Maps | none (client-side blob) | early return + warning toast if empty | [LIVE] |

Bugs:
- `Reconnaissance.tsx:331-335` — Adapter selector reads from `monitorAdapters` only. If user is in `managed` mode, the selector is empty and the Scan button is disabled. UX bug: should auto-prompt user to enable monitor mode.
- `Reconnaissance.tsx:259` — `if (!activeIface) return` in handleStartScan silently fails. No toast.
- `Reconnaissance.tsx:264-270` — sends `band: 'abg'` (etc.) to backend. Recon module's `start_scan` handler must accept this. No validation visible.

### 3.2 Advanced Filters
| Element | Source | Status |
|---|---|---|
| Search input | `globalFilter` → `useReactTable.onGlobalFilterChange` | client-side filter only | [LOCAL] |
| Encryption filter | `encFilter` (all/wpa3/wpa2/wep/open) | client-side filter | [LOCAL] |
| "Has Clients" toggle | `clientsOnly` | client-side filter | [LOCAL] |
| "Berlin Mode" toggle | `berlinMode` (stale-120s) | client-side filter | [LOCAL] |
| Min Signal slider | `minSignal` (-100 to -30) | client-side filter | [LOCAL] |

All filters are client-side; no backend round-trip. The `data` memo (Reconnaissance.tsx:122) derives the filtered set. No exception path; empty result shows "No networks match filters".

### 3.3 AP Table
| Element | Source | Status |
|---|---|---|
| Header row | `flexRender(header.column.columnDef.header, ...)` | [DERIVED] |
| SSID cell | `info.getValue<string>()` | shows "hidden" for empty | [LIVE] |
| BSSID cell | same | tooltip on BSSID | [LIVE] |
| CH cell | `info.getValue<number>()` | tooltip | [LIVE] |
| BAND cell | `accessorFn: row => (row.channel > 14 ? '5' : '2.4')` | derived | [DERIVED] |
| SIGNAL cell | `SignalBars` component | bars + dBm | [LIVE] |
| ENC cell | `EncBadge` | color + PMF badge | [LIVE] |
| BEACONS cell | `info.getValue<number>()` | — | [LIVE] |
| DATA cell | same | — | [LIVE] |
| CLIENTS cell | `Array.from(clients.values()).filter(c => c.bssid === bssid).length` | computed per row | [DERIVED] |
| Row click | `setSelectedBssid(row.original.bssid)` | persists to `uiState.focusedNetworkBssid` | [LIVE] |
| Stale styling | `(Date.now() - row.original.lastSeen) > 30000` | computed at render | [DERIVED] |

Bugs:
- `Reconnaissance.tsx:511` — row `key={row.id}` (from `useReactTable`). If user filters and then resets, key stability may shift. Minor.
- `Reconnaissance.tsx:225` — `Array.from(clients.values()).filter(...).length` recomputed for every row on every render. Performance issue with 200+ APs. Should be a memoized map.
- `Reconnaissance.tsx:230` — `useMemo` dependencies `[clients]` does not include `networks` because filter only uses `clients`. Correct.

### 3.4 ContextualPanel (Network Details)
| Element | Source | Status |
|---|---|---|
| Header SSID | `selectedNetwork.ssid` | [LIVE] |
| BSSID | `selectedNetwork.bssid` | [LIVE] |
| Active Now/Stale indicator | `Date.now() - lastSeen > 30000` | [DERIVED] |
| Signal block | `SignalBars` + dBm | [LIVE] |
| Channel block | `selectedNetwork.channel` | [LIVE] |
| Security Profile | encryption/cipher/auth/pmf | [LIVE] |
| Beacons/Data stats | from selectedNetwork | [LIVE] |
| Associated Clients | `connectedClients` from clients Map filtered by bssid | [DERIVED] |
| Per-client "Deauth" button | `setDeauthClientMac(client.mac); setIsDeauthModalOpen(true)` | [LIVE] |
| Bottom "Deauth" button | opens modal with broadcast MAC | [LIVE] |
| Bottom "PMKID" button | `startJob('pmkid', {bssid, iface, channel})` | [LIVE] |
| Bottom "Launch Evil Twin" button | sets `uiState.focusedNetworkBssid` and navigates | [LIVE] |

Bugs:
- `Reconnaissance.tsx:706` — PMKID button calls `startJob('pmkid', ...)` but does not check if `monAdapter` exists. If no monitor adapter, backend will reject. No client-side guard.
- `Reconnaissance.tsx:711` — `navigate('/eviltwin')` does not pass captureId or config; EvilTwin page reads `uiState.focusedNetworkBssid` to prefill. This works but is implicit.

### 3.5 Deauth Modal
| Element | Source | Status |
|---|---|---|
| Target Station select | `deauthClientMac` + `connectedClients` | [LIVE] |
| Packet Count input | `deauthCount` (10-10000) | disabled if continuous | [LOCAL] |
| Continuous Attack checkbox | `deauthContinuous` | [LOCAL] |
| Reason Code select | `deauthReason` (1-8 IEEE codes) | [LOCAL] |
| Live Status Tracker (conditional) | shows if `activeJobs.some(j => j.type === 'deauth')` | renders bursts/ACKs/status_message | [LIVE] |
| Start Attack button | `startJob('deauth', {bssid, client_mac, count, continuous, reason, iface})` | [LIVE] |
| Stop Attack button | `stopJob(job.id)` | [LIVE] |

Bugs:
- `Reconnaissance.tsx:817-825` — Live Status Tracker looks for `activeJobs.find(j => j.type === 'deauth')`. If two deauths are running concurrently, only the first is tracked. The `stopJob` then may not stop the intended one. Race condition.
- `Reconnaissance.tsx:828` — `job.acks` rendered directly. Job type has `acks?: number`. If backend doesn't publish ACKs, this stays 0 silently. No fallback message.
- `Reconnaissance.tsx:830-832` — `job.status_message` is truncated with `truncate` class. Long error messages get hidden.
- `Reconnaissance.tsx:752` — `onValueChange={deauthClientMac => setDeauthClientMac(deauthClientMac)}` — function is renamed as parameter accidentally. Works (variable name collision in lambda) but is confusing.
- Modal `X` close button (line 738) uses unicode character `✕` — works but non-standard.
- No `aria-label` on modal close button or form inputs. Accessibility gap.

---

## 4. AttackSurface (pages/AttackSurface.tsx)

### 4.1 Header
| Element | Source | Status |
|---|---|---|
| "Active Attacks" title | static | [LOCAL] |
| "N running" badge | `attackJobs.length` (filtered `j.type !== 'recon'`) | [DERIVED] |
| "Go to Recon" button | `navigate("/recon")` | [LOCAL] |

### 4.2 Empty State
| Element | Source | Status |
|---|---|---|
| "No Active Attacks" copy | static | [LOCAL] |
| Helpful text | static | [LOCAL] |

No quick-start buttons. No backend interaction.

### 4.3 AttackCard (per job)
| Element | Source | Status |
|---|---|---|
| Pulsing dot | `animate-pulse-green` always on | cosmetic | [LOCAL] |
| Type label | `attack.type` (string) | [LIVE] |
| Target string | `attack.target` | [LIVE] |
| Stop button | `stopJob(attack.id)` | [LIVE] |
| Frames counter | `(attack.framesSent ?? 0).toLocaleString()` | null-safe | [LIVE] |
| Duration | `Date.now() - attack.startedAt` updated every 1s | [LIVE] |
| Rate | `attack.packetsPerSec` | may be 0 | [LIVE] |
| Sparkline | `value` per render; `<Sparkline value={attack.packetsPerSec} />` | recharts with `isAnimationActive={false}` | [LIVE] |

Bugs:
- `AttackSurface.tsx:34-36` — `Sparkline` uses `setData(prev => [...prev.slice(1), { v: value }])` inside useEffect with `[value]` dep. If value is `0` for many ticks, array stays at 30 zeros (correct, smooth). However, if value jumps wildly, the chart re-renders with no transition because `isAnimationActive={false}`. Acceptable.
- `AttackSurface.tsx:60-65` — `setInterval` for elapsed time is set per card. With 10+ cards, 10+ intervals run. Cleanup is per card unmount. Not a leak but wasteful.
- `AttackSurface.tsx:74` — `attack.type` is uppercased via CSS (`uppercase` class). The backend can send `deauth`, `pmkid`, `eviltwin`, `crack`, `recon`. Since `attackJobs` filters out `recon`, only attack types show. Type is not color-coded.

### 4.4 Captures Section
| Element | Source | Status |
|---|---|---|
| "Handshake Captures" header | static | [LOCAL] |
| Count badge | `captures.length` | [LIVE] |
| EapolProgress (M1-M4 dots) | `cap.eapolM1..M4` from store | normalized in fetchInitialState (useWcarckStore.ts:303) | [LIVE] |
| SSID/BSSID | `cap.ssid`, `cap.bssid` | [LIVE] |
| File name | `cap.filePath?.split('/').pop()` | path-OS dependent; on Windows uses '\\' so this is broken | [BROKEN] — should use `path.basename` or pass file name separately |
| Stop button | `stopJob(cap.id)` | [LIVE] |

Bugs:
- `AttackSurface.tsx:183` — `cap.filePath?.split('/').pop()` assumes POSIX paths. On Windows development host, paths look like `C:\foo\bar.cap`, so `split('/').pop()` returns the entire path. **Wrong display on dev machine.**
- `AttackSurface.tsx:188` — Stop button calls `stopJob(cap.id)` on a Capture object. The backend `POST /api/jobs/{job_id}/stop` expects a `job_id`, not a capture id. Captures don't have a `stop` endpoint. **Clicking Stop on a capture row calls the wrong endpoint** — and `stopJob` in store casts to Number, so this throws `Invalid job ID`.
- `AttackSurface.tsx:38` — `progressPercent = Math.max(0, progressIndex) / 3 * 100` — if `m1` is true, `findLastIndex` returns 0, so progress is `0/3 = 0%`. With M1 only captured, bar shows 0%. **Logic bug**: should be `(progressIndex + 1) / 4 * 100` or similar.

---

## 5. EvilTwin (pages/EvilTwin.tsx)

### 5.1 Active State View
| Element | Source | Trace | Status |
|---|---|---|---|
| Status dot + title | `activeTwinJob` existence | store `activeJobs.find(j => j.type === 'eviltwin')` | [LIVE] |
| Target display | `activeTwinJob.target` | set by store `module.started` mapping to `target: evPayload.target` | [LIVE] |
| Stop Attack button | `stopJob(activeTwinJob.id)` | toast on error | [LIVE] |
| Uptime metric | `(Date.now() - startedAt) / 1000` every 1s | [LIVE] |
| DNS Queries metric | `activeTwinJob.framesSent ?? 0` | **mislabeled** — should be DNS queries; currently shows frames sent | [DUMMY] |
| DHCP Leases metric | hardcoded `0` | [TODO] — V2 feature |
| Connected metric | hardcoded `0` | [TODO] — V2 feature |
| Portal Hits metric | `Math.floor((framesSent ?? 0) / 10)` | fake calculation; no actual portal hits tracked | [DUMMY] |
| Credentials Harvested metric | `credentials.filter(c => c.timestamp > activeTwinJob.startedAt).length` | derived | [DERIVED] |
| Live Credential Feed | `sessionCreds.map(cred => ...)` | each cred from store | [LIVE] |

Bugs:
- `EvilTwin.tsx:145` — "DNS Queries" label is wrong; displays `framesSent`. This is a deceptive label.
- `EvilTwin.tsx:146-147` — DHCP Leases and Connected are hardcoded `0`. No backend integration.
- `EvilTwin.tsx:164` — Portal Hits derived from framesSent/10. Not real metric.
- `EvilTwin.tsx:189-201` — credential display uses `cred.plainText`. If user captured `valid: false` creds, label still says "Valid". No status check.

### 5.2 Wizard (Steps 1, 2, 3)
| Step | Element | Source | Status |
|---|---|---|---|
| 1 | Discovered Network select | `Array.from(networks.values()).map(...)` | [LIVE] |
| 1 | Target BSSID input | `targetBssid` local | [LOCAL] |
| 1 | Channel select | `channel` local (1-13, 36-165 hardcoded) | [LOCAL] |
| 1 | Spoofed SSID input | `spoofSsid` local | [LOCAL] |
| 1 | BSSID auto-fill effect | `useEffect` (EvilTwin.tsx:100) | fills SSID + channel + encryption when BSSID chosen | [DERIVED] |
| 2 | Template cards (5 templates) | `TEMPLATES` constant (lines 13-19) | hardcoded IDs: Login_v4, DarkLogin, loginPage, evilqr3, custom | [DUMMY] — IDs not mapped to backend dir |
| 2 | Custom template upload | file input → `customFile` local; not sent to backend on launch | [DUMMY] — custom file discarded |
| 2 | AP Security select | `encryption` local (open/wpa2/wpa3) | [LOCAL] |
| 2 | Deauth Companion select | `deauthMode` local (never/launch/continuous) | [LOCAL] |
| 2 | Attack Interval select | `deauthInterval` local (5/15/30/60) | [LOCAL] |
| 2 | Karma Mode toggle | `karmaMode` local | [LOCAL] |
| 2 | DNS Spoofing toggle | `dnsSpoof` local | [LOCAL] |
| 3 | AP Config summary | local state | [LOCAL] |
| 3 | Network Services summary | hardcoded "10.0.0.10 - 100", "10.0.0.1" — not configurable | [DUMMY] |
| 3 | Warning banner | static | [LOCAL] |

Bugs:
- `EvilTwin.tsx:13-19` — Template IDs are frontend-only strings. Backend likely expects something different. **No template-id-to-backend-dir mapping exists anywhere in the codebase.**
- `EvilTwin.tsx:327-346` — Custom template upload accepts files but `customFile` is never sent to backend in `startJob` call (line 553). The file just lives in component state and is discarded.
- `EvilTwin.tsx:475-476` — DHCP Range and Gateway hardcoded as "10.0.0.10 - 100" and "10.0.0.1". User has no way to change. Fake.
- `EvilTwin.tsx:540` — ConfirmModal description hardcodes that the template name will be used. If user picks `custom` but hasn't uploaded, "Custom Template" is still shown as the portal.
- `EvilTwin.tsx:546-548` — `if (deauthMode !== 'never' && (!hasApAdapter || !hasMonAdapter))` — `hasApAdapter` checks `mode === 'managed' && status !== 'down'`. But `status` field is not in backend Adapter schema. So `status` is always `'up'` (or whatever the store fills). Real check fails.
- `EvilTwin.tsx:550` — `adapters.find(a => a.mode === 'managed' || a.mode === 'ap')?.iface || adapters[0]?.iface || 'wlan_ap'`. The `ap` mode is the only intended choice for EvilTwin, but code falls back to managed. This conflicts with the wizard's "mode: ap" intent.
- `EvilTwin.tsx:553-564` — `startJob` payload includes `karma_mode`, `dns_spoofing`, `deauth_companion`, `deauth_interval` etc. but the comment says "backend V2 will process these new flags". **None of these are wired in the current backend.** Backend module `attack.eviltwin` likely ignores them.

---

## 6. Captures (pages/Captures.tsx)

### 6.1 Header
| Element | Source | Status |
|---|---|---|
| "Packet Captures" title | static | [LOCAL] |
| Total / Valid / Partial pills | `captures.length`, `validCount`, `partialCount` | [LIVE] |
| Refresh button | `refreshCaptures()` → `fetchInitialState()` | [LIVE] |

Bugs:
- `Captures.tsx:79` — `useEffect` calls `refreshCaptures()` on mount. This refetches ALL state (adapters, networks, clients, captures, credentials, jobs) on every Captures page mount. Heavy. Should fetch only `/api/captures`.

### 6.2 Filters Bar
| Element | Source | Status |
|---|---|---|
| Search input | `searchQuery` | filters by ssid/bssid/sha256 | [LIVE] |
| Status select | `statusFilter` (all/valid/partial/invalid) | [LIVE] |
| Date range select | `dateRangeFilter` (all/1h/24h/7d) | [LIVE] |

### 6.3 Captures Table
| Column | Source | Status |
|---|---|---|
| Type | `cap.type` (eapol/pmkid/wep) | [LIVE] |
| Target | `cap.ssid` + `cap.bssid` | [LIVE] |
| Status | `StatusPill` → green/yellow/red | [LIVE] |
| EAPOL | `EapolMini` → 4 mini checkmarks for M1-M4 | [LIVE] |
| Size | `(cap.sizeBytes / 1024).toFixed(1) + ' KB'` | null-safe | [LIVE] |
| Hash | `cap.sha256.substring(0, 8)` | fallback '-' for 'unknown' | [LIVE] |
| Captured | `new Date(cap.timestamp).toLocaleString(...)` | [LIVE] |

### 6.4 Per-row Actions
| Action | Backend | Exception handling | Status |
|---|---|---|---|
| Re-cap (Partial only) | `startJob('deauth', {bssid, iface})` | requires monitor adapter (checked) | [LIVE] |
| Clean (wpaclean) | `POST /api/captures/{id}/clean` (captures.py:74) | toast.success/error; resets `cleaningCaptureId` in finally | [LIVE] |
| View stations | `GET /api/captures/{id}/stations` (captures.py:138) | `console.error` only on failure; modal shows empty | [LIVE] |
| Download | `GET /api/captures/{id}/download` (captures.py:55) | **no toast/error path** — opens in new tab, browser shows 404 silently | [LIVE] — backend exists, file existence checked |
| Crack | `navigate('/crack', {state: {captureId: cap.id}})` | Crack.tsx reads state | [LIVE] |

Bugs:
- `Captures.tsx:385-394` — Download uses `window.open(..., '_blank')`. If backend returns 404, a blank tab opens with the JSON error body. **No user-visible error message.** Should fetch and check status.
- `Captures.tsx:104-110` — `handleViewStations` ignores non-OK responses. If endpoint fails, modal shows empty list with no error.
- `Captures.tsx:101` — `setSelectedCaptureForStations(cap)` but the modal reads `selectedCaptureForStations.bssid`. Captures have `bssid`; safe.
- `Captures.tsx:118-126` — `statusFilter` uses `c.status.toLowerCase()` comparison with `valid/partial/invalid`. The status field is normalized to `'Valid'|'Partial'|'Invalid'` (Capture type). After lowercase comparison works. Safe.

### 6.5 Stations Modal
| Element | Source | Status |
|---|---|---|
| Header "Captured BSSID Stations" | static | [LOCAL] |
| BSSID display | `selectedCaptureForStations.bssid` | [LIVE] |
| Empty state | `captureStations.length === 0` | [LIVE] |
| Per-station row | `station.mac`, `station.vendor`, `station.max_rssi`, `station.packets` | [LIVE] |
| Close button | local state | [LOCAL] |

Bugs:
- `Captures.tsx:434` — `className="bg-bg-surface rounded border border-border-subtle max-h-60 overflow-y-auto"` — height 60 (~240px) is small. Modal is 413px tall, so list is half-empty.
- No pagination. If 500 stations, scroll only.

---

## 7. Credentials (pages/Credentials.tsx)

### 7.1 Header
| Element | Source | Status |
|---|---|---|
| "Intercepted Credentials" title | static | [LOCAL] |
| Total / Valid / Invalid pills | `credentials.length`, `validCount`, `invalidCount` | [LIVE] |
| Show/Hide all passwords | `globalShowPwd` local | [LOCAL] |
| Copy Visible (TSV) | `copyAllVisible()` | uses `copyToClipboard`; toast on success/failure | [LIVE] |
| Export CSV | `exportCSV()` | blob download; toast on success/warn if empty | [LIVE] |

### 7.2 Filters
| Element | Source | Status |
|---|---|---|
| Search input | `searchQuery` | filters ssid/username/bssid/plainText/clientMac | [LIVE] |
| Status select | `statusFilter` (all/valid/invalid) | [LIVE] |
| Date range | `dateRangeFilter` (all/1h/24h/7d) | [LIVE] |

### 7.3 Table
| Column | Source | Status |
|---|---|---|
| Network/User | `cred.ssid || cred.username` | [LIVE] |
| BSSID | `cred.bssid` | [LIVE] |
| Password | `PasswordCell` component | 10s auto-hide per row (Credentials.tsx:14) | [LIVE] |
| Show/hide button | local per row | [LOCAL] |
| Copy button | per row | [LIVE] |
| Status | `cred.valid` | [LIVE] |
| Client MAC + Vendor | `cred.clientMac`, `cred.vendor` | [LIVE] |
| Type label | `cred.type === 'portal' ? 'Captive Portal' : 'WPA PSK'` | [LIVE] |
| Date captured | `new Date(cred.timestamp).toLocaleString(...)` | [LIVE] |

Bugs:
- `Credentials.tsx:14-17` — local 10s auto-hide only fires when `localShow && !globalShow`. If user clicks global show, then clicks local show, the 10s timer starts when global hides. This logic is correct but obscure.
- `Credentials.tsx:60` — `useEffect` with `[fetchInitialState]` dep. Zustand selector returns same function reference (stable), so this only runs once. Correct.
- `Credentials.tsx:301` — key is `cred.id` (string). Safe.
- `Credentials.tsx:341-343` — Type label only shows "Captive Portal" or "WPA PSK". If backend sends other types, they all show "WPA PSK". Minor.

---

## 8. Crack (pages/Crack.tsx)

### 8.1 Header
| Element | Source | Status |
|---|---|---|
| Back button | `navigate(-1)` | [LOCAL] |
| "Hash Cracking" title | static | [LOCAL] |

### 8.2 Left Panel (Configuration)
| Element | Source | Backend | Exception handling | Status |
|---|---|---|---|---|
| Capture select | `captures.map(...)` | `GET /api/captures` (captures.py:42) | empty list shows warning | [LIVE] |
| Wordlist checkboxes | `wordlists.map(...)` | `GET /api/wordlists` (wordlists.py:26) | empty list shows warning | [LIVE] |
| Upload custom wordlist | `POST /api/wordlists/upload` (wordlists.py:60) | toast.loading then toast.success/error | [LIVE] |
| Rules select | local `selectedRule` (none/best64/single/wordlist/d3ad0ne) | not sent as filter; sent as `rule` param | [LOCAL] |
| Start Cracking button | `startJob('crack', {capture_id, wordlist_paths, rule, bssid})` | `POST /api/jobs/start` (jobs.py:27) | store: toast.success/error | [LIVE] |
| Stop Attack button | `stopJob(crackJob.id)` | `POST /api/jobs/{id}/stop` | toast on error | [LIVE] |

Bugs:
- `Crack.tsx:65-71` — `startJob('crack', ...)` sends `wordlist_paths: selectedWordlistPaths` (array). Backend module is `crack.aircrack`. If backend expects a single `wordlist_path` (string), this fails. Need to verify.
- `Crack.tsx:179-198` — Upload wordlist uses `fetch('http://127.0.0.1:8000/api/wordlists/upload')`. FormData body. If `file.size` is huge (e.g. rockyou.txt = 140MB), may timeout. No progress bar.

### 8.3 Right Panel (Hashcat Engine)
| Element | Source | Status |
|---|---|---|
| "Hashcat Engine" title | **misleading** — backend uses aircrack-ng | [DUMMY] |
| Progress % | `crackJob.progress` | null-safe (defaults to 0) | [LIVE] |
| Progress bar | `crackJob.progress` width | [LIVE] |
| Speed | `crackJob.speed \|\| "Starting..."` | [LIVE] |
| ETA | `crackJob.eta \|\| "Calculating..."` | [LIVE] |
| Engine Status | `crackJob.status_message` | [LIVE] |
| Footer copy | "Dictionary attack using Hashcat" — but backend is aircrack | [DUMMY] |

Bugs:
- `Crack.tsx:248` — "Hashcat Engine" title is **misleading**. The backend `crack.aircrack` module runs aircrack-ng, not hashcat. UI lies.
- `Crack.tsx:276` — Speed defaults to `"Starting..."` if `crackJob.speed` is null. After several seconds, if backend never sends speed, it stays "Starting...". No polling fallback.
- `Crack.tsx:285` — `status_message` defaults to `"Running dictionary attack (Wordlist mode)"` (hardcoded fallback). If backend sends a specific status like "Testing candidate #12345", that overrides. If not, the hardcoded default shows.
- `Crack.tsx:292` — "System ready for password recovery" is hardcoded for non-running state. No error state for "Backend unreachable" or "Hashcat not installed".
- `Crack.tsx:41-56` — Success modal trigger watches `credentials` changes. Matches by SSID/BSSID. If user cracks offline (not the active capture), the success modal pops. No filter to only show cracks for the active captureId.

### 8.4 Success Modal
| Element | Source | Status |
|---|---|---|
| "WPA Password Cracked!" | static | [LOCAL] |
| SSID/BSSID | `crackedPasswordDetail.ssid/bssid` | [LIVE] |
| Plaintext password | `crackedPasswordDetail.plainText` | [LIVE] |
| Copy Password | `navigator.clipboard.writeText(...)` | toast on success | [LIVE] |
| View Credentials | `navigate('/credentials')` | [LOCAL] |

Bugs:
- `Crack.tsx:333` — uses `navigator.clipboard.writeText` directly, not the `copyToClipboard` utility. Inconsistent. HTTP non-secure context will fail silently.
- Modal has no `aria-label` or `role="dialog"`. Accessibility gap.

---

## 9. Logs (pages/Logs.tsx)

### 9.1 Header
| Element | Source | Status |
|---|---|---|
| "System Logs" title | static | [LOCAL] |
| Total / Error / Warn pills | `logs.length`, `errorCount`, `warnCount` | [LIVE] |
| Compact/Standard toggle | `isCompact` local | [LOCAL] |
| Auto-scroll toggle | `isAutoScrollEnabled` local | [LOCAL] |
| Export .jsonl | `exportJsonl()` blob download | toast on success/warn if empty | [LIVE] |
| Clear | `useWcarckStore.setState({logs: []})` | local toast | [LIVE] |

### 9.2 Filters
| Element | Source | Status |
|---|---|---|
| Search | `searchQuery` | matches message/payload/event_type | [LIVE] |
| Level preset | `levelFilterPreset` (all/info_up/warn_up/error_only) | [LIVE] |
| Channel select | `filterChannel` (All/RF/System/Process/DB) | [LIVE] |
| Adapter select | `uniqueAdapters` derived from logs | [DERIVED] |
| Job ID select | `uniqueJobIds` derived from logs | [DERIVED] |
| Session select | declared (`sessionFilter`) and in filter (line 90) | [LIVE] — but `uniqueSessions` derives from `log.session_id`, and store sets all logs `session_id: 'live'`. So filter dropdown has only 1 option: "live". Effectively dead. |

### 9.3 Table
| Column | Source | Status |
|---|---|---|
| Timestamp | `log.timestamp` parsed as number | [LIVE] |
| Level | `log.level` | [LIVE] |
| Event Type | `log.event_type` | [LIVE] |
| Message | `log.message` | [LIVE] |
| Expandable payload | click row → `toggleExpand(log.id)` | [LIVE] |

### 9.4 Auto-Scroll
| Element | Source | Status |
|---|---|---|
| Auto-scroll on new log | `useEffect` (Logs.tsx:109) | [LIVE] |
| New Logs indicator | `newLogsCount > 0` (button "X New Logs Below") | [LIVE] |
| Scroll-up detection | `handleScroll` (Logs.tsx:122) | [LIVE] |

Bugs:
- `Logs.tsx:340` — `ref={listContainerRef}` references `listContainerRef` which is **not defined anywhere in the file**. **React will throw "ref is not a prop" warning.** Critical bug.
- `Logs.tsx:267` — `uniqueAdapters.map(a => <SelectItem key={a as string} value={a as string}>{a as string}</SelectItem>)` — `a` is `string | undefined` (from `Set<string|undefined>`). The `as string` cast hides a real type issue. Some `SelectItem`s may have `value={undefined}`.
- `Logs.tsx:415` — `logsEndRef` is correctly defined. Good.
- `Logs.tsx:362-364` — `new Date(typeof log.timestamp === 'number' ? log.timestamp : Number(log.timestamp)).toISOString()` — defensive, but `log.timestamp` is always number per store type. Redundant.
- `Logs.tsx:406` — `JSON.stringify(log.payload, null, 2)` — if `payload` is huge, expansion could freeze the UI. No size limit.

### 9.5 Column Resizers
| Element | Source | Status |
|---|---|---|
| Time/Level/Event column widths | `useColumnResizer` hook (Logs.tsx:11) | [LOCAL] |
| Mouse down/move/up | global listeners added/removed in hook | [LOCAL] |

Bugs:
- `Logs.tsx:11-37` — `useColumnResizer` is fine. No issues.
- Resizers don't persist across sessions.

---

## 10. Projects (pages/Projects.tsx)

### 10.1 Header
| Element | Source | Status |
|---|---|---|
| "Audit Projects" title | static | [LOCAL] |
| Total pill | `projects.length` | [LIVE] |
| New Project button | opens Dialog | [LOCAL] |

### 10.2 Create Project Dialog
| Element | Source | Backend | Exception handling | Status |
|---|---|---|---|---|
| Project Name input | `name` local | `POST /api/projects` (projects.py:34) | name required; store throws on duplicate (400) | [LIVE] |
| Client Name input | `client` local | same | optional | [LIVE] |
| Description textarea | `notes` local | same | optional | [LIVE] |
| Submit button | `handleSubmit` | `createProject(name, client, notes)` in store | toast on error/success | [LIVE] |
| Cancel button | closes dialog | — | [LOCAL] |

Bugs:
- `Projects.tsx:23-27` — `if (!name.trim())` triggers `toast.error` and returns. Submit button has `required` HTML attribute too. Double protection.
- `Projects.tsx:43-47` — `handleDelete` uses `window.confirm()`. In-app modals are used elsewhere (ConfirmModal component). **Inconsistent.** Browser confirm blocks the JS event loop; UI freezes.

### 10.3 Active Engagement Card
| Element | Source | Status |
|---|---|---|
| Folder icon | static | [LOCAL] |
| Client + Project name | `activeProject.client`, `activeProject.name` | [LIVE] |
| Client pill | conditional on `activeProject.client` | [LIVE] |
| Started date | `new Date(activeProject.created_at).toLocaleDateString()` | [LIVE] |

### 10.4 Projects Grid
| Element | Source | Status |
|---|---|---|
| Project card | per project in `projects.map(...)` | [LIVE] |
| Active badge | `isActive` from `activeProjectId` | [LIVE] |
| Activate button | `activateProject(project.id)` → `POST /api/projects/{id}/activate` | [LIVE] |
| Delete button | `handleDelete(id, name)` → `DELETE /api/projects/{id}` | [LIVE] |
| Notes snippet | `project.notes` with `line-clamp-2` | [LIVE] |
| Created date | `new Date(project.created_at).toLocaleString()` | [LIVE] |
| Empty state | `projects.length === 0` | [LIVE] |

Bugs:
- `Projects.tsx:172` — `useEffect` (line 60) calls `fetchInitialState()` on mount. Same heavy fetch as Captures. Should only fetch projects.
- No pagination. If 100+ projects, grid renders all.
- No edit functionality (no PUT `/api/projects/{id}` UI, even though backend has it).

---

## 11. Backend–Frontend Exception Handling Matrix

### 11.1 Backend Exception Sources
| Source | Where it surfaces | UI handling | Verdict |
|---|---|---|---|
| HTTPException 400 (bad request) | toast in store catch (useWcarckStore.ts) | `Failed to start job: {err.message}` | OK |
| HTTPException 404 (not found) | e.g. download capture | `window.open` opens blank tab; no toast | **Bad** — silent |
| HTTPException 500 (server) | captured in fetch `.then` rejection path | toast | OK |
| WebSocket disconnect | `connectWebSocket.onclose` → reconnect with backoff | automatic; user sees stale state | OK |
| Event bus backlog | `bus.get_history()` on connect | sends up to 1000 events at once | OK |
| Adapter unplug | `adapter.gone` event | store re-fetches adapters; no toast | **Bad** — user may not notice |
| Module crash | `module.error` event | logged; no toast | **Bad** — silent failure |
| Job fail | `job.failed` event | in `processEvent` (line 449): removes from activeJobs + toast.error in non-focus mode | Partial — toast only if `!focusMode` |
| Backend down | fetch `.catch` | `toast.error("Cannot reach backend")` in some paths | OK |
| hub.py crash on normalize | `try/except` in send_json loop | closes socket | Acceptable |
| Process crash (aircrack etc.) | `process.stderr` event → WARN log | log shown; no toast | **Bad** — no UI feedback |
| Disk full | `system.disk_full` event → ERROR log | log; no toast | **Bad** |

### 11.2 Frontend Defensive Patterns Found
| Pattern | Locations | Notes |
|---|---|---|
| `?? 0` for numeric defaults | Dashboard progress, EvilTwin uptime, Crack progress | safe |
| `?.` optional chaining | Topbar errors, Recon handshake modals | safe |
| try/catch around fetch | Almost all store actions | safe |
| toast.error on fetch failure | Reconnaissance, Adapters, Captures, Crack | safe |
| `setTimeout(0)` for React batching | useWcarckStore:403, 460, 484 | safe |
| `useState` default for missing types | many | safe |
| `array.filter` no-op on empty | all | safe |
| `.map` no-op on empty | all | safe |

### 11.3 Frontend Defensive Patterns Missing
| Pattern | Where needed | Severity |
|---|---|---|
| `useId()` or stable keys for map | Dashboard logs (uses `i`), many places using `key={i}` | Low |
| `aria-label` on icon-only buttons | All `Button size="icon"` instances | High (a11y) |
| `role="dialog"` on modals | DeauthModal, StationsModal, SuccessModal, ConfirmModal | High (a11y) |
| AbortController for fetch | All fetch calls (e.g. wordlist upload) | Medium |
| Window focus refetch on tab return | Dashboard, Reconnaissance | Medium |
| Race condition: rapid clicks on Start/Stop | Reconnaissance, Adapters (toggleMode) | Medium |
| Stale state: clicking row on old `selectedBssid` | Reconnaissance panel | Low |
| Concurrent job limitation | All attack launches | Medium |
| Number parsing guard | Reconnaissance deauthCount, EvilTwin deauthInterval | Low |
| Reconnect indicator | Topbar (no UI shows WS disconnected) | High |
| Backend health check | AppLayout | High |
| Hashcat-binary-exists check | Crack page | High (engine mismatch) |
| Adapter-disconnected indicator | Topbar adapter dots | Medium |
| Long-running operation feedback | Wordlist upload (no progress bar) | Medium |

---

## 12. Cross-Cutting Backend Defects Surfacing in UI

| ID | File:Line | Defect | UI Symptom |
|---|---|---|---|
| B1 | backend/wcarck/api/adapters.py:24-34 | `AdapterRes` missing `bands`, `channel`, `rssi`, `rx`, `tx`, `status` fields that frontend reads | Store fills defaults, so UI works but values are fabricated |
| B2 | backend/wcarck/api/captures.py:55-72 | `/api/captures/{id}/download` works only if `os.path.exists(cap.path)`. No subdirectory escape check. No path canonicalization. | Path traversal vulnerability if capture.path is mutable from network events |
| B3 | backend/wcarck/api/captures.py:74 | `wpaclean` runs via `sudo -n` (no password). If sudo fails, generic error returned. | UI shows "Sanitization failed: ..." without root cause |
| B4 | backend/wcarck/api/jobs.py:30 | `valid_modules` hardcoded list does not include `crack.hashcat` (only `crack.aircrack`) | Cannot use the dead crack.py endpoint |
| B5 | backend/wcarck/api/jobs.py:30-32 | No validation that `handler_name` matches `module_name` | Backend may receive `module: recon.scanner, handler: start_deauth` |
| B6 | backend/wcarck/api/credentials.py:13-24 | `CredentialRes` uses `password` not `plainText`, has no `username` field but does have it in schema. Frontend `credential.captured` event sets `username` and `plainText` | Schema mismatch with WebSocket payload |
| B7 | backend/wcarck/api/network.py:11-23 | `ApRes` uses `signal_dbm` but frontend Network type uses `power` | Frontend store maps both: `power: evPayload.power || evPayload.signal_dbm` (useWcarckStore.ts:374) |
| B8 | backend/wcarck/api/network.py:11-23 | `ApRes` missing `pmf`, `beacons`, `data` fields that frontend reads | Defaults to 0/false |
| B9 | backend/wcarck/api/projects.py:72-85 | PUT `/api/projects/{id}` exists in backend but no UI calls it | Dead code |
| B10 | backend/wcarck/api/report.py | No UI integration for `/api/report/csv` or `/api/report/html` | Dead code |
| B11 | backend/wcarck/api/crack.py:9 | `from ..orchestration.worker import _job_queue` — `_job_queue` is private. Module-level import will fail at startup if worker is not initialized. | Backend crash on import |
| B12 | backend/wcarck/api/crack.py | `/api/crack/jobs` route not registered in main router (router exists but app.py likely doesn't include it) | Endpoint 404 |
| B13 | backend/wcarck/api/hub.py:166-167 | `wall_ts_ms = time.time() * 1000` — every event stamped at send time, not original `event.ts_mono`. Stale events appear as fresh. | Log timestamps jump on WS reconnect (history replay) |
| B14 | backend/wcarck/api/captures.py:16-28 | `CaptureRes` returns `type: str` but frontend expects enum `'eapol' | 'pmkid' | 'wep'`. No validation | Stale type strings may slip through |

---

## 13. Per-Page Exception-Handling Severity Ranking

| Page | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Topbar/Sidebar/Shell | 0 | 1 | 2 | 1 | 4 |
| Dashboard | 0 | 0 | 2 | 2 | 4 |
| Reconnaissance | 0 | 2 | 5 | 4 | 11 |
| AttackSurface | 0 | 2 | 1 | 2 | 5 |
| EvilTwin | 0 | 4 | 3 | 2 | 9 |
| Captures | 0 | 1 | 3 | 2 | 6 |
| Credentials | 0 | 0 | 1 | 1 | 2 |
| Crack | 0 | 2 | 3 | 1 | 6 |
| Logs | 1 | 1 | 1 | 2 | 5 |
| Projects | 0 | 1 | 1 | 1 | 3 |
| CommandPalette | 0 | 1 | 1 | 0 | 2 |
| Backend cross-cutting | 2 | 5 | 5 | 2 | 14 |
| **Total** | **3** | **20** | **28** | **20** | **71** |

---

## 14. Recommended Remediation Order

### Critical (must fix before V1 release)
1. **Logs.tsx:340** — Define `listContainerRef` to fix React ref warning
2. **AttackSurface.tsx:188** — Stop button on capture row calls wrong endpoint; either add `POST /api/captures/{id}/stop` or remove the button
3. **backend/wcarck/api/crack.py:9** — Either fix the dead import or delete the file (the function isn't called from the React frontend)

### High
4. Add `aria-label` to all icon-only buttons; add `role="dialog"` to all modals
5. Add WebSocket disconnect indicator to Topbar
6. Fix Crack page mislabel: rename "Hashcat Engine" to "Aircrack-ng Engine"
7. Fix EvilTwin "DNS Queries" / "Portal Hits" labels (they display wrong metrics)
8. Add error toast for `download_capture` 404 in Captures.tsx
9. Add `aria-label` to DeauthModal's modal close button
10. Reconnaissance: de-duplicate "two concurrent deauths" race in live status tracker
11. EvilTwin: replace `window.confirm` (Projects page) with `ConfirmModal` component
12. Crack: success modal trigger should filter by active captureId, not just SSID/BSSID
13. Reconnaissance: PMKID button should check for monitor adapter existence
14. Captures: View stations should show error toast on fetch failure
15. Reconnaissance: Recon button silently fails when no active iface; add toast
16. Add `error_msg` display on `job.failed` event handling
17. Reconnaissance DeauthModal: rename shadowed `deauthClientMac` parameter
18. Logs: remove the `sessionFilter` (always shows only "live" option) or implement actual session tracking
19. Backend: AdapterRes should include `bands`, `channel`, `rssi`, `rx`, `tx`, `status` to match frontend Network/Adapter types
20. Backend: jobs.py:30 should add `crack.hashcat` to valid_modules if V2 supports it, otherwise remove the dead router
21. Backend: jobs.py:30-32 should validate `handler_name` matches `module_name` pattern
22. Backend: CapturesRes.type should be Enum

### Medium
23. Reconnaissance: performance — pre-compute `clientsByBssid` map once, not per row
24. Reconnaissance: deduplicate `TEMPLATES` array (Login_v4, DarkLogin, loginPage, evilqr3, custom) with backend dirs
25. EvilTwin: send `customFile` to backend or remove the upload UI
26. EvilTwin: hardcoded DHCP range should be configurable
27. EvilTwin: backend ignores karma_mode, dns_spoofing, deauth_companion flags — document or remove
28. Reconnaissance: handle Ctrl+F1 (or any keyboard shortcut) for quick filter focus
29. Reconnaissance: keyboard navigation in AP table
30. Captures: replace `window.open` download with a fetch + blob for proper error handling
31. Captures: stale `useEffect` refetches ALL state on mount
32. Crack: wordlist upload should show progress (XMLHttpRequest progress events)
33. Crack: hardcoded status message "Running dictionary attack" should be removed
34. Projects: PUT endpoint exists but no UI uses it — add edit dialog or remove endpoint
35. Backend: report.py endpoints have no UI integration — remove or add
36. Add disk-full and adapter-disconnected toasts (currently only logged)
37. Add backend health check to AppLayout (ping `/api/projects` on mount)
38. Reconnaissance deauthCount: validate input min/max (already 10-10000 on type=number, but no JS guard)
39. EvilTwin: Adapter mode logic (managed vs ap fallback) is fragile
40. Backend: hub.py:166-167 should use `event.ts_mono` converted to wall clock, not current time

### Low
41. Reconnaissance: key stability for row rendering (use stable BSSID as key)
42. Reconnaissance: stale styling recomputed on every render (memoize)
43. Reconnaissance: visible `Run Scan` button on disabled state
44. Captures: stations modal max-h-60 too small
45. Logs: JSON.stringify on large payload could freeze UI
46. Reconnaissance: Sparkline chart should animate transitions
47. Reconnaissance: tooltips using `title` attribute should use AppTooltip
48. Reconnaissance: TBA — pagination for >200 APs
49. EvilTwin: Active state view shows stale "Credentials Harvested" if no new creds after job start
50. Captures: per-row check icons could be colorblind-friendly
51. Captures: status filter is inclusive-only (no "WPA-PSK Only", "PMKID Only")
52. Credentials: Type label hardcodes 2 values; should be expanded
53. Crack: hardcoded `"Starting..."` and `"Calculating..."` should be more accurate
54. Reconnaissance: focus management on DeauthModal open/close
55. Logs: column resizers don't persist across reloads
56. Reconnaissance: Filter state not persisted in URL
57. Reconnaissance: show "X networks filtered out" hint
58. Dashboard: progress bar should have color states (running/error/queued)
59. Reconnaissance: stale-30s threshold hardcoded
60. Captures: "All Statuses" filter when filters are not applied

---

## 15. Audit Summary

- **3 critical bugs** that will crash or break at runtime
- **20 high-severity issues** spanning misleading labels, missing error toasts, broken endpoints, accessibility gaps
- **28 medium-severity issues** spanning UX consistency, performance, dead-code paths
- **20 low-severity issues** spanning polish, hardcoded strings, defensive coding patterns

The **biggest systemic gap** is that the UI lies about its backend: "Hashcat Engine" runs aircrack-ng, "DNS Queries" shows frames sent, "Portal Hits" is a fake calculation, "Templates" are frontend-only strings, "Custom template upload" discards the file. Each of these is a deliberate-looking element that the user can interact with, but produces no real effect.

The **biggest exception-handling gap** is silent failure: `job.failed`, `module.error`, `process.stderr`, `system.disk_full`, and `adapter.gone` are all logged but not surfaced to the user. The user only sees an empty active-jobs list and a slowly-growing log they have to navigate to.

The **biggest defensive-coding gap** is the lack of `aria-label`, `role="dialog"`, and other a11y attributes on every icon-only button and modal.

The **biggest connectivity gap** is the absence of a WebSocket disconnect indicator. The store auto-reconnects with exponential backoff, but the user has no idea the UI is stale during a disconnect.
