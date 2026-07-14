"""Reusable FastAPI dependencies.

Centralizing dependency providers keeps endpoints thin and makes wiring explicit.
Endpoints declare what they need (a session, the engine) and FastAPI injects it —
a clean application of Dependency Injection.
"""

from __future__ import annotations

from collections.abc import Generator

from fastapi import Depends
from sqlmodel import Session

from app.core.database import get_session
from app.services.signal_engine import SignalEngine


def get_signal_engine(
    session: Session = Depends(get_session),
) -> Generator[SignalEngine, None, None]:
    """Provide a :class:`SignalEngine` bound to the request's DB session."""
    yield SignalEngine(session)
