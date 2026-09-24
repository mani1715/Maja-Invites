import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * ScrollSection — scroll-triggered reveal wrapper used across the PUBLISHED
 * invitation (wedding + non-wedding). This is the single source of truth for
 * the published link's scroll animation — edit here to change it everywhere.
 *
 * Perf/UX (2026-06): removed the animated `filter: blur()` (animating blur is
 * expensive and was the main cause of scroll jank on mobile), reduced the
 * travel distance + duration for a subtler reveal, and added prefers-reduced-
 * motion support (collapses to a plain fast fade).
 */
const ScrollSection = ({
  children,
  delay = 0,
  amount = 0.15,
  className = '',
  as = 'section',
  testid,
}) => {
  const MotionTag = motion[as] || motion.section;
  const reduce = useReducedMotion();

  return (
    <MotionTag
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount, margin: '0px 0px -10% 0px' }}
      transition={{ duration: reduce ? 0.3 : 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
      data-testid={testid}
    >
      {children}
    </MotionTag>
  );
};

export default ScrollSection;
