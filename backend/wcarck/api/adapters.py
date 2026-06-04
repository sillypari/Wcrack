"""
Adapters API — real adapter management.

GET /api/adapters           — list all real adapters from DB
POST /api/adapters/refresh  — trigger watchdog re-scan
POST /api/adapters/{iface}/mode   — put interface into monitor or managed mode
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from wcarck.db.session import get_db
from wcarck.db.models import Adapter
from wcarck.core.event_bus import bus
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/api/adapters", tags=["adapters"])


class AdapterRes(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mac: str
    iface_name: str
    chipset: Optional[str] = None
    driver: Optional[str] = None
    current_mode: Optional[str] = None
    role: Optional[str] = None
    last_seen: Optional[str] = None


class ModeReq(BaseModel):
    mode: str  # "monitor" | "managed"


@router.get("", response_model=List[AdapterRes])
async def list_adapters(db: AsyncSession = Depends(get_db)):
    """Return all adapters currently known to the watchdog."""
    stmt = select(Adapter).order_by(Adapter.id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/refresh")
async def refresh_adapters():
    """
    Force the watchdog to re-scan hardware immediately.
    Useful after plugging/unplugging a USB adapter.
    """
    from wcarck.main import watchdog
    # Invalidate airmon-ng cache so next poll re-reads chipset
    watchdog._airmon_cache = None
    watchdog._airmon_cache_ts = 0.0
    bus.publish("adapter.refresh_requested", {
        "message": "Adapter inventory refresh triggered"
    })
    return {"status": "refresh_triggered"}


@router.post("/{iface}/mode")
async def set_adapter_mode(iface: str, req: ModeReq):
    """
    Put an adapter into monitor or managed mode.
    Uses airmon-ng start/stop under the hood.
    """
    from wcarck.main import watchdog

    if req.mode not in ("monitor", "managed", "managed_restore"):
        raise HTTPException(status_code=400, detail="mode must be 'monitor' or 'managed'")

    if req.mode == "monitor":
        result = await watchdog.start_monitor_mode(iface)
    else:
        result = await watchdog.stop_monitor_mode(iface)

    if not result.get("success", True):
        raise HTTPException(status_code=500, detail=result.get("message", "Failed"))

    return result
