"""LLMStrategyGenerator — Senior AE-quality battlecard generation via LLM.

This generator runs at priority=1000 — highest in the registry — so it always
runs before the rule-based generator. If the LLM call fails for any reason
(API error, timeout, invalid JSON, schema validation error), the exception
propagates to the registry loop which catches it, logs it, and falls through to
the next generator (rule-based). Zero data is lost; zero requests fail.

Supported providers
-------------------
* ``AI_PROVIDER=openai``     — OpenAI GPT-4o (default model: gpt-4o-mini)
* ``AI_PROVIDER=anthropic``  — Anthropic Claude 3.5 Sonnet

Provider is selected from ``AI_PROVIDER`` env var. The same ``EnrichmentContext``
prompt is used for both — only the API call differs.

Fallback chain
--------------
::

    LLMStrategyGenerator (priority=1000)  ← tries first
        ↓ fails (API error / timeout / bad JSON)
    RuleBasedArtifactGenerator (priority=0)  ← automatic fallback
        ↓ fails (shouldn't happen; handles every signal type)
    None  ← opportunity stays at DETECTED, no strategy written

Retry strategy
--------------
Each LLM call retries up to ``AI_MAX_RETRIES`` times with exponential backoff
(1s, 2s) for transient errors (rate limits, 5xx). Permanent errors (auth, 4xx)
are not retried.

Output quality
--------------
The prompt is designed to produce battlecard quality equivalent to what a
Senior AE with 10 years experience would write in 5 minutes of research —
hyper-specific to the company, signal, and lead, incorporating Sales DNA,
market intelligence, and psychographic tone matching.

The model is instructed to return strict JSON matching ``StrategySchema``.
The response is validated with Pydantic; any mismatch raises ``ValueError``
which triggers the rule-based fallback.
"""

from __future__ import annotations

import time

from app.core.config import get_settings
from app.core.logging import get_logger
from app.schemas.strategy import StrategySchema, TimingWindow
from app.services.strategy_generator.base import EnrichmentContext, StrategyGenerator
from app.services.strategy_generator.llm_prompt import (
    build_system_prompt,
    build_user_prompt,
    parse_llm_response,
)
from app.services.strategy_generator.registry import register_strategy_generator

logger = get_logger(__name__)
_settings = get_settings()


@register_strategy_generator
class LLMStrategyGenerator(StrategyGenerator):
    """LLM-powered battlecard generator using GPT-4o or Claude 3.5 Sonnet.

    Runs at priority=1000 (highest), so it always executes before the
    rule-based generator. Disabled automatically when ``AI_PROVIDER=none``.
    """

    name = "llm_strategy"
    priority = 1000

    def supports(self, ctx: EnrichmentContext) -> bool:  # noqa: ARG002
        """Active only when an AI provider and API key are configured."""
        provider = _settings.AI_PROVIDER
        has_key = bool(_settings.AI_API_KEY)
        supported = provider in ("openai", "anthropic") and has_key
        if not supported:
            logger.debug(
                "LLMStrategyGenerator: disabled (AI_PROVIDER=%s, has_key=%s)",
                provider, has_key,
            )
        return supported

    def generate(self, ctx: EnrichmentContext) -> StrategySchema:
        """Call the LLM and parse the response into a StrategySchema.

        Raises:
            ValueError: When the LLM response cannot be parsed or validated.
                        The registry loop will catch this and try the next generator.
            Exception:  Any API-level error (timeout, auth, rate limit).
                        Also caught by the registry loop.
        """
        t0 = time.monotonic()
        system_prompt = build_system_prompt()
        user_prompt = build_user_prompt(ctx)

        provider = _settings.AI_PROVIDER
        logger.info(
            "LLMStrategyGenerator: calling %s (model=%s signal_type=%s company=%s)",
            provider,
            _settings.AI_MODEL if provider == "openai" else _settings.ANTHROPIC_MODEL,
            ctx.signal_type.value,
            ctx.company_name or "unknown",
        )

        raw_response = self._call_with_retry(system_prompt, user_prompt, provider)
        elapsed_ms = int((time.monotonic() - t0) * 1000)

        strategy = self._parse_and_validate(raw_response, ctx)
        strategy.generator = self.name
        strategy.confidence_score = self._estimate_confidence(ctx)

        logger.info(
            "LLMStrategyGenerator: strategy generated in %dms "
            "(playbook=%s channel=%s urgency=%s confidence=%.2f)",
            elapsed_ms,
            strategy.playbook,
            strategy.channel,
            strategy.timing_window.urgency,
            strategy.confidence_score,
        )
        return strategy

    # ── LLM API calls ────────────────────────────────────────────────────────

    def _call_with_retry(
        self,
        system_prompt: str,
        user_prompt: str,
        provider: str,
    ) -> str:
        """Call the LLM with exponential-backoff retry for transient errors."""
        max_retries = _settings.AI_MAX_RETRIES
        last_exc: Exception | None = None

        for attempt in range(max_retries + 1):
            try:
                if provider == "openai":
                    return self._call_openai(system_prompt, user_prompt)
                if provider == "anthropic":
                    return self._call_anthropic(system_prompt, user_prompt)
                raise ValueError(f"Unsupported AI_PROVIDER: {provider}")
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                # Do not retry permanent errors (auth, 4xx)
                exc_str = str(exc).lower()
                if any(p in exc_str for p in ("auth", "invalid_api_key", "permission", "403", "401")):
                    logger.error("LLMStrategyGenerator: permanent error — not retrying: %s", exc)
                    raise

                if attempt < max_retries:
                    wait = 2 ** attempt  # 1s, 2s
                    logger.warning(
                        "LLMStrategyGenerator: attempt %d failed (%s) — retrying in %ds",
                        attempt + 1, exc, wait,
                    )
                    time.sleep(wait)

        raise last_exc  # type: ignore[misc]

    def _call_openai(self, system_prompt: str, user_prompt: str) -> str:
        """Call OpenAI Chat Completions API and return the raw text response."""
        from openai import OpenAI

        client = OpenAI(
            api_key=_settings.AI_API_KEY,
            timeout=_settings.AI_TIMEOUT_SECONDS,
        )
        response = client.chat.completions.create(
            model=_settings.AI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,      # Low temperature for consistent, factual output
            max_tokens=800,       # Battlecard is compact — 800 tokens is generous
            response_format={"type": "json_object"},  # GPT-4o JSON mode
        )
        return response.choices[0].message.content or ""

    def _call_anthropic(self, system_prompt: str, user_prompt: str) -> str:
        """Call Anthropic Messages API and return the raw text response."""
        import anthropic

        client = anthropic.Anthropic(api_key=_settings.AI_API_KEY, timeout=_settings.AI_TIMEOUT_SECONDS)
        response = client.messages.create(
            model=_settings.ANTHROPIC_MODEL,
            max_tokens=800,
            temperature=0.3,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return response.content[0].text if response.content else ""

    # ── Response parsing ──────────────────────────────────────────────────────

    def _parse_and_validate(self, raw: str, ctx: EnrichmentContext) -> StrategySchema:  # noqa: ARG002
        """Parse the LLM JSON response and validate it as a StrategySchema.

        Raises:
            ValueError: If parsing fails or required fields are missing.
        """
        if not raw or not raw.strip():
            raise ValueError("LLM returned an empty response")

        data = parse_llm_response(raw)

        # Build TimingWindow from nested dict
        tw_data = data.get("timing_window", {})
        if isinstance(tw_data, str):
            tw_data = {"urgency": tw_data, "reason": tw_data, "expires_at": None}

        timing_window = TimingWindow(
            urgency=tw_data.get("urgency", "watch"),
            reason=tw_data.get("reason", "LLM-generated strategy"),
            expires_at=tw_data.get("expires_at"),
        )

        strategy = StrategySchema(
            pain_point=data["pain_point"],
            closing_argument=data["closing_argument"],
            timing_window=timing_window,
            playbook=data.get("playbook", "generic_outreach"),
            next_best_action=data.get("next_best_action", "reach_out"),
            channel=data.get("channel", "email"),
        )

        if not strategy.is_battlecard_complete():
            raise ValueError(
                f"LLM strategy incomplete: pain_point={bool(strategy.pain_point)}, "
                f"closing_argument={bool(strategy.closing_argument)}"
            )

        return strategy

    def _estimate_confidence(self, ctx: EnrichmentContext) -> float:
        """Estimate the confidence score for the generated strategy.

        Higher confidence when:
        - Similar wins exist in Sales DNA (data-backed recommendation)
        - Adaptive memory hints exist (statistically validated patterns)
        - Psychographic profile is available (tone-matched output)
        - Dark funnel score is high (confirmed buying intent)

        Lower confidence when:
        - No historical data exists (LLM is guessing)
        - Signal score is low (weak trigger)
        """
        score = 0.75  # LLM base confidence (higher than rule-based)

        if ctx.similar_wins:
            score += 0.05 * min(len(ctx.similar_wins), 3)  # +5% per win, max +15%
        if ctx.success_hints and ctx.best_hint:
            score += 0.05
        if ctx.psychographic_style:
            score += 0.03
        if ctx.is_dark_funnel_hot:
            score += 0.02
        if ctx.has_warm_intro:
            score += 0.05
        if ctx.signal_score < 0.3:  # noqa: PLR2004
            score -= 0.10

        return round(min(1.0, max(0.0, score)), 3)
