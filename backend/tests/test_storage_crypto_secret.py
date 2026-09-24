"""storage.crypto.encrypt_secret/decrypt_secret — round-trip + backward compat.

Used for the per-studio Drive OAuth tokens (drive_archive). Must: round-trip
with a key, pass legacy plaintext through untouched, and degrade to plaintext
(no crash) when STORAGE_CRED_KEY is unset.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cryptography.fernet import Fernet  # noqa: E402
from storage.crypto import encrypt_secret, decrypt_secret  # noqa: E402

_KEY = Fernet.generate_key().decode()


def test_roundtrip_with_key():
    os.environ["STORAGE_CRED_KEY"] = _KEY
    tok = encrypt_secret("1//refresh_token_value")
    assert tok.startswith("gAAAA")
    assert decrypt_secret(tok) == "1//refresh_token_value"


def test_legacy_plaintext_passthrough():
    os.environ["STORAGE_CRED_KEY"] = _KEY
    assert decrypt_secret("ya29.plaintext_access_token") == "ya29.plaintext_access_token"


def test_none_and_empty():
    assert encrypt_secret(None) is None
    assert encrypt_secret("") == ""
    assert decrypt_secret(None) is None


def test_degrades_without_key():
    os.environ.pop("STORAGE_CRED_KEY", None)
    assert encrypt_secret("tok") == "tok"
    assert decrypt_secret("tok") == "tok"


def teardown_module(_m):
    os.environ.pop("STORAGE_CRED_KEY", None)
