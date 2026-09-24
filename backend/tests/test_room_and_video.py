"""
Find My Room + pre-wedding links.

  - GET  /api/invite/{slug}/room-lookup      (partial match, phone redacted)
  - GET  /api/invite/{slug}                  (guest_rooms + pre_wedding_links)
  - PUT  /api/admin/profiles/{id}            (both fields persist)

Rewritten August 2026. It used to point at the seeded demo invitation and a
profile id from the old environment. The id 404s here, and the demo has no
guest rooms at all, so the lookup tests failed on an empty list — a fixture
gap reported as a broken endpoint. The suite now creates its own invitation
with known rooms, which also lets the redaction check mean something: a room
is written WITH a phone number, so "no phone in the public payload" proves the
server strips it rather than proving no phone was ever stored.
"""
import uuid

import pytest
import requests

from tests.live import UA_HEADER, login, require_live, create_profile_for

BASE_URL = require_live()
ADMIN_EMAIL = "admin@wedding.com"
ADMIN_PASSWORD = "admin123"

UA = dict(UA_HEADER)

ROOMS = [
    {"guest_name": "Anil Sharma", "room_number": "101", "hotel_name": "Test Grand",
     "phone": "+919000000001", "map_link": "https://maps.google.com/?q=test"},
    {"guest_name": "Priya Kapoor", "room_number": "102", "hotel_name": "Test Grand",
     "phone": "+919000000002"},
]
LINKS = [
    {"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
     "label": "Pre-wedding film", "kind": "video"},
]


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json", **UA})
    return sess


@pytest.fixture(scope="module")
def admin_token():
    # Was a loop over four candidate login paths; only /api/auth/login exists.
    return login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", **UA}


@pytest.fixture(scope="module")
def wedding(s, admin_headers):
    """An invitation carrying the rooms and links these tests look for.
    Yields (slug, id) and deletes itself afterwards."""
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
    r = create_profile_for(admin_headers, body)
    assert r.status_code in (200, 201), f"could not create fixture: {r.status_code} {r.text[:300]}"
    created = r.json()
    pid, slug = created["id"], created["slug"]

    upd = requests.put(
        f"{BASE_URL}/api/admin/profiles/{pid}",
        json={"guest_rooms": ROOMS, "pre_wedding_links": LINKS,
              "sections_enabled": {"guest_rooms": True, "pre_wedding": True}},
        headers=admin_headers, timeout=30,
    )
    assert upd.status_code == 200, f"could not seed rooms/links: {upd.text[:300]}"
    try:
        yield slug, pid
    finally:
        requests.delete(f"{BASE_URL}/api/admin/profiles/{pid}",
                        headers=admin_headers, timeout=30)


@pytest.fixture(scope="module")
def slug(wedding):
    return wedding[0]


@pytest.fixture(scope="module")
def profile_id(wedding):
    return wedding[1]


# ---------- room-lookup ----------
class TestRoomLookup:
    def test_partial_match_shar(self, s, slug):
        r = s.get(f"{BASE_URL}/api/invite/{slug}/room-lookup", params={"name": "shar"})
        assert r.status_code == 200, r.text
        data = r.json()
        matches = data.get("matches") if isinstance(data, dict) else data
        assert isinstance(matches, list)
        assert len(matches) >= 1, f"no partial match for 'shar' in {ROOMS}"
        names = " ".join((m.get("guest_name") or "") for m in matches).lower()
        assert "sharma" in names
        for m in matches:
            assert "phone" not in m or m.get("phone") in (None, ""), \
                f"phone leaked in room-lookup: {m}"

    def test_partial_match_priy(self, s, slug):
        r = s.get(f"{BASE_URL}/api/invite/{slug}/room-lookup", params={"name": "priy"})
        assert r.status_code == 200
        data = r.json()
        matches = data.get("matches") if isinstance(data, dict) else data
        assert any("kapoor" in (m.get("guest_name") or "").lower()
                   or "priya" in (m.get("guest_name") or "").lower()
                   for m in matches), f"no match for 'priy': {matches}"

    def test_no_match(self, s, slug):
        r = s.get(f"{BASE_URL}/api/invite/{slug}/room-lookup", params={"name": "xyzqqq"})
        assert r.status_code == 200
        data = r.json()
        matches = data.get("matches") if isinstance(data, dict) else data
        assert matches == [] or matches is None or len(matches) == 0

    def test_short_name_400(self, s, slug):
        r = s.get(f"{BASE_URL}/api/invite/{slug}/room-lookup", params={"name": "a"})
        assert r.status_code in (400, 422), \
            f"expected 400/422 for 1-char name, got {r.status_code}: {r.text[:200]}"

    def test_bad_slug_404(self, s):
        r = s.get(f"{BASE_URL}/api/invite/nope-not-a-slug-xxx/room-lookup",
                  params={"name": "shar"})
        assert r.status_code == 404


# ---------- public invitation view ----------
class TestPublicInvitation:
    def test_public_has_rooms_and_videos(self, s, slug):
        r = s.get(f"{BASE_URL}/api/invite/{slug}")
        assert r.status_code == 200, r.text
        data = r.json()
        gr = data.get("guest_rooms")
        assert isinstance(gr, list) and len(gr) >= 2, f"guest_rooms missing or empty: {gr}"
        for room in gr:
            # Every seeded room HAS a phone, so this is a real redaction check.
            assert room.get("phone") in (None, ""), f"phone leaked in public response: {room}"
            assert room.get("guest_name")
        pw = data.get("pre_wedding_links")
        assert isinstance(pw, list) and len(pw) >= 1, f"pre_wedding_links missing: {pw}"
        assert pw[0].get("url"), "pre_wedding_link.url missing"


# ---------- admin PUT persistence ----------
class TestAdminProfileUpdate:
    def test_put_persists_rooms_and_links(self, s, admin_headers, slug, profile_id):
        r = s.get(f"{BASE_URL}/api/admin/profiles/{profile_id}", headers=admin_headers)
        assert r.status_code == 200, r.text
        current = r.json()

        marker = f"TEST_{uuid.uuid4().hex[:6]}"
        new_room = {
            "guest_name": f"TEST Guest {marker}",
            "room_number": "999",
            "hotel_name": "Test Hotel",
            "phone": "+910000000000",
            "map_link": "https://maps.google.com/?q=test",
        }
        new_link = {
            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "label": f"Test Video {marker}",
            "kind": "video",
        }
        existing_rooms = current.get("guest_rooms") or []
        existing_links = current.get("pre_wedding_links") or []

        r = s.put(f"{BASE_URL}/api/admin/profiles/{profile_id}", headers=admin_headers,
                  json={"guest_rooms": existing_rooms + [new_room],
                        "pre_wedding_links": existing_links + [new_link]})
        assert r.status_code in (200, 201), f"PUT failed {r.status_code}: {r.text[:400]}"

        after = s.get(f"{BASE_URL}/api/admin/profiles/{profile_id}",
                      headers=admin_headers).json()
        rooms_after = after.get("guest_rooms") or []
        links_after = after.get("pre_wedding_links") or []
        assert any(rm.get("guest_name", "").endswith(marker) for rm in rooms_after), \
            f"new room not persisted: {rooms_after}"
        assert any((lk.get("label") or "").endswith(marker) for lk in links_after), \
            f"new link not persisted: {links_after}"

        pub = s.get(f"{BASE_URL}/api/invite/{slug}").json()
        for room in pub.get("guest_rooms") or []:
            assert room.get("phone") in (None, ""), f"phone leaked publicly: {room}"

        s.put(f"{BASE_URL}/api/admin/profiles/{profile_id}", headers=admin_headers,
              json={"guest_rooms": existing_rooms, "pre_wedding_links": existing_links})


# ---------- the retired normal-user create path ----------
class TestUserProfileCreateAcceptsNewFields:
    def test_user_profile_create_is_retired(self, s):
        """This asserted that POST /api/users/profiles did not 422 on the new
        fields. Normal user accounts are retired, so the route answers 410
        before any validation runs — the check is now that it stays retired."""
        r = s.post(f"{BASE_URL}/api/users/profiles", json={
            "groom_name": "TestGroom",
            "bride_name": "TestBride",
            "guest_rooms": [{"guest_name": "X", "room_number": "1"}],
            "pre_wedding_links": [{"url": "https://youtu.be/abc", "kind": "video"}],
        })
        assert r.status_code == 410, f"expected 410, got {r.status_code}: {r.text[:300]}"
        assert (r.json().get("detail") or {}).get("code") == "NORMAL_USERS_RETIRED"
