"""
Gift Code (Redemption Code) system.

Super Admin generates short alphanumeric codes (e.g. `LOVE26`) that grant a
reward when redeemed by a signed-in photographer/studio. Useful for early-
access marketing, conference giveaways, partnership perks.

Credits were permanently deleted from this platform, so a gift code no
longer mints credits — it grants one of the reward kinds in
`studio_rewards` (shared with `photographer_referrals.py`):
    storage_gb    — extra storage, applied immediately via the SAME
                    `storage_addons` collection `monetization_service.
                    storage_bonus_bytes()` already reads (no new plumbing).
    discount_inr  — a flat-INR-off code minted into the EXISTING
                    `discount_codes` collection (`pricing_features.py`),
                    single-use, so it works with `/api/public/discount/
                    validate` as-is.

Collection: `gift_codes`
Schema:
    code:             str   (primary, uppercased, 4–16 chars)
    reward_kind:      "storage_gb" | "discount_inr"
    reward_value:     int   > 0  (GB, or INR)
    description:      str   short marketing note ("Conference 2026")
    max_redemptions:  int|None  None = unlimited
    redeemed_count:   int   default 0
    per_account_limit:int   how many times one admin_id can redeem (default 1)
    expires_at:       isoformat str | None
    is_active:        bool  default True
    created_by:       super_admin id
    created_at:       iso str
    metadata:         dict  optional

Collection: `gift_code_redemptions` (append-only audit log)
Schema:
    id (deterministic hash of code+admin_id, the atomic double-submit guard),
    code, admin_id, reward_id, reserved_at, redeemed_at

Collection: `studio_rewards` — see `photographer_referrals.py` for the full
schema; both files grant into it.

Endpoints
    Super Admin:
      POST   /api/super-admin/gift-codes              — create
      GET    /api/super-admin/gift-codes              — list (newest first)
      PATCH  /api/super-admin/gift-codes/{code}       — toggle active, edit reward/expiry
      DELETE /api/super-admin/gift-codes/{code}       — soft-delete (is_active=False)
      GET    /api/super-admin/gift-codes/{code}/redemptions

    Self-service (photographer/studio):
      POST   /api/account/redeem-code   { code: "LOVE26" }
      GET    /api/account/rewards       — read-only ledger of everything granted
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

logger = logging.getLogger("gift_codes")


_CODE_ALPHABET = string.ascii_uppercase + string.digits
_CODE_DEFAULT_LEN = 6
_REWARD_KINDS = ("storage_gb", "discount_inr")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _generate_code(length: int = _CODE_DEFAULT_LEN) -> str:
    """Generate a random uppercased alphanumeric code."""
    return "".join(random.choices(_CODE_ALPHABET, k=length))


def _actor_id(actor) -> str:
    if isinstance(actor, dict):
        return actor.get("id") or actor.get("admin_id") or ""
    return actor or ""


# ───── reward granting (shared shape with photographer_referrals.py) ──────
async def _grant_reward(db: AsyncIOMotorDatabase, studio_id: str, kind: str, value: int,
                        *, source: str, source_ref: str) -> Dict[str, Any]:
    """Grant one reward and make it take effect through EXISTING machinery:
      * storage_gb   -> a `storage_addons` row (monetization_service.storage_bonus_bytes
                        already sums these into the studio's storage cap).
      * discount_inr -> a single-use `discount_codes` row (pricing_features.py's
                        own collection), so `/api/public/discount/validate`
                        already knows how to spend it — no checkout code needed.
    `studio_rewards` is the audit ledger read by GET /api/account/rewards.
    """
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
            cand = "RWD" + _generate_code()
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
            logger.warning("gift_codes: could not allocate a discount code for reward to %s", studio_id)
    await db.studio_rewards.insert_one(reward)
    return reward


# ───── request models ─────────────────────────────────────────────────────
class _CreateGiftCodeReq(BaseModel):
    code: Optional[str] = Field(None, min_length=4, max_length=16,
                                description="Optional custom code; auto-generated if omitted")
    reward_kind: str = Field(..., description="'storage_gb' or 'discount_inr'")
    reward_value: int = Field(..., gt=0, description="GB for storage_gb, rupees for discount_inr")
    description: str = Field("", max_length=200)
    max_redemptions: Optional[int] = Field(None, ge=1,
                                           description="None = unlimited")
    per_account_limit: int = Field(1, ge=1, le=10,
                                   description="How many times one account can redeem")
    expires_at: Optional[str] = Field(None,
                                      description="ISO-8601 UTC; None = no expiry")
    metadata: Optional[Dict[str, Any]] = None

    @field_validator("code")
    @classmethod
    def _normalize_code(cls, v):
        if v is None:
            return v
        v = v.strip().upper()
        if not v.isalnum():
            raise ValueError("Code must be alphanumeric (A–Z, 0–9)")
        return v

    @field_validator("reward_kind")
    @classmethod
    def _valid_kind(cls, v):
        if v not in _REWARD_KINDS:
            raise ValueError(f"reward_kind must be one of {_REWARD_KINDS}")
        return v


class _UpdateGiftCodeReq(BaseModel):
    reward_kind: Optional[str] = None
    reward_value: Optional[int] = Field(None, gt=0)
    description: Optional[str] = Field(None, max_length=200)
    max_redemptions: Optional[int] = Field(None, ge=1)
    per_account_limit: Optional[int] = Field(None, ge=1, le=10)
    expires_at: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("reward_kind")
    @classmethod
    def _valid_kind(cls, v):
        if v is not None and v not in _REWARD_KINDS:
            raise ValueError(f"reward_kind must be one of {_REWARD_KINDS}")
        return v


class _RedeemReq(BaseModel):
    code: str = Field(..., min_length=4, max_length=16)

    @field_validator("code")
    @classmethod
    def _normalize_code(cls, v):
        return v.strip().upper()


# ───── helpers ────────────────────────────────────────────────────────────
def _doc_to_response(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Strip mongo `_id` and convert internals."""
    if not doc:
        return doc
    out = {k: v for k, v in doc.items() if k != "_id"}
    return out


async def _validate_code_for_redemption(
    db: AsyncIOMotorDatabase, code: str, admin_id: str
) -> Dict[str, Any]:
    """Return the gift-code document if redeemable for this account; raise
    HTTPException otherwise."""
    doc = await db.gift_codes.find_one({"code": code})
    if not doc:
        raise HTTPException(status_code=404, detail="Invalid code")
    if not doc.get("is_active", True):
        raise HTTPException(status_code=400, detail="This code has been disabled")
    expires_at = doc.get("expires_at")
    if expires_at:
        try:
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if exp < datetime.now(timezone.utc):
                raise HTTPException(status_code=400, detail="This code has expired")
        except ValueError:
            pass  # malformed expiry -- treat as no-expiry rather than failing the user
    max_red = doc.get("max_redemptions")
    if max_red is not None and doc.get("redeemed_count", 0) >= max_red:
        raise HTTPException(status_code=400, detail="This code has reached its redemption limit")
    per = int(doc.get("per_account_limit") or 1)
    used = await db.gift_code_redemptions.count_documents({"code": code, "admin_id": admin_id})
    if used >= per:
        raise HTTPException(status_code=400, detail="You have already redeemed this code")
    return doc


# ───── router builder ─────────────────────────────────────────────────────
def build_gift_code_router(
    db: AsyncIOMotorDatabase,
    require_super_admin,         # FastAPI dep
    get_current_admin,           # FastAPI dep — string admin_id or dict
) -> APIRouter:
    router = APIRouter(tags=["gift-codes"])

    # ─── Super-Admin: create ─────────────────────────────────────────────
    @router.post("/api/super-admin/gift-codes")
    async def create_gift_code(req: _CreateGiftCodeReq,
                               super_admin_id: str = Depends(require_super_admin)):
        # Allocate a unique code (auto-generate if not provided)
        code = req.code
        if not code:
            for _ in range(8):
                cand = _generate_code()
                if not await db.gift_codes.find_one({"code": cand}):
                    code = cand
                    break
            if not code:
                raise HTTPException(status_code=500, detail="Could not allocate a unique code; retry")
        else:
            if await db.gift_codes.find_one({"code": code}):
                raise HTTPException(status_code=409, detail="A code with this value already exists")

        doc = {
            "code": code,
            "reward_kind": req.reward_kind,
            "reward_value": req.reward_value,
            "description": req.description,
            "max_redemptions": req.max_redemptions,
            "per_account_limit": req.per_account_limit,
            "expires_at": req.expires_at,
            "is_active": True,
            "redeemed_count": 0,
            "created_by": super_admin_id,
            "created_at": _now(),
            "metadata": req.metadata or {},
        }
        await db.gift_codes.insert_one(doc)
        return _doc_to_response(doc)

    # ─── Super-Admin: list ───────────────────────────────────────────────
    @router.get("/api/super-admin/gift-codes")
    async def list_gift_codes(_: str = Depends(require_super_admin)):
        items: List[Dict[str, Any]] = []
        async for doc in db.gift_codes.find({}).sort("created_at", -1).limit(500):
            items.append(_doc_to_response(doc))
        return {"items": items, "total": len(items)}

    # ─── Super-Admin: update ─────────────────────────────────────────────
    @router.patch("/api/super-admin/gift-codes/{code}")
    async def update_gift_code(code: str, req: _UpdateGiftCodeReq,
                               _: str = Depends(require_super_admin)):
        code = code.strip().upper()
        target = await db.gift_codes.find_one({"code": code})
        if not target:
            raise HTTPException(status_code=404, detail="Code not found")
        patch = {k: v for k, v in req.model_dump(exclude_none=True).items()}
        if not patch:
            raise HTTPException(status_code=400, detail="Nothing to update")
        patch["updated_at"] = _now()
        await db.gift_codes.update_one({"code": code}, {"$set": patch})
        updated = await db.gift_codes.find_one({"code": code})
        return _doc_to_response(updated)

    # ─── Super-Admin: deactivate (soft delete) ───────────────────────────
    @router.delete("/api/super-admin/gift-codes/{code}")
    async def deactivate_gift_code(code: str,
                                   _: str = Depends(require_super_admin)):
        code = code.strip().upper()
        res = await db.gift_codes.update_one(
            {"code": code},
            {"$set": {"is_active": False, "deactivated_at": _now()}},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Code not found")
        return {"deactivated": True, "code": code}

    # ─── Super-Admin: list per-code redemptions ──────────────────────────
    @router.get("/api/super-admin/gift-codes/{code}/redemptions")
    async def list_redemptions(code: str,
                               _: str = Depends(require_super_admin)):
        code = code.strip().upper()
        items: List[Dict[str, Any]] = []
        async for doc in (db.gift_code_redemptions
                          .find({"code": code})
                          .sort("redeemed_at", -1).limit(500)):
            items.append(_doc_to_response(doc))
        return {"items": items, "total": len(items)}

    # ─── Self-service: redeem ────────────────────────────────────────────
    @router.post("/api/account/redeem-code")
    async def redeem_code(req: _RedeemReq, actor=Depends(get_current_admin)):
        """
        Redeem a gift code with atomic per-account limit enforcement.

        Race-safety: the redemption row's `id` is a deterministic hash of
        (code, admin_id) — a concurrent double-submit collides on the
        primary key and the loser gets a clean 409, before any reward is
        granted (the grant itself is not reachable until the reservation
        insert has already succeeded).
        """
        admin_id = _actor_id(actor)
        if not admin_id:
            raise HTTPException(status_code=401, detail="Not authenticated")

        gift = await _validate_code_for_redemption(db, req.code, admin_id)

        redemption_id = hashlib.sha256(f"{gift['code']}:{admin_id}".encode()).hexdigest()[:24]
        try:
            await db.gift_code_redemptions.insert_one({
                "id": redemption_id, "code": gift["code"], "admin_id": admin_id,
                "reserved_at": _now(),
            })
        except Exception as e:
            if type(e).__name__ != "UniqueViolationError":
                raise
            raise HTTPException(status_code=400, detail="You have already redeemed this code")

        reward = await _grant_reward(
            db, admin_id, gift["reward_kind"], gift["reward_value"],
            source="gift_code", source_ref=gift["code"],
        )

        await db.gift_code_redemptions.update_one(
            {"id": redemption_id},
            {"$set": {"reward_id": reward["id"], "redeemed_at": _now()}},
        )
        await db.gift_codes.update_one({"code": gift["code"]}, {"$inc": {"redeemed_count": 1}})

        return {"success": True, "code": gift["code"], "reward": reward}

    # ─── Self-service: read-only reward ledger ───────────────────────────
    @router.get("/api/account/rewards")
    async def my_rewards(actor=Depends(get_current_admin)):
        admin_id = _actor_id(actor)
        if not admin_id:
            raise HTTPException(status_code=401, detail="Not authenticated")
        items: List[Dict[str, Any]] = []
        async for r in db.studio_rewards.find({"studio_id": admin_id}).sort("created_at", -1).limit(200):
            r = _doc_to_response(r)
            if r.get("kind") == "discount_inr" and r.get("grant_ref"):
                code_doc = await db.discount_codes.find_one({"code": r["grant_ref"]})
                if code_doc:
                    used_up = int(code_doc.get("used_count") or 0) >= int(code_doc.get("max_uses") or 1)
                    r["status"] = "consumed" if used_up else "active"
                    r["discount_code"] = code_doc.get("code")
            items.append(r)
        storage_bonus_gb = sum(int(r.get("value") or 0) for r in items if r.get("kind") == "storage_gb")
        return {"items": items, "total": len(items), "storage_bonus_gb": storage_bonus_gb}

    return router
