import React, { useEffect, useRef, useState, memo } from 'react';

/**
 * SmartImage — image perf wrapper with:
 *  - IntersectionObserver-based lazy loading (200px rootMargin)
 *  - Blur-up placeholder (CSS blur transitions to crisp on load)
 *  - Shimmer skeleton while loading
 *  - fetchpriority hint (above-the-fold = "high", default = "low")
 *
 * Drop-in replacement for <img>. Same `src`, `alt`, `className`, `style` props.
 * Set `priority` to true for the first 2-3 visible (above-the-fold) images.
 * Optional `placeholderSrc` (e.g. 10x10 base64) renders blurred until load.
 */
const SmartImage = memo(function SmartImage({
  src,
  alt = '',
  className = '',
  style,
  priority = false,
  placeholderSrc = null,
  onLoad,
  width,
  height,
  // Override the inner <img> style (the wrapper gets `style`; the image gets
  // this). Use it to change fit, e.g. imgStyle={{ objectFit: 'contain', height: 'auto' }}
  // to show a whole photo instead of the default cover crop.
  imgStyle = null,
  decoding = 'async',
  draggable,
  // Mobile-perf: optional responsive variants. Pass a variants map produced by
  // the backend pipeline ({ small, medium, large, original, width, height }).
  // When supplied, <img> renders srcSet + sizes so mobile devices download the
  // smallest variant that fits. `src` (single URL) still works as fallback.
  variants = null,
  sizes,
  ...rest
}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(priority);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: '200px 0px', threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  const handleLoad = (e) => {
    setLoaded(true);
    if (onLoad) onLoad(e);
  };

  // Build srcSet from variants when provided.
  // Order: small 320w, medium 640w, large 1280w, original 1920w
  const { srcSetAttr, sizesAttr, resolvedSrc, intrinsicW, intrinsicH } = (() => {
    if (!variants || typeof variants !== 'object') {
      return { srcSetAttr: undefined, sizesAttr: undefined, resolvedSrc: src,
               intrinsicW: width, intrinsicH: height };
    }
    const parts = [];
    if (variants.small)    parts.push(`${variants.small} 320w`);
    if (variants.medium)   parts.push(`${variants.medium} 640w`);
    if (variants.large)    parts.push(`${variants.large} 1280w`);
    if (variants.original) parts.push(`${variants.original} 1920w`);
    return {
      srcSetAttr: parts.length ? parts.join(', ') : undefined,
      sizesAttr:  sizes || '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
      resolvedSrc: variants.original || variants.large || variants.medium || variants.small || src,
      intrinsicW: width || variants.width,
      intrinsicH: height || variants.height,
    };
  })();

  return (
    <span
      ref={ref}
      className={`smart-image ${loaded ? 'is-loaded' : 'is-loading'} ${className}`}
      style={{
        position: 'relative',
        display: 'inline-block',
        overflow: 'hidden',
        ...(style || {}),
      }}
    >
      {/* Shimmer / blur placeholder */}
      {!loaded && (
        <span
          className="smart-image__placeholder"
          aria-hidden="true"
          style={
            placeholderSrc
              ? {
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: `url(${placeholderSrc})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'blur(20px)',
                  transform: 'scale(1.05)',
                }
              : undefined
          }
        />
      )}
      {inView && (
        <img
          src={resolvedSrc}
          srcSet={srcSetAttr}
          sizes={sizesAttr}
          alt={alt}
          width={intrinsicW}
          height={intrinsicH}
          decoding={decoding}
          loading={priority ? 'eager' : 'lazy'}
          fetchpriority={priority ? 'high' : 'low'}
          onLoad={handleLoad}
          draggable={draggable}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            opacity: loaded ? 1 : 0,
            filter: loaded ? 'blur(0)' : 'blur(20px)',
            transition: 'opacity 0.55s ease, filter 0.55s ease',
            willChange: loaded ? 'auto' : 'opacity, filter',
            ...(imgStyle || {}),
          }}
          {...rest}
        />
      )}
    </span>
  );
});

export default SmartImage;
