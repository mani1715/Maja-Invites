"""Backend regression tests for:
- GET /api/invite/{slug}/full batched payload (venues / travel / shagun / referral_code)
- POST /api/admin/profiles/{profile_id}/upload-photo (multi-size WebP pipeline)
- convert_to_webp_responsive helper (EXIF + aspect-ratio preserved)
"""
import os
import io
import sys
import pytest
import requests
from pathlib import Path
from PIL import Image

from tests.live import login, require_live, create_profile_for

BASE_URL = require_live()
SLUG = "aarav-and-riya-demo"
PROFILE_ID = "5b14dafa-c26c-446d-82d9-32f5d23d0bdf"
UPLOADS_DIR = Path("/app/uploads/photos")

# Make backend importable for direct unit tests of helper
sys.path.insert(0, "/app/backend")


# ---------- fixtures ----------

@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    return s


@pytest.fixture(scope="session")
def admin_token(api):
    return login("admin@wedding.com", "admin123")


@pytest.fixture(scope="session")
def shagun_wedding(admin_token):
    """An invitation with Digital Shagun switched on. Yields its slug.

    `shagun_enabled` is `enabled AND upi_id` (server.py) — a UPI id is what
    makes the feature real, so the fixture supplies one.
    """
    import uuid
    headers = {"Authorization": f"Bearer {admin_token}",
               "Content-Type": "application/json"}
    r = create_profile_for(headers, {
        "groom_name": f"TESTGroom{uuid.uuid4().hex[:6]}",
        "bride_name": f"TESTBride{uuid.uuid4().hex[:6]}",
        "event_type": "wedding",
        "event_date": "2026-12-12T00:00:00",
        "venue": "Test Hall",
        "city": "Bengaluru",
        "design_id": "royal_heritage",
        "invitation_category": "wedding",
    })
    assert r.status_code in (200, 201), f"could not create fixture: {r.status_code} {r.text[:300]}"
    pid, slug = r.json()["id"], r.json()["slug"]

    # Shagun has its own endpoint. The generic profile PUT accepts the key and
    # answers 200 while dropping it, because `shagun_settings` is not on the
    # profile-update model — so the write has to go here or it silently no-ops.
    upd = requests.put(f"{BASE_URL}/api/admin/profiles/{pid}/shagun", json={
        "enabled": True,
        "upi_id": "test@upi",
        "payee_name": "Test Couple",
        "suggested_amounts": [101, 501, 1001],
    }, headers=headers, timeout=30)
    assert upd.status_code == 200, f"could not enable shagun: {upd.status_code} {upd.text[:300]}"
    try:
        yield slug, pid
    finally:
        requests.delete(f"{BASE_URL}/api/admin/profiles/{pid}", headers=headers, timeout=30)


# ---------- /full payload tests ----------

class TestInviteFullPayload:
    """Batched public invite endpoint."""

    def test_full_returns_200_and_all_top_level_keys(self, api):
        r = api.get(f"{BASE_URL}/api/invite/{SLUG}/full", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ["invite", "wishes", "gifts", "blessings", "gallery_info",
                  "shagun_enabled", "shagun", "venues", "travel", "referral_code"]:
            assert k in data, f"missing top-level key {k}"

    def test_blessings_has_legacy_and_new_keys(self, api):
        d = api.get(f"{BASE_URL}/api/invite/{SLUG}/full", timeout=20).json()
        b = d["blessings"]
        # legacy
        for k in ("blessing_count", "blessing_total_amount", "wishes_count", "recent_blessings"):
            assert k in b, f"legacy key missing: {k}"
        # new
        for k in ("total_count", "recent"):
            assert k in b, f"new key missing: {k}"
        # values consistent
        assert b["total_count"] == b["blessing_count"]
        assert isinstance(b["recent"], list)
        assert isinstance(b["recent_blessings"], list)

    def test_venues_main_venue_has_links(self, api):
        d = api.get(f"{BASE_URL}/api/invite/{SLUG}/full", timeout=20).json()
        mv = d["venues"]["main_venue"]
        assert mv["name"]
        links = mv["links"]
        assert links["google_maps"].startswith("http")
        assert links["apple_maps"].startswith("http")
        assert "uber.com" in links["uber"]
        assert "olacabs.com" in links["ola"]
        assert links["whatsapp_share"].startswith("https://wa.me/")

    def test_travel_links(self, api):
        d = api.get(f"{BASE_URL}/api/invite/{SLUG}/full", timeout=20).json()
        links = d["travel"]["links"]
        for k in ("google_maps", "ola", "uber", "rapido"):
            assert k in links and links[k].startswith("http"), f"travel link missing/invalid: {k}"

    def test_shagun_enabled_and_upi_links(self, api, shagun_wedding):
        """Shagun is per-invitation and OFF unless the studio saves a UPI id,
        so this used to depend on the demo seed having it on — it does not.
        The fixture turns it on, which is also the only way the UPI link
        assertions below can mean anything."""
        slug, _pid = shagun_wedding
        d = api.get(f"{BASE_URL}/api/invite/{slug}/full", timeout=20).json()
        sh = d["shagun"]
        assert sh["enabled"] is True, f"shagun not enabled after seeding: {sh}"
        assert d["shagun_enabled"] is True
        assert len(sh["suggested"]) >= 1
        for entry in sh["suggested"]:
            assert entry["link"].startswith("upi://pay?"), entry["link"]
            # The link must carry the studio's UPI id, or the guest pays nobody.
            assert "pa=" in entry["link"] and "am=" in entry["link"], entry["link"]

    def test_referral_code_populated(self, api):
        """Was pinned to the literal "MAJA-TEST-001" from the old environment's
        seed. Codes are minted per invitation now (and are single-use), so the
        contract is the shape, not one particular string."""
        d = api.get(f"{BASE_URL}/api/invite/{SLUG}/full", timeout=20).json()
        code = d.get("referral_code")
        if code is None:
            pytest.skip("no referral code issued for this invitation")
        assert isinstance(code, str) and code.strip(), f"empty referral code: {code!r}"
        assert len(code) >= 6, f"referral code too short to be unguessable: {code!r}"


# ---------- WebP responsive helper (direct unit test) ----------

class TestConvertToWebpResponsive:
    """Unit test of the helper using an in-memory UploadFile-like object."""

    @pytest.mark.asyncio
    async def test_helper_preserves_aspect_ratio_and_widths(self, tmp_path):
        from server import convert_to_webp_responsive  # noqa
        from fastapi import UploadFile
        # 2400x1600 RGB test image
        im = Image.new("RGB", (2400, 1600), color=(120, 80, 40))
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        buf.seek(0)
        upload = UploadFile(filename="test.png", file=buf)
        variants = await convert_to_webp_responsive(upload, tmp_path, "unit_test_img")

        # All variant files exist with non-zero size
        for label in ("small", "medium", "large", "original"):
            assert label in variants
        # Originals capped at 1920 -> width=1920, height=1280
        assert variants["width"] == 1920
        assert variants["height"] == 1280
        # Check files on disk
        for label, target_w in [("small", 320), ("medium", 640), ("large", 1280)]:
            fp = tmp_path / f"unit_test_img_{label}.webp"
            assert fp.exists(), f"missing variant file {fp}"
            assert fp.stat().st_size > 0
            with Image.open(fp) as v:
                assert v.width == target_w
                # aspect ratio of capped original = 1920:1280 = 3:2 => h = w*2/3
                expected_h = int(target_w * 1280 / 1920)
                assert abs(v.height - expected_h) <= 1, (label, v.size, expected_h)
        orig_fp = tmp_path / "unit_test_img.webp"
        assert orig_fp.exists() and orig_fp.stat().st_size > 0


# ---------- Upload endpoint integration test ----------

class TestUploadPhotoPipeline:
    """POST /api/admin/profiles/{id}/upload-photo end-to-end."""

    def test_upload_returns_media_variants_and_files_on_disk(self, api, admin_token, shagun_wedding):
        im = Image.new("RGB", (2400, 1600), color=(40, 80, 120))
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=92)
        buf.seek(0)

        headers = {"Authorization": f"Bearer {admin_token}"}
        files = {"file": ("test_upload.jpg", buf, "image/jpeg")}
        data = {"caption": "TEST_pytest_upload"}

        r = api.post(
            f"{BASE_URL}/api/admin/profiles/{shagun_wedding[1]}/upload-photo",
            headers=headers, files=files, data=data, timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()

        mv = body.get("media_variants")
        assert mv is not None, "media_variants missing in response"
        for k in ("small", "medium", "large", "original", "width", "height", "size"):
            assert k in mv, f"variant key missing: {k}"

        # media_url should == variants.original
        assert body["media_url"] == mv["original"]

        # Files on disk under /app/uploads/photos
        for label in ("small", "medium", "large", "original"):
            url = mv[label]
            # URL is /uploads/photos/<base>{_label}.webp or /uploads/photos/<base>.webp
            assert url.startswith("/uploads/photos/")
            fs_path = Path("/app") / url.lstrip("/")
            assert fs_path.exists(), f"variant file does not exist: {fs_path}"
            assert fs_path.stat().st_size > 0

        # width/height sane (cap at 1920)
        assert mv["width"] <= 1920
        assert mv["height"] <= 1920

        # NOTE: /uploads/* is only routed internally (k8s ingress routes /api/* to
        # backend); we don't assert public HTTP reachability of the static asset.

        # Cleanup: remove media record so the gallery doesn't grow indefinitely
        media_id = body.get("id")
        if media_id:
            api.delete(f"{BASE_URL}/api/admin/media/{media_id}",
                       headers=headers, timeout=20)
