# Porject47 — Wcarck

**Pineapple-class WiFi Audit Platform for Ubuntu**

> A portable, web-driven 802.11 reconnaissance and offensive-security platform.
> Successor to the ESP8266 "CutePieBoard" — same philosophy, full-Linux power.

---

## Document Metadata

| Field | Value |
|---|---|
| Project codename | **Wcarck** |
| Internal doc ID | Porject47 |
| Document version | 0.1.6 (Planning Phase — engineering-review + plan-review integration) |
| Author | Parikshit |
| Machine | `Code-X` |
| Target OS | Ubuntu 22.04 LTS / 24.04 LTS (dual-boot) |
| Last updated | 03 June 2026 (rev 0.1.6) |
| Status | **PLAN LOCKED v0.1.6 — Engineering MVP** |
| License (proposed) | GPL-3.0 |
| Repo location | `~/Projects/wcarck` (local-only initially) |

---

## 🤖 Master Index & Cross-References (For AI Coders)

**CRITICAL INSTRUCTION FOR AI AGENTS:** `Wcarck.md` is the dense, high-level structural map of the project. However, the *deep logic, exact error handling, UI state management, and hardware orchestration code* are documented in 5 critical auxiliary files. **You MUST read the relevant auxiliary file before implementing its respective module.**

If the details in `Wcarck.md` seem too compact or you are unsure how to implement a feature, look in these files located in the project's design history / artifact directory:

1. **`wcarck_engineering_review.md` (The "How-To-Code" Guide):**
   - Read this before touching `ManagedProcess`, subprocess pipes, or hardware drivers.
   - Contains explicit fixes for: `asyncio` stdout pipe deadlocks, `NetworkManager` unmanaged configs (`99-wcarck.conf`), `iw reg set BO` regulatory domain unlocking, and dropping root privileges to a `wcarck` user via `/etc/sudoers.d/wcarck`.
2. **`wcarck_edge_cases_exceptions.md` (The "What-Goes-Wrong" Guide):**
   - Read this before building the `RadioLeaseManager`, Event Bus, or Evil Twin.
   - Contains exact implementations for: Hardware unplug (`AdapterWatchdog`), system suspend DBus hooks (`PrepareForSleep`), WPA3 PMF Deauth immunity, DFS Radar (CAC) 60s delays, and DoH (port 853) `nftables` DNS pinning bypasses.
3. **`wcarck_logging_design.md` (The "Data" Guide):**
   - Read this before setting up SQLite, `job_queue`, or `structlog`.
   - Contains the exact 14-field JSONL schema, the `time.monotonic()` requirements to prevent NTP clock-skew bugs, and the `PRAGMA wal_checkpoint(PASSIVE)` starvation fix.
4. **`wcarck_ui_ux_design.md` (The "Frontend" Guide):**
   - Read this before writing React/Vite/Tailwind code.
   - Contains exact component blueprints, the Zustand state-preservation strategy (to fix the "F5 Problem"), responsive mobile Bottom Sheets, and the design for bulk actions.
5. **`FinalVerdict.md` (The "Bird's Eye" Orchestration Guide):**
   - Read this to understand system-level blockers like why Wcarck cannot be containerized in Docker, why HSTS makes HTTPS interception impossible, and why USB Bus power limits matter.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Identity](#2-project-identity)
3. [Origin Story — ESP8266 Lineage](#3-origin-story--esp8266-lineage)
4. [Hardware Inventory](#4-hardware-inventory)
5. [Network Environment & Test Lab](#5-network-environment--test-lab)
6. [System Architecture](#6-system-architecture)
7. [Technology Stack](#7-technology-stack)
8. [Project Structure](#8-project-structure)
9. [Database Schema](#9-database-schema)
10. [API Surface](#10-api-surface)
11. [Feature Roadmap](#11-feature-roadmap)
12. [MVP Engineering Model](#12-mvp-engineering-model)
13. [udev Rules — Predictable Interface Naming](#13-udev-rules)
14. [systemd Service Design](#14-systemd-service-design)
15. [Installation Flow](#15-installation-flow)
16. [Driver Setup Matrix](#16-driver-setup-matrix)
17. [Captive Portal Templates](#17-captive-portal-templates)
18. [Testing Strategy](#18-testing-strategy)
19. [Risk Register](#19-risk-register)
20. [Open Questions](#20-open-questions)
21. [Decision Log](#21-decision-log)
22. [Glossary](#22-glossary)
23. [References & Further Reading](#23-references--further-reading)
24. [Changelog](#24-changelog)
25. [V2 Future Vision](#25-v2-future-vision-post-mvp-sketch-only)
26. [Module & Plugin Architecture](#26-module--plugin-architecture)
27. [Reference Tool Notes & Attribution](#27-reference-tool-notes--attribution)
28. [Edge Cases & Exception Handling](#28-edge-cases--exception-handling)

| Status | **PLAN LOCKED v0.1.6 — Engineering MVP** |
| License (proposed) | GPL-3.0 |
| Repo location | `~/Projects/wcarck` (local-only initially) |

---

## 1. Executive Summary

**Wcarck** is a self-hosted, browser-driven 802.11 penetration-testing platform
built for Ubuntu. It aims for **feature parity with Hak5's WiFi Pineapple Mark VII**
while running on commodity laptop hardware with off-the-shelf USB Wi-Fi adapters.

### Key differentiators
- **Free and open** — no vendor lock-in, full source under GPL-3.0
- **Familiar laptop hardware** — runs on any Ubuntu 22.04+ system with two
  injection-capable USB adapters
- **Professional GUI** — React/Tailwind/shadcn UI, not a 2010-era admin panel
- **Engineering-first MVP** — no login wall, no TLS ceremony, no legal overhead; open the browser and hack
- **Session-ready** — every scan, attack, portal, and crack job has a status, stop hook, and plain log
- **Captive-portal phishing baked in** — production templates shipping at MVP
- **Capture-first workflow** — handshakes, PMKIDs, and credentials stored cleanly for later review
- **Radio-safe orchestration** — a lease manager prevents scan, deauth, capture, AP, and portal jobs from fighting over the same adapter

### MVP definition (end of Week 4)
A user can: open the web GUI (no login), pick a target network from the scan
list, harvest probe requests, deauthenticate clients, capture WPA2 handshakes
and PMKIDs, export to hashcat format, launch an Evil Twin with a captive
portal, see harvested credentials in plain text, and download session artifacts
— all without touching a terminal.

### Project scale
- ~6,000–9,000 LOC backend (Python)
- ~4,000–6,000 LOC frontend (TypeScript/TSX)
- ~7-week timeline at 20+ hrs/week intensive pace
- Single developer, no external dependencies beyond OSS toolchain

---

## 2. Project Identity

### Names
- **Codename**: `Wcarck`
- **Display name**: Wcarck
- **CLI binary**: `wcarck`
- **systemd unit**: `wcarck.service`
- **System user**: `wcarck`
- **Config dir**: `/etc/wcarck/`
- **Data dir**: `/var/lib/wcarck/`
- **Log dir**: `/var/log/wcarck/`
- **User home (for dev)**: `~/Projects/wcarck/`

### Tagline
> *"Portable WiFi audit platform — Pineapple capability, laptop convenience."*

### Non-goals (scope guardrails)

**Not in scope (any version, including V2):**
- [-] **Windows or macOS support** — Linux only, Ubuntu first-class
- [-] **Mobile app** — browser is the only client
- [-] **Bluetooth Classic attacks** (BLE recon possible as a Phase 6 stretch)
- [-] **Cellular interception** (no SDR, no GSM/LTE work)
- [-] **Replacement for Wireshark/Kismet** — we orchestrate, we don't reimplement

**Out of product scope unless a separate product review creates a new project:**
- [-] **Persistent implants on victim hosts** — not a Wi-Fi audit workflow and not part of Wcarck V1/V2.
- [-] **Remote C2 framework** — Wcarck is strictly local-only. No network beaconing, no cloud dashboard, no remote operator console.

**Moved into V1 scope (was previously a non-goal):**
- [+] **Password cracking inside Wcarck** — wraps `hashcat` / `john` as an opt-in Phase 6 engine. See Section 11 Phase 6, Section 9 (`crack_jobs` table), Section 10 (`/api/crack/*` endpoints), and decision D18.

### License rationale
**GPL-3.0** chosen because:
- Aligns with aircrack-ng / hcxtools / hostapd ecosystem
- Prevents proprietary forks of an offensive-security tool
- Strong copyleft keeps forks aligned with the project
- Familiar to the security community

---

## 3. Origin Story — ESP8266 Lineage

Wcarck descends from a working ESP8266 firmware named **CutePieBoard** (also
seen as `DeAutherBoard`, `DeautherBoard`, `EvilTwinBoard` in WiFi profile
history). The board demonstrated, on 80 KB of RAM:

- Async network scanning (max 16 networks, 15s interval)
- 802.11 deauthentication packet injection
- Evil Twin with phishing captive portal ("firmware update required")
- Beacon spam — 25 SSIDs across channels 1/6/11, MIUI-tuned ~750 pkt/s
- Web admin panel on `192.168.4.1` with chunked HTML rendering
- LED status patterns for idle/clients/deauth/eviltwin/beacon/capture states

The ESP code proved that the **conceptual architecture works on tiny silicon**.
Wcarck transplants the same architecture onto Linux, replacing constraints
(single radio, no monitor mode, no HTTPS, no handshake capture) with full
Linux capabilities (multi-radio, real monitor + injection, mbedTLS, hcxdumptool).

### Heritage features migrating to Wcarck
| ESP8266 feature | Wcarck equivalent |
|---|---|
| `CutePieBoard` admin AP | Self-signed HTTPS GUI on `127.0.0.1:8443` |
| Chunked HTML admin panel | React SPA + WebSocket live updates |
| Beacon spam (25 hardcoded SSIDs) | Beacon spam engine with editable lists, channel hopper |
| Captive "firmware update" page | Captive Portal #1: ported as `router_update.html` |
| LED status patterns | UI status bar with same semantic colors |
| Deauth on selected BSSID | Deauth engine, scope-checked, with optional client targeting |
| Async scan | Continuous scan engine with band hopping |

The ESP board may eventually become a **distributed sensor satellite** for
Wcarck (deferred to Phase 6+ per current scope decisions).

---

## 4. Hardware Inventory

### Host machine
- **Hostname**: `Code-X`
- **Dual-boot**: Windows 11 (current) + Ubuntu 22.04/24.04 (target)
- **VirtualBox** installed (host-only network at `192.168.56.1/24` — useful for hwsim test lab)

### Radio 1 — wlan0 (built-in)
| Property | Value |
|---|---|
| Chipset | **MediaTek MT7902** (Wi-Fi 6E, "Filogic 130W" class) |
| MAC | `28:D0:43:0A:73:8C` |
| Bands | 2.4 GHz / 5 GHz / **6 GHz** |
| Spatial streams | 1 × 1 (single antenna) |
| Linux driver | `mt7921e` (mainline, MT7902 piggy-backs) |
| Monitor mode (Linux) | ⚠️ Partial — passive scan OK, **injection unreliable** |
| AP mode (Linux) | ⚠️ Partial — hostapd works on 2.4 GHz, 5 GHz patchy |
| **Wcarck role** | **Internet uplink only** (managed mode, never reassigned) |

### Radio 2 — wlan1 (USB)
| Property | Value |
|---|---|
| Chipset | **Ralink RT-series** (RT3070 / RT5370 / RT5572 family) |
| Vendor OUI | `00:1E:A6` — Best IT World (India) / iBall reseller |
| MAC | `00:1E:A6:C6:57:44` |
| Bands | **2.4 GHz only** |
| Standard | 802.11 b/g/n (no AC/AX) |
| Linux driver | `rt2800usb` (mainline, **zero setup**) |
| Monitor + injection | Legendary aircrack-ng compatibility |
| AP mode | ✅ hostapd works fine |
| **Wcarck role** | **Monitor + injection on 2.4 GHz** (primary attack card) |

### Radio 3 — wlan2 (USB)
| Property | Value |
|---|---|
| Chipset | **Realtek RTL8821AU** (TP-Link Archer T2U Plus, AC600) |
| Vendor OUI | `5C:62:8B` — TP-Link Technologies Co., Ltd. |
| MAC | `5C:62:8B:76:5D:E2` |
| Bands | 2.4 GHz + 5 GHz dual-band |
| Standard | 802.11 b/g/n/ac (433 Mbps on 5 GHz) |
| Linux driver | **morrownr/8821au-20210708 DKMS** (out-of-tree) |
| Monitor + injection | ✅ Works with morrownr driver |
| AP mode | ✅ Works with morrownr driver |
| **Wcarck role** | **Evil Twin AP + 5 GHz monitor** (secondary attack card) |

### Radio role assignment summary
```
┌─────────────────────────────────────────────────────────────┐
│  wlan_uplink   28:D0:43:0A:73:8C    MT7902 → internet only  │
├─────────────────────────────────────────────────────────────┤
│  wlan_mon      00:1E:A6:C6:57:44    Ralink → 2.4 GHz attack │
├─────────────────────────────────────────────────────────────┤
│  wlan_ap       5C:62:8B:76:5D:E2    T2U+  → AP / 5 GHz mon  │
└─────────────────────────────────────────────────────────────┘
```

### Future hardware (optional, post-MVP)
- **Alfa AWUS036ACM** (MT7612U) — best dual-band injection/AP card; mainline driver; ~₹4,000
- **Powered USB 3.0 hub** — prevents bus-power starvation with two adapters
- **External 5 GHz antenna** (RP-SMA) for Archer T2U Plus extension

---

## 5. Network Environment & Test Lab

### Current home network (confirmed via Windows ipconfig)
| Property | Value |
|---|---|
| ISP | **Bharti Airtel** (IPv6 prefix `2401:4900::/32`) |
| Router MAC (LAN) | `30:4F:75:E8:23:8F` (decoded from IPv6 EUI-64) |
| Router IP | `192.168.1.1` |
| DHCP server | `192.168.1.1` |
| DNS (IPv6) | `2401:4900:50:9::7e9`, `2401:4900:50:9::19d` |
| Subnet | `192.168.1.0/24` |
| Current laptop IP | `192.168.1.8` (DHCP) |

### Confirmed visible SSIDs (on `Code-X` profile list, last scan)
**Own networks (in-scope by default)**:
| SSID | BSSID | Band | Channel | Auth | Signal | Notes |
|---|---|---|---|---|---|---|
| NASA | `30:4F:75:E8:23:90` | 2.4 GHz | 1 | WPA2-Personal | -47 dBm | Primary home AP |
| NASA+ | `30:4F:75:E8:23:91` | 5 GHz | 157 | WPA2-Personal | 81% | Same router, 5 GHz |
| Camp | `32:4F:75:D8:23:90` | 2.4 GHz | 1 | WPA2-Personal | 89% | Locally-admin MAC — guest VAP or ESP clone |

**Out-of-scope / observed only** (must NEVER be targeted without explicit scope):
- `vivo Y21`, `OPPO A77`, `OPPO F27 Pro+ 5G`, `kingkongjio`, `realme 12x 5G 7F6C`,
  `Galaxy A55 5G 3D50`, `TECNO POVA 7 5G`, `Galaxy S23`, `ONE PLUS NORD CE3 LITE`
- Institutional: `DRDO`, `AUMP-Guest`, `Amity-Wifi`
- Carrier: `Airtel_NASA`, `Airtel_Zerotouch_5G`, `Airtel_Diablo_19`,
  `Airtel_PionDexter_`
- Neighboring residential: `Akhilesh`, `Mynet`, `BlackDevil`, `Black Devil`,
  `Sengar`, `Adi Bhai`, `Mehak`, `mayank`, `Volturi`, `Hello`, `EVO-x`,
  `ManagementAP`, `Tenda_4G` (×3), `Moo Me Lele`, `Jai shree Ram`,
  `Na Karen Janab Na Karen`, `AdityaÂ°Z`

**Lineage / own ESP boards**:
- `CutePieBoard` (current firmware AP)
- `DeAutherBoard`, `DeautherBoard`
- `EvilTwinBoard`
- `PenTest`

### Default test lab plan
1. **Primary target**: `NASA` on 2.4 GHz channel 1 — same-band as Ralink, easiest first attacks
2. **Secondary target**: `NASA+` on 5 GHz channel 157 — for T2U Plus testing
3. **Adversarial target**: spin up second SSID on `CutePieBoard` ESP8266 as a controlled attack subject
4. **Virtual lab**: `mac80211_hwsim` inside VirtualBox VM for CI and zero-RF iteration

### Scope discipline
Even on personal lab, the GUI **requires an explicit scope record** with allowed
BSSIDs. The default scope ships with the three "own networks" pre-populated and
nothing else. Attempting to target an out-of-scope BSSID returns
`403 OUT_OF_SCOPE` at the engine level.

---

## 6. System Architecture

### Layered view
```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (Chrome/Firefox)                  │
│                  http://localhost:8080                       │
│      React SPA · WebSocket (live) · REST (commands)         │
└───────────────────────────┬─────────────────────────────────┘
                            │ Plain HTTP
┌───────────────────────────┴─────────────────────────────────┐
│              wcarck-api (FastAPI + uvicorn)                  │
│   ┌────────────────────────────────────────────────────┐   │
│   │  Scope guard           Audit log                   │   │
│   │  REST endpoints    WebSocket hub    Job scheduler  │   │
│   └────────────────────────────────────────────────────┘   │
│   ┌────────────────────────────────────────────────────┐   │
│   │            Engine Manager (asyncio)                 │   │
│   │  ScanEngine  AttackEngine  CaptureEngine  APEngine │   │
│   └────────────┬────────────────┬──────────────┬──────┘   │
└────────────────┼────────────────┼──────────────┼──────────┘
                 │                │              │
       ┌─────────┴────┐ ┌────────┴───┐ ┌────────┴────────┐
       │  subprocess  │ │   scapy    │ │  pyroute2/nl80211│
       │  airodump    │ │ raw frames │ │  iface mgmt      │
       │  hcxdumptool │ │ deauth     │ │  monitor switch  │
       │  hostapd     │ │ probe req  │ │                  │
       │  dnsmasq     │ │            │ │                  │
       └──────────────┘ └────────────┘ └──────────────────┘
                            │
                  ┌─────────┴──────────┐
                  │   SQLite (WAL)     │
                  │ /var/lib/wcarck/   │
                  │   db.sqlite        │
                  └────────────────────┘
```

### Process model
- **One systemd service**: `wcarck.service`
- **Runs as**: dedicated `wcarck` user (NOT root)
- **Capabilities**: `CAP_NET_RAW`, `CAP_NET_ADMIN` (via `AmbientCapabilities=`). `CAP_SYS_ADMIN` is intentionally absent — see D35 and Section 14.
- **Modules**: asyncio-native `Module` instances inside the main process (shared services, explicit lifecycle)
- **Job runner**: bounded async queue; every long-running action has a job id, owner, scope, adapter leases, status, stop hook, and log
- **External tools**: managed children (`hostapd`, `dnsmasq`, `airodump-ng`, `aireplay-ng`, `hcxdumptool`) — lifecycle controlled by Engine Manager
- **Captive portal**: separate aiohttp app on the AP interface, isolated for safety

### Control plane vs data plane
Wcarck is split into a small control plane and multiple data-plane modules:

| Plane | Responsibilities | Hard rule |
|---|---|---|
| Control plane | Target boundary, module registry, job queue, audit log, event bus | Never touches raw 802.11 frames directly |
| Data plane | Scan, deauth, capture, PMKID, AP, captive portal, cracking | Cannot start without a scope check and radio lease |
| System plane | Adapter mode changes, nftables chains, process lifecycle, filesystem paths | Idempotent start/stop; every mutation has teardown |

This prevents the React UI or a plugin from calling a packet sender directly.
All execution flows through: API/CLI -> handler -> target check -> job runner ->
radio lease -> module start -> event bus -> session log.

### Radio lease manager
Adapters are scarce and stateful. Wcarck therefore treats each adapter as a
leased resource, not a global variable. A module must acquire a lease before it
can change mode, set channel, spawn a tool, or inject frames.

| Lease | Adapter | Compatible jobs | Conflicts with |
|---|---|---|---|
| `uplink.managed` | `wlan_uplink` | UI internet, dependency download, updates | Any monitor/AP reassignment |
| `monitor.scan` | `wlan_mon` or `wlan_ap` | Passive scan, probe harvest | Channel-locked deauth/capture |
| `monitor.locked` | `wlan_mon` or `wlan_ap` | Deauth, handshake, PMKID | Channel hopper, AP mode |
| `ap.service` | `wlan_ap` | hostapd, dnsmasq, captive portal | Monitor jobs on same radio |
| `crack.compute` | CPU/GPU | hashcat/john | Another cracking job using same device |

Lease denial returns `409 RESOURCE_BUSY` with the active job id and a safe
next action (`stop_job`, `wait`, or `choose_adapter`). This is a core product
feature: the user sees why an action is unavailable instead of getting a
half-broken adapter state.

#### Lease acquisition rules (engineering-review §6.1-6.3, plan-review §2.7-2.8, §2.10)

- **Per-adapter lock, not a global lock.** Concurrent lease requests for
  *different* adapters (e.g., scan on `wlan_mon` + AP on `wlan_ap`) do not
  contend. Lock granularity is `(resource_type, resource_id)`. A failing
  request must not block a passing one.
- **TTL + heartbeat.** Every lease has an `expires_at`; the lease manager
  runs a 1 s background task that marks expired leases `expired` and
  publishes `lease.expired` on the event bus. Active jobs renew the TTL
  every `lease_ttl / 3` seconds via a non-blocking heartbeat.
- **Orphan sweep on startup.** A new wcarck process scans
  `resource_leases WHERE status='active'` and marks any row whose
  `acquired_at` is older than the runtime-down window as `orphaned`.
  `systemctl restart` on a crashed job must not strand leases.
- **Injection-test pre-flight (plan-review §2.10).** Before a
  `monitor.locked` lease is granted, the lease manager spawns a
  `RadioChannelGuard` context, sends a single scapy beacon frame through
  the monitor interface, and reads back the kernel's TX-success counter.
  Zero successes → lease denied with `monitor.unable_to_inject`.
  Prevents "I leased the radio but cannot actually send anything"
  situations.
- **`HandshakeCaptureModule` requires `monitor.locked`, not
  `monitor.scan` (plan-review §2.8).** A scan lease on a channel-hopping
  monitor is incompatible with 4-EAPOL state machine; the module
  requests `monitor.locked` and the UI shows the conflicting scan job
  (or stops it on user confirm).
- **PMF-aware deauth denials (D41).** The deauth engine inspects the
  target's beacon for `RSN mgmt_frame_protection=1`; if present, the
  lease for `monitor.locked + deauth` is denied with a "target requires
  PMF; deauth not viable" message and falls back to client-side L2.
- **RTL8821AU 5 GHz + AP mode constraint (plan-review §2.7).** The
  `wlan_ap` (RTL8821AU) radio cannot run 5 GHz monitor mode *and* AP
  mode simultaneously — the morrownr driver only supports one role
  per band at a time. The UI shows a hint when the user picks
  5 GHz on `wlan_ap` for monitor while AP is active, and offers
  `wlan_mon` (2.4 GHz Ralink) as the alternative.

### Job lifecycle
Every long-running operation follows the same state machine:

```
QUEUED -> SCOPE_CHECKED -> LEASED -> STARTING -> RUNNING
       -> STOPPING -> COMPLETED | FAILED | CANCELLED
```

Each transition publishes an event and writes a session-log row. Jobs have a
`stop()` coroutine that unwinds in reverse order: module stop, child-process
cascade, nftables teardown, adapter restore, lease release. The job runner
refuses orphaned background tasks at shutdown; systemd restart must never
leave hostapd, dnsmasq, nftables chains, or monitor-mode radios behind.

### Artifact pipeline
MVP stores artifacts in predictable per-session folders instead of building a
full evidence/report subsystem on day one. Each capture or log records scope,
job id, path, SHA-256, creation time, and source module. MVP artifact types:

- `capture.pcapng` / `capture.22000`
- `portal.credential`
- `scan.snapshot`
- `tool.log`

The full evidence registry, retention policy, redaction, and PDF/JSON report
pipeline move to Phase 5. This keeps initial implementation energy on RF
correctness, adapter stability, and the Evil Twin workflow.

### Data flow example — Deauth attack
```
1. User clicks "Deauth" on Targets page
2. Browser POST /api/attacks/deauth {bssid, channel, client?}
3. Scope guard checks bssid against active scope → 200 or 403
4. Job runner creates DB row in job_queue; attack_sessions row references it via job_id FK
5. RadioLeaseManager grants monitor.locked lease on wlan_mon
6. DeauthModule sets wlan_mon channel to target channel
7. DeauthModule spawns the selected sender through ManagedProcess
8. stdout/events piped to parser → event bus → WS broadcast → frontend counter
9. User clicks "Stop" → POST /api/jobs/{id}/stop
10. Job runner calls DeauthModule.stop()
11. ManagedProcess sends SIGINT (default) → SIGTERM → kill if needed.
    Per-tool overrides: hcxdumptool uses SIGTERM directly (D36 — clean pcapng flush).
12. Adapter channel/mode restored, lease released
13. job_queue row finalized with status/duration; attack_sessions row
    finalized with packets_sent; one or more captures rows for artifacts
    with sha256 populated (§9); leases released in reverse order
14. WS broadcasts attack.deauth.ended
15. Session log entry written
```

### Mode-switch state machine (single-radio Evil Twin)
```
[wlan_ap: monitor mode] ──user starts Evil Twin──▶ [TRANSITIONING]
                                                          │
                                                          ▼
                                            ┌──────────────────────────┐
                                            │ tear down monitor (1s)   │
                                            │ start hostapd (2s)       │
                                            │ start dnsmasq (1s)       │
                                            │ start captive portal (1s)│
                                            └────────────┬─────────────┘
                                                         ▼
                                            [wlan_ap: AP mode active]
                                                         │
                              ┌──user stops Evil Twin──┘
                              ▼
                    ┌──────────────────────┐
                    │ stop captive portal  │
                    │ stop dnsmasq         │
                    │ stop hostapd         │
                    │ restore monitor      │
                    └──────────┬───────────┘
                               ▼
                  [wlan_ap: monitor mode restored]
```

UI shows clear progress badges during transitions; no operations available
mid-transition (engine enforces).

---

## 7. Technology Stack

### Backend
| Component | Choice | Version | Purpose |
|---|---|---|---|
| Runtime | **Python** | 3.12 | Latest stable on Ubuntu 24.04 |
| Package mgr | **uv** | 0.4+ | Modern, faster than Poetry |
| Web framework | **FastAPI** | 0.110+ | Async, OpenAPI, WebSocket |
| ASGI server | **uvicorn** | 0.27+ (`[standard]`) | Production-grade |
| ORM | **SQLAlchemy** | 2.0 (async) | Mature, type-safe |
| Migrations | **Alembic** | 1.13+ | Schema versioning |
| Validation | **pydantic** | 2.x | Native to FastAPI |
| Raw packets | **scapy** | 2.5+ | Frame craft, parsing |
| netlink/nl80211 | **pyroute2** | 0.7+ | Iface mgmt without shelling |
| Subprocess | `asyncio.subprocess` + **psutil** | — | Process lifecycle |
| Logging | **structlog** | latest | Structured JSON logs |
| Settings | **pydantic-settings** | latest | Env + TOML |
| Captive HTTP | **aiohttp** | 3.9+ | Isolated from FastAPI |
| Testing | **pytest** + **pytest-asyncio** + **respx** | latest | Standard |
| Lint/type | **ruff** + **mypy** | latest | Modern toolchain |

> [~] **Deferred to post-MVP hardening:** PyJWT, passlib/Argon2, cryptography (credential encryption), WeasyPrint (PDF reports). These add zero RF capability and slow down the initial build.

### Frontend
| Component | Choice | Version | Purpose |
|---|---|---|---|
| Framework | **React** | 18 | Mature ecosystem |
| Build tool | **Vite** | 5 | Fast HMR, esbuild-based |
| Language | **TypeScript** | 5.4 | Type safety |
| Package mgr | **pnpm** | 9+ | Efficient store |
| Styling | **TailwindCSS** | 3.4 | Utility-first |
| Components | **shadcn/ui** | latest | Pineapple-class polish |
| Routing | **react-router** | 6 | Standard SPA routing |
| State | **Zustand** | 4 | Lightweight, no Redux |
| HTTP | **axios** | 1.6+ | Familiar |
| WebSocket | native `WebSocket` + custom hook | — | Simple |
| Charts | **Recharts** | 2.x | RSSI, packet rates |
| Tables | **TanStack Table** | 8 | Network/client lists |
| Forms | **react-hook-form** + **zod** | latest | Validation |
| Icons | **lucide-react** | latest | shadcn default |
| Linting | **eslint** + **prettier** | latest | Standard |
| Testing | **vitest** + **Playwright** | latest | Unit + E2E |

#### Frontend correctness (engineering-review §10)

The frontend has three patterns that look fine in code review but cause
real bugs at runtime. They are locked in here so they are not forgotten
when the routes are implemented.

- **WebSocket reconnect with exponential backoff.** The custom
  `useWebSocket` hook reconnects on close using the sequence
  `1s, 2s, 4s, 8s, 16s, 30s, 30s, ...` and re-syncs the missed window
  via `/api/events?from=N` keyed on the latest received event index.
  Fixed-interval reconnect (e.g., the obvious `setTimeout(1000)`) causes
  a thundering herd if the wcarck-api restarts while N browser tabs are
  open.
- **Zustand BSSID-keyed records, not arrays.** The scan store uses
  `Record<BSSID, Network>` (with `immer` middleware) instead of
  `Network[]`. A `scan.network` event that arrives 5x per second
  produces at most one new key per BSSID per debounce window; an array
  would force a re-render of the entire Networks table on every event.
- **`useEffect` cleanup on unmount.** Every `useEffect` that subscribes
  to an event-bus queue, a `setInterval`, or a `ManagedProcess`
  observer must return a cleanup function. React 18 strict mode mounts
  effects twice in dev, so a missing cleanup leaks one set of
  subscribers and a stale WS queue.
- **Deauth run-id binding.** The `Attacks.tsx` page binds every
  deauth-tick counter to the run-id of the active job, not to the
  page-mount time. A React Fast Refresh / HMR during a live attack
  remounts the page; without run-id binding, the live counter would
  inherit the prior job's packets/sec and look correct while the
  engine is actually idle.

### System-level dependencies (apt + source)
```
aircrack-ng       hcxtools          hcxdumptool       hostapd
dnsmasq           bettercap         tcpdump           wireshark-common
mdk4              iw                macchanger        net-tools
wireless-tools    rfkill            ethtool           libpcap-dev
build-essential   linux-headers-$(uname -r)
8821au-dkms       (built from morrownr fork via DKMS)
```

---

## 8. Project Structure

```
~/Projects/wcarck/
├── README.md
├── LICENSE                                   # GPL-3.0
├── .gitignore
├── .editorconfig
│
├── backend/
│   ├── pyproject.toml                        # uv-managed
│   ├── uv.lock
│   ├── alembic.ini
│   ├── wcarck/
│   │   ├── __init__.py
│   │   ├── __main__.py                       # python -m wcarck
│   │   ├── app.py                            # FastAPI app factory
│   │   ├── config.py                         # pydantic-settings
│   │   │
│   │   ├── core/
│   │   │   ├── module.py                      # Module / Param / Handler contract
│   │   │   ├── registry.py                    # built-in + plugin registry
│   │   │   ├── event_bus.py                   # ring buffer + fan-out
│   │   │   ├── process.py                     # ManagedProcess cascade + _kill_process_tree
│   │   │   ├── external_tool.py               # dependency registry
│   │   │   ├── errors.py                      # domain exceptions
│   │   │   ├── watchdog.py                    # AdapterWatchdog (D44)
│   │   │   ├── result.py                      # Ok / Err Result type (D43)
│   │   │   ├── circuit_breaker.py             # CircuitBreaker for external tools (D55)
│   │   │   ├── retry.py                       # retry_with_backoff + jitter (D56)
│   │   │   ├── db.py                          # open_database_safely + verify_schema (D57-D60)
│   │   │
│   │   ├── orchestration/
│   │   │   ├── jobs.py                        # job queue + lifecycle
│   │   │   ├── leases.py                      # per-phy adapter/GPU lease manager (D44, D77)
│   │   │   ├── teardown.py                    # reverse-order cleanup stack
│   │   │   └── scheduler.py                   # bounded async worker pool

│   │   │
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── adapters.py
│   │   │   │   ├── scan.py
│   │   │   │   ├── targets.py
│   │   │   │   ├── attacks.py
│   │   │   │   ├── ap.py
│   │   │   │   ├── captures.py
│   │   │   │   ├── credentials.py
│   │   │   │   ├── scope.py
│   │   │   │   └── modules.py
│   │   │   ├── deps.py                       # FastAPI dependencies
│   │   │   ├── errors.py                     # exception handlers
│   │   │   └── ws.py                         # WebSocket hub
│   │   │
│   │   ├── modules/
│   │   │   ├── adapters/
│   │   │   ├── scan/                         # airodump / iw scan
│   │   │   ├── deauth/                       # burst sender + pursuit state
│   │   │   ├── handshake/                    # hcxdumptool + validators
│   │   │   ├── pmkid/                        # clientless association capture
│   │   │   ├── evil_twin/                    # hostapd/dnsmasq/nftables
│   │   │   ├── portal/                       # templates + validators
│   │   │   ├── crack/                        # hashcat/john wrapper
│   │   │   ├── session_log/                  # session log subscriber
│   │   │   └── api_rest/                     # handler-to-route bridge
│   │   │
│   │   ├── radio/
│   │   │   ├── manager.py                    # adapter discovery
│   │   │   ├── nl80211.py                    # pyroute2 wrapper
│   │   │   ├── drivers.py                    # driver detection
│   │   │   ├── modes.py                      # mode switching state machine
│   │   │   ├── watchdog.py                   # AdapterWatchdog 2 s poll + rfkill check (D44, D78)
│   │   │   ├── driver_recovery.py            # modprobe -r / modprobe reload (D45)
│   │   │   ├── mode_verify.py                # iw dev info check on lease acquire (D70)
│   │   │   ├── akm.py                        # RSN AKM suite parser (D62, D63)
│   │   │   ├── mac_spoof.py                  # Evil Twin MAC spoofing (D69)
│   │   │   ├── regulatory.py                 # iw reg get / DFS channel allowlist (D81)
│   │   │   └── rfkill.py                     # rfkill poll + operator-gated unblock (D78)
│   │   │
│   │   ├── db/
│   │   │   ├── models.py                     # SQLAlchemy models
│   │   │   ├── session.py                    # async session
│   │   │   ├── repo.py                       # repository pattern
│   │   │   └── migrations/
│   │   │       └── versions/
│   │   │
│   │   ├── portal/
│   │   │   ├── server.py                     # aiohttp captive portal
│   │   │   ├── mac.py                        # scan-mode MAC random via macchanger (D83)
│   │   │   ├── template_manager.py
│   │   │   ├── submission_lock.py            # per-client-IP lock (D67)
│   │   │   ├── dhcp_watchdog.py              # lease file monitor (D68)
│   │   │   ├── validators/
│   │   │   │   ├── aircrack.py               # offline credential validation + Semaphore(1) (D66, D84)
│   │   │   │   ├── tshark_precheck.py        # tshark fast EAPOL/PMKID pre-check (D76)
│   │   │   │   └── always_accept.py
│   │   │   ├── templates/
│   │   │   │   ├── router_update.html        # ported from ESP8266
│   │   │   │   ├── starbucks.html
│   │   │   │   ├── airport_wifi.html
│   │   │   │   ├── hotel_wifi.html
│   │   │   │   ├── corporate_sso.html
│   │   │   │   └── mobile_carrier.html
│   │   │   └── static/                       # portal CSS/images
│   │   │
│   │   ├── scope/
│   │   │   ├── guard.py                      # engine-level enforcement
│   │   │   ├── models.py
│   │   │   └── store.py
│   │   │
│   │   ├── plugins/
│   │   │   ├── loader.py                     # user plugin discovery
│   │   │   └── quarantine.py                 # disabled-by-default staging
│   │   │
│   │   └── utils/
│   │       ├── oui.py                        # vendor lookup
│   │       ├── channels.py                   # band/channel maps
│   │       └── frames.py                     # 802.11 helpers
│   │
│   └── tests/
│       ├── unit/
│       ├── integration/
│       │   └── hwsim/                        # mac80211_hwsim fixtures
│       └── e2e/                              # Playwright
│
├── frontend/
│   ├── package.json                          # pnpm
│   ├── pnpm-lock.yaml
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── public/
│   │   └── favicon.svg
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── routes/
│       │   ├── Dashboard.tsx
│       │   ├── Recon.tsx
│       │   ├── Targets.tsx
│       │   ├── Attacks.tsx
│       │   ├── EvilTwin.tsx
│       │   ├── Captures.tsx
│       │   ├── Credentials.tsx
│       │   ├── Crack.tsx                       # Phase 6, plan-review §2.13
│       │   ├── Modules.tsx
│       │   ├── Scope.tsx
│       │   └── Settings.tsx
│       ├── components/
│       │   ├── ui/                           # shadcn primitives
│       │   ├── AdapterCard.tsx               # 6-state adapter visualization (D29.3)
│       │   ├── RssiChart.tsx
│       │   ├── SignalBars.tsx                # 4-bar viz + dBm number (D98)
│       │   ├── EapolProgress.tsx             # M1-M4 with checkmarks + fill line (§29.3)
│       │   ├── EncryptionBadge.tsx           # WPA2 / WPA3 / WEP / Open (§29.3)
│       │   ├── PmfIndicator.tsx              # PMF badge + tooltip (D41)
│       │   ├── ClientMap.tsx
│       │   ├── LiveLog.tsx
│       │   ├── ScopeBadge.tsx
│       │   ├── AttackControlPanel.tsx
│       │   ├── PortalPreview.tsx
│       │   ├── Tooltip.tsx                   # 13-term tooltip coverage (D97)
│       │   ├── Toast.tsx                     # top-right stack, 4s auto-dismiss (§29.4)
│       │   ├── ConfirmModal.tsx              # Evil Twin launch only (D88)
│       │   ├── EmptyState.tsx                # 4 required empty states (§29.4)
│       │   ├── CommandPalette.tsx            # Ctrl+K, fuzzy search (D100)
│       │   ├── ModeSwitchSteps.tsx           # 4-step progress indicator (D92)
│       │   ├── ChannelDropdown.tsx           # DFS warning for 5 GHz (D94, D81)
│       │   ├── WelcomeOverlay.tsx            # first-launch only (D90)
│       │   └── shell/                        # 3-zone layout
│       │       ├── Topbar.tsx                # 48px glass effect
│       │       ├── Sidebar.tsx               # 64px default / 220px pinned (D87)
│       │       ├── ContentZone.tsx
│       │       └── ContextualPanel.tsx       # 380px slide-in from right (D89)
│       ├── stores/                           # zustand
│       │   ├── adapters.ts
│       │   ├── scan.ts
│       │   ├── scope.ts
│       │   └── ws.ts
│       ├── lib/
│       │   ├── api.ts                        # axios client
│       │   ├── ws.ts                         # WebSocket hook
│       │   ├── format.ts
│       │   ├── tooltips.ts                   # 13-term tooltip text (D97)
│       │   └── a11y.ts                       # axe-core helpers, focus management
│       ├── types/                            # generated from OpenAPI
│       │   └── api.d.ts
│       ├── hooks/
│       │   ├── useAdapters.ts
│       │   ├── useScan.ts
│       │   └── useLiveLog.ts
│       └── styles/
│           ├── globals.css                   # Tailwind base + reset
│           └── index.css                     # design tokens (D101) — see §29.1
│
├── packaging/
│   ├── systemd/
│   │   ├── wcarck.service                    # User=wcarck (D35, D103); LimitNOFILE=65536
│   │   ├── wcarck.socket
│   │   └── NetworkManager-conf/99-wcarck.conf # unmanaged-devices config (D101)
│   ├── sudoers/
│   │   └── wcarck                            # /etc/sudoers.d/wcarck NOPASSWD whitelist (D103)
│   ├── debian/                               # .deb build files
│   ├── install.sh                            # one-liner installer; sets REGDOMAIN=BO (D102)
│   ├── uninstall.sh
│   ├── udev/
│   │   └── 99-wcarck-adapters.rules
│   └── nginx/                                # optional reverse proxy template
│
├── scripts/
│   ├── dev.sh                                # run backend + frontend dev
│   ├── doctor.sh                             # diagnose missing deps; --postmortem mode (D74)
│   ├── adapter-setup.sh                      # install DKMS, set modes
│   ├── hwsim-lab.sh                          # spin up virtual radios
│   └── seed-scope.sh                         # populate default scope
│
└── docs/
    ├── README.md
    ├── ARCHITECTURE.md
    ├── SAFETY.md                             # minimal target-boundary notes
    ├── CONTRIBUTING.md
    ├── MODULES.md                            # plugin authoring guide
    ├── CAPTIVE_PORTALS.md                    # how templates work
    ├── DRIVER_NOTES.md                       # per-chipset gotchas
    └── images/
        ├── architecture.png
        └── screenshots/
```

---

## 9. Database Schema

SQLite with WAL mode, accessed via SQLAlchemy 2.0 async. The engine is
configured at process startup with the connect-time PRAGMAs and buffered-
writer settings listed in §9.1. The `config.toml` schema that drives
these defaults is in §9.2.

```sql
-- Session (replaces user context in MVP — single anonymous operator)
CREATE TABLE sessions (
    id          INTEGER PRIMARY KEY,
    started_at  TIMESTAMP NOT NULL,
    label       TEXT                -- optional human name for the session
);

-- Target sets (operator-selected active targets)
CREATE TABLE scopes (
    id                INTEGER PRIMARY KEY,
    name              TEXT NOT NULL,
    notes             TEXT,
    created_at        TIMESTAMP NOT NULL,
    expires_at        TIMESTAMP,
    allowed_bssids    JSON NOT NULL DEFAULT '[]',
    allowed_ssids     JSON NOT NULL DEFAULT '[]',
    active            BOOLEAN NOT NULL DEFAULT 0,
    UNIQUE(active) WHERE active = 1          -- only one active scope
);

-- Adapters
CREATE TABLE adapters (
    id              INTEGER PRIMARY KEY,
    mac             TEXT NOT NULL UNIQUE,
    iface_name      TEXT NOT NULL,           -- wlan_uplink, wlan_mon, wlan_ap
    chipset         TEXT,
    driver          TEXT,
    current_mode    TEXT,                    -- managed | monitor | ap | unknown
    role            TEXT,                    -- uplink | monitor | ap
    last_seen       TIMESTAMP
);

-- Resource leases (radios and compute devices)
CREATE TABLE resource_leases (
    id              INTEGER PRIMARY KEY,
    resource_type   TEXT NOT NULL,           -- adapter | gpu | cpu
    resource_id     TEXT NOT NULL,           -- adapter id, GPU id, CPU
    lease_type      TEXT NOT NULL,           -- monitor.scan | monitor.locked | ap.service | crack.compute
    job_id          INTEGER,                 -- nullable until job row exists
    owner_module    TEXT NOT NULL,
    acquired_at     TIMESTAMP NOT NULL,
    expires_at      TIMESTAMP,
    released_at     TIMESTAMP,
    status          TEXT NOT NULL            -- active | released | expired | orphaned
);

-- Discovered networks
CREATE TABLE networks (
    id              INTEGER PRIMARY KEY,
    bssid           TEXT NOT NULL,
    ssid            TEXT,
    channel         INTEGER,
    band            TEXT,                    -- 2.4 | 5 | 6
    encryption      TEXT,                    -- open | wep | wpa | wpa2 | wpa3 | wpa2/3
    first_seen      TIMESTAMP NOT NULL,
    last_seen       TIMESTAMP NOT NULL,
    max_rssi        INTEGER,
    vendor          TEXT,                    -- OUI lookup
    UNIQUE(bssid)
);

-- Discovered clients (STAs)
CREATE TABLE clients (
    id                  INTEGER PRIMARY KEY,
    mac                 TEXT NOT NULL UNIQUE,
    vendor              TEXT,
    associated_bssid    TEXT,                -- nullable; unassociated probers
    first_seen          TIMESTAMP NOT NULL,
    last_seen           TIMESTAMP NOT NULL,
    max_rssi            INTEGER,
    probed_ssids        JSON NOT NULL DEFAULT '[]'  -- PNL harvested
);

-- Attack sessions
-- Per plan-review §2.3: lifecycle columns dropped (status, started_at,
-- ended_at, error_msg) because they are redundant with job_queue. The
-- job_queue row is the authoritative lifecycle record. Attack-specific
-- columns (target_bssid, target_client, channel, packets_sent) stay here.
CREATE TABLE attack_sessions (
    id              INTEGER PRIMARY KEY,
    job_id          INTEGER NOT NULL REFERENCES job_queue(id),  -- 1:1 with a job
    type            TEXT NOT NULL,           -- deauth | beacon_spam | handshake_capture | pmkid
    target_bssid    TEXT,
    target_client   TEXT,                    -- nullable
    channel         INTEGER,
    packets_sent    INTEGER NOT NULL DEFAULT 0,
    scope_id        INTEGER NOT NULL REFERENCES scopes(id),
    adapter_id      INTEGER NOT NULL REFERENCES adapters(id),
    session_id      INTEGER NOT NULL REFERENCES sessions(id)
);

-- Unified job lifecycle
CREATE TABLE job_queue (
    id              INTEGER PRIMARY KEY,
    module_name     TEXT NOT NULL,
    handler_name    TEXT NOT NULL,
    params_json     JSON NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL,           -- queued | scope_checked | leased | starting | running | stopping | completed | failed | cancelled
    priority        INTEGER NOT NULL DEFAULT 100,
    created_at      TIMESTAMP NOT NULL,
    started_at      TIMESTAMP,
    ended_at        TIMESTAMP,
    error_msg       TEXT,
    scope_id        INTEGER REFERENCES scopes(id),
    session_id      INTEGER REFERENCES sessions(id)
);

-- Captures (handshake / PMKID / probes / beacons)
-- Per plan-review §2.2: sha256 column added (D30 says "artifact paths
-- + SHA-256 ship in MVP" but v0.1.5 had no column). The hash is computed
-- at capture completion and re-verified at export.
CREATE TABLE captures (
    id              INTEGER PRIMARY KEY,
    type            TEXT NOT NULL,           -- handshake | pmkid | probes | beacons
    path            TEXT NOT NULL,           -- /var/lib/wcarck/captures/...
    sha256          TEXT NOT NULL,           -- computed at write, verified at export
    bssid           TEXT,
    ssid            TEXT,
    created_at      TIMESTAMP NOT NULL,
    hashcat_format  TEXT,                    -- 22000 | hccapx | null
    size_bytes      INTEGER,
    exported        BOOLEAN NOT NULL DEFAULT 0,
    scope_id        INTEGER NOT NULL REFERENCES scopes(id)
);

-- Evil Twin / AP sessions
CREATE TABLE ap_sessions (
    id                      INTEGER PRIMARY KEY,
    ssid                    TEXT NOT NULL,
    bssid                   TEXT,
    channel                 INTEGER,
    portal_template         TEXT,            -- which captive portal
    clients_connected       INTEGER NOT NULL DEFAULT 0,
    credentials_captured    INTEGER NOT NULL DEFAULT 0,
    started_at              TIMESTAMP NOT NULL,
    ended_at                TIMESTAMP,
    status                  TEXT NOT NULL,
    scope_id                INTEGER NOT NULL REFERENCES scopes(id)
);

-- Captured credentials (Evil Twin payload — plain text in MVP)
-- Per plan-review §2.4: kdf_salt column reserved now so the post-MVP
-- encryption rollout doesn't require a migration. Algorithm is pinned
-- to AES-256-GCM for the data key, Argon2id(m=64MB, t=3, p=4) for
-- the KEK derivation from the operator's local passphrase.
-- In MVP these columns are nullable and the password is stored as
-- UTF-8 text.
CREATE TABLE credentials (
    id              INTEGER PRIMARY KEY,
    ap_session_id   INTEGER NOT NULL REFERENCES ap_sessions(id),
    network_ssid    TEXT NOT NULL,
    password        TEXT NOT NULL,           -- plain text in MVP; AES-256-GCM post-MVP
    kdf_salt        BLOB,                    -- reserved, nullable in MVP
    kdf_params      TEXT,                    -- "argon2id:m=65536,t=3,p=4", reserved
    client_mac      TEXT,
    user_agent      TEXT,
    client_ip       TEXT,
    captured_at     TIMESTAMP NOT NULL,
    validated       BOOLEAN NOT NULL DEFAULT 0,
    validated_at    TIMESTAMP
);

-- Session log (plain append-only log — no chained hashes in MVP)
CREATE TABLE session_log (
    id          INTEGER PRIMARY KEY,
    ts          TIMESTAMP NOT NULL,
    action      TEXT NOT NULL,               -- machine-readable verb
    target      TEXT,                        -- bssid or job id
    result      TEXT NOT NULL,               -- ok | error
    detail      JSON
);

-- Runtime module state
CREATE TABLE module_state (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    running         BOOLEAN NOT NULL DEFAULT 0,
    params_json     JSON NOT NULL DEFAULT '{}',
    health          TEXT NOT NULL DEFAULT 'unknown',
    last_error      TEXT,
    started_at      TIMESTAMP,
    stopped_at      TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL
);

-- Crack jobs (Phase 6 — opt-in password cracking wrapper)
CREATE TABLE crack_jobs (
    id                  INTEGER PRIMARY KEY,
    name                TEXT NOT NULL,
    source_capture_id   INTEGER REFERENCES captures(id),  -- handshake/PMKID .22000
    wordlist_path       TEXT NOT NULL,
    rules_path          TEXT,
    mask                TEXT,
    hash_mode           INTEGER NOT NULL DEFAULT 22000,
    attack_mode         INTEGER NOT NULL,
    backend             TEXT NOT NULL,        -- hashcat | john
    device              TEXT,
    status              TEXT NOT NULL,
    progress_percent    REAL NOT NULL DEFAULT 0,
    candidates_total    INTEGER,
    candidates_tested   INTEGER NOT NULL DEFAULT 0,
    speed_hashes_sec    INTEGER,
    eta_seconds         INTEGER,
    cracked_plaintext   TEXT,
    cracked_password_id INTEGER REFERENCES credentials(id),
    started_at          TIMESTAMP,
    ended_at            TIMESTAMP,
    exit_code           INTEGER,
    pid                 INTEGER,
    log_path            TEXT,
    potfile_path        TEXT,
    scope_id            INTEGER REFERENCES scopes(id),
    created_at          TIMESTAMP NOT NULL
);

CREATE INDEX idx_networks_bssid ON networks(bssid);
CREATE INDEX idx_clients_mac ON clients(mac);
CREATE INDEX idx_attack_sessions_job ON attack_sessions(job_id);
CREATE INDEX idx_attack_sessions_scope ON attack_sessions(scope_id);
CREATE INDEX idx_captures_sha256 ON captures(sha256);
CREATE INDEX idx_session_log_ts ON session_log(ts);
CREATE INDEX idx_resource_leases_active ON resource_leases(resource_type, resource_id, status);
CREATE INDEX idx_job_queue_status ON job_queue(status, priority);
CREATE INDEX idx_crack_jobs_status ON crack_jobs(status);
CREATE INDEX idx_crack_jobs_scope ON crack_jobs(scope_id);

### 9.1 Connect-time PRAGMAs and buffered writes

Per engineering-review §4.1 and §4.2, the SQLAlchemy engine is
configured at process startup with the following PRAGMAs on every
connection (via a `@event.listens_for(engine.sync_engine, "connect")`
hook in `core/db.py`):

```python
PRAGMAS = [
    "journal_mode = WAL",
    "synchronous = NORMAL",     # WAL-safe; full=NORMAL cuts fsync ~10x
    "foreign_keys = ON",        # SQLite has FKs OFF by default
    "busy_timeout = 5000",      # 5 s; prevents immediate SQLITE_BUSY
    "temp_store = MEMORY",
    "mmap_size = 268435456",    # 256 MB mmap
]
```

Plus the schema-version row in `schema_meta` (managed by Alembic).

**Buffered scan writes (engineering-review §4.2).** The `ScanModule`
emits O(network) updates per second; flushing each one to SQLite
serializes on the WAL and causes UI freezes at high channel density.
A per-tag debounce in `core/scan_buffer.py` accumulates
`scan.network` and `scan.client` events for **2 seconds**, then
flushes the merged rowset in a single transaction. The audit
(`session_log`) and job-lifecycle tables (`job_queue`, `job_events`)
are written synchronously; only the high-volume scan tables are
buffered. Manual scope changes flush immediately.

### 9.2 `config.toml` schema

The runtime configuration file at `/etc/wcarck/config.toml` (or
`~/.config/wcarck/config.toml` for a non-system install). It is
parsed by `core/config.py` at startup and exposed as a frozen
Pydantic model. All values shown are defaults.

```toml
# ── Control plane ─────────────────────────────────────────────
[control]
bind            = "127.0.0.1"
port            = 8080              # override env WCARCK_PORT if conflict (R9)
log_level       = "INFO"
# Login / TLS are deferred to post-MVP hardening (Section 12).

# ── Database ──────────────────────────────────────────────────
[database]
path            = "/var/lib/wcarck/wcarck.db"
wal             = true
synchronous     = "NORMAL"
busy_timeout_ms = 5000
mmap_bytes      = 268435456
scan_flush_ms   = 2000              # scan-rowset debounce window

# ── Adapters (udev names from Section 13) ─────────────────────
[adapters]
wlan_uplink     = "wlan_uplink"
wlan_mon        = "wlan_mon"
wlan_ap         = "wlan_ap"

# ── Radio leases ──────────────────────────────────────────────
[leases]
monitor_locked_ttl_s = 300
ap_service_ttl_s     = 3600
crack_compute_ttl_s  = 86400
# Runtime injection-test pre-flight (plan-review §2.10) — sends
# one scapy beacon frame at mode-switch and requires a non-zero
# TX-success before the monitor.locked lease is granted.

# ── Captive portal ────────────────────────────────────────────
[captive_portal]
template_dir        = "/usr/share/wcarck/templates"
user_override_dir   = "~/.local/share/wcarck/templates"
default_template    = "router_update"
validator           = "offline_aircrack"   # offline_aircrack | wished_network | always_accept
validator_timeout_s = 10
# Captive-portal detection bypass IPs (refreshed quarterly)
[captive_portal.captive_detection_bypass]
google_dot_com                  = "172.217.5.78"
clients3_google_com             = "172.217.11.174"
connectivitycheck_gstatic_com   = "172.217.5.78"
captive_apple_com               = "10.0.0.1"
www_apple_com                   = "10.0.0.1"
www_apple_com_edgekey_net       = "10.0.0.1"

# ── Deauth / attack defaults ──────────────────────────────────
[attack]
burst_count        = 64
burst_gap_ms       = 1                # rt2800usb throttle (Section 11)
deauth_reason      = 7                # class 3 frame from nonassociated STA
pmf_required_skip  = true             # D41: skip deauth on mgmt_frame_protection=1
handshake_poll_s   = 5                # deauth-loop handshake validator poll
crack_default_mode = 22000            # hashcat -m 22000 only (D26)

# ── Plugin trust ──────────────────────────────────────────────
[plugins]
directory        = "~/.local/share/wcarck/modules"
quarantine_on_install = true          # default-disabled; explicit enable required
require_api_version   = 6             # D42: __plugin_api_version__ gate
allow_builtin_karma   = false         # KARMA/MANA in third-party/plugin only

# ── Logging / audit ───────────────────────────────────────────
[logging]
session_log_path    = "/var/log/wcarck/session.log"
session_log_archive = "/var/log/wcarck/archive"
retention_days      = 30
wal_checkpoint_s    = 60              # R8: bounded WAL growth
```

The schema is the single source of truth for runtime knobs. It is
loaded once at startup; live changes require a `wcarck config reload`
(or the Settings page in Phase 5) which restarts affected modules
cleanly.
```

---

## 10. API Surface

### REST endpoints (FastAPI, OpenAPI 3.1 auto-generated)

> [~] **No authentication middleware in MVP.** The API is local-only (`127.0.0.1:8080`, plain HTTP). Auth endpoints and JWT middleware are added in the post-MVP hardening phase.

#### Adapters
```
GET    /api/adapters                                                    → [adapter]
PUT    /api/adapters/{id}/mode              {mode: monitor|managed|ap}
PUT    /api/adapters/{id}/channel           {channel}
```

#### Scope
```
GET    /api/scope                                                       → [scope]
POST   /api/scope                           {name, allowed_bssids, ...}
PUT    /api/scope/{id}/activate
GET    /api/scope/active                                                → {scope}
```

#### Recon / scan
```
POST   /api/scan/start                      {adapter, bands, dwell}
POST   /api/scan/stop
GET    /api/networks                                                    → [network]
GET    /api/clients                                                     → [client]
```

#### Attacks
```
POST   /api/attacks/deauth                  {bssid, client?, count?, channel?}
POST   /api/attacks/beacon-spam             {ssids[], channels[], wpa2}
POST   /api/attacks/probe-harvest           {adapter}
POST   /api/jobs/{id}/stop
```

#### Captures
```
POST   /api/captures/handshake/start        {bssid, channel, auto_deauth}
POST   /api/captures/pmkid/start            {bssid, channel}
GET    /api/captures                                                    → [capture]
GET    /api/captures/{id}/download
```

#### AP / Evil Twin
```
POST   /api/ap/start                        {ssid, bssid?, channel, portal_template}
POST   /api/ap/stop
GET    /api/ap/connected-clients                                        → [client]
```

#### Credentials
```
GET    /api/credentials                                                 → [credential]
POST   /api/credentials/{id}/validate                                   → {valid: bool}
```

#### Jobs, Events, and Session Log
```
GET    /api/jobs                                                       → [job]
GET    /api/events                         ?from=N                      → [event]
GET    /api/log                             ?from=N                     → [entry]
```

#### Modules
```
GET    /api/modules                                                     → [module]
POST   /api/modules/{name}/run              {params}
```

#### Cracking (Phase 6 — opt-in)
```
POST   /api/crack/jobs                     {name, capture_id, wordlist_path, ...}
GET    /api/crack/jobs                                                 → [job]
```

### WebSocket channels (`/ws`)
Single multiplexed connection. Server pushes events with `{channel, payload, ts}`.

```
job.queued, job.state, job.failed, adapter.status, scan.network,
scan.client, attack.deauth.tick, attack.deauth.ended, capture.handshake.got,
ap.client.connected, ap.credential.captured, log.line, crack.job.progress, ...
```

The WebSocket endpoint handler wraps its read loop in
`try / except WebSocketDisconnect` and treats a disconnect as a clean
session end (the audit log records the disconnect; no spurious 500).
The React client uses an exponential-backoff reconnect (`1s, 2s, 4s,
8s, 16s, 30s, 30s, ...`) keyed on the latest received event index so
the `replay_from(idx)` re-syncs the missed window.

---

## 11. Feature Roadmap

20+ hrs/week intensive pace. Each phase is ~1 week.

### Phase 1 — Foundations (Week 1)
**Goal**: Working scaffold plus the module/job/event spine; user opens browser
(no login) and sees all three adapters live.

Deliverables:
- [ ] Repo init, monorepo layout (backend + frontend + packaging + docs)
- [ ] `uv` + `pnpm` set up; ruff, mypy, eslint, prettier configured
- [ ] FastAPI skeleton — plain HTTP on `127.0.0.1:8080`
- [ ] React skeleton with shadcn baseline
- [ ] `core/module.py`, `core/registry.py`, `core/event_bus.py`, `core/process.py`, `core/external_tool.py`
- [ ] `core/result.py` (Ok/Err), `core/circuit_breaker.py`, `core/retry.py` (D43, D55, D56)
- [ ] `orchestration/jobs.py` (with `TaskGroup` per D53), `orchestration/leases.py`, AsyncExitStack
- [ ] systemd service unit, install.sh draft, udev rules
- [ ] DKMS install script for `8821au` (morrownr fork); `dkms status` post-build check (D48)
- [ ] Adapter discovery (pyroute2) + role detection
- [ ] `core/db.py` — `open_database_safely`, `verify_schema`, connect-time PRAGMAs (§9.1, D57, D60)
- [ ] `radio/watchdog.py` (D44), `radio/driver_recovery.py` (D45), `radio/mode_verify.py` (D70)
- [ ] `radio/rfkill.py` — rfkill poll inside AdapterWatchdog; operator-gated `rfkill unblock wifi` via `auto_unblock_rfkill: true` in `config.toml` (D78)
- [ ] `radio/regulatory.py` — `iw reg get` parser; DFS channel allowlist + country-code check at lease acquisition (D81)
- [ ] `radio/watchdog.py` (D44) extended to per-phy leases — one RTL8821AU phy can host `wlan_ap` (5 GHz) + `wlan_mon` (2.4 GHz) via `iw phy phyX interface add` (D77)
- [ ] WebSocket plumbing (server + React hook); `try/except WebSocketDisconnect` (D43 + §10)
- [ ] Dashboard page showing 3 adapter cards, live state via WS
- [ ] Mode switch buttons (monitor / managed / ap); `retry_with_backoff` wrapper on all
- [ ] DB migrations baseline; Alembic `transaction_per_migration=True` (D60)
- [ ] `doctor.sh` baseline + `--postmortem` mode (D74); adds `iw reg get` country-code warn (D81)
- [ ] `psutil` dependency for `_kill_process_tree` (D49)
- [ ] `macchanger` apt dep + `install.sh` step 0 `systemctl disable --now && systemctl mask NetworkManager wpa_supplicant avahi-daemon` (D79, D83)
- [ ] 4-EAPOL validator with online 30 s whole / 5 s interframe timeouts (D75); offline pcap scan uses no timeout, counts messages, M2+M3 minimum crackable
- [ ] `portal/validators/tshark_precheck.py` — `tshark -r <cap> -Y 'eapol || wlan.fc.type_subtype==0x8' | wc -l` + PMKID presence check; returns `{pmkid: bool, eapol_count: int, has_m2_m3: bool}` for UI badge (D76)
- [ ] `portal/validators/aircrack.py` validator timeout configurable, default 30 s (was 10 s) (D84)
- [ ] `frontend/src/styles/index.css` — all design tokens (D101); `tailwind.config.ts` binds via `theme.extend`; shadcn/ui with custom Ubuntu-orange + Inter font theme (D29.1)
- [ ] 3-zone layout shell — `shell/Topbar.tsx` (48px glass), `shell/Sidebar.tsx` (64/220px pinned, D87), `shell/ContentZone.tsx`, `shell/ContextualPanel.tsx` (380px slide-in, D89)
- [ ] Reusable primitives — `Tooltip.tsx` (D97), `Toast.tsx`, `ConfirmModal.tsx` (Evil Twin only, D88), `EmptyState.tsx`, `CommandPalette.tsx` (Ctrl+K, D100), `ModeSwitchSteps.tsx` (D92), `ChannelDropdown.tsx` (DFS warning, D94/D81), `WelcomeOverlay.tsx` (D90)
- [ ] `AdapterCard.tsx` — 6 states (online / monitor / AP / transitioning / error / locked); mode-switch step indicator integration (D92)
- [ ] `SignalBars.tsx` — 4-bar viz + dBm number (D98); `EapolProgress.tsx` M1-M4 with checkmarks + connecting fill line
- [ ] Dashboard page with 4 mocked metric cards (Networks/Clients/Handshakes/Creds) with count-up animation; guided action bar gated on D90
- [ ] `lib/tooltips.ts` — 13-term tooltip text (BSSID, SSID, Channel, WPA2-PSK, WPA3-SAE, PMF, EAPOL, PMKID, Deauth, Monitor mode, Evil Twin, Handshake, dBm) (D97)
- [ ] `lib/a11y.ts` — axe-core helpers, focus management, WCAG AA contrast checks (D99)
- [ ] Playwright + axe-core e2e scaffolding; visual-regression snapshots for Dashboard / Recon / Attacks / Evil Twin pages
- [ ] `packaging/systemd/wcarck.service` — `User=wcarck`/`Group=wcarck` (D103), `LimitNOFILE=65536` (D35), `LimitNPROC=8192`
- [ ] `packaging/sudoers/wcarck` — NOPASSWD whitelist for `iw`, `ip`, `macchanger`, `hostapd`, `dnsmasq`, `aircrack-ng`, `hcxdumptool`, `airodump-ng`, `aireplay-ng`, `iptables`, `nft`, `rfkill`, `setcap`, `dkms`, `modprobe` (D103)
- [ ] `packaging/systemd/NetworkManager-conf/99-wcarck.conf` — `[keyfile] unmanaged-devices=mac:<wlan_mon>;mac:<wlan_ap>`, leaves `wlan_uplink` managed (D101)
- [ ] `install.sh` step 0 — `iw reg set BO` (fallback `BZ`) + `txpower fixed 3000`; warning logged (D102)
- [ ] `core/system/sleep.py` — DBus `org.freedesktop.login1` `PrepareForSleep` listener; hard-stops jobs + force-managed all on sleep; runs `AdapterWatchdog` on wake (D104)
- [ ] `core/system/process_group.py` — `ManagedProcess.spawn()` uses `start_new_session=True`; `os.killpg()` on stop (D49, D113)
- [ ] `core/executor.py` — `ProcessPoolExecutor` for airodump CSV parse, hashcat output, PMKID computation, large JSON serialization (D112)
- [ ] `core/db_checkpoint.py` — background task `PRAGMA wal_checkpoint(PASSIVE)` every 5 min; `autocommit` reads (D57, D111)
- [ ] `core/captures.py` — tmpfs staging (`/tmp/wcarck_captures/`) for raw `.pcapng` writes; move to persistent on completion/save (D106)
- [ ] `radio/usb_path.py` — track adapters by `/sys/class/net/<iface>/device` (USB bus path), MAC secondary (D114)
- [ ] `radio/regulatory.py` (extended) — `iw reg set BO` + `txpower fixed 3000` on startup (D102)
- [ ] `portal/subnet_detect.py` — Evil Twin inspects uplink subnet; auto-shifts DHCP pool on collision (D107)
- [ ] `portal/do_h_block.py` — nftables rules dropping port 853 + DoH IPs on `wlan_ap` (D105, D110)
- [ ] `portal/hsts_443_reject.py` — nftables REJECT TCP 443 to uplink from `wlan_ap` clients (D108)
- [ ] `deauth/thermal.py` — pulsed burst (64 frames → 0.1 s sleep) (D119)
- [ ] `deauth/wpa3_filter.py` — read AKM from assoc-req; exclude WPA3-SAE clients from target list (D41, D116)
- [ ] `ws/state_replay.py` — `State Sync` request on WS connect; replays last 100 events + active jobs (D75, D109)
- [ ] `vm_usb_hint.py` — count adapter-reset-within-2s events; emit `adapter.flaky_usb` if > 3 (D125)
- [ ] `frontend/src/hooks/useAudioAlerts.ts` — Web Audio API, distinct beeps for handshake vs credential; "Enable Audio" once per session (D121)
- [ ] `frontend/src/styles/light-mode.css` — high-contrast light theme (white bg, black text, deep blue accent, WCAG AAA) (D122)
- [ ] `frontend/src/components/BulkActionBar.tsx` — multi-select + floating action bar (D127)
- [ ] `frontend/src/components/BottomTabBar.tsx` + `BottomSheet.tsx` — mobile responsive (D130)
- [ ] `frontend/src/components/FocusMode.tsx` — Topbar toggle; suppress INFO/WARN toasts (D129)
- [ ] `frontend/src/components/AssetsTab.tsx` — drag-drop wordlist `.txt` and portal template `.zip` (D123)
- [ ] `frontend/src/store/uiState.ts` — Zustand `persist` middleware for sort/filter/scroll/selected (D128)
- [ ] `frontend/src/lib/usbPower.ts` — detect same-USB-controller adapters; show brownout warning (D76, D126)

End-of-week demo: open browser (no login) → see Wcarck dashboard
with three adapter cards showing real-time mode, channel, RX packets.
Click "Set Monitor" → watch card transition with progress bar. Start a
dummy module job → see job state, resource lease, event replay, and
session-log entry end-to-end.

### Phase 2 — Recon (Week 2)
**Goal**: Live picture of all nearby networks and clients.

Deliverables:
- [ ] ScanEngine wrapping `airodump-ng` (CSV stream parser)
- [ ] Channel hopper (band-aware, dwell-tuned)
- [ ] Networks table with live updates, RSSI sparklines
- [ ] Clients table with associated BSSID, vendor, signal
- [ ] Probe-request harvesting (passive PNL collection)
- [ ] OUI vendor lookup database (IEEE registry import)
- [ ] Scope page with allowed-BSSID picker
- [ ] Live target re-ranking

End-of-week demo: hit "Scan" → networks and clients fill in live; click
"Select target" on NASA → it becomes the active target.

### Phase 3 — Attacks (Week 3)
**Goal**: Full active-recon pipeline; hashcat-ready captures.

Deliverables:
- [ ] Deauth engine — burst pattern (64 frames, sequence 0-63, both directions, reason 7)
  - [ ] Driver throttle: `rt2800usb` requires 1 ms `await asyncio.sleep(0)` between frames (~64 ms total per burst); a tight loop silently drops frames on the bulk endpoint
  - [ ] `RadioTap()` header is **mandatory** on every injected frame; raw `Dot11` causes `scapy` to fail silently on the kernel side
  - [ ] RTL8821AU channel change sequence is `ip link set <iface> down` → `iw dev <iface> set channel N` → `ip link set <iface> up` in monitor mode; a single `iw` call against an `up` interface silently no-ops on the morrownr fork (engineering-review §3.2)
  - [ ] Stateful mode: IDLE → ARMED → DEAUTHING → HANDSHAKE_CAPTURED → STOPPING → IDLE; transitions are published on the event bus
- [ ] DoS pursuit mode — monitors channel hopper for AP channel changes
- [ ] Handshake auto-stop — deauth loop polls the cap file every 5s; validator check
- [ ] 4-EAPOL handshake validator — adopts wifite2 state machine: tshark + scapy
  - [ ] Per `(BSSID, client)` pair, not per-BSSID — a single BSSID can have multiple client handshakes in flight
  - [ ] PMKID-only `.22000` files are accepted: file has a `WPA*01` line per BSSID (no EAPOL messages); the validator must not reject these just because no M1-M4 frames are present
  - [ ] The 4-frame EAPOL set is `WPA*02`; PMKID set is `WPA*01`; the validator must branch on the line prefix
- [ ] Beacon spam engine (ported SSID list)
- [ ] Handshake capture (hcxdumptool + auto-trigger deauth)
  - [ ] `hcxdumptool` requires **SIGTERM** (not SIGINT) for a clean pcapng flush; SIGINT truncates the file
  - [ ] `ManagedProcess` stop sequence is overridden per-tool where needed
- [ ] PMKID clientless attack
  - [ ] PMK candidate is derived from the AP's RSN info-element PMKID field, not the deprecated `MK3` workaround
- [ ] Capture export to `22000` format ONLY
- [ ] Captures page (list, download, delete)
- [ ] Attack control panel UI (stop/start, packets/sec counter)
- [ ] Channel auto-pinning during attacks
- [ ] Resource-busy UX: conflicting actions show active job

#### Phase 3 — `ManagedProcess` correctness (engineering-review blockers)

- [ ] **Concurrent stdout/stderr drain** — every long-lived child runs two
      `asyncio.create_task` drainers (one for `stdout`, one for `stderr`).
      A single `DEVNULL` redirect deadlocks the pipe buffer at ~64 KB on
      tools that produce steady stderr (hostapd, dnsmasq, airodump).
- [ ] **scapy uses `AsyncSniffer`** — never the blocking `scapy.sniff()`.
      The blocking variant parks the event loop and the WebSocket stops
      pushing events.
- [ ] **Subprocess teardown** — `await proc.wait()` is called on the
      `asyncio.subprocess.PIPE` handles, not on `DEVNULL`, so SIGINT
      actually reaches the child.
- [ ] **hostapd readiness poll** — wait for `AP-ENABLED` to appear in the
      hostapd log, not a fixed `sleep N`. A `sleep 3` after `hostapd`
      start races the WPA2 4-way handshake and a `sleep 2` is sometimes
      not enough.
- [ ] **dnsmasq readiness poll** — wait for the AP interface to have an
      IPv4 address (poll `ip -4 addr show dev wlan_ap`) before
      `dnsmasq` binds. Otherwise dnsmasq logs `failed to bind listening
      socket: Cannot assign requested address`.
- [ ] **scapy injection** — `scapy.sendp` is wrapped in
      `asyncio.to_thread(..., loop=self._loop)` because the underlying
      raw-socket write is blocking.

End-of-week demo: select NASA → click "Capture Handshake" → engine deauths a
client → handshake captured → download .22000 file.

### Phase 4 — Evil Twin (Week 4) — MVP COMPLETE
**Goal**: End-to-end credential harvest via captive portal.

Deliverables:
- [ ] AP engine (hostapd + dnsmasq orchestration)
  - [ ] `nft -c -f` dry-run check before every apply; abort on parse error
  - [ ] Per-session table `inet wcarck_et_<session_id>`; teardown is
        `nft delete table inet wcarck_et_<session_id>` (NOT
        `nft flush ruleset` — that would clobber unrelated rules)
  - [ ] 802.11w / PMF deauth silently fails on PMF-required APs (e.g., the
        user's Airtel `NASA` on modern firmware); the deauth engine must
        detect `mgmt_frame_protection=1` in the original AP's beacon and
        fall back to client-side L2 / association-attack only
- [ ] Captive portal HTTP server (aiohttp)
  - [ ] Must serve on `0.0.0.0:80` inside the `wlan_ap` subnet; the
        `dnsmasq` DHCP/DNS listener and the `aiohttp` server are
        decoupled but co-hosted
  - [ ] Captive-portal probe endpoints (operator must verify all four
        on every connected phone):
        - `GET /generate_204` → `204 No Content` (Android CNA probe)
        - `GET /hotspot-detect.html` → `<HTML><HEAD>...</HEAD><BODY>Success</BODY></HTML>` (Apple iOS)
        - `GET /connecttest.txt` → `Microsoft NCSI` style OK page (Windows)
        - `GET /redirect` (for `clients3.google.com/generate_204`) →
          `302` to the portal entry; do **not** return `200` — Android
          flags a 200 as "not captive" and silently roams
  - [ ] Static asset path is `/static/<template_name>/<file>` (Jinja2 with
        `autoescape=True`)
  - [ ] POST `/submit` returns `200` on validated, `401` on rejected;
        always writes a `session_log` row regardless of result
- [ ] 6 captive portal templates: router_update, coffee_shop, airport, hotel, sso, carrier
  - [ ] 7th stretch template: `dialog_os` (OS-chrome lookalike modal)
- [ ] **Offline credential validation** — portal POST handler spawns `aircrack-ng -a 2 -b <bssid> -w <(echo "<password>") <handshake.cap>` async; returns 200/401
  - [ ] The `aircrack-ng` invocation is wrapped in `ManagedProcess` with
        a hard 10 s timeout; on timeout, the submission is treated as
        "rejected" (returns 401) and the timeout is logged
  - [ ] Validator runs in `asyncio.to_thread` so the event loop is not
        blocked during the aircrack round-trip
- [ ] Mode-switch state machine for wlan_ap (monitor ↔ AP)
- [ ] Credentials page (plain text in MVP)
- [ ] Evil Twin control page (SSID picker, portal picker, channel)
- [ ] **DNS hijack** (dnsmasq) — wildcard sinkhole + captive-portal bypass exceptions
  - [ ] Captive-bypass entries (configurable in `config.toml` under
        `[captive_portal.captive_detection_bypass]`):
        - `address=/google.com/172.217.5.78`
        - `address=/clients3.google.com/172.217.11.174`
        - `address=/connectivitycheck.gstatic.com/172.217.5.78`
        - `address=/captive.apple.com/<portal_ip>` (resolves to portal
          so the iOS CNA loop completes)
        - `address=/www.apple.com/<portal_ip>`
        - `address=/www.apple.com.edgekey.net/<portal_ip>`
  - [ ] Catch-all `address=/#/10.0.0.1` last
- [ ] **Per-session nftables chain** — `nft add table inet wcarck_et_<session_id>`

End-of-week demo: start Evil Twin against NASA → connect test phone → see
captive portal → enter password → Wcarck validates against real NASA → marks
credential as `validated: true` → artifacts and logs are downloadable.

### Phase 5 — Modules & Polish (Weeks 5–6)
**Goal**: Extensibility, reporting, and polish.

Deliverables:
- [ ] Plugin loader (`~/.local/share/wcarck/modules/*.py`)
- [ ] Modules page (list, enable, configure)
- [ ] Dark mode toggle
- [ ] RSSI heatmap (2D over time)
- [ ] Session replay (rewind WS event log)
- [ ] Settings page
- [ ] `wcarck` CLI for headless ops

### Phase 6 — Stretch (Week 7+)
- [ ] **CrackEngine** (opt-in) — wraps `hashcat` / `john` subprocess; live progress; respects scope-guard.

---

## 12. MVP Engineering Model

The MVP is a **local operator tool** — one person, one machine, no network
exposure beyond what the RF attacks themselves require. Authentication,
encryption, and hardened audit machinery are deferred to post-MVP hardening.

### MVP engineering-only features
- **Local-only**: Plain HTTP on `127.0.0.1:8080`; no login; no TLS certificate ceremony.
- **Plain storage**: Credentials stored as plain text in SQLite; no encryption at rest.
- **Basic audit**: Plain append-only `session_log` table; no chained-hash audit trail.
- **Process control**: Managed children (hostapd, airodump, etc.) managed via `ManagedProcess` (SIGINT cascade) and `RadioLeaseManager` for radio safety.
- **Engine enforcement**: Target boundary (scope-guard) and radio lease manager ensure jobs behave.

### MVP safety boundaries
- Control plane listens on `127.0.0.1:8080` only — no external bind.
- No DNS daemon is started on the uplink interface. `hostapd` + `dnsmasq` bind
  only to `wlan_ap` (`10.0.0.1/24`). The operator's home network is never
  reachable from the captive-portal subnet, and vice versa.
- First-run wizard (UI step 1) requires creating an **active scope** before
  any attack or capture module is invokable. `403 NoActiveScope` is returned
  to any module-handler dispatch that arrives without a `scope_id`.
- Plugin modules load from `~/.local/share/wcarck/modules/*.py` only; they
  are **disabled** by default and require explicit `wcarck plugin enable <name>`
  (or the equivalent Modules page toggle) before any handler is callable.
- The audit log (`session_log`) is the only authoritative record of operator
  actions in V1. Chained-hash verification, retention policy, and
  redaction tooling are post-MVP.

### Deferred to post-MVP hardening
- TLS / self-signed certificate ceremony for the control plane.
- Login / RBAC / per-operator audit split.
- Encryption at rest for `credentials` and `crack_jobs.cracked_plaintext`.
- Chained-hash audit trail and external verification tool.
- Retention policy and redaction tooling.
- Signed plugin marketplace (GPG registry, `wcarck plugin verify`).
- PDF/JSON report generator and evidence registry (already in v0.1.3, re-deferred in v0.1.4).

---

## 13. udev Rules — Predictable Interface Naming

File: `/etc/udev/rules.d/99-wcarck-adapters.rules`

```
# Wcarck stable interface names by MAC address
# Generated for machine: Code-X

# Built-in MediaTek MT7902 → internet uplink only
SUBSYSTEM=="net", ACTION=="add", ATTR{address}=="28:d0:43:0a:73:8c", \
  NAME="wlan_uplink"

# Ralink RT-series USB → monitor + injection (2.4 GHz)
SUBSYSTEM=="net", ACTION=="add", ATTR{address}=="00:1e:a6:c6:57:44", \
  NAME="wlan_mon"

# TP-Link Archer T2U Plus (RTL8821AU) → AP + 5 GHz monitor
SUBSYSTEM=="net", ACTION=="add", ATTR{address}=="5c:62:8b:76:5d:e2", \
  NAME="wlan_ap"
```

---

## 14. systemd Service Design

File: `/etc/systemd/system/wcarck.service`

```ini
[Unit]
Description=Wcarck WiFi Audit Platform
After=network-online.target

[Service]
Type=notify
ExecStart=/usr/local/bin/wcarck serve
WorkingDirectory=/var/lib/wcarck
User=wcarck
Group=wcarck
AmbientCapabilities=CAP_NET_RAW CAP_NET_ADMIN
Restart=on-failure
RestartSec=5s
LimitNOFILE=65536
# CAP_SYS_ADMIN is intentionally OMITTED from the production service.
# It is only needed for mac80211_hwsim (CI) — see
# /etc/systemd/system/wcarck-ci.service.d/override.conf for the CI override.
```

---

## 15. Installation Flow

User experience from a fresh Ubuntu 22.04/24.04 install:

```bash
curl -sSL https://wcarck.local/install.sh | sudo bash
```

`install.sh` performs the following in order (each step is idempotent):

1. **APT packages** — `hostapd`, `dnsmasq`, `aircrack-ng`, `hcxdumptool`,
   `hcxhashtool`, `tshark`, `iw`, `iproute2`, `python3.12-venv`, `pipx`,
   `sqlite3`, `tshark` (no-root capture group added to operator).
2. **Disable `systemd-resolved` DNS stub on the AP interface** — on
   Ubuntu 24.04 the stub listener on `127.0.0.53` blocks `dnsmasq` from
   binding port 53. `install.sh` writes
   `/etc/systemd/resolved.conf.d/wcarck.conf` with
   `DNSStubListener=no` and a per-link drop-in for `wlan_ap` that sets
   `DNS=` and `Domains=` to empty, then restarts `systemd-resolved`.
3. **`wcarck` system user** — created with `runtimerw` on
   `/var/lib/wcarck` and `/var/log/wcarck`; no shell; no home.
4. **udev rules** — `/etc/udev/rules.d/99-wcarck-adapters.rules` with the
   MAC-pinned names from Section 13.
5. **systemd unit** — `/etc/systemd/system/wcarck.service` from
   Section 14 (no `CAP_SYS_ADMIN`).
6. **Driver DKMS** — `morrownr/8821au` pinned to a specific commit SHA
   (see Q1 in Section 20); `rtw88_8821au` blacklisted.
7. **Database** — `mkdir -p /var/lib/wcarck` and run `wcarck init-db`
   which applies all Alembic migrations.
8. **Permissions sanity** — `setcap cap_net_raw,cap_net_admin=+ep` on
   `/usr/local/bin/wcarck` (NOT on a copy — setcap is sticky; see
   R12 in Section 19 and D35 in Section 21).
9. **Service start** — `systemctl daemon-reload && systemctl enable --now wcarck.service`.
10. **First-run wizard reachable** — operator opens `http://127.0.0.1:8080/`
    and is prompted to create the first scope (no other UI is reachable
    until a scope is active).

### CI override for `mac80211_hwsim`
A drop-in at `/etc/systemd/system/wcarck-ci.service.d/override.conf` adds
`CAP_SYS_ADMIN` for the CI environment only. This file is **never**
installed by `install.sh`; it is checked in to `ops/ci/` and applied
only on CI runners.

---

## 16. Driver Setup Matrix

| Chipset | Linux driver | Setup |
|---|---|---|
| MediaTek MT7902 | `mt7921e` | Mainline (Zero setup) |
| Ralink RT-series | `rt2800usb` | Mainline (Zero setup) |
| Realtek RTL8821AU | `88XXau` | DKMS install (`morrownr` fork) |

---

## 17. Captive Portal Templates

Templates use a drop-in directory layout with `config.ini` and `html/` resources.
Templates are Jinja2-templated, served locally by `aiohttp`. The bundle layout
per template is:

```
backend/wcarck/portal/templates/<name>/
    config.ini     # [info] name, description
                   # [context] default key=value pairs
    html/index.html
    html/loading.html   (optional)
    html/verify.html    (optional)
    static/             (css/js/images, served at /static/<name>/<file>)
```

The aiohttp portal server must serve the four captive-portal-detection
paths in addition to the template entry, or the device will never display
the portal (the OS assumes the network has working internet and roams).
See Section 11 Phase 4 for the exact paths, HTTP status codes, and
response bodies. The `dialog_os` template is the 7th stretch item.

---

## 18. Testing Strategy

- **Layer 0**: Architecture contract tests for modules, job queue, and lease manager.
- **Layer 1**: Unit tests for parsers, frame builders, and state machines.
- **Layer 2**: Integration tests using `mac80211_hwsim` virtual radios.
  - Runner: `pytest-mac80211_hwsim` (or the project's own `ops/hwsim`
    fixture script for hosts without the pytest plugin). The fixture
    brings up N virtual radios with predictable SSIDs and known
    handshakes for the 4-EAPOL validator to consume.
  - Each Phase's "end-of-week demo" (Section 11) is reproducible
    against the hwsim fixture without emitting any real RF.
- **Layer 3**: Playwright E2E tests for the React UI.
  - **axe-core** runs on every page-load in the e2e suite; WCAG AA violations fail the build (D99)
  - **Visual regression snapshots** for Dashboard, Recon, Attacks, Evil Twin pages; pixel-diff threshold 0.1 % (catches unintended design drift)
  - **Keyboard navigation tests** — Tab order, Esc closes panel/modal, Ctrl+K opens command palette, ↑/↓ navigates table rows (D100, §29.7)
  - **WebSocket event latency test** — assert < 50 ms from event publish to Zustand update (D97, §29.6)
  - **Performance budget tests** — FCP < 800 ms, TTI < 1.5 s, table re-render < 16 ms (50 rows, virtualized) (§29.6)
  - **Sidebar pin state persistence** — assert localStorage `sidebar_pinned` round-trips across reloads (D87)
  - **Network detail panel persistence** — clicking same row updates panel, never closes; only ×/Esc closes (D89)
  - **Deauth no-modal test** — click "Deauth All" in network detail panel, assert job starts in < 200 ms, no modal shown (D88)
  - **Guided action bar visibility** — first launch shows bar; after first scan, never shows again; after 24 h idle, shows once (D90)
  - **Signal strength display** — assert BOTH bars and dBm number visible (D98)
  - **Mode switch step indicator** — 4 steps (iface down, mode set, iface up, injection verify) progress visibly (D92)
  - **Copy Debug Report button** — assert label is "Copy Debug Report" (not "Export AI Bundle") and downloads a structured bundle (D93)
  - **DFS channel dropdown** — channels 52-144 visually separated with ⚠ marker; selecting shows inline "60-second radar scan" warning (D94)
  - **Toast queue** — assert max 3 toasts visible; excess queue; error toasts persist (no auto-dismiss)
  - **Tooltip coverage** — assert all 13 required terms have tooltips (D97)

---

## 19. Risk Register

| # | Risk | Mitigation |
|---|---|---|
| R1 | RTL8821AU/Mainline conflict | Blacklist `rtw88_8821au` |
| R2 | Kernel upgrade breaks DKMS | Pin to LTS kernel; `doctor.sh` check |
| R3 | Resource leaks (FDs, sockets) | `LimitNOFILE` and robust teardown stack |
| R4 | Wrong target selected | Engine-level scope boundary |
| R5 | Orphaned processes | `ManagedProcess` SIGINT cascade |
| R6 | Unattended AP broadcast (RF leak) | UI requires explicit "Start Evil Twin" click; the SSID list picker defaults to last-used; no timer-based auto-start |
| R7 | `hostapd` / `dnsmasq` accidentally bound to uplink interface | `nft -c -f` dry-run check; `ss -tlnp` post-start audit fails the job if any port is bound on `wlan_uplink` |
| R8 | Unbounded SQLite WAL growth | `wal_checkpoint(TRUNCATE)` every 60 s; `session_log` archived to `/var/log/wcarck/archive/` after 30 days, then dropped |
| R9 | Port 8080 collision with another localhost service | `install.sh` checks `ss -tln 'sport = :8080'` and aborts with a clear message; documented override envvar `WCARCK_PORT=9090` |
| R10 | Device fingerprinting leaks target identity | Per-session random MAC for the AP (rotated on Evil Twin start); portal log redaction strips the per-request device `User-Agent` token after 24 h |
| R11 | Handshake `.22000` file marked invalid because validator only checked EAPOL frames | Validator now branches on the `WPA*01` (PMKID) vs `WPA*02` (EAPOL) line prefix |
| R12 | `setcap` capability lost when the binary is upgraded | `setcap` is sticky to the inode; `install.sh` re-applies it after every `pip`/`pipx` upgrade. Never `cp` the binary, always `pip install --force-reinstall` |
| R13 | `systemd-resolved` stub on Ubuntu 24.04 silently blocks `dnsmasq` from binding port 53 | `install.sh` step 2 writes `DNSStubListener=no` and a per-link drop-in for `wlan_ap` |
| R14 | `hostapd` deauth fails silently on PMF-required APs (802.11w) | Deauth engine inspects original-AP beacons for `RSN mgmt_frame_protection=1` and falls back to client-side L2 / association-attack only |
| R15 | scapy blocking calls (`sniff`, `sendp`) freeze the FastAPI event loop | `AsyncSniffer` for all captures; `asyncio.to_thread` for all injections; documented in Section 11 Phase 3 |
| R16 | Adapter USB unplug mid-session | `AdapterWatchdog` 2 s poll cancels jobs, marks GONE (D44) |
| R17 | Kernel driver oops during injection | `modprobe -r && modprobe` recovery, once per (iface, 60 s) (D45) |
| R18 | USB bus reset (both adapters gone) | Per-adapter `asyncio.Lock` on recovery (D46) |
| R19 | MAC randomization on adapter reconnect | `options 88XXau rtw_drv_log_level=0` in `/etc/modprobe.d/88XXau.conf`; doctor.sh check on startup (D47) |
| R20 | DKMS silent build fail | `install.sh` runs `dkms status` post-build, aborts with actionable error (D48) |
| R21 | Grandchild processes after stop (aireplay wrapper) | `_kill_process_tree` via psutil replaces `proc.kill()` in `ManagedProcess` (D49) |
| R22 | airodump-ng CSV format change (1.6 → 1.7) | Header signature validation; refuse + `tool.version_mismatch` event (D50) |
| R23 | hashcat GPU segfault on bad driver | Exit-code map; auto-retry with CPU backend (D51) |
| R24 | Empty RF (airodump produces no CSV for 30 s) | CSV liveness watchdog → `scan.stale` event (D52) |
| R25 | SQLite WAL leftover from crash | `open_database_safely` runs `wal_checkpoint(TRUNCATE)` if WAL > 100 MB (D57) |
| R26 | Disk full mid-transaction | `shutil.disk_usage` pre-flush; skip non-critical, emit `system.disk_full` (D58) |
| R27 | SQLite CORRUPT after unclean shutdown | Backup + recreate on next startup; CRITICAL log entry (D59) |
| R28 | AP changes band mid-deauth (2.4 → 5 GHz) | Pursuit-mode band detection; switch adapter or stop pursuit (D61) |
| R29 | WPA3-SAE target (no crackable handshake) | AKM-suite detection at scan time; UI badge; disable EAPOL capture path (D62) |
| R30 | 802.11r FT-PSK target (non-standard EAPOL) | AKM-suite detection; switch to PMKID-only capture strategy (D63) |
| R31 | Client randomized MAC (iOS 14+, Android 10+) | Locally-administered-bit check; use `ap_session_id + client_ip` for Evil Twin identity (D64) |
| R32 | AP goes offline mid-capture | `scan.network.lost` subscription; pause deauth, keep capture running (D65) |
| R33 | Concurrent portal submissions (CPU contention on aircrack) | `asyncio.Semaphore(1)` per `.cap`; temp file (not process substitution) (D66) |
| R34 | Double-submit on portal form (network lag) | Per-client-IP `asyncio.Lock`; early-exit on already-validated row (D67) |
| R35 | DHCP pool exhaustion from randomized-MAC clients | 2-minute lease time; `dhcp_watchdog` at 80 % pool (D68) |
| R36 | Real AP competes with Evil Twin (clients prefer real by BSSID) | MAC spoofing (one octet off) in `_setup_evil_twin_mac`; continue deauth on `wlan_mon` (D69) |
| R37 | Interrupted mode switch leaves adapter in wrong state | `RadioLeaseManager.acquire()` verifies actual mode; force-managed on dirty state (D70) |
| R38 | Job queue starvation / priority inversion (V2) | `acquire_or_preempt` is **V2 only**; V1 ships "no preemption; operator stops manually" (D71) |
| R39 | aircrack's 5 s EAPOL 4-way timeout is too aggressive for online capture (roaming, slow supplicant, wake-from-hibernation take 30+ s) | Wcarck uses 30 s whole + 5 s interframe for online; offline pcap scan uses no timeout, counts messages, M2+M3 minimum (D75). Rejects aircrack's 5 s/1 s constants |
| R40 | Offline validator "succeeds" silently on PMKID-only `.cap` because aircrack-ng's exit code is 0 even when the wordlist has no candidate | `tshark_precheck.py` runs first, ~50 ms, returns `{pmkid: bool, eapol_count: int, has_m2_m3: bool}` for UI badge; only then aircrack-ng validator is invoked (D76) |
| R41 | Single VIF per adapter prevents simultaneous AP + monitor on the user's RTL8821AU (one phy, two roles needed for Evil Twin + scan) | `RadioLeaseManager` leases are per-`phy`, not per-`iface`; `wlan_ap` (5 GHz) + `wlan_mon` (2.4 GHz) coexisting on one RTL8821AU via `iw phy phyX interface add` (D77). Industry-leading vs bettercap only |
| R42 | rfkill soft-block leaves adapter "alive" (`ip link` says UP) but `iw dev` reports no radio; AdapterWatchdog's 2 s poll can miss this | `radio/rfkill.py` polls `rfkill list` in parallel; soft-block → `adapter.rfkill.soft` event; unblock gated on `auto_unblock_rfkill: true` in `config.toml` (D78) |
| R43 | NetworkManager reclaims `wlan0` mid-job; re-asserts DefaultManaged mode and breaks monitor-mode leases | `install.sh` step 0 runs `systemctl disable --now && systemctl mask NetworkManager wpa_supplicant avahi-daemon`; resurrecting them is operator-initiated (D79). Ahead of all 4 reference tools |
| R44 | deauth reason code is currently unspecified in `ManagedProcess`; 802.11 spec default varies | `DeauthModule` sends `rc=7` (Class 3 frame from nonassociated STA) for broadcast, `rc=1` (unspecified) for directed; exposed in Wcarck UI as `--deauth-rc` (D80) |
| R45 | 5 GHz DFS channels fail at the driver when `iw reg get` shows `country 00` (world domain, common on default Ubuntu) | `radio/regulatory.py` checks `iw reg get` at lease acquisition; DFS channel + country 00 → `radio.reg.dfs_blocked` event, refuse lease (D81) |
| R46 | airodump-ng CSV starts with a leading `\r\n` before the `BSSID, ...` header; a naive parser misreads the first row | `AirodumpCSVParser.KNOWN_HEADERS` pins the exact string with the leading `\r\n` literal; rejects on mismatch (D50, D82) |
| R47 | Scan-mode MAC is the adapter's hardware MAC, leaking operator identity in any `airodump` CSV the operator exports for analysis | `portal/mac.py` runs `macchanger -A` on scan mode, restores real MAC on capture-attack mode; operator opt-out via `randomize_scan_mac: false` (D83) |
| R48 | Portal validator 10 s hard timeout produces false negatives on slow wordlists; aircrack-ng at 1 k keys/s takes minutes to fail | Validator timeout 30 s default, configurable up to 300 s; on timeout, mark `inconclusive` (not `failed`); UI shows "validator timed out — wordlist may be too slow" (D84) |
| R49 | 50+ network scan causes table jank if not virtualized | TanStack Table + `@tanstack/react-virtual` for all tables > 20 rows; row height 48 px; overscan 5; renders ~20 DOM nodes regardless of network count (D96) |
| R50 | Status colors indistinguishable for color-blind users (deuteranopia / protanopia) | Status indicators use shape + color (✓, ✗, ●, ◌), not color-only; WCAG AA contrast (4.5:1 normal, 3:1 large) verified by axe-core in e2e (D99) |
| R51 | Sidebar auto-expand on hover causes flicker when mouse crosses left edge (e.g., reaching browser back) | Sidebar is icon-only (64 px) by default; small pin button toggles to 220 px; state persisted in `localStorage.sidebar_pinned`; never auto-expands (D87, self-correction 1) |
| R52 | Deauth confirmation modal adds friction to most common workflow; experienced pentesters find it annoying | Deauth from network detail panel starts immediately on click (no modal); Stop button is prominent in Attacks page; only Evil Twin (which requires adapter mode switch and is harder to undo) gets a confirmation modal (D88, self-correction 2) |
| R53 | Network detail panel toggle behavior confuses users — clicking same row closes panel they wanted to look at | Clicking a network ALWAYS opens or updates the panel; only × button or Escape key closes; clicking another row updates the panel (D89, self-correction 3) |
| R54 | Guided action bar wastes vertical space for experienced users | Bar appears only on first launch OR when no jobs and no session in last 24 h; after first scan, never shown again; tracked in `localStorage.action_bar_dismissed_at` (D90, self-correction 4) |
| R55 | 4-bar signal visualization is ambiguous; pentesters need exact dBm to assess deauth feasibility (deauth below -75 dBm unreliable) | Show BOTH bars AND dBm number; bars provide visual scan, number provides precision (D98, self-correction 5) |
| R56 | Mode switch "spinner" doesn't tell the user what's actually happening during a 2-3 s operation | Mini 4-step progress indicator inside adapter card: ① iface down ② mode set ③ iface up ④ injection verify; each step ✓/●/◌ with step name visible (D92, self-correction 6) |
| R57 | "Export AI Bundle" label is confusing for naive user who doesn't know what an AI bundle is | Label is "Copy Debug Report" with subtitle "Generates a structured report you can paste into ChatGPT, Claude, or any AI for instant troubleshooting" (D93, self-correction 7) |
| R58 | 5 GHz channel dropdown shows all channels without indicating which require DFS radar scan (60 s delay on AP startup) | DFS channels (52-144) visually separated from non-DFS with horizontal divider + ⚠ marker; selecting shows inline "60-second radar scan required; AP startup will be delayed" (D94, D81, self-correction 8) |
| R59 | Killing NetworkManager (D79 v1) breaks the 3-adapter `wlan_uplink` design | Revised D79: NM stays running; `/etc/NetworkManager/conf.d/99-wcarck.conf` adds `unmanaged-devices=mac:<wlan_mon>;mac:<wlan_ap>`, leaving uplink managed (D101) |
| R60 | iw reg get country 00 (world domain) blocks 5 GHz DFS and 2.4 GHz channels 12-14 | `radio/regulatory.py` runs `iw reg set BO` (Bolivia, pentest standard) on startup; falls back to `BZ`; sets `txpower fixed 3000` (D102) |
| R61 | FastAPI as root is a security anti-pattern even for a local tool | `wcarck.service` runs as `User=wcarck`/`Group=wcarck`; `/etc/sudoers.d/wcarck` whitelists NOPASSWD for specific binaries (D35, D103) |
| R62 | System suspend/hibernate mid-deauth; USB resets on wake, DB thinks leases still active | DBus `org.freedesktop.login1` `PrepareForSleep` listener; on sleep, hard-stop jobs + force-managed all + persist state; on wake, run AdapterWatchdog (D104) |
| R63 | Browser autoplay policy blocks audio without user gesture; laptop in backpack has no UI | Web Audio API requires user click "Enable Audio" once per session; reminder in Topbar (D121) |
| R64 | Dark mode is unreadable in direct sunlight (glare) | High-contrast light mode toggle in Settings (white bg, black text, deep blue accent) (D122) |
| R65 | `hcxdumptool` generates 100 MB+ pcapng/hour in busy envs; disk fills fast | Storage retention: 7-day pcapng auto-clean (unless starred), 30-day session_log archive, `.22000` hashes kept forever; Cleanup job on startup (D124) |
| R66 | VM USB passthrough flaky under load (VMware/VirtualBox); adapter resets every 500 ms | `AdapterWatchdog` counts reset-within-2s events; > 3 in session → `adapter.flaky_usb` event with hint "Switch USB controller from USB 2.0 to USB 3.1 (xHCI) in VM settings" (D125) |
| R67 | RTL8821AU driver bug — MAC changes mid-injection, breaking MAC-keyed adapter registry | `AdapterRegistry` keys on stable USB bus path (`/sys/class/net/<iface>/device`), MAC is secondary; survives MAC rotation (D114) |
| R68 | Modern Android/iOS DoH (port 443) and DoT (port 853) bypass dnsmasq UDP/53 interception; CNA fails | nftables drop TCP/UDP port 853 + known DoH IPs (8.8.8.8, 1.1.1.1, 8.8.4.4, 9.9.9.9) on `wlan_ap` chain; force fallback to UDP/53 (D105) |
| R69 | Slow SD card / USB stick on Pi stalls `hcxdumptool` writes → freezes asyncio `run_in_executor` | tmpfs staging: raw `.pcapng` to `/tmp/wcarck_captures/` (RAM); on completion/save, move to `/var/lib/wcarck/captures/`; `.22000` hashes always on persistent (D106) |
| R70 | WPA3 client ignores unencrypted deauth (PMF mandatory); we waste time attacking unattackable clients | `DeauthModule` reads client AKM from assoc-req; WPA3-SAE clients excluded from deauth target list; UI shows separate WPA2/WPA3 columns; passive PMKID only for WPA3 (D41, D116) |
| R71 | Docker containerization attempt — netlink + mac80211 + USB passthrough all broken in network namespace | `README.md` declares bare metal only; `install.sh` uses `apt` + Python `venv`; no Dockerfile planned (D115) |
| R72 | DFS channel CAC 60 s delay; deauth fires before `hostapd.ap_enabled`, clients roam to other saved networks | `EvilTwinModule` waits for `hostapd.ap_enabled`; `DeauthModule.start()` gated on this event; UI countdown (D94, D118) |
| R73 | DHCP subnet collision — if uplink uses 10.0.0.x/24, Evil Twin breaks | `EvilTwinModule` inspects uplink subnet on launch; auto-shifts to 192.168.88.x/24 or 172.16.0.x/24 (D107) |
| R74 | HSTS preloaded domains (google, facebook) hard-error on cert mismatch; naive 443 interception ruins Evil Twin | nftables REJECT TCP 443 to uplink from `wlan_ap` clients; rely on Captive Network Assistant HTTP probes (iOS/Android/Windows) (D108) |
| R75 | Browser refresh (F5) loses WS ephemeral state (deauth counter, EAPOL progress) | `ws.py` accepts `State Sync` request on connect; replays last 100 events from in-memory ring buffer + active jobs (D109) |
| R76 | USB bus power brownout — 2 high-power adapters on adjacent ports exceed 500 mA; bus resets | Adapters page shows "use separate sides or powered hub" warning if both on same USB controller/hub (D126) |
| R77 | `aireplay-ng` forks mid-kill, fork becomes orphaned daemon, locks adapter | Every `ManagedProcess.spawn()` uses `start_new_session=True`; on stop, `os.killpg(pgid, SIGTERM)` then SIGKILL — atomic group kill (D49, D113) |
| R78 | FD exhaustion under load — 1024 default `ulimit -n` is hit by WebSockets + SQLite + subprocesses | `wcarck.service` `LimitNOFILE=65536`; `LimitNPROC=8192` (D35) |
| R79 | Modern smartphones prefer IPv6; IPv4 NAT bypassed; CNA popup never appears | nftables `meta nfproto ipv6 drop` on `wlan_ap` forward/out; `dnsmasq` `address=/#/::` (IPv6 sinkhole) (D110) |
| R80 | WAL grows unbounded if long-running UI read transaction blocks auto-checkpoint | Dedicated background task runs `PRAGMA wal_checkpoint(PASSIVE)` every 5 min; all reads `autocommit` (D57, D111) |
| R81 | GIL blocks event loop on heavy CSV/JSON/hashcat parse; WS disconnects, watchdogs false-positive adapter crash | `ProcessPoolExecutor` (not ThreadPool) for airodump CSV, hashcat output, PMKID computation, large JSON serialization (D112) |
| R82 | RTL8812AU/RT3070 thermal throttle at 30 dBm continuous injection, drops 90 % of frames | Pulsed burst in DeauthModule: 64 frames → `await asyncio.sleep(0.1)`; amplifier micro-second idle (D119) |
| R83 | 200 networks + 500 clients in 2 min → 50 toasts obscure top-right | Debounce/grouping (5 handshakes → 1 toast); Focus Mode toggle suppresses INFO/WARN toasts (D129) |
| R84 | 64 px sidebar + 380 px panel breaks 390 px iPhone screen | `< 768 px` viewport: bottom tab bar (iOS-style); 380 px panel becomes full-screen bottom sheet (D130) |
| R85 | Pentester has 12 handshakes + 4 portal passwords at end of engagement, no clean client deliverable | "Generate Client Report" button: CSV/HTML summary of target ESSIDs, vulns, masked creds, mitigation recs; restores ReportModule from v0.1.4 deferral |

---

## 20. Open Questions

- [ ] Pin specific morrownr/8821au git commit SHA for reproducible install.
- [ ] Confirm USB topology for udev fallback rules.
- [ ] **PMKID cache retention** — once a `WPA*01` line is captured for a (BSSID, client) pair, how long do we cache it before re-collecting? Risk of stale PMKID vs CPU/risk cost of re-attack. Default proposal: 7 days.
- [ ] **Hotspot 2.0 / Passpoint detection** — the deauth engine must skip APs advertising `ANQP` and `HS2.0` capabilities; mis-detecting a Passpoint AP as a candidate produces ugly failures. Library: `scapy.layers.dots11` already parses these IEs.
- [ ] **EAP-TLS enterprise handling** — the 4-EAPOL validator will trigger on a non-WPA2-Enterprise EAPOL frame and may produce false handshakes. Should the validator require the original beacon to advertise a non-Enterprise cipher, and refuse otherwise? Default: refuse, log, emit `handshake.enterprise_skipped` event.
- [ ] **Multi-operator audit chain** — V1 is single-operator, but if two operators share a host (e.g., a hot-spare test rig) the `session_log` is ambiguous. Per-operator login is post-MVP; for V1, the local `who` is logged as a `WCARCK_OPERATOR` envvar set by the operator's shell rc.
- [ ] **Plugin schema version compatibility** — when a built-in module's `Module`/`Param`/`Handler` shape changes, existing third-party plugins break. Plan: a `wcarck.plugin_api_version` integer in `core/__init__.py` that the loader compares against a `__plugin_api_version__` constant in the plugin file. Mismatch → quarantined, not loaded.

---

## 21. Decision Log

| # | Date | Decision |
|---|---|---|
| D34 | 2026-06-03 | **Remove all auth/encryption/legal from MVP** |
| D22 | 2026-06-03 | **Module & Plugin architecture** (Bettercap-inspired) |
| D18 | 2026-06-03 | **Password cracking moved into V1 scope** |
| D35 | 2026-06-03 | **Drop `CAP_SYS_ADMIN` from production systemd unit** — only CI override gets it (for `mac80211_hwsim`); production runs with `CAP_NET_RAW CAP_NET_ADMIN` only; **`User=wcarck`/`Group=wcarck`** (unprivileged user, D103); **`LimitNOFILE=65536`** (R78, FD-exhaustion prevention); `LimitNPROC=8192` |
| D36 | 2026-06-03 | **`ManagedProcess` per-tool stop override** — `hcxdumptool` requires SIGTERM not SIGINT for clean pcapng flush; `hostapd`/`dnsmasq` use the standard SIGINT cascade |
| D37 | 2026-06-03 | **scapy capture uses `AsyncSniffer`** — never blocking `scapy.sniff()`; all `sendp` calls are wrapped in `asyncio.to_thread` |
| D38 | 2026-06-03 | **4-EAPOL validator must branch on `.22000` line prefix** — `WPA*01` (PMKID) is a valid capture with no M1-M4 frames; `WPA*02` (EAPOL) is the 4-frame state machine. Per-`(BSSID, client)` pair, not per-BSSID |
| D39 | 2026-06-03 | **Captive portal must serve four detection paths** — `/generate_204` (Android 204), `/hotspot-detect.html` (Apple), `/connecttest.txt` (Windows), and 302 redirect on `clients3.google.com/generate_204` |
| D40 | 2026-06-03 | **`install.sh` disables `systemd-resolved` DNS stub** — `DNSStubListener=no` plus a per-link drop-in for `wlan_ap`, otherwise `dnsmasq` cannot bind :53 on Ubuntu 24.04 |
| D41 | 2026-06-03 | **PMF/802.11w awareness (per-AP + per-client)** — the deauth engine inspects the original-AP beacon for `RSN mgmt_frame_protection=1` and refuses to deauth PMF-required APs; **per-client enforcement** — the UI visually separates WPA2 vs WPA3 clients by their AKM suite in the association request; the "Deauth" button is **disabled for WPA3 clients** with tooltip "Client is using WPA3 (PMF mandatory). Unencrypted deauth frames will be ignored"; rely exclusively on passive PMKID capture for WPA3 clients (R70, D116) |
| D42 | 2026-06-03 | **Plugin API version gate** — `wcarck.plugin_api_version` integer in `core/__init__.py`; plugins declare `__plugin_api_version__` and are quarantined on mismatch |
| D43 | 2026-06-03 | **Three-category failure model** — every exception handler must categorize into RECOVERABLE / FATAL-job / FATAL-service; bare `except Exception: pass` is forbidden. Use `asyncio.TaskGroup` not `gather`; never swallow `CancelledError`; use `Result` type for legitimate failures |
| D44 | 2026-06-03 | **AdapterWatchdog background task** — `radio/watchdog.py` polls `ip link show <iface>` every 2 s; on absence, cancels all jobs holding leases on that adapter, marks GONE, publishes `adapter.gone` (R16, blocker) |
| D45 | 2026-06-03 | **Driver recovery via modprobe** — on kernel oops, `modprobe -r <driver> && modprobe <driver>` reload, gated to once per (iface, 60 s) via `_last_recovery_attempt` dict (R17) |
| D46 | 2026-06-03 | **Per-adapter recovery lock** — `_recovery_in_progress[iface]` `asyncio.Lock` prevents two concurrent recovery attempts for the same adapter (R18) |
| D47 | 2026-06-03 | **MAC random mitigation** — `options 88XXau rtw_drv_log_level=0` in `/etc/modprobe.d/88XXau.conf`; `doctor.sh` checks MAC against expected value at startup (R19) |
| D48 | 2026-06-03 | **DKMS post-build verification** — `install.sh` runs `dkms status` after build; aborts with actionable error if module not installed (R20, blocker) |
| D49 | 2026-06-03 | **`_kill_process_tree` via process group + psutil** — `ManagedProcess` spawns every subprocess with `start_new_session=True` (own process group); on stop, `os.killpg(pgid, SIGTERM)` then 2 s wait then `os.killpg(pgid, SIGKILL)`; psutil recursive backup for any orphans. Atomic wipe of forks that escape during kill (R21, R77; D113) |
| D50 | 2026-06-03 | **airodump-ng CSV header validation** — `AirodumpCSVParser.KNOWN_HEADERS` is version-pinned; unknown header raises `UnknownCSVFormat` and emits `tool.version_mismatch` event (R22) |
| D51 | 2026-06-03 | **hashcat exit-code map** — `0` cracked, `1` exhausted, `2` user-quit, `255` error, `-11` SIGSEGV → auto-retry with CPU backend, `-9` SIGKILL, `-2` SIGINT (R23) |
| D52 | 2026-06-03 | **CSV liveness watchdog** — `ScanModule._last_csv_line` 30 s threshold; emits `scan.stale` with `seconds_since_last_network` (R24) |
| D53 | 2026-06-03 | **JobRunner uses `asyncio.TaskGroup`** — every job's sub-tasks (drain, watchdog, relay) inside `async with TaskGroup()`; `except*` clauses for `StopJobRequested` / `AdapterGone` / generic `Exception` |
| D54 | 2026-06-03 | **`AsyncExitStack` replaces teardown stack** — `EvilTwinModule.run()` uses `stack.enter_async_context(...)` for each resource; reverse-order unwind on any exception (including `CancelledError`) |
| D55 | 2026-06-03 | **CircuitBreaker for external tools** — `core/circuit_breaker.py`; 3 failures → 30 s open; `DeauthModule._aireplay_breaker` falls back to scapy while open |
| D56 | 2026-06-03 | **`retry_with_backoff` for driver operations** — `core/retry.py`; `max_attempts=4, base_delay=0.5, max_delay=8.0, jitter=10 %`; applied to `set_monitor_mode`, `set_channel`, `mode_switch` |
| D57 | 2026-06-03 | **WAL recovery + periodic checkpoint** — `open_database_safely` runs `PRAGMA wal_checkpoint(TRUNCATE)` if `db.sqlite-wal` > 100 MB; **dedicated background task** runs `PRAGMA wal_checkpoint(PASSIVE)` every 5 minutes to prevent starvation from long-running read transactions; all read queries use `autocommit` mode to release locks instantaneously (R25, R80; D111) |
| D58 | 2026-06-03 | **Disk space check before scan flush** — `shutil.disk_usage("/var/lib/wcarck")`; < 50 MB → `system.disk_low`; < 10 MB → skip flush + `system.disk_full` (R26) |
| D59 | 2026-06-03 | **SQLite CORRUPT recovery** — on `OperationalError` containing "corrupt", rename DB to `db.sqlite.corrupt.<unix_ts>`, remove `-wal`/`-shm`, log at `CRITICAL`; Alembic migrations recreate on next start (R27) |
| D60 | 2026-06-03 | **Alembic per-migration atomicity + schema integrity check** — `transaction_per_migration=True` in `alembic env.py`; `verify_schema(engine)` confirms all 14 expected tables exist on startup |
| D61 | 2026-06-03 | **AP band-change detection in pursuit mode** — per-iteration `iw scan` or beacon-watcher; switch `monitor.locked` between `wlan_mon` (2.4) and `wlan_ap` (5); if 5 GHz adapter is busy with Evil Twin, emit `attack.deauth.pursuit_blocked` and stop pursuit (R28) |
| D62 | 2026-06-03 | **WPA3-SAE / WPA2-WPA3 transition detection** — RSN AKM suite `0x000FAC08` (SAE) at scan time; UI badge "WPA3 — handshake not supported, PMKID-only"; transition mode (both PSK + SAE) treated as WPA2-compatible (R29) |
| D63 | 2026-06-03 | **802.11r FT-PSK detection** — AKM suite `0x000FAC04` (FT-PSK); `CaptureStrategy.PMKID_ONLY`; bypasses the 4-EAPOL state machine (R30) |
| D64 | 2026-06-03 | **Client randomized MAC handling** — locally-administered-bit check; `ClientFlags.RANDOM_MAC` flag; Evil Twin identity is `ap_session_id + client_ip` (not `client_mac`) (R31) |
| D65 | 2026-06-03 | **AP-offline-during-capture behavior** — `HandshakeCaptureModule` subscribes to `scan.network.lost`; pauses deauth but keeps `hcxdumptool` running; emits `capture.handshake.target_lost` (R32) |
| D66 | 2026-06-03 | **Portal validator semaphore** — `OfflineValidator._semaphore = asyncio.Semaphore(1)` serializes aircrack-ng per `.cap`; use temp file, not process substitution (R33) |
| D67 | 2026-06-03 | **Per-client submission lock** — `CaptivePortalServer._submission_locks[client_ip]` `asyncio.Lock`; early-exit if `_cred_repo.get_validated()` returns a row; locks popped on disconnect (R34) |
| D68 | 2026-06-03 | **DHCP lease time 2 minutes + pool watchdog** — `dhcp-range=10.0.0.2,10.0.0.100,255.255.255.0,2m`; `dhcp_watchdog` reads lease file every 30 s, emits `ap.dhcp.pool_warning` at 80 % pool (R35) |
| D69 | 2026-06-03 | **Evil Twin MAC spoofing** — `_setup_evil_twin_mac` sets `wlan_ap` MAC to one octet off the real AP's BSSID; combined with continuing deauth on `wlan_mon` (R36) |
| D70 | 2026-06-03 | **Mode verification on lease acquisition** — `RadioLeaseManager.acquire()` reads `iw dev <iface> info`; mismatch → force-managed mode → restart from clean state; `adapter_mode_audit` task runs every 30 s (R37) |
| D71 | 2026-06-03 | **Priority preemption deferred to V2** — V1 ships "no preemption; operator stops manually"; V2 adds `acquire_or_preempt` that pauses lower-priority jobs (R38) |
| D72 | 2026-06-03 | **Structured log fields per subprocess call** — `ManagedProcess.start()`/`.stop()` log `tool`, `pid`, `args`, `iface`, `job_id`, `returncode`, `duration_ms`, `stop_signal`; the "no comments in code" rule is suspended for log field names |
| D73 | 2026-06-03 | **Event tag catalog** — fixed set of `tag + payload` schemas (15 tags enumerated in §28.8); all new events must conform |
| D74 | 2026-06-03 | **`doctor.sh --postmortem`** — single-command diagnostic: adapter mode, orphaned PIDs, orphaned nftables tables, WAL size, active leases, disk free, last 50 `session_log` rows |
| D75 | 2026-06-03 | **EAPOL 4-way timeout constants (revised after aircrack-ng review)** — online capture uses 30 s whole-4-way + 5 s interframe (aircrack's 5 s/1 s is too aggressive for roaming, slow supplicant, wake-from-hibernation); offline pcap scan uses **no timeout**, just counts EAPOL messages with M2+M3 minimum as the crackable criterion. Real-time M1 detection resets the interframe timer (R39) |
| D76 | 2026-06-03 | **tshark pre-check before aircrack-ng validator** — `portal/validators/tshark_precheck.py` runs `tshark -r <cap> -Y 'eapol || wlan.fc.type_subtype==0x8'` in ~50 ms; returns `{pmkid: bool, eapol_count: 0..4, has_m2_m3: bool}` for the UI badge ("PMKID" / "2/4 EAPOL" / "4/4 EAPOL"); only then `aircrack-ng` is invoked. Better UX than aircrack/bettercap/wifite2 which skip this step (R40) |
| D77 | 2026-06-03 | **Per-phy lease model (industry-leading) + channel race preemption** — `RadioLeaseManager` leases are per-`phy`, not per-`iface`; one RTL8821AU phy hosts `wlan_ap` (5 GHz) + `wlan_mon` (2.4 GHz) coexisting via `iw phy phyX interface add`. **Channel state is exclusively owned by the lease holder** — Recon holds `monitor.scan` (hopping allowed); Deauth requires `monitor.locked`; `RadioLeaseManager` **pauses/preempts the scan lease BEFORE granting the locked lease**, ensuring the hopper is fully suspended before `iw set channel` is called (D117). Adapters tracked by **stable USB bus path** (`/sys/class/net/wlan_ap/device`), not MAC, since RTL8821AU may change MAC mid-injection (R41, R67, R70; D114) |
| D78 | 2026-06-03 | **rfkill poll in AdapterWatchdog, auto-unblock gated on config** — `radio/rfkill.py` polls `rfkill list` parallel to `ip link show`; on soft-block, emits `adapter.rfkill.soft` and pauses all jobs on that adapter; unblock is **operator-initiated by default**; `auto_unblock_rfkill: true` in `config.toml` enables automatic `rfkill unblock wifi`. Matches aircrack-ng/bettercap/wifite2/airgeddon (R42) |
| D79 | 2026-06-03 | **install.sh configures NetworkManager to ignore attack adapters, NOT kill NM** — writes `/etc/NetworkManager/conf.d/99-wcarck.conf` with `[keyfile] unmanaged-devices=mac:<wlan_mon_mac>;mac:<wlan_ap_mac>`; `wlan_uplink` is left managed (internet stays up); alternatively per-session via `nmcli dev set <iface> managed no`. Killing NM kills the uplink and breaks the 3-adapter design (R43, R59; revised from "mask everything" — FinalVerdict §2.1) |
| D80 | 2026-06-03 | **Deauth reason codes explicit** — `DeauthModule` sends `rc=7` (Class 3 frame from nonassociated STA) for broadcast deauth, `rc=1` (unspecified) for directed; matches aircrack-ng/wifite2/bettercap/aireplay-ng default; exposed in Wcarck UI as `--deauth-rc` (R44) |
| D81 | 2026-06-03 | **Regulatory domain set to permissive region on startup** — `radio/regulatory.py` runs `iw reg set BO` (Bolivia, pentest standard) at startup; sets `iw dev <iface> set txpower fixed 3000` (max TX power, country-dependent); falls back to `BZ` (Belize). Country 00 (world domain) blocks 5 GHz DFS and 2.4 GHz channels 12-14; refusing to set would lose those channels. Operator warning logged. Tied with airgeddon; ahead of aircrack-ng/wifite2/bettercap/hcxdumptool (R45, R60; revised — FinalVerdict §2.2) |
| D82 | 2026-06-03 | **airodump-ng CSV header pin (cosmetic but real)** — `AirodumpCSVParser.KNOWN_HEADERS` pins the exact string `"\r\nBSSID, First time seen, Last time seen, channel, Speed, ..."` (note the leading `\r\n` literal that airodump-ng emits before the header). Prevents naive parsers from misreading the first row (D50, R46) |
| D83 | 2026-06-03 | **Scan-mode MAC randomization (cross-tool review finding)** — `portal/mac.py` runs `macchanger -A` on scan mode (random vendor MAC); restore real MAC on capture-attack mode (so PMKID/PMF still work, since APs may validate the source MAC); Evil Twin uses one-octet-off BSSID (D69). Operator opt-out via `randomize_scan_mac: false`. Matches aircrack-ng/bettercap/wifite2/airgeddon default (R47) |
| D84 | 2026-06-03 | **Portal validator timeout 30 s default (not 10 s)** — aircrack-ng at 1 k keys/s takes minutes to fail on a wrong wordlist; 10 s produces false negatives. New default 30 s, configurable up to 300 s in `config.toml`; on timeout, status is `inconclusive` (not `failed`); UI shows "validator timed out — wordlist may be too slow" with a "Retry with 300 s" button. Matches wifite2 60 s (R48) |
| D85 | 2026-06-03 | **4-pillar UI design philosophy** — Power Without Intimidation / Dense Information Zero Clutter / 3-Click Rule / Alive Not Animated. Every new UI element must satisfy all four pillars (§29.0) |
| D86 | 2026-06-03 | **3-zone layout** — topbar (48 px glass) + sidebar (64 px default, 220 px pinned) + content zone (24 px padding) + contextual panel (380 px slide-in from right). Full mockup in §29.2 |
| D87 | 2026-06-03 | **Sidebar is pin-toggled, NOT auto-expand on hover** — icon-only (64 px) by default; small pin button at top toggles to 220 px; state in `localStorage.sidebar_pinned`; never auto-expands (avoids left-edge flicker, R51; self-correction 1) |
| D88 | 2026-06-03 | **Deauth requires NO confirmation modal** — starts immediately on click in network detail panel; Stop button is prominent on Attacks page. Only Evil Twin (mode switch + harder to undo) gets the full launch confirmation modal (R52; self-correction 2) |
| D89 | 2026-06-03 | **Network detail panel is persistent** — clicking a network ALWAYS opens or updates; only × button or Escape closes; clicking another row updates panel (no toggle-close, R53; self-correction 3) |
| D90 | 2026-06-03 | **Guided action bar visibility** — appears only on first launch OR when no jobs and no session in last 24 h; after first scan, never shown again; tracked in `localStorage.action_bar_dismissed_at` (R54; self-correction 4) |
| D91 | 2026-06-03 | **Deauth from Evil Twin wizard Step 3 requires full launch confirmation** — shows SSID, channel, adapter, template, side effects ("5 GHz monitoring will be unavailable") |
| D92 | 2026-06-03 | **Mode switch shows 4-step progress indicator** — ① interface down ② mode set ③ interface up ④ injection verify; each step ✓/●/◌ with name visible inside the adapter card (R56; self-correction 6) |
| D93 | 2026-06-03 | **"Copy Debug Report" button, not "Export AI Bundle"** — Logs page; subtitle "Generates a structured report you can paste into ChatGPT, Claude, or any AI for instant troubleshooting" (R57; self-correction 7) |
| D94 | 2026-06-03 | **5 GHz channel dropdown + DFS CAC 60s wait (orchestration)** — non-DFS channels (36-48, 149-165) above divider; DFS channels (52-144) below with ⚠ marker; selecting DFS shows "60-second radar scan required". **Orchestration**: DeauthModule MUST NOT fire until `hostapd` emits `AP-ENABLED`; for DFS channels, this is delayed ~60s by Channel Availability Check (CAC); UI shows "Waiting 60s for DFS Radar Scan..." countdown (R58, R72; D118) |
| D95 | 2026-06-03 | **Design tokens location and binding** — `frontend/src/styles/index.css` as CSS variables (per §29.1); Tailwind binds via `tailwind.config.ts` `theme.extend`; shadcn/ui with custom Ubuntu-orange + Inter font theme |
| D96 | 2026-06-03 | **Table virtualization library** — `@tanstack/react-virtual` for all tables > 20 rows; row height 48 px; overscan 5; renders ~20 DOM nodes regardless of network count (R49) |
| D97 | 2026-06-03 | **WebSocket → UI update path is direct** — Zustand direct update, no React context cascade; target < 50 ms latency. 13-term tooltip coverage required (BSSID, SSID, Channel, WPA2-PSK, WPA3-SAE, PMF, EAPOL, PMKID, Deauth, Monitor mode, Evil Twin, Handshake, dBm) via Radix UI `TooltipProvider`, delay 300 ms, max-width 280 px |
| D98 | 2026-06-03 | **Signal strength displays BOTH bars and dBm number** — bars provide quick visual scan (4 bars, color-coded green/yellow/amber/red by dBm band), number provides precision; pentesters need exact dBm to assess deauth feasibility (R55; self-correction 5) |
| D99 | 2026-06-03 | **WCAG AA accessibility** — color contrast 4.5:1 normal / 3:1 large; status indicators use shape + color (✓, ✗, ●, ◌), not color-only (deuteranopia-safe, R50); axe-core runs in Playwright e2e to catch violations on every PR |
| D100 | 2026-06-03 | **Command palette (Ctrl+K)** — VS Code-style fuzzy search across all actions; top result highlighted; Enter executes. Keyboard: Tab / Enter / Space / Esc / 1-9 sidebar / ↑↓ table / Enter on row (§29.7) |
| D101 | 2026-06-03 | **Showstopper fix #1 — NetworkManager unmanaged-devices (revised D79)** — kill NM is wrong; instead write `/etc/NetworkManager/conf.d/99-wcarck.conf` with `[keyfile] unmanaged-devices=mac:<wlan_mon>;mac:<wlan_ap>`, leaving `wlan_uplink` managed. Alternative: `nmcli dev set <iface> managed no` per-session. R43, R59 |
| D102 | 2026-06-03 | **Showstopper fix #2 — Force CRDA permissive region on startup (revised D81)** — `iw reg set BO` (Bolivia, pentest standard) on `wcarck.service` start, with fallback `BZ`. Sets `txpower fixed 3000` (max). Country 00 blocks 5 GHz DFS and 2.4 GHz channels 12-14. R60 |
| D103 | 2026-06-03 | **Showstopper fix #3 — Unprivileged `wcarck` user + sudoers whitelist** — FastAPI runs as `User=wcarck`/`Group=wcarck`, NOT root. `/etc/sudoers.d/wcarck` whitelists NOPASSWD for specific binaries: `iw`, `ip`, `macchanger`, `hostapd`, `dnsmasq`, `aircrack-ng`, `hcxdumptool`, `airodump-ng`, `aireplay-ng`, `iptables`, `nft`, `rfkill`, `setcap`, `dkms`, `modprobe`. `ManagedProcess` auto-prepends `sudo` to whitelisted commands. R61 |
| D104 | 2026-06-03 | **Showstopper fix #4 — DBus `PrepareForSleep` listener** — backend subscribes to `org.freedesktop.login1` `PrepareForSleep` signal via `jeepney`/`asyncio-dbus`; on `True` (about to sleep), hard-stop all jobs, force-managed all adapters, persist state; on wake, run `AdapterWatchdog` immediately. Without this, USB resets on wake leave the DB thinking leases are active. R62 |
| D105 | 2026-06-03 | **DoH/DoT firewall drop on Evil Twin** — nftables rules in `wlan_ap` chain drop TCP/UDP to port 853 (DoT) and known DoH IPs (8.8.8.8, 1.1.1.1, 8.8.4.4, 9.9.9.9); force client OS to fall back to unencrypted UDP/53 (dnsmasq-intercepted). Modern Android/iOS DoH bypasses captive portal if not blocked. R68 |
| D106 | 2026-06-03 | **tmpfs staging for raw captures** — `hcxdumptool` writes raw `.pcapng` to `/tmp/wcarck_captures/` (tmpfs, RAM-backed); on capture completion or operator save, move to `/var/lib/wcarck/captures/` (persistent); preserves `.22000` hashes (small) always on persistent. Prevents SD card / slow disk I/O stalls on Raspberry Pi. R69 |
| D107 | 2026-06-03 | **DHCP subnet collision auto-shift** — `EvilTwinModule` inspects `wlan_uplink` IPv4 subnet on launch; if `10.0.0.x/24` collides with default Evil Twin pool, dynamically rewrite `dnsmasq.conf` to use `192.168.88.x/24` (or `172.16.0.x/24`); also avoid the uplink's exact subnet. R73 |
| D108 | 2026-06-03 | **HSTS awareness — never intercept port 443** — nftables explicitly REJECT TCP 443 to uplink from `wlan_ap` clients (let it drop, no captive hijack); rely **entirely on Captive Network Assistant** probes (iOS `captive.apple.com`, Android `connectivitycheck.gstatic.com`, Windows `www.msftconnecttest.com`) which use HTTP. HSTS preloaded domains (google, facebook, etc.) will throw hard errors on cert mismatch, ruining the Evil Twin illusion. R74 |
| D109 | 2026-06-03 | **WebSocket state replay on reconnect** — `ws.py` accepts `State Sync` request on connect; replays last 100 events from in-memory ring buffer or `session_log`, plus all active jobs and their current progress. Solves the "F5 problem" where ephemeral state (deauth counter, EAPOL progress) is lost on browser refresh. R75 |
| D110 | 2026-06-03 | **IPv6 drop on `wlan_ap`** — nftables `inet wcarck_et_<id>` chain has `meta nfproto ipv6 drop` on `wlan_ap` forward/out; `dnsmasq` config has `address=/#/::` (sinkhole IPv6 DNS); forces smartphone clients to fall back strictly to IPv4. Modern phones prefer IPv6 and will bypass our IPv4 NAT. R79 |
| D111 | 2026-06-03 | **WAL periodic PASSIVE checkpoint (companion to D57)** — dedicated `asyncio` background task every 5 minutes: `PRAGMA wal_checkpoint(PASSIVE)`; prevents WAL growth starvation from long-running UI read transactions. R80 |
| D112 | 2026-06-03 | **`ProcessPoolExecutor` for heavy CPU** — airodump CSV parsing, hashcat output parsing, PMKID computation, large JSON serialization run in `ProcessPoolExecutor` (NOT `ThreadPoolExecutor`); bypasses GIL, keeps asyncio orchestrator at 60 fps. R81 |
| D113 | 2026-06-03 | **Process groups via `start_new_session=True`** — every `ManagedProcess.spawn()` uses `asyncio.create_subprocess_exec(..., start_new_session=True)`; on stop, `os.killpg(pgid, SIGTERM)` then 2 s wait then `os.killpg(pgid, SIGKILL)`. Atomic — kills forks that escape during the kill. psutil backup for orphans. R77 |
| D114 | 2026-06-03 | **Track adapters by stable USB bus path, not MAC** — `AdapterRegistry` keys on `/sys/class/net/<iface>/device` (USB path, e.g., `/sys/devices/pci0000:00/.../usb1/1-2/1-2.1`); MAC is a secondary key with refresh; survives RTL8821AU MAC random-on-injection bug. R67 |
| D115 | 2026-06-03 | **Bare metal only, no Docker containerization** — Wcarck backend uses netlink sockets, mac80211 kernel interfaces, direct USB access; Docker network namespace isolation breaks all of these. `install.sh` uses `apt` + Python `venv`; declared in README. R71 |
| D116 | 2026-06-03 | **WPA3 / OWE transition mode — passive PMKID only** — `DeauthModule` reads client AKM suite from association request; WPA3-SAE-only clients (`0x000FAC08`) are **excluded from the deauth target list** entirely; UI shows separate WPA2 vs WPA3 client columns; transition mode (mixed) clients deauth-targetable as WPA2. R70 |
| D117 | 2026-06-03 | **Channel race preemption in RadioLeaseManager (refines D77)** — Recon holds `monitor.scan` lease; Deauth requires `monitor.locked`; the lease manager **pauses the scan lease BEFORE granting the locked lease** (atomic suspend → `iw set channel` → grant); prevents race where hopper overwrites locked channel 100 ms after deauth starts. R70 |
| D118 | 2026-06-03 | **DFS CAC 60s wait (refines D94)** — `EvilTwinModule.run()` waits for `hostapd` to emit `AP-ENABLED`; for DFS channels (52-144), this is delayed ~60 s by Channel Availability Check; `DeauthModule.start()` is gated on this event, never earlier; UI shows "Waiting 60s for DFS Radar Scan..." countdown. R72 |
| D119 | 2026-06-03 | **Thermal pulsed bursts in DeauthModule** — instead of 100 % duty cycle, inject 64 frames then `await asyncio.sleep(0.1)`; gives the RF amplifier micro-seconds of idle to dissipate heat. RTL8812AU / RT3070 thermal-throttle otherwise. R82 |
| D120 | 2026-06-03 | **Clock skew detection + `time.monotonic()` for math** — at startup, `doctor.sh` warns if system year `< 2024`; structured-log `ts` is wall-clock for display only; **all duration math uses `ts_mono` (`time.monotonic_ns()`)**, never `ts`; on offline boot (Raspberry Pi no RTC), 1970 timestamps don't break elapsed-time math. R69 |
| D121 | 2026-06-03 | **Audio alerts via Web Audio API ("Backpack Mode")** — Topbar toggle "🔊 Audio Alerts"; plays short beep on `capture.handshake.valid`; different chime on `portal.credential_captured`; user must click "Enable Audio" once per session to satisfy browser autoplay policy. Laptop in backpack, operator hears handshakes. R63 |
| D122 | 2026-06-03 | **High-contrast light mode toggle** — pure white background, pure black text, deep high-contrast blue accent (WCAG AAA for outdoor); toggle in Settings; complements dark mode; required for outdoor/sunlight ops. R64 |
| D123 | 2026-06-03 | **Asset drag-and-drop (wordlists + portal templates)** — Settings → Assets tab; wordlists drag-drop `.txt` → `/var/lib/wcarck/wordlists/`; portal templates drag-drop `.zip` (config.ini + html/ + static/) → `/var/lib/wcarck/portals/custom_X/`; backend chunks uploads, atomic write, validation. No terminal needed. |
| D124 | 2026-06-03 | **Storage retention policy** — keep `.22000` (hash) files forever (kilobytes); auto-delete raw `.pcapng` files older than 7 days unless "starred/pinned" by user in UI; keep SQLite `session_log` 30 days then archive to `/var/lib/wcarck/archive/`; automated Cleanup job on startup. hcxdumptool generates 100 MB+/hour in busy envs. R65 |
| D125 | 2026-06-03 | **VM USB flakiness detection + hint** — `AdapterWatchdog` counts adapter-reset-within-2s events; if > 3 in a session, emit `adapter.flaky_usb` with hint "Switch USB controller from USB 2.0 to USB 3.1 (xHCI) in VM settings." 80 % of users will try VMware/VirtualBox; USB passthrough is flaky. R66 |
| D126 | 2026-06-03 | **USB bus power brownout warning** — Adapters page shows inline warning "For stability during high-power attacks, plug adapters into separate sides of your laptop or use a powered USB hub" if both adapters are on the same USB controller or hub. R76 |
| D127 | 2026-06-03 | **Bulk operations — multi-select + floating action bar** — Recon table has checkbox column; when `selectedCount > 0`, floating action bar slides up from bottom: [Deauth Selected] [Capture PMKID Selected] [Export Selected]. For 40-AP engagements, single-row click is impractical. |
| D128 | 2026-06-03 | **SPA context preservation via Zustand-persisted UI state** — sort column, filter text, scroll offset, selected BSSID stored in global Zustand store (with `persist` middleware to localStorage); page navigation is seamless — table state restored exactly. Solves "I clicked Attacks, lost my Recon scroll position" |
| D129 | 2026-06-03 | **Focus Mode + toast debouncing/grouping** — Topbar toggle "🌙 Focus Mode" suppresses INFO and WARN toasts (events still flow to feed); ERROR toasts always shown; debounce: 5 handshakes in 2 s → one toast "5 new handshakes captured". Prevents top-right toast pile-up. R83 |
| D130 | 2026-06-03 | **Mobile responsive — bottom tab bar + bottom sheet** — `< 768px` viewport: 64 px sidebar collapses into a fixed bottom tab bar (Dashboard / Recon / Attacks / Evil Twin / More); 380 px right detail panel becomes full-screen bottom sheet that drags up from the bottom. "True Backpack Mode" — operator views UI on phone. R84 |

---

## 22. Glossary

- **AP**: Access Point
- **BSSID**: MAC address of an AP's radio
- **Monitor mode**: Raw frame capture
- **Injection**: Sending custom 802.11 frames

---

## 23. References & Further Reading

- aircrack-ng, hcxtools, hostapd, bettercap, scapy, FastAPI.
- **Companion docs in same folder** (single source of truth for respective sub-specs):
  - `Wcarck_competitor_analysis.md` v1.2 — bettercap 2.41.7 / airgeddon 12.0 / wifiphisher 1.4+ / wifite2 2.2.5
  - `wcarck_engineering_review.md` — 30+ code-level issues
  - `wcarck_plan_review.md` — 16 plan gaps + 5 risks + 5 questions
  - `wcarck_edge_cases_exceptions.md` — 22 edge cases across 8 categories (source of truth for §28)
  - `wcarck_ui_ux_design.md` v1.0 — full UI/UX design spec, 50 KB / 1522 lines (source of truth for §29; Wcarck.md §29 is the summary + non-negotiable decisions)
  - `FinalVerdict.md` — 8 KB / 255 lines; cross-correlation of all docs + 32 unknown-unknowns; identifies 4 critical showstoppers (Final Verdict §2.1-2.4) and 28 other gaps; the "unknown unknowns" doc. Wcarck.md §30 is the summary + 4 showstopper fixes + V1/V2 split

---

## 24. Changelog

- MVP engineering model defined
- DB schema, API surface, project structure all sketched
- Awaiting Ubuntu boot diagnostics to close install.sh details

### v0.1.1 — 2026-06-03 (Planning Phase — scope revision)
- All pictographic emojis removed from the document; status markers now use ASCII (`[+]`, `[-]`, `[~]`, `[OK]`)
- **Password cracking** moved from non-goals into V1 scope (Phase 6) as an opt-in `CrackEngine`:
  - `crack_jobs` table added to the DB schema
  - `/api/crack/*` REST endpoints added
  - `crack.job.*` WebSocket events added
  - Phase 6 roadmap items updated
  - Decision D18 logged
- **Persistent implants** and **Remote C2** recorded as out-of-scope decisions (D19, D20)
- New **Section 25 — V2 Future Vision** added for bounded product ideas only
- Decisions D18, D19, D20, D21 logged

### v0.1.2 — 2026-06-03 (Planning Phase — competitor analysis synthesis)
- Cloned and analyzed **bettercap 2.41.7**, **airgeddon 12.0**, **wifiphisher 1.4+**, **wifite2 2.2.5** (see `Wcarck_competitor_analysis.md` on the desktop for the full report)
- **Module & Plugin architecture** adopted from bettercap — `Module` + `Param` + `Handler` triad; event-bus spine; plugin discovery from `~/.wcarck/modules/*.py`
  - Phase 3 deliverables refined: burst deauth (64 frames, both directions, reason 7), DoS pursuit mode, 4-EAPOL validator with tshark+scapy cross-check, PMKID clientless attack, `.22000` export only
  - New **Section 26 — Module & Plugin Architecture** added
- **Captive portal templates** redesigned as wifiphisher-style template bundles (config.ini + html/ + static/) with XDG user-override; 7th `dialog_os` template added as stretch
- **Offline credential validation** (aircrack-ng against pre-captured handshake) is the default portal validator; alternative `wished_network` and `always_accept` modes documented
- **Per-session nftables chain naming** adopted from airgeddon; teardown is single `nft flush chain`
- **Captive-portal detection bypass** IPs (google.com, clients3.google.com, connectivitycheck.gstatic.com) moved to `config.toml` for easy refresh
- **ManagedProcess** (SIGINT → SIGTERM → kill cascade) from wifite2 wraps every external tool invocation
- New **Section 27 — Reference Tool Notes & Attribution** added with file-by-file upstream-to-downstream mapping
- Decisions D22, D23, D24, D25, D26, D27 logged

### v0.1.3 — 2026-06-03 (Planning Phase — architecture hardening)
- MVP definition tightened: success now includes validated credentials and evidence-backed PDF/JSON reporting, not only attack execution.
- Added control-plane/data-plane split, `RadioLeaseManager`, unified job lifecycle, teardown stack, and evidence pipeline to Section 6.
- Project structure aligned with module-first architecture: `core/`, `orchestration/`, first-class `modules/`, `evidence/`, and `plugins/` directories.
- Database schema extended with `resource_leases`, `job_queue`, `job_events`, `evidence_items`, `reports`, and `module_state`.
- API surface extended with `/api/jobs`, `/api/events`, `/api/resources/leases`, `/api/evidence`, and handler dispatch endpoints.
- Phase 1 re-ordered around module/job/event infrastructure; Phase 4 now ends with an evidence-backed MVP report.
- Plugin trust boundary, data retention policy, architecture contract tests, release acceptance gates, new risks R16-R20, open questions Q14-Q17, and decisions D28-D32 added.
- MITM-style modules demoted to third-party/plugin-only and disabled by default in V1.

### v0.1.4 — 2026-06-03 (Planning Phase — MVP trim + flaw review)
- Removed legal-heavy initial release work: consent wizard, authorization template, jurisdiction-specific legal references, retention policy, full evidence registry, and PDF/JSON report generation are deferred to Phase 5.
- Renamed Section 12 from Security & Legal Model to MVP Engineering Model.
- Kept minimal engineering controls: target boundary, localhost-only control surface, append-only session log, and disabled-by-default plugins.
- MVP success changed from "generate evidence-backed report" to "download validated artifacts and logs".
- Decisions D8, D17, D18, D30, D31 updated; D33 added.

### v0.1.5 — 2026-06-03 (Planning Phase — Engineering-only MVP trim)
- Section 12 renamed to **MVP Engineering Model** and trimmed: plain HTTP, no login, no TLS, plain-text credentials, basic append-only `session_log`, no chained-hash audit in MVP.
- All hardening (TLS, RBAC, encryption at rest, chained-hash audit, retention, signed plugin marketplace) explicitly listed as **deferred to post-MVP hardening**.
- First-run wizard requires an active scope before any attack module is invokable (`403 NoActiveScope` on missing scope).
- Section 19 condensed to 5 core risks; Section 20 condensed to 2 open questions; Section 21 condensed to 3 most-recent decisions.
- Phase 4 captive portal condensed to 6 templates (no `dialog_os` stretch); offline aircrack validator is the default.

### v0.1.6 — 2026-06-03 (Planning Phase — engineering-review + plan-review integration)
- **Phase 3 / engineering-review blockers absorbed:**
  - `ManagedProcess` now requires concurrent stdout/stderr drain (single `DEVNULL` deadlocks at ~64 KB on hostapd/dnsmasq/airodump).
  - scapy capture uses `AsyncSniffer`; `sendp` wrapped in `asyncio.to_thread`. No more blocking calls on the event loop.
  - `hcxdumptool` stop uses SIGTERM (not SIGINT) for clean pcapng flush — `ManagedProcess` per-tool override.
  - 4-EAPOL validator branches on `.22000` line prefix (`WPA*01` PMKID vs `WPA*02` EAPOL); per-`(BSSID, client)` pair, not per-BSSID.
  - `hostapd` readiness via `AP-ENABLED` log poll (not `sleep N`); `dnsmasq` waits for AP iface IPv4 before binding.
  - `RadioTap()` header mandatory on every injected frame.
  - `rt2800usb` burst throttle: 1 ms between frames (~64 ms total per 64-frame burst).
- **Phase 4 / engineering-review blockers absorbed:**
  - Android CNA probe `/generate_204` returns `204 No Content`; `/hotspot-detect.html`, `/connecttest.txt` added for iOS/Windows.
  - `clients3.google.com/generate_204` returns `302` redirect (NOT `200` — Android flags a 200 as "not captive" and roams).
  - iOS captive probes (`captive.apple.com`, `www.apple.com`, `www.apple.com.edgekey.net`) added to dnsmasq captive-bypass block.
  - `aircrack-ng` validator wrapped in `ManagedProcess` with 10 s hard timeout, runs in `asyncio.to_thread`.
  - nftables dry-run via `nft -c -f`; per-session table `inet wcarck_et_<id>`; teardown is `nft delete table` (never `nft flush ruleset`).
  - PMF / 802.11w awareness: deauth engine detects `RSN mgmt_frame_protection=1` in original AP beacon and falls back to client-side L2.
- **systemd / install.sh / engineering-review blockers absorbed:**
  - `CAP_SYS_ADMIN` dropped from production unit (D35). CI override at `ops/ci/wcarck-ci.service.d/override.conf` only.
  - `setcap cap_net_raw,cap_net_admin=+ep` re-applied by `install.sh` after every pip upgrade (R12). Never `cp` the binary.
  - `systemd-resolved` DNS stub disabled on `wlan_ap` via `/etc/systemd/resolved.conf.d/wcarck.conf` and a per-link drop-in (R13). Without this, `dnsmasq` cannot bind :53 on Ubuntu 24.04.
  - `install.sh` step 1 checks `ss -tln 'sport = :8080'` and aborts on collision (R9). Override envvar `WCARCK_PORT=9090`.
- **Section 19 expanded** from 5 to 15 risks (R6-R15 added — RF-LEAK, MANAGED-NETWORK-KILL, LOG-GROWTH, PORT-8080, DEVICE-FINGERPRINT, .22000 PMKID, setcap stickiness, systemd-resolved, PMF deauth, scapy blocking).
- **Section 20 expanded** from 2 to 7 open questions (PMKID cache retention, Hotspot 2.0, EAP-TLS enterprise, multi-operator audit, plugin API version compatibility).
- **Section 21 expanded** with D35-D42 (8 new decisions covering systemd hardening, `ManagedProcess` per-tool overrides, scapy async patterns, validator branching, captive-portal paths, DNS stub, PMF, plugin version gate).
- **Section 26.7** removed `ReportModule` from built-in priority list (deferred in v0.1.4 trim; will return when Phase 5 report generation comes back into scope).
- Duplicate metadata block and duplicate Table of Contents (lines 57-91 in v0.1.5) collapsed — only the canonical block remains.
- **Section 9 schema fixes (plan-review §2.2-2.4 + engineering-review §4.1-4.2):**
  - `captures` table gained `sha256 TEXT NOT NULL` (computed at write, verified at export)
  - `attack_sessions` slimmed: dropped `status`/`started_at`/`ended_at`/`error_msg` (redundant with `job_queue`); added `job_id INTEGER NOT NULL REFERENCES job_queue(id)`; index `idx_attack_sessions_job` added
  - `credentials` table reserved `kdf_salt BLOB` + `kdf_params TEXT` for the post-MVP encryption rollout; algorithm pinned to AES-256-GCM (data) + Argon2id(m=64MB, t=3, p=4) (KEK); columns nullable in MVP
  - New **§9.1 Connect-time PRAGMAs and buffered writes** — `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`, `mmap_size=256MB`; `ScanModule` debounces updates over a 2 s window to prevent WAL stalls
  - New **§9.2 `config.toml` schema** — full runtime config spec at `/etc/wcarck/config.toml` covering control plane, database, adapters, leases, captive portal (with detection-bypass IPs), attack defaults, plugin trust, and audit retention; single source of truth for runtime knobs
  - Section 6 deauth data-flow text updated to match: `job_queue` first, `attack_sessions` references it via FK, `ManagedProcess` per-tool stop override for `hcxdumptool` (D36)
- **Section 6 lease / event-bus hardening (engineering-review §5-§6, plan-review §2.7-2.8, §2.10):**
  - Architecture capabilities line at line 325 fixed (was still showing `CAP_SYS_ADMIN`; D35)
  - **Radio lease manager** sub-section expanded with: per-adapter lock (not global), TTL + heartbeat, orphan sweep on startup, injection-test pre-flight, `HandshakeCaptureModule` requires `monitor.locked` (not `monitor.scan`), PMF-aware deauth denials (D41), RTL8821AU 5 GHz + AP mode constraint (plan-review §2.7)
  - **EventBus** sub-section §26.4 expanded with: `_subs` snapshot during fan-out (§5.1), per-listener `recover()` on `QueueFull` (§5.2), `event.bus.dropped` counter surfaced for the UI
- **Section 11 Phase 3 RTL8821AU channel change** — added the `ip link set down` → `iw set channel` → `ip link set up` sequence (engineering-review §3.2)
- **Section 10 WebSocket endpoint** — added `try/except WebSocketDisconnect` and exponential-backoff reconnect note
- **Section 7 Frontend correctness** — new sub-section with WebSocket reconnect, Zustand BSSID-keyed records, `useEffect` cleanup, deauth run-id binding (engineering-review §10)
- **Section 8 Project Structure** — added `frontend/src/routes/Crack.tsx` (plan-review §2.13, Phase 6)
- **Section 18 Testing Strategy** — Layer 2 expanded with `pytest-mac80211_hwsim` and the per-Phase demo reproducibility note
- **Section 15 Installation Flow** — fixed the wrong cross-reference (was `R-PORT-8080` / `D40`; now correctly `R12` / `D35`)
- **Section 25.4 added** — "Borrowed features (V2 candidates, from competitor review)" with: Pwnagotchi-pulse-style beaconing, wifite2 auto-resume-on-new-monitor-iface, bettercap caplet-style session replay, airgeddon internet-sharing toggle (with the MASQUERADE allow-list footnote)

### v0.1.6 (continued) — 2026-06-03 (Planning Phase — edge-case + exception-handling integration)

Companion: `wcarck_edge_cases_exceptions.md` (the 22-item catalog with code
patterns). All 22 items are owned by a D## in §21 with a known mitigation
in §28.

- **New Section 28 added** — "Edge Cases & Exception Handling" with 9
  sub-sections (foundational philosophy, hardware failure, subprocess
  lifecycle, asyncio structured concurrency, SQLite resilience, RF/protocol,
  Evil Twin race conditions, state machine, observability) + a 22-row
  severity-ranked summary table
- **Section 19 expanded** from 15 to 38 risks (R16-R38) — adapter unplug,
  kernel oops, USB bus reset, MAC random, DKMS silent fail, grandchild
  processes, airodump-ng CSV format change, hashcat GPU segfault, empty RF,
  WAL recovery, disk full, SQLite CORRUPT, AP band switch, WPA3-SAE,
  802.11r FT, client randomized MAC, AP offline mid-capture, concurrent
  portal submissions, double-submit, DHCP pool exhaustion, Evil Twin
  MAC spoof, interrupted mode switch, priority inversion (V2)
- **Section 21 expanded** with D43-D74 (32 new decisions) — three-category
  failure model, AdapterWatchdog, driver recovery, per-adapter recovery
  lock, MAC random mitigation, DKMS post-build verify, `_kill_process_tree`,
  CSV header validation, hashcat exit-code map, CSV liveness watchdog,
  TaskGroup, AsyncExitStack, CircuitBreaker, retry_with_backoff, WAL
  recovery, disk space check, SQLite CORRUPT recovery, Alembic
  per-migration atomicity, AP band-change detection, WPA3-SAE, 802.11r
  FT-PSK, client randomized MAC, AP-offline-during-capture, portal
  validator semaphore, per-client submission lock, DHCP lease time 2m,
  Evil Twin MAC spoof, mode verification on lease acquire, priority
  preemption (V2), structured log fields, event tag catalog,
  `doctor.sh --postmortem`
- **Section 8 Project Structure** — new files: `core/watchdog.py`,
  `core/result.py`, `core/circuit_breaker.py`, `core/retry.py`,
  `core/db.py`, `radio/watchdog.py`, `radio/driver_recovery.py`,
  `radio/mode_verify.py`, `radio/akm.py`, `radio/mac_spoof.py`,
  `portal/submission_lock.py`, `portal/dhcp_watchdog.py`
- **Section 11 Phase 1** — new deliverables: `core/result.py`,
  `core/circuit_breaker.py`, `core/retry.py`, `core/db.py`,
  `radio/watchdog.py`, `radio/driver_recovery.py`, `radio/mode_verify.py`,
  Alembic `transaction_per_migration=True`, `dkms status` post-build check,
  `psutil` dependency, `doctor.sh --postmortem`
- **Section 11 Phase 2** — implied: AKM-suite parser for scan-time WPA3/FT
  detection (§28.5)
- **Section 11 Phase 3** — implied: `_kill_process_tree` in
  `ManagedProcess.stop()` (D49); CSV header validation in
  `AirodumpCSVParser` (D50); CSV liveness watchdog in `ScanModule` (D52)
- **Section 11 Phase 4** — implied: `Semaphore(1)` in `OfflineValidator`
  (D66); per-client submission lock (D67); DHCP 2 m lease (D68); Evil
  Twin MAC spoofing (D69); `AsyncExitStack` in `EvilTwinModule.run()`
  (D54)

### v0.1.6 (continued 2) — 2026-06-03 (Planning Phase — aircrack-ng review integration)

Companion: cloned `aircrack-ng` at `C:\Users\PARIKS~1\AppData\Local\Temp\opencode\aircrack-ng`
(reference; not committed). Cross-tool comparison: aircrack-ng 1.7/1.8,
bettercap 2.41.7, wifite2 2.2.5, wifiphisher 1.4+, airgeddon 12.0,
hcxdumptool, hashcat. Of 8 proposed findings (D75-D82), 5 were revised
(EAPOL timeout, validator pre-check, rfkill auto-unblock) and 2 new
(D83 scan-mode MAC, D84 validator 30 s) emerged from cross-tool review.

- **Section 19 expanded** from 38 to 48 risks (R39-R48) — 4-EAPOL timeout
  too aggressive (5 s aircrack default rejected, Wcarck uses 30 s/5 s);
  validator silent succeed on PMKID-only `.cap` (now fixed by tshark
  pre-check); single VIF per adapter (now per-phy); rfkill soft-block;
  NetworkManager reclaims `wlan0`; deauth reason code unspecified;
  5 GHz DFS with country 00; airodump CSV leading `\r\n`; scan-mode
  MAC leaks operator identity; 10 s validator timeout false negatives
- **Section 21 expanded** with D75-D84 (10 new decisions):
  - **D75** EAPOL timeout constants revised (30 s/5 s online, no-timeout
    offline pcap scan, M2+M3 minimum crackable)
  - **D76** tshark pre-check before aircrack-ng validator (50 ms,
    returns `{pmkid, eapol_count, has_m2_m3}` for UI badge)
  - **D77** Per-phy lease model — RTL8821AU hosts `wlan_ap` + `wlan_mon`
    on the same phy via `iw phy phyX interface add` (industry-leading,
    tied with bettercap only)
  - **D78** rfkill poll in AdapterWatchdog; auto-unblock gated on
    `auto_unblock_rfkill: true` in `config.toml`
  - **D79** install.sh masks NetworkManager + wpa_supplicant +
    avahi-daemon at install time (race-free; ahead of all 4 reference
    tools which kill-on-demand)
  - **D80** deauth reason codes explicit — `rc=7` broadcast, `rc=1`
    directed; exposed as `--deauth-rc` in UI
  - **D81** regulatory domain check via `iw reg get`; DFS channel +
    country 00 → refuse lease (tied with airgeddon)
  - **D82** airodump-ng CSV header pin (leading `\r\n` literal)
  - **D83** scan-mode MAC randomization via `macchanger -A`; real MAC
    on capture-attack mode; opt-out via `randomize_scan_mac: false`
  - **D84** portal validator timeout 30 s default (was 10 s),
    configurable to 300 s; timeout status is `inconclusive`, not
    `failed`
- **Section 8 Project Structure** — new files: `radio/regulatory.py`
  (D81), `radio/rfkill.py` (D78), `portal/mac.py` (D83),
  `portal/validators/tshark_precheck.py` (D76); existing
  `radio/watchdog.py` comment now includes rfkill check; existing
  `portal/validators/aircrack.py` comment now includes 30 s timeout
  (D84); `orchestration/leases.py` comment now mentions per-phy
- **Section 11 Phase 1** — new deliverables: `radio/regulatory.py`,
  `radio/rfkill.py`, `portal/validators/tshark_precheck.py`,
  `portal/mac.py`; `macchanger` apt dep; `install.sh` step 0 masks
  NetworkManager + wpa_supplicant + avahi-daemon (D79); 4-EAPOL
  validator with 30 s/5 s timeouts (D75); validator timeout
  configurable (D84); `doctor.sh` adds `iw reg get` country-code
  warn (D81)
- **Section 11 Phase 3** — implied: per-phy leases enable simultaneous
  AP + monitor on RTL8821AU; tshark pre-check before `.22000` export

### v0.1.6 (continued 3) — 2026-06-03 (Planning Phase — UI/UX design integration)

Companion: `wcarck_ui_ux_design.md` (50 KB / 1522 lines / v1.0). The
companion is the source of truth for tokens, ASCII layouts, and code
samples; Wcarck.md §29 is the summary + non-negotiable decisions.

- **New Section 29 added** — "UI/UX Design Specification" with 9
  sub-sections: 4-pillar philosophy (§29.0), design system tokens
  (§29.1), 3-zone master layout (§29.2), 8-page inventory (§29.3),
  micro-interactions (§29.4), 8 self-corrections (§29.5), performance
  budget (§29.6), accessibility (§29.7), Phase-1 design-system
  deliverables (§29.8)
- **Section 19 expanded** from 48 to 58 risks (R49-R58) — table
  virtualization needed, color-blind status, sidebar auto-expand
  jitter, deauth modal friction, panel toggle confusion, action bar
  wasted space, signal bar ambiguity, mode switch spinner opacity,
  "AI Bundle" label confusion, DFS channel warning missing
- **Section 21 expanded** with D85-D100 (16 new decisions):
  - **D85** 4-pillar philosophy (Power / Dense / 3-Click / Alive)
  - **D86** 3-zone layout (topbar 48 px + sidebar 64/220 px +
    content + contextual panel 380 px)
  - **D87** sidebar pin-toggled, never auto-expand on hover
    (self-correction 1)
  - **D88** deauth has no confirmation modal; Evil Twin does
    (self-correction 2)
  - **D89** network detail panel persistent — only ×/Esc closes
    (self-correction 3)
  - **D90** guided action bar only on first launch OR no jobs in
    24 h (self-correction 4)
  - **D91** Evil Twin Step 3 keeps the full launch confirmation
    modal
  - **D92** mode switch shows 4-step progress indicator
    (self-correction 6)
  - **D93** "Copy Debug Report" button, not "Export AI Bundle"
    (self-correction 7)
  - **D94** 5 GHz DFS channels visually separated with ⚠ marker
    (self-correction 8; D81 backing)
  - **D95** design tokens location — `frontend/src/styles/index.css`,
    Tailwind binds via `theme.extend`, shadcn/ui with custom theme
  - **D96** `@tanstack/react-virtual` for tables > 20 rows
  - **D97** WebSocket → UI update < 50 ms (Zustand direct, no React
    context cascade); 13-term tooltip coverage
  - **D98** signal strength shows BOTH bars and dBm number
    (self-correction 5)
  - **D99** WCAG AA accessibility; status indicators use shape + color
    (not color-only); axe-core in e2e
  - **D100** command palette (Ctrl+K, VS Code-style fuzzy search)
- **Section 8 Project Structure** — `frontend/src/components/`
  gained 16 new files: `SignalBars.tsx` (D98), `EapolProgress.tsx`,
  `EncryptionBadge.tsx`, `PmfIndicator.tsx`, `Tooltip.tsx` (D97),
  `Toast.tsx`, `ConfirmModal.tsx` (D88), `EmptyState.tsx`,
  `CommandPalette.tsx` (D100), `ModeSwitchSteps.tsx` (D92),
  `ChannelDropdown.tsx` (D94), `WelcomeOverlay.tsx` (D90),
  `shell/{Topbar,Sidebar,ContentZone,ContextualPanel}.tsx`;
  `frontend/src/styles/` gained `index.css` (D95) alongside
  `globals.css`; `frontend/src/lib/` gained `tooltips.ts` (13-term
  text) and `a11y.ts` (axe-core helpers, focus management)
- **Section 11 Phase 1** — +11 new design-system deliverables:
  `frontend/src/styles/index.css` + Tailwind config + shadcn theme
  (D95); 3-zone layout shell; 7 reusable primitives (Tooltip, Toast,
  ConfirmModal, EmptyState, CommandPalette, ModeSwitchSteps,
  ChannelDropdown, WelcomeOverlay); `AdapterCard` 6-state
  visualization; `SignalBars` + `EapolProgress` components;
  `lib/tooltips.ts`; `lib/a11y.ts`; Playwright + axe-core e2e
  scaffolding; visual-regression snapshots for the 4 main pages
- **Section 18 Testing Strategy** — Layer 3 expanded from "Playwright
  e2e" to 14 specific UI tests: axe-core WCAG AA, visual regression
  pixel-diff, keyboard navigation, WebSocket event latency < 50 ms,
  FCP/TTI/table-render budgets, sidebar pin persistence, network
  panel persistence, deauth no-modal, guided action bar timing,
  signal bars+number display, mode switch 4-step indicator, "Copy
  Debug Report" label, DFS dropdown warning, toast queue + max 3 +
  error persistence, 13-term tooltip coverage
- **Section 23 References** — added explicit cross-references to all 5
  companion docs (competitor analysis, engineering review, plan
  review, edge cases, UI/UX design) with sizes and source-of-truth
  semantics for each

### v0.1.6 (continued 4) — 2026-06-03 (Planning Phase — Final Verdict integration)

Companion: `FinalVerdict.md` (8 KB / 255 lines). 4 critical showstoppers
addressed in D101-D104; 8 existing decisions refined (D35/D41/D49/D57/D77/D79/D81/D94);
30 new decisions (D101-D130) cover protocol/storage/UX gaps; 2 deferred
to V2 (D131 topology, D132 client report); 27 new risks (R59-R85).

- **New Section 30 added** — "Final Verdict Integration" with 5
  sub-sections: architectural readiness (90/100), 4 critical
  showstoppers, 8 refinements to existing decisions, 30 new V1
  decisions (V1/V2 split), 5-step implementation rollout from
  FinalVerdict §9
- **Section 19 expanded** from 58 to **85 risks** (R59-R85) — NM
  conflict, CRDA blocking, FastAPI-as-root, system suspend, browser
  autoplay, sunlight readability, storage bloat, VM USB flakiness,
  RTL8821AU MAC random, DoH/DoT bypass, SD card I/O stall, WPA3
  deauth immunity, Docker netlink, DFS CAC, DHCP subnet collision,
  HSTS 443, WS state replay, USB power brownout, process fork
  escape, FD exhaustion, IPv6 leak, WAL starvation, GIL blocking,
  thermal throttle, toast spam, mobile viewport, no client report
- **Section 21 expanded** with D101-D130 (30 new decisions) and 8
  refinements to existing decisions:
  - **D101** NM `unmanaged-devices` (revises D79) — keeps uplink alive
  - **D102** `iw reg set BO` on startup (revises D81)
  - **D103** Unprivileged `wcarck` user + sudoers NOPASSWD whitelist
  - **D104** DBus `PrepareForSleep` listener
  - **D105** DoH/DoT nftables drop on `wlan_ap`
  - **D106** tmpfs staging for raw `.pcapng` writes
  - **D107** DHCP subnet collision auto-shift
  - **D108** HSTS — never intercept port 443
  - **D109** WebSocket state replay on reconnect (F5 problem)
  - **D110** IPv6 drop on `wlan_ap` + dnsmasq IPv6 sinkhole
  - **D111** WAL 5-min PASSIVE checkpoint
  - **D112** `ProcessPoolExecutor` for heavy CPU
  - **D113** Process groups via `start_new_session=True`
  - **D114** Track adapters by USB bus path, not MAC
  - **D115** Bare metal only, no Docker containerization
  - **D116** WPA3/OWE — passive PMKID only, no deauth
  - **D117** Channel race preemption in `RadioLeaseManager`
  - **D118** DFS CAC 60s wait via `hostapd.ap_enabled`
  - **D119** Thermal pulsed bursts in DeauthModule
  - **D120** Clock skew — `time.monotonic()` for math
  - **D121** Audio alerts via Web Audio API (Backpack Mode)
  - **D122** High-contrast light mode toggle
  - **D123** Asset drag-drop (wordlists + portal templates)
  - **D124** Storage retention (7 d pcapng, 30 d session_log)
  - **D125** VM USB flakiness hint (`adapter.flaky_usb`)
  - **D126** USB bus power brownout warning
  - **D127** Bulk operations (multi-select + floating action bar)
  - **D128** SPA context preservation via Zustand `persist`
  - **D129** Focus Mode + toast debouncing/grouping
  - **D130** Mobile responsive (bottom tab bar + bottom sheet)
  - **D131, D132** V2 (topology graph view, client report)
- **8 existing decisions refined:**
  - D35: + `User=wcarck`/`Group=wcarck` + `LimitNOFILE=65536` (D103, R78)
  - D41: + per-client enforcement — disable Deauth for WPA3 clients (D116, R70)
  - D49: + process groups via `start_new_session=True` (D113, R77)
  - D57: + 5-min PASSIVE checkpoint task (D111, R80)
  - D77: + channel race preemption + USB-bus-path tracking (D114, D117, R67)
  - D79: **REPLACED** by D101 (NM `unmanaged-devices`, NOT mask)
  - D81: **REPLACED** by D102 (`iw reg set BO`, NOT check-only)
  - D94: + DFS CAC 60s wait (D118, R72)
- **Section 8 Project Structure** — new `packaging/systemd/NetworkManager-conf/`
  and `packaging/sudoers/` directories; `wcarck.service` comment now
  mentions `User=wcarck` + `LimitNOFILE=65536`; `install.sh` comment
  mentions `iw reg set BO`
- **Section 11 Phase 1** — +24 new deliverables: 7 backend modules
  (`core/system/{sleep,process_group}.py`, `core/executor.py`,
  `core/db_checkpoint.py`, `core/captures.py`, `radio/usb_path.py`,
  `vm_usb_hint.py`), 3 Evil Twin / portal modules
  (`portal/{subnet_detect,do_h_block,hsts_443_reject}.py`), 2 deauth
  modules (`deauth/{thermal,wpa3_filter}.py`), 1 WS module
  (`ws/state_replay.py`), 8 frontend components/hooks/styles
  (`useAudioAlerts.ts`, `light-mode.css`, `BulkActionBar.tsx`,
  `BottomTabBar.tsx`, `BottomSheet.tsx`, `FocusMode.tsx`,
  `AssetsTab.tsx`, `uiState.ts`, `usbPower.ts`), `wcarck.service` +
  sudoers file + NM conf + tmpfs staging + WAL checkpoint
- **Section 23 References** — added `FinalVerdict.md` (8 KB / 255 lines)
  as 6th companion doc with "unknown unknowns" framing
- **Net plan totals (cumulative across all v0.1.6 passes):** 130
  decisions, 85 risks, 32 sections, 200+ KB / 3100+ lines
- **Final Verdict §9 implementation rollout (5 steps) adopted** as
  the official Phase 1 build order; closes the planning phase

### Next checkpoint — Exit Plan Mode → v0.2.0
- Repo scaffolded
- Phase 1 implementation begins (re-ordered: Day 1-2 = module core, NOT basic scaffold)
- This doc updated with anything that changes during scaffolding

---

## 25. V2 Future Vision (Post-MVP, Sketch Only)

> **Status:** Architectural intent only. Not scheduled, not sized, not in V1 scope.
> Captured here so V1 design choices (DB schema, API surface, audit log shape,
> threat model) don't paint V2 into a corner.

V1 ships as a single-operator, localhost-only, scope-enforced Wi-Fi audit
tool. V2 should deepen that product instead of expanding into unrelated
endpoint access or remote-control tooling.

### 25.1 Candidate V2 capabilities

- **Multi-engagement profiles** — separate scopes, evidence, retention rules,
  report templates, and audit chains per client/project.
- **Signed plugin marketplace** — curated module index, GPG signatures,
  maintainer trust levels, dependency checks, and install rollback.
- **Fleetless sensor mode** — optional ESP8266/ESP32 satellite sensors for
  passive beacon/probe observation only; no remote attack dispatch.
- **Advanced WPA-Enterprise auditing** — EAP identity capture, certificate
  posture checks, and reportable misconfiguration findings.
- **RF survey tooling** — channel utilization, roaming observations, RSSI
  timelines, and exportable heatmap evidence.
- **Textual TUI** — terminal mirror of the event stream for SSH/headless use.

### 25.2 Permanent non-goals

- No persistent implants on client devices.
- No remote C2, internet dashboard, relay service, NAT traversal, or beaconing.
- No multi-tenant SaaS mode.
- No covert exfiltration channel. Captured data stays on the operator host
  unless the operator explicitly exports an evidence bundle.
- No automatic targeting outside the active scope, including plugins.

### 25.3 Re-entry criteria for V2

Before starting V2 work, V1 must have:

- Shipped at least one tagged release.
- Survived at least one complete lab session with validated artifacts.
- Produced a post-mortem identifying concrete operator pain points.
- Passed session-log, artifact-hash, target-boundary, and radio-lease release
  gates.

### 25.4 Borrowed features (V2 candidates, from competitor review)

These are concrete features the engineering review flagged in the four
reference tools. They are recorded here so V1's job/state schema and
module contract don't paint V2 into a corner. None of them are V1 scope.

- **Pwnagotchi-pulse-style beaconing** *(from Pwnagotchi 2.0 "adventure"
  loop, the Pwnagotchi project's own design)*. Replace the
  continuous-channel scan with a periodic "pulse" — N seconds of
  full-band scan, then sleep, then N seconds on a target BSSID for
  re-association attempts. The Pwnagotchi authors measured ~30 %
  more handshakes per hour on a busy day with this rhythm versus a
  continuous scan, because clients re-probe after a brief silence.
  The pulse window and the per-target dwell are the two new params
  on `ScanModule`. V1 ships continuous scan; the pulse is opt-in.
- **Auto-resume on new monitor interface** *(from wifite2 2.2.5,
  `wifite.py:241-258`)*. If a long-running scan is interrupted by
  the monitor radio disappearing (USB hiccup, driver reload, kernel
  suspend), and a new monitor interface appears within `resume_grace_s`
  (default 30 s) on the same `(chipset, driver)` signature, the
  scan job auto-resumes on the new interface and logs the swap in
  `session_log`. V1 expects the operator to click "Resume" manually.
- **Caplet-style session replay** *(from bettercap 2.41.7 caplets,
  e.g., `caplets/http-req-dump.cap`)*. A `wcarck session record` CLI
  command writes a JSONL of every event-bus publish and every handler
  dispatch, with the full module/params context. `wcarck session
  replay <file>` then re-runs the same handler sequence in a sandbox
  scope against a synthetic target (hwsim fixture). The caplet format
  is intentionally line-oriented and shell-pipeable. Useful for
  regression tests and for "let me show you what I did" customer
  reports. V1 has no session replay.
- **Internet-sharing toggle** *(from airgeddon 12.0,
  `airgeddon.sh:10742-10790`)*. A second Evil Twin mode
  (`ap.service.internet`) where the AP NATs the victim traffic out
  through `wlan_uplink` instead of sinkholing. The dnsmasq chain is
  extended with a MASQUERADE on `wlan_ap → wlan_uplink` and the
  captive portal only intercepts credential-bearing POSTs (the
  aiohttp server uses a regex allow-list, not a wildcard NAT). The
  social-engineering use case is "let the victim actually browse so
  they enter the WPA password for 'router_update' thinking they are
  configuring the network". V1 only ships the captive-only mode.
  Adding MASQUERADE without the allow-list is the airgeddon
  footgun we explicitly are not repeating.

---

## 26. Module & Plugin Architecture

Wcarck's attack surface is organized as a **module registry**. Every
attack, capture, or service is a `Module` subclass with declarative
parameters, regex-validated command handlers, and lifecycle hooks. The
shape is adopted from bettercap's `session/module.go:16-29` triad, with
Wifiphisher's extension class contract (`common/extensions.py:35-69`)
as a secondary inspiration.

### 26.1 The Module contract

```python
class Module(Protocol):
    name: str                                   # e.g. "wifi.deauth"
    description: str
    parameters: list[ModuleParam]
    handlers: list[ModuleHandler]
    running: bool
    async def start(self) -> None: ...
    async def stop(self) -> None: ...
    async def on_event(self, event: Event) -> None: ...

class ModuleParam(BaseModel):
    name: str
    kind: Literal["string", "int", "float", "bool", "mac", "ip"]
    default: Any
    validator: str | None = None                # regex or function name
    description: str
    resolves_at: Literal["startup", "runtime"] = "startup"

class ModuleHandler(BaseModel):
    name: str                                   # e.g. "wifi.deauth BSSID"
    regex: str                                  # e.g. r"wifi\.deauth ([a-fA-F0-9:]{11,})"
    description: str
    # optional: pre-hook, post-hook, replace-hook (airgeddon pattern)
```

### 26.2 Built-in modules (V1)

| Module | Purpose |
|---|---|
| `AdaptersModule` | Interface discovery (pyroute2 + udev), mode switching, channel control, MAC spoofing |
| `ScanModule` | Wraps `airodump-ng` CSV stream, populates `networks` and `clients` tables |
| `DeauthModule` | Burst deauth (64 frames, both directions, reason 7) + DoS pursuit mode + handshake auto-stop |
| `HandshakeCaptureModule` | `hcxdumptool` + 4-EAPOL validator (tshark + scapy cross-check) + `.22000` export |
| `PMKIDCaptureModule` | Clientless association attack, harvests PMKID from EAPOL-Key M1/4 |
| `EvilTwinModule` | Orchestrates hostapd + dnsmasq + per-session nftables chain |
| `CaptivePortalModule` | Template bundle manager, aiohttp server, offline aircrack validator |
| `CrackModule` (Phase 6) | hashcat/john wrapper, GPU/CPU auto-detect, live progress over WebSocket |
| `AuditModule` | Subscribes to the event bus, writes chained-hash log |
| `APIRESTModule` | Auto-registers FastAPI routes from registered modules' `handlers` |

### 26.3 Plugin discovery and trust

Third-party modules are dropped into `~/.wcarck/modules/<name>.py`. Each
must expose a top-level `register(registry: ModuleRegistry) -> None`
function. The loader:
1. Imports the module in a sandboxed subprocess (no global state leak).
2. Calls `register()`, which adds the module's `Module` instance to the
   registry.
3. The registry validates the module exposes at least one handler and
   one parameter.
4. The module starts in `disabled` state — operator must explicitly
   enable it from the UI (or `wcarck plugin enable <name>` on the CLI).

**Trust boundary:** plugins run in-process, no OS-level sandbox. A
malicious plugin has the same privileges as the Wcarck service. Therefore:
- Phase 6 stretch item Q11 (GPG-signed modules + public-key registry) is
  the planned mitigation.
- V1 ships a curated set of built-in modules only; user plugins are an
  advanced feature with prominent warning text in the UI.
- `docs/MODULES.md` (to be written) includes a security review checklist
  for plugin authors.

### 26.4 Event bus

The spine of the architecture. Adopted from bettercap's
`session/events.go:14-200`. Python implementation:

```python
class EventBus:
    def __init__(self, ring_size: int = 10_000):
        self._ring: deque[Event] = deque(maxlen=ring_size)
        self._subs: dict[str, list[asyncio.Queue[Event]]] = defaultdict(list)
    async def publish(self, event: Event) -> None: ...
    def subscribe(self, tag: str) -> asyncio.Queue[Event]: ...
    def replay_from(self, idx: int) -> list[Event]: ...
    # listener fan-out is non-blocking; a slow consumer drops messages
    # (bettercap uses recover() per listener; we use QueueFull catch)
```

Every module publishes events; the WebSocket endpoint subscribes; the
audit log subscribes to everything; the React UI subscribes to specific
tags. The `replay_from` method enables the React UI to recover state
after a tab refresh (sends all missed events since the last received
index).

#### EventBus correctness (engineering-review §5.1, §5.2)

- **Snapshot `_subs` during fan-out (engineering-review §5.1).**
  `publish()` does `for q in list(self._subs[event.tag])` — never iterate
  the live dict. A subscriber that unsubscribes (or a new one that
  subscribes) mid-fan-out must not cause `RuntimeError: dictionary
  changed size during iteration`. The audit-log subscriber unsubscribes
  during shutdown, so the race is reachable.
- **Per-listener recover on `QueueFull` (engineering-review §5.2).**
  The default behaviour on a slow consumer is `put_nowait` →
  `asyncio.QueueFull` → drop the event and increment a `dropped` counter
  on the queue object. A high-throughput subscriber (e.g., the WebSocket
  hub) can opt into a `recover()` callback that flushes its queue and
  re-queues, matching bettercap's per-listener recover. The default
  drop-and-count is what most subscribers want.
- **Dropped counter surfaced.** The WebSocket endpoint emits
  `event.bus.dropped {tag, queue_id, dropped_count}` so the React UI
  can warn the operator when it is falling behind.

### 26.5 Process lifecycle (`ManagedProcess`)

Adopted from wifite2's `util/process.py:153-184`. Every external tool
(airodump, aireplay, hcxdumptool, hostapd, dnsmasq, hashcat) is wrapped
in a `ManagedProcess` that:

1. Spawns via `asyncio.create_subprocess_exec`.
2. On stop: sends SIGINT, polls for 2s, falls back to SIGTERM, falls
   back to `proc.kill()`.
3. Tolerant of `OSError: No such process` (the child may have died).
4. Has a `__del__` safety net that sends SIGINT if the wrapper is GC'd
   without an explicit stop.

REST `/api/attacks/{id}/stop` is `await self.current_job.stop()`.
Prevents zombie hostapd processes leaking between runs.

### 26.6 Module execution rules

Modules are not allowed to mutate global adapter state directly. A module
handler receives a `JobContext` with:

- `job_id`, `scope_id`, `user_id`
- `event_bus`
- `audit_writer`
- `artifact_writer`
- `lease_manager`
- `settings`
- `stop_event`

The only supported way to start work is:

1. Validate handler parameters.
2. Re-check scope in the handler, even if the API dependency already did it.
3. Acquire required leases (`monitor.locked`, `ap.service`, `crack.compute`).
4. Push cleanup callbacks onto the teardown stack.
5. Publish state events through the event bus.
6. Register artifacts through the artifact writer.
7. Release leases in reverse order, even on cancellation.

This makes CLI, REST, WebSocket-triggered, and plugin-triggered jobs behave the
same way. There is no privileged "internal" execution path.

### 26.7 Built-in module priority

V1 built-ins must ship in this order:

1. `AdaptersModule`
2. `ScanModule`
3. `DeauthModule`
4. `HandshakeCaptureModule`
5. `PMKIDCaptureModule`
6. `EvilTwinModule`
7. `CaptivePortalModule`
8. `AuditModule`
9. `APIRESTModule`
10. `CrackModule` (Phase 6)

`ReportModule` (PDF/JSON evidence-backed reporting) was promoted in
v0.1.3 and re-deferred in v0.1.4; it will be added here when Phase 5
report generation comes back into scope. Karma/MANA remains a
supported advanced Wi-Fi module, but high-risk MITM/browser-hook
extras are third-party/plugin-only in V1 and never enabled by default.

---

## 27. Reference Tool Notes & Attribution

Wcarck V1 incorporates code patterns and architectural ideas from the
following open-source tools, all of which are GPL-2 or GPL-3 licensed
(compatible with Wcarck's GPL-3.0). The full attribution list is
maintained in the repo's `NOTICE` file. This section gives a summary.

### bettercap
- **Repo**: https://github.com/bettercap/bettercap
- **License**: GPL-3.0
- **Version referenced**: 2.41.7
- **What we adapted**:
  - `session/module.go:16-29` — `Module` interface (full file ~287 lines)
  - `session/module_param.go:24-94` — `ModuleParam` (full file)
  - `session/module_handler.go:22-77` — `ModuleHandler` (full file)
  - `session/events.go:14-200` — non-blocking event bus (full file)
  - `modules/wifi/wifi_deauth.go:13-29` — burst deauth pattern (17 lines)
  - `modules/wifi/wifi_assoc.go:13-25` — clientless PMKID association (13 lines)
  - `firewall/firewall_linux.go:114-122` — nftables `ExcludeAddress` (9 lines)
- **What we did NOT adapt** (intentionally):
  - The `goproxy` HTTPS MITM (`modules/http_proxy/`) — outside V1's Wi-Fi
    audit focus, modern HSTS preloading makes it unreliable
  - The Bluetooth / HID / CAN modules — out of V1 scope
  - The global `session.I` singleton — anti-pattern

### Airgeddon
- **Repo**: https://github.com/v1s1t0r1sh3r3/airgeddon
- **License**: GPL-3.0
- **Version referenced**: 12.0
- **What we adapted**:
  - `airgeddon.sh:13112-13125` — dnsmasq captive-portal config (14 lines)
  - `airgeddon.sh:11966-12015` — per-instance nftables chain naming (50 lines)
  - `airgeddon.sh:13474-13531` — offline aircrack credential validator (58 lines, the killer feature)
  - `airgeddon.sh:3950-3971` — handshake-capture auto-stop poll loop (22 lines)
  - `plugins/plugin_template.sh:45-96` — hook naming convention (52 lines, for V2 plugin trust work)
- **What we did NOT adapt**:
  - The 17,000-line monolithic bash file — unmaintainable
  - Bash CGI under lighttpd — CVE bait
  - The xterm/tmux windowing — replaced by React UI
  - The hardcoded base64 vendor logos — we ship a `templates/` tree

### wifiphisher
- **Repo**: https://github.com/wifiphisher/wifiphisher
- **License**: GPL-3.0
- **Version referenced**: 1.4+ (active commits in 2026)
- **What we adapted**:
  - `common/phishingpage.py:48-89` — template bundle spec (42 lines)
  - `common/phishinghttp.py:185-216` — HTTP server structure (32 lines, aiohttp rewrite)
  - `common/accesspoint.py:49-73` — dnsmasq captive-portal IPs (25 lines)
  - `common/extensions.py:35-69` — module class contract (35 lines)
  - `extensions/deauth.py:54-81` — deauth state machine (28 lines)
  - The `oauth-login` template's OS-chrome lookalike idea (as `dialog_os` template, not as a real OAuth flow)
- **What we did NOT adapt**:
  - The `roguehostapd` external fork — stock hostapd 2.10+ on Ubuntu 24.04
    with `enable_karma=1` covers our needs without a build dep
  - The `from scapy.all import *` pattern — explicit imports
  - The hardcoded Google IPs in source — moved to `config.toml`
  - The `kill_interfering_procs()` SIGKILL on NetworkManager — too aggressive

### wifite2
- **Repo**: https://github.com/derv82/wifite2
- **License**: GPL-2.0
- **Version referenced**: 2.2.5 (last commit 2018, repo is stale but
  patterns are still valid)
- **What we adapted**:
  - `util/process.py:153-184` — `ManagedProcess` SIGINT→SIGTERM→kill cascade (32 lines, the gold standard)
  - `tools/tshark.py:31-79` — 4-EAPOL state machine (49 lines)
  - `tools/dependency.py:4-15` — `ExternalTool` registry (12 lines)
  - `attack/all.py:42-105` — attack orchestrator with try/except ring (64 lines)
  - `model/target.py:13` — `Target` data model (1 class, 30 lines)
  - `model/result.py:40-67` — `CrackResult` with dedup (28 lines)
- **What we did NOT adapt**:
  - The blocking `while/poll` loops — replaced with `asyncio.create_subprocess_exec`
  - The hand-rolled ANSI TUI — replaced with React UI
  - The Pyrit dependency — unmaintained since 2018
  - The legacy hashcat modes (`-m 2500`, `-m 16800`) — only `-m 22000`
  - The single-card assumption — we have 3 radios by design
  - The 2018-era Python 2/3 compatibility shims — we're Python 3.12 only

### Detailed file-by-file attribution

The full file-by-file upstream→downstream mapping (with line numbers and
licensing) is maintained in `docs/ATTRIBUTION.md` in the repo. It is
regenerated automatically from `git blame` annotations on every PR via
a pre-commit hook, and shipped in the `.deb` package's
`/usr/share/doc/wcarck/NOTICE` file as required by GPL §5(a).

---

## 28. Edge Cases & Exception Handling

> **Companion:** `wcarck_edge_cases_exceptions.md` (the full 22-item
> catalog with code patterns). This section gives the architectural
> decisions and the patterns that must be in place at code-review
> time. Each sub-section cross-references the full doc for the
> detailed code samples.
>
> **Status:** Every V1 edge case listed in §28.10 is owned by a D## in
> §21 with a known mitigation. The catalog is not aspirational — the
> implementations ship with V1.

### 28.0 Foundational philosophy

Every exception handler in the codebase must explicitly categorize the
failure into one of three buckets; the worst pattern is a bare
`except Exception: pass` because it hides all three equally.

| Category | Action |
|---|---|
| **Recoverable** | retry, wait, degrade gracefully |
| **Fatal (for this job)** | stop the job cleanly, release resources, tell the user |
| **Fatal (for the service)** | log, attempt teardown, let systemd restart |

Three non-negotiable patterns (D43):

- **Use `asyncio.TaskGroup` instead of `asyncio.gather`** for every
  job's sub-tasks. TaskGroup cancels siblings on first failure and
  raises `ExceptionGroup`; `gather(return_exceptions=True)` requires
  per-result manual checking and is the source of most production
  asyncio bugs in this codebase's tier.
- **Never swallow `CancelledError`.** Re-raise it after cleanup.
  Python 3.12 makes this safer (CancelledError inherits from
  BaseException, not Exception) but the discipline must be enforced
  in code review.
- **Use a `Result` type for operations where failure is a normal
  outcome** (e.g., "adapter might not support monitor mode"). Pattern
  match on `Ok` / `Err` at the call site; do not let try/except
  spaghetti climb the call stack. See `core/result.py` in §8.

### 28.1 Hardware failure handling

Five real-world failure modes with detection and recovery:

- **Adapter unplugged mid-session** *(D44, blocker)*. The
  `AdapterWatchdog` in `radio/watchdog.py` polls `ip link show
  <iface>` every 2 s; on absence it fires `_on_adapter_gone` which
  finds all jobs holding leases on that adapter, cancels them
  through the job runner (triggers teardown stack), marks the
  adapter `GONE` in DB, and publishes `adapter.gone` for the UI.
  Without this, the UI shows a stuck "Running" job and the lease
  table leaks `active` rows.
- **Driver crash / kernel oops** *(D45, high)*. Detect via the
  same watchdog; attempt `modprobe -r <driver> && modprobe <driver>`
  once per (iface, 60 s) — tracked in `_last_recovery_attempt` to
  prevent reload loops. After reload, the udev rule reassigns the
  iface name; wait up to 4 s for `ip link show` to confirm.
- **USB bus reset (both adapters gone simultaneously)** *(D46,
  high)*. Per-adapter `asyncio.Lock` (`_recovery_in_progress[iface]`)
  prevents two concurrent recovery attempts for the same iface when
  the watchdog fires for both within the same tick.
- **MAC randomization on adapter reconnect** *(D47, medium)*.
  The morrownr `88XXau` driver generates a random locally-administered
  MAC on load unless `options 88XXau rtw_drv_log_level=0` is set in
  `/etc/modprobe.d/88XXau.conf`. `doctor.sh` (startup and
  `--postmortem`) checks the MAC against the expected value from
  §13; mismatch is a hard error in install.sh.
- **DKMS silent build fail** *(D48, blocker)*. `install.sh` runs
  `dkms status` after the DKMS build and aborts with an actionable
  error if the module did not install. A silent fail here is the
  #1 reason a wcarck install "looks fine" but cannot inject frames.

### 28.2 Subprocess lifecycle

- **Grandchild processes** *(D49, high)*. `aireplay-ng` on some
  distros is a shell wrapper that forks the real `aireplay-ng.bin`.
  `ManagedProcess.stop()` is replaced with `_kill_process_tree(pid)`
  using `psutil.Process(pid).children(recursive=True)`; the whole
  tree is SIGTERM-ed, waited 2 s, then SIGKILL-ed on survivors.
- **airodump-ng CSV format change** *(D50, high)*. The CSV header
  is version-pinned in `AirodumpCSVParser.KNOWN_HEADERS`; an
  unrecognized header raises `UnknownCSVFormat` and emits a
  `tool.version_mismatch` event. The UI shows a yellow banner
  ("airodump-ng output format unrecognized. Check `doctor.sh`.")
  and the scan does not silently produce wrong data. The known
  breakages are aircrack-ng 1.6 → 1.7 (column shift in the
  client section).
- **hashcat segfault on bad GPU driver** *(D51, medium)*. The
  exit code map is: `0` cracked, `1` exhausted (not an error),
  `2` user quit, `255` error, `-11` SIGSEGV (auto-retry with CPU
  backend), `-9` SIGKILL (we killed it), `-2` SIGINT (operator
  stopped it). The CPU fallback is in `crack_jobs.retry_with_cpu`
  and emits `crack.job.failed` with a `reason` payload.
- **airodump-ng hangs without CSV (empty RF)** *(D52, low)*. A
  liveness watchdog on `ScanModule._last_csv_line` (30 s threshold)
  emits `scan.stale` with `seconds_since_last_network`; the UI
  shows "No networks seen in 30s — are adapters in monitor mode?".
  Not an error, just an operator hint.

### 28.3 Asyncio structured concurrency

- **JobRunner uses TaskGroup** *(D53)*. Every job's sub-tasks
  (stdout drain, stderr drain, watchdog, event relay) run inside
  `async with asyncio.TaskGroup()`. If any sub-task crashes, all
  others are cancelled and the teardown stack runs. The
  `except* AdapterGone`, `except* StopJobRequested`, `except*
  Exception` clauses categorize the failure per §28.0.
- **`AsyncExitStack` replaces the teardown stack** *(D54)*.
  `EvilTwinModule.run()` registers each resource (lease, mode
  switch, nftables chain, hostapd, dnsmasq, portal) via
  `stack.enter_async_context(...)`. On any exception (including
  CancelledError), the stack unwinds in reverse order. No manual
  teardown stack, no LIFO bookkeeping, stdlib battle-tested.
- **Circuit breaker for external tools** *(D55, medium)*.
  `core/circuit_breaker.py` opens after 3 consecutive failures
  and re-closes after 30 s; `DeauthModule._aireplay_breaker`
  falls back to scapy injection while open. The same pattern
  applies to `hostapd`, `dnsmasq`, and `hcxdumptool` if their
  failure modes justify it.
- **Retry with exponential backoff + jitter** *(D56, medium)*.
  `core/retry.py::retry_with_backoff(coro_fn, max_attempts=4,
  base_delay=0.5, max_delay=8.0, jitter=10%)` is the standard
  wrapper for all driver operations (`set_monitor_mode`,
  `set_channel`, `mode_switch`). Transient USB enumeration
  timing and driver init delays are the most common
  failure mode; a tight retry curve eliminates 90 % of these
  without a manual operator action.

### 28.4 SQLite resilience

- **WAL leftover from crash** *(D57, high)*. `open_database_safely`
  in `core/db.py` checks `db.sqlite-wal` size on open; if > 100 MB,
  it runs a sync `PRAGMA wal_checkpoint(TRUNCATE)` before
  connecting via the async engine. Large WAL files are the
  symptom of a runaway write loop that was killed before the
  scan buffer could flush.
- **Disk full mid-transaction** *(D58, high)*. The scan buffer
  runs `shutil.disk_usage("/var/lib/wcarck")` before every
  flush. < 50 MB free → emit `system.disk_low`; < 10 MB free →
  skip the flush and emit `system.disk_full`. SQLAlchemy
  `OperationalError` with "disk is full" is caught and
  surfaced as an event, not retried.
- **SQLite CORRUPT** *(D59, critical)*. On `OperationalError`
  containing "corrupt", the DB file is renamed to
  `db.sqlite.corrupt.<unix_ts>` and the `-wal` / `-shm` siblings
  are removed. Alembic migrations recreate the schema on next
  startup. A `db.corrupt_backed_up` log entry at `CRITICAL` is
  the only signal the operator sees.
- **Alembic per-migration atomicity** *(D60)*.
  `transaction_per_migration=True` in `alembic env.py` makes each
  migration a single SQLite transaction; a power loss mid-migration
  rolls back the partial schema and `alembic_version` stays correct.
  A `verify_schema(engine)` on startup confirms all 14 expected
  tables exist (`sessions`, `networks`, `clients`, `job_queue`,
  `attack_sessions`, `captures`, `credentials`, `ap_sessions`,
  `resource_leases`, `session_log`, `crack_jobs`, `module_state`,
  `scopes`, `adapters`); a missing table raises
  `SchemaIntegrityError` and refuses to start the service.

### 28.5 RF/Protocol edge cases

- **AP changes band mid-deauth** *(D61, medium)*. DoS pursuit
  detects the band of the target BSSID in each loop iteration
  (2.4 vs 5 vs None). 2.4 → `wlan_mon` (Ralink); 5 → `wlan_ap`
  (T2U Plus). If `wlan_ap` is busy with the Evil Twin, the
  pursuit stops and emits `attack.deauth.pursuit_blocked` with
  `reason=wlan_ap_busy`. Enterprise APs that rotate BSSID on
  channel change are tracked by SSID + channel, not BSSID —
  `_find_ap_by_ssid` returns the most-recently-seen candidate.
- **WPA3-SAE target** *(D62, medium)*. RSN IE AKM suite
  `0x000FAC08` (SAE) is detected at scan time; the UI shows a
  "WPA3 — handshake capture not supported, PMKID-only" badge and
  disables the EAPOL capture path. WPA2/WPA3 transition mode
  (both `0x000FAC02` PSK and `0x000FAC08` SAE present) is treated
  as WPA2-compatible.
- **802.11r FT-PSK** *(D63, medium)*. AKM suite `0x000FAC04`
  (FT-PSK) switches the capture strategy to PMKID-only
  (`CaptureStrategy.PMKID_ONLY`); the 4-EAPOL state machine is
  bypassed because FT roaming exchanges do not produce the
  standard M1/M2/M3/M4 sequence.
- **Client randomized MAC** *(D64, low)*. iOS 14+ and Android 10+
  use per-network random MACs (locally-administered bit set).
  `ScanModule` flags these with `ClientFlags.RANDOM_MAC` and
  excludes them from "real" client count statistics. For Evil
  Twin, `ap_session_id + client_ip` is the canonical client
  identifier (not `client_mac`).
- **AP goes offline mid-capture** *(D65, medium)*.
  `HandshakeCaptureModule` subscribes to `scan.network.lost`
  (emitted when a BSSID has not been seen for > 30 s); on match,
  it pauses deauth but keeps `hcxdumptool` running, because the
  AP may reboot and the associated STA will re-auth → produce a
  fresh handshake. Emits `capture.handshake.target_lost` with
  hint "AP offline? Waiting...".

### 28.6 Evil Twin race conditions

- **Concurrent portal submissions** *(D66, high)*. Two clients
  submitting simultaneously is safe (`.cap` is read-only) but
  two concurrent `aircrack-ng` processes contend for CPU and
  the `<(echo ...)` process-substitution may collide. Fix:
  `OfflineValidator._semaphore = asyncio.Semaphore(1)` serializes
  per-`.cap` validations. **Use a temp file, not process
  substitution** — `<(...)` is unreliable in
  `asyncio.create_subprocess_exec` on some kernel versions.
- **Double-submit on portal form** *(D67, medium)*. Network lag
  → user clicks submit twice → two identical POSTs arrive. Fix:
  per-client-IP `asyncio.Lock` in `CaptivePortalServer._submission_locks`
  + an early-exit if `_cred_repo.get_validated(ap_session_id, client_ip)`
  returns a row. Locks are popped on disconnect / session end to
  prevent memory growth.
- **DHCP pool exhaustion** *(D68, medium)*. Randomized-MAC
  clients reconnect with new MACs, exhausting the `10.0.0.2–100`
  pool. Fix: DHCP lease time `2m` (not `12h`) in the dnsmasq
  template, and a `dhcp_watchdog` task in `portal/dhcp_watchdog.py`
  that reads the dnsmasq lease file every 30 s; if leases > 80,
  emit `ap.dhcp.pool_warning`.
- **Real AP competes with Evil Twin** *(D69, medium)*. Two
  broadcasts of the same SSID. Fix: `EvilTwinModule._setup_evil_twin_mac`
  spoofs the AP MAC to be one octet off from the real AP's BSSID
  (e.g., real `AA:BB:CC:DD:EE:01` → evil `AA:BB:CC:DD:EE:02`).
  Combined with continuing deauth on `wlan_mon` against the real
  AP's clients, the standard Evil Twin workflow.

### 28.7 State machine robustness

- **Interrupted mode switch** *(D70, high)*. Operator hits Stop
  mid-mode-switch (monitor → AP, hostapd up, dnsmasq not yet
  started) → systemd kills the service → adapter left in AP
  mode with hostapd dead. On restart, the adapter is in the
  wrong state and the mode-switch state machine starts from
  the wrong position. Fix: `RadioLeaseManager.acquire()`
  verifies the actual `iw dev <iface> info | grep type` against
  the expected mode for the requested lease type; mismatch →
  force-managed mode → restart from clean state. An
  `adapter_mode_audit` background task runs every 30 s and
  publishes `adapter.state_mismatch` for any DB-vs-hardware
  drift.
- **Job queue starvation / priority inversion** *(D71, **V2**)*.
  A long-running `ScanModule` (priority LOW) holds `monitor.scan`
  while a `DeauthModule` (priority HIGH) needs `monitor.locked`.
  The lease manager correctly returns 409, but there is no
  preemption in V1. V2 will add `acquire_or_preempt` that pauses
  the lower-priority job, releases its lease, and resumes after
  the higher-priority job completes. V1 ships "no preemption;
  operator must stop the scan manually". Documented as the
  single V2-stretch item from this catalog.

### 28.8 Observability

- **Structured log fields for every subprocess call** *(D72)*.
  `ManagedProcess.start()` and `.stop()` log with `tool`, `pid`,
  `args`, `iface`, `job_id`, `returncode`, `duration_ms`,
  `stop_signal`. The `journalctl -u wcarck -o json` output is the
  single source of post-hoc truth. The "no comments in code"
  rule is suspended for log field names; they are the API.
- **Event tag catalog** *(D73)*. Every significant state
  transition is an event, with a fixed shape (tag + payload
  schema). The minimum set:

  ```
  adapter.mode_change   {iface, from, to, duration_ms, success}
  adapter.gone          {iface, reason}
  lease.acquired        {adapter, lease_type, job_id}
  lease.denied          {adapter, requested, active_job_id}
  lease.orphaned        {adapter, lease_id, age_seconds}
  lease.preempted       {preempted_job, preempting_job}
  job.transition        {job_id, from_state, to_state, reason}
  tool.exit             {tool, pid, returncode, duration_ms}
  tool.version_mismatch {tool, expected, actual_header}
  rf.pmf_detected       {bssid, ssid, mfpc, mfpr}
  rf.band_change        {bssid, ssid, from_channel, to_channel}
  rf.akm_detected       {bssid, ssid, akm_suites}
  portal.submission     {client_ip, client_mac, result}
  scan.stale            {seconds_since_last_network}
  system.disk_low       {free_mb, path}
  system.disk_full      {free_mb, path}
  event.bus.dropped     {tag, queue_id, dropped_count}
  ```

  With structlog JSON output,
  `journalctl -u wcarck -o json | jq 'select(.event=="lease.denied")'`
  surfaces the last hour of lease conflicts in one command.

- **`doctor.sh --postmortem`** *(D74)*. Single-command
  diagnostic for after an unclean shutdown. Checks: adapter
  mode (`iw dev`), orphaned tool PIDs (`pgrep -x`), orphaned
  nftables tables (`nft list tables | grep wcarck`), WAL file
  size, active leases in DB, free disk, last 50 `session_log`
  rows. Output is a single `[SECTION] finding` log that the
  operator can paste into a bug report.

### 28.9 Edge case summary

Severity per the source doc; all 22 are owned by a D## above.
R## references are added in §19.

| # | Scenario | Detection | Response | Sev |
|---|---|---|---|---|
| 1.1 | Adapter USB unplug mid-session | AdapterWatchdog (2 s poll) | Cancel jobs, mark GONE | Blocker |
| 1.2 | Kernel driver oops | AdapterWatchdog + dmesg | modprobe reload (once per 60 s) | High |
| 1.3 | USB bus reset (both adapters) | Per-adapter lock | Independent recovery | High |
| 1.4 | MAC random on reconnect | doctor.sh check | `options 88XXau rtw_drv_log_level=0` | Medium |
| 1.5 | DKMS silent build fail | `dkms status` post-install | Abort install with actionable error | Blocker |
| 2.1 | Grandchild processes (aireplay) | psutil tree walk | `_kill_process_tree(pid)` | High |
| 2.2 | airodump-ng CSV format change | Header signature validation | Refuse + `tool.version_mismatch` | High |
| 2.3 | hashcat GPU segfault | `returncode == -11` | Auto-retry with CPU backend | Medium |
| 2.4 | Empty RF (no CSV for 30 s) | Liveness watchdog | `scan.stale` event | Low |
| 4.1 | WAL leftover from crash | `os.path.getsize` on open | `PRAGMA wal_checkpoint(TRUNCATE)` | High |
| 4.2 | Disk full mid-write | `shutil.disk_usage` | Skip non-critical, emit event | High |
| 4.3 | SQLite CORRUPT | `OperationalError` | Backup + recreate, CRITICAL log | Critical |
| 5.1 | AP changes band mid-deauth | Band detection in pursuit | Switch adapter or stop pursuit | Medium |
| 5.2 | WPA3-SAE target | AKM suite parse | Badge + disable EAPOL path | Medium |
| 5.3 | 802.11r FT-PSK | AKM suite parse | Switch to PMKID-only | Medium |
| 5.4 | Client randomized MAC | Locally-administered bit | Flag + use IP as identifier | Low |
| 5.5 | AP goes offline mid-capture | `scan.network.lost` | Pause deauth, keep capture | Medium |
| 6.1 | Concurrent portal submissions | `Semaphore(1)` on validator | Serialize per `.cap` | High |
| 6.2 | Double-submit | Per-client-IP lock | Skip if already validated | Medium |
| 6.3 | DHCP pool exhausted | Lease-file watchdog | 2 m lease, warn at 80 % | Medium |
| 6.4 | Real AP competes with Evil Twin | ScanModule dual entry | MAC spoof + continue deauth | Medium |
| 7.1 | Interrupted mode switch | Mode verify on acquire | Force managed, restart clean | High |
| 7.2 | Priority inversion | — | **V2 preemption** (no V1) | Medium |

Full code samples for every row: `wcarck_edge_cases_exceptions.md`.

---

---

## 29. UI/UX Design Specification

> **Companion doc (full spec):** `wcarck_ui_ux_design.md` (50 KB / 1522 lines / v1.0).
> This section is the **summary + key constraints + non-negotiable decisions**.
> The companion is the source of truth for tokens, ASCII layouts, and code samples.

### 29.0 Design philosophy — four pillars

1. **Power Without Intimidation** — naive user opens Wcarck, immediately knows what they're looking at; tooltips on every term; confirmation modals on destructive actions.
2. **Dense Information, Zero Clutter** — pentest operators need 30+ networks, signal strengths, client counts, jobs, handshakes simultaneously. Color intensity = importance, size = hierarchy, motion = state.
3. **The 3-Click Rule** — every primary workflow completes in ≤3 clicks: Scan → click network → Attack; Evil Twin → select template → Launch; Crack → select capture → Start.
4. **Alive, Not Animated** — data streaming, counters ticking, signal bars fluctuating. Animations serve purpose: fade-in = new data, pulse = active job, slide = panel open/close, shake = error. **No spinners > 200 ms.**

### 29.1 Design system tokens (summary)

```css
/* ─── Color (Ubuntu Adwaita dark, cool blue-gray + Ubuntu orange accent) ─── */
--bg-root:        hsl(225, 15%, 8%);     /* deepest background */
--bg-surface:     hsl(225, 14%, 11%);    /* card/panel background */
--bg-elevated:    hsl(225, 13%, 14%);    /* modals, elevated cards */
--accent:         hsl(18, 90%, 56%);     /* #E95420 — Ubuntu signature orange */
--status-running: hsl(142, 60%, 50%);   /* green pulse for active jobs */
--status-warning: hsl(38, 92%, 55%);    /* amber */
--status-error:   hsl(0, 72%, 56%);     /* red */
--rf-band-24:     hsl(200, 70%, 55%);   /* 2.4 GHz = blue */
--rf-band-5:      hsl(280, 60%, 60%);   /* 5 GHz = purple */
--rf-wpa2:        hsl(142, 50%, 45%);
--rf-wpa3:        hsl(210, 70%, 55%);
--rf-wep:         hsl(0, 60%, 50%);
--rf-open:        hsl(38, 80%, 55%);
--glass-bg:       hsl(225, 15%, 12%, 0.7);   /* glassmorphism topbar */
--glass-blur:     12px;

/* ─── Typography ─── */
--font-sans:  'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono:  'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
--text-xs (11px) → --text-3xl (44px), modular 1.2 ratio;

/* ─── Spacing / Radius / Shadow / Motion: see companion §1.3-1.6 ─── */
```

Full token file at `frontend/src/styles/index.css` (D101); Tailwind binds via `tailwind.config.ts` `theme.extend`.

### 29.2 Master layout — three zones

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOPBAR  (48px, glass effect)                                          │
│ [☰ pin] [W] Wcarck   Session: "NASA Audit" 48m ●   [🟢 wlan_uplink]   │
│                                                         [🟢 wlan_mon]  │
│                                                         [⚪ wlan_ap]   │
│                                                         [○ 0 errors]   │
├───────┬──────────────────────────────────────────────────────────────┤
│  S    │                                                              │
│  I    │  CONTENT ZONE  (scrollable, 24px padding)                    │
│  D    │                                                              │
│  E    │  ──────────────────────────────────────────────────────────  │
│  B    │                                                              │
│  A    │  CONTEXTUAL PANEL  (slide-in from right, 380 px wide)        │
│  R    │  (appears when clicking a row: network detail, job detail)   │
│ 64px  │                                                              │
│ default│                                                             │
│ 220px │                                                              │
│ pinned │                                                             │
└───────┴──────────────────────────────────────────────────────────────┘
```

- **Topbar (48 px):** session label + elapsed live counter; 3 adapter status dots (green=correct, amber=transition, red=gone, gray=disconnected); error count badge; click adapter dot → tooltip with `(iface, mode, channel, driver)`.
- **Sidebar (64 px default, 220 px pinned):** icon-only; pin button toggles; **never auto-expands on hover** (D87; self-correction 1). 11 pages: Dashboard, Recon, Targets, Attacks, Evil Twin, Captures, Credentials, Crack, Adapters, Logs, Settings. Icons: lucide-react (LayoutDashboard / Radar / Crosshair / Zap / Ghost / FileDown / KeyRound / Hammer / Wifi / ScrollText / Settings). Active item: 3 px accent pill on left edge, slides with `--ease-spring`.
- **Content zone:** 24 px padding; cards and tables.
- **Contextual panel (380 px):** slide-in from right on row click; persistent — click same row updates, only ×/Esc closes (D89; self-correction 3).

### 29.3 Page inventory (8 pages)

| Page | Key components | Cross-refs |
|---|---|---|
| **Dashboard** | Guided action bar (first-launch OR no jobs in 24 h, D90), 4 metric cards (Networks / Clients / Handshakes / Creds) with count-up animation, active jobs section, 3 adapter cards, recent events feed | §11 Phase 1 |
| **Recon** | TanStack Table virtualized (D96), signal bars + dBm number (D98), encryption badges (WPA2/WPA3/WPA2+3/WEP/Open), PMF indicator (D41), persistent detail panel (D89) with [Deauth All] [Deauth Client] [Capture Handshake] [PMKID] [Evil Twin →] | §11 Phase 2 |
| **Attacks** | Active attack card (deauth, EAPOL progress M1-M4 with checkmarks + connecting line that fills green on capture), capture-in-progress card, attack history table | §11 Phase 3 |
| **Evil Twin** | 3-step wizard: ① Target → ② Template (5 cards: Router Update, Coffee Shop, Airport, Hotel, Custom) → ③ Launch confirmation. During operation: 4 metric cards (Clients / Creds / Valid / Uptime) + live credential feed (slides in from right, green flash on valid) | §11 Phase 4 |
| **Captures** | Table: SSID / BSSID / Type (EAPOL, PMKID) / Status (✓ Valid / ⚠ Partial / ✗ Invalid) / Size / Date. Row mini-display: `M1 ✓ M2 ✓ M3 ✗ M4 ✗`. Buttons: [📥 download] [⚡ crack] [🔄 re-capture] | §11 Phase 3, D75/D76 |
| **Credentials** | Masked passwords (••••••••••), eye icon reveals for 10 s, copy button. `✓ Valid` / `✗ Invalid` badges | §11 Phase 4 |
| **Logs** | 4 tabs: Session / Errors (red badge) / System / RF. Filter bar (Level / Channel / Search). **"Copy Debug Report"** button (D93; not "Export AI Bundle"). Row expand → JSON detail | §10, D72 |
| **Adapters** | Per-adapter card: chipset / driver / MAC / mode / role / RX-TX rate. Mode switch button with **4-step progress indicator** (① iface down ② mode set ③ iface up ④ injection verify) (D92). 5 GHz channel dropdown with DFS warning (D94, D81) | §11 Phase 1, D70/D77/D78 |

### 29.4 Micro-interactions (non-negotiable)

- **Toast notifications** — top-right stacked; 4 s auto-dismiss; max 3 visible; error toasts persist. Slide-in-right + fade; click "View Details" → Logs page filtered to `trace_id`.
- **Confirmation modals** — Evil Twin **YES** (full launch summary); deauth **NO** (D88; self-correction 2); adapter mode switch on uplink **NO** (locked anyway); stop job **NO** (Stop button is prominent).
- **Tooltips** — 13 required terms (BSSID, SSID, Channel, WPA2-PSK, WPA3-SAE, PMF, EAPOL, PMKID, Deauth, Monitor mode, Evil Twin, Handshake, dBm) via Radix UI `TooltipProvider`; delay 300 ms; max-width 280 px.
- **Empty states** — 4 required: Recon (no networks), Captures (no handshakes), Credentials (no creds), Attacks (no active). Each has icon + 1-line description + 1-line instruction + primary action button.
- **Error states inline, not modal** — error text comes from `hint` field in structured log; "View Log" jumps to Logs page filtered to `trace_id`.

### 29.5 Self-corrections (override earlier assumptions)

After self-review, the design spec made 8 corrections. These are **non-negotiable** and override any earlier UI/UX draft in the plan:

1. **Sidebar: pin button, not auto-expand on hover** (D87)
2. **Deauth: no confirmation modal** (D88)
3. **Network detail panel: persistent, only ×/Esc closes** (D89)
4. **Guided action bar: first-launch OR no jobs in 24 h, then never** (D90)
5. **Signal strength: bars AND dBm number** (D98)
6. **Mode switch: 4-step progress indicator** (D92)
7. **"Copy Debug Report" button, not "Export AI Bundle"** (D93)
8. **5 GHz channel dropdown: DFS channels visually separated with ⚠** (D94)

### 29.6 Performance budget (enforced)

| Metric | Target |
|---|---|
| First Contentful Paint | < 800 ms |
| Time to Interactive | < 1.5 s |
| WebSocket event → UI update | < 50 ms (Zustand direct, no React context cascade) |
| Table re-render (50 rows) | < 16 ms / 60 fps (virtualized) |
| Page navigation | < 100 ms (React.lazy + Suspense fade) |
| Bundle size (gzipped) | < 200 KB |

Data update strategy: scan networks every ~2 s, merge into `Record<bssid, Network>`; signal bars use CSS `transition` (no re-render); deauth counter throttled to 10×/sec via `requestAnimationFrame`.

### 29.7 Accessibility

- **Keyboard nav:** Tab/Enter/Space, Esc (close panel/modal), Ctrl+K (command palette, D100), 1-9 (sidebar quick-nav), ↑/↓ (table rows), Enter on row (open detail).
- **Command palette:** fuzzy search; top result highlighted; Enter executes.
- **Color contrast:** WCAG AA (4.5:1 normal, 3:1 large). **Status indicators use shape + color (✓, ✗, ●, ◌), not color-only** (deuteranopia-safe) (D99).
- **Axe-core** runs in Playwright e2e to catch violations on every PR.

### 29.8 Phase-1 design-system deliverables

(see §11 Phase 1 for the full checklist)

- [ ] `frontend/src/styles/index.css` with all design tokens (D101)
- [ ] `tailwind.config.ts` binding tokens via `theme.extend`
- [ ] shadcn/ui setup with custom theme (Ubuntu orange accent, Inter font)
- [ ] Reusable primitives: `Tooltip`, `Toast`, `ConfirmModal`, `EmptyState`, `CommandPalette` (D100)
- [ ] 3-zone layout shell (Topbar + Sidebar + Content + ContextualPanel)
- [ ] Dashboard page with 4 mocked metric cards
- [ ] `AdapterCard` component with all 6 states (online / monitor / AP / transitioning / error / locked)
- [ ] Welcome overlay (first-launch only)
- [ ] `lucide-react` icon set
- [ ] Playwright + axe-core e2e scaffolding
- [ ] No spinners > 200 ms (use "previous state + corner indicator" pattern, Pillar 4)

---

## 30. Final Verdict Integration

> **Companion doc (full critique):** `FinalVerdict.md` (8 KB / 255 lines). 
> The companion is the full cross-correlation of all docs (engineering, edge-cases, UI/UX) plus 32 "unknown unknowns". This section is the **summary + the 4 critical showstoppers + the V1/V2 split**.

### 30.0 Architectural readiness

The Final Verdict assesses: **90/100 (Ready for coding, pending the fixes below)**. The theoretical planning phase is **100 % complete** — every edge case from React re-renders to SQLite WAL deadlocks, USB resets, Docker limitations, IPv6 leaks, DFS radar scans, and mobile UX paradigms has been anticipated and designed for.

The 4 critical showstoppers (Final Verdict §2) are addressed in **D101-D104** below. The 28 other findings are split between V1 (this pass) and V2 (deferred).

### 30.1 The 4 critical showstoppers (all in V1)

| # | Showstopper | Fix | Decision |
|---|---|---|---|
| 1 | **NetworkManager conflict with `wlan_uplink`** — `airmon-ng check kill` kills NM, which kills the uplink and breaks the 3-adapter design | `/etc/NetworkManager/conf.d/99-wcarck.conf` with `unmanaged-devices=mac:<wlan_mon>;mac:<wlan_ap>`. Uplink stays managed. Or per-session `nmcli dev set <iface> managed no` | D101 (revises D79) |
| 2 | **CRDA / Regulatory Domain blocking channels** — `country 00` blocks 5 GHz DFS and 2.4 GHz channels 12-14; TX power capped | `iw reg set BO` (Bolivia, pentest standard) on startup, fallback `BZ`; `txpower fixed 3000` for max TX | D102 (revises D81) |
| 3 | **Privilege model — FastAPI as root is a security anti-pattern** | Unprivileged `wcarck` user; `wcarck.service` runs `User=wcarck`/`Group=wcarck`; `/etc/sudoers.d/wcarck` NOPASSWD whitelist for `iw`, `ip`, `macchanger`, `hostapd`, `dnsmasq`, `aircrack-ng`, `hcxdumptool`, `airodump-ng`, `aireplay-ng`, `iptables`, `nft`, `rfkill`, `setcap`, `dkms`, `modprobe`. `ManagedProcess` auto-prepends `sudo` to whitelisted commands | D35, D103 |
| 4 | **System suspend mid-attack** — USB resets on wake, DB thinks leases are active | DBus `org.freedesktop.login1` `PrepareForSleep` listener via `jeepney`/`asyncio-dbus`. On sleep: hard-stop all jobs, force-managed all adapters, persist state. On wake: run `AdapterWatchdog` immediately | D104 |

### 30.2 Refinements to existing decisions (Final Verdict overrides)

The Final Verdict **overrides** 8 earlier decisions. These are corrections, not additions:

| Old D | Old wording (abbreviated) | Revised by | Reason |
|---|---|---|---|
| D35 | "Drop CAP_SYS_ADMIN" | + `User=wcarck`/`Group=wcarck` + `LimitNOFILE=65536` | D103, R78 |
| D41 | "PMF/802.11w — refuse deauth PMF-required APs" | + **per-client enforcement** — UI shows WPA2 vs WPA3 client columns, "Deauth" button disabled for WPA3 clients with tooltip | D116, R70 |
| D49 | "`_kill_process_tree` via psutil" | + **process groups via `start_new_session=True`** — atomic `os.killpg()` for fork escapes | D113, R77 |
| D57 | "WAL recovery on open" | + **5-minute periodic PASSIVE checkpoint task** + autocommit reads | D111, R80 |
| D77 | "Per-phy lease model" | + **channel race preemption** (pause scan lease before granting locked lease) + **track by USB bus path, not MAC** | D114, D117, R67 |
| D79 | "install.sh masks NetworkManager + wpa_supplicant + avahi-daemon" | **REPLACED** — masks break `wlan_uplink`. Instead: `unmanaged-devices` config | D101, R59 |
| D81 | "Regulatory domain check on lease acquisition" | **REPLACED** — checking but not setting loses channels. Instead: `iw reg set BO` on startup | D102, R60 |
| D94 | "5 GHz channel dropdown DFS warning" | + **60 s CAC wait** — `DeauthModule.start()` gated on `hostapd.ap_enabled` | D118, R72 |

### 30.3 New architectural decisions (V1)

**Protocol & Evil Twin (D105-D108, D116-D118):**
- **D105** DoH/DoT firewall drop — nftables drop TCP/UDP port 853 + DoH IPs (8.8.8.8, 1.1.1.1) on `wlan_ap`
- **D107** DHCP subnet collision auto-shift — Evil Twin detects uplink's 10.0.0.x and switches to 192.168.88.x
- **D108** HSTS — never intercept port 443; rely on Captive Network Assistant HTTP probes
- **D110** IPv6 drop on `wlan_ap` — nftables + dnsmasq `address=/#/::` IPv6 sinkhole

**Storage & runtime (D106, D111, D112, D113, D120):**
- **D106** tmpfs staging for raw `.pcapng` writes; move on completion
- **D111** WAL 5-min PASSIVE checkpoint (companion to D57)
- **D112** `ProcessPoolExecutor` for heavy CPU (CSV parse, hashcat output, PMKID)
- **D113** Process groups via `start_new_session=True` (refines D49)
- **D120** Clock skew — `time.monotonic()` for all duration math; year-2024 startup check

**Hardware robustness (D114, D119, D125, D126):**
- **D114** Track adapters by USB bus path (D67)
- **D119** Thermal pulsed bursts in DeauthModule
- **D125** VM USB flakiness hint (`adapter.flaky_usb`)
- **D126** USB bus power brownout warning

**Distribution & UX (D115, D121-D130):**
- **D115** Bare metal only, no Docker
- **D121** Audio alerts via Web Audio API (Backpack Mode)
- **D122** High-contrast light mode (sunlight ops)
- **D123** Asset drag-drop (wordlists + portal templates)
- **D124** Storage retention (7 d pcapng, 30 d session_log)
- **D127** Bulk operations (multi-select + floating action bar)
- **D128** SPA context preservation via Zustand-persisted state
- **D129** Focus Mode + toast debouncing/grouping
- **D130** Mobile responsive (bottom tab bar + bottom sheet)

### 30.4 Deferred to V2 (Final Verdict §8.2 Topology, §8.6 Client Report)

- **D131** Topology graph view (React Flow / D3 force-directed) — too complex for V1; already in §25.4
- **D132** Client Report PDF/HTML — was `ReportModule`, deferred in v0.1.4; restore for V2 post-MVP hardening

### 30.5 Implementation rollout (Final Verdict §9)

To move into execution efficiently without getting bogged down, the Final Verdict recommends a strict 5-step build order:

1. **Step 1: The Core Spine.** Implement `EventBus`, `Module` base class, `RadioLeaseManager`, and `AsyncLogWriter`. Unit tests must be bulletproof.
2. **Step 2: Database & State.** Implement Alembic migrations, SQLAlchemy models, `job_queue`. `PRAGMA wal` settings hardcoded.
3. **Step 3: Hardware Control.** Implement `AdaptersModule` with NM `unmanaged-devices` bypass (D101), `REGDOMAIN=BO` (D102), `AdapterWatchdog`.
4. **Step 4: Subprocess Engine.** Implement `ManagedProcess` with process groups (D113) and asyncio pipe drains.
5. **Step 5: API & UI Scaffold.** Connect FastAPI WebSockets to `EventBus`. Scaffold the React dashboard.

> **No more planning is required. The blueprint is complete. Proceed to `git init`.**

---

*End of Wcarck.md — Document Version 0.1.6*
