"""
studio_credit + past_works self-test.

    cd backend && python -m tests.test_studio_credit

Two owner asks:
  1. A studio's invitations carry a "Managed by <Studio>" credit linking to their
     portfolio — but ONLY when the studio holds a PREMIUM portfolio subscription
     with a published portfolio. Free/basic studios get no credit. And a premium
     photographer's portfolio URL travels with the event request in the admin
     fulfillment console.
  2. The portfolio gains a "Past Works" section — up to 5 finished works with
     photos — capped and cleaned on save.

In-memory FakeDB; no network.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ.setdefault("STORAGE_CRED_KEY", Fernet.generate_key().decode())

from tests.test_storage_orchestrator import FakeDB
import studio_credit as sc


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _premium(db, admin_id, published=True, name="Golden Lens"):
    await db.admins.insert_one({"id": admin_id, "name": "Ravi", "role": "admin"})
    await db.portfolio_profiles.insert_one({
        "id": admin_id, "studio_id": admin_id, "studio_name": name,
        "slug": "golden-lens", "is_published": published})
    # An active premium portfolio subscription.
    await db.subscriptions.insert_one({
        "id": f"sub_{admin_id}", "studio_id": admin_id, "product": "portfolio",
        "status": "active", "plan_id": "plan_portfolio_premium", "tier": "Premium"})
    await db.subscription_plans.insert_one({
        "id": "plan_portfolio_premium", "product": "portfolio", "tier": "Premium",
        "portfolio_tier": "premium", "is_active": True})


async def test_credit_gated_on_premium_and_published():
    print("\n[1] the 'Managed by' credit is a premium-only, published-only perk")
    db = FakeDB()
    await _premium(db, "adm_premium")
    c = await sc.studio_credit(db, "adm_premium")
    _check(c["show"] is True, "a premium studio with a published portfolio IS credited")
    _check(c["is_premium"] is True, "it is recognised as premium")
    _check(c["studio_name"] == "Golden Lens", "the studio name is carried")
    _check(c["portfolio_url"] == "/photographer/golden-lens/portfolio",
           "the credit links to the studio's public portfolio")

    # Premium but NOT published — no credit, or it would land on an empty page.
    db2 = FakeDB()
    await _premium(db2, "adm_unpub", published=False)
    c2 = await sc.studio_credit(db2, "adm_unpub")
    _check(c2["is_premium"] is True and c2["show"] is False,
           "a premium studio with an UNPUBLISHED portfolio is not credited publicly")

    # A free / basic studio — never credited.
    db3 = FakeDB()
    await db3.admins.insert_one({"id": "adm_free", "name": "Basic Studio", "role": "admin"})
    await db3.portfolio_profiles.insert_one({"id": "adm_free", "is_published": True, "slug": "basic"})
    c3 = await sc.studio_credit(db3, "adm_free")
    _check(c3["show"] is False and c3["is_premium"] is False,
           "a free/basic studio is never credited")

    # No admin id (a couple's own self-serve link).
    c4 = await sc.studio_credit(db, None)
    _check(c4["show"] is False, "an invitation with no studio behind it shows no credit")


async def test_invitation_view_gate():
    print("\n[2] the invitation payload carries the credit only when show=True")
    # Mirrors server._studio_credit_for_profile without importing server (which
    # needs a live DB env): the payload gets the credit iff studio_credit.show.
    db = FakeDB()
    await _premium(db, "adm_premium")
    c = await sc.studio_credit(db, "adm_premium")
    managed_by = c if c.get("show") else None
    _check(managed_by and managed_by["studio_name"] == "Golden Lens",
           "a premium+published studio's invitation carries managed_by")

    db2 = FakeDB()
    await _premium(db2, "adm_unpub", published=False)
    c2 = await sc.studio_credit(db2, "adm_unpub")
    _check((c2 if c2.get("show") else None) is None,
           "an unpublished premium studio's invitation carries no credit")


async def test_fulfillment_card_shows_portfolio_for_premium():
    print("\n[3] the admin request shows a premium photographer's portfolio URL")
    import fulfillment_service as fs
    db = FakeDB()
    await _premium(db, "adm_premium")
    await db.invitation_orders.insert_one({
        "id": "invord_1", "fulfillment_code": "MAJA-XY99ZZ",
        "buyer_kind": "photographer", "user_id": "adm_premium",
        "status": "paid", "build_status": "building", "info": {"bride_name": "A", "groom_name": "B"}})

    router = fs.build_fulfillment_router(db, require_super_admin=lambda: {"role": "super_admin"})
    list_ep = next(r.endpoint for r in router.routes
                   if getattr(r, "path", None) == "/api/admin/fulfillment/requests"
                   and "GET" in getattr(r, "methods", set()))
    card = (await list_ep(_s={"role": "super_admin"}))["requests"][0]
    sp = card["studio_portfolio"]
    _check(sp and sp["portfolio_url"] == "/photographer/golden-lens/portfolio",
           "a premium photographer's portfolio URL travels with the request")
    _check(sp["studio_name"] == "Golden Lens", "the studio name is on the card")

    # A normal-user buyer has no studio portfolio.
    await db.invitation_orders.insert_one({
        "id": "invord_2", "fulfillment_code": "MAJA-USER11", "buyer_kind": "user",
        "user_id": "u1", "status": "paid", "build_status": "building", "info": {}})
    cards = (await list_ep(_s={"role": "super_admin"}))["requests"]
    user_card = next(c for c in cards if c["code"] == "MAJA-USER11")
    _check(user_card["studio_portfolio"] is None, "a normal-user request has no studio portfolio")


async def test_past_works_capped_and_cleaned():
    print("\n[4] Past Works is capped at 5 and empty rows are dropped")
    import portfolio_service as ps
    db = FakeDB()
    router = ps.build_portfolio_router(db, require_admin=lambda: {"admin_id": "adm_pw"})
    put = next(r.endpoint for r in router.routes
              if getattr(r, "path", None) == "/api/portfolio/profile"
              and "PUT" in getattr(r, "methods", set()))

    works = [{"image": f"https://x/{i}.jpg", "title": f"Work {i}"} for i in range(7)]
    works.insert(2, {"title": "no image — should be dropped"})
    out = await put(ps.ProfileIn(past_works=works), admin={"admin_id": "adm_pw"})
    saved = out["profile"]["past_works"]
    _check(len(saved) == 5, "no more than 5 past works are stored (a highlight reel)")
    _check(all(w.get("image") for w in saved), "a row with no image is dropped, never rendered as a gap")

    # A partial save that does NOT mention past_works must not wipe them.
    await put(ps.ProfileIn(tagline="We shoot weddings"), admin={"admin_id": "adm_pw"})
    prof = await db.portfolio_profiles.find_one({"id": "adm_pw"}, {"_id": 0})
    _check(len(prof.get("past_works", [])) == 5,
           "a partial save of other fields keeps past works intact (exclude_unset)")


async def main():
    print("MAJA — 'Managed by <Studio>' credit + portfolio Past Works")
    await test_credit_gated_on_premium_and_published()
    await test_invitation_view_gate()
    await test_fulfillment_card_shows_portfolio_for_premium()
    await test_past_works_capped_and_cleaned()
    print("\nALL STUDIO-CREDIT & PAST-WORKS CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
