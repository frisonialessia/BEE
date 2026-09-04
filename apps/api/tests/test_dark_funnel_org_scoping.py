"""Organization scoping for the Dark Funnel dashboard (hot leads).

Complements tests/test_org_api_keys.py — this covers the JWT-authenticated
dashboard path ("Simulate Signal" button) rather than the webhook/API-key
path, and the read endpoints' scoping.
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def _register(client: TestClient, *, org_name: str, email: str) -> dict:
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": org_name,
            "full_name": "Owner",
            "email": email,
            "password": "password123",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _simulate(client: TestClient, headers: dict, domain: str) -> None:
    resp = client.post(
        "/api/v1/dark-funnel/signals",
        json={"company_domain": domain, "signal_type": "pricing_view"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text


class TestDarkFunnelOrgScoping:
    def test_hot_leads_scoped_to_organization(self, client: TestClient):
        owner_a = _register(client, org_name="Org A", email="dfa@x.io")
        owner_b = _register(client, org_name="Org B", email="dfb@x.io")

        _simulate(client, _auth_headers(owner_a["access_token"]), "org-a-lead.com")
        _simulate(client, _auth_headers(owner_b["access_token"]), "org-b-lead.com")

        resp = client.get("/api/v1/dark-funnel/hot-leads", headers=_auth_headers(owner_a["access_token"]))
        domains = [lead["company_domain"] for lead in resp.json()]
        assert domains == ["org-a-lead.com"]

    def test_same_domain_two_orgs_get_independent_scores(self, client: TestClient):
        """hot_lead_scores.company_domain is unique per-org, not globally —
        two organizations tracking the same domain get independent rows."""
        owner_a = _register(client, org_name="Org C", email="dfc@x.io")
        owner_b = _register(client, org_name="Org D", email="dfd@x.io")

        _simulate(client, _auth_headers(owner_a["access_token"]), "shared-lead.com")
        _simulate(client, _auth_headers(owner_b["access_token"]), "shared-lead.com")
        _simulate(client, _auth_headers(owner_b["access_token"]), "shared-lead.com")  # 2nd signal for org B

        score_a = client.get(
            "/api/v1/dark-funnel/hot-leads/shared-lead.com", headers=_auth_headers(owner_a["access_token"])
        ).json()
        score_b = client.get(
            "/api/v1/dark-funnel/hot-leads/shared-lead.com", headers=_auth_headers(owner_b["access_token"])
        ).json()
        assert score_a["signal_count"] == 1
        assert score_b["signal_count"] == 2

    def test_summary_counts_scoped_to_organization(self, client: TestClient):
        owner_a = _register(client, org_name="Org E", email="dfe@x.io")
        owner_b = _register(client, org_name="Org F", email="dff@x.io")
        _simulate(client, _auth_headers(owner_a["access_token"]), "e-lead.com")

        summary_a = client.get(
            "/api/v1/dark-funnel/summary", headers=_auth_headers(owner_a["access_token"])
        ).json()
        summary_b = client.get(
            "/api/v1/dark-funnel/summary", headers=_auth_headers(owner_b["access_token"])
        ).json()
        assert summary_a["total_signals_today"] == 1
        assert summary_b["total_signals_today"] == 0

    def test_unauthenticated_call_unrestricted(self, client: TestClient):
        """No JWT and no org key -> same behavior as before org scoping
        existed (used by internal/system callers)."""
        resp = client.get("/api/v1/dark-funnel/hot-leads")
        assert resp.status_code == 200

    def test_domain_signals_scoped_to_organization(self, client: TestClient):
        owner_a = _register(client, org_name="Org G", email="dfg@x.io")
        owner_b = _register(client, org_name="Org H", email="dfh@x.io")
        _simulate(client, _auth_headers(owner_a["access_token"]), "shared2.com")
        _simulate(client, _auth_headers(owner_b["access_token"]), "shared2.com")

        signals_a = client.get(
            "/api/v1/dark-funnel/signals/shared2.com", headers=_auth_headers(owner_a["access_token"])
        ).json()
        assert len(signals_a) == 1

    def test_duplicate_external_id_is_deduplicated(self, client: TestClient):
        """A retried/replayed webhook delivery carrying the same external_id
        must not double-count into research_intensity_score — see
        DarkFunnelService.ingest_signal's idempotency contract."""
        owner = _register(client, org_name="Org I", email="dfi@x.io")
        headers = _auth_headers(owner["access_token"])

        payload = {
            "company_domain": "dedup-lead.com",
            "signal_type": "pricing_view",
            "external_id": "provider:evt_dedup_1",
        }
        first = client.post("/api/v1/dark-funnel/signals", json=payload, headers=headers)
        assert first.status_code == 201, first.text
        second = client.post("/api/v1/dark-funnel/signals", json=payload, headers=headers)
        assert second.status_code == 201, second.text
        assert first.json()["id"] == second.json()["id"]

        score = client.get(
            "/api/v1/dark-funnel/hot-leads/dedup-lead.com", headers=headers
        ).json()
        assert score["signal_count"] == 1

    def test_signals_without_external_id_are_never_deduplicated(self, client: TestClient):
        owner = _register(client, org_name="Org J", email="dfj@x.io")
        headers = _auth_headers(owner["access_token"])
        _simulate(client, headers, "no-dedup-lead.com")
        _simulate(client, headers, "no-dedup-lead.com")

        score = client.get(
            "/api/v1/dark-funnel/hot-leads/no-dedup-lead.com", headers=headers
        ).json()
        assert score["signal_count"] == 2


class TestManualTemperature:
    def test_set_and_clear_is_scoped_to_the_organization(self, client: TestClient) -> None:
        a = _register(client, org_name="Org A", email="a-temp@example.com")
        b = _register(client, org_name="Org B", email="b-temp@example.com")
        ha, hb = _auth_headers(a["access_token"]), _auth_headers(b["access_token"])
        _simulate(client, ha, "temp-a.example")
        lead = client.get("/api/v1/dark-funnel/hot-leads", headers=ha).json()[0]
        assert lead["manual_temperature"] is None

        resp = client.patch(
            f"/api/v1/dark-funnel/hot-leads/{lead['id']}/temperature",
            json={"manual_temperature": 90},
            headers=ha,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["manual_temperature"] == 90
        # The computed score is untouched by the override.
        assert resp.json()["research_intensity_score"] == lead["research_intensity_score"]

        # Another organization cannot touch it.
        other = client.patch(
            f"/api/v1/dark-funnel/hot-leads/{lead['id']}/temperature",
            json={"manual_temperature": 10},
            headers=hb,
        )
        assert other.status_code == 404

        cleared = client.patch(
            f"/api/v1/dark-funnel/hot-leads/{lead['id']}/temperature",
            json={"manual_temperature": None},
            headers=ha,
        )
        assert cleared.status_code == 200
        assert cleared.json()["manual_temperature"] is None

    def test_rejects_out_of_range(self, client: TestClient) -> None:
        a = _register(client, org_name="Org C", email="c-temp@example.com")
        ha = _auth_headers(a["access_token"])
        _simulate(client, ha, "temp-c.example")
        lead = client.get("/api/v1/dark-funnel/hot-leads", headers=ha).json()[0]
        resp = client.patch(
            f"/api/v1/dark-funnel/hot-leads/{lead['id']}/temperature",
            json={"manual_temperature": 140},
            headers=ha,
        )
        assert resp.status_code == 422
