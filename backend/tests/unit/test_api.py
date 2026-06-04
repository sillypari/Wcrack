import pytest
from fastapi.testclient import TestClient
from wcarck.main import app
from wcarck.core.event_bus import bus
import time

client = TestClient(app)

def test_websocket_history_and_live():
    # Publish an event before connecting
    bus.publish("test.event.historical", {"data": "old"})
    
    with client.websocket_connect("/ws/events") as websocket:
        # First message should be history sync
        data = websocket.receive_json()
        assert data["type"] == "history_sync"
        assert len(data["events"]) >= 1
        assert any(e["event_type"] == "test.event.historical" for e in data["events"])
        
        # Now publish a live event
        bus.publish("test.event.live", {"data": "new"})
        
        # Next message should be the live event
        data2 = websocket.receive_json()
        assert data2["type"] == "event"
        assert data2["event"]["event_type"] == "test.event.live"
