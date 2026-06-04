import asyncio
import os
import signal
from typing import Optional, List
from wcarck.core.event_bus import bus
import time

class ManagedProcess:
    """
    Wraps asyncio.create_subprocess_exec to ensure process group isolation,
    preventing orphaned airodump-ng/scapy zombie processes, and avoiding
    GIL pipe deadlocks.
    """
    PRIVILEGED_BINS = frozenset({"iw", "ip", "macchanger", "hostapd", "dnsmasq", "aircrack-ng", "aireplay-ng", "hcxdumptool", "hcxhashtool", "airodump-ng", "airmon-ng", "mdk4"})

    def __init__(self, cmd: List[str], job_id: str, track_stdout: bool = True):
        import shutil
        self.cmd = []
        for bin_name in cmd:
            base = bin_name.split("/")[-1]
            if base in self.PRIVILEGED_BINS and shutil.which(base) is None:
                raise FileNotFoundError(f"Privileged binary '{base}' not found in PATH.")
        
        # Auto-prepend sudo if needed
        if cmd and cmd[0] in self.PRIVILEGED_BINS and os.name == 'posix':
            self.cmd = ["sudo", "-n"] + cmd
        else:
            self.cmd = cmd
            
        self.job_id = job_id
        self.track_stdout = track_stdout
        self._process: Optional[asyncio.subprocess.Process] = None
        self._task_group: Optional[asyncio.TaskGroup] = None
        self._drain_tasks: List[asyncio.Task] = []

    async def start(self) -> None:
        """Starts the process in its own session/process group."""
        
        # start_new_session=True creates a new process group on Linux/Unix
        # For Windows dev-mode fallback, we use creationflags
        kwargs = {}
        if os.name == 'posix':
            kwargs['start_new_session'] = True
        elif os.name == 'nt':
            kwargs['creationflags'] = getattr(asyncio.subprocess, 'CREATE_NEW_PROCESS_GROUP', 0x00000200)

        try:
            self._process = await asyncio.create_subprocess_exec(
                *self.cmd,
                stdout=asyncio.subprocess.PIPE if self.track_stdout else asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
                **kwargs
            )
        except OSError as e:
            if e.errno == 16: # Device or resource busy
                bus.publish("process.error", {"job_id": self.job_id, "error": "Device or resource busy. Retrying..."})
                await asyncio.sleep(1.0)
                self._process = await asyncio.create_subprocess_exec(
                    *self.cmd,
                    stdout=asyncio.subprocess.PIPE if self.track_stdout else asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.PIPE,
                    **kwargs
                )
            else:
                raise

        bus.publish("process.started", {
            "job_id": self.job_id,
            "cmd": " ".join(self.cmd),
            "pid": self._process.pid
        })

        if self.track_stdout:
            # We must use TaskGroup or ensure drains to avoid pipe deadlock
            # Note: TaskGroup requires Python 3.11+
            self._drain_tasks.append(asyncio.create_task(self._drain_stdout()))
        self._drain_tasks.append(asyncio.create_task(self._drain_stderr()))

    async def _drain_stdout(self):
        if not self._process or not self._process.stdout:
            return
        try:
            async for line in self._process.stdout:
                bus.publish("process.stdout", {
                    "job_id": self.job_id,
                    "line": line.decode('utf-8', errors='replace').strip()
                })
        except ValueError:
            pass

    async def _drain_stderr(self):
        if not self._process or not self._process.stderr:
            return
        try:
            async for line in self._process.stderr:
                bus.publish("process.stderr", {
                    "job_id": self.job_id,
                    "line": line.decode('utf-8', errors='replace').strip()
                })
        except ValueError:
            pass

    async def stop(self, grace: float = 5.0) -> None:
        """Kills the entire process tree, handling hcxdumptool exceptions."""
        if not self._process:
            return

        # Cancel drain tasks first
        for task in self._drain_tasks:
            task.cancel()
        self._drain_tasks.clear()
            
        if self._process.returncode is None:
            pid = self._process.pid

            if os.name == 'posix':
                try:
                    pgid = os.getpgid(pid)
                except ProcessLookupError:
                    pgid = None

                if pgid is not None:
                    try:
                        os.killpg(pgid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass

                await asyncio.sleep(2.0)

                if pgid is not None:
                    try:
                        os.killpg(pgid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
            else:
                try:
                    self._process.terminate()
                except ProcessLookupError:
                    pass

            try:
                await asyncio.wait_for(self._process.wait(), timeout=grace)
            except asyncio.TimeoutError:
                try:
                    if os.name == 'posix' and pgid is not None:
                        os.killpg(pgid, signal.SIGKILL)
                    else:
                        self._process.kill()
                except ProcessLookupError:
                    pass
                await self._process.wait()

        bus.publish("process.stopped", {
            "job_id": self.job_id,
            "returncode": self._process.returncode
        })
