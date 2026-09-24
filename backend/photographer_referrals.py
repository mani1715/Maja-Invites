"""
Photographer Referral Codes — viral growth on top of gift-code infra.

Every photographer (admin role) automatically gets a personal referral code
of the form `MAJA-XXXXXX`. Credits were permanently deleted from this
platform, so redeeming someone's code no longer credits a wallet — it grants
BOTH sides a reward from `studio_rewards` (shared with `gift_code_routes.py`,
which owns the reward-granting helper's twin and `GET /api/account/rewards`):
    storage_gb    — extra storage, applied immediately via `storage_addons`
                    (already read by monetization_service.storage_bonus_bytes).
    discount_inr  — a flat-INR-off code minted into `discount_codes`
                    (pricing_features.py), single-use, redeemable through the
                    existing `/api/public/discount/validate`.

Collection: `photographer_referrals`
Schema:
    code:                    str  unique, "MAJA-XXXXXX"
    owner_admin_id:          str  the photographer who owns this code
    redeemer_reward_kind:    "storage_gb" | "discount_inr"  (default storage_gb)
    redeemer_reward_value:   int  granted to the person redeeming (default 5)
    owner_reward_kind:       "storage_gb" | "discount_inr"  (default storage_gb)
    owner_reward_value:      int  granted to the owner per redemption (default 5)
    per_account_limit:       int  same-account cap (default 1)
    redeemed_count:          int  total redemptions
    is_active:                bool
    created_at:               iso str
    last_redeemed_at:         iso str | None

Endpoints:
  Self-service (any signed-in photographer):
    GET    /api/account/referral-code             → get / auto-create my code
    POST   /api/account/referral-code/regenerate  → rotate to a new code
    POST   /api/account/redeem-referral { code }  → redeem someone else's code

  Super-Admin:
    GET    /api/super-admin/referrals/{admin_id}   → view a photographer's code + stats
    GET    /api/super-admin/referrals              → leaderboard (top owners by redemptions)
    PATCH  /api/super-admin/referrals/{admin_id}   → change reward kind/value / active flag
"""
from __future__ import annotations

import hashlib
import logging
import random
import string
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from pg_adapter import Database as AsyncIOMotorDatabase

logger = logging.getLogger("photographer_referrals")


_PREFIX = "MAJA-"
_LEN    = 6
_ALPHABET = string.ascii_uppercase + string.digits
_REWARD_KINDS = ("storage_gb", "discount_inr")

DEFAULT_REWARD_KIND = "storage_gb"
DEFAULT_REWARD_VALUE = 5              # GB granted to each side per redemption
DEFAULT_PER_ACCOUNT_LIMIT = 1


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _generate_code() -> str:
    body = "".join(random.choices(_ALPHABET, k=_LEN))
    return f"{_PREFIX}{body}"


def _actor_id(actor) -> str:
    if isinstance(actor, dict):
        return actor.get("id") or actor.get("admin_id") or ""
    return actor or ""


# ───── reward granting (mirrors gift_code_routes.py's helper) ─────────────
async def _grant_reward(db: AsyncIOMotorDatabase, studio_id: str, kind: str, value: int,
                        *, source: str, source_ref: str) -> Dict[str, Any]:
    reward: Dict[str, Any] = {
        "id": f"rwd_{uuid.uuid4().hex[:14]}",
        "studio_id": studio_id,
        "kind": kind,
        "value": int(value),
        "source": source,
        "source_ref": source_ref,
        "status": "active",
        "created_at": _now(),
        "consumed_at": None,
        "expires_at": None,
    }
    if kind == "storage_gb":
        await db.storage_addons.insert_one({
            "id": f"sa_{uuid.uuid4().hex[:12]}", "studio_id": studio_id, "gb": int(value),
            "active": True, "order_id": reward["id"], "created_at": _now(),
        })
    elif kind == "discount_inr":
        code = None
        for _ in range(8):
            cand = "RWD" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
            if not await db.discount_codes.find_one({"code": cand}):
                code = cand
                break
        if code:
            await db.discount_codes.insert_one({
                "id": uuid.uuid4().hex, "code": code, "kind": "flat", "value": int(value),
                "applies_to": "all", "target_id": None, "max_uses": 1, "used_count": 0,
                "expires_at": None, "is_active": True, "created_by": studio_id, "created_at": _now(),
            })
            reward["grant_ref"] = code
        else:
            logger.warning("photographer_referrals: could not allocate a discount code for %s", studio_id)
    await db.studio_rewards.insert_one(reward)
    return reward


class _RedeemReferral(BaseModel):
    code: str = Field(..., min_length=4, max_length=20)

    @field_validator("code")
    @classmethod
    def _norm(cls, v):
        return v.strip().upper()


class _PatchReferral(BaseModel):
    redeemer_reward_kind: Optional[str] = None
    redeemer_reward_value: Optional[int] = Field(None, gt=0)
    owner_reward_kind: Optional[str] = None
    owner_reward_value: Optional[int] = Field(None, gt=0)
    per_account_limit: Optional[int] = Field(None, ge=1, le=10)
    is_active: Optional[bool] = None

    @field_validator("redeemer_reward_kind", "owner_reward_kind")
    @classmethod
    def _valid_kind(cls, v):
        if v is not None and v not in _REWARD_KINDS:
            raise ValueError(f"reward kind must be one of {_REWARD_KINDS}")
        return v


def _doc_to_response(doc: Dict[str, Any]) -> Dict[str, Any]:
    if not doc:
        return doc
    return {k: v for k, v in doc.items() if k != "_id"}


async def _ensure_referral_for(
    db: AsyncIOMotorDatabase, admin_id: str
) -> Dict[str, Any]:
    """Idempotent fetch-or-create for the caller's referral code."""
    existing = await db.photographer_referrals.find_one({"owner_admin_id": admin_id})
    if existing:
        return existing
    # Allocate a unique code
    code = None
    for _ in range(10):
        cand = _generate_code()
        if not await db.photographer_referrals.find_one({"code": cand}):
            code = cand
            break
    if not code:
        raise HTTPException(status_code=500, detail="Could not allocate a referral code")
    doc = {
        "code": code,
        "owner_admin_id": admin_id,
        "redeemer_reward_kind": DEFAULT_REWARD_KIND,
        "redeemer_reward_value": DEFAULT_REWARD_VALUE,
        "owner_reward_kind": DEFAULT_REWARD_KIND,
        "owner_reward_value": DEFAULT_REWARD_VALUE,
        "per_account_limit": DEFAULT_PER_ACCOUNT_LIMIT,
        "redeemed_count":  0,
        "is_active":       True,
        "created_at":      _now(),
        "last_redeemed_at": None,
    }
    await db.photographer_referrals.insert_one(doc)
    return doc


def build_photographer_referral_router(
    db: AsyncIOMotorDatabase,
    require_super_admin,
    get_current_admin,
) -> APIRouter:
    router = APIRouter(tags=["photographer-referrals"])

    # ─── Self-service: my code ───────────────────────────────────────────
    @router.get("/api/account/referral-code")
    async def my_referral(actor=Depends(get_current_admin)):
        admin_id = _actor_id(actor)
        if not admin_id:
            raise HTTPException(status_code=401, detail="Not authenticated")
        doc = await _ensure_referral_for(db, admin_id)
        return _doc_to_response(doc)

    @router.post("/api/account/referral-code/regenerate")
    async def regenerate_my_referral(actor=Depends(get_current_admin)):
        admin_id = _actor_id(actor)
        if not admin_id:
            raise HTTPException(status_code=401, detail="Not authenticated")
        # Allocate a new unique code and replace
        new_code = None
        for _ in range(10):
            cand = _generate_code()
            if not await db.photographer_referrals.find_one({"code": cand}):
                new_code = cand
                break
        if not new_code:
            raise HTTPException(status_code=500, detail="Could not allocate a code")
        await db.photographer_referrals.update_one(
            {"owner_admin_id": admin_id},
            {"$set": {"code": new_code, "regenerated_at": _now()}},
            upsert=True,
        )
        # If no existing row, ensure full doc exists
        doc = await _ensure_referral_for(db, admin_id)
        return _doc_to_response(doc)

    # ─── Self-service: redeem someone else's ─────────────────────────────
    @router.post("/api/account/redeem-referral")
    async def redeem_referral(req: _RedeemReferral, actor=Depends(get_current_admin)):
        """
        Race-safety mirrors gift_code_routes.redeem_code: the reservation
        row's `id` is a deterministic hash of (code, redeemer_id), so a
        concurrent double-submit collides on the primary key and loses
        before any reward is granted.
        """
        redeemer_id = _actor_id(actor)
        if not redeemer_id:
            raise HTTPException(status_code=401, detail="Not authenticated")

        ref = await db.photographer_referrals.find_one({"code": req.code})
        if not ref:
            raise HTTPException(status_code=404, detail="Invalid referral code")
        if not ref.get("is_active", True):
            raise HTTPException(status_code=400, detail="This referral code has been disabled")
        if ref["owner_admin_id"] == redeemer_id:
            raise HTTPException(status_code=400, detail="You cannot redeem your own code")

        per = int(ref.get("per_account_limit") or 1)
        already = await db.referral_redemptions.count_documents(
            {"code": ref["code"], "redeemer_id": redeemer_id}
        )
        if already >= per:
            raise HTTPException(status_code=400, detail="You have already redeemed this code")

        redemption_id = hashlib.sha256(f"{ref['code']}:{redeemer_id}".encode()).hexdigest()[:24]
        try:
            await db.referral_redemptions.insert_one({
                "id": redemption_id, "code": ref["code"], "owner_admin_id": ref["owner_admin_id"],
                "redeemer_id": redeemer_id, "reserved_at": _now(),
            })
        except Exception as e:
            if type(e).__name__ != "UniqueViolationError":
                raise
            raise HTTPException(status_code=400, detail="You have already redeemed this code")

        redeemer_kind = ref.get("redeemer_reward_kind") or DEFAULT_REWARD_KIND
        redeemer_value = int(ref.get("redeemer_reward_value") or 0)
        owner_kind = ref.get("owner_reward_kind") or DEFAULT_REWARD_KIND
        owner_value = int(ref.get("owner_reward_value") or 0)

        redeemer_reward = None
        if redeemer_value > 0:
            redeemer_reward = await _grant_reward(
                db, redeemer_id, redeemer_kind, redeemer_value,
                source="referral", source_ref=ref["code"],
            )

        # Owner-side grant is best-effort: a missing/invalid owner account
        # must not undo the redeemer's already-granted reward.
        owner_reward = None
        if owner_value > 0:
            try:
                owner_reward = await _grant_reward(
                    db, ref["owner_admin_id"], owner_kind, owner_value,
                    source="referral", source_ref=ref["code"],
                )
            except Exception:
                logger.warning("photographer_referrals: owner-side grant failed for %s",
                                ref["owner_admin_id"], exc_info=True)

        await db.photographer_referrals.update_one(
            {"code": ref["code"]},
            {"$inc": {"redeemed_count": 1}, "$set": {"last_redeemed_at": _now()}},
        )
        await db.referral_redemptions.update_one(
            {"id": redemption_id},
            {"$set": {
                "redeemer_reward_id": redeemer_reward["id"] if redeemer_reward else None,
                "owner_reward_id": owner_reward["id"] if owner_reward else None,
                "redeemed_at": _now(),
            }},
        )

        return {
            "success": True,
            "code": ref["code"],
            "reward": redeemer_reward,
            "owner_rewarded": owner_reward is not None,
        }

    # ─── Super-Admin: leaderboard ────────────────────────────────────────
    @router.get("/api/super-admin/referrals")
    async def referral_leaderboard(_: str = Depends(require_super_admin)):
        items: List[Dict[str, Any]] = []
        async for doc in (db.photographer_referrals
                          .find({})
                          .sort("redeemed_count", -1).limit(100)):
            items.append(_doc_to_response(doc))
        return {"items": items, "total": len(items)}

    # ─── Super-Admin: per-photographer detail ────────────────────────────
    @router.get("/api/super-admin/referrals/{admin_id}")
    async def referral_for_admin(admin_id: str, _: str = Depends(require_super_admin)):
        doc = await db.photographer_referrals.find_one({"owner_admin_id": admin_id})
        if not doc:
            raise HTTPException(status_code=404, detail="No referral row")
        out = _doc_to_response(doc)
        # Include recent redemption history
        recent: List[Dict[str, Any]] = []
        async for r in (db.referral_redemptions
                        .find({"code": doc["code"]})
                        .sort("redeemed_at", -1).limit(50)):
            recent.append(_doc_to_response(r))
        out["recent_redemptions"] = recent
        return out

    # ─── Super-Admin: patch rewards / active ─────────────────────────────
    @router.patch("/api/super-admin/referrals/{admin_id}")
    async def patch_referral(admin_id: str, req: _PatchReferral,
                             _: str = Depends(require_super_admin)):
        target = await db.photographer_referrals.find_one({"owner_admin_id": admin_id})
        if not target:
            raise HTTPException(status_code=404, detail="No referral row")
        patch = {k: v for k, v in req.model_dump(exclude_none=True).items()}
        if not patch:
            raise HTTPException(status_code=400, detail="Nothing to update")
        patch["updated_at"] = _now()
        await db.photographer_referrals.update_one(
            {"owner_admin_id": admin_id}, {"$set": patch}
        )
        updated = await db.photographer_referrals.find_one({"owner_admin_id": admin_id})
        return _doc_to_response(updated)

    return router
