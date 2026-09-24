"""
Self-test for the P6 community read-through (community_gating → editable matrix).

    cd backend && python -m tests.test_community_matrix

Proves the admin-editable community_settings matrix is authoritative when it
covers a capability, that unmapped capabilities fall back to the hardcoded rule,
and that the new Pro tier ranks above Premium.
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
import pricing_migration as mig
import community_gating as cg


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def run():
    db = FakeDB()
    await mig.seed_community_settings(db)

    print("1. matrix is authoritative for mapped capabilities")
    _check(await cg._matrix_allows(db, "premium", "reels") is True,
           "premium → reels allowed (matrix)")
    _check(await cg._matrix_allows(db, "basic", "reels") is False,
           "basic → reels denied (matrix)")
    _check(await cg._matrix_allows(db, "basic", "photo_post") is True,
           "basic → photo_post maps to 'post' = allowed")
    _check(await cg._matrix_allows(db, "free", "photo_post") is False,
           "free → post denied")
    _check(await cg._matrix_allows(db, "pro", "leads") is True,
           "pro → leads allowed (Pro tier)")

    print("2. unmapped capability falls back (returns None)")
    _check(await cg._matrix_allows(db, "premium", "verification") is None,
           "verification not in matrix → None → hardcoded fallback used")

    print("3. empty/missing matrix never locks out (returns None)")
    empty = FakeDB()
    _check(await cg._matrix_allows(empty, "premium", "reels") is None,
           "no community_settings doc → None → fallback")

    print("4. Pro tier ranks + name resolution")
    _check(cg.TIER_RANK.get("pro") == 3 and cg.TIER_RANK["pro"] > cg.TIER_RANK["premium"],
           "pro outranks premium")
    _check(cg._tier_of_name("pro") == "pro" and cg._tier_of_name("PRO") == "pro",
           "'pro' recognised as a real tier")
    _check(cg._tier_of_name("something") == "free", "unknown name → free")

    print("\nALL COMMUNITY MATRIX TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
