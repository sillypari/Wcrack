from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel
from wcarck.db.session import get_db
from wcarck.db.models import Capture
from datetime import datetime

router = APIRouter(prefix="/api/captures", tags=["captures"])

class CaptureRes(BaseModel):
    id: int
    type: str
    path: str
    bssid: Optional[str]
    ssid: Optional[str]
    status: str
    size_bytes: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True

@router.get("", response_model=List[CaptureRes])
async def list_captures(db: AsyncSession = Depends(get_db)):
    from wcarck.api.projects import get_active_project
    active_project = await get_active_project(db)
    
    stmt = select(Capture)
    if active_project:
        stmt = stmt.where(Capture.project_id == active_project.id)
        
    stmt = stmt.order_by(Capture.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())
