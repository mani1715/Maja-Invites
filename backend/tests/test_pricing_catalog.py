"""
test_pricing_catalog.py — pytest translation of pricing_catalog.py's self-check.

    cd backend && PYTHONIOENCODING=utf-8 python -m pytest tests/test_pricing_catalog.py -q

Pure logic module: no DB, no live server, no fixtures beyond the sys.path
insert every backend test file needs (backend/ has no __init__.py, so it is
not importable as a package — see test_backup_quota.py for the same pattern).
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pricing_catalog import (
    CYCLES, CYCLE_ALIASES, FACE_MATCH_TIERS, INVITATION_TIERS, PORTFOLIO_PLANS,
    STORAGE_TIERS, compute_cycle_breakdown, face_match_price, invitation_total,
    psychological_price_paise,
)

_CYCLE_ORDER = ["monthly", "quarterly", "half_yearly", "yearly"]

# All 19 owner-verified rounding examples (paise in/out). The plan document
# says "21 owner examples" in prose but the task spec enumerates exactly
# these 19 — asserting only what was actually given, not inventing 2 more.
ROUNDING_EXAMPLES = [
    (400000, 399900), (410000, 409900), (485460, 479900), (508980, 499900),
    (1255460, 1249900), (142215, 139900), (269460, 269900), (256215, 249900),
    (916980, 909900), (398715, 389900), (755460, 749900), (1426980, 1419900),
    (569715, 569900), (1079460, 1079900), (2038980, 2039900), (1069715, 1069900),
    (1579460, 1579900), (2538980, 2539900), (384700, 379900),
]


@pytest.mark.parametrize("paise_in,paise_out", ROUNDING_EXAMPLES)
def test_psychological_rounding_examples(paise_in, paise_out):
    assert psychological_price_paise(paise_in) == paise_out


def test_psychological_rounding_passthrough_at_or_below_100():
    assert psychological_price_paise(0) == 0
    assert psychological_price_paise(100_00) == 100_00


PORTFOLIO_MATRIX = {
    "basic": (499, 0, [499, 1399, 2699, 4999]),
    "pro": (899, 0, [899, 2499, 4799, 9099]),
    "advanced": (1399, 0, [1399, 3899, 7499, 14199]),
    "premium": (1999, 0, [1999, 5699, 10799, 20399]),
    "custom_with_setup": (1999, 5000, [6999, 10699, 15799, 25399]),
}


@pytest.mark.parametrize("plan_name,base,setup,expected", [
    (n, b, s, e) for n, (b, s, e) in PORTFOLIO_MATRIX.items()
])
def test_portfolio_finals_matrix(plan_name, base, setup, expected):
    got = [compute_cycle_breakdown(base, c, setup_fee_inr=setup)["final_paise"] // 100
           for c in _CYCLE_ORDER]
    assert got == expected


def test_custom_without_setup_fee_equals_premium():
    custom_nosetup = [compute_cycle_breakdown(1999, c, setup_fee_inr=0)["final_paise"] // 100
                       for c in _CYCLE_ORDER]
    assert custom_nosetup == PORTFOLIO_MATRIX["premium"][2]


def test_monthly_passthrough_no_rounding():
    # 499 rounded to psychological would be 399 -- monthly must NOT do that.
    assert compute_cycle_breakdown(499, "monthly")["final_paise"] == 49900


@pytest.mark.parametrize("alias,canonical", CYCLE_ALIASES.items())
def test_cycle_aliases_map_to_canonical(alias, canonical):
    by_alias = compute_cycle_breakdown(499, alias)
    by_canonical = compute_cycle_breakdown(499, canonical)
    assert by_alias == by_canonical
    assert by_alias["cycle"] == canonical


def test_unknown_cycle_raises():
    with pytest.raises(ValueError):
        compute_cycle_breakdown(499, "fortnightly")


def test_storage_50gb_and_1tb_computed_cycles():
    t50 = next(t for t in STORAGE_TIERS if t["gb"] == 50)
    assert t50["approved"] is True
    assert t50["cycle_prices_inr"] == {"30": 299, "90": 799, "180": 1599, "365": 2999}

    t1tb = next(t for t in STORAGE_TIERS if t["gb"] == 1024)
    assert t1tb["approved"] is True
    assert t1tb["cycle_prices_inr"] == {"30": 2999, "90": 8499, "180": 16199, "365": 30599}


def test_storage_frozen_middle_tiers_carried_verbatim():
    frozen = {t["gb"]: t["cycle_prices_inr"] for t in STORAGE_TIERS if not t["approved"]}
    assert frozen == {
        100: {"30": 299, "90": 799, "180": 1499, "365": 2999},
        250: {"30": 599, "90": 1599, "180": 2999, "365": 5499},
        500: {"30": 999, "90": 2799, "180": 5299, "365": 8999},
    }


def test_no_750gb_storage_tier():
    assert 750 not in {t["gb"] for t in STORAGE_TIERS}
    assert {t["gb"] for t in STORAGE_TIERS} == {50, 100, 250, 500, 1024}


INVITATION_TOTALS = {
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
_COMBOS = [["digital"], ["video"], ["physical"],
           ["digital", "video"], ["digital", "physical"], ["video", "physical"],
           ["digital", "video", "physical"]]


def _combo_key(combo):
    if len(combo) == 3:
        return "all"
    if len(combo) == 1:
        return combo[0]
    return "+".join(combo)


@pytest.mark.parametrize("tier", ["basic", "premium", "custom"])
@pytest.mark.parametrize("combo", _COMBOS, ids=lambda c: "+".join(c))
def test_invitation_combos(tier, combo):
    assert invitation_total(tier, combo) == INVITATION_TOTALS[tier][_combo_key(combo)]


def test_invitation_components_validation():
    with pytest.raises(ValueError):
        invitation_total("basic", [])
    with pytest.raises(ValueError):
        invitation_total("basic", ["digital", "digital"])
    with pytest.raises(ValueError):
        invitation_total("basic", ["digital", "catering"])
    with pytest.raises(ValueError):
        invitation_total("platinum", ["digital"])


@pytest.mark.parametrize("photos,price", [(2000, 5000), (3000, 7000), (5000, 10000)])
def test_face_match_price(photos, price):
    assert face_match_price(photos) == price


def test_face_match_price_unknown_count_raises():
    with pytest.raises(ValueError):
        face_match_price(2500)


@pytest.mark.parametrize("plan", PORTFOLIO_PLANS, ids=lambda p: p["key"])
@pytest.mark.parametrize("cycle", _CYCLE_ORDER)
def test_gst_included_paise_reconstructs_final(plan, cycle):
    bd = compute_cycle_breakdown(plan["base_monthly_inr"], cycle,
                                  setup_fee_inr=plan["setup_fee_inr"])
    assert bd["gst_included_paise"] + round(bd["final_paise"] / 1.18) == bd["final_paise"]
    for key, value in bd.items():
        if key not in ("cycle", "label"):
            assert isinstance(value, int), (key, value)


def test_save_and_extra_saving_bump_up_case():
    # Basic (Rs499) half-yearly: pre_round_paise lands exactly on 269460,
    # which bumps UP to 269900 (§1: within Rs10, same thousand block) --
    # final > pre_round, so extra_saving is False and the psych adjustment
    # is positive.
    bd = compute_cycle_breakdown(499, "half_yearly")
    assert bd["pre_round_paise"] == 269460
    assert bd["final_paise"] == 269900
    assert bd["extra_saving"] is False
    assert bd["psych_adjustment_paise"] == 440
    assert bd["psych_adjustment_paise"] > 0
    assert bd["save_paise"] == bd["list_paise"] - bd["final_paise"]


def test_save_and_extra_saving_round_down_case():
    # Pro (Rs899) half-yearly: pre_round_paise lands exactly on 485460,
    # which rounds DOWN to 479900 (bumping to 485900 would cross the Rs5,000
    # thousand-block boundary) -- final < pre_round, extra_saving True.
    bd = compute_cycle_breakdown(899, "half_yearly")
    assert bd["pre_round_paise"] == 485460
    assert bd["final_paise"] == 479900
    assert bd["extra_saving"] is True
    assert bd["psych_adjustment_paise"] == -5560
    assert bd["psych_adjustment_paise"] < 0
    assert bd["save_paise"] == bd["list_paise"] - bd["final_paise"]


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-q"]))
