"""
Session-lifecycle hardening in auth_sessions.py / auth.py:
  * absolute session ceiling on top of the sliding idle refresh TTL
  * bounded cleanup of refresh_tokens / device_sessions / jwt_blacklist
  * immediate lockout for a disabled event_client account

No DB, no live stack. FakeDB below covers only the filter operators these
two modules actually issue ($or/$and/$lt/$in) -- see
tests/test_storage_orchestrator.py's `_Collection` for the fuller version
this mirrors.

    cd backend && python -m pytest tests/test_auth_session_lifecycle.py -q
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

import pytest  # noqa: E402
from fastapi import HTTPException  # noqa: E402
from fastapi.security import HTTPAuthorizationCredentials  # noqa: E402

import auth  # noqa: E402
import auth_sessions  # noqa: E402
from auth_sessions import cleanup_auth_sessions, issue_session, rotate_session  # noqa: E402


# --------------------------------------------------------------------------- #
# Minimal Mongo-ish fake DB
# --------------------------------------------------------------------------- #
class _Coll:
    def __init__(self):
        self.docs = []

    @staticmethod
    def _match(doc, flt):
        for k, v in (flt or {}).items():
            if k == "$or":
                if not any(_Coll._match(doc, c) for c in v):
                    return False
                continue
            if k == "$and":
                if not all(_Coll._match(doc, c) for c in v):
                    return False
                continue
            if isinstance(v, dict) and any(op.startswith("$") for op in v):
                dv = doc.get(k)
                for op, val in v.items():
                    if op == "$lt":
                        if not (dv is not None and dv < val):
                            return False
                    elif op == "$in":
                        if dv not in (val or []):
                            return False
                    else:
                        raise NotImplementedError(f"fake db: unsupported op {op}")
            elif doc.get(k) != v:
                return False
        return True

    async def find_one(self, flt=None, projection=None):
        for d in self.docs:
            if self._match(d, flt):
                return dict(d)
        return None

    def find(self, flt=None, projection=None):
        return _Cur([d for d in self.docs if self._match(d, flt)])

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def update_one(self, flt, update, upsert=False):
        for d in self.docs:
            if self._match(d, flt):
                d.update(update.get("$set", {}))
                return

    async def update_many(self, flt, update, upsert=False):
        n = 0
        for d in self.docs:
            if self._match(d, flt):
                d.update(update.get("$set", {}))
                n += 1
        return n

    async def delete_many(self, flt):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not self._match(d, flt)]
        return before - len(self.docs)


class _Cur:
    def __init__(self, docs):
        self._docs = docs

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    def sort(self, key, direction=1):
        self._docs = sorted(self._docs, key=lambda d: d.get(key), reverse=direction < 0)
        return self

    async def to_list(self, n=None):
        docs = [dict(d) for d in self._docs]
        return docs[:n] if n else docs

    def __aiter__(self):
        self._it = iter([dict(d) for d in self._docs])
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration


class FakeDB:
    def __init__(self):
        self._cols = {}

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return self._cols.setdefault(name, _Coll())


class FakeRequest:
    def __init__(self):
        self.cookies = {}
        self.headers = {}
        self.client = None


class FakeResponse:
    def __init__(self):
        self.cookies_set = {}

    def set_cookie(self, key, value, **kw):
        self.cookies_set[key] = value

    def delete_cookie(self, key, **kw):
        self.cookies_set.pop(key, None)


def _iso(dt):
    return dt.isoformat()


def _now():
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- #
# 1. family_created_at carried through rotation
# --------------------------------------------------------------------------- #
def test_family_created_at_carried_through_rotation():
    async def _run():
        db = FakeDB()
        resp1 = FakeResponse()
        await issue_session(db, "admin1", "admin", FakeRequest(), resp1)
        raw1 = resp1.cookies_set[auth_sessions.REFRESH_COOKIE]
        row1 = await db.refresh_tokens.find_one({"token_hash": auth_sessions._hash(raw1)})
        original_family = row1["family_id"]
        original_created = row1["family_created_at"]
        assert original_created  # stamped at login

        resp2 = FakeResponse()
        subject_id, subject_kind = await rotate_session(db, raw1, resp2)
        assert (subject_id, subject_kind) == ("admin1", "admin")

        raw2 = resp2.cookies_set[auth_sessions.REFRESH_COOKIE]
        row2 = await db.refresh_tokens.find_one({"token_hash": auth_sessions._hash(raw2)})
        assert row2["family_id"] == original_family
        assert row2["family_created_at"] == original_created  # carried verbatim
        assert row2["revoked"] is False

        row1_after = await db.refresh_tokens.find_one({"token_hash": auth_sessions._hash(raw1)})
        assert row1_after["revoked"] is True  # rotated away, not reusable

    asyncio.run(_run())


# --------------------------------------------------------------------------- #
# 2. absolute ceiling refuses refresh + revokes the whole family
# --------------------------------------------------------------------------- #
def test_absolute_ceiling_revokes_family():
    async def _run():
        db = FakeDB()
        orig = auth_sessions.REFRESH_ABSOLUTE_DAYS
        auth_sessions.REFRESH_ABSOLUTE_DAYS = 1
        try:
            raw = "raw-token-abs"
            family_id = "fam-abs"
            old_created = _iso(_now() - timedelta(days=2))
            await db.refresh_tokens.insert_one({
                "id": "rt1", "token_hash": auth_sessions._hash(raw),
                "family_id": family_id, "family_created_at": old_created,
                "subject_id": "admin1", "subject_kind": "admin", "device_id": "dev1",
                "revoked": False, "expires_at": _iso(_now() + timedelta(days=10)),
                "created_at": old_created,
            })
            resp = FakeResponse()
            with pytest.raises(HTTPException) as exc_info:
                await rotate_session(db, raw, resp)
            assert exc_info.value.status_code == 401
            assert exc_info.value.detail == {"error": "session_expired_absolute"}

            row = await db.refresh_tokens.find_one({"id": "rt1"})
            assert row["revoked"] is True
            # no successor minted for this family
            assert not any(d["family_id"] == family_id and d["id"] != "rt1"
                           for d in db.refresh_tokens.docs)
        finally:
            auth_sessions.REFRESH_ABSOLUTE_DAYS = orig

    asyncio.run(_run())


# --------------------------------------------------------------------------- #
# 3. legacy rows (minted before family_created_at existed) never crash
# --------------------------------------------------------------------------- #
def test_legacy_row_falls_back_to_created_at():
    async def _run():
        db = FakeDB()
        raw = "raw-token-legacy"
        legacy_created = _iso(_now() - timedelta(days=5))
        await db.refresh_tokens.insert_one({
            "id": "rt_legacy", "token_hash": auth_sessions._hash(raw),
            "family_id": "fam-legacy",
            # no family_created_at key at all -- pre-upgrade row
            "subject_id": "admin1", "subject_kind": "admin", "device_id": "dev1",
            "revoked": False, "expires_at": _iso(_now() + timedelta(days=10)),
            "created_at": legacy_created,
        })
        resp = FakeResponse()
        subject_id, _ = await rotate_session(db, raw, resp)
        assert subject_id == "admin1"

        raw2 = resp.cookies_set[auth_sessions.REFRESH_COOKIE]
        row2 = await db.refresh_tokens.find_one({"token_hash": auth_sessions._hash(raw2)})
        assert row2["family_created_at"] == legacy_created  # fell back, self-healed forward

    asyncio.run(_run())


def test_unparseable_timestamp_never_crashes():
    async def _run():
        db = FakeDB()
        raw = "raw-token-garbage"
        await db.refresh_tokens.insert_one({
            "id": "rt_garbage", "token_hash": auth_sessions._hash(raw),
            "family_id": "fam-garbage", "family_created_at": "not-a-date",
            "subject_id": "admin1", "subject_kind": "admin", "device_id": "dev1",
            "revoked": False, "expires_at": _iso(_now() + timedelta(days=10)),
            "created_at": "also-not-a-date",
        })
        resp = FakeResponse()
        # ceiling check must degrade (skip), not raise, on a bad timestamp
        subject_id, _ = await rotate_session(db, raw, resp)
        assert subject_id == "admin1"

    asyncio.run(_run())


# --------------------------------------------------------------------------- #
# 4. cleanup_auth_sessions reaps expired/stale rows, leaves live ones
# --------------------------------------------------------------------------- #
def test_cleanup_reaps_expired_but_leaves_live_rows():
    async def _run():
        db = FakeDB()
        now = _now()

        await db.refresh_tokens.insert_one({
            "id": "rt_expired_grace", "expires_at": _iso(now - timedelta(days=8)),
            "revoked": False, "created_at": _iso(now - timedelta(days=40))})
        await db.refresh_tokens.insert_one({
            "id": "rt_revoked_old", "expires_at": _iso(now + timedelta(days=5)),
            "revoked": True, "created_at": _iso(now - timedelta(days=40))})
        await db.refresh_tokens.insert_one({
            "id": "rt_live", "expires_at": _iso(now + timedelta(days=5)),
            "revoked": False, "created_at": _iso(now - timedelta(days=1))})

        await db.device_sessions.insert_one({
            "id": "ds_stale", "last_active": _iso(now - timedelta(days=200)), "revoked": False})
        await db.device_sessions.insert_one({
            "id": "ds_revoked_old", "last_active": _iso(now - timedelta(days=40)), "revoked": True})
        await db.device_sessions.insert_one({
            "id": "ds_live", "last_active": _iso(now - timedelta(hours=1)), "revoked": False})

        await db.jwt_blacklist.insert_one({"jti": "jti_expired", "exp": _iso(now - timedelta(days=1))})
        await db.jwt_blacklist.insert_one({"jti": "jti_live", "exp": _iso(now + timedelta(days=1))})

        counts = await cleanup_auth_sessions(db)
        assert counts == {"refresh_tokens": 2, "device_sessions": 2, "jwt_blacklist": 1}

        assert {d["id"] for d in db.refresh_tokens.docs} == {"rt_live"}
        assert {d["id"] for d in db.device_sessions.docs} == {"ds_live"}
        assert {d["jti"] for d in db.jwt_blacklist.docs} == {"jti_live"}

        # idempotent / safe to re-run with nothing left to reap
        counts2 = await cleanup_auth_sessions(db)
        assert counts2 == {"refresh_tokens": 0, "device_sessions": 0, "jwt_blacklist": 0}

    asyncio.run(_run())


# --------------------------------------------------------------------------- #
# 5. disabled/missing event_client account -> 401; enabled passes; DB error
#    fails open (matches this module's documented posture elsewhere)
# --------------------------------------------------------------------------- #
def test_event_client_revocation_and_fail_open():
    async def _run():
        db = FakeDB()
        await db.event_client_accounts.insert_one({"profile_id": "prof_enabled", "enabled": True})
        await db.event_client_accounts.insert_one({"profile_id": "prof_disabled", "enabled": False})

        orig_get_db = auth._get_db
        auth._get_db = lambda: db
        try:
            def _creds(tok):
                return HTTPAuthorizationCredentials(scheme="Bearer", credentials=tok)

            token_ok = auth.create_client_token("prof_enabled")
            token_disabled = auth.create_client_token("prof_disabled")
            token_missing = auth.create_client_token("prof_missing")  # no account row at all

            profile_id = await auth.get_current_event_client(_creds(token_ok))
            assert profile_id == "prof_enabled"

            with pytest.raises(HTTPException) as exc_info:
                await auth.get_current_event_client(_creds(token_disabled))
            assert exc_info.value.status_code == 401

            with pytest.raises(HTTPException) as exc_info:
                await auth.get_current_event_client(_creds(token_missing))
            assert exc_info.value.status_code == 401

            # DB reachable overall, but the account lookup itself blows up ->
            # fail OPEN rather than lock every client out on a DB hiccup.
            async def _boom(*_a, **_kw):
                raise RuntimeError("db down")
            db.event_client_accounts.find_one = _boom
            profile_id2 = await auth.get_current_event_client(_creds(token_ok))
            assert profile_id2 == "prof_enabled"
        finally:
            auth._get_db = orig_get_db

    asyncio.run(_run())


if __name__ == "__main__":
    # allow `python tests/test_auth_session_lifecycle.py` too, mirroring the
    # other no-DB self-tests in this directory
    for _name, _fn in list(globals().items()):
        if _name.startswith("test_") and callable(_fn):
            _fn()
            print(f"  ok  {_name}")
    print("\nALL AUTH SESSION LIFECYCLE CHECKS PASSED")
