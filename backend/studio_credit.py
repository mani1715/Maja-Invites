"""
studio_credit.py — "Managed by <Studio>" credit on the invitation, → their portfolio.

The owner's rule: a studio's invitations are credited at the bottom with the
studio name, and tapping it opens the studio's portfolio — but ONLY when the
studio holds a PREMIUM portfolio subscription. Premium is what turns each
invitation the studio builds into a link back to their public portfolio; free /
basic studios get no credit, so the credit is a paid perk, not a default.

One resolver, reused by:
  * the public invitation payload (the footer credit couples and guests see), and
  * the fulfillment console (so the owner sees the studio's portfolio URL beside
    the event request when a premium photographer submits details).

Reads only existing collections — portfolio_profiles + the portfolio subscription
via portfolio_service._portfolio_tier — so it adds no new source of truth.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger("studio_credit")


def _blank() -> Dict[str, Any]:
    return {"show": False, "is_premium": False, "studio_name": None,
            "slug": None, "portfolio_url": None}


async def studio_credit(db, admin_id: Optional[str]) -> Dict[str, Any]:
    """The credit for the studio that owns/built an invitation.

    `show` is True only when the studio is PREMIUM and has a published portfolio,
    so a footer/link is rendered exactly when there is a real portfolio to send
    people to. Never raises — a credit lookup must not break an invitation load.
    """
    if not admin_id:
        return _blank()
    try:
        from portfolio_service import _portfolio_tier
        tier = await _portfolio_tier(db, admin_id)
    except Exception as e:
        logger.warning("[studio_credit] tier lookup failed for %s: %s", admin_id, e)
        return _blank()

    is_premium = (tier == "premium")

    try:
        prof = await db.portfolio_profiles.find_one({"id": admin_id}, {"_id": 0}) or {}
    except Exception:
        prof = {}
    # Fall back to the admin's own name so the credit reads sensibly even before
    # the studio filled its portfolio studio_name.
    studio_name = prof.get("studio_name")
    if not studio_name:
        try:
            adm = await db.admins.find_one({"id": admin_id}, {"_id": 0, "name": 1}) or {}
            studio_name = adm.get("name")
        except Exception:
            studio_name = None

    slug = prof.get("slug") or admin_id
    portfolio_url = f"/photographer/{slug}/portfolio"

    # Only credit a studio whose portfolio is actually PUBLISHED and PREMIUM —
    # otherwise the link would land guests on an empty or unpublished page.
    show = bool(is_premium and prof.get("is_published"))

    return {
        "show": show,
        "is_premium": is_premium,
        "studio_name": studio_name,
        "slug": slug,
        "portfolio_url": portfolio_url,
    }
