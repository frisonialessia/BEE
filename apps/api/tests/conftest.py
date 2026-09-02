"""Pytest fixtures.

Tests run against an in-memory SQLite database so they are fast and hermetic —
no PostgreSQL required. The app's ``get_session`` dependency is overridden to use
the test engine, exercising the real code paths end-to-end.
"""

from __future__ import annotations

import uuid
from collections.abc import Generator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import app.models  # noqa: F401 - register table metadata
from app.core.config import settings as app_settings
from app.core.database import get_session
from app.main import create_app
from app.models.base import OpportunityStatus, SignalType
from app.models.company import Company
from app.models.lead import Lead
from app.models.opportunity import Opportunity
from app.models.signal import Signal, SignalSource


def _create_full_opportunity(session: Session) -> tuple[Company, Lead, Signal, Opportunity]:
    """Helper: create a complete Company → Lead → Signal → Opportunity chain.

    Used by tests that need a real persisted opportunity (e.g. outcome endpoint tests).
    Returns the four created entities.
    """
    company = Company(
        id=uuid.uuid4(),
        name="Test Corp",
        industry="SaaS",
        size="50-200",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    session.add(company)
    session.flush()

    lead = Lead(
        id=uuid.uuid4(),
        company_id=company.id,
        first_name="Jane",
        last_name="Doe",
        full_name="Jane Doe",
        email=f"jane.{uuid.uuid4().hex[:6]}@testcorp.com",
        title="VP Sales",
        seniority="vp",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    session.add(lead)
    session.flush()

    signal = Signal(
        id=uuid.uuid4(),
        company_id=company.id,
        signal_type=SignalType.FUNDING_ROUND,
        title="Test Corp raised $5M Series A",
        raw_payload={"amount": "5M", "round": "Series A"},
        source=SignalSource.WEBHOOK,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    session.add(signal)
    session.flush()

    opp = Opportunity(
        id=uuid.uuid4(),
        lead_id=lead.id,
        company_id=company.id,
        signal_id=signal.id,
        title="Test Opportunity",
        score=72.0,
        status=OpportunityStatus.READY_TO_ACTION,
        strategy={
            "generator": "rule_based_v1",
            "generator_version": "1.0.0",
            "signal_type": "funding_round",
            "playbook": "post_funding_outreach",
            "channel": "email",
            "pain_point": "Scaling pains post-funding",
            "closing_argument": "We solve scaling",
            "timing_window": "Next 30 days",
            "confidence_score": 0.85,
            "manual_review_required": False,
        },
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    session.add(opp)
    session.commit()
    session.refresh(opp)
    return company, lead, signal, opp


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
    # SignupGuard is a process-wide singleton (see app.core.signup_guard) —
    # without resetting it, a test file that calls POST /auth/register more
    # than SIGNUP_RATE_LIMIT_PER_HOUR times (the default is 5) starts
    # getting 429s from unrelated earlier tests' registrations.
    from app.core.password_reset_guard import reset_password_reset_guard
    from app.core.signup_guard import reset_signup_guard

    reset_signup_guard()
    # Same process-wide-singleton reasoning as reset_signup_guard() above,
    # for POST /auth/forgot-password's rate limiter.
    reset_password_reset_guard()
    # WEBHOOK_SIGNATURE_REQUIRED now defaults to True (secure-by-default in
    # production) — tests exercising /signals/webhook and /webhooks/receive
    # without computing a real signature are effectively running as "local
    # dev", so mirror that explicitly here instead of relying on the class
    # default. Restored after the test so this doesn't leak across the
    # session (the settings object is a process-wide singleton).
    original_required = app_settings.WEBHOOK_SIGNATURE_REQUIRED
    app_settings.WEBHOOK_SIGNATURE_REQUIRED = False
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app_settings.WEBHOOK_SIGNATURE_REQUIRED = original_required
        app.dependency_overrides.clear()
