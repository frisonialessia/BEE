"""DynamicSequenceEngine — state-machine based outreach sequences.

This service extends the WorkflowOrchestrator with non-linear sequence support.
Rather than a fixed "send email on day 1, follow-up on day 3" drip campaign,
DynamicSequences are DAGs that branch based on what the lead actually does.

State machine model
-------------------
::

    SequenceExecution { current_step_id, status, events[] }
        │
        ▼ advance(event="email_opened")
    DynamicSequenceEngine
        1. Load sequence definition (step graph)
        2. Find current step
        3. Evaluate transitions: which condition matches event?
        4. Execute matched transition:
            a. Create PendingAction for the next step's action
            b. Advance current_step_id
            c. If no transition matches → check fallback (timeout)
        5. Mark execution COMPLETED if next_step_id is None

Example DAG
-----------
::

    s1 [send_intro_email]
       ├─ email_opened → s2 [send_linkedin_connect]
       ├─ link_clicked → s3 [book_meeting]  ← skip ahead if interested
       └─ not_opened(3d) → s1b [send_followup]

    s1b [send_followup_email]
       ├─ replied → s2
       └─ not_replied(5d) → END (sequence complete)

    s2 [send_linkedin_connect]
       ├─ accepted → s3
       └─ not_accepted(7d) → END

    s3 [book_meeting]  → END (human takeover)

Authenticity guarantee
----------------------
Every step that creates an outbound action goes through the OmnichannelGateway
which creates a PendingAction. The CEO approves each step before it fires.
The engine advances the sequence but NEVER sends anything autonomously.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.sequence import DynamicSequence, ExecutionStatus, SequenceExecution
from app.schemas.sequence import AdvanceResult, ExecutionCreate, SequenceCreate

logger = get_logger(__name__)


class TransitionEvaluator:
    """Evaluates whether a transition condition is satisfied.

    Conditions are simple string matches against recorded event names.
    More complex conditions (timeout-based, combination) are expressed
    as ``not_X_Nd`` patterns (e.g., ``not_opened_3d`` = not opened in 3 days).

    Extending
    ---------
    Add new condition patterns here without modifying the DynamicSequenceEngine.
    """

    @staticmethod
    def matches(condition: str, event: str, execution: SequenceExecution) -> bool:
        """Return True if the condition is satisfied by the given event.

        Simple conditions: exact match (``email_opened`` == ``email_opened``).
        Timeout conditions: ``not_<event>_<N>d`` — event has NOT occurred in N days.
        Compound conditions: ``<event_a>_AND_NOT_<event_b>`` — both conditions.
        """
        if condition == event:
            return True

        # Handle "event_A_AND_NOT_event_B" compound condition
        if "_AND_NOT_" in condition:
            must_have, must_not = condition.split("_AND_NOT_", 1)
            events = execution.all_event_names()
            return must_have in events and must_not not in events

        # Handle "not_X_Nd" timeout condition
        if condition.startswith("not_") and condition.endswith("d"):
            # e.g. "not_opened_3d" → check if "opened" hasn't occurred
            parts = condition[4:].rsplit("_", 1)
            if len(parts) == 2:
                target_event, days_str = parts
                try:
                    days = int(days_str[:-1]) if days_str.endswith("d") else int(days_str)
                except ValueError:
                    return False
                events = execution.all_event_names()
                if target_event in events:
                    return False  # Event DID happen — condition not met
                # Check if enough time has passed
                started = execution.started_at
                if started.tzinfo is None:
                    started = started.replace(tzinfo=UTC)
                elapsed = (datetime.now(UTC) - started).days
                return elapsed >= days

        return False


class DynamicSequenceEngine:
    """Manages DynamicSequence definitions and their running executions."""

    def __init__(self, session: Session) -> None:
        self.session = session

    # ── Sequence management ───────────────────────────────────────────────────

    def create_sequence(self, data: SequenceCreate) -> DynamicSequence:
        """Define a new sequence DAG."""
        seq = DynamicSequence(
            name=data.name,
            description=data.description,
            signal_type=data.signal_type,
            industry=data.industry,
            entry_step_id=data.entry_step_id,
            steps=[s.model_dump() for s in data.steps],
            max_days=data.max_days,
        )
        self.session.add(seq)
        self.session.flush()
        self.session.refresh(seq)
        logger.info("DynamicSequence created: id=%s name=%s steps=%d", seq.id, seq.name, len(seq.steps))
        return seq

    def get_sequence(self, sequence_id: uuid.UUID) -> DynamicSequence | None:
        return self.session.get(DynamicSequence, sequence_id)

    def list_sequences(self, limit: int = 50) -> list[DynamicSequence]:
        stmt = select(DynamicSequence).order_by(DynamicSequence.created_at.desc()).limit(limit)
        return list(self.session.exec(stmt).all())

    # ── Execution management ──────────────────────────────────────────────────

    def start_execution(self, data: ExecutionCreate) -> SequenceExecution:
        """Instantiate a sequence execution for a specific lead/opportunity.

        Creates the execution and immediately tries to execute the entry step
        (creating the first PendingAction for CEO approval).
        """
        seq = self.session.get(DynamicSequence, data.sequence_id)
        if not seq:
            raise ValueError(f"Sequence {data.sequence_id} not found")

        execution = SequenceExecution(
            sequence_id=data.sequence_id,
            opportunity_id=data.opportunity_id,
            lead_id=data.lead_id,
            current_step_id=seq.entry_step_id,
            status=ExecutionStatus.RUNNING,
        )
        self.session.add(execution)
        self.session.flush()
        self.session.refresh(execution)

        # Execute the entry step immediately (creates first PendingAction)
        self._execute_step(execution, seq)
        self.session.flush()

        logger.info(
            "SequenceExecution started: id=%s seq=%s step=%s opp=%s",
            execution.id, data.sequence_id, execution.current_step_id, data.opportunity_id,
        )
        return execution

    def advance(
        self,
        execution_id: uuid.UUID,
        event: str,
        metadata: dict[str, Any] | None = None,
    ) -> AdvanceResult:
        """Record an event and advance the sequence to the next step.

        The engine evaluates all transitions of the current step. The first
        matching transition determines the next step. If no transition matches,
        the execution stays at the current step (waiting for more events).

        Args:
            execution_id: The running sequence execution to advance.
            event:        The engagement event (e.g., "email_opened").
            metadata:     Optional data about the event.

        Returns:
            An :class:`AdvanceResult` describing what happened.
        """
        execution = self.session.get(SequenceExecution, execution_id)
        if not execution:
            raise ValueError(f"Execution {execution_id} not found")

        if execution.status in (ExecutionStatus.COMPLETED, ExecutionStatus.CANCELLED):
            return AdvanceResult(
                execution_id=execution_id,
                previous_step=execution.current_step_id,
                current_step=execution.current_step_id,
                status=execution.status,
                transition_triggered=None,
                pending_action_created=False,
                message=f"Execution already {execution.status}",
            )

        seq = self.session.get(DynamicSequence, execution.sequence_id)
        if not seq:
            raise ValueError(f"Sequence {execution.sequence_id} not found for execution {execution_id}")

        previous_step = execution.current_step_id
        execution.record_event(event, metadata)

        # Find the current step definition
        step_map = seq.step_map
        current_step_def = step_map.get(execution.current_step_id)
        if not current_step_def:
            return AdvanceResult(
                execution_id=execution_id,
                previous_step=previous_step,
                current_step=execution.current_step_id,
                status=ExecutionStatus.FAILED,
                transition_triggered=None,
                pending_action_created=False,
                message=f"Step '{execution.current_step_id}' not found in sequence definition",
            )

        # Evaluate transitions
        transitions = current_step_def.get("transitions", [])
        matched_condition: str | None = None
        next_step_id: str | None = None

        for transition in transitions:
            condition = transition.get("condition", "")
            if TransitionEvaluator.matches(condition, event, execution):
                matched_condition = condition
                next_step_id = transition.get("next_step_id")
                break

        pending_created = False
        if matched_condition is not None:
            # Advance to the next step
            if next_step_id:
                execution.current_step_id = next_step_id
                next_step_def = step_map.get(next_step_id)
                if next_step_def:
                    action_id = self._execute_step(execution, seq)
                    pending_created = action_id is not None
            else:
                # next_step_id is None → sequence complete
                execution.status = ExecutionStatus.COMPLETED
                execution.completed_at = datetime.now(UTC)
                logger.info("Sequence execution %s COMPLETED via condition '%s'", execution_id, matched_condition)
        else:
            logger.debug(
                "No transition matched for event '%s' at step '%s' in execution %s",
                event, execution.current_step_id, execution_id,
            )

        execution.last_advanced_at = datetime.now(UTC)
        self.session.add(execution)
        self.session.flush()

        return AdvanceResult(
            execution_id=execution_id,
            previous_step=previous_step,
            current_step=execution.current_step_id if execution.status != ExecutionStatus.COMPLETED else None,
            status=execution.status,
            transition_triggered=matched_condition,
            pending_action_created=pending_created,
            message=self._describe_result(matched_condition, next_step_id, execution.status),
        )

    def get_execution(self, execution_id: uuid.UUID) -> SequenceExecution | None:
        return self.session.get(SequenceExecution, execution_id)

    def list_executions(
        self,
        sequence_id: uuid.UUID | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[SequenceExecution]:
        stmt = select(SequenceExecution).order_by(SequenceExecution.created_at.desc()).limit(limit)
        if sequence_id:
            stmt = stmt.where(SequenceExecution.sequence_id == sequence_id)
        if status:
            stmt = stmt.where(SequenceExecution.status == status)
        return list(self.session.exec(stmt).all())

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _execute_step(self, execution: SequenceExecution, seq: DynamicSequence) -> str | None:
        """Create a PendingAction for the current execution step.

        Returns the PendingAction ID if created, or None if no action needed.
        """
        step = seq.step_map.get(execution.current_step_id)
        if not step:
            return None

        action = step.get("action", "")
        channel = step.get("channel", "email")
        artifact_type = step.get("artifact_type", action)
        step_name = step.get("name", action)

        try:
            from app.models.base import ActionStatus, ActionType
            from app.models.pending_action import PendingAction

            pending = PendingAction(
                opportunity_id=execution.opportunity_id,
                action_type=ActionType.SEND_EMAIL if channel == "email" else ActionType.LINKEDIN_MESSAGE,
                status=ActionStatus.PENDING_APPROVAL,
                title=f"Sequence step: {step_name}",
                description=f"Sequence '{seq.name}' → step '{execution.current_step_id}': {action}",
                preview=f"Action: {action} via {channel}",
                payload={
                    "sequence_id": str(seq.id),
                    "execution_id": str(execution.id),
                    "step_id": execution.current_step_id,
                    "action": action,
                    "channel": channel,
                    "artifact_type": artifact_type,
                },
                generator="dynamic_sequence_engine",
            )
            self.session.add(pending)
            self.session.flush()
            self.session.refresh(pending)

            # Track action in execution
            execution.pending_action_ids = [*execution.pending_action_ids, str(pending.id)]
            self.session.add(execution)

            logger.info(
                "Sequence step '%s' created PendingAction %s for execution %s",
                execution.current_step_id, pending.id, execution.id,
            )
            return str(pending.id)

        except Exception:  # noqa: BLE001
            logger.exception("Failed to create PendingAction for sequence step %s", execution.current_step_id)
            return None

    @staticmethod
    def _describe_result(condition: str | None, next_step: str | None, status: str) -> str:
        if condition is None:
            return "No matching transition. Waiting for next event."
        if status == ExecutionStatus.COMPLETED:
            return f"Sequence completed via condition '{condition}'."
        return f"Advanced via '{condition}' → step '{next_step}'."
