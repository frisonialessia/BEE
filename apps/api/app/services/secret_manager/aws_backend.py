"""AWS Secrets Manager backend for :class:`SecretManager` — opt-in via
``SECRET_BACKEND=aws_secrets_manager`` (see app/core/config.py).

Off by default: every environment that doesn't set SECRET_BACKEND keeps
today's behavior exactly — credentials read from the environment via
Settings, see service.py. When enabled, this module fetches ONE secret
from AWS Secrets Manager — a JSON object whose keys are the same
environment-variable names Settings already uses (e.g.
``{"LINKEDIN_ACCESS_TOKEN": "...", "SENDGRID_WEBHOOK_SECRET": "..."}``) —
and SecretManager consults it before falling back to the environment, so a
partially-populated AWS secret degrades gracefully instead of breaking
providers that haven't been migrated to it yet.

Fetched once per process and cached (see :func:`reset_aws_secrets_cache`
for tests) — this is a cold-start-per-invocation cost on serverless, the
same tradeoff already accepted for ``get_redis_client()`` and the vector
store. boto3 is imported lazily inside the fetch function, not at module
load, so importing this module — and therefore importing
``secret_manager.service`` — never requires boto3 to be installed unless
the backend is actually enabled and reached.
"""

from __future__ import annotations

import json
from functools import lru_cache

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


@lru_cache
def _fetch_secret_blob() -> dict[str, str]:
    """Fetch and parse the configured AWS secret once per process.

    Returns an empty dict — never raises — on any failure: an
    unconfigured, misconfigured, or unreachable AWS backend must not take
    down the app. Callers just fall back to environment variables, the
    same as if the backend were off.
    """
    settings = get_settings()
    secret_id = settings.AWS_SECRETS_MANAGER_SECRET_ID
    if not secret_id:
        logger.warning(
            "aws_secrets_manager_not_configured",
            extra={"reason": "AWS_SECRETS_MANAGER_SECRET_ID unset"},
        )
        return {}
    try:
        import boto3  # noqa: PLC0415 — lazy: only needed when this backend is enabled

        client = boto3.client("secretsmanager", region_name=settings.AWS_REGION or None)
        response = client.get_secret_value(SecretId=secret_id)
        raw = response.get("SecretString")
        if not raw:
            return {}
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            logger.warning("aws_secrets_manager_invalid_shape", extra={"secret_id": secret_id})
            return {}
        return {str(k): str(v) for k, v in parsed.items() if v is not None}
    except Exception:  # noqa: BLE001 — any AWS/network/parse failure degrades to "unconfigured"
        logger.exception("aws_secrets_manager_fetch_failed", extra={"secret_id": secret_id})
        return {}


def get_aws_secret(key: str) -> str | None:
    """Return one value from the cached AWS secret blob, or None."""
    return _fetch_secret_blob().get(key)


def reset_aws_secrets_cache() -> None:
    """Clear the cached blob — tests only, mirrors reset_redis_client_cache()."""
    _fetch_secret_blob.cache_clear()
