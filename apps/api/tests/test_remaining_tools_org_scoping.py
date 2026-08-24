"""Org isolation regression tests for the tools retrofitted after the
DarkFunnel/NetworkNavigator pass: psychographic, brand voice, engagement
inbox, correction learning, anomaly detector, audit trail, dead letter
queue, market insights / A/B variants, and the scenario simulator.

One representative "two orgs, each creates its own data, org A never sees
org B's" test per tool — not exhaustive per-tool suites (those exist
already for dark-funnel and org API keys), just proof the wiring holds.
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


def _two_orgs(client: TestClient, tag: str) -> tuple[dict, dict]:
    a = _register(client, org_name=f"Org {tag}A", email=f"{tag}a@x.io")
    b = _register(client, org_name=f"Org {tag}B", email=f"{tag}b@x.io")
    return a, b


class TestNetworkOrgScoping:
    def test_connections_scoped_to_organization(self, client: TestClient):
        owner_a, owner_b = _two_orgs(client, "net")
        client.post(
            "/api/v1/network/connections",
            json={"contact_name": "Alice", "contact_company": "Acme", "contact_domain": "acme.com"},
            headers=_auth_headers(owner_a["access_token"]),
        )
        client.post(
            "/api/v1/network/connections",
            json={
                "contact_name": "Bob",
                "contact_company": "Globex",
                "contact_domain": "globex.com",
            },
            headers=_auth_headers(owner_b["access_token"]),
        )

        resp = client.get(
            "/api/v1/network/connections", headers=_auth_headers(owner_a["access_token"])
        )
        names = [c["contact_name"] for c in resp.json()]
        assert names == ["Alice"]


class TestBrandOrgScoping:
    def test_each_org_has_its_own_active_voice_profile(self, client: TestClient):
        owner_a, owner_b = _two_orgs(client, "brand")
        client.post(
            "/api/v1/brand/profile",
            json={"display_name": "CEO A"},
            headers=_auth_headers(owner_a["access_token"]),
        )
        client.post(
            "/api/v1/brand/profile",
            json={"display_name": "CEO B"},
            headers=_auth_headers(owner_b["access_token"]),
        )

        profile_a = client.get(
            "/api/v1/brand/profile", headers=_auth_headers(owner_a["access_token"])
        ).json()
        profile_b = client.get(
            "/api/v1/brand/profile", headers=_auth_headers(owner_b["access_token"])
        ).json()
        assert profile_a["display_name"] == "CEO A"
        assert profile_b["display_name"] == "CEO B"


class TestEngagementOrgScoping:
    def test_events_scoped_to_organization(self, client: TestClient):
        owner_a, owner_b = _two_orgs(client, "eng")
        client.post(
            "/api/v1/engagement/events",
            json={"source": "linkedin", "content": "Love what you're building!"},
            headers=_auth_headers(owner_a["access_token"]),
        )
        client.post(
            "/api/v1/engagement/events",
            json={"source": "twitter", "content": "Interesting product, tell me more"},
            headers=_auth_headers(owner_b["access_token"]),
        )

        resp = client.get(
            "/api/v1/engagement/events", headers=_auth_headers(owner_a["access_token"])
        )
        contents = [e["content"] for e in resp.json()]
        assert contents == ["Love what you're building!"]


class TestCorrectionsOrgScoping:
    def test_each_org_has_its_own_style_profile(self, client: TestClient):
        owner_a, owner_b = _two_orgs(client, "corr")
        client.post(
            "/api/v1/learning/corrections",
            json={
                "original_content": "Hey there! Hope you're doing amazing today!!",
                "edited_content": "Hi, following up on our conversation.",
                "artifact_type": "email_draft",
            },
            headers=_auth_headers(owner_a["access_token"]),
        )

        profile_a = client.get(
            "/api/v1/learning/style-profile", headers=_auth_headers(owner_a["access_token"])
        ).json()
        profile_b = client.get(
            "/api/v1/learning/style-profile", headers=_auth_headers(owner_b["access_token"])
        ).json()
        assert profile_a["total_corrections"] == 1
        assert profile_b["total_corrections"] == 0


class TestAnomaliesOrgScoping:
    def test_alerts_scoped_to_organization(self, client: TestClient, session):
        from app.models.anomaly import AlertStatus, AnomalyAlert
        from app.models.organization import Organization

        owner_a, _owner_b = _two_orgs(client, "anom")
        import uuid

        org_a_id = uuid.UUID(owner_a["user"]["organization_id"])
        other_org = Organization(name="Other anom org", slug="other-anom-org")
        session.add(other_org)
        session.commit()
        session.refresh(other_org)

        session.add(
            AnomalyAlert(
                organization_id=org_a_id,
                alert_type="conversion_drop",
                status=AlertStatus.OPEN,
                segment_type="overall",
                rolling_rate=0.1,
                baseline_rate=0.3,
                deviation_pct=-66,
                sample_size=5,
                baseline_sample_size=10,
                title="Org A drop",
                description="d",
                recommendation="monitor",
            )
        )
        session.add(
            AnomalyAlert(
                organization_id=other_org.id,
                alert_type="conversion_drop",
                status=AlertStatus.OPEN,
                segment_type="overall",
                rolling_rate=0.1,
                baseline_rate=0.3,
                deviation_pct=-66,
                sample_size=5,
                baseline_sample_size=10,
                title="Other org drop",
                description="d",
                recommendation="monitor",
            )
        )
        session.commit()

        resp = client.get(
            "/api/v1/analytics/anomalies", headers=_auth_headers(owner_a["access_token"])
        )
        titles = [a["title"] for a in resp.json()]
        assert titles == ["Org A drop"]


class TestAuditOrgScoping:
    def test_entries_scoped_to_organization(self, client: TestClient, session):
        from app.models.audit_trail import AuditEntry
        from app.models.organization import Organization

        owner_a, _owner_b = _two_orgs(client, "audit")
        import uuid

        org_a_id = uuid.UUID(owner_a["user"]["organization_id"])
        other_org = Organization(name="Other audit org", slug="other-audit-org")
        session.add(other_org)
        session.commit()
        session.refresh(other_org)

        session.add(
            AuditEntry(
                organization_id=org_a_id,
                agent_type="strategy_generator",
                decision_type="strategy_generated",
            )
        )
        session.add(
            AuditEntry(
                organization_id=other_org.id,
                agent_type="strategy_generator",
                decision_type="strategy_generated",
            )
        )
        session.commit()

        resp = client.get("/api/v1/audit/decisions", headers=_auth_headers(owner_a["access_token"]))
        assert len(resp.json()) == 1


class TestDeadLetterOrgScoping:
    def test_events_scoped_to_organization(self, client: TestClient):
        owner_a, owner_b = _two_orgs(client, "dlq")
        client.post(
            "/api/v1/workflow/dlq/test-enqueue",
            json={"event_name": "opportunity.won", "original_event": {}, "error_message": "boom A"},
            headers=_auth_headers(owner_a["access_token"]),
        )
        client.post(
            "/api/v1/workflow/dlq/test-enqueue",
            json={"event_name": "opportunity.won", "original_event": {}, "error_message": "boom B"},
            headers=_auth_headers(owner_b["access_token"]),
        )

        resp = client.get("/api/v1/workflow/dlq", headers=_auth_headers(owner_a["access_token"]))
        errors = [e["last_error"] for e in resp.json()]
        assert errors == ["boom A"]


class TestVariantsOrgScoping:
    def test_variants_scoped_to_organization(self, client: TestClient):
        owner_a, owner_b = _two_orgs(client, "var")
        client.post(
            "/api/v1/variants",
            json={
                "name": "Org A variant",
                "signal_type": "funding_round",
                "arm_a_config": {"channel": "email"},
                "arm_b_config": {"channel": "linkedin"},
            },
            headers=_auth_headers(owner_a["access_token"]),
        )
        client.post(
            "/api/v1/variants",
            json={
                "name": "Org B variant",
                "signal_type": "funding_round",
                "arm_a_config": {"channel": "email"},
                "arm_b_config": {"channel": "linkedin"},
            },
            headers=_auth_headers(owner_b["access_token"]),
        )

        resp = client.get("/api/v1/variants", headers=_auth_headers(owner_a["access_token"]))
        names = [v["name"] for v in resp.json()]
        assert names == ["Org A variant"]

    def test_cannot_fetch_other_orgs_variant(self, client: TestClient):
        owner_a, owner_b = _two_orgs(client, "var2")
        created = client.post(
            "/api/v1/variants",
            json={
                "name": "A's variant",
                "signal_type": "funding_round",
                "arm_a_config": {"channel": "email"},
                "arm_b_config": {"channel": "linkedin"},
            },
            headers=_auth_headers(owner_a["access_token"]),
        ).json()

        resp = client.get(
            f"/api/v1/variants/{created['id']}", headers=_auth_headers(owner_b["access_token"])
        )
        assert resp.status_code == 404


class TestScenarioSimulatorOrgScoping:
    def test_projection_uses_only_own_org_history(self, client: TestClient, session):
        """Two orgs with very different historical win rates get different
        base_win_rate projections — proof StrategyOutcome history isn't blended."""
        import uuid

        from app.models.opportunity import Opportunity
        from app.models.strategy_outcome import StrategyOutcome

        owner_a, owner_b = _two_orgs(client, "scen")
        org_a_id = uuid.UUID(owner_a["user"]["organization_id"])
        org_b_id = uuid.UUID(owner_b["user"]["organization_id"])

        for i in range(6):
            opp = Opportunity(organization_id=org_a_id, title=f"A win {i}")
            session.add(opp)
            session.flush()
            session.add(
                StrategyOutcome(
                    organization_id=org_a_id,
                    opportunity_id=opp.id,
                    outcome="won",
                    signal_type="funding_round",
                    playbook="p",
                    channel="email",
                    generator="g",
                    generator_version="1",
                    score_at_close=80.0,
                )
            )
        for i in range(6):
            opp = Opportunity(organization_id=org_b_id, title=f"B loss {i}")
            session.add(opp)
            session.flush()
            session.add(
                StrategyOutcome(
                    organization_id=org_b_id,
                    opportunity_id=opp.id,
                    outcome="lost",
                    signal_type="funding_round",
                    playbook="p",
                    channel="email",
                    generator="g",
                    generator_version="1",
                    score_at_close=80.0,
                )
            )
        session.commit()

        resp_a = client.post(
            "/api/v1/analytics/scenarios",
            json={"signal_type": "funding_round", "target_monthly_signals": 10},
            headers=_auth_headers(owner_a["access_token"]),
        )
        resp_b = client.post(
            "/api/v1/analytics/scenarios",
            json={"signal_type": "funding_round", "target_monthly_signals": 10},
            headers=_auth_headers(owner_b["access_token"]),
        )
        assert resp_a.status_code == 200 and resp_b.status_code == 200
        assert resp_a.json()["base_win_rate"] > resp_b.json()["base_win_rate"]
