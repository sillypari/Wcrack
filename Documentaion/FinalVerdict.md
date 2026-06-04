# Wcarck — Final Verdict & Stop-Gap Analysis

**Purpose:** A comprehensive cross-correlation of all documentation, UI/UX designs, engineering reviews, and edge-case handling for the Wcarck project. This document identifies the "unknown unknowns" — the critical gaps left in the current design that will cause real-world friction, and provides immediate architectural fixes.

---

## 1. Executive Summary

The current design of Wcarck (v0.1.5 MVP + Engineering + UI/UX + Logging) is **90% complete and highly robust**. It successfully avoids the pitfalls of legacy tools (wifite2, bettercap) by using structured concurrency, an event bus, and rigorous hardware state tracking. 

However, cross-referencing the requirements reveals **4 Critical Showstoppers** (especially regarding the `wlan_uplink` requirement) and **several UX/Feature gaps** that must be resolved before Phase 1 implementation begins.

**Architectural Readiness Score: 90/100** (Ready for coding, pending the fixes below).

---

## 2. CRITICAL Engineering Gaps (The Showstoppers)

### 2.1 The NetworkManager / `airmon-ng check kill` Conflict
**The Gap:** Standard pentest workflows use `airmon-ng check kill` to kill `wpa_supplicant` and `NetworkManager` so they don't interfere with monitor mode. But Wcarck specifically requires a dedicated `wlan_uplink` adapter to maintain internet connectivity. If we kill NetworkManager, the uplink dies, defeating the purpose of the 3-adapter setup.
**The Fix:** 
We must explicitly tell NetworkManager to ignore our attack adapters while leaving `wlan_uplink` untouched.
In the installation script or startup sequence, we must configure NM unmanaged devices:
```bash
# Instead of killing NM, add this to /etc/NetworkManager/conf.d/99-wcarck.conf:
[keyfile]
unmanaged-devices=mac:<MAC_OF_WLAN_MON>;mac:<MAC_OF_WLAN_AP>
```
Alternatively, dynamically via `nmcli`: `nmcli dev set wlan_mon managed no` before putting it into monitor mode.

### 2.2 Regulatory Domain (CRDA) Blocking Channels
**The Gap:** Out of the box, Linux sets the WiFi regulatory domain (`REGDOMAIN`) to a restrictive global default (00). This frequently blocks injection on certain 2.4 GHz channels (12, 13, 14) and completely disables monitor mode/injection on many 5 GHz channels (DFS/radar channels).
**The Fix:**
The `AdaptersModule` must force the regulatory domain to a permissive region (e.g., `BO` - Bolivia, or `BZ` - Belize, standard pentest practice) on startup to unlock all hardware capabilities and maximum TX power.
```python
# During adapter init:
await run_cmd("iw", "reg", "set", "BO")
await run_cmd("iw", "dev", "wlan_mon", "set", "txpower", "fixed", "3000") # Max out Tx power
```

### 2.3 Privilege Model & Security Context
**The Gap:** The architecture assumes the FastAPI backend runs as `root` because it needs to execute `modprobe`, `iw`, `hcxdumptool`, etc. Running a large Python web server as root is a security anti-pattern, even for a local tool. 
**The Fix:**
Run the FastAPI application as a dedicated unprivileged user (`wcarck`). Create an `/etc/sudoers.d/wcarck` file that allows the `wcarck` user to run specific binaries (`iw`, `ip`, `macchanger`, `hostapd`, `dnsmasq`, `aircrack-ng`, `hcxdumptool`, etc.) without a password. The `ManagedProcess` wrapper should automatically prepend `sudo` to these specific commands.

### 2.4 System Suspend/Hibernate (Power Management)
**The Gap:** If the pentester closes their laptop lid mid-deauth, the OS suspends. Upon waking, USB devices are reset, but the internal Python event loop just resumes. The DB thinks leases are active, but the hardware was physically powered down.
**The Fix:**
The backend needs a DBus listener for systemd's `PrepareForSleep` signal.
```python
# Pseudocode for sleep hook
def on_sleep():
    logger.critical("system.sleep", hint="System suspending. Hard-stopping all active jobs.")
    job_runner.cancel_all_jobs()
    adapters.force_managed_all()
```

---

## 3. UI/UX & Workflow Gaps

### 3.1 "Backpack Mode" (Audio Cues)
**The Gap:** The UI is beautifully designed for visual monitoring. However, a common pentest workflow is "backpack mode": the laptop is closed in a backpack (configured not to sleep), and the operator is walking around. How do they know when a handshake is captured?
**The Fix:**
Implement the Web Audio API in the React frontend.
- **Toggle:** "🔊 Audio Alerts" in the Topbar.
- **Events:** Play a short, distinct "beep" on `capture.handshake.valid`. Play a different chime on `portal.credential_captured`.
- *Architecture note:* Browsers require user interaction before playing audio, so the operator must click "Enable Audio" once per session.

### 3.2 Sunlight Readability (High-Contrast Light Mode)
**The Gap:** The UI is exclusively "Ubuntu Adwaita Dark Mode". Pentesters often work outside or in cars during the day. Dark mode is notoriously difficult to read in direct sunlight due to glare.
**The Fix:**
Add a "High-Contrast Light Mode" toggle.
- Backgrounds: Pure white (`#ffffff`).
- Text: Pure black (`#000000`).
- Accent: Deep high-contrast blue instead of orange, ensuring WCAG AAA compliance for outdoor visibility.

### 3.3 Asset Management (Wordlists & Templates)
**The Gap:** The Evil Twin UI allows selecting a portal template, and Crack allows selecting a wordlist. But how does a naive user *add* a new template or a custom `.txt` wordlist without dropping to the terminal and editing `/var/lib/wcarck/`?
**The Fix:**
Add an **Assets** tab in the Settings page.
- **Wordlists:** A drag-and-drop file upload zone for `.txt` files. The backend chunks the upload and saves it to `/var/lib/wcarck/wordlists/`.
- **Portal Templates:** A way to upload a `.zip` file containing an `index.html` and assets. The backend unzips it into `/var/lib/wcarck/portals/custom_X/`.

### 3.4 Storage Bloat & Retention Policy
**The Gap:** `hcxdumptool` PCAPNG files can get very large very quickly (100MB+ per hour in busy environments). While we have log rotation, there is no strategy for cleaning up old capture files or trimming the SQLite database.
**The Fix:**
- Add a "Cleanup" automated job that runs on startup.
- Rule: Keep `.22000` (hash) files forever (they are kilobytes).
- Rule: Auto-delete raw `.pcapng` files older than 7 days, unless explicitly "starred/pinned" by the user in the UI.
- Rule: Keep SQLite `session_log` for 30 days.

---

---

## 4. Hardware & Driver Edge Cases (The "Unknown Unknowns")

### 4.1 USB Passthrough in VMs
**The Gap:** While targeted at native Ubuntu, 80% of users will try to run this in a VMware/VirtualBox Ubuntu VM on a Windows/Mac host. USB passthrough is extremely flaky and randomly drops devices for 500ms under heavy load.
**The Fix:** 
The `AdapterWatchdog` (from the Exceptions doc) handles the drop well, but the UI must provide a VM-specific hint. If an adapter drops and reconnects within 2 seconds >3 times in a session, trigger an event:
`event="adapter.flaky_usb"` with Hint: *"Adapter is resetting frequently. If you are using a Virtual Machine, switch the USB controller from USB 2.0 to USB 3.1 (xHCI) in VM settings."*

### 4.2 RTL8821AU MAC Randomization on Injection
**The Gap:** Realtek drivers sometimes have a bug where transmitting injected frames causes the driver to dynamically change its MAC address to a random value mid-operation, breaking the `RadioLeaseManager` which tracks adapters by MAC.
**The Fix:**
Track adapters by their stable `phy` index or USB bus path (`/sys/class/net/wlan_ap/device`), not just their MAC address.
```python
# In AdaptersModule
usb_path = await get_usb_path("wlan_ap")
# Even if MAC changes, USB path remains constant:
# /sys/devices/pci0000:00/.../usb1/1-2/1-2.1
```

---

## 5. Protocol & Deep Logic Edge Cases (The "Deep Unknowns")

### 5.1 Evil Twin: DNS over HTTPS (DoH) / DoT Pinning
**The Gap:** Modern Android and iOS devices default to using DNS-over-HTTPS (DoH, port 443) or DNS-over-TLS (DoT, port 853) targeting 8.8.8.8 or 1.1.1.1. If Wcarck's `dnsmasq` only hijacks standard UDP port 53, the client's DoH requests will bypass the Evil Twin portal entirely, and the Captive Network Assistant (CNA) will fail to trigger.
**The Fix:**
We must use `nftables` to actively drop or reject TCP/UDP traffic to port 853 and known DoH IPs (8.8.8.8, 1.1.1.1) on the `wlan_ap` interface. This forces the client OS to fall back to unencrypted port 53 UDP, which `dnsmasq` can then intercept to serve the portal.

### 5.2 Clock Skew & Offline Boot (NTP Failure)
**The Gap:** If the pentest rig (e.g., a Raspberry Pi without a hardware RTC) boots completely offline, the system clock defaults to 1970. The SQLite database writes timestamps as `1970-01-01`. Later, if the `wlan_uplink` connects and NTP syncs, the clock suddenly jumps to 2026. The UI timeline breaks completely, and `duration_ms` calculations yield negative values or 56-year durations.
**The Fix:**
- At startup, warn if the system year is `< 2024`.
- As designed in the logging architecture, **never** use wall-clock time (`ts`) for duration calculations. Always use `time.monotonic()` (`ts_mono`) for any math.

### 5.3 Storage I/O Exhaustion (SD Card Bottlenecks)
**The Gap:** `hcxdumptool` writes raw RF frames. In a busy environment (stadium/office), this can exceed 5 MB/s. On a slow SD card (Raspberry Pi) or cheap USB flash drive, writing PCAPs directly to disk will lock up the I/O, causing the Python asyncio `run_in_executor` threads to stall, effectively freezing the entire backend.
**The Fix:**
Write raw captures to `tmpfs` (RAM disk, usually `/tmp/wcarck_captures`) first. Only move the finalized `.22000` hashes and compressed `.pcapng` files to persistent storage (`/var/lib/wcarck/captures`) when the job completes or the capture is explicitly saved.

### 5.4 WPA3 / OWE Transition Mode & Deauth Immunity
**The Gap:** A target network broadcasts both WPA2 and WPA3 (Transition Mode). `hcxdumptool` captures PMKIDs for both. However, Management Frame Protection (PMF) is strictly mandatory for WPA3 clients. If we attempt a standard Deauth attack on a WPA3-connected client, the client will ignore the unencrypted deauth frame.
**The Fix:**
The UI must visually separate WPA2 clients from WPA3 clients (based on the AKM suite in their association request). The "Deauth" button must be disabled for WPA3 clients with a tooltip: *"Client is using WPA3 (PMF mandatory). Unencrypted deauth frames will be ignored."* Rely exclusively on passive PMKID capture for these clients.

### 5.5 Channel Hopping Race Conditions (Dual Masters)
**The Gap:** When `wlan_mon` is doing active Recon, `airodump-ng` (or the backend hopper) changes channels constantly. If the operator clicks "Deauth", the backend uses `iw` to lock the channel to the target's channel. However, if the background hopper isn't stopped *first*, a race condition occurs where `iw` sets channel 6, and 100ms later the hopper sets channel 7, causing the deauth frames to miss the target entirely.
**The Fix:**
Channel state must be exclusively owned by the `RadioLeaseManager`. A Recon job must hold a `monitor.scan` lease (which allows hopping). A Deauth job requires a `monitor.locked` lease. The `RadioLeaseManager` must pause/preempt the `monitor.scan` lease *before* granting the `monitor.locked` lease, ensuring the hopper is completely suspended before `iw set channel` is called.

### 5.6 The Docker Isolation Trap
**The Gap:** A common impulse is to say "let's distribute this as a Docker container to avoid dependency hell." However, WiFi pentesting tools rely heavily on `netlink` sockets, `mac80211` kernel interfaces, and direct USB access. Docker isolates network namespaces by default, which breaks `iw`, `ip link`, and monitor mode entirely.
**The Fix:** Wcarck must explicitly be designed for **Bare Metal** (or a privileged VM with USB passthrough). We cannot containerize the RF backend. An installation script (`install.sh`) that uses `apt` and Python `venv` is the only viable distribution method.

---

## 6. System & Orchestration Edge Cases (The "Bird's Eye View")

### 6.1 Evil Twin: The DFS Radar Scan (CAC) Delay
**The Gap:** If the target AP is on a 5 GHz DFS channel (e.g., Channel 52), our Evil Twin must also operate on that channel to spoof it. However, aviation/weather radar rules require `hostapd` to perform a Channel Availability Check (CAC) for **60 seconds** before it is legally allowed to broadcast a single beacon. If Wcarck launches the Deauth attack immediately after starting `hostapd`, the clients will be kicked offline for a minute while the Evil Twin isn't even visible, causing them to connect to a different saved network entirely.
**The Fix:** The orchestration engine must strictly sequence the attack. The Deauth module **must not fire** until the `EvilTwinModule` emits a specific internal event: `hostapd.ap_enabled`, which is parsed by reading the `hostapd` stdout stream. On DFS channels, the UI will show: *"Waiting 60s for DFS Radar Scan..."*

### 6.2 Evil Twin: DHCP Subnet Collision
**The Gap:** The captive portal is hardcoded to serve IP addresses in the `10.0.0.x` range via `dnsmasq`. However, Wcarck requires a `wlan_uplink` adapter connected to a legitimate internet connection. If the user happens to be at a coffee shop or hotel where the local network *also* uses the `10.0.0.x` subnet, the Linux kernel routing table will conflict. The Evil Twin portal will break, or the internet uplink will break.
**The Fix:** The `EvilTwinModule` must inspect the `wlan_uplink` IP address (`ip -4 addr show wlan_uplink`) at launch. If it detects a subnet collision, it must dynamically shift the Evil Twin's DHCP pool to an unused RFC1918 block (e.g., `192.168.88.x` or `172.16.0.x`) and rewrite the `dnsmasq.conf` dynamically.

### 6.3 HSTS and the HTTPS Interception Myth
**The Gap:** A naive user might expect that if a victim types `https://google.com` or `https://facebook.com` into their browser, the Evil Twin will redirect them to the captive portal. This is impossible. HTTP Strict Transport Security (HSTS) is preloaded in all modern browsers. Any attempt to redirect or fake the certificate for these domains will result in a hard, bypass-proof security error, ruining the illusion of the Evil Twin.
**The Fix:** We must **never** attempt to intercept port 443 (HTTPS) with a fake certificate. We must rely *entirely* on the Captive Network Assistant (CNA) built into iOS, Android, and Windows. These operating systems ping known HTTP URLs (like `http://captive.apple.com`) in the background. Wcarck's `dnsmasq` intercepts *those* HTTP requests, triggering the OS to automatically pop up the captive portal window outside of the standard browser.

### 6.4 WebSocket State Replay (The "F5 Problem")
**The Gap:** The UI is driven by WebSocket events. If the user refreshes their browser tab (F5), the WebSocket reconnects. However, the React frontend has now lost all ephemeral state (like active Deauth frame counts, EAPOL progress, or recent log hints). If an attack is currently running, the UI will appear blank or out-of-sync until a new event arrives.
**The Fix:** The backend WebSocket manager must support a `State Sync` request upon connection. When the UI connects, it requests the current active jobs and the last 100 events from the `session_log` (from SQLite or the in-memory ring buffer) to instantly rebuild the live dashboard state.

### 6.5 USB Bus Power Brownouts
**The Gap:** Plugging an ALFA AWUS036NHA (Atheros) and an ALFA AWUS036ACH (Realtek) into an unpowered USB hub or a cheap laptop's adjacent ports. Both adapters pushing maximum Tx power (30dBm) during an active deauth and Evil Twin attack will exceed the standard 500mA USB 2.0 power limit. The motherboard will aggressively reset the USB bus to prevent damage, causing both adapters to drop simultaneously.
**The Fix:** Add a UI/Hardware warning in the "Adapters" tab: *"⚠ For stability during high-power attacks, plug adapters into separate sides of your laptop or use a powered USB hub."*

---

## 7. Deep Systems & Runtime Edge Cases (The "Pure Engineering" Layer)

### 7.1 Process Groups & Orphaned Daemons (SIGKILL Cascades)
**The Gap:** We previously discussed killing grandchild processes via `psutil`. However, crawling the process tree via `/proc` is subject to race conditions if a process forks rapidly. If `aireplay-ng` forks exactly while we are killing it, the fork survives and becomes an orphaned daemon, permanently locking the WiFi adapter.
**The Fix:** Wcarck must spawn every subprocess in its own isolated UNIX Process Group using `start_new_session=True` in `asyncio.create_subprocess_exec`. When stopping the tool, we send `SIGTERM` (and later `SIGKILL`) to the entire Process Group ID (`os.killpg(pgid)`), atomically wiping out the tool and any children/forks it ever created.

### 7.2 File Descriptor Exhaustion (`ulimit -n`)
**The Gap:** A busy Python web server handling WebSockets, opening SQLite database connections, reading `sysfs` for adapter stats, and spawning dozens of subprocesses (which each consume 3 pipes: stdin, stdout, stderr) will quickly hit the default Linux soft limit of 1024 open file descriptors. Once hit, the app crashes with `OSError: [Errno 24] Too many open files`.
**The Fix:** The `wcarck.service` systemd unit file must explicitly configure `LimitNOFILE=65536`.

### 7.3 IPv6 Leaks Bypassing the Captive Portal
**The Gap:** Wcarck uses `dnsmasq` to hijack IPv4 DNS and `nftables` to redirect IPv4 web traffic to the portal. However, modern smartphones aggressively prefer IPv6. If the target device sends IPv6 DNS requests or tries to reach `captive.apple.com` via IPv6, the traffic will bypass our IPv4 NAT rules entirely. The client will realize there is no internet, and the CNA popup will never appear.
**The Fix:** Wcarck's `nftables` configuration must explicitly drop all IPv6 routing on the `wlan_ap` interface (`nft add rule inet wcarck forward meta nfproto ipv6 drop`), and `dnsmasq` must be configured to sinkhole IPv6 DNS records (`address=/#/::`), forcing the smartphone to fall back strictly to IPv4.

### 7.4 SQLite WAL Checkpoint Starvation
**The Gap:** We enabled SQLite WAL mode for concurrency. However, if Wcarck has a continuous stream of background writes (RF logging) and the React UI holds a read transaction open slightly too long (e.g., fetching a huge list of networks), SQLite cannot run its automatic WAL checkpoint. The `-wal` file will grow infinitely until the disk is full.
**The Fix:** The backend must run a dedicated background task that executes `PRAGMA wal_checkpoint(PASSIVE)` every 5 minutes to explicitly force compaction. Additionally, all read queries must strictly omit transactions (`autocommit` mode) to release locks instantaneously.

### 7.5 Python GIL Blocking (Event Loop Stalls)
**The Gap:** While I/O is asynchronous, Python's Global Interpreter Lock (GIL) blocks the event loop during CPU-bound tasks. If Wcarck has to parse a 50MB CSV file from `airodump-ng` or validate a massive hashcat output in memory, the main thread freezes. Active WebSockets will disconnect, and hardware watchdogs will timeout, falsely assuming the adapters crashed.
**The Fix:** Any heavy string parsing, large JSON serialization, or cryptographic operations (like PMKID hashing) must be executed in a `ProcessPoolExecutor` (not a `ThreadPoolExecutor`), fully bypassing the GIL and keeping the asyncio orchestrator running at 60fps.

### 7.6 Hardware Thermal Throttling
**The Gap:** USB WiFi adapters running at 30dBm in continuous injection mode (Deauth) will severely overheat within 10 minutes. Some chipsets (RTL8812AU, RT3070) will thermal throttle, silently dropping 90% of injected frames, or they will panic and disconnect from the USB bus to prevent physical melting.
**The Fix:** The `DeauthModule` must not transmit at a 100% duty cycle. It must use a pulsed burst approach (e.g., inject 64 frames, `await asyncio.sleep(0.1)`), giving the radio amplifier micro-seconds of idle time to dissipate heat.

---

## 8. Deep UI/UX & Operator Workflows (The "Human Factors" Layer)

### 8.1 Bulk Operations (The "Nuke" Option)
**The Gap:** A pentester audits a corporate building and discovers 40 Access Points belonging to the target company (same ESSID). They want to capture PMKIDs from all of them. Clicking each row one by one, opening the right panel, and clicking "Capture" 40 times is horrible UX.
**The Fix:** The Recon table must have a multi-select checkbox column. When `selectedCount > 0`, a floating "Bulk Action Bar" slides up from the bottom of the screen offering: `[Deauth Selected]`, `[Capture PMKID Selected]`, and `[Export Selected]`.

### 8.2 Spatial Awareness (Topology Graph View)
**The Gap:** A tabular list of BSSIDs and Clients is incredibly dense, but it fails to communicate physical network topology. Pentesters need to quickly understand if 5 APs are part of a mesh, or if a single client is actively roaming between multiple APs.
**The Fix:** Add a `[ ☷ Table | 🕸 Topology ]` toggle on the Recon page. The Topology view uses a force-directed graph (e.g., React Flow or D3). The center node is the pentester. APs orbit the center. Clients orbit the APs. The thickness of the connecting lines represents signal strength (RSSI), providing immediate, intuitive spatial awareness that wows the user.

### 8.3 Context Preservation in a Single Page App (SPA)
**The Gap:** A user scrolls down 100 rows in the Recon table, clicks a network to open the side panel, starts a Deauth attack, and then clicks the "Attacks" tab in the sidebar to monitor it. When they click "Recon" to go back, the React component remounts, the scroll position is lost, the sorting is reset, and the side panel is closed. This causes immense frustration.
**The Fix:** The UI state (sort column, filter text, scroll offset of the virtualized table, and currently selected BSSID) must be persisted in the global Zustand store, not local component state. Navigating between pages must feel perfectly seamless, resuming exactly where the operator left off.

### 8.4 Notification Spam & Focus Mode
**The Gap:** In a busy RF environment, a background scan might discover 200 networks and 500 clients in two minutes. If we fire a toast notification for every minor success, the top-right of the screen will be completely obscured by a backlog of 50 toasts, blocking the UI.
**The Fix:** 
- **Debouncing & Grouping:** If 5 handshakes are captured in 2 seconds, emit one toast: *"5 new handshakes captured"*.
- **Focus Mode:** Add a `[ 🌙 Focus Mode ]` toggle in the topbar that suppresses all `INFO` and `WARN` toasts, only allowing `ERROR` toasts to pop up. All other events are relegated strictly to the Event Feed.

### 8.5 Mobile Viewport (The True Backpack Mode)
**The Gap:** We discussed "Backpack Mode" via audio cues. However, a pentester will likely access the Wcarck UI from their smartphone browser (`http://10.0.x.x:8080`) while the laptop is in the backpack. The 64px sidebar and 380px slide-out right panel will completely break on a 390px iPhone screen.
**The Fix:** Implement strict responsive breakpoints (`md:` in Tailwind). 
- On mobile `< 768px`, the left sidebar disappears and becomes a fixed **Bottom Tab Bar** (like standard iOS apps).
- The 380px right-side detail panel changes into a full-screen **Bottom Sheet** modal that drags up from the bottom of the screen.

### 8.6 The Pentester's Deliverable (Client Reporting)
**The Gap:** The user finishes the 3-hour engagement. They have 12 handshakes and 4 portal passwords. We built a beautiful "AI Debug Bundle" for developers, but we forgot the *actual* user goal: providing a report to their client. The user shouldn't have to scrape the SQLite database manually to write their PDF.
**The Fix:** Add a `[ 📄 Generate Client Report ]` button in the Session view. This triggers the backend to compile a clean, non-technical CSV/HTML summary of the session: Target ESSIDs, encryption vulnerabilities found, captured credentials (masked), and a summary of mitigation recommendations.

---

## 9. Final Verdict & Next Steps

The theoretical planning phase is 100% complete. Every edge case from React re-renders to SQLite WAL deadlocks, USB resets, Docker limitations, IPv6 leaks, DFS radar scans, and mobile UX paradigms has been anticipated and designed for.

### Implementation Rollout Plan (Phase 1 adjusted)

To move into execution efficiently without getting bogged down, follow this strict build order:

1. **Step 1: The Core Spine.** 
   Implement `EventBus`, `Module` base class, `RadioLeaseManager`, and `AsyncLogWriter`. Write unit tests for these. They must be bulletproof.
2. **Step 2: Database & State.** 
   Implement Alembic migrations, SQLAlchemy models, and the `job_queue`. Ensure the `PRAGMA wal` settings are hardcoded.
3. **Step 3: Hardware Control.** 
   Implement `AdaptersModule` with the unmanaged NetworkManager bypass, the `REGDOMAIN` fix, and the `AdapterWatchdog`.
4. **Step 4: Subprocess Engine.** 
   Implement `ManagedProcess` with Process Groups and asyncio pipe drains.
5. **Step 5: API & UI Scaffold.** 
   Connect FastAPI WebSockets to the EventBus. Scaffold the React dashboard.

No more planning is required. The blueprint is perfect. Proceed to `git init`.
