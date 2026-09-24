"""
test_media_derivatives.py - pure Pillow tests for media_derivatives.py.
No DB, no FakeDB - these are pure function tests over synthetic in-memory
images.

    cd backend && python -m tests.test_media_derivatives
"""
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image                                          # noqa: E402
import media_derivatives as md                                  # noqa: E402

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


def _make_jpeg_bytes(w, h, color=(30, 90, 160)) -> bytes:
    im = Image.new("RGB", (w, h), color)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def main():
    # --- original passthrough is byte-identical --------------------------
    src = _make_jpeg_bytes(3000, 2000)
    result = md.make_standard_set(src)
    ok("original passthrough is byte-identical", result["original"] == src)

    # --- preview <= 2048w --------------------------------------------------
    preview_bytes, pw, ph = result["preview"]
    ok("preview width <= 2048", pw <= 2048)
    ok("preview is JPEG", Image.open(io.BytesIO(preview_bytes)).format == "JPEG")
    ok("preview aspect preserved", round(pw / ph, 2) == round(3000 / 2000, 2))

    # --- thumb <= 480w, WEBP -------------------------------------------------
    thumb_bytes, tw, th = result["thumb"]
    ok("thumb width <= 480", tw <= 480)
    ok("thumb is WEBP", Image.open(io.BytesIO(thumb_bytes)).format == "WEBP")

    # --- no upscale: source narrower than target stays untouched in width --
    small_src = _make_jpeg_bytes(200, 100)
    small_result = md.make_standard_set(small_src)
    _, spw, sph = small_result["preview"]
    ok("no upscale beyond source width", spw == 200)

    # --- EXIF orientation 6 comes out rotated (dims swap) -------------------
    im = Image.new("RGB", (40, 20), (0, 0, 0))
    im.putpixel((0, 0), (255, 0, 0))
    exif = Image.Exif()
    exif[274] = 6  # Orientation tag, value 6 = needs 90-degree correction
    buf = io.BytesIO()
    im.save(buf, format="JPEG", exif=exif.tobytes())
    rotated = md.normalize(buf.getvalue())
    ok("EXIF orientation 6 swaps dimensions (40x20 -> 20x40)",
       rotated.size == (20, 40))

    # --- make_variant one-shot ------------------------------------------
    vbytes, vw, vh = md.make_variant(src, width=640, fmt="WEBP", quality=70)
    ok("make_variant resizes to requested width", vw == 640)
    ok("make_variant returns matching dims", (vw, vh) == md.image_dimensions(vbytes))

    # --- image_dimensions tolerant helper ---------------------------------
    ok("image_dimensions reads a valid image", md.image_dimensions(src) == (3000, 2000))
    ok("image_dimensions tolerates garbage", md.image_dimensions(b"not an image") == (0, 0))

    # --- undecodable bytes raise ValueError -------------------------------
    raised = False
    try:
        md.normalize(b"this is definitely not an image")
    except ValueError:
        raised = True
    ok("undecodable bytes raise ValueError", raised)

    print(f"\nmedia_derivatives: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    main()
    sys.exit(1 if FAIL else 0)
