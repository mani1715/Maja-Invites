"""Create the login Razorpay's verification team uses to review our checkout.

Razorpay's "Submit details for verification" form asks for a test account on OUR
site so their reviewer can sign in and walk the payment flow themselves.

Why this is a dedicated script and not one of the seeded test accounts:
`scripts/seed_test_accounts.py` stamps `is_test=True`, and a test buyer SKIPS
Razorpay entirely — `store_features.create_order` marks the order paid and never
opens checkout. Handing a reviewer that account guarantees they never see a
payment screen, which is the one thing they are checking for. This account is
therefore a plain buyer with NO `is_test` flag, so it goes through real Razorpay
exactly like a customer.

It is a NORMAL USER (couple/buyer), not an admin: reviewers only need to reach
checkout, and a review login should never carry studio or super-admin rights.

Run (production, from ~/wedding-36/microservices):
    DC="docker compose -f docker-compose.yml -f docker-compose.deploy.yml"
    $DC run --rm core python scripts/seed_razorpay_reviewer.py

Re-running only resets the password — it never creates a duplicate.

Override the defaults with env vars if you want your own values:
    RZP_REVIEW_EMAIL, RZP_REVIEW_PASSWORD

AFTER Razorpay finishes verification, disable this login:
    $DC run --rm core python scripts/seed_razorpay_reviewer.py --disable
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, "/app/backend")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pg_adapter import Database  # noqa: E402
from auth import get_password_hash  # noqa: E402

EMAIL = os.getenv("RZP_REVIEW_EMAIL", "razorpay.review@majainvites.com").lower()
PASSWORD = os.getenv("RZP_REVIEW_PASSWORD", "RzpReview@2026")
NAME = "Razorpay Verification"
PHONE = "+919000000099"


async def main() -> None:
    disable = "--disable" in sys.argv
    dsn = os.environ.get("SUPABASE_DB_URL")
    if not dsn:
        print("ERROR: SUPABASE_DB_URL is not set.")
        sys.exit(1)

    db = await Database.connect(dsn)
    now = datetime.now(timezone.utc).isoformat()
    existing = await db.users.find_one({"email": EMAIL})

    if disable:
        if not existing:
            print(f"[--] no such account: {EMAIL}")
        else:
            # `status=blocked` is what user_auth.py enforces on every request, so
            # this kills live sessions too, not just new logins.
            await db.users.update_one({"email": EMAIL},
                                      {"$set": {"status": "blocked", "updated_at": now}})
            print(f"[OK] disabled {EMAIL} - the reviewer login can no longer sign in.")
        await db.close()
        return

    doc = {
        "user_id": f"user_{uuid.uuid4().hex[:12]}",
        "email": EMAIL,
        "name": NAME,
        "phone": PHONE,
        "picture": None,
        "password_hash": get_password_hash(PASSWORD),
        "auth_provider": "password",
        # Verified so the reviewer is never stopped by an OTP/verification wall.
        "is_verified": True,
        "email_verified": True,
        "phone_verified": True,
        "status": "active",
        # NO is_test FLAG ON PURPOSE - see the module docstring. With it, orders
        # are comped and Razorpay checkout never opens.
        "created_at": now,
        "updated_at": now,
    }

    if existing:
        await db.users.update_one(
            {"email": EMAIL},
            {"$set": {"password_hash": doc["password_hash"], "status": "active",
                      "email_verified": True, "phone_verified": True,
                      "is_verified": True, "updated_at": now}},
        )
        print(f"[OK] reset the existing reviewer login: {EMAIL}")
    else:
        await db.users.insert_one(doc)
        print(f"[OK] created reviewer login: {EMAIL}")

    # Fail loudly if the account would silently bypass checkout.
    row = await db.users.find_one({"email": EMAIL}, {"_id": 0})
    if row.get("is_test"):
        print("[!!] WARNING: this account carries is_test=True, so it will SKIP "
              "Razorpay checkout. Clear that flag before sending it to Razorpay.")

    print("\n  Give Razorpay these:")
    print(f"    Website  : https://majainvites.com/")
    print(f"    Username : {EMAIL}")
    print(f"    Password : {PASSWORD}")
    print("\n  Disable it after verification:")
    print("    python scripts/seed_razorpay_reviewer.py --disable")

    await db.close()


asyncio.run(main())
