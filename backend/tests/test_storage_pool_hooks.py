"""
Self-test for the Phase-5 storage pool hooks.

    cd backend && python -m tests.test_storage_pool_hooks

No network, no Postgres. Proves the safety contract that lets these hooks sit
inside production endpoints:

  1. Flag OFF (default): hooks are inert — no accounts touched, no files written.
  2. Flag ON: mirror_upload archives into the pool (file row + folder tree),
     dedup included.
  3. provision_photographer / provision_event build the charter tree.
  4. A hook whose orchestrator EXPLODES never raises into the caller.
  5. Calling a hook with no running event loop never raises.
  6. Missing photographer_id / empty data are silent no-ops.
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


def _docs(db, name):
    col = db._cols.get(name)
    return col.docs if col else []


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _drain():
    """Wait for every fire-and-forget hook task + queued mirror job."""
    await hooks.flush()


async def _run():
    db = FakeDB()
    mem = MemProvider()
    storage.get_provider = lambda kind: mem  # type: ignore[attr-defined]
    # hooks build their own orchestrator; give this db a race-safe test one
    hooks._orchestrators[id(db)] = TestOrchestrator(db, mem)

    await db.admins.insert_one({"id": "ph1", "name": "Studio One"})

    print("1. flag OFF (default) -> hooks are inert")
    hooks.mirror_upload(db, photographer_id="ph1", area="portfolio",
                        filename="a.jpg", data=b"AAA", content_type="image/jpeg")
    hooks.provision_photographer(db, "ph1", "Studio One")
    await _drain()
    _check(len(_docs(db, "storage_files")) == 0, "no files mirrored")
    _check(len(_docs(db, "storage_folders")) == 0, "no folders provisioned")

    print("2. flag ON -> uploads mirror into the pool")
    await db.app_settings.insert_one({"key": hooks.FLAG_KEY, "value": True})
    orch = hooks._orch(db)
    await orch.add_account(label="drive-01", capacity_bytes=10_000,
                           credentials={"refresh_token": "r1"})
    hooks.mirror_upload(db, photographer_id="ph1", area="qr_photos",
                        filename="p1.jpg", data=b"QRDATA", content_type="image/jpeg",
                        event_id="ev1", event_name="Anita-Rahul-2026-11-02")
    await _drain()
    files = _docs(db, "storage_files")
    _check(len(files) == 1 and files[0]["area"] == "qr_photos"
           and files[0]["event_id"] == "ev1", "guest QR photo archived")
    _check(files[0]["photographer_id"] == "ph1", "attributed to the photographer")
    # dedup: same bytes again -> still one row
    hooks.mirror_upload(db, photographer_id="ph1", area="qr_photos",
                        filename="p1_dup.jpg", data=b"QRDATA", content_type="image/jpeg",
                        event_id="ev1", event_name="Anita-Rahul-2026-11-02")
    await _drain()
    _check(len(_docs(db, "storage_files")) == 1, "duplicate bytes deduped")

    # REGRESSION: pixora_service mirrors with area="community" and server.py's
    # dashboard/video/music uploads with area="media". Both used to hit
    # "Unknown upload area" in the orchestrator, and because mirroring is
    # fire-and-forget inside try/except the failure was completely silent —
    # every community post and reel simply never reached Drive. If either of
    # these stops landing a row, that whole class of upload is dark again.
    before = len(_docs(db, "storage_files"))
    hooks.mirror_upload(db, photographer_id="ph1", area="community",
                        filename="reel_01.mp4", data=b"REELBYTES",
                        content_type="video/mp4")
    hooks.mirror_upload(db, photographer_id="ph1", area="media",
                        filename="cover.webp", data=b"MEDIABYTES",
                        content_type="image/webp")
    await _drain()
    landed = {d["area"] for d in _docs(db, "storage_files")}
    _check(len(_docs(db, "storage_files")) == before + 2
           and {"community", "media"} <= landed,
           "community + media uploads reach the pool (were silently dropped)")

    print("3. provisioning hooks build the charter tree")
    hooks.provision_photographer(db, "ph2", "Studio Two")
    await _drain()
    areas_ph2 = {d["area"] for d in _docs(db, "storage_folders")
                 if d.get("photographer_id") == "ph2"}
    _check({"root", "events", "portfolio", "cloud_storage",
            "community", "media"} <= areas_ph2,
           "photographer tree: root/Events/Portfolio/Cloud_Storage/Community/Media")
    hooks.provision_event(db, "ph2", "ev9", "Meera-Vikram-2026-12-01")
    await _drain()
    areas_ev9 = {d["area"] for d in _docs(db, "storage_folders")
                 if d.get("event_id") == "ev9"}
    _check({"event", "qr_photos", "selfies"} == areas_ev9,
           "event tree: Event/QR_Photos/Selfies")

    print("4. exploding orchestrator never reaches the caller")
    class Boom:
        def __getattr__(self, _):
            raise RuntimeError("pool exploded")
    hooks._orchestrators[id(db)] = Boom()
    hooks.mirror_upload(db, photographer_id="ph1", area="portfolio",
                        filename="x.jpg", data=b"X", content_type="image/jpeg")
    await _drain()   # would raise here if the hook leaked its exception
    _check(True, "exception swallowed by the fire-and-forget wrapper")
    hooks._orchestrators[id(db)] = orch

    print("6. no-op guards")
    before = len(_docs(db, "storage_files"))
    hooks.mirror_upload(db, photographer_id="", area="portfolio",
                        filename="x.jpg", data=b"X", content_type="image/jpeg")
    hooks.mirror_upload(db, photographer_id="ph1", area="portfolio",
                        filename="x.jpg", data=b"", content_type="image/jpeg")
    await _drain()
    _check(len(_docs(db, "storage_files")) == before,
           "missing photographer_id / empty data are silent no-ops")

    print("7. bounded pipeline: oversized payloads defer to the retry job")
    old_limit = hooks.MAX_INLINE_BYTES
    hooks.MAX_INLINE_BYTES = 10
    try:
        hooks.mirror_upload(db, photographer_id="ph1", area="cloud_storage",
                            filename="big.zip", data=b"Z" * 100,
                            content_type="application/zip",
                            source_ref={"kind": "disk", "path": "/x/big.zip"})
        await _drain()
        deferred = [l for l in _docs(db, "upload_logs")
                    if l.get("status") == "deferred"]
        _check(len(deferred) == 1 and deferred[0]["source_ref"]["path"] == "/x/big.zip",
               "oversized mirror recorded as 'deferred' with its source_ref")
        _check(len(_docs(db, "storage_files")) == before,
               "oversized payload was NOT uploaded inline (no memory held)")
    finally:
        hooks.MAX_INLINE_BYTES = old_limit


def main():
    asyncio.run(_run())

    print("5. hook without a running event loop never raises")
    db2 = FakeDB()
    hooks.mirror_upload(db2, photographer_id="ph1", area="portfolio",
                        filename="a.jpg", data=b"A", content_type="image/jpeg")
    _check(True, "sync-context call is a logged no-op")

    print("\nALL STORAGE POOL HOOK CHECKS PASSED")


if __name__ == "__main__":
    main()
