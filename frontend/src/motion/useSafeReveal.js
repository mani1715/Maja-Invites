/**
 * useSafeReveal — a scroll reveal that can never leave content permanently invisible.
 * ==================================================================================
 *
 * Why this exists
 *   Our reveal sections render at `opacity: 0` and rely on framer-motion's
 *   `whileInView` (an IntersectionObserver) to fade them in. That is one callback
 *   away from a blank page: if the observer never fires — a backgrounded/prerendered
 *   tab, a restored bfcache page, an observer that missed a fast scroll, an odd
 *   mobile browser — the section stays invisible forever and the user just sees an
 *   empty gap. There is no recovery and no error to notice.
 *
 *   This hook keeps the same animation but adds two independent ways to become
 *   visible, so any ONE of them failing is harmless:
 *     1. IntersectionObserver (the fast, normal path)
 *     2. a plain rect check on scroll/resize + a short initial timer (the net)
 *
 * Usage
 *   const [ref, shown] = useSafeReveal();
 *   <motion.div ref={ref} variants={stagger} initial="hidden"
 *               animate={shown ? 'visible' : 'hidden'}>
 *
 *   (Use `animate`, not `whileInView` — this hook owns the in-view decision.)
 */
import { useEffect, useRef, useState } from 'react';

export default function useSafeReveal({ amount = 0.1, safetyMs = 1200 } = {}) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return undefined;
    const el = ref.current;
    if (!el) {
      // No node to observe (shouldn't happen) — never hide content over it.
      setShown(true);
      return undefined;
    }

    let io = null;
    let timer = null;
    let raf = 0;
    let done = false;

    const reveal = () => {
      if (done) return;
      done = true;
      setShown(true);
    };

    // Fallback path: is the element within (or above) the viewport right now?
    const checkRect = () => {
      raf = 0;
      const node = ref.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      if (r.bottom > 0 && r.top < vh) reveal();
    };
    const onScroll = () => { if (!raf) raf = window.requestAnimationFrame(checkRect); };

    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) reveal();
      }, { threshold: Math.max(0, Math.min(1, amount)) });
      io.observe(el);
    } else {
      reveal();                       // ancient browser — show it, don't gamble
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    // One delayed check catches the case where the observer never fired for an
    // element that is already on screen (background tab, bfcache restore, …).
    timer = window.setTimeout(checkRect, safetyMs);

    return () => {
      if (io) io.disconnect();
      if (timer) window.clearTimeout(timer);
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [shown, amount, safetyMs]);

  return [ref, shown];
}
