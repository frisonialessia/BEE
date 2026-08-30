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
    return ctx.company_name or ctx.company_domain or "la empresa"


def _lead(ctx: EnrichmentContext) -> str:
    """Return the most specific lead identifier available."""
    return ctx.lead_name or ctx.lead_title or "quien decide"


def _best_similar_win_channel_playbook(
    ctx: EnrichmentContext,
) -> tuple[str, str] | None:
    """Return (channel, playbook) from the highest-scoring similar WON strategy.

    The VectorKnowledgeBase provides semantically similar past wins. When the
    top result has a high similarity score (≥ 0.40) and matches the current
    signal type, we use its channel/playbook as a data-backed recommendation.

    Returns None when no similar wins exist or scores are too low to be reliable.
    """
    if not ctx.similar_wins:
        return None
    top = ctx.similar_wins[0]
    score = top.get("similarity_score", 0.0)
    if score < 0.40:  # noqa: PLR2004
        return None
    channel = top.get("channel")
    playbook = top.get("playbook")
    if channel and playbook:
        return channel, playbook
    return None


def _apply_hints_and_variant(
    ctx: EnrichmentContext, default_channel: str, default_playbook: str
) -> tuple[str, str]:
    """Return (channel, playbook) biased by A/B variant, adaptive hints, and Sales DNA.

    Priority order:
    1. Active A/B variant config (experiment in progress — always honor it)
    2. Adaptive memory hints (statistical evidence from closed deals)
    3. VectorKnowledgeBase similar wins (semantic Sales DNA retrieval)
    4. Generator defaults (fallback)

    Guardrail: a candidate from tier 2 or 3 that matches a strong cautionary
    pattern (``ctx.is_cautioned`` — a real documented loss for this exact
    channel+playbook combination) is skipped in favor of the next tier,
    instead of recommending a play BEE already knows tends to lose. Tier 1
    is never second-guessed this way — overriding an active A/B experiment
    would corrupt its data, so a variant's config is always honored as-is.
    If every tier is cautioned, the defaults are still returned (there is
    nothing else to fall back to) — ObservabilityService's
    manual_review_required check is the backstop for that case.
    """
    # 1. A/B variant overrides take highest priority to ensure clean experiment data.
    if ctx.active_variant:
        cfg = ctx.active_variant.config
        channel = cfg.get("channel", default_channel)
        playbook = cfg.get("playbook", default_playbook)
        return channel, playbook

    # 2. Adaptive memory hints (confidence ≥ medium).
    hint = ctx.best_hint
    if hint is not None and not ctx.is_cautioned(hint.channel, hint.playbook):
        return hint.channel, hint.playbook

    # 3. VectorKnowledgeBase: similar past wins give semantic backing.
    similar = _best_similar_win_channel_playbook(ctx)
    if similar is not None and not ctx.is_cautioned(*similar):
        return similar

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
def _apply_hints(
    ctx: EnrichmentContext, default_channel: str, default_playbook: str
) -> tuple[str, str]:
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
            hint_note = f" [Adaptativo: {ctx.best_hint.to_prompt_text()}]"

        return StrategySchema(
            pain_point=(
                f"{company} acaba de cerrar una ronda {round_label}{amount_str} y ahora enfrenta "
                "la paradoja clásica del escalamiento: tiene capital para invertir, pero sus "
                "procesos, herramientas y equipo actuales no están listos para la siguiente "
                "etapa de crecimiento. Cada semana de retraso es una desventaja competitiva."
            ),
            closing_argument=(
                f"Felicidades por la ronda {round_label}{amount_str} — las empresas en esta "
                "etapa normalmente necesitan multiplicar 2-3× su capacidad de go-to-market en "
                "los próximos 90 días. Ya ayudamos a equipos del tamaño de {company} a lograrlo "
                "exactamente así, sin la curva de arranque habitual. ¿Tendría sentido una "
                "llamada de 20 minutos esta semana?"
            ).replace("{company}", company),
            timing_window=TimingWindow(
                urgency="immediate",
                reason=(
                    f"Las decisiones de asignación de presupuesto se toman en los primeros 60 días "
                    f"después del cierre de la ronda {round_label}. Los proveedores que se acercan "
                    "temprano tienen 3× más probabilidad de ser elegidos. "
                    f"Esperar significa competir contra quien sea que {company} ya haya contactado."
                ),
                expires_at="60 días después del cierre de la ronda",
            ),
            playbook=playbook,
            next_best_action="reach_out",
            channel=channel,
            rationale=(
                f"Score de señal {score:.0f}/100 — {company} levantó {round_label}{amount_str}. "
                f"Contacto: {lead}.{hint_note}"
            ),
            generator=self.name,
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
                f"{company} acaba de sumar a {lead}. Los nuevos ejecutivos normalmente "
                "pasan sus primeros 90 días auditando proveedores, procesos y herramientas "
                "actuales — y tomando decisiones de reemplazo. Con quienes hablan primero "
                "definen su idea de 'cómo se ve lo bueno'."
            )
            closing_argument = (
                f"Vi que {company} recientemente sumó a {lead}. "
                "La mayoría de los líderes de RevOps/Ventas en esa posición hacen una "
                "auditoría tecnológica completa en su primer trimestre — ya ayudamos a "
                "varios a construir un stack de inteligencia moderno desde cero. "
                "¿Valdría la pena una llamada para compartir qué le está funcionando "
                "a otros en tu sector?"
            )
            urgency = "this_week"
            window_reason = (
                "Los primeros 30-60 días de un nuevo rol de liderazgo son la fase de "
                "'hoja en blanco' — sin lealtad a proveedores, alta receptividad, y "
                "evaluación activa de herramientas."
            )
            expires = "90 días después de la contratación"
            action = "reach_out"
            default_channel = "linkedin"
            default_playbook = "leadership_change_outreach"
        else:
            pain_point = (
                f"{company} está en modo activo de contratación — sumar gente nueva "
                "significa nuevos costos de onboarding, tiempos de arranque más lentos, "
                "y más fragmentación de procesos. Necesitan herramientas e inteligencia "
                "que escalen con el headcount, no en su contra."
            )
            closing_argument = (
                f"Vimos que {company} está creciendo el equipo. "
                "Los equipos de alto crecimiento en tu etapa suelen toparse con el mismo "
                "cuello de botella: los nuevos reps no pueden replicar lo que los top "
                "performers hacen por instinto. Ayudamos a resolver eso de forma "
                "sistemática. ¿Vale la pena una plática de 15 minutos?"
            )
            urgency = "this_month"
            window_reason = (
                "Las empresas en modo activo de contratación toman decisiones de "
                "herramientas para apoyar al equipo entrante. La ventana es de 30-45 "
                "días antes de que los nuevos reps se integren."
            )
            expires = "antes de que arranque el siguiente lote de contrataciones"
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
            rationale=f"Score de señal {ctx.signal_score:.0f}/100 — {company} / {lead}.",
            generator=self.name,
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

        tool = next((t for t in tags if t not in ("tech", "migrated to")), "una nueva herramienta")

        return StrategySchema(
            pain_point=(
                f"{company} está adoptando {tool} — lo que normalmente indica que "
                "también está reevaluando partes adyacentes de su stack. Las "
                "migraciones de herramientas crean huecos de integración y obligan "
                "a los equipos a repensar todo el flujo de trabajo, no solo la "
                "pieza que están reemplazando."
            ),
            closing_argument=(
                f"Vimos que {company} está integrando {tool} a su flujo de trabajo. "
                "Los equipos que hacen ese cambio suelen descubrir huecos en su capa "
                "de inteligencia de ventas que {tool} por sí solo no cubre. Nosotros "
                "lo complementamos directamente — ¿te mostramos cómo en 20 minutos?"
            ).replace("{tool}", tool),
            timing_window=TimingWindow(
                urgency="this_month",
                reason=(
                    f"Las ventanas de evaluación de stack se mantienen abiertas 30-45 "
                    f"días después de adoptar una nueva herramienta. {company} está en "
                    "'modo cambio' justo ahora — la receptividad a soluciones "
                    "adyacentes está en su punto más alto."
                ),
                expires_at="45 días después de la adopción",
            ),
            playbook="complementary_tech_pitch",
            next_best_action="research",
            channel="email",
            rationale=f"Score de señal {ctx.signal_score:.0f}/100 — {company} adoptó {tool}.",
            generator=self.name,
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
                f"Se detectó una señal de mercado para {company} que podría indicar "
                "un evento de cambio. El contexto disponible es limitado — se recomienda "
                "revisión manual antes de contactar para no encuadrar mal la conversación."
            ),
            closing_argument=(
                f"Notamos actividad reciente alrededor de {company} que podría ser "
                "relevante. ¿Vale la pena un check-in rápido para entender tus "
                "prioridades actuales?"
            ),
            timing_window=TimingWindow(
                urgency="watch",
                reason=(
                    "La confianza de la señal es baja. Monitorear hasta tener una "
                    "segunda señal que la confirme antes de invertir tiempo en contactar."
                ),
                expires_at=None,
            ),
            playbook="generic_outreach",
            next_best_action="monitor",
            channel="email",
            rationale=f"Señal sin clasificar para {company}. Score {ctx.signal_score:.0f}/100.",
            generator=self.name,
            generator_version="1.0.0",
            generated_at=datetime.now(UTC),
        )
