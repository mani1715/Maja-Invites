import { useEffect, useState } from 'react';

/**
 * useReducedMotion — returns true when the user prefers reduced motion
 * or when the device is a low-powered phone (heuristic: deviceMemory <= 4
 * or hardwareConcurrency <= 4). Components should fall back to fades or
 * skip animations entirely in this case.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mq.matches) return true;
      const lowMem = navigator.deviceMemory && navigator.deviceMemory <= 2;
      const lowCpu = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2;
      return Boolean(lowMem && lowCpu);
    } catch (_) {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mq;
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      const handler = (e) => setReduced(e.matches);
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else mq.addListener(handler);
      return () => {
        if (mq.removeEventListener) mq.removeEventListener('change', handler);
        else mq.removeListener(handler);
      };
    } catch (_) {}
    return undefined;
  }, []);

  return reduced;
}

/**
 * MOTION_DEFAULTS — Use these defaults across motion components to keep
 * Framer Motion lightweight:
 *   - layout={false} unless you really need a layout animation
 *   - only animate `opacity` and `transform`
 *   - longer staggers prevent simultaneous animation storms
 */
export const MOTION_DEFAULTS = {
  layout: false,
  staggerChildren: 0.15,
};
