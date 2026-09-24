"""
Store / direct-purchase flow (no credits).

The new monetization model: a user picks a theme design, pays its ₹ price via
Razorpay (cart → checkout), then submits their wedding info; the studio builds
the invitation (done-for-you) and delivers the link. This module is ADDITIVE —
it does not touch the credit system, so it can run alongside the legacy flow
until credits are removed.

Collections:
  invitation_orders — one per purchase {status, build_status, design_id, amount, info}
Reads design ₹ prices from pricing_design_prices (audience=normal_user), the
super-admin-owned Pricing Hub source of truth.
"""

from __future__ import annotations

import os
import re
import uuid
import hmac
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Depends, Body, Request, Header
from pydantic import BaseModel, Field, field_validator

import pricing_catalog
from user_auth import NORMAL_USERS_RETIRED

logger = logging.getLogger("store_features")

DEFAULT_DESIGN_PRICE_INR = 2999  # any design without an explicit price


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _razorpay_configured() -> bool:
    kid = os.environ.get("RAZORPAY_KEY_ID", "")
    sec = os.environ.get("RAZORPAY_KEY_SECRET", "")
    return bool(kid) and bool(sec) and "PLACEHOLDER" not in kid and "PLACEHOLDER" not in sec


# ── Event-based packages + add-ons (owner-default prices; tune in Pricing Hub) ──
# Invite price scales by the NUMBER OF CEREMONIES the package covers + language.
# Mirrors the public /plans tiers (LandingPage Pricing). Language kept for the
# order record but priced the same — plans are one-price tiers.
PACKAGES = {
    "classic": {"label": "Classic", "events": 1,    "price": {"english": 1499, "regional": 1499}},
    "premium": {"label": "Premium", "events": 3,    "price": {"english": 2999, "regional": 2999}, "featured": True},
    "royal":   {"label": "Royal",   "events": None, "price": {"english": 4999, "regional": 4999}},
    "bespoke": {"label": "Bespoke", "events": None, "price": {"english": 9999, "regional": 9999}},
}
DEFAULT_PACKAGE = "premium"
LANGUAGES = ("english", "regional")

ADDONS = {
    "live_gallery":         {"label": "Live Photo Gallery",        "price": 999},
    "ai_face_match":        {"label": "Get-Your-Photos (guest photo requests)", "price": 1499},
    "custom_video":         {"label": "Custom Video (AI)",         "price": 2999},
    "custom_video_editing": {"label": "Custom Video Editing (Studio)", "price": 9999},
}


# ═══════════════════════════════════════════════════════════════════════════
#  À-LA-CARTE PRICING — what the cart actually sells now
# ═══════════════════════════════════════════════════════════════════════════
# The owner does not sell ceremony packages (Classic/Premium/Royal/Bespoke). The
# real model is:
#
#     total = design price
#           + every PAID feature the buyer picks   (each priced on its own)
#           + every ADDITIONAL language             (each priced on its own)
#
# A handful of BASIC features ship free with any design, and the buyer's MAIN
# language is included — they only pay for languages beyond it.
#
# Feature keys deliberately match `pricing_migration.DEFAULT_FEATURE_PACKS` and
# `frontend/src/utils/featureAccess.js` PACKABLE_FEATURES, so what a buyer paid
# for gates their invitation with no translation layer in between.
#
# These are DEFAULTS ONLY — the live prices live in db.store_features /
# db.store_languages and are editable by the owner in the Pricing Hub.
FEATURES: Dict[str, Dict[str, Any]] = {
    # ---- included free with every design -------------------------------
    "rsvp":            {"label": "RSVP & guest replies",       "price": 0, "included": True, "sort": 1,
                        "note": "Guests confirm attendance and headcount."},
    "timeline":        {"label": "Event timeline",              "price": 0, "included": True, "sort": 2,
                        "note": "Every ceremony with date, time and order."},
    "family_details":  {"label": "Family details",              "price": 0, "included": True, "sort": 3,
                        "note": "Both families introduced on the invitation."},
    "countdown":       {"label": "Countdown to the day",        "price": 0, "included": True, "sort": 4},
    "maps":            {"label": "Venue map & directions",      "price": 0, "included": True, "sort": 5},
    "music":           {"label": "Background music",            "price": 0, "included": True, "sort": 6},

    # ---- priced individually ------------------------------------------
    "qr_live_gallery":      {"label": "Live photo gallery (QR)",     "price": 999,  "included": False, "sort": 11,
                             "note": "A QR code at the venue; photos appear on the invitation live."},
    "guest_uploads":        {"label": "Guest photo uploads",         "price": 499,  "included": False, "sort": 12,
                             "note": "Guests add their own photos to your gallery."},
    "enhanced_gallery":     {"label": "Enhanced gallery layouts",    "price": 699,  "included": False, "sort": 13},
    "ai_face_match":        {"label": "Get-Your-Photos (guest photo requests)", "price": 1499, "included": False, "sort": 14,
                             "note": "A guest takes a selfie and gets every photo they appear in."},
    "selfie_search":        {"label": "Selfie search for guests",    "price": 999,  "included": False, "sort": 15},
    "custom_video":         {"label": "Custom video (AI)",           "price": 2999, "included": False, "sort": 16},
    "custom_video_editing": {"label": "Custom video editing (studio)", "price": 9999, "included": False, "sort": 17,
                             "note": "Our editors cut your footage by hand."},
    "premium_delivery":     {"label": "Priority delivery",           "price": 999,  "included": False, "sort": 18,
                             "note": "Your invitation is built and delivered first."},
    "premium_support":      {"label": "Dedicated support",           "price": 499,  "included": False, "sort": 19},
    # Guest travel links (Ola / Rapido / Uber deep links to the venue). Already
    # built — `TravelLinksSection.jsx` / `map_features.py` — but was given away
    # for free because nothing priced it.
    "guest_cab_booking":    {"label": "Guest cab booking (Ola / Rapido / Uber)",
                             "price": 699, "included": False, "sort": 20,
                             "note": "One tap books a ride straight to your venue from the invitation."},
}

# Wave Face Match + QR — 2026 pricing redesign (docs/PRICING_REDESIGN_2026.md §5).
# One-time photo-count SKUs; keys/prices are derived from pricing_catalog.FACE_MATCH_TIERS
# (never hand-typed here) so the cart and the catalog can't drift apart. The old flat
# SKUs (ai_face_match, selfie_search) are hidden from display below — see
# _LEGACY_HIDDEN_FEATURE_KEYS — but stay valid/priced for historical orders.
for _t in pricing_catalog.FACE_MATCH_TIERS:
    FEATURES[_t["key"]] = {
        "label": f"Wave Face Match + QR — {_t['photos']:,} photos",
        "price": _t["price_inr"], "included": False, "sort": 20 + _t["photos"] // 1000,
        "note": "A guest takes a selfie and gets every photo they appear in.",
    }
del _t

# Hidden from the public /api/store/catalog listing (§5: "stop being displayed"),
# but the keys stay in FEATURES so an existing order that already paid for one
# still prices and renders correctly.
_LEGACY_HIDDEN_FEATURE_KEYS = {"ai_face_match", "selfie_search"}

# key -> photos, for stamping face_photo_limit onto an order at create time.
_FACE_MATCH_PHOTOS_BY_KEY = {t["key"]: t["photos"] for t in pricing_catalog.FACE_MATCH_TIERS}

# Additional languages are charged per language; the MAIN language is free.
LANGUAGE_CATALOG: Dict[str, Dict[str, Any]] = {
    "english":   {"label": "English",   "price": 499, "sort": 1},
    "telugu":    {"label": "Telugu",    "price": 499, "sort": 2},
    "tamil":     {"label": "Tamil",     "price": 499, "sort": 3},
    "hindi":     {"label": "Hindi",     "price": 499, "sort": 4},
    "kannada":   {"label": "Kannada",   "price": 499, "sort": 5},
    "malayalam": {"label": "Malayalam", "price": 499, "sort": 6},
    "marathi":   {"label": "Marathi",   "price": 499, "sort": 7},
    "bengali":   {"label": "Bengali",   "price": 499, "sort": 8},
    "gujarati":  {"label": "Gujarati",  "price": 499, "sort": 9},
    "punjabi":   {"label": "Punjabi",   "price": 499, "sort": 10},
    # odia / urdu deliberately NOT sold: order_to_invitation.RENDERABLE_LANGUAGES
    # (the builder) has no support for either, so a buyer paying for one would
    # get it silently dropped at build time — revenue into an unfulfillable SKU.
    # Re-add here only after the builder can render them.
}
DEFAULT_MAIN_LANGUAGE = "english"


# PACKAGES/ADDONS above are DEFAULTS. The live values are admin-editable in
# db.store_packages / db.store_addons (Pricing Hub → Link Packages). These
# helpers read the DB and fall back to the defaults so pricing works before any
# admin edit / seed.
async def _pkg_map(db) -> Dict[str, Dict[str, Any]]:
    rows = await db.store_packages.find({}, {"_id": 0}).to_list(100)
    active = [r for r in rows if r.get("is_active") is not False and r.get("key")]
    if not active:
        return {k: dict(v) for k, v in PACKAGES.items()}
    out = {}
    for r in rows:
        if r.get("is_active") is False:
            continue
        pr = r.get("price") or {}
        out[r["key"]] = {"label": r.get("label", r["key"]), "events": r.get("events"),
                         "price": {"english": int(pr.get("english", 0) or 0),
                                   "regional": int(pr.get("regional", pr.get("english", 0)) or 0)},
                         "featured": bool(r.get("featured")), "sort": int(r.get("sort", 0) or 0)}
    return out or {k: dict(v) for k, v in PACKAGES.items()}


async def _addon_map(db) -> Dict[str, Dict[str, Any]]:
    rows = await db.store_addons.find({}, {"_id": 0}).to_list(100)
    active = [r for r in rows if r.get("is_active") is not False and r.get("key")]
    if not active:
        return {k: dict(v) for k, v in ADDONS.items()}
    return {r["key"]: {"label": r.get("label", r["key"]), "price": int(r.get("price", 0) or 0)}
            for r in active}


async def _feature_map(db) -> Dict[str, Dict[str, Any]]:
    """Live per-feature catalogue: db.store_features, else the defaults above."""
    try:
        rows = await db.store_features.find({}, {"_id": 0}).to_list(200)
    except Exception:
        # Falling back to the hardcoded defaults keeps the cart usable, but it
        # means the owner's edited prices are NOT being applied — log loudly
        # rather than quietly charging a different number.
        logger.exception("[store] à-la-carte catalogue read failed — using DEFAULT prices")
        rows = []
    active = [r for r in rows if r.get("is_active") is not False and r.get("key")]
    if not active:
        return {k: dict(v) for k, v in FEATURES.items()}
    out: Dict[str, Dict[str, Any]] = {}
    for r in active:
        included = bool(r.get("included"))
        out[r["key"]] = {
            "label": r.get("label", r["key"]),
            # An included feature is free BY DEFINITION. Honouring a stray price on
            # an included row would silently charge for something the UI shows as
            # "included with your design".
            "price": 0 if included else int(r.get("price", 0) or 0),
            "included": included,
            "sort": int(r.get("sort", 0) or 0),
            "note": r.get("note", ""),
        }
    return out


async def _language_map(db) -> Dict[str, Dict[str, Any]]:
    """Live language catalogue: db.store_languages, else the defaults above."""
    try:
        rows = await db.store_languages.find({}, {"_id": 0}).to_list(200)
    except Exception:
        # Falling back to the hardcoded defaults keeps the cart usable, but it
        # means the owner's edited prices are NOT being applied — log loudly
        # rather than quietly charging a different number.
        logger.exception("[store] à-la-carte catalogue read failed — using DEFAULT prices")
        rows = []
    active = [r for r in rows if r.get("is_active") is not False and r.get("key")]
    if not active:
        return {k: dict(v) for k, v in LANGUAGE_CATALOG.items()}
    return {r["key"]: {"label": r.get("label", r["key"]),
                       "price": int(r.get("price", 0) or 0),
                       "sort": int(r.get("sort", 0) or 0)}
            for r in active}


async def design_price_inr(db, design_id: str, theme_id: str = "") -> Dict[str, Any]:
    """The design's own ₹ price. Most specific owner setting wins:
    per-design (Pricing Hub) → per-theme bundle → DEFAULT_DESIGN_PRICE_INR."""
    doc = await db.pricing_design_prices.find_one(
        {"audience": "normal_user", "design_id": design_id}, {"_id": 0})
    if doc:
        bp = doc.get("base_price")
        if doc.get("discount_enabled") and isinstance(doc.get("discount_price"), int) and doc["discount_price"] > 0:
            return {"price_inr": int(doc["discount_price"]), "source": "design"}
        if isinstance(bp, int) and bp > 0:
            return {"price_inr": int(bp), "source": "design"}
    if theme_id:
        tb = await db.theme_bundle_pricing.find_one({"theme_id": theme_id}, {"_id": 0})
        if tb and int(tb.get("inr_price") or 0) > 0:
            return {"price_inr": int(tb["inr_price"]), "source": "theme",
                    "theme_label": tb.get("label") or ""}
    return {"price_inr": DEFAULT_DESIGN_PRICE_INR, "source": "default"}


async def quote_alacarte(db, design_id: str, theme_id: str = "",
                         features: Optional[list] = None,
                         main_language: str = "",
                         extra_languages: Optional[list] = None) -> Dict[str, Any]:
    """design + individually-priced features + individually-priced extra languages.

    Returns a full line-item breakdown so the cart and the order record show the
    buyer exactly what each rupee bought. Legacy keys (`package`,
    `package_label`, `language`, `addons`) are populated too, so existing order
    records, the fulfillment console and the admin views keep working unchanged.
    """
    feats = await _feature_map(db)
    langs = await _language_map(db)
    dp = await design_price_inr(db, design_id, theme_id)

    included = [{"key": k, "label": v["label"], "price": 0, "note": v.get("note", "")}
                for k, v in sorted(feats.items(), key=lambda kv: kv[1].get("sort", 0))
                if v.get("included")]

    # Only PAID, real, non-included keys can be charged. An unknown key is
    # dropped rather than guessed at — never invent a line item.
    picked, seen = [], set()
    for k in (features or []):
        v = feats.get(k)
        if not v or v.get("included") or k in seen:
            continue
        seen.add(k)
        picked.append({"key": k, "label": v["label"], "price": int(v["price"]),
                       "note": v.get("note", "")})
    picked.sort(key=lambda a: feats[a["key"]].get("sort", 0))
    features_total = sum(a["price"] for a in picked)

    main = main_language if main_language in langs else (
        DEFAULT_MAIN_LANGUAGE if DEFAULT_MAIN_LANGUAGE in langs else
        (next(iter(sorted(langs, key=lambda k: langs[k].get("sort", 0))), "english")))

    extra, lseen = [], {main}
    for k in (extra_languages or []):
        if k not in langs or k in lseen:
            continue
        lseen.add(k)
        extra.append({"key": k, "label": langs[k]["label"], "price": int(langs[k]["price"])})
    extra.sort(key=lambda a: langs[a["key"]].get("sort", 0))
    languages_total = sum(a["price"] for a in extra)

    total = int(dp["price_inr"]) + features_total + languages_total
    return {
        "pricing_model": "alacarte",
        "design_id": design_id, "theme_id": theme_id,
        "design_price_inr": int(dp["price_inr"]), "design_price_source": dp["source"],
        "included_features": included,
        "features": picked, "features_total_inr": features_total,
        "main_language": main,
        "main_language_label": langs.get(main, {}).get("label", main.title()),
        "extra_languages": extra, "languages_total_inr": languages_total,
        "total_inr": total, "currency": "INR",
        # ---- legacy-compatible mirrors (order records / fulfillment console) ----
        "package": "alacarte", "package_label": "Design + selected features",
        "events": None, "language": main,
        "base_inr": int(dp["price_inr"]),
        "addons": picked + [{"key": f"lang_{a['key']}", "label": f"{a['label']} version",
                            "price": a["price"]} for a in extra],
        "addon_total_inr": features_total + languages_total,
    }


async def seed_store_pricing(db) -> None:
    """Seed db.store_packages + db.store_addons from the hardcoded defaults once."""
    if await db.store_packages.count_documents({}) == 0:
        for i, (k, v) in enumerate(PACKAGES.items()):
            await db.store_packages.insert_one({"key": k, "label": v["label"], "events": v["events"],
                "price": v["price"], "featured": v.get("featured", False), "sort": i, "is_active": True})
    if await db.store_addons.count_documents({}) == 0:
        for k, v in ADDONS.items():
            await db.store_addons.insert_one({"key": k, "label": v["label"], "price": v["price"], "is_active": True})
    # one-time relabel: drop the old "AI Find-My-Photos" wording (feature is 2.0).
    await db.store_addons.update_one(
        {"key": "ai_face_match", "label": "AI Find-My-Photos"},
        {"$set": {"label": "Get-Your-Photos (guest photo requests)"}})

    await seed_alacarte_catalog(db)


async def seed_alacarte_catalog(db) -> None:
    """Seed db.store_features + db.store_languages from the defaults.

    Owned by the Pricing Hub afterwards: an owner's price edit must never be
    reverted by a restart. Languages still seed ONCE (whole-collection-empty
    guard — unchanged). Features seed PER-KEY: each key in FEATURES not yet in
    db.store_features is inserted, any key already there (including an owner's
    edited price) is left untouched. This is what lets a new catalog key (e.g.
    the 2026 face-match SKUs) reach an already-seeded, already-live DB without
    a destructive re-seed and without a manual migration step.
    (Presence is probed with find_one rather than count_documents so the same
    code path works against the test double.)
    """
    for k, v in FEATURES.items():
        if await db.store_features.find_one({"key": k}, {"_id": 0}) is None:
            await db.store_features.insert_one({
                "key": k, "label": v["label"], "price": int(v["price"]),
                "included": bool(v.get("included")), "sort": int(v.get("sort", 0)),
                "note": v.get("note", ""), "is_active": True})
    if await db.store_languages.find_one({}, {"_id": 0}) is None:
        for k, v in LANGUAGE_CATALOG.items():
            await db.store_languages.insert_one({
                "key": k, "label": v["label"], "price": int(v["price"]),
                "sort": int(v.get("sort", 0)), "is_active": True})


async def _quote(db, package: str, language: str, addons: list) -> Dict[str, Any]:
    """Compute the order total from package + language + add-ons (admin-priced).
    Returns a breakdown so the UI can show line items."""
    pkgs = await _pkg_map(db)
    adds = await _addon_map(db)
    pkg_key = package if package in pkgs else (DEFAULT_PACKAGE if DEFAULT_PACKAGE in pkgs else next(iter(pkgs)))
    lang = language if language in LANGUAGES else "english"
    pkg = pkgs[pkg_key]
    base = int(pkg["price"].get(lang, pkg["price"].get("english", 0)))
    chosen = [a for a in (addons or []) if a in adds]
    addon_total = sum(adds[a]["price"] for a in chosen)
    total = base + addon_total
    return {
        "package": pkg_key, "package_label": pkg["label"], "events": pkg["events"],
        "language": lang, "base_inr": base,
        "addons": [{"key": a, "label": adds[a]["label"], "price": adds[a]["price"]} for a in chosen],
        "addon_total_inr": addon_total,
        "total_inr": total, "currency": "INR",
    }


def hash_qr_password(info: Dict[str, Any]) -> Dict[str, Any]:
    """Never let a plaintext QR-gallery password reach the order record.

    The PHOTOGRAPHER owns this password (they set it on the QR page, stored
    bcrypt-hashed in `profiles.gallery_privacy`), so our own details form does not
    collect one. This stays as a sanitiser because `OrderInfoRequest.extra` is a
    free-form `Dict[str, Any]`: any client can post `extra.qr_gallery.password`,
    and `info` is echoed back to the buyer on reload, rendered in the fulfillment
    console, and kept for the life of the order. Anything password-shaped that
    arrives is hashed, and a plaintext is never persisted.
    """
    extra = info.get("extra")
    if not isinstance(extra, dict):
        return info
    qr = extra.get("qr_gallery")
    if not isinstance(qr, dict):
        return info

    raw = str(qr.get("password") or "")
    if qr.get("protect") and raw:
        from auth import get_password_hash
        extra["qr_gallery"] = {"protect": True, "has_password": True,
                               "password_hash": get_password_hash(raw),
                               "set_at": _now_iso()}
    else:
        extra["qr_gallery"] = {"protect": bool(qr.get("protect")), "has_password": False}
    return info


class CreateOrderRequest(BaseModel):
    design_id: str = Field(min_length=1, max_length=64)
    theme_id: Optional[str] = Field(default=None, max_length=64)
    event_type: Optional[str] = Field(default=None, max_length=64)
    package: str = Field(default="premium", max_length=32)   # classic | premium | royal | bespoke (legacy)
    language: str = Field(default="english", max_length=32)   # english | regional
    addons: list = Field(default_factory=list, max_length=50)
    esign_agreed: bool = False         # checkout agreement checkbox
    # À-la-carte model (what the cart sends now): design + per-feature prices +
    # a free main language + individually-priced extra languages. `main_language`
    # is the discriminator — when it is set we price à la carte, otherwise the
    # legacy ceremony-package quote still runs, so old clients keep working.
    features: list = Field(default_factory=list, max_length=100)
    main_language: str = Field(default="", max_length=64)
    extra_languages: list = Field(default_factory=list, max_length=50)
    # New unified pricing engine (used only when `new_pricing_enabled` is ON):
    feature_pack_key: Optional[str] = Field(default=None, max_length=64)   # celebration | signature | royal
    duration_id: Optional[str] = Field(default=None, max_length=64)        # a link_duration_tier id
    # Invitation Suite (docs §6): three tiers x three independent add-on
    # components, pure addition. `order_type="invitation_suite"` is the
    # discriminator — when set, price comes ONLY from pricing_catalog.invitation_total
    # (server-computed; any client-sent amount/total is ignored, as everywhere else).
    order_type: Optional[str] = Field(default=None, max_length=32)
    invitation_tier: Optional[str] = Field(default=None, max_length=32)    # basic | premium | custom
    components: list = Field(default_factory=list, max_length=3)          # digital | video | physical


class VerifyOrderRequest(BaseModel):
    order_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class OrderInfoRequest(BaseModel):
    # The wedding details captured AFTER payment for the done-for-you build.
    bride_name: str = Field(default="", max_length=120)
    groom_name: str = Field(default="", max_length=120)
    event_date: Optional[str] = Field(default=None, max_length=40)
    venue: str = Field(default="", max_length=200)
    city: str = Field(default="", max_length=100)
    phone: str = Field(default="", max_length=20)
    notes: str = Field(default="", max_length=2000)
    extra: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("extra")
    @classmethod
    def _cap_extra(cls, v):
        # A free-form dict reaching JSONB + the admin console — bound its serialized
        # size so a client can't post megabytes of nested data under the body cap.
        import json as _json
        if v and len(_json.dumps(v, default=str)) > 20_000:
            raise ValueError("extra payload too large")
        return v


def _as_int(v, default: int = 0) -> int:
    """Tolerant int() for super-admin JSON price fields — a non-numeric value
    yields the default instead of a 500 (ValueError) mid-handler."""
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def build_store_router(db, razorpay_client, get_current_public_user, require_super_admin=None) -> APIRouter:
    # `get_current_public_user` (injected from server.py's get_current_buyer,
    # which still accepts a couple-session cookie) is kept only for call-site
    # compatibility — it is no longer used to guard any route below.
    router = APIRouter(tags=["store"])

    async def _require_studio_buyer(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        """Ordering guard (buyer-guard section, normal-user retirement):
        couple-cookie sessions are no longer accepted — every mutating/
        ordering endpoint below requires a photographer/studio Bearer JWT.
        Public store READ endpoints (packages/designs/prices/quote) are
        unaffected — they take no dependency and stay open to browsers."""
        if not authorization or not authorization.lower().startswith("bearer "):
            raise HTTPException(status_code=401, detail=NORMAL_USERS_RETIRED)
        from auth import decode_access_token
        payload = decode_access_token(authorization.split(" ", 1)[1].strip())
        # event_client tokens (Couple Access portal, photographer_clients.py)
        # carry typ="event_client" and a profile_id as `sub` — explicitly
        # rejected so a couple-access link can never authenticate an order.
        admin_id = payload.get("sub") if payload else None
        if not payload or payload.get("typ") == "event_client" or not admin_id:
            raise HTTPException(status_code=401, detail=NORMAL_USERS_RETIRED)
        return {"user_id": admin_id, "kind": "photographer"}

    async def _price_doc(design_id: str) -> Optional[Dict[str, Any]]:
        return await db.pricing_design_prices.find_one(
            {"audience": "normal_user", "design_id": design_id}, {"_id": 0}
        )

    # ---- public: design price (legacy flat) -------------------------------
    # Delegates to the ONE resolver (`design_price_inr`, below) so this and
    # every other price-quoting endpoint always agree — a `discount_enabled`
    # row with `discount_price: 0` used to quote ₹0 here and ₹2999 in the
    # cart because this endpoint had its own, laxer copy of the rules.
    @router.get("/api/store/design/{design_id}/price")
    async def design_price(design_id: str, theme_id: str = ""):
        dp = await design_price_inr(db, design_id, theme_id)
        return {"design_id": design_id, "price_inr": dp["price_inr"], "currency": "INR"}

    # ---- public: full "Get These" offer — admin-priced design + plans -----
    @router.get("/api/store/design-offer/{design_id}")
    async def design_offer(design_id: str, theme_id: str = ""):
        """Everything the "Get These" panel needs, entirely admin-controlled.

        Price resolution (most specific admin setting wins):
          1) per-design price   → Pricing Hub → Design Prices (normal_user)
          2) per-theme bundle   → theme_bundle_pricing.inr_price
          3) DEFAULT_DESIGN_PRICE_INR fallback
        Plans/packages come from the admin-managed store_packages catalogue.
        """
        doc = await _price_doc(design_id)
        design_price_inr = None
        if doc:
            bp = doc.get("base_price")
            if doc.get("discount_enabled") and isinstance(doc.get("discount_price"), int) and doc["discount_price"] > 0:
                design_price_inr = int(doc["discount_price"])
            elif isinstance(bp, int) and bp > 0:
                design_price_inr = int(bp)

        theme_label = ""
        theme_price_inr = 0
        if theme_id:
            tb = await db.theme_bundle_pricing.find_one({"theme_id": theme_id}, {"_id": 0})
            if tb:
                theme_label = tb.get("label") or ""
                theme_price_inr = int(tb.get("inr_price") or 0)

        if design_price_inr is not None:
            price, source = design_price_inr, "design"
        elif theme_price_inr > 0:
            price, source = theme_price_inr, "theme"
        else:
            price, source = DEFAULT_DESIGN_PRICE_INR, "default"

        pkgs = await _pkg_map(db)
        adds = await _addon_map(db)
        ordered = sorted(pkgs.items(), key=lambda kv: kv[1].get("sort", 0))
        default_pkg = next((k for k, v in ordered if v.get("featured")),
                           (ordered[0][0] if ordered else None))
        return {
            "design_id": design_id, "theme_id": theme_id,
            "price_inr": price, "price_source": source, "currency": "INR",
            "theme_label": theme_label,
            "packages": [{"key": k, **v} for k, v in ordered],
            "addons": [{"key": k, **v} for k, v in adds.items()],
            "default_package": default_pkg,
        }

    # ---- public: packages + add-ons catalogue (admin-priced) --------------
    @router.get("/api/store/packages")
    async def packages():
        pkgs = await _pkg_map(db)
        adds = await _addon_map(db)
        ordered = sorted(pkgs.items(), key=lambda kv: kv[1].get("sort", 0))
        default = next((k for k, v in ordered if v.get("featured")),
                       DEFAULT_PACKAGE if DEFAULT_PACKAGE in pkgs else (ordered[0][0] if ordered else DEFAULT_PACKAGE))
        return {
            "packages": [{"key": k, **v} for k, v in ordered],
            "addons": [{"key": k, **v} for k, v in adds.items()],
            "languages": list(LANGUAGES),
            "default_package": default,
        }

    # ---- public: the à-la-carte catalogue for one design -------------------
    @router.get("/api/store/catalog")
    async def store_catalog(design_id: str = "", theme_id: str = ""):
        """Everything the cart needs: this design's price, which features come
        free with it, what every other feature costs, the language list with the
        per-extra-language price, and the new Invitation Suite tiers + Wave Face
        Match SKUs (same shape as their /api/public/pricing/* endpoints) — one
        fetch, no drift between the cart and the marketing page. All owner-
        editable in the Pricing Hub except the last two, which trace to
        pricing_catalog.py."""
        feats = await _feature_map(db)
        langs = await _language_map(db)
        ordered = sorted(feats.items(), key=lambda kv: kv[1].get("sort", 0))
        dp = await design_price_inr(db, design_id, theme_id) if design_id else \
            {"price_inr": DEFAULT_DESIGN_PRICE_INR, "source": "default"}
        from pricing_public import invitation_tiers_payload, face_match_tiers_payload
        return {
            "design_id": design_id, "theme_id": theme_id,
            "design_price_inr": int(dp["price_inr"]), "design_price_source": dp["source"],
            "included_features": [{"key": k, **v} for k, v in ordered if v.get("included")],
            # ai_face_match / selfie_search are retired SKUs (§5): hidden here,
            # still priceable — an existing order that paid for one still works.
            "paid_features": [{"key": k, **v} for k, v in ordered
                              if not v.get("included") and k not in _LEGACY_HIDDEN_FEATURE_KEYS],
            "languages": [{"key": k, **v} for k, v in
                          sorted(langs.items(), key=lambda kv: kv[1].get("sort", 0))],
            "default_main_language": (DEFAULT_MAIN_LANGUAGE if DEFAULT_MAIN_LANGUAGE in langs
                                      else next(iter(langs), "english")),
            "invitation_tiers": invitation_tiers_payload(),
            "face_match_tiers": face_match_tiers_payload(),
            "currency": "INR",
        }

    # ---- public: live quote -----------------------------------------------
    @router.post("/api/store/quote")
    async def quote(payload: CreateOrderRequest):
        if payload.main_language:
            return await quote_alacarte(
                db, payload.design_id, payload.theme_id or "",
                payload.features, payload.main_language, payload.extra_languages)
        return await _quote(db, payload.package, payload.language, payload.addons)

    # ---- super-admin: normal-user link package/add-on prices --------------
    if require_super_admin is not None:
        @router.get("/api/admin/store-packages")
        async def admin_store_packages(_s=Depends(require_super_admin)):
            pk = await db.store_packages.find({}, {"_id": 0}).sort("sort", 1).to_list(100)
            ad = await db.store_addons.find({}, {"_id": 0}).to_list(100)
            return {"packages": pk, "addons": ad, "languages": list(LANGUAGES)}

        @router.post("/api/admin/store-packages")
        async def upsert_store_package(payload: Dict[str, Any] = Body(...), _s=Depends(require_super_admin)):
            key = str(payload.get("key") or "").strip().lower()
            if not key:
                raise HTTPException(400, "key required")
            eng = _as_int(payload.get("price_english"), 0)
            doc = {"key": key, "label": payload.get("label", key), "events": payload.get("events"),
                   "price": {"english": eng, "regional": _as_int(payload.get("price_regional"), eng)},
                   "featured": bool(payload.get("featured")), "sort": _as_int(payload.get("sort"), 0),
                   "is_active": payload.get("is_active", True) is not False}
            if await db.store_packages.find_one({"key": key}, {"_id": 0}):
                await db.store_packages.update_one({"key": key}, {"$set": doc})
            else:
                await db.store_packages.insert_one(doc)
            return {"saved": True, "key": key}

        @router.post("/api/admin/store-addons")
        async def upsert_store_addon(payload: Dict[str, Any] = Body(...), _s=Depends(require_super_admin)):
            key = str(payload.get("key") or "").strip().lower()
            if not key:
                raise HTTPException(400, "key required")
            doc = {"key": key, "label": payload.get("label", key), "price": _as_int(payload.get("price"), 0),
                   "is_active": payload.get("is_active", True) is not False}
            if await db.store_addons.find_one({"key": key}, {"_id": 0}):
                await db.store_addons.update_one({"key": key}, {"$set": doc})
            else:
                await db.store_addons.insert_one(doc)
            return {"saved": True, "key": key}

        # ---- à-la-carte: per-feature and per-language prices ---------------
        @router.get("/api/admin/store-alacarte")
        async def admin_alacarte(_s=Depends(require_super_admin)):
            """Every feature price and every language price, for the Pricing Hub."""
            feats = await _feature_map(db)
            langs = await _language_map(db)
            return {
                "features": [{"key": k, **v} for k, v in
                             sorted(feats.items(), key=lambda kv: kv[1].get("sort", 0))],
                "languages": [{"key": k, **v} for k, v in
                              sorted(langs.items(), key=lambda kv: kv[1].get("sort", 0))],
                "default_main_language": DEFAULT_MAIN_LANGUAGE,
                "design_price_default_inr": DEFAULT_DESIGN_PRICE_INR,
            }

        @router.post("/api/admin/store-features")
        async def upsert_store_feature(payload: Dict[str, Any] = Body(...),
                                       _s=Depends(require_super_admin)):
            key = str(payload.get("key") or "").strip().lower()
            if not key:
                raise HTTPException(400, "key required")
            included = bool(payload.get("included"))
            doc = {"key": key, "label": payload.get("label", key),
                   # included ⇒ free, so the buyer is never charged for something
                   # the cart presents as bundled with the design.
                   "price": 0 if included else max(0, _as_int(payload.get("price"), 0)),
                   "included": included, "sort": _as_int(payload.get("sort"), 0),
                   "note": payload.get("note", ""),
                   "is_active": payload.get("is_active", True) is not False}
            if await db.store_features.find_one({"key": key}, {"_id": 0}):
                await db.store_features.update_one({"key": key}, {"$set": doc})
            else:
                await db.store_features.insert_one(doc)
            return {"saved": True, "key": key, "price": doc["price"]}

        @router.post("/api/admin/store-languages")
        async def upsert_store_language(payload: Dict[str, Any] = Body(...),
                                        _s=Depends(require_super_admin)):
            key = str(payload.get("key") or "").strip().lower()
            if not key:
                raise HTTPException(400, "key required")
            doc = {"key": key, "label": payload.get("label", key.title()),
                   "price": max(0, _as_int(payload.get("price"), 0)),
                   "sort": _as_int(payload.get("sort"), 0),
                   "is_active": payload.get("is_active", True) is not False}
            if await db.store_languages.find_one({"key": key}, {"_id": 0}):
                await db.store_languages.update_one({"key": key}, {"$set": doc})
            else:
                await db.store_languages.insert_one(doc)
            return {"saved": True, "key": key}

    # ---- create a Razorpay order ------------------------------------------
    @router.post("/api/store/order/create")
    async def create_order(payload: CreateOrderRequest, current=Depends(_require_studio_buyer)):
        if not payload.esign_agreed:
            raise HTTPException(400, "Please accept the terms to continue.")
        # Phase 14 input bounds: reject an absurd payload before any catalog/DB
        # work. `features` already carries a Field(max_length=100) hard ceiling
        # (rejected even earlier, at request parsing) — this is the tighter
        # business rule (a design's à-la-carte list is a handful of items,
        # never dozens) as an explicit 400 rather than Pydantic's generic 422.
        # components (<=3), extra_languages (<=50), design_id/theme_id/
        # invitation_tier (<=64/64/32 chars) are already bounded the same way
        # via Field(max_length=...) above.
        if len(payload.features) > 50:
            raise HTTPException(400, "Too many features selected.")

        # Invitation Suite (docs §6): three tiers x three independent add-on
        # components, pure addition. Takes priority over every other pricing
        # path below — order_type is an explicit discriminator, not a fallback.
        q = None
        invitation_tier = None
        invitation_components: list = []
        if payload.order_type == "invitation_suite":
            invitation_tier = (payload.invitation_tier or "").strip().lower()
            invitation_components = [c.strip().lower() for c in (payload.components or [])]
            try:
                total = pricing_catalog.invitation_total(invitation_tier, invitation_components)
            except ValueError as e:
                raise HTTPException(400, str(e))
            q = {
                "pricing_model": "invitation_suite",
                "package": invitation_tier,
                "package_label": f"{invitation_tier.title()} Invitation Suite",
                "language": payload.language, "addons": [],
                "invitation_tier": invitation_tier, "components": invitation_components,
                "total_inr": total, "currency": "INR",
            }

        # Unified pricing engine (Phase 4): when the flag is ON and the new
        # fields are supplied, price = design + feature pack + link duration −
        # best campaign, from the ONE resolver. Otherwise the legacy ceremony-
        # package quote still drives checkout (backward compatible).
        try:
            _flag = await db.app_settings.find_one({"key": "new_pricing_enabled"})
            _new_pricing = bool(_flag and _flag.get("value") is True)
        except Exception:
            _new_pricing = False
        if q is None and _new_pricing and payload.feature_pack_key and payload.duration_id:
            from pricing_engine import quote_wedding, PricingError
            try:
                rq = await quote_wedding(
                    db, design_id=payload.design_id,
                    feature_pack_key=payload.feature_pack_key,
                    duration_id=payload.duration_id)
            except PricingError as e:
                raise HTTPException(422, str(e))
            q = {
                "pricing_model": "v2",
                "package": payload.feature_pack_key,
                "package_label": (rq.get("feature_pack") or {}).get("name") or payload.feature_pack_key,
                "language": payload.language, "addons": [],
                "design_price": rq["design_price"],
                "feature_pack_price": rq["feature_pack_price"],
                "link_duration_price": rq["link_duration_price"],
                "discount": rq["discount"], "campaign": rq.get("campaign"),
                "duration_id": payload.duration_id, "duration": rq.get("link_duration"),
                "total_inr": rq["total"],
            }
        # À-la-carte (the live cart): design + per-feature + per-extra-language.
        if q is None and payload.main_language:
            q = await quote_alacarte(
                db, payload.design_id, payload.theme_id or "",
                payload.features, payload.main_language, payload.extra_languages)
        if q is None:
            q = await _quote(db, payload.package, payload.language, payload.addons)
        price_inr = q["total_inr"]
        # Always recomputed server-side from the owner's own prices — the client
        # sends selections, never amounts.
        if price_inr <= 0:
            raise HTTPException(422, "This design has no price set yet. Please contact us.")

        # Wave Face Match + QR (§5): if any paid feature on this order is a
        # face_match_* SKU, stamp the purchased photo limit onto the order at
        # create time (the MAX among however many were somehow picked) so
        # fulfillment can see it without re-deriving it from feature keys.
        _picked_keys = [f["key"] for f in q.get("features", [])]
        face_photo_limit = max(
            (_FACE_MATCH_PHOTOS_BY_KEY[k] for k in _picked_keys if k in _FACE_MATCH_PHOTOS_BY_KEY),
            default=None)

        # TEST accounts → free-claim bypass: skip Razorpay, create the order as
        # paid so the owner can dogfood the full create-link flow at no cost.
        try:
            from seed_test_accounts import is_test_buyer
            _test = await is_test_buyer(db, current)
        except Exception:
            _test = False
        if _test:
            order_doc = {
                "id": f"invord_{uuid.uuid4().hex[:16]}",
                "fulfillment_code": f"MAJA-{uuid.uuid4().hex[:6].upper()}",
                "buyer_kind": current.get("kind", "user"),
                "user_id": current["user_id"],
                "design_id": payload.design_id, "theme_id": payload.theme_id,
                "event_type": payload.event_type,
                "package": q["package"], "package_label": q["package_label"],
                "language": q["language"], "addons": q["addons"], "quote": q,
                # What the studio must actually build, at the top level so the
                # fulfillment console shows it without digging into `quote`.
                "pricing_model": q.get("pricing_model", "package"),
                "features": [f["key"] for f in q.get("features", [])],
                "main_language": q.get("main_language", q["language"]),
                "extra_languages": [l["key"] for l in q.get("extra_languages", [])],
                "order_type": payload.order_type,
                "invitation_tier": invitation_tier, "components": invitation_components or None,
                "face_photo_limit": face_photo_limit,
                "esign_agreed": True, "esign_at": _now_iso(),
                "amount_inr": 0, "amount_paise": 0, "currency": "INR",
                "razorpay_order_id": None, "razorpay_payment_id": None, "razorpay_signature": None,
                "is_test": True, "status": "paid",
                "build_status": "pending_info",
                "info": None, "profile_id": None,
                "created_at": _now_iso(), "paid_at": _now_iso(),
            }
            await db.invitation_orders.insert_one(order_doc)
            return {"order_id": order_doc["id"], "free": True,
                    "amount_inr": 0, "amount_paise": 0, "currency": "INR"}

        if razorpay_client is None or not _razorpay_configured():
            raise HTTPException(503, "Payment gateway not configured (set real Razorpay keys).")

        # Double-submit guard (audit P3): a re-click/network-retry for the SAME
        # buyer + same suite selection reuses the fresh unpaid order (and its
        # Razorpay order — an order id can only be paid once) instead of
        # minting a second payment session. Suite orders only: their identity
        # is fully captured by (tier, components); the design/à-la-carte flow
        # varies too much per payload for a safe same-purchase test.
        if payload.order_type == "invitation_suite":
            recent = await db.invitation_orders.find(
                {"user_id": current["user_id"], "order_type": "invitation_suite",
                 "status": "created"}, {"_id": 0}).to_list(10)
            cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
            for prev in recent:
                if (prev.get("invitation_tier") == invitation_tier
                        and sorted(prev.get("components") or []) == sorted(invitation_components)
                        and (prev.get("created_at") or "") >= cutoff
                        and prev.get("razorpay_order_id")):
                    return {
                        "order_id": prev["id"],
                        "razorpay_order_id": prev["razorpay_order_id"],
                        "amount_paise": prev["amount_paise"],
                        "amount_inr": prev["amount_inr"],
                        "currency": prev.get("currency", "INR"),
                        "razorpay_key_id": os.environ.get("RAZORPAY_KEY_ID", ""),
                        "user_name": current.get("name"),
                        "user_email": current.get("email"),
                        "user_phone": current.get("phone"),
                        "reused_pending": True,
                    }

        amount_paise = price_inr * 100
        receipt = f"ord_{uuid.uuid4().hex[:24]}"
        try:
            order = razorpay_client.order.create({
                "amount": amount_paise, "currency": "INR", "payment_capture": 1,
                "receipt": receipt,
                "notes": {"user_id": current["user_id"], "design_id": payload.design_id, "kind": "design_purchase"},
            })
        except Exception as e:
            logger.exception("[store] order.create failed")
            raise HTTPException(502, f"Could not create order: {str(e)[:120]}")

        order_doc = {
            "id": f"invord_{uuid.uuid4().hex[:16]}",
            # short human code the admin types to pull this request (MAJA-AB12CD)
            "fulfillment_code": f"MAJA-{uuid.uuid4().hex[:6].upper()}",
            "buyer_kind": current.get("kind", "user"),  # photographer | user (premium vs normal split)
            "user_id": current["user_id"],
            "design_id": payload.design_id,
            "theme_id": payload.theme_id,
            "event_type": payload.event_type,
            "package": q["package"],
            "package_label": q["package_label"],
            "language": q["language"],
            "addons": q["addons"],
            "quote": q,
            # What the studio must actually build, at the top level so the
            # fulfillment console shows it without digging into `quote`.
            "pricing_model": q.get("pricing_model", "package"),
            "features": [f["key"] for f in q.get("features", [])],
            "main_language": q.get("main_language", q["language"]),
            "extra_languages": [l["key"] for l in q.get("extra_languages", [])],
            "order_type": payload.order_type,
            "invitation_tier": invitation_tier, "components": invitation_components or None,
            "face_photo_limit": face_photo_limit,
            "esign_agreed": True,
            "esign_at": _now_iso(),
            "amount_inr": price_inr,
            "amount_paise": amount_paise,
            "currency": "INR",
            "razorpay_order_id": order["id"],
            "razorpay_payment_id": None,
            "razorpay_signature": None,
            "status": "created",        # created -> paid
            "build_status": "awaiting_payment",  # awaiting_payment -> pending_info -> building -> delivered
            "info": None,
            "profile_id": None,         # set when the studio publishes the built invite
            "created_at": _now_iso(),
            "paid_at": None,
        }
        await db.invitation_orders.insert_one(order_doc)
        return {
            "order_id": order_doc["id"],
            "razorpay_order_id": order["id"],
            "amount_paise": amount_paise,
            "amount_inr": price_inr,
            "currency": "INR",
            "razorpay_key_id": os.environ.get("RAZORPAY_KEY_ID", ""),
            "user_name": current.get("name"),
            "user_email": current.get("email"),
            "user_phone": current.get("phone"),
        }

    # ---- verify payment ----------------------------------------------------
    @router.post("/api/store/order/verify")
    async def verify_order(payload: VerifyOrderRequest, current=Depends(_require_studio_buyer)):
        order = await db.invitation_orders.find_one(
            {"id": payload.order_id, "user_id": current["user_id"]}, {"_id": 0}
        )
        if not order:
            raise HTTPException(404, "Order not found")

        # Signature MUST verify against the razorpay_order_id WE stored at
        # order/create, never the client-supplied one — otherwise a valid
        # (order_id, payment_id, signature) triple from any cheap order on the
        # same merchant account marks an arbitrary, expensive order paid.
        stored_order_id = order.get("razorpay_order_id")
        if not stored_order_id:
            raise HTTPException(400, "Order has no payment session to verify")
        if payload.razorpay_order_id and payload.razorpay_order_id != stored_order_id:
            raise HTTPException(400, "Order mismatch")
        try:
            razorpay_client.utility.verify_payment_signature({
                "razorpay_order_id": stored_order_id,
                "razorpay_payment_id": payload.razorpay_payment_id,
                "razorpay_signature": payload.razorpay_signature,
            })
        except Exception:
            raise HTTPException(400, "Payment signature verification failed")

        # Atomic flip to paid (idempotent — only the first verify takes effect).
        res = await db.invitation_orders.update_one(
            {"id": order["id"], "status": {"$ne": "paid"}},
            {"$set": {
                "status": "paid", "build_status": "pending_info",
                "razorpay_payment_id": payload.razorpay_payment_id,
                "razorpay_signature": payload.razorpay_signature,
                "paid_at": _now_iso(),
            }},
        )
        updated = await db.invitation_orders.find_one({"id": order["id"]}, {"_id": 0})
        return {"order_id": order["id"], "status": updated["status"], "build_status": updated["build_status"]}

    # ---- webhook fallback (buyer closes the tab after paying) --------------
    # `/api/store/order/verify` above only fires from the browser. If the tab
    # dies mid-flow the payment is captured but `invitation_orders` never
    # flips to "paid" — money taken, order invisible to the build queue. This
    # mirrors monetization_features.razorpay_webhook's verify-or-audit-only
    # shape: unverified events are stored for audit but never act.
    @router.post("/api/payments/store-webhook")
    async def store_webhook(request: Request):
        raw_body = await request.body()
        signature = request.headers.get("X-Razorpay-Signature", "")
        secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")

        verified = False
        if not secret or "PLACEHOLDER" in secret:
            # Secret not configured: accept inbound for audit but DO NOT act.
            # The browser-side /verify flow remains the source of truth.
            logger.warning("[store] RAZORPAY_WEBHOOK_SECRET not set; webhook "
                           "stored unverified and will NOT mark any order paid.")
        else:
            expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, signature):
                raise HTTPException(400, "Invalid webhook signature")
            verified = True

        try:
            import json
            payload = json.loads(raw_body.decode("utf-8") or "{}")
        except Exception:
            raise HTTPException(400, "Invalid JSON")

        from event_payments import webhook_payment
        ev = webhook_payment(payload)
        kind, order_id, payment_id = ev["event"], ev["order_id"], ev["payment_id"]
        # Razorpay's webhook body carries no top-level unique event id; the
        # (event type, payment id) pair is stable across Razorpay's own retries
        # of the same delivery, so it doubles as the dedupe key.
        event_id = f"{kind}:{payment_id or order_id or uuid.uuid4().hex}"

        if await db.razorpay_events.find_one({"event_id": event_id}, {"_id": 0}):
            return {"received": True}  # already processed — skip, don't re-act

        # Insert-first with id=event_id so the table's PRIMARY KEY is the dedupe
        # constraint. The find_one above is only a fast path — two concurrent
        # deliveries could both pass it (TOCTOU); the PK makes exactly one
        # insert win, and the loser returns without re-acting.
        try:
            await db.razorpay_events.insert_one({
                "id": event_id,
                "event_id": event_id, "kind": kind, "verified": verified,
                "order_id": order_id, "created_at": _now_iso(),
            })
        except Exception:
            return {"received": True}  # concurrent delivery won the insert

        if verified and kind in ("payment.captured", "order.paid") and order_id:
            order = await db.invitation_orders.find_one(
                {"razorpay_order_id": order_id}, {"_id": 0})
            if order:
                # Same conditional-update idempotency guard as /verify — first
                # writer (browser callback or this webhook) wins.
                await db.invitation_orders.update_one(
                    {"id": order["id"], "status": {"$ne": "paid"}},
                    {"$set": {
                        "status": "paid", "build_status": "pending_info",
                        "razorpay_payment_id": payment_id,
                        "paid_at": _now_iso(),
                    }},
                )

        return {"received": True}

    # ---- EDIT WINDOW -------------------------------------------------------
    # Rules (owner spec, revised):
    #   • Details can always be filled the FIRST time (build_status pending_info).
    #   • The buyer can keep VIEWING/EDITING while the order is still being prepared
    #     (build_status "building") — i.e. UNTIL the studio "accepts" it. "Accept" =
    #     the admin sets `edit_locked` (or delivers it).
    #   • AFTER delivery, the buyer gets up to POST_DELIVERY_MAX_EDITS (3) more edits.
    #     Each one raises a notification in the admin panel; the studio then applies
    #     the change to the live link MANUALLY (no auto-sync). When the 3 are used
    #     up, the buyer is pointed at WhatsApp.
    #   • The admin can switch editing off entirely (global) or per order.
    POST_DELIVERY_MAX_EDITS = 3

    async def _fulfil_settings() -> Dict[str, Any]:
        doc = await db.app_settings.find_one({"id": "fulfillment_settings"}, {"_id": 0}) or {}
        return {"whatsapp_number": str(doc.get("whatsapp_number") or "").strip(),
                "edit_enabled": doc.get("edit_enabled", True) is not False}

    async def _edit_state(order: Dict[str, Any]) -> Dict[str, Any]:
        s = await _fulfil_settings()
        first_fill = not order.get("info")
        delivered_at = order.get("delivered_at")
        post_edits = int(order.get("post_delivery_edits") or 0)
        remaining = max(POST_DELIVERY_MAX_EDITS - post_edits, 0)

        if order.get("status") != "paid":
            can, reason = False, "Payment required before adding details."
        elif first_fill:
            can, reason = True, ""          # initial fill is always allowed
        elif order.get("edit_locked"):
            can, reason = False, "The studio has locked editing while finalising your invitation."
        elif not s["edit_enabled"]:
            can, reason = False, "Editing is currently turned off."
        elif not delivered_at:
            # Still being prepared (pending_info / building), not locked → editable.
            can, reason = True, ""
        elif remaining <= 0:
            can, reason = False, (f"You've used all {POST_DELIVERY_MAX_EDITS} edits after "
                                  f"delivery. Message us on WhatsApp for further changes.")
        else:
            can, reason = True, ""          # delivered, edits remaining

        return {"can_edit": can, "reason": reason, "first_fill": first_fill,
                "delivered": bool(delivered_at),
                "post_delivery_edits": post_edits,
                "post_delivery_edits_remaining": remaining,
                "post_delivery_max": POST_DELIVERY_MAX_EDITS,
                # kept for backward-compat with the form (no time window anymore)
                "edit_deadline": None,
                "whatsapp_number": s["whatsapp_number"],
                "edit_window_hours": None}

    async def _require_editable(order: Dict[str, Any]) -> None:
        st = await _edit_state(order)
        if not st["can_edit"]:
            raise HTTPException(403, st["reason"] or "This order can no longer be edited.")

    @router.get("/api/store/order/{order_id}/edit-state")
    async def order_edit_state(order_id: str, current=Depends(_require_studio_buyer)):
        order = await db.invitation_orders.find_one(
            {"id": order_id, "user_id": current["user_id"]}, {"_id": 0})
        if not order:
            raise HTTPException(404, "Order not found")
        return await _edit_state(order)

    # ---- submit wedding info (post-payment) --------------------------------
    @router.post("/api/store/order/{order_id}/info")
    async def submit_info(order_id: str, payload: OrderInfoRequest, current=Depends(_require_studio_buyer)):
        order = await db.invitation_orders.find_one(
            {"id": order_id, "user_id": current["user_id"]}, {"_id": 0}
        )
        if not order:
            raise HTTPException(404, "Order not found")
        if order.get("status") != "paid":
            raise HTTPException(402, "Payment required before submitting details.")
        await _require_editable(order)
        info = payload.model_dump()

        info = hash_qr_password(info)
        upd = {"info": info, "info_at": _now_iso()}
        if order.get("delivered_at"):
            # Post-delivery edit: DON'T rebuild. Count it (max 3) and raise an
            # admin notification so the studio applies the change to the live
            # link manually. Keeps build_status = delivered.
            n = int(order.get("post_delivery_edits") or 0) + 1
            upd["post_delivery_edits"] = n
            upd["edit_requested"] = True
            upd["edit_requested_at"] = _now_iso()
            await db.invitation_orders.update_one({"id": order_id}, {"$set": upd})
            try:
                await db.admin_notifications.insert_one({
                    "id": uuid.uuid4().hex,
                    "type": "order_edit_request",
                    "order_id": order_id,
                    "fulfillment_code": order.get("fulfillment_code"),
                    "user_id": order.get("user_id"),
                    "message": "Buyer edited details after delivery — update the live link.",
                    "read": False,
                    "created_at": _now_iso(),
                })
            except Exception as e:
                logger.warning("edit-request notification insert failed: %s", e)
            remaining = max(POST_DELIVERY_MAX_EDITS - n, 0)
            return {"order_id": order_id, "build_status": order.get("build_status", "delivered"),
                    "edit_request": True, "post_delivery_edits_remaining": remaining,
                    "message": ("Your changes were sent to our studio — we'll update your live "
                                f"link shortly. {remaining} edit(s) left.")}
        upd["build_status"] = "building"
        await db.invitation_orders.update_one({"id": order_id}, {"$set": upd})
        order.update(upd)

        # First fill complete → the studio must now build. Two things the owner
        # asked for happen here:
        #   1) reserve the event's two Drive folders (QR photos + guest selfies)
        #      and record which storage mail they live on, and
        #   2) raise a highlighted admin-panel notification carrying all of it,
        #      so the request lands with its folders and account already visible.
        folders = {"qr": None, "selfies": None}
        account = {"provisioned": False, "email": None, "label": None}
        try:
            from event_folders import ensure_order_folders, folder_names
            await ensure_order_folders(db, order)
            folders = folder_names(order)
            account = order.get("storage_account") or account
        except Exception as e:
            logger.warning("[store] folder reservation failed for %s: %s", order_id, e)

        try:
            acct_line = (account.get("email") or account.get("label")
                         or "reserved — created on publish")
            await db.admin_notifications.insert_one({
                "id": uuid.uuid4().hex,
                "type": "order_details_submitted",
                "order_id": order_id,
                "fulfillment_code": order.get("fulfillment_code"),
                "user_id": order.get("user_id"),
                "buyer_kind": order.get("buyer_kind"),
                "message": "Details submitted — ready to build.",
                # Everything the owner wanted on the notification itself.
                "drive_folder_qr": order.get("drive_folder_qr"),
                "drive_folder_selfies": order.get("drive_folder_selfies"),
                "storage_account": account,
                "storage_account_email": account.get("email") or account.get("label"),
                "detail": f"Folders on {acct_line}",
                "read": False,
                "created_at": _now_iso(),
            })
        except Exception as e:
            logger.warning("[store] details-submitted notification failed for %s: %s",
                           order_id, e)

        return {"order_id": order_id, "build_status": "building",
                "message": "Details received. Our studio will build your invitation.",
                "drive_folder_qr": order.get("drive_folder_qr"),
                "drive_folder_selfies": order.get("drive_folder_selfies"),
                "storage_account": account}

    # ---- draft autosave (cross-device; localStorage is the primary copy) ----
    @router.put("/api/store/order/{order_id}/info-draft")
    async def save_info_draft(order_id: str, payload: Dict[str, Any] = Body(...),
                              current=Depends(_require_studio_buyer)):
        order = await db.invitation_orders.find_one(
            {"id": order_id, "user_id": current["user_id"]}, {"_id": 0})
        if not order:
            raise HTTPException(404, "Order not found")
        await _require_editable(order)
        await db.invitation_orders.update_one(
            {"id": order_id}, {"$set": {"info_draft": payload, "draft_at": _now_iso()}})
        return {"saved": True, "draft_at": _now_iso()}

    @router.get("/api/store/order/{order_id}")
    async def get_order(order_id: str, current=Depends(_require_studio_buyer)):
        order = await db.invitation_orders.find_one(
            {"id": order_id, "user_id": current["user_id"]}, {"_id": 0})
        if not order:
            raise HTTPException(404, "Order not found")
        order["edit_state"] = await _edit_state(order)
        return order

    # ---- super-admin: fulfillment settings + per-order edit lock -----------
    if require_super_admin is not None:
        @router.get("/api/admin/fulfillment/settings")
        async def get_fulfil_settings(_s=Depends(require_super_admin)):
            return await _fulfil_settings()

        @router.put("/api/admin/fulfillment/settings")
        async def set_fulfil_settings(payload: Dict[str, Any] = Body(...), _s=Depends(require_super_admin)):
            upd = {"id": "fulfillment_settings"}
            if "whatsapp_number" in payload:
                # digits only — wa.me needs a bare international number
                upd["whatsapp_number"] = re.sub(r"\D", "", str(payload.get("whatsapp_number") or ""))
            if "edit_enabled" in payload:
                upd["edit_enabled"] = bool(payload.get("edit_enabled"))
            await db.app_settings.update_one({"id": "fulfillment_settings"}, {"$set": upd}, upsert=True)
            return await _fulfil_settings()

        @router.post("/api/admin/fulfillment/requests/{code}/edit-lock")
        async def set_edit_lock(code: str, payload: Dict[str, Any] = Body(...), _s=Depends(require_super_admin)):
            order = await db.invitation_orders.find_one({"fulfillment_code": code}, {"_id": 0})
            if not order:
                raise HTTPException(404, "Request not found")
            locked = bool(payload.get("locked"))
            await db.invitation_orders.update_one({"id": order["id"]}, {"$set": {"edit_locked": locked}})
            return {"code": code, "edit_locked": locked}

    # ---- user's orders -----------------------------------------------------
    @router.get("/api/store/my-orders")
    async def my_orders(current=Depends(_require_studio_buyer)):
        cur = db.invitation_orders.find({"user_id": current["user_id"]}, {"_id": 0})
        orders = await cur.sort("created_at", -1).to_list(100)
        return {"orders": orders}

    return router


def build_store_admin_router(db, require_admin) -> APIRouter:
    """Done-for-you build queue: paid orders awaiting / in build.

    `require_admin` here MUST be the super-admin dependency: this console spans
    every studio's orders (list, mark delivered, clear edit flags), so gating it
    on plain photographer auth would let any studio act on other studios' orders.
    server.py passes require_super_admin — keep it that way.
    """
    router = APIRouter(tags=["store-admin"])

    @router.get("/api/admin/build-queue")
    async def build_queue(_admin: dict = Depends(require_admin)):
        # Paid orders that need studio attention: awaiting details / building, OR a
        # delivered order whose buyer requested a post-delivery edit. Filter in
        # Python (adapter-safe) rather than a compound $or query.
        cur = db.invitation_orders.find({"status": "paid"}, {"_id": 0})
        allo = await cur.sort("paid_at", -1).to_list(500)
        orders = [o for o in allo
                  if o.get("build_status") in ("pending_info", "building")
                  or o.get("edit_requested")]
        # attach buyer info
        for o in orders:
            u = await db.users.find_one({"user_id": o.get("user_id")},
                                        {"_id": 0, "name": 1, "email": 1, "phone": 1})
            o["buyer"] = u or {}
        return {"orders": orders, "count": len(orders),
                "edit_requests": sum(1 for o in orders if o.get("edit_requested"))}

    @router.post("/api/admin/build-queue/{order_id}/edit-applied")
    async def mark_edit_applied(order_id: str, _admin: dict = Depends(require_admin)):
        """Studio applied a post-delivery edit to the live link → clear the flag."""
        await db.invitation_orders.update_one(
            {"id": order_id}, {"$set": {"edit_requested": False, "edit_applied_at": _now_iso()}})
        return {"order_id": order_id, "edit_requested": False}

    @router.post("/api/admin/build-queue/{order_id}/deliver")
    async def deliver(order_id: str, payload: dict, _admin: dict = Depends(require_admin)):
        """Mark an order delivered and link the published invitation."""
        profile_id = (payload or {}).get("profile_id")
        res = await db.invitation_orders.update_one(
            {"id": order_id},
            {"$set": {"build_status": "delivered", "profile_id": profile_id,
                      "delivered_at": _now_iso()}},
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Order not found")
        # Loyalty tier counter: a delivered paid link is the post-credits
        # definition of a "paid link" (the old writer was the credit-priced
        # publish path, deleted with credits — super_admin_pricing.my_tier had
        # NO writer since). tier_counted CAS = once per order even if an admin
        # re-delivers to correct the linked profile.
        try:
            claimed = await db.invitation_orders.find_one_and_update(
                {"id": order_id, "tier_counted": {"$ne": True}},
                {"$set": {"tier_counted": True}},
            )
            if claimed and claimed.get("user_id"):
                await db.admins.update_one(
                    {"id": claimed["user_id"]}, {"$inc": {"paid_links_count": 1}})
        except Exception as tier_err:  # never blocks delivery
            logger.warning("paid_links_count increment failed for %s: %s", order_id, tier_err)
        # Unified engine: apply purchased duration → link_expiry_date and feature
        # pack → granted_features onto the delivered link. No-op unless
        # new_pricing_enabled is ON and the order was priced by the v2 engine;
        # grandfathered links never get an expiry. Never blocks delivery.
        entitlements = {"applied": False}
        try:
            from pricing_activation import apply_order_entitlements
            order = await db.invitation_orders.find_one({"id": order_id}, {"_id": 0})
            # require_super_admin yields a bare admin_id string; require_admin a dict
            actor = _admin.get("admin_id") if isinstance(_admin, dict) else (str(_admin) or "admin")
            entitlements = await apply_order_entitlements(db, order or {}, profile_id, actor=actor)
        except Exception as e:  # pragma: no cover - entitlement failure never blocks delivery
            logger.warning("apply_order_entitlements failed for %s: %s", order_id, e)
        return {"order_id": order_id, "build_status": "delivered",
                "profile_id": profile_id, "entitlements": entitlements}

    return router
