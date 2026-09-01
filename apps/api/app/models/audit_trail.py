"""AuditTrailService models — agent decision snapshots for full observability.

Every significant decision made by a BEE agent is recorded as an ``AuditEntry``
with a complete snapshot of:

1. **Context snapshot**: The ``EnrichmentContext`` fields that informed the decision
   (signal type, company, lead, psychographic style, dark funnel score, intro paths,
   market insights, A/B variant, success hints).

2. **Market data used**: The specific market intelligence records referenced
   (MarketInsight IDs, SuccessHint IDs, TacticVariant ID, DarkFunnelScore).

3. **Strategy reasoning**: A structured explanation of WHY the agent produced
   its output — playbook chosen, channel rationale, timing justification.

4. **Output snapshot**: What was generated (StrategySchema, ArtifactBundle,
   adapted content) for complete before/after comparison.

5. **Confidence score**: The AI observability score (0.0–1.0). Entries with
   ``confidence_score < 0.8`` automatically set ``manual_review_required=True``
   so the CEO can audit borderline decisions.

Query patterns
--------------
* ``GET /api/v1/audit/decisions?agent_type=executive_agent`` — browse by agent
* ``GET /api/v1/audit/decisions?opportunity_id=X`` — all decisions for an opportunity
* ``GET /api/v1/audit/decisions?manual_review_required=true`` — low-confidence decisions
* ``GET /api/v1/audit/decisions/{id}`` — full snapshot (potentially large JSON)

Storage note
------------
``context_snapshot`` and ``output_snapshot`` are JSON blobs that can be large
(full strategy + artifacts). For MVP they live in Postgres. For scale, move to
an object store (S3/GCS) and store only the key reference here.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class AgentType(str):
    """The BEE agent that made this decision."""

    SIGNAL_ENGINE = "signal_engine"
    STRATEGY_GENERATOR = "strategy_generator"
    EXECUTIVE_AGENT = "executive_agent"
    AGENT_ORCHESTRATOR = "agent_orchestrator"
    SMART_ENGAGEMENT = "smart_engagement"
    PSYCHOGRAPHIC_ANALYZER = "psychographic_analyzer"
    DARK_FUNNEL = "dark_funnel"
    TREND_ANALYST = "trend_analyst"
    WORKFLOW_ORCHESTRATOR = "workflow_orchestrator"


class DecisionType(str):
    """What kind of decision was made."""

    SIGNAL_CLASSIFIED = "signal_classified"
    STRATEGY_GENERATED = "strategy_generated"
    ARTIFACT_CREATED = "artifact_created"
    CONTENT_ADAPTED = "content_adapted"         # PsychographicAnalyzer
    DISC_CLASSIFIED = "disc_classified"          # DISC profile created
    ACTION_APPROVED = "action_approved"
    ACTION_REJECTED = "action_rejected"
    ENGAGEMENT_CLASSIFIED = "engagement_classified"
    HOT_LEAD_DETECTED = "hot_lead_detected"
    INTRO_PATH_FOUND = "intro_path_found"
    MARKET_INSIGHT_APPLIED = "market_insight_applied"
    VARIANT_ASSIGNED = "variant_assigned"        # A/B test arm assignment
    REVIEW_FLAGGED = "review_flagged"            # confidence_score < 0.8
    GENERATOR_DEMOTED = "generator_demoted"      # skipped in favor of the next generator — see
                                                  # StrategyGeneratorService._run_generators and
                                                  # AuditTrailService.generator_approval_rate


class AuditEntry(TimestampMixin, table=True):
    """A single agent decision record with full context + output snapshot.

    Created by ``AuditTrailService.record_decision()`` at every significant
    agent decision point. Immutable once created — never updated after insert.
    """

    __tablename__ = "audit_entries"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # Tenant boundary. Nullable for backward compatibility — see
    # app.models.organization's docstring.
    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )

    # ── Decision identity ─────────────────────────────────────────────────────
    agent_type: str = Field(index=True, description="Which BEE agent made this decision")
    decision_type: str = Field(index=True, description="Category of decision")
    session_id: str | None = Field(
        default=None,
        index=True,
        description="Groups related decisions in one processing chain (e.g. one signal ingestion run)",
    )

    # ── Traceability ──────────────────────────────────────────────────────────
    opportunity_id: uuid.UUID | None = Field(default=None, index=True)
    lead_id: uuid.UUID | None = Field(default=None, index=True)
    signal_id: uuid.UUID | None = Field(default=None, index=True)
    pending_action_id: uuid.UUID | None = Field(default=None, index=True)

    # ── Context snapshot (what information the agent had) ─────────────────────
    # Subset of EnrichmentContext fields serialised to JSON.
    context_snapshot: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description=(
            "Snapshot of the EnrichmentContext used for this decision: "
            "signal_type, company, lead, psychographic_style, dark_funnel_score, "
            "intro_paths_count, success_hints_count, market_insights_count, active_variant."
        ),
    )

    # ── Market data used (traceability for intelligence sources) ───────────────
    market_data_used: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description=(
            "IDs and summaries of the market intelligence records that influenced this decision: "
            "market_insight_ids, success_hint_ids, tactic_variant_id, dark_funnel_score."
        ),
    )

    # ── Strategy reasoning (WHY the decision was made) ────────────────────────
    strategy_reasoning: str | None = Field(
        default=None,
        description=(
            "Natural-language explanation of the decision logic: "
            "playbook chosen, channel rationale, timing justification, "
            "DISC tone adaptation applied, warm intro detected."
        ),
    )

    # ── Output snapshot (WHAT was generated) ──────────────────────────────────
    output_snapshot: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Serialised output of the agent: StrategySchema, ArtifactBundle, or adapted content.",
    )

    # ── AI Observability ──────────────────────────────────────────────────────
    confidence_score: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        index=True,
        description="Confidence in the decision (0.0–1.0). < 0.8 triggers manual review flag.",
    )
    manual_review_required: bool = Field(
        default=False,
        index=True,
        description="True when confidence_score < 0.8. CEO must review before execution.",
    )

    # ── Processing time ───────────────────────────────────────────────────────
    processing_ms: int | None = Field(
        default=None,
        description="Time taken to produce this decision in milliseconds.",
    )

    # ── Generator metadata ────────────────────────────────────────────────────
    generator_name: str | None = Field(default=None, description="Which generator/classifier produced this output")
    generator_version: str | None = Field(default=None, description="Version tag of the generator")
