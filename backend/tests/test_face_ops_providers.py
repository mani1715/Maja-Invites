"""
test_face_ops_providers.py — Face-ops (Phase 7) + Providers (Phase 15) on FakeDB.

    cd backend && python -m tests.test_face_ops_providers
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from tests.test_storage_orchestrator import FakeDB           # noqa: E402
import face_ops as fo                                        # noqa: E402
import providers_admin as pa                                 # noqa: E402

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


async def main():
    now = datetime.now(timezone.utc).isoformat()

    # --- face ops -------------------------------------------------------------
    db = FakeDB()
    await db.gallery_photos.insert_one({"id": "p1", "profile_id": "w1", "face_count": 3, "created_at": now})
    await db.gallery_photos.insert_one({"id": "p2", "profile_id": "w1", "face_count": 2, "created_at": now})
    await db.gallery_photos.insert_one({"id": "p3", "profile_id": "w2", "face_count": 0, "created_at": now})  # not indexed
    await db.gallery_photos.insert_one({"id": "p4", "profile_id": "w2", "face_count": 1, "index_error": "boom", "created_at": now})
    await db.face_search_sessions.insert_one({"id": "s1", "created_at": now})
    await db.photo_requests.insert_one({"id": "r1", "created_at": now})

    fops = await fo.compute_face_ops(db)
    t = fops["totals"]
    ok("indexed photos = 3 (face_count>0)", t["indexed_photos"] == 3)
    ok("total faces = 6", t["indexed_faces"] == 6)
    ok("collections = 2 distinct galleries", t["collections"] == 2)
    ok("total photos = 4", t["total_photos"] == 4)
    ok("failed indexing counted", t["failed_indexing"] == 1)
    ok("searches counted", fops["searches"]["total"] == 1)
    ok("photo requests counted", fops["photo_requests"]["total"] == 1)
    ok("rekognition not configured in test env", fops["rekognition"]["available"] is False)

    fops0 = await fo.compute_face_ops(FakeDB())
    ok("empty db → zeros, no throw", fops0["totals"]["indexed_faces"] == 0)

    # --- providers ------------------------------------------------------------
    for k in ("RESEND_API_KEY", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "DELIVERY_WEBHOOK_SECRET"):
        os.environ.pop(k, None)
    prov = await pa.compute_providers(FakeDB())
    ok("providers listed", prov["total"] >= 10)
    ok("secret values never exposed", all("value" not in i and set(i.keys()) >= {"key", "configured", "health"} for i in prov["providers"]))
    email = next(i for i in prov["providers"] if i["key"] == "email_resend")
    ok("unset provider → not configured", email["configured"] is False and email["health"] == "not_configured")

    os.environ["RESEND_API_KEY"] = "re_test"
    prov2 = await pa.compute_providers(FakeDB())
    email2 = next(i for i in prov2["providers"] if i["key"] == "email_resend")
    ok("setting env → configured", email2["configured"] is True)
    ok("configured_count reflects env", prov2["configured_count"] >= 1)
    os.environ.pop("RESEND_API_KEY", None)

    print(f"\nFace-ops + Providers: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
