/**
 * LanternGlow — Moroccan / Kerala brass lantern with swing + flicker glow.
 *
 * Composes PendulumSwing + FlameAnimation halo + outer warm light radial
 * glow that pulses on its own irregular schedule (to feel like flickering
 * lantern light, not in lockstep with the swing).
 *
 * Pass children = your lantern SVG/<img>. The glow renders behind it.
 *
 * Props:
 *   swingAmp     — pendulum amplitude in degrees (default 5)
 *   swingDur     — pendulum duration seconds (default 4)
 *   glowColor    — warm light color (default amber gold)
 *   glowSize     — px radius of the glow (default 120)
 *   delay        — seconds before motion starts
 */
import React from 'react';
import PendulumSwing from './PendulumSwing';

const LanternGlow = ({
  children,
  swingAmp  = 5,
  swingDur  = 4,
  glowColor = 'rgba(255,180,80,0.55)',
  glowSize  = 120,
  delay     = 0,
  className = '',
  style     = {},
  testId    = 'lantern-glow',
}) => {
  const animName = `lantern-glow-${glowSize}`.replace('.', '_');

  return (
    <span
      data-testid={testId}
      className={className}
      style={{
        position: 'relative',
        display: 'inline-block',
        ...style,
      }}
    >
      <style>{`
        @keyframes ${animName} {
          0%,100% { opacity: .55; transform: translate(-50%,-50%) scale(1); }
          30%     { opacity: .85; transform: translate(-50%,-50%) scale(1.10); }
          55%     { opacity: .65; transform: translate(-50%,-50%) scale(.96); }
          78%     { opacity: .90; transform: translate(-50%,-50%) scale(1.14); }
        }
      `}</style>

      {/* Halo glow behind lantern */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%', top: '50%',
          width: glowSize, height: glowSize,
          transform: 'translate(-50%,-50%)',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${glowColor} 0%, transparent 65%)`,
          filter: 'blur(6px)',
          animation: `${animName} 3.7s ease-in-out ${delay}s infinite`,
          pointerEvents: 'none',
        }}
      />
      {/* Swinging lantern body */}
      <PendulumSwing amplitude={swingAmp} duration={swingDur} delay={delay} testId={`${testId}-pendulum`}>
        {children}
      </PendulumSwing>
    </span>
  );
};

export default LanternGlow;
