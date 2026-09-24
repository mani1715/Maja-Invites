/**
 * BeachBackground — Persistent (after-opening) background.
 *
 * • Animated horizontal ocean wave at the bottom (Canvas 2D sine wave)
 * • Tiny floating sand-gold sparkles (Canvas 2D)
 * • Subtle sunset gradient at the top (CSS)
 * • Small seashell silhouettes scattered (SVG)
 */
import React, { useEffect, useRef, useState } from 'react';

const SPARKLE_COUNT_DESKTOP = 22;
const SPARKLE_COUNT_MOBILE  = 12;

const Seashell = ({ top, left, size, rot }) => (
  <svg
    viewBox="0 0 100 100"
    className="fixed pointer-events-none"
    style={{ top, left, width: size, height: size, opacity: 0.07, transform: `rotate(${rot}deg)`, zIndex: 1 }}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="shellGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stopColor="#E9C46A" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#BFA379" stopOpacity="0.4" />
      </linearGradient>
    </defs>
    {/* Scallop shell */}
    <path
      d="M 50 90 Q 12 60 18 30 Q 30 12 50 12 Q 70 12 82 30 Q 88 60 50 90 Z"
      fill="none" stroke="url(#shellGrad)" strokeWidth="1.3"
    />
    {/* Ribs */}
    {Array.from({ length: 9 }).map((_, i) => {
      const a = (i / 8) * Math.PI - Math.PI / 2;
      const x1 = 50 + Math.cos(a) * 14;
      const y1 = 50 + Math.sin(a) * 14 + 20;
      const x2 = 50 + Math.cos(a) * 35;
      const y2 = 50 + Math.sin(a) * 35 + 20;
      return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#shellGrad)" strokeWidth="0.8" />;
    })}
  </svg>
);

const BeachBackground = () => {
  const sparkleRef = useRef(null);
  const waveRef = useRef(null);
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
    const sparkleC = sparkleRef.current;
    const waveC = waveRef.current;
    if (!sparkleC || !waveC || reduced) return;
    const sctx = sparkleC.getContext('2d');
    const wctx = waveC.getContext('2d');
    let w = sparkleC.width = waveC.width = window.innerWidth;
    let h = sparkleC.height = window.innerHeight;
    waveC.height = 220;

    const isMobile = w < 768;
    const N = isMobile ? SPARKLE_COUNT_MOBILE : SPARKLE_COUNT_DESKTOP;

    const sparkles = Array.from({ length: N }).map(() => ({
      x:  Math.random() * w,
      y:  Math.random() * h,
      r:  0.8 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 0.07,
      vy: -0.10 - Math.random() * 0.15,
      a:  0.10 + Math.random() * 0.24,
      ph: Math.random() * Math.PI * 2,
    }));

    const onResize = () => {
      w = sparkleC.width = waveC.width = window.innerWidth;
      h = sparkleC.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const tick = (t) => {
      // ─ Sparkles
      sctx.clearRect(0, 0, w, h);
      for (const p of sparkles) {
        p.x += p.vx; p.y += p.vy;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        const tw = 0.5 + 0.5 * Math.sin(t / 600 + p.ph);
        const opacity = p.a * (0.5 + 0.5 * tw);
        sctx.beginPath();
        sctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        sctx.fillStyle = `rgba(233, 196, 106, ${opacity.toFixed(3)})`;
        sctx.shadowColor = 'rgba(233, 196, 106, 0.55)';
        sctx.shadowBlur = 8;
        sctx.fill();
        sctx.shadowBlur = 0;
      }

      // ─ Ocean wave at bottom
      wctx.clearRect(0, 0, w, 220);
      // Two superimposed sine waves
      for (let layer = 0; layer < 2; layer++) {
        wctx.beginPath();
        const amp = layer === 0 ? 18 : 12;
        const freq = layer === 0 ? 0.012 : 0.022;
        const off  = layer === 0 ? t / 2200 : t / 1400;
        const yBase = layer === 0 ? 110 : 130;
        wctx.moveTo(0, 220);
        for (let x = 0; x <= w; x += 4) {
          const y = yBase + Math.sin(x * freq + off) * amp;
          wctx.lineTo(x, y);
        }
        wctx.lineTo(w, 220);
        wctx.closePath();
        wctx.fillStyle = layer === 0 ? 'rgba(0, 180, 216, 0.07)' : 'rgba(0, 180, 216, 0.10)';
        wctx.fill();
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
        ref={sparkleRef}
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 1, opacity: reduced ? 0 : 1 }}
        aria-hidden="true"
        data-testid="beach-bg-sparkle"
      />
      <canvas
        ref={waveRef}
        className="fixed left-0 right-0 bottom-0 pointer-events-none"
        style={{ height: 220, zIndex: 1, opacity: reduced ? 0 : 1 }}
        aria-hidden="true"
        data-testid="beach-bg-wave"
      />
      {/* Sunset gradient at top */}
      <div
        className="fixed top-0 left-0 right-0 pointer-events-none"
        style={{
          height: '40vh',
          zIndex: 1,
          background:
            'linear-gradient(180deg, rgba(244,162,97,0.10) 0%, rgba(255,107,107,0.04) 40%, transparent 100%)',
        }}
        aria-hidden="true"
      />
      <Seashell top="12%" left="6%"   size={80}  rot={-25} />
      <Seashell top="68%" left="86%"  size={110} rot={30} />
      <Seashell top="40%" left="92%"  size={70}  rot={-15} />
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background:
            'radial-gradient(ellipse at center, transparent 35%, rgba(3,13,26,0.65) 100%)',
        }}
        aria-hidden="true"
      />
    </>
  );
};

export default BeachBackground;
