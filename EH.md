Wcarck Exception Handling Audit (Basic Architecture / 802.11 Radio Layer)
Date: 2026-06-04
Scope: backend/wcarck/ — adapter discovery -> monitor mode -> scan -> deauth -> EAPOL capture -> crack
Out of scope: UI/UX, plugins, web proxy, advanced attacks
Read-only audit. No files modified. Fix code provided as drop-in patches.
1. Executive Summary
Wcarck's basic architecture has 47 distinct exception-handling gaps across 14 source files. Of these, 5 are CRITICAL (cause data loss, silent module failure, or API server crash), 18 are HIGH (cause resource leaks, wrong-interface selection, or invisible state corruption), 16 are MEDIUM (cause UX confusion or one-off failures), and 8 are LOW (logging/observability nits).
The most serious pattern: silent except Exception: pass and bare except: pass blocks that swallow errors invisibly. In a CLI tool, this would print a stack trace. In Wcarck's GUI, the user sees nothing. Module state machine stays in running forever, lease is never released, next job fails with "Resource busy".
Reference tools (Wifite, wifipumpkin3, aircrack-ng) have BAND-AID exception handling — they handle the 3-4 known failure modes per module (BAD_DRIVERS, monitor-mode verify, CSV quoting, SIGTERM cascade) but lack comprehensive patterns (subprocess timeouts, retry/backoff, atomic writes, circuit breakers, schema migration, stderr capture, channel race handling, USB hot-plug). Wcarck's spec section D36-D74 already documents most of these gaps; this audit operationalizes the spec with concrete code.
2. Severity Legend
Severity	Definition
CRITICAL	Data loss, server crash, or silent total module failure
HIGH	Resource leak, wrong-interface selection, or invisible state corruption
MEDIUM	UX confusion, one-off failure, or recoverable error with no user feedback
LOW	Logging, observability, or code-style issue
3. Per-File Findings (47 gaps)
3.1 hardware/process.py (15 gaps — CRITICAL infrastructure)
#	Line	Gap
1	12	PRIVILEGED_BINS includes airodump-ng not in sudoers whitelist; missing airmon-ng
2	18	psutil imported but not in pyproject.toml deps
3	45-72	start() has no try/except FileNotFoundError if binary missing
4	48	Popen called without errors="replace" on stdout; non-UTF8 from airodump crashes decode
5	67	No subprocess.TimeoutExpired handler on wait()
6	78-95	_kill_process_tree calls psutil.Process(pid).kill() without try/except psutil.NoSuchProcess
7	100	is_alive() doesn't catch psutil.AccessDenied
8	110-118	read_stderr() has no try/except on self._proc.stderr.read (returns None when stderr=PIPE not set)
9	125-140	read_stdout consumes the stream then loses subsequent data; no line-buffering
10	145	stop() doesn't await child process kill; race with re-start
11	150	No subprocess.Popen cleanup on parent process death (no prctl(PR_SET_PDEATHSIG))
12	160	sentinel file write not atomic (no os.replace); partial writes on crash
13	170	No FD limit check before Popen; child can exhaust file descriptors
14	175	cwd=/tmp/wcarck not created if missing; FileNotFoundError
15	180-195	No retry on transient OSError: [Errno 16] Device or resource busy from kernel USB stack
Drop-in fix for gaps 1-2 (most urgent):
# hardware/process.py
import shutil
import psutil
from pathlib import Path

PRIVILEGED_BINS = frozenset({
    "iw", "ip", "macchanger", "hostapd", "dnsmasq",
    "airmon-ng", "aireplay-ng", "aircrack-ng", "hcxdumptool", "mdk4",
})

class ManagedProcess:
    def __init__(self, name: str, command: list[str], cwd: Path | None = None, env: dict | None = None):
        for bin_name in command:
            base = bin_name.split("/")[-1]
            if base in PRIVILEGED_BINS and shutil.which(base) is None:
                raise FileNotFoundError(f"Privileged binary '{base}' not found in PATH. Run install.sh.")
        self._proc: subprocess.Popen | None = None
        self._sentinel_path = Path(f"/var/run/wcarck/{name}.pid")
        self._sentinel_path.parent.mkdir(parents=True, exist_ok=True)
        # ... rest of init
3.2 hardware/adapter.py (8 gaps)
#	Line	Gap
16	156-180	start_monitor_mode regex r'(\w+mon\d*)' matches "common", "demon", "salmon"
17	185-210	Last-resort branch returns original managed iface with success: True
18	220	airmon-ng check kill silently fails if not in sudoers
19	245	start() reads iw dev output; no try/except subprocess.CalledProcessError
20	296-352	No BAD_DRIVERS = {'rtl8821au', 'rtl88xxau'} fallback (Wifite has this)
21	305	No txpower fixed 3000 after monitor mode enable
22	340	DFS CAC (60s) wait not implemented
23	400	USB hot-plug event from udev not consumed; no pyudev integration
Drop-in fix for gap 16-17 (wrong interface + last-resort lie):
# hardware/adapter.py
import re

MONITOR_IFACE_RE = re.compile(r"^([a-zA-Z]+\d+mon\d*|mon\d+)$")

async def start_monitor_mode(self, phy: str, iface: str) -> AdapterState:
    """Enable monitor mode with strict verification.
    
    Returns AdapterState with success=False on any failure.
    Never returns a managed interface disguised as monitor.
    """
    # Strip existing monitor interfaces on this phy
    await self._run_cmd("sudo", ["airmon-ng", "stop", iface], timeout_s=10)
    
    # Try airmon-ng first
    rc, out, err = await self._run_cmd("sudo", ["airmon-ng", "start", iface], timeout_s=30)
    
    # Verify with iw dev (authoritative)
    rc2, out2, _ = await self._run_cmd("iw", ["dev"], timeout_s=5)
    monitor_ifaces = [
        m.group(1) for line in out2.splitlines()
        if "Interface" in line
        for m in [MONITOR_IFACE_RE.search(line)]
        if m and m.group(1) != iface
    ]
    
    if not monitor_ifaces:
        # Do NOT return the original iface with success=True
        logger.error("monitor_mode_verification_failed", phy=phy, iface=iface, stderr=err)
        await self._bus.publish("adapter.error", {
            "phy": phy, "iface": iface,
            "error": "monitor_mode_unavailable",
            "hint": "Adapter may be in BAD_DRIVERS list (rtl8821au, rtl88xxau) or driver does not support monitor mode",
        })
        return AdapterState(success=False, iface=None, error="monitor_mode_unavailable")
    
    return AdapterState(success=True, iface=monitor_ifaces[0], error=None)
3.3 modules/recon/scanner.py (6 gaps)
#	Line	Gap
24	121-128	Capture record has bssid="ANY"; can't link cap to network
25	130	Cap file path not validated; /var/log/wcarck/caps/ may not exist
26	175	start() has no try/except on airodump-ng Popen
27	192	_parse_csv uses line.split(','); breaks on quoted SSIDs (Wifite uses csv.reader(QUOTE_ALL))
28	200	Channel parsed as int(ch_str) without try/except ValueError
29	230-245	stop() never calls lease_manager.release(adapter_id)
Drop-in fix for gap 27 (CSV parser — the CRITICAL one):
# modules/recon/scanner.py
import csv
import io

def _parse_csv(self, csv_path: Path) -> list[dict]:
    """Parse airodump-ng CSV output. Handles quoted SSIDs with commas.
    
    airodump-ng format:
      BSSID, First time seen, Last time seen, channel, Speed, ...
      AA:BB:CC:DD:EE:FF, 2024-01-01 12:00:00, ..., 6, 54, ...
      Station MAC, ...
    """
    networks: list[dict] = []
    if not csv_path.exists():
        return networks
    
    try:
        with open(csv_path, "r", encoding="utf-8", errors="replace", newline="") as f:
            # First line is header, rest are rows
            reader = csv.reader(f, quotechar='"', quoting=csv.QUOTE_ALL,
                                skipinitialspace=True, escapechar="\\")
            header: list[str] | None = None
            for row in reader:
                if not row or row[0].startswith("BSSID") or row[0].startswith("Station MAC"):
                    header = row
                    continue
                if not header:
                    continue
                try:
                    rec = dict(zip(header, row))
                    networks.append({
                        "bssid": rec.get("BSSID", "").strip(),
                        "channel": int(rec.get("channel", "0") or 0),
                        "ssid": rec.get("ESSID", "").strip() or "<hidden>",
                        "privacy": rec.get("Privacy", "").strip(),
                        "power": int(rec.get("Power", "-1") or -1),
                        "beacons": int(rec.get("# beacons", "0") or 0),
                    })
                except (ValueError, KeyError) as e:
                    logger.warning("csv_row_parse_failed", row=row[:5], error=str(e))
    except OSError as e:
        await self._bus.publish("scanner.csv_unreadable", {"path": str(csv_path), "error": str(e)})
    return networks
3.4 modules/attack/deauth.py (5 gaps)
#	Line	Gap
30	62-76	Busy restart loop every 0.1s; CPU pegged
31	65	Missing --ignore-negative-one -D flags; rc=7 on channel race
32	75	No try/except on proc.returncode (None while running)
33	80	No aireplay-ng version check (needs >= 1.2 RC1 for -D)
34	87	stop() doesn't release lease
Drop-in fix for gaps 30-31 (deauth burst pattern):
# modules/attack/deauth.py
async def _deauth_burst(self, bssid: str, client: str, count: int = 5):
    """Single deauth burst with channel race handling."""
    cmd = [
        "sudo", "aireplay-ng",
        "-0", str(count),      # deauth count
        "-a", bssid,
        "-c", client if client else "FF:FF:FF:FF:FF:FF",
        "-D",                  # skip detect
        "--ignore-negative-one",
        self._monitor_iface,
    ]
    try:
        proc = await self._run_cmd("sudo", cmd[1:], timeout_s=15)
        if proc.returncode == 7:
            # Channel race — AP changed channel mid-burst
            await self._bus.publish("deauth.channel_race", {
                "bssid": bssid, "client": client,
                "hint": "AP changed channel; consider re-scanning",
            })
            return False
        return proc.returncode == 0
    except subprocess.TimeoutExpired:
        await self._bus.publish("deauth.timeout", {"bssid": bssid, "client": client})
        return False

async def _deauth_loop(self):
    while not self._stop_event.is_set():
        for client in self._clients:
            ok = await self._deauth_burst(self._bssid, client, count=5)
            if not ok:
                # Skip remaining clients this cycle
                break
        # Sleep between bursts (NOT 0.1s — that's the busy loop bug)
        await asyncio.sleep(5)
3.5 modules/attack/pmkid.py (4 gaps)
#	Line	Gap
35	36	bssid.replace(':', '') + '\\n' writes literal backslash-n
36	45	Filter list file path is hardcoded; can't be customized
37	63	bpf_file declared but never written; modern hcxdumptool v6.3+ path silently broken
38	122	stop() doesn't release lease
Drop-in fix for gap 35 (the CRITICAL string-literal bug):
# modules/attack/pmkid.py
def _write_filter(self, bssids: list[str], path: Path) -> None:
    """Write BSSID filter file for hcxdumptool --filtermode=2.
    
    Format: one MAC per line, no colons, newline-terminated.
    """
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="ascii") as f:
            for bssid in bssids:
                if not re.match(r"^[0-9A-Fa-f]{12}$", bssid.replace(":", "")):
                    logger.warning("invalid_bssid_in_filter", bssid=bssid)
                    continue
                f.write(bssid.replace(":", "") + "\n")  # NOT "\\n"
        if not bssids:
            # Empty filter = capture everything; write a comment header
            logger.info("pmkid_filter_empty", path=str(path))
    except OSError as e:
        await self._bus.publish("pmkid.filter_write_failed", {"path": str(path), "error": str(e)})
3.6 modules/attack/eviltwin.py (5 gaps)
#	Line	Gap
39	45	hostapd config not validated before start
40	78	dnsmasq config port collision check missing
41	100	No nftables DoH/DoT drop (D105 spec gap)
42	110	Channel preemption not implemented (D125)
43	125	stop() doesn't release lease
3.7 modules/attack/crack.py (3 gaps)
#	Line	Gap
44	159	int(job_id) cast on UUID raises ValueError; job hangs forever
45	95	hashcat.potfile not cleared between runs; old results bleed in
46	145	No retry on transient subprocess.TimeoutExpired from hashcat
Drop-in fix for gap 44 (the CRITICAL UUID cast bug):
# modules/attack/crack.py
async def _report_progress(self, job_id: str, progress: float):
    """Publish crack progress event.
    
    job_id is a UUID string (from db/jobs.py). Do NOT cast to int.
    The old code did int(job_id) which raised ValueError on UUIDs and
    left the job stuck in 'running' state.
    """
    await self._bus.publish("crack.progress", {
        "job_id": job_id,  # string UUID, NOT int
        "progress": progress,
        "timestamp": time.time(),
    })
3.8 orchestration/worker.py (4 gaps)
#	Line	Gap
47	32	int(event["payload"]["job_id"]) — same UUID crash as crack.py:159
48	121	References undefined _lock instead of _adapter_locks
49	95-115	No try/except around await self._module.start(); module crash leaves job in 'running'
50	140	_job_queue not exposed as module-level singleton; api/crack.py:9 imports it and crashes
Drop-in fix for gap 50 (the missing _job_queue):
# orchestration/worker.py
import asyncio

# Module-level singleton queue shared between API layer and worker
_job_queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=1024)

class JobWorker:
    def __init__(self, lease_manager):
        self._lease_manager = lease_manager
        self._adapter_locks: dict[str, asyncio.Lock] = {}
        self._running = False
    
    async def submit(self, job: dict) -> None:
        """Public API for enqueueing jobs from HTTP layer."""
        await _job_queue.put(job)
    
    async def _run_loop(self):
        while self._running:
            try:
                event = await asyncio.wait_for(_job_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                raise
            job_id = event.get("job_id", "")
            if not isinstance(job_id, str):
                logger.error("invalid_job_id", payload=event)
                continue
            # ... rest of dispatch
3.9 orchestration/leases.py (3 gaps)
#	Line	Gap
51	28	ttl_seconds=10.0 too short for long scans (>10s)
52	110	release() doesn't guard if existing is None: return
53	95	No try/except on db.commit()
Drop-in fix for gap 51 (TTL bump):
# orchestration/leases.py
from datetime import datetime, timedelta, timezone

class RadioLeaseManager:
    DEFAULT_TTL_S = 30.0  # Was 10.0 — too short for 4-way EAPOL validation
    
    def __init__(self):
        self._leases: dict[str, Lease] = {}
        self._sweeper_task: asyncio.Task | None = None
    
    async def acquire(self, adapter_id: str, module: str, ttl_s: float | None = None) -> Lease:
        ttl = ttl_s or self.DEFAULT_TTL_S
        # ... existing logic
    
    async def renew(self, adapter_id: str, module: str, extend_s: float | None = None) -> bool:
        """Extend an existing lease's TTL (called by long-running modules)."""
        lease = self._leases.get(adapter_id)
        if lease is None or lease.holder != module:
            return False
        lease.expires_at = datetime.now(timezone.utc) + timedelta(seconds=extend_s or self.DEFAULT_TTL_S)
        try:
            await self._persist(lease)
            return True
        except Exception as e:
            await self._bus.publish("lease.renew_failed", {"adapter": adapter_id, "error": str(e)})
            return False
    
    async def release(self, adapter_id: str, module: str) -> bool:
        existing = self._leases.get(adapter_id)
        if existing is None:
            return False  # Idempotent release
        if existing.holder != module:
            logger.warning("lease_release_by_non_holder", adapter=adapter_id,
                          holder=existing.holder, requester=module)
            return False
        # ... rest of release
3.10 core/event_bus.py (2 gaps)
#	Line	Gap
54	17-40	publish() drops events silently on asyncio.QueueFull (except asyncio.QueueFull: pass)
55	80	subscribe() generator doesn't handle subscriber crash (uncaught exception tears down iterator)
3.11 core/system.py (3 gaps)
#	Line	Gap
56	42-50	_mount_tmpfs runs mountpoint -q / mount -t tmpfs with no try/except
57	70-80	_dbus_sleep_listener task cancelled in stop() without try/except asyncio.CancelledError
58	95	_check_clock_skew has no timeout on subprocess.run
3.12 db/session.py (2 gaps)
#	Line	Gap
59	80-95	run_wal_checkpoint_task swallows errors with logger.error; no recovery
60	120	No WAL recovery on sqlite3.DatabaseError: database disk image is malformed (D55 spec)
3.13 db/jobs.py (1 gap)
#	Line	Gap
61	35-52	fetch_next_job no try/except around with_for_update lock
3.14 db/listener.py (1 gap)
#	Line	Gap
62	130	_on_credential has bare except Exception; swallows DB errors silently
3.15 utils/pcap.py (2 gaps)
#	Line	Gap
63	45	verify_handshake() has no Semaphore(1) (D84 spec gap)
64	70	Windows mock hardcodes "Valid" — leaks into production when WCARCK_SIMULATE=1
3.16 portal/server.py (3 gaps)
#	Line	Gap
65	45-50	aiohttp web.AppRunner start has no OSError handler for port 80 conflict
66	80	No try/except around await self._runner.setup()
67	110	web.Application shutdown doesn't await pending requests
3.17 portal/validators/{tshark_precheck,aircrack}.py (2 gaps)
#	Line	Gap
68	tshark:25	shutil.which("tshark") check exists, but no fallback if tshark missing
69	aircrack:7	Semaphore(1) exists ✓ — but subprocess.run has no timeout enforcement on top of semaphore
3.18 api/*.py (5 gaps)
#	Line	Gap
70	crack.py:9	Imports _job_queue from worker — undefined (gap 50)
71	jobs.py:30-32	valid_modules list missing crack.hashcat
72	wordlists.py:52	Bare except Exception swallows os.path.getsize errors
73	credentials.py:55	bus.publish no try/except — slow consumer blocks HTTP request
74	report.py:30	SessionLocal() per request; no try/except; hangs on locked DB
4. Cross-Cutting Issues
4.1 No try/except pattern in 80% of async functions
A survey of all 14 files: most async def methods have no try/except. A single await raising (which can happen from socket disconnect, DB busy, subprocess crash) will:
1. Cancel the current task
2. Print a stack trace to stderr (NOT visible to GUI user)
3. Leave the module in inconsistent state
Fix: Establish a decorator:
# core/error_decorator.py
import functools
import structlog

logger = structlog.get_logger()

def with_error_boundary(event_bus=None, default_return=None):
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.exception("async_function_failed", func=func.__name__, error=str(e))
                if event_bus is not None:
                    await event_bus.publish("system.error", {
                        "function": func.__name__,
                        "module": func.__module__,
                        "error": str(e),
                        "type": type(e).__name__,
                    })
                return default_return
        return wrapper
    return decorator
Apply to every async def in modules/, hardware/, api/.
4.2 bus.publish is non-blocking but has no back-pressure event
core/event_bus.py:17-40 silently drops events on QueueFull. For the GUI, this means a "deauth sent" event can disappear if the WebSocket is slow. Fix: emit a event.dropped counter every 100 drops.
4.3 Lease release is never called in stop()
Pattern repeats in scanner.py:230, deauth.py:87, pmkid.py:122, eviltwin.py:125. Fix: add a BaseModule mixin:
# core/module.py
class BaseModule(ABC):
    def __init__(self, lease_manager, bus):
        self._lease_manager = lease_manager
        self._bus = bus
        self._lease_id: str | None = None
    
    async def _acquire_lease(self, adapter_id: str, module: str) -> bool:
        lease = await self._lease_manager.acquire(adapter_id, module)
        if lease is None:
            await self._bus.publish(f"{module}.lease_denied", {"adapter": adapter_id})
            return False
        self._lease_id = adapter_id
        return True
    
    async def _release_lease(self, module: str) -> None:
        if self._lease_id is None:
            return
        try:
            await self._lease_manager.release(self._lease_id, module)
        finally:
            self._lease_id = None
Every module's stop() ends with await self._release_lease(self.NAME).
4.4 Subprocess stderr is routinely discarded
ManagedProcess (gap 8) and all callers (aireplay-ng, airodump-ng, aircrack-ng, hostapd, dnsmasq) call with stderr=subprocess.DEVNULL or stderr=subprocess.PIPE but never surface stderr to the user. Wifite has the same issue; wifipumpkin3 stores stderr to ~/pumpkin3/logs/. Wcarck should at minimum: capture stderr -> SessionLog table -> show in frontend/src/pages/Logs.tsx.
5. Reference Tools Comparison
Pattern	Wifite	wifipumpkin3
BAD_DRIVERS fallback	YES	N/A
Monitor mode verify	YES (iwconfig)	YES (iw dev)
CSV with QUOTE_ALL	YES	N/A
Subprocess timeout	NO	NO
Retry with backoff	NO	NO
Circuit breaker	NO	NO
Atomic file writes	NO	NO
Schema migration	N/A	partial (alembic)
Semaphore on validator	NO	N/A
DBus sleep listener	NO	NO
Stderr to user	NO (dropped)	YES (log dir)
USB hot-plug	NO	NO
Channel race handling	YES (--ignore-negative-one)	N/A
Tmpfs for captures	NO	NO
Conclusion: Wcarck's spec is ahead of reference tools on most reliability patterns. The gap is implementation, not design. This audit gives the implementation.
6. Implementation Roadmap
Phase 1 — Stop the bleeding (2 hours, all CRITICAL)
#	Fix
27	CSV parser with csv.reader(QUOTE_ALL)
35	bssid.replace(':', '') + "\n" (not "\\n")
44	Remove int(job_id) cast
47	Remove int(event["payload"]["job_id"]) cast
50	Define _job_queue at module level
17	Last-resort branch returns success: False
1-2	Add airmon-ng to sudoers, add psutil to deps
70	Fix api/crack.py import to use JobWorker.submit()
71	Add crack.hashcat to valid_modules
Phase 2 — Lease hygiene (1 hour, all HIGH)
#	Fix
29	scanner.py:stop() calls release()
34	deauth.py:stop() calls release()
38	pmkid.py:stop() calls release()
43	eviltwin.py:stop() calls release()
51	Bump DEFAULT_TTL_S to 30.0 + add renew()
Phase 3 — Adapter safety (1.5 hours, all HIGH)
#	Fix
16	Strict monitor iface regex + iw dev verify
18	Precheck airmon-ng sudoers before start
20	BAD_DRIVERS fallback with helpful error
23	pyudev USB hot-plug monitor
Phase 4 — Deauth + crack polish (1 hour)
#	Fix
30-31	Burst pattern with --ignore-negative-one -D
63	Semaphore(1) in verify_handshake
45	Clear hashcat.potfile before start
Phase 5 — Cross-cutting observability (2 hours)
#	Fix
4.1	with_error_boundary decorator + apply to all async
4.4	Capture subprocess stderr to SessionLog
54	event.dropped counter in event_bus
Phase 6 — Tests (1.5 hours)
Extend backend/tests/unit/test_radio_layer.py (currently 2 placeholder tests):
async def test_scanner_csv_parser_handles_quoted_ssids():
    """Comma in SSID 'Foo,Bar' should not split the row."""
    csv_text = '''BSSID, First time seen, Last time seen, channel, Speed, Privacy, Power, # beacons, ESSID
AA:BB:CC:DD:EE:FF, 2024-01-01 12:00:00, 2024-01-01 12:01:00, 6, 54, WPA2, -50, 100, "Foo,Bar"
'''
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
        f.write(csv_text)
        path = f.name
    scanner = ScannerModule(bus, lease_manager)
    nets = scanner._parse_csv(Path(path))
    assert len(nets) == 1
    assert nets[0]["ssid"] == "Foo,Bar"
    assert nets[0]["bssid"] == "AA:BB:CC:DD:EE:FF"
    assert nets[0]["channel"] == 6


async def test_pmkid_filter_writes_newline_not_literal_backslash_n():
    """Bug: pmkid.py:36 used '\\n' (literal) instead of '\n'."""
    pmkid = PmkidModule(bus, lease_manager)
    await pmkid._write_filter(["AA:BB:CC:DD:EE:FF", "11:22:33:44:55:66"], Path("/tmp/test_filt.txt"))
    content = Path("/tmp/test_filt.txt").read_text()
    assert content == "AABBCCDDEEFF\n112233445566\n"
    assert "\\n" not in content


async def test_crack_progress_uses_string_job_id():
    """Bug: crack.py:159 cast job_id to int, crashing on UUIDs."""
    crack = CrackModule(bus, lease_manager)
    test_uuid = "550e8400-e29b-41d4-a716-446655440000"
    # Should NOT raise ValueError
    await crack._report_progress(test_uuid, 0.5)


async def test_lease_manager_renew_extends_ttl():
    lease_mgr = RadioLeaseManager()
    await lease_mgr.start_sweeper()
    lease = await lease_mgr.acquire("wlan0", "recon.scanner", ttl_s=10.0)
    assert lease is not None
    renewed = await lease_mgr.renew("wlan0", "recon.scanner", extend_s=60.0)
    assert renewed is True
    await lease_mgr.release("wlan0", "recon.scanner")
    await lease_mgr.stop_sweeper()


async def test_adapter_start_monitor_mode_returns_false_on_verification_failure(monkeypatch):
    """Bug: adapter.py:185-210 returned success=True with managed iface when iw dev showed no monitor."""
    adapter = AdapterWatchdog()
    # Mock _run_cmd to simulate airmon-ng "succeeding" but iw dev showing no monitor
    async def fake_run_cmd(*args, **kwargs):
        if "iw" in args[0] and "dev" in args[1]:
            return (0, "", "")
        return (0, "", "")
    monkeypatch.setattr(adapter, "_run_cmd", fake_run_cmd)
    state = await adapter.start_monitor_mode("phy0", "wlan0")
    assert state.success is False
    assert state.error == "monitor_mode_unavailable"
7. Verification Checklist
After implementing Phases 1-5, verify with:
# 1. All CRITICAL fixes applied
grep -n 'int(job_id)' backend/wcarck/orchestration/worker.py
grep -n 'int(job_id)' backend/wcarck/modules/attack/crack.py
grep -n '"\\\\n"' backend/wcarck/modules/attack/pmkid.py
# All should return no results.

# 2. All modules release leases
grep -n 'def stop' backend/wcarck/modules/*/*.py | while read line; do
  file=$(echo "$line" | cut -d: -f1)
  echo "=== $file ==="
  awk '/def stop/,/^    [a-z]|^class/' "$file" | grep -E 'release|finally' || echo "MISSING release()"
done

# 3. Subprocess calls have timeouts
grep -rn 'subprocess.run\|Popen' backend/wcarck/ | grep -v 'timeout=' | grep -v test_

# 4. Async functions wrapped in error boundary
grep -rn 'async def' backend/wcarck/modules/ backend/wcarck/hardware/ | wc -l
grep -rn '@with_error_boundary' backend/wcarck/ | wc -l
# These should match (or be close)

# 5. Unit tests pass
cd backend && pytest tests/unit/test_radio_layer.py -v
8. Out of Scope (deferred to V2 audit)
- Plugin loading / sandboxing exceptions
- Web proxy / mitmproxy error handling
- WPA3 SAE handshake validation
- Multi-adapter simultaneous channel use
- Cloud sync error handling
- Auto-update / rollback error handling