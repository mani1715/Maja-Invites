/**
 * BollywoodBackground — Persistent (after-opening) background.
 *
 * • Spotlight beams from top (3 slowly sweeping CSS conics)
 * • Tiny drifting gold sparkles (Canvas 2D)
 * • Lens-flare flashes every ~8s (CSS animation)
 */
import React, { useEffect, useRef, useState } from 'react';

const SPARKLE_DESKTOP = 28;
const SPARKLE_MOBILE  = 14;

const BollywoodBackground = () => {
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
    const N = isMobile ? SPARKLE_MOBILE : SPARKLE_DESKTOP;
    const colors = ['#FFD700', '#FF0080', '#FFFFFF'];

    const sparkles = Array.from({ length: N }).map(() => ({
      x:  Math.random() * w,
      y:  Math.random() * h,
      r:  0.8 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 0.10,
      vy: -0.12 - Math.random() * 0.20,
      a:  0.15 + Math.random() * 0.30,
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
      for (const p of sparkles) {
        p.x += p.vx; p.y += p.vy;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        const tw = 0.4 + 0.6 * Math.sin(t / 500 + p.ph);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = p.a * (0.4 + 0.6 * tw);
        ctx.shadowColor = p.c;
        ctx.shadowBlur = 10;
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
      {/* Spotlight beams from top */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }} aria-hidden="true">
        <div className="absolute top-0 left-[15%]"
          style={{
            width: '30vw', height: '60vh',
            background: 'linear-gradient(180deg, rgba(255,215,0,0.10) 0%, transparent 100%)',
            transform: 'skewX(15deg)',
            animation: 'bollywood-sweep-1 12s ease-in-out infinite alternate',
            filter: 'blur(8px)',
          }} />
        <div className="absolute top-0 right-[15%]"
          style={{
            width: '30vw', height: '60vh',
            background: 'linear-gradient(180deg, rgba(255,0,128,0.10) 0%, transparent 100%)',
            transform: 'skewX(-15deg)',
            animation: 'bollywood-sweep-2 14s ease-in-out infinite alternate',
            filter: 'blur(8px)',
          }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2"
          style={{
            width: '40vw', height: '50vh',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)',
            animation: 'bollywood-sweep-3 16s ease-in-out infinite alternate',
            filter: 'blur(10px)',
          }} />
      </div>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 1, opacity: reduced ? 0 : 1 }}
        aria-hidden="true"
        data-testid="bollywood-bg-canvas"
      />
      {/* Lens flare flash */}
      <div className="fixed top-[20%] right-[20%] pointer-events-none"
        style={{
          width: 200, height: 200, zIndex: 1,
          background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, transparent 50%)',
          animation: 'bollywood-flare 8s ease-in-out infinite',
        }}
        aria-hidden="true"
      />
      <div className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(10,0,5,0.65) 100%)',
        }}
        aria-hidden="true"
      />
      <style>{`
        @keyframes bollywood-sweep-1 { from { transform: skewX(15deg)  translateX(0);    opacity: 0.7; } to { transform: skewX(15deg)  translateX(80px); opacity: 1; } }
        @keyframes bollywood-sweep-2 { from { transform: skewX(-15deg) translateX(0);    opacity: 0.7; } to { transform: skewX(-15deg) translateX(-80px); opacity: 1; } }
        @keyframes bollywood-sweep-3 { from { opacity: 0.5; transform: translateX(-50%) scaleY(1);   } to { opacity: 1; transform: translateX(-50%) scaleY(1.15); } }
        @keyframes bollywood-flare {
          0%, 88%, 100% { opacity: 0; }
          92%, 96%      { opacity: 0.08; }
        }
      `}</style>
    </>
  );
};

export default BollywoodBackground;
