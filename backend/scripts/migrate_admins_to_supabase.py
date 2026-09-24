"""
One-shot migration: MongoDB admins → Supabase Auth.

Behaviour
---------
- Reads every doc from `db.admins`.
- For each one, ensures a matching Supabase Auth user exists.
- Backfills `supabase_user_id` on the MongoDB doc for fast lookup.
- Skips admins that are already linked (idempotent — safe to re-run).

Password strategy
-----------------
The legacy app stores **bcrypt** hashes. Supabase will only accept bcrypt
hashes via the `password_hash` parameter on `auth.admin.create_user` when the
input is recognised as bcrypt — which `auth_supabase`/our admin client does
support. If a hash is rejected (unknown format), we fall back to creating the
Supabase user with a random temporary password and flag the admin doc with
`supabase_requires_password_reset=true` so the UI can prompt them.

Either way the user can always log in via:
  1. Legacy email + password (still works — MongoDB bcrypt).
  2. Magic link (recommended for migrated users) — no password needed.
  3. Resetting their Supabase password via the standard reset flow.

Usage
-----
    cd /app/backend && python scripts/migrate_admins_to_supabase.py [--dry-run]

Env required (already in /app/backend/.env)
-------------------------------------------
    MONGO_URL, DB_NAME
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
from __future__ import annotations

import argparse
import asyncio
import os
import secrets
import sys
import time
from pathlib import Path
from typing import Any, Dict, Optional

# Load /app/backend/.env so env vars are available regardless of CWD
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

# Make sure we can import the backend's own modules
sys.path.insert(0, str(ROOT))

# DEPRECATED/OBSOLETE: one-time Mongo->Supabase admin migrator. The platform is
# now Postgres-only and pre-launch (no data to migrate), so motor is no longer a
# dependency. Import is guarded so this file never breaks the package; it cannot
# run without the (removed) motor driver, which is intentional.
try:
    from motor.motor_asyncio import AsyncIOMotorClient  # type: ignore  # noqa: E402
except Exception:  # pragma: no cover - motor removed (Postgres-only)
    AsyncIOMotorClient = None

import supabase_admin as supa_admin  # noqa: E402


def _is_bcrypt(h: Optional[str]) -> bool:
    return isinstance(h, str) and h.startswith(("$2a$", "$2b$", "$2y$"))


async def migrate_one(admin: Dict[str, Any], dry_run: bool) -> Dict[str, Any]:
    """Migrate a single admin. Returns a small result dict."""
    email = (admin.get("email") or "").strip().lower()
    if not email:
        return {"status": "skip", "reason": "no email", "id": admin.get("id")}

    existing_sb_id = admin.get("supabase_user_id")
    if existing_sb_id:
        return {"status": "already_linked", "email": email, "sb_id": existing_sb_id}

    if dry_run:
        return {"status": "would_migrate", "email": email}

    client = supa_admin.get_admin_client()

    # 1) Does the Supabase user already exist (e.g. previous login auto-migrated)?
    sb_user_id: Optional[str] = None
    try:
        # supabase-py has no direct "find by email" — but list_users supports a per-page query.
        # Iterate first page; in practice all admins fit in <100.
        page = client.auth.admin.list_users()
        users = getattr(page, "users", None) or page or []
        for u in users:
            if (u.email or "").lower() == email:
                sb_user_id = u.id
                break
    except Exception as e:  # noqa: BLE001
        print(f"  [warn] list_users failed: {e}")

    requires_reset = False
    if not sb_user_id:
        # 2) Create the user. Try bcrypt-hash import first; fall back to random pw.
        legacy_hash = admin.get("password_hash")
        try:
            if _is_bcrypt(legacy_hash):
                resp = client.auth.admin.create_user({
                    "email": email,
                    "password_hash": legacy_hash,
                    "email_confirm": True,
                    "user_metadata": {
                        "name": admin.get("name") or email.split("@")[0],
                        "migrated_from_mongo": True,
                        "legacy_admin_id": admin.get("id"),
                        "role": admin.get("role", "admin"),
                    },
                })
                sb_user_id = resp.user.id if resp and resp.user else None
            else:
                # Unknown hash — fall through to random password + reset flag
                raise ValueError("non-bcrypt hash; using temporary password")
        except Exception as e:  # noqa: BLE001
            # Retry with a random password — user will sign in via magic link / reset
            try:
                tmp_pw = f"Tmp_{secrets.token_urlsafe(18)}"
                resp = client.auth.admin.create_user({
                    "email": email,
                    "password": tmp_pw,
                    "email_confirm": True,
                    "user_metadata": {
                        "name": admin.get("name") or email.split("@")[0],
                        "migrated_from_mongo": True,
                        "legacy_admin_id": admin.get("id"),
                        "role": admin.get("role", "admin"),
                        "password_pending_reset": True,
                    },
                })
                sb_user_id = resp.user.id if resp and resp.user else None
                requires_reset = True
                print(f"  [info] {email}: bcrypt-import failed ({e}); used temp pw")
            except Exception as e2:  # noqa: BLE001
                return {"status": "error", "email": email, "reason": str(e2)}

    if not sb_user_id:
        return {"status": "error", "email": email, "reason": "no sb_user_id"}

    # 3) Backfill MongoDB
    update = {
        "supabase_user_id": sb_user_id,
        "supabase_migrated_at": int(time.time()),
    }
    if requires_reset:
        update["supabase_requires_password_reset"] = True
    await db.admins.update_one({"id": admin["id"]}, {"$set": update})
    return {"status": "migrated", "email": email, "sb_id": sb_user_id, "requires_reset": requires_reset}


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ.get("DB_NAME", "test_database")
    client = AsyncIOMotorClient(mongo_url)
    global db
    db = client[db_name]

    total = await db.admins.count_documents({})
    print(f"Found {total} admins in MongoDB. dry_run={args.dry_run}\n")

    results = {"migrated": 0, "already_linked": 0, "skip": 0, "error": 0, "would_migrate": 0}
    async for admin in db.admins.find({}):
        res = await migrate_one(admin, dry_run=args.dry_run)
        status = res.get("status", "error")
        results[status] = results.get(status, 0) + 1
        marker = {
            "migrated": "[+]",
            "already_linked": "[=]",
            "would_migrate": "[?]",
            "skip": "[/]",
            "error": "[x]",
        }.get(status, "[?]")
        print(f"  {marker} {res}")

    print("\nSummary:")
    for k, v in results.items():
        print(f"  {k}: {v}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
