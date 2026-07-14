"""Built-in rule-based strategy generators.

These ship with BEE as the first working implementation of the battlecard engine.
Each generator targets a specific signal type and produces richly worded, context-
aware ``pain_point``, ``closing_argument``, and ``timing_window`` fields.

Design for LLM replacement
----------------------------
Every generator here is a template that an LLM prompt should follow. When adding
a GPT-4o generator, think of this file as the "few-shot examples" section of the
system prompt — these outputs define the quality bar and structure the LLM should
match.

The ``{variable}`` placeholders in the strings below map directly to
``EnrichmentContext`` fields — a future LLM generator will populate those via
templated prompts using the same data.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.models.base import SignalType
from app.schemas.strategy import StrategySchema, TimingWindow
from app.services.strategy_generator.base import EnrichmentContext, StrategyGenerator
from app.services.strategy_generator.registry import register_strategy_generator


def _company(ctx: EnrichmentContext) -> str:
    """Return the most specific company identifier available."""
    return ctx.company_name or ctx.company_domain or "the company"


def _lead(ctx: EnrichmentContext) -> str:
    """Return the most specific lead identifier available."""
    return ctx.lead_name or ctx.lead_title or "the decision-maker"


def _apply_hints_and_variant(
    ctx: EnrichmentContext, default_channel: str, default_playbook: str
) -> tuple[str, str]:
    """Return (channel, playbook) biased by A/B variant config, then adaptive hints.

    Priority order:
    1. Active A/B variant config (experiment in progress — always honor it)
    2. Adaptive memory hints (statistical evidence from closed deals)
    3. Generator defaults (fallback)
    """
    # 1. A/B variant overrides take highest priority to ensure clean experiment data.
    if ctx.active_variant:
        cfg = ctx.active_variant.config
        channel = cfg.get("channel", default_channel)
        playbook = cfg.get("playbook", default_playbook)
        return channel, playbook

    # 2. Adaptive memory hints (confidence ≥ medium).
    hint = ctx.best_hint
    if hint is not None:
        return hint.channel, hint.playbook

    return default_channel, default_playbook


def _variant_tag(ctx: EnrichmentContext) -> dict:
    """Return variant_id and variant_arm for strategy tagging, if active."""
    if ctx.active_variant:
        return {
            "variant_id": str(ctx.active_variant.variant_id),
            "variant_arm": ctx.active_variant.arm,
        }
    return {}


# Keep old name as alias for backward compat with tests that call it directly.
def _apply_hints(ctx: EnrichmentContext, default_channel: str, default_playbook: str) -> tuple[str, str]:
    return _apply_hints_and_variant(ctx, default_channel, default_playbook)


@register_strategy_generator
class FundingStrategyGenerator(StrategyGenerator):
    """Battlecard generator for funding-round signals.

    A funding event is one of the highest-signal buying triggers: new capital
    means new headcount, new tools, and new budgets that must be allocated before
    the next board review. The window is typically 60-90 days post-close.
    """

    name = "funding_strategy"
    priority = 100

    def supports(self, ctx: EnrichmentContext) -> bool:
        return ctx.signal_type == SignalType.FUNDING_ROUND

    def generate(self, ctx: EnrichmentContext) -> StrategySchema:
        company = _company(ctx)
        lead = _lead(ctx)
        score = ctx.signal_score
        stage = "Series B/C" if score >= 85 else "seed/Series A"
        default_channel = "email" if score >= 85 else "linkedin"

        # Extract amount hint from raw payload if available.
        amount = ctx.raw_payload.get("data", {})
        amount_str = ""
        if isinstance(amount, dict) and "amount_usd" in amount:
            m = int(amount["amount_usd"]) // 1_000_000
            amount_str = f" (${m}M)" if m else ""
        _rl = ctx.raw_payload.get("data", {})
        round_label = _rl.get("round", stage) if isinstance(_rl, dict) else stage

        channel, playbook = _apply_hints(ctx, default_channel, "post_funding_outreach")

        hint_note = ""
        if ctx.best_hint and ctx.best_hint.is_actionable:
            hint_note = (
                f" [Adaptive: {ctx.best_hint.to_prompt_text()}]"
            )

        return StrategySchema(
            pain_point=(
                f"{company} just closed a {round_label}{amount_str} round and now faces "
                "the classic scale-up paradox: they have capital to deploy but their "
                "existing processes, tools, and team aren't ready for the next growth "
                "phase. Every week of delay is a competitive disadvantage."
            ),
            closing_argument=(
                f"Congrats on the {round_label}{amount_str} — companies at this stage "
                "typically need to 2-3× their go-to-market capacity in the next 90 days. "
                "We've helped {company}-sized teams do exactly that without the usual "
                "ramp-time penalty. Would a 20-minute call this week make sense?"
            ).replace("{company}", company),
            timing_window=TimingWindow(
                urgency="immediate",
                reason=(
                    f"Budget allocation decisions are made in the first 60 days post-{round_label} "
                    "close. Vendors engaged early are 3× more likely to be selected. "
                    f"Waiting means competing against whoever {company} already spoke to."
                ),
                expires_at="60 days post-funding close",
            ),
            playbook=playbook,
            next_best_action="reach_out",
            channel=channel,
            rationale=(
                f"Signal score {score:.0f}/100 — {company} raised {round_label}{amount_str}. "
                f"Lead: {lead}.{hint_note}"
            ),
            generator="rule_based",
            generator_version="1.0.0",
            generated_at=datetime.now(UTC),
        )


@register_strategy_generator
class HiringStrategyGenerator(StrategyGenerator):
    """Battlecard generator for hiring and leadership-change signals.

    New hires — especially VP/C-level — are actively evaluating tools in their
    first 90 days. A leadership change is a *relationship reset*: the new exec
    has no loyalty to existing vendors and is looking to make their mark.
    """

    name = "hiring_strategy"
    priority = 80

    def supports(self, ctx: EnrichmentContext) -> bool:
        return ctx.signal_type in (SignalType.HIRING, SignalType.LEADERSHIP_CHANGE)

    def generate(self, ctx: EnrichmentContext) -> StrategySchema:
        company = _company(ctx)
        lead = _lead(ctx)
        is_leadership = ctx.signal_type == SignalType.LEADERSHIP_CHANGE

        if is_leadership:
            pain_point = (
                f"{company} just brought in a new {lead}. New executives typically "
                "spend their first 90 days auditing current vendors, processes, and "
                "tooling — and making replacement decisions. The ones they meet early "
                "shape their mental model of 'what good looks like'."
            )
            closing_argument = (
                f"I noticed {company} recently welcomed a new {lead}. "
                "Most RevOps/Sales leaders in that position do a full tech audit "
                "in their first quarter — we've helped several of them build a "
                "modern intelligence stack from scratch. Would it be worth a call "
                "to share what's working for others in your space?"
            )
            urgency = "this_week"
            window_reason = (
                "The first 30-60 days of a new leadership role are the 'blank slate' "
                "phase — no vendor loyalty, high receptivity, and active tool evaluation."
            )
            expires = "90 days post-hire"
            action = "reach_out"
            default_channel = "linkedin"
            default_playbook = "leadership_change_outreach"
        else:
            pain_point = (
                f"{company} is in active hiring mode — new team members mean new "
                "onboarding costs, slower ramp times, and increased process fragmentation. "
                "They need tools and intelligence that scale with headcount, not against it."
            )
            closing_argument = (
                f"We noticed {company} is scaling the team. "
                "High-growth teams at your stage often hit the same bottleneck: "
                "new reps can't replicate what top performers do instinctively. "
                "We help solve that systematically. Worth a 15-minute chat?"
            )
            urgency = "this_month"
            window_reason = (
                "Companies in active hiring mode make tooling decisions to support "
                "the incoming team. The window is 30-45 days before new reps onboard."
            )
            expires = "before next hiring batch onboards"
            action = "monitor"
            default_channel = "linkedin"
            default_playbook = "hiring_growth_outreach"

        channel, playbook = _apply_hints(ctx, default_channel, default_playbook)

        return StrategySchema(
            pain_point=pain_point,
            closing_argument=closing_argument,
            timing_window=TimingWindow(
                urgency=urgency,
                reason=window_reason,
                expires_at=expires,
            ),
            playbook=playbook,
            next_best_action=action,
            channel=channel,
            rationale=f"Signal score {ctx.signal_score:.0f}/100 — {company} / {lead}.",
            generator="rule_based",
            generator_version="1.0.0",
            generated_at=datetime.now(UTC),
        )


@register_strategy_generator
class TechAdoptionStrategyGenerator(StrategyGenerator):
    """Battlecard generator for technology-adoption signals.

    A stack change is a moment of evaluation. The company is already in
    'change mode', which makes them open to adjacent tool discussions.
    """

    name = "tech_adoption_strategy"
    priority = 60

    def supports(self, ctx: EnrichmentContext) -> bool:
        return ctx.signal_type == SignalType.TECH_ADOPTION

    def generate(self, ctx: EnrichmentContext) -> StrategySchema:
        company = _company(ctx)
        tags = ctx.analysis_tags

        tool = next((t for t in tags if t not in ("tech", "migrated to")), "a new tool")

        return StrategySchema(
            pain_point=(
                f"{company} is adopting {tool} — which usually signals they're "
                "re-evaluating adjacent parts of their stack too. Tool migrations "
                "create integration gaps and force teams to reconsider the full "
                "workflow, not just the piece they're replacing."
            ),
            closing_argument=(
                f"We noticed {company} is integrating {tool} into your workflow. "
                "Teams making that move often discover gaps in their sales intelligence "
                "layer that {tool} alone doesn't address. We complement it directly — "
                "could we show you how in 20 minutes?"
            ).replace("{tool}", tool),
            timing_window=TimingWindow(
                urgency="this_month",
                reason=(
                    f"Stack evaluation windows stay open for 30-45 days after a "
                    f"new tool adoption. {company} is in 'change mode' right now — "
                    "receptivity to adjacent solutions is at its peak."
                ),
                expires_at="45 days post-adoption",
            ),
            playbook="complementary_tech_pitch",
            next_best_action="research",
            channel="email",
            rationale=f"Signal score {ctx.signal_score:.0f}/100 — {company} adopted {tool}.",
            generator="rule_based",
            generator_version="1.0.0",
            generated_at=datetime.now(UTC),
        )


@register_strategy_generator
class GenericStrategyGenerator(StrategyGenerator):
    """Safety-net battlecard generator for unclassified signals.

    Always runs last (lowest priority). Produces a usable-but-generic battlecard
    so the opportunity never blocks on a missing generator — resilience first.
    The strategy is clearly labelled ``watch`` urgency so reps don't mistake it
    for an actionable play.
    """

    name = "generic_strategy"
    priority = -100

    def supports(self, ctx: EnrichmentContext) -> bool:  # noqa: ARG002
        return True

    def generate(self, ctx: EnrichmentContext) -> StrategySchema:
        company = _company(ctx)
        return StrategySchema(
            pain_point=(
                f"A market signal was detected for {company} that may indicate "
                "a change event. Full context is limited — manual review recommended "
                "before outreach to avoid mis-framing the conversation."
            ),
            closing_argument=(
                f"We spotted some activity around {company} that might be relevant. "
                "Worth a quick check-in to understand your current priorities?"
            ),
            timing_window=TimingWindow(
                urgency="watch",
                reason=(
                    "Signal confidence is low. Monitor for a confirming second signal "
                    "before committing outreach time."
                ),
                expires_at=None,
            ),
            playbook="generic_outreach",
            next_best_action="monitor",
            channel="email",
            rationale=f"Unclassified signal for {company}. Score {ctx.signal_score:.0f}/100.",
            generator="rule_based",
            generator_version="1.0.0",
            generated_at=datetime.now(UTC),
        )
