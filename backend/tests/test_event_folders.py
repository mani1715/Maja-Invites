"""
event_folders self-test — the two Drive folders + which mail, on details submit.

    cd backend && python -m tests.test_event_folders

The owner's ask: when a photographer finishes entering an invitation's details,
the admin panel gets a notification AND two folders are prepared — one for the QR
gallery photos, one for guest selfies — with their names and the Google mail they
live on shown next to the request.

Proves:
  * both folders are named for EVERY event, deterministically (no duplicates on
    re-run) — the bug fixed here is that the old console only made a QR folder for
    the legacy `live_gallery` add-on and so produced none for à-la-carte orders;
  * the storage account resolves honestly: a real mail when the pool is on, and a
    plain "reserved" reason (never a fake address) when it is off;
  * ensure_order_folders is idempotent and never overwrites an admin's rename;
  * the fulfillment card carries the folders AND the account.

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
import event_folders as ef


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


def _order(**over):
    o = {"id": "invord_1", "fulfillment_code": "MAJA-AB12CD",
         "info": {"bride_name": "Priya", "groom_name": "Arjun"}}
    o.update(over)
    return o


async def test_both_folders_always_named():
    print("\n[1] every event gets BOTH folders, deterministically")
    names = ef.folder_names(_order())
    _check("qr" in names and "selfies" in names, "both a QR and a selfie folder are named")
    _check("Priya & Arjun" in names["qr"] and "Priya & Arjun" in names["selfies"],
           "the couple's names are in the folder names")
    _check("MAJA-AB12CD" in names["qr"], "the fulfillment code is in the name (uniqueness)")
    _check(ef.QR_SUFFIX in names["qr"] and ef.SELFIE_SUFFIX in names["selfies"],
           "each folder is labelled for its purpose")
    _check(ef.folder_names(_order()) == names, "names are deterministic — no duplicates on re-run")

    # The à-la-carte regression: a QR-gallery order whose feature key is the NEW
    # `qr_live_gallery`, not the legacy `live_gallery`, must still get a QR folder.
    alc = ef.folder_names(_order(addons=[{"key": "qr_live_gallery"}, {"key": "ai_face_match"}]))
    _check(bool(alc["qr"]) and bool(alc["selfies"]),
           "an à-la-carte order still gets both folders (the fixed bug)")

    # Missing names must not crash the naming.
    anon = ef.folder_names({"id": "x"})
    _check("Event" in anon["qr"], "an order with no couple names still produces valid folders")


async def test_storage_account_is_honest():
    print("\n[2] the storage mail is real when it exists, honest when it doesn't")
    db = FakeDB()
    # Pool OFF (default): never invent a mail.
    acc = await ef.resolve_storage_account(db)
    _check(acc["provisioned"] is False and acc["email"] is None,
           "pool off -> not provisioned, no address invented")
    _check(bool(acc["reason"]), "a plain reason is given instead of a fake account")
    _check(acc.get("setup_required") is True,
           "with no Google account at all, the panel is told to say exactly that")

    # Pool OFF but a Google account IS registered. The owner still asks "which
    # mail?", and there IS an answer — the folders are reserved on that account.
    # This used to return nothing at all, which is why the panel looked empty.
    await db.storage_accounts.insert_one({
        "id": "acc_0", "kind": "gdrive", "slot": "spare", "status": "idle",
        "label": "MAJA Drive 0", "email": "storage0@majacreations.com"})
    acc = await ef.resolve_storage_account(db)
    _check(acc["email"] == "storage0@majacreations.com",
           "pool off + an account -> the mail IS reported")
    _check(acc["provisioned"] is False and acc["intended"] is True,
           "...but flagged as reserved, not created (no folder is claimed)")
    _check(acc.get("setup_required") is False, "setup is not required once one exists")

    # Pool ON but no drive yet.
    await db.app_settings.insert_one({"key": "storage_pool_enabled", "value": True})
    acc = await ef.resolve_storage_account(db)
    _check(acc["provisioned"] is False, "pool on but no active drive -> still not provisioned")

    # Pool ON with a current active account carrying a mail.
    await db.storage_accounts.insert_one({
        "id": "acc_1", "kind": "gdrive", "slot": "current", "status": "active",
        "label": "MAJA Drive 1", "email": "storage1@majacreations.com"})
    acc = await ef.resolve_storage_account(db)
    _check(acc["provisioned"] is True, "an active current drive is provisioned")
    _check(acc["email"] == "storage1@majacreations.com",
           "the real Google mail is returned so the owner sees where the folders are")
    _check(acc["label"] == "MAJA Drive 1", "the human label comes through too")


async def test_ensure_is_idempotent():
    print("\n[3] stamping folders is idempotent and respects a rename")
    db = FakeDB()
    order = _order()
    await db.invitation_orders.insert_one(dict(order))

    upd = await ef.ensure_order_folders(db, order)
    _check(order["drive_folder_qr"] and order["drive_folder_selfies"],
           "both folder names are stamped onto the order")
    _check("storage_account" in order, "the storage account is stamped too")

    # An admin renamed the QR folder — a re-run must not clobber it.
    order["drive_folder_qr"] = "My Custom Folder"
    upd2 = await ef.ensure_order_folders(db, order)
    _check(order["drive_folder_qr"] == "My Custom Folder",
           "a re-run never overwrites an admin's renamed folder")
    _check("drive_folder_qr" not in upd2, "nothing is re-written for a field already set")

    # The account was stamped when nothing was connected. Connect one now: the
    # reservation must catch up (it is a prediction, not a record), while the
    # renamed folder must NOT. This is what makes an old request start showing
    # the mail instead of staying stuck on "nothing connected" forever.
    _check(order["storage_account"]["email"] is None, "started with no mail (nothing connected)")
    await db.app_settings.insert_one({"key": "storage_pool_enabled", "value": True})
    await db.storage_accounts.insert_one({
        "id": "acc_9", "kind": "gdrive", "slot": "current", "status": "active",
        "label": "MAJA Drive 9", "email": "storage9@majacreations.com"})
    upd3 = await ef.ensure_order_folders(db, order)
    _check(order["storage_account"]["email"] == "storage9@majacreations.com",
           "an old reservation picks up the mail once an account is connected")
    _check(order["storage_account"]["provisioned"] is True, "and is now a real, provisioned folder")
    _check(order["drive_folder_qr"] == "My Custom Folder",
           "the refresh still never touches the renamed folder")
    _check("storage_account" in upd3, "the refresh is persisted, not just returned")

    # Provisioned is a FACT — a later read must not churn it.
    upd4 = await ef.ensure_order_folders(db, order)
    _check(upd4 == {}, "once provisioned, nothing is rewritten on every read")


async def test_fulfillment_card_shows_folders_and_account():
    print("\n[4] the fulfillment card carries the folders and the mail")
    import fulfillment_service as fs
    db = FakeDB()
    await db.app_settings.insert_one({"key": "storage_pool_enabled", "value": True})
    await db.storage_accounts.insert_one({
        "id": "acc_1", "kind": "gdrive", "slot": "current", "status": "active",
        "label": "MAJA Drive 1", "email": "storage1@majacreations.com"})
    await db.invitation_orders.insert_one(_order(status="paid", build_status="building"))

    router = fs.build_fulfillment_router(db, require_super_admin=lambda: {"role": "super_admin"})
    list_ep = next(r.endpoint for r in router.routes
                   if getattr(r, "path", None) == "/api/admin/fulfillment/requests"
                   and "GET" in getattr(r, "methods", set()))
    out = await list_ep(_s={"role": "super_admin"})
    card = out["requests"][0]
    _check(card["drive_folder_qr"] and card["drive_folder_selfies"],
           "the card lists both folder names")
    _check(card["storage_account"] and card["storage_account"]["email"] == "storage1@majacreations.com",
           "the card shows the mail the folders live on")


async def test_submit_info_notifies_admin_with_folders():
    print("\n[5] entering details notifies the admin panel, folders + mail attached")
    import store_features as store
    db = FakeDB()
    await db.app_settings.insert_one({"key": "storage_pool_enabled", "value": True})
    await db.storage_accounts.insert_one({
        "id": "acc_1", "kind": "gdrive", "slot": "current", "status": "active",
        "label": "MAJA Drive 1", "email": "storage1@majacreations.com"})
    await db.invitation_orders.insert_one({
        "id": "invord_1", "fulfillment_code": "MAJA-AB12CD", "user_id": "u1",
        "status": "paid", "build_status": "pending_info", "info": None})

    router = store.build_store_router(
        db, razorpay_client=None,
        get_current_public_user=lambda: {"user_id": "u1", "kind": "user"})
    submit = next(r.endpoint for r in router.routes
                  if getattr(r, "path", None) == "/api/store/order/{order_id}/info"
                  and "POST" in getattr(r, "methods", set()))

    payload = store.OrderInfoRequest(bride_name="Priya", groom_name="Arjun",
                                     venue="Grand Palace", city="Hyderabad")
    out = await submit("invord_1", payload, current={"user_id": "u1", "kind": "user"})
    _check(out["build_status"] == "building", "the order moves to 'building' on first fill")
    _check(out["drive_folder_qr"] and out["drive_folder_selfies"],
           "the response carries both prepared folders")

    notes = await db.admin_notifications.find({}, {"_id": 0}).to_list(10)
    _check(len(notes) == 1, "exactly one admin notification is raised")
    n = notes[0]
    _check(n["type"] == "order_details_submitted", "it is a 'details submitted' notification")
    _check(n["fulfillment_code"] == "MAJA-AB12CD", "it names the request by its code")
    _check("Priya & Arjun" in (n["drive_folder_qr"] or ""),
           "the QR folder name is on the notification")
    _check(n["storage_account_email"] == "storage1@majacreations.com",
           "the mail the folders live on is on the notification")

    # A second fill is an edit, not a fresh build — it must not spam a duplicate.
    await submit("invord_1", store.OrderInfoRequest(bride_name="Priya", groom_name="Arjun"),
                 current={"user_id": "u1", "kind": "user"})
    again = await db.admin_notifications.find({"type": "order_details_submitted"}, {"_id": 0}).to_list(10)
    _check(len(again) == 2, "each submission notifies (owner can see re-submits), but folders are not duplicated")
    order = await db.invitation_orders.find_one({"id": "invord_1"}, {"_id": 0})
    _check(order["drive_folder_qr"].count("MAJA-AB12CD") == 1,
           "the folder name was not doubled by the second submit")


async def main():
    print("MAJA — details submitted -> two folders + which mail, in the admin panel")
    await test_both_folders_always_named()
    await test_storage_account_is_honest()
    await test_ensure_is_idempotent()
    await test_fulfillment_card_shows_folders_and_account()
    await test_submit_info_notifies_admin_with_folders()
    print("\nALL EVENT-FOLDER CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
