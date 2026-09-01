"""DiffEngine — extract style rules from CEO artifact edits.

Compares original and edited content to identify what the CEO changed and why.
Uses character-level and sentence-level diffing to detect patterns.

Detected patterns
-----------------
* Deleted segments → rule candidates (avoid_X, prefer_shorter, etc.)
* Shortened segments → prefer_concise
* Expanded segments → prefer_detailed
* Added bullet formatting → prefer_bullet_points
* Removed social phrases → avoid_social_opener
* Added numeric data → prefer_data_evidence

Design principle: no external NLP dependency. Pure string heuristics are fast,
deterministic, and sufficient for MVP. The pattern library is easily extended
with more rules as the system collects more corrections.
"""

from __future__ import annotations

import re

from app.models.correction import DiffOpType, StyleRuleType

# ── Known social opener patterns ──────────────────────────────────────────────
_SOCIAL_OPENERS = [
    r"hope\s+you.re",
    r"hope\s+this\s+finds\s+you",
    r"i\s+hope\s+you",
    r"just\s+wanted\s+to",
    r"i\s+wanted\s+to\s+reach\s+out",
    r"touching\s+base",
    r"following\s+up",
    r"circling\s+back",
]

# ── Filler phrases ────────────────────────────────────────────────────────────
_FILLER_PHRASES = [
    r"as\s+i\s+mentioned",
    r"as\s+per\s+our\s+",
    r"please\s+don.t\s+hesitate",
    r"feel\s+free\s+to",
    r"at\s+your\s+earliest\s+convenience",
    r"kind\s+regards",
    r"best\s+regards",
    r"warm\s+regards",
    r"i\s+look\s+forward\s+to\s+hearing",
]

# ── Generic / cliché claims ───────────────────────────────────────────────────
_GENERIC_CLAIMS = [
    r"industry.leading",
    r"world.class",
    r"cutting.edge",
    r"state.of.the.art",
    r"best.in.class",
    r"revolutionary",
    r"game.changing",
    r"disruptive",
]

# ── Data / evidence indicators ────────────────────────────────────────────────
_DATA_PATTERNS = [
    r"\d+\s*%",                     # Percentages
    r"\$\s*[\d,]+",                 # Dollar amounts
    r"[\d,]+\s*(users|customers|companies|deals|clients)",  # Counts
    r"(increased|reduced|improved|saved)\s+by\s+\d+",      # Impact statements
    r"\d+x\s+(faster|cheaper|better|more)",                 # Multipliers
]

_BULLET_PATTERN = re.compile(r"^[\s]*[-•*]\s+", re.MULTILINE)
_NUMBERED_LIST_PATTERN = re.compile(r"^[\s]*\d+\.\s+", re.MULTILINE)


def _matches_any(text: str, patterns: list[str]) -> bool:
    text_lower = text.lower()
    return any(re.search(p, text_lower) for p in patterns)


def _has_bullets(text: str) -> bool:
    return bool(_BULLET_PATTERN.search(text)) or bool(_NUMBERED_LIST_PATTERN.search(text))


def _sentence_count(text: str) -> int:
    return len([s for s in re.split(r"[.!?]+", text) if s.strip()])


def _word_count(text: str) -> int:
    return len(text.split())


def compute_diff_ops(original: str, edited: str) -> list[dict]:
    """Compute a list of structured diff operations between original and edited.

    Returns a list of dicts with keys:
      - ``type``: DiffOpType value
      - ``content``: the relevant content segment (for DELETE/REWRITE)
      - ``detail``: human-readable description
    """
    ops: list[dict] = []

    orig_words = _word_count(original)
    edit_words = _word_count(edited)

    # ── Length changes ────────────────────────────────────────────────────────
    if orig_words > 0:
        ratio = edit_words / orig_words
        if ratio < 0.65:
            ops.append({
                "type": DiffOpType.SHORTEN,
                "content": "",
                "detail": f"Shortened from {orig_words} to {edit_words} words ({ratio:.0%} retained)",
                "ratio": ratio,
            })
        elif ratio > 1.40:
            ops.append({
                "type": DiffOpType.EXPAND,
                "content": "",
                "detail": f"Expanded from {orig_words} to {edit_words} words ({ratio:.0%} of original)",
                "ratio": ratio,
            })

    # ── Social opener removed ─────────────────────────────────────────────────
    if _matches_any(original, _SOCIAL_OPENERS) and not _matches_any(edited, _SOCIAL_OPENERS):
        ops.append({
            "type": DiffOpType.DELETE,
            "content": "social_opener",
            "detail": "Removed social opening phrase (e.g., 'Hope you're well')",
        })

    # ── Filler phrases removed ────────────────────────────────────────────────
    filler_in_orig = sum(1 for p in _FILLER_PHRASES if re.search(p, original.lower()))
    filler_in_edit = sum(1 for p in _FILLER_PHRASES if re.search(p, edited.lower()))
    if filler_in_orig > filler_in_edit:
        ops.append({
            "type": DiffOpType.DELETE,
            "content": "filler_phrases",
            "detail": f"Removed {filler_in_orig - filler_in_edit} filler phrase(s)",
        })

    # ── Generic claims removed ────────────────────────────────────────────────
    generic_in_orig = sum(1 for p in _GENERIC_CLAIMS if re.search(p, original.lower()))
    generic_in_edit = sum(1 for p in _GENERIC_CLAIMS if re.search(p, edited.lower()))
    if generic_in_orig > generic_in_edit:
        ops.append({
            "type": DiffOpType.DELETE,
            "content": "generic_claims",
            "detail": f"Removed {generic_in_orig - generic_in_edit} generic/cliché claim(s)",
        })

    # ── Data evidence added ───────────────────────────────────────────────────
    data_in_orig = sum(1 for p in _DATA_PATTERNS if re.search(p, original))
    data_in_edit = sum(1 for p in _DATA_PATTERNS if re.search(p, edited))
    if data_in_edit > data_in_orig:
        ops.append({
            "type": DiffOpType.EXPAND,
            "content": "data_evidence",
            "detail": f"Added {data_in_edit - data_in_orig} data/evidence element(s)",
        })

    # ── Bullet points added ───────────────────────────────────────────────────
    if not _has_bullets(original) and _has_bullets(edited):
        ops.append({
            "type": DiffOpType.REWRITE,
            "content": "format_bullets",
            "detail": "Reformatted prose to bullet/numbered list",
        })

    # ── Paragraph structure ───────────────────────────────────────────────────
    orig_sentences = _sentence_count(original)
    edit_sentences = _sentence_count(edited)
    if orig_sentences > 0 and edit_sentences < orig_sentences * 0.6:
        ops.append({
            "type": DiffOpType.SHORTEN,
            "content": "paragraph_structure",
            "detail": f"Reduced from {orig_sentences} to {edit_sentences} sentences",
        })

    # ── If nothing changed, record as KEEP ───────────────────────────────────
    if not ops and original.strip() == edited.strip():
        ops.append({
            "type": DiffOpType.KEEP,
            "content": "full_artifact",
            "detail": "CEO approved without changes",
        })

    return ops


def extract_rules_from_ops(
    ops: list[dict],
    artifact_type: str,
) -> list[str]:
    """Convert diff ops into StyleRule type identifiers.

    Each rule is a string from ``StyleRuleType`` values.
    """
    rules: list[str] = []

    for op in ops:
        content = op.get("content", "")
        op_type = op.get("type", "")
        ratio = op.get("ratio", 1.0)

        if op_type == DiffOpType.DELETE and content == "social_opener":
            rules.append(StyleRuleType.AVOID_SOCIAL_OPENER)
            rules.append(StyleRuleType.PREFER_DIRECT_OPENER)

        if op_type == DiffOpType.DELETE and content == "filler_phrases":
            rules.append(StyleRuleType.AVOID_FILLER_PHRASES)

        if op_type == DiffOpType.DELETE and content == "generic_claims":
            rules.append(StyleRuleType.AVOID_GENERIC_CLAIMS)

        if op_type == DiffOpType.EXPAND and content == "data_evidence":
            rules.append(StyleRuleType.PREFER_DATA_EVIDENCE)

        if op_type == DiffOpType.REWRITE and content == "format_bullets":
            rules.append(StyleRuleType.PREFER_BULLET_POINTS)

        if op_type == DiffOpType.SHORTEN and (content == "paragraph_structure" or (isinstance(ratio, float) and ratio < 0.65)):
            rules.append(StyleRuleType.PREFER_CONCISE)
            if artifact_type == "email_draft":
                    rules.append(StyleRuleType.PREFER_SHORT_PARAGRAPHS)


        if op_type == DiffOpType.EXPAND and content != "data_evidence":
            rules.append(StyleRuleType.PREFER_DETAILED)

        if op_type == DiffOpType.KEEP:
            # Positive signal: what was kept is endorsed
            pass

    return list(dict.fromkeys(rules))  # deduplicate, preserve order


# ── Rejection reason → style rule keywords ─────────────────────────────────
# A PendingAction rejection has no "edited version" to diff against — just a
# free-text reason a human typed ("too pushy", "no CTA", "too generic"). This
# is a different classification problem from the diff-ops above (which
# detect a *change between two versions* of the same text) — a rejection
# reason talks *about* the artifact, in the reviewer's own words, not in the
# artifact's own vocabulary. Deliberately its own small keyword table rather
# than routing rejection text through compute_diff_ops/extract_rules_from_ops,
# which would silently misfire (e.g. a reason mentioning "regards" would
# register as a formatting change, not the complaint it actually is). Same
# "pure string heuristics, no NLP dependency" discipline as the rest of this
# module, and the same StyleRuleType vocabulary UserStyleProfile already uses
# — see CorrectionLearningService.record_rejection.
_REJECTION_KEYWORDS: dict[str, list[str]] = {
    StyleRuleType.PREFER_CONCISE: ["too long", "shorten", "verbose", "wordy", "too much text"],
    StyleRuleType.PREFER_DETAILED: ["too short", "more detail", "not enough info", "too thin"],
    StyleRuleType.PREFER_SOFT_CTA: ["too pushy", "aggressive", "too salesy", "hard sell", "salesy"],
    StyleRuleType.AVOID_GENERIC_CLAIMS: ["generic", "template", "boilerplate", "cliche", "cliché", "cookie cutter"],
    StyleRuleType.PREFER_COMPANY_SPECIFICS: [
        "not personalized", "no context", "doesn't mention", "generic to the company", "irrelevant to them",
    ],
    StyleRuleType.PREFER_CASUAL_CLOSING: ["too formal", "stiff", "too corporate", "robotic"],
    StyleRuleType.PREFER_DIRECT_CTA: ["no cta", "weak cta", "no ask", "unclear ask", "no clear next step"],
    StyleRuleType.AVOID_SOCIAL_OPENER: ["weak opener", "bad opening", "hope you're well"],
}


def classify_rejection_reason(reason: str) -> list[str]:
    """Map a free-text PendingAction rejection reason to StyleRuleType
    candidates via keyword matching — deliberately conservative (an empty
    list is a completely valid, common result): a reason that matches
    nothing here is still recorded verbatim on the ArtifactCorrection row
    for a human to read later, it just doesn't move the style profile.
    """
    if not reason:
        return []
    text = reason.lower()
    rules: list[str] = []
    for rule, keywords in _REJECTION_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            rules.append(rule)
    return rules


def compute_change_ratio(original: str, edited: str) -> float:
    """Compute what fraction of the original was materially changed.

    Simple approximation: 1 - (common_words / original_words).
    """
    if not original:
        return 0.0
    orig_words = set(original.lower().split())
    edit_words = set(edited.lower().split())
    if not orig_words:
        return 0.0
    common = orig_words & edit_words
    return 1.0 - (len(common) / len(orig_words))
