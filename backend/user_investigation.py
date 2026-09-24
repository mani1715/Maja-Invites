"""
user_investigation.py — Super-Admin User Investigation Center (Phase 5).

A READ-ONLY 360° view of any account, assembled from data the platform already
keeps (plus a new persisted failed-attempt log). For a support/abuse review:

  identity · devices/browsers · login history · failed logins · OTP failures ·
  IP history (with counts) · payments · subscriptions · reports they filed ·
  moderation actions taken against them.

Sources (all guarded — a missing collection just yields an empty section):
  device_sessions (auth_sessions) · audit_logs (auth.* + admin actions) ·
  login_attempts (NEW — persisted failures) · payment_records / credit_purchases ·
  subscriptions · pixora_reports · admins / users.

Viewing an investigation is itself audit-logged (who looked at whom).

    from user_investigation import build_investigation_router, record_login_attempt
    app.include_router(build_investigation_router(db, require_admin))
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger("investigation")

# Owner keys a payment/subscription row might use to point at a subject.
_OWNER_KEYS = ("admin_id", "user_id", "studio_id", "buyer_id", "subject_id", "owner_id", "profile_id")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(d):
    if isinstance(d, dict):
        d.pop("_id", None)
    return d


async def record_login_attempt(db, identifier: str, ip: str, kind: str,
                               ok: bool, reason: Optional[str] = None) -> None:
    """Persist a login/OTP attempt (called from the auth handlers on FAILURE).

    Fire-and-forget + guarded: recording an attempt must never break a login."""
    try:
        await db.login_attempts.insert_one({
            "id": uuid.uuid4().hex,
            "identifier": (identifier or "").strip().lower(),
            "ip": ip or "unknown",
            "kind": kind,               # "user" | "admin" | "otp"
            "ok": bool(ok),
            "reason": (reason or "")[:120],
            "created_at": _now_iso(),
        })
    except Exception as e:
        logger.warning("[investigation] record_login_attempt failed: %s", e)


async def _load_subject(db, kind: str, subject_id: str) -> Optional[Dict[str, Any]]:
    if kind == "photographer" or kind == "admin":
        row = _clean(await db.admins.find_one({"id": subject_id}, {"_id": 0}))
        if row:
            return {"id": row.get("id"), "kind": "photographer",
                    "name": row.get("name") or row.get("studio_name"),
                    "email": row.get("email"), "phone": row.get("phone"),
                    "status": row.get("status", "active"), "role": row.get("role", "admin"),
                    "created_at": row.get("created_at")}
    row = _clean(await db.users.find_one({"user_id": subject_id}, {"_id": 0}))
    if row:
        return {"id": row.get("user_id"), "kind": "user", "name": row.get("name"),
                "email": row.get("email"), "phone": row.get("phone"),
                "status": row.get("status", "active"), "created_at": row.get("created_at")}
    return None


async def search_subjects(db, q: str, limit: int = 20) -> List[Dict[str, Any]]:
    ql = (q or "").strip().lower()
    if not ql:
        return []
    out: List[Dict[str, Any]] = []
    admins = await db.admins.find({}, {"_id": 0}).to_list(100000)
    for a in admins:
        hay = " ".join(str(a.get(k, "")) for k in ("id", "name", "studio_name", "email", "phone")).lower()
        if ql in hay:
            out.append({"id": a.get("id"), "kind": "photographer",
                        "name": a.get("name") or a.get("studio_name"),
                        "email": a.get("email"), "phone": a.get("phone"),
                        "status": a.get("status", "active")})
    users = await db.users.find({}, {"_id": 0}).to_list(100000)
    for u in users:
        hay = " ".join(str(u.get(k, "")) for k in ("user_id", "name", "email", "phone")).lower()
        if ql in hay:
            out.append({"id": u.get("user_id"), "kind": "user", "name": u.get("name"),
                        "email": u.get("email"), "phone": u.get("phone"),
                        "status": u.get("status", "active")})
    return out[:limit]


async def _find_owned(db, coll_name: str, subject_id: str, extra_ids: List[str]) -> List[dict]:
    """Rows in `coll` whose any owner key matches the subject (or its aliases)."""
    ids = {i for i in ([subject_id] + (extra_ids or [])) if i}
    try:
        rows = await getattr(db, coll_name).find({}, {"_id": 0}).to_list(100000)
    except Exception:
        return []
    hit = []
    for r in rows:
        if any(r.get(k) in ids for k in _OWNER_KEYS):
            hit.append(_clean(r))
    hit.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return hit


async def investigate(db, kind: str, subject_id: str) -> Dict[str, Any]:
    subject = await _load_subject(db, kind, subject_id)
    if not subject:
        raise LookupError("Subject not found")
    email = (subject.get("email") or "").lower()
    phone = (subject.get("phone") or "")
    aliases = [subject_id, email, phone]

    # devices / browsers
    devices = await db.device_sessions.find({"subject_id": subject_id}, {"_id": 0}).to_list(500)
    devices = [_clean(d) for d in devices]
    devices.sort(key=lambda d: d.get("last_active", ""), reverse=True)

    # login history (auth.* audit)
    audit = await db.audit_logs.find({"actor_id": subject_id}, {"_id": 0}).to_list(2000)
    audit = [_clean(a) for a in audit]
    login_history = [a for a in audit if str(a.get("action", "")).startswith("auth.")]
    login_history.sort(key=lambda a: a.get("created_at", ""), reverse=True)

    # failed logins + OTP failures (persisted)
    attempts_all = await db.login_attempts.find({}, {"_id": 0}).to_list(5000)
    ident_set = {x for x in [email, phone, subject_id] if x}
    failed = [_clean(a) for a in attempts_all
              if (a.get("identifier") in ident_set or a.get("ip") in ident_set) and not a.get("ok")]
    failed.sort(key=lambda a: a.get("created_at", ""), reverse=True)
    otp_failures = [a for a in failed if a.get("kind") == "otp"]

    # IP history — merge device + login-audit + attempt IPs with counts
    ip_counts: Dict[str, Dict[str, Any]] = {}
    for src in (devices, login_history, failed):
        for r in src:
            ip = r.get("ip")
            if not ip:
                continue
            e = ip_counts.setdefault(ip, {"ip": ip, "count": 0, "last_seen": ""})
            e["count"] += 1
            ts = r.get("last_active") or r.get("created_at") or ""
            if ts > e["last_seen"]:
                e["last_seen"] = ts
    ip_history = sorted(ip_counts.values(), key=lambda e: e["last_seen"], reverse=True)

    # payments / subscriptions / reports / moderation
    payments = await _find_owned(db, "payment_records", subject_id, aliases)
    if not payments:
        payments = await _find_owned(db, "credit_purchases", subject_id, aliases)
    subscriptions = await _find_owned(db, "subscriptions", subject_id, aliases)
    reports_filed = [_clean(r) for r in
                     await db.pixora_reports.find({"reporter": subject_id}, {"_id": 0}).to_list(500)]
    moderation_actions = [a for a in
                          [_clean(x) for x in await db.audit_logs.find({"target": subject_id}, {"_id": 0}).to_list(500)]]
    moderation_actions.sort(key=lambda a: a.get("created_at", ""), reverse=True)

    return {
        "subject": subject,
        "counts": {
            "devices": len(devices), "logins": len(login_history), "failed_logins": len(failed),
            "otp_failures": len(otp_failures), "unique_ips": len(ip_history),
            "payments": len(payments), "subscriptions": len(subscriptions),
            "reports_filed": len(reports_filed), "moderation_actions": len(moderation_actions),
        },
        "devices": devices[:100],
        "login_history": login_history[:100],
        "failed_logins": failed[:100],
        "otp_failures": otp_failures[:100],
        "ip_history": ip_history[:100],
        "payments": payments[:100],
        "subscriptions": subscriptions[:100],
        "reports_filed": reports_filed[:100],
        "moderation_actions": moderation_actions[:100],
    }


def build_investigation_router(db, require_admin) -> APIRouter:
    router = APIRouter(tags=["investigation"])

    @router.get("/api/admin/investigation/search")
    async def search(q: str = "", limit: int = 20, admin=Depends(require_admin)):
        return {"results": await search_subjects(db, q, limit)}

    @router.get("/api/admin/investigation/subject/{kind}/{subject_id}")
    async def subject(kind: str, subject_id: str, admin=Depends(require_admin)):
        aid = admin.get("admin_id") if isinstance(admin, dict) else admin
        try:
            report = await investigate(db, kind, subject_id)
        except LookupError:
            raise HTTPException(404, "Subject not found")
        # Looking at someone's full history is sensitive — audit who looked at whom.
        try:
            await db.audit_logs.insert_one({
                "id": uuid.uuid4().hex, "actor_id": aid,
                "action": "admin.investigation_view", "target": subject_id,
                "created_at": _now_iso()})
        except Exception:
            pass
        return report

    return router
