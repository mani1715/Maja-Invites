/**
 * TempleBackground — Persistent (after-opening) Canvas 2D background.
 *
 * Renders:
 *  • Subtle rotating kolam-style mandala (SVG, slow rotation)
 *  • Two brass diya (oil-lamp) flame flickers in bottom corners
 *  • Warm marigold-gold particles drifting upward (incense smoke)
 *  • Warm ambient inset glow at edges
 *
 * All opacities <0.18 — must not compete with content.
 */
import React, { useEffect, useRef, useState } from 'react';

const PARTICLE_COUNT_DESKTOP = 24;
const PARTICLE_COUNT_MOBILE  = 12;

const KolamMandala = () => (
  <svg
    viewBox="0 0 200 200"
    className="fixed top-1/2 left-1/2 pointer-events-none"
    style={{
      width: '90vmin', height: '90vmin',
      transform: 'translate(-50%, -50%)',
      opacity: 0.08, zIndex: 1,
      animation: 'temple-mandala-spin 240s linear infinite',
    }}
    aria-hidden="true"
  >
    <defs>
      <radialGradient id="kolamGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%"  stopColor="#FFD700" stopOpacity="0.9" />
        <stop offset="60%" stopColor="#DAA520" stopOpacity="0.5" />
        <stop offset="100%" stopColor="#B8860B" stopOpacity="0.2" />
      </radialGradient>
    </defs>
    {/* Outer petals (8-fold) */}
    {Array.from({ length: 8 }).map((_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return (
        <g key={i} transform={`rotate(${(i * 45)} 100 100)`}>
          <path
            d="M 100 18 Q 110 50 100 70 Q 90 50 100 18 Z"
            fill="none" stroke="url(#kolamGrad)" strokeWidth="0.6"
          />
        </g>
      );
    })}
    {/* Mid ring */}
    <circle cx="100" cy="100" r="62" fill="none" stroke="url(#kolamGrad)" strokeWidth="0.7" />
    <circle cx="100" cy="100" r="48" fill="none" stroke="url(#kolamGrad)" strokeWidth="0.5" />
    {/* Inner star */}
    {Array.from({ length: 12 }).map((_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const x = 100 + Math.cos(a) * 36;
      const y = 100 + Math.sin(a) * 36;
      return <circle key={i} cx={x} cy={y} r="1.6" fill="url(#kolamGrad)" />;
    })}
    <circle cx="100" cy="100" r="6" fill="none" stroke="url(#kolamGrad)" strokeWidth="0.9" />
    <circle cx="100" cy="100" r="2" fill="#FFD700" />
  </svg>
);

const Diya = ({ side = 'left' }) => (
  <div
    className="fixed bottom-6 pointer-events-none"
    style={{
      [side]: '24px',
      zIndex: 1,
      width: 44, height: 64,
      opacity: 0.85,
    }}
    aria-hidden="true"
  >
    {/* Brass pot */}
    <div
      className="absolute bottom-0 left-1/2 -translate-x-1/2"
      style={{
        width: 38, height: 16,
        background: 'linear-gradient(180deg, #B8860B 0%, #5A4308 100%)',
        borderRadius: '50% 50% 8px 8px',
        boxShadow: '0 0 8px rgba(184,134,11,0.55)',
      }}
    />
    {/* Flame */}
    <div
      className="absolute left-1/2 -translate-x-1/2"
      style={{
        bottom: 14,
        width: 14, height: 32,
        background: 'radial-gradient(circle at 50% 70%, #FFEB3B 0%, #FF6B35 40%, transparent 70%)',
        borderRadius: '50% 50% 30% 30% / 60% 60% 40% 40%',
        animation: 'temple-flame-flicker 1.4s ease-in-out infinite alternate',
        filter: 'blur(0.6px)',
      }}
    />
  </div>
);

const TempleBackground = () => {
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
      r:  0.7 + Math.random() * 1.6,
      vx: (Math.random() - 0.5) * 0.05,
      vy: -0.12 - Math.random() * 0.18,
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
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;

        const tw = 0.5 + 0.5 * Math.sin(t / 650 + p.ph);
        const opacity = p.a * (0.5 + 0.5 * tw);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 215, 0, ${opacity.toFixed(3)})`;
        ctx.shadowColor = 'rgba(255, 215, 0, 0.55)';
        ctx.shadowBlur = 9;
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
        @keyframes temple-mandala-spin { from { transform: translate(-50%,-50%) rotate(0deg);} to { transform: translate(-50%,-50%) rotate(360deg);} }
        @keyframes temple-flame-flicker {
          0%   { transform: translateX(-50%) scale(1)   rotate(-2deg); opacity: 0.85; }
          50%  { transform: translateX(-50%) scale(1.1) rotate( 2deg); opacity: 1;    }
          100% { transform: translateX(-50%) scale(0.95) rotate(-1deg); opacity: 0.8; }
        }
      `}</style>
      <KolamMandala />
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 1, opacity: reduced ? 0 : 1 }}
        aria-hidden="true"
        data-testid="temple-bg-canvas"
      />
      <Diya side="left" />
      <Diya side="right" />
      {/* Warm edge vignette */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background:
            'radial-gradient(ellipse at center, transparent 30%, rgba(10,8,6,0.6) 100%), ' +
            'radial-gradient(ellipse at bottom, rgba(184,134,11,0.08) 0%, transparent 60%)',
        }}
        aria-hidden="true"
      />
    </>
  );
};

export default TempleBackground;
