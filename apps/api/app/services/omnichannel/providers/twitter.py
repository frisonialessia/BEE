"""TwitterProvider — X (Twitter) DM and reply channel.

Mock mode (default): simulates a successful send with ``mock=True``.
Live mode: configure ``TWITTER_BEARER_TOKEN`` and ``TWITTER_API_KEY`` in ``.env``.

All actions go through PENDING_APPROVAL in AgentOrchestrator.
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


class TwitterProvider(IChannelProvider):
    """X (Twitter) DM and reply channel."""

    channel = "twitter"
    rate_limit = RateLimit(requests_per_day=50, requests_per_hour=10, min_interval_seconds=30.0)

    def is_configured(self) -> bool:
        from app.core.config import get_settings
        return bool(getattr(get_settings(), "TWITTER_BEARER_TOKEN", None))

    def check_auth(self) -> dict[str, Any]:
        configured = self.is_configured()
        return {
            "channel": self.channel,
            "authenticated": configured,
            "mock": not configured,
            "details": {"mode": "api_v2" if configured else "mock", "daily_limit": 50},
        }

    def send(self, payload: ChannelPayload) -> ChannelResult:
        if not self.is_configured():
            logger.info(
                "TwitterProvider [MOCK]: to=%s body_len=%d",
                payload.recipient_id,
                len(payload.body),
            )
            return ChannelResult(
                channel=self.channel,
                success=True,
                message_id=f"mock-tw-{payload.recipient_id[:8]}",
                mock=True,
                details={
                    "to": payload.recipient_id,
                    "body_preview": payload.body[:60],
                    "note": "Set TWITTER_BEARER_TOKEN to activate live Twitter integration",
                },
            )

        try:
            import httpx

            from app.core.config import get_settings
            s = get_settings()
            token = getattr(s, "TWITTER_BEARER_TOKEN", "")
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

            action = payload.metadata.get("action_type", "dm")
            if action == "dm":
                body = {"dm_conversation_id": payload.recipient_id, "text": payload.body}
                resp = httpx.post("https://api.twitter.com/2/dm_conversations/messages", headers=headers, json=body, timeout=10)
            else:
                body = {"text": payload.body, "reply": {"in_reply_to_tweet_id": payload.recipient_id}}
                resp = httpx.post("https://api.twitter.com/2/tweets", headers=headers, json=body, timeout=10)

            resp.raise_for_status()
            data = resp.json()
            return ChannelResult(channel=self.channel, success=True, message_id=data.get("data", {}).get("id"), details={"status_code": resp.status_code})

        except Exception as exc:  # noqa: BLE001
            logger.exception("TwitterProvider.send failed")
            return ChannelResult(channel=self.channel, success=False, error=str(exc))
