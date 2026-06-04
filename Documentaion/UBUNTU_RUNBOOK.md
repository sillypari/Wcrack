# Wcarck Ubuntu Runbook

> **Notes for the next AI instance reading this on Ubuntu:** You have no prior context on this project. This file is your context dump. Read sections in order: §1 (what is Wcarck) → §3 (where the code lives) → §7 (known bugs) → §8 (failure-mode playbook) → §10 (test commands). The spec docs in §9 are authoritative for *what* the system should do; the bugs in §7 describe the gap between spec and current code. When debugging, **always read the file** before assuming what's there — the user (Parikshit) is moving fast and may have edited between sessions.

---

## 1. Project Snapshot

Wcarck is a wireless network security auditing control panel. Single-operator, bare-metal Ubuntu target. It orchestrates `airodump-ng` (recon), `aireplay-ng` (deauth), `hcxdumptool` (PMKID), `hostapd` + `dnsmasq` (Evil Twin captive portal), and `hashcat -m 22000` (offline cracking) under a FastAPI backend and React frontend.

- **License:** GPL-3.0
- **V1 scope:** "Engineering-only MVP" — plain HTTP on `127.0.0.1:8080`, no login, no TLS, plain-text credentials, persistent implants + remote C2 deferred to V2.
- **Current state (V1 dev):** Backend Phases 1–5 (core spine, DB, modules, hardware, API) scaffolded. Frontend partially rebuilt with shadcn/ui. The app will *boot* but most attack/recon modules require real Linux wireless hardware to do anything useful. There is a Windows-only simulator (`backend/wcarck/core/simulator.py`) for UI dev on non-Linux.

**Naming note:** The directory on disk is `Wcrack` (no 'a'). All code, comments, and brand use `Wcarck` (with 'a'). Do not "fix" this — it's intentional from the user.

---

## 2. Environment

| | |
|---|---|
| OS | Ubuntu 22.04 LTS or 24.04 LTS (dual-boot, shared disk with Windows) |
| Hostname | `Code-X` |
| Service user | `wcarck` (system user created by `install.sh`, shell `/bin/bash`, home `/var/lib/wcarck`, groups `netdev, plugdev, wireshark` + invoking user's group for source-tree write) |
| Python | 3.11+ in `/opt/wcarck/backend/.venv` (created by `install.sh`, owned by `wcarck`) |
| Node | **20.x LTS** (auto-installed by `install.sh` via nodesource if missing or < 20) |
| Backend port | `0.0.0.0:8080` (uvicorn, runs as `wcarck` via systemd, has `AmbientCapabilities=CAP_NET_RAW CAP_NET_ADMIN`) |
| Frontend port | `127.0.0.1:5173` (Vite dev, run manually after install) |
| Backend DB | `/var/lib/wcarck/db.sqlite` (auto-created by `init_db()`) |
| Captures dir | `/var/lib/wcarck/captures` (created by `install.sh`) |
| Session log dir | `/var/log/wcarck/` (created by `install.sh`) |
| Wireless tools | `airodump-ng`, `aireplay-ng`, `aircrack-ng`, `hcxdumptool`, `hashcat`, `hostapd`, `dnsmasq`, `iw`, `rfkill`, `nftables`, `mdk4`, `macchanger`, `tshark`, `lighttpd` (all via apt) |
| Regulatory domain | BO (set at boot by `wcarck-reg.service` oneshot, after 3s wait for drivers) |
| GPU (for hashcat) | Optional. OpenCL runtime + working driver (NVIDIA `nvidia-driver-535` recommended). Without it, hashcat falls back to CPU. |

---

## 3. Directory Layout

Copy the entire repo to ext4 first. **Do not run from the NTFS Windows partition** — `chmod +x` doesn't work, SQLite locking is broken, and shell scripts lose their exec bit.

```bash
# Mount Windows partition if not auto-mounted (Ubuntu dual-boot):
ls /media/$USER/  # usually shows a volume label
# Typical path: /media/$USER/Windows/Users/<user>/Desktop/...

cp -r "/media/$USER/Windows/Users/Parikshit/Desktop/NewGenApps/Wcrack" ~/Projects/
cd ~/Projects/Wcrack
```

```
Wcrack/
├── Wcarck.md                          # Master plan, 230KB, 32 sections, 130 decisions (D1–D130)
├── Wcarck_competitor_analysis.md      # v1.2 — competitive landscape
├── wcarck_engineering_review.md       # 30+ code-level issues
├── wcarck_plan_review.md              # 16 gaps
├── wcarck_edge_cases_exceptions.md    # 22 edge cases, source of truth for §28
├── wcarck_ui_ux_design.md             # v1.0 UI/UX design, 89KB, source of truth for §29
├── wcarck_logging_design.md           # 39KB, 14-field JSONL schema, source of truth for AsyncLogWriter
├── FinalVerdict.md                    # 5 showstopper decisions (D101–D105)
├── simulator.md                       # How the Windows-only simulator works + removal guide
├── StartUp.md                         # Quick-start + toolset explanations
├── UBUNTU_RUNBOOK.md                  # This file
│
├── backend/
│   ├── pyproject.toml                 # Python deps (does NOT include `psutil` — bug §7.3)
│   ├── db.sqlite                      # Dev DB (auto-created by init_db)
│   ├── .venv/                         # Python virtualenv (created by user)
│   └── wcarck/
│       ├── main.py                    # FastAPI app, lifespan, structlog setup
│       ├── core/
│       │   ├── event_bus.py           # Async pub/sub EventBus + ring buffer (100k history)
│       │   ├── module.py              # Module ABC
│       │   ├── system.py              # SystemOrchestrator (sleep/wake hooks — unimplemented)
│       │   └── simulator.py           # WcarckSimulator (Windows-only by default; see §11)
│       ├── db/
│       │   ├── session.py             # aiosqlite engine, WAL pragmas, init_db()
│       │   ├── models.py              # 14 SQLAlchemy models (see §6.1)
│       │   ├── jobs.py                # JobQueueOps (enqueue/fetch/lifecycle, SKIP LOCKED)
│       │   └── listener.py            # EventBus → DB buffered writer
│       ├── orchestration/
│       │   ├── leases.py              # RadioLeaseManager + sweeper
│       │   └── worker.py              # JobWorker — pulls jobs, runs modules
│       ├── modules/
│       │   ├── session_log/async_writer.py  # 14-field JSONL writer
│       │   ├── recon/scanner.py      # airodump-ng wrapper
│       │   └── attack/{deauth,pmkid,eviltwin}.py
│       ├── hardware/
│       │   ├── process.py             # ManagedProcess (sudo auto-prepend for privileged bins)
│       │   └── adapter.py             # AdapterWatchdog (reg set BO, NM unmanaged, USB path)
│       └── api/
│           ├── hub.py                 # /ws/events WebSocket
│           ├── jobs.py                # /api/jobs/* CRUD
│           ├── network.py             # /api/networks/aps, /clients
│           ├── adapters.py            # /api/adapters
│           ├── captures.py            # /api/captures
│           ├── credentials.py         # /api/credentials
│           ├── crack.py               # /api/crack/* (hashcat control)
│           └── report.py              # /api/report/{csv,html} (stubs)
│
└── frontend/
    ├── package.json                   # vite 8, react 19, zustand 5, shadcn deps
    ├── tailwind.config.ts             # custom design tokens (bg-*, text-*, accent-*, etc.)
    ├── components.json                # shadcn config (New York, zinc base)
    ├── index.html                     # body class="bg-neutral-900 text-neutral-100" (plain `class`, not `className`)
    └── src/
        ├── main.tsx
        ├── App.tsx                    # Router + <AppLayout>
        ├── index.css                  # @tailwind + design tokens (hsl() values)
        ├── store/useWcarckStore.ts    # Zustand store: adapters, networks, jobs, captures, …
        ├── hooks/useAudioAlerts.ts
        ├── lib/{utils,tooltips,a11y}.ts
        ├── components/
        │   ├── layout/{AppLayout,Sidebar,Topbar,ContentZone,ContextualPanel}.tsx
        │   ├── ui/                    # 17 shadcn primitives (button, card, dialog, …)
        │   ├── welcome-overlay.tsx
        │   └── Terminal.tsx
        └── pages/
            ├── Dashboard.tsx          # 4 metric cards, Active Jobs, Recent Events, Adapters
            ├── Reconnaissance.tsx
            ├── AttackSurface.tsx
            ├── EvilTwin.tsx
            ├── Captures.tsx
            ├── Credentials.tsx
            ├── Logs.tsx
            ├── Adapters.tsx
            └── Crack.tsx              # exists but NOT routed in App.tsx
```

---

## 4. Setup (one-time, after fresh Ubuntu boot)

### 4.1 Copy repo to ext4

**Do not run from the NTFS Windows partition** — `chmod +x` doesn't work, SQLite locking is broken, and shell scripts lose their exec bit.

```bash
# Mount Windows partition if not auto-mounted (Ubuntu dual-boot):
ls /media/$USER/  # usually shows a volume label
# Typical path: /media/$USER/Windows/Users/<user>/Desktop/...

cp -r "/media/$USER/Windows/Users/Parikshit/Desktop/NewGenApps/Wcrack" ~/Projects/
cd ~/Projects/Wcrack
```

### 4.2 Run `install.sh` (does everything else)

```bash
sudo ./install.sh
```

This single command (now fully self-sufficient after recent patches) handles:

- **apt packages:** `python3-venv, python3-pip, python3-dev, build-essential, sqlite3, aircrack-ng, hcxtools, macchanger, hostapd, dnsmasq, lighttpd, tshark, hashcat, nftables, iw, rfkill, mdk4, curl`
- **Node.js 20.x** (auto-installs via nodesource if missing or < 20; uses `node -v | cut -d. -f1` check to detect old Node 12)
- **`wcarck` system user** — shell `/bin/bash`, home `/var/lib/wcarck`, groups `netdev, plugdev, wireshark` + the invoking user's group (so wcarck can write to the source tree for `pip install -e .`)
- **Dirs:** `/var/lib/wcarck/{captures,wordlists,db}`, `/var/log/wcarck` (owned by wcarck, mode 750)
- **Symlink:** `/opt/wcarck → ~/Projects/Wcrack` (idempotent via `ln -snf`)
- **Python venv** at `/opt/wcarck/backend/.venv` (owned by wcarck)
- **`pip install -e .` as wcarck user** (works because `chmod -R g+w` makes the source tree group-writable and wcarck is in the invoking user's group)
- **`wcarck-reg.service` oneshot** — sets `iw reg set BO` at boot, with `ExecStartPre=/bin/sleep 3` to wait for wireless drivers
- **NetworkManager** `unmanaged-devices=interface-name:wlan*;interface-name:mon*` at `/etc/NetworkManager/conf.d/99-wcarck.conf` (reloaded if NM is active)
- **sudoers whitelist** at `/etc/sudoers.d/wcarck` (mode 0440) — `iw, ip, macchanger, hostapd, dnsmasq, airmon-ng, hcxdumptool, aircrack-ng, aireplay-ng, mdk4`
- **udev rules** from `packaging/udev/99-wcarck-adapters.rules` (currently a comment template — see §13.15)
- **systemd-resolved DNS stub disabled** (so dnsmasq can bind :53)
- **`wcarck.service` enabled** (not started)

Total install time: 2–5 minutes depending on network.

If install.sh fails partway, read the error — `set -euo pipefail` aborts on the first error. The script is idempotent: re-running picks up where it left off (user creation, dir creation, apt install, venv creation, pip install, service enable all handle re-runs).

### 4.3 Start the backend

```bash
sudo systemctl start wcarck
sudo systemctl status wcarck
journalctl -u wcarck -f   # tail logs (Ctrl+C to exit)
```

Service runs as `wcarck:wcarck` with `AmbientCapabilities=CAP_NET_RAW CAP_NET_ADMIN` (so it can manage interfaces without full root). Listens on `0.0.0.0:8080`. Working dir is `/opt/wcarck/backend` (which symlinks to the user's repo path).

### 4.4 Build the frontend

```bash
cd /opt/wcarck/frontend
npm install
npm run dev
```

Vite dev server on `0.0.0.0:5173` (auto-bound, accessible from any interface).

### 4.5 Open the dashboard

Navigate to `http://localhost:5173` in your browser.

Smoke test from terminal:
```bash
curl http://127.0.0.1:8080/api/health    # → {"status":"ok"}
```

If port 8080 responds, the backend is up. If the UI loads at 5173, the full stack is working.

---

## 5. Start Commands

After `sudo ./install.sh`, the backend runs as a systemd service. The frontend is run manually.

### Backend (systemd)

```bash
sudo systemctl start wcarck       # start now
sudo systemctl status wcarck      # check status
journalctl -u wcarck -f           # tail logs (Ctrl+C to exit)
sudo systemctl stop wcarck        # stop
sudo systemctl restart wcarck     # restart (after code changes)
sudo systemctl disable wcarck     # prevent auto-start on boot
```

The service runs as `wcarck:wcarck` with `AmbientCapabilities=CAP_NET_RAW CAP_NET_ADMIN` (so it can manage interfaces without full root). Listens on `0.0.0.0:8080`.

Expected log output on success:
```
INFO:     Started server process [PID]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8080
```

(You'll see `Dev simulator daemon started successfully` only if `os.name == 'nt'` or `WCARCK_SIMULATE=1` is set.)

If you see `NameError: name 'structlog' is not defined`, the §7.1 bug is unfixed.

### Backend (manual, for dev)

If you want to run uvicorn directly (e.g., for `--reload` or attaching a debugger):
```bash
cd /opt/wcarck/backend
sudo -u wcarck .venv/bin/uvicorn wcarck.main:app --host 0.0.0.0 --port 8080 --reload
```

The `sudo -u wcarck` matters: the venv is owned by wcarck, and the source tree needs to be writable by wcarck (which `install.sh` ensures via `chmod -R g+w` + group membership).

### Frontend (Vite dev server)

```bash
cd /opt/wcarck/frontend
npm run dev
```

Open `http://localhost:5173`. Vite proxies are not configured — the frontend talks directly to `http://127.0.0.1:8080` (CORS allows `*` in `main.py:73-80`).

### Smoke test

```bash
curl http://127.0.0.1:8080/api/health
# Expect: {"status":"ok"}
```

---

## 6. Architecture

### 6.1 Database models (14 total in `backend/wcarck/db/models.py`)

| Model | Table | Purpose |
|---|---|---|
| `Session` | `sessions` | A Wcarck run (started_at, label) |
| `Scope` | `scopes` | Allowed BSSIDs/SSIDs, `active` flag, `expires_at` |
| `Adapter` | `adapters` | USB NICs, MAC, chipset, driver, current mode |
| `ResourceLease` | `resource_leases` | Per-phy radio leases (D77) |
| `Network` | `networks` | Discovered APs (bssid, ssid, channel, encryption, rssi) |
| `Client` | `clients` | Discovered stations (mac, associated_bssid, probed_ssids) |
| `JobQueue` | `job_queue` | Queued/running/completed jobs (module_name, handler_name, params_json) |
| `AttackSession` | `attack_sessions` | Per-attack state (target_bssid, packets_sent) |
| `Capture` | `captures` | Handshakes / PMKID hashes (type, path, sha256, bssid, ssid) |
| `ApSession` | `ap_sessions` | Evil Twin AP sessions (ssid, bssid, channel, portal_template, credentials_captured) |
| `Credential` | `credentials` | Captured creds (network_ssid, password, kdf_salt, validated) |
| `SessionLog` | `session_log` | 14-field JSONL records (see wcarck_logging_design.md) |
| `ModuleState` | `module_state` | Health of each recon/attack module |
| `CrackJob` | `crack_jobs` | hashcat job state (hash_mode=22000, progress, cracked_plaintext) |

### 6.2 Backend module map

- **`core/event_bus.py`** — `bus` singleton. `bus.publish(topic, payload)`. Per-subscriber `asyncio.Queue(maxsize=1000)`. `time.monotonic()` for ts_mono. Ring buffer keeps last 100k events.
- **`core/module.py`** — `Module` ABC. Subclasses implement `async run(params, ctx)`.
- **`core/simulator.py`** — `simulator` singleton. Auto-starts on Windows or `WCARCK_SIMULATE=1`. Listens to `bus`, mocks airodump/deauth/eviltwin/hashcat events. **Linux is supported via env var only.**
- **`orchestration/leases.py`** — `RadioLeaseManager` with per-resource `defaultdict(asyncio.Lock)` (NB: attribute is `_adapter_locks`, not `_lock` — see §7.2). Sweeper task releases expired leases.
- **`orchestration/worker.py`** — `JobWorker` polls `JobQueueOps.fetch_next_job` (uses `SKIP LOCKED`), executes module `run()`, marks completed/failed.
- **`db/listener.py`** — Subscribes to `bus`, buffers network/client/session_log events, **flushes to DB every N events** — but see §7.5 (the body is a `pass`).
- **`hardware/process.py`** — `ManagedProcess`. Uses `start_new_session=True`. On POSIX, auto-prepends `["sudo", "-n"]` for binaries in `PRIVILEGED_BINS` whitelist (airodump-ng, aireplay-ng, etc.). `stop()` uses psutil to kill process group.
- **`hardware/adapter.py`** — `AdapterWatchdog` polls `ip link`, sets `iw reg BO`, marks NM as unmanaged, tracks USB bus path for brownout detection.
- **`api/hub.py`** — `/ws/events`. On connect, sends `{"type": "history_sync", "events": [...]}`. Live events as `{"type": "event", "event": {...}}`.

### 6.3 Frontend store (`store/useWcarckStore.ts`)

Zustand 5 with `subscribeWithSelector` + `persist` (localStorage key `wcarck-storage`, persists only `uiState` and `lastEventSeq`).

- **State slices:** `adapters`, `networks: Map<bssid, Network>`, `clients: Map<mac, Client>`, `activeJobs`, `captures`, `credentials`, `logs: LogEntry[]` (capped 200), `sessionStartedAt`, `activeScopeId`, `uiState`, `wsConnected`, `wsReconnectAttempts`, `lastEventSeq`.
- **Actions:** `connectWebSocket()`, `processEvent()`, `syncHistory()`, `startJob()`, `stopJob()`, `setUiState()`, `dismissActionBar()`, `toggleSidebar()`, `toggleFocusMode()`, `toggleAudio()`, `fetchInitialState()`.
- **REST base:** `http://127.0.0.1:8080`. **WS:** `ws://127.0.0.1:8080/ws/events`.

### 6.4 Frontend layout

- `AppLayout` → flex with `Sidebar` (left) + `<Topbar /> + <ContentZone>{children}</ContentZone>` (right) + `<Toaster /> + <CommandPalette /> + <WelcomeOverlay />` (overlays).
- `Sidebar` width: 64 px collapsed (default), 220 px pinned. Pin toggled via `uiState.sidebarPinned` (Hamburger in topbar currently; a pin button inside the sidebar is spec'd but not implemented — see D87).
- `Topbar` height: 48 px. Contains: Hamburger, Wcarck logo, centered "Session: HH:MM:SS" pill, right cluster (adapter status dots, audio toggle, theme toggle, debug-report copy, errors pill).
- `ContentZone` content: `<div className="max-w-[1600px] mx-auto h-full flex flex-col">`. Pages live inside.

---

## 7. Known Bugs (verified against current code)

These are bugs the next AI should not be surprised by. They are **not** in the user's mental model of "done" — verify by reading the file before assuming anything.

### 7.1 `structlog` import in `main.py` (may already be fixed)
**File:** `backend/wcarck/main.py:19-29`
**Bug:** Originally `structlog.configure(...)` was called without `import structlog` on the previous line. If you see a `NameError` on startup, the import is missing.
**Fix:**
```python
# At the top of main.py, ensure:
import structlog
# ...then below:
structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ]
)
logger = structlog.get_logger()
```

### 7.2 `worker.py` uses wrong lease attribute
**File:** `backend/wcarck/orchestration/worker.py:121`
**Bug:** Code does `self.lease_manager._lock` but the actual attribute on `RadioLeaseManager` is `self._adapter_locks` (a `defaultdict(asyncio.Lock)`).
**Symptom:** `AttributeError: 'RadioLeaseManager' object has no attribute '_lock'` on the first job cleanup.
**Fix:** Change `_lock` to `_adapter_locks` in worker.py. If you need to lock per-resource: `async with self.lease_manager._adapter_locks[resource_key]:`.

### 7.3 `psutil` not in `pyproject.toml`
**Files:** `pyproject.toml` (deps), `backend/wcarck/hardware/process.py:94`
**Bug:** `process.py` does `import psutil` inside `stop()` but `psutil` is not declared as a dependency. Fails with `ModuleNotFoundError` the first time you try to stop a job.
**Fix:**
```toml
# pyproject.toml, [project] dependencies:
dependencies = [
    # ... existing ...
    "psutil>=5.9.0",
]
```
Then `pip install -e .` again.

### 7.4 Pydantic v2 deprecation warnings
**Files:** `backend/wcarck/api/{jobs,network,adapters,captures,credentials}.py` — 6 occurrences of `class Config: from_attributes = True`
**Bug:** Deprecated in Pydantic v2; still works but emits warnings on every request.
**Fix:**
```python
# Before:
class FooRes(BaseModel):
    bar: str
    class Config:
        from_attributes = True

# After:
from pydantic import ConfigDict

class FooRes(BaseModel):
    bar: str
    model_config = ConfigDict(from_attributes=True)
```

### 7.5 `DBEventListener` flush body is empty
**File:** `backend/wcarck/db/listener.py` — `_flush_buffers()` or equivalent
**Bug:** The listener populates in-memory buffers for `network.*` and `client.*` events, but the flush body is `pass` (or a TODO comment). Events arrive via WebSocket (so frontend sees them) but **never persist to SQLite**.
**Symptom:** `SELECT * FROM networks;` returns 0 rows even after a scan. Frontend table looks populated; refresh = empty.
**Fix:** Implement the SQL `INSERT` (or `INSERT ... ON CONFLICT DO UPDATE`) for each event in the buffer flush. Use `ON CONFLICT (bssid) DO UPDATE SET last_seen = excluded.last_seen, max_rssi = MAX(...)` for upserts.

### 7.6 `pmkid.py` writes literal `\n` instead of newline
**File:** `backend/wcarck/modules/attack/pmkid.py:36`
**Bug:** `f.write(bssid.replace(':', '') + '\\n')` — the `\\n` is a literal backslash-n in Python source (it's the string `\` + `n`, 2 chars). hcxdumptool reads this as a BSSID with a trailing `\n` string, not a newline.
**Fix:**
```python
f.write(bssid.replace(':', '') + '\n')  # actual newline
```

### 7.7 Frontend `index.html` uses `className` instead of `class`
**File:** `frontend/index.html:9`
**Bug:** `<body className="bg-neutral-900 ...">` — `className` is a React/JSX attribute, ignored by plain HTML.
**Fix:** Change to `class="bg-neutral-900 text-neutral-100 antialiased font-sans"`.

### 7.8 Dashboard action bar re-shows after 24h (D90 spec violation)
**File:** `frontend/src/pages/Dashboard.tsx:12-17`
**Bug:** Logic returns `false` (hide) when 24h+ have passed since dismissal — re-showing the action bar. Spec D90 says "After first dismiss, NEVER show again (even across sessions)".
**Fix:**
```tsx
const shouldShowAction = React.useMemo(() => {
  if (activeJobs.length > 0) return false
  if (uiState.lastActionBarDismissed !== null) return false
  return true
}, [activeJobs.length, uiState.lastActionBarDismissed])
```

### 7.9 Sidebar has no pin button (D87 spec violation)
**File:** `frontend/src/components/layout/Sidebar.tsx:25-62`
**Bug:** Sidebar has no toggle inside itself. The only way to pin/unpin is the topbar Hamburger, which is semantically a mobile-menu icon. Users see the 64 px icon-only sidebar and have no obvious way to expand.
**Fix:** Add at the top of the `<aside>`:
```tsx
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
// ...
<div className="px-2 py-2 flex-shrink-0 border-b border-border-subtle flex justify-end">
  <button
    onClick={toggleSidebar}
    className="h-7 w-7 flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-hover rounded"
  >
    {isPinned ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
  </button>
</div>
```

### 7.10 Sidebar active style is wrong (D87 spec violation)
**File:** `frontend/src/components/layout/Sidebar.tsx:39-42`
**Bug:** Active item uses `bg-accent/15 text-accent border border-accent/30` (full border + background tint). Spec says "accent left border + accent icon" only.
**Fix:**
```tsx
isActive
  ? "border-l-2 border-accent text-accent bg-transparent"
  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary border-l-2 border-transparent"
```

### 7.11 `Crack.tsx` is orphaned
**File:** `frontend/src/pages/Crack.tsx` exists but is **not routed** in `App.tsx` and not in `Sidebar.tsx`'s `NAV_ITEMS`. The Crack page is unreachable from the UI.

### 7.12 `lucide-react: ^1.17.0` is correct
**File:** `frontend/package.json:29`
**Note:** Despite the unusual major version, `lucide-react@1.17.0` is real. Don't downgrade unless icons break.

---

## 8. Failure-Mode Playbook

| Symptom | First check | Likely cause | Fix |
|---|---|---|---|
| `install.sh` fails at `apt-get install` with network error | `ping deb.debian.org` | No internet, or proxy needed | Fix network; check `/etc/apt/sources.list` |
| `install.sh` fails with "group 'wireshark' does not exist" | `getent group wireshark` | Wireshark group not in minimal Ubuntu | `sudo apt install wireshark-common` first, then re-run |
| `install.sh` fails at `pip install -e .` with `Permission denied: '...egg-info'` | `ls -la /opt/wcarck/backend/wcarck/` | Source tree not group-writable (install.sh bug fixed) | Re-run install.sh — C1 fix makes tree `chmod g+w` and adds wcarck to invoking user's group |
| `install.sh` "succeeds" but `systemctl start wcarck` fails: `Failed at step EXEC spawning ... No such file or directory` | `ls -ld /opt/wcarck /opt/wcarck/backend /opt/wcarck/backend/.venv/bin/uvicorn` | Symlink broken or venv not created | Re-run install.sh; check `SCRIPT_DIR` resolved correctly |
| `systemctl start wcarck` → "Job failed" | `journalctl -u wcarck -xe` | Backend code bug (structlog, _lock, etc.) | See §7 code bugs; check exit code in journal |
| `wcarck-reg.service` fails to set BO at boot | `systemctl status wcarck-reg.service; journalctl -u wcarck-reg.service` | Wireless driver not loaded yet, or `iw` path wrong | Service has `ExecStartPre=/bin/sleep 3` (M2 fix). If still fails: `sudo /usr/sbin/iw reg set BO` manually |
| `wcarck` user can read source tree but `pip install -e .` as wcarck fails with `Permission denied` | `ls -la /opt/wcarck/backend/wcarck/db/` | Source tree not group-writable for wcarck | Re-run install.sh — the `chmod -R g+w` + `usermod -aG` is the fix (C1) |
| `journalctl -u wcarck` shows `ModuleNotFoundError: No module named 'psutil'` | `pip show psutil` (as wcarck) | §7.3 — psutil not in pyproject.toml | Add to pyproject.toml deps, re-run `pip install -e .` |
| Adapter appears then disappears after 1–2s | `journalctl -u NetworkManager -f` | NM reclaiming the interface (D101) | install.sh writes `/etc/NetworkManager/conf.d/99-wcarck.conf`; verify with `cat /etc/NetworkManager/conf.d/99-wcarck.conf` |
| `iw reg get` shows US, not BO, after boot | `systemctl status wcarck-reg.service` | wcarck-reg.service not enabled, or failed silently | `sudo systemctl enable --now wcarck-reg.service` |
| `uvicorn` exits immediately with `NameError: name 'structlog' is not defined` | Read `main.py` lines 1–30 | §7.1 | Add `import structlog` |
| `uvicorn` exits with `ModuleNotFoundError: No module named 'wcarck'` | `pwd` should be `backend/` | Wrong cwd | `cd backend && source .venv/bin/activate && uvicorn ...` |
| `uvicorn` runs but `/api/health` returns 404 | `curl -i http://127.0.0.1:8080/api/health` | Started on different port/host | Verify `--host 0.0.0.0 --port 8080` |
| `npm run dev` says "vite: command not found" | `node --version` | Node < 20.19 | §4.2 |
| Frontend loads, "No adapters found" | `iw dev` in terminal | No wireless adapter plugged in, or VM USB passthrough broken | Plug adapter; if in VM, switch USB controller to 3.0/xHCI |
| Adapter appears then disappears after 1–2s | `journalctl -u NetworkManager -f` | NM reclaiming the interface | §4.5 |
| Deauth job starts but `aireplay-ng: command not found` | `which aireplay-ng` | Package not installed | `sudo apt install aircrack-ng` |
| Job starts then dies with `PermissionError` | `ls -l /sys/class/net/wlan0` ownership | Not running as root | Restart backend with `sudo` |
| Captures folder missing on hashcat start | `ls -ld /tmp/wcarck_captures` | Not created | `mkdir -p /tmp/wcarck_captures` |
| `dnsmasq` won't start: "address already in use" on :53 | `ss -lntup \| grep :53` | `systemd-resolved` holds it | §4.6 |
| `hashcat` exits with "No devices found" | `hashcat -I` | No OpenCL runtime / driver | `sudo apt install mesa-opencl-icd` (CPU) or install NVIDIA/AMD GPU driver |
| `hashcat` "clGetDeviceIDs(): CL_DEVICE_NOT_FOUND" | `clinfo` | Driver/runtime mismatch | Reinstall matching OpenCL ICD |
| Frontend shows events arriving then stops; "WebSocket disconnected" | `journalctl` or backend stdout | `uvicorn --reload` killed worker; or DB lock | Restart backend; check `/var/lib/wcarck/db.sqlite-wal` size |
| Backend log: "database is locked" | `fuser /var/lib/wcarck/db.sqlite` | WAL contention | Should be rare; busy_timeout=5000 in db/session.py handles it |
| `pip install -e .` fails on `lxml` or `cryptography` | `python3-dev libxml2-dev libxslt-dev` missing | §4.1 missing | Install build deps |
| Module import fails: `ImportError: cannot import name 'psutil' from ...` | `pip show psutil` | §7.3 | Add to pyproject.toml + reinstall |
| Dashboard shows "0" in all cards, Recent Events empty | `curl http://127.0.0.1:8080/api/adapters` | Either no adapter, or §7.5 (DBEventListener not flushing) — frontend bypasses DB and reads from WS, so events DO arrive visually; only DB persistence is broken | If DB persistence matters, fix §7.5 |
| `iw reg set BO` returns "operation not permitted" | `id` | Not root | `sudo` |
| `sudo uvicorn ...` says "command not found" | `which uvicorn` after `source .venv/bin/activate` | Activated venv as user, but `sudo` drops it | `sudo .venv/bin/uvicorn wcarck.main:app --host 0.0.0.0 --port 8080` (use full path) |
| Frontend Vite shows "EADDRINUSE :::5173" | `ss -lntup \| grep :5173` | Stale Vite process | `pkill -f "vite"` |
| Frontend shows blank page, console: "Failed to fetch" | DevTools Network tab → `127.0.0.1:8080` | Backend not running, or CORS misconfigured | Restart backend; main.py:73-80 has `allow_origins=["*"]` |
| Frontend shows blank page, console: "Unexpected token <" | DevTools Network tab | Vite serving HTML for a JS path (proxy misconfig) | Check `vite.config.ts` for `server.proxy` to `127.0.0.1:8080` |
| `nft` (nftables) command not found | `which nft` | §4.1 missed `nftables` | `sudo apt install nftables` |
| "Address already in use" on backend restart | `ss -lntup \| grep :8080` | Old uvicorn process | `pkill -f "uvicorn wcarck"` |
| Backend starts but `wifi` scan returns nothing within 30s | `sudo airodump-ng wlan0mon --band abg` manually | Adapter not in monitor mode, or wrong channel | `sudo airmon-ng start wlan0`; check `iw dev` shows `wlan0mon` |

---

## 9. Spec Reference

The 9 .md files in repo root are the **source of truth** for what Wcarck should do. Code is aspirational. When in doubt, read the spec.

| File | What it defines |
|---|---|
| `Wcarck.md` | Master plan. 32 sections, 130 decisions (D1–D130), 85 risks. Sections §8 (project structure), §11 (implementation phases), §28 (edge cases), §29 (UI/UX) are the most-cited. |
| `Wcarck_competitor_analysis.md` | v1.2 — what Wifite, Kismet, etc. do differently. |
| `wcarck_engineering_review.md` | 30+ code-level issues. Many of §7's bugs are listed here. |
| `wcarck_plan_review.md` | 16 gaps, 5 risks, 5 open questions. |
| `wcarck_edge_cases_exceptions.md` | 22 edge cases, 8 categories. Source of truth for §28 of Wcarck.md. |
| `wcarck_ui_ux_design.md` | v1.0, 89 KB. Design tokens (CSS vars), layout (Sidebar 64→220, Topbar 48, Content 1600 max), 8 self-corrections (D87–D94), 4 pillars (4P). |
| `wcarck_logging_design.md` | 14-field JSONL log schema, 6 domain files. Source of truth for `AsyncLogWriter`. |
| `FinalVerdict.md` | Cross-doc critique. 4 showstoppers (D101 NM unmanaged, D102 reg BO, D103 unprivileged user, D104 DBus sleep). 5-phase build order. |
| `simulator.md` | How the Windows simulator works. Removal guide if production-only is needed. |
| `StartUp.md` | Quick-start + toolset explanations. Has an incorrect `pip install -r pyproject.toml` line. |
| `UBUNTU_RUNBOOK.md` | This file. |

**Architectural decision summary (one-liners):**
- D1–D34: V1.0–1.5 — name, stack, MVP trim, password cracking in V1, ASCII-only, plugin architecture, offline validator, ManagedProcess cascade, hashcat `-m 22000`.
- D35 (revised): `User=wcarck`, `LimitNOFILE=65536`, `LimitNPROC=8192` — **unimplemented**.
- D36–D42 (V1.6): hcxdumptool SIGTERM, AsyncSniffer, EAPOL validator branching on `.22000` prefix, captive portal 4 detection paths, systemd-resolved disable, PMF awareness, plugin API gate.
- D43–D74 (edge-cases): three-category failure model, AdapterWatchdog, driver recovery, `_kill_process_tree`, CircuitBreaker, retry_with_backoff, WAL recovery, SQLite CORRUPT recovery, Alembic per-migration, AP band-change, WPA3-SAE, 802.11r FT-PSK, Evil Twin MAC spoof, mode verify, structured log fields, event tag catalog, `doctor.sh --postmortem`.
- D75–D84 (aircrack-ng review): EAPOL 30s/5s online + no-timeout offline M2+M3 minimum; tshark pre-check; per-phy leases; rfkill in AdapterWatchdog; deauth `rc=7`/`rc=1`; CSV header pin; scan-mode MAC random; validator 30s.
- D85–D100 (UI/UX): 4 pillars (Performance, Precision, Polish, Privacy); 3-zone layout; 8 self-corrections; design tokens; `@tanstack/react-virtual`; WebSocket→Zustand <50 ms; 13-term tooltip coverage; WCAG AA + shape+color; Ctrl+K palette.
- D101–D104 (FinalVerdict SHOWSTOPPERS): NM `unmanaged-devices`; `iw reg set BO` + `txpower fixed 3000`; unprivileged `wcarck` user + sudoers whitelist; DBus `PrepareForSleep` listener. **D103 and D104 unimplemented in current code.**
- D105–D130 (V1 additions): DoH/DoT nftables drop; tmpfs staging; DHCP subnet collision auto-shift; HSTS no-port-443; WS state replay; IPv6 drop; WAL 5 min PASSIVE checkpoint; ProcessPoolExecutor; process groups via `start_new_session`; USB bus path tracking; bare metal only (no Docker); WPA3 client exclusion; channel race preemption; DFS CAC 60s; thermal pulsed bursts; `time.monotonic()`; Web Audio API; high-contrast light mode; asset drag-drop; 7 d pcapng/30 d log retention; VM USB flakiness hint; USB power brownout warning; bulk operations; Zustand persist; Focus Mode + toast debouncing; mobile responsive.

---

## 10. Test Commands

```bash
# Backend
cd ~/Projects/Wcrack/backend
source .venv/bin/activate
PYTHONPATH=. pytest tests/unit -v

# Frontend types
cd ~/Projects/Wcrack/frontend
npx tsc --noEmit

# Frontend build
npm run build

# Frontend lint
npm run lint
```

**Currently failing on first run** (until §7.1 and §7.3 are fixed):
- `test_api.py` collection fails on `from wcarck.main import app` due to §7.1.

**Known to pass:**
- `test_core.py`, `test_process.py`, `test_recon.py`, `test_attack.py`, `test_db.py` (these import submodules, not the broken main).

**Manual smoke test for the full app:**
```bash
# In backend terminal:
curl http://127.0.0.1:8080/api/health           # → {"status":"ok"}
curl http://127.0.0.1:8080/api/adapters         # → []
curl http://127.0.0.1:8080/api/networks/aps      # → []
curl http://127.0.0.1:8080/api/captures          # → []
curl http://127.0.0.1:8080/api/credentials       # → []

# In another terminal, check WebSocket:
# (use wscat or websocat, or just open browser DevTools → Network → WS)
```

---

## 11. Simulator Mode

The Windows-only simulator (`backend/wcarck/core/simulator.py`) is designed to let the user develop the UI on a non-Linux machine. On Linux, it does **not** auto-start.

**To enable on Linux** (for dev testing without hardware):
```bash
export WCARCK_SIMULATE=1
sudo -E .venv/bin/uvicorn wcarck.main:app --host 0.0.0.0 --port 8080
```

`simulator.md` describes the simulator in detail and gives a complete removal guide. The 4 attack modules (`scanner.py`, `deauth.py`, `pmkid.py`, `eviltwin.py`) each have Windows-specific `cmd` overrides. Whether these work on Linux with `WCARCK_SIMULATE=1` is **not verified** — read `core/simulator.py` to confirm.

The frontend has a `Cpu` icon in the topbar (`Topbar.tsx:131-145`) that toggles simulator state. On Linux without `WCARCK_SIMULATE=1`, the toggle does nothing meaningful.

---

## 12. Notes for the Next AI

1. **Verify before assuming.** The user moves fast. The repo now has git (initialized for the GitHub push at https://github.com/sillypari/Wcrack), so `git status` and `git log` work. Use them.
2. **The codebase has bugs.** §7 lists 12 known code bugs. There are likely more. Don't be surprised by `pass` bodies, `\\n` literals, missing imports, or `class Config` deprecations. Read before judging.
3. **The spec is authoritative; the code is aspirational.** When they conflict, the spec wins, but ask the user before "fixing" code to match spec — sometimes the spec is wrong and the code is right.
4. **The `wcarck` system user exists** (created by `install.sh`). Backend runs as `wcarck:wcarck` via systemd with `AmbientCapabilities=CAP_NET_RAW CAP_NET_ADMIN`. Don't run uvicorn manually as root unless debugging — the venv and source tree are owned by wcarck.
5. **`install.sh` was heavily patched in June 2026** to be fully self-sufficient. It now handles apt packages, Node.js, venv, pip install (with permission fix for source-tree write), NM suppression, reg domain persistence via `wcarck-reg.service`, and systemd-resolved disable. **Run `sudo ./install.sh` before debugging anything environment-related** — most "missing thing" issues are resolved by re-running install.sh.
6. **The "V2 Projects" feature was planned but paused.** The user sent a detailed spec for multi-engagement Projects but then said "i did not ask to continue V2". Do not implement it without explicit go-ahead.
7. **The frontend's "nuked UI" issue (asked about earlier) was a false alarm in one session** — the CSS HSL format was actually correct. Remaining UI/UX gaps are in §7.8–§7.10.
8. **If the user mentions "the plan" or "the spec"** without a specific file, they likely mean `Wcarck.md` (master plan) or the relevant companion doc (UI/UX, edge-cases, etc.).
9. **The user is Parikshit.** They dual-boot Windows and Ubuntu. Their Windows username is `Parikshit`, Ubuntu hostname is `Code-X`, GitHub username is `sillypari` (email `[email protected]`). They prefer concise, file:line-referenced answers. They do not want comments added to code.
10. **If something in this runbook is wrong**, the user will probably just tell you. Don't argue with the runbook — verify against the file and update.
11. **Two folder-name quirks:** the on-disk directory is `Wcrack` (no 'a'), but the code/branding use `Wcarck` (with 'a'). The documentation archive folder is `Documentaion/` (typo, with extra 'a' and missing 't'). Don't "fix" either.
12. **udev rules file is a stub.** `packaging/udev/99-wcarck-adapters.rules` is just commented examples. To actually pin interface names, the user must add real `SUBSYSTEM=="net", ACTION=="add", ATTR{address}=="XX:XX:XX:XX:XX:XX", NAME="..."` lines. Not done yet.
