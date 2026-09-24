"""
Self-test for the pure pricing resolver (no DB, no network).

    cd backend && python -m tests.test_pricing_resolver

Covers the single-resolver contract + safety rules:
  1. WEDDING = design + feature pack + link duration.
  2. sale_price is authoritative; else base − %disc − ₹disc, floored at 0.
  3. Percentage vs fixed campaigns; single BEST campaign, never stacked.
  4. Scope filtering (design / category / feature_pack / all).
  5. Expired / inactive / out-of-window campaigns ignored.
  6. Discount clamped to subtotal — total never negative.
  7. ₹0 duration included; plan cycle with no price = unavailable (never ₹0).
  8. validate_price / validate_unique_name guard bad admin input.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

from pricing_engine import (
    effective_design_price, compute_wedding_total, compute_plan_total,
    best_campaign, validate_price, validate_unique_name, PricingError,
)

NOW = datetime(2026, 7, 21, tzinfo=timezone.utc)


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


def _campaign(**kw):
    base = {"id": "c", "name": "C", "active": True, "discount_type": "percentage",
            "discount_value": 10, "scope": {"mode": "all", "ids": []},
            "start_at": "2026-01-01T00:00:00+00:00", "end_at": "2026-12-31T00:00:00+00:00",
            "priority": 0}
    base.update(kw)
    return base


def run():
    print("1. design price resolution")
    _check(effective_design_price({"sale_price": 1499, "base_price": 1999}) == 1499,
           "sale_price is authoritative")
    _check(effective_design_price({"base_price": 2000, "discount_pct": 25}) == 1500,
           "base − 25% = 1500 when no sale_price")
    _check(effective_design_price({"base_price": 1000, "discount_amount": 300}) == 700,
           "base − ₹300 = 700")
    _check(effective_design_price({"base_price": 500, "discount_amount": 9999}) == 0,
           "over-discount floors at 0 (never negative)")

    print("2. wedding total = design + pack + duration (no campaign)")
    design = {"design_id": "royal_gold", "category_id": "royal", "sale_price": 1499}
    pack = {"key": "signature", "price": 999}
    dur = {"price": 599}
    q = compute_wedding_total(design, pack, dur, [], NOW)
    _check(q["design_price"] == 1499 and q["feature_pack_price"] == 999
           and q["link_duration_price"] == 599, "components correct")
    _check(q["subtotal"] == 3097 and q["discount"] == 0 and q["total"] == 3097,
           "subtotal 3097, no discount → total 3097")

    print("3. percentage vs fixed, best-of chosen")
    pct = _campaign(id="pct", discount_type="percentage", discount_value=20)   # 20% of 3097 = 619
    fixed = _campaign(id="fix", discount_type="fixed", discount_value=500)      # ₹500
    q = compute_wedding_total(design, pack, dur, [pct, fixed], NOW)
    _check(q["discount"] == 619 and q["campaign"]["id"] == "pct",
           "best campaign (20% = ₹619) beats ₹500, no stacking")
    _check(q["total"] == 3097 - 619, "total = subtotal − best discount")

    print("4. scope filtering")
    other = _campaign(id="other", discount_value=90,
                      scope={"mode": "categories", "ids": ["traditional"]})
    q = compute_wedding_total(design, pack, dur, [other], NOW)
    _check(q["discount"] == 0, "campaign scoped to another category does not apply")
    mine = _campaign(id="mine", discount_value=10,
                     scope={"mode": "designs", "ids": ["royal_gold"]})
    q = compute_wedding_total(design, pack, dur, [mine], NOW)
    _check(q["discount"] == 310 and q["campaign"]["id"] == "mine",
           "design-scoped campaign applies (10% of 3097 = 310)")

    print("5. inactive / expired ignored")
    off = _campaign(id="off", active=False, discount_value=50)
    past = _campaign(id="past", discount_value=50, end_at="2026-01-05T00:00:00+00:00")
    future = _campaign(id="fut", discount_value=50, start_at="2026-12-01T00:00:00+00:00")
    q = compute_wedding_total(design, pack, dur, [off, past, future], NOW)
    _check(q["discount"] == 0, "inactive + expired + not-yet-started all ignored")

    print("6. discount clamped — never negative")
    cheap = {"sale_price": 100}
    q = compute_wedding_total(cheap, {"key": "celebration", "price": 0}, {"price": 0},
                              [_campaign(discount_type="fixed", discount_value=99999)], NOW)
    _check(q["total"] == 0 and q["discount"] == 100, "₹99999 off ₹100 → total 0, not negative")

    print("7. ₹0 duration + plan availability")
    q = compute_wedding_total({"sale_price": 499}, {"key": "celebration", "price": 0},
                              {"price": 0}, [], NOW)
    _check(q["total"] == 499, "free pack + free 3-month duration → design price only")
    plan = {"id": "premium", "name": "Premium", "durations": {"1": 599, "12": 5999}}
    _check(compute_plan_total(plan, "12", [], "portfolio", NOW)["total"] == 5999,
           "portfolio 12mo = ₹5999 (admin-set, not computed)")
    unavail = compute_plan_total(plan, "6", [], "portfolio", NOW)
    _check(unavail["available"] is False and unavail["total"] is None,
           "cycle with no price = unavailable, never ₹0")
    q = compute_plan_total(plan, "12", [_campaign(discount_type="fixed", discount_value=1000,
                            scope={"mode": "portfolio", "ids": []})], "portfolio", NOW)
    _check(q["total"] == 4999, "portfolio campaign applies (5999 − 1000)")

    print("8. admin-input validation")
    _check(validate_price(1499) == 1499, "valid price passes")
    try:
        validate_price(-5); _check(False, "negative rejected")
    except PricingError:
        _check(True, "negative price rejected")
    try:
        validate_price(0, allow_zero=False); _check(False, "zero rejected")
    except PricingError:
        _check(True, "₹0 rejected when allow_zero=False")
    try:
        validate_unique_name(["Premium", "Basic"], "premium"); _check(False, "dup rejected")
    except PricingError:
        _check(True, "duplicate name rejected (case-insensitive)")

    print("\nALL PRICING RESOLVER TESTS PASSED")


if __name__ == "__main__":
    run()
