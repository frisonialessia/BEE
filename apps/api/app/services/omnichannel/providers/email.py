"""EmailProvider — SMTP / SendGrid email channel.

Mock mode (default): returns a success result with mock=True and logs the
email payload. No real email is sent.

Live mode: configure ``EMAIL_SMTP_HOST``, ``EMAIL_SMTP_USER``,
``EMAIL_SMTP_PASSWORD``, and ``EMAIL_FROM_ADDRESS`` in ``.env``.
When all four are set, the provider uses Python's ``smtplib`` to send.
"""

from __future__ import annotations

from typing import Any

from app.core.logging import get_logger
from app.services.omnichannel.interface import (
    ChannelPayload,
    ChannelResult,
    IChannelProvider,
    RateLimit,
)

logger = get_logger(__name__)


class EmailProvider(IChannelProvider):
    """Send emails via SMTP (or mock when not configured)."""

    channel = "email"
    rate_limit = RateLimit(requests_per_day=500, requests_per_hour=50, min_interval_seconds=2.0)

    def is_configured(self) -> bool:
        from app.core.config import get_settings
        s = get_settings()
        return all([
            getattr(s, "EMAIL_SMTP_HOST", None),
            getattr(s, "EMAIL_FROM_ADDRESS", None),
        ])

    def check_auth(self) -> dict[str, Any]:
        configured = self.is_configured()
        return {
            "channel": self.channel,
            "authenticated": configured,
            "mock": not configured,
            "details": {"mode": "smtp" if configured else "mock"},
        }

    def send(self, payload: ChannelPayload) -> ChannelResult:
        if not self.is_configured():
            logger.info(
                "EmailProvider [MOCK]: to=%s subject=%s",
                payload.recipient_id,
                payload.subject,
            )
            return ChannelResult(
                channel=self.channel,
                success=True,
                message_id=f"mock-email-{payload.recipient_id[:8]}",
                mock=True,
                details={"to": payload.recipient_id, "subject": payload.subject},
            )

        try:
            import smtplib
            from email.mime.text import MIMEText

            from app.core.config import get_settings
            s = get_settings()

            msg = MIMEText(payload.body, "plain", "utf-8")
            msg["Subject"] = payload.subject or "(no subject)"
            msg["From"] = getattr(s, "EMAIL_FROM_ADDRESS", "bee@example.com")
            msg["To"] = payload.recipient_id

            with smtplib.SMTP(getattr(s, "EMAIL_SMTP_HOST", ""), getattr(s, "EMAIL_SMTP_PORT", 587)) as server:
                server.ehlo()
                server.starttls()
                server.login(
                    getattr(s, "EMAIL_SMTP_USER", ""),
                    getattr(s, "EMAIL_SMTP_PASSWORD", ""),
                )
                server.sendmail(msg["From"], [payload.recipient_id], msg.as_string())

            return ChannelResult(channel=self.channel, success=True, details={"to": payload.recipient_id})

        except Exception as exc:  # noqa: BLE001
            logger.exception("EmailProvider.send failed")
            return ChannelResult(channel=self.channel, success=False, error=str(exc))
