"""test_disputes.py — Disputes & chargebacks lifecycle on FakeDB.
    cd backend && python -m tests.test_disputes
"""
from __future__ import annotations
import asyncio, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")
from tests.test_storage_orchestrator import FakeDB          # noqa: E402
import disputes as dp                                       # noqa: E402

PASS = 0; FAIL = []
def ok(label, cond):
    global PASS
    if cond: PASS += 1; print(f"  ok  {label}")
    else: FAIL.append(label); print(f"  FAIL  {label}")


async def main():
    db = FakeDB()
    d = await dp.create_dispute(db, kind="chargeback", payment_id="pay_1", amount_paise=99900,
                                reason="bank chargeback", actor="a1")
    did = d["id"]
    ok("dispute created open", d["status"] == "open" and d["kind"] == "chargeback")
    ok("create audited", any(a.get("action") == "dispute.create" for a in await db.audit_logs.find({}, {"_id": 0}).to_list(50)))
    try:
        await dp.create_dispute(db, kind="bogus", payment_id="x")
        ok("invalid kind rejected", False)
    except ValueError:
        ok("invalid kind rejected", True)
    try:
        await dp.create_dispute(db, kind="chargeback", payment_id="")
        ok("missing payment_id rejected", False)
    except ValueError:
        ok("missing payment_id rejected", True)

    d = await dp.add_evidence(db, did, "Uploaded delivery proof", url="http://x/proof.pdf", actor="a1")
    ok("evidence added + status advances", len(d["evidence"]) == 1 and d["status"] == "evidence_submitted")

    d = await dp.update_dispute(db, did, {"status": "won", "assignee_admin_id": "a1"}, actor="a1")
    ok("resolve stamps resolved_at", d["status"] == "won" and d["resolved_at"] is not None)
    ok("assignee set", d["assignee_admin_id"] == "a1")
    try:
        await dp.update_dispute(db, did, {"status": "banana"})
        ok("invalid status rejected", False)
    except ValueError:
        ok("invalid status rejected", True)

    await dp.create_dispute(db, kind="refund_dispute", payment_id="pay_2", amount_paise=50000, actor="a1")
    lst = await dp.list_disputes(db, kind="refund_dispute")
    ok("filter by kind", lst["total"] == 1 and lst["items"][0]["payment_id"] == "pay_2")
    lst = await dp.list_disputes(db, q="pay_1")
    ok("search by payment id", any(i["id"] == did for i in lst["items"]))
    lst = await dp.list_disputes(db, page=1, page_size=1)
    ok("pagination", lst["page_size"] == 1 and lst["pages"] == 2)

    stats = await dp.dispute_stats(db)
    ok("stats total", stats["total"] == 2)
    # only the open refund_dispute (50000) is at risk; the won chargeback is resolved
    ok("amount at risk = open only", stats["amount_at_risk_paise"] == 50000)
    ok("by_status present", "won" in stats["by_status"])

    try:
        await dp.add_evidence(db, "nope", "x")
        ok("evidence on missing dispute 404", False)
    except LookupError:
        ok("evidence on missing dispute 404", True)

    print(f"\nDisputes: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
