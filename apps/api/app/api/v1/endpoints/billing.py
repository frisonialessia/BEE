"""Billing (Stripe scaffolding, not enforcement) — see
app.services.billing's module docstring for the full contract.

GET /billing: read-only status (OWNER/ADMIN) — mirrors GET /organizations/me/sso.
POST /billing/checkout-session, POST /billing/portal-session: OWNER only,
same authority level as everything else that touches how the organization
pays or authenticates.
POST /billing/webhook: public, Stripe-signature-verified — the one place
Stripe itself calls into BEE. Exempt from API-key auth for the same
reason /webhooks/receive is (see that endpoint's own module docstring):
an external system can't send a header only the frontend bundle knows
about.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlmodel import Session, select

from app.api.deps import require_roles
from app.core.database import get_session
from app.core.logging import get_logger
from app.models.base import UserRole
from app.models.organization import Organization
from app.models.user import User
from app.schemas.billing import (
    BillingStatusOut,
    CheckoutSessionIn,
    CheckoutSessionOut,
    PortalSessionIn,
    PortalSessionOut,
)
from app.services.billing import (
    BillingError,
    create_checkout_session,
    create_portal_session,
    get_or_create_customer_id,
    parse_subscription_event,
    verify_webhook_signature,
)
from app.services.billing import (
    is_configured as billing_is_configured,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/billing", tags=["Billing"])


@router.get("", response_model=BillingStatusOut, summary="This organization's billing status")
def get_billing_status(
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> BillingStatusOut:
    org = current_user.organization
    return BillingStatusOut(
        plan=org.plan,
        stripe_customer_id=org.stripe_customer_id,
        stripe_subscription_id=org.stripe_subscription_id,
        stripe_subscription_status=org.stripe_subscription_status,
        globally_configured=billing_is_configured(),
    )


@router.post(
    "/checkout-session",
    response_model=CheckoutSessionOut,
    summary="Start a Stripe Checkout session for this organization (OWNER only)",
)
def start_checkout_session(
    data: CheckoutSessionIn,
    current_user: User = Depends(require_roles(UserRole.OWNER)),
    session: Session = Depends(get_session),
) -> CheckoutSessionOut:
    org = current_user.organization
    try:
        customer_id = get_or_create_customer_id(org)
        if customer_id != org.stripe_customer_id:
            org.stripe_customer_id = customer_id
            session.add(org)
            session.commit()
        url = create_checkout_session(
            customer_id=customer_id,
            price_id=data.price_id,
            success_url=data.success_url,
            cancel_url=data.cancel_url,
        )
    except BillingError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return CheckoutSessionOut(url=url)


@router.post(
    "/portal-session",
    response_model=PortalSessionOut,
    summary="Open the Stripe Customer Portal for this organization (OWNER only)",
)
def start_portal_session(
    data: PortalSessionIn,
    current_user: User = Depends(require_roles(UserRole.OWNER)),
) -> PortalSessionOut:
    org = current_user.organization
    if not org.stripe_customer_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Stripe customer on record for this organization yet — start a checkout session first.",
        )
    try:
        url = create_portal_session(customer_id=org.stripe_customer_id, return_url=data.return_url)
    except BillingError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return PortalSessionOut(url=url)


@router.post("/webhook", include_in_schema=False, summary="Stripe webhook receiver")
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    """Always returns 200 once the signature checks out, even for event
    types parse_subscription_event() doesn't act on — Stripe retries a
    webhook on anything but a 2xx, and there's no reason to make it retry
    an event BEE was never going to do anything with."""
    raw_body = await request.body()
    if not stripe_signature:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe-Signature header.")
    try:
        verify_webhook_signature(raw_body, stripe_signature)
    except BillingError as exc:
        logger.warning("Stripe webhook signature verification failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        event = json.loads(raw_body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed JSON body.") from exc

    update = parse_subscription_event(event)
    if update is None:
        return {"received": True}

    org = session.exec(
        select(Organization).where(Organization.stripe_customer_id == update.stripe_customer_id)
    ).first()
    if org is None:
        logger.info("Stripe webhook: no organization matches customer_id=%s", update.stripe_customer_id)
        return {"received": True}

    org.stripe_subscription_id = update.stripe_subscription_id
    org.stripe_subscription_status = update.status
    session.add(org)
    session.commit()
    return {"received": True}
