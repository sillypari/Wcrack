import asyncio
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text
import structlog

logger = structlog.get_logger()

# SQLite async driver
DB_URL = "sqlite+aiosqlite:////var/lib/wcarck/db.sqlite"

# Fallback for dev mode
import os
if not os.path.exists("/var/lib/wcarck"):
    DB_URL = f"sqlite+aiosqlite:///{os.path.join(os.getcwd(), 'db.sqlite')}"

engine = create_async_engine(
    DB_URL,
    echo=False,
    connect_args={
        "check_same_thread": False,
        "timeout": 15
    }
)

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

from sqlalchemy import text, select

async def init_db() -> None:
    """Initialize DB and configure WAL mode pragmas."""
    async with engine.begin() as conn:
        # PRAGMAs for high concurrency writes (WAL mode)
        await conn.execute(text("PRAGMA journal_mode=WAL;"))
        await conn.execute(text("PRAGMA busy_timeout=5000;")) # Wait up to 5s for lock
        await conn.execute(text("PRAGMA synchronous=NORMAL;"))
        await conn.execute(text("PRAGMA cache_size=-64000;")) # 64MB cache
        await conn.execute(text("PRAGMA foreign_keys=ON;"))
        
        # Create all tables (in real app, we'd use Alembic)
        from wcarck.db.models import Base
        await conn.run_sync(Base.metadata.create_all)

    # Seed default data if empty
    from wcarck.db.models import Project, Scope, Adapter
    async with SessionLocal() as session:
        # Check projects
        proj_stmt = select(Project)
        proj_res = await session.execute(proj_stmt)
        if not proj_res.scalars().first():
            default_proj = Project(
                name="Acme Wireless Audit",
                client="Acme Corp",
                notes="Baseline wireless audit for corporate headquarters.",
                active=True
            )
            session.add(default_proj)
            await session.flush()
            
            default_scope = Scope(
                name="Default Scope (Acme Wireless Audit)",
                notes="Auto-generated scope for project Acme Wireless Audit",
                allowed_bssids=["00:11:22:33:44:55", "AA:BB:CC:DD:EE:FF"],
                allowed_ssids=["Acme_Corporate", "Acme_Guest"],
                project_id=default_proj.id,
                active=True
            )
            session.add(default_scope)
            
        # Check adapters
        adapter_stmt = select(Adapter)
        adapter_res = await session.execute(adapter_stmt)
        if not adapter_res.scalars().first():
            mon_adapter = Adapter(
                mac="00:c0:ca:8b:21:11",
                iface_name="wlan_mon",
                chipset="RTP3070",
                driver="rt2800usb",
                current_mode="monitor",
                role="recon.scanner"
            )
            ap_adapter = Adapter(
                mac="00:c0:ca:8b:21:22",
                iface_name="wlan_ap",
                chipset="Atheros AR9271",
                driver="ath9k_htc",
                current_mode="managed",
                role="attack.eviltwin"
            )
            session.add(mon_adapter)
            session.add(ap_adapter)
            
        await session.commit()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for FastAPI endpoints."""
    async with SessionLocal() as session:
        yield session

async def run_wal_checkpoint_task():
    """
    Background task to explicitly force WAL compaction (PASSIVE mode).
    Prevents WAL starvation.
    """
    # Ensure the directory exists
    os.makedirs(os.path.dirname(DB_URL.replace("sqlite+aiosqlite:///", "")), exist_ok=True)
    
    # Optional DB recovery (Edge case 28.4 SQLite resilience)
    db_path = DB_URL.replace("sqlite+aiosqlite:///", "")
    wal_path = f"{db_path}-wal"
    if os.path.exists(wal_path) and os.path.getsize(wal_path) > 1024 * 1024 * 50:
        # If WAL is strangely large (> 50MB) on startup, force truncate
        import sqlite3
        logger.warning(f"Large WAL file detected ({os.path.getsize(wal_path)} bytes) on startup. Forcing TRUNCATE.")
        try:
            sync_conn = sqlite3.connect(db_path)
            sync_conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            sync_conn.close()
        except Exception as e:
            logger.error(f"Failed to truncate WAL: {e}")

    while True:
        try:
            await asyncio.sleep(300) # Every 5 minutes
            async with engine.begin() as conn:
                await conn.execute(text("PRAGMA wal_checkpoint(PASSIVE);"))
        except asyncio.CancelledError:
            break
        except Exception:
            pass
