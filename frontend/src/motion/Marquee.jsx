import React, { useEffect, useId, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks/useMotionDefaults';

/**
 * Marquee — generic infinite horizontal scroller. Pure CSS keyframe
 * (translateX only, GPU-cheap), track content duplicated so the loop is
 * seamless. Falls back to a static, horizontally-scrollable row when the
 * user prefers reduced motion.
 */
export default function Marquee({
  children,
  speed = 40, // px/sec
  direction = 'left',
  className = '',
  gap = '3rem',
  pauseOnHover = true,
}) {
  const reduced = useReducedMotion();
  const trackRef = useRef(null);
  const [duration, setDuration] = useState(30); // ponytail: fallback until measured
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  useEffect(() => {
    if (reduced) return undefined;
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    const measure = () => {
      const contentWidth = el.scrollWidth / 2; // track holds two copies
      if (contentWidth > 0 && speed > 0) setDuration(contentWidth / speed);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [reduced, speed]);

  if (reduced) {
    return (
      <div className={`overflow-x-auto no-scrollbar ${className}`}>
        <div className="flex" style={{ gap, width: 'max-content' }}>
          {children}
        </div>
      </div>
    );
  }

  const scope = `lux-marquee-${uid}`;

  return (
    <div
      className={`${scope} ${className}`}
      style={{
        overflow: 'hidden',
        WebkitMaskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)',
        maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)',
      }}
    >
      <style>{`
        @keyframes ${scope}-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .${scope} .${scope}-track {
          animation: ${scope}-scroll ${duration}s linear infinite;
          animation-direction: ${direction === 'right' ? 'reverse' : 'normal'};
        }
        ${pauseOnHover ? `.${scope}:hover .${scope}-track { animation-play-state: paused; }` : ''}
      `}</style>
      <div
        ref={trackRef}
        className={`${scope}-track flex`}
        style={{ width: 'max-content', willChange: 'transform' }}
      >
        {/* Inter-copy spacing lives INSIDE each copy (paddingRight), not as a
            track-level flex gap: with a gap the track is 2w+gap wide and
            translateX(-50%) overshoots by gap/2 — a visible jump at every
            loop seam. With per-copy padding, -50% lands exactly on w+gap. */}
        <div className="flex" style={{ gap, paddingRight: gap }}>{children}</div>
        <div className="flex" aria-hidden="true" style={{ gap, paddingRight: gap }}>{children}</div>
      </div>
    </div>
  );
}
