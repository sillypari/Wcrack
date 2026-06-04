import asyncio
import time
import os
import random
from datetime import datetime, timezone
from typing import Dict, Set, Any, Optional
from sqlalchemy import select, update
from wcarck.core.event_bus import bus
from wcarck.db.session import SessionLocal
from wcarck.db.models import Network, Client, Capture, Credential, ApSession, AttackSession, CrackJob, JobQueue
import structlog

logger = structlog.get_logger()

class WcarckSimulator:
    """
    Simulation daemon for development and testing on non-Linux environments.
    Decoupled from production module executions by listening to module events on the EventBus.
    """
    def __init__(self):
        self._running = False
        self._listener_task: Optional[asyncio.Task] = None
        self._active_simulations: Dict[str, asyncio.Task] = {}

    def start(self):
        if self._running:
            return
        self._running = True
        self._listener_task = asyncio.create_task(self._event_listener())
        logger.info("Wcarck Dev Simulator daemon started")

    async def stop(self):
        self._running = False
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
        for job_id, task in list(self._active_simulations.items()):
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._active_simulations.clear()
        logger.info("Wcarck Dev Simulator daemon stopped")

    async def _event_listener(self):
        # Subscribe to EventBus to watch for module activations
        async for event in bus.subscribe():
            if not self._running:
                break
            topic = event.get("topic")
            payload = event.get("payload", {})
            job_id = str(payload.get("job_id"))
            module = payload.get("module")

            if topic == "module.started" and job_id and module:
                if job_id not in self._active_simulations:
                    task = asyncio.create_task(self._run_simulation(job_id, module))
                    self._active_simulations[job_id] = task
            elif topic == "module.stopped" and job_id:
                task = self._active_simulations.pop(job_id, None)
                if task:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

    async def _run_simulation(self, job_id: str, module: str):
        try:
            logger.info(f"Simulator starting mock loop for job {job_id} ({module})")
            if module == "recon.scanner":
                await self._simulate_scanner(job_id)
            elif module == "attack.deauth":
                await self._simulate_deauth(job_id)
            elif module == "attack.pmkid":
                await self._simulate_pmkid(job_id)
            elif module == "attack.eviltwin":
                await self._simulate_eviltwin(job_id)
            elif module == "crack.hashcat":
                await self._simulate_crack(job_id)
        except asyncio.CancelledError:
            logger.info(f"Simulator loop for job {job_id} ({module}) cancelled")
        except Exception as e:
            logger.error(f"Simulator error in job {job_id} ({module}): {e}", exc_info=True)

    async def _simulate_scanner(self, job_id: str):
        # Generate some mock networks and client stations
        mock_networks = [
            {"bssid": "00:11:22:33:44:55", "ssid": "Acme_Corporate", "channel": 6, "encryption": "WPA2 CCMP", "vendor": "Cisco Systems"},
            {"bssid": "AA:BB:CC:DD:EE:FF", "ssid": "Acme_Guest", "channel": 11, "encryption": "WPA2 TKIP", "vendor": "Ubiquiti"},
            {"bssid": "24:A0:74:11:22:33", "ssid": "Netgear_Home", "channel": 1, "encryption": "WPA2 CCMP", "vendor": "Netgear"},
            {"bssid": "E4:8D:8C:99:88:77", "ssid": "Starbucks Free", "channel": 44, "encryption": "NONE", "vendor": "Aruba Networks"}
        ]
        mock_clients = [
            {"mac": "70:8A:09:A1:B2:C3", "bssid": "00:11:22:33:44:55", "vendor": "Apple Inc"},
            {"mac": "BC:E2:65:D4:E5:F6", "bssid": "AA:BB:CC:DD:EE:FF", "vendor": "Samsung Electronics"},
            {"mac": "3C:06:30:12:34:56", "bssid": "24:A0:74:11:22:33", "vendor": "Intel Mobile"}
        ]

        logger.info("Simulator: Scan active. Generating discovery events...")
        while True:
            # Randomly discover/update networks and clients
            now = time.time()
            net = random.choice(mock_networks).copy()
            net["first_seen"] = now - 60
            net["last_seen"] = now
            net["signal_dbm"] = random.randint(-85, -35)
            net["power"] = net["signal_dbm"]
            
            bus.publish("network.discovered", net)
            bus.publish("rf.log", {
                "level": "INFO",
                "channel": "RF",
                "message": f"Discovered AP: {net['ssid']} ({net['bssid']}) on Ch {net['channel']} (Sig: {net['signal_dbm']}dBm)"
            })
            
            await asyncio.sleep(random.uniform(0.5, 1.5))

            cli = random.choice(mock_clients).copy()
            cli["first_seen"] = now - 30
            cli["last_seen"] = now
            cli["signal_dbm"] = random.randint(-90, -45)
            cli["power"] = cli["signal_dbm"]
            cli["packets"] = random.randint(10, 500)
            cli["probed_ssids"] = ["Home_WiFi", "Airport_WiFi"]
            
            bus.publish("client.discovered", cli)
            await asyncio.sleep(random.uniform(0.5, 1.5))

    async def _simulate_deauth(self, job_id: str):
        # Retrieve target AP info from db or params
        bssid = "00:11:22:33:44:55"
        client_mac = "FF:FF:FF:FF:FF:FF"
        
        async with SessionLocal() as session:
            stmt = select(JobQueue).where(JobQueue.id == int(job_id))
            res = await session.execute(stmt)
            job = res.scalar_one_or_none()
            if job and job.params_json:
                bssid = job.params_json.get("bssid", bssid)
                client_mac = job.params_json.get("client_mac", client_mac)

        logger.info(f"Simulator: Starting deauth loop for {bssid} -> {client_mac}")
        frames_sent = 0
        while True:
            frames_sent += 64
            # Publish job status updates so UI progress bar and packets count increment
            bus.publish("job.updated", {
                "id": job_id,
                "type": "deauth",
                "target": bssid,
                "status": "running",
                "progress": min(100, int(frames_sent / 10)),
                "startedAt": int(time.time() * 1000) - 2000,
                "framesSent": frames_sent,
                "packetsPerSec": random.randint(120, 200)
            })
            bus.publish("rf.log", {
                "level": "INFO",
                "channel": "RF",
                "message": f"Broadcasted 64 deauth frames to {client_mac} on {bssid}"
            })
            await asyncio.sleep(1.0)

    async def _simulate_pmkid(self, job_id: str):
        bssid = "00:11:22:33:44:55"
        async with SessionLocal() as session:
            stmt = select(JobQueue).where(JobQueue.id == int(job_id))
            res = await session.execute(stmt)
            job = res.scalar_one_or_none()
            if job and job.params_json:
                bssid = job.params_json.get("bssid", bssid)
                
        logger.info(f"Simulator: Starting PMKID collection for {bssid}")
        bus.publish("rf.log", {
            "level": "INFO",
            "channel": "RF",
            "message": f"hcxdumptool capturing frames for target {bssid} on Ch 6"
        })
        
        # Capture stages
        await asyncio.sleep(2.0)
        bus.publish("rf.log", {
            "level": "INFO",
            "channel": "RF",
            "message": f"Discovered client requesting association to {bssid}"
        })
        
        await asyncio.sleep(2.0)
        # Create and log capture record in DB
        async with SessionLocal() as session:
            # Fetch active project/scope to link properly
            from wcarck.api.projects import get_active_project
            proj = await get_active_project(session)
            proj_id = proj.id if proj else None
            
            stmt_scope = select(JobQueue.scope_id).where(JobQueue.id == int(job_id))
            res_scope = await session.execute(stmt_scope)
            scope_id = res_scope.scalar() or 1
            
            cap = Capture(
                type="pmkid",
                path=f"/var/lib/wcarck/captures/pmkid_{job_id}.pcapng",
                sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                bssid=bssid,
                ssid="Acme_Corporate",
                size_bytes=1420,
                scope_id=scope_id,
                project_id=proj_id
            )
            session.add(cap)
            await session.commit()
            await session.refresh(cap)
            
            # Notify event bus
            bus.publish("capture.handshake.eapol_m2", {
                "id": str(cap.id),
                "bssid": bssid,
                "ssid": "Acme_Corporate",
                "type": "pmkid",
                "status": "Valid",
                "filePath": cap.path,
                "timestamp": int(time.time() * 1000),
                "eapolM1": True,
                "eapolM2": True,
                "eapolM3": False,
                "eapolM4": False
            })

            bus.publish("rf.log", {
                "level": "INFO",
                "channel": "RF",
                "message": f"SUCCESS: PMKID handshake captured for {bssid}. Saved to {cap.path}"
            })

        # Keep running in case stopping is required
        while True:
            await asyncio.sleep(5.0)

    async def _simulate_eviltwin(self, job_id: str):
        target = "00:11:22:33:44:55"
        ssid = "Acme_Corporate"
        
        async with SessionLocal() as session:
            stmt = select(JobQueue).where(JobQueue.id == int(job_id))
            res = await session.execute(stmt)
            job = res.scalar_one_or_none()
            if job and job.params_json:
                target = job.params_json.get("targetBssid", target)
                ssid = job.params_json.get("spoofSsid", ssid)

        logger.info(f"Simulator: Starting Evil Twin fake AP '{ssid}' spoofing {target}")
        
        # Create an ApSession model in DB
        async with SessionLocal() as session:
            from wcarck.api.projects import get_active_project
            proj = await get_active_project(session)
            proj_id = proj.id if proj else None
            
            stmt_scope = select(JobQueue.scope_id).where(JobQueue.id == int(job_id))
            res_scope = await session.execute(stmt_scope)
            scope_id = res_scope.scalar() or 1
            
            ap_sess = ApSession(
                ssid=ssid,
                bssid="00:c0:ca:8b:21:22", # AP adapter mac
                channel=6,
                portal_template="router",
                clients_connected=0,
                credentials_captured=0,
                status="running",
                scope_id=scope_id,
                project_id=proj_id
            )
            session.add(ap_sess)
            await session.commit()
            await session.refresh(ap_sess)
            ap_session_id = ap_sess.id

        dns_requests = 0
        clients_connected = 0
        credential_sent = False
        started_at = int(time.time() * 1000)

        while True:
            await asyncio.sleep(2.0)
            
            # Simulate DNS events and increments
            dns_requests += random.randint(5, 15)
            if clients_connected < 3:
                clients_connected += 1
                bus.publish("rf.log", {
                    "level": "INFO",
                    "channel": "Portal",
                    "message": f"New client associated to fake AP: station 70:8A:09:A1:B2:C{clients_connected}"
                })
            
            # Publish EvilTwin job stats
            bus.publish("job.updated", {
                "id": job_id,
                "type": "eviltwin",
                "target": ssid,
                "status": "running",
                "progress": 0,
                "startedAt": started_at,
                "framesSent": dns_requests, # Map to DNS Requests
                "packetsPerSec": clients_connected # Map to Client connections
            })
            
            # Fake HTTP portal request logs
            bus.publish("rf.log", {
                "level": "INFO",
                "channel": "Portal",
                "message": f"HTTP GET / from 10.0.0.1{clients_connected} (User-Agent: AppleWebKit/Safari)"
            })

            # Randomly capture credentials
            if not credential_sent and dns_requests > 40:
                credential_sent = True
                async with SessionLocal() as session:
                    cred = Credential(
                        ap_session_id=ap_session_id,
                        network_ssid=ssid,
                        password=random.choice(["Admin123!", "AcmeWelcome2026", "password123"]),
                        client_mac=f"70:8A:09:A1:B2:C{random.randint(1, 3)}",
                        client_ip="10.0.0.12",
                        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
                        validated=True,
                        validated_at=datetime.now(timezone.utc).replace(tzinfo=None),
                        project_id=proj_id
                    )
                    session.add(cred)
                    
                    # Update ApSession counter
                    await session.execute(
                        update(ApSession)
                        .where(ApSession.id == ap_session_id)
                        .values(credentials_captured=ApSession.credentials_captured + 1)
                    )
                    await session.commit()
                    await session.refresh(cred)
                    
                    # Notify event bus
                    bus.publish("credential.captured", {
                        "id": str(cred.id),
                        "bssid": "00:c0:ca:8b:21:22",
                        "ssid": ssid,
                        "clientMac": cred.client_mac,
                        "username": "admin",
                        "plainText": cred.password,
                        "type": "portal",
                        "valid": True,
                        "timestamp": int(cred.captured_at.replace(tzinfo=timezone.utc).timestamp() * 1000)
                    })
                    
                    bus.publish("rf.log", {
                        "level": "INFO",
                        "channel": "Portal",
                        "message": f"SUCCESS: Valid password captured via portal login: '{cred.password}'"
                    })

    async def _simulate_crack(self, job_id: str):
        logger.info(f"Simulator: Starting hashcat crack progress loop for job {job_id}")
        
        # Insert a CrackJob in DB if not exists
        async with SessionLocal() as session:
            stmt = select(CrackJob).where(CrackJob.id == int(job_id))
            res = await session.execute(stmt)
            cj = res.scalar_one_or_none()
            if not cj:
                from wcarck.api.projects import get_active_project
                proj = await get_active_project(session)
                proj_id = proj.id if proj else None
                
                stmt_scope = select(JobQueue.scope_id).where(JobQueue.id == int(job_id))
                res_scope = await session.execute(stmt_scope)
                scope_id = res_scope.scalar() or 1
                
                cj = CrackJob(
                    id=int(job_id),
                    name="Hashcat Cracking",
                    wordlist_path="rockyou.txt",
                    attack_mode=0,
                    backend="hashcat",
                    status="running",
                    scope_id=scope_id,
                    project_id=proj_id
                )
                session.add(cj)
                await session.commit()

        progress = 0
        started_at = int(time.time() * 1000)
        
        while progress < 100:
            await asyncio.sleep(1.0)
            progress += 10
            
            # Update database status
            async with SessionLocal() as session:
                await session.execute(
                    update(CrackJob)
                    .where(CrackJob.id == int(job_id))
                    .values(
                        progress_percent=float(progress),
                        speed_hashes_sec=42100,
                        candidates_tested=progress * 143000
                    )
                )
                await session.commit()
                
            # Publish update
            bus.publish("job.updated", {
                "id": job_id,
                "type": "crack",
                "target": "rockyou.txt",
                "status": "running",
                "progress": progress,
                "startedAt": started_at,
                "framesSent": progress * 143000,
                "packetsPerSec": 42100
            })
            
            bus.publish("rf.log", {
                "level": "INFO",
                "channel": "Process",
                "message": f"hashcat: dict attack progress: {progress}% (speed=42.1 kH/s, tested={progress*143000})"
            })

        # Successfully cracked password!
        cracked_pwd = "password123"
        async with SessionLocal() as session:
            # Update CrackJob
            await session.execute(
                update(CrackJob)
                .where(CrackJob.id == int(job_id))
                .values(
                    status="completed",
                    progress_percent=100.0,
                    cracked_plaintext=cracked_pwd,
                    ended_at=datetime.now(timezone.utc).replace(tzinfo=None)
                )
            )
            
            # Fetch project
            from wcarck.api.projects import get_active_project
            proj = await get_active_project(session)
            proj_id = proj.id if proj else None
            
            # Insert credential
            cred = Credential(
                ap_session_id=1, # Mock session link
                network_ssid="Acme_Corporate",
                password=cracked_pwd,
                client_mac="70:8A:09:A1:B2:C1",
                validated=True,
                validated_at=datetime.now(timezone.utc).replace(tzinfo=None),
                project_id=proj_id
            )
            session.add(cred)
            await session.commit()
            
        bus.publish("rf.log", {
            "level": "INFO",
            "channel": "Process",
            "message": f"hashcat: password recovered: '{cracked_pwd}'"
        })
        
        bus.publish("credential.captured", {
            "id": "crack_cred_id",
            "bssid": "00:11:22:33:44:55",
            "ssid": "Acme_Corporate",
            "clientMac": "70:8A:09:A1:B2:C1",
            "username": "WPA2 PMKID",
            "plainText": cracked_pwd,
            "type": "wpa_psk",
            "valid": True,
            "timestamp": int(time.time() * 1000)
        })

        # Complete job
        bus.publish("job.completed", {
            "id": job_id,
            "type": "crack",
            "target": "rockyou.txt",
            "status": "completed",
            "progress": 100,
            "startedAt": started_at
        })
        
        # Triggers module stopped event
        bus.publish("module.stopped", {"job_id": job_id, "module": "crack.hashcat"})

# Global simulator instance
simulator = WcarckSimulator()
