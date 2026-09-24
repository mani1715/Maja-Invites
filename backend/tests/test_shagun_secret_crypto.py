"""Per-photographer Razorpay secret is encrypted at rest, with backward-compat.

- STORAGE_CRED_KEY set   -> secret stored as a Fernet token, round-trips.
- legacy plaintext row   -> passes through decrypt unchanged (no crash).
- STORAGE_CRED_KEY unset  -> degrades to plaintext (no regression, no crash).
- GET never echoes the secret (masked).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from cryptography.fernet import Fernet  # noqa: E402

_KEY = Fernet.generate_key().decode()

import premium_features as pf  # noqa: E402


def test_roundtrip_with_key():
    os.environ["STORAGE_CRED_KEY"] = _KEY
    secret = "rzp_l1ve_supersecret_value_123"
    token = pf._encrypt_secret(secret)
    assert token != secret
    assert token.startswith("gAAAA")           # real Fernet ciphertext
    assert pf._decrypt_secret(token) == secret  # round-trips


def test_legacy_plaintext_passthrough():
    os.environ["STORAGE_CRED_KEY"] = _KEY
    # A row written before this change: plaintext, no Fernet prefix.
    assert pf._decrypt_secret("rzp_l1ve_oldplaintext") == "rzp_l1ve_oldplaintext"


def test_empty_and_none():
    assert pf._encrypt_secret(None) is None
    assert pf._encrypt_secret("") == ""
    assert pf._decrypt_secret(None) is None
    assert pf._decrypt_secret("") == ""


def test_degrades_to_plaintext_without_key():
    os.environ.pop("STORAGE_CRED_KEY", None)
    secret = "rzp_l1ve_nokey"
    # No key -> stored as-is (no crash, no regression vs. before this change)
    assert pf._encrypt_secret(secret) == secret
    assert pf._decrypt_secret(secret) == secret


def test_mask_never_echoes_secret():
    masked = pf._mask_shagun({"razorpay_key_secret": "gAAAA_something", "upi_id": "x@y"})
    assert masked["razorpay_key_secret"] == ""
    assert masked["razorpay_key_secret_set"] is True
    assert masked["upi_id"] == "x@y"
    empty = pf._mask_shagun({"upi_id": "x@y"})
    assert empty["razorpay_key_secret_set"] is False


def teardown_module(_m):
    os.environ.pop("STORAGE_CRED_KEY", None)
