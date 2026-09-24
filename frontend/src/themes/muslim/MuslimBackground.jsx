/**
 * MuslimBackground — Persistent (after-opening) background.
 *
 * • Islamic 8-fold geometric tessellation (Canvas 2D, gold lines, slow rotation)
 * • Crescent moon + stars fixed at top
 * • Warm oil-lamp glow at bottom
 */
import React, { useEffect, useRef, useState } from 'react';

const STAR_COUNT_DESKTOP = 18;
const STAR_COUNT_MOBILE  = 9;

/** Draws a single 8-pointed Islamic star at (cx,cy) with outer radius r. */
const drawIslamicStar = (ctx, cx, cy, r, color) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.5;
    const x = cx + Math.cos(ang) * radius;
    const y = cy + Math.sin(ang) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
};

const MuslimBackground = () => {
  const tessRef = useRef(null);
  const starRef = useRef(null);
  const [reduced, setReduced] = useState(false);
  const rafRef = useRef(null);

  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(m.matches);
    const h = () => setReduced(m.matches);
    m.addEventListener?.('change', h);
    return () => m.removeEventListener?.('change', h);
  }, []);

  useEffect(() => {
    const tessC = tessRef.current;
    const starC = starRef.current;
    if (!tessC || !starC) return;

    let w = tessC.width = starC.width = window.innerWidth;
    let h = tessC.height = starC.height = window.innerHeight;
    const tctx = tessC.getContext('2d');
    const sctx = starC.getContext('2d');

    const isMobile = w < 768;
    const N = isMobile ? STAR_COUNT_MOBILE : STAR_COUNT_DESKTOP;

    // Static tessellation — draw once, redraw on rotate
    const renderTess = (angle) => {
      tctx.clearRect(0, 0, w, h);
      tctx.save();
      tctx.translate(w / 2, h / 2);
      tctx.rotate(angle);
      tctx.globalAlpha = 0.10;
      const step = 110;
      const cols = Math.ceil(Math.max(w, h) / step) + 2;
      for (let i = -cols; i < cols; i++) {
        for (let j = -cols; j < cols; j++) {
          const x = i * step + (j % 2 ? step / 2 : 0);
          const y = j * step;
          drawIslamicStar(tctx, x, y, 42, '#C5A028');
        }
      }
      tctx.restore();
    };

    // Twinkling stars (Canvas 2D — animated)
    const stars = Array.from({ length: N }).map(() => ({
      x:  Math.random() * w,
      y:  Math.random() * (h * 0.6),
      r:  0.8 + Math.random() * 1.4,
      a:  0.2 + Math.random() * 0.5,
      ph: Math.random() * Math.PI * 2,
    }));

    const onResize = () => {
      w = tessC.width = starC.width = window.innerWidth;
      h = tessC.height = starC.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    let angle = 0;
    const tick = (t) => {
      // Slow tessellation rotation (re-render only every ~200ms-ish, but using the loop is fine since it's static)
      angle += 0.0002;
      renderTess(angle);

      // Stars twinkle
      sctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const tw = 0.5 + 0.5 * Math.sin(t / 800 + s.ph);
        const opacity = s.a * (0.5 + 0.5 * tw);
        sctx.beginPath();
        sctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        sctx.fillStyle = `rgba(255, 255, 255, ${opacity.toFixed(3)})`;
        sctx.shadowColor = 'rgba(245, 222, 179, 0.6)';
        sctx.shadowBlur = 8;
        sctx.fill();
        sctx.shadowBlur = 0;
      }
      if (!reduced) rafRef.current = requestAnimationFrame(tick);
    };
    if (!reduced) rafRef.current = requestAnimationFrame(tick);
    else { renderTess(0); }

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
    };
  }, [reduced]);

  return (
    <>
      <canvas
        ref={tessRef}
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 1, opacity: 0.55 }}
        aria-hidden="true"
        data-testid="muslim-bg-tess"
      />
      <canvas
        ref={starRef}
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 1 }}
        aria-hidden="true"
        data-testid="muslim-bg-stars"
      />
      {/* Crescent moon */}
      <svg
        viewBox="0 0 80 80"
        className="fixed pointer-events-none"
        style={{ top: '6%', right: '7%', width: 64, height: 64, opacity: 0.45, zIndex: 1 }}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="moonGrad2" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="#F5DEB3" stopOpacity="0.95" />
            <stop offset="80%" stopColor="#C5A028" stopOpacity="0.4" />
          </radialGradient>
        </defs>
        <path d="M 60 40 A 22 22 0 1 1 60 39 A 16 16 0 1 0 60 40 Z" fill="url(#moonGrad2)" />
      </svg>
      {/* Oil-lamp glow at bottom */}
      <div className="fixed left-0 right-0 bottom-0 pointer-events-none"
        style={{
          height: '35vh', zIndex: 1,
          background: 'radial-gradient(ellipse 60% 100% at center bottom, rgba(197,160,40,0.12) 0%, transparent 65%)',
        }}
        aria-hidden="true"
      />
      <div className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(245,239,230,0.15) 100%)',
        }}
        aria-hidden="true"
      />
    </>
  );
};

export default MuslimBackground;
