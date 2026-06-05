import asyncio
import threading
from collections import deque
from typing import AsyncGenerator, Any
import time

class EventBus:
    """
    Central event bus for Wcarck control plane.
    Provides fan-out pub/sub and a ring buffer for historical events (the F5 problem fix).

    Thread-safety: publish() may be called from executor threads (e.g. scanner CSV parsing),
    so all shared state is guarded by a threading.Lock. asyncio.Queue.put_nowait() is
    documented as thread-safe in CPython.
    """

    def __init__(self, history_size: int = 100000):
        self._subscribers: set[asyncio.Queue] = set()
        self._history: deque = deque(maxlen=history_size)
        self._dlq: deque = deque(maxlen=1000)  # Dead Letter Queue for dropped events
        self._sequence_id: int = 0
        self._lock = threading.Lock()  # Guards _subscribers, _history, _sequence_id

    def publish(self, topic: str, payload: dict[str, Any] | None = None) -> None:
        """
        Publish an event to all subscribers and append to the ring buffer.
        Thread-safe: can be called from run_in_executor threads.
        """
        with self._lock:
            self._sequence_id += 1
            event = {
                "seq": self._sequence_id,
                "topic": topic,
                "ts_mono": time.monotonic(),
                "payload": payload or {}
            }

            self._history.append(event)

            # Fan-out to all subscribers
            # asyncio.Queue.put_nowait is thread-safe in CPython.
            for queue in list(self._subscribers):
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    # Drop event for this lagging subscriber but keep them subscribed.
                    # Evicting would permanently disconnect them from the bus.
                    self._dlq.append(event)

    async def subscribe(self, max_queue_size: int = 500) -> AsyncGenerator[dict[str, Any], None]:
        """
        Subscribe to the event bus. Yields events as they arrive.
        """
        queue = asyncio.Queue(maxsize=max_queue_size)
        with self._lock:
            self._subscribers.add(queue)

        try:
            while True:
                event = await queue.get()
                yield event
        finally:
            with self._lock:
                self._subscribers.discard(queue)

    def get_history(self, since_seq: int = 0) -> list[dict[str, Any]]:
        """
        Return all events in the ring buffer with sequence ID > since_seq.
        Used by the UI to replay missed events after a WebSocket reconnect.
        """
        with self._lock:
            return [e for e in self._history if e["seq"] > since_seq]

# Global instance for the application
bus = EventBus()
