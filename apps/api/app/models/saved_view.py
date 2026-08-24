"""SavedView — a named, reusable filter/sort configuration for a list page.

BEE's list pages (Leads, and eventually Opportunities/Companies) each grew
their own filter + sort + search state as local component state — useful
in the moment, gone the second you navigate away. This persists one: a rep
saves "hot leads I haven't touched, sorted by score" once and reopens it
with a click instead of re-building the same three filters every morning.

Deliberately page-agnostic: ``config`` is an opaque JSON blob whose shape
each frontend page defines and owns for itself (whatever local filter state
that page already has) — the backend never inspects it, so a new page can
adopt saved views with zero backend changes, and an existing page's filter
shape can evolve without a migration.
"""

import uuid
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class SavedView(TimestampMixin, table=True):
    """One saved filter/sort configuration for one list page."""

    __tablename__ = "saved_views"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )
    created_by_user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id", index=True)

    name: str = Field(nullable=False, max_length=200)
    # Which page this view belongs to — "leads", "opportunities", ... a
    # free-form string (not an enum) so a new page is just a new value,
    # never a migration.
    page: str = Field(nullable=False, index=True, max_length=64)
    config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    # False (default): only its creator sees it. True: visible to the whole
    # organization — e.g. a manager publishing "my team's at-risk queue" for
    # everyone to reuse.
    is_shared: bool = Field(default=False)
