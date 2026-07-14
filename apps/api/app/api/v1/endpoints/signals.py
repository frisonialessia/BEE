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
from sqlmodel import Session

from app.api.deps import get_signal_engine
from app.core.database import get_session
from app.core.logging import get_logger
from app.core.security import verify_webhook_signature
from app.repositories.signal import SignalRepository
from app.schemas.signal import (
    OpportunityOut,
    SignalIngestResult,
    SignalOut,
    SignalWebhookIn,
)
from app.services.signal_engine import SignalEngine

logger = get_logger(__name__)

router = APIRouter(prefix="/signals", tags=["Signal Engine"])


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
) -> SignalIngestResult:
    """Receive, verify, and process an inbound market signal.

    Integrations POST a JSON envelope (see :class:`SignalWebhookIn`). The request
    is authenticated via an HMAC signature in the ``X-BEE-Signature`` header
    (enforced in production), then handed to the Signal Engine which classifies,
    scores, persists, and — when warranted — turns it into an opportunity.

    We read and verify the *raw* body before parsing so the signature is computed
    over exactly the bytes the sender signed.
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
    outcome = engine.ingest(payload)

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
) -> list[SignalOut]:
    """Return a page of signals, most recent first."""
    repo = SignalRepository(session)
    return [SignalOut.model_validate(s) for s in repo.list(limit=limit, offset=offset)]


@router.get(
    "/{signal_id}",
    response_model=SignalOut,
    summary="Fetch a single signal by id",
)
def get_signal(
    signal_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> SignalOut:
    """Return one signal or ``404`` if it does not exist."""
    repo = SignalRepository(session)
    signal = repo.get(signal_id)
    if signal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signal not found.")
    return SignalOut.model_validate(signal)
