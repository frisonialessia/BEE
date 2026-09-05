"""Schemas for the BEE Copilot — ``/api/v1/assistant``."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AssistantMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AssistantChatIn(BaseModel):
    """The conversation so far, oldest first, ending with the person's
    latest message. Stateless on the server — the client owns the thread,
    so a refresh loses nothing more than it did with the local engine.

    ``conversation_id`` is optional and additive: omit it (or leave it
    ``None``) and nothing changes from before this existed. Pass one to
    have the turn saved to — and, on later turns, appended onto — that
    thread; pass none on a first message and the reply carries back the
    id of the thread that was created for it.
    """

    messages: list[AssistantMessageIn] = Field(min_length=1, max_length=40)
    locale: Literal["es", "en"] = "es"
    conversation_id: uuid.UUID | None = None


class AssistantToolCallOut(BaseModel):
    name: str
    summary: str
    mutates: bool


class AssistantChatOut(BaseModel):
    reply: str
    tool_calls: list[AssistantToolCallOut]
    provider: str
    model: str | None
    conversation_id: uuid.UUID


class AssistantToolInfo(BaseModel):
    name: str
    description: str
    mutates: bool


class AssistantStatusOut(BaseModel):
    """``available=false`` tells the frontend to keep its client-side rule
    engine — the copilot is additive, never a hard dependency."""

    available: bool
    provider: str
    model: str | None
    tools: list[AssistantToolInfo]


class AssistantMessageOut(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: str


class AssistantConversationOut(BaseModel):
    """Metadata only — what a conversation list shows. No ``messages``, so
    listing a hundred long threads stays cheap."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    last_message_at: datetime
    created_at: datetime


class AssistantConversationDetailOut(AssistantConversationOut):
    """The full thread — what opening one from the list, or continuing it,
    needs."""

    messages: list[AssistantMessageOut]
