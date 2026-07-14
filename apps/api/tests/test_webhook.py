"""Integration tests for the webhook endpoint (HTTP layer)."""

from __future__ import annotations


def test_webhook_ingests_signal(client):
    resp = client.post(
        "/api/v1/signals/webhook",
        json={
            "title": "Globex raised a Series A",
            "event": "funding.round.announced",
            "external_id": "provider:evt_abc",
            "company": {"name": "Globex", "domain": "globex.com"},
            "lead": {"full_name": "John Roe", "email": "john@globex.com"},
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["signal"]["signal_type"] == "funding_round"
    assert body["opportunity"] is not None
    assert "funding" in body["analyzers_applied"]


def test_webhook_rejects_invalid_json(client):
    resp = client.post(
        "/api/v1/signals/webhook",
        content=b"{not-json",
        headers={"content-type": "application/json"},
    )
    assert resp.status_code == 400


def test_webhook_validates_required_fields(client):
    resp = client.post("/api/v1/signals/webhook", json={"title": "missing event"})
    assert resp.status_code == 422


def test_list_and_get_signal(client):
    client.post(
        "/api/v1/signals/webhook",
        json={"title": "Hiring spree at Initech", "event": "hiring.posted"},
    )
    listed = client.get("/api/v1/signals").json()
    assert len(listed) >= 1

    signal_id = listed[0]["id"]
    single = client.get(f"/api/v1/signals/{signal_id}")
    assert single.status_code == 200
    assert single.json()["id"] == signal_id


def test_health_endpoint(client):
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
