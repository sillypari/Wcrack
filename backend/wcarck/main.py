from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from wcarck.api.hub import router as hub_router
from wcarck.api.jobs import router as jobs_router
from wcarck.api.network import router as network_router
from wcarck.api.adapters import router as adapters_router
from wcarck.api.captures import router as captures_router
from wcarck.api.credentials import router as credentials_router
from wcarck.api.report import router as report_router
from wcarck.api.projects import router as projects_router
from wcarck.db.session import init_db, run_wal_checkpoint_task
from wcarck.db.listener import db_listener
from wcarck.orchestration.leases import RadioLeaseManager
from wcarck.orchestration.worker import JobWorker
from wcarck.modules.session_log.async_writer import AsyncLogWriter
from wcarck.core.event_bus import bus
from wcarck.core.system import SystemOrchestrator
from wcarck.hardware.adapter import AdapterWatchdog
import os
import asyncio
from contextlib import asynccontextmanager
import structlog

# Setup logging
structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ]
)
logger = structlog.get_logger()

# Global singletons
sys_orchestrator = SystemOrchestrator()
lease_manager = RadioLeaseManager()
job_worker = JobWorker(lease_manager)
log_writer = AsyncLogWriter()
watchdog = AdapterWatchdog()
wal_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # System init
    await sys_orchestrator.start()
    
    # Init DB
    await init_db()
    
    # Start WAL task
    wal_task = asyncio.create_task(run_wal_checkpoint_task())
    
    # Start DB buffered writer
    db_listener.start()
    
    # Setup Radio Lease Manager & Adapter Watchdog
    await lease_manager.start_sweeper()
    await watchdog.start()
    
    await log_writer.start("system", {})
    await job_worker.start()
    
    # Start simulator if Windows or ENV flag set
    is_simulation_mode = (os.name == 'nt' or os.environ.get("WCARCK_SIMULATE") == '1')
    if is_simulation_mode:
        from wcarck.core.simulator import simulator
        simulator.start()
        logger.info("Simulator activated for development/Windows environment")
        
    yield
    # Shutdown
    if is_simulation_mode:
        from wcarck.core.simulator import simulator
        await simulator.stop()
        
    await db_listener.stop()
    await sys_orchestrator.stop()
    await watchdog.stop()
    await job_worker.stop()
    await log_writer.stop("system")
    await lease_manager.stop_sweeper()
    if wal_task:
        wal_task.cancel()
        try:
            await wal_task
        except asyncio.CancelledError:
            pass

app = FastAPI(title="Wcarck API", version="0.1.0", lifespan=lifespan)

# CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(hub_router)
app.include_router(jobs_router)
app.include_router(network_router)
app.include_router(adapters_router)
app.include_router(captures_router)
app.include_router(credentials_router)
app.include_router(report_router)
app.include_router(projects_router)

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

@app.get("/api/simulator/status")
async def get_simulator_status():
    from wcarck.core.simulator import simulator
    return {"status": "running" if simulator._running else "stopped"}

@app.post("/api/simulator/toggle")
async def toggle_simulator():
    from wcarck.core.simulator import simulator
    if simulator._running:
        await simulator.stop()
    else:
        simulator.start()
    return {"status": "running" if simulator._running else "stopped"}
