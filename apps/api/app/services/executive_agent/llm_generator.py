"""LLMArtifactGenerator — human-quality execution artifacts via LLM.

This generator runs at priority=1000, taking precedence over the rule-based
template generator. It uses the full ArtifactContext — including style_hint from
CorrectionLearning and brand_brief from PersonalBrandService — to produce
execution artifacts that are indistinguishable from what a great SDR would write.

Quality bars
------------
* Email draft: personalised, signal-specific, CEO voice, DISC-adapted
* Meeting agenda: outcome-focused 20-minute structure, pre-meeting prep
* Next steps: prioritised, time-bounded, clear owners

Output format
-------------
The model returns a single JSON object with three keys:
  email_draft    — { subject, body, ps_line, recommended_send_time }
  meeting_agenda — { title, objective, agenda_items, pre_meeting_prep, success_criteria }
  next_steps     — { horizon, actions, key_risk, success_milestone }

Fallback
--------
On any LLM error, the registry falls through to RuleBasedArtifactGenerator.
No artifacts are lost; the CEO always gets something actionable.
"""

from __future__ import annotations

import time

from app.core.config import get_settings
from app.core.logging import get_logger
from app.schemas.executive import (
    ActionItem,
    AgendaItem,
    EmailDraftArtifact,
    MeetingStructureArtifact,
    NextStepsArtifact,
)
from app.services.executive_agent.base import ArtifactContext, ArtifactGenerator
from app.services.executive_agent.registry import register_artifact_generator

logger = get_logger(__name__)
_settings = get_settings()

_ARTIFACT_SYSTEM_PROMPT = """You are the world's best B2B sales writer.
You write execution artifacts that CEOs send as-is — no editing required.

Rules:
1. Every artifact must be hyper-specific to the company, lead, and signal.
2. The email body must be ≤ 5 sentences. No filler. Direct value.
3. Apply the CEO's style rules if provided (style_hint section).
4. Match the CEO's brand voice if provided (brand_brief section).
5. Adapt tone to the lead's DISC style if provided.
6. Return ONLY valid JSON — no markdown, no explanation.

JSON schema:
{
  "email_draft": {
    "subject": "...",
    "body": "...",
    "ps_line": "... or null",
    "recommended_send_time": "..."
  },
  "meeting_agenda": {
    "meeting_title": "...",
    "total_duration_minutes": 20,
    "objective": "...",
    "agenda_items": [
      {"duration_minutes": 3, "title": "...", "notes": "..."},
      ...
    ],
    "pre_meeting_prep": ["...", "..."],
    "success_criteria": "..."
  },
  "next_steps": {
    "horizon": "Next 7 days",
    "actions": [
      {"action": "...", "owner": "rep", "timing": "within 24h", "priority": "high"},
      ...
    ],
    "key_risk": "...",
    "success_milestone": "..."
  }
}"""


def _build_artifact_user_prompt(ctx: ArtifactContext) -> str:
    """Build the user prompt for artifact generation."""
    parts = [
        "=== OPPORTUNITY ===",
        f"Company: {ctx.company_name}",
        f"Lead: {ctx.lead_name} ({ctx.lead_title or 'Unknown title'})",
        f"Signal: {ctx.signal_type} — {ctx.signal_title}",
        "",
        "=== STRATEGY ===",
        f"Pain point: {ctx.strategy.pain_point}",
        f"Closing argument: {ctx.strategy.closing_argument}",
        f"Channel: {ctx.strategy.channel}",
        f"Playbook: {ctx.strategy.playbook}",
        f"Urgency: {ctx.strategy.timing_window.urgency} — {ctx.strategy.timing_window.reason}",
        f"Next best action: {ctx.strategy.next_best_action}",
    ]

    if ctx.style_hint:
        parts += ["", "=== CEO STYLE RULES (apply strictly) ===", ctx.style_hint]

    if ctx.brand_brief:
        parts += ["", "=== CEO BRAND VOICE ===", ctx.brand_brief]

    parts += [
        "",
        "=== YOUR TASK ===",
        "Generate all three execution artifacts in the required JSON format.",
        "The email must sound like the CEO wrote it personally.",
        "Make every sentence count. No filler words.",
    ]

    return "\n".join(parts)


@register_artifact_generator
class LLMArtifactGenerator(ArtifactGenerator):
    """LLM-powered execution artifact generator.

    Runs at priority=1000, before the rule-based generator.
    Disabled when AI_PROVIDER=none or AI_API_KEY is not set.
    """

    name = "llm_artifacts"
    priority = 1000

    @property
    def enabled(self) -> bool:  # type: ignore[override]
        return _settings.AI_PROVIDER in ("openai", "anthropic") and bool(_settings.AI_API_KEY)

    def supports(self, ctx: ArtifactContext) -> bool:  # type: ignore[override]  # noqa: ARG002
        return self.enabled

    # The ArtifactGenerator interface requires three separate methods, but a
    # generator instance is a process-wide singleton (registered once at import
    # time — see registry.py), shared by every concurrent request. We still want
    # to call the LLM only once per opportunity and split the response across
    # generate_email/generate_meeting/generate_next_steps, so we cache the raw
    # result — but keyed by the *identity* of the ArtifactContext object, not by
    # opportunity_title. ExecutiveAgent._generate() builds a fresh ArtifactContext
    # once per request, so id(ctx) is guaranteed unique per opportunity even when
    # two different opportunities happen to share the same title (which a
    # title-keyed cache could not distinguish, and could return one opportunity's
    # artifacts for another's).
    _last_bundle: dict | None = None
    _last_ctx_id: int | None = None

    def _get_or_call_llm(self, ctx: ArtifactContext) -> dict:
        """Call the LLM once per ArtifactContext and cache the result for the
        three artifact methods.
        """
        if self._last_ctx_id == id(ctx) and self._last_bundle is not None:
            return self._last_bundle

        t0 = time.monotonic()
        system = _ARTIFACT_SYSTEM_PROMPT
        user = _build_artifact_user_prompt(ctx)

        raw = self._call_llm(system, user)
        data = self._parse_response(raw)

        elapsed_ms = int((time.monotonic() - t0) * 1000)
        logger.info("LLMArtifactGenerator: artifacts generated in %dms", elapsed_ms)

        self._last_bundle = data
        self._last_ctx_id = id(ctx)
        return data

    def generate_email(self, ctx: ArtifactContext) -> EmailDraftArtifact:
        data = self._get_or_call_llm(ctx)
        e = data.get("email_draft", {})
        return EmailDraftArtifact(
            subject=e.get("subject", "Following up on an opportunity"),
            body=e.get("body", ctx.strategy.closing_argument),
            ps_line=e.get("ps_line") or None,
            recommended_send_time=e.get("recommended_send_time", "Tuesday–Thursday morning"),
            estimated_read_time_seconds=max(20, len(e.get("body", "")) // 20),
        )

    def generate_meeting(self, ctx: ArtifactContext) -> MeetingStructureArtifact:
        data = self._get_or_call_llm(ctx)
        m = data.get("meeting_agenda", {})
        raw_items = m.get("agenda_items", [])
        agenda_items = [
            AgendaItem(
                duration_minutes=i.get("duration_minutes", 5),
                title=i.get("title", "Agenda item"),
                notes=i.get("notes"),
            )
            for i in raw_items
        ]
        return MeetingStructureArtifact(
            meeting_title=m.get("meeting_title", f"BEE × {ctx.company_name} — Discovery Call"),
            total_duration_minutes=m.get("total_duration_minutes", 20),
            objective=m.get("objective", ctx.strategy.pain_point[:150]),
            agenda_items=agenda_items,
            pre_meeting_prep=m.get("pre_meeting_prep", []),
            success_criteria=m.get("success_criteria", "Qualified lead and agreed next step"),
        )

    def generate_next_steps(self, ctx: ArtifactContext) -> NextStepsArtifact:
        data = self._get_or_call_llm(ctx)
        n = data.get("next_steps", {})
        raw_actions = n.get("actions", [])
        actions = [
            ActionItem(
                action=a.get("action", "Follow up"),
                owner=a.get("owner", "rep"),
                timing=a.get("timing", "within 48h"),
                priority=a.get("priority", "medium"),
            )
            for a in raw_actions
        ]
        return NextStepsArtifact(
            horizon=n.get("horizon", "Next 7 days"),
            actions=actions,
            key_risk=n.get("key_risk", "Competitor reaches out first"),
            success_milestone=n.get(
                "success_milestone",
                f"First meeting booked with {ctx.company_name}",
            ),
        )

    # ── LLM call ─────────────────────────────────────────────────────────────

    def _call_llm(self, system: str, user: str) -> str:
        provider = _settings.AI_PROVIDER
        if provider == "openai":
            from openai import OpenAI
            client = OpenAI(api_key=_settings.AI_API_KEY, timeout=_settings.AI_TIMEOUT_SECONDS)
            resp = client.chat.completions.create(
                model=_settings.AI_MODEL,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=0.4,
                max_tokens=1500,
                response_format={"type": "json_object"},
            )
            return resp.choices[0].message.content or ""

        if provider == "anthropic":
            import anthropic
            client = anthropic.Anthropic(api_key=_settings.AI_API_KEY)
            resp = client.messages.create(
                model=_settings.ANTHROPIC_MODEL,
                max_tokens=1500,
                temperature=0.4,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            return resp.content[0].text if resp.content else ""

        raise ValueError(f"Unsupported AI_PROVIDER: {provider}")

    def _parse_response(self, raw: str) -> dict:
        """Parse and clean the LLM JSON response."""
        from app.services.strategy_generator.llm_prompt import parse_llm_response
        try:
            return parse_llm_response(raw)
        except Exception as exc:
            raise ValueError(f"LLMArtifactGenerator: failed to parse LLM response: {exc}") from exc
