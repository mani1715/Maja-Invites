"""Publishing is atomic: two clicks, one publish.

Ported August 2026 from a Mongo-era file that could not be collected (it
imported `pymongo` and talked to localhost:27017) and whose five tests were
mostly about a feature that no longer exists.

Kept — still live and still worth protecting:
  1. Double-click publish. `POST /api/weddings/{id}/publish` claims the row
     with a single atomic find_one_and_update before doing anything else, so
     two simultaneous requests must produce exactly one publish.
  2. The bulk-action path must not be a way around that claim.

Dropped — the feature is gone, not the test:
  * gift-code redemption race (`/api/account/redeem-code` — no such route),
  * Razorpay verify-payment double-credit (`/api/payments/verify-payment` —
    no such route; the live payment path is `payments`, whose uniqueness is
    enforced by a UNIQUE index in the schema),
  * bulk-purge refund and every `credit_ledger` / wallet assertion — credits
    were deleted, and `test_credits_retired.py` asserts that end state.

This file caught a real one on its first run after the port: publish answered
500 for every request, because `pg_adapter.find_one_and_update` returned the
jsonb column as raw JSON TEXT instead of decoding it, and the service then did
`wedding.get('title')` on a str. The atomic claim at the heart of this test
was the thing that broke.
"""
import asyncio

import httpx
import pytest
import requests

from tests.live import UA_HEADER, create_wedding, delete_wedding, login, require_live

BASE_URL = require_live()
UA = dict(UA_HEADER)

PHOTO_EMAIL = "admin@wedding.com"
PHOTO_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def headers():
    return {"Authorization": f"Bearer {login(PHOTO_EMAIL, PHOTO_PASSWORD)}",
            "Content-Type": "application/json", **UA}


def _status(headers, pid):
    r = requests.get(f"{BASE_URL}/api/admin/profiles/paginated?page=1&page_size=100&status=all",
                     headers=headers, timeout=30)
    r.raise_for_status()
    row = next((i for i in r.json().get("items", []) if i.get("id") == pid), None)
    return (row or {}).get("status", "").lower()


@pytest.mark.asyncio
async def test_double_click_publish_publishes_once(headers):
    """Two concurrent publishes: one 200, one 4xx. Never two 200s."""
    slug, pid = create_wedding(headers)
    try:
        url = f"{BASE_URL}/api/weddings/{pid}/publish"
        async with httpx.AsyncClient(timeout=60) as cli:
            r1, r2 = await asyncio.gather(
                cli.post(url, headers=headers),
                cli.post(url, headers=headers),
                return_exceptions=True,
            )
        results = [r for r in (r1, r2) if not isinstance(r, Exception)]
        codes = sorted(r.status_code for r in results)
        assert len(results) == 2, f"a request raised: {r1!r} {r2!r}"

        successes = [r for r in results if r.status_code == 200]
        assert len(successes) == 1, (
            f"expected exactly one publish to win, got codes={codes} "
            f"bodies={[r.text[:200] for r in results]}")
        loser = next(r for r in results if r.status_code != 200)
        assert loser.status_code == 400, (
            f"the losing request should be a clean 400, got {loser.status_code}: "
            f"{loser.text[:200]}")
        # A 500 here means the failure is a crash, not the lock doing its job.
        assert loser.status_code != 500

        assert _status(headers, pid) == "published"
    finally:
        delete_wedding(headers, pid)


@pytest.mark.asyncio
async def test_publish_is_idempotent_after_the_fact(headers):
    """Publishing an already-published wedding is refused, not repeated."""
    slug, pid = create_wedding(headers)
    try:
        first = requests.post(f"{BASE_URL}/api/weddings/{pid}/publish",
                              headers=headers, timeout=60)
        assert first.status_code == 200, f"first publish failed: {first.text[:300]}"

        second = requests.post(f"{BASE_URL}/api/weddings/{pid}/publish",
                               headers=headers, timeout=60)
        assert second.status_code == 400, (
            f"re-publish should be refused with 400, got {second.status_code}: "
            f"{second.text[:200]}")
        assert "already published" in second.text.lower(), second.text[:200]
    finally:
        delete_wedding(headers, pid)


def test_bulk_action_is_not_a_publish_backdoor(headers):
    """Whatever bulk-action does with `publish`, it must not leave a wedding in
    a state the single-wedding path would have refused — and it must not error
    its way into a half-published row."""
    slug, pid = create_wedding(headers)
    try:
        r = requests.post(f"{BASE_URL}/api/admin/profiles/bulk-action",
                          headers=headers, json={"ids": [pid], "action": "publish"},
                          timeout=120)
        assert r.status_code in (200, 400, 403, 404, 422), \
            f"unexpected bulk-action status {r.status_code}: {r.text[:300]}"

        status = _status(headers, pid)
        assert status in ("draft", "published"), f"wedding left in {status!r} by bulk-action"

        if status == "published":
            # If bulk-action can publish, the single path must then refuse to
            # publish it again — i.e. both routes agree on the same state.
            again = requests.post(f"{BASE_URL}/api/weddings/{pid}/publish",
                                  headers=headers, timeout=60)
            assert again.status_code == 400, (
                f"bulk-published wedding can be published AGAIN via the single "
                f"path ({again.status_code}) — the two paths disagree")
    finally:
        delete_wedding(headers, pid)
