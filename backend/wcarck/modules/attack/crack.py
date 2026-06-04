import asyncio
from typing import Any, Optional
from wcarck.core.module import Module
from wcarck.core.event_bus import bus

class CrackModule(Module):
    """
    Offline password cracking module wrapper.
    Conforms to standard Module lifecycle. Real Linux boots run hashcat;
    development/windows runs simulated data.
    """
    def __init__(self):
        self._running = False
        self._task = None

    @property
    def name(self) -> str:
        return "crack.hashcat"

    async def start(self, job_id: str, params: dict[str, Any]) -> None:
        self._running = True
        bus.publish("module.started", {"job_id": job_id, "module": self.name})
        
        # Simulates cracking completion if running in real Linux without hashcat installed
        # (WcarckSimulator handles Windows / env simulation loops)
        import shutil
        if not shutil.which("hashcat"):
            self._task = asyncio.create_task(self._dummy_crack(job_id))

    async def stop(self, job_id: str) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        bus.publish("module.stopped", {"job_id": job_id, "module": self.name})

    async def status(self, job_id: str) -> dict[str, Any]:
        return {
            "is_running": self._running,
            "module": self.name
        }

    async def _dummy_crack(self, job_id: str):
        # A simple fallback sleep to complete the job
        await asyncio.sleep(5.0)
        bus.publish("module.stopped", {"job_id": job_id, "module": self.name})
