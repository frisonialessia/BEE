"""LLM prompt construction for the StrategyGeneratorService.

This module translates an ``EnrichmentContext`` into a structured LLM prompt
that produces Senior AE-quality battlecard strategies.

Prompt design principles
------------------------
1. **System role as Senior AE**: the model is instructed to think like a
   10-year enterprise sales veteran who knows when to push and when to wait.

2. **Structured context injection**: every field of ``EnrichmentContext`` is
   surfaced in a clearly labeled section so the model can reference it.

3. **Sales DNA as few-shot examples**: ``similar_wins`` are presented as
   anonymised case studies — the model sees "deals like this closed with
   challenger + linkedin in 22 days" and can pattern-match.

3b. **Cautionary patterns are warnings, never examples**: ``cautionary_patterns``
    (real deals that were LOST in a similar context) are presented in their own
    clearly-labeled section instructing the model NOT to replicate them — the
    opposite framing from Sales DNA. See rule 11 in the system prompt.

4. **Strict JSON output**: the system prompt demands a specific JSON schema
   matching ``StrategySchema``. Response is parsed with Pydantic — if it
   fails, the rule-based generator runs as fallback.

5. **Psychographic mirroring**: when ``psychographic_style`` is present, the
   model is instructed to write the ``closing_argument`` in that DISC tone.

6. **Warm intro detection**: when ``has_warm_intro`` is True, the model is
   told to recommend the warm intro channel and reference the connection.

Output contract
---------------
The model MUST return valid JSON matching this schema:

.. code-block:: json

    {
      "pain_point": "...",
      "closing_argument": "...",
      "timing_window": {
        "urgency": "immediate|this_week|this_month|watch",
        "reason": "...",
        "expires_at": "YYYY-MM-DD or null"
      },
      "playbook": "challenger|consultative|social_selling|warm_intro|...",
      "next_best_action": "reach_out|research|monitor|book_call|send_proposal|follow_up",
      "channel": "email|linkedin|warm_intro|phone"
    }
"""

from __future__ import annotations

import json

from app.models.base import EXPANSION, RENEWAL_RISK
from app.services.strategy_generator.base import EnrichmentContext

# ---------------------------------------------------------------------------
# DISC tone instructions injected per style
# ---------------------------------------------------------------------------

_DISC_TONE: dict[str, str] = {
    "D": (
        "The lead has a DOMINANT (D) DISC profile — decisive, results-oriented, dislikes fluff. "
        "Write the closing_argument as a direct, quantified value statement. "
        "Lead with ROI or risk. Skip social preamble. Be brief and assertive."
    ),
    "I": (
        "The lead has an INFLUENTIAL (I) DISC profile — enthusiastic, relationship-driven, responds to vision. "
        "Write the closing_argument with energy and a compelling future story. "
        "Reference their team's growth or the exciting opportunity, not just metrics."
    ),
    "S": (
        "The lead has a STEADY (S) DISC profile — risk-averse, team-focused, prefers consensus. "
        "Write the closing_argument with reassurance, social proof (other teams in their situation), "
        "and a low-pressure ask. Emphasise stability and support."
    ),
    "C": (
        "The lead has a CONSCIENTIOUS (C) DISC profile — analytical, detail-oriented, data-driven. "
        "Write the closing_argument with specific data points, logical structure, and evidence. "
        "Avoid vague claims. Include a concrete metric or case study reference."
    ),
}

# ---------------------------------------------------------------------------
# System prompt builder
# ---------------------------------------------------------------------------


def build_system_prompt() -> str:
    """Return the static system prompt that sets the model's persona and rules."""
    return """You are a Senior Account Executive with 10+ years of enterprise B2B sales experience.
You write concise, hyper-personalised sales battlecards that close deals.

You will receive a JSON context object describing a real sales opportunity (the signal, the company,
the lead, historical success patterns, and market intelligence). Your job is to produce a complete
sales strategy as a JSON object — no prose, no markdown, just valid JSON.

Rules:
1. Every field is required. Do not leave anything null unless explicitly noted.
2. The closing_argument must be 1-2 sentences MAX. Make it hyper-specific to this company and signal.
3. The pain_point must identify the lead's actual business problem — not a generic statement.
4. timing_window.urgency must be one of: immediate, this_week, this_month, watch.
5. playbook must be one of: challenger, consultative, social_selling, warm_intro, competitor_displacement, inbound_follow_up, generic_outreach.
6. channel must be one of: email, linkedin, warm_intro, phone.
7. If a warm intro path exists, ALWAYS recommend channel: warm_intro.
8. If dark funnel score > 60, set timing_window.urgency to immediate or this_week.
9. Apply DISC tone instructions if provided — the closing_argument voice must match the lead's style.
10. Base playbook/channel on similar_wins data if available — proven patterns beat intuition.
11. If CAUTIONARY PATTERNS are present, they are REAL DEALS THAT WERE LOST — not examples to follow.
    Do NOT choose the same (playbook, channel) combination shown in a cautionary pattern unless no
    better alternative exists in this context. A cautionary pattern is a reason to pick differently,
    never a template to copy.

Return ONLY valid JSON. No code blocks, no explanation, no markdown."""


def build_user_prompt(ctx: EnrichmentContext) -> str:
    """Translate EnrichmentContext into a structured user-facing prompt.

    This is the "memory injection" moment: every intelligence layer BEE has
    accumulated — adaptive hints, market insights, Sales DNA, psychographic
    profile, warm intro paths — is surfaced as labeled context sections.
    """
    sections: list[str] = []

    # ── 1. Signal ─────────────────────────────────────────────────────────────
    sections.append(f"""=== SIGNAL ===
Type: {ctx.signal_type.value}
Title: {ctx.signal_title}
Score: {ctx.signal_score:.2f}/1.0
Description: {ctx.signal_description or "None provided"}""")

    # ── 1b. Account lifecycle (Revenue Continuity Radar) ───────────────────────
    # Only rendered for an EXISTING customer (see RevenueContinuityService) —
    # a net-new prospect (opportunity_type=NEW_LOGO, the default) gets no
    # section here at all, so this never changes the prompt for the
    # acquisition motion that predates this field.
    if ctx.opportunity_type == EXPANSION:
        sections.append("""=== ACCOUNT LIFECYCLE: EXISTING CUSTOMER — EXPANSION SIGNAL ===
This account is already a customer, not a net-new prospect. Do NOT write a
"why you should buy from us" pitch — write an upsell play: this signal shows
growth (funding, hiring, new locations, ...) at an account we already serve.
Frame pain_point around the account outgrowing its current plan/scope/capacity.
Frame closing_argument as a proactive account-growth conversation, not a cold
pitch. playbook should reflect an expansion/upsell motion, not net-new outreach.""")
    elif ctx.opportunity_type == RENEWAL_RISK:
        sections.append("""=== ACCOUNT LIFECYCLE: EXISTING CUSTOMER — RENEWAL RISK ===
This account is already a customer, not a net-new prospect. This signal
(today: a champion/leadership change) is a churn-risk indicator, not a
vendor-audit opportunity — do NOT write the "new exec is evaluating vendors"
pitch a net-new HIRING/LEADERSHIP_CHANGE signal would get. Frame pain_point
around losing institutional context/relationship when a champion leaves.
Frame closing_argument as a proactive, non-salesy check-in aimed at protecting
the relationship before the next renewal, not a pitch. Prefer higher urgency
than a comparable net-new signal — champion turnover left unaddressed is the
single most common cause of a lost renewal.""")

    # ── 2. Company ────────────────────────────────────────────────────────────
    sections.append(f"""=== COMPANY ===
Name: {ctx.company_name or "Unknown"}
Domain: {ctx.company_domain or "Unknown"}
Industry: {ctx.company_industry or "Unknown"}
Country: {ctx.company_country or "Unknown"}""")

    # ── 3. Lead ───────────────────────────────────────────────────────────────
    sections.append(f"""=== LEAD ===
Name: {ctx.lead_name or "Unknown"}
Title: {ctx.lead_title or "Unknown"}
Seniority: {ctx.lead_seniority or "Unknown"}
Email: {ctx.lead_email or "Unavailable"}""")

    # ── 4. Sales DNA — similar winning strategies ─────────────────────────────
    if ctx.similar_wins:
        wins_text = []
        for i, w in enumerate(ctx.similar_wins[:3], 1):
            wins_text.append(
                f"  Win {i} (similarity={w.get('similarity_score', 0):.2f}): "
                f"channel={w.get('channel')} playbook={w.get('playbook')} "
                f"industry={w.get('industry')} closed_in={w.get('days_to_close')}d"
            )
        sections.append(
            "=== SALES DNA (similar past WON deals — proven patterns) ===\n" + "\n".join(wins_text)
        )
    else:
        sections.append("=== SALES DNA ===\nNo similar historical wins yet. Use judgment.")

    # ── 4b. Cautionary patterns — similar past LOST deals (warnings, NOT examples) ──
    if ctx.cautionary_patterns:
        cautions_text = []
        for i, c in enumerate(ctx.cautionary_patterns[:3], 1):
            cautions_text.append(
                f"  Loss {i} (similarity={c.get('similarity_score', 0):.2f}): "
                f"channel={c.get('channel')} playbook={c.get('playbook')} "
                f"lost_to={c.get('competitor') or 'unspecified'} "
                f"reason={c.get('loss_reason') or 'unspecified'}"
            )
        sections.append(
            "=== CAUTIONARY PATTERNS (similar past LOST deals — DO NOT REPLICATE) ===\n"
            "These are real losses, not few-shot examples. Do not recommend the same "
            "channel+playbook combination shown below unless nothing better fits this context:\n"
            + "\n".join(cautions_text)
        )
    else:
        sections.append("=== CAUTIONARY PATTERNS ===\nNo similar historical losses on record.")

    # ── 5. Adaptive memory hints ──────────────────────────────────────────────
    if ctx.success_hints:
        best = ctx.best_hint
        if best:
            sections.append(
                f"""=== ADAPTIVE MEMORY (historical win patterns) ===
Best pattern: channel={best.channel} playbook={best.playbook}
Win rate: {best.win_rate:.0%} (n={best.sample_count} deals, confidence={best.confidence})"""
            )
    else:
        sections.append("=== ADAPTIVE MEMORY ===\nInsufficient historical data.")

    # ── 6. Market intelligence ────────────────────────────────────────────────
    if ctx.market_insights:
        top = ctx.top_market_insight
        if top:
            sections.append(
                f"""=== MARKET INTELLIGENCE ===
Trend: {top.title}
Insight: {top.summary[:200]}
Confidence: {top.confidence:.0%}"""
            )
    else:
        sections.append("=== MARKET INTELLIGENCE ===\nNo active market insights for this context.")

    # ── 7. Dark funnel intent score ───────────────────────────────────────────
    if ctx.dark_funnel_score is not None:
        sections.append(
            f"""=== DARK FUNNEL (research intent) ===
Score: {ctx.dark_funnel_score:.0f}/100 (>60 = hot lead, act now)
Stage: {ctx.dark_funnel_stage or "unknown"}"""
        )
    else:
        sections.append("=== DARK FUNNEL ===\nNo intent data available.")

    # ── 8. Network intelligence ───────────────────────────────────────────────
    if ctx.has_warm_intro:
        best_path = ctx.best_intro_path
        sections.append(
            f"""=== NETWORK INTELLIGENCE ===
WARM INTRO AVAILABLE — strength={best_path.strength_score:.1f}/10
Connector: {best_path.connector_name or "Mutual connection"}
Path length: {getattr(best_path, "path_length", 1)} degree(s) of separation
Recommendation: USE THIS. Warm intros close 4x faster than cold outreach."""
        )
    else:
        sections.append(
            "=== NETWORK INTELLIGENCE ===\nNo warm intro path found. Use cold outreach."
        )

    # ── 9. Psychographic profile ──────────────────────────────────────────────
    if ctx.psychographic_style:
        disc_instruction = _DISC_TONE.get(ctx.psychographic_style, "")
        sections.append(
            f"""=== PSYCHOGRAPHIC PROFILE ===
DISC Style: {ctx.psychographic_style} ({ctx.psychographic_tone or "unknown tone"})
Tone instruction: {disc_instruction}"""
        )
    else:
        sections.append(
            "=== PSYCHOGRAPHIC PROFILE ===\nNo DISC profile available. Use a balanced tone."
        )

    # ── 10. External profile enrichment (LinkedIn / G2 / Google) ─────────────
    if ctx.external_profile:
        ep = ctx.external_profile
        sections.append(
            f"""=== EXTERNAL PROFILE (LinkedIn enrichment) ===
Name: {ep.get("lead_name") or ctx.lead_name or "Unknown"}
Title: {ep.get("lead_title") or ctx.lead_title or "Unknown"}
Headline: {ep.get("headline") or "N/A"}
Location: {ep.get("location") or "N/A"}
LinkedIn: {ep.get("linkedin_url") or "N/A"}"""
        )
    if ctx.external_intent_keywords:
        sections.append(
            "=== EXTERNAL INTENT SIGNALS ===\n" + ", ".join(ctx.external_intent_keywords[:15])
        )

    # ── 11. A/B variant instruction ───────────────────────────────────────────
    if ctx.active_variant:
        cfg = ctx.active_variant.config
        sections.append(
            f"""=== A/B EXPERIMENT ===
IMPORTANT: Active experiment — you MUST use these overrides:
channel: {cfg.get("channel", "not set")}
playbook: {cfg.get("playbook", "not set")}
(Do not deviate from these — they are required for clean experiment data.)"""
        )

    # ── 12. CEO brand voice ───────────────────────────────────────────────────
    if ctx.brand_brief:
        sections.append("=== CEO BRAND VOICE ===\n" + ctx.brand_brief)

    # ── Final instruction ─────────────────────────────────────────────────────
    sections.append("""=== YOUR TASK ===
Generate a complete battlecard strategy for this opportunity.
If an ACCOUNT LIFECYCLE section is present above, its framing overrides the default net-new pitch — this account is already a customer, and the strategy must read that way.
If a CEO BRAND VOICE section is present above, write pain_point and closing_argument in that exact voice — tone, vocabulary, sentence length, forbidden phrases all apply. Otherwise use a direct, professional tone.
Synthesise all context above. Prioritise: A/B variant > warm intro > Sales DNA > adaptive hints > your judgment.
Before finalising, check your chosen (playbook, channel) against CAUTIONARY PATTERNS above — if it
matches a documented loss, reconsider unless you have a specific reason this context is different.

Return ONLY this JSON object (no markdown, no explanation):
{
  "pain_point": "...",
  "closing_argument": "...",
  "timing_window": {
    "urgency": "immediate|this_week|this_month|watch",
    "reason": "...",
    "expires_at": "YYYY-MM-DD or null"
  },
  "playbook": "...",
  "next_best_action": "...",
  "channel": "email|linkedin|warm_intro|phone"
}""")

    return "\n\n".join(sections)


def parse_llm_response(raw: str) -> dict:
    """Extract and parse the JSON strategy from an LLM response.

    Handles common LLM quirks:
    - Response wrapped in markdown code fences (```json ... ```)
    - Trailing commas in JSON (stripped before parsing)
    - Extra text before/after the JSON object
    """
    text = raw.strip()

    # Strip markdown code fences
    if "```" in text:
        import re

        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if match:
            text = match.group(1)

    # Extract first JSON object if there's surrounding text
    if not text.startswith("{"):
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > start:
            text = text[start:end]

    return json.loads(text)
