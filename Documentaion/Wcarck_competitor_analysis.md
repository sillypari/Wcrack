# Wcarck Competitor Analysis — bettercap, Airgeddon, wifiphisher, wifite2

**Author:** Parikshit (Wcarck project)
**Date:** 03 June 2026
**Companion to:** `Wcarck.md` v0.1.4
**Purpose:** Extract concrete, license-clean code patterns and architectural decisions
from the four reference tools so Wcarck V1 can ship a phishing workflow that is
robust, reliable, and highly customizable without overloading the first
release with reporting/compliance work.

All four tools are GPL-2/3. Wcarck is GPL-3.0. Code ports are license-clean
provided attribution + same-license are preserved (which we do by publishing
the file path + upstream line refs in this doc).

---

## 1. Executive synthesis — at a glance

| Area | bettercap (Go, 2.41.7) | Airgeddon (Bash, 12.0) | wifiphisher (Py, 1.4+) | wifite2 (Py, 2.2.5) | **Wcarck decision** |
|---|---|---|---|---|---|
| Plugin/module model | Best-in-class `Module`+`Param`+`Handler` with regex-validated commands and `<iface>` token substitution (`session/module.go:16-29`) | Hook-based (override/pre/post) via filename convention (`plugins/plugin_template.sh:45-96`) | Class contract with `shared_data` namedtuple (`extensions.py:35-69`) | Flat subclass chain, no real plugin system | **Adopt bettercap's `Module`/`Param`/`Handler` triad**; wcarck core attacks become modules; plugin discovery scans `~/.wcarck/modules/*.py` |
| Event bus | Non-blocking broadcast with ring buffer + per-listener `recover()` (`session/events.go:133-153`) | None — bash subshells | Global `terminate` flag + log file | None — single process | **Adopt bettercap's bus** as the spine: every module pushes events, REST/WS consume them; React UI is just a listener |
| Captive portal templating | None — relies on `http.server` + static dir | Hand-coded HTML in 1 file with embedded vendor logos as base64 | `config.ini` + `html/index.html` + `{{var}}` per template (`phishingpage.py:48-89`) | N/A | **Adopt wifiphisher's template bundle** (config.ini + html/ + static/) but use **Jinja2** with **strict auto-escape** (wifiphisher uses Tornado, not much safer) |
| DNS sinkhole | `dns.spoof` with iptables DNAT (`firewall_linux.go:114-122`) | dnsmasq with `address=/#/IP` + Google exception IPs (`airgeddon.sh:13112-13125`) | dnsmasq + Google IPs at `172.217.5.78` (`accesspoint.py:57-63`) | N/A | **Adopt wifiphisher's Google IP exception block** + aiohttp portal that returns the right "continue browsing" hint to pass Android/iOS probes |
| HTTP server | `goproxy` HTTPS-MITM (we DON'T want this in V1) | `lighttpd` + bash CGI (CVE bait) | Tornado on 8080 + HTTPS→HTTP 302 on 443 (`phishinghttp.py:185-216`) | N/A | **Use aiohttp** (already in our plan) — no CGI, no shell, no MITM; HTTPS port just 302s to HTTP |
| Credential capture | Custom JS caplet hooks (`onRequest`/`onResponse`) | `aircrack-ng` against pre-captured handshake (`airgeddon.sh:13498-13509`) | Regex on POST body, plain-text file | N/A | **Adopt airgeddon's offline validation** — submit POST → spawn `aircrack-ng -a 2 -b <bssid> -w <tmp> <hs.cap>` async, return 200/401 based on `KEY FOUND!`. This is the killer feature. |
| iptables / nftables | Per-redirection `ExcludeAddress` to avoid loop (`firewall_linux.go:114-122`) | Per-instance chain naming `nat_<inst>` (`airgeddon.sh:11966-12015`) | 4 hard-coded DNAT rules (`firewall.py:34-52`) | None | **Adopt airgeddon's per-instance chain naming** with nftables; clean teardown = `nft flush chain inet wcarck et_<id>` |
| Deauth | Burst 64 frames, both directions, on locked channel (`wifi_deauth.go:13-29`) | `mdk4 d` / `aireplay-ng --deauth 0`, polls handshake file every 5s, auto-kills | 2 frames per direction (deauth + disassoc), channel-bucketed send queue | `Aireplay` thread wrapper, no auto-stop | **Adopt bettercap's burst pattern** + airgeddon's poll-and-kill auto-stop in a FastAPI BackgroundTask |
| Handshake validation | EAPOL M1 of 4 detected via `key.Install && key.KeyACK && !key.KeyMIC` (clientless PMKID attack too) | File size + aircrack probe (`check_bssid_in_captured_file`) | N/A | tshark-based 4-EAPOL state machine, requires all 4 from same (target, client) pair, in order (`tools/tshark.py:31-79`) | **Adopt wifite2's 4-EAPOL state machine** as the gold standard. Expose per-M1/M2/M3/M4 progress over WebSocket. |
| Target selection | Free-form (operator-driven) | Free-form (operator-driven) | Free-form | Sort by signal power only (`airodump.py:173`) | **Beat them all** — sort by `(clients × 100 + power)`, drop 0-client targets, surface "best target" hint in UI |
| Multi-card handling | Auto via required-deps (`Requires`) | Per-mode hand-coded | Single iface for AP, single for monitor | Single iface, picked at start | **Wcarck advantage** — our udev naming + 3-radio plan is ahead of all 4 |
| Process lifecycle | `SetRunning` with 10s stop timeout (`session/module.go:229-287`) | PIDs in `${tmpdir}et_processes` array, recursive kill | `on_exit()` callback per extension (`accesspoint.py:159-178`) | `Process` SIGINT→SIGTERM→kill cascade + `__del__` safety net (`util/process.py:91-100,153-184`) | **Adopt wifite2's `Process` cascade** as a stdlib `asyncio.create_subprocess_exec` wrapper. Critical for our REST `/attack/stop` endpoint. |
| Subprocess management | `gopacket`/`pcap` direct (in-process) | `xterm`/`tmux` windows | `subprocess` with global state | `Popen`+polling with threads | **Use asyncio subprocesses + the `Process` cascade** |
| WPS / Pixie Dust | None | None | `wpspbc` extension | reaver preferred, bully fallback, `Detected AP rate limiting` detection | Out of V1 scope; design plug-in point for V2 (Phase 6 stretch item already in roadmap) |
| OAuth / SSO capture | None | None | Fake Facebook form + OS-chrome lookalike popup (`oauth-login` template) — **not** real OAuth | None | **Adopt the OS-chrome lookalike** as a portal style; do **not** try real OAuth/MITM-cookie theft in V1 (reliability minefield) |
| Lure10 / captive detection bypass | None | DNS exception + `iptables` yank | Beacon flood with known SSIDs (`KNOWN_BEACONS`) | None | **Adopt wifiphisher's Google IP exception + our DNS sinkhole**; drop Lure10 (Windows feature dead since 2016) |
| Async model | Goroutines + event bus | Sync bash with xterm windows | Tornado IOLoop | Sync `while/poll` + Thread for output drain | **asyncio all the way** — FastAPI native |
| UI | REST + WebSocket + JS caplets | xterm/tmux per tool | curses TUI | ANSI TUI | **React + Vite + shadcn** (already in plan) |
| WiFi ↔ BT ↔ Ethernet cross-protocol | All in one Session | WiFi only | WiFi only | WiFi only | **WiFi only for V1**; design seam for BT/Ethernet in V2 |

---

## 2. Cross-cutting patterns (seen in 2+ tools)

### 2.1 Channel-locked packet injection
**Seen in:** bettercap (`modules/wifi/wifi_hopping.go:44-63`), wifiphisher (`extensions.py:136-170`)

Wcarck needs to ensure that scapy, airodump, hostapd, dnsmasq, and our deauth
coroutine all agree on which channel the monitor-mode radio is on at any given
millisecond. Otherwise we get cross-channel frames, missed handshakes, and
mysterious "no clients" reports.

**Wcarck action:** introduce a `RadioChannelGuard` async context manager:
```python
class RadioChannelGuard:
    """Acquires exclusive use of wlan_mon on a specific channel."""
    def __init__(self, iface: str, channel: int): ...
    async def __aenter__(self):
        async with self._bus.channel_lock(iface):
            await self._set_channel(channel)
            return self
    async def __aexit__(self, *exc): ...
```

Any module that wants to send packets on a channel must acquire the guard.
This eliminates the entire class of "two scans stomped each other" bugs.

### 2.2 Handshake-capture auto-stop
**Seen in:** airgeddon (`airgeddon.sh:3950-3971`), bettercap (implicit via `wifi.recon.handshakes` event)

A deauth loop that doesn't auto-stop is a footgun: it keeps blasting frames,
interferes with the new association, and burns CPU. The fix is a poll loop
that watches the cap file and breaks on a valid handshake.

**Wcarck action:** in `crack_jobs.crack_jobs`/Phase 6, but more importantly in
`DeauthJob.run()`:
```python
async def deauth_until_handshake(target: BSSID, timeout_s: int = 60):
    cap_path = f"/var/lib/wcarck/captures/{target}.cap"
    proc = await asyncio.create_subprocess_exec(
        "hcxdumptool", "-i", "wlan_mon", "-c", str(target.channel),
        "-w", cap_path, "-B", target.bssid)
    deauth = asyncio.create_subprocess_exec(
        "aireplay-ng", "--deauth", "0", "-a", target.bssid, "wlan_mon")
    try:
        while True:
            valid = await handshake_validator.is_valid(cap_path, target)
            if valid: break
            await asyncio.sleep(5)
    finally:
        deauth.terminate(); await deauth.wait()
        proc.terminate(); await proc.wait()
```

### 2.3 Process lifecycle cascade
**Seen in:** wifite2 (`util/process.py:153-184`), bettercap (`session/module.go:229-287`)

Every `asyncio.create_subprocess_exec` call in Wcarck must go through a
`Process` wrapper that:
1. Sends SIGINT to the child on stop
2. Polls for 2 seconds
3. Sends SIGTERM
4. Calls `proc.kill()` if still alive
5. Tolerant of `OSError: No such process`

This is the single most common source of "zombie hostapd on port 67" bugs.
Adopt the cascade verbatim from wifite2.

### 2.4 Per-session iptables/nftables chain
**Seen in:** airgeddon (`airgeddon.sh:11966-12015`)

If two Evil Twin sessions are alive (operator testing, or V2 multi-engagement),
their iptables rules will collide. The fix is a per-session chain name.

**Wcarck action:** every Evil Twin session gets `nft add chain inet wcarck et_<session_id>` and
teardown is `nft flush chain inet wcarck et_<session_id> && nft delete chain inet wcarck et_<session_id>`.
No global `nft flush ruleset` ever.

---

## 3. Wcarck architecture impact — by component

### 3.1 Captive portal server (Phase 4, V1)

**Current plan:** aiohttp, 6 templates, Jinja2, `csrf_token`.

**Improvements from this analysis:**

1. **Template bundle layout** (from wifiphisher). Each template lives in:
   ```
   backend/wcarck/portal/templates/<name>/
       config.ini         # [info] name, description
                          # [context] default key=value pairs
       html/index.html    # entry, with {{var}} placeholders
       html/loading.html  # optional intermediate
       html/verify.html   # optional post-submit
       static/            # css/js/images, served at /static/<name>/<file>
   ```
   `TemplateManager.__init__` walks the dir, validates `config.ini + html/`, registers
   in `available_templates: dict[str, PortalTemplate]`. New templates can be
   dropped in and picked up on the next start (or, with file-watcher, live).

2. **Portal context** as a Pydantic `BaseModel` passed to every template render
   (replaces wifiphisher's loose dict):
   ```python
   class PortalContext(BaseModel):
       ssid: str
       bssid: str | None
       channel: int
       vendor: str | None
       logo_path: str | None
       brand_color: str = "#0066cc"
       custom_message: str = ""
       csrf_token: str
       submit_url: str = "/"
       advanced_captive_portal: bool = False
       mac_matcher_vendor_data: dict = {}
   ```

3. **Offline credential validation** (from airgeddon, the killer feature):
   the portal POST handler never stores the password; it spawns:
   ```bash
   aircrack-ng -a 2 -b <bssid> -w <(echo "<password>") <handshake.cap>
   ```
   and returns 200 (valid) or 401 (invalid) based on `KEY FOUND!` in stdout.
   Pros: 100% accurate, zero RF exposure during validation, no need to stand
   up the real network ("wished network" approach).
   Cons: requires the handshake to be pre-captured; first submission takes
   ~3s for the aircrack round-trip.

   **Wcarck decision:** ship this as the default validator. Add a fallback
   to "always accept" mode for lab/demo (with a giant warning in the UI).

4. **DNS sinkhole config** (verbatim from wifiphisher + airgeddon):
   ```
   # /etc/dnsmasq.d/wcarck-<session>.conf
   no-resolv
   no-poll
   dhcp-range=10.0.0.2,10.0.0.100,255.255.255.0,12h
   dhcp-option=3,10.0.0.1
   dhcp-option=6,10.0.0.1
   log-queries
   log-facility=/var/log/wcarck/dns-<session>.log
   # Captive portal detection bypass (Android/iOS):
   address=/google.com/172.217.5.78
   address=/clients3.google.com/172.217.11.174
   address=/connectivitycheck.gstatic.com/172.217.5.78
   # Catch-all:
   address=/#/10.0.0.1
   ```
   The three `google.com`/`clients3.google.com`/`connectivitycheck.gstatic.com`
   lines are the Wifiphisher-tested set for 2026. Make them configurable in
   `config.toml` so we can update without code change.

5. **iptables NAT (nftables in 2026)**:
   ```
   table inet wcarck {
       chain prerouting {
           type nat hook prerouting priority -100; policy accept;
           iifname "wlan_ap" tcp dport { 80, 8080, 53 } dnat to 10.0.0.1
           iifname "wlan_ap" udp dport 53 dnat to 10.0.0.1
       }
       chain postrouting {
           type nat hook postrouting priority 100; policy accept;
           # NO MASQUERADE in captive mode — we want traffic to be cut off
       }
   }
   ```
   Per-session: `nft add table inet wcarck_et_<id>` and same teardown cascade.

6. **OS-chrome lookalike portal** (from wifiphisher's `oauth-login`): a
   new `dialog-os.html` template that detects `navigator.platform` and renders
   a Mac/Windows-style modal in-page. It's social-engineering theater but it
   works. We add it as a 7th template (not MVP-blocking, but cheap to add
   given the existing template infrastructure).

### 3.2 Deauth engine (Phase 3, V1)

**Current plan:** aireplay-ng + scapy fallback.

**Improvements:**

1. **Burst pattern** (from bettercap `wifi_deauth.go:13-29`): send 64 frames
   in a tight loop with sequence numbers 0-63, in *both* directions
   (AP→STA and STA→AP) so the client disassociates from the AP's side too.
   Reason code 7 (`Class 3 frame from nonassociated STA`) is the most disruptive.

2. **DoS pursuit mode** (from airgeddon `pid_control_pursuit_mode`): keep a
   secondary monitor interface on a channel-hopper to detect when the real
   AP changes channel mid-attack, and re-pivot the deauth loop. Without this,
   a 2.4/5 coexistence client will defeat the attack in ~5s.

3. **Deauth engine state machine** (from wifiphisher `deauth.py:136-207`):
   explicit states: `IDLE → ARMED → DEAUTHING → HANDSHAKE_CAPTURED → STOPPING → IDLE`,
   with the WebSocket UI subscribed to transitions.

### 3.3 Handshake validator (Phase 3, V1)

**Current plan:** hcxdumptool, export to 22000.

**Improvements:**

1. **4-EAPOL state machine** (from wifite2 `tools/tshark.py:31-79`): adopt
   verbatim. Emit per-M1/M2/M3/M4 progress events to the React UI. The state
   machine rejects:
   - Anything where `total != 4`
   - Out-of-order M1→M3 (must be strict `index - 1 == previous`)
   - Different (target, client) pairs across the 4 messages

2. **Multi-tool cross-check** (from wifite2 `model/handshake.py:73-80`): also
   use `tshark` *and* a scapy EAPOL parser. If either says "valid", accept.
   Saves the "tshark crashed, scapy says no, but the handshake is actually
   fine" false negative.

3. **PMKID via clientless association** (from bettercap `wifi_assoc.go:13-25`):
   send a fake Auth+AssocReq, the AP's first EAPOL-Key frame M1/4 contains
   the PMKID. Saves needing a connected client.

4. **Hashcat format**: only emit `.22000` (WPA-PBKDF2-PMKID+EAPOL). The legacy
   hccapx and 2500/16800 mode combinations are obsolete; the 22000 mode
   handles both PMKID and EAPOL in one file (wifite2 still has the 2500/16800
   bug; we won't repeat it).

### 3.4 Module / plugin architecture (cross-cutting)

**Current plan:** no plugin system; all logic in `backend/wcarck/`.

**Improvements (the biggest architectural change from this analysis):**

Adopt bettercap's `Module` + `Param` + `Handler` triad. Every Wcarck feature
becomes a module:

```python
class Module(Protocol):
    name: str
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
    validator: str | None = None       # regex or function name
    description: str
    # Token substitution like bettercap's <interface name>, <random mac>
    resolves_at: Literal["startup", "runtime"] = "startup"

class ModuleHandler(BaseModel):
    name: str                          # e.g. "wifi.deauth BSSID"
    regex: str                         # e.g. r"wifi\.deauth ([a-fA-F0-9:]{11,})"
    description: str
```

Built-in modules in V1:
- `AdaptersModule` — interface discovery, mode switching, channel control
- `ScanModule` — wraps airodump-ng CSV stream
- `DeauthModule` — burst deauth with auto-stop on handshake
- `HandshakeCaptureModule` — hcxdumptool + 4-EAPOL validator
- `PMKIDCaptureModule` — clientless association
- `EvilTwinModule` — hostapd + dnsmasq + aiohttp portal
- `CaptivePortalModule` — template bundle manager, credential capture
- `CrackModule` (Phase 6) — hashcat/john wrapper
- `AuditModule` — chained-hash log writer
- `APIRESTModule` — FastAPI route auto-registration from `handlers`

User-supplied plugins: `~/.wcarck/modules/*.py` — auto-discovered at startup,
each must expose a `register(registry: ModuleRegistry) -> None` function.
This is the Wcarck answer to airgeddon's hook system and wifiphisher's
extension class contract, but typed and async-native.

### 3.5 Event bus (cross-cutting)

**Current plan:** WebSocket plumbing, no formal event model.

**Improvements:**

Adopt bettercap's non-blocking broadcast event bus. In Python:
```python
class EventBus:
    def __init__(self, ring_size: int = 10_000):
        self._ring: collections.deque[Event] = collections.deque(maxlen=ring_size)
        self._subs: dict[str, list[asyncio.Queue[Event]]] = defaultdict(list)
        self._lock = asyncio.Lock()
    async def publish(self, event: Event) -> None:
        async with self._lock:
            self._ring.append(event)
        for q in self._subs[event.tag]:
            try: q.put_nowait(event)
            except asyncio.QueueFull: pass  # drop, never block
    def subscribe(self, tag: str) -> asyncio.Queue[Event]:
        q: asyncio.Queue[Event] = asyncio.Queue(maxsize=1024)
        self._subs[tag].append(q)
        return q
    def replay_from(self, idx: int) -> list[Event]:
        # REST /api/events?from=N for React tab-refresh
        return list(self._ring)[idx:]
```

Every module publishes; the WebSocket endpoint subscribes; the audit log
module subscribes to everything; the React UI subscribes to specific tags
(`scan.network`, `attack.deauth.tick`, `crack.job.progress`, etc.).

This is what makes the React UI feel alive. It's also what lets Phase 6
add `crack.job.*` events without touching any of the upstream modules.

### 3.6 Subprocess / process lifecycle (cross-cutting)

**Current plan:** not specified.

**Improvements:**

Adopt wifite2's `Process` SIGINT→SIGTERM→kill cascade. In our asyncio world:
```python
class ManagedProcess:
    def __init__(self, *args, **kwargs): self.proc = None; self.args = args
    async def start(self): self.proc = await asyncio.create_subprocess_exec(*self.args, ...)
    async def stop(self, grace: float = 2.0):
        if not self.proc or self.proc.returncode is not None: return
        self.proc.send_signal(signal.SIGINT)
        try: await asyncio.wait_for(self.proc.wait(), timeout=grace); return
        except asyncio.TimeoutError: pass
        self.proc.terminate()
        try: await asyncio.wait_for(self.proc.wait(), timeout=grace); return
        except asyncio.TimeoutError: pass
        self.proc.kill()
        await self.proc.wait()
    def __del__(self):
        # Safety net: if GC'd without explicit stop, SIGINT
        if self.proc and self.proc.returncode is None:
            try: self.proc.send_signal(signal.SIGINT)
            except OSError: pass
```

Every airodump, aireplay, hcxdumptool, hostapd, dnsmasq invocation goes
through this. /api/attack/stop is `await self.current_job.stop()`.

---

## 4. Concrete changes to `Wcarck.md` v0.1.1

Apply these in a v0.1.2 revision:

1. **Section 8 (Project Structure)** — add `backend/wcarck/core/{module.py, event_bus.py, process.py, scope_guard.py}` and `backend/wcarck/modules/{adapters,scan,deauth,handshake,pmkid,evil_twin,portal,crack,audit,api_rest}/__init__.py`.

2. **Section 9 (Database Schema)** — add `module_state` table (name, running, params_json, started_at).

3. **Section 10 (API Surface)** — add `/api/modules`, `/api/modules/{name}/{handler}`, `/api/events?from=N`, `/api/modules/{name}/start`, `/api/modules/{name}/stop`. The existing per-attack endpoints (`/api/attacks/deauth`, etc.) become thin wrappers over the module handler dispatch.

4. **Section 11 Phase 4** — replace the bullet "6 captive portal templates" with a reference to the wifiphisher-style template bundle spec, and add a 7th template `dialog_os` as a stretch item.

5. **Section 11 Phase 3** — split "Deauth engine" into two bullets: "Burst deauth (64-frame, both directions, reason 7)" and "DoS pursuit mode (re-pivot on AP channel change)".

6. **Section 11 Phase 6** — add "Offline credential validation in portal (`aircrack-ng -a 2 -b ...` per submission, async, 100% accurate)".

7. **Section 12 (MVP Safety Model)** — document the plugin trust boundary: plugins run in-process, no sandbox, so MVP should keep third-party plugins disabled by default.

8. **Section 17 (Captive Portal Templates)** — rewrite as the wifiphisher template bundle spec with our Jinja2 + aiohttp rendering layer.

9. **New Section 26 (Module & Plugin Reference)** — document the `Module`/`Param`/`Handler` contract, built-in modules, plugin discovery, and the `~/.wcarck/modules/` convention.

10. **New Section 27 (Reference Tool Notes)** — credit the four reference tools with their license, key files we adapted from, and the URLs. Required by GPL attribution.

---

## 5. New features to add (not in the original plan)

### 5.1 `wcarck plugin install <name|path>`
Installs a third-party module from a local path or a git URL. Verifies the
plugin exposes `register(registry) -> None`, runs a 5-second dry-run, and
writes to `~/.wcarck/modules/`. Sourced from the airgeddon plugin system +
bettercap's caplet model.

### 5.2 `wcarck tui` — a terminal mirror of the React UI
A Textual app that subscribes to the same event bus. Useful for SSH sessions
and headless servers. Patterns from wifite2's `util/color.py:1-121` give us
the building blocks, but we use Textual (modern, async-native) instead of
hand-rolled ANSI.

### 5.3 Live target re-ranking
Continuously re-rank in-DB targets by `(clients × 100 + power)`, drop targets
that go 0 clients for >30s, surface "best Evil Twin candidate" badge in the
UI. Wifite2 only sorts by power; we beat this with a heuristic.

### 5.4 Beaconset (SSID list) editor
A YAML editor for the SSID list used by beacon spam, with categories
(`home_routers`, `coffee_shops`, `airports`, `hotels`, `enterprise`).
A seeded default set is shipped; the operator can edit live and the deauth
loop picks up changes via file-watcher. The ESP8266 CutePieBoard already
ships a 25-SSID list; we extend that.

### 5.5 Plugin audit / signing (V2)
Phase 6 stretch: GPG-signed modules, public key fingerprint recorded in
`plugin_registry`, `wcarck plugin verify` command. References Q11 in
Section 20 of the plan.

---

## 6. Anti-patterns to avoid (synthesized)

1. **No global mutable state.** Wifiphisher's `template = False` globals
   (`phishinghttp.py:25-28`) and airgeddon's 509 global variables will
   destroy testability. All Wcarck state lives in injected services or
   module attributes.

2. **No bash CGI.** Airgeddon's `cgi.assign = (".htm" => "/bin/bash")` is a
   CVE magnet. We use aiohttp with strict input validation.

3. **No `from scapy.all import *`.** Wifiphisher's `sniffer.py:11` does this;
   we import `scapy.layers.dot11`, `scapy.layers.eap`, `scapy.layers.radius`
   explicitly. Cleaner namespaces, faster startup.

4. **No SIGKILL on NetworkManager.** Wifiphisher's `kill_interfering_procs()`
   (`pywifiphisher.py:285-314`) hard-kills wpa_supplicant/NetworkManager/avahi.
   For a localhost GUI on a laptop the operator uses daily, this is rude.
   We only stop the specific interfaces we own, leave NM alone.

5. **No `sleep N` as synchronization.** Airgeddon has 30+ `sleep` calls
   awaiting service readiness. Wcarck waits on actual signals: port-open
   polls for HTTP servers, journal-watch for hostapd `AP-ENABLED`, dnsmasq
   ack-time, etc.

6. **No per-OS shims at source-file level.** Bettercap's `//go:build darwin`
   trick fragments the codebase. We're Ubuntu-only; we write one happy path
   and document the dependency.

7. **No hand-rolled ANSI TUI.** Wifite2's `util/color.py:1-121` is a
   maintenance burden. For our TUI mirror we use Textual.

8. **No synchronous `while/poll` loops.** Wifite2's blocking `time.sleep(0.5)`
   patterns freeze the program. Everything in Wcarck is `asyncio.create_subprocess_exec`
   + `await asyncio.wait_for` + `ManagedProcess`.

9. **No hardcoded Google IPs in source.** Wifiphisher hardcodes
   `172.217.5.78` in `accesspoint.py:62`. We put these in `config.toml`
   under `[captive_portal.captive_detection_bypass]` and refresh them
   on portal start (with a stale-IP warning if the lookup fails).

10. **No Pyrit, no `-m 2500`/`-m 16800`.** Wifite2 still depends on the
    unmaintained Pyrit and uses the legacy hashcat modes. Wcarck is
    modern: only `-m 22000` for both PMKID and EAPOL.

---

## 7. License & attribution

All four tools are GPL (2 or 3). Wcarck is GPL-3.0. The following files
will be lifted with attribution in code comments:

| Source | Lines | Adapted to |
|---|---|---|
| `bettercap/session/module.go:16-29` | (entire file is 287 lines) | `backend/wcarck/core/module.py` |
| `bettercap/session/module_param.go:24-94` | full file | `backend/wcarck/core/module_param.py` |
| `bettercap/session/module_handler.go:22-77` | full file | `backend/wcarck/core/module_handler.py` |
| `bettercap/session/events.go:14-200` | full file | `backend/wcarck/core/event_bus.py` |
| `bettercap/modules/wifi/wifi_deauth.go:13-29` | 17 lines | `backend/wcarck/modules/deauth/burst.py` |
| `bettercap/firewall/firewall_linux.go:114-122` | 9 lines | `backend/wcarck/portal/nftables.py` |
| `airgeddon/airgeddon.sh:13112-13125` | 14 lines | `backend/wcarck/portal/dnsmasq_templates/captive.conf.j2` |
| `airgeddon/airgeddon.sh:11966-12015` | 50 lines | `backend/wcarck/core/nftables.py` (chain naming) |
| `airgeddon/airgeddon.sh:13474-13531` | 58 lines | `backend/wcarck/portal/validators/aircrack.py` |
| `airgeddon/airgeddon.sh:3950-3971` | 22 lines | `backend/wcarck/modules/deauth/pursuit.py` (auto-stop) |
| `airgeddon/plugins/plugin_template.sh:45-96` | 52 lines | `backend/wcarck/core/plugin_loader.py` (hook naming) |
| `wifiphisher/wifiphisher/common/phishingpage.py:48-89` | 42 lines | `backend/wcarck/portal/template_manager.py` |
| `wifiphisher/wifiphisher/common/phishinghttp.py:185-216` | 32 lines | `backend/wcarck/portal/server.py` (aiohttp rewrite) |
| `wifiphisher/wifiphisher/common/accesspoint.py:49-73` | 25 lines | `backend/wcarck/portal/dnsmasq_templates/captive.conf.j2` (Google IPs) |
| `wifiphisher/wifiphisher/common/extensions.py:35-69` | 35 lines | `backend/wcarck/core/module.py` (extension contract) |
| `wifiphisher/wifiphisher/extensions/deauth.py:54-81` | 28 lines | `backend/wcarck/modules/deauth/state.py` |
| `wifite2/wifite/util/process.py:153-184` | 32 lines | `backend/wcarck/core/process.py` |
| `wifite2/wifite/tools/tshark.py:31-79` | 49 lines | `backend/wcarck/modules/handshake/validator.py` |
| `wifite2/wifite/tools/dependency.py:4-15` | 12 lines | `backend/wcarck/core/external_tool.py` |
| `wifite2/wifite/attack/all.py:42-105` | 64 lines | `backend/wcarck/core/attack_orchestrator.py` |
| `wifite2/wifite/model/target.py:13` | (1 class, 30 lines) | `backend/wcarck/models/target.py` (Pydantic port) |
| `wifite2/wifite/model/result.py:40-67` | 28 lines | `backend/wcarck/models/crack_result.py` (with dedup) |

A `NOTICE` file at the repo root will list all four upstream projects,
their versions, and the files we adapted from — GPL attribution requirement.

---

## 8. Implementation priority for V1 (re-ordering Phase 1-3)

Based on this analysis, the Phase 1-3 build order changes slightly:

1. **Day 1-2 (Module core)** — implement `core/module.py`, `core/event_bus.py`,
   `core/process.py`, `core/scope_guard.py`, `core/external_tool.py`.
   This is the spine everything else hangs off. Better to start here than
   bolt it on later.

2. **Day 3-4 (Adapters + Scan modules)** — `AdaptersModule` and `ScanModule`.
   First real engine modules; they exercise the event bus end-to-end.

3. **Day 5-6 (Deauth + Handshake modules)** — `DeauthModule` with burst +
   pursuit mode; `HandshakeCaptureModule` with the 4-EAPOL state machine.

4. **Day 7 (PMKID + Crack module skeleton)** — `PMKIDCaptureModule` and the
   `crack_jobs` table; no hashcat UI yet, but the data model is locked.

5. **Day 8-9 (Evil Twin + Portal)** — `EvilTwinModule` orchestrates
   hostapd+dnsmasq; `CaptivePortalModule` ships the template bundle system
   and the offline aircrack validator.

6. **Day 10 (API REST module + Audit)** — `APIRESTModule` auto-registers
   routes from the registered modules' `handlers`; `AuditModule` subscribes
   to all events and writes the chained-hash log.

7. **Day 11-14 (React UI)** — Dashboard, Recon, Attacks, Evil Twin, Captures,
   Credentials, Modules, Audit, Scope, Settings pages. Each subscribes to
   specific event-bus tags.

This compresses the original "Phase 1 = scaffold" into "Phase 1 = module
core" — the scaffold is incidental, the architecture is the deliverable.

---

## 9. Validation criteria

Before each phase ships, the following must pass:

- **Phase 1 (module core):** unit tests for `Module.register`, `EventBus.publish`
  (does not block), `EventBus.subscribe` (replay-from-N correctness), and
  `ManagedProcess` SIGINT→SIGTERM→kill cascade with a real `sleep 9999` test
  process.

- **Phase 2 (scan):** against `mac80211_hwsim radios=4` test fixture, 4
  virtual APs + 2 virtual STAs, the scanner must populate the `networks`
  and `clients` tables within 10 seconds, and the event bus must surface
  each new network as a discrete event.

- **Phase 3 (deauth + handshake):** against hwsim, deauth an STA off a
  simulated AP, the 4-EAPOL validator must reach `valid=True` within 30s
  for at least one test AP, and the `.22000` export must load into
  `hashcat -m 22000 --benchmark` without errors.

- **Phase 4 (evil twin + portal):** spawn an hwsim STA, start the Evil Twin,
  POST a wrong and a right password to the captive portal, the offline
  aircrack validator must return 401 and 200 respectively within 5s each.
  The credentials table must contain exactly 1 row (the valid one) and the
  audit log must contain `denied` and `ok` entries for the two submissions.

- **Phase 6 (crack):** with a known PMKID capture, `hashcat -m 22000 -a 0`
  with a small wordlist must produce a `cracked_plaintext` row in `crack_jobs`
  within 10s; the GPU/CPU detection must pick the right device.

---

## 10. Post-scrutiny addendum — v0.1.3 architecture hardening

Reviewing `Wcarck.md` v0.1.2 against this competitor analysis showed that the
tool had enough attack and portal detail, but still needed the operational
spine of a professional pentest product. The missing pieces were not more
attack primitives; they were resource control, job lifecycle, evidence handling,
and a safer plugin boundary.

### 10.1 Architecture gaps found

| Gap | Why it matters | v0.1.3 change |
|---|---|---|
| Engines vs modules contradicted each other | The tree still had `engines/` while Sections 26-27 made modules the core abstraction | First-class `core/`, `orchestration/`, and `modules/` directories added |
| No hardware contention model | Wi-Fi adapters are scarce; scan, deauth, capture, and AP jobs can break each other | `RadioLeaseManager` with explicit lease types and `409 RESOURCE_BUSY` UX |
| Long-running actions lacked one lifecycle | API, CLI, UI, and plugins need one stop/status/audit path | Unified `job_queue`, `job_events`, and job state machine |
| Reports depended on loose files | A pentest tool must produce verifiable deliverables | `evidence_items`, `reports`, artifact hashes, and MVP PDF/JSON report |
| Plugin support was too trusting | Python plugins run with Wcarck's service privileges | Quarantine, capability declaration, SHA-256 record, disabled-by-default loading |
| Risky MITM extras were framed as built-ins | This distracts from the core Wi-Fi audit product and expands reliability/product risk | SSL strip / browser hook injection demoted to third-party/plugin-only |

### 10.2 New features promoted into the main plan

1. **Evidence-backed reports at MVP**: Phase 4 now ends with a PDF and JSON
   report containing scope, timeline, scan snapshots, captures, validated
   credentials, tool logs, and audit-chain verification.

2. **Radio/resource leases**: every adapter or compute device use goes through
   a lease. Conflicting jobs fail cleanly with a user-readable reason and the
   active job id.

3. **Unified job runner**: every long-running action has a job id, status,
   stop hook, teardown stack, event stream, scope id, user id, and audit trail.

4. **Evidence registry**: captures, screenshots, logs, credentials, and reports
   are hashed and tied to scope + job, making retention and reporting reliable.

5. **Plugin quarantine and verification**: plugin installation stages first,
   imports in a subprocess, records SHA-256, exposes requested capabilities,
   and requires explicit operator enablement.

6. **Live target scoring**: target ranking now considers associated clients and
   signal, not signal alone, with scan snapshots saved as report evidence.

7. **Resource-busy UI**: the frontend must show why an action is unavailable
   instead of letting a user create broken adapter states.

### 10.3 Updated V1 implementation priority

The Phase 1 spine is now:

1. `core/module.py`, `core/registry.py`, `core/event_bus.py`,
   `core/process.py`, `core/external_tool.py`.
2. `orchestration/jobs.py`, `orchestration/leases.py`, teardown stack,
   bounded async worker pool.
3. Baseline module registry, dummy job, lease acquisition/release, WebSocket
   event replay, audit row, and evidence placeholder.
4. Adapter discovery and mode switching through jobs, not direct UI calls.
5. Only then Scan/Deauth/Handshake modules.

This ordering is stricter than the first analysis because retrofitting leases
and jobs after attack modules exist would create churn and bugs.

### 10.4 Updated validation criteria

- A conflicting scan/deauth/AP job must return `409 RESOURCE_BUSY` without
  changing adapter mode.
- Killing Wcarck mid-Evil-Twin job and restarting must leave no orphan
  hostapd/dnsmasq process, nftables chain, lease row, or monitor-mode adapter.
- A full MVP engagement must produce a PDF + JSON report whose evidence hashes
  verify independently.
- Plugin install must quarantine by default, record SHA-256, and require
  explicit enablement before any handler is callable.
- No API, CLI, UI, or plugin-dispatched handler may bypass scope guard or lease
  acquisition.

---

## 11. v0.1.4 correction — MVP trim after flaw review

The v0.1.3 addendum correctly identified resource control and job lifecycle as
must-have architecture. It went too far by pushing evidence registry, PDF/JSON
reports, retention, and legal workflow into MVP. That would slow down the
initial release before the scan/capture/Evil Twin path is proven.

### 11.1 Flaws corrected

| Flaw in v0.1.3 | Correction in `Wcarck.md` v0.1.4 |
|---|---|
| MVP included full report generation | MVP now exports artifacts/logs; polished PDF/JSON reporting moves to Phase 5 |
| Evidence registry was treated as core MVP schema | MVP stores artifact paths + SHA-256; full registry later |
| Consent/legal workflow was first-run work | MVP setup is username/password only |
| Plugin install/signing was broad | Built-ins first; local plugin loading after core modules stabilize |
| Security/legal section dominated implementation plan | Replaced with a small MVP safety model |

### 11.2 What remains mandatory for MVP

- `RadioLeaseManager`
- Unified `job_queue` and `job_events`
- `ManagedProcess` for every external tool
- Engine-level target boundary
- Local-only backend
- Encrypted credential storage
- Per-session artifact paths + SHA-256
- Append-only session log

### 11.3 What moves to Phase 5

- Full evidence registry
- PDF/JSON report generator
- Retention cleanup and redaction
- Consent/legal workflow
- Plugin signing and remote plugin install
- Formal audit-chain verification

---

*End of Wcarck_competitor_analysis.md — Document Version 1.2*
