/**
 * PunjabiBackground — Persistent (after-opening) Canvas 2D background.
 *
 * • Floating paisley shapes (SVG, rotated, low opacity)
 * • Peacock-feather motifs on the edges
 * • Warm magenta-orange glow at the bottom
 * • Drifting gold confetti dots (Canvas 2D)
 */
import React, { useEffect, useRef, useState } from 'react';

const PARTICLE_COUNT_DESKTOP = 30;
const PARTICLE_COUNT_MOBILE  = 14;

const Paisley = ({ top, left, size, rot, color = '#FF6B00' }) => (
  <svg
    viewBox="0 0 100 100"
    className="fixed pointer-events-none"
    style={{ top, left, width: size, height: size, opacity: 0.10, transform: `rotate(${rot}deg)`, zIndex: 1 }}
    aria-hidden="true"
  >
    <path
      d="M 30 90 Q 10 70 20 45 Q 35 15 65 25 Q 85 35 70 65 Q 55 95 30 90 Z M 30 90 Q 35 65 50 60 Q 65 55 65 35"
      fill="none" stroke={color} strokeWidth="1.6"
    />
    <circle cx="50" cy="55" r="3" fill={color} />
  </svg>
);

const Peacock = ({ side = 'left' }) => (
  <svg
    viewBox="0 0 140 320"
    className={`fixed top-1/2 -translate-y-1/2 pointer-events-none ${side === 'left' ? '-left-10' : '-right-10 scale-x-[-1]'}`}
    style={{ height: '70vh', maxHeight: 620, opacity: 0.10, zIndex: 1 }}
    aria-hidden="true"
  >
    <defs>
      <radialGradient id="peacockEye" cx="50%" cy="50%" r="50%">
        <stop offset="0%"  stopColor="#FFD700" stopOpacity="0.9" />
        <stop offset="40%" stopColor="#00C896" stopOpacity="0.7" />
        <stop offset="100%" stopColor="#D4008B" stopOpacity="0.5" />
      </radialGradient>
    </defs>
    {/* Feather stalks */}
    {Array.from({ length: 7 }).map((_, i) => {
      const baseX = 20 + i * 6;
      const tipX  = baseX + 18 + i * 4;
      const tipY  = 30 + i * 38;
      return (
        <g key={i}>
          <path
            d={`M 70 320 Q ${baseX} 200 ${tipX} ${tipY}`}
            fill="none" stroke="#00C896" strokeWidth="0.6" opacity="0.7"
          />
          <ellipse cx={tipX} cy={tipY} rx="10" ry="14" fill="url(#peacockEye)" />
        </g>
      );
    })}
  </svg>
);

const PunjabiBackground = () => {
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
    const colors = ['#FFD700', '#FF6B00', '#D4008B'];

    const particles = Array.from({ length: N }).map(() => ({
      x:  Math.random() * w,
      y:  Math.random() * h,
      r:  1 + Math.random() * 2.2,
      vx: (Math.random() - 0.5) * 0.20,
      vy: -0.15 - Math.random() * 0.25,
      a:  0.18 + Math.random() * 0.25,
      ph: Math.random() * Math.PI * 2,
      c:  colors[Math.floor(Math.random() * colors.length)],
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

        const tw = 0.5 + 0.5 * Math.sin(t / 600 + p.ph);
        const opacity = p.a * (0.55 + 0.45 * tw);

        // tiny square confetti
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((t / 1000 + p.ph) * 0.6);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = opacity;
        ctx.shadowColor = p.c;
        ctx.shadowBlur = 6;
        ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
        ctx.restore();
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
        data-testid="punjabi-bg-canvas"
      />
      <Peacock side="left" />
      <Peacock side="right" />
      <Paisley top="8%"  left="6%"   size={140} rot={-15} color="#FF6B00" />
      <Paisley top="65%" left="82%"  size={180} rot={25}  color="#D4008B" />
      <Paisley top="40%" left="44%"  size={120} rot={-40} color="#FFD700" />
      {/* Warm bottom glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background:
            'radial-gradient(ellipse at center, transparent 30%, rgba(26,10,0,0.65) 100%), ' +
            'radial-gradient(ellipse 70% 40% at center bottom, rgba(255,107,0,0.16) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />
    </>
  );
};

export default PunjabiBackground;
