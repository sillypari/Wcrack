import os
import hashlib
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import List, Optional
from pydantic import BaseModel
from wcarck.db.session import get_db
from wcarck.db.models import Capture, Client
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
    sha256: Optional[str] = None
    eapolM1: bool = False
    eapolM2: bool = False
    eapolM3: bool = False
    eapolM4: bool = False
    created_at: datetime
    
    class Config:
        from_attributes = True

class ClientRes(BaseModel):
    mac: str
    vendor: Optional[str]
    associated_bssid: Optional[str]
    first_seen: datetime
    last_seen: datetime
    max_rssi: Optional[int]
    packets: Optional[int]

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

@router.get("/{capture_id}/download")
async def download_capture(capture_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Capture).where(Capture.id == int(capture_id) if capture_id.isdigit() else Capture.id == capture_id)
    result = await db.execute(stmt)
    cap = result.scalar_one_or_none()
    
    if not cap:
        raise HTTPException(status_code=404, detail="Capture not found")
        
    if not os.path.exists(cap.path):
        raise HTTPException(status_code=404, detail=f"Capture file not found: {cap.path}")
        
    filename = os.path.basename(cap.path)
    return FileResponse(
        path=cap.path, 
        filename=filename,
        media_type="application/octet-stream"
    )

@router.post("/{capture_id}/clean")
async def clean_capture(capture_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Capture).where(Capture.id == int(capture_id) if capture_id.isdigit() else Capture.id == capture_id)
    result = await db.execute(stmt)
    cap = result.scalar_one_or_none()
    
    if not cap:
        raise HTTPException(status_code=404, detail="Capture not found")
        
    src_path = cap.path
    if not os.path.exists(src_path):
        raise HTTPException(status_code=404, detail=f"Capture file not found: {src_path}")
        
    original_size = cap.size_bytes or os.path.getsize(src_path)
    
    from wcarck.utils.pcap import strip_with_wpaclean
    success, orig_sz, new_sz = await strip_with_wpaclean(src_path)
    
    if not success:
        raise HTTPException(status_code=500, detail="wpaclean failed to create clean file")
    
    new_sha256 = hashlib.sha256()
    with open(src_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            new_sha256.update(byte_block)
    
    cap.sha256 = new_sha256.hexdigest()
    cap.size_bytes = new_sz
    await db.commit()
    
    return {
        "status": "success",
        "message": "PCAP cleaned successfully",
        "sha256": cap.sha256,
        "size_bytes": new_sz,
        "original_size": original_size,
        "reduction_bytes": original_size - new_sz,
        "reduction_pct": round((original_size - new_sz) / (original_size or 1) * 100, 1)
    }

@router.get("/{capture_id}/stations", response_model=List[ClientRes])
async def list_capture_stations(capture_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Capture).where(Capture.id == int(capture_id) if capture_id.isdigit() else Capture.id == capture_id)
    result = await db.execute(stmt)
    cap = result.scalar_one_or_none()
    
    if not cap:
        raise HTTPException(status_code=404, detail="Capture not found")
        
    if not cap.bssid:
        return []
        
    # Query Client table for station MACs linked to this BSSID
    client_stmt = select(Client).where(Client.associated_bssid == cap.bssid)
    client_res = await db.execute(client_stmt)
    return list(client_res.scalars().all())
