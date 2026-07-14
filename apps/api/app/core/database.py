"""Database engine and session management.

This module owns the persistence infrastructure (SQLModel/SQLAlchemy engine and
session factory). It exposes a FastAPI-friendly dependency, :func:`get_session`,
so that endpoints and services receive a properly scoped session without ever
constructing the engine themselves (Dependency Inversion).

We use SQLModel because it combines SQLAlchemy's mature ORM with Pydantic's
validation, giving us a single source of truth for both the database schema and
the API-facing models.
"""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings


def _build_engine() -> Engine:
    """Create the SQLAlchemy engine.

    ``pool_pre_ping`` transparently recycles stale connections, which is
    important for managed Postgres instances that close idle connections. The
    engine is created once at import time and shared across the app.
    """
    connect_args: dict = {}
    return create_engine(
        settings.sqlalchemy_database_uri,
        echo=settings.DEBUG,
        pool_pre_ping=True,
        connect_args=connect_args,
    )


engine: Engine = _build_engine()


def init_db() -> None:
    """Create database tables for all registered SQLModel metadata.

    This is a convenience for local development and tests. In production, schema
    changes should be managed with migrations (Alembic) so that changes are
    versioned and reversible. Importing the models module here guarantees their
    tables are registered with the shared metadata before creation.
    """
    # Imported for the side effect of registering table metadata.
    import app.models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """Yield a transactional database session (FastAPI dependency).

    The session is closed automatically when the request finishes. Callers get a
    fresh session per request, which keeps units of work isolated and prevents
    accidental cross-request state leakage.
    """
    with Session(engine) as session:
        yield session
