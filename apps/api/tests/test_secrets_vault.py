"""Tests for the AWS Secrets Manager backend of SecretManager
(app.services.secret_manager.aws_backend) — opt-in via
SECRET_BACKEND=aws_secrets_manager, off by default (see test_external_
ingestion.py's TestSecretManager for the pre-existing env-backend coverage,
unaffected by any of this).
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from app.services.secret_manager import SecretManager
from app.services.secret_manager.aws_backend import (
    _fetch_secret_blob,
    get_aws_secret,
    reset_aws_secrets_cache,
)


@pytest.fixture(autouse=True)
def _reset_cache():
    reset_aws_secrets_cache()
    yield
    reset_aws_secrets_cache()


class TestFetchSecretBlob:
    def test_returns_empty_dict_when_secret_id_unset(self):
        with patch("app.services.secret_manager.aws_backend.get_settings") as mock_cfg:
            mock_cfg.return_value.AWS_SECRETS_MANAGER_SECRET_ID = None
            assert _fetch_secret_blob() == {}

    def test_fetches_and_parses_json_secret(self):
        fake_client = MagicMock()
        fake_client.get_secret_value.return_value = {
            "SecretString": json.dumps({"LINKEDIN_ACCESS_TOKEN": "tok-123", "G2_API_KEY": "g2-key"})
        }
        with (
            patch("app.services.secret_manager.aws_backend.get_settings") as mock_cfg,
            patch("boto3.client", return_value=fake_client) as mock_boto_client,
        ):
            mock_cfg.return_value.AWS_SECRETS_MANAGER_SECRET_ID = "bee/prod/secrets"
            mock_cfg.return_value.AWS_REGION = "us-east-1"

            blob = _fetch_secret_blob()

            assert blob == {"LINKEDIN_ACCESS_TOKEN": "tok-123", "G2_API_KEY": "g2-key"}
            mock_boto_client.assert_called_once_with("secretsmanager", region_name="us-east-1")
            fake_client.get_secret_value.assert_called_once_with(SecretId="bee/prod/secrets")

    def test_result_is_cached_across_calls(self):
        fake_client = MagicMock()
        fake_client.get_secret_value.return_value = {"SecretString": json.dumps({"A": "1"})}
        with (
            patch("app.services.secret_manager.aws_backend.get_settings") as mock_cfg,
            patch("boto3.client", return_value=fake_client),
        ):
            mock_cfg.return_value.AWS_SECRETS_MANAGER_SECRET_ID = "bee/prod/secrets"
            mock_cfg.return_value.AWS_REGION = None

            _fetch_secret_blob()
            _fetch_secret_blob()

            assert fake_client.get_secret_value.call_count == 1

    def test_non_dict_json_returns_empty(self):
        fake_client = MagicMock()
        fake_client.get_secret_value.return_value = {"SecretString": json.dumps(["not", "a", "dict"])}
        with (
            patch("app.services.secret_manager.aws_backend.get_settings") as mock_cfg,
            patch("boto3.client", return_value=fake_client),
        ):
            mock_cfg.return_value.AWS_SECRETS_MANAGER_SECRET_ID = "bee/prod/secrets"
            mock_cfg.return_value.AWS_REGION = None
            assert _fetch_secret_blob() == {}

    def test_missing_secret_string_returns_empty(self):
        fake_client = MagicMock()
        fake_client.get_secret_value.return_value = {}
        with (
            patch("app.services.secret_manager.aws_backend.get_settings") as mock_cfg,
            patch("boto3.client", return_value=fake_client),
        ):
            mock_cfg.return_value.AWS_SECRETS_MANAGER_SECRET_ID = "bee/prod/secrets"
            mock_cfg.return_value.AWS_REGION = None
            assert _fetch_secret_blob() == {}

    def test_aws_failure_degrades_to_empty_dict_not_raise(self):
        fake_client = MagicMock()
        fake_client.get_secret_value.side_effect = RuntimeError("boom: throttled")
        with (
            patch("app.services.secret_manager.aws_backend.get_settings") as mock_cfg,
            patch("boto3.client", return_value=fake_client),
        ):
            mock_cfg.return_value.AWS_SECRETS_MANAGER_SECRET_ID = "bee/prod/secrets"
            mock_cfg.return_value.AWS_REGION = None
            assert _fetch_secret_blob() == {}

    def test_get_aws_secret_returns_none_for_missing_key(self):
        with patch("app.services.secret_manager.aws_backend.get_settings") as mock_cfg:
            mock_cfg.return_value.AWS_SECRETS_MANAGER_SECRET_ID = None
            assert get_aws_secret("LINKEDIN_ACCESS_TOKEN") is None


class TestSecretManagerAwsBackendIntegration:
    """SecretManager itself, wired to SECRET_BACKEND=aws_secrets_manager."""

    def test_env_backend_never_touches_aws(self):
        # Default SECRET_BACKEND="env" — _resolve() must not even import
        # aws_backend, so an AWS misconfiguration can't affect the default path.
        with patch("app.services.secret_manager.service.get_settings") as mock_cfg:
            mock_cfg.return_value.SECRET_BACKEND = "env"
            mock_cfg.return_value.LINKEDIN_ACCESS_TOKEN = "env-token"
            mock_cfg.return_value.LINKEDIN_CLIENT_ID = None
            mock_cfg.return_value.LINKEDIN_CLIENT_SECRET = None
            mock_cfg.return_value.LINKEDIN_WEBHOOK_SECRET = None

            mgr = SecretManager()
            creds = mgr.get("linkedin")

            assert creds.access_token == "env-token"

    def test_aws_value_takes_priority_over_env(self):
        with (
            patch("app.services.secret_manager.service.get_settings") as mock_cfg,
            patch("app.services.secret_manager.aws_backend.get_aws_secret") as mock_get_aws,
        ):
            mock_cfg.return_value.SECRET_BACKEND = "aws_secrets_manager"
            mock_cfg.return_value.LINKEDIN_ACCESS_TOKEN = "env-token"
            mock_cfg.return_value.LINKEDIN_CLIENT_ID = None
            mock_cfg.return_value.LINKEDIN_CLIENT_SECRET = None
            mock_cfg.return_value.LINKEDIN_WEBHOOK_SECRET = None
            mock_get_aws.side_effect = lambda key: "aws-token" if key == "LINKEDIN_ACCESS_TOKEN" else None

            mgr = SecretManager()
            creds = mgr.get("linkedin")

            assert creds.access_token == "aws-token"

    def test_falls_back_to_env_when_key_absent_from_aws_secret(self):
        # A key the AWS secret doesn't carry yet (partial migration) must
        # still resolve from the environment, not silently become None.
        with (
            patch("app.services.secret_manager.service.get_settings") as mock_cfg,
            patch("app.services.secret_manager.aws_backend.get_aws_secret", return_value=None),
        ):
            mock_cfg.return_value.SECRET_BACKEND = "aws_secrets_manager"
            mock_cfg.return_value.G2_API_KEY = "env-g2-key"
            mock_cfg.return_value.G2_WEBHOOK_SECRET = None

            mgr = SecretManager()
            creds = mgr.get("g2")

            assert creds.api_key == "env-g2-key"
