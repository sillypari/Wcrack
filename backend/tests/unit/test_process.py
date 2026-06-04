import pytest
import asyncio
import sys
from wcarck.hardware.process import ManagedProcess
from wcarck.core.event_bus import bus

@pytest.mark.asyncio
async def test_managed_process():
    # We use a simple echo command to test cross-platform subprocess
    cmd = [sys.executable, "-c", "import time; print('hello'); time.sleep(0.1)"]
    
    process = ManagedProcess(cmd=cmd, job_id="test-job")
    await process.start()
    
    # Give it time to output and stop
    await asyncio.sleep(0.3)
    await process.stop()
    
    history = bus.get_history()
    events = [e for e in history if e["payload"].get("job_id") == "test-job"]
    
    assert any(e["topic"] == "process.started" for e in events)
    assert any(e["topic"] == "process.stdout" and e["payload"]["line"] == "hello" for e in events)
    assert any(e["topic"] == "process.stopped" for e in events)
