"""DISC communication style classifier.

This module contains the rule-based heuristic classifier that assigns
DISC scores to leads based on their job title, industry, and available
behavioural signals.

Classification approach
-----------------------
1. **Title patterns**: Different roles correlate strongly with DISC styles.
   * C-suite / Sales VP → D (Dominance) — results, speed, ROI
   * Marketing / Partnerships → I (Influence) — stories, creativity, people
   * HR / Operations / Customer Success → S (Steadiness) — process, stability
   * Engineering / Finance / Research → C (Conscientiousness) — data, precision

2. **Industry modifiers**: Adjust scores based on the company's domain.

3. **Behavioural signal modifiers** (optional, future): Email response time,
   LinkedIn engagement patterns, meeting punctuality.

LLM upgrade path
----------------
Replace ``classify_from_title()`` with an LLM call that takes the lead's
full profile (title, bio, public posts, company) and returns DISC scores.
The interface and downstream middleware are unchanged.
"""

from __future__ import annotations

import re

# ── Title → DISC score tables ──────────────────────────────────────────────────
# Each entry: (regex, d_delta, i_delta, s_delta, c_delta)
# Deltas are additive adjustments to the base score of 0.25 for each dimension.

_TITLE_RULES: list[tuple[str, float, float, float, float]] = [
    # D — Dominance: C-suite, Sales, Business Development, Founder
    (r"ceo|founder|co-founder|chief executive|president|owner", 0.50, 0.05, -0.10, -0.10),
    (r"vp sales|head of sales|chief sales|svp sales|evp sales", 0.45, 0.10, -0.10, -0.10),
    (r"vp|vice president|svp|evp", 0.30, 0.05, -0.05, -0.05),
    (r"director of sales|sales director|business development director", 0.40, 0.10, -0.10, -0.10),
    (r"coo|chief operating|operations director|vp operations", 0.35, 0.00, 0.10, -0.05),
    (r"cfo|chief financial|finance director|vp finance", 0.20, -0.05, 0.05, 0.30),

    # I — Influence: Marketing, Brand, Communications, Partnerships, PR
    (r"cmo|chief marketing|vp marketing|head of marketing", 0.00, 0.45, 0.05, -0.05),
    (r"marketing manager|brand manager|content|social media|communications", -0.05, 0.40, 0.10, -0.05),
    (r"partnership|alliances|ecosystem|community|evangelist", -0.05, 0.40, 0.10, -0.05),
    (r"sales enablement|account executive|account manager|business development manager", 0.10, 0.35, 0.05, -0.05),

    # S — Steadiness: HR, People, Customer Success, Support, Operations
    (r"hr|human resources|people ops|talent|recruiting|recruiter", -0.10, 0.10, 0.45, -0.05),
    (r"customer success|customer experience|client success|account management", -0.10, 0.15, 0.40, -0.05),
    (r"support|helpdesk|service desk|customer service", -0.10, 0.05, 0.45, 0.00),
    (r"project manager|program manager|delivery manager|implementation", -0.05, 0.05, 0.35, 0.10),
    (r"operations manager|office manager|admin|coordinator", -0.05, 0.00, 0.40, 0.10),

    # C — Conscientiousness: Engineering, Finance, Legal, Data, Research
    (r"cto|chief technology|vp engineering|head of engineering", 0.10, -0.05, -0.05, 0.45),
    (r"engineer|developer|architect|programmer|software", -0.10, -0.05, 0.00, 0.45),
    (r"data scientist|data analyst|data engineer|ml engineer|ai", -0.10, -0.05, 0.05, 0.50),
    (r"finance|financial|accountant|controller|treasurer|auditor", -0.10, -0.10, 0.10, 0.50),
    (r"legal|counsel|compliance|risk|security|ciso", -0.05, -0.10, 0.15, 0.45),
    (r"research|scientist|analyst|strategy|intelligence", -0.05, 0.00, 0.05, 0.45),
    (r"product manager|product owner", 0.05, 0.10, 0.10, 0.30),
]

# ── Industry modifiers ─────────────────────────────────────────────────────────
_INDUSTRY_MODIFIERS: dict[str, tuple[float, float, float, float]] = {
    # (d, i, s, c)
    "finance": (0.05, -0.05, 0.05, 0.10),
    "healthcare": (-0.05, 0.05, 0.15, 0.05),
    "technology": (0.05, 0.05, -0.05, 0.10),
    "startup": (0.15, 0.10, -0.10, -0.05),
    "enterprise": (0.00, 0.00, 0.10, 0.05),
    "government": (-0.10, -0.05, 0.20, 0.10),
    "education": (-0.10, 0.10, 0.20, 0.00),
    "marketing": (0.00, 0.20, 0.00, 0.00),
    "legal": (-0.05, -0.05, 0.10, 0.20),
    "manufacturing": (0.05, 0.00, 0.15, 0.05),
    "retail": (0.05, 0.10, 0.05, 0.00),
}

_BASE_SCORE = 0.25  # All dimensions start at 0.25 (neutral)


def classify_from_title(title: str, industry: str | None = None) -> dict[str, float]:
    """Classify DISC scores from a job title and optional industry.

    Returns a dict with keys: d, i, s, c, dominant, secondary, confidence, notes.

    Algorithm
    ---------
    1. Start with base score (0.25, 0.25, 0.25, 0.25).
    2. Apply matching title rules (additive deltas).
    3. Apply industry modifier.
    4. Clamp all scores to [0.0, 1.0].
    5. Derive dominant and secondary from the two highest scores.
    6. Confidence = (max_score - 2nd_max) / max_score  (how clear the distinction is).
    """
    title_lower = title.lower().strip() if title else ""
    d, i, s, c = _BASE_SCORE, _BASE_SCORE, _BASE_SCORE, _BASE_SCORE
    matched_rules: list[str] = []

    for pattern, dd, di, ds, dc in _TITLE_RULES:
        if re.search(pattern, title_lower):
            d += dd
            i += di
            s += ds
            c += dc
            matched_rules.append(pattern)

    # Industry modifier
    if industry:
        mod = _INDUSTRY_MODIFIERS.get(industry.lower().strip())
        if mod:
            d += mod[0]
            i += mod[1]
            s += mod[2]
            c += mod[3]

    # Clamp
    d = max(0.0, min(1.0, d))
    i = max(0.0, min(1.0, i))
    s = max(0.0, min(1.0, s))
    c = max(0.0, min(1.0, c))

    # Sort to find dominant and secondary
    scores = sorted(
        [("D", d), ("I", i), ("S", s), ("C", c)],
        key=lambda x: x[1],
        reverse=True,
    )
    dominant = scores[0][0]
    secondary = scores[1][0] if scores[1][1] > 0.35 else None

    # Confidence: how much the dominant style stands out
    max_score = scores[0][1]
    second_score = scores[1][1]
    confidence = round((max_score - second_score) / max(max_score, 0.01), 2)
    confidence = max(0.1, min(0.99, confidence))  # Always at least some uncertainty

    return {
        "d": round(d, 3),
        "i": round(i, 3),
        "s": round(s, 3),
        "c": round(c, 3),
        "dominant": dominant,
        "secondary": secondary,
        "confidence": confidence,
        "notes": f"Matched {len(matched_rules)} title rule(s). Industry: {industry or 'none'}.",
    }


# ── Style-to-content preferences ──────────────────────────────────────────────

STYLE_PREFERENCES: dict[str, dict[str, object]] = {
    "D": {
        "tone": "direct",
        "length": "short",
        "avoid": ["as per", "just wanted to", "hope you're doing well", "circle back", "synergy"],
        "lead_with": "ROI, outcome, speed, bottom-line impact",
        "structure": "2-3 bullet points, number-driven, action-first",
    },
    "I": {
        "tone": "enthusiastic",
        "length": "medium",
        "avoid": ["detailed data dump", "extensive analysis", "according to the report"],
        "lead_with": "story, human angle, possibilities, social proof",
        "structure": "narrative arc, social proof, clear CTA with energy",
    },
    "S": {
        "tone": "warm",
        "length": "medium",
        "avoid": ["urgent", "immediately", "disrupt", "aggressive growth"],
        "lead_with": "stability, process, team support, risk mitigation",
        "structure": "step-by-step, reassurance, low-pressure tone",
    },
    "C": {
        "tone": "analytical",
        "length": "long",
        "avoid": ["trust me", "everyone knows", "best in class", "industry-leading"],
        "lead_with": "data, proof, methodology, precise numbers",
        "structure": "logical argument, evidence first, footnote sources",
    },
}
