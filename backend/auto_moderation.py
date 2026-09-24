"""
auto_moderation.py — automatic content screening (Phase 9).

Feeds the EXISTING moderation queue (`pixora_reports`) — auto-flagged items land
next to user reports and are resolved with the same admin tools. Two layers:

  1. Text heuristic (WORKS TODAY, no infra): spam signals (links/phones/"buy now",
     shouting, repetition) + an abuse/inappropriate word list → a score + reasons
     drawn from the platform's REPORT_REASONS vocabulary.
  2. Image check (UPGRADE): `screen_image()` calls AWS Rekognition
     detect_moderation_labels when AWS is configured; degrades to "not_available"
     otherwise. No fake results — an unconfigured provider simply doesn't add image
     findings.

Auto-reports are deduped (one open auto-report per target) and attributed to
`system:automod`, so they're distinguishable from human reports and auditable.

    from auto_moderation import build_auto_moderation_router
    app.include_router(build_auto_moderation_router(db, require_admin))
"""
from __future__ import annotations

import re
import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple, Optional

from fastapi import APIRouter, Depends

logger = logging.getLogger("automod")

# Reasons must be a subset of pixora_service.REPORT_REASONS.
SPAM_THRESHOLD = 3

_URL = re.compile(r"https?://|www\.\S+|\b\S+\.(?:com|net|in|io|xyz|shop)\b", re.I)
_PHONE = re.compile(r"(?:\+?\d[\d\s-]{7,}\d)")
_SPAM_PHRASES = re.compile(
    r"\b(buy now|click here|free money|work from home|earn \$|whatsapp me|dm me|"
    r"limited offer|100% free|guaranteed|subscribe|promo code|crypto|forex|"
    r"followers|cheap|discount code)\b", re.I)
# A modest, tunable abuse/inappropriate token set (not exhaustive — meant to be
# extended by the owner). Kept generic on purpose.
_ABUSE = re.compile(r"\b(idiot|stupid|scam|fraud|cheat|hate you|kill|nude|nsfw|xxx|porn)\b", re.I)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def screen_text(text: str) -> Tuple[bool, List[str], int, Dict[str, Any]]:
    """Return (flagged, reasons, score, signals). Deterministic, no network."""
    t = (text or "").strip()
    if not t:
        return False, [], 0, {}
    signals: Dict[str, Any] = {}
    score = 0
    reasons: List[str] = []

    links = len(_URL.findall(t))
    phones = len(_PHONE.findall(t))
    spam_hits = len(_SPAM_PHRASES.findall(t))
    if links:
        score += links; signals["links"] = links
    if phones:
        score += phones; signals["phones"] = phones
    if spam_hits:
        score += 2 * spam_hits; signals["spam_phrases"] = spam_hits
    # SHOUTING: mostly-caps long text
    letters = [c for c in t if c.isalpha()]
    if len(letters) >= 12 and sum(1 for c in letters if c.isupper()) / len(letters) > 0.7:
        score += 1; signals["shouting"] = True
    # repetition: same token many times
    words = re.findall(r"\w+", t.lower())
    if words:
        top = max((words.count(w) for w in set(words)), default=0)
        if top >= 6:
            score += 1; signals["repetition"] = top
    if score >= SPAM_THRESHOLD:
        reasons.append("spam")

    abuse_hits = len(_ABUSE.findall(t))
    if abuse_hits:
        signals["abuse_terms"] = abuse_hits
        reasons.append("inappropriate" if re.search(r"nude|nsfw|xxx|porn", t, re.I) else "abuse")
        score += 3 * abuse_hits

    return (len(reasons) > 0), reasons, score, signals


def screen_image(image_url_or_bytes) -> Dict[str, Any]:
    """AWS Rekognition moderation when configured; else a clean 'not_available'."""
    try:
        import aws_service
        if not aws_service.is_configured():
            return {"available": False, "reason": "aws_not_configured"}
        client = aws_service.rekognition()
        if isinstance(image_url_or_bytes, (bytes, bytearray)):
            resp = client.detect_moderation_labels(Image={"Bytes": bytes(image_url_or_bytes)}, MinConfidence=70)
        else:
            # An S3 key was passed.
            resp = client.detect_moderation_labels(
                Image={"S3Object": {"Bucket": aws_service.bucket(), "Name": str(image_url_or_bytes)}},
                MinConfidence=70)
        labels = [{"name": l["Name"], "confidence": round(l["Confidence"], 1)}
                  for l in resp.get("ModerationLabels", [])]
        return {"available": True, "flagged": bool(labels), "labels": labels}
    except Exception as e:
        return {"available": False, "reason": str(e)[:120]}


async def auto_report(db, target_type: str, target_id: str, text: str,
                      owner_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Screen `text`; if flagged, create (deduped) an auto pixora_reports row."""
    flagged, reasons, score, signals = screen_text(text)
    if not flagged:
        return None
    existing = await db.pixora_reports.find_one(
        {"reporter": "system:automod", "target_type": target_type,
         "target_id": target_id, "status": "open"}, {"_id": 0})
    if existing:
        return None
    doc = {
        "id": f"rpt_{uuid.uuid4().hex[:12]}",
        "reporter": "system:automod",
        "reporter_name": "Auto-moderation",
        "target_type": target_type,
        "target_id": target_id,
        "owner_id": owner_id,
        "reason": reasons[0],
        "note": f"auto-flagged (score {score}): {', '.join(f'{k}={v}' for k, v in signals.items())}",
        "auto": True,
        "score": score,
        "status": "open",
        "created_at": _now_iso(),
    }
    await db.pixora_reports.insert_one(dict(doc))
    return doc


async def rescreen_recent(db, limit: int = 500) -> Dict[str, Any]:
    """Sweep recent community content and auto-flag hits into the report queue."""
    scanned = flagged = 0
    plan = [
        ("post", "pixora_posts", ("title", "body")),
        ("reel", "pixora_reels", ("caption", "title")),
        ("comment", "pixora_comments", ("text", "body")),
        ("story", "pixora_stories", ("caption", "text")),
    ]
    for target_type, coll, fields in plan:
        try:
            rows = await getattr(db, coll).find({}, {"_id": 0}).to_list(limit)
        except Exception:
            rows = []
        for r in rows:
            scanned += 1
            text = " ".join(str(r.get(f, "")) for f in fields)
            res = await auto_report(db, target_type, r.get("id"), text,
                                    owner_id=r.get("studio_id") or r.get("author_id"))
            if res:
                flagged += 1
    # heartbeat for the System-Health dashboard
    try:
        from system_health import record_job_run
        await record_job_run(db, "auto_moderation_sweep", {"scanned": scanned, "flagged": flagged})
    except Exception:
        pass
    return {"scanned": scanned, "flagged": flagged, "ran_at": _now_iso()}


def build_auto_moderation_router(db, require_admin) -> APIRouter:
    router = APIRouter(tags=["auto-moderation"])

    @router.get("/api/admin/moderation/auto/status")
    async def status(admin=Depends(require_admin)):
        image = screen_image("__probe__")   # just to report availability
        open_auto = await db.pixora_reports.find(
            {"reporter": "system:automod", "status": "open"}, {"_id": 0}).to_list(1000)
        return {"text_screening": "active", "spam_threshold": SPAM_THRESHOLD,
                "image_screening": "active" if image.get("available") else "not_configured",
                "open_auto_reports": len(open_auto)}

    @router.post("/api/admin/moderation/auto/rescreen")
    async def rescreen(limit: int = 500, admin=Depends(require_admin)):
        return await rescreen_recent(db, limit=max(1, min(5000, int(limit or 500))))

    return router
