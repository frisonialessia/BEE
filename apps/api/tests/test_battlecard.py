"""Integration tests for the battlecard HTTP endpoint."""

from __future__ import annotations


def _ingest(client, ext_id: str = "bcard:001") -> dict:
    """Helper: ingest a funding signal and return the API response."""
    resp = client.post(
        "/api/v1/signals/webhook",
        json={
            "title": "Skynet raised a $50M Series C",
            "event": "funding.round.announced",
            "external_id": ext_id,
            "company": {"name": "Skynet", "domain": "skynet.io", "industry": "AI"},
            "lead": {
                "full_name": "Sarah Connor",
                "email": "sarah@skynet.io",
                "title": "CRO",
                "seniority": "c_level",
            },
            "data": {"amount_usd": 50_000_000, "round": "series_c"},
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_battlecard_returns_complete_structure(client):
    ingested = _ingest(client)
    opp = ingested["opportunity"]
    assert opp is not None, "Opportunity was not created"

    resp = client.get(f"/api/v1/opportunities/{opp['id']}/battlecard")
    assert resp.status_code == 200, resp.text

    bc = resp.json()
    # Top-level structure
    assert bc["opportunity_id"] == opp["id"]
    assert bc["ready_to_action"] is True
    assert bc["status"] == "ready_to_action"
    assert bc["opportunity_type"] == "new_logo"
    assert bc["score"] >= 80

    # Company context
    assert bc["company"]["name"] == "Skynet"
    assert bc["company"]["domain"] == "skynet.io"
    assert bc["company"]["industry"] == "AI"

    # Lead context
    assert bc["lead"]["full_name"] == "Sarah Connor"
    assert bc["lead"]["title"] == "CRO"

    # Signal context
    assert bc["signal"]["signal_type"] == "funding_round"
    assert "Skynet" in bc["signal"]["title"]

    # Strategy — the three mandatory CEO battlecard fields
    strategy = bc["strategy"]
    assert strategy["pain_point"], "pain_point must be non-empty"
    assert strategy["closing_argument"], "closing_argument must be non-empty"
    assert strategy["timing_window"]["urgency"] == "immediate"
    assert strategy["timing_window"]["reason"]
    assert strategy["generator"] == "funding_strategy"


def test_battlecard_404_for_missing_opportunity(client):
    resp = client.get("/api/v1/opportunities/00000000-0000-0000-0000-000000000000/battlecard")
    assert resp.status_code == 404


def test_battlecard_reflects_expansion_opportunity_type(client, session):
    """End-to-end: a second funding signal on a company that already has a
    WON opportunity gets classified as EXPANSION by RevenueContinuityService,
    and the battlecard endpoint surfaces it — not just OpportunityOut.

    Ingests through SignalEngine directly (same session fixture the
    battlecard GET request below shares via conftest.py's client
    override) rather than two webhook POSTs — POST /signals/webhook
    enqueues a background IngestionWorker task that, on a second POST in
    the same test, can get scheduled against the real (unreachable here)
    database engine instead of the test's in-memory one. A single GET
    (read-only, nothing queued) is all this test needs from ``client``.
    """
    from app.models.base import OpportunityStatus
    from app.schemas.signal import CompanyRef, SignalWebhookIn
    from app.services.signal_engine import SignalEngine

    engine = SignalEngine(session)
    domain = "skynet-expansion.io"
    first = engine.ingest(
        SignalWebhookIn(
            title="Skynet raised a $50M Series C",
            event="funding.round.announced",
            external_id="bcard:expansion-001",
            company=CompanyRef(name="Skynet", domain=domain),
            data={"amount_usd": 50_000_000, "round": "series_c"},
        )
    )
    first.opportunity.status = OpportunityStatus.WON
    session.add(first.opportunity)
    session.commit()

    second = engine.ingest(
        SignalWebhookIn(
            title="Skynet raised a $80M Series D",
            event="funding.round.announced",
            external_id="bcard:expansion-002",
            company=CompanyRef(name="Skynet", domain=domain),
            data={"amount_usd": 80_000_000, "round": "series_d"},
        )
    )
    assert second.opportunity.opportunity_type == "expansion"

    bc = client.get(f"/api/v1/opportunities/{second.opportunity.id}/battlecard").json()
    assert bc["opportunity_type"] == "expansion"
    assert bc["strategy"]["generator"] == "expansion_strategy"


def test_battlecard_strategy_enriched_flag_in_ingest_response(client):
    resp = client.post(
        "/api/v1/signals/webhook",
        json={
            "title": "TechCorp raised a seed round",
            "event": "funding.seed.announced",
            "external_id": "bcard:002",
            "company": {"name": "TechCorp", "domain": "techcorp.io"},
        },
    )
    body = resp.json()
    assert body["strategy_enriched"] is True


def test_list_opportunities_returns_ready_items(client):
    _ingest(client, "bcard:list-001")
    resp = client.get("/api/v1/opportunities")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) >= 1
    # All returned should be ready_to_action by default
    for item in items:
        assert item["status"] == "ready_to_action"
