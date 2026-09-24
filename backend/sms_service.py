"""
SMS service — provider-agnostic OTP delivery for photographer signup.

Supports two real providers + a dev-mode fallback.

Configuration (read from environment):
  Provider auto-selected in this priority order:
    1. MSG91 — set MSG91_AUTH_KEY (and optionally MSG91_SENDER_ID,
       MSG91_OTP_TEMPLATE_ID).  Recommended for India (DLT-compliant, ~₹0.18/SMS).
    2. Twilio — set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER.
       Recommended for global / non-India phone numbers.
    3. Dev mode — when neither is configured, returns the OTP in the API
       response so signup still works during development.

Usage:
    from sms_service import send_otp_sms, sms_provider_status

    sent = send_otp_sms("+919876543210", "123456")
    # → {"ok": True, "provider": "msg91", "dev_mode": False}

The module never raises on misconfiguration — it logs the error and
returns ok=False so the API can decide what to do (typically: fall back
to dev mode so signup isn't blocked).
"""
from __future__ import annotations
import os
import logging
from typing import Dict, Any

import requests

logger = logging.getLogger("sms")

_MSG91_BASE = "https://control.msg91.com/api/v5"
_TWILIO_BASE = "https://api.twilio.com/2010-04-01/Accounts"


def _msg91_configured() -> bool:
    return bool(os.environ.get("MSG91_AUTH_KEY"))


def _twilio_configured() -> bool:
    return bool(os.environ.get("TWILIO_ACCOUNT_SID")
                 and os.environ.get("TWILIO_AUTH_TOKEN")
                 and os.environ.get("TWILIO_FROM_NUMBER"))


def sms_provider_status() -> Dict[str, Any]:
    """Public status helper — surface which provider (if any) is active."""
    if _msg91_configured():
        return {"provider": "msg91", "configured": True, "dev_mode": False}
    if _twilio_configured():
        return {"provider": "twilio", "configured": True, "dev_mode": False}
    return {"provider": "none", "configured": False, "dev_mode": True,
            "hint": "Set MSG91_AUTH_KEY or TWILIO_ACCOUNT_SID+TWILIO_AUTH_TOKEN+TWILIO_FROM_NUMBER to send real SMS."}


def _send_via_msg91(phone: str, otp: str) -> Dict[str, Any]:
    """Send OTP via MSG91 OTP API.

    Phone format: digits only with country code (e.g. 919876543210 — strip '+').
    Requires MSG91_AUTH_KEY.  Optional: MSG91_OTP_TEMPLATE_ID, MSG91_SENDER_ID.
    """
    auth_key = os.environ["MSG91_AUTH_KEY"]
    template_id = os.environ.get("MSG91_OTP_TEMPLATE_ID")
    sender_id = os.environ.get("MSG91_SENDER_ID", "MAJACR")
    clean_phone = phone.lstrip("+").replace(" ", "")
    params = {
        "authkey": auth_key,
        "mobile": clean_phone,
        "otp": otp,
        "sender": sender_id,
    }
    if template_id:
        params["template_id"] = template_id
    try:
        r = requests.get(f"{_MSG91_BASE}/otp", params=params, timeout=10)
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text}
        if r.status_code == 200 and (data.get("type") == "success" or data.get("message")):
            return {"ok": True, "provider": "msg91", "dev_mode": False, "details": data}
        logger.warning("MSG91 returned non-success: %s %s", r.status_code, data)
        return {"ok": False, "provider": "msg91", "error": str(data)[:200]}
    except Exception as e:
        logger.exception("MSG91 send failed")
        return {"ok": False, "provider": "msg91", "error": str(e)[:200]}


def _send_via_twilio(phone: str, otp: str) -> Dict[str, Any]:
    """Send OTP via Twilio SMS API.

    Phone format: E.164 with leading + (e.g. +919876543210).
    """
    sid = os.environ["TWILIO_ACCOUNT_SID"]
    token = os.environ["TWILIO_AUTH_TOKEN"]
    from_number = os.environ["TWILIO_FROM_NUMBER"]
    body = f"Your MAJA Invites verification code is {otp}. Valid for 10 minutes."
    try:
        r = requests.post(
            f"{_TWILIO_BASE}/{sid}/Messages.json",
            auth=(sid, token),
            data={"From": from_number, "To": phone, "Body": body},
            timeout=10,
        )
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text}
        if r.status_code in (200, 201) and data.get("sid"):
            return {"ok": True, "provider": "twilio", "dev_mode": False, "sid": data["sid"]}
        logger.warning("Twilio returned non-success: %s %s", r.status_code, data)
        return {"ok": False, "provider": "twilio", "error": str(data)[:200]}
    except Exception as e:
        logger.exception("Twilio send failed")
        return {"ok": False, "provider": "twilio", "error": str(e)[:200]}


def send_otp_sms(phone: str, otp: str) -> Dict[str, Any]:
    """Send `otp` to `phone`.  Returns a dict describing the outcome.

    Never raises — always returns a dict.  Callers should check `ok`.
    """
    if not phone or not otp:
        return {"ok": False, "error": "Missing phone or otp"}
    if _msg91_configured():
        return _send_via_msg91(phone, otp)
    if _twilio_configured():
        return _send_via_twilio(phone, otp)
    # Dev mode — nothing to send, OTP is returned in API response by caller
    return {"ok": True, "provider": "none", "dev_mode": True}
