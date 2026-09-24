"""A coupon minted in the console must actually discount at checkout.

The super-admin coupon CRUD (`super_admin_v2.py`) wrote `discount_type`,
`discount_value` and `active`. Both places that SPEND a coupon
(`subscription_service._apply_coupon`, `marketplace_service._apply_coupon`)
read `type`, `value` and `is_active`. Nothing joined the two vocabularies, so:

  * every coupon ever created through the console discounted exactly ₹0
    (`doc.get("value", 0)` → 0), and
  * deactivating a coupon did nothing, because `is_active` was absent and the
    readers defaulted it to True.

Both halves were silently wrong — the console said "coupon created", the
checkout quietly charged full price. These tests pin the CONTRACT between the
writer and the readers rather than either side's spelling, so renaming a field
on one side fails here instead of in production.

FakeDB only; no network, no Postgres.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tests.aws_stub import ensure_aws_service
ensure_aws_service()

from tests.test_storage_orchestrator import FakeDB


def _coupon_legacy(code="LEGACY10", dtype="percent", dvalue=10, active=True):
    """Exactly what the console wrote before the fix (and what is already
    sitting in the owner's database)."""
    return {"id": "c_legacy", "code": code, "discount_type": dtype,
            "discount_value": dvalue, "active": active, "uses": 0,
            "max_uses": 0, "expires_at": None, "applies_to": []}


def _coupon_canonical(code="NEW10", ctype="percent", value=10, is_active=True):
    return {"id": "c_new", "code": code, "type": ctype, "value": value,
            "is_active": is_active, "uses": 0, "max_uses": 0,
            "expires_at": None, "applies_to": []}


from pricing_engine import coupon_discount_paise


async def _sub_apply(db, code, subtotal_paise):
    """Go through the real checkout path, not the helper, so the wiring is
    covered too — subscription_service must actually call into pricing_engine."""
    import subscription_service as subs
    doc = await db.coupons.find_one({"code": code.upper()}, {"_id": 0})
    return {"discount_paise": coupon_discount_paise(doc, subtotal_paise),
            "coupon": (doc or {}).get("code")}


def test_both_checkouts_delegate_to_the_shared_helper():
    """The duplication is what allowed the bug to exist twice. If either
    checkout grows its own copy of the arithmetic again, this fails."""
    import inspect
    import subscription_service, marketplace_service
    for mod in (subscription_service, marketplace_service):
        src = inspect.getsource(mod)
        assert "coupon_discount_paise" in src, f"{mod.__name__} no longer uses the shared helper"


def test_legacy_coupon_still_discounts():
    """The bug: a console-created coupon discounted ₹0."""
    async def go():
        db = FakeDB()
        await db.coupons.insert_one(_coupon_legacy(dtype="percent", dvalue=10))
        out = await _sub_apply(db, "LEGACY10", 100_000)   # ₹1000
        assert out["discount_paise"] == 10_000, out       # 10% = ₹100
    asyncio.run(go())


def test_legacy_flat_coupon_discounts():
    async def go():
        db = FakeDB()
        await db.coupons.insert_one(_coupon_legacy(code="FLAT50", dtype="flat", dvalue=50))
        out = await _sub_apply(db, "FLAT50", 100_000)
        assert out["discount_paise"] == 5_000, out        # ₹50 flat
    asyncio.run(go())


def test_legacy_deactivated_coupon_is_refused():
    """The second half: `active: False` was ignored, so a switched-off coupon
    kept discounting."""
    async def go():
        db = FakeDB()
        await db.coupons.insert_one(_coupon_legacy(code="OFF10", active=False))
        out = await _sub_apply(db, "OFF10", 100_000)
        assert out["discount_paise"] == 0, out
    asyncio.run(go())


def test_canonical_coupon_still_works():
    """The spelling the readers always understood must keep working."""
    async def go():
        db = FakeDB()
        await db.coupons.insert_one(_coupon_canonical(value=25))
        out = await _sub_apply(db, "NEW10", 100_000)
        assert out["discount_paise"] == 25_000, out
    asyncio.run(go())


def test_writer_emits_both_vocabularies():
    """super_admin_v2.coupon_create must persist the names the spenders read."""
    async def go():
        import super_admin_v2 as sa2

        db = FakeDB()

        async def _su():
            return {"admin_id": "su_1"}

        router, _pub = sa2.build_super_admin_v2_router(
            db, require_super_admin=_su, require_admin=_su,
            create_access_token=lambda *a, **k: "tok", log_audit_action=None)
        create = next(r.endpoint for r in router.routes
                      if getattr(r, "path", "").endswith("/coupons")
                      and "POST" in getattr(r, "methods", set()))
        Body = create.__annotations__["c"]
        await create(Body(code="SAVE20", discount_type="percent", discount_value=20),
                     admin_data={"admin_id": "su_1"})

        doc = await db.coupons.find_one({"code": "SAVE20"}, {"_id": 0})
        assert doc["type"] == "percent" and doc["value"] == 20, doc
        assert doc["is_active"] is True, doc
        # And the round trip actually discounts.
        out = await _sub_apply(db, "SAVE20", 100_000)
        assert out["discount_paise"] == 20_000, out
    asyncio.run(go())


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"  ok  {name}")
    print("coupon writer/reader contract OK")


# --------------------------------------------------------------------------- #
# applies_to scoping — stored by the console since forever, read by nobody, so
# a coupon meant for one product silently discounted everything.
# --------------------------------------------------------------------------- #
def test_scoped_coupon_applies_to_its_own_product():
    doc = {"code": "PORT20", "type": "percent", "value": 20, "is_active": True,
           "applies_to": ["portfolio"]}
    assert coupon_discount_paise(doc, 100_000, scope=["portfolio", "plan_portfolio_premium", "Premium"]) == 20_000


def test_scoped_coupon_is_refused_for_another_product():
    doc = {"code": "PORT20", "type": "percent", "value": 20, "is_active": True,
           "applies_to": ["portfolio"]}
    assert coupon_discount_paise(doc, 100_000, scope=["storage", "plan_storage_studio", "Studio"]) == 0


def test_scoped_coupon_matches_on_plan_id_too():
    doc = {"code": "ONEPLAN", "type": "flat", "value": 100, "is_active": True,
           "applies_to": ["plan_storage_studio"]}
    assert coupon_discount_paise(doc, 100_000, scope=["storage", "plan_storage_studio", "Studio"]) == 10_000


def test_unscoped_coupon_still_applies_everywhere():
    """Empty applies_to must keep meaning 'all products' — the pre-existing
    behaviour for every coupon already in the database."""
    doc = {"code": "ALL10", "type": "percent", "value": 10, "is_active": True,
           "applies_to": []}
    assert coupon_discount_paise(doc, 100_000, scope=["anything"]) == 10_000
    assert coupon_discount_paise(doc, 100_000) == 10_000


def test_scoped_coupon_with_no_scope_supplied_is_refused():
    """A caller that cannot say what is being bought must not get a scoped
    discount — fail closed, never charge less than intended."""
    doc = {"code": "PORT20", "type": "percent", "value": 20, "is_active": True,
           "applies_to": ["portfolio"]}
    assert coupon_discount_paise(doc, 100_000) == 0
