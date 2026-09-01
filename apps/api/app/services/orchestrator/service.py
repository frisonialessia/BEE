"""AgentOrchestrator — the security gate for autonomous execution.

The AgentOrchestrator sits between the ExecutiveAgent (which generates
execution artifacts) and the external world (which sends emails, updates CRMs,
etc.). Its job is to:

1. **Create** a ``PendingAction`` for every artifact that requires external
   interaction — always starting in ``PENDING_APPROVAL``.

2. **Expose** pending actions to external tools (n8n/Zapier) via the
   ``/orchestrator/pending-actions`` endpoint so they can display the queue.

3. **Gate** execution: no action can transition from PENDING_APPROVAL to
   EXECUTING without an explicit approval call. This is enforced at the
   service level, not just at the API level.

4. **Track** the full lifecycle: APPROVED → EXECUTING → COMPLETED/FAILED, with
   automatic retry logic (up to 3 retries) for failed actions.

Security guarantees
-------------------
* PENDING_APPROVAL is the ONLY valid initial state — no constructor bypasses.
* The ``approve`` method is the ONLY way to transition to APPROVED.
* Any call to ``start_execution`` without prior approval raises ValueError.
* A COMPLETED or REJECTED action cannot be re-approved — it is terminal.
"""

from __future__ import annotations

import uuid

from sqlmodel import Session

from app.core.logging import get_logger
from app.models.base import ActionStatus, ActionType
from app.models.pending_action import PendingAction
from app.repositories.pending_action import PendingActionRepository
from app.schemas.executive import ArtifactBundle
from app.schemas.orchestrator import (
    ApprovalIn,
    ExecutionCompleteIn,
    ExecutionFailedIn,
    ExecutionStartIn,
    OrchestratorStatusOut,
    RejectionIn,
)
from app.services.omnichannel.gateway import OmnichannelGateway

logger = get_logger(__name__)

_INVALID_TRANSITIONS: dict[ActionStatus, set[ActionStatus]] = {
    ActionStatus.COMPLETED: {ActionStatus.APPROVED, ActionStatus.REJECTED, ActionStatus.EXECUTING},
    ActionStatus.REJECTED: {ActionStatus.APPROVED, ActionStatus.EXECUTING, ActionStatus.COMPLETED},
}


class PendingActionNotFoundError(ValueError):
    """Raised when an action ID doesn't exist — distinct from an invalid
    state transition on an action that DOES exist, so callers (the API layer)
    can map the two to different HTTP statuses (404 vs 409) instead of both
    collapsing into 409 CONFLICT."""


class AgentOrchestrator:
    """Creates and manages the lifecycle of execution actions.

    Every external interaction that BEE might perform (send email, update CRM,
    book a meeting) passes through this orchestrator before being executed.
    """

    def __init__(self, session: Session, gateway: OmnichannelGateway) -> None:
        self.session = session
        self._repo = PendingActionRepository(session)
        # Required, not a None-default: every AgentOrchestrator is constructed
        # at the endpoint layer (see _get_orchestrator), so there's no call
        # site where a gateway isn't actually available. A previous version
        # of the approval flow left OmnichannelGateway.dispatch_approved()
        # and ChannelDispatcher fully implemented and unit-tested but never
        # invoked from any live request path — approving a channel-backed
        # action (one created via gateway.prepare_action, e.g. an auto-drafted
        # SmartEngagementEngine reply) just left it stuck in APPROVED forever,
        # waiting on an external tool that was never going to poll for it.
        self._gateway = gateway

    # ── Creation ─────────────────────────────────────────────────────────────

    def create_from_bundle(
        self, bundle: ArtifactBundle, organization_id: uuid.UUID | None = None
    ) -> list[PendingAction]:
        """Create a PendingAction for each executable artifact in the bundle.

        Currently creates one EMAIL action. The meeting structure and next steps
        are embedded in the payload but don't create separate actions (they
        accompany the email action as context for the approver).

        ``organization_id`` is the owning opportunity's tenant — stamped on
        the created action so it stays scoped to that organization rather
        than falling into the "untagged" (visible to every tenant) bucket.

        Extensible: add new ActionType cases here as BEE grows.
        """
        actions: list[PendingAction] = []

        email = bundle.email_draft
        action = PendingAction(
            organization_id=organization_id,
            opportunity_id=bundle.opportunity_id,
            artifact_bundle_id=str(bundle.opportunity_id),
            action_type=ActionType.SEND_EMAIL,
            title=f"Send email: {email.subject}",
            description=(
                f"Send outreach email to the lead associated with opportunity "
                f"{bundle.opportunity_id}. "
                f"Preview: {email.body[:120]}..."
            ),
            preview=f"Subject: {email.subject}\n\n{email.body[:300]}...",
            payload={
                "email_draft": email.model_dump(mode="json"),
                "meeting_structure": bundle.meeting_structure.model_dump(mode="json"),
                "next_steps": bundle.next_steps.model_dump(mode="json"),
                "context_snapshot": bundle.context_snapshot,
            },
            priority=80,
        )
        actions.append(self._repo.add(action))
        logger.info(
            "Created PendingAction %s [SEND_EMAIL] for opportunity %s",
            action.id, bundle.opportunity_id,
        )

        return actions

    # ── State transitions (security-gated) ──────────────────────────────────

    def approve(
        self, action_id: uuid.UUID, body: ApprovalIn, organization_id: uuid.UUID | None = None
    ) -> PendingAction:
        """Approve a pending action. Raises ValueError on invalid state.

        Actions created via ``OmnichannelGateway.prepare_action`` carry a
        ``channel`` key in their payload — BEE already has a registered
        provider for those (mock or real, see ``get_channel_status``), so
        there's no reason to leave them sitting in APPROVED waiting for an
        external tool: dispatch them immediately through the gateway.
        Actions created via ``create_from_bundle`` (battlecard email drafts
        with meeting structure / next steps attached) have no ``channel``
        key by design — those stay on the external-tool path (n8n/Zapier
        poll ``/approved-actions`` and call ``start-execution``/``complete``
        themselves), unchanged.
        """
        action = self._get_or_raise(action_id, organization_id)
        self._assert_status(action, ActionStatus.PENDING_APPROVAL, "approve")
        action.mark_approved(body.approved_by)
        self.session.add(action)
        self.session.commit()
        self.session.refresh(action)
        logger.info("Action %s approved by %s", action_id, body.approved_by)

        if action.payload.get("channel"):
            self._dispatch_via_gateway(action)

        return action

    def _dispatch_via_gateway(self, action: PendingAction) -> None:
        """Send a gateway-native action through its registered channel
        provider right after approval, and record the outcome.

        Never raises — a provider failure (rate limit, no credentials, mock
        mode) is recorded on the action via ``mark_failed`` rather than
        surfaced as a 500 to the approver; the action stays inspectable
        (and, if retryable, requeued) instead of vanishing mid-request.
        """
        action.mark_executing("omnichannel_gateway")
        self.session.add(action)
        self.session.commit()
        self.session.refresh(action)

        try:
            result = self._gateway.dispatch_approved(action)
        except Exception as exc:  # noqa: BLE001 - provider failures must not break approval
            logger.exception("Dispatch failed for action %s", action.id)
            action.mark_failed(str(exc))
            self.session.add(action)
            self.session.commit()
            return

        if result.success:
            action.mark_completed()
            logger.info(
                "Action %s dispatched via %s (mock=%s message_id=%s)",
                action.id, result.channel, result.mock, result.message_id,
            )
        else:
            action.mark_failed(result.error)
            logger.warning("Action %s dispatch failed: %s", action.id, result.error)
        self.session.add(action)
        self.session.commit()
        self.session.refresh(action)

    def reject(
        self, action_id: uuid.UUID, body: RejectionIn, organization_id: uuid.UUID | None = None
    ) -> PendingAction:
        """Reject a pending action. Raises ValueError on invalid state."""
        action = self._get_or_raise(action_id, organization_id)
        self._assert_status(action, ActionStatus.PENDING_APPROVAL, "reject")
        action.mark_rejected(body.reason)
        self.session.add(action)
        self.session.commit()
        self.session.refresh(action)
        logger.info("Action %s rejected (reason=%s)", action_id, body.reason)
        return action

    def start_execution(
        self, action_id: uuid.UUID, body: ExecutionStartIn, organization_id: uuid.UUID | None = None
    ) -> PendingAction:
        """Mark an action as executing. MUST be called only after approval."""
        action = self._get_or_raise(action_id, organization_id)
        self._assert_status(action, ActionStatus.APPROVED, "start execution")
        action.mark_executing(body.tool)
        self.session.add(action)
        self.session.commit()
        self.session.refresh(action)
        logger.info("Action %s executing via %s", action_id, body.tool)
        return action

    def complete(
        self,
        action_id: uuid.UUID,
        body: ExecutionCompleteIn,  # noqa: ARG002
        organization_id: uuid.UUID | None = None,
    ) -> PendingAction:
        """Mark an action as completed successfully."""
        action = self._get_or_raise(action_id, organization_id)
        self._assert_status(action, ActionStatus.EXECUTING, "complete")
        action.mark_completed()
        self.session.add(action)
        self.session.commit()
        self.session.refresh(action)
        logger.info("Action %s completed", action_id)
        return action

    def fail(
        self, action_id: uuid.UUID, body: ExecutionFailedIn, organization_id: uuid.UUID | None = None
    ) -> PendingAction:
        """Mark an action as failed, optionally requeuing it for retry."""
        action = self._get_or_raise(action_id, organization_id)
        self._assert_status(action, ActionStatus.EXECUTING, "fail")
        action.mark_failed(body.reason)

        if body.retry and action.is_retryable:
            action.status = ActionStatus.PENDING_APPROVAL
            logger.info("Action %s failed, requeued for retry (%d)", action_id, action.retry_count)
        else:
            logger.warning("Action %s failed permanently (retry=%s retries=%d)", action_id, body.retry, action.retry_count)

        self.session.add(action)
        self.session.commit()
        self.session.refresh(action)
        return action

    # ── Query interface ──────────────────────────────────────────────────────

    def get_pending(
        self, limit: int = 50, offset: int = 0, organization_id: uuid.UUID | None = None
    ) -> list[PendingAction]:
        return self._repo.list_pending(limit=limit, offset=offset, organization_id=organization_id)

    def get_approved(
        self, limit: int = 50, organization_id: uuid.UUID | None = None
    ) -> list[PendingAction]:
        """Return approved actions ready for external tools to execute."""
        return self._repo.list_approved(limit=limit, organization_id=organization_id)

    def get_by_opportunity(
        self, opportunity_id: uuid.UUID, organization_id: uuid.UUID | None = None
    ) -> list[PendingAction]:
        return self._repo.list_by_opportunity(opportunity_id, organization_id=organization_id)

    def get_status(self, organization_id: uuid.UUID | None = None) -> OrchestratorStatusOut:
        counts = self._repo.count_by_status(organization_id=organization_id)
        return OrchestratorStatusOut(
            total_pending=counts.get(ActionStatus.PENDING_APPROVAL.value, 0),
            total_approved=counts.get(ActionStatus.APPROVED.value, 0),
            total_executing=counts.get(ActionStatus.EXECUTING.value, 0),
            total_completed=counts.get(ActionStatus.COMPLETED.value, 0),
            total_failed=counts.get(ActionStatus.FAILED.value, 0),
            total_rejected=counts.get(ActionStatus.REJECTED.value, 0),
        )

    # ── Internal helpers ─────────────────────────────────────────────────────

    def _get_or_raise(
        self, action_id: uuid.UUID, organization_id: uuid.UUID | None = None
    ) -> PendingAction:
        action = self._repo.get(action_id)
        if action is None:
            raise PendingActionNotFoundError(f"PendingAction {action_id} not found")
        # Tenant boundary: an action tagged to a *different* organization than
        # the caller's is treated as not found (404, not 403) — same
        # ID-enumeration-avoidance convention as every other single-record
        # fetch in the codebase (see opportunities.py's _hidden_from). An
        # untagged action (organization_id is None — pre-multi-tenancy data,
        # or a caller with no resolvable org) stays visible, same "untagged =
        # shared" convention as scope_by_organization_id.
        if (
            organization_id is not None
            and action.organization_id is not None
            and action.organization_id != organization_id
        ):
            raise PendingActionNotFoundError(f"PendingAction {action_id} not found")
        return action

    def _assert_status(
        self, action: PendingAction, required: ActionStatus, operation: str
    ) -> None:
        if action.status != required:
            raise ValueError(
                f"Cannot {operation} action {action.id}: "
                f"expected status '{required.value}', got '{action.status.value}'."
            )
