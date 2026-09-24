"""
Backend tests for admin_dashboard_v2 (Bucket 1) endpoints.
Covers: paginated listing, filters, sort, search, bulk actions,
trash flow (list/restore/purge), quick edit, tags CRUD, quick-stats,
CSV export, notifications.
"""
import os
import pytest
import requests

from tests.live import login, require_live

BASE_URL = require_live()

API = f"{BASE_URL}/api"

# `studio.test@majacreations.com` belongs to the old environment and 401s here.
# The whole file therefore hit `pytest.skip("Admin login failed")` on every run
# and asserted nothing at all — 20-odd dashboard tests that looked green because
# they never executed. This is the seeded photographer (CLAUDE.md), who owns the
# demo weddings these tests page through.
LOGIN_EMAIL = "admin@wedding.com"
LOGIN_PWD = "admin123"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="session")
def admin_token():
    return login(LOGIN_EMAIL, LOGIN_PWD)


@pytest.fixture(scope="session")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def first_profile_id(auth_headers):
    r = requests.get(
        f"{API}/admin/profiles/paginated?page=1&page_size=12&status=all",
        headers=auth_headers, timeout=30,
    )
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    if not items:
        pytest.skip("No profiles available for this admin to test against")
    return items[0]["id"]


# ---------------- Paginated listing ----------------
class TestPaginated:
    def test_default_paginated(self, auth_headers):
        r = requests.get(f"{API}/admin/profiles/paginated", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("items", "total", "page", "page_size", "total_pages"):
            assert k in d, f"missing key {k}"
        assert d["page"] == 1
        assert d["page_size"] == 12
        assert isinstance(d["items"], list)

    @pytest.mark.parametrize("status", ["all", "draft", "published", "archived", "expiring", "trash"])
    def test_status_filters(self, auth_headers, status):
        r = requests.get(
            f"{API}/admin/profiles/paginated?page=1&page_size=12&status={status}",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, f"{status}: {r.text}"
        assert isinstance(r.json().get("items"), list)

    @pytest.mark.parametrize("sort", ["newest", "oldest", "date_asc", "date_desc", "most_viewed", "name_asc"])
    def test_sort_modes(self, auth_headers, sort):
        r = requests.get(
            f"{API}/admin/profiles/paginated?page=1&page_size=12&sort={sort}",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, f"{sort}: {r.text}"

    def test_search_query(self, auth_headers):
        r = requests.get(
            f"{API}/admin/profiles/paginated?page=1&page_size=12&q=Arjun",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        # Items should match (case insensitive) bride or groom name containing "Arjun"
        items = r.json()["items"]
        assert isinstance(items, list)

    def test_pagination_page_size(self, auth_headers):
        r = requests.get(
            f"{API}/admin/profiles/paginated?page=1&page_size=1",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["page_size"] == 1
        assert len(d["items"]) <= 1


# ---------------- Tags ----------------
class TestTags:
    def test_get_tags(self, auth_headers):
        r = requests.get(f"{API}/admin/tags", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        # Either list or dict with tags key — accept both shapes but require iterable
        assert isinstance(body, (list, dict))

    def test_patch_tags(self, auth_headers, first_profile_id):
        r = requests.patch(
            f"{API}/admin/profiles/{first_profile_id}/tags",
            headers=auth_headers,
            json={"tags": ["TEST_priority", "TEST_vip"]},
            timeout=30,
        )
        assert r.status_code == 200, r.text


# ---------------- Quick edit ----------------
class TestQuickEdit:
    def test_quick_edit_partial(self, auth_headers, first_profile_id):
        payload = {"bride_name": "Meera", "tags": ["TEST_qe"]}
        r = requests.patch(
            f"{API}/admin/profiles/{first_profile_id}/quick",
            headers=auth_headers, json=payload, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "updated_fields" in data
        assert "bride_name" in data["updated_fields"]
        assert "tags" in data["updated_fields"]


# ---------------- Quick stats ----------------
class TestQuickStats:
    def test_quick_stats_shape(self, auth_headers, first_profile_id):
        r = requests.get(
            f"{API}/admin/profiles/{first_profile_id}/quick-stats",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("views", "unique_visitors", "rsvps", "wishes", "gallery_views"):
            assert k in d, f"missing stat field {k}"
        # `credits_spent` went with the credit system. Asserting its absence
        # keeps a retired money field from reappearing on a studio's card.
        assert "credits_spent" not in d, "credits_spent is back on quick-stats"


# ---------------- CSV export ----------------
class TestCsvExport:
    def test_export_csv(self, auth_headers):
        r = requests.get(
            f"{API}/admin/profiles/export.csv",
            headers={"Authorization": auth_headers["Authorization"]},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:200]
        cd = r.headers.get("Content-Disposition", "")
        assert "attachment" in cd.lower() and "weddings.csv" in cd, cd
        # Header line at minimum
        text = r.text
        assert "\n" in text or "," in text
        lines = [l for l in text.split("\n") if l.strip()]
        assert len(lines) >= 1


# ---------------- Notifications ----------------
class TestNotifications:
    def test_notifications_list(self, auth_headers):
        r = requests.get(f"{API}/admin/notifications", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text

    def test_notifications_unread_count(self, auth_headers):
        r = requests.get(
            f"{API}/admin/notifications/unread-count",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        # Should have some numeric field
        assert isinstance(d, dict)


# ---------------- Bulk actions + Trash flow ----------------
class TestBulkAndTrash:
    """End-to-end: pick a profile, bulk-archive -> bulk-unarchive,
    bulk-delete -> trash -> restore -> purge guard."""

    def test_bulk_archive_unarchive(self, auth_headers, first_profile_id):
        r = requests.post(
            f"{API}/admin/profiles/bulk-action",
            headers=auth_headers,
            json={"ids": [first_profile_id], "action": "archive"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "matched" in d and "modified" in d
        # unarchive back
        r2 = requests.post(
            f"{API}/admin/profiles/bulk-action",
            headers=auth_headers,
            json={"ids": [first_profile_id], "action": "unarchive"},
            timeout=30,
        )
        assert r2.status_code == 200, r2.text

    def test_bulk_publish_unpublish(self, auth_headers, first_profile_id):
        # Capture current status to restore later
        r = requests.get(
            f"{API}/admin/profiles/paginated?page=1&page_size=12&status=all",
            headers=auth_headers, timeout=30,
        )
        items = r.json()["items"]
        cur = next((i for i in items if i["id"] == first_profile_id), None)
        original_status = (cur or {}).get("status", "DRAFT")

        for action in ("publish", "unpublish"):
            r = requests.post(
                f"{API}/admin/profiles/bulk-action",
                headers=auth_headers,
                json={"ids": [first_profile_id], "action": action},
                timeout=30,
            )
            assert r.status_code == 200, f"{action}: {r.text}"

        # Restore to original
        restore_action = "publish" if original_status == "PUBLISHED" else "unpublish"
        requests.post(
            f"{API}/admin/profiles/bulk-action",
            headers=auth_headers,
            json={"ids": [first_profile_id], "action": restore_action},
            timeout=30,
        )

    def test_purge_requires_trash(self, auth_headers, first_profile_id):
        """Purging an item that is NOT in trash should return 400."""
        r = requests.delete(
            f"{API}/admin/profiles/{first_profile_id}/purge",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_trash_restore_flow(self, auth_headers, first_profile_id):
        # Move to trash via bulk delete
        r = requests.post(
            f"{API}/admin/profiles/bulk-action",
            headers=auth_headers,
            json={"ids": [first_profile_id], "action": "delete"},
            timeout=30,
        )
        assert r.status_code == 200, r.text

        # Should appear in trash list
        r2 = requests.get(f"{API}/admin/profiles/trash", headers=auth_headers, timeout=30)
        assert r2.status_code == 200, r2.text
        trash_body = r2.json()
        # Accept list or dict
        if isinstance(trash_body, dict):
            items = trash_body.get("items", [])
        else:
            items = trash_body
        ids = [i.get("id") for i in items]
        assert first_profile_id in ids, f"Profile {first_profile_id} not found in trash"

        # Restore
        r3 = requests.post(
            f"{API}/admin/profiles/{first_profile_id}/restore-trash",
            headers=auth_headers, timeout=30,
        )
        assert r3.status_code == 200, r3.text

        # After restore, it should NOT be in trash anymore
        r4 = requests.get(f"{API}/admin/profiles/trash", headers=auth_headers, timeout=30)
        items2 = r4.json().get("items", []) if isinstance(r4.json(), dict) else r4.json()
        ids2 = [i.get("id") for i in items2]
        assert first_profile_id not in ids2
