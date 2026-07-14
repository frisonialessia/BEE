"""DeadLetterQueue service — resilient retry with exponential backoff."""

from app.services.dead_letter.service import DeadLetterQueueService, register_retry_handler

__all__ = ["DeadLetterQueueService", "register_retry_handler"]
