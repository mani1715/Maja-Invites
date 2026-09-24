/**
 * LeafSway — Wrap any plant/leaf/garland element with organic wind motion.
 *
 * Used for banana plants, palm fronds, vines, jasmine garlands, bougainvillea,
 * wisteria, eucalyptus etc.
 *
 * Props:
 *   children       — the leaf/plant element (usually an <img> or <svg>)
 *   amplitude      — degrees of sway (default 4)
 *   duration       — seconds per full cycle (default 6)
 *   delay          — seconds before sway starts (default 0)
 *   origin         — transform-origin (default 'bottom center')
 *   intensity      — 'subtle' | 'normal' | 'strong' (default 'normal')
 */
import React from 'react';

const PROFILES = {
  subtle: { amp: 2, dur: 8 },
  normal: { amp: 4, dur: 6 },
  strong: { amp: 7, dur: 4.5 },
};

const LeafSway = ({
  children,
  amplitude,
  duration,
  delay = 0,
  origin = 'bottom center',
  intensity = 'normal',
  style = {},
  className = '',
  testId = 'leaf-sway',
}) => {
  const profile = PROFILES[intensity] || PROFILES.normal;
  const amp = amplitude ?? profile.amp;
  const dur = duration ?? profile.dur;
  const animName = `leaf-sway-${amp}-${dur}`.replace('.', '_');

  return (
    <span
      data-testid={testId}
      className={className}
      style={{
        display: 'inline-block',
        transformOrigin: origin,
        animation: `${animName} ${dur}s ease-in-out ${delay}s infinite`,
        willChange: 'transform',
        ...style,
      }}
    >
      <style>{`
        @keyframes ${animName} {
          0%,100% { transform: rotate(-${amp}deg); }
          50%     { transform: rotate(${amp}deg); }
        }
      `}</style>
      {children}
    </span>
  );
};

export default LeafSway;
