"""OpportunityTask — a follow-up reminder scoped to one opportunity.

Not to be confused with ``WorkflowTask`` (an orchestrator-dispatched action
triggered by an event, e.g. "send CRM update on opportunity.won"). This is
the opposite: something a *rep* sets for themselves — "call back Thursday",
"send the proposal after the demo" — and checks off by hand. BEE already
suggests what to do next via ``strategy.next_best_action``, but that's a
regenerated recommendation, not a durable, personal to-do a rep can track.
"""

import uuid
from datetime import datetime

from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class OpportunityTask(TimestampMixin, table=True):
    """A follow-up reminder for one opportunity."""

    __tablename__ = "opportunity_tasks"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    # Tenant boundary — same nullable-for-legacy convention as every other
    # org-scoped model in this codebase.
    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )
    opportunity_id: uuid.UUID = Field(foreign_key="opportunities.id", index=True, nullable=False)
    # Defaults to the opportunity's own assigned rep at creation time (set by
    # the endpoint, not here) — but stays independently editable since a
    # follow-up can be handed off without reassigning the whole opportunity.
    assigned_to_user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id", index=True)
    created_by_user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id")

    title: str = Field(nullable=False, max_length=300)
    due_at: datetime | None = Field(default=None, index=True)
    # Null while open. Set once, on completion — a task is either done or
    # it isn't; there's no separate "status" enum to keep in sync with this.
    completed_at: datetime | None = Field(default=None)
