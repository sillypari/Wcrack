# Wcrack Simulator Reference & Removal Guide

This document explains the design, components, and integration touchpoints of the decoupled simulation mode in Wcrack. It is designed to be fully self-contained so it can be safely and completely removed in the future without interfering with Linux production code.

---

## 🛠️ Design Philosophy
The simulator is designed to allow developers to build, test, and audit Wcrack’s visual interface on non-Linux environments (such as Windows or macOS) where wireless injection binaries (`airodump-ng`, `aireplay-ng`, `hostapd`, etc.) are not available and root access is not present. 

The simulator achieves this by:
1. **Lifecycle Decoupling**: Starting a background simulator daemon (`WcarckSimulator`) that listens to module activation events published on the central `EventBus` (`bus`).
2. **Environment Auto-Detection**: Automatically activating if `os.name == 'nt'` (Windows) or if the `WCARCK_SIMULATE=1` environment variable is set.
3. **Mock Executables**: Bypassing command execution inside hardware process wrappers when running on Windows.

---

## 📂 File Mappings & Integration Touchpoints

If you wish to remove the simulator completely, delete or revert the code in the following locations:

### 1. Backend Simulator Core
* **File to Delete**:
  * [backend/wcarck/core/simulator.py](file:///c:/Users/Parikshit/Desktop/NewGenApps/Wcrack/backend/wcarck/core/simulator.py)
* **What it does**: Holds the entire `WcarckSimulator` loop daemon, which simulates airodump scans, deauth handshakes, Evil Twin portal credentials, and Hashcat progress updates.

### 2. Main Entrypoint & Routes
* **File to Modify**:
  * [backend/wcarck/main.py](file:///c:/Users/Parikshit/Desktop/NewGenApps/Wcrack/backend/wcarck/main.py)
* **What to revert**:
  * Remove the import and startup of the simulator daemon in the `lifespan` context:
    ```python
    # REMOVE THIS BLOCK
    is_simulation_mode = (os.name == 'nt' or os.environ.get("WCARCK_SIMULATE") == '1')
    if is_simulation_mode:
        from wcarck.core.simulator import simulator
        simulator.start()
    ```
  * Remove the GET and POST routes for querying and toggling simulator status:
    ```python
    # REMOVE THESE ROUTES
    @app.get("/api/simulator/status")
    @app.post("/api/simulator/toggle")
    ```

### 3. API Unit Tests
* **File to Modify**:
  * [backend/tests/unit/test_api.py](file:///c:/Users/Parikshit/Desktop/NewGenApps/Wcrack/backend/tests/unit/test_api.py)
* **What to remove**:
  * Delete `test_simulator_toggle()` unit test at the bottom of the file.

### 4. Process Bypasses in Hardware Modules
To prevent crashing when calling command-line binaries on Windows, modules fallback to dummy python commands:
* **Files to Revert**:
  * [backend/wcarck/modules/recon/scanner.py](file:///c:/Users/Parikshit/Desktop/NewGenApps/Wcrack/backend/wcarck/modules/recon/scanner.py): Revert the Windows CSV generator fallback in `_tail_csv()` and `cmd` override.
  * [backend/wcarck/modules/attack/deauth.py](file:///c:/Users/Parikshit/Desktop/NewGenApps/Wcrack/backend/wcarck/modules/attack/deauth.py): Revert the Windows cmd override inside `_burst_loop()`.
  * [backend/wcarck/modules/attack/pmkid.py](file:///c:/Users/Parikshit/Desktop/NewGenApps/Wcrack/backend/wcarck/modules/attack/pmkid.py): Revert the Windows command bypass inside `start()`.
  * [backend/wcarck/modules/attack/eviltwin.py](file:///c:/Users/Parikshit/Desktop/NewGenApps/Wcrack/backend/wcarck/modules/attack/eviltwin.py): Revert the Windows process overrides.

---

## 🎨 Frontend UI Integrations

If you remove the simulator backend, you should clean up the frontend UI to remove the toggles and state selectors:

### 1. Frontend Store
* **File to Modify**:
  * [frontend/src/store/useWcarckStore.ts](file:///c:/Users/Parikshit/Desktop/NewGenApps/Wcrack/frontend/src/store/useWcarckStore.ts)
* **What to revert**:
  * Remove `simulatorRunning` state from `SystemState` interface and initial state.
  * Remove `fetchSimulatorStatus()` and `toggleSimulator()` methods from the `WcarckStore` interface and implementation.
  * Revert `module.started` and `module.stopped` mappings in `processEvent` if backend returns to native `job.started` events.

### 2. Topbar Toggle Button
* **File to Modify**:
  * [frontend/src/components/layout/Topbar.tsx](file:///c:/Users/Parikshit/Desktop/NewGenApps/Wcrack/frontend/src/components/layout/Topbar.tsx)
* **What to revert**:
  * Remove `simulatorRunning` and `toggleSimulator` variables from `useWcarckStore()`.
  * Remove the `Cpu` icon Button component (Simulation mode toggle) from the header markup (lines 131–145).

### 3. Dashboard Adapter Controls (Optional)
* **File to Modify**:
  * [frontend/src/pages/Dashboard.tsx](file:///c:/Users/Parikshit/Desktop/NewGenApps/Wcrack/frontend/src/pages/Dashboard.tsx)
* **What to revert**:
  * Revert the `AdapterRow` component back to a static list button if you prefer starting scans only from the *Reconnaissance* page.

---

## 🚮 Complete Removal Checklist

To fully wipe the simulator from the codebase, run these steps:
1. Delete `backend/wcarck/core/simulator.py`.
2. Edit `backend/wcarck/main.py` to remove the status/toggle routes and the lifespan startup hook.
3. Edit `backend/tests/unit/test_api.py` to remove `test_simulator_toggle`.
4. Delete `simulatorRunning` and the toggle actions inside `frontend/src/store/useWcarckStore.ts`.
5. Remove the `Cpu` button from the navbar in `frontend/src/components/layout/Topbar.tsx`.
6. Run backend verification tests: `.venv/Scripts/python -m pytest` inside `/backend` to check for clean passes.
7. Run frontend asset bundling: `npm run build` inside `/frontend` to verify compile safety.
