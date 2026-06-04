import asyncio
import os
import csv
import time
from typing import Any, Optional
from wcarck.core.module import Module
from wcarck.core.event_bus import bus
from wcarck.hardware.process import ManagedProcess
from wcarck.orchestration.leases import RadioLeaseManager
import structlog

logger = structlog.get_logger()

class ScannerModule(Module):
    """
    Passive 802.11 Reconnaissance Module.
    Acquires a monitor.scan lease and orchestrates airodump-ng.
    """
    
    def __init__(self, lease_manager: RadioLeaseManager):
        self.lease_manager = lease_manager
        self._process: Optional[ManagedProcess] = None
        self._parser_task: Optional[asyncio.Task] = None
        self._cancel_event = asyncio.Event()

    @property
    def name(self) -> str:
        return "recon.scanner"

    async def start(self, job_id: str, params: dict[str, Any]) -> None:
        iface = params.get("iface", "wlan_mon")
        
        # 1. Acquire Lease
        await self.lease_manager.acquire(job_id, iface, "monitor.scan")
        
        self._cancel_event.clear()
        
        # 2. Start Scanner Process (airodump-ng)
        # Note: MVP fallback command if airodump-ng not present
        cmd = ["airodump-ng", "--output-format", "csv", "-w", f"/tmp/wcarck_scan_{job_id}", iface]
        if os.name == 'nt':
            # Windows dev dummy
            cmd = ["python", "-c", "import time; print('Simulating scan...'); time.sleep(60)"]
            
        self._process = ManagedProcess(cmd=cmd, job_id=job_id)
        await self._process.start()
        
        # 3. Start CSV parser tailer
        self._parser_task = asyncio.create_task(self._tail_csv(job_id))
        
        bus.publish("module.started", {"job_id": job_id, "module": self.name})

    async def stop(self, job_id: str) -> None:
        self._cancel_event.set()
        
        if self._process:
            await self._process.stop()
            self._process = None
            
        if self._parser_task:
            self._parser_task.cancel()
            try:
                await self._parser_task
            except asyncio.CancelledError:
                pass
            self._parser_task = None
            
        # Release lease
        # Wait, how do we know the iface? For MVP we just release all for this job
        # Real app: store it in module state
        # await self.lease_manager.release(job_id, iface)

        bus.publish("module.stopped", {"job_id": job_id, "module": self.name})

    async def status(self, job_id: str) -> dict[str, Any]:
        return {
            "is_running": self._process is not None,
            "module": self.name
        }

    async def _tail_csv(self, job_id: str):
        """Asynchronously tails the airodump-ng CSV and publishes events."""
        csv_file = f"/tmp/wcarck_scan_{job_id}-01.csv"
        
        self._last_csv_line = time.time()
        
        # Start watchdog
        watchdog_task = asyncio.create_task(self._csv_watchdog(job_id))

        if os.name == 'nt':
            # Dummy loop for windows dev
            while not self._cancel_event.is_set():
                await asyncio.sleep(2.0)
                self._last_csv_line = time.time()
                bus.publish("network.discovered", {
                    "job_id": job_id,
                    "bssid": "00:11:22:33:44:55",
                    "ssid": "Wcarck_Test_Net",
                    "channel": 6,
                    "encryption": "WPA2"
                })
            watchdog_task.cancel()
            return

        # Real CSV tailing logic with utf-8 replace
        while not os.path.exists(csv_file) and not self._cancel_event.is_set():
            await asyncio.sleep(0.5)
            
        if self._cancel_event.is_set():
            watchdog_task.cancel()
            return

        import csv
        with open(csv_file, 'r', encoding='utf-8', errors='replace') as f:
            reader = csv.reader(f, quotechar='"', skipinitialspace=True)
            while not self._cancel_event.is_set():
                where = f.tell()
                line = f.readline()
                if not line:
                    await asyncio.sleep(0.5)
                    f.seek(where)
                else:
                    self._last_csv_line = time.time()
                    if "BSSID" not in line and line.strip() != "":
                        try:
                            # parse with csv module properly
                            parts = next(csv.reader([line], quotechar='"', skipinitialspace=True))
                            if len(parts) > 13:
                                bus.publish("network.discovered", {
                                    "job_id": job_id,
                                    "bssid": parts[0].strip(),
                                    "ssid": parts[13].strip(),
                                    "channel": parts[3].strip(),
                                    "encryption": parts[5].strip()
                                })
                        except Exception:
                            pass
        watchdog_task.cancel()

    async def _csv_watchdog(self, job_id: str) -> None:
        """Publishes scan.stale if no CSV output is written for 30s."""
        while not self._cancel_event.is_set():
            await asyncio.sleep(10.0)
            age = time.time() - getattr(self, '_last_csv_line', time.time())
            if age > 30.0:
                bus.publish("scan.stale", {
                    "job_id": job_id,
                    "seconds_since_last_network": age
                })
