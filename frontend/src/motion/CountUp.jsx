import React, { useEffect, useRef, useState } from 'react';
import { animate, useInView, useMotionValue, useTransform } from 'framer-motion';
import { useReducedMotion } from '../hooks/useMotionDefaults';
import { VIEWPORT } from './presets';

/**
 * CountUp — animates 0 -> value once the element scrolls into view (VIEWPORT.once,
 * so it never re-triggers), then holds. Renders the plain final value under
 * reduced motion. Text-content only (no transform/opacity animated), so there's
 * nothing here for the 60fps transform/opacity rule to worry about.
 */
const CountUp = ({ value = 0, suffix = '', duration = 1.6, className = '' }) => {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, VIEWPORT.once);
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => String(Math.round(v)));
  const [display, setDisplay] = useState(reduced ? String(value) : '0');

  useEffect(() => {
    if (reduced) {
      setDisplay(String(value));
      return undefined;
    }
    if (!inView) return undefined;
    const controls = animate(count, value, { duration, ease: [0.16, 1, 0.3, 1] });
    const unsubscribe = rounded.on('change', setDisplay);
    return () => {
      controls.stop();
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduced, value, duration]);

  return (
    <span ref={ref} className={className}>
      {display}
      {suffix}
    </span>
  );
};

CountUp.displayName = 'CountUp';

export default CountUp;
