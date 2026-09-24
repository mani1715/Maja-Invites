"""
test_media_dedup_paths.py - Lane A6 self-test (media_derivatives refactor + dedup).

    cd backend && python -m tests.test_media_dedup_paths

No live DB, no server. Covers:
  1. live_gallery_features._save_image_with_thumbs, now built on
     media_derivatives.normalize/encode, still produces the contracted output
     (full-size JPEG q88 original + 800px WEBP thumb + 200px WEBP micro) -
     including the bounding-box (not width-only) sizing for portrait photos.
  2. Checksum dedup on the guest_upload path (live_gallery_features.py):
     a byte-identical re-upload returns the EXISTING row (no new file, no new
     DB row); a genuinely different photo is NOT deduped.
"""
from __future__ import annotations

import asyncio
import io
import os
import sys
import tempfile
import types
from pathlib import Path

import pytest

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet          # noqa: E402
os.environ.setdefault("STORAGE_CRED_KEY", Fernet.generate_key().decode())

from PIL import Image as PILImage                # noqa: E402
from tests.test_storage_orchestrator import FakeDB   # noqa: E402
import live_gallery_features as lgf               # noqa: E402


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


def _jpeg_bytes(w, h, color=(40, 90, 160)) -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (w, h), color).save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def _ep(router, path, method="POST"):
    for r in router.routes:
        if getattr(r, "path", None) == path and method in getattr(r, "methods", set()):
            return r.endpoint
    raise AssertionError(f"no endpoint {method} {path}")


class _FakeUpload:
    """Duck-typed UploadFile stand-in - just what the handlers touch."""
    def __init__(self, data: bytes, filename="p.jpg", content_type="image/jpeg"):
        self._data = data
        self.filename = filename
        self.content_type = content_type

    async def read(self):
        return self._data


class _FakeClient:
    host = "203.0.113.5"


class _FakeRequest:
    client = _FakeClient()


@pytest.fixture(name="tmp")
def _tmp_dir(tmp_path: Path) -> Path:
    """`main()` below passes a scratch directory positionally; under pytest the
    same parameter has to come from a fixture or both tests ERROR with
    "fixture 'tmp' not found" — which they did, invisibly, because this module
    is normally exercised through its __main__ block and never through pytest.
    """
    return tmp_path


def test_derivative_sizes(tmp: Path):
    print("1. derivative helper - contracted sizes/formats")
    dest = tmp / "derivs"

    meta = lgf._save_image_with_thumbs(_jpeg_bytes(3000, 1500), dest, "land")
    orig = PILImage.open(dest / meta["orig_filename"])
    thumb = PILImage.open(dest / meta["thumb_filename"])
    micro = PILImage.open(dest / meta["micro_filename"])
    _check(orig.format == "JPEG" and orig.size == (3000, 1500), "original: full-size JPEG, no resize")
    _check(thumb.format == "WEBP" and max(thumb.size) <= 800, "thumb: WEBP, bounded to 800")
    _check(micro.format == "WEBP" and max(micro.size) <= 200, "micro: WEBP, bounded to 200")
    _check(meta["width"] == 3000 and meta["height"] == 1500, "meta dims match source")

    # Portrait: the bounding-box .thumbnail() must cap by the LARGER dimension
    # (height here), not resize by width alone - a naive width-only
    # media_derivatives.encode() call would have changed this output.
    meta2 = lgf._save_image_with_thumbs(_jpeg_bytes(900, 1600), dest, "port")
    thumb2 = PILImage.open(dest / meta2["thumb_filename"])
    _check(thumb2.size == (450, 800), f"portrait thumb bounded by height: got {thumb2.size}")


def _dummy_require_admin() -> dict:
    return {"admin_id": "studioA", "role": "admin"}


async def test_dedup(tmp: Path):
    print("2. checksum dedup - guest_upload path")
    db = FakeDB()
    await db.profiles.insert_one({"id": "w1", "slug": "w1-slug", "admin_id": "studioA"})

    # require_admin/get_current_user are only wired for the *other* routes this
    # builder also registers (photographer/host upload, admin list/delete) -
    # FastAPI inspects their signature at decoration time regardless of which
    # endpoint we call, so they need to be real callables, not None.
    router = lgf.build_live_gallery_router(db, require_admin=_dummy_require_admin,
                                           get_current_user=_dummy_require_admin)
    ep = _ep(router, "/api/invite/{slug}/gallery/guest-upload")

    real_root = lgf.UPLOAD_ROOT
    lgf.UPLOAD_ROOT = tmp / "weddings"
    try:
        raw = _jpeg_bytes(1200, 800)
        r1 = await ep(slug="w1-slug", request=_FakeRequest(), file=_FakeUpload(raw),
                      guest_name="Asha", caption=None)
        _check(r1["success"] and r1["photo"]["checksum"], "first upload stored, checksum recorded")
        n1 = await db.live_gallery_photos.count_documents({"profile_id": "w1"})
        _check(n1 == 1, "exactly one row after first upload")

        r2 = await ep(slug="w1-slug", request=_FakeRequest(), file=_FakeUpload(raw),
                      guest_name="Asha again", caption=None)
        _check(r2["photo"]["id"] == r1["photo"]["id"], "second identical upload returns the SAME row")
        n2 = await db.live_gallery_photos.count_documents({"profile_id": "w1"})
        _check(n2 == 1, "no duplicate row written")

        different = _jpeg_bytes(1200, 800, (5, 5, 5))
        r3 = await ep(slug="w1-slug", request=_FakeRequest(), file=_FakeUpload(different),
                      guest_name="Bala", caption=None)
        _check(r3["photo"]["id"] != r1["photo"]["id"], "different bytes are not deduped")
        n3 = await db.live_gallery_photos.count_documents({"profile_id": "w1"})
        _check(n3 == 2, "second distinct upload adds a new row")
    finally:
        lgf.UPLOAD_ROOT = real_root


async def main():
    tmp = Path(tempfile.mkdtemp(prefix="maja_dedup_"))
    test_derivative_sizes(tmp)
    await test_dedup(tmp)
    print("\nALL MEDIA DEDUP/DERIVATIVE TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
