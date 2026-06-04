import pytest
import asyncio
from wcarck.orchestration.leases import RadioLeaseManager, ResourceBusyError
from wcarck.modules.recon.scanner import ScannerModule

@pytest.mark.asyncio
async def test_lease_manager_acquire_release():
    manager = RadioLeaseManager(ttl_seconds=30.0)
    
    # Test acquire
    await manager.acquire("job1", "wlan0", "monitor.scan")
    assert "wlan0" in manager._leases
    assert manager._leases["wlan0"].job_id == "job1"
    
    # Test busy exception
    with pytest.raises(ResourceBusyError):
        await manager.acquire("job2", "wlan0", "monitor.scan")
        
    # Test renew
    lease_before = manager._leases["wlan0"].expires_at
    await manager.renew("job1", "wlan0")
    lease_after = manager._leases["wlan0"].expires_at
    assert lease_after > lease_before
    
    # Test release
    await manager.release("job1", "wlan0")
    assert "wlan0" not in manager._leases

def test_scanner_csv_parser():
    # Mock a CSV file with quoted commas in SSID
    csv_content = \"\"\"
BSSID, First time seen, Last time seen, channel, Speed, Privacy, Cipher, Authentication, Power, # beacons, # IV, LAN IP, ID-length, ESSID, Key
AA:BB:CC:DD:EE:FF, 2026-06-04 12:00:00, 2026-06-04 12:00:00,  1,   54, WPA2, CCMP, PSK, -65,      100,        0,  0.  0.  0.  0,  12, "My, Home, Wi-Fi", 

Station MAC, First time seen, Last time seen, Power, # packets, BSSID, Probed ESSIDs
11:22:33:44:55:66, 2026-06-04 12:00:00, 2026-06-04 12:00:00, -70,       50, AA:BB:CC:DD:EE:FF, "My, Home, Wi-Fi"
\"\"\"
    import tempfile
    import os
    
    fd, path = tempfile.mkstemp()
    with os.fdopen(fd, 'w') as f:
        f.write(csv_content)
        
    try:
        manager = RadioLeaseManager()
        scanner = ScannerModule(manager)
        seen_bssids = set()
        seen_clients = set()
        
        nets, clients = scanner._parse_csv_file(path, "test_job", seen_bssids, seen_clients)
        
        assert nets == 1
        assert clients == 1
        assert "AA:BB:CC:DD:EE:FF" in seen_bssids
        assert "11:22:33:44:55:66" in seen_clients
    finally:
        os.remove(path)
