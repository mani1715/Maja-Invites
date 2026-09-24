"""
Self-test for the 5-day event SOFT-DELETE (no cloud, no Postgres).

    cd backend && python -m tests.test_storage_soft_delete

Reuses the in-memory harness (FakeDB + MemProvider + TestOrchestrator) from
tests.test_storage_orchestrator. Covers the owner's required scenarios:

  1. Delete            — soft_delete_event marks a recycle row; files stay put.
  2. Restore           — restore_event cancels it; files untouched.
  3. Permanent cleanup — purge deletes every file + the event's folders.
  4. Storage release   — committed_bytes + rollups drop by the event's size.
  5. Failure recovery  — a provider delete error keeps the recycle row (retry),
                         and a later retry completes it.
  6. Daily job window  — purge_expired_deleted_events purges only rows older than
                         5 days; rows inside the window are left alone.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from tests.test_storage_orchestrator import FakeDB, MemProvider, TestOrchestrator


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _seed_event(orch, prov, *, photographer_id="ph1", event_id="ev1", n=3):
    """Upload n QR + n selfie files to one event; return total bytes."""
    total = 0
    for i in range(n):
        for area in ("qr_photos", "selfies"):
            data = f"{area}-{i}".encode() * 1000
            total += len(data)
            await orch.upload_file(
                photographer_id=photographer_id, photographer_name="Studio One",
                area=area, filename=f"{area}-{i}.jpg", data=data,
                content_type="image/jpeg", event_id=event_id, event_name="Anita-Rahul",
                kind="gdrive")
    return total


async def _committed(db, acc_id):
    a = await db.storage_accounts.find_one({"id": acc_id})
    return int((a or {}).get("committed_bytes") or 0)


async def _run():
    db = FakeDB()
    prov = MemProvider()
    orch = TestOrchestrator(db, prov)
    acc = await orch.add_account(kind="gdrive", label="drive-1",
                                 capacity_bytes=10 * 1024 * 1024, soft_limit_pct=95)

    total = await _seed_event(orch, prov, event_id="ev1", n=3)
    files0 = await orch.list_files(event_id="ev1")
    _check(len(files0) == 6, "seed: 6 files uploaded to the event")
    committed_after_upload = await _committed(db, acc["id"])
    _check(committed_after_upload == total, "seed: committed_bytes == uploaded bytes")

    # 1. DELETE — soft-delete marks a recycle row; nothing purged yet
    row = await orch.soft_delete_event("ev1", "ph1")
    _check(row and row["status"] == "recycle", "delete: recycle row created")
    _check(len(await orch.list_files(event_id="ev1")) == 6, "delete: files still present")
    _check(len(prov.files) == 6, "delete: provider still holds the bytes")
    listed = await orch.list_deleted_events()
    _check(len(listed) == 1 and listed[0]["event_id"] == "ev1",
           "delete: event shows in the recycle bin with purge_after")
    # idempotent
    row2 = await orch.soft_delete_event("ev1", "ph1")
    _check(row2["id"] == row["id"], "delete: second delete is idempotent")

    # 2. RESTORE — cancels the pending deletion, files untouched
    n = await orch.restore_event("ev1")
    _check(n == 1, "restore: recycle row removed")
    _check(len(await orch.list_deleted_events()) == 0, "restore: recycle bin empty")
    _check(len(await orch.list_files(event_id="ev1")) == 6, "restore: files intact")

    # 3 + 4. PERMANENT CLEANUP + STORAGE RELEASE
    await orch.soft_delete_event("ev1", "ph1")
    res = await orch.purge_event_storage("ev1")
    _check(res["complete"] is True, "purge: reported complete")
    _check(res["files_deleted"] == 6, "purge: all 6 files deleted")
    _check(res["bytes_released"] == total, "purge: released exactly the event bytes")
    _check(len(await orch.list_files(event_id="ev1")) == 0, "purge: no file rows remain")
    _check(len(prov.files) == 0, "purge: provider bytes gone")
    # event folders (event + qr_photos + selfies) removed from the registry
    folders_left = [d async for d in db.storage_folders.find({"event_id": "ev1"})]
    _check(len(folders_left) == 0, "purge: event folders removed from registry")
    _check(await _committed(db, acc["id"]) == 0, "release: committed_bytes back to 0")
    es = await db.event_storage.find_one({"event_id": "ev1"})
    _check(es is None, "release: event_storage rollup row removed")

    # 5. FAILURE RECOVERY — a provider delete error keeps the recycle row for retry
    await _seed_event(orch, prov, event_id="ev2", n=2)
    total2 = await _committed(db, acc["id"])
    _check(total2 > 0, "recovery: ev2 seeded")
    await orch.soft_delete_event("ev2", "ph1")

    real_delete = prov.delete
    # Persistently fail ONE specific file (a stuck drive), so it survives the
    # in-loop retry and is left for the next daily run — the true recovery path.
    stuck_fid = (await orch.list_files(event_id="ev2"))[0]["provider_ref"]["file_id"]
    blocked = {"fid": stuck_fid}

    async def flaky_delete(account, ref):
        if ref.provider_ref.get("file_id") == blocked["fid"]:
            raise RuntimeError("drive 503 on delete (stuck file)")
        await real_delete(account, ref)

    prov.delete = flaky_delete
    res_fail = await orch.purge_event_storage("ev2")
    _check(res_fail["complete"] is False, "recovery: purge reports incomplete")
    _check(res_fail["files_failed"] >= 1, "recovery: the stuck file failed to delete")
    remaining = await orch.list_files(event_id="ev2")
    _check(len(remaining) == 1, "recovery: stuck file left on disk for retry")

    prov.delete = real_delete                   # 'fix' the drive fully → retry succeeds
    res_ok = await orch.purge_event_storage("ev2")
    _check(res_ok["complete"] is True, "recovery: retry completes cleanly")
    _check(len(await orch.list_files(event_id="ev2")) == 0, "recovery: all files gone after retry")
    _check(await _committed(db, acc["id"]) == 0, "recovery: bytes fully released after retry")

    # 6. DAILY JOB WINDOW — only rows older than 5 days are purged
    await _seed_event(orch, prov, event_id="ev_old", n=1)
    await _seed_event(orch, prov, event_id="ev_new", n=1)
    await orch.soft_delete_event("ev_old", "ph1")
    await orch.soft_delete_event("ev_new", "ph1")
    # age ev_old past the 5-day window
    old_iso = (datetime.now(timezone.utc) - timedelta(days=6)).isoformat()
    await db.storage_event_deletions.update_one(
        {"event_id": "ev_old", "status": "recycle"}, {"$set": {"deleted_at": old_iso}})

    summary = await orch.purge_expired_deleted_events()
    _check(summary["events_purged"] >= 1, "daily: the expired event was purged")
    _check(len(await orch.list_files(event_id="ev_old")) == 0, "daily: expired event files purged")
    _check(len(await orch.list_files(event_id="ev_new")) == 2, "daily: in-window event UNTOUCHED")
    still_ids = {d["event_id"] for d in await orch.list_deleted_events()}
    _check("ev_old" not in still_ids, "daily: expired event dropped from the recycle bin")
    _check("ev_new" in still_ids, "daily: in-window event kept in the recycle bin")

    print("\nALL SOFT-DELETE TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(_run())
