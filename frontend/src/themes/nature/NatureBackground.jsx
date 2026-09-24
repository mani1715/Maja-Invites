/**
 * NatureBackground — Persistent (after-opening) background.
 *
 * • Falling leaves (Canvas 2D, ~15, tumbling rotation)
 * • Subtle god-rays at top of hero section (CSS)
 * • Vine border along left edge (SVG)
 */
import React, { useEffect, useRef, useState } from 'react';

const LEAF_COUNT_DESKTOP = 15;
const LEAF_COUNT_MOBILE  = 8;
const LEAF_COLORS = ['#4CAF50', '#8BC34A', '#A5D6A7', '#CDDC39'];

const Vine = ({ side = 'left' }) => (
  <svg
    viewBox="0 0 80 600"
    className={`fixed top-0 bottom-0 pointer-events-none ${side === 'left' ? 'left-0' : 'right-0 scale-x-[-1]'}`}
    style={{ width: 80, opacity: 0.10, zIndex: 1 }}
    aria-hidden="true"
    preserveAspectRatio="none"
  >
    <defs>
      <linearGradient id="vineGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stopColor="#4CAF50" stopOpacity="0.7" />
        <stop offset="100%" stopColor="#8BC34A" stopOpacity="0.5" />
      </linearGradient>
    </defs>
    {/* Main vine stem */}
    <path
      d="M 30 0 Q 50 80 30 160 Q 10 240 30 320 Q 50 400 30 480 Q 10 560 30 600"
      fill="none" stroke="url(#vineGrad)" strokeWidth="1.6"
    />
    {/* Leaves at intervals */}
    {[40, 120, 200, 280, 360, 440, 520].map((y, i) => {
      const flip = i % 2 === 0;
      return (
        <g key={i} transform={`translate(${flip ? 30 : 30}, ${y})`}>
          <path
            d={flip
              ? "M 0 0 Q 24 -10 30 14 Q 18 18 0 0 Z"
              : "M 0 0 Q -24 -10 -30 14 Q -18 18 0 0 Z"}
            fill="url(#vineGrad)" stroke="#4CAF50" strokeWidth="0.5"
          />
        </g>
      );
    })}
  </svg>
);

const NatureBackground = () => {
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
    const N = isMobile ? LEAF_COUNT_MOBILE : LEAF_COUNT_DESKTOP;

    const leaves = Array.from({ length: N }).map(() => ({
      x:   Math.random() * w,
      y:   -20 - Math.random() * h,
      vx:  (Math.random() - 0.5) * 0.4,
      vy:  0.30 + Math.random() * 0.45,
      size: 8 + Math.random() * 10,
      rot:  Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.04,
      a:    0.20 + Math.random() * 0.25,
      c:    LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)],
      swayP: Math.random() * Math.PI * 2,
    }));

    const onResize = () => {
      w = canvas.width  = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const drawLeaf = (x, y, size, rot, color, alpha) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      // Simple leaf: two quad curves making an almond shape
      ctx.moveTo(0, -size);
      ctx.quadraticCurveTo(size * 0.7, 0, 0, size);
      ctx.quadraticCurveTo(-size * 0.7, 0, 0, -size);
      ctx.fill();
      // Center vein
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(0, -size); ctx.lineTo(0, size);
      ctx.stroke();
      ctx.restore();
    };

    const tick = (t) => {
      ctx.clearRect(0, 0, w, h);
      for (const L of leaves) {
        // Horizontal sway
        L.x += L.vx + Math.sin(t / 1200 + L.swayP) * 0.3;
        L.y += L.vy;
        L.rot += L.vrot;
        if (L.y > h + 20) {
          L.y = -20; L.x = Math.random() * w;
        }
        if (L.x < -20) L.x = w + 20;
        if (L.x > w + 20) L.x = -20;
        drawLeaf(L.x, L.y, L.size, L.rot, L.c, L.a);
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
        data-testid="nature-bg-canvas"
      />
      <Vine side="left" />
      <Vine side="right" />
      {/* God-rays at top */}
      <div
        className="fixed top-0 left-0 right-0 pointer-events-none"
        style={{
          height: '50vh',
          zIndex: 1,
          background:
            'radial-gradient(ellipse 60% 100% at 70% 0%, rgba(255,235,59,0.10) 0%, transparent 70%), ' +
            'radial-gradient(ellipse 40% 100% at 25% 0%, rgba(205,220,57,0.07) 0%, transparent 60%)',
        }}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background:
            'radial-gradient(ellipse at center, transparent 35%, rgba(3,10,3,0.65) 100%)',
        }}
        aria-hidden="true"
      />
    </>
  );
};

export default NatureBackground;
