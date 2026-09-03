"""BEE Copilot — ``GET /assistant/status`` and ``POST /assistant/chat``.

Requires a logged-in user (never an org API key): every tool the model can
call runs under that user's own visibility, so the copilot can never show a
MEMBER a deal their manager hierarchy would hide from them in the CRM. See
:mod:`app.services.assistant` for the loop and the tool belt.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_user
from app.core.database import get_session
from app.models.user import User
from app.schemas.assistant import (
    AssistantChatIn,
    AssistantChatOut,
    AssistantStatusOut,
    AssistantToolCallOut,
    AssistantToolInfo,
)
from app.services.assistant import AssistantService, AssistantUnavailableError

router = APIRouter(prefix="/assistant", tags=["Assistant (BEE Copilot)"])


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
    return AssistantChatOut(
        reply=reply.text,
        tool_calls=[AssistantToolCallOut(name=c.name, summary=c.summary, mutates=c.mutates) for c in reply.tool_calls],
        provider=service.provider,
        model=service.model,
    )
