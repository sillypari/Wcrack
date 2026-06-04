import asyncio
import json
import os
from datetime import datetime, timezone
import time
from typing import Any, Optional

from wcarck.core.module import Module
from wcarck.core.event_bus import bus


class AsyncLogWriter(Module):
    """
    Subscribes to the EventBus and writes structured JSONL logs to disk asynchronously.
    Follows the 14-field schema defined in the logging design document.
    """

    def __init__(self, log_dir: str = "/var/log/wcarck"):
        self.log_dir = log_dir
        self._task: Optional[asyncio.Task] = None
        self._cancel_event = asyncio.Event()

    @property
    def name(self) -> str:
        return "AsyncLogWriter"

    async def start(self, job_id: str, params: dict[str, Any]) -> None:
        """Starts the background log writer task."""
        if not os.path.exists(self.log_dir):
            try:
                os.makedirs(self.log_dir, exist_ok=True)
            except OSError:
                # Fallback to local dir if running without root or custom config
                self.log_dir = os.path.join(os.getcwd(), "logs")
                os.makedirs(self.log_dir, exist_ok=True)
        
        self._cancel_event.clear()
        self._task = asyncio.create_task(self._writer_loop())

    async def stop(self, job_id: str) -> None:
        """Stops the log writer task gracefully."""
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def status(self, job_id: str) -> dict[str, Any]:
        return {
            "is_running": self._task is not None and not self._task.done(),
            "log_dir": self.log_dir
        }

    async def _writer_loop(self):
        log_file = os.path.join(self.log_dir, f"session_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.jsonl")
        
        # Subscribe to EventBus
        event_stream = bus.subscribe(max_queue_size=10000)
        
        try:
            with open(log_file, "a") as f:
                async for event in event_stream:
                    # 14-field schema conversion
                    log_entry = {
                        "ts": datetime.now(timezone.utc).isoformat() + "Z",
                        "ts_mono": event.get("ts_mono", time.monotonic()),
                        "level": event.get("payload", {}).get("level", "INFO"),
                        "event": event["topic"],
                        "source": event.get("payload", {}).get("source", "system"),
                        "bssid": event.get("payload", {}).get("bssid"),
                        "client_mac": event.get("payload", {}).get("client_mac"),
                        "job_id": event.get("payload", {}).get("job_id"),
                        "trace_id": event.get("payload", {}).get("trace_id"),
                        "duration_ms": event.get("payload", {}).get("duration_ms"),
                        "packets": event.get("payload", {}).get("packets"),
                        "message": event.get("payload", {}).get("message"),
                        "hint": event.get("payload", {}).get("hint"),
                        "raw_data": event.get("payload", {}).get("raw_data")
                    }
                    # Remove None values to save space
                    log_entry = {k: v for k, v in log_entry.items() if v is not None}
                    
                    f.write(json.dumps(log_entry) + "\n")
                    f.flush()
        except asyncio.CancelledError:
            pass
        except Exception:
            # Critical error in logger
            pass
