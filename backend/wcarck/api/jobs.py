from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict, Any, List
from wcarck.db.session import get_db
from wcarck.db.jobs import JobQueueOps
from wcarck.db.models import JobQueue
from pydantic import BaseModel

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

class JobCreateReq(BaseModel):
    module_name: str
    handler_name: str
    params: Dict[str, Any]
    priority: int = 100

class JobRes(BaseModel):
    id: int
    module_name: str
    status: str
    params_json: Dict[str, Any]
    
    class Config:
        from_attributes = True

@router.post("/start", response_model=JobRes)
async def start_job(req: JobCreateReq, db: AsyncSession = Depends(get_db)):
    # Basic validation
    valid_modules = ["recon.scanner", "attack.deauth", "attack.pmkid", "attack.eviltwin", "crack.hashcat"]
    if req.module_name not in valid_modules:
        raise HTTPException(status_code=400, detail="Invalid module_name")
        
    from wcarck.api.projects import get_active_project
    from wcarck.db.models import Scope
    
    active_project = await get_active_project(db)
    project_id = active_project.id if active_project else None
    scope_id = None
    if project_id:
        scope_stmt = select(Scope).where(Scope.project_id == project_id, Scope.active == True)
        scope_result = await db.execute(scope_stmt)
        scope = scope_result.scalar_one_or_none()
        if scope:
            scope_id = scope.id

    job = await JobQueueOps.enqueue_job(
        session=db,
        module_name=req.module_name,
        handler_name=req.handler_name,
        params=req.params,
        priority=req.priority,
        scope_id=scope_id,
        project_id=project_id
    )
    await db.commit()
    await db.refresh(job)
    return job

@router.get("", response_model=List[JobRes])
async def list_jobs(db: AsyncSession = Depends(get_db)):
    from wcarck.api.projects import get_active_project
    active_project = await get_active_project(db)
    
    stmt = select(JobQueue)
    if active_project:
        stmt = stmt.where(JobQueue.project_id == active_project.id)
        
    stmt = stmt.order_by(JobQueue.created_at.desc()).limit(100)
    result = await db.execute(stmt)
    return list(result.scalars().all())

@router.post("/{job_id}/stop")
async def stop_job(job_id: int, db: AsyncSession = Depends(get_db)):
    # In a full app, we would publish a "job.stop_requested" event 
    # to EventBus so the orchestrator kills the active ManagedProcess.
    from wcarck.core.event_bus import bus
    
    # Verify job exists
    stmt = select(JobQueue).where(JobQueue.id == job_id)
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    if job.status not in ("queued", "starting", "running"):
        raise HTTPException(status_code=400, detail=f"Cannot stop job in status {job.status}")
        
    bus.publish("job.stop_requested", {"job_id": job.id})
    return {"status": "stop_requested", "job_id": job.id}
