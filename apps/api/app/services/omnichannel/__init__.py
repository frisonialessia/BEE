"""OmnichannelGateway — unified multi-channel dispatch with approval gate and rate limiting."""

from app.services.omnichannel.gateway import ChannelDispatcher, OmnichannelGateway, TokenBucket
from app.services.omnichannel.interface import ChannelPayload, ChannelResult, IChannelProvider

__all__ = [
    "OmnichannelGateway",
    "ChannelDispatcher",
    "TokenBucket",
    "IChannelProvider",
    "ChannelPayload",
    "ChannelResult",
]
