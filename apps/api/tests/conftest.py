"""Pytest fixtures.

Tests run against an in-memory SQLite database so they are fast and hermetic —
no PostgreSQL required. The app's ``get_session`` dependency is overridden to use
the test engine, exercising the real code paths end-to-end.
"""

from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import app.models  # noqa: F401 - register table metadata
from app.core.database import get_session
from app.main import create_app


@pytest.fixture(name="engine")
def engine_fixture():
    """A shared in-memory SQLite engine for the test session."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # keep one connection so the in-memory DB persists
    )
    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="session")
def session_fixture(engine) -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(engine) -> Generator[TestClient, None, None]:
    """A FastAPI test client wired to the in-memory database."""

    def _get_session_override() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = _get_session_override
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
