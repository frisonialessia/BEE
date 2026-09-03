"""AssistantService — the BEE Copilot: a model with hands on the platform.

Before this service the in-app assistant was a client-side rule engine
(``apps/web/src/lib/assistant/intent-router.ts``) that pattern-matched a
question against data the page had already fetched. That is still the
fallback when no AI provider is configured (``AI_PROVIDER=none``), so
nothing regresses for a deployment without a key — but with a key set,
``POST /assistant/chat`` runs a real tool-use loop: the model decides
which of the org-scoped tools in :mod:`app.services.assistant.tools` to
call, BEE executes them against the live database under the caller's own
visibility, and the model answers from those results.

Provider selection mirrors :mod:`app.services.strategy_generator.
llm_generator`: ``AI_PROVIDER`` picks Anthropic or OpenAI, ``AI_API_KEY``
authenticates, ``ANTHROPIC_MODEL``/``AI_MODEL`` name the model. The two
backends differ only in wire format; the loop shape (ask → tool calls →
results → ask again, bounded by ``_MAX_TOOL_TURNS``) is the same, and
``AssistantService`` accepts an injected backend so tests exercise the
whole loop hermetically with a scripted one — no network, no key.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from sqlmodel import Session

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.user import User
from app.services.assistant.tools import ToolContext, ToolResult, ToolSpec, build_tools

logger = get_logger(__name__)

# A question rarely needs more than two or three lookups; the cap keeps a
# confused model from looping on the caller's dime.
_MAX_TOOL_TURNS = 6
_MAX_OUTPUT_TOKENS = 1024


class AssistantUnavailableError(RuntimeError):
    """Raised when no AI provider + key is configured — the endpoint turns
    this into a 503 and the frontend keeps its local rule engine."""


@dataclass(slots=True)
class ExecutedTool:
    name: str
    summary: str
    mutates: bool


@dataclass(slots=True)
class AssistantReply:
    text: str
    tool_calls: list[ExecutedTool] = field(default_factory=list)


ExecuteFn = Callable[[str, dict[str, Any]], dict[str, Any]]


class LLMBackend(Protocol):
    """One provider's tool loop. ``execute`` runs a tool by name and returns
    the JSON-able payload to hand back to the model."""

    provider: str
    model: str

    def run(
        self, *, system: str, history: list[dict[str, str]], tools: list[ToolSpec], execute: ExecuteFn
    ) -> str: ...


class AnthropicBackend:
    provider = "anthropic"

    def __init__(self, api_key: str, model: str, timeout: int) -> None:
        import anthropic

        self.model = model
        self._client = anthropic.Anthropic(api_key=api_key, timeout=timeout)

    def run(
        self, *, system: str, history: list[dict[str, str]], tools: list[ToolSpec], execute: ExecuteFn
    ) -> str:
        tool_payload = [
            {"name": t.name, "description": t.description, "input_schema": t.input_schema} for t in tools
        ]
        messages: list[dict[str, Any]] = [{"role": m["role"], "content": m["content"]} for m in history]
        text = ""
        for _ in range(_MAX_TOOL_TURNS):
            response = self._client.messages.create(
                model=self.model,
                max_tokens=_MAX_OUTPUT_TOKENS,
                system=system,
                tools=tool_payload,  # type: ignore[arg-type]
                messages=messages,  # type: ignore[arg-type]
            )
            text = "".join(getattr(block, "text", "") for block in response.content if block.type == "text")
            calls = [block for block in response.content if block.type == "tool_use"]
            if response.stop_reason != "tool_use" or not calls:
                return text
            messages.append({"role": "assistant", "content": response.content})
            results = [
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(execute(block.name, dict(block.input or {})), default=str),
                }
                for block in calls
            ]
            messages.append({"role": "user", "content": results})
        return text


class OpenAIBackend:
    provider = "openai"

    def __init__(self, api_key: str, model: str, timeout: int) -> None:
        from openai import OpenAI

        self.model = model
        self._client = OpenAI(api_key=api_key, timeout=timeout)

    def run(
        self, *, system: str, history: list[dict[str, str]], tools: list[ToolSpec], execute: ExecuteFn
    ) -> str:
        tool_payload = [
            {
                "type": "function",
                "function": {"name": t.name, "description": t.description, "parameters": t.input_schema},
            }
            for t in tools
        ]
        messages: list[dict[str, Any]] = [{"role": "system", "content": system}, *history]
        text = ""
        for _ in range(_MAX_TOOL_TURNS):
            response = self._client.chat.completions.create(  # type: ignore[call-overload]
                model=self.model,
                messages=messages,  # type: ignore[arg-type]
                tools=tool_payload,  # type: ignore[arg-type]
                tool_choice="auto",
                temperature=0.2,
                max_tokens=_MAX_OUTPUT_TOKENS,
            )
            message = response.choices[0].message
            text = message.content or ""
            if not message.tool_calls:
                return text
            messages.append(
                {
                    "role": "assistant",
                    "content": message.content,
                    "tool_calls": [
                        {
                            "id": call.id,
                            "type": "function",
                            "function": {"name": call.function.name, "arguments": call.function.arguments},
                        }
                        for call in message.tool_calls
                    ],
                }
            )
            for call in message.tool_calls:
                try:
                    arguments = json.loads(call.function.arguments or "{}")
                except json.JSONDecodeError:
                    arguments = {}
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": json.dumps(execute(call.function.name, arguments), default=str),
                    }
                )
        return text


def build_backend() -> LLMBackend | None:
    """Pick the configured provider, or ``None`` when the copilot is off.
    Module-level so tests (and a future provider) can swap it out."""
    settings = get_settings()
    if not settings.AI_API_KEY:
        return None
    if settings.AI_PROVIDER == "anthropic":
        return AnthropicBackend(settings.AI_API_KEY, settings.ANTHROPIC_MODEL, settings.AI_TIMEOUT_SECONDS)
    if settings.AI_PROVIDER == "openai":
        return OpenAIBackend(settings.AI_API_KEY, settings.AI_MODEL, settings.AI_TIMEOUT_SECONDS)
    return None


_LOCALE_NAMES = {"es": "Spanish", "en": "English"}


def _system_prompt(user: User, locale: str) -> str:
    org_name = user.organization.name if user.organization else "their organization"
    today = datetime.now(UTC).date().isoformat()
    language = _LOCALE_NAMES.get(locale, "Spanish")
    return (
        "You are BEE Copilot, the in-app sales assistant of BEE, a sales-intelligence platform that "
        "turns market signals (funding, hiring, tech changes, intent) into prioritized opportunities "
        "with a generated strategy.\n"
        f"You are talking to {user.full_name} ({user.role.value}) of {org_name}. Today is {today}.\n"
        f"Always answer in {language}.\n\n"
        "Rules:\n"
        "- Ground every statement about the pipeline in tool results. If you have not called a tool, "
        "do not state numbers, names or statuses — call the tool first.\n"
        "- Never invent companies, contacts, amounts or signals. If a tool returns nothing, say so.\n"
        "- Be concise and actionable: lead with the answer, then the two or three facts that support it. "
        "Use short bullet lists for more than two items. No headings.\n"
        "- When drafting outreach, fetch the opportunity brief first and use its pain point, playbook "
        "and lead title; keep drafts under 120 words.\n"
        "- Tools that change data (create_task, dismiss_from_feed) only when the person explicitly asks. "
        "After using one, confirm exactly what changed.\n"
        "- Refer to opportunities by company and title, never by raw id.\n"
    )


class AssistantService:
    def __init__(self, session: Session, user: User, *, backend: LLMBackend | None = None) -> None:
        self.session = session
        self.user = user
        self._backend = backend if backend is not None else build_backend()
        self._tools = build_tools(ToolContext(session=session, user=user))
        self._by_name = {t.name: t for t in self._tools}

    # ── Introspection ──────────────────────────────────────────────────────

    @property
    def available(self) -> bool:
        return self._backend is not None

    @property
    def provider(self) -> str:
        return self._backend.provider if self._backend else "none"

    @property
    def model(self) -> str | None:
        return self._backend.model if self._backend else None

    @property
    def tools(self) -> list[ToolSpec]:
        return list(self._tools)

    # ── Execution ──────────────────────────────────────────────────────────

    def execute_tool(self, name: str, arguments: dict[str, Any]) -> ToolResult:
        spec = self._by_name.get(name)
        if spec is None:
            return ToolResult({"error": f"unknown tool {name!r}"}, "unknown tool")
        try:
            return spec.handler(arguments)
        except Exception as exc:  # noqa: BLE001 — a tool failure is data for the model, not a 500
            logger.exception("Assistant tool %s failed", name)
            self.session.rollback()
            return ToolResult({"error": str(exc)[:200]}, "failed")

    def chat(self, history: list[dict[str, str]], *, locale: str = "es") -> AssistantReply:
        if self._backend is None:
            raise AssistantUnavailableError("No AI provider configured (AI_PROVIDER / AI_API_KEY).")

        executed: list[ExecutedTool] = []

        def execute(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
            result = self.execute_tool(name, arguments)
            spec = self._by_name.get(name)
            executed.append(ExecutedTool(name=name, summary=result.summary, mutates=bool(spec and spec.mutates)))
            return result.data

        text = self._backend.run(
            system=_system_prompt(self.user, locale),
            history=history,
            tools=self._tools,
            execute=execute,
        )
        logger.info(
            "Assistant reply for user=%s org=%s provider=%s tools=%s",
            self.user.id,
            self.user.organization_id,
            self.provider,
            [e.name for e in executed],
        )
        return AssistantReply(text=text.strip(), tool_calls=executed)


__all__ = [
    "AnthropicBackend",
    "AssistantReply",
    "AssistantService",
    "AssistantUnavailableError",
    "ExecutedTool",
    "LLMBackend",
    "OpenAIBackend",
    "build_backend",
]

# uuid is re-exported for tests that construct scripted backends around ids.
_ = uuid
