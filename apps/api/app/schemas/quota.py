"""Schemas for rep/team revenue quotas."""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, model_validator


class QuotaCreateIn(BaseModel):
    """Exactly one of user_id/team_id must be set — a quota belongs to one
    rep or one team, never both and never neither."""

    user_id: uuid.UUID | None = None
    team_id: uuid.UUID | None = None
    period_start: date
    period_end: date
    target_amount: float = Field(gt=0)

    @model_validator(mode="after")
    def _exactly_one_owner(self) -> "QuotaCreateIn":
        if (self.user_id is None) == (self.team_id is None):
            raise ValueError("Set exactly one of user_id or team_id, not both or neither.")
        if self.period_end < self.period_start:
            raise ValueError("period_end must not be before period_start.")
        return self


class QuotaUpdateIn(BaseModel):
    """Partial update — only the target/period can change; re-create the
    quota to move it to a different rep/team instead of reassigning owner."""

    period_start: date | None = None
    period_end: date | None = None
    target_amount: float | None = Field(default=None, gt=0)


class QuotaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID | None
    team_id: uuid.UUID | None
    period_start: date
    period_end: date
    target_amount: float
