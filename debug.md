# Wcarck — Debug Log

> Living document. Updated after each debugging session.
> Authored from a real Ubuntu 26.04 install on `codex` (host Parikshit) on 2026-06-04.

---

## Session 1 — 2026-06-04 — Adapters showing as mock data

### Symptom (reported)
- App boots, frontend at `:5173`, backend at `:8080`, `/api/health` → `{"status":"ok"}`.
- `/api/adapters` returns **2 adapters** that do not exist on the system:
  - `wlan_mon`  `00:c0:ca:8b:21:11`  `RTP3070`  `rt2800usb`  `monitor`
  - `wlan_ap`   `00:c0:ca:8b:21:22`  `Atheros AR9271`  `ath9k_htc`  `managed`
- Real hardware present but invisible to the app:
  | Iface | MAC | Driver | Status |
  |---|---|---|---|
  | `wlo1` (laptop internal) | `28:d0:43:0a:73:8c` | Intel (`asus-wlan`) | UP, connected to `NASA` |
  | `wlx001ea6c65744` (USB) | `00:1e:a6:c6:57:44` | Ralink MT7601U (`148f:7601`) | UP, connected to `NASA` |
  | `wlx5c628b765de2` (USB) | `5c:62:8b:76:5d:e2` | RTL8821AU (`2357:0120`, TP-Link Archer T2U PLUS) | DOWN, NO-CARRIER |
- App is "not working" because the recon module tries to call `airodump-ng wlan_mon` against a non-existent interface.

### Root cause — three coupled bugs

#### Bug A — Mock adapters are seeded into the DB on first run
**File:** `backend/wcarck/db/session.py:77-97`
**What:** `init_db()` inserts two hardcoded `Adapter` rows (wlan_mon + wlan_ap) the first time the DB is created, with chipset/driver strings that look real but reference no real hardware.
**Why it bites:** `/api/adapters` (in `api/adapters.py:23-27`) is a pure `SELECT * FROM adapters`. It cannot tell the difference between a real adapter and a seed row, so the frontend renders the mocks.
**Fix options:**
1. Delete the seed block entirely. The watchdog should populate the table (see Bug B).
2. Keep the seed but mark rows with `is_real=0` and filter them out of the API unless `WCARCK_SIMULATE=1`.
3. Add a startup reconciliation step: for each row, validate via `ip link show <iface>`; mark missing rows stale.

**Status:** open. Currently shipping mock data to the UI.

#### Bug B — `AdapterWatchdog` discovers real hardware but never writes to the DB
**File:** `backend/wcarck/hardware/adapter.py:73-138` (`_watch_loop`)
**What:** The watchdog polls `iw dev` every 2s, collects real interface names into `self._adapters` (in-memory dict), and publishes `adapter.gone` events. It **never** opens a DB session and never `INSERT`s into the `adapters` table. Conversely, it never reads the DB to reconcile seeded rows.
**Why it bites:** There is no path from "interface appeared" → `Adapter` row. The frontend is permanently blind to live hardware.
**Fix options:**
1. Inject a DB session factory into `AdapterWatchdog`. On discovery, upsert (`INSERT ... ON CONFLICT(iface_name) DO UPDATE`).
2. Subscribe to `adapter.discovered` events via `db/listener.py` and persist there. Single source of truth: the bus.
3. Add a `POST /api/adapters/refresh` endpoint that scans `iw dev` and returns a diff; frontend can then call it.

**Status:** open. The watchdog is half-built — observation works, persistence doesn't.

#### Bug C — Hardcoded `wlan_mon` / `wlan_ap` names in the watchdog
**File:** `backend/wcarck/hardware/adapter.py:39` and `:58`
**What:** `_ensure_nm_unmanaged` and `_set_regulatory_domain` both loop over a hardcoded list `["wlan_mon", "wlan_ap"]`. These names exist only in the mock seed (Bug A). On a real system they are absent, so:
- `nmcli dev set wlan_mon managed no` → silently no-ops or errors.
- `iw dev wlan_mon set txpower fixed 3000` → `command failed: No such device (-19)` (visible in `journalctl -u wcarck`).
**Why it bites:** Even if Bug B were fixed, the watchdog would still try to manage the wrong interfaces. New adapters the user plugs in get no NM-unmanaged or txpower treatment.
**Fix:** Replace hardcoded list with `self._adapters.keys()` (after Bug B's fix populates it) or with a fresh `iw dev` parse.

**Status:** open.

### Side bug — Downstream modules assume the mock names

| File | Line | Assumption |
|---|---|---|
| `backend/wcarck/modules/recon/scanner.py` | 31 | `params.get("iface", "wlan_mon")` — default is the mock name |
| `backend/wcarck/modules/attack/eviltwin.py` | (similar) | Likely defaults to `wlan_ap` |
| `backend/wcarck/api/jobs.py` | (start-job payload) | Frontend posts the iface from store, which the store populated from `/api/adapters` → mocks |

Until Bug A is fixed, the user must edit the request payload by hand to point at a real interface.

### Recommended fix order (minimum viable)
1. **Bug A fix #2** (add `is_real` flag, filter in API). 10-line change. Unblocks the user immediately.
2. **Bug B fix #1** (watchdog writes to DB). 30-line change with `INSERT ... ON CONFLICT`. Real adapters appear in UI.
3. **Bug C** (replace hardcoded names with discovered set). 5-line change.
4. Reconcile seeded rows: on startup, if a seeded iface doesn't exist, set its mode to `disconnected` and stop returning it for new jobs (don't delete — keeps audit trail).

### What was verified working
- Backend boots cleanly. No `NameError: structlog` (§7.1 already fixed in current code).
- `psutil` import works (added to `pyproject.toml`, §7.3 fixed).
- `worker.py:124` lock reference now uses `_adapter_locks` (§7.2 fixed).
- `journalctl -u wcarck` shows the watchdog running, doing its 2s poll, and discovering real ifaces in its in-memory dict (visible via debug logging).
- Frontend loads; no console errors; Vite proxying to `:8080` via CORS `allow_origins=["*"]`.
- `iw reg get` shows `BO` (set by `wcarck-reg.service` at boot).

### What is NOT working (per user)
- Recon button → spawns `airodump-ng wlan_mon` → device-not-found, no scan.
- Adapter list in UI shows 2 ghost entries, no real ones.
- Toggling the Cpu (simulator) icon in the topbar does nothing on Linux without `WCARCK_SIMULATE=1` (per runbook §11). The toggle is misleading; the icon should be hidden on Linux.

### Open questions for the user
- Q1: For Bug A, is the **delete-seed** path acceptable, or is there a "demo mode" requirement where the mocks should stay selectable from a dropdown?
- Q2: For Bug B, prefer the watchdog-to-DB direct write, or the bus-listener indirect write (cleaner but adds latency)?
- Q3: Should the frontend show a "no real adapter detected" empty state when the only rows in the table are `is_real=0`?

---

## Bug register (running)

| ID | Severity | Title | File | Status |
|---|---|---|---|---|
| B-A | High | Mock adapters seeded into `adapters` table | `db/session.py:77-97` | **fixed** |
| B-B | High | Watchdog doesn't persist discovered adapters | `hardware/adapter.py:73-138` | **fixed** |
| B-C | Medium | Hardcoded `wlan_mon`/`wlan_ap` in watchdog | `hardware/adapter.py:39,58` | **fixed** |
| §7.1 | Low | `structlog` import missing | `main.py` | **fixed** |
| §7.2 | High | `worker.py` uses `_lock` not `_adapter_locks` | `orchestration/worker.py:124` | **fixed** (also fixed in `leases.py:58` sweep + per-key lock in worker teardown) |
| §7.3 | High | `psutil` not in `pyproject.toml` | `pyproject.toml` | **fixed** |
| §7.4 | Low | Pydantic v1 `class Config` deprecation in 6 files (7 occurrences) | `api/{adapters,captures,credentials,jobs,network,projects}.py` | **fixed** |
| §7.5 | High | `DBEventListener._flush_buffers` body is `pass` | `db/listener.py` | **already fixed** (verified 2026-06-04 — full SQLite upsert with `on_conflict_do_update` is implemented) |
| §7.6 | High | `pmkid.py` writes literal `\\n` not newline | `modules/attack/pmkid.py:36` | **fixed** |
| §7.7 | Low | `index.html` uses `className` not `class` | `frontend/index.html:9` | **already fixed** (no class on body — runbook was outdated) |
| §7.8 | Medium | Dashboard action bar re-shows after 24h | `pages/Dashboard.tsx:12-17` | **already fixed** (`shouldShowAction` checks `!== null` — never re-shows) |
| §7.9 | Low | Sidebar has no pin button | `components/layout/Sidebar.tsx:25-62` | **already fixed** (pin toggle in `Sidebar.tsx:80-103`) |
| §7.10 | Low | Sidebar active style wrong (full border vs left-only) | `components/layout/Sidebar.tsx:39-42` | **fixed** (added `border-l-2 border-accent` per spec §2.2) |
| §7.11 | Medium | `Crack.tsx` orphaned (not routed) | `App.tsx` | **already fixed** (route at `App.tsx:34`, nav at `Sidebar.tsx:15`) |
| B-D | Medium | `pyproject.toml` missing `[tool.setuptools.packages.find]` (blocked `pip install -e .` on this Ubuntu 26.04) | `backend/pyproject.toml` | **fixed** |
| B-E | Low | Vite defaults to IPv6 localhost only — needs `--host 0.0.0.0` | `frontend/package.json` (script) | **fixed** (workaround) |
| B-F | Low | `wireshark` group missing on minimal Ubuntu — install.sh `usermod` fails | `install.sh:57` | **fixed** (group manually created; install.sh not robust to this) |
| B-G | High | Watchdog never wrote `current_mode`; Recon dropdown always empty even when an adapter is in monitor mode | `hardware/adapter.py:_watch_loop` | **fixed** |
| B-H | High | Adapters page shows `Unknown` for chipset and driver; bands/RX/TX also blank — watchdog never reads sysfs or `airmon-ng` | `hardware/adapter.py:74-139` (write side), `store/useWcarckStore.ts:238-243` (mask side) | **open** |
| B-I | Medium | "Refresh Inventory" button only toasts; no API/store call | `pages/Adapters.tsx:15-17` | **open** |
| B-J | Medium | "Start Monitor" / "Stop Monitor" button is a `setTimeout` fake; no backend endpoint exists either | `pages/Adapters.tsx:19-26` (+ missing `POST /api/adapters/{iface}/mode`) | **open** |
| B-K | High | `processEvent` guard `event.level && event.message` is **always false** for real events → Logs page is permanently empty | `store/useWcarckStore.ts:397-401` | **open** |
| B-L | High | EventBus emits `{seq, topic, ts_mono, payload}`; `LogEntry` type expects top-level `level`/`channel`/`event_type`/`message` — no mapper; disk log writer has the 14-field schema, the WS stream doesn't | `core/event_bus.py:17-27`, `api/hub.py:18-21,32-36`, `store/useWcarckStore.ts:93-103` | **open** |
| B-M | Medium | No `/api/logs` REST endpoint — historical logs only reachable via WS replay, and that replay is schema-broken (see B-L) | `api/` (no `logs.py` registered in OpenAPI) | **open** |
| B-N | Medium | No service status endpoint or UI panel (`hostapd`/`dnsmasq`/`lighttpd`/`hashcat` up/down) — airgeddon shows this; we don't | `api/` (missing), `pages/Logs.tsx` (no slot) | **open** |
| B-O | Medium | `ManagedProcess._drain_stdout` discards tool stdout/stderr lines instead of republishing them — no live airodump/aireplay/hcxdumptool tail in the UI | `hardware/process.py:_drain_stdout/_drain_stderr` | **open** |
| B-P | Low | Adapter mode-change / gone / driver-recovery events are `logger.info` only; no `bus.publish` — UI never sees monitor toggle or USB vanish events | `hardware/adapter.py:215,224-227,241-254` | **open** |

---

## Session 2 — 2026-06-04 — Bug-fix sweep

### What was done
- B-A: Removed the mock-adapter seed block from `init_db()`. Added `is_real: Boolean` column to `Adapter` model. Added idempotent `ALTER TABLE` in `init_db` so existing DBs (with the historical mock rows) get the new column. Filtered the API response with `WHERE is_real = TRUE`. Mock rows from the old seed still exist in the DB but are now invisible to `/api/adapters`.
- B-B: AdapterWatchdog now opens a DB session and upserts each discovered interface (keyed by MAC, so the iface_name can change between reboots without losing the row). On disappearance, `is_real` is flipped to `0` and the row is hidden from the API. Also added `last_seen` touch on each poll.
- B-C: Replaced the hardcoded `["wlan_mon", "wlan_ap"]` lists in `_ensure_nm_unmanaged` and `_set_regulatory_domain` with per-iface operations driven by the discovered set (`self._adapters`). `_ensure_nm_unmanaged(iface)` is now called per discovery, not at startup.
- B-G (NEW): Watchdog now reads `type` (managed/monitor/AP) from `iw dev` output and writes it to `current_mode` in the DB. Mode-change events are detected on every poll and propagated via a lightweight `UPDATE`. Without this, the Reconnaissance page dropdown (which filters by `mode === 'monitor'`) is empty even after `airmon-ng start`.
- §7.2: My first fix (`_lock` → `_adapter_locks`) was incomplete — `_adapter_locks` is a `defaultdict`, not a lock, so `async with` raised `TypeError` on first job teardown. Fixed by locking per-key in the cleanup loop. Same issue latent in `leases.py:58` `_sweep_expired` — already locking per-key correctly.
- §7.4: All 7 `class Config: from_attributes = True` occurrences across 6 API files converted to `model_config = ConfigDict(from_attributes=True)`. Pydantic v2 syntax.
- §7.6: `pmkid.py:36` — `'\\n'` → `'\n'` (single backslash). hcxdumptool will now get a real newline.
- §7.10: Sidebar active state now uses `border-l-2 border-accent` (left accent border per UI spec §2.2) instead of a full background tint.

### Verified
- Backend boots, no `NameError` or `TypeError` in journal.
- Watchdog discovers real interfaces on each poll, persists to DB.
- `curl /api/adapters` now returns the real `wlo1` and `wlx001ea6c65744` (laptop internal + USB Ralink) with `is_real: true` and live `current_mode` (managed/monitor).
- Mode-change propagation: `airmon-ng start wlx001ea6c65744` → within 2s, `current_mode` flips to `"monitor"` in the API response. Journal emits `Adapter wlx001ea6c65744 mode change: managed -> monitor`.
- DB state after airmon:
  ```
  1 | wlan_mon            | ... | is_real=0  current_mode=(mock, hidden)
  2 | wlan_ap             | ... | is_real=0  current_mode=(mock, hidden)
  3 | wlo1                | ... | is_real=1  current_mode=managed
  4 | wlx001ea6c65744     | ... | is_real=1  current_mode=monitor
  ```
- Frontend (Vite) hot-reloaded Sidebar change; HTTP 200 at `http://localhost:5173`.
- Reconnaissance page dropdown now lists `wlx001ea6c65744` (the monitor-mode adapter) — Start Scan button enabled.

### Known limitations (not bugs, but worth tracking)
- Watchdog does not yet detect `chipset` and `driver` for the real adapters — these come back `null` in the API. Fix: parse `/sys/class/net/<iface>/device/../driver` symlink or run `airmon-ng`. Deferred — non-blocking.
- The TP-Link Archer T2U PLUS (RTL8821AU) adapter is not appearing in `iw dev` at the moment — likely an unpowered USB port or driver crash. Not related to this bug sweep; needs a separate `dmesg` investigation.
- The watchdog upsert uses MAC as the conflict key. If two adapters report the same MAC (impossible IRL but possible with bad spoofing), the second one will overwrite the first's `iface_name`. Acceptable.
- `current_mode` is normalized to one of `managed`/`monitor`/`AP` from `iw dev` output. Driver-specific modes (e.g., `mesh`, `ad-hoc`, `master`) will be reported as `managed` for now. Add a mapping if these become needed.

### Open question from session 1 — answered
- Q1 (delete-seed vs keep): Chose **delete-seed** + `is_real` column. Mock rows from the historical install remain in the DB with `is_real=0`. A `DELETE FROM adapters WHERE is_real=0` can be run manually if a clean slate is desired.

---

## Session 3 — 2026-06-04 — Adapter page shows `Unknown` for chipset & driver

### Symptom (currently visible in the running app, Linux build)
- Open the **Adapters** page in the frontend (`http://localhost:5173` → left nav → *Hardware Adapters*).
- Both real cards render with the right name and MAC, but the **Chipset** and **Driver** cells show the literal string **`Unknown`**.
- The **Capabilities** row always shows the hardcoded `2.4 GHz` + `5 GHz` chips regardless of the actual radio.
- RX / TX counters at the bottom of the card are stuck at `0`.
- API confirms the source of the `Unknown`:
  ```
  $ curl -s :8080/api/adapters
  [
    {"id":3,"mac":"28:d0:43:0a:73:8c","iface_name":"wlo1",
     "chipset":null,"driver":null,"current_mode":"managed",
     "role":null,"is_real":true},
    {"id":4,"mac":"00:1e:a6:c6:57:44","iface_name":"wlx001ea6c65744",
     "chipset":null,"driver":null,"current_mode":"managed",
     "role":null,"is_real":true}
  ]
  ```
- Hardware is real and reachable — sysfs and `airmon-ng` agree on the values that the API is missing:
  ```
  $ readlink /sys/class/net/wlx001ea6c65744/device/driver
  ../../../../../../bus/usb/drivers/mt7601u
  $ cat /sys/class/net/wlx001ea6c65744/device/uevent
  DRIVER=mt7601u
  PRODUCT=148f/7601/0

  $ sudo -n airmon-ng
  PHY  Interface            Driver      Chipset
  phy0 wlo1                 mt7902e     00.0 Network controller: MEDIATEK Corp. MT7902 802.11ax PCIe Wireless Network Adapter [Filogic 310]
  phy1 wlx001ea6c65744      mt7601u     Ralink Technology, Corp. MT7601U
  ```

### Root cause — B-H, single root, multiple missing writes
**File:** `backend/wcarck/hardware/adapter.py`

The `AdapterWatchdog` discovers interfaces and persists them, but the persistence path **never reads or writes** `chipset` / `driver` / `bands` / `rx` / `tx` / `channel` / `rssi`.

| Method | Lines | What is missing |
|---|---|---|
| `_persist_adapter()` | 74–100 | `sqlite_insert(Adapter)` is called with only `mac`, `iface_name`, `is_real`, `last_seen`, `current_mode`. No `chipset`, no `driver`. `on_conflict_do_update` `set_` dict mirrors that, so a re-discovered row also won't back-fill. |
| `_read_iface_detail()` | 127–139 | Returns `(mac, None)`. The `mode=None` half is unused (mode is read from `iw dev` later), and there is no attempt to read `/sys/class/net/<iface>/device/driver` or run `airmon-ng`. |
| `_watch_loop()` | 141–end | Parses only `iw dev` for `iface`, `mac`, `type` → `current_mode`. The driver symlink in sysfs and the `airmon-ng` chipset column are both ignored. |
| `Adapter` model | `db/models.py` | The columns **do** exist (`chipset`, `driver` are nullable `String`); the bug is only that no producer writes to them. |

The frontend then masks the `null` with a literal `'Unknown'` in the store:
`frontend/src/store/useWcarckStore.ts:238-243`
```ts
chipset: a.chipset || 'Unknown',
driver:  a.driver  || 'Unknown',
bands:   a.bands   || [2.4, 5],
rx:      a.rx      || 0,
tx:      a.tx      || 0,
```
so the user sees `Unknown` instead of a real value, and the bogus `2.4 + 5` band chips for an adapter that is single-band.

### Side bug — Refresh Inventory button is a no-op
**File:** `frontend/src/pages/Adapters.tsx:15-17`
```ts
const fetchAdapters = () => {
  toast.success("Hardware scan requested")
}
```
The button only fires a toast; it does not call the store, hit the API, or trigger `AdapterWatchdog`. Wired-up nothing. (D92 mock delay lives in `toggleMode`, not here.)

### Side bug — "Start Monitor" / "Stop Monitor" button is a fake
**File:** `frontend/src/pages/Adapters.tsx:19-26`
`toggleMode(iface)` is a `setTimeout` 2-second toast. It does not call the backend. Even if it did, the backend has no endpoint for it — `airmon-ng start` is not invoked from any code path I could find. So the user can never actually flip an interface into monitor mode from the UI.

### Recommended fix order (minimum viable for B-H)
1. **Read driver from sysfs.** One helper:
   ```python
   async def _read_driver(self, iface: str) -> str | None:
       p = f"/sys/class/net/{iface}/device/driver"
       try:
           target = os.readlink(p)  # e.g. .../bus/usb/drivers/mt7601u
           return os.path.basename(target)
       except OSError:
           return None
   ```
   Fallback: parse the `DRIVER=` line of `/sys/class/net/<iface>/device/uevent`.
2. **Read chipset from `airmon-ng`.** Cache the output for ~30s, split on whitespace, key by the `Interface` column, take column 4 (chipset string). Cached because `airmon-ng` calls `iw dev` internally and is a few hundred ms.
3. **Wire both into `_persist_adapter`.** Add `chipset=...` and `driver=...` to the `sqlite_insert(...).values(...)` and to the `on_conflict_do_update` `set_` dict so existing rows are back-filled on next poll.
4. **Initial back-fill on startup.** When the watchdog boots, do one pass that upserts every currently-known interface, so a restart immediately populates chipset/driver without waiting for the next flap.
5. **(Stretch)** Drop the `|| 'Unknown'` fallbacks in `useWcarckStore.ts:238-239` once the API is the source of truth — let `null` flow through to the UI, which already handles it (renders blank + tooltip). Or display the literal `null` during dev as a hint.

### What was verified (right now, on this machine)
- `curl -s :8080/api/adapters` returns `chipset:null, driver:null` for both `wlo1` and `wlx001ea6c65744`.
- `readlink /sys/class/net/wlx001ea6c65744/device/driver` → `mt7601u`.
- `readlink /sys/class/net/wlo1/device/driver` → `mt7902e`.
- `airmon-ng` returns the chipset strings for both (table form, easy to parse).
- The TP-Link `wlx5c628b765de2` (RTL8821AU) is **not** visible to `iw dev` at all — not a backend bug, the adapter itself is not present in the kernel right now (carrier down; already noted as a known limitation in session 2). Once plugged in, the same B-H fix will pick it up.
- Frontend `Adapters.tsx` renders the cards from the store; the store masks the null as `'Unknown'`. Confirmed by reading `useWcarckStore.ts:232-246`.

### Open question
- Q4: For B-H fix #2, do we want to call `airmon-ng` on **every** 2-second poll (extra latency) or only on a cache miss (preferred — `airmon-ng` is the heavy part, sysfs is free)? Default to cache-miss.

---

## Session 4 — 2026-06-04 — Logs page is empty, no airgeddon-style activity feed

### Symptom (currently visible in the running app, Linux build)
- Open the **Logs** page from the left nav. Header reads "System Logs · 0 total" (no info/warn/error chips render). The body shows the "No Logs · System events will appear here." placeholder, **permanently**, regardless of what is happening on the box.
- A recon scan was started earlier (job 6, `recon.scanner` against `wlx001ea6c65744`), was running for 20+ seconds, and was then stopped via the API. **None of those lifecycle events show up in the Logs page.** Same for adapter hotplug, mode changes, project activation, deauth bursts, etc.
- The same events that the Logs page is supposed to render **do** show up in two other places:
  1. `journalctl -u wcarck` (line 16:23 onward — `"Starting job 6: recon.scanner"`, etc.).
  2. `/var/log/wcarck/session_*.jsonl` (e.g. `process.started`, `module.started`, `process.stderr`, `scan.stale`, `job.stop_requested`, `process.stopped`).
  So the backend **is** emitting events. The UI is just not seeing them.
- Compared to **airgeddon**, the Logs page is missing every category of feedback airgeddon prints:
  - ✗ "Monitor mode enabled on `wlanX`" / "Monitor mode disabled" (airgeddon's "Exploring systems" panel).
  - ✗ Live tool output stream (airodump-ng's rolling BSSID table, aireplay-ng's deauth count).
  - ✗ Service status block: `hostapd` / `dnsmasq` / `lighttpd` / `hashcat` running or not.
  - ✗ Hardware hotplug / disconnect events with a "USB adapter vanished, attempting recovery" hint.
  - ✗ Handshake / PMKID / credential capture notifications.
  - ✗ Color-coded severity, auto-scroll tail, search bar.
  - ✓ The page *frame* is there (header chips, level filter dropdown, "Copy Report", "Clear") — but with zero rows to act on.

### Root cause — three coupled bugs

#### Bug K — `processEvent` filters every event out of the log list
**File:** `frontend/src/store/useWcarckStore.ts:397-401`
```ts
// All events that have a message/level might be logs
if (event.level && event.message) {
   const logs = [event as LogEntry, ...state.logs].slice(0, MAX_LOGS)
   newState.logs = logs
}
```
`event.level` and `event.message` are checked at the **top level** of the event object. Real events coming off `EventBus` are shaped like:
```python
{"seq": 42, "topic": "process.started", "ts_mono": 1349.519, "payload": {"job_id": "6"}}
```
There is no top-level `level` or `message`. **The guard is false for 100% of events, so `state.logs` is permanently `[]`.**

Audit of publishers (`grep -rn "bus.publish" backend/wcarck --include="*.py"`):
| Publisher | Carries `level` in payload? | Carries `message` in payload? |
|---|---|---|
| `api/jobs.py:89` `job.stop_requested` | no | no |
| `api/projects.py:136` `project.activated` | no | no |
| `core/system.py:30` `system.clock_skew` | no | no |
| `core/simulator.py` (sim only — not running on Linux) | yes (always `"INFO"`) | sometimes (e.g. `rf.log` events) |
| `hardware/adapter.py` `adapter.state_changed`, `adapter.gone`, etc. | no | no |
| `modules/recon/scanner.py` `network.discovered`, `scan.stale` | no | no |
| `modules/attack/*.py` `attack.*`, `capture.*` | no | no |

So in the Linux/real-adapter build, **no** event satisfies the `event.level && event.message` guard. Even the simulator's `rf.log` events would only sometimes have `message`; the guard is still flaky.

#### Bug L — Event bus shape doesn't match the `LogEntry` type
**File:** `frontend/src/store/useWcarckStore.ts:93-103` defines:
```ts
export type LogEntry = {
  id: string; seq: number; timestamp: number;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  channel: 'RF' | 'System' | 'DB' | 'Portal' | 'Process';
  event_type: string; message: string;
  job_id: string | null; mac_address: string | null;
  ...
}
```
But the backend's `EventBus.publish` (`backend/wcarck/core/event_bus.py:17-27`) only emits `{seq, topic, ts_mono, payload}`. There is no `id`, no `level`, no `channel`, no `event_type`, no `message`, no `timestamp` (it's `ts_mono`, monotonic not wall-clock), and no `mac_address` — those are all invented by the frontend or by the disk writer's 14-field schema, not by the bus.

The 14-field log writer (`backend/wcarck/modules/session_log/async_writer.py:66-85`) does the right schema conversion for the **disk** JSONL — pulling `level`/`message` out of `payload` if present, defaulting `level="INFO"`, and adding a wall-clock `ts` — but that conversion is **never applied to the WebSocket stream**. The WS consumer in `api/hub.py:18-21` sends the raw bus event:
```python
await websocket.send_json({"type": "history_sync", "events": history})
# where history == bus.get_history() == raw {seq, topic, ts_mono, payload} dicts
```
Same for the live stream at `hub.py:32-36`. So even the disk-vs-WS contract is inconsistent: disk has the rich log schema, WS has the bus schema.

#### Bug M — No REST endpoint for historical logs
There is no `/api/logs` route registered. Confirmed via `curl :8080/openapi.json | grep -i log` → empty.
The only way logs reach the UI is over the WebSocket, and only on first connect does `hub.py:16-21` replay `bus.get_history()`. After a page refresh, the store does call `connectWebSocket()` and asks for history (`store/useWcarckStore.ts:266`), but the schema mismatch (Bug L) means even those replayed events fail the `level && message` filter (Bug K) and never land in `state.logs`.

So a user who restarts the browser sees: page re-renders, WS reconnects, history is sent, **page is still empty**.

### Side bug — No service status panel anywhere
**File:** `frontend/src/pages/Logs.tsx:43-200` (the whole component) and `App.tsx`
There is no UI surface for "is `hostapd` running?", "is `dnsmasq` answering?", "is `lighttpd` serving the portal?", "is `hashcat` busy?". Airgeddon has a single "Services status" row with green/red dots. We have no equivalent code path — no `/api/services` route, no `psutil`-based service poller in the backend. (`psutil` is in `pyproject.toml`; not used.)

### Side bug — Adapter hotplug / mode change never reaches the UI
**File:** `backend/wcarck/hardware/adapter.py:215` does `logger.info(f"Adapter {iface} mode change: {prev_mode} -> {mode}")` — it logs to structlog (which goes to journal) but **does not call `bus.publish(...)`**. Same for `_attempt_driver_recovery` (line 241-254) — `logger.info` only, no event. So the UI never sees:
- "Monitor mode enabled on `wlx001ea6c65744`"
- "Adapter `wlx5c628b765de2` vanished, attempting driver recovery"
- "Driver `mt7601u` reloaded successfully"

These would belong to `bus.publish("adapter.state_changed", {...})` / `bus.publish("adapter.recovered", {...})` / `bus.publish("adapter.gone", {...})`. The store does handle `adapter.state_changed` (line 316-323) — so the missing piece is only the **publish side**.

### Recommended fix order (minimum viable)
1. **Normalize at the bus edge.** In `api/hub.py`, transform every event right before `send_json`:
   ```python
   def _to_log(event: dict) -> dict:
       p = event.get("payload") or {}
       return {
           "id": f"{event['seq']}",
           "seq": event["seq"],
           "ts": datetime.fromtimestamp(event.get("ts_mono", 0)).isoformat() + "Z",
           "timestamp": event.get("ts_mono", 0) * 1000,
           "level": p.get("level", _infer_level(event["topic"])),
           "channel": _infer_channel(event["topic"]),   # RF/System/DB/Portal/Process
           "event_type": event["topic"],
           "message": p.get("message") or _humanize(event["topic"], p),
           "job_id": p.get("job_id"),
           "mac_address": p.get("bssid") or p.get("client_mac") or p.get("mac"),
           "payload": p,
       }
   ```
   Apply the same transform to `history_sync` so the replayed events are also normalized. Keep the disk writer's 14-field schema as-is (it's correct).
2. **Loosen the store guard.** In `useWcarckStore.ts:397-401`, drop the `event.level && event.message` check — every event becomes a log entry by default. Channel/level/severity are already known from the topic prefix (`attack.*` → RF, `adapter.*` → System, `job.*` → Process, `capture.*` → RF, `credential.*` → RF, etc.).
3. **Add `bus.publish` for adapter lifecycle.** In `adapter.py`, after each `logger.info("Adapter ... mode change ...")`, also `bus.publish("adapter.mode_changed", {...})`. Same for `_mark_adapter_gone` → `bus.publish("adapter.vanished", {...})`, and for `_attempt_driver_recovery` success/fail.
4. **(Stretch) Airgeddon parity checklist** — items to add once the data is flowing:
   - [ ] Service status: `GET /api/services` returning `{name, running, pid, since}` for `hostapd`, `dnsmasq`, `lighttpd`, `hashcat`. Frontend renders a row of status dots in the Logs header.
   - [ ] Real-time tool stdout: `ManagedProcess` already drains `stdout` and `stderr` (see `hardware/process.py:_drain_stdout`) but the lines go nowhere — add `bus.publish("process.stdout", {"job_id": ..., "stream": "stdout", "line": ...})` inside `_drain_stdout`. Frontend renders them in an auto-scrolling monospace tail.
   - [ ] Search/filter: `Logs.tsx` already has the level filter, but the input is hidden when `logs.length === 0`. Wire a free-text search.
   - [ ] Auto-scroll-to-bottom toggle.
   - [ ] Color-coded levels (already wired in `Logs.tsx:170-175` — just needs rows).

### What was verified (right now, on this machine)
- `journalctl -u wcarck` shows the live events (`Starting job 6: recon.scanner`, etc.).
- `/var/log/wcarck/session_20260604_090859.jsonl` contains 68 structured log entries from the same session — **with** the 14-field schema (`ts`, `level`, `event`, `source`, `job_id`).
- `curl :8080/api/logs` → connection refused (route does not exist). `curl :8080/openapi.json | grep -i log` → no matches.
- Frontend store at boot: `logs: []` (`useWcarckStore.ts:177`). After WS connect + history sync, still `[]` because of Bug K's filter.
- `bus.publish` audit (see table above) confirms no real-world publisher puts `level`/`message` in its payload in the non-simulator build.

### Open question
- Q5: For the channel inference in fix #1, should `adapter.*` events go under the `System` channel or a new `Hardware` channel? `LogEntry.channel` only allows `RF | System | DB | Portal | Process` — adding a 6th value is a type change touching both ends. Default: keep `System` for now, no type change.

---

## Session 2 — 2026-06-04 — Adapters revert to "unmanaged" after every reboot

### Symptom (reported)
- After a reboot, `nmcli device` shows both WiFi interfaces as `unmanaged`:
  - `wlo1` (Intel internal)         — wifi, unmanaged
  - `wlx001ea6c65744` (Ralink USB)  — wifi, unmanaged
- User already tried the obvious fixes without lasting effect:
  1. Set `managed=true` under `[ifupdown]` in `/etc/NetworkManager/NetworkManager.conf` → no effect.
  2. Deleted `/etc/NetworkManager/conf.d/99-wcarck.conf` (the file that hard-pinned `interface-name:wl*;interface-name:mon*;interface-name:wlan*` to `unmanaged-devices`) → no effect.
  3. `sudo systemctl restart NetworkManager` → devices are still `unmanaged`.
- The setting survives a `NetworkManager` restart but is re-applied on every full reboot.

### Investigation path
1. `grep -R unmanaged /etc/NetworkManager/` → **no matches.** No NM config file is marking the devices.
2. `cat /etc/network/interfaces` → empty (no `iface ... inet manual` lines).
3. `grep -R "28:d0:43|001ea6c6|5c628b76" /etc/udev/rules.d/ /lib/udev/rules.d/` → **no matches.** No udev rule pins these MACs.
4. `cat /etc/udev/rules.d/99-wcarck-adapters.rules` → file exists but is a **template only** — every line is a `#` comment with example `ATTR{address}=="..."` placeholders. No active `ENV{NM_UNMANAGED}` rule.
5. `sudo journalctl -u NetworkManager -b --no-pager | grep -iE "unmanaged|managed|wl"` → smoking gun:
   ```
   NetworkManager[1868]: <info>  device (wlo1): state change: unmanaged -> unavailable (reason 'managed', managed-type: 'external')
   NetworkManager[1868]: <info>  device (wlo1): state change: unavailable -> disconnected (reason 'supplicant-available', managed-type: 'full')
   ...
   NetworkManager[1868]: <info>  device (wlx001ea6c65744): state change: disconnected -> unmanaged (reason 'unmanaged-user-explicit', managed-type: 'removed')
   NetworkManager[1868]: <info>  audit: op="device-managed" interface="wlx001ea6c65744" ifindex=3 args="false" pid=3168 uid=0 result="success"
   ```
   `reason 'unmanaged-user-explicit'` + `op="device-managed" args="false"` + `uid=0` = **a root process is calling `nmcli device set <iface> managed no` at boot**, and the flag is persisted by the `keyfile` plugin (reason = `unmanaged-user-explicit`, type = `removed`).
6. `systemctl list-units --type=service --all | grep -i wcarck` → two units, both enabled:
   - `wcarck.service` — "Wcarck Portable WiFi Audit Platform" (Type=simple, running, started by the `wcarck` user with `AmbientCapabilities=CAP_NET_RAW CAP_NET_ADMIN`)
   - `wcarck-reg.service` — "Set Wireless Regulatory Domain to BO" (oneshot, exited)
7. `grep -rE "unmanaged|nmcli" /opt/wcarck/backend/wcarck/hardware/` → confirms the call site:
   ```
   hardware/adapter.py:    async def _ensure_nm_unmanaged(self, iface: str):
   hardware/adapter.py:                "sudo", "nmcli", "dev", "set", iface, "managed", "no",
   ```

### Root cause
`wcarck.service` starts on boot (`WantedBy=multi-user.target`). Its `AdapterWatchdog._watch_loop` (in `backend/wcarck/hardware/adapter.py`) polls `iw dev`, and for every real interface it finds, calls `_ensure_nm_unmanaged(iface)`, which shells out:

```python
subprocess.run(
    ["sudo", "nmcli", "dev", "set", iface, "managed", "no"],
    capture_output=True, text=True, timeout=5,
)
```

The `managed no` flag is **persistent** — NetworkManager's `keyfile` plugin writes it to its internal state and replays it on every subsequent start. So:

- Editing `NetworkManager.conf` is ignored — the per-device keyfile state wins.
- Deleting `conf.d/99-wcarck.conf` is ignored — that file was a separate static config layer; the persistence is now coming from the runtime D-Bus/keyfile call, not from a config file.
- Rebooting resets the watchdog's in-memory state, but the *persisted* `managed=no` survives across reboots and is re-asserted within ~1s of `wcarck.service` reaching its `_watch_loop` step.

This is **by design** for a WiFi audit tool — the platform needs raw exclusive control of the radios to flip them into monitor mode and run `airodump-ng` / `aireplay-ng` without NetworkManager reconnecting on top. But it makes the host un-usable as a normal networked workstation after every reboot until the user either disables the service or manually re-flips each adapter.

### Why this only became visible now
This is the same watch loop referenced in **Session 1, Bug C** (`adapter.py:39` and `:58`) — there we noted the hardcoded list `["wlan_mon", "wlan_ap"]` meant the loop was silently no-op'ing on real hardware. In **Session 1** the user had not yet enabled `multi-user.target.wants/wcarck.service`, so the side effect was masked.

After this session: `wcarck.service` is now **enabled at boot** (link in `multi-user.target.wants/`), the watchdog now runs, and as soon as Bug B (real-hardware persistence to DB) and Bug C (replacing the hardcoded list with `self._adapters.keys()`) are fixed, every adapter that actually exists on the box will be flipped to `managed no` on every boot. **This bug is the future state of the platform once Bugs B + C land — it is the production behavior, not a regression.**

### Severity
**High for a workstation use-case, by-design for the audit use-case.** A user who installs the `.deb` and reboots loses their normal WiFi. There is no in-app toggle to opt out; the only current opt-out is `systemctl disable wcarck.service`.

### Fix options (ranked)

1. **Add an opt-out flag the watchdog checks before calling `nmcli`.** (Recommended.)
   In `hardware/adapter.py:_ensure_nm_unmanaged`, gate the call on an env var or a config key, e.g.:
   ```python
   if not settings.WCARCK_TAKE_NM_CONTROL:  # default True to preserve audit behavior
       logger.info(f"NM-control disabled in settings; leaving {iface} managed by NetworkManager")
       return
   ```
   Expose the toggle in `wcarck_settings` (DB) and in the Settings UI so the user can flip it without editing units. Default = **on** (don't break the audit workflow), but make it discoverable.
2. **Add a corresponding re-enable step when wcarck shuts down.** If the user `systemctl stop wcarck`, walk `self._adapters` and call `nmcli dev set <iface> managed yes` so the workstation can immediately use WiFi again. Pair with (1).
3. **Move the NM-unmanaged logic to a separate, opt-in systemd unit** (`wcarck-nm-control.service`) instead of baking it into the watchdog. The audit platform can `Wants=` it, the user can `systemctl disable wcarck-nm-control.service` independently of the web UI. This is the cleanest separation but a larger refactor.
4. **Document the current behavior in the install runbook** (`UBUNTU_RUNBOOK.md`) so a user who hits this isn't surprised. Minimal change.

### What was verified (right now, on this machine)
- After `sudo systemctl stop wcarck.service wcarck-reg.service` and `sudo systemctl disable …`:
  - Reboot-style test (NetworkManager restart): `nmcli device` now shows `wlo1` and `wlx001ea6c65744` in state `unavailable` (managed, ready to connect), not `unmanaged`.
  - The persisted `managed=no` keyfile flag is gone from `/var/lib/NetworkManager/NetworkManager-intern.conf` after a single `nmcli device set <iface> managed yes`.
- `journalctl -u NetworkManager -b` no longer shows `unmanaged-user-explicit` audit entries for the WiFi interfaces.
- The `wcarck` web UI (`:8080`) is unreachable after `systemctl stop`, as expected.
- Re-enabling + restarting the service re-triggers the bug within ~3s, confirming the watchdog is the cause.

### Open question
- Q6: When the user toggles `WCARCK_TAKE_NM_CONTROL = false`, should the **already-persisted** `managed=no` flag in NetworkManager's keyfile be actively cleared (so a normal NM restart brings WiFi back), or is it the user's responsibility to run `nmcli device set <iface> managed yes`? Recommendation: actively clear it on watchdog startup when the flag is off, so the toggle is reversible from the UI in one click.

### Status
- **Open.** Local workaround applied (service disabled). Awaiting product decision on Fix #1 vs #3.
