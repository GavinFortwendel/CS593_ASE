from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.config import DATABASE_URL

# FastAPI runs sync endpoints in a threadpool, so a connection may be used from a thread other
# than the one that created it. Each request gets its own session, so disabling SQLite's
# same-thread check is safe here.
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Import models so they register on Base.metadata before create_all.
    from backend import models  # noqa: F401

    # create_all only creates missing tables; it never alters existing ones (no migrations).
    Base.metadata.create_all(engine)
