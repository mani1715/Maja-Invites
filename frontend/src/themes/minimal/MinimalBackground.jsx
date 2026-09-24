/**
 * MinimalBackground — Persistent (after-opening) background.
 *
 * Pure depth via subtle blur layers. NO patterns, NO textures.
 * • Drifting geometric shapes (thin rectangles, hollow circles) at 5% opacity
 * • Single faint vertical hairline as architectural anchor
 * • Very slow, almost-imperceptible motion
 */
import React, { useEffect, useRef, useState } from 'react';

const SHAPE_COUNT_DESKTOP = 14;
const SHAPE_COUNT_MOBILE  = 7;

const MinimalBackground = () => {
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
    const N = isMobile ? SHAPE_COUNT_MOBILE : SHAPE_COUNT_DESKTOP;

    const shapes = Array.from({ length: N }).map((_, i) => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.05,
      vy: (Math.random() - 0.5) * 0.04,
      size: 80 + Math.random() * 160,
      kind: i % 3, // 0 = circle, 1 = rect, 2 = thin line
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.0008,
      a:  0.025 + Math.random() * 0.045,
    }));

    const onResize = () => {
      w = canvas.width  = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      for (const s of shapes) {
        s.x += s.vx; s.y += s.vy; s.rot += s.vrot;
        if (s.x < -s.size) s.x = w + s.size;
        if (s.x >  w + s.size) s.x = -s.size;
        if (s.y < -s.size) s.y = h + s.size;
        if (s.y >  h + s.size) s.y = -s.size;

        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.globalAlpha = s.a;
        if (s.kind === 0) {
          ctx.beginPath();
          ctx.arc(0, 0, s.size / 2, 0, Math.PI * 2);
          ctx.stroke();
        } else if (s.kind === 1) {
          ctx.strokeRect(-s.size / 2, -s.size / 3, s.size, (s.size * 2) / 3);
        } else {
          ctx.beginPath();
          ctx.moveTo(-s.size / 2, 0);
          ctx.lineTo( s.size / 2, 0);
          ctx.stroke();
        }
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
        data-testid="minimal-bg-canvas"
      />
      {/* Single faint vertical hairline — architectural anchor */}
      <div
        className="fixed top-0 bottom-0 pointer-events-none"
        style={{
          left: '50%',
          width: 1,
          background: 'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0.06) 70%, transparent 100%)',
          zIndex: 1,
        }}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(15,15,15,0.6) 100%)',
        }}
        aria-hidden="true"
      />
    </>
  );
};

export default MinimalBackground;
