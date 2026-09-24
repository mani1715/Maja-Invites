"""
Face-recognition consent (DPDP).

Records a guest's explicit opt-in BEFORE any facial data is processed by the
AI face-match gallery, and — as of this revision — is actually enforced:
`has_valid_consent` is checked by gallery_features.public_face_search before
a selfie is run through Rekognition. Consent is scoped to (profile, IP-hash),
valid 90 days, and revocable via the withdraw endpoint below.

Mounted in server.py:
    from face_consent import build_face_consent_router
    app.include_router(build_face_consent_router(db))
"""
import uuid
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from cache_backend import rate_limit_allow, client_ip, kv_del
from aws_service import s3, bucket

logger = logging.getLogger("face_consent")

CONSENT_VALID_DAYS = 90


class FaceConsentPayload(BaseModel):
    agreed: bool
    guest_token: Optional[str] = None  # personalized-link token, if present


def compute_ip_hash(ip: str) -> str:
    """Salted + truncated, same shape as consent_routes._ip_hash: enough to
    correlate a guest's consent with a later face-search request, not to
    identify them from the stored record alone."""
    return hashlib.sha256(f"maja-face-consent::{ip}".encode()).hexdigest()[:32]


async def has_valid_consent(db, profile_id: str, ip_hash: str) -> bool:
    """True if (profile_id, ip_hash) has a non-withdrawn, agreed=True consent
    record from the last 90 days. `agreed`/`withdrawn_at` are checked in
    Python — boolean equality on generated columns mis-binds in pg_adapter."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=CONSENT_VALID_DAYS)).isoformat()
    cursor = db.face_consent.find(
        {"profile_id": profile_id, "ip_hash": ip_hash,
         "created_at": {"$gte": cutoff}}, {"_id": 0}
    ).sort("created_at", -1).limit(20)
    async for rec in cursor:
        if rec.get("agreed") and not rec.get("withdrawn_at"):
            return True
    return False


def build_face_consent_router(db) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["face-consent"])

    @router.post("/public/gallery/{slug}/face-consent")
    async def record_face_consent(slug: str, payload: FaceConsentPayload, request: Request):
        """Record a guest's consent to AI face matching for a gallery. Called
        by the guest face-search modal before a selfie is uploaded — the
        client must collect an explicit opt-in; this persists it for audit
        and is what `has_valid_consent` later checks."""
        # Rate limit this unauthenticated public write (per IP) so it can't be
        # used to flood the DB. 60 consents/hour/IP is far above any real guest.
        ip = client_ip(request)
        if not await rate_limit_allow(f"face_consent:{ip}", limit=60, window_seconds=3600):
            raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

        # Only record consent for a real, existing invitation slug. This keeps an
        # unauthenticated public endpoint from being used to flood the DB with
        # junk rows for arbitrary/non-existent slugs (storage abuse).
        profile = await db.profiles.find_one({"slug": slug}, {"_id": 0, "id": 1})
        if not profile:
            raise HTTPException(status_code=404, detail="Invitation not found")

        doc = {
            "id": uuid.uuid4().hex,
            "slug": slug,
            "profile_id": profile["id"],
            "ip_hash": compute_ip_hash(ip),
            "agreed": bool(payload.agreed),
            "guest_token": payload.guest_token,
            "ip": ip,
            "user_agent": request.headers.get("user-agent", "")[:300],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            await db.face_consent.insert_one(doc)
        except Exception as e:  # never block the guest flow on a logging write
            logger.warning("[face-consent] store failed for %s: %s", slug, e)

        return {"ok": True, "consent_id": doc["id"], "agreed": doc["agreed"]}

    @router.post("/public/gallery/{slug}/face-consent/withdraw")
    async def withdraw_face_consent(slug: str, request: Request):
        """Marks every non-withdrawn consent this IP gave for this gallery as
        withdrawn, then purges this guest's own selfie-derived search
        artifacts for this profile: the selfie in S3, the face_search_sessions
        rows, and the selfie-hash match cache (fm:{profile_id}:{selfie_hash}).
        Scope note (DPDP): indexed faces from the couple's photographer photos
        are NOT the withdrawing guest's data — only artifacts derived from the
        guest's own uploaded selfie are purged here. Public, no auth — the
        guest's IP is the only identity we have for a consent record, same as
        how it was granted."""
        ip = client_ip(request)
        if not await rate_limit_allow(f"face_consent_withdraw:{ip}", limit=60, window_seconds=3600):
            raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

        profile = await db.profiles.find_one({"slug": slug}, {"_id": 0, "id": 1})
        if not profile:
            raise HTTPException(status_code=404, detail="Invitation not found")

        withdrawn_at = datetime.now(timezone.utc).isoformat()
        await db.face_consent.update_many(
            {"profile_id": profile["id"], "ip_hash": compute_ip_hash(ip)},
            {"$set": {"withdrawn_at": withdrawn_at}})

        # Purge this guest's own selfie-derived artifacts. Best-effort: never
        # raises, never blocks the withdrawal response.
        sessions = []
        cursor = db.face_search_sessions.find(
            {"profile_id": profile["id"], "guest_ip": ip}, {"_id": 0})
        async for sess in cursor:
            sessions.append(sess)
        for sess in sessions:
            selfie_key = sess.get("selfie_s3_key")
            if selfie_key:
                # New rows carry their own `selfie_bucket` (the private face
                # bucket); rows written before that migration have none and
                # were stored in the legacy default bucket -- fall back to
                # that so old rows keep cleaning up correctly.
                selfie_bucket = sess.get("selfie_bucket") or bucket()
                try:
                    s3().delete_object(Bucket=selfie_bucket, Key=selfie_key)
                except Exception as e:
                    logger.warning("[face-consent] selfie S3 delete failed for %s: %s", selfie_key, e)
            selfie_hash = sess.get("selfie_hash")
            if selfie_hash:
                try:
                    await kv_del(f"fm:{profile['id']}:{selfie_hash}")
                except Exception as e:
                    logger.warning("[face-consent] match-cache purge failed: %s", e)
        if sessions:
            await db.face_search_sessions.delete_many(
                {"profile_id": profile["id"], "guest_ip": ip})

        return {"ok": True, "withdrawn_at": withdrawn_at, "purged_sessions": len(sessions)}

    return router
