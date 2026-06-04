import asyncio
import time
import shutil
import os
from typing import Dict, Any
from datetime import datetime, timezone
from sqlalchemy.dialects.sqlite import insert
from wcarck.core.event_bus import bus
from wcarck.db.session import SessionLocal
from wcarck.db.models import Network, Client
import structlog

logger = structlog.get_logger()

class DBEventListener:
    """
    Subscribes to high-frequency events (like scan updates) and buffers them
    in memory. Flushes to SQLite periodically to prevent write lock starvation.
    """
    def __init__(self):
        self._network_buffer: Dict[str, dict] = {}
        self._client_buffer: Dict[str, dict] = {}
        self._flush_interval = 2.0
        self._task: asyncio.Task | None = None
        self._listen_task: asyncio.Task | None = None
        self._running = False

    def start(self):
        self._running = True
        self._task = asyncio.create_task(self._flush_loop())
        self._listen_task = asyncio.create_task(self._listen_to_bus())

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._listen_task:
            self._listen_task.cancel()
            try:
                await self._listen_task
            except asyncio.CancelledError:
                pass
        # Final flush
        await self._flush_buffers()

    async def _listen_to_bus(self):
        try:
            async for event in bus.subscribe(max_queue_size=2000):
                topic = event.get("topic")
                if topic == "network.discovered" or topic == "network.updated":
                    await self._on_network(event)
                elif topic == "client.discovered" or topic == "client.updated":
                    await self._on_client(event)
        except asyncio.CancelledError:
            pass

    async def _on_network(self, event: Any):
        bssid = event.payload.get("bssid")
        if bssid:
            self._network_buffer[bssid] = event.payload

    async def _on_client(self, event: Any):
        mac = event.payload.get("mac")
        if mac:
            self._client_buffer[mac] = event.payload

    async def _flush_loop(self):
        while self._running:
            await asyncio.sleep(self._flush_interval)
            await self._flush_buffers()

    async def _flush_buffers(self):
        if not self._network_buffer and not self._client_buffer:
            return

        # Check Disk Space (Edge Case 4.2)
        try:
            disk = shutil.disk_usage(os.getcwd())
            free_mb = disk.free // 1048576
            if free_mb < 50:
                bus.publish("system.disk_low", {"free_mb": free_mb})
                if free_mb < 10:
                    logger.error("disk_full_scan_flush_skipped", free_mb=free_mb)
                    self._network_buffer.clear()
                    self._client_buffer.clear()
                    return
        except Exception:
            pass

        network_batch = list(self._network_buffer.values())
        client_batch = list(self._client_buffer.values())
        
        self._network_buffer.clear()
        self._client_buffer.clear()

        try:
            async with SessionLocal() as session:
                if network_batch:
                    for net in network_batch:
                        ch = None
                        if net.get("channel") is not None:
                            try:
                                ch = int(net["channel"])
                            except ValueError:
                                pass
                        
                        stmt = insert(Network).values(
                            bssid=net["bssid"],
                            ssid=net.get("ssid"),
                            channel=ch,
                            band=net.get("band", "2.4 GHz" if (ch and ch <= 14) else "5 GHz"),
                            encryption=net.get("encryption"),
                            first_seen=datetime.fromtimestamp(net.get("first_seen", time.time()), timezone.utc).replace(tzinfo=None),
                            last_seen=datetime.fromtimestamp(net.get("last_seen", time.time()), timezone.utc).replace(tzinfo=None),
                            max_rssi=net.get("signal_dbm") or net.get("max_rssi") or net.get("power") or -50,
                            vendor=net.get("vendor")
                        )
                        stmt = stmt.on_conflict_do_update(
                            index_elements=[Network.bssid],
                            set_={
                                "ssid": stmt.excluded.ssid,
                                "channel": stmt.excluded.channel,
                                "encryption": stmt.excluded.encryption,
                                "last_seen": stmt.excluded.last_seen,
                                "max_rssi": stmt.excluded.max_rssi,
                                "vendor": stmt.excluded.vendor
                            }
                        )
                        await session.execute(stmt)

                if client_batch:
                    for cli in client_batch:
                        stmt = insert(Client).values(
                            mac=cli["mac"],
                            vendor=cli.get("vendor"),
                            associated_bssid=cli.get("bssid") or cli.get("associated_bssid"),
                            first_seen=datetime.fromtimestamp(cli.get("first_seen", time.time()), timezone.utc).replace(tzinfo=None),
                            last_seen=datetime.fromtimestamp(cli.get("last_seen", time.time()), timezone.utc).replace(tzinfo=None),
                            max_rssi=cli.get("signal_dbm") or cli.get("max_rssi") or cli.get("power") or -70,
                            probed_ssids=cli.get("probed_ssids", [])
                        )
                        stmt = stmt.on_conflict_do_update(
                            index_elements=[Client.mac],
                            set_={
                                "associated_bssid": stmt.excluded.associated_bssid,
                                "last_seen": stmt.excluded.last_seen,
                                "max_rssi": stmt.excluded.max_rssi,
                                "probed_ssids": stmt.excluded.probed_ssids
                            }
                        )
                        await session.execute(stmt)

                await session.commit()
        except Exception as e:
            if "disk is full" in str(e).lower():
                bus.publish("system.disk_full", {"error": str(e)})
            else:
                logger.error(f"Failed to flush DB buffers: {e}")

db_listener = DBEventListener()
