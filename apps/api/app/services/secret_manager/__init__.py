"""SecretManager — typed credential vault backed by environment variables only.

API keys and webhook secrets NEVER live in code or the database. All credentials
are injected via environment variables (Vercel Env, Doppler, ...) by default, and
accessed through :class:`SecretManager`. Setting ``SECRET_BACKEND=aws_secrets_manager``
(see app/core/config.py) makes SecretManager consult AWS Secrets Manager first,
falling back to the environment — see aws_backend.py for the fetch/cache logic.
"""

from app.services.secret_manager.service import (
    ProviderCredentials,
    SecretManager,
    get_secret_manager,
)

__all__ = ["ProviderCredentials", "SecretManager", "get_secret_manager"]
