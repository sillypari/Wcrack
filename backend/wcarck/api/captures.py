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
        
    # Generate clean capture path
    base_dir = os.path.dirname(src_path)
    base_name = os.path.basename(src_path)
    clean_name = f"clean_{base_name}"
    clean_path = os.path.join(base_dir, clean_name)
    
    # Run wpaclean: wpaclean <out.cap> <in.cap>
    cmd = ["wpaclean", clean_path, src_path]
    if os.name == 'nt':
        # Mock for development host - just copy file
        import shutil
        shutil.copyfile(src_path, clean_path)
    else:
        # Linux execution
        proc = await asyncio.create_subprocess_exec(
            "sudo", "-n", *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()
        
    if not os.path.exists(clean_path):
        raise HTTPException(status_code=500, detail="wpaclean failed to create clean file")
        
    # Calculate new hash and size
    sha256_hash = hashlib.sha256()
    with open(clean_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    new_sha256 = sha256_hash.hexdigest()
    new_size = os.path.getsize(clean_path)
    
    # Overwrite original capture metadata/file or update database to point to clean file
    # To keep it safe and avoid path mismatches in cracking tools, let's rename the clean file to replace the original
    try:
        os.replace(clean_path, src_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to replace original capture: {e}")
        
    # Update db record
    cap.sha256 = new_sha256
    cap.size_bytes = new_size
    await db.commit()
    
    return {
        "status": "success",
        "message": "PCAP cleaned successfully",
        "sha256": new_sha256,
        "size_bytes": new_size,
        "original_size": cap.size_bytes or 0,
        "reduction_bytes": (cap.size_bytes or 0) - new_size,
        "reduction_pct": round(((cap.size_bytes or 0) - new_size) / (cap.size_bytes or 1) * 100, 1)
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
