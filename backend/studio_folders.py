"""
studio_folders.py — the Drive folder a photographer gets when they buy.

The owner's ask: buying Portfolio creates one folder; buying Cloud Storage
creates one folder; and when the owner opens that photographer in the admin
panel, each folder's NAME and the Google MAIL it lives on must be visible
(plus, for cloud storage, how much is used of how much).

Mirrors event_folders.py (the per-event version) and REUSES its honest
storage-account resolver, so "which mail" behaves identically everywhere: a real
address only when the storage pool is on with a live drive, otherwise a plain
"reserved" reason — never a fabricated account.

Recorded on the admin doc under `studio_folders`:
    admins.studio_folders = {
      "portfolio":     {"name": str, "account": {...}, "reserved_at": iso},
      "cloud_storage": {"name": str, "account": {...}, "reserved_at": iso},
    }
Idempotent: a folder is stamped once and never overwritten, so an admin rename
survives, and re-running on renewal is a no-op.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger("studio_folders")

KINDS = ("portfolio", "cloud_storage")
_SUFFIX = {
    "portfolio": "Portfolio",
    "cloud_storage": "Cloud Storage",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _studio_label(admin: Dict[str, Any]) -> str:
    return (str(admin.get("studio_name") or admin.get("name")
                or admin.get("username") or "Studio").strip()) or "Studio"


def folder_name(admin: Dict[str, Any], kind: str) -> str:
    """Deterministic folder name for a studio's portfolio or cloud-storage area.

    Keyed on the admin id so it is stable and unique across studios of the same
    name — re-running never makes a second folder.
    """
    label = _studio_label(admin)
    short = str(admin.get("id") or "")[-6:]
    return f"{label} · {_SUFFIX.get(kind, kind)} · {short}"


async def ensure_studio_folder(db, admin_id: str, kind: str) -> Dict[str, Any]:
    """Reserve the folder for `kind` on this photographer, once.

    Returns the folder record ({name, account, reserved_at}). Idempotent: if it
    already exists it is returned unchanged (no overwrite, no duplicate). Never
    raises — a purchase must not fail because storage bookkeeping did.
    """
    if kind not in KINDS:
        raise ValueError(f"kind must be one of {KINDS}")
    try:
        admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    except Exception as e:
        logger.warning("[studio_folders] admin lookup failed for %s: %s", admin_id, e)
        return {}
    if not admin:
        return {}

    existing = (admin.get("studio_folders") or {}).get(kind)
    if existing and existing.get("name"):
        # The NAME is sticky (a rename must survive), but an unprovisioned
        # account is only a reservation — refresh it so the panel starts showing
        # the real mail as soon as one is connected.
        await refresh_accounts(db, admin_id, admin)
        return ((await db.admins.find_one({"id": admin_id}, {"_id": 0, "studio_folders": 1})
                 or {}).get("studio_folders") or {}).get(kind) or existing

    from event_folders import resolve_storage_account
    account = await resolve_storage_account(db)
    record = {"name": folder_name(admin, kind), "account": account,
              "reserved_at": _now()}

    folders = dict(admin.get("studio_folders") or {})
    folders[kind] = record
    try:
        await db.admins.update_one({"id": admin_id}, {"$set": {"studio_folders": folders}})
    except Exception as e:
        logger.warning("[studio_folders] could not stamp %s folder on %s: %s",
                       kind, admin_id, e)
    return record


async def refresh_accounts(db, admin_id: str, admin: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Re-resolve "which mail" on every folder of this studio that isn't
    provisioned yet, and return the (possibly updated) `studio_folders` dict.

    A reserved folder's account is a PREDICTION, not a record: it says where the
    folder will be created. Freezing it at reservation time is what made the admin
    panel keep showing "nothing connected" forever, even after the owner connected
    a Google account. Provisioned records are never touched — those are facts —
    and folder names are never touched, so a rename survives. Never raises.
    """
    try:
        if admin is None:
            admin = await db.admins.find_one({"id": admin_id}, {"_id": 0}) or {}
        folders = dict(admin.get("studio_folders") or {})
        if not folders:
            return {}
        stale = [k for k, rec in folders.items()
                 if isinstance(rec, dict) and not (rec.get("account") or {}).get("provisioned")]
        if not stale:
            return folders

        from event_folders import resolve_storage_account
        account = await resolve_storage_account(db)
        changed = False
        for k in stale:
            if folders[k].get("account") != account:
                folders[k] = {**folders[k], "account": account}
                changed = True
        if changed:
            await db.admins.update_one({"id": admin_id}, {"$set": {"studio_folders": folders}})
        return folders
    except Exception as e:
        logger.warning("[studio_folders] account refresh failed for %s: %s", admin_id, e)
        return dict((admin or {}).get("studio_folders") or {})


async def studio_folder(db, admin_id: str, kind: str) -> Optional[Dict[str, Any]]:
    """Read a photographer's stored folder record for `kind`, or None."""
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "studio_folders": 1})
    return ((admin or {}).get("studio_folders") or {}).get(kind)


async def backfill_studio_folders(db) -> Dict[str, int]:
    """One-time backfill: reserve folders for photographers who bought BEFORE
    the reserve-on-purchase hooks existed, so their admin cards are populated
    without waiting for a renewal.

    Safe to run on every startup:
      * ensure_studio_folder is idempotent, so a studio that already has a folder
        is untouched — no duplicate, no re-stamp;
      * a photographer gets a PORTFOLIO folder only if they hold a portfolio
        subscription, and a CLOUD_STORAGE folder only if they hold a storage
        subscription, so nobody who never bought gets a folder.
    Returns counts for the startup log. Never raises.
    """
    result = {"portfolio": 0, "cloud_storage": 0}

    async def _backfill(sids, kind):
        made = 0
        seen = set()
        for sid in sids:
            if not sid or sid in seen:
                continue
            seen.add(sid)
            # Count only NEW reservations, so the startup log reflects real work.
            if await studio_folder(db, sid, kind):
                continue
            rec = await ensure_studio_folder(db, sid, kind)
            if rec and rec.get("name"):
                made += 1
        return made

    try:
        subs = await db.subscriptions.find(
            {"product": "portfolio"}, {"_id": 0, "studio_id": 1}).to_list(100000)
        result["portfolio"] = await _backfill([s.get("studio_id") for s in subs], "portfolio")

        css = await db.studio_storage_subscriptions.find(
            {}, {"_id": 0, "admin_id": 1}).to_list(100000)
        result["cloud_storage"] = await _backfill([s.get("admin_id") for s in css], "cloud_storage")
    except Exception as e:
        logger.warning("[studio_folders] backfill failed: %s", e, exc_info=True)
    return result
