"""PasswordResetToken — self-serve "forgot password" credential.

Until this existed, the only way to recover a lost password was
``POST /api/v1/internal/support/reset-password`` — an emergency, BEE-team-only
tool gated by ``SUPPORT_ADMIN_SECRET`` (see that endpoint's docstring). That's
deliberately not customer-facing, which meant every real customer who forgot
their password needed a human at BEE to intervene. This table backs the
actual self-serve flow: ``POST /auth/forgot-password`` issues one of these,
``POST /auth/reset-password`` redeems it.

Same show-once-never-stored contract as :class:`OrganizationApiKey` — only
the SHA-256 hash of the token is persisted (see
``app.core.security.hash_api_key``, reused here rather than duplicated: the
token is already high-entropy and machine-generated, same shape as an API
key, not a user-chosen secret that would need bcrypt). A database leak alone
can't be replayed as a usable reset link.
"""

import uuid
from datetime import datetime

from sqlmodel import Field

from app.models.base import TimestampMixin, new_uuid


class PasswordResetToken(TimestampMixin, table=True):
    """A single-use, time-limited credential for resetting one user's password."""

    __tablename__ = "password_reset_tokens"

    id: uuid.UUID = Field(default_factory=new_uuid, primary_key=True, index=True)

    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, nullable=False)
    token_hash: str = Field(unique=True, index=True, nullable=False)

    expires_at: datetime = Field(nullable=False)
    # Set the moment the token is redeemed — a token is valid only while this
    # is None AND expires_at is in the future. Kept (not deleted) after use so
    # a replayed link fails loudly in logs instead of just "not found".
    used_at: datetime | None = Field(default=None)
