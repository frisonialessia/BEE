"""AutopilotConfig — per-organization guardrails for autonomous execution.

Every outbound action in BEE goes through PendingAction's PENDING_APPROVAL
gate today (see that model's own docstring: "There is no shortcut: the
state machine enforces human approval for every outbound interaction" —
though it also anticipates exactly this feature: "a human (**or an
explicitly-authorized automation**) executes"). This is that explicit
authorization, scoped per-organization and OFF by default: nothing about
existing behavior changes until an org owner deliberately opts in.

When enabled, OmnichannelGateway.prepare_action() (the single choke point
every outbound action already goes through) consults
AutopilotGuardrailService.evaluate() before setting a PendingAction's
initial status. The PendingAction row is ALWAYS created either way — this
never skips the audit trail or the state machine, only how much of it a
human has to walk through by hand for a specific, already-vetted case:
confidence above a configured bar, the account not on the exclusion list,
and the content free of any hard-blocked word.
"""

from __future__ import annotations

import uuid

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class AutopilotConfig(TimestampMixin, table=True):
    """One organization's autonomous-execution guardrails. One row per org."""

    __tablename__ = "autopilot_configs"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    organization_id: uuid.UUID = Field(
        foreign_key="organizations.id", unique=True, index=True, nullable=False
    )

    # Hard off by default — this is the first auto-execute path in the
    # codebase; every other opt-in/expensive feature here (ACCOUNT_RESEARCH_
    # ENABLED, MARKET_SCAN_ENABLED) follows the same "ships complete, starts
    # off" convention.
    enabled: bool = Field(default=False, nullable=False)

    # Only opportunities with strategy.confidence_score at or above this bar
    # are eligible for auto-approval. 0.9 is deliberately more conservative
    # than ObservabilityService's 0.80 manual_review_required bar — that
    # threshold decides "does a human need to LOOK at this", this one
    # decides "can a human SKIP looking at this", a strictly higher bar.
    confidence_threshold: float = Field(default=0.9, nullable=False)

    # Company IDs (as strings — JSON has no native UUID type) that must
    # never be auto-approved regardless of confidence — "cuentas protegidas"
    # always fall back to PENDING_APPROVAL.
    excluded_company_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON))

    # Hard-blocked words/phrases — if the outbound content contains any of
    # these (case-insensitive substring match), auto-approval is refused
    # regardless of confidence. Distinct from VoiceProfile.forbidden_phrases
    # (a style preference the LLM is asked, not forced, to avoid) — this is
    # enforced in code, not just prompted for.
    forbidden_words: list[str] = Field(default_factory=list, sa_column=Column(JSON))
