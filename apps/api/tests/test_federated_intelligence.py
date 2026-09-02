"""Tests for Federated Signal Intelligence — cross-tenant, anonymized,
opt-in confidence calibration.

Covers:
* FederatedSignalIntelligenceService.is_opted_in / get_prior /
  calibrate_confidence in isolation
* The k-anonymity floor (MIN_CONTRIBUTING_ORGS) — never returns a prior
  computed from too few distinct organizations
* Non-opted-in organizations never contribute to, or benefit from, the pool
* SignalEngine wiring — a signal's confidence is calibrated end-to-end when
  the ingesting organization has opted in, and left alone when it hasn't
"""

from __future__ import annotations

import uuid

from app.models.organization import Organization
from app.models.strategy_outcome import StrategyOutcome
from app.schemas.signal import CompanyRef, SignalWebhookIn
from app.services.federated_intelligence import FederatedSignalIntelligenceService
from app.services.federated_intelligence.service import MIN_CONTRIBUTING_ORGS
from app.services.signal_engine import SignalEngine


def _make_org(session, *, opted_in: bool = False) -> Organization:
    org = Organization(
        name="Acme Corp",
        slug=f"acme-{uuid.uuid4().hex[:8]}",
        federated_intelligence_opt_in=opted_in,
    )
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def _make_outcome(
    session,
    org: Organization,
    *,
    signal_type: str = "funding_round",
    industry: str | None = "saas",
    outcome: str = "won",
) -> StrategyOutcome:
    row = StrategyOutcome(
        organization_id=org.id,
        opportunity_id=uuid.uuid4(),
        signal_type=signal_type,
        company_industry=industry,
        outcome=outcome,
        playbook="post_funding_outreach",
        channel="email",
        generator="rule_based",
        generator_version="1",
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


class TestIsOptedIn:
    def test_none_organization_id_is_false(self, session) -> None:
        svc = FederatedSignalIntelligenceService(session)
        assert svc.is_opted_in(None) is False

    def test_unknown_organization_id_is_false(self, session) -> None:
        svc = FederatedSignalIntelligenceService(session)
        assert svc.is_opted_in(uuid.uuid4()) is False

    def test_opted_out_organization_is_false(self, session) -> None:
        org = _make_org(session, opted_in=False)
        svc = FederatedSignalIntelligenceService(session)
        assert svc.is_opted_in(org.id) is False

    def test_opted_in_organization_is_true(self, session) -> None:
        org = _make_org(session, opted_in=True)
        svc = FederatedSignalIntelligenceService(session)
        assert svc.is_opted_in(org.id) is True


class TestGetPrior:
    def test_no_data_returns_none(self, session) -> None:
        svc = FederatedSignalIntelligenceService(session)
        assert svc.get_prior("funding_round", "saas") is None

    def test_below_k_anonymity_floor_returns_none(self, session) -> None:
        assert MIN_CONTRIBUTING_ORGS >= 2  # sanity: the test below must stay under it
        for _ in range(MIN_CONTRIBUTING_ORGS - 1):
            org = _make_org(session, opted_in=True)
            _make_outcome(session, org, outcome="won")

        svc = FederatedSignalIntelligenceService(session)
        assert svc.get_prior("funding_round", "saas") is None

    def test_at_k_anonymity_floor_returns_aggregate(self, session) -> None:
        for i in range(MIN_CONTRIBUTING_ORGS):
            org = _make_org(session, opted_in=True)
            _make_outcome(session, org, outcome="won" if i % 2 == 0 else "lost")

        svc = FederatedSignalIntelligenceService(session)
        prior = svc.get_prior("funding_round", "saas")

        assert prior is not None
        assert prior.contributing_orgs == MIN_CONTRIBUTING_ORGS
        assert prior.sample_size == MIN_CONTRIBUTING_ORGS
        assert 0.0 <= prior.win_rate <= 1.0

    def test_non_opted_in_org_never_counted(self, session) -> None:
        for _ in range(MIN_CONTRIBUTING_ORGS):
            org = _make_org(session, opted_in=True)
            _make_outcome(session, org, outcome="won")
        # One more org contributes plenty of data but never opted in.
        silent_org = _make_org(session, opted_in=False)
        for _ in range(10):
            _make_outcome(session, silent_org, outcome="lost")

        svc = FederatedSignalIntelligenceService(session)
        prior = svc.get_prior("funding_round", "saas")

        assert prior is not None
        assert prior.contributing_orgs == MIN_CONTRIBUTING_ORGS
        assert prior.sample_size == MIN_CONTRIBUTING_ORGS
        assert prior.win_rate == 1.0  # only the opted-in WON rows counted

    def test_industry_bucket_is_isolated(self, session) -> None:
        for _ in range(MIN_CONTRIBUTING_ORGS):
            org = _make_org(session, opted_in=True)
            _make_outcome(session, org, industry="fintech", outcome="lost")

        svc = FederatedSignalIntelligenceService(session)
        # No fintech-bucket orgs contributed to the saas bucket.
        assert svc.get_prior("funding_round", "saas") is None
        fintech_prior = svc.get_prior("funding_round", "fintech")
        assert fintech_prior is not None
        assert fintech_prior.win_rate == 0.0

    def test_multiple_outcomes_from_same_org_count_once_toward_org_floor(self, session) -> None:
        """Contributing_orgs is a distinct-org count, not a row count — one
        very active organization can't fake k-anonymity on its own."""
        org = _make_org(session, opted_in=True)
        for _ in range(20):
            _make_outcome(session, org, outcome="won")

        svc = FederatedSignalIntelligenceService(session)
        assert svc.get_prior("funding_round", "saas") is None


class TestCalibrateConfidence:
    def test_non_opted_in_org_confidence_unchanged(self, session) -> None:
        org = _make_org(session, opted_in=False)
        svc = FederatedSignalIntelligenceService(session)

        confidence, prior = svc.calibrate_confidence(
            organization_id=org.id, signal_type="funding_round", industry="saas", base_confidence=0.5
        )
        assert confidence == 0.5
        assert prior is None

    def test_no_prior_available_confidence_unchanged(self, session) -> None:
        org = _make_org(session, opted_in=True)
        svc = FederatedSignalIntelligenceService(session)

        confidence, prior = svc.calibrate_confidence(
            organization_id=org.id, signal_type="funding_round", industry="saas", base_confidence=0.5
        )
        assert confidence == 0.5
        assert prior is None

    def test_prior_pulls_confidence_toward_cross_tenant_win_rate(self, session) -> None:
        for _ in range(MIN_CONTRIBUTING_ORGS):
            contributor = _make_org(session, opted_in=True)
            _make_outcome(session, contributor, outcome="won")  # 100% win rate bucket

        org = _make_org(session, opted_in=True)
        svc = FederatedSignalIntelligenceService(session)

        confidence, prior = svc.calibrate_confidence(
            organization_id=org.id, signal_type="funding_round", industry="saas", base_confidence=0.5
        )

        assert prior is not None
        assert prior.win_rate == 1.0
        # Pulled up toward 1.0, but never all the way — the cap must hold.
        assert 0.5 < confidence < 1.0

    def test_calibration_never_exceeds_the_max_weight_cap(self, session) -> None:
        """However much data backs the prior, it can only ever move
        confidence by _MAX_PRIOR_WEIGHT — it augments, never overrides."""
        from app.services.federated_intelligence.service import _MAX_PRIOR_WEIGHT

        for _ in range(50):
            contributor = _make_org(session, opted_in=True)
            _make_outcome(session, contributor, outcome="won")

        org = _make_org(session, opted_in=True)
        svc = FederatedSignalIntelligenceService(session)

        confidence, prior = svc.calibrate_confidence(
            organization_id=org.id, signal_type="funding_round", industry="saas", base_confidence=0.0
        )
        assert prior is not None
        assert confidence <= _MAX_PRIOR_WEIGHT + 1e-9


class TestSignalEngineFederatedWiring:
    def _funding_payload(self, domain: str) -> SignalWebhookIn:
        return SignalWebhookIn(
            title="Acme Corp raised a $20M Series B",
            event="funding.round.announced",
            external_id=f"provider:evt_{uuid.uuid4().hex[:8]}",
            company=CompanyRef(name="Acme Corp", domain=domain, industry="saas"),
        )

    def test_opted_in_org_confidence_is_calibrated_and_recorded(self, session) -> None:
        for _ in range(MIN_CONTRIBUTING_ORGS):
            contributor = _make_org(session, opted_in=True)
            _make_outcome(session, contributor, outcome="won")

        org = _make_org(session, opted_in=True)
        engine = SignalEngine(session)
        outcome = engine.ingest(
            self._funding_payload(f"acme-{uuid.uuid4().hex[:8]}.com"), organization_id=org.id
        )

        assert "federated_prior" in outcome.signal.analysis
        assert outcome.signal.analysis["federated_prior"]["contributing_orgs"] == MIN_CONTRIBUTING_ORGS

    def test_non_opted_in_org_ingestion_unaffected(self, session) -> None:
        for _ in range(MIN_CONTRIBUTING_ORGS):
            contributor = _make_org(session, opted_in=True)
            _make_outcome(session, contributor, outcome="won")

        org = _make_org(session, opted_in=False)
        engine = SignalEngine(session)
        outcome = engine.ingest(
            self._funding_payload(f"acme-{uuid.uuid4().hex[:8]}.com"), organization_id=org.id
        )

        assert "federated_prior" not in outcome.signal.analysis

    def test_no_organization_id_ingestion_unaffected(self, session) -> None:
        """Every pre-multi-tenant caller (no API key resolved) must see
        zero behavior change — same invariant AutopilotGuardrailService and
        RevenueContinuityService both preserve for organization_id=None."""
        engine = SignalEngine(session)
        outcome = engine.ingest(self._funding_payload(f"acme-{uuid.uuid4().hex[:8]}.com"))

        assert "federated_prior" not in outcome.signal.analysis
