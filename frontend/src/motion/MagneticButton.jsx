import React, { useCallback, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useReducedMotion } from '../hooks/useMotionDefaults';
import { SPRING } from './presets';

/**
 * MagneticButton — wraps children and nudges them toward the cursor while
 * hovered, springing back to rest on leave. Disabled (renders children
 * statically) when the user prefers reduced motion or the pointer isn't
 * fine (touch devices), so it never fights a tap target on mobile.
 */
const MagneticButton = ({ children, strength = 0.35, className = '', ...rest }) => {
  const ref = useRef(null);
  const reducedMotion = useReducedMotion();
  const [isTouch] = useState(
    () => typeof window !== 'undefined' && !window.matchMedia('(pointer: fine)').matches
  );

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, SPRING.magnetic);
  const springY = useSpring(y, SPRING.magnetic);

  const handlePointerMove = useCallback(
    (e) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      x.set((e.clientX - (rect.left + rect.width / 2)) * strength);
      y.set((e.clientY - (rect.top + rect.height / 2)) * strength);
    },
    [strength, x, y]
  );

  const handlePointerLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  const disabled = reducedMotion || isTouch;

  if (disabled) {
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x: springX, y: springY, display: 'inline-block' }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      {...rest}
    >
      {children}
    </motion.div>
  );
};

MagneticButton.displayName = 'MagneticButton';

export default MagneticButton;
