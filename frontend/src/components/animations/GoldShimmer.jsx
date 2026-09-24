/**
 * GoldShimmer — CSS gradient sweep on gold elements.
 *
 * Wrap any gold border/element/badge to get a periodic shimmer sweep.
 * Uses ::after via inline style + keyframes injected once.
 *
 * Props:
 *   duration  — seconds for one sweep cycle (default 8)
 *   delay     — seconds before first sweep (default 0)
 *   color     — sweep color (default warm gold)
 *   direction — 'horizontal' | 'vertical' | 'diagonal' (default 'horizontal')
 */
import React from 'react';

const GoldShimmer = ({
  children,
  duration  = 8,
  delay     = 0,
  color     = 'rgba(255,215,100,0.55)',
  direction = 'horizontal',
  className = '',
  style     = {},
  testId    = 'gold-shimmer',
}) => {
  const animName = `gold-shimmer-${direction}-${duration}`.replace('.', '_');
  const sweepAngle = direction === 'vertical' ? 'to bottom' : direction === 'diagonal' ? '135deg' : 'to right';

  return (
    <span
      data-testid={testId}
      className={className}
      style={{
        position: 'relative',
        display: 'inline-block',
        overflow: 'hidden',
        ...style,
      }}
    >
      <style>{`
        @keyframes ${animName} {
          0%   { transform: translateX(-100%) translateY(-100%); opacity: 0; }
          10%  { opacity: 1; }
          50%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateX(100%) translateY(100%); opacity: 0; }
        }
      `}</style>
      {children}
      <span
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(${sweepAngle}, transparent 0%, ${color} 50%, transparent 100%)`,
          mixBlendMode: 'screen',
          pointerEvents: 'none',
          animation: `${animName} ${duration}s ease-in-out ${delay}s infinite`,
        }}
      />
    </span>
  );
};

export default GoldShimmer;
