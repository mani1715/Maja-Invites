"""Create ONE account (photographer by default) directly in Postgres.

Idempotent: if the email already exists, the password / status are reset rather
than a duplicate row inserted.

    python backend/scripts/create_photographer.py --email s@x.com --password 'Pw@1234' --name "Studio X"
    python backend/scripts/create_photographer.py --email root@x.com --password '...' --role super_admin

Only two personas exist on this platform: photographer (`role=admin`) and
super-admin (`role=super_admin`). Normal user accounts are retired — do not
add a third branch here.
"""
import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env")

from auth import get_password_hash  # noqa: E402  (bcrypt via passlib — same hashing the app uses)
from models import Admin, AdminRole, AdminStatus  # noqa: E402
from pg_adapter import Database  # noqa: E402


async def create(email: str, password: str, name: str, role: str, username: str | None):
    db = await Database.connect(os.environ["SUPABASE_DB_URL"])
    try:
        email = email.lower().strip()
        now = datetime.now(timezone.utc).isoformat()

        existing = await db.admins.find_one({"email": email})
        if existing:
            await db.admins.update_one(
                {"email": email},
                {"$set": {"password_hash": get_password_hash(password),
                          "role": role, "status": AdminStatus.ACTIVE.value,
                          "is_suspended": False, "updated_at": now}},
            )
            print(f"[OK] updated existing {role}: {email}")
            return

        # Username collides independently of email — login accepts either.
        if username:
            username = username.lower().strip()
            if await db.admins.find_one({"username": username}):
                raise SystemExit(f"username already taken: {username}")

        admin = Admin(
            email=email,
            password_hash=get_password_hash(password),
            name=name,
            role=AdminRole(role),
            status=AdminStatus.ACTIVE,
            username=username,
            self_signup=False,
        )
        doc = admin.model_dump(mode="json")
        doc["email_verified"] = True
        doc["is_suspended"] = False
        doc["updated_at"] = now
        await db.admins.insert_one(doc)
        print(f"[OK] created {role}: {email}  (id={admin.id})")
    finally:
        await db.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--email", required=True)
    p.add_argument("--password", required=True)
    p.add_argument("--name", default="New Studio")
    p.add_argument("--username", default=None)
    p.add_argument("--role", default="admin", choices=["admin", "super_admin"])
    a = p.parse_args()
    asyncio.run(create(a.email, a.password, a.name, a.role, a.username))
