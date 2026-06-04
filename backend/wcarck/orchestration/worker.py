import asyncio
from typing import Dict, Any, Optional
from wcarck.db.session import SessionLocal
from wcarck.db.jobs import JobQueueOps
from wcarck.orchestration.leases import RadioLeaseManager, ResourceBusyError
from wcarck.modules.recon.scanner import ScannerModule
from wcarck.modules.attack.deauth import DeauthModule
from wcarck.modules.attack.pmkid import PMKIDModule
from wcarck.modules.attack.eviltwin import EvilTwinModule
from wcarck.core.module import Module
from wcarck.core.event_bus import bus
import structlog

logger = structlog.get_logger()

class JobWorker:
    """
    Background orchestrator that pulls jobs from the queue and executes them.
    Handles global exception recovery and lease cleanup.
    """
    def __init__(self, lease_manager: RadioLeaseManager):
        self.lease_manager = lease_manager
        self._task: Optional[asyncio.Task] = None
        self._running_modules: Dict[int, Module] = {}
        self._job_stop_sub = None

    async def start(self):
        self._task = asyncio.create_task(self._loop())
        
        # Subscribe to stop requests via EventBus
        async def on_stop_req(event):
            job_id = int(event["payload"]["job_id"])
            if job_id in self._running_modules:
                logger.info(f"Received stop request for job {job_id}")
                await self._stop_job(job_id)
                
        self._job_stop_sub = bus.subscribe(max_queue_size=100)
        asyncio.create_task(self._listen_for_stops(on_stop_req))

    async def _listen_for_stops(self, callback):
        async for event in self._job_stop_sub:
            if event["topic"] == "job.stop_requested":
                await callback(event)

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
        elif name == "crack.hashcat":
            from wcarck.modules.attack.crack import CrackModule
            return CrackModule()
        return None

    async def _loop(self):
        logger.info("JobWorker orchestrator started")
        while True:
            try:
                await asyncio.sleep(1.0) # Polling interval
                
                async with SessionLocal() as session:
                    job = await JobQueueOps.fetch_next_job(session)
                    if not job:
                        continue
                        
                    logger.info(f"Starting job {job.id}: {job.module_name}")
                    
                    module = self._instantiate_module(job.module_name)
                    if not module:
                        await JobQueueOps.mark_failed(session, job.id, f"Unknown module: {job.module_name}")
                        await session.commit()
                        continue
                        
                    # Execute with strict exception handling
                    try:
                        self._running_modules[job.id] = module
                        await module.start(str(job.id), job.params_json)
                        await JobQueueOps.mark_running(session, job.id)
                        await session.commit()
                    except ResourceBusyError as e:
                        logger.warning(f"Job {job.id} failed: Resource Busy ({e})")
                        await JobQueueOps.mark_failed(session, job.id, str(e))
                        await session.commit()
                        del self._running_modules[job.id]
                    except Exception as e:
                        logger.error(f"Job {job.id} crashed on start", exc_info=True)
                        await JobQueueOps.mark_failed(session, job.id, f"Crash: {str(e)}")
                        await session.commit()
                        await self._stop_job(job.id) # Ensure cleanup
                        
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"JobWorker loop error: {e}", exc_info=True)

    async def _stop_job(self, job_id: int):
        module = self._running_modules.get(job_id)
        if not module:
            return
            
        try:
            await module.stop(str(job_id))
        except Exception as e:
            logger.error(f"Failed to cleanly stop module for job {job_id}: {e}")
            
        # In a real app we'd release the specific lease keys the module took.
        # Here we just iterate and release any lease tied to this job.
        async with self.lease_manager._lock:
            keys_to_del = [k for k, v in self.lease_manager._leases.items() if v.job_id == str(job_id)]
            for k in keys_to_del:
                del self.lease_manager._leases[k]
                
        async with SessionLocal() as session:
            await JobQueueOps.mark_completed(session, job_id)
            await session.commit()
            
        del self._running_modules[job_id]
        logger.info(f"Job {job_id} completely stopped and cleaned up")
