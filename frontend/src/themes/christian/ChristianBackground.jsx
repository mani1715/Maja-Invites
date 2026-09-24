/**
 * ChristianBackground — Persistent (after-opening) background.
 *
 * • Stained-glass colored light patches on edges (CSS radial gradients)
 * • Slowly drifting white rose petals (Canvas 2D)
 * • Candlelight warm glow at bottom
 */
import React, { useEffect, useRef, useState } from 'react';

const PETAL_COUNT_DESKTOP = 12;
const PETAL_COUNT_MOBILE  = 6;

const ChristianBackground = () => {
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
    const N = isMobile ? PETAL_COUNT_MOBILE : PETAL_COUNT_DESKTOP;

    const petals = Array.from({ length: N }).map(() => ({
      x:   Math.random() * w,
      y:   -20 - Math.random() * h,
      vx:  (Math.random() - 0.5) * 0.20,
      vy:  0.20 + Math.random() * 0.35,
      size: 6 + Math.random() * 8,
      rot:  Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.03,
      a:    0.18 + Math.random() * 0.22,
      blush: Math.random() > 0.7,
      sway:  Math.random() * Math.PI * 2,
    }));

    const onResize = () => {
      w = canvas.width  = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const tick = (t) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of petals) {
        p.x += p.vx + Math.sin(t / 1500 + p.sway) * 0.18;
        p.y += p.vy;
        p.rot += p.vrot;
        if (p.y > h + 20) { p.y = -20; p.x = Math.random() * w; }
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.a;
        ctx.fillStyle = p.blush ? '#FFE3E3' : '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.bezierCurveTo(p.size * 0.7, -p.size * 0.5, p.size * 0.7, p.size * 0.5, 0, p.size);
        ctx.bezierCurveTo(-p.size * 0.7, p.size * 0.5, -p.size * 0.7, -p.size * 0.5, 0, -p.size);
        ctx.fill();
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
        data-testid="christian-bg-canvas"
      />
      {/* Stained glass color patches on edges */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }} aria-hidden="true">
        <div className="absolute top-0 left-0"
          style={{
            width: '35vw', height: '60vh',
            background: 'radial-gradient(ellipse at top left, rgba(230,57,70,0.06) 0%, transparent 70%)',
          }} />
        <div className="absolute top-0 right-0"
          style={{
            width: '35vw', height: '60vh',
            background: 'radial-gradient(ellipse at top right, rgba(69,123,157,0.06) 0%, transparent 70%)',
          }} />
        <div className="absolute bottom-0 left-1/3"
          style={{
            width: '40vw', height: '40vh',
            background: 'radial-gradient(ellipse at bottom center, rgba(45,198,83,0.05) 0%, transparent 70%)',
          }} />
      </div>
      {/* Candlelight glow at bottom */}
      <div className="fixed left-0 right-0 bottom-0 pointer-events-none"
        style={{
          height: '40vh',
          zIndex: 1,
          background: 'radial-gradient(ellipse 50% 100% at center bottom, rgba(255,215,0,0.10) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />
      <div className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background: 'radial-gradient(ellipse at center, transparent 35%, rgba(8,8,15,0.65) 100%)',
        }}
        aria-hidden="true"
      />
    </>
  );
};

export default ChristianBackground;
