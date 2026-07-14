"""LinkedInProvider — LinkedIn messaging and connection request channel.

Mock mode (default): simulates a successful send with ``mock=True``.
Live mode: configure ``LINKEDIN_ACCESS_TOKEN`` in ``.env``.

LinkedIn API constraints
------------------------
* Connections: max 100 requests/week (enforced by rate_limit).
* Messages: only to 1st-degree connections (enforced at dispatch).
* Rate limiting: the gateway TokenBucket enforces ``requests_per_day=20``.

All actions go through PENDING_APPROVAL in AgentOrchestrator — the CEO
reviews and approves before any LinkedIn interaction is triggered.
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


class LinkedInProvider(IChannelProvider):
    """LinkedIn messaging and connection channel."""

    channel = "linkedin"
    rate_limit = RateLimit(requests_per_day=20, requests_per_hour=5, min_interval_seconds=60.0)

    def is_configured(self) -> bool:
        from app.core.config import get_settings
        return bool(getattr(get_settings(), "LINKEDIN_ACCESS_TOKEN", None))

    def check_auth(self) -> dict[str, Any]:
        configured = self.is_configured()
        return {
            "channel": self.channel,
            "authenticated": configured,
            "mock": not configured,
            "details": {"mode": "api_v2" if configured else "mock", "weekly_limit": 100},
        }

    def send(self, payload: ChannelPayload) -> ChannelResult:
        if not self.is_configured():
            logger.info(
                "LinkedInProvider [MOCK]: to=%s action=%s",
                payload.recipient_id,
                payload.metadata.get("action_type", "message"),
            )
            return ChannelResult(
                channel=self.channel,
                success=True,
                message_id=f"mock-li-{payload.recipient_id[:8]}",
                mock=True,
                details={
                    "to": payload.recipient_id,
                    "action": payload.metadata.get("action_type", "message"),
                    "note": "Set LINKEDIN_ACCESS_TOKEN to activate live LinkedIn integration",
                },
            )

        try:
            import httpx

            from app.core.config import get_settings
            token = getattr(get_settings(), "LINKEDIN_ACCESS_TOKEN", "")
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

            action = payload.metadata.get("action_type", "message")
            if action == "connection_request":
                body = {
                    "invitee": {"com.linkedin.voyager.growth.invitation.InviteeProfile": {"profileId": payload.recipient_id}},
                    "message": {"body": payload.body},
                }
                resp = httpx.post("https://api.linkedin.com/v2/invitations", headers=headers, json=body, timeout=10)
            else:
                body = {"recipients": {"values": [{"person": {"_path": f"/people/{payload.recipient_id}"}}]}, "subject": payload.subject or "", "body": payload.body}
                resp = httpx.post("https://api.linkedin.com/v2/messages", headers=headers, json=body, timeout=10)

            resp.raise_for_status()
            return ChannelResult(channel=self.channel, success=True, message_id=str(resp.headers.get("x-li-format")), details={"status_code": resp.status_code})

        except Exception as exc:  # noqa: BLE001
            logger.exception("LinkedInProvider.send failed")
            return ChannelResult(channel=self.channel, success=False, error=str(exc))
