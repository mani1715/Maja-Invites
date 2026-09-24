"""
test_account_security.py — photographer self-service account security on FakeDB.

    cd backend && python -m tests.test_account_security

Proves password/email/phone change with current-password verification, uniqueness
+ validation guards, Google-account rejection, session revoke, and audit logging.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from tests.test_storage_orchestrator import FakeDB           # noqa: E402
from auth import get_password_hash, verify_password          # noqa: E402
import account_security as acc                                # noqa: E402

PASS = 0
FAIL = []


def ok(label, cond):
    global PASS
    if cond:
        PASS += 1
        print(f"  ok  {label}")
    else:
        FAIL.append(label)
        print(f"  FAIL  {label}")


async def seed(db):
    await db.admins.insert_one({"id": "a1", "name": "Mani Studio", "email": "mani@x.com",
                                "phone": "+9100", "password_hash": get_password_hash("Old@12345")})
    await db.admins.insert_one({"id": "a2", "email": "taken@x.com", "password_hash": get_password_hash("x")})
    await db.admins.insert_one({"id": "g1", "email": "g@x.com", "password_hash": "$supabase$", "supabase_user_id": "sub1"})


async def main():
    db = FakeDB()
    await seed(db)

    # --- summary --------------------------------------------------------------
    s = await acc.account_summary(db, "a1")
    ok("summary shows password account", s["has_password"] is True and s["auth_provider"] == "password")
    sg = await acc.account_summary(db, "g1")
    ok("summary flags google account", sg["auth_provider"] == "google" and sg["has_password"] is False)

    # --- change password ------------------------------------------------------
    try:
        await acc.do_change_password(db, "a1", "wrong", "New@45678")
        ok("wrong current password rejected", False)
    except ValueError:
        ok("wrong current password rejected", True)
    try:
        await acc.do_change_password(db, "a1", "Old@12345", "short")
        ok("short new password rejected", False)
    except ValueError:
        ok("short new password rejected", True)
    r = await acc.do_change_password(db, "a1", "Old@12345", "New@45678")
    ok("password change succeeds", r["ok"] is True)
    a1 = await db.admins.find_one({"id": "a1"}, {"_id": 0})
    ok("new password hash verifies", verify_password("New@45678", a1["password_hash"]))
    ok("old password no longer works", not verify_password("Old@12345", a1["password_hash"]))
    try:
        await acc.do_change_password(db, "g1", "x", "New@45678")
        ok("google account password change rejected", False)
    except ValueError:
        ok("google account password change rejected", True)

    # --- change email ---------------------------------------------------------
    try:
        await acc.do_change_email(db, "a1", "new@x.com", "wrong")
        ok("email change needs correct password", False)
    except ValueError:
        ok("email change needs correct password", True)
    try:
        await acc.do_change_email(db, "a1", "taken@x.com", "New@45678")
        ok("duplicate email rejected", False)
    except ValueError:
        ok("duplicate email rejected", True)
    try:
        await acc.do_change_email(db, "a1", "not-an-email", "New@45678")
        ok("invalid email rejected", False)
    except ValueError:
        ok("invalid email rejected", True)
    re = await acc.do_change_email(db, "a1", "Fresh@X.com", "New@45678")
    ok("email change succeeds + lowercased", re["email"] == "fresh@x.com")

    # --- change phone ---------------------------------------------------------
    rp = await acc.do_change_phone(db, "a1", "+919812345678", "New@45678")
    ok("phone change succeeds", rp["phone"] == "+919812345678")

    # --- revoke device --------------------------------------------------------
    await db.refresh_tokens.insert_one({"id": "rt1", "subject_id": "a1", "device_id": "dev9", "revoked": False})
    await db.device_sessions.insert_one({"id": "ds1", "subject_id": "a1", "device_id": "dev9", "revoked": False})
    await acc.do_revoke_device(db, "a1", "dev9")
    rt = await db.refresh_tokens.find_one({"id": "rt1"}, {"_id": 0})
    ok("revoke device kills refresh token", rt["revoked"] is True)

    # --- audit ----------------------------------------------------------------
    audits = await db.audit_logs.find({"actor_id": "a1"}, {"_id": 0}).to_list(100)
    actions = {a.get("action") for a in audits}
    ok("all changes audited", {"account.password_change", "account.email_change",
                               "account.phone_change", "account.revoke_device"} <= actions)

    print(f"\nAccount Security: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
