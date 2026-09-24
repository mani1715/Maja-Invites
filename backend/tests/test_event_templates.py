"""
Self-test for the event template catalog (design assets integration).

    cd backend && python -m tests.test_event_templates

Proves the 10 approved Ganesh artworks are cataloged, the registry sources its
template options + default from the catalog (config-driven, not hardcoded), and the
optimized WebP asset files actually exist on disk.
"""
from __future__ import annotations

import os

import event_templates as tpl
import event_registry as registry

ASSET_ROOT = os.path.join(os.path.dirname(__file__), "..", "..",
                          "frontend", "public", "assets", "designs")


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


def run():
    print("1. catalog")
    tps = tpl.templates_for("ganesh_chaturthi")
    _check(len(tps) == 10, "10 Ganesh templates cataloged")
    _check(tpl.get_template("ganesh_chaturthi", "royal_autumn")["name"] == "Royal Autumn",
           "get_template resolves by id")
    _check(tpl.get_template("ganesh_chaturthi", "nope") is None, "unknown template → None")
    _check(tpl.default_template("ganesh_chaturthi") == "royal_autumn", "default is the first design")
    _check(len(tpl.template_options("ganesh_chaturthi")) == 10, "10 select options")

    print("2. registry sources from the catalog (config-driven)")
    cfg = registry.get_config("ganesh_chaturthi")
    _check(cfg["default_template"] == "royal_autumn", "registry default from catalog")
    _check(set(cfg["layouts"]) == set(tpl.template_ids("ganesh_chaturthi")), "layouts = catalog ids")
    theme = [s for s in cfg["sections"] if s["key"] == "theme_selection"][0]
    tf = [f for f in theme["fields"] if f["key"] == "template"][0]
    _check(tf["type"] == "template" and len(tf["options"]) == 10,
           "theme template field is the visual picker with 10 options")

    print("3. every template's artwork + metadata + text-zone layout")
    for t in tps:
        for key in ("template_id", "name", "palette", "thumbnail_url", "preview_url", "aspect_ratio", "layout"):
            _check(t.get(key), f"{t['template_id']}: has {key}")
        _check(t["thumbnail_url"].startswith("/assets/designs/ganesh/")
               and t["preview_url"].endswith("_preview.webp"),
               f"{t['template_id']}: asset urls follow the wedding convention")
        lay = t["layout"]
        tz = lay.get("text_zone", {})
        _check(all(k in tz for k in ("top", "left", "width", "height", "align"))
               and "font_scale" in lay and "overflow" in lay and lay.get("palette", {}).get("text"),
               f"{t['template_id']}: complete config-driven text layout")

    print("4. optimized WebP files exist on disk")
    missing = []
    for t in tps:
        for suffix in ("_thumb.webp", "_preview.webp"):
            p = os.path.join(ASSET_ROOT, "ganesh", f"{t['template_id']}{suffix}")
            if not os.path.exists(p):
                missing.append(os.path.basename(p))
    _check(not missing, f"all 20 asset files present ({missing[:3]}...)" if missing else "all 20 asset files present")

    print("\nALL TEMPLATE CATALOG TESTS PASSED")


if __name__ == "__main__":
    run()
