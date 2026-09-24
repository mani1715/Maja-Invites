"""
Self-test for the storage-pool super-admin endpoints (Phase 4).

    cd backend && python -m tests.test_storage_pool_service

No network, no Postgres: FakeDB from the orchestrator test, a fake OAuth flow,
and a fake provider. Covers:

  1. Listing before configuration (configured=false, empty pool).
  2. /connect without env -> 503 with actionable detail.
  3. /connect configured -> authorization_url + single-use state stored.
  4. Callback with a bad state -> redirect ?pool_connected=invalid_state.
  5. Callback happy path -> account registered: real quota becomes capacity,
     pre-used bytes seed committed_bytes, credentials encrypted, slot=current.
  6. Duplicate connect of the same Google account -> rejected.
  7. disable (current) -> pointer hands over; enable; make-current override.
  8. /check persists health + quota snapshot and reports drift.
  9. No response ever leaks credentials_enc.
"""
from __future__ import annotations

import os
import sys
import types
from typing import Any, Dict

# stub aws_service before storage imports (keeps boto3 out)
from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()

from cryptography.fernet import Fernet
os.environ["STORAGE_CRED_KEY"] = Fernet.generate_key().decode()
for k in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "PUBLIC_BASE_URL",
          "FRONTEND_BASE_URL", "STORAGE_POOL_REDIRECT_URI"):
    os.environ.pop(k, None)

from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.test_storage_orchestrator import FakeDB, MemProvider  # reuse harness
import storage
import storage_pool_service as sps


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


class FakeCreds:
    token = "at-1"
    refresh_token = "rt-1"
    token_uri = "https://oauth2.googleapis.com/token"
    client_id = "cid"
    client_secret = "csec"
    scopes = ["https://www.googleapis.com/auth/drive.file"]


class FakeFlow:
    def __init__(self):
        self.credentials = FakeCreds()
        self.oauth2session = types.SimpleNamespace(scope=None)

    def authorization_url(self, **kw):
        return (f"https://accounts.google.com/o/oauth2/auth?state={kw['state']}", kw["state"])

    def fetch_token(self, code):
        assert code == "good-code"


class FakeAboutService:
    """Mimics googleapiclient build('drive','v3').about().get().execute()."""
    def __init__(self, email="pool01@gmail.com", limit=15 * 1024 ** 4, usage=2 * 1024 ** 3):
        self._resp = {"user": {"emailAddress": email},
                      "storageQuota": {"limit": str(limit), "usage": str(usage)}}

    def about(self):
        outer = self

        class _G:
            def get(self, fields):  # noqa: ARG002
                class _E:
                    def execute(_s):
                        return outer._resp
                return _E()
        return _G()


def main() -> None:
    db = FakeDB()
    mem = MemProvider()
    # route every provider lookup to the in-memory provider
    storage.get_provider = lambda kind: mem  # type: ignore[attr-defined]

    app = FastAPI()

    async def fake_super_admin():
        return "sa1"

    app.include_router(sps.build_storage_pool_router(db, fake_super_admin))
    client = TestClient(app)

    print("1. listing before configuration")
    r = client.get("/api/super-admin/storage/accounts")
    _check(r.status_code == 200 and r.json()["configured"] is False
           and r.json()["accounts"] == [], "empty pool, configured=false")

    print("1b. flag endpoints: default off; refuses to enable an empty pool")
    r = client.get("/api/super-admin/storage/settings")
    _check(r.status_code == 200 and r.json()["enabled"] is False,
           "storage_pool_enabled defaults to OFF")
    r = client.put("/api/super-admin/storage/settings", json={"enabled": True})
    _check(r.status_code == 409, "cannot enable with zero active accounts")

    print("2. connect unconfigured -> 503")
    r = client.get("/api/super-admin/storage/accounts/connect")
    _check(r.status_code == 503 and "GOOGLE_CLIENT_ID" in r.json()["detail"],
           "503 with actionable detail")

    print("3. connect configured -> auth url + state")
    os.environ.update({
        "GOOGLE_CLIENT_ID": "cid", "GOOGLE_CLIENT_SECRET": "csec",
        "PUBLIC_BASE_URL": "https://majainvites.com",
    })
    sps._flow = lambda: FakeFlow()  # no google_auth_oauthlib needed
    r = client.get("/api/super-admin/storage/accounts/connect?label=pool-01")
    _check(r.status_code == 200 and "accounts.google.com" in r.json()["authorization_url"],
           "authorization_url returned")
    state = r.json()["authorization_url"].split("state=")[1]
    _check(len(db._cols["storage_oauth_states"].docs) == 1, "single-use state stored")

    print("4. callback with a bad state")
    r = client.get("/api/storage-pool/oauth/callback?code=x&state=WRONG",
                   follow_redirects=False)
    _check(r.status_code == 302 and "pool_connected=invalid_state" in r.headers["location"],
           "invalid state rejected")

    print("5. callback happy path")
    import googleapiclient.discovery as gd
    gd.build = lambda *a, **k: FakeAboutService()
    r = client.get(f"/api/storage-pool/oauth/callback?code=good-code&state={state}",
                   follow_redirects=False)
    _check(r.status_code == 302 and "pool_connected=success" in r.headers["location"],
           "redirects back with success")
    accs = client.get("/api/super-admin/storage/accounts").json()["accounts"]
    _check(len(accs) == 1, "account registered")
    a = accs[0]
    _check(a["capacity_bytes"] == 15 * 1024 ** 4, "capacity taken from Google's real quota")
    _check(a["committed_bytes"] == 2 * 1024 ** 3, "pre-used bytes seed the counter")
    _check(a["slot"] == "current" and a["google_email"] == "pool01@gmail.com",
           "first account becomes CURRENT")
    _check("credentials_enc" not in a, "credentials never leave the API")
    raw = db._cols["storage_accounts"].docs[0]
    _check("rt-1" not in str(raw.get("credentials_enc")), "refresh token encrypted at rest")

    print("6. duplicate account rejected")
    r = client.get("/api/super-admin/storage/accounts/connect?label=dup")
    state2 = r.json()["authorization_url"].split("state=")[1]
    r = client.get(f"/api/storage-pool/oauth/callback?code=good-code&state={state2}",
                   follow_redirects=False)
    _check("pool_connected=already_connected" in r.headers["location"],
           "same Google account cannot join twice")

    print("7. lifecycle: disable / enable / make-current")
    # add a second (different) account so the pointer has somewhere to go
    r = client.get("/api/super-admin/storage/accounts/connect?label=pool-02")
    state3 = r.json()["authorization_url"].split("state=")[1]
    gd.build = lambda *a, **k: FakeAboutService(email="pool02@gmail.com", usage=0)
    client.get(f"/api/storage-pool/oauth/callback?code=good-code&state={state3}",
               follow_redirects=False)
    accs = client.get("/api/super-admin/storage/accounts").json()["accounts"]
    a1, a2 = accs[0], accs[1]
    r = client.post(f"/api/super-admin/storage/accounts/{a1['id']}/disable")
    _check(r.json()["disabled"], "disable ok")
    accs = {x["id"]: x for x in client.get("/api/super-admin/storage/accounts").json()["accounts"]}
    _check(accs[a1["id"]]["status"] == "disabled"
           and accs[a2["id"]]["slot"] == "current",
           "disabling the CURRENT drive hands the pointer to the next one")
    client.post(f"/api/super-admin/storage/accounts/{a1['id']}/enable")
    client.post(f"/api/super-admin/storage/accounts/{a1['id']}/make-current")
    accs = {x["id"]: x for x in client.get("/api/super-admin/storage/accounts").json()["accounts"]}
    _check(accs[a1["id"]]["slot"] == "current" and accs[a2["id"]]["slot"] == "standby",
           "make-current override works")

    print("8. live check persists health + quota and reports drift")
    r = client.post(f"/api/super-admin/storage/accounts/{a1['id']}/check")
    body = r.json()
    _check(body["health_ok"] is True, "health probe ok (fake provider)")
    _check("drift_bytes" in body or "quota_error" in body, "drift/quota surfaced")
    acc_after = db._cols["storage_accounts"].docs[0]
    _check(acc_after.get("last_health_ok_at"), "health snapshot persisted")

    print("8a2. per-drive config (soft limit tunable for 15TB drives)")
    r = client.post(f"/api/super-admin/storage/accounts/{a1['id']}/config",
                    json={"soft_limit_pct": 95, "label": "drive-01-15TB"})
    _check(r.status_code == 200 and r.json()["updated"]["soft_limit_pct"] == 95,
           "soft_limit_pct raised to 95 (80% wastes ~3TB on a 15TB drive)")
    r = client.post(f"/api/super-admin/storage/accounts/{a1['id']}/config",
                    json={"soft_limit_pct": 200})
    _check(r.status_code == 422, "insane soft limit rejected")

    print("8b. flag can be enabled once the pool has active accounts")
    r = client.put("/api/super-admin/storage/settings", json={"enabled": True})
    _check(r.status_code == 200 and r.json()["enabled"] is True, "enable ok")
    r = client.get("/api/super-admin/storage/settings")
    _check(r.json()["enabled"] is True, "flag persisted")
    r = client.put("/api/super-admin/storage/settings", json={"enabled": False})
    _check(r.json()["enabled"] is False, "instant rollback: flip off")

    print("8c. dashboard / failures / alerts endpoints (Phase 7)")
    r = client.get("/api/super-admin/storage/dashboard")
    body = r.json()
    _check(r.status_code == 200 and body["accounts"] and body["active_drive"]
           and "uploads" in body and "alerts" in body,
           "dashboard payload has pool, active drive, uploads, alerts")
    _check("credentials_enc" not in str(body), "dashboard leaks no credentials")
    r = client.get("/api/super-admin/storage/by-photographer")
    _check(r.status_code == 200 and "items" in r.json(), "by-photographer ok")
    r = client.get("/api/super-admin/storage/by-event")
    _check(r.status_code == 200 and "items" in r.json(), "by-event ok")
    r = client.get("/api/super-admin/storage/failures")
    _check(r.status_code == 200 and "items" in r.json(), "failures listing ok")
    r = client.post("/api/super-admin/storage/failures/retry")
    _check(r.status_code == 200 and r.json()["retried"] == 0,
           "retry-now endpoint runs (no candidates)")
    db._cols["storage_alerts"].docs.append({
        "id": "al_test", "kind": "t", "severity": "warning", "message": "m",
        "account_id": None, "acked": False, "occurrences": 1,
        "created_at": "2026-01-01", "last_seen_at": "2026-01-01"})
    r = client.get("/api/super-admin/storage/alerts")
    _check(len(r.json()["alerts"]) == 1, "alert listed")
    r = client.post("/api/super-admin/storage/alerts/al_test/ack")
    _check(r.json()["acked"] is True, "alert acknowledged")
    r = client.get("/api/super-admin/storage/alerts")
    _check(len(r.json()["alerts"]) == 0, "acked alert leaves the feed")

    print("9. overview")
    ov = client.get("/api/super-admin/storage/overview").json()
    _check(ov["accounts"] == 2 and ov["total_bytes"] == 2 * 15 * 1024 ** 4,
           "overview totals across the pool")
    _check("credentials_enc" not in str(ov), "no credential leakage anywhere")

    print("\nALL STORAGE POOL ENDPOINT CHECKS PASSED")


if __name__ == "__main__":
    main()
