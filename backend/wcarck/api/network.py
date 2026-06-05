from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
from wcarck.db.session import get_db
from wcarck.db.models import Network, Client

router = APIRouter(prefix="/api/networks", tags=["networks"])

class ApRes(BaseModel):
    bssid: str
    ssid: Optional[str] = ""
    channel: Optional[int] = 0
    encryption: Optional[str] = ""
    cipher: Optional[str] = ""
    auth: Optional[str] = ""
    signal_dbm: Optional[int] = Field(default=None, validation_alias="max_rssi")
    beacons: Optional[int] = 0
    data: Optional[int] = 0
    wps: Optional[bool] = False
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    
    model_config = {"from_attributes": True}

class ClientRes(BaseModel):
    mac: str
    bssid: Optional[str] = Field(default=None, validation_alias="associated_bssid")
    signal_dbm: Optional[int] = Field(default=None, validation_alias="max_rssi")
    packets: Optional[int] = 0
    lost: Optional[int] = 0
    rate: Optional[str] = ""
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    probed_ssids: Optional[list] = []
    
    model_config = {"from_attributes": True}

@router.get("/aps", response_model=List[ApRes])
async def list_aps(db: AsyncSession = Depends(get_db)):
    from wcarck.api.projects import get_active_project
    from wcarck.db.models import Scope
    from sqlalchemy import or_
    
    active_project = await get_active_project(db)
    stmt = select(Network)
    
    if active_project:
        scope_stmt = select(Scope).where(Scope.project_id == active_project.id, Scope.active == True)
        scope_res = await db.execute(scope_stmt)
        scope = scope_res.scalar_one_or_none()
        if scope and (scope.allowed_bssids or scope.allowed_ssids):
            conditions = []
            if scope.allowed_bssids:
                conditions.append(Network.bssid.in_(scope.allowed_bssids))
            if scope.allowed_ssids:
                conditions.append(Network.ssid.in_(scope.allowed_ssids))
            if conditions:
                stmt = stmt.where(or_(*conditions))
                
    stmt = stmt.order_by(Network.last_seen.desc()).limit(200)
    result = await db.execute(stmt)
    return list(result.scalars().all())

@router.get("/clients", response_model=List[ClientRes])
async def list_clients(db: AsyncSession = Depends(get_db)):
    from wcarck.api.projects import get_active_project
    from wcarck.db.models import Scope
    
    active_project = await get_active_project(db)
    stmt = select(Client)
    
    if active_project:
        scope_stmt = select(Scope).where(Scope.project_id == active_project.id, Scope.active == True)
        scope_res = await db.execute(scope_stmt)
        scope = scope_res.scalar_one_or_none()
        if scope and (scope.allowed_bssids or scope.allowed_ssids):
            # Fetch BSSIDs of in-scope networks
            bssid_set = set(scope.allowed_bssids or [])
            if scope.allowed_ssids:
                from wcarck.db.models import Network
                net_stmt = select(Network.bssid).where(Network.ssid.in_(scope.allowed_ssids))
                net_res = await db.execute(net_stmt)
                for bssid in net_res.scalars().all():
                    bssid_set.add(bssid)
            if bssid_set:
                stmt = stmt.where(Client.associated_bssid.in_(list(bssid_set)))
                
    stmt = stmt.order_by(Client.last_seen.desc()).limit(500)
    result = await db.execute(stmt)
    return list(result.scalars().all())
