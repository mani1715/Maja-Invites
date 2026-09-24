/**
 * WaterRipple — Canvas 2D moving water surface.
 *
 * HERO animation for Kerala Backwaters and Beach themes. Renders calm
 * teal/ocean water with subtle caustic light patches and sparkle glints.
 *
 * Props:
 *   base       — base water color (default deep Kerala teal #0B4D52)
 *   highlight  — caustic highlight (default #0E6070)
 *   shadow     — caustic shadow (default #083840)
 *   sparkle    — sparkle color (default #FFFFFF)
 *   sparkles   — count of light glints (default 15)
 *   speed      — wave speed multiplier (default 1)
 *   zIndex     — stacking
 */
import React, { useEffect, useRef } from 'react';
import { useAnimationLevel } from './AnimationController';

const WaterRipple = ({
  base = '#0B4D52',
  highlight = '#0E6070',
  shadow = '#083840',
  sparkle = '#FFFFFF',
  sparkles = 15,
  speed = 1,
  zIndex = 0,
  className = '',
  testId = 'water-ripple',
  // 2026-05 Phase 3A: `subtle` mode skips the heavy teal wave bands & caustic
  // blobs — used when the WaterRipple is layered ON TOP of an already-painted
  // design image (kerala designs etc.). Without this the overlay was washing
  // the artwork in a blue/teal cast and obscuring the real design.
  subtle = false,
}) => {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const animLevel = useAnimationLevel();

  useEffect(() => {
    if (!animLevel.canvasParticles) return;
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

    // Caustic blobs — slow moving light patches
    const blobs = Array.from({ length: animLevel.waveDetail === 'high' ? 6 : 3 }).map(() => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 80 + Math.random() * 120,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.15,
      light: Math.random() > 0.5,
    }));

    // Sparkles — tiny white dots
    const sparkleCount = Math.round(sparkles * (animLevel.particleCount / 22));
    const sparkleArr = Array.from({ length: sparkleCount }).map(() => ({
      x: Math.random() * W,
      y: Math.random() * H,
      size: 1 + Math.random() * 2,
      phase: Math.random() * Math.PI * 2,
      freq: 0.6 + Math.random() * 1.0,
    }));

    let last = performance.now();
    let t = 0;
    // 2026-05 Phase mobile-perf: skip frames when off-screen / tab hidden
    let visible = true;
    const io = ('IntersectionObserver' in window) ? new IntersectionObserver(
      ([entry]) => { visible = entry.isIntersecting; },
      { rootMargin: '120px' },
    ) : null;
    if (io) io.observe(canvas);
    const onVis = () => { /* tick checks document.hidden */ };
    document.addEventListener('visibilitychange', onVis);

    const tick = (now) => {
      // Skip work when off-screen or tab is hidden — keeps mobile scroll
      // smooth and drastically reduces CPU/battery on long pages.
      if (!visible || document.hidden) {
        last = now;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(40, now - last) / 1000;
      last = now;
      t += dt * speed;

      // Base water fill — when `subtle` we never repaint a coloured base
      // (we want the design image underneath to dominate).
      if (!subtle) {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.clearRect(0, 0, W, H);
      }

      // Wave displacement bands — skipped entirely in subtle mode because
      // those horizontal teal strips were what gave Kerala designs the
      // "blue wash" look the couple complained about.
      if (!subtle) {
        const bands = animLevel.waveDetail === 'high' ? 28 : 14;
        const bandH = H / bands;
        for (let i = 0; i < bands; i++) {
          const phase = i * 0.3 + t * 0.4;
          const wave  = Math.sin(phase) * 0.08 + 0.08;
          ctx.fillStyle = `rgba(14,96,112,${wave.toFixed(3)})`;
          ctx.fillRect(0, i * bandH, W, bandH + 1);
        }
      }

      // Caustic moving blobs — drawn at MUCH lower opacity in subtle mode
      // so they read as faint light kissing the image, not a blue tint.
      const blobAlphaLight = subtle ? '14' : '88';   // hex alpha — 8% vs 53%
      const blobAlphaDark  = subtle ? '0c' : '66';   // 5% vs 40%
      blobs.forEach((b) => {
        b.x += b.vx; b.y += b.vy;
        if (b.x < -b.r) b.x = W + b.r;
        if (b.x >  W + b.r) b.x = -b.r;
        if (b.y < -b.r) b.y = H + b.r;
        if (b.y >  H + b.r) b.y = -b.r;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, b.light ? `${highlight}${blobAlphaLight}` : `${shadow}${blobAlphaDark}`);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      });

      // Sparkles — slow opacity pulse
      sparkleArr.forEach((s) => {
        const alpha = (Math.sin(t * s.freq * 2 + s.phase) + 1) * 0.5; // 0..1
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle = sparkle;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      if (io) io.disconnect();
    };
  }, [animLevel, base, highlight, shadow, sparkle, sparkles, speed, subtle]);

  if (!animLevel.canvasParticles) {
    // CSS-only fallback: in subtle mode we want NO tint at all — just sit
    // transparent on top of the underlying artwork.
    if (subtle) {
      return (
        <div data-testid={testId} className={className}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex }} />
      );
    }
    return (
      <div
        data-testid={testId}
        className={className}
        style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse at 30% 40%, ${highlight}55 0%, ${base} 60%), ${base}`,
          zIndex,
        }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      data-testid={testId}
      className={className}
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
        zIndex,
      }}
    />
  );
};

export default WaterRipple;
