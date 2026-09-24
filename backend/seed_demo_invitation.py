"""
Seed a beautiful demo wedding invitation under the Demo Photographer
with random royal-wedding stock photos, RSVPs, wishes, and analytics.
Idempotent — re-runs do nothing destructive.
"""
import asyncio
import os
import sys
import uuid
import urllib.request
from pathlib import Path
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
sys.path.insert(0, str(ROOT_DIR))

from pg_adapter import Database  # noqa: E402
from models import Profile, WeddingEvent  # noqa: E402

DEMO_SLUG = "aarav-and-riya-demo"
# Owner-supplied venue location (Sangam Jagarlamudi) — real coordinates so the
# venue's ride + map deep links (Uber / Ola / Rapido / Google & Apple Maps) route
# to THIS destination when a guest taps them.
DEMO_VENUE_NAME = "Sangam Jagarlamudi"          # feeds the ride/map drop label
DEMO_VENUE_CITY = "Guntur, Andhra Pradesh"
DEMO_MAP_SETTINGS = {
    "latitude": 16.24615,
    "longitude": 80.5703,
    "map_link": "https://maps.google.com/?q=16.24615,80.5703",
    "parking_info": "Parking available near the venue entrance.",
}

DEMO_PHOTOS = [
    {"seed": "royal-mehndi-1",    "caption": "Mehndi night — bride's hands telling a story"},
    {"seed": "royal-couple-2",    "caption": "First look · golden hour"},
    {"seed": "royal-mandap-3",    "caption": "The mandap, kissed by marigold"},
    {"seed": "royal-baraat-4",    "caption": "Baraat — when the dhol takes over"},
    {"seed": "royal-pheras-5",    "caption": "Seven vows, seven flames"},
    {"seed": "royal-reception-6", "caption": "Reception — the first dance"},
]


def _download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r, open(dest, "wb") as out:
        out.write(r.read())


# The couple's own portraits. These come from the repo (the whole tree is
# bind-mounted to /app), NOT from picsum — picsum returns random stock, so the
# demo used to show hammers and a mountain where the bride and groom should be.
# They also drive the invitation's photo rails and the bride/groom sections:
# those read profile.bride_photo_url / groom_photo_url / couple_photo_url, and
# the rails need at least two photos before they render at all.
PORTRAITS = [
    ("bride",  "bride_photo_url"),
    ("groom",  "groom_photo_url"),
    ("couple", "couple_photo_url"),
]
# Resolved from this file, not hardcoded to /app: that path only exists inside
# the container, so a local run could never find the portraits.
# Lives under frontend-v2/public (the deployed SPA's static root) so the same
# four files back BOTH this disk-copy seeder and the /sample-wedding/* URLs
# seed_test_invitation.py writes onto the profile. The legacy frontend/public
# copy was dropped with the rest of that tree's assets.
SAMPLE_DIR = Path(__file__).resolve().parent.parent / "frontend-v2" / "public" / "sample-wedding"

DEMO_BRIDE_ABOUT = (
    "A Bharatanatyam dancer from Jaipur who teaches by day and choreographs by "
    "night. Riya collects vinyl, argues about film scores, and can name a raga "
    "in three notes."
)
DEMO_GROOM_ABOUT = (
    "An architect from Chennai who sketches buildings on napkins. Aarav runs at "
    "dawn, cooks far too much biryani, and still loses every argument about "
    "film scores."
)


async def _seed_portraits(db, profile_id: str, upload_dir: Path) -> None:
    """Copy the bundled portraits into this profile's uploads and point the
    profile at them. Skips silently if the sample images are not present."""
    import shutil

    updates = {"bride_about": DEMO_BRIDE_ABOUT, "groom_about": DEMO_GROOM_ABOUT}
    for name, field in PORTRAITS:
        src = SAMPLE_DIR / f"{name}.jpg"
        if not src.exists():
            print(f"  Portrait {name}.jpg not found at {src} — skipping")
            continue
        dest = upload_dir / f"{name}.jpg"
        if not dest.exists():
            shutil.copyfile(src, dest)
            print(f"  Copied portrait {name}.jpg")
        # /uploads/... (not /api/uploads/...) because the frontend rewrites the
        # prefix itself; storing the rewritten form would double it.
        updates[field] = f"/uploads/weddings/{profile_id}/live/{name}.jpg"

    await db.profiles.update_one({"id": profile_id}, {"$set": updates})
    print("  Profile portraits + bios set")


def _build_demo_profile(admin_id: str) -> dict:
    """Build a Profile dict that passes pydantic validation."""
    base_date = datetime.now(timezone.utc) + timedelta(days=45)

    def mk_event(event_type, name, days_offset, venue_name, time_str, description):
        d = (datetime.now(timezone.utc) + timedelta(days=days_offset))
        return WeddingEvent(
            event_type=event_type,
            name=name,
            date=d.strftime("%Y-%m-%d"),
            start_time=time_str,
            venue_name=venue_name,
            venue_address="Sangam Jagarlamudi, Guntur District, Andhra Pradesh",
            map_link="https://maps.google.com/?q=16.24615,80.5703",
            description=description,
            language_enabled=["english", "hindi"],
            visible=True,
            enabled=True,
        )

    profile = Profile(
        admin_id=admin_id,
        slug=DEMO_SLUG,
        groom_name="Aarav",
        bride_name="Riya",
        event_type="marriage",
        event_date=base_date,
        venue=DEMO_VENUE_NAME,
        city=DEMO_VENUE_CITY,
        invitation_message="With the blessings of our families, please join us as we begin forever.",
        language=["english"],
        enabled_languages=["english"],
        design_id="royal_mughal",
        love_story=(
            "Two cities, two languages, one playlist that decided everything. "
            "Aarav and Riya first met at a rooftop coffee shop in Bangalore — she "
            "was sketching the Vidhana Soudha; he was reading Rumi. Three years, "
            "twenty-seven cities and one monsoon-soaked Goa rendezvous later, they "
            "said yes — under fairy lights, with their families dancing in the rain."
        ),
        events=[],  # Events skipped for demo seed — strict WeddingEvent validators
                    # require muhurtham_time, slug, event_content per type which would
                    # bloat the seed. Live gallery / RSVPs / wishes are the demo focus.
        link_expiry_type="permanent",
        plan_type="GOLD",
        is_active=True,
        status="published",
        title="Aarav & Riya — Demo Royal Wedding",
        selected_design_key="royal_mughal",
        published_at=datetime.now(timezone.utc),
    )

    doc = profile.model_dump()
    # Mark as published-ready for our internal flags
    doc["is_published"] = True
    doc["is_enabled"] = True
    # Venue coordinates so the "Getting there" ride/map deep links (Google/Apple
    # Maps, Uber, Ola, Rapido) carry a REAL destination. Without map_settings the
    # links fall back to name-only and don't route to the venue.
    doc["map_settings"] = dict(DEMO_MAP_SETTINGS)
    # Serialize datetimes
    for k in ("event_date", "created_at", "updated_at", "published_at", "expires_at",
             "link_expiry_date", "plan_expires_at"):
        v = doc.get(k)
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
    # Serialize event datetimes (Pydantic already converted dates to str)
    return doc


async def seed_demo():
    # Migration leftover: unused MONGO_URL/DB_NAME lookups raised KeyError and
    # made this seed unrunnable. Postgres is the only backing store now.
    db = await Database.connect(os.environ["SUPABASE_DB_URL"])

    photographer = await db.admins.find_one({"email": "admin@wedding.com"}, {"_id": 0})
    if not photographer:
        print("Demo photographer not found — run init_admin.py first")
        return

    admin_id = photographer["id"]

    # Idempotent: reuse if exists
    existing = await db.profiles.find_one({"slug": DEMO_SLUG}, {"_id": 0})
    if existing:
        profile_id = existing["id"]
        # Keep the demo's venue coordinates in sync with DEMO_MAP_SETTINGS so its
        # ride/map deep links route to the current destination. Re-applies whenever
        # the coordinates change (older seeds had none, or a different venue).
        if (existing.get("map_settings") or {}).get("latitude") != DEMO_MAP_SETTINGS["latitude"] \
                or existing.get("venue") != DEMO_VENUE_NAME:
            # Update BOTH the coordinates and the venue name/city — the ride links
            # use profile.venue for the drop label and map_settings for the pin, so
            # updating only the coordinates would leave the old "The Leela Palace"
            # label on an already-seeded demo.
            await db.profiles.update_one({"id": profile_id}, {"$set": {
                "map_settings": dict(DEMO_MAP_SETTINGS),
                "venue": DEMO_VENUE_NAME,
                "city": DEMO_VENUE_CITY,
            }})
            print(f"Updated demo venue (name + coordinates) for /invite/{DEMO_SLUG}")
        else:
            print(f"Demo invitation exists — slug=/invite/{DEMO_SLUG}")
    else:
        doc = _build_demo_profile(admin_id)
        profile_id = doc["id"]
        await db.profiles.insert_one(doc)
        print(f"Created demo invitation /invite/{DEMO_SLUG} (id: {profile_id})")

    # Live gallery photos
    upload_dir = Path("/app/uploads/weddings") / profile_id / "live"
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Re-run safe: copies only what is missing and re-points the profile, so an
    # invitation seeded before portraits existed gets them on the next run.
    await _seed_portraits(db, profile_id, upload_dir)

    existing_photos = await db.live_gallery_photos.count_documents({"wedding_id": profile_id})
    if existing_photos < len(DEMO_PHOTOS):
        for i, p in enumerate(DEMO_PHOTOS):
            photo_id = f"demo-photo-{i+1}"
            if await db.live_gallery_photos.find_one({"id": photo_id}, {"_id": 0}):
                continue
            url = f"https://picsum.photos/seed/{p['seed']}/1600/1067"
            file_name = f"{photo_id}.jpg"
            dest = upload_dir / file_name
            try:
                if not dest.exists():
                    _download(url, dest)
                    print(f"  Downloaded {file_name}")
            except Exception as e:
                print(f"  Failed to fetch {file_name}: {e}")

            public_url = (
                f"/api/uploads/weddings/{profile_id}/live/{file_name}"
                if dest.exists() else url
            )
            await db.live_gallery_photos.insert_one({
                "id": photo_id,
                "profile_id": profile_id,
                "wedding_id": profile_id,
                "url": public_url,
                "thumb_url": public_url,
                "micro_url": public_url,
                "source": "demo_seed",
                "guest_name": "Demo Photographer",
                "caption": p["caption"],
                "width": 1600,
                "height": 1067,
                "file_size": 0,
                "created_at": (datetime.now(timezone.utc) - timedelta(minutes=i * 5)).isoformat(),
            })
            print(f"  Inserted photo {photo_id}: {p['caption']}")
    else:
        print(f"Live gallery already seeded ({existing_photos} photos)")

    # Analytics
    await db.analytics.update_one(
        {"profile_id": profile_id},
        {"$set": {"profile_id": profile_id, "total_views": 142, "unique_views": 97}},
        upsert=True,
    )

    # Demo RSVPs
    if await db.rsvps.count_documents({"profile_id": profile_id}) == 0:
        for i, r in enumerate([
            {"name": "Aanya & Family", "guests": 4, "status": "yes",   "message": "Wouldn't miss it for the world!"},
            {"name": "Vikram Singh",   "guests": 2, "status": "yes",   "message": "See you at the pheras"},
            {"name": "Meera Joshi",    "guests": 3, "status": "yes",   "message": "Travelling from Delhi"},
            {"name": "Rohan Patel",    "guests": 1, "status": "maybe", "message": "Working on the dates"},
            {"name": "Priya Iyer",     "guests": 2, "status": "no",    "message": "On honeymoon ourselves"},
        ]):
            await db.rsvps.insert_one({
                "id": uuid.uuid4().hex,
                "profile_id": profile_id,
                **r,
                "created_at": (datetime.now(timezone.utc) - timedelta(hours=i * 6)).isoformat(),
            })
        print("Seeded 5 RSVPs")

    # Demo wishes — a fuller set so the "View all wishes" button actually appears
    # (it only shows when there are more than 3 non-featured wishes). Topped up by
    # guest_name so an already-seeded demo (which had only 5) gets the extras too.
    demo_wishes = [
        ("Aanya",            "Two souls, one journey. Sending you all the love.",       True,  "approved"),
        ("Vikram",           "May every laugh outlive every storm. Cheers, you two!",   True,  "approved"),
        ("Meera",            "Couldn't have prayed for a more magical match.",          True,  "approved"),
        ("Anonymous Friend", "Wishing you a lifetime of love.",                         False, "approved"),
        ("Rohan",            "Some loves rewrite the script. Yours did.",               False, "approved"),
        ("Sneha & Karan",    "From coffee shop sketches to forever — so happy for you both.", False, "approved"),
        ("Ishaan",           "May your home always be full of laughter and filter coffee.",   False, "approved"),
        ("Divya Nair",       "Wishing you a lifetime of monsoon dances and rooftop sunsets.",  False, "approved"),
        ("The Kapoors",      "Two families, one big beautiful celebration. Congratulations!",  False, "approved"),
        ("Arjun",            "Here's to twenty-seven more cities together. Cheers!",     False, "approved"),
        ("Nandita",          "You two are proof that the best playlists find each other.", False, "approved"),
        ("Farhan & Zoya",    "May your love story keep everyone's hearts warm for years.", False, "approved"),
        ("Grandma Lakshmi",  "My blessings, always. Grow old together and stay silly.",   False, "approved"),
    ]
    existing_names = {w.get("guest_name") for w in
                      await db.guest_wishes.find({"profile_id": profile_id}, {"_id": 0}).to_list(500)}
    added = 0
    for i, (name, msg, featured, status) in enumerate(demo_wishes):
        if name in existing_names:
            continue
        await db.guest_wishes.insert_one({
            "id": uuid.uuid4().hex,
            "profile_id": profile_id,
            "guest_name": name,
            "message": msg,
            "is_featured": featured,
            "status": status,
            "created_at": (datetime.now(timezone.utc) - timedelta(hours=i * 4)).isoformat(),
        })
        added += 1
    if added:
        print(f"Seeded {added} demo wishes")

    print(f"\nDemo invitation ready:")
    print(f"   Photographer: admin@wedding.com / admin123 (id: {admin_id[:8]}...)")
    print(f"   Profile ID:   {profile_id}")
    print(f"   Public link:  /invite/{DEMO_SLUG}")
    print(f"   Open in app:  /admin/profile/{profile_id}/edit\n")
    await db.close()


if __name__ == "__main__":
    asyncio.run(seed_demo())
