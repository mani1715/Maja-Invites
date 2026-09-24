"""Phase 12 — the photographer upload URL is a direct-to-S3 URL, never the VM.

The architecture requires: browser -> presigned S3 PUT, NOT browser -> VM -> S3
(no byte-proxying of large photographer uploads). This pins that contract:
presign-upload's `upload_url` points at S3 (an amazonaws / bucket host), never at
the app/VM origin. Skips cleanly where S3 is not configured (local dev without
AWS) or the quota blocks — the URL HOST is the contract under test, not the
quota."""
from __future__ import annotations

from urllib.parse import urlparse

import pytest
import requests

from tests.live import require_live, login, create_wedding, delete_wedding, UA_HEADER

BASE_URL = require_live()
OWNER_EMAIL, OWNER_PASS = "admin@wedding.com", "admin123"


def _jh(tok):
    return {**UA_HEADER, "Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner():
    tok = login(OWNER_EMAIL, OWNER_PASS)
    slug, pid = create_wedding(_jh(tok))
    yield tok, pid
    delete_wedding(_jh(tok), pid)


def test_presign_upload_url_is_s3_not_vm(owner):
    tok, pid = owner
    r = requests.post(f"{BASE_URL}/api/admin/profiles/{pid}/gallery/presign-upload",
                      json={"filename": "p.jpg", "content_type": "image/jpeg", "size_bytes": 500000},
                      headers=_jh(tok), timeout=20)
    if r.status_code == 503:
        pytest.skip("S3 not configured here (S3_UNCONFIGURED) — nothing to assert")
    if r.status_code == 409:
        pytest.skip("gallery quota blocks presign here; the URL host is the contract, not the quota")
    assert r.status_code == 200, f"presign failed: {r.status_code} {r.text[:200]}"

    url = r.json().get("upload_url", "")
    host = urlparse(url).netloc.lower()
    vm_host = urlparse(BASE_URL).netloc.lower()

    assert url.startswith("https://"), f"upload URL is not https: {url[:80]}"
    assert "s3" in host or "amazonaws" in host, f"upload URL host is not S3: {host}"
    assert host != vm_host and "localhost" not in host and "127.0.0.1" not in host, \
        f"upload URL points at the VM/app, not S3: {host}"
