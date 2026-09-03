"""Tests for billing scaffolding — GET /billing, POST /billing/checkout-session,
POST /billing/portal-session, POST /billing/webhook. See
app.services.billing and app.api.v1.endpoints.billing for the design, in
particular why this is scaffolding and never gates access.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings as app_settings
from app.core.security import create_access_token
from app.models.base import UserRole
from app.models.organization import Organization
from app.models.user import User


def _register(client: TestClient, *, org_name: str, email: str, password: str = "password123") -> dict:
    resp = client.post(
        "/api/v1/auth/register",
        json={"organization_name": org_name, "full_name": "Owner", "email": email, "password": password},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _sign(payload: bytes, secret: str, *, timestamp: int | None = None) -> str:
    ts = timestamp if timestamp is not None else int(time.time())
    signed_payload = f"{ts}.".encode() + payload
    sig = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"


@pytest.fixture(autouse=True)
def _stripe_configured():
    originals = (app_settings.STRIPE_API_KEY, app_settings.STRIPE_WEBHOOK_SECRET)
    app_settings.STRIPE_API_KEY = "sk_test_stripe"
    app_settings.STRIPE_WEBHOOK_SECRET = "whsec_test_stripe"
    yield
    (app_settings.STRIPE_API_KEY, app_settings.STRIPE_WEBHOOK_SECRET) = originals


class TestBillingStatus:
    def test_member_cannot_read_billing_status(self, client: TestClient, session: Session):
        auth = _register(client, org_name="Billing Locked Co", email="owner@billinglocked.co")
        org_id = uuid.UUID(auth["user"]["organization_id"])
        member = User(
            organization_id=org_id, email="member@billinglocked.co", hashed_password="x",
            full_name="Member", role=UserRole.MEMBER,
        )
        session.add(member)
        session.commit()
        token = create_access_token(member.id, organization_id=org_id, role=member.role.value)

        resp = client.get("/api/v1/billing", headers=_auth_headers(token))
        assert resp.status_code == 403

    def test_default_billing_status_has_no_subscription(self, client: TestClient):
        auth = _register(client, org_name="Billing Default Co", email="owner@billingdefault.co")
        resp = client.get("/api/v1/billing", headers=_auth_headers(auth["access_token"]))
        assert resp.status_code == 200
        body = resp.json()
        assert body["plan"] == "free"
        assert body["stripe_customer_id"] is None
        assert body["stripe_subscription_id"] is None
        assert body["stripe_subscription_status"] is None
        assert body["globally_configured"] is True


class TestCheckoutSession:
    def test_admin_cannot_start_checkout_owner_only(self, client: TestClient, session: Session):
        auth = _register(client, org_name="Checkout Admin Co", email="owner@checkoutadmin.co")
        org_id = uuid.UUID(auth["user"]["organization_id"])
        admin = User(
            organization_id=org_id, email="admin@checkoutadmin.co", hashed_password="x",
            full_name="Admin", role=UserRole.ADMIN,
        )
        session.add(admin)
        session.commit()
        token = create_access_token(admin.id, organization_id=org_id, role=admin.role.value)

        resp = client.post(
            "/api/v1/billing/checkout-session",
            json={"price_id": "price_123", "success_url": "https://app.bee.co/ok", "cancel_url": "https://app.bee.co/cancel"},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 403

    def test_owner_starts_checkout_and_customer_id_is_persisted(
        self, client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
    ):
        from app.api.v1.endpoints import billing as billing_endpoint

        monkeypatch.setattr(billing_endpoint, "get_or_create_customer_id", lambda _org: "cus_new123")
        monkeypatch.setattr(
            billing_endpoint,
            "create_checkout_session",
            lambda **_kwargs: "https://checkout.stripe.com/session/abc",
        )

        auth = _register(client, org_name="Checkout Success Co", email="owner@checkoutsuccess.co")
        resp = client.post(
            "/api/v1/billing/checkout-session",
            json={"price_id": "price_123", "success_url": "https://app.bee.co/ok", "cancel_url": "https://app.bee.co/cancel"},
            headers=_auth_headers(auth["access_token"]),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"url": "https://checkout.stripe.com/session/abc"}

        org_id = uuid.UUID(auth["user"]["organization_id"])
        org = session.get(Organization, org_id)
        assert org is not None
        assert org.stripe_customer_id == "cus_new123"

    def test_checkout_failure_returns_409(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        from app.api.v1.endpoints import billing as billing_endpoint
        from app.services.billing import BillingError

        def _boom(_org):
            raise BillingError("nope")

        monkeypatch.setattr(billing_endpoint, "get_or_create_customer_id", _boom)

        auth = _register(client, org_name="Checkout Fail Co", email="owner@checkoutfail.co")
        resp = client.post(
            "/api/v1/billing/checkout-session",
            json={"price_id": "price_123", "success_url": "https://app.bee.co/ok", "cancel_url": "https://app.bee.co/cancel"},
            headers=_auth_headers(auth["access_token"]),
        )
        assert resp.status_code == 409


class TestPortalSession:
    def test_no_customer_yet_returns_404(self, client: TestClient):
        auth = _register(client, org_name="Portal NoCustomer Co", email="owner@portalnocustomer.co")
        resp = client.post(
            "/api/v1/billing/portal-session",
            json={"return_url": "https://app.bee.co/settings"},
            headers=_auth_headers(auth["access_token"]),
        )
        assert resp.status_code == 404

    def test_owner_opens_portal_with_existing_customer(
        self, client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
    ):
        from app.api.v1.endpoints import billing as billing_endpoint

        monkeypatch.setattr(
            billing_endpoint, "create_portal_session", lambda **_kwargs: "https://billing.stripe.com/session/xyz"
        )

        auth = _register(client, org_name="Portal Existing Co", email="owner@portalexisting.co")
        org_id = uuid.UUID(auth["user"]["organization_id"])
        org = session.get(Organization, org_id)
        assert org is not None
        org.stripe_customer_id = "cus_existing"
        session.add(org)
        session.commit()

        resp = client.post(
            "/api/v1/billing/portal-session",
            json={"return_url": "https://app.bee.co/settings"},
            headers=_auth_headers(auth["access_token"]),
        )
        assert resp.status_code == 200
        assert resp.json() == {"url": "https://billing.stripe.com/session/xyz"}


class TestStripeWebhook:
    def test_missing_signature_header_is_rejected(self, client: TestClient):
        resp = client.post("/api/v1/billing/webhook", content=b"{}")
        assert resp.status_code == 400

    def test_bad_signature_is_rejected(self, client: TestClient):
        resp = client.post(
            "/api/v1/billing/webhook",
            content=b"{}",
            headers={"Stripe-Signature": "t=123,v1=deadbeef"},
        )
        assert resp.status_code == 400

    def test_unrecognized_event_type_is_accepted_and_ignored(self, client: TestClient):
        body = json.dumps({"type": "invoice.paid", "data": {"object": {}}}).encode()
        sig = _sign(body, app_settings.STRIPE_WEBHOOK_SECRET)
        resp = client.post(
            "/api/v1/billing/webhook", content=body, headers={"Stripe-Signature": sig}
        )
        assert resp.status_code == 200
        assert resp.json() == {"received": True}

    def test_subscription_update_for_unknown_customer_is_accepted_and_ignored(self, client: TestClient):
        body = json.dumps(
            {
                "type": "customer.subscription.updated",
                "data": {"object": {"id": "sub_1", "customer": "cus_nonexistent", "status": "active"}},
            }
        ).encode()
        sig = _sign(body, app_settings.STRIPE_WEBHOOK_SECRET)
        resp = client.post(
            "/api/v1/billing/webhook", content=body, headers={"Stripe-Signature": sig}
        )
        assert resp.status_code == 200

    def test_subscription_update_for_known_customer_persists_status(
        self, client: TestClient, session: Session
    ):
        auth = _register(client, org_name="Webhook Known Co", email="owner@webhookknown.co")
        org_id = uuid.UUID(auth["user"]["organization_id"])
        org = session.get(Organization, org_id)
        assert org is not None
        org.stripe_customer_id = "cus_known"
        session.add(org)
        session.commit()

        body = json.dumps(
            {
                "type": "customer.subscription.updated",
                "data": {"object": {"id": "sub_known", "customer": "cus_known", "status": "trialing"}},
            }
        ).encode()
        sig = _sign(body, app_settings.STRIPE_WEBHOOK_SECRET)
        resp = client.post(
            "/api/v1/billing/webhook", content=body, headers={"Stripe-Signature": sig}
        )
        assert resp.status_code == 200

        session.refresh(org)
        assert org.stripe_subscription_id == "sub_known"
        assert org.stripe_subscription_status == "trialing"

    def test_subscription_deleted_sets_canceled_status(self, client: TestClient, session: Session):
        auth = _register(client, org_name="Webhook Cancel Co", email="owner@webhookcancel.co")
        org_id = uuid.UUID(auth["user"]["organization_id"])
        org = session.get(Organization, org_id)
        assert org is not None
        org.stripe_customer_id = "cus_cancel"
        org.stripe_subscription_id = "sub_cancel"
        org.stripe_subscription_status = "active"
        session.add(org)
        session.commit()

        body = json.dumps(
            {
                "type": "customer.subscription.deleted",
                "data": {"object": {"id": "sub_cancel", "customer": "cus_cancel"}},
            }
        ).encode()
        sig = _sign(body, app_settings.STRIPE_WEBHOOK_SECRET)
        resp = client.post(
            "/api/v1/billing/webhook", content=body, headers={"Stripe-Signature": sig}
        )
        assert resp.status_code == 200

        session.refresh(org)
        assert org.stripe_subscription_status == "canceled"
