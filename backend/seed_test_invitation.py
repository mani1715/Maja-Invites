"""
seed_test_invitation.py — fill in a TEST order's missing details, build the
invitation from it, and attach the link so it shows in the admin panel.

    cd backend && python seed_test_invitation.py            # MAJA-FB9EFC
    cd backend && python seed_test_invitation.py MAJA-XXXXXX

Why this exists: the owner's test request MAJA-FB9EFC was half-filled (placeholder
names, one photo, a venue that disagreed with its own map link, two different
ceremony times) and had no invitation attached. This script does one pass:

  1. completes / corrects that order's `info` — see FIXES below, every entry
     documented with what was wrong;
  2. builds the invitation with order_to_invitation.build_invitation_payload —
     the SAME code path the fulfillment console's "Build draft invitation" button
     uses, so what is reviewed here is what the real flow produces;
  3. seeds a few live-gallery photos, because the order paid for the QR gallery
     and an empty gallery cannot be reviewed;
  4. PUBLISHES it and attaches the live link to the order, which is what makes it
     appear in the admin console and the buyer's panel.

Step 4 is a delivery. It runs here because this is a test order the owner
explicitly asked to see in the panel — it is NOT the default behaviour of the
build button, which stops at a draft. Pass --draft to stop at step 3.

Idempotent: re-running updates the same order and the same profile (the slug is
derived from the fulfillment code), never a second link.

Placeholder images: bride/groom/couple portraits come from the repo's bundled
`frontend-v2/public/sample-wedding/*.jpg` — the deployed SPA's static root, so
the `/sample-wedding/...` URLs written onto the profile below actually resolve.
They are STOCK — the studio replaces them with the couple's real photos. The one
photo the buyer really did upload is kept, first in the gallery.
"""
from __future__ import annotations

import asyncio
import copy
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT))

DEFAULT_CODE = "MAJA-FB9EFC"
PUBLIC_BASE = (os.environ.get("PUBLIC_BASE_URL") or "https://majainvites.com").rstrip("/")

# Bundled stock portraits. Served by the SPA from /sample-wedding/... — the
# files live in frontend-v2/public/sample-wedding/, which Vite copies verbatim
# into dist/ and Caddy serves from /srv.
STOCK = {
    "bride": "/sample-wedding/bride.jpg",
    "groom": "/sample-wedding/groom.jpg",
    "couple": "/sample-wedding/couple.jpg",
    "collage": "/sample-wedding/couple-collage.png",
}

# --------------------------------------------------------------------------- #
# FIXES — what was wrong in the exported order, and what it becomes.
# Each key is a real defect found in MAJA-FB9EFC, not a cosmetic preference.
# --------------------------------------------------------------------------- #
FIXES_TOP = {
    # "Bride" / "Groom" were literal placeholders.
    "bride_name": "Divya",
    "groom_name": "Arjun",
    # The venue said "Guntur" while the map link pointed at Nirmala Nagar,
    # Sattenapalle — ~40 km apart, so guests would have been routed to the wrong
    # town. The link is a real place with real coordinates, so the TEXT is
    # corrected to match the link rather than throwing the link away.
    "venue": "Sri Venkateswara Kalyana Mandapam",
    "city": "Nirmala Nagar, Sattenapalle, Guntur District, Andhra Pradesh",
    # Notes were empty; this is the field the studio reads for extra requirements.
    "notes": "Test request. Bride's family arrives the previous evening — "
             "please cover the reception of guests from 6 PM.",
}

FIXES_EXTRA = {
    # The two build decisions the form now asks for. This is a Hindu engagement
    # with the couple's photo behind the text, which is what the order implied.
    "marriage_type": "hindu",
    "background_choice": "couple",
    # Parents were "hero" / "heroien" on BOTH sides (and misspelt).
    "bride_father": "Ramesh Kumar",
    "bride_mother": "Lakshmi Devi",
    "groom_father": "Srinivasa Rao",
    "groom_mother": "Padmavathi",
    # The ceremony time (13:30) and the muhurtam (10:35) disagreed. The muhurtam
    # IS the ceremony moment, so the event time follows it and lunch follows that.
    "wedding_time": "10:35",
    "muhurtam": {"value": "10:35", "enabled": True},
    "meal": "lunch",
    # Gotram had a mistyped bride value ("Jeldh") and an empty groom value.
    "gotram": {"bride": "Kaundinya", "groom": "Bharadwaja", "enabled": True},
    # Nakshatram was already complete on both sides — kept as entered.
    # Only the bride's photo was uploaded; groom and couple were empty, which
    # left the opening animation and the page background without an image.
    "bride_photo": STOCK["bride"],
    "groom_photo": STOCK["groom"],
    "couple_photo": STOCK["couple"],
    # Gallery was empty while the order paid for the QR gallery.
    "other_photos": [
        # the photo the buyer really uploaded, kept first
        "/api/uploads/photos/admin-ca97a573-5351-400c-9734-eaa5bb036806-misc-20260722_060719-vk9m4i.webp",
        STOCK["couple"], STOCK["bride"], STOCK["groom"], STOCK["collage"],
    ],
    # Parking pointed at the venue's own map link, so "parking" was the venue.
    # Text only — a real parking pin can be pasted later.
    "parking": {"enabled": True,
                "text": "Free parking inside the mandapam compound and along the "
                        "temple side road. Volunteers in green will guide you.",
                "google_map_link": ""},
    # Bios were generic one-liners; kept but written as the couple would.
    "about_bride": "Divya teaches Bharatanatyam in Guntur, hoards filter coffee and "
                   "can name a raga in three notes.",
    "about_groom": "Arjun builds bridges for a living and playlists for fun. He still "
                   "loses every argument about film music.",
    "couple_story": "Two families from either side of the Krishna, one very long "
                    "phone call, and a yes that everybody saw coming. Divya and "
                    "Arjun begin forever with your blessings.",
    # FAQ was an empty list — guests ask these first.
    "faq": [
        {"q": "What time should we arrive?",
         "a": "By 10:00 AM. The muhurtam is at 10:35 AM sharp."},
        {"q": "Is lunch served?",
         "a": "Yes — lunch is served right after the ceremony, from 12:30 PM."},
        {"q": "Where do we park?",
         "a": "Inside the mandapam compound; volunteers will guide you."},
    ],
}


def _deep_fill(base: dict, fixes: dict) -> dict:
    """Apply fixes onto a copy of base. Nested dicts merge (so a corrected
    `gotram.bride` doesn't wipe `gotram.enabled`), everything else replaces."""
    out = copy.deepcopy(base or {})
    for k, v in fixes.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = {**out[k], **v}
        else:
            out[k] = v
    return out


async def main(code: str, deliver: bool) -> None:
    from pg_adapter import Database
    from order_to_invitation import build_invitation_payload

    db = await Database.connect(os.environ["SUPABASE_DB_URL"])
    try:
        order = await db.invitation_orders.find_one({"fulfillment_code": code}, {"_id": 0})
        if not order:
            print(f"No order found for {code}. Nothing changed.")
            return

        # ---- 1. complete + correct the details ---------------------------
        info = copy.deepcopy(order.get("info") or {})
        extra = _deep_fill(info.get("extra") or {}, FIXES_EXTRA)
        info = {**info, **FIXES_TOP, "extra": extra}
        # A test order dated in the past would render as expired.
        if str(info.get("event_date") or "")[:10] < datetime.now(timezone.utc).date().isoformat():
            info["event_date"] = (datetime.now(timezone.utc) + timedelta(days=45)).date().isoformat()
            print(f"  event date was in the past -> {info['event_date']}")
        await db.invitation_orders.update_one({"fulfillment_code": code}, {"$set": {"info": info}})
        order["info"] = info
        print(f"[1] details completed for {code}")

        # ---- 2. build the invitation (same code path as the console) -----
        admin_id = order.get("user_id") if order.get("buyer_kind") == "photographer" else None
        if admin_id:
            found = (await db.admins.find_one({"id": admin_id}, {"_id": 0, "id": 1})
                     or await db.admins.find_one({"admin_id": admin_id}, {"_id": 0, "id": 1}))
            admin_id = (found or {}).get("id") or admin_id
        if not admin_id:
            owner = await db.admins.find_one({"role": "super_admin"}, {"_id": 0, "id": 1})
            admin_id = (owner or {}).get("id")
        if not admin_id:
            print("No account to attach the invitation to. Aborting.")
            return

        existing = None
        if order.get("profile_id"):
            existing = await db.profiles.find_one({"id": order["profile_id"]}, {"_id": 0})
        built = build_invitation_payload(order, admin_id,
                                        slug=existing.get("slug") if existing else None)
        doc = built["profile"]
        if existing:
            doc["id"] = existing["id"]
            doc["created_at"] = existing.get("created_at") or doc.get("created_at")
            await db.profiles.update_one({"id": existing["id"]}, {"$set": doc})
            profile_id = existing["id"]
            print(f"[2] invitation refreshed  id={profile_id}")
        else:
            clash = await db.profiles.find_one({"slug": doc["slug"]}, {"_id": 0, "id": 1})
            if clash:
                doc["slug"] = f"{doc['slug']}-{uuid.uuid4().hex[:4]}"
            await db.profiles.insert_one(doc)
            profile_id = doc["id"]
            print(f"[2] invitation created    id={profile_id}")
        slug = doc["slug"]
        for w in built["warnings"]:
            print(f"    note: {w}")

        # ---- 3. the QR gallery needs photos to be reviewable -------------
        # Written to db.live_gallery_photos, the same collection the studio's
        # "Upload to QR Gallery" writes to. The public wall reads both
        # collections now (live_wall_feed.py) — before that fix these rows
        # existed but the wall showed "0 photos".
        seeded = 0
        for i, url in enumerate([STOCK["couple"], STOCK["bride"], STOCK["groom"], STOCK["collage"]]):
            pid = f"testseed-{code.lower()}-{i+1}"
            if await db.live_gallery_photos.find_one({"id": pid}, {"_id": 0}):
                continue
            await db.live_gallery_photos.insert_one({
                "id": pid, "profile_id": profile_id, "wedding_id": profile_id,
                "url": url, "thumb_url": url, "micro_url": url,
                "source": "test_seed", "guest_name": "Test Studio",
                "caption": ["The couple", "Divya", "Arjun", "Together"][i],
                "width": 1600, "height": 1067, "file_size": 0,
                "created_at": (datetime.now(timezone.utc) - timedelta(minutes=i * 5)).isoformat(),
            })
            seeded += 1
        print(f"[3] live gallery: {seeded} photo(s) seeded")

        live_url = f"{PUBLIC_BASE}/invite/{slug}"
        if not deliver:
            print(f"\nDRAFT ready (not attached to the order):\n  {live_url}\n")
            return

        # ---- 4. publish + attach the link (shows in the admin panel) -----
        now = datetime.now(timezone.utc).isoformat()
        await db.profiles.update_one({"id": profile_id}, {"$set": {
            "status": "published", "is_published": True, "is_enabled": True,
            "is_active": True, "published_at": now}})
        await db.invitation_orders.update_one({"fulfillment_code": code}, {"$set": {
            "profile_id": profile_id, "live_url": live_url,
            "build_status": "delivered", "delivered_at": now}})
        print(f"[4] published + attached to {code}")
        print("\n" + "=" * 62)
        print(f"  Invitation : {live_url}")
        print(f"  QR gallery : {PUBLIC_BASE}/invite/{slug}/live-gallery")
        print(f"  Editor     : {PUBLIC_BASE}/studio/profile/{profile_id}/edit")
        print(f"  Admin panel: {PUBLIC_BASE}/super-admin/fulfillment  (look up {code})")
        print("=" * 62 + "\n")
    finally:
        await db.close()


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    asyncio.run(main(args[0] if args else DEFAULT_CODE,
                     deliver="--draft" not in sys.argv))
