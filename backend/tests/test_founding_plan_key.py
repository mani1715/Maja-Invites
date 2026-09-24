"""The founding console must write the price to the plan the owner picked.

`PATCH /api/super-admin/founding/portfolio/{plan_key}` resolved its target with
`find_one({"product": "portfolio", "tier": tier})`. `tier` is not unique: a
database can carry two portfolio plans with the same tier name — a legacy row,
a re-created plan, or `plan_portfolio_test`, which `seed_test_accounts.py`
inserts as "Premium" for owner dogfooding. When that happened, `find_one`
returned whichever row came back first and the write silently landed on it, so
"Save Premium" on the founding console could reprice a plan the owner never
chose and still show a success toast.

Found by loading /admin/founding as a super-admin: React warned about two
children with the key `Premium`, and the page keys its panels by tier — the
same field it was saving by.

This is the third instance of the same root cause in the 2026 pricing work
(`apply_founding_portfolio_catalogue` matched by tier name; StudioPlanPicker
deduped by `portfolio_tier`), so it is tested the way the other two should be:
plant the collision deliberately and require the endpoint to refuse rather than
guess.
"""
import asyncio
import sys
import uuid
from pathlib import Path

# Same as the other live modules: makes `tests.live` importable when this file
# is run on its own, not only as part of the whole tree.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
import requests

from tests.live import UA_HEADER, live_db, login, require_live

BASE_URL = require_live()
UA = dict(UA_HEADER)

SUPER = ("mani_8328@majacreations.com", "Maneesh@1234")

COLLIDING_TIER = f"ZZTest{uuid.uuid4().hex[:6]}"
PLAN_A = f"plan_portfolio_keytest_a_{uuid.uuid4().hex[:8]}"
PLAN_B = f"plan_portfolio_keytest_b_{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="module")
def super_headers():
    return {**UA, "Authorization": f"Bearer {login(*SUPER)}"}


@pytest.fixture(scope="module")
def colliding_plans():
    """Two portfolio plans sharing one tier name. Deliberately a throwaway tier
    so this never depends on — or disturbs — the real catalogue."""
    async def _seed():
        db = live_db()
        await db.ensure_connected()
        for pid in (PLAN_A, PLAN_B):
            await db.subscription_plans.insert_one({
                "id": pid, "product": "portfolio", "tier": COLLIDING_TIER,
                "portfolio_tier": "premium", "base_monthly": 100,
                "durations": {"1": 100, "3": 285, "6": 540, "12": 1020},
                "is_active": False,
            })
        await db.close()

    async def _cleanup():
        db = live_db()
        await db.ensure_connected()
        for pid in (PLAN_A, PLAN_B):
            await db.subscription_plans.delete_one({"id": pid})
        await db.close()

    asyncio.run(_seed())
    try:
        yield (PLAN_A, PLAN_B)
    finally:
        asyncio.run(_cleanup())


def _patch(headers, key, payload):
    return requests.patch(
        f"{BASE_URL}/api/super-admin/founding/portfolio/{key}",
        json=payload, headers=headers, timeout=30)


def _read_plan(pid):
    async def _go():
        db = live_db()
        await db.ensure_connected()
        try:
            return await db.subscription_plans.find_one({"id": pid})
        finally:
            await db.close()
    return asyncio.run(_go())


def test_ambiguous_tier_is_refused_not_guessed(colliding_plans, super_headers):
    a, b = colliding_plans
    r = _patch(super_headers, COLLIDING_TIER, {"durations": {"1": 777}})
    assert r.status_code == 409, (
        f"a tier naming TWO plans must be refused, got {r.status_code}: {r.text[:300]}")
    assert "plan id" in r.text.lower(), r.text[:300]

    # And neither row moved. A refusal that still wrote would be worse than
    # the bug it replaced.
    for pid in (a, b):
        assert _read_plan(pid)["base_monthly"] == 100, f"{pid} was written to anyway"


def test_plan_id_writes_exactly_that_plan(colliding_plans, super_headers):
    a, b = colliding_plans
    r = _patch(super_headers, a, {"durations": {"1": 456}})
    assert r.status_code == 200, r.text[:300]

    assert _read_plan(a)["base_monthly"] == 456, "the targeted plan did not change"
    assert _read_plan(b)["base_monthly"] == 100, (
        "the OTHER plan with the same tier name was modified — this is the bug")


def test_unique_tier_name_still_resolves(super_headers):
    """The tier form stays usable while a name is unambiguous, so older links
    and any non-console caller keep working."""
    r = requests.get(f"{BASE_URL}/api/super-admin/founding/status",
                     headers=super_headers, timeout=30)
    assert r.status_code == 200, r.text[:200]
    tiers = [p.get("tier") for p in r.json().get("plans", [])]
    unique = [t for t in tiers if t and tiers.count(t) == 1]
    if not unique:
        pytest.skip("no portfolio plan currently has a unique tier name")

    # A no-op PATCH: send the plan's own current monthly back to it.
    plan = next(p for p in r.json()["plans"] if p.get("tier") == unique[0])
    monthly = (plan.get("cycles") or {}).get("1", {})
    current = monthly.get("regular_price") or monthly.get("final_inr")
    if not current:
        pytest.skip(f"{unique[0]} has no readable monthly price to echo back")

    r2 = _patch(super_headers, unique[0], {"durations": {"1": int(current)}})
    assert r2.status_code == 200, f"unique tier name stopped resolving: {r2.text[:300]}"


def test_requires_super_admin(colliding_plans):
    assert _patch(UA, PLAN_A, {"durations": {"1": 1}}).status_code in (401, 403)
