"""
Guest gallery download caps + photographer bulk-delete — live regression.

Covers the endpoints added 2026-08-21 (gallery_features.py):
  • GET  /api/public/gallery/{slug}/all-photos        — whole-album browse
  • POST /api/public/gallery/{slug}/download          — capped grant (all/face)
  • POST /api/admin/profiles/{id}/gallery/photos/bulk-delete

The cap is over DISTINCT photos per identity: 5 for the whole-album view
(device id), 10 for face match (mobile). This proves the 5-cap ceiling, that a
re-download of an already-granted photo does NOT spend the cap, the face-scope
guards (mobile required, photo must be in the guest's session), and that
bulk-delete removes exactly the selected rows.

Needs a running backend (require_live) + the same Postgres via live_db to seed
gallery_photos without going through the S3 upload pipeline. Skips cleanly when
the stack is down.

    PYTHONIOENCODING=utf-8 python -m pytest backend/tests/test_gallery_download_caps.py -q
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

from tests.live import (require_live, login, create_profile_for,
                        new_wedding_payload, delete_wedding, live_db, UA_HEADER)

BASE_URL = require_live()
STUDIO_EMAIL = "admin@wedding.com"
STUDIO_PASSWORD = "admin123"

ALL_CAP = 5
NUM_PHOTOS = 7  # > ALL_CAP so the ceiling is reachable


def _photog_headers() -> dict:
    tok = login(STUDIO_EMAIL, STUDIO_PASSWORD)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _iso(dt):
    return dt.isoformat()


async def _seed(pid: str, photo_ids: list[str], session_id: str):
    db = live_db()
    await db.ensure_connected()
    now = datetime.now(timezone.utc)
    for i, pid_photo in enumerate(photo_ids):
        pref = f"weddings/{pid}/photos/{pid_photo}"
        await db.gallery_photos.insert_one({
            "id": pid_photo, "profile_id": pid,
            "s3_key": f"{pref}/preview.jpg",
            "thumb_s3_key": f"{pref}/thumb.webp",
            "original_s3_key": f"{pref}/original.jpg",
            "indexed": True, "face_count": 1, "aws_face_ids": [],
            "created_at": _iso(now - timedelta(seconds=i)),
        })
    # A completed face session whose matches are all the seeded photos.
    await db.face_search_sessions.insert_one({
        "id": session_id, "profile_id": pid, "status": "done",
        "matched_photo_ids": list(photo_ids), "similarity_map": {},
        "guest_ip": "test", "retry_count": 0,
        "created_at": _iso(now), "last_activity_at": _iso(now),
        "expires_at": _iso(now + timedelta(hours=24)),
    })


async def _cleanup(pid: str):
    db = live_db()
    await db.ensure_connected()
    await db.gallery_photos.delete_many({"profile_id": pid})
    await db.face_search_sessions.delete_many({"profile_id": pid})
    await db.gallery_download_counters.delete_many({"profile_id": pid})


def _download(slug: str, body: dict):
    return requests.post(f"{BASE_URL}/api/public/gallery/{slug}/download",
                         json=body, headers=UA_HEADER, timeout=30)


def test_download_caps_and_bulk_delete():
    headers = _photog_headers()

    r = create_profile_for(headers, new_wedding_payload())
    assert r.status_code in (200, 201), f"create profile: {r.status_code} {r.text[:200]}"
    prof = r.json()
    slug, pid = prof["slug"], prof["id"]

    photo_ids = [uuid.uuid4().hex for _ in range(NUM_PHOTOS)]
    session_id = uuid.uuid4().hex
    try:
        # enable the gallery (body required)
        er = requests.post(f"{BASE_URL}/api/admin/profiles/{pid}/gallery/enable",
                           json={"enabled": True}, headers={**UA_HEADER, **headers}, timeout=30)
        if er.status_code == 503:
            # No AWS on this backend — every gallery path signs S3 URLs, so the
            # cap endpoints can't run here. Real coverage needs an AWS-configured
            # backend (the VM / staging). Skip rather than assert a false green.
            delete_wedding(headers, pid)
            pytest.skip("backend has no AWS configured; gallery S3 paths can't run here")
        assert er.status_code == 200, f"enable gallery: {er.status_code} {er.text[:200]}"

        asyncio.run(_seed(pid, photo_ids, session_id))

        # ---- whole-album browse lists thumbnails, advertises the cap ----
        ap = requests.get(f"{BASE_URL}/api/public/gallery/{slug}/all-photos",
                          headers=UA_HEADER, timeout=30)
        assert ap.status_code == 200, f"all-photos: {ap.status_code} {ap.text[:200]}"
        data = ap.json()
        assert data["total"] == NUM_PHOTOS
        assert data["download_cap"] == ALL_CAP
        assert all("original_url" not in p for p in data["photos"]), \
            "all-photos must not leak full-res URLs (would bypass the cap)"

        # ---- guards ----
        assert _download(slug, {"photo_id": photo_ids[0], "scope": "all"}).status_code == 400, \
            "scope=all without device_id must 400"
        assert _download(slug, {"photo_id": photo_ids[0], "scope": "face",
                                "session_id": session_id}).status_code == 400, \
            "scope=face without mobile must 400"
        assert _download(slug, {"photo_id": "nope", "scope": "all", "device_id": "d1"}).status_code == 404
        assert _download(slug, {"photo_id": photo_ids[0], "scope": "face",
                                "mobile": "9998887777", "session_id": "wrong"}).status_code == 403, \
            "face download for a photo not in the session must 403"

        # ---- the 5-cap over distinct photos (device scope) ----
        dev = "device-A"
        for i in range(ALL_CAP):
            resp = _download(slug, {"photo_id": photo_ids[i], "scope": "all", "device_id": dev})
            assert resp.status_code == 200, f"grant {i}: {resp.status_code} {resp.text[:200]}"
            body = resp.json()
            assert body["url"] and body["remaining"] == ALL_CAP - (i + 1)

        # 6th distinct photo → over the cap
        over = _download(slug, {"photo_id": photo_ids[ALL_CAP], "scope": "all", "device_id": dev})
        assert over.status_code == 429, f"expected 429 at cap, got {over.status_code}"
        assert over.json()["detail"]["remaining"] == 0

        # re-downloading an ALREADY-granted photo is free (does not spend the cap)
        again = _download(slug, {"photo_id": photo_ids[0], "scope": "all", "device_id": dev})
        assert again.status_code == 200, "re-download of a granted photo must still succeed"

        # a DIFFERENT device has its own fresh cap
        other = _download(slug, {"photo_id": photo_ids[ALL_CAP], "scope": "all", "device_id": "device-B"})
        assert other.status_code == 200 and other.json()["remaining"] == ALL_CAP - 1

        # ---- face scope: a valid matched download is granted ----
        fr = _download(slug, {"photo_id": photo_ids[0], "scope": "face",
                              "mobile": "+91 90000 00001", "session_id": session_id})
        assert fr.status_code == 200 and fr.json()["cap"] == 10

        # ---- bulk delete ----
        assert requests.post(f"{BASE_URL}/api/admin/profiles/{pid}/gallery/photos/bulk-delete",
                             json={"ids": []}, headers={**UA_HEADER, **headers},
                             timeout=30).status_code == 400, "empty bulk-delete must 400"
        victims = photo_ids[:3]
        bd = requests.post(f"{BASE_URL}/api/admin/profiles/{pid}/gallery/photos/bulk-delete",
                           json={"ids": victims}, headers={**UA_HEADER, **headers}, timeout=30)
        assert bd.status_code == 200, f"bulk-delete: {bd.status_code} {bd.text[:200]}"
        assert bd.json()["deleted"] == 3
        after = requests.get(f"{BASE_URL}/api/public/gallery/{slug}/all-photos",
                             headers=UA_HEADER, timeout=30).json()
        assert after["total"] == NUM_PHOTOS - 3
    finally:
        asyncio.run(_cleanup(pid))
        delete_wedding(headers, pid)


if __name__ == "__main__":
    test_download_caps_and_bulk_delete()
    print("OK gallery download-cap + bulk-delete")
