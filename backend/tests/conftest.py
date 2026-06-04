import pytest
import asyncio
from wcarck.db.session import init_db

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    # Initialize database tables and seed default data before tests run
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    loop.run_until_complete(init_db())
    yield
