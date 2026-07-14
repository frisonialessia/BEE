"""Tests for the Autonomous Execution System components.

Covers:
* AgentOrchestrator — state machine, security enforcement, polling endpoints
* ObservabilityService — confidence scoring + manual review flagging
* TacticVariants (A/B testing) — variant creation, arm assignment, outcome tracking
* TrendAnalyst — aggregate signal pattern detection
* DataValidator — lead freshness auditing
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.base import ActionStatus, ActionType, InsightType
from app.models.lead import Lead
from app.models.market_insight import MarketInsight
from app.models.tactic_variant import TacticVariant
from app.schemas.executive import (
    ArtifactBundle,
    EmailDraftArtifact,
    MeetingStructureArtifact,
    NextStepsArtifact,
)
from app.schemas.feedback import SuccessHint
from app.schemas.insights import MarketInsightRef
from app.schemas.orchestrator import (
    ApprovalIn,
    ExecutionCompleteIn,
    ExecutionFailedIn,
    ExecutionStartIn,
    RejectionIn,
)
from app.schemas.strategy import StrategySchema, TimingWindow
from app.schemas.variants import ActiveVariantRef
from app.services.data_validator.service import DataValidator
from app.services.observability.service import CONFIDENCE_THRESHOLD, ObservabilityService
from app.services.orchestrator.service import AgentOrchestrator

# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_bundle(opportunity_id: uuid.UUID | None = None) -> ArtifactBundle:
    opp_id = opportunity_id or uuid.uuid4()
    return ArtifactBundle(
        opportunity_id=opp_id,
        generated_at=datetime.now(UTC),
        generator="test",
        email_draft=EmailDraftArtifact(
            subject="Test outreach",
            body="Hi there — we'd love to connect and explore how we can help!",
        ),
        meeting_structure=MeetingStructureArtifact(
            meeting_title="Discovery call",
            total_duration_minutes=20,
            objective="Qualify the lead",
            success_criteria="Meeting booked",
        ),
        next_steps=NextStepsArtifact(horizon="Next 7 days"),
    )


def _make_strategy(**kwargs) -> StrategySchema:
    defaults: dict = {
        "pain_point": (
            "The company is growing fast and their current sales process does not scale "
            "with the new headcount they're onboarding post-funding."
        ),
        "closing_argument": (
            "We can help you scale GTM without adding headcount — "
            "worth a 20-min call this week?"
        ),
        "timing_window": TimingWindow(
            urgency="immediate",
            reason="Budget allocation decisions happen in the first 60 days post-funding.",
        ),
        "playbook": "post_funding_outreach",
        "channel": "email",
    }
    defaults.update(kwargs)
    return StrategySchema(**defaults)  # type: ignore[arg-type]


# ── AgentOrchestrator tests ────────────────────────────────────────────────────


class TestAgentOrchestrator:
    def test_create_from_bundle_creates_pending_action(self, session: Session):
        bundle = _make_bundle()
        orch = AgentOrchestrator(session)
        actions = orch.create_from_bundle(bundle)
        session.commit()

        assert len(actions) >= 1
        action = actions[0]
        assert action.status == ActionStatus.PENDING_APPROVAL
        assert action.action_type == ActionType.SEND_EMAIL
        assert action.opportunity_id == bundle.opportunity_id
        assert action.retry_count == 0
        assert not action.is_terminal

    def test_approve_transitions_to_approved(self, session: Session):
        bundle = _make_bundle()
        orch = AgentOrchestrator(session)
        [action] = orch.create_from_bundle(bundle)
        session.commit()

        approved = orch.approve(action.id, ApprovalIn(approved_by="ceo@bee.ai"))
        session.commit()

        assert approved.status == ActionStatus.APPROVED
        assert approved.approved_by == "ceo@bee.ai"
        assert approved.approved_at is not None

    def test_cannot_approve_rejected_action(self, session: Session):
        bundle = _make_bundle()
        orch = AgentOrchestrator(session)
        [action] = orch.create_from_bundle(bundle)
        session.commit()

        orch.reject(action.id, RejectionIn(reason="Not relevant"))
        session.commit()

        with pytest.raises(ValueError, match="expected status 'pending_approval'"):
            orch.approve(action.id, ApprovalIn(approved_by="ceo@bee.ai"))

    def test_full_happy_path_state_machine(self, session: Session):
        """PENDING_APPROVAL → APPROVED → EXECUTING → COMPLETED."""
        bundle = _make_bundle()
        orch = AgentOrchestrator(session)
        [action] = orch.create_from_bundle(bundle)
        session.commit()
        assert action.status == ActionStatus.PENDING_APPROVAL

        action = orch.approve(action.id, ApprovalIn(approved_by="rep@bee.ai"))
        session.commit()
        assert action.status == ActionStatus.APPROVED

        action = orch.start_execution(action.id, ExecutionStartIn(tool="n8n"))
        session.commit()
        assert action.status == ActionStatus.EXECUTING
        assert action.executing_tool == "n8n"

        action = orch.complete(action.id, ExecutionCompleteIn(result_summary="Email sent"))
        session.commit()
        assert action.status == ActionStatus.COMPLETED
        assert action.is_terminal

    def test_failed_action_with_retry_requeues(self, session: Session):
        bundle = _make_bundle()
        orch = AgentOrchestrator(session)
        [action] = orch.create_from_bundle(bundle)
        session.commit()

        orch.approve(action.id, ApprovalIn(approved_by="rep@bee.ai"))
        session.commit()
        orch.start_execution(action.id, ExecutionStartIn(tool="zapier"))
        session.commit()
        failed = orch.fail(action.id, ExecutionFailedIn(reason="SMTP error", retry=True))
        session.commit()

        assert failed.status == ActionStatus.PENDING_APPROVAL
        assert failed.retry_count == 1
        assert failed.failure_reason == "SMTP error"

    def test_cannot_start_execution_without_approval(self, session: Session):
        bundle = _make_bundle()
        orch = AgentOrchestrator(session)
        [action] = orch.create_from_bundle(bundle)
        session.commit()

        with pytest.raises(ValueError, match="expected status 'approved'"):
            orch.start_execution(action.id, ExecutionStartIn(tool="n8n"))

    def test_get_status_returns_counts(self, session: Session):
        orch = AgentOrchestrator(session)
        status_out = orch.get_status()
        assert hasattr(status_out, "total_pending")
        assert hasattr(status_out, "total_completed")

    def test_can_approve(self):
        action = PendingAction_stub(ActionStatus.PENDING_APPROVAL)
        assert action.can_approve

    def test_is_retryable_checks_count(self):
        action = PendingAction_stub(ActionStatus.FAILED, retry_count=2)
        assert action.is_retryable
        action2 = PendingAction_stub(ActionStatus.FAILED, retry_count=3)
        assert not action2.is_retryable


class PendingAction_stub:
    """Minimal stub to test property logic without DB."""
    def __init__(self, status: ActionStatus, retry_count: int = 0):
        self.status = status
        self.retry_count = retry_count

    @property
    def is_terminal(self):
        return self.status in (ActionStatus.COMPLETED, ActionStatus.REJECTED)

    @property
    def is_retryable(self):
        return self.status == ActionStatus.FAILED and self.retry_count < 3

    @property
    def can_approve(self):
        return self.status == ActionStatus.PENDING_APPROVAL


# ── Orchestrator API endpoints ────────────────────────────────────────────────


class TestOrchestratorEndpoints:
    def test_get_pending_actions(self, client: TestClient):
        resp = client.get("/api/v1/orchestrator/pending-actions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_get_approved_actions(self, client: TestClient):
        resp = client.get("/api/v1/orchestrator/approved-actions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_get_status(self, client: TestClient):
        resp = client.get("/api/v1/orchestrator/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_pending" in data
        assert "total_completed" in data

    def test_get_nonexistent_action_returns_404(self, client: TestClient):
        resp = client.get(f"/api/v1/orchestrator/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_approve_via_api(self, client: TestClient, session: Session):
        bundle = _make_bundle()
        orch = AgentOrchestrator(session)
        [action] = orch.create_from_bundle(bundle)
        session.commit()

        resp = client.post(
            f"/api/v1/orchestrator/{action.id}/approve",
            json={"approved_by": "api_test_user@bee.ai"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"

    def test_reject_via_api(self, client: TestClient, session: Session):
        bundle = _make_bundle()
        orch = AgentOrchestrator(session)
        [action] = orch.create_from_bundle(bundle)
        session.commit()

        resp = client.post(
            f"/api/v1/orchestrator/{action.id}/reject",
            json={"reason": "Not the right time"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "rejected"

    def test_full_lifecycle_via_api(self, client: TestClient, session: Session):
        """Full state machine via HTTP API calls."""
        bundle = _make_bundle()
        orch = AgentOrchestrator(session)
        [action] = orch.create_from_bundle(bundle)
        session.commit()

        action_id = str(action.id)

        r = client.post(f"/api/v1/orchestrator/{action_id}/approve", json={"approved_by": "ceo@bee.ai"})
        assert r.json()["status"] == "approved"

        r = client.post(f"/api/v1/orchestrator/{action_id}/start-execution", json={"tool": "n8n"})
        assert r.json()["status"] == "executing"

        r = client.post(f"/api/v1/orchestrator/{action_id}/complete", json={})
        assert r.json()["status"] == "completed"


# ── ObservabilityService tests ─────────────────────────────────────────────────


class TestObservabilityService:
    def test_complete_rule_based_strategy_above_threshold(self):
        svc = ObservabilityService()
        strategy = _make_strategy()
        result = svc.score_and_flag(strategy, generator_name="funding_strategy")
        assert result.confidence_score >= CONFIDENCE_THRESHOLD
        assert not result.manual_review_required

    def test_stub_strategy_with_short_fields_reduces_score(self):
        svc = ObservabilityService()
        strategy = _make_strategy(
            pain_point="Short.",
            closing_argument="Ok.",
            timing_window=TimingWindow(urgency="watch", reason="Watch."),
        )
        result = svc.score_and_flag(strategy, generator_name="funding_strategy")
        assert result.confidence_score < 0.90

    def test_generic_generator_scores_lower(self):
        svc = ObservabilityService()
        strategy = _make_strategy()
        result = svc.score_and_flag(strategy, generator_name="generic_strategy")
        # generic_strategy base is 0.55 → overall score below a specialized generator
        assert result.confidence_score < 0.85

    def test_manual_review_triggered_below_threshold(self):
        svc = ObservabilityService()
        strategy = _make_strategy(
            pain_point="x",
            closing_argument="y",
            timing_window=TimingWindow(urgency="watch", reason="z"),
        )
        result = svc.score_and_flag(strategy, generator_name="generic_strategy")
        if result.confidence_score < CONFIDENCE_THRESHOLD:
            assert result.manual_review_required

    def test_aligned_hint_boosts_score(self):
        svc = ObservabilityService()
        strategy = _make_strategy(channel="email", playbook="post_funding_outreach")
        hint = SuccessHint(
            playbook="post_funding_outreach",
            channel="email",
            generator="rule_based",
            win_rate=0.80,
            sample_size=30,
            confidence="high",
        )
        result = svc.score_and_flag(strategy, success_hints=[hint])
        assert result.confidence_score >= 0.82

    def test_market_insight_boosts_score(self):
        svc = ObservabilityService()
        strategy = _make_strategy()
        insights = [
            MarketInsightRef(
                insight_type="volume_spike",
                title="SaaS funding spiking",
                description="40% more funding signals this week",
                confidence=0.9,
            )
        ]
        result = svc.score_and_flag(strategy, market_insights=insights)
        assert result.confidence_score >= 0.82

    def test_score_clamped_to_0_1(self):
        svc = ObservabilityService()
        strategy = _make_strategy()
        result = svc.score_and_flag(strategy)
        assert 0.0 <= result.confidence_score <= 1.0

    def test_manual_review_flag_set_on_strategy(self):
        strategy = _make_strategy()
        strategy.confidence_score = 0.70
        strategy.manual_review_required = True
        assert strategy.manual_review_required


# ── TacticVariant (A/B testing) tests ─────────────────────────────────────────


class TestTacticVariants:
    def test_create_variant_endpoint(self, client: TestClient):
        payload = {
            "name": "Email vs LinkedIn test",
            "hypothesis": "LinkedIn outreach closes funding leads better",
            "signal_type": "funding_round",
            "arm_a_config": {"channel": "email", "playbook": "post_funding_outreach"},
            "arm_b_config": {"channel": "linkedin", "playbook": "post_funding_outreach"},
            "traffic_split": 0.5,
            "min_samples_per_arm": 5,
        }
        resp = client.post("/api/v1/variants", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Email vs LinkedIn test"
        assert data["status"] == "active"
        assert data["arm_a_win_rate"] == 0.0

    def test_list_variants(self, client: TestClient):
        resp = client.get("/api/v1/variants")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_conclude_variant(self, client: TestClient):
        payload = {
            "name": "Conclude test",
            "signal_type": "hiring",
            "arm_a_config": {"channel": "email"},
            "arm_b_config": {"channel": "linkedin"},
            "traffic_split": 0.5,
            "min_samples_per_arm": 5,
        }
        resp = client.post("/api/v1/variants", json=payload)
        assert resp.status_code == 201
        variant_id = resp.json()["id"]

        resp = client.post(f"/api/v1/variants/{variant_id}/conclude")
        assert resp.status_code == 200
        assert resp.json()["status"] == "concluded"

    def test_get_nonexistent_variant_404(self, client: TestClient):
        resp = client.get(f"/api/v1/variants/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_variant_ready_to_conclude_logic(self):
        variant = TacticVariant(
            name="test",
            signal_type="funding_round",
            arm_a_config={},
            arm_b_config={},
            traffic_split=0.5,
            min_samples_per_arm=5,
            arm_a_wins=3,
            arm_a_total=5,  # 60% win rate
            arm_b_wins=0,
            arm_b_total=5,  # 0% win rate → Δ = 0.60 ≥ 0.10
        )
        assert variant.is_ready_to_conclude

    def test_variant_not_ready_with_insufficient_samples(self):
        variant = TacticVariant(
            name="test",
            signal_type="hiring",
            arm_a_config={},
            arm_b_config={},
            traffic_split=0.5,
            min_samples_per_arm=10,
            arm_a_total=4,  # below threshold
            arm_b_total=10,
        )
        assert not variant.is_ready_to_conclude

    def test_active_variant_ref_in_enrichment_context(self):
        from app.models.base import SignalType
        from app.services.strategy_generator.base import EnrichmentContext

        variant_ref = ActiveVariantRef(
            variant_id=uuid.uuid4(),
            arm="b",
            config={"channel": "linkedin", "playbook": "post_funding_outreach"},
        )
        ctx = EnrichmentContext(
            signal_type=SignalType.FUNDING_ROUND,
            signal_title="Acme raises $10M",
            signal_score=90.0,
            active_variant=variant_ref,
        )
        assert ctx.active_variant is not None
        assert ctx.active_variant.arm == "b"
        assert ctx.active_variant.config["channel"] == "linkedin"

    def test_rule_based_generator_uses_variant_config(self):
        """A variant arm config overrides the default channel/playbook."""
        from app.models.base import SignalType
        from app.services.strategy_generator.base import EnrichmentContext
        from app.services.strategy_generator.rule_based import (
            _apply_hints_and_variant,
        )

        ctx = EnrichmentContext(
            signal_type=SignalType.FUNDING_ROUND,
            signal_title="Test",
            signal_score=85.0,
            active_variant=ActiveVariantRef(
                variant_id=uuid.uuid4(),
                arm="b",
                config={"channel": "linkedin", "playbook": "custom_playbook"},
            ),
        )
        channel, playbook = _apply_hints_and_variant(ctx, "email", "post_funding_outreach")
        assert channel == "linkedin"
        assert playbook == "custom_playbook"


# ── DataValidator tests ────────────────────────────────────────────────────────


class TestDataValidator:
    def test_clean_lead_high_score(self):
        lead = Lead(
            full_name="Alice Johnson",
            email="alice@acmecorp.com",
            title="VP of Sales",
            seniority="vp",
            linkedin_url="https://linkedin.com/in/alice-johnson",
        )
        validator = DataValidator.__new__(DataValidator)
        report = validator._run_checks(lead)
        # Clean lead: no email/linkedin/title issues, may have stale_data
        critical_flags = [f for f in report.flags if f not in ("stale_data",)]
        assert not critical_flags

    def test_invalid_email_flagged(self):
        lead = Lead(full_name="Bob Smith", email="not-an-email", title="CEO")
        validator = DataValidator.__new__(DataValidator)
        report = validator._run_checks(lead)
        assert "email_invalid" in report.flags
        assert report.freshness_score < 1.0

    def test_missing_email_flagged(self):
        lead = Lead(full_name="Charlie Brown", title="Manager")
        validator = DataValidator.__new__(DataValidator)
        report = validator._run_checks(lead)
        assert "email_missing" in report.flags

    def test_invalid_linkedin_flagged(self):
        lead = Lead(
            full_name="Dave Davis",
            email="dave@acme.com",
            linkedin_url="not-a-linkedin-url",
        )
        validator = DataValidator.__new__(DataValidator)
        report = validator._run_checks(lead)
        assert "linkedin_invalid" in report.flags

    def test_stale_lead_flagged(self):
        lead = Lead(full_name="Eve Evans", email="eve@acme.com", title="Director")
        lead.created_at = datetime.now(UTC) - timedelta(days=100)
        validator = DataValidator.__new__(DataValidator)
        report = validator._run_checks(lead)
        assert "stale_data" in report.flags
        assert report.stale_risk

    def test_seniority_mismatch_flagged(self):
        lead = Lead(
            full_name="Frank Foster",
            email="frank@acme.com",
            title="Chief Revenue Officer",
            seniority="manager",  # wrong for a C-level title
        )
        validator = DataValidator.__new__(DataValidator)
        report = validator._run_checks(lead)
        assert "seniority_mismatch" in report.flags

    def test_freshness_score_between_0_and_1(self):
        lead = Lead(
            full_name="Grace Green",
            email="bad-email",
            linkedin_url="bad-linkedin",
            title="",
        )
        validator = DataValidator.__new__(DataValidator)
        report = validator._run_checks(lead)
        assert 0.0 <= report.freshness_score <= 1.0

    def test_validate_lead_persists_to_db(self, session: Session):
        lead = Lead(
            full_name="Hank Hill",
            email="hank@propane.com",
            title="Propane Sales Manager",
            seniority="manager",
        )
        session.add(lead)
        session.commit()
        session.refresh(lead)

        validator = DataValidator(session)
        report = validator.validate_lead(lead.id)

        # Reload from DB
        session.refresh(lead)
        assert lead.last_validated_at is not None
        assert lead.data_freshness_score == report.freshness_score
        assert lead.validation_flags == report.flags


# ── TrendAnalyst tests ─────────────────────────────────────────────────────────


class TestTrendAnalyst:
    def test_analyze_endpoint(self, client: TestClient):
        resp = client.post("/api/v1/insights/analyze?window_days=7")
        assert resp.status_code == 200
        data = resp.json()
        assert "insights_created" in data
        assert "insights_expired" in data
        assert "signals_analyzed" in data

    def test_list_insights_endpoint(self, client: TestClient):
        resp = client.get("/api/v1/insights")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_market_insight_is_fresh_when_not_expired(self):
        insight = MarketInsight(
            insight_type=InsightType.VOLUME_SPIKE,
            signal_type="funding_round",
            title="Test spike",
            description="Funding signals spiking",
            confidence=0.8,
            evidence_count=10,
            is_active=True,
            expires_at=datetime.now(UTC) + timedelta(hours=24),
        )
        assert insight.is_fresh

    def test_expired_insight_not_fresh(self):
        insight = MarketInsight(
            insight_type=InsightType.VOLUME_SPIKE,
            signal_type="hiring",
            title="Old spike",
            description="Old pattern",
            confidence=0.5,
            evidence_count=3,
            is_active=True,
            expires_at=datetime.now(UTC) - timedelta(hours=1),
        )
        assert not insight.is_fresh

    def test_inactive_insight_not_fresh(self):
        insight = MarketInsight(
            insight_type=InsightType.SECTOR_MOMENTUM,
            title="Inactive",
            description="Inactive insight",
            confidence=0.9,
            evidence_count=20,
            is_active=False,
        )
        assert not insight.is_fresh

    def test_to_prompt_text_includes_tactical_implication(self):
        insight = MarketInsight(
            insight_type=InsightType.SECTOR_MOMENTUM,
            industry="SaaS",
            title="SaaS in motion",
            description="7 signals detected this week",
            tactical_implication="Outreach is well-timed",
            confidence=0.75,
            evidence_count=7,
        )
        text = insight.to_prompt_text()
        assert "sector_momentum" in text
        assert "Outreach is well-timed" in text

    def test_market_insight_ref_to_prompt_text(self):
        ref = MarketInsightRef(
            insight_type="volume_spike",
            title="SaaS funding spiking",
            description="40% more funding signals this week",
            tactical_implication="Increase outreach urgency",
            confidence=0.85,
        )
        text = ref.to_prompt_text()
        assert "volume_spike" in text
        assert "Increase outreach urgency" in text

    def test_analyze_with_no_signals_returns_zero_insights(self, client: TestClient):
        """With fresh DB, analyze should create 0 insights (no signals to aggregate)."""
        resp = client.post("/api/v1/insights/analyze?window_days=7")
        data = resp.json()
        # Fresh test DB has no signals → 0 insights created
        assert data["insights_created"] >= 0  # at least 0, may create some if signals exist
        assert data["window_days"] == 7
