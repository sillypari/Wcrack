"""
ScannerModule — passive 802.11 reconnaissance using airodump-ng.

Parses airodump-ng stdout in real-time (no CSV polling).
CSV is still written to disk for PCAP handshake capture on stop.
"""

import asyncio
import csv
import io
import os
import re
import time
from typing import Any, Optional

import structlog

from wcarck.core.event_bus import bus
from wcarck.core.module import Module
from wcarck.hardware.process import ManagedProcess
from wcarck.orchestration.leases import RadioLeaseManager

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Regex patterns for airodump-ng stdout (piped / no-curses mode)
# ---------------------------------------------------------------------------
# Strip ANSI escape codes (curses control sequences)
_ANSI_RE = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]|\x1b\[[\?\d;]*[a-zA-Z]|\x1b\[.*?\x1b\\')
# Strip cursor/erase sequences like [0K, [0J, [1B etc
_CTRL_RE = re.compile(r'\[[\d;]*[A-Z]')


def _strip_ansi(text: str) -> str:
    """Remove ANSI escape codes and curses control sequences."""
    text = _ANSI_RE.sub('', text)
    text = _CTRL_RE.sub('', text)
    return text.strip()

#  CH  1 ][ Elapsed: 5 s ][ 2026-06-05 23:04:24
_CH_RE = re.compile(r'CH\s+(\d+)')

#  BSSID              PWR  Beacons  #Data  Rate   MB  ENC  CIPHER  AUTH  ESSID
_AP_HEADER_RE = re.compile(r'BSSID\s+PWR\s+Beacons', re.I)

#  BSSID              STATION            PWR    Rate   Lost  Frames  Probes
_CLIENT_HEADER_RE = re.compile(r'BSSID\s+STATION', re.I)

# AP data line — airodump-ng piped format:
# BSSID  PWR  Beacons  #Data  #/s  CH  MB  ENC  CIPHER  AUTH  WPS
_AP_RE = re.compile(
    r'^\s*([0-9A-Fa-f:]{17})'   # BSSID
    r'\s+(-?\d+)'                # PWR
    r'\s+(\d+)'                  # Beacons
    r'\s+(\d+)'                  # #Data
    r'\s+(\d+)'                  # #/s
    r'\s+(\d+)'                  # CH
    r'\s+(\d+)'                  # MB
    r'\s+(\w+)'                  # ENC
    r'\s+(\w+)'                  # CIPHER
    r'\s+(\w+)'                  # AUTH
    r'(?:\s+[\d.]+)?'           # WPS (optional, skip)
    r'(?:\s+(.+?))?\s*$'        # ESSID (optional)
)

# Client data line — same lazy trick for Rate.
_CLIENT_RE = re.compile(
    r'^\s*([0-9A-Fa-f:]{17})'   # Associated BSSID
    r'\s+([0-9A-Fa-f:]{17})'    # Station MAC
    r'\s+(-?\d+)'                # PWR
    r'\s+(.+?)'                  # Rate
    r'\s+(-?\d+)'                # Lost
    r'\s+(\d+)'                  # Frames
    r'(?:\s+(.*))?\s*$'          # Probes (optional)
)


class ScannerModule(Module):
    """
    Passive 802.11 Reconnaissance Module.
    Runs airodump-ng and parses its stdout in real-time.
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

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #

    async def start(self, job_id: str, params: dict[str, Any]) -> None:
        iface = params.get("iface", "")
        if not iface:
            bus.publish("module.error", {
                "job_id": job_id, "module": self.name,
                "message": "No interface specified for scanner",
                "level": "ERROR",
            })
            return

        self._iface = iface
        self._target_bssid = params.get("bssid")
        self._cancel_event.clear()

        await self.lease_manager.acquire(job_id, iface, "monitor.scan")

        bus.publish("module.started", {
            "job_id": job_id, "module": self.name, "iface": iface,
            "message": f"Recon scanner starting on {iface}",
        })

        # Build airodump-ng command — keep CSV/PCAP output for stop() capture
        output_prefix = f"/tmp/wcarck_scan_{job_id}"
        cmd = [
            "airodump-ng",
            "-a",
            "--wps",
            "--output-format", "pcap,csv",
            "--write", output_prefix,
            "--write-interval", "1",
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
                "level": "ERROR",
            })
            return

        # Take over stdout: cancel ManagedProcess's own drain task so we can
        # read lines directly without competing for the same pipe.
        if self._process._drain_tasks:
            self._process._drain_tasks[0].cancel()
            try:
                await self._process._drain_tasks[0]
            except asyncio.CancelledError:
                pass

        csv_file = f"{output_prefix}-01.csv"
        bus.publish("process.info", {
            "job_id": job_id,
            "message": f"airodump-ng started on {iface} → writing {csv_file}",
        })

        # Seed from any pre-existing CSV (in case airodump-ng was already running)
        await self._seed_from_csv(job_id, csv_file)

        # Start real-time stdout parser
        self._parser_task = asyncio.create_task(self._parse_stdout(job_id, iface))
        self._parser_task.add_done_callback(lambda t: self._on_parser_done(t))

    async def stop(self, job_id: str) -> None:
        self._cancel_event.set()
        try:
            if self._process:
                await self._process.stop()
                self._process = None

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

                from wcarck.utils.pcap import verify_handshake, parse_eapol_frames
                status, valid_bssid = await verify_handshake(dest_file)

                eapol = await parse_eapol_frames(dest_file)

                import hashlib
                sha256_hash = hashlib.sha256()
                try:
                    with open(dest_file, "rb") as f:
                        for byte_block in iter(lambda: f.read(4096), b""):
                            sha256_hash.update(byte_block)
                    sha256_val = sha256_hash.hexdigest()
                except Exception:
                    sha256_val = "unknown"

                if status != "Invalid" or True:
                    try:
                        async with SessionLocal() as session:
                            from sqlalchemy import select
                            from wcarck.db.models import JobQueue, Scope

                            job_stmt = select(JobQueue).where(
                                JobQueue.id == int(job_id) if job_id.isdigit() else JobQueue.id == job_id
                            )
                            job_res = await session.execute(job_stmt)
                            job = job_res.scalar_one_or_none()

                            scope_id = job.scope_id if job else None
                            project_id = job.project_id if job else None

                            if not scope_id:
                                scope_stmt = select(Scope).where(Scope.active == True)
                                scope_res = await session.execute(scope_stmt)
                                scope = scope_res.scalar_one_or_none()
                                scope_id = scope.id if scope else 1

                            cap = Capture(
                                type="wpa_handshake",
                                path=dest_file,
                                sha256=sha256_val,
                                bssid=valid_bssid if valid_bssid else getattr(self, "_target_bssid", "ANY"),
                                ssid="Scanner Capture",
                                status=status,
                                size_bytes=os.path.getsize(dest_file),
                                eapolM1=eapol["m1"],
                                eapolM2=eapol["m2"],
                                eapolM3=eapol["m3"],
                                eapolM4=eapol["m4"],
                                scope_id=scope_id,
                                project_id=project_id,
                                created_at=datetime.now(timezone.utc).replace(tzinfo=None),
                            )
                            session.add(cap)
                            await session.commit()
                        logger.info(f"Saved capture file {dest_file} to database (Status: {status})")

                        if status in ("Valid", "Partial"):
                            bus.publish("handshake.captured", {
                                "job_id": job_id,
                                "bssid": cap.bssid,
                                "path": cap.path,
                                "status": status,
                            })
                    except Exception as e:
                        logger.error(f"Failed to save capture to DB: {e}")

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
            "message": "Recon scanner stopped",
        })

    async def status(self, job_id: str) -> dict[str, Any]:
        return {
            "is_running": self._process is not None,
            "module": self.name,
            "iface": self._iface,
        }

    def _on_parser_done(self, task: asyncio.Task) -> None:
        if task.cancelled():
            return
        exc = task.exception()
        if exc:
            logger.error("scanner stdout parser crashed", exc_info=exc)
            bus.publish("module.error", {
                "job_id": "unknown", "module": self.name,
                "level": "ERROR",
                "message": f"Scanner stdout parser crashed: {exc}",
            })

    # ------------------------------------------------------------------ #
    # CSV seed (one-time at startup)
    # ------------------------------------------------------------------ #

    async def _seed_from_csv(self, job_id: str, csv_file: str) -> None:
        """Read the CSV once at startup to seed any pre-existing data."""
        for _ in range(10):
            if os.path.exists(csv_file):
                break
            await asyncio.sleep(0.5)

        if not os.path.exists(csv_file):
            return

        try:
            with open(csv_file, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except Exception:
            return

        if not content.strip():
            return

        sections = re.split(r"\n\s*\n", content, maxsplit=1)
        ap_section = sections[0] if sections else ""
        client_section = sections[1] if len(sections) > 1 else ""

        now = time.time()
        net_count = 0
        cli_count = 0

        # --- APs ---
        if ap_section:
            reader = csv.reader(io.StringIO(ap_section.strip()), skipinitialspace=True, escapechar="\\")
            for parts in reader:
                if not parts or len(parts) < 14:
                    continue
                bssid = parts[0].strip()
                if not bssid or len(bssid) < 17 or bssid == "BSSID":
                    continue
                if re.match(
                    r"^(ff:ff:ff:ff:ff:ff|00:00:00:00:00:00|01:00:5e:|01:80:c2:|33:33:)",
                    bssid, re.I,
                ):
                    continue

                try:
                    channel = int(parts[3].strip())
                    if channel == -1:
                        continue
                except ValueError:
                    continue

                try:
                    power = int(parts[8].strip())
                except ValueError:
                    power = None

                try:
                    beacons = int(parts[9].strip())
                except ValueError:
                    beacons = None

                ssid = parts[13].strip() if len(parts) > 13 else ""
                encryption = parts[5].strip() if len(parts) > 5 else ""
                cipher = parts[6].strip() if len(parts) > 6 else ""
                auth = parts[7].strip() if len(parts) > 7 else ""

                wps = False
                if len(parts) > 14:
                    wps_col = parts[14].strip().upper()
                    if wps_col and wps_col not in ("", "WPS"):
                        wps = True

                bus.publish("network.discovered", {
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
                })
                net_count += 1

        # --- Clients ---
        if client_section:
            reader = csv.reader(io.StringIO(client_section.strip()), skipinitialspace=True, escapechar="\\")
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
                probed = [s.strip() for s in probed_raw.split(",")] if probed_raw else []

                try:
                    power = int(parts[3].strip())
                except ValueError:
                    power = None

                try:
                    packets = int(parts[4].strip())
                except ValueError:
                    packets = None

                bssid = bssid_assoc if bssid_assoc != "(not associated)" else None

                bus.publish("client.discovered", {
                    "job_id": job_id,
                    "mac": mac,
                    "bssid": bssid,
                    "signal_dbm": power,
                    "power": power,
                    "packets": packets,
                    "probed_ssids": probed,
                    "first_seen": now,
                    "last_seen": now,
                })
                cli_count += 1

        if net_count or cli_count:
            bus.publish("process.info", {
                "job_id": job_id,
                "message": f"Seeded from CSV: {net_count} networks, {cli_count} clients",
            })

    # ------------------------------------------------------------------ #
    # Real-time stdout parser
    # ------------------------------------------------------------------ #

    async def _parse_stdout(self, job_id: str, iface: str) -> None:
        """
        Read airodump-ng stdout line-by-line and publish events.

        State machine for the periodic "screen refresh" format:
            CH line        → "header"
            BSSID PWR ...  → "ap_header"
            blank          → "ap_data"   (AP lines follow)
            BSSID STATION  → "client_header"
            blank          → "client_data" (client lines follow)
        """
        seen_bssids: set[str] = set()
        seen_clients: set[str] = set()
        section = "idle"
        current_channel: Optional[int] = None
        last_renew = time.monotonic()

        stream = self._process._process.stdout
        if not stream:
            bus.publish("module.error", {
                "job_id": job_id, "module": self.name,
                "level": "ERROR",
                "message": "No stdout pipe available for airodump-ng",
            })
            return

        while not self._cancel_event.is_set():
            # Periodic lease renewal (~5 s)
            now_mono = time.monotonic()
            if now_mono - last_renew >= 5.0:
                try:
                    await self.lease_manager.renew(job_id, iface)
                except Exception:
                    pass
                last_renew = now_mono

            try:
                raw = await asyncio.wait_for(stream.readline(), timeout=5.0)
            except asyncio.TimeoutError:
                if self._process._process.returncode is not None:
                    bus.publish("module.error", {
                        "job_id": job_id, "module": self.name,
                        "level": "ERROR",
                        "message": "airodump-ng exited unexpectedly",
                    })
                    return
                continue

            # EOF → process exited
            if not raw:
                if self._cancel_event.is_set():
                    return
                bus.publish("module.error", {
                    "job_id": job_id, "module": self.name,
                    "level": "ERROR",
                    "message": "airodump-ng stdout closed (process exited)",
                })
                return

            line = _strip_ansi(raw.decode("utf-8", errors="replace"))

            # Blank line → advance section state
            if not line:
                if section == "ap_header":
                    section = "ap_data"
                elif section == "client_header":
                    section = "client_data"
                continue

            # --- Header / section markers ---

            ch_m = _CH_RE.search(line)
            if ch_m:
                current_channel = int(ch_m.group(1))
                section = "header"
                continue

            if _AP_HEADER_RE.search(line):
                section = "ap_header"
                continue

            if _CLIENT_HEADER_RE.search(line):
                section = "client_header"
                continue

            # --- Data lines ---

            if section == "ap_data":
                self._parse_ap_line(line, job_id, seen_bssids, current_channel)
            elif section == "client_data":
                self._parse_client_line(line, job_id, seen_clients)

    # ------------------------------------------------------------------ #
    # Line parsers
    # ------------------------------------------------------------------ #

    def _parse_ap_line(
        self,
        line: str,
        job_id: str,
        seen_bssids: set[str],
        channel: Optional[int],
    ) -> None:
        m = _AP_RE.match(line)
        if not m:
            logger.warning("scanner: unrecognised AP line", raw=line)
            return

        bssid, power_s, beacons_s, data_s, rate_s, ch_s, mb, enc, cipher, auth = (
            m.group(1).upper(),
            m.group(2),
            m.group(3),
            m.group(4),
            m.group(5),
            m.group(6),
            m.group(7),
            m.group(8),
            m.group(9),
            m.group(10),
        )
        ssid = (m.group(11) or "").strip()

        # Filter broadcast / multicast / bogus
        if re.match(
            r"^(ff:ff:ff:ff:ff:ff|00:00:00:00:00:00|01:00:5e:|01:80:c2:|33:33:)",
            bssid, re.I,
        ):
            return

        try:
            power = int(power_s)
        except (ValueError, TypeError):
            power = None
        try:
            beacons = int(beacons_s)
        except (ValueError, TypeError):
            beacons = None
        try:
            data_count = int(data_s)
        except (ValueError, TypeError):
            data_count = None
        try:
            rate = int(rate_s)
        except (ValueError, TypeError):
            rate = 0
        try:
            ch_from_line = int(ch_s)
        except (ValueError, TypeError):
            ch_from_line = None

        now = time.time()
        payload: dict[str, Any] = {
            "job_id": job_id,
            "bssid": bssid,
            "ssid": ssid,
            "channel": ch_from_line or channel,
            "encryption": enc,
            "cipher": cipher,
            "auth": auth,
            "signal_dbm": power,
            "power": power,
            "beacons": beacons,
            "data_count": data_count,
            "rate": f"{rate} Mbs" if rate else "",
            "mb": mb,
            "wps": False,
            "first_seen": now,
            "last_seen": now,
        }

        if bssid not in seen_bssids:
            seen_bssids.add(bssid)
            bus.publish("network.discovered", payload)
            bus.publish("process.stdout", {
                "job_id": job_id,
                "line": f"AP: {bssid} SSID={ssid!r} Ch={channel} Enc={enc} Power={power}dBm",
            })
        else:
            bus.publish("network.updated", payload)

    def _parse_client_line(
        self,
        line: str,
        job_id: str,
        seen_clients: set[str],
    ) -> None:
        m = _CLIENT_RE.match(line)
        if not m:
            logger.warning("scanner: unrecognised client line", raw=line)
            return

        bssid_assoc = m.group(1).upper()
        station = m.group(2).upper()
        rate = m.group(4).strip()
        probes_raw = m.group(7)

        try:
            power = int(m.group(3))
        except (ValueError, TypeError):
            power = None
        try:
            lost = int(m.group(5))
        except (ValueError, TypeError):
            lost = None
        try:
            frames = int(m.group(6))
        except (ValueError, TypeError):
            frames = None

        bssid = bssid_assoc if bssid_assoc != "(NOT ASSOCIATED)" else None
        probed = [s.strip() for s in probes_raw.split(",")] if probes_raw and probes_raw.strip() else []

        now = time.time()
        payload: dict[str, Any] = {
            "job_id": job_id,
            "mac": station,
            "bssid": bssid,
            "signal_dbm": power,
            "power": power,
            "rate": rate,
            "lost": lost,
            "frames": frames,
            "packets": frames,
            "probed_ssids": probed,
            "first_seen": now,
            "last_seen": now,
        }

        if station not in seen_clients:
            seen_clients.add(station)
            bus.publish("client.discovered", payload)
            bus.publish("process.stdout", {
                "job_id": job_id,
                "line": f"Station: {station} → {bssid_assoc} Power={power}dBm Frames={frames}",
            })
        else:
            bus.publish("client.updated", payload)

        if bssid:
            bus.publish("client.associated_network", {
                "job_id": job_id,
                "client_mac": station,
                "bssid": bssid,
            })
