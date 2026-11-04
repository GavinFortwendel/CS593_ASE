"""Tests for the real backend/database.py, which every other test replaces with a fixture.

This is safe for library.db: pytest-env sets DATABASE_URL=sqlite:///:memory: before backend.config
is imported, so the module's own engine is an in-memory database. Each test re-checks that before
touching the engine, and the last test checks that library.db really was not written.
"""

import os
from pathlib import Path

import pytest
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from backend import database
from backend.database import get_db, init_db
from backend.models import SavedPaper

LIBRARY_DB = Path(database.__file__).parent / "library.db"


@pytest.fixture(autouse=True)
def require_in_memory_engine():
    # Refuse to run if isolation ever breaks, rather than risk writing to the real library.
    assert database.engine.url.database == ":memory:", "app engine is not in-memory; aborting"


@pytest.fixture(scope="module", autouse=True)
def library_db_untouched():
    """Fail the module if library.db changed while these tests ran."""
    before = LIBRARY_DB.stat().st_mtime_ns if LIBRARY_DB.exists() else None
    yield
    after = LIBRARY_DB.stat().st_mtime_ns if LIBRARY_DB.exists() else None
    assert after == before, "library.db was modified by the database tests"


def test_get_db_yields_a_session_bound_to_the_app_engine():
    gen = get_db()
    db = next(gen)
    try:
        assert isinstance(db, Session)
        assert db.get_bind() is database.engine
    finally:
        gen.close()


def test_get_db_gives_each_request_its_own_session():
    first_gen, second_gen = get_db(), get_db()
    try:
        assert next(first_gen) is not next(second_gen)
    finally:
        first_gen.close()
        second_gen.close()


def test_get_db_closes_the_session_after_the_request(mocker):
    gen = get_db()
    db = next(gen)
    close = mocker.spy(db, "close")

    with pytest.raises(StopIteration):
        next(gen)  # FastAPI resumes the generator once the response is sent

    close.assert_called_once()


def test_get_db_closes_the_session_when_the_request_fails(mocker):
    gen = get_db()
    db = next(gen)
    close = mocker.spy(db, "close")

    # FastAPI throws the endpoint's exception into the dependency generator.
    with pytest.raises(RuntimeError, match="endpoint failed"):
        gen.throw(RuntimeError("endpoint failed"))

    close.assert_called_once()


def test_init_db_creates_the_papers_table_and_get_db_can_use_it():
    init_db()
    init_db()  # idempotent: create_all skips existing tables

    assert "papers" in inspect(database.engine).get_table_names()
    columns = {c["name"] for c in inspect(database.engine).get_columns("papers")}
    assert columns == {
        "paper_id", "source", "title", "authors", "year", "abstract", "url", "pdf_url", "full_text", "saved_at",
    }

    gen = get_db()
    db = next(gen)
    try:
        db.add(SavedPaper(paper_id="db-test", title="T", authors=["A B"]))
        db.commit()
        assert db.scalars(select(SavedPaper.paper_id)).all() == ["db-test"]
        db.delete(db.get(SavedPaper, "db-test"))
        db.commit()
    finally:
        gen.close()


def test_database_url_comes_from_the_environment():
    assert os.environ["DATABASE_URL"] == "sqlite:///:memory:"
    # Compare parts: str(url) percent-encodes the colons in SQLAlchemy 2.1 ("%3Amemory%3A").
    assert database.engine.url.get_backend_name() == "sqlite"
    assert database.engine.url.database == ":memory:"
