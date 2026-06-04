# Wcrack

**Pineapple-class WiFi Audit Platform for Ubuntu**

A full-stack wireless security auditing control panel and orchestrator — FastAPI backend + React frontend, designed for bare-metal Ubuntu deployment.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Manual Installation](#manual-installation)
- [Project Structure](#project-structure)
- [Backend](#backend)
  - [Tech Stack](#backend-tech-stack)
  - [API Routers](#api-routers)
  - [Database Models](#database-models)
  - [Module System](#module-system)
  - [Hardware Layer](#hardware-layer)
  - [Orchestration](#orchestration)
  - [Captive Portal](#captive-portal)
- [Frontend](#frontend)
  - [Tech Stack](#frontend-tech-stack)
  - [Pages](#pages)
  - [Components](#components)
  - [State Management](#state-management)
  - [Styling](#styling)
- [Configuration](#configuration)
- [Deployment](#deployment)
  - [Systemd Services](#systemd-services)
  - [Sudoers Policy](#sudoers-policy)
  - [Udev Rules](#udev-rules)
  - [Wireless Regulatory Domain](#wireless-regulatory-domain)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Documentation](#documentation)
- [Security](#security)
- [Roadmap](#roadmap)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## Overview

Wcrack is a unified WiFi penetration testing framework that combines the capabilities of tools like aircrack-ng, airgeddon, wifipumpkin3, and Wifite into a single web-based control panel. It provides a graphical interface for reconnaissance, deauthentication attacks, PMKID capture and cracking, Evil Twin attacks with captive portals, MITM credential extraction, and offline WPA/WPA2 handshake cracking.

The platform is designed for security professionals and penetration testers who need a centralized, auditable interface for wireless engagements — with job queuing, session logging, credential management, and project-scoped reporting.

**Key Design Principles:**
- Single-command deployment (`sudo ./start.sh`)
- Idempotent — safe to re-run at any time
- No Docker — bare metal Ubuntu 22.04/24.04 only
- No login/TLS in V1 — single operator, plain HTTP on `127.0.0.1:8000`
- Persistent implants and remote C2 deferred to V2

---

## Features

### Reconnaissance
- Passive WiFi scanning (airodump-ng / iw dev)
- Network discovery with SSID, BSSID, channel, encryption, signal strength
- Client enumeration per access point
- Real-time WebSocket updates for live scan results

### Attacks
- **Deauthentication** — per-client or broadcast deauth via aireplay-ng
- **PMKID Capture** — hcxdumptool-based PMKID extraction
- **PMKID Cracking** — hcxpcapngtool conversion + hashcat `-m 22000`
- **Evil Twin** — hostapd + dnsmasq + captive portal with 6 built-in templates
- **MITM Sniffer** — tcpdump-based HTTP/DNS credential extraction
- **Offline Cracking** — aircrack-ng with wordlist management and wpaclean handshake stripping

### Captive Portal Templates
- `Login_v4` — Router Firmware Update (generic ISP portal)
- `DarkLogin` — Dark Login Portal (sleek dark theme)
- `loginPage` — Standard Portal
- `evilqr3` — QR Code Portal
- `custom` — User-provided HTML template

### Infrastructure
- SQLite with WAL mode, async SQLAlchemy 2.0, Alembic migrations
- EventBus for decoupled inter-module communication (30+ topics)
- RadioLeaseManager for adapter conflict prevention
- ManagedProcess with process group management (no zombie processes)
- WebSocket hub for real-time UI updates

---

## Architecture

```
+-------------------+        HTTP/WS        +-------------------+
|                   | <-------------------> |                   |
|    React 19 SPA   |                       |   FastAPI Backend  |
|    (Vite 8)       |                       |   (uvicorn)        |
|                   |                       |                   |
+-------------------+                       +-------------------+
                                                     |
                                            +--------+--------+
                                            |                 |
                                    +-------v------+  +------v-------+
                                    |  SQLite DB   |  |  RF Hardware |
                                    |  (WAL mode)  |  |  (iw/nft/    |
                                    +--------------+  |  hostapd/     |
                                                      |  aircrack-ng) |
                                                      +---------------+
```

**Communication Flow:**
1. Frontend sends HTTP requests to FastAPI REST API
2. Backend enqueues jobs via `JobQueue` model
3. `Worker` dequeues and dispatches to the appropriate `Module`
4. Modules emit events via `EventBus` (e.g., `module.started`, `module.progress`, `module.stopped`)
5. `Hub` WebSocket broadcasts events to all connected frontend clients
6. Frontend store (`useWcarckStore`) processes events and updates React state

---

## Quick Start

### One-Command Setup & Launch

```bash
sudo ./start.sh
```

That's it. The script handles everything:

| Phase | What It Does |
|-------|-------------|
| **Phase A** | Checks/installs system packages, Node.js, Python venv, npm dependencies |
| **Phase B** | Verifies root privileges, wireless adapters, database, backend imports, systemd config |
| **Phase C** | Prints green "ALL SYSTEMS GO" banner or yellow warnings with guidance |
| **Phase D** | Clears stale ports, launches backend (port 8000) + frontend (port 3000), opens browser |
| **Phase E** | On Ctrl+C: kills all processes, cleans up ports, no zombies |

**Requirements:** Ubuntu 22.04/24.04, root access (`sudo`), wireless adapter.

**What the output looks like:**
```
    __          __       ___  _____
    \ \        / /      / _ \/ ___/
     \ \  /\  / /__ _ _| /_/ /
      \ \/  \/ / _ \ '__|  __/
       \  /\  /  __/ |  | |
        \/  \/ \___|_|  \_/

    WiFi Penetration Testing Framework
    Unified Launcher v2.0

=======================================================================
  PHASE A: DEPENDENCY CHECKS
=======================================================================

  [PASS]  All system packages present
  [PASS]  Node.js v22.14.0 >= 20
  [PASS]  Python venv exists at backend/.venv
  [PASS]  frontend/node_modules present

=======================================================================
  PHASE B: SYSTEM VERIFICATION
=======================================================================

  >>>  Checking root privileges...
  [PASS]  Running as root
  >>>  Checking wireless adapters...
  [PASS]  Wireless interfaces: wlan0 wlan1
  >>>  Validating database initialization...
  [PASS]  Database initializes cleanly
  >>>  Verifying backend imports...
  [PASS]  Backend module imports verified
  >>>  Checking systemd-resolved DNS stub listener...
  [PASS]  DNSStubListener disabled (no conflict with dnsmasq)
  >>>  Verifying critical RF binaries...
  [PASS]  All RF binaries available

=======================================================================
  PHASE C: STATUS REPORT
=======================================================================

  ===========================================================
  [✔] ALL SYSTEMS GO: WCARCK IS READY FOR TAKEOFF!
  ===========================================================

=======================================================================
  PHASE D: LAUNCHING SERVICES
=======================================================================

  >>>  Clearing ports 8000 and 3000...
  [PASS]  Ports cleared
  >>>  Starting backend (uvicorn on port 8000)...
  [PASS]  Backend running (PID: 12345) on http://127.0.0.1:8000
  >>>  Starting frontend (Vite dev server on port 3000)...
  [PASS]  Frontend running (PID: 12346) on http://127.0.0.1:3000

  Logs: logs/backend.log, logs/frontend.log
  Press Ctrl+C to stop all services.
```

### Stopping

Press `Ctrl+C` — the script kills backend, frontend, and any stale port processes cleanly.

---

## Manual Installation

If you prefer step-by-step control:

### 1. System Packages

```bash
sudo apt update
sudo apt install -y \
  python3 python3-venv python3-pip python3-dev \
  build-essential sqlite3 \
  aircrack-ng hcxdumptool hcxtools macchanger \
  hostapd dnsmasq tshark hashcat \
  nftables iw rfkill mdk4 curl
```

### 2. Node.js 20+

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
```

### 3. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e .
```

### 4. Frontend

```bash
cd frontend
npm install
```

### 5. Run

```bash
# Terminal 1 — Backend
cd backend
source .venv/bin/activate
uvicorn wcarck.main:app --host 0.0.0.0 --port 8000

# Terminal 2 — Frontend
cd frontend
npm run dev -- --port 3000
```

Open `http://localhost:3000` in your browser.

---

## Project Structure

```
Wcrack/
├── start.sh                    # Unified installer/verifier/launcher
├── install.sh                  # Legacy idempotent installer
├── WcrackLauncher.sh           # Legacy launcher
│
├── backend/                    # Python FastAPI backend
│   ├── pyproject.toml          # Project metadata + dependencies
│   ├── alembic/                # Database migrations
│   │   ├── env.py
│   │   └── versions/           # 3 migration files
│   ├── scripts/
│   │   └── smoke_test.sh
│   ├── tests/                  # 7 test files
│   │   ├── conftest.py
│   │   └── unit/
│   └── wcarck/                 # Main Python package
│       ├── main.py             # FastAPI app entry point
│       ├── api/                # 9 REST routers
│       ├── core/               # EventBus, Module base, error handling
│       ├── db/                 # SQLAlchemy models, session, listener
│       ├── hardware/           # AdapterWatchdog, ManagedProcess
│       ├── modules/            # Attack + Recon modules
│       ├── orchestration/      # Worker, RadioLeaseManager
│       ├── portal/             # Captive portal server + templates
│       └── utils/              # PCAP parsing utilities
│
├── frontend/                   # React 19 SPA
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── components.json         # shadcn/ui config
│   └── src/
│       ├── App.tsx             # Router (10 routes)
│       ├── main.tsx            # Entry point
│       ├── index.css           # Global styles + Tailwind
│       ├── components/
│       │   ├── layout/         # AppLayout, Sidebar, Topbar, etc.
│       │   └── ui/             # 20 shadcn/ui primitives
│       ├── hooks/              # useAudioAlerts
│       ├── lib/                # a11y, tooltips, utils
│       ├── pages/              # 10 page components
│       └── store/              # Zustand global store
│
├── packaging/                  # Deployment configs
│   ├── sudoers/wcarck          # NOPASSWD rules for RF tools
│   ├── systemd/                # wcarck.service + wcarck-reg.service
│   └── udev/                   # Adapter naming rules
│
├── wordlists/                  # Wordlist storage (empty by default)
├── Documentaion/               # 14 engineering documents
└── logs/                       # Runtime logs (gitignored)
```

---

## Backend

### Backend Tech Stack

| Component | Version | Purpose |
|-----------|---------|---------|
| Python | 3.11+ | Runtime |
| FastAPI | 0.115+ | REST API framework |
| SQLAlchemy | 2.0 (async) | ORM + database |
| aiosqlite | — | Async SQLite driver |
| Alembic | — | Database migrations |
| structlog | — | Structured logging |
| Pydantic v2 | — | Request/response validation |
| uvicorn | — | ASGI server |

### API Routers

| Router | Prefix | Purpose |
|--------|--------|---------|
| `hub.py` | `/` | WebSocket hub, system status, event stream |
| `adapters.py` | `/api/adapters` | List/scan/transition wireless adapters |
| `captures.py` | `/api/captures` | List/delete/clean/strip WPA captures |
| `credentials.py` | `/api/credentials` | View/delete extracted credentials |
| `jobs.py` | `/api/jobs` | Start/stop/query attack jobs |
| `network.py` | `/api/networks` | List/discover WiFi networks |
| `projects.py` | `/api/projects` | CRUD for engagement projects |
| `report.py` | `/api/report` | Generate engagement reports |
| `wordlists.py` | `/api/wordlists` | List/upload/delete wordlists |

### Database Models

| Model | Purpose |
|-------|---------|
| `Project` | Engagement scope (name, target, dates) |
| `Session` | Audit session within a project |
| `Scope` | Allowed targets per session |
| `Adapter` | Wireless adapter state (iface, mac, mode, driver, chipset, channel, rx/tx) |
| `ResourceLease` | Adapter-to-job locking (prevents conflicts) |
| `Network` | Discovered WiFi networks (ssid, bssid, channel, encryption, power) |
| `Client` | Associated clients per network |
| `JobQueue` | Job queue with priority, status, params, results |
| `AttackSession` | Active attack session metadata |
| `Capture` | WPA/WPA2 handshake + PMKID captures with EAPOL M1-M4 status |
| `ApSession` | Evil Twin AP session state |
| `Credential` | Extracted HTTP/DNS credentials |
| `SessionLog` | Timestamped event log per session |
| `ModuleState` | Persistent module state across restarts |
| `CrackJob` | Offline cracking job tracking (wordlist, progress, speed) |

### Module System

All attack and recon modules inherit from `Module` (defined in `core/module.py`) and implement:
- `async start(job_id, params)` — launch the module
- `async stop(job_id)` — graceful shutdown
- `status()` — current state dict

**Attack Modules:**

| Module | File | What It Does |
|--------|------|-------------|
| `attack.deauth` | `deauth.py` | Per-client deauthentication via aireplay-ng |
| `attack.pmkid` | `pmkid.py` | PMKID capture via hcxdumptool |
| `attack.pmkid_crack` | `pmkid_crack.py` | PMKID cracking via hcxpcapngtool + hashcat `-m 22000` |
| `attack.eviltwin` | `eviltwin.py` | Evil Twin with hostapd, dnsmasq, captive portal, optional deauth companion + MITM |
| `attack.mitm` | `mitm.py` | HTTP/DNS credential extraction via tcpdump |
| `attack.crack` | `crack.py` | WPA/WPA2 handshake cracking via aircrack-ng |
| `captive_portal` | `captive_portal.py` | Standalone captive portal server |

**Recon Modules:**

| Module | File | What It Does |
|--------|------|-------------|
| `recon.scanner` | `scanner.py` | WiFi network discovery + client enumeration |

### Hardware Layer

| Component | File | Purpose |
|-----------|------|---------|
| `AdapterWatchdog` | `adapter.py` | Polls wireless adapters every 2s via `iw dev`, persists to DB, emits events on mode changes, handles USB hotplug via pyudev |
| `ManagedProcess` | `process.py` | Spawns subprocesses with process group management (`os.killpg`), monitors stdout/stderr, prevents zombie processes |

### Orchestration

| Component | File | Purpose |
|-----------|------|---------|
| `Worker` | `worker.py` | Dequeues jobs, dispatches to modules, handles failures with guaranteed cleanup |
| `RadioLeaseManager` | `leases.py` | Prevents adapter conflicts — jobs acquire leases before using hardware, auto-release on completion |

### Captive Portal

The `portal/` subpackage runs a standalone FastAPI server for captive portal functionality:
- `server.py` — serves portal templates and processes credential submissions
- `templates/` — 6 built-in HTML templates with static assets
- `validators/` — aircrack and tshark pre-check validators

---

## Frontend

### Frontend Tech Stack

| Component | Version | Purpose |
|-----------|---------|---------|
| React | 19.2.6 | UI framework |
| TypeScript | — | Type safety |
| Vite | 8.0.12 | Build tool + dev server |
| Tailwind CSS | 3.4.19 | Utility-first styling |
| shadcn/ui | New York | UI component library (20 primitives) |
| Zustand | 5.0.14 | Global state management |
| React Router | 7.x | Client-side routing |
| Radix UI | — | Headless UI primitives |
| Recharts | — | Charts for dashboards |
| @tanstack/react-table | — | Data tables |
| @tanstack/react-virtual | — | Virtualized lists |
| lucide-react | 1.17.0 | Icon library |
| sonner | — | Toast notifications |
| cmdk | — | Command palette |

### Pages

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/` | Two-state (Idle/Active) overview with pipeline progress, operation cards, live results feed |
| Projects | `/projects` | Engagement project management |
| Reconnaissance | `/recon` | WiFi network scanning with context panels for deauth/PMKID/Evil Twin launch |
| AttackSurface | `/attack` | Live attack monitoring dashboard — 8 sections (networks, clients, EAPOL, quick-launch, captures, jobs, EAPOL detail, logs) |
| EvilTwin | `/eviltwin` | 3-step wizard — Target selection, Configuration (SSID, channel, template, encryption, karma, DNS spoof, MITM, deauth companion), Launch summary |
| Captures | `/captures` | WPA/PMKID capture management with strip/clean/re-cap actions |
| Credentials | `/credentials` | Extracted HTTP/DNS credential viewer |
| Crack | `/crack` | Offline WPA/WPA2 handshake cracking with wordlist selection and progress tracking |
| Logs | `/logs` | Session event log with filtering |
| Adapters | `/adapters` | Wireless adapter management — mode switching (managed/monitor), MAC randomization, RF status |

### Components

**Layout Components:**
| Component | Purpose |
|-----------|---------|
| `AppLayout.tsx` | Main shell — sidebar + topbar + content area |
| `Sidebar.tsx` | Navigation with route links and adapter status |
| `Topbar.tsx` | System status bar with WebSocket connection indicator |
| `ContentZone.tsx` | Content area wrapper |
| `ContextualPanel.tsx` | Right-side context panel |

**UI Primitives (20 shadcn/ui components):**
`app-tooltip`, `badge`, `button`, `card`, `command-palette`, `command`, `confirm-modal`, `dialog`, `dropdown-menu`, `empty-state`, `input`, `label`, `popover`, `select`, `separator`, `sheet`, `skeleton`, `tabs`, `toast`, `tooltip`

**Other Components:**
| Component | Purpose |
|-----------|---------|
| `Terminal.tsx` | In-app terminal emulator |
| `welcome-overlay.tsx` | First-visit welcome screen |

### State Management

All application state lives in a single Zustand store (`useWcarckStore.ts`):

```
Store Shape:
├── adapters: Adapter[]
├── networks: Map<string, Network>
├── clients: Map<string, Client>
├── captures: Capture[]
├── credentials: Credential[]
├── wordlists: Wordlist[]
├── jobs: Job[]
├── attackJobs: Job[]
├── logs: LogEntry[]
├── projects: Project[]
├── activeProject: Project | null
├── wsConnected: boolean
├── focusMode: boolean
├── sidebarCollapsed: boolean
│
├── fetchInitialState()          # REST fetch on mount
├── startJob(module, params)     # POST /api/jobs/start
├── stopJob(jobId)               # POST /api/jobs/{id}/stop
├── fetchWordlists()
├── fetchProjects()
├── processEvent(event)          # WebSocket event handler
└── syncHistory(events)          # Batch history processing
```

**WebSocket Protocol:**
- Connects to `ws://127.0.0.1:8000/ws`
- Receives event types: `module.started`, `module.progress`, `module.stopped`, `module.error`, `adapter.found`, `adapter.mode_changed`, `network.found`, `client.found`, `capture.saved`, `credential.extracted`, `job.failed`
- History replay on connect for catch-up

### Styling

- **CSS Variable-driven** theme system (bg, border, text, accent, status colors)
- **Dark mode** via Tailwind `class` strategy
- **Custom animations:** `pulse-green`, `shake`, `fade-in`, `slide-in-right`
- **Glass morphism** utilities for elevated surfaces
- **RF signal** color scale (excellent/good/weak/critical)
- Scoped transitions on interactive elements only (button, input, select, a)

---

## Configuration

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `WCARCK_DB_PATH` | `backend/wcarck.sqlite` | SQLite database path |
| `WCARCK_HOST` | `0.0.0.0` | Backend bind address |
| `WCARCK_PORT` | `8000` | Backend port |
| `WCARCK_LOG_LEVEL` | `info` | Python log level |

### Frontend Configuration

The frontend connects to the backend at `http://127.0.0.1:8000` (hardcoded in the store). To change this, update the `fetch` calls in `useWcarckStore.ts`.

### Tailwind Theme

Custom theme defined in `tailwind.config.ts` with CSS variables. Key color tokens:

| Token | Purpose |
|-------|---------|
| `--bg-surface` | Main background |
| `--bg-elevated` | Card/panel background |
| `--bg-hover` | Hover state |
| `--accent` | Primary action color |
| `--status-success` | Green indicators |
| `--status-error` | Red/error indicators |
| `--status-warning` | Yellow/warning indicators |
| `--status-running` | Active operation |
| `--rf-signal-*` | Signal strength scale |

---

## Deployment

### Systemd Services

Two systemd units are provided in `packaging/systemd/`:

**`wcarck.service`** — Main application service
```ini
[Unit]
Description=Wcarck WiFi Audit Platform
After=network.target

[Service]
Type=simple
User=wcarck
WorkingDirectory=/opt/Wcrack/backend
ExecStart=/opt/Wcrack/backend/.venv/bin/uvicorn wcarck.main:app --host 0.0.0.0 --port 8080
Restart=on-failure
AmbientCapabilities=CAP_NET_RAW CAP_NET_ADMIN

[Install]
WantedBy=multi-user.target
```

**`wcarck-reg.service`** — Sets regulatory domain to BO (Bolivia) on boot
```ini
[Unit]
Description=Set wireless regulatory domain to BO
After=network.target

[Service]
Type=oneshot
ExecStart=/sbin/iw reg set BO

[Install]
WantedBy=multi-user.target
```

### Sudoers Policy

`packaging/sudoers/wcarck` grants passwordless sudo for:
```
iw, ip, macchanger, hostapd, dnsmasq, airmon-ng,
hcxdumptool, aircrack-ng, aireplay-ng, mdk4
```

### Udev Rules

`packaging/udev/99-wcarck-adapters.rules` — predictable wireless interface naming template.

### Wireless Regulatory Domain

The `wcarck-reg.service` sets `iw reg set BO` (Bolivia) on boot to allow full channel range including higher-power frequencies. This is required for proper monitor mode operation on most adapters.

---

## API Reference

### Job Management

```
POST /api/jobs/start
Body: {
  "module_name": "attack.deauth",
  "handler_name": "start_deauth",
  "params": { "bssid": "AA:BB:CC:DD:EE:FF", "iface": "wlan0" },
  "priority": 100
}

POST /api/jobs/{id}/stop

GET  /api/jobs
```

### Adapters

```
GET  /api/adapters
POST /api/adapters/{id}/transition    # Switch managed/monitor mode
POST /api/adapters/{id}/randomize     # MAC randomization
```

### Networks

```
GET  /api/networks
POST /api/networks/scan               # Trigger scan
```

### Captures

```
GET    /api/captures
DELETE /api/captures/{id}
POST   /api/captures/{id}/clean       # Strip with wpaclean
POST   /api/captures/{id}/recap       # Re-capture handshake
```

### Credentials

```
GET    /api/credentials
DELETE /api/credentials/{id}
```

### Wordlists

```
GET    /api/wordlists
POST   /api/wordlists/upload
DELETE /api/wordlists/{id}
```

### Projects

```
GET    /api/projects
POST   /api/projects
PUT    /api/projects/{id}
DELETE /api/projects/{id}
```

### WebSocket

```
ws://127.0.0.1:8000/ws

Events received:
  module.started     { job_id, module, message }
  module.progress    { job_id, module, progress, data }
  module.stopped     { job_id, module }
  module.error       { job_id, module, error }
  adapter.found      { iface, mac, driver, chipset }
  adapter.mode_changed { iface, old_mode, new_mode }
  network.found      { ssid, bssid, channel, encryption, power }
  client.found       { mac, bssid, power }
  capture.saved      { id, bssid, path, eapol }
  credential.extracted { id, type, username, password, host }
```

---

## Testing

### Running Tests

```bash
cd backend
source .venv/bin/activate
pytest tests/ -v
```

### Test Structure

```
backend/tests/
├── conftest.py              # Shared fixtures
└── unit/
    ├── test_api.py          # API endpoint tests
    ├── test_attack.py       # Attack module tests
    ├── test_core.py         # EventBus, Module base tests
    ├── test_db.py           # Database model tests
    ├── test_process.py      # ManagedProcess tests
    ├── test_radio_layer.py  # AdapterWatchdog, lease tests
    └── test_recon.py        # Scanner module tests
```

### Smoke Test

```bash
bash backend/scripts/smoke_test.sh
```

---

## Documentation

The `Documentaion/` directory contains 14 engineering documents (typo preserved from original):

| Document | Description |
|----------|-------------|
| `Wcarck.md` | Full project specification (2172 lines) — architecture, modules, API, deployment |
| `TEST.md` | Comprehensive system audit — 86+ issues found and tracked |
| `MiMoFix.md` | MiMo self-scrutiny reports — 92 issues fixed across 6 sessions |
| `Audit.md` | UI/exception-handling audit — 71 issues |
| `UBUNTU_RUNBOOK.md` | Step-by-step Ubuntu deployment guide |
| `StartUp.md` | Startup and development guide |
| `FinalVerdict.md` | Final verdict and stop-gap analysis |
| `wcarck_ui_ux_design.md` | UI/UX design specification |
| `wcarck_logging_design.md` | Logging system design |
| `wcarck_edge_cases_exceptions.md` | Edge cases and exception handling |
| `wcarck_plan_review.md` | Plan review + competitor analysis |
| `wcarck_engineering_review.md` | Deep technical engineering review |
| `Wcarck_competitor_analysis.md` | Analysis of bettercap, Airgeddon, wifiphisher, wifite2 |
| `simulator.md` | Simulator mode reference |

Root-level documents:
| Document | Description |
|----------|-------------|
| `debug.md` | Living debug log |
| `EH.md` | Exception handling audit |
| `mistake_reference.md` | Incident report for lost uncommitted changes |
| `simulator.md` | Simulator mode guide |

---

## Security

### Threat Model

Wcrack is designed for **single-operator, local-only** use on a dedicated penetration testing laptop. It is NOT designed for:
- Multi-user deployments
- Internet-facing exposure
- Production network environments

### Known Security Considerations

| Item | Status |
|------|--------|
| No authentication (V1) | By design — single operator on localhost |
| No TLS (V1) | By design — plain HTTP on 127.0.0.1 |
| Hardcoded WPA passphrase | `password123` in EvilTwin hostapd config (dev default) |
| tcpdump runs without sudo | May fail silently on some setups |
| Sudoers NOPASSWD | scoped to specific RF tools only |
| Root requirement | Required for all RF operations |

### Security Best Practices

- Run on an isolated, air-gapped testing network
- Never expose port 8000 to untrusted networks
- Use a dedicated testing laptop, not a production machine
- Clear captures and credentials after engagements
- Review wordlists before use (never use untrusted wordlists)

---

## Roadmap

### V1 (Current) — Engineering MVP
- [x] FastAPI backend with async SQLite
- [x] React frontend with 10 pages
- [x] Recon, Deauth, PMKID, Evil Twin, MITM, Cracking modules
- [x] Unified launcher (`start.sh`)
- [x] EventBus + WebSocket real-time updates
- [x] Job queue with priority scheduling
- [x] Radio lease management
- [x] Captive portal with 6 templates

### V2 (Planned)
- [ ] Authentication + TLS
- [ ] Multi-user support with RBAC
- [ ] Persistent implants / Remote C2
- [ ] Projects feature — edit UI + session management
- [ ] Real RSSI from `iw dev` via watchdog
- [ ] Additional captive portal templates
- [ ] Report PDF generation
- [ ] Plugin/module marketplace

---

## License

This project is licensed under the **GNU General Public License v3.0** — see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- **aircrack-ng suite** — foundational WiFi auditing tools
- **airgeddon** — multi-use attack menu for wireless auditing
- **wifipumpkin3** — rogue access point framework
- **Wifite2** — automated wireless attack tool
- **Hak5 Pineapple** — inspiration for the control panel concept
- **shadcn/ui** — beautiful, accessible React components
- **Tailwind CSS** — utility-first CSS framework

---

*Built for penetration testers who want a single pane of glass for wireless engagements.*
