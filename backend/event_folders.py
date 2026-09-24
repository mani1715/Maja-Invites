"""
event_folders.py — the two Drive folders every photo event needs, named once.

When a photographer finishes entering an invitation's details, the owner wants:
  * a folder for the QR-gallery photos guests collect, and
  * a folder for guest selfie / photo-request uploads,
plus the NAMES of those folders AND the storage account (the Google mail) they
live on, shown next to the request in the admin panel.

This is the single source of truth for the folder names, imported by BOTH the
store's info-submit path (which stamps them the moment details arrive) and the
fulfillment console (which shows them). One function, so the two can never drift.

The bug it fixes: the console used to key the QR folder off the legacy add-on
`live_gallery`, but the à-la-carte cart now sells that capability as
`qr_live_gallery` / `guest_uploads`. So every à-la-carte order silently got NO
QR folder. Both folders are now produced unconditionally — the owner asked for
"2 folders" per event, and an empty folder costs nothing while a missing one
loses photos.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger("event_folders")

# The two folders, in the owner's words. Values are suffixes appended to a
# per-event prefix so names are unique AND human-readable in Drive.
QR_SUFFIX = "All Photos (QR)"
SELFIE_SUFFIX = "Guest Photo Requests (Selfies)"


def _couple_label(order: Dict[str, Any]) -> str:
    info = order.get("info") or {}
    extra = info.get("extra") or {}
    bride = str(info.get("bride_name") or extra.get("bride_name") or "").strip()
    groom = str(info.get("groom_name") or extra.get("groom_name") or "").strip()
    couple = " & ".join([n for n in (bride, groom) if n])
    return couple or "Event"


def folder_names(order: Dict[str, Any]) -> Dict[str, str]:
    """Deterministic names for the QR and selfie folders of one order.

    Deterministic on `fulfillment_code`, so re-running never makes duplicates.
    Always returns BOTH — every photo event gets a QR folder and a selfie folder.
    """
    code = order.get("fulfillment_code") or order.get("id") or "MAJA"
    couple = _couple_label(order)
    return {
        "qr": f"{code} · {couple} · {QR_SUFFIX}",
        "selfies": f"{code} · {couple} · {SELFIE_SUFFIX}",
    }


async def resolve_storage_account(db) -> Dict[str, Any]:
    """Which Google mail the event's folders live on (or will).

    The owner's question is always "on which mail?", so this answers it in every
    state instead of only the happy one. Three honest outcomes:

      1. pool ON  + an active current drive
         -> provisioned True, `email` = the live mail. Folders really are there.
      2. pool OFF (or the drive isn't active yet) but a Google account IS
         registered
         -> provisioned False, `email` = that same mail + `intended` True. The
            name is reserved and WILL be created on that mail. The panel can now
            print an address here, which it previously could not.
      3. no Google account registered at all
         -> provisioned False, `email` None, `setup_required` True. There is no
            mail to show because none is connected — say so, with what to do.

    `provisioned` keeps its old meaning (a folder exists in Drive today), so no
    caller starts claiming a folder that was never created. Callers that want to
    display an address should use `email` and check `provisioned` / `intended` for
    the wording.

    Never raises — the info-submit path must not fail because storage is down.
    """
    try:
        from storage_pool_hooks import pool_enabled
        enabled = await pool_enabled(db)
    except Exception:
        enabled = False

    # Looked up in EVERY state (this used to be skipped when the pool was off,
    # which is exactly why the panel could not show a mail).
    try:
        acc = await db.storage_accounts.find_one({"slot": "current", "kind": "gdrive"})
        if not acc:
            # No "current" drive nominated yet — any registered Google account
            # still answers "which mail", so fall back to the first one.
            rows = await db.storage_accounts.find({"kind": "gdrive"}).to_list(50)
            acc = rows[0] if rows else None
    except Exception as e:
        logger.warning("[event_folders] storage account lookup failed: %s", e)
        acc = None

    mail = (acc or {}).get("email") or (acc or {}).get("account_email")
    label = (acc or {}).get("label")

    if not acc:
        return {"provisioned": False, "intended": False, "setup_required": True,
                "email": None, "label": None,
                "reason": ("No Google account is connected yet, so there is no mail to show. "
                           "The photos are held in MAJA's own storage; these two names are "
                           "reserved and get created the moment a Google account is added.")}

    if enabled and acc.get("status") == "active":
        # `email` is the addressable identity; `label` is the human name we gave it.
        return {"provisioned": True, "intended": True, "setup_required": False,
                "email": mail, "label": label,
                "account_id": acc.get("id"), "reason": None}

    reason = ("Storage pool is off — the folders are reserved on this mail and created "
              "when it is switched on." if not enabled else
              "This drive is not active yet — the folders are created on the next upload.")
    return {"provisioned": False, "intended": True, "setup_required": False,
            "email": mail, "label": label,
            "account_id": acc.get("id"), "reason": reason}


async def ensure_order_folders(db, order: Dict[str, Any]) -> Dict[str, Any]:
    """Stamp both folder names + the storage account onto the order, once.

    Idempotent: only writes fields that are missing, so an admin who later
    renamed a folder keeps their name. Returns the fields written (empty if the
    order already had everything), so a caller can include them in a
    notification without a second read.
    """
    names = folder_names(order)
    upd: Dict[str, Any] = {}
    if not order.get("drive_folder_qr"):
        upd["drive_folder_qr"] = names["qr"]
    if not order.get("drive_folder_selfies"):
        upd["drive_folder_selfies"] = names["selfies"]

    # Folder NAMES are sticky (a rename must survive), but the storage account is
    # not a fact until it is provisioned — it is a reservation. So re-resolve it
    # whenever the stored one isn't provisioned: the moment the owner connects a
    # Google account or switches the pool on, every existing request starts
    # showing the real mail instead of the stale "nothing connected" note.
    stored_acc = order.get("storage_account")
    if not stored_acc or not stored_acc.get("provisioned"):
        acc = await resolve_storage_account(db)
        if acc != stored_acc:
            upd["storage_account"] = acc

    if upd:
        try:
            await db.invitation_orders.update_one({"id": order["id"]}, {"$set": upd})
            order.update(upd)
        except Exception as e:
            logger.warning("[event_folders] could not stamp folders on %s: %s",
                           order.get("id"), e)
    return upd
