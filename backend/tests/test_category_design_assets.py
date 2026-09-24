"""Every artwork path the category API hands out must resolve to a real file.

WHY THIS EXISTS. `wedding.cover_preview` pointed at
`/designs/all/Mughal/Engagement/Engagement%20template.webp` for as long as this
module has existed. `/designs/all/` is the LEGACY asset tree; it was never
carried into this repo. Nothing caught it, because a missing static file under
the SPA does not 404 — Vite and the production Caddyfile both answer 200 with
`index.html`, so a status-code check passes and the browser simply fails to
decode an image it was told it had.

So this test does not ask the server. It resolves each path against
`frontend-v2/public` and requires the file to be on disk. Any future edit that
renames, moves or mistypes an asset fails here instead of showing a visitor an
empty tile.

Both fields are checked for every design: `thumbnail` (480px WebP, what the
grids load) and `preview_image` (the original, what the full view loads). They
are deliberately different files now — see `_thumb` in invitation_categories.py.
"""
import sys
from pathlib import Path
from urllib.parse import unquote

import pytest

BACKEND = Path(__file__).resolve().parents[1]
# The suite has no backend-level conftest; `tests/live.py` puts backend/ on the
# path only when a test asks for a database. This module imports a backend
# module directly and needs it before collection.
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from invitation_categories import CATEGORY_DESIGNS, CATEGORY_META  # noqa: E402

PUBLIC = BACKEND.parent / "frontend-v2" / "public"


def _resolve(web_path: str) -> Path:
    """A served path (`/designs/...`) as a file under frontend-v2/public."""
    return PUBLIC / unquote(web_path).lstrip("/")


def test_public_dir_is_where_we_think_it_is():
    # If this moves, every assertion below would pass vacuously by failing for
    # the wrong reason — or worse, be skipped.
    assert (PUBLIC / "designs").is_dir(), f"no design tree under {PUBLIC}"


@pytest.mark.parametrize("category_id", sorted(CATEGORY_META))
def test_category_cover_exists(category_id):
    cover = CATEGORY_META[category_id].get("cover_preview")
    assert cover, f"{category_id} has no cover_preview"
    path = _resolve(cover)
    assert path.is_file(), f"{category_id} cover_preview {cover} is not a file ({path})"
    assert path.stat().st_size > 0, f"{category_id} cover_preview is empty"


@pytest.mark.parametrize(
    "category_id,design",
    [(c, d) for c, designs in CATEGORY_DESIGNS.items() for d in designs],
    ids=[d["design_id"] for designs in CATEGORY_DESIGNS.values() for d in designs],
)
def test_design_artwork_exists(category_id, design):
    for field in ("preview_image", "thumbnail"):
        ref = design.get(field)
        assert ref, f"{design['design_id']} has no {field}"
        path = _resolve(ref)
        assert path.is_file(), f"{design['design_id']} {field} {ref} is not a file ({path})"
        assert path.stat().st_size > 0, f"{design['design_id']} {field} is empty"


@pytest.mark.parametrize(
    "design",
    [d for designs in CATEGORY_DESIGNS.values() for d in designs],
    ids=[d["design_id"] for designs in CATEGORY_DESIGNS.values() for d in designs],
)
def test_thumbnail_is_smaller_than_the_original(design):
    """The point of the thumbnail is weight. dhoti_2.png is 6.1 MB; a grid tile
    that big is the reason this pass happened at all.

    STRICTLY smaller, and a different file. `<=` would have been satisfied by
    pointing `thumbnail` back at `preview_image` — which is precisely the
    regression this guards, and the first version of this assertion let a
    deliberate revert through.
    """
    assert design["thumbnail"] != design["preview_image"], (
        f"{design['design_id']}: thumbnail is the original file")
    original = _resolve(design["preview_image"]).stat().st_size
    thumb = _resolve(design["thumbnail"]).stat().st_size
    assert thumb < original, (
        f"{design['design_id']}: thumbnail ({thumb} B) is not smaller than the "
        f"original ({original} B) — regenerate with "
        f"scripts/optimize_category_designs.py")
