"""
test_client_studio.py — contracts/e-sign + proofing/selects + print orders, on FakeDB.

    cd backend && python -m tests.test_client_studio
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from tests.test_storage_orchestrator import FakeDB           # noqa: E402
import client_studio_service as cs                           # noqa: E402

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


async def err(coro, exc):
    try:
        await coro
        return False
    except exc:
        return True
    except Exception:
        return False


async def main():
    db = FakeDB()
    await db.profiles.insert_one({"id": "p1", "admin_id": "s1", "slug": "asha-rohan"})
    await db.profiles.insert_one({"id": "p9", "admin_id": "s2", "slug": "other"})

    # ===================== CONTRACTS + E-SIGN =====================
    ok("ownership enforced on create", await err(cs.create_contract(db, "s1", "p9", "T", "terms here..."), PermissionError))
    ok("empty title rejected", await err(cs.create_contract(db, "s1", "p1", "", "terms here..."), ValueError))
    ok("thin body rejected", await err(cs.create_contract(db, "s1", "p1", "Wedding", "short"), ValueError))

    c = (await cs.create_contract(db, "s1", "p1", "Wedding coverage", "Full-day coverage for the wedding.", 50000))["contract"]
    ok("contract created as draft", c["status"] == "draft" and c["amount_inr"] == 50000)

    # client can't see a draft
    ok("client sees no draft", len((await cs.list_contracts_client(db, "p1"))["contracts"]) == 0)
    ok("cannot sign a draft", await err(cs.sign_contract(db, "p1", c["id"], "Asha Rao"), ValueError))

    await cs.send_contract(db, "s1", c["id"])
    ok("client sees sent contract", len((await cs.list_contracts_client(db, "p1"))["contracts"]) == 1)

    # a client of a DIFFERENT profile can't sign it
    ok("cross-profile sign blocked", await err(cs.sign_contract(db, "p9", c["id"], "Hacker"), LookupError))
    ok("short signer name rejected", await err(cs.sign_contract(db, "p1", c["id"], "A"), ValueError))

    signed = await cs.sign_contract(db, "p1", c["id"], "Asha Rao", "203.0.113.7")
    ok("signed ok with audit", signed["ok"] and signed["signer_name"] == "Asha Rao")
    row = await db.studio_contracts.find_one({"id": c["id"]}, {"_id": 0})
    ok("status signed + ip captured", row["status"] == "signed" and row["signer_ip"] == "203.0.113.7")
    ok("re-sign is idempotent", (await cs.sign_contract(db, "p1", c["id"], "Asha Rao"))["already"])

    # void rules
    d = (await cs.create_contract(db, "s1", "p1", "Draft two", "Some other terms here."))["contract"]
    await cs.void_contract(db, "s1", d["id"])
    ok("draft voided", (await db.studio_contracts.find_one({"id": d["id"]}, {"_id": 0}))["status"] == "void")
    ok("signed cannot be voided", await err(cs.void_contract(db, "s1", c["id"]), ValueError))

    # ===================== PROOFING / SELECTS =====================
    ok("gallery ownership enforced", await err(cs.create_gallery(db, "s1", "p9", "Proofs"), PermissionError))
    g = (await cs.create_gallery(db, "s1", "p1", "Sneak peek"))["gallery"]
    added = await cs.add_photos(db, "s1", g["id"], [
        {"image_url": "http://x/1.jpg", "filename": "1.jpg"},
        {"image_url": "http://x/2.jpg"}, {"image_url": ""}])  # blank skipped
    ok("photos added (blank skipped)", added["added"] == 2)
    ok("add to non-owned gallery blocked", await err(cs.add_photos(db, "s2", g["id"], [{"image_url": "http://x/3.jpg"}]), LookupError))

    sg = (await cs.list_galleries_studio(db, "s1", "p1"))["galleries"][0]
    ok("studio sees 2 photos, 0 selected", sg["photo_count"] == 2 and sg["selected_count"] == 0)

    cg = (await cs.list_galleries_client(db, "p1"))["galleries"][0]
    photo_id = cg["photos"][0]["id"]
    ok("cross-profile select blocked", await err(cs.toggle_select(db, "p9", photo_id, True), LookupError))
    await cs.toggle_select(db, "p1", photo_id, True, "Love this one")
    sg2 = (await cs.list_galleries_studio(db, "s1", "p1"))["galleries"][0]
    ok("selection reflected to studio", sg2["selected_count"] == 1)

    # ===================== DOWNLOAD / PRINT =====================
    ok("invalid kind rejected", await err(cs.create_print_order(db, "p1", g["id"], "poster"), ValueError))
    empty = (await cs.create_gallery(db, "s1", "p1", "Empty"))["gallery"]
    ok("no selection rejected", await err(cs.create_print_order(db, "p1", empty["id"], "download"), ValueError))

    order = (await cs.create_print_order(db, "p1", g["id"], "download", "hi-res please"))["order"]
    ok("order captures 1 selected photo", order["photo_count"] == 1 and order["status"] == "new")
    ok("studio lists the order", len((await cs.list_print_orders_studio(db, "s1", "p1"))["orders"]) == 1)
    await cs.set_print_order_status(db, "s1", order["id"], "ready")
    ok("order status updated", (await db.studio_print_orders.find_one({"id": order["id"]}, {"_id": 0}))["status"] == "ready")
    ok("invalid order status rejected", await err(cs.set_print_order_status(db, "s1", order["id"], "teleported"), ValueError))

    print(f"\nClient-Studio: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
