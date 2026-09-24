"""
Initialize / update the platform Super Admin account.

Idempotent:
- If a Super Admin with the configured email or username already exists,
  this script UPDATES name + username + password_hash to match the current
  config (no more "already exists, skipping" footgun).
- Otherwise it creates one.

Defaults (per owner request): username `Mani_8328`, password `Maneesh@1234`.
Override via env vars SUPER_ADMIN_USERNAME / SUPER_ADMIN_PASSWORD / SUPER_ADMIN_EMAIL.
"""

import asyncio
import os
from pg_adapter import Database
from dotenv import load_dotenv
from pathlib import Path

from auth import get_password_hash
from models import Admin, AdminRole, AdminStatus

load_dotenv(Path(__file__).parent / ".env")


async def init_super_admin():
    # Mongo is gone; these two env lookups are migration leftovers that are never
    # used but raised KeyError('MONGO_URL') and made this script unrunnable.
    db = await Database.connect(os.environ["SUPABASE_DB_URL"])
    admins = db["admins"]

    SUPER_ADMIN_USERNAME = os.environ.get("SUPER_ADMIN_USERNAME", "mani_8328").lower()
    SUPER_ADMIN_EMAIL = os.environ.get("SUPER_ADMIN_EMAIL", f"{SUPER_ADMIN_USERNAME}@majacreations.com").lower()
    SUPER_ADMIN_PASSWORD = os.environ.get("SUPER_ADMIN_PASSWORD", "Maneesh@1234")
    SUPER_ADMIN_NAME = os.environ.get("SUPER_ADMIN_NAME", "Platform Owner")

    existing = await admins.find_one(
        {"$or": [{"email": SUPER_ADMIN_EMAIL}, {"username": SUPER_ADMIN_USERNAME}], "role": AdminRole.SUPER_ADMIN.value}
    )

    if existing:
        await admins.update_one(
            {"id": existing["id"]},
            {"$set": {
                "username": SUPER_ADMIN_USERNAME,
                "email": SUPER_ADMIN_EMAIL,
                "name": SUPER_ADMIN_NAME,
                "password_hash": get_password_hash(SUPER_ADMIN_PASSWORD),
                "status": AdminStatus.ACTIVE.value,
            }},
        )
        print("✅ Super Admin updated:")
        print(f"   id        = {existing['id']}")
        print(f"   username  = {SUPER_ADMIN_USERNAME}")
        print(f"   email     = {SUPER_ADMIN_EMAIL}")
        print(f"   password  = {SUPER_ADMIN_PASSWORD}")
    else:
        super_admin = Admin(
            email=SUPER_ADMIN_EMAIL,
            password_hash=get_password_hash(SUPER_ADMIN_PASSWORD),
            name=SUPER_ADMIN_NAME,
            role=AdminRole.SUPER_ADMIN,
            status=AdminStatus.ACTIVE,
            total_credits=999999,
            used_credits=0,
            username=SUPER_ADMIN_USERNAME,
            phone_verified=True,
            self_signup=False,
            created_by=None,
        )
        await admins.insert_one(super_admin.model_dump())
        print("✅ Super Admin created:")
        print(f"   id        = {super_admin.id}")
        print(f"   username  = {SUPER_ADMIN_USERNAME}")
        print(f"   email     = {SUPER_ADMIN_EMAIL}")
        print(f"   password  = {SUPER_ADMIN_PASSWORD}")
        print(f"   name      = {SUPER_ADMIN_NAME}")

    await db.close()


if __name__ == "__main__":
    asyncio.run(init_super_admin())
