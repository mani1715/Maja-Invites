"""Seed 6 starter accounts into a fresh database (idempotent — safe to re-run).

Creates:
  ADMINS (Super-Admin panel  → /super-admin login):
    admin1@majainvites.com  / Admin@1234
    admin2@majainvites.com  / Admin@1234
  PHOTOGRAPHERS (Studio panel → /studio login):
    studio1@majainvites.com / Studio@1234   (username: studio1)
    studio2@majainvites.com / Studio@1234   (username: studio2)
  NORMAL USERS (home Sign in):
    user1@majainvites.com   / User@1234
    user2@majainvites.com   / User@1234

Both admins and photographers live in the `admins` collection, separated by
`role`: "super_admin" = platform owner, "admin" = photographer studio.
Normal users live in the `users` collection.

Run inside the backend (`core`) container:
    docker compose -f docker-compose.yml -f docker-compose.deploy.yml \
        run --rm core python scripts/seed_accounts.py

CHANGE THESE PASSWORDS after first login.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, "/app/backend")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pg_adapter import Database  # noqa: E402
from auth import get_password_hash  # noqa: E402  (bcrypt via passlib — same hashing the app uses)

ADMINS = [
    {"email": "admin1@majainvites.com", "username": "admin1", "name": "Admin One", "password": "Admin@1234", "role": "super_admin"},
    {"email": "admin2@majainvites.com", "username": "admin2", "name": "Admin Two", "password": "Admin@1234", "role": "super_admin"},
    {"email": "studio1@majainvites.com", "username": "studio1", "name": "Studio One", "password": "Studio@1234", "role": "admin", "business_name": "Studio One"},
    {"email": "studio2@majainvites.com", "username": "studio2", "name": "Studio Two", "password": "Studio@1234", "role": "admin", "business_name": "Studio Two"},
]

USERS = [
    {"email": "user1@majainvites.com", "name": "User One", "password": "User@1234", "phone": "+919999900001"},
    {"email": "user2@majainvites.com", "name": "User Two", "password": "User@1234", "phone": "+919999900002"},
]


async def main():
    db = await Database.connect(os.environ["SUPABASE_DB_URL"])
    now = datetime.now(timezone.utc).isoformat()

    for a in ADMINS:
        doc = {
            "id": str(uuid.uuid4()),
            "email": a["email"].lower(),
            "username": a["username"].lower(),
            "name": a["name"],
            "password_hash": get_password_hash(a["password"]),
            "role": a["role"],
            "status": "active",
            "is_suspended": False,
            "is_verified": True,
            "email_verified": True,
            "phone_verified": True,
            "self_signup": False,
            "created_by": None,
            "created_at": now,
            "updated_at": now,
        }
        if a.get("business_name"):
            doc["business_name"] = a["business_name"]
        existing = await db.admins.find_one({"email": doc["email"]})
        if existing:
            await db.admins.update_one(
                {"email": doc["email"]},
                {"$set": {"password_hash": doc["password_hash"], "role": a["role"],
                          "status": "active", "is_suspended": False,
                          "email_verified": True, "phone_verified": True, "updated_at": now}},
            )
            print(f"[OK] updated admin ({a['role']:11}) {doc['email']} / {a['password']}")
        else:
            await db.admins.insert_one(doc)
            print(f"[OK] created admin ({a['role']:11}) {doc['email']} / {a['password']}")

    for u in USERS:
        doc = {
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": u["email"].lower(),
            "name": u["name"],
            "phone": u.get("phone"),
            "picture": None,
            "password_hash": get_password_hash(u["password"]),
            "auth_provider": "password",
            "is_verified": True,
            "email_verified": True,
            "phone_verified": True,
            "created_at": now,
            "updated_at": now,
        }
        existing = await db.users.find_one({"email": doc["email"]})
        if existing:
            await db.users.update_one(
                {"email": doc["email"]},
                {"$set": {"password_hash": doc["password_hash"],
                          "email_verified": True, "phone_verified": True, "updated_at": now}},
            )
            print(f"[OK] updated user  (normal_user) {doc['email']} / {u['password']}")
        else:
            await db.users.insert_one(doc)
            print(f"[OK] created user  (normal_user) {doc['email']} / {u['password']}")

    await db.close()
    print("\nDone. 2 admins + 2 photographers + 2 users seeded. CHANGE THESE PASSWORDS after first login.")


if __name__ == "__main__":
    asyncio.run(main())
