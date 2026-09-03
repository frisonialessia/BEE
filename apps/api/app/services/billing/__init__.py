"""Billing service — see app.services.billing.service for the Stripe
integration and the "scaffolding, not enforcement" rationale."""

from app.services.billing.service import (
    BillingError,
    SubscriptionUpdate,
    create_checkout_session,
    create_portal_session,
    get_or_create_customer_id,
    is_configured,
    parse_subscription_event,
    verify_webhook_signature,
)

__all__ = [
    "BillingError",
    "SubscriptionUpdate",
    "create_checkout_session",
    "create_portal_session",
    "get_or_create_customer_id",
    "is_configured",
    "parse_subscription_event",
    "verify_webhook_signature",
]
