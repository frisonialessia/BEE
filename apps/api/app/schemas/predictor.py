"""Schemas for the ResourcePredictorService."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ResourcePrediction(BaseModel):
    """Impact assessment of confirming an opportunity as WON.

    Returned by ``ResourcePredictorService.predict()`` before the WON state
    is committed. Used to warn the CEO about operational requirements and
    optionally block confirmation when risk is too high.

    Frontend contract
    -----------------
    Show this as a pre-confirmation dialog when ``risk_level`` is MEDIUM or HIGH.
    The CEO can proceed by clicking "I acknowledge" or abort. Only when
    ``blocks_confirmation = True`` (STRICT mode + HIGH risk) is the API blocked.
    """

    risk_level: Literal["low", "medium", "high"]
    capacity_impact_score: float = Field(
        ge=0.0,
        le=100.0,
        description="0-100 score of how much operational capacity this deal consumes.",
    )
    # Specific concerns detected by the rule engine.
    warnings: list[str] = Field(default_factory=list)
    # Concrete steps the team must take post-confirmation.
    recommended_actions: list[str] = Field(default_factory=list)
    # True only when STRICT mode is enabled AND risk is HIGH.
    blocks_confirmation: bool = False
    # Human-readable summary for the confirmation dialog.
    summary: str = ""

    @property
    def is_actionable(self) -> bool:
        return self.risk_level in ("medium", "high")


class OutcomeWithPrediction(BaseModel):
    """Extended outcome response that includes the resource prediction."""

    opportunity_id: str
    outcome: str
    loss_reason: str | None = None
    competitor: str | None = None
    closed_at: str
    message: str = "Outcome recorded"
    already_recorded: bool = False
    resource_prediction: ResourcePrediction | None = None
    workflow_tasks_dispatched: int = 0
