"""
build_brief.py — the build prompt that travels with every request.

The owner's workflow: a request lands in the fulfillment console, they download it,
hand it over, and an invitation gets built from it. That only works if the download
SAYS everything — including the two choices that change how the page is built and
which used to exist nowhere except as raw JSON keys:

  * the background: the couple's own photo, or the design's own artwork exactly as
    shown in the preview they bought;
  * the ceremony type: a Christian or Muslim wedding has no gotram or nakshatram,
    so the brief states that outright instead of leaving a blank field to guess at.

So this renders one plain-text brief: every decision spelled out, every missing
piece named, and the exact build command to run. Deterministic (same order in →
same text out) and pure — no db, no network — so it is testable and can be
regenerated for any request at any time.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

# Same catalogue as the buyer's form (OrderDetailsForm.MARRIAGE_TYPES). Kept here
# because the brief must be able to say "a Christian ceremony has no gotram" in
# words, not just omit a field.
CEREMONY = {
    "hindu":     {"label": "Hindu",          "traditions": ["nakshatram", "muhurtam", "gotram"]},
    "christian": {"label": "Christian",      "traditions": []},
    "muslim":    {"label": "Muslim / Nikah", "traditions": []},
    "sikh":      {"label": "Sikh",           "traditions": ["muhurtam"]},
    "other":     {"label": "Other / mixed",  "traditions": ["nakshatram", "muhurtam", "gotram"]},
}
ALL_TRADITIONS = ["nakshatram", "muhurtam", "gotram"]

BACKGROUND = {
    "couple": ("The couple's own photo",
               "Use the couple photo as the opening animation and the page background. "
               "If no couple photo was supplied, use the bride's or groom's portrait and "
               "flag it — do NOT fall back to the design artwork silently."),
    "design": ("The design's own artwork (as previewed)",
               "Keep the purchased design's artwork as the opening and the background, "
               "exactly as it appeared in the preview. Do NOT put the couple photo behind "
               "the text; their photos still appear in the bride/groom/couple sections."),
}


def _s(v: Any) -> str:
    return str(v).strip() if v is not None else ""


def ceremony_of(order: Dict[str, Any]) -> str:
    extra = ((order.get("info") or {}).get("extra") or {})
    t = _s(extra.get("marriage_type")).lower()
    return t if t in CEREMONY else "hindu"


def background_of(order: Dict[str, Any]) -> str:
    extra = ((order.get("info") or {}).get("extra") or {})
    b = _s(extra.get("background_choice")).lower()
    return b if b in BACKGROUND else "couple"


def traditions_of(order: Dict[str, Any]) -> List[str]:
    """The traditional details this ceremony HAS — the rest must not be rendered."""
    return list(CEREMONY[ceremony_of(order)]["traditions"])


def _bullet(lines: List[str], label: str, value: Any) -> None:
    v = _s(value)
    if v:
        lines.append(f"  - {label}: {v}")


def build_brief(order: Dict[str, Any], folders: Optional[Dict[str, str]] = None,
                storage_account: Optional[Dict[str, Any]] = None,
                slug: Optional[str] = None) -> str:
    """One plain-text build brief for a request. Safe on a half-filled order."""
    info = order.get("info") or {}
    extra = info.get("extra") or {}
    code = _s(order.get("fulfillment_code")) or "(no code)"
    cer = ceremony_of(order)
    bg = background_of(order)
    keeps = traditions_of(order)
    drops = [t for t in ALL_TRADITIONS if t not in keeps]

    bride, groom = _s(info.get("bride_name")), _s(info.get("groom_name"))
    L: List[str] = []
    L.append(f"MAJA INVITATION BUILD BRIEF — {code}")
    L.append("=" * 58)
    L.append("")
    L.append("BUILD IT LIKE THIS")
    L.append(f"  1. Design: {_s(order.get('design_id')) or '(none chosen)'} "
             f"on theme {_s(order.get('theme_id')) or '(default)'}. "
             "Use THAT design — not the theme's first one.")
    L.append(f"  2. Background: {BACKGROUND[bg][0]}.")
    L.append(f"     {BACKGROUND[bg][1]}")
    L.append(f"  3. Ceremony: {CEREMONY[cer]['label']}.")
    if keeps:
        L.append(f"     Show these traditional details: {', '.join(keeps)}.")
    else:
        L.append("     Show NO traditional details.")
    if drops:
        L.append(f"     Do NOT show (this ceremony does not have them): {', '.join(drops)}.")
    L.append("")

    L.append("THE COUPLE")
    _bullet(L, "Bride", bride)
    _bullet(L, "Groom", groom)
    _bullet(L, "Bride's parents", " & ".join(
        [v for v in (_s(extra.get("bride_father")), _s(extra.get("bride_mother"))) if v]))
    _bullet(L, "Groom's parents", " & ".join(
        [v for v in (_s(extra.get("groom_father")), _s(extra.get("groom_mother"))) if v]))
    _bullet(L, "About the bride", _s(extra.get("about_bride")))
    _bullet(L, "About the groom", _s(extra.get("about_groom")))
    _bullet(L, "Their story", _s(extra.get("couple_story")))
    L.append("")

    L.append("WHEN & WHERE")
    _bullet(L, "Date", info.get("event_date"))
    _bullet(L, "Time", extra.get("wedding_time"))
    _bullet(L, "Meal", extra.get("meal"))
    _bullet(L, "Venue", info.get("venue"))
    _bullet(L, "City", info.get("city"))
    _bullet(L, "Venue map link", extra.get("venue_google_map_link"))
    park = extra.get("parking") or {}
    if park.get("enabled"):
        _bullet(L, "Parking", _s(park.get("text")) or "(enabled but no text given)")
        _bullet(L, "Parking map link", park.get("google_map_link"))
    L.append("")

    if keeps:
        L.append("TRADITIONAL DETAILS (only these)")
        if "muhurtam" in keeps:
            m = extra.get("muhurtam") or {}
            if m.get("enabled"):
                _bullet(L, "Muhurtam", m.get("value"))
        for key in ("nakshatram", "gotram"):
            if key in keeps:
                blk = extra.get(key) or {}
                if blk.get("enabled"):
                    _bullet(L, key.capitalize(),
                            " · ".join([f"{v} ({side})" for side, v in
                                        (("bride", _s(blk.get("bride"))),
                                         ("groom", _s(blk.get("groom")))) if v])
                            or "(enabled but empty)")
        L.append("")

    L.append("LANGUAGES")
    _bullet(L, "Main", extra.get("primary_language") or "English")
    others = [o for o in (extra.get("other_languages") or []) if _s(o)]
    _bullet(L, "Also on the invitation", ", ".join(others) or "none")
    L.append("")

    L.append("PHOTOS")
    for label, key in (("Bride", "bride_photo"), ("Groom", "groom_photo"), ("Couple", "couple_photo")):
        v = _s(extra.get(key))
        L.append(f"  - {label}: {v if v else 'NOT SUPPLIED'}")
    gallery = [g for g in (extra.get("other_photos") or []) if _s(g)]
    L.append(f"  - Gallery photos: {len(gallery)}")
    if bg == "couple" and not _s(extra.get("couple_photo")):
        L.append("  ! Background is meant to be the couple photo, but none was supplied.")
    L.append("")

    L.append("MEDIA & LINKS")
    _bullet(L, "Background music", extra.get("background_music_url"))
    _bullet(L, "Live stream", extra.get("live_link"))
    for pl in (extra.get("pre_wedding_links") or []):
        if _s((pl or {}).get("url")):
            L.append(f"  - Pre-wedding ({_s(pl.get('label')) or 'link'}): {_s(pl.get('url'))}")
    L.append("")

    faq = [f for f in (extra.get("faq") or []) if isinstance(f, dict)
           and _s(f.get("q") or f.get("question"))]
    if faq:
        L.append("GUEST FAQ")
        for f in faq:
            L.append(f"  - Q: {_s(f.get('q') or f.get('question'))}")
            L.append(f"    A: {_s(f.get('a') or f.get('answer')) or '(no answer given)'}")
        L.append("")

    gifts = []
    sh = extra.get("shagun") or {}
    hm = extra.get("honeymoon_fund") or {}
    if sh.get("enabled"):
        gifts.append(f"Digital shagun (UPI: {_s(sh.get('upi_id')) or 'MISSING'})")
    if hm.get("enabled"):
        gifts.append(f"Honeymoon fund (UPI: {_s(hm.get('upi_id')) or 'MISSING'})")
    if gifts:
        L.append("GIFTS")
        for g in gifts:
            L.append(f"  - {g}")
        L.append("")

    L.append("PURCHASED FEATURES")
    feats = []
    for a in (order.get("addons") or []):
        k = a.get("key") if isinstance(a, dict) else a
        label = a.get("label") if isinstance(a, dict) else None
        if _s(k):
            feats.append(f"{_s(label) or _s(k)} [{_s(k)}]")
    if feats:
        for f in feats:
            L.append(f"  - {f}")
    else:
        L.append("  - none beyond what the design includes")
    L.append("")

    L.append("CONTACT")
    buyer = order.get("buyer") or {}
    _bullet(L, "Buyer", buyer.get("name"))
    _bullet(L, "Buyer kind", order.get("buyer_kind"))
    _bullet(L, "Phone given on the form", info.get("phone"))
    _bullet(L, "Buyer email", buyer.get("email"))
    L.append("")

    if folders or storage_account:
        L.append("DRIVE FOLDERS")
        _bullet(L, "QR photos folder", (folders or {}).get("qr"))
        _bullet(L, "Guest photo requests folder", (folders or {}).get("selfies"))
        acc = storage_account or {}
        mail = _s(acc.get("email")) or _s(acc.get("label"))
        if mail:
            L.append(f"  - On mail: {mail}"
                     f"{'' if acc.get('provisioned') else '  (reserved — not created in Drive yet)'}")
        else:
            L.append("  - On mail: none yet (no Google account connected)")
        L.append("")

    notes = _s(info.get("notes"))
    if notes:
        L.append("BUYER'S NOTE (read it — extra requirements live here)")
        L.append(f"  {notes}")
        L.append("")

    L.append("TO BUILD")
    L.append(f"  Fulfillment console -> look up {code} -> \"Build draft invitation\".")
    L.append("  Or on the server:")
    L.append(f"    docker compose exec core python seed_test_invitation.py {code}")
    if slug:
        L.append(f"  Expected link: /invite/{slug}")
    L.append("  It stays a DRAFT until it is delivered.")
    return "\n".join(L)
