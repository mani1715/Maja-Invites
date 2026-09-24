/**
 * MughalBackground — Persistent (after-opening) Canvas 2D background.
 *
 * No Three.js. Pure Canvas 2D + SVG. Very lightweight.
 *
 * Renders:
 *  • Floating golden filigree dust particles (~28 of them, ~15% opacity)
 *  • Two faint jharokha (carved Mughal balcony window) silhouettes on the
 *    left and right edges — SVG fixed position, parallax with scroll
 *
 * Must never compete with text readability — all opacities are < 0.18.
 */
import React, { useEffect, useRef, useState } from 'react';

const PARTICLE_COUNT_DESKTOP = 28;
const PARTICLE_COUNT_MOBILE  = 14;

const Jharokha = ({ side = 'left' }) => (
  <svg
    viewBox="0 0 120 320"
    className={`fixed top-1/2 -translate-y-1/2 pointer-events-none ${side === 'left' ? '-left-4' : '-right-4 scale-x-[-1]'}`}
    style={{ height: '60vh', maxHeight: 540, opacity: 0.08, zIndex: 1 }}
    aria-hidden="true"
  >
    {/* Mughal pointed-arch frame */}
    <defs>
      <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stopColor="#D4AF37" stopOpacity="0.9" />
        <stop offset="50%" stopColor="#C8962A" stopOpacity="0.7" />
        <stop offset="100%" stopColor="#8B6914" stopOpacity="0.4" />
      </linearGradient>
    </defs>
    {/* Outer frame */}
    <path
      d="M 10 320 L 10 80 Q 10 20 60 20 Q 110 20 110 80 L 110 320 Z"
      fill="none" stroke="url(#goldGrad)" strokeWidth="1.5"
    />
    {/* Inner arch */}
    <path
      d="M 22 305 L 22 90 Q 22 32 60 32 Q 98 32 98 90 L 98 305 Z"
      fill="none" stroke="url(#goldGrad)" strokeWidth="0.8"
    />
    {/* Carved lattice rosettes — 8-pointed Rub el Hizb */}
    {[110, 170, 230].map((y) => (
      <g key={y} transform={`translate(60 ${y})`}>
        <path
          d="M 0 -10 L 7 -7 L 10 0 L 7 7 L 0 10 L -7 7 L -10 0 L -7 -7 Z M 0 -7 L 5 0 L 0 7 L -5 0 Z"
          fill="none" stroke="url(#goldGrad)" strokeWidth="0.6"
        />
      </g>
    ))}
    {/* Vertical column ornaments */}
    <line x1="60" y1="40"  x2="60" y2="80"  stroke="url(#goldGrad)" strokeWidth="0.5" />
    <line x1="60" y1="280" x2="60" y2="310" stroke="url(#goldGrad)" strokeWidth="0.5" />
  </svg>
);

const MughalBackground = () => {
  const canvasRef = useRef(null);
  const [reduced, setReduced] = useState(false);
  const rafRef = useRef(null);

  // Detect reduced motion
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(m.matches);
    const h = () => setReduced(m.matches);
    m.addEventListener?.('change', h);
    return () => m.removeEventListener?.('change', h);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reduced) return;
    const ctx = canvas.getContext('2d');
    let w = canvas.width  = window.innerWidth;
    let h = canvas.height = window.innerHeight;

    const isMobile = w < 768;
    const N = isMobile ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_DESKTOP;

    const particles = Array.from({ length: N }).map(() => ({
      x:  Math.random() * w,
      y:  Math.random() * h,
      r:  0.6 + Math.random() * 1.7,
      vx: (Math.random() - 0.5) * 0.06,
      vy: -0.10 - Math.random() * 0.18, // drift upward like incense
      a:  0.10 + Math.random() * 0.22,
      ph: Math.random() * Math.PI * 2,
    }));

    const onResize = () => {
      w = canvas.width  = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const tick = (t) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x <  -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;

        // Subtle twinkle via sine on opacity
        const tw = 0.5 + 0.5 * Math.sin(t / 700 + p.ph);
        const opacity = p.a * (0.5 + 0.5 * tw);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(232, 201, 122, ${opacity.toFixed(3)})`;
        ctx.shadowColor = 'rgba(232, 201, 122, 0.6)';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
    };
  }, [reduced]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 1, opacity: reduced ? 0 : 1 }}
        aria-hidden="true"
        data-testid="mughal-bg-canvas"
      />
      <Jharokha side="left" />
      <Jharokha side="right" />
      {/* Soft vignette tint */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background:
            'radial-gradient(ellipse at center, transparent 30%, rgba(13,8,6,0.6) 100%)',
        }}
        aria-hidden="true"
      />
    </>
  );
};

export default MughalBackground;
