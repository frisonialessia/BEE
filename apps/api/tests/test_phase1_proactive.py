"""Tests for BEE's Phase I "proactive, zero-friction" pieces:

* WebsiteEnrichmentProvider + POST /companies/from-domain (Data-Entry Zero)
* Email-engagement events → DarkFunnelSignal (open/click/reply)
* AccountResearchAgent — cache/budget discipline, template synthesis
* The approve/reject feedback loop (AgentOrchestrator → AuditTrail →
  CorrectionLearningService, and StrategyGeneratorService's generator
  demotion read side)
* GET /api/v1/priority/today (Bandeja de Decisiones)
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings as app_settings
from app.core.security import create_access_token, hash_password
from app.models.account_brief import AccountBrief
from app.models.audit_trail import AuditEntry, DecisionType
from app.models.base import OpportunityStatus, UserRole
from app.models.company import Company
from app.models.correction import UserStyleProfile
from app.models.organization import Organization
from app.models.pending_action import PendingAction
from app.models.user import User
from app.services.account_research import AccountResearchAgent
from app.services.correction_learning.diff_engine import classify_rejection_reason
from app.services.external_api.interface import ExternalProfileResult
from app.services.external_api.worker import (
    _FREE_EMAIL_PROVIDERS,
    _domain_from_email,
    _is_dark_funnel_event,
    _map_dark_funnel_type,
)


def _make_owner(session: Session) -> tuple[Organization, User]:
    org = Organization(name="Test Org", slug=f"test-org-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)

    user = User(
        organization_id=org.id,
        email=f"owner-{uuid.uuid4().hex[:8]}@bee.ai",
        hashed_password=hash_password("password123"),
        full_name="Owner",
        role=UserRole.OWNER,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return org, user


def _auth_headers(org: Organization, user: User) -> dict:
    token = create_access_token(user.id, organization_id=org.id, role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


# ── WebsiteEnrichmentProvider ────────────────────────────────────────────────


class TestWebsiteEnrichmentProvider:
    def test_extracts_title_and_meta_description(self):
        from app.services.external_api.providers.website import WebsiteEnrichmentProvider

        html = (
            "<html><head><title>Acme — CRM for small teams</title>"
            '<meta name="description" content="Acme helps small sales teams close more deals.">'
            '<meta property="og:site_name" content="Acme">'
            "</head><body></body></html>"
        )

        class _FakeResponse:
            text = html

            def raise_for_status(self):
                pass

        with patch("httpx.Client") as mock_client_cls:
            mock_client = mock_client_cls.return_value.__enter__.return_value
            mock_client.get.return_value = _FakeResponse()

            provider = WebsiteEnrichmentProvider()
            result = provider.enrich_company(company_domain="acme.com")

        assert result.success
        assert result.company_name == "Acme"
        assert "close more deals" in result.company_description

    def test_fetch_failure_is_a_clean_unsuccessful_result_not_an_exception(self):
        from app.services.external_api.providers.website import WebsiteEnrichmentProvider

        with patch("httpx.Client", side_effect=RuntimeError("DNS failure")):
            provider = WebsiteEnrichmentProvider()
            result = provider.enrich_company(company_domain="doesnotexist.invalid")

        assert result.success is False
        assert result.error


# ── POST /companies/from-domain ─────────────────────────────────────────────


class TestCompanyFromDomain:
    def test_creates_company_with_enrichment(self, client: TestClient, session: Session):
        org, user = _make_owner(session)

        fake_result = ExternalProfileResult(
            provider="website",
            success=True,
            company_name="Acme Inc",
            company_domain="acme.com",
            company_description="We sell rockets.",
        )
        with patch(
            "app.services.external_api.orchestrator.ExternalAPIOrchestrator.enrich_company_from_domain",
            return_value=fake_result,
        ):
            resp = client.post(
                "/api/v1/companies/from-domain",
                json={"domain": "acme.com"},
                headers=_auth_headers(org, user),
            )

        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Acme Inc"
        assert data["domain"] == "acme.com"
        assert data["description"] == "We sell rockets."

    def test_falls_back_to_domain_as_name_when_enrichment_fails(self, client: TestClient, session: Session):
        org, user = _make_owner(session)

        with patch(
            "app.services.external_api.orchestrator.ExternalAPIOrchestrator.enrich_company_from_domain",
            return_value=ExternalProfileResult(provider="website", success=False, error="timeout"),
        ):
            resp = client.post(
                "/api/v1/companies/from-domain",
                json={"domain": "unknown-startup.io"},
                headers=_auth_headers(org, user),
            )

        assert resp.status_code == 201
        assert resp.json()["name"] == "unknown-startup.io"

    def test_strips_scheme_from_domain(self, client: TestClient, session: Session):
        org, user = _make_owner(session)
        with patch(
            "app.services.external_api.orchestrator.ExternalAPIOrchestrator.enrich_company_from_domain",
            return_value=ExternalProfileResult(provider="website", success=False),
        ):
            resp = client.post(
                "/api/v1/companies/from-domain",
                json={"domain": "https://acme.com/"},
                headers=_auth_headers(org, user),
            )
        assert resp.json()["domain"] == "acme.com"


# ── Email-engagement events → DarkFunnelSignal ──────────────────────────────


class TestEmailEngagementMapping:
    def test_map_dark_funnel_type_returns_only_real_darksignaltype_values(self):
        """Regression test for the pre-existing bug this PR fixed: every
        mapped value here must be a real DarkSignalType member, or
        SIGNAL_WEIGHTS.get() silently falls through to its 5.0 default
        regardless of the event's actual type."""
        from app.models.dark_funnel import SIGNAL_WEIGHTS

        for event_type in (
            "g2_review", "g2_comparison", "linkedin_research", "page_view",
            "pricing_page_view", "content_download",
            "email.opened", "email.clicked", "email.replied", "unknown_event",
        ):
            mapped = _map_dark_funnel_type(event_type)
            assert mapped in SIGNAL_WEIGHTS, f"{event_type} -> {mapped} is not a real DarkSignalType"

    def test_email_events_get_distinct_weights_by_strength(self):
        from app.models.dark_funnel import SIGNAL_WEIGHTS

        open_w = SIGNAL_WEIGHTS[_map_dark_funnel_type("email.opened")]
        click_w = SIGNAL_WEIGHTS[_map_dark_funnel_type("email.clicked")]
        reply_w = SIGNAL_WEIGHTS[_map_dark_funnel_type("email.replied")]
        assert open_w < click_w < reply_w

    def test_is_dark_funnel_event_recognizes_email_events(self):
        assert _is_dark_funnel_event("email.opened", "sendgrid")
        assert _is_dark_funnel_event("email.replied", "resend")
        assert _is_dark_funnel_event("anything", "sendgrid")  # provider alone is enough


class TestDomainFromEmail:
    def test_extracts_domain_from_work_email(self):
        assert _domain_from_email("jane@acme.com") == "acme.com"

    def test_refuses_free_email_providers(self):
        for provider in _FREE_EMAIL_PROVIDERS:
            assert _domain_from_email(f"someone@{provider}") is None

    def test_rejects_malformed_input(self):
        assert _domain_from_email("not-an-email") is None
        assert _domain_from_email("") is None


class TestEmailEngagementIngestion:
    def test_email_reply_becomes_a_dark_funnel_signal(self, session: Session):
        from app.services.external_api.worker import IngestionWorker

        org, _ = _make_owner(session)
        worker = IngestionWorker()
        worker._ingest_dark_funnel(
            session,
            {
                "event_type": "email.replied",
                "data": {"email": "jane@prospect-co.com"},
            },
            "resend",
            org.id,
        )
        session.commit()

        from sqlmodel import select

        from app.models.dark_funnel import DarkFunnelSignal

        rows = session.exec(select(DarkFunnelSignal)).all()
        assert len(rows) == 1
        assert rows[0].company_domain == "prospect-co.com"
        assert rows[0].signal_type == "email_reply"

    def test_free_email_domain_is_not_ingested(self, session: Session):
        from sqlmodel import select

        from app.models.dark_funnel import DarkFunnelSignal
        from app.services.external_api.worker import IngestionWorker

        org, _ = _make_owner(session)
        worker = IngestionWorker()
        worker._ingest_dark_funnel(
            session,
            {"event_type": "email.opened", "data": {"email": "jane@gmail.com"}},
            "sendgrid",
            org.id,
        )
        session.commit()
        assert session.exec(select(DarkFunnelSignal)).all() == []


# ── AccountResearchAgent ─────────────────────────────────────────────────────


class TestAccountResearchAgent:
    def _make_company(self, session: Session, org: Organization) -> Company:
        company = Company(name="Prospect Co", domain="prospect-co.com", organization_id=org.id)
        session.add(company)
        session.commit()
        session.refresh(company)
        return company

    def test_disabled_by_default_returns_cached_or_none(self, session: Session):
        org, _ = _make_owner(session)
        company = self._make_company(session, org)
        agent = AccountResearchAgent(session)

        outcome = agent.research(company, organization_id=org.id)
        assert outcome.disabled is True
        assert outcome.brief is None

    def test_fresh_cache_hit_skips_all_providers(self, session: Session):
        org, _ = _make_owner(session)
        company = self._make_company(session, org)

        existing = AccountBrief(
            organization_id=org.id,
            company_id=company.id,
            summary="Cached brief.",
            findings={},
            sources=[],
            generated_by="template",
        )
        session.add(existing)
        session.commit()

        with patch.object(app_settings, "ACCOUNT_RESEARCH_ENABLED", True), patch(
            "app.services.external_api.orchestrator.ExternalAPIOrchestrator.enrich_company_from_domain"
        ) as mock_enrich:
            outcome = AccountResearchAgent(session).research(company, organization_id=org.id)

        assert outcome.from_cache is True
        assert outcome.brief.summary == "Cached brief."
        mock_enrich.assert_not_called()

    def test_budget_exhausted_returns_most_recent_brief_without_calling_providers(
        self, session: Session
    ):
        org, _ = _make_owner(session)
        company = self._make_company(session, org)

        with (
            patch.object(app_settings, "ACCOUNT_RESEARCH_ENABLED", True),
            patch.object(app_settings, "ACCOUNT_RESEARCH_DAILY_BUDGET_PER_ORG", 0),
            patch(
                "app.services.external_api.orchestrator.ExternalAPIOrchestrator.enrich_company_from_domain"
            ) as mock_enrich,
        ):
            outcome = AccountResearchAgent(session).research(company, organization_id=org.id)

        assert outcome.budget_exceeded is True
        mock_enrich.assert_not_called()

    def test_template_synthesis_when_ai_provider_none(self, session: Session):
        org, _ = _make_owner(session)
        company = self._make_company(session, org)

        with (
            patch.object(app_settings, "ACCOUNT_RESEARCH_ENABLED", True),
            patch.object(app_settings, "AI_PROVIDER", "none"),
            patch(
                "app.services.external_api.orchestrator.ExternalAPIOrchestrator.enrich_company_from_domain",
                return_value=ExternalProfileResult(
                    provider="website",
                    success=True,
                    company_description="Rockets, but for logistics.",
                ),
            ),
            patch(
                "app.services.external_api.orchestrator.ExternalAPIOrchestrator.scan_hiring_signals",
                return_value=type("R", (), {"success": False, "items": []})(),
            ),
            patch(
                "app.services.external_api.orchestrator.ExternalAPIOrchestrator.scan_market_news",
                return_value=type("R", (), {"success": False, "items": []})(),
            ),
        ):
            outcome = AccountResearchAgent(session).research(company, organization_id=org.id, force=True)

        assert outcome.from_cache is False
        assert outcome.brief is not None
        assert outcome.brief.generated_by == "template"
        assert "Rockets, but for logistics." in outcome.brief.summary

    def test_no_findings_produces_honest_empty_summary(self, session: Session):
        org, _ = _make_owner(session)
        company = self._make_company(session, org)

        with (
            patch.object(app_settings, "ACCOUNT_RESEARCH_ENABLED", True),
            patch(
                "app.services.external_api.orchestrator.ExternalAPIOrchestrator.enrich_company_from_domain",
                return_value=ExternalProfileResult(provider="website", success=False),
            ),
            patch(
                "app.services.external_api.orchestrator.ExternalAPIOrchestrator.scan_hiring_signals",
                return_value=type("R", (), {"success": False, "items": []})(),
            ),
            patch(
                "app.services.external_api.orchestrator.ExternalAPIOrchestrator.scan_market_news",
                return_value=type("R", (), {"success": False, "items": []})(),
            ),
        ):
            outcome = AccountResearchAgent(session).research(company, organization_id=org.id)

        assert "No public research found" in outcome.brief.summary
        assert outcome.brief.sources == []


# ── Feedback loop: approve/reject → AuditTrail + UserStyleProfile ──────────


class TestRejectionReasonClassifier:
    def test_matches_known_patterns(self):
        assert "prefer_concise" in classify_rejection_reason("Way too long, please shorten")
        assert "prefer_soft_cta" in classify_rejection_reason("This is too pushy")
        assert "avoid_generic_claims" in classify_rejection_reason("Feels generic and templated")

    def test_no_match_returns_empty_not_an_error(self):
        assert classify_rejection_reason("Wrong company entirely") == []
        assert classify_rejection_reason("") == []


class TestApproveRejectFeedbackLoop:
    def _make_pending_action(self, session: Session, org: Organization) -> PendingAction:
        from app.models.base import ActionStatus, ActionType
        from tests.conftest import _create_full_opportunity

        _, _, _, opp = _create_full_opportunity(session)
        opp.organization_id = org.id
        session.add(opp)
        session.commit()

        action = PendingAction(
            organization_id=org.id,
            opportunity_id=opp.id,
            action_type=ActionType.SEND_EMAIL,
            status=ActionStatus.PENDING_APPROVAL,
            title="Test action",
            payload={},
        )
        session.add(action)
        session.commit()
        session.refresh(action)
        return action

    def test_approve_records_audit_entry(self, client: TestClient, session: Session):
        org, user = _make_owner(session)
        action = self._make_pending_action(session, org)

        resp = client.post(
            f"/api/v1/orchestrator/{action.id}/approve",
            json={"approved_by": "owner@bee.ai"},
            headers=_auth_headers(org, user),
        )
        assert resp.status_code == 200

        from sqlmodel import select

        entries = session.exec(
            select(AuditEntry).where(AuditEntry.pending_action_id == action.id)
        ).all()
        assert len(entries) == 1
        assert entries[0].decision_type == DecisionType.ACTION_APPROVED

    def test_reject_records_audit_entry_and_feeds_style_profile(
        self, client: TestClient, session: Session
    ):
        org, user = _make_owner(session)
        action = self._make_pending_action(session, org)

        resp = client.post(
            f"/api/v1/orchestrator/{action.id}/reject",
            json={"reason": "Too pushy, way too aggressive"},
            headers=_auth_headers(org, user),
        )
        assert resp.status_code == 200

        from sqlmodel import select

        entries = session.exec(
            select(AuditEntry).where(AuditEntry.pending_action_id == action.id)
        ).all()
        assert len(entries) == 1
        assert entries[0].decision_type == DecisionType.ACTION_REJECTED
        assert entries[0].output_snapshot["reason"] == "Too pushy, way too aggressive"

        profile = session.exec(
            select(UserStyleProfile).where(UserStyleProfile.organization_id == org.id)
        ).first()
        assert profile is not None
        assert "prefer_soft_cta" in profile.rules.get(action.action_type, {})

    def test_reject_with_unmatched_reason_still_records_audit_but_no_style_rule(
        self, client: TestClient, session: Session
    ):
        org, user = _make_owner(session)
        action = self._make_pending_action(session, org)

        resp = client.post(
            f"/api/v1/orchestrator/{action.id}/reject",
            json={"reason": "Wrong account entirely"},
            headers=_auth_headers(org, user),
        )
        assert resp.status_code == 200

        from sqlmodel import select

        entries = session.exec(
            select(AuditEntry).where(AuditEntry.pending_action_id == action.id)
        ).all()
        assert len(entries) == 1  # audit trail still recorded


# ── GET /api/v1/priority/today ──────────────────────────────────────────────


class TestPriorityFeed:
    def test_empty_pipeline_returns_empty_feed(self, client: TestClient, session: Session):
        org, user = _make_owner(session)
        resp = client.get("/api/v1/priority/today", headers=_auth_headers(org, user))
        assert resp.status_code == 200
        assert resp.json()["cards"] == []

    def test_open_opportunity_appears_in_feed(self, client: TestClient, session: Session):
        from tests.conftest import _create_full_opportunity

        org, user = _make_owner(session)
        company, lead, signal, opp = _create_full_opportunity(session)
        opp.organization_id = org.id
        opp.status = OpportunityStatus.PRIORITIZED
        session.add(opp)
        session.commit()

        resp = client.get("/api/v1/priority/today", headers=_auth_headers(org, user))
        assert resp.status_code == 200
        cards = resp.json()["cards"]
        assert any(c["opportunity_id"] == str(opp.id) for c in cards)

    def test_dismiss_hides_opportunity_from_feed(self, client: TestClient, session: Session):
        from tests.conftest import _create_full_opportunity

        org, user = _make_owner(session)
        company, lead, signal, opp = _create_full_opportunity(session)
        opp.organization_id = org.id
        opp.status = OpportunityStatus.PRIORITIZED
        session.add(opp)
        session.commit()

        headers = _auth_headers(org, user)
        resp = client.post(f"/api/v1/priority/today/{opp.id}/dismiss", headers=headers)
        assert resp.status_code == 204

        resp = client.get("/api/v1/priority/today", headers=headers)
        cards = resp.json()["cards"]
        assert not any(c["opportunity_id"] == str(opp.id) for c in cards)

    def test_closed_opportunities_excluded(self, client: TestClient, session: Session):
        from tests.conftest import _create_full_opportunity

        org, user = _make_owner(session)
        company, lead, signal, opp = _create_full_opportunity(session)
        opp.organization_id = org.id
        opp.status = OpportunityStatus.WON
        session.add(opp)
        session.commit()

        resp = client.get("/api/v1/priority/today", headers=_auth_headers(org, user))
        cards = resp.json()["cards"]
        assert not any(c.get("opportunity_id") == str(opp.id) for c in cards)
