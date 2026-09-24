import React from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';
import { useReducedMotion } from '../hooks/useMotionDefaults';

/**
 * ScrollProgress — thin gold bar fixed to the very top of the viewport that
 * fills as the page scrolls. Sits above the nav (z-50) so it stays visible
 * while scrolling past it. Renders nothing under reduced motion.
 */
const ScrollProgress = () => {
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });

  if (reducedMotion) return null;

  return (
    <motion.div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        transformOrigin: '0 50%',
        background: 'linear-gradient(90deg, var(--lux-gold), var(--lux-gold-bright))',
        scaleX,
        zIndex: 60,
        pointerEvents: 'none',
      }}
    />
  );
};

ScrollProgress.displayName = 'ScrollProgress';

export default ScrollProgress;
