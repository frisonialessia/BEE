"""GET /webhooks/status must never 500 because a registered ingestion
provider has no credential entry in SecretManager.

Regression: the endpoint asked ``get_webhook_secret()`` for every provider
the ExternalAPIOrchestrator lists — including ``hiring``, which has no
``*_WEBHOOK_SECRET`` of its own — and SecretManager raised ``ValueError:
Unknown provider`` for it, turning the Control page's "APIs externas" panel
into a CORS-looking failure in the browser (500s carry no CORS headers).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.secret_manager import get_secret_manager


def test_unknown_provider_falls_back_to_global_secret() -> None:
    secret = get_secret_manager().get_webhook_secret("hiring")
    # Whatever the global WEBHOOK_SIGNING_SECRET resolves to in this
    # environment — the point is that this returns instead of raising.
    assert secret is None or isinstance(secret, str)


def test_webhook_status_endpoint_returns_200(client: TestClient) -> None:
    resp = client.get("/api/v1/webhooks/status")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "providers" in body
    assert all("webhook_configured" in p for p in body["providers"])
