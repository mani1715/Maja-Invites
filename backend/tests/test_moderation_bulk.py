"""test_moderation_bulk.py — mass moderation on FakeDB.
    cd backend && python -m tests.test_moderation_bulk
"""
from __future__ import annotations
import asyncio, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")
from tests.test_storage_orchestrator import FakeDB          # noqa: E402
import moderation_bulk as mb                                # noqa: E402

PASS = 0; FAIL = []
def ok(l, c):
    global PASS
    if c: PASS += 1; print(f"  ok  {l}")
    else: FAIL.append(l); print(f"  FAIL  {l}")


async def main():
    db = FakeDB()
    for i in (1, 2, 3):
        await db.pixora_posts.insert_one({"id": f"pst{i}", "studio_id": "s1"})
    await db.pixora_reports.insert_one({"id": "rpt1", "status": "open"})
    await db.pixora_reports.insert_one({"id": "rpt2", "status": "open"})
    await db.admins.insert_one({"id": "a1", "status": "active"})
    await db.admins.insert_one({"id": "a2", "status": "active"})
    await db.users.insert_one({"user_id": "u1", "status": "active"})

    # bulk delete content
    res = await mb.bulk_delete_content(db, "post", ["pst1", "pst2", "missing"], actor="admin")
    ok("bulk delete counts", res["deleted"] == 2 and res["not_found"] == ["missing"])
    ok("content actually deleted", await db.pixora_posts.find_one({"id": "pst1"}, {"_id": 0}) is None)
    ok("delete audited", any(a.get("action") == "moderation.bulk_delete" for a in await db.audit_logs.find({}, {"_id": 0}).to_list(50)))
    try:
        await mb.bulk_delete_content(db, "bogus", ["x"])
        ok("unknown target rejected", False)
    except ValueError:
        ok("unknown target rejected", True)
    try:
        await mb.bulk_delete_content(db, "post", [])
        ok("empty ids rejected", False)
    except ValueError:
        ok("empty ids rejected", True)

    # bulk resolve reports
    r = await mb.bulk_resolve_reports(db, ["rpt1", "rpt2", "nope"], actor="admin")
    ok("bulk resolve counts", r["resolved"] == 2)
    ok("report status resolved", (await db.pixora_reports.find_one({"id": "rpt1"}, {"_id": 0}))["status"] == "resolved")

    # bulk suspend + restore accounts
    s = await mb.bulk_set_account_status(db, "photographer", ["a1", "a2"], "suspended", actor="admin")
    ok("bulk suspend updated", s["updated"] == 2 and s["status"] == "suspended")
    ok("account suspended", (await db.admins.find_one({"id": "a1"}, {"_id": 0}))["status"] == "suspended")
    s2 = await mb.bulk_set_account_status(db, "photographer", ["a1"], "active", actor="admin")
    ok("bulk restore works", (await db.admins.find_one({"id": "a1"}, {"_id": 0}))["status"] == "active")
    su = await mb.bulk_set_account_status(db, "user", ["u1"], "blocked", actor="admin")
    ok("user status update", su["updated"] == 1)
    try:
        await mb.bulk_set_account_status(db, "user", ["u1"], "banana")
        ok("invalid status rejected", False)
    except ValueError:
        ok("invalid status rejected", True)

    # reports queue
    q = await mb.list_reports(db, status="open")
    ok("open queue excludes resolved", q["total"] == 0)
    q2 = await mb.list_reports(db, status="all")
    ok("all queue includes resolved", q2["total"] == 2)

    print(f"\nMass Moderation: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
