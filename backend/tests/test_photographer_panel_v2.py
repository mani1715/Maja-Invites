"""
Tests for photographer panel changes (Iteration covering):
- /api/admin/upload-image (admin pre-save upload)
- /api/music/presets (60 presets)
- /api/admin/expiry-tiers (admin GET)
- /api/admin/ai/story (Gemini-2.5-flash)
"""
import io
import os
import struct
import zlib
import pytest
import requests

from tests.live import login, require_live

BASE_URL = require_live()
ADMIN_EMAIL = "admin@wedding.com"
ADMIN_PASSWORD = "admin123"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    return s


@pytest.fixture(scope="session")
def admin_token(api_client):
    return login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "User-Agent": UA}


def _make_png_bytes():
    """Create a tiny valid 2x2 PNG."""
    # IHDR
    def chunk(t, data):
        crc = zlib.crc32(t + data) & 0xffffffff
        return struct.pack(">I", len(data)) + t + data + struct.pack(">I", crc)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0))
    raw = b"\x00" + b"\xff\x00\x00" * 2 + b"\x00" + b"\x00\xff\x00" * 2
    idat = chunk(b"IDAT", zlib.compress(raw))
    iend = chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


# --- Music Presets ---
class TestMusicPresets:
    def test_music_presets_are_curated_and_well_formed(self, api_client):
        """Was `test_music_presets_returns_60`. The library deliberately shrank
        from 60 to a smaller curated set: the 60 advertised Indian-wedding
        titles (Ganpati Aarti, Shehnai, Sitar Raga…) all pointed at the same 16
        generic demo instrumentals, so the names lied about the audio
        (music_library.py documents the rewrite). Pinning the count to 60 was
        pinning the dishonest version, so this asserts the properties that
        actually matter instead."""
        r = api_client.get(f"{BASE_URL}/api/music/presets")
        assert r.status_code == 200, f"unexpected {r.status_code}: {r.text[:200]}"
        body = r.json()
        presets = body if isinstance(body, list) else body.get("presets", [])
        assert presets, "music library is empty"
        # The wire names are preset_id / name — NOT id / title, which is what
        # the old assertions looked for and never reached because the count
        # check failed first.
        ids = [p.get("preset_id") for p in presets]
        assert all(ids), f"preset without an id: {presets[:2]}"
        assert len(ids) == len(set(ids)), f"duplicate preset ids: {ids}"
        for p in presets:
            for k in ("preset_id", "name", "mood", "url"):
                assert k in p, f"missing key {k} in preset: {p}"
            assert str(p["url"]).startswith("https://"), f"non-https preset url: {p}"


# --- Expiry Tiers (admin) ---
class TestExpiryTiers:
    def test_get_expiry_tiers_returns_4(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/admin/expiry-tiers", headers=auth_headers)
        assert r.status_code == 200, f"unexpected {r.status_code}: {r.text[:300]}"
        body = r.json()
        tiers = body if isinstance(body, list) else body.get("tiers", body.get("expiry_tiers", []))
        assert len(tiers) == 4, f"expected 4 tiers, got {len(tiers)}: {tiers}"
        ids = set()
        for t in tiers:
            tid = t.get("id") or t.get("key") or t.get("tier")
            ids.add(tid)
        expected = {"1_month", "3_months", "6_months", "1_year"}
        assert expected.issubset(ids), f"missing expected tier ids; got {ids}"

    def test_expiry_tiers_requires_auth(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/admin/expiry-tiers")
        assert r.status_code in (401, 403), f"should require auth, got {r.status_code}"


# --- Admin Upload Image ---
class TestAdminUploadImage:
    def test_upload_png_success(self, api_client, auth_headers):
        png = _make_png_bytes()
        files = {"file": ("test.png", io.BytesIO(png), "image/png")}
        data = {"slot": "bride"}
        # multipart -> don't set content-type
        h = {k: v for k, v in auth_headers.items() if k.lower() != "content-type"}
        r = api_client.post(
            f"{BASE_URL}/api/admin/upload-image",
            headers=h,
            files=files,
            data=data,
        )
        assert r.status_code == 200, f"upload failed {r.status_code}: {r.text[:400]}"
        body = r.json()
        url = body.get("url") or body.get("path") or body.get("image_url")
        assert url, f"no url in response: {body}"
        assert "/uploads/" in url, f"expected /uploads/ prefix, got {url}"

    def test_upload_requires_auth(self, api_client):
        png = _make_png_bytes()
        files = {"file": ("test.png", io.BytesIO(png), "image/png")}
        r = api_client.post(
            f"{BASE_URL}/api/admin/upload-image",
            files=files,
            data={"slot": "bride"},
        )
        assert r.status_code in (401, 403), f"should require auth, got {r.status_code}"


# --- AI Story (Gemini) ---
class TestAIStory:
    def test_ai_story_returns_non_empty(self, api_client, auth_headers):
        payload = {
            "bride": "Aisha",
            "groom": "Rohan",
            "theme": "cinematic_royal",
            "tone": "cinematic_royal",
            "kind": "invitation",
            "language": "English",
            "notes": "Met at a Mumbai coffee shop during a monsoon evening.",
        }
        r = api_client.post(
            f"{BASE_URL}/api/admin/ai/story",
            json=payload,
            headers={**auth_headers, "Content-Type": "application/json"},
            timeout=60,
        )
        if r.status_code == 503 and "not configured" in r.text:
            # No GEMINI_API_KEY in this environment. That is a deployment
            # decision, not a defect — but say "not run" rather than "passed".
            pytest.skip("AI provider not configured here (GEMINI_API_KEY unset)")
        assert r.status_code == 200, f"ai story failed {r.status_code}: {r.text[:400]}"
        body = r.json()
        story = body.get("story") or body.get("text") or body.get("content") or ""
        assert isinstance(story, str) and len(story.strip()) > 50, (
            f"empty/short story returned: {body}"
        )
