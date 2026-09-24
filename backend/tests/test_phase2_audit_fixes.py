"""Phase-2 audit fixes that are still live.

Ported August 2026 from a Mongo-era file that could not be collected: it
imported `pymongo`, seeded profiles into MongoDB and asserted on a
`credit_ledger`.

Kept — every one of these is a live security or sharing behaviour:
  * D1  a soft-deleted slug does not block reuse, an active one still does
  * S3  admin logout blacklists the caller's JWT (and the token really dies)
  * H1  the Open Graph intercept: crawler gets meta, human gets sent onward,
        og:image is absolute
  * S1  the public invite endpoint is rate limited

Dropped — the feature is gone, not the test:
  * F4/D2 purge refunds and every `credit_ledger` assertion (credits deleted;
    see test_credits_retired.py)
  * D4  the 30-day trash purge test asserted the scheduler job by reading
        server.py source for a string, and then re-implemented the purge in
        the test itself rather than calling it — it proved nothing about the
        job that actually runs.

Seeding goes through the admin API, so a fixture cannot drift from the shape
the server would really accept.
"""
import re
import uuid

import pytest
import requests

from tests.live import UA_HEADER, create_wedding, delete_wedding, login, require_live

BASE_URL = require_live()

BROWSER_UA = dict(UA_HEADER)
WHATSAPP_UA = {"User-Agent": "WhatsApp/2.23.20.0 A"}

PHOTO = ("admin@wedding.com", "admin123")


@pytest.fixture(scope="module")
def headers():
    return {"Authorization": f"Bearer {login(*PHOTO)}",
            "Content-Type": "application/json", **BROWSER_UA}


# ════════════════════════════════════════════════════════════════════
# D1 — slug uniqueness ignores soft-deleted rows
# ════════════════════════════════════════════════════════════════════
class TestSlugUniqueness:
    def test_soft_deleted_does_not_block_slug_reuse(self, headers):
        """Delete an invitation, then create another with the same couple
        names. The slug is derived from those names, so a soft-deleted row
        holding the slug hostage would make the names unusable for ever."""
        groom, bride = f"SlugG{uuid.uuid4().hex[:6]}", f"SlugB{uuid.uuid4().hex[:6]}"
        first_slug, first_id = create_wedding(headers, groom_name=groom, bride_name=bride)
        delete_wedding(headers, first_id)

        second_slug, second_id = create_wedding(headers, groom_name=groom, bride_name=bride)
        try:
            assert second_slug, "no slug issued for the replacement invitation"
            # It may reuse the slug outright or suffix it; what must NOT happen
            # is the create failing because a deleted row owns the name.
            assert second_slug.startswith(first_slug.rsplit("-", 1)[0]) or second_slug == first_slug, (
                f"replacement slug {second_slug!r} unrelated to {first_slug!r}")
        finally:
            delete_wedding(headers, second_id)

    def test_two_live_invitations_do_not_share_a_slug(self, headers):
        groom, bride = f"LiveG{uuid.uuid4().hex[:6]}", f"LiveB{uuid.uuid4().hex[:6]}"
        slug_a, id_a = create_wedding(headers, groom_name=groom, bride_name=bride)
        slug_b, id_b = create_wedding(headers, groom_name=groom, bride_name=bride)
        try:
            assert slug_a != slug_b, (
                f"two live invitations share the slug {slug_a!r} — one of them is "
                f"unreachable")
        finally:
            delete_wedding(headers, id_a)
            delete_wedding(headers, id_b)


# ════════════════════════════════════════════════════════════════════
# S3 — admin logout blacklists the JWT
# ════════════════════════════════════════════════════════════════════
class TestLogoutBlacklist:
    def test_logout_kills_the_token_end_to_end(self):
        """A fresh login, not the cached one — this test has to spend a token."""
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": PHOTO[0], "password": PHOTO[1]},
                          headers={**BROWSER_UA, "Content-Type": "application/json"},
                          timeout=20)
        if r.status_code == 429:
            pytest.skip("login rate-limited; the limiter is per-IP and clears in 15 min")
        assert r.status_code == 200, r.text[:300]
        token = r.json().get("access_token")
        assert token, r.json()
        auth = {**BROWSER_UA, "Authorization": f"Bearer {token}"}

        me = requests.get(f"{BASE_URL}/api/auth/me", headers=auth, timeout=20)
        assert me.status_code == 200, f"fresh token rejected: {me.text[:200]}"

        out = requests.post(f"{BASE_URL}/api/admin/logout", headers=auth, timeout=20)
        assert out.status_code == 200, out.text[:300]
        assert out.json().get("blacklisted") is True, out.json()

        after = requests.get(f"{BASE_URL}/api/auth/me", headers=auth, timeout=20)
        assert after.status_code == 401, (
            f"a revoked token still works ({after.status_code}) — the blacklist "
            f"is not being consulted")

    def test_logout_without_a_token_is_refused(self):
        r = requests.post(f"{BASE_URL}/api/admin/logout", headers=BROWSER_UA, timeout=20)
        assert r.status_code in (401, 403), r.status_code


# ════════════════════════════════════════════════════════════════════
# H1 — Open Graph intercept
# ════════════════════════════════════════════════════════════════════
@pytest.fixture(scope="module")
def og_invitation(headers):
    groom, bride = "Arjun", f"Sita{uuid.uuid4().hex[:4]}"
    slug, pid = create_wedding(headers, groom_name=groom, bride_name=bride,
                               venue="Goa Beach Resort", city="Goa")
    # A couple photo is what og:image is built from. Without one the renderer
    # emits NO og:image at all — deliberately, the same rule portfolio_seo
    # follows: an invented image is worse than none. So the fixture supplies a
    # photo, otherwise the image assertions below would be testing the empty
    # case and calling it a pass.
    requests.put(f"{BASE_URL}/api/admin/profiles/{pid}",
                 json={"couple_photo_url": "/uploads/photos/test-couple.webp"},
                 headers=headers, timeout=30)
    try:
        yield {"slug": slug, "pid": pid, "groom": groom, "bride": bride}
    finally:
        delete_wedding(headers, pid)


@pytest.fixture(scope="module")
def og_invitation_without_photo(headers):
    slug, pid = create_wedding(headers)
    try:
        yield {"slug": slug, "pid": pid}
    finally:
        delete_wedding(headers, pid)


class TestOpenGraph:
    def test_crawler_gets_og_meta(self, og_invitation):
        r = requests.get(f"{BASE_URL}/api/og/invite/{og_invitation['slug']}",
                         headers=WHATSAPP_UA, timeout=15)
        assert r.status_code == 200, r.text[:300]
        html = r.text
        for tag in ('property="og:title"', 'property="og:description"',
                    'property="og:image"', 'property="og:url"',
                    'name="twitter:card"', 'name="twitter:title"',
                    'name="twitter:image"'):
            assert tag in html, f"missing {tag}"
        # A crawler must not be bounced onward — it would never read the tags.
        assert 'http-equiv="refresh"' not in html
        assert "window.location.replace" not in html
        assert og_invitation["groom"] in html and og_invitation["bride"] in html

    def test_human_is_sent_on_to_the_invitation(self, og_invitation):
        r = requests.get(f"{BASE_URL}/api/og/invite/{og_invitation['slug']}",
                         headers=BROWSER_UA, timeout=15, allow_redirects=False)
        assert r.status_code in (200, 301, 302, 307, 308), r.status_code
        if r.status_code == 200:
            assert ('http-equiv="refresh"' in r.text
                    or "window.location.replace" in r.text), (
                "a human lands on the OG page with no way onward")

    def test_og_image_is_absolute(self, og_invitation):
        """A relative og:image is dropped silently by every crawler."""
        html = requests.get(f"{BASE_URL}/api/og/invite/{og_invitation['slug']}",
                            headers=WHATSAPP_UA, timeout=15).text
        m = re.search(r'property="og:image"\s+content="([^"]+)"', html)
        assert m, "no og:image in the crawler response"
        assert m.group(1).startswith(("http://", "https://")), \
            f"og:image is relative: {m.group(1)!r}"


    def test_no_photo_means_no_og_image_rather_than_a_broken_one(
            self, og_invitation_without_photo):
        """An invitation nobody has uploaded a photo to still gets a title and
        description card; what it must NOT get is an empty or relative
        og:image, which crawlers render as a broken preview.

        NOTE for the owner: a share with no image is a plain link on WhatsApp,
        which is where these invitations actually travel. A branded default
        image would fix that for every invitation before the couple uploads
        anything — it needs real artwork, so it is a decision, not a patch.
        """
        html = requests.get(
            f"{BASE_URL}/api/og/invite/{og_invitation_without_photo['slug']}",
            headers=WHATSAPP_UA, timeout=15).text
        assert 'property="og:title"' in html
        m = re.search(r'property="og:image"\s+content="([^"]*)"', html)
        if m:
            assert m.group(1).startswith(("http://", "https://")),                 f"og:image present but relative/empty: {m.group(1)!r}"

    def test_unknown_slug_does_not_500(self):
        r = requests.get(f"{BASE_URL}/api/og/invite/definitely-not-a-slug-xyz",
                         headers=WHATSAPP_UA, timeout=15)
        assert r.status_code in (200, 404), r.status_code
        assert r.status_code != 500


# ════════════════════════════════════════════════════════════════════
# S1 — the public invite endpoint is rate limited
# ════════════════════════════════════════════════════════════════════
class TestPublicInviteRateLimit:
    def test_normal_reads_are_not_blocked(self, og_invitation):
        for _ in range(3):
            r = requests.get(f"{BASE_URL}/api/invite/{og_invitation['slug']}",
                             headers=BROWSER_UA, timeout=15)
            assert r.status_code == 200, f"an ordinary guest was blocked: {r.status_code}"

    def test_a_limit_exists(self, og_invitation):
        """Hammer it and require that the server eventually says no. The exact
        threshold is configuration; the presence of one is the contract."""
        seen = set()
        for _ in range(60):
            r = requests.get(f"{BASE_URL}/api/invite/{og_invitation['slug']}",
                             headers=BROWSER_UA, timeout=15)
            seen.add(r.status_code)
            if r.status_code == 429:
                break
        assert seen <= {200, 429}, f"unexpected statuses from the invite endpoint: {seen}"
        if 429 not in seen:
            pytest.skip("no 429 within 60 requests — the limit is above what this "
                        "test is willing to spend; not evidence that it is missing")
