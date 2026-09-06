"""Tests for the public Contact page submission endpoint.

POST /api/v1/contact is the one endpoint in this codebase whose caller
is genuinely untrusted by design (no auth, no organization) — these
tests cover the write path, the honeypot bypass, the rate limiter, and
that validation failures never silently succeed.
"""

from __future__ import annotations

import pytest
from sqlmodel import Session, select

from app.api.v1.endpoints import contact as contact_endpoint
from app.models.contact_submission import ContactSubmission


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """The rate limiter is a process-global SignupGuard (see contact.py's
    own docstring on why it's shared with signup/password-reset's
    implementation, not a fourth copy). Without resetting it, one test's
    submissions would count against the next test's IP, since TestClient's
    IP is constant."""
    contact_endpoint._guard.reset()
    yield
    contact_endpoint._guard.reset()


VALID_PAYLOAD = {
    "full_name": "Jane Prospect",
    "email": "jane@example.com",
    "company_name": "Example Corp",
    "message": "Interested in a demo of BEE.",
    "source": "hero_primary",
}


class TestContactSubmission:
    def test_valid_submission_persists_and_returns_201(self, client, session: Session) -> None:
        resp = client.post("/api/v1/contact", json=VALID_PAYLOAD)
        assert resp.status_code == 201
        body = resp.json()
        assert "id" in body and "created_at" in body

        rows = session.exec(select(ContactSubmission)).all()
        assert len(rows) == 1
        assert rows[0].email == "jane@example.com"
        assert rows[0].full_name == "Jane Prospect"
        assert rows[0].company_name == "Example Corp"
        assert rows[0].source == "hero_primary"
        assert rows[0].status == "new"

    def test_email_is_lowercased_and_trimmed(self, client, session: Session) -> None:
        payload = {**VALID_PAYLOAD, "email": "  Jane@EXAMPLE.com  ", "full_name": "  Jane  "}
        resp = client.post("/api/v1/contact", json=payload)
        assert resp.status_code == 201
        row = session.exec(select(ContactSubmission)).first()
        assert row.email == "jane@example.com"
        assert row.full_name == "Jane"

    def test_missing_required_field_returns_422_and_does_not_persist(
        self, client, session: Session
    ) -> None:
        # full_name used to be the omitted field here. It became optional in
        # migration 052 so the landing's waitlist can post an email and
        # nothing else, so this now asserts on the one field that is still
        # required — which is also the only one the endpoint cannot do
        # anything useful without.
        resp = client.post("/api/v1/contact", json={"full_name": "Jane", "message": "hi"})
        assert resp.status_code == 422
        assert session.exec(select(ContactSubmission)).first() is None

    def test_invalid_email_returns_422(self, client) -> None:
        payload = {**VALID_PAYLOAD, "email": "not-an-email"}
        resp = client.post("/api/v1/contact", json=payload)
        assert resp.status_code == 422

    def test_optional_fields_can_be_omitted(self, client, session: Session) -> None:
        resp = client.post(
            "/api/v1/contact",
            json={"full_name": "Jane", "email": "jane@example.com", "message": "hi"},
        )
        assert resp.status_code == 201
        row = session.exec(select(ContactSubmission)).first()
        assert row.company_name is None
        assert row.phone is None
        assert row.source is None

    def test_honeypot_filled_returns_fake_success_without_persisting(
        self, client, session: Session
    ) -> None:
        payload = {**VALID_PAYLOAD, "honeypot": "a bot filled this"}
        resp = client.post("/api/v1/contact", json=payload)
        # Fake success — never tell the bot what tripped it.
        assert resp.status_code == 201
        assert "id" in resp.json()
        assert session.exec(select(ContactSubmission)).first() is None

    def test_rate_limit_blocks_after_five_submissions_from_same_client(
        self, client, session: Session
    ) -> None:
        for i in range(5):
            resp = client.post(
                "/api/v1/contact",
                json={**VALID_PAYLOAD, "email": f"jane{i}@example.com"},
            )
            assert resp.status_code == 201, f"submission {i} should succeed"

        resp = client.post(
            "/api/v1/contact",
            json={**VALID_PAYLOAD, "email": "jane-blocked@example.com"},
        )
        assert resp.status_code == 429

        # The blocked attempt must not have been persisted either.
        rows = session.exec(select(ContactSubmission)).all()
        assert len(rows) == 5

    def test_no_api_key_required(self, client) -> None:
        """The whole point of this endpoint — a real anonymous visitor has
        no X-API-Key. Confirmed by simply not setting one (the `client`
        fixture never sets API_SECRET_KEY, matching every other test in
        this suite, but this test exists to document the intent
        explicitly rather than rely on that being implicit)."""
        resp = client.post("/api/v1/contact", json=VALID_PAYLOAD)
        assert resp.status_code == 201


class TestWaitlistSubmission:
    """The landing's primary CTA posts here with an email and nothing else
    (see migration 052 for why name and message became optional rather than
    getting a second table and a second set of abuse defenses)."""

    def test_email_only_submission_is_accepted(self, client, session: Session) -> None:
        res = client.post(
            "/api/v1/contact",
            json={"email": "solo@example.com", "source": "waitlist_hero"},
        )
        assert res.status_code == 201, res.text

        row = session.exec(
            select(ContactSubmission).where(ContactSubmission.email == "solo@example.com")
        ).one()
        assert row.full_name is None
        assert row.message is None
        assert row.source == "waitlist_hero"

    def test_email_is_still_required(self, client) -> None:
        assert client.post("/api/v1/contact", json={"source": "waitlist_hero"}).status_code == 422

    def test_honeypot_still_applies_to_the_waitlist(self, client, session: Session) -> None:
        res = client.post(
            "/api/v1/contact",
            json={"email": "bot@example.com", "source": "waitlist_hero", "honeypot": "x"},
        )
        assert res.status_code == 201  # fake success, on purpose
        assert (
            session.exec(
                select(ContactSubmission).where(ContactSubmission.email == "bot@example.com")
            ).first()
            is None
        )

    def test_signup_is_stored_and_still_201_when_the_mailer_blows_up(
        self, client, session: Session, monkeypatch
    ) -> None:
        """The whole reason _notify_new_submission runs after the commit and
        swallows everything: a broken mailer must never cost a signup, and
        must never be visible to the person signing up either. This is the
        exact failure mode that had password recovery reporting success while
        delivering nothing for weeks — inverted."""
        from app.core.config import get_settings
        from app.services.omnichannel.providers import email as email_provider

        monkeypatch.setattr(
            get_settings(), "WAITLIST_NOTIFY_EMAIL", "founder@example.com", raising=False
        )

        def explode(self, payload):  # noqa: ANN001, ARG001
            raise RuntimeError("smtp is on fire")

        monkeypatch.setattr(email_provider.EmailProvider, "send", explode, raising=True)

        res = client.post(
            "/api/v1/contact", json={"email": "kept@example.com", "source": "waitlist_hero"}
        )
        assert res.status_code == 201, res.text
        assert (
            session.exec(
                select(ContactSubmission).where(ContactSubmission.email == "kept@example.com")
            ).first()
            is not None
        )

    def test_nobody_is_emailed_when_no_notify_address_is_configured(
        self, client, monkeypatch
    ) -> None:
        """Unset is the default and must stay a silent no-op, not an attempt
        against a mock provider that logs a fake send on every signup."""
        from app.core.config import get_settings
        from app.services.omnichannel.providers import email as email_provider

        monkeypatch.setattr(get_settings(), "WAITLIST_NOTIFY_EMAIL", None, raising=False)
        calls: list[object] = []
        monkeypatch.setattr(
            email_provider.EmailProvider,
            "send",
            lambda self, payload: calls.append(payload),  # noqa: ARG005
            raising=True,
        )

        assert (
            client.post(
                "/api/v1/contact", json={"email": "quiet@example.com", "source": "waitlist_hero"}
            ).status_code
            == 201
        )
        assert calls == []
