"""
consent_routes.py — cookie / tracking consent (DPDP + ePrivacy proof-of-consent).

The frontend cookie banner posts the visitor's choice here so we keep an
auditable record of WHAT was consented to and WHEN — which India's DPDP Act and
EU ePrivacy both expect you to be able to prove. Consent is captured pre-auth,
so no login is required.

Privacy by design: we store a salted, truncated IP *hash* (enough to correlate
an audit, not to re-identify a person) and a trimmed user-agent — never the raw
IP. Records land in `db.consent_records`.

Wire-up (server.py):
    from consent_routes import build_consent_router
    app.include_router(build_consent_router(db))
"""
from __future__ import annotations
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

logger = logging.getLogger("consent")


class ConsentPayload(BaseModel):
    action: str                          # "accept_all" | "reject_all" | "save"
    analytics: bool = False
    marketing: bool = False
    version: Optional[str] = "1.0"       # policy version the visitor agreed to


def _ip_hash(ip: str) -> str:
    # Salted + truncated: enough to correlate for an audit, not to identify.
    return hashlib.sha256(f"maja-consent::{ip}".encode()).hexdigest()[:32]


def build_consent_router(db) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["consent"])

    @router.post("/public/cookie-consent")
    async def record_cookie_consent(payload: ConsentPayload, request: Request):
        """Persist a visitor's cookie/tracking choice for DPDP proof-of-consent.

        Never blocks the UI: any failure (or an abuser flooding it) still returns
        ok so the banner can dismiss — the source of truth for gating is the
        choice stored in the browser; this endpoint is the audit trail."""
        from cache_backend import rate_limit_allow
        ip = request.client.host if request and request.client else "unknown"
        if not await rate_limit_allow(f"consent:{ip}", limit=30, window_seconds=3600):
            return {"ok": True}
        rec: Dict[str, Any] = {
            "ip_hash": _ip_hash(ip),
            "user_agent": (request.headers.get("user-agent") or "")[:300],
            "action": (payload.action or "save")[:20],
            "categories": {
                "necessary": True,                       # always on — cannot be refused
                "analytics": bool(payload.analytics),
                "marketing": bool(payload.marketing),
            },
            "policy_version": (payload.version or "1.0")[:16],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            await db.consent_records.insert_one(rec)
        except Exception as e:
            logger.warning("[consent] failed to persist consent: %s", e)
        return {"ok": True}

    return router
