"""
test_pricing_founding.py — honest founding-vs-regular pricing math.

    cd backend && python -m tests.test_pricing_founding

Covers the pure core of the Founding-100 pricing (pricing_engine.py): whether
founding pricing is live, how many seats remain, and the numbers a pricing card
shows. The strike-through is ALWAYS the real regular price and the "% off" is the
true saving — there are no fabricated anchors, so these tests also lock in that
guarantee (a strike-through never appears unless the buyer genuinely pays less).

No Postgres / network: every function under test is pure.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from pricing_engine import (                                   # noqa: E402
    founding_state, pct_off, price_display, compute_plan_offer,
)

PASS = 0
FAIL = []


def ok(label, cond):
    global PASS
    if cond:
        PASS += 1
        print(f"  ok  {label}")
    else:
        FAIL.append(label)
        print(f"  FAIL  {label}")


def run():
    print("=== founding_state: when is founding pricing live? ===")
    on = {"founding_users_enabled": True, "founding_user_limit": 100, "auto_switch_to_regular_pricing": True}
    st = founding_state(on, 37)
    ok("enabled with seats left -> founding mode", st["mode"] == "founding")
    ok("slots_left is limit - count", st["slots_left"] == 63)
    ok("disabled -> regular mode", founding_state({**on, "founding_users_enabled": False}, 0)["mode"] == "regular")
    ok("seats exhausted + auto-switch -> regular (sold out)",
       founding_state(on, 100)["mode"] == "regular" and founding_state(on, 100)["sold_out"] is True)
    ok("seats exhausted but auto-switch OFF -> founding stays live",
       founding_state({**on, "auto_switch_to_regular_pricing": False}, 100)["mode"] == "founding")
    ok("count is clamped at >= 0 and never negative slots",
       founding_state(on, 250)["slots_left"] == 0)
    ok("missing settings falls back to disabled default", founding_state(None, 0)["mode"] == "regular")

    print("\n=== pct_off: the REAL saving, never fabricated ===")
    ok("299 vs a 499 regular = 40% off", pct_off(499, 299) == 40)
    ok("599 vs 999 = 40% off", pct_off(999, 599) == 40)
    ok("no saving when effective >= regular", pct_off(499, 499) == 0 and pct_off(499, 600) == 0)
    ok("regular of 0 yields 0% (no divide-by-zero)", pct_off(0, 0) == 0)

    print("\n=== price_display: founding mode shows a REAL strike-through ===")
    d = price_display(499, 299, "founding")
    ok("effective is the founding price", d["effective_price"] == 299)
    ok("strike-through is the REAL regular price", d["strikethrough"] == 499)
    ok("pct_off is the true 40%", d["pct_off"] == 40)
    ok("savings is regular - founding", d["savings"] == 200)
    ok("is_founding flagged", d["is_founding"] is True)

    print("\n=== price_display: regular mode shows NO fake strike-through ===")
    r = price_display(499, 299, "regular")
    ok("regular mode charges the regular price", r["effective_price"] == 499)
    ok("regular mode shows no strike-through (no fabricated discount)", r["strikethrough"] is None)
    ok("regular mode shows 0% off", r["pct_off"] == 0)

    print("\n=== price_display: guards against a misconfigured founding price ===")
    ok("no founding price set -> pays regular, no strike-through",
       price_display(499, None, "founding")["strikethrough"] is None)
    bad = price_display(499, 600, "founding")  # founding accidentally HIGHER than regular
    ok("founding >= regular is ignored (never overcharges, never fake strike)",
       bad["effective_price"] == 499 and bad["strikethrough"] is None and bad["is_founding"] is False)

    print("\n=== compute_plan_offer: one cycle, card-ready ===")
    plan = {
        "id": "portfolio_basic", "tier": "Basic", "popular": False,
        "durations": {"1": 499, "3": 1299, "6": 2399, "12": 3999},
        "durations_founding": {"1": 299, "3": 799, "6": 1499, "12": 2499},
    }
    offer = compute_plan_offer(plan, "1", "founding", kind="portfolio")
    ok("monthly founding offer pays 299", offer["available"] and offer["effective_price"] == 299)
    ok("monthly strike-through is 499", offer["strikethrough"] == 499)
    ok("yearly founding offer pays 2499", compute_plan_offer(plan, "12", "founding")["effective_price"] == 2499)
    ok("regular mode pays the yearly regular 3999",
       compute_plan_offer(plan, "12", "regular")["effective_price"] == 3999)
    ok("a cycle with no price is unavailable (never silently free)",
       compute_plan_offer(plan, "24", "founding")["available"] is False)

    print("\n" + "=" * 58)
    print(f"{PASS} checks passed, {len(FAIL)} failed")
    if FAIL:
        for f in FAIL:
            print(f"  - {f}")
        sys.exit(1)


if __name__ == "__main__":
    run()
