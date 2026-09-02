"""Tests for the Redis-backed shared-state upgrade path: app.core.redis and
every guard/limiter that uses it (SignupGuard, ReplayGuard,
GlobalRateLimiter). Uses fakeredis — an in-memory fake, same "hermetic, no
external services" testing philosophy as the in-memory SQLite everything
else in this suite already runs against.

Every guard already has its own process-local-fallback test coverage via
the endpoints that use it (test_contact.py, test_auth_multitenancy.py,
test_password_reset.py) — this file only covers the NEW Redis path and the
fallback-on-Redis-failure behavior, not a full re-test of each guard's
business logic.
"""

from __future__ import annotations

import time

import fakeredis
import pytest

from app.core import redis as bee_redis
from app.core.replay_guard import ReplayGuard
from app.core.signup_guard import SignupGuard
from app.services.external_api.rate_limiter import GlobalRateLimiter


@pytest.fixture
def fake_client():
    """A fresh fakeredis instance per test, monkeypatched in as
    app.core.redis.get_redis_client's return value. Every guard imports
    get_redis_client lazily (inside the method body, not at module import
    time), so patching the module attribute here is picked up by all of
    them without needing per-guard patching."""
    client = fakeredis.FakeStrictRedis(decode_responses=True)
    yield client
    client.flushall()


@pytest.fixture(autouse=True)
def _reset_redis_client_cache():
    bee_redis.reset_redis_client_cache()
    yield
    bee_redis.reset_redis_client_cache()


class TestGetRedisClient:
    def test_returns_none_when_unconfigured(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr("app.core.config.settings.REDIS_URL", None)
        assert bee_redis.get_redis_client() is None

    def test_returns_client_when_configured(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr("app.core.config.settings.REDIS_URL", "redis://localhost:6379/0")
        client = bee_redis.get_redis_client()
        assert client is not None

    def test_construction_failure_returns_none_not_raises(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("app.core.config.settings.REDIS_URL", "redis://localhost:6379/0")

        def _boom(*_args, **_kwargs):
            raise ConnectionError("nope")

        monkeypatch.setattr("redis.from_url", _boom)
        assert bee_redis.get_redis_client() is None


class TestSignupGuardRedisPath:
    def test_allows_up_to_max_then_blocks(self, monkeypatch: pytest.MonkeyPatch, fake_client) -> None:
        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        guard = SignupGuard(2, redis_namespace="test_signup")

        assert guard.try_consume("1.2.3.4") is True
        assert guard.try_consume("1.2.3.4") is True
        assert guard.try_consume("1.2.3.4") is False

    def test_different_keys_have_independent_quotas(
        self, monkeypatch: pytest.MonkeyPatch, fake_client
    ) -> None:
        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        guard = SignupGuard(1, redis_namespace="test_signup")

        assert guard.try_consume("1.2.3.4") is True
        assert guard.try_consume("5.6.7.8") is True

    def test_different_namespaces_never_collide(
        self, monkeypatch: pytest.MonkeyPatch, fake_client
    ) -> None:
        """signup_guard and password_reset_guard share this class but must
        never share a quota — same key, different namespace."""
        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        signup = SignupGuard(1, redis_namespace="ns_a")
        password_reset = SignupGuard(1, redis_namespace="ns_b")

        assert signup.try_consume("1.2.3.4") is True
        assert password_reset.try_consume("1.2.3.4") is True  # independent quota

    def test_falls_back_to_local_when_redis_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        class _BrokenClient:
            def pipeline(self):
                raise ConnectionError("redis is down")

        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: _BrokenClient())
        guard = SignupGuard(1, redis_namespace="test_signup")

        # Falls back to the local sliding window instead of raising.
        assert guard.try_consume("1.2.3.4") is True
        assert guard.try_consume("1.2.3.4") is False

    def test_max_zero_disables_check_even_with_redis_configured(
        self, monkeypatch: pytest.MonkeyPatch, fake_client
    ) -> None:
        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        guard = SignupGuard(0, redis_namespace="test_signup")
        for _ in range(10):
            assert guard.try_consume("1.2.3.4") is True


class TestReplayGuardRedisPath:
    def test_first_seen_true_second_seen_false(
        self, monkeypatch: pytest.MonkeyPatch, fake_client
    ) -> None:
        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        guard = ReplayGuard(window_seconds=300)

        assert guard.check_and_record("sig-abc") is True
        assert guard.check_and_record("sig-abc") is False

    def test_expires_after_window(self, monkeypatch: pytest.MonkeyPatch, fake_client) -> None:
        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        guard = ReplayGuard(window_seconds=1)

        assert guard.check_and_record("sig-xyz") is True
        time.sleep(1.2)
        assert guard.check_and_record("sig-xyz") is True

    def test_falls_back_to_local_when_redis_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        class _BrokenClient:
            def set(self, *_args, **_kwargs):
                raise ConnectionError("redis is down")

        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: _BrokenClient())
        guard = ReplayGuard(window_seconds=300)

        assert guard.check_and_record("sig-abc") is True
        assert guard.check_and_record("sig-abc") is False

    def test_disabled_window_always_true_even_with_redis(
        self, monkeypatch: pytest.MonkeyPatch, fake_client
    ) -> None:
        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        guard = ReplayGuard(window_seconds=0)
        assert guard.check_and_record("sig-abc") is True
        assert guard.check_and_record("sig-abc") is True


class TestGlobalRateLimiterRedisPath:
    def test_min_interval_blocks_immediate_repeat(
        self, monkeypatch: pytest.MonkeyPatch, fake_client
    ) -> None:
        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        limiter = GlobalRateLimiter()

        assert limiter.acquire("linkedin") is True
        # linkedin's min_interval_seconds=5.0 — an immediate second call
        # must be rejected even though the hourly count has room left.
        assert limiter.acquire("linkedin") is False

    def test_unknown_provider_always_allowed(
        self, monkeypatch: pytest.MonkeyPatch, fake_client
    ) -> None:
        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: fake_client)
        limiter = GlobalRateLimiter()
        assert limiter.acquire("not_a_real_provider") is True  # type: ignore[arg-type]

    def test_falls_back_to_local_when_redis_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        class _BrokenClient:
            def get(self, *_args, **_kwargs):
                raise ConnectionError("redis is down")

        monkeypatch.setattr("app.core.redis.get_redis_client", lambda: _BrokenClient())
        limiter = GlobalRateLimiter()
        # Falls back to the local token bucket instead of raising.
        assert limiter.acquire("g2") is True
