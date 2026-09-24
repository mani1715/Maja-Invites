/**
 * Reveal.jsx — Reusable scroll-driven animation primitives.
 *
 * Every component honours:
 *   • `useInView` with `once: true` (so the story is told ONCE, beautifully)
 *   • Per-theme config from `themeMotion.js`
 *   • `prefers-reduced-motion` short-circuit
 *
 * Components exported:
 *   <Reveal kind="cardLift|photoSlideIn|fade" themeId="..." />
 *   <RevealWords text="..." themeId="..." />
 *   <RevealLetters text="..." themeId="..." />
 *   <Parallax themeId="..." />            — scroll-linked Y translate
 *   <ScrollProgressRing themeId="..." />  — bottom-right ring + back-to-top
 */
import React, { useRef, useEffect, useState } from 'react';
import {
  motion, useInView, useScroll, useTransform, useReducedMotion,
} from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { getMotionConfig } from './themeMotion';

/* ─── Helpers ───────────────────────────────────────────────────────── */

const VIEWPORT_MARGIN = '0px 0px -12% 0px';

const useShouldAnimate = () => {
  const reduce = useReducedMotion();
  // Disable scroll-tied transforms on touch / narrow viewports — scrollY
  // listeners + matrix recalcs are the dominant cause of mid-page jank
  // on mid-range Android phones, which is the majority of guest traffic.
  const isMobile = typeof window !== 'undefined' && (
    window.matchMedia?.('(max-width: 768px)').matches ||
    window.matchMedia?.('(hover: none)').matches ||
    (navigator.maxTouchPoints || 0) > 1
  );
  return !reduce && !isMobile;
};

/* ─── 1. RevealWords — word-by-word clip-path rise ─────────────────── */
/**
 * Splits `text` into words; each word rises from behind an invisible floor.
 * Use on: section H2 headings, story paragraphs (max ~30 words).
 */
export const RevealWords = ({ text, themeId, className = '', as: As = 'div', style = {} }) => {
  const config = getMotionConfig(themeId);
  const ref = useRef(null);
  const animate = useShouldAnimate();
  const inView = useInView(ref, { once: true, margin: VIEWPORT_MARGIN });
  const words = String(text || '').split(' ');

  if (!animate) {
    return <As ref={ref} className={className} style={style}>{text}</As>;
  }

  const container = { hidden: {}, visible: { transition: { staggerChildren: config.stagger } } };
  const word = {
    hidden:  { y: config.wordRevealY, opacity: 0, rotateX: -15 },
    visible: { y: '0%', opacity: 1, rotateX: 0,
      transition: { duration: config.duration.normal, ease: config.easing } },
  };

  return (
    <motion.div
      ref={ref}
      variants={container}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      className={`inline-flex flex-wrap gap-x-[0.28em] ${className}`}
      style={{ perspective: config.perspective, ...style }}
    >
      {words.map((w, i) => (
        <span key={i} style={{ overflow: 'hidden', display: 'inline-block', lineHeight: '1em' }}>
          <motion.span variants={word} style={{ display: 'inline-block' }}>
            {w}
          </motion.span>
        </span>
      ))}
    </motion.div>
  );
};

/* ─── 2. RevealLetters — letter cascade (couple names only) ────────── */
/**
 * Drops each letter from above with a slight rotateZ + blur.
 * Use ONLY on couple names / monograms — never on long text.
 */
export const RevealLetters = ({
  text, themeId, className = '', style = {}, perLetter = 0.04,
}) => {
  const config = getMotionConfig(themeId);
  const ref = useRef(null);
  const animate = useShouldAnimate();
  const inView = useInView(ref, { once: true, margin: VIEWPORT_MARGIN });
  const letters = Array.from(String(text || ''));

  if (!animate) {
    return <span ref={ref} className={className} style={style}>{text}</span>;
  }

  const letterVariant = {
    hidden:  { y: -60, rotateZ: -8, opacity: 0, filter: 'blur(4px)' },
    visible: (i) => ({
      y: 0, rotateZ: 0, opacity: 1, filter: 'blur(0px)',
      transition: {
        delay: i * perLetter,
        duration: config.duration.normal * 0.7,
        type: 'spring', stiffness: 200, damping: 24,
      },
    }),
  };

  return (
    <span ref={ref} className={className} style={{ display: 'inline-block', perspective: config.perspective, ...style }}>
      {letters.map((ch, i) => (
        <motion.span
          key={i}
          custom={i}
          variants={letterVariant}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          style={{ display: 'inline-block', whiteSpace: 'pre' }}
        >
          {ch === ' ' ? '\u00A0' : ch}
        </motion.span>
      ))}
    </span>
  );
};

/* ─── 3. Reveal — generic wrapper ──────────────────────────────────── */
/**
 * `kind` selects the variant:
 *   cardLift      — y + rotateX(top center)
 *   photoSlideIn  — x + rotateY  (side="left" | "right")
 *   fade          — opacity + slight y
 */
export const Reveal = ({
  children, kind = 'fade', themeId, side = 'left',
  delay = 0, className = '', style = {},
}) => {
  const config = getMotionConfig(themeId);
  const ref = useRef(null);
  const animate = useShouldAnimate();
  const inView = useInView(ref, { once: true, margin: VIEWPORT_MARGIN });

  if (!animate) {
    return <div ref={ref} className={className} style={style}>{children}</div>;
  }

  let variants;
  let extraStyle = {};

  if (kind === 'cardLift') {
    variants = {
      hidden:  { y: 60, rotateX: config.cardDepth, opacity: 0, scale: 0.97 },
      visible: { y: 0, rotateX: 0, opacity: 1, scale: 1,
        transition: { duration: config.duration.normal, ease: config.easing, delay } },
    };
    extraStyle = { perspective: config.perspective, transformOrigin: 'top center', transformStyle: 'preserve-3d' };
  } else if (kind === 'photoSlideIn') {
    const dir = side === 'right' ? 1 : -1;
    variants = {
      hidden:  { x: 80 * dir, rotateY: -20 * dir, opacity: 0, scale: 0.96, boxShadow: '0 0px 0px rgba(0,0,0,0)' },
      visible: { x: 0, rotateY: 0, opacity: 1, scale: 1, boxShadow: '0 30px 70px rgba(0,0,0,0.45)',
        transition: { duration: config.duration.slow, ease: config.easing, delay } },
    };
    extraStyle = { perspective: '1000px', transformStyle: 'preserve-3d' };
  } else {
    variants = {
      hidden:  { y: 24, opacity: 0 },
      visible: { y: 0, opacity: 1,
        transition: { duration: config.duration.normal, ease: config.easing, delay } },
    };
  }

  return (
    <motion.div
      ref={ref}
      variants={variants}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      className={className}
      style={{ ...extraStyle, ...style }}
    >
      {children}
    </motion.div>
  );
};

/* ─── 4. Parallax — scroll-linked Y translate ─────────────────────── */
/**
 * `strength`: 0–1 (default 0.18) — fraction of section height to translate.
 * Wrap full-bleed images / decorative panels with this for depth.
 *
 * Outer component decides whether to mount the scroll-listening inner
 * component. On mobile / reduced-motion, useScroll is NEVER called →
 * no window scroll listener is subscribed (critical for mobile perf).
 */
export const Parallax = ({ children, strength = 0.18, className = '', style = {} }) => {
  const animate = useShouldAnimate();
  if (!animate) {
    return <div className={className} style={style}>{children}</div>;
  }
  return (
    <ParallaxInner strength={strength} className={className} style={style}>
      {children}
    </ParallaxInner>
  );
};

const ParallaxInner = ({ children, strength, className, style }) => {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [`${strength * 100}%`, `${-strength * 100}%`]);
  return (
    <div ref={ref} className={className} style={{ overflow: 'hidden', ...style }}>
      <motion.div style={{ y, willChange: 'transform' }}>
        {children}
      </motion.div>
    </div>
  );
};

/* ─── 5. StickyHero — scale/opacity on scroll ─────────────────────── */
/**
 * Wrap the hero contents. As the user scrolls down, the hero content gently
 * scales down + fades + lifts — feels cinematic.
 *
 * Outer/inner split — useScroll is not mounted on mobile / reduced-motion.
 */
export const StickyHero = ({ children, className = '', style = {} }) => {
  const animate = useShouldAnimate();
  if (!animate) {
    return <div className={className} style={style}>{children}</div>;
  }
  return (
    <StickyHeroInner className={className} style={style}>
      {children}
    </StickyHeroInner>
  );
};

const StickyHeroInner = ({ children, className, style }) => {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const scale   = useTransform(scrollYProgress, [0, 1],   [1, 0.86]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const y       = useTransform(scrollYProgress, [0, 1],   ['0%', '-12%']);
  return (
    <div ref={ref} className={className} style={style}>
      <motion.div style={{ scale, opacity, y, willChange: 'transform, opacity' }}>
        {children}
      </motion.div>
    </div>
  );
};

/* ─── 6. ScrollProgressRing — bottom-right engagement ring ────────── */
/**
 * Renders a small ring in the bottom-right showing scroll progress.
 * When complete (>= 95%) the ring becomes a "back to top" button.
 *
 * CRITICAL: Outer component checks animate flag BEFORE mounting the
 * inner. On mobile, `useScroll()` is never called → no global window
 * scroll subscription. This was the primary mobile scroll-jank cause.
 */
export const ScrollProgressRing = ({ themeId }) => {
  const animate = useShouldAnimate();
  if (!animate) return null;
  return <ScrollProgressRingInner themeId={themeId} />;
};

const ScrollProgressRingInner = ({ themeId }) => {
  const config = getMotionConfig(themeId);
  const { scrollYProgress } = useScroll();
  const [complete, setComplete] = useState(false);
  const [visible, setVisible] = useState(false);

  const RADIUS = 18;
  const CIRC = 2 * Math.PI * RADIUS;
  const offset = useTransform(scrollYProgress, [0, 1], [CIRC, 0]);

  useEffect(() => {
    const unsub = scrollYProgress.on('change', (v) => {
      setComplete(v >= 0.95);
      setVisible(v >= 0.05);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className="fixed bottom-6 right-6 z-30 w-12 h-12 rounded-full grid place-items-center"
      style={{
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        border: `1px solid ${config.accent}40`,
        color: config.accent,
      }}
      data-testid="scroll-progress-ring"
    >
      <svg width="44" height="44" viewBox="0 0 44 44" className="absolute inset-0 m-auto -rotate-90">
        <circle cx="22" cy="22" r={RADIUS} fill="none"
          stroke={`${config.accent}25`} strokeWidth="2" />
        <motion.circle cx="22" cy="22" r={RADIUS} fill="none"
          stroke={config.accent} strokeWidth="2"
          strokeDasharray={CIRC}
          style={{ strokeDashoffset: offset, strokeLinecap: 'round' }}
        />
      </svg>
      <ArrowUp className="w-4 h-4 relative z-10"
        style={{ opacity: complete ? 1 : 0.55, transition: 'opacity 0.2s' }} />
    </button>
  );
};

/* ─── 7. GoldShimmer — text shimmer on enter (CSS-only) ───────────── */
/**
 * Wraps text/element; on enter, runs the gold sweep keyframe once.
 * Pure CSS — no JS animation cost per element.
 */
export const GoldShimmer = ({ children, themeId, className = '', style = {} }) => {
  const config = getMotionConfig(themeId);
  const ref = useRef(null);
  const animate = useShouldAnimate();
  const inView = useInView(ref, { once: true, margin: VIEWPORT_MARGIN });

  return (
    <span
      ref={ref}
      className={className}
      style={{
        ...(animate && inView ? {
          background: `linear-gradient(105deg, ${config.accent} 0%, #FFFFFF 30%, ${config.accent} 50%, #FFFFFF 70%, ${config.accent} 100%)`,
          backgroundSize: '200% auto',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          animation: 'gold-shimmer-sweep 2.5s ease-in-out 1 forwards',
        } : {}),
        ...style,
      }}
    >
      {children}
    </span>
  );
};

/* Inject the shared shimmer keyframe once. */
if (typeof document !== 'undefined' && !document.getElementById('reveal-gold-shimmer-kf')) {
  const s = document.createElement('style');
  s.id = 'reveal-gold-shimmer-kf';
  s.textContent = `
    @keyframes gold-shimmer-sweep {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }
  `;
  document.head.appendChild(s);
}
