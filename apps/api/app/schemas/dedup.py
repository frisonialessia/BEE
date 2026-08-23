"""Schemas for duplicate detection and merging (companies + leads).

Both entities dedup on a different natural key (company: normalized domain;
lead: normalized email), so this module defines one pair of
group/merge-request schemas generic enough for either, rather than two
near-identical copies.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel

from app.schemas.company import CompanyOut
from app.schemas.lead import LeadOut


class CompanyDuplicateGroup(BaseModel):
    """A set of companies that look like the same real-world account."""

    key: str  # the normalized domain (or name, when no domain exists) they share
    companies: list[CompanyOut]


class LeadDuplicateGroup(BaseModel):
    """A set of leads that share the same normalized email."""

    key: str
    leads: list[LeadOut]


class MergeIn(BaseModel):
    """Fold ``merge_id`` into ``keep_id``: every record pointing at
    ``merge_id`` is repointed to ``keep_id``, then ``merge_id`` is deleted.
    Which one is "keep" is the caller's call — usually the one with more
    activity or the earlier-created record."""

    keep_id: uuid.UUID
    merge_id: uuid.UUID
