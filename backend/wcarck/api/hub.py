import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Optional
from wcarck.core.event_bus import bus
import structlog

logger = structlog.get_logger()
router = APIRouter()

@router.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Send historical events first to solve the F5 problem
    try:
        history = bus.get_history()
        if history:
            await websocket.send_json({
                "type": "history_sync",
                "events": history
            })
    except Exception as e:
        logger.error("Failed to send history", error=str(e))
        await websocket.close()
        return

    # Subscribe to live events
    event_stream = bus.subscribe(max_queue_size=1000)
    
    try:
        async for event in event_stream:
            try:
                await websocket.send_json({
                    "type": "event",
                    "event": event
                })
            except Exception:
                # Disconnected or failed to send
                break
    except asyncio.CancelledError:
        pass
    except WebSocketDisconnect:
        logger.info("Client disconnected from WebSocket")
    finally:
        # Cleanup
        try:
            await websocket.close()
        except RuntimeError:
            pass
