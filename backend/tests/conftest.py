"""Shared fixtures: an isolated in-memory database, a TestClient, and network mocks.

DATABASE_URL, OPENAI_API_KEY and SEMANTIC_SCHOLAR_API_KEY are set by pytest-env (see pytest.ini)
before this file imports the app, so backend.config never sees the real .env values.
"""

from collections.abc import Callable, Iterator

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from backend import models  # noqa: F401  (registers tables on Base.metadata)
from backend.database import Base, get_db
from backend.main import app
from backend.models import SavedPaper
from backend.services import llm, paper_text, semantic_scholar
from helpers import FakeHTTP, FakeOpenAI, patched_httpx


# --------------------------------------------------------------------------- safety nets


@pytest.fixture(autouse=True)
def no_real_network(monkeypatch):
    """Fail any request that would leave the machine.

    Only the real transports are blocked. MockTransport and TestClient's in-process transport
    are separate classes, so mocked calls and API calls to the app still work.
    """

    def blocked(self, request, *args, **kwargs):
        raise RuntimeError(f"Real network access attempted in a test: {request.url}")

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", blocked)
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", blocked)
    try:
        import httpx2

        monkeypatch.setattr(httpx2.HTTPTransport, "handle_request", blocked)
        monkeypatch.setattr(httpx2.AsyncHTTPTransport, "handle_async_request", blocked)
    except (ImportError, AttributeError):
        pass


@pytest.fixture(autouse=True)
def reset_openai_client(monkeypatch):
    """llm caches its OpenAI client in a module global; never let one leak between tests."""
    monkeypatch.setattr(llm, "_client", None)


# --------------------------------------------------------------------------- database


@pytest.fixture
def engine():
    # sqlite:// is in-memory. By default every pooled connection gets its own, empty, memory DB,
    # and TestClient runs sync endpoints on worker threads, so tables created here would be
    # invisible to the request. StaticPool hands every session the same single connection.
    eng = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def session_factory(engine) -> sessionmaker:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture
def db(session_factory) -> Iterator[Session]:
    session = session_factory()
    yield session
    session.close()


@pytest.fixture
def client(session_factory) -> Iterator[TestClient]:
    def override_get_db() -> Iterator[Session]:
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    # raise_server_exceptions=False: an unhandled error becomes a 500 response, as in production,
    # so tests can assert on the status code the browser would actually see.
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def seed(session_factory) -> Callable[..., SavedPaper]:
    """Insert a library row directly, bypassing the API."""

    def _seed(**fields) -> SavedPaper:
        defaults = dict(
            paper_id="seed-1",
            source="semantic_scholar",
            title="Seeded Paper",
            authors=["Ada Lovelace"],
            year=2020,
            abstract=None,
            url=None,
            pdf_url=None,
            full_text=None,
        )
        defaults.update(fields)
        with session_factory() as session:
            row = SavedPaper(**defaults)
            session.add(row)
            session.commit()
            return row

    return _seed


@pytest.fixture
def get_row(session_factory) -> Callable[[str], SavedPaper | None]:
    """Read a row with a fresh session, so the result reflects what was actually committed."""

    def _get(paper_id: str) -> SavedPaper | None:
        with session_factory() as session:
            return session.get(SavedPaper, paper_id)

    return _get


@pytest.fixture
def row_count(session_factory) -> Callable[[], int]:
    def _count() -> int:
        with session_factory() as session:
            return session.query(SavedPaper).count()

    return _count


# --------------------------------------------------------------------------- external services


@pytest.fixture
def s2(monkeypatch) -> FakeHTTP:
    """Mock Semantic Scholar. Retry back-off sleeps are recorded in `.sleeps` instead of waited."""
    fake = FakeHTTP()
    monkeypatch.setattr(semantic_scholar, "httpx", patched_httpx("AsyncClient", fake))

    async def fake_sleep(seconds: float) -> None:
        fake.sleeps.append(seconds)

    # Replace only this module's reference to asyncio, not asyncio.sleep globally.
    monkeypatch.setattr(semantic_scholar, "asyncio", type("asyncio", (), {"sleep": fake_sleep}))
    return fake


@pytest.fixture
def pdf_host(monkeypatch) -> FakeHTTP:
    """Mock the publisher site that open-access PDFs are downloaded from."""
    fake = FakeHTTP()
    monkeypatch.setattr(paper_text, "httpx", patched_httpx("Client", fake))
    return fake


@pytest.fixture
def fake_openai(monkeypatch) -> FakeOpenAI:
    """Mock OpenAI client returned by llm._get_client (so no API key is needed)."""
    fake = FakeOpenAI()
    monkeypatch.setattr(llm, "_get_client", lambda: fake)
    return fake
