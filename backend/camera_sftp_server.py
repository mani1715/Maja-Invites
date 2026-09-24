"""
camera_sftp_server.py — a minimal, write-only SFTP front-end that lands camera
photos straight into the existing gallery pipeline. Self-hosted (runs on the VM),
so no AWS Transfer Family cost; bytes hit a temp file for a moment, get pushed to
S3 via the normal ingest, then the temp file is deleted — nothing accumulates.

Security model (matches the brief):
  * AUTH: password only, verified in camera_transfer_service.authenticate()
    (bcrypt). The username maps SERVER-SIDE to exactly one event+photographer;
    the camera can neither choose nor influence the event.
  * ISOLATION: the client-supplied "path" is used ONLY as a cosmetic, sanitized
    filename (basename, whitelisted chars). It is NEVER turned into a real
    filesystem path, so `../` traversal and absolute-path escape are structurally
    impossible — every write goes to a server-named temp file in this
    connection's private tempdir, then to the identity's event. One credential
    can only ever write to its own event.
  * WRITE-ONLY: reads, deletes, renames-to-escape, symlinks are denied. Cameras
    only STOR files.
  * RATE LIMIT: per-IP auth attempts are throttled to blunt brute force.

This does NOT terminate FTP/FTPS. SFTP (SSH) only.

Run standalone:  python camera_sftp_server.py   (needs SUPABASE_DB_URL, binds
CAMERA_SFTP_BIND_PORT, default 2222). Or import serve_forever() / make_transport
for tests.
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket
import threading
import time
import uuid
from typing import Dict, Optional

import paramiko

import camera_ingest
import camera_transfer_service as cts

logger = logging.getLogger("camera_sftp")

BIND_HOST = os.environ.get("CAMERA_SFTP_BIND_HOST", "0.0.0.0")
BIND_PORT = int(os.environ.get("CAMERA_SFTP_BIND_PORT", "2222"))
HOST_KEY_PATH = os.environ.get(
    "CAMERA_SFTP_HOST_KEY",
    os.path.join(os.path.dirname(__file__), ".camera_sftp_host_key"))
INGEST_TIMEOUT = float(os.environ.get("CAMERA_SFTP_INGEST_TIMEOUT", "120"))
AUTH_MAX_PER_MIN = int(os.environ.get("CAMERA_SFTP_AUTH_MAX_PER_MIN", "20"))
BANNER = "MAJA Invites camera transfer (SFTP). Authorized events only."


# ---------------------------------------------------------------------------
# Host key — persisted so the fingerprint the photographer verifies is stable.
# ---------------------------------------------------------------------------
def load_or_create_host_key(path: str = HOST_KEY_PATH) -> paramiko.PKey:
    if os.path.exists(path):
        try:
            return paramiko.RSAKey(filename=path)
        except Exception:
            logger.warning("host key at %s unreadable; regenerating", path)
    key = paramiko.RSAKey.generate(2048)
    try:
        key.write_private_key_file(path)
        try:
            os.chmod(path, 0o600)
        except Exception:
            pass
    except Exception:
        logger.warning("could not persist host key to %s (using ephemeral)", path)
    return key


def host_key_fingerprint(key: paramiko.PKey) -> str:
    """OpenSSH-style SHA256 fingerprint (what the photographer verifies)."""
    import base64
    import hashlib
    digest = hashlib.sha256(key.asbytes()).digest()
    b64 = base64.b64encode(digest).decode().rstrip("=")
    return f"SHA256:{b64}"


def read_fingerprint(path: str = HOST_KEY_PATH) -> Optional[str]:
    """Read-only fingerprint for the web process to display. Returns None if the
    host key doesn't exist yet — NEVER creates one (only the SFTP server does)."""
    if not os.path.exists(path):
        return None
    try:
        return host_key_fingerprint(paramiko.RSAKey(filename=path))
    except Exception:
        return None


class _Ctx:
    """Shared across connections: the DB handle and the asyncio loop that all
    paramiko threads bridge into for async DB/S3 work."""
    def __init__(self, db, loop: asyncio.AbstractEventLoop, host_key: paramiko.PKey):
        self.db = db
        self.loop = loop
        self.host_key = host_key
        self._auth_hits: Dict[str, list] = {}
        self._auth_lock = threading.Lock()

    def call(self, coro, timeout: float = 30.0):
        """Run a coroutine on the shared loop from a paramiko thread."""
        fut = asyncio.run_coroutine_threadsafe(coro, self.loop)
        return fut.result(timeout=timeout)

    def auth_allowed(self, ip: str) -> bool:
        now = time.time()
        with self._auth_lock:
            hits = [t for t in self._auth_hits.get(ip, []) if now - t < 60]
            hits.append(now)
            self._auth_hits[ip] = hits
            return len(hits) <= AUTH_MAX_PER_MIN


class _ServerIface(paramiko.ServerInterface):
    def __init__(self, ctx: _Ctx, peer_ip: str):
        self.ctx = ctx
        self.peer_ip = peer_ip
        self.binding: Optional[dict] = None

    def get_banner(self):
        return (BANNER + "\n", "en-US")

    def check_channel_request(self, kind, chanid):
        return (paramiko.OPEN_SUCCEEDED if kind == "session"
                else paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED)

    def get_allowed_auths(self, username):
        return "password"

    def check_auth_password(self, username, password):
        if not self.ctx.auth_allowed(self.peer_ip):
            logger.warning("auth rate-limited ip=%s", self.peer_ip)
            return paramiko.AUTH_FAILED
        try:
            binding = self.ctx.call(cts.authenticate(self.ctx.db, username, password))
        except Exception:
            logger.exception("auth error")
            return paramiko.AUTH_FAILED
        if binding:
            self.binding = binding
            logger.info("auth ok user=%s event=%s ip=%s",
                        username, binding["profile_id"], self.peer_ip)
            return paramiko.AUTH_SUCCESSFUL
        logger.info("auth failed user=%s ip=%s", username, self.peer_ip)
        return paramiko.AUTH_FAILED

    def check_channel_subsystem_request(self, channel, name):
        return super().check_channel_subsystem_request(channel, name)


class _WriteHandle(paramiko.SFTPHandle):
    """A write handle backed by a server-named temp file. On close, the bytes go
    to the bound event via the normal ingest, then the temp file is removed."""
    def __init__(self, iface: "_SFTPIface", vname: str, tmp_path: str, flags: int):
        super().__init__(flags)
        self._iface = iface
        self._vname = vname
        self._tmp_path = tmp_path
        self.writefile = open(tmp_path, "wb")   # paramiko writes via self.writefile

    def close(self):
        try:
            try:
                self.writefile.close()
            except Exception:
                pass
            self._iface._ingest_tmp(self._vname, self._tmp_path)
        finally:
            try:
                if os.path.exists(self._tmp_path):
                    os.remove(self._tmp_path)
            except Exception:
                pass
        return paramiko.SFTP_OK


class _SFTPIface(paramiko.SFTPServerInterface):
    """Write-only virtual filesystem. The client 'path' is never a real path —
    only its sanitized basename is kept, as a cosmetic label."""
    def __init__(self, server: _ServerIface, ctx: _Ctx, *largs, **kw):
        super().__init__(server, *largs, **kw)
        self.ctx = ctx
        self.binding = getattr(server, "binding", None)
        self._tmpdir = os.path.join(
            os.environ.get("CAMERA_SFTP_TMP", os.path.join(os.path.dirname(__file__), ".camera_tmp")),
            uuid.uuid4().hex)
        os.makedirs(self._tmpdir, exist_ok=True)
        self._peer_ip = getattr(server, "peer_ip", "")

    # -- writes -----------------------------------------------------------
    def open(self, path, flags, attr):
        want_write = bool(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND))
        if not want_write:
            return paramiko.SFTP_PERMISSION_DENIED     # cameras only write
        if not self.binding:
            return paramiko.SFTP_PERMISSION_DENIED
        vname = camera_ingest.sanitize_filename(path)
        tmp = os.path.join(self._tmpdir, f"{uuid.uuid4().hex}")
        try:
            return _WriteHandle(self, vname, tmp, flags)
        except Exception:
            logger.exception("open failed")
            return paramiko.SFTP_FAILURE

    def _ingest_tmp(self, vname: str, tmp_path: str):
        try:
            with open(tmp_path, "rb") as f:
                data = f.read()
        except Exception:
            logger.exception("could not read staged upload")
            return
        try:
            self.ctx.call(
                camera_ingest.ingest_bytes(self.ctx.db, self.binding, data, vname,
                                           client_ip=self._peer_ip),
                timeout=INGEST_TIMEOUT)
        except Exception:
            logger.exception("ingest failed for %s", vname)

    # -- stat/list: enough for a camera to probe the remote dir -----------
    def _dir_attr(self):
        a = paramiko.SFTPAttributes()
        a.st_mode = 0o40777
        a.st_size = 0
        return a

    def list_folder(self, path):
        return []                                      # nothing to enumerate

    def stat(self, path):
        return self._dir_attr()                        # treat every path as an existing dir

    def lstat(self, path):
        return self._dir_attr()

    def mkdir(self, path, attr):
        return paramiko.SFTP_OK                         # virtual; accept so cd/mkdir works

    def canonicalize(self, path):
        # Confine everything to a virtual root; strip any traversal. Purely
        # cosmetic (nothing here maps to a real fs path).
        parts = [p for p in (path or "/").replace("\\", "/").split("/")
                 if p not in ("", ".", "..")]
        return "/" + "/".join(parts)

    # -- everything mutating/escaping is denied ---------------------------
    def remove(self, path):
        return paramiko.SFTP_PERMISSION_DENIED

    def rename(self, oldpath, newpath):
        return paramiko.SFTP_OK                          # bytes already captured on close; no-op ok

    def rmdir(self, path):
        return paramiko.SFTP_PERMISSION_DENIED

    def chattr(self, path, attr):
        return paramiko.SFTP_OK                          # ignore mode/time sets

    def symlink(self, target_path, path):
        return paramiko.SFTP_PERMISSION_DENIED

    def readlink(self, path):
        return paramiko.SFTP_PERMISSION_DENIED

    def session_ended(self):
        try:
            import shutil
            shutil.rmtree(self._tmpdir, ignore_errors=True)
        except Exception:
            pass


def _handle_connection(client: socket.socket, addr, ctx: _Ctx):
    peer_ip = addr[0] if addr else ""
    t = None
    try:
        t = paramiko.Transport(client)
        t.local_version = "SSH-2.0-MAJACamera"
        t.add_server_key(ctx.host_key)
        server = _ServerIface(ctx, peer_ip)
        t.set_subsystem_handler("sftp", paramiko.SFTPServer, _SFTPIface, ctx)
        t.start_server(server=server)
        # Hold the connection open while the SFTP subsystem runs.
        chan = t.accept(timeout=60)
        if chan is None:
            return
        while t.is_active():
            time.sleep(0.5)
    except Exception:
        logger.info("connection from %s ended", peer_ip)
    finally:
        try:
            if t:
                t.close()
        except Exception:
            pass
        try:
            client.close()
        except Exception:
            pass


def make_transport(client: socket.socket, ctx: _Ctx) -> paramiko.Transport:
    """Test helper: wire a single accepted socket to the server on the given
    context and start it. Returns the live Transport."""
    t = paramiko.Transport(client)
    t.add_server_key(ctx.host_key)
    t.set_subsystem_handler("sftp", paramiko.SFTPServer, _SFTPIface, ctx)
    server = _ServerIface(ctx, "127.0.0.1")
    t.start_server(server=server)
    return t


def serve_forever(db, loop: asyncio.AbstractEventLoop,
                  host: str = BIND_HOST, port: int = BIND_PORT,
                  host_key: Optional[paramiko.PKey] = None,
                  ready: Optional[threading.Event] = None,
                  stop: Optional[threading.Event] = None) -> None:
    """Blocking accept loop. `db` is a connected pg_adapter DB; `loop` is a
    running asyncio loop in another thread that DB/S3 coroutines run on."""
    ctx = _Ctx(db, loop, host_key or load_or_create_host_key())
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((host, port))
    srv.listen(64)
    srv.settimeout(1.0)
    logger.info("camera SFTP server listening on %s:%s fingerprint=%s",
                host, port, host_key_fingerprint(ctx.host_key))
    if ready:
        ready.set()
    try:
        while not (stop and stop.is_set()):
            try:
                client, addr = srv.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            threading.Thread(target=_handle_connection, args=(client, addr, ctx),
                             daemon=True).start()
    finally:
        srv.close()


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
    # give the loop a moment to connect
    time.sleep(1.0)
    serve_forever(db, loop)


if __name__ == "__main__":
    _main()
