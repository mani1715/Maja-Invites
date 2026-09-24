"""Seed deterministic test accounts for end-to-end regression.

Creates (idempotent — re-runs are safe):
  - Photographer: photographer.test@majatest.com / TestPass@123
  - Normal user:  user.test@majatest.com        / TestPass@123

Both bypass OTP because we are inserting straight into Mongo.

Usage:
    python /app/backend/scripts/seed_test_accounts.py
"""
import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, '/app/backend')

from pg_adapter import Database
from passlib.context import CryptContext
import uuid

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def main():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    db = await Database.connect(os.environ["SUPABASE_DB_URL"])

    now = datetime.now(timezone.utc).isoformat()

    # ── Photographer (admin) ────────────────────────────────────────
    photographer = {
        "id": str(uuid.uuid4()),
        "email": "photographer.test@majatest.com",
        "username": "phototest",
        "name": "Test Photographer",
        "phone": "+919999999991",
        "password_hash": pwd_ctx.hash("TestPass@123"),
        "role": "super_admin",  # full panel access
        "status": "active",
        "is_suspended": False,
        "is_verified": True,
        "phone_verified": True,
        "email_verified": True,
        "business_name": "Test Studio",
        "credits": 100,
        "paid_links_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    existing = await db.admins.find_one({"email": photographer["email"]})
    if existing:
        await db.admins.update_one(
            {"email": photographer["email"]},
            {"$set": {
                "password_hash": photographer["password_hash"],
                "status": "active",
                "is_suspended": False,
                "phone_verified": True,
                "email_verified": True,
                "credits": max(int(existing.get("credits", 0) or 0), 100),
                "updated_at": now,
            }},
        )
        print(f"[OK] Photographer exists, password reset → photographer.test@majatest.com / TestPass@123")
    else:
        await db.admins.insert_one(photographer)
        print(f"[OK] Photographer created → photographer.test@majatest.com / TestPass@123")

    # ── Normal user ─────────────────────────────────────────────────
    user = {
        "user_id": f"user_{uuid.uuid4().hex[:12]}",
        "email": "user.test@majatest.com",
        "name": "Test User",
        "phone": "+919999999992",
        "picture": None,
        "password_hash": pwd_ctx.hash("TestPass@123"),
        "credits": 50,
        "auth_provider": "password",
        "is_verified": True,
        "email_verified": True,
        "phone_verified": True,
        "created_at": datetime.now(timezone.utc),
        "updated_at": now,
    }
    existing_user = await db.users.find_one({"email": user["email"]})
    if existing_user:
        await db.users.update_one(
            {"email": user["email"]},
            {"$set": {
                "password_hash": user["password_hash"],
                "credits": max(int(existing_user.get("credits", 0) or 0), 50),
                "email_verified": True,
                "phone_verified": True,
                "updated_at": now,
            }},
        )
        print(f"[OK] User exists, password reset → user.test@majatest.com / TestPass@123")
    else:
        await db.users.insert_one(user)
        print(f"[OK] User created → user.test@majatest.com / TestPass@123")

    await db.close()


if __name__ == "__main__":
    asyncio.run(main())
