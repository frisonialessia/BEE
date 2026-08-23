"""PsychographicAnalyzer — DISC profiling and content style adaptation.

This service is the central hub for lead communication style intelligence.
It exposes two main capabilities:

1. ``get_or_classify(lead)``: Lazily compute and cache the DISC profile for
   a lead. Returns from DB if cached; classifies and persists if not.

2. ``adapt_content(content, lead, artifact_type)``: The content middleware.
   Called by the ExecutiveAgent and SmartEngagementEngine before finalising
   any generated text. Adapts tone to match the lead's DISC style.

Middleware guarantee
--------------------
The ExecutiveAgent calls ``adapt_content()`` on EVERY generated artifact
before adding it to the PendingAction payload. This is enforced at the
service call site in ``executive_agent/service.py``, not optionally.

The EnrichmentContext gains ``psychographic_profile: PsychographicProfile``
so the StrategyGeneratorService can also adjust channel and messaging angle
recommendations based on the lead's communication style.
"""

from __future__ import annotations

import uuid

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.lead import Lead
from app.models.psychographic import ClassificationSource, LeadPsychographic
from app.schemas.psychographic import AdaptedContent
from app.services.permissions import scope_by_organization_id as _scope
from app.services.psychographic.classifier import STYLE_PREFERENCES, classify_from_title
from app.services.psychographic.middleware import ContentStyleMiddleware

logger = get_logger(__name__)


class PsychographicAnalyzer:
    """DISC profiling service with built-in content style middleware."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self._middleware = ContentStyleMiddleware()

    # ── DISC profile management ───────────────────────────────────────────────

    def get_or_classify(self, lead: Lead) -> LeadPsychographic:
        """Return the cached DISC profile for a lead, or classify and persist it.

        Classification uses the lead's ``title`` field + ``company.industry``
        (if available via a join). Future: incorporate behavioural signals.
        """
        existing = self.session.exec(
            select(LeadPsychographic).where(LeadPsychographic.lead_id == lead.id)
        ).first()
        if existing:
            return existing

        return self._classify_and_persist(lead)

    def get_for_lead_id(self, lead_id: uuid.UUID) -> LeadPsychographic | None:
        return self.session.exec(
            select(LeadPsychographic).where(LeadPsychographic.lead_id == lead_id)
        ).first()

    def reclassify(self, lead: Lead) -> LeadPsychographic:
        """Force a fresh classification, replacing any cached profile."""
        existing = self.session.exec(
            select(LeadPsychographic).where(LeadPsychographic.lead_id == lead.id)
        ).first()
        if existing:
            self.session.delete(existing)
            self.session.flush()

        return self._classify_and_persist(lead)

    def list_profiles(
        self, limit: int = 50, organization_id: uuid.UUID | None = None
    ) -> list[LeadPsychographic]:
        stmt = select(LeadPsychographic).order_by(LeadPsychographic.classified_at.desc()).limit(limit)
        stmt = _scope(stmt, LeadPsychographic.organization_id, organization_id)
        return list(self.session.exec(stmt).all())

    # ── Content middleware (the core middleware method) ────────────────────────

    def adapt_content(
        self,
        content: str,
        lead: Lead,
        artifact_type: str = "email_draft",
    ) -> AdaptedContent:
        """Adapt content to the lead's DISC communication style.

        This is the middleware hook. All generated content in BEE passes
        through this method before being presented to the CEO or stored as
        a PendingAction. It is non-destructive: facts are preserved, only
        tone/structure/phrasing is adjusted.

        Args:
            content:       The raw generated text (email body, message, etc.)
            lead:          The lead this content targets.
            artifact_type: Type hint for the middleware (affects structural rules).

        Returns:
            An :class:`AdaptedContent` with the adapted text and change log.
        """
        profile = self.get_or_classify(lead)
        result = self._middleware.adapt(content, profile, artifact_type)
        logger.debug(
            "Content adapted for lead=%s style=%s adaptations=%d",
            lead.id,
            profile.dominant_style,
            len(result.adaptations_applied),
        )
        return result

    def adapt_content_for_style(
        self,
        content: str,
        style: str,
        artifact_type: str = "email_draft",
        confidence: float = 0.5,
    ) -> AdaptedContent:
        """Adapt content directly for a known DISC style (without a Lead object).

        Useful when the style is known but we don't have a Lead in the session
        (e.g., in SmartEngagementEngine where we only have an engagement event).
        """
        from app.models.psychographic import LeadPsychographic as _LP
        stub = _LP(
            lead_id=uuid.uuid4(),
            dominant_style=style,
            confidence=confidence,
        )
        return self._middleware.adapt(content, stub, artifact_type)

    def get_style_preferences(self, lead: Lead) -> dict[str, object]:
        """Return the style preference dict for a lead's DISC style."""
        profile = self.get_or_classify(lead)
        return STYLE_PREFERENCES.get(profile.dominant_style, {})

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _classify_and_persist(self, lead: Lead) -> LeadPsychographic:
        title = lead.title or ""
        industry: str | None = None

        # Try to get industry from Company (optional join)
        if hasattr(lead, "company_id") and lead.company_id:
            from app.models.company import Company
            company = self.session.get(Company, lead.company_id)
            if company:
                industry = getattr(company, "industry", None)

        result = classify_from_title(title, industry)
        prefs = STYLE_PREFERENCES.get(result["dominant"], {})

        profile = LeadPsychographic(
            organization_id=lead.organization_id,
            lead_id=lead.id,
            d_score=result["d"],
            i_score=result["i"],
            s_score=result["s"],
            c_score=result["c"],
            dominant_style=result["dominant"],
            secondary_style=result["secondary"],
            confidence=result["confidence"],
            classification_source=ClassificationSource.TITLE_HEURISTIC,
            classification_notes=result["notes"],
            preferred_tone=str(prefs.get("tone", "professional")),
            preferred_message_length=str(prefs.get("length", "medium")),
            avoid_phrases=list(prefs.get("avoid", [])),  # type: ignore[arg-type]
        )
        self.session.add(profile)
        self.session.flush()
        self.session.refresh(profile)

        logger.info(
            "DISC profile created: lead=%s style=%s confidence=%.2f source=%s",
            lead.id, profile.dominant_style, profile.confidence,
            profile.classification_source,
        )
        return profile
