"""Tests for the Revenue Continuity Radar.

Covers:
* RevenueContinuityService.classify — the lifecycle-bucket decision, in
  isolation
* SignalEngine._create_opportunity — end-to-end wiring: a signal on a
  company that already has a WON opportunity gets opportunity_type
  expansion/renewal_risk instead of the default new_logo
* Organization scoping of "does this company already have a WON opportunity"
"""

from __future__ import annotations

import uuid

from app.models.base import (
    EXPANSION,
    NEW_LOGO,
    RENEWAL_RISK,
    OpportunityStatus,
    SignalType,
)
from app.models.company import Company
from app.models.opportunity import Opportunity
from app.models.organization import Organization
from app.schemas.signal import CompanyRef, LeadRef, SignalWebhookIn
from app.services.revenue_continuity import RevenueContinuityService
from app.services.signal_engine import SignalEngine


def _make_org(session) -> Organization:
    org = Organization(name="Acme Corp", slug=f"acme-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def _make_company(session, organization_id: uuid.UUID | None = None) -> Company:
    company = Company(
        name="Acme Corp",
        domain=f"acme-{uuid.uuid4().hex[:8]}.com",
        organization_id=organization_id,
    )
    session.add(company)
    session.commit()
    session.refresh(company)
    return company


def _make_opportunity(
    session,
    company: Company,
    status: OpportunityStatus,
    organization_id: uuid.UUID | None = None,
) -> Opportunity:
    opp = Opportunity(
        title="Acme Corp — existing deal",
        status=status,
        company_id=company.id,
        organization_id=organization_id,
    )
    session.add(opp)
    session.commit()
    session.refresh(opp)
    return opp


class TestRevenueContinuityServiceClassify:
    def test_no_company_id_is_new_logo(self, session) -> None:
        svc = RevenueContinuityService(session)
        result = svc.classify(company_id=None, signal_type=SignalType.FUNDING_ROUND)
        assert result == NEW_LOGO

    def test_prospect_without_won_opportunity_is_new_logo(self, session) -> None:
        company = _make_company(session)
        svc = RevenueContinuityService(session)
        result = svc.classify(company_id=company.id, signal_type=SignalType.FUNDING_ROUND)
        assert result == NEW_LOGO

    def test_lost_opportunity_does_not_count_as_customer(self, session) -> None:
        company = _make_company(session)
        _make_opportunity(session, company, OpportunityStatus.LOST)
        svc = RevenueContinuityService(session)
        result = svc.classify(company_id=company.id, signal_type=SignalType.FUNDING_ROUND)
        assert result == NEW_LOGO

    def test_existing_customer_funding_round_is_expansion(self, session) -> None:
        company = _make_company(session)
        _make_opportunity(session, company, OpportunityStatus.WON)
        svc = RevenueContinuityService(session)
        result = svc.classify(company_id=company.id, signal_type=SignalType.FUNDING_ROUND)
        assert result == EXPANSION

    def test_existing_customer_hiring_is_expansion(self, session) -> None:
        company = _make_company(session)
        _make_opportunity(session, company, OpportunityStatus.WON)
        svc = RevenueContinuityService(session)
        result = svc.classify(company_id=company.id, signal_type=SignalType.HIRING)
        assert result == EXPANSION

    def test_existing_customer_leadership_change_is_renewal_risk(self, session) -> None:
        company = _make_company(session)
        _make_opportunity(session, company, OpportunityStatus.WON)
        svc = RevenueContinuityService(session)
        result = svc.classify(company_id=company.id, signal_type=SignalType.LEADERSHIP_CHANGE)
        assert result == RENEWAL_RISK

    def test_existing_customer_unrecognized_signal_type_is_still_new_logo(self, session) -> None:
        company = _make_company(session)
        _make_opportunity(session, company, OpportunityStatus.WON)
        svc = RevenueContinuityService(session)
        result = svc.classify(company_id=company.id, signal_type=SignalType.NEWS_MENTION)
        assert result == NEW_LOGO

    def test_organization_scoping_isolates_won_history(self, session) -> None:
        org_a = _make_org(session)
        org_b = _make_org(session)
        company = _make_company(session, organization_id=org_a.id)
        _make_opportunity(session, company, OpportunityStatus.WON, organization_id=org_a.id)

        svc = RevenueContinuityService(session)
        assert (
            svc.classify(
                company_id=company.id,
                signal_type=SignalType.FUNDING_ROUND,
                organization_id=org_a.id,
            )
            == EXPANSION
        )
        assert (
            svc.classify(
                company_id=company.id,
                signal_type=SignalType.FUNDING_ROUND,
                organization_id=org_b.id,
            )
            == NEW_LOGO
        )


class TestSignalEngineOpportunityTypeWiring:
    def _funding_payload(self, domain: str, **overrides) -> SignalWebhookIn:
        base = {
            "title": "Acme Corp raised a $20M Series B",
            "event": "funding.round.announced",
            "external_id": f"provider:evt_{uuid.uuid4().hex[:8]}",
            "company": CompanyRef(name="Acme Corp", domain=domain),
            "lead": LeadRef(full_name="Jane Doe", email="jane@acme.com", title="VP Sales"),
        }
        base.update(overrides)
        return SignalWebhookIn(**base)

    def _leadership_payload(self, domain: str, **overrides) -> SignalWebhookIn:
        base = {
            "title": "Acme Corp announced a new Chief Revenue Officer",
            "event": "hiring.leadership",
            "external_id": f"provider:evt_{uuid.uuid4().hex[:8]}",
            "company": CompanyRef(name="Acme Corp", domain=domain),
        }
        base.update(overrides)
        return SignalWebhookIn(**base)

    def test_first_signal_on_new_company_is_new_logo(self, session) -> None:
        engine = SignalEngine(session)
        outcome = engine.ingest(self._funding_payload("newco.example.com"))

        assert outcome.opportunity is not None
        assert outcome.opportunity.opportunity_type == NEW_LOGO
        assert outcome.opportunity.title.startswith("Opportunity:")

    def test_signal_on_existing_customer_is_expansion(self, session) -> None:
        domain = f"customer-{uuid.uuid4().hex[:8]}.example.com"
        engine = SignalEngine(session)

        first = engine.ingest(self._funding_payload(domain))
        first.opportunity.status = OpportunityStatus.WON
        session.add(first.opportunity)
        session.commit()

        second = engine.ingest(self._funding_payload(domain, external_id=f"provider:evt_{uuid.uuid4().hex[:8]}"))

        assert second.opportunity is not None
        assert second.opportunity.opportunity_type == EXPANSION
        assert second.opportunity.title.startswith("Expansion opportunity:")

    def test_leadership_change_on_existing_customer_is_renewal_risk(self, session) -> None:
        domain = f"customer-{uuid.uuid4().hex[:8]}.example.com"
        engine = SignalEngine(session)

        first = engine.ingest(self._funding_payload(domain))
        first.opportunity.status = OpportunityStatus.WON
        session.add(first.opportunity)
        session.commit()

        second = engine.ingest(self._leadership_payload(domain))

        assert second.opportunity is not None
        assert second.opportunity.opportunity_type == RENEWAL_RISK
        assert second.opportunity.title.startswith("Renewal risk:")

    def test_leadership_change_on_prospect_is_still_new_logo(self, session) -> None:
        """The whole existing acquisition motion is unaffected: a prospect
        BEE has never closed still gets normal new_logo classification even
        for a signal type that would flag risk on an existing customer."""
        engine = SignalEngine(session)
        outcome = engine.ingest(self._leadership_payload(f"prospect-{uuid.uuid4().hex[:8]}.example.com"))

        assert outcome.opportunity is not None
        assert outcome.opportunity.opportunity_type == NEW_LOGO
