from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel
from wcarck.db.session import get_db
from wcarck.db.models import Adapter

router = APIRouter(prefix="/api/adapters", tags=["adapters"])

class AdapterRes(BaseModel):
    id: int
    mac: str
    iface_name: str
    chipset: Optional[str]
    driver: Optional[str]
    current_mode: Optional[str]
    role: Optional[str]
    
    class Config:
        from_attributes = True

@router.get("", response_model=List[AdapterRes])
async def list_adapters(db: AsyncSession = Depends(get_db)):
    stmt = select(Adapter).order_by(Adapter.id)
    result = await db.execute(stmt)
    return list(result.scalars().all())
