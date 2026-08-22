"""LLMAnalyzer — AI-powered signal classification.

This is the LLM extension point the rest of the codebase documents but never
implemented (see ``keyword_analyzers.py``'s module docstring and the example in
``apps/api/README.md``). It follows the exact same pattern as
``LLMStrategyGenerator`` and ``LLMArtifactGenerator``: same settings
(``AI_PROVIDER``/``AI_API_KEY``), same provider support (OpenAI/Anthropic), same
retry/backoff policy, and the same "never blocks the pipeline" guarantee — any
failure degrades to a zero-score, zero-confidence result rather than raising.

Why it's useful alongside the keyword analyzers
------------------------------------------------
The keyword analyzers are exact-phrase matchers: they only fire when the
payload's text literally contains one of their hardcoded keywords. Real-world
signal text is messier — paraphrased headlines, non-English copy, unusual
phrasing that never mentions "raised" or "hired" verbatim. This analyzer asks
the LLM to interpret what the payload actually means and classify it the same
way a human analyst would.

It does not replace the keyword analyzers or run instead of them — the
SignalEngine runs every analyzer that ``supports()`` the payload and keeps
whichever result scores highest (see ``engine.py::_run_analyzers``). So a
confident keyword match is never overridden by a weaker LLM guess, and a
payload the keyword analyzers miss entirely can still be classified and,
where warranted, promoted into an opportunity.

Disabled automatically when no AI provider is configured (``AI_PROVIDER=none``
or ``AI_API_KEY`` unset) — the engine then falls back to the keyword analyzers
and the generic fallback exactly as before this analyzer existed.
"""

from __future__ import annotations

import json
import time

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.base import SignalType
from app.schemas.signal import SignalWebhookIn
from app.services.signal_engine.analyzers.base import AnalysisResult, SignalAnalyzer
from app.services.signal_engine.analyzers.registry import register_analyzer
from app.services.strategy_generator.llm_prompt import parse_llm_response

logger = get_logger(__name__)
_settings = get_settings()

_SIGNAL_TYPE_VALUES = [t.value for t in SignalType]

_SYSTEM_PROMPT = f"""You are a B2B market-signal classifier for BEE, a sales intelligence platform.

Given a raw event payload, classify it and decide whether it represents a genuine
sales-worthy trigger — a moment when a company shows a change (funding, hiring,
tech adoption, leadership change, expansion...) that creates a real commercial
opening for a vendor to reach out.

Return ONLY a JSON object with this exact shape:
{{
  "signal_type": one of {_SIGNAL_TYPE_VALUES},
  "score": float 0-100 (how strong a buying trigger this is, not how interesting the news is),
  "confidence": float 0-1 (your confidence in this classification),
  "tags": ["short", "keyword", "labels"],
  "propose_strategy": true or false,
  "playbook": short slug such as "post_funding_outreach" (only meaningful if propose_strategy is true),
  "channel": "email", "linkedin", or "phone" (only meaningful if propose_strategy is true),
  "rationale": "one sentence explaining why this matters commercially" (only meaningful if propose_strategy is true)
}}

Rules:
1. Be conservative: only set propose_strategy=true for signals with clear, immediate
   commercial relevance. Vague or purely informational mentions should be
   propose_strategy=false with a low score.
2. score reflects trigger strength (budget/urgency implied), not newsworthiness.
3. Return ONLY valid JSON. No markdown, no explanation, no code fences."""


@register_analyzer
class LLMAnalyzer(SignalAnalyzer):
    """AI-powered classifier that runs alongside the keyword analyzers.

    Priority is set above the specialized keyword analyzers so it's tried
    early in each ingestion run, but — as with every analyzer — this only
    affects iteration order: the engine still runs every analyzer whose
    ``supports()`` returns True and keeps the highest-scoring result.
    """

    name = "llm_classifier"
    priority = 200

    def supports(self, payload: SignalWebhookIn) -> bool:  # noqa: ARG002
        """Active only when an AI provider and API key are configured."""
        provider = _settings.AI_PROVIDER
        has_key = bool(_settings.AI_API_KEY)
        supported = provider in ("openai", "anthropic") and has_key
        if not supported:
            logger.debug(
                "LLMAnalyzer: disabled (AI_PROVIDER=%s, has_key=%s)", provider, has_key
            )
        return supported

    def analyze(self, payload: SignalWebhookIn) -> AnalysisResult:
        """Classify the payload via the configured LLM.

        Never raises: any failure (API error, malformed JSON, unknown
        signal_type) degrades to a zero-score, zero-confidence result, which
        the engine's max-score aggregation will simply ignore in favor of
        whatever the keyword analyzers produced (or the generic fallback, if
        nothing else matched).
        """
        try:
            raw = self._call_with_retry(self._build_user_prompt(payload))
            data = parse_llm_response(raw)
        except Exception:  # noqa: BLE001
            logger.warning(
                "LLMAnalyzer: classification failed; yielding to other analyzers",
                exc_info=True,
            )
            return AnalysisResult(
                signal_type=SignalType.OTHER, score=0.0, confidence=0.0, tags=[], strategy=None
            )

        try:
            signal_type = SignalType(data.get("signal_type", "other"))
        except ValueError:
            signal_type = SignalType.OTHER

        score = max(0.0, min(100.0, float(data.get("score", 0.0) or 0.0)))
        confidence = max(0.0, min(1.0, float(data.get("confidence", 0.0) or 0.0)))
        tags = [str(t) for t in (data.get("tags") or [])] or ["llm_classified"]

        strategy: dict | None = None
        if data.get("propose_strategy"):
            strategy = {
                "playbook": data.get("playbook") or "generic_outreach",
                "next_best_action": "reach_out",
                "channel": data.get("channel") or "email",
                "rationale": data.get("rationale") or "AI-identified commercial signal.",
            }

        return AnalysisResult(
            signal_type=signal_type,
            score=score,
            confidence=confidence,
            tags=tags,
            strategy=strategy,
            metadata={"llm_provider": _settings.AI_PROVIDER},
        )

    # ── Prompt & LLM call ────────────────────────────────────────────────────

    @staticmethod
    def _build_user_prompt(payload: SignalWebhookIn) -> str:
        extra = json.dumps(payload.data, default=str)[:1000]
        return (
            f"Event: {payload.event}\n"
            f"Title: {payload.title}\n"
            f"Description: {payload.description or 'None'}\n"
            f"Extra data: {extra}"
        )

    def _call_with_retry(self, user_prompt: str) -> str:
        """Call the LLM with exponential-backoff retry for transient errors."""
        max_retries = _settings.AI_MAX_RETRIES
        last_exc: Exception | None = None

        for attempt in range(max_retries + 1):
            try:
                return self._call_llm(user_prompt)
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                exc_str = str(exc).lower()
                if any(p in exc_str for p in ("auth", "invalid_api_key", "permission", "403", "401")):
                    logger.error("LLMAnalyzer: permanent error — not retrying: %s", exc)
                    raise
                if attempt < max_retries:
                    wait = 2**attempt  # 1s, 2s
                    logger.warning(
                        "LLMAnalyzer: attempt %d failed (%s) — retrying in %ds",
                        attempt + 1, exc, wait,
                    )
                    time.sleep(wait)

        raise last_exc  # type: ignore[misc]

    def _call_llm(self, user_prompt: str) -> str:
        provider = _settings.AI_PROVIDER
        if provider == "openai":
            from openai import OpenAI

            client = OpenAI(api_key=_settings.AI_API_KEY, timeout=_settings.AI_TIMEOUT_SECONDS)
            resp = client.chat.completions.create(
                model=_settings.AI_MODEL,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,
                max_tokens=300,
                response_format={"type": "json_object"},
            )
            return resp.choices[0].message.content or ""

        if provider == "anthropic":
            import anthropic

            client = anthropic.Anthropic(api_key=_settings.AI_API_KEY)
            resp = client.messages.create(
                model=_settings.ANTHROPIC_MODEL,
                max_tokens=300,
                temperature=0.1,
                system=_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )
            return resp.content[0].text if resp.content else ""

        raise ValueError(f"Unsupported AI_PROVIDER: {provider}")
