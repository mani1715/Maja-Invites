"""
storage.crypto — encryption-at-rest for pooled account credentials.
===================================================================

Pool accounts are platform-wide: a leaked refresh token exposes an entire
15 TB drive, so tokens are NEVER stored in plaintext (unlike the legacy
per-photographer `drive_credentials`, whose blast radius is one studio).

Fernet (AES-128-CBC + HMAC, from `cryptography`) with a key from the
environment:

    STORAGE_CRED_KEY=<urlsafe base64 32-byte key>

Generate one once (never commit it — backend/.env only, gitignored):

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Rotating the key requires re-encrypting stored credentials (re-connect each
account, or run a re-encrypt pass while both keys are known).
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict

from cryptography.fernet import Fernet, InvalidToken

from .base import StorageError


def _fernet() -> Fernet:
    key = os.environ.get("STORAGE_CRED_KEY", "").strip()
    if not key:
        raise StorageError(
            "STORAGE_CRED_KEY is not set. Generate one with "
            "`python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\"` and add it to backend/.env "
            "(never commit it)."
        )
    try:
        return Fernet(key.encode())
    except Exception as e:
        raise StorageError(f"STORAGE_CRED_KEY is not a valid Fernet key: {e}") from e


def encrypt_credentials(creds: Dict[str, Any]) -> str:
    """Dict → opaque ciphertext string safe to store in `storage_accounts`."""
    return _fernet().encrypt(json.dumps(creds).encode("utf-8")).decode("ascii")


def decrypt_credentials(token: str) -> Dict[str, Any]:
    """Ciphertext string → dict. Raises StorageError on tamper/wrong key."""
    try:
        return json.loads(_fernet().decrypt(token.encode("ascii")))
    except InvalidToken as e:
        raise StorageError(
            "Could not decrypt stored credentials — STORAGE_CRED_KEY changed or "
            "data corrupted. Re-connect the account."
        ) from e


# ---------------------------------------------------------------------------
# Single-string secret helpers (for individual token/secret fields, not dicts).
# Backward-compatible on BOTH axes:
#   * legacy plaintext rows (no Fernet prefix) decrypt to themselves, and
#   * a deployment without STORAGE_CRED_KEY set stores plaintext (no regression)
# so enabling encryption never breaks an existing install — it simply activates
# the moment the key is present.
# ---------------------------------------------------------------------------
_FERNET_PREFIX = "gAAAA"  # Fernet tokens (version byte 0x80) always base64 to this


def encrypt_secret(value):
    """Encrypt a short secret string at rest; no-op (plaintext) when no key is set."""
    if not value:
        return value
    try:
        return encrypt_credentials({"v": value})
    except StorageError:
        return value


def decrypt_secret(value):
    """Reverse of encrypt_secret. Legacy plaintext (no Fernet prefix) passes through."""
    if not value or not isinstance(value, str) or not value.startswith(_FERNET_PREFIX):
        return value
    try:
        return decrypt_credentials(value).get("v", value)
    except StorageError:
        return value
