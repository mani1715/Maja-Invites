"""
PROMPT 16 — Analytics deep-dive endpoints
- 90-day calendar heatmap
- RSVP funnel
- Geography top cities
- AI insights via Gemini, cached for 24h
"""
from __future__ import annotations

import json
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Callable, Awaitable

from fastapi import APIRouter, Depends, HTTPException


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_analytics_extras_router(db, require_admin, ai_chat_factory: Callable[..., Awaitable[str]]) -> APIRouter:
    router = APIRouter(tags=["analytics-extras"])

    async def _get_profile_owned(profile_id: str, admin_data: dict) -> dict:
        p = await db.profiles.find_one({"$or": [{"id": profile_id}, {"slug": profile_id}]}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Profile not found")
        admin_id = admin_data.get("admin_id") or admin_data.get("id")
        if admin_data.get("role") not in ("super_admin", "superadmin") and p.get("admin_id") and p.get("admin_id") != admin_id:
            raise HTTPException(403, "Not your wedding")
        return p

    # ---------- Heatmap ----------------------------------------------------
    @router.get("/api/admin/profiles/{profile_id}/analytics/heatmap")
    async def heatmap(profile_id: str, days: int = 90, admin_data: dict = Depends(require_admin)):
        profile = await _get_profile_owned(profile_id, admin_data)
        days = max(7, min(days, 365))
        today = datetime.now(timezone.utc).date()

        # Source 1: analytics.daily_views (set by track_view)
        daily_map: dict = {}
        analytics_doc = await db.analytics.find_one({"profile_id": profile["id"]}, {"_id": 0, "daily_views": 1})
        if analytics_doc and isinstance(analytics_doc.get("daily_views"), list):
            for row in analytics_doc["daily_views"]:
                d = row.get("date")
                c = row.get("count") or row.get("views") or 0
                if d:
                    daily_map[d] = daily_map.get(d, 0) + int(c)

        # Source 2: invitation_opens collection (if it exists)
        try:
            cursor = db.invitation_opens.find({"profile_id": profile["id"]}, {"_id": 0, "opened_at": 1, "created_at": 1})
            opens = await cursor.to_list(20000)
            for o in opens:
                ts = o.get("opened_at") or o.get("created_at")
                if not ts:
                    continue
                try:
                    d = ts[:10]
                    daily_map[d] = daily_map.get(d, 0) + 1
                except Exception:
                    continue
        except Exception:
            pass

        # Source 3: view_sessions collection fallback
        try:
            cursor = db.view_sessions.find({"profile_id": profile["id"]}, {"_id": 0, "started_at": 1})
            sessions = await cursor.to_list(20000)
            for s in sessions:
                ts = s.get("started_at")
                if not ts:
                    continue
                try:
                    d = ts[:10] if isinstance(ts, str) else ts.strftime("%Y-%m-%d")
                    # Only add if we haven't already counted from analytics
                    if not analytics_doc:
                        daily_map[d] = daily_map.get(d, 0) + 1
                except Exception:
                    continue
        except Exception:
            pass

        # Build last N days
        result = []
        for i in range(days, -1, -1):
            d = today - timedelta(days=i)
            key = d.isoformat()
            result.append({"date": key, "opens": int(daily_map.get(key, 0))})
        return {"days": days, "data": result}

    # ---------- Funnel -----------------------------------------------------
    @router.get("/api/admin/profiles/{profile_id}/analytics/funnel")
    async def funnel(profile_id: str, admin_data: dict = Depends(require_admin)):
        profile = await _get_profile_owned(profile_id, admin_data)
        pid = profile["id"]

        # Stage 1: Link opens (analytics.total_views)
        analytics_doc = await db.analytics.find_one({"profile_id": pid}, {"_id": 0}) or {}
        link_opened = int(analytics_doc.get("total_views", 0))

        # Stage 2: Invitation viewed = unique views
        invitation_viewed = int(analytics_doc.get("unique_views", 0)) or link_opened

        # Stage 3: RSVP started — guests who clicked RSVP (rsvp_clicks) or began
        rsvp_started = int(analytics_doc.get("rsvp_clicks", 0))

        # Stage 4: RSVP completed — from rsvps collection
        rsvp_completed = await db.rsvps.count_documents({"profile_id": pid})

        # Make funnel monotonically non-increasing for sanity (max with smaller stage)
        rsvp_started = max(rsvp_started, rsvp_completed)
        invitation_viewed = max(invitation_viewed, rsvp_started)
        link_opened = max(link_opened, invitation_viewed)

        stages = [
            {"name": "Link Opened", "count": link_opened},
            {"name": "Invitation Viewed", "count": invitation_viewed},
            {"name": "RSVP Started", "count": rsvp_started},
            {"name": "RSVP Completed", "count": rsvp_completed},
        ]
        return {"stages": stages}

    # ---------- Geography --------------------------------------------------
    @router.get("/api/admin/profiles/{profile_id}/analytics/geography")
    async def geography(profile_id: str, admin_data: dict = Depends(require_admin)):
        profile = await _get_profile_owned(profile_id, admin_data)
        pid = profile["id"]

        # Try several possible collections
        counter: Counter = Counter()

        # 1. view_sessions
        try:
            cursor = db.view_sessions.find({"profile_id": pid}, {"_id": 0, "city": 1, "country": 1})
            async for s in cursor:
                city = (s.get("city") or "Unknown").strip()
                country = (s.get("country") or "").strip()
                key = (city, country)
                if city and city != "Unknown":
                    counter[key] += 1
        except Exception:
            pass

        # 2. fallback to analytics_doc.location_views dict
        if not counter:
            analytics_doc = await db.analytics.find_one({"profile_id": pid}, {"_id": 0, "location_views": 1, "country_views": 1}) or {}
            for k, v in (analytics_doc.get("location_views") or {}).items():
                counter[(k, "")] += int(v)

        top = counter.most_common(10)
        return {
            "cities": [
                {"city": k[0], "country": k[1], "count": v}
                for k, v in top
            ]
        }

    # ---------- AI Insights ------------------------------------------------
    @router.post("/api/admin/profiles/{profile_id}/analytics/ai-insights")
    async def ai_insights(profile_id: str, admin_data: dict = Depends(require_admin)):
        profile = await _get_profile_owned(profile_id, admin_data)
        pid = profile["id"]

        # Check cache (24h)
        cached = await db.ai_insights_cache.find_one({"profile_id": pid}, {"_id": 0})
        if cached:
            try:
                gen = datetime.fromisoformat(cached["generated_at"])
                if datetime.now(timezone.utc) - gen.replace(tzinfo=timezone.utc) < timedelta(hours=24):
                    return cached
            except Exception:
                pass

        # Collect analytics snapshot
        analytics_doc = await db.analytics.find_one({"profile_id": pid}, {"_id": 0}) or {}
        rsvp_count = await db.rsvps.count_documents({"profile_id": pid})
        yes_count = await db.rsvps.count_documents({"profile_id": pid, "status": "yes"})
        no_count = await db.rsvps.count_documents({"profile_id": pid, "status": "no"})
        wishes_count = await db.guest_wishes.count_documents({"profile_id": pid, "status": "approved"}) if "guest_wishes" in await db.list_collection_names() else 0

        snapshot = {
            "couple": f"{profile.get('groom_name','')} & {profile.get('bride_name','')}".strip(" &"),
            "total_views": analytics_doc.get("total_views", 0),
            "unique_views": analytics_doc.get("unique_views", 0),
            "mobile_views": analytics_doc.get("mobile_views", 0),
            "desktop_views": analytics_doc.get("desktop_views", 0),
            "tablet_views": analytics_doc.get("tablet_views", 0),
            "rsvp_clicks": analytics_doc.get("rsvp_clicks", 0),
            "rsvp_completed": rsvp_count,
            "rsvp_yes": yes_count,
            "rsvp_no": no_count,
            "approved_wishes": wishes_count,
            "wedding_date": profile.get("event_date"),
        }

        sys_msg = (
            "You are an analytics expert for Indian wedding invitations. "
            "Generate exactly 3 short, actionable bullet-point insights based on this data. "
            "Each insight must mention specific numbers from the data and be one sentence. "
            "Indian wedding context (mehendi, sangeet, baraat). "
            "Output ONLY a JSON array of 3 strings, no other text. "
            "Example: [\"Insight 1.\", \"Insight 2.\", \"Insight 3.\"]"
        )
        try:
            resp_text = await ai_chat_factory(
                sys_msg,
                f"insights-{pid}-{uuid.uuid4().hex[:8]}",
                f"Analytics snapshot:\n{json.dumps(snapshot, indent=2)}"
            )
            # Parse JSON array
            insights: list = []
            try:
                # Find JSON array in response
                start = resp_text.find("[")
                end = resp_text.rfind("]")
                if start != -1 and end > start:
                    insights = json.loads(resp_text[start:end + 1])
            except Exception:
                pass
            if not insights or not isinstance(insights, list):
                # Fallback: split lines
                lines = [l.strip("•-* \t") for l in resp_text.splitlines() if l.strip()]
                insights = [l for l in lines if len(l) > 10][:3]
            insights = [str(x).strip() for x in insights[:3] if str(x).strip()]
            if not insights:
                insights = ["Not enough data yet — share your invitation to start collecting insights."]
        except Exception as e:
            insights = [f"AI insights temporarily unavailable: {str(e)[:80]}"]

        out = {
            "profile_id": pid,
            "insights": insights,
            "generated_at": _now_iso(),
            "snapshot": snapshot,
        }
        await db.ai_insights_cache.update_one(
            {"profile_id": pid},
            {"$set": out},
            upsert=True,
        )
        out.pop("_id", None)
        return out

    return router
