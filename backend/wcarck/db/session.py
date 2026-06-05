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

from sqlalchemy import event

@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

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
        # If WAL is strangely large (>50MB) on startup, force truncate
        import sqlite3
        logger.warning(f"Large WAL file detected ({os.path.getsize(wal_path)} bytes) on startup. Forcing TRUNCATE.")
        def _sync_truncate():
            try:
                sync_conn = sqlite3.connect(db_path)
                sync_conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                sync_conn.close()
            except Exception as e:
                logger.error(f"Failed to truncate WAL: {e}")
        await asyncio.to_thread(_sync_truncate)

    while True:
        try:
            await asyncio.sleep(300) # Every 5 minutes
            async with engine.begin() as conn:
                await conn.execute(text("PRAGMA wal_checkpoint(PASSIVE);"))
        except asyncio.CancelledError:
            break
        except Exception:
            pass
