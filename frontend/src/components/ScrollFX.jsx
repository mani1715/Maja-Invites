import React from 'react';
import { motion, useScroll, useSpring, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

/**
 * ScrollFX — lightweight, GPU-friendly scroll animations.
 *
 * Everything here is transform/opacity only (no layout-thrashing) and the
 * reveal uses whileInView (fires once on enter — NO per-frame scroll handler),
 * so it stays smooth. Only ScrollProgressBar reads scroll, and it drives a
 * single cheap scaleX transform. All effects collapse to a plain fade when the
 * user prefers reduced motion.
 */

// Thin gold bar at the very top that fills as you scroll the page.
export const ScrollProgressBar = () => {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  if (reduce) return null;
  return (
    <motion.div
      aria-hidden
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 200,
        transformOrigin: '0% 50%', scaleX, willChange: 'transform',
        background: 'linear-gradient(90deg, #8C6A1A, #D4AF37, #E8C766)',
        boxShadow: '0 0 12px rgba(212,175,55,0.5)',
      }}
      data-testid="scroll-progress-bar"
    />
  );
};

// 3D scroll-reveal wrapper. Children rise + un-tilt + fade in as they enter.
export const ScrollReveal = ({ children, delay = 0, y = 60, tilt = 12, className = '', as = 'div' }) => {
  const reduce = useReducedMotion();
  const MotionTag = motion[as] || motion.div;
  if (reduce) {
    return (
      <MotionTag
        className={className}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.5, delay }}
      >
        {children}
      </MotionTag>
    );
  }
  return (
    <div style={{ perspective: 1100 }} className={className}>
      <MotionTag
        initial={{ opacity: 0, y, rotateX: tilt, scale: 0.96, filter: 'blur(6px)' }}
        whileInView={{ opacity: 1, y: 0, rotateX: 0, scale: 1, filter: 'blur(0px)' }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.85, delay, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformStyle: 'preserve-3d', willChange: 'transform, opacity' }}
      >
        {children}
      </MotionTag>
    </div>
  );
};

// Animated "scroll down" cue for the hero.
export const ScrollCue = ({ targetHref = '#themes', label = 'Scroll' }) => {
  const reduce = useReducedMotion();
  return (
    <a
      href={targetHref}
      className="inline-flex flex-col items-center gap-2 no-underline"
      style={{ color: 'rgba(255,248,220,0.8)' }}
      data-testid="scroll-cue"
      aria-label="Scroll down"
    >
      <span className="text-[10px] tracking-[0.4em] uppercase">{label}</span>
      <motion.span
        animate={reduce ? {} : { y: [0, 9, 0], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        className="grid place-items-center w-9 h-9 rounded-full"
        style={{ border: '1px solid rgba(212,175,55,0.45)' }}
      >
        <ChevronDown className="w-4 h-4 text-gold" />
      </motion.span>
    </a>
  );
};

export default ScrollReveal;
