"""Quota — a revenue target for a rep or a team over a period.

Territory management piggybacks on the existing ``Team`` hierarchy (a team
already IS a group of reps under a manager — a "West Coast" or "Enterprise"
team serves the same purpose a separate Territory model would, without a
second parallel concept to keep in sync) rather than inventing a new
territory-with-assignment-rules model this MVP doesn't need yet.

Exactly one of ``user_id`` / ``team_id`` is set: a quota belongs to one rep
OR one team, never both — enforced at the API layer (see
app.api.v1.endpoints.quotas), not the DB, to keep the model itself simple.
"""

import uuid
from datetime import date

from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class Quota(TimestampMixin, table=True):
    """A target amount for one rep or one team over one period."""

    __tablename__ = "quotas"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )
    user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id", index=True)
    team_id: uuid.UUID | None = Field(default=None, foreign_key="teams.id", index=True)

    period_start: date = Field(nullable=False, index=True)
    period_end: date = Field(nullable=False)
    target_amount: float = Field(nullable=False)
