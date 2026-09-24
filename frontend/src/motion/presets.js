/**
 * Shared motion language for the app: easings, durations, springs, and
 * reusable framer-motion variant factories. Keep this the single source of
 * truth for "how things move" — components should import from here rather
 * than inlining bezier curves or durations.
 *
 * Easings mirror frontend/src/styles/luxury.css (--ease-cinema, --ease-velvet,
 * --ease-out-soft) so CSS transitions and framer-motion transitions agree.
 */

export const EASE = {
  cinema: [0.22, 1, 0.36, 1],
  velvet: [0.6, 0.05, 0.2, 1],
  outSoft: [0.16, 1, 0.3, 1],
};

export const DUR = {
  fast: 0.35,
  base: 0.7,
  slow: 1.1,
  cinematic: 1.6,
};

export const SPRING = {
  press: { type: 'spring', stiffness: 500, damping: 30 },
  gentle: { type: 'spring', stiffness: 120, damping: 20 },
  magnetic: { type: 'spring', stiffness: 180, damping: 16, mass: 0.6 },
};

export const VIEWPORT = {
  once: { once: true, margin: '-80px' },
  always: { once: false, margin: '-60px' },
};

export const hoverLift = {
  whileHover: { y: -4, transition: { duration: 0.25, ease: EASE.outSoft } },
  whileTap: { scale: 0.97 },
};

/** Fade + rise. `visible` is a per-index callback for staggered lists. */
export function fadeUp(dist = 18, delayStep = 0.08) {
  return {
    hidden: { opacity: 0, y: dist },
    visible: (i = 0) => ({
      opacity: 1,
      y: 0,
      transition: { duration: DUR.base, ease: EASE.cinema, delay: i * delayStep },
    }),
  };
}

export function fadeIn(delayStep = 0.08) {
  return {
    hidden: { opacity: 0 },
    visible: (i = 0) => ({
      opacity: 1,
      transition: { duration: DUR.base, ease: EASE.cinema, delay: i * delayStep },
    }),
  };
}

export function scaleIn(from = 0.94, delayStep = 0.08) {
  return {
    hidden: { opacity: 0, scale: from },
    visible: (i = 0) => ({
      opacity: 1,
      scale: 1,
      transition: { duration: DUR.base, ease: EASE.cinema, delay: i * delayStep },
    }),
  };
}

/** Clip-path wipe reveal, bottom-up — for image/text masks. */
export function maskReveal(delayStep = 0.08) {
  return {
    hidden: { clipPath: 'inset(0 0 100% 0)' },
    visible: (i = 0) => ({
      clipPath: 'inset(0 0 0% 0)',
      transition: { duration: DUR.slow, ease: EASE.cinema, delay: i * delayStep },
    }),
  };
}

/** Parent variants for staggered children (pair with a child fade* variant). */
export function staggerParent(stagger = 0.08, delayChildren = 0) {
  return {
    hidden: {},
    visible: { transition: { staggerChildren: stagger, delayChildren } },
  };
}

/**
 * Pure helpers that split text for reveal animations. They return plain data
 * (no JSX) so any component can map over the result.
 */
export function wordStagger(text = '') {
  return String(text)
    .split(' ')
    .map((word, i) => ({ key: i, text: word }));
}

export function charStagger(text = '') {
  return String(text)
    .split('')
    .map((char, i) => ({ key: i, char }));
}
