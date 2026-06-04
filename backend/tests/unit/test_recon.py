import pytest
import asyncio
import os
from unittest.mock import patch, MagicMock, AsyncMock
from wcarck.modules.recon.scanner import ScannerModule
from wcarck.orchestration.leases import RadioLeaseManager
from wcarck.core.event_bus import bus

@pytest.mark.asyncio
async def test_scanner_module():
    lease_manager = RadioLeaseManager(ttl_seconds=5.0)
    scanner = ScannerModule(lease_manager)
    
    # Mock ManagedProcess to avoid calling missing privileged binaries
    mock_proc = MagicMock()
    mock_proc.start = AsyncMock()
    mock_proc.stop = AsyncMock()
    
    # Write a mock CSV file to the expected temp path
    tmp_path = "/tmp"
    if os.name == "nt":
        os.makedirs("C:\\tmp", exist_ok=True)
        tmp_path = "C:\\tmp"
    else:
        os.makedirs("/tmp", exist_ok=True)
        
    csv_file = os.path.join(tmp_path, "wcarck_scan_test-scan-job-01.csv")
    
    # Ensure any old file is removed
    if os.path.exists(csv_file):
        os.remove(csv_file)
        
    # Standard airodump CSV structure
    csv_content = """BSSID, First time seen, Last time seen, channel, Speed, Privacy, Cipher, Authentication, Power, # beacons, # IV, LAN IP, ID-length, ESSID, Key
00:11:22:33:44:55, 2026-06-04 12:00:00, 2026-06-04 12:00:00, 6, 54, WPA2, CCMP, PSK, -50, 10, 0, 0.0.0.0, 8, TestSSID, 

Station MAC, First time seen, Last time seen, Power, # packets, BSSID, Probed ESSIDs
"""
    
    with open(csv_file, "w", encoding="utf-8") as f:
        f.write(csv_content)
        
    import builtins
    original_open = builtins.open
    def mock_open(file, *args, **kwargs):
        if "wcarck_scan_test-scan-job" in str(file):
            return original_open(csv_file, *args, **kwargs)
        return original_open(file, *args, **kwargs)

    original_exists = os.path.exists
    def mock_exists(path):
        if "wcarck_scan_test-scan-job" in str(path) and str(path).endswith(".csv"):
            return True
        return original_exists(path)
        
    try:
        with patch('wcarck.modules.recon.scanner.ManagedProcess', return_value=mock_proc), \
             patch('builtins.open', mock_open), \
             patch('os.path.exists', mock_exists):
             
            # Start scanner
            await scanner.start(job_id="test-scan-job", params={"iface": "wlan_mon_test"})
            
            # Verify lease acquisition
            assert lease_manager._leases["wlan_mon_test"].job_id == "test-scan-job"
            
            # Allow time for tail task to read mock file
            await asyncio.sleep(2.0)
            
            # Verify network.discovered event was published by tail task
            history = bus.get_history()
            events = [e for e in history if e["topic"] == "network.discovered" and e["payload"].get("job_id") == "test-scan-job"]
            
            assert len(events) >= 1
            assert events[0]["payload"]["bssid"] == "00:11:22:33:44:55"
            
            await scanner.stop(job_id="test-scan-job")
            
            # Verify status is stopped
            status = await scanner.status("test-scan-job")
            assert status["is_running"] is False
    finally:
        if os.path.exists(csv_file):
            try:
                os.remove(csv_file)
            except Exception:
                pass
