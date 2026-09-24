"""
seed_review.py -- LOCAL REVIEW ONLY credentials + demo data so the owner can
log into every dashboard on the local stack (frontend-v2 :8127, backend :8001).

Idempotent: every write is find-then-update-or-insert, keyed by email / slug /
profile_id, so re-running never creates duplicates and always resets the
password to the documented one.

Refuses to run in production -- reuses seed_test_accounts._is_production(),
the SAME kill-switch the existing test-account seeder trusts.

Creates:
  1. Studio admin   review-studio@maja.local  (admins collection, role=admin)
                    MFA left unset (disabled) and status=active (never locked).
  2. Super admin    review-admin@maja.local   (admins collection, role=super_admin)
                    Same collection as #1, split only by `role` -- see auth.py
                    require_super_admin(). No env allowlist exists in this
                    codebase; role IS the mechanism.
  3. (RETIRED) Normal-user "couple" account (users collection, password
                    login via /api/users/login) -- PRODUCT PIVOT: normal-user
                    accounts no longer exist; register/login now answer 410
                    (see backend/user_auth.py). This script no longer creates
                    that row, and deletes it once on every run if a stale one
                    is still in the local DB. The couple ACCESS login (#4's
                    event_client_accounts row, below) is a different system
                    and stays.
  4. Demo wedding   slug "review-demo", owned by the studio admin (#1):
       - profile built through order_to_invitation.build_invitation_payload
         (the SAME mapping the real fulfillment flow uses), then published.
       - 2 events (wedding ceremony + reception) written the same way
         backend/scripts/seed_demo_events.py does -- a raw top-level `events`
         list on the profile, which is exactly what
         server.py:_build_invitation_public_view reads.
       - a couple "access code" (username+password) via
         backend/photographer_clients.py's event_client_accounts collection,
         username "review-couple" / password Review@2026! -- this is a
         SEPARATE login from #3 (different collection, different auth flow:
         POST /api/client/login, not /api/users/login).
       - one sample store order (db.invitation_orders) owned by the studio
         admin, buyer_kind="photographer", attached to the demo profile.

  Gallery rows: SKIPPED ON PURPOSE. This repo has no bundled placeholder
  images (checked: no sample-wedding/* assets exist in frontend or
  frontend-v2's public/ dirs), so any photo URL seeded here would 404 in the
  UI. bride/groom/couple photo fields are left blank for the same reason --
  the invitation renders fine without them (order_to_invitation.py already
  warns about this for real half-filled orders).

Run:
    cd backend
    SUPABASE_DB_URL=postgresql://postgres@localhost:5433/maja \
    PYTHONIOENCODING=utf-8 ALLOW_INSECURE_JWT=1 SEED_TEST_ACCOUNTS=0 \
    ../.venv/Scripts/python seed_review.py

Remove everything this script created before deploying:
    ... seed_review.py --cleanup
"""

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

REVIEW_PASSWORD = "Review@2026!"
STUDIO_EMAIL = "review-studio@maja.local"
SUPER_EMAIL = "review-admin@maja.local"
COUPLE_EMAIL = "review-couple@maja.local"
COUPLE_ACCESS_USERNAME = "review-couple"
DEMO_SLUG = "review-demo"
DEMO_ORDER_ID = "invord_reviewdemo"
LOCAL_FRONTEND = os.environ.get("REVIEW_FRONTEND_URL", "http://localhost:8127")


def _now():
    return datetime.now(timezone.utc)


async def _upsert_admin(db, email, name, role, get_password_hash):
    from models import Admin, AdminRole, AdminStatus

    existing = await db.admins.find_one({"email": email}, {"_id": 0})
    pw_hash = get_password_hash(REVIEW_PASSWORD)
    if existing:
        await db.admins.update_one(
            {"email": email},
            {"$set": {
                "password_hash": pw_hash,
                "role": role.value,
                "status": AdminStatus.ACTIVE.value,
                # MFA explicitly off -- never locked behind a TOTP prompt.
                "mfa": {"enabled": False},
            }},
        )
        print(f"[OK] admin updated  ({role.value:11}) {email} / {REVIEW_PASSWORD}")
        return existing["id"]

    adm = Admin(
        email=email, password_hash=pw_hash, name=name,
        role=role, status=AdminStatus.ACTIVE, self_signup=False,
    ).model_dump()
    adm["mfa"] = {"enabled": False}
    await db.admins.insert_one(adm)
    print(f"[OK] admin created  ({role.value:11}) {email} / {REVIEW_PASSWORD}")
    return adm["id"]


async def _remove_legacy_couple_user_row(db):
    """One-time migration cleanup: normal-user accounts are retired (PRODUCT
    PIVOT), so this script no longer creates a `users` row for the review
    couple. Delete a stale one if an earlier run of this script left it
    behind, so the local DB matches the pivot."""
    r = await db.users.delete_many({"email": COUPLE_EMAIL})
    n = getattr(r, "deleted_count", 0)
    if n:
        print(f"[OK] legacy couple user row removed  {COUPLE_EMAIL} (retired -- normal-user accounts no longer exist)")


def _build_demo_order(event_date_str):
    """A synthetic 'invitation_orders'-shaped dict -- the exact input shape
    order_to_invitation.build_invitation_payload expects from a real paid
    order's `info`/`extra`. No db, no network; pure mapping input."""
    return {
        "event_type": "wedding",
        "theme_id": "",
        "package": "premium",
        "design_id": "",
        "fulfillment_code": "REVIEW-DEMO",
        "buyer": {"email": COUPLE_EMAIL},
        "addons": [],
        "info": {
            "bride_name": "Meera",
            "groom_name": "Ravi",
            "venue": "Taj Krishna",
            "city": "Hyderabad, Telangana",
            "event_date": event_date_str,
            "phone": "9876543210",
            "notes": "Local review/demo wedding -- seeded by seed_review.py.",
            "extra": {
                "primary_language": "english",
                "other_languages": [],
                "wedding_time": "10:30",
                "marriage_type": "hindu",
                "background_choice": "design",
                "about_bride": "Meera teaches classical dance and can't start a "
                               "morning without filter coffee.",
                "about_groom": "Ravi is a civil engineer who never misses a "
                              "cricket match.",
                "couple_story": "Ravi and Meera met at a mutual friend's "
                               "wedding three years ago, and the rest followed.",
                "faq": [
                    {"q": "What time should we arrive?",
                     "a": "By 10:00 AM for the 10:30 AM muhurtam."},
                    {"q": "Is dinner served at the reception?",
                     "a": "Yes -- dinner starts at 7:30 PM."},
                ],
            },
        },
    }


async def _upsert_demo_profile(db, studio_admin_id):
    from order_to_invitation import build_invitation_payload

    when = _now() + timedelta(days=60)
    event_date_str = when.date().isoformat()

    order = _build_demo_order(event_date_str)
    built = build_invitation_payload(order, studio_admin_id, slug=DEMO_SLUG)
    doc = built["profile"]
    for w in built["warnings"]:
        print(f"    note (expected -- no photos supplied): {w}")

    # 2 events the invitation UI renders (WeddingEvent shape) -- written the
    # same way scripts/seed_demo_events.py does: a raw top-level `events` list,
    # NOT re-validated through Profile() here. Deliberately omits
    # `event_content` / `muhurtham_time` -- Pydantic only runs their field
    # validators when the key is present in the input; omitting them means
    # the model's own defaults apply with no validation, exactly like every
    # profile written before those PHASE 14/17 fields existed. Adding those
    # keys explicitly would 422 at read time (marriage needs
    # event_content.bride_full_name/groom_full_name; reception needs
    # event_content.hosted_by) -- this mirrors the working precedent, not a
    # workaround.
    doc["events"] = [
        {
            "event_id": "evt-review-marriage",
            "event_type": "marriage",
            "name": "Wedding Ceremony",
            "date": event_date_str,
            "start_time": "10:30",
            "end_time": "13:00",
            "venue_name": "Taj Krishna",
            "venue_address": "Hyderabad, Telangana",
            "map_link": "https://maps.google.com/?q=Taj+Krishna,Hyderabad",
            "description": "Muhurtam and wedding ceremony.",
            "visible": True,
        },
        {
            "event_id": "evt-review-reception",
            "event_type": "reception",
            "name": "Reception",
            "date": event_date_str,
            "start_time": "18:30",
            "end_time": "22:00",
            "venue_name": "Taj Krishna - Grand Ballroom",
            "venue_address": "Hyderabad, Telangana",
            "map_link": "https://maps.google.com/?q=Taj+Krishna,Hyderabad",
            "description": "Evening reception and dinner.",
            "visible": True,
        },
    ]

    now_iso = _now().isoformat()
    doc["status"] = "published"
    doc["is_published"] = True
    doc["is_enabled"] = True
    doc["is_active"] = True
    doc["published_at"] = now_iso

    existing = await db.profiles.find_one({"slug": DEMO_SLUG}, {"_id": 0})
    if existing:
        doc["id"] = existing["id"]
        doc["created_at"] = existing.get("created_at") or doc.get("created_at")
        doc["admin_id"] = studio_admin_id  # keep ownership pinned on rerun
        await db.profiles.update_one({"id": existing["id"]}, {"$set": doc})
        print(f"[OK] profile updated              slug={DEMO_SLUG} id={existing['id']}")
        return existing["id"]

    await db.profiles.insert_one(doc)
    print(f"[OK] profile created               slug={DEMO_SLUG} id={doc['id']}")
    return doc["id"]


async def _upsert_couple_access(db, profile_id, studio_admin_id, get_password_hash):
    """The 'couple access code' -- username+password scoped to one invitation,
    backend/photographer_clients.py's event_client_accounts collection. This
    is a DIFFERENT login from the review-couple@maja.local user account."""
    now_iso = _now().isoformat()
    pw_hash = get_password_hash(REVIEW_PASSWORD)
    existing = await db.event_client_accounts.find_one({"profile_id": profile_id}, {"_id": 0})
    if existing:
        await db.event_client_accounts.update_one(
            {"profile_id": profile_id},
            {"$set": {"username": COUPLE_ACCESS_USERNAME, "password_hash": pw_hash,
                      "enabled": True, "updated_at": now_iso}},
        )
        print(f"[OK] couple access updated  username={COUPLE_ACCESS_USERNAME} / {REVIEW_PASSWORD}")
        return
    await db.event_client_accounts.insert_one({
        "id": f"eca_{uuid.uuid4().hex[:16]}",
        "profile_id": profile_id,
        "username": COUPLE_ACCESS_USERNAME,
        "password_hash": pw_hash,
        "enabled": True,
        "created_by": studio_admin_id,
        "created_at": now_iso,
        "updated_at": now_iso,
    })
    print(f"[OK] couple access created  username={COUPLE_ACCESS_USERNAME} / {REVIEW_PASSWORD}")


async def _upsert_store_order(db, studio_admin_id, profile_id):
    """One sample store order (db.invitation_orders) owned by the studio
    admin, in the same shape store_features.create_order writes for a
    photographer buyer (buyer_kind='photographer'), inserted directly rather
    than through Razorpay since this is seeded review data, not a real
    payment."""
    now_iso = _now().isoformat()
    existing = await db.invitation_orders.find_one({"id": DEMO_ORDER_ID}, {"_id": 0})
    doc = {
        "id": DEMO_ORDER_ID,
        "fulfillment_code": "MAJA-REVDEM",
        "buyer_kind": "photographer",
        "user_id": studio_admin_id,
        "design_id": "royal_mughal",
        "theme_id": "royal_mughal",
        "event_type": "wedding",
        "package": "premium",
        "package_label": "Premium",
        "language": "english",
        "addons": [],
        "quote": {"total_inr": 4999, "package": "premium", "package_label": "Premium",
                  "language": "english", "addons": []},
        "pricing_model": "package",
        "features": [],
        "main_language": "english",
        "extra_languages": [],
        "esign_agreed": True,
        "esign_at": now_iso,
        "amount_inr": 4999,
        "amount_paise": 499900,
        "currency": "INR",
        "razorpay_order_id": None,
        "razorpay_payment_id": None,
        "razorpay_signature": None,
        "status": "paid",
        "build_status": "delivered",
        "info": None,
        "profile_id": profile_id,
        "live_url": f"{LOCAL_FRONTEND}/invite/{DEMO_SLUG}",
        "created_at": now_iso,
        "paid_at": now_iso,
        "delivered_at": now_iso,
    }
    if existing:
        await db.invitation_orders.update_one({"id": DEMO_ORDER_ID}, {"$set": doc})
        print(f"[OK] store order updated    id={DEMO_ORDER_ID}")
        return
    await db.invitation_orders.insert_one(doc)
    print(f"[OK] store order created    id={DEMO_ORDER_ID}")


async def cleanup(db):
    r1 = await db.admins.delete_many({"email": {"$in": [STUDIO_EMAIL, SUPER_EMAIL]}})
    r2 = await db.users.delete_many({"email": COUPLE_EMAIL})  # legacy row, if any -- normal-user accounts are retired
    profile = await db.profiles.find_one({"slug": DEMO_SLUG}, {"_id": 0})
    r3_n = 0
    r4_n = 0
    if profile:
        r3 = await db.event_client_accounts.delete_many({"profile_id": profile["id"]})
        r3_n = getattr(r3, "deleted_count", 0)
        await db.profiles.delete_many({"slug": DEMO_SLUG})
        r4_n = 1
    r5 = await db.invitation_orders.delete_many({"id": DEMO_ORDER_ID})
    print("[cleanup] admins removed:", getattr(r1, "deleted_count", 0))
    print("[cleanup] users removed:", getattr(r2, "deleted_count", 0))
    print("[cleanup] event_client_accounts removed:", r3_n)
    print("[cleanup] profiles removed:", r4_n)
    print("[cleanup] invitation_orders removed:", getattr(r5, "deleted_count", 0))


async def main():
    from seed_test_accounts import _is_production
    if _is_production():
        print("[review-seed] ENVIRONMENT=production -- refusing to seed/modify review "
              "accounts. This script is LOCAL REVIEW ONLY.")
        return 1

    from pg_adapter import Database
    from auth import get_password_hash
    from models import AdminRole

    dsn = os.environ.get("SUPABASE_DB_URL")
    if not dsn:
        print("ERROR: SUPABASE_DB_URL is not set.")
        return 1

    db = await Database.connect(dsn)
    try:
        if "--cleanup" in sys.argv:
            await cleanup(db)
            return 0

        studio_id = await _upsert_admin(db, STUDIO_EMAIL, "Review Studio",
                                        AdminRole.ADMIN, get_password_hash)
        await _upsert_admin(db, SUPER_EMAIL, "Review Super Admin",
                            AdminRole.SUPER_ADMIN, get_password_hash)
        await _remove_legacy_couple_user_row(db)
        profile_id = await _upsert_demo_profile(db, studio_id)
        await _upsert_couple_access(db, profile_id, studio_id, get_password_hash)
        await _upsert_store_order(db, studio_id, profile_id)

        print("\nDone. See docs/REVIEW_CREDENTIALS.md for every login + URL.")
        return 0
    finally:
        await db.close()


def demo():
    """One runnable self-check: the order->profile mapping alone, no db.
    Confirms build_invitation_payload accepts the synthetic order shape used
    above and produces a profile with the fields the invitation UI needs."""
    from order_to_invitation import build_invitation_payload
    order = _build_demo_order("2027-01-01")
    built = build_invitation_payload(order, "test-admin-id", slug=DEMO_SLUG)
    doc = built["profile"]
    assert doc["slug"] == DEMO_SLUG
    assert doc["bride_name"] == "Meera" and doc["groom_name"] == "Ravi"
    assert doc["venue"] == "Taj Krishna"
    assert doc["admin_id"] == "test-admin-id"
    assert doc["events"] == []  # events are attached separately, see _upsert_demo_profile
    print("[demo] build_invitation_payload mapping OK")


if __name__ == "__main__":
    if "--demo" in sys.argv:
        demo()
    else:
        sys.exit(asyncio.run(main()))
