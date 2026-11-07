"""
camera_ftps_server.py — FTPES (FTP-over-TLS) front-end for cameras that speak
FTP/FTPES rather than SFTP. The Sony a7 IV is one of these: Sony's "Secure
Protocol" is FTPES, and the body has no SFTP. This gives the a7 IV a secure,
encrypted path into the exact same pipeline the SFTP server feeds.

Same everything-else as the SFTP lane:
  * AUTH: per-event username/password, verified by camera_transfer_service
    .authenticate() (bcrypt). The username binds SERVER-SIDE to one
    event+photographer; the camera cannot choose the event.
  * ISOLATION: on STOR, the received file is ingested for the bound profile
    only; the client path is never used as an event selector.
  * INGEST: camera_ingest.ingest_bytes() -> gallery_features._ingest_photo_bytes
    -> validate/dedup/S3/gallery_photos/FACE_INDEX. Temp file deleted after.

Security:
  * TLS required on BOTH the control and data channels (explicit FTPES). Plain
    unencrypted FTP is refused.
  * Write-only perms (store/mkdir/list/cd); no retrieve, delete, or rename.
  * Self-signed cert by default (the a7 IV lets you accept a cert warning — the
    channel is still encrypted); drop a real cert in via env to avoid the prompt.

Passive mode: FTPES data connections are passive, so a passive-port RANGE plus
the server's PUBLIC ip (masquerade) must be configured and firewalled. See
docs/CAMERA_SFTP.md.

Run standalone: python camera_ftps_server.py  (needs SUPABASE_DB_URL).
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import threading
import time
from typing import Optional

import posixpath
from pyftpdlib.authorizers import AuthenticationFailed
from pyftpdlib.filesystems import AbstractedFS
from pyftpdlib.handlers import TLS_FTPHandler, TLS_DTPHandler
from pyftpdlib.servers import FTPServer

import camera_ingest
import camera_transfer_service as cts

logger = logging.getLogger("camera_ftps")

BIND_HOST = os.environ.get("CAMERA_FTPS_BIND_HOST", "0.0.0.0")
BIND_PORT = int(os.environ.get("CAMERA_FTPS_BIND_PORT", "21"))
# The server's PUBLIC address, sent to the camera for passive data connections.
# MUST be the internet-facing IP (GCP external IP), not the VM's internal NIC.
MASQUERADE = os.environ.get("CAMERA_FTPS_MASQUERADE_ADDRESS", "").strip()

# Canonical passive-port range: 30000-30009 (10 concurrent transfers).
_pasv_ports = os.environ.get("CAMERA_FTPS_PASV_PORTS", "").strip()
if "-" in _pasv_ports:
    try:
        _p_min, _p_max = _pasv_ports.split("-", 1)
        PASV_MIN = int(_p_min.strip())
        PASV_MAX = int(_p_max.strip())
    except ValueError:
        PASV_MIN = int(os.environ.get("CAMERA_FTPS_PASV_MIN", "30000"))
        PASV_MAX = int(os.environ.get("CAMERA_FTPS_PASV_MAX", "30009"))
else:
    PASV_MIN = int(os.environ.get("CAMERA_FTPS_PASV_MIN", "30000"))
    PASV_MAX = int(os.environ.get("CAMERA_FTPS_PASV_MAX", "30009"))

CERT_FILE = (
    os.environ.get("CAMERA_FTPS_CERTFILE")
    or os.environ.get("CAMERA_FTPS_CERT")
    or os.path.join(os.path.dirname(__file__), ".camera_ftps_cert.pem")
)
KEY_FILE = (
    os.environ.get("CAMERA_FTPS_KEYFILE")
    or os.environ.get("CAMERA_FTPS_KEY")
    or os.path.join(os.path.dirname(__file__), ".camera_ftps_key.pem")
)
TMP_ROOT = os.environ.get("CAMERA_FTPS_TMP",
                          os.path.join(os.path.dirname(__file__), ".camera_ftps_tmp"))
INGEST_TIMEOUT = float(
    os.environ.get("CAMERA_FTPS_INGEST_TIMEOUT")
    or os.environ.get("CAMERA_SFTP_INGEST_TIMEOUT", "120")
)
# Write-only permission set: e=cd, l=list, m=mkdir, w=store, T=set-modtime.
# Deliberately NO r(retrieve), d(delete), f(rename).
PERMS = "elmwT"


def ensure_cert(cert_path: str = CERT_FILE, key_path: str = KEY_FILE) -> None:
    """Generate a self-signed cert+key if absent. FTPES still encrypts with a
    self-signed cert; the a7 IV accepts it via its root-certificate-error prompt."""
    if os.path.exists(cert_path) and os.path.exists(key_path):
        return
    from datetime import datetime, timedelta, timezone
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    cn = os.environ.get("CAMERA_FTPS_HOST") or cts.FTPS_HOST
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)])
    now = datetime.now(timezone.utc)
    cert = (x509.CertificateBuilder()
            .subject_name(name).issuer_name(name)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=1))
            .not_valid_after(now + timedelta(days=3650))
            .add_extension(x509.SubjectAlternativeName([x509.DNSName(cn)]), critical=False)
            .sign(key, hashes.SHA256()))
    with open(key_path, "wb") as f:
        f.write(key.private_bytes(serialization.Encoding.PEM,
                                  serialization.PrivateFormat.TraditionalOpenSSL,
                                  serialization.NoEncryption()))
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    try:
        os.chmod(key_path, 0o600)
    except Exception:
        pass


class _Ctx:
    def __init__(self, db, loop: asyncio.AbstractEventLoop):
        self.db = db
        self.loop = loop

    def call(self, coro, timeout: float = 30.0):
        return asyncio.run_coroutine_threadsafe(coro, self.loop).result(timeout=timeout)


class _Authorizer:
    """Dynamic per-event auth against the MAJA credential store (no static
    user table). validate_authentication stashes the resolved binding on the
    connection handler for on_file_received to use."""
    def __init__(self, ctx: _Ctx):
        self.ctx = ctx
        os.makedirs(TMP_ROOT, exist_ok=True)

    def validate_authentication(self, username, password, handler):
        try:
            binding = self.ctx.call(cts.authenticate(self.ctx.db, username, password))
        except Exception:
            logger.exception("ftps auth error")
            binding = None
        if not binding:
            raise AuthenticationFailed("Authentication failed.")
        handler.maja_binding = binding

    def get_home_dir(self, username):
        d = os.path.join(TMP_ROOT, re.sub(r"[^A-Za-z0-9_-]", "_", username or "anon"))
        os.makedirs(d, exist_ok=True)
        return d

    def has_user(self, username):
        return True

    def has_perm(self, username, perm, path=None):
        return perm in PERMS

    def get_perms(self, username):
        return PERMS

    def get_msg_login(self, username):
        return "MAJA Invites camera transfer (FTPES)."

    def get_msg_quit(self, username):
        return "Goodbye."

    def impersonate_user(self, username, password):
        pass

    def terminate_impersonation(self, username):
        pass


class _CameraFS(AbstractedFS):
    """Virtual filesystem that normalizes RFC-959 paths across platforms.
    AbstractedFS.ftpnorm in pyftpdlib checks os.path.isabs on virtual paths,
    which falsely evaluates to False on Windows for leading-slash paths ('/foo.jpg'),
    causing pyftpdlib to collapse uploads onto '/' (the directory) and fail with
    550 Permission denied. _CameraFS normalizes virtual paths using POSIX semantics
    while guaranteeing that mapped filesystem paths remain safely chrooted inside
    the user's home directory.
    """

    def ftpnorm(self, ftppath: str) -> str:
        clean = ftppath.replace("\\", "/")
        if len(clean) >= 2 and clean[1] == ":":
            clean = clean[2:]
        if clean.startswith("/"):
            p = posixpath.normpath(clean)
        else:
            p = posixpath.normpath(posixpath.join(self.cwd, clean))
        while p.startswith("//"):
            p = p[1:]
        if not p.startswith("/"):
            p = "/" + p
        return p


class _BoundedDTPHandler(TLS_DTPHandler):
    """Streaming DTP handler that enforces camera_ingest.MAX_BYTES in real-time,
    and performs synchronous durable ingest before allowing the 226 success response
    to be returned to the camera."""
    def handle_read(self):
        super().handle_read()
        if self.tot_bytes_received > camera_ingest.MAX_BYTES:
            logger.warning("ftps: upload exceeded size limit (%s bytes), aborting connection", self.tot_bytes_received)
            self._resp = ("552 Exceeded maximum file size.", logger.warning)
            self.transfer_finished = False
            self.close()

    def close(self):
        # Intercept before responding with 226 Transfer complete
        if not self._closed and self.transfer_finished and self.receive and self.file_obj is not None:
            filename = self.file_obj.name
            binding = getattr(self.cmd_channel, "maja_binding", None)
            ctx = getattr(self.cmd_channel, "maja_ctx", None)
            ingest_ok = False
            if binding and ctx:
                try:
                    if not self.file_obj.closed:
                        self.file_obj.close()
                    with open(filename, "rb") as f:
                        data = f.read()
                    fname = os.path.basename(filename)
                    res = ctx.call(
                        camera_ingest.ingest_bytes(ctx.db, binding, data, fname,
                                                   client_ip=getattr(self.cmd_channel, "remote_ip", "")),
                        timeout=INGEST_TIMEOUT)
                    ingest_ok = bool(res and res.get("ok"))
                except Exception:
                    logger.exception("ftps: durable ingest failed for %s", filename)
                    ingest_ok = False
            if not ingest_ok:
                self._resp = ("451 Ingestion and durable storage failed.", logger.error)
                self.transfer_finished = False
        super().close()


class _Handler(TLS_FTPHandler):
    abstracted_fs = _CameraFS
    dtp_handler = _BoundedDTPHandler
    maja_ctx: Optional[_Ctx] = None

    def on_file_received(self, file):
        # File has already been durably ingested in DTPHandler before 226 was acknowledged
        try:
            if os.path.exists(file):
                os.remove(file)
        except Exception:
            pass

    def on_incomplete_file_received(self, file):
        try:
            if os.path.exists(file):
                os.remove(file)
        except Exception:
            pass


def build_server(db, loop: asyncio.AbstractEventLoop,
                 host: str = BIND_HOST, port: int = BIND_PORT) -> FTPServer:
    ensure_cert()
    ctx = _Ctx(db, loop)
    handler = _Handler
    handler.maja_ctx = ctx
    handler.authorizer = _Authorizer(ctx)
    handler.certfile = CERT_FILE
    handler.keyfile = KEY_FILE
    handler.tls_control_required = True     # refuse plaintext control channel
    handler.tls_data_required = True        # refuse plaintext data channel
    handler.passive_ports = list(range(PASV_MIN, PASV_MAX + 1))
    handler.banner = "MAJA Invites camera transfer (FTPES)."
    if MASQUERADE:
        handler.masquerade_address = MASQUERADE
    else:
        logger.warning("CAMERA_FTPS_MASQUERADE_ADDRESS unset — passive transfers "
                       "will fail behind NAT/GCP. Set it to the VM's public IP.")
    return FTPServer((host, port), handler)


def serve_forever(db, loop: asyncio.AbstractEventLoop,
                  host: str = BIND_HOST, port: int = BIND_PORT,
                  ready: Optional[threading.Event] = None) -> FTPServer:
    server = build_server(db, loop, host, port)
    logger.info("camera FTPES server listening on %s:%s passive=%s-%s masquerade=%s",
                host, port, PASV_MIN, PASV_MAX, MASQUERADE or "(unset)")
    if ready:
        ready.set()
    server.serve_forever()
    return server


def _main():
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    dsn = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("SUPABASE_DB_URL / DATABASE_URL not set")
    import pg_adapter
    db = pg_adapter.Database.lazy(dsn, min_size=1, max_size=4)
    loop = asyncio.new_event_loop()

    def _run_loop():
        asyncio.set_event_loop(loop)
        loop.run_until_complete(db.ensure_connected())
        loop.run_forever()

    threading.Thread(target=_run_loop, daemon=True).start()
    time.sleep(1.0)
    serve_forever(db, loop)


if __name__ == "__main__":
    _main()
