"""
Self-test for browser-to-S3 direct uploads (storage_upload.py).

    cd backend && PYTHONPATH=. python tests/test_storage_upload.py

A presigned POST is a capability handed to a browser, so every check here is
about not trusting the client:

  1. The SERVER chooses the object key. A client-supplied key would be a
     path-traversal and cross-tenant overwrite primitive.
  2. content-length-range is baked into the policy, so S3 rejects an oversized
     body itself — checking size afterwards means you already paid to store it.
  3. Content type is allowlisted; unknown types never get a policy.
  4. Event-scoped areas require a syntactically valid event_id.
  5. Commit re-derives size and type from head_object; the client's claims are
     ignored, and a mismatched type is deleted rather than recorded.
  6. Commit refuses a key belonging to another studio — otherwise a studio
     could claim someone else's media by guessing a key.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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


ADMIN = "ph_studio_one"


class FakeS3:
    def __init__(self):
        self.objects = {}
        self.deleted = []
        self.last_conditions = None

    def generate_presigned_post(self, Bucket, Key, Fields, Conditions, ExpiresIn):
        self.last_conditions = Conditions
        return {"url": f"https://{Bucket}.s3.amazonaws.com/",
                "fields": {**Fields, "key": Key, "policy": "x", "signature": "y"}}

    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            raise RuntimeError("404")
        return self.objects[Key]

    def copy_object(self, Bucket, CopySource, Key):
        src_key = CopySource.get("Key") if isinstance(CopySource, dict) else CopySource
        if src_key in self.objects:
            self.objects[Key] = dict(self.objects[src_key])

    def delete_object(self, Bucket, Key):
        self.deleted.append(Key)
        self.objects.pop(Key, None)


def _app(db, s3):
    fake_aws = types.ModuleType("aws_service")
    fake_aws.bucket = lambda: "maja-media"
    fake_aws.s3 = lambda: s3
    fake_aws.generate_signed_url = lambda k, e=3600: f"https://cdn/{k}"
    sys.modules["aws_service"] = fake_aws

    import storage_upload
    import importlib
    importlib.reload(storage_upload)

    app = FastAPI()
    app.include_router(
        storage_upload.build_storage_upload_router(db, lambda: ADMIN))
    return app


async def _run():
    db, s3 = FakeDB(), FakeS3()
    client = TestClient(_app(db, s3))

    print("1. the server chooses the key")
    r = client.post("/api/uploads/presign", json={
        "area": "portfolio", "content_type": "image/jpeg",
        "size_bytes": 1024, "filename": "../../../etc/passwd"})
    _check(r.status_code == 200, "presign issued")
    key = r.json()["key"]
    _check(key.startswith(f"portfolios/{ADMIN}/works/"),
           f"key is server-namespaced: {key}")
    _check("passwd" not in key and ".." not in key,
           "client filename never reaches the key")
    _check(r.json()["fields"]["key"] == key, "policy pins that exact key")

    print("2. size cap is enforced by the POLICY, not after the fact")
    conds = s3.last_conditions
    clr = [c for c in conds if isinstance(c, list) and c[0] == "content-length-range"]
    _check(clr and clr[0][2] == 25 * 1024 * 1024,
           "content-length-range in the policy so S3 rejects oversized bodies")
    r = client.post("/api/uploads/presign", json={
        "area": "portfolio", "content_type": "image/jpeg",
        "size_bytes": 99 * 1024 * 1024})
    _check(r.status_code == 413, "declared-oversize rejected before signing")

    print("3. content type allowlist")
    for bad in ("application/x-msdownload", "text/html", "application/zip"):
        rr = client.post("/api/uploads/presign", json={
            "area": "portfolio", "content_type": bad, "size_bytes": 10})
        _check(rr.status_code == 415, f"refused {bad}")

    print("4. event-scoped areas need a valid event_id")
    _check(client.post("/api/uploads/presign", json={
        "area": "qr_photos", "content_type": "image/jpeg",
        "size_bytes": 10}).status_code == 400, "qr_photos without event_id refused")
    _check(client.post("/api/uploads/presign", json={
        "area": "qr_photos", "content_type": "image/jpeg", "size_bytes": 10,
        "event_id": "../../evil"}).status_code == 400,
        "traversal in event_id refused")
    _check(client.post("/api/uploads/presign", json={
        "area": "nonsense", "content_type": "image/jpeg",
        "size_bytes": 10}).status_code == 400, "unknown area refused")

    print("5. commit re-derives truth from head_object")
    r = client.post("/api/uploads/presign", json={
        "area": "portfolio", "content_type": "image/jpeg", "size_bytes": 500})
    key = r.json()["key"]
    # The client claimed 500 bytes; S3 says 4 MB. The bigger number must win.
    s3.objects[key] = {"ContentLength": 4 * 1024 * 1024, "ContentType": "image/jpeg"}
    r = client.post("/api/uploads/commit", json={"key": key, "area": "portfolio"})
    _check(r.status_code == 200, "commit accepted")
    _check(r.json()["file"]["size_bytes"] == 4 * 1024 * 1024,
           "size taken from S3, not from the client's claim")
    _check(r.json()["file"]["source_path"] == key,
           "source_path == key, so storage_serve resolves it by the same lookup")

    print("6. commit rejects what it should")
    _check(client.post("/api/uploads/commit",
                       json={"key": "portfolios/SOMEONE_ELSE/works/x.jpg",
                             "area": "portfolio"}).status_code == 403,
           "another studio's key refused")
    _check(client.post("/api/uploads/commit",
                       json={"key": f"portfolios/{ADMIN}/works/ghost.jpg",
                             "area": "portfolio"}).status_code == 404,
           "committing an object that was never uploaded refused")

    r = client.post("/api/uploads/presign", json={
        "area": "portfolio", "content_type": "image/jpeg", "size_bytes": 500})
    swapped = r.json()["key"]
    # Signed for an image, actually PUT an HTML file (stored XSS vector).
    s3.objects[swapped] = {"ContentLength": 10, "ContentType": "text/html"}
    rr = client.post("/api/uploads/commit", json={"key": swapped, "area": "portfolio"})
    _check(rr.status_code == 415, "type-swapped object refused at commit")
    _check(swapped in s3.deleted, "and deleted from the bucket, not left orphaned")

    print(f"\nALL STORAGE UPLOAD CHECKS PASSED ({PASS} checks)")


if __name__ == "__main__":
    asyncio.run(_run())
