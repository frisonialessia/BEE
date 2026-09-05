"""BEE Copilot — ``GET /assistant/status``, ``POST /assistant/chat``, and the
saved-conversation endpoints (``/assistant/conversations``).

Requires a logged-in user (never an org API key): every tool the model can
call runs under that user's own visibility, so the copilot can never show a
MEMBER a deal their manager hierarchy would hide from them in the CRM. See
:mod:`app.services.assistant` for the loop and the tool belt.

Conversations are private to the user who started them — never org-scoped,
never reassignable — see :mod:`app.models.assistant_conversation` for why.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import get_current_user
from app.core.database import get_session
from app.models.assistant_conversation import RETENTION_DAYS, AssistantConversation
from app.models.base import utcnow
from app.models.user import User
from app.schemas.assistant import (
    AssistantChatIn,
    AssistantChatOut,
    AssistantConversationDetailOut,
    AssistantConversationOut,
    AssistantStatusOut,
    AssistantToolCallOut,
    AssistantToolInfo,
)
from app.services.assistant import AssistantService, AssistantUnavailableError

router = APIRouter(prefix="/assistant", tags=["Assistant (BEE Copilot)"])


def _title_from(messages: list[dict[str, str]]) -> str:
    """A conversation's label, derived once from its opening message."""
    first_user = next((m["content"] for m in messages if m["role"] == "user"), "Conversación")
    first_user = " ".join(first_user.split())  # collapse newlines/whitespace for a clean list row
    return first_user[:77] + "…" if len(first_user) > 77 else first_user or "Conversación"


def _load_conversation(session: Session, current_user: User, conversation_id: uuid.UUID) -> AssistantConversation:
    conversation = session.get(AssistantConversation, conversation_id)
    if conversation is None or conversation.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    return conversation


@router.get(
    "/status",
    response_model=AssistantStatusOut,
    summary="Whether the model-backed copilot is enabled, and which tools it has",
)
def get_assistant_status(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AssistantStatusOut:
    service = AssistantService(session, current_user)
    return AssistantStatusOut(
        available=service.available,
        provider=service.provider,
        model=service.model,
        tools=[AssistantToolInfo(name=t.name, description=t.description, mutates=t.mutates) for t in service.tools],
    )


@router.post(
    "/chat",
    response_model=AssistantChatOut,
    summary="Ask the copilot — it reads (and, on request, acts on) the caller's own pipeline",
)
def chat_with_assistant(
    data: AssistantChatIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AssistantChatOut:
    service = AssistantService(session, current_user)
    try:
        reply = service.chat([m.model_dump() for m in data.messages], locale=data.locale)
    except AssistantUnavailableError as exc:
        # 503, not 404: the route exists, the capability is switched off on
        # this deployment — the frontend falls back to its local engine.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if data.conversation_id is not None:
        conversation = _load_conversation(session, current_user, data.conversation_id)
    else:
        conversation = AssistantConversation(
            organization_id=current_user.organization_id,
            user_id=current_user.id,
            title=_title_from([m.model_dump() for m in data.messages]),
        )

    # AssistantChatIn's contract guarantees data.messages ends with the
    # person's latest message — whatever came before it (older turns the
    # client resends for context, then trims to MAX_HISTORY) is already on
    # file from earlier calls. So the only new material this turn is that
    # last message plus the reply just generated for it; no need to
    # reconcile the two lists position-by-position (and no risk of drifting
    # out of sync once the client's own history trimming kicks in).
    now = utcnow()
    new_turn = data.messages[-1]
    conversation.messages = [
        *conversation.messages,
        {"role": new_turn.role, "content": new_turn.content, "created_at": now.isoformat()},
        {"role": "assistant", "content": reply.text, "created_at": now.isoformat()},
    ]
    conversation.last_message_at = now
    session.add(conversation)
    session.commit()
    session.refresh(conversation)

    return AssistantChatOut(
        reply=reply.text,
        tool_calls=[AssistantToolCallOut(name=c.name, summary=c.summary, mutates=c.mutates) for c in reply.tool_calls],
        provider=service.provider,
        model=service.model,
        conversation_id=conversation.id,
    )


@router.get(
    "/conversations",
    response_model=list[AssistantConversationOut],
    summary="List the caller's saved copilot conversations, most recent first",
)
def list_conversations(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[AssistantConversationOut]:
    # Lazy retention sweep — see app.models.assistant_conversation's module
    # docstring: no separate cron, this is the one place old threads are
    # actually deleted, and only ever the caller's own.
    cutoff = utcnow() - timedelta(days=RETENTION_DAYS)
    stale = session.exec(
        select(AssistantConversation).where(
            AssistantConversation.user_id == current_user.id,
            AssistantConversation.last_message_at < cutoff,
        )
    ).all()
    for conversation in stale:
        session.delete(conversation)
    if stale:
        session.commit()

    statement = (
        select(AssistantConversation)
        .where(AssistantConversation.user_id == current_user.id)
        .order_by(AssistantConversation.last_message_at.desc())  # type: ignore[attr-defined]
    )
    conversations = session.exec(statement).all()
    return [AssistantConversationOut.model_validate(c, from_attributes=True) for c in conversations]


@router.get(
    "/conversations/{conversation_id}",
    response_model=AssistantConversationDetailOut,
    summary="Load one saved conversation's full message history",
)
def get_conversation(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AssistantConversationDetailOut:
    conversation = _load_conversation(session, current_user, conversation_id)
    return AssistantConversationDetailOut.model_validate(conversation, from_attributes=True)


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a saved conversation",
)
def delete_conversation(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    conversation = _load_conversation(session, current_user, conversation_id)
    session.delete(conversation)
    session.commit()
