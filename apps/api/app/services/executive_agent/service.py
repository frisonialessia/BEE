"""ExecutiveAgent — transforms strategies into execution artifacts.

The ExecutiveAgent is the "hands" of BEE: it takes a fully enriched strategy
and generates concrete, immediately actionable sales artifacts. Its outputs are
simultaneously:

1. Returned to the frontend for "One-Click Action" UX (copy email, start call).
2. Persisted to ``opportunity.execution_artifacts`` for caching.
3. Posted to a configured webhook URL so external tools can execute them.

Concurrency note
----------------
Artifact generation is triggered on-demand (GET /opportunities/{id}/artifacts).
If artifacts already exist in ``opportunity.execution_artifacts``, the cached
version is returned without re-generation. Re-generation is forced by passing
``force=True``.

This design avoids the latency hit on every strategy update and keeps the signal
engine hot path fast.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlmodel import Session

# Triggers registration of all artifact generators as a side effect.
import app.services.executive_agent.generators  # noqa: F401   (rule-based, priority=0)
import app.services.executive_agent.llm_generator  # noqa: F401  (LLM, priority=1000)
from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.opportunity import Opportunity
from app.repositories.opportunity import OpportunityRepository
from app.schemas.executive import ArtifactBundle, ArtifactEventPayload
from app.schemas.strategy import StrategySchema
from app.services.executive_agent import webhook_emitter
from app.services.executive_agent.base import ArtifactContext
from app.services.executive_agent.registry import get_artifact_generators

logger = get_logger(__name__)


class ExecutiveAgent:
    """Generates and persists execution artifact bundles on demand.

    Inject into the opportunities endpoint — not into the SignalEngine, because
    artifact generation is a pull operation (triggered by the frontend / API),
    not a push operation (triggered by signal ingestion).
    """

    def __init__(self, session: Session) -> None:
        self.session = session
        self._opps = OpportunityRepository(session)
        self._settings = get_settings()

    def get_or_generate(
        self,
        opportunity_id: uuid.UUID,
        *,
        force: bool = False,
    ) -> ArtifactBundle:
        """Return cached artifacts or generate fresh ones.

        Args:
            opportunity_id: The opportunity to generate artifacts for.
            force:          If True, regenerate even when a cached bundle exists.

        Raises:
            ValueError: When the opportunity doesn't exist or has no strategy yet.
        """
        opp = self._opps.get(opportunity_id)
        if opp is None:
            raise ValueError(f"Opportunity {opportunity_id} not found")

        # Return cached artifacts if available and not forced.
        if opp.execution_artifacts and not force:
            logger.debug("Returning cached artifacts for opportunity %s", opportunity_id)
            return ArtifactBundle.model_validate(opp.execution_artifacts)

        if not opp.strategy:
            raise ValueError(
                f"Opportunity {opportunity_id} has no strategy yet. "
                "Wait for READY_TO_ACTION status before requesting artifacts."
            )

        bundle = self._generate(opp)
        self._persist(opp, bundle)
        self._create_orchestrator_actions(bundle)
        self._emit_webhook(bundle)
        self._audit_bundle(opp, bundle)
        return bundle

    def _generate(self, opp: Opportunity) -> ArtifactBundle:
        """Run all artifact generators and assemble the bundle."""
        try:
            strategy = StrategySchema.model_validate(opp.strategy)
        except Exception as exc:
            raise ValueError(f"Could not parse strategy for opportunity {opp.id}: {exc}") from exc

        # Inject learned CEO style preferences (CorrectionLearning) and
        # brand voice context (PersonalBrandService) into the generation context.
        style_hint = self._get_style_injection(opp)
        brand_brief = self._get_brand_brief(opp)

        ctx = ArtifactContext(
            strategy=strategy,
            company_name=self._resolve_company_name(opp),
            lead_name=self._resolve_lead_name(opp),
            lead_title=self._resolve_lead_title(opp),
            signal_type=self._resolve_signal_type(opp),
            signal_title=self._resolve_signal_title(opp),
            opportunity_title=opp.title,
            style_hint=style_hint,
            brand_brief=brand_brief,
        )

        generators = get_artifact_generators()
        if not generators:
            raise ValueError("No artifact generators registered")

        # Use the first (highest-priority) generator.
        gen = generators[0]
        logger.info(
            "Generating artifacts for opportunity %s using %s", opp.id, gen.name
        )

        email_artifact = gen.generate_email(ctx)
        meeting_artifact = gen.generate_meeting(ctx)
        next_steps_artifact = gen.generate_next_steps(ctx)

        # ── PsychographicAnalyzer middleware ──────────────────────────────────
        # Apply DISC content style adaptation to all text artifacts before
        # they reach the CEO. This is the mandatory middleware step.
        email_artifact = self._apply_psychographic_middleware(email_artifact, opp, "email_draft")
        meeting_artifact = self._apply_psychographic_middleware(meeting_artifact, opp, "meeting_agenda")

        return ArtifactBundle(
            opportunity_id=opp.id,
            generated_at=datetime.now(UTC),
            generator=gen.name,
            email_draft=email_artifact,
            meeting_structure=meeting_artifact,
            next_steps=next_steps_artifact,
            context_snapshot={
                "company": ctx.company_name,
                "lead": ctx.lead_name,
                "signal_type": ctx.signal_type,
                "playbook": strategy.playbook,
                "channel": strategy.channel,
            },
        )

    def _persist(self, opp: Opportunity, bundle: ArtifactBundle) -> None:
        opp.execution_artifacts = bundle.model_dump(mode="json")
        self.session.add(opp)
        self.session.commit()
        logger.debug("Persisted artifacts for opportunity %s", opp.id)

    def _create_orchestrator_actions(self, bundle: ArtifactBundle) -> None:
        """Register all executable artifacts with the AgentOrchestrator.

        Creates PendingAction records (PENDING_APPROVAL) for every external
        action. No action can be executed until explicitly approved.
        """
        try:
            from app.services.orchestrator import AgentOrchestrator
            orchestrator = AgentOrchestrator(self.session)
            actions = orchestrator.create_from_bundle(bundle)
            logger.info(
                "Created %d orchestrator action(s) for opportunity %s",
                len(actions), bundle.opportunity_id,
            )
        except Exception:  # noqa: BLE001
            # Roll back so a failed write here (e.g. a constraint violation in
            # create_from_bundle) doesn't leave the shared session poisoned
            # for _audit_bundle, which runs right after this in get_or_generate.
            self.session.rollback()
            logger.exception("Failed to create orchestrator actions for %s", bundle.opportunity_id)

    def _get_style_injection(self, opp: Opportunity) -> str:  # noqa: ARG002
        """Retrieve the learned CEO style summary to inject into generation context."""
        try:
            from app.services.correction_learning import CorrectionLearningService
            return CorrectionLearningService(self.session).get_style_summary_for_injection()
        except Exception:  # noqa: BLE001
            return ""

    def _get_brand_brief(self, opp: Opportunity) -> str:
        """Retrieve the CEO brand voice context from PersonalBrandService.

        The brand brief provides:
        - CEO's authority topics and areas of expertise
        - Writing style characteristics and tone preferences
        - Company DNA context for authentic voice alignment

        Used by generators to ensure all artifacts sound like the CEO, not generic AI.
        In LLM mode, this is injected directly into the system prompt.
        """
        try:
            from app.services.personal_brand import PersonalBrandService
            from app.services.vector_store import get_vector_store

            # Use the company/opportunity context as the semantic query
            query = (
                opp.strategy.get("pain_point", "")
                or opp.title
                or "sales outreach"
            ) if opp.strategy else opp.title or "sales outreach"

            # PersonalBrandService requires a vector store for semantic fragment
            # retrieval; generate_brand_brief() returns the ready-to-inject string
            # (get_brand_context() returns the full BrandContextResult object).
            svc = PersonalBrandService(self.session, get_vector_store())
            return svc.generate_brand_brief(topic=query[:200])
        except Exception:  # noqa: BLE001
            logger.debug("PersonalBrandService unavailable — brand_brief will be empty", exc_info=True)
            return ""

    def _audit_bundle(self, opp: Opportunity, bundle: ArtifactBundle) -> None:
        """Record the artifact generation in the audit trail."""
        try:
            from app.models.audit_trail import AgentType, DecisionType
            from app.services.audit_trail import AuditTrailService

            strategy = opp.strategy or {}
            audit = AuditTrailService(self.session)
            audit.record_decision(
                agent_type=AgentType.EXECUTIVE_AGENT,
                decision_type=DecisionType.ARTIFACT_CREATED,
                opportunity_id=opp.id,
                lead_id=opp.lead_id,
                context_snapshot={
                    "playbook": strategy.get("playbook"),
                    "channel": strategy.get("channel"),
                    "has_email": bundle.email_draft is not None,
                    "has_meeting": bundle.meeting_structure is not None,
                    "generator": bundle.generator,
                },
                output_snapshot=bundle.context_snapshot or {},
                strategy_reasoning=f"Artifacts generated by {bundle.generator} for opportunity {opp.id}.",
                confidence_score=strategy.get("confidence_score", 1.0),
            )
        except Exception:  # noqa: BLE001
            logger.warning("Failed to record artifact generation in audit trail", exc_info=True)

    def _apply_psychographic_middleware(
        self,
        artifact: object,
        opp: Opportunity,
        artifact_type: str,
    ) -> object:
        """Run the PsychographicAnalyzer ContentStyleMiddleware on artifact text.

        Adapts the artifact's body/content field to match the lead's DISC
        communication style. Non-destructive: if no lead or profile found,
        returns the artifact unchanged.

        This is the mandatory middleware hook that ensures ALL BEE-generated
        content passes through the DISC style filter before CEO review.
        """
        if not opp.lead_id:
            return artifact
        try:
            from app.models.lead import Lead
            from app.services.psychographic import PsychographicAnalyzer

            lead = self.session.get(Lead, opp.lead_id)
            if not lead:
                return artifact

            analyzer = PsychographicAnalyzer(self.session)

            # Adapt the body field of the artifact (different artifact types have different fields)
            body_field = getattr(artifact, "body", None) or getattr(artifact, "content", None)
            if not body_field:
                return artifact

            adapted = analyzer.adapt_content(str(body_field), lead, artifact_type)

            # Write the adapted content back to the artifact
            if hasattr(artifact, "body"):
                artifact = artifact.model_copy(update={"body": adapted.adapted})  # type: ignore[union-attr]
            elif hasattr(artifact, "content"):
                artifact = artifact.model_copy(update={"content": adapted.adapted})  # type: ignore[union-attr]

            logger.debug(
                "Psychographic middleware applied: lead=%s style=%s artifact=%s adaptations=%d",
                lead.id, adapted.disc_style, artifact_type, len(adapted.adaptations_applied),
            )
        except Exception:  # noqa: BLE001
            logger.warning("Psychographic middleware failed, returning unmodified artifact", exc_info=True)

        return artifact

    def _emit_webhook(self, bundle: ArtifactBundle) -> None:
        url = getattr(self._settings, "WEBHOOK_EXECUTION_URL", None)
        if not url:
            return
        secret = getattr(self._settings, "WEBHOOK_SIGNING_SECRET", None)
        event = ArtifactEventPayload(
            opportunity_id=bundle.opportunity_id,
            timestamp=bundle.generated_at,
            bundle=bundle,
        )
        webhook_emitter.emit_event(
            event.model_dump(mode="json"),
            webhook_url=url,
            secret=secret,
        )

    # ── Private context resolvers ────────────────────────────────────────────

    def _resolve_company_name(self, opp: Opportunity) -> str:
        if opp.company_id:
            from app.models.company import Company
            co = self.session.get(Company, opp.company_id)
            if co:
                return co.name or ""
        return opp.strategy.get("context_snapshot", {}).get("company", "") or opp.title

    def _resolve_lead_name(self, opp: Opportunity) -> str:
        if opp.lead_id:
            from app.models.lead import Lead
            lead = self.session.get(Lead, opp.lead_id)
            if lead and lead.full_name:
                return lead.full_name
        return ""

    def _resolve_lead_title(self, opp: Opportunity) -> str | None:
        if opp.lead_id:
            from app.models.lead import Lead
            lead = self.session.get(Lead, opp.lead_id)
            if lead:
                return lead.title
        return None

    def _resolve_signal_type(self, opp: Opportunity) -> str:
        if opp.signal_id:
            from app.models.signal import Signal
            sig = self.session.get(Signal, opp.signal_id)
            if sig:
                st = sig.signal_type
                return st.value if hasattr(st, "value") else str(st)
        return "other"

    def _resolve_signal_title(self, opp: Opportunity) -> str:
        if opp.signal_id:
            from app.models.signal import Signal
            sig = self.session.get(Signal, opp.signal_id)
            if sig:
                return sig.title
        return opp.title
