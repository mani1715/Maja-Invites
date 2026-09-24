"""
Self-test for invitation translation (Spec 05 §21).

    cd backend && python -m tests.test_event_translation

Uses an injected fake translator (no AI key / network). Proves supported-language
gating, storage under events.translations[lang], the empty-content guard, and
graceful degradation when the translator is unavailable.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ["STORAGE_CRED_KEY"] = Fernet.generate_key().decode()

from fastapi import HTTPException
from tests.test_storage_orchestrator import FakeDB
import event_schema as schema
import event_registry as registry
import event_lifecycle_service as life
import event_translation_service as tr


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


OWNER = {"user_id": "o1", "kind": "user"}


async def _fake_translate(content, lang):
    return {k: f"[{lang}] {v}" for k, v in content.items()}


async def _boom(content, lang):
    raise RuntimeError("no AI key")


async def run():
    db = FakeDB()
    await schema.ensure_schema(db)
    await registry.seed_event_registry(db)
    ev = await life.create_draft(db, OWNER, "ganesh_chaturthi")
    eid = ev["event_id"]

    print("1. empty content guard")
    fresh = await db.events.find_one({"event_id": eid})
    try:
        await tr.translate_event(db, fresh, "te", translator=_fake_translate)
        _check(False, "should refuse empty content")
    except HTTPException as e:
        _check(e.status_code == 422, "nothing to translate → 422")

    await life.autosave(db, eid, OWNER, {
        "event_information": {"event_name": "Sri Vinayaka Utsav"},
        "invitation_content": {"heading": "You are invited", "welcome_message": "Join us"}})
    event = await db.events.find_one({"event_id": eid})

    print("2. supported languages")
    langs = tr.supported_languages(event)
    _check("te" in langs and "hi" in langs, "registry supplies supported languages")

    print("3. translate stores under events.translations")
    res = await tr.translate_event(db, event, "te", translator=_fake_translate)
    _check(res["translated"] and "heading" in res["fields"], "translation returned fields")
    ev2 = await db.events.find_one({"event_id": eid})
    _check(ev2["translations"]["te"]["heading"].startswith("[te]"), "Telugu stored on the event")
    avail = await tr.get_translations(db, ev2)
    _check("te" in avail["available"], "get_translations lists it")

    print("4. unsupported language rejected")
    try:
        await tr.translate_event(db, event, "zz", translator=_fake_translate)
        _check(False, "should reject unsupported language")
    except HTTPException as e:
        _check(e.status_code == 422, "unsupported language → 422")

    print("5. graceful when AI unavailable")
    g = await tr.translate_event(db, event, "hi", translator=_boom)
    _check(g["translated"] is False and g["reason"] == "translation_unavailable",
           "AI failure degrades gracefully (no crash)")

    print("\nALL TRANSLATION TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
