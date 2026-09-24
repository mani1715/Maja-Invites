"""
pixora_dm.py — direct messages between studios in the Pixora community.

Closes the audit gap: the community had posts, connections and requests, but no
1:1 private conversation. This adds a small, self-contained DM system:

  * `pixora_dm_threads`  — one row per pair of studios: {id, key, participants[2],
    reads{sid: iso}, last_body, last_sender, updated_at, created_at}. `key` is the
    sorted "a|b" pair so a thread is created once and reused.
  * `pixora_dm_messages` — {id, thread_id, sender_id, body, created_at}.

Every function takes the caller's id (`me`) from the auth token and refuses to
touch a thread `me` is not a participant of — so one studio can never read or
post into another pair's conversation. Names shown in the thread list are resolved
the same way the rest of the community resolves a studio name (`_display_name`),
so they never drift.

    from pixora_dm import build_pixora_dm_router
    app.include_router(build_pixora_dm_router(db, get_current_admin))
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("pixora_dm")

MAX_BODY = 4000


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _key(a: str, b: str) -> str:
    return "|".join(sorted([a, b]))


async def _display_name(db, sid: str) -> str:
    doc = await db.admins.find_one({"admin_id": sid}, {"_id": 0}) or await db.admins.find_one({"id": sid}, {"_id": 0})
    return (doc or {}).get("studio_name") or (doc or {}).get("name") or "Studio"


async def get_or_create_thread(db, a: str, b: str) -> Dict[str, Any]:
    if a == b:
        raise ValueError("You can't message yourself.")
    k = _key(a, b)
    t = await db.pixora_dm_threads.find_one({"key": k}, {"_id": 0})
    if t:
        return t
    now = _now()
    # `reads` holds a per-participant SEQUENCE pointer (the last message seq each
    # has seen), not a timestamp — wall-clock resolution is too coarse on some
    # platforms to order messages sent milliseconds apart. `msg_count` is the
    # thread's monotonic message counter.
    doc = {"id": f"dm_{uuid.uuid4().hex[:14]}", "key": k,
           "participants": sorted([a, b]), "reads": {a: 0, b: 0}, "msg_count": 0,
           "last_body": "", "last_sender": "", "updated_at": now, "created_at": now}
    await db.pixora_dm_threads.insert_one(doc)
    return {kk: vv for kk, vv in doc.items() if kk != "_id"}


async def send_message(db, me: str, recipient_id: str, body: str) -> Dict[str, Any]:
    body = (body or "").strip()
    if not body:
        raise ValueError("Message can't be empty.")
    if len(body) > MAX_BODY:
        body = body[:MAX_BODY]
    if not recipient_id or recipient_id == me:
        raise ValueError("Pick someone to message.")
    # recipient must be a real studio
    rec = await db.admins.find_one({"admin_id": recipient_id}, {"_id": 0}) or await db.admins.find_one({"id": recipient_id}, {"_id": 0})
    if not rec:
        raise LookupError("Recipient not found.")

    thread = await get_or_create_thread(db, me, recipient_id)
    now = _now()
    seq = int(thread.get("msg_count") or 0) + 1
    msg = {"id": f"msg_{uuid.uuid4().hex[:14]}", "thread_id": thread["id"],
           "sender_id": me, "seq": seq, "body": body, "created_at": now}
    await db.pixora_dm_messages.insert_one(msg)
    # bump thread counter + mark my own read pointer to this seq (I've seen my own message)
    reads = dict(thread.get("reads") or {})
    reads[me] = seq
    await db.pixora_dm_threads.update_one(
        {"id": thread["id"]},
        {"$set": {"last_body": body[:200], "last_sender": me, "updated_at": now,
                  "msg_count": seq, "reads": reads}})
    return {kk: vv for kk, vv in msg.items() if kk != "_id"}


async def _threads_for(db, me: str) -> List[dict]:
    rows = await db.pixora_dm_threads.find({}, {"_id": 0}).to_list(5000)
    mine = [t for t in rows if me in (t.get("participants") or [])]
    mine.sort(key=lambda t: t.get("updated_at") or "", reverse=True)
    return mine


async def list_threads(db, me: str) -> Dict[str, Any]:
    out = []
    for t in await _threads_for(db, me):
        other = next((p for p in (t.get("participants") or []) if p != me), None)
        last_read = int((t.get("reads") or {}).get(me, 0) or 0)
        # unread = messages from the OTHER party beyond my last-read seq pointer
        msgs = await db.pixora_dm_messages.find({"thread_id": t["id"]}, {"_id": 0}).to_list(10000)
        unread = len([m for m in msgs if m.get("sender_id") != me and int(m.get("seq") or 0) > last_read])
        out.append({
            "id": t["id"], "other_id": other,
            "other_name": await _display_name(db, other) if other else "Studio",
            "last_body": t.get("last_body", ""), "last_sender": t.get("last_sender", ""),
            "updated_at": t.get("updated_at"), "unread": unread,
        })
    return {"threads": out, "unread_total": sum(t["unread"] for t in out)}


async def _assert_participant(db, me: str, thread_id: str) -> dict:
    t = await db.pixora_dm_threads.find_one({"id": thread_id}, {"_id": 0})
    if not t:
        raise LookupError("Conversation not found.")
    if me not in (t.get("participants") or []):
        raise PermissionError("Not your conversation.")
    return t


async def list_messages(db, me: str, thread_id: str, mark_read: bool = True) -> Dict[str, Any]:
    t = await _assert_participant(db, me, thread_id)
    msgs = await db.pixora_dm_messages.find({"thread_id": thread_id}, {"_id": 0}).to_list(10000)
    msgs.sort(key=lambda m: int(m.get("seq") or 0))
    if mark_read:
        reads = dict(t.get("reads") or {})
        reads[me] = int(t.get("msg_count") or 0)
        await db.pixora_dm_threads.update_one({"id": thread_id}, {"$set": {"reads": reads}})
    other = next((p for p in (t.get("participants") or []) if p != me), None)
    return {"thread_id": thread_id, "other_id": other,
            "other_name": await _display_name(db, other) if other else "Studio",
            "messages": [{"id": m["id"], "body": m.get("body", ""),
                          "mine": m.get("sender_id") == me,
                          "created_at": m.get("created_at")} for m in msgs]}


async def mark_read(db, me: str, thread_id: str) -> Dict[str, Any]:
    t = await _assert_participant(db, me, thread_id)
    reads = dict(t.get("reads") or {})
    reads[me] = int(t.get("msg_count") or 0)
    await db.pixora_dm_threads.update_one({"id": thread_id}, {"$set": {"reads": reads}})
    return {"ok": True}


async def unread_count(db, me: str) -> int:
    total = 0
    for t in await _threads_for(db, me):
        last_read = int((t.get("reads") or {}).get(me, 0) or 0)
        msgs = await db.pixora_dm_messages.find({"thread_id": t["id"]}, {"_id": 0}).to_list(10000)
        total += len([m for m in msgs if m.get("sender_id") != me and int(m.get("seq") or 0) > last_read])
    return total


class SendIn(BaseModel):
    recipient_id: str = Field(min_length=1)
    body: str = Field(min_length=1, max_length=MAX_BODY)


def _wrap(exc: Exception) -> HTTPException:
    if isinstance(exc, ValueError):
        return HTTPException(400, str(exc))
    if isinstance(exc, LookupError):
        return HTTPException(404, str(exc))
    if isinstance(exc, PermissionError):
        return HTTPException(403, str(exc))
    return HTTPException(500, "Messaging error")


def build_pixora_dm_router(db, get_current_admin) -> APIRouter:
    router = APIRouter(tags=["pixora-dm"])

    @router.get("/api/pixora/dm/threads")
    async def threads(me: str = Depends(get_current_admin)):
        return await list_threads(db, me)

    @router.get("/api/pixora/dm/unread")
    async def unread(me: str = Depends(get_current_admin)):
        return {"unread": await unread_count(db, me)}

    @router.post("/api/pixora/dm/send")
    async def send(payload: SendIn, me: str = Depends(get_current_admin)):
        try:
            return await send_message(db, me, payload.recipient_id, payload.body)
        except Exception as e:
            raise _wrap(e)

    @router.get("/api/pixora/dm/threads/{thread_id}")
    async def messages(thread_id: str, me: str = Depends(get_current_admin)):
        try:
            return await list_messages(db, me, thread_id)
        except Exception as e:
            raise _wrap(e)

    @router.post("/api/pixora/dm/threads/{thread_id}/read")
    async def read(thread_id: str, me: str = Depends(get_current_admin)):
        try:
            return await mark_read(db, me, thread_id)
        except Exception as e:
            raise _wrap(e)

    return router
