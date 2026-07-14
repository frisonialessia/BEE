"""Webhook emitter for ExecutiveAgent events.

When artifacts are generated, BEE fires a POST request to a configurable
``WEBHOOK_EXECUTION_URL``. External tools (n8n, Zapier, Make, custom services)
receive the full ``ArtifactEventPayload`` and can act on it:

* Send the email via SMTP / SendGrid / Resend
* Create a CRM task in HubSpot / Salesforce
* Post a Slack notification to the rep
* Book a calendar invite via Calendly
* Trigger an automated follow-up sequence

Design principles
-----------------
* **Fire-and-forget**: the webhook call is non-blocking. A timeout or error never
  prevents the artifacts from being returned to the frontend.
* **Configurable**: the URL comes from ``settings.webhook_execution_url`` so it
  can be changed without code changes.
* **HMAC-signed**: the payload is signed with ``settings.webhook_secret`` so
  receivers can verify BEE is the sender (same pattern as the inbound webhook).
* **Extensible**: replace the HTTP call with a message-queue push (Redis, SQS)
  by swapping this module — the ``ExecutiveAgent`` depends only on the
  ``emit_event`` function signature.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime

logger = logging.getLogger(__name__)

# Lazy import to avoid heavy httpx at startup when webhook is not configured.
try:
    import httpx
    _HTTPX_AVAILABLE = True
except ImportError:  # pragma: no cover
    _HTTPX_AVAILABLE = False


def emit_event(payload_dict: dict, *, webhook_url: str, secret: str | None = None) -> bool:
    """POST a JSON payload to the webhook URL.

    Returns ``True`` on 2xx, ``False`` on any error (logged but not raised).

    Args:
        payload_dict: The serializable event payload (from ``ArtifactEventPayload``).
        webhook_url:  Target URL (n8n / Zapier / custom endpoint).
        secret:       Optional HMAC-SHA256 signing secret.  When provided, a
                      ``X-BEE-Signature`` header is added so receivers can verify
                      authenticity.
    """
    if not _HTTPX_AVAILABLE:
        logger.warning("httpx not installed — webhook emission skipped.")
        return False

    body = json.dumps(payload_dict, default=str).encode()
    headers: dict[str, str] = {
        "Content-Type": "application/json",
        "X-BEE-Event": "artifacts.generated",
        "X-BEE-Timestamp": datetime.now(UTC).isoformat(),
    }

    if secret:
        sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        headers["X-BEE-Signature"] = f"sha256={sig}"

    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(webhook_url, content=body, headers=headers)
            resp.raise_for_status()
            logger.info("Webhook delivered to %s (status=%d)", webhook_url, resp.status_code)
            return True
    except Exception as exc:
        logger.warning("Webhook delivery failed for %s: %s", webhook_url, exc)
        return False
