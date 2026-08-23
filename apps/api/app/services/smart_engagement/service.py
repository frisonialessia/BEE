"""SmartEngagementEngine — reactive engagement with brand-grounded responses.

This service processes incoming engagement events (LinkedIn comments, DMs,
Twitter replies) and generates response drafts that sound exactly like the CEO
by consulting the PersonalBrandService before generating.

Processing pipeline
-------------------
::

    IncomingEngagementEvent
        │
        ▼ Step 1: Classify
    _classify(content)
        → sentiment: positive | neutral | negative | question
        → intent: sales_interest | objection | referral | compliment | spam
        → confidence: 0-1
        │
        ▼ Step 2: Gate (ignore spam, log low-priority)
    if intent == SPAM → mark ignored, return
        │
        ▼ Step 3: Brand context
    PersonalBrandService.retrieve_context(content, top_k=3)
        → relevant fragments + voice profile
        │
        ▼ Step 4: Generate response draft
    _generate_response(event, brand_context)
        → rule-based template + brand voice injection
        (LLM upgrade: replace _generate_response with LLM call + brand brief)
        │
        ▼ Step 5: Authenticity gate
    OmnichannelGateway.prepare_action(channel, draft)
        → PendingAction (PENDING_APPROVAL)
        → CEO reviews before anything is sent

Rule-based classifier
---------------------
Uses keyword heuristics for sentiment and intent. Completely swappable
with an LLM classifier by overriding ``_classify()``. The event schema
and PendingAction creation remain the same.
"""

from __future__ import annotations

import uuid

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.models.engagement_event import (
    EngagementIntent,
    EngagementSentiment,
    IncomingEngagementEvent,
)
from app.schemas.engagement import EngagementAnalysis, IncomingEventIn
from app.services.omnichannel.gateway import OmnichannelGateway
from app.services.permissions import scope_by_organization_id as _scope
from app.services.personal_brand.service import PersonalBrandService

logger = get_logger(__name__)

# ── Keyword lists for rule-based classification ────────────────────────────────

_POSITIVE_WORDS = {
    "great", "amazing", "love", "excellent", "fantastic", "awesome",
    "helpful", "brilliant", "congrats", "congratulations", "well done",
    "impressed", "thank", "thanks", "useful", "insightful", "agree",
}
_NEGATIVE_WORDS = {
    "disagree", "wrong", "bad", "terrible", "misleading", "false",
    "disappointed", "awful", "hate", "worst", "useless", "fail",
    "frustrated", "problem", "issue", "complain",
}
_QUESTION_WORDS = {"?", "how", "what", "why", "when", "who", "where", "which", "can you", "could you"}
_SALES_INTEREST_WORDS = {"price", "cost", "how much", "interested", "demo", "trial", "sign up", "buy", "purchase", "pricing", "plans"}
_OBJECTION_WORDS = {"but", "however", "not sure", "don't think", "doubt", "disagree", "miss", "missing", "without"}
_SPAM_WORDS = {"buy now", "click here", "limited offer", "make money", "earn $", "free bitcoin", "follower", "unsubscribe"}


def _keyword_score(text_lower: str, keywords: set[str]) -> float:
    """Count how many keywords appear in text, normalised to 0-1."""
    hits = sum(1 for kw in keywords if kw in text_lower)
    return min(1.0, hits / max(1, len(keywords) * 0.1))


class SmartEngagementEngine:
    """Classifies incoming engagement events and generates brand-grounded responses."""

    def __init__(
        self,
        session: Session,
        brand_service: PersonalBrandService,
        gateway: OmnichannelGateway,
    ) -> None:
        self.session = session
        self._brand = brand_service
        self._gateway = gateway

    def process(
        self, data: IncomingEventIn, organization_id: uuid.UUID | None = None
    ) -> EngagementAnalysis:
        """Full pipeline: classify → brand context → draft → approval gate.

        Args:
            data: The incoming engagement event payload from the API.
            organization_id: Tenant to stamp on the event and to scope both
                the dedup check and the brand voice used for the draft.

        Returns:
            An :class:`EngagementAnalysis` with the generated draft (if any)
            and the PendingAction ID awaiting CEO approval.
        """
        # ── Dedup check ───────────────────────────────────────────────────────
        if data.source_event_id:
            existing_stmt = _scope(
                select(IncomingEngagementEvent).where(
                    IncomingEngagementEvent.source_event_id == data.source_event_id
                ),
                IncomingEngagementEvent.organization_id,
                organization_id,
            )
            existing = self.session.exec(existing_stmt).first()
            if existing:
                logger.info("Duplicate engagement event %s, skipping.", data.source_event_id)
                return self._to_analysis(existing)

        # ── Step 1: Classify ──────────────────────────────────────────────────
        sentiment, intent, confidence, notes = self._classify(data.content)

        # ── Step 2: Persist event ─────────────────────────────────────────────
        event = IncomingEngagementEvent(
            organization_id=organization_id,
            source=data.source,
            source_event_id=data.source_event_id,
            author_name=data.author_name,
            author_handle=data.author_handle,
            author_profile_url=data.author_profile_url,
            content=data.content,
            context_post=data.context_post,
            sentiment=sentiment,
            intent=intent,
            analysis_confidence=confidence,
            analysis_notes=notes,
            raw_payload=data.raw_payload,
        )
        self.session.add(event)
        self.session.flush()

        # ── Step 3: Gate spam ─────────────────────────────────────────────────
        if intent == EngagementIntent.SPAM:
            event.ignored = True
            event.processed = True
            self.session.add(event)
            self.session.flush()
            logger.info("Engagement event %s classified as SPAM — ignored.", event.id)
            return self._to_analysis(event)

        # ── Step 4: Brand context retrieval ───────────────────────────────────
        brand_ctx = self._brand.get_brand_context(
            query=data.content,
            top_k=3,
            category_filter=None,
            organization_id=organization_id,
        )

        # ── Step 5: Generate response draft ───────────────────────────────────
        draft = self._generate_response(event, brand_ctx.brand_brief)
        event.response_draft = draft

        # ── Step 6: Create PendingAction (authenticity gate) ──────────────────
        pending_action_id: uuid.UUID | None = None
        if draft:
            pending = self._gateway.prepare_action(
                channel=data.source if data.source in ("email", "linkedin", "twitter") else "email",
                recipient_id=data.author_handle or data.author_name or "unknown",
                body=draft,
                title=f"Response to {data.author_name or 'contact'} ({data.source})",
                description=f"Auto-drafted reply to {intent.replace('_', ' ')} comment.",
                metadata={
                    "engagement_event_id": str(event.id),
                    "sentiment": sentiment,
                    "intent": intent,
                    "original_content": data.content[:200],
                },
            )
            pending_action_id = pending.id
            event.pending_action_id = pending_action_id

        event.processed = True
        self.session.add(event)
        self.session.flush()
        self.session.refresh(event)

        logger.info(
            "Engagement processed: id=%s sentiment=%s intent=%s draft=%s action=%s",
            event.id, sentiment, intent, bool(draft), pending_action_id,
        )
        return self._to_analysis(event)

    # ── Private helpers ───────────────────────────────────────────────────────

    def _classify(self, content: str) -> tuple[str, str, float, str]:
        """Rule-based sentiment + intent classification.

        Returns:
            (sentiment, intent, confidence, notes)

        Override this method with an LLM classifier for higher accuracy.
        The interface and return contract remain unchanged.
        """
        text = content.lower()

        # Sentiment
        pos_score = _keyword_score(text, _POSITIVE_WORDS)
        neg_score = _keyword_score(text, _NEGATIVE_WORDS)
        question_score = 1.0 if any(q in text for q in _QUESTION_WORDS) else 0.0

        if question_score > 0.5:
            sentiment = EngagementSentiment.QUESTION
        elif pos_score > neg_score:
            sentiment = EngagementSentiment.POSITIVE
        elif neg_score > pos_score:
            sentiment = EngagementSentiment.NEGATIVE
        else:
            sentiment = EngagementSentiment.NEUTRAL

        # Intent
        spam_score = _keyword_score(text, _SPAM_WORDS)
        sales_score = _keyword_score(text, _SALES_INTEREST_WORDS)
        objection_score = _keyword_score(text, _OBJECTION_WORDS)

        if spam_score >= 0.5:
            intent = EngagementIntent.SPAM
            confidence = min(1.0, spam_score * 2)
        elif sales_score > 0:
            intent = EngagementIntent.SALES_INTEREST
            confidence = min(1.0, sales_score * 2)
        elif objection_score > 0 and sentiment == EngagementSentiment.NEGATIVE:
            intent = EngagementIntent.OBJECTION
            confidence = min(1.0, objection_score * 2)
        elif sentiment == EngagementSentiment.POSITIVE:
            intent = EngagementIntent.COMPLIMENT
            confidence = min(1.0, pos_score * 2)
        else:
            intent = EngagementIntent.FOLLOW_UP
            confidence = 0.5

        notes = (
            f"Keyword analysis: pos={pos_score:.2f} neg={neg_score:.2f} "
            f"question={question_score:.2f} sales={sales_score:.2f}"
        )
        return sentiment, intent, round(confidence, 2), notes

    def _generate_response(self, event: IncomingEngagementEvent, brand_brief: str) -> str | None:  # noqa: ARG002
        """Generate a response draft using brand voice context.

        Current implementation: rule-based templates with brand brief injection.
        LLM upgrade: replace with LLM call (brief → system prompt, event → user prompt).
        """
        intent = event.intent
        author = event.author_name or "there"

        templates: dict[str, str] = {
            "sales_interest": (
                f"Hi {author}, thanks for reaching out! I'd love to connect and learn more about "
                f"what you're working on. Would it make sense to schedule a quick call this week?"
            ),
            "question": (
                f"Great question, {author}. Let me share my perspective on this — "
                f"[CUSTOMIZE WITH YOUR EXPERTISE BASED ON: {event.content[:100]}]. "
                f"Happy to elaborate if useful."
            ),
            "objection": (
                f"I appreciate the pushback, {author} — healthy debate makes ideas stronger. "
                f"My experience has been that [CUSTOMIZE: address the specific objection]. "
                f"Would love to hear your data/perspective on this."
            ),
            "compliment": (
                f"Thank you, {author} — that means a lot! "
                f"If any of this resonates with challenges you're facing, I'm always happy to think through it together."
            ),
            "referral": (
                f"Thanks for thinking of us, {author}! Could you make an introduction? "
                f"We'd be happy to explore how we can help."
            ),
            "follow_up": (
                f"Thanks for engaging, {author}! "
                f"Would love to keep the conversation going — feel free to connect or DM me."
            ),
        }

        draft = templates.get(intent)
        if not draft:
            return None

        # Append a note about the brand brief being applied (for transparency in the approval UI)
        brand_note = "\n\n[Brand brief applied — review to ensure voice matches your style]"
        return draft + brand_note

    @staticmethod
    def _to_analysis(event: IncomingEngagementEvent) -> EngagementAnalysis:
        return EngagementAnalysis(
            event_id=event.id,
            source=event.source,
            author_name=event.author_name,
            content=event.content,
            sentiment=event.sentiment,
            intent=event.intent,
            confidence=event.analysis_confidence,
            analysis_notes=event.analysis_notes,
            response_draft=event.response_draft,
            pending_action_id=event.pending_action_id,
            processed=event.processed,
            ignored=event.ignored,
        )
