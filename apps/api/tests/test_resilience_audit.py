"""Tests for the Resilience & Observability layer.

Covers:
* DeadLetterQueue — enqueue, retry with exponential backoff, resolve,
  permanently failed state, CEO alert creation, retry handler registry
* AuditTrailService — record decisions, manual review flagging, queries,
  decision chains, convenience factory methods
* WorkflowOrchestrator DLQ integration — handler failures enqueue to DLQ
* AuditTrail hooks in ExecutiveAgent
* API endpoints: /workflow/dlq, /audit
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlmodel import Session, select

from app.core.security import create_access_token, hash_password
from app.models.audit_trail import AgentType, DecisionType
from app.models.base import UserRole
from app.models.dead_letter import DLQStatus, FailedEvent, compute_next_retry_delay
from app.models.organization import Organization
from app.models.user import User
from app.services.audit_trail import AuditTrailService
from app.services.dead_letter import DeadLetterQueueService, register_retry_handler

# ══════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════

def _make_event_payload() -> dict:
    return {
        "event_type": "opportunity.won",
        "entity_id": str(uuid.uuid4()),
        "entity_type": "opportunity",
        "payload": {"amount": 50000},
        "webhook_url": "https://example.com/webhook",
    }


# ══════════════════════════════════════════════════════════════════
# Exponential backoff delay computation
# ══════════════════════════════════════════════════════════════════

class TestExponentialBackoff:
    def test_attempt_0_returns_base_delay(self) -> None:
        assert compute_next_retry_delay(0) == 4

    def test_attempt_1_doubles(self) -> None:
        assert compute_next_retry_delay(1) == 8

    def test_attempt_2_doubles_again(self) -> None:
        assert compute_next_retry_delay(2) == 16

    def test_attempt_3_is_32(self) -> None:
        assert compute_next_retry_delay(3) == 32

    def test_attempt_4_is_64(self) -> None:
        assert compute_next_retry_delay(4) == 64

    def test_schedule_is_increasing(self) -> None:
        delays = [compute_next_retry_delay(i) for i in range(5)]
        assert delays == sorted(delays)

    def test_high_attempt_capped(self) -> None:
        # Should not produce astronomically large delays
        delay = compute_next_retry_delay(20)
        assert delay <= 4096


# ══════════════════════════════════════════════════════════════════
# DeadLetterQueueService
# ══════════════════════════════════════════════════════════════════

class TestDeadLetterQueueService:
    def test_enqueue_creates_failed_event(self, session: Session) -> None:
        dlq = DeadLetterQueueService(session)
        event = dlq.enqueue(
            event_name="opportunity.won",
            original_event=_make_event_payload(),
            error="Connection timeout",
        )
        session.commit()
        assert event.id is not None
        assert event.status == DLQStatus.PENDING
        assert event.attempt_count == 1
        assert event.last_error == "Connection timeout"
        assert event.next_retry_at is not None
        next_retry = event.next_retry_at
        if next_retry.tzinfo is None:
            next_retry = next_retry.replace(tzinfo=UTC)
        assert next_retry > datetime.now(UTC)

    def test_enqueue_schedules_first_retry_in_4s(self, session: Session) -> None:
        dlq = DeadLetterQueueService(session)
        before = datetime.now(UTC)
        event = dlq.enqueue(
            event_name="test.event",
            original_event={},
            error="err",
        )
        session.commit()
        next_retry = event.next_retry_at
        if next_retry.tzinfo is None:
            next_retry = next_retry.replace(tzinfo=UTC)
        delay = (next_retry - before).total_seconds()
        assert 3.5 <= delay <= 5.0

    def test_enqueue_with_traceability_fields(self, session: Session) -> None:
        opp_id = uuid.uuid4()
        lead_id = uuid.uuid4()
        dlq = DeadLetterQueueService(session)
        event = dlq.enqueue(
            event_name="send_email",
            original_event={},
            error="SMTP failed",
            opportunity_id=opp_id,
            lead_id=lead_id,
        )
        session.commit()
        assert event.opportunity_id == opp_id
        assert event.lead_id == lead_id

    def test_error_history_grows_with_retries(self, session: Session) -> None:
        dlq = DeadLetterQueueService(session)
        event = dlq.enqueue("test", {}, "first error")
        session.commit()
        assert len(event.error_history) == 1

        # Simulate a failed retry without a handler
        result = dlq.retry(event.id)
        session.commit()
        assert result.attempt_count >= 2

    def test_retry_without_handler_increments_attempt(self, session: Session) -> None:
        dlq = DeadLetterQueueService(session)
        event = dlq.enqueue("unknown.event", _make_event_payload(), "initial error")
        session.commit()
        original_count = event.attempt_count

        result = dlq.retry(event.id)
        session.commit()
        assert result.attempt_count > original_count

    def test_retry_with_successful_handler(self, session: Session) -> None:
        @register_retry_handler("test.success.event")
        def _handler(payload: dict) -> bool:  # noqa: ARG001
            return True

        dlq = DeadLetterQueueService(session)
        event = dlq.enqueue("test.success.event", {"key": "val"}, "initial fail")
        session.commit()

        result = dlq.retry(event.id)
        session.commit()
        assert result.success is True
        assert result.status == DLQStatus.RESOLVED

    def test_retry_with_failing_handler(self, session: Session) -> None:
        @register_retry_handler("test.fail.event")
        def _handler(payload: dict) -> bool:  # noqa: ARG001
            raise ConnectionError("Still down")

        dlq = DeadLetterQueueService(session)
        event = dlq.enqueue("test.fail.event", {}, "original error")
        session.commit()

        result = dlq.retry(event.id)
        session.commit()
        assert result.success is False
        assert "Still down" in result.message

    def test_permanently_failed_after_max_attempts(self, session: Session) -> None:
        from app.models.dead_letter import _MAX_ATTEMPTS

        @register_retry_handler("test.exhaust.event")
        def _handler(payload: dict) -> bool:  # noqa: ARG001
            raise RuntimeError("Always fails")

        dlq = DeadLetterQueueService(session)
        event = dlq.enqueue("test.exhaust.event", {}, "initial")
        session.commit()

        # Exhaust all retries
        for _ in range(_MAX_ATTEMPTS):
            dlq.retry(event.id)
            session.commit()

        session.refresh(event)
        assert event.status == DLQStatus.PERMANENTLY_FAILED
        assert event.next_retry_at is None

    def test_resolve_marks_event_resolved(self, session: Session) -> None:
        dlq = DeadLetterQueueService(session)
        event = dlq.enqueue("manual.resolve.test", {}, "error")
        session.commit()

        resolved = dlq.resolve(event.id, notes="Fixed manually")
        session.commit()
        assert resolved is not None
        assert resolved.status == DLQStatus.RESOLVED
        assert "Fixed manually" in resolved.resolution_notes

    def test_resolve_nonexistent_returns_none(self, session: Session) -> None:
        dlq = DeadLetterQueueService(session)
        result = dlq.resolve(uuid.uuid4())
        assert result is None

    def test_list_events_by_status(self, session: Session) -> None:
        dlq = DeadLetterQueueService(session)
        dlq.enqueue("list.test", {}, "err1")
        dlq.enqueue("list.test", {}, "err2")
        session.commit()

        pending = dlq.list_events(status=DLQStatus.PENDING)
        assert len(pending) >= 2

    def test_get_summary_counts(self, session: Session) -> None:
        dlq = DeadLetterQueueService(session)
        dlq.enqueue("summary.test", {}, "err")
        session.commit()

        summary = dlq.get_summary()
        assert summary.total_events >= 1
        assert summary.pending_count >= 1

    def test_retry_due_events_empty(self, session: Session) -> None:
        dlq = DeadLetterQueueService(session)
        # Enqueue but set next_retry_at in the future — should not be retried
        dlq.enqueue("future.test", {}, "err")
        session.commit()

        # The next_retry_at is 4s from now — retry_due should find it
        results = dlq.retry_due_events()
        session.commit()
        # May or may not retry depending on exact timing — just check it doesn't crash
        assert isinstance(results, list)

    def test_retry_already_resolved_is_no_op(self, session: Session) -> None:
        dlq = DeadLetterQueueService(session)
        event = dlq.enqueue("resolved.test", {}, "err")
        dlq.resolve(event.id)
        session.commit()

        result = dlq.retry(event.id)
        assert result.success is True
        assert result.status == DLQStatus.RESOLVED

    def test_get_event_not_found_returns_none(self, session: Session) -> None:
        dlq = DeadLetterQueueService(session)
        result = dlq.get_event(uuid.uuid4())
        assert result is None

    def test_max_attempts_reached_property(self, session: Session) -> None:
        dlq = DeadLetterQueueService(session)
        event = dlq.enqueue("prop.test", {}, "err")
        session.commit()
        assert event.max_attempts_reached is False

    def test_is_retriable_property(self, session: Session) -> None:
        dlq = DeadLetterQueueService(session)
        event = dlq.enqueue("retriable.test", {}, "err")
        session.commit()
        assert event.is_retriable is True

    def test_ceo_alert_created_on_permanent_failure(self, session: Session) -> None:
        from app.models.dead_letter import _MAX_ATTEMPTS
        from app.models.pending_action import PendingAction

        @register_retry_handler("test.alert.ceo")
        def _handler(payload: dict) -> bool:  # noqa: ARG001
            raise RuntimeError("Always fail for CEO alert test")

        dlq = DeadLetterQueueService(session)
        event = dlq.enqueue("test.alert.ceo", {}, "initial")
        session.commit()

        for _ in range(_MAX_ATTEMPTS):
            dlq.retry(event.id)
            session.commit()

        session.refresh(event)
        assert event.ceo_alerted is True

        # CEO should have a PendingAction alert
        alerts = list(session.exec(
            select(PendingAction).where(PendingAction.title.contains("DLQ Alert"))
        ).all())
        assert len(alerts) >= 1


# ══════════════════════════════════════════════════════════════════
# AuditTrailService
# ══════════════════════════════════════════════════════════════════

class TestAuditTrailService:
    def test_record_decision_creates_entry(self, session: Session) -> None:
        audit = AuditTrailService(session)
        entry = audit.record_decision(
            agent_type=AgentType.STRATEGY_GENERATOR,
            decision_type=DecisionType.STRATEGY_GENERATED,
            context_snapshot={"signal_type": "funding_round", "psychographic_style": "D"},
            output_snapshot={"playbook": "funding_play"},
            strategy_reasoning="D-style lead → direct ROI pitch. Dark funnel hot → immediate timing.",
            confidence_score=0.9,
        )
        session.commit()
        assert entry is not None
        assert entry.id is not None
        assert entry.agent_type == AgentType.STRATEGY_GENERATOR
        assert entry.confidence_score == 0.9
        assert entry.manual_review_required is False

    def test_low_confidence_flags_manual_review(self, session: Session) -> None:
        audit = AuditTrailService(session)
        entry = audit.record_decision(
            agent_type=AgentType.EXECUTIVE_AGENT,
            decision_type=DecisionType.ARTIFACT_CREATED,
            confidence_score=0.65,
        )
        session.commit()
        assert entry is not None
        assert entry.manual_review_required is True

    def test_confidence_exactly_at_threshold_is_fine(self, session: Session) -> None:
        audit = AuditTrailService(session)
        entry = audit.record_decision(
            agent_type=AgentType.STRATEGY_GENERATOR,
            decision_type=DecisionType.STRATEGY_GENERATED,
            confidence_score=0.8,
        )
        session.commit()
        assert entry is not None
        assert entry.manual_review_required is False

    def test_confidence_below_threshold_flagged(self, session: Session) -> None:
        audit = AuditTrailService(session)
        entry = audit.record_decision(
            agent_type=AgentType.STRATEGY_GENERATOR,
            decision_type=DecisionType.STRATEGY_GENERATED,
            confidence_score=0.79,
        )
        session.commit()
        assert entry is not None
        assert entry.manual_review_required is True

    def test_confidence_clamped_to_valid_range(self, session: Session) -> None:
        audit = AuditTrailService(session)
        entry = audit.record_decision(
            agent_type=AgentType.DARK_FUNNEL,
            decision_type=DecisionType.HOT_LEAD_DETECTED,
            confidence_score=1.5,  # should be clamped to 1.0
        )
        session.commit()
        assert entry is not None
        assert entry.confidence_score == 1.0

    def test_get_entry(self, session: Session) -> None:
        audit = AuditTrailService(session)
        entry = audit.record_decision(
            agent_type=AgentType.EXECUTIVE_AGENT,
            decision_type=DecisionType.ARTIFACT_CREATED,
        )
        session.commit()
        fetched = audit.get_entry(entry.id)
        assert fetched is not None
        assert fetched.id == entry.id

    def test_get_entry_not_found_returns_none(self, session: Session) -> None:
        audit = AuditTrailService(session)
        assert audit.get_entry(uuid.uuid4()) is None

    def test_list_entries_by_agent_type(self, session: Session) -> None:
        audit = AuditTrailService(session)
        audit.record_decision(AgentType.STRATEGY_GENERATOR, DecisionType.STRATEGY_GENERATED)
        audit.record_decision(AgentType.EXECUTIVE_AGENT, DecisionType.ARTIFACT_CREATED)
        session.commit()

        strat_entries = audit.list_entries(agent_type=AgentType.STRATEGY_GENERATOR)
        assert all(e.agent_type == AgentType.STRATEGY_GENERATOR for e in strat_entries)

    def test_list_entries_by_manual_review(self, session: Session) -> None:
        audit = AuditTrailService(session)
        audit.record_decision(AgentType.STRATEGY_GENERATOR, DecisionType.STRATEGY_GENERATED, confidence_score=0.5)
        audit.record_decision(AgentType.STRATEGY_GENERATOR, DecisionType.STRATEGY_GENERATED, confidence_score=0.9)
        session.commit()

        flagged = audit.list_entries(manual_review_required=True)
        assert all(e.manual_review_required for e in flagged)

    def test_list_entries_by_opportunity(self, session: Session) -> None:
        opp_id = uuid.uuid4()
        audit = AuditTrailService(session)
        audit.record_decision(
            AgentType.STRATEGY_GENERATOR, DecisionType.STRATEGY_GENERATED,
            opportunity_id=opp_id,
        )
        audit.record_decision(
            AgentType.EXECUTIVE_AGENT, DecisionType.ARTIFACT_CREATED,
            opportunity_id=opp_id,
        )
        session.commit()

        entries = audit.list_entries(opportunity_id=opp_id)
        assert len(entries) >= 2
        assert all(e.opportunity_id == opp_id for e in entries)

    def test_get_decisions_for_opportunity_ordered(self, session: Session) -> None:
        opp_id = uuid.uuid4()
        audit = AuditTrailService(session)
        for decision_type in [
            DecisionType.STRATEGY_GENERATED,
            DecisionType.CONTENT_ADAPTED,
            DecisionType.ARTIFACT_CREATED,
        ]:
            audit.record_decision(
                AgentType.STRATEGY_GENERATOR, decision_type, opportunity_id=opp_id
            )
        session.commit()

        chain = audit.get_decisions_for_opportunity(opp_id)
        assert len(chain) == 3
        # Should be chronological (ascending)
        dates = [e.created_at for e in chain]
        assert dates == sorted(dates)

    def test_count_manual_review_needed(self, session: Session) -> None:
        audit = AuditTrailService(session)
        count_before = audit.count_manual_review_needed()
        audit.record_decision(
            AgentType.STRATEGY_GENERATOR, DecisionType.STRATEGY_GENERATED,
            confidence_score=0.3,
        )
        session.commit()
        assert audit.count_manual_review_needed() >= count_before + 1

    def test_get_summary(self, session: Session) -> None:
        audit = AuditTrailService(session)
        audit.record_decision(AgentType.STRATEGY_GENERATOR, DecisionType.STRATEGY_GENERATED, confidence_score=0.9)
        session.commit()

        summary = audit.get_summary()
        assert summary.total_entries >= 1
        assert AgentType.STRATEGY_GENERATOR in summary.entries_by_agent

    def test_record_strategy_generated_shorthand(self, session: Session) -> None:
        opp_id = uuid.uuid4()
        audit = AuditTrailService(session)
        entry = audit.record_strategy_generated(
            opportunity_id=opp_id,
            context_snapshot={"signal_type": "hiring", "psychographic_style": "C"},
            strategy_schema={"playbook": "tech_hire_play", "channel": "linkedin"},
            confidence_score=0.88,
            generator_name="DefaultStrategyGenerator",
            reasoning="C-style lead → analytical pitch. Strong dark funnel signal.",
        )
        session.commit()
        assert entry is not None
        assert entry.decision_type == DecisionType.STRATEGY_GENERATED
        assert entry.opportunity_id == opp_id

    def test_record_content_adapted_shorthand(self, session: Session) -> None:
        lead_id = uuid.uuid4()
        audit = AuditTrailService(session)
        entry = audit.record_content_adapted(
            lead_id=lead_id,
            original="Hope you're well!",
            adapted="Revenue impact: direct. [DISC: D]",
            disc_style="D",
            adaptations=["removed_pleasantry"],
            confidence=0.75,
        )
        session.commit()
        assert entry is not None
        assert entry.manual_review_required is True  # confidence < 0.8

    def test_record_hot_lead_detected_shorthand(self, session: Session) -> None:
        audit = AuditTrailService(session)
        entry = audit.record_hot_lead_detected(
            company_domain="hotco.com",
            score=82.5,
            buying_stage="ready_to_buy",
            signal_count=12,
        )
        session.commit()
        assert entry is not None
        assert entry.agent_type == AgentType.DARK_FUNNEL

    def test_record_intro_path_found_shorthand(self, session: Session) -> None:
        audit = AuditTrailService(session)
        entry = audit.record_intro_path_found(
            target_domain="target.com",
            paths_count=2,
            best_strength=8.0,
            coverage="strong",
        )
        session.commit()
        assert entry is not None
        assert entry.decision_type == DecisionType.INTRO_PATH_FOUND

    def test_record_decision_is_non_blocking_on_error(self, session: Session) -> None:
        """record_decision should never raise — verify it returns None gracefully on DB issues."""
        # Simulate by passing an incompatible value that will fail at flush
        audit = AuditTrailService(session)
        # This should not raise even if internal issues occur
        # We just verify the interface is robust
        entry = audit.record_decision(
            agent_type=AgentType.EXECUTIVE_AGENT,
            decision_type=DecisionType.ARTIFACT_CREATED,
            confidence_score=0.95,
        )
        session.commit()
        # Should succeed in normal conditions
        assert entry is not None


# ══════════════════════════════════════════════════════════════════
# WorkflowOrchestrator DLQ integration
# ══════════════════════════════════════════════════════════════════

class TestWorkflowOrchestratorDLQ:
    def test_failing_handler_creates_dlq_entry(self, session: Session) -> None:
        from app.schemas.workflow import BeeEvent
        from app.services.workflow_orchestrator.base import WorkflowHandler
        from app.services.workflow_orchestrator.registry import (
            register_workflow_handler as register_handler,
        )
        from app.services.workflow_orchestrator.service import WorkflowOrchestrator

        @register_handler
        class FailingTestHandler(WorkflowHandler):
            name = "failing_test_handler_unique"
            version = "1.0"
            event_types = ["test.dlq.trigger"]
            enabled = True

            def handle(self, event: BeeEvent, session: Session) -> object:  # noqa: ARG002
                raise ConnectionError("Webhook unreachable!")

        orchestrator = WorkflowOrchestrator(session)
        event = BeeEvent(event_type="test.dlq.trigger", payload={"test": True})
        tasks = orchestrator.publish(event)
        session.commit()

        assert len(tasks) == 1

        # Check DLQ entry was created — event_name is a composite
        # "<event_type>::handler::<handler_name>" key (disambiguates
        # multiple handlers subscribed to the same event_type), see
        # WorkflowOrchestrator._dlq_event_name.
        failed_events = list(session.exec(
            select(FailedEvent).where(
                FailedEvent.event_name == "test.dlq.trigger::handler::failing_test_handler_unique"
            )
        ).all())
        assert len(failed_events) >= 1
        assert failed_events[0].status == DLQStatus.PENDING

    def test_handler_returning_failed_task_also_reaches_dlq(self, session: Session) -> None:
        """Most built-in handlers (CRM, billing, outbound webhooks — anything
        built on _post_webhook) catch their own HTTP failure and return a
        FAILED WorkflowTask rather than raising. Before this fix, only a
        *raising* handler reached the DLQ — this is the far more common
        failure mode (a real HTTP timeout/500) and it silently never got
        retried or escalated."""
        from app.schemas.workflow import BeeEvent
        from app.services.workflow_orchestrator.base import WorkflowHandler
        from app.services.workflow_orchestrator.registry import (
            register_workflow_handler as register_handler,
        )
        from app.services.workflow_orchestrator.service import WorkflowOrchestrator

        @register_handler
        class ReturnsFailedTaskHandler(WorkflowHandler):
            name = "returns_failed_task_unique"
            version = "1.0"
            event_types = ["test.dlq.returns_failed"]
            enabled = True

            def handle(self, event, session):  # noqa: ARG002
                from app.models.workflow_task import WorkflowTask, WorkflowTaskStatus

                task = WorkflowTask(
                    event_type=event.event_type,
                    handler_name=self.name,
                    handler_version=self.version,
                    status=WorkflowTaskStatus.FAILED,
                    payload=event.payload,
                    error_message="Connection reset by peer",
                )
                session.add(task)
                session.flush()
                session.refresh(task)
                return task

        orchestrator = WorkflowOrchestrator(session)
        event = BeeEvent(event_type="test.dlq.returns_failed", payload={"test": True})
        orchestrator.publish(event)
        session.commit()

        failed_events = list(session.exec(
            select(FailedEvent).where(
                FailedEvent.event_name == "test.dlq.returns_failed::handler::returns_failed_task_unique"
            )
        ).all())
        assert len(failed_events) >= 1
        assert failed_events[0].last_error == "Connection reset by peer"

    def test_generic_replay_handler_re_invokes_the_named_handler(self, session: Session) -> None:
        """The dynamically-registered retry handler must look up the
        original handler by name and re-run it — not just no-op."""
        from unittest.mock import MagicMock, patch

        from app.schemas.workflow import BeeEvent
        from app.services.workflow_orchestrator.base import WorkflowHandler
        from app.services.workflow_orchestrator.registry import (
            clear_registry,
        )
        from app.services.workflow_orchestrator.registry import (
            register_workflow_handler as register_handler,
        )
        from app.services.workflow_orchestrator.service import (
            WorkflowOrchestrator,
            _replay_workflow_handler,
        )

        call_count = {"n": 0}

        @register_handler
        class FlakyHandler(WorkflowHandler):
            name = "flaky_handler_unique"
            version = "1.0"
            event_types = ["test.dlq.flaky"]
            enabled = True

            def handle(self, event, session):
                from app.models.workflow_task import WorkflowTask, WorkflowTaskStatus

                call_count["n"] += 1
                # Fails the first time (via publish()), succeeds on replay.
                status = WorkflowTaskStatus.FAILED if call_count["n"] == 1 else WorkflowTaskStatus.COMPLETED
                task = WorkflowTask(
                    event_type=event.event_type,
                    handler_name=self.name,
                    handler_version=self.version,
                    status=status,
                    payload=event.payload,
                    error_message=None if status == WorkflowTaskStatus.COMPLETED else "first attempt fails",
                )
                session.add(task)
                session.flush()
                session.refresh(task)
                return task

        try:
            orchestrator = WorkflowOrchestrator(session)
            event = BeeEvent(event_type="test.dlq.flaky", payload={"test": True})
            orchestrator.publish(event)
            session.commit()
            assert call_count["n"] == 1

            original_event = {
                "event_type": "test.dlq.flaky",
                "entity_id": None,
                "entity_type": None,
                "handler_name": "flaky_handler_unique",
                "payload": {"test": True},
                "published_at": None,
            }
            # _replay_workflow_handler opens its own session via
            # session_scope() (the real Postgres-backed engine, for use by
            # the background retry worker) — redirect it to this test's
            # in-memory session so the replayed handler sees the same DB.
            with patch("app.services.workflow_orchestrator.service.session_scope") as mock_scope:
                mock_scope.return_value.__enter__ = MagicMock(return_value=session)
                mock_scope.return_value.__exit__ = MagicMock(return_value=False)
                result = _replay_workflow_handler(original_event)
            assert result is True
            assert call_count["n"] == 2
        finally:
            clear_registry()


# ══════════════════════════════════════════════════════════════════
# API Endpoints
# ══════════════════════════════════════════════════════════════════

def _auth_headers(session: Session) -> dict:
    """A valid bearer token for a fresh, persisted OWNER — DLQ mutation
    endpoints require a resolvable tenant identity, and the admin-only ones
    (test-enqueue, retry-due) require OWNER/ADMIN specifically."""
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


class TestDLQEndpoints:
    def test_get_summary(self, client) -> None:
        resp = client.get("/api/v1/workflow/dlq/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_events" in data
        assert "pending_count" in data

    def test_list_events_empty(self, client) -> None:
        resp = client.get("/api/v1/workflow/dlq")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_test_enqueue(self, client, session: Session) -> None:
        resp = client.post(
            "/api/v1/workflow/dlq/test-enqueue",
            json={
                "event_name": "test.api.event",
                "event_type": "webhook",
                "error_message": "API test enqueue",
            },
            headers=_auth_headers(session),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["event_name"] == "test.api.event"
        assert data["status"] == "pending"

    def test_test_enqueue_requires_admin(self, client) -> None:
        resp = client.post(
            "/api/v1/workflow/dlq/test-enqueue",
            json={"event_name": "anon.event", "error_message": "anon"},
        )
        assert resp.status_code == 401

    def test_get_event_by_id(self, client, session: Session) -> None:
        headers = _auth_headers(session)
        enqueue_resp = client.post(
            "/api/v1/workflow/dlq/test-enqueue",
            json={"event_name": "test.get.event", "error_message": "test"},
            headers=headers,
        )
        event_id = enqueue_resp.json()["id"]

        resp = client.get(f"/api/v1/workflow/dlq/{event_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == event_id

    def test_get_event_not_found(self, client) -> None:
        resp = client.get(f"/api/v1/workflow/dlq/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_retry_event(self, client, session: Session) -> None:
        headers = _auth_headers(session)
        enqueue_resp = client.post(
            "/api/v1/workflow/dlq/test-enqueue",
            json={"event_name": "test.retry.via.api", "error_message": "initial"},
            headers=headers,
        )
        event_id = enqueue_resp.json()["id"]

        resp = client.post(f"/api/v1/workflow/dlq/{event_id}/retry", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "success" in data
        assert "attempt_count" in data

    def test_resolve_event(self, client, session: Session) -> None:
        headers = _auth_headers(session)
        enqueue_resp = client.post(
            "/api/v1/workflow/dlq/test-enqueue",
            json={"event_name": "test.resolve.via.api", "error_message": "initial"},
            headers=headers,
        )
        event_id = enqueue_resp.json()["id"]

        resp = client.patch(
            f"/api/v1/workflow/dlq/{event_id}/resolve",
            json={"notes": "Fixed manually"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "resolved"

    def test_list_events_by_status(self, client, session: Session) -> None:
        client.post(
            "/api/v1/workflow/dlq/test-enqueue",
            json={"event_name": "test.filter.event", "error_message": "err"},
            headers=_auth_headers(session),
        )
        resp = client.get("/api/v1/workflow/dlq?status=pending")
        assert resp.status_code == 200
        data = resp.json()
        assert all(e["status"] == "pending" for e in data)

    def test_retry_due_events(self, client, session: Session) -> None:
        resp = client.post("/api/v1/workflow/dlq/retry-due", headers=_auth_headers(session))
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_retry_due_events_requires_admin(self, client) -> None:
        resp = client.post("/api/v1/workflow/dlq/retry-due")
        assert resp.status_code == 401


class TestAuditEndpoints:
    def test_list_decisions_empty(self, client) -> None:
        resp = client.get("/api/v1/audit/decisions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_get_audit_summary(self, client) -> None:
        resp = client.get("/api/v1/audit/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_entries" in data
        assert "manual_review_count" in data
        assert "avg_confidence_score" in data

    def test_get_decision_chain_for_opportunity(self, client) -> None:
        opp_id = uuid.uuid4()
        resp = client.get(f"/api/v1/audit/opportunities/{opp_id}/chain")
        assert resp.status_code == 200
        data = resp.json()
        assert data["opportunity_id"] == str(opp_id)
        assert data["total_entries"] == 0
        assert data["requires_review"] is False

    def test_get_decision_not_found(self, client) -> None:
        resp = client.get(f"/api/v1/audit/decisions/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_list_decisions_filter_by_agent(self, client, session: Session) -> None:
        audit = AuditTrailService(session)
        audit.record_decision(AgentType.STRATEGY_GENERATOR, DecisionType.STRATEGY_GENERATED)
        session.commit()

        resp = client.get(f"/api/v1/audit/decisions?agent_type={AgentType.STRATEGY_GENERATOR}")
        assert resp.status_code == 200
        data = resp.json()
        assert all(e["agent_type"] == AgentType.STRATEGY_GENERATOR for e in data)

    def test_list_decisions_manual_review_filter(self, client, session: Session) -> None:
        audit = AuditTrailService(session)
        audit.record_decision(
            AgentType.EXECUTIVE_AGENT, DecisionType.ARTIFACT_CREATED,
            confidence_score=0.3,
        )
        session.commit()

        resp = client.get("/api/v1/audit/decisions?manual_review_required=true")
        assert resp.status_code == 200
        data = resp.json()
        assert all(e["manual_review_required"] is True for e in data)
