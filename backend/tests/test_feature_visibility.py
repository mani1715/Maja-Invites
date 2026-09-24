"""
Feature-pack VISIBILITY matrix (Task 1) — the exact acceptance criteria.

    cd backend && python -m tests.test_feature_visibility

Proves, at the authoritative gate `pricing_activation.has_feature` (which the public
renderer's featureAccess.js mirrors 1:1):

  * Celebration buyer  → cannot see Signature or Royal features.
  * Signature buyer    → sees Signature features, cannot see Royal features.
  * Royal buyer        → sees everything.
  * Base features are never hidden from anyone.
  * new_pricing_enabled OFF  → everything visible (permissive / reversible).
  * Legacy link (no granted_features) → everything visible (backward compatible).
"""
from __future__ import annotations

import asyncio
import os
import sys
import types

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ["STORAGE_CRED_KEY"] = Fernet.generate_key().decode()

from tests.test_storage_orchestrator import FakeDB
import pricing_activation as act

# Mirror of pricing_migration.DEFAULT_FEATURE_PACKS.
PACKS = {
    "celebration": ["rsvp", "timeline", "family_details", "countdown", "maps", "music"],
    "signature": ["rsvp", "timeline", "family_details", "countdown", "maps", "music",
                  "qr_live_gallery", "guest_uploads", "enhanced_gallery"],
    "royal": ["rsvp", "timeline", "family_details", "countdown", "maps", "music",
              "qr_live_gallery", "guest_uploads", "enhanced_gallery",
              "ai_face_match", "selfie_search", "premium_support", "premium_delivery"],
}

SIGNATURE_ONLY = ["qr_live_gallery", "guest_uploads", "enhanced_gallery"]
ROYAL_ONLY = ["ai_face_match", "selfie_search", "premium_support", "premium_delivery"]
BASE = ["rsvp", "timeline", "maps", "music"]


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _flag(db, on):
    await db.app_settings.update_one({"key": "new_pricing_enabled"},
                                     {"$set": {"key": "new_pricing_enabled", "value": on}}, upsert=True)


async def _seed(db):
    for key, feats in PACKS.items():
        await db.feature_packs.insert_one({"key": key, "name": key.title(), "features": list(feats)})


async def _deliver(db, pid, pack):
    await db.profiles.insert_one({"id": pid, "slug": pid})
    order = {"id": f"o_{pid}", "quote": {"pricing_model": "v2", "package": pack}}
    await act.apply_order_entitlements(db, order, pid)
    return await db.profiles.find_one({"id": pid})


async def run():
    db = FakeDB()
    await _seed(db)
    await _flag(db, True)

    print("1. Celebration buyer cannot see Signature or Royal features")
    cel = await _deliver(db, "cel", "celebration")
    for f in SIGNATURE_ONLY + ROYAL_ONLY:
        _check(await act.has_feature(db, cel, f) is False, f"celebration blocked from '{f}'")
    for f in BASE:
        _check(await act.has_feature(db, cel, f) is True, f"celebration keeps base '{f}'")

    print("2. Signature buyer sees Signature features, not Royal")
    sig = await _deliver(db, "sig", "signature")
    for f in SIGNATURE_ONLY:
        _check(await act.has_feature(db, sig, f) is True, f"signature sees '{f}'")
    for f in ROYAL_ONLY:
        _check(await act.has_feature(db, sig, f) is False, f"signature blocked from Royal '{f}'")

    print("3. Royal buyer sees everything")
    roy = await _deliver(db, "roy", "royal")
    for f in SIGNATURE_ONLY + ROYAL_ONLY + BASE:
        _check(await act.has_feature(db, roy, f) is True, f"royal sees '{f}'")

    print("4. new_pricing_enabled OFF → everything visible (reversible)")
    await _flag(db, False)
    for f in SIGNATURE_ONLY + ROYAL_ONLY:
        _check(await act.has_feature(db, cel, f) is True, f"flag OFF → celebration sees '{f}' again")
    # And the public builder contract: granted list is ignored while OFF.
    await _flag(db, True)

    print("5. Legacy link (no granted_features) → everything visible")
    legacy = {"id": "leg", "slug": "leg"}  # never delivered by v2
    for f in SIGNATURE_ONLY + ROYAL_ONLY:
        _check(await act.has_feature(db, legacy, f) is True, f"legacy link sees '{f}'")

    print("6. granted_features() payload matches the purchased pack (what the renderer reads)")
    _check(sorted(act.granted_features(sig)) == sorted(PACKS["signature"]),
           "signature payload granted_features == Signature pack")
    _check(act.granted_features(legacy) is None, "legacy payload granted_features is None (ungated)")

    print("\nALL FEATURE-VISIBILITY TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
