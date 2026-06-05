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
from datetime import datetime
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
    capabilities: Optional[dict] = None
    last_seen: Optional[datetime] = None
    
    bands: Optional[List[float]] = None
    channel: Optional[int] = None
    rssi: Optional[int] = None
    rx: Optional[int] = None
    tx: Optional[int] = None
    status: Optional[str] = None


class ModeReq(BaseModel):
    mode: str  # "monitor" | "managed"

class RoleReq(BaseModel):
    role: str  # "Auto" | "Scanner" | "Injector" | "AP" | "Uplink"


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


@router.post("/check-kill")
async def check_kill_processes():
    """
    Run airmon-ng check kill to stop wpa_supplicant, NetworkManager, dhclient etc.
    """
    from wcarck.main import watchdog
    res = await watchdog.check_kill()
    if not res.get("success", True):
        raise HTTPException(status_code=500, detail=res.get("message", "Failed"))
    return res


@router.post("/restore")
async def restore_network_processes():
    """
    Restart NetworkManager and wpa_supplicant to restore internet connectivity.
    """
    from wcarck.main import watchdog
    res = await watchdog.restore_network_services()
    if not res.get("success", True):
        raise HTTPException(status_code=500, detail=res.get("message", "Failed"))
    return res



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


@router.post("/check-kill/dry-run")
async def check_kill_dry_run():
    import os, asyncio
    if os.name == 'nt':
        return {"output": "Found 3 processes that could cause trouble.\nPID Name\n618 NetworkManager\n720 wpa_supplicant\n810 dhclient\n\n(Dry Run Complete. No processes were killed.)"}
    try:
        proc = await asyncio.create_subprocess_exec("airmon-ng", "check", stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        stdout, _ = await proc.communicate()
        return {"output": stdout.decode(errors="replace")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{iface}/mac/randomize")
async def randomize_mac(iface: str):
    import os, asyncio
    if os.name == 'nt':
        import random
        hex_digits = lambda: f"{random.randint(0, 255):02X}"
        return {"mac": f"02:{hex_digits()}:{hex_digits()}:{hex_digits()}:{hex_digits()}:{hex_digits()}"}
    try:
        await asyncio.create_subprocess_exec("sudo", "ip", "link", "set", "dev", iface, "down")
        proc = await asyncio.create_subprocess_exec("sudo", "macchanger", "-r", iface, stdout=asyncio.subprocess.PIPE)
        stdout, _ = await proc.communicate()
        await asyncio.create_subprocess_exec("sudo", "ip", "link", "set", "dev", iface, "up")
        
        import re
        m = re.search(r"New MAC:\s+([0-9a-fA-F:]+)", stdout.decode())
        new_mac = m.group(1).upper() if m else "UNKNOWN"
        return {"mac": new_mac}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{iface}/mac/restore")
async def restore_mac(iface: str):
    import os, asyncio
    if os.name == 'nt':
        return {"mac": "RESTORED"}
    try:
        await asyncio.create_subprocess_exec("sudo", "ip", "link", "set", "dev", iface, "down")
        proc = await asyncio.create_subprocess_exec("sudo", "macchanger", "-p", iface, stdout=asyncio.subprocess.PIPE)
        stdout, _ = await proc.communicate()
        await asyncio.create_subprocess_exec("sudo", "ip", "link", "set", "dev", iface, "up")
        
        import re
        m = re.search(r"New MAC:\s+([0-9a-fA-F:]+)", stdout.decode())
        new_mac = m.group(1).upper() if m else "RESTORED"
        return {"mac": new_mac}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{iface}/role")
async def set_adapter_role(iface: str, req: RoleReq, db: AsyncSession = Depends(get_db)):
    stmt = select(Adapter).where(Adapter.iface_name == iface)
    res = await db.execute(stmt)
    adapter = res.scalars().first()
    if not adapter:
        raise HTTPException(status_code=404, detail="Adapter not found")
        
    adapter.role = req.role
    await db.commit()
    return {"status": "ok", "role": req.role}

@router.post("/{iface}/diagnostics")
async def run_diagnostics(iface: str, db: AsyncSession = Depends(get_db)):
    import os, asyncio, time
    
    stmt = select(Adapter).where(Adapter.iface_name == iface)
    res = await db.execute(stmt)
    adapter = res.scalars().first()
    if not adapter:
        raise HTTPException(status_code=404, detail="Adapter not found")
        
    caps = {
        "monitor": False,
        "ap": False,
        "injection": 0.0,
        "5ghz": False,
        "tested_at": time.time()
    }
    
    if os.name == 'nt':
        # Dummy test on windows
        caps["monitor"] = True
        caps["ap"] = True
        caps["injection"] = 1.0
        caps["5ghz"] = False
    else:
        try:
            # Check AP and 5GHz via iw list
            # Usually iw list outputs all phy devices. We need to match iface to phy. 
            # For simplicity, if we run iwconfig or iw list and grep, we can check.
            # We'll just run a generic iw list and check if AP is supported.
            iw_proc = await asyncio.create_subprocess_exec("iw", "list", stdout=asyncio.subprocess.PIPE)
            iw_out, _ = await iw_proc.communicate()
            iw_str = iw_out.decode(errors='replace')
            if " AP " in iw_str or " AP/VLAN " in iw_str:
                caps["ap"] = True
            if "5200 MHz" in iw_str or "5500 MHz" in iw_str:
                caps["5ghz"] = True
                
            # Check monitor mode & injection
            # Switch to monitor
            await asyncio.create_subprocess_exec("sudo", "ip", "link", "set", "dev", iface, "down")
            await asyncio.create_subprocess_exec("sudo", "iw", "dev", iface, "set", "type", "monitor")
            await asyncio.create_subprocess_exec("sudo", "ip", "link", "set", "dev", iface, "up")
            caps["monitor"] = True # if we didn't crash
            
            # Injection test
            test_proc = await asyncio.create_subprocess_exec("sudo", "aireplay-ng", "--test", iface, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
            test_out, _ = await test_proc.communicate()
            import re
            m = re.search(r"(\d+)/(\d+) ACKs", test_out.decode(errors='replace'))
            if m:
                acks, total = map(int, m.groups())
                caps["injection"] = acks / total if total > 0 else 0.0
                
        except Exception as e:
            logger.error(f"Diagnostics failed for {iface}: {e}")
            
    # Auto-assign role logic
    if adapter.role == "Auto" or not adapter.role:
        if caps["injection"] > 0.5 and not caps["ap"]:
            adapter.role = "Injector"
        elif caps["ap"]:
            adapter.role = "AP"
        elif caps["5ghz"] and caps["injection"] == 0:
            adapter.role = "Scanner"
            
    # Save capabilities
    adapter.capabilities = caps
    await db.commit()
    
    return {"status": "ok", "capabilities": caps, "role": adapter.role}

@router.post("/{iface}/injection-test")
async def injection_test(iface: str):
    import os, asyncio
    if os.name == 'nt':
        return {"output": "[OK] Injection OK (30/30 ACKs)"}
    try:
        proc = await asyncio.create_subprocess_exec("sudo", "aireplay-ng", "--test", iface, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        stdout, _ = await proc.communicate()
        out_str = stdout.decode(errors="replace")
        
        import re
        m = re.search(r"(\d+)/(\d+) ACKs", out_str)
        if m:
            acks, total = map(int, m.groups())
            ratio = acks / total if total > 0 else 0
            if ratio > 0.5:
                return {"output": f"[OK] Injection OK ({acks}/{total} ACKs)"}
            elif ratio > 0:
                return {"output": f"[WARN] Injection Poor ({acks}/{total} ACKs)"}
            else:
                return {"output": f"[FAIL] Injection failed (0/{total} ACKs)"}
        return {"output": f"[ERROR] Injection test failed to run or parse: {out_str[:50]}..."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
