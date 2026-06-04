"""
DBEventListener — persists scan results from the EventBus to SQLite.

Key fix: events from the bus are plain dicts {seq, topic, ts_mono, payload}.
All field access must use dict indexing, NOT attribute access.
"""

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
    Subscribes to high-frequency events (scan updates) and buffers them
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
                # CRITICAL FIX: event is a dict, access with ["key"] not .key
                topic = event.get("topic", "")
                payload = event.get("payload", {})  # ← was event.payload (wrong!)

                if topic in ("network.discovered", "network.updated"):
                    await self._on_network(payload)
                elif topic in ("client.discovered", "client.updated"):
                    await self._on_client(payload)
                elif topic == "credential.captured":
                    await self._on_credential(payload)
        except asyncio.CancelledError:
            pass

    async def _on_credential(self, payload: dict):
        try:
            from wcarck.db.models import Credential
            import uuid
            async with SessionLocal() as session:
                cred = Credential(
                    id=str(uuid.uuid4()),
                    bssid=payload.get("bssid", "ANY"),
                    ssid=payload.get("ssid", "Unknown"),
                    type=payload.get("type", "wpa_psk"),
                    username=payload.get("username", ""),
                    plain_text=payload.get("plainText", ""),
                    created_at=datetime.now(timezone.utc).replace(tzinfo=None)
                )
                session.add(cred)
                await session.commit()
            logger.info(f"Saved cracked credential to DB: {payload.get('plainText')}")
        except Exception as e:
            logger.error(f"Failed to save credential to DB: {e}")

    async def _on_network(self, payload: dict):
        bssid = payload.get("bssid")
        if bssid:
            self._network_buffer[bssid] = payload

    async def _on_client(self, payload: dict):
        mac = payload.get("mac")
        if mac:
            self._client_buffer[mac] = payload

    async def _flush_loop(self):
        while self._running:
            await asyncio.sleep(self._flush_interval)
            await self._flush_buffers()

    async def _flush_buffers(self):
        if not self._network_buffer and not self._client_buffer:
            return

        # Check Disk Space
        try:
            disk = shutil.disk_usage(os.getcwd())
            free_mb = disk.free // 1048576
            if free_mb < 50:
                bus.publish("system.disk_low", {"free_mb": free_mb, "message": f"Low disk: {free_mb}MB free"})
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
                            except (ValueError, TypeError):
                                pass
                        
                        first_seen_ts = net.get("first_seen", time.time())
                        last_seen_ts = net.get("last_seen", time.time())
                        
                        stmt = insert(Network).values(
                            bssid=net["bssid"],
                            ssid=net.get("ssid") or "",
                            channel=ch,
                            band=net.get("band", "2.4 GHz" if (ch and ch <= 14) else "5 GHz"),
                            encryption=net.get("encryption"),
                            cipher=net.get("cipher"),
                            auth=net.get("auth"),
                            first_seen=datetime.fromtimestamp(first_seen_ts, timezone.utc).replace(tzinfo=None),
                            last_seen=datetime.fromtimestamp(last_seen_ts, timezone.utc).replace(tzinfo=None),
                            max_rssi=net.get("signal_dbm") or net.get("max_rssi") or net.get("power") or -50,
                            beacons=net.get("beacons") or 0,
                            data=net.get("data") or 0,
                            vendor=net.get("vendor"),
                            wps=net.get("wps", False)
                        )
                        stmt = stmt.on_conflict_do_update(
                            index_elements=[Network.bssid],
                            set_={
                                "ssid": stmt.excluded.ssid,
                                "channel": stmt.excluded.channel,
                                "encryption": stmt.excluded.encryption,
                                "cipher": stmt.excluded.cipher,
                                "auth": stmt.excluded.auth,
                                "last_seen": stmt.excluded.last_seen,
                                "max_rssi": stmt.excluded.max_rssi,
                                "beacons": stmt.excluded.beacons,
                                "data": stmt.excluded.data,
                                "vendor": stmt.excluded.vendor,
                                "wps": stmt.excluded.wps
                            }
                        )
                        await session.execute(stmt)

                if client_batch:
                    for cli in client_batch:
                        first_seen_ts = cli.get("first_seen", time.time())
                        last_seen_ts = cli.get("last_seen", time.time())

                        stmt = insert(Client).values(
                            mac=cli["mac"],
                            vendor=cli.get("vendor"),
                            associated_bssid=cli.get("bssid") or cli.get("associated_bssid"),
                            first_seen=datetime.fromtimestamp(first_seen_ts, timezone.utc).replace(tzinfo=None),
                            last_seen=datetime.fromtimestamp(last_seen_ts, timezone.utc).replace(tzinfo=None),
                            max_rssi=cli.get("signal_dbm") or cli.get("max_rssi") or cli.get("power") or -70,
                            packets=cli.get("packets") or 0,
                            probed_ssids=cli.get("probed_ssids", [])
                        )
                        stmt = stmt.on_conflict_do_update(
                            index_elements=[Client.mac],
                            set_={
                                "associated_bssid": stmt.excluded.associated_bssid,
                                "last_seen": stmt.excluded.last_seen,
                                "max_rssi": stmt.excluded.max_rssi,
                                "packets": stmt.excluded.packets,
                                "probed_ssids": stmt.excluded.probed_ssids
                            }
                        )
                        await session.execute(stmt)

                await session.commit()
                logger.debug(f"DB flush: {len(network_batch)} networks, {len(client_batch)} clients")
        except Exception as e:
            if "disk is full" in str(e).lower():
                bus.publish("system.disk_full", {"error": str(e), "message": "Disk is full! Stopping scan writes."})
            else:
                logger.error(f"Failed to flush DB buffers: {e}", exc_info=True)

db_listener = DBEventListener()
