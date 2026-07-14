"""OmnichannelGateway — abstract channel provider interface.

The Provider pattern ensures the OmnichannelGateway is never coupled to any
specific social/messaging API. New channels (WhatsApp, Slack, Telegram) are
added by implementing ``IChannelProvider`` and registering via
``@register_channel_provider``. The gateway, dispatcher, and all callers
remain unchanged.

Security contract
-----------------
``IChannelProvider.send()`` MUST NOT be called directly from business logic.
All outbound actions MUST go through ``OmnichannelGateway.prepare_action()``,
which creates a PendingAction for CEO approval first. The provider is only
called after the AgentOrchestrator transitions the action to APPROVED.

Rate limiting
-------------
Each provider exposes ``rate_limit`` describing its API constraints. The
gateway enforces these using a per-channel ``TokenBucket`` before dispatching.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ChannelPayload:
    """The send request prepared by the ChannelDispatcher.

    Carries all information a provider needs to send one message.
    """

    channel: str                        # "email" | "linkedin" | "twitter"
    recipient_id: str                   # email address, LinkedIn URN, Twitter @handle
    subject: str | None = None          # for email
    body: str = ""                      # main message content
    metadata: dict[str, Any] = field(default_factory=dict)  # channel-specific extras


@dataclass
class ChannelResult:
    """Result of a provider send() call."""

    channel: str
    success: bool
    message_id: str | None = None       # native ID from the platform (for threading)
    mock: bool = False                  # True = no real API call made
    error: str | None = None
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class RateLimit:
    """Rate limit configuration for a channel provider."""

    requests_per_day: int = 100         # Daily cap
    requests_per_hour: int = 20         # Hourly cap
    min_interval_seconds: float = 30.0  # Minimum seconds between sends


class IChannelProvider(ABC):
    """Abstract base for a channel integration provider.

    Implementations:
    * ``EmailProvider``    — SMTP / SendGrid (mock if no credentials)
    * ``LinkedInProvider`` — REST API v2 (mock if no credentials)
    * ``TwitterProvider``  — API v2 (mock if no credentials)
    """

    #: Unique channel name. Must be lowercase (matches strategy.channel values).
    channel: str = "base"

    #: Rate limit configuration for this channel.
    rate_limit: RateLimit = field(default_factory=RateLimit)  # type: ignore[misc]

    @abstractmethod
    def is_configured(self) -> bool:
        """Return True if this provider has valid credentials/configuration.

        When False, the provider MUST operate in mock mode — returning a
        successful ChannelResult with mock=True instead of making API calls.
        """
        raise NotImplementedError

    @abstractmethod
    def check_auth(self) -> dict[str, Any]:
        """Return a status dict for the authentication health check.

        Returns::

            {
                "channel": "linkedin",
                "authenticated": True | False,
                "mock": True | False,
                "details": {...},
            }
        """
        raise NotImplementedError

    @abstractmethod
    def send(self, payload: ChannelPayload) -> ChannelResult:
        """Send a message via this channel.

        MUST NOT be called directly from business logic — always via
        OmnichannelGateway which enforces the approval gate.

        Must NEVER raise exceptions. All errors must be captured in
        ``ChannelResult.error``.
        """
        raise NotImplementedError
