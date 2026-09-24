"""
DPDP data tools for the normal-user identity.

- GET  /api/account/export         → download a JSON copy of the caller's data.
- POST /api/account/delete-request  → anonymize PII + soft-delete the account.

Gated by the normal-user auth dependency (get_current_public_user). Additive;
does not change any existing route. Mounted in server.py after user_auth.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger("account_data")

_SENSITIVE = {"password", "password_hash", "_id", "session_token", "otp", "otp_hash"}


def _clean(doc: dict) -> dict:
    return {k: v for k, v in (doc or {}).items() if k not in _SENSITIVE}


class DeleteRequest(BaseModel):
    confirm: bool = False


def build_account_data_router(db, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/api/account", tags=["account-data"])

    async def _user_profiles(uid: str):
        try:
            cur = db.profiles.find(
                {"$or": [{"user_id": uid}, {"owner_user_id": uid}, {"created_by_user": uid}]},
                {"_id": 0},
            )
            return await cur.to_list(500)
        except Exception:
            return []

    @router.get("/export")
    async def export_my_data(current=Depends(get_current_user)):
        """Return a JSON export of the caller's personal data (DPDP access right)."""
        uid = (current or {}).get("user_id")
        if not uid:
            raise HTTPException(status_code=401, detail="Not authenticated")

        user = await db.users.find_one({"user_id": uid}, {"_id": 0})
        profiles = await _user_profiles(uid)
        profile_ids = [p.get("id") or p.get("slug") for p in profiles]

        async def _collect(coll, field="profile_id"):
            try:
                return await db[coll].find({field: {"$in": profile_ids}}, {"_id": 0}).to_list(2000)
            except Exception:
                return []

        export = {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "account": _clean(user) if user else None,
            "profiles": profiles,
            "rsvps": await _collect("rsvps") if profile_ids else [],
            "wishes": await _collect("wishes") if profile_ids else [],
            "credit_purchases": [],
        }
        try:
            export["credit_purchases"] = await db.credit_purchases.find(
                {"user_id": uid}, {"_id": 0}).to_list(500)
        except Exception:
            pass

        return JSONResponse(
            content=export,
            headers={"Content-Disposition": 'attachment; filename="my-data-export.json"'},
        )

    @router.post("/delete-request")
    async def delete_my_account(payload: DeleteRequest, current=Depends(get_current_user)):
        """Anonymize PII and soft-delete the caller's account (DPDP erasure)."""
        uid = (current or {}).get("user_id")
        if not uid:
            raise HTTPException(status_code=401, detail="Not authenticated")
        if not payload.confirm:
            raise HTTPException(status_code=400, detail="Confirmation required to delete your account")

        now = datetime.now(timezone.utc)
        # Anonymize the user record + mark deleted.
        try:
            await db.users.update_one(
                {"user_id": uid},
                {"$set": {
                    "email": f"deleted+{uid}@deleted.invalid",
                    "name": "Deleted user",
                    "phone": None,
                    "deleted": True,
                    "deleted_at": now,
                }},
            )
        except Exception as e:
            logger.exception("[account] user anonymize failed")
            raise HTTPException(status_code=500, detail="Could not process deletion")

        # Best-effort: revoke sessions + soft-delete the user's invitations.
        try:
            await db.user_sessions.delete_many({"user_id": uid})
        except Exception:
            pass
        try:
            await db.profiles.update_many(
                {"$or": [{"user_id": uid}, {"owner_user_id": uid}, {"created_by_user": uid}]},
                {"$set": {"deleted_at": now, "deleted": True}},
            )
        except Exception:
            pass

        return {"ok": True, "message": "Your account has been deleted and personal data anonymized."}

    return router
