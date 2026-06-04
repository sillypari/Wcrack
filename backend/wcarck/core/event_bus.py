import asyncio
from collections import deque
from typing import AsyncGenerator, Any
import time

class EventBus:
    """
    Central event bus for Wcarck control plane.
    Provides fan-out pub/sub and a ring buffer for historical events (the F5 problem fix).
    """

    def __init__(self, history_size: int = 100000):
        self._subscribers: set[asyncio.Queue] = set()
        self._history: deque = deque(maxlen=history_size)
        self._sequence_id: int = 0

    def publish(self, topic: str, payload: dict[str, Any] | None = None) -> None:
        """
        Publish an event to all subscribers and append to the ring buffer.
        """
        self._sequence_id += 1
        event = {
            "seq": self._sequence_id,
            "topic": topic,
            "ts_mono": time.monotonic(),
            "payload": payload or {}
        }
        
        self._history.append(event)

        # Fan-out to all subscribers
        # We don't want to block the publisher if a subscriber is slow.
        # Queues are created with maxsize to prevent infinite growth.
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # If a subscriber's queue is full, they are lagging too much.
                # Drop the event for them. They can recover via get_history().
                pass

    async def subscribe(self, max_queue_size: int = 500) -> AsyncGenerator[dict[str, Any], None]:
        """
        Subscribe to the event bus. Yields events as they arrive.
        """
        queue = asyncio.Queue(maxsize=max_queue_size)
        self._subscribers.add(queue)
        
        try:
            while True:
                event = await queue.get()
                yield event
        finally:
            self._subscribers.discard(queue)

    def get_history(self, since_seq: int = 0) -> list[dict[str, Any]]:
        """
        Return all events in the ring buffer with sequence ID > since_seq.
        Used by the UI to replay missed events after a WebSocket reconnect.
        """
        return [e for e in self._history if e["seq"] > since_seq]

# Global instance for the application
bus = EventBus()
