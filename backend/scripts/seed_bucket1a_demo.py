"""Enable Bucket 1A features on the demo invitation (idempotent)."""
import asyncio
import os
from pathlib import Path
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from pg_adapter import Database


async def main(slug: str = "aarav-and-riya-demo") -> None:
    db = await Database.connect(os.environ["SUPABASE_DB_URL"])
    profile = await db.profiles.find_one({"slug": slug}, {"_id": 0})
    if not profile:
        print(f"No profile with slug {slug!r}")
        return

    sections = profile.get("sections_enabled", {}) or {}
    sections.update({
        "live_stream": True,
        "live_timeline": True,
        "song_requests": True,
        "dress_code": True,
        "check_in": True,
        "calendar": True,
    })

    update = {
        "sections_enabled": sections,
        "live_stream": {
            "enabled": True,
            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "platform": "youtube",
            "scheduled_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
            "message": "Join us live from anywhere in the world.",
            "embed_enabled": True,
        },
        "song_requests_settings": {
            "enabled": True,
            "max_per_guest": 3,
            "default_provider": "spotify",
            "intro_message": "Help us build the night's playlist.",
        },
        "dress_code_settings": {
            "enabled": True,
            "title": "Dress Code",
            "items": [
                {"id": "dc-1", "label": "Mehendi · Yellow & Green", "color": "#E5C100",
                 "image_url": None, "event_type": "mehendi",
                 "notes": "Soft pastels with floral embroidery."},
                {"id": "dc-2", "label": "Sangeet · Royal Blue", "color": "#264E70",
                 "image_url": None, "event_type": "engagement",
                 "notes": "Festive blues, jewel tones, and a touch of gold."},
                {"id": "dc-3", "label": "Wedding · Maroon & Gold", "color": "#7B1E2D",
                 "image_url": None, "event_type": "marriage",
                 "notes": "Traditional attire — sarees, sherwanis."},
                {"id": "dc-4", "label": "Reception · Black-tie Glam", "color": "#1A1A1A",
                 "image_url": None, "event_type": "reception",
                 "notes": "Cocktail / evening wear."},
            ],
        },
    }

    res = await db.profiles.update_one({"id": profile["id"]}, {"$set": update})
    print("matched:", res.matched_count, "modified:", res.modified_count)


if __name__ == "__main__":
    asyncio.run(main())
