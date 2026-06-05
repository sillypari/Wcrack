"""
WebSocket Hub — normalizes EventBus events into LogEntry-compatible format
before sending to the frontend.

The EventBus emits raw: {seq, topic, ts_mono, payload}
The frontend expects:   {id, seq, timestamp, level, channel, event_type, message, ...}

This hub does the transformation so the Logs page works.
"""

import asyncio
import time
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Optional
from wcarck.core.event_bus import bus
import structlog

logger = structlog.get_logger()
router = APIRouter()


# ------------------------------------------------------------------ #
# Topic → Level / Channel mapping
# ------------------------------------------------------------------ #

_TOPIC_LEVEL_MAP = {
    "network.discovered": "INFO",
    "network.updated": "DEBUG",
    "client.discovered": "INFO",
    "client.updated": "DEBUG",
    "adapter.discovered": "INFO",
    "adapter.mode_changed": "INFO",
    "adapter.monitor_started": "INFO",
    "adapter.monitor_stopped": "INFO",
    "adapter.airmon_check_kill": "INFO",
    "adapter.gone": "WARN",
    "adapter.flaky_usb": "WARN",
    "adapter.refresh_requested": "INFO",
    "module.started": "INFO",
    "module.stopped": "INFO",
    "module.error": "ERROR",
    "job.stop_requested": "INFO",
    "scan.stale": "WARN",
    "capture.handshake.eapol_m2": "INFO",
    "capture.handshake.eapol_m3": "INFO",
    "capture.handshake.eapol_m4": "INFO",
    "credential.captured": "WARN",
    "process.started": "DEBUG",
    "process.stopped": "DEBUG",
    "process.stdout": "DEBUG",
    "process.stderr": "WARN",
    "process.info": "INFO",
    "system.disk_low": "WARN",
    "system.disk_full": "ERROR",
    "system.clock_skew": "WARN",
    "project.activated": "INFO",
    "rf.log": "INFO",
}

_TOPIC_CHANNEL_MAP = {
    "network.": "RF",
    "client.": "RF",
    "capture.": "RF",
    "credential.": "RF",
    "scan.": "RF",
    "rf.": "RF",
    "adapter.": "System",
    "system.": "System",
    "module.": "Process",
    "job.": "Process",
    "process.": "Process",
    "project.": "DB",
}


def _infer_level(topic: str, payload: dict) -> str:
    if payload.get("level"):
        return payload["level"].upper()
    return _TOPIC_LEVEL_MAP.get(topic, "INFO")


def _infer_channel(topic: str) -> str:
    for prefix, channel in _TOPIC_CHANNEL_MAP.items():
        if topic.startswith(prefix):
            return channel
    return "System"


def _humanize(topic: str, payload: dict) -> str:
    """Generate a human-readable message from topic + payload."""
    # Use message from payload if present
    if payload.get("message"):
        return payload["message"]

    # Topic-specific formatters
    if topic == "network.discovered":
        ssid = payload.get("ssid") or "(hidden)"
        bssid = payload.get("bssid", "")
        ch = payload.get("channel", "?")
        enc = payload.get("encryption", "")
        pwr = payload.get("signal_dbm") or payload.get("power", "?")
        return f"AP: {ssid!r} [{bssid}] Ch={ch} {enc} {pwr}dBm"
    
    if topic == "client.discovered":
        mac = payload.get("mac", "")
        bssid = payload.get("bssid") or "(not assoc)"
        pwr = payload.get("signal_dbm") or payload.get("power", "?")
        return f"Station: {mac} → {bssid} {pwr}dBm"

    if topic == "adapter.mode_changed":
        return f"Adapter {payload.get('iface', '')} mode: {payload.get('prev_mode', '?')} → {payload.get('mode', '?')}"

    if topic == "adapter.gone":
        return f"Adapter {payload.get('iface', '')} disconnected"

    if topic == "module.started":
        return f"Module {payload.get('module', '')} started (job #{payload.get('job_id', '?')})"

    if topic == "module.stopped":
        return f"Module {payload.get('module', '')} stopped (job #{payload.get('job_id', '?')})"

    if topic in ("capture.handshake.eapol_m2", "capture.handshake.eapol_m3", "capture.handshake.eapol_m4"):
        frame = topic.split("_")[-1].upper()
        return f"EAPOL {frame} captured for {payload.get('ssid', payload.get('bssid', '?'))}"

    if topic == "credential.captured":
        return f"Credential captured: {payload.get('ssid', '')} ({payload.get('type', '')})"

    if topic == "process.stdout":
        return payload.get("line", "")

    if topic == "process.stderr":
        return f"STDERR: {payload.get('line', '')}"

    if topic == "scan.stale":
        return f"Scan stale: no data for {payload.get('seconds', '?')}s — is adapter in monitor mode?"

    if topic == "job.stop_requested":
        return f"Stop requested for job #{payload.get('job_id', '?')}"

    if topic == "project.activated":
        return f"Project activated: #{payload.get('project_id', '?')}"

    if topic == "system.disk_low":
        return f"Low disk space: {payload.get('free_mb', '?')}MB remaining"

    # Generic fallback
    parts = []
    for k, v in payload.items():
        if k not in ("job_id", "seq", "ts", "level", "message", "channel"):
            parts.append(f"{k}={v}")
    suffix = " ".join(parts[:3])
    return f"{topic}: {suffix}" if suffix else topic


def normalize_event(event: dict) -> dict:
    """
    Transform a raw bus event into a frontend-compatible LogEntry dict.
    """
    payload = event.get("payload", {}) or {}
    topic = event.get("topic", "unknown")
    seq = event.get("seq", 0)
    ts_mono = event.get("ts_mono", 0)

    # Use wall clock time (monotonic offset from start isn't meaningful for display)
    wall_ts_ms = time.time() * 1000

    return {
        "id": str(seq),
        "seq": seq,
        "timestamp": wall_ts_ms,
        "ts": datetime.now(timezone.utc).isoformat(),
        "level": _infer_level(topic, payload),
        "channel": _infer_channel(topic),
        "event_type": topic,
        "message": _humanize(topic, payload),
        "job_id": str(payload["job_id"]) if payload.get("job_id") is not None else None,
        "mac_address": (
            payload.get("bssid") or payload.get("mac") or
            payload.get("client_mac") or payload.get("station_mac")
        ),
        "adapter_iface": payload.get("iface"),
        "payload": payload,
        "stack_trace": None,
        "session_id": "live",
    }


# ------------------------------------------------------------------ #
# WebSocket endpoint
# ------------------------------------------------------------------ #

@router.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Send historical events (normalized) to solve the F5 problem
    # Only send events the client hasn't seen yet (since_seq from request)
    try:
        # Wait for the client's request_history message with fromSeq
        from_seq = 0
        try:
            init_msg = await asyncio.wait_for(websocket.receive_json(), timeout=5.0)
            if init_msg.get("type") == "request_history":
                from_seq = init_msg.get("fromSeq", 0)
        except (asyncio.TimeoutError, Exception):
            pass  # No history request, send from 0
        
        history = bus.get_history(since_seq=from_seq)
        if history:
            normalized_history = [normalize_event(e) for e in history]
            await websocket.send_json({
                "type": "history_sync",
                "events": normalized_history
            })
    except Exception as e:
        logger.error("Failed to send history", error=str(e))
        try:
            await websocket.close()
        except Exception:
            pass
        return

    # Subscribe to live events and stream normalized events
    event_stream = bus.subscribe(max_queue_size=5000)
    
    try:
        async for event in event_stream:
            try:
                normalized = normalize_event(event)
                await websocket.send_json({
                    "type": "event",
                    "event": normalized
                })
            except Exception:
                break
    except asyncio.CancelledError:
        pass
    except WebSocketDisconnect:
        logger.info("Client disconnected from WebSocket")
    finally:
        # Explicitly close the async generator to release subscriber queue
        try:
            await event_stream.aclose()
        except Exception:
            pass
        try:
            await websocket.close()
        except RuntimeError:
            pass
