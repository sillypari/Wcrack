from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel
from wcarck.db.session import get_db
from wcarck.db.models import Credential
from datetime import datetime

router = APIRouter(prefix="/api/credentials", tags=["credentials"])

class CredentialRes(BaseModel):
    id: int
    network_ssid: str
    password: str
    client_mac: Optional[str]
    captured_at: datetime
    validated: bool
    
    class Config:
        from_attributes = True

@router.get("", response_model=List[CredentialRes])
async def list_credentials(db: AsyncSession = Depends(get_db)):
    from wcarck.api.projects import get_active_project
    active_project = await get_active_project(db)
    
    stmt = select(Credential)
    if active_project:
        stmt = stmt.where(Credential.project_id == active_project.id)
        
    stmt = stmt.order_by(Credential.captured_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())
