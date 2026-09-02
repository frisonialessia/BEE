"""Tests for lifecycle-aware strategy generation — the Revenue Continuity
Radar's playbook layer on top of Opportunity.opportunity_type.

Covers:
* ExpansionStrategyGenerator / RenewalRiskStrategyGenerator in isolation
* Priority ordering: these preempt the signal-type-specific generators
  (Funding/Hiring) for an existing customer, without changing anything for
  a net-new prospect
* End-to-end via SignalEngine + StrategyGeneratorService: an existing
  customer's opportunity gets the lifecycle-aware playbook, a net-new
  prospect's doesn't
* llm_prompt.build_user_prompt's ACCOUNT LIFECYCLE section
"""

from __future__ import annotations

import uuid

from app.models.base import EXPANSION, NEW_LOGO, RENEWAL_RISK, OpportunityStatus, SignalType
from app.schemas.signal import CompanyRef, SignalWebhookIn
from app.services.signal_engine import SignalEngine
from app.services.strategy_generator.base import EnrichmentContext
from app.services.strategy_generator.rule_based import (
    ExpansionStrategyGenerator,
    RenewalRiskStrategyGenerator,
)


def _funding_ctx(opportunity_type: str = NEW_LOGO) -> EnrichmentContext:
    return EnrichmentContext(
        signal_type=SignalType.FUNDING_ROUND,
        signal_title="Acme Corp raised a $20M Series B",
        signal_score=80.0,
        company_name="Acme Corp",
        opportunity_type=opportunity_type,
    )


def _leadership_ctx(opportunity_type: str = NEW_LOGO) -> EnrichmentContext:
    return EnrichmentContext(
        signal_type=SignalType.LEADERSHIP_CHANGE,
        signal_title="Acme Corp announced a new Chief Revenue Officer",
        signal_score=70.0,
        company_name="Acme Corp",
        lead_name="Jane Doe",
        opportunity_type=opportunity_type,
    )


class TestExpansionStrategyGenerator:
    def test_supports_only_expansion_opportunity_type(self) -> None:
        gen = ExpansionStrategyGenerator()
        assert gen.supports(_funding_ctx(EXPANSION)) is True
        assert gen.supports(_funding_ctx(NEW_LOGO)) is False
        assert gen.supports(_funding_ctx(RENEWAL_RISK)) is False

    def test_generates_upsell_framed_battlecard(self) -> None:
        gen = ExpansionStrategyGenerator()
        strategy = gen.generate(_funding_ctx(EXPANSION))

        assert strategy.generator == "expansion_strategy"
        assert strategy.playbook == "expansion_upsell_outreach"
        assert strategy.is_battlecard_complete()
        assert "ya es cliente" in strategy.pain_point or "ya es cliente" in strategy.pain_point.lower()


class TestRenewalRiskStrategyGenerator:
    def test_supports_only_renewal_risk_opportunity_type(self) -> None:
        gen = RenewalRiskStrategyGenerator()
        assert gen.supports(_leadership_ctx(RENEWAL_RISK)) is True
        assert gen.supports(_leadership_ctx(NEW_LOGO)) is False
        assert gen.supports(_leadership_ctx(EXPANSION)) is False

    def test_generates_retention_framed_battlecard(self) -> None:
        gen = RenewalRiskStrategyGenerator()
        strategy = gen.generate(_leadership_ctx(RENEWAL_RISK))

        assert strategy.generator == "renewal_risk_strategy"
        assert strategy.playbook == "renewal_risk_retention"
        assert strategy.timing_window.urgency == "immediate"
        assert strategy.is_battlecard_complete()


class TestGeneratorPriorityOrdering:
    def test_expansion_preempts_funding_generator(self) -> None:
        from app.services.strategy_generator.registry import get_strategy_generators

        ctx = _funding_ctx(EXPANSION)
        matching = [g for g in get_strategy_generators() if g.supports(ctx)]
        # ExpansionStrategyGenerator (150) must sort before FundingStrategyGenerator (100).
        assert matching[0].name == "expansion_strategy"

    def test_renewal_risk_preempts_hiring_generator(self) -> None:
        from app.services.strategy_generator.registry import get_strategy_generators

        ctx = _leadership_ctx(RENEWAL_RISK)
        matching = [g for g in get_strategy_generators() if g.supports(ctx)]
        assert matching[0].name == "renewal_risk_strategy"

    def test_new_logo_still_uses_funding_generator(self) -> None:
        """The whole pre-existing net-new pipeline is untouched."""
        from app.services.strategy_generator.registry import get_strategy_generators

        ctx = _funding_ctx(NEW_LOGO)
        matching = [g for g in get_strategy_generators() if g.supports(ctx)]
        assert matching[0].name == "funding_strategy"


class TestEndToEndViaSignalEngine:
    def _funding_payload(self, domain: str, **overrides) -> SignalWebhookIn:
        base = {
            "title": "Acme Corp raised a $20M Series B",
            "event": "funding.round.announced",
            "external_id": f"provider:evt_{uuid.uuid4().hex[:8]}",
            "company": CompanyRef(name="Acme Corp", domain=domain),
        }
        base.update(overrides)
        return SignalWebhookIn(**base)

    def _leadership_payload(self, domain: str) -> SignalWebhookIn:
        return SignalWebhookIn(
            title="Acme Corp announced a new Chief Revenue Officer",
            event="hiring.leadership",
            external_id=f"provider:evt_{uuid.uuid4().hex[:8]}",
            company=CompanyRef(name="Acme Corp", domain=domain),
        )

    def test_existing_customer_gets_expansion_playbook(self, session) -> None:
        domain = f"customer-{uuid.uuid4().hex[:8]}.example.com"
        engine = SignalEngine(session)

        first = engine.ingest(self._funding_payload(domain))
        first.opportunity.status = OpportunityStatus.WON
        session.add(first.opportunity)
        session.commit()

        second = engine.ingest(self._funding_payload(domain, external_id=f"provider:evt_{uuid.uuid4().hex[:8]}"))

        assert second.opportunity is not None
        assert second.opportunity.opportunity_type == EXPANSION
        assert second.opportunity.strategy.get("generator") == "expansion_strategy"
        assert second.opportunity.strategy.get("playbook") == "expansion_upsell_outreach"

    def test_existing_customer_gets_renewal_risk_playbook(self, session) -> None:
        domain = f"customer-{uuid.uuid4().hex[:8]}.example.com"
        engine = SignalEngine(session)

        first = engine.ingest(self._funding_payload(domain))
        first.opportunity.status = OpportunityStatus.WON
        session.add(first.opportunity)
        session.commit()

        second = engine.ingest(self._leadership_payload(domain))

        assert second.opportunity is not None
        assert second.opportunity.opportunity_type == RENEWAL_RISK
        assert second.opportunity.strategy.get("generator") == "renewal_risk_strategy"
        assert second.opportunity.strategy.get("playbook") == "renewal_risk_retention"

    def test_net_new_prospect_still_gets_funding_playbook(self, session) -> None:
        engine = SignalEngine(session)
        outcome = engine.ingest(self._funding_payload(f"prospect-{uuid.uuid4().hex[:8]}.example.com"))

        assert outcome.opportunity is not None
        assert outcome.opportunity.opportunity_type == NEW_LOGO
        assert outcome.opportunity.strategy.get("generator") == "funding_strategy"


class TestPromptAccountLifecycleSection:
    def test_expansion_section_present(self) -> None:
        from app.services.strategy_generator.llm_prompt import build_user_prompt

        prompt = build_user_prompt(_funding_ctx(EXPANSION))
        assert "ACCOUNT LIFECYCLE: EXISTING CUSTOMER — EXPANSION SIGNAL" in prompt

    def test_renewal_risk_section_present(self) -> None:
        from app.services.strategy_generator.llm_prompt import build_user_prompt

        prompt = build_user_prompt(_leadership_ctx(RENEWAL_RISK))
        assert "ACCOUNT LIFECYCLE: EXISTING CUSTOMER — RENEWAL RISK" in prompt

    def test_new_logo_omits_lifecycle_section(self) -> None:
        """Same pattern as CEO BRAND VOICE's own omission test: the
        unconditional task instruction mentions "ACCOUNT LIFECYCLE" by
        name regardless, so only the section *header* — the thing that
        would actually carry lifecycle-specific instructions — must be
        absent for the untouched net-new-prospect path."""
        from app.services.strategy_generator.llm_prompt import build_user_prompt

        prompt = build_user_prompt(_funding_ctx(NEW_LOGO))
        assert "=== ACCOUNT LIFECYCLE:" not in prompt
