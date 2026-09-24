"""
providers_admin.py — Provider management (read-only) (Phase 15).

Shows which external providers are CONFIGURED (by env-var presence — never the
secret values) and their live health (reused from system_health probes). Secret
rotation itself stays a console action (SECURITY_RUNBOOK.md); this page tells you
what's wired and what's missing, so misconfiguration is visible.

    from providers_admin import build_providers_router
    app.include_router(build_providers_router(db, require_admin))
"""
from __future__ import annotations

import os
import logging
from typing import Dict, Any, List

from fastapi import APIRouter, Depends

logger = logging.getLogger("providers")

# provider -> the env vars that configure it (ANY present ⇒ configured, unless all_required)
_PROVIDERS = [
    {"key": "email_resend", "label": "Email — Resend", "any": ["RESEND_API_KEY"]},
    {"key": "email_smtp", "label": "Email — SMTP", "all": ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"]},
    {"key": "sms_msg91", "label": "SMS — MSG91", "any": ["MSG91_AUTH_KEY", "MSG91_AUTHKEY"]},
    {"key": "sms_twilio", "label": "SMS — Twilio", "all": ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]},
    {"key": "aws", "label": "AWS (S3 / Rekognition / CloudFront)", "all": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]},
    {"key": "razorpay", "label": "Payments — Razorpay", "all": ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]},
    {"key": "razorpay_webhook", "label": "Razorpay webhook secret", "any": ["RAZORPAY_WEBHOOK_SECRET"]},
    {"key": "delivery_webhook", "label": "Delivery webhook secret", "any": ["DELIVERY_WEBHOOK_SECRET"]},
    {"key": "supabase", "label": "Supabase auth", "any": ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]},
    {"key": "gemini", "label": "Gemini AI", "any": ["GEMINI_API_KEY"]},
    {"key": "sentry", "label": "Sentry error tracking", "any": ["SENTRY_DSN"]},
    {"key": "redis", "label": "Redis (shared rate-limit/cache)", "any": ["REDIS_URL"]},
]


def _is_set(name: str) -> bool:
    return bool((os.environ.get(name) or "").strip())


def _provider_configured(p: Dict[str, Any]) -> bool:
    if "all" in p:
        return all(_is_set(v) for v in p["all"])
    return any(_is_set(v) for v in p.get("any", []))


async def compute_providers(db) -> Dict[str, Any]:
    # Reuse the live probes from system_health where they exist.
    health_by_key: Dict[str, str] = {}
    try:
        from system_health import gather_health
        h = await gather_health(db)
        for c in h.get("components", []):
            health_by_key[c["key"]] = c["status"]
    except Exception:
        pass

    def _health_for(key: str) -> str:
        if key.startswith("email"):
            return health_by_key.get("email", "unknown")
        if key.startswith("sms"):
            return health_by_key.get("sms", "unknown")
        if key == "aws":
            return health_by_key.get("storage_s3", "unknown")
        return "n/a"

    items: List[Dict[str, Any]] = []
    for p in _PROVIDERS:
        configured = _provider_configured(p)
        items.append({
            "key": p["key"], "label": p["label"],
            "configured": configured,
            "env_vars": p.get("all") or p.get("any") or [],
            "health": _health_for(p["key"]) if configured else "not_configured",
        })
    return {
        "providers": items,
        "configured_count": sum(1 for i in items if i["configured"]),
        "total": len(items),
        "note": "Secret VALUES are never shown. Rotate secrets via the console (SECURITY_RUNBOOK.md).",
    }


def build_providers_router(db, require_admin) -> APIRouter:
    router = APIRouter(tags=["providers"])

    @router.get("/api/admin/providers")
    async def providers(admin=Depends(require_admin)):
        return await compute_providers(db)

    return router
