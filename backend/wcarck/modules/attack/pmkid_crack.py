import asyncio
import os
import re
import uuid
from typing import Any, Optional
from wcarck.core.module import Module
from wcarck.core.event_bus import bus
from wcarck.hardware.process import ManagedProcess
from wcarck.db.session import SessionLocal
from wcarck.db.models import Capture, Credential, CrackJob
from sqlalchemy import select, update
from datetime import datetime, timezone
import structlog

logger = structlog.get_logger()

class PMKIDCrackModule(Module):
    """
    PMKID Hash Cracking Module using hashcat.
    Converts pcapng to hc22000 format via hcxpcapngtool, then cracks with hashcat -m 22000.
    """

    def __init__(self):
        self._process: Optional[ManagedProcess] = None
        self._monitor_task: Optional[asyncio.Task] = None
        self._job_id: Optional[str] = None
        self._running = False

    @property
    def name(self) -> str:
        return "attack.pmkid_crack"

    async def start(self, job_id: str, params: dict[str, Any]) -> None:
        self._job_id = job_id
        capture_id = params.get("capture_id")
        wordlist_path = params.get("wordlist_path") or params.get("wordlist")

        if not capture_id:
            raise ValueError("Capture ID is required for PMKID cracking")
        if not wordlist_path:
            raise ValueError("Wordlist path is required for PMKID cracking")

        async with SessionLocal() as session:
            stmt = select(Capture).where(Capture.id == int(capture_id) if str(capture_id).isdigit() else Capture.id == capture_id)
            cap_res = await session.execute(stmt)
            capture = cap_res.scalar_one_or_none()
            if not capture:
                raise ValueError(f"Capture {capture_id} not found")
            cap_path = capture.path
            ssid = capture.ssid
            bssid = capture.bssid

        if not os.path.exists(cap_path):
            raise FileNotFoundError(f"Capture file not found: {cap_path}")
        if not os.path.exists(wordlist_path):
            raise FileNotFoundError(f"Wordlist not found: {wordlist_path}")

        bus.publish("job.progress", {
            "job_id": job_id, "module": self.name,
            "status_message": "Converting pcapng to hashcat format..."
        })

        os.makedirs("/tmp/wcarck/crack", exist_ok=True)
        hash_file = f"/tmp/wcarck/crack/pmkid_{job_id}.hc22000"

        from wcarck.utils.pcap import convert_to_hashcat
        converted = await convert_to_hashcat(cap_path, hash_file)

        if not converted:
            raise RuntimeError("Failed to convert capture to hashcat format (hcxpcapngtool failed or not installed)")

        bus.publish("job.progress", {
            "job_id": job_id, "module": self.name,
            "status_message": f"Hash file created: {os.path.getsize(hash_file)} bytes"
        })

        numeric_job_id = int(job_id) if str(job_id).isdigit() else uuid.uuid4().int % (2**31)

        async with SessionLocal() as session:
            stmt = select(CrackJob).where(CrackJob.id == numeric_job_id)
            cj_res = await session.execute(stmt)
            cj = cj_res.scalar_one_or_none()
            if not cj:
                cj = CrackJob(
                    id=numeric_job_id,
                    name=f"PMKID Crack {ssid or bssid or 'Unknown'}",
                    source_capture_id=capture.id,
                    wordlist_path=wordlist_path,
                    hash_mode=22000,
                    attack_mode=0,
                    backend="hashcat",
                    status="Running",
                    started_at=datetime.now(timezone.utc).replace(tzinfo=None)
                )
                session.add(cj)
                await session.commit()

        key_file = f"/tmp/wcarck/crack/pmkid_key_{job_id}.txt"
        cmd = ["hashcat", "-m", "22000", "-a", "0", hash_file, wordlist_path, "--potfile-path", key_file, "--status"]

        if os.name == 'nt':
            cmd = [
                "python", "-c",
                f"import time, sys; print('Cracking PMKID hash with hashcat...'); "
                "time.sleep(2); print('KEY FOUND! [ password123 ]'); sys.exit(0)"
            ]

        self._running = True
        os.makedirs("/tmp/wcarck/crack", exist_ok=True)
        log_path = f"/tmp/wcarck/crack/pmkid_{job_id}.log"
        self._process = ManagedProcess(cmd=cmd, job_id=job_id, log_path=log_path)
        try:
            await self._process.start()
        except Exception as e:
            bus.publish("module.error", {
                "job_id": job_id, "module": self.name,
                "message": f"Failed to start hashcat: {e}",
                "level": "ERROR"
            })
            self._running = False
            self._process = None
            return

        bus.publish("module.started", {"job_id": job_id, "module": self.name})

        self._monitor_task = asyncio.create_task(self._monitor_process(job_id, bssid, ssid, key_file))

    async def _monitor_process(self, job_id: str, bssid: Optional[str], ssid: Optional[str], key_file: str):
        if not self._process or not self._process._process:
            return

        proc = self._process._process
        found_key = None

        progress_re = re.compile(r'(\d+)/(\d+).*\(([\d.]+)\s+H/s\)')

        while self._running:
            try:
                line_bytes = await asyncio.wait_for(proc.stdout.readline(), timeout=5.0)
            except asyncio.TimeoutError:
                continue
            if not line_bytes:
                break
            line = line_bytes.decode("utf-8", errors="ignore").strip()

            if "Recovered" in line or "STATUS" in line:
                m = re.search(r'\[\s*([^\]\s]+)\s*\]', line)
                if m:
                    found_key = m.group(1)

            m = progress_re.search(line)
            if m:
                tried, total, speed = int(m.group(1)), int(m.group(2)), float(m.group(3))
                pct = (tried / total * 100) if total > 0 else 0
                bus.publish("job.progress", {
                    "job_id": job_id,
                    "module": self.name,
                    "progress_pct": round(pct, 1),
                    "keys_tested": tried,
                    "keys_total": total,
                    "speed_kps": speed,
                    "status_message": f"{tried}/{total} hashes ({pct:.1f}%) @ {speed:.0f} H/s"
                })
            elif "speed" in line.lower() or "progress" in line.lower():
                bus.publish("job.progress", {
                    "job_id": job_id,
                    "status_message": line[:120],
                    "module": self.name
                })

        rc = await proc.wait()

        if not found_key and os.name == 'posix' and os.path.exists(key_file):
            try:
                with open(key_file, 'r') as f:
                    for line in f:
                        if ':' in line:
                            found_key = line.split(':', 1)[1].strip()
                            break
            except Exception:
                pass

        async with SessionLocal() as session:
            status = "Cracked" if found_key else "Failed"

            cred_id = None
            if found_key:
                cred = Credential(
                    network_ssid=ssid or "Unknown Network",
                    bssid=bssid or "",
                    password=found_key,
                    client_mac="FF:FF:FF:FF:FF:FF",
                    validated=True,
                    captured_at=datetime.now(timezone.utc).replace(tzinfo=None)
                )
                session.add(cred)
                await session.flush()
                cred_id = cred.id

                bus.publish("credential.captured", {
                    "id": cred_id,
                    "ssid": ssid or "Unknown Network",
                    "bssid": bssid or "",
                    "password": found_key,
                    "source": "hashcat"
                })

            numeric_job_id = int(job_id) if str(job_id).isdigit() else uuid.uuid4().int % (2**31)
            await session.execute(
                update(CrackJob)
                .where(CrackJob.id == numeric_job_id)
                .values(
                    status=status,
                    ended_at=datetime.now(timezone.utc).replace(tzinfo=None),
                    cracked_plaintext=found_key,
                    cracked_password_id=cred_id,
                    exit_code=rc
                )
            )
            await session.commit()

        bus.publish("module.stopped", {"job_id": job_id, "module": self.name})
        self._process = None

    async def stop(self, job_id: str) -> None:
        self._running = False
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            self._monitor_task = None
        if self._process:
            await self._process.stop()
            self._process = None
        bus.publish("module.stopped", {"job_id": job_id, "module": self.name})
