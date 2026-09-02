"""On-demand fine-tuning dataset export.

``GET /organizations/ml-training/export.jsonl`` streams every eligible
closed ``StrategyOutcome`` for the caller's organization as OpenAI-chat
fine-tuning-format JSONL — see
``app.services.ml_training.export_strategy_outcomes_jsonl`` for the
pipeline and exactly what "eligible" means.

OWNER-only, same stricter bar as Autopilot/Federated Intelligence: this is
closed-deal content (the actual pain points and closing arguments that won
real deals) across the *whole* organization, not a single opportunity a
rep already has visibility into.

Deliberately does not call any fine-tuning API itself — this hands an
operator a file to inspect and upload manually via OpenAI's own
fine-tuning UI/API when they decide the dataset is big enough and the
timing is right. That decision (which base model, hyperparameters, when)
is a human one this endpoint doesn't make for them.
"""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.api.deps import require_roles
from app.core.database import get_session
from app.models.base import UserRole
from app.models.user import User
from app.services.ml_training import export_strategy_outcomes_jsonl

router = APIRouter(prefix="/organizations/ml-training", tags=["ML Training Export"])


@router.get(
    "/export.jsonl",
    summary="Export closed-deal strategies as fine-tuning JSONL (OWNER only)",
)
def export_jsonl(
    only_won: bool = Query(
        default=True,
        description=(
            "Only WON outcomes (the actual training signal — see "
            "export_strategy_outcomes_jsonl's docstring for why LOST is "
            "never included here). Kept True unless explicitly overridden."
        ),
    ),
    current_user: User = Depends(require_roles(UserRole.OWNER)),
    session: Session = Depends(get_session),
) -> StreamingResponse:
    lines = export_strategy_outcomes_jsonl(
        session,
        organization_id=current_user.organization_id,
        outcome="won" if only_won else None,
    )

    def _stream() -> Iterator[str]:
        for line in lines:
            yield line + "\n"

    return StreamingResponse(
        _stream(),
        media_type="application/jsonl",
        headers={"Content-Disposition": "attachment; filename=bee-strategy-finetune.jsonl"},
    )
