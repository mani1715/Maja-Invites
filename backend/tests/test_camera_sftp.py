"""
Camera SFTP ingestion — auth, credential lifecycle, event/photographer isolation,
path-traversal immunity, and reject paths. Pure/self-contained: no live server,
no AWS, no real camera. Uses an in-memory FakeDB and monkeypatches the ingest
sink so the transport + isolation are exercised without the S3/gallery pipeline.

    PYTHONIOENCODING=utf-8 python -m pytest backend/tests/test_camera_sftp.py -q
"""
import os
import sys
# Make backend/ importable regardless of the pytest working directory, so this
# file never breaks full-suite collection from the repo root.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")
os.environ.setdefault("STORAGE_CRED_KEY", "")   # camera creds use bcrypt, not Fernet

import asyncio
import socket
import threading
import time

import paramiko
import pytest

import camera_profiles
import camera_transfer_service as cts
import camera_ingest
import camera_sftp_server as css


# --------------------------------------------------------------------------
# Minimal in-memory async DB shaped like the pg_adapter surface these modules use.
# --------------------------------------------------------------------------
def _match(doc, query):
    for k, v in query.items():
        dv = doc.get(k)
        if isinstance(v, dict):
            if "$exists" in v:
                if (k in doc) != v["$exists"]:
                    return False
            if "$ne" in v and dv == v["$ne"]:
                return False
            if "$gt" in v and not (dv is not None and dv > v["$gt"]):
                return False
        elif dv != v:
            return False
    return True


class _Cursor:
    def __init__(self, rows):
        self._rows = rows
    def sort(self, field, direction=1):
        self._rows.sort(key=lambda r: r.get(field) or "", reverse=direction < 0)
        return self
    def limit(self, n):
        self._rows = self._rows[:n]
        return self
    async def to_list(self, n=None):
        return list(self._rows[: n if n else len(self._rows)])


class _Coll:
    def __init__(self):
        self.docs = []
    async def find_one(self, query, proj=None):
        for d in self.docs:
            if _match(d, query):
                return dict(d)
        return None
    def find(self, query, proj=None):
        return _Cursor([dict(d) for d in self.docs if _match(d, query)])
    async def insert_one(self, doc):
        self.docs.append(dict(doc))
        return doc
    async def update_one(self, query, update):
        for d in self.docs:
            if _match(d, query):
                d.update(update.get("$set", {}))
                return
    async def count_documents(self, query):
        return sum(1 for d in self.docs if _match(d, query))


class FakeDB:
    def __init__(self):
        self._c = {}
    def __getattr__(self, name):
        return self._c.setdefault(name, _Coll())


def run(coro):
    # Main-thread helper for the async service fns (FakeDB is not loop-bound).
    # asyncio.run is safe here — the harness runs its own loop in another thread.
    return asyncio.run(coro)


async def _seed_event(db, profile_id, admin_id, enabled=True):
    await db.profiles.insert_one({
        "id": profile_id, "admin_id": admin_id,
        "gallery_config": {"enabled": enabled, "aws_collection_id": f"maja_wedding_{profile_id}"},
    })
    return await db.profiles.find_one({"id": profile_id})


# ============================ credential lifecycle ============================
def test_enable_binds_owner_and_returns_one_time_password():
    db = FakeDB()
    prof = run(_seed_event(db, "PROF_A", "ADMIN_1"))
    view = run(cts.enable_transfer(db, prof, "ADMIN_1", "sony_a7m4"))
    assert view["password"] and len(view["password"]) >= 16
    assert view["admin_id"] == "ADMIN_1"          # bound to OWNER
    assert view["camera_key"] == "sony_a7m4"
    row = run(cts.get_transfer(db, "PROF_A"))
    assert row["password_hash"] and row["password_hash"] != view["password"]  # hashed, not plaintext


def test_authenticate_success_and_wrong_password():
    db = FakeDB()
    prof = run(_seed_event(db, "PROF_A", "ADMIN_1"))
    view = run(cts.enable_transfer(db, prof, "ADMIN_1", "sony_a7m4"))
    binding = run(cts.authenticate(db, view["username"], view["password"]))
    assert binding and binding["profile_id"] == "PROF_A" and binding["admin_id"] == "ADMIN_1"
    assert run(cts.authenticate(db, view["username"], "wrong")) is None
    assert run(cts.authenticate(db, "no-such-user", view["password"])) is None


def test_revoked_and_disabled_and_expired_all_deny():
    db = FakeDB()
    prof = run(_seed_event(db, "PROF_A", "ADMIN_1"))
    view = run(cts.enable_transfer(db, prof, "ADMIN_1", "sony_a7m4"))
    u, p = view["username"], view["password"]

    run(cts.set_status(db, "PROF_A", cts.STATUS_REVOKED))
    assert run(cts.authenticate(db, u, p)) is None
    run(cts.set_status(db, "PROF_A", cts.STATUS_DISABLED))
    assert run(cts.authenticate(db, u, p)) is None
    # reactivate, then force-expire
    run(cts.set_status(db, "PROF_A", cts.STATUS_ACTIVE))
    assert run(cts.authenticate(db, u, p))
    run(db.camera_transfers.update_one({"profile_id": "PROF_A"},
                                       {"$set": {"expires_at": "2000-01-01T00:00:00+00:00"}}))
    assert run(cts.authenticate(db, u, p)) is None


def test_enable_with_custom_credentials():
    db = FakeDB()
    prof = run(_seed_event(db, "PROF_A", "ADMIN_1"))
    view = run(cts.enable_transfer(db, prof, "ADMIN_1", "sony_a7m4",
                                   username="majainvites", password="Maja123"))
    assert view["username"] == "majainvites"
    assert run(cts.authenticate(db, "majainvites", "Maja123"))
    # weak password / bad username rejected
    with pytest.raises(cts.CredentialError):
        run(cts.enable_transfer(db, prof, "ADMIN_1", "sony_a7m4", password="123"))
    with pytest.raises(cts.CredentialError):
        run(cts.enable_transfer(db, prof, "ADMIN_1", "sony_a7m4", username="ab"))


def test_custom_username_must_be_unique_across_events():
    db = FakeDB()
    pa = run(_seed_event(db, "PROF_A", "ADMIN_1"))
    pb = run(_seed_event(db, "PROF_B", "ADMIN_2"))
    run(cts.enable_transfer(db, pa, "ADMIN_1", "sony_a7m4", username="studiocam", password="secret1"))
    with pytest.raises(cts.CredentialError) as ei:
        run(cts.enable_transfer(db, pb, "ADMIN_2", "sony_a7m4", username="studiocam", password="secret2"))
    assert ei.value.taken
    # the SAME event may re-set its own username
    v = run(cts.enable_transfer(db, pa, "ADMIN_1", "sony_a7m4", username="studiocam", password="secret3"))
    assert v["username"] == "studiocam"
    assert run(cts.authenticate(db, "studiocam", "secret3"))


def test_rotate_invalidates_old_password():
    db = FakeDB()
    prof = run(_seed_event(db, "PROF_A", "ADMIN_1"))
    v1 = run(cts.enable_transfer(db, prof, "ADMIN_1", "sony_a7m4"))
    v2 = run(cts.rotate_password(db, "PROF_A"))
    assert v2["password"] != v1["password"]
    assert run(cts.authenticate(db, v1["username"], v1["password"])) is None   # old dead
    assert run(cts.authenticate(db, v2["username"], v2["password"]))           # new works


# ============================ ingest reject paths ============================
def test_ingest_rejects_before_touching_gallery():
    db = FakeDB()
    run(_seed_event(db, "PROF_A", "ADMIN_1", enabled=False))
    binding = {"transfer_id": "T1", "profile_id": "PROF_A", "admin_id": "ADMIN_1"}

    assert run(camera_ingest.ingest_bytes(db, binding, b"", "x.jpg"))["reason"] == "empty_file"
    r = run(camera_ingest.ingest_bytes(db, binding, b"data", "x.jpg"))
    assert r["result"] == "rejected" and r["reason"] == "gallery_not_enabled"

    binding_missing = {"transfer_id": "T1", "profile_id": "NOPE", "admin_id": "ADMIN_1"}
    assert run(camera_ingest.ingest_bytes(db, binding_missing, b"data", "x.jpg"))["reason"] == "event_not_found"


def test_ingest_too_large(monkeypatch):
    db = FakeDB()
    run(_seed_event(db, "PROF_A", "ADMIN_1"))
    binding = {"transfer_id": "T1", "profile_id": "PROF_A", "admin_id": "ADMIN_1"}
    monkeypatch.setattr(camera_ingest, "MAX_BYTES", 4)
    r = run(camera_ingest.ingest_bytes(db, binding, b"aaaaaaaa", "x.jpg"))
    assert r["result"] == "rejected" and r["reason"].startswith("too_large")


def test_sanitize_filename_strips_paths():
    assert camera_ingest.sanitize_filename("../../etc/passwd") == "etc_passwd" or \
           camera_ingest.sanitize_filename("../../etc/passwd") == "passwd"
    assert "/" not in camera_ingest.sanitize_filename("a/b/c.jpg")
    assert "\\" not in camera_ingest.sanitize_filename("a\\b\\c.jpg")
    assert camera_ingest.sanitize_filename("") == "photo.jpg"


# ============================ live SFTP transport ============================
class _Harness:
    """A running SFTP server on a free port, with an async loop thread and a
    recording ingest sink."""
    def __init__(self, db):
        self.db = db
        self.calls = []          # (profile_id, filename, bytes)
        self.loop = asyncio.new_event_loop()
        self._loop_thread = threading.Thread(target=self._run_loop, daemon=True)
        self._loop_thread.start()
        self.port = self._free_port()
        self.host_key = paramiko.RSAKey.generate(2048)
        self.ready = threading.Event()
        self.stop = threading.Event()
        self._srv_thread = threading.Thread(
            target=css.serve_forever,
            args=(db, self.loop, "127.0.0.1", self.port, self.host_key, self.ready, self.stop),
            daemon=True)
        self._srv_thread.start()
        self.ready.wait(timeout=5)

    def _run_loop(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    @staticmethod
    def _free_port():
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        p = s.getsockname()[1]
        s.close()
        return p

    async def _fake_ingest(self, db, binding, data, filename, client_ip=""):
        self.calls.append((binding["profile_id"], filename, bytes(data)))
        return {"ok": True, "result": "stored", "photo_id": "fake"}

    def connect(self, username, password):
        t = paramiko.Transport(("127.0.0.1", self.port))
        t.connect(username=username, password=password)
        return t

    def close(self):
        self.stop.set()
        self.loop.call_soon_threadsafe(self.loop.stop)


@pytest.fixture
def harness(monkeypatch):
    db = FakeDB()
    h = _Harness(db)
    # Record ingests instead of hitting S3/gallery. The server calls the module
    # attribute at runtime, so patching it here is picked up.
    monkeypatch.setattr(camera_ingest, "ingest_bytes", h._fake_ingest)
    yield h
    h.close()


def _upload(transport, remote_path, data):
    sftp = paramiko.SFTPClient.from_transport(transport)
    with sftp.open(remote_path, "wb") as f:
        f.write(data)
    sftp.close()


def test_sftp_upload_lands_in_bound_event(harness):
    db = harness.db
    prof = run(_seed_event(db, "PROF_A", "ADMIN_1"))
    view = run(cts.enable_transfer(db, prof, "ADMIN_1", "sony_a7m4"))
    t = harness.connect(view["username"], view["password"])
    try:
        _upload(t, "photo1.jpg", b"JPEGDATA1")
        _upload(t, "photo2.jpg", b"JPEGDATA2")
    finally:
        t.close()
    time.sleep(0.3)
    assert len(harness.calls) == 2
    assert all(pid == "PROF_A" for pid, _, _ in harness.calls)
    assert {fn for _, fn, _ in harness.calls} == {"photo1.jpg", "photo2.jpg"}


def test_sftp_bad_password_denied(harness):
    db = harness.db
    prof = run(_seed_event(db, "PROF_A", "ADMIN_1"))
    view = run(cts.enable_transfer(db, prof, "ADMIN_1", "sony_a7m4"))
    with pytest.raises(paramiko.AuthenticationException):
        harness.connect(view["username"], "wrong-password")


def test_sftp_event_isolation_credentials_cannot_cross(harness):
    db = harness.db
    pa = run(_seed_event(db, "PROF_A", "ADMIN_1"))
    pb = run(_seed_event(db, "PROF_B", "ADMIN_2"))
    va = run(cts.enable_transfer(db, pa, "ADMIN_1", "sony_a7m4"))
    run(cts.enable_transfer(db, pb, "ADMIN_2", "sony_a7m4"))

    # Connect as A and deliberately try to write "into event B" by path.
    t = harness.connect(va["username"], va["password"])
    try:
        _upload(t, "/event/PROF_B/photos/sneaky.jpg", b"X")
        _upload(t, "../../PROF_B/evil.jpg", b"Y")
    finally:
        t.close()
    time.sleep(0.3)
    # Every upload from A's credential is bound to PROF_A, regardless of path,
    # and the traversal is stripped to a bare filename.
    assert harness.calls, "expected uploads to be ingested"
    assert all(pid == "PROF_A" for pid, _, _ in harness.calls)
    for _, fn, _ in harness.calls:
        assert "/" not in fn and "\\" not in fn and ".." not in fn


def test_sftp_revoked_credential_denied(harness):
    db = harness.db
    prof = run(_seed_event(db, "PROF_A", "ADMIN_1"))
    view = run(cts.enable_transfer(db, prof, "ADMIN_1", "sony_a7m4"))
    run(cts.set_status(db, "PROF_A", cts.STATUS_REVOKED))
    with pytest.raises(paramiko.AuthenticationException):
        harness.connect(view["username"], view["password"])


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-q"]))
