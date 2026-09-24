"""
MAJA Invites — MAP FEATURES MODULE
=====================================
Per-event maps, address picking, short-URL expansion, What3Words,
live ETA via OSRM, multi-venue, parking info.

Public, free, no-key APIs:
  - Nominatim (OpenStreetMap) — geocoding & reverse-geocoding
  - OSRM (https://router.project-osrm.org) — driving routes for ETA

Optional API key:
  - WHAT3WORDS_API_KEY for 3-word addresses (mock-mode fallback)
"""
import logging
import os
import re
import urllib.parse
from typing import Optional, Dict, Any, List

import httpx
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ---- HTTP helper (single shared client) ----
_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=15.0,
            follow_redirects=True,
            headers={"User-Agent": "MAJA-Creations/1.0 (maps@maja-creations.com)"},
        )
    return _client


# ---- Pydantic models ----
class MapExpandRequest(BaseModel):
    url: str = Field(..., min_length=4, max_length=1024)


class W3WForwardRequest(BaseModel):
    latitude: float
    longitude: float
    language: str = "en"


class W3WReverseRequest(BaseModel):
    words: str = Field(..., min_length=5, max_length=80)


class GeocodeSearchResponse(BaseModel):
    results: List[Dict[str, Any]]


# ---- helpers ----
_LAT_LNG_RE = re.compile(r"@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)")
_QPOS_RE   = re.compile(r"[?&]q=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)")
_DD_RE     = re.compile(r"!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)")


def _extract_latlng(url: str):
    for pat in (_LAT_LNG_RE, _DD_RE, _QPOS_RE):
        m = pat.search(url)
        if m:
            try:
                return float(m.group(1)), float(m.group(2))
            except ValueError:
                pass
    return None, None


# ---- Router builder ----
def build_map_router(db, get_current_admin):
    router = APIRouter(prefix="/api", tags=["maps"])

    async def _require_owned_profile(profile_id_or_slug: str, admin_id: str) -> dict:
        """Object-level authorization (same pattern as gallery_privacy /
        gallery_features._require_owned_profile). Without this, any
        authenticated photographer could overwrite another studio's venue."""
        profile = await db.profiles.find_one(
            {"$or": [{"id": profile_id_or_slug}, {"slug": profile_id_or_slug}]}, {"_id": 0})
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        owner = profile.get("admin_id")
        if owner:
            if owner == admin_id:
                return profile
            admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
            if admin and admin.get("role") == "super_admin":
                return profile
            raise HTTPException(status_code=403, detail="You do not have access to this profile")
        logger.warning("profile %s has no admin_id; ownership not enforced", profile.get("id"))
        return profile

    # ====================================================================
    # 1. Expand a Google Maps short URL (e.g. maps.app.goo.gl/xxx)
    #    Returns: { latitude, longitude, name, expanded_url }
    # ====================================================================
    @router.post("/admin/map/expand")
    async def expand_url(req: MapExpandRequest,
                          admin_id: str = Depends(get_current_admin)):
        url = req.url.strip()
        if not url.startswith("http"):
            raise HTTPException(status_code=400, detail="URL must start with http(s)")

        # 1) Direct extraction first (long Google URL contains lat,lng)
        lat, lng = _extract_latlng(url)
        expanded = url

        # 2) If short URL, follow redirects
        if lat is None or lng is None:
            try:
                client = _get_client()
                resp = await client.get(url, follow_redirects=True)
                expanded = str(resp.url)
                lat, lng = _extract_latlng(expanded)
            except Exception as e:
                raise HTTPException(status_code=400,
                                     detail=f"Could not expand URL: {str(e)[:100]}")

        # 3) Try Nominatim reverse-geocode to get a name
        name = None
        if lat is not None and lng is not None:
            try:
                client = _get_client()
                r = await client.get(
                    "https://nominatim.openstreetmap.org/reverse",
                    params={"format": "jsonv2", "lat": lat, "lon": lng, "zoom": 17},
                )
                if r.status_code == 200:
                    j = r.json()
                    name = j.get("display_name")
            except Exception:
                pass

        if lat is None or lng is None:
            raise HTTPException(status_code=422,
                                 detail="Could not extract coordinates from this URL. "
                                        "Try a different Google Maps share link.")
        return {
            "latitude": lat,
            "longitude": lng,
            "name": name,
            "expanded_url": expanded,
        }

    # ====================================================================
    # 2. Geocoding search — Nominatim (free, no key)
    # ====================================================================
    @router.get("/admin/map/search", response_model=GeocodeSearchResponse)
    async def search_places(q: str = Query(..., min_length=2, max_length=200),
                             country: Optional[str] = "in",  # bias India
                             admin_id: str = Depends(get_current_admin)):
        try:
            client = _get_client()
            params = {
                "format": "jsonv2",
                "q": q,
                "limit": 8,
                "addressdetails": 1,
            }
            if country:
                params["countrycodes"] = country
            r = await client.get("https://nominatim.openstreetmap.org/search", params=params)
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail="Geocoder unavailable")
            data = r.json()
            results = [{
                "display_name": p.get("display_name"),
                "latitude": float(p["lat"]),
                "longitude": float(p["lon"]),
                "type": p.get("type"),
                "address": p.get("address", {}),
            } for p in data]
            return {"results": results}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Geocoder error: {str(e)[:80]}")

    # ====================================================================
    # 3. What3Words — lat/lng -> 3 words (and reverse)
    # ====================================================================
    @router.post("/admin/map/what3words")
    async def to_3wa(req: W3WForwardRequest,
                      admin_id: str = Depends(get_current_admin)):
        key = os.environ.get("WHAT3WORDS_API_KEY")
        if not key:
            return {
                "words": None,
                "mode": "mock",
                "note": "What3Words not configured. Add WHAT3WORDS_API_KEY in /app/backend/.env to enable.",
            }
        try:
            client = _get_client()
            r = await client.get(
                "https://api.what3words.com/v3/convert-to-3wa",
                params={"key": key,
                        "coordinates": f"{req.latitude},{req.longitude}",
                        "language": req.language},
            )
            if r.status_code != 200:
                # Soft fail — UI continues without W3W
                return {"words": None, "mode": "error",
                        "note": f"W3W upstream: {r.text[:120]}"}
            j = r.json()
            return {
                "words": j.get("words"),
                "nearest_place": j.get("nearestPlace"),
                "country": j.get("country"),
                "map_link": f"https://what3words.com/{j.get('words')}" if j.get('words') else None,
                "mode": "live",
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"W3W error: {str(e)[:80]}")

    @router.post("/admin/map/from-3wa")
    async def from_3wa(req: W3WReverseRequest,
                        admin_id: str = Depends(get_current_admin)):
        key = os.environ.get("WHAT3WORDS_API_KEY")
        if not key:
            return {"latitude": None, "longitude": None, "mode": "mock"}
        # accept "filled.count.soap" or "///filled.count.soap"
        words = req.words.strip().lstrip("/").strip()
        try:
            client = _get_client()
            r = await client.get(
                "https://api.what3words.com/v3/convert-to-coordinates",
                params={"key": key, "words": words},
            )
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail=f"W3W error: {r.text[:120]}")
            j = r.json()
            return {
                "latitude": j.get("coordinates", {}).get("lat"),
                "longitude": j.get("coordinates", {}).get("lng"),
                "nearest_place": j.get("nearestPlace"),
                "mode": "live",
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"W3W error: {str(e)[:80]}")

    # ====================================================================
    # 4. ETA via OSRM (free public router)
    # ====================================================================
    @router.get("/invite/{slug}/eta")
    async def venue_eta(slug: str,
                         from_lat: float = Query(...),
                         from_lng: float = Query(...),
                         to_lat: Optional[float] = None,
                         to_lng: Optional[float] = None,
                         event_id: Optional[str] = None):
        # Resolve destination
        if to_lat is None or to_lng is None:
            profile = await db.profiles.find_one(
                {"$or": [{"id": slug}, {"slug": slug}]}, {"_id": 0})
            if not profile:
                raise HTTPException(status_code=404, detail="Profile not found")
            # Find destination (event-level overrides venue-level)
            dest_lat = profile.get("map_settings", {}).get("latitude")
            dest_lng = profile.get("map_settings", {}).get("longitude")
            if event_id:
                for ev in profile.get("events", []):
                    if ev.get("event_id") == event_id:
                        if ev.get("latitude") and ev.get("longitude"):
                            dest_lat, dest_lng = ev["latitude"], ev["longitude"]
                        break
            if dest_lat is None or dest_lng is None:
                raise HTTPException(status_code=422,
                    detail="No destination pin. Configure the map in admin first.")
            to_lat, to_lng = dest_lat, dest_lng

        try:
            client = _get_client()
            url = (f"https://router.project-osrm.org/route/v1/driving/"
                   f"{from_lng},{from_lat};{to_lng},{to_lat}"
                   f"?overview=false&alternatives=false")
            r = await client.get(url)
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail="Router unavailable")
            j = r.json()
            if j.get("code") != "Ok" or not j.get("routes"):
                raise HTTPException(status_code=422, detail="Route not found")
            route = j["routes"][0]
            duration_sec = int(route["duration"])
            distance_m = int(route["distance"])
            return {
                "duration_sec": duration_sec,
                "duration_minutes": round(duration_sec / 60),
                "distance_km": round(distance_m / 1000, 1),
                "destination": {"latitude": to_lat, "longitude": to_lng},
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Router error: {str(e)[:80]}")

    # ====================================================================
    # 5. Per-event venue (admin set/get)
    # ====================================================================
    class EventVenuePayload(BaseModel):
        latitude: Optional[float] = None
        longitude: Optional[float] = None
        venue_name: Optional[str] = None
        venue_address: Optional[str] = None
        map_link: Optional[str] = None
        what3words: Optional[str] = None
        parking_info: Optional[str] = None

    @router.put("/admin/profiles/{profile_id}/events/{event_id}/venue")
    async def update_event_venue(profile_id: str, event_id: str,
                                  payload: EventVenuePayload,
                                  admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(profile_id, admin_id)
        events = profile.get("events", [])
        found = False
        for ev in events:
            if ev.get("event_id") == event_id:
                for k, v in payload.model_dump(exclude_none=True).items():
                    ev[k] = v
                found = True
                break
        if not found:
            raise HTTPException(status_code=404, detail="Event not found")
        from datetime import datetime, timezone
        await db.profiles.update_one(
            {"id": profile["id"]},
            {"$set": {"events": events,
                      "updated_at": datetime.now(timezone.utc).isoformat()}})
        return {"success": True, "event_id": event_id}

    @router.put("/admin/profiles/{profile_id}/main-venue")
    async def update_main_venue(profile_id: str,
                                  payload: EventVenuePayload,
                                  admin_id: str = Depends(get_current_admin)):
        profile = await _require_owned_profile(profile_id, admin_id)
        from datetime import datetime, timezone
        # Persist into map_settings + main fields
        ms = profile.get("map_settings", {}) or {}
        ms["embed_enabled"] = True
        if payload.latitude is not None: ms["latitude"] = payload.latitude
        if payload.longitude is not None: ms["longitude"] = payload.longitude
        if payload.map_link: ms["map_link"] = payload.map_link
        if payload.what3words: ms["what3words"] = payload.what3words
        if payload.parking_info: ms["parking_info"] = payload.parking_info

        set_doc = {"map_settings": ms,
                   "updated_at": datetime.now(timezone.utc).isoformat()}
        if payload.venue_name:    set_doc["venue"] = payload.venue_name
        if payload.venue_address: set_doc["venue_address"] = payload.venue_address

        await db.profiles.update_one({"id": profile["id"]}, {"$set": set_doc})
        return {"success": True, "map_settings": ms}

    # ====================================================================
    # 6. Public per-event venue data (with multi-platform deep links)
    # ====================================================================
    @router.get("/invite/{slug}/venues")
    async def public_venues(slug: str):
        profile = await db.profiles.find_one(
            {"$or": [{"id": slug}, {"slug": slug}]}, {"_id": 0})
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")

        def _build_links(lat, lng, name, map_link_paste, w3w):
            name_q = urllib.parse.quote(name or "")
            if lat is not None and lng is not None:
                google = (map_link_paste
                          or f"https://www.google.com/maps/search/?api=1&query={lat},{lng}")
                apple = f"https://maps.apple.com/?ll={lat},{lng}&q={name_q}"
                uber = (f"https://m.uber.com/ul/?action=setPickup&pickup=my_location"
                        f"&dropoff[latitude]={lat}&dropoff[longitude]={lng}"
                        f"&dropoff[nickname]={name_q}")
                ola = f"https://book.olacabs.com/?lat={lat}&lng={lng}&drop_name={name_q}"
                rapido = f"https://rapido.bike/Booknow?dropLat={lat}&dropLng={lng}"
                wa = (f"https://wa.me/?text=" +
                      urllib.parse.quote(f"{name or 'Venue'} — {google}"))
            else:
                google = (map_link_paste
                          or f"https://www.google.com/maps/search/?api=1&query={name_q}")
                apple = f"https://maps.apple.com/?q={name_q}"
                uber = f"https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[nickname]={name_q}"
                ola = f"https://book.olacabs.com/?drop_name={name_q}"
                rapido = "https://rapido.bike"
                wa = (f"https://wa.me/?text=" +
                      urllib.parse.quote(f"{name or 'Venue'} — {google}"))
            return {
                "google_maps": google, "apple_maps": apple,
                "uber": uber, "ola": ola, "rapido": rapido,
                "whatsapp_share": wa,
                "what3words_link": (f"https://what3words.com/{w3w}" if w3w else None),
            }

        # Main venue
        ms = profile.get("map_settings", {}) or {}
        main_venue = {
            "kind": "main",
            "name": profile.get("venue") or "Wedding venue",
            "address": profile.get("venue_address") or profile.get("city") or "",
            "latitude": ms.get("latitude"),
            "longitude": ms.get("longitude"),
            "what3words": ms.get("what3words"),
            "parking_info": ms.get("parking_info"),
            "links": _build_links(ms.get("latitude"), ms.get("longitude"),
                                    profile.get("venue"), ms.get("map_link"),
                                    ms.get("what3words")),
        }

        # Per-event venues
        events = []
        for ev in profile.get("events", []) or []:
            events.append({
                "kind": "event",
                "event_id": ev.get("event_id"),
                "event_type": ev.get("event_type"),
                "event_name": ev.get("name") or ev.get("event_name") or "Event",
                "date": ev.get("date"),
                "start_time": ev.get("start_time"),
                "name": ev.get("venue_name") or main_venue["name"],
                "address": ev.get("venue_address") or "",
                "latitude": ev.get("latitude"),
                "longitude": ev.get("longitude"),
                "what3words": ev.get("what3words"),
                "parking_info": ev.get("parking_info"),
                "links": _build_links(ev.get("latitude"), ev.get("longitude"),
                                        ev.get("venue_name") or main_venue["name"],
                                        ev.get("map_link"),
                                        ev.get("what3words")),
            })

        return {"main_venue": main_venue, "events": events}

    return router
