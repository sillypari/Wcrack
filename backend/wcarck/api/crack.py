from fastapi import APIRouter, Depends, HTTPException
from typing import List
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..db.session import get_db
from ..db.models import CrackJob
from ..orchestration.worker import _job_queue

router = APIRouter(prefix="/api/crack", tags=["crack"])

class CrackJobCreate(BaseModel):
    name: str
    capture_id: int
    wordlist_path: str
    hash_mode: int = 22000

@router.post("/jobs")
async def create_crack_job(job: CrackJobCreate, db: AsyncSession = Depends(get_db)):
    # Create DB entry
    db_job = CrackJob(
        name=job.name,
        source_capture_id=job.capture_id,
        wordlist_path=job.wordlist_path,
        hash_mode=job.hash_mode,
        attack_mode=0, # Dictionary
        backend="hashcat",
        status="queued"
    )
    db.add(db_job)
    await db.commit()
    await db.refresh(db_job)
    
    # Enqueue to internal JobQueue
    await _job_queue.put({
        "module_name": "crack.hashcat",
        "handler_name": "crack.hashcat.start",
        "params": {
            "capture_id": job.capture_id,
            "wordlist_path": job.wordlist_path,
            "hash_mode": job.hash_mode
        }
    })
    
    return {"id": db_job.id, "status": "queued"}

@router.get("/jobs")
async def list_crack_jobs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CrackJob))
    jobs = result.scalars().all()
    return [{"id": j.id, "name": j.name, "status": j.status, "progress": j.progress_percent} for j in jobs]
