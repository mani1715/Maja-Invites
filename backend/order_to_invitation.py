"""
order_to_invitation.py — turn a paid order's filled form into a real invitation.

The fulfillment flow (INVITATION_FULFILLMENT.md) is: buyer pays → buyer fills the
details form → the MAJA team builds the invitation → the owner delivers the link.
Step 3 used to start from an empty editor: the owner read the order JSON and
re-typed the couple's details by hand. Every field re-typed is a field that can be
mistyped, and nothing in the order was ever verified against what the invitation
actually renders.

This module does that translation ONCE, in code:

    order["info"]  ──►  a `profiles` document the invitation page can render

It is deliberately a PURE function over the order dict (no db, no network), so it
is fully testable and so the same mapping can be reused by any caller. The output
is shaped exactly like the body `LuxuryProfileForm` posts — including the
`custom_text._maja` extension bag — so the owner can open the normal editor
afterwards, see every value in its usual place, and correct anything wrong.

What it deliberately does NOT do:
  * publish. The result is a DRAFT (`status="draft"`, `is_published=False`) that is
    previewable at /invite/<slug> but not delivered to the buyer. Delivering stays
    the owner's explicit "update" step, exactly as the playbook requires.
  * invent content. Every value comes from the order. Missing fields are reported
    in `warnings` for the owner to fill, never guessed.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("order_to_invitation")

# Languages the invitation model accepts (models.Profile.enabled_languages).
# NOTE: the cart's LANGUAGE_CATALOG no longer sells `odia` or `urdu` (removed
# this release) and now matches this set. Any language outside this set is
# still dropped here and reported as a warning rather than 500-ing the build,
# as a defensive fallback. See build_invitation_payload().
RENDERABLE_LANGUAGES = {
    "english", "hindi", "tamil", "telugu", "bengali", "punjabi",
    "hinglish", "marathi", "gujarati", "kannada", "malayalam",
}

# Order event_type / primary event → the invitation's event_type.
_EVENT_TYPES = {
    "wedding": "marriage", "marriage": "marriage",
    "engagement": "engagement", "haldi": "haldi", "mehendi": "mehendi",
    "mehndi": "mehendi", "sangeet": "sangeet", "reception": "reception",
}

# package → plan tier on the profile (drives theme/feature gating). "royal" used
# to fall through to the .get(..., "GOLD") default silently — made explicit here
# per the 2026 pricing redesign (docs/PRICING_REDESIGN_2026.md §6) so the mapping
# is a deliberate decision, not an accident that happens to land on the right tier.
_PLAN_BY_PACKAGE = {
    "bespoke": "PLATINUM", "platinum": "PLATINUM",
    "premium": "GOLD", "gold": "GOLD",
    "classic": "SILVER", "silver": "SILVER",
    "royal": "GOLD",
}

# Invitation Suite (docs §6) orders carry order_type="invitation_suite" and
# invitation_tier instead of the legacy `package` field — a separate mapping,
# branched on in build_invitation_payload below.
_PLAN_BY_INVITATION_SUITE_TIER = {"basic": "SILVER", "premium": "GOLD", "custom": "PLATINUM"}

# Paid feature keys (à-la-carte + legacy add-on names) → the invitation sections
# they switch on. An unknown key simply enables nothing.
_FEATURE_SECTIONS = {
    "qr_live_gallery": ("photos", "qr"),
    "live_gallery": ("photos", "qr"),          # legacy add-on name
    "guest_uploads": ("photos", "qr"),
    "enhanced_gallery": ("photos",),
    "ai_face_match": ("photos", "qr"),
    "selfie_search": ("photos", "qr"),
    "custom_video": ("video",),
    "custom_video_editing": ("video",),
    "live_streaming": ("live_stream",),
}


# --------------------------------------------------------------------------- #
# small, boring helpers — each one is a thing that used to be typed by hand
# --------------------------------------------------------------------------- #
def _s(v: Any) -> str:
    return str(v).strip() if v is not None else ""


def _slug_part(name: str) -> str:
    """First word of a name, lowercased, letters only."""
    first = (_s(name).split() or [""])[0]
    return re.sub(r"[^a-z]", "", first.lower())


def build_slug(order: Dict[str, Any]) -> str:
    """`groom-bride-fb9efc` — derived from the fulfillment code, so rebuilding the
    same order produces the same slug instead of a second orphan link."""
    info = order.get("info") or {}
    groom = _slug_part(info.get("groom_name") or "") or "invite"
    bride = _slug_part(info.get("bride_name") or "") or "maja"
    code = re.sub(r"[^a-z0-9]", "", _s(order.get("fulfillment_code")).lower())
    tail = code[-6:] or re.sub(r"[^a-z0-9]", "", _s(order.get("id")).lower())[-6:] or "link"
    return f"{groom}-{bride}-{tail}"


def normalise_phone(raw: Any) -> Optional[str]:
    """India-first E.164, because `contact_info` rejects anything else.

    "8328284501" → "+918328284501"; "+91 83282 84501" → "+918328284501";
    anything that can't be made into E.164 → None (dropped, and warned about),
    never a malformed string that would fail validation on the whole profile.
    """
    s = _s(raw)
    if not s:
        return None
    plus = s.startswith("+")
    digits = re.sub(r"\D", "", s)
    if not digits:
        return None
    if plus:
        return f"+{digits}" if 8 <= len(digits) <= 15 else None
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    if len(digits) == 11 and digits.startswith("0"):
        return f"+91{digits[1:]}"
    return None


def normalise_languages(primary: Any, others: Any) -> Tuple[List[str], List[str], List[str]]:
    """(language, enabled_languages, unsupported) — all lowercase codes.

    English is forced in because the model requires it as the fallback, and the
    primary language is kept FIRST so the invitation opens in the language the
    couple actually chose.
    """
    def code(v: Any) -> str:
        return re.sub(r"[^a-z]", "", _s(v).lower())

    prim = code(primary)
    rest = [code(x) for x in (others or []) if code(x)]
    unsupported = sorted({c for c in ([prim] + rest) if c and c not in RENDERABLE_LANGUAGES})

    ordered: List[str] = []
    for c in [prim] + rest + ["english"]:
        if c in RENDERABLE_LANGUAGES and c not in ordered:
            ordered.append(c)
    if not ordered:
        ordered = ["english"]
    primary_code = ordered[0]
    return [primary_code], ordered, unsupported


def parse_latlng(url: Any) -> Tuple[Optional[float], Optional[float]]:
    """Pull a drop-pin out of a pasted Google Maps link.

    Prefers the `!3d<lat>!4d<lng>` pair (the resolved PLACE) over `@lat,lng`
    (the map's camera, which is usually offset from the venue), then falls back
    to a `?q=lat,lng` style link.
    """
    u = _s(url)
    if not u:
        return None, None
    for pat in (r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)",
                r"@(-?\d+\.\d+),(-?\d+\.\d+)",
                r"[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)",
                r"/(-?\d+\.\d+),(-?\d+\.\d+)"):
        m = re.search(pat, u)
        if m:
            try:
                lat, lng = float(m.group(1)), float(m.group(2))
            except ValueError:
                continue
            if -90 <= lat <= 90 and -180 <= lng <= 180:
                return lat, lng
    return None, None


def _event_datetime(info: Dict[str, Any], extra: Dict[str, Any]) -> Tuple[datetime, bool]:
    """(when, exact) — the ceremony datetime, and whether the date was real.

    A missing date falls back to 30 days out (the same fallback the editor uses)
    and is reported, because a profile cannot exist without one.
    """
    date_s = _s(info.get("event_date") or extra.get("event_date"))[:10]
    time_s = _s(extra.get("wedding_time") or info.get("wedding_time"))
    hh, mm = 12, 0
    m = re.match(r"^(\d{1,2}):(\d{2})", time_s)
    if m:
        hh, mm = min(23, int(m.group(1))), min(59, int(m.group(2)))
    try:
        d = datetime.strptime(date_s, "%Y-%m-%d")
        return d.replace(hour=hh, minute=mm, tzinfo=timezone.utc), True
    except ValueError:
        return datetime.now(timezone.utc) + timedelta(days=30), False


def _pair(label_a: str, a: Any, label_b: str, b: Any) -> str:
    """"Anuradha (bride) · Rohini (groom)" — the invitation shows one line for
    nakshatram/gotram, while the form collects one per side."""
    parts = [f"{_s(v)} ({lbl})" for lbl, v in ((label_a, a), (label_b, b)) if _s(v)]
    return " · ".join(parts)


def feature_keys(order: Dict[str, Any]) -> List[str]:
    """Every paid feature/add-on key on this order, deduped, order preserved."""
    out: List[str] = []
    for src in (order.get("addons") or [], (order.get("quote") or {}).get("addons") or []):
        for a in src:
            k = a.get("key") if isinstance(a, dict) else a
            k = _s(k)
            if k and k not in out:
                out.append(k)
    return out


# --------------------------------------------------------------------------- #
# the mapping
# --------------------------------------------------------------------------- #
def build_invitation_payload(order: Dict[str, Any], admin_id: str,
                             slug: Optional[str] = None) -> Dict[str, Any]:
    """Order → {"profile": <profiles doc>, "warnings": [...], "slug": str}.

    `profile` is a plain JSON-safe dict, validated through models.Profile when
    that import is available (it is, in the app) so a bad mapping fails HERE
    rather than at render time. `warnings` lists everything the owner still needs
    to look at — placeholders, dropped values, missing photos.
    """
    from build_brief import background_of, ceremony_of, traditions_of

    info = order.get("info") or {}
    extra = info.get("extra") or {}
    warnings: List[str] = []
    slug = slug or build_slug(order)

    bride = _s(info.get("bride_name")) or "Bride"
    groom = _s(info.get("groom_name")) or "Groom"
    for who, val in (("bride", info.get("bride_name")), ("groom", info.get("groom_name"))):
        v = _s(val)
        if not v:
            warnings.append(f"No {who} name in the order — using a placeholder.")
        elif v.lower() in ("bride", "groom", "test", "na", "n/a", "-"):
            warnings.append(f"The {who} name is a placeholder (\"{v}\") — confirm the real name.")

    when, exact_date = _event_datetime(info, extra)
    if not exact_date:
        warnings.append("No usable event date in the order — set to 30 days from now; fix before delivering.")

    language, enabled_languages, unsupported = normalise_languages(
        extra.get("primary_language"), extra.get("other_languages"))
    if unsupported:
        warnings.append(
            "These purchased languages cannot be rendered yet and were dropped: "
            + ", ".join(unsupported) + ". Refund or add support before delivering.")

    # ---- venue + map -----------------------------------------------------
    venue_link = _s(extra.get("venue_google_map_link"))
    lat, lng = parse_latlng(venue_link)
    parking = extra.get("parking") or {}
    parking_text = _s(parking.get("text"))
    if parking.get("enabled") and not parking_text:
        warnings.append("Parking is switched on but has no description.")
    map_settings: Dict[str, Any] = {"embed_enabled": bool(venue_link)}
    if venue_link:
        map_settings["map_link"] = venue_link
    if lat is not None:
        map_settings["latitude"], map_settings["longitude"] = lat, lng
    elif venue_link:
        warnings.append("Could not read coordinates from the venue map link — "
                        "ride/direction buttons will use the venue name only.")
    if parking_text:
        map_settings["parking_info"] = parking_text

    # ---- photos ----------------------------------------------------------
    bride_photo = _s(extra.get("bride_photo"))
    groom_photo = _s(extra.get("groom_photo"))
    couple_photo = _s(extra.get("couple_photo"))
    other_photos = [_s(p) for p in (extra.get("other_photos") or []) if _s(p)]
    missing_photos = [n for n, v in (("bride", bride_photo), ("groom", groom_photo),
                                     ("couple", couple_photo)) if not v]
    if missing_photos:
        warnings.append("No " + ", ".join(missing_photos) + " photo — those sections will "
                        "render without an image until one is added.")
    # What goes BEHIND the invitation — the buyer's own choice (see build_brief):
    #   "couple" -> their photo fills the opening + page background; with no couple
    #               photo, fall back to whichever portrait exists so the hero is
    #               never an empty frame (and say so in the warnings).
    #   "design"  -> keep the purchased design's artwork exactly as previewed; the
    #               couple's photos still appear in their own sections.
    background_choice = background_of(order)
    if background_choice == "design":
        opening_source, opening_url = "custom", ""
    else:
        opening_source = "couple" if couple_photo else ("bride" if bride_photo else
                                                        ("groom" if groom_photo else "custom"))
        opening_url = {"couple": couple_photo, "bride": bride_photo,
                       "groom": groom_photo}.get(opening_source, "")
        if not couple_photo:
            warnings.append("Background was set to the couple photo but none was supplied — "
                            + (f"using the {opening_source}'s portrait." if opening_url
                               else "the design artwork will show through."))

    # ---- features → sections --------------------------------------------
    feats = feature_keys(order)
    # Invitation Suite (docs §6/§9 item 7): components are deliverables the
    # studio has to produce (digital / video / physical), not automatically
    # builder features — except "video", which DOES have a matching builder
    # section, so a suite order that paid for it must actually switch that
    # section on rather than leave the buyer's video invisible on delivery.
    is_suite = _s(order.get("order_type")).lower() == "invitation_suite"
    suite_components = ([_s(c).lower() for c in (order.get("components") or []) if _s(c)]
                        if is_suite else [])
    sections = {
        "opening": True, "welcome": True, "couple": True, "footer": True,
        "events": True, "greetings": True,
        "about": bool(_s(extra.get("about_bride")) or _s(extra.get("about_groom"))
                      or _s(extra.get("couple_story"))),
        "love_story": bool(_s(extra.get("couple_story"))),
        "family": any(_s(extra.get(k)) for k in
                      ("bride_father", "bride_mother", "groom_father", "groom_mother")),
        "photos": bool(other_photos),
        "video": "video" in suite_components,
        "qr": False,
        "live_stream": bool(_s(extra.get("live_link"))),
        "pre_wedding": bool(extra.get("pre_wedding_links")),
        # Included-with-every-design features (store_features.FEATURES).
        "rsvp": True, "countdown": True, "calendar": True, "contact": True,
    }
    for k in feats:
        for sec in _FEATURE_SECTIONS.get(k, ()):
            sections[sec] = True
    if sections["qr"] and not other_photos:
        warnings.append("A photo feature was purchased but no photos are in the order — "
                        "the gallery/QR starts empty until the studio uploads.")
    if "physical" in suite_components:
        warnings.append("This order includes a Physical Design deliverable — there is no "
                        "on-page section for it; track and ship it outside the invitation.")

    # ---- contact ---------------------------------------------------------
    phone = normalise_phone(info.get("phone"))
    if _s(info.get("phone")) and not phone:
        warnings.append(f"Contact number \"{_s(info.get('phone'))}\" isn't a valid "
                        "number — left blank rather than shown wrong.")
    contact_info = {"groom_phone": phone, "bride_phone": phone,
                    "email": _s((order.get("buyer") or {}).get("email")) or None}

    # ---- money-collecting sections (opt-in, so honour the toggles) -------
    shagun = extra.get("shagun") or {}
    honeymoon = extra.get("honeymoon_fund") or {}
    hm = {
        "enabled": bool(honeymoon.get("enabled")),
        "title": _s(honeymoon.get("title")) or "Honeymoon Fund",
        "message": _s(honeymoon.get("message")) or
                   "If you wish to bless our new beginnings, you may contribute below.",
        "upi_id": _s(honeymoon.get("upi_id")) or None,
        "payee_name": _s(honeymoon.get("payee_name")) or None,
    }
    if hm["enabled"] and not hm["upi_id"]:
        warnings.append("Honeymoon fund is on but has no UPI id — guests would see an "
                        "empty payment box.")
    shagun_on = bool(shagun.get("enabled"))
    if shagun_on and not _s(shagun.get("upi_id")):
        warnings.append("Digital shagun is on but has no UPI id.")

    # Ceremony type is authoritative over the traditional details: a Christian or
    # Muslim invitation must not carry a gotram even if a value is sitting in the
    # order from before the buyer switched type.
    ceremony = ceremony_of(order)
    allowed_traditions = traditions_of(order)

    muhurtam_block = extra.get("muhurtam") or {}
    nakshatram_block = extra.get("nakshatram") or {}
    gotram_block = extra.get("gotram") or {}
    def _tradition(key, value):
        """Empty unless this ceremony has it AND the buyer switched it on."""
        if key not in allowed_traditions:
            return ""
        blk = {"muhurtam": muhurtam_block, "nakshatram": nakshatram_block,
               "gotram": gotram_block}[key]
        return value if blk.get("enabled") is not False else ""

    muhurtam = _tradition("muhurtam", _s(muhurtam_block.get("value")))
    nakshatram = _tradition("nakshatram", _pair("bride", nakshatram_block.get("bride"),
                                                "groom", nakshatram_block.get("groom")))
    gotram = _tradition("gotram", _pair("bride", gotram_block.get("bride"),
                                        "groom", gotram_block.get("groom")))
    for label, blk in (("nakshatram", nakshatram_block), ("gotram", gotram_block)):
        if label in allowed_traditions and blk.get("enabled")                 and not (_s(blk.get("bride")) and _s(blk.get("groom"))):
            warnings.append(f"Only one side's {label} was given — the other side is blank.")
    dropped = [k for k in ("nakshatram", "muhurtam", "gotram")
               if k not in allowed_traditions
               and ((extra.get(k) or {}).get("enabled")
                    and any(_s(v) for v in (extra.get(k) or {}).values() if isinstance(v, str)))]
    if dropped:
        warnings.append(f"A {ceremony} ceremony has no {', '.join(dropped)} — "
                        "stale values in the order were left off the invitation.")

    music_url = _s(extra.get("background_music_url"))
    live_link = _s(extra.get("live_link"))

    # Guest FAQ: the cart collects it, the invitation has an accordion for it, and
    # nothing joined the two until now. Accepts either {q,a} or {question,answer}.
    faq_items = []
    for f in (extra.get("faq") or []):
        if not isinstance(f, dict):
            continue
        q = _s(f.get("q") or f.get("question"))
        a = _s(f.get("a") or f.get("answer"))
        if q and a:
            faq_items.append({"q": q, "a": a})
    faq_settings = ({"enabled": True, "title": "Good to know", "items": faq_items}
                    if faq_items else None)

    pre_wedding_links = []
    for l in (extra.get("pre_wedding_links") or []):
        url = _s((l or {}).get("url"))
        if not url:
            continue
        pre_wedding_links.append({"label": _s((l or {}).get("label")) or "Pre-wedding",
                                  "url": url, "kind": _s((l or {}).get("kind")) or "auto"})

    event_type = _EVENT_TYPES.get(_s(order.get("event_type")).lower(), "marriage")
    theme = _s(order.get("theme_id")) or "royal_mughal"
    package = _s(order.get("package")).lower()
    # Invitation Suite orders (order_type="invitation_suite") are priced/tiered by
    # invitation_tier, not the legacy `package` field — branch before falling back
    # to the package mapping.
    if is_suite:
        plan_type = _PLAN_BY_INVITATION_SUITE_TIER.get(
            _s(order.get("invitation_tier")).lower(), "GOLD")
    else:
        plan_type = _PLAN_BY_PACKAGE.get(package, "GOLD")

    story = _s(extra.get("couple_story"))
    family_bits = [f"{lbl}: {_s(extra.get(k))}" for k, lbl in
                   (("bride_father", "Bride's father"), ("bride_mother", "Bride's mother"),
                    ("groom_father", "Groom's father"), ("groom_mother", "Groom's mother"))
                   if _s(extra.get(k))]

    profile: Dict[str, Any] = {
        "admin_id": admin_id,
        "slug": slug,
        "bride_name": bride,
        "groom_name": groom,
        "event_type": event_type,
        "event_date": when.isoformat(),
        "venue": _s(info.get("venue")) or "TBA",
        "city": _s(info.get("city")),
        "design_id": theme,
        "selected_design_key": theme,
        # The specific card the buyer picked, in the shape the public page reads
        # (resolveHeroDesign checks design_selections.Marriage, then .hero). The
        # event-named key is there for the per-event picker. Without this the page
        # renders the theme's FIRST design instead of the purchased one.
        "design_selections": ({"hero": _s(order.get("design_id")),
                               (_s(order.get("event_type")) or "Marriage"): _s(order.get("design_id"))}
                              if _s(order.get("design_id")) else {}),
        "language": language,
        "enabled_languages": enabled_languages,
        "love_story": story,
        "family_details": " · ".join(family_bits),
        "bride_about": _s(extra.get("about_bride")),
        "groom_about": _s(extra.get("about_groom")),
        "couple_about": story,
        "nakshatram": nakshatram,
        "muhurtam": muhurtam,
        "bride_photo_url": bride_photo,
        "groom_photo_url": groom_photo,
        "couple_photo_url": couple_photo,
        "show_bride_photo": True, "show_groom_photo": True, "show_couple_photo": True,
        "use_couple_photo_as_opening_bg": opening_source == "couple",
        "use_couple_photo_as_invitation_bg": background_choice == "couple",
        "use_couple_photo_as_qr_bg": background_choice == "couple",
        "opening_bg_source": opening_source,
        "opening_photo_url": opening_url,
        "events": [],          # per-event CMS stays in _maja.events_extended (as the editor does)
        "sections_enabled": sections,
        "map_settings": map_settings,
        "contact_info": contact_info,
        "honeymoon_fund": hm,
        "digital_shagun_enabled": shagun_on,
        "phonepe_upi_id": _s(shagun.get("upi_id")) or None,
        "pre_wedding_links": pre_wedding_links,
        "faq_settings": faq_settings,
        "live_stream": {"enabled": bool(live_link), "url": live_link or None,
                        "platform": "youtube" if "youtu" in live_link else None,
                        "embed_enabled": True},
        "link_expiry_type": "permanent",
        "plan_type": plan_type,
        "selected_features": feats,
        "title": f"{bride} & {groom} — {_s(order.get('event_type')) or 'Wedding'}",
        "status": "draft",
        "is_active": True,
        # A draft, on purpose: previewable at /invite/<slug>, not delivered.
        "is_published": False,
        "is_enabled": False,
        "invitation_category": "wedding",
        # Everything the invitation reads from the MAJA extension bag. Same keys
        # the editor writes, so the owner sees them in the normal form afterwards.
        "custom_text": {"_maja": {
            "bride_photo_url": bride_photo,
            "groom_photo_url": groom_photo,
            "couple_photo_url": couple_photo,
            "couple_photos": other_photos,
            "opening_bg_source": opening_source,
            "opening_photo_url": opening_url,
            "background_choice": background_choice,
            "marriage_type": ceremony,
            "venue_google_map_link": venue_link,
            "parking": {"enabled": bool(parking.get("enabled")),
                        "text": parking_text,
                        "google_map_link": _s(parking.get("google_map_link"))},
            "languages": enabled_languages[1:],
            "primary_event": _s(order.get("event_type")) or "Marriage",
            "design_id": _s(order.get("design_id")),
            "bride_father": _s(extra.get("bride_father")),
            "bride_mother": _s(extra.get("bride_mother")),
            "groom_father": _s(extra.get("groom_father")),
            "groom_mother": _s(extra.get("groom_mother")),
            "wedding_time": _s(extra.get("wedding_time")),
            "meal_time": _s(extra.get("meal")),
            "youtube_live_url": live_link,
            "nakshatram": nakshatram,
            "muhurtam": muhurtam,
            "gotra": gotram,
            "show_nakshatram": bool(nakshatram),
            "show_muhurtam": bool(muhurtam),
            "show_gotra": bool(gotram),
            "show_poem": False,
            "events_extended": "[]",
            # provenance — so anyone opening this profile knows where it came from
            "built_from_order": _s(order.get("fulfillment_code")),
        }},
    }

    # Validate through the real model when it is importable, so a mapping mistake
    # surfaces here instead of as a broken invitation page.
    try:
        from models import Profile
        # mode="json" so datetimes and str-enums (status) come out storable.
        validated = Profile(**profile).model_dump(mode="json")
        # Model-dropped extras that the app genuinely stores/reads are re-applied.
        validated.update({k: profile[k] for k in
                          ("is_published", "is_enabled", "selected_design_key") if k in profile})
        # BackgroundMusic on the model is `file_url`, while the editor and the
        # public page read `url`. Write BOTH so neither side silently plays nothing.
        validated["background_music"] = {"enabled": bool(music_url), "url": music_url,
                                         "file_url": music_url, "autoplay": False}
        profile = validated
    except ImportError:                      # pragma: no cover - app always has models
        profile["background_music"] = {"enabled": bool(music_url), "url": music_url,
                                       "file_url": music_url, "autoplay": False}
        logger.warning("[order_to_invitation] models unavailable — payload unvalidated")

    return {"profile": profile, "slug": slug, "warnings": warnings,
            "features": feats, "languages": enabled_languages,
            # Invitation Suite components (§9 item 7): "digital"/"video" both
            # already have a home (the invitation itself, sections.video) —
            # "physical" doesn't (no on-page section exists for a printed
            # card), so it isn't invented one. Surfaced here instead, on the
            # same built payload the fulfillment console already reads
            # warnings/features/languages from.
            "deliverables": suite_components}
