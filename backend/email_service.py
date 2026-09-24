"""
Email service — provider-agnostic transactional email.

Mirrors sms_service.py. Supports two real providers + a dev fallback that
NEVER fails (logs + stores the message in db.email_outbox) so the app works
with zero email config.

Provider auto-selected (override with EMAIL_PROVIDER=resend|smtp|dev):
  1. Resend  — set RESEND_API_KEY. Simplest hosted option.
  2. SMTP    — set SMTP_HOST + SMTP_USER + SMTP_PASS (+ SMTP_PORT, SMTP_TLS).
  3. Dev     — neither configured → log + email_outbox collection.

Common env:
  EMAIL_FROM       (e.g. "no-reply@majacreations.com")  — required for real sending
  EMAIL_FROM_NAME  (default "MAJA Invites")

Usage:
    from email_service import send_email, receipt_email
    subj, html, text = receipt_email(name="A", credits=10, amount_inr=499, ...)
    await send_email("a@b.com", subj, html, text=text, db=db, tags=["receipt"])

send_email never raises — always returns a dict; callers check `ok`.
"""
from __future__ import annotations
import os
import asyncio
import html
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


def _esc(value) -> str:
    """HTML-escape any user-controlled value before it goes into an email body,
    so a crafted name/label can't inject markup/script into the message."""
    return html.escape(str(value or ""), quote=True)

logger = logging.getLogger("email")

DEFAULT_FROM_NAME = "MAJA Invites"


# ---------------------------------------------------------------------------
# Provider detection
# ---------------------------------------------------------------------------
def _resend_configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY"))


def _smtp_configured() -> bool:
    return bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_USER")
                and os.environ.get("SMTP_PASS"))


def _selected_provider() -> str:
    forced = (os.environ.get("EMAIL_PROVIDER") or "").strip().lower()
    if forced in ("resend", "smtp", "dev"):
        return forced
    if _resend_configured():
        return "resend"
    if _smtp_configured():
        return "smtp"
    return "dev"


def email_provider_status() -> Dict[str, Any]:
    p = _selected_provider()
    return {
        "provider": p,
        "dev_mode": p == "dev",
        "from": os.environ.get("EMAIL_FROM", ""),
        "hint": None if p != "dev"
        else "Set RESEND_API_KEY or SMTP_HOST+SMTP_USER+SMTP_PASS (+ EMAIL_FROM) to send real email.",
    }


def _from_header() -> str:
    addr = os.environ.get("EMAIL_FROM", "no-reply@localhost")
    name = os.environ.get("EMAIL_FROM_NAME", DEFAULT_FROM_NAME)
    return f"{name} <{addr}>"


# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------
async def _send_via_resend(to: str, subject: str, html: str, text: Optional[str]) -> Dict[str, Any]:
    import httpx
    payload = {
        "from": _from_header(),
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"},
                json=payload,
            )
        if r.status_code in (200, 201):
            return {"ok": True, "provider": "resend", "dev_mode": False, "id": (r.json() or {}).get("id")}
        logger.warning("Resend non-success: %s %s", r.status_code, r.text[:200])
        return {"ok": False, "provider": "resend", "error": r.text[:200]}
    except Exception as e:
        logger.exception("Resend send failed")
        return {"ok": False, "provider": "resend", "error": str(e)[:200]}


def _smtp_send_blocking(to: str, subject: str, html: str, text: Optional[str]) -> Dict[str, Any]:
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ["SMTP_USER"]
    password = os.environ["SMTP_PASS"]
    # Accept every common spelling of "off". This used to compare against the
    # literal string "false" only, so SMTP_TLS=0 / no / off silently still tried
    # STARTTLS and the send died with "STARTTLS extension not supported".
    use_tls = (os.environ.get("SMTP_TLS", "true").strip().lower()
               not in ("false", "0", "no", "off", ""))

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = _from_header()
    msg["To"] = to
    if text:
        msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        with smtplib.SMTP(host, port, timeout=20) as server:
            if use_tls:
                server.starttls()
            server.login(user, password)
            server.sendmail(os.environ.get("EMAIL_FROM", user), [to], msg.as_string())
        return {"ok": True, "provider": "smtp", "dev_mode": False}
    except Exception as e:
        logger.exception("SMTP send failed")
        return {"ok": False, "provider": "smtp", "error": str(e)[:200]}


async def _store_outbox(db, to: str, subject: str, html: str, text: Optional[str],
                        tags: Optional[List[str]], outcome: Dict[str, Any]) -> None:
    if db is None:
        return
    try:
        await db.email_outbox.insert_one({
            "to": to, "subject": subject, "html": html, "text": text,
            "tags": tags or [], "outcome": outcome,
            "created_at": datetime.now(timezone.utc),
        })
    except Exception as e:
        logger.warning("[email] outbox store failed: %s", e)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
async def send_email(to: str, subject: str, html: str, text: Optional[str] = None,
                     db=None, tags: Optional[List[str]] = None) -> Dict[str, Any]:
    """Send an email. Never raises. Returns {ok, provider, dev_mode, ...}.

    In dev mode (no provider configured) it logs the email and, if `db` is
    given, stores it in `email_outbox` so it's inspectable during development.
    """
    if not to or not subject:
        return {"ok": False, "error": "Missing recipient or subject"}

    provider = _selected_provider()

    if provider == "resend":
        outcome = await _send_via_resend(to, subject, html, text)
    elif provider == "smtp":
        outcome = await asyncio.to_thread(_smtp_send_blocking, to, subject, html, text)
    else:
        logger.info("[email:dev] TO=%s SUBJECT=%s (no provider configured)", to, subject)
        outcome = {"ok": True, "provider": "dev", "dev_mode": True}

    # Always record dev-mode mail; record failures from real providers too.
    if provider == "dev" or not outcome.get("ok"):
        await _store_outbox(db, to, subject, html, text, tags, outcome)
    # Delivery observability (Phase 12) — log every send; the provider webhook
    # later fills in delivered/opened/bounced. Guarded + non-blocking.
    if db is not None:
        try:
            from delivery_tracking import record_send
            await record_send(db, "email", to, outcome.get("provider", provider),
                              message_id=outcome.get("id"), ok=bool(outcome.get("ok")),
                              dev=bool(outcome.get("dev_mode")), tags=tags)
        except Exception:
            pass
    return outcome


# ---------------------------------------------------------------------------
# Templates — return (subject, html, text)
# ---------------------------------------------------------------------------
def _wrap(title: str, body_html: str) -> str:
    return f"""<!doctype html><html><body style="margin:0;background:#0A0A0F;
      font-family:Inter,Arial,sans-serif;color:#FFF8DC;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#16110C;border-radius:12px;
        border:1px solid rgba(201,168,76,0.3);padding:28px;">
        <h1 style="font-size:20px;color:#E8D5A3;margin:0 0 16px;">{title}</h1>
        <div style="font-size:15px;line-height:1.6;color:rgba(255,248,220,0.85);">{body_html}</div>
        <p style="margin-top:24px;font-size:12px;color:rgba(255,248,220,0.45);">
          {DEFAULT_FROM_NAME} · Made in India</p>
      </div></body></html>"""


def receipt_email(name: str, credits: int, amount_inr: float,
                  order_id: str, invoice_url: Optional[str] = None) -> Tuple[str, str, str]:
    subject = f"Your {DEFAULT_FROM_NAME} payment receipt"
    nm = _esc(name) or 'there'
    inv = (f'<p><a href="{_esc(invoice_url)}" style="color:#E8D5A3;">Download your GST invoice (PDF)</a></p>'
           if invoice_url else "")
    body = (f"<p>Hi {nm},</p>"
            f"<p>Thanks for your purchase. We've added <b>{int(credits)} credits</b> to your account.</p>"
            f"<p>Amount paid: <b>₹{amount_inr:,.2f}</b><br/>Order: {_esc(order_id)}</p>{inv}")
    text = (f"Hi {name or 'there'},\n\nThanks for your purchase. {credits} credits added.\n"
            f"Amount paid: Rs {amount_inr:,.2f}\nOrder: {order_id}\n"
            + (f"Invoice: {invoice_url}\n" if invoice_url else ""))
    return subject, _wrap("Payment received", body), text


def password_reset_email(name: str, reset_link: str) -> Tuple[str, str, str]:
    subject = f"Reset your {DEFAULT_FROM_NAME} password"
    body = (f"<p>Hi {_esc(name) or 'there'},</p>"
            f"<p>We received a request to reset your password. This link expires in 30 minutes.</p>"
            f'<p><a href="{_esc(reset_link)}" style="background:#D4AF37;color:#16110C;padding:10px 18px;'
            f'border-radius:8px;text-decoration:none;">Reset password</a></p>'
            f"<p>If you didn't request this, you can ignore this email.</p>")
    text = (f"Hi {name or 'there'},\n\nReset your password (expires in 30 min):\n{reset_link}\n\n"
            f"If you didn't request this, ignore this email.")
    return subject, _wrap("Password reset", body), text


def gallery_ready_email(name: str, gallery_link: str) -> Tuple[str, str, str]:
    subject = f"Your photos are ready · {DEFAULT_FROM_NAME}"
    body = (f"<p>Hi {_esc(name) or 'there'},</p>"
            f"<p>Your event photos are ready to view and download.</p>"
            f'<p><a href="{_esc(gallery_link)}" style="background:#D4AF37;color:#16110C;padding:10px 18px;'
            f'border-radius:8px;text-decoration:none;">View gallery</a></p>')
    text = f"Hi {name or 'there'},\n\nYour photos are ready: {gallery_link}\n"
    return subject, _wrap("Your photos are ready", body), text
