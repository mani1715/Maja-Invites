"""
À-la-carte cart pricing self-test (store_features.quote_alacarte).

    cd backend && python -m tests.test_store_alacarte

The owner's actual model, replacing the ceremony packages the cart used to show:

    total = design price
          + each PAID feature the buyer picked   (priced individually)
          + each ADDITIONAL language             (priced individually)

with a set of BASIC features free on every design and the buyer's MAIN language
included. Proves the arithmetic, and the money-losing / money-taking edge cases:
an included feature can never be charged, the main language can never be billed
as an extra, duplicates are not double-charged, and unknown keys are dropped
rather than guessed at.

In-memory FakeDB; no network.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ.setdefault("STORAGE_CRED_KEY", Fernet.generate_key().decode())

from tests.test_storage_orchestrator import FakeDB
import store_features as store


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _fresh(seed_prices=True):
    db = FakeDB()
    await store.seed_alacarte_catalog(db)
    if seed_prices:
        await db.pricing_design_prices.insert_one({
            "audience": "normal_user", "design_id": "d1", "base_price": 3500})
    return db


async def test_defaults_seeded():
    print("\n[1] the catalogue seeds itself, so the cart is never empty")
    db = await _fresh()
    feats = await store._feature_map(db)
    langs = await store._language_map(db)
    _check(len(feats) == len(store.FEATURES), "every default feature is seeded")
    _check(len(langs) == len(store.LANGUAGE_CATALOG), "every default language is seeded")
    _check(all(f["price"] == 0 for f in feats.values() if f["included"]),
           "included features are free")
    _check(any(f["price"] > 0 for f in feats.values() if not f["included"]),
           "paid features carry a price")

    # A restart must not revert an owner's price edit.
    await db.store_features.update_one({"key": "qr_live_gallery"}, {"$set": {"price": 1234}})
    await store.seed_alacarte_catalog(db)
    again = await store._feature_map(db)
    _check(again["qr_live_gallery"]["price"] == 1234,
           "re-seeding does NOT overwrite an owner's edited price")


async def test_design_only():
    print("\n[2] design alone: design price, basics free, main language free")
    db = await _fresh()
    q = await store.quote_alacarte(db, "d1", main_language="telugu")
    _check(q["design_price_inr"] == 3500, "design price comes from the Pricing Hub row")
    _check(q["total_inr"] == 3500, "nothing else is charged")
    _check(q["features_total_inr"] == 0 and q["languages_total_inr"] == 0,
           "no feature or language charges")
    free_count = sum(1 for v in store.FEATURES.values() if v.get("included"))
    _check(len(q["included_features"]) == free_count,
           "every free basic is listed for the buyer")
    _check(all(f["price"] == 0 for f in q["included_features"]), "listed basics are ₹0")
    _check(q["main_language"] == "telugu" and q["main_language_label"] == "Telugu",
           "main language is honoured and labelled")
    _check(q["pricing_model"] == "alacarte", "quote declares the pricing model")


async def test_features_and_languages_add_up():
    print("\n[3] each feature and each extra language is added on its own")
    db = await _fresh()
    feats = await store._feature_map(db)
    langs = await store._language_map(db)
    picked = ["qr_live_gallery", "ai_face_match"]
    extra = ["hindi", "tamil"]
    expect = 3500 + sum(feats[k]["price"] for k in picked) + sum(langs[k]["price"] for k in extra)

    q = await store.quote_alacarte(db, "d1", features=picked,
                                   main_language="telugu", extra_languages=extra)
    _check(q["features_total_inr"] == sum(feats[k]["price"] for k in picked),
           "features total is the sum of their individual prices")
    _check(q["languages_total_inr"] == sum(langs[k]["price"] for k in extra),
           "languages total is the sum of their individual prices")
    _check(q["total_inr"] == expect, f"total = design + features + languages ({expect})")
    _check([f["key"] for f in q["features"]] == picked, "every picked feature is a line item")
    # Line items come out in CATALOGUE order (tamil sorts before hindi), not in
    # the order the buyer happened to tick them — a stable, readable receipt.
    _check([l["key"] for l in q["extra_languages"]] == ["tamil", "hindi"],
           "every extra language is a line item, in catalogue order")


async def test_included_features_are_never_charged():
    print("\n[4] an included feature can never be billed")
    db = await _fresh()
    # A buyer (or a tampered request) asking to "buy" a free feature.
    q = await store.quote_alacarte(db, "d1", features=["rsvp", "countdown", "maps"],
                                   main_language="english")
    _check(q["features"] == [], "free features are not turned into paid line items")
    _check(q["total_inr"] == 3500, "the total is unchanged")

    # An owner mis-typing a price onto an included row must not start charging.
    await db.store_features.update_one({"key": "rsvp"}, {"$set": {"price": 999}})
    feats = await store._feature_map(db)
    _check(feats["rsvp"]["price"] == 0,
           "a price on an INCLUDED row is forced to ₹0, not silently charged")


async def test_main_language_is_never_charged_twice():
    print("\n[5] the main language is never also billed as an extra")
    db = await _fresh()
    q = await store.quote_alacarte(db, "d1", main_language="hindi",
                                   extra_languages=["hindi", "hindi", "tamil"])
    keys = [l["key"] for l in q["extra_languages"]]
    _check(keys == ["tamil"], "the main language is dropped from the paid extras")
    langs = await store._language_map(db)
    _check(q["total_inr"] == 3500 + langs["tamil"]["price"], "only the real extra is charged")


async def test_duplicates_and_unknown_keys():
    print("\n[6] duplicates and unknown keys cannot inflate the bill")
    db = await _fresh()
    feats = await store._feature_map(db)
    q = await store.quote_alacarte(
        db, "d1",
        features=["qr_live_gallery", "qr_live_gallery", "not_a_real_feature", ""],
        main_language="english", extra_languages=["klingon", "tamil", "tamil"])
    _check([f["key"] for f in q["features"]] == ["qr_live_gallery"],
           "a repeated feature is charged once and an unknown key is dropped")
    _check([l["key"] for l in q["extra_languages"]] == ["tamil"],
           "a repeated language is charged once and an unknown one is dropped")
    langs = await store._language_map(db)
    _check(q["total_inr"] == 3500 + feats["qr_live_gallery"]["price"] + langs["tamil"]["price"],
           "the total reflects exactly one of each")


async def test_price_source_precedence():
    print("\n[7] design price precedence: design row > theme bundle > default")
    db = FakeDB()
    await store.seed_alacarte_catalog(db)
    d = await store.design_price_inr(db, "unpriced")
    _check(d["price_inr"] == store.DEFAULT_DESIGN_PRICE_INR and d["source"] == "default",
           "an unpriced design falls back to the default")

    await db.theme_bundle_pricing.insert_one({"theme_id": "t1", "inr_price": 4200, "label": "Temple"})
    d = await store.design_price_inr(db, "unpriced", "t1")
    _check(d["price_inr"] == 4200 and d["source"] == "theme", "a theme bundle price wins over the default")

    await db.pricing_design_prices.insert_one({
        "audience": "normal_user", "design_id": "unpriced", "base_price": 5000})
    d = await store.design_price_inr(db, "unpriced", "t1")
    _check(d["price_inr"] == 5000 and d["source"] == "design", "the per-design price wins over the theme")

    await db.pricing_design_prices.update_one(
        {"design_id": "unpriced"}, {"$set": {"discount_enabled": True, "discount_price": 3999}})
    d = await store.design_price_inr(db, "unpriced", "t1")
    _check(d["price_inr"] == 3999, "an active discount wins over the base price")


async def test_legacy_mirrors():
    print("\n[8] order records / fulfillment console keep working")
    db = await _fresh()
    q = await store.quote_alacarte(db, "d1", features=["qr_live_gallery"],
                                   main_language="telugu", extra_languages=["hindi"])
    for k in ("package", "package_label", "language", "base_inr", "addons", "addon_total_inr"):
        _check(k in q, f"legacy key `{k}` is still present for existing consumers")
    _check(q["language"] == "telugu", "legacy `language` mirrors the main language")
    _check(q["base_inr"] == q["design_price_inr"], "legacy `base_inr` is the design price")
    _check(len(q["addons"]) == 2, "features + extra languages both appear as legacy add-ons")
    _check(q["base_inr"] + q["addon_total_inr"] == q["total_inr"],
           "the legacy breakdown still sums to the same total")


async def test_qr_password_is_never_stored_in_plaintext():
    print("\n[9] the QR password the buyer types is hashed, never stored readable")
    secret = "Maja2026"
    info = {"bride_name": "A", "extra": {"qr_gallery": {"protect": True, "password": secret}}}
    out = store.hash_qr_password(info)
    qr = out["extra"]["qr_gallery"]
    _check("password" not in qr, "the plaintext password is not kept")
    _check(secret not in str(out), "the password appears nowhere in the stored order info")
    _check(qr["has_password"] is True and qr["protect"] is True,
           "the order records THAT a password is set")
    _check(qr["password_hash"].startswith("$2"), "it is stored as a bcrypt hash")

    from auth import verify_password
    _check(verify_password(secret, qr["password_hash"]),
           "the hash verifies the real password, so the studio can apply it")
    _check(not verify_password("wrong", qr["password_hash"]), "a wrong password fails")

    # Unticking the box must not leave a readable password behind.
    off = store.hash_qr_password(
        {"extra": {"qr_gallery": {"protect": False, "password": secret}}})
    _check(secret not in str(off) and off["extra"]["qr_gallery"]["has_password"] is False,
           "turning protection OFF clears any plaintext already typed")

    # Absent / malformed input must not explode a details submission.
    _check(store.hash_qr_password({"extra": {}}) == {"extra": {}},
           "no qr_gallery block is left untouched")
    _check("extra" not in store.hash_qr_password({"bride_name": "A"}),
           "info without an extra block is returned unchanged")


async def main():
    print("MAJA — cart à-la-carte pricing (design + features + languages)")
    await test_defaults_seeded()
    await test_design_only()
    await test_features_and_languages_add_up()
    await test_included_features_are_never_charged()
    await test_main_language_is_never_charged_twice()
    await test_duplicates_and_unknown_keys()
    await test_price_source_precedence()
    await test_legacy_mirrors()
    await test_qr_password_is_never_stored_in_plaintext()
    print("\nALL À-LA-CARTE PRICING CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
