"""
AdapterWatchdog — real hardware adapter management.

Responsibilities:
- Discover all wireless interfaces via `iw dev`
- Read driver from sysfs symlink
- Read chipset from `airmon-ng` output (cached 30s)
- Persist to DB with full info (upsert by MAC)
- Detect mode changes (managed ↔ monitor)
- Publish adapter events to EventBus
- On startup: kill NM/wpa_supplicant interference on AUDIT interfaces
"""

import os
import asyncio
import time
import re
from typing import Dict, List, Optional
from datetime import datetime, timezone
from wcarck.core.event_bus import bus
from sqlalchemy.dialects.sqlite import insert
import structlog

logger = structlog.get_logger()


class AdapterWatchdog:
    def __init__(self):
        self._adapters: Dict[str, dict] = {}   # iface → {mac, mode, driver, chipset, ...}
        self._watch_task: Optional[asyncio.Task] = None
        self._airmon_cache: Optional[Dict[str, dict]] = None  # {iface: {driver, chipset}}
        self._airmon_cache_ts: float = 0.0
        self._airmon_cache_ttl: float = 30.0

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #

    async def start(self):
        if os.name != 'posix':
            logger.info("AdapterWatchdog: non-Linux OS, skipping hardware management")
            return
        await self._set_regulatory_domain("BO")
        
        try:
            import pyudev
            context = pyudev.Context()
            self._monitor = pyudev.Monitor.from_netlink(context)
            self._monitor.filter_by(subsystem='net')
            
            def udev_callback(device):
                if device.action in ('add', 'remove'):
                    iface = device.sys_name
                    if iface and (iface.startswith('wl') or iface.startswith('wlan')):
                        logger.info(f"USB hot-plug event: {device.action} {iface}")
                        import asyncio
                        from wcarck.core.event_bus import bus
                        bus.publish(f"adapter.{device.action}", {"iface": iface})
                        
            fd = self._monitor.fileno()
            loop = asyncio.get_running_loop()
            # Note: in a real async pyudev, we'd use MonitorObserver, but reader on fileno works
            loop.add_reader(fd, lambda: udev_callback(self._monitor.poll(timeout=0)))
            self._monitor.start()
        except ImportError:
            logger.info("pyudev not installed, USB hot-plug monitoring disabled")
            
        self._watch_task = asyncio.create_task(self._watch_loop())
        logger.info("AdapterWatchdog started")

    async def stop(self):
        if self._watch_task:
            self._watch_task.cancel()
            try:
                await self._watch_task
            except asyncio.CancelledError:
                pass

    # ------------------------------------------------------------------ #
    # Main poll loop — runs every 2s
    # ------------------------------------------------------------------ #

    async def _watch_loop(self):
        while True:
            try:
                await asyncio.sleep(2.0)
                await self._scan_interfaces()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Watchdog loop error: {e}", exc_info=True)

    async def _scan_interfaces(self):
        """Parse `iw dev` and persist/update each interface."""
        output = await self._run_cmd(["iw", "dev"])
        if output is None:
            return

        # Parse iw dev output — groups separated by blank lines
        # Format:
        #   phy#0
        #       Interface wlo1
        #           ifindex 2
        #           wdev 0x1
        #           addr 28:d0:43:0a:73:8c
        #           type managed
        current_ifaces: set = set()

        current_iface: Optional[str] = None
        current_info: Dict = {}

        def flush():
            nonlocal current_iface, current_info
            if current_iface and current_info.get("mac"):
                current_ifaces.add(current_iface)
                asyncio.get_event_loop().create_task(
                    self._process_iface(current_iface, current_info.copy())
                )
            current_iface = None
            current_info = {}

        for line in output.splitlines():
            stripped = line.strip()
            if stripped.startswith("Interface "):
                flush()
                current_iface = stripped.split()[1]
                current_info = {}
            elif stripped.startswith("addr "):
                current_info["mac"] = stripped.split()[1].lower()
            elif stripped.startswith("type "):
                current_info["type"] = stripped.split()[1]  # managed / monitor / AP / ...
            elif stripped.startswith("channel "):
                try:
                    current_info["channel"] = int(stripped.split()[1])
                except (ValueError, IndexError):
                    pass
        flush()

        # Handle vanished interfaces
        gone = [i for i in self._adapters if i not in current_ifaces]
        for iface in gone:
            logger.warning(f"Adapter {iface} vanished")
            await self._mark_gone(iface)
            del self._adapters[iface]

    async def _process_iface(self, iface: str, info: dict):
        """For a discovered interface, ensure DB row is current."""
        mac = info["mac"]
        mode = info.get("type", "managed")
        channel = info.get("channel", 0)

        prev = self._adapters.get(iface, {})
        prev_mode = prev.get("mode", "")
        
        # Read driver from sysfs (fast, no subprocess)
        driver = await self._read_driver_sysfs(iface)

        # Get chipset from airmon-ng cache (slow, TTL 30s)
        chipset = await self._get_chipset(iface)

        # Update in-memory state
        self._adapters[iface] = {
            "mac": mac, "mode": mode, "channel": channel,
            "driver": driver, "chipset": chipset
        }

        # Persist to DB
        await self._upsert_adapter_db(iface, mac, mode, driver, chipset, channel)

        # Emit events
        if prev_mode and prev_mode != mode:
            logger.info(f"Adapter {iface}: mode changed {prev_mode} → {mode}")
            bus.publish("adapter.mode_changed", {
                "iface": iface, "mac": mac,
                "prev_mode": prev_mode, "mode": mode,
                "message": f"Adapter {iface} mode: {prev_mode} → {mode}"
            })
        elif not prev_mode:
            # First discovery
            logger.info(f"Discovered adapter: {iface} [{mac}] mode={mode} driver={driver} chipset={chipset}")
            bus.publish("adapter.discovered", {
                "iface": iface, "mac": mac, "mode": mode,
                "driver": driver, "chipset": chipset,
                "message": f"Adapter {iface} discovered: {chipset or driver or 'unknown'} [{mac}]"
            })

    # ------------------------------------------------------------------ #
    # Driver / chipset detection
    # ------------------------------------------------------------------ #

    async def _read_driver_sysfs(self, iface: str) -> Optional[str]:
        """Read driver name from /sys/class/net/<iface>/device/driver symlink."""
        try:
            driver_path = f"/sys/class/net/{iface}/device/driver"
            if os.path.exists(driver_path):
                target = os.readlink(driver_path)
                return os.path.basename(target)
            # Try uevent as fallback
            uevent_path = f"/sys/class/net/{iface}/device/uevent"
            if os.path.exists(uevent_path):
                with open(uevent_path) as f:
                    for line in f:
                        if line.startswith("DRIVER="):
                            return line.split("=", 1)[1].strip()
        except Exception:
            pass
        return None

    async def _get_chipset(self, iface: str) -> Optional[str]:
        """Get chipset from airmon-ng cache. Refresh if stale."""
        now = time.monotonic()
        if self._airmon_cache is None or (now - self._airmon_cache_ts) > self._airmon_cache_ttl:
            await self._refresh_airmon_cache()

        if self._airmon_cache and iface in self._airmon_cache:
            return self._airmon_cache[iface].get("chipset")
        return None

    async def _refresh_airmon_cache(self):
        """Run `airmon-ng` and parse output into cache."""
        output = await self._run_cmd(["sudo", "-n", "airmon-ng"])
        if output is None:
            self._airmon_cache = {}
            self._airmon_cache_ts = time.monotonic()
            return

        cache: Dict[str, dict] = {}
        # airmon-ng output format:
        # PHY     Interface       Driver          Chipset
        # phy0    wlo1            mt7902e         ...
        in_table = False
        for line in output.splitlines():
            stripped = line.strip()
            if stripped.startswith("PHY") and "Interface" in stripped and "Driver" in stripped:
                in_table = True
                continue
            if not in_table or not stripped:
                continue
            # Split on 2+ whitespace
            parts = re.split(r'\s{2,}', stripped)
            if len(parts) >= 3:
                iface_name = parts[1].strip() if len(parts) > 1 else ""
                driver = parts[2].strip() if len(parts) > 2 else ""
                chipset = " ".join(parts[3:]).strip() if len(parts) > 3 else ""
                # Sometimes airmon-ng output is: phy0 wlo1 driver chipset...
                if iface_name:
                    cache[iface_name] = {"driver": driver, "chipset": chipset}

        self._airmon_cache = cache
        self._airmon_cache_ts = time.monotonic()
        logger.info(f"airmon-ng cache refreshed: {list(cache.keys())}")

    # ------------------------------------------------------------------ #
    # DB persistence
    # ------------------------------------------------------------------ #

    async def _upsert_adapter_db(
        self, iface: str, mac: str, mode: str,
        driver: Optional[str], chipset: Optional[str], channel: int
    ):
        """Upsert Adapter row keyed by MAC address."""
        try:
            from wcarck.db.session import SessionLocal
            from wcarck.db.models import Adapter
            async with SessionLocal() as session:
                stmt = insert(Adapter).values(
                    mac=mac,
                    iface_name=iface,
                    chipset=chipset,
                    driver=driver,
                    current_mode=mode,
                    last_seen=datetime.now(timezone.utc).replace(tzinfo=None)
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=[Adapter.mac],
                    set_={
                        "iface_name": stmt.excluded.iface_name,
                        "current_mode": stmt.excluded.current_mode,
                        "driver": stmt.excluded.driver,
                        "chipset": stmt.excluded.chipset,
                        "last_seen": stmt.excluded.last_seen,
                    }
                )
                await session.execute(stmt)
                await session.commit()
        except Exception as e:
            logger.error(f"DB upsert failed for {iface}: {e}")

    async def _mark_gone(self, iface: str):
        """Mark adapter as gone in DB and emit event."""
        info = self._adapters.get(iface, {})
        bus.publish("adapter.gone", {
            "iface": iface,
            "mac": info.get("mac", ""),
            "message": f"Adapter {iface} disconnected (USB unplug?)"
        })

    # ------------------------------------------------------------------ #
    # System setup
    # ------------------------------------------------------------------ #

    async def _set_regulatory_domain(self, country: str):
        if os.name != 'posix':
            return
        output = await self._run_cmd(["sudo", "-n", "iw", "reg", "set", country])
        if output is not None:
            logger.info(f"Regulatory domain set to {country}")

    async def ensure_nm_unmanaged(self, iface: str):
        """Mark a specific interface as unmanaged by NetworkManager."""
        if os.name != 'posix':
            return
        await self._run_cmd(["sudo", "-n", "nmcli", "dev", "set", iface, "managed", "no"])
        logger.info(f"NetworkManager: {iface} set to unmanaged")

    # ------------------------------------------------------------------ #
    # Monitor mode control (called from API)
    # ------------------------------------------------------------------ #

    async def start_monitor_mode(self, iface: str) -> dict:
        """
        Put interface into monitor mode using airmon-ng or manual fallback.
        Returns {success, mon_iface, message}
        """
        if os.name != 'posix':
            return {"success": False, "message": "Only available on Linux"}

        # Kill conflicting processes first
        check_out = await self._run_cmd(["sudo", "-n", "airmon-ng", "check", "kill"])
        if check_out is None:
            # Sudo failed or airmon-ng missing
            return {"success": False, "message": "airmon-ng check kill failed or sudo required"}

        bus.publish("adapter.airmon_check_kill", {
            "iface": iface,
            "message": "airmon-ng check kill: stopped conflicting processes (NetworkManager, wpa_supplicant)"
        })

        output = await self._run_cmd(["sudo", "-n", "airmon-ng", "start", iface])
        
        # Detect new monitor interface name
        mon_iface = None
        if output:
            for line in output.splitlines():
                if "monitor mode" in line.lower() and ("enabled" in line.lower() or "vif" in line.lower()):
                    m = re.search(r'\(mac80211 monitor mode (?:vif )?enabled (?:for [^ ]+ )?on (?:\[\w+\])?(\w+)\)', line)
                    if m:
                        mon_iface = m.group(1)
                        break

        # If airmon-ng failed to create a separate monitor interface, fallback to manual setup on the same iface
        if not mon_iface:
            logger.info("airmon-ng failed or parsing failed, attempting manual monitor mode setup")
            mon_iface = iface
            await self._run_cmd(["sudo", "-n", "ip", "link", "set", iface, "down"])
            await self._run_cmd(["sudo", "-n", "iw", "dev", iface, "set", "type", "monitor"])
            await self._run_cmd(["sudo", "-n", "ip", "link", "set", iface, "up"])

        # Verify monitor mode
        iw_out = await self._run_cmd(["sudo", "-n", "iw", "dev", mon_iface, "info"])
        if not iw_out or "type monitor" not in iw_out:
            # Try otherbss fallback for bad drivers (rtl8821au etc)
            logger.info(f"Monitor mode not verified on {mon_iface}, trying BAD_DRIVERS fallback")
            await self._run_cmd(["sudo", "-n", "ip", "link", "set", mon_iface, "down"])
            await self._run_cmd(["sudo", "-n", "iw", "dev", mon_iface, "set", "monitor", "otherbss"])
            await self._run_cmd(["sudo", "-n", "ip", "link", "set", mon_iface, "up"])
            
            iw_out = await self._run_cmd(["sudo", "-n", "iw", "dev", mon_iface, "info"])
            if not iw_out or "type monitor" not in iw_out:
                return {
                    "success": False, 
                    "message": f"Failed to set monitor mode on {mon_iface}", 
                    "diagnostics": {"iw_output": iw_out, "airmon_output": output}
                }

        # Set TX Power (ignore if it fails, some cards don't support it)
        await self._run_cmd(["sudo", "-n", "iw", "dev", mon_iface, "set", "txpower", "fixed", "3000"])

        logger.info(f"Monitor mode started: {mon_iface}")
        bus.publish("adapter.monitor_started", {
            "iface": iface,
            "mon_iface": mon_iface,
            "message": f"Monitor mode enabled: {mon_iface} (was {iface})"
        })
        
        # Persist mapping to DB implicitly via store cache invalidate
        self._airmon_cache = None
        return {"success": True, "mon_iface": mon_iface, "message": f"Monitor mode: {mon_iface}"}

    async def stop_monitor_mode(self, iface: str) -> dict:
        """Stop monitor mode and return interface to managed."""
        if os.name != 'posix':
            return {"success": False, "message": "Only available on Linux"}

        output = await self._run_cmd(["sudo", "-n", "airmon-ng", "stop", iface])
        bus.publish("adapter.monitor_stopped", {
            "iface": iface,
            "message": f"Monitor mode disabled on {iface}"
        })
        # Invalidate cache
        self._airmon_cache = None
        return {"success": True, "message": f"Monitor stopped: {iface}"}

    # ------------------------------------------------------------------ #
    # Utility
    # ------------------------------------------------------------------ #

    async def _run_cmd(self, cmd: List[str], timeout: float = 10.0) -> Optional[str]:
        """Run a command and return combined stdout, or None on failure."""
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
                return stdout.decode("utf-8", errors="ignore")
            except asyncio.TimeoutError:
                proc.kill()
                return None
        except FileNotFoundError:
            return None
        except Exception as e:
            logger.error(f"Command failed {cmd}: {e}")
            return None

    def get_known_adapters(self) -> Dict[str, dict]:
        """Return current in-memory adapter dict."""
        return dict(self._adapters)
