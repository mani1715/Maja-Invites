"""
Sequential invite numbers + canonical public URLs — live regression.

Covers the 2026-08 URL-architecture work:
  • create_profile assigns a sequential public number (00001, 00002, …), atomic
    under concurrency (copy/template paths get a FRESH number, never inherit).
  • /invite/{number}/full resolves the same profile as /invite/{slug}/full and
    returns canonical_url / face_match_url built from PUBLIC_BASE_URL — never the
    request Host, never the VM IP.
  • A forged Host header cannot change the canonical public URL.
  • Sequential numbers do NOT enumerate drafts (is_published:False → 404 by
    number, while the random slug still resolves).
  • Legacy profiles with no invite_no still resolve by slug.

Pure-function checks (slugify_name / invite_code) run with no server.
HTTP checks need a running backend (require_live) + live_db to seed. The
canonical-URL assertions are gated on the backend actually having PUBLIC_BASE_URL
set (its /full payload exposes it as public_base); run the backend with
PUBLIC_BASE_URL=https://majainvites.com to exercise them fully.

    PYTHONIOENCODING=utf-8 python -m pytest backend/tests/test_invite_numbering_urls.py -q
"""
from __future__ import annotations

import re
import uuid
import asyncio
from concurrent.futures import ThreadPoolExecutor

import pytest
import requests

from tests.live import (require_live, login, create_profile_for, new_wedding_payload,
                        delete_wedding, live_db, UA_HEADER)

BASE_URL = require_live()
STUDIO_EMAIL = "admin@wedding.com"
STUDIO_PASSWORD = "admin123"
IP_RE = re.compile(r"https?://\d{1,3}(\.\d{1,3}){3}")


# ---------------------------------------------------------------- pure units
def test_slugify_name_is_url_safe():
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
    from url_utils import slugify_name
    assert slugify_name("Sai Sai T & Sai 1C") == "sai-sai-t-sai-1c"
    assert slugify_name("../../etc/passwd") == "etc-passwd"          # no traversal
    assert slugify_name("  <script>x</script> ") == "script-x-script"
    assert slugify_name("వంశీ & సాహితి") == "invite"                 # non-ASCII → fallback
    assert slugify_name("") == "invite"
    assert len(slugify_name("a" * 200)) <= 64


def test_invite_code_zero_pads():
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
    from invite_number import invite_code
    assert invite_code(1) == "00001"
    assert invite_code(42) == "00042"
    assert invite_code(100000) == "100000"   # min-width, does not truncate
    assert invite_code(None) == ""
    assert invite_code(0) == ""


# ---------------------------------------------------------------- helpers
def _headers():
    tok = login(STUDIO_EMAIL, STUDIO_PASSWORD)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _full(identifier, extra_headers=None):
    # The direct endpoint returns InvitationPublicView flat (invite_no,
    # invite_code, canonical_url, … at top level). /invite/{id}/full nests it
    # under "invite"; both share _build_invitation_public_view + the numeric
    # resolver, so the direct one is what we assert field-by-field.
    return requests.get(f"{BASE_URL}/api/invite/{identifier}",
                        headers={**UA_HEADER, **(extra_headers or {})}, timeout=30)


def _create(headers):
    r = create_profile_for(headers, new_wedding_payload())
    assert r.status_code in (200, 201), f"create: {r.status_code} {r.text[:200]}"
    return r.json()["slug"], r.json()["id"]


# ---------------------------------------------------------------- HTTP tests
def test_number_assigned_and_resolves_like_slug():
    headers = _headers()
    slug, pid = _create(headers)
    try:
        by_slug = _full(slug)
        assert by_slug.status_code == 200, by_slug.text[:200]
        body = by_slug.json()
        code = body.get("invite_code")
        assert body.get("invite_no") and code and re.fullmatch(r"\d{5,}", code), body.get("invite_no")

        by_num = _full(code)
        assert by_num.status_code == 200
        assert by_num.json()["slug"] == slug          # number → same profile

        base = body.get("public_base")
        if base:                                        # backend has PUBLIC_BASE_URL set
            assert body["canonical_url"].startswith(base)
            assert body["face_match_url"] == f"{base}/invite/{code}/find-my-photos"
            for u in (body["canonical_url"], body["face_match_url"]):
                assert not IP_RE.match(u), f"public URL is an IP: {u}"
                assert "localhost" not in u
    finally:
        delete_wedding(headers, pid)


def test_host_header_cannot_change_canonical():
    headers = _headers()
    slug, pid = _create(headers)
    try:
        base = _full(slug).json().get("public_base")
        if not base:
            pytest.skip("backend has no PUBLIC_BASE_URL set; host-safety assertion needs it")
        forged = _full(slug, {"Host": "evil.example.com", "X-Forwarded-Host": "evil.example.com"})
        assert forged.status_code == 200
        cu = forged.json()["canonical_url"]
        assert cu.startswith(base) and "evil.example.com" not in cu
    finally:
        delete_wedding(headers, pid)


def test_by_number_endpoint():
    headers = _headers()
    slug, pid = _create(headers)
    try:
        code = _full(slug).json()["invite_code"]
        r = requests.get(f"{BASE_URL}/api/invite/by-number/{code}", headers=UA_HEADER, timeout=30)
        assert r.status_code == 200
        assert r.json()["slug"] == slug
        # a nonexistent number is a uniform 404
        assert requests.get(f"{BASE_URL}/api/invite/by-number/999999999",
                            headers=UA_HEADER, timeout=30).status_code == 404
    finally:
        delete_wedding(headers, pid)


def test_concurrent_creates_get_distinct_numbers():
    headers = _headers()
    N = 12
    results = []
    with ThreadPoolExecutor(max_workers=N) as ex:
        futs = [ex.submit(create_profile_for, headers, new_wedding_payload()) for _ in range(N)]
        for f in futs:
            r = f.result()
            assert r.status_code in (200, 201), f"concurrent create: {r.status_code} {r.text[:160]}"
            results.append((r.json()["slug"], r.json()["id"]))
    try:
        numbers = []
        for slug, _ in results:
            b = _full(slug).json()
            numbers.append(b["invite_no"])
        assert len(set(numbers)) == N, f"duplicate invite_no under concurrency: {sorted(numbers)}"
    finally:
        for _, pid in results:
            delete_wedding(headers, pid)


def test_draft_not_enumerable_by_number_but_slug_still_previews():
    """A sequential number must not expose an unpublished draft; the random slug
    still previews it (owner-shared)."""
    headers = _headers()
    slug, pid = _create(headers)
    try:
        code = _full(slug).json()["invite_code"]

        async def _mark_draft():
            db = live_db(); await db.ensure_connected()
            await db.profiles.update_one({"id": pid}, {"$set": {"is_published": False}})
        asyncio.run(_mark_draft())

        assert _full(code).status_code == 404, "draft must be hidden BY NUMBER"
        assert requests.get(f"{BASE_URL}/api/invite/by-number/{code}",
                            headers=UA_HEADER, timeout=30).status_code == 404
        assert _full(slug).status_code == 200, "draft still previews by its random slug"
    finally:
        delete_wedding(headers, pid)


def test_legacy_profile_without_number_still_resolves():
    """Back-compat: a row that predates numbering (no invite_no) resolves by slug
    and does not 500."""
    headers = _headers()
    slug, pid = _create(headers)
    try:
        async def _strip():
            db = live_db(); await db.ensure_connected()
            await db.profiles.update_one({"id": pid}, {"$unset": {"invite_no": "", "name_slug": ""}})
        asyncio.run(_strip())
        r = _full(slug)
        assert r.status_code == 200
        assert r.json().get("invite_no") in (None, 0)
    finally:
        delete_wedding(headers, pid)


if __name__ == "__main__":
    test_slugify_name_is_url_safe()
    test_invite_code_zero_pads()
    print("OK pure units")
