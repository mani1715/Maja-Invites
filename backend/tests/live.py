"""Shared entry point for the suites that need a RUNNING server.

Fifteen modules here talk to a live backend over HTTP, and they had three
different ways of finding it, two of them broken:

  * `assert BASE_URL, "REACT_APP_BACKEND_URL must be set"` at module scope.
    An assert at import time is a COLLECTION error, not a skip — pytest
    reports `Interrupted: N errors during collection` and refuses to run the
    directory AT ALL. Four modules did this, so `pytest tests/` could never
    run, and the only thing anyone could run was the curated
    `run_event_suite` list. Whatever rotted outside that list rotted unseen.
  * a default of `http://localhost:8000`. Nothing has ever listened there —
    the dev backend is 8001 (docs/DEPLOYMENT.md, deploy/docker-compose.yml).
    A wrong default does not fail loudly; it produces a wall of connection
    errors that reads like the server is broken.
  * a silent `""`, which turns every request into a request for `/api/...`
    with no host.

`require_live()` replaces all three. It resolves the URL from the environment
with a default that is actually correct, probes it once per process, and skips
the whole module — cleanly, with a reason — when nothing answers. Nothing here
invents a pass: a skipped module says "not run", never "green".
"""
from __future__ import annotations

import os

import pytest

# The dev backend, per docs/DEPLOYMENT.md. Overridden by REACT_APP_BACKEND_URL
# (the name the existing suites and the frontend .env already use).
DEFAULT_BASE_URL = "http://localhost:8001"

# The backend's bot-blocker answers 403 to an empty or curl User-Agent, so every
# suite here sends a browser one. Shared so it cannot drift per file.
BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
UA_HEADER = {"User-Agent": BROWSER_UA}

_probe_cache: dict[str, str | None] = {}


def base_url() -> str:
    """The backend under test, without a trailing slash."""
    return (os.environ.get("REACT_APP_BACKEND_URL") or DEFAULT_BASE_URL).rstrip("/")


def _probe(url: str) -> str | None:
    """Return None if the server answers, else why it did not."""
    if url in _probe_cache:
        return _probe_cache[url]
    reason: str | None
    try:
        import requests
        r = requests.get(f"{url}/api/health", headers=UA_HEADER, timeout=4)
        reason = None if r.status_code < 500 else f"{url} answered {r.status_code}"
    except Exception as exc:                       # connection refused, DNS, timeout
        reason = f"no server at {url} ({type(exc).__name__})"
    _probe_cache[url] = reason
    return reason


def live_db():
    """The same Postgres the running backend is using, via the app's own adapter.

    The legacy suites reached for `pymongo` / `motor` on localhost:27017 to seed
    a fixture. There is no MongoDB any more — the store is Postgres behind
    `pg_adapter`, a Mongo-shaped async adapter — so those modules could not even
    be imported. Going through the adapter rather than raw SQL keeps a test's
    idea of a document identical to the server's.

    Returns a `pg_adapter.Database`; `await db.ensure_connected()` before use.
    """
    import os as _os
    from dotenv import load_dotenv
    from pathlib import Path

    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env")
    dsn = _os.environ.get("SUPABASE_DB_URL") or _os.environ.get("DATABASE_URL")
    if not dsn:
        pytest.skip("no SUPABASE_DB_URL in backend/.env — cannot seed fixtures",
                    allow_module_level=True)

    import sys as _sys
    if str(backend_dir) not in _sys.path:
        _sys.path.insert(0, str(backend_dir))
    import pg_adapter
    return pg_adapter.Database.lazy(dsn, min_size=1, max_size=4)


def new_wedding_payload(**overrides) -> dict:
    """The minimum POST /api/admin/profiles accepts.

    `event_type`, `event_date` and `design_id` are required. Several suites
    carried an older payload (`wedding_date`, `venue_name`, `template_id`) that
    422s, and then skipped themselves on the failure — so they asserted nothing
    for as long as that payload was wrong. One definition, one place to fix.
    """
    import uuid as _uuid
    body = {
        "groom_name": f"TESTGroom{_uuid.uuid4().hex[:6]}",
        "bride_name": f"TESTBride{_uuid.uuid4().hex[:6]}",
        "event_type": "wedding",
        "event_date": "2026-12-12T00:00:00",
        "venue": "Test Hall",
        "city": "Bengaluru",
        "design_id": "royal_heritage",
        "invitation_category": "wedding",
    }
    body.update(overrides)
    return body


def create_profile_for(owner_headers: dict, payload: dict, *, timeout: int = 30):
    """POST /api/admin/profiles as a super-admin, ASSIGNED to the photographer
    whose token is in owner_headers (or created directly when that caller is
    ALREADY super-admin). Returns the raw requests.Response so callers can assert
    on status and body.

    Event creation is super-admin-only (2026-08-21 business rule): a
    photographer's direct POST is 403. Live suites that used to create a profile
    with a photographer token go through here so the fixture still gets a profile
    OWNED BY that photographer (via ?on_behalf_of=), exactly the admin
    "create & assign" flow in production.
    """
    import requests
    import jwt as _jwt

    auth = owner_headers.get("Authorization", "")
    token = auth.split(" ", 1)[1] if " " in auth else auth
    claims = _jwt.decode(token, options={"verify_signature": False}) if token else {}
    caller_id, caller_role = claims.get("sub"), claims.get("role")

    if caller_role == "super_admin":
        post_headers, params = owner_headers, None
    else:
        # Mint a super token (signed with the SAME secret the server runs on —
        # see mint_admin_token) and assign the new profile back to the caller.
        super_tok = mint_admin_token(f"fixture_super_{(caller_id or 'x')[:8]}", role="super_admin")
        post_headers = {"Authorization": f"Bearer {super_tok}", "Content-Type": "application/json"}
        params = {"on_behalf_of": caller_id}

    return requests.post(f"{base_url()}/api/admin/profiles", params=params,
                         json=payload, headers={**UA_HEADER, **post_headers}, timeout=timeout)


def create_wedding(headers: dict, **overrides) -> tuple[str, str]:
    """Create a throwaway invitation OWNED BY the caller. Returns (slug, id).

    Event creation is super-admin-only — see create_profile_for. The server
    derives the slug from the couple's names and ignores a requested one, so
    callers must use the slug it returns.
    """
    r = create_profile_for(headers, new_wedding_payload(**overrides))
    assert r.status_code in (200, 201), \
        f"could not create fixture invitation: {r.status_code} {r.text[:300]}"
    created = r.json()
    return created["slug"], created["id"]


def delete_wedding(headers: dict, profile_id: str) -> None:
    import requests
    requests.delete(f"{base_url()}/api/admin/profiles/{profile_id}",
                    headers={**UA_HEADER, **headers}, timeout=30)


def mint_admin_token(admin_id: str, role: str = "admin", *, minutes: int = 30) -> str:
    """A JWT the RUNNING SERVER will accept, for an admin seeded directly.

    `auth.create_access_token` cannot be used from a full-directory run. Roughly
    forty in-process suites do

        os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

    at import time so they can build a FastAPI app without a real secret. Those
    modules sort earlier, `auth` binds SECRET_KEY once at import, and every
    token minted afterwards is signed with the placeholder — which the live
    server, running on the secret from backend/.env, rejects as "Could not
    validate credentials". Run the same file alone and it passes. Signing here
    with the secret read from .env makes the result independent of whatever a
    sibling module planted in the environment.
    """
    import os as _os
    from datetime import datetime, timedelta, timezone
    from pathlib import Path
    import uuid as _uuid

    import jwt as _jwt
    from dotenv import dotenv_values

    env = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
    secret = env.get("JWT_SECRET_KEY") or _os.environ.get("JWT_SECRET_KEY")
    if not secret:
        pytest.skip("no JWT_SECRET_KEY in backend/.env — cannot mint a token the "
                    "server will accept", allow_module_level=True)
    return _jwt.encode(
        {"sub": admin_id, "role": role, "jti": _uuid.uuid4().hex,
         "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes)},
        secret, algorithm="HS256",
    )


_token_cache: dict[tuple[str, str], str] = {}


def login(email: str, password: str, *, timeout: int = 15) -> str:
    """A Bearer token for `email`, logging in at most once per process.

    Every live suite used to call POST /api/auth/login from its own fixture.
    Run one file and that is fine; run the directory and it is ~20 logins from
    one IP inside a minute, which trips the login rate limiter (15 per IP /
    10 per identifier, per 15 minutes) and answers 429. The result was 30-odd
    failures reading `admin login failed: 429` that had nothing to do with the
    code under test and masked the real ones underneath.

    Caching the token is also closer to what a client actually does: log in
    once, then carry the token. The limiter stays ON — the suite simply stops
    behaving like a credential-stuffing attempt.
    """
    key = (base_url(), email)
    if key in _token_cache:
        return _token_cache[key]

    import requests
    r = requests.post(f"{base_url()}/api/auth/login",
                      json={"email": email, "password": password},
                      headers={**UA_HEADER, "Content-Type": "application/json"},
                      timeout=timeout)
    if r.status_code == 429:
        pytest.skip(f"login rate-limited for {email}; the limiter is per-IP and "
                    f"in-memory, so it clears on backend restart or in 15 min",
                    allow_module_level=True)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    body = r.json()
    tok = body.get("access_token") or body.get("token")
    assert tok, f"no token in login response for {email}: {body}"
    _token_cache[key] = tok
    return tok


def require_live() -> str:
    """Base URL of a reachable backend, or skip this module.

    Call at module scope::

        BASE_URL = require_live()

    so the module is collected either way and simply reports "skipped" when the
    stack is not up.
    """
    url = base_url()
    reason = _probe(url)
    if reason:
        pytest.skip(f"live-server suite: {reason}; set REACT_APP_BACKEND_URL "
                    f"to a running backend to run it", allow_module_level=True)
    return url
