"""Built-in rule-based analyzers.

These ship with BEE to make the Signal Engine useful on day one, before any AI
model is wired in. Each is a self-contained example of the analyzer contract and
a template for building your own.

They are deliberately simple (keyword/rule based) and cheap to run. When the AI
layer arrives, an ``LLMAnalyzer`` can be added alongside these — the engine will
pick it up automatically via the registry with no other changes.
"""

from __future__ import annotations

from app.models.base import SignalSource, SignalType
from app.schemas.signal import SignalWebhookIn
from app.services.signal_engine.analyzers.base import AnalysisResult, SignalAnalyzer
from app.services.signal_engine.analyzers.registry import register_analyzer


def _haystack(payload: SignalWebhookIn) -> str:
    """Build a lowercase text blob from the payload for keyword matching."""
    parts = [payload.title, payload.event, payload.description or ""]
    # Include stringified extra data so keywords in provider fields are matched.
    parts.append(" ".join(str(v) for v in payload.data.values()))
    return " ".join(parts).lower()


@register_analyzer
class FundingAnalyzer(SignalAnalyzer):
    """Detects funding-round signals — one of the strongest buying triggers.

    A fresh raise typically means new budget and expansion plans, so these
    signals are scored highly and paired with an outreach strategy.
    """

    name = "funding"
    priority = 100

    KEYWORDS = (
        "funding",
        "raised",
        "series a",
        "series b",
        "series c",
        "seed round",
        "venture",
        "investment",
    )

    def supports(self, payload: SignalWebhookIn) -> bool:
        text = _haystack(payload)
        return payload.event.startswith("funding") or any(k in text for k in self.KEYWORDS)

    def analyze(self, payload: SignalWebhookIn) -> AnalysisResult:
        text = _haystack(payload)
        matched = [k for k in self.KEYWORDS if k in text]
        # Later-stage rounds signal more budget; bump the score accordingly.
        later_stage = any(k in text for k in ("series b", "series c"))
        score = 90.0 if later_stage else 80.0
        company = payload.company.name if payload.company else "the account"
        return AnalysisResult(
            signal_type=SignalType.FUNDING_ROUND,
            score=score,
            confidence=0.8,
            tags=matched or ["funding"],
            strategy={
                "playbook": "post_funding_outreach",
                "next_best_action": "reach_out",
                "channel": "email",
                "rationale": (
                    f"{company} recently secured funding — a prime window to "
                    "engage while budgets are being allocated."
                ),
            },
            metadata={"matched_keywords": matched},
        )


@register_analyzer
class HiringAnalyzer(SignalAnalyzer):
    """Detects hiring signals (headcount growth, new leadership roles)."""

    name = "hiring"
    priority = 80

    KEYWORDS = (
        "hiring",
        "job opening",
        "new role",
        "we're hiring",
        "headcount",
        "vp of",
        "head of",
        "chief",
    )
    LEADERSHIP = ("vp of", "head of", "chief", "director of")

    def supports(self, payload: SignalWebhookIn) -> bool:
        text = _haystack(payload)
        return payload.event.startswith("hiring") or any(k in text for k in self.KEYWORDS)

    def analyze(self, payload: SignalWebhookIn) -> AnalysisResult:
        text = _haystack(payload)
        matched = [k for k in self.KEYWORDS if k in text]
        leadership = any(k in text for k in self.LEADERSHIP)
        signal_type = (
            SignalType.LEADERSHIP_CHANGE if leadership else SignalType.HIRING
        )
        return AnalysisResult(
            signal_type=signal_type,
            score=70.0 if leadership else 55.0,
            confidence=0.7,
            tags=matched or ["hiring"],
            strategy={
                "playbook": "hiring_growth_outreach",
                "next_best_action": "monitor" if not leadership else "reach_out",
                "channel": "linkedin",
                "rationale": (
                    "Active hiring indicates growth and new initiatives worth "
                    "aligning our offering to."
                ),
            },
            metadata={"matched_keywords": matched, "leadership": leadership},
        )


@register_analyzer
class TechAdoptionAnalyzer(SignalAnalyzer):
    """Detects technology-adoption signals (new tools in the stack)."""

    name = "tech_adoption"
    priority = 60

    KEYWORDS = ("adopted", "migrated to", "now using", "integration with", "stack")

    def supports(self, payload: SignalWebhookIn) -> bool:
        text = _haystack(payload)
        return payload.event.startswith("tech") or any(k in text for k in self.KEYWORDS)

    def analyze(self, payload: SignalWebhookIn) -> AnalysisResult:
        text = _haystack(payload)
        matched = [k for k in self.KEYWORDS if k in text]
        return AnalysisResult(
            signal_type=SignalType.TECH_ADOPTION,
            score=50.0,
            confidence=0.6,
            tags=matched or ["tech"],
            strategy={
                "playbook": "complementary_tech_pitch",
                "next_best_action": "research",
                "channel": "email",
                "rationale": "A stack change can create integration or replacement needs.",
            },
            metadata={"matched_keywords": matched},
        )


@register_analyzer
class BehavioralAnalyzer(SignalAnalyzer):
    """Analyzes behavioral/intent signals from the BehavioralCollector.

    Runs at higher priority than the generic fallback so intent events get
    a properly scored ENGAGEMENT signal rather than the default 20.0 score.
    The actual score is pre-computed by the endpoint and stored in
    ``payload.data["intent_score"]`` — this analyzer just reads it back.

    Note: behavioral signals do NOT produce a ``strategy`` (``strategy=None``)
    because the BehavioralCollector hot-flags an *existing* opportunity rather
    than creating a new one.
    """

    name = "behavioral"
    priority = -50  # Below specialized analyzers, above fallback

    def supports(self, payload: SignalWebhookIn) -> bool:
        return (
            payload.source == SignalSource.BEHAVIORAL
            or payload.signal_type == SignalType.ENGAGEMENT
            or payload.event.startswith("behavioral.")
        )

    def analyze(self, payload: SignalWebhookIn) -> AnalysisResult:
        score = float(payload.data.get("intent_score", 50.0))
        event_type = payload.data.get("event_type", "page_visit")
        return AnalysisResult(
            signal_type=SignalType.ENGAGEMENT,
            score=score,
            confidence=0.9,  # behavioral events are high-confidence by nature
            tags=["behavioral", event_type, "intent"],
            strategy=None,  # no new opportunity — hot-flag the existing one
            metadata={"event_type": event_type, "behavioral": True},
        )


@register_analyzer
class GenericFallbackAnalyzer(SignalAnalyzer):
    """Catch-all analyzer so no signal is ever dropped.

    Runs at the lowest priority and always applies. It records the signal with a
    modest score so it remains visible for review even when no specialized
    analyzer recognizes it — a safety net that also guarantees the engine always
    produces at least one result.
    """

    name = "generic_fallback"
    priority = -100

    def supports(self, payload: SignalWebhookIn) -> bool:  # noqa: ARG002 - always true
        return True

    def analyze(self, payload: SignalWebhookIn) -> AnalysisResult:
        return AnalysisResult(
            signal_type=payload.signal_type or SignalType.OTHER,
            score=20.0,
            confidence=0.3,
            tags=["unclassified"],
            strategy=None,
            metadata={"note": "No specialized analyzer matched; captured for review."},
        )
