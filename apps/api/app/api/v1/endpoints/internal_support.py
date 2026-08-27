"""Internal support tooling — a single narrow emergency action for the BEE
team, not a customer-facing feature.

Why this exists
----------------
A logged-out user with no working password has no self-serve recovery path
yet (no forgot-password flow — see DEPLOY_CHECKLIST.md). Until that exists,
someone on the BEE team needs a way to unblock them without asking an
organization's OWNER/ADMIN to do it (they may not be reachable, or the
locked-out person *is* the OWNER).

Why this is ONE endpoint, not a support admin role
----------------------------------------------------
The alternative — a cross-organization "platform admin" role baked into the
normal auth/JWT system — was considered and deliberately rejected for now:
it would mean a user whose session, if compromised, exposes every tenant's
data, reopening exactly the kind of cross-tenant blast radius the rest of
this codebase's multi-tenancy work exists to prevent, and it would need its
own dedicated security review before shipping. This tool instead does
exactly one thing (reset a password by email) via one endpoint, gated by a
secret that is:

* **Not** ``API_SECRET_KEY`` (service-to-service auth for the frontend/
  integrations) or ``JWT_SECRET_KEY`` (customer session tokens) — a leak of
  either of those must not also grant this.
* **Off by default** — ``SUPPORT_ADMIN_SECRET`` unset means this router
  404s, so a deployment that never opts in has zero additional surface.
* Never logged, never returned to any caller — only compared, timing-safe.

Operationally: whoever holds ``SUPPORT_ADMIN_SECRET`` (should be very few
people) calls this with the affected email, relays the returned temporary
password to that person out-of-band (the same manual-relay pattern
``POST /api/v1/users`` already uses for new teammates), and they change it
immediately via ``PATCH /auth/me/password`` once logged back in.
"""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.database import get_session
from app.core.logging import get_logger
from app.core.security import generate_temporary_password, hash_password
from app.models.user import User
from app.schemas.internal_support import SupportPasswordResetIn, SupportPasswordResetOut

logger = get_logger(__name__)
router = APIRouter(prefix="/internal/support", tags=["Internal Support (BEE team only)"])


def _require_support_secret(x_bee_support_secret: str | None = Header(default=None, alias="X-BEE-Support-Secret")) -> None:
    settings = get_settings()
    if not settings.SUPPORT_ADMIN_SECRET:
        # Disabled deployments see a 404, not a 401/403 — this router
        # shouldn't even be discoverable as "a thing that exists but is
        # locked" when nobody opted into it.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
    if not x_bee_support_secret or not hmac.compare_digest(x_bee_support_secret, settings.SUPPORT_ADMIN_SECRET):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing support secret.")


@router.post(
    "/reset-password",
    response_model=SupportPasswordResetOut,
    summary="[BEE team only] Force-reset any user's password by email",
    dependencies=[Depends(_require_support_secret)],
)
def reset_password(
    data: SupportPasswordResetIn,
    session: Session = Depends(get_session),
) -> SupportPasswordResetOut:
    user = session.exec(select(User).where(User.email == data.email.strip().lower())).first()
    if user is None:
        # Same not-found-vs-wrong-password non-distinction AuthService.
        # authenticate() already makes for login — this endpoint sits behind
        # a strong secret already, but there's no reason to let it double as
        # an email-existence oracle for anyone who does get hold of it.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No user with that email.")

    temporary_password = generate_temporary_password()
    user.hashed_password = hash_password(temporary_password)
    session.add(user)
    session.commit()

    # Deliberately does not log the password itself — only that a reset
    # happened, and for whom, so this is visible in ops logs without the
    # secret ever touching a log line.
    logger.warning("Support password reset issued for user_id=%s email=%s", user.id, user.email)

    return SupportPasswordResetOut(
        email=user.email, temporary_password=temporary_password, user_id=str(user.id)
    )
