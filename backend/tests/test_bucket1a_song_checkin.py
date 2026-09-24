"""
Bucket 1A — Song Requests, Check-Ins, Live Stream, Dress Code, Calendar
Backend regression suite.

This used to run against the seeded demo invitation and a profile id copied
from the old environment, on the assumption that the demo had every Bucket-1A
section switched on. Neither holds here: the id belongs to a row that does not
exist (404), and the demo seed leaves song_requests / check_in / live_stream /
dress_code OFF, so the feature tests failed with "not enabled for this
invitation" — a fixture mismatch reported as a product failure.

It now builds its own invitation, turns the features on through the admin API,
and deletes it afterwards. A test that needs a feature enabled should enable
it; depending on ambient seed state means the suite reports on the seed rather
than on the code.

The negative cases (feature OFF -> 403) also silently skipped for years: their
create payload was missing the required `event_type`, so every run hit
`pytest.skip("Could not create temp profile")` and asserted nothing. The
payload is shared now, so there is one place to be right.
"""
import os
import uuid
import pytest
import requests

from tests.live import login, require_live, create_profile_for

BASE_URL = require_live()

ADMIN_EMAIL = "admin@wedding.com"
ADMIN_PASSWORD = "admin123"


def new_wedding_payload(**overrides):
    """The minimum POST /api/admin/profiles accepts. `event_type`, `event_date`
    and `design_id` are required — omitting them is a 422, not a 200."""
    body = {
        "groom_name": f"TESTGroom{uuid.uuid4().hex[:6]}",
        "bride_name": f"TESTBride{uuid.uuid4().hex[:6]}",
        "event_type": "wedding",
        "event_date": "2026-12-12T00:00:00",
        "venue": "Test Hall",
        "city": "Bengaluru",
        "design_id": "royal_heritage",
        "invitation_category": "wedding",
    }
    body.update(overrides)
    return body


# ----------------------------- fixtures -----------------------------

@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(api):
    return login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def wedding(admin_headers):
    """An invitation with every Bucket-1A feature ON. Yields (slug, id).

    The server derives the slug from the couple's names and ignores a
    requested one, so read it back rather than assuming.
    """
    r = create_profile_for(admin_headers, new_wedding_payload())
    assert r.status_code in (200, 201), f"could not create fixture invitation: {r.status_code} {r.text[:300]}"
    created = r.json()
    pid, slug = created["id"], created["slug"]

    upd = requests.put(
        f"{BASE_URL}/api/admin/profiles/{pid}",
        json={
            "sections_enabled": {"song_requests": True, "check_in": True,
                                 "live_stream": True, "dress_code": True},
            "song_requests_settings": {"enabled": True, "max_per_guest": 3},
            "live_stream": {"platform": "youtube", "embed_enabled": True,
                            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
        },
        headers=admin_headers, timeout=30,
    )
    assert upd.status_code == 200, f"could not enable Bucket-1A features: {upd.text[:300]}"
    try:
        yield slug, pid
    finally:
        requests.delete(f"{BASE_URL}/api/admin/profiles/{pid}",
                        headers=admin_headers, timeout=30)


@pytest.fixture(scope="session")
def demo_slug(wedding):
    return wedding[0]


@pytest.fixture(scope="session")
def demo_profile_id(wedding):
    return wedding[1]


# ----------------------------- Invitation public view -----------------------------

class TestPublicInvitationView:
    """GET /api/invite/{slug} returns new Bucket 1A fields."""

    def test_invitation_public_view_has_new_fields(self, api, demo_slug):
        r = api.get(f"{BASE_URL}/api/invite/{demo_slug}")
        assert r.status_code == 200, r.text
        data = r.json()

        # new top-level fields
        assert "live_stream" in data, "live_stream missing"
        assert "song_requests_settings" in data, "song_requests_settings missing"
        assert "dress_code_settings" in data, "dress_code_settings missing"

        # sections_enabled toggles
        sec = data.get("sections_enabled") or {}
        for key in ("live_stream", "live_timeline", "song_requests", "dress_code", "check_in"):
            assert key in sec, f"sections_enabled.{key} missing"

        # demo profile expectations
        assert sec.get("song_requests") is True
        assert sec.get("check_in") is True
        assert sec.get("dress_code") is True
        assert sec.get("live_stream") is True

        srs = data.get("song_requests_settings") or {}
        assert srs.get("enabled") is True
        assert int(srs.get("max_per_guest", 0)) == 3

        ls = data.get("live_stream") or {}
        assert ls.get("platform") == "youtube"
        assert ls.get("embed_enabled") is True
        assert "youtube" in (ls.get("url") or "").lower()


# ----------------------------- Song Requests -----------------------------

class TestSongRequests:
    """POST /api/invite/{slug}/song-requests + GET /songs alias."""

    def test_post_song_request_valid(self, api, demo_slug):
        unique_guest = f"TEST_Guest_{uuid.uuid4().hex[:6]}"
        payload = {
            "guest_name": unique_guest,
            "guest_phone": f"+9100000{uuid.uuid4().int % 10000:04d}",
            "song_title": "TEST Tum Hi Ho",
            "artist": "Arijit Singh",
            "provider_url": "https://open.spotify.com/track/test",
            "message": "Please play this!"
        }
        r = api.post(f"{BASE_URL}/api/invite/{demo_slug}/song-requests", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data and isinstance(data["id"], str)
        assert data["guest_name"] == unique_guest
        assert data["song_title"] == "TEST Tum Hi Ho"
        assert data["artist"] == "Arijit Singh"
        assert data["provider_url"] == "https://open.spotify.com/track/test"
        assert "created_at" in data

    def test_post_song_request_empty_title_returns_422(self, api, demo_slug):
        r = api.post(f"{BASE_URL}/api/invite/{demo_slug}/song-requests", json={
            "guest_name": "TEST_Empty",
            "song_title": "   ",
        })
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"

    def test_post_song_request_rate_limit_429(self, api, demo_slug):
        """Same guest_name+phone exceeding max_per_guest=3 returns 429."""
        gname = f"TEST_RateLimit_{uuid.uuid4().hex[:6]}"
        phone = f"+91777{uuid.uuid4().int % 1000000:07d}"
        for i in range(3):
            r = api.post(f"{BASE_URL}/api/invite/{demo_slug}/song-requests", json={
                "guest_name": gname,
                "guest_phone": phone,
                "song_title": f"TEST song {i}",
            })
            assert r.status_code == 200, f"submission {i} failed: {r.status_code} {r.text}"

        # 4th should be blocked
        r4 = api.post(f"{BASE_URL}/api/invite/{demo_slug}/song-requests", json={
            "guest_name": gname,
            "guest_phone": phone,
            "song_title": "TEST overflow",
        })
        assert r4.status_code == 429, f"expected 429, got {r4.status_code}: {r4.text}"

    def test_post_song_request_disabled_profile_returns_403(self, api, admin_headers):
        """Create a throwaway profile with song_requests_settings.enabled=False."""
        # create temp profile
        rc = create_profile_for(admin_headers, new_wedding_payload())
        assert rc.status_code in (200, 201), f"could not create temp profile: {rc.status_code} {rc.text[:300]}"
        pid, slug = rc.json()["id"], rc.json()["slug"]
        try:
            # song_requests_settings defaults to enabled=False (per model), so POST should 403
            r = requests.post(f"{BASE_URL}/api/invite/{slug}/song-requests", json={
                "guest_name": "TEST_X",
                "song_title": "TEST blocked",
            })
            assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
        finally:
            requests.delete(f"{BASE_URL}/api/admin/profiles/{pid}", headers=admin_headers)

    def test_get_songs_alias_returns_list(self, api, demo_slug):
        r = api.get(f"{BASE_URL}/api/invite/{demo_slug}/songs")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # we've posted some TEST songs in earlier tests; list must be >=1
        if data:
            row = data[0]
            for key in ("id", "guest_name", "song_title", "created_at"):
                assert key in row


# ----------------------------- Admin song-requests -----------------------------

class TestAdminSongRequests:
    def test_admin_list_song_requests(self, api, admin_headers, demo_profile_id):
        r = requests.get(
            f"{BASE_URL}/api/admin/profiles/{demo_profile_id}/song-requests",
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)

    def test_admin_list_song_requests_requires_auth(self, api, demo_profile_id):
        r = api.get(f"{BASE_URL}/api/admin/profiles/{demo_profile_id}/song-requests")
        assert r.status_code in (401, 403), r.status_code

    def test_admin_delete_song_request(self, api, admin_headers, demo_slug, demo_profile_id):
        # create one, then delete it
        gname = f"TEST_DelTarget_{uuid.uuid4().hex[:6]}"
        cr = api.post(f"{BASE_URL}/api/invite/{demo_slug}/song-requests", json={
            "guest_name": gname,
            "song_title": "TEST delete me",
        })
        assert cr.status_code == 200, cr.text
        sid = cr.json()["id"]

        dr = requests.delete(
            f"{BASE_URL}/api/admin/song-requests/{sid}",
            headers=admin_headers,
        )
        assert dr.status_code == 200, dr.text
        assert dr.json().get("success") is True

        # verify gone
        lst = requests.get(
            f"{BASE_URL}/api/admin/profiles/{demo_profile_id}/song-requests",
            headers=admin_headers,
        ).json()
        assert all(row["id"] != sid for row in lst)


# ----------------------------- Check-Ins -----------------------------

class TestCheckIns:
    def test_check_in_valid(self, api, demo_slug):
        gname = f"TEST_CheckIn_{uuid.uuid4().hex[:6]}"
        phone = f"+91888{uuid.uuid4().int % 1000000:07d}"
        r = api.post(f"{BASE_URL}/api/invite/{demo_slug}/check-in", json={
            "guest_name": gname,
            "guest_phone": phone,
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data and "guest_name" in data and "created_at" in data
        assert data["guest_name"] == gname

        # idempotent within 30 minutes — same id should come back
        r2 = api.post(f"{BASE_URL}/api/invite/{demo_slug}/check-in", json={
            "guest_name": gname,
            "guest_phone": phone,
        })
        assert r2.status_code == 200, r2.text
        assert r2.json()["id"] == data["id"], "duplicate within 30min should return same id"

    def test_check_in_missing_name_returns_422(self, api, demo_slug):
        r = api.post(f"{BASE_URL}/api/invite/{demo_slug}/check-in", json={
            "guest_phone": "+910000000000",
        })
        assert r.status_code == 422, r.text

    def test_check_in_empty_name_returns_422(self, api, demo_slug):
        r = api.post(f"{BASE_URL}/api/invite/{demo_slug}/check-in", json={
            "guest_name": "   ",
        })
        assert r.status_code == 422, r.text

    def test_check_in_disabled_returns_403(self, api, admin_headers):
        """Create a profile with sections_enabled.check_in=False (default), test 403."""
        rc = create_profile_for(admin_headers, new_wedding_payload())
        assert rc.status_code in (200, 201), f"could not create temp profile: {rc.status_code} {rc.text[:300]}"
        pid, slug = rc.json()["id"], rc.json()["slug"]
        try:
            r = requests.post(f"{BASE_URL}/api/invite/{slug}/check-in", json={
                "guest_name": "TEST_BlockedGuest",
            })
            assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
        finally:
            requests.delete(f"{BASE_URL}/api/admin/profiles/{pid}", headers=admin_headers)


class TestAdminCheckIns:
    def test_admin_check_ins_list_with_stats(self, api, admin_headers, demo_profile_id):
        r = requests.get(
            f"{BASE_URL}/api/admin/profiles/{demo_profile_id}/check-ins",
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "check_ins" in data and isinstance(data["check_ins"], list)
        assert "stats" in data
        stats = data["stats"]
        assert "total_check_ins" in stats and isinstance(stats["total_check_ins"], int)
        assert "per_event" in stats and isinstance(stats["per_event"], dict)
        assert stats["total_check_ins"] == len(data["check_ins"])

    def test_admin_check_ins_requires_auth(self, api, demo_profile_id):
        r = api.get(f"{BASE_URL}/api/admin/profiles/{demo_profile_id}/check-ins")
        assert r.status_code in (401, 403)


# ----------------------------- Calendar ICS regression -----------------------------

class TestCalendarIcs:
    def test_calendar_ics_demo(self, api, demo_slug):
        r = api.get(f"{BASE_URL}/api/invite/{demo_slug}/calendar")
        assert r.status_code == 200, r.text
        ctype = r.headers.get("Content-Type", "")
        assert "text/calendar" in ctype, f"bad content-type: {ctype}"
        body = r.text
        assert "BEGIN:VCALENDAR" in body
        assert "END:VCALENDAR" in body
