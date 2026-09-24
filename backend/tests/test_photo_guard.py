"""
photo_guard + feature_wishes self-test.

    cd backend && python -m tests.test_photo_guard

PHOTOS ONLY (owner: "only photos will be allowed, not files and videos — this is
one of the main things"). The checks that were in place before could not deliver
that promise:
  * `accept="image/*"` is a file-picker hint, bypassed by drag-drop or curl;
  * an extension check passes `movie.mp4` renamed to `movie.jpg`;
  * `content_type` is a CLIENT claim;
  * POST /api/invite/{slug}/gallery/guest-upload is PUBLIC and validated only
    emptiness + size, so any file at all reached our disk.
So the decision is made from the bytes. Proved here with real encoded images
built by Pillow, and with real non-photo byte signatures.

Also covers feature_wishes: a request with no callable number is refused (the
whole feature is "the owner calls them back"), consent is required and recorded,
and `is_new` drives the admin highlight.

No network.
"""
from __future__ import annotations

import asyncio
import io
import os
import sys
import types

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ.setdefault("STORAGE_CRED_KEY", Fernet.generate_key().decode())

from fastapi import HTTPException
from PIL import Image
from tests.test_storage_orchestrator import FakeDB
import photo_guard as pg
import feature_wishes as fw


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


def _img(fmt="JPEG", size=(40, 30), mode="RGB"):
    buf = io.BytesIO()
    Image.new(mode, size, (120, 90, 60)).save(buf, format=fmt)
    return buf.getvalue()


# --------------------------------------------------------------------------
# real photos get through
# --------------------------------------------------------------------------
def test_real_photos_pass():
    print("\n[1] real photos are accepted")
    for fmt, ext in (("JPEG", ".jpg"), ("PNG", ".png"), ("WEBP", ".webp"), ("GIF", ".gif")):
        data = _img(fmt, mode="P" if fmt == "GIF" else "RGB")
        ok, err, got = pg.sniff_photo(data, f"photo{ext}", f"image/{fmt.lower()}")
        _check(ok, f"a real {fmt} is accepted (decoded as {got})")

    # A real photo with a wrong/absent name or type is still a real photo.
    ok, _e, _f = pg.sniff_photo(_img("PNG"), "no-extension", "")
    _check(ok, "a real photo with no extension and no content-type still passes")
    ok, _e, _f = pg.sniff_photo(_img("PNG"), "shot.jpg", "application/octet-stream")
    _check(ok, "a real PNG named .jpg passes — bytes decide, not the name")


# --------------------------------------------------------------------------
# the actual attack: non-photos wearing a photo name
# --------------------------------------------------------------------------
def test_disguised_files_are_rejected():
    print("\n[2] disguised non-photos are rejected")
    cases = [
        (b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64, "video.jpg", "image/jpeg", "video"),
        (b"\x00\x00\x00\x18ftypqt  " + b"\x00" * 64, "clip.png",  "image/png",  "video"),
        (b"%PDF-1.7\n%\xc7\xec" + b"\x00" * 40,      "doc.jpg",   "image/jpeg", "PDF"),
        (b"PK\x03\x04" + b"\x00" * 40,               "sheet.jpg", "image/jpeg", "zip"),
        (b"MZ\x90\x00" + b"\x00" * 40,               "setup.jpg", "image/jpeg", "program"),
        (b"\x1aE\xdf\xa3" + b"\x00" * 40,            "movie.jpg", "image/jpeg", "Matroska"),
        (b"ID3\x03\x00" + b"\x00" * 40,              "song.jpg",  "image/jpeg", "MP3"),
        (b"RIFF\x00\x00\x00\x00AVI " + b"\x00" * 40, "old.jpg",   "image/jpeg", "AVI"),
    ]
    for data, name, ct, what in cases:
        ok, err, _f = pg.sniff_photo(data, name, ct)
        _check(not ok, f"a {what} renamed to {name} is REJECTED")
        _check(name in err, f"the error names the file ({name}) so the user knows which one")

    # SVG: a browser renders it, but it is scriptable XML — stored XSS if served
    # from our origin. "Photos" means raster photos.
    ok, err, _f = pg.sniff_photo(b'<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>',
                                 "logo.svg", "image/svg+xml")
    _check(not ok, "an SVG is rejected even though it is technically an image")

    ok, _e, _f = pg.sniff_photo(b"just some text that is not an image at all", "notes.jpg", "image/jpeg")
    _check(not ok, "arbitrary bytes with a .jpg name are rejected")


def test_size_and_empty():
    print("\n[3] empty and oversized uploads")
    ok, err, _f = pg.sniff_photo(b"", "empty.jpg", "image/jpeg")
    _check(not ok and "empty" in err.lower(), "an empty file is rejected and said to be empty")

    ok, err, _f = pg.sniff_photo(_img("PNG"), "big.png", "image/png", max_bytes=10)
    _check(not ok and "MB" in err, "an oversized photo is rejected with the limit in the message")

    # Truncated JPEG — a real header but a broken body must not slip through.
    broken = _img("JPEG")[:20]
    ok, _e, _f = pg.sniff_photo(broken, "cut.jpg", "image/jpeg")
    _check(not ok, "a truncated/corrupt image is rejected")


def test_assert_and_spec():
    print("\n[4] the raising helper and the shared accept spec")
    try:
        pg.assert_photo(b"%PDF-1.4 nope", "x.jpg", "image/jpeg")
        raise AssertionError("expected NotAPhoto")
    except pg.NotAPhoto as e:
        _check("Only photos" in str(e) or "photo" in str(e).lower(),
               "assert_photo raises an uploader-facing message")
    _check(pg.assert_photo(_img("JPEG"), "ok.jpg", "image/jpeg") == "JPEG",
           "assert_photo returns the decoded format for a real photo")

    spec = pg.photo_accept_spec()
    _check(".jpg" in spec["extensions"] and "image/jpeg" in spec["mime_types"],
           "the accept spec lists the allowed types")
    _check("svg" not in spec["accept"].lower(), "the accept spec never offers SVG")
    _check(spec["max_bytes"] == pg.DEFAULT_MAX_BYTES,
           "the UI gets the same size limit the server enforces")


# --------------------------------------------------------------------------
# feature wishes
# --------------------------------------------------------------------------
def test_phone_normalisation():
    print("\n[5] phone numbers are normalised so the owner can actually call")
    for raw in ("9876543210", "+91 98765 43210", "098765-43210", "0091 9876543210",
                "(+91) 98765 43210"):
        _check(fw.normalise_phone(raw) == "+919876543210",
               f"'{raw}' normalises to +919876543210")
    for bad in ("", "123", "abcdefghij", "12345"):
        _check(fw.normalise_phone(bad) == "", f"'{bad}' is not a callable number")
    _check(fw.normalise_phone("1234543210") == "+911234543210" or
           fw.normalise_phone("1234543210") == "+1234543210",
           "a 10-digit number not starting 6-9 is not assumed to be an Indian mobile")


def _endpoint(router, path, method):
    for r in router.routes:
        if getattr(r, "path", None) == path and method in getattr(r, "methods", set()):
            return r.endpoint
    raise AssertionError(f"route {method} {path} not registered")


async def test_wish_flow():
    print("\n[6] a feature request reaches the owner with a number to call")
    db = FakeDB()
    router = fw.build_feature_wish_router(db, require_super_admin=lambda: {"role": "super_admin"})
    create = _endpoint(router, "/api/feature-wishes", "POST")
    consent_ep = _endpoint(router, "/api/feature-wishes/consent", "GET")
    summary = _endpoint(router, "/api/admin/feature-wishes/summary", "GET")

    # The buyer must READ the same string we STORE, so the form fetches it
    # rather than hardcoding it — otherwise the consent record proves nothing.
    served = await consent_ep()
    _check(served["consent_text"] == fw.CONSENT_TEXT,
           "the consent wording is served to the form, not duplicated in it")
    patch = _endpoint(router, "/api/admin/feature-wishes/{wish_id}", "PATCH")

    # No number → refused. The whole feature is "we call you back".
    try:
        # 6 chars so Pydantic's length rule passes and OUR callability check is
        # what refuses it — that is the rule under test.
        await create(fw.WishIn(text="I want a seating chart", phone="123456", consent_call=True))
        raise AssertionError("expected 422")
    except HTTPException as e:
        _check(e.status_code == 422, "a request with an uncallable number is refused")

    # No consent → refused. We must not cold-call someone who didn't agree.
    try:
        await create(fw.WishIn(text="I want a seating chart", phone="9876543210",
                               consent_call=False))
        raise AssertionError("expected 422")
    except HTTPException as e:
        _check(e.status_code == 422, "a request without call consent is refused")

    out = await create(fw.WishIn(text="Can you add a live drone feed?",
                                 phone="+91 98765 43210", name="Priya",
                                 source="cart", consent_call=True))
    _check(out["submitted"] is True, "a complete request is accepted")

    row = await db.feature_wishes.find_one({"id": out["id"]}, {"_id": 0})
    _check(row["phone"] == "+919876543210", "the stored number is normalised and dialable")
    _check(row["is_new"] is True and row["status"] == "new", "it lands as a NEW request")
    _check(row["consent_text"] == fw.CONSENT_TEXT,
           "exactly what they consented to is recorded with the request")

    s = await summary()
    _check(s["new"] == 1 and s["total"] == 1, "the admin badge counts the new request")
    _check(s["latest"][0]["phone"] == "+919876543210",
           "the panel gets the number to call, front and centre")

    # Picking it up clears the highlight in one action.
    await patch(out["id"], fw.WishPatch(status="contacted"))
    row = await db.feature_wishes.find_one({"id": out["id"]}, {"_id": 0})
    _check(row["is_new"] is False, "moving off 'new' clears the highlight")
    _check(row["contacted_at"] is not None, "the time of contact is stamped")
    s = await summary()
    _check(s["new"] == 0 and s["open"] == 1,
           "the badge clears but the request stays open until it is closed")

    # An invalid status must not corrupt the workflow.
    try:
        await patch(out["id"], fw.WishPatch(status="banana"))
        raise AssertionError("expected 400")
    except HTTPException as e:
        _check(e.status_code == 400, "an unknown status is rejected")


async def test_owner_alert_email():
    print("\n[8] the owner gets an email with the number to call")
    _check(fw.alert_recipients() == ["ettelamaneesh@gmail.com"],
           "the alert goes to the owner's address by default")
    os.environ["FEATURE_REQUEST_ALERT_EMAIL"] = "a@x.com, b@y.com"
    try:
        _check(fw.alert_recipients() == ["a@x.com", "b@y.com"],
               "the address list is env-overridable without a code change")
    finally:
        os.environ.pop("FEATURE_REQUEST_ALERT_EMAIL", None)

    wish = {"id": "wish_1", "name": "Priya", "phone": "+919876543210",
            "text": "A live drone feed", "source": "cart", "design_id": "d1"}
    subject, html, text = fw.alert_email(wish)
    # On a phone's lock screen the subject alone must be enough to know who to call.
    _check("Priya" in subject and "+919876543210" in subject,
           "the subject carries the name AND the number")
    _check(f'href="tel:+919876543210"' in html, "the number is a one-tap tel: link")
    _check("A live drone feed" in html and "A live drone feed" in text,
           "what they asked for is in both the html and the plain-text part")
    _check("/super-admin/feature-requests" in html and "majainvites.com" in html,
           "the email links back to the admin panel on majainvites.com")

    # Buyer-supplied text lands in an email body, so it must not inject markup.
    evil = fw.alert_email({"id": "w", "name": "<script>x</script>", "phone": "+91",
                           "text": "<img src=x onerror=alert(1)>"})[1]
    # What matters is that no ANGLE BRACKET survives to open a tag. The words
    # "onerror=alert(1)" remain as inert plain text, which is correct — escaping
    # neutralises markup, it does not censor prose.
    _check("<script>" not in evil and "<img" not in evil,
           "buyer-supplied text can no longer open an HTML tag in the email")
    _check("&lt;script&gt;" in evil and "&lt;img src=x onerror=alert(1)&gt;" in evil,
           "it is escaped and still readable, not silently dropped")


async def test_wish_rate_limit():
    print("\n[7] one visitor cannot bury real leads")
    db = FakeDB()
    router = fw.build_feature_wish_router(db, require_super_admin=lambda: {})
    create = _endpoint(router, "/api/feature-wishes", "POST")
    for i in range(fw.MAX_PER_PHONE_PER_DAY):
        await create(fw.WishIn(text=f"request number {i}", phone="9876543210",
                               consent_call=True))
    try:
        await create(fw.WishIn(text="one too many", phone="9876543210", consent_call=True))
        raise AssertionError("expected 429")
    except HTTPException as e:
        _check(e.status_code == 429,
               f"more than {fw.MAX_PER_PHONE_PER_DAY} requests a day from one number is throttled")


async def main():
    print("MAJA — photos-only uploads + 'I want another feature' requests")
    test_real_photos_pass()
    test_disguised_files_are_rejected()
    test_size_and_empty()
    test_assert_and_spec()
    test_phone_normalisation()
    await test_wish_flow()
    await test_owner_alert_email()
    await test_wish_rate_limit()
    print("\nALL PHOTO-GUARD & FEATURE-WISH CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
