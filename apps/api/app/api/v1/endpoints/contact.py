"""Public Contact page submission endpoint.

``POST /api/v1/contact`` is the write side of the public marketing site's
/contacto page. Unlike everything else in this API, the caller here is an
anonymous browser — no organization, no session, no API key (exempt via
``API_KEY_EXEMPT_PATHS``, see app.core.config). That makes it the one
endpoint in this codebase whose caller is genuinely untrusted by design,
so it gets its own light defenses instead of inheriting auth:

1. A honeypot field the form never shows a real visitor — a bot that
   fills every input trips it, and gets a fake-success response instead
   of a real write (never tell a bot it was caught; that just teaches it
   to route around the honeypot).
2. A small per-IP sliding-window limiter, reusing ``app.core.signup_guard.
   SignupGuard`` (its own Redis-backed-when-configured, process-local-
   otherwise namespace — independent quota from signup/password-reset,
   see that class's own docstring) rather than a fourth ad hoc copy of the
   same dict-of-timestamps logic this codebase had accumulated.

Every submission that passes those two checks is persisted, full stop —
see ContactSubmission's own docstring for why silently dropping a real
prospect's message here isn't an option this codebase gets to take.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session

from app.core.config import get_settings
from app.core.database import get_session
from app.core.logging import get_logger
from app.core.signup_guard import SignupGuard
from app.models.contact_submission import ContactSubmission
from app.schemas.contact import ContactSubmissionIn, ContactSubmissionOut

logger = get_logger(__name__)
router = APIRouter(prefix="/contact", tags=["Public Contact"])

_guard = SignupGuard(get_settings().CONTACT_RATE_LIMIT_PER_HOUR, redis_namespace="contact_form")


@router.post(
    "",
    response_model=ContactSubmissionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Submit the public Contact page form (no auth — public endpoint)",
)
def submit_contact(
    data: ContactSubmissionIn,
    request: Request,
    session: Session = Depends(get_session),
) -> ContactSubmissionOut:
    client_ip = request.client.host if request.client else "unknown"

    if data.honeypot:
        # A bot filled the field a real visitor never sees. Log it and
        # return a fake success — never persisted, never a 4xx that would
        # tell the bot what tripped it.
        logger.warning("Contact form honeypot triggered ip=%s", client_ip)
        return ContactSubmissionOut(id=uuid4(), created_at=datetime.now(UTC))

    if not _guard.try_consume(client_ip):
        logger.warning("Contact form rate limit hit ip=%s", client_ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados envíos desde esta conexión. Prueba de nuevo en un rato.",
        )

    submission = ContactSubmission(
        full_name=(data.full_name or "").strip() or None,
        email=data.email.strip().lower(),
        company_name=(data.company_name or "").strip() or None,
        phone=(data.phone or "").strip() or None,
        message=(data.message or "").strip() or None,
        source=data.source,
        ip_address=client_ip,
    )
    session.add(submission)
    session.commit()
    session.refresh(submission)

    logger.info("Contact submission received id=%s source=%s", submission.id, submission.source)

    # AFTER the commit, and never able to undo it. The row is the record; the
    # email is a convenience for whoever watches the inbox. Doing this the
    # other way round is precisely how "recuperar contraseña" ended up
    # reporting success to users while delivering nothing for weeks — a
    # notification path that can fail must never be able to take the data
    # with it. With WAITLIST_NOTIFY_EMAIL or SMTP unset this is a no-op and
    # the submission is still safely stored.
    _notify_new_submission(submission)

    return ContactSubmissionOut(id=submission.id, created_at=submission.created_at)


def _notify_new_submission(submission: ContactSubmission) -> None:
    """Best-effort "someone just signed up" email. Swallows everything."""
    settings = get_settings()
    recipient = settings.WAITLIST_NOTIFY_EMAIL
    if not recipient:
        return

    try:
        from app.services.omnichannel.interface import ChannelPayload
        from app.services.omnichannel.providers.email import EmailProvider

        who = submission.full_name or submission.email
        lines = [
            f"Email:    {submission.email}",
            f"Nombre:   {submission.full_name or '—'}",
            f"Empresa:  {submission.company_name or '—'}",
            f"Teléfono: {submission.phone or '—'}",
            f"Origen:   {submission.source or '—'}",
            f"Fecha:    {submission.created_at.isoformat()}",
        ]
        if submission.message:
            lines += ["", "Mensaje:", submission.message]

        result = EmailProvider().send(
            ChannelPayload(
                channel="email",
                recipient_id=recipient,
                subject=f"BEE — nuevo registro: {who}",
                body="\n".join(lines),
            )
        )
        if not result.success:
            # Warning, not an exception: the person is already stored.
            logger.warning("contact: notification email failed for id=%s: %s", submission.id, result.error)
    except Exception:  # noqa: BLE001 — a broken mailer must never lose a signup
        logger.exception("contact: notification email raised for id=%s", submission.id)
