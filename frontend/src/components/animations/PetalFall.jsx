/**
 * PetalFall — Canvas 2D petals with continuous drift + spawn loop.
 *
 * Universal particle fall: marigold (orange/yellow), rose (pink/cream),
 * bougainvillea (magenta), pink temple petals, white jasmine, etc.
 *
 * Auto-respects animation level (skips entirely on LOW/REDUCED).
 *
 * Props:
 *   colors  — array of hex colors to randomly pick per petal
 *   count   — max live petals at once (default 18)
 *   minSize / maxSize — px range (default 8–18)
 *   driftX  — horizontal sway amplitude in px (default 30)
 *   speed   — base fall speed multiplier (default 1)
 *   shape   — 'oval' | 'circle' | 'sakura' (default 'oval')
 *   zIndex  — stacking (default 1)
 */
import React, { useEffect, useRef } from 'react';
import { useAnimationLevel } from './AnimationController';
import useCanvasVisibility from '../../hooks/useCanvasVisibility';

const PetalFall = ({
  colors = ['#F4A6C0', '#E85A8A', '#FFD2A8'],
  count = 18,
  minSize = 8,
  maxSize = 18,
  driftX = 30,
  speed = 1,
  shape = 'oval',
  zIndex = 1,
  className = '',
  testId = 'petal-fall',
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
    const ctx = canvas.getContext('2d', { alpha: true });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let W = canvas.offsetWidth;
    let H = canvas.offsetHeight;
    const resize = () => {
      W = canvas.offsetWidth; H = canvas.offsetHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const live = [];
    const liveTarget = Math.max(2, Math.round(count * (animLevel.particleCount / 22)));

    const spawn = () => ({
      x: Math.random() * W,
      y: -20,
      size: minSize + Math.random() * (maxSize - minSize),
      vy: (0.4 + Math.random() * 0.7) * speed,
      vxBase: Math.random() * Math.PI * 2,
      driftSpeed: 0.4 + Math.random() * 0.6,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.04,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 0,
      maxLife: 8 + Math.random() * 4,
    });

    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(40, now - last) / 1000;
      last = now;
      ctx.clearRect(0, 0, W, H);

      while (live.length < liveTarget) live.push(spawn());

      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i];
        p.life += dt;
        p.y += p.vy * 60 * dt;
        p.vxBase += p.driftSpeed * dt;
        const x = p.x + Math.sin(p.vxBase) * driftX;
        p.rot += p.vrot;

        const alpha = Math.min(1, p.life / 0.8) * Math.max(0, 1 - (p.life / p.maxLife));
        ctx.save();
        ctx.translate(x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle = p.color;
        if (shape === 'circle') {
          ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill();
        } else if (shape === 'sakura') {
          // 5-petal flower
          for (let k = 0; k < 5; k++) {
            ctx.save();
            ctx.rotate((k / 5) * Math.PI * 2);
            ctx.beginPath();
            ctx.ellipse(0, -p.size * 0.45, p.size * 0.25, p.size * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        } else {
          // oval petal
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size * 0.35, p.size * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        if (p.y > H + 30 || p.life > p.maxLife) {
          live.splice(i, 1);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [animLevel, visible, colors, count, minSize, maxSize, driftX, speed, shape]);

  if (!animLevel.canvasParticles) return null;

  return (
    <canvas
      ref={(el) => { canvasRef.current = el; visRef.current = el; }}
      data-testid={testId}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
        zIndex,
      }}
    />
  );
};

export default PetalFall;
