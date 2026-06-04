import asyncio
import pytest
import time
import os
import json

from wcarck.core.event_bus import EventBus
from wcarck.orchestration.leases import RadioLeaseManager, ResourceBusyError
from wcarck.modules.session_log.async_writer import AsyncLogWriter


@pytest.mark.asyncio
async def test_event_bus():
    bus = EventBus(history_size=5)
    
    # Publish some events
    for i in range(10):
        bus.publish(f"test.event.{i}", {"val": i})
        
    history = bus.get_history()
    assert len(history) == 5
    assert history[-1]["topic"] == "test.event.9"
    assert history[0]["topic"] == "test.event.5"
    
    # Test subscribe
    events_received = []
    
    async def sub():
        count = 0
        async for ev in bus.subscribe():
            events_received.append(ev)
            count += 1
            if count == 3:
                break
                
    task = asyncio.create_task(sub())
    
    # Let the subscriber connect
    await asyncio.sleep(0.1)
    
    bus.publish("live.1")
    bus.publish("live.2")
    bus.publish("live.3")
    
    await asyncio.wait_for(task, timeout=1.0)
    assert len(events_received) == 3
    assert events_received[0]["topic"] == "live.1"


@pytest.mark.asyncio
async def test_radio_lease_manager():
    manager = RadioLeaseManager(ttl_seconds=0.2)
    
    # Acquire
    await manager.acquire("job-1", "wlan_mon", "monitor.locked")
    
    # Conflict
    with pytest.raises(ResourceBusyError) as exc:
        await manager.acquire("job-2", "wlan_mon", "monitor.scan")
    assert exc.value.active_job_id == "job-1"
    
    # Renew
    await manager.renew("job-1", "wlan_mon")
    
    # Release
    await manager.release("job-1", "wlan_mon")
    
    # Now available
    await manager.acquire("job-2", "wlan_mon", "monitor.scan")
    
    # Test expiration sweeper
    await manager.start_sweeper()
    await asyncio.sleep(1.5)  # Let it expire and be swept
    
    # Should be free again
    await manager.acquire("job-3", "wlan_mon", "ap.service")
    
    await manager.stop_sweeper()


@pytest.mark.asyncio
async def test_async_log_writer(tmp_path):
    from wcarck.core.event_bus import bus
    
    log_dir = str(tmp_path)
    writer = AsyncLogWriter(log_dir=log_dir)
    
    await writer.start("test-job", {})
    assert (await writer.status("test-job"))["is_running"] is True
    
    # Allow subscriber to connect
    await asyncio.sleep(0.1)
    
    bus.publish("auth.success", {"message": "Client connected"})
    
    await asyncio.sleep(0.2) # Let writer flush
    await writer.stop("test-job")
    
    files = os.listdir(log_dir)
    assert len(files) == 1
    
    with open(os.path.join(log_dir, files[0]), "r") as f:
        line = f.readline()
        data = json.loads(line)
        assert data["event"] == "auth.success"
        assert data["message"] == "Client connected"

