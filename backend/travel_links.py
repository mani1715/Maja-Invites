"""
travel_links.py — the "Getting to the venue" deep links, built in ONE place.

The invitation offers Google Maps, Ola, Uber, Rapido and a hotels-nearby search.
Only Ola actually worked. What was wrong:

* **Rapido** pointed at `https://rapido.bike/Booknow`, which returns **404**
  (verified). Rapido publishes no destination deep link, so the button now opens
  their real site and the UI copies the venue address for the guest to paste.
* **Uber** used `dropoff[latitude]=…` with RAW square brackets. Unencoded `[`/`]`
  in a query string is invalid per RFC 3986 and gets mangled by proxies and
  in-app browsers; they are percent-encoded now.
* The same block was duplicated in `premium_features.travel_links` and inline in
  `server.py`'s `/invite/{slug}/full`, so the two could (and did) drift. Both now
  call this.

Honest by construction: `carries_destination` says, per provider, whether the link
actually pre-fills the drop point. Rapido's does not, and the UI is expected to
say so rather than pretend.
"""
from __future__ import annotations

import urllib.parse
from typing import Any, Dict, Optional


def _num(v: Any) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f else None          # drop NaN


def build_travel_links(venue: Optional[str], lat: Any = None, lng: Any = None,
                       address: Optional[str] = None) -> Dict[str, Any]:
    """Every ride/map link for one venue.

    `address` (optional, e.g. the city line) makes the copy-to-clipboard text and
    the hotels search more precise; it falls back to the venue name.
    """
    venue = (venue or "").strip() or "Wedding Venue"
    dest = (address or "").strip()
    full_place = f"{venue}, {dest}" if dest and dest.lower() not in venue.lower() else venue
    q = urllib.parse.quote(full_place)
    dlat, dlng = _num(lat), _num(lng)
    pinned = dlat is not None and dlng is not None

    if pinned:
        google_maps = f"https://www.google.com/maps/search/?api=1&query={dlat},{dlng}"
        # Ola accepts the drop as coordinates + a label. This one already worked.
        ola = f"https://book.olacabs.com/?lat={dlat}&lng={dlng}&drop_name={q}"
        # Uber's documented universal link. The bracketed keys MUST be encoded.
        uber = ("https://m.uber.com/ul/?action=setPickup&pickup=my_location"
                f"&dropoff%5Blatitude%5D={dlat}&dropoff%5Blongitude%5D={dlng}"
                f"&dropoff%5Bnickname%5D={q}")
    else:
        google_maps = f"https://www.google.com/maps/search/?api=1&query={q}"
        ola = f"https://book.olacabs.com/?drop_name={q}"
        uber = f"https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff%5Bnickname%5D={q}"

    # Rapido has no public destination deep link — anything with a drop point in
    # it is guesswork, and the old guess 404'd. Send guests to the real site.
    rapido = "https://www.rapido.bike/"

    return {
        "venue": venue,
        "destination": {"lat": dlat, "lng": dlng} if pinned else None,
        "links": {
            "google_maps": google_maps,
            "ola": ola,
            "uber": uber,
            "rapido": rapido,
        },
        # Which buttons really pre-fill the drop, so the UI can be truthful and
        # offer "copy the address" where it can't.
        "carries_destination": {
            "google_maps": True, "ola": True, "uber": True, "rapido": False,
        },
        # What a guest pastes into any app that we cannot deep-link.
        "drop_address": full_place,
        "hotels_nearby_query": f"https://www.google.com/maps/search/hotels+near+{q}",
    }


def travel_payload_for_profile(profile: Dict[str, Any],
                               lat: Any = None, lng: Any = None) -> Dict[str, Any]:
    """Same, taken straight off a profile document (explicit lat/lng win)."""
    ms = profile.get("map_settings") or {}
    return build_travel_links(
        profile.get("venue"),
        lat if lat is not None else ms.get("latitude"),
        lng if lng is not None else ms.get("longitude"),
        address=profile.get("city"),
    )
