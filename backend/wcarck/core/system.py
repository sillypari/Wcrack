import asyncio
import os
import time
import structlog
from wcarck.core.event_bus import bus

logger = structlog.get_logger()

class SystemOrchestrator:
    def __init__(self):
        self._sleep_task = None
        self._watch_dbus = False

    async def start(self):
        await self._check_clock_skew()
        await self._mount_tmpfs()
        if os.name == 'posix':
            self._watch_dbus = True
            self._sleep_task = asyncio.create_task(self._dbus_sleep_listener())
            
            # Gap 57: Global teardown signal handler
            import signal
            loop = asyncio.get_running_loop()
            try:
                for sig in (signal.SIGINT, signal.SIGTERM):
                    loop.add_signal_handler(sig, lambda: asyncio.create_task(self._handle_signal()))
            except NotImplementedError:
                # add_signal_handler may not be implemented on some event loops (e.g., Windows ProactorEventLoop)
                pass

    async def _handle_signal(self):
        logger.info("Received termination signal, shutting down system gracefully...")
        bus.publish("system.shutdown", {"hint": "SIGINT/SIGTERM received"})
        await self.stop()

    async def stop(self):
        self._watch_dbus = False
        if self._sleep_task:
            self._sleep_task.cancel()

    async def _check_clock_skew(self):
        current_year = time.localtime().tm_year
        if current_year < 2024:
            logger.warning("System year is < 2024. NTP is likely unsynced. Timestamps may be invalid.")
            bus.publish("system.clock_skew", {"year": current_year, "hint": "Ensure wlan_uplink is connected to the internet."})

    async def _mount_tmpfs(self):
        if os.name != 'posix':
            return
            
        capture_dir = "/tmp/wcarck_captures"
        if not os.path.exists(capture_dir):
            os.makedirs(capture_dir, exist_ok=True)
            
        try:
            # Check if already mounted
            proc = await asyncio.create_subprocess_exec(
                "mountpoint", "-q", capture_dir
            )
            await proc.wait()
            if proc.returncode != 0:
                logger.info("Mounting tmpfs for high I/O captures")
                proc = await asyncio.create_subprocess_exec(
                    "sudo", "mount", "-t", "tmpfs", "-o", "size=512M", "tmpfs", capture_dir
                )
                await proc.wait()
        except FileNotFoundError:
            pass
        except Exception as e:
            logger.error(f"Failed to mount tmpfs: {e}")

    async def _dbus_sleep_listener(self):
        # We simulate DBus sleep listener for the MVP using a mock loop,
        # since actual DBus requires dbus-next which might not be installed.
        # In a real environment, we'd connect to systemd's PrepareForSleep signal.
        while self._watch_dbus:
            try:
                await asyncio.sleep(60)
                # Simulated placeholder for:
                # msg = await bus.wait_for_signal('PrepareForSleep')
                # if msg.body[0]:  # True means suspending
                #     bus.publish("system.sleep", {"hint": "System suspending."})
            except asyncio.CancelledError:
                break
