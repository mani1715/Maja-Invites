import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { EASE } from './presets';
import { useReducedMotion } from '../hooks/useMotionDefaults';

/**
 * RouteTransition — cinematic enter-only page transition.
 *
 * Deliberately ENTER-ONLY (no AnimatePresence mode="wait"): exit-waiting
 * doubles perceived nav latency on mid-range phones and fights lazy-loaded
 * route chunks. Keying by pathname (not full location) means hash and
 * search-param changes never retrigger the animation.
 *
 * Scroll-to-top on route change is already handled by <ScrollToTop /> in
 * App.js — this component does not duplicate that behavior.
 */
export default function RouteTransition({ children }) {
  const { pathname } = useLocation();
  const reduced = useReducedMotion();

  if (reduced) return children;

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE.cinema }}
      style={{ minHeight: '100%' }}
    >
      {children}
    </motion.div>
  );
}
