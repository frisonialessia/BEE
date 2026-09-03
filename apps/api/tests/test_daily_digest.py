"""Daily digest — settings, "send now", and the hourly cron tick. Hermetic:
the webhook POST is patched and captured."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import httpx
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.security import create_access_token, hash_password
from app.models.base import OpportunityStatus, UserRole
from app.models.organization import Organization
from app.models.user import User
from app.services.digest import DailyDigestService
from tests.conftest import _create_full_opportunity


def _user(session: Session, *, role: UserRole = UserRole.OWNER, org: Organization | None = None) -> tuple[Organization, User, dict]:
    if org is None:
        org = Organization(name="Digest Org", slug=f"digest-{uuid.uuid4().hex[:8]}")
        session.add(org)
        session.commit()
        session.refresh(org)
    user = User(
        organization_id=org.id,
        email=f"{role.value}-{uuid.uuid4().hex[:8]}@bee.ai",
        hashed_password=hash_password("password123"),
        full_name="Digest User",
        role=role,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    token = create_access_token(user.id, organization_id=org.id, role=user.role.value)
    return org, user, {"Authorization": f"Bearer {token}"}


def _ok_post() -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.raise_for_status.return_value = None
    return resp


HOOK = "https://hooks.slack.com/services/T000/B000/abcdef123456"


class TestSettings:
    def test_defaults_are_off_and_unconfigured(self, client: TestClient, session: Session):
        _, _, headers = _user(session)
        resp = client.get("/api/v1/organizations/digest", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == {
            "enabled": False,
            "hour_utc": 8,
            "webhook_configured": False,
            "webhook_url_hint": None,
            "last_sent_at": None,
        }

    def test_owner_configures_and_the_url_is_never_echoed_in_full(self, client: TestClient, session: Session):
        _, _, headers = _user(session)
        resp = client.put(
            "/api/v1/organizations/digest",
            headers=headers,
            json={"webhook_url": HOOK, "enabled": True, "hour_utc": 7},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["enabled"] is True and body["hour_utc"] == 7 and body["webhook_configured"] is True
        assert body["webhook_url_hint"] == "…123456"
        assert HOOK not in resp.text

        # Partial patch keeps what wasn't sent; empty string clears the URL.
        resp = client.put("/api/v1/organizations/digest", headers=headers, json={"webhook_url": ""})
        body = resp.json()
        assert body["webhook_configured"] is False and body["enabled"] is True and body["hour_utc"] == 7

    def test_rejects_non_https_and_non_admins(self, client: TestClient, session: Session):
        org, _, owner_headers = _user(session)
        resp = client.put("/api/v1/organizations/digest", headers=owner_headers, json={"webhook_url": "http://x"})
        assert resp.status_code == 422
        resp = client.put("/api/v1/organizations/digest", headers=owner_headers, json={"hour_utc": 24})
        assert resp.status_code == 422

        _, _, member_headers = _user(session, role=UserRole.MEMBER, org=org)
        assert client.put("/api/v1/organizations/digest", headers=member_headers, json={"enabled": True}).status_code == 403
        assert client.post("/api/v1/organizations/digest/send", headers=member_headers).status_code == 403
        # Reading is open to any member — they see whether the team gets a digest.
        assert client.get("/api/v1/organizations/digest", headers=member_headers).status_code == 200


class TestSendNow:
    def test_posts_the_feed_to_the_webhook(self, client: TestClient, session: Session):
        org, _, headers = _user(session)
        _, _, _, opp = _create_full_opportunity(session)
        opp.organization_id = org.id
        opp.status = OpportunityStatus.PRIORITIZED
        org.digest_webhook_url = HOOK
        session.add_all([opp, org])
        session.commit()

        with patch("app.services.digest.service.httpx.post", return_value=_ok_post()) as post:
            resp = client.post("/api/v1/organizations/digest/send", headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"sent": True, "reason": None, "cards": 1}

        post.assert_called_once()
        called_url = post.call_args.args[0]
        payload = post.call_args.kwargs["json"]
        assert called_url == HOOK
        assert "Digest Org" in payload["text"]
        assert "Test Corp" in payload["text"]
        assert f"opportunity={opp.id}" in payload["text"]

        session.refresh(org)
        assert org.digest_last_sent_at is not None

    def test_not_configured_is_a_clean_no(self, client: TestClient, session: Session):
        _, _, headers = _user(session)
        with patch("app.services.digest.service.httpx.post") as post:
            resp = client.post("/api/v1/organizations/digest/send", headers=headers)
        assert resp.json() == {"sent": False, "reason": "not_configured", "cards": 0}
        post.assert_not_called()

    def test_delivery_failure_is_reported_not_raised(self, client: TestClient, session: Session):
        org, _, headers = _user(session)
        org.digest_webhook_url = HOOK
        session.add(org)
        session.commit()
        with patch("app.services.digest.service.httpx.post", side_effect=httpx.ConnectError("down")):
            resp = client.post("/api/v1/organizations/digest/send", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["sent"] is False and resp.json()["reason"] == "delivery_failed"

    def test_empty_feed_still_sends_a_quiet_message(self, session: Session):
        org, _, _ = _user(session)
        text, count = DailyDigestService(session).build_message(org)
        assert count == 0 and "Todo tranquilo" in text


class TestScheduledTick:
    def test_sends_only_at_the_hour_and_once_per_day(self, session: Session):
        org_due, _, _ = _user(session)
        org_due.digest_enabled = True
        org_due.digest_webhook_url = HOOK
        org_due.digest_hour_utc = 9
        org_later, _, _ = _user(session)
        org_later.digest_enabled = True
        org_later.digest_webhook_url = HOOK
        org_later.digest_hour_utc = 15
        org_off, _, _ = _user(session)
        org_off.digest_enabled = False
        org_off.digest_webhook_url = HOOK
        session.add_all([org_due, org_later, org_off])
        session.commit()

        nine = datetime(2026, 9, 3, 9, 5, tzinfo=UTC)
        service = DailyDigestService(session)
        with patch("app.services.digest.service.httpx.post", return_value=_ok_post()) as post:
            summary = service.run_tick(now=nine)
        assert summary.organizations_checked == 2  # disabled orgs aren't even loaded
        assert summary.sent == 1 and summary.skipped == 1
        assert post.call_count == 1

        # Same hour again (a re-run tick): nothing goes out twice.
        with patch("app.services.digest.service.httpx.post", return_value=_ok_post()) as post:
            summary = service.run_tick(now=nine + timedelta(minutes=20))
        assert summary.sent == 0 and post.call_count == 0

        # Next day at the hour: sends again.
        with patch("app.services.digest.service.httpx.post", return_value=_ok_post()) as post:
            summary = service.run_tick(now=nine + timedelta(days=1))
        assert summary.sent == 1

    def test_cron_endpoint_is_gated_by_the_secret(self, client: TestClient):
        from app.core.config import settings as app_settings

        assert client.get("/api/v1/internal/digest/tick").status_code == 404
        with patch.multiple(app_settings, CRON_SECRET="s3cret"):
            assert client.get("/api/v1/internal/digest/tick").status_code == 401
            resp = client.get("/api/v1/internal/digest/tick", headers={"Authorization": "Bearer s3cret"})
        assert resp.status_code == 200
        assert resp.json()["organizations_checked"] == 0
