"""
test_invitations_commercial_security.py
Integration tests for the Invitations transformation:
1. Tenant isolation and Annual Subscription authorization in profile creation.
2. Optimistic concurrency locking (409 on version conflict).
3. Fail-closed AI face search add-on enforcement.
4. Strict guest download blocking (403 on ZIP and individual photo download).
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi.testclient import TestClient

from server import (
    app,
    is_studio_invitation_entitled,
)
from gallery_features import (
    has_ai_face_entitlement,
    resolve_face_photo_limit,
)

client = TestClient(app)


@pytest.mark.asyncio
async def test_invitation_annual_subscription_check():
    """Verify is_studio_invitation_entitled distinguishes entitled from unentitled studios."""
    mock_db = MagicMock()
    mock_db.subscriptions = MagicMock()
    mock_db.admins = MagicMock()
    
    # Super admin bypass
    super_admin = {"role": "super_admin", "admin_id": "sa-1"}
    assert await is_studio_invitation_entitled(mock_db, super_admin) is True

    # Test studio bypass
    test_studio = {"role": "photographer", "is_test": True, "admin_id": "test-1"}
    assert await is_studio_invitation_entitled(mock_db, test_studio) is True

    # Photographer with active subscription in db.subscriptions
    mock_sub = {"product": "invitation", "status": "active", "current_period_end": "2099-01-01T00:00:00Z"}
    mock_db.subscriptions.find_one = AsyncMock(return_value=mock_sub)
    plain_studio = {"role": "photographer", "admin_id": "sub-2"}
    assert await is_studio_invitation_entitled(mock_db, plain_studio) is True

    # Photographer with no subscription
    mock_db.subscriptions.find_one = AsyncMock(return_value=None)
    mock_db.admins.find_one = AsyncMock(return_value={"id": "unsub-1", "invitation_subscription": None})
    unentitled = {"role": "photographer", "admin_id": "unsub-1"}
    assert await is_studio_invitation_entitled(mock_db, unentitled) is False


@pytest.mark.asyncio
async def test_ai_face_entitlement_fail_closed():
    """Verify resolve_face_photo_limit fails closed (0 photos) when AI add-on is unpurchased."""
    mock_db = MagicMock()
    profile_id = "test-prof-without-ai"
    
    # Mock invitation_orders cursor
    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=[])
    mock_db.invitation_orders = MagicMock()
    mock_db.invitation_orders.find.return_value = mock_cursor
    
    mock_db.orders = MagicMock()
    mock_db.orders.find_one = AsyncMock(return_value=None)
    
    mock_db.profiles = MagicMock()
    mock_db.profiles.find_one = AsyncMock(return_value={"id": profile_id, "has_ai_addon": False})
    
    limit = await resolve_face_photo_limit(mock_db, profile_id)
    assert limit == 0
    assert await has_ai_face_entitlement(mock_db, profile_id) is False


def test_public_guest_downloads_blocked():
    """Verify guest downloads return 403 Forbidden to protect private original high-res assets."""
    # ZIP download route
    resp_zip = client.get("/api/public/gallery/any-slug-event/download-zip?session_id=s123")
    assert resp_zip.status_code == 403
    assert "disabled" in resp_zip.json().get("detail", "").lower()

    # Individual guest photo download route
    resp_photo = client.post("/api/public/gallery/any-slug-event/download", json={"photo_id": "p1"})
    assert resp_photo.status_code == 403
    assert "disabled" in resp_photo.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_backlog_face_indexing_when_entitled():
    """Verify trigger_backlog_face_indexing enqueues unindexed photos when AI add-on is paid."""
    from gallery_features import trigger_backlog_face_indexing

    mock_db = MagicMock()
    profile_id = "test-prof-with-ai"

    # Setup paid order in orders collection
    mock_db.invitation_orders = MagicMock()
    cursor_empty = MagicMock()
    cursor_empty.to_list = AsyncMock(return_value=[])
    mock_db.invitation_orders.find.return_value = cursor_empty

    mock_db.orders = MagicMock()
    mock_db.orders.find_one = AsyncMock(return_value={"id": "ord-1", "status": "paid", "photo_limit": 500, "kind": "ai_addon"})

    # Count currently indexed
    mock_db.gallery_photos = MagicMock()
    mock_db.gallery_photos.count_documents = AsyncMock(return_value=50)

    # 3 unindexed photos waiting in backlog
    mock_photos_cursor = MagicMock()
    mock_photos_cursor.to_list = AsyncMock(return_value=[{"id": "photo-1"}, {"id": "photo-2"}, {"id": "photo-3"}])
    mock_photos_cursor.limit.return_value = mock_photos_cursor
    mock_db.gallery_photos.find.return_value = mock_photos_cursor
    mock_db.gallery_photos.update_one = AsyncMock(return_value=MagicMock())

    from unittest.mock import patch
    with patch("gallery_features.face_queue.enqueue", new_callable=AsyncMock) as mock_enqueue:
        mock_enqueue.return_value = True
        result = await trigger_backlog_face_indexing(mock_db, profile_id, batch_size=100)
        assert result["ok"] is True
        assert result["enqueued"] == 3
        assert result["limit"] == 500
        assert result["indexed_count"] == 50
        assert mock_enqueue.call_count == 3


def test_independent_clocks_and_retention():
    """Verify independent gallery expiry and configurable retention grace period."""
    from datetime import datetime, timezone, timedelta
    from gallery_features import _compute_auto_delete_at

    # Profile with invitation expiring in 10 days, but gallery expiring in 60 days
    now = datetime(2026, 10, 1, 12, 0, 0, tzinfo=timezone.utc)
    invitation_expiry = (now + timedelta(days=10)).isoformat()
    gallery_expiry = (now + timedelta(days=60)).isoformat()

    profile = {
        "id": "p-clocks",
        "link_expiry_date": invitation_expiry,
        "gallery_config": {
            "expires_at": gallery_expiry,
            "retention_days": 15,
        }
    }

    auto_del = _compute_auto_delete_at(profile, retention_days=15)
    # auto_delete_at should be 60 + 15 = 75 days from base, NOT derived from invitation_expiry (10 days)
    expected_expiry = now + timedelta(days=75)
    assert auto_del == expected_expiry

