/**
 * PendulumSwing — Hanging element physics swing.
 *
 * Used for: swings, brass bells, hanging crystals, Moroccan lanterns,
 * marigold garland strings, chandelier orbs.
 *
 * Props:
 *   amplitude — degrees (default 6)
 *   duration  — seconds per full cycle (default 4)
 *   delay     — seconds before motion starts
 *   origin    — transform-origin (default 'top center')
 *   ease      — CSS cubic-bezier (default real-pendulum ease)
 */
import React from 'react';

const PendulumSwing = ({
  children,
  amplitude = 6,
  duration  = 4,
  delay     = 0,
  origin    = 'top center',
  ease      = 'cubic-bezier(0.45,0.05,0.55,0.95)',
  style     = {},
  className = '',
  testId    = 'pendulum-swing',
}) => {
  const animName = `pendulum-${amplitude}-${duration}`.replace('.', '_');

  return (
    <span
      data-testid={testId}
      className={className}
      style={{
        display: 'inline-block',
        transformOrigin: origin,
        animation: `${animName} ${duration}s ${ease} ${delay}s infinite`,
        willChange: 'transform',
        ...style,
      }}
    >
      <style>{`
        @keyframes ${animName} {
          0%,100% { transform: rotate(-${amplitude}deg); }
          50%     { transform: rotate(${amplitude}deg); }
        }
      `}</style>
      {children}
    </span>
  );
};

export default PendulumSwing;
