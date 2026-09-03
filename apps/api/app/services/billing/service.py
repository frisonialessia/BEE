"""Billing — Stripe Checkout/Customer Portal + webhook (scaffolding, not
enforcement).

BEE never asks a customer for a card number itself — Stripe Checkout and
the Customer Portal are Stripe-hosted pages this service only ever
generates a URL for, same "use a specialist instead of handling sensitive
data ourselves" reasoning app.services.sso already applies to WorkOS for
SAML/OIDC.

"Scaffolding, not enforcement" — read literally
------------------------------------------------
Nothing in this module, or anywhere else in this codebase, gates a
feature, a rate limit, or API access on Organization.plan or
stripe_subscription_status. This exists so a real subscription's state
can round-trip into BEE (an OWNER can start a checkout, Stripe's webhook
keeps stripe_subscription_status current) without every future pricing
decision having to first invent its own place to store that state. Adding
an actual paywall is a deliberate future decision, not a side effect of
this module existing.

Two independent gates, both open, before any of this does anything — same
contract as every other integration in this codebase (Sentry, OTEL,
WorkOS SSO): unset is inert, not an error state a deployment has to avoid.
1. Global: STRIPE_API_KEY set (see app.core.config).
2. Per-call: the organization must already have (or this call creates) a
   stripe_customer_id before a checkout/portal session can be opened.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.models.organization import Organization

logger = get_logger(__name__)

_API_BASE = "https://api.stripe.com/v1"
# Stripe rejects a webhook whose timestamp is further from "now" than
# this — bounds how long a captured request could be replayed.
_WEBHOOK_TOLERANCE_SECONDS = 300


class BillingError(Exception):
    """Raised whenever billing is unavailable or Stripe rejects a call —
    callers turn this into an HTTP error, never let a raw httpx/Stripe
    exception escape to the endpoint layer."""


@dataclass
class SubscriptionUpdate:
    """What a webhook event told BEE about one organization's Stripe
    subscription — see handle_webhook_event()."""

    stripe_customer_id: str
    stripe_subscription_id: str | None
    status: str | None


def is_configured() -> bool:
    return bool(settings.STRIPE_API_KEY)


def _auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.STRIPE_API_KEY}"}


def _post(path: str, data: dict[str, Any]) -> dict[str, Any]:
    try:
        resp = httpx.post(f"{_API_BASE}/{path}", headers=_auth_headers(), data=data, timeout=15.0)
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Stripe API call to %s failed: %s", path, exc)
        raise BillingError("Stripe rejected the request.") from exc
    return resp.json()


def get_or_create_customer_id(organization: Organization) -> str:
    """Reuses organization.stripe_customer_id if already set — callers are
    responsible for persisting the id this returns the first time (see
    app.api.v1.endpoints.billing, which does so inside the same request
    that calls this)."""
    if organization.stripe_customer_id:
        return organization.stripe_customer_id
    if not is_configured():
        raise BillingError("Billing isn't configured on this server (STRIPE_API_KEY is unset).")

    data = _post(
        "customers",
        {
            "name": organization.name,
            "metadata[organization_id]": str(organization.id),
        },
    )
    customer_id = data.get("id")
    if not customer_id:
        raise BillingError("Stripe didn't return a customer id.")
    return customer_id


def create_checkout_session(
    *, customer_id: str, price_id: str, success_url: str, cancel_url: str
) -> str:
    if not is_configured():
        raise BillingError("Billing isn't configured on this server.")
    data = _post(
        "checkout/sessions",
        {
            "customer": customer_id,
            "mode": "subscription",
            "line_items[0][price]": price_id,
            "line_items[0][quantity]": 1,
            "success_url": success_url,
            "cancel_url": cancel_url,
        },
    )
    url = data.get("url")
    if not url:
        raise BillingError("Stripe didn't return a Checkout URL.")
    return url


def create_portal_session(*, customer_id: str, return_url: str) -> str:
    if not is_configured():
        raise BillingError("Billing isn't configured on this server.")
    data = _post("billing_portal/sessions", {"customer": customer_id, "return_url": return_url})
    url = data.get("url")
    if not url:
        raise BillingError("Stripe didn't return a billing portal URL.")
    return url


def verify_webhook_signature(payload: bytes, sig_header: str) -> None:
    """Raises BillingError if the signature doesn't match — see Stripe's
    own documented format: ``Stripe-Signature: t=<timestamp>,v1=<sig>[,v1=<sig>...]``,
    where ``<sig>`` is HMAC-SHA256 of ``"<timestamp>.<payload>"`` keyed by
    STRIPE_WEBHOOK_SECRET. Manual verification (no stripe SDK dependency)
    to stay consistent with every other provider integration in this
    codebase (app.services.integrations.*_oauth), all of which speak
    their provider's REST API directly over httpx.
    """
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise BillingError("STRIPE_WEBHOOK_SECRET is unset — cannot verify this webhook.")

    parts = dict(item.split("=", 1) for item in sig_header.split(",") if "=" in item)
    timestamp = parts.get("t")
    signature = parts.get("v1")
    if not timestamp or not signature:
        raise BillingError("Malformed Stripe-Signature header.")

    if abs(time.time() - int(timestamp)) > _WEBHOOK_TOLERANCE_SECONDS:
        raise BillingError("Stripe webhook timestamp is outside the tolerance window.")

    signed_payload = f"{timestamp}.".encode() + payload
    expected = hmac.new(settings.STRIPE_WEBHOOK_SECRET.encode(), signed_payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise BillingError("Stripe webhook signature mismatch.")


def parse_subscription_event(event: dict[str, Any]) -> SubscriptionUpdate | None:
    """Returns None for any event type this codebase doesn't act on yet —
    the webhook endpoint's job is to accept everything Stripe sends
    (Stripe retries on non-2xx) and only extract state from the
    subscription lifecycle events that matter."""
    event_type = event.get("type", "")
    if not event_type.startswith("customer.subscription."):
        return None

    obj = event.get("data", {}).get("object", {})
    customer_id = obj.get("customer")
    if not customer_id:
        return None

    if event_type == "customer.subscription.deleted":
        return SubscriptionUpdate(stripe_customer_id=customer_id, stripe_subscription_id=obj.get("id"), status="canceled")

    return SubscriptionUpdate(
        stripe_customer_id=customer_id, stripe_subscription_id=obj.get("id"), status=obj.get("status")
    )
