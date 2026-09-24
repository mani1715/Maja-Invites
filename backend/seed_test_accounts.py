"""
seed_test_accounts.py — idempotent TEST accounts for owner dogfooding.

Creates one normal-user and one photographer account, both comped to full free
access, so the owner can walk the entire buy / create-link flow without paying.
Test buyers additionally get a free-order bypass in store_features.create_order
(no Razorpay), so any design they select can be claimed for free.

⚠️ TEST ONLY. Remove these accounts (and disable this seed) before public launch.
   Credentials are intentionally simple and documented for the owner.

Enable/disable with env SEED_TEST_ACCOUNTS ("1" default on; set "0" to skip).
Override the shared password with env TEST_ACCOUNT_PASSWORD.
"""
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("seed_test_accounts")

# Owner-supplied comped test credentials. The normal-user address uses the
# reserved `.test` TLD (RFC 2606); that's fine now because UserLogin accepts a
# plain `str` (see user_auth.py) — it used to be blocked by EmailStr's special-
# use-domain rejection. UserRegister still uses EmailStr, so these accounts are
# created by THIS seed (not self-registration). AdminLogin already takes a str.
TEST_USER_EMAIL = "test.user@maja.test"
TEST_STUDIO_EMAIL = "test.studio@maja.test"
TEST_PASSWORD = os.environ.get("TEST_ACCOUNT_PASSWORD", "MajaTest@123")

_PREMIUM_FEATURES = [
    "about", "services", "packages", "pricing", "albums", "gallery", "videos",
    "testimonials", "blog", "contact", "booking_form", "whatsapp", "instagram",
    "facebook", "youtube", "google_maps", "seo", "analytics", "custom_domain",
]


def _now():
    return datetime.now(timezone.utc)


def _is_production() -> bool:
    return any(
        os.environ.get(k, "").lower() in ("production", "prod")
        for k in ("ENVIRONMENT", "ENV", "APP_ENV")
    )


# Top-tier feature sets, mirrored from subscription_service.PLAN_CATALOG so the
# comped test plans read as fully-featured for their product.
_INVITATION_FEATURES = [
    "invitation_website", "rsvp", "gallery", "live_streaming", "music", "countdown",
    "maps", "gift_registry", "accommodation", "travel", "guest_management", "ai_story",
    "qr_checkin", "whatsapp_integration", "email_notifications", "analytics",
    "premium_fonts", "extra_languages", "premium_animations", "custom_domain", "seo",
    "portfolio_integration", "cloud_backup", "additional_team_members", "priority_support",
]
_BACKUP_FEATURES = [
    "automatic_backup", "manual_backup", "restore", "restore_points",
    "version_history", "encryption", "scheduled_backup",
]


async def _comp_subscription(db, studio_id: str, product: str, tier: str, now,
                             plan_extra: dict | None = None) -> None:
    """Idempotently comp `product` at `tier` for the test studio: a hidden (₹0,
    is_active=False so it never shows as a purchasable card) plan doc plus an
    active 10-year subscription, so the studio reads as fully entitled for that
    product without paying. Feature-gating everywhere reads
    db.subscriptions{studio_id, product, status:"active"}, so this covers it."""
    plan_id = f"plan_{product}_test"
    plan = {"id": plan_id, "product": product, "tier": tier, "base_monthly": 0,
            "is_active": False, "created_at": now.isoformat()}
    if plan_extra:
        plan.update(plan_extra)
    if not await db.subscription_plans.find_one({"id": plan_id}, {"_id": 0}):
        await db.subscription_plans.insert_one(plan)
    else:
        await db.subscription_plans.update_one(
            {"id": plan_id}, {"$set": {k: v for k, v in plan.items() if k != "id"}})
    if not await db.subscriptions.find_one(
            {"studio_id": studio_id, "product": product, "status": "active"}, {"_id": 0}):
        await db.subscriptions.insert_one({
            "id": f"sub_test_{product}_{uuid.uuid4().hex[:8]}",
            "studio_id": studio_id, "product": product, "plan_id": plan_id,
            "tier": tier, "cycle": "yearly", "status": "active",
            "current_period_end": (now + timedelta(days=3650)).isoformat(),
            "is_test": True, "created_at": now.isoformat(),
        })


async def seed_test_accounts(db) -> None:
    # Default OFF (opt-in). In production the seed is refused unconditionally,
    # even if SEED_TEST_ACCOUNTS=1, because comped accounts get a paid-goods
    # bypass (store_features.is_test_buyer). See MAJA_V2 Phase 0 (S2).
    if os.environ.get("SEED_TEST_ACCOUNTS", "0") not in ("1", "true", "True"):
        return
    if _is_production():
        logger.warning(
            "[test-accounts] SEED_TEST_ACCOUNTS set but ENVIRONMENT=production; refusing to seed comped accounts."
        )
        return
    try:
        from auth import get_password_hash
    except Exception as e:
        logger.warning("[test-accounts] cannot import password hasher: %s", e)
        return

    pw = get_password_hash(TEST_PASSWORD)
    now = _now()

    # 1) Normal user -------------------------------------------------------
    existing_user = await db.users.find_one({"email": TEST_USER_EMAIL}, {"_id": 0})
    if not existing_user:
        await db.users.insert_one({
            "user_id": f"user_test_{uuid.uuid4().hex[:8]}",
            "email": TEST_USER_EMAIL,
            "name": "Test Couple",
            "phone": "+910000000000",
            "picture": None,
            "password_hash": pw,
            "credits": 0,
            "auth_provider": "password",
            "status": "active",
            "is_test": True,
            "created_at": now,
        })
        logger.info("[test-accounts] created normal user %s", TEST_USER_EMAIL)
    else:
        await db.users.update_one({"email": TEST_USER_EMAIL},
            {"$set": {"password_hash": pw, "is_test": True, "status": "active"}})

    # 2) Photographer (built from the Admin model so login works) ----------
    try:
        from models import Admin, AdminRole, AdminStatus
    except Exception as e:
        logger.warning("[test-accounts] cannot import Admin model: %s", e)
        return

    studio = await db.admins.find_one({"email": TEST_STUDIO_EMAIL}, {"_id": 0})
    if not studio:
        adm = Admin(email=TEST_STUDIO_EMAIL, password_hash=pw, name="Test Studio",
                    role=AdminRole.ADMIN, status=AdminStatus.ACTIVE,
                    phone="+910000000001", self_signup=True).model_dump()
        adm["is_test"] = True
        adm["account_type"] = "photographer"
        adm["directory_listed"] = True
        adm["service_cities"] = ["hyderabad", "bengaluru"]
        adm["bio"] = "Test studio account for owner dogfooding."
        await db.admins.insert_one(adm)
        studio_id = adm["id"]
        logger.info("[test-accounts] created photographer %s", TEST_STUDIO_EMAIL)
    else:
        studio_id = studio["id"]
        await db.admins.update_one({"email": TEST_STUDIO_EMAIL},
            {"$set": {"password_hash": pw, "is_test": True, "status": "active",
                      "directory_listed": True}})

    # comp PREMIUM portfolio plan. is_active=False so it never shows as a
    # purchasable card on the plans page (was appearing as "Studio ₹0"); the
    # comped subscription still resolves premium because tier is read from the
    # plan doc by id regardless of is_active.
    if not await db.subscription_plans.find_one({"id": "plan_portfolio_test"}, {"_id": 0}):
        await db.subscription_plans.insert_one({
            "id": "plan_portfolio_test", "product": "portfolio", "tier": "Premium",
            "portfolio_tier": "premium", "base_monthly": 0, "is_active": False,
            "storage_gb": 20, "features": _PREMIUM_FEATURES,
            "created_at": now.isoformat(),
        })
    else:
        # keep older comped rows hidden + premium after this change
        await db.subscription_plans.update_one(
            {"id": "plan_portfolio_test"},
            {"$set": {"is_active": False, "portfolio_tier": "premium", "tier": "Premium"}})

    # active subscription so the studio reads as premium everywhere ---------
    if not await db.subscriptions.find_one(
            {"studio_id": studio_id, "product": "portfolio", "status": "active"}, {"_id": 0}):
        await db.subscriptions.insert_one({
            "id": f"sub_test_{uuid.uuid4().hex[:10]}",
            "studio_id": studio_id, "product": "portfolio", "plan_id": "plan_portfolio_test",
            "tier": "Premium", "cycle": "yearly", "status": "active",
            "current_period_end": (now + timedelta(days=3650)).isoformat(),
            "is_test": True, "created_at": now.isoformat(),
        })

    # comp the other three products too, so the test studio has EVERYTHING free
    # (invitation features, storage, cloud backup) — not just the portfolio.
    await _comp_subscription(db, studio_id, "invitation", "Enterprise", now,
                             {"features": _INVITATION_FEATURES})
    await _comp_subscription(db, studio_id, "storage", "Enterprise", now,
                             {"storage_gb": 5120})
    await _comp_subscription(db, studio_id, "backup", "Plus", now,
                             {"storage_gb": 500, "features": _BACKUP_FEATURES})

    # portfolio profile so the directory has styles/services/location -------
    if not await db.portfolio_profiles.find_one({"id": studio_id}, {"_id": 0}):
        await db.portfolio_profiles.insert_one({
            "id": studio_id, "studio_name": "Test Studio",
            "services": ["Wedding Photography", "Engagement Photography", "Pre-Wedding Shoots"],
            "styles": ["Candid", "Cinematic", "Traditional"],
            "location": {"city": "Hyderabad", "state": "Telangana", "country": "India"},
            "is_published": True, "created_at": now.isoformat(),
        })

    logger.info("[test-accounts] ensured (studio_id=%s, user=%s)", studio_id, TEST_USER_EMAIL)


async def is_test_buyer(db, current: dict) -> bool:
    """True when the current buyer (user or photographer) is a test account."""
    # Hard prod kill-switch: the test-buyer path skips Razorpay and marks orders
    # paid for ₹0. Never allow that branch in production regardless of account
    # flags (defence in depth behind the seed guard). See MAJA_V2 Phase 0 (S2).
    if _is_production():
        return False
    uid = (current or {}).get("user_id")
    if not uid:
        return False
    if current.get("kind") == "photographer":
        a = await db.admins.find_one({"id": uid}, {"_id": 0, "is_test": 1})
        return bool((a or {}).get("is_test"))
    u = await db.users.find_one({"user_id": uid}, {"_id": 0, "is_test": 1})
    return bool((u or {}).get("is_test"))
