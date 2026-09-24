"""
test_user_investigation.py — User Investigation Center on the FakeDB.

    cd backend && python -m tests.test_user_investigation

Proves search + the 360° report: identity, devices, login history, persisted
failed logins + OTP failures, merged IP history with counts, payments,
subscriptions, reports filed, and moderation actions — all guarded, no network.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from tests.test_storage_orchestrator import FakeDB           # noqa: E402
import user_investigation as inv                             # noqa: E402

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
    await db.admins.insert_one({"id": "a1", "name": "Mani Studio", "studio_name": "Mani Studio",
                                "email": "mani@example.com", "phone": "+9199", "role": "admin",
                                "status": "active", "created_at": "2026-01-01T00:00:00+00:00"})
    await db.users.insert_one({"user_id": "u1", "name": "Aditi", "email": "aditi@example.com",
                               "phone": "+9111", "status": "active"})
    # devices for the photographer
    await db.device_sessions.insert_one({"id": "d1", "subject_id": "a1", "device_id": "dev1",
                                         "ua": "Chrome/Win", "ip": "1.1.1.1", "revoked": False,
                                         "last_active": "2026-08-01T10:00:00+00:00"})
    await db.device_sessions.insert_one({"id": "d2", "subject_id": "a1", "device_id": "dev2",
                                         "ua": "Safari/iOS", "ip": "2.2.2.2", "revoked": True,
                                         "last_active": "2026-07-01T10:00:00+00:00"})
    # login audit + a moderation action targeting the photographer
    await db.audit_logs.insert_one({"id": "au1", "actor_id": "a1", "action": "auth.login",
                                    "ip": "1.1.1.1", "created_at": "2026-08-01T10:00:00+00:00"})
    await db.audit_logs.insert_one({"id": "au2", "actor_id": "super", "action": "support.ticket_update",
                                    "target": "a1", "created_at": "2026-08-02T10:00:00+00:00"})
    # persisted failed attempts (what Phase 5 added)
    await inv.record_login_attempt(db, "mani@example.com", "3.3.3.3", "admin", ok=False, reason="bad_password")
    await inv.record_login_attempt(db, "mani@example.com", "3.3.3.3", "admin", ok=False, reason="bad_password")
    await inv.record_login_attempt(db, "+9199", "4.4.4.4", "otp", ok=False, reason="wrong_otp")
    # money + subs + a report the photographer filed
    await db.payment_records.insert_one({"id": "pay1", "admin_id": "a1", "amount": 99900,
                                         "created_at": "2026-06-01T00:00:00+00:00"})
    await db.subscriptions.insert_one({"id": "sub1", "admin_id": "a1", "product": "portfolio",
                                       "status": "active", "created_at": "2026-05-01T00:00:00+00:00"})
    await db.pixora_reports.insert_one({"id": "rpt1", "reporter": "a1", "target_type": "post",
                                        "target_id": "pst9", "reason": "spam", "status": "open"})


async def main():
    db = FakeDB()
    await seed(db)

    # --- search ---------------------------------------------------------------
    res = await inv.search_subjects(db, "mani")
    ok("search finds photographer by name", any(r["id"] == "a1" and r["kind"] == "photographer" for r in res))
    res = await inv.search_subjects(db, "aditi@example.com")
    ok("search finds user by email", any(r["id"] == "u1" and r["kind"] == "user" for r in res))
    ok("empty query returns nothing", await inv.search_subjects(db, "") == [])

    # --- investigate photographer ---------------------------------------------
    rep = await inv.investigate(db, "photographer", "a1")
    ok("identity resolved", rep["subject"]["email"] == "mani@example.com" and rep["subject"]["kind"] == "photographer")
    ok("devices listed (2)", rep["counts"]["devices"] == 2)
    ok("device sorted newest first", rep["devices"][0]["id"] == "d1")
    ok("login history captured", rep["counts"]["logins"] == 1)
    ok("failed logins captured", rep["counts"]["failed_logins"] == 3)
    ok("otp failures split out", rep["counts"]["otp_failures"] == 1)
    ok("ip history merged with counts", rep["counts"]["unique_ips"] >= 3
       and any(e["ip"] == "1.1.1.1" for e in rep["ip_history"]))
    ok("payments by admin_id", rep["counts"]["payments"] == 1 and rep["payments"][0]["id"] == "pay1")
    ok("subscriptions by admin_id", rep["counts"]["subscriptions"] == 1)
    ok("reports filed by subject", rep["counts"]["reports_filed"] == 1)
    ok("moderation actions against subject", rep["counts"]["moderation_actions"] == 1
       and rep["moderation_actions"][0]["action"] == "support.ticket_update")

    # unknown subject
    try:
        await inv.investigate(db, "user", "nope")
        ok("unknown subject raises", False)
    except LookupError:
        ok("unknown subject raises", True)

    # user with no activity still returns a clean, empty report
    rep2 = await inv.investigate(db, "user", "u1")
    ok("empty user report is well-formed", rep2["subject"]["kind"] == "user"
       and rep2["counts"]["devices"] == 0 and isinstance(rep2["ip_history"], list))

    print(f"\nUser Investigation: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
