"""PromptAdjustmentEngine — translate StyleRules into prompt injections.

Takes the accumulated ``UserStyleProfile.rules`` and generates a concise,
LLM-ready prompt fragment that the ``ExecutiveAgent`` prepends to every
generation call. This is the "self-learning without configuration" mechanism:
BEE's output quality improves with every CEO correction, automatically.

Prompt fragment format
----------------------
The generated fragment is designed to be injected directly into a system
prompt or before the main instruction block:

    "CEO WRITING STYLE PREFERENCES (follow these exactly):
    - Avoid social openers like 'Hope you're well' — open directly with value
    - Prefer bullet points over long paragraphs for email drafts
    - Include specific ROI data or percentage improvements as evidence
    - Use direct CTA: 'Let's schedule 30 minutes' — not 'feel free to reach out'
    - Keep emails under 200 words — CEO shortened long emails consistently"

Rule confidence levels
----------------------
* AUTHORITATIVE (weight ≥ 0.80, count ≥ 3): always injected
* ESTABLISHED   (weight ≥ 0.60, count ≥ 2): injected with medium emphasis
* EMERGING      (weight ≥ 0.40, count ≥ 1): injected as soft suggestion

Rule update mechanism
---------------------
Uses exponential moving average to update weights:
  new_weight = old_weight × 0.7 + confirmation_signal × 0.3

A ``confirmation_signal`` of 1.0 means the rule was confirmed again.
A ``confirmation_signal`` of 0.0 means the CEO did the opposite (counter-signal).
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.models.correction import StyleRuleType

# ── Weight update parameters ──────────────────────────────────────────────────
_EMA_ALPHA = 0.30              # How much each new signal shifts the weight
_AUTHORITATIVE_THRESHOLD = 0.80
_ESTABLISHED_THRESHOLD = 0.60
_EMERGING_THRESHOLD = 0.40
_MIN_COUNT_FOR_INJECTION = 1   # Minimum confirmations before a rule appears in prompts
_INITIAL_WEIGHT = 0.55         # Weight assigned when a rule is first seen

# ── Human-readable rule descriptions for prompt injection ─────────────────────
_RULE_DESCRIPTIONS: dict[str, dict[str, str]] = {
    StyleRuleType.AVOID_SOCIAL_OPENER: {
        "instruction": "Do NOT start with social phrases like 'Hope you're well', 'I hope this finds you well', etc.",
        "example": "Start directly with the value proposition or a specific insight about the company.",
    },
    StyleRuleType.PREFER_DIRECT_OPENER: {
        "instruction": "Open with the most important point first — no preamble.",
        "example": "First sentence should state the specific opportunity or insight relevant to this lead.",
    },
    StyleRuleType.AVOID_FILLER_PHRASES: {
        "instruction": "Remove filler phrases: 'Just wanted to', 'Please don't hesitate', 'Feel free to', 'Kind regards'.",
        "example": "Be direct. Every sentence must add value.",
    },
    StyleRuleType.PREFER_BULLET_POINTS: {
        "instruction": "Format key points as bullet lists, not long paragraphs.",
        "example": "Use 3–5 bullet points for the main value propositions.",
    },
    StyleRuleType.PREFER_SHORT_PARAGRAPHS: {
        "instruction": "Keep paragraphs to 2–3 sentences maximum. Break long blocks into shorter ones.",
        "example": "Each paragraph = one idea.",
    },
    StyleRuleType.PREFER_DATA_EVIDENCE: {
        "instruction": "Include specific metrics, percentages, or ROI numbers as evidence.",
        "example": "E.g., 'Companies like yours reduced CAC by 23% within 90 days.'",
    },
    StyleRuleType.PREFER_STORYTELLING: {
        "instruction": "Include a brief narrative example or case study to illustrate value.",
        "example": "One-sentence story: 'A fintech similar to yours used this to close 3 enterprise deals in Q1.'",
    },
    StyleRuleType.PREFER_CONCISE: {
        "instruction": "Keep the total length under 180 words for emails. Be ruthlessly concise.",
        "example": "If a sentence doesn't add value, delete it.",
    },
    StyleRuleType.PREFER_DETAILED: {
        "instruction": "Provide full context and detailed explanations — do not truncate.",
        "example": "Include background, methodology, and expected outcomes.",
    },
    StyleRuleType.PREFER_SOFT_CTA: {
        "instruction": "Use a soft call-to-action: 'Would love your thoughts' or 'Happy to share more'.",
        "example": "Don't pressure — invite.",
    },
    StyleRuleType.PREFER_DIRECT_CTA: {
        "instruction": "Use a direct, specific CTA: 'Let's schedule 30 minutes this week.'",
        "example": "Include a specific time commitment in the CTA.",
    },
    StyleRuleType.AVOID_FORMAL_CLOSING: {
        "instruction": "Do not use formal closings like 'Kind regards', 'Yours sincerely', 'Best regards'.",
        "example": "Close with just the first name or a friendly one-liner.",
    },
    StyleRuleType.PREFER_CASUAL_CLOSING: {
        "instruction": "Close casually with just the CEO's first name or a conversational sign-off.",
        "example": "'Cheers, [Name]' or just '[Name]'",
    },
    StyleRuleType.PREFER_COMPANY_SPECIFICS: {
        "instruction": "Include company-specific details — reference their recent news, product, or industry context.",
        "example": "Mention the lead's company name and a specific detail about their situation.",
    },
    StyleRuleType.AVOID_GENERIC_CLAIMS: {
        "instruction": "Do NOT use clichés: 'industry-leading', 'world-class', 'cutting-edge', 'revolutionary'.",
        "example": "Replace with specific, verifiable claims.",
    },
}


def update_rule(
    existing: dict,
    confirmed: bool,
) -> dict:
    """Update a rule entry with a new signal using exponential moving average.

    Args:
        existing: Current rule dict with ``weight``, ``count``, ``last_seen``.
        confirmed: True if the rule was confirmed, False if counter-signalled.

    Returns:
        Updated rule dict.
    """
    signal = 1.0 if confirmed else 0.0
    new_weight = existing["weight"] * (1 - _EMA_ALPHA) + signal * _EMA_ALPHA
    return {
        "weight": round(max(0.0, min(1.0, new_weight)), 4),
        "count": existing["count"] + 1,
        "last_seen": datetime.now(UTC).isoformat(),
        "authoritative": new_weight >= _AUTHORITATIVE_THRESHOLD,
    }


def add_new_rule(rule_type: str) -> dict:  # noqa: ARG001
    """Create a new rule entry with initial weight."""
    return {
        "weight": _INITIAL_WEIGHT,
        "count": 1,
        "last_seen": datetime.now(UTC).isoformat(),
        "authoritative": False,
    }


def merge_rules_into_profile(
    profile_rules: dict,
    artifact_type: str,
    new_rule_types: list[str],
) -> dict:
    """Merge newly extracted rules into the profile's accumulated rule store.

    Args:
        profile_rules: The ``UserStyleProfile.rules`` dict.
        artifact_type: Which artifact type these rules apply to.
        new_rule_types: List of ``StyleRuleType`` values from this correction.

    Returns:
        Updated ``profile_rules`` dict.
    """
    updated = dict(profile_rules)
    if artifact_type not in updated:
        updated[artifact_type] = {}

    for rule_type in new_rule_types:
        if rule_type in updated[artifact_type]:
            updated[artifact_type][rule_type] = update_rule(
                updated[artifact_type][rule_type], confirmed=True
            )
        else:
            updated[artifact_type][rule_type] = add_new_rule(rule_type)

    return updated


def generate_style_summary(profile_rules: dict) -> str:
    """Generate an LLM-ready prompt fragment from accumulated style rules.

    Only includes rules that meet the minimum confidence thresholds.
    """
    if not profile_rules:
        return ""

    lines: list[str] = ["CEO WRITING STYLE PREFERENCES (follow these exactly):"]
    found_any = False

    for artifact_type, rules in profile_rules.items():
        type_lines: list[str] = []

        for rule_type, rule_data in rules.items():
            weight = rule_data.get("weight", 0)
            count = rule_data.get("count", 0)

            if count < _MIN_COUNT_FOR_INJECTION or weight < _EMERGING_THRESHOLD:
                continue

            desc = _RULE_DESCRIPTIONS.get(rule_type)
            if not desc:
                continue

            confidence_label = (
                "[STRICT]" if weight >= _AUTHORITATIVE_THRESHOLD
                else "[PREFERRED]" if weight >= _ESTABLISHED_THRESHOLD
                else "[SUGGESTED]"
            )

            scope = f" (for {artifact_type})" if artifact_type != "all" else ""
            type_lines.append(
                f"- {confidence_label}{scope} {desc['instruction']}"
            )
            found_any = True

        lines.extend(type_lines)

    if not found_any:
        return ""

    return "\n".join(lines)


def count_authoritative_rules(profile_rules: dict) -> int:
    """Count rules with weight ≥ authoritative threshold."""
    count = 0
    for rules in profile_rules.values():
        for rule_data in rules.values():
            if rule_data.get("weight", 0) >= _AUTHORITATIVE_THRESHOLD:
                count += 1
    return count
