"""
studio_folders self-test — the folder a photographer gets when they buy.

    cd backend && python -m tests.test_studio_folders

The owner's ask: buying Portfolio creates one folder; buying Cloud Storage
creates one folder; and opening that photographer in the admin panel shows each
folder's name, the Google mail it lives on, and (for cloud storage) GB used of
GB total.

Proves:
  * a folder is reserved once per (photographer, kind), deterministic, idempotent
    — a re-run (e.g. a renewal) never makes a second folder or overwrites a rename;
  * the mail resolves honestly — a real address only when the storage pool is on
    with a live drive, a plain reason otherwise, never a fabricated account;
  * the photographer-detail endpoint returns a cloud_storage block with GB
    used/total and the folder, plus the portfolio folder.

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
import studio_folders as sf


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _admin(db, **over):
    doc = {"id": "adm_123456", "role": "admin", "studio_name": "Golden Lens", "name": "Ravi"}
    doc.update(over)
    await db.admins.insert_one(doc)
    return doc


async def test_folder_naming():
    print("\n[1] each studio folder is named deterministically")
    a = {"id": "adm_123456", "studio_name": "Golden Lens"}
    p = sf.folder_name(a, "portfolio")
    c = sf.folder_name(a, "cloud_storage")
    _check("Golden Lens" in p and "Portfolio" in p, "portfolio folder names the studio + purpose")
    _check("Golden Lens" in c and "Cloud Storage" in c, "cloud folder names the studio + purpose")
    _check("123456" in p, "the admin id tail is in the name (uniqueness across same-named studios)")
    _check(sf.folder_name(a, "portfolio") == p, "naming is deterministic")
    # A studio with only a username still gets a sensible name.
    _check("Studio" in sf.folder_name({"id": "x"}, "portfolio") or
           sf.folder_name({"id": "x", "username": "raviphoto"}, "portfolio").startswith("raviphoto"),
           "a studio with no studio_name still produces a valid folder name")

    try:
        sf.folder_name(a, "not_a_kind")   # naming tolerates unknown suffix
        _check(True, "folder_name does not crash on an odd kind")
    except Exception:
        _check(False, "folder_name must not crash on an odd kind")


async def test_reserve_is_idempotent_and_honest():
    print("\n[2] buying reserves one folder; the mail is honest")
    db = FakeDB()
    await _admin(db)

    # Pool OFF (default): folder reserved, but no invented mail.
    rec = await sf.ensure_studio_folder(db, "adm_123456", "portfolio")
    _check(rec["name"] and "Portfolio" in rec["name"], "the portfolio folder is reserved with a name")
    _check(rec["account"]["provisioned"] is False and rec["account"]["email"] is None,
           "pool off -> no mail is invented, just a reason")
    _check(bool(rec["account"]["reason"]), "a plain reason is recorded instead of a fake account")

    # Idempotent: a renewal re-runs ensure and must not change or duplicate it.
    rec2 = await sf.ensure_studio_folder(db, "adm_123456", "portfolio")
    _check(rec2["name"] == rec["name"] and rec2["reserved_at"] == rec["reserved_at"],
           "re-running returns the SAME folder — no duplicate, no re-stamp")

    # An admin rename survives a re-run.
    admin = await db.admins.find_one({"id": "adm_123456"}, {"_id": 0})
    admin["studio_folders"]["portfolio"]["name"] = "Ravi's Custom Portfolio"
    await db.admins.update_one({"id": "adm_123456"}, {"$set": {"studio_folders": admin["studio_folders"]}})
    rec3 = await sf.ensure_studio_folder(db, "adm_123456", "portfolio")
    _check(rec3["name"] == "Ravi's Custom Portfolio", "a re-run never overwrites an admin's renamed folder")

    # Cloud storage is a SEPARATE folder from portfolio.
    cs = await sf.ensure_studio_folder(db, "adm_123456", "cloud_storage")
    _check(cs["name"] != rec3["name"] and "Cloud Storage" in cs["name"],
           "cloud storage gets its own distinct folder")

    # Pool ON with a live drive -> the real mail shows up on the NEXT reservation.
    await db.app_settings.insert_one({"key": "storage_pool_enabled", "value": True})
    await db.storage_accounts.insert_one({
        "id": "acc_1", "kind": "gdrive", "slot": "current", "status": "active",
        "label": "MAJA Drive 1", "email": "storage1@majacreations.com"})
    await _admin(db, id="adm_999", studio_name="Silver Frame")
    live = await sf.ensure_studio_folder(db, "adm_999", "cloud_storage")
    _check(live["account"]["provisioned"] is True and
           live["account"]["email"] == "storage1@majacreations.com",
           "with the pool on, the folder records the real Google mail it lives on")

    # adm_123456's folders were reserved BEFORE any account existed. Reading them
    # now must pick up the mail — otherwise the admin panel shows "no mail" for
    # every studio that bought early, forever. The rename must still survive.
    refreshed = await sf.refresh_accounts(db, "adm_123456")
    _check(refreshed["portfolio"]["account"]["email"] == "storage1@majacreations.com",
           "an early reservation picks up the mail once an account is connected")
    _check(refreshed["portfolio"]["name"] == "Ravi's Custom Portfolio",
           "the refresh never touches the folder name")
    _check(refreshed["cloud_storage"]["account"]["provisioned"] is True,
           "both of the studio's folders are refreshed together")
    stored = await db.admins.find_one({"id": "adm_123456"}, {"_id": 0})
    _check(stored["studio_folders"]["portfolio"]["account"]["email"] == "storage1@majacreations.com",
           "the refresh is persisted, so the panel reads it directly")
    _check(await sf.refresh_accounts(db, "adm_nobody") == {},
           "a studio with no folders refreshes to nothing (no crash)")


async def test_detail_endpoint_surfaces_storage():
    print("\n[3] the admin photographer detail shows cloud storage + both folders")
    import monetization_features as mon
    db = FakeDB()
    await db.app_settings.insert_one({"key": "storage_pool_enabled", "value": True})
    await db.storage_accounts.insert_one({
        "id": "acc_1", "kind": "gdrive", "slot": "current", "status": "active",
        "label": "MAJA Drive 1", "email": "storage1@majacreations.com"})
    await _admin(db, id="adm_p")

    # Reserve both folders (as the two purchase paths do).
    await sf.ensure_studio_folder(db, "adm_p", "portfolio")
    await sf.ensure_studio_folder(db, "adm_p", "cloud_storage")

    # A cloud-storage plan + subscription with usage.
    await db.studio_storage_plans.insert_one(
        {"id": "plan_pro", "name": "Pro", "gb_limit": 1024, "duration_days": 30})
    await db.studio_storage_subscriptions.insert_one({
        "id": "sub_cs", "admin_id": "adm_p", "plan_id": "plan_pro",
        "status": "active", "used_bytes": 512 * 1024 * 1024 * 1024})  # 512 GB used of 1024

    router = mon.build_monetization_router(
        db, require_admin=lambda: "owner", require_super_admin=lambda: "owner",
        credit_service=None, razorpay_client=None)
    detail = next(r.endpoint for r in router.routes
                  if getattr(r, "path", None) == "/api/super-admin/photographers/{admin_id}/detail")
    out = await detail("adm_p", super_admin_id="owner")

    cs = out["cloud_storage"]
    _check(cs["active"] is True and cs["plan_name"] == "Pro", "the cloud storage plan shows")
    _check(cs["gb_limit"] == 1024 and cs["used_percent"] == 50.0,
           "GB used of GB total is computed (512 of 1024 = 50%)")
    _check(cs["folder"] and cs["folder"]["account"]["email"] == "storage1@majacreations.com",
           "the cloud storage folder shows its name and the mail it lives on")
    _check(out["portfolio"]["folder"] and "Portfolio" in out["portfolio"]["folder"]["name"],
           "the portfolio folder shows alongside the portfolio block")


async def test_backfill_existing_buyers():
    print("\n[4] the backfill reserves folders for buyers from before the hooks")
    db = FakeDB()
    # Two portfolio buyers (one with two subs — must not double-count), one
    # cloud-storage buyer, and one photographer who bought NOTHING.
    await _admin(db, id="p1", studio_name="A")
    await _admin(db, id="p2", studio_name="B")
    await _admin(db, id="c1", studio_name="C")
    await _admin(db, id="none", studio_name="Never Bought")
    await db.subscriptions.insert_one({"id": "s1", "studio_id": "p1", "product": "portfolio"})
    await db.subscriptions.insert_one({"id": "s2", "studio_id": "p1", "product": "portfolio"})
    await db.subscriptions.insert_one({"id": "s3", "studio_id": "p2", "product": "portfolio"})
    # A non-portfolio subscription must not trigger a portfolio folder.
    await db.subscriptions.insert_one({"id": "s4", "studio_id": "none", "product": "backup"})
    await db.studio_storage_subscriptions.insert_one({"id": "cs1", "admin_id": "c1"})

    made = await sf.backfill_studio_folders(db)
    _check(made["portfolio"] == 2, "exactly the 2 distinct portfolio buyers got a folder (p1 not double-counted)")
    _check(made["cloud_storage"] == 1, "the 1 cloud-storage buyer got a folder")

    _check(await sf.studio_folder(db, "p1", "portfolio") is not None, "p1 has a portfolio folder")
    _check(await sf.studio_folder(db, "none", "portfolio") is None,
           "the photographer who bought nothing has NO folder")
    _check(await sf.studio_folder(db, "c1", "cloud_storage") is not None, "c1 has a cloud-storage folder")

    # Running it again is a no-op — safe on every startup.
    again = await sf.backfill_studio_folders(db)
    _check(again["portfolio"] == 0 and again["cloud_storage"] == 0,
           "a second run reserves nothing (idempotent, safe on every boot)")


async def main():
    print("MAJA — studio folders: one per purchase, with name + which mail, in the admin panel")
    await test_folder_naming()
    await test_reserve_is_idempotent_and_honest()
    await test_detail_endpoint_surfaces_storage()
    await test_backfill_existing_buyers()
    print("\nALL STUDIO-FOLDER CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
