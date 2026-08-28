"""Symmetric encryption for third-party OAuth tokens at rest.

Gmail (and any future OAuth-based integration) access/refresh tokens are
bearer credentials for a real external account — worse to leak than a
password hash, since there's no salted-hash equivalent that still lets us
*use* the credential. They're encrypted with Fernet (AES-128-CBC + HMAC,
from the already-vetted ``cryptography`` package this project already
depends on) before ever touching a database row, using a key that lives
only in ``TOKEN_ENCRYPTION_KEY`` — never in code, never in git, same rule
as every other secret in this codebase (see CLAUDE.md).

Generate a key with:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

This is deliberately lazy (the key is only resolved when a caller actually
tries to encrypt/decrypt) so a deployment that never connects a Gmail
account doesn't need this configured at all — same "opt-in, mock until
configured" convention as every other integration in this codebase.
"""

from __future__ import annotations

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

__all__ = ["TokenDecryptionError", "decrypt_token", "encrypt_token"]


class TokenDecryptionError(Exception):
    """Raised when a stored token can't be decrypted (bad/rotated key, corruption)."""


@lru_cache
def _fernet() -> Fernet:
    key = settings.TOKEN_ENCRYPTION_KEY
    if not key:
        raise RuntimeError(
            "TOKEN_ENCRYPTION_KEY is not configured — set it before connecting any "
            "OAuth integration (see .env.example). Generate one with: "
            'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    try:
        return Fernet(key.encode("utf-8"))
    except (ValueError, TypeError) as exc:
        raise RuntimeError(
            "TOKEN_ENCRYPTION_KEY is set but isn't a valid Fernet key — regenerate it "
            "with the command in .env.example rather than using an arbitrary string."
        ) from exc


def encrypt_token(plaintext: str) -> str:
    """Encrypt a token for storage. Returns an opaque ASCII string."""
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a token read back from storage.

    Raises :class:`TokenDecryptionError` rather than a raw cryptography
    exception so callers (the integrations service) have one thing to catch
    when deciding to surface "reconnect this account" instead of a 500.
    """
    try:
        return _fernet().decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise TokenDecryptionError("Stored token could not be decrypted.") from exc
