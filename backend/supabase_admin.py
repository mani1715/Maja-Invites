"""
Supabase Admin API client (server-only).

Used during the migrate-on-next-login flow to create Supabase Auth users from
existing MongoDB admins (whose passwords are currently bcrypt-hashed in
MongoDB). After a successful local bcrypt verification, the backend uses this
client to create the user in Supabase so they can subsequently sign in
directly via supabase-js.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

from supabase import create_client

logger = logging.getLogger("supabase_admin")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

_admin_client = None


def get_admin_client():
    """Lazy singleton of the Supabase admin client (service-role)."""
    global _admin_client
    if _admin_client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError(
                "Supabase admin client requires SUPABASE_URL and "
                "SUPABASE_SERVICE_ROLE_KEY env vars"
            )
        _admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _admin_client


def find_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Return the Supabase auth user matching `email` or None."""
    try:
        client = get_admin_client()
        # list_users supports filtering by email since supabase-auth-py 2.0
        # If the SDK doesn't expose a filter, paginate up to a reasonable cap.
        result = client.auth.admin.list_users()
        users = getattr(result, "users", None) or result
        target = email.strip().lower()
        for u in users:
            ue = (getattr(u, "email", None) or "").lower()
            if ue == target:
                return {"id": getattr(u, "id", None), "email": ue}
    except Exception as exc:
        logger.warning("Supabase list_users lookup failed: %s", exc)
    return None


def create_or_get_user(
    email: str,
    password: str,
    name: Optional[str] = None,
    phone: Optional[str] = None,
) -> Optional[str]:
    """Idempotently create a Supabase Auth user; return their Supabase user id.

    If the user already exists, returns their existing id (no password change).
    Returns None if creation failed.
    """
    email = email.strip().lower()
    try:
        client = get_admin_client()
        attrs: Dict[str, Any] = {
            "email": email,
            "password": password,
            "email_confirm": True,
        }
        if phone:
            attrs["phone"] = phone
            attrs["phone_confirm"] = True
        if name:
            attrs["user_metadata"] = {"name": name}

        res = client.auth.admin.create_user(attrs)
        user = getattr(res, "user", None)
        if user is not None:
            return getattr(user, "id", None)
    except Exception as exc:
        msg = str(exc).lower()
        # Idempotency: user already exists
        if "already" in msg or "registered" in msg or "exists" in msg:
            existing = find_user_by_email(email)
            if existing:
                return existing.get("id")
        logger.warning("Supabase create_user failed for %s: %s", email, exc)
    return None
