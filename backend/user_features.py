"""
USER FEATURES — Normal-user (wedding-couple / guest) backend:

  • Design pricing (super-admin sets credits-per-design)
  • Public design pricing list
  • User-side Razorpay credit purchase (create-order + verify)
  • User-side invitation create + list (deducts credits from user wallet)

Mirrors the photographer flow at `/api/admin/*` but writes/reads from the
`users` collection and prefixes profile `admin_id` with `user:<user_id>` so
existing admin data-isolation queries never see user-created profiles.
"""
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from user_auth import NORMAL_USERS_RETIRED

logger = logging.getLogger("user_features")


def _retired() -> None:
    """Normal-user (couple/buyer) accounts are retired — see PRODUCT PIVOT.
    Every user-owned invitation/dashboard endpoint below answers 410 Gone."""
    raise HTTPException(status_code=410, detail=NORMAL_USERS_RETIRED)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _razorpay_configured() -> bool:
    """True if real Razorpay keys are present (not the placeholder defaults)."""
    key_id = os.environ.get("RAZORPAY_KEY_ID", "")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
    if not key_id or not key_secret:
        return False
    if "PLACEHOLDER" in key_id.upper() or "PLACEHOLDER" in key_secret.upper():
        return False
    return True


# ─────────────────────────────────────────────────────────────────────
# Defaults seeded at app startup (see seed_user_purchase_catalog below).
# Kept at module level so they're trivially overridable in tests.
# ─────────────────────────────────────────────────────────────────────
DEFAULT_EXPIRY_TIERS = [
    {"id": "1_month",  "label": "1 Month",  "days": 30,  "credits": 1, "order": 1},
    {"id": "3_months", "label": "3 Months", "days": 90,  "credits": 2, "order": 2},
    {"id": "6_months", "label": "6 Months", "days": 180, "credits": 3, "order": 3},
    {"id": "1_year",   "label": "1 Year",   "days": 365, "credits": 5, "order": 4},
]

DEFAULT_USER_ADDONS = [
    {"id": "music",          "label": "Background Music",       "description": "Curated royalty-free score plays on the invitation.",     "credits": 1, "order": 1},
    {"id": "live_gallery",   "label": "Live Photo Gallery",     "description": "Guests upload photos live during the wedding.",           "credits": 3, "order": 2},
    {"id": "ai_story",       "label": "AI Story Composer",      "description": "Gemini writes a cinematic 'how we met' narrative.",        "credits": 2, "order": 3},
    {"id": "rsvp",           "label": "Smart RSVP",             "description": "Guest list, +1 tracking and dietary preferences.",        "credits": 1, "order": 4},
    {"id": "whatsapp",       "label": "WhatsApp Invites",       "description": "One-click WhatsApp share with personalised greetings.",   "credits": 1, "order": 5},
    {"id": "parking",        "label": "Parking & Travel",       "description": "Parking map, drop-off zones and travel deep links.",       "credits": 1, "order": 6},
    {"id": "gift_registry",  "label": "Gift Registry",          "description": "Optional gift list or 'no gifts please' note.",           "credits": 1, "order": 7},
    {"id": "digital_shagun", "label": "Digital Shagun (UPI)",   "description": "Live UPI blessing counter shown on the invitation.",       "credits": 1, "order": 8},
    {"id": "ai_face_match",  "label": "AI Face-Match Photos",   "description": "Guests find their photos via a single selfie.",           "credits": 3, "order": 9},
    {"id": "save_the_date",  "label": "Save the Date teaser",   "description": "A teaser page that goes live before the main invitation.", "credits": 1, "order": 10},
]


async def seed_user_purchase_catalog(db) -> None:
    """Idempotent startup seeder for the public user-purchase catalogue.

    Runs once at app boot (called from server.py startup) so the lazy
    seed inside the request handlers can never race two concurrent
    first-time visitors.  Safe to re-call — uses count-then-insert.
    """
    try:
        if await db.expiry_tiers.count_documents({}) == 0:
            await db.expiry_tiers.insert_many(DEFAULT_EXPIRY_TIERS)
            logger.info("seed_user_purchase_catalog: inserted %d expiry tiers", len(DEFAULT_EXPIRY_TIERS))
        if await db.user_addons.count_documents({}) == 0:
            await db.user_addons.insert_many(DEFAULT_USER_ADDONS)
            logger.info("seed_user_purchase_catalog: inserted %d user addons", len(DEFAULT_USER_ADDONS))
    except Exception as e:
        # Log but don't crash boot on a seeding hiccup.
        logger.exception("seed_user_purchase_catalog failed: %s", e)


def _strip(d: Optional[dict]) -> Optional[dict]:
    if d is None:
        return d
    d.pop("_id", None)
    return d


# ─────────────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────────────
class DesignPricingUpsert(BaseModel):
    credits: int = Field(ge=0, le=100_000)
    inr_price: int = Field(default=0, ge=0)  # Rupee price for normal users
    is_active: bool = True
    label: Optional[str] = None  # Human-readable design name (cache)
    theme_id: Optional[str] = None  # e.g. "royal_mughal"
    event_type: Optional[str] = None  # e.g. "marriage"


class GrantUserCredits(BaseModel):
    """Request body for granting credits to a normal user."""
    amount: int = Field(gt=0, le=10_000)
    reason: Optional[str] = Field(default="Granted by super-admin", max_length=240)


class AdjustUserCredits(BaseModel):
    """Request body for adjusting (+/-) credits for a normal user."""
    delta: int = Field(..., ge=-10_000, le=10_000)
    reason: Optional[str] = Field(default="Adjusted by super-admin", max_length=240)


class SetUserStatus(BaseModel):
    """Request body for setting user account status."""
    status: str  # "active" | "suspended" | "blocked"
    reason: Optional[str] = Field(default=None, max_length=240)


# ─────────────────────────────────────────────────────────────────────
# Router builder
# ─────────────────────────────────────────────────────────────────────
def build_user_features_router(
    db,
    require_super_admin,
    get_current_public_user,  # unused now (every user-owned route is 410) — kept for server.py call-site compat
    razorpay_client,
    sanitize_html,
    generate_slug,
    calculate_expiry_date,
    calculate_invitation_expires_at,
) -> APIRouter:
    router = APIRouter(tags=["user-features"])

    # ════════════════════════════════════════════════════════════════════
    # DESIGN PRICING — super-admin CRUD
    # ════════════════════════════════════════════════════════════════════
    @router.get("/api/super-admin/design-pricing")
    async def sa_list_design_pricing(super_admin_id: str = Depends(require_super_admin)):
        cursor = db.design_pricing.find({}, {"_id": 0}).sort("design_id", 1)
        rows = await cursor.to_list(5000)
        return {"pricing": rows}

    @router.put("/api/super-admin/design-pricing/{design_id}")
    async def sa_upsert_design_pricing(
        design_id: str,
        payload: DesignPricingUpsert,
        super_admin_id: str = Depends(require_super_admin),
    ):
        update = {
            **payload.model_dump(exclude_none=True),
            "design_id": design_id,
            "updated_at": _now_iso(),
            "updated_by": super_admin_id,
        }
        await db.design_pricing.update_one(
            {"design_id": design_id},
            {"$set": update, "$setOnInsert": {"created_at": _now_iso()}},
            upsert=True,
        )
        row = await db.design_pricing.find_one({"design_id": design_id}, {"_id": 0})
        return row

    @router.delete("/api/super-admin/design-pricing/{design_id}")
    async def sa_delete_design_pricing(
        design_id: str, super_admin_id: str = Depends(require_super_admin)
    ):
        await db.design_pricing.delete_one({"design_id": design_id})
        return {"success": True}

    # ════════════════════════════════════════════════════════════════════
    # NORMAL-USER MANAGEMENT — super-admin CRUD (July 2025 spec)
    #
    # The super-admin console previously only listed photographers. These
    # endpoints surface every normal user (sign-up via /api/users/register
    # or Google OAuth) so the super-admin can:
    #   - See every user account & when they signed up
    #   - View any user's profile with their invitations
    #   - Grant FREE credits (with a reason — audited)
    #   - Suspend / unsuspend / block the account
    # ════════════════════════════════════════════════════════════════════

    async def _user_stats(user_id: str):
        """Compute per-user invite + credit counts. Cheap aggregations."""
        invites = await db.profiles.count_documents({"user_id": user_id})
        return {"profiles_count": invites}

    @router.get("/api/super-admin/users")
    async def sa_list_users(
        super_admin_id: str = Depends(require_super_admin),
        q: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 200,
    ):
        """List every normal user. Optional `q` searches name/email/phone,
        optional `status` filters by account status."""
        filt: Dict[str, Any] = {}
        if status and status.lower() in ("active", "suspended", "blocked"):
            filt["status"] = status.lower()
        if q and q.strip():
            term = q.strip()
            filt["$or"] = [
                {"email":  {"$regex": term, "$options": "i"}},
                {"name":   {"$regex": term, "$options": "i"}},
                {"phone":  {"$regex": term, "$options": "i"}},
                {"user_id": term},
            ]
        cursor = (
            db.users.find(filt, {"_id": 0, "password_hash": 0})
            .sort("created_at", -1)
            .limit(max(1, min(limit, 1000)))
        )
        users = await cursor.to_list(1000)
        # Enrich with profiles_count
        out = []
        for u in users:
            stats = await _user_stats(u["user_id"])
            out.append({
                **u,
                **stats,
                "status": u.get("status") or "active",
                "credits": int(u.get("credits") or 0),
            })
        return {"users": out, "count": len(out)}

    @router.get("/api/super-admin/users/{user_id}")
    async def sa_get_user(
        user_id: str, super_admin_id: str = Depends(require_super_admin)
    ):
        """Full user detail: account + all their invitations + recent credit
        ledger entries — everything the super-admin needs to make a call."""
        user = await db.users.find_one(
            {"user_id": user_id}, {"_id": 0, "password_hash": 0}
        )
        if not user:
            raise HTTPException(404, "User not found")
        user["status"]  = user.get("status") or "active"
        user["credits"] = int(user.get("credits") or 0)

        # Their invitations (no _id, newest first)
        profiles_cur = db.profiles.find(
            {"user_id": user_id}, {"_id": 0}
        ).sort("created_at", -1).limit(200)
        profiles = await profiles_cur.to_list(200)

        # Recent credit ledger (newest first, last 100)
        ledger_cur = db.user_credit_ledger.find(
            {"user_id": user_id}, {"_id": 0}
        ).sort("created_at", -1).limit(100)
        ledger = await ledger_cur.to_list(100)

        return {
            "user": user,
            "profiles": profiles,
            "profiles_count": len(profiles),
            "credit_ledger": ledger,
        }



    @router.put("/api/super-admin/users/{user_id}/status")
    async def sa_set_user_status(
        user_id: str,
        payload: SetUserStatus,
        super_admin_id: str = Depends(require_super_admin),
    ):
        """Suspend / block / re-activate a normal user.
          - active     → user can log in normally
          - suspended  → existing sessions stay valid until expiry, but new
                         login attempts are refused
          - blocked    → user is locked out immediately; sessions invalidated
        """
        wanted = (payload.status or "").lower().strip()
        if wanted not in ("active", "suspended", "blocked"):
            raise HTTPException(400, "status must be active|suspended|blocked")

        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(404, "User not found")

        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "status": wanted,
                "status_reason": (payload.reason or "").strip() or None,
                "status_changed_by": super_admin_id,
                "status_changed_at": _now_iso(),
                "updated_at": _now_iso(),
            }},
        )

        # If blocking, kill all active sessions for this user
        if wanted == "blocked":
            try:
                await db.user_sessions.delete_many({"user_id": user_id})
            except Exception:
                pass

        try:
            await db.audit_logs.insert_one({
                "id": uuid.uuid4().hex,
                "admin_id": super_admin_id,         # canonical field expected by AuditLogResponse
                "actor_id": super_admin_id,
                "actor_role": "super_admin",
                "action": f"user_status_{wanted}",
                "target_id": user_id,
                "target_type": "user",
                "details": {                        # Dict — matches AuditLogResponse schema
                    "user_id": user_id,
                    "status": wanted,
                    "reason": payload.reason or f"status set to {wanted}",
                },
                "created_at": _now_iso(),
                "timestamp": _now_iso(),
            })
        except Exception:
            pass

        return {"success": True, "status": wanted}





    # ════════════════════════════════════════════════════════════════════
    # POST-PURCHASE ADD-ONS — buy extra features on an existing invite
    # ════════════════════════════════════════════════════════════════════
    @router.post("/api/users/profiles/{profile_id}/buy-addon")
    async def user_buy_addon(profile_id: str):
        _retired()




    # ---- normal-user invitation insights (RSVP / wishes / gallery counts) ----
    @router.get("/api/users/profiles/{profile_id}/insights")
    async def user_profile_insights(profile_id: str):
        _retired()

    # ════════════════════════════════════════════════════════════════════
    # USER PROFILES — create / list / read
    # ════════════════════════════════════════════════════════════════════
    @router.post("/api/users/profiles")
    async def user_create_profile():
        _retired()

    @router.get("/api/users/profiles")
    async def user_list_profiles():
        _retired()

    @router.get("/api/users/profiles/{profile_id}")
    async def user_get_profile(profile_id: str):
        _retired()

    # ── PATCH: edit a user-owned invitation (limited fields) ────────────
    @router.patch("/api/users/profiles/{profile_id}")
    async def user_update_profile(profile_id: str):
        _retired()

    # ── DELETE: remove a user-owned invitation ─────────────────────────
    @router.delete("/api/users/profiles/{profile_id}")
    async def user_delete_profile(profile_id: str):
        _retired()


    # ════════════════════════════════════════════════════════════════════
    # USER IMAGE UPLOAD — for bride/groom/couple thumbnails on the
    # invitation form (used before a profile exists, so we don't bind to
    # any profile_id).  Reuses the same WebP-conversion pipeline.
    # ════════════════════════════════════════════════════════════════════
    @router.post("/api/users/upload-image")
    async def user_upload_image():
        _retired()

    return router
