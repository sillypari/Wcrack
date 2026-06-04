import functools
from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
import structlog

logger = structlog.get_logger()

def with_error_boundary(func):
    """
    Standardized API error handler (Gap 4.1).
    Wraps FastAPI route handlers to uniformly catch database and runtime errors,
    log them, and translate them to proper HTTP 500 exceptions, avoiding
    repetitive try/except blocks in every route.
    """
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        from sqlalchemy.exc import IntegrityError
        try:
            return await func(*args, **kwargs)
        except HTTPException:
            raise  # Let FastAPI handle deliberate HTTP errors
        except IntegrityError as e:
            logger.warning("Database constraint violation in API", route=func.__name__, error=str(e))
            raise HTTPException(status_code=400, detail="Database constraint violation (e.g. duplicate entry)")
        except SQLAlchemyError as e:
            logger.error("Database error in API", route=func.__name__, error=str(e), exc_info=True)
            raise HTTPException(status_code=500, detail="Internal database error")
        except Exception as e:
            logger.error("Unhandled exception in API", route=func.__name__, error=str(e), exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")
    return wrapper
