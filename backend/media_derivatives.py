"""
media_derivatives.py - MAJA Invites shared image-derivative pipeline.

This is THE single derivative implementation. New upload paths must call
into this module instead of hand-rolling Pillow calls. It replaces five
near-identical implementations that all did the same four steps:
    EXIF transpose -> flatten RGBA/P onto white -> LANCZOS resize (only if
    wider than target, never upscale) -> re-encode.

Public API
----------
normalize(img_bytes)                        -> PIL.Image  (RGB, EXIF-corrected)
encode(img, width=None, fmt='JPEG', quality) -> bytes
make_variant(img_bytes, width, fmt, quality) -> (bytes, out_w, out_h)
make_standard_set(img_bytes)                 -> {"original": bytes,
                                                   "preview": (bytes, w, h),
                                                   "thumb":   (bytes, w, h)}
image_dimensions(img_bytes)                  -> (w, h), (0, 0) if undecodable

`make_standard_set` is the entry point for new upload paths: it passes the
original bytes through untouched (never re-encoded - this is what preserves
the "we keep your original" guarantee), and derives a 2048w JPEG q85 preview
plus a 480w WEBP q80 thumb from one shared decode.

Legacy call sites this module supersedes, and the sizes/formats/quality each
one used (for refactors that need to match existing behaviour exactly):

    site                                              width    fmt    quality
    ------------------------------------------------  -------  -----  -------
    aws_service.make_thumbnail                        400      JPEG   85
      (legacy quirk: always resizes, even upscales - not reproduced here)
    live_gallery_features._save_image_with_thumbs
      - original (re-encoded, not passthrough)        full     JPEG   88
      - thumb                                         800      WEBP   82
      - micro                                         200      WEBP   70
    premium_features.py photographer_upload
      - main                                          1920     JPEG   86
      - thumb                                         480      JPEG   78
    premium_features.py guest_upload
      - main                                          1600     JPEG   82
      - thumb                                         480      JPEG   78
    event_media_service.optimize_image
      - original_webp                                 config   WEBP   config
      - variants (large/medium/small, per config)      config   WEBP   config
    server.py convert_to_webp                         1920     WEBP   85 (param)
    server.py convert_to_webp_responsive
      - original                                      1920     WEBP   88
      - large                                          1280     WEBP   85
      - medium                                          640     WEBP   82
      - small                                            320     WEBP   78
"""
import io
from typing import Optional, Tuple, Dict, Any

from PIL import Image, ImageOps


def normalize(img_bytes: bytes) -> "Image.Image":
    """Decode, EXIF-transpose, and flatten to RGB on a white background.

    Raises ValueError on undecodable/corrupt bytes.
    """
    try:
        im = Image.open(io.BytesIO(img_bytes))
        im.load()  # force full decode now so truncated/corrupt data raises here
    except Exception as e:
        raise ValueError(f"Could not decode image: {e}") from e

    im = ImageOps.exif_transpose(im)

    if im.mode in ("RGBA", "LA", "P"):
        if im.mode == "P":
            im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        mask = im.split()[-1] if im.mode in ("RGBA", "LA") else None
        bg.paste(im, mask=mask)
        im = bg
    elif im.mode != "RGB":
        im = im.convert("RGB")

    return im


def encode(img: "Image.Image", width: Optional[int] = None,
           fmt: str = "JPEG", quality: int = 82) -> bytes:
    """Resize (LANCZOS, only if img.width > width) and re-encode. Never upscales."""
    if width is not None and img.width > width:
        ratio = width / float(img.width)
        new_h = max(1, int(img.height * ratio))
        img = img.resize((width, new_h), Image.Resampling.LANCZOS)

    fmt = fmt.upper()
    out = io.BytesIO()
    save_kwargs: Dict[str, Any] = {"quality": quality, "optimize": True}
    if fmt == "WEBP":
        save_kwargs["method"] = 6
    img.save(out, format=fmt, **save_kwargs)
    return out.getvalue()


def image_dimensions(img_bytes: bytes) -> Tuple[int, int]:
    """Tolerant (w, h) lookup - returns (0, 0) instead of raising."""
    try:
        with Image.open(io.BytesIO(img_bytes)) as im:
            return im.size
    except Exception:
        return (0, 0)


def make_variant(img_bytes: bytes, width: Optional[int],
                  fmt: str, quality: int) -> Tuple[bytes, int, int]:
    """One-shot: normalize + encode, returns (bytes, out_w, out_h)."""
    img = normalize(img_bytes)
    out_bytes = encode(img, width=width, fmt=fmt, quality=quality)
    out_w, out_h = image_dimensions(out_bytes)
    return out_bytes, out_w, out_h


def apply_watermark(
    img: "Image.Image",
    text: str = "MAJA INVITES",
    position: str = "bottom-right",
    opacity: float = 0.35,
    size: str = "medium"
) -> "Image.Image":
    """Apply an elegant translucent watermark pattern/branding across the image."""
    from PIL import ImageDraw, ImageFont
    
    # Work on RGBA copy for transparent text blending
    base = img.convert("RGBA")
    txt_layer = Image.new("RGBA", base.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(txt_layer)
    
    w, h = base.size
    # Size multiplier
    size_mult = 0.035 if size == "small" else 0.065 if size == "large" else 0.048
    font_size = max(16, int(min(w, h) * size_mult))
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None
    
    watermark_text = (text or "MAJA INVITES").upper()
    alpha_val = max(20, min(220, int(255 * (opacity or 0.35))))
    shadow_val = max(10, min(180, int(alpha_val * 0.75)))
    alpha_color = (255, 255, 255, alpha_val)
    shadow_color = (0, 0, 0, shadow_val)
    
    margin = int(font_size * 0.9)
    text_w_est = int(len(watermark_text) * font_size * 0.6)
    
    # Position handling
    pos = (position or "bottom-right").lower()
    if pos in ("bottom-right", "br"):
        pos_x = max(margin, w - text_w_est - margin)
        pos_y = max(margin, h - font_size - margin)
    elif pos in ("bottom-left", "bl"):
        pos_x = margin
        pos_y = max(margin, h - font_size - margin)
    elif pos in ("top-right", "tr"):
        pos_x = max(margin, w - text_w_est - margin)
        pos_y = margin
    elif pos in ("top-left", "tl"):
        pos_x = margin
        pos_y = margin
    else:  # center / diagonal
        pos_x = max(margin, (w - text_w_est) // 2)
        pos_y = max(margin, (h - font_size) // 2)
        
    draw.text((pos_x + 1, pos_y + 1), watermark_text, fill=shadow_color, font=font)
    draw.text((pos_x, pos_y), watermark_text, fill=alpha_color, font=font)
    
    # Always include subtle center branding for protective coverage unless already center
    if pos != "center":
        cx = max(10, (w - text_w_est) // 2)
        cy = max(10, (h - font_size) // 2)
        center_alpha = (255, 255, 255, int(alpha_val * 0.4))
        center_shadow = (0, 0, 0, int(shadow_val * 0.4))
        draw.text((cx + 1, cy + 1), watermark_text, fill=center_shadow, font=font)
        draw.text((cx, cy), watermark_text, fill=center_alpha, font=font)
    
    composed = Image.alpha_composite(base, txt_layer).convert("RGB")
    return composed


def make_standard_set(
    img_bytes: bytes,
    watermark_text: Optional[str] = None,
    watermark_position: str = "bottom-right",
    watermark_opacity: float = 0.35,
    watermark_size: str = "medium"
) -> Dict[str, Any]:
    """Standard upload derivative set: original passthrough + preview + thumb + watermarked variants."""
    img = normalize(img_bytes)  # one decode, shared by all derivatives
    
    wm_label = watermark_text or "MAJA INVITES"
    wm_img = apply_watermark(img, text=wm_label, position=watermark_position, opacity=watermark_opacity, size=watermark_size)
    
    preview_bytes = encode(wm_img, width=2048, fmt="JPEG", quality=85)
    thumb_bytes = encode(wm_img, width=480, fmt="WEBP", quality=80)
    display_bytes = encode(wm_img, width=1920, fmt="WEBP", quality=82)
    
    return {
        "original": img_bytes,  # untouched - identity, never re-encoded, private
        "preview": (preview_bytes,) + image_dimensions(preview_bytes),
        "thumb": (thumb_bytes,) + image_dimensions(thumb_bytes),
        "display_watermarked": (display_bytes,) + image_dimensions(display_bytes),
    }

