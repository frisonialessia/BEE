"""Real-time notifications — see app.services.realtime.service."""

from app.services.realtime.service import notification_channel, publish_notification

__all__ = ["publish_notification", "notification_channel"]
