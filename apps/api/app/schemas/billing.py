"""Schemas for billing (Stripe scaffolding) — see app.services.billing and
app.api.v1.endpoints.billing."""

from __future__ import annotations

from pydantic import BaseModel, Field


class BillingStatusOut(BaseModel):
    plan: str
    stripe_customer_id: str | None
    stripe_subscription_id: str | None
    stripe_subscription_status: str | None
    # Whether STRIPE_API_KEY is set server-wide — mirrors
    # SSOConfigOut.globally_configured's reasoning: an OWNER can look at
    # this and understand why "Start checkout" doesn't work yet, without
    # BEE having to expose whether the *secret itself* is set anywhere else.
    globally_configured: bool


class CheckoutSessionIn(BaseModel):
    # Not defaulted to a BEE-chosen plan — this is scaffolding for
    # whatever pricing gets designed later, not a live pricing page today.
    price_id: str = Field(min_length=1, max_length=255)
    success_url: str = Field(min_length=1, max_length=2000)
    cancel_url: str = Field(min_length=1, max_length=2000)


class CheckoutSessionOut(BaseModel):
    url: str


class PortalSessionIn(BaseModel):
    return_url: str = Field(min_length=1, max_length=2000)


class PortalSessionOut(BaseModel):
    url: str
