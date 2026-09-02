"""AuthService — organization signup, login, and credential verification.

The only way to create an :class:`~app.models.organization.Organization`
today is :meth:`register_organization` — it always creates exactly one
OWNER user alongside it. Every other user in that organization is created by
an existing OWNER/ADMIN via ``POST /api/v1/users`` (see
``app/api/v1/endpoints/users.py``), never through a public signup endpoint —
there is no self-serve "join an existing organization" flow yet.
"""

from __future__ import annotations

import re
from datetime import timedelta

from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.security import (
    generate_password_reset_token,
    hash_api_key,
    hash_password,
    verify_password,
)
from app.models.base import UserRole, utcnow
from app.models.organization import Organization
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.schemas.auth import OrganizationRegister

logger = get_logger(__name__)

_SLUG_INVALID_CHARS = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    slug = _SLUG_INVALID_CHARS.sub("-", name.lower()).strip("-")
    return slug or "org"


class AuthService:
    """Organization bootstrap + credential verification."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def register_organization(self, data: OrganizationRegister) -> tuple[Organization, User]:
        """Create a brand-new Organization and its first (OWNER) user.

        Raises:
            ValueError: the email is already registered anywhere in the system
                (emails are globally unique — a person's login identity isn't
                scoped per-organization) or the organization name can't be
                turned into a usable slug.
        """
        email = data.email.strip().lower()
        existing = self.session.exec(select(User).where(User.email == email)).first()
        if existing is not None:
            raise ValueError(f"Email '{email}' is already registered.")

        slug = self._unique_slug(data.organization_name)
        org = Organization(name=data.organization_name.strip(), slug=slug)
        self.session.add(org)
        self.session.flush()  # assign org.id without ending the transaction

        user = User(
            organization_id=org.id,
            email=email,
            hashed_password=hash_password(data.password),
            full_name=data.full_name.strip(),
            role=UserRole.OWNER,
        )
        self.session.add(user)
        self.session.flush()
        self.session.refresh(org)
        self.session.refresh(user)
        self.session.commit()

        logger.info("Organization registered: id=%s slug=%s owner=%s", org.id, org.slug, user.email)
        return org, user

    def authenticate(self, email: str, password: str) -> User | None:
        """Return the matching active User, or None if credentials are invalid.

        Deliberately returns ``None`` rather than distinguishing "no such
        user" from "wrong password" — that distinction is exactly the kind of
        detail that helps an attacker enumerate valid emails.
        """
        user = self.session.exec(
            select(User).where(User.email == email.strip().lower())
        ).first()
        if user is None or not user.is_active:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    def create_password_reset_token(self, email: str) -> tuple[User, str] | None:
        """Issue a reset token for the user with this email, if one exists.

        Returns ``(user, plaintext_token)``, or ``None`` when no active user
        matches — callers MUST treat both outcomes identically from the
        caller's point of view (send the same generic response either way).
        Distinguishing them in the HTTP response is exactly the email-
        enumeration leak :meth:`authenticate` already avoids for login.
        """
        user = self.session.exec(
            select(User).where(User.email == email.strip().lower())
        ).first()
        if user is None or not user.is_active:
            return None

        plaintext, token_hash = generate_password_reset_token()
        settings = get_settings()
        reset_token = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=utcnow() + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
        )
        self.session.add(reset_token)
        self.session.commit()

        logger.info("Password reset token issued: user_id=%s", user.id)
        return user, plaintext

    def reset_password(self, token: str, new_password: str) -> bool:
        """Redeem a reset token and set a new password.

        Returns ``False`` (never raises) for any invalid, expired, or
        already-used token, so the endpoint can return one generic 400
        without distinguishing which case it was — same anti-enumeration
        posture as the rest of this service.

        The expiry cutoff is pushed into the WHERE clause rather than
        fetched-then-compared in Python (``record.expires_at < utcnow()``) —
        that's exactly the offset-naive-vs-aware trap SQLite's plain
        DateTime columns round-trip into (a datetime written tz-aware comes
        back naive), same fix already applied in
        ``AccountResearchAgent``'s cache reads and
        ``MarketScanOrchestrator``'s due-company query.
        """
        token_hash = hash_api_key(token)
        record = self.session.exec(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used_at.is_(None),  # type: ignore[union-attr]
                PasswordResetToken.expires_at > utcnow(),
            )
        ).first()
        if record is None:
            return False

        user = self.session.get(User, record.user_id)
        if user is None or not user.is_active:
            return False

        user.hashed_password = hash_password(new_password)
        record.used_at = utcnow()
        self.session.add(user)
        self.session.add(record)
        self.session.commit()

        logger.info("Password reset completed: user_id=%s", user.id)
        return True

    def _unique_slug(self, organization_name: str) -> str:
        base = _slugify(organization_name)
        slug = base
        suffix = 1
        while self.session.exec(select(Organization).where(Organization.slug == slug)).first() is not None:
            suffix += 1
            slug = f"{base}-{suffix}"
        return slug
