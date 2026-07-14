"""Tests for External Ingestion Layer — SecretManager, rate limiting, webhooks, worker."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.security import compute_signature, verify_provider_webhook_signature
from app.main import app
from app.services.external_api.orchestrator import ExternalAPIOrchestrator
from app.services.external_api.rate_limiter import GlobalRateLimiter
from app.services.external_api.worker import IngestionTask, IngestionTaskType, IngestionWorker
from app.services.secret_manager import SecretManager

# ---------------------------------------------------------------------------
# SecretManager
# ---------------------------------------------------------------------------


class TestSecretManager:
    def test_linkedin_not_configured_by_default(self):
        mgr = SecretManager()
        assert not mgr.is_configured("linkedin")

    def test_credentials_never_expose_raw_secrets_in_repr(self):
        with patch("app.services.secret_manager.service.get_settings") as mock_cfg:
            mock_cfg.return_value.LINKEDIN_ACCESS_TOKEN = "sk-super-secret-token"
            mock_cfg.return_value.LINKEDIN_CLIENT_ID = None
            mock_cfg.return_value.LINKEDIN_CLIENT_SECRET = None
            mock_cfg.return_value.LINKEDIN_WEBHOOK_SECRET = None
            mock_cfg.return_value.G2_API_KEY = None
            mock_cfg.return_value.G2_WEBHOOK_SECRET = None
            mock_cfg.return_value.GOOGLE_SEARCH_API_KEY = None
            mock_cfg.return_value.GOOGLE_SEARCH_CX = None
            mock_cfg.return_value.GOOGLE_WEBHOOK_SECRET = None
            mock_cfg.return_value.CAPTERRA_API_KEY = None
            mock_cfg.return_value.CAPTERRA_WEBHOOK_SECRET = None
            mock_cfg.return_value.WEBHOOK_SIGNING_SECRET = "global-secret"

            mgr = SecretManager()
            creds = mgr.get("linkedin")
            assert creds.is_configured()
            assert "sk-super-secret" not in repr(creds)

    def test_status_summary_masks_secrets(self):
        mgr = SecretManager()
        summary = mgr.status_summary()
        for provider_data in summary.values():
            for key, val in provider_data.items():
                if key != "configured" and val != "<unset>":
                    assert "..." in str(val) or val == "***"


# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------


class TestGlobalRateLimiter:
    def test_acquire_consumes_tokens(self):
        limiter = GlobalRateLimiter()
        assert limiter.acquire("linkedin") is True
        status = limiter.status()
        assert status["linkedin"]["tokens_remaining"] < status["linkedin"]["capacity"]

    def test_rate_limit_blocks_when_exhausted(self):
        limiter = GlobalRateLimiter()
        # LinkedIn default: 100/hour — exhaust quickly by patching bucket
        bucket = limiter._buckets["linkedin"]  # noqa: SLF001
        bucket._tokens = 0  # noqa: SLF001
        assert limiter.acquire("linkedin") is False


# ---------------------------------------------------------------------------
# LinkedIn provider (mock mode)
# ---------------------------------------------------------------------------


class TestLinkedInProvider:
    def test_mock_profile_when_not_configured(self):
        from app.services.external_api.providers.linkedin import LinkedInProvider

        provider = LinkedInProvider()
        with patch.object(provider, "is_configured", return_value=False):
            result = provider.fetch_lead_profile(
                full_name="Alice Martin",
                company_domain="techfinance.io",
            )
        assert result.success
        assert result.mock
        assert result.lead_name == "Alice Martin"
        assert result.lead_title == "VP Sales"


# ---------------------------------------------------------------------------
# ExternalAPIOrchestrator
# ---------------------------------------------------------------------------


class TestExternalAPIOrchestrator:
    def test_enrich_lead_from_signal_calls_linkedin(self):
        orchestrator = ExternalAPIOrchestrator()
        payload = {
            "company": {"name": "TechFinance", "domain": "techfinance.io"},
            "lead": {"full_name": "Alice Martin", "email": "alice@techfinance.io"},
        }
        enrichment = orchestrator.enrich_lead_from_signal(payload)
        assert "linkedin" in enrichment
        assert "linkedin" in enrichment["providers_called"]
        assert enrichment["linkedin"]["success"] is True
        assert enrichment["lead"]["full_name"] == "Alice Martin"

    def test_rate_limit_blocks_linkedin_call(self):
        orchestrator = ExternalAPIOrchestrator()
        with patch.object(orchestrator, "_acquire_rate_limit", return_value=False):
            result = orchestrator.fetch_linkedin_profile(full_name="Test User")
        assert not result.success
        assert "rate limit" in (result.error or "").lower()


# ---------------------------------------------------------------------------
# Webhook endpoint
# ---------------------------------------------------------------------------


@pytest.fixture
def client():
    return TestClient(app)


class TestWebhookReceive:
    _PAYLOAD = {
        "provider": "linkedin",
        "event_type": "linkedin_research",
        "title": "Lead viewed pricing page",
        "company": {"name": "TechFinance", "domain": "techfinance.io"},
        "lead": {"full_name": "Alice Martin", "email": "alice@techfinance.io"},
    }

    def test_webhook_accepted_without_signature_when_not_required(self, client):
        with patch("app.core.config.get_settings") as mock_cfg:
            settings = MagicMock()
            settings.EXTERNAL_INGESTION_ENABLED = True
            settings.WEBHOOK_SIGNATURE_REQUIRED = False
            settings.EXTERNAL_WORKER_QUEUE_SIZE = 100
            mock_cfg.return_value = settings

            with patch("app.api.v1.endpoints.webhooks.get_ingestion_worker") as mock_worker_fn:
                worker = MagicMock()
                worker.enqueue = AsyncMock(return_value="task-123")
                mock_worker_fn.return_value = worker

                resp = client.post(
                    "/api/v1/webhooks/receive",
                    json=self._PAYLOAD,
                )

        assert resp.status_code == 202
        data = resp.json()
        assert data["task_id"] == "task-123"
        assert data["status"] == "queued"

    def test_webhook_rejected_with_invalid_signature_when_required(self, client):
        with patch("app.core.config.get_settings") as mock_cfg:
            settings = MagicMock()
            settings.EXTERNAL_INGESTION_ENABLED = True
            settings.WEBHOOK_SIGNATURE_REQUIRED = True
            mock_cfg.return_value = settings

            with patch(
                "app.api.v1.endpoints.webhooks.verify_provider_webhook_signature",
                return_value=False,
            ):
                resp = client.post(
                    "/api/v1/webhooks/receive",
                    json=self._PAYLOAD,
                    headers={"X-BEE-Signature": "sha256=invalid"},
                )

        assert resp.status_code == 401

    def test_webhook_exempt_from_api_key_auth(self, client):
        """External webhook endpoint must work without X-API-Key header."""
        with patch("app.core.config.get_settings") as mock_cfg:
            settings = MagicMock()
            settings.EXTERNAL_INGESTION_ENABLED = True
            settings.WEBHOOK_SIGNATURE_REQUIRED = False
            settings.API_SECRET_KEY = "test-api-key-required-for-other-endpoints"
            settings.API_KEY_EXEMPT_PATHS = "/api/v1/health,/api/v1/ready,/api/v1/webhooks/receive"
            settings.EXTERNAL_WORKER_QUEUE_SIZE = 100
            mock_cfg.return_value = settings

            with patch("app.api.v1.endpoints.webhooks.get_ingestion_worker") as mock_worker_fn:
                worker = MagicMock()
                worker.enqueue = AsyncMock(return_value="task-456")
                mock_worker_fn.return_value = worker

                # No X-API-Key header — should still succeed
                resp = client.post("/api/v1/webhooks/receive", json=self._PAYLOAD)

        assert resp.status_code == 202


class TestProviderWebhookSignature:
    def test_valid_signature(self):
        payload = b'{"provider":"g2","event_type":"g2_comparison"}'
        secret = "test-secret"
        sig = compute_signature(payload, secret=secret)

        with patch("app.services.secret_manager.get_secret_manager") as mock_mgr:
            mock_mgr.return_value.get_webhook_secret.return_value = secret
            with patch("app.core.security.settings") as mock_settings:
                mock_settings.WEBHOOK_SIGNATURE_REQUIRED = True
                assert verify_provider_webhook_signature(payload, sig, "g2") is True

    def test_invalid_signature(self):
        payload = b'{"provider":"g2"}'
        with patch("app.services.secret_manager.get_secret_manager") as mock_mgr:
            mock_mgr.return_value.get_webhook_secret.return_value = "real-secret"
            with patch("app.core.security.settings") as mock_settings:
                mock_settings.WEBHOOK_SIGNATURE_REQUIRED = True
                assert verify_provider_webhook_signature(payload, "sha256=bad", "g2") is False


# ---------------------------------------------------------------------------
# Ingestion worker (sync processing mocked)
# ---------------------------------------------------------------------------


class TestIngestionWorker:
    def test_enqueue_returns_task_id(self):
        worker = IngestionWorker(queue_size=10)

        async def run():
            await worker.start()
            task_id = await worker.enqueue(
                IngestionTask(
                    task_type=IngestionTaskType.EXTERNAL_WEBHOOK,
                    provider="linkedin",
                    payload={"event_type": "linkedin_research"},
                )
            )
            await worker.stop()
            return task_id

        import asyncio

        task_id = asyncio.run(run())
        assert task_id

    def test_process_external_webhook_calls_orchestrator(self):
        worker = IngestionWorker()
        task = IngestionTask(
            task_type=IngestionTaskType.EXTERNAL_WEBHOOK,
            provider="linkedin",
            payload={
                "event_type": "page_view",
                "company": {"domain": "techfinance.io", "name": "TechFinance"},
                "lead": {"full_name": "Alice"},
            },
        )

        with (
            patch.object(worker, "_ingest_dark_funnel") as mock_df,
            patch.object(worker, "_ingest_market_signal", return_value=None),
            patch("app.services.external_api.orchestrator.ExternalAPIOrchestrator") as mock_orch_cls,
            patch("app.services.external_api.worker.session_scope") as mock_scope,
        ):
            mock_orch = MagicMock()
            mock_orch.enrich_lead_from_signal.return_value = {
                "linkedin": {"success": True, "lead_title": "VP Sales"},
                "providers_called": ["linkedin"],
                "lead": {"full_name": "Alice", "title": "VP Sales"},
                "company": {"domain": "techfinance.io"},
            }
            mock_orch_cls.return_value = mock_orch

            mock_session = MagicMock()
            mock_scope.return_value.__enter__ = MagicMock(return_value=mock_session)
            mock_scope.return_value.__exit__ = MagicMock(return_value=False)
            worker._process_external_webhook(task)

        mock_orch.enrich_lead_from_signal.assert_called_once()
        mock_df.assert_called_once()
