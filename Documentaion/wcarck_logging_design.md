# Wcarck — Logging System Design
# Unified, AI/Human-Decodable, UI-Friendly Log Architecture

**Goal:** Every failure, anomaly, and state change produces a log entry that:
1. A **human operator** can read at a glance without knowing the codebase
2. An **AI assistant** can parse in bulk and pinpoint the root cause
3. A **developer** can grep/jq into in under 10 seconds
4. The **UI** can render live without polling

---

## 1. Core Philosophy — Three Principles

### Principle 1: Every line must be self-contained

A log line that says `"adapter error"` is useless. A log line that says:

```json
{
  "event": "adapter.mode_change_failed",
  "iface": "wlan_mon",
  "from_mode": "managed",
  "to_mode": "monitor",
  "error": "Operation not permitted",
  "driver": "rt2800usb",
  "hint": "Try: sudo iw dev wlan_mon set type monitor — if it fails, replug the adapter",
  "job_id": 7
}
```

...can be diagnosed in isolation. The person (or AI) reading it does not need
to scroll up 200 lines to understand context. **Every error line carries its own context.**

### Principle 2: One format, everywhere

All log writers — job runner, modules, portal server, adapter watchdog — produce
the same JSONL format. No mixing of `print()`, Python `logging`, structlog, and
aiohttp access logs into different files in different formats.

### Principle 3: Separate by concern, not by severity

Six log files, each covering one domain. Severity (DEBUG/INFO/WARN/ERROR) is a
field INSIDE each line, not a separate file. This way `jq 'select(.level=="ERROR")'`
works on any file, and the system.jsonl doesn't mix RF packet events with DB errors.

---

## 2. The Log Line Schema — Mandatory Fields

Every single log line across the entire codebase must have these fields:

```json
{
  "ts":         "2026-06-03T21:34:48.123Z",
  "ts_mono":    183421.887,
  "level":      "INFO",
  "channel":    "rf",
  "event":      "capture.handshake.eapol_m2",
  "session_id": 3,
  "job_id":     12,
  "trace_id":   "a3f9b1c2",
  "iface":      "wlan_mon",
  "bssid":      "30:4F:75:E8:23:90",
  "ssid":       "NASA",
  "detail":     { "eapol_index": 2, "src_mac": "AA:BB:CC:DD:EE:FF" },
  "hint":       null,
  "duration_ms": null,
  "error":      null,
  "traceback":  null
}
```

### Field specification

| Field | Type | Always present | Purpose |
|---|---|---|---|
| `ts` | ISO 8601 string (ms precision, UTC) | YES | Wall-clock time for human reading |
| `ts_mono` | float (seconds) | YES | Monotonic clock for duration calculations — never jumps on NTP sync |
| `level` | TRACE/DEBUG/INFO/WARN/ERROR/CRITICAL | YES | Severity |
| `channel` | system/job/rf/portal/subprocess/error | YES | Which log file this belongs to |
| `event` | dot-separated string | YES | Machine-readable event type (same as EventBus tags where applicable) |
| `session_id` | int or null | YES | Links to current pentest session |
| `job_id` | int or null | YES if in a job context | Which job produced this line |
| `trace_id` | 8-char hex string | YES | UUID prefix — traces one request/operation end-to-end |
| `iface` | string or null | when relevant | Which adapter (`wlan_mon`, `wlan_ap`) |
| `bssid` | string or null | when relevant | Target network MAC |
| `ssid` | string or null | when relevant | Target network name |
| `detail` | object | YES (can be `{}`) | Event-specific structured payload |
| `hint` | string or null | for WARN+ERROR | Human/AI-readable "what to try next" |
| `duration_ms` | int or null | for timed operations | How long this operation took |
| `error` | string or null | for WARN+ERROR | Machine error message |
| `traceback` | string or null | for ERROR/CRITICAL | Full Python traceback as one string |

### Why `ts_mono` alongside `ts`?

Wall clock can jump backwards (NTP adjustment). If you try to calculate "how long
did the handshake capture take?" using `ts` timestamps and NTP ran between the two
events, you get a negative or wildly wrong duration. `ts_mono` is always reliable
for `duration_ms = (end.ts_mono - start.ts_mono) * 1000`.

### Why a short `trace_id`?

8 hex chars = 4 billion possibilities. Short enough to type/read in a terminal.
The full `trace_id` flow:

```
REST request arrives → generate trace_id
→ job created (trace_id stored in job_queue)
→ ManagedProcess spawned (trace_id passed to subprocess logger)
→ event bus event published (trace_id in payload)
→ WebSocket message to UI (trace_id in message)

jq 'select(.trace_id == "a3f9b1c2")' /var/log/wcarck/*.jsonl
# Shows every line related to this one user action, in order
```

---

## 3. Log Levels — Precise Definitions

| Level | Meaning | When to use | Stored to |
|---|---|---|---|
| `TRACE` | Every packet, every CSV row | DEBUG builds only, never in production | Memory ring only |
| `DEBUG` | Internal state checks, lease evaluations | Dev mode (`LOG_LEVEL=DEBUG` in config) | Current channel file |
| `INFO` | A significant thing happened successfully | Job started/stopped, capture found, client connected | All channel files |
| `WARN` | Something unexpected happened but we recovered | Adapter retry succeeded, disk at 80%, validation timeout | All + `errors.jsonl` |
| `ERROR` | A job failed or a component is broken | Subprocess crash, DB write failed, adapter gone | All + `errors.jsonl` |
| `CRITICAL` | The service cannot continue | DB corruption, all adapters lost, event loop crashing | All + `errors.jsonl` + stderr |

`TRACE` never hits disk in production — it is emitted to an in-memory ring buffer
(1,000 lines max). If an `ERROR` occurs, the last 50 TRACE lines are flushed into
that error's log entry as `detail.recent_trace`. This is the "flight recorder" pattern.

---

## 4. Log Channels — Six Files, Six Concerns

```
/var/log/wcarck/
├── session.jsonl       ← The operator-facing story of what happened
├── system.jsonl        ← Adapter, driver, service lifecycle events
├── jobs.jsonl          ← Job queue state transitions
├── rf.jsonl            ← RF events: deauth, capture progress, probe harvests
├── portal.jsonl        ← Captive portal: client connects, submissions, validations
├── subprocess.jsonl    ← Every external tool spawn/exit with args and timing
└── errors.jsonl        ← Mirror of ALL WARN+ lines from every channel
```

### Why `errors.jsonl` as a mirror?

`errors.jsonl` collects every WARN/ERROR/CRITICAL line regardless of channel.
It is the first file a developer or AI looks at after a failed session.

```bash
# "What went wrong in the last session?"
tail -n 50 /var/log/wcarck/errors.jsonl | jq -r '[.ts, .level, .event, .hint] | @tsv'
```

Output in 2 seconds:
```
2026-06-03T21:15:32Z  ERROR   adapter.gone              Try: replug wlan_mon
2026-06-03T21:22:11Z  WARN    portal.validation_timeout Try: check handshake.cap is valid
```

### Channel assignment per module

| Module / Component | Primary channel | Also writes to |
|---|---|---|
| AdaptersModule | `system` | `errors` on WARN+ |
| ScanModule | `rf` | `errors` on WARN+ |
| DeauthModule | `rf` | `errors` on WARN+ |
| HandshakeCaptureModule | `rf` | `errors` on WARN+ |
| PMKIDCaptureModule | `rf` | `errors` on WARN+ |
| EvilTwinModule | `system` | `errors` on WARN+ |
| CaptivePortalModule | `portal` | `errors` on WARN+ |
| ManagedProcess (all tools) | `subprocess` | `errors` on WARN+ |
| JobRunner / orchestration | `jobs` | `errors` on WARN+ |
| RadioLeaseManager | `jobs` | `errors` on WARN+ |
| EventBus | `system` | never |
| Service startup/shutdown | `system` | `errors` on WARN+ |
| High-level session events | `session` | never (clean narrative only) |

---

## 5. `session.jsonl` — The Human Story

This is the only log file a non-developer operator needs to read. It contains
only the high-level narrative of what happened: no subprocess args, no packet
counts, no internal states. Think of it as the "operator's notebook" auto-filled.

```json
{"ts":"2026-06-03T21:00:01Z","ts_mono":100.0,"level":"INFO","channel":"session","event":"session.started","session_id":3,"detail":{"label":"NASA audit","adapters":["wlan_mon","wlan_ap","wlan_uplink"]},"hint":null}
{"ts":"2026-06-03T21:01:12Z","ts_mono":171.0,"level":"INFO","channel":"session","event":"scan.started","session_id":3,"job_id":1,"detail":{"iface":"wlan_mon","bands":["2.4GHz"]},"hint":null}
{"ts":"2026-06-03T21:02:44Z","ts_mono":223.0,"level":"INFO","channel":"session","event":"scan.network_found","session_id":3,"bssid":"30:4F:75:E8:23:90","ssid":"NASA","detail":{"channel":1,"rssi":-47,"encryption":"WPA2-PSK","clients":2},"hint":null}
{"ts":"2026-06-03T21:05:00Z","ts_mono":359.0,"level":"INFO","channel":"session","event":"deauth.started","session_id":3,"job_id":2,"bssid":"30:4F:75:E8:23:90","ssid":"NASA","detail":{"target_client":"AA:BB:CC:DD:EE:FF","channel":1},"hint":null}
{"ts":"2026-06-03T21:05:44Z","ts_mono":403.0,"level":"INFO","channel":"session","event":"capture.handshake.valid","session_id":3,"job_id":3,"bssid":"30:4F:75:E8:23:90","ssid":"NASA","detail":{"type":"eapol","path":"/var/lib/wcarck/captures/NASA_30_4F_75_E8_23_90.22000","eapol_messages":4},"hint":null}
{"ts":"2026-06-03T21:15:32Z","ts_mono":991.0,"level":"ERROR","channel":"session","event":"adapter.gone","session_id":3,"iface":"wlan_mon","detail":{"active_jobs":[2,3]},"hint":"Adapter wlan_mon disconnected. Replug the USB adapter and restart the affected jobs."}
{"ts":"2026-06-03T21:35:01Z","ts_mono":2100.0,"level":"INFO","channel":"session","event":"portal.credential_captured","session_id":3,"job_id":5,"bssid":"30:4F:75:E8:23:90","ssid":"NASA","detail":{"client_ip":"10.0.0.4","validated":true},"hint":null}
{"ts":"2026-06-03T21:48:22Z","ts_mono":2901.0,"level":"INFO","channel":"session","event":"session.ended","session_id":3,"detail":{"duration_s":2841,"networks_found":12,"handshakes_captured":1,"credentials_captured":2,"errors":1},"hint":null}
```

Reading `session.jsonl` with the terminal helper script:

```bash
wcarck logs session --pretty
```

Output (human-formatted from the JSONL):
```
[21:00:01] Session #3 "NASA audit" started — 3 adapters online
[21:01:12] Scan started on wlan_mon (2.4 GHz)
[21:02:44] Network found: NASA (ch1, -47dBm, WPA2-PSK, 2 clients)
[21:05:00] Deauth started → NASA / AA:BB:CC:DD:EE:FF
[21:05:44] Handshake captured ✓ (4-EAPOL) → NASA_30_4F_75_E8_23_90.22000
[21:15:32] ERROR: wlan_mon disconnected — jobs 2,3 cancelled
           HINT: Replug USB adapter and restart affected jobs
[21:35:01] Portal credential captured (validated ✓) — 10.0.0.4
[21:48:22] Session ended — 48m 01s | 12 networks | 1 handshake | 2 creds | 1 error
```

---

## 6. `subprocess.jsonl` — Every Tool Call, Traceable

This is the single most important log for diagnosing "the tool crashed" bugs.
Every `ManagedProcess` spawn/exit gets one START line and one END line.

```json
{"ts":"2026-06-03T21:05:00Z","ts_mono":359.0,"level":"INFO","channel":"subprocess","event":"process.started","session_id":3,"job_id":2,"trace_id":"a3f9b1c2","detail":{"tool":"aireplay-ng","pid":18442,"args":["--deauth","50000","-a","30:4F:75:E8:23:90","-c","AA:BB:CC:DD:EE:FF","wlan_mon"],"iface":"wlan_mon","cwd":"/var/lib/wcarck"}}

{"ts":"2026-06-03T21:05:44Z","ts_mono":403.0,"level":"INFO","channel":"subprocess","event":"process.exited","session_id":3,"job_id":2,"trace_id":"a3f9b1c2","duration_ms":44102,"detail":{"tool":"aireplay-ng","pid":18442,"returncode":0,"signal":null,"stop_method":"SIGTERM","stdout_lines":847,"stderr_lines":0}}

{"ts":"2026-06-03T21:15:30Z","ts_mono":989.0,"level":"ERROR","channel":"subprocess","event":"process.crashed","session_id":3,"job_id":3,"trace_id":"c1d2e3f4","duration_ms":630000,"detail":{"tool":"hcxdumptool","pid":18501,"returncode":-11,"signal":"SIGSEGV","last_stderr":"Segmentation fault (core dumped)"},"error":"hcxdumptool exited with SIGSEGV","hint":"GPU/driver crash. Try: sudo dmesg | tail -20 to see kernel error. Fallback: use airodump-ng for capture.","traceback":null}
```

With `trace_id`, you can find everything related to one job in one query:

```bash
jq 'select(.trace_id == "a3f9b1c2")' /var/log/wcarck/*.jsonl | jq -r '[.ts, .channel, .event] | @tsv'
```

---

## 7. `rf.jsonl` — RF Events with Structured Detail

```json
{"ts":"2026-06-03T21:05:01Z","level":"INFO","channel":"rf","event":"deauth.burst_sent","job_id":2,"iface":"wlan_mon","bssid":"30:4F:75:E8:23:90","detail":{"direction":"ap_to_sta","client":"AA:BB:CC:DD:EE:FF","count":64,"reason_code":7,"channel":1,"seq_start":0,"seq_end":63},"duration_ms":78}

{"ts":"2026-06-03T21:05:33Z","level":"INFO","channel":"rf","event":"capture.eapol_frame","job_id":3,"iface":"wlan_mon","bssid":"30:4F:75:E8:23:90","detail":{"eapol_message":1,"src":"30:4F:75:E8:23:90","dst":"AA:BB:CC:DD:EE:FF","key_ack":true,"key_mic":false,"install":false,"index":1,"of":4}}

{"ts":"2026-06-03T21:05:33Z","level":"INFO","channel":"rf","event":"capture.eapol_frame","job_id":3,"detail":{"eapol_message":2,"index":2,"of":4}}
{"ts":"2026-06-03T21:05:33Z","level":"INFO","channel":"rf","event":"capture.eapol_frame","job_id":3,"detail":{"eapol_message":3,"index":3,"of":4}}
{"ts":"2026-06-03T21:05:34Z","level":"INFO","channel":"rf","event":"capture.eapol_frame","job_id":3,"detail":{"eapol_message":4,"index":4,"of":4}}
{"ts":"2026-06-03T21:05:34Z","level":"INFO","channel":"rf","event":"capture.handshake.complete","job_id":3,"bssid":"30:4F:75:E8:23:90","detail":{"type":"eapol","elapsed_ms":34100,"deauth_bursts_sent":3}}

{"ts":"2026-06-03T21:10:00Z","level":"WARN","channel":"rf","event":"rf.pmf_detected","bssid":"30:4F:75:E8:23:91","ssid":"NASA+","detail":{"mfpc":true,"mfpr":false},"hint":"Management Frame Protection enabled on NASA+. Deauth frames will be dropped by PMF-capable clients. Use PMKID capture instead."}
```

---

## 8. `errors.jsonl` — The Fast Triage File

Every WARN+ line from every channel lands here. This is the file you open FIRST.

```json
{"ts":"2026-06-03T21:15:32Z","level":"ERROR","channel":"system","event":"adapter.gone","iface":"wlan_mon","detail":{"driver":"rt2800usb","active_jobs":[2,3],"last_rx_packet_age_ms":1823},"error":"Interface wlan_mon disappeared from nl80211","hint":"USB adapter disconnected or driver crashed. Try: lsusb | grep Ralink, then replug. Jobs 2,3 cancelled automatically.","traceback":null}

{"ts":"2026-06-03T21:15:32Z","level":"ERROR","channel":"jobs","event":"job.cancelled_by_system","job_id":2,"detail":{"reason":"adapter_gone","iface":"wlan_mon","teardown_ms":234}}

{"ts":"2026-06-03T21:15:33Z","level":"ERROR","channel":"jobs","event":"job.cancelled_by_system","job_id":3,"detail":{"reason":"adapter_gone","iface":"wlan_mon","teardown_ms":198}}

{"ts":"2026-06-03T21:22:11Z","level":"WARN","channel":"portal","event":"portal.validation_timeout","detail":{"client_ip":"10.0.0.5","client_mac":"ee:6a:bc:11:22:33","password_len":8,"elapsed_ms":10200,"tool":"aircrack-ng","cap_path":"/var/lib/wcarck/captures/NASA_30_4F_75_E8_23_90.22000"},"error":"aircrack-ng did not complete within 10s","hint":"Handshake file may be corrupt or too large. Verify: aircrack-ng /var/lib/wcarck/captures/NASA_*.22000"}
```

---

## 9. Async Log Writer — Non-Blocking, Batched

Never write directly to disk from a coroutine. Log writes must NEVER block the
asyncio event loop. Use a dedicated background writer task:

```python
import asyncio
import json
import time
from pathlib import Path
from collections import deque

class AsyncLogWriter:
    """
    Non-blocking structured log writer.
    Coroutines call log() which is synchronous (just puts to a queue).
    A background task drains the queue and writes to disk in batches.
    """

    # In-memory flight recorder for TRACE logs
    _trace_ring: deque = deque(maxlen=1000)

    def __init__(self, log_dir: Path, flush_interval: float = 0.1, batch_size: int = 100):
        self._log_dir = log_dir
        self._flush_interval = flush_interval
        self._batch_size = batch_size
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=10_000)
        self._handles: dict[str, object] = {}   # channel → file handle
        self._running = False

    def log(self, record: dict) -> None:
        """
        SYNCHRONOUS — can be called from any coroutine without await.
        Never blocks — if the queue is full (10K backlog), drops silently
        and increments a dropped_logs counter.
        """
        # Add monotonic timestamp if not present
        record.setdefault("ts_mono", time.monotonic())
        record.setdefault("ts", _utc_now_iso())

        if record.get("level") == "TRACE":
            self._trace_ring.append(record)
            return   # TRACE stays in memory only

        try:
            self._queue.put_nowait(record)
        except asyncio.QueueFull:
            self._dropped_count += 1   # never block, never raise

    def log_error(self, record: dict, exc: Exception) -> None:
        """Convenience: attach traceback and recent TRACE context to an error."""
        import traceback
        record["traceback"] = traceback.format_exc()
        record["detail"]["recent_trace"] = list(self._trace_ring)[-50:]
        record["level"] = "ERROR"
        self.log(record)
        # Mirror to errors.jsonl
        error_record = {**record, "channel": "error"}
        self.log(error_record)

    async def run(self) -> None:
        """Background drain loop. Run as asyncio.create_task() at startup."""
        self._running = True
        self._handles = self._open_handles()
        try:
            while self._running:
                batch = []
                try:
                    # Get at least one item (with timeout to allow flush_interval flush)
                    record = await asyncio.wait_for(
                        self._queue.get(), timeout=self._flush_interval
                    )
                    batch.append(record)
                    # Drain up to batch_size more without blocking
                    while len(batch) < self._batch_size:
                        try:
                            batch.append(self._queue.get_nowait())
                        except asyncio.QueueEmpty:
                            break
                except asyncio.TimeoutError:
                    pass   # no items — just flush the interval

                if batch:
                    await self._write_batch(batch)

        finally:
            # Drain remaining on shutdown
            remaining = []
            while not self._queue.empty():
                remaining.append(self._queue.get_nowait())
            if remaining:
                await self._write_batch(remaining)
            self._close_handles()

    async def _write_batch(self, batch: list[dict]) -> None:
        """Write a batch to disk. Use run_in_executor for the actual I/O."""
        by_channel: dict[str, list[str]] = {}
        for record in batch:
            channel = record.get("channel", "system")
            line = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
            by_channel.setdefault(channel, []).append(line)
            # Always mirror WARN+ to errors channel
            if record.get("level") in ("WARN", "ERROR", "CRITICAL"):
                by_channel.setdefault("errors", []).append(line)

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._sync_write, by_channel)

    def _sync_write(self, by_channel: dict[str, list[str]]) -> None:
        for channel, lines in by_channel.items():
            path = self._log_dir / f"{channel}.jsonl"
            with open(path, "a", encoding="utf-8") as f:
                f.write("\n".join(lines) + "\n")
                f.flush()   # ensure OS flushes — important if service crashes
```

### Structured logger bound to context

```python
class StructuredLogger:
    """
    Bound logger — carries session_id, job_id, trace_id automatically.
    Created once per module, re-bound per job.
    """
    def __init__(self, writer: AsyncLogWriter, channel: str, **ctx):
        self._writer = writer
        self._channel = channel
        self._ctx = ctx

    def bind(self, **kwargs) -> "StructuredLogger":
        return StructuredLogger(self._writer, self._channel, **{**self._ctx, **kwargs})

    def info(self, event: str, **kwargs) -> None:
        self._emit("INFO", event, **kwargs)

    def warn(self, event: str, hint: str = None, **kwargs) -> None:
        self._emit("WARN", event, hint=hint, **kwargs)

    def error(self, event: str, exc: Exception = None, hint: str = None, **kwargs) -> None:
        record = self._build("ERROR", event, hint=hint, **kwargs)
        if exc:
            self._writer.log_error(record, exc)
        else:
            self._writer.log(record)

    def _emit(self, level: str, event: str, **kwargs) -> None:
        self._writer.log(self._build(level, event, **kwargs))

    def _build(self, level: str, event: str, **kwargs) -> dict:
        return {
            "level": level,
            "channel": self._channel,
            "event": event,
            **self._ctx,
            **kwargs,
            "detail": kwargs.pop("detail", {}),
        }

# Usage in DeauthModule:
log = StructuredLogger(writer, channel="rf")

async def run(self, ctx: JobContext):
    log_job = log.bind(session_id=ctx.session_id, job_id=ctx.job_id,
                       trace_id=ctx.trace_id, bssid=self._target.bssid)
    log_job.info("deauth.started", detail={"target_client": self._client, "channel": self._ch})
    # ...
    log_job.info("deauth.burst_sent", duration_ms=78, detail={"count": 64, "direction": "ap_to_sta"})
```

---

## 10. Log Rotation Strategy

```
/var/log/wcarck/
├── session.jsonl           ← current session (rotated on session.ended event)
├── session.2026-06-03.jsonl  ← previous sessions, one file per day
├── system.jsonl            ← current, rotated daily
├── system.2026-06-03.jsonl
├── jobs.jsonl
├── rf.jsonl                ← can be large — rotated hourly
├── rf.2026-06-03T21.jsonl
├── portal.jsonl
├── subprocess.jsonl
└── errors.jsonl            ← rotated weekly
```

### Rotation rules

| File | Rotate when | Keep | Compress after |
|---|---|---|---|
| `session.jsonl` | Session ends | All sessions forever | Yes (gzip), 7 days raw |
| `system.jsonl` | Midnight | 14 days | After 1 day |
| `jobs.jsonl` | Midnight | 14 days | After 1 day |
| `rf.jsonl` | Every hour OR > 50 MB | 24 hours | After 1 hour |
| `portal.jsonl` | Midnight | 30 days (credentials!) | After 1 day |
| `subprocess.jsonl` | Midnight | 7 days | After 1 day |
| `errors.jsonl` | Weekly | 4 weeks | After 1 week |

### Why `rf.jsonl` is special

At high packet rates (deauth + scan active), `rf.jsonl` grows at ~2 MB/minute.
After a 4-hour session it can be >480 MB. Rotate hourly and apply gzip (-9)
immediately after rotation. Keep only 24 hours of raw rf logs.

```python
class LogRotator:
    async def rotate_rf_if_needed(self) -> None:
        path = self._log_dir / "rf.jsonl"
        if not path.exists():
            return
        size_mb = path.stat().st_size / 1048576
        age_hours = (time.time() - path.stat().st_mtime) / 3600
        if size_mb > 50 or age_hours > 1:
            await self._rotate(path, suffix=_hour_suffix())
            await self._compress_old_rf_logs()

    async def _compress_old_rf_logs(self) -> None:
        loop = asyncio.get_running_loop()
        for path in self._log_dir.glob("rf.*.jsonl"):
            if path.stat().st_mtime < time.time() - 3600:   # older than 1 hour
                await loop.run_in_executor(None, _gzip_file, path)
```

---

## 11. UI Design — The Live Log Panel

### 11.1 `LiveLog.tsx` — Real-time stream

The existing plan includes `LiveLog.tsx`. Here is the exact specification:

```typescript
// Each log line rendered as a row:
interface LogRow {
  ts: string           // displayed as "HH:MM:SS.mmm"
  level: LogLevel      // controls row background color
  event: string        // displayed as the primary label
  channel: string      // small badge: "rf" | "system" | "jobs" | "portal" | "sub"
  hint: string | null  // shown as expandable tooltip on hover
  detail: object       // shown in collapsible JSON tree on click
  job_id: number | null
  trace_id: string
}

// Color coding (dark theme):
const LEVEL_COLORS = {
  TRACE:    "text-zinc-600",
  DEBUG:    "text-zinc-400",
  INFO:     "text-sky-300",
  WARN:     "text-amber-400 bg-amber-950/30",
  ERROR:    "text-red-400 bg-red-950/40",
  CRITICAL: "text-red-300 bg-red-900/60 font-bold",
}
```

**UX features:**
- Auto-scroll to bottom (toggle-able with a "Pause" button)
- Filter bar: `[All Levels ▾] [All Channels ▾] [Search event/bssid/iface ...]`
- Click any row → expand full JSON detail in a side panel
- Hover any `hint` field → tooltip with the hint text
- "Copy line as JSON" button on hover
- Level count badges in the filter bar: `INFO (142) WARN (3) ERROR (1)`

### 11.2 Session Browser

```typescript
// Session list view (Dashboard or dedicated /logs route)
interface SessionSummary {
  id: number
  label: string
  started_at: string
  ended_at: string | null
  duration_human: string        // "45m 12s"
  networks_found: number
  handshakes_captured: number
  credentials_captured: number
  error_count: number           // red badge if > 0
  warn_count: number            // yellow badge if > 0
  status: "running" | "ended" | "crashed"
}
```

Each session row has:
- **"View Logs"** → opens the log viewer filtered to that `session_id`
- **"Export"** → downloads the AI bundle (Section 12)
- **"Errors Only"** → opens log viewer pre-filtered to ERROR level for that session

### 11.3 Error Inspector Panel

A dedicated panel that shows ONLY the errors file, sorted by recency, with the
`hint` prominently displayed (not hidden in a tooltip):

```
┌─────────────────────────────────────────────────────────────────┐
│  Error Inspector — Session #3                          2 errors  │
├─────────────────────────────────────────────────────────────────┤
│  21:15:32  ERROR  adapter.gone                                   │
│  ─────────────────────────────────────────────────────────────  │
│  Adapter wlan_mon disconnected. 2 jobs cancelled (2, 3).        │
│                                                                  │
│  ► HINT: Replug the USB adapter. Check: lsusb | grep Ralink    │
│          If still missing: sudo modprobe -r rt2800usb &&         │
│          sudo modprobe rt2800usb                                 │
│                                                                  │
│  [ View in full log ]  [ Copy for AI ]  [ Show last 50 TRACE ]  │
├─────────────────────────────────────────────────────────────────┤
│  21:22:11  WARN   portal.validation_timeout                      │
│  ─────────────────────────────────────────────────────────────  │
│  aircrack-ng did not complete validation in 10s.                │
│                                                                  │
│  ► HINT: The captured handshake may be incomplete. Verify with: │
│          aircrack-ng /var/lib/wcarck/captures/NASA_*.22000      │
│                                                                  │
│  [ View in full log ]  [ Copy for AI ]                          │
└─────────────────────────────────────────────────────────────────┘
```

The **"Show last 50 TRACE"** button expands the `detail.recent_trace` field
(the in-memory flight recorder that was attached to the error line at the time
of the error). This gives a developer the last 50 internal events before the crash
without storing TRACE to disk normally.

---

## 12. The AI Bundle — One-Click Debugging

The single most powerful UI feature for debugging: a button that exports
a structured, compressed bundle optimized for pasting into an AI assistant.

### 12.1 Bundle format

```
wcarck_ai_bundle_session3_20260603T2148.txt
```

```
WCARCK AI DIAGNOSTIC BUNDLE
============================
Generated: 2026-06-03T21:48:22Z
Wcarck version: 0.2.1
Session: #3 "NASA audit"
Session duration: 48m 01s

SYSTEM CONTEXT
--------------
OS: Ubuntu 24.04 LTS (kernel 6.8.0-45-generic)
Adapters:
  wlan_uplink: MediaTek MT7902 (mt7921e) — managed
  wlan_mon:    Ralink RT5370 (rt2800usb) — MISSING at session end
  wlan_ap:     RTL8821AU (88XXau) — managed
Jobs run: 5 (4 completed, 1 cancelled)

ERROR SUMMARY (2 issues)
-------------------------
[1] 21:15:32 ERROR adapter.gone
    iface=wlan_mon  driver=rt2800usb  active_jobs=[2,3]
    error: Interface wlan_mon disappeared from nl80211
    hint: USB adapter disconnected or driver crashed.
          Try: lsusb | grep Ralink, then replug.
          Jobs 2,3 cancelled automatically.

[2] 21:22:11 WARN portal.validation_timeout
    client_ip=10.0.0.5  elapsed_ms=10200  tool=aircrack-ng
    error: aircrack-ng did not complete within 10s
    hint: Handshake file may be corrupt or too large.
          Verify: aircrack-ng /var/lib/wcarck/captures/NASA_*.22000

SESSION TIMELINE (session.jsonl — key events only)
---------------------------------------------------
[21:00:01] session.started — label="NASA audit", 3 adapters
[21:01:12] scan.started — wlan_mon, 2.4GHz
[21:02:44] scan.network_found — NASA (ch1, -47dBm, WPA2-PSK, 2 clients)
[21:05:00] deauth.started — target=AA:BB:CC:DD:EE:FF on NASA
[21:05:44] capture.handshake.valid — 4-EAPOL, file=NASA_30_4F_75_E8_23_90.22000
[21:15:32] ERROR: adapter.gone — wlan_mon (jobs 2,3 cancelled)
[21:18:00] evil_twin.started — ssid=NASA, portal=router_update, wlan_ap
[21:35:01] portal.credential_captured — validated=true
[21:48:22] session.ended — 12 networks, 1 handshake, 2 creds, 1 error

SUBPROCESS LOG (last 20 subprocess events)
-------------------------------------------
[RAW JSONL — last 20 lines of subprocess.jsonl for session 3]
{"ts":"2026-06-03T21:05:00Z","event":"process.started","detail":{"tool":"aireplay-ng","pid":18442,"args":["--deauth","50000","-a","30:4F:75:E8:23:90","-c","AA:BB:CC:DD:EE:FF","wlan_mon"]}}
...

FULL ERRORS LOG (errors.jsonl — all WARN+ for this session)
-------------------------------------------------------------
[RAW JSONL]
{"ts":"2026-06-03T21:15:32Z","level":"ERROR","event":"adapter.gone",...}
{"ts":"2026-06-03T21:22:11Z","level":"WARN","event":"portal.validation_timeout",...}

FULL SESSION LOG (session.jsonl — complete narrative)
------------------------------------------------------
[RAW JSONL]
...all session.jsonl lines for session_id=3...

INSTRUCTIONS FOR AI
--------------------
You are helping diagnose a Wcarck Wi-Fi audit tool session that ended with errors.
The tool is a Python/FastAPI/React application that orchestrates Linux wireless tools
(airodump-ng, aireplay-ng, hcxdumptool, hostapd, dnsmasq) via asyncio subprocesses.

Please analyze:
1. The root cause of each error in the ERROR SUMMARY
2. Whether the errors are related or independent
3. The most likely fix for each
4. Any patterns in the TIMELINE that suggest the errors were predictable
```

### 12.2 Bundle generation endpoint

```python
# api/routes/logs.py
@router.get("/api/logs/ai-bundle/{session_id}")
async def export_ai_bundle(session_id: int):
    bundle = await LogBundleBuilder(session_id).build()
    return Response(
        content=bundle.encode("utf-8"),
        media_type="text/plain",
        headers={
            "Content-Disposition": f'attachment; filename="wcarck_ai_bundle_s{session_id}.txt"'
        }
    )
```

```typescript
// In SessionBrowser.tsx:
<Button
  variant="outline"
  size="sm"
  onClick={() => {
    window.open(`/api/logs/ai-bundle/${session.id}`)
  }}
>
  📋 Copy for AI
</Button>
```

---

## 13. CLI Log Tools — Terminal-First Access

For the operator who prefers a terminal. Add `wcarck logs` subcommand:

```bash
# Show last session's events, pretty-printed
wcarck logs session

# Show all errors from the last 7 days
wcarck logs errors --days 7

# Follow live log (like tail -f but pretty)
wcarck logs follow

# Show all events for a specific job
wcarck logs job 12

# Show all events for a specific BSSID
wcarck logs bssid 30:4F:75:E8:23:90

# Export AI bundle for last session
wcarck logs export --format ai-bundle > bundle.txt

# Search across all logs
wcarck logs search "portal.validation"

# Show what happened in the last N minutes
wcarck logs recent --minutes 5
```

Implemented as a Click CLI that reads JSONL files and formats them with Rich:

```python
import click
from rich.console import Console
from rich.table import Table

LEVEL_COLORS = {
    "INFO": "cyan", "WARN": "yellow", "ERROR": "red", "CRITICAL": "bold red"
}

@click.command()
@click.option("--minutes", default=60)
def recent(minutes):
    console = Console()
    cutoff = time.time() - (minutes * 60)
    log_dir = Path("/var/log/wcarck")

    for path in sorted(log_dir.glob("session*.jsonl")):
        for line in path.open():
            try:
                r = json.loads(line)
                if r.get("ts_mono", 0) > cutoff:
                    ts_short = r["ts"][11:23]   # HH:MM:SS.mmm
                    level = r.get("level", "INFO")
                    color = LEVEL_COLORS.get(level, "white")
                    event = r.get("event", "")
                    hint = f" [dim]→ {r['hint']}[/]" if r.get("hint") else ""
                    console.print(f"[dim]{ts_short}[/] [{color}]{level:8}[/] {event}{hint}")
            except json.JSONDecodeError:
                pass
```

---

## 14. `hint` Field — Writing Good Hints

The `hint` field is what makes the difference between a log that diagnoses itself
and one that requires 30 minutes of googling. Rules for writing hints:

### Hint format: What happened + Why + What to do

```python
# BAD hint:
hint = "Driver error"

# GOOD hint:
hint = (
    "rt2800usb failed to enter monitor mode. "
    "This usually happens after a USB bus reset or kernel update. "
    "Try: sudo ip link set wlan_mon down && "
    "sudo iw dev wlan_mon set type monitor && "
    "sudo ip link set wlan_mon up"
)
```

### Hint library — pre-written for every known failure

```python
# core/hints.py
HINTS = {
    "adapter.gone": (
        "USB adapter {iface} disconnected. "
        "Check: lsusb | grep {vendor}. "
        "If missing: replug and wait 5 seconds. "
        "If still missing: sudo modprobe -r {driver} && sudo modprobe {driver}"
    ),
    "portal.validation_timeout": (
        "aircrack-ng took too long on {cap_path}. "
        "Verify the capture is valid: aircrack-ng {cap_path} "
        "(should say '1 handshake' not '0 handshakes'). "
        "If invalid, re-run the handshake capture."
    ),
    "process.crashed.SIGSEGV": (
        "{tool} crashed with SIGSEGV (segmentation fault). "
        "Likely cause: GPU driver incompatibility with hashcat, or "
        "hcxdumptool driver conflict. "
        "Check: sudo dmesg | tail -30 for kernel error messages."
    ),
    "db.locked": (
        "SQLite database is locked. Another wcarck process may be running. "
        "Check: pgrep -a wcarck. "
        "If stale: sudo systemctl restart wcarck"
    ),
    "rf.pmf_detected": (
        "Management Frame Protection (802.11w) is enabled on {ssid}. "
        "Deauth frames will be silently dropped by PMF-capable clients. "
        "Use PMKID capture instead: it works without client cooperation."
    ),
    "scan.stale": (
        "No networks seen on {iface} for {seconds}s. "
        "Check monitor mode: iw dev {iface} info | grep type (should be 'monitor'). "
        "Check rfkill: rfkill list. "
        "Try switching to a different channel band."
    ),
}

def get_hint(event: str, **ctx) -> str | None:
    template = HINTS.get(event)
    if not template:
        return None
    try:
        return template.format(**ctx)
    except KeyError:
        return template   # return template even if some vars missing
```

---

## 15. What Goes Into `detail` — Field Conventions

To make AI parsing reliable, the `detail` object must use consistent field names:

| Key | Type | Meaning |
|---|---|---|
| `tool` | string | External tool name: "airodump-ng", "hostapd", etc. |
| `pid` | int | Process ID |
| `args` | list[str] | Full command line arguments |
| `returncode` | int | Process exit code |
| `signal` | string | Signal name if killed: "SIGTERM", "SIGKILL" |
| `stop_method` | string | How we stopped it: "SIGINT", "SIGTERM", "SIGKILL" |
| `stdout_lines` | int | How many lines of stdout were received |
| `iface` | string | Network interface name |
| `channel` | int | WiFi channel number |
| `band` | string | "2.4GHz", "5GHz", "6GHz" |
| `count` | int | Number of items (packets, frames, clients) |
| `rate_per_sec` | float | Rate of items |
| `elapsed_ms` | int | Duration of the operation (prefer `duration_ms` at top level) |
| `from_state` | string | Previous state in a state machine |
| `to_state` | string | New state in a state machine |
| `reason` | string | Why something happened |
| `eapol_message` | int | EAPOL message number: 1, 2, 3, or 4 |
| `recent_trace` | list | Last N TRACE lines (only in ERROR records) |
| `cap_path` | string | Full path to a capture file |
| `size_bytes` | int | File or data size |
| `free_mb` | int | Free disk space in MB |

---

## 16. Performance Budget for Logging

| Operation | Target | Notes |
|---|---|---|
| `logger.info()` call | < 1 µs | Just a queue put — no serialization, no I/O |
| JSON serialization | ~5–15 µs/line | Done in background task |
| Disk write (batch of 100 lines) | < 5 ms | In executor, never blocks event loop |
| Queue depth at heavy load | < 500 entries | 10K queue capacity gives >20x headroom |
| `errors.jsonl` for last session | < 1 ms to read | Typically < 1 KB |
| AI bundle generation | < 500 ms | Reads a few files, generates text |
| Live log WS broadcast | Same as EventBus | Reuses existing WS hub |

At maximum RF load (scan + deauth + capture + portal all active):
- Estimated log volume: ~200 lines/minute across all channels
- rf.jsonl growth rate: ~2 MB/minute at TRACE-level deauth logging
- INFO-level rf.jsonl: ~50 KB/minute (packet counts, not per-packet)

---

## 17. Summary — What This Gives You

| Concern | Solution |
|---|---|
| "What broke in the last session?" | Open `errors.jsonl` — 2-second read |
| "What exactly was the tool called with?" | `subprocess.jsonl` has full args for every process |
| "Why is the adapter stuck in monitor mode?" | `system.jsonl` → trace_id → all related events |
| "A client submitted the portal — what happened?" | `portal.jsonl` → full validation timeline |
| "Something broke — I want an AI to help" | One click → AI bundle with narrative + raw JSONL |
| "Show me everything from the last 5 minutes" | `wcarck logs recent --minutes 5` |
| "The service crashed — what happened just before?" | ERROR lines include `detail.recent_trace` (last 50 TRACE events) |
| "I want to watch logs live in the UI" | LiveLog panel → color-coded, filterable, click-to-expand |
| "How do I fix this specific error?" | `hint` field on every WARN/ERROR — human language, actionable |

*End of Wcarck Logging System Design*
