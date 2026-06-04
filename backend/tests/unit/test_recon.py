import pytest
import asyncio
from wcarck.modules.recon.scanner import ScannerModule
from wcarck.orchestration.leases import RadioLeaseManager
from wcarck.core.event_bus import bus

@pytest.mark.asyncio
async def test_scanner_module():
    lease_manager = RadioLeaseManager(ttl_seconds=5.0)
    scanner = ScannerModule(lease_manager)
    
    # Start scanner
    await scanner.start(job_id="test-scan-job", params={"iface": "wlan_mon_test"})
    
    # Verify it got the lease
    assert lease_manager._leases["wlan_mon_test"].job_id == "test-scan-job"
    
    # Allow dummy windows script to run
    await asyncio.sleep(2.5)
    
    # Verify network.discovered event was published by the dummy tailer
    history = bus.get_history()
    events = [e for e in history if e["topic"] == "network.discovered" and e["payload"].get("job_id") == "test-scan-job"]
    
    assert len(events) >= 1
    assert events[0]["payload"]["bssid"] == "00:11:22:33:44:55"
    
    await scanner.stop(job_id="test-scan-job")
    
    # verify stopped
    status = await scanner.status("test-scan-job")
    assert status["is_running"] is False
