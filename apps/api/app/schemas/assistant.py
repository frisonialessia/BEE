"""Schemas for the BEE Copilot — ``/api/v1/assistant``."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class AssistantMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AssistantChatIn(BaseModel):
    """The conversation so far, oldest first, ending with the person's
    latest message. Stateless on the server — the client owns the thread,
    so a refresh loses nothing more than it did with the local engine."""

    messages: list[AssistantMessageIn] = Field(min_length=1, max_length=40)
    locale: Literal["es", "en"] = "es"


class AssistantToolCallOut(BaseModel):
    name: str
    summary: str
    mutates: bool


class AssistantChatOut(BaseModel):
    reply: str
    tool_calls: list[AssistantToolCallOut]
    provider: str
    model: str | None


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
