"""
GST tax-invoice service.

Generates GST-compliant invoice records + PDFs for credit/pack purchases.
- Sequential invoice numbers via an atomic counter (db.counters).
- Intra-state (CGST+SGST) vs inter-state (IGST) split, rate configurable.
- PDF rendered on demand (reportlab) from the stored record — no file storage.
- Download protected by a per-invoice capability token (safe to put in an email
  link) so PII isn't publicly enumerable.

Seller details + rate come from env (see .env.example INVOICE_* / GST_RATE).
Replaces the old `invoice_url=None  # TODO` placeholder.
"""
from __future__ import annotations
import os
import io
import hmac
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

logger = logging.getLogger("invoice")


def _cfg() -> Dict[str, Any]:
    return {
        "seller_name": os.environ.get("INVOICE_SELLER_NAME", "MAJA Invites"),
        "seller_gstin": os.environ.get("INVOICE_SELLER_GSTIN", ""),
        "seller_address": os.environ.get("INVOICE_SELLER_ADDRESS", "India"),
        "seller_state": os.environ.get("INVOICE_SELLER_STATE", ""),
        "prefix": os.environ.get("INVOICE_PREFIX", "MAJA"),
        "gst_rate": float(os.environ.get("GST_RATE", "18")),
        "hsn_sac": os.environ.get("INVOICE_HSN_SAC", "998431"),  # online info services
        "frontend_url": os.environ.get("FRONTEND_URL", "http://localhost:3000"),
    }


async def _next_invoice_number(db) -> str:
    cfg = _cfg()
    now = datetime.now(timezone.utc)
    fy = now.year if now.month >= 4 else now.year - 1  # Indian FY starts April
    counter_id = f"invoice_{fy}"
    doc = await db.counters.find_one_and_update(
        {"_id": counter_id},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    # Motor returns the updated doc when return_document=True (ReturnDocument.AFTER
    # default differs by version) — fall back defensively.
    seq = (doc or {}).get("seq", 1) if doc else 1
    return f"{cfg['prefix']}/{fy}-{str(fy + 1)[-2:]}/{seq:05d}"


async def create_invoice(
    db, *, buyer_name: str, buyer_email: Optional[str], amount_inr: float,
    item_label: str, admin_id: Optional[str] = None, source_id: Optional[str] = None,
    buyer_state: Optional[str] = None,
) -> Dict[str, Any]:
    """Create + store a GST invoice record. `amount_inr` is the GROSS amount paid
    (GST-inclusive). Returns the stored record incl. `download_url`."""
    cfg = _cfg()
    rate = cfg["gst_rate"]
    gross = round(float(amount_inr or 0), 2)
    taxable = round(gross / (1 + rate / 100), 2) if rate else gross
    tax_total = round(gross - taxable, 2)

    seller_state = (cfg["seller_state"] or "").strip().lower()
    bstate = (buyer_state or "").strip().lower()
    intra_state = (not bstate) or (bstate == seller_state)  # default intra when unknown
    if intra_state:
        cgst = round(tax_total / 2, 2)
        sgst = round(tax_total - cgst, 2)
        igst = 0.0
    else:
        cgst = sgst = 0.0
        igst = tax_total

    number = await _next_invoice_number(db)
    rec = {
        "id": uuid.uuid4().hex,
        "number": number,
        "download_token": uuid.uuid4().hex,
        "buyer_name": buyer_name or "Customer",
        "buyer_email": buyer_email,
        "buyer_state": buyer_state,
        "admin_id": admin_id,
        "source_id": source_id,
        "item_label": item_label,
        "hsn_sac": cfg["hsn_sac"],
        "gst_rate": rate,
        "gross_amount": gross,
        "taxable_amount": taxable,
        "cgst": cgst, "sgst": sgst, "igst": igst, "tax_total": tax_total,
        "intra_state": intra_state,
        "seller_name": cfg["seller_name"],
        "seller_gstin": cfg["seller_gstin"],
        "seller_address": cfg["seller_address"],
        "seller_state": cfg["seller_state"],
        "created_at": datetime.now(timezone.utc),
    }
    await db.invoices.insert_one(dict(rec))
    rec.pop("_id", None)
    rec["download_url"] = (
        f"{cfg['frontend_url'].rstrip('/')}/api/invoices/{rec['id']}/download?t={rec['download_token']}"
    )
    return rec


def render_invoice_pdf(inv: Dict[str, Any]) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm,
                            leftMargin=18 * mm, rightMargin=18 * mm)
    styles = getSampleStyleSheet()
    h = ParagraphStyle("h", parent=styles["Title"], fontSize=18)
    small = ParagraphStyle("s", parent=styles["Normal"], fontSize=9, textColor=colors.grey)
    normal = styles["Normal"]
    created = inv.get("created_at")
    date_str = created.strftime("%d %b %Y") if hasattr(created, "strftime") else str(created)[:10]

    elements = [
        Paragraph("TAX INVOICE", h),
        Spacer(1, 4 * mm),
        Paragraph(f"<b>{inv['seller_name']}</b>", normal),
        Paragraph(inv.get("seller_address", ""), small),
        Paragraph(f"GSTIN: {inv.get('seller_gstin') or '—'}", small),
        Spacer(1, 6 * mm),
        Paragraph(f"Invoice No: <b>{inv['number']}</b> &nbsp;&nbsp; Date: {date_str}", normal),
        Paragraph(f"Billed to: {inv.get('buyer_name','Customer')}"
                  + (f" ({inv['buyer_email']})" if inv.get('buyer_email') else ""), normal),
        Spacer(1, 6 * mm),
    ]

    rate = inv.get("gst_rate", 18)
    rows = [["Description", "HSN/SAC", "Taxable (₹)", "GST", "Amount (₹)"]]
    if inv.get("intra_state"):
        gst_cell = f"CGST {rate/2:g}%: {inv['cgst']:.2f}\nSGST {rate/2:g}%: {inv['sgst']:.2f}"
    else:
        gst_cell = f"IGST {rate:g}%: {inv['igst']:.2f}"
    rows.append([inv.get("item_label", "Credits"), inv.get("hsn_sac", ""),
                 f"{inv['taxable_amount']:.2f}", gst_cell, f"{inv['gross_amount']:.2f}"])
    rows.append(["", "", "", "Total", f"₹{inv['gross_amount']:.2f}"])

    table = Table(rows, colWidths=[60 * mm, 22 * mm, 28 * mm, 38 * mm, 26 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#16110C")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#E8D5A3")),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTNAME", (-2, -1), (-1, -1), "Helvetica-Bold"),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 8 * mm))
    elements.append(Paragraph("Amount is inclusive of GST. This is a computer-generated invoice.", small))

    doc.build(elements)
    return buf.getvalue()


def build_invoice_router(db) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["invoices"])

    @router.get("/invoices/{invoice_id}/download")
    async def download_invoice(invoice_id: str, t: str = Query(...)):
        inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        # Constant-time token compare to avoid leaking the capability token via
        # response-timing. 404 (not 403) so invoice ids can't be enumerated.
        if not inv or not hmac.compare_digest(str(inv.get("download_token") or ""), str(t or "")):
            raise HTTPException(status_code=404, detail="Invoice not found")
        try:
            pdf = render_invoice_pdf(inv)
        except Exception as e:
            logger.exception("[invoice] render failed")
            raise HTTPException(status_code=500, detail="Could not render invoice")
        return StreamingResponse(
            io.BytesIO(pdf), media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="invoice-{inv["number"].replace("/", "-")}.pdf"'},
        )

    return router
