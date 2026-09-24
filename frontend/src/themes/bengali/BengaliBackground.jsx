/**
 * BengaliBackground — Persistent (after-opening) background.
 *
 * • Subtle alpana pattern (mathematical white rice-flour design — SVG, slow rotate)
 * • Brass diya flame in bottom corners (CSS animation)
 * • Drifting red sindoor particle dust (Canvas 2D)
 * • Soft red vignette at edges
 */
import React, { useEffect, useRef, useState } from 'react';

const PARTICLE_COUNT_DESKTOP = 22;
const PARTICLE_COUNT_MOBILE  = 12;

const Alpana = () => (
  <svg
    viewBox="0 0 200 200"
    className="fixed top-1/2 left-1/2 pointer-events-none"
    style={{
      width: '85vmin', height: '85vmin',
      transform: 'translate(-50%, -50%)',
      opacity: 0.08, zIndex: 1,
      animation: 'bengali-alpana-spin 280s linear infinite',
    }}
    aria-hidden="true"
  >
    {/* Outer petal ring */}
    {Array.from({ length: 16 }).map((_, i) => (
      <g key={i} transform={`rotate(${i * 22.5} 100 100)`}>
        <path d="M 100 22 Q 106 50 100 70 Q 94 50 100 22 Z" fill="none" stroke="#FFFFFF" strokeWidth="0.55" />
      </g>
    ))}
    {/* Middle ring with dots */}
    <circle cx="100" cy="100" r="58" fill="none" stroke="#FFFFFF" strokeWidth="0.5" />
    {Array.from({ length: 12 }).map((_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const x = 100 + Math.cos(a) * 58;
      const y = 100 + Math.sin(a) * 58;
      return <circle key={i} cx={x} cy={y} r="1.3" fill="#FFFFFF" />;
    })}
    {/* Lotus */}
    {Array.from({ length: 8 }).map((_, i) => (
      <g key={i} transform={`rotate(${i * 45} 100 100)`}>
        <path d="M 100 70 Q 108 90 100 100 Q 92 90 100 70 Z" fill="none" stroke="#FFFFFF" strokeWidth="0.5" />
      </g>
    ))}
    <circle cx="100" cy="100" r="3" fill="#FFFFFF" opacity="0.8" />
  </svg>
);

const Diya = ({ side = 'left' }) => (
  <div
    className="fixed bottom-6 pointer-events-none"
    style={{
      [side]: '24px',
      zIndex: 1,
      width: 42, height: 60,
      opacity: 0.9,
    }}
    aria-hidden="true"
  >
    <div
      className="absolute bottom-0 left-1/2 -translate-x-1/2"
      style={{
        width: 36, height: 14,
        background: 'linear-gradient(180deg, #FFD700 0%, #8B6914 100%)',
        borderRadius: '50% 50% 6px 6px',
        boxShadow: '0 0 8px rgba(255,215,0,0.5)',
      }}
    />
    <div
      className="absolute left-1/2 -translate-x-1/2"
      style={{
        bottom: 12,
        width: 12, height: 30,
        background: 'radial-gradient(circle at 50% 70%, #FFEB3B 0%, #FF4500 50%, transparent 75%)',
        borderRadius: '50% 50% 30% 30% / 60% 60% 40% 40%',
        animation: 'bengali-flame-flicker 1.5s ease-in-out infinite alternate',
        filter: 'blur(0.5px)',
      }}
    />
  </div>
);

const BengaliBackground = () => {
  const canvasRef = useRef(null);
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
      r:  0.7 + Math.random() * 1.5,
      vx: (Math.random() - 0.5) * 0.05,
      vy: -0.10 - Math.random() * 0.20,
      a:  0.14 + Math.random() * 0.22,
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
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;

        const tw = 0.5 + 0.5 * Math.sin(t / 700 + p.ph);
        const opacity = p.a * (0.5 + 0.5 * tw);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(204, 0, 0, ${opacity.toFixed(3)})`;
        ctx.shadowColor = 'rgba(255, 90, 90, 0.5)';
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
      <style>{`
        @keyframes bengali-alpana-spin { from { transform: translate(-50%,-50%) rotate(0deg);} to { transform: translate(-50%,-50%) rotate(360deg);} }
        @keyframes bengali-flame-flicker {
          0%   { transform: translateX(-50%) scale(1)   rotate(-2deg); opacity: 0.85; }
          50%  { transform: translateX(-50%) scale(1.1) rotate( 2deg); opacity: 1;    }
          100% { transform: translateX(-50%) scale(0.95) rotate(-1deg); opacity: 0.8; }
        }
      `}</style>
      <Alpana />
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 1, opacity: reduced ? 0 : 1 }}
        aria-hidden="true"
        data-testid="bengali-bg-canvas"
      />
      <Diya side="left" />
      <Diya side="right" />
      {/* Soft red vignette */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          boxShadow: 'inset 0 0 200px rgba(204,0,0,0.18)',
          background:
            'radial-gradient(ellipse at center, transparent 30%, rgba(13,5,5,0.7) 100%)',
        }}
        aria-hidden="true"
      />
    </>
  );
};

export default BengaliBackground;
