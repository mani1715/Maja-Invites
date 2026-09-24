"""
Self-test for upload_sessions_service.py (direct-browser -> S3 upload
SESSIONS: single presigned PUT for small files, S3 multipart for large ones).

    cd backend && PYTHONIOENCODING=utf-8 python -m pytest tests/test_upload_sessions_service.py -q

No live stack, no real AWS/Postgres — FakeDB (tests.test_storage_orchestrator,
the same in-memory Mongo-ish harness storage_pool_jobs/storage_upload use) plus
a FakeAWS that stands in for every `aws_service` function the router calls
(monkeypatched onto the module attributes, matching how the code under test
resolves them: `import aws_service` then `aws_service.<fn>(...)`).

Covers: session creation (single/multipart mode selection, mime/size/quota/
ownership rejection), the multipart parts handshake, complete()'s CAS +
server-side size verification, abort idempotency, and the expiry sweep.
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import timedelta
from pathlib import Path
from typing import Any, Dict

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from tests.test_storage_orchestrator import FakeDB  # noqa: E402
import aws_service  # noqa: E402
import media_storage  # noqa: E402
import upload_sessions_service as svc  # noqa: E402


class FakeAWS:
    """Stand-in for every aws_service call upload_sessions_service makes.
    Installed by monkeypatching the (already-imported, possibly-stub)
    `aws_service` module's attributes -- the code under test looks these up
    by attribute at call time, so this takes effect immediately."""

    def __init__(self):
        self.objects: Dict[str, Dict[str, Any]] = {}   # key -> {size, etag, content_type}
        self.multipart: Dict[str, Dict[str, Any]] = {}  # upload_id -> {key, aborted, completed}
        self.deleted = []
        self._n = 0

    def bucket(self):
        return "maja-media-test"

    def generate_presigned_put(self, key, content_type, expiry_seconds=900, bucket_name=None):
        return f"https://s3.test/{bucket_name}/{key}?put"

    def create_multipart_upload(self, key, content_type, tags=None, bucket_name=None):
        self._n += 1
        uid = f"mpu{self._n}"
        self.multipart[uid] = {"key": key, "aborted": False, "completed": False}
        return uid

    def presign_upload_part(self, key, upload_id, part_number, expiry_seconds=900, bucket_name=None):
        return f"https://s3.test/{bucket_name}/{key}?part={part_number}"

    def list_uploaded_parts(self, key, upload_id, bucket_name=None):
        return []

    def complete_multipart_upload(self, key, upload_id, parts, bucket_name=None):
        mpu = self.multipart.get(upload_id)
        if not mpu or mpu["aborted"]:
            raise RuntimeError("NoSuchUpload")
        mpu["completed"] = True
        return {"ok": True, "etag": "etag-mpu", "key": key}

    def abort_multipart_upload(self, key, upload_id, bucket_name=None):
        if upload_id in self.multipart:
            self.multipart[upload_id]["aborted"] = True
        return True

    def head_object(self, key, bucket_name=None):
        return self.objects.get(key)

    def delete_object(self, key, bucket_name=None):
        self.deleted.append(key)
        self.objects.pop(key, None)
        return True

    def generate_signed_url(self, key, expiry_seconds=3600, bucket_name=None):
        return f"https://cdn.test/{key}"


def _install_fake_aws() -> FakeAWS:
    fake = FakeAWS()
    for name in ("bucket", "generate_presigned_put", "create_multipart_upload",
                 "presign_upload_part", "list_uploaded_parts",
                 "complete_multipart_upload", "abort_multipart_upload",
                 "head_object", "delete_object", "generate_signed_url"):
        setattr(aws_service, name, getattr(fake, name))
    return fake


def _make_app(db, admin_id: str, role: str = "admin") -> TestClient:
    async def fake_require_admin():
        return {"admin_id": admin_id, "role": role}

    app = FastAPI()
    app.include_router(svc.build_upload_sessions_router(db, fake_require_admin))
    return TestClient(app)


# --------------------------------------------------------------------------- #
# 1. create session: single vs multipart mode selection
# --------------------------------------------------------------------------- #
def test_create_session_single_and_multipart_mode():
    db = FakeDB()
    aws = _install_fake_aws()
    client = _make_app(db, "ph_1")

    r = client.post("/api/media/upload-sessions", json={
        "category": "portfolio", "kind": "image", "mime": "image/jpeg",
        "size_bytes": 1024, "filename": "cover.jpg"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "single"
    assert body["upload_url"]
    assert body["key"].startswith("photographer/ph_1/portfolio/images/")

    big = media_storage.MULTIPART_THRESHOLD_BYTES + 1
    r2 = client.post("/api/media/upload-sessions", json={
        "category": "portfolio", "kind": "video", "mime": "video/mp4",
        "size_bytes": big})
    assert r2.status_code == 200, r2.text
    body2 = r2.json()
    assert body2["mode"] == "multipart"
    assert body2["upload_url"] is None
    assert aws.multipart, "create_multipart_upload was called"


# --------------------------------------------------------------------------- #
# 2. mime rejected -> 415
# --------------------------------------------------------------------------- #
def test_mime_rejected_415():
    db = FakeDB()
    _install_fake_aws()
    client = _make_app(db, "ph_2")
    r = client.post("/api/media/upload-sessions", json={
        "category": "portfolio", "kind": "image", "mime": "image/svg+xml",
        "size_bytes": 100})
    assert r.status_code == 415, r.text


# --------------------------------------------------------------------------- #
# 3. oversize -> 413
# --------------------------------------------------------------------------- #
def test_oversize_413():
    db = FakeDB()
    _install_fake_aws()
    client = _make_app(db, "ph_3")
    over = media_storage.MAX_BYTES_BY_KIND["image"] + 1
    r = client.post("/api/media/upload-sessions", json={
        "category": "portfolio", "kind": "image", "mime": "image/jpeg",
        "size_bytes": over})
    assert r.status_code == 413, r.text


# --------------------------------------------------------------------------- #
# 4. wrong-owner event -> 404 (never trust the browser's event_id)
# --------------------------------------------------------------------------- #
def test_wrong_owner_event_404():
    db = FakeDB()
    _install_fake_aws()
    asyncio.run(db.profiles.insert_one({"id": "wed_a", "admin_id": "owner_a"}))

    stranger = _make_app(db, "owner_b")
    r = stranger.post("/api/media/upload-sessions", json={
        "category": "event", "kind": "image", "mime": "image/jpeg",
        "size_bytes": 100, "event_id": "wed_a"})
    assert r.status_code == 404, r.text

    owner = _make_app(db, "owner_a")
    r2 = owner.post("/api/media/upload-sessions", json={
        "category": "event", "kind": "image", "mime": "image/jpeg",
        "size_bytes": 100, "event_id": "wed_a"})
    assert r2.status_code == 200, r2.text
    assert "photographer/owner_a/event/wed_a/" in r2.json()["key"]


# --------------------------------------------------------------------------- #
# 5. quota exceeded -> 413 {"error": "quota_exceeded"}
# --------------------------------------------------------------------------- #
def test_quota_exceeded_413():
    db = FakeDB()
    _install_fake_aws()
    admin_id = "ph_5"
    asyncio.run(db.media_assets.insert_one({
        "id": "a1", "photographer_id": admin_id, "status": "available",
        "size_bytes": media_storage.PHOTOGRAPHER_QUOTA_BYTES - 100}))
    client = _make_app(db, admin_id)
    r = client.post("/api/media/upload-sessions", json={
        "category": "portfolio", "kind": "image", "mime": "image/jpeg",
        "size_bytes": 1000})
    assert r.status_code == 413, r.text
    assert r.json()["detail"]["error"] == "quota_exceeded"


# --------------------------------------------------------------------------- #
# 6. complete CAS: double-complete -> second call gets 409
# --------------------------------------------------------------------------- #
def test_double_complete_second_gets_409():
    db = FakeDB()
    aws = _install_fake_aws()
    client = _make_app(db, "ph_6")
    r = client.post("/api/media/upload-sessions", json={
        "category": "portfolio", "kind": "image", "mime": "image/jpeg",
        "size_bytes": 1000})
    sid, key = r.json()["session_id"], r.json()["key"]
    aws.objects[key] = {"size": 1000, "etag": "e1", "content_type": "image/jpeg"}

    r1 = client.post(f"/api/media/upload-sessions/{sid}/complete", json={})
    assert r1.status_code == 200, r1.text
    r2 = client.post(f"/api/media/upload-sessions/{sid}/complete", json={})
    assert r2.status_code == 409, r2.text


# --------------------------------------------------------------------------- #
# 7. size mismatch on complete -> session failed, object deleted, 413
# --------------------------------------------------------------------------- #
def test_size_mismatch_on_complete_413():
    db = FakeDB()
    aws = _install_fake_aws()
    client = _make_app(db, "ph_7")
    r = client.post("/api/media/upload-sessions", json={
        "category": "portfolio", "kind": "image", "mime": "image/jpeg",
        "size_bytes": 1000})
    sid, key = r.json()["session_id"], r.json()["key"]
    aws.objects[key] = {"size": 50 * 1024 * 1024, "etag": "e1", "content_type": "image/jpeg"}

    r2 = client.post(f"/api/media/upload-sessions/{sid}/complete", json={})
    assert r2.status_code == 413, r2.text
    sess = asyncio.run(db.media_upload_sessions.find_one({"id": sid}))
    assert sess["status"] == "failed"
    assert key in aws.deleted


# --------------------------------------------------------------------------- #
# 8. abort is idempotent
# --------------------------------------------------------------------------- #
def test_abort_idempotent():
    db = FakeDB()
    _install_fake_aws()
    client = _make_app(db, "ph_8")
    r = client.post("/api/media/upload-sessions", json={
        "category": "portfolio", "kind": "image", "mime": "image/jpeg",
        "size_bytes": 1000})
    sid = r.json()["session_id"]

    r1 = client.post(f"/api/media/upload-sessions/{sid}/abort")
    assert r1.status_code == 200 and r1.json()["status"] == "aborted", r1.text
    r2 = client.post(f"/api/media/upload-sessions/{sid}/abort")
    assert r2.status_code == 200 and r2.json()["status"] == "aborted", r2.text


# --------------------------------------------------------------------------- #
# 9. cleanup_expired_upload_sessions expires idle + absolute, aborts on S3
# --------------------------------------------------------------------------- #
def test_cleanup_expires_idle_and_absolute():
    db = FakeDB()
    aws = _install_fake_aws()
    now = svc._now()

    # absolute-expired multipart session
    asyncio.run(db.media_upload_sessions.insert_one({
        "id": "s_abs", "photographer_id": "ph_9", "status": "created",
        "mode": "multipart", "multipart_upload_id": "mpuX",
        "object_key": "k/abs", "bucket": "b",
        "last_activity_at": svc._iso(now - timedelta(hours=1)),
        "expires_at": svc._iso(now - timedelta(hours=1)),   # already past
    }))
    aws.multipart["mpuX"] = {"key": "k/abs", "aborted": False, "completed": False}

    # idle-expired single session (absolute expiry still far away)
    asyncio.run(db.media_upload_sessions.insert_one({
        "id": "s_idle", "photographer_id": "ph_9", "status": "uploading",
        "mode": "single", "multipart_upload_id": None,
        "object_key": "k/idle", "bucket": "b",
        "last_activity_at": svc._iso(now - timedelta(hours=media_storage.SESSION_IDLE_HOURS + 1)),
        "expires_at": svc._iso(now + timedelta(hours=40)),
    }))
    aws.objects["k/idle"] = {"size": 5, "etag": "e", "content_type": "image/jpeg"}

    # fresh session -> must be left alone
    asyncio.run(db.media_upload_sessions.insert_one({
        "id": "s_fresh", "photographer_id": "ph_9", "status": "created",
        "mode": "single", "multipart_upload_id": None,
        "object_key": "k/fresh", "bucket": "b",
        "last_activity_at": svc._iso(now), "expires_at": svc._iso(now + timedelta(hours=40)),
    }))

    count = asyncio.run(svc.cleanup_expired_upload_sessions(db))
    assert count == 2

    abs_sess = asyncio.run(db.media_upload_sessions.find_one({"id": "s_abs"}))
    idle_sess = asyncio.run(db.media_upload_sessions.find_one({"id": "s_idle"}))
    fresh_sess = asyncio.run(db.media_upload_sessions.find_one({"id": "s_fresh"}))
    assert abs_sess["status"] == "expired"
    assert idle_sess["status"] == "expired"
    assert fresh_sess["status"] == "created"
    assert aws.multipart["mpuX"]["aborted"] is True
    assert "k/idle" in aws.deleted


# --------------------------------------------------------------------------- #
# 10. parts on an expired session -> 410
# --------------------------------------------------------------------------- #
def test_parts_on_expired_session_410():
    db = FakeDB()
    _install_fake_aws()
    client = _make_app(db, "ph_10")
    big = media_storage.MULTIPART_THRESHOLD_BYTES + 1
    r = client.post("/api/media/upload-sessions", json={
        "category": "portfolio", "kind": "video", "mime": "video/mp4",
        "size_bytes": big})
    sid = r.json()["session_id"]

    asyncio.run(db.media_upload_sessions.update_one(
        {"id": sid}, {"$set": {"expires_at": svc._iso(svc._now() - timedelta(hours=1))}}))

    r2 = client.post(f"/api/media/upload-sessions/{sid}/parts", json={"part_numbers": [1, 2]})
    assert r2.status_code == 410, r2.text
