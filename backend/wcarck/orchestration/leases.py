import asyncio
import time
from dataclasses import dataclass
from typing import Dict, Optional
import structlog

logger = structlog.get_logger()

class ResourceBusyError(Exception):
    def __init__(self, message: str, active_job_id: str):
        super().__init__(message)
        self.active_job_id = active_job_id


@dataclass
class Lease:
    job_id: str
    resource_id: str
    lease_type: str  # e.g., 'monitor.scan', 'monitor.locked', 'ap.service', 'uplink.managed'
    expires_at: float




class RadioLeaseManager:
    """
    Manages leases for hardware adapters (resources) to prevent conflicting operations.
    Lock granularity is (resource_type, resource_id).
    """

    def __init__(self, ttl_seconds: float = 30.0):
        self.ttl_seconds = ttl_seconds
        self._leases: Dict[str, Lease] = {}  # key: resource_id
        self._adapter_locks: Dict[str, asyncio.Lock] = {}
        self._sweeper_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    def _get_adapter_lock(self, resource_id: str) -> asyncio.Lock:
        """Get or create a per-adapter lock. Must be called from the event loop."""
        if resource_id not in self._adapter_locks:
            self._adapter_locks[resource_id] = asyncio.Lock()
        return self._adapter_locks[resource_id]

    async def start_sweeper(self):
        """Starts the background task to orphan expired leases."""
        if self._sweeper_task is None:
            self._sweeper_task = asyncio.create_task(self._sweep_expired())

    async def stop_sweeper(self):
        """Stops the background sweeper."""
        if self._sweeper_task:
            self._sweeper_task.cancel()
            try:
                await self._sweeper_task
            except asyncio.CancelledError:
                pass
            self._sweeper_task = None

    async def _sweep_expired(self):
        while True:
            try:
                await asyncio.sleep(1.0)
                now = time.monotonic()
                keys = list(self._leases.keys())
                for key in keys:
                    lock = self._get_adapter_lock(key)
                    async with lock:
                        lease = self._leases.get(key)
                        if lease and lease.expires_at < now:
                            del self._leases[key]
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Lease sweeper error: {e}")

    async def acquire(self, job_id: str, resource_id: str, lease_type: str) -> None:
        """
        Attempt to acquire a lease on a resource.
        Raises ResourceBusyError if there is a conflict.
        """
        lock = self._get_adapter_lock(resource_id)
        async with lock:
            existing = self._leases.get(resource_id)
            if existing:
                if existing.job_id == job_id:
                    pass
                else:
                    # Preemption logic for Channel Hopping Race Conditions (Edge case 5.5)
                    if lease_type == "monitor.locked" and existing.lease_type == "monitor.scan":
                        # Preempt the scanner
                        from wcarck.core.event_bus import bus
                        bus.publish("lease.preempted", {
                            "job_id": existing.job_id,
                            "resource_id": resource_id,
                            "preempted_by": job_id
                        })
                        # Immediately revoke the old lease
                        del self._leases[resource_id]
                    else:
                        raise ResourceBusyError(
                            f"Resource {resource_id} is currently leased by job {existing.job_id} for {existing.lease_type}",
                            active_job_id=existing.job_id
                        )
            
            self._leases[resource_id] = Lease(
                job_id=job_id,
                resource_id=resource_id,
                lease_type=lease_type,
                expires_at=time.monotonic() + self.ttl_seconds
            )
            from wcarck.core.event_bus import bus
            bus.publish("lease.acquired", {
                "job_id": job_id,
                "resource_id": resource_id,
                "lease_type": lease_type
            })

    async def renew(self, job_id: str, resource_id: str) -> None:
        """Renew a lease to prevent expiration."""
        lock = self._get_adapter_lock(resource_id)
        async with lock:
            existing = self._leases.get(resource_id)
            if existing and existing.job_id == job_id:
                existing.expires_at = time.monotonic() + self.ttl_seconds

    async def release(self, job_id: str, resource_id: str) -> None:
        """Release a lease when a job finishes."""
        lock = self._get_adapter_lock(resource_id)
        async with lock:
            existing = self._leases.get(resource_id)
            if existing and existing.job_id == job_id:
                del self._leases[resource_id]
                from wcarck.core.event_bus import bus
                bus.publish("lease.released", {
                    "job_id": job_id,
                    "resource_id": resource_id
                })

    async def release_all_for_job(self, job_id: str) -> None:
        """Release all leases held by a specific job. Used on crash/stop."""
        keys_to_release = [k for k, v in list(self._leases.items()) if v.job_id == job_id]
        for key in keys_to_release:
            lock = self._get_adapter_lock(key)
            async with lock:
                existing = self._leases.get(key)
                if existing and existing.job_id == job_id:
                    del self._leases[key]
                    from wcarck.core.event_bus import bus
                    bus.publish("lease.released", {
                        "job_id": job_id,
                        "resource_id": key
                    })
