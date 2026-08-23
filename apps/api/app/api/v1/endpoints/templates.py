"""Message template library — reusable outreach content, org-scoped.

Sequences reference an ``artifact_type`` per step but have no library of
actual rep-written content to draw from; this is that library. Deliberately
simple CRUD, no relation yet to DynamicSequence — wiring a step to a
specific template is a natural next step once this exists.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import get_current_user, get_current_user_optional
from app.core.database import get_session
from app.models.message_template import MessageTemplate
from app.models.user import User
from app.schemas.message_template import (
    MessageTemplateCreateIn,
    MessageTemplateOut,
    MessageTemplateUpdateIn,
)
from app.services.permissions import scope_by_organization_id

router = APIRouter(prefix="/templates", tags=["Message Templates"])


def _hidden_from(current_user: User | None, template: MessageTemplate) -> bool:
    if current_user is None:
        return False
    return template.organization_id is not None and template.organization_id != current_user.organization_id


@router.post(
    "",
    response_model=MessageTemplateOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a reusable message template",
)
def create_template(
    data: MessageTemplateCreateIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> MessageTemplateOut:
    template = MessageTemplate(
        organization_id=current_user.organization_id,
        created_by_user_id=current_user.id,
        name=data.name,
        channel=data.channel,
        subject=data.subject,
        body=data.body,
    )
    session.add(template)
    session.commit()
    session.refresh(template)
    return MessageTemplateOut.model_validate(template)


@router.get(
    "",
    response_model=list[MessageTemplateOut],
    summary="List message templates visible to the caller",
)
def list_templates(
    limit: int = 100,
    offset: int = 0,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> list[MessageTemplateOut]:
    statement = select(MessageTemplate).order_by(MessageTemplate.created_at.desc())  # type: ignore[union-attr]
    organization_id = current_user.organization_id if current_user else None
    statement = scope_by_organization_id(statement, MessageTemplate.organization_id, organization_id)
    statement = statement.limit(limit).offset(offset)
    templates = list(session.exec(statement).all())
    return [MessageTemplateOut.model_validate(t) for t in templates]


@router.patch(
    "/{template_id}",
    response_model=MessageTemplateOut,
    summary="Update a message template",
)
def update_template(
    template_id: uuid.UUID,
    data: MessageTemplateUpdateIn,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> MessageTemplateOut:
    template = session.get(MessageTemplate, template_id)
    if template is None or _hidden_from(current_user, template):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found.")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(template, field, value)

    session.add(template)
    session.commit()
    session.refresh(template)
    return MessageTemplateOut.model_validate(template)


@router.delete(
    "/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a message template",
)
def delete_template(
    template_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> None:
    template = session.get(MessageTemplate, template_id)
    if template is None or _hidden_from(current_user, template):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found.")

    session.delete(template)
    session.commit()
