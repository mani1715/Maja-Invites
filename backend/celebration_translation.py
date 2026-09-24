"""
Celebration AI Translation (Gemini-backed)
==========================================

Adds the AI translation endpoint used by CelebrationProfileForm:

    POST /api/admin/profiles/{profile_id}/translate  { "language": "tamil" }
    POST /api/users/profiles/{profile_id}/translate  { "language": "tamil" }

The endpoint:
  1. Loads the saved profile (admin owner or user owner).
  2. Builds a small JSON of celebration copy (welcome message, story,
     closing message, parent labels) in English.
  3. Calls Google's Gemini API (key already in backend/.env as
     GEMINI_API_KEY) to translate the JSON into the target language while
     preserving keys.
  5. Persists the translation onto profiles.translations[<language>] so
     CelebrationPublicView can render the localised copy.

Supported languages: tamil, telugu, kannada, malayalam, hindi (English
is the source).
"""

from __future__ import annotations

import os
import json
import logging
from typing import Any, Dict, Optional

import aiohttp
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from pg_adapter import Database as AsyncIOMotorDatabase


logger = logging.getLogger(__name__)


# ── Languages ───────────────────────────────────────────────────────────
LANGUAGE_NAMES = {
    "tamil":     "Tamil (தமிழ்)",
    "telugu":    "Telugu (తెలుగు)",
    "kannada":   "Kannada (ಕನ್ನಡ)",
    "malayalam": "Malayalam (മലയാളം)",
    "hindi":     "Hindi (हिन्दी)",
    "english":   "English",
}

# Cost per language, charged from the photographer (admin) wallet.


# ── Request / response models ───────────────────────────────────────────
class TranslateRequest(BaseModel):
    language: str = Field(..., description="Target language code")


class TranslateResponse(BaseModel):
    language: str
    translation: Dict[str, Any]


# ── Gemini API caller ───────────────────────────────────────────────────
async def _gemini_translate(content: Dict[str, Any], target_language: str) -> Dict[str, Any]:
    """Call Gemini 2.5 Flash to translate a JSON dict, returning a dict.

    We send the JSON serialised as text and ask Gemini to return ONLY a
    JSON object with the same keys but translated values.  We use Flash
    because translation is short, cheap, and latency-sensitive.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GEMINI_API_KEY not configured on the server",
        )

    target_name = LANGUAGE_NAMES.get(target_language, target_language)
    payload_text = json.dumps(content, ensure_ascii=False, indent=2)

    prompt = (
        "You are a professional translator for Indian celebration "
        "invitations (baby first birthday, half-saree, puberty / Manjal "
        "Neeratu Vizha, dhoti ceremony). Translate the VALUES of the JSON "
        f"object below into {target_name}.\n\n"
        "Rules:\n"
        " - Keep ALL JSON keys EXACTLY as-is (do not translate keys).\n"
        " - Keep the JSON shape and indentation; return ONLY a JSON object.\n"
        " - Translate proper names phonetically (e.g., 'Aarav' → 'ஆரவ்').\n"
        " - Preserve dates / numbers / punctuation.\n"
        " - For empty strings, return empty strings.\n"
        " - Use warm, culturally-respectful language appropriate for "
        "family celebrations.\n"
        " - Do NOT include markdown code fences, explanations, or comments.\n\n"
        f"JSON to translate:\n{payload_text}"
    )

    # Use Gemini 2.5 Flash (fast & cheap; Indian language support is excellent)
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash:generateContent?key={api_key}"
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "topP": 0.9,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json",
        },
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=body, timeout=aiohttp.ClientTimeout(total=45)) as resp:
            if resp.status != 200:
                err_body = await resp.text()
                logger.error(f"Gemini translate failed [{resp.status}]: {err_body[:500]}")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Translation provider failed ({resp.status}). Please try again.",
                )
            data = await resp.json()

    # Extract the text content
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError):
        logger.error(f"Unexpected Gemini response shape: {json.dumps(data)[:500]}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Translation provider returned an unexpected response.",
        )

    # Strip markdown fences if Gemini ignored the instruction
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        # remove leading 'json\n' if present
        if text.lower().startswith("json"):
            text = text[4:].lstrip("\n")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.error(f"Could not parse Gemini JSON: {text[:500]}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Translation provider returned malformed JSON. Please retry.",
        )


def _build_source_payload(profile: Dict[str, Any]) -> Dict[str, str]:
    """Pull the user-visible English copy out of the profile that we
    actually want translated. Anything missing is sent as an empty
    string so Gemini doesn't hallucinate."""
    ci = profile.get("celebrant_info") or {}
    return {
        "invitation_message": profile.get("invitation_message") or "",
        "story":              ci.get("story") or profile.get("love_story") or "",
        "closing_message":    ci.get("closing_message") or "",
        "subtitle":           ci.get("subtitle") or "",
        "welcome_blessing":   ci.get("welcome_blessing") or "",
    }


# ── Router factory ──────────────────────────────────────────────────────
def build_celebration_translation_router(
    db: AsyncIOMotorDatabase,
    get_current_admin,   # FastAPI dependency callable
    get_current_user,    # FastAPI dependency callable (may be None)
) -> APIRouter:
    """Build the celebration translation router.

    We accept the deps from server.py to avoid circular imports.
    """
    router = APIRouter()

    async def _do_translate(profile_id: str, language: str, performed_by: str,
                            *, admin_id: Optional[str], is_admin_route: bool) -> TranslateResponse:
        # 1. validate language
        if language not in LANGUAGE_NAMES or language == "english":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported translation language: {language}",
            )

        # 2. load profile
        profile = await db.profiles.find_one({"id": profile_id})
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found",
            )

        # 3. authorisation — admin route owns by admin_id, user route owns by user_id
        if is_admin_route:
            if profile.get("created_by_admin_id") and admin_id and profile["created_by_admin_id"] != admin_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not own this profile.",
                )
        else:
            if profile.get("user_id") and performed_by and profile["user_id"] != performed_by:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not own this profile.",
                )

        # 4. build source payload & call Gemini
        source = _build_source_payload(profile)
        translated = await _gemini_translate(source, language)

        # 5. persist translation onto profile
        update_doc = {
            f"translations.{language}": translated,
            "updated_at": __import__("datetime").datetime.utcnow(),
        }
        await db.profiles.update_one({"id": profile_id}, {"$set": update_doc})

        return TranslateResponse(
            language=language,
            translation=translated,
        )

    # ── ADMIN route (photographer translating their own profile) ───────
    @router.post(
        "/admin/profiles/{profile_id}/translate",
        response_model=TranslateResponse,
        tags=["Celebration Translation"],
    )
    async def admin_translate(
        profile_id: str,
        body: TranslateRequest,
        admin = Depends(get_current_admin),
    ):
        # get_current_admin returns the admins.id as a plain STRING. The shape
        # dance that used to be here tried .id, .admin_id, then two dict reads —
        # a string satisfies none of them, so every authenticated admin fell
        # through to the 401 below. Handle the string first; keep the dict
        # branch so a future dependency swap does not silently break again.
        if isinstance(admin, str):
            admin_id = admin
        elif isinstance(admin, dict):
            admin_id = admin.get("id") or admin.get("admin_id")
        else:
            admin_id = getattr(admin, "id", None) or getattr(admin, "admin_id", None)
        if not admin_id:
            raise HTTPException(status_code=401, detail="Unauthorised")
        return await _do_translate(
            profile_id, body.language,
            performed_by=admin_id, admin_id=admin_id, is_admin_route=True,
        )

    # ── USER route ─────────────────────────────────────────────────────
    if get_current_user is not None:
        @router.post(
            "/users/profiles/{profile_id}/translate",
            response_model=TranslateResponse,
            tags=["Celebration Translation"],
        )
        async def user_translate(
            profile_id: str,
            body: TranslateRequest,
            user = Depends(get_current_user),
        ):
            # Fix: handle both user_id and id keys
            user_id = (
                getattr(user, "id", None)
                or getattr(user, "user_id", None)
                or (user.get("id") if isinstance(user, dict) else None)
                or (user.get("user_id") if isinstance(user, dict) else None)
            )
            if not user_id:
                raise HTTPException(status_code=401, detail="Unauthorised")
            return await _do_translate(
                profile_id, body.language,
                performed_by=user_id, admin_id=None, is_admin_route=False,
            )

    return router
