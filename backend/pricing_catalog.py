"""
pricing_catalog.py — source of truth for the 2026 pricing redesign.

See docs/PRICING_REDESIGN_2026.md for the approved price book and the
architecture decision behind every number here. Every displayed/charged
amount for Portfolio, Storage, Wave Face Match + QR, and Invitations must
trace back to this module. Frontend never computes prices; it renders what
the API returns.

Stdlib-only, no side effects on import (no DB, no network, no env reads).
All money in integer paise unless a name says `_inr` (plain rupee int, the
`price_inr` convention already used by store_features.py).
"""
from __future__ import annotations


def psychological_price_paise(paise: int) -> int:
    """Round a post-discount amount to a psychological ...99 price.

    Rule (docs/PRICING_REDESIGN_2026.md §1, verified against 19 owner
    examples — see the self-check below):
      - amounts <= ₹100 pass through unchanged (too small to round).
      - otherwise round DOWN to the previous hundred's ...99
        (prev99 = floor(amount/100)*100 - ₹1).
      - bump UP instead to the CURRENT hundred's ...99
        (same99 = floor(amount/100)*100 + ₹99) only when BOTH hold:
          * same99 is within ₹10 of the amount, AND
          * prev99 stays in the same ₹1000 block as the amount.
        The thousand-block guard is what keeps a bump-up from crossing a
        round-number boundary the buyer would notice: ₹5,089.80 rounds DOWN
        to ₹4,999 (bumping up to ₹5,099 would cross ₹5,000), while
        ₹20,389.80 rounds UP to ₹20,399 (no boundary in the way).

    This is the exact, already-verified implementation — do not "improve" it.
    """
    if paise <= 100_00:
        return paise
    hundred, thousand = 100_00, 1000_00
    prev99 = (paise // hundred) * hundred - 1_00
    same99 = (paise // hundred) * hundred + 99_00
    if same99 - paise <= 10_00 and (prev99 // thousand) == (paise // thousand):
        return same99
    return prev99


# Billing cycles. Yearly discount changed 20% -> 15% in this redesign;
# migration must overwrite any stale db.pricing_settings{id:"billing_cycles"}
# override still carrying the old 20%.
CYCLES = {
    "monthly":     {"months": 1,  "discount": 0.00, "label": "Monthly"},
    "quarterly":   {"months": 3,  "discount": 0.05, "label": "3 Months"},
    "half_yearly": {"months": 6,  "discount": 0.10, "label": "6 Months"},
    "yearly":      {"months": 12, "discount": 0.15, "label": "1 Year"},
}
CYCLE_ALIASES = {"1": "monthly", "3": "quarterly", "6": "half_yearly", "12": "yearly"}


def _resolve_cycle(cycle: str) -> str:
    key = CYCLE_ALIASES.get(cycle, cycle)
    if key not in CYCLES:
        raise ValueError(f"unknown billing cycle: {cycle!r}")
    return key


def compute_cycle_breakdown(base_monthly_inr: int, cycle: str, *, setup_fee_inr: int = 0) -> dict:
    """One cycle's full price breakdown for a base monthly rate, in paise.

    Monthly never gets psychological rounding (that would turn ₹499 into
    ₹399 — see §1); every other cycle does, applied AFTER the setup fee is
    added, per §3 ("added before psychological rounding, never discounted").
    """
    key = _resolve_cycle(cycle)
    c = CYCLES[key]
    months, discount = c["months"], c["discount"]

    list_paise = base_monthly_inr * 100 * months
    discounted_paise = round(list_paise * (1 - discount))
    setup_fee_paise = setup_fee_inr * 100
    pre_round_paise = discounted_paise + setup_fee_paise
    final_paise = pre_round_paise if key == "monthly" else psychological_price_paise(pre_round_paise)

    return {
        "cycle": key,
        "label": c["label"],
        "months": months,
        "discount_pct": int(round(discount * 100)),
        "list_paise": list_paise,
        "discounted_paise": discounted_paise,
        "setup_fee_paise": setup_fee_paise,
        "pre_round_paise": pre_round_paise,
        "final_paise": final_paise,
        "psych_adjustment_paise": final_paise - pre_round_paise,
        "save_paise": list_paise + setup_fee_paise - final_paise,
        "extra_saving": final_paise < pre_round_paise,
        "effective_monthly_paise": round(final_paise / months),
        # Prices are GST-inclusive (§7): gst = total - round(total/1.18).
        "gst_included_paise": final_paise - round(final_paise / 1.18),
    }


# Five portfolio plans (was two). Pro/Advanced/Premium/Custom all gate on
# portfolio_tier "premium" (full sections); Basic keeps "basic". Custom's
# setup fee is charged only on first purchase (§3) — callers pass
# setup_fee_inr=0 for a renewal.
#
# TRUTHFUL DIFFERENTIATION (§9 item 2, "Pro vs Advanced vs Premium feature
# matrix") — investigated before writing a word of copy, not guessed:
#   - portfolio_service._plan_tier_of() and photographer_directory's OWN copy
#     of the same rule both special-case ONLY the exact strings "premium" and
#     "basic". Any other portfolio_tier value (e.g. a "pro" level) falls
#     through to inferring the tier from the PLAN'S NAME against
#     {"professional","studio","premium","elite","pro","enterprise"} — a set
#     that does NOT contain "advanced" or "custom". Remapping Advanced's or
#     Custom's portfolio_tier to "pro" would therefore silently resolve them
#     to "basic" in directory ranking, storage-cap fallback, design-tier
#     unlocks (PORTFOLIO_DESIGN_TIERS) and community gating — a real
#     downgrade of paying studios, not a wording change. portfolio_tier MUST
#     stay "basic" | "premium" only; never add a third value here.
#   - community_settings.tiers["pro"] (pricing_migration.DEFAULT_COMMUNITY)
#     and the `community_tier` field pricing_hub_service accepts on a plan
#     edit are both write-only: community_gating.studio_tier() derives its
#     tier from portfolio_service._portfolio_tier(), which — per the point
#     above — can only ever return "normal"/"basic"/"premium". Neither field
#     has a reader; seeding/accepting "pro" there is inert, not a gate.
#   - portfolio_service._portfolio_sections() DOES read a real, consumed
#     `portfolio_sections` list per plan — but the owner's approved plan (§3)
#     says Pro/Advanced/Premium/Custom all get "full sections", so carving an
#     arbitrary subset for Pro vs Advanced would be inventing a product
#     decision, not encoding an approved one.
# Conclusion: the only real, currently-gated differentiator across
# Pro/Advanced/Premium/Custom is STORAGE (+ Custom's one-time setup fee) —
# already encoded below via storage_mb/storage_label. Their feature bullet
# lists are therefore intentionally IDENTICAL
# (subscription_service.PORTFOLIO_PREMIUM_FEATURES): that is the truthful
# representation, not a gap. Do not invent a badge or a bullet to manufacture
# a difference that does not exist in the gating code.
PORTFOLIO_PLANS = [
    {"key": "basic", "name": "Basic", "base_monthly_inr": 499,
     "storage_mb": 512, "storage_label": "512 MB", "portfolio_tier": "basic",
     "setup_fee_inr": 0, "popular": False, "sort_order": 1},
    {"key": "pro", "name": "Pro", "base_monthly_inr": 899,
     "storage_mb": 2048, "storage_label": "2 GB", "portfolio_tier": "premium",
     "setup_fee_inr": 0, "popular": False, "sort_order": 2},
    {"key": "advanced", "name": "Advanced", "base_monthly_inr": 1399,
     "storage_mb": 10240, "storage_label": "10 GB", "portfolio_tier": "premium",
     "setup_fee_inr": 0, "popular": True, "sort_order": 3},
    {"key": "premium", "name": "Premium", "base_monthly_inr": 1999,
     "storage_mb": 20480, "storage_label": "20 GB", "portfolio_tier": "premium",
     "setup_fee_inr": 0, "popular": False, "sort_order": 4},
    {"key": "custom", "name": "Custom", "base_monthly_inr": 1999,
     "storage_mb": 20480, "storage_label": "20 GB", "portfolio_tier": "premium",
     "setup_fee_inr": 5000, "popular": False, "sort_order": 5},
]


def _storage_computed(monthly_inr: int) -> dict:
    return {days: compute_cycle_breakdown(monthly_inr, cycle)["final_paise"] // 100
            for days, cycle in (("30", "monthly"), ("90", "quarterly"),
                                ("180", "half_yearly"), ("365", "yearly"))}


# Storage tiers (§4). studio_storage.py is canonical; catalog version bumps
# 2 -> 3. 50GB and 1TB are owner-approved anchors with COMPUTED cycles;
# 100/250/500GB are carried verbatim from live catalog v2 pending an owner
# re-price (§9 item 1) — do not recompute them, they would not match what is
# actually selling today. There is deliberately NO 750 GB tier: it does not
# exist anywhere in the live catalog and must not be invented.
STORAGE_TIERS = [
    {"gb": 50, "label": "50 GB", "monthly_inr": 299, "approved": True,
     "cycle_prices_inr": _storage_computed(299)},
    {"gb": 100, "label": "100 GB", "monthly_inr": 299, "approved": False,
     # Frozen literals carried from live catalog v2 — awaiting owner re-price.
     "cycle_prices_inr": {"30": 299, "90": 799, "180": 1499, "365": 2999}},
    {"gb": 250, "label": "250 GB", "monthly_inr": 599, "approved": False,
     "cycle_prices_inr": {"30": 599, "90": 1599, "180": 2999, "365": 5499}},
    {"gb": 500, "label": "500 GB", "monthly_inr": 999, "approved": False,
     "cycle_prices_inr": {"30": 999, "90": 2799, "180": 5299, "365": 8999}},
    {"gb": 1024, "label": "1 TB", "monthly_inr": 2999, "approved": True,
     "cycle_prices_inr": _storage_computed(2999)},
]


# Wave Face Match + QR (§5) — new product, one-time SKUs. Custom (any photo
# count outside these tiers) is a WhatsApp quote, no price here.
FACE_MATCH_TIERS = [
    {"key": "face_match_2000", "photos": 2000, "price_inr": 5000},
    {"key": "face_match_3000", "photos": 3000, "price_inr": 7000},
    {"key": "face_match_5000", "photos": 5000, "price_inr": 10000},
]


def face_match_price(photos: int) -> int:
    """price_inr for an exact tier photo count; ValueError otherwise (Custom quote)."""
    for tier in FACE_MATCH_TIERS:
        if tier["photos"] == photos:
            return tier["price_inr"]
    raise ValueError(f"no fixed-price face-match tier for {photos} photos (use Custom quote)")


# Invitations (§6) — three tiers x three independent add-on components, pure
# addition. No GST on top, no psychological rounding: owner prices are exact.
# Values are price_inr (plain rupee ints), matching store_features.py.
INVITATION_TIERS = {
    "basic":   {"digital": 5000, "video": 2000, "physical": 2000},
    "premium": {"digital": 8000, "video": 4000, "physical": 4000},
    "custom":  {"digital": 10000, "video": 5000, "physical": 5000},
}
_INVITATION_COMPONENTS = frozenset(("digital", "video", "physical"))


def invitation_total(tier: str, components: list[str]) -> int:
    """Sum of the selected components' price_inr for one invitation tier.

    `components` must be a non-empty subset of {digital, video, physical}
    with no duplicates. Backend recomputes from this catalog at order-create
    time — the client sends selections, never amounts.
    """
    if tier not in INVITATION_TIERS:
        raise ValueError(f"unknown invitation tier: {tier!r}")
    if not components:
        raise ValueError("components must be a non-empty list")
    if len(components) != len(set(components)):
        raise ValueError(f"duplicate component in {components!r}")
    unknown = set(components) - _INVITATION_COMPONENTS
    if unknown:
        raise ValueError(f"unknown invitation component(s): {sorted(unknown)!r}")
    prices = INVITATION_TIERS[tier]
    return sum(prices[c] for c in components)


if __name__ == "__main__":
    # 1. All 19 owner-verified psychological rounding examples (paise in/out).
    _ROUNDING_EXAMPLES = [
        (400000, 399900), (410000, 409900), (485460, 479900), (508980, 499900),
        (1255460, 1249900), (142215, 139900), (269460, 269900), (256215, 249900),
        (916980, 909900), (398715, 389900), (755460, 749900), (1426980, 1419900),
        (569715, 569900), (1079460, 1079900), (2038980, 2039900), (1069715, 1069900),
        (1579460, 1579900), (2538980, 2539900), (384700, 379900),
    ]
    for _in, _out in _ROUNDING_EXAMPLES:
        assert psychological_price_paise(_in) == _out, (_in, _out, psychological_price_paise(_in))

    # 2. Full portfolio finals matrix (INR), monthly/3mo/6mo/1yr.
    _PORTFOLIO_MATRIX = {
        "basic": (499, 0, [499, 1399, 2699, 4999]),
        "pro": (899, 0, [899, 2499, 4799, 9099]),
        "advanced": (1399, 0, [1399, 3899, 7499, 14199]),
        "premium": (1999, 0, [1999, 5699, 10799, 20399]),
        "custom_with_setup": (1999, 5000, [6999, 10699, 15799, 25399]),
    }
    _CYCLE_ORDER = ["monthly", "quarterly", "half_yearly", "yearly"]
    for _name, (_base, _setup, _expected) in _PORTFOLIO_MATRIX.items():
        _got = [compute_cycle_breakdown(_base, _c, setup_fee_inr=_setup)["final_paise"] // 100
                for _c in _CYCLE_ORDER]
        assert _got == _expected, (_name, _got, _expected)
    # custom with setup_fee_inr=0 equals the premium row.
    _custom_nosetup = [compute_cycle_breakdown(1999, _c, setup_fee_inr=0)["final_paise"] // 100
                        for _c in _CYCLE_ORDER]
    assert _custom_nosetup == _PORTFOLIO_MATRIX["premium"][2], _custom_nosetup

    # 3. Monthly passthrough: no psychological rounding on monthly.
    assert compute_cycle_breakdown(499, "monthly")["final_paise"] == 49900

    # 4. Storage: 50GB and 1TB computed cycles match §4.
    _t50 = next(t for t in STORAGE_TIERS if t["gb"] == 50)
    assert _t50["cycle_prices_inr"] == {"30": 299, "90": 799, "180": 1599, "365": 2999}, _t50
    _t1tb = next(t for t in STORAGE_TIERS if t["gb"] == 1024)
    assert _t1tb["cycle_prices_inr"] == {"30": 2999, "90": 8499, "180": 16199, "365": 30599}, _t1tb
    assert {t["gb"] for t in STORAGE_TIERS} == {50, 100, 250, 500, 1024}  # no 750

    # 5. All 21 invitation combos (7 combos x 3 tiers).
    _COMBOS = [["digital"], ["video"], ["physical"],
               ["digital", "video"], ["digital", "physical"], ["video", "physical"],
               ["digital", "video", "physical"]]
    _INVITATION_TOTALS = {
        "basic": {"digital": 5000, "video": 2000, "physical": 2000,
                  "digital+video": 7000, "digital+physical": 7000, "video+physical": 4000,
                  "all": 9000},
        "premium": {"digital": 8000, "video": 4000, "physical": 4000,
                    "digital+video": 12000, "digital+physical": 12000, "video+physical": 8000,
                    "all": 16000},
        "custom": {"digital": 10000, "video": 5000, "physical": 5000,
                   "digital+video": 15000, "digital+physical": 15000, "video+physical": 10000,
                   "all": 20000},
    }
    for _tier, _combo_totals in _INVITATION_TOTALS.items():
        for _combo in _COMBOS:
            _combo_key = "+".join(_combo) if len(_combo) > 1 and len(_combo) < 3 else \
                ("all" if len(_combo) == 3 else _combo[0])
            assert invitation_total(_tier, _combo) == _combo_totals[_combo_key], \
                (_tier, _combo, invitation_total(_tier, _combo), _combo_totals[_combo_key])

    # 6. Face match SKUs + Custom is a ValueError (WhatsApp quote, no fixed price).
    assert face_match_price(2000) == 5000
    assert face_match_price(3000) == 7000
    assert face_match_price(5000) == 10000
    try:
        face_match_price(2500)
        raise AssertionError("expected ValueError for unknown photo count")
    except ValueError:
        pass

    # 7b. portfolio_tier stays "basic"|"premium" only (see the truthful-
    #     differentiation note above PORTFOLIO_PLANS) — a third value (e.g.
    #     "pro") silently downgrades Advanced/Custom in portfolio_service and
    #     photographer_directory's tier-name fallback.
    for _p in PORTFOLIO_PLANS:
        _expect_tier = "basic" if _p["key"] == "basic" else "premium"
        assert _p["portfolio_tier"] == _expect_tier, (_p["key"], _p["portfolio_tier"])

    # 7. gst_included_paise reconstructs final; every field is int.
    for _base, _setup in ((499, 0), (1999, 5000), (299, 0)):
        for _c in _CYCLE_ORDER:
            _bd = compute_cycle_breakdown(_base, _c, setup_fee_inr=_setup)
            assert all(isinstance(v, int) for k, v in _bd.items() if k not in ("cycle", "label")), _bd
            assert _bd["gst_included_paise"] + round(_bd["final_paise"] / 1.18) == _bd["final_paise"], _bd

    print("pricing_catalog self-check OK: "
          f"{len(_ROUNDING_EXAMPLES)} rounding examples, "
          f"{len(_PORTFOLIO_MATRIX)} portfolio rows x 4 cycles, "
          f"{len(STORAGE_TIERS)} storage tiers, "
          f"{len(_INVITATION_TOTALS) * len(_COMBOS)} invitation combos, "
          f"{len(FACE_MATCH_TIERS)} face-match SKUs")
