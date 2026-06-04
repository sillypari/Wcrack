from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from wcarck.db.models import JobQueue
import json

class JobQueueOps:
    @staticmethod
    async def enqueue_job(
        session: AsyncSession, 
        module_name: str, 
        handler_name: str, 
        params: dict,
        priority: int = 100,
        scope_id: Optional[int] = None,
        session_id: Optional[int] = None,
        project_id: Optional[int] = None
    ) -> JobQueue:
        job = JobQueue(
            module_name=module_name,
            handler_name=handler_name,
            params_json=params,
            status="queued",
            priority=priority,
            scope_id=scope_id,
            session_id=session_id,
            project_id=project_id
        )
        session.add(job)
        await session.flush()
        return job

    @staticmethod
    async def fetch_next_job(session: AsyncSession) -> Optional[JobQueue]:
        """Fetch highest priority queued job and mark as starting."""
        stmt = (
            select(JobQueue)
            .where(JobQueue.status == "queued")
            .order_by(JobQueue.priority.desc(), JobQueue.created_at.asc())
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        result = await session.execute(stmt)
        job = result.scalar_one_or_none()
        
        if job:
            job.status = "starting"
            job.started_at = datetime.now(timezone.utc)
            await session.flush()
            
        return job

    @staticmethod
    async def mark_running(session: AsyncSession, job_id: int) -> None:
        stmt = update(JobQueue).where(JobQueue.id == job_id).values(status="running")
        await session.execute(stmt)

    @staticmethod
    async def mark_completed(session: AsyncSession, job_id: int) -> None:
        stmt = update(JobQueue).where(JobQueue.id == job_id).values(
            status="completed",
            ended_at=datetime.now(timezone.utc)
        )
        await session.execute(stmt)

    @staticmethod
    async def mark_failed(session: AsyncSession, job_id: int, error_msg: str) -> None:
        stmt = update(JobQueue).where(JobQueue.id == job_id).values(
            status="failed",
            ended_at=datetime.now(timezone.utc),
            error_msg=error_msg
        )
        await session.execute(stmt)
