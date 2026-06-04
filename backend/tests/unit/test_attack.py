import pytest
import asyncio
from wcarck.modules.attack.deauth import DeauthModule
from wcarck.modules.attack.pmkid import PMKIDModule
from wcarck.modules.attack.eviltwin import EvilTwinModule
from wcarck.orchestration.leases import RadioLeaseManager

@pytest.mark.asyncio
async def test_deauth_module():
    lease_manager = RadioLeaseManager()
    module = DeauthModule(lease_manager)
    
    await module.start("job-deauth-1", {"bssid": "00:11:22:33:44:55", "iface": "wlan_mon", "client_mac": "00:aa:bb:cc:dd:ee"})
    assert lease_manager._leases["wlan_mon"].job_id == "job-deauth-1"
    assert lease_manager._leases["wlan_mon"].lease_type == "monitor.locked"
    
    await asyncio.sleep(0.5)
    await module.stop("job-deauth-1")

@pytest.mark.asyncio
async def test_pmkid_module():
    lease_manager = RadioLeaseManager()
    module = PMKIDModule(lease_manager)
    
    await module.start("job-pmkid-1", {"bssid": "00:11:22:33:44:55", "iface": "wlan_mon2"})
    assert lease_manager._leases["wlan_mon2"].job_id == "job-pmkid-1"
    
    await asyncio.sleep(0.5)
    await module.stop("job-pmkid-1")

@pytest.mark.asyncio
async def test_eviltwin_module():
    lease_manager = RadioLeaseManager()
    module = EvilTwinModule(lease_manager)
    
    await module.start("job-et-1", {"ssid": "FreeWiFi", "iface": "wlan_ap0"})
    assert lease_manager._leases["wlan_ap0"].job_id == "job-et-1"
    assert lease_manager._leases["wlan_ap0"].lease_type == "ap.service"
    
    await asyncio.sleep(0.5)
    await module.stop("job-et-1")
