"""Tests for Autopilot Guardrails — confidence-threshold-gated autonomous
execution, account exclusion, forbidden words, and forensic audit.

Covers:
* AutopilotGuardrailService — the pure evaluate() decision function
* OmnichannelGateway.prepare_action() — the actual auto-approve wiring,
  and confirmation that omitting confidence_score/organization_id (every
  caller today) leaves behavior completely unchanged
* SmartEngagementEngine / DynamicSequenceEngine — the audit-trail coverage
  gaps this phase closes
* PUT/GET /organizations/autopilot — endpoint permissions and validation
* POST /organizations/autopilot/simulate + AutopilotGuardrailService.run_simulation
  — the Guardrail Backtesting Sandbox
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import create_access_token, hash_password
from app.models.audit_trail import AgentType, AuditEntry, DecisionType
from app.models.base import OpportunityStatus, UserRole
from app.models.opportunity import Opportunity
from app.models.organization import Organization
from app.models.user import User
from app.schemas.autopilot import AutopilotConfigIn, AutopilotSimulationRequest
from app.services.autopilot import AutopilotGuardrailService
from app.services.omnichannel import OmnichannelGateway


def _make_org(session: Session) -> Organization:
    org = Organization(name="Acme Corp", slug=f"acme-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def _auth_headers(session: Session, org: Organization, role: UserRole = UserRole.OWNER) -> dict:
    user = User(
        organization_id=org.id,
        email=f"{role.value}-{uuid.uuid4().hex[:8]}@acme.io",
        hashed_password=hash_password("password123"),
        full_name="Test User",
        role=role,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    token = create_access_token(user.id, organization_id=user.organization_id, role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


class TestAutopilotGuardrailService:
    def test_disabled_by_default(self, session: Session) -> None:
        org = _make_org(session)
        decision = AutopilotGuardrailService(session).evaluate(org.id, confidence_score=0.99)
        assert decision.auto_approve is False
        assert "not enabled" in decision.reason

    def test_no_organization_id_never_approves(self, session: Session) -> None:
        decision = AutopilotGuardrailService(session).evaluate(None, confidence_score=0.99)
        assert decision.auto_approve is False

    def test_no_confidence_score_never_approves(self, session: Session) -> None:
        org = _make_org(session)
        svc = AutopilotGuardrailService(session)
        svc.create_or_update(org.id, AutopilotConfigIn(enabled=True, confidence_threshold=0.8))
        session.commit()

        decision = svc.evaluate(org.id, confidence_score=None)
        assert decision.auto_approve is False
        assert "no confidence score" in decision.reason

    def test_confidence_below_threshold_requires_approval(self, session: Session) -> None:
        org = _make_org(session)
        svc = AutopilotGuardrailService(session)
        svc.create_or_update(org.id, AutopilotConfigIn(enabled=True, confidence_threshold=0.9))
        session.commit()

        decision = svc.evaluate(org.id, confidence_score=0.85)
        assert decision.auto_approve is False
        assert "below" in decision.reason

    def test_confidence_at_or_above_threshold_approves(self, session: Session) -> None:
        org = _make_org(session)
        svc = AutopilotGuardrailService(session)
        svc.create_or_update(org.id, AutopilotConfigIn(enabled=True, confidence_threshold=0.9))
        session.commit()

        decision = svc.evaluate(org.id, confidence_score=0.9)
        assert decision.auto_approve is True

    def test_excluded_company_blocks_approval(self, session: Session) -> None:
        org = _make_org(session)
        company_id = uuid.uuid4()
        svc = AutopilotGuardrailService(session)
        svc.create_or_update(
            org.id,
            AutopilotConfigIn(enabled=True, confidence_threshold=0.5, excluded_company_ids=[company_id]),
        )
        session.commit()

        decision = svc.evaluate(org.id, confidence_score=0.99, company_id=company_id)
        assert decision.auto_approve is False
        assert "protected/excluded" in decision.reason

        # A different company is unaffected.
        decision2 = svc.evaluate(org.id, confidence_score=0.99, company_id=uuid.uuid4())
        assert decision2.auto_approve is True

    def test_forbidden_word_blocks_approval(self, session: Session) -> None:
        org = _make_org(session)
        svc = AutopilotGuardrailService(session)
        svc.create_or_update(
            org.id, AutopilotConfigIn(enabled=True, confidence_threshold=0.5, forbidden_words=["guarantee"])
        )
        session.commit()

        decision = svc.evaluate(org.id, confidence_score=0.99, content="We GUARANTEE results in 30 days.")
        assert decision.auto_approve is False
        assert "forbidden word" in decision.reason

        decision2 = svc.evaluate(org.id, confidence_score=0.99, content="Let's talk about your goals.")
        assert decision2.auto_approve is True

    def test_config_replaces_wholesale(self, session: Session) -> None:
        org = _make_org(session)
        svc = AutopilotGuardrailService(session)
        svc.create_or_update(org.id, AutopilotConfigIn(enabled=True, forbidden_words=["a", "b"]))
        session.commit()

        replaced = svc.create_or_update(org.id, AutopilotConfigIn(enabled=False, forbidden_words=[]))
        session.commit()

        assert replaced.enabled is False
        assert replaced.forbidden_words == []


class TestOmnichannelGatewayAutopilot:
    def test_default_call_unaffected_by_autopilot(self, session: Session) -> None:
        """Every real caller today omits organization_id/confidence_score —
        this must behave exactly as before this feature existed."""
        org = _make_org(session)
        AutopilotGuardrailService(session).create_or_update(
            org.id, AutopilotConfigIn(enabled=True, confidence_threshold=0.5)
        )
        session.commit()

        gateway = OmnichannelGateway(session)
        pending = gateway.prepare_action(
            channel="email", recipient_id="lead@example.com", body="Hi there", title="Outreach",
        )
        session.commit()
        assert pending.status == "pending_approval"
        assert pending.approved_by is None

    def test_high_confidence_auto_approves_when_enabled(self, session: Session) -> None:
        org = _make_org(session)
        AutopilotGuardrailService(session).create_or_update(
            org.id, AutopilotConfigIn(enabled=True, confidence_threshold=0.8)
        )
        session.commit()

        gateway = OmnichannelGateway(session)
        pending = gateway.prepare_action(
            channel="email", recipient_id="lead@example.com", body="Hi there", title="Outreach",
            organization_id=org.id, confidence_score=0.92,
        )
        session.commit()

        assert pending.status == "approved"
        assert pending.approved_by == "autopilot"
        assert pending.approved_at is not None

        entry = session.exec(
            select(AuditEntry).where(AuditEntry.pending_action_id == pending.id)
        ).first()
        assert entry is not None
        assert entry.agent_type == AgentType.AUTOPILOT
        assert entry.decision_type == DecisionType.AUTOPILOT_AUTO_APPROVED

    def test_low_confidence_still_requires_approval_when_enabled(self, session: Session) -> None:
        org = _make_org(session)
        AutopilotGuardrailService(session).create_or_update(
            org.id, AutopilotConfigIn(enabled=True, confidence_threshold=0.95)
        )
        session.commit()

        gateway = OmnichannelGateway(session)
        pending = gateway.prepare_action(
            channel="email", recipient_id="lead@example.com", body="Hi there", title="Outreach",
            organization_id=org.id, confidence_score=0.6,
        )
        session.commit()
        assert pending.status == "pending_approval"

    def test_excluded_company_still_requires_approval(self, session: Session) -> None:
        org = _make_org(session)
        company_id = uuid.uuid4()
        AutopilotGuardrailService(session).create_or_update(
            org.id,
            AutopilotConfigIn(enabled=True, confidence_threshold=0.5, excluded_company_ids=[company_id]),
        )
        session.commit()

        gateway = OmnichannelGateway(session)
        pending = gateway.prepare_action(
            channel="email", recipient_id="lead@example.com", body="Hi there", title="Outreach",
            organization_id=org.id, confidence_score=0.99, company_id=company_id,
        )
        session.commit()
        assert pending.status == "pending_approval"

    def test_pending_action_always_created_even_when_evaluation_fails(self, session: Session, monkeypatch) -> None:
        """The one hard invariant: a guardrail bug must never silently drop
        an action or block PendingAction creation — only ever fail toward
        requiring a human."""
        org = _make_org(session)

        def _boom(*_args, **_kwargs):
            raise RuntimeError("boom")

        monkeypatch.setattr(AutopilotGuardrailService, "_evaluate", _boom)

        gateway = OmnichannelGateway(session)
        pending = gateway.prepare_action(
            channel="email", recipient_id="lead@example.com", body="Hi there", title="Outreach",
            organization_id=org.id, confidence_score=0.99,
        )
        session.commit()
        assert pending is not None
        assert pending.status == "pending_approval"


class TestAutopilotEndpoints:
    def test_defaults_when_unconfigured(self, client: TestClient, session: Session) -> None:
        org = _make_org(session)
        headers = _auth_headers(session, org)
        resp = client.get("/api/v1/organizations/autopilot", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] is False
        assert data["confidence_threshold"] == 0.9

    def test_owner_can_set_config(self, client: TestClient, session: Session) -> None:
        org = _make_org(session)
        headers = _auth_headers(session, org, UserRole.OWNER)
        resp = client.put(
            "/api/v1/organizations/autopilot",
            json={"enabled": True, "confidence_threshold": 0.85, "forbidden_words": ["guarantee"]},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["enabled"] is True
        assert data["confidence_threshold"] == 0.85

        get_resp = client.get("/api/v1/organizations/autopilot", headers=headers)
        assert get_resp.json()["enabled"] is True

    def test_admin_cannot_set_config(self, client: TestClient, session: Session) -> None:
        org = _make_org(session)
        headers = _auth_headers(session, org, UserRole.ADMIN)
        resp = client.put(
            "/api/v1/organizations/autopilot", json={"enabled": True}, headers=headers
        )
        assert resp.status_code == 403

    def test_rejects_threshold_below_floor(self, client: TestClient, session: Session) -> None:
        org = _make_org(session)
        headers = _auth_headers(session, org, UserRole.OWNER)
        resp = client.put(
            "/api/v1/organizations/autopilot",
            json={"enabled": True, "confidence_threshold": 0.2},
            headers=headers,
        )
        assert resp.status_code == 422

    def test_unauthenticated_request_rejected(self, client: TestClient) -> None:
        resp = client.get("/api/v1/organizations/autopilot")
        assert resp.status_code == 401


def _make_opportunity(
    session: Session,
    org: Organization,
    *,
    confidence_score: float | None,
    status: OpportunityStatus = OpportunityStatus.DETECTED,
    company_id: uuid.UUID | None = None,
    execution_artifacts: dict | None = None,
    created_at: datetime | None = None,
) -> Opportunity:
    opp = Opportunity(
        organization_id=org.id,
        title="Acme Corp — Series B outreach",
        status=status,
        company_id=company_id,
        strategy={"confidence_score": confidence_score} if confidence_score is not None else {},
        execution_artifacts=execution_artifacts,
    )
    session.add(opp)
    session.commit()
    session.refresh(opp)
    if created_at is not None:
        # Backdate for lookback-window tests — created_at has a default
        # factory, so it must be overwritten post-insert.
        opp.created_at = created_at
        session.add(opp)
        session.commit()
        session.refresh(opp)
    return opp


class TestAutopilotSimulationService:
    def test_no_history_reports_zero_without_dividing_by_zero(self, session: Session) -> None:
        org = _make_org(session)
        svc = AutopilotGuardrailService(session)

        report = svc.run_simulation(
            org.id, AutopilotSimulationRequest(confidence_threshold=0.9)
        )

        assert report.evaluated_count == 0
        assert report.would_auto_approve_count == 0
        assert report.would_auto_approve_rate == 0.0
        assert report.auto_approved_win_rate is None
        assert report.manual_review_win_rate is None

    def test_opportunities_without_confidence_score_are_excluded(self, session: Session) -> None:
        org = _make_org(session)
        _make_opportunity(session, org, confidence_score=None)
        svc = AutopilotGuardrailService(session)

        report = svc.run_simulation(
            org.id, AutopilotSimulationRequest(confidence_threshold=0.5)
        )
        assert report.evaluated_count == 0

    def test_splits_auto_approved_vs_manual_review_by_threshold(self, session: Session) -> None:
        org = _make_org(session)
        _make_opportunity(session, org, confidence_score=0.95, status=OpportunityStatus.WON)
        _make_opportunity(session, org, confidence_score=0.92, status=OpportunityStatus.LOST)
        _make_opportunity(session, org, confidence_score=0.6, status=OpportunityStatus.WON)
        svc = AutopilotGuardrailService(session)

        report = svc.run_simulation(
            org.id, AutopilotSimulationRequest(confidence_threshold=0.9)
        )

        assert report.evaluated_count == 3
        assert report.would_auto_approve_count == 2
        assert report.would_auto_approve_rate == pytest.approx(2 / 3)
        assert report.auto_approved_won == 1
        assert report.auto_approved_lost == 1
        assert report.auto_approved_win_rate == pytest.approx(0.5)
        assert report.manual_review_won == 1
        assert report.manual_review_lost == 0
        assert report.manual_review_win_rate == pytest.approx(1.0)

    def test_still_open_opportunities_counted_but_not_in_win_rate(self, session: Session) -> None:
        org = _make_org(session)
        _make_opportunity(session, org, confidence_score=0.95, status=OpportunityStatus.IN_PROGRESS)
        svc = AutopilotGuardrailService(session)

        report = svc.run_simulation(
            org.id, AutopilotSimulationRequest(confidence_threshold=0.9)
        )
        assert report.would_auto_approve_count == 1
        assert report.auto_approved_still_open == 1
        assert report.auto_approved_win_rate is None

    def test_excluded_company_forces_manual_review_and_counts_as_near_miss(
        self, session: Session
    ) -> None:
        org = _make_org(session)
        company_id = uuid.uuid4()
        _make_opportunity(
            session, org, confidence_score=0.95, status=OpportunityStatus.WON, company_id=company_id
        )
        svc = AutopilotGuardrailService(session)

        report = svc.run_simulation(
            org.id,
            AutopilotSimulationRequest(confidence_threshold=0.9, excluded_company_ids=[company_id]),
        )
        assert report.would_auto_approve_count == 0
        assert report.near_miss_excluded_count == 1

    def test_forbidden_word_checked_against_execution_artifacts(self, session: Session) -> None:
        org = _make_org(session)
        _make_opportunity(
            session,
            org,
            confidence_score=0.95,
            execution_artifacts={"body": "We GUARANTEE a 10x return."},
        )
        svc = AutopilotGuardrailService(session)

        report = svc.run_simulation(
            org.id,
            AutopilotSimulationRequest(confidence_threshold=0.9, forbidden_words=["guarantee"]),
        )
        assert report.would_auto_approve_count == 0
        assert "forbidden word" in report.samples[0].reason

    def test_lookback_window_excludes_older_opportunities(self, session: Session) -> None:
        org = _make_org(session)
        _make_opportunity(
            session,
            org,
            confidence_score=0.95,
            created_at=datetime.now(UTC) - timedelta(days=200),
        )
        svc = AutopilotGuardrailService(session)

        report = svc.run_simulation(
            org.id, AutopilotSimulationRequest(confidence_threshold=0.9, lookback_days=30)
        )
        assert report.evaluated_count == 0

        wider_report = svc.run_simulation(
            org.id, AutopilotSimulationRequest(confidence_threshold=0.9, lookback_days=365)
        )
        assert wider_report.evaluated_count == 1

    def test_simulation_never_persists_anything(self, session: Session) -> None:
        """The one hard invariant of a sandbox: running it must leave the
        org's live AutopilotConfig completely untouched."""
        org = _make_org(session)
        svc = AutopilotGuardrailService(session)
        svc.create_or_update(org.id, AutopilotConfigIn(enabled=False, confidence_threshold=0.9))
        session.commit()

        svc.run_simulation(
            org.id, AutopilotSimulationRequest(confidence_threshold=0.5, forbidden_words=["x"])
        )

        config = svc.get_config(org.id)
        assert config is not None
        assert config.enabled is False
        assert config.confidence_threshold == 0.9


class TestAutopilotSimulationEndpoint:
    def test_owner_can_simulate(self, client: TestClient, session: Session) -> None:
        org = _make_org(session)
        _make_opportunity(session, org, confidence_score=0.95, status=OpportunityStatus.WON)
        headers = _auth_headers(session, org, UserRole.OWNER)

        resp = client.post(
            "/api/v1/organizations/autopilot/simulate",
            json={"confidence_threshold": 0.9},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["evaluated_count"] == 1
        assert data["would_auto_approve_count"] == 1

    def test_admin_can_simulate(self, client: TestClient, session: Session) -> None:
        org = _make_org(session)
        headers = _auth_headers(session, org, UserRole.ADMIN)
        resp = client.post(
            "/api/v1/organizations/autopilot/simulate",
            json={"confidence_threshold": 0.9},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

    def test_member_cannot_simulate(self, client: TestClient, session: Session) -> None:
        org = _make_org(session)
        headers = _auth_headers(session, org, UserRole.MEMBER)
        resp = client.post(
            "/api/v1/organizations/autopilot/simulate",
            json={"confidence_threshold": 0.9},
            headers=headers,
        )
        assert resp.status_code == 403

    def test_unauthenticated_simulate_rejected(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/organizations/autopilot/simulate", json={"confidence_threshold": 0.9}
        )
        assert resp.status_code == 401

    def test_rejects_threshold_below_floor(self, client: TestClient, session: Session) -> None:
        org = _make_org(session)
        headers = _auth_headers(session, org, UserRole.OWNER)
        resp = client.post(
            "/api/v1/organizations/autopilot/simulate",
            json={"confidence_threshold": 0.2},
            headers=headers,
        )
        assert resp.status_code == 422
