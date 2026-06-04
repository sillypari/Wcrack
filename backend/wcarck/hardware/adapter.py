import os
import asyncio
import time
from typing import List, Dict
from wcarck.core.event_bus import bus
import structlog

logger = structlog.get_logger()

class AdapterWatchdog:
    """
    Manages physical WiFi interfaces.
    Responsible for unlocking regulatory domains (CRDA), ensuring NetworkManager
    does not interfere, and tracking stable USB paths to combat MAC randomization.
    """
    def __init__(self):
        self._adapters: Dict[str, dict] = {}
        self._watch_task: asyncio.Task | None = None
        self._flap_history: Dict[str, List[float]] = {}

    async def start(self):
        await self._ensure_nm_unmanaged()
        await self._set_regulatory_domain("BO")
        self._watch_task = asyncio.create_task(self._watch_loop())

    async def stop(self):
        if self._watch_task:
            self._watch_task.cancel()
            try:
                await self._watch_task
            except asyncio.CancelledError:
                pass

    async def _ensure_nm_unmanaged(self):
        # We use sudo nmcli to dynamically set unmanaged state for wlan_mon and wlan_ap
        if os.name != 'posix':
            return
        try:
            for iface in ["wlan_mon", "wlan_ap"]:
                proc = await asyncio.create_subprocess_exec(
                    "sudo", "nmcli", "dev", "set", iface, "managed", "no",
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                await proc.wait()
            logger.info("NetworkManager configured to ignore attack interfaces via nmcli")
        except Exception as e:
            logger.error(f"Failed to configure NetworkManager: {e}")

    async def _set_regulatory_domain(self, country: str):
        if os.name != 'posix':
            return
        try:
            proc = await asyncio.create_subprocess_exec("sudo", "iw", "reg", "set", country)
            await proc.wait()
            if proc.returncode == 0:
                logger.info(f"Regulatory domain unlocked: {country}")
                # Try setting txpower on known interfaces if they exist
                for iface in ["wlan_mon", "wlan_ap"]:
                    p = await asyncio.create_subprocess_exec("sudo", "iw", "dev", iface, "set", "txpower", "fixed", "3000")
                    await p.wait()
        except FileNotFoundError:
            logger.warning("iw command not found, skipping regulatory domain unlock")

    async def get_usb_path(self, iface: str) -> str | None:
        path = f"/sys/class/net/{iface}/device"
        try:
            if os.path.exists(path):
                return os.path.realpath(path)
        except Exception:
            pass
        return None

    async def _watch_loop(self):
        while True:
            try:
                await asyncio.sleep(2.0)
                if os.name != 'posix':
                    continue
                
                try:
                    proc = await asyncio.create_subprocess_exec(
                        "iw", "dev",
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    stdout, _ = await proc.communicate()
                    output = stdout.decode('utf-8', errors='ignore')
                    
                    current_ifaces = set()
                    for line in output.split('\n'):
                        line = line.strip()
                        if line.startswith('Interface '):
                            iface = line.split(' ')[1]
                            current_ifaces.add(iface)
                            
                            usb_path = await self.get_usb_path(iface)
                            if iface not in self._adapters:
                                self._adapters[iface] = {'seen': True, 'usb_path': usb_path}
                                logger.info(f"Discovered interface {iface} at {usb_path}")
                                
                                # Flap detection
                                now = time.monotonic()
                                hist = self._flap_history.setdefault(iface, [])
                                hist.append(now)
                                # Keep last 3 events
                                hist = [t for t in hist if now - t < 10.0]
                                self._flap_history[iface] = hist
                                
                                if len(hist) >= 3:
                                    logger.error(f"Adapter {iface} is flapping! Possible VM USB issue or power brownout.")
                                    bus.publish("adapter.flaky_usb", {
                                        "iface": iface, 
                                        "hint": "Adapter is resetting frequently. If you are using a Virtual Machine, switch the USB controller from USB 2.0 to USB 3.1 (xHCI). Also check for USB power brownouts."
                                    })
                                
                    gone_ifaces = [i for i in self._adapters if i not in current_ifaces]
                    for iface in gone_ifaces:
                        now = time.monotonic()
                        hist = self._flap_history.setdefault(iface, [])
                        hist.append(now)
                        
                        logger.warning(f"Adapter {iface} vanished (USB unplug?). Attempting recovery.")
                        
                        # Attempt Driver Recovery (Edge Case 1.2)
                        recovered = await self._attempt_driver_recovery(iface)
                        if recovered:
                            logger.info(f"Successfully recovered {iface} driver")
                        else:
                            bus.publish("adapter.gone", {"iface": iface, "reason": "unplugged"})
                            del self._adapters[iface]
                        
                except FileNotFoundError:
                    pass
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Watchdog error: {e}")

    async def _attempt_driver_recovery(self, iface: str) -> bool:
        if os.name != 'posix':
            return False
            
        driver = "88XXau" if "ap" in iface else "rt2800usb" # Dummy mapping for MVP
        try:
            logger.info(f"Unloading driver {driver}")
            proc = await asyncio.create_subprocess_exec("sudo", "modprobe", "-r", driver)
            await asyncio.wait_for(proc.wait(), timeout=10.0)
            
            await asyncio.sleep(1.0)
            
            logger.info(f"Reloading driver {driver}")
            proc = await asyncio.create_subprocess_exec("sudo", "modprobe", driver)
            await asyncio.wait_for(proc.wait(), timeout=10.0)
            
            for _ in range(20):
                await asyncio.sleep(0.2)
                p = await asyncio.create_subprocess_exec("ip", "link", "show", iface, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
                await p.wait()
                if p.returncode == 0:
                    return True
        except Exception as e:
            logger.error(f"Driver recovery failed: {e}")
        return False
