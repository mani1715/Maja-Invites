"""
Self-test for R2 — mirror_delete (source-file delete → pooled mirror removed).

    cd backend && python -m tests.test_storage_mirror_delete

No cloud, no Postgres. Reuses the in-memory FakeDB / MemProvider / TestOrchestrator
from test_storage_orchestrator (race-safe in-memory reservation).

Covers the R2 acceptance list:
  1. portfolio delete      — mirror correlated by disk path, removed + bytes released
  2. cloud-storage delete  — mirror correlated by S3 key, removed + bytes released
  3. repeated delete       — second delete is an idempotent no-op
  4. missing-file scenario — provider already lost the file → DB row still cleaned,
                             bytes still released (idempotent)
  5. byte-release validation — committed_bytes + rollups decrement exactly
  6. filename fallback     — mirror with no source_path matched by (area, filename)
  7. blind-match guard     — no source_path AND no filename → refuses to match
  8. hook path (flag ON)   — mirror_upload → mirror_delete end-to-end via the hook
  9. hook flag OFF         — mirror_delete is inert when the pool is disabled
"""
from __future__ import annotations

import asyncio
import os
import sys
import types

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ["STORAGE_CRED_KEY"] = Fernet.generate_key().decode()

import storage
from tests.test_storage_orchestrator import FakeDB, MemProvider, TestOrchestrator
import storage_pool_hooks as hooks


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


def _docs(db, name):
    col = db._cols.get(name)
    return col.docs if col else []


async def _committed(db, acc_id):
    acc = await db.storage_accounts.find_one({"id": acc_id})
    return int((acc or {}).get("committed_bytes") or 0)


# --------------------------------------------------------------------------- #
# orchestrator-level (direct delete_mirror)
# --------------------------------------------------------------------------- #
async def _run_orch():
    db = FakeDB()
    prov = MemProvider()
    orch = TestOrchestrator(db, prov)
    acc = await orch.add_account(label="d1", capacity_bytes=1_000_000,
                                 credentials={"refresh_token": "r1"})

    print("1. portfolio delete — correlated by disk path")
    ppath = "/app/uploads/portfolio/ph1/a.jpg"
    fa = await orch.upload_file(
        photographer_id="ph1", photographer_name="Studio One", area="portfolio",
        filename="a.jpg", data=b"AAAA", content_type="image/jpeg",
        source_ref={"kind": "disk", "path": ppath})
    row = await db.storage_files.find_one({"id": fa["id"]})
    _check(row.get("source_path") == ppath, "upload persists source_path for correlation")
    _check(await _committed(db, acc["id"]) == 4, "committed reflects the mirror (4 bytes)")

    res = await orch.delete_mirror("ph1", source_path=ppath)
    _check(res["deleted"] == 1 and res["matched"] == 1, "portfolio mirror deleted")
    _check(await db.storage_files.find_one({"id": fa["id"]}) is None, "file row removed")
    _check(res["bytes_released"] == 4, "reported 4 bytes released")
    _check(await _committed(db, acc["id"]) == 0, "committed released back to the drive")
    ps = await db.photographer_storage.find_one({"photographer_id": "ph1"})
    _check(int(ps["file_count"]) == 0 and int(ps["total_bytes"]) == 0
           and int(ps.get("portfolio_bytes") or 0) == 0, "rollups decremented to zero")

    print("2. cloud-storage delete — correlated by S3 key")
    key = "studio/ph1/b.pdf"
    fb = await orch.upload_file(
        photographer_id="ph1", photographer_name="Studio One", area="cloud_storage",
        filename="b.pdf", data=b"BBBBB", content_type="application/pdf",
        source_ref={"kind": "s3", "key": key})
    _check(await _committed(db, acc["id"]) == 5, "cloud mirror committed (5 bytes)")
    res = await orch.delete_mirror("ph1", source_path=key)
    _check(res["deleted"] == 1 and res["bytes_released"] == 5, "cloud mirror deleted")
    _check(await _committed(db, acc["id"]) == 0, "committed released after cloud delete")

    print("3. repeated delete — idempotent no-op")
    res = await orch.delete_mirror("ph1", source_path=ppath)
    _check(res["matched"] == 0 and res["deleted"] == 0, "second delete matches nothing")

    print("4. missing-file scenario — provider already lost the object")
    mpath = "/app/uploads/portfolio/ph1/m.jpg"
    fm = await orch.upload_file(
        photographer_id="ph1", photographer_name="Studio One", area="portfolio",
        filename="m.jpg", data=b"MMM", content_type="image/jpeg",
        source_ref={"kind": "disk", "path": mpath})
    # simulate the object vanishing from the drive out-of-band
    prov.files.pop(fm["provider_ref"]["file_id"], None)
    before = await _committed(db, acc["id"])
    res = await orch.delete_mirror("ph1", source_path=mpath)
    _check(res["deleted"] == 1, "missing object still cleans the metadata row (idempotent)")
    _check(await db.storage_files.find_one({"id": fm["id"]}) is None, "row removed")
    _check(await _committed(db, acc["id"]) == before - 3, "bytes released even when object was gone")

    print("5. filename fallback — mirror with no source_path")
    fc = await orch.upload_file(
        photographer_id="ph1", photographer_name="Studio One", area="portfolio",
        filename="c.jpg", data=b"CCCC", content_type="image/jpeg")  # no source_ref
    row = await db.storage_files.find_one({"id": fc["id"]})
    _check(row.get("source_path") is None, "no source_ref -> source_path is None")
    res = await orch.delete_mirror("ph1", filename="c.jpg", area="portfolio")
    _check(res["deleted"] == 1, "matched by (photographer, area, filename)")
    _check(await db.storage_files.find_one({"id": fc["id"]}) is None, "fallback delete removed the row")

    print("6. blind-match guard")
    fx = await orch.upload_file(
        photographer_id="ph1", photographer_name="Studio One", area="portfolio",
        filename="keep.jpg", data=b"KEEP", content_type="image/jpeg",
        source_ref={"kind": "disk", "path": "/app/uploads/portfolio/ph1/keep.jpg"})
    res = await orch.delete_mirror("ph1")                     # no key, no filename
    _check(res["matched"] == 0 and res["deleted"] == 0, "refuses to match without a key")
    res = await orch.delete_mirror("")                        # no photographer
    _check(res["deleted"] == 0, "no photographer_id is a no-op")
    _check(await db.storage_files.find_one({"id": fx["id"]}) is not None,
           "untargeted deletes never touch unrelated files")


# --------------------------------------------------------------------------- #
# hook-level (mirror_upload -> mirror_delete, flag-gated)
# --------------------------------------------------------------------------- #
async def _run_hooks():
    db = FakeDB()
    mem = MemProvider()
    storage.get_provider = lambda kind: mem  # type: ignore[attr-defined]
    hooks._orchestrators[id(db)] = TestOrchestrator(db, mem)
    await db.admins.insert_one({"id": "ph1", "name": "Studio One"})
    await db.app_settings.insert_one({"key": hooks.FLAG_KEY, "value": True})
    orch = hooks._orch(db)
    acc = await orch.add_account(label="d1", capacity_bytes=1_000_000,
                                 credentials={"refresh_token": "r1"})

    print("7. hook path — mirror_upload then mirror_delete")
    path = "/app/uploads/portfolio/ph1/z.jpg"
    hooks.mirror_upload(db, photographer_id="ph1", area="portfolio", filename="z.jpg",
                        data=b"ZZZZ", content_type="image/jpeg",
                        source_ref={"kind": "disk", "path": path})
    await hooks.flush()
    files = _docs(db, "storage_files")
    _check(len(files) == 1 and files[0].get("source_path") == path,
           "mirror stored with its source_path via the hook")
    _check(await _committed(db, acc["id"]) == 4, "committed after hook upload")

    hooks.mirror_delete(db, photographer_id="ph1", source_path=path,
                        area="portfolio", filename="z.jpg")
    await hooks.flush()
    _check(len(_docs(db, "storage_files")) == 0, "hook deleted the mirror")
    _check(await _committed(db, acc["id"]) == 0, "hook released the bytes")

    print("8. hook repeat delete is a silent no-op")
    hooks.mirror_delete(db, photographer_id="ph1", source_path=path)
    await hooks.flush()
    _check(len(_docs(db, "storage_files")) == 0, "second hook delete is inert")

    print("9. flag OFF — mirror_delete is inert")
    # seed a mirror row + flip the flag off; delete must NOT touch it
    await db.storage_files.insert_one({
        "id": "file_keep", "photographer_id": "ph1", "area": "portfolio",
        "filename": "keep.jpg", "source_path": "/x/keep.jpg", "size_bytes": 9,
        "drive_account_id": acc["id"], "provider_ref": {"file_id": "gd_keep"},
        "upload_status": "stored"})
    await db.app_settings.update_one({"key": hooks.FLAG_KEY},
                                     {"$set": {"value": False}})
    hooks.mirror_delete(db, photographer_id="ph1", source_path="/x/keep.jpg")
    await hooks.flush()
    _check(await db.storage_files.find_one({"id": "file_keep"}) is not None,
           "pool disabled -> mirror_delete leaves everything untouched")


def main():
    asyncio.run(_run_orch())
    asyncio.run(_run_hooks())
    print("\nALL MIRROR-DELETE TESTS PASSED")


if __name__ == "__main__":
    main()
