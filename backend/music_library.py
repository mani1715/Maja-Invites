"""
Curated music library for wedding invitations.

July 2026 — Honest rewrite:
  The previous version advertised 60 "Indian wedding" tracks (Ganpati Aarti,
  Shehnai, Sitar Raga…) but every one of those URLs pointed to the same 16
  generic SoundHelix demo instrumentals. The names mismatched the actual
  audio and photographers were rightly confused.

  We now ship a small CURATED set of royalty-free instrumental beds whose
  names *honestly* describe the audio (cinematic / ambient / soft / etc.).
  Photographers who want a specific Bollywood / Bhajan / Shehnai track can
  paste their own direct .mp3 / Google Drive link via the "Custom URL"
  field in the picker — that always wins over a library preset.
"""
from typing import List, Dict, Optional
from fastapi import APIRouter

# Helper for SoundHelix royalty-free instrumental tracks (1..16 are valid).
def _sh(n: int) -> str:
    return f"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-{n}.mp3"


# 20 honest curated entries, grouped by mood. Names describe the *actual*
# audio (instrumental ambient/cinematic/light electronic) — NOT misleading
# Indian-specific names that don't match the file.
MUSIC_LIBRARY = [
    # ──────────────────────────── Peaceful / Devotional mood ───
    {"id": "calm-01", "title": "Calm Strings — Sacred Mood",       "category": "peaceful", "mood": "sacred",     "duration_sec": 192, "url": _sh(1)},
    {"id": "calm-02", "title": "Soft Piano — Mandap Morning",      "category": "peaceful", "mood": "peaceful",   "duration_sec": 178, "url": _sh(2)},
    {"id": "calm-03", "title": "Gentle Flute — Temple Breeze",     "category": "peaceful", "mood": "sacred",     "duration_sec": 213, "url": _sh(3)},
    {"id": "calm-04", "title": "Ambient Pads — Meditation",        "category": "peaceful", "mood": "meditative", "duration_sec": 165, "url": _sh(4)},

    # ──────────────────────────── Elegant / Classical mood ─────
    {"id": "elg-01",  "title": "Cinematic Strings — Elegant",      "category": "elegant",  "mood": "elegant",    "duration_sec": 224, "url": _sh(5)},
    {"id": "elg-02",  "title": "Soft Orchestra — Ceremony Walk",   "category": "elegant",  "mood": "graceful",   "duration_sec": 198, "url": _sh(6)},
    {"id": "elg-03",  "title": "Light Strings — Reception Lounge", "category": "elegant",  "mood": "warm",       "duration_sec": 246, "url": _sh(7)},
    {"id": "elg-04",  "title": "Piano & Strings Duet",             "category": "elegant",  "mood": "romantic",   "duration_sec": 211, "url": _sh(8)},

    # ──────────────────────────── Pleasant / Ambient ───────────
    {"id": "amb-01",  "title": "Pleasant Background — Mehndi",     "category": "pleasant", "mood": "joyful",     "duration_sec": 186, "url": _sh(9)},
    {"id": "amb-02",  "title": "Soft Acoustic — Haldi Sunlight",   "category": "pleasant", "mood": "cheerful",   "duration_sec": 167, "url": _sh(10)},
    {"id": "amb-03",  "title": "Lounge Background — Cocktails",    "category": "pleasant", "mood": "relaxed",    "duration_sec": 203, "url": _sh(11)},
    {"id": "amb-04",  "title": "Acoustic Guitar — Daytime",        "category": "pleasant", "mood": "warm",       "duration_sec": 175, "url": _sh(12)},

    # ──────────────────────────── Romantic / Soft ──────────────
    {"id": "rom-01",  "title": "Romantic Piano — First Look",      "category": "romantic", "mood": "romantic",   "duration_sec": 199, "url": _sh(13)},
    {"id": "rom-02",  "title": "Soft Strings — Couple Portraits",  "category": "romantic", "mood": "tender",     "duration_sec": 182, "url": _sh(14)},
    {"id": "rom-03",  "title": "Warm Pads — Vows",                 "category": "romantic", "mood": "tender",     "duration_sec": 214, "url": _sh(15)},
    {"id": "rom-04",  "title": "Slow Piano — Slow Dance",          "category": "romantic", "mood": "intimate",   "duration_sec": 188, "url": _sh(16)},

    # ──────────────────────────── Cinematic / Grand ────────────
    {"id": "cin-01",  "title": "Cinematic Build — Grand Entry",    "category": "cinematic","mood": "majestic",   "duration_sec": 218, "url": _sh(1)},
    {"id": "cin-02",  "title": "Epic Strings — Pheras",            "category": "cinematic","mood": "majestic",   "duration_sec": 232, "url": _sh(5)},
    {"id": "cin-03",  "title": "Festive Build — Baraat",           "category": "cinematic","mood": "festive",    "duration_sec": 245, "url": _sh(7)},
    {"id": "cin-04",  "title": "Crescendo — Varmala Moment",       "category": "cinematic","mood": "uplifting",  "duration_sec": 228, "url": _sh(11)},
]


CATEGORY_INFO = {
    "peaceful":  {"label": "Peaceful / Sacred", "icon": "🪷", "color": "#D4AF37"},
    "elegant":   {"label": "Elegant / Classical","icon": "🎻", "color": "#8B4513"},
    "pleasant":  {"label": "Pleasant / Ambient", "icon": "🌸", "color": "#FFB6C1"},
    "romantic":  {"label": "Romantic / Soft",    "icon": "💕", "color": "#FF69B4"},
    "cinematic": {"label": "Cinematic / Grand",  "icon": "✨", "color": "#FFD700"},
}


# ─────────────────────────────────────────────────────────────────────────
# CELEBRATION (non-wedding) curated library — Jul 2026.
# A smaller, intentionally cheerful/family-friendly set used by the baby
# birthday / half-saree / puberty / dhoti invitation form.  These are the
# SAME royalty-free SoundHelix beds as the wedding library but the names
# describe celebration moments (lullaby, joyful welcome, family gathering)
# instead of wedding-specific moments.
# ─────────────────────────────────────────────────────────────────────────
CELEBRATION_MUSIC_LIBRARY = [
    # — Lullaby / Sweet (best for baby_birthday)
    {"id": "cel-lul-01", "title": "Lullaby Piano — Sweet Dreams",        "category": "lullaby",   "mood": "tender",    "duration_sec": 178, "url": _sh(2)},
    {"id": "cel-lul-02", "title": "Soft Flute — Cradle Song",            "category": "lullaby",   "mood": "tender",    "duration_sec": 213, "url": _sh(3)},
    # — Joyful / Festive (great for half-saree & dhoti)
    {"id": "cel-joy-01", "title": "Joyful Strings — Festive Welcome",    "category": "joyful",    "mood": "joyful",    "duration_sec": 186, "url": _sh(9)},
    {"id": "cel-joy-02", "title": "Cheerful Acoustic — Sunny Day",       "category": "joyful",    "mood": "cheerful",  "duration_sec": 167, "url": _sh(10)},
    {"id": "cel-joy-03", "title": "Light Strings — Family Gathering",    "category": "joyful",    "mood": "warm",      "duration_sec": 246, "url": _sh(7)},
    # — Devotional (for puberty / traditional ceremonies)
    {"id": "cel-dev-01", "title": "Calm Strings — Blessing Mood",        "category": "devotional","mood": "sacred",    "duration_sec": 192, "url": _sh(1)},
    {"id": "cel-dev-02", "title": "Ambient Pads — Aarti Hour",           "category": "devotional","mood": "meditative","duration_sec": 165, "url": _sh(4)},
    # — Pleasant background
    {"id": "cel-amb-01", "title": "Acoustic Guitar — Daytime Smiles",    "category": "pleasant",  "mood": "warm",      "duration_sec": 175, "url": _sh(12)},
    {"id": "cel-amb-02", "title": "Lounge Background — Snacks & Tea",    "category": "pleasant",  "mood": "relaxed",   "duration_sec": 203, "url": _sh(11)},
    # — Cinematic (grand finale / candle-cutting moment)
    {"id": "cel-cin-01", "title": "Crescendo — Candle Moment",           "category": "cinematic", "mood": "uplifting", "duration_sec": 228, "url": _sh(11)},
]


CELEBRATION_CATEGORY_INFO = {
    "lullaby":    {"label": "Lullaby / Sweet",      "icon": "🍼", "color": "#FFB6C1"},
    "joyful":     {"label": "Joyful / Festive",     "icon": "🎉", "color": "#FFD700"},
    "devotional": {"label": "Devotional / Sacred",  "icon": "🪷", "color": "#D4AF37"},
    "pleasant":   {"label": "Pleasant / Ambient",   "icon": "🌸", "color": "#FFB6C1"},
    "cinematic":  {"label": "Cinematic / Grand",    "icon": "✨", "color": "#FFD700"},
}


def get_music_library() -> List[Dict]:
    return MUSIC_LIBRARY


def get_song_by_id(song_id: str) -> Optional[Dict]:
    for s in MUSIC_LIBRARY:
        if s["id"] == song_id:
            return s
    return None


def get_songs_by_category(category: str) -> List[Dict]:
    return [s for s in MUSIC_LIBRARY if s["category"] == category]


def get_songs_by_mood(mood: str) -> List[Dict]:
    return [s for s in MUSIC_LIBRARY if s["mood"] == mood]


def create_music_router() -> APIRouter:
    router = APIRouter(prefix="/music", tags=["music"])

    @router.get("/library")
    async def get_library():
        return {
            "songs": MUSIC_LIBRARY,
            "categories": CATEGORY_INFO,
            "total": len(MUSIC_LIBRARY),
            "note": (
                "These are royalty-free instrumental beds (cinematic, soft, "
                "ambient). For an exact Indian wedding track (e.g. Ganpati "
                "Aarti, Shehnai, Bollywood song), paste a direct .mp3 / Drive "
                "URL in the Custom URL field — it overrides the library pick."
            ),
        }

    @router.get("/library/by-category/{category}")
    async def get_by_category(category: str):
        return {"songs": get_songs_by_category(category), "category_info": CATEGORY_INFO.get(category)}

    @router.get("/library/by-mood/{mood}")
    async def get_by_mood(mood: str):
        return {"songs": get_songs_by_mood(mood)}

    @router.get("/library/random")
    async def get_random_song(category: Optional[str] = None):
        import random
        pool = MUSIC_LIBRARY if not category else get_songs_by_category(category)
        if not pool:
            return {"error": "No songs in category"}
        return {"song": random.choice(pool)}

    @router.get("/library/search")
    async def search_songs(q: str):
        q_lower = q.lower()
        results = [s for s in MUSIC_LIBRARY if q_lower in s["title"].lower() or q_lower in s.get("mood", "").lower()]
        return {"songs": results, "total": len(results)}

    @router.get("/presets")
    async def get_presets(category: Optional[str] = None):
        """Backwards-compat alias used by MusicPresetPicker.jsx.
        When `category=celebration` is passed, returns the curated
        celebration (non-wedding) library — a smaller, cheerful set used
        by the baby_birthday / half_saree / puberty / dhoti invitation
        form. Otherwise returns the full wedding library.
        """
        if category == "celebration":
            src = CELEBRATION_MUSIC_LIBRARY
        else:
            src = MUSIC_LIBRARY
        presets = []
        for s in src:
            presets.append({
                "preset_id": s["id"],
                "name": s["title"],
                "category": s["category"],
                "mood": s.get("mood"),
                "url": s["url"],
                "duration_sec": s.get("duration_sec"),
            })
        return {"presets": presets, "count": len(presets)}

    return router


# Backwards-compat alias — server.py imports this exact name.
build_music_library_router = create_music_router
