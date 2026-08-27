"""Tests for OrganizationApiKey — per-tenant webhook ingestion auth.

Covers:
1. Key generation/hashing (core.security)
2. HTTP endpoints — create/list/revoke, role-gated to OWNER/ADMIN
3. Org-scoped signal ingestion via X-BEE-Org-Key on POST /signals/webhook
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import create_access_token, generate_api_key, hash_api_key
from app.models.base import UserRole
from app.models.company import Company
from app.models.organization import Organization
from app.models.organization_api_key import OrganizationApiKey
from app.models.user import User

# ---------------------------------------------------------------------------
# 1. Key generation
# ---------------------------------------------------------------------------


class TestGenerateApiKey:
    def test_plaintext_is_not_the_stored_hash(self):
        plaintext, key_hash = generate_api_key()
        assert plaintext != key_hash
        assert plaintext.startswith("bee_org_")

    def test_hash_is_deterministic_and_matches_plaintext(self):
        plaintext, key_hash = generate_api_key()
        assert hash_api_key(plaintext) == key_hash

    def test_two_generated_keys_differ(self):
        plaintext1, _ = generate_api_key()
        plaintext2, _ = generate_api_key()
        assert plaintext1 != plaintext2


# ---------------------------------------------------------------------------
# Shared helpers (mirrors tests/test_auth_multitenancy.py conventions)
# ---------------------------------------------------------------------------


def _register(client: TestClient, *, org_name: str, email: str, password: str = "password123") -> dict:
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": org_name,
            "full_name": "Owner",
            "email": email,
            "password": password,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_org(session: Session, name: str = "Org") -> Organization:
    org = Organization(name=name, slug=f"{name.lower()}-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def _make_active_key(session: Session, org: Organization, name: str = "Integration") -> str:
    """Create an active key directly via the DB and return its plaintext."""
    plaintext, key_hash = generate_api_key()
    session.add(
        OrganizationApiKey(organization_id=org.id, name=name, key_prefix=plaintext[:12], key_hash=key_hash)
    )
    session.commit()
    return plaintext


# ---------------------------------------------------------------------------
# 2. HTTP endpoints
# ---------------------------------------------------------------------------


class TestApiKeyEndpoints:
    def test_owner_can_create_key_and_sees_plaintext_once(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="keyowner@acme.io")
        resp = client.post(
            "/api/v1/organizations/api-keys",
            json={"name": "Zapier"},
            headers=_auth_headers(owner["access_token"]),
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["name"] == "Zapier"
        assert body["api_key"].startswith("bee_org_")
        assert body["key_prefix"] == body["api_key"][:12]

    def test_member_cannot_create_key(self, client: TestClient, session: Session):
        owner = _register(client, org_name="Acme Corp", email="keyowner2@acme.io")
        org_id = uuid.UUID(owner["user"]["organization_id"])
        member = User(
            organization_id=org_id,
            email="keymember@acme.io",
            hashed_password="x",
            full_name="Member",
            role=UserRole.MEMBER,
        )
        session.add(member)
        session.commit()

        token = create_access_token(member.id, organization_id=org_id, role=member.role.value)

        resp = client.post(
            "/api/v1/organizations/api-keys", json={"name": "Nope"}, headers=_auth_headers(token)
        )
        assert resp.status_code == 403

    def test_list_keys_never_returns_plaintext(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="keyowner3@acme.io")
        headers = _auth_headers(owner["access_token"])
        client.post("/api/v1/organizations/api-keys", json={"name": "K1"}, headers=headers)

        resp = client.get("/api/v1/organizations/api-keys", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert "api_key" not in body[0]
        assert body[0]["key_prefix"].startswith("bee_org_")

    def test_list_keys_scoped_to_organization(self, client: TestClient):
        owner1 = _register(client, org_name="Org One", email="k1@x.io")
        owner2 = _register(client, org_name="Org Two", email="k2@x.io")
        client.post(
            "/api/v1/organizations/api-keys",
            json={"name": "Org1 Key"},
            headers=_auth_headers(owner1["access_token"]),
        )

        resp = client.get("/api/v1/organizations/api-keys", headers=_auth_headers(owner2["access_token"]))
        assert resp.json() == []

    def test_revoke_key_deactivates_it(self, client: TestClient):
        owner = _register(client, org_name="Acme Corp", email="keyowner4@acme.io")
        headers = _auth_headers(owner["access_token"])
        created = client.post("/api/v1/organizations/api-keys", json={"name": "K1"}, headers=headers).json()

        resp = client.delete(f"/api/v1/organizations/api-keys/{created['id']}", headers=headers)
        assert resp.status_code == 204

        listed = client.get("/api/v1/organizations/api-keys", headers=headers).json()
        assert listed[0]["is_active"] is False

    def test_revoke_key_from_other_org_returns_404(self, client: TestClient):
        owner1 = _register(client, org_name="Org One", email="k3@x.io")
        owner2 = _register(client, org_name="Org Two", email="k4@x.io")
        created = client.post(
            "/api/v1/organizations/api-keys",
            json={"name": "Org1 Key"},
            headers=_auth_headers(owner1["access_token"]),
        ).json()

        resp = client.delete(
            f"/api/v1/organizations/api-keys/{created['id']}", headers=_auth_headers(owner2["access_token"])
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 3. Org-scoped signal ingestion
# ---------------------------------------------------------------------------


class TestOrgScopedWebhookIngestion:
    def test_webhook_without_org_key_stays_untagged(self, client: TestClient):
        """Backward compatibility: no X-BEE-Org-Key -> everything created stays
        untagged, same as before organization API keys existed."""
        resp = client.post(
            "/api/v1/signals/webhook",
            json={
                "title": "No org signal",
                "event": "funding.round.announced",
                "company": {"name": "NoOrgCo", "domain": "noorgco.com"},
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["signal"]["id"]

    def test_webhook_with_org_key_tags_created_records(self, client: TestClient, session: Session):
        org = _make_org(session, "Tagged Org")
        plaintext = _make_active_key(session, org)

        resp = client.post(
            "/api/v1/signals/webhook",
            json={
                "title": "Tagged signal",
                "event": "funding.round.announced",
                "company": {"name": "TaggedCo", "domain": "taggedco.com"},
            },
            headers={"X-BEE-Org-Key": plaintext},
        )
        assert resp.status_code == 201, resp.text

        company = session.exec(
            select(Company).where(Company.domain == "taggedco.com")
        ).first()
        assert company is not None
        assert company.organization_id == org.id

    def test_webhook_with_invalid_org_key_returns_401(self, client: TestClient):
        resp = client.post(
            "/api/v1/signals/webhook",
            json={"title": "X", "event": "funding.round.announced"},
            headers={"X-BEE-Org-Key": "bee_org_totally-not-a-real-key"},
        )
        assert resp.status_code == 401

    def test_webhook_with_revoked_org_key_returns_401(self, client: TestClient, session: Session):
        org = _make_org(session, "Revoked Org")
        plaintext, key_hash = generate_api_key()
        key = OrganizationApiKey(
            organization_id=org.id, name="Revoked", key_prefix=plaintext[:12], key_hash=key_hash, is_active=False
        )
        session.add(key)
        session.commit()

        resp = client.post(
            "/api/v1/signals/webhook",
            json={"title": "X", "event": "funding.round.announced"},
            headers={"X-BEE-Org-Key": plaintext},
        )
        assert resp.status_code == 401

    def test_two_orgs_same_domain_get_separate_company_rows(self, client: TestClient, session: Session):
        """Company.domain uniqueness is per-org (uq_companies_org_domain) — two
        organizations tracking the same company each get their own row."""
        org_a = _make_org(session, "Org A")
        org_b = _make_org(session, "Org B")
        key_a = _make_active_key(session, org_a, "A key")
        key_b = _make_active_key(session, org_b, "B key")

        for key in (key_a, key_b):
            resp = client.post(
                "/api/v1/signals/webhook",
                json={
                    "title": "Shared domain signal",
                    "event": "funding.round.announced",
                    "company": {"name": "SharedCo", "domain": "sharedco.com"},
                },
                headers={"X-BEE-Org-Key": key},
            )
            assert resp.status_code == 201, resp.text

        companies = session.exec(
            select(Company).where(Company.domain == "sharedco.com")
        ).all()
        assert len(companies) == 2
        assert {c.organization_id for c in companies} == {org_a.id, org_b.id}


# ---------------------------------------------------------------------------
# 4. get_organization_from_webhook_key — POST /webhooks/receive's tenant
#    resolution (header OR ?org_key= query param, since external providers
#    like LinkedIn/G2 typically only let you configure a destination URL,
#    not custom headers).
# ---------------------------------------------------------------------------


class TestGetOrganizationFromWebhookKey:
    def test_absent_returns_none(self, session: Session):
        from app.api.deps import get_organization_from_webhook_key

        assert get_organization_from_webhook_key(None, None, session) is None

    def test_resolves_from_header(self, session: Session):
        from app.api.deps import get_organization_from_webhook_key

        org = _make_org(session, "Header Org")
        plaintext = _make_active_key(session, org)

        resolved = get_organization_from_webhook_key(plaintext, None, session)
        assert resolved == org.id

    def test_resolves_from_query_param(self, session: Session):
        """The path external providers can actually use — a webhook URL
        callback with ?org_key=... baked in, no custom header required."""
        from app.api.deps import get_organization_from_webhook_key

        org = _make_org(session, "Query Org")
        plaintext = _make_active_key(session, org)

        resolved = get_organization_from_webhook_key(None, plaintext, session)
        assert resolved == org.id

    def test_header_takes_precedence_over_query_param(self, session: Session):
        from app.api.deps import get_organization_from_webhook_key

        org_a = _make_org(session, "Precedence A")
        org_b = _make_org(session, "Precedence B")
        key_a = _make_active_key(session, org_a)
        key_b = _make_active_key(session, org_b)

        resolved = get_organization_from_webhook_key(key_a, key_b, session)
        assert resolved == org_a.id

    def test_invalid_key_401s(self, session: Session):
        from fastapi import HTTPException

        from app.api.deps import get_organization_from_webhook_key

        with pytest.raises(HTTPException) as exc_info:
            get_organization_from_webhook_key("bee_org_not-a-real-key", None, session)
        assert exc_info.value.status_code == 401


# ---------------------------------------------------------------------------
# 5. POST /webhooks/receive — org_key threading + replay protection
# ---------------------------------------------------------------------------


class TestWebhookReceiveOrgScoping:
    """Uses the DB-wired `client` fixture (unlike test_external_ingestion.py's
    module-local one) since resolving an org key requires a real session.

    The worker's asyncio queue processes off-thread — rather than depend on
    its timing, these assert the resolved organization_id made it onto the
    IngestionTask the endpoint actually enqueues (mocking the worker itself,
    same technique test_external_ingestion.py's TestWebhookReceive uses).
    """

    def _payload(self, external_id: str) -> dict:
        return {
            "provider": "linkedin",
            "event_type": "funding.round.announced",
            "title": "Acme raised a Series B",
            "external_id": external_id,
            "company": {"name": "Acme", "domain": "acme-webhook-org.com"},
        }

    def test_org_key_query_param_lands_on_the_enqueued_task(self, client: TestClient, session: Session):
        from unittest.mock import AsyncMock, MagicMock, patch

        org = _make_org(session, "Webhook Query Org")
        plaintext = _make_active_key(session, org)

        with patch("app.api.v1.endpoints.webhooks.get_ingestion_worker") as mock_worker_fn:
            worker = MagicMock()
            worker.enqueue = AsyncMock(return_value="task-org-query")
            mock_worker_fn.return_value = worker

            resp = client.post(
                f"/api/v1/webhooks/receive?org_key={plaintext}",
                json=self._payload("provider:evt_org_query_1"),
            )

        assert resp.status_code == 202, resp.text
        enqueued_task = worker.enqueue.call_args[0][0]
        assert enqueued_task.organization_id == str(org.id)

    def test_org_key_header_lands_on_the_enqueued_task(self, client: TestClient, session: Session):
        from unittest.mock import AsyncMock, MagicMock, patch

        org = _make_org(session, "Webhook Header Org")
        plaintext = _make_active_key(session, org)

        with patch("app.api.v1.endpoints.webhooks.get_ingestion_worker") as mock_worker_fn:
            worker = MagicMock()
            worker.enqueue = AsyncMock(return_value="task-org-header")
            mock_worker_fn.return_value = worker

            resp = client.post(
                "/api/v1/webhooks/receive",
                json=self._payload("provider:evt_org_header_1"),
                headers={"X-BEE-Org-Key": plaintext},
            )

        assert resp.status_code == 202, resp.text
        enqueued_task = worker.enqueue.call_args[0][0]
        assert enqueued_task.organization_id == str(org.id)

    def test_no_org_key_leaves_task_untagged(self, client: TestClient, session: Session):  # noqa: ARG002
        from unittest.mock import AsyncMock, MagicMock, patch

        with patch("app.api.v1.endpoints.webhooks.get_ingestion_worker") as mock_worker_fn:
            worker = MagicMock()
            worker.enqueue = AsyncMock(return_value="task-org-none")
            mock_worker_fn.return_value = worker

            resp = client.post(
                "/api/v1/webhooks/receive",
                json=self._payload("provider:evt_org_untagged_1"),
            )

        assert resp.status_code == 202, resp.text
        enqueued_task = worker.enqueue.call_args[0][0]
        assert enqueued_task.organization_id is None

    def test_invalid_org_key_401s_before_enqueueing(self, client: TestClient, session: Session):  # noqa: ARG002
        resp = client.post(
            "/api/v1/webhooks/receive?org_key=bee_org_not-a-real-key",
            json=self._payload("provider:evt_org_invalid_1"),
        )
        assert resp.status_code == 401


class TestWebhookReplayProtection:
    def test_replayed_signature_is_rejected(self, client: TestClient):
        import json as json_module

        from app.core.config import settings as app_settings
        from app.core.replay_guard import reset_replay_guard
        from app.core.security import compute_signature

        reset_replay_guard()
        original_window = app_settings.WEBHOOK_REPLAY_WINDOW_SECONDS
        original_required = app_settings.WEBHOOK_SIGNATURE_REQUIRED
        app_settings.WEBHOOK_REPLAY_WINDOW_SECONDS = 300
        app_settings.WEBHOOK_SIGNATURE_REQUIRED = True
        try:
            body = json_module.dumps(
                {
                    "provider": "linkedin",
                    "event_type": "funding.round.announced",
                    "title": "Replay test",
                    "external_id": "provider:evt_replay_1",
                }
            ).encode()
            signature = compute_signature(body)
            headers = {"X-BEE-Signature": signature, "content-type": "application/json"}

            first = client.post("/api/v1/webhooks/receive", content=body, headers=headers)
            assert first.status_code == 202, first.text

            second = client.post("/api/v1/webhooks/receive", content=body, headers=headers)
            assert second.status_code == 409, second.text
        finally:
            app_settings.WEBHOOK_REPLAY_WINDOW_SECONDS = original_window
            app_settings.WEBHOOK_SIGNATURE_REQUIRED = original_required
            reset_replay_guard()

    def test_disabled_window_allows_repeated_delivery(self, client: TestClient):
        """WEBHOOK_REPLAY_WINDOW_SECONDS=0 disables the guard entirely —
        needed by tests (and operators) that intentionally resend the same
        signed payload to exercise idempotency at the application level."""
        import json as json_module

        from app.core.config import settings as app_settings
        from app.core.replay_guard import reset_replay_guard
        from app.core.security import compute_signature

        reset_replay_guard()
        original_window = app_settings.WEBHOOK_REPLAY_WINDOW_SECONDS
        original_required = app_settings.WEBHOOK_SIGNATURE_REQUIRED
        app_settings.WEBHOOK_REPLAY_WINDOW_SECONDS = 0
        app_settings.WEBHOOK_SIGNATURE_REQUIRED = True
        try:
            body = json_module.dumps(
                {
                    "provider": "linkedin",
                    "event_type": "funding.round.announced",
                    "title": "Replay disabled test",
                    "external_id": "provider:evt_replay_disabled_1",
                }
            ).encode()
            signature = compute_signature(body)
            headers = {"X-BEE-Signature": signature, "content-type": "application/json"}

            first = client.post("/api/v1/webhooks/receive", content=body, headers=headers)
            assert first.status_code == 202, first.text

            second = client.post("/api/v1/webhooks/receive", content=body, headers=headers)
            assert second.status_code == 202, second.text
        finally:
            app_settings.WEBHOOK_REPLAY_WINDOW_SECONDS = original_window
            app_settings.WEBHOOK_SIGNATURE_REQUIRED = original_required
            reset_replay_guard()
