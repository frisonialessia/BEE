"""SecretManager — typed credential vault backed by environment variables only.

API keys and webhook secrets NEVER live in code or the database. All credentials
are injected via environment variables (Vercel Env, Doppler, AWS Secrets Manager)
and accessed through :class:`SecretManager`.
"""

from app.services.secret_manager.service import (
    ProviderCredentials,
    SecretManager,
    get_secret_manager,
)

__all__ = ["ProviderCredentials", "SecretManager", "get_secret_manager"]
