"""Tests for the self-serve forgot-password flow.

Covers:
1. AuthService.create_password_reset_token / reset_password (service layer)
2. POST /auth/forgot-password / POST /auth/reset-password (HTTP layer)
3. Anti-enumeration: same response whether or not the email exists
4. Rate limiting on /auth/forgot-password
"""

from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.security import verify_password
from app.models.base import utcnow
from app.models.password_reset_token import PasswordResetToken
from app.schemas.auth import OrganizationRegister
from app.services.auth import AuthService

_REGISTER_PAYLOAD = {
    "organization_name": "Reset Test Co",
    "full_name": "Riley Reset",
    "email": "riley@reset-test.example",
    "password": "original-password-123",
}


class TestAuthServicePasswordReset:
    def test_unknown_email_returns_none(self, session: Session):
        service = AuthService(session)
        assert service.create_password_reset_token("nobody@nowhere.example") is None

    def test_known_email_returns_user_and_token(self, session: Session):
        service = AuthService(session)
        org, user = service.register_organization(OrganizationRegister(**_REGISTER_PAYLOAD))

        result = service.create_password_reset_token(user.email)

        assert result is not None
        returned_user, plaintext_token = result
        assert returned_user.id == user.id
        assert len(plaintext_token) > 20  # secrets.token_urlsafe(32) output

    def test_token_is_never_stored_as_plaintext(self, session: Session):
        from sqlmodel import select

        service = AuthService(session)
        _, user = service.register_organization(OrganizationRegister(**_REGISTER_PAYLOAD))
        _, plaintext_token = service.create_password_reset_token(user.email)

        record = session.exec(select(PasswordResetToken)).first()
        assert record is not None
        assert record.token_hash != plaintext_token

    def test_reset_password_success_changes_hash(self, session: Session):
        service = AuthService(session)
        _, user = service.register_organization(OrganizationRegister(**_REGISTER_PAYLOAD))
        old_hash = user.hashed_password
        _, plaintext_token = service.create_password_reset_token(user.email)

        ok = service.reset_password(plaintext_token, "brand-new-password-456")

        assert ok is True
        session.refresh(user)
        assert user.hashed_password != old_hash
        assert verify_password("brand-new-password-456", user.hashed_password)
        assert not verify_password(_REGISTER_PAYLOAD["password"], user.hashed_password)

    def test_reset_password_wrong_token_fails(self, session: Session):
        service = AuthService(session)
        _, user = service.register_organization(OrganizationRegister(**_REGISTER_PAYLOAD))
        service.create_password_reset_token(user.email)

        assert service.reset_password("not-the-real-token", "whatever-123") is False

    def test_reset_password_token_is_single_use(self, session: Session):
        service = AuthService(session)
        _, user = service.register_organization(OrganizationRegister(**_REGISTER_PAYLOAD))
        _, plaintext_token = service.create_password_reset_token(user.email)

        assert service.reset_password(plaintext_token, "first-new-password-1") is True
        # Same token again — must fail, even though the token row still exists.
        assert service.reset_password(plaintext_token, "second-new-password-2") is False

    def test_reset_password_expired_token_fails(self, session: Session):
        service = AuthService(session)
        _, user = service.register_organization(OrganizationRegister(**_REGISTER_PAYLOAD))
        _, plaintext_token = service.create_password_reset_token(user.email)

        # Force the just-issued token into the past.
        from sqlmodel import select

        from app.core.security import hash_api_key

        record = session.exec(
            select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_api_key(plaintext_token))
        ).first()
        assert record is not None
        record.expires_at = utcnow() - timedelta(minutes=1)
        session.add(record)
        session.commit()

        assert service.reset_password(plaintext_token, "too-late-now-123") is False


class TestForgotPasswordEndpoint:
    def test_unknown_email_returns_generic_200(self, client: TestClient):
        response = client.post(
            "/api/v1/auth/forgot-password", json={"email": "ghost@nowhere.example"}
        )
        assert response.status_code == 200
        assert "detail" in response.json()

    def test_known_email_returns_same_generic_200(self, client: TestClient):
        client.post("/api/v1/auth/register", json=_REGISTER_PAYLOAD)

        known = client.post(
            "/api/v1/auth/forgot-password", json={"email": _REGISTER_PAYLOAD["email"]}
        )
        unknown = client.post(
            "/api/v1/auth/forgot-password", json={"email": "ghost@nowhere.example"}
        )

        # Anti-enumeration: identical status + body shape either way.
        assert known.status_code == unknown.status_code == 200
        assert known.json().keys() == unknown.json().keys()

    def test_reset_password_end_to_end_via_http(self, client: TestClient, session: Session):
        client.post("/api/v1/auth/register", json=_REGISTER_PAYLOAD)

        # POST /auth/forgot-password never returns the token itself — it
        # only ever goes out over email — so issue one directly through the
        # service (same in-memory DB/engine the HTTP client's session
        # override reads from) to get the plaintext a real user would see
        # in their inbox, then redeem it exactly as they would.
        service = AuthService(session)
        _, plaintext_token = service.create_password_reset_token(_REGISTER_PAYLOAD["email"])

        reset_response = client.post(
            "/api/v1/auth/reset-password",
            json={"token": plaintext_token, "new_password": "post-reset-password-789"},
        )
        assert reset_response.status_code == 204

        # Old password no longer works, new one does.
        old_login = client.post(
            "/api/v1/auth/login",
            json={"email": _REGISTER_PAYLOAD["email"], "password": _REGISTER_PAYLOAD["password"]},
        )
        assert old_login.status_code == 401

        new_login = client.post(
            "/api/v1/auth/login",
            json={"email": _REGISTER_PAYLOAD["email"], "password": "post-reset-password-789"},
        )
        assert new_login.status_code == 200

    def test_reset_password_invalid_token_returns_400(self, client: TestClient):
        response = client.post(
            "/api/v1/auth/reset-password",
            json={"token": "totally-made-up-token", "new_password": "whatever-1234"},
        )
        assert response.status_code == 400

    def test_forgot_password_is_rate_limited(self, client: TestClient):
        from app.core.config import settings as app_settings

        original = app_settings.PASSWORD_RESET_RATE_LIMIT_PER_HOUR
        app_settings.PASSWORD_RESET_RATE_LIMIT_PER_HOUR = 2
        from app.core.password_reset_guard import reset_password_reset_guard

        reset_password_reset_guard()
        try:
            for _ in range(2):
                ok = client.post(
                    "/api/v1/auth/forgot-password", json={"email": "someone@example.com"}
                )
                assert ok.status_code == 200

            limited = client.post(
                "/api/v1/auth/forgot-password", json={"email": "someone@example.com"}
            )
            assert limited.status_code == 429
        finally:
            app_settings.PASSWORD_RESET_RATE_LIMIT_PER_HOUR = original
            reset_password_reset_guard()
