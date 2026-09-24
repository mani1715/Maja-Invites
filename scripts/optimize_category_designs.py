"""Build 480px WebP thumbnails for the celebration-category design galleries.

WHY. The four non-wedding categories ship their artwork as the files the
designer handed over: `public/designs/categories/dhoti/` alone is 12 MB across
seven images, four of them multi-megabyte PNGs (dhoti_2.png is 6.1 MB). That was
survivable while nothing rendered them; the home-page showcase now does, and a
visitor who taps the Dhoti tab would pull 12 MB of artwork to look at seven
thumbnails.

WHAT IT DOES. Writes `<category>/opt/<stem>-480.webp` beside the originals —
480px on the long edge, quality 82 — and leaves the originals untouched, because
they are what the full-size preview and the printed card need.

The originals stay in git; only the thumbnails are added. This is the same
480/960 arrangement `lib/designCatalogue.js` already uses for the 188 wedding
designs, so the two galleries resolve artwork the same way.

Run:  python scripts/optimize_category_designs.py
Idempotent — skips any thumbnail newer than its source.
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - operator feedback, not a code path
    sys.exit("Pillow is required: pip install Pillow")

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES_DIR = ROOT / "frontend-v2" / "public" / "designs" / "categories"
LONG_EDGE = 480
QUALITY = 82
SOURCE_SUFFIXES = {".jpg", ".jpeg", ".png"}


def optimise(src: Path, out: Path) -> tuple[int, int]:
    """Write one thumbnail. Returns (source bytes, thumbnail bytes)."""
    with Image.open(src) as im:
        # A palette or LA image converted straight to RGB loses transparency to
        # black; going through RGBA and compositing onto white keeps the card
        # looking like the card.
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            flat = Image.new("RGB", im.size, (255, 255, 255))
            flat.paste(im, mask=im.split()[-1])
            im = flat
        else:
            im = im.convert("RGB")
        im.thumbnail((LONG_EDGE, LONG_EDGE), Image.LANCZOS)
        out.parent.mkdir(parents=True, exist_ok=True)
        im.save(out, "WEBP", quality=QUALITY, method=6)
    return src.stat().st_size, out.stat().st_size


def main() -> int:
    if not CATEGORIES_DIR.is_dir():
        sys.exit(f"not found: {CATEGORIES_DIR}")

    total_src = total_out = 0
    written = skipped = 0

    for category_dir in sorted(p for p in CATEGORIES_DIR.iterdir() if p.is_dir()):
        for src in sorted(category_dir.iterdir()):
            if src.suffix.lower() not in SOURCE_SUFFIXES or not src.is_file():
                continue
            out = category_dir / "opt" / f"{src.stem}-{LONG_EDGE}.webp"
            if out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
                skipped += 1
                continue
            s, o = optimise(src, out)
            total_src += s
            total_out += o
            written += 1
            print(f"{src.relative_to(CATEGORIES_DIR)}  {s // 1024:>6} KB -> {o // 1024:>5} KB")

    print(f"\n{written} written, {skipped} already current")
    if written:
        print(f"{total_src // 1024} KB -> {total_out // 1024} KB "
              f"({100 - (total_out * 100 // max(total_src, 1))}% smaller)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
