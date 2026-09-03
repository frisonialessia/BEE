"""SSOService — see app.services.sso.service for the WorkOS handshake and
the rationale for this codebase's SSO design overall."""

from app.services.sso.service import (
    SSOError,
    SSOProfile,
    exchange_code_for_profile,
    get_authorization_url,
    is_globally_configured,
)

__all__ = [
    "SSOError",
    "SSOProfile",
    "exchange_code_for_profile",
    "get_authorization_url",
    "is_globally_configured",
]
