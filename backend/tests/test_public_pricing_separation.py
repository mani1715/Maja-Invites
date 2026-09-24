"""
Public pricing shows the individual offering; studio pricing is behind sign-in.

A yearly portfolio price only means something next to a studio's own plan,
usage and renewal date. Shown on a public marketing page it is a number without
a context, and it was the same number the signed-in panel already renders — two
places for one figure, which is exactly how they drift apart.

So the split is: `/pricing` renders invitations (what an individual buys) and
signposts the rest; `/studio/plans`, `/studio/studio-storage` and each event's
gallery render the photographer's own pricing against their own account.

These are source assertions, not HTTP ones. The rule is about which page
*renders* which prices, and the endpoints themselves stay public on purpose —
the signed-in studio pages call them. A request-level test would therefore
prove nothing. Nothing else in the tree guards this, so a future edit that
drops StudioPlanPicker back onto /pricing would otherwise pass every gate.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

FRONTEND = Path(__file__).resolve().parent.parent.parent / "frontend-v2" / "src"
PRICING_PAGE = FRONTEND / "pages" / "Pricing.jsx"

pytestmark = pytest.mark.skipif(
    not PRICING_PAGE.exists(), reason="frontend-v2 not present in this checkout")


def _src(p: Path) -> str:
    return p.read_text(encoding="utf-8")


# --------------------------------------------------------------------------- #
# The public page
# --------------------------------------------------------------------------- #
def test_public_pricing_does_not_render_studio_plan_cycles():
    """StudioPlanPicker is the component that renders portfolio plans across
    monthly / 3-month / 6-month / yearly cycles."""
    src = _src(PRICING_PAGE)
    assert "StudioPlanPicker" not in src, \
        "Pricing.jsx renders studio plan cycles again — that belongs on /studio/plans"


def test_public_pricing_does_not_fetch_studio_pricing():
    src = _src(PRICING_PAGE)
    for call in ("portfolioPlans", "storagePlans", "faceMatchPricing"):
        assert call not in src, f"Pricing.jsx fetches {call}() — studio pricing is panel-only"


def test_public_pricing_still_prices_invitations():
    """The individual offering must remain, priced from the backend."""
    src = _src(PRICING_PAGE)
    assert "invitationPlans" in src
    assert "InvitationTierCard" in src


def test_public_pricing_points_photographers_at_the_panel():
    """Removing the prices without saying where they went would just look like
    a missing feature."""
    src = _src(PRICING_PAGE)
    assert "/studio/plans" in src
    assert "/studio/studio-storage" in src


def test_public_pricing_hardcodes_no_rupee_amounts():
    """Every figure on the page must come from the server. A literal ₹1,999 in
    JSX is a price that cannot be changed in the Pricing Hub."""
    src = _src(PRICING_PAGE)
    literals = re.findall(r"₹\s?\d[\d,]*", src)
    assert not literals, f"hardcoded prices in Pricing.jsx: {literals}"


# --------------------------------------------------------------------------- #
# The panel
# --------------------------------------------------------------------------- #
def test_panel_still_prices_portfolio_and_storage():
    plans = _src(FRONTEND / "pages" / "StudioPlans.jsx")
    storage = _src(FRONTEND / "pages" / "StudioStorage.jsx")
    assert "subsApi" in plans or "subscriptions" in plans
    assert "storagePlans" in storage


def test_panel_shows_face_match_quota_per_event():
    gallery = _src(FRONTEND / "pages" / "StudioProfileGallery.jsx")
    assert "galleryQuota" in gallery
    assert "FaceQuotaPanel" in gallery


def test_quota_extension_prices_are_never_computed_in_the_browser():
    """The panel may render a top-up price but must never derive one."""
    panel = _src(FRONTEND / "components" / "gallery" / "FaceQuotaPanel.jsx")
    assert "price_inr" in panel, "the panel should render the server's price"
    assert not re.search(r"price_inr\s*[*/+-]\s*\w", panel), \
        "FaceQuotaPanel does arithmetic on a price — the backend is the only pricer"
