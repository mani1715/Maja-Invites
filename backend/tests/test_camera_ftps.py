"""
Camera FTPES (FTP-over-TLS) transport — the protocol the Sony a7 IV actually
speaks. Proves: TLS auth, per-event binding, event isolation, and that a STOR
lands in the bound event's ingest. In-process pyftpdlib server + ftplib.FTP_TLS
client; ingest is mocked (no AWS). Shares the credential logic with the SFTP
lane (camera_transfer_service), so this focuses on the FTPES glue.

    PYTHONIOENCODING=utf-8 python -m pytest backend/tests/test_camera_ftps.py -q
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")
os.environ.setdefault("STORAGE_CRED_KEY", "")
os.environ.setdefault("CAMERA_FTPS_PASV_MIN", "31000")
os.environ.setdefault("CAMERA_FTPS_PASV_MAX", "31009")

import asyncio
import ftplib
import io
import socket
import ssl
import threading
import time

import pytest

import camera_transfer_service as cts
import camera_ingest
import camera_ftps_server as cfs


# --- tiny in-memory DB (same shape the service uses) -----------------------
def _match(doc, q):
    for k, v in q.items():
        dv = doc.get(k)
        if isinstance(v, dict):
            if "$exists" in v and (k in doc) != v["$exists"]:
                return False
            if "$ne" in v and dv == v["$ne"]:
                return False
            if "$gt" in v and not (dv is not None and dv > v["$gt"]):
                return False
        elif dv != v:
            return False
    return True


class _Cur:
    def __init__(self, rows): self.rows = rows
    def sort(self, f, d=1): self.rows.sort(key=lambda r: r.get(f) or "", reverse=d < 0); return self
    def limit(self, n): self.rows = self.rows[:n]; return self
    async def to_list(self, n=None): return list(self.rows[: n or len(self.rows)])


class _Coll:
    def __init__(self): self.docs = []
    async def find_one(self, q, proj=None):
        return next((dict(d) for d in self.docs if _match(d, q)), None)
    def find(self, q, proj=None): return _Cur([dict(d) for d in self.docs if _match(d, q)])
    async def insert_one(self, d): self.docs.append(dict(d)); return d
    async def update_one(self, q, u):
        for d in self.docs:
            if _match(d, q): d.update(u.get("$set", {})); return
    async def count_documents(self, q): return sum(1 for d in self.docs if _match(d, q))


class FakeDB:
    def __init__(self): self._c = {}
    def __getattr__(self, n): return self._c.setdefault(n, _Coll())


def run(coro): return asyncio.run(coro)


async def _seed(db, pid, admin):
    await db.profiles.insert_one({"id": pid, "admin_id": admin,
                                  "gallery_config": {"enabled": True,
                                                     "aws_collection_id": f"maja_wedding_{pid}"}})
    return await db.profiles.find_one({"id": pid})


def _free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


class Harness:
    def __init__(self, db):
        self.db = db
        self.calls = []
        self.loop = asyncio.new_event_loop()
        threading.Thread(target=self._loop, daemon=True).start()
        self.port = _free_port()
        self.server = cfs.build_server(db, self.loop, "127.0.0.1", self.port)
        threading.Thread(target=self.server.serve_forever, kwargs={"timeout": 0.2},
                         daemon=True).start()
        time.sleep(0.4)

    def _loop(self):
        asyncio.set_event_loop(self.loop); self.loop.run_forever()

    async def _fake_ingest(self, db, binding, data, filename, client_ip=""):
        self.calls.append((binding["profile_id"], filename, bytes(data)))
        return {"ok": True, "result": "stored", "photo_id": "fake"}

    def client(self, user, pw):
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ftp = ftplib.FTP_TLS(context=ctx)
        ftp.connect("127.0.0.1", self.port, timeout=10)
        ftp.auth()
        ftp.login(user, pw)
        ftp.prot_p()
        return ftp

    def close(self):
        try:
            self.server.close_all()
        except Exception:
            pass
        self.loop.call_soon_threadsafe(self.loop.stop)


@pytest.fixture
def harness(monkeypatch):
    db = FakeDB()
    h = Harness(db)
    monkeypatch.setattr(camera_ingest, "ingest_bytes", h._fake_ingest)
    yield h
    h.close()


def test_ftps_upload_lands_in_bound_event(harness):
    db = harness.db
    prof = run(_seed(db, "PROF_A", "ADMIN_1"))
    view = run(cts.enable_transfer(db, prof, "ADMIN_1", "sony_a7m4"))
    ftp = harness.client(view["username"], view["password"])
    try:
        ftp.storbinary("STOR photo1.jpg", io.BytesIO(b"JPEGDATA1"))
        ftp.storbinary("STOR photo2.jpg", io.BytesIO(b"JPEGDATA2"))
    finally:
        try: ftp.quit()
        except Exception: pass
    time.sleep(0.4)
    assert len(harness.calls) == 2
    assert all(pid == "PROF_A" for pid, _, _ in harness.calls)
    assert {fn for _, fn, _ in harness.calls} == {"photo1.jpg", "photo2.jpg"}


def test_ftps_bad_password_denied(harness):
    db = harness.db
    prof = run(_seed(db, "PROF_A", "ADMIN_1"))
    view = run(cts.enable_transfer(db, prof, "ADMIN_1", "sony_a7m4"))
    with pytest.raises(ftplib.error_perm):
        harness.client(view["username"], "wrong-password")


def test_ftps_event_isolation(harness):
    db = harness.db
    pa = run(_seed(db, "PROF_A", "ADMIN_1"))
    run(_seed(db, "PROF_B", "ADMIN_2"))
    va = run(cts.enable_transfer(db, pa, "ADMIN_1", "sony_a7m4"))
    ftp = harness.client(va["username"], va["password"])
    try:
        # A filename that references event B does NOT redirect the event — the
        # event comes from the authenticated identity (PROF_A), never the name.
        ftp.storbinary("STOR PROF_B_sneaky.jpg", io.BytesIO(b"X"))
    finally:
        try: ftp.quit()
        except Exception: pass
    time.sleep(0.4)
    assert harness.calls and all(pid == "PROF_A" for pid, _, _ in harness.calls)


def test_ftps_revoked_denied(harness):
    db = harness.db
    prof = run(_seed(db, "PROF_A", "ADMIN_1"))
    view = run(cts.enable_transfer(db, prof, "ADMIN_1", "sony_a7m4"))
    run(cts.set_status(db, "PROF_A", cts.STATUS_REVOKED))
    with pytest.raises(ftplib.error_perm):
        harness.client(view["username"], view["password"])


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-q"]))
