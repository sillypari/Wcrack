"""
ScannerModule — passive 802.11 reconnaissance using airodump-ng.

Airodump-ng CSV format (columns 0-13 for APs, different for clients):
AP section:
  0: BSSID, 1: First time seen, 2: Last time seen, 3: channel, 4: Speed,
  5: Privacy, 6: Cipher, 7: Authentication, 8: Power, 9: # beacons,
  10: # IV, 11: LAN IP, 12: ID-length, 13: ESSID, 14: Key

Client section (after blank line + "Station MAC,"):
  0: Station MAC, 1: First time seen, 2: Last time seen, 3: Power,
  4: # packets, 5: BSSID, 6: Probed ESSIDs
"""

import asyncio
import os
import csv
import time
import re
from typing import Any, Optional, List
from wcarck.core.module import Module
from wcarck.core.event_bus import bus
from wcarck.hardware.process import ManagedProcess
from wcarck.orchestration.leases import RadioLeaseManager
import structlog

logger = structlog.get_logger()

class ScannerModule(Module):
    """
    Passive 802.11 Reconnaissance Module.
    Runs airodump-ng and parses its CSV output in real-time.
    """
    
    def __init__(self, lease_manager: RadioLeaseManager):
        self.lease_manager = lease_manager
        self._process: Optional[ManagedProcess] = None
        self._parser_task: Optional[asyncio.Task] = None
        self._cancel_event = asyncio.Event()
        self._iface: Optional[str] = None

    @property
    def name(self) -> str:
        return "recon.scanner"

    async def start(self, job_id: str, params: dict[str, Any]) -> None:
        iface = params.get("iface", "")
        if not iface:
            bus.publish("module.error", {
                "job_id": job_id, "module": self.name,
                "message": "No interface specified for scanner",
                "level": "ERROR"
            })
            return

        self._iface = iface
        self._target_bssid = params.get("bssid")
        self._cancel_event.clear()
        
        # Acquire Lease
        await self.lease_manager.acquire(job_id, iface, "monitor.scan")
        
        bus.publish("module.started", {
            "job_id": job_id, "module": self.name, "iface": iface,
            "message": f"Recon scanner starting on {iface}"
        })

        # Build airodump-ng command
        # Write to /tmp with a unique prefix for this job
        output_prefix = f"/tmp/wcarck_scan_{job_id}"
        cmd = [
            "airodump-ng",
            "-a",                      # wifite2 flag: only show associated clients
            "--wps",                   # wifite2 flag: detect WPS capability
            "--output-format", "pcap,csv",
            "--write", output_prefix,
            "--write-interval", "1",   # flush every 1 second
        ]
        
        if self._target_bssid:
            cmd.extend(["--bssid", self._target_bssid])
            
        channel = params.get("channel")
        if channel and channel != "all":
            cmd.extend(["--channel", str(channel)])
        else:
            band = params.get("band", "abg")
            if band != "all":
                cmd.extend(["--band", band])
                
        cmd.append(iface)
            
        try:
            self._process = ManagedProcess(cmd=cmd, job_id=job_id)
            await self._process.start()
        except Exception as e:
            bus.publish("module.error", {
                "job_id": job_id, "module": self.name,
                "message": f"Failed to start airodump-ng: {e}",
                "level": "ERROR"
            })
            return
        
        bus.publish("process.info", {
            "job_id": job_id,
            "message": f"airodump-ng started on {iface} → writing {output_prefix}-01.csv"
        })
        
        # Start CSV parser
        csv_file = f"{output_prefix}-01.csv"
        self._parser_task = asyncio.create_task(self._tail_csv(job_id, csv_file, iface))

    async def stop(self, job_id: str) -> None:
        self._cancel_event.set()
        try:
            if self._process:
                await self._process.stop()
                
            # Detect and save PCAP
            import os, shutil, uuid
            from datetime import datetime, timezone
            from wcarck.db.session import SessionLocal
            from wcarck.db.models import Capture
            
            cap_file = f"/tmp/wcarck_scan_{job_id}-01.cap"
            if os.path.exists(cap_file):
                dest_dir = "/var/lib/wcarck/captures"
                os.makedirs(dest_dir, exist_ok=True)
                dest_file = os.path.join(dest_dir, f"scan_{job_id}.cap")
                shutil.move(cap_file, dest_file)
                
                # Verify Handshake Status using aircrack-ng
                from wcarck.utils.pcap import verify_handshake
                status, valid_bssid = await verify_handshake(dest_file)
                
                if status != "Invalid" or True: # we save it anyway for now
                    try:
                        async with SessionLocal() as session:
                            cap = Capture(
                                id=str(uuid.uuid4()),
                                type="wpa_handshake",
                                path=dest_file,
                                bssid=valid_bssid if valid_bssid else getattr(self, '_target_bssid', "ANY"),
                                ssid="Scanner Capture",
                                status=status,
                                created_at=datetime.now(timezone.utc).replace(tzinfo=None)
                            )
                            session.add(cap)
                            await session.commit()
                        logger.info(f"Saved capture file {dest_file} to database (Status: {status})")
                        
                        # Emit event if valid
                        if status in ("Valid", "Partial"):
                            bus.publish("handshake.captured", {
                                "job_id": job_id,
                                "bssid": cap.bssid,
                                "path": cap.path,
                                "status": status
                            })
                    except Exception as e:
                        logger.error(f"Failed to save capture to DB: {e}")
                    
            bus.publish("module.stopped", {"job_id": job_id, "module": self.name})
            
            if self._parser_task:
                self._parser_task.cancel()
                try:
                    await self._parser_task
                except asyncio.CancelledError:
                    pass
                self._parser_task = None
        finally:
            if self._iface:
                await self.lease_manager.release(job_id, self._iface)

        bus.publish("module.stopped", {
            "job_id": job_id, "module": self.name,
            "message": f"Recon scanner stopped"
        })

    async def status(self, job_id: str) -> dict[str, Any]:
        return {
            "is_running": self._process is not None,
            "module": self.name,
            "iface": self._iface
        }

    # ------------------------------------------------------------------ #
    # CSV tailing logic
    # ------------------------------------------------------------------ #

    async def _tail_csv(self, job_id: str, csv_file: str, iface: str):
        """
        Tail the airodump-ng CSV file and publish events.
        The CSV has two sections: APs and Clients, separated by a blank line.
        airodump-ng overwrites the file on each flush — we re-read from the top.
        """
        last_check = time.time()
        seen_bssids: set = set()
        seen_clients: set = set()

        # Wait for file to appear (up to 15 seconds)
        wait_start = time.monotonic()
        while not os.path.exists(csv_file) and not self._cancel_event.is_set():
            if time.monotonic() - wait_start > 15:
                bus.publish("module.error", {
                    "job_id": job_id, "module": self.name,
                    "level": "ERROR",
                    "message": f"airodump-ng CSV not created after 15s. Is {iface} in monitor mode?"
                })
                return
            await asyncio.sleep(0.5)

        if self._cancel_event.is_set():
            return

        bus.publish("process.info", {
            "job_id": job_id,
            "message": f"airodump-ng CSV found: {csv_file}. Parsing..."
        })

        # Poll the CSV file
        stale_counter = 0
        renew_counter = 0
        while not self._cancel_event.is_set():
            await asyncio.sleep(1.0)
            
            # Renew lease periodically (every ~5 seconds)
            renew_counter += 1
            if renew_counter >= 5:
                await self.lease_manager.renew(job_id, iface)
                renew_counter = 0
            
            networks_found = 0
            clients_found = 0
            
            try:
                networks_found, clients_found = await asyncio.get_event_loop().run_in_executor(
                    None, self._parse_csv_file, csv_file, job_id, seen_bssids, seen_clients
                )
            except Exception as e:
                logger.error(f"CSV parse error: {e}")

            if networks_found == 0 and clients_found == 0:
                stale_counter += 1
                if stale_counter >= 30:  # 30 seconds without data
                    bus.publish("scan.stale", {
                        "job_id": job_id,
                        "seconds": stale_counter,
                        "level": "WARN",
                        "message": f"No new networks for {stale_counter}s. Adapter may not be in monitor mode."
                    })
                    stale_counter = 0  # Reset to avoid spamming
            else:
                stale_counter = 0

    def _parse_csv_file(
        self, csv_file: str, job_id: str,
        seen_bssids: set, seen_clients: set
    ) -> tuple[int, int]:
        """Parse the full CSV and publish new/updated entries. Returns (net_count, cli_count)."""
        import io
        networks_found = 0
        clients_found = 0

        try:
            with open(csv_file, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
        except FileNotFoundError:
            return 0, 0

        if not content.strip():
            return 0, 0

        # Split on the blank line between APs and Clients sections
        sections = re.split(r'\n\s*\n', content, maxsplit=1)
        ap_section = sections[0] if sections else ""
        client_section = sections[1] if len(sections) > 1 else ""

        now = time.time()

        # Parse AP section
        if ap_section:
            reader = csv.reader(io.StringIO(ap_section.strip()), skipinitialspace=True, escapechar='\\')
            for parts in reader:
                if not parts or len(parts) < 14:
                    continue
                bssid = parts[0].strip()
                if not bssid or len(bssid) < 17 or bssid == "BSSID":
                    continue
                
                # Filter out broadcast/multicast/bogus BSSIDs
                if re.match(r'^ff:ff:ff:ff:ff:ff$|^00:00:00:00:00:00$|^01:00:5e:|^01:80:c2:|^33:33:', bssid, re.I):
                    continue

                # Parse channel
                channel = None
                try:
                    channel = int(parts[3].strip())
                    if channel == -1:
                        continue
                except ValueError:
                    continue

                # Parse power/signal
                power = None
                try:
                    power = int(parts[8].strip())
                except ValueError:
                    pass

                # Parse beacons
                beacons = None
                try:
                    beacons = int(parts[9].strip())
                except ValueError:
                    pass

                ssid = parts[13].strip() if len(parts) > 13 else ""
                
                # Check for WPS column (column 14) if --wps is passed
                wps = False
                if len(parts) > 14:
                    wps_col = parts[14].strip().upper()
                    if wps_col and wps_col not in (" ", "", "WPS"):
                        wps = True
                
                encryption = parts[5].strip() if len(parts) > 5 else ""
                cipher = parts[6].strip() if len(parts) > 6 else ""
                auth = parts[7].strip() if len(parts) > 7 else ""

                payload = {
                    "job_id": job_id,
                    "bssid": bssid,
                    "ssid": ssid,
                    "channel": channel,
                    "encryption": encryption,
                    "cipher": cipher,
                    "auth": auth,
                    "signal_dbm": power,
                    "power": power,
                    "beacons": beacons,
                    "wps": wps,
                    "first_seen": now,
                    "last_seen": now,
                }

                if bssid not in seen_bssids:
                    seen_bssids.add(bssid)
                    bus.publish("network.discovered", payload)
                    bus.publish("process.stdout", {
                        "job_id": job_id,
                        "line": f"AP: {bssid} SSID={ssid!r} Ch={channel} Enc={encryption} Power={power}dBm"
                    })
                else:
                    bus.publish("network.updated", payload)

                networks_found += 1

        # Parse client section
        if client_section:
            reader = csv.reader(io.StringIO(client_section.strip()), skipinitialspace=True, escapechar='\\')
            in_clients = False
            for parts in reader:
                if not parts:
                    continue
                if parts[0].strip() == "Station MAC":
                    in_clients = True
                    continue
                if not in_clients or len(parts) < 6:
                    continue
                
                mac = parts[0].strip()
                if not mac or len(mac) < 17:
                    continue

                bssid_assoc = parts[5].strip() if len(parts) > 5 else ""
                probed_raw = parts[6].strip() if len(parts) > 6 else ""
                probed = [s.strip() for s in probed_raw.split(',')] if probed_raw else []

                power = None
                try:
                    power = int(parts[3].strip())
                except ValueError:
                    pass

                packets = None
                try:
                    packets = int(parts[4].strip())
                except ValueError:
                    pass

                bssid = bssid_assoc if bssid_assoc != "(not associated)" else None

                payload = {
                    "job_id": job_id,
                    "mac": mac,
                    "bssid": bssid,
                    "signal_dbm": power,
                    "power": power,
                    "packets": packets,
                    "probed_ssids": probed,
                    "first_seen": now,
                    "last_seen": now,
                }

                if mac not in seen_clients:
                    seen_clients.add(mac)
                    bus.publish("client.discovered", payload)
                    bus.publish("process.stdout", {
                        "job_id": job_id,
                        "line": f"Station: {mac} → {bssid_assoc} Power={power}dBm Pkts={packets}"
                    })
                else:
                    bus.publish("client.updated", payload)
                    
                # Wcarck improvement: Link clients dynamically to networks via bus
                if bssid:
                    bus.publish("client.associated_network", {
                        "job_id": job_id,
                        "client_mac": mac,
                        "bssid": bssid
                    })

                clients_found += 1

        return networks_found, clients_found
