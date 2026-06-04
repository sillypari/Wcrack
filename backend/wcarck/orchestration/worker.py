import asyncio
from typing import Dict, Any, Optional
from wcarck.db.session import SessionLocal
from wcarck.db.jobs import JobQueueOps
from wcarck.orchestration.leases import RadioLeaseManager, ResourceBusyError
from wcarck.modules.recon.scanner import ScannerModule
from wcarck.modules.attack.deauth import DeauthModule
from wcarck.modules.attack.pmkid import PMKIDModule
from wcarck.modules.attack.pmkid_crack import PMKIDCrackModule
from wcarck.modules.attack.mitm import MITMModule
from wcarck.modules.attack.eviltwin import EvilTwinModule
from wcarck.core.module import Module
from wcarck.core.event_bus import bus
import structlog

logger = structlog.get_logger()

# Deprecated in-memory queue for backward compatibility with api/crack.py
_job_queue = asyncio.Queue()

class JobWorker:
    """
    Background orchestrator that pulls jobs from the queue and executes them.
    Handles global exception recovery and lease cleanup.
    """
    def __init__(self, lease_manager: RadioLeaseManager):
        self.lease_manager = lease_manager
        self._task: Optional[asyncio.Task] = None
        self._running_modules: Dict[str, Module] = {}
        self._job_stop_sub = None

    async def start(self):
        self._task = asyncio.create_task(self._loop())
        
        # Subscribe to stop requests via EventBus
        async def on_stop_req(event):
            # parse as str since job IDs can be UUIDs
            job_id = str(event["payload"]["job_id"])
            if job_id in self._running_modules:
                logger.info(f"Received stop request for job {job_id}")
                await self._stop_job(job_id)
                
        self._job_stop_sub = bus.subscribe(max_queue_size=100)
        asyncio.create_task(self._listen_for_stops(on_stop_req))

    async def _listen_for_stops(self, callback):
        async for event in self._job_stop_sub:
            if event["topic"] == "job.stop_requested":
                try:
                    await callback(event)
                except Exception as e:
                    logger.error(f"Error in stop callback: {e}")

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
                
        # Stop all running modules
        for job_id in list(self._running_modules.keys()):
            await self._stop_job(job_id)

    def _instantiate_module(self, name: str) -> Optional[Module]:
        if name == "recon.scanner":
            return ScannerModule(self.lease_manager)
        elif name == "attack.deauth":
            return DeauthModule(self.lease_manager)
        elif name == "attack.pmkid":
            return PMKIDModule(self.lease_manager)
        elif name == "attack.eviltwin":
            return EvilTwinModule(self.lease_manager)
        elif name == "crack.aircrack":
            from wcarck.modules.attack.crack import CrackModule
            return CrackModule()
        elif name == "attack.pmkid_crack":
            return PMKIDCrackModule()
        elif name == "attack.mitm":
            return MITMModule()
        return None

    async def _loop(self):
        logger.info("JobWorker orchestrator started")
        while True:
            try:
                await asyncio.sleep(1.0) # Polling interval
                
                async with SessionLocal() as session:
                    job = await JobQueueOps.fetch_next_job(session)
                    if not job:
                        # Process items from _job_queue if any
                        if not _job_queue.empty():
                            await _job_queue.get()
                        continue
                        
                    job_id_str = str(job.id)
                    logger.info(f"Starting job {job_id_str}: {job.module_name}")
                    
                    module = self._instantiate_module(job.module_name)
                    if not module:
                        await JobQueueOps.mark_failed(session, job.id, f"Unknown module: {job.module_name}")
                        await session.commit()
                        continue

                    self._running_modules[job_id_str] = module
                    try:
                        await module.start(job_id_str, job.params_json)
                        await JobQueueOps.mark_running(session, job.id)
                        await session.commit()
                    except ResourceBusyError as e:
                        logger.warning(f"Job {job_id_str} failed: Resource Busy ({e})")
                        await JobQueueOps.mark_failed(session, job.id, str(e))
                        await session.commit()
                        await self._stop_job(job_id_str)
                    except Exception as e:
                        logger.error(f"Job {job_id_str} crashed on start", exc_info=True)
                        try:
                            await JobQueueOps.mark_failed(session, job.id, f"Crash: {str(e)}")
                            await session.commit()
                        except Exception:
                            pass
                        await self._stop_job(job_id_str)
                        
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"JobWorker loop error: {e}", exc_info=True)
                for jid in list(self._running_modules.keys()):
                    try:
                        await self._stop_job(jid)
                    except Exception:
                        logger.error(f"Failed to cleanup orphaned job {jid}")

    async def _stop_job(self, job_id: str):
        module = self._running_modules.pop(job_id, None)
        if not module:
            return
            
        try:
            await module.stop(job_id)
        except Exception as e:
            logger.error(f"Failed to cleanly stop module for job {job_id}: {e}")

        try:
            await self.lease_manager.release_all_for_job(job_id)
        except Exception as e:
            logger.error(f"Failed to release leases for job {job_id}: {e}")
                
        try:
            async with SessionLocal() as session:
                await JobQueueOps.mark_completed(session, job_id)
                await session.commit()
        except Exception:
            pass
            
        logger.info(f"Job {job_id} completely stopped and cleaned up")
