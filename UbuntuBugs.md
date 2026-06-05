# Ubuntu Bugs

## Bug #1: WiFi Adapters Not Detected in Frontend

**Status:** Fixed
**Severity:** High
**Component:** Backend API (`/api/adapters`)
**Date Found:** 2026-06-04
**Date Fixed:** 2026-06-04

### Description

The app detects WiFi adapters correctly (confirmed via backend logs and DB), but the frontend shows none because `GET /api/adapters` returns a **500 Internal Server Error**.

### Root Cause

Pydantic response validation failure in `AdapterRes` (`backend/wcarck/api/adapters.py:24-42`):

1. **`bands` field** — The DB model (`models.py:49`) stores `bands` as `[2.4, 5]` (floats) via `mapped_column(JSON, default=lambda: [2.4, 5])`. The `AdapterRes` schema declares `bands: Optional[List[str]]`, which rejects float inputs with:
   ```
   Input should be a valid string, input: 2.4
   ```

2. **`last_seen` field** — The DB stores `datetime` objects, but `AdapterRes` declares `last_seen: Optional[str]`, causing:
   ```
   Input should be a valid string, input: datetime.datetime(2026, 6, 4, 20, 54, 32, 362781)
   ```

### Error Log

```
fastapi.exceptions.ResponseValidationError: 10 validation errors:
  {'type': 'string_type', 'loc': ('response', 0, 'bands', 0), 'msg': 'Input should be a valid string', 'input': 2.4}
  {'type': 'string_type', 'loc': ('response', 0, 'bands', 1), 'msg': 'Input should be a valid string', 'input': 5}
  ...
  {'type': 'string_type', 'loc': ('response', 2, 'last_seen'), 'msg': 'Input should be a valid string', 'input': datetime.datetime(2026, 6, 4, 20, 54, 32, 362781)}
```

### Fix

Changed `AdapterRes` in `backend/wcarck/api/adapters.py`:

- `bands: Optional[List[str]]` → `bands: Optional[list]`
- `last_seen: Optional[str]` → `last_seen: Optional[datetime]`
- Added `try/except` in `list_adapters` endpoint for robustness

---

## Bug #2: Fake Adapter Seed Data Shown as Real Hardware

**Status:** Fixed
**Severity:** Medium
**Component:** Backend DB initialization (`backend/wcarck/db/session.py`)
**Date Found:** 2026-06-04
**Date Fixed:** 2026-06-04

### Description

The app displayed 4 WiFi adapters when only 2 were real. The extra 2 (`wlan_mon`, `wlan_ap`) were fake seed data hardcoded in `init_db()`, confusing users into thinking phantom hardware was detected.

### Root Cause

`init_db()` in `backend/wcarck/db/session.py:86-107` seeded two fake `Adapter` rows whenever the adapters table was empty:

```python
mon_adapter = Adapter(
    mac="00:c0:ca:8b:21:11",
    iface_name="wlan_mon",
    chipset="RTP3070",
    driver="rt2800usb",
    current_mode="monitor",
    role="recon.scanner"
)
ap_adapter = Adapter(
    mac="00:c0:ca:8b:21:22",
    iface_name="wlan_ap",
    chipset="Atheros AR9271",
    driver="ath9k_htc",
    current_mode="managed",
    role="attack.eviltwin"
)
```

These were development placeholders that persisted into production.

### Fix

Removed the fake adapter seeding block from `init_db()`. Only the real `AdapterWatchdog` hardware discovery now populates the adapters table. Also removed the unused `Adapter` import from `session.py`.

---

## Bug #3: start.sh Crashes After "Installing backend Python packages"

**Status:** Fixed
**Severity:** High
**Component:** Build system (`start.sh`, `install.sh`, `pyproject.toml`)
**Date Found:** 2026-06-04
**Date Fixed:** 2026-06-04

### Description

`sudo ./start.sh` crashes immediately after printing "Installing backend Python packages..." with no error message. The script exits silently due to `set -euo pipefail`.

### Root Cause

`pip install -e .` (editable install) fails with:

```
error: Multiple top-level packages discovered in a flat-layout: ['wcarck', 'alembic'].
```

Setuptools detects both `wcarck/` and `alembic/` directories at the project root and refuses to build. `set -euo pipefail` kills the script on this non-zero exit code.

Two files had this bug:
- `start.sh:169` — `"$VENV_DIR/bin/pip" install -e .`
- `install.sh:75` — `sudo -u wcarck .venv/bin/pip install -e .`

### Fix

1. **`pyproject.toml`** — Added `[tool.setuptools.packages.find]` with `include = ["wcarck*"]` to tell setuptools which package to build
2. **`start.sh`** — Changed `pip install -e .` to `pip install .` and added `import wcarck` check to skip reinstall if already installed
3. **`install.sh`** — Changed `pip install -e .` to `pip install .`

---

## Bug #4: Emoji Icons in Adapter Role Dropdown

**Status:** Fixed
**Severity:** Low (cosmetic)
**Component:** Frontend (`Adapters.tsx`)
**Date Found:** 2026-06-04
**Date Fixed:** 2026-06-04

### Description

The adapter role dropdown (`Auto`, `Scanner`, `Injector`, `Access Point`, `Uplink`) used emoji characters instead of consistent lucide-react icons like the rest of the app.

### Root Cause

Hardcoded emoji strings in `SelectItem` components:

```tsx
<SelectItem value="Auto">🤖 Auto</SelectItem>
<SelectItem value="Scanner">📡 Scanner</SelectItem>
<SelectItem value="Injector">⚡ Injector</SelectItem>
<SelectItem value="AP">🗼 Access Point</SelectItem>
<SelectItem value="Uplink">🌐 Uplink</SelectItem>
```

### Fix

Replaced emojis with lucide-react icons matching the app's design system:

| Role | Before | After |
|------|--------|-------|
| Auto | 🤖 | `<Settings className="w-3 h-3" />` |
| Scanner | 📡 | `<Activity className="w-3 h-3" />` |
| Injector | ⚡ | `<Zap className="w-3 h-3" />` |
| Access Point | 🗼 | `<Wifi className="w-3 h-3" />` |
| Uplink | 🌐 | `<Link className="w-3 h-3" />` |

---

## Bug #5: start.sh Reinstalls Backend Packages Every Run

**Status:** Fixed
**Severity:** Low (performance)
**Component:** Build system (`start.sh`)
**Date Found:** 2026-06-04
**Date Fixed:** 2026-06-04

### Description

When `start.sh` triggered installation (e.g. due to missing `node_modules`), it always reinstalled all backend Python packages even if they were already present, adding unnecessary delay.

### Root Cause

The `pip install .` command ran unconditionally inside the `NEEDS_INSTALL` block without checking if `wcarck` was already importable.

### Fix

Added an `import wcarck` check before running pip install:

```bash
if ! "$VENV_DIR/bin/python" -c "import wcarck" &>/dev/null; then
    # install packages
else
    status_pass "Backend Python packages already installed"
fi
```

---

## Bug #6: start.sh Loops 30 Times on Backend Health Check

**Status:** Fixed
**Severity:** Medium
**Component:** Build system (`start.sh`)
**Date Found:** 2026-06-04
**Date Fixed:** 2026-06-04

### Description

After the backend started, `start.sh` looped through 30 retries (15 seconds) before giving up with "Backend not responding". The backend was actually running and healthy.

### Root Cause

The health check polled `GET /api/adapters` with `curl -sf`:

```bash
while ! curl -sf "http://127.0.0.1:${BACKEND_PORT}/api/adapters" &>/dev/null; do
```

`-f` makes curl return non-zero on HTTP errors. Since `/api/adapters` was returning **500** (Bug #1), the loop retried every time, thinking the backend wasn't ready yet.

### Fix

Changed the health check endpoint to `/docs`, which always returns 200:

```bash
while ! curl -sf "http://127.0.0.1:${BACKEND_PORT}/docs" &>/dev/null; do
```

---

## Bug #7: Frontend Not Reachable From Browser

**Status:** Fixed
**Severity:** High
**Component:** Build system (`start.sh`)
**Date Found:** 2026-06-04
**Date Fixed:** 2026-06-04

### Description

`start.sh` reports "Frontend running" but the browser cannot connect to `http://localhost:3000`.

### Root Cause

Vite's `npm run dev -- --port 3000` binds to **IPv6 localhost only** (`[::1]:3000`) by default. Browsers using IPv4 (`127.0.0.1`) cannot reach it.

```
LISTEN  0  511  [::1]:3000  [::]:*  users:(("node",pid=20582,fd=17))
```

The backend correctly binds to `0.0.0.0:8000`, but the frontend lacked the `--host` flag.

### Fix

Added `--host 0.0.0.0` to the Vite dev server command in `start.sh`:

```bash
npm run dev -- --port "$FRONTEND_PORT" --host 0.0.0.0 > "$LOG_DIR/frontend.log" 2>&1 &
```

Now binds to `0.0.0.0:3000` and is reachable from any interface.

---

## Bug #8: start.sh Fails to Kill Backend on Ctrl+C

**Status:** Fixed
**Severity:** Medium
**Component:** Build system (`start.sh`)
**Date Found:** 2026-06-04
**Date Fixed:** 2026-06-04

### Description

Pressing Ctrl+C prints "Shutting down Wcarck..." but the backend process keeps running as an orphan.

### Root Cause

`cleanup()` used `kill "$BACKEND_PID"` which only kills the parent uvicorn process. Uvicorn spawns child worker processes that are not children of the shell's PID, so they survive and keep the port bound.

### Fix

Added 3-layer kill strategy:

1. `kill -- -$PID` — kills the entire process group
2. `pkill -f "uvicorn wcarck.main:app"` — catches any orphaned workers by name
3. `fuser -k 8000/tcp` — kills anything still holding the port

Same applied to frontend with `pkill -f "vite --port"`.

---

## Bug #9: Fake "Acme Corp" Project Seeded on Every Startup

**Status:** Fixed
**Severity:** Low (confusing UX)
**Component:** Backend DB initialization (`backend/wcarck/db/session.py`)
**Date Found:** 2026-06-04
**Date Fixed:** 2026-06-04

### Description

Every fresh database automatically contains a project called "Acme Wireless Audit" with client "Acme Corp" and fake scopes. Users see demo data they didn't create.

### Root Cause

`init_db()` in `session.py:60-84` seeded a default project and scope whenever the projects table was empty — development placeholder that persisted into production.

### Fix

Removed the entire seed block from `init_db()`. Cleaned existing DB with `DELETE FROM scopes; DELETE FROM projects;`.

---

## Bug #10: MAC Randomization Creates Duplicate Adapter Rows

**Status:** Fixed
**Severity:** Medium
**Component:** Backend (`hardware/adapter.py`, `api/adapters.py`)
**Date Found:** 2026-06-05
**Date Fixed:** 2026-06-05

### Description

Randomizing a USB adapter's MAC address caused the UI to show 2 adapter cards — the old MAC and the new MAC — instead of updating the existing one.

### Root Cause

The watchdog's `_upsert_adapter_db()` upserted by **MAC address** (`on_conflict_do_update(index_elements=[Adapter.mac])`). When `macchanger -r` changed the MAC, the new MAC didn't conflict, so a new row was inserted. The old row stayed forever.

Additionally, `randomize_mac()` used `select().scalar_one_or_none()` which threw `Multiple rows were found` when duplicates already existed.

### Fix

1. Changed `_upsert_adapter_db()` to key by **interface name** instead of MAC — queries `select(Adapter).where(Adapter.iface_name == iface)` and updates the existing row
2. Changed `randomize_mac()` to use `result.scalars().first()` instead of `scalar_one_or_none()`
3. After MAC randomization, updates the adapter's MAC in the DB so the watchdog sees the same row

---

## Bug #11: MITM Module Tight Error Loop Eating 96% CPU

**Status:** Fixed
**Severity:** Critical
**Component:** Backend (`modules/attack/mitm.py:141`)
**Date Found:** 2026-06-05
**Date Fixed:** 2026-06-05

### Description

The backend process spiked to 96% CPU and became unresponsive. The WebSocket disconnected, the UI showed "DISCONNECTED", and all API endpoints timed out.

### Root Cause

In `_parse_traffic()`, the `except Exception` handler at line 141 had a bare `continue` with no delay:

```python
except Exception as e:
    logger.debug(f"MITM parse error: {e}")
    continue  # TIGHT LOOP — no sleep
```

When `readuntil()` raised `readuntil() called while another coroutine is already waiting`, the loop retried immediately with zero backoff, spinning at full CPU.

### Fix

Added `await asyncio.sleep(0.5)` before continuing the loop:

```python
except Exception as e:
    logger.debug(f"MITM parse error: {e}")
    await asyncio.sleep(0.5)
```

---

## Bug #12: airodump-ng Crashes With "unrecognized option '--hop-time'"

**Status:** Fixed
**Severity:** High
**Component:** Backend (`modules/recon/scanner.py:91-92`)
**Date Found:** 2026-06-05
**Date Fixed:** 2026-06-05

### Description

Starting a recon scan resulted in "airodump-ng CSV not created after 15s. Is wlx001ea6c65744 in monitor mode?" — even though the adapter was in monitor mode.

### Root Cause

The scanner module passed `--hop-time 250` to airodump-ng, but this flag doesn't exist in aircrack-ng 1.7. airodump-ng printed `"airodump-ng: unrecognized option '--hop-time'"` to stderr and exited immediately.

### Fix

Removed the `--hop-time` flag from the airodump-ng command construction in `scanner.py:90-92`.

---

## Bug #13: ApRes and ClientRes Pydantic Validation Failures

**Status:** Fixed
**Severity:** High
**Component:** Backend API (`api/network.py:11-32`)
**Date Found:** 2026-06-05
**Date Fixed:** 2026-06-05

### Description

`GET /api/networks/aps` and `GET /api/networks/clients` return 500 Internal Server Error, breaking the Recon/Dashboard pages.

### Root Cause

Pydantic response models used field names that don't match the DB model attributes:

- `ApRes.signal_dbm` but DB model `Network` has `max_rssi`
- `ClientRes.bssid` but DB model `Client` has `associated_bssid`
- `ClientRes.signal_dbm` but DB model `Client` has `max_rssi`

### Error Log

```
fastapi.exceptions.ResponseValidationError: 10 validation errors:
  {'type': 'missing', 'loc': ('response', 0, 'bssid'), 'msg': 'Field required', ...}
  {'type': 'missing', 'loc': ('response', 0, 'signal_dbm'), 'msg': 'Field required', ...}
```

### Fix

Added Pydantic `Field(validation_alias=...)` to map response field names to DB model attribute names:

```python
signal_dbm: Optional[int] = Field(default=None, validation_alias="max_rssi")
bssid: Optional[str] = Field(default=None, validation_alias="associated_bssid")
```

---

## Bug #14: Orange Left Border on Active Mission Dossier

**Status:** Fixed
**Severity:** Low (cosmetic)
**Component:** Frontend (`Projects.tsx:175`)
**Date Found:** 2026-06-04
**Date Fixed:** 2026-06-05

### Description

The "Active Mission Dossier" card had an orange left border stripe (`w-1 h-full bg-accent`) that looked cheap and inconsistent with the rest of the UI.

### Fix

Removed the `<div className="absolute top-0 left-0 w-1 h-full bg-accent" />` element.

---

## Bug #15: No Way to Deactivate a Project

**Status:** Fixed
**Severity:** Medium
**Component:** Backend API + Frontend
**Date Found:** 2026-06-04
**Date Fixed:** 2026-06-04

### Description

Once a project was activated, there was no way to deactivate it. The "Active" badge was display-only with no action. Activating a new project deactivated the old one, but you could never have zero projects active.

### Fix

1. **Backend** — Added `POST /api/projects/{project_id}/deactivate` endpoint that sets `active=False` and deactivates all scopes
2. **Frontend Store** — Added `deactivateProject` action and `project.deactivated` WebSocket event handler
3. **Frontend UI** — Replaced the static "Active" badge with a clickable "Deactivate" button on the active project card

---

## Bug #16: Session Timer Runs Even When No Project Active

**Status:** Fixed
**Severity:** Low (cosmetic)
**Component:** Frontend Store (`useWcarckStore.ts`)
**Date Found:** 2026-06-04
**Date Fixed:** 2026-06-04

### Description

The session timer in the topbar kept counting even after all projects were deactivated. Users expected it to stop.

### Fix

- `deactivateProject` now sets `sessionStartedAt: null` (timer resets to 00:00:00)
- `activateProject` now sets `sessionStartedAt: Date.now()` (timer starts fresh)

---

## Bug #17: syncHistory Calls processEvent Inside set(), Causing 100K Recursive State Mutations [FIXED]

**Status:** Fixed
**Severity:** EXTREME CRITICAL (freezes PC, fills 10.7GB RAM)
**Component:** Frontend Store (`useWcarckStore.ts:580-593`)
**Date Found:** 2026-06-05
**Date Fixed:** 2026-06-05

### Description

Opening the app or reconnecting the WebSocket causes Firefox to consume 10.7GB RAM and the entire PC to freeze. The browser tab becomes unresponsive within seconds.

### Root Cause

`syncHistory` wraps a for-loop inside `set()` and calls `get().processEvent(ev)` for each event. `processEvent` (line 387) itself calls `set((state) => {...})`. In Zustand, calling `set()` inside another `set()` callback triggers recursive state replacement.

The EventBus ring buffer holds up to **100,000 events**. On every WebSocket connect, the hub sends ALL of them. `syncHistory` then:

1. Spreads `{ ...state }` creating a 100K-iteration batchState
2. For each event, calls `processEvent` which calls `set()` — each allocating new Map objects for `networks`, `clients`, new arrays for `logs`, `activeJobs`
3. 100K × (new Map + new array + state snapshot) = massive memory allocation
4. The outer `set()` then overwrites everything `processEvent` just set, losing all data

### Fix

Rewrote `syncHistory` to accumulate all changes in plain objects (`netMap`, `cliMap`, `jobs`, `creds`, `logs`) inside the for-loop, then call `set()` ONCE at the end with all accumulated updates. No per-event `set()` calls.

---

## Bug #18: Backend Sends ALL 100K History Events on Every WebSocket Reconnect [FIXED]

**Status:** Fixed
**Severity:** EXTREME CRITICAL (triggers Bug #17 on every reconnect)
**Component:** Backend (`api/hub.py:200`)
**Date Found:** 2026-06-05
**Date Fixed:** 2026-06-05

### Description

The frontend sends `{ type: 'request_history', fromSeq: get().lastEventSeq }` to request only missed events. The backend ignores `fromSeq` and sends the entire 100K event ring buffer.

### Root Cause

```python
history = bus.get_history()  # No since_seq parameter!
```

`EventBus.get_history()` supports an optional `since_seq` parameter, but `hub.py` never passes it. Every WebSocket connect (including reconnects after network blips) triggers a full 100K event dump, which then triggers Bug #17 on the frontend.

### Fix

`hub.py` now waits for the client's `request_history` message as the first WebSocket message, extracts `fromSeq`, and passes it to `bus.get_history(since_seq=from_seq)`. Only missed events are sent.

---

## Bug #19: Adapter Events Trigger fetchInitialState() Causing API Fetch Storm [FIXED]

**Status:** Fixed
**Severity:** EXTREME CRITICAL (6 HTTP calls every 2 seconds)
**Component:** Frontend Store (`useWcarckStore.ts:436-439`)
**Date Found:** 2026-06-05
**Date Fixed:** 2026-06-05

### Description

Every `adapter.mode_changed`, `adapter.state_changed`, `adapter.monitor_started`, and `adapter.monitor_stopped` event triggers `fetchInitialState()` via setTimeout. The watchdog fires adapter events every 2 seconds, so this results in **6 parallel HTTP requests every 2 seconds** (adapters, networks, clients, captures, credentials, jobs).

### Root Cause

```js
case 'adapter.mode_changed': {
  setTimeout(() => get().fetchInitialState(), 1500)
```

The adapter state already updates correctly through the WebSocket event system. The `fetchInitialState()` call is redundant and creates a fetch storm.

### Fix

1. Removed `fetchInitialState()` from adapter events. Adapter state is now updated directly from the event payload in `processEvent`.
2. Removed `fetchInitialState()` from `project.activated` event (now only calls `fetchProjects()`).
3. Replaced `fetchInitialState()` in `handshake.captured` events with a targeted fetch of only `/api/captures`.

---

## Bug #20: Scanner Publishes network.updated/client.updated for Unchanged Entries Every 3 Seconds [FIXED]

**Status:** Fixed
**Severity:** High (floods WebSocket with unnecessary events)
**Component:** Backend (`modules/recon/scanner.py:381-389, 440-448`)
**Date Found:** 2026-06-05
**Date Fixed:** 2026-06-05

### Description

After the first scan cycle, every subsequent cycle publishes `network.updated` and `client.updated` for ALL known entries — even if nothing changed. With 5 APs + 10 clients = 15 unnecessary WebSocket events every 3 seconds, each normalized and sent to all clients.

### Root Cause

The `seen_bssids` and `seen_clients` sets are never cleared. Once a BSSID/MAC is seen, all subsequent CSV parses publish `network.updated` or `client.updated` for it, regardless of whether power/beacon/packet values changed.

### Fix

Added `prev_network_values` and `prev_client_values` dicts to track previous power/beacons/ssid/channel/encryption (APs) and power/packets/bssid (clients). Now only publishes `network.updated` / `client.updated` if any value actually changed since last cycle.

---

## Bug #21: credentials Array Grows Unbounded [FIXED]

**Status:** Fixed
**Severity:** Medium (slow memory leak)
**Component:** Frontend Store (`useWcarckStore.ts:516-517`)
**Date Found:** 2026-06-05
**Date Fixed:** 2026-06-05

### Description

Every `credential.captured` event prepends to the `credentials` array with no upper bound. The `logs` array is capped at 200 entries (`MAX_LOGS`), but `credentials` has no cap.

### Root Cause

```js
const creds = [normCred, ...state.credentials]  // No .slice(0, MAX)
```

### Fix

Capped `credentials` at 100 entries in both `syncHistory` and `processEvent`: `[normCred, ...state.credentials].slice(0, 100)`.

---

## Bug #22: pyudev Callback Crashes on poll(timeout=0) Returning None [FIXED]

**Status:** Fixed
**Severity:** Medium (crashes event loop reader)
**Component:** Backend (`hardware/adapter.py:63`)
**Date Found:** 2026-06-05
**Date Fixed:** 2026-06-05

### Description

The pyudev monitor reader calls `udev_callback(self._monitor.poll(timeout=0))`. If `poll(timeout=0)` returns `None` (no device event), `udev_callback(None)` crashes with `AttributeError: 'NoneType' object has no attribute 'action'`.

### Root Cause

```python
loop.add_reader(fd, lambda: udev_callback(self._monitor.poll(timeout=0)))
```

No guard against `None` return from `poll()`.

### Fix

Added `if device is None: return` guard at the top of `udev_callback`.

---

## Bug #23: SQLite "database is locked" — busy_timeout Not Set on Each Connection [FIXED]

**Status:** Fixed
**Severity:** HIGH (every adapter upsert fails, floods logs with errors)
**Component:** Backend (`db/session.py:28-34`)
**Date Found:** 2026-06-05
**Date Fixed:** 2026-06-05

### Description

Every 2 seconds, the adapter watchdog tries to upsert adapter data to SQLite. Every attempt fails with `(sqlite3.OperationalError) database is locked`. The logs flood with hundreds of these errors per minute.

### Root Cause

`PRAGMA busy_timeout=5000` was only set in `init_db()` on the engine-level connection. Individual `SessionLocal()` connections did NOT inherit this pragma because `set_sqlite_pragma` listener only set `journal_mode`, `synchronous`, and `foreign_keys` — not `busy_timeout`. Without it, SQLite immediately fails when the DB is locked instead of waiting.

### Fix

Added `PRAGMA busy_timeout=5000` to the `set_sqlite_pragma` event listener so every connection gets it.

---

## Bug #24: Adapters API 500 — Pydantic Type Mismatch (bands/last_seen) [FIXED]

**Status:** Fixed
**Severity:** HIGH (adapters page completely broken)
**Component:** Backend (`api/adapters.py:24-42`)
**Date Found:** 2026-06-05
**Date Fixed:** 2026-06-05

### Description

`GET /api/adapters` returns 500 Internal Server Error with Pydantic validation errors.

### Root Cause

```python
bands: Optional[List[str]] = None   # DB stores [2.4, 5.0] (floats)
last_seen: Optional[str] = None     # DB stores datetime objects
```

### Fix

Changed to `bands: Optional[List[float]]` and `last_seen: Optional[datetime]`. Added `from datetime import datetime` import.

---

## Bug #25: EventBus Permanently Evicts WebSocket Subscriber on Queue Overflow [FIXED]

**Status:** Fixed
**Severity:** EXTREME CRITICAL (frontend stops receiving ALL events — networks, clients, logs, jobs)
**Component:** Backend (`core/event_bus.py:42-54`)
**Date Found:** 2026-06-05
**Date Fixed:** 2026-06-05

### Description

Frontend shows "Stale (105s ago)" and stops updating. The WebSocket stays connected but zero events flow. Only a page refresh restores live data — until it happens again.

### Root Cause

When any subscriber's queue overflows, `EventBus.publish()` permanently removes that subscriber from `_subscribers`:

```python
stale_queues = []
for queue in list(self._subscribers):
    try:
        queue.put_nowait(event)
    except asyncio.QueueFull:
        stale_queues.append(queue)  # marked for eviction

for queue in stale_queues:
    self._subscribers.discard(queue)  # PERMANENTLY removed
```

The WebSocket subscriber uses `max_queue_size=1000`. `ManagedProcess._drain_stdout()` publishes `process.stdout` for EVERY line of airodump-ng output (hundreds/sec). The 1000-slot queue fills in seconds → subscriber evicted → frontend gets zero events forever.

### Fix (3 changes)

1. **`event_bus.py`** — Removed eviction logic. On queue overflow, drop the event for that subscriber but keep them subscribed to receive future events.
2. **`process.py`** — Throttled `process.stdout` to publish every 5th line instead of every line (~80% reduction in event volume).
3. **`hub.py`** — Increased WebSocket subscriber queue from 1000 to 5000 for more headroom.

---

## Bug #26: CSV Polling Causes 3-Second Delay vs Airodump-ng Real-Time Output [FIXED]

**Status:** Fixed
**Severity:** HIGH
**Component:** Backend (`modules/recon/scanner.py`)
**Date Found:** 2026-06-05
**Date Fixed:** 2026-06-05

### Description

Scanner relied on periodic CSV polling (`_tail_csv` + `_parse_csv_file`) every 2 seconds. Airodump-ng writes CSV with a configurable interval (default 1s), but the file is only flushed on channel hop. This means network data was 2-3 seconds behind airodump-ng's actual stdout, making the UI feel sluggish compared to running airodump-ng directly in a terminal.

### Fix

Replaced CSV polling with real-time stdout parsing (`_parse_stdout`). The scanner now reads airodump-ng's stdout line-by-line using a state machine that detects AP and Client sections. Events fire as soon as data appears on stdout (sub-second latency).

CSV is still written to disk for PCAP handshake capture on stop — it's just no longer the data source.

---

## Bug #27: Missing Client Fields (Lost, Rate, Probes) in DB/API/Frontend [FIXED]

**Status:** Fixed
**Severity:** MEDIUM
**Component:** Backend models, API, Frontend store
**Date Found:** 2026-06-05
**Date Fixed:** 2026-06-05

### Description

Airodump-ng outputs `Lost` (packet loss), `Rate` (data rate), and `Probes` (probed SSIDs) for each client station. These fields were never stored in the DB, returned by the API, or displayed in the frontend.

### Fix

1. **`models.py`** — Added `lost: Integer` and `rate: String` columns to `Client` model
2. **`session.py`** — Added `ALTER TABLE IF NOT EXISTS` migration for existing databases
3. **`network.py`** — Updated `ClientRes` with `lost`, `rate`, `first_seen`, `last_seen`, `probed_ssids` fields
4. **`listener.py`** — Updated Client upsert to include `lost` and `rate`
5. **`useWcarckStore.ts`** — Added `lost`, `rate`, `probedSsids`, `firstSeen` to Client type and processEvent
6. **`Reconnaissance.tsx`** — Added Client table with all airodump-ng columns (MAC, BSSID, PWR, Frames, Lost, Rate, Last Seen, Probes)

---

## Bug #28: AP Table Missing airodump-ng Columns (WPS, Cipher, Auth, First/Last Seen) [FIXED]

**Status:** Fixed
**Severity:** MEDIUM
**Component:** Frontend table, API response
**Date Found:** 2026-06-05
**Date Fixed:** 2026-06-05

### Description

The AP table only showed: SSID, BSSID, CH, Band, Signal, ENC, Beacons, Data, Clients. Missing: Cipher, Auth, WPS, First Seen, Last Seen — all available from airodump-ng and the DB.

### Fix

1. **`network.py`** — Added `wps`, `first_seen`, `last_seen` fields to `ApRes`
2. **`useWcarckStore.ts`** — Added `wps`, `firstSeen` to Network type; processEvent preserves existing values on updates
3. **`Reconnaissance.tsx`** — Added Cipher, Auth, WPS, Last Seen columns; added horizontal scroll (`min-w-max`) for table overflow; added WPS badge to contextual panel
