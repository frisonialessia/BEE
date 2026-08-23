"""Signal Engine endpoints (Motor de Señales).

Exposes the inbound webhook that external integrations use to push market
signals into BEE, plus read endpoints to inspect ingested signals.

The endpoints are intentionally thin: they handle HTTP concerns (auth, status
codes, serialization) and delegate all business logic to :class:`SignalEngine`.
This separation keeps the transport layer swappable and the domain logic
independently testable.
"""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlmodel import Session, or_, select

from app.api.deps import get_current_user_optional, get_organization_from_api_key, get_signal_engine
from app.core.database import get_session
from app.core.logging import get_logger
from app.core.security import verify_webhook_signature
from app.models.base import BehavioralEventType, OpportunityStatus, SignalSource, SignalType
from app.models.opportunity import Opportunity
from app.models.signal import Signal
from app.models.user import User
from app.repositories.signal import SignalRepository
from app.schemas.behavioral import EVENT_INTENT_SCORES, BuyingIntentEvent, IntentEventResult
from app.schemas.signal import (
    CompanyRef,
    LeadRef,
    OpportunityOut,
    SignalIngestResult,
    SignalOut,
    SignalWebhookIn,
)
from app.services.permissions import scope_to_organization
from app.services.signal_engine import SignalEngine

logger = get_logger(__name__)

router = APIRouter(prefix="/signals", tags=["Signal Engine"])


def _needs_external_enrichment(payload: SignalWebhookIn) -> bool:
    """Return True when async external enrichment would add value."""
    lead = payload.lead
    if lead is None:
        return True
    return not lead.title or not lead.linkedin_url or not lead.seniority


@router.post(
    "/webhook",
    response_model=SignalIngestResult,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest a market signal via webhook (Motor de Señales)",
)
async def ingest_signal_webhook(
    request: Request,
    x_bee_signature: str | None = Header(default=None, alias="X-BEE-Signature"),
    engine: SignalEngine = Depends(get_signal_engine),
    organization_id: uuid.UUID | None = Depends(get_organization_from_api_key),
) -> SignalIngestResult:
    """Receive, verify, and process an inbound market signal.

    Integrations POST a JSON envelope (see :class:`SignalWebhookIn`). The request
    is authenticated via an HMAC signature in the ``X-BEE-Signature`` header
    (enforced in production), then handed to the Signal Engine which classifies,
    scores, persists, and — when warranted — turns it into an opportunity.

    We read and verify the *raw* body before parsing so the signature is computed
    over exactly the bytes the sender signed.

    An optional ``X-BEE-Org-Key`` header (see
    ``app.api.deps.get_organization_from_api_key``) identifies which
    organization this data belongs to. Without one, everything created stays
    untagged/globally visible — the same behavior as before organization API
    keys existed.
    """
    raw_body = await request.body()

    # 1. Authenticate the sender.
    if not verify_webhook_signature(raw_body, x_bee_signature):
        logger.warning("Rejected webhook with invalid or missing signature.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing webhook signature.",
        )

    # 2. Parse + validate the envelope.
    try:
        payload = SignalWebhookIn.model_validate(json.loads(raw_body))
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Body is not valid JSON."
        ) from exc
    except ValueError as exc:  # pydantic ValidationError is a ValueError subclass
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    # 3. Delegate to the engine.
    outcome = engine.ingest(payload, organization_id=organization_id)

    # 4. Queue async LinkedIn enrichment when lead profile is incomplete
    if (
        not outcome.deduplicated
        and outcome.opportunity is not None
        and _needs_external_enrichment(payload)
    ):
        from app.core.config import get_settings
        from app.services.external_api.worker import (
            IngestionTask,
            IngestionTaskType,
            get_ingestion_worker,
        )

        if get_settings().EXTERNAL_INGESTION_ENABLED:
            worker = get_ingestion_worker()
            await worker.enqueue(
                IngestionTask(
                    task_type=IngestionTaskType.SIGNAL_ENRICHMENT,
                    provider="linkedin",
                    signal_id=str(outcome.signal.id),
                    opportunity_id=str(outcome.opportunity.id),
                    payload=payload.model_dump(mode="json"),
                )
            )

    message = (
        "Signal already ingested (deduplicated)"
        if outcome.deduplicated
        else "Signal ingested"
    )
    return SignalIngestResult(
        signal=SignalOut.model_validate(outcome.signal),
        opportunity=(
            None
            if outcome.opportunity is None
            else OpportunityOut.model_validate(outcome.opportunity)
        ),
        analyzers_applied=outcome.analyzers_applied,
        strategy_enriched=outcome.strategy_enriched,
        message=message,
    )


@router.get(
    "",
    response_model=list[SignalOut],
    summary="List recently ingested signals",
)
def list_signals(
    limit: int = 50,
    offset: int = 0,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> list[SignalOut]:
    """Return a page of signals, most recent first.

    Signals aren't assigned to an individual rep (they're shared market
    intelligence within an organization), so — unlike leads/opportunities —
    this scopes by organization only, not by user: every role sees the same
    signals. Unauthenticated/API-key-only requests are unrestricted, same
    backward-compatibility contract as ``GET /opportunities``.
    """
    statement = select(Signal).order_by(Signal.created_at.desc())  # type: ignore[union-attr]
    statement = scope_to_organization(statement, Signal.organization_id, current_user)
    statement = statement.limit(limit).offset(offset)
    return [SignalOut.model_validate(s) for s in session.exec(statement).all()]


@router.get(
    "/{signal_id}",
    response_model=SignalOut,
    summary="Fetch a single signal by id",
)
def get_signal(
    signal_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> SignalOut:
    """Return one signal or ``404`` if it does not exist (or belongs to
    another organization when the caller is authenticated).
    """
    repo = SignalRepository(session)
    signal = repo.get(signal_id)
    if signal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signal not found.")
    if (
        current_user is not None
        and signal.organization_id is not None
        and signal.organization_id != current_user.organization_id
    ):
        # 404, not 403 — don't confirm a cross-tenant signal id exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signal not found.")
    return SignalOut.model_validate(signal)


@router.post(
    "/intent",
    response_model=IntentEventResult,
    status_code=status.HTTP_201_CREATED,
    summary="BehavioralCollector — record a buying-intent event",
)
def ingest_intent_event(
    event: BuyingIntentEvent,
    engine: SignalEngine = Depends(get_signal_engine),
    session: Session = Depends(get_session),
    organization_id: uuid.UUID | None = Depends(get_organization_from_api_key),
) -> IntentEventResult:
    """Process a buying-intent behavioral event from a tracked lead.

    This is the BehavioralCollector endpoint. It:

    1. Computes a baseline intent score from the event type.
    2. Creates an ENGAGEMENT signal via the standard SignalEngine (so all
       analyzers and the StrategyGeneratorService run normally).
    3. If an open opportunity exists for this lead/company, it hot-flags the
       strategy (``hot_lead: true``, urgency bumped to ``immediate``) so the
       CEO dashboard surfaces the lead with a "🔥 HOT" badge.

    Typical callers: website tracker, product analytics, marketing automation —
    same optional ``X-BEE-Org-Key`` header as ``/signals/webhook`` when the
    tracker is scoped to a specific organization's site.
    """
    # Build a synthetic signal payload from the intent event.
    score = EVENT_INTENT_SCORES.get(event.event_type, 50.0)

    # Boost score for high-value pages and long sessions.
    if event.session_duration_seconds and event.session_duration_seconds > 120:
        score = min(100.0, score + 5.0)
    if event.visit_count and event.visit_count >= 3:
        score = min(100.0, score + 8.0)

    event_labels = {
        BehavioralEventType.PRICING_VIEW: "viewed pricing page",
        BehavioralEventType.DEMO_REQUEST: "requested a demo",
        BehavioralEventType.PRODUCT_TRIAL: "started a product trial",
        BehavioralEventType.RESOURCE_DOWNLOAD: f"downloaded '{event.resource_name or 'resource'}'",
        BehavioralEventType.WEBINAR_ATTENDANCE: f"attended '{event.resource_name or 'webinar'}'",
        BehavioralEventType.REPEAT_VISIT: f"visited {event.visit_count or '3+'} times",
        BehavioralEventType.CASE_STUDY_VIEW: "viewed a case study",
        BehavioralEventType.PAGE_VISIT: f"visited {event.page_url or 'a tracked page'}",
    }
    label = event_labels.get(event.event_type, str(event.event_type.value))

    company_ref = CompanyRef(domain=event.company_domain) if event.company_domain else None
    lead_ref = LeadRef(email=event.lead_email) if event.lead_email else None

    signal_payload = SignalWebhookIn(
        title=f"Buying intent: {label}",
        event="behavioral.intent",
        description=(
            f"Lead {event.lead_email or 'unknown'} "
            f"from {event.company_domain or 'unknown'} {label}."
        ),
        signal_type=SignalType.ENGAGEMENT,
        source=SignalSource.BEHAVIORAL,
        company=company_ref,
        lead=lead_ref,
        data={
            "intent_score": score,
            "event_type": event.event_type.value,
            "page_url": event.page_url,
            "resource_name": event.resource_name,
            "session_duration_seconds": event.session_duration_seconds,
            "visit_count": event.visit_count,
            **event.metadata,
        },
    )

    outcome = engine.ingest(signal_payload, organization_id=organization_id)

    # ── Hot-lead flagging ──────────────────────────────────────────────────
    # If this lead/company has an existing open opportunity, update its
    # strategy to mark it as hot. This surfaces immediately on the dashboard.
    hot_lead = False
    hot_opportunity_id: str | None = None

    if score >= 70.0:
        # Find the most recent non-closed opportunity for this company/lead.
        stmt = (
            select(Opportunity)
            .where(
                Opportunity.status.notin_(  # type: ignore[attr-defined]
                    [OpportunityStatus.WON, OpportunityStatus.LOST, OpportunityStatus.DISMISSED]
                )
            )
            .order_by(Opportunity.created_at.desc())
            .limit(1)
        )
        if organization_id is not None:
            stmt = stmt.where(
                or_(Opportunity.organization_id == organization_id, Opportunity.organization_id.is_(None))
            )
        if outcome.opportunity and outcome.opportunity.company_id:
            stmt = stmt.where(Opportunity.company_id == outcome.opportunity.company_id)
        elif outcome.opportunity and outcome.opportunity.lead_id:
            stmt = stmt.where(Opportunity.lead_id == outcome.opportunity.lead_id)
        else:
            stmt = None  # type: ignore[assignment]

        if stmt is not None:
            existing_opp = session.exec(stmt).first()
            if existing_opp:
                strat = dict(existing_opp.strategy or {})
                strat["hot_lead"] = True
                # Bump urgency to immediate when lead is clearly hot.
                if "timing_window" in strat:
                    strat["timing_window"]["urgency"] = "immediate"
                    strat["timing_window"]["hot_lead_reason"] = (
                        f"Lead {label} — high-intent behavioral signal detected."
                    )
                existing_opp.strategy = strat
                session.add(existing_opp)
                session.commit()
                hot_lead = True
                hot_opportunity_id = str(existing_opp.id)
                logger.info(
                    "HOT LEAD: opportunity %s flagged (event=%s score=%.0f)",
                    existing_opp.id, event.event_type.value, score,
                )

    return IntentEventResult(
        signal_id=str(outcome.signal.id),
        opportunity_id=hot_opportunity_id or (str(outcome.opportunity.id) if outcome.opportunity else None),
        hot_lead=hot_lead,
        score=score,
        message=(
            f"Intent event '{event.event_type.value}' processed. "
            + ("Lead flagged as HOT 🔥" if hot_lead else "Signal ingested.")
        ),
    )
