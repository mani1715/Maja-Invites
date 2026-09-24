/**
 * FlameAnimation — Realistic multi-layer CSS-only flame.
 *
 * Used for brass diyas, sacred fire (havan kund), candles, lanterns.
 * Three stacked layers (core / middle / outer) each with its own
 * scale + opacity oscillation that produces the irregular flicker.
 *
 * Props:
 *   size       — visual width in px (default 24)
 *   color      — flame palette: 'gold' (default) | 'amber' | 'wine'
 *   glow       — render the radial warm glow halo behind (default true)
 *   intensity  — 0.6 .. 1.4 (default 1) for subtle vs strong flicker
 */
import React from 'react';

const PALETTES = {
  gold:  { core: '#FFF7CC', mid: '#FFB94A', outer: '#FF6A1A', halo: 'rgba(255,180,80,0.55)' },
  amber: { core: '#FFE9A8', mid: '#FFA64A', outer: '#E84A1B', halo: 'rgba(255,160,80,0.55)' },
  wine:  { core: '#FFE2D0', mid: '#FF7755', outer: '#8B1A2A', halo: 'rgba(180,40,60,0.50)' },
};

const FlameAnimation = ({ size = 24, color = 'gold', glow = true, intensity = 1, style = {}, testId = 'flame' }) => {
  const p = PALETTES[color] || PALETTES.gold;
  const w = size, h = size * 1.6;
  const flickA = `flame-flicker-a ${1.1 / intensity}s ease-in-out infinite`;
  const flickB = `flame-flicker-b ${0.85 / intensity}s ease-in-out infinite`;
  const flickC = `flame-flicker-c ${1.35 / intensity}s ease-in-out infinite`;

  return (
    <div
      data-testid={testId}
      style={{
        position: 'relative',
        width: w, height: h,
        display: 'inline-block',
        transformOrigin: '50% 100%',
        ...style,
      }}
    >
      <style>{`
        @keyframes flame-flicker-a {
          0%,100% { transform: translateX(-50%) scaleY(1) scaleX(1); opacity: .95; }
          25% { transform: translateX(-50%) scaleY(1.18) scaleX(.94); opacity: 1; }
          50% { transform: translateX(-50%) scaleY(.92) scaleX(1.05); opacity: .85; }
          75% { transform: translateX(-50%) scaleY(1.10) scaleX(.97); opacity: 1; }
        }
        @keyframes flame-flicker-b {
          0%,100% { transform: translateX(-50%) scale(1);    opacity: .85; }
          33%     { transform: translateX(-50%) scale(1.12); opacity: 1;  }
          66%     { transform: translateX(-50%) scale(.93);  opacity: .75; }
        }
        @keyframes flame-flicker-c {
          0%,100% { transform: translateX(-50%) scale(1);    opacity: .55; }
          40%     { transform: translateX(-50%) scale(1.20); opacity: .80; }
          70%     { transform: translateX(-50%) scale(.90);  opacity: .45; }
        }
        @keyframes flame-glow-pulse {
          0%,100% { opacity: .55; transform: translate(-50%,-50%) scale(1); }
          50%     { opacity: .90; transform: translate(-50%,-50%) scale(1.15); }
        }
      `}</style>

      {glow && (
        <div
          style={{
            position: 'absolute',
            left: '50%', top: '60%',
            width: w * 5, height: w * 5,
            transform: 'translate(-50%,-50%)',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${p.halo} 0%, transparent 60%)`,
            filter: 'blur(4px)',
            animation: 'flame-glow-pulse 3.2s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Outer flame (orange/red) */}
      <div
        style={{
          position: 'absolute',
          left: '50%', bottom: 0,
          width: w * 0.9, height: h * 0.95,
          transform: 'translateX(-50%)',
          background: `radial-gradient(ellipse at 50% 95%, ${p.outer} 0%, ${p.outer}99 35%, transparent 70%)`,
          borderRadius: '50% 50% 50% 50% / 70% 70% 30% 30%',
          animation: flickC,
        }}
      />
      {/* Mid flame (amber) */}
      <div
        style={{
          position: 'absolute',
          left: '50%', bottom: '8%',
          width: w * 0.65, height: h * 0.72,
          transform: 'translateX(-50%)',
          background: `radial-gradient(ellipse at 50% 92%, ${p.mid} 0%, ${p.mid}AA 45%, transparent 75%)`,
          borderRadius: '50% 50% 50% 50% / 70% 70% 30% 30%',
          animation: flickB,
        }}
      />
      {/* Inner core (white-gold) */}
      <div
        style={{
          position: 'absolute',
          left: '50%', bottom: '14%',
          width: w * 0.38, height: h * 0.50,
          transform: 'translateX(-50%)',
          background: `radial-gradient(ellipse at 50% 90%, ${p.core} 0%, ${p.core}CC 50%, transparent 80%)`,
          borderRadius: '50% 50% 50% 50% / 70% 70% 30% 30%',
          animation: flickA,
        }}
      />
    </div>
  );
};

export default FlameAnimation;
