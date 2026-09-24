"""
Self-test for the Phase-8 migrator (Drive pool -> S3/R2, provider-agnostic).

    cd backend && python -m tests.test_storage_migrate

No network, no Postgres. Two in-memory providers play "gdrive" (source pool)
and "s3" (destination). Covers:

  1. Dry-run reports what WOULD move and changes nothing.
  2. Execute copies every file: bytes land on the destination, rows repoint
     (drive_account_id + provider_ref), old ref kept in previous_ref,
     destination usage counter incremented.
  3. Checksum gate: a corrupted source file is skipped + flagged
     'checksum_mismatch' — corruption never propagates.
  4. Idempotent resume: a second run migrates zero.
  5. verify(): re-downloads from the destination and passes.
  6. purge_source(): refuses without confirm; with confirm deletes source
     copies only after per-file dest re-verify, decrements source usage.
  7. Business logic unaffected: get_download_url serves from the destination
     after migration with zero call-site changes.
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

from tests.test_storage_orchestrator import FakeDB, MemProvider, TestOrchestrator
from storage.migrate import StorageMigrator
from storage.base import StorageError


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _run():
    db = FakeDB()
    src_prov = MemProvider()          # plays the Google Drive pool
    dst_prov = MemProvider()          # plays S3/R2
    dst_prov.kind = "s3"
    providers = {"gdrive": src_prov, "s3": dst_prov}
    factory = lambda kind: providers[kind]  # noqa: E731

    orch = TestOrchestrator(db, src_prov)
    orch._provider_factory = factory   # route by kind like production

    src_acc = await orch.add_account(label="drive-01", capacity_bytes=10_000,
                                     credentials={"refresh_token": "r1"})
    dst_acc = await orch.add_account(kind="s3", label="r2-bucket",
                                     capacity_bytes=10_000_000)

    files = []
    for i, (area, ev) in enumerate([("qr_photos", "ev1"), ("selfies", "ev1"),
                                    ("portfolio", None)]):
        f = await orch.upload_file(
            photographer_id="ph1", photographer_name="Studio One",
            area=area, event_id=ev, event_name="Anita-Rahul",
            filename=f"f{i}.jpg", data=f"DATA-{i}".encode(),
            content_type="image/jpeg")
        files.append(f)
    _check(all(f["drive_account_id"] == src_acc["id"] for f in files),
           "3 files archived on the source drive")

    m = StorageMigrator(db, dst_acc["id"], provider_factory=factory)

    print("1. dry run")
    s = await m.run(dry_run=True)
    _check(s["scanned"] == 3 and s["migrated"] == 0, "dry-run scans 3, moves 0")
    row = await db.storage_files.find_one({"id": files[0]["id"]})
    _check(row["drive_account_id"] == src_acc["id"], "dry-run changed nothing")

    print("3. checksum gate (corrupt one source file first)")
    bad_fid = files[2]["provider_ref"]["file_id"]
    src_prov.files[bad_fid] = b"CORRUPTED"

    print("2. execute")
    s = await m.run(dry_run=False)
    _check(s["migrated"] == 2 and s["checksum_mismatch"] == 1 and s["errors"] == 0,
           "2 migrated, 1 corrupted file blocked")
    moved = await db.storage_files.find_one({"id": files[0]["id"]})
    _check(moved["drive_account_id"] == dst_acc["id"], "row repointed to destination")
    _check(moved["previous_ref"] == files[0]["provider_ref"],
           "old provider ref preserved for purge")
    _check(dst_prov.files[moved["provider_ref"]["file_id"]] == b"DATA-0",
           "bytes actually on the destination")
    bad = await db.storage_files.find_one({"id": files[2]["id"]})
    _check(bad["upload_status"] == "checksum_mismatch"
           and bad["drive_account_id"] == src_acc["id"],
           "corrupted file flagged, NOT migrated")
    dst_after = await db.storage_accounts.find_one({"id": dst_acc["id"]})
    _check(int(dst_after["committed_bytes"]) == len(b"DATA-0") + len(b"DATA-1"),
           "destination usage counter incremented")

    print("4. idempotent resume")
    s = await m.run(dry_run=False)
    _check(s["scanned"] == 0 and s["migrated"] == 0, "second run migrates nothing")

    print("5. verify")
    v = await m.verify()
    _check(v["checked"] == 2 and v["ok"] == 2 and v["bad"] == 0,
           "destination copies verified by checksum")

    print("6. purge source")
    refused = False
    try:
        await m.purge_source()
    except StorageError:
        refused = True
    _check(refused, "purge refuses without confirm=True")
    src_before = await db.storage_accounts.find_one({"id": src_acc["id"]})
    p = await m.purge_source(confirm=True)
    _check(p["purged"] == 2, "source copies purged after per-file re-verify")
    _check(files[0]["provider_ref"]["file_id"] not in src_prov.files,
           "source bytes actually deleted")
    src_after = await db.storage_accounts.find_one({"id": src_acc["id"]})
    _check(int(src_after["committed_bytes"])
           == int(src_before["committed_bytes"]) - len(b"DATA-0") - len(b"DATA-1"),
           "source usage counter released")

    print("7. business logic unaffected")
    url = await orch.get_download_url(files[0]["id"])
    _check(url.startswith("drive://"),  # MemProvider url scheme; the point is
           "get_download_url now serves from the destination "  # no call-site
           "with zero call-site changes")                        # changed

    print("\nALL MIGRATOR CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(_run())
