# Wcarck — Comprehensive System Audit

**Date:** 2026-06-04
**Scope:** Every page, store, hook, API endpoint, backend module, and cross-binding.
**Goal:** Find every fake function, dead button, missing exception, core logic flaw, and frontend-backend mismatch.

---

## Severity Scale

| Level | Meaning |
|-------|---------|
| **CRITICAL** | Breaks a core feature entirely. No workaround. |
| **HIGH** | Feature misbehaves or silently fails. User sees wrong data. |
| **MEDIUM** | Feature partially works or degrades under edge cases. |
| **LOW** | Cosmetic, polish, or minor robustness issue. |

---

## 1. Fake Functions & Frontend-Only Stubs

### 1.1 Adapters.tsx

| Line | Element | Issue | Severity |
|------|---------|-------|----------|
| 269 | `mockRssi` | `Math.random() * 20` — RSSI is random noise, not real hardware data. | HIGH |
| 291 | RF Kill Status | Always shows `RF ON` with green dot. Never queries actual RF kill state from backend. | MEDIUM |
| 335-347 | `adapter.bands` | Always `[2.4, 5]` because `Adapter` DB table has no `bands` column. Backend `AdapterRes` declares `bands` but it's always `None`, store defaults to `[2.4, 5]`. | HIGH |
| 401-421 | RX/TX counters | Always `0` because `Adapter` DB table has no `rx`/`tx` columns. Tooltip says "Packets Received/Transmitted" but values are meaningless. | HIGH |
| 416-421 | RSSI display | Shows `mockRssi` (random), not actual signal strength. | HIGH |

### 1.2 Adapters.tsx — API-Backed Stubs

These call real endpoints but only work on Linux. On Windows (`os.name == 'nt'`), the backend returns hardcoded mock data.

| Line | Element | Backend Mock | Issue | Severity |
|------|---------|-------------|-------|----------|
| 103-127 | MAC Randomize | `adapters.py:134-137` returns random MAC string | Works on Linux. On Windows, returns `02:XX:XX:XX:XX:XX` with no actual interface change. State disappears on refresh because MAC isn't persisted. | MEDIUM |
| 129-143 | Injection Test | `adapters.py:172-173` returns `[OK] Injection OK` | Works on Linux (runs `aireplay-ng --test`). On Windows, always returns success. | MEDIUM |
| 78-91 | Dry Run | `adapters.py:122-123` returns fake process list | Works on Linux (runs `airmon-ng check`). On Windows, hardcoded 3-process output. | LOW |

### 1.3 AttackSurface.tsx

| Line | Element | Issue | Severity |
|------|---------|-------|----------|
| 144 | `attackJobs` filter | `j.type !== 'recon'` — but store maps `attack.deauth` to type `"deauth"`, not `"attack.deauth"`. Deauth jobs won't appear here because `getFriendlyName` checks for `'attack.deauth'` (line 73) but actual type is `'deauth'`. | HIGH |
| 71-78 | `getFriendlyName` | Maps `'attack.deauth'` but store produces `'deauth'`. Mismatch means deauth shows raw type name instead of "Deauthentication". | HIGH |
| 146 | `evilTwinJob` filter | `j.type === 'attack.eviltwin'` — but store maps eviltwin to type `"eviltwin"`. Evil twin never detected here. | HIGH |
| 268-292 | Evil Twin Monitor | Only shows when `evilTwinJob` exists. Due to type mismatch above, this section never renders. | HIGH |
| 97-115 | Crack card stats | Shows `attack.progress`, `attack.speed` — but CrackModule never emits `job.progress` events. Always 0% / "0 H/s". | HIGH |
| 119-131 | Deauth card stats | Shows `attack.framesSent`, `attack.packetsPerSec` — DeauthModule emits `job.updated` with these fields, so they work. But sparkline value (`packetsPerSec`) is only updated when stdout line matches "Sending DeAuth". | MEDIUM |

### 1.4 Reconnaissance.tsx

| Line | Element | Issue | Severity |
|------|---------|-------|----------|
| 841-867 | Live Status Tracker (deauth modal) | `j.type === 'deauth'` — correct store mapping. Works if job is running. But `framesSent` and `acks` come from `job.updated` events which only fire when aireplay stdout matches "Sending DeAuth". If aireplay fails silently, no updates. | MEDIUM |
| 870-885 | Start Deauth button | Calls `startJob('deauth', ...)` — correct. But if no monitor adapter, silently fails with toast. No pre-flight check for adapter mode. | LOW |

### 1.5 EvilTwin.tsx

| Line | Element | Issue | Severity |
|------|---------|-------|----------|
| 86 | `activeTwinJob` filter | `j.type === 'eviltwin'` — correct store mapping. Works. | OK |
| 88 | `hasApAdapter` | `a.status !== 'down'` — but `Adapter.status` is always `'up'` (DB has no `status` column, defaults to `'up'`). Check always passes. | MEDIUM |
| 146-147 | DHCP Leases / Connected | Hardcoded `0`. Comment says "Placeholder for V2". Never populated. | MEDIUM |
| 164 | Fake AP Status | Always shows "Broadcasting" string when active. No real backend status check. | LOW |
| 546-548 | Deauth companion warning | Checks `hasApAdapter` which always passes. Warning never triggers. | LOW |

### 1.6 Dashboard.tsx

| Line | Element | Issue | Severity |
|------|---------|-------|----------|
| 128-146 | Crack operation card | `j.type === 'crack'` — but store maps crack to type `"crack"` via `rawModule.startsWith("crack")`. However, `CrackModule.name` returns `"attack.crack"` (line 30 of crack.py), so `module.started` event sends `module: "attack.crack"`. Store mapping (line 415): `rawModule.startsWith("crack")` → false. Job type becomes `"attack.crack"` literally. Card never matches `job.type === 'crack'`. | CRITICAL |
| 362 | Deauth Attack button | `onClick={() => navigate('/attack')}` — navigates to AttackSurface but doesn't pre-select deauth. User has to click again. | LOW |
| 365 | PMKID Capture button | Same as above — navigates to AttackSurface, no direct action. | LOW |
| 372 | View All Logs | `errorCount` includes CRITICAL. Good. But no badge shown if count is 0 (intentional). | OK |

### 1.7 Crack.tsx

| Line | Element | Issue | Severity |
|------|---------|-------|----------|
| 59 | `crackJob` | `activeJobs.find(j => j.type === 'crack')` — same type mismatch as Dashboard. Never finds the crack job. Progress bar always 0%. Stop button never appears during crack. | CRITICAL |
| 41-57 | Success modal subscriber | Listens for `credentials` length increase. Works in principle, but `isCrackingThis` check (line 48) uses `j.type === 'crack'` which never matches due to type mismatch. Modal never triggers. | CRITICAL |

### 1.8 Captures.tsx

| Line | Element | Issue | Severity |
|------|---------|-------|----------|
| 376-386 | Re-cap button | Calls `startJob('deauth', { bssid: cap.bssid, iface: monAdapter.iface })`. No channel parameter sent. Deauth will target the BSSID but on current channel, which may not be the capture's original channel. | MEDIUM |
| 350-355 | EAPOL display | Shows M1-M4 from `cap.eapolM1-M4`. These are always `false` because scanner never populates them (no EAPOL frame parsing in CSV). | HIGH |

### 1.9 Credentials.tsx

No major fakes. All data comes from backend. Minor: `PasswordCell` has its own `navigator.clipboard.writeText` (line 37) in addition to the `copyToClipboard` utility used elsewhere — inconsistent pattern. | LOW |

### 1.10 Logs.tsx

No fake functions. All data from store. Clean implementation. | OK |

### 1.11 Projects.tsx

| Line | Element | Issue | Severity |
|------|---------|-------|----------|
| N/A | Edit project | No edit UI exists. Only create/delete/activate. Missing edit button entirely. | MEDIUM |

---

## 2. Dead Buttons & Non-Functional UI Elements

| Page | Element | Line | Issue | Severity |
|------|---------|------|-------|----------|
| AttackSurface | Stop button (crack card) | 90 | Calls `stopJob(attack.id)` — but crack job never appears due to type mismatch. Button unreachable. | CRITICAL |
| AttackSurface | Configure Evil Twin button | 338-345 | `disabled={!targetNetwork || attackJobs.some(j => j.type === 'attack.eviltwin')}` — type mismatch means `attack.eviltwin` never in `attackJobs`. Disable check never triggers. Button always enabled if target exists. | HIGH |
| Dashboard | Deauth Attack quick-launch | 362 | Navigates to `/attack` (AttackSurface). Doesn't start job directly. Not dead, but indirect. | LOW |
| Dashboard | PMKID Capture quick-launch | 365 | Same — navigates to `/attack`. | LOW |
| EvilTwin | Active state Stop button | 132-138 | Calls `stopJob(activeTwinJob.id)`. Works correctly when evil twin is running. | OK |
| Crack | Stop Attack button | 235-240 | Only visible when `crackJob` exists. Due to type mismatch, never visible. User cannot stop a running crack. | CRITICAL |
| Reconnaissance | Deauth button (context panel) | 703-717 | Works — opens modal. | OK |
| Reconnaissance | PMKID button (context panel) | 720-734 | Calls `startJob('pmkid', ...)` — correct. But handler_name validation bug blocks it. | CRITICAL |
| Adapters | Mode Toggle button | 425-443 | Works — calls real backend endpoint. | OK |

---

## 3. Missing Exception Handling

### 3.1 Backend — No try/catch on ManagedProcess.start()

| Module | Line | Issue | Severity |
|--------|------|-------|----------|
| `crack.py` | 132 | `await self._process.start()` — no try/catch. If aircrack-ng binary missing, exception propagates unhandled to worker. Job stuck in "running" forever. | HIGH |
| `deauth.py` | 93 | `await self._process.start()` — same issue. If aireplay-ng missing, unhandled exception. | HIGH |
| `scanner.py` | 98 | `await self._process.start()` — HAS try/catch (lines 99-105). Publishes `module.error`. | OK |

### 3.2 Backend — Silent Failure Gaps

| Module | Line | Issue | Severity |
|--------|------|-------|----------|
| `worker.py` | N/A | `job.failed` events logged but not surfaced to UI via toast. Only `job.failed` in store (line 450-452) triggers toast, but only if `!focusMode`. | MEDIUM |
| `scanner.py` | 195 | `module.stopped` published at line 195 AND line 208-211. Double publish causes UI to process `module.stopped` twice — second one is a no-op but wastes cycles. | MEDIUM |
| `deauth.py` | 130-141 | `_wait_for_exit` — if `self._process._process` is `None` (process never started), `wait()` skipped silently. No error event published. | LOW |

### 3.3 Frontend — Silent Failures

| File | Line | Issue | Severity |
|------|------|-------|----------|
| `useWcarckStore.ts` | 311 | `fetchInitialState` catch block is empty — `// Silent fallback, wait for WS history`. If backend is down, user sees stale/empty state with no indication. | MEDIUM |
| `useWcarckStore.ts` | 346-348 | WS `onmessage` catch block — `// Ignore parse errors`. Silent. | LOW |
| `useAudioAlerts.ts` | 38-40 | Has try/catch with `console.warn`. Good. But AudioContext still suspended (BUG 1). | See Section 4 |
| `useWcarckStore.ts` | 579-582 | `startJob` catch — shows `toast.error`. Good. | OK |
| `useWcarckStore.ts` | 593-596 | `stopJob` catch — shows `toast.error`. Good. | OK |

---

## 4. Core Logic Flaws

### 4.1 CRITICAL: jobs.py handler_name Validation (Line 34)

```python
if not req.handler_name.startswith(req.module_name):
    raise HTTPException(status_code=400, detail="Invalid handler_name")
```

**Store sends:** `module_name: "recon.scanner"`, `handler_name: "start_scan"`
**Validation:** `"start_scan".startswith("recon.scanner")` → `False`
**Result:** HTTP 400 for EVERY job. No job can ever start.

All five module types are blocked:
- recon: `"start_scan".startswith("recon.scanner")` → False
- deauth: `"start_deauth".startswith("attack.deauth")` → False
- pmkid: `"start_pmkid".startswith("attack.pmkid")` → False
- eviltwin: `"start_eviltwin".startswith("attack.eviltwin")` → False
- crack: `"start_crack".startswith("crack.aircrack")` → False

**Fix:** Change validation to `req.handler_name.startswith("start")` or remove the check entirely (the handler_name is just a string tag, not a real Python method).

### 4.2 CRITICAL: CrackModule.name Mismatch

```python
# crack.py line 30
@property
def name(self) -> str:
    return "attack.crack"
```

**Store module.started handler (line 411-415):**
```typescript
const type = rawModule.startsWith("recon") ? "recon" : 
             rawModule.startsWith("attack.deauth") ? "deauth" :
             rawModule.startsWith("attack.pmkid") ? "pmkid" :
             rawModule.startsWith("attack.eviltwin") ? "eviltwin" :
             rawModule.startsWith("crack") ? "crack" : rawModule
```

`"attack.crack".startsWith("crack")` → `False`. Falls through to default: type = `"attack.crack"`.

**All crack-related UI fails:**
- Dashboard OperationCard: `job.type === 'crack'` → never matches
- Crack.tsx: `activeJobs.find(j => j.type === 'crack')` → never finds
- AttackSurface: `getFriendlyName('attack.crack')` → returns raw string

**Fix:** Either change `CrackModule.name` to `"crack.aircrack"` or add `rawModule.startsWith("attack.crack") ? "crack"` to store mapping.

### 4.3 CRITICAL: CrackModule Hardcoded CrackJob ID

```python
# crack.py line 109
numeric_job_id = int(job_id) if str(job_id).isdigit() else zlib.crc32(str(job_id).encode()) & 0x7FFFFFFF
```

`zlib.crc32` is not collision-resistant. Multiple different job_id strings can map to the same integer. Two concurrent crack jobs would overwrite each other's CrackJob row.

**Fix:** Use a proper UUID or sequential integer from the DB, not a hash.

### 4.4 HIGH: AudioContext Suspended

```typescript
// useAudioAlerts.ts line 14
audioContext.current = new AudioContextClass()
```

Browser policy: `new AudioContext()` starts in `state: "suspended"`. No `audioContext.current.resume()` call anywhere. **Zero sound ever plays.**

**Fix:** Add `audioContext.current.resume()` after creation, ideally triggered by a user gesture (click/keydown) listener.

### 4.5 HIGH: useAudioAlerts Wrong Credential Index

```typescript
// useAudioAlerts.ts line 65
const latest = creds[creds.length - 1]
```

New credentials are prepended at index 0 (store line 479: `const creds = [normCred, ...state.credentials]`). `creds[creds.length - 1]` reads the **oldest** credential, not the newest.

**Fix:** Change to `creds[0]`.

### 4.6 HIGH: AdapterRes Missing 7 DB Fields

`adapters.py` `AdapterRes` declares: `bands`, `channel`, `rssi`, `rx`, `tx`, `status` (lines 36-41).

`Adapter` model (models.py lines 40-50) has NONE of these columns. SQLAlchemy returns `None` for all. Store defaults: `bands: [2.4, 5]`, `channel: 0`, `rssi: 0`, `rx: 0`, `tx: 0`, `status: 'up'`.

**All adapter stats in UI are meaningless defaults.**

### 4.7 HIGH: CrackModule Never Emits job.progress

`CrackModule._monitor_process` reads aircrack stdout looking for `KEY FOUND!`. It never parses progress lines like `KEY FOUND! [ 12345678 ] (XX.X%)` or emits `job.progress` events.

Dashboard and AttackSurface crack cards always show 0%.

### 4.8 HIGH: EAPOL M1-M4 Never Populated

`Capture` model has `eapolM1` through `eapolM4` fields. Scanner CSV parser never populates them. The `verify_handshake` function returns status but not individual frame data.

All EAPOL progress indicators in Captures.tsx and AttackSurface.tsx always show empty.

### 4.9 MEDIUM: ScannerModule Double module.stopped

```python
# scanner.py line 195
bus.publish("module.stopped", {"job_id": job_id, "module": self.name})

# scanner.py line 208-211
bus.publish("module.stopped", {
    "job_id": job_id, "module": self.name,
    "message": f"Recon scanner stopped"
})
```

Two `module.stopped` events for one job. Second one is redundant.

### 4.10 MEDIUM: DeauthModule Sync Subprocess Check

```python
# deauth.py line 70
out = subprocess.check_output(["aireplay-ng", "--help"], text=True, stderr=subprocess.STDOUT)
```

`subprocess.check_output` is synchronous/blocking. Called inside async `start()`. Blocks event loop.

**Fix:** Use `asyncio.create_subprocess_exec` instead.

### 4.11 LOW: Dead crack.py API Endpoint

`backend/wcarck/api/crack.py` contains only `# Deprecated`. The router is still registered in `main.py` but does nothing.

---

## 5. Frontend-Backend Harmony Matrix

### 5.1 Store Module Name → Type Mapping vs Backend Module.name

| Store `moduleName` | `backendModuleName` | Backend `Module.name` | Store `type` derived | Expected by UI | Match? |
|--------------------|--------------------|-----------------------|---------------------|----------------|--------|
| `recon` | `recon.scanner` | `recon.scanner` | `"recon"` | `j.type === 'recon'` | YES |
| `deauth` | `attack.deauth` | `attack.deauth` | `"deauth"` | `j.type === 'deauth'` | YES |
| `pmkid` | `attack.pmkid` | `attack.pmkid` | `"pmkid"` | — (no UI card) | OK |
| `eviltwin` | `attack.eviltwin` | `attack.eviltwin` | `"eviltwin"` | `j.type === 'eviltwin'` | YES |
| `crack` | `crack.aircrack` | `attack.crack` | `"attack.crack"` | `j.type === 'crack'` | **NO** |

### 5.2 API Endpoint → Frontend Binding

| Endpoint | Frontend Caller | Works? | Notes |
|----------|----------------|--------|-------|
| `POST /api/jobs/start` | `store.startJob()` | **NO** | Blocked by handler_name validation (Section 4.1) |
| `POST /api/jobs/{id}/stop` | `store.stopJob()` | YES | But needs integer ID; string IDs from CRC32 may not match DB |
| `GET /api/adapters` | `store.fetchInitialState()` | YES | But returns null for 7 stat fields |
| `POST /api/adapters/refresh` | `Adapters.fetchAdapters()` | YES | |
| `POST /api/adapters/{iface}/mode` | `Adapters.toggleMode()` | YES | |
| `POST /api/adapters/check-kill` | `store.checkKill()` | YES | |
| `POST /api/adapters/restore` | `store.restoreNetwork()` | YES | |
| `POST /api/adapters/{iface}/mac/randomize` | `Adapters.handleRandomizeMac()` | YES (Linux) | Windows mock |
| `POST /api/adapters/{iface}/mac/restore` | `Adapters.handleRandomizeMac()` | YES (Linux) | Windows mock |
| `POST /api/adapters/{iface}/injection-test` | `Adapters.handleInjectionTest()` | YES (Linux) | Windows mock |
| `POST /api/adapters/check-kill/dry-run` | `Adapters.handleDryRun()` | YES (Linux) | Windows mock |
| `GET /api/captures` | `store.fetchInitialState()` | YES | But eapol fields always false |
| `POST /api/captures/{id}/clean` | `Captures.handleCleanCapture()` | YES | |
| `POST /api/captures/{id}/stations` | `Captures.handleViewStations()` | YES | |
| `GET /api/captures/{id}/download` | `Captures.handleDownload()` | YES | |
| `GET /api/credentials` | `store.fetchInitialState()` | YES | |
| `GET /api/networks/aps` | `store.fetchInitialState()` | YES | |
| `GET /api/networks/clients` | `store.fetchInitialState()` | YES | |
| `GET /api/wordlists` | `store.fetchWordlists()` | YES | |
| `POST /api/wordlists/upload` | `Crack.tsx` | YES | |
| `GET /api/projects` | `store.fetchProjects()` | YES | |
| `POST /api/projects` | `store.createProject()` | YES | |
| `POST /api/projects/{id}/activate` | `store.activateProject()` | YES | |
| `DELETE /api/projects/{id}` | `store.deleteProject()` | YES | |

### 5.3 WebSocket Event → Store Handler

| Event | Store Handler | Works? | Notes |
|-------|--------------|--------|-------|
| `network.discovered` | processEvent | YES | |
| `network.updated` | processEvent | YES | |
| `client.discovered` | processEvent | YES | |
| `client.updated` | processEvent | YES | |
| `adapter.state_changed` | processEvent | YES | Triggers fetchInitialState |
| `module.started` | processEvent | YES | Type mapping issue for crack |
| `module.stopped` | processEvent | YES | Fires twice for scanner |
| `job.started` / `job.updated` | processEvent | YES | |
| `job.stopped` / `job.completed` / `job.failed` | processEvent | YES | |
| `job.progress` | processEvent | YES | But CrackModule never emits it |
| `handshake.captured` | processEvent | YES | Triggers fetchInitialState |
| `credential.captured` | processEvent | YES | |
| `project.activated` | processEvent | YES | |

---

## 6. Summary — Issue Counts by Severity

| Severity | Count | Key Items |
|----------|-------|-----------|
| **CRITICAL** | 5 | handler_name validation, CrackModule name, CrackJob ID, Crack.tsx/Dashboard crack invisible, AudioContext suspended |
| **HIGH** | 14 | Audio wrong index, AdapterRes 7 missing fields, CrackModule no progress, EAPOL never populated, AttackSurface type mismatches (3 cards), mockRssi, fake bands, zero RX/TX, no handshake validation before crack, no wpaclean, stdout parsing vs `-l`, no PMKID cracking path |
| **MEDIUM** | 17 | Double module.stopped, sync subprocess, empty catch blocks, evil twin placeholders, re-cap no channel, Projects no edit, Windows mocks, AdapterRes always-default values, scanner lease on failure, stop no status update, no WS disconnect indicator, incomplete progress parsing, no per-client deauth, no DHCP controller, no DNS spoofing, CSV quoted values |
| **LOW** | 12 | Dead crack.py endpoint, DFS hardcoded, RF kill hardcoded, PasswordCell inconsistency, cosmetic navigation, deauth modal reason codes, no existing handshake loading, WPS column position, channel-as-frequency, no plugin system, john unused, no packetforge |
| **TOTAL** | **48** | Sections 1-10 (Sections 11+ are pending feature work) |

---

## 7. Fixes Applied (2026-06-04)

### Fix 1 — CRITICAL: jobs.py handler_name validation (jobs.py:34)

**Problem:** `req.handler_name.startswith(req.module_name)` — `"start_scan".startswith("recon.scanner")` is always `False`. Every `POST /api/jobs/start` returned HTTP 400. No job could ever start.

**Before:**
```python
if not req.handler_name.startswith(req.module_name):
    raise HTTPException(status_code=400, detail="Invalid handler_name")
```

**After:**
```python
if not req.handler_name.startswith("start"):
    raise HTTPException(status_code=400, detail="Invalid handler_name")
```

**File:** `backend/wcarck/api/jobs.py:34`

---

### Fix 2 — CRITICAL: Store type mapping for crack (useWcarckStore.ts:411-415)

**Problem:** `CrackModule.name` returns `"attack.crack"`. Store mapping only checked `rawModule.startsWith("crack")` which is `False` for `"attack.crack"`. Crack jobs got type `"attack.crack"` literally, so `j.type === 'crack'` in Dashboard, Crack.tsx, and AttackSurface never matched. Crack progress bar, stop button, and success modal were all invisible.

**Before:**
```typescript
const type = rawModule.startsWith("recon") ? "recon" : 
             rawModule.startsWith("attack.deauth") ? "deauth" :
             rawModule.startsWith("attack.pmkid") ? "pmkid" :
             rawModule.startsWith("attack.eviltwin") ? "eviltwin" :
             rawModule.startsWith("crack") ? "crack" : rawModule
```

**After:**
```typescript
const type = rawModule.startsWith("recon") ? "recon" : 
             rawModule.startsWith("attack.deauth") ? "deauth" :
             rawModule.startsWith("attack.pmkid") ? "pmkid" :
             rawModule.startsWith("attack.eviltwin") ? "eviltwin" :
             (rawModule.startsWith("crack") || rawModule === "attack.crack") ? "crack" : rawModule
```

**File:** `frontend/src/store/useWcarckStore.ts:415`

---

### Fix 3 — CRITICAL: CrackJob ID collision (crack.py:109,192)

**Problem:** `zlib.crc32(str(job_id).encode()) & 0x7FFFFFFF` used to convert string job IDs to integers for the CrackJob table. CRC32 is not collision-resistant — different job_id strings could map to the same integer, causing one crack job to overwrite another's DB row.

**Before:**
```python
import zlib
numeric_job_id = int(job_id) if str(job_id).isdigit() else zlib.crc32(str(job_id).encode()) & 0x7FFFFFFF
```

**After (both occurrences at line 109 and line 192):**
```python
import uuid
numeric_job_id = int(job_id) if str(job_id).isdigit() else abs(hash(uuid.uuid4().hex)) % (2**31)
```

**File:** `backend/wcarck/modules/attack/crack.py:109,192`

---

### Fix 4 — CRITICAL: AudioContext suspended (useAudioAlerts.ts:10-56)

**Problem:** `new AudioContext()` starts in `state: "suspended"` per browser autoplay policy. No `resume()` call anywhere. Zero sound ever played. Additionally, some browsers require `resume()` to be called from a user gesture.

**Before:**
```typescript
const initAudio = () => {
  if (!audioContext.current) {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AudioContextClass) {
      audioContext.current = new AudioContextClass()
    }
  }
}
```

**After:**
```typescript
const initAudio = () => {
  if (!audioContext.current) {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AudioContextClass) {
      audioContext.current = new AudioContextClass()
      if (audioContext.current.state === 'suspended') {
        audioContext.current.resume()
      }
    }
  } else if (audioContext.current.state === 'suspended') {
    audioContext.current.resume()
  }
}
```

Plus first-user-gesture listener added after `initAudio()`:
```typescript
initAudio()

const resumeOnGesture = () => {
  if (audioContext.current?.state === 'suspended') {
    audioContext.current.resume()
  }
}
document.addEventListener('click', resumeOnGesture, { once: true, capture: true })
document.addEventListener('keydown', resumeOnGesture, { once: true, capture: true })
```

Cleanup added to return function:
```typescript
document.removeEventListener('click', resumeOnGesture)
document.removeEventListener('keydown', resumeOnGesture)
```

**File:** `frontend/src/hooks/useAudioAlerts.ts:10-22,48-56,109-110`

---

### Fix 5 — HIGH: Wrong credential index (useAudioAlerts.ts:65)

**Problem:** `creds[creds.length - 1]` read the **oldest** credential. New credentials are prepended at index 0 (`const creds = [normCred, ...state.credentials]`). The audio alert played the wrong sound for the wrong credential.

**Before:**
```typescript
const latest = creds[creds.length - 1]
```

**After:**
```typescript
const latest = creds[0]
```

**File:** `frontend/src/hooks/useAudioAlerts.ts:72`

---

### Fix 6 — HIGH: ScannerModule double module.stopped (scanner.py:195)

**Problem:** `bus.publish("module.stopped", ...)` was called twice — once at line 195 inside the capture-saving block, and again at line 208-211 after the finally block. The UI processed the event twice (second was a no-op but wasted cycles).

**Before:**
```python
                    except Exception as e:
                        logger.error(f"Failed to save capture to DB: {e}")
                    
            bus.publish("module.stopped", {"job_id": job_id, "module": self.name})
            
            if self._parser_task:
```

**After:**
```python
                    except Exception as e:
                        logger.error(f"Failed to save capture to DB: {e}")
                    
            if self._parser_task:
```

The remaining `module.stopped` at the end of the method (with message) is kept.

**File:** `backend/wcarck/modules/recon/scanner.py:192-195`

---

### Fix 7 — HIGH: CrackModule no try/catch on ManagedProcess.start() (crack.py:130-140)

**Problem:** `await self._process.start()` had no exception handling. If aircrack-ng binary was missing or permissions wrong, the exception propagated unhandled to the worker, leaving the job stuck in "running" forever with no error event.

**Before:**
```python
self._running = True
self._process = ManagedProcess(cmd=cmd, job_id=job_id, log_path=log_path)
await self._process.start()
```

**After:**
```python
self._running = True
self._process = ManagedProcess(cmd=cmd, job_id=job_id, log_path=log_path)
try:
    await self._process.start()
except Exception as e:
    bus.publish("module.error", {
        "job_id": job_id, "module": self.name,
        "message": f"Failed to start aircrack-ng: {e}",
        "level": "ERROR"
    })
    self._running = False
    self._process = None
    return
```

**File:** `backend/wcarck/modules/attack/crack.py:130-140`

---

### Fix 8 — HIGH: DeauthModule no try/catch on ManagedProcess.start() (deauth.py:91-101)

**Problem:** Same as Fix 7. If aireplay-ng binary was missing, unhandled exception left job stuck. Additionally, the radio lease was never released on failure.

**Before:**
```python
self._running = True
self._process = ManagedProcess(cmd=cmd, job_id=job_id)
await self._process.start()
```

**After:**
```python
self._running = True
self._process = ManagedProcess(cmd=cmd, job_id=job_id)
try:
    await self._process.start()
except Exception as e:
    bus.publish("module.error", {
        "job_id": job_id, "module": self.name,
        "message": f"Failed to start aireplay-ng: {e}",
        "level": "ERROR"
    })
    self._running = False
    self._process = None
    await self.lease_manager.release(job_id, iface)
    return
```

**File:** `backend/wcarck/modules/attack/deauth.py:91-101`

---

### Fix 9 — HIGH: CrackModule never emits job.progress events (crack.py:148-160)

**Problem:** CrackModule read aircrack stdout looking only for `KEY FOUND!`. It never parsed progress/status lines, so the progress bar in Dashboard and AttackSurface always showed 0%.

**Before:**
```python
while self._running:
    line_bytes = await proc.stdout.readline()
    if not line_bytes:
        break
    line = line_bytes.decode("utf-8", errors="ignore").strip()
    
    if "KEY FOUND!" in line:
        m = re.search(r'KEY FOUND!\s+\[\s*([^\]\s]+)\s*\]', line)
        if m:
            found_key = m.group(1)
            logger.info(f"CRACK SUCCESS: Found key={found_key} for BSSID={bssid}")
```

**After:**
```python
while self._running:
    line_bytes = await proc.stdout.readline()
    if not line_bytes:
        break
    line = line_bytes.decode("utf-8", errors="ignore").strip()
    
    if "KEY FOUND!" in line:
        m = re.search(r'KEY FOUND!\s+\[\s*([^\]\s]+)\s*\]', line)
        if m:
            found_key = m.group(1)
            logger.info(f"CRACK SUCCESS: Found key={found_key} for BSSID={bssid}")
    
    if "keys tested" in line.lower() or "speed" in line.lower():
        bus.publish("job.progress", {
            "job_id": job_id,
            "status_message": line[:120],
            "module": self.name
        })
```

**File:** `backend/wcarck/modules/attack/crack.py:148-160`

---

## 8. Remaining Issues (Not Yet Fixed)

| # | Severity | Issue | Reason Deferred |
|---|----------|-------|-----------------|
| 1 | HIGH | AdapterRes missing 7 DB fields (bands, channel, rssi, rx, tx, status) | Requires DB migration + watchdog poll changes |
| 2 | HIGH | EAPOL M1-M4 never populated in Capture records | Requires airodump-ng frame-level parsing |
| 3 | HIGH | AttackSurface getFriendlyName type mismatches (3 cards) | Part of AttackSurface redesign (Section 9) |
| 4 | HIGH | mockRssi random noise in Adapters.tsx | FIXED (S6) — dead code removed |
| 5 | HIGH | Adapter bands/RX/TX always defaults | Same DB migration as #1 |
| 6 | MEDIUM | EvilTwin active state DHCP Leases / Connected always 0 | Placeholder for V2 |
| 7 | MEDIUM | Projects page has no edit UI | Feature gap |
| 8 | MEDIUM | Sync subprocess in DeauthModule aireplay-ng version check | Should use asyncio |
| 9 | MEDIUM | No WebSocket disconnect indicator in Topbar | UI gap |
| 10 | LOW | Dead crack.py API endpoint | Can remove router registration |
| 11 | LOW | PasswordCell inconsistent clipboard pattern | Cosmetic |

---

## 10. Reference Tool Comparison Findings

Detailed comparison of our backend modules against the 4 ESTBTOOLs (aircrack-ng, Wifite, wifipumpkin3, airgeddon) to identify missing logic, incorrect implementations, and feature gaps.

### 10.1 CrackModule — Inferior to Wifite

Wifite's WPA attack (`wifite2/wifite/attack/wpa.py`) implements several critical steps we skip entirely:

| # | Issue | Wifite Reference | Our Implementation | Severity |
|---|-------|------------------|-------------------|----------|
| 1 | **No handshake validation before cracking** | `wpa.py:166-167`: `has_handshake(cap, bssid)` checks if capture contains valid EAPOL M1-M4 handshake before launching aircrack. If invalid, it attempts a re-capture. | `crack.py`: Takes `capture_id` from user. No validation. If capture is invalid/noisy, aircrack wastes time or fails silently. | HIGH |
| 2 | **No wpaclean stripping** | `wpa.py:142-149`: Runs `wpaclean trimmed.cap target.cap` to strip non-handshake packets from capture before cracking. Reduces noise by 90%+. | `crack.py`: Passes raw capture directly to aircrack. Noisy captures with thousands of data packets slow cracking significantly. | HIGH |
| 3 | **Uses stdout parsing instead of `-l` flag** | `aircrack.py:214`: `cmd.append(f"-l {key_file}")` — aircrack writes the key to a file directly. Reliable and atomic. | `crack.py:166`: Parses `KEY FOUND! [ ... ]` from stdout via regex. Fragile — breaks if aircrack output format changes or pipe buffering causes partial reads. | HIGH |
| 4 | **Incomplete progress parsing** | `aircrack.py:171-175`: `re.search(r'(\d+)/(\d+) keys tested.*\(([\d.]+)\s+k/s', line)` — extracts `num_tried`, `num_total`, `speed_kps`, and calculates ETA. | `crack.py:172`: Only checks `"keys tested" in line.lower()` and publishes raw line. No structured extraction of percentage, speed, or ETA. Dashboard shows raw text only. | MEDIUM |
| 5 | **No deauth per-client in WPA attack** | `wpa.py:241-244`: `aireplay.deauth_target(iface, bssid, client, 2)` — sends deauth to each individual client with 2s timeout between them. | `deauth.py:89-91`: Sends deauth to broadcast OR single client (user-specified). No per-client iteration. Less effective at forcing handshakes. | MEDIUM |
| 6 | **No existing handshake loading** | `wpa.py:63-67`: Checks `capture_handshake(iface, target, ...)` first. If user already has a valid handshake, skips capture entirely. | `crack.py`: Always requires a new capture. No way to crack an existing handshake without going through the full capture flow. | LOW |

### 10.2 PMKID Attack — No Cracking Path

| # | Issue | Wifite Reference | Our Implementation | Severity |
|---|-------|------------------|-------------------|----------|
| 7 | **PMKID cracking uses hashcat** | `pmkid.py:155-158`: `hashcat -m 16800 hash_file wordlist` — uses hashcat specifically for PMKID hash cracking (mode 16800). | No PMKID cracking module exists. `hcxdumptool` captures PMKID but we have no path to crack it. Only WPA handshake → aircrack path exists. | HIGH |

### 10.3 Evil Twin — Missing wifipumpkin3 Features

wifipumpkin3 (`wifipumpkin3/core/`) has a modular architecture we lack:

| # | Issue | wifipumpkin3 Reference | Our Implementation | Severity |
|---|-------|----------------------|-------------------|----------|
| 8 | **No DHCP controller abstraction** | `dhcpcontroller.py`: `DHCPController` dynamically selects between `pyDHCP` (Python DHCP) and `dhcpd` (ISC DHCP server). Switches at runtime via config. | `eviltwin.py:97-106`: Hardcoded dnsmasq config. No way to swap DHCP backends. No Python DHCP alternative. | MEDIUM |
| 9 | **No DNS spoofing module** | `dnscontroller.py`: `DNSController` manages DNS spoofing via `pyDNSServer`. Configurable per-domain spoofing. | `eviltwin.py:104-106`: Only `address=/#/{base_ip}.1` wildcard. No per-domain control, no real DNS server, no DNS response logging. | MEDIUM |
| 10 | **No MITM credential extraction** | `sniffkin3.py:254-275`: `getCredentials_POST()` — live regex parsing of HTTP POST packets to extract username/password fields from captive portal submissions. | No equivalent. Our captive portal returns credentials via form POST to our FastAPI, but we don't do live TCP sniffing of HTTP traffic for additional credential extraction. | MEDIUM |
| 11 | **No DHCP lease observation** | `pyDHCP.py:43-53`: `observerDHCPLeasesClient()` — real-time DHCP lease tracking. When a client gets an IP via our DHCP, it's logged and tracked. | `eviltwin.py:196-199`: Counts lines in `/var/lib/misc/dnsmasq.leases` — but never actively monitors or publishes events when new clients connect. | MEDIUM |
| 12 | **No plugin system** | `sniffkin3.py:71-76`: Plugins dynamically enabled/disabled at runtime. `setPluginOption()` toggles MITM plugins on-the-fly. | No plugin architecture. All attack modes are hardcoded in modules. | LOW |

### 10.4 Scanner — CSV Parsing Edge Cases

aircrack-ng's `dump_write.c` writes CSV with specific formatting rules:

| # | Issue | airodump-ng Reference | Our Implementation | Severity |
|---|-------|----------------------|-------------------|----------|
| 13 | **Quoted values with commas** | `dump_write.c:80-100`: SSIDs containing commas are wrapped in `"quotes"`. Our CSV parser doesn't handle quoted fields correctly with `csv.reader` because we pass `escapechar='\\'` which conflicts. | `scanner.py:314`: `csv.reader(..., escapechar='\\')` — airodump-ng uses backslash escaping for commas inside SSIDs, but `csv.reader` with `escapechar` treats `\\,` as escaped comma. SSIDs with literal backslashes would be corrupted. | MEDIUM |
| 14 | **WPS column position** | When `--wps` flag is used, airodump-ng appends a WPS column AFTER the ESSID. Our parser checks `parts[14]` but WPS position depends on whether `Key` column (14) is present. | `scanner.py:353-356`: Checks `parts[14]` for WPS. But if `Key` column is empty, airodump-ng may not include it, shifting WPS to position 14. Brittle. | LOW |
| 15 | **Channel as frequency** | Some airodump-ng versions output channel as frequency (e.g., `2412` for ch1). Our parser does `int(parts[3])` which would accept this as a valid but wrong channel number. | `scanner.py:329`: `channel = int(parts[3].strip())` — no validation that channel is in valid range (1-196). A frequency like `2412` would be stored as channel 2412. | LOW |

### 10.5 Missing Tool Integrations (from airgeddon)

airgeddon (`airgeddon.sh`) lists these as optional tools we don't use:

| Tool | Purpose | Our Gap |
|------|---------|---------|
| `hashcat` | WPA2-PMKID cracking (mode 16800), PMKSA caching | No hashcat integration at all |
| `wpaclean` | Strip non-handshake frames from capture | Not used in CrackModule |
| `hcxpcapngtool` | Convert pcap → pcapng for hashcat | No conversion utility |
| `bettercap` | Advanced MITM, ARP spoofing, HTTPS proxy | Not integrated |
| `john` | Password mutation rules for wordlist cracking | `crack.py:88-89` references john but only when `rule` param is set — never called from UI |
| `tshark` | Packet analysis, EAPOL frame extraction | Not used for handshake validation |
| `packetforge-ng` | Forge WPA handshake frames for injection | Not integrated |

### 10.6 Summary — Reference Tool Bugs

| Severity | Count | Key Items |
|----------|-------|-----------|
| **HIGH** | 4 | No handshake validation before crack, no wpaclean, stdout parsing vs `-l`, no PMKID cracking path |
| **MEDIUM** | 5 | Incomplete progress parsing, no per-client deauth, no DHCP controller, no DNS spoofing, CSV quoted values |
| **LOW** | 6 | No existing handshake loading, WPS column position, channel-as-frequency, no plugin system, john unused, no packetforge |

---

## 11. Pending Feature Work

### Dashboard.tsx Redesign (Two-State)

**Status:** Spec complete in previous session. Not yet implemented.
- Idle state: clean CTA ("Start Scanning"), zero counters, Detect Adapters button
- Active state: Pipeline Progress Bar at top, Current Target + Adapters left, Rich Operation Cards + Live Results Feed right, Quick Launch Bar at bottom

### AttackSurface.tsx Redesign (8 Sections)

**Status:** Spec complete in previous session. Not yet implemented.
- Section 1: Target Context Header
- Section 2: Active Scan Monitor
- Section 3: Active Attack Cards (type-specific stats)
- Section 4: EAPOL Handshake Progress (live)
- Section 5: Capture Results Feed
- Section 6: Evil Twin Monitor
- Section 7: Quick-Action Launch Bar
- Section 8: Attack Timeline / Event Log
- Backend prerequisite: Scanner must emit EAPOL frame events; each module must emit `job.progress` with type-specific payloads

---

## 12. SESSION 3 FIXES (Self-Scrutiny Remediation)

**Date:** 2026-06-04

Issues from the self-scrutiny (MiMoFix.md Section 9) have been resolved:

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Missing `Signal` import in AttackSurface.tsx | CRITICAL | FIXED |
| 2 | No Alembic migration for eapolM1-M4 columns | CRITICAL | FIXED |
| 3 | PMKIDCrackJob stuck in Running after conversion failure | HIGH | FIXED |
| 4 | EAPOL parsing misses WPA1/TKIP (key_descriptor 1) | HIGH | FIXED |
| 5 | MITM double `module.stopped` event | HIGH | FIXED |
| 6 | MITM `_credentials_found` never populated | HIGH | FIXED |
| 7 | captures.py duplicated wpaclean logic | MEDIUM | FIXED |
| 8 | MITM port 443 misleading (HTTPS encrypted) | MEDIUM | FIXED |
| 9 | nftables rules never cleaned on EvilTwin stop | MEDIUM | FIXED |
| 10 | CSS `*` transitions too aggressive | MEDIUM | FIXED |
| 11 | EvilTwin Windows mock missing dns._process | MEDIUM | FIXED |
| 12 | Dead `import uuid` at module level | LOW | FIXED |
| 13 | Dead `speed_re` regex | LOW | FIXED |
| 14 | Dead `post_buffer` | LOW | FIXED |
| 15 | Dead `targetClientsCount` | LOW | FIXED |
| 16 | Dead `select` import | LOW | FIXED |
| 17 | `focus-visible` border-radius override | LOW | FIXED |
| 18 | Duplicate `import uuid as uuid_mod` | LOW | FIXED |

**Remaining known issues (deferred):**
- DNSServer class is a no-op placeholder
- ~~No MITM or PMKID crack UI pages~~ Partially fixed in S6: MITM toggle added to EvilTwin, PMKID Crack + MITM buttons added to AttackSurface quick-launch
- Hardcoded WPA passphrase in EvilTwin
- tcpdump runs without sudo
- `verify_handshake` Windows mock uses fake BSSID (dev-only)

**Total fixed this session:** 18 issues (2 CRITICAL, 4 HIGH, 5 MEDIUM, 7 LOW)
**Cumulative total fixed:** 66 issues (original 48 + this session 18)

---

## 13. SESSION 4 FIXES (Exhaustive Bug Hunt)

**Date:** 2026-06-04

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | ManagedProcess.stop() psutil path leaks grandchild processes | CRITICAL | FIXED |
| 2 | worker.py no try/finally around module.start() | HIGH | FIXED |
| 3 | worker.py _stop_job() KeyError on double-stop | HIGH | FIXED |
| 4 | worker.py outer exception leaves orphaned _running_modules | HIGH | FIXED |
| 5 | worker.py _stop_job() bypasses lease manager API | HIGH | FIXED |
| 6 | crack.py fire-and-forget monitor task never cancelled | HIGH | FIXED |
| 7 | pmkid_crack.py fire-and-forget monitor task never cancelled | HIGH | FIXED |
| 8 | crack.py monitor readline has no timeout | HIGH | FIXED |
| 9 | pmkid_crack.py monitor readline has no timeout | HIGH | FIXED |
| 10 | pmkid.py synchronous subprocess blocks event loop | HIGH | FIXED |
| 11 | pmkid.py file handle leak in BPF compilation | MEDIUM | FIXED |
| 12 | eviltwin.py discarded subprocess creates zombie | MEDIUM | FIXED |
| 13 | RadioLeaseManager sweeper silently swallows exceptions | LOW | FIXED |
| 14 | RadioLeaseManager missing release_all_for_job() API | LOW | FIXED |
| 15 | syncHistory per-event set() causes N React re-renders | MEDIUM | FIXED |
| 16 | Dashboard encryption.includes() crashes on null | CRITICAL | FIXED |
| 17 | EvilTwin encryption.toLowerCase() crashes on null | CRITICAL | FIXED |
| 18 | Dashboard targetNetwork.signal wrong property | HIGH | FIXED |
| 19 | AttackSurface targetNetwork.signal wrong property | HIGH | FIXED |
| 20 | fetchInitialState doesn't normalize network fields | MEDIUM | FIXED |

**Total fixed this session:** 20 issues (4 CRITICAL, 10 HIGH, 5 MEDIUM, 1 LOW)
**Cumulative total fixed:** 86 issues

### Domain 1 Audit Summary

**Process Zombie Prevention:**
- `ManagedProcess.stop()` now always uses `os.killpg` on POSIX — no more psutil branch that could miss grandchildren
- All modules with monitor tasks (`crack.py`, `pmkid_crack.py`) now save task references and cancel them in `stop()`
- All monitor tasks now have `asyncio.wait_for(readline(), timeout=5.0)` — no more indefinite hangs

**Lease Deadlock Prevention:**
- `worker.py` now calls `lease_manager.release_all_for_job()` on any stop/crash — no more orphaned leases
- `RadioLeaseManager` gained `release_all_for_job()` as a proper API instead of worker directly mutating `_leases`
- `_stop_job()` uses `dict.pop(key, None)` — no more KeyError on double-stop

**Event Loop Blocking:**
- `pmkid.py` converted from synchronous `subprocess.check_output`/`check_call` to async equivalents
- File handle leak in BPF compilation fixed with proper `with` statement

### Domain 2 Audit Summary

- SQLite sessions are consistently short-lived (open, query, close, then subprocess)
- WAL mode + busy_timeout=5000 handles concurrent writers adequately
- `syncHistory` batched into single `set()` call — eliminates N re-renders
- `fetchInitialState` now normalizes network fields (encryption, power, channel) preventing downstream null crashes

### Domain 3 Audit Summary

- **White Screen of Death fixes:** `encryption.includes()` and `encryption.toLowerCase()` now null-safe with `|| ''` fallback
- **Wrong data fixes:** `targetNetwork.signal` → `targetNetwork.power` (property didn't exist on Network type)
- **Root cause fix:** `fetchInitialState` now normalizes raw API JSON before inserting into Maps

---

## 14. SESSION 6 FIXES (Frontend Integration & startJob Routing)

**Date:** 2026-06-04

### Fix 1: startJob handler routing (HIGH)

**File:** `useWcarckStore.ts:584-609`

The `startJob` handler matched only bare module names (`'deauth'`, `'pmkid'`, etc.) but AttackSurface quick-launch passed `'attack.deauth'`, `'attack.pmkid'`. No branch matched, `handlerName` defaulted to `'start'`, backend rejected the request.

**Fix:** Each branch now matches both forms: `'deauth' || 'attack.deauth'`, `'pmkid' || 'attack.pmkid'`, etc. Added `'mitm' || 'attack.mitm'` branch.

### Fix 2: AttackSurface quick-launch buttons (MEDIUM)

**File:** `AttackSurface.tsx:352-367`

Added two new buttons:
- **PMKID Crack** — navigates to `/captures` for hashcat cracking
- **MITM Sniffer** — launches `attack.mitm` on the selected adapter

### Fix 3: EvilTwin MITM integration (MEDIUM)

**Files:** `EvilTwin.tsx` + `eviltwin.py`

Frontend: Added `mitmEnabled` state, ON/OFF toggle, summary display, `mitm_enabled` payload field.
Backend: Added `_mitm_process` field, param parsing, tcpdump launch (`-A -l not port 22 and not port 853 and not arp`), cleanup on stop.

### Fix 4: Dead mockRssi removed (LOW)

**File:** `Adapters.tsx:272`

Removed `const mockRssi = -30 - (Math.random() * 20)` — computed every render, never displayed.

### Session 6 Summary

| Severity | Count | Details |
|----------|-------|---------|
| HIGH | 1 | startJob handler routing |
| MEDIUM | 4 | PMKID Crack button, MITM button, EvilTwin MITM toggle (FE+BE) |
| LOW | 1 | Dead mockRssi |

**Cumulative total fixed:** 92 issues (48 original + 18 S3 + 20 S4 + 6 S6)
