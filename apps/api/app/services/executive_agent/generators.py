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
        """Compose a cold outreach email from the battlecard strategy."""
        strat = ctx.strategy
        lead_first = _first_name(ctx.lead_name) if ctx.lead_name else "there"
        company = ctx.company_name or "your company"

        # Subject: reference the signal type for hyper-relevance.
        signal_context = {
            "funding_round": "congrats on the funding",
            "hiring": f"your team's expansion at {company}",
            "leadership_change": f"your new role at {company}",
            "tech_adoption": f"your stack changes at {company}",
            "engagement": "your recent interest in our platform",
        }.get(ctx.signal_type, f"recent activity at {company}")

        subject = f"Quick question re: {signal_context}"

        # Body: use closing_argument as the hook, then add a soft CTA.
        urgency_cta = {
            "immediate": "Would a 20-minute call this week work?",
            "this_week": "Could we find 15 minutes this week?",
            "this_month": "Would it make sense to connect this month?",
            "watch": "Happy to share more context whenever timing makes sense.",
        }.get(strat.timing_window.urgency, "Let me know if this resonates.")

        body = (
            f"Hi {lead_first},\n\n"
            f"{strat.closing_argument}\n\n"
            f"{urgency_cta}\n\n"
            f"Best,\n[Your name]"
        )

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
