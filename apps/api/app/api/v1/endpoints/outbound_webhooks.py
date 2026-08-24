"""Org-configured outbound webhooks — BEE pushing events out, not receiving them.

Complements ``POST /signals/webhook`` (BEE receiving external signals): this
is BEE notifying an org's own systems — Zapier, Make, Slack, a homegrown
CRM — when something happens (a deal closes, a battlecard is ready), with no
partner API credentials required on either side. See
``app.models.outbound_webhook`` for the storage rationale and
``OutboundWebhookHandler`` (app.services.workflow_orchestrator.handlers)
for how these actually get called.
"""

from __future__ import annotations

import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import get_current_user, require_roles
from app.core.database import get_session
from app.models.base import UserRole
from app.models.outbound_webhook import OutboundWebhook
from app.models.user import User
from app.schemas.outbound_webhook import (
    AVAILABLE_EVENT_TYPES,
    OutboundWebhookCreateIn,
    OutboundWebhookCreated,
    OutboundWebhookOut,
    OutboundWebhookUpdateIn,
)

router = APIRouter(prefix="/outbound-webhooks", tags=["Outbound Webhooks"])

# How much of the plaintext secret to keep around for display in a listing —
# enough to recognize which secret is which, nowhere near enough to forge a
# signature with it. Same rationale as api_keys.py's _PREFIX_DISPLAY_CHARS.
_PREVIEW_CHARS = 8


def _hidden_from(current_user: User | None, webhook: OutboundWebhook) -> bool:
    if current_user is None:
        return False
    return webhook.organization_id is not None and webhook.organization_id != current_user.organization_id


@router.get(
    "/event-types",
    response_model=list[str],
    summary="List the event types an outbound webhook can subscribe to",
)
def list_event_types() -> list[str]:
    return AVAILABLE_EVENT_TYPES


@router.post(
    "",
    response_model=OutboundWebhookCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new outbound webhook (OWNER/ADMIN only)",
)
def create_webhook(
    data: OutboundWebhookCreateIn,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> OutboundWebhookCreated:
    """Register a webhook and return its signing secret exactly once.

    The plaintext is never shown again after this response — if it's lost,
    delete this webhook and register a new one. Unknown event types are
    rejected up front rather than silently never firing.
    """
    unknown = set(data.event_types) - set(AVAILABLE_EVENT_TYPES)
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown event type(s): {sorted(unknown)}. Valid: {AVAILABLE_EVENT_TYPES}",
        )

    secret = data.secret or secrets.token_hex(24)
    webhook = OutboundWebhook(
        organization_id=current_user.organization_id,
        created_by_user_id=current_user.id,
        url=data.url,
        secret=secret,
        secret_preview=secret[:_PREVIEW_CHARS],
        event_types=data.event_types,
    )
    session.add(webhook)
    session.commit()
    session.refresh(webhook)
    return OutboundWebhookCreated(**OutboundWebhookOut.model_validate(webhook).model_dump(), secret=secret)


@router.get(
    "",
    response_model=list[OutboundWebhookOut],
    summary="List the caller's organization's outbound webhooks",
)
def list_webhooks(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[OutboundWebhook]:
    statement = (
        select(OutboundWebhook)
        .where(OutboundWebhook.organization_id == current_user.organization_id)
        .order_by(OutboundWebhook.created_at.desc())  # type: ignore[union-attr]
    )
    return list(session.exec(statement).all())


@router.patch(
    "/{webhook_id}",
    response_model=OutboundWebhookOut,
    summary="Update an outbound webhook (OWNER/ADMIN only)",
)
def update_webhook(
    webhook_id: uuid.UUID,
    data: OutboundWebhookUpdateIn,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> OutboundWebhook:
    webhook = session.get(OutboundWebhook, webhook_id)
    if webhook is None or _hidden_from(current_user, webhook):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found.")

    updates = data.model_dump(exclude_unset=True)
    if "event_types" in updates and updates["event_types"] is not None:
        unknown = set(updates["event_types"]) - set(AVAILABLE_EVENT_TYPES)
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown event type(s): {sorted(unknown)}. Valid: {AVAILABLE_EVENT_TYPES}",
            )
    for field, value in updates.items():
        setattr(webhook, field, value)

    session.add(webhook)
    session.commit()
    session.refresh(webhook)
    return webhook


@router.delete(
    "/{webhook_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an outbound webhook (OWNER/ADMIN only)",
)
def delete_webhook(
    webhook_id: uuid.UUID,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    session: Session = Depends(get_session),
) -> None:
    webhook = session.get(OutboundWebhook, webhook_id)
    if webhook is None or _hidden_from(current_user, webhook):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found.")

    session.delete(webhook)
    session.commit()
