"""
test_portfolio_leads.py — public portfolio enquiry → CRM lead, on FakeDB.

    cd backend && python -m tests.test_portfolio_leads
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from tests.test_storage_orchestrator import FakeDB           # noqa: E402
import portfolio_leads as pl                                 # noqa: E402

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


async def expect_error(coro, exc):
    try:
        await coro
        return False
    except exc:
        return True
    except Exception:
        return False


async def main():
    db = FakeDB()
    await db.portfolio_profiles.insert_one({"id": "s1", "slug": "mani-studio", "studio_name": "Mani Studio"})

    # ---- happy path (resolve by slug) ------------------------------------
    res = await pl.create_lead(db, "mani-studio", {
        "name": "Asha Rao", "phone": "+91 90000 11111", "email": "asha@example.com",
        "event_type": "Wedding", "event_date": "2026-12-01", "message": "Need full-day coverage",
    })
    ok("returns ok + lead_id", res["ok"] and res["lead_id"].startswith("cli_"))
    ok("resolves slug -> studio id s1", res["studio_id"] == "s1")

    clients = await db.pixora_crm_clients.find({"studio_id": "s1"}, {"_id": 0}).to_list(100)
    ok("one CRM client created", len(clients) == 1)
    c = clients[0]
    ok("status = lead", c["status"] == "lead")
    ok("source = portfolio", c["source"] == "portfolio")
    ok("name captured", c["name"] == "Asha Rao")
    ok("message stored in notes", c["notes"] == "Need full-day coverage")
    ok("event fields captured", c["event_type"] == "Wedding" and c["event_date"] == "2026-12-01")

    tl = await db.pixora_crm_timeline.find({"client_id": c["id"]}, {"_id": 0}).to_list(100)
    ok("timeline note created (inquiry)", len(tl) == 1 and tl[0]["stage"] == "inquiry")

    # ---- resolve by raw id too -------------------------------------------
    res2 = await pl.create_lead(db, "s1", {"name": "Vik", "phone": "999"})
    ok("resolves raw id s1", res2["studio_id"] == "s1")
    ok("second lead added", len(await db.pixora_crm_clients.find({"studio_id": "s1"}, {"_id": 0}).to_list(100)) == 2)

    # ---- validation -------------------------------------------------------
    ok("empty name rejected", await expect_error(pl.create_lead(db, "s1", {"name": "", "phone": "1"}), ValueError))
    ok("no contact channel rejected", await expect_error(pl.create_lead(db, "s1", {"name": "X"}), ValueError))
    ok("bad email rejected", await expect_error(pl.create_lead(db, "s1", {"name": "X", "email": "not-an-email"}), ValueError))
    ok("unknown studio -> LookupError", await expect_error(pl.create_lead(db, "ghost", {"name": "X", "phone": "1"}), LookupError))

    # a rejected enquiry must NOT have written anything new
    ok("rejects wrote nothing", len(await db.pixora_crm_clients.find({"studio_id": "s1"}, {"_id": 0}).to_list(100)) == 2)

    print(f"\nPortfolio Leads: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
