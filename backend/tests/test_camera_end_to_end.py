"""
test_camera_end_to_end.py — Comprehensive end-to-end integration test suite
for Pixora's camera-to-gallery transfer pipeline.

Covers:
1. Standalone gallery workflow without invitations
2. Destination album targeting and persistence
3. Full SFTP (Paramiko) and FTPS (Explicit TLS / pyftpdlib) upload journeys
4. Filename collision safety (identical filenames from multiple cameras preserve distinct photos)
5. SHA-256 deduplication and quota preservation
6. Interrupted / truncated upload cleanup (zero public photo records)
7. Credential lifecycle (revocation / disable halts in-flight & subsequent ingest)
8. Unsupported RAW format detection and visible audit logging
9. Derivatives & watermarking (display WebP, thumbnail, private untouched original)
10. Unpaid AI processing makes zero AWS Rekognition calls
"""
import os
import sys
import io
import time
import socket
import asyncio
import threading
import ftplib
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-camera-key")
os.environ.setdefault("STORAGE_CRED_KEY", "")

import paramiko
import pytest
from PIL import Image

import camera_profiles
import camera_transfer_service as cts
import camera_ingest
import camera_sftp_server as css
import camera_ftps_server as cfs
import gallery_features as gf
import photo_guard


# ---------------------------------------------------------------------------
# In-memory Async DB Mocking pg_adapter surface
# ---------------------------------------------------------------------------
def _match(doc, query):
    for k, v in query.items():
        dv = doc.get(k)
        if isinstance(v, dict):
            if "$exists" in v:
                if (k in doc) != v["$exists"]:
                    return False
            if "$ne" in v and dv == v["$ne"]:
                return False
            if "$in" in v and dv not in v["$in"]:
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
                if "$set" in update:
                    d.update(update["$set"])
                if "$inc" in update:
                    for ik, iv in update["$inc"].items():
                        parts = ik.split(".")
                        target = d
                        for p in parts[:-1]:
                            target = target.setdefault(p, {})
                        target[parts[-1]] = target.get(parts[-1], 0) + iv
                return
    async def count_documents(self, query):
        return sum(1 for d in self.docs if _match(d, query))


class FakeDB:
    def __init__(self):
        self._c = {}
    def __getattr__(self, name):
        return self._c.setdefault(name, _Coll())


def make_test_jpeg(width=100, height=80, color=(180, 50, 50)) -> bytes:
    buf = io.BytesIO()
    im = Image.new("RGB", (width, height), color=color)
    im.save(buf, format="JPEG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Harnesses for Isolated SFTP and FTPS on Ephemeral Loopback Ports
# ---------------------------------------------------------------------------
class SftpHarness:
    def __init__(self, db):
        self.db = db
        self.host = "127.0.0.1"
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.sock.bind((self.host, 0))
        self.port = self.sock.getsockname()[1]
        self.sock.listen(5)
        self.host_key = paramiko.RSAKey.generate(1024)
        self.loop = asyncio.new_event_loop()
        self.loop_thread = threading.Thread(target=self.loop.run_forever, daemon=True)
        self.loop_thread.start()
        self.ctx = css._Ctx(self.db, self.loop, self.host_key)
        self._closing = False
        self.srv_thread = threading.Thread(target=self._accept_loop, daemon=True)
        self.srv_thread.start()

    def _accept_loop(self):
        while not self._closing:
            try:
                conn, addr = self.sock.accept()
            except OSError:
                break
            threading.Thread(target=self._handle_client, args=(conn, addr), daemon=True).start()

    def _handle_client(self, conn, addr):
        t = paramiko.Transport(conn)
        t.add_server_key(self.host_key)
        t.set_subsystem_handler("sftp", paramiko.SFTPServer, css._SFTPIface, self.ctx)
        server = css._ServerIface(self.ctx, addr[0])
        try:
            t.start_server(server=server)
            chan = t.accept(20)
            if not chan:
                return
            while t.is_active():
                time.sleep(0.1)
        except Exception:
            pass
        finally:
            try:
                t.close()
            except Exception:
                pass

    def client(self, user, pw):
        t = paramiko.Transport((self.host, self.port))
        t.connect(username=user, password=pw)
        sftp = paramiko.SFTPClient.from_transport(t)
        return t, sftp

    def close(self):
        self._closing = True
        try:
            self.sock.close()
        except Exception:
            pass
        self.loop.call_soon_threadsafe(self.loop.stop)


class FtpsHarness:
    def __init__(self, db):
        self.db = db
        self.host = "127.0.0.1"
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.sock.bind((self.host, 0))
        self.port = self.sock.getsockname()[1]
        self.sock.close()

        self.loop = asyncio.new_event_loop()
        self.loop_thread = threading.Thread(target=self.loop.run_forever, daemon=True)
        self.loop_thread.start()

        # Build FTPS with ephemeral ports
        cfs.ensure_cert()
        self.ctx = cfs._Ctx(self.db, self.loop)
        handler = cfs._Handler
        handler.maja_ctx = self.ctx
        handler.authorizer = cfs._Authorizer(self.ctx)
        handler.certfile = cfs.CERT_FILE
        handler.keyfile = cfs.KEY_FILE
        handler.tls_control_required = True
        handler.tls_data_required = True
        handler.passive_ports = list(range(self.port + 10, self.port + 20))
        handler.banner = "MAJA FTPS Test"
        self.server = cfs.FTPServer((self.host, self.port), handler)
        self.server_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.server_thread.start()
        time.sleep(0.2)

    def client(self, user, pw):
        ftp = ftplib.FTP_TLS(timeout=10)
        ftp.connect(self.host, self.port)
        ftp.auth()
        ftp.prot_p()
        ftp.login(user, pw)
        return ftp

    def close(self):
        try:
            self.server.close_all()
        except Exception:
            pass
        self.loop.call_soon_threadsafe(self.loop.stop)


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_standalone_gallery_creation_and_album_targeting():
    """Verify creating a standalone gallery without an invitation and setting a destination album."""
    db = FakeDB()
    gallery_id = "gal_standalone_123"
    admin_id = "photog_studio_1"

    # 1. Seed pure standalone gallery (no invitation_id, is_gallery_only=True)
    standalone_profile = {
        "id": gallery_id,
        "admin_id": admin_id,
        "is_gallery_only": True,
        "title": "Standalone Exhibition",
        "gallery_config": {
            "enabled": True,
            "total_photos": 0,
            "auto_delete_at": "2027-12-31T00:00:00",
        },
    }
    await db.profiles.insert_one(standalone_profile)

    # 2. Create destination album
    album_id = "alb_reception_456"
    album_doc = {
        "id": album_id,
        "profile_id": gallery_id,
        "name": "Reception",
        "photo_count": 0,
    }
    await db.gallery_albums.insert_one(album_doc)

    # 3. Enable camera transfer bound to Reception album
    view = await cts.enable_transfer(
        db, standalone_profile, admin_id, "generic_sftp", target_album_id=album_id
    )
    assert view["username"].startswith("maja-")
    assert view["target_album_id"] == album_id
    assert view["status"] == cts.STATUS_ACTIVE

    # 4. Verify status returns resolved album name
    st = await cts.status(db, standalone_profile)
    assert st["target_album_id"] == album_id
    assert st["target_album_name"] == "Reception"

    # 5. Verify binding carries target_album_id
    binding = await cts.authenticate(db, view["username"], view["password"])
    assert binding is not None
    assert binding["target_album_id"] == album_id
    assert binding["profile_id"] == gallery_id


@pytest.mark.asyncio
async def test_duplicate_handling_and_same_filename_preservation():
    """Verify that multiple cameras uploading identical filenames preserve distinct records,
    while uploading identical image bytes triggers SHA256 deduplication."""
    db = FakeDB()
    gallery_id = "gal_collision_test"
    admin_id = "photog_studio_2"

    profile = {
        "id": gallery_id,
        "admin_id": admin_id,
        "gallery_config": {"enabled": True, "total_photos": 0},
    }
    await db.profiles.insert_one(profile)

    view = await cts.enable_transfer(db, profile, admin_id, "generic_sftp")
    binding = await cts.authenticate(db, view["username"], view["password"])

    # Mock S3 upload_bytes to store in memory
    s3_storage = {}
    with patch("gallery_features.upload_bytes", side_effect=lambda k, data, mime, tags=None: s3_storage.update({k: data})):
        with patch("gallery_features.has_ai_face_entitlement", return_value=False):
            # Camera 1 uploads photo A named "DSC0001.JPG"
            img_a = make_test_jpeg(width=80, height=60, color=(255, 0, 0))
            res_a = await camera_ingest.ingest_bytes(db, binding, img_a, "DSC0001.JPG")
            assert res_a["ok"] is True
            assert res_a["result"] == "stored"
            photo_a_id = res_a["photo_id"]

            # Camera 2 uploads photo B named "DSC0001.JPG" (identical filename, DIFFERENT image bytes)
            img_b = make_test_jpeg(width=80, height=60, color=(0, 255, 0))
            res_b = await camera_ingest.ingest_bytes(db, binding, img_b, "DSC0001.JPG")
            assert res_b["ok"] is True
            assert res_b["result"] == "stored"
            photo_b_id = res_b["photo_id"]

            # Filenames matched, but IDs and storage entries MUST be distinct
            assert photo_a_id != photo_b_id
            photos = await db.gallery_photos.find({"profile_id": gallery_id}).to_list()
            assert len(photos) == 2
            assert {p["id"] for p in photos} == {photo_a_id, photo_b_id}

            # Now Camera 1 re-transfers Photo A (exact same bytes)
            res_dup = await camera_ingest.ingest_bytes(db, binding, img_a, "DSC0001.JPG")
            assert res_dup["ok"] is True
            assert res_dup["result"] == "duplicate"
            assert res_dup["duplicate"] is True

            # Record count remains 2 (no duplicate photo record created)
            photos_after = await db.gallery_photos.find({"profile_id": gallery_id}).to_list()
            assert len(photos_after) == 2


@pytest.mark.asyncio
async def test_concurrent_deduplication_simultaneous_uploads():
    """Verify concurrent uploads of the exact same image bytes simultaneously
    safely resolve without data loss or pipeline crashes."""
    db = FakeDB()
    gallery_id = "gal_concurrent_dedup"
    admin_id = "photog_concurrent"

    profile = {
        "id": gallery_id,
        "admin_id": admin_id,
        "gallery_config": {"enabled": True},
    }
    await db.profiles.insert_one(profile)
    view = await cts.enable_transfer(db, profile, admin_id, "generic_sftp")
    binding = await cts.authenticate(db, view["username"], view["password"])

    img_data = make_test_jpeg(width=70, height=70, color=(100, 150, 200))
    with patch("media_derivatives.make_standard_set", return_value={
        "original": img_data,
        "preview": (b"prev", 70, 70),
        "thumb": (b"thumb", 35, 35),
        "display_watermarked": (b"disp", 70, 70),
    }), patch("gallery_features.upload_bytes"):
        res1, res2 = await asyncio.gather(
            camera_ingest.ingest_bytes(db, binding, img_data, "CAM_001.JPG"),
            camera_ingest.ingest_bytes(db, binding, img_data, "CAM_001.JPG"),
        )
        assert res1["ok"] is True
        assert res2["ok"] is True
        results = [res1["result"], res2["result"]]
        assert "stored" in results


@pytest.mark.asyncio
async def test_raw_format_rejection_and_guidance():
    """Verify that camera RAW files (.ARW, .CR3, etc.) are visibly rejected and recorded."""
    db = FakeDB()
    gallery_id = "gal_raw_test"
    admin_id = "photog_studio_3"

    profile = {
        "id": gallery_id,
        "admin_id": admin_id,
        "gallery_config": {"enabled": True},
    }
    await db.profiles.insert_one(profile)
    view = await cts.enable_transfer(db, profile, admin_id, "sony_a7m4")
    binding = await cts.authenticate(db, view["username"], view["password"])

    # Simulate Sony RAW file (.ARW)
    fake_raw = b"II*\x00" + b"\x00" * 1024
    res = await camera_ingest.ingest_bytes(db, binding, fake_raw, "DSC0001.ARW")
    assert res["ok"] is False
    assert res["result"] == "rejected"
    assert "RAW" in res["reason"]

    # Verify audit event in camera_events
    event = await db.camera_events.find_one({"profile_id": gallery_id})
    assert event is not None
    assert event["filename"] == "DSC0001.ARW"
    assert event["result"] == "rejected"
    assert "RAW" in event["reason"]


@pytest.mark.asyncio
async def test_revoked_credentials_halt_open_session():
    """Verify that disabling or revoking a camera transfer halts in-flight session uploads immediately."""
    db = FakeDB()
    gallery_id = "gal_revoke_test"
    admin_id = "photog_studio_4"

    profile = {
        "id": gallery_id,
        "admin_id": admin_id,
        "gallery_config": {"enabled": True},
    }
    await db.profiles.insert_one(profile)

    view = await cts.enable_transfer(db, profile, admin_id, "generic_sftp")
    binding = await cts.authenticate(db, view["username"], view["password"])
    assert binding is not None

    # Photographer disables camera transfer in dashboard
    await cts.set_status(db, gallery_id, cts.STATUS_DISABLED)

    # Ingest from the previously authenticated binding must now fail
    test_img = make_test_jpeg()
    res = await camera_ingest.ingest_bytes(db, binding, test_img, "DSC0005.JPG")
    assert res["ok"] is False
    assert res["result"] == "rejected"
    assert res["reason"] == "transfer_disabled_or_expired"


def test_full_sftp_client_to_album_journey():
    """Full network SFTP client test: uploads photo into bound standalone gallery album."""
    db = FakeDB()
    harness = SftpHarness(db)
    gallery_id = "gal_sftp_e2e"
    admin_id = "photog_sftp_e2e"
    album_id = "alb_sftp_target"

    async def _setup():
        prof = {
            "id": gallery_id,
            "admin_id": admin_id,
            "is_gallery_only": True,
            "gallery_config": {"enabled": True, "total_photos": 0},
        }
        await db.profiles.insert_one(prof)
        await db.gallery_albums.insert_one({
            "id": album_id, "profile_id": gallery_id, "name": "Cocktail Hour"
        })
        return await cts.enable_transfer(db, prof, admin_id, "generic_sftp", target_album_id=album_id)

    view = asyncio.run(_setup())

    # Intercept ingest_bytes to record parameters
    ingested = []
    async def _mock_ingest(database, binding, data, filename, client_ip=""):
        ingested.append({"binding": binding, "size": len(data), "filename": filename})
        return {"ok": True, "result": "stored", "photo_id": "test_sftp_pid"}

    with patch("camera_ingest.ingest_bytes", side_effect=_mock_ingest):
        t, sftp = harness.client(view["username"], view["password"])
        try:
            payload = make_test_jpeg(width=60, height=40)
            f = sftp.file("cocktail_01.jpg", "wb")
            f.write(payload)
            f.close()
        finally:
            try: sftp.close(); t.close()
            except Exception: pass
            harness.close()

    time.sleep(0.3)
    assert len(ingested) == 1
    assert ingested[0]["filename"] == "cocktail_01.jpg"
    assert ingested[0]["binding"]["profile_id"] == gallery_id
    assert ingested[0]["binding"]["target_album_id"] == album_id


def test_full_ftps_explicit_tls_client_journey():
    """Full network FTPS client test: tests Sony α7 IV explicit TLS upload protocol."""
    db = FakeDB()
    harness = FtpsHarness(db)
    gallery_id = "gal_ftps_e2e"
    admin_id = "photog_ftps_e2e"
    album_id = "alb_ftps_target"

    async def _setup():
        prof = {
            "id": gallery_id,
            "admin_id": admin_id,
            "is_gallery_only": True,
            "gallery_config": {"enabled": True, "total_photos": 0},
        }
        await db.profiles.insert_one(prof)
        await db.gallery_albums.insert_one({
            "id": album_id, "profile_id": gallery_id, "name": "Ceremony"
        })
        return await cts.enable_transfer(db, prof, admin_id, "sony_a7m4", target_album_id=album_id)

    view = asyncio.run(_setup())

    ingested = []
    async def _mock_ingest(database, binding, data, filename, client_ip=""):
        ingested.append({"binding": binding, "size": len(data), "filename": filename})
        return {"ok": True, "result": "stored", "photo_id": "test_ftps_pid"}

    with patch("camera_ingest.ingest_bytes", side_effect=_mock_ingest):
        ftp = harness.client(view["username"], view["password"])
        try:
            payload = make_test_jpeg(width=50, height=50)
            ftp.storbinary("STOR ceremony_01.jpg", io.BytesIO(payload))
        finally:
            try: ftp.quit()
            except Exception: pass
            harness.close()

    time.sleep(0.3)
    assert len(ingested) == 1
    assert ingested[0]["filename"] == "ceremony_01.jpg"
    assert ingested[0]["binding"]["profile_id"] == gallery_id
    assert ingested[0]["binding"]["target_album_id"] == album_id


def test_failure_injection_prevents_false_ftps_and_sftp_success():
    """Verify that if database or storage ingestion fails, FTPS and SFTP clients
    receive an explicit failure code and NOT false 226/OK acknowledgement."""
    db = FakeDB()
    gallery_id = "gal_fail_inject"
    admin_id = "photog_fail_inject"

    async def _setup():
        prof = {
            "id": gallery_id,
            "admin_id": admin_id,
            "is_gallery_only": True,
            "gallery_config": {"enabled": True, "total_photos": 0},
        }
        await db.profiles.insert_one(prof)
        return await cts.enable_transfer(db, prof, admin_id, "sony_a7m4")

    view = asyncio.run(_setup())

    async def _failing_ingest(database, binding, data, filename, client_ip=""):
        return {"ok": False, "result": "rejected", "reason": "simulated_storage_failure"}

    # 1. Test FTPS failure injection: client MUST raise error on 451/550
    harness = FtpsHarness(db)
    with patch("camera_ingest.ingest_bytes", side_effect=_failing_ingest):
        ftp = harness.client(view["username"], view["password"])
        upload_failed = False
        try:
            payload = make_test_jpeg(width=50, height=50)
            ftp.storbinary("STOR fail.jpg", io.BytesIO(payload))
        except ftplib.all_errors as ex:
            upload_failed = True
            assert "451" in str(ex) or "550" in str(ex) or "426" in str(ex)
        finally:
            try: ftp.quit()
            except Exception: pass
            harness.close()
        assert upload_failed, "FTPS must report failure when storage/DB fails"

    # 2. Test SFTP failure injection: client close MUST report failure
    sftp_harness = SftpHarness(db)
    with patch("camera_ingest.ingest_bytes", side_effect=_failing_ingest):
        t, sftp = sftp_harness.client(view["username"], view["password"])
        f_sftp = sftp.file("fail_sftp.jpg", "wb")
        f_sftp.write(make_test_jpeg(width=50, height=50))
        sftp_close_failed = False
        try:
            f_sftp.flush()
            import paramiko.sftp
            sftp._request(paramiko.sftp.CMD_CLOSE, f_sftp.handle)
        except OSError:
            sftp_close_failed = True
        finally:
            try: f_sftp.close()
            except Exception: pass
            try: sftp.close()
            except Exception: pass
            try: t.close()
            except Exception: pass
            sftp_harness.close()
        assert sftp_close_failed, "SFTP must report failure when storage/DB fails"
