"""
Find-my-photos must NOT require the whole-album PIN — access-gate regression.

Business rule (2026-08-22): the album passcode (gallery_privacy) protects the
WHOLE album only. Find my photos returns a guest their own face matches and
never the album, so it is gated by the face-match on/off flag + consent + rate
limits, NOT by the album PIN. This proves the split at the HTTP gate:

  • POST /api/public/gallery/{slug}/face-search  on a PIN-protected event, with
    NO device token → is NOT 401 "Gallery is locked". It reaches the real
    face-flow gate (428 CONSENT_REQUIRED) instead.
  • GET  /api/public/gallery/{slug}/all-photos   on the same event, no token →
    STILL 401 (the album stays PIN-gated).

Deliberately AWS-free: it seeds gallery_privacy/gallery_config directly via
live_db and asserts on the ACCESS gate, which runs before any S3 work — so it
gives real coverage on a local backend with no AWS configured (unlike the
download-cap suite, which needs signed S3 URLs and skips here).

    PYTHONIOENCODING=utf-8 python -m pytest backend/tests/test_findmyphotos_no_pin.py -q
"""
from __future__ import annotations

import asyncio

import requests

from tests.live import (require_live, login, create_profile_for,
                        new_wedding_payload, delete_wedding, live_db, UA_HEADER)

BASE_URL = require_live()
STUDIO_EMAIL = "admin@wedding.com"
STUDIO_PASSWORD = "admin123"


def _photog_headers() -> dict:
    tok = login(STUDIO_EMAIL, STUDIO_PASSWORD)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


async def _protect(pid: str):
    """Make the gallery PIN-protected + face-match enabled, without AWS."""
    db = live_db()
    await db.ensure_connected()
    await db.profiles.update_one({"id": pid}, {"$set": {
        "gallery_privacy": {
            "enabled": True,
            # Any non-empty hash trips enforce_gallery_access; the test never
            # unlocks, it only checks which routes demand the token.
            "password_hash": "$2b$12$0000000000000000000000000000000000000000000000000000",
            "private_full_gallery_enabled": True,
            "ai_face_match_enabled": True,
            "allow_downloads": True,
            "device_token_salt": "testsalt",
        },
        "gallery_config": {"enabled": True, "face_search_enabled": True},
    }})


def test_find_my_photos_needs_no_album_pin():
    headers = _photog_headers()
    r = create_profile_for(headers, new_wedding_payload())
    assert r.status_code in (200, 201), f"create profile: {r.status_code} {r.text[:200]}"
    prof = r.json()
    slug, pid = prof["slug"], prof["id"]
    try:
        asyncio.run(_protect(pid))

        # ---- Find my photos: PIN-protected event, NO device token ----
        fs = requests.post(
            f"{BASE_URL}/api/public/gallery/{slug}/face-search",
            files={"selfie": ("s.jpg", b"\xff\xd8\xff\xe0", "image/jpeg")},
            headers=UA_HEADER, timeout=30)
        assert fs.status_code != 401, (
            "face-search must NOT require the album PIN "
            f"(got {fs.status_code} {fs.text[:200]})")
        # It reaches the real face-flow gate: consent required before any search.
        assert fs.status_code == 428, (
            f"expected 428 CONSENT_REQUIRED, got {fs.status_code} {fs.text[:200]}")
        assert (fs.json().get("detail") or {}).get("code") == "CONSENT_REQUIRED"

        # ---- Whole album: same event, no token → STILL locked ----
        ap = requests.get(f"{BASE_URL}/api/public/gallery/{slug}/all-photos",
                          headers=UA_HEADER, timeout=30)
        assert ap.status_code == 401, (
            "all-photos (whole album) must stay PIN-gated "
            f"(got {ap.status_code} {ap.text[:200]})")
    finally:
        delete_wedding(headers, pid)


if __name__ == "__main__":
    test_find_my_photos_needs_no_album_pin()
    print("OK find-my-photos needs no album PIN; whole album stays gated")
