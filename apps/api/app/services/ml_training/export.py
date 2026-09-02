"""Fine-tuning dataset export — turns closed StrategyOutcome rows into a
JSONL file ready for OpenAI/Anthropic fine-tuning.

Why this exists
-----------------
``StrategyOutcome``'s own module docstring already calls this data "BEE's
competitive moat: a growing, labeled dataset of what strategies win in
which contexts, which future ML models can train on directly" —
``FeedbackLoopService`` already mines it for retrieval (success hints) and
``VectorKnowledgeBase`` for semantic search, but nothing turns it into an
actual fine-tuning file. This is that missing step: real, tested,
buildable code — not a call to any external fine-tuning API. Kicking off
an actual training run against the exported file is a deliberate human
decision (which base model, which hyperparameters, when the dataset is
big enough to be worth it) made through OpenAI's own fine-tuning
UI/API, not something this pipeline does on its own.

What "the prompt" means for a historical record
--------------------------------------------------
The real production prompt (``llm_prompt.build_user_prompt``) is built
from a full ``EnrichmentContext`` — success hints, market insights, dark
funnel score, warm intro paths, the CEO's brand voice, an active A/B
variant, all live at generation time. None of that survives on
``StrategyOutcome``, which denormalizes only a fixed analytics slice
(signal_type, industry, seniority, the final strategy_snapshot). Rebuilding
an "EnrichmentContext" from those few fields and feeding it through
``build_user_prompt`` would produce a prompt with every intelligence
section reading "no data" — technically running the same function, but
training the model to associate a rich, winning strategy with an
almost-empty context, which is actively worse than not training on it at
all. This module builds a smaller, honest prompt instead — signal type +
industry + seniority — documented here as a compact context summary, not
a byte-for-byte replay of the original request.

The system prompt IS reused verbatim from
``llm_prompt.build_system_prompt()``: unlike the user turn, nothing about
it depends on point-in-time context, so there is no reason to duplicate it.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from datetime import datetime
from typing import Literal

from sqlmodel import Session, select

from app.models.strategy_outcome import StrategyOutcome
from app.services.permissions import scope_by_organization_id
from app.services.strategy_generator.llm_prompt import build_system_prompt

# The StrategySchema fields that matter for fine-tuning — the actual
# battlecard content, not analytics bookkeeping (days_to_close, generator
# version, ...) that has nothing to do with what the model should learn to
# produce. Mirrors StrategySchema's own field set minus rationale/metadata.
_COMPLETION_FIELDS = (
    "pain_point",
    "closing_argument",
    "timing_window",
    "playbook",
    "next_best_action",
    "channel",
)


def _build_training_prompt(row: StrategyOutcome) -> str:
    """A compact context summary — see module docstring for why this is
    deliberately not a reconstruction of the original EnrichmentContext."""
    return (
        "=== SIGNAL ===\n"
        f"Type: {row.signal_type}\n\n"
        "=== COMPANY ===\n"
        f"Industry: {row.company_industry or 'Unknown'}\n\n"
        "=== LEAD ===\n"
        f"Seniority: {row.lead_seniority or 'Unknown'}\n\n"
        "=== YOUR TASK ===\n"
        "Generate a complete battlecard strategy for this opportunity.\n\n"
        "Return ONLY this JSON object (no markdown, no explanation):\n"
        "{\n"
        '  "pain_point": "...",\n'
        '  "closing_argument": "...",\n'
        '  "timing_window": {"urgency": "immediate|this_week|this_month|watch", '
        '"reason": "...", "expires_at": "YYYY-MM-DD or null"},\n'
        '  "playbook": "...",\n'
        '  "next_best_action": "...",\n'
        '  "channel": "email|linkedin|warm_intro|phone"\n'
        "}"
    )


def _build_training_completion(row: StrategyOutcome) -> dict[str, object] | None:
    """The assistant turn — sourced from ``strategy_snapshot`` (the actual
    strategy that produced this outcome). Returns ``None`` when the
    snapshot is missing the two mandatory battlecard fields (see
    ``StrategySchema.is_battlecard_complete``) — an incomplete snapshot
    was never a real strategy the model should learn to imitate."""
    snapshot = row.strategy_snapshot or {}
    if not snapshot.get("pain_point") or not snapshot.get("closing_argument"):
        return None
    return {field: snapshot.get(field) for field in _COMPLETION_FIELDS}


def export_strategy_outcomes_jsonl(
    session: Session,
    *,
    organization_id: uuid.UUID | None = None,
    outcome: Literal["won", "lost"] | None = "won",
    since: datetime | None = None,
    limit: int | None = None,
) -> Iterator[str]:
    """Yield one JSONL line per eligible closed ``StrategyOutcome`` —
    OpenAI chat fine-tuning format
    (``{"messages": [{"role": ...}, ...]}``).

    ``outcome="won"`` (the default) is deliberate, not merely a filter
    convenience: a LOST strategy is exactly what the model should NOT
    learn to reproduce — training on it would need a fundamentally
    different label (e.g. contrastive pairs), which this pipeline doesn't
    attempt. Pass ``outcome=None`` only for analysis, not for building a
    training file to actually fine-tune on.

    ``organization_id`` scopes to one tenant's own history — the same
    ``scope_by_organization_id`` boundary every other cross-account query
    in this codebase respects; ``None`` (the default) reads the
    untagged/shared pool, same convention as everywhere else this helper
    is used.

    Rows whose ``strategy_snapshot`` doesn't clear
    :func:`_build_training_completion`'s completeness bar are silently
    skipped — not every closed deal has a usable snapshot (see that
    function's docstring), and skipping is the correct behavior for an
    export, not an error.
    """
    statement = select(StrategyOutcome)
    if outcome is not None:
        statement = statement.where(StrategyOutcome.outcome == outcome)
    if since is not None:
        statement = statement.where(StrategyOutcome.closed_at >= since)
    statement = scope_by_organization_id(
        statement, StrategyOutcome.organization_id, organization_id
    )
    statement = statement.order_by(StrategyOutcome.closed_at.desc())  # type: ignore[attr-defined]
    if limit is not None:
        statement = statement.limit(limit)

    system_prompt = build_system_prompt()
    for row in session.exec(statement):
        completion = _build_training_completion(row)
        if completion is None:
            continue
        example = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": _build_training_prompt(row)},
                {
                    "role": "assistant",
                    "content": json.dumps(completion, ensure_ascii=False),
                },
            ]
        }
        yield json.dumps(example, ensure_ascii=False)
