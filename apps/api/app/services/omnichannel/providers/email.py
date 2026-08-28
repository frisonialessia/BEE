"""EmailProvider — Gmail (per-organization) / SMTP (server-wide) / mock.

Three tiers, tried in order by ``send()``:

1. **Connected Gmail** — when the gateway found a connected Gmail account
   for this action's organization, ``payload.metadata`` carries
   ``gmail_access_token``/``gmail_from_address`` (see
   OmnichannelGateway.dispatch_approved) and the email goes out via the
   Gmail API, from that rep's real inbox.
2. **Server SMTP** — configure ``EMAIL_SMTP_HOST``, ``EMAIL_SMTP_USER``,
   ``EMAIL_SMTP_PASSWORD``, and ``EMAIL_FROM_ADDRESS`` in ``.env``. Used
   when no organization has connected Gmail (or this org hasn't).
3. **Mock** (default): returns a success result with mock=True and logs the
   email payload. No real email is sent.
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
        gmail_token = payload.metadata.get("gmail_access_token")
        gmail_from = payload.metadata.get("gmail_from_address")
        if gmail_token and gmail_from:
            from app.services.integrations import gmail_oauth
            from app.services.integrations.gmail_oauth import GmailOAuthError

            try:
                message_id = gmail_oauth.send_email(
                    access_token=gmail_token,
                    from_address=gmail_from,
                    to=payload.recipient_id,
                    subject=payload.subject or "(no subject)",
                    body=payload.body,
                )
                return ChannelResult(
                    channel=self.channel,
                    success=True,
                    message_id=message_id,
                    details={"to": payload.recipient_id, "via": "gmail", "from": gmail_from},
                )
            except GmailOAuthError as exc:
                logger.warning("EmailProvider: Gmail send failed, not falling back to SMTP: %s", exc)
                return ChannelResult(channel=self.channel, success=False, error=str(exc))

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
