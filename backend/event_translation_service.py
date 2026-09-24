"""
event_translation_service.py — MAJA Dynamic Event Engine: invitation translation (Spec 05 §21).
===============================================================================================

Purpose
    Translate an event's public-facing content (title + invitation content) into the
    event type's supported languages, storing results under `events.translations[lang]`
    so the public renderer can serve a localized invitation. Reuses the platform's
    existing Gemini translation (celebration_translation), and degrades gracefully
    (returns translated=False) when no AI key is configured — never blocks the builder.

Dependencies  event_rbac (authorize), event_lifecycle_service (_now/_audit),
            event_registry (supported languages + flag), celebration_translation (reused)
Side effects  events.translations[lang]; audit rows
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body

import event_registry as registry
import event_rbac as rbac
from event_lifecycle_service import _now, _audit

# fields (from the invitation_content section) that are worth translating
_CONTENT_FIELDS = ("heading", "subheading", "welcome_message", "invitation_note")


async def _default_translator(content: Dict[str, Any], target_language: str) -> Dict[str, Any]:
    from celebration_translation import _gemini_translate   # reuse the platform engine
    return await _gemini_translate(content, target_language)


def _source_payload(event: Dict[str, Any]) -> Dict[str, str]:
    src: Dict[str, str] = {}
    if event.get("title"):
        src["title"] = event["title"]
    content = event.get("content") or {}
    for k in _CONTENT_FIELDS:
        if content.get(k):
            src[k] = content[k]
    return src


def supported_languages(event: Dict[str, Any]) -> List[str]:
    cfg = registry.get_config(event.get("event_type")) or {}
    return cfg.get("supported_languages") or cfg.get("languages") or ["en"]


async def translate_event(db, event: Dict[str, Any], target_language: str, *,
                          actor: Optional[Dict[str, Any]] = None,
                          translator: Optional[Callable] = None) -> Dict[str, Any]:
    if target_language not in supported_languages(event):
        raise HTTPException(422, f"'{target_language}' is not a supported language for this event.")
    payload = _source_payload(event)
    if not payload:
        raise HTTPException(422, "Nothing to translate yet — add invitation content first.")
    translator = translator or _default_translator
    try:
        translated = await translator(payload, target_language)
    except Exception as e:      # AI unavailable → graceful, not fatal
        return {"translated": False, "reason": "translation_unavailable", "detail": str(e)}
    if not translated:
        return {"translated": False, "reason": "translation_unavailable"}
    translations = dict(event.get("translations") or {})
    translations[target_language] = {**translated, "_translated_at": _now()}
    await db.events.update_one({"event_id": event["event_id"]},
                              {"$set": {"translations": translations, "updated_at": _now()}})
    await _audit(db, event["event_id"], actor, "event_translated", "translation",
                 after={"language": target_language})
    return {"translated": True, "language": target_language, "fields": list(translated.keys())}


async def get_translations(db, event: Dict[str, Any]) -> Dict[str, Any]:
    return {"supported": supported_languages(event),
            "available": sorted((event.get("translations") or {}).keys()),
            "default": (event.get("language") or "en")}


def build_event_translation_router(db, get_current_buyer) -> APIRouter:
    router = APIRouter(tags=["event-translation"])

    async def _gate():
        if not await registry.module_enabled(db):
            raise HTTPException(404, "Not found")

    @router.get("/api/events/{event_id}/translations")
    async def translations(event_id: str, current=Depends(get_current_buyer)):
        await _gate()
        event = await rbac.authorize_event(db, event_id, current, rbac.P_EVENT_VIEW)
        return await get_translations(db, event)

    @router.post("/api/events/{event_id}/translate")
    async def translate(event_id: str, body: Dict[str, Any] = Body(...), current=Depends(get_current_buyer)):
        await _gate()
        event = await rbac.authorize_event(db, event_id, current, rbac.P_BUILDER_EDIT)
        return await translate_event(db, event, (body or {}).get("language", ""), actor=current)

    return router
