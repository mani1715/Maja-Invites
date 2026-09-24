"""test_admin_security.py — MFA (TOTP) crypto + RBAC (Phase 1/13) on FakeDB.
    cd backend && python -m tests.test_admin_security

The security-critical part is the TOTP maths — checked against the RFC 6238
official test vector — plus the RBAC catalogue and backup-code handling.
"""
from __future__ import annotations
import asyncio, os, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")
import admin_security as sec                                # noqa: E402

PASS = 0; FAIL = []
def ok(l, c):
    global PASS
    if c: PASS += 1; print(f"  ok  {l}")
    else: FAIL.append(l); print(f"  FAIL  {l}")


# RFC 6238 test secret "12345678901234567890" (ASCII) in base32:
RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"


def main():
    # --- TOTP against RFC 6238 vectors (SHA1, 6 digits, 30s) ---
    ok("RFC 6238 T=59 → 287082", sec.totp(RFC_SECRET, 59) == "287082")
    ok("RFC 6238 T=1111111109 → 081804", sec.totp(RFC_SECRET, 1111111109) == "081804")
    ok("RFC 6238 T=1234567890 → 005924", sec.totp(RFC_SECRET, 1234567890) == "005924")

    # --- verify_totp (current window) ---
    secret = sec.generate_secret()
    now_code = sec.totp(secret, int(time.time()))
    ok("verify accepts current code", sec.verify_totp(secret, now_code) is True)
    ok("verify rejects wrong code", sec.verify_totp(secret, "000000") is False)
    ok("verify rejects empty", sec.verify_totp(secret, "") is False)
    # a code from 30s ago is accepted within the ±1 window
    prev = sec.totp(secret, int(time.time()) - 30)
    ok("verify tolerates 1-step skew", sec.verify_totp(secret, prev, window=1) is True)

    # --- secret + provisioning + backup codes ---
    ok("secret is base32-ish", len(secret) >= 24 and secret.isalnum())
    uri = sec.provisioning_uri(secret, "mani@example.com")
    ok("otpauth uri well-formed", uri.startswith("otpauth://totp/") and f"secret={secret}" in uri and "issuer=MAJA" in uri)
    codes = sec.generate_backup_codes()
    ok("8 unique backup codes", len(codes) == 8 and len(set(codes)) == 8)
    h = sec._hash_code(codes[0])
    ok("backup hash deterministic + matches", h == sec._hash_code(codes[0]) and h != codes[0])

    # --- RBAC catalogue ---
    ok("super_admin has all perms", all(sec.has_permission("super_admin", p) for p in sec.PERMISSIONS))
    ok("finance can refund", sec.has_permission("finance_manager", "billing.refund"))
    ok("moderator cannot refund", not sec.has_permission("moderator", "billing.refund"))
    ok("support can manage tickets", sec.has_permission("support_agent", "support.manage"))
    ok("auditor is read-only (no suspend)", sec.has_permission("read_only_auditor", "users.view")
       and not sec.has_permission("read_only_auditor", "users.suspend"))
    ok("legacy admin has no platform perms", ROLES_empty := (sec.ROLES["admin"] == set()))
    ok("only super_admin can manage roles", sec.has_permission("super_admin", "roles.manage")
       and not sec.has_permission("operations_manager", "roles.manage"))
    ok("impersonate gated to super_admin", sec.has_permission("super_admin", "impersonate")
       and not sec.has_permission("support_agent", "impersonate"))

    print(f"\nAdmin Security: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    main()
    sys.exit(1 if FAIL else 0)
