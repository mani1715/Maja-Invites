/**
 * SkyLanternFloat — Canvas 2D paper sky lanterns drifting upward.
 *
 * Used for Sangeeth themes. Soft amber lanterns float up the screen
 * with gentle horizontal sway and slow opacity fade as they rise.
 *
 * Props:
 *   count    — max live lanterns (default 8)
 *   color    — lantern body color (default warm amber)
 *   speed    — drift speed multiplier (default 1)
 *   zIndex   — stacking
 */
import React, { useEffect, useRef } from 'react';
import { useAnimationLevel } from './AnimationController';
import useCanvasVisibility from '../../hooks/useCanvasVisibility';

const SkyLanternFloat = ({
  count = 8,
  color = '#FFC07A',
  glowColor = 'rgba(255,180,80,0.55)',
  speed = 1,
  zIndex = 1,
  className = '',
  testId = 'sky-lantern-float',
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

    const live = [];
    const target = Math.max(2, Math.round(count * (animLevel.particleCount / 22)));

    const spawn = () => ({
      x: 20 + Math.random() * (W - 40),
      y: H + 30,
      size: 18 + Math.random() * 18,
      vy: -(0.25 + Math.random() * 0.3) * speed,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: 0.5 + Math.random() * 0.4,
      swayAmp: 12 + Math.random() * 18,
      life: 0,
    });

    let last = performance.now();
    let t = 0;
    const tick = (now) => {
      const dt = Math.min(40, now - last) / 1000;
      last = now;
      t += dt;
      ctx.clearRect(0, 0, W, H);

      while (live.length < target) live.push(spawn());

      for (let i = live.length - 1; i >= 0; i--) {
        const L = live[i];
        L.life += dt;
        L.y += L.vy * 60 * dt;
        const x = L.x + Math.sin(L.swayPhase + t * L.swaySpeed) * L.swayAmp;

        const alpha = Math.min(1, L.life / 1.5);
        // Glow halo
        const g = ctx.createRadialGradient(x, L.y, 0, x, L.y, L.size * 2.4);
        g.addColorStop(0, glowColor);
        g.addColorStop(1, 'transparent');
        ctx.globalAlpha = alpha * 0.7;
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, L.y, L.size * 2.4, 0, Math.PI * 2); ctx.fill();

        // Lantern body — paper shape: rounded rectangle
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        const w = L.size * 0.9, h = L.size * 1.15;
        ctx.beginPath();
        ctx.ellipse(x, L.y, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        // String
        ctx.strokeStyle = 'rgba(255,200,120,0.45)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x - 2, L.y + h / 2);
        ctx.lineTo(x - 2, L.y + h / 2 + 8);
        ctx.moveTo(x + 2, L.y + h / 2);
        ctx.lineTo(x + 2, L.y + h / 2 + 8);
        ctx.stroke();

        if (L.y < -L.size * 3) live.splice(i, 1);
      }
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [animLevel, visible, count, color, glowColor, speed]);

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

export default SkyLanternFloat;
