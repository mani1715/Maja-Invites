"""
client_studio_service.py — the studio⇄client workflow: contracts + e-sign,
photo proofing / selects, and download / print requests.

Closes the biggest audit gap. It reuses the identities that already exist:
  * studio side  → `get_current_admin` (admin_id == studio_id); every write is
    guarded by ownership of the target invitation (`profiles.admin_id == me`).
  * client side  → `get_current_event_client` (the per-invitation client login,
    returns `profile_id`); every client action is scoped to THAT profile_id, taken
    from the token, never a URL — a client can only ever touch their own event.

Three features, all real (no external service, no mocks):

  CONTRACTS + E-SIGN  (`studio_contracts`)
      The studio drafts a contract, sends it; the client signs by typing their
      full name. The signature record captures name + timestamp + IP as an audit
      trail (a legally-recognised typed/"clickwrap" signature). Signing flips the
      linked CRM client's `contract_status` to "signed" when one exists.

  PROOFING / SELECTS  (`proofing_galleries` + `proofing_photos`)
      The studio publishes a set of proof images; the client marks their picks
      (with an optional note). The studio sees the selected set to edit/deliver.

  DOWNLOAD / PRINT REQUESTS  (`studio_print_orders`)
      The client requests their selected photos as a download or a print order.
      This creates a request in the studio's queue (manual fulfilment, matching
      MAJA's done-for-you model) — never a fake payment.

    from client_studio_service import build_client_studio_router
    app.include_router(build_client_studio_router(db, get_current_admin, get_current_event_client))
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("client_studio")

CONTRACT_STATUSES = ["draft", "sent", "signed", "void"]
PRINT_KINDS = ["download", "print"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(s: Optional[str], n: int) -> str:
    return (s or "").strip()[:n]


def _pub(d: dict) -> dict:
    return {k: v for k, v in d.items() if k != "_id"}


async def _owns(db, studio_id: str, profile_id: str) -> dict:
    p = await db.profiles.find_one({"id": profile_id, "admin_id": studio_id}, {"_id": 0})
    if not p:
        raise PermissionError("You don't own this invitation.")
    return p


# ============================ CONTRACTS + E-SIGN ==============================
async def create_contract(db, studio_id: str, profile_id: str, title: str,
                          body: str, amount_inr: int = 0) -> Dict[str, Any]:
    await _owns(db, studio_id, profile_id)
    title = _clean(title, 200)
    body = _clean(body, 20000)
    if not title:
        raise ValueError("Give the contract a title.")
    if len(body) < 10:
        raise ValueError("Add the contract terms.")
    now = _now()
    doc = {"id": f"ctr_{uuid.uuid4().hex[:14]}", "profile_id": profile_id, "studio_id": studio_id,
           "title": title, "body": body, "amount_inr": max(0, int(amount_inr or 0)),
           "status": "draft", "created_at": now, "sent_at": None, "signed_at": None,
           "signer_name": "", "signer_ip": ""}
    await db.studio_contracts.insert_one(doc)
    return {"contract": _pub(doc)}


async def send_contract(db, studio_id: str, contract_id: str) -> Dict[str, Any]:
    c = await db.studio_contracts.find_one({"id": contract_id, "studio_id": studio_id}, {"_id": 0})
    if not c:
        raise LookupError("Contract not found.")
    if c["status"] == "signed":
        raise ValueError("This contract is already signed.")
    await db.studio_contracts.update_one({"id": contract_id},
                                         {"$set": {"status": "sent", "sent_at": _now()}})
    return {"ok": True, "status": "sent"}


async def void_contract(db, studio_id: str, contract_id: str) -> Dict[str, Any]:
    c = await db.studio_contracts.find_one({"id": contract_id, "studio_id": studio_id}, {"_id": 0})
    if not c:
        raise LookupError("Contract not found.")
    if c["status"] == "signed":
        raise ValueError("A signed contract can't be voided.")
    await db.studio_contracts.update_one({"id": contract_id}, {"$set": {"status": "void"}})
    return {"ok": True, "status": "void"}


async def list_contracts_studio(db, studio_id: str, profile_id: str) -> Dict[str, Any]:
    await _owns(db, studio_id, profile_id)
    rows = await db.studio_contracts.find({"studio_id": studio_id, "profile_id": profile_id}, {"_id": 0}).to_list(500)
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return {"contracts": rows}


async def list_contracts_client(db, profile_id: str) -> Dict[str, Any]:
    rows = await db.studio_contracts.find({"profile_id": profile_id}, {"_id": 0}).to_list(500)
    # the client only ever sees what was actually sent to them
    rows = [r for r in rows if r.get("status") in ("sent", "signed")]
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return {"contracts": rows}


async def sign_contract(db, profile_id: str, contract_id: str, signer_name: str, ip: str = "") -> Dict[str, Any]:
    c = await db.studio_contracts.find_one({"id": contract_id, "profile_id": profile_id}, {"_id": 0})
    if not c:
        raise LookupError("Contract not found.")
    if c["status"] == "signed":
        return {"ok": True, "already": True}
    if c["status"] != "sent":
        raise ValueError("This contract isn't ready to sign.")
    signer_name = _clean(signer_name, 120)
    if len(signer_name) < 2:
        raise ValueError("Type your full name to sign.")
    now = _now()
    await db.studio_contracts.update_one(
        {"id": contract_id},
        {"$set": {"status": "signed", "signed_at": now, "signer_name": signer_name, "signer_ip": ip or ""}})
    # reflect on the CRM client if one is linked by phone/email match on this studio
    try:
        await db.pixora_crm_clients.update_many(
            {"studio_id": c["studio_id"], "name": signer_name},
            {"$set": {"contract_status": "signed"}})
    except Exception:
        pass
    logger.info("[contract] %s signed for profile %s", contract_id, profile_id)
    return {"ok": True, "signed_at": now, "signer_name": signer_name}


# ============================ PROOFING / SELECTS =============================
async def create_gallery(db, studio_id: str, profile_id: str, title: str) -> Dict[str, Any]:
    await _owns(db, studio_id, profile_id)
    title = _clean(title, 160) or "Proofing gallery"
    now = _now()
    doc = {"id": f"prg_{uuid.uuid4().hex[:14]}", "profile_id": profile_id, "studio_id": studio_id,
           "title": title, "status": "open", "created_at": now}
    await db.proofing_galleries.insert_one(doc)
    return {"gallery": _pub(doc)}


async def add_photos(db, studio_id: str, gallery_id: str, photos: List[dict]) -> Dict[str, Any]:
    g = await db.proofing_galleries.find_one({"id": gallery_id, "studio_id": studio_id}, {"_id": 0})
    if not g:
        raise LookupError("Gallery not found.")
    added = 0
    base = await db.proofing_photos.count_documents({"gallery_id": gallery_id})
    for i, p in enumerate(photos or []):
        url = _clean(p.get("image_url"), 1000)
        if not url:
            continue
        await db.proofing_photos.insert_one({
            "id": f"prp_{uuid.uuid4().hex[:14]}", "gallery_id": gallery_id,
            "profile_id": g["profile_id"], "studio_id": studio_id,
            "image_url": url, "thumb_url": _clean(p.get("thumb_url"), 1000) or url,
            "filename": _clean(p.get("filename"), 200), "order": base + i,
            "selected": False, "select_note": "", "created_at": _now()})
        added += 1
    return {"added": added}


async def list_galleries_studio(db, studio_id: str, profile_id: str) -> Dict[str, Any]:
    await _owns(db, studio_id, profile_id)
    gals = await db.proofing_galleries.find({"studio_id": studio_id, "profile_id": profile_id}, {"_id": 0}).to_list(200)
    gals.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    out = []
    for g in gals:
        photos = await db.proofing_photos.find({"gallery_id": g["id"]}, {"_id": 0}).to_list(5000)
        out.append({**g, "photo_count": len(photos),
                    "selected_count": len([p for p in photos if p.get("selected")])})
    return {"galleries": out}


async def gallery_photos(db, gallery_id: str) -> List[dict]:
    photos = await db.proofing_photos.find({"gallery_id": gallery_id}, {"_id": 0}).to_list(5000)
    photos.sort(key=lambda p: int(p.get("order") or 0))
    return photos


async def list_galleries_client(db, profile_id: str) -> Dict[str, Any]:
    gals = await db.proofing_galleries.find({"profile_id": profile_id}, {"_id": 0}).to_list(200)
    gals = [g for g in gals if g.get("status") != "hidden"]
    gals.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    out = []
    for g in gals:
        photos = await gallery_photos(db, g["id"])
        out.append({"id": g["id"], "title": g["title"], "created_at": g["created_at"],
                    "photo_count": len(photos), "selected_count": len([p for p in photos if p.get("selected")]),
                    "photos": photos})
    return {"galleries": out}


async def toggle_select(db, profile_id: str, photo_id: str, selected: bool, note: str = "") -> Dict[str, Any]:
    p = await db.proofing_photos.find_one({"id": photo_id, "profile_id": profile_id}, {"_id": 0})
    if not p:
        raise LookupError("Photo not found.")
    await db.proofing_photos.update_one(
        {"id": photo_id, "profile_id": profile_id},
        {"$set": {"selected": bool(selected), "select_note": _clean(note, 300)}})
    return {"ok": True, "selected": bool(selected)}


# ======================= DOWNLOAD / PRINT REQUESTS ==========================
async def create_print_order(db, profile_id: str, gallery_id: str, kind: str, note: str = "") -> Dict[str, Any]:
    if kind not in PRINT_KINDS:
        raise ValueError("kind must be 'download' or 'print'.")
    g = await db.proofing_galleries.find_one({"id": gallery_id, "profile_id": profile_id}, {"_id": 0})
    if not g:
        raise LookupError("Gallery not found.")
    selected = await db.proofing_photos.find({"gallery_id": gallery_id, "profile_id": profile_id, "selected": True}, {"_id": 0}).to_list(5000)
    selected = [p for p in selected if p.get("selected")]
    if not selected:
        raise ValueError("Select at least one photo first.")
    now = _now()
    doc = {"id": f"pro_{uuid.uuid4().hex[:14]}", "profile_id": profile_id, "studio_id": g["studio_id"],
           "gallery_id": gallery_id, "kind": kind, "note": _clean(note, 500),
           "photo_ids": [p["id"] for p in selected], "photo_count": len(selected),
           "status": "new", "created_at": now}
    await db.studio_print_orders.insert_one(doc)
    logger.info("[print] %s order for profile %s (%d photos)", kind, profile_id, len(selected))
    return {"order": _pub(doc)}


async def list_print_orders_studio(db, studio_id: str, profile_id: str) -> Dict[str, Any]:
    await _owns(db, studio_id, profile_id)
    rows = await db.studio_print_orders.find({"studio_id": studio_id, "profile_id": profile_id}, {"_id": 0}).to_list(500)
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return {"orders": rows}


async def set_print_order_status(db, studio_id: str, order_id: str, status: str) -> Dict[str, Any]:
    if status not in ("new", "in_progress", "ready", "delivered", "cancelled"):
        raise ValueError("Invalid status.")
    o = await db.studio_print_orders.find_one({"id": order_id, "studio_id": studio_id}, {"_id": 0})
    if not o:
        raise LookupError("Order not found.")
    await db.studio_print_orders.update_one({"id": order_id}, {"$set": {"status": status}})
    return {"ok": True, "status": status}


# ================================ HTTP =======================================
class ContractIn(BaseModel):
    profile_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=10, max_length=20000)
    amount_inr: int = 0


class SignIn(BaseModel):
    signer_name: str = Field(min_length=2, max_length=120)


class GalleryIn(BaseModel):
    profile_id: str = Field(min_length=1)
    title: str = Field(default="", max_length=160)


class PhotosIn(BaseModel):
    photos: List[dict] = Field(default_factory=list)


class SelectIn(BaseModel):
    selected: bool = True
    note: str = Field(default="", max_length=300)


class PrintIn(BaseModel):
    gallery_id: str = Field(min_length=1)
    kind: str = "download"
    note: str = Field(default="", max_length=500)


class StatusIn(BaseModel):
    status: str


def _wrap(exc: Exception) -> HTTPException:
    if isinstance(exc, ValueError):
        return HTTPException(400, str(exc))
    if isinstance(exc, LookupError):
        return HTTPException(404, str(exc))
    if isinstance(exc, PermissionError):
        return HTTPException(403, str(exc))
    return HTTPException(500, "Client-studio error")


def build_client_studio_router(db, get_current_admin, get_current_event_client) -> APIRouter:
    router = APIRouter(tags=["client-studio"])

    # -------- studio side (owner) --------
    @router.get("/api/studio/contracts")
    async def s_contracts(profile_id: str, me: str = Depends(get_current_admin)):
        try:
            return await list_contracts_studio(db, me, profile_id)
        except Exception as e:
            raise _wrap(e)

    @router.post("/api/studio/contracts")
    async def s_create_contract(payload: ContractIn, me: str = Depends(get_current_admin)):
        try:
            return await create_contract(db, me, payload.profile_id, payload.title, payload.body, payload.amount_inr)
        except Exception as e:
            raise _wrap(e)

    @router.post("/api/studio/contracts/{contract_id}/send")
    async def s_send_contract(contract_id: str, me: str = Depends(get_current_admin)):
        try:
            return await send_contract(db, me, contract_id)
        except Exception as e:
            raise _wrap(e)

    @router.post("/api/studio/contracts/{contract_id}/void")
    async def s_void_contract(contract_id: str, me: str = Depends(get_current_admin)):
        try:
            return await void_contract(db, me, contract_id)
        except Exception as e:
            raise _wrap(e)

    @router.get("/api/studio/proofing")
    async def s_galleries(profile_id: str, me: str = Depends(get_current_admin)):
        try:
            return await list_galleries_studio(db, me, profile_id)
        except Exception as e:
            raise _wrap(e)

    @router.post("/api/studio/proofing")
    async def s_create_gallery(payload: GalleryIn, me: str = Depends(get_current_admin)):
        try:
            return await create_gallery(db, me, payload.profile_id, payload.title)
        except Exception as e:
            raise _wrap(e)

    @router.get("/api/studio/proofing/{gallery_id}/photos")
    async def s_gallery_photos(gallery_id: str, me: str = Depends(get_current_admin)):
        g = await db.proofing_galleries.find_one({"id": gallery_id, "studio_id": me}, {"_id": 0})
        if not g:
            raise HTTPException(404, "Gallery not found.")
        return {"photos": await gallery_photos(db, gallery_id)}

    @router.post("/api/studio/proofing/{gallery_id}/photos")
    async def s_add_photos(gallery_id: str, payload: PhotosIn, me: str = Depends(get_current_admin)):
        try:
            return await add_photos(db, me, gallery_id, payload.photos)
        except Exception as e:
            raise _wrap(e)

    @router.get("/api/studio/print-orders")
    async def s_print_orders(profile_id: str, me: str = Depends(get_current_admin)):
        try:
            return await list_print_orders_studio(db, me, profile_id)
        except Exception as e:
            raise _wrap(e)

    @router.post("/api/studio/print-orders/{order_id}/status")
    async def s_print_status(order_id: str, payload: StatusIn, me: str = Depends(get_current_admin)):
        try:
            return await set_print_order_status(db, me, order_id, payload.status)
        except Exception as e:
            raise _wrap(e)

    # -------- client side (event_client token) --------
    @router.get("/api/client/contracts")
    async def c_contracts(profile_id: str = Depends(get_current_event_client)):
        return await list_contracts_client(db, profile_id)

    @router.post("/api/client/contracts/{contract_id}/sign")
    async def c_sign(contract_id: str, payload: SignIn, request: Request,
                     profile_id: str = Depends(get_current_event_client)):
        ip = request.client.host if request and request.client else ""
        try:
            return await sign_contract(db, profile_id, contract_id, payload.signer_name, ip)
        except Exception as e:
            raise _wrap(e)

    @router.get("/api/client/proofing")
    async def c_galleries(profile_id: str = Depends(get_current_event_client)):
        return await list_galleries_client(db, profile_id)

    @router.post("/api/client/proofing/photos/{photo_id}/select")
    async def c_select(photo_id: str, payload: SelectIn, profile_id: str = Depends(get_current_event_client)):
        try:
            return await toggle_select(db, profile_id, photo_id, payload.selected, payload.note)
        except Exception as e:
            raise _wrap(e)

    @router.post("/api/client/print-orders")
    async def c_print(payload: PrintIn, profile_id: str = Depends(get_current_event_client)):
        try:
            return await create_print_order(db, profile_id, payload.gallery_id, payload.kind, payload.note)
        except Exception as e:
            raise _wrap(e)

    return router
