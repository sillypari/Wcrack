import pytest
import pytest_asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from wcarck.db.models import Base, JobQueue
from wcarck.db.jobs import JobQueueOps
from wcarck.db.session import engine as global_engine, SessionLocal as GlobalSessionLocal

# Use an in-memory SQLite database for testing
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture
async def test_engine():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest_asyncio.fixture
async def db_session(test_engine):
    TestingSessionLocal = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)
    async with TestingSessionLocal() as session:
        yield session
        await session.rollback()

@pytest.mark.asyncio
async def test_job_queue_enqueue(db_session: AsyncSession):
    job = await JobQueueOps.enqueue_job(
        session=db_session,
        module_name="scan",
        handler_name="start_scan",
        params={"channel": 6}
    )
    await db_session.commit()
    
    assert job.id is not None
    assert job.status == "queued"
    assert job.module_name == "scan"
    assert job.params_json == {"channel": 6}

@pytest.mark.asyncio
async def test_job_queue_lifecycle(db_session: AsyncSession):
    # Enqueue a job
    await JobQueueOps.enqueue_job(
        session=db_session,
        module_name="deauth",
        handler_name="start_deauth",
        params={"bssid": "00:11:22:33:44:55"}
    )
    await db_session.commit()
    
    # Fetch it (marks as starting)
    job = await JobQueueOps.fetch_next_job(db_session)
    assert job is not None
    assert job.status == "starting"
    assert job.started_at is not None
    await db_session.commit()
    
    # Mark running
    await JobQueueOps.mark_running(db_session, job.id)
    await db_session.commit()
    await db_session.refresh(job)
    assert job.status == "running"
    
    # Mark completed
    await JobQueueOps.mark_completed(db_session, job.id)
    await db_session.commit()
    await db_session.refresh(job)
    assert job.status == "completed"
    assert job.ended_at is not None

@pytest.mark.asyncio
async def test_job_queue_priority(db_session: AsyncSession):
    # Enqueue multiple jobs
    await JobQueueOps.enqueue_job(db_session, "mod", "h", {}, priority=10)
    await JobQueueOps.enqueue_job(db_session, "mod", "h", {}, priority=100) # Highest priority
    await JobQueueOps.enqueue_job(db_session, "mod", "h", {}, priority=50)
    await db_session.commit()
    
    job1 = await JobQueueOps.fetch_next_job(db_session)
    await db_session.commit()
    assert job1.priority == 100
    
    job2 = await JobQueueOps.fetch_next_job(db_session)
    await db_session.commit()
    assert job2.priority == 50
    
    job3 = await JobQueueOps.fetch_next_job(db_session)
    await db_session.commit()
    assert job3.priority == 10
