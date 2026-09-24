/**
 * CrystalSparkle — Chandelier crystal drop with shimmer + pendulum.
 *
 * Wraps any crystal/diamond shape with:
 *  • gentle pendulum swing
 *  • box-shadow catch-light pulse
 *  • optional 4-point cross flare via ::before
 *
 * Props identical to LanternGlow but tuned for hard crystal facets.
 */
import React from 'react';
import PendulumSwing from './PendulumSwing';

const CrystalSparkle = ({
  children,
  swingAmp  = 3,
  swingDur  = 3,
  delay     = 0,
  flare     = true,
  flareColor = 'rgba(255,255,255,0.85)',
  flareSize  = 40,
  className = '',
  style     = {},
  testId    = 'crystal-sparkle',
}) => {
  const animName = `crystal-flare-${flareSize}`.replace('.', '_');

  return (
    <span
      data-testid={testId}
      className={className}
      style={{ position: 'relative', display: 'inline-block', ...style }}
    >
      <style>{`
        @keyframes ${animName} {
          0%,100% { opacity: .35; transform: translate(-50%,-50%) scale(.8) rotate(0deg); }
          50%     { opacity: 1;   transform: translate(-50%,-50%) scale(1.4) rotate(45deg); }
        }
      `}</style>

      {flare && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%', top: '50%',
            width: flareSize, height: flareSize,
            transform: 'translate(-50%,-50%)',
            background:
              `linear-gradient(0deg,   transparent 45%, ${flareColor} 50%, transparent 55%), ` +
              `linear-gradient(90deg,  transparent 45%, ${flareColor} 50%, transparent 55%)`,
            filter: 'blur(0.5px)',
            animation: `${animName} 4s ease-in-out ${delay}s infinite`,
            pointerEvents: 'none',
            mixBlendMode: 'screen',
          }}
        />
      )}

      <PendulumSwing amplitude={swingAmp} duration={swingDur} delay={delay}>
        {children}
      </PendulumSwing>
    </span>
  );
};

export default CrystalSparkle;
