"""
test_order_to_invitation.py — the order → invitation mapping.

The fixture is the owner's REAL exported order (MAJA-FB9EFC), trimmed of nothing
that matters, because the point of this suite is that a real request builds a real
invitation without a human re-typing it. Also covers the edges that would
otherwise reach the page as a broken invitation: an unrenderable purchased
language, a phone that isn't E.164, a missing date, a map link with no
coordinates, and re-running the build (the slug must be stable).

    cd backend && python -m tests.test_order_to_invitation
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from order_to_invitation import (            # noqa: E402
    build_invitation_payload, build_slug, normalise_phone, normalise_languages,
    parse_latlng, feature_keys,
)

PASS = 0
FAIL = []


def ok(label, cond):
    global PASS
    if cond:
        PASS += 1
        print(f"  ok  {label}")
    else:
        FAIL.append(label)
        print(f"  FAIL  {label}")


# The owner's exported request, as downloaded from the fulfillment console.
ORDER = {
    "fulfillment_code": "MAJA-FB9EFC",
    "id": "invord_222ea1e446b542d9",
    "buyer_kind": "photographer",
    "buyer": {"name": "Test Studio", "email": "test.studio@maja.test", "phone": "+910000000001"},
    "design_id": "temple_engagement_2",
    "theme_id": "south_indian_temple",
    "event_type": "Engagement",
    "package": "bespoke",
    "status": "paid",
    "addons": [
        {"key": "custom_video", "label": "Custom Video (AI)", "price": 2999},
        {"key": "ai_face_match", "label": "Get-Your-Photos", "price": 1499},
        {"key": "custom_video_editing", "label": "Custom Video Editing", "price": 9999},
        {"key": "live_gallery", "label": "Live Photo Gallery", "price": 999},
    ],
    "info": {
        "city": "guntur",
        "notes": "",
        "phone": "8328284501",
        "venue": "Guntur",
        "bride_name": "Bride",
        "groom_name": "Groom",
        "event_date": "2026-07-30",
        "extra": {
            "faq": [],
            "meal": "lunch",
            "gotram": {"bride": "Jeldh", "groom": "", "enabled": True},
            "shagun": {"upi_id": "", "enabled": False, "payee_name": ""},
            "parking": {"text": "under venue", "enabled": True,
                        "google_map_link": "https://www.google.co.in/maps/place/Nirmala+Nagar/@16.3999844,80.1242316,14z/data=!4m6!3m5!8m2!3d16.3999857!4d80.1448313"},
            "muhurtam": {"value": "10:35", "enabled": True},
            "live_link": "https://youtu.be/tROynBE-AIw",
            "nakshatram": {"bride": "Anuradha", "groom": "Rohini", "enabled": True},
            "about_bride": "A kind heart, a bright smile.",
            "about_groom": "Warm, ambitious and endlessly caring.",
            "bride_photo": "/api/uploads/photos/bride.webp",
            "groom_photo": "",
            "couple_photo": "",
            "bride_father": "hero",
            "bride_mother": "heroien",
            "couple_story": "Two families, one beautiful beginning.",
            "groom_father": "hero",
            "groom_mother": "heroien",
            "other_photos": [],
            "wedding_time": "13:30",
            "honeymoon_fund": {"title": "Honeymoon Fund", "upi_id": "", "enabled": False},
            "other_languages": ["Telugu", "Tamil"],
            "primary_language": "English",
            "pre_wedding_links": [{"id": "tmp-1784606541976",
                                   "url": "https://youtu.be/oZADNe0wQqo",
                                   "kind": "video", "label": "Pre-wedding Video"}],
            "background_music_url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
            "venue_google_map_link": "https://www.google.co.in/maps/place/Nirmala+Nagar/@16.3999844,80.1242316,14z/data=!4m6!3m5!8m2!3d16.3999857!4d80.1448313",
        },
    },
}

ADMIN = "admin-test-studio"


async def endpoint_checks():
    """The console endpoint: build → link → preview, and never a duplicate."""
    print("\n=== the fulfillment console endpoint ===")
    from tests.aws_stub import ensure_aws_service
    ensure_aws_service()
    from cryptography.fernet import Fernet
    os.environ.setdefault("STORAGE_CRED_KEY", Fernet.generate_key().decode())
    from tests.test_storage_orchestrator import FakeDB
    import fulfillment_service as fs

    db = FakeDB()
    order = dict(ORDER, status="paid", build_status="pending_info", user_id="adm_1")
    await db.invitation_orders.insert_one(order)
    await db.admins.insert_one({"id": "adm_1", "role": "admin", "studio_name": "Test Studio",
                                "email": "test.studio@maja.test"})

    router = fs.build_fulfillment_router(db, require_super_admin=lambda: {"role": "super_admin"})
    build_ep = next(r.endpoint for r in router.routes if getattr(r, "path", None)
                    == "/api/admin/fulfillment/requests/{code}/build-invitation")

    res = await build_ep(code="MAJA-FB9EFC", payload={}, _s={"role": "super_admin"})
    ok("the endpoint creates the invitation", res["created"] is True and res["profile_id"])
    ok("it hands back a preview link", res["preview_url"] == f"/invite/{res['slug']}")
    ok("it hands back an editor link", res["edit_url"].endswith("/edit"))
    ok("it returns the owner's correction list", len(res["warnings"]) > 0)

    saved = await db.profiles.find_one({"id": res["profile_id"]}, {"_id": 0})
    ok("the profile really exists in the db", bool(saved))
    ok("it belongs to the buying photographer", saved["admin_id"] == "adm_1")
    ok("it is a draft (buyer's panel untouched)", saved["is_published"] is False)

    linked = await db.invitation_orders.find_one({"fulfillment_code": "MAJA-FB9EFC"}, {"_id": 0})
    ok("the order now points at the invitation", linked["profile_id"] == res["profile_id"])
    ok("the order moves to 'building', NOT 'delivered'", linked["build_status"] == "building")
    ok("no live_url was set — delivering stays a separate decision",
       not linked.get("live_url"))

    again = await build_ep(code="MAJA-FB9EFC", payload={}, _s={"role": "super_admin"})
    ok("a second click does NOT create a duplicate",
       again["created"] is False and again["profile_id"] == res["profile_id"])
    ok("still only one profile", len(await db.profiles.find({}, {"_id": 0}).to_list(50)) == 1)

    # Rebuild after the buyer corrects their details.
    await db.invitation_orders.update_one(
        {"fulfillment_code": "MAJA-FB9EFC"},
        {"$set": {"info": {**ORDER["info"], "bride_name": "Divya", "groom_name": "Arjun"}}})
    reb = await build_ep(code="MAJA-FB9EFC", payload={"rebuild": True}, _s={"role": "super_admin"})
    refreshed = await db.profiles.find_one({"id": res["profile_id"]}, {"_id": 0})
    ok("rebuild re-applies the corrected details", refreshed["bride_name"] == "Divya")
    ok("rebuild keeps the same profile id (link never changes)",
       reb["profile_id"] == res["profile_id"])
    ok("rebuild still makes no second profile",
       len(await db.profiles.find({}, {"_id": 0}).to_list(50)) == 1)

    # An order with no details can't be built from.
    await db.invitation_orders.insert_one(
        {"id": "o2", "fulfillment_code": "MAJA-NOINFO", "status": "paid", "buyer_kind": "user"})
    try:
        await build_ep(code="MAJA-NOINFO", payload={}, _s={"role": "super_admin"})
        ok("an order with no filled form is refused", False)
    except Exception as e:
        ok("an order with no filled form is refused", "no filled details" in str(e))


def main():
    print("=== order → invitation: the real MAJA-FB9EFC request ===")
    built = build_invitation_payload(ORDER, ADMIN)
    p = built["profile"]

    ok("slug is derived from the fulfillment code", p["slug"] == "groom-bride-fb9efc")
    ok("re-running yields the SAME slug (no orphan second link)",
       build_slug(ORDER) == p["slug"])
    ok("attached to the buying photographer", p["admin_id"] == ADMIN)
    # Proves the payload went through models.Profile — i.e. a mapping mistake
    # would have raised here rather than shipping a broken invitation page.
    ok("validated against the real Profile model",
       "seo_settings" in p and "view_count" in p and "theme_settings" in p)
    ok("draft, not published", p["status"] == "draft" and p["is_published"] is False)
    ok("previewable (link active)", p["is_active"] is True)

    # --- the couple ------------------------------------------------------
    ok("names carried over", p["bride_name"] == "Bride" and p["groom_name"] == "Groom")
    ok("placeholder names are FLAGGED, not silently shipped",
       sum(1 for w in built["warnings"] if "placeholder" in w) == 2)
    ok("event type mapped Engagement → engagement", p["event_type"] == "engagement")
    ok("theme becomes the design", p["design_id"] == "south_indian_temple")
    # The card the buyer actually chose must survive onto the profile — the
    # public page reads design_selections, and Profile used to drop the field.
    ok("the PURCHASED design is carried, not the theme default",
       p["design_selections"]["hero"] == "temple_engagement_2")
    ok("...also under the event key for the per-event picker",
       p["design_selections"]["Engagement"] == "temple_engagement_2")
    ok("date + time combined", p["event_date"].startswith("2026-07-30T13:30"))
    ok("bespoke → PLATINUM tier", p["plan_type"] == "PLATINUM")

    # --- languages -------------------------------------------------------
    ok("primary language stays first", p["language"] == ["english"])
    ok("all three languages enabled",
       set(p["enabled_languages"]) == {"english", "telugu", "tamil"})

    # --- venue / map -----------------------------------------------------
    ms = p["map_settings"]
    ok("map link kept", ms["map_link"].startswith("https://www.google.co.in/maps"))
    ok("PLACE coordinates preferred over the camera position",
       ms["latitude"] == 16.3999857 and ms["longitude"] == 80.1448313)
    ok("parking text becomes venue parking info", ms["parking_info"] == "under venue")
    ok("map embed switched on", ms["embed_enabled"] is True)

    # --- auspicious details ---------------------------------------------
    maja = p["custom_text"]["_maja"]
    ok("muhurtam carried", p["muhurtam"] == "10:35")
    ok("both nakshatrams on one line",
       p["nakshatram"] == "Anuradha (bride) · Rohini (groom)")
    ok("one-sided gotram still shows the side that was given",
       maja["gotra"] == "Jeldh (bride)")
    ok("half-filled gotram is flagged",
       any("gotram" in w for w in built["warnings"]))

    # --- media -----------------------------------------------------------
    ok("bride photo mapped", p["bride_photo_url"].endswith("bride.webp"))
    ok("missing photos are flagged",
       any("groom, couple photo" in w or "groom" in w and "photo" in w
           for w in built["warnings"]))
    ok("opening background falls back to the only portrait present",
       p["opening_bg_source"] == "bride")
    ok("music carries BOTH keys the app reads",
       p["background_music"]["url"].endswith(".mp3") and
       p["background_music"]["file_url"] == p["background_music"]["url"] and
       p["background_music"]["enabled"] is True)
    ok("YouTube live link becomes the live stream",
       p["live_stream"]["enabled"] is True and p["live_stream"]["platform"] == "youtube")
    ok("live link ALSO in the _maja bag the page reads",
       maja["youtube_live_url"].startswith("https://youtu.be/"))
    ok("pre-wedding link kept, temp id dropped",
       len(p["pre_wedding_links"]) == 1 and
       not str(p["pre_wedding_links"][0].get("id", "")).startswith("tmp-"))

    # --- family / story --------------------------------------------------
    ok("parents in the family line", "Bride's father: hero" in p["family_details"])
    ok("parents also in the _maja bag the page reads",
       maja["bride_father"] == "hero" and maja["groom_mother"] == "heroien")
    ok("story mapped to love story", p["love_story"].startswith("Two families"))
    ok("meal chip carried", maja["meal_time"] == "lunch")
    ok("provenance recorded", maja["built_from_order"] == "MAJA-FB9EFC")
    ok("an empty FAQ stays off (no empty accordion)", p["faq_settings"] is None)

    # --- features → sections --------------------------------------------
    se = p["sections_enabled"]
    ok("purchased photo features switch the QR gallery on", se["qr"] is True)
    ok("purchased video features switch the video section on", se["video"] is True)
    ok("family section on (parents present)", se["family"] is True)
    ok("love-story section on", se["love_story"] is True)
    ok("live-stream section on", se["live_stream"] is True)
    ok("included features on (rsvp/countdown/maps)",
       se["rsvp"] and se["countdown"] and se["calendar"])
    ok("every purchased key recorded on the profile",
       set(built["features"]) == {"custom_video", "ai_face_match",
                                  "custom_video_editing", "live_gallery"})
    ok("empty gallery with a paid photo feature is flagged",
       any("no photos are in the order" in w for w in built["warnings"]))

    # --- contact ---------------------------------------------------------
    ok("10-digit Indian number becomes E.164",
       p["contact_info"]["groom_phone"] == "+918328284501")
    ok("buyer email used as the contact mail",
       p["contact_info"]["email"] == "test.studio@maja.test")

    # --- money sections stay OFF because the order had them off ----------
    ok("honeymoon fund respects the off toggle", p["honeymoon_fund"]["enabled"] is False)
    ok("digital shagun respects the off toggle", p["digital_shagun_enabled"] is False)

    # A filled FAQ must reach the invitation's accordion — the cart collected it
    # and nothing carried it to the page before.
    faq_order = {**ORDER, "info": {**ORDER["info"], "extra": {
        **ORDER["info"]["extra"],
        "faq": [{"q": "What time?", "a": "10:35 AM"},
                {"question": "Parking?", "answer": "Inside the compound"},
                {"q": "no answer given", "a": ""}]}}}
    fq = build_invitation_payload(faq_order, ADMIN)["profile"]["faq_settings"]
    ok("a filled FAQ switches the accordion on", fq["enabled"] is True)
    ok("both {q,a} and {question,answer} shapes accepted", len(fq["items"]) == 2)
    ok("a half-written question is dropped, not shown blank",
       all(i["q"] and i["a"] for i in fq["items"]))

    print("\n=== ceremony type decides the traditional details ===")
    from build_brief import build_brief, traditions_of
    def _with(extra_patch, top_patch=None):
        return {**ORDER, "info": {**ORDER["info"], **(top_patch or {}),
                                  "extra": {**ORDER["info"]["extra"], **extra_patch}}}

    hindu = build_invitation_payload(_with({"marriage_type": "hindu"}), ADMIN)["profile"]
    ok("hindu keeps nakshatram, muhurtam and gotram",
       hindu["nakshatram"] and hindu["muhurtam"] and hindu["custom_text"]["_maja"]["gotra"])

    # The order still CARRIES a gotram and a nakshatram from when it was Hindu.
    # A Christian invitation must not show them, no matter what is in the data.
    chris_order = _with({"marriage_type": "christian"})
    chris = build_invitation_payload(chris_order, ADMIN)
    cp = chris["profile"]
    ok("christian: no gotram", cp["custom_text"]["_maja"]["gotra"] == "")
    ok("christian: no nakshatram", cp["nakshatram"] == "")
    ok("christian: no muhurtam", cp["muhurtam"] == "")
    ok("christian: the toggles are off so no empty section renders",
       cp["custom_text"]["_maja"]["show_gotra"] is False
       and cp["custom_text"]["_maja"]["show_nakshatram"] is False)
    ok("dropping stale values is REPORTED, not silent",
       any("christian ceremony has no" in w for w in chris["warnings"]))
    ok("the ceremony is recorded on the profile",
       cp["custom_text"]["_maja"]["marriage_type"] == "christian")

    muslim = build_invitation_payload(_with({"marriage_type": "muslim"}), ADMIN)["profile"]
    ok("muslim/nikah: none of the three", not (muslim["nakshatram"] or muslim["muhurtam"]
                                               or muslim["custom_text"]["_maja"]["gotra"]))
    sikh = build_invitation_payload(_with({"marriage_type": "sikh"}), ADMIN)["profile"]
    ok("sikh: muhurtam kept, gotram dropped",
       sikh["muhurtam"] == "10:35" and sikh["custom_text"]["_maja"]["gotra"] == "")
    ok("an unknown ceremony type falls back to hindu (nothing is lost)",
       traditions_of(_with({"marriage_type": "zzz"})) == ["nakshatram", "muhurtam", "gotram"])

    print("\n=== the buyer's background choice ===")
    # "design" = keep the purchased artwork behind the text.
    d = build_invitation_payload(_with({"background_choice": "design"}), ADMIN)["profile"]
    ok("design: the couple photo is NOT used as the page background",
       d["use_couple_photo_as_invitation_bg"] is False)
    ok("design: the opening keeps the design artwork",
       d["opening_bg_source"] == "custom" and d["opening_photo_url"] == "")
    ok("design: recorded for the editor + the brief",
       d["custom_text"]["_maja"]["background_choice"] == "design")
    ok("design: the couple's photos still appear in their own sections",
       d["bride_photo_url"].endswith("bride.webp"))

    # "couple" with a real couple photo.
    c = build_invitation_payload(_with({"background_choice": "couple",
                                        "couple_photo": "/x/couple.jpg"}), ADMIN)["profile"]
    ok("couple: their photo becomes the background",
       c["use_couple_photo_as_invitation_bg"] is True and c["opening_bg_source"] == "couple")
    # "couple" with none supplied — must fall back AND say so.
    c2 = build_invitation_payload(_with({"background_choice": "couple"}), ADMIN)
    ok("couple with no couple photo: falls back to a portrait",
       c2["profile"]["opening_bg_source"] == "bride")
    ok("...and warns instead of quietly showing something else",
       any("Background was set to the couple photo" in w for w in c2["warnings"]))

    print("\n=== the build brief that reaches the admin panel ===")
    brief = build_brief({**ORDER, "buyer": ORDER["buyer"]},
                        folders={"qr": "QR FOLDER", "selfies": "SELFIE FOLDER"},
                        storage_account={"email": None, "provisioned": False},
                        slug="groom-bride-fb9efc")
    ok("names the request", "MAJA-FB9EFC" in brief)
    ok("says which design AND not to use the theme default",
       "temple_engagement_2" in brief and "not the theme's first one" in brief)
    ok("spells out the background instruction", "couple's own photo" in brief.lower())
    ok("spells out the ceremony", "Ceremony: Hindu" in brief)
    ok("lists the purchased features", "ai_face_match" in brief)
    ok("carries the phone the buyer had to give", "8328284501" in brief)
    ok("carries both Drive folders", "QR FOLDER" in brief and "SELFIE FOLDER" in brief)
    ok("is honest that no Google mail exists yet", "no Google account connected" in brief)
    ok("names missing photos outright", "Groom: NOT SUPPLIED" in brief)
    ok("ends with how to build it", "Build draft invitation" in brief)
    ok("gives the expected link", "/invite/groom-bride-fb9efc" in brief)

    chris_brief = build_brief(chris_order)
    ok("a christian brief says NOT to show gotram/nakshatram",
       "Do NOT show" in chris_brief and "gotram" in chris_brief)
    ok("a christian brief shows no traditional-details section",
       "TRADITIONAL DETAILS" not in chris_brief)
    design_brief = build_brief(_with({"background_choice": "design"}))
    ok("a design-background brief says not to put the photo behind the text",
       "Do NOT put the couple photo behind the text" in design_brief)
    ok("the brief survives a completely empty order",
       "BUILD IT LIKE THIS" in build_brief({}))

    print("\n=== phone normalisation ===")
    ok("+91 with spaces", normalise_phone("+91 83282 84501") == "+918328284501")
    ok("bare 10 digits", normalise_phone("9876543210") == "+919876543210")
    ok("leading zero", normalise_phone("08328284501") == "+918328284501")
    ok("91-prefixed 12 digits", normalise_phone("918328284501") == "+918328284501")
    ok("junk is dropped, not shipped malformed", normalise_phone("call me") is None)
    ok("empty is None", normalise_phone("") is None)

    print("\n=== languages ===")
    lang, enabled, unsupported = normalise_languages("Telugu", ["Hindi"])
    ok("chosen primary leads", lang == ["telugu"] and enabled[0] == "telugu")
    ok("english appended as the mandatory fallback", "english" in enabled)
    _, en2, unsup2 = normalise_languages("Odia", ["Urdu", "Tamil"])
    ok("sellable-but-unrenderable languages are reported", unsup2 == ["odia", "urdu"])
    ok("...and dropped from the invitation", set(en2) == {"tamil", "english"})
    ok("no english at all still yields english", normalise_languages("", [])[1] == ["english"])

    print("\n=== map links ===")
    ok("place pin beats camera",
       parse_latlng("https://maps.google.com/@16.4,80.12,14z/data=!3d16.3999857!4d80.1448313")
       == (16.3999857, 80.1448313))
    ok("camera used when there is no place pin",
       parse_latlng("https://maps.google.com/maps/@16.4,80.12,14z") == (16.4, 80.12))
    ok("?q= style link", parse_latlng("https://maps.google.com/?q=16.24615,80.5703") == (16.24615, 80.5703))
    ok("a name-only link yields no pin",
       parse_latlng("https://maps.google.com/maps/place/Nirmala+Nagar") == (None, None))
    ok("empty link is safe", parse_latlng("") == (None, None))

    print("\n=== edges that must not produce a broken invitation ===")
    bad = {
        "fulfillment_code": "MAJA-EDGE01",
        "buyer_kind": "user",
        "theme_id": "royal_mughal",
        "event_type": "Wedding",
        "package": "classic",
        "addons": [{"key": "unknown_feature_xyz"}],
        "info": {"bride_name": "", "groom_name": "", "venue": "", "phone": "12",
                 "event_date": "not-a-date",
                 "extra": {"primary_language": "Klingon", "other_languages": [],
                           "venue_google_map_link": "https://maps.google.com/maps/place/Somewhere"}},
    }
    b2 = build_invitation_payload(bad, "owner-1")
    p2 = b2["profile"]
    ok("no names → placeholders + warnings",
       p2["bride_name"] == "Bride" and p2["groom_name"] == "Groom"
       and any("No bride name" in w for w in b2["warnings"]))
    ok("unusable date → fallback + a loud warning",
       any("No usable event date" in w for w in b2["warnings"]))
    ok("missing venue → TBA", p2["venue"] == "TBA")
    ok("Wedding → marriage", p2["event_type"] == "marriage")
    ok("classic → SILVER", p2["plan_type"] == "SILVER")
    ok("unknown language dropped to english", p2["enabled_languages"] == ["english"])
    ok("bad phone dropped + warned",
       p2["contact_info"]["groom_phone"] is None
       and any("isn't a valid" in w for w in b2["warnings"]))
    ok("map link without coordinates is warned about",
       any("Could not read coordinates" in w for w in b2["warnings"]))
    ok("unknown feature key enables nothing dangerous",
       p2["sections_enabled"]["qr"] is False and p2["sections_enabled"]["video"] is False)
    ok("slug still built without names", p2["slug"] == "invite-maja-edge01")

    print("\n=== feature keys ===")
    ok("addons + quote addons merge, deduped",
       feature_keys({"addons": [{"key": "a"}], "quote": {"addons": [{"key": "a"}, {"key": "b"}]}})
       == ["a", "b"])
    ok("plain string add-ons accepted", feature_keys({"addons": ["x"]}) == ["x"])
    ok("no add-ons is empty", feature_keys({}) == [])

    import asyncio
    asyncio.run(endpoint_checks())

    print("\n" + "=" * 60)
    print(f"{PASS} checks passed, {len(FAIL)} failed")
    if FAIL:
        for f in FAIL:
            print(f"  - {f}")
        sys.exit(1)


if __name__ == "__main__":
    main()
