"""Add a couple of demo WeddingEvents so the Live Timeline (and per-event
Add-to-Calendar pill) actually renders on the public invite.

Idempotent: re-running keeps two events with stable event_ids."""
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

    # Anchor to a date the page can show as upcoming.
    base = datetime.now(timezone.utc) + timedelta(days=14)
    base_date = base.date().isoformat()

    events = [
        {
            "event_id": "evt-mehendi-demo",
            "event_type": "mehendi",
            "name": "Mehendi",
            "date": base_date,
            "start_time": "16:00",
            "end_time": "20:00",
            "venue_name": "The Ivy Lawns",
            "venue_address": "Pune, Maharashtra",
            "map_link": "https://maps.google.com/?q=Pune,Maharashtra",
            "description": "Floral henna under fairy lights.",
            "visible": True,
        },
        {
            "event_id": "evt-marriage-demo",
            "event_type": "marriage",
            "name": "Wedding Ceremony",
            "date": (base + timedelta(days=1)).date().isoformat(),
            "start_time": "18:30",
            "end_time": "22:00",
            "venue_name": "Aurora Banquets",
            "venue_address": "Pune, Maharashtra",
            "map_link": "https://maps.google.com/?q=Aurora+Banquets,Pune",
            "description": "Pheras at sunset, followed by dinner.",
            "visible": True,
        },
    ]

    res = await db.profiles.update_one(
        {"id": profile["id"]},
        {"$set": {"events": events}},
    )
    print("matched:", res.matched_count, "modified:", res.modified_count, "events:", len(events))


if __name__ == "__main__":
    asyncio.run(main())
