import pytest
import uuid
import datetime
from httpx import AsyncClient, ASGITransport
import sys
import os

# Ensure backend directory is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from server import app, db
from auth import create_access_token


@pytest.mark.asyncio
async def test_full_independent_gallery_suite():
    """Verify commercial options, unentitled rejection, standalone creation, albums CRUD,
    photo listing with album_id, publishing, and public 2-column view."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Commercial options
        res = await client.get("/api/subscriptions/commercial-options")
        assert res.status_code == 200, res.text
        data = res.json()
        assert "options" in data
        assert len(data["options"]) == 3
        option_ids = [opt["id"] for opt in data["options"]]
        assert "invitation_only" in option_ids
        assert "gallery_only" in option_ids
        assert "invitation_and_gallery" in option_ids

        # 2. Unentitled photographer rejection
        unentitled_id = f"test_unent_{uuid.uuid4().hex[:8]}"
        await db.admins.insert_one({
            "id": unentitled_id,
            "email": f"{unentitled_id}@example.com",
            "role": "photographer",
            "is_test": False,
            "has_invitation_subscription": True, # Has invitation BUT NOT storage
            "has_storage_subscription": False,
        })
        unentitled_token = create_access_token({"sub": unentitled_id, "role": "photographer"})
        rej_res = await client.post(
            "/api/admin/galleries",
            headers={"Authorization": f"Bearer {unentitled_token}"},
            json={"title": "Unauthorized Gallery"}
        )
        assert rej_res.status_code == 403
        assert rej_res.json().get("detail", {}).get("error") == "STORAGE_SUBSCRIPTION_REQUIRED"

        # 3. Entitled photographer lifecycle
        studio_id = f"test_studio_{uuid.uuid4().hex[:8]}"
        await db.admins.insert_one({
            "id": studio_id,
            "email": f"{studio_id}@example.com",
            "studio_name": "Royal Shutter Studio",
            "role": "photographer",
            "is_test": True,
            "has_storage_subscription": True,
        })
        token = create_access_token({"sub": studio_id, "role": "photographer"})
        headers = {"Authorization": f"Bearer {token}"}

        create_res = await client.post(
            "/api/admin/galleries",
            headers=headers,
            json={
                "title": "Aarav & Diya Royal Wedding",
                "client_name": "Aarav Sharma",
                "event_date": "2026-11-20",
                "initial_albums": ["Mehendi", "Sangeet", "Pheras", "Reception"],
                "expiry_days": 180
            }
        )
        assert create_res.status_code == 200, create_res.text
        created_data = create_res.json()
        gallery = created_data["gallery"]
        albums = created_data["albums"]
        assert gallery["is_gallery_only"] is True
        assert gallery["title"] == "Aarav & Diya Royal Wedding"
        assert len(albums) == 4
        assert [a["name"] for a in albums] == ["Mehendi", "Sangeet", "Pheras", "Reception"]
        gallery_id = gallery["id"]
        slug = gallery["slug"]

        # 4. List Galleries
        list_res = await client.get("/api/admin/galleries", headers=headers)
        assert list_res.status_code == 200
        galleries = list_res.json()["galleries"]
        assert any(g["id"] == gallery_id for g in galleries)

        # 5. Add a new album
        new_alb_res = await client.post(
            f"/api/admin/profiles/{gallery_id}/gallery/albums",
            headers=headers,
            json={"name": "Haldi Ceremony"}
        )
        assert new_alb_res.status_code == 200
        haldi_alb = new_alb_res.json()
        assert haldi_alb["name"] == "Haldi Ceremony"

        # 6. Insert a photo in that album
        photo_id = f"photo_{uuid.uuid4().hex[:8]}"
        await db.gallery_photos.insert_one({
            "id": photo_id,
            "profile_id": gallery_id,
            "album_id": haldi_alb["id"],
            "s3_key": f"weddings/{gallery_id}/photos/{photo_id}/display.webp",
            "display_s3_key": f"weddings/{gallery_id}/photos/{photo_id}/display.webp",
            "thumb_s3_key": f"weddings/{gallery_id}/photos/{photo_id}/thumb.webp",
            "original_s3_key": f"weddings/{gallery_id}/photos/{photo_id}/original.jpg",
            "original_bytes": 1024 * 1024,
            "file_size": 250 * 1024,
            "width": 1920,
            "height": 1080,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        })

        # 7. Get gallery details
        det_res = await client.get(f"/api/admin/galleries/{gallery_id}", headers=headers)
        assert det_res.status_code == 200
        det_data = det_res.json()
        assert det_data["gallery"]["photo_count"] == 1
        assert any(a["id"] == haldi_alb["id"] and a["photo_count"] == 1 for a in det_data["albums"])

        # 8. Filter photos by album_id
        photos_res = await client.get(
            f"/api/admin/profiles/{gallery_id}/gallery/photos?album_id={haldi_alb['id']}",
            headers=headers
        )
        assert photos_res.status_code == 200
        assert len(photos_res.json()["photos"]) == 1
        assert photos_res.json()["photos"][0]["album_id"] == haldi_alb["id"]

        # 9. Publish gallery
        pub_res = await client.post(f"/api/admin/galleries/{gallery_id}/publish", headers=headers)
        assert pub_res.status_code == 200
        assert pub_res.json()["status"] == "active"

        # 10. Public view (PIN-free, unguessable link)
        pub_view_res = await client.get(f"/api/public/gallery/{slug}/view")
        assert pub_view_res.status_code == 200, pub_view_res.text
        pub_data = pub_view_res.json()
        assert pub_data["gallery"]["layout"] == "2-column"
        assert pub_data["gallery"]["background"] == "#ffffff"
        assert len(pub_data["photos"]) == 1
        photo_item = pub_data["photos"][0]
        assert "display_url" in photo_item
        assert "thumb_url" in photo_item
        assert "original_url" not in photo_item
        assert "original_s3_key" not in photo_item

        # 11. Verify public download is forbidden
        dl_res = await client.post(
            f"/api/public/gallery/{slug}/download",
            json={"photo_id": photo_id}
        )
        assert dl_res.status_code == 403
