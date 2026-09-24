import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useReducedMotion } from '../hooks/useMotionDefaults';

const SIZE = 300;

/**
 * CursorGlow — a soft 300px gold radial halo that lags the cursor with a
 * spring. Desktop-only (pointer:fine) and skipped entirely on touch devices
 * or under reduced motion (mirrors MagneticButton/TiltCard's disabled-render
 * pattern). mix-blend-mode flips screen/multiply per theme via
 * [data-theme="light"] in luxury.css so the glow reads on both backdrops.
 */
const CursorGlow = () => {
  const reducedMotion = useReducedMotion();
  const [pointerFine] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
  );
  const x = useMotionValue(-SIZE);
  const y = useMotionValue(-SIZE);
  const springX = useSpring(x, { stiffness: 120, damping: 26, mass: 0.5 });
  const springY = useSpring(y, { stiffness: 120, damping: 26, mass: 0.5 });

  const active = pointerFine && !reducedMotion;

  useEffect(() => {
    if (!active) return undefined;
    const handleMove = (e) => {
      x.set(e.clientX - SIZE / 2);
      y.set(e.clientY - SIZE / 2);
    };
    window.addEventListener('pointermove', handleMove);
    return () => window.removeEventListener('pointermove', handleMove);
  }, [active, x, y]);

  if (!active) return null;

  return (
    <motion.div
      aria-hidden="true"
      className="lux-cursor-glow"
      style={{ x: springX, y: springY, width: SIZE, height: SIZE }}
    />
  );
};

CursorGlow.displayName = 'CursorGlow';

export default CursorGlow;
