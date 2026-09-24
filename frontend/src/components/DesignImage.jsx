import React, { useMemo, useState, useEffect, useRef, memo } from 'react';
import manifest from '../themes/image-manifest.json';

/**
 * DesignImage — Phase 2 of the perf overhaul.
 *
 * Renders the artwork using the build-time image manifest produced by
 * `yarn build:images`. For every source path we have:
 *   • AVIF / WebP / JPG variants at 480/720/960/1280/1600 widths
 *   • A 24-px base64 LQIP (instant blurred placeholder)
 *   • A dominant colour (instant tinted background — UNIQUE per design)
 *   • The native aspect ratio (prevents layout shift)
 *
 * Render order so every card feels distinct from the FIRST paint:
 *   1. <div> painted with the dominant colour (0 ms, no network)
 *   2. <img> showing the LQIP base64 (0 ms, inline)
 *   3. <picture> with AVIF→WebP→JPG sources and `srcset`
 *      → resolved by the browser to the cheapest variant for the viewport
 *      → fades over the LQIP once decoded
 *
 * Consumers can pass `onReady` to know when the real image has decoded —
 * e.g. so the UniversalDesignRenderer can defer mounting heavy overlays
 * until the artwork is on screen (Phase 3).
 *
 * Falls back gracefully for any src missing from the manifest.
 */

// Sizes attr: card grid is ~33vw on desktop, 90vw on mobile.
const DEFAULT_SIZES =
  '(max-width: 480px) 90vw, (max-width: 960px) 50vw, (max-width: 1440px) 33vw, 480px';

const buildSrcSet = (variants) => {
  // variants is { 480: '/designs/opt/...-480.webp', 960: '...', ... }
  // Per HTML spec, srcset uses whitespace as the candidate separator —
  // URLs containing spaces (we have a bunch of "Wedding Template.jpg"
  // style names) MUST be percent-encoded or the browser silently drops
  // the <source> and falls back to <img src>, losing the WebP win.
  if (!variants) return '';
  return Object.entries(variants)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([w, url]) => `${encodeURI(url)} ${w}w`)
    .join(', ');
};

const getEntry = (src) => {
  if (!src) return null;
  // Strip cache-busting query strings before lookup.
  const key = src.split('?')[0];
  return manifest[key] || null;
};

const DesignImage = memo(function DesignImage({
  src,
  alt = '',
  eager = false,
  fetchPriority,
  style,
  className,
  imgStyle,
  onError,
  onReady,
  width,
  height,
  sizes = DEFAULT_SIZES,
  decoding = 'async',
  pictureStyle,
  ...rest
}) {
  const entry = useMemo(() => getEntry(src), [src]);
  const [loaded, setLoaded] = useState(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Reset when src changes
  useEffect(() => { setLoaded(false); }, [src]);

  useEffect(() => {
    if (loaded && onReadyRef.current) onReadyRef.current();
  }, [loaded]);

  if (!src) return null;

  // Dominant colour + LQIP backdrop — paints instantly with a colour unique
  // to THIS design, so even pre-decode no two cards look alike.
  const backdropStyle = {
    position: 'absolute',
    inset: 0,
    backgroundColor: entry?.dominant || '#1a1a1a',
    backgroundImage: entry?.lqip ? `url("${entry.lqip}")` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    // The LQIP is 24px wide — let CSS upscale it as a soft blur.
    filter: 'blur(18px)',
    transform: 'scale(1.08)', // hide blur edge bleed
    opacity: loaded ? 0 : 1,
    transition: 'opacity 600ms ease',
    pointerEvents: 'none',
    zIndex: 0,
  };

  // Pick the JPG fallback URL — prefer the SMALLEST (480w) so the <img>
  // base src is cheap on mobile. The srcset will upgrade desktops.
  // Encoded for safety (filenames may contain spaces, commas, parens).
  const jpgVariants = entry?.jpg;
  const fallbackSrc = (() => {
    if (!jpgVariants) return src;
    const widths = Object.keys(jpgVariants).map(Number).sort((a, b) => a - b);
    return encodeURI(jpgVariants[widths[0]] || src);
  })();

  const aspectRatio = entry && entry.width && entry.height
    ? entry.width / entry.height
    : undefined;

  return (
    <picture
      style={{ position: 'relative', display: 'block', ...pictureStyle }}
      className={className}
    >
      {/* Instant unique tint + blurred LQIP */}
      <span aria-hidden style={backdropStyle} />

      {/* AVIF (smallest, modern). */}
      {entry?.avif && Object.keys(entry.avif).length > 0 && (
        <source
          type="image/avif"
          srcSet={buildSrcSet(entry.avif)}
          sizes={sizes}
        />
      )}
      {/* WebP (universal modern). */}
      {entry?.webp && Object.keys(entry.webp).length > 0 && (
        <source
          type="image/webp"
          srcSet={buildSrcSet(entry.webp)}
          sizes={sizes}
        />
      )}
      {/* JPG fallback. Browsers without modern format support land here. */}
      <img
        src={fallbackSrc}
        srcSet={entry?.jpg ? buildSrcSet(entry.jpg) : undefined}
        sizes={entry?.jpg ? sizes : undefined}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding={decoding}
        fetchPriority={fetchPriority || (eager ? 'high' : 'auto')}
        width={width || (entry?.width)}
        height={height || (entry?.height)}
        onLoad={(e) => {
          // Wait for decode so the swap is atomic and doesn't flash.
          if (e.currentTarget.decode) {
            e.currentTarget.decode().catch(() => {}).finally(() => setLoaded(true));
          } else {
            setLoaded(true);
          }
        }}
        style={{
          position: 'relative',
          zIndex: 1,
          aspectRatio: aspectRatio || undefined,
          ...style,
          ...imgStyle,
          opacity: loaded ? (style?.opacity ?? imgStyle?.opacity ?? 1) : 0,
          transition: 'opacity 450ms ease',
        }}
        onError={onError}
        data-testid={rest['data-testid']}
        {...rest}
      />
    </picture>
  );
});

export default DesignImage;
// Re-export legacy helper for any caller still importing it.
export const toWebP = (src) => {
  if (!src || typeof src !== 'string') return null;
  if (/\.webp(\?|$)/i.test(src)) return src;
  return src.replace(/\.(jpe?g|png)(\?[^?]*)?$/i, '.webp$2');
};
