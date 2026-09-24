"""
Self-test for the CloudFront-backed serving path (storage_serve.py).

    cd backend && PYTHONPATH=. python tests/test_storage_serve.py

No network, no Postgres, no AWS. Proves the contract after the 2026-08-06
decision to serve media from S3 + CloudFront instead of proxying Drive:

  1. A migrated file 302s to the CDN — the app server moves NO bytes. This is
     the whole point; a regression here silently turns EC2 back into the
     delivery path and the bandwidth bill follows.
  2. The redirect is 302, never 301 — a permanent redirect would outlive the
     signature and pin users to a dead URL.
  3. A file not yet migrated still serves from local disk (the migration window).
  4. Range works on that local branch. Starlette 0.37.2's FileResponse ignores
     Range, so seeking in reels/films depends on this hand-rolled code.
  5. Signing failure falls back to disk rather than 502.
  6. Path traversal is refused.
  7. /api/media checks the signature BEFORE minting a CDN URL, and rejects a
     valid signature re-pointed at someone else's object.
"""
from __future__ import annotations

import asyncio
import os
import shutil
import sys
import tempfile
import types
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()

from cryptography.fernet import Fernet
os.environ["STORAGE_CRED_KEY"] = Fernet.generate_key().decode()

from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.test_storage_orchestrator import FakeDB

PASS = 0


def _check(cond, msg):
    global PASS
    if cond:
        PASS += 1
        print(f"  ok  {msg}")
    else:
        print(f"  FAIL {msg}")
        raise AssertionError(msg)


CDN = "https://d111111abcdef8.cloudfront.net"


class FakePool:
    """storage_serve only needs get_download_url(file_id, ttl) -> signed URL."""

    def __init__(self):
        self.calls = 0
        self.downloads = 0          # must stay 0 — bytes must not flow via EC2
        self.explode = False

    async def get_download_url(self, file_id, ttl=3600):
        if self.explode:
            raise RuntimeError("signing unavailable")
        self.calls += 1
        return f"{CDN}/{file_id}?Expires={ttl}&Signature=abc"

    async def download_file(self, file_id):
        self.downloads += 1
        raise AssertionError("serving must never download bytes through EC2")


def _app(db, uploads_root, pool):
    import storage_pool_hooks
    storage_pool_hooks._orch = lambda _db: pool
    import storage_serve
    app = FastAPI()
    app.include_router(storage_serve.build_storage_serve_router(db, uploads_root))
    return app


async def _run():
    tmp = Path(tempfile.mkdtemp(prefix="serve_cdn_"))
    uploads = tmp / "uploads"
    (uploads / "portfolio" / "ph1").mkdir(parents=True)

    import storage_serve
    db, pool = FakeDB(), FakePool()
    client = TestClient(_app(db, uploads, pool), follow_redirects=False)

    print("1. migrated file -> 302 to CloudFront, zero bytes through EC2")
    reel = uploads / "portfolio" / "ph1" / "reel.mp4"
    await db.storage_files.insert_one({
        "id": "file_abc", "source_path": str(reel).replace("\\", "/"),
        "content_type": "video/mp4", "size_bytes": 1234,
        "provider_ref": {"key": "portfolios/ph1/works/abc.mp4"},
    })
    r = client.get("/api/uploads/portfolio/ph1/reel.mp4")
    _check(r.status_code == 302, "302 redirect")
    _check(r.headers["location"].startswith(CDN), "points at the CDN")
    _check("Signature=" in r.headers["location"], "URL is signed")
    _check(pool.downloads == 0, "app server downloaded NOTHING")
    _check(r.status_code != 301, "302 not 301 — signature outlives a 301 cache")
    _check("private" in r.headers.get("cache-control", ""),
           "redirect cached privately, and for less than the signature TTL")

    print("2. not-yet-migrated file still serves from local disk")
    plain = uploads / "portfolio" / "ph1" / "plain.jpg"
    plain.write_bytes(b"LOCALBYTES")
    r = client.get("/api/uploads/portfolio/ph1/plain.jpg")
    _check(r.status_code == 200 and r.content == b"LOCALBYTES",
           "unmigrated original served unchanged")

    print("3. Range on the local branch (Starlette's FileResponse ignores it)")
    body = bytes(range(256)) * 40
    vid = uploads / "portfolio" / "ph1" / "local.mp4"
    vid.write_bytes(body)
    r = client.get("/api/uploads/portfolio/ph1/local.mp4",
                   headers={"Range": "bytes=100-199"})
    _check(r.status_code == 206 and r.content == body[100:200], "exact byte slice")
    _check(r.headers.get("content-range") == f"bytes 100-199/{len(body)}",
           "Content-Range correct")
    r = client.get("/api/uploads/portfolio/ph1/local.mp4",
                   headers={"Range": "bytes=-50"})
    _check(r.status_code == 206 and r.content == body[-50:], "suffix range")
    r = client.get("/api/uploads/portfolio/ph1/local.mp4",
                   headers={"Range": f"bytes={len(body)+5}-"})
    _check(r.status_code == 416, "unsatisfiable range -> 416")

    print("4. signing failure degrades to disk, not 502")
    both = uploads / "portfolio" / "ph1" / "both.jpg"
    both.write_bytes(b"DISKCOPY")
    await db.storage_files.insert_one({
        "id": "file_both", "source_path": str(both).replace("\\", "/"),
        "content_type": "image/jpeg", "size_bytes": 8,
        "provider_ref": {"key": "portfolios/ph1/works/both.jpg"},
    })
    pool.explode = True
    r = client.get("/api/uploads/portfolio/ph1/both.jpg")
    _check(r.status_code == 200 and r.content == b"DISKCOPY",
           "CDN signing outage falls back to the surviving original")
    pool.explode = False

    print("5. path traversal refused")
    (tmp / "secret.txt").write_bytes(b"TOPSECRET")
    for attack in ("../secret.txt", "portfolio/../../secret.txt",
                   "..%2f..%2fsecret.txt"):
        rr = client.get(f"/api/uploads/{attack}")
        _check(rr.status_code == 404 and b"TOPSECRET" not in rr.content,
               f"refused {attack!r}")

    print("6. /api/media — signature checked before any CDN URL is minted")
    s3key = "events/ev1/photos/p1/orig.jpg"
    await db.storage_files.insert_one({
        "id": "file_gal", "source_path": s3key,
        "content_type": "image/jpeg", "size_bytes": 999,
        "provider_ref": {"key": s3key},
    })
    url = storage_serve.media_url(s3key, 3600)
    r = client.get(url)
    _check(r.status_code == 302 and r.headers["location"].startswith(CDN),
           "valid token -> signed CDN redirect")

    before = pool.calls
    _check(client.get(url + "tamper").status_code == 403, "tampered signature refused")
    real_k = url.split("k=")[1].split("&")[0]
    other_k = storage_serve._b64(b"events/someone-else/photos/x/orig.jpg")
    _check(client.get(url.replace(real_k, other_k)).status_code == 403,
           "valid signature re-pointed at another object refused")
    _check(client.get(storage_serve.media_url(s3key, -10)).status_code == 403,
           "expired link refused")
    _check(pool.calls == before,
           "no CDN URL was minted for any rejected request")

    shutil.rmtree(tmp, ignore_errors=True)
    print(f"\nALL STORAGE SERVE CHECKS PASSED ({PASS} checks)")


if __name__ == "__main__":
    asyncio.run(_run())
