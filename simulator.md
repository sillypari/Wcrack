# Wcarck Simulator Mode

This document outlines the architecture and usage of the Simulator Mode in Wcarck. It is intended for future reference and can be safely removed when the simulator is no longer needed.

## Architecture

Simulator Mode is a decoupled, event-driven subsystem designed to fake the physical layer (WiFi adapters, RF environment) and system processes (airodump-ng, hashcat) when running on non-Linux environments (e.g., Windows) or for development purposes.

The simulator lives in `backend/wcarck/core/simulator.py`. It works by tapping into the `EventBus`.

1. **Activation**: 
   - `simulator.start()` is called (either manually via the UI or automatically if Windows is detected).
   - This starts an `asyncio` task (`_event_listener`) that subscribes to the EventBus.
2. **Mock Hardware**:
   - The `/api/adapters` endpoint intercepts the request and injects mock adapter entries (`wlan_mon` and `wlan_ap`) into the HTTP response if the simulator is running.
3. **Event Interception**:
   - When the user starts a job (e.g., Recon Scan), the API enqueues a job and `JobWorker` publishes a `module.started` event.
   - The Simulator catches `module.started` and spawns a background mock loop (e.g., `_simulate_scanner`) that generates fake data.
   - The mock loop publishes the same `network.discovered`, `rf.log`, and `capture.*` events that the real hardware modules would emit.
4. **Deactivation**:
   - When `simulator.stop()` is called, all background mock loops are cancelled and the event listener is torn down.

## Modules Simulated

- **recon.scanner**: Generates fake APs and clients with randomized signal strengths and discovery times.
- **attack.deauth**: Simulates broadcasting deauth frames and emits `job.updated` with packet stats.
- **attack.pmkid**: Simulates capturing a PMKID handshake, writing a dummy `.pcapng` file to disk, and inserting a Capture record into the DB.
- **attack.eviltwin**: Simulates a rogue AP, client DNS requests, and portal credentials capture. Inserts a `Credential` record into the DB.
- **crack.hashcat**: Simulates a dictionary cracking job with progressing completion percentage, ultimately cracking the password and updating the `Credential` record.

## Removal Instructions

If you wish to fully remove Simulator Mode from the project:

1. **Delete**: `backend/wcarck/core/simulator.py`
2. **Remove API routes**: In `backend/wcarck/main.py`, remove the `/api/simulator/status` and `/api/simulator/toggle` endpoints. Also remove the auto-start logic inside `lifespan()`.
3. **Remove Mock Adapters**: In `backend/wcarck/api/adapters.py`, remove the injection of mock adapters in `list_adapters()`.
4. **Remove Frontend UI**: In `frontend/src/store/useWcarckStore.ts`, remove `simulatorRunning` and related actions. In `frontend/src/components/layout/Topbar.tsx`, remove the simulator Cpu toggle icon.
