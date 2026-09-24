/**
 * FireflyParticle — Tiny golden firefly particles drifting in 2D plane.
 *
 * Used for Sangeeth, Mughal (gold dust), Nature (evening forest glow).
 * Each particle moves in a slow random-walk and blinks softly.
 *
 * Props:
 *   count   — max live particles (default 25)
 *   color   — particle color (default warm gold)
 *   size    — base particle size in px (default 3)
 *   speed   — movement speed multiplier (default 1)
 *   zIndex  — stacking
 */
import React, { useEffect, useRef } from 'react';
import { useAnimationLevel } from './AnimationController';
import useCanvasVisibility from '../../hooks/useCanvasVisibility';

const FireflyParticle = ({
  count = 25,
  color = '#F8E1A8',
  size  = 3,
  speed = 1,
  zIndex = 2,
  className = '',
  testId = 'firefly-particle',
}) => {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const animLevel = useAnimationLevel();
  const { ref: visRef, visible } = useCanvasVisibility();

  useEffect(() => {
    if (!animLevel.canvasParticles) return;
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    let W = canvas.offsetWidth;
    let H = canvas.offsetHeight;
    const resize = () => {
      W = canvas.offsetWidth; H = canvas.offsetHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const target = Math.max(4, Math.round(count * (animLevel.particleCount / 22)));
    const flies = Array.from({ length: target }).map(() => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.4 * speed,
      vy: (Math.random() - 0.5) * 0.4 * speed,
      phase: Math.random() * Math.PI * 2,
      freq: 0.8 + Math.random() * 1.2,
      sz: size * (0.6 + Math.random() * 0.9),
    }));

    let last = performance.now();
    let t = 0;
    const tick = (now) => {
      const dt = Math.min(40, now - last) / 1000;
      last = now;
      t += dt;
      ctx.clearRect(0, 0, W, H);

      flies.forEach((f) => {
        f.x += f.vx; f.y += f.vy;
        // Random walk steer
        if (Math.random() < 0.01) f.vx = (Math.random() - 0.5) * 0.5 * speed;
        if (Math.random() < 0.01) f.vy = (Math.random() - 0.5) * 0.5 * speed;
        // Wrap edges
        if (f.x < -5) f.x = W + 5; if (f.x > W + 5) f.x = -5;
        if (f.y < -5) f.y = H + 5; if (f.y > H + 5) f.y = -5;

        const alpha = (Math.sin(t * f.freq + f.phase) + 1) * 0.5;
        ctx.globalAlpha = alpha * 0.9;
        // Outer glow
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.sz * 4);
        g.addColorStop(0, color);
        g.addColorStop(0.4, `${color}55`);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.sz * 4, 0, Math.PI * 2); ctx.fill();
        // Core
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.sz, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [animLevel, visible, count, color, size, speed]);

  if (!animLevel.canvasParticles) return null;

  return (
    <canvas
      ref={(el) => { canvasRef.current = el; visRef.current = el; }}
      data-testid={testId}
      className={className}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex }}
    />
  );
};

export default FireflyParticle;
