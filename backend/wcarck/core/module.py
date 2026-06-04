import abc
from typing import Any

class Module(abc.ABC):
    """
    Base contract for all Wcarck data-plane modules (e.g. ScanModule, DeauthModule).
    Ensures a consistent lifecycle for orchestration.
    """
    
    @property
    @abc.abstractmethod
    def name(self) -> str:
        """Return the unique name of the module."""
        pass

    @abc.abstractmethod
    async def start(self, job_id: str, params: dict[str, Any]) -> None:
        """
        Start the module's primary operation. 
        Implementations should acquire necessary resources (like leases) here.
        Raises DomainError or ResourceBusyError if start fails.
        """
        pass

    @abc.abstractmethod
    async def stop(self, job_id: str) -> None:
        """
        Stop the module's operation for the given job_id.
        Must be idempotent and safe to call even if start() failed halfway.
        """
        pass

    @abc.abstractmethod
    async def status(self, job_id: str) -> dict[str, Any]:
        """
        Return the current state and metrics of the job.
        """
        pass
