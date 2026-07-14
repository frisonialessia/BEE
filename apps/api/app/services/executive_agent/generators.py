"""Built-in artifact generators for the ExecutiveAgent.

These produce BEE's default execution artifacts:

* ``RuleBasedArtifactGenerator`` — template-driven email drafts, meeting agendas,
  and action plans. Uses the enriched strategy fields to fill in the blanks,
  producing immediately usable artifacts without any AI calls.

LLM replacement path
---------------------
To replace these with an LLM generator, create a new class at ``priority=1000``
decorated with ``@register_artifact_generator``. The registry runs it first and
the rule-based generator serves as a fallback if the LLM call fails.
"""

from __future__ import annotations

from app.schemas.executive import (
    ActionItem,
    AgendaItem,
    EmailDraftArtifact,
    MeetingStructureArtifact,
    NextStepsArtifact,
)
from app.services.executive_agent.base import ArtifactContext, ArtifactGenerator
from app.services.executive_agent.registry import register_artifact_generator


def _first_name(full_name: str) -> str:
    """Extract first name from full name, fallback to full name."""
    parts = full_name.strip().split()
    return parts[0] if parts else full_name


def _parse_style_directives(style_hint: str) -> dict[str, bool]:
    """Extract key style directives from the CEO's learned style summary.

    Returns a dict of bool flags parsed from the style_hint text. This is the
    template-generator bridge — in LLM mode, style_hint is injected directly
    into the prompt instead and this function is not needed.
    """
    hint = style_hint.lower()
    return {
        "avoid_social_opener": any(
            p in hint for p in ("do not start with", "avoid social", "no social opener", "no 'hope you")
        ),
        "prefer_direct": any(p in hint for p in ("start directly", "direct opener", "get to the point")),
        "prefer_concise": any(p in hint for p in ("concise", "short paragraph", "brief")),
        "prefer_bullets": any(p in hint for p in ("bullet", "list", "itemize")),
        "avoid_generic": any(p in hint for p in ("avoid generic", "no generic", "company-specific")),
        "prefer_data": any(p in hint for p in ("data", "evidence", "statistic", "number")),
        "prefer_soft_cta": any(p in hint for p in ("soft cta", "no pressure", "whenever timing")),
    }


def _build_brand_footer(brand_brief: str) -> str:
    """Add a CEO-visible brand note to the artifact when brand context is available.

    In production LLM mode, brand_brief is injected as a system prompt and
    does not appear in the output. For the rule-based generator, we surface
    it as a clearly labeled note so the CEO can verify brand alignment.
    """
    if not brand_brief or len(brand_brief) < 10:  # noqa: PLR2004
        return ""
    return f"\n\n---\n[BEE Brand Context Applied: {brand_brief[:200].strip()}]"


@register_artifact_generator
class RuleBasedArtifactGenerator(ArtifactGenerator):
    """Template-driven execution artifact generator.

    This ships as BEE's default. It produces high-quality, contextual artifacts
    by combining the strategy's structured fields (pain_point, closing_argument,
    channel, playbook, timing_window) with the entity context (company, lead).

    No AI calls — immediate, deterministic, testable, zero-cost.
    """

    name = "rule_based_artifacts"
    priority = 0

    def generate_email(self, ctx: ArtifactContext) -> EmailDraftArtifact:
        """Compose a cold outreach email from the battlecard strategy.

        Applies two layers of personalisation:
        1. **style_hint** (CorrectionLearning) — adapts structure to the CEO's
           learned writing preferences (opener style, CTA softness, etc.).
        2. **brand_brief** (PersonalBrandService) — surfaces the CEO's brand DNA
           as a labeled note so the CEO can verify voice alignment before sending.

        In future LLM mode, both fields become system-prompt injections that
        produce authentically voiced output without template constraints.
        """
        strat = ctx.strategy
        lead_first = _first_name(ctx.lead_name) if ctx.lead_name else "there"
        company = ctx.company_name or "your company"

        # Parse style directives from learned CEO preferences
        style = _parse_style_directives(ctx.style_hint)

        # Subject: reference the signal type for hyper-relevance.
        signal_context = {
            "funding_round": "congrats on the funding",
            "hiring": f"your team's expansion at {company}",
            "leadership_change": f"your new role at {company}",
            "tech_adoption": f"your stack changes at {company}",
            "engagement": "your recent interest in our platform",
        }.get(ctx.signal_type, f"recent activity at {company}")

        subject = f"Quick question re: {signal_context}"

        # CTA: softer when CEO prefers it, or when channel is watch-urgency
        if style["prefer_soft_cta"] or strat.timing_window.urgency == "watch":
            urgency_cta = "Happy to share more context whenever timing makes sense."
        else:
            urgency_cta = {
                "immediate": "Would a 20-minute call this week work?",
                "this_week": "Could we find 15 minutes this week?",
                "this_month": "Would it make sense to connect this month?",
            }.get(strat.timing_window.urgency, "Let me know if this resonates.")

        # Opening: skip social preamble when CEO prefers direct openers
        if style["avoid_social_opener"] or style["prefer_direct"]:
            opener = f"{strat.closing_argument}"
        else:
            opener = f"Hi {lead_first},\n\n{strat.closing_argument}"

        # Body structure: bullets when CEO prefers them, prose otherwise
        if style["prefer_bullets"]:
            body = (
                f"{opener}\n\n"
                f"Key reasons this matters for {company}:\n"
                f"- {strat.pain_point[:80]}\n"
                f"- {strat.timing_window.reason[:80]}\n\n"
                f"{urgency_cta}\n\n"
                f"Best,\n[Your name]"
            )
        else:
            body = (
                f"{opener}\n\n"
                f"{urgency_cta}\n\n"
                f"Best,\n[Your name]"
            )

        # Append brand voice note for CEO review (template mode only)
        brand_note = _build_brand_footer(ctx.brand_brief)
        body = body + brand_note

        ps = None
        if strat.timing_window.expires_at:
            ps = f"P.S. The timing window here is {strat.timing_window.expires_at} — worth a quick chat before then."

        best_send = {
            "email": "Tuesday–Thursday, 8–10 AM recipient local time",
            "linkedin": "Weekdays, 7–9 AM recipient local time",
        }.get(strat.channel, "Tuesday–Thursday morning")

        return EmailDraftArtifact(
            subject=subject,
            body=body,
            ps_line=ps,
            recommended_send_time=best_send,
            estimated_read_time_seconds=max(20, len(body) // 20),
        )

    def generate_meeting(self, ctx: ArtifactContext) -> MeetingStructureArtifact:
        """Produce a structured meeting agenda for the first call."""
        strat = ctx.strategy
        company = ctx.company_name or "the company"
        lead_title = ctx.lead_title or "stakeholder"

        agenda_items = [
            AgendaItem(
                duration_minutes=3,
                title="Rapport & context-setting",
                notes=f"Reference {company}'s recent news (the signal that triggered this call).",
            ),
            AgendaItem(
                duration_minutes=5,
                title="Discovery: understand their current pain",
                notes=(
                    f"Probe on: {strat.pain_point[:120]}..."
                    if len(strat.pain_point) > 120
                    else strat.pain_point
                ),
            ),
            AgendaItem(
                duration_minutes=7,
                title="Our value prop (signal-specific)",
                notes="Tie directly to what you heard in discovery — don't pitch generically.",
            ),
            AgendaItem(
                duration_minutes=3,
                title="Next steps & timeline",
                notes=f"Aim for a clear commitment. The timing window is: {strat.timing_window.reason[:100]}...",
            ),
            AgendaItem(duration_minutes=2, title="Q&A and close"),
        ]

        return MeetingStructureArtifact(
            meeting_title=f"BEE × {company} — Discovery Call",
            total_duration_minutes=20,
            objective=(
                f"Qualify {company} as a fit and establish a clear next step "
                f"before the {strat.timing_window.expires_at or 'window closes'}."
            ),
            agenda_items=agenda_items,
            pre_meeting_prep=[
                f"Review {company}'s recent news (the triggering signal).",
                f"Research {lead_title}'s background and LinkedIn activity.",
                "Prepare 2–3 case studies for companies in a similar situation.",
                f"Know BEE's answer to: 'Why now, specifically for {company}?'",
            ],
            success_criteria=(
                f"{lead_title} shares their top challenge and agrees to a follow-up "
                "meeting or trial within the week."
            ),
        )

    def generate_next_steps(self, ctx: ArtifactContext) -> NextStepsArtifact:
        """Build a prioritized action plan for the next 7 days."""
        strat = ctx.strategy
        company = ctx.company_name or "the company"
        is_urgent = strat.timing_window.urgency in ("immediate", "this_week")

        actions = [
            ActionItem(
                action=f"Send the drafted email to {company} via {strat.channel}",
                owner="rep",
                timing="within 24h" if is_urgent else "within 48h",
                priority="high",
            ),
            ActionItem(
                action="Connect on LinkedIn and engage with recent post (warm the lead)",
                owner="rep",
                timing="same day as email" if is_urgent else "within 3 days",
                priority="medium" if strat.channel != "linkedin" else "high",
            ),
            ActionItem(
                action=f"Research {company} deeply — recent news, tech stack, team size",
                owner="rep",
                timing="before sending email",
                priority="high",
            ),
            ActionItem(
                action="If no reply in 3 days: follow up with a relevant insight or case study",
                owner="rep",
                timing="3 days after initial outreach",
                priority="medium",
            ),
            ActionItem(
                action="Log all touchpoints in CRM with outcome tags for BEE's learning loop",
                owner="rep",
                timing="after each interaction",
                priority="medium",
            ),
        ]

        if strat.timing_window.expires_at:
            actions.append(
                ActionItem(
                    action=f"Hard deadline: must be in conversation before {strat.timing_window.expires_at}",
                    owner="rep",
                    timing=strat.timing_window.expires_at,
                    priority="high",
                )
            )

        return NextStepsArtifact(
            horizon="Next 7 days" if is_urgent else "Next 14 days",
            actions=actions,
            key_risk=(
                f"Competitor reaches out first. Timing window: {strat.timing_window.reason[:120]}."
            ),
            success_milestone=(
                f"First meeting booked with a decision-maker at {company}."
            ),
        )
