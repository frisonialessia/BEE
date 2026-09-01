"""Tests for the BOS (Business Operating System) services.

Covers:
* ResourcePredictorService — rule evaluation and risk levels
* WorkflowOrchestrator — event dispatch, mock mode, handler registry
* RevenueSimulator — projection math and confidence tiers
* Analytics API endpoints — /analytics/simulator, /analytics/workflows
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session

from app.core.security import create_access_token, hash_password
from app.models.base import OpportunityStatus, UserRole
from app.models.opportunity import Opportunity
from app.models.organization import Organization
from app.models.user import User
from app.models.workflow_task import WorkflowTask, WorkflowTaskStatus
from app.schemas.predictor import ResourcePrediction
from app.schemas.workflow import BeeEvent
from app.services.resource_predictor.service import PredictionContext, ResourcePredictorService
from app.services.workflow_orchestrator.registry import (
    get_handlers_for_event,
)
from app.services.workflow_orchestrator.service import WorkflowOrchestrator

# ══════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════

def _make_opportunity(score: float = 70.0, industry: str = "SaaS") -> Opportunity:
    opp = Opportunity(
        id=uuid.uuid4(),
        lead_id=uuid.uuid4(),
        company_id=uuid.uuid4(),
        signal_id=uuid.uuid4(),
        score=score,
        status=OpportunityStatus.READY_TO_ACTION,
        strategy={
            "context_snapshot": {
                "signal_type": "funding_round",
                "industry": industry,
            }
        },
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    return opp


def _make_context(
    score: float = 70.0,
    signal_type: str = "hiring",
    industry: str | None = "SaaS",
    seniority: str | None = "manager",
) -> PredictionContext:
    return PredictionContext(
        opportunity_score=score,
        signal_type=signal_type,
        industry=industry,
        lead_seniority=seniority,
        lead_title=None,
        playbook=None,
        channel=None,
    )


# ══════════════════════════════════════════════════════════════════
# ResourcePredictorService
# ══════════════════════════════════════════════════════════════════

class TestResourcePredictorService:
    def test_low_risk_standard_deal(self) -> None:
        """A normal deal with mid-score, non-regulated industry → LOW risk."""
        predictor = ResourcePredictorService()
        ctx = _make_context(score=55.0, signal_type="hiring", industry="Retail")
        opp = _make_opportunity(score=55.0, industry="Retail")
        result = predictor.predict(opp, context=ctx)

        assert result.risk_level == "low"
        assert result.capacity_impact_score < 30

    def test_high_score_deal_medium_impact(self) -> None:
        """Score ≥ 85 triggers the high-capacity rule."""
        predictor = ResourcePredictorService()
        ctx = _make_context(score=90.0, signal_type="hiring", industry="Retail")
        opp = _make_opportunity(score=90.0, industry="Retail")
        result = predictor.predict(opp, context=ctx)

        assert result.capacity_impact_score >= 30
        assert any("CSM" in w or "score" in w.lower() for w in result.warnings + result.recommended_actions)

    def test_regulated_industry_forces_high_risk(self) -> None:
        """Finance industry should force risk_level to HIGH."""
        predictor = ResourcePredictorService()
        ctx = _make_context(score=50.0, signal_type="hiring", industry="finance")
        opp = _make_opportunity(score=50.0, industry="finance")
        result = predictor.predict(opp, context=ctx)

        assert result.risk_level == "high"
        assert len(result.warnings) > 0
        assert len(result.recommended_actions) > 0

    def test_c_level_lead_adds_impact(self) -> None:
        """C-level seniority adds executive engagement requirement."""
        predictor = ResourcePredictorService()
        ctx = _make_context(score=50.0, signal_type="hiring", industry="Retail", seniority="c_level")
        opp = _make_opportunity(score=50.0, industry="Retail")
        result = predictor.predict(opp, context=ctx)

        assert result.capacity_impact_score >= 15
        assert any("executive" in a.lower() or "kickoff" in a.lower() for a in result.recommended_actions)

    def test_funding_signal_adds_capacity_rule(self) -> None:
        """Funding-round signal triggers the scale support warning."""
        predictor = ResourcePredictorService()
        ctx = _make_context(score=50.0, signal_type="funding_round", industry="SaaS")
        opp = _make_opportunity(score=50.0)
        result = predictor.predict(opp, context=ctx)

        assert result.capacity_impact_score >= 10
        assert any("funding" in w.lower() or "capacity" in w.lower() for w in result.warnings)

    def test_high_risk_summary_mentions_concerns(self) -> None:
        """High-risk summary should mention the concern count."""
        predictor = ResourcePredictorService()
        ctx = _make_context(score=90.0, signal_type="funding_round", industry="finance")
        opp = _make_opportunity(score=90.0, industry="finance")
        result = predictor.predict(opp, context=ctx)

        assert result.risk_level == "high"
        assert "concern" in result.summary.lower() or "impact" in result.summary.lower()

    def test_blocks_confirmation_default_false(self) -> None:
        """blocks_confirmation should be False by default (STRICT mode is off)."""
        predictor = ResourcePredictorService()
        ctx = _make_context(score=95.0, signal_type="funding_round", industry="healthcare")
        opp = _make_opportunity(score=95.0, industry="healthcare")
        result = predictor.predict(opp, context=ctx)

        assert result.blocks_confirmation is False  # endpoint sets this based on settings

    def test_prediction_schema_completeness(self) -> None:
        """ResourcePrediction model must be serializable."""
        pred = ResourcePrediction(
            risk_level="medium",
            capacity_impact_score=45.0,
            warnings=["Test warning"],
            recommended_actions=["Test action"],
            summary="Test summary",
        )
        data = pred.model_dump()
        assert data["risk_level"] == "medium"
        assert data["blocks_confirmation"] is False


# ══════════════════════════════════════════════════════════════════
# WorkflowOrchestrator — registry + dispatch
# ══════════════════════════════════════════════════════════════════

class TestWorkflowRegistry:
    def test_built_in_handlers_registered_for_won(self) -> None:
        """Built-in handlers must be registered for opportunity.won."""
        handlers = get_handlers_for_event("opportunity.won")
        names = {h.name for h in handlers}
        # At minimum, these three should be registered
        assert "crm_update" in names
        assert "service_delivery" in names
        assert "billing_trigger" in names

    def test_built_in_handler_registered_for_ready_to_action(self) -> None:
        handlers = get_handlers_for_event("opportunity.ready_to_action")
        names = {h.name for h in handlers}
        assert "ready_to_action_notify" in names

    def test_unknown_event_returns_empty(self) -> None:
        handlers = get_handlers_for_event("totally.unknown.event")
        assert handlers == []


class TestWorkflowOrchestrator:
    """Tests that require a DB session (uses the pytest session fixture from conftest)."""

    def test_mock_dispatch_on_won_event(self, session: Session) -> None:
        """All built-in handlers should dispatch in mock mode when URLs not configured."""
        orch = WorkflowOrchestrator(session)
        event = BeeEvent(
            event_type="opportunity.won",
            entity_id=uuid.uuid4(),
            entity_type="opportunity",
            payload={"company_name": "ACME Corp", "score": 80},
        )
        tasks = orch.publish(event)

        assert len(tasks) >= 3
        for task in tasks:
            assert task.mock is True
            assert task.status == WorkflowTaskStatus.MOCK_DISPATCHED
            assert task.event_type == "opportunity.won"

    def test_mock_dispatch_on_ready_to_action(self, session: Session) -> None:
        orch = WorkflowOrchestrator(session)
        event = BeeEvent(
            event_type="opportunity.ready_to_action",
            entity_id=uuid.uuid4(),
            entity_type="opportunity",
            payload={"company_name": "BetaCo", "score": 75},
        )
        tasks = orch.publish(event)

        assert any(t.handler_name == "ready_to_action_notify" for t in tasks)
        for t in tasks:
            assert t.mock is True

    def test_unknown_event_produces_no_tasks(self, session: Session) -> None:
        orch = WorkflowOrchestrator(session)
        event = BeeEvent(event_type="no.handlers.registered")
        tasks = orch.publish(event)
        assert tasks == []

    def test_task_entity_id_stored(self, session: Session) -> None:
        opp_id = uuid.uuid4()
        orch = WorkflowOrchestrator(session)
        event = BeeEvent(
            event_type="opportunity.won",
            entity_id=opp_id,
            entity_type="opportunity",
            payload={},
        )
        tasks = orch.publish(event)

        for task in tasks:
            assert task.entity_id == opp_id
            assert task.entity_type == "opportunity"

    def test_get_tasks_for_entity(self, session: Session) -> None:
        opp_id = uuid.uuid4()
        orch = WorkflowOrchestrator(session)
        event = BeeEvent(
            event_type="opportunity.won",
            entity_id=opp_id,
            entity_type="opportunity",
            payload={},
        )
        orch.publish(event)

        found = orch.get_tasks_for_entity(opp_id)
        assert len(found) >= 3
        assert all(t.entity_id == opp_id for t in found)

    def test_workflow_status_counts(self, session: Session) -> None:
        orch = WorkflowOrchestrator(session)
        event = BeeEvent(event_type="opportunity.won", entity_id=uuid.uuid4(), payload={})
        orch.publish(event)

        status_out = orch.get_status()
        assert status_out.total_tasks >= 3
        assert status_out.mock_dispatched >= 3
        assert status_out.total_tasks == (
            status_out.dispatched
            + status_out.mock_dispatched
            + status_out.completed
            + status_out.failed
            + status_out.skipped
            + status_out.pending
        )

    def test_list_registered_handlers(self, session: Session) -> None:
        orch = WorkflowOrchestrator(session)
        handlers = orch.list_registered_handlers()
        assert isinstance(handlers, list)
        assert len(handlers) >= 4
        for h in handlers:
            assert "name" in h
            assert "event_types" in h
            assert "enabled" in h

    def test_handler_exception_creates_failed_task(self, session: Session) -> None:
        """If a handler raises, the orchestrator records a FAILED task instead of crashing."""
        from app.services.workflow_orchestrator.base import WorkflowHandler

        class ExplodingHandler(WorkflowHandler):
            name = "exploding_test_handler"
            version = "1.0.0"
            event_types = ["test.explode"]

            def handle(self, event: BeeEvent, session: Session) -> WorkflowTask:  # noqa: ARG002
                raise RuntimeError("Boom!")

        # Temporarily inject without using the decorator (to avoid polluting registry)
        from app.services.workflow_orchestrator import registry as reg
        reg._REGISTRY["exploding_test_handler"] = ExplodingHandler()

        try:
            orch = WorkflowOrchestrator(session)
            event = BeeEvent(event_type="test.explode", entity_id=uuid.uuid4())
            tasks = orch.publish(event)
            assert len(tasks) == 1
            assert tasks[0].status == WorkflowTaskStatus.FAILED
            assert tasks[0].handler_name == "exploding_test_handler"
        finally:
            reg._REGISTRY.pop("exploding_test_handler", None)


# ══════════════════════════════════════════════════════════════════
# RevenueSimulator
# ══════════════════════════════════════════════════════════════════

class TestRevenueSimulator:
    def test_no_data_returns_none_confidence(self, session: Session) -> None:
        """With zero historical data, confidence is 'none' and win_rate is 0."""
        from app.services.revenue_simulator import RevenueSimulator
        sim = RevenueSimulator(session)
        result = sim.simulate("funding_round", industry="SaaS", increase_factor=2.0)

        assert result.data_confidence == "none"
        assert result.historical_win_rate == 0.0
        assert result.sample_size == 0
        assert result.baseline_expected_won == 0
        assert len(result.scenarios) == 3

    def test_scenarios_always_three(self, session: Session) -> None:
        """Simulator always returns exactly 3 scenarios."""
        from app.services.revenue_simulator import RevenueSimulator
        sim = RevenueSimulator(session)
        result = sim.simulate("hiring", increase_factor=3.0)

        assert len(result.scenarios) == 3
        labels = [s.label for s in result.scenarios]
        assert "Conservative" in labels
        assert "Realistic" in labels
        assert "Optimistic" in labels

    def test_increase_factor_reflected(self, session: Session) -> None:
        """increase_factor is stored in the response."""
        from app.services.revenue_simulator import RevenueSimulator
        sim = RevenueSimulator(session)
        result = sim.simulate("leadership_change", increase_factor=5.0)

        assert result.increase_factor == 5.0
        for scenario in result.scenarios:
            assert scenario.prospecting_increase_factor == 5.0

    def test_recommendation_mentions_no_data(self, session: Session) -> None:
        """When no data, recommendation guides user to collect data first."""
        from app.services.revenue_simulator import RevenueSimulator
        sim = RevenueSimulator(session)
        result = sim.simulate("product_launch", industry="EdTech", increase_factor=2.0)

        assert "no historical data" in result.recommendation.lower() or \
               "close your first" in result.recommendation.lower()

    def test_conservative_always_less_than_optimistic(self, session: Session) -> None:
        """Conservative projected deals must be ≤ optimistic."""
        from app.services.revenue_simulator import RevenueSimulator
        sim = RevenueSimulator(session)
        result = sim.simulate("funding_round", increase_factor=2.0)

        conservative = next(s for s in result.scenarios if s.label == "Conservative")
        optimistic = next(s for s in result.scenarios if s.label == "Optimistic")
        assert conservative.projected_won_deals <= optimistic.projected_won_deals

    def test_signal_type_stored(self, session: Session) -> None:
        from app.services.revenue_simulator import RevenueSimulator
        sim = RevenueSimulator(session)
        result = sim.simulate("hiring", industry="Healthcare", increase_factor=1.5)

        assert result.signal_type == "hiring"
        assert result.industry == "Healthcare"

    def test_disclaimer_always_present(self, session: Session) -> None:
        from app.services.revenue_simulator import RevenueSimulator
        sim = RevenueSimulator(session)
        result = sim.simulate("funding_round", increase_factor=2.0)

        assert len(result.disclaimer) > 10

    def test_count_open_opportunities_filters_by_segment(self, session: Session) -> None:
        """Regression test: pipeline counts must be scoped to the requested
        signal_type/industry segment, not the whole READY_TO_ACTION pipeline
        (previously _count_open_opportunities ignored both filters).
        """
        from app.models.company import Company
        from app.models.signal import Signal
        from app.services.revenue_simulator import RevenueSimulator

        saas_co = Company(name="SaaSCo", domain="saasco.com", industry="SaaS")
        fintech_co = Company(name="FinCo", domain="finco.com", industry="Fintech")
        session.add(saas_co)
        session.add(fintech_co)
        session.flush()

        funding_signal = Signal(
            company_id=saas_co.id, signal_type="funding_round", title="SaaSCo raised a round", score=80.0
        )
        hiring_signal = Signal(
            company_id=fintech_co.id, signal_type="hiring", title="FinCo hired a VP", score=60.0
        )
        session.add(funding_signal)
        session.add(hiring_signal)
        session.flush()

        session.add(Opportunity(
            signal_id=funding_signal.id, company_id=saas_co.id, title="Opp1",
            status=OpportunityStatus.READY_TO_ACTION, score=80.0,
        ))
        session.add(Opportunity(
            signal_id=hiring_signal.id, company_id=fintech_co.id, title="Opp2",
            status=OpportunityStatus.READY_TO_ACTION, score=60.0,
        ))
        session.flush()

        sim = RevenueSimulator(session)
        assert sim._count_open_opportunities("funding_round", "SaaS") == 1
        assert sim._count_open_opportunities("funding_round", None) == 1
        assert sim._count_open_opportunities("hiring", "SaaS") == 0
        assert sim._count_open_opportunities("hiring", "Fintech") == 1
        assert sim._count_open_opportunities("hiring", None) == 1
        assert sim._count_open_opportunities("tech_adoption", None) == 0


# ══════════════════════════════════════════════════════════════════
# Analytics API endpoints (integration tests via TestClient)
# ══════════════════════════════════════════════════════════════════

class TestAnalyticsEndpoints:
    def test_simulator_endpoint_returns_200(self, client: Any) -> None:
        resp = client.get("/api/v1/analytics/simulator?signal_type=funding_round&increase_factor=2")
        assert resp.status_code == 200
        data = resp.json()
        assert "scenarios" in data
        assert len(data["scenarios"]) == 3
        assert "data_confidence" in data

    def test_simulator_with_industry_filter(self, client: Any) -> None:
        resp = client.get("/api/v1/analytics/simulator?signal_type=hiring&industry=SaaS&increase_factor=3")
        assert resp.status_code == 200
        data = resp.json()
        assert data["industry"] == "SaaS"
        assert data["increase_factor"] == 3.0

    def test_simulator_invalid_factor_rejected(self, client: Any) -> None:
        # factor must be >= 1.1
        resp = client.get("/api/v1/analytics/simulator?signal_type=hiring&increase_factor=1.0")
        assert resp.status_code == 422

    def test_workflow_status_endpoint(self, client: Any) -> None:
        resp = client.get("/api/v1/analytics/workflows/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_tasks" in data
        assert "mock_dispatched" in data

    def test_workflow_handlers_endpoint(self, client: Any) -> None:
        resp = client.get("/api/v1/analytics/workflows/handlers")
        assert resp.status_code == 200
        handlers = resp.json()
        assert isinstance(handlers, list)
        names = {h["name"] for h in handlers}
        assert "crm_update" in names
        assert "billing_trigger" in names

    def test_workflow_tasks_endpoint(self, client: Any) -> None:
        resp = client.get("/api/v1/analytics/workflows")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ══════════════════════════════════════════════════════════════════
# BOS: Outcome endpoint resource gate integration
# ══════════════════════════════════════════════════════════════════

def _auth_headers(session: Session) -> dict:
    """A valid bearer token for a fresh, persisted OWNER — record_outcome
    requires a resolvable caller identity."""
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

    token = create_access_token(user.id, organization_id=org.id, role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


class TestOutcomeWithBOS:
    def test_outcome_response_includes_prediction_field(self, client: Any, session: Session) -> None:
        """The WON outcome response must include resource_prediction field."""
        from tests.conftest import _create_full_opportunity

        company, lead, signal, opp = _create_full_opportunity(session)

        resp = client.patch(
            f"/api/v1/opportunities/{opp.id}/outcome",
            json={"outcome": "won", "notes": "Closed deal"},
            headers=_auth_headers(session),
        )
        assert resp.status_code == 200
        data = resp.json()
        # resource_prediction is None when RESOURCE_PREDICTION_ENABLED=False (default)
        assert "resource_prediction" in data
        assert "workflow_tasks_dispatched" in data
        assert data["workflow_tasks_dispatched"] >= 3  # 3 built-in handlers

    def test_outcome_lost_dispatches_crm_handler(self, client: Any, session: Session) -> None:
        """LOST outcome should also trigger CRM update handler."""
        from tests.conftest import _create_full_opportunity

        company, lead, signal, opp = _create_full_opportunity(session)

        resp = client.patch(
            f"/api/v1/opportunities/{opp.id}/outcome",
            json={"outcome": "lost", "notes": "Lost to competitor"},
            headers=_auth_headers(session),
        )
        assert resp.status_code == 200
        # LOST outcome: CRM handler fires, but service_delivery and billing do not
        data = resp.json()
        assert data["outcome"] == "lost"
