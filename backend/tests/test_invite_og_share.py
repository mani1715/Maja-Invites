"""
Invitation share card (Open Graph) — live crawler render.

Covers the share-preview changes (server.py _render_og_for_slug, 2026-08-22):
  • Warm, invitation-style title that leads with the couple/celebrant names.
  • Warm one-line description (not a bare "Wedding Invitation · date").
  • og:image prefers the real invitation artwork — for a bespoke design that
    ships its hero as a static asset (engagement_saivamsi) the card falls back
    to that artwork, ABSOLUTE, rather than a generic image.

Hits the always-reachable /api/og/invite/{slug} mirror with a WhatsApp UA so the
crawler branch renders. AWS-free (no gallery/S3 involved).

    PYTHONIOENCODING=utf-8 python -m pytest backend/tests/test_invite_og_share.py -q
"""
from __future__ import annotations

import requests

from tests.live import (require_live, login, create_profile_for,
                        new_wedding_payload, delete_wedding)

BASE_URL = require_live()
STUDIO_EMAIL = "admin@wedding.com"
STUDIO_PASSWORD = "admin123"
WHATSAPP_UA = {"User-Agent": "WhatsApp/2.23"}


def _headers() -> dict:
    return {"Authorization": f"Bearer {login(STUDIO_EMAIL, STUDIO_PASSWORD)}",
            "Content-Type": "application/json"}


def _og(slug: str) -> str:
    r = requests.get(f"{BASE_URL}/api/og/invite/{slug}", headers=WHATSAPP_UA, timeout=30)
    assert r.status_code == 200, f"og render: {r.status_code} {r.text[:200]}"
    return r.text


def test_og_card_is_warm_and_names_lead():
    headers = _headers()
    r = create_profile_for(headers, new_wedding_payload(
        groom_name="Aarav", bride_name="Diya"))
    assert r.status_code in (200, 201), f"create: {r.status_code} {r.text[:200]}"
    prof = r.json()
    try:
        html = _og(prof["slug"])
        assert "Aarav & Diya" in html, "names must lead the share title"
        assert "You're Invited" in html, "warm invite title"
        # Clean + professional: no emoji in the card (couple asked for it).
        assert "\U0001F49B" not in html and "✨" not in html, "no emoji in the OG card"
        # Warm description, not the old "Wedding Invitation · <date>" label.
        assert "celebrate this special day" in html
    finally:
        delete_wedding(headers, prof["id"])


def test_og_image_falls_back_to_bespoke_artwork():
    headers = _headers()
    # A bespoke design with no couple photo → the card should use the design's
    # hero artwork, made absolute.
    r = create_profile_for(headers, new_wedding_payload(
        groom_name="Sai Vamsi", bride_name="Sai Sahithi",
        design_id="engagement_saivamsi"))
    assert r.status_code in (200, 201), f"create: {r.status_code} {r.text[:200]}"
    prof = r.json()
    try:
        html = _og(prof["slug"])
        assert "/engagement/share-card.jpg" in html, \
            "bespoke design with no photo must use its social share card as og:image"
        assert 'property="og:image"' in html
        # Absolute, never a bare relative path a crawler would drop.
        assert 'content="http' in html
    finally:
        delete_wedding(headers, prof["id"])


if __name__ == "__main__":
    test_og_card_is_warm_and_names_lead()
    test_og_image_falls_back_to_bespoke_artwork()
    print("OK invitation OG share card")
