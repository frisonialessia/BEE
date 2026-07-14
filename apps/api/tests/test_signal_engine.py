"""Unit tests for the Signal Engine and its analyzers.

These exercise the domain logic directly (no HTTP), verifying classification,
scoring, opportunity generation, idempotency, and the extensibility contract.
"""

from __future__ import annotations

from app.models.base import SignalType
from app.schemas.signal import CompanyRef, LeadRef, SignalWebhookIn
from app.services.signal_engine import SignalEngine
from app.services.signal_engine.analyzers import get_analyzers


def _funding_payload(**overrides) -> SignalWebhookIn:
    base = {
        "title": "Acme Corp raised a $20M Series B",
        "event": "funding.round.announced",
        "external_id": "provider:evt_123",
        "company": CompanyRef(name="Acme Corp", domain="acme.com"),
        "lead": LeadRef(full_name="Jane Doe", email="jane@acme.com", title="VP Sales"),
    }
    base.update(overrides)
    return SignalWebhookIn(**base)


def test_funding_signal_is_classified_and_scored(session):
    engine = SignalEngine(session)
    outcome = engine.ingest(_funding_payload())

    assert outcome.signal.signal_type == SignalType.FUNDING_ROUND
    # Series B should score at the higher end.
    assert outcome.signal.score >= 80
    assert "funding" in outcome.analyzers_applied
    assert outcome.deduplicated is False


def test_funding_signal_generates_opportunity(session):
    engine = SignalEngine(session)
    outcome = engine.ingest(_funding_payload())

    assert outcome.opportunity is not None
    assert outcome.opportunity.signal_id == outcome.signal.id
    assert outcome.opportunity.lead_id == outcome.signal.lead_id
    assert outcome.opportunity.strategy.get("playbook") == "post_funding_outreach"


def test_entity_resolution_creates_company_and_lead(session):
    engine = SignalEngine(session)
    outcome = engine.ingest(_funding_payload())

    assert outcome.signal.company_id is not None
    assert outcome.signal.lead_id is not None


def test_ingestion_is_idempotent_by_external_id(session):
    engine = SignalEngine(session)
    first = engine.ingest(_funding_payload())
    second = engine.ingest(_funding_payload())

    assert second.deduplicated is True
    assert second.signal.id == first.signal.id


def test_unknown_event_falls_back_gracefully(session):
    engine = SignalEngine(session)
    payload = SignalWebhookIn(
        title="Something happened",
        event="misc.unknown",
        external_id="provider:evt_999",
    )
    outcome = engine.ingest(payload)

    # The fallback analyzer guarantees the signal is still captured.
    assert outcome.signal.signal_type == SignalType.OTHER
    assert "generic_fallback" in outcome.analyzers_applied
    # No strategy => no opportunity for an unclassified signal.
    assert outcome.opportunity is None


def test_builtin_analyzers_are_registered():
    names = {a.name for a in get_analyzers()}
    assert {"funding", "hiring", "tech_adoption", "generic_fallback"} <= names
