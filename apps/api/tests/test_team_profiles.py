"""Tests for TeamProfile — per-team signal weighting and research focus.

Covers:
* TeamProfileService — create/replace, cross-org protection, lookup helpers
* PriorityFeedService — a team's signal_weights actually re-scores its feed
* AccountResearchAgent — research_focus reaches the LLM system prompt

Endpoint-level CRUD/permission tests (PUT/GET /teams/{id}/profile, 403/404/422)
live in test_auth_multitenancy.py's TestTeamProfileEndpoints, next to the rest
of the /teams endpoint coverage.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import patch

from sqlmodel import Session

from app.core.config import settings as app_settings
from app.models.base import OpportunityStatus, SignalType
from app.models.company import Company
from app.models.lead import Lead
from app.models.opportunity import Opportunity
from app.models.organization import Organization
from app.models.signal import Signal, SignalSource
from app.models.team import Team
from app.schemas.team_profile import TeamProfileIn
from app.services.account_research import AccountResearchAgent
from app.services.external_api.interface import ExternalProfileResult
from app.services.priority_feed import build_today_feed
from app.services.team_profile import TeamProfileService


def _make_org_and_team(session: Session) -> tuple[Organization, Team]:
    org = Organization(name="Acme Corp", slug=f"acme-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)

    team = Team(organization_id=org.id, name="Franchise Sales")
    session.add(team)
    session.commit()
    session.refresh(team)
    return org, team


class TestTeamProfileService:
    def test_create_and_get(self, session: Session) -> None:
        org, team = _make_org_and_team(session)
        svc = TeamProfileService(session)

        profile = svc.create_or_update(
            team.id, org.id, TeamProfileIn(signal_weights={"franchise_expansion": 2.0}, research_focus="LATAM retail")
        )
        session.commit()

        assert profile is not None
        assert profile.signal_weights["franchise_expansion"] == 2.0

        fetched = svc.get(team.id, org.id)
        assert fetched is not None
        assert fetched.research_focus == "LATAM retail"

    def test_create_or_update_replaces_wholesale(self, session: Session) -> None:
        org, team = _make_org_and_team(session)
        svc = TeamProfileService(session)

        svc.create_or_update(team.id, org.id, TeamProfileIn(signal_weights={"hiring": 1.5}, research_focus="Original"))
        session.commit()

        replaced = svc.create_or_update(team.id, org.id, TeamProfileIn(signal_weights={}, research_focus=None))
        session.commit()

        assert replaced is not None
        assert replaced.signal_weights == {}
        assert replaced.research_focus is None

    def test_create_or_update_rejects_cross_org_team(self, session: Session) -> None:
        org, team = _make_org_and_team(session)
        other_org = Organization(name="Other Org", slug=f"other-{uuid.uuid4().hex[:8]}")
        session.add(other_org)
        session.commit()
        session.refresh(other_org)

        svc = TeamProfileService(session)
        result = svc.create_or_update(team.id, other_org.id, TeamProfileIn(signal_weights={}))
        assert result is None

    def test_get_signal_weight_defaults_to_neutral(self, session: Session) -> None:
        org, team = _make_org_and_team(session)
        svc = TeamProfileService(session)

        # No profile at all.
        assert svc.get_signal_weight(team.id, "funding_round") == 1.0
        # No team.
        assert svc.get_signal_weight(None, "funding_round") == 1.0

        svc.create_or_update(team.id, org.id, TeamProfileIn(signal_weights={"funding_round": 0.3}))
        session.commit()

        # Configured type reflects the weight; unmentioned type stays neutral.
        assert svc.get_signal_weight(team.id, "funding_round") == 0.3
        assert svc.get_signal_weight(team.id, "hiring") == 1.0

    def test_get_research_focus_defaults_to_none(self, session: Session) -> None:
        org, team = _make_org_and_team(session)
        svc = TeamProfileService(session)

        assert svc.get_research_focus(team.id) is None
        assert svc.get_research_focus(None) is None

        svc.create_or_update(team.id, org.id, TeamProfileIn(signal_weights={}, research_focus="Focus text"))
        session.commit()
        assert svc.get_research_focus(team.id) == "Focus text"


class TestPriorityFeedTeamWeighting:
    def _make_opportunity(self, session: Session, org: Organization) -> Opportunity:
        company = Company(name="Test Corp", organization_id=org.id, created_at=datetime.now(UTC), updated_at=datetime.now(UTC))
        session.add(company)
        session.flush()

        lead = Lead(
            company_id=company.id, full_name="Jane Doe", email=f"jane.{uuid.uuid4().hex[:6]}@testcorp.com",
            created_at=datetime.now(UTC), updated_at=datetime.now(UTC),
        )
        session.add(lead)
        session.flush()

        signal = Signal(
            company_id=company.id, organization_id=org.id, signal_type=SignalType.FUNDING_ROUND,
            title="Test Corp raised $5M", raw_payload={}, source=SignalSource.WEBHOOK,
            created_at=datetime.now(UTC), updated_at=datetime.now(UTC),
        )
        session.add(signal)
        session.flush()

        opp = Opportunity(
            lead_id=lead.id, company_id=company.id, signal_id=signal.id, organization_id=org.id,
            title="Test Opportunity", score=72.0, status=OpportunityStatus.READY_TO_ACTION,
            strategy={"playbook": "post_funding_outreach"},
            created_at=datetime.now(UTC), updated_at=datetime.now(UTC),
        )
        session.add(opp)
        session.commit()
        session.refresh(opp)
        return opp

    def test_team_weight_rescales_the_card_score(self, session: Session) -> None:
        org, team = _make_org_and_team(session)
        opp = self._make_opportunity(session, org)

        baseline = build_today_feed(session, organization_id=org.id, visible_user_ids=None, team_id=None)
        baseline_card = next(c for c in baseline.cards if c.opportunity_id == opp.id)

        TeamProfileService(session).create_or_update(
            team.id, org.id, TeamProfileIn(signal_weights={"funding_round": 0.1})
        )
        session.commit()

        weighted = build_today_feed(session, organization_id=org.id, visible_user_ids=None, team_id=team.id)
        weighted_card = next(c for c in weighted.cards if c.opportunity_id == opp.id)

        assert weighted_card.score == round(baseline_card.score * 0.1, 4)

    def test_no_team_profile_leaves_score_unchanged(self, session: Session) -> None:
        org, team = _make_org_and_team(session)
        opp = self._make_opportunity(session, org)

        baseline = build_today_feed(session, organization_id=org.id, visible_user_ids=None, team_id=None)
        with_team_but_no_profile = build_today_feed(session, organization_id=org.id, visible_user_ids=None, team_id=team.id)

        baseline_card = next(c for c in baseline.cards if c.opportunity_id == opp.id)
        team_card = next(c for c in with_team_but_no_profile.cards if c.opportunity_id == opp.id)
        assert baseline_card.score == team_card.score


class TestAccountResearchAgentTeamFocus:
    def test_research_focus_reaches_llm_system_prompt(self, session: Session) -> None:
        org = Organization(name="Acme Corp", slug=f"acme-{uuid.uuid4().hex[:8]}")
        session.add(org)
        session.commit()
        session.refresh(org)

        company = Company(name="Prospect Co", domain="prospect-co.com", organization_id=org.id)
        session.add(company)
        session.commit()
        session.refresh(company)

        captured_kwargs: dict = {}

        def _fake_create(**kwargs):
            captured_kwargs.update(kwargs)
            msg = type("M", (), {"content": "Summary."})()
            choice = type("C", (), {"message": msg})()
            return type("R", (), {"choices": [choice]})()

        with (
            patch.object(app_settings, "ACCOUNT_RESEARCH_ENABLED", True),
            patch.object(app_settings, "AI_PROVIDER", "openai"),
            patch.object(app_settings, "AI_API_KEY", "sk-test"),
            patch(
                "app.services.external_api.orchestrator.ExternalAPIOrchestrator.enrich_company_from_domain",
                return_value=ExternalProfileResult(provider="website", success=True, company_description="A logistics startup."),
            ),
            patch(
                "app.services.external_api.orchestrator.ExternalAPIOrchestrator.scan_hiring_signals",
                return_value=type("R", (), {"success": False, "items": []})(),
            ),
            patch(
                "app.services.external_api.orchestrator.ExternalAPIOrchestrator.scan_market_news",
                return_value=type("R", (), {"success": False, "items": []})(),
            ),
            patch("openai.OpenAI") as mock_openai_cls,
        ):
            mock_openai_cls.return_value.chat.completions.create.side_effect = _fake_create
            outcome = AccountResearchAgent(session).research(
                company, organization_id=org.id, force=True,
                research_focus="Focus on regulatory readiness for LATAM fintech accounts.",
            )

        assert outcome.brief is not None
        assert outcome.brief.generated_by == "llm"
        system_message = captured_kwargs["messages"][0]["content"]
        assert "LATAM fintech" in system_message

    def test_no_research_focus_is_a_no_op(self, session: Session) -> None:
        """research_focus=None (the default) must not change the prompt at
        all — same behavior as before this feature existed."""
        org = Organization(name="Acme Corp", slug=f"acme-{uuid.uuid4().hex[:8]}")
        session.add(org)
        session.commit()
        session.refresh(org)

        company = Company(name="Prospect Co", domain="prospect-co.com", organization_id=org.id)
        session.add(company)
        session.commit()
        session.refresh(company)

        with (
            patch.object(app_settings, "ACCOUNT_RESEARCH_ENABLED", True),
            patch.object(app_settings, "AI_PROVIDER", "none"),
            patch(
                "app.services.external_api.orchestrator.ExternalAPIOrchestrator.enrich_company_from_domain",
                return_value=ExternalProfileResult(provider="website", success=True, company_description="A logistics startup."),
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

        assert outcome.brief is not None
        assert outcome.brief.generated_by == "template"
