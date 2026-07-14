"""OmnichannelGateway — the unified channel dispatch layer.

Architecture
------------
The gateway sits between BEE's content generation (ExecutiveAgent,
SmartEngagementEngine) and the actual channel APIs (LinkedIn, Email, X).

It enforces two critical guarantees:

1. **Approval gate**: ``prepare_action()`` ALWAYS creates a PendingAction
   (PENDING_APPROVAL) before any content is dispatched. The CEO must
   explicitly approve before anything is sent publicly.

2. **Rate limiting**: ``TokenBucket.consume()`` ensures no channel is hit
   faster than its API allows. When the bucket is empty, the action is
   queued but not dropped — it's still recorded as a PendingAction.

Dispatcher
----------
``ChannelDispatcher`` maps an ``ExecutionArtifact`` to the correct
``IChannelProvider`` based on the strategy's ``channel`` field. If the
requested channel has no registered provider, it falls back to email.

Extending
---------
1. Implement ``IChannelProvider``
2. Register: ``gateway.register_provider(MyProvider())``
3. Done. All routing is automatic via the ``channel`` field.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

from sqlmodel import Session

from app.core.logging import get_logger
from app.models.base import ActionStatus, ActionType
from app.services.omnichannel.interface import ChannelPayload, ChannelResult, IChannelProvider

logger = get_logger(__name__)


class TokenBucket:
    """Simple token-bucket rate limiter (per channel, per process).

    Thread-safe for single-threaded async FastAPI.
    Resets hourly and daily based on wall-clock time.
    """

    def __init__(self, requests_per_hour: int, min_interval_seconds: float) -> None:
        self._capacity = requests_per_hour
        self._tokens = requests_per_hour
        self._min_interval = min_interval_seconds
        self._last_call_ts: float = 0.0
        self._window_start: float = time.monotonic()

    def can_send(self) -> bool:
        """Return True if a request can be dispatched now."""
        now = time.monotonic()
        # Refill hourly
        if now - self._window_start >= 3600:
            self._tokens = self._capacity
            self._window_start = now
        # Minimum interval check
        if now - self._last_call_ts < self._min_interval:
            return False
        return self._tokens > 0

    def consume(self) -> bool:
        """Consume one token. Returns False if rate-limited."""
        if not self.can_send():
            return False
        self._tokens -= 1
        self._last_call_ts = time.monotonic()
        return True

    @property
    def tokens_remaining(self) -> int:
        return max(0, self._tokens)


class OmnichannelGateway:
    """Unified channel dispatcher with approval gate and rate limiting.

    Providers are registered at startup. The gateway never imports provider
    classes directly — it works through the ``IChannelProvider`` interface.
    """

    def __init__(self, session: Session) -> None:
        self.session = session
        self._providers: dict[str, IChannelProvider] = {}
        self._buckets: dict[str, TokenBucket] = {}
        self._register_defaults()

    def register_provider(self, provider: IChannelProvider) -> None:
        """Register a channel provider and initialise its rate limiter."""
        self._providers[provider.channel] = provider
        self._buckets[provider.channel] = TokenBucket(
            requests_per_hour=provider.rate_limit.requests_per_hour,
            min_interval_seconds=provider.rate_limit.min_interval_seconds,
        )
        logger.debug("Registered channel provider: %s", provider.channel)

    def _register_defaults(self) -> None:
        from app.services.omnichannel.providers.email import EmailProvider
        from app.services.omnichannel.providers.linkedin import LinkedInProvider
        from app.services.omnichannel.providers.twitter import TwitterProvider

        for provider in [EmailProvider(), LinkedInProvider(), TwitterProvider()]:
            self.register_provider(provider)

    # ── Core public API ───────────────────────────────────────────────────────

    def prepare_action(
        self,
        channel: str,
        recipient_id: str,
        body: str,
        title: str,
        description: str | None = None,
        subject: str | None = None,
        opportunity_id: uuid.UUID | None = None,
        metadata: dict[str, Any] | None = None,
        priority: int = 5,
    ) -> Any:
        """Create a PendingAction for CEO approval.

        This is the ONLY way business logic should initiate an outbound
        message. The PendingAction holds the full payload and stays in
        PENDING_APPROVAL until the CEO clicks "Approve" in the dashboard.

        Args:
            channel:        Target channel ("email" | "linkedin" | "twitter")
            recipient_id:   Email address / LinkedIn URN / Twitter @handle
            body:           The message body
            title:          Action title shown in the approval UI
            description:    Optional longer description
            subject:        Email subject (for email channel)
            opportunity_id: Link to the opportunity this relates to
            metadata:       Extra channel-specific data
            priority:       1-10 priority (1 = highest)

        Returns:
            A PendingAction DB object.
        """
        from app.models.pending_action import PendingAction

        provider = self._providers.get(channel)
        channel_meta = {
            "channel": channel,
            "recipient_id": recipient_id,
            "subject": subject,
            "rate_limited": not (provider and self._buckets.get(channel, TokenBucket(10, 1)).can_send()),
            **(metadata or {}),
        }

        action_type = self._map_channel_to_action_type(channel)

        pending = PendingAction(
            opportunity_id=opportunity_id,
            action_type=action_type,
            status=ActionStatus.PENDING_APPROVAL,
            title=title,
            description=description or body[:200],
            preview=body[:500],
            payload={
                "channel": channel,
                "recipient_id": recipient_id,
                "subject": subject,
                "body": body,
                **channel_meta,
            },
            priority=priority,
            generator="omnichannel_gateway",
        )
        self.session.add(pending)
        self.session.flush()
        self.session.refresh(pending)

        logger.info(
            "PendingAction created for channel=%s recipient=%s priority=%d action_id=%s",
            channel, recipient_id, priority, pending.id,
        )
        return pending

    def dispatch_approved(self, pending_action: Any) -> ChannelResult:
        """Execute a previously APPROVED PendingAction by sending via the channel.

        Called by the AgentOrchestrator after CEO approval.
        Enforces rate limits — returns a rate-limited result if bucket is empty.
        """
        payload_data = pending_action.payload or {}
        channel = payload_data.get("channel", "email")
        provider = self._providers.get(channel)

        if not provider:
            return ChannelResult(
                channel=channel,
                success=False,
                error=f"No provider registered for channel '{channel}'",
            )

        bucket = self._buckets.get(channel)
        if bucket and not bucket.consume():
            logger.warning(
                "Rate limited on channel=%s action_id=%s", channel, pending_action.id
            )
            return ChannelResult(
                channel=channel,
                success=False,
                error=f"Rate limited: channel {channel} bucket empty. Retry later.",
                details={"tokens_remaining": bucket.tokens_remaining},
            )

        payload = ChannelPayload(
            channel=channel,
            recipient_id=payload_data.get("recipient_id", ""),
            subject=payload_data.get("subject"),
            body=payload_data.get("body", ""),
            metadata=payload_data,
        )
        result = provider.send(payload)
        logger.info(
            "Channel dispatch: channel=%s success=%s mock=%s action_id=%s",
            channel, result.success, result.mock, pending_action.id,
        )
        return result

    def get_channel_status(self) -> list[dict[str, Any]]:
        """Return auth and rate-limit status for all registered channels."""
        result = []
        for channel, provider in self._providers.items():
            bucket = self._buckets.get(channel)
            auth = provider.check_auth()
            result.append({
                **auth,
                "tokens_remaining": bucket.tokens_remaining if bucket else None,
                "rate_limit": {
                    "requests_per_day": provider.rate_limit.requests_per_day,
                    "requests_per_hour": provider.rate_limit.requests_per_hour,
                    "min_interval_seconds": provider.rate_limit.min_interval_seconds,
                },
            })
        return result

    @staticmethod
    def _map_channel_to_action_type(channel: str) -> str:
        return {
            "email": ActionType.SEND_EMAIL,
            "linkedin": ActionType.LINKEDIN_MESSAGE,
            "twitter": ActionType.WEBHOOK_CALL,
        }.get(channel, ActionType.WEBHOOK_CALL)


class ChannelDispatcher:
    """Decides which channel to use for a given artifact and strategy.

    The dispatcher reads ``artifact.channel`` (set by the StrategyGeneratorService)
    and routes to the correct provider via the OmnichannelGateway.
    """

    def __init__(self, gateway: OmnichannelGateway) -> None:
        self.gateway = gateway

    def dispatch(
        self,
        artifact_type: str,
        channel: str,
        recipient_id: str,
        body: str,
        title: str,
        subject: str | None = None,
        opportunity_id: uuid.UUID | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Any:
        """Route an artifact to the correct channel, creating a PendingAction.

        The ChannelDispatcher is the bridge between BEE's strategy layer
        (which knows WHAT to say) and the OmnichannelGateway (which knows
        HOW to deliver it).
        """
        if channel not in self.gateway._providers:
            logger.warning("Channel '%s' not registered, falling back to email", channel)
            channel = "email"

        return self.gateway.prepare_action(
            channel=channel,
            recipient_id=recipient_id,
            body=body,
            title=title,
            subject=subject or f"[BEE] {artifact_type} via {channel}",
            opportunity_id=opportunity_id,
            metadata={"artifact_type": artifact_type, **(metadata or {})},
        )
